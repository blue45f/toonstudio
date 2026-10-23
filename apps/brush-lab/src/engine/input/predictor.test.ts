import { describe, expect, it } from "vitest";

import { predictCurvatureDampedSamples, predictSamples } from "./predictor";

import type { ModeledSample } from "../core/types";

describe("predictor & predictCurvatureDampedSamples", () => {
  const arcHistory: readonly ModeledSample[] = [
    { x: 0, y: 0, tMs: 0, pressure: 0.6, source: "modeled" },
    { x: 10, y: 2, tMs: 8, pressure: 0.65, source: "modeled" },
    { x: 18, y: 8, tMs: 16, pressure: 0.7, source: "modeled" },
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
