import { describe, expect, it } from "vitest";

import {
  ALL_AVAILABLE_SHAPER_CAPABILITIES,
  ALL_UNAVAILABLE_SHAPER_CAPABILITIES,
  allShaperVocabularyPresetIds,
  isShaperPresetId,
  isShaperVocabularyPresetId,
  makeShaperPresetId,
  planShaperSlotCompatibility,
  SHAPER_APPEARANCE_PRESET_COUNT,
  SHAPER_APPEARANCE_SLOT_KINDS,
  SHAPER_CHARACTER_SLOT_KINDS,
  SHAPER_MIN_PRESETS_PER_SLOT,
  SHAPER_PERFORMANCE_PRESET_COUNT,
  SHAPER_PRESET_CONFLICTS,
  SHAPER_SLOT_GROUPS,
  SHAPER_SLOT_PRESET_IDS,
  SHAPER_TOTAL_PRESET_COUNT,
  SHAPER_TOTAL_SLOT_COUNT,
  shaperSlotAssignmentSchema,
  validateShaperSlotAssignment,
  type ShaperSlotCapabilityMap,
} from "./shaper-15-slot-contract";

describe("shaper-15-slot-contract", () => {
  it("15슬롯 · 94프리셋(외형 64 + 연기 30) 동결 어휘와 최소 개수 불변식을 정확히 충족한다", () => {
    expect(SHAPER_CHARACTER_SLOT_KINDS).toHaveLength(SHAPER_TOTAL_SLOT_COUNT);
    expect(SHAPER_APPEARANCE_SLOT_KINDS).toHaveLength(12);

    const groupUnion = [
      ...SHAPER_SLOT_GROUPS.identity,
      ...SHAPER_SLOT_GROUPS.figure,
      ...SHAPER_SLOT_GROUPS.performance,
    ];
    expect(new Set(groupUnion).size).toBe(15);

    const allIds = allShaperVocabularyPresetIds();
    expect(allIds).toHaveLength(SHAPER_TOTAL_PRESET_COUNT);
    expect(new Set(allIds).size).toBe(SHAPER_TOTAL_PRESET_COUNT);

    const appearanceCount = SHAPER_APPEARANCE_SLOT_KINDS.reduce(
      (sum, slot) => sum + SHAPER_SLOT_PRESET_IDS[slot].length,
      0,
    );
    const performanceCount = SHAPER_SLOT_GROUPS.performance.reduce(
      (sum, slot) => sum + SHAPER_SLOT_PRESET_IDS[slot].length,
      0,
    );
    expect(appearanceCount).toBe(SHAPER_APPEARANCE_PRESET_COUNT);
    expect(performanceCount).toBe(SHAPER_PERFORMANCE_PRESET_COUNT);

    for (const slot of SHAPER_CHARACTER_SLOT_KINDS) {
      expect(SHAPER_SLOT_PRESET_IDS[slot].length).toBeGreaterThanOrEqual(
        SHAPER_MIN_PRESETS_PER_SLOT[slot],
      );
    }
  });

  it("충돌 매트릭스는 모든 쌍이 대칭이고 정본 어휘 안의 유효한 프리셋 ID만 가리킨다", () => {
    for (const [source, targets] of Object.entries(SHAPER_PRESET_CONFLICTS)) {
      expect(isShaperPresetId(source)).toBe(true);
      if (!isShaperPresetId(source)) continue;
      expect(isShaperVocabularyPresetId(source)).toBe(true);
      for (const target of targets) {
        expect(isShaperVocabularyPresetId(target)).toBe(true);
        expect(SHAPER_PRESET_CONFLICTS[target]).toContain(source);
      }
    }
  });

  it("슬롯 불일치, 미등록 어휘, 파츠 충돌, 미지원 역량을 무음 치환 없이 정확히 진단한다", () => {
    const validAssignment = {
      "face-shape": makeShaperPresetId("face-shape", "v-line"),
      hair: makeShaperPresetId("hair", "romance-long"),
      top: makeShaperPresetId("top", "blazer"),
      accessory: makeShaperPresetId("accessory", "glasses"),
      pose: makeShaperPresetId("pose", "idle"),
    };
    expect(shaperSlotAssignmentSchema.safeParse(validAssignment).success).toBe(true);
    expect(validateShaperSlotAssignment(validAssignment).valid).toBe(true);

    const broken = validateShaperSlotAssignment({
      unknownSlot: "hair/soft-bob",
      eyes: "badformat",
      nose: "mouth/small",
      hair: "hair/mullet",
      top: "top/sailor",
      accessory: "accessory/choker",
    });
    expect(broken.valid).toBe(false);
    expect(broken.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        "unknown-slot",
        "invalid-preset-format",
        "slot-mismatch",
        "unknown-vocabulary-preset",
        "preset-conflict",
      ]),
    );
    expect(broken.conflictPairs).toEqual([["top/sailor", "accessory/choker"]]);
  });

  it("호환성 플래너가 미지원 슬롯·프리셋을 대체하지 않고 unsupported/conflicted로 분리한다", () => {
    const partialCaps: ShaperSlotCapabilityMap = {
      ...ALL_AVAILABLE_SHAPER_CAPABILITIES,
      shoes: { status: "unavailable", reasonKo: "상반신 킷은 신발 파츠가 없습니다." },
      hair: {
        status: "partial",
        unavailablePresets: {
          "hair/wolf-layered": "이 에디션에는 울프 레이어드 메시가 포함되지 않았습니다.",
        },
      },
    };
    const plan = planShaperSlotCompatibility(
      {
        "face-shape": "face-shape/oval",
        hair: "hair/twin-tail",
        top: "top/hoodie",
        accessory: "accessory/headphones",
        shoes: "shoes/boots",
      },
      partialCaps,
    );
    expect(plan.appliedCount).toBe(3);
    expect(plan.unsupportedCount).toBe(1);
    expect(plan.conflictedCount).toBe(1);
    expect(plan.entries.find((e) => e.slot === "shoes")?.disposition).toBe("unsupported");
    expect(plan.entries.find((e) => e.slot === "accessory")?.disposition).toBe("conflicted");
    expect(plan.coverageRatio).toBeCloseTo(0.6, 3);

    const unavailableCheck = validateShaperSlotAssignment(
      { hair: "hair/soft-bob" },
      ALL_UNAVAILABLE_SHAPER_CAPABILITIES,
    );
    expect(unavailableCheck.valid).toBe(false);
    expect(unavailableCheck.issues[0]?.code).toBe("slot-unavailable");
  });
});
