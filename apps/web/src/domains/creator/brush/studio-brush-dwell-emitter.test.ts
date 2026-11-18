import { describe, expect, it } from "vitest";

import {
  advanceStudioBrushDwellEmitter,
  createStudioBrushDwellState,
  normalizeStudioBrushDwellConfig,
} from "./studio-brush-dwell-emitter";

describe("studio-brush-dwell-emitter", () => {
  it("펜을 한자리에 누르고 있으면 농도가 단조 증가하다가 maxBuildup 상한에서 멈춘다", () => {
    const config = normalizeStudioBrushDwellConfig({
      enabled: true,
      intervalMs: 20,
      stationaryRadiusPx: 2,
      maxBuildup: 0.5,
      decayPerTick: 0.9,
    });
    let state = createStudioBrushDwellState(100, 120, 0);
    const coverages: number[] = [];

    for (let step = 1; step <= 30; step += 1) {
      const res = advanceStudioBrushDwellEmitter(state, config, {
        x: 100.5,
        y: 120.2,
        pressure: 0.8,
        timestampMs: step * 40,
      });
      state = res.state;
      coverages.push(state.accumulatedCoverage);
    }

    expect(coverages[0]!).toBeGreaterThan(0);
    for (let i = 1; i < coverages.length; i += 1) {
      expect(coverages[i]!).toBeGreaterThanOrEqual(coverages[i - 1]!);
    }
    expect(state.accumulatedCoverage).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(state.accumulatedCoverage).toBeGreaterThan(0.45);
  });

  it("정지 반경 밖으로 이동하면 누적 상태를 새 앵커로 즉시 초기화한다", () => {
    const config = normalizeStudioBrushDwellConfig({
      enabled: true,
      intervalMs: 16,
      stationaryRadiusPx: 1.5,
      maxBuildup: 0.8,
    });
    const s0 = createStudioBrushDwellState(10, 10, 0);
    const s1 = advanceStudioBrushDwellEmitter(s0, config, {
      x: 10.2,
      y: 10.1,
      pressure: 1,
      timestampMs: 64,
    });
    expect(s1.emitted.length).toBeGreaterThan(0);

    const moved = advanceStudioBrushDwellEmitter(s1.state, config, {
      x: 35,
      y: 10,
      pressure: 1,
      timestampMs: 96,
    });
    expect(moved.emitted).toEqual([]);
    expect(moved.state.anchorX).toBe(35);
    expect(moved.state.accumulatedCoverage).toBe(0);
  });
});
