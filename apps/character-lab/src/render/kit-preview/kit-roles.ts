/**
 * 키트 규약 표(순수): 68 관절 이름·휴머노이드 본 매핑, 메시 이름 → 파츠 역할, 다중 프리미티브 분할 규칙.
 *
 * 앱의 `domains/authored`(본·메시 이름 추정)는 `render/**`에서 import할 수 없어(아키텍처 경계) 키트 계약 §3.3·§3.4·§3.5가
 * 정한 **명시 규약**만 여기 옮긴다 — 추정 휴리스틱은 키트 이름이 아닌(레거시 Orion 등) 메시를 위한 보조일 뿐이며,
 * 어느 규칙으로 정했는지(`source`)를 항상 함께 돌려줘 무음 추정을 피한다.
 */
import { isPartRole } from "../../contracts";

import type { HumanoidBoneName, PartRole } from "../../contracts";

// ---------------------------------------------------------------- 스켈레톤

const MIXAMO_PREFIX = "mixamorig:";

const MIXAMO_CENTER: ReadonlyArray<readonly [string, HumanoidBoneName | null]> = [
  ["Hips", "hips"],
  ["Spine", "spine"],
  ["Spine1", "chest"],
  ["Spine2", "upperChest"],
  ["Neck", "neck"],
  ["Head", "head"],
  ["HeadTop_End", null],
];

const FINGERS: ReadonlyArray<readonly [string, string]> = [
  ["Thumb", "Thumb"],
  ["Index", "Index"],
  ["Middle", "Middle"],
  ["Ring", "Ring"],
  ["Pinky", "Little"],
];

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 좌/우 한쪽의 Mixamo 관절 29개와 휴머노이드 이름 */
function mixamoSide(side: "Left" | "Right"): Array<readonly [string, HumanoidBoneName | null]> {
  const lower = side.toLowerCase();
  const entries: Array<readonly [string, HumanoidBoneName | null]> = [
    [`${side}Shoulder`, `${lower}Shoulder` as HumanoidBoneName],
    [`${side}Arm`, `${lower}UpperArm` as HumanoidBoneName],
    [`${side}ForeArm`, `${lower}LowerArm` as HumanoidBoneName],
    [`${side}Hand`, `${lower}Hand` as HumanoidBoneName],
  ];
  for (const [mixamo, vrm] of FINGERS) {
    for (let joint = 1; joint <= 4; joint += 1) {
      const name = `${side}Hand${mixamo}${joint}`;
      if (joint === 4) {
        entries.push([name, null]);
      } else if (vrm === "Thumb") {
        const suffix = ["Metacarpal", "Proximal", "Distal"][joint - 1] ?? "";
        entries.push([name, `${lower}Thumb${suffix}` as HumanoidBoneName]);
      } else {
        const suffix = ["Proximal", "Intermediate", "Distal"][joint - 1] ?? "";
        entries.push([name, `${lower}${capitalize(vrm)}${suffix}` as HumanoidBoneName]);
      }
    }
  }
  entries.push([`${side}UpLeg`, `${lower}UpperLeg` as HumanoidBoneName]);
  entries.push([`${side}Leg`, `${lower}LowerLeg` as HumanoidBoneName]);
  entries.push([`${side}Foot`, `${lower}Foot` as HumanoidBoneName]);
  entries.push([`${side}ToeBase`, `${lower}Toes` as HumanoidBoneName]);
  entries.push([`${side}Toe_End`, null]);
  return entries;
}

const MIXAMO_ENTRIES: ReadonlyArray<readonly [string, HumanoidBoneName | null]> = [...MIXAMO_CENTER, ...mixamoSide("Left"), ...mixamoSide("Right")];

/** 키트 스켈레톤의 나머지 3관절(계약 §3.3): 턱·눈 */
const KIT_EXTRA_ENTRIES: ReadonlyArray<readonly [string, HumanoidBoneName]> = [
  ["TS_Jaw", "jaw"],
  ["TS_Eye.L", "leftEye"],
  ["TS_Eye.R", "rightEye"],
];

/** 키트 68 관절 이름(Mixamo 65 + 턱·눈 2…3). 순서는 계약 표기 순이며 *집합 비교*에만 쓴다. */
export const KIT_JOINT_NAMES: readonly string[] = [...MIXAMO_ENTRIES.map(([name]) => `${MIXAMO_PREFIX}${name}`), ...KIT_EXTRA_ENTRIES.map(([name]) => name)];

/** 매핑하지 않는 끝 본 13개(의도된 미매핑) */
export const KIT_END_BONE_NAMES: readonly string[] = MIXAMO_ENTRIES.filter(([, vrm]) => vrm === null).map(([name]) => `${MIXAMO_PREFIX}${name}`);

/** 키트 관절 이름 → 휴머노이드 본(정확히 55개) */
export const KIT_BONE_MAP: Readonly<Record<string, HumanoidBoneName>> = Object.fromEntries([
  ...MIXAMO_ENTRIES.flatMap(([name, vrm]) => (vrm === null ? [] : [[`${MIXAMO_PREFIX}${name}`, vrm] as const])),
  ...KIT_EXTRA_ENTRIES.map(([name, vrm]) => [name, vrm] as const),
]);

/** 레거시(Orion) 눈 본 별칭. 키트는 `TS_Eye.L/R`을 쓴다. */
const LEGACY_BONE_ALIASES: Readonly<Record<string, HumanoidBoneName>> = {
  "TS_OrionEye.L": "leftEye",
  "TS_OrionEye.R": "rightEye",
};

export interface BoneMapResult {
  /** 노드 이름 → 휴머노이드 본 */
  readonly boneMap: Readonly<Record<string, HumanoidBoneName>>;
  /** 매핑하지 못한 관절(끝 본 등) */
  readonly unmapped: readonly string[];
  /** 같은 휴머노이드 본에 둘 이상 매핑된 경우(첫 번째만 쓴다) */
  readonly duplicates: readonly string[];
}

/** `mixamorig1:Hips` 같은 변형 접두를 `mixamorig:`로 맞춘다. */
export function canonicalJointName(name: string): string {
  return name.replace(/^mixamorig\d*:/u, MIXAMO_PREFIX);
}

/** skin.joints 이름 목록에서 앱 플랜의 `boneMap`을 만든다(키트·Mixamo·Orion 눈 별칭). */
export function buildBoneMap(jointNames: readonly string[]): BoneMapResult {
  const boneMap: Record<string, HumanoidBoneName> = {};
  const unmapped: string[] = [];
  const duplicates: string[] = [];
  const claimed = new Set<HumanoidBoneName>();
  for (const name of jointNames) {
    const humanoid = KIT_BONE_MAP[canonicalJointName(name)] ?? LEGACY_BONE_ALIASES[name];
    if (!humanoid) {
      unmapped.push(name);
    } else if (claimed.has(humanoid)) {
      duplicates.push(name);
    } else {
      claimed.add(humanoid);
      boneMap[name] = humanoid;
    }
  }
  return { boneMap, unmapped, duplicates };
}

export interface KitSkeletonComparison {
  /** 이름 집합이 키트 68관절과 정확히 같은지 */
  readonly exact: boolean;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  /** 키트 관절이 절반 이상이면 키트 스켈레톤으로 본다(레거시와 구분) */
  readonly looksLikeKit: boolean;
}

export function compareSkeletonToKit(jointNames: readonly string[]): KitSkeletonComparison {
  const canonical = new Set(jointNames.map(canonicalJointName));
  const kit = new Set(KIT_JOINT_NAMES);
  const missing = KIT_JOINT_NAMES.filter((name) => !canonical.has(name));
  const extra = jointNames.filter((name) => !kit.has(canonicalJointName(name)));
  return { exact: missing.length === 0 && extra.length === 0 && jointNames.length === KIT_JOINT_NAMES.length, missing, extra, looksLikeKit: KIT_JOINT_NAMES.length - missing.length >= KIT_JOINT_NAMES.length / 2 };
}

// ---------------------------------------------------------------- 메시 역할

/** 키트에서 새로 생기는 `underwear` 역할. 계약(`PART_ROLES`)에 아직 없으면 천 재질의 `bottom`으로 대신 그린다(문서화된 한계). */
const UNDERWEAR_CANDIDATE: string = "underwear";
export const UNDERWEAR_ROLE: PartRole = isPartRole(UNDERWEAR_CANDIDATE) ? UNDERWEAR_CANDIDATE : "bottom";
/** 계약에 underwear 역할이 아직 없어 다른 역할로 대신 그리는지 */
export const UNDERWEAR_IS_SUBSTITUTED = UNDERWEAR_ROLE !== UNDERWEAR_CANDIDATE;

export type RoleSource = "override" | "kit-name" | "legacy-name" | "fallback";
/** recolor = 텍스처에 틴트를 곱함, fixed = 고정색(틴트 무시), legacy = 앱 기본 동작(키트 규약 밖) */
export type TintMode = "recolor" | "fixed" | "legacy";

export interface ResolvedRole {
  readonly role: PartRole;
  readonly source: RoleSource;
  readonly tint: TintMode;
}

interface KitNameRule {
  readonly pattern: RegExp;
  readonly role: PartRole;
  readonly tint: Exclude<TintMode, "legacy">;
}

const KIT_NAME_RULES: readonly KitNameRule[] = [
  { pattern: /^TS_Body$/u, role: "skin", tint: "recolor" },
  { pattern: /^TS_Head$/u, role: "head", tint: "recolor" },
  { pattern: /^TS_Eye_[LR]$/u, role: "eyeball", tint: "fixed" },
  { pattern: /^TS_Iris_[LR]$/u, role: "iris", tint: "recolor" },
  { pattern: /^TS_Pupil_[LR]$/u, role: "pupil", tint: "recolor" },
  // 캐치라이트: 곱셈 틴트로는 낼 수 없어 별도 고정색(흰색) 메시다(리드 결정 A-1)
  { pattern: /^TS_Highlight_[LR]$/u, role: "eye-highlight", tint: "fixed" },
  { pattern: /^TS_Mouth_teeth$/u, role: "teeth", tint: "fixed" },
  { pattern: /^TS_Mouth_tongue$/u, role: "tongue", tint: "fixed" },
  // 프리미티브가 하나뿐이라 쪼개지지 않은 입(치아로 간주, 경고는 병합 단계가 낸다)
  { pattern: /^TS_Mouth$/u, role: "teeth", tint: "fixed" },
  { pattern: /^TS_Lashes$/u, role: "lash", tint: "recolor" },
  { pattern: /^TS_Brow_[LR]$/u, role: "brow", tint: "recolor" },
  { pattern: /^TS_Underwear$/u, role: UNDERWEAR_ROLE, tint: "fixed" },
  { pattern: /^TS_AuthoredHair_[a-z0-9-]+_LOD\d+$/u, role: "hair", tint: "recolor" },
  { pattern: /^TS_Top_[A-Za-z0-9-]+$/u, role: "top", tint: "recolor" },
  { pattern: /^TS_Bottom_[A-Za-z0-9-]+$/u, role: "bottom", tint: "recolor" },
  { pattern: /^TS_Shoes_[A-Za-z0-9-]+$/u, role: "shoes", tint: "recolor" },
  { pattern: /^TS_Accessory_[A-Za-z0-9-]+$/u, role: "accessory", tint: "recolor" },
];

/** 키트 규약 밖 이름(Orion·reference 등)을 위한 부분 문자열 추정. 앞 규칙이 우선한다. */
const LEGACY_RULES: ReadonlyArray<readonly [RegExp, PartRole]> = [
  [/hair/iu, "hair"],
  [/brow/iu, "brow"],
  [/lash/iu, "lash"],
  [/pupil/iu, "pupil"],
  [/iris/iu, "iris"],
  [/eye/iu, "eyeball"],
  [/tongue/iu, "tongue"],
  [/teeth|tooth/iu, "teeth"],
  [/head|face/iu, "head"],
  [/shoe|boot|sneaker/iu, "shoes"],
  [/bottom|pant|skirt|trouser|jean/iu, "bottom"],
  [/top|shirt|jacket|coat|dress|costume|bust|cloth|outfit/iu, "top"],
  [/body|neck|torso|skin|hand|arm|leg/iu, "skin"],
];

/** `_primitive<i>` 분할 접미와 `_Outline` 셸 접미를 뗀 파츠 기준 이름(앱 패키지 로더의 `splitPackageMeshName`과 같은 규칙) */
export function stripMeshSuffix(name: string): string {
  const base = name.replace(/_primitive\d+$/u, "");
  return base.endsWith("_Outline") ? base.slice(0, -"_Outline".length) : base;
}

export function isOutlineShellName(name: string): boolean {
  return name.replace(/_primitive\d+$/u, "").endsWith("_Outline");
}

/** 메시 노드 이름 → 파츠 역할. 우선순위: `--role` 덮어쓰기 > 키트 이름 규칙 > 레거시 추정 > 대체(accessory). */
export function resolveMeshRole(name: string, overrides: Readonly<Record<string, string>> = {}): ResolvedRole {
  const base = stripMeshSuffix(name);
  const forced = overrides[name] ?? overrides[base];
  if (forced !== undefined) {
    const role = forced === UNDERWEAR_CANDIDATE ? UNDERWEAR_ROLE : isPartRole(forced) ? forced : null;
    if (role) return { role, source: "override", tint: "legacy" };
  }
  for (const rule of KIT_NAME_RULES) if (rule.pattern.test(base)) return { role: rule.role, source: "kit-name", tint: rule.tint };
  for (const [pattern, role] of LEGACY_RULES) if (pattern.test(base)) return { role, source: "legacy-name", tint: "legacy" };
  return { role: "accessory", source: "fallback", tint: "legacy" };
}

// ---------------------------------------------------------------- 다중 프리미티브 분할

export interface PrimitiveSplitRule {
  /** 분할 뒤 노드 이름의 접미(`TS_Mouth` + `_teeth`) */
  readonly suffix: string;
}

/**
 * 한 메시가 프리미티브마다 다른 역할을 가질 때의 분할 규칙(계약 §3.4: `TS_Mouth`의 프리미티브 0 = teeth, 1 = tongue).
 * 앱의 패키지 로더는 `_primitive<i>`를 떼어 한 파츠로 묶어 재질 하나로 덮으므로, 병합 단계에서 노드 둘로 쪼갠다.
 */
export const KIT_PRIMITIVE_SPLITS: Readonly<Record<string, readonly PrimitiveSplitRule[]>> = {
  TS_Mouth: [{ suffix: "teeth" }, { suffix: "tongue" }],
};

/** 파츠 파일 안에서 메시 이름이 가질 수 있는 키트 이름 접두(키트 파일인지 판별용) */
export function isKitMeshName(name: string): boolean {
  const base = stripMeshSuffix(name);
  return KIT_NAME_RULES.some((rule) => rule.pattern.test(base));
}
