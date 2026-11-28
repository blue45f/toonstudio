import { describe, expect, it } from "vitest";
import {
  auditEpisodeWardrobeContinuity,
  canonicalizeJsonForHash,
  compileWardrobeBible,
  computeFips1804Sha256Hex,
  computeOklabDeltaE,
  computeWardrobeBibleSha256Hex,
  createDefaultEpisodeWardrobeBible,
  escapeWardrobeSvgXml,
  renderWardrobeContinuityTimelineSvg,
  srgbTripletToOklab,
  srgbTripletToOklch,
  srgbTripletToOklchCss,
  summarizeWardrobeContinuityAuditKo,
  type CutContinuityEvent,
  type CutWardrobeObservation,
  type EpisodeWardrobeBible,
  type ObservedSlotState,
} from "./index";

function seojinSlots(
  patches?: Partial<Record<string, Partial<ObservedSlotState>>>,
  omit?: readonly string[],
  extra?: readonly ObservedSlotState[],
): ObservedSlotState[] {
  const base: ObservedSlotState[] = [
    { slotId: "trench-coat", present: true, condition: "intact", observedSrgb: [36, 48, 72] },
    { slotId: "turtleneck-top", present: true, condition: "intact", observedSrgb: [52, 54, 58] },
    { slotId: "wrist-watch", present: true, condition: "intact", observedHandedness: "left", observedSrgb: [188, 194, 202] },
    { slotId: "eye-patch", present: true, condition: "intact", observedHandedness: "right", observedSrgb: [44, 34, 32] },
    { slotId: "tactical-blade", present: true, condition: "intact", observedHandedness: "left", observedSrgb: [120, 128, 138] },
  ];
  const omitSet = new Set(omit ?? []);
  const mapped = base
    .filter((s) => !omitSet.has(s.slotId))
    .map((s) => (patches?.[s.slotId] ? { ...s, ...patches[s.slotId] } : s));
  return extra ? [...mapped, ...extra] : mapped;
}

function seojinCasualSlots(): ObservedSlotState[] {
  return [
    { slotId: "ivory-hoodie", present: true, condition: "intact", observedSrgb: [228, 222, 210] },
    { slotId: "denim-slacks", present: true, condition: "intact", observedSrgb: [48, 66, 98] },
    { slotId: "wrist-watch", present: true, condition: "intact", observedHandedness: "left", observedSrgb: [188, 194, 202] },
  ];
}

function harinSlots(patches?: Partial<Record<string, Partial<ObservedSlotState>>>): ObservedSlotState[] {
  const base: ObservedSlotState[] = [
    { slotId: "lab-coat", present: true, condition: "intact", observedSrgb: [238, 240, 242] },
    { slotId: "gold-earring", present: true, condition: "intact", observedHandedness: "left", observedSrgb: [212, 174, 86] },
    { slotId: "horn-glasses", present: true, condition: "intact", observedHandedness: "center", observedSrgb: [64, 52, 46] },
  ];
  return patches ? base.map((s) => (patches[s.slotId] ? { ...s, ...patches[s.slotId] } : s)) : base;
}

function cut(
  cutId: string,
  cutIndex: number,
  characterId: string,
  slots: readonly ObservedSlotState[],
  events?: readonly CutContinuityEvent[],
  extra?: Partial<Pick<CutWardrobeObservation, "lightingMoodLabelKo" | "lightingToleranceDeltaE" | "occludedSlotIds">>,
): CutWardrobeObservation {
  return { cutId, cutIndex, characterId, slots, events, ...extra };
}

describe("Wave 123 — 웹툰 연재 의상·소품 인과 연속성 감사 및 옷장 바이블 컴파일러", () => {
  const bible = createDefaultEpisodeWardrobeBible();

  describe("1. 정상 연재 100점 통과·시간순 정렬 및 다중 캐릭터 독립 추적", () => {
    it("모든 의상·소품·방향·색상이 일치하는 정상 연재 컷들은 100점 통과한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots()),
        cut("C02", 2, "seo-jin", seojinSlots()),
        cut("C03", 3, "seo-jin", seojinSlots()),
      ]);
      expect(audit.passStatus).toBe("pass");
      expect(audit.continuityScore).toBe(100);
      expect(audit.findings).toHaveLength(0);
      expect(audit.totalCutsAudited).toBe(3);
      expect(audit.cutRows[0]?.cells.every((c) => c.badgeText === "OK" || c.badgeText === "—")).toBe(true);
    });

    it("입력 배열이 컷 순서대로 정렬되어 있지 않아도 cutIndex 시간순으로 인과를 추적한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C03", 3, "seo-jin", seojinSlots()),
        cut("C01", 1, "seo-jin", seojinSlots({ "trench-coat": { condition: "damage-torn" } }), [
          { kind: "damage-torn", characterId: "seo-jin", slotId: "trench-coat" },
        ]),
        cut("C02", 2, "seo-jin", seojinSlots({ "trench-coat": { condition: "damage-torn" } })),
      ]);
      expect(audit.cutRows.map((r) => r.cutId)).toEqual(["C01", "C02", "C03"]);
      expect(audit.passStatus).toBe("block");
      expect(audit.findings[0]?.cutId).toBe("C03");
      expect(audit.findings[0]?.originCutId).toBe("C01");
    });

    it("다중 캐릭터가 교차 등장해도 각 캐릭터의 손상·소품 인과 상태가 서로 간섭하지 않는다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots({ "trench-coat": { condition: "damage-wet" } }), [
          { kind: "damage-wet", characterId: "seo-jin", slotId: "trench-coat" },
        ]),
        cut("C02", 2, "ha-rin", harinSlots()),
        cut("C03", 3, "seo-jin", seojinSlots({ "trench-coat": { condition: "damage-wet" } })),
      ]);
      expect(audit.passStatus).toBe("pass");
      expect(audit.continuityScore).toBe(100);
      expect(audit.findings).toHaveLength(0);
    });

    it("클로즈업으로 가려진 슬롯(visibility: occluded / occludedSlotIds)은 오탐 없이 CROP 처리된다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut(
          "C01",
          1,
          "seo-jin",
          seojinSlots({ "wrist-watch": { present: false, visibility: "occluded" } }, ["tactical-blade"]),
          undefined,
          { occludedSlotIds: ["tactical-blade"] },
        ),
      ]);
      expect(audit.passStatus).toBe("pass");
      expect(audit.cutRows[0]?.cells.find((c) => c.slotId === "wrist-watch")?.badgeText).toBe("CROP");
      expect(audit.cutRows[0]?.cells.find((c) => c.slotId === "tactical-blade")?.badgeText).toBe("CROP");
    });
  });

  describe("2. 미설명 손상 복구 작붕(spontaneous-damage-healing, blocker) 차단", () => {
    it("소매 찢어짐(damage-torn) 유지 컷은 DMG로 통과하고 갑자기 intact가 된 컷을 차단한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots()),
        cut("C02", 2, "seo-jin", seojinSlots({ "trench-coat": { condition: "damage-torn" } }), [
          { kind: "damage-torn", characterId: "seo-jin", slotId: "trench-coat" },
        ]),
        cut("C03", 3, "seo-jin", seojinSlots({ "trench-coat": { condition: "damage-torn" } })),
        cut("C04", 4, "seo-jin", seojinSlots({ "trench-coat": { condition: "intact" } })),
      ]);
      expect(audit.passStatus).toBe("block");
      expect(audit.blockerCount).toBe(1);
      expect(audit.countsByCode["spontaneous-damage-healing"]).toBe(1);
      expect(audit.findings[0]?.severity).toBe("blocker");
      expect(audit.findings[0]?.cutId).toBe("C04");
      expect(audit.findings[0]?.originCutId).toBe("C02");
      expect(audit.cutRows[2]?.cells.find((c) => c.slotId === "trench-coat")?.badgeText).toBe("DMG");
      expect(audit.cutRows[3]?.cells.find((c) => c.slotId === "trench-coat")?.badgeText).toBe("HEAL!");
    });

    it("혈흔 오염(damage-bloodstain)이 의상 교체 없이 사라지면 즉시 blocker로 차단한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C10", 10, "ha-rin", harinSlots({ "lab-coat": { condition: "damage-bloodstain" } }), [
          { kind: "damage-bloodstain", characterId: "ha-rin", slotId: "lab-coat" },
        ]),
        cut("C11", 11, "ha-rin", harinSlots({ "lab-coat": { condition: "intact" } })),
      ]);
      expect(audit.passStatus).toBe("block");
      expect(audit.findings[0]?.code).toBe("spontaneous-damage-healing");
      expect(audit.findings[0]?.messageKo).toContain("혈흔 오염");
    });

    it("빗속 젖음 상태(damage-wet)가 이유 없이 완전히 마른 컷을 차단한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C20", 20, "seo-jin", seojinSlots({ "turtleneck-top": { condition: "damage-wet" } }), [
          { kind: "damage-wet", characterId: "seo-jin", slotId: "turtleneck-top" },
        ]),
        cut("C21", 21, "seo-jin", seojinSlots({ "turtleneck-top": { condition: "intact" } })),
      ]);
      expect(audit.passStatus).toBe("block");
      expect(audit.findings[0]?.messageKo).toContain("젖음 상태");
    });

    it("명시적 이벤트 없이 컷 관측에서 처음 드러난 손상도 다음 컷에 자동 인과 래치된다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C05", 5, "seo-jin", seojinSlots({ "trench-coat": { condition: "damage-bloodstain" } })),
        cut("C06", 6, "seo-jin", seojinSlots({ "trench-coat": { condition: "intact" } })),
      ]);
      expect(audit.passStatus).toBe("block");
      expect(audit.findings[0]?.code).toBe("spontaneous-damage-healing");
      expect(audit.findings[0]?.originCutId).toBe("C05");
    });

    it("찢김+혈흔 복합 손상 중 하나만 activeDamages에서 빠진 부분 복구도 정확히 적발한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots({ "trench-coat": { activeDamages: ["damage-torn"] } }), [
          { kind: "damage-torn", characterId: "seo-jin", slotId: "trench-coat" },
        ]),
        cut(
          "C02",
          2,
          "seo-jin",
          seojinSlots({ "trench-coat": { activeDamages: ["damage-torn", "damage-bloodstain"] } }),
          [{ kind: "damage-bloodstain", characterId: "seo-jin", slotId: "trench-coat" }],
        ),
        cut("C03", 3, "seo-jin", seojinSlots({ "trench-coat": { activeDamages: ["damage-bloodstain"] } })),
      ]);
      expect(audit.passStatus).toBe("block");
      expect(audit.findings).toHaveLength(1);
      expect(audit.findings[0]?.cutId).toBe("C03");
      expect(audit.findings[0]?.messageKo).toContain("찢김 손상");
    });

    it("복합 손상이 통째로 intact가 되면 누적 손상 종류를 모두 명시해 차단한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut(
          "C01",
          1,
          "seo-jin",
          seojinSlots({ "trench-coat": { activeDamages: ["damage-torn", "damage-bloodstain"] } }),
          [
            { kind: "damage-torn", characterId: "seo-jin", slotId: "trench-coat" },
            { kind: "damage-bloodstain", characterId: "seo-jin", slotId: "trench-coat" },
          ],
        ),
        cut("C02", 2, "seo-jin", seojinSlots({ "trench-coat": { condition: "intact" } })),
      ]);
      expect(audit.findings[0]?.messageKo).toContain("찢김 손상");
      expect(audit.findings[0]?.messageKo).toContain("혈흔 오염");
    });
  });

  describe("3. 명시적 wardrobe-change / scene-time-skip-reset 이후 합법적 초기화 (오탐 0건)", () => {
    it("wardrobe-change로 새 착장(casual-hoodie-nextday)으로 갈아입으면 이전 손상이 해제되고 오탐 0건으로 통과한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut(
          "C01",
          1,
          "seo-jin",
          seojinSlots({
            "trench-coat": { condition: "damage-torn" },
            "wrist-watch": { condition: "damage-bloodstain" },
          }),
          [
            { kind: "damage-torn", characterId: "seo-jin", slotId: "trench-coat" },
            { kind: "damage-bloodstain", characterId: "seo-jin", slotId: "wrist-watch" },
          ],
        ),
        cut("C02", 2, "seo-jin", seojinCasualSlots(), [
          { kind: "wardrobe-change", characterId: "seo-jin", nextOutfitId: "casual-hoodie-nextday" },
        ]),
      ]);
      expect(audit.passStatus).toBe("pass");
      expect(audit.continuityScore).toBe(100);
      expect(audit.findings).toHaveLength(0);
      expect(audit.cutRows[1]?.activeOutfitId).toBe("casual-hoodie-nextday");
      expect(audit.cutRows[1]?.cells.every((c) => c.resetApplied && c.badgeText === "OK")).toBe(true);
    });

    it("nextOutfitId 없는 wardrobe-change(동일 디자인 여벌 착장)도 손상을 합법적으로 초기화한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots({ "trench-coat": { condition: "damage-torn" } }), [
          { kind: "damage-torn", characterId: "seo-jin", slotId: "trench-coat" },
        ]),
        cut("C02", 2, "seo-jin", seojinSlots({ "trench-coat": { condition: "intact" } }), [
          { kind: "wardrobe-change", characterId: "seo-jin" },
        ]),
      ]);
      expect(audit.passStatus).toBe("pass");
      expect(audit.findings).toHaveLength(0);
    });

    it("scene-time-skip-reset(다음 날 장면 전환) 이후에는 손상과 소품 이탈 상태가 모두 정상 초기화된다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut(
          "C01",
          1,
          "seo-jin",
          seojinSlots({ "trench-coat": { condition: "damage-wet" }, "tactical-blade": { present: false } }),
          [
            { kind: "damage-wet", characterId: "seo-jin", slotId: "trench-coat" },
            { kind: "prop-dropped", characterId: "seo-jin", slotId: "tactical-blade" },
          ],
        ),
        cut("C02", 2, "seo-jin", seojinSlots(), [
          { kind: "scene-time-skip-reset", characterId: "seo-jin" },
        ]),
      ]);
      expect(audit.passStatus).toBe("pass");
      expect(audit.continuityScore).toBe(100);
      expect(audit.findings).toHaveLength(0);
    });

    it("전역 scene-time-skip-reset(characterId: '*')은 등장 중인 모든 캐릭터의 손상을 함께 초기화한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots({ "trench-coat": { condition: "damage-wet" } }), [
          { kind: "damage-wet", characterId: "seo-jin", slotId: "trench-coat" },
        ]),
        cut("C02", 2, "ha-rin", harinSlots({ "lab-coat": { condition: "damage-bloodstain" } }), [
          { kind: "damage-bloodstain", characterId: "ha-rin", slotId: "lab-coat" },
        ]),
        cut("C03", 3, "seo-jin", seojinSlots(), [{ kind: "scene-time-skip-reset", characterId: "*" }]),
        cut("C04", 4, "ha-rin", harinSlots()),
      ]);
      expect(audit.passStatus).toBe("pass");
      expect(audit.findings).toHaveLength(0);
    });

    it("wardrobe-change에서 바이블에 없는 nextOutfitId를 지정하면 크래시 없이 unknown-outfit-change 경고를 기록한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots(), [
          { kind: "wardrobe-change", characterId: "seo-jin", nextOutfitId: "ghost-tuxedo" },
        ]),
      ]);
      expect(audit.passStatus).toBe("warn");
      expect(audit.countsByCode["unknown-outfit-change"]).toBe(1);
    });
  });

  describe("4. 필수 소품 누락(missing-signature-prop) vs 합법적 prop-dropped / prop-acquired", () => {
    it("prop-dropped 없이 필수 무기(전술 단검)가 present: false이면 blocker로 적발한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots({ "tactical-blade": { present: false } })),
      ]);
      expect(audit.passStatus).toBe("block");
      expect(audit.countsByCode["missing-signature-prop"]).toBe(1);
      expect(audit.findings[0]?.severity).toBe("blocker");
      expect(audit.cutRows[0]?.cells.find((c) => c.slotId === "tactical-blade")?.badgeText).toBe("MISS");
    });

    it("필수 슬롯이 observation.slots 배열에서 아예 빠진 경우에도 누락으로 적발한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots(undefined, ["eye-patch"])),
      ]);
      expect(audit.passStatus).toBe("block");
      expect(audit.findings[0]?.code).toBe("missing-signature-prop");
      expect(audit.findings[0]?.slotId).toBe("eye-patch");
    });

    it("importance가 standard인 필수 보조 장신구 누락은 warning 등급으로 분류된다", () => {
      const customBible: EpisodeWardrobeBible = {
        episodeId: "EP-STD",
        episodeTitleKo: "보조 장신구 검수",
        presets: [
          {
            characterId: "hero",
            outfitId: "base",
            outfitLabelKo: "기본복",
            slots: [
              {
                slotId: "lapel-pin",
                category: "accessory",
                labelKo: "옷깃 배지",
                required: true,
                importance: "standard",
                canonicalSrgb: [210, 180, 90],
                maxAllowedOklabDeltaE: 0.07,
              },
            ],
          },
        ],
      };
      const audit = auditEpisodeWardrobeContinuity(customBible, [
        cut("C01", 1, "hero", [{ slotId: "lapel-pin", present: false }]),
      ]);
      expect(audit.passStatus).toBe("warn");
      expect(audit.findings[0]?.severity).toBe("warning");
    });

    it("합법적 prop-dropped 이벤트 이후 무기가 없는 컷은 DROP으로 인정되어 오탐이 0건이다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots()),
        cut("C02", 2, "seo-jin", seojinSlots({ "tactical-blade": { present: false } }), [
          { kind: "prop-dropped", characterId: "seo-jin", slotId: "tactical-blade" },
        ]),
        cut("C03", 3, "seo-jin", seojinSlots({ "tactical-blade": { present: false } })),
      ]);
      expect(audit.passStatus).toBe("pass");
      expect(audit.findings).toHaveLength(0);
      expect(audit.cutRows[1]?.cells.find((c) => c.slotId === "tactical-blade")?.badgeText).toBe("DROP");
      expect(audit.cutRows[2]?.cells.find((c) => c.slotId === "tactical-blade")?.badgeText).toBe("DROP");
    });

    it("선택 소품을 prop-acquired로 획득한 뒤 prop-dropped 없이 사라지면 경고로 적발한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut(
          "C01",
          1,
          "seo-jin",
          seojinSlots(undefined, undefined, [
            { slotId: "evidence-pouch", present: true, condition: "intact", observedHandedness: "right", observedSrgb: [112, 74, 48] },
          ]),
          [{ kind: "prop-acquired", characterId: "seo-jin", slotId: "evidence-pouch" }],
        ),
        cut("C02", 2, "seo-jin", seojinSlots()),
      ]);
      expect(audit.passStatus).toBe("warn");
      expect(audit.findings[0]?.code).toBe("missing-signature-prop");
      expect(audit.findings[0]?.slotId).toBe("evidence-pouch");
      expect(audit.findings[0]?.originCutId).toBe("C01");
    });

    it("prop-dropped 뒤 다시 prop-acquired로 되찾은 필수 무기는 이후 컷에서 다시 필수 추적된다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots({ "tactical-blade": { present: false } }), [
          { kind: "prop-dropped", characterId: "seo-jin", slotId: "tactical-blade" },
        ]),
        cut("C02", 2, "seo-jin", seojinSlots(), [
          { kind: "prop-acquired", characterId: "seo-jin", slotId: "tactical-blade" },
        ]),
        cut("C03", 3, "seo-jin", seojinSlots({ "tactical-blade": { present: false } })),
      ]);
      expect(audit.passStatus).toBe("block");
      expect(audit.findings[0]?.cutId).toBe("C03");
      expect(audit.findings[0]?.code).toBe("missing-signature-prop");
    });
  });

  describe("5. 좌우 착용 반전(accessory-handedness-flip, blocker)", () => {
    it("왼손 손목시계가 오른손으로 반전되면 FLIP blocker로 즉시 차단한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C07", 7, "seo-jin", seojinSlots({ "wrist-watch": { observedHandedness: "right" } })),
      ]);
      expect(audit.passStatus).toBe("block");
      expect(audit.countsByCode["accessory-handedness-flip"]).toBe(1);
      expect(audit.findings[0]?.severity).toBe("blocker");
      expect(audit.cutRows[0]?.cells.find((c) => c.slotId === "wrist-watch")?.badgeText).toBe("FLIP");
    });

    it("오른쪽 가죽 안대가 왼쪽으로 반전되면 차단한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C08", 8, "seo-jin", seojinSlots({ "eye-patch": { observedHandedness: "left" } })),
      ]);
      expect(audit.passStatus).toBe("block");
      expect(audit.findings[0]?.code).toBe("accessory-handedness-flip");
      expect(audit.findings[0]?.slotId).toBe("eye-patch");
    });

    it("중앙(center) 기준 안경이 한쪽으로 치우쳐 보고되면 차단하고 일치하면 통과한다", () => {
      const flipped = auditEpisodeWardrobeContinuity(bible, [
        cut("C09", 9, "ha-rin", harinSlots({ "horn-glasses": { observedHandedness: "left" } })),
      ]);
      const matched = auditEpisodeWardrobeContinuity(bible, [cut("C09", 9, "ha-rin", harinSlots())]);
      expect(flipped.countsByCode["accessory-handedness-flip"]).toBe(1);
      expect(matched.passStatus).toBe("pass");
    });
  });

  describe("6. Björn Ottosson 정확한 OKLab ΔE 색차 계산 및 조명 허용치 경계", () => {
    it("검정·흰색·순적색 [255,0,0]의 OKLab 좌표가 Björn Ottosson 정밀 기준치와 일치한다", () => {
      const black = srgbTripletToOklab([0, 0, 0]);
      const white = srgbTripletToOklab([255, 255, 255]);
      const red = srgbTripletToOklab([255, 0, 0]);

      expect(black.l).toBeCloseTo(0, 6);
      expect(white.l).toBeCloseTo(1, 5);
      expect(white.a).toBeCloseTo(0, 5);
      expect(red.l).toBeCloseTo(0.627955, 4);
      expect(red.a).toBeCloseTo(0.224863, 4);
      expect(red.b).toBeCloseTo(0.125846, 4);

      const redLch = srgbTripletToOklch([255, 0, 0]);
      expect(redLch.c).toBeGreaterThan(0.25);
      expect(redLch.h).toBeCloseTo(29.23, 1);
    });

    it("computeOklabDeltaE는 동일 색 0, 대칭성, 비유한 입력 클램프를 만족한다", () => {
      const c1 = [36, 48, 72] as const;
      const c2 = [180, 42, 48] as const;
      expect(computeOklabDeltaE(c1, c1)).toBe(0);
      expect(computeOklabDeltaE(c1, c2)).toBeCloseTo(computeOklabDeltaE(c2, c1), 10);
      expect(computeOklabDeltaE(c1, c2)).toBeGreaterThan(0.2);

      const safeCss = srgbTripletToOklchCss([Number.NaN, 300, -10]);
      expect(safeCss.startsWith("oklch(")).toBe(true);
      expect(safeCss).not.toContain("NaN");
    });

    it("공식 배색과 허용치(maxAllowedOklabDeltaE) 이내의 미세한 차이는 통과한다", () => {
      const subtleShift = [40, 52, 76] as const;
      expect(computeOklabDeltaE([36, 48, 72], subtleShift)).toBeLessThan(0.055);
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots({ "trench-coat": { observedSrgb: subtleShift } })),
      ]);
      expect(audit.passStatus).toBe("pass");
      expect(audit.countsByCode["palette-color-drift"]).toBe(0);
    });

    it("허용치를 살짝 넘긴 색채 이탈은 warning, 완전히 다른 색으로 칠한 심각한 이탈은 blocker를 발생시킨다", () => {
      const moderateDrift = [54, 63, 86] as const;
      const severeDrift = [196, 42, 42] as const;
      const deMod = computeOklabDeltaE([36, 48, 72], moderateDrift);
      expect(deMod).toBeGreaterThan(0.055);
      expect(deMod).toBeLessThan(0.055 * 1.5);
      expect(computeOklabDeltaE([36, 48, 72], severeDrift)).toBeGreaterThan(0.2);

      const warnAudit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots({ "trench-coat": { observedSrgb: moderateDrift } })),
      ]);
      const blockAudit = auditEpisodeWardrobeContinuity(bible, [
        cut("C02", 2, "seo-jin", seojinSlots({ "trench-coat": { observedSrgb: severeDrift } })),
      ]);

      expect(warnAudit.passStatus).toBe("warn");
      expect(warnAudit.findings[0]?.severity).toBe("warning");
      expect(warnAudit.cutRows[0]?.cells.find((c) => c.slotId === "trench-coat")?.badgeText).toBe("COLOR");
      expect(blockAudit.passStatus).toBe("block");
      expect(blockAudit.findings[0]?.severity).toBe("blocker");
    });

    it("장면 조명 보정 허용치(lightingToleranceDeltaE) 경계를 정확히 반영한다", () => {
      const sunsetCoat = [72, 66, 74] as const;
      const de = computeOklabDeltaE([36, 48, 72], sunsetCoat);
      expect(de).toBeGreaterThan(0.055);
      expect(de).toBeLessThan(0.095);

      const strictAudit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots({ "trench-coat": { observedSrgb: sunsetCoat } }), undefined, {
          lightingToleranceDeltaE: 0,
        }),
      ]);
      const sunsetAudit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots({ "trench-coat": { observedSrgb: sunsetCoat } }), undefined, {
          lightingMoodLabelKo: "황금 노을 역광",
          lightingToleranceDeltaE: 0.04,
        }),
      ]);
      const overCombined = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots({ "trench-coat": { observedSrgb: [190, 140, 60] } }), undefined, {
          lightingToleranceDeltaE: 0.04,
        }),
      ]);

      expect(strictAudit.countsByCode["palette-color-drift"]).toBe(1);
      expect(sunsetAudit.countsByCode["palette-color-drift"]).toBe(0);
      expect(sunsetAudit.passStatus).toBe("pass");
      expect(overCombined.countsByCode["palette-color-drift"]).toBe(1);
    });
  });

  describe("7. 결정론적 FIPS 180-4 SHA-256 테스트 벡터 및 키 순서 무관 지문", () => {
    it("NIST FIPS 180-4 공식 SHA-256 표준 테스트 벡터 3종과 비트 단위로 일치한다", () => {
      expect(computeFips1804Sha256Hex("")).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(computeFips1804Sha256Hex("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
      expect(
        computeFips1804Sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
      ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    });

    it("한글 UTF-8 문자열 SHA-256이 결정론적 64자리 소문자 16진수를 반환한다", () => {
      const h1 = computeFips1804Sha256Hex("서진 다크 네이비 트렌치코트");
      const h2 = computeFips1804Sha256Hex("서진 다크 네이비 트렌치코트");
      expect(h1).toBe(h2);
      expect(/^[0-9a-f]{64}$/.test(h1)).toBe(true);
    });

    it("computeWardrobeBibleSha256Hex는 객체 키 순서와 undefined 필드에 완전히 무관하다", () => {
      const objA = { episodeTitleKo: "42화", episodeId: "EP-042", meta: { b: 2, a: 1, skip: undefined } };
      const objB = { episodeId: "EP-042", meta: { a: 1, b: 2 }, episodeTitleKo: "42화" };
      expect(canonicalizeJsonForHash(objA)).toBe(canonicalizeJsonForHash(objB));
      expect(computeWardrobeBibleSha256Hex(objA)).toBe(computeWardrobeBibleSha256Hex(objB));
    });

    it("옷장 바이블 슬롯 착용 방향이 1건만 바뀌어도 bibleSha256Hex와 auditSha256Hex가 즉시 바뀐다", () => {
      const mutatedBible = createDefaultEpisodeWardrobeBible({
        presets: bible.presets.map((p) =>
          p.outfitId === "noir-trench-combat"
            ? {
                ...p,
                slots: p.slots.map((s) =>
                  s.slotId === "wrist-watch" ? { ...s, handedness: "right" as const } : s,
                ),
              }
            : p,
        ),
      });
      expect(compileWardrobeBible(bible).bibleSha256Hex).not.toBe(
        compileWardrobeBible(mutatedBible).bibleSha256Hex,
      );
      const obs = [cut("C01", 1, "seo-jin", seojinSlots())];
      expect(auditEpisodeWardrobeContinuity(bible, obs).auditSha256Hex).not.toBe(
        auditEpisodeWardrobeContinuity(mutatedBible, obs).auditSha256Hex,
      );
    });
  });

  describe("8. 빈 컷·미등록 캐릭터·미등록 슬롯 안전 경계 처리", () => {
    it("관측 컷이 비어 있어도 예외 없이 100점 pass와 유효한 지문을 반환한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, []);
      expect(audit.passStatus).toBe("pass");
      expect(audit.continuityScore).toBe(100);
      expect(audit.totalCutsAudited).toBe(0);
      expect(/^[0-9a-f]{64}$/.test(audit.auditSha256Hex)).toBe(true);
    });

    it("바이블에 미등록된 characterId가 들어와도 안전하게 unregistered-character 경고를 기록한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C99", 99, "mystery-extra", [{ slotId: "cap", present: true }]),
      ]);
      expect(audit.passStatus).toBe("warn");
      expect(audit.countsByCode["unregistered-character"]).toBe(1);
      expect(audit.cutRows[0]?.activeOutfitId).toBe("unregistered");
    });

    it("활성 착장에 정의되지 않은 slotId가 관측되면 unregistered-slot info로 기록한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut(
          "C01",
          1,
          "seo-jin",
          seojinSlots(undefined, undefined, [{ slotId: "mystery-umbrella", present: true, condition: "intact" }]),
        ),
      ]);
      expect(audit.passStatus).toBe("pass");
      expect(audit.countsByCode["unregistered-slot"]).toBe(1);
      expect(audit.infoCount).toBe(1);
    });
  });

  describe("9. 인쇄 안전 순수 OKLCH 타임라인 SVG·XML 이스케이프 및 한국어 QA 브리프", () => {
    it("타임라인 SVG는 원시 hex/rgb/hsl 0건, NaN/Infinity 0건, 순수 oklch()와 모든 상태 배지를 포함한다", () => {
      const audit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots({ "trench-coat": { condition: "damage-torn" } }), [
          { kind: "damage-torn", characterId: "seo-jin", slotId: "trench-coat" },
        ]),
        cut(
          "C02",
          2,
          "seo-jin",
          seojinSlots({
            "trench-coat": { condition: "intact" },
            "turtleneck-top": { observedSrgb: [196, 48, 48] },
            "wrist-watch": { observedHandedness: "right" },
            "tactical-blade": { present: false },
          }),
        ),
      ]);
      const svg = renderWardrobeContinuityTimelineSvg(audit);

      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
      expect(/#[0-9a-fA-F]{3,8}\b/.test(svg)).toBe(false);
      expect(/\brgba?\s*\(/i.test(svg)).toBe(false);
      expect(/\bhsla?\s*\(/i.test(svg)).toBe(false);
      expect(svg).toContain("oklch(");
      for (const badge of ["OK", "DMG", "HEAL!", "MISS", "FLIP", "COLOR"]) {
        expect(svg).toContain(badge);
      }
      expect(svg).toContain(audit.auditSha256Hex);
    });

    it("에피소드·캐릭터·슬롯 이름의 XML 특수문자(<, >, &, \", ')를 모두 안전하게 이스케이프한다", () => {
      const xssBible = createDefaultEpisodeWardrobeBible({
        episodeTitleKo: `42화 <위험> & "추격" 'A'`,
        presets: [{
          characterId: "seo-jin",
          characterNameKo: `서진 <주인공> & "리더"`,
          outfitId: "xss-outfit",
          outfitLabelKo: `전투복 <v1> '특수'`,
          slots: [{
            slotId: "coat",
            category: "outerwear",
            labelKo: `<코트 & "특이점">`,
            required: true,
            canonicalSrgb: [36, 48, 72],
            maxAllowedOklabDeltaE: 0.06,
          }],
        }],
      });
      const audit = auditEpisodeWardrobeContinuity(xssBible, [
        cut("C01", 1, "seo-jin", [{ slotId: "coat", present: true, condition: "intact", observedSrgb: [36, 48, 72] }]),
      ]);
      const svg = renderWardrobeContinuityTimelineSvg(audit);
      expect(escapeWardrobeSvgXml(`<a & "b" 'c'>`)).toBe("&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;");
      expect(svg).not.toContain("<위험>");
      expect(svg).not.toContain("<주인공>");
      expect(svg).toContain("&lt;위험&gt; &amp; &quot;추격&quot; &apos;A&apos;");
      expect(svg).toContain("&lt;주인공&gt; &amp; &quot;리더&quot;");
    });

    it("빈 컷 감사의 SVG와 한국어 QA 브리프도 NaN 없이 안전하게 생성된다", () => {
      const emptyAudit = auditEpisodeWardrobeContinuity(bible, []);
      const svg = renderWardrobeContinuityTimelineSvg(emptyAudit);
      const summary = summarizeWardrobeContinuityAuditKo(emptyAudit);
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg).not.toContain("NaN");
      expect(svg).toContain("검수할 컷 관측 데이터가 아직 없습니다.");
      expect(summary.verdictLabelKo).toBe("원고 통과");
      expect(summary.markdownReportKo).toContain("수정할 작화 연속성 오류가 없습니다.");
    });

    it("한국어 어시스턴트 QA 브리프는 번역투 없이 통과·차단 결과와 구체 수정 체크리스트를 출력한다", () => {
      const cleanAudit = auditEpisodeWardrobeContinuity(bible, [cut("C01", 1, "seo-jin", seojinSlots())]);
      const blockedAudit = auditEpisodeWardrobeContinuity(bible, [
        cut("C01", 1, "seo-jin", seojinSlots({ "trench-coat": { condition: "damage-torn" } }), [
          { kind: "damage-torn", characterId: "seo-jin", slotId: "trench-coat" },
        ]),
        cut("C02", 2, "seo-jin", seojinSlots({
          "trench-coat": { condition: "intact" },
          "wrist-watch": { observedHandedness: "right" },
          "turtleneck-top": { observedSrgb: [210, 50, 50] },
        })),
      ]);
      const cleanSummary = summarizeWardrobeContinuityAuditKo(cleanAudit);
      const blockedSummary = summarizeWardrobeContinuityAuditKo(blockedAudit);
      expect(cleanSummary.verdictLabelKo).toBe("원고 통과");
      expect(cleanSummary.summaryParagraphKo).toContain("100.0점");
      expect(blockedSummary.verdictLabelKo).toBe("출고 차단");
      expect(blockedSummary.damageContinuityNotesKo).toHaveLength(1);
      expect(blockedSummary.propAndChiralityNotesKo).toHaveLength(1);
      expect(blockedSummary.colorDriftNotesKo).toHaveLength(1);
      expect(blockedSummary.recommendedFixesKo).toHaveLength(3);
      expect(blockedSummary.markdownReportKo).toContain("어시스턴트 수정 체크리스트");
      for (const report of [cleanSummary.markdownReportKo, blockedSummary.markdownReportKo]) {
        for (const phrase of ["가능하게 합니다", "직관적인 경험을 제공", "원활한 워크플로우를 보장", "혁신적인 솔루션"]) {
          expect(report).not.toContain(phrase);
        }
      }
    });
  });
});
