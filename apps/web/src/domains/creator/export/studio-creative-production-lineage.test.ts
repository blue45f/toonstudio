import { describe, expect, it } from "vitest";

import { evaluateCreativeProductionLineage } from "./studio-creative-production-lineage";

describe("studio-creative-production-lineage (Waves 60–69)", () => {
  it("clears consistent BG3D/brush/human-primary episodes and flags CRDT or poly-budget violations", () => {
    const ok = evaluateCreativeProductionLineage({
      seriesTitle: "황녀의 검",
      episodeLabel: "12화",
      bg3d: {
        previousExposureEv: 1.0,
        currentExposureEv: 1.4,
        previousFovDeg: 35,
        currentFovDeg: 40,
        triangleCount: 120_000,
        textureMemoryMb: 128,
      },
      brushPackLocked: true,
      maxPaletteDeltaE: 3.2,
      humanStrokeRatioPercent: 92,
      unresolvedCrdtConflicts: 0,
      remainingAssistantHours: 6,
      hoursUntilDeadline: 18,
    });
    expect(ok.readyForExport).toBe(true);
    expect(ok.humanAuthorshipTier).toBe("human-primary");
    expect(ok.deadlineRisk).toBe("safe");
    expect(ok.lineageDigestHash).toMatch(/^fnv1a-/);

    const blocked = evaluateCreativeProductionLineage({
      seriesTitle: "황녀의 검",
      episodeLabel: "13화",
      bg3d: {
        previousExposureEv: 1.0,
        currentExposureEv: 3.5,
        previousFovDeg: 35,
        currentFovDeg: 40,
        triangleCount: 400_000,
        textureMemoryMb: 512,
      },
      brushPackLocked: false,
      maxPaletteDeltaE: 12,
      humanStrokeRatioPercent: 35,
      unresolvedCrdtConflicts: 2,
      remainingAssistantHours: 24,
      hoursUntilDeadline: 12,
    });
    expect(blocked.readyForExport).toBe(false);
    expect(blocked.blockers.length).toBeGreaterThanOrEqual(5);
  });
});
