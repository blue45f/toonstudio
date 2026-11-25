import { expect, it } from "vitest";

import { computeStrokeJitterEnergy, stabilizeRoughLineart } from "./webnn-lineart-stabilizer";
import type { LineartStrokeInput, RawStrokePoint } from "./webnn-lineart-types-and-preview";

it("필수 직렬 검사에서 지터 55% 감소와 스트로크당 2ms 예산을 유지한다", () => {
  const noisyPoints: RawStrokePoint[] = [];
  for (let i = 0; i < 96; i += 1) {
    const t = i / 95;
    const tremor = (i % 2 === 0 ? 1 : -1) * 3.4 + Math.sin(i * 1.9) * 1.4;
    noisyPoints.push({ x: 20 + t * 200, y: 90 + Math.sin(t * Math.PI * 1.5) * 42 + tremor, pressure: 0.72 });
  }
  const strokes: readonly LineartStrokeInput[] = Array.from({ length: 16 }, (_, idx) => ({
    id: `noisy-curve-${idx}`, points: noisyPoints,
  }));

  // 원래 표본·워밍업·2ms 한계는 유지하고, 병렬 작업과 분리된 필수 레인에서 측정한다.
  stabilizeRoughLineart(strokes, { smoothingStrength: 0.8, gapClosingThresholdPx: 0 });
  const startedAt = performance.now();
  const report = stabilizeRoughLineart(strokes, { smoothingStrength: 0.8, gapClosingThresholdPx: 0 });
  const elapsedMs = performance.now() - startedAt;

  expect(computeStrokeJitterEnergy(noisyPoints)).toBeGreaterThan(2.0);
  expect(report.jitterReductionPct).toBeGreaterThanOrEqual(55);
  expect(report.stabilizedJitterPx).toBeLessThan(report.rawJitterPx * 0.45);
  expect(report.avgMsPerStroke).toBeLessThan(2);
  expect(elapsedMs / strokes.length).toBeLessThan(2);
  expect(report.strokes[0]!.bezierSegments.length).toBeGreaterThan(2);
});
