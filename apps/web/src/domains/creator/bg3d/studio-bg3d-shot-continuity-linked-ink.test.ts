import { describe, expect, it } from "vitest";

import {
  evaluateLinkedInkBridgeReliability,
  evaluateShotOverrideContinuity,
  evaluateVerifyAiPreflightGates,
  recommendBlenderCutArchetypePreset,
} from "./studio-bg3d-shot-continuity-linked-ink";

describe("studio-bg3d-shot-continuity-linked-ink", () => {
  it("calculates Shot Continuity Drift Score (S_CD) and supports Artistic Override", () => {
    const smoothCut = evaluateShotOverrideContinuity({
      prevRelativePosition: [0, 1.4, -4],
      currRelativePosition: [0.2, 1.4, -3.8],
      sceneBoundingRadiusMeters: 10,
      prevKeyLightDir: [0, -0.88, 0.47],
      currKeyLightDir: [0.05, -0.87, 0.49],
      prevFocalLengthMm: 35,
      currFocalLengthMm: 32,
      axisOfActionCrossed: false,
    });
    expect(smoothCut.status).toBe("pass");
    expect(smoothCut.continuityDriftScore).toBeLessThan(0.2);

    const jarringCut = evaluateShotOverrideContinuity({
      prevRelativePosition: [-4, 1.4, -2],
      currRelativePosition: [4, 2.5, -8],
      sceneBoundingRadiusMeters: 8,
      prevKeyLightDir: [0, -1, 0],
      currKeyLightDir: [0, 1, 0],
      prevFocalLengthMm: 24,
      currFocalLengthMm: 120,
      axisOfActionCrossed: true,
      artisticOverride: false,
    });
    expect(jarringCut.status).toBe("block");
    expect(jarringCut.continuityDriftScore).toBeGreaterThanOrEqual(0.45);
    expect(jarringCut.blendedFocalLengthRecommendationMm).toBe(72);

    const overriddenCut = evaluateShotOverrideContinuity({
      prevRelativePosition: [-4, 1.4, -2],
      currRelativePosition: [4, 2.5, -8],
      sceneBoundingRadiusMeters: 8,
      prevKeyLightDir: [0, -1, 0],
      currKeyLightDir: [0, 1, 0],
      prevFocalLengthMm: 24,
      currFocalLengthMm: 120,
      axisOfActionCrossed: true,
      artisticOverride: true,
    });
    expect(overriddenCut.artisticOverrideActive).toBe(true);
    expect(overriddenCut.status).not.toBe("block");
  });

  it("evaluates Live 2D<->3D Linked Ink Bridge Reliability Index (BRI) and homography fallback", () => {
    const healthy = evaluateLinkedInkBridgeReliability({
      meanReprojectionErrorPx: 0.7,
      hiddenLineOcclusionLeakRatio: 0.001,
      syncLatencyMs: 30,
      authoredDeltaLayerSeparated: true,
    });
    expect(healthy.mode).toBe("live-bidirectional");
    expect(healthy.bridgeReliabilityIndex).toBeGreaterThanOrEqual(90);
    expect(healthy.passedHardGate).toBe(true);

    const degraded = evaluateLinkedInkBridgeReliability({
      meanReprojectionErrorPx: 5.5,
      hiddenLineOcclusionLeakRatio: 0.08,
      syncLatencyMs: 280,
      authoredDeltaLayerSeparated: true,
    });
    expect(degraded.mode).toBe("snapshot-locked-homography");
    expect(degraded.authoredDeltaPreserved).toBe(true);
    expect(degraded.passedHardGate).toBe(true);
  });

  it("recommends optimal camera, lighting, NPR shader, and Freestyle presets per cut archetype", () => {
    const closeup = recommendBlenderCutArchetypePreset("emotion-closeup", 2.6, 0.01);
    expect(closeup.recommendedFocalLengthMm).toBe(95);
    expect(closeup.presetRecommendationScore).toBeGreaterThanOrEqual(85);
    expect(closeup.recommendedLightingRigId).toBe("magic-circle-arcane-upglow");
  });

  it("evaluates all 10 Verify AI preflight gates (V01-V10) and enforces hard gate rules", () => {
    const report = evaluateVerifyAiPreflightGates({
      archetypeId: "action-impact",
      artisticOverride: false,
      contrastRatio: 2.45,
    });
    expect(report.hardGatePassed).toBe(true);
    expect(report.metrics).toHaveLength(10);
    expect(report.totalGateScore).toBeGreaterThanOrEqual(90);
    expect(report.summaryBadgeKo).toContain("Preflight Hard Gate PASS");
  });
});
