/**
 * Shaper 15슬롯 94프리셋 공용 계약 & 호환성 검증 모델 (`@toonstudio/studio-project-model`).
 *
 * `apps/character-lab`의 동결 어휘(`slots.ts` · `preset-vocabulary.ts` · `appearance-presets.ts`)를
 * 공용 프로젝트 모델 패키지로 정식 승격해 웹 앱·백엔드·Blender 킷·교환 포맷이
 * 앱 경계 침범 없이 동일한 15슬롯 94프리셋 계약을 공유하도록 한다.
 */
import { z } from "zod";

export const SHAPER_CHARACTER_SLOT_KINDS = [
  "face-shape",
  "eyes",
  "irises",
  "nose",
  "mouth",
  "ears",
  "hair",
  "body",
  "top",
  "bottom",
  "shoes",
  "accessory",
  "expression",
  "pose",
  "hand-pose",
] as const;

export type ShaperSlotKind = (typeof SHAPER_CHARACTER_SLOT_KINDS)[number];

export const SHAPER_SLOT_LABELS_KO: Readonly<Record<ShaperSlotKind, string>> = Object.freeze({
  "face-shape": "얼굴형",
  eyes: "눈",
  irises: "눈동자",
  nose: "코",
  mouth: "입",
  ears: "귀",
  hair: "헤어",
  body: "체형",
  top: "상의",
  bottom: "하의",
  shoes: "신발",
  accessory: "액세서리",
  expression: "표정",
  pose: "포즈",
  "hand-pose": "손 포즈",
});

export type ShaperSlotGroup = "identity" | "figure" | "performance";

export const SHAPER_SLOT_GROUPS: Readonly<Record<ShaperSlotGroup, readonly ShaperSlotKind[]>> =
  Object.freeze({
    identity: Object.freeze(["face-shape", "eyes", "irises", "nose", "mouth", "ears"] as const),
    figure: Object.freeze(["hair", "body", "top", "bottom", "shoes", "accessory"] as const),
    performance: Object.freeze(["expression", "pose", "hand-pose"] as const),
  });

export const SHAPER_SLOT_GROUP_LABELS_KO: Readonly<Record<ShaperSlotGroup, string>> = Object.freeze({
  identity: "얼굴",
  figure: "몸·의상",
  performance: "연기",
});

/** 외형 12슬롯(얼굴 6 + 몸·의상 6). */
export const SHAPER_APPEARANCE_SLOT_KINDS: readonly ShaperSlotKind[] = Object.freeze([
  ...SHAPER_SLOT_GROUPS.identity,
  ...SHAPER_SLOT_GROUPS.figure,
]);

/** 15슬롯 94프리셋 동결 어휘. */
export const SHAPER_SLOT_PRESET_IDS = Object.freeze({
  "face-shape": Object.freeze(["oval", "round", "heart", "square", "long", "v-line"] as const),
  eyes: Object.freeze(["almond", "round", "droopy", "upturned", "narrow", "wide"] as const),
  irises: Object.freeze(["round-large", "round-small", "cat", "star-highlight", "soft-gradient"] as const),
  nose: Object.freeze(["small", "button", "straight", "high-bridge", "wide"] as const),
  mouth: Object.freeze(["small", "wide", "full", "thin", "smile-corner"] as const),
  ears: Object.freeze(["standard", "small", "pointed", "large"] as const),
  hair: Object.freeze([
    "short-layered",
    "soft-bob",
    "romance-long",
    "action-pony",
    "hime-cut",
    "wolf-layered",
    "twin-tail",
  ] as const),
  body: Object.freeze(["slim", "standard", "athletic", "curvy", "petite", "tall"] as const),
  top: Object.freeze(["tee", "hoodie", "shirt", "blazer", "sailor"] as const),
  bottom: Object.freeze(["jeans", "shorts", "pleated-skirt", "long-skirt", "slacks"] as const),
  shoes: Object.freeze(["sneakers", "loafers", "boots", "sandals"] as const),
  accessory: Object.freeze(["glasses", "ribbon", "cap", "earrings", "choker", "headphones"] as const),
  expression: Object.freeze([
    "neutral",
    "joy",
    "smile",
    "sad",
    "angry",
    "surprised",
    "wink",
    "pout",
    "laugh",
    "fear",
    "disgust",
    "sleepy",
  ] as const),
  pose: Object.freeze([
    "a-pose",
    "t-pose",
    "idle",
    "wave",
    "point",
    "arms-crossed",
    "hands-on-hips",
    "peace",
    "sit",
    "run",
  ] as const),
  "hand-pose": Object.freeze([
    "relaxed",
    "fist",
    "open",
    "point",
    "peace",
    "thumbs-up",
    "ok",
    "rock",
  ] as const),
}) satisfies Readonly<Record<ShaperSlotKind, readonly string[]>>;

export type ShaperSlotPresetIds = typeof SHAPER_SLOT_PRESET_IDS;
export type ShaperPresetId = `${ShaperSlotKind}/${string}`;

export const SHAPER_TOTAL_SLOT_COUNT = 15;
export const SHAPER_APPEARANCE_PRESET_COUNT = 64;
export const SHAPER_PERFORMANCE_PRESET_COUNT = 30;
export const SHAPER_TOTAL_PRESET_COUNT = 94;

/** Blender kit 및 Shaper 파이프라인이 제작하는 헤어 스타일 7종. */
export const SHAPER_BLENDER_HAIR_STYLE_IDS = SHAPER_SLOT_PRESET_IDS.hair;

/** 슬롯별 최소 프리셋 개수 불변식. */
export const SHAPER_MIN_PRESETS_PER_SLOT: Readonly<Record<ShaperSlotKind, number>> = Object.freeze({
  "face-shape": 4,
  eyes: 4,
  irises: 4,
  nose: 4,
  mouth: 4,
  ears: 4,
  hair: 4,
  body: 4,
  top: 4,
  bottom: 4,
  shoes: 4,
  accessory: 4,
  expression: 12,
  pose: 10,
  "hand-pose": 8,
});

/** 프리셋 간 양방향 충돌 매트릭스(파츠 지오메트리 간섭 규칙). */
export const SHAPER_PRESET_CONFLICTS: Readonly<Record<string, readonly ShaperPresetId[]>> =
  Object.freeze({
    "hair/hime-cut": Object.freeze(["accessory/cap", "accessory/earrings"] as const),
    "hair/twin-tail": Object.freeze(["accessory/cap", "accessory/headphones"] as const),
    "top/hoodie": Object.freeze(["accessory/headphones"] as const),
    "top/sailor": Object.freeze(["accessory/choker"] as const),
    "accessory/cap": Object.freeze(["hair/hime-cut", "hair/twin-tail"] as const),
    "accessory/earrings": Object.freeze(["hair/hime-cut"] as const),
    "accessory/choker": Object.freeze(["top/sailor"] as const),
    "accessory/headphones": Object.freeze(["hair/twin-tail", "top/hoodie"] as const),
  });

export type ShaperSlotCapabilityStatus = "available" | "partial" | "unavailable";

export interface ShaperSlotCapability {
  readonly status: ShaperSlotCapabilityStatus;
  readonly reasonKo?: string;
  readonly unavailablePresets?: Readonly<Record<string, string>>;
}

export type ShaperSlotCapabilityMap = Readonly<Record<ShaperSlotKind, ShaperSlotCapability>>;

const SLOT_KIND_SET: ReadonlySet<string> = new Set(SHAPER_CHARACTER_SLOT_KINDS);

export function isShaperSlotKind(value: string): value is ShaperSlotKind {
  return SLOT_KIND_SET.has(value);
}

export function isShaperPresetId(value: unknown): value is ShaperPresetId {
  if (typeof value !== "string") return false;
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return false;
  const slot = value.slice(0, slash);
  const name = value.slice(slash + 1);
  return isShaperSlotKind(slot) && /^[a-z0-9][a-z0-9-]*$/u.test(name);
}

export function shaperPresetSlot(id: ShaperPresetId): ShaperSlotKind {
  const slot = id.slice(0, id.indexOf("/"));
  if (!isShaperSlotKind(slot)) {
    throw new Error(`프리셋 id의 슬롯이 어휘 밖입니다: ${id}`);
  }
  return slot;
}

export function shaperPresetName(id: ShaperPresetId): string {
  return id.slice(id.indexOf("/") + 1);
}

export function makeShaperPresetId(slot: ShaperSlotKind, name: string): ShaperPresetId {
  return `${slot}/${name}`;
}

export function allShaperVocabularyPresetIds(): readonly ShaperPresetId[] {
  const ids: ShaperPresetId[] = [];
  for (const slot of SHAPER_CHARACTER_SLOT_KINDS) {
    for (const name of SHAPER_SLOT_PRESET_IDS[slot]) {
      ids.push(`${slot}/${name}`);
    }
  }
  return ids;
}

export function isShaperVocabularyPresetId(id: ShaperPresetId): boolean {
  const slash = id.indexOf("/");
  if (slash <= 0) return false;
  const slot = id.slice(0, slash);
  if (!isShaperSlotKind(slot)) return false;
  const name = id.slice(slash + 1);
  return (SHAPER_SLOT_PRESET_IDS[slot] as readonly string[]).includes(name);
}

function buildCapabilityMap(
  status: ShaperSlotCapabilityStatus,
  reasonKo?: string,
): ShaperSlotCapabilityMap {
  const entries = SHAPER_CHARACTER_SLOT_KINDS.map((slot) => [
    slot,
    Object.freeze(reasonKo === undefined ? { status } : { status, reasonKo }),
  ]);
  return Object.freeze(Object.fromEntries(entries) as Record<ShaperSlotKind, ShaperSlotCapability>);
}

export const ALL_AVAILABLE_SHAPER_CAPABILITIES: ShaperSlotCapabilityMap =
  buildCapabilityMap("available");

export const ALL_UNAVAILABLE_SHAPER_CAPABILITIES: ShaperSlotCapabilityMap = buildCapabilityMap(
  "unavailable",
  "캐릭터 소스가 아직 로드되지 않았습니다.",
);

export const shaperSlotKindSchema = z.enum(SHAPER_CHARACTER_SLOT_KINDS);

export const shaperPresetIdSchema = z
  .string()
  .refine((value): value is ShaperPresetId => isShaperPresetId(value), {
    message: "프리셋 id는 '<slot>/<kebab-name>' 형식이어야 합니다.",
  });

export const shaperSlotAssignmentSchema = z.partialRecord(
  shaperSlotKindSchema,
  shaperPresetIdSchema.nullable(),
);

export type ShaperSlotAssignment = Partial<Record<ShaperSlotKind, ShaperPresetId | null>>;

export type ShaperCompatibilityIssueCode =
  | "unknown-slot"
  | "invalid-preset-format"
  | "slot-mismatch"
  | "unknown-vocabulary-preset"
  | "slot-unavailable"
  | "preset-unavailable"
  | "preset-conflict";

export interface ShaperCompatibilityIssue {
  readonly code: ShaperCompatibilityIssueCode;
  readonly slot: string;
  readonly presetId?: string;
  readonly conflictingWith?: ShaperPresetId;
  readonly messageKo: string;
}

export interface ShaperSlotValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ShaperCompatibilityIssue[];
  readonly assignedCount: number;
  readonly conflictPairs: readonly (readonly [ShaperPresetId, ShaperPresetId])[];
}

/**
 * 15슬롯 프리셋 배정의 어휘 정합성·슬롯 일치·소스 역량·파츠 충돌을 전수 검증한다.
 * 미지원 프리셋은 임의의 다른 프리셋으로 대체하지 않고 명시적 이슈로 보고한다(키트 계약 D10).
 */
export function validateShaperSlotAssignment(
  slots: Readonly<Record<string, string | null | undefined>>,
  capabilities: ShaperSlotCapabilityMap = ALL_AVAILABLE_SHAPER_CAPABILITIES,
): ShaperSlotValidationResult {
  const issues: ShaperCompatibilityIssue[] = [];
  const activeBySlot = new Map<ShaperSlotKind, ShaperPresetId>();

  for (const [rawSlot, rawValue] of Object.entries(slots)) {
    if (!isShaperSlotKind(rawSlot)) {
      issues.push({
        code: "unknown-slot",
        slot: rawSlot,
        messageKo: `알 수 없는 Shaper 슬롯 키입니다: ${rawSlot}`,
      });
      continue;
    }
    if (rawValue === null || rawValue === undefined) continue;
    if (!isShaperPresetId(rawValue)) {
      issues.push({
        code: "invalid-preset-format",
        slot: rawSlot,
        presetId: rawValue,
        messageKo: `${SHAPER_SLOT_LABELS_KO[rawSlot]} 슬롯의 프리셋 형식('${rawValue}')이 올바르지 않습니다.`,
      });
      continue;
    }
    const idSlot = shaperPresetSlot(rawValue);
    if (idSlot !== rawSlot) {
      issues.push({
        code: "slot-mismatch",
        slot: rawSlot,
        presetId: rawValue,
        messageKo: `${SHAPER_SLOT_LABELS_KO[rawSlot]} 슬롯에 ${SHAPER_SLOT_LABELS_KO[idSlot]} 프리셋('${rawValue}')을 배정할 수 없습니다.`,
      });
      continue;
    }
    if (!isShaperVocabularyPresetId(rawValue)) {
      issues.push({
        code: "unknown-vocabulary-preset",
        slot: rawSlot,
        presetId: rawValue,
        messageKo: `94프리셋 정본 어휘에 없는 항목입니다: ${rawValue}`,
      });
      continue;
    }

    const cap = capabilities[rawSlot];
    if (cap.status === "unavailable") {
      issues.push({
        code: "slot-unavailable",
        slot: rawSlot,
        presetId: rawValue,
        messageKo: cap.reasonKo ?? `${SHAPER_SLOT_LABELS_KO[rawSlot]} 슬롯을 현재 소스에서 지원하지 않습니다.`,
      });
      continue;
    }
    const presetReason = cap.unavailablePresets?.[rawValue];
    if (presetReason !== undefined) {
      issues.push({
        code: "preset-unavailable",
        slot: rawSlot,
        presetId: rawValue,
        messageKo: presetReason,
      });
      continue;
    }

    activeBySlot.set(rawSlot, rawValue);
  }

  const seenPairs = new Set<string>();
  const conflictPairs: Array<readonly [ShaperPresetId, ShaperPresetId]> = [];
  const activeSet = new Set<ShaperPresetId>(activeBySlot.values());
  for (const [slot, presetId] of activeBySlot.entries()) {
    const conflicts = SHAPER_PRESET_CONFLICTS[presetId] ?? [];
    for (const other of conflicts) {
      if (!activeSet.has(other)) continue;
      const pairKey = [presetId, other].sort().join("|");
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      conflictPairs.push([presetId, other]);
      issues.push({
        code: "preset-conflict",
        slot,
        presetId,
        conflictingWith: other,
        messageKo: `${presetId}와(과) ${other}는 지오메트리 간섭으로 동시에 착용할 수 없습니다.`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    assignedCount: activeBySlot.size,
    conflictPairs,
  };
}

export interface ShaperCompatibilityPlanEntry {
  readonly slot: ShaperSlotKind;
  readonly presetId: ShaperPresetId;
  readonly disposition: "apply" | "unsupported" | "conflicted";
  readonly reasonKo?: string;
}

export interface ShaperSlotCompatibilityPlan {
  readonly entries: readonly ShaperCompatibilityPlanEntry[];
  readonly appliedCount: number;
  readonly unsupportedCount: number;
  readonly conflictedCount: number;
  readonly coverageRatio: number;
  readonly summaryKo: string;
}

/**
 * 소스 캐릭터 슬롯 배정을 대상 백엔드/키트 역량으로 이식할 때의 결정적 호환성 계획을 생성한다.
 * 미지원 슬롯·프리셋은 무음 치환 없이 `unsupported`로 분리한다.
 */
export function planShaperSlotCompatibility(
  sourceSlots: ShaperSlotAssignment,
  targetCapabilities: ShaperSlotCapabilityMap,
): ShaperSlotCompatibilityPlan {
  const entries: ShaperCompatibilityPlanEntry[] = [];
  const candidateIds = new Set<ShaperPresetId>();

  for (const slot of SHAPER_CHARACTER_SLOT_KINDS) {
    const presetId = sourceSlots[slot];
    if (!presetId) continue;
    const cap = targetCapabilities[slot];
    if (!isShaperPresetId(presetId) || !isShaperVocabularyPresetId(presetId)) {
      entries.push({
        slot,
        presetId,
        disposition: "unsupported",
        reasonKo: `정본 94프리셋 어휘 밖 항목입니다: ${presetId}`,
      });
      continue;
    }
    if (cap.status === "unavailable") {
      entries.push({
        slot,
        presetId,
        disposition: "unsupported",
        reasonKo: cap.reasonKo ?? `${SHAPER_SLOT_LABELS_KO[slot]} 슬롯 미지원`,
      });
      continue;
    }
    const presetReason = cap.unavailablePresets?.[presetId];
    if (presetReason !== undefined) {
      entries.push({
        slot,
        presetId,
        disposition: "unsupported",
        reasonKo: presetReason,
      });
      continue;
    }
    candidateIds.add(presetId);
    entries.push({ slot, presetId, disposition: "apply" });
  }

  // 먼저 적용된 슬롯(SHAPER_CHARACTER_SLOT_KINDS 순서)을 유지하고 뒤 슬롯을 conflicted로 표시한다.
  const kept = new Set<ShaperPresetId>();
  const resolved: ShaperCompatibilityPlanEntry[] = entries.map((entry) => {
    if (entry.disposition !== "apply") return entry;
    const conflicts = SHAPER_PRESET_CONFLICTS[entry.presetId] ?? [];
    const hit = conflicts.find((other) => kept.has(other));
    if (hit) {
      return {
        slot: entry.slot,
        presetId: entry.presetId,
        disposition: "conflicted",
        reasonKo: `${hit}와(과) 충돌하여 자동 보류됨`,
      };
    }
    kept.add(entry.presetId);
    return entry;
  });

  const appliedCount = resolved.filter((e) => e.disposition === "apply").length;
  const unsupportedCount = resolved.filter((e) => e.disposition === "unsupported").length;
  const conflictedCount = resolved.filter((e) => e.disposition === "conflicted").length;
  const total = resolved.length;
  const coverageRatio = total === 0 ? 1 : Number((appliedCount / total).toFixed(4));

  return {
    entries: resolved,
    appliedCount,
    unsupportedCount,
    conflictedCount,
    coverageRatio,
    summaryKo: `총 ${total}슬롯 중 적용 ${appliedCount} · 미지원 ${unsupportedCount} · 충돌 보류 ${conflictedCount}`,
  };
}
