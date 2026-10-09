import { describe, expect, it } from "vitest";

import {
  bucklingPressureCurve,
  constantPressureCurve,
  linearPressureCurve,
  powerPressureCurve,
  PRESSURE_CURVE_IDS,
  PRESSURE_CURVE_SAMPLES,
  pressureCurveById,
  PressureCurveTable,
  SPD_MEASURED_PRESSURES,
  SPD_MEASURED_RMS_RADIUS_U,
  SPD_PEAK_RADIUS_U,
  SPD_POWER_FIT,
} from "./pressure-curve";

describe("PressureCurveTable", () => {
  it("입력 압력을 0..1로 clamp하고 구간을 선형 보간한다", () => {
    const t = new PressureCurveTable([0, 1, 0]);
    expect(t.eval(-5)).toBe(0);
    expect(t.eval(0)).toBe(0);
    expect(t.eval(0.25)).toBeCloseTo(0.5, 6);
    expect(t.eval(0.5)).toBe(1);
    expect(t.eval(0.75)).toBeCloseTo(0.5, 6);
    expect(t.eval(1)).toBe(0);
    expect(t.eval(7)).toBe(0);
  });

  it("값은 f32로 반올림된다(Math.fround 미러)", () => {
    const t = new PressureCurveTable([0.1, 0.7]);
    for (const p of [0, 0.123, 0.5, 0.987, 1]) {
      const v = t.eval(p);
      expect(v).toBe(Math.fround(v));
    }
  });

  it("점이 2개 미만이거나 유한하지 않은 값은 RangeError다(무음 보정 없음)", () => {
    expect(() => new PressureCurveTable([1])).toThrow(RangeError);
    expect(() => new PressureCurveTable([0, Number.NaN])).toThrow(RangeError);
    expect(() => new PressureCurveTable([0, Number.POSITIVE_INFINITY])).toThrow(RangeError);
  });

  it("fromKnots는 매듭 규약(0에서 시작·1에서 끝·엄격 증가)을 강제한다", () => {
    expect(() => PressureCurveTable.fromKnots([[0, 1]])).toThrow(RangeError);
    expect(() => PressureCurveTable.fromKnots([[0.1, 1], [1, 2]])).toThrow(RangeError);
    expect(() => PressureCurveTable.fromKnots([[0, 1], [0.9, 2]])).toThrow(RangeError);
    expect(() => PressureCurveTable.fromKnots([[0, 1], [0.5, 2], [0.5, 3], [1, 4]])).toThrow(RangeError);
    const t = PressureCurveTable.fromKnots([[0, 0], [0.5, 1], [1, 0]], 5);
    expect(Array.from(t.values)).toEqual([0, 0.5, 1, 0.5, 0]);
  });

  it("단조 판정과 최댓값", () => {
    expect(linearPressureCurve(0.2, 1).isMonotonic()).toBe(true);
    expect(new PressureCurveTable([0, 1, 0.5]).isMonotonic()).toBe(false);
    expect(new PressureCurveTable([0, 1, 0.5]).max()).toBe(1);
    const flat = constantPressureCurve(0.7);
    expect(flat.eval(0)).toBeCloseTo(0.7, 6);
    expect(flat.eval(1)).toBeCloseTo(0.7, 6);
  });
});

describe("압력 → 반경 곡선 표(SP-D 3D 붓털 측정 기반)", () => {
  const u = (curve: PressureCurveTable, p: number): number => curve.eval(p) * SPD_POWER_FIT.a;

  it("power-fit은 단조이고 압력 1에서 1이다", () => {
    const c = powerPressureCurve();
    expect(c.values.length).toBe(PRESSURE_CURVE_SAMPLES);
    expect(c.isMonotonic()).toBe(true);
    expect(c.eval(1)).toBeCloseTo(1, 6);
    expect(c.eval(0)).toBeGreaterThan(0.3);
    expect(c.eval(0)).toBeLessThan(c.eval(0.05));
  });

  it("power-fit은 SP-D의 단조 구간(p ≤ 0.7) 3D 측정을 RMSE 0.12 u 이내로 재현한다(스파이크 0.108 u)", () => {
    const c = powerPressureCurve();
    let sum = 0;
    let n = 0;
    for (let i = 0; i < SPD_MEASURED_PRESSURES.length; i += 1) {
      const p = SPD_MEASURED_PRESSURES[i] ?? 0;
      if (p > 0.7) continue;
      const err = u(c, p) - (SPD_MEASURED_RMS_RADIUS_U[i] ?? 0);
      sum += err * err;
      n += 1;
    }
    expect(n).toBe(6);
    expect(Math.sqrt(sum / n)).toBeLessThan(0.12);
  });

  it("buckling-3d는 비단조다: 압력 0.7이 피크(=1)이고 0.9 이상에서 꺾인다", () => {
    const c = bucklingPressureCurve();
    expect(c.isMonotonic()).toBe(false);
    expect(c.eval(0.7)).toBeCloseTo(1, 5);
    expect(c.max()).toBeCloseTo(1, 5);
    expect(c.eval(0.9)).toBeLessThan(c.eval(0.7) * 0.8);
    expect(c.eval(1)).toBeLessThan(c.eval(0.7) * 0.82);
    // 측정 압력 점은 격자에 정확히 놓이므로 측정값(피크 정규화)을 그대로 돌려준다.
    for (let i = 0; i < SPD_MEASURED_PRESSURES.length; i += 1) {
      expect(c.eval(SPD_MEASURED_PRESSURES[i] ?? 0)).toBeCloseTo((SPD_MEASURED_RMS_RADIUS_U[i] ?? 0) / SPD_PEAK_RADIUS_U, 4);
    }
  });

  it("id로 조회하고 모르는 id는 RangeError다", () => {
    for (const id of PRESSURE_CURVE_IDS) {
      const c = pressureCurveById(id);
      expect(c.values.length).toBeGreaterThanOrEqual(2);
    }
    expect(() => pressureCurveById("nope" as "linear")).toThrow(RangeError);
  });

  it("같은 호출은 같은 표를 만든다(결정적)", () => {
    expect(Array.from(powerPressureCurve().values)).toEqual(Array.from(powerPressureCurve().values));
    expect(Array.from(bucklingPressureCurve().values)).toEqual(Array.from(bucklingPressureCurve().values));
  });
});
