/**
 * GLB 준비 파이프라인(순수): 입력 GLB 바이트들 → 엔진에 넘길 GLB 하나 + 역할·본 매핑 + 경고.
 *
 *   파싱 → 정적 검사(glb-inspect) → 병합·분할(glb-merge) → 메시 역할 해석(kit-roles) → 틴트 굽기(tint) → GLB 쓰기 → 키트 점검(kit-checks)
 *
 * 병합·분할·굽기가 아무것도 바꾸지 않으면(레거시 단일 GLB 등) **원본 베이스 바이트를 그대로** 돌려줘(`passthrough`)
 * 앱이 지금 그리는 모양을 그대로 보게 한다. 실패(`glb-invalid`, `kit-joint-mismatch` 등)는 LabFailure로 throw한다.
 */
import { inspectGlb } from "./glb-inspect";
import { asNumber, arrayField, ensureArrayField, isJsonObject, objectAt, parseGlb, writeGlb } from "./glb-io";
import { mergeGlbs } from "./glb-merge";
import { runKitChecks } from "./kit-checks";
import { KIT_PRIMITIVE_SPLITS, buildBoneMap, compareSkeletonToKit, resolveMeshRole } from "./kit-roles";
import { decideTint, isNearWhite } from "./tint";
import { makeWarning, sortWarnings } from "./warnings";

import type { GlbSummary } from "./glb-inspect";
import type { JsonObject } from "./glb-io";
import type { MergeReport } from "./glb-merge";
import type { KitSkeletonComparison, ResolvedRole, RoleSource, TintMode } from "./kit-roles";
import type { Linear3 } from "./tint";
import type { PreviewWarning } from "./warnings";
import type { HumanoidBoneName, PartRole, RecipeColorKey, RecipeColors } from "../../contracts";

export interface PrepareFile {
  readonly label: string;
  readonly bytes: Uint8Array;
}

export interface PrepareOptions {
  /** 틴트에 쓸 전체 레시피 색(기본 팔레트 + `--color`) */
  readonly colors: RecipeColors;
  /** 메시 이름 → 역할 강제 */
  readonly roleOverrides: Readonly<Record<string, string>>;
}

/** 병합된 GLB의 메시 노드 하나(= 엔진의 파츠 하나) */
export interface PreparedMesh {
  /** 병합 뒤 노드 이름(엔진 파츠 id) */
  readonly node: string;
  readonly role: PartRole;
  readonly roleSource: RoleSource;
  readonly tintMode: TintMode;
  readonly colorKey: RecipeColorKey | null;
  /** 플랜 파츠 색(없으면 엔진 기본 해석) */
  readonly planColorHex: string | null;
  readonly material: string | null;
  /** 어느 입력 GLB에서 왔는지 */
  readonly origin: string;
}

export interface PreparedSkeleton {
  readonly joints: readonly string[];
  readonly mappedBones: number;
  readonly unmapped: readonly string[];
  readonly kit: KitSkeletonComparison;
}

export interface PrepareResult {
  /** 엔진에 넘길 GLB */
  readonly bytes: Uint8Array;
  /** 원본 베이스 바이트를 그대로 쓰는지 */
  readonly passthrough: boolean;
  /** 입력별 정적 요약(경고는 `warnings`에 모았다) */
  readonly inputs: readonly GlbSummary[];
  readonly merged: GlbSummary;
  readonly merge: MergeReport;
  readonly meshes: readonly PreparedMesh[];
  readonly meshRoles: Readonly<Record<string, PartRole>>;
  readonly boneMap: Readonly<Record<string, HumanoidBoneName>>;
  readonly skeleton: PreparedSkeleton | null;
  readonly warnings: readonly PreviewWarning[];
}

interface BakeEntry {
  readonly linear: Linear3;
  readonly node: string;
}

/** 노드의 메시가 쓰는 재질 인덱스(프리미티브 순서, 없으면 null) */
function primitiveMaterials(json: JsonObject, nodeIndex: number): Array<number | null> {
  const node = objectAt(arrayField(json, "nodes"), nodeIndex);
  const mesh = node ? objectAt(arrayField(json, "meshes"), asNumber(node.mesh) ?? -1) : null;
  if (!mesh) return [];
  return arrayField(mesh, "primitives").map((primitive) => (isJsonObject(primitive) ? asNumber(primitive.material) : null));
}

function materialFactor(json: JsonObject, materialIndex: number): number[] | null {
  const material = objectAt(arrayField(json, "materials"), materialIndex);
  const pbr = material && isJsonObject(material.pbrMetallicRoughness) ? material.pbrMetallicRoughness : null;
  const factor = pbr?.baseColorFactor;
  return Array.isArray(factor) && factor.length === 4 && factor.every((value) => typeof value === "number") ? (factor as number[]) : null;
}

function bakeFactor(json: JsonObject, materialIndex: number, linear: Linear3): void {
  const materials = ensureArrayField(json, "materials");
  const material = objectAt(materials, materialIndex);
  if (!material) return;
  const pbr = isJsonObject(material.pbrMetallicRoughness) ? material.pbrMetallicRoughness : {};
  material.pbrMetallicRoughness = pbr;
  const previous = Array.isArray(pbr.baseColorFactor) && typeof pbr.baseColorFactor[3] === "number" ? pbr.baseColorFactor[3] : 1;
  pbr.baseColorFactor = [linear[0], linear[1], linear[2], previous];
}

export function prepareKitGlbs(files: readonly PrepareFile[], options: PrepareOptions): PrepareResult {
  const warnings: PreviewWarning[] = [];

  // 1) 파싱·정적 검사
  const inputs = files.map((file) => {
    const doc = parseGlb(file.bytes, file.label);
    const summary = inspectGlb(doc, file.label, file.bytes.byteLength);
    warnings.push(...summary.warnings);
    return { label: file.label, doc, summary };
  });

  // 2) 병합·분할
  const outcome = mergeGlbs(inputs, KIT_PRIMITIVE_SPLITS);
  warnings.push(...outcome.report.warnings);
  const mergedJson = outcome.doc.json;
  const mergedBefore = inspectGlb(outcome.doc, "병합 결과", outcome.doc.bin.byteLength);

  // 노드 이름 → 출처 파일(분할된 노드는 원래 이름에서 거슬러 찾는다)
  const originOf = (node: string): string => {
    const direct = inputs.find((input) => input.summary.meshNodes.some((mesh) => mesh.node === node));
    if (direct) return direct.label;
    const split = outcome.report.splits.find((entry) => entry.into.includes(node));
    const source = split ? inputs.find((input) => input.summary.meshNodes.some((mesh) => mesh.node === split.node)) : undefined;
    return source?.label ?? inputs[0]?.label ?? "?";
  };

  // 3) 역할·틴트
  const roles = new Map<string, ResolvedRole>();
  const meshes: PreparedMesh[] = [];
  const bakes = new Map<number, BakeEntry>();
  for (const mesh of mergedBefore.meshNodes) {
    const resolved = resolveMeshRole(mesh.node, options.roleOverrides);
    roles.set(mesh.node, resolved);
    const materialIndices = primitiveMaterials(mergedJson, mesh.nodeIndex);
    const firstMaterial = materialIndices.find((index): index is number => index !== null) ?? null;
    const authored = firstMaterial === null ? null : materialFactor(mergedJson, firstMaterial);
    const decision = decideTint(resolved.role, resolved.tint, options.colors, authored);
    if (resolved.source === "kit-name" && firstMaterial === null) warnings.push(makeWarning(mesh.node, "kit-no-material", `키트 메시 '${mesh.node}'에 재질이 없어 틴트를 적용할 수 없습니다.`));
    if (resolved.source === "kit-name" && decision.mode === "recolor" && authored && !isNearWhite(authored)) {
      warnings.push(makeWarning(mesh.node, "kit-factor-not-white", `recolor 재질의 baseColorFactor가 [1,1,1,1]이 아닙니다(${authored.map((value) => value.toFixed(3)).join(", ")}). 계약은 흰색을 요구합니다 — 뷰어는 틴트로 덮어씁니다.`));
    }
    if (decision.bakeLinear) {
      for (const materialIndex of materialIndices) {
        if (materialIndex === null) continue;
        const existing = bakes.get(materialIndex);
        if (existing && existing.linear.some((value, index) => Math.abs(value - (decision.bakeLinear?.[index] ?? 0)) > 1e-6)) {
          warnings.push(makeWarning(mesh.node, "kit-material-shared", `재질이 서로 다른 틴트를 쓰는 메시('${existing.node}', '${mesh.node}')가 함께 쓰고 있습니다. 한 (파츠, 역할)에 재질 하나만 쓰세요(앞선 메시의 틴트를 씁니다).`));
          continue;
        }
        bakes.set(materialIndex, { linear: decision.bakeLinear, node: mesh.node });
      }
    }
    const materialName = firstMaterial === null ? null : (mergedBefore.materials.find((material) => material.index === firstMaterial)?.name ?? null);
    meshes.push({ node: mesh.node, role: resolved.role, roleSource: resolved.source, tintMode: decision.mode, colorKey: decision.colorKey, planColorHex: decision.planColorHex, material: materialName, origin: originOf(mesh.node) });
  }
  for (const [materialIndex, entry] of bakes) bakeFactor(mergedJson, materialIndex, entry.linear);

  // 4) 바이트
  const passthrough = !outcome.report.changed && bakes.size === 0;
  const bytes = passthrough ? (files[0]?.bytes ?? new Uint8Array(0)) : writeGlb(outcome.doc);
  const merged = passthrough ? mergedBefore : inspectGlb(parseGlb(bytes, "병합 결과"), "병합 결과", bytes.byteLength);

  // 5) 스켈레톤·본 매핑(베이스 스킨 기준)
  const baseSkinIndex = merged.meshNodes.find((mesh) => mesh.skinIndex !== null)?.skinIndex ?? merged.skins[0]?.index ?? null;
  const baseSkin = baseSkinIndex === null ? null : (merged.skins.find((skin) => skin.index === baseSkinIndex) ?? null);
  const bones = baseSkin ? buildBoneMap(baseSkin.joints) : null;
  const skeleton: PreparedSkeleton | null = baseSkin && bones ? { joints: baseSkin.joints, mappedBones: Object.keys(bones.boneMap).length, unmapped: bones.unmapped, kit: compareSkeletonToKit(baseSkin.joints) } : null;

  // 6) 키트 점검
  warnings.push(...runKitChecks({ files: files.map((file) => ({ label: file.label, bytes: file.bytes.byteLength })), merged, roles, skeletonJoints: baseSkin?.joints ?? null }));

  const meshRoles: Record<string, PartRole> = {};
  for (const mesh of meshes) meshRoles[mesh.node] = mesh.role;
  return {
    bytes,
    passthrough,
    inputs: inputs.map((input) => ({ ...input.summary, warnings: [] })),
    merged: { ...merged, warnings: [] },
    merge: outcome.report,
    meshes,
    meshRoles,
    boneMap: bones?.boneMap ?? {},
    skeleton,
    warnings: sortWarnings(warnings),
  };
}
