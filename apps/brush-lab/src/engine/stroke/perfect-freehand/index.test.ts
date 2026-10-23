import { describe, expect, it } from "vitest";

import golden from "../../../../test-data/perfect-freehand-golden.json" with { type: "json" };

import {
  computeStrokeOutlineMetrics,
  getStrokePoints,
  perfectFreehand,
  simulateVelocityPressure,
  streamlineStrokePoints,
  type FreehandOptions,
  type FreehandPoint,
} from "./index";

interface GoldenCase {
  points: FreehandPoint[];
  options: FreehandOptions;
  expected: { x: number; y: number }[];
}

interface GoldenFixture {
  source: string;
  cases: GoldenCase[];
}

const baseOptions: FreehandOptions = {
  size: 1,
  thinning: 0,
  smoothing: 0,
  simulatePressure: true,
  easing: "linear",
  taper: true,
};

describe("perfect-freehand", () => {
  it("getStrokePoints: 비어 있으면 빈 배열", () => {
    expect(getStrokePoints([], baseOptions)).toEqual([]);
  });

  it("getStrokePoints: smoothing 0이면 입력 점과 동일", () => {
    const pts: FreehandPoint[] = [
      { x: 0, y: 0, pressure: 1, time: 0 },
      { x: 10, y: 5, pressure: 0.5, time: 10 },
    ];
    expect(getStrokePoints(pts, baseOptions)).toEqual(pts);
  });

  it("perfectFreehand: 3점 수평선, 양끝 테이퍼(0), 가운데 최대 폭(0.5)", () => {
    const pts: FreehandPoint[] = [
      { x: 0, y: 0, pressure: 1, time: 0 },
      { x: 50, y: 0, pressure: 1, time: 10 },
      { x: 100, y: 0, pressure: 1, time: 20 },
    ];
    const outline = perfectFreehand(pts, baseOptions);
    expect(outline.length).toBe(6);
    expect(outline[0]).toEqual({ x: 0, y: 0 });
    expect(outline[1]).toEqual({ x: 50, y: 0.5 });
    expect(outline[2]).toEqual({ x: 100, y: 0 });
    expect(outline[3]).toEqual({ x: 100, y: 0 });
    expect(outline[4]).toEqual({ x: 50, y: -0.5 });
    expect(outline[5]).toEqual({ x: 0, y: 0 });
  });

  it("perfectFreehand: 압력 0.5이면 가운데 폭 절반", () => {
    const pts: FreehandPoint[] = [
      { x: 0, y: 0, pressure: 1, time: 0 },
      { x: 50, y: 0, pressure: 0.5, time: 10 },
      { x: 100, y: 0, pressure: 1, time: 20 },
    ];
    const outline = perfectFreehand(pts, baseOptions);
    expect(outline[1]).toEqual({ x: 50, y: 0.25 });
    expect(outline[4]).toEqual({ x: 50, y: -0.25 });
  });

  it("perfectFreehand: taper false이면 양끝도 최대 폭", () => {
    const pts: FreehandPoint[] = [
      { x: 0, y: 0, pressure: 1, time: 0 },
      { x: 50, y: 0, pressure: 1, time: 10 },
      { x: 100, y: 0, pressure: 1, time: 20 },
    ];
    const outline = perfectFreehand(pts, { ...baseOptions, taper: false });
    expect(outline[0]).toEqual({ x: 0, y: 0.5 });
    expect(outline[2]).toEqual({ x: 100, y: 0.5 });
    expect(outline[3]).toEqual({ x: 100, y: -0.5 });
    expect(outline[5]).toEqual({ x: 0, y: -0.5 });
  });

  it("perfectFreehand: easing에 따라 중간 폭이 달라진다(ease-in이 linear보다 좁음)", () => {
    const pts: FreehandPoint[] = [
      { x: 0, y: 0, pressure: 1, time: 0 },
      { x: 25, y: 0, pressure: 1, time: 5 },
      { x: 50, y: 0, pressure: 1, time: 10 },
      { x: 75, y: 0, pressure: 1, time: 15 },
      { x: 100, y: 0, pressure: 1, time: 20 },
    ];
    const linear = perfectFreehand(pts, { ...baseOptions, easing: "linear" });
    const easeIn = perfectFreehand(pts, { ...baseOptions, easing: "ease-in" });
    expect(linear[1].y).toBe(0.25); // t = 0.5 → ease-in-out(0.5) = 0.5 → 0.25
    expect(easeIn[1].y).toBe(0.125); // t = 0.5 → ease-in(0.5) = 0.25 → 0.125
  });

  it("perfectFreehand: 단일 점은 반경 size/2 * pressure의 사각형", () => {
    const pts: FreehandPoint[] = [{ x: 10, y: 20, pressure: 0.8, time: 5 }];
    const outline = perfectFreehand(pts, baseOptions);
    expect(outline).toEqual([
      { x: 9.6, y: 19.6 },
      { x: 10.4, y: 19.6 },
      { x: 10.4, y: 20.4 },
      { x: 9.6, y: 20.4 },
    ]);
  });

  it("골든 피치: concept 기대 출력과 일치(1e-9 허용 오차)", () => {
    const fixture: GoldenFixture = golden as unknown as GoldenFixture;
    expect(fixture.source).toBe("concept-verification");
    for (const c of fixture.cases) {
      const outline = perfectFreehand(c.points, c.options);
      expect(outline.length).toBe(c.expected.length);
      for (let i = 0; i < outline.length; i++) {
        expect(Math.abs(outline[i].x - c.expected[i].x)).toBeLessThan(1e-9);
        expect(Math.abs(outline[i].y - c.expected[i].y)).toBeLessThan(1e-9);
      }
    }
  });

  it("simulateVelocityPressure: 고속 구간에서 압력이 감소하고 저속 구간에서 회복된다", () => {
    const pts: FreehandPoint[] = [
      { x: 0, y: 0, pressure: 0.5, time: 0 },
      { x: 2, y: 0, pressure: 0.5, time: 20 },
      { x: 120, y: 0, pressure: 0.5, time: 25 },
      { x: 122, y: 0, pressure: 0.5, time: 50 },
    ];
    const simulated = simulateVelocityPressure(pts, 0.7, 0.2);
    expect(simulated).toHaveLength(4);
    expect(simulated[2].pressure).toBeLessThan(simulated[1].pressure);
    expect(simulated[3].pressure).toBeGreaterThan(simulated[2].pressure);
  });

  it("streamlineStrokePoints & computeStrokeOutlineMetrics: 노이즈 완화와 폴리곤 기하 지표를 계산한다", () => {
    const noisy: FreehandPoint[] = [
      { x: 0, y: 0, pressure: 0.8, time: 0 },
      { x: 25, y: 12, pressure: 0.8, time: 10 },
      { x: 50, y: -12, pressure: 0.8, time: 20 },
      { x: 75, y: 12, pressure: 0.8, time: 30 },
      { x: 100, y: 0, pressure: 0.8, time: 40 },
    ];
    const streamlined = streamlineStrokePoints(noisy, 0.75);
    expect(streamlined[0]).toEqual(noisy[0]);
    expect(streamlined[4]).toEqual(noisy[4]);
    expect(Math.abs(streamlined[1].y)).toBeLessThan(Math.abs(noisy[1].y));

    const outline = perfectFreehand(streamlined, { ...baseOptions, size: 8, taper: false });
    const metrics = computeStrokeOutlineMetrics(outline);
    expect(metrics.area).toBeGreaterThan(0);
    expect(metrics.perimeter).toBeGreaterThan(0);
    expect(metrics.boundingWidth).toBeGreaterThanOrEqual(100);
  });
});

