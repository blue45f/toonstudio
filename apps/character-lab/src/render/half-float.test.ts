import { describe, expect, it } from "vitest";

import { toHalfFloatArray, toHalfFloatBits } from "./half-float";

/** binary16 비트 → number(검증용 역변환) */
function fromHalf(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> 10) & 0x1f;
  const mantissa = bits & 0x3ff;
  if (exponent === 0) return sign * mantissa * 2 ** -24;
  if (exponent === 0x1f) return mantissa ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

describe("render/half-float", () => {
  it("대표 값의 비트를 표준대로 만든다", () => {
    expect(toHalfFloatBits(0)).toBe(0x0000);
    expect(toHalfFloatBits(-0)).toBe(0x8000);
    expect(toHalfFloatBits(1)).toBe(0x3c00);
    expect(toHalfFloatBits(-2)).toBe(0xc000);
    expect(toHalfFloatBits(0.5)).toBe(0x3800);
    expect(toHalfFloatBits(65504)).toBe(0x7bff);
    expect(toHalfFloatBits(65536)).toBe(0x7c00);
    expect(toHalfFloatBits(Number.POSITIVE_INFINITY)).toBe(0x7c00);
    expect(toHalfFloatBits(Number.NEGATIVE_INFINITY)).toBe(0xfc00);
    expect(toHalfFloatBits(Number.NaN) & 0x7c00).toBe(0x7c00);
    expect(toHalfFloatBits(Number.NaN) & 0x3ff).not.toBe(0);
    // 가장 작은 비정규수 2^-24, 그 절반 미만은 0
    expect(toHalfFloatBits(2 ** -24)).toBe(0x0001);
    expect(toHalfFloatBits(2 ** -26)).toBe(0x0000);
  });

  it("가장 가까운 짝수로 반올림한다", () => {
    // 1 + 2^-11 은 1과 1+2^-10의 정확히 중간 → 짝수(1)
    expect(toHalfFloatBits(1 + 2 ** -11)).toBe(0x3c00);
    // 1 + 3·2^-11 은 (1+2^-10)과 (1+2^-9)의 중간 → 짝수(1+2^-9)
    expect(toHalfFloatBits(1 + 3 * 2 ** -11)).toBe(0x3c02);
    expect(toHalfFloatBits(1 + 2 ** -11 + 2 ** -20)).toBe(0x3c01);
  });

  it("절차 스카이 범위(0~약 20)의 값은 상대 오차 0.1 % 안에서 되돌아온다", () => {
    const values = new Float32Array([0.001, 0.0732, 0.35, 1.2, 3.7, 18.25, 19.9]);
    const half = toHalfFloatArray(values);
    for (let i = 0; i < values.length; i += 1) {
      const original = values[i] ?? 0;
      expect(Math.abs(fromHalf(half[i] ?? 0) - original) / original).toBeLessThan(1e-3);
    }
  });
});
