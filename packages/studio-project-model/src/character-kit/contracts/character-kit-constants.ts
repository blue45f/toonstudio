import { KIT_JOINT_COUNT } from "./kit-skeleton";
import { ALL_FACS_MORPH_NAMES, allParamMorphNames, facsMorphName } from "./morph-names";
import { BODY_PARAM_KEYS, FACE_PARAM_KEYS } from "./params";

import type { PartRole, RecipeColorKey } from "./mesh-data";
import type { MorphTargetName } from "./morph-names";
import type { BodyRegion } from "./outfit-port";
import type { FaceParamKey } from "./params";
import type { PresetId, SlotKind } from "./slots";
/**
 * 모듈식 캐릭터 키트 계약(docs/authored-kit-spec.md 3·4·9·10절, 상태: target → KT-01 구현).
 *
 * 키트는 리깅된 베이스 바디(여/남) + 프리셋 1개당 GLB 1개의 파츠 + `kit.json` manifest로 이루어진 `public/assets/characters/toonstudio-kit-v1/` 패키지다.
 * 이 파일은 순수 TS + zod다. 로더(render)·계획기(domains/authored)·검증기(scripts)가 같은 상수를 import하므로 이름·예산·어휘를 다른 곳에 복제하지 않는다.
 *
 * 순환 import 방지: 이 파일은 `recipe.ts`의 값을 import하지 않는다(타입만). 레시피 쪽(`recipe.ts`)이 이 파일의 상수를 쓴다.
 *
 * 리드 결정(2026-10-08):
 * - A-1: `irises` 슬롯 파츠의 허용 역할은 `iris`, `eye-highlight`(+선택 `pupil`)이다. 계약 3.5의 "iris(+pupil 선택)"를 보완한다.
 *   필수는 `iris`와 `eye-highlight`, `pupil`만 선택이다.
 * - 필수 파츠 최소 집합 `KIT_REQUIRED_PRESETS` = irises/round-large. (2026-10-14 라이선스 결정으로 축소: Hyper3D(Rodin) 파생 기본 파츠 4종은 상업 이용 증빙 미확정으로 키트에서 제외됐다. 기록은 `docs/hyper3d-terms-record.md` §10.)
 */




// ---------------------------------------------------------------- 식별자·경로·버전

export const KIT_SCHEMA_ID = "toonstudio.character-kit/1" as const;
export { KIT_ASSET_ROOT, KIT_CURRENT_VERSION, KIT_DEFAULT_ID, KIT_MANIFEST_FILENAME, KIT_PORTRAIT_VERSION, KIT_SWEPT_HAIR_VERSION, kitManifestFilename } from "./kit-editions";

export const KIT_BASE_IDS = ["female", "male"] as const;
export type KitBaseId = (typeof KIT_BASE_IDS)[number];

const KIT_BASE_ID_SET: ReadonlySet<string> = new Set(KIT_BASE_IDS);

export function isKitBaseId(value: unknown): value is KitBaseId {
  return typeof value === "string" && KIT_BASE_ID_SET.has(value);
}

/** 레시피 `source.kitId`·`kit.json` `kitId` 형식(캐릭터 id 규칙과 같다) */
export const KIT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,62}$/u;
export const SHA256_HEX = /^[0-9a-f]{64}$/u;
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/u;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
export const MATERIAL_NAME_PATTERN = /^ts_[a-z0-9_-]+$/u;
export const NODE_NAME_PATTERN = /^[A-Za-z0-9_.:-]+$/u;

// 스켈레톤·관절 오프셋(kit-skeleton.ts)과 출처(kit-provenance.ts)는 2026-10-23 파일 크기 래칫 상쇄로 옮겼다. 기존 import 경로를 위해 다시 내보낸다.
export { KIT_ALLOWED_LICENSES, KIT_HYPER3D_EVIDENCE_PREFIX, kitSourceSchema } from "./kit-provenance";
export { KIT_BONE_MAP, KIT_END_BONES, KIT_JOINT_COUNT, KIT_ROOT_JOINT, KIT_SKELETON_JOINTS, KIT_SKELETON_PARENTS, kitJointOffsetsSchema, kitSkeletonSchema } from "./kit-skeleton";
export type { KitIssue, KitJointOffsets, KitSkeleton } from "./kit-skeleton";
export type { KitSource } from "./kit-provenance";

// ---------------------------------------------------------------- 영역(몸 가림)

/** Blender 정점 그룹 `region.<id>` 16개. `_REGION` 정점 속성 값은 이 배열의 인덱스다. */
export const KIT_REGION_IDS = [
  "head",
  "neck",
  "torso",
  "pelvis",
  "upperArm.L",
  "upperArm.R",
  "forearm.L",
  "forearm.R",
  "hand.L",
  "hand.R",
  "thigh.L",
  "thigh.R",
  "calf.L",
  "calf.R",
  "foot.L",
  "foot.R",
] as const;
export type KitRegionId = (typeof KIT_REGION_IDS)[number];

/** `TS_Body` 인덱스 범위로 나뉘어 숨길 수 있는 영역 15개(`head`는 `TS_Head`에만 있어 제외) */
export const KIT_HIDEABLE_REGION_IDS = [
  "neck",
  "torso",
  "pelvis",
  "upperArm.L",
  "upperArm.R",
  "forearm.L",
  "forearm.R",
  "hand.L",
  "hand.R",
  "thigh.L",
  "thigh.R",
  "calf.L",
  "calf.R",
  "foot.L",
  "foot.R",
] as const satisfies readonly Exclude<KitRegionId, "head">[];
export type KitHideableRegionId = (typeof KIT_HIDEABLE_REGION_IDS)[number];

/** 키트 영역 → 계약 `BODY_REGIONS`(12). 위팔·아래팔은 팔, 허벅지·종아리는 다리로 합친다. */
export const KIT_REGION_TO_BODY_REGION: Readonly<Record<KitRegionId, BodyRegion>> = {
  head: "head",
  neck: "neck",
  torso: "torso",
  pelvis: "hips",
  "upperArm.L": "leftArm",
  "upperArm.R": "rightArm",
  "forearm.L": "leftArm",
  "forearm.R": "rightArm",
  "hand.L": "leftHand",
  "hand.R": "rightHand",
  "thigh.L": "leftLeg",
  "thigh.R": "rightLeg",
  "calf.L": "leftLeg",
  "calf.R": "rightLeg",
  "foot.L": "leftFoot",
  "foot.R": "rightFoot",
};

// ---------------------------------------------------------------- morph 어휘와 필수 커버리지

/** 체형 키 중 머리에 붙는 메시가 따라가야 하는 4개(없으면 목 이음매가 벌어진다) */
export const KIT_HEAD_ATTACHED_BODY_KEYS = ["height", "legLength", "neckLength", "headSize"] as const;

/** 허용 morph 이름 전체 64개(체형 9×2 + 얼굴 15×2 + FACS 16). `ext:*`는 v1에서 금지한다. */
export const KIT_MORPH_NAMES: readonly MorphTargetName[] = [
  ...allParamMorphNames([...BODY_PARAM_KEYS, ...FACE_PARAM_KEYS]),
  ...ALL_FACS_MORPH_NAMES,
];

const BODY_MORPHS: readonly MorphTargetName[] = allParamMorphNames(BODY_PARAM_KEYS);
const HEAD_BODY_MORPHS: readonly MorphTargetName[] = allParamMorphNames(KIT_HEAD_ATTACHED_BODY_KEYS);
const FACE_MORPHS: readonly MorphTargetName[] = allParamMorphNames(FACE_PARAM_KEYS);
const EYE_FACE_KEYS: readonly FaceParamKey[] = ["eyeSize", "eyeSpacing", "eyeTilt", "faceShape"];
const LASH_BROW_FACE_KEYS: readonly FaceParamKey[] = ["eyeSize", "eyeSpacing", "eyeTilt", "forehead", "faceShape"];
const MOUTH_FACE_KEYS: readonly FaceParamKey[] = ["mouthWidth", "jawWidth"];

/** 눈·눈썹 계열 FACS(속눈썹·눈썹이 따라가야 함) */
export const KIT_EYE_FACS_UNITS = ["browInnerUp", "browOuterUp", "browDown", "eyeBlinkLeft", "eyeBlinkRight", "eyeWide", "eyeSquint"] as const;
/** 입 계열 FACS(치아·혀가 따라가야 함) */
export const KIT_MOUTH_FACS_UNITS = [
  "jawOpen",
  "mouthSmile",
  "mouthFrown",
  "mouthPucker",
  "mouthFunnel",
  "mouthPress",
  "tongueOut",
  "cheekPuff",
] as const;

const EYE_FACS_MORPHS: readonly MorphTargetName[] = KIT_EYE_FACS_UNITS.map((unit) => facsMorphName(unit));
const MOUTH_FACS_MORPHS: readonly MorphTargetName[] = KIT_MOUTH_FACS_UNITS.map((unit) => facsMorphName(unit));

function faceMorphs(keys: readonly FaceParamKey[]): readonly MorphTargetName[] {
  return allParamMorphNames(keys);
}

/**
 * 역할별 반드시 가져야 하는 morph 타깃의 **최소** 집합(계약 4.4 표). 의미 검증(실제로 따라 움직이는지)은 검증기 V9가 한다.
 * `pupil`·`eye-highlight`는 계약 표에 없으나 눈에 붙는 메시이므로 `iris`와 같은 요구를 둔다(리드 결정 A-1에 따른 보완).
 */
export const KIT_MORPH_COVERAGE: Readonly<Record<PartRole, readonly MorphTargetName[]>> = {
  skin: BODY_MORPHS,
  underwear: BODY_MORPHS,
  top: BODY_MORPHS,
  bottom: BODY_MORPHS,
  shoes: BODY_MORPHS,
  head: [...HEAD_BODY_MORPHS, ...FACE_MORPHS, ...ALL_FACS_MORPH_NAMES],
  eyeball: [...HEAD_BODY_MORPHS, ...faceMorphs(EYE_FACE_KEYS)],
  iris: [...HEAD_BODY_MORPHS, ...faceMorphs(EYE_FACE_KEYS)],
  pupil: [...HEAD_BODY_MORPHS, ...faceMorphs(EYE_FACE_KEYS)],
  "eye-highlight": [...HEAD_BODY_MORPHS, ...faceMorphs(EYE_FACE_KEYS)],
  lash: [...HEAD_BODY_MORPHS, ...faceMorphs(LASH_BROW_FACE_KEYS), ...EYE_FACS_MORPHS],
  brow: [...HEAD_BODY_MORPHS, ...faceMorphs(LASH_BROW_FACE_KEYS), ...EYE_FACS_MORPHS],
  teeth: [...HEAD_BODY_MORPHS, ...faceMorphs(MOUTH_FACE_KEYS), ...MOUTH_FACS_MORPHS],
  tongue: [...HEAD_BODY_MORPHS, ...faceMorphs(MOUTH_FACE_KEYS), ...MOUTH_FACS_MORPHS],
  hair: HEAD_BODY_MORPHS,
  accessory: HEAD_BODY_MORPHS,
  // 레시피 v3 역할(키트 v2에서만 나온다): 층 의상은 몸을, 헤어 부속은 머리를 따라간다.
  inner: BODY_MORPHS,
  outer: BODY_MORPHS,
  legwear: BODY_MORPHS,
  "hair-accessory": HEAD_BODY_MORPHS,
};

/** 정체성 슬롯별 계약 축(능력 판정: 모든 ± 타깃이 `TS_Head`에 있으면 available). 합계 15축. */
export const KIT_SLOT_AXES: Readonly<Partial<Record<SlotKind, readonly FaceParamKey[]>>> = {
  "face-shape": ["faceShape", "jawWidth", "chinLength", "cheekVolume", "forehead"],
  eyes: ["eyeSize", "eyeSpacing", "eyeTilt"],
  nose: ["noseHeight", "noseWidth", "noseDepth"],
  mouth: ["mouthWidth", "lipFullness"],
  ears: ["earSize", "earAngle"],
};

/** 키트가 반드시 채워야 하는 관절 오프셋 morph(계약 4.4). `waist`·`chestDepth`는 관절이 안 움직여도 된다. */
export const KIT_REQUIRED_JOINT_OFFSET_MORPHS: readonly MorphTargetName[] = allParamMorphNames([
  "height",
  "legLength",
  "armLength",
  "shoulderWidth",
  "neckLength",
  "headSize",
  "hip",
]);

// ---------------------------------------------------------------- 예산·허용 목록

const MIB = 1024 * 1024;

/**
 * 예산(계약 3.7). 용량은 MiB(1024²) 기준 바이트다. 삼각형 수치는 제안값(열린 질문 Q7)이라 실측 후 이 상수만 조정한다.
 * 용량 정정(리드 결정, 2026-10-08): 체형 morph(18+머리 체형 8)만으로 베이스 GLB가 12.2 MB가 되어(B3 실측) 8 MiB는 얼굴 30·표정 16 키를
 * 더하면 지킬 수 없다. 베이스 16 MiB·전체 64 MiB로 올리되, 내보내기에서 **법선 델타 제거(TS_Head 제외)·sparse accessor·morph 양자화
 * (KHR_mesh_quantization)·텍스처 조정으로 줄이는 것을 의무**로 한다(목표: 베이스 ≤ 12 MiB). 파츠 한도(1.5 MiB)는 그대로다.
 */
export const KIT_BUDGET = {
  baseGlbMaxBytes: 16 * MIB,
  partGlbMaxBytes: 1.5 * MIB,
  totalMaxBytes: 64 * MIB,
  jointCount: KIT_JOINT_COUNT,
  maxInfluencesPerVertex: 4,
  weightSumTolerance: 1e-3,
  maxMorphTargetsPerMesh: 96,
  /** 관절 오프셋 한 항목의 최대 크기(m) */
  maxJointOffsetM: 0.3,
  triangles: {
    bodyAndHead: 90_000,
    underwear: 8_000,
    top: 25_000,
    bottom: 25_000,
    shoes: 8_000,
    accessory: 6_000,
    hairLod0: 20_000,
    /** 눈·홍채·입·속눈썹·눈썹 합 */
    faceParts: 15_000,
    /** 베이스 + 속옷 + 슬롯별 최대 파츠 합(LOD0) */
    activeWorst: 200_000,
  },
  textureMaxSize: { bodyAndHead: 2048, other: 1024 },
} as const;

/** 허용 glTF 확장(압축 없음) */
export const KIT_ALLOWED_EXTENSIONS = [
  "KHR_materials_clearcoat",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_ior",
  "KHR_materials_emissive_strength",
  "KHR_texture_transform",
  "KHR_mesh_quantization",
] as const;

/** 금지 glTF 확장(외부 디코더·CDN 의존으로 무음 실패 위험) */
export const KIT_FORBIDDEN_EXTENSIONS = ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu", "EXT_texture_webp"] as const;


// ---------------------------------------------------------------- 파츠 슬롯·필수 파츠·기본값

/** 파츠 GLB를 갖는 슬롯 6개 */
export const KIT_PART_SLOTS = ["hair", "top", "bottom", "shoes", "accessory", "irises"] as const;
export type KitPartSlot = (typeof KIT_PART_SLOTS)[number];

const KIT_PART_SLOT_SET: ReadonlySet<string> = new Set(KIT_PART_SLOTS);

export function isKitPartSlot(value: string): value is KitPartSlot {
  return KIT_PART_SLOT_SET.has(value);
}

/** 슬롯별 허용 역할. `irises`는 리드 결정 A-1에 따라 iris, eye-highlight(+선택 pupil)이다. */
export const KIT_PART_SLOT_ROLES: Readonly<Record<KitPartSlot, readonly PartRole[]>> = {
  hair: ["hair"],
  top: ["top"],
  bottom: ["bottom"],
  shoes: ["shoes"],
  accessory: ["accessory"],
  irises: ["iris", "eye-highlight", "pupil"],
};

/** 슬롯별 필수 역할(변형이 반드시 가져야 한다). `pupil`만 선택이다. */
export const KIT_PART_SLOT_REQUIRED_ROLES: Readonly<Record<KitPartSlot, readonly PartRole[]>> = {
  hair: ["hair"],
  top: ["top"],
  bottom: ["bottom"],
  shoes: ["shoes"],
  accessory: ["accessory"],
  irises: ["iris", "eye-highlight"],
};

/** 각 베이스에 반드시 있어야 하는 파츠. 하나라도 없으면 키트 전체가 invalid다(리드 결정).
 * 2026-10-14: hair/soft-bob·top/tee·bottom/jeans·shoes/sneakers는 Hyper3D(Rodin) 파생이라 상업 이용 증빙이 확정되지 않아
 * 키트에서 제외됐고(파츠는 미제공 사유로 선언), 필수 집합에서도 빠졌다. 증빙 확정 후 파츠와 함께 복원한다(terms-record §10). */
export const KIT_REQUIRED_PRESETS: readonly PresetId[] = ["irises/round-large"];

/**
 * 키트 기본 선택값(15슬롯). `createDefaultRecipe()`의 슬롯과 같은 값이며 레시피 쪽이 이 상수를 그대로 쓴다.
 * `kit.json.defaults`는 이 값과 같아야 하고 검증기가 대조한다(부팅이 비동기 fetch를 기다리지 않도록 단일 기준은 이 TS 상수).
 */
export const KIT_DEFAULT_SLOTS: Readonly<Record<SlotKind, PresetId | null>> = Object.freeze({
  "face-shape": "face-shape/oval",
  eyes: "eyes/almond",
  irises: "irises/round-large",
  nose: "nose/straight",
  mouth: "mouth/small",
  ears: "ears/standard",
  hair: null,
  body: "body/standard",
  top: null,
  bottom: null,
  shoes: null,
  accessory: null,
  expression: "expression/neutral",
  pose: "pose/a-pose",
  "hand-pose": "hand-pose/relaxed",
});
export const KIT_DEFAULT_BASE_ID: KitBaseId = "female";

// ---------------------------------------------------------------- 베이스 메시 규약

export interface KitBaseMeshSpec {
  readonly node: string;
  readonly role?: PartRole;
  readonly material?: string;
  readonly primitiveRoles?: readonly PartRole[];
  readonly primitiveMaterials?: readonly string[];
}

/** 베이스 GLB가 정확히 가져야 하는 메시 9개(이름·역할·재질). 눈 `TS_Eye_L/R`은 공막+각막만이다(홍채는 `irises` 파츠). */
export const KIT_BASE_MESH_SPECS: readonly KitBaseMeshSpec[] = [
  { node: "TS_Body", role: "skin", material: "ts_skin_body" },
  { node: "TS_Head", role: "head", material: "ts_skin_head" },
  { node: "TS_Eye_L", role: "eyeball", material: "ts_eye" },
  { node: "TS_Eye_R", role: "eyeball", material: "ts_eye" },
  { node: "TS_Mouth", primitiveRoles: ["teeth", "tongue"], primitiveMaterials: ["ts_teeth", "ts_tongue"] },
  { node: "TS_Lashes", role: "lash", material: "ts_lashes" },
  { node: "TS_Brow_L", role: "brow", material: "ts_brow" },
  { node: "TS_Brow_R", role: "brow", material: "ts_brow" },
  { node: "TS_Underwear", role: "underwear", material: "ts_underwear" },
];

export const KIT_BODY_NODE = "TS_Body" as const;
export const KIT_HEAD_NODE = "TS_Head" as const;

/** 역할별 재질 틴트 규칙(계약 3.6). `pupil`은 홍채 텍스처에 굽는 것이 기본이라 제약하지 않는다. */
export const KIT_ROLE_TINT_RULES: Readonly<Partial<Record<PartRole, { readonly mode: "recolor"; readonly colorKey: RecipeColorKey } | { readonly mode: "fixed" }>>> = {
  skin: { mode: "recolor", colorKey: "skin" },
  head: { mode: "recolor", colorKey: "skin" },
  iris: { mode: "recolor", colorKey: "iris" },
  brow: { mode: "recolor", colorKey: "brow" },
  lash: { mode: "recolor", colorKey: "brow" },
  hair: { mode: "recolor", colorKey: "hair" },
  top: { mode: "recolor", colorKey: "top" },
  bottom: { mode: "recolor", colorKey: "bottom" },
  shoes: { mode: "recolor", colorKey: "shoes" },
  accessory: { mode: "recolor", colorKey: "accessory" },
  eyeball: { mode: "fixed" },
  "eye-highlight": { mode: "fixed" },
  teeth: { mode: "fixed" },
  tongue: { mode: "fixed" },
  underwear: { mode: "fixed" },
};

// ---------------------------------------------------------------- 실패 코드

/** 키트 로드·검증 실패 코드(계약 4.12). 모두 `LabFailure{code, reasonKo}`로 한글 사유와 함께 노출한다. */
export const KIT_FAILURE_CODES = [
  "kit-manifest-fetch-failed",
  "kit-manifest-invalid",
  "kit-version-mismatch",
  "kit-manifest-sha-mismatch",
  "kit-base-missing",
  "kit-capabilities-mismatch",
  "kit-part-missing",
  "kit-file-fetch-failed",
  "kit-bytes-mismatch",
  "kit-sha-mismatch",
  "kit-glb-load-failed",
  "kit-joint-mismatch",
  "kit-skin-invalid",
  "kit-transform-invalid",
  "kit-mesh-undeclared",
  "kit-mesh-missing",
  "kit-material-multiple",
  "kit-morph-missing",
  "kit-region-range-invalid",
  "kit-unsupported-extension",
  "kit-outline-shell-forbidden",
] as const;
export type KitFailureCode = (typeof KIT_FAILURE_CODES)[number];
