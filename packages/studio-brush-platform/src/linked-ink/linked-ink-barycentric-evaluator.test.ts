import { describe, expect, it } from "vitest";

import {
  evaluateLinkedInkBarycentricBridge,
  runCanonicalLinkedInkBarycentricSuite,
} from "./linked-ink-barycentric-evaluator";

describe("linked-ink-barycentric-evaluator", () => {
  it("정확한 바리센트릭 재투영과 Z-bias 은선 컬링, 저지연 동기화에서 BRI 100.0을 달성한다", () => {
    const report = runCanonicalLinkedInkBarycentricSuite({
      cameraYawDeg: 22,
      syncLatencyMs: 1.2,
    });

    expect(report.anchorCount).toBe(8);
    expect(report.meanReprojectionErrorPx).toBe(0);
    expect(report.occludedAnchorCount).toBeGreaterThan(0);
    expect(report.leakedOcclusionCount).toBe(0);
    expect(report.hiddenLineOcclusionLeakRatio).toBe(0);
    expect(report.bridgeReliabilityIndex).toBe(100);
    expect(report.mode).toBe("live-bidirectional");
    expect(report.passedHardGate).toBe(true);
  });

  it("재투영 오차 또는 Z-bias 은선 누출이 발생하면 BRI가 물리적으로 즉시 하락한다", () => {
    const noisy = runCanonicalLinkedInkBarycentricSuite({
      cameraYawDeg: 22,
      syncLatencyMs: 1.2,
      injectReprojectionNoisePx: 4.0,
    });
    expect(noisy.meanReprojectionErrorPx).toBeGreaterThan(4.0);
    expect(noisy.bridgeReliabilityIndex).toBeLessThan(85);

    const leaked = runCanonicalLinkedInkBarycentricSuite({
      cameraYawDeg: 0,
      syncLatencyMs: 1.2,
      disableDepthOcclusionCulling: true,
    });
    expect(leaked.leakedOcclusionCount).toBeGreaterThan(0);
    expect(leaked.hiddenLineOcclusionLeakRatio).toBeGreaterThan(0);
    expect(leaked.bridgeReliabilityIndex).toBeLessThan(70);
  });

  it("동기화 지연이 과도하게 증가하면 BRI 점수가 감점된다", () => {
    const slow = evaluateLinkedInkBarycentricBridge({
      triangles: [
        { id: "t0", v0: [-1, 0, 0], v1: [1, 0, 0], v2: [0, 1, 0] },
      ],
      anchors: [{ triangleId: "t0", u: 0.3, v: 0.3 }],
      camera: {
        eye: [0, 0.5, 3],
        target: [0, 0.5, 0],
        up: [0, 1, 0],
        fovYDeg: 45,
        viewportWidthPx: 1280,
        viewportHeightPx: 720,
      },
      syncLatencyMs: 120,
    });

    expect(slow.bridgeReliabilityIndex).toBeLessThan(98);
    expect(slow.bridgeReliabilityIndex).toBeGreaterThan(90);
  });
});
