/**
 * 엔진 입력 조립(순수): 준비된 GLB → `AuthoredPackagePlan`(역할·본 매핑), `--morph` 확장, 리그 점검 → `ApplyPlan`.
 *
 * 엔진 `loadSource({ kind: "package", plan })`는 GLB 바이트를 `fetchBytes`로 받고 플랜의 `meshRoles`·`boneMap`·`shapeKeyMap`으로
 * 파츠를 만든다. 뷰어는 파츠 번호(`partId`)를 **리그 점검 결과에서 읽어** 플랜을 만든다(패키지 로더의 partId는 메시 이름순 순번이라
 * 역할 고정 레이아웃과 다르다 — 계약 §2 C3).
 */
import { ALL_AVAILABLE_CAPABILITIES, CHARACTER_PACKAGE_KIND, CHARACTER_PACKAGE_SCHEMA_VERSION } from "../../contracts";

import type { ApplyPlan, ApplyPlanPart, AuthoredPackagePlan, CharacterPackageManifest, Pose, RecipeColors } from "../../contracts";
import type { RigInspection } from "../rig-inspection";
import type { KitPreviewMorphAssignment } from "./cli-args";
import type { PrepareResult, PreparedMesh } from "./prepare";

/** 엔진이 manifest 내용을 읽지는 않지만 계약 타입이 요구하는 최소 manifest */
function previewManifest(displayName: string): CharacterPackageManifest {
  return {
    schemaVersion: CHARACTER_PACKAGE_SCHEMA_VERSION,
    kind: CHARACTER_PACKAGE_KIND,
    characterId: "kit-preview",
    displayName,
    configDigest: "kit-preview",
    pipelineVersion: 1,
    capabilities: {
      authoredHair: { enabled: false, style: null, lodTriangles: [], replacedSourceMeshes: [] },
      semanticFaceShapes: { mode: "none", confidence: 0, objects: [], shapeKeys: [] },
      mtoonReady: false,
      vrmCustomExpressions: { status: "none", names: [] },
      lods: false,
    },
    quality: { score: 0, passed: false, minimumScore: 0, report: "kit-preview(개발 전용 뷰어)" },
    files: {},
    provenance: {},
  };
}

export const PREVIEW_GLB_URL = "kit-preview://merged.glb";

/**
 * 병합(package) 경로의 패키지 플랜. `glbSha256`은 엔진에 넘길 GLB 바이트의 SHA-256이다 — 원본을 그대로 쓰면(`passthrough`) CLI가 디스크에서 계산한 값,
 * 병합 결과면 브라우저에서 계산한 값을 넣어 엔진의 SHA 검증을 끄지 않고 통과시킨다.
 */
export function buildPackagePlan(prepared: PrepareResult, hairLod: number, displayName: string, glbSha256: string): AuthoredPackagePlan {
  return {
    manifest: previewManifest(displayName),
    baseUrl: "kit-preview://",
    glbUrl: PREVIEW_GLB_URL,
    glbSha256,
    glbBytes: prepared.bytes.byteLength,
    // morph 이름은 GLB 원본 그대로 쓴다(키트는 계약 이름, 레거시는 원본 이름 — `--morph`로 둘 다 구동할 수 있다).
    shapeKeyMap: {},
    boneMap: prepared.boneMap,
    meshRoles: prepared.meshRoles,
    hairLodPolicy: { preferredLod: hairLod },
    capabilities: ALL_AVAILABLE_CAPABILITIES,
    licenseNote: "kit-preview(개발 전용 뷰어, 앱 에셋 아님)",
  };
}

// ---------------------------------------------------------------- morph

export interface MorphExpansion {
  /** 엔진에 줄 morph 이름 → 가중치 [0,1] */
  readonly weights: Readonly<Record<string, number>>;
  /** 부호 약식(`param:height=−0.5`)을 `:+`/`:−`로 나눈 항목 */
  readonly expanded: readonly string[];
  /** 로드된 GLB에 없는 이름과 비슷한 이름 후보(최대 4개) */
  readonly unknown: ReadonlyArray<{ readonly name: string; readonly candidates: readonly string[] }>;
}

function candidatesFor(name: string, available: readonly string[]): string[] {
  const lower = name.toLowerCase();
  const token = lower.split(":").filter((part) => part.length > 2 && part !== "param" && part !== "facs").pop() ?? lower;
  return available.filter((candidate) => candidate.toLowerCase().includes(token)).slice(0, 4);
}

/** `--morph` 목록을 엔진 가중치로 바꾼다. 알 수 없는 이름은 버리지 않고 `unknown`으로 돌려준다(호출자가 경고한다). */
export function expandMorphAssignments(assignments: readonly KitPreviewMorphAssignment[], available: readonly string[]): MorphExpansion {
  const names = new Set(available);
  const weights: Record<string, number> = {};
  const expanded: string[] = [];
  const unknown: Array<{ name: string; candidates: string[] }> = [];
  for (const { name, value } of assignments) {
    if (names.has(name)) {
      weights[name] = Math.min(1, Math.max(0, value));
      continue;
    }
    // 부호 약식: param:<키> → param:<키>:+ / param:<키>:-
    const plus = `${name}:+`;
    const minus = `${name}:-`;
    if (/^param:[A-Za-z]+$/u.test(name) && (names.has(plus) || names.has(minus))) {
      const target = value >= 0 ? plus : minus;
      const opposite = value >= 0 ? minus : plus;
      if (names.has(target)) weights[target] = Math.min(1, Math.abs(value));
      else unknown.push({ name: target, candidates: candidatesFor(name, available) });
      if (names.has(opposite)) weights[opposite] = 0;
      expanded.push(`${name}=${value} → ${target}=${Math.min(1, Math.abs(value))}`);
      continue;
    }
    unknown.push({ name, candidates: candidatesFor(name, available) });
  }
  return { weights, expanded, unknown };
}

// ---------------------------------------------------------------- 적용 플랜

export interface ApplyPlanInput {
  readonly parts: RigInspection["parts"];
  readonly meshes: readonly PreparedMesh[];
  readonly colors: RecipeColors;
  readonly morphWeights: Readonly<Record<string, number>>;
  readonly pose: Pose;
}

/** 키트 소스용 적용 플랜 입력: 색은 엔진이 파츠 틴트(`RigPart.tint`)와 `colors`로 정하므로 파츠별 색·메시 결정이 없다. */
export type KitApplyPlanInput = Omit<ApplyPlanInput, "meshes">;

/**
 * 키트 소스(`loadSource({ kind: "kit" })`)의 적용 플랜. 키트 파츠는 틴트 규칙(recolor/fixed)을 엔진이 들고 있으므로 파츠 `color`를 주지 않는다 —
 * recolor 파츠는 `colors`의 역할별 색을, fixed 파츠는 재질 선언의 고정색을 엔진이 쓴다.
 */
export function buildKitApplyPlan(input: KitApplyPlanInput): ApplyPlan {
  return buildApplyPlan({ ...input, meshes: [] });
}

/** 리그 점검의 파츠마다 플랜 파츠를 만든다: 키트 이름 파츠는 틴트 결정의 색을 `color`로 준다. */
export function buildApplyPlan(input: ApplyPlanInput): ApplyPlan {
  const byNode = new Map(input.meshes.map((mesh) => [mesh.node, mesh] as const));
  const parts: ApplyPlanPart[] = input.parts.map((part) => {
    const decision = byNode.get(part.id);
    return {
      partId: part.partId,
      visible: true,
      materialPreset: part.materialPreset,
      ...(decision?.planColorHex ? { color: decision.planColorHex } : {}),
    };
  });
  return {
    revision: 1,
    morphWeights: input.morphWeights,
    boneRotations: input.pose,
    parts,
    colors: input.colors,
    physics: { provider: "builtin-pbd", settleSteps: 0 },
    unsupported: [],
  };
}
