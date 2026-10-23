import { describe, expect, it } from "vitest";

import { predictCurvatureDampedSamples, predictSamples } from "./predictor";

import type { ModeledSample } from "../core/types";

/** 예측기가 읽는 x·y·tMs·pressure 만 의미 있고 나머지는 ModeledSample 계약을 채우는 중립값이다. */
function sample(x: number, y: number, tMs: number, pressure: number): ModeledSample {
  return {
    x,
    y,
    tMs,
    inputTMs: tMs,
    pressure,
    velocity: 0.5,
    altitudeDeg: 90,
    azimuthDeg: 0,
    dirX: 1,
    dirY: 0,
    curvature: 0,
    phase: "move",
    source: "raw",
    sourceIndex: 0,
  };
}

describe("predictor & predictCurvatureDampedSamples", () => {
  const arcHistory: readonly ModeledSample[] = [
    sample(0, 0, 0, 0.6),
    sample(10, 2, 8, 0.65),
    sample(18, 8, 16, 0.7),
  ];

  it("predictSamples linearly extrapolates from the last two samples", () => {
    const linear = predictSamples(arcHistory, 16, 4);
    expect(linear).toHaveLength(4);
    expect(linear.every((s) => s.source === "predicted")).toBe(true);
    expect(linear[3]!.x).toBeGreaterThan(18);
  });

  it("predictCurvatureDampedSamples bends along the stroke arc and damps overshoot", () => {
    const linear = predictSamples(arcHistory, 16, 4);
    const curved = predictCurvatureDampedSamples(arcHistory, 16, 4, 0.75);
    expect(curved).toHaveLength(4);
    expect(curved.every((s) => s.source === "predicted")).toBe(true);
    // Damped distance from last sample is strictly smaller than undamped linear extrapolation
    const last = arcHistory[2]!;
    const linearDist = Math.hypot(linear[3]!.x - last.x, linear[3]!.y - last.y);
    const curvedDist = Math.hypot(curved[3]!.x - last.x, curved[3]!.y - last.y);
    expect(curvedDist).toBeLessThan(linearDist);
  });
});
