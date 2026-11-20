import { describe, expect, it } from "vitest";

import {
  calculateRegionalNetSettlement,
  estimateBubbleTypesettingFit,
  evaluateGlobalLaunchReadinessGate,
  mapRegionalAgeRating,
  validateLocaleReadingLayout,
} from "./studio-global-distribution-engine";

describe("studio-global-distribution-engine (Waves 40–49)", () => {
  it("validates 12-locale layouts, age ratings, typesetting fit, FX/tax splits, and global launch gate", () => {
    expect(validateLocaleReadingLayout("ar-SA", 60).readingDirection).toBe("rtl");
    expect(validateLocaleReadingLayout("ja-JP", 60).readingDirection).toBe("ttb-vertical");
    expect(mapRegionalAgeRating("en-US", 2).requiresContentWarning).toBe(true);

    const bubbleOk = estimateBubbleTypesettingFit({
      bubbleId: "B1",
      locale: "en-US",
      text: "Stay back!",
      bubbleWidthPx: 180,
    });
    expect(bubbleOk.overflowRisk).toBe(false);

    const settlementEn = calculateRegionalNetSettlement({
      locale: "en-US",
      grossKrw: 3_000_000,
      withholdingRatePercent: 10,
      translatorSharePercent: 8,
      lettererSharePercent: 4,
    });
    expect(settlementEn.withholdingTaxKrw).toBe(300_000);
    expect(
      settlementEn.withholdingTaxKrw +
        settlementEn.translatorShareKrw +
        settlementEn.lettererShareKrw +
        settlementEn.creatorNetKrw,
    ).toBe(3_000_000);

    const gate = evaluateGlobalLaunchReadinessGate({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      simulpubReleaseUtcIso: "2026-12-01T15:00:00.000Z",
      watermarkPolicyEnabled: true,
      targets: [
        {
          locale: "en-US",
          gutterPx: 64,
          sfxAssetsCleared: true,
          platformSpecMatched: true,
          bubbleOverflowCount: 0,
          netSettlement: settlementEn,
        },
      ],
    });
    expect(gate.readyForGlobalLaunch).toBe(true);
    expect(gate.clearedLocales).toEqual(["en-US"]);
    expect(gate.globalLaunchDigestHash).toMatch(/^fnv1a-/);
  });
});
