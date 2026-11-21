import { describe, expect, it } from "vitest";

import {
  BLENDER_WAVE2_CROSS_LABS_OBJECTS,
  calibrateCrossLabsStrokeWidthRatio,
  evaluateCrossLabsUnifiedProductionBridge,
} from "./studio-cross-labs-production-bridge";

describe("studio-cross-labs-production-bridge (Wave 2)", () => {
  it("evaluates cross-labs lighting, line-weight, perspective coherence, and 5-lens remixes", () => {
    const report = evaluateCrossLabsUnifiedProductionBridge({
      bg3dOverallScore100: 94.18,
      bg3dPreflightScore100: 95.57,
      bg3dContrastRatio: 2.45,
      bg3dSafeZoneScore100: 94.3,
      characterOverallScore100: 96.9,
      characterTurnaroundScore100: 96.4,
      characterFaceSdfScore100: 99.5,
      characterOutlineWidthMm: 3.5,
      brushOverallScore100: 97.3,
      brushTaperSharpness100: 97.4,
      brushLinkedInkStability100: 96.2,
      brushAverageStrokePx: 4.48,
      rightsBomScore100: 100,
    });

    expect(report.sceneObjectsSynced).toBe(
      BLENDER_WAVE2_CROSS_LABS_OBJECTS.length,
    );
    expect(report.coherence.releaseGatePassed).toBe(true);
    expect(report.coherence.crossLabsCoherenceIndex100).toBeGreaterThanOrEqual(
      94,
    );
    expect(
      report.coherence.unifiedVerifyAiReleaseScore100,
    ).toBeGreaterThanOrEqual(95);
    expect(report.remixes).toHaveLength(5);
    expect(report.summaryBadgeKo).toContain("Cross-Labs Verify AI PASS");

    const calibration = calibrateCrossLabsStrokeWidthRatio(4.0, 4.48, 1.25);
    expect(calibration.calibratedBrushStrokePx).toBe(5.0);
    expect(calibration.effectiveRatio).toBe(1.25);

    const calibratedReport = evaluateCrossLabsUnifiedProductionBridge({
      bg3dOverallScore100: 99.8,
      bg3dPreflightScore100: 99.8,
      bg3dContrastRatio: 3.9,
      bg3dSafeZoneScore100: 100,
      characterOverallScore100: 100,
      characterTurnaroundScore100: 100,
      characterFaceSdfScore100: 100,
      characterOutlineWidthMm: 4.0,
      brushOverallScore100: 100,
      brushTaperSharpness100: 100,
      brushLinkedInkStability100: 99.6,
      brushAverageStrokePx: 4.48,
      rightsBomScore100: 100,
      autoCalibrateStrokeRatio: true,
    });
    expect(calibratedReport.coherence.characterToBrushLineWeightMatch100).toBe(100);
    expect(calibratedReport.coherence.crossLabsCoherenceIndex100).toBeGreaterThanOrEqual(99.8);
  });
});
