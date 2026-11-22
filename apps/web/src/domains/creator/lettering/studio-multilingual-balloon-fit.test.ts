import { describe, expect, it } from "vitest";

import {
  BALLOON_TIGHT_UTILIZATION_THRESHOLD,
  MOBILE_MIN_READABLE_FONT_PX,
  MOBILE_VIEWPORT_WIDTH_PX,
  MULTILINGUAL_BALLOON_EXPANSION_PROFILES,
  diagnoseMultilingualBalloonFit,
  diagnoseMultilingualBalloonLocale,
  normalizeMultilingualTargetLocale,
  type MultilingualBalloonFitInput,
} from "./studio-multilingual-balloon-fit";

describe("studio-multilingual-balloon-fit", () => {
  it("exposes exact canonical expansion factors for en, ja, th, es, and zh", () => {
    expect(MULTILINGUAL_BALLOON_EXPANSION_PROFILES.en.expansionFactor).toBe(1.35);
    expect(MULTILINGUAL_BALLOON_EXPANSION_PROFILES.ja.expansionFactor).toBe(1.12);
    expect(MULTILINGUAL_BALLOON_EXPANSION_PROFILES.th.expansionFactor).toBe(1.28);
    expect(MULTILINGUAL_BALLOON_EXPANSION_PROFILES.es.expansionFactor).toBe(1.42);
    expect(MULTILINGUAL_BALLOON_EXPANSION_PROFILES.zh.expansionFactor).toBe(0.85);
  });

  it("classifies safe, tight, and overflow deterministically across locales as expansion grows", () => {
    // 720px 캔버스 기준 말풍선 220x145px, 폰트 24px, 행간 1.35
    // 내부 폭 = 220 - 28 = 192px (줄당 8자), 내부 높이 = 145 - 27 = 118px (3줄 = 97.2px = 82.4%, 4줄 = 129.6px = 109.8%)
    const report = diagnoseMultilingualBalloonFit({
      boxWidthPx: 220,
      boxHeightPx: 145,
      fontSizePx: 24,
      lineHeight: 1.35,
      sourceCharCount: 20,
    });

    const byLocale = new Map(report.locales.map((item) => [item.locale, item]));
    expect(byLocale.get("zh")?.risk).toBe("safe");
    expect(byLocale.get("ja")?.risk).toBe("safe");
    expect(byLocale.get("th")?.risk).toBe("overflow");
    expect(byLocale.get("en")?.risk).toBe("overflow");
    expect(byLocale.get("es")?.risk).toBe("overflow");

    expect(byLocale.get("zh")?.estimatedCharCount).toBe(17);
    expect(byLocale.get("ja")?.estimatedCharCount).toBe(22);
    expect(byLocale.get("th")?.estimatedCharCount).toBe(26);
    expect(byLocale.get("en")?.estimatedCharCount).toBe(27);
    expect(byLocale.get("es")?.estimatedCharCount).toBe(28);

    // 확장 계수가 커질수록 예상 글자 수와 점유율은 단조 비감소한다.
    const ordered = ["zh", "ja", "th", "en", "es"] as const;
    for (let index = 1; index < ordered.length; index += 1) {
      const prev = byLocale.get(ordered[index - 1]!);
      const curr = byLocale.get(ordered[index]!);
      expect(curr!.estimatedCharCount).toBeGreaterThanOrEqual(prev!.estimatedCharCount);
      expect(curr!.heightUtilization).toBeGreaterThanOrEqual(prev!.heightUtilization);
    }

    expect(report.worstRisk).toBe("overflow");
    expect(report.overflowLocaleCount).toBe(3);
    expect(report.maxRequiredExpandPx).toBeGreaterThan(0);
  });

  it("detects tight utilization between 85% and 100% without false overflow", () => {
    // 220x138px, 폰트 24px → 내부 높이 111px, 3줄 97.2px → 점유율 0.876 (tight)
    const ja = diagnoseMultilingualBalloonLocale(
      {
        boxWidthPx: 220,
        boxHeightPx: 138,
        fontSizePx: 24,
        lineHeight: 1.35,
        sourceCharCount: 16,
      },
      "ja",
    );

    expect(ja.heightUtilization).toBeGreaterThan(BALLOON_TIGHT_UTILIZATION_THRESHOLD);
    expect(ja.heightUtilization).toBeLessThanOrEqual(1);
    expect(ja.risk).toBe("tight");
    expect(ja.minBalloonExpandPx).toBe(0);
    expect(ja.recommendedFontShrinkRatio).toBe(1);
    expect(ja.guidanceKo).toContain("빠듯합니다");
  });

  it("computes recommended font shrink ratio when shrinking stays above the 390px mobile floor", () => {
    // 720px 캔버스에서 390px 최소 폰트 하한은 20.5px (11.1px CSS).
    // 현재 폰트 30px → 약 25~27px로 줄이면 390px 가독성 하한(20.5px) 위에서 충분히 해결된다.
    const en = diagnoseMultilingualBalloonLocale(
      {
        boxWidthPx: 260,
        boxHeightPx: 160,
        fontSizePx: 30,
        lineHeight: 1.35,
        sourceCharCount: 18,
        canvasWidthPx: 720,
      },
      "en",
    );

    expect(en.risk).toBe("overflow");
    expect(en.mobileReadabilityGuarded).toBe(false);
    expect(en.recommendedFontSizePx).toBeLessThan(30);
    expect(en.recommendedFontSizePx).toBeGreaterThanOrEqual(20.5);
    expect(en.effectiveMobileFontPx).toBeGreaterThanOrEqual(MOBILE_MIN_READABLE_FONT_PX);
    expect(en.recommendedFontShrinkRatio).toBeLessThan(1);
    expect(en.recommendedFontShrinkPercent).toBeGreaterThan(0);
    expect(en.minBalloonExpandHeightPx).toBeGreaterThan(0);
    expect(en.minBalloonExpandWidthPx).toBeGreaterThan(0);
    expect(en.guidanceKo).toContain("축소");
  });

  it("enforces the 390px mobile minimum font-size guard and recommends balloon expansion instead", () => {
    // 720px 캔버스에서 390px 최소 하한은 20.5px.
    // 긴 한국어 원문(45자)을 좁은 박스(200x130px)에 22px로 넣으면 20.5px에서도 넘친다.
    const report = diagnoseMultilingualBalloonFit({
      boxWidthPx: 200,
      boxHeightPx: 130,
      fontSizePx: 22,
      lineHeight: 1.35,
      sourceText: "오늘 밤 자정 전에 탑 꼭대기에서 만나지 않으면 계약은 전부 무효가 됩니다 알겠죠",
      canvasWidthPx: 720,
    });

    const es = report.locales.find((item) => item.locale === "es");
    expect(es).toBeDefined();
    expect(es!.risk).toBe("overflow");
    expect(es!.mobileReadabilityGuarded).toBe(true);
    expect(es!.recommendedFontSizePx).toBe(report.minCanvasFontSizeForMobilePx);
    expect(es!.effectiveMobileFontPx).toBeGreaterThanOrEqual(MOBILE_MIN_READABLE_FONT_PX);
    expect(es!.minBalloonExpandHeightPx).toBeGreaterThan(50);
    expect(es!.guidanceKo).toContain("390px 모바일 가독성");
    expect(report.guardedLocaleCount).toBeGreaterThan(0);
    expect(report.summaryKo).toContain("390px 가독성 하한 보호");
  });

  it("flags when the author's current font size is already below the 390px mobile readability floor", () => {
    // 720px 캔버스에 16px 폰트 → 390px 모바일에서 8.7px (< 11px)
    const report = diagnoseMultilingualBalloonFit({
      boxWidthPx: 240,
      boxHeightPx: 160,
      fontSizePx: 16,
      lineHeight: 1.3,
      sourceText: "짧은 대사",
      canvasWidthPx: 720,
    });

    expect(report.currentFontBelowMobileFloor).toBe(true);
    expect(report.currentMobileFontPx).toBeLessThan(MOBILE_MIN_READABLE_FONT_PX);
    expect(report.minCanvasFontSizeForMobilePx).toBe(20.5);
    expect(report.locales[0]?.recommendedFontSizePx).toBe(20.5);
    expect(report.locales[0]?.mobileReadabilityGuarded).toBe(true);
    expect(report.summaryKo).toContain("20.5px 이상");
  });

  it("supports 1:1 390px mobile coordinate space and explicit multiline Korean text", () => {
    const report = diagnoseMultilingualBalloonFit({
      boxWidthPx: 180,
      boxHeightPx: 120,
      fontSizePx: 14,
      lineHeight: 1.35,
      sourceText: "첫 번째 줄 대사입니다\n두 번째 줄 대사입니다\n세 번째 줄 대사입니다",
      canvasWidthPx: MOBILE_VIEWPORT_WIDTH_PX,
    });

    expect(report.mobileScale).toBe(1);
    expect(report.minCanvasFontSizeForMobilePx).toBe(MOBILE_MIN_READABLE_FONT_PX);
    const en = report.locales.find((item) => item.locale === "en");
    expect(en!.estimatedLineCount).toBeGreaterThanOrEqual(3);
  });

  it("handles empty source text, locale normalization, custom overrides, and immutable output", () => {
    const input: MultilingualBalloonFitInput = {
      boxWidthPx: 240,
      boxHeightPx: 160,
      fontSizePx: 24,
      lineHeight: 1.35,
      sourceText: "   ",
    };
    const emptyReport = diagnoseMultilingualBalloonFit(input);
    expect(emptyReport.sourceCharCount).toBe(0);
    expect(emptyReport.worstRisk).toBe("safe");
    expect(emptyReport.maxRequiredExpandPx).toBe(0);
    expect(Object.isFrozen(emptyReport)).toBe(true);
    expect(Object.isFrozen(emptyReport.locales)).toBe(true);

    expect(normalizeMultilingualTargetLocale("en-US")).toBe("en");
    expect(normalizeMultilingualTargetLocale("ja-JP")).toBe("ja");
    expect(normalizeMultilingualTargetLocale("th-TH")).toBe("th");
    expect(normalizeMultilingualTargetLocale("es-MX")).toBe("es");
    expect(normalizeMultilingualTargetLocale("zh-Hans")).toBe("zh");
    expect(normalizeMultilingualTargetLocale("fr-FR")).toBeNull();

    const overridden = diagnoseMultilingualBalloonLocale(
      {
        boxWidthPx: 240,
        boxHeightPx: 160,
        fontSizePx: 24,
        lineHeight: 1.35,
        sourceCharCount: 10,
        expansionFactorOverrides: { en: 1.8 },
      },
      "en",
    );
    expect(overridden.expansionFactor).toBe(1.8);
    expect(overridden.estimatedCharCount).toBe(18);
  });

  it("throws deterministically on invalid non-positive dimensions or bad padding", () => {
    expect(() =>
      diagnoseMultilingualBalloonFit({
        boxWidthPx: 0,
        boxHeightPx: 120,
        fontSizePx: 24,
        lineHeight: 1.35,
        sourceCharCount: 10,
      }),
    ).toThrow(/boxWidthPx/);

    expect(() =>
      diagnoseMultilingualBalloonFit({
        boxWidthPx: 100,
        boxHeightPx: 100,
        fontSizePx: 24,
        lineHeight: 1.35,
        paddingPx: 50,
        sourceCharCount: 10,
      }),
    ).toThrow(/paddingPx/);
  });
});
