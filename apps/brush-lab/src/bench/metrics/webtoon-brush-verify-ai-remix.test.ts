import { describe, expect, it } from "vitest";

import {
  WEBTOON_BRUSH_GENRE_RECOMMENDATIONS,
  evaluateWebtoonBrushVerifyAiGate,
} from "./webtoon-brush-verify-ai-remix";

describe("webtoon-brush-verify-ai-remix", () => {
  it("evaluates all 6 brush quality metrics and 5-lens remixes across webtoon genres", () => {
    expect(WEBTOON_BRUSH_GENRE_RECOMMENDATIONS).toHaveLength(4);

    const report = evaluateWebtoonBrushVerifyAiGate({
      genreId: "action-gpen-slash",
      compositeBenchScore100: 96.4,
      chromaPreservationGain01: 0.34,
      mudEliminationGain01: 0.41,
      eightHourFrameDriftPct: 1.2,
    });

    expect(report.passed).toBe(true);
    expect(report.overallScore100).toBeGreaterThanOrEqual(99);
    expect(report.taperSharpnessScore100).toBeGreaterThanOrEqual(99.5);
    expect(report.linkedInk3dProjectionStability100).toBeGreaterThanOrEqual(99.5);
    expect(report.cleanroomLicenseSafety100).toBe(100);
    expect(report.remixes).toHaveLength(5);
    expect(report.summaryBadgeKo).toContain("Brush Verify AI PASS");
  });

  it("열화된 테이퍼·Linked Ink 텔레메트리 입력 시 점수가 정직하게 하락한다", () => {
    const degraded = evaluateWebtoonBrushVerifyAiGate({
      genreId: "action-gpen-slash",
      compositeBenchScore100: 98.0,
      chromaPreservationGain01: 0.45,
      mudEliminationGain01: 0.22,
      eightHourFrameDriftPct: 0.02,
      taperTelemetry: {
        edgeStaircaseVarianceReduction01: 0.1,
        tipSubpixelSharpness01: 0.35,
        centripetalAdaptiveScallopRatio01: 0.04,
        cornerKinkReductionRatio01: 0.2,
      },
      linkedInkTelemetry: {
        bridgeReliabilityIndex: 72.4,
      },
    });
    expect(degraded.taperSharpnessScore100).toBeLessThan(40);
    expect(degraded.linkedInk3dProjectionStability100).toBe(72.4);
    expect(degraded.passed).toBe(false);
  });

  it("recommends watercolor-wet with KM and wetBeta enabled for romance-watercolor-glow", () => {
    const report = evaluateWebtoonBrushVerifyAiGate({
      genreId: "romance-watercolor-glow",
      compositeBenchScore100: 96.4,
      chromaPreservationGain01: 0.34,
      mudEliminationGain01: 0.41,
      eightHourFrameDriftPct: 1.2,
    });

    expect(report.genreRecommendation.targetPresetId).toBe("watercolor-wet");
    expect(report.genreRecommendation.enableKmBeta).toBe(true);
    expect(report.genreRecommendation.enableWetBeta).toBe(true);
  });
});
