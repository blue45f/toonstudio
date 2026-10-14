import { describe, expect, it } from "vitest";

import {
  DIALOGUE_EXPANSION_DEFAULTS,
  EXPANSION_CALIBRATION_MIN_SAMPLES,
  calibrateDialogueExpansion,
  estimateDialogueLength,
  formatExpansionPercent,
  formatExpansionRate,
  groupLengthBudgetWarnings,
  measureDialogueLength,
  previewDialogueLengthBudget,
  type LengthBudgetPageLike,
} from "./studio-dialogue-length-budget";
import { DIALOGUE_LOCALE_PRESETS } from "./studio-dialogue-translate";
import type { BubbleTextMeasurer } from "./studio-bubble-text-fit";

// 결정적 가짜 측정기 — text-fit/L-2 테스트와 같은 관례(글자당 fontPx*charFactor px).
function fakeMeasurer(charFactor = 0.6): BubbleTextMeasurer {
  return {
    measureWidth(text, fontPx) {
      return text.length * fontPx * charFactor;
    },
  };
}

const measurer = fakeMeasurer(0.6);

// fontSize 24 기준: 글자 폭 14.4px, 폭 200 상자면 텍스트 폭 172 → 한 줄 11자.
// 팽창률 ×1.35(영어 기본값)를 측정기 배율로 얹으면 글자 폭 19.44px → 한 줄 8자.
const LONG_TEXT = "번역되면 길어질 대사를 미리 확인해요"; // 공백 제외 17자 안팎 — 줄 수 변화로 판정한다.

function bubblePage(
  elements: LengthBudgetPageLike["elements"],
  extra: Partial<LengthBudgetPageLike> = {}
): LengthBudgetPageLike[] {
  return [{ id: "page-1", elements, ...extra }];
}

describe("measureDialogueLength / estimateDialogueLength", () => {
  it("공백 런을 한 칸으로 접고 코드 포인트로 센다", () => {
    expect(measureDialogueLength("안녕  하세요\n반갑습니다")).toBe(
      Array.from("안녕 하세요 반갑습니다").length
    );
    expect(measureDialogueLength("😀😀")).toBe(2);
    expect(measureDialogueLength("   ")).toBe(0);
    expect(measureDialogueLength("")).toBe(0);
  });

  it("예상 길이는 반올림하고 빈 원문은 0이다", () => {
    expect(estimateDialogueLength(10, 1.35)).toBe(14); // 13.5 → 14
    expect(estimateDialogueLength(10, 0.8)).toBe(8);
    expect(estimateDialogueLength(0, 1.35)).toBe(0);
    expect(estimateDialogueLength(3, 0.4)).toBe(1); // 최소 1
  });

  it("표시 포맷 — 배율과 증감", () => {
    expect(formatExpansionRate(1.35)).toBe("×1.35");
    expect(formatExpansionRate(0.8)).toBe("×0.8");
    expect(formatExpansionPercent(1.35)).toBe("+35%");
    expect(formatExpansionPercent(0.8)).toBe("-20%");
    expect(formatExpansionPercent(1)).toBe("±0%");
  });
});

describe("기본 팽창률 상수", () => {
  it("번역 프리셋 전 로케일에 기본값이 있고, 중국어(간체)는 축소(<1)다", () => {
    for (const preset of DIALOGUE_LOCALE_PRESETS) {
      expect(DIALOGUE_EXPANSION_DEFAULTS[preset.code]?.rate).toBeGreaterThan(0);
    }
    expect(DIALOGUE_EXPANSION_DEFAULTS.en!.rate).toBe(1.35);
    expect(DIALOGUE_EXPANSION_DEFAULTS["zh-Hans"]!.rate).toBeLessThan(1);
    expect(DIALOGUE_EXPANSION_DEFAULTS.fr!.rate).toBeGreaterThan(
      DIALOGUE_EXPANSION_DEFAULTS.en!.rate
    );
  });

  it("표에 없는 자유 입력 로케일은 폴백 1.3을 쓴다", () => {
    const profiles = calibrateDialogueExpansion([], { locales: ["de"] });
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      locale: "de",
      defaultRate: 1.3,
      measuredRate: null,
      sampleCount: 0,
      effectiveRate: 1.3,
      rateSource: "default",
    });
  });
});

describe("calibrateDialogueExpansion — 작품 실측 보정", () => {
  function pagesWithPairs(pairs: { source: string; en: string }[]): LengthBudgetPageLike[] {
    const dialogueI18n: Record<string, Record<string, string>> = {};
    pairs.forEach((pair, index) => {
      dialogueI18n[`el-${index}`] = { source: pair.source, en: pair.en };
    });
    return [{ id: "page-1", elements: [], dialogueI18n }];
  }

  it("표본이 기준 미만이면 실측값은 참고로만 남고 기본값을 유지한다", () => {
    const pairs = Array.from({ length: EXPANSION_CALIBRATION_MIN_SAMPLES - 1 }, () => ({
      source: "가나다라마바사아자차", // 10자
      en: "a".repeat(20), // 비율 2.0
    }));
    const [profile] = calibrateDialogueExpansion(pagesWithPairs(pairs), { locales: ["en"] });
    expect(profile!.sampleCount).toBe(EXPANSION_CALIBRATION_MIN_SAMPLES - 1);
    expect(profile!.measuredRate).toBe(2);
    expect(profile!.effectiveRate).toBe(1.35);
    expect(profile!.rateSource).toBe("default");
  });

  it("표본이 기준 이상이면 실측 중앙값으로 대체한다", () => {
    const pairs = Array.from({ length: EXPANSION_CALIBRATION_MIN_SAMPLES }, () => ({
      source: "가나다라마바사아자차",
      en: "a".repeat(20),
    }));
    const [profile] = calibrateDialogueExpansion(pagesWithPairs(pairs), { locales: ["en"] });
    expect(profile!.effectiveRate).toBe(2);
    expect(profile!.rateSource).toBe("measured");
  });

  it("중앙값이라 긴 대사 한 건의 극단 비율에 끌려가지 않고, 극단값은 클램프된다", () => {
    const pairs = [
      { source: "가나다라마바사아자차", en: "a".repeat(10) }, // 1.0
      { source: "가나다라마바사아자차", en: "a".repeat(100) }, // 10.0 → 클램프 3.5
      { source: "가나다라마바사아자차", en: "a".repeat(10) }, // 1.0
      { source: "가나다라마바사아자차", en: "a".repeat(10) }, // 1.0
      { source: "가나다라마바사아자차", en: "a".repeat(10) }, // 1.0
    ];
    const [profile] = calibrateDialogueExpansion(pagesWithPairs(pairs), { locales: ["en"] });
    expect(profile!.measuredRate).toBe(1);
    expect(profile!.effectiveRate).toBe(1);
  });

  it("짧은 원문(<8자)과 원문 스냅샷 없는 쌍은 표본에서 제외한다", () => {
    const pages: LengthBudgetPageLike[] = [
      {
        id: "page-1",
        elements: [],
        dialogueI18n: {
          short: { source: "짧은대사", en: "a".repeat(30) },
          noSource: { en: "a".repeat(30) },
          ok: { source: "가나다라마바사아자차", en: "a".repeat(15) },
        },
      },
    ];
    const [profile] = calibrateDialogueExpansion(pages, { locales: ["en"] });
    expect(profile!.sampleCount).toBe(1);
    expect(profile!.measuredRate).toBe(1.5);
  });
});

describe("previewDialogueLengthBudget — 예상 길이 표시", () => {
  it("대사마다·로케일마다 예상 길이를 계산하고 회차 합계가 대사별 합과 일치한다", () => {
    const result = previewDialogueLengthBudget(
      bubblePage([
        { id: "b1", type: "bubble", text: "안녕하세요", width: 200, height: 160, fontSize: 24 },
        { id: "t1", type: "text", text: "나레이션입니다" },
      ]),
      { measurer, locales: ["en", "zh-Hans"] }
    );
    const b1 = result.items.find((item) => item.itemId === "b1")!;
    expect(b1.sourceLength).toBe(5);
    expect(b1.estimates.find((e) => e.locale === "en")!.expectedLength).toBe(7); // 5×1.35=6.75→7
    expect(b1.estimates.find((e) => e.locale === "zh-Hans")!.expectedLength).toBe(4); // 5×0.8
    const enTotal = result.totals.find((t) => t.locale === "en")!;
    const perItemSum = result.items.reduce(
      (sum, item) => sum + item.estimates.find((e) => e.locale === "en")!.expectedLength,
      0
    );
    expect(enTotal.expectedTotalLength).toBe(perItemSum);
    expect(enTotal.sourceTotalLength).toBe(
      result.items.reduce((sum, item) => sum + item.sourceLength, 0)
    );
    expect(result.summary.textCount).toBe(1);
    expect(result.summary.bubbleCount).toBe(1);
  });

  it("숨김 대사는 기본 제외, includeHidden으로 포함한다", () => {
    const pages = bubblePage([
      { id: "b1", type: "bubble", text: "보이는 대사", width: 200, height: 160, hidden: true },
    ]);
    const excluded = previewDialogueLengthBudget(pages, { measurer, locales: ["en"] });
    expect(excluded.summary.totalItemCount).toBe(0);
    const included = previewDialogueLengthBudget(pages, {
      measurer,
      locales: ["en"],
      includeHidden: true,
    });
    expect(included.summary.totalItemCount).toBe(1);
  });

  it("번역만 있고 원문 스냅샷이 없는 대사는 제외하고 따로 센다", () => {
    const pages = bubblePage(
      [{ id: "b1", type: "bubble", text: "Translated text", width: 200, height: 160 }],
      { dialogueI18n: { b1: { en: "Translated text" } } }
    );
    const result = previewDialogueLengthBudget(pages, { measurer, locales: ["en"] });
    expect(result.summary.totalItemCount).toBe(0);
    expect(result.summary.sourceUncertainCount).toBe(1);
  });

  it("원문 스냅샷이 있으면 지금 보이는 텍스트가 번역이어도 스냅샷을 원문으로 쓴다", () => {
    const pages = bubblePage(
      [{ id: "b1", type: "bubble", text: "Hello world", width: 200, height: 160 }],
      { dialogueI18n: { b1: { source: "안녕하세요 여러분", en: "Hello world" } } }
    );
    const result = previewDialogueLengthBudget(pages, { measurer, locales: ["en"] });
    expect(result.items[0]!.sourceText).toBe("안녕하세요 여러분");
    expect(result.items[0]!.sourceLength).toBe(measureDialogueLength("안녕하세요 여러분"));
  });

  it("입력은 변형하지 않는다", () => {
    const pages = bubblePage([
      { id: "b1", type: "bubble", text: LONG_TEXT, width: 200, height: 110, fontSize: 24 },
    ]);
    const before = JSON.stringify(pages);
    previewDialogueLengthBudget(pages, { measurer, locales: ["en"] });
    expect(JSON.stringify(pages)).toBe(before);
  });
});

describe("previewDialogueLengthBudget — 말풍선 위험(팽창률을 측정기 배율로)", () => {
  it("원문은 들어가지만 영어(×1.35) 예상으로는 넘치는 말풍선을 overflow로 잡는다", () => {
    const result = previewDialogueLengthBudget(
      bubblePage([
        { id: "b1", type: "bubble", text: LONG_TEXT, width: 200, height: 110, fontSize: 24 },
      ]),
      { measurer, locales: ["en"] }
    );
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0]!;
    expect(warning.kind).toBe("overflow");
    expect(warning.locale).toBe("en");
    expect(warning.rate).toBe(1.35);
    expect(warning.rateSource).toBe("default");
    expect(warning.expectedLength).toBe(
      estimateDialogueLength(measureDialogueLength(LONG_TEXT), 1.35)
    );
    expect(warning.predictedHeight).toBeGreaterThan(110);
    expect(warning.overflowPx).toBe(warning.predictedHeight! - 110);
    expect(warning.message).toContain("영어 예상 약");
    expect(result.summary.atRiskItemCount).toBe(1);
    expect(result.summary.affectedPageCount).toBe(1);
    expect(result.totals[0]!.atRiskCount).toBe(1);
  });

  it("같은 대사도 축소 로케일(중국어 간체 ×0.8)에서는 경고가 없다", () => {
    const result = previewDialogueLengthBudget(
      bubblePage([
        { id: "b1", type: "bubble", text: LONG_TEXT, width: 200, height: 110, fontSize: 24 },
      ]),
      { measurer, locales: ["zh-Hans"] }
    );
    expect(result.warnings).toEqual([]);
    expect(result.summary.checkedBubbleCount).toBe(1);
  });

  it("넉넉한 말풍선은 팽창 예상으로도 경고가 없다", () => {
    const result = previewDialogueLengthBudget(
      bubblePage([
        { id: "b1", type: "bubble", text: LONG_TEXT, width: 200, height: 220, fontSize: 24 },
      ]),
      { measurer, locales: ["en", "fr"] }
    );
    expect(result.warnings).toEqual([]);
  });

  it("자동 축소 말풍선은 shrink로, 줄어들 폰트 크기를 알려준다", () => {
    const result = previewDialogueLengthBudget(
      bubblePage([
        {
          id: "b1",
          type: "bubble",
          text: LONG_TEXT,
          width: 200,
          height: 110,
          fontSize: 24,
          autoShrinkText: true,
        },
      ]),
      { measurer, locales: ["en"] }
    );
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0]!;
    expect(warning.kind).toBe("shrink");
    expect(warning.fittedFontSize).toBeLessThan(24);
    expect(warning.fittedFontSize).toBeGreaterThanOrEqual(10);
    expect(result.summary.shrinkCount).toBe(1);
  });

  it("크기 없는 말풍선은 확인 불가로 세되 예상 길이는 제공한다", () => {
    const result = previewDialogueLengthBudget(
      bubblePage([{ id: "b1", type: "bubble", text: "안녕하세요" }]),
      { measurer, locales: ["en"] }
    );
    expect(result.summary.unmeasurableCount).toBe(1);
    expect(result.summary.checkedBubbleCount).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(result.items[0]!.estimates[0]!.expectedLength).toBe(7);
  });

  it("세로쓰기 말풍선은 핏 판정에서 제외하고 따로 센다", () => {
    const result = previewDialogueLengthBudget(
      bubblePage([
        {
          id: "b1",
          type: "bubble",
          text: LONG_TEXT,
          width: 200,
          height: 110,
          fontSize: 24,
          vertical: true,
        },
      ]),
      { measurer, locales: ["en"] }
    );
    expect(result.summary.verticalCount).toBe(1);
    expect(result.summary.checkedBubbleCount).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(result.items[0]!.estimates[0]!.expectedLength).toBeGreaterThan(0);
  });

  it("작품 실측 보정이 채택되면 예상 길이와 경고가 실측 비율을 따른다", () => {
    // 원문 10자 ↔ 영어 20자 쌍 5건으로 보정(×2.0)된 작품.
    const dialogueI18n: Record<string, Record<string, string>> = {};
    for (let i = 0; i < EXPANSION_CALIBRATION_MIN_SAMPLES; i++) {
      dialogueI18n[`pair-${i}`] = { source: "가나다라마바사아자차", en: "a".repeat(20) };
    }
    const pages = bubblePage(
      [{ id: "b1", type: "bubble", text: "안녕하세요", width: 200, height: 160, fontSize: 24 }],
      { dialogueI18n }
    );
    const result = previewDialogueLengthBudget(pages, { measurer, locales: ["en"] });
    expect(result.profiles[0]).toMatchObject({ effectiveRate: 2, rateSource: "measured" });
    expect(result.items[0]!.estimates[0]!.expectedLength).toBe(10); // 5자 × 2.0
    expect(result.items[0]!.estimates[0]!.rateSource).toBe("measured");
  });

  it("경고 그룹핑은 페이지 순서를 보존한다", () => {
    const pages: LengthBudgetPageLike[] = [
      {
        id: "page-1",
        elements: [
          { id: "b1", type: "bubble", text: LONG_TEXT, width: 200, height: 110, fontSize: 24 },
        ],
      },
      {
        id: "page-2",
        elements: [
          { id: "b2", type: "bubble", text: LONG_TEXT, width: 200, height: 110, fontSize: 24 },
        ],
      },
    ];
    const result = previewDialogueLengthBudget(pages, { measurer, locales: ["en"] });
    const groups = groupLengthBudgetWarnings(result.warnings);
    expect(groups.map((g) => g.pageId)).toEqual(["page-1", "page-2"]);
    expect(result.summary.affectedPageCount).toBe(2);
    expect(result.summary.atRiskItemCount).toBe(2);
  });
});
