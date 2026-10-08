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
 * - 필수 파츠 최소 집합 `KIT_REQUIRED_PRESETS` = hair/soft-bob, top/tee, bottom/jeans, shoes/sneakers, irises/round-large.
 */
import { z } from "zod";

import { stableStringify } from "../shared/stable-json";

import { HUMANOID_BONE_NAMES, isHumanoidBoneName } from "./bones";
import { failVisible } from "./errors";
import { PART_ROLES, RECIPE_COLOR_KEYS } from "./mesh-data";
import { ALL_FACS_MORPH_NAMES, allParamMorphNames, facsMorphName, isMorphTargetName } from "./morph-names";
import { AUTHORED_HAIR_MESH_PATTERN, OUTLINE_MESH_SUFFIX, slotCapabilityMapSchema } from "./package-manifest";
import { BODY_PARAM_KEYS, FACE_PARAM_KEYS } from "./params";
import { SLOT_PRESET_IDS } from "./preset-vocabulary";
import { CHARACTER_SLOT_KINDS, isPresetId } from "./slots";

import type { HumanoidBoneName } from "./bones";
import type { LabFailure } from "./errors";
import type { PartRole, RecipeColorKey } from "./mesh-data";
import type { MorphTargetName } from "./morph-names";
import type { BodyRegion } from "./outfit-port";
import type { FaceParamKey } from "./params";
import type { CharacterRecipe } from "./recipe";
import type { PresetId, SlotCapabilityMap, SlotKind } from "./slots";

// ---------------------------------------------------------------- 식별자·경로·버전

export const KIT_SCHEMA_ID = "toonstudio.character-kit/1" as const;
export const KIT_DEFAULT_ID = "toonstudio-kit-v1" as const;
export const KIT_ASSET_ROOT = "/assets/characters/toonstudio-kit-v1" as const;
export const KIT_MANIFEST_FILENAME = "kit.json" as const;
/** 키트 `kitVersion`. 이름·구조가 호환되지 않게 바뀌면 올리고 레시피 `source.kitVersion`과 맞춘다(불일치는 `kit-version-mismatch`). */
export const KIT_CURRENT_VERSION = 1 as const;

export const KIT_BASE_IDS = ["female", "male"] as const;
export type KitBaseId = (typeof KIT_BASE_IDS)[number];

const KIT_BASE_ID_SET: ReadonlySet<string> = new Set(KIT_BASE_IDS);

export function isKitBaseId(value: unknown): value is KitBaseId {
  return typeof value === "string" && KIT_BASE_ID_SET.has(value);
}

/** 레시피 `source.kitId`·`kit.json` `kitId` 형식(캐릭터 id 규칙과 같다) */
export const KIT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,62}$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const HANGUL = /[가-힣]/u;
const MATERIAL_NAME_PATTERN = /^ts_[a-z0-9_-]+$/u;
const NODE_NAME_PATTERN = /^[A-Za-z0-9_.:-]+$/u;

export const KIT_ROOT_JOINT = "Armature" as const;

// ---------------------------------------------------------------- 스켈레톤(68 joint)

const MIXAMO_PREFIX = "mixamorig:";
const KIT_SIDES = ["Left", "Right"] as const;
const KIT_FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"] as const;
/** Mixamo 손가락 이름 → VRM 어휘 접미(마디 1~3). 마디 4는 끝 본이라 매핑하지 않는다. */
const FINGER_VRM_NAMES: Readonly<Record<(typeof KIT_FINGERS)[number], readonly [string, string, string]>> = {
  Thumb: ["ThumbMetacarpal", "ThumbProximal", "ThumbDistal"],
  Index: ["IndexProximal", "IndexIntermediate", "IndexDistal"],
  Middle: ["MiddleProximal", "MiddleIntermediate", "MiddleDistal"],
  Ring: ["RingProximal", "RingIntermediate", "RingDistal"],
  Pinky: ["LittleProximal", "LittleIntermediate", "LittleDistal"],
};

function buildSkeleton(): {
  readonly joints: string[];
  readonly parents: Record<string, string | null>;
  readonly boneMap: Record<string, HumanoidBoneName>;
  readonly endBones: string[];
} {
  const joints: string[] = [];
  const parents: Record<string, string | null> = {};
  const boneMap: Record<string, HumanoidBoneName> = {};
  const endBones: string[] = [];

  const add = (node: string, parent: string | null, vrm: string | null): void => {
    joints.push(node);
    parents[node] = parent;
    if (vrm === null) {
      endBones.push(node);
      return;
    }
    if (!isHumanoidBoneName(vrm)) throw new Error(`키트 본 매핑이 VRM 어휘 밖입니다: ${node} → ${vrm}`);
    boneMap[node] = vrm;
  };
  const m = (name: string): string => `${MIXAMO_PREFIX}${name}`;

  add(m("Hips"), null, "hips");
  add(m("Spine"), m("Hips"), "spine");
  add(m("Spine1"), m("Spine"), "chest");
  add(m("Spine2"), m("Spine1"), "upperChest");
  add(m("Neck"), m("Spine2"), "neck");
  add(m("Head"), m("Neck"), "head");
  add(m("HeadTop_End"), m("Head"), null);
  for (const side of KIT_SIDES) {
    const lower = side.toLowerCase();
    add(m(`${side}Shoulder`), m("Spine2"), `${lower}Shoulder`);
    add(m(`${side}Arm`), m(`${side}Shoulder`), `${lower}UpperArm`);
    add(m(`${side}ForeArm`), m(`${side}Arm`), `${lower}LowerArm`);
    add(m(`${side}Hand`), m(`${side}ForeArm`), `${lower}Hand`);
    for (const finger of KIT_FINGERS) {
      const vrm = FINGER_VRM_NAMES[finger];
      for (let segment = 1; segment <= 4; segment += 1) {
        const parent = segment === 1 ? m(`${side}Hand`) : m(`${side}Hand${finger}${segment - 1}`);
        const vrmName = segment <= 3 ? `${lower}${vrm[segment - 1] ?? ""}` : null;
        add(m(`${side}Hand${finger}${segment}`), parent, vrmName);
      }
    }
    add(m(`${side}UpLeg`), m("Hips"), `${lower}UpperLeg`);
    add(m(`${side}Leg`), m(`${side}UpLeg`), `${lower}LowerLeg`);
    add(m(`${side}Foot`), m(`${side}Leg`), `${lower}Foot`);
    add(m(`${side}ToeBase`), m(`${side}Foot`), `${lower}Toes`);
    add(m(`${side}Toe_End`), m(`${side}ToeBase`), null);
  }
  add("TS_Jaw", m("Head"), "jaw");
  add("TS_Eye.L", m("Head"), "leftEye");
  add("TS_Eye.R", m("Head"), "rightEye");
  return { joints, parents, boneMap, endBones };
}

const SKELETON = buildSkeleton();

/** 키트 joint 68개(Mixamo 65 + `TS_Jaw` + `TS_Eye.L/R`). 순서는 정본 예시이며 manifest는 같은 이름 집합이면 순서를 정할 수 있다(모든 GLB `skin.joints`와 동일해야 함). */
export const KIT_SKELETON_JOINTS: readonly string[] = Object.freeze(SKELETON.joints);
/** joint → 부모 joint(루트 `mixamorig:Hips`만 null) */
export const KIT_SKELETON_PARENTS: Readonly<Record<string, string | null>> = Object.freeze(SKELETON.parents);
/** 기대 본 매핑(55). 계약 어휘 `HUMANOID_BONE_NAMES` 전부를 1회씩 덮는다. */
export const KIT_BONE_MAP: Readonly<Record<string, HumanoidBoneName>> = Object.freeze(SKELETON.boneMap);
/** 의도된 미매핑 끝 본 13개: HeadTop_End, Toe_End×2, 손가락 끝 마디×10 */
export const KIT_END_BONES: readonly string[] = Object.freeze(SKELETON.endBones);
export const KIT_JOINT_COUNT = 68 as const;

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

export const KIT_ALLOWED_LICENSES = ["CC0-1.0", "original"] as const;

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

/** 각 베이스에 반드시 있어야 하는 파츠. 하나라도 없으면 키트 전체가 invalid다(리드 결정). */
export const KIT_REQUIRED_PRESETS: readonly PresetId[] = ["hair/soft-bob", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"];

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
  hair: "hair/soft-bob",
  body: "body/standard",
  top: "top/tee",
  bottom: "bottom/jeans",
  shoes: "shoes/sneakers",
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

// ---------------------------------------------------------------- zod: 기본 조각

function isSafeRelativePath(value: string): boolean {
  if (value.length === 0 || value.startsWith("/") || value.includes("\\") || value.includes(":")) return false;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

const sha256Schema = z.string().regex(SHA256_HEX, "sha256은 64자리 소문자 hex여야 합니다.");
const hexSchema = z.string().regex(HEX_COLOR_PATTERN, "색은 소문자 #rrggbb 형식이어야 합니다.");

export const kitFileSchema = z
  .object({
    path: z.string().refine(isSafeRelativePath, { message: "파일 경로는 키트 루트 기준 상대 경로여야 합니다(절대·`..`·역슬래시 금지)." }),
    bytes: z.number().int().positive(),
    sha256: sha256Schema,
  })
  .strict();

const morphNameSchema = z
  .string()
  .refine((name) => isMorphTargetName(name), { message: "morph 이름이 계약 어휘(param:<키>:±, facs:<유닛>)에 없습니다(`ext:*`는 v1 금지)." });

const materialNameSchema = z.string().regex(MATERIAL_NAME_PATTERN, "재질 이름은 ts_ 로 시작하는 소문자 식별자여야 합니다.");
const partRoleSchema = z.enum(PART_ROLES);

export const kitMeshSchema = z
  .object({
    node: z.string().regex(NODE_NAME_PATTERN, "메시 노드 이름에 허용되지 않는 문자가 있습니다."),
    role: partRoleSchema.optional(),
    material: materialNameSchema.optional(),
    /** 다중 프리미티브 메시(`TS_Mouth`)의 프리미티브 번호별 역할·재질 */
    primitiveRoles: z.array(partRoleSchema).min(2).optional(),
    primitiveMaterials: z.array(materialNameSchema).min(2).optional(),
    lod: z.number().int().nonnegative().optional(),
    triangles: z.number().int().positive(),
    vertices: z.number().int().positive(),
    /** 모든 키트 메시는 스키닝이다. 선언하면 true여야 한다. */
    skinned: z.literal(true).optional(),
    morphs: z.array(morphNameSchema).max(KIT_BUDGET.maxMorphTargetsPerMesh),
  })
  .strict();

export type KitMesh = z.infer<typeof kitMeshSchema>;

const kitTintSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("recolor"), colorKey: z.enum(RECIPE_COLOR_KEYS) }).strict(),
  z.object({ mode: z.literal("fixed"), hex: hexSchema }).strict(),
]);

export const kitMaterialSchema = z
  .object({
    role: partRoleSchema,
    tint: kitTintSchema,
    doubleSided: z.boolean(),
  })
  .strict();
export type KitMaterial = z.infer<typeof kitMaterialSchema>;

const hideableRegionSchema = z.enum(KIT_HIDEABLE_REGION_IDS);

export const kitRegionRangeSchema = z
  .object({
    id: hideableRegionSchema,
    mesh: z.string(),
    indexStart: z.number().int().nonnegative(),
    indexCount: z.number().int().positive(),
  })
  .strict();
export type KitRegionRange = z.infer<typeof kitRegionRangeSchema>;

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const kitBaseSchema = z
  .object({
    file: kitFileSchema,
    heightM: z.number().min(0.5).max(3),
    boundsM: z.object({ min: vec3Schema, max: vec3Schema }).strict(),
    meshes: z.array(kitMeshSchema).min(1),
    bodyRegions: z.array(kitRegionRangeSchema),
  })
  .strict();
export type KitBase = z.infer<typeof kitBaseSchema>;

export const kitPartVariantSchema = z
  .object({
    file: kitFileSchema,
    meshes: z.array(kitMeshSchema).min(1),
    /** 몸에서 숨길 영역(그 영역을 전부 덮을 때만 선언) */
    hides: z.array(hideableRegionSchema),
  })
  .strict();
export type KitPartVariant = z.infer<typeof kitPartVariantSchema>;

const kitBaseKeyedSchema = <T extends z.ZodType>(schema: T) => z.object({ female: schema.optional(), male: schema.optional() }).strict();

export const kitPartSchema = z
  .object({
    id: z.string().refine((id) => isPresetId(id), { message: "파츠 id는 <슬롯>/<이름> 프리셋 id여야 합니다." }),
    slot: z.enum(KIT_PART_SLOTS),
    variants: kitBaseKeyedSchema(kitPartVariantSchema),
    /** 베이스별 미제공 사유(비어 있지 않은 한글) */
    unavailable: kitBaseKeyedSchema(z.string()),
  })
  .strict();
export type KitPart = z.infer<typeof kitPartSchema>;

export const kitSourceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().optional(),
    url: z.string().optional(),
    zipSha256: sha256Schema.optional(),
    license: z.enum(KIT_ALLOWED_LICENSES),
    derivative: z.boolean(),
    changesKo: z.string(),
  })
  .strict();
export type KitSource = z.infer<typeof kitSourceSchema>;

export const kitSkeletonSchema = z
  .object({
    root: z.literal(KIT_ROOT_JOINT),
    joints: z.array(z.string()),
    parents: z.record(z.string(), z.string().nullable()),
    boneMap: z.record(z.string(), z.enum(HUMANOID_BONE_NAMES)),
    endBones: z.array(z.string()),
  })
  .strict();
export type KitSkeleton = z.infer<typeof kitSkeletonSchema>;

const jointOffsetSchema = z.record(z.string(), vec3Schema);
export const kitJointOffsetsSchema = z.record(z.string(), jointOffsetSchema);
export type KitJointOffsets = z.infer<typeof kitJointOffsetsSchema>;

const budgetsSchema = z.custom<typeof KIT_BUDGET>((value) => stableStringify(value) === stableStringify(KIT_BUDGET), {
  message: "budgets는 계약 상수 KIT_BUDGET의 사본과 같아야 합니다.",
});

const kitCapabilityDeclarationSchema = z.object({ female: slotCapabilityMapSchema.optional(), male: slotCapabilityMapSchema.optional() }).strict();

export const kitManifestObjectSchema = z
  .object({
    schema: z.literal(KIT_SCHEMA_ID),
    kitId: z.string().regex(KIT_ID_PATTERN, "kitId 형식이 올바르지 않습니다."),
    kitVersion: z.number().int().positive(),
    displayName: z.string().min(1),
    generatedAt: z.string().regex(DATE_PATTERN, "generatedAt은 YYYY-MM-DD여야 합니다."),
    generator: z
      .object({ tool: z.string().min(1), blender: z.string().min(1), command: z.array(z.string()), commit: z.string().optional() })
      .strict(),
    coordinateSystem: z
      .object({
        up: z.literal("+Y"),
        forward: z.literal("+Z"),
        unit: z.literal("m"),
        handedness: z.literal("right"),
        rest: z.literal("T-pose"),
        rootScale: z.literal(1),
      })
      .strict(),
    provenance: z
      .object({
        sources: z.array(kitSourceSchema).min(1),
        noticeFile: z.string().refine(isSafeRelativePath, { message: "noticeFile은 상대 경로여야 합니다." }),
        summaryKo: z.string(),
      })
      .strict(),
    skeleton: kitSkeletonSchema,
    materials: z.record(materialNameSchema, kitMaterialSchema),
    jointOffsets: kitJointOffsetsSchema,
    bases: z.object({ female: kitBaseSchema.optional(), male: kitBaseSchema.optional() }).strict(),
    parts: z.array(kitPartSchema),
    defaults: z
      .object({
        base: z.enum(KIT_BASE_IDS),
        slots: z.record(
          z.enum(CHARACTER_SLOT_KINDS),
          z.string().refine((id) => isPresetId(id), { message: "프리셋 id는 <슬롯>/<이름> 형식이어야 합니다." }).nullable(),
        ),
        colors: z.record(z.enum(RECIPE_COLOR_KEYS), hexSchema),
      })
      .strict(),
    slotCapabilities: kitCapabilityDeclarationSchema,
    physics: z.object({ mode: z.literal("static"), chains: z.tuple([]), colliders: z.tuple([]) }).strict(),
    budgets: budgetsSchema,
  })
  .strict();

// ---------------------------------------------------------------- 교차 검증

interface KitIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
}

type ManifestShape = z.infer<typeof kitManifestObjectSchema>;

function meshRoles(mesh: KitMesh): readonly PartRole[] {
  if (mesh.role !== undefined) return [mesh.role];
  return mesh.primitiveRoles ?? [];
}

function meshMaterials(mesh: KitMesh): readonly string[] {
  if (mesh.material !== undefined) return [mesh.material];
  return mesh.primitiveMaterials ?? [];
}

function listFew(items: readonly string[], limit = 4): string {
  return items.length <= limit ? items.join(", ") : `${items.slice(0, limit).join(", ")} 외 ${items.length - limit}개`;
}

/** 메시 하나의 단독 규칙: 역할/재질 선언 형태, 외곽선 셸 금지, morph 중복·필수 커버리지 */
function singleMeshIssues(mesh: KitMesh, path: ReadonlyArray<string | number>): KitIssue[] {
  const issues: KitIssue[] = [];
  const hasSingle = mesh.role !== undefined || mesh.material !== undefined;
  const hasPrimitive = mesh.primitiveRoles !== undefined || mesh.primitiveMaterials !== undefined;
  if (hasSingle === hasPrimitive) {
    issues.push({ path, message: `${mesh.node}: role+material 또는 primitiveRoles+primitiveMaterials 중 정확히 하나를 선언해야 합니다.` });
    return issues;
  }
  if (hasSingle && (mesh.role === undefined || mesh.material === undefined)) {
    issues.push({ path, message: `${mesh.node}: role과 material은 함께 선언해야 합니다.` });
    return issues;
  }
  if (hasPrimitive && (mesh.primitiveRoles === undefined || mesh.primitiveMaterials === undefined || mesh.primitiveRoles.length !== mesh.primitiveMaterials.length)) {
    issues.push({ path, message: `${mesh.node}: primitiveRoles와 primitiveMaterials는 같은 길이로 함께 선언해야 합니다.` });
    return issues;
  }
  if (mesh.node.endsWith(OUTLINE_MESH_SUFFIX)) {
    issues.push({ path: [...path, "node"], message: `${mesh.node}: _Outline 셸 메시는 키트 v1에서 금지입니다(엔진 hull 외곽선과 이중 렌더, kit-outline-shell-forbidden).` });
  }
  if (new Set(mesh.morphs).size !== mesh.morphs.length) {
    issues.push({ path: [...path, "morphs"], message: `${mesh.node}: morph 이름이 중복되었습니다.` });
  }
  const have = new Set(mesh.morphs);
  const missing = new Set<string>();
  for (const role of meshRoles(mesh)) {
    for (const name of KIT_MORPH_COVERAGE[role]) if (!have.has(name)) missing.add(name);
  }
  if (missing.size > 0) {
    issues.push({
      path: [...path, "morphs"],
      message: `${mesh.node}: 필수 morph ${missing.size}개가 없습니다(역할 ${meshRoles(mesh).join("/")}): ${listFew([...missing])}`,
    });
  }
  return issues;
}

/** 한 GLB 안의 메시들: 노드 이름 유일, 재질 선언 존재·역할 일치, 한 역할에 재질 하나 */
function fileMeshIssues(
  meshes: readonly KitMesh[],
  materials: ManifestShape["materials"],
  path: ReadonlyArray<string | number>,
): KitIssue[] {
  const issues: KitIssue[] = [];
  const nodes = new Set<string>();
  const materialOfRole = new Map<PartRole, string>();
  meshes.forEach((mesh, index) => {
    const meshPath = [...path, index];
    issues.push(...singleMeshIssues(mesh, meshPath));
    if (nodes.has(mesh.node)) issues.push({ path: meshPath, message: `${mesh.node}: 메시 노드 이름이 중복되었습니다.` });
    nodes.add(mesh.node);
    const roles = meshRoles(mesh);
    const mats = meshMaterials(mesh);
    roles.forEach((role, i) => {
      const material = mats[i];
      if (material === undefined) return;
      const declared = materials[material];
      if (declared === undefined) {
        issues.push({ path: meshPath, message: `${mesh.node}: 재질 '${material}'이 materials에 선언되지 않았습니다.` });
      } else if (declared.role !== role) {
        issues.push({ path: meshPath, message: `${mesh.node}: 재질 '${material}'의 역할(${declared.role})이 메시 역할(${role})과 다릅니다.` });
      }
      const previous = materialOfRole.get(role);
      if (previous !== undefined && previous !== material) {
        issues.push({ path: meshPath, message: `${mesh.node}: 역할 ${role}에 재질이 둘 이상입니다('${previous}', '${material}', kit-material-multiple).` });
      }
      materialOfRole.set(role, material);
    });
  });
  return issues;
}

function baseIssues(baseId: KitBaseId, base: KitBase, materials: ManifestShape["materials"]): KitIssue[] {
  const path: Array<string | number> = ["bases", baseId];
  const issues = fileMeshIssues(base.meshes, materials, [...path, "meshes"]);
  if (base.file.bytes > KIT_BUDGET.baseGlbMaxBytes) {
    issues.push({ path: [...path, "file", "bytes"], message: `베이스 GLB(${base.file.bytes} B)가 한도 ${KIT_BUDGET.baseGlbMaxBytes} B를 넘습니다.` });
  }
  const byNode = new Map(base.meshes.map((mesh) => [mesh.node, mesh] as const));
  const specNodes = new Set(KIT_BASE_MESH_SPECS.map((spec) => spec.node));
  for (const spec of KIT_BASE_MESH_SPECS) {
    const mesh = byNode.get(spec.node);
    if (mesh === undefined) {
      issues.push({ path: [...path, "meshes"], message: `베이스 메시 ${spec.node}가 선언되지 않았습니다(kit-mesh-missing).` });
      continue;
    }
    if (stableStringify([mesh.role, mesh.material, mesh.primitiveRoles, mesh.primitiveMaterials]) !== stableStringify([spec.role, spec.material, spec.primitiveRoles, spec.primitiveMaterials])) {
      issues.push({ path: [...path, "meshes"], message: `${spec.node}: 역할·재질이 계약(${stableStringify([spec.role ?? spec.primitiveRoles, spec.material ?? spec.primitiveMaterials])})과 다릅니다.` });
    }
  }
  for (const mesh of base.meshes) {
    if (!specNodes.has(mesh.node)) issues.push({ path: [...path, "meshes"], message: `${mesh.node}: 계약에 없는 베이스 메시입니다(kit-mesh-undeclared).` });
  }

  // 영역 범위: TS_Body 인덱스 버퍼를 빈틈·겹침 없이 분할하는 15개
  const ranges = base.bodyRegions;
  const ids = ranges.map((range) => range.id);
  if (new Set(ids).size !== ids.length || ids.length !== KIT_HIDEABLE_REGION_IDS.length) {
    issues.push({ path: [...path, "bodyRegions"], message: `bodyRegions는 숨길 수 있는 영역 ${KIT_HIDEABLE_REGION_IDS.length}개를 정확히 한 번씩 담아야 합니다(현재 ${ids.length}개).` });
  }
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.mesh !== KIT_BODY_NODE) issues.push({ path: [...path, "bodyRegions", index, "mesh"], message: `영역 ${range.id}의 mesh는 ${KIT_BODY_NODE}여야 합니다.` });
    if (range.indexStart !== cursor || range.indexCount % 3 !== 0) {
      issues.push({
        path: [...path, "bodyRegions", index],
        message: `영역 ${range.id}의 인덱스 범위가 빈틈·겹침 없이 이어지는 3의 배수가 아닙니다(kit-region-range-invalid): 기대 시작 ${cursor}, 실제 ${range.indexStart}+${range.indexCount}.`,
      });
    }
    cursor = range.indexStart + range.indexCount;
  });
  const body = byNode.get(KIT_BODY_NODE);
  if (body !== undefined && ranges.length > 0 && cursor !== body.triangles * 3) {
    issues.push({ path: [...path, "bodyRegions"], message: `영역 범위의 합(${cursor})이 ${KIT_BODY_NODE} 인덱스 수(${body.triangles * 3})와 다릅니다(kit-region-range-invalid).` });
  }
  const [min, max] = [base.boundsM.min, base.boundsM.max];
  if (min.some((value, axis) => value > (max[axis] ?? Number.NEGATIVE_INFINITY))) {
    issues.push({ path: [...path, "boundsM"], message: "boundsM.min이 max보다 큽니다." });
  }
  return issues;
}

const GARMENT_NODE_PREFIX = { top: "TS_Top", bottom: "TS_Bottom", shoes: "TS_Shoes", accessory: "TS_Accessory" } as const;

/** 슬롯·이름에 따른 파츠 메시 노드 이름 규칙 */
function expectedNodeIssues(slot: KitPartSlot, name: string, meshes: readonly KitMesh[], path: ReadonlyArray<string | number>): KitIssue[] {
  const issues: KitIssue[] = [];
  const bad = (mesh: KitMesh, expected: string): void => {
    issues.push({ path, message: `${mesh.node}: 메시 이름은 ${expected} 형식이어야 합니다(슬롯 ${slot}, 프리셋 ${name}).` });
  };
  switch (slot) {
    case "hair": {
      for (const mesh of meshes) {
        const match = AUTHORED_HAIR_MESH_PATTERN.exec(mesh.node);
        const style = match?.groups?.style;
        const lod = match?.groups?.lod;
        if (style !== name || lod === undefined) {
          bad(mesh, `TS_AuthoredHair_${name}_LOD<n>`);
        } else if (mesh.lod !== Number.parseInt(lod, 10)) {
          issues.push({ path, message: `${mesh.node}: lod 필드(${String(mesh.lod)})가 이름의 LOD(${lod})와 다릅니다.` });
        }
      }
      const lods = new Set(meshes.map((mesh) => mesh.lod));
      if (!lods.has(0)) issues.push({ path, message: `헤어 ${name}: LOD0 메시가 없습니다.` });
      break;
    }
    case "top":
    case "bottom":
    case "shoes":
    case "accessory": {
      const expected = `${GARMENT_NODE_PREFIX[slot]}_${name}`;
      for (const mesh of meshes) if (mesh.node !== expected) bad(mesh, expected);
      break;
    }
    case "irises": {
      const pattern: Readonly<Record<string, string>> = { iris: "TS_Iris", "eye-highlight": "TS_Highlight", pupil: "TS_Pupil" };
      for (const mesh of meshes) {
        const prefix = mesh.role === undefined ? undefined : pattern[mesh.role];
        if (prefix === undefined || (mesh.node !== `${prefix}_L` && mesh.node !== `${prefix}_R`)) bad(mesh, "TS_Iris_L/R(iris), TS_Highlight_L/R(eye-highlight), TS_Pupil_L/R(pupil)");
      }
      for (const role of KIT_PART_SLOT_ROLES.irises) {
        const nodes = meshes.filter((mesh) => mesh.role === role).map((mesh) => mesh.node);
        if (nodes.length !== 0 && nodes.length !== 2) issues.push({ path, message: `홍채 파츠 ${name}: 역할 ${role}는 좌/우 메시 2개여야 합니다(현재 ${nodes.length}개).` });
      }
      break;
    }
  }
  return issues;
}

function partIssues(part: KitPart, index: number, baseIds: readonly KitBaseId[], materials: ManifestShape["materials"]): KitIssue[] {
  const path: Array<string | number> = ["parts", index];
  const issues: KitIssue[] = [];
  const slash = part.id.indexOf("/");
  const idSlot = part.id.slice(0, slash);
  const name = part.id.slice(slash + 1);
  if (idSlot !== part.slot) issues.push({ path: [...path, "id"], message: `파츠 id(${part.id})의 슬롯이 slot(${part.slot})과 다릅니다.` });
  const vocabulary: readonly string[] = SLOT_PRESET_IDS[part.slot];
  if (!vocabulary.includes(name)) {
    issues.push({ path: [...path, "id"], message: `파츠 id(${part.id})가 프리셋 어휘 SLOT_PRESET_IDS.${part.slot} 안에 없습니다(어휘를 늘리지 않는다).` });
  }
  for (const baseId of KIT_BASE_IDS) {
    const variant = part.variants[baseId];
    const reason = part.unavailable[baseId];
    if (!baseIds.includes(baseId)) {
      if (variant !== undefined) issues.push({ path: [...path, "variants", baseId], message: `${part.id}: bases에 없는 베이스(${baseId})의 변형입니다.` });
      continue;
    }
    if (variant !== undefined && reason !== undefined) {
      issues.push({ path: [...path, "unavailable", baseId], message: `${part.id}: ${baseId} 변형이 있으면서 미제공 사유도 선언되었습니다.` });
    }
    if (variant === undefined && (reason === undefined || reason.trim().length === 0 || !HANGUL.test(reason))) {
      issues.push({ path: [...path, "variants", baseId], message: `${part.id}: ${baseId} 변형이 없으면 unavailable.${baseId}에 한글 사유가 필요합니다.` });
    }
    if (variant === undefined) continue;
    const variantPath = [...path, "variants", baseId];
    issues.push(...fileMeshIssues(variant.meshes, materials, [...variantPath, "meshes"]));
    issues.push(...expectedNodeIssues(part.slot, name, variant.meshes, [...variantPath, "meshes"]));
    if (variant.file.bytes > KIT_BUDGET.partGlbMaxBytes) {
      issues.push({ path: [...variantPath, "file", "bytes"], message: `${part.id}: 파츠 GLB(${variant.file.bytes} B)가 한도 ${KIT_BUDGET.partGlbMaxBytes} B를 넘습니다.` });
    }
    const allowed: readonly PartRole[] = KIT_PART_SLOT_ROLES[part.slot];
    const present = new Set(variant.meshes.flatMap((mesh) => meshRoles(mesh)));
    for (const role of present) {
      if (!allowed.includes(role)) issues.push({ path: [...variantPath, "meshes"], message: `${part.id}: 슬롯 ${part.slot}에 허용되지 않는 역할 ${role}입니다(허용: ${allowed.join(", ")}).` });
    }
    for (const role of KIT_PART_SLOT_REQUIRED_ROLES[part.slot]) {
      if (!present.has(role)) issues.push({ path: [...variantPath, "meshes"], message: `${part.id}: 필수 역할 ${role} 메시가 없습니다.` });
    }
    if ((part.slot === "hair" || part.slot === "irises") && variant.hides.length > 0) {
      issues.push({ path: [...variantPath, "hides"], message: `${part.id}: 슬롯 ${part.slot}은 몸 영역을 숨길 수 없습니다.` });
    }
    if (new Set(variant.hides).size !== variant.hides.length) issues.push({ path: [...variantPath, "hides"], message: `${part.id}: hides가 중복되었습니다.` });
  }
  return issues;
}

function skeletonIssues(manifest: ManifestShape): KitIssue[] {
  const issues: KitIssue[] = [];
  const { joints, parents, boneMap, endBones } = manifest.skeleton;
  const path = ["skeleton"];
  const expected = new Set(KIT_SKELETON_JOINTS);
  const given = new Set(joints);
  if (joints.length !== KIT_JOINT_COUNT || given.size !== joints.length) {
    issues.push({ path: [...path, "joints"], message: `joint는 중복 없이 정확히 ${KIT_JOINT_COUNT}개여야 합니다(현재 ${joints.length}개, 고유 ${given.size}개).` });
  }
  const missing = KIT_SKELETON_JOINTS.filter((name) => !given.has(name));
  const extra = joints.filter((name) => !expected.has(name));
  if (missing.length > 0 || extra.length > 0) {
    issues.push({ path: [...path, "joints"], message: `joint 이름 집합이 계약과 다릅니다. 없음: [${listFew(missing, 5)}], 여분: [${listFew(extra, 5)}]` });
  }
  if (stableStringify(parents) !== stableStringify(KIT_SKELETON_PARENTS)) {
    issues.push({ path: [...path, "parents"], message: "부모 관계가 계약(KIT_SKELETON_PARENTS)과 다릅니다." });
  }
  // 상수 KIT_BONE_MAP·KIT_SKELETON_PARENTS가 VRM 계약 부모 관계와 맞는지는 character-kit.test.ts가 고정한다.
  if (stableStringify(boneMap) !== stableStringify(KIT_BONE_MAP)) {
    issues.push({ path: [...path, "boneMap"], message: "boneMap이 계약(KIT_BONE_MAP, 55본)과 다릅니다. TS_Jaw → jaw, TS_Eye.L/R → leftEye/rightEye 포함 명시 매핑이 필요합니다." });
  }
  if (stableStringify([...endBones].sort()) !== stableStringify([...KIT_END_BONES].sort())) {
    issues.push({ path: [...path, "endBones"], message: "endBones가 계약의 끝 본 13개와 다릅니다." });
  }
  return issues;
}

function manifestIssues(manifest: ManifestShape): KitIssue[] {
  const issues: KitIssue[] = [...skeletonIssues(manifest)];

  // 재질 틴트 규칙
  for (const [name, material] of Object.entries(manifest.materials)) {
    const rule = KIT_ROLE_TINT_RULES[material.role];
    if (rule === undefined) continue;
    if (rule.mode !== material.tint.mode || (rule.mode === "recolor" && material.tint.mode === "recolor" && rule.colorKey !== material.tint.colorKey)) {
      issues.push({
        path: ["materials", name, "tint"],
        message: `재질 ${name}(역할 ${material.role})의 틴트는 ${rule.mode === "recolor" ? `recolor/${rule.colorKey}` : "fixed"}여야 합니다.`,
      });
    }
  }

  // provenance: 내려받은 소스는 https URL + zip SHA-256, 변경 내용은 한글
  manifest.provenance.sources.forEach((source, index) => {
    const path = ["provenance", "sources", index];
    if (source.license !== "original") {
      if (source.url === undefined || !source.url.startsWith("https://")) issues.push({ path: [...path, "url"], message: `${source.id}: 내려받은 소스는 https URL이 필요합니다.` });
      if (source.zipSha256 === undefined) issues.push({ path: [...path, "zipSha256"], message: `${source.id}: 내려받은 소스는 zipSha256이 필요합니다.` });
    }
    if (!HANGUL.test(source.changesKo)) issues.push({ path: [...path, "changesKo"], message: `${source.id}: changesKo에 한글 변경 내용이 필요합니다.` });
  });

  // 관절 오프셋: 키는 morph 어휘, 본은 joint, 크기 상한
  for (const [morph, table] of Object.entries(manifest.jointOffsets)) {
    if (!isMorphTargetName(morph)) issues.push({ path: ["jointOffsets", morph], message: `관절 오프셋 키 ${morph}가 morph 어휘에 없습니다.` });
    for (const [joint, offset] of Object.entries(table)) {
      if (!KIT_SKELETON_JOINTS.includes(joint)) issues.push({ path: ["jointOffsets", morph, joint], message: `관절 오프셋의 본 ${joint}가 skeleton.joints에 없습니다.` });
      if (Math.hypot(offset[0], offset[1], offset[2]) > KIT_BUDGET.maxJointOffsetM) {
        issues.push({ path: ["jointOffsets", morph, joint], message: `관절 오프셋 크기가 ${KIT_BUDGET.maxJointOffsetM} m를 넘습니다.` });
      }
    }
  }

  const baseIds = KIT_BASE_IDS.filter((id) => manifest.bases[id] !== undefined);
  if (manifest.bases.female === undefined) issues.push({ path: ["bases", "female"], message: "여성 베이스(female)는 필수입니다(기본 베이스)." });
  if (manifest.defaults.base !== KIT_DEFAULT_BASE_ID || !baseIds.includes(manifest.defaults.base)) {
    issues.push({ path: ["defaults", "base"], message: `defaults.base는 ${KIT_DEFAULT_BASE_ID}이고 bases에 있어야 합니다.` });
  }
  for (const baseId of baseIds) {
    const base = manifest.bases[baseId];
    if (base !== undefined) issues.push(...baseIssues(baseId, base, manifest.materials));
    if (manifest.slotCapabilities[baseId] === undefined) issues.push({ path: ["slotCapabilities", baseId], message: `slotCapabilities.${baseId} 선언이 없습니다.` });
  }
  for (const baseId of KIT_BASE_IDS) {
    if (!baseIds.includes(baseId) && manifest.slotCapabilities[baseId] !== undefined) {
      issues.push({ path: ["slotCapabilities", baseId], message: `bases에 없는 베이스(${baseId})의 slotCapabilities입니다.` });
    }
  }

  // 파츠: 개별 규칙, id 유일, 어휘 전체 커버리지, 필수 파츠
  const seen = new Set<string>();
  manifest.parts.forEach((part, index) => {
    if (seen.has(part.id)) issues.push({ path: ["parts", index, "id"], message: `파츠 id가 중복되었습니다: ${part.id}` });
    seen.add(part.id);
    issues.push(...partIssues(part, index, baseIds, manifest.materials));
  });
  for (const slot of KIT_PART_SLOTS) {
    for (const name of SLOT_PRESET_IDS[slot]) {
      if (!seen.has(`${slot}/${name}`)) issues.push({ path: ["parts"], message: `어휘의 프리셋 ${slot}/${name}가 parts에 없습니다(변형이 없으면 unavailable 사유로 선언).` });
    }
  }
  for (const baseId of baseIds) {
    for (const id of KIT_REQUIRED_PRESETS) {
      const part = manifest.parts.find((candidate) => candidate.id === id);
      if (part?.variants[baseId] === undefined) issues.push({ path: ["parts"], message: `필수 파츠 ${id}의 ${baseId} 변형이 없습니다(kit-part-missing).` });
    }
  }

  // 파일 용량 합계(고유 파일)
  const uniqueFiles = new Map<string, number>();
  for (const baseId of baseIds) {
    const base = manifest.bases[baseId];
    if (base !== undefined) uniqueFiles.set(base.file.path, base.file.bytes);
  }
  for (const part of manifest.parts) {
    for (const baseId of baseIds) {
      const variant = part.variants[baseId];
      if (variant !== undefined) uniqueFiles.set(variant.file.path, variant.file.bytes);
    }
  }
  let total = 0;
  for (const bytes of uniqueFiles.values()) total += bytes;
  if (total > KIT_BUDGET.totalMaxBytes) issues.push({ path: ["bases"], message: `키트 고유 파일 합계(${total} B)가 한도 ${KIT_BUDGET.totalMaxBytes} B를 넘습니다.` });
  const lowerPaths = new Map<string, string>();
  for (const filePath of uniqueFiles.keys()) {
    const key = filePath.toLowerCase();
    const previous = lowerPaths.get(key);
    if (previous !== undefined) issues.push({ path: ["parts"], message: `대소문자만 다른 중복 경로입니다: ${previous}, ${filePath}` });
    lowerPaths.set(key, filePath);
  }
  return issues;
}

export const kitManifestSchema = kitManifestObjectSchema.superRefine((manifest, ctx) => {
  for (const issue of manifestIssues(manifest)) ctx.addIssue({ code: "custom", message: issue.message, path: [...issue.path] });
});

export type KitManifest = z.infer<typeof kitManifestSchema>;

export type ParseKitManifestResult = { readonly ok: true; readonly manifest: KitManifest } | { readonly ok: false; readonly failure: LabFailure };

/** `kit.json`을 파싱한다. 실패는 `kit-manifest-invalid`(첫 5개 이슈를 한글 사유에 포함). */
export function parseKitManifest(json: unknown, now?: number): ParseKitManifestResult {
  const result = kitManifestSchema.safeParse(json);
  if (!result.success) {
    const summary = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, failure: failVisible("kit-manifest-invalid", `키트 manifest 형식이 올바르지 않습니다: ${summary}`, undefined, now) };
  }
  return { ok: true, manifest: result.data };
}

// ---------------------------------------------------------------- 런타임 계획

/** 한 GLB(베이스 또는 파츠)의 로드 계획. `plan.parts[0]`은 항상 베이스다. */
export interface KitPartPlan {
  /** 베이스는 `base/<baseId>`, 파츠는 프리셋 id */
  readonly id: string;
  readonly kind: "base" | "part";
  /** 파츠 슬롯(베이스는 null) */
  readonly slot: KitPartSlot | null;
  readonly url: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly meshes: readonly KitMesh[];
  /** 몸에서 숨길 영역(베이스는 빈 배열) */
  readonly hides: readonly KitHideableRegionId[];
}

export interface KitPlan {
  readonly kitId: string;
  readonly kitVersion: number;
  readonly baseId: KitBaseId;
  readonly skeleton: KitSkeleton;
  /** [0] = 베이스, 이후 선택된 파츠(슬롯 순서) */
  readonly parts: readonly KitPartPlan[];
  /** 엔진에 등록될 morph 이름 합집합(결정적 순서) */
  readonly morphNames: readonly string[];
  readonly jointOffsets: KitJointOffsets;
  readonly bodyRegions: readonly KitRegionRange[];
  readonly capabilities: SlotCapabilityMap;
  /** 헤어 LOD 선택 정책(썸네일 임시 리그는 1) */
  readonly hairLodPolicy: { readonly preferredLod: number };
  readonly licenseNote: string;
  readonly materials: Readonly<Record<string, KitMaterial>>;
}

/**
 * 키트 지오메트리 재생성 키. 같은 키면 같은 파츠 집합이다(색·morph·포즈는 포함하지 않는다 → 플랜 재적용만).
 * 소스가 키트가 아니면 베이스 자리는 `-`다(호출자는 키트 소스일 때만 쓴다).
 */
export function kitGeometryKey(recipe: Pick<CharacterRecipe, "source" | "slots">): string {
  const base = recipe.source.kind === "kit" ? recipe.source.baseId : "-";
  const slots = KIT_PART_SLOTS.map((slot) => `${slot}=${recipe.slots[slot] ?? "-"}`).join(";");
  return `base=${base};${slots}`;
}
