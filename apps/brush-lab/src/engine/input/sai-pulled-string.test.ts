import { describe, expect, it } from "vitest";

import {
  computeSaiPressureCurve,
  createPulledStringState,
  processSaiPulledStringStroke,
  stepPulledStringStabilizer,
} from "./sai-pulled-string";

describe("sai-pulled-string (클린룸 내재화 SAI S-레벨 & Lazy Nezumi 견인줄 보정기)", () => {
  it("견인줄 길이 이내의 미세한 손떨림 진동에서는 펜촉 앵커가 움직이지 않는다", () => {
    let state = createPulledStringState(100, 100, 0);
    const jitterSamples = [
      { x: 102, y: 99, pressure: 0.5, timestampMs: 16, phase: "move" as const },
      { x: 98, y: 101, pressure: 0.5, timestampMs: 32, phase: "move" as const },
      { x: 103, y: 102, pressure: 0.5, timestampMs: 48, phase: "move" as const },
    ];

    for (const sample of jitterSamples) {
      const stepped = stepPulledStringStabilizer(state, sample, {
        stringLengthPx: 10,
        saiLevel: 16,
      });
      state = stepped.state;
      expect(stepped.output.x).toBeCloseTo(100, 5);
      expect(stepped.output.y).toBeCloseTo(100, 5);
      expect(stepped.output.tensionRatio).toBeLessThan(1);
    }
  });

  it("견인줄 길이를 초과해 이동하면 팽팽해진 줄 방향으로 앵커가 끌려오고 up 단계에서 끝점까지 도달한다", () => {
    const outputs = processSaiPulledStringStroke(
      [
        { x: 0, y: 0, pressure: 0.4, timestampMs: 0, phase: "down" },
        { x: 25, y: 0, pressure: 0.6, timestampMs: 16, phase: "move" },
        { x: 50, y: 0, pressure: 0.8, timestampMs: 32, phase: "up" },
      ],
      { stringLengthPx: 10, saiLevel: 0 },
    );

    expect(outputs).toHaveLength(3);
    expect(outputs[1]?.x).toBeCloseTo(15, 4);
    expect(outputs[1]?.tensionRatio).toBe(1);
    expect(outputs[2]?.x).toBeCloseTo(50, 4);
  });

  it("SAI 필압 커브는 최소 임계값 이하를 0으로 자르고 단조 증가한다", () => {
    expect(computeSaiPressureCurve(0.01, 1.4, 0.03)).toBe(0);
    const low = computeSaiPressureCurve(0.25, 1.4, 0.02);
    const mid = computeSaiPressureCurve(0.5, 1.4, 0.02);
    const high = computeSaiPressureCurve(0.9, 1.4, 0.02);
    expect(low).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
    expect(computeSaiPressureCurve(1, 1.4, 0.02)).toBeCloseTo(1, 5);
  });
});
