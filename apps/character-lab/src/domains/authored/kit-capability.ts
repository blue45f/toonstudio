/**
 * 키트 manifest → 15슬롯 능력 판정(SlotCapabilityMap, 사유 한글). docs/authored-kit-spec.md 5절.
 *
 * 판정은 **규칙으로 계산한다**. `kit.json.slotCapabilities`의 선언은 사람이 읽는 증거일 뿐이고 기준은 이 규칙이다
 * (선언과 다르면 로드 흐름이 `kit-capabilities-mismatch`로 실패시킨다: `compareKitCapabilities`).
 *
 * - face-shape/eyes/nose/mouth/ears: 슬롯 축(`KIT_SLOT_AXES`)의 ± morph 쌍이 베이스의 `TS_Head`에 모두 있으면 available,
 *   일부면 partial(없는 축·방향을 한글로), 전혀 없으면 unavailable.
 * - hair/top/bottom/shoes/accessory/irises: 어휘 크기 대비 베이스의 변형 수. 전부 available, 일부 partial(+`unavailablePresets`), 0이면 unavailable.
 * - body: `TS_Body` 체형 18타깃 + 필수 관절 오프셋 + 55본 매핑이 모두 있으면 available, 일부 partial, 전혀 없으면 unavailable.
 * - expression: `TS_Head`의 FACS 16 전부 available, 8~15 partial, 그 미만 unavailable.
 * - pose: 필수 15본, hand-pose: 손가락 30본(`skeleton.boneMap` 기준).
 */
import {
  ALL_FACS_MORPH_NAMES,
  BODY_PARAM_KEYS,
  CHARACTER_SLOT_KINDS,
  FACE_PARAM_LABELS_KO,
  FACS_UNITS,
  FINGER_BONE_NAMES,
  HUMANOID_BONE_NAMES,
  KIT_BASE_IDS,
  KIT_PART_SLOTS,
  KIT_REQUIRED_JOINT_OFFSET_MORPHS,
  KIT_SLOT_AXES,
  REQUIRED_HUMANOID_BONES,
  SLOT_LABELS_KO,
  SLOT_PRESET_IDS,
  allParamMorphNames,
  paramMorphName,
} from "../../contracts";

import { EXPRESSION_AVAILABLE_MIN_UNITS } from "./package-capability";

import type { FaceParamKey, HumanoidBoneName, KitBase, KitBaseId, KitManifest, KitPartSlot, PartRole, SlotCapability, SlotCapabilityMap, SlotKind } from "../../contracts";

type IdentitySlot = "face-shape" | "eyes" | "nose" | "mouth" | "ears";
const IDENTITY_SLOTS: readonly IdentitySlot[] = ["face-shape", "eyes", "nose", "mouth", "ears"];

const BODY_MORPH_NAMES = allParamMorphNames(BODY_PARAM_KEYS);

function available(): SlotCapability {
  return { status: "available" };
}

function partial(reasonKo: string, unavailablePresets?: Readonly<Record<string, string>>): SlotCapability {
  return unavailablePresets === undefined ? { status: "partial", reasonKo } : { status: "partial", reasonKo, unavailablePresets };
}

function unavailable(reasonKo: string): SlotCapability {
  return { status: "unavailable", reasonKo };
}

function listFew(items: readonly string[], max = 4): string {
  return items.length <= max ? items.join(", ") : `${items.slice(0, max).join(", ")} 외 ${items.length - max}개`;
}

/** 베이스 안에서 해당 역할 메시들이 가진 morph 이름의 합집합 */
function morphsOfRole(base: KitBase, role: PartRole): ReadonlySet<string> {
  const names = new Set<string>();
  for (const mesh of base.meshes) {
    if (mesh.role === role || (mesh.primitiveRoles?.includes(role) ?? false)) for (const name of mesh.morphs) names.add(name);
  }
  return names;
}

function judgeIdentitySlot(slot: IdentitySlot, headMorphs: ReadonlySet<string>): SlotCapability {
  const axes = KIT_SLOT_AXES[slot] ?? [];
  const complete: FaceParamKey[] = [];
  const plusOnly: FaceParamKey[] = [];
  const minusOnly: FaceParamKey[] = [];
  const missing: FaceParamKey[] = [];
  for (const axis of axes) {
    const plus = headMorphs.has(paramMorphName(axis, "+"));
    const minus = headMorphs.has(paramMorphName(axis, "-"));
    if (plus && minus) complete.push(axis);
    else if (plus) plusOnly.push(axis);
    else if (minus) minusOnly.push(axis);
    else missing.push(axis);
  }
  const label = (keys: readonly FaceParamKey[]): string => keys.map((key) => `${FACE_PARAM_LABELS_KO[key]}(${key})`).join(", ");
  if (complete.length === axes.length) return available();
  if (complete.length === 0 && plusOnly.length === 0 && minusOnly.length === 0) {
    return unavailable(`키트 머리(TS_Head)에 ${label(missing)} 셰이프 키가 없습니다.`);
  }
  const reasons: string[] = [];
  if (plusOnly.length > 0) reasons.push(`음수 방향 셰이프 키 없음: ${label(plusOnly)}`);
  if (minusOnly.length > 0) reasons.push(`양수 방향 셰이프 키 없음: ${label(minusOnly)}`);
  if (missing.length > 0) reasons.push(`키트 머리(TS_Head)에 ${label(missing)} 셰이프 키가 없습니다(나머지 축만 조절)`);
  return partial(reasons.join("; "));
}

function judgePartSlot(manifest: KitManifest, baseId: KitBaseId, slot: KitPartSlot): SlotCapability {
  const names: readonly string[] = SLOT_PRESET_IDS[slot];
  const partsById = new Map<string, KitManifest["parts"][number]>(manifest.parts.map((part) => [part.id, part]));
  const missingNames: string[] = [];
  const unavailablePresets: Record<string, string> = {};
  for (const name of names) {
    const id = `${slot}/${name}`;
    const part = partsById.get(id);
    if (part?.variants[baseId] !== undefined) continue;
    missingNames.push(name);
    unavailablePresets[id] = part?.unavailable[baseId] ?? `키트가 ${baseId} 베이스용 ${SLOT_LABELS_KO[slot]} 파츠(${name})를 제공하지 않습니다.`;
  }
  const provided = names.length - missingNames.length;
  if (missingNames.length === 0) return available();
  if (provided === 0) return unavailable(`키트가 ${baseId} 베이스용 ${SLOT_LABELS_KO[slot]} 파츠를 제공하지 않습니다(0/${names.length}종).`);
  return partial(`제공 ${provided}/${names.length}종, 미제공: ${missingNames.join(", ")}`, unavailablePresets);
}

function coveredBones(manifest: KitManifest): ReadonlySet<HumanoidBoneName> {
  const joints = new Set(manifest.skeleton.joints);
  const covered = new Set<HumanoidBoneName>();
  for (const [joint, bone] of Object.entries(manifest.skeleton.boneMap)) if (joints.has(joint)) covered.add(bone);
  return covered;
}

function judgeBody(manifest: KitManifest, bodyMorphs: ReadonlySet<string>, bones: ReadonlySet<HumanoidBoneName>): SlotCapability {
  const missingMorphs = BODY_MORPH_NAMES.filter((name) => !bodyMorphs.has(name));
  const missingOffsets = KIT_REQUIRED_JOINT_OFFSET_MORPHS.filter((name) => Object.keys(manifest.jointOffsets[name] ?? {}).length === 0);
  const missingBones = HUMANOID_BONE_NAMES.filter((name) => !bones.has(name));
  if (missingMorphs.length === 0 && missingOffsets.length === 0 && missingBones.length === 0) return available();
  const nothing =
    missingMorphs.length === BODY_MORPH_NAMES.length && missingOffsets.length === KIT_REQUIRED_JOINT_OFFSET_MORPHS.length && missingBones.length === HUMANOID_BONE_NAMES.length;
  if (nothing) return unavailable("키트에 체형 셰이프 키·관절 오프셋·휴머노이드 본이 없습니다.");
  const reasons: string[] = [];
  if (missingMorphs.length > 0) reasons.push(`TS_Body 체형 셰이프 키 ${missingMorphs.length}개 없음: ${listFew(missingMorphs)}`);
  if (missingOffsets.length > 0) reasons.push(`관절 오프셋 ${missingOffsets.length}개 없음: ${listFew(missingOffsets)}`);
  if (missingBones.length > 0) reasons.push(`휴머노이드 본 ${HUMANOID_BONE_NAMES.length - missingBones.length}/${HUMANOID_BONE_NAMES.length}만 매핑됨(없음: ${listFew(missingBones)})`);
  return partial(reasons.join("; "));
}

function judgeExpression(headMorphs: ReadonlySet<string>): SlotCapability {
  const present = ALL_FACS_MORPH_NAMES.filter((name) => headMorphs.has(name));
  const missing = ALL_FACS_MORPH_NAMES.filter((name) => !headMorphs.has(name));
  if (present.length === FACS_UNITS.length) return available();
  if (present.length >= EXPRESSION_AVAILABLE_MIN_UNITS) {
    return partial(`FACS ${FACS_UNITS.length}유닛 중 ${present.length}개만 있습니다(없음: ${listFew(missing.map((name) => name.slice("facs:".length)))}).`);
  }
  if (present.length === 0) return unavailable("키트 머리(TS_Head)에 표정(FACS) 셰이프 키가 없습니다.");
  return unavailable(`키트 머리(TS_Head)의 표정(FACS) 셰이프 키가 ${present.length}/${FACS_UNITS.length}개뿐이라 표정을 제공하지 못합니다(최소 ${EXPRESSION_AVAILABLE_MIN_UNITS}개).`);
}

function judgeBones(universe: readonly HumanoidBoneName[], bones: ReadonlySet<HumanoidBoneName>, noneReason: string, partialLabel: string): SlotCapability {
  const missing = universe.filter((name) => !bones.has(name));
  if (missing.length === 0) return available();
  if (missing.length === universe.length) return unavailable(noneReason);
  return partial(`${partialLabel} ${universe.length - missing.length}/${universe.length}만 매핑됨(없음: ${listFew(missing)}).`);
}

/** 베이스가 manifest에 없을 때(방어) 쓰는 전부 unavailable 능력 맵 */
function missingBaseCapabilities(baseId: KitBaseId): SlotCapabilityMap {
  const entries = CHARACTER_SLOT_KINDS.map((slot) => [slot, unavailable(`키트에 ${baseId} 베이스가 없습니다.`)] as const);
  return Object.freeze(Object.fromEntries(entries) as Record<SlotKind, SlotCapability>);
}

/**
 * 키트 베이스 하나의 15슬롯 능력을 규칙으로 계산한다. 같은 입력은 같은 결과(결정적)이며 사유 문구도 고정이다.
 * 베이스가 없으면 전부 unavailable이다(호출자는 `kit-base-missing`으로 먼저 걸러야 한다).
 */
export function deriveKitCapabilities(manifest: KitManifest, baseId: KitBaseId): SlotCapabilityMap {
  const base = manifest.bases[baseId];
  if (base === undefined) return missingBaseCapabilities(baseId);
  const headMorphs = morphsOfRole(base, "head");
  const bodyMorphs = morphsOfRole(base, "skin");
  const bones = coveredBones(manifest);
  const result: Partial<Record<SlotKind, SlotCapability>> = {};

  for (const slot of IDENTITY_SLOTS) result[slot] = judgeIdentitySlot(slot, headMorphs);
  for (const slot of KIT_PART_SLOTS) result[slot] = judgePartSlot(manifest, baseId, slot);
  result.body = judgeBody(manifest, bodyMorphs, bones);
  result.expression = judgeExpression(headMorphs);
  result.pose = judgeBones(REQUIRED_HUMANOID_BONES, bones, "키트에 휴머노이드 본 매핑이 없습니다(스켈레톤 없음).", "VRM 필수 본");
  result["hand-pose"] = judgeBones(FINGER_BONE_NAMES, bones, "키트에 손가락 본 매핑이 없습니다.", "손가락 본");

  const complete = CHARACTER_SLOT_KINDS.every((slot) => result[slot] !== undefined);
  if (!complete) throw new Error("deriveKitCapabilities: 15슬롯 판정이 비어 있습니다(코드 결함).");
  return Object.freeze(result as Record<SlotKind, SlotCapability>);
}

export interface KitCapabilityDifference {
  /** 슬롯 단위 차이면 슬롯, 선언 전체가 없으면 null */
  readonly slot: SlotKind | null;
  /** 한글 설명(어떤 점이 다른지) */
  readonly reasonKo: string;
}

function sortedKeys(record: Readonly<Record<string, string>> | undefined): string[] {
  return Object.keys(record ?? {}).sort();
}

/**
 * 규칙 판정(derived)과 `kit.json.slotCapabilities` 선언(declared)을 슬롯별로 대조한다.
 * 대조 대상은 `status`와 `unavailablePresets`의 프리셋 id 집합이다. 사유 문구(`reasonKo`)는 사람이 읽는 설명이라 비교하지 않는다
 * (선언 쪽 문장은 Blender/통합 단계가 쓰고 기준은 규칙이기 때문).
 */
export function compareKitCapabilities(derived: SlotCapabilityMap, declared: Readonly<Partial<Record<SlotKind, SlotCapability>>>): readonly KitCapabilityDifference[] {
  const differences: KitCapabilityDifference[] = [];
  for (const slot of CHARACTER_SLOT_KINDS) {
    const rule = derived[slot];
    const given = declared[slot];
    if (given === undefined) {
      differences.push({ slot, reasonKo: `${SLOT_LABELS_KO[slot]}(${slot}): 선언이 없습니다(규칙 판정 ${rule.status}).` });
      continue;
    }
    if (rule.status !== given.status) {
      differences.push({ slot, reasonKo: `${SLOT_LABELS_KO[slot]}(${slot}): 선언 상태 ${given.status}이(가) 규칙 판정 ${rule.status}과 다릅니다.` });
      continue;
    }
    const ruleIds = sortedKeys(rule.unavailablePresets);
    const givenIds = sortedKeys(given.unavailablePresets);
    if (ruleIds.join("|") !== givenIds.join("|")) {
      differences.push({
        slot,
        reasonKo: `${SLOT_LABELS_KO[slot]}(${slot}): 미제공 프리셋 목록이 다릅니다(규칙: [${ruleIds.join(", ")}], 선언: [${givenIds.join(", ")}]).`,
      });
    }
  }
  return differences;
}

/** 베이스별 선언과 규칙 판정이 어긋난 곳을 모두 모은다(manifest에 있는 베이스만). */
export function kitCapabilityDifferences(manifest: KitManifest): ReadonlyMap<KitBaseId, readonly KitCapabilityDifference[]> {
  const result = new Map<KitBaseId, readonly KitCapabilityDifference[]>();
  for (const baseId of KIT_BASE_IDS) {
    if (manifest.bases[baseId] === undefined) continue;
    const declared = manifest.slotCapabilities[baseId];
    const differences: readonly KitCapabilityDifference[] =
      declared === undefined ? [{ slot: null, reasonKo: `slotCapabilities.${baseId} 선언이 없습니다.` }] : compareKitCapabilities(deriveKitCapabilities(manifest, baseId), declared);
    if (differences.length > 0) result.set(baseId, differences);
  }
  return result;
}
