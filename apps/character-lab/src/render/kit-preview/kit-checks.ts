/**
 * 키트 계약 점검(순수). 검사 요약(glb-inspect)과 역할 해석(kit-roles)을 받아 **키트 이름을 가진 메시**에 계약 규칙을 적용하고
 * 경고로 돌려준다. 빌더가 GLB를 내보낸 직후 "앱이 받아들일 모양인가"를 GPU 없이 바로 보게 하는 용도이며, 전체 검증기
 * (`scripts/verify-character-kit.mjs`, 계약 §9)를 대체하지 않는다 — 구조·예산·morph 이름 커버리지처럼 값싼 규칙만 본다.
 * 키트 이름이 아닌 레거시 메시(Orion·reference)에는 키트 규칙을 적용하지 않고 정보 경고 한 줄만 남긴다.
 */
import { BODY_PARAM_KEYS, FACE_PARAM_KEYS, FACS_UNITS, KIT_BUDGET } from "../../contracts";

import { buildBoneMap, compareSkeletonToKit, isKitMeshName, isOutlineShellName, stripMeshSuffix } from "./kit-roles";
import { makeWarning } from "./warnings";

import type { GlbSummary } from "./glb-inspect";
import type { ResolvedRole } from "./kit-roles";
import type { PreviewWarning } from "./warnings";

const MIB = 1024 * 1024;

/** 계약 §3.7 예산(제안값) */
export const KIT_BUDGETS = {
  /** 용량 한도는 계약 상수를 그대로 쓴다(두 곳에 숫자를 두지 않는다) */
  baseBytes: KIT_BUDGET.baseGlbMaxBytes,
  partBytes: KIT_BUDGET.partGlbMaxBytes,
  bodyHeadTriangles: 90_000,
  underwearTriangles: 8_000,
  garmentTriangles: 25_000,
  shoesTriangles: 8_000,
  accessoryTriangles: 6_000,
  hairLod0Triangles: 20_000,
  faceMeshesTriangles: 15_000,
  activeWorstTriangles: 200_000,
  textureMaxPx: 1024,
} as const;

/** 머리에 붙는 체형 morph 4축(± = 8개): 목 이음매가 벌어지지 않게 머리 부착물 전부가 가져야 한다(계약 §4.4) */
const HEAD_BODY_KEYS = ["height", "legLength", "neckLength", "headSize"] as const;
const EYE_FACE_KEYS = ["eyeSize", "eyeSpacing", "eyeTilt", "faceShape"] as const;
const BROW_FACE_KEYS = ["eyeSize", "eyeSpacing", "eyeTilt", "forehead", "faceShape"] as const;
const MOUTH_FACE_KEYS = ["mouthWidth", "jawWidth"] as const;
const BROW_FACS = ["browInnerUp", "browOuterUp", "browDown", "eyeBlinkLeft", "eyeBlinkRight", "eyeWide", "eyeSquint"] as const;
const MOUTH_FACS = ["jawOpen", "mouthSmile", "mouthFrown", "mouthPucker", "mouthFunnel", "mouthPress", "tongueOut", "cheekPuff"] as const;

function signed(keys: readonly string[]): string[] {
  return keys.flatMap((key) => [`param:${key}:+`, `param:${key}:-`]);
}

function facs(units: readonly string[]): string[] {
  return units.map((unit) => `facs:${unit}`);
}

export interface MorphCoverageRule {
  readonly label: string;
  readonly required: readonly string[];
}

/** 키트 메시 노드 이름 → 필수 morph 이름(계약 §4.4 최소 커버리지). 해당 없으면 null. */
export function morphCoverageFor(nodeNameValue: string): MorphCoverageRule | null {
  const name = stripMeshSuffix(nodeNameValue);
  if (name === "TS_Body" || name === "TS_Underwear" || /^TS_(Top|Bottom|Shoes)_/u.test(name)) return { label: "체형 18", required: signed(BODY_PARAM_KEYS) };
  if (name === "TS_Head") return { label: "머리 54(체형 8 + 얼굴 30 + FACS 16)", required: [...signed(HEAD_BODY_KEYS), ...signed(FACE_PARAM_KEYS), ...facs(FACS_UNITS)] };
  if (/^TS_(Eye|Iris|Pupil|Highlight)_[LR]$/u.test(name)) return { label: "머리 체형 8 + 눈 4축", required: [...signed(HEAD_BODY_KEYS), ...signed(EYE_FACE_KEYS)] };
  if (name === "TS_Lashes" || /^TS_Brow_[LR]$/u.test(name)) return { label: "머리 체형 8 + 눈·이마 5축 + 눈 FACS 7", required: [...signed(HEAD_BODY_KEYS), ...signed(BROW_FACE_KEYS), ...facs(BROW_FACS)] };
  if (/^TS_Mouth(_teeth|_tongue)?$/u.test(name)) return { label: "머리 체형 8 + 입 2축 + 입 FACS 8", required: [...signed(HEAD_BODY_KEYS), ...signed(MOUTH_FACE_KEYS), ...facs(MOUTH_FACS)] };
  if (/^TS_AuthoredHair_/u.test(name) || /^TS_Accessory_/u.test(name)) return { label: "머리 체형 8", required: signed(HEAD_BODY_KEYS) };
  return null;
}

export interface KitCheckInput {
  /** 입력 GLB 파일 정보(첫 번째가 베이스) */
  readonly files: ReadonlyArray<{ readonly label: string; readonly bytes: number }>;
  /** 병합·분할 뒤의 요약 */
  readonly merged: GlbSummary;
  /** 병합된 메시 노드 이름 → 해석된 역할 */
  readonly roles: ReadonlyMap<string, ResolvedRole>;
  /** 베이스 스킨의 skin.joints 이름(없으면 null) */
  readonly skeletonJoints: readonly string[] | null;
}

function listFirst(names: readonly string[], limit = 6): string {
  return `${names.slice(0, limit).join(", ")}${names.length > limit ? ` 외 ${names.length - limit}개` : ""}`;
}

export function runKitChecks(input: KitCheckInput): PreviewWarning[] {
  const warnings: PreviewWarning[] = [];
  const warn = (source: string, code: string, message: string, severity: "info" | "warn" | "error" = "warn"): void => {
    warnings.push(makeWarning(source, code, message, severity));
  };
  const { merged } = input;
  const kitNodes = merged.meshNodes.filter((mesh) => isKitMeshName(mesh.node));
  const legacyNodes = merged.meshNodes.filter((mesh) => !isKitMeshName(mesh.node));

  // 스켈레톤
  if (input.skeletonJoints) {
    const comparison = compareSkeletonToKit(input.skeletonJoints);
    const bones = buildBoneMap(input.skeletonJoints);
    const mapped = Object.keys(bones.boneMap).length;
    if (comparison.exact) {
      if (mapped !== 55) warn("skeleton", "kit-bone-map", `키트 관절 68개는 맞지만 휴머노이드 매핑이 ${mapped}/55입니다.`);
    } else if (comparison.looksLikeKit) {
      warn("skeleton", "kit-skeleton-mismatch", `스켈레톤이 키트 68관절과 다릅니다: 누락 ${comparison.missing.length}개(${listFirst(comparison.missing)}), 여분 ${comparison.extra.length}개(${listFirst(comparison.extra)}).`);
    } else {
      warn("skeleton", "kit-skeleton-legacy", `키트 스켈레톤이 아닙니다(관절 ${input.skeletonJoints.length}개, 휴머노이드 매핑 ${mapped}/55). 포즈 프리셋은 매핑된 본만 움직입니다.`, "info");
    }
    if (bones.duplicates.length > 0) warn("skeleton", "bone-map-duplicate", `같은 휴머노이드 본으로 가는 관절 이름이 겹칩니다: ${listFirst(bones.duplicates)}(첫 번째만 씁니다).`);
  } else if (merged.meshNodes.some((mesh) => mesh.skinned)) {
    warn("skeleton", "skeleton-missing", "스킨 메시가 있는데 skin 정의를 찾지 못했습니다.", "error");
  }

  // 레거시 메시: 역할을 이름에서 추정했다는 사실을 한 번만 알린다.
  if (legacyNodes.length > 0) {
    const described = legacyNodes.map((mesh) => `${mesh.node}→${input.roles.get(mesh.node)?.role ?? "?"}`);
    const hasKit = kitNodes.length > 0;
    warn("roles", hasKit ? "kit-mesh-undeclared" : "roles-guessed", `키트 이름 규칙(TS_Body·TS_Head·TS_Top_<id> …)에 없는 메시 ${legacyNodes.length}개의 역할을 이름에서 추정했습니다: ${listFirst(described, 8)}. 다르면 --role 메시=역할로 지정하세요.`, hasKit ? "warn" : "info");
  }

  // 외곽선 셸
  for (const mesh of merged.meshNodes) {
    if (isOutlineShellName(mesh.node)) warn(mesh.node, "kit-outline-shell-forbidden", `'${mesh.node}'는 _Outline 셸입니다. 키트 v1은 셸을 싣지 않습니다(엔진이 hull 외곽선을 그려 이중 렌더가 됩니다).`, "error");
  }

  // 키트 메시: 스킨·변환
  for (const mesh of kitNodes) {
    if (!mesh.skinned) warn(mesh.node, "kit-skin-invalid", `키트 메시 '${mesh.node}'가 스키닝되지 않았습니다(모든 파츠는 베이스 스켈레톤에 스키닝, 노드 부착 금지).`, "error");
    else if (!mesh.chainTransformIdentity) warn(mesh.node, "kit-transform-invalid", `스킨 메시 '${mesh.node}'(또는 조상)의 변환이 항등이 아닙니다(Armature 루트와 스킨 메시는 항등·스케일 1).`);
  }

  // morph 이름 커버리지
  for (const mesh of kitNodes) {
    const rule = morphCoverageFor(mesh.node);
    if (!rule) continue;
    const have = new Set(mesh.morphTargetNames);
    const missing = rule.required.filter((name) => !have.has(name));
    if (missing.length > 0) warn(mesh.node, "kit-morph-missing", `'${mesh.node}'에 필수 morph ${missing.length}/${rule.required.length}개가 없습니다(${rule.label}): ${listFirst(missing)}. 없으면 해당 슬라이더에서 이 메시가 따라가지 않아 이음매·겹침이 생깁니다.`);
  }

  // 헤어 LOD
  const hairByStyle = new Map<string, Array<{ lod: number; triangles: number; node: string }>>();
  for (const mesh of kitNodes) {
    const match = /^TS_AuthoredHair_(?<style>[a-z0-9-]+)_LOD(?<lod>\d+)$/u.exec(stripMeshSuffix(mesh.node));
    const style = match?.groups?.style;
    const lod = match?.groups?.lod;
    if (style === undefined || lod === undefined) continue;
    const list = hairByStyle.get(style) ?? [];
    list.push({ lod: Number.parseInt(lod, 10), triangles: mesh.triangles, node: mesh.node });
    hairByStyle.set(style, list);
  }
  for (const [style, lods] of hairByStyle) {
    const sorted = [...lods].sort((a, b) => a.lod - b.lod);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (previous && current && current.triangles >= previous.triangles) warn(current.node, "kit-hair-lod", `헤어 '${style}'의 LOD${current.lod}(${current.triangles} tri)가 LOD${previous.lod}(${previous.triangles} tri)보다 가볍지 않습니다(LOD는 단조 감소).`);
    }
    if (!sorted.some((entry) => entry.lod === 0)) warn(`hair/${style}`, "kit-hair-lod", `헤어 '${style}'에 LOD0 메시가 없습니다.`);
  }

  // 재질·텍스처
  for (const material of merged.materials) {
    const users = material.usedByNodes.filter((node) => isKitMeshName(node));
    if (users.length === 0) continue;
    for (const slot of Object.keys(material.textures)) {
      if (slot === "metallicRoughness" || slot === "occlusion" || slot === "emissive") warn(material.name, "kit-texture-slot-forbidden", `재질 '${material.name}'가 ${slot} 텍스처를 씁니다. 키트는 baseColor(필수)와 normal(선택)만 허용합니다(앱의 재질 프리셋이 금속·거칠기를 덮어씁니다).`);
    }
    const isBodyHead = users.every((node) => node === "TS_Body" || node === "TS_Head");
    const baseImage = material.textures.baseColor;
    const image = baseImage === undefined ? undefined : merged.images.find((entry) => entry.index === baseImage);
    if (image && image.width !== null && image.height !== null && !isBodyHead && Math.max(image.width, image.height) > KIT_BUDGETS.textureMaxPx) {
      warn(material.name, "kit-texture-budget", `재질 '${material.name}'의 baseColor가 ${image.width}×${image.height}입니다(몸·머리 외 파츠는 ≤ ${KIT_BUDGETS.textureMaxPx}²).`);
    }
  }

  // 예산: 파일 크기
  input.files.forEach((file, index) => {
    const limit = index === 0 ? KIT_BUDGETS.baseBytes : KIT_BUDGETS.partBytes;
    if (file.bytes > limit) warn(file.label, "kit-budget-bytes", `${index === 0 ? "베이스" : "파츠"} GLB가 ${(file.bytes / MIB).toFixed(2)} MiB로 예산 ${(limit / MIB).toFixed(1)} MiB를 넘습니다.`);
  });

  // 예산: 삼각형
  const trianglesOf = (predicate: (node: string) => boolean): number => kitNodes.filter((mesh) => predicate(mesh.node)).reduce((sum, mesh) => sum + mesh.triangles, 0);
  const bodyHead = trianglesOf((node) => node === "TS_Body" || node === "TS_Head");
  if (bodyHead > KIT_BUDGETS.bodyHeadTriangles) warn("TS_Body+TS_Head", "kit-budget-triangles", `TS_Body+TS_Head가 ${bodyHead} tri로 예산 ${KIT_BUDGETS.bodyHeadTriangles}를 넘습니다.`);
  const perNode: ReadonlyArray<readonly [RegExp, number, string]> = [
    [/^TS_Underwear$/u, KIT_BUDGETS.underwearTriangles, "속옷"],
    [/^TS_(Top|Bottom)_/u, KIT_BUDGETS.garmentTriangles, "상·하의"],
    [/^TS_Shoes_/u, KIT_BUDGETS.shoesTriangles, "신발"],
    [/^TS_Accessory_/u, KIT_BUDGETS.accessoryTriangles, "액세서리"],
    [/^TS_AuthoredHair_[a-z0-9-]+_LOD0$/u, KIT_BUDGETS.hairLod0Triangles, "헤어 LOD0"],
  ];
  for (const mesh of kitNodes) {
    for (const [pattern, limit, label] of perNode) {
      if (pattern.test(stripMeshSuffix(mesh.node)) && mesh.triangles > limit) warn(mesh.node, "kit-budget-triangles", `${label} '${mesh.node}'가 ${mesh.triangles} tri로 예산 ${limit}를 넘습니다.`);
    }
  }
  const faceTriangles = trianglesOf((node) => /^TS_(Eye|Iris|Pupil|Highlight|Brow)_[LR]$/u.test(node) || node === "TS_Lashes" || /^TS_Mouth/u.test(node));
  if (faceTriangles > KIT_BUDGETS.faceMeshesTriangles) warn("face-parts", "kit-budget-triangles", `눈·홍채·입·속눈썹·눈썹 합이 ${faceTriangles} tri로 예산 ${KIT_BUDGETS.faceMeshesTriangles}를 넘습니다.`);
  const activeWorst = kitNodes.filter((mesh) => !/_LOD[1-9]\d*$/u.test(mesh.node)).reduce((sum, mesh) => sum + mesh.triangles, 0);
  if (activeWorst > KIT_BUDGETS.activeWorstTriangles) warn("scene", "kit-budget-triangles", `LOD0 기준 활성 삼각형 합이 ${activeWorst}로 예산 ${KIT_BUDGETS.activeWorstTriangles}를 넘습니다.`);

  return warnings;
}
