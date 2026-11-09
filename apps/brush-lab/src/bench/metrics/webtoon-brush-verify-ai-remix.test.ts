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
    expect(report.overallScore100).toBeGreaterThanOrEqual(94);
    expect(report.taperSharpnessScore100).toBe(97.4);
    expect(report.linkedInk3dProjectionStability100).toBe(96.2);
    expect(report.cleanroomLicenseSafety100).toBe(100);
    expect(report.remixes).toHaveLength(5);
    expect(report.summaryBadgeKo).toContain("Brush Verify AI PASS");
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
