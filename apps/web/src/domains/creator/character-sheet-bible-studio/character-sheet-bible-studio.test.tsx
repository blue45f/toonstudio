// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHARACTER_PRESET_IDS,
  CHARACTER_SHEET_PRESETS,
  DEFAULT_EXPRESSION_9GRID,
  EXPRESSION_SLOT_IDS,
  MAX_FOOTWEAR_BONUS_CM,
  MAX_HEAD_RATIO,
  MAX_HEIGHT_CM,
  MIN_HEAD_RATIO,
  MIN_HEIGHT_CM,
  OUTFIT_SLOT_IDS,
  StudioCharacterSheetBiblePanel,
  assessOklchPrintGamut,
  auditCharacterSheetCompleteness,
  buildCastHeightEntries,
  compareCastHeights,
  computeHeightRatioMetrics,
  createCharacterPreset,
  exportCharacterSheetJson,
  exportCharacterSheetMarkdown,
  formatOklchCss,
  formatOklchSpec,
  updateExpressionGridCell,
  updateOfficialColorChip,
  updateOutfitContinuitySlot,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("1. 등신비·신장 3면도 눈금 계산기 및 다인 캐스트 키 비교", () => {
  it("표준 입력(180cm, 7.5등신, 굽 0cm)에서 1두신·눈높이 및 머리/어깨/허리/무릎 좌표를 정확히 계산한다", () => {
    const m = computeHeightRatioMetrics({ heightCm: 180, headRatio: 7.5, footwearBonusCm: 0 });
    expect(m.bareHeightCm).toBe(180);
    expect(m.effectiveHeightCm).toBe(180);
    expect(m.headUnitCm).toBe(24);
    expect(m.eyeLevelCm).toBe(168);
    expect(m.silhouetteClass).toBe("commercial-standard");
    expect(m.landmarks.map((l) => l.id)).toEqual(["head", "shoulder", "waist", "knee"]);

    expect(m.byId.head.heightFromFloorCm).toBe(156);
    expect(m.byId.head.headUnitsFromCrown).toBe(1);
    expect(m.byId.head.heightFromFloorCm).toBeGreaterThan(m.byId.shoulder.heightFromFloorCm);
    expect(m.byId.shoulder.heightFromFloorCm).toBeGreaterThan(m.byId.waist.heightFromFloorCm);
    expect(m.byId.waist.heightFromFloorCm).toBeGreaterThan(m.byId.knee.heightFromFloorCm);
    expect(m.byId.knee.heightFromFloorCm).toBeGreaterThan(0);

    for (const lm of m.landmarks) {
      expect(lm.ratioFromFloor + lm.ratioFromTop).toBeCloseTo(1, 2);
      expect(lm.heightFromFloorCm + lm.offsetFromCrownCm).toBeCloseTo(m.effectiveHeightCm, 1);
    }
  });

  it("굽/신발 보정(+4.0cm) 적용 시 착화 신장과 모든 눈금이 +4.0cm 상승하고 맨발 높이는 보존된다", () => {
    const bare = computeHeightRatioMetrics({ heightCm: 168, headRatio: 7.0, footwearBonusCm: 0 });
    const heeled = computeHeightRatioMetrics({ heightCm: 168, headRatio: 7.0, footwearBonusCm: 4 });

    expect(heeled.effectiveHeightCm).toBe(172);
    expect(heeled.bareHeightCm).toBe(168);
    expect(heeled.eyeLevelCm).toBeCloseTo(bare.eyeLevelCm + 4, 1);
    for (const id of ["head", "shoulder", "waist", "knee"] as const) {
      expect(heeled.byId[id].heightFromFloorCm).toBeCloseTo(bare.byId[id].heightFromFloorCm + 4, 1);
      expect(heeled.byId[id].bareHeightFromFloorCm).toBe(bare.byId[id].bareHeightFromFloorCm);
    }
  });

  it("등신비 5.5~8.5 변화에 따라 실루엣 등급과 하체(허리/무릎) 비율이 연동된다", () => {
    const compact = computeHeightRatioMetrics({ heightCm: 160, headRatio: 5.5 });
    const youth = computeHeightRatioMetrics({ heightCm: 165, headRatio: 6.6 });
    const standard = computeHeightRatioMetrics({ heightCm: 175, headRatio: 7.4 });
    const heroic = computeHeightRatioMetrics({ heightCm: 190, headRatio: 8.5 });

    expect(compact.silhouetteClass).toBe("sd-compact");
    expect(youth.silhouetteClass).toBe("youth-athletic");
    expect(standard.silhouetteClass).toBe("commercial-standard");
    expect(heroic.silhouetteClass).toBe("heroic-tall");
    expect(heroic.byId.waist.ratioFromFloor).toBeGreaterThan(compact.byId.waist.ratioFromFloor);
    expect(heroic.byId.knee.ratioFromFloor).toBeGreaterThan(compact.byId.knee.ratioFromFloor);
  });

  it("범위 초과·음수·NaN/Infinity 입력을 안전하게 경계값으로 클램핑한다", () => {
    const low = computeHeightRatioMetrics({ heightCm: 40, headRatio: 2.0, footwearBonusCm: -10 });
    expect(low.bareHeightCm).toBe(MIN_HEIGHT_CM);
    expect(low.headRatio).toBe(MIN_HEAD_RATIO);
    expect(low.footwearBonusCm).toBe(0);

    const high = computeHeightRatioMetrics({ heightCm: 999, headRatio: 15, footwearBonusCm: 99 });
    expect(high.bareHeightCm).toBe(MAX_HEIGHT_CM);
    expect(high.headRatio).toBe(MAX_HEAD_RATIO);
    expect(high.footwearBonusCm).toBe(MAX_FOOTWEAR_BONUS_CM);

    const nanSafe = computeHeightRatioMetrics({ heightCm: Number.NaN, headRatio: Number.POSITIVE_INFINITY, footwearBonusCm: Number.NaN });
    expect(Number.isFinite(nanSafe.effectiveHeightCm)).toBe(true);
    expect(nanSafe.headRatio).toBe(7.5);
  });

  it("두신 눈금선(headDivisions)이 0부터 floor(headRatio)까지 정수리에서 순차 하강한다", () => {
    const m = computeHeightRatioMetrics({ heightCm: 184, headRatio: 8.0, footwearBonusCm: 2 });
    expect(m.headDivisions).toHaveLength(9);
    expect(m.headDivisions[0]?.heightFromFloorCm).toBe(186);
    for (let i = 1; i < m.headDivisions.length; i += 1) {
      expect(m.headDivisions[i]!.heightFromFloorCm).toBeLessThan(m.headDivisions[i - 1]!.heightFromFloorCm);
    }
  });

  it("compareCastHeights가 기준 대비 키 차·눈높이 차·최대 편차·쌍별 차이·투샷 가이드를 산출한다", () => {
    const lead = createCharacterPreset("taehyun-lead");
    const entries = buildCastHeightEntries(lead);
    const cmp = compareCastHeights(entries, "taehyun-lead");

    expect(cmp.referenceId).toBe("taehyun-lead");
    expect(cmp.members).toHaveLength(4);
    expect(cmp.tallestMember?.id).toBe("dojin-mentor");
    expect(cmp.shortestMember?.id).toBe("arin-tech");
    expect(cmp.maxHeightSpanCm).toBeCloseTo(194 - 156, 1);
    expect(cmp.pairwiseDeltas).toHaveLength(6);

    const refMember = cmp.members.find((m) => m.id === "taehyun-lead");
    const arin = cmp.members.find((m) => m.id === "arin-tech");
    expect(refMember?.isReference).toBe(true);
    expect(refMember?.deltaFromReferenceCm).toBe(0);
    expect(arin?.deltaFromReferenceCm).toBeCloseTo(156 - 184.5, 1);
    expect(arin?.framingGuideKo).toContain("시선 보정 필수");
  });

  it("compareCastHeights가 빈 배열과 미등록 referenceId를 안전하게 처리한다", () => {
    const empty = compareCastHeights([]);
    expect(empty.referenceId).toBeNull();
    expect(empty.members).toHaveLength(0);
    expect(empty.maxHeightSpanCm).toBe(0);

    const fallback = compareCastHeights(
      [
        { id: "a", nameKo: "갑", nameEn: "A", heightCm: 170, headRatio: 7.0 },
        { id: "b", nameKo: "을", nameEn: "B", heightCm: 173, headRatio: 7.2 },
      ],
      "non-existent",
    );
    expect(fallback.referenceId).toBe("a");
    expect(fallback.members[1]?.deltaFromReferenceCm).toBe(3);
    expect(fallback.members[1]?.framingGuideKo).toContain("수평 아이레벨");
  });
});

describe("2. 표정 9궁도 매트릭스 및 프리셋 불변성", () => {
  it("DEFAULT_EXPRESSION_9GRID가 정확히 9대 감정·3×3 고유 좌표·4부위 작화 노트를 포함한다", () => {
    expect(DEFAULT_EXPRESSION_9GRID).toHaveLength(9);
    expect(DEFAULT_EXPRESSION_9GRID.map((c) => c.id)).toEqual(EXPRESSION_SLOT_IDS);
    expect(DEFAULT_EXPRESSION_9GRID.map((c) => c.labelKo)).toEqual([
      "기쁨", "분노", "슬픔", "놀람", "무표정", "당황", "비웃음", "피곤", "진지",
    ]);

    const coords = new Set(DEFAULT_EXPRESSION_9GRID.map((c) => `${c.gridRow}-${c.gridCol}`));
    expect(coords.size).toBe(9);
    for (const cell of DEFAULT_EXPRESSION_9GRID) {
      expect(cell.eyebrowNote.length).toBeGreaterThan(5);
      expect(cell.eyeNote.length).toBeGreaterThan(5);
      expect(cell.mouthNote.length).toBeGreaterThan(5);
      expect(cell.blushSweatNote.length).toBeGreaterThan(5);
    }
  });

  it("updateExpressionGridCell이 대상 표정 노트만 불변 갱신한다", () => {
    const next = updateExpressionGridCell(DEFAULT_EXPRESSION_9GRID, "smirk", {
      mouthNote: "좌측 입꼬리 12도 비대칭 상승",
    });
    expect(next).not.toBe(DEFAULT_EXPRESSION_9GRID);
    expect(next.find((c) => c.id === "smirk")?.mouthNote).toBe("좌측 입꼬리 12도 비대칭 상승");
    expect(DEFAULT_EXPRESSION_9GRID.find((c) => c.id === "smirk")?.mouthNote).not.toBe("좌측 입꼬리 12도 비대칭 상승");
  });

  it("4인 캐릭터 프리셋 카탈로그가 모두 완비되어 있고 고유 신장·코드를 가진다", () => {
    expect(CHARACTER_PRESET_IDS).toHaveLength(4);
    expect(CHARACTER_SHEET_PRESETS).toHaveLength(4);
    const codes = new Set(CHARACTER_SHEET_PRESETS.map((p) => p.code));
    expect(codes.size).toBe(4);
  });

  it("createCharacterPreset이 깊은 복사본을 반환해 원본 프리셋을 오염시키지 않는다", () => {
    const copy = createCharacterPreset("seoyeon-colead");
    const mutated = updateOutfitContinuitySlot(copy.outfits, "uniform", { silhouetteSummary: "테스트 수정" });
    expect(mutated.find((o) => o.id === "uniform")?.silhouetteSummary).toBe("테스트 수정");
    expect(CHARACTER_SHEET_PRESETS.find((p) => p.id === "seoyeon-colead")?.outfits[0]?.silhouetteSummary).not.toBe("테스트 수정");
  });
});

describe("3. 의상 연속성 5슬롯 · 공식 OKLCH 컬러 칩 · 인쇄 주의 · 채색 금지 규칙", () => {
  it("모든 프리셋이 uniform/casual/combat/damaged/winter 5슬롯과 필수 소품을 모두 포함한다", () => {
    for (const preset of CHARACTER_SHEET_PRESETS) {
      expect(preset.outfits.map((o) => o.id)).toEqual(OUTFIT_SLOT_IDS);
      for (const slot of preset.outfits) {
        expect(slot.silhouetteSummary.length).toBeGreaterThan(4);
        expect(slot.keyAccessories.length).toBeGreaterThanOrEqual(1);
        expect(slot.continuityChecklist.length).toBeGreaterThan(4);
      }
    }
  });

  it("updateOutfitContinuitySlot이 대상 슬롯의 실루엣과 소품 목록을 불변 갱신한다", () => {
    const preset = createCharacterPreset("taehyun-lead");
    const updated = updateOutfitContinuitySlot(preset.outfits, "combat", {
      keyAccessories: ["전술 반장갑", "허리 통신기"],
      damageOrWeatherRule: "야간 빗속 광택 반사 1줄 제한",
    });
    const combat = updated.find((s) => s.id === "combat");
    expect(combat?.keyAccessories).toEqual(["전술 반장갑", "허리 통신기"]);
    expect(combat?.damageOrWeatherRule).toBe("야간 빗속 광택 반사 1줄 제한");
    expect(preset.outfits.find((s) => s.id === "combat")?.keyAccessories).not.toEqual(["전술 반장갑", "허리 통신기"]);
  });

  it("formatOklchCss와 formatOklchSpec가 OKLCH 값을 정규화하고 각도를 0~360°로 래핑한다", () => {
    expect(formatOklchCss({ l: 0.62, c: 0.14, h: 252 })).toBe("oklch(0.62 0.140 252.0)");
    expect(formatOklchCss({ l: 1.5, c: -0.2, h: -30 })).toBe("oklch(0.98 0.000 330.0)");
    expect(formatOklchSpec({ l: 0.48, c: 0.095, h: 390 })).toBe("L 0.48 · C 0.095 · H 30°");
  });

  it("assessOklchPrintGamut가 안전·경계·클리핑 위험 색역을 정확히 판별한다", () => {
    expect(assessOklchPrintGamut({ l: 0.65, c: 0.06, h: 55 }).level).toBe("safe");
    expect(assessOklchPrintGamut({ l: 0.68, c: 0.145, h: 72 }).level).toBe("caution");
    expect(assessOklchPrintGamut({ l: 0.64, c: 0.22, h: 140 }).level).toBe("clip-risk");
    expect(assessOklchPrintGamut({ l: 0.18, c: 0.12, h: 260 }).level).toBe("clip-risk");
  });

  it("updateOfficialColorChip이 OKLCH 부분 갱신과 인쇄/금지 메모를 불변 처리한다", () => {
    const preset = createCharacterPreset("taehyun-lead");
    const updated = updateOfficialColorChip(preset.colorChips, "th-eyes", {
      oklch: { c: 0.11 },
      doNotColorRule: "채도 0.12 초과 금지",
    });
    const eyes = updated.find((c) => c.id === "th-eyes");
    expect(eyes?.oklch.l).toBe(0.56);
    expect(eyes?.oklch.c).toBe(0.11);
    expect(eyes?.doNotColorRule).toBe("채도 0.12 초과 금지");
    expect(preset.colorChips.find((c) => c.id === "th-eyes")?.oklch.c).toBe(0.135);
  });
});

describe("4. 완성도 점수 감사(0~100) 및 Markdown/JSON 설정집 내보내기", () => {
  it("모든 기본 프리셋이 100/100(production-ready) 및 누락 항목 0건을 달성한다", () => {
    for (const id of CHARACTER_PRESET_IDS) {
      const sheet = createCharacterPreset(id);
      const audit = auditCharacterSheetCompleteness(sheet);
      expect(audit.totalScore).toBe(100);
      expect(audit.grade).toBe("production-ready");
      expect(audit.missingItems).toHaveLength(0);
      expect(audit.completedChecklistCount).toBe(audit.totalChecklistCount);
    }
  });

  it("표정·의상·컬러 금지 규칙이 누락되면 감점되고 정확한 missingItems를 반환한다", () => {
    const base = createCharacterPreset("taehyun-lead");
    const degraded = {
      ...base,
      asymmetryPoints: "",
      expressions: updateExpressionGridCell(base.expressions, "anger", { eyebrowNote: "", mouthNote: "" }),
      outfits: updateOutfitContinuitySlot(base.outfits, "damaged", { keyAccessories: [] }),
      colorChips: updateOfficialColorChip(base.colorChips, "th-hair", { doNotColorRule: "" }),
      globalColoringProhibitions: ["하나만 남긴 금지 규칙"],
    };

    const audit = auditCharacterSheetCompleteness(degraded);
    expect(audit.totalScore).toBeLessThan(95);
    expect(audit.totalScore).toBeGreaterThan(60);
    const ids = audit.missingItems.map((i) => i.id);
    expect(ids).toContain("missing-asymmetry-points");
    expect(ids).toContain("missing-expr-anger-eyebrowNote");
    expect(ids).toContain("missing-expr-anger-mouthNote");
    expect(ids).toContain("missing-outfit-accessories-damaged");
    expect(ids).toContain("missing-chip-do-not-color");
    expect(ids).toContain("missing-global-prohibitions");
  });

  it("표정/의상 슬롯 자체 누락 및 컬러 칩 부족 시 critical 이슈를 보고하고 draft-incomplete로 판정한다", () => {
    const base = createCharacterPreset("arin-tech");
    const broken = {
      ...base,
      nameKo: "",
      expressions: base.expressions.slice(0, 3),
      outfits: base.outfits.slice(0, 2),
      colorChips: base.colorChips.slice(0, 1),
      globalColoringProhibitions: [],
    };
    const audit = auditCharacterSheetCompleteness(broken);
    expect(audit.totalScore).toBeGreaterThanOrEqual(0);
    expect(audit.totalScore).toBeLessThan(65);
    expect(audit.grade).toBe("draft-incomplete");
    expect(audit.missingItems.some((i) => i.severity === "critical")).toBe(true);
  });

  it("exportCharacterSheetMarkdown이 3면도 눈금표·키 비교·표정 9궁도·의상 5슬롯·OKLCH 규칙을 조판한다", () => {
    const sheet = createCharacterPreset("taehyun-lead");
    const cast = buildCastHeightEntries(sheet);
    const mdKo = exportCharacterSheetMarkdown(sheet, { cast, locale: "ko" });
    expect(mdKo).toContain("상업 연재 캐릭터 설정집");
    expect(mdKo).toContain("등신비 · 신장 3면도 눈금표");
    expect(mdKo).toContain("다인 캐릭터 키 차이 비교");
    expect(mdKo).toContain("표정 9궁도 작화 지침");
    expect(mdKo).toContain("[damaged]");
    expect(mdKo).toContain("oklch(");
    expect(mdKo).toContain("전역 채색 금지 규칙");
    expect(mdKo).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);

    const mdEn = exportCharacterSheetMarkdown(sheet, { cast, locale: "en" });
    expect(mdEn).toContain("Character Bible Sheet");
    expect(mdEn).toContain("Expression 9-Grid Matrix");
    expect(mdEn).toContain("Global Do-Not-Color Rules");
  });

  it("exportCharacterSheetJson이 버전 스키마와 계산된 metrics·audit를 유효한 JSON으로 직렬화한다", () => {
    const sheet = createCharacterPreset("dojin-mentor");
    const cast = buildCastHeightEntries(sheet);
    const raw = exportCharacterSheetJson(sheet, { cast });
    const parsed = JSON.parse(raw) as {
      schemaVersion: string;
      sheet: { id: string };
      heightMetrics: { effectiveHeightCm: number };
      castComparison: { members: unknown[] };
      completenessAudit: { totalScore: number };
    };
    expect(parsed.schemaVersion).toBe("toonstudio.character-sheet-bible.v1");
    expect(parsed.sheet.id).toBe("dojin-mentor");
    expect(parsed.heightMetrics.effectiveHeightCm).toBe(194);
    expect(parsed.castComparison.members).toHaveLength(4);
    expect(parsed.completenessAudit.totalScore).toBe(100);
  });
});

describe("5. StudioCharacterSheetBiblePanel UI 상호작용 및 단독 렌더", () => {
  it("Props 없이 단독 렌더 시 KPI·SVG 키 비교 눈금자·표정 9궁도·의상 5탭·미리보기가 정상 표시된다", () => {
    render(<StudioCharacterSheetBiblePanel />);

    expect(screen.getByTestId("studio-character-sheet-bible-panel")).toBeTruthy();
    expect(screen.getByTestId("bible-completeness-score").textContent).toBe("100 / 100");
    expect(screen.getByTestId("bible-effective-height").textContent).toBe("184.5 cm");
    expect(screen.getByTestId("bible-height-ruler-svg").getAttribute("data-cast-count")).toBe("4");
    for (const id of EXPRESSION_SLOT_IDS) {
      expect(screen.getByTestId(`bible-expr-card-${id}`)).toBeTruthy();
    }
    for (const slotId of OUTFIT_SLOT_IDS) {
      expect(screen.getByTestId(`bible-outfit-tab-${slotId}`)).toBeTruthy();
    }
    expect(screen.getByTestId("bible-export-preview").textContent).toContain("강태현");
  });

  it("4인 캐릭터 프리셋 전환 및 초기화 버튼이 상태와 SVG 눈금자를 즉시 갱신한다", () => {
    render(<StudioCharacterSheetBiblePanel />);

    fireEvent.click(screen.getByTestId("bible-preset-arin-tech"));
    expect(screen.getByTestId("bible-preset-arin-tech").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("bible-effective-height").textContent).toBe("156.0 cm");
    expect(screen.getByTestId("bible-height-ruler-svg").getAttribute("data-head-ratio")).toBe("6");

    fireEvent.change(screen.getByTestId("bible-height-slider"), { target: { value: "162" } });
    expect(screen.getByTestId("bible-height-readout").textContent).toBe("162.0 cm");

    fireEvent.click(screen.getByTestId("bible-reset-btn"));
    expect(screen.getByTestId("bible-height-readout").textContent).toBe("154.0 cm");
    expect(screen.getByTestId("bible-status-banner").textContent).toContain("복원");
  });

  it("키·등신·굽 보정 슬라이더 조작 시 3면도 눈금 좌표와 SVG 속성이 실시간 반영된다", () => {
    render(<StudioCharacterSheetBiblePanel />);

    fireEvent.change(screen.getByTestId("bible-height-slider"), { target: { value: "190" } });
    fireEvent.change(screen.getByTestId("bible-head-ratio-slider"), { target: { value: "8" } });
    fireEvent.change(screen.getByTestId("bible-footwear-slider"), { target: { value: "5" } });

    expect(screen.getByTestId("bible-effective-height").textContent).toBe("195.0 cm");
    expect(screen.getByTestId("bible-height-ruler-svg").getAttribute("data-effective-height-cm")).toBe("195");
    expect(screen.getByTestId("bible-landmark-head").textContent).toContain("171.3 cm");
  });

  it("표정 9궁도 카드 선택 후 눈썹 노트를 비우면 완성도 점수가 하락하고 누락 항목 경고가 표시된다", () => {
    render(<StudioCharacterSheetBiblePanel />);

    fireEvent.click(screen.getByTestId("bible-expr-card-anger"));
    expect(screen.getByTestId("bible-expr-card-anger").getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(screen.getByTestId("bible-expr-input-eyebrow"), { target: { value: "" } });
    expect(screen.getByTestId("bible-completeness-score").textContent).not.toBe("100 / 100");
    expect(screen.getByTestId("bible-issue-missing-expr-anger-eyebrowNote")).toBeTruthy();
  });

  it("의상 5슬롯 탭 전환·연속성 노트 편집·컬러 칩 필터 토글 및 채색 금지 규칙 편집이 동작한다", () => {
    render(<StudioCharacterSheetBiblePanel />);

    fireEvent.click(screen.getByTestId("bible-outfit-tab-winter"));
    expect(screen.getByTestId("bible-outfit-tab-winter").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("bible-color-chip-th-winter-scarf")).toBeTruthy();

    fireEvent.change(screen.getByTestId("bible-outfit-accessories-input"), { target: { value: "" } });
    expect(screen.getByTestId("bible-issue-missing-outfit-accessories-winter")).toBeTruthy();

    fireEvent.click(screen.getByTestId("bible-chip-filter-toggle"));
    expect(screen.getByTestId("bible-color-chip-th-combat-armor")).toBeTruthy();

    fireEvent.change(screen.getByTestId("bible-chip-donot-th-skin"), { target: { value: "" } });
    expect(screen.getByTestId("bible-issue-missing-chip-do-not-color")).toBeTruthy();
  });

  it("Markdown/JSON 복사 버튼, 미리보기 탭 전환, 영문 로케일 및 콜백이 정확히 동작한다", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const onSheetChange = vi.fn();
    const onExportMarkdown = vi.fn();
    const onExportJson = vi.fn();

    render(
      <StudioCharacterSheetBiblePanel
        locale="en"
        initialPresetId="seoyeon-colead"
        onSheetChange={onSheetChange}
        onExportMarkdown={onExportMarkdown}
        onExportJson={onExportJson}
      />,
    );

    expect(onSheetChange).toHaveBeenCalled();
    expect(screen.getByTestId("bible-copy-markdown-btn").textContent).toContain("Copy Markdown");

    fireEvent.click(screen.getByTestId("bible-copy-markdown-btn"));
    await waitFor(() => expect(onExportMarkdown).toHaveBeenCalledTimes(1));
    expect(onExportMarkdown.mock.calls[0]?.[0]).toContain("Yoon Seoyeon");

    fireEvent.click(screen.getByTestId("bible-copy-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.character-sheet-bible.v1");
    expect(screen.getByTestId("bible-export-preview").textContent).toContain('"schemaVersion"');

    fireEvent.click(screen.getByTestId("bible-export-tab-hidden"));
    expect(screen.queryByTestId("bible-export-preview")).toBeNull();
  });
});

describe("6. 코드 위생 및 Calm Atelier 규율 자가 검증", () => {
  it("4개 파일 800줄 이하 및 금지 패턴(원시 색·transition-all·= {}·Web Storage·private Map store·BigInt·Sparkles) 0건", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "character-sheet-bible-engine.ts",
      "StudioCharacterSheetBiblePanel.tsx",
      "index.ts",
      "character-sheet-bible-studio.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "character-sheet-bible-studio.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }

      if (file === "StudioCharacterSheetBiblePanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
