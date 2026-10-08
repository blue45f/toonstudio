/**
 * JSON 요약 구성(순수). CLI는 stdout에 이 모양의 JSON만 낸다: 입력 GLB·메시 목록(이름·삼각형·정점·재질·UV/COLOR_0/WEIGHTS 유무)·
 * morph 이름·본 이름·병합 결과·경고·런타임(엔진) 점검. 정적 부분(`buildStaticReport`)은 엔진 없이 만들 수 있어
 * `--inspect-only`와 병합 실패 보고에도 쓴다.
 */
import { isLabFailure } from "../../contracts";

import { inspectGlb } from "./glb-inspect";
import { parseGlb } from "./glb-io";

import type { GlbSummary } from "./glb-inspect";
import type { PreviewSourceKind } from "./kit-plan-adapter";
import type { PrepareFile, PrepareResult } from "./prepare";
import type { PreviewWarning } from "./warnings";
import type { KitPlan } from "../../contracts";

export const KIT_PREVIEW_REPORT_SCHEMA = "toonstudio.kit-preview/1";

export interface InputFileRow {
  readonly label: string;
  readonly bytes: number;
  readonly generator: string | null;
  readonly meshNodes: number;
  readonly triangles: number;
  readonly vertices: number;
  readonly morphTargetNames: number;
  readonly jointCount: number | null;
  readonly images: ReadonlyArray<{ readonly name: string | null; readonly width: number | null; readonly height: number | null; readonly mimeType: string | null; readonly bytes: number | null }>;
  readonly extensionsUsed: readonly string[];
}

export interface MeshRow {
  /** 병합 뒤 노드 이름(= 엔진 파츠 id) */
  readonly name: string;
  /** 입력 GLB 파일 */
  readonly origin: string;
  readonly role: string;
  readonly roleSource: string;
  /** recolor(틴트 곱함) · fixed(고정색) · legacy(앱 기본) */
  readonly tint: string;
  readonly planColor: string | null;
  readonly triangles: number;
  readonly vertices: number;
  readonly primitives: number;
  readonly materials: readonly string[];
  readonly skinned: boolean;
  readonly hasUv: boolean;
  readonly hasNormal: boolean;
  readonly hasTangent: boolean;
  readonly hasColor0: boolean;
  readonly hasColor1: boolean;
  readonly hasWeights: boolean;
  readonly morphTargets: number;
  readonly parent: string | null;
}

/** 키트 경로에서 즉석 생성한 `KitPlan`의 요약(전체 플랜은 싣지 않는다) */
export interface KitPlanSummary {
  readonly kitId: string;
  readonly baseId: string;
  readonly parts: ReadonlyArray<{ readonly id: string; readonly kind: string; readonly slot: string | null; readonly bytes: number; readonly sha256: string; readonly meshes: number }>;
  readonly materials: number;
  readonly morphNames: number;
}

export interface StaticReport {
  readonly schema: typeof KIT_PREVIEW_REPORT_SCHEMA;
  /** 어느 경로로 올렸는지: kit = 엔진 키트 소스(병합 없음), package = 기존 병합 경로 */
  readonly sourceKind: PreviewSourceKind;
  /** kit 경로의 플랜 요약(package 경로는 null) */
  readonly kitPlan: KitPlanSummary | null;
  readonly inputs: readonly InputFileRow[];
  readonly meshes: readonly MeshRow[];
  readonly totals: { readonly meshes: number; readonly triangles: number; readonly vertices: number };
  /** 모든 메시의 morph 이름 합집합 */
  readonly morphTargetNames: readonly string[];
  /** 베이스 skin.joints 순서 그대로의 본(노드) 이름 */
  readonly boneNames: readonly string[];
  readonly skeleton: {
    readonly jointCount: number;
    readonly mappedHumanoidBones: number;
    readonly unmapped: readonly string[];
    readonly matchesKit68: boolean;
    readonly missingKitJoints: readonly string[];
    readonly extraJoints: readonly string[];
  } | null;
  /** kit 경로는 병합하지 않는다(passthrough true, mergedBytes = 베이스 입력 바이트) */
  readonly merge: {
    readonly passthrough: boolean;
    readonly parts: PrepareResult["merge"]["parts"];
    readonly splits: PrepareResult["merge"]["splits"];
    readonly mergedBytes: number;
  };
  readonly warnings: readonly PreviewWarning[];
}

function inputRow(summary: GlbSummary): InputFileRow {
  return {
    label: summary.label,
    bytes: summary.bytes,
    generator: summary.generator,
    meshNodes: summary.totals.meshNodes,
    triangles: summary.totals.triangles,
    vertices: summary.totals.vertices,
    morphTargetNames: summary.totals.morphTargetNames,
    jointCount: summary.skins[0]?.jointCount ?? null,
    images: summary.images.map((image) => ({ name: image.name, width: image.width, height: image.height, mimeType: image.mimeType, bytes: image.bytes })),
    extensionsUsed: summary.extensionsUsed,
  };
}

/** 병합된 GLB의 메시 행(분할 뒤 이름 기준) */
export function buildMeshRows(prepared: PrepareResult): MeshRow[] {
  const decisions = new Map(prepared.meshes.map((mesh) => [mesh.node, mesh] as const));
  return prepared.merged.meshNodes.map((mesh) => {
    const decision = decisions.get(mesh.node);
    const every = (pick: (primitive: (typeof mesh.primitives)[number]) => boolean): boolean => mesh.primitives.length > 0 && mesh.primitives.every(pick);
    return {
      name: mesh.node,
      origin: decision?.origin ?? "?",
      role: decision?.role ?? "?",
      roleSource: decision?.roleSource ?? "?",
      tint: decision?.tintMode ?? "legacy",
      planColor: decision?.planColorHex ?? null,
      triangles: mesh.triangles,
      vertices: mesh.vertices,
      primitives: mesh.primitives.length,
      materials: [...new Set(mesh.primitives.flatMap((primitive) => (primitive.material === null ? [] : [primitive.material])))],
      skinned: mesh.skinned,
      hasUv: every((primitive) => primitive.hasUv),
      hasNormal: every((primitive) => primitive.hasNormal),
      hasTangent: every((primitive) => primitive.hasTangent),
      hasColor0: mesh.primitives.some((primitive) => primitive.hasColor0),
      hasColor1: mesh.primitives.some((primitive) => primitive.hasColor1),
      hasWeights: every((primitive) => primitive.hasJoints && primitive.hasWeights),
      morphTargets: mesh.morphTargetNames.length,
      parent: mesh.parent,
    };
  });
}

export function summarizeKitPlan(plan: KitPlan): KitPlanSummary {
  return {
    kitId: plan.kitId,
    baseId: plan.baseId,
    parts: plan.parts.map((part) => ({ id: part.id, kind: part.kind, slot: part.slot, bytes: part.bytes, sha256: part.sha256, meshes: part.meshes.length })),
    materials: Object.keys(plan.materials).length,
    morphNames: plan.morphNames.length,
  };
}

export function buildStaticReport(prepared: PrepareResult, sourceKind: PreviewSourceKind = "package", plan: KitPlan | null = null): StaticReport {
  const meshes = buildMeshRows(prepared);
  const skeleton = prepared.skeleton;
  return {
    schema: KIT_PREVIEW_REPORT_SCHEMA,
    sourceKind,
    kitPlan: plan ? summarizeKitPlan(plan) : null,
    inputs: prepared.inputs.map(inputRow),
    meshes,
    totals: {
      meshes: meshes.length,
      triangles: meshes.reduce((sum, mesh) => sum + mesh.triangles, 0),
      vertices: meshes.reduce((sum, mesh) => sum + mesh.vertices, 0),
    },
    morphTargetNames: prepared.merged.morphTargetNames,
    boneNames: skeleton?.joints ?? [],
    skeleton: skeleton
      ? { jointCount: skeleton.joints.length, mappedHumanoidBones: skeleton.mappedBones, unmapped: skeleton.unmapped, matchesKit68: skeleton.kit.exact, missingKitJoints: skeleton.kit.missing, extraJoints: skeleton.kit.extra }
      : null,
    merge: { passthrough: prepared.passthrough, parts: prepared.merge.parts, splits: prepared.merge.splits, mergedBytes: prepared.bytes.byteLength },
    warnings: prepared.warnings,
  };
}

/**
 * 병합 전에 입력 GLB를 하나씩 검사해 행과 경고를 돌려준다(병합·로드가 실패했을 때도 무엇을 받았는지 보이게 한다).
 * 파일 하나가 GLB가 아니면 그 파일은 `failures`에 사유를 남기고 건너뛴다.
 */
export function buildInputRows(files: readonly PrepareFile[]): { readonly rows: readonly InputFileRow[]; readonly warnings: readonly PreviewWarning[]; readonly failures: ReadonlyArray<{ readonly label: string; readonly reasonKo: string }> } {
  const rows: InputFileRow[] = [];
  const warnings: PreviewWarning[] = [];
  const failures: Array<{ label: string; reasonKo: string }> = [];
  for (const file of files) {
    try {
      const summary = inspectGlb(parseGlb(file.bytes, file.label), file.label, file.bytes.byteLength);
      rows.push(inputRow(summary));
      warnings.push(...summary.warnings);
    } catch (error) {
      failures.push({ label: file.label, reasonKo: isLabFailure(error) ? error.reasonKo : String(error) });
    }
  }
  return { rows, warnings, failures };
}
