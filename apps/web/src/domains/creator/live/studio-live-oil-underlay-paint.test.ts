import { describe, expect, it } from "vitest";
import { studioOilSourceOverContribution } from "./studio-live-oil-underlay-paint";

function composite(before: readonly number[], overlay: readonly number[]): number[] {
  const da = before[3]! / 255;
  const sa = overlay[3]! / 255;
  const a = sa + da * (1 - sa);
  return [...[0, 1, 2].map(i => a ? (overlay[i]! * sa + before[i]! * da * (1 - sa)) / a : 0), a * 255];
}

describe("유화 바닥 중복 없는 기여분", () => {
  it("전체 바닥에서 잘라 읽어도 행 간격과 혼색을 보존한다", () => {
    const before = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < before.length; i++) before[i] = (i * 31) % 256;
    const cropped = new Uint8ClampedArray([...before.slice(20, 28), ...before.slice(36, 44)]);
    const expected = new Uint8ClampedArray([80, 60, 30, 254, 30, 90, 70, 240, 40, 90, 70, 245, 90, 70, 20, 250]);
    const actual = expected.slice();
    studioOilSourceOverContribution(cropped, expected);
    studioOilSourceOverContribution(before, actual, { x: 1, y: 1, width: 2, sourceWidth: 4 });
    expect(actual).toEqual(expected);
  });
  it.each([0, 32, 128, 220, 255])("바닥 알파 %i에서 혼색 픽셀을 재현한다", (alpha) => {
    const before = [24, 67, 193, alpha];
    const after = new Uint8ClampedArray(composite(before, [176, 142, 48, 180]));
    const expected = [...after];
    studioOilSourceOverContribution(new Uint8ClampedArray(before), after);
    const actual = composite(before, [...after]);
    for (let i = 0; i < 4; i += 1) expect(Math.abs(actual[i]! - expected[i]!)).toBeLessThanOrEqual(1);
  });
  it("8비트 알파가 같아도 강모의 RGB 혼색을 보존한다", () => {
    const before = new Uint8ClampedArray([210, 180, 90, 254]);
    const after = new Uint8ClampedArray([90, 100, 40, 254]);
    const expected = [...after];
    studioOilSourceOverContribution(before, after);
    expect(after[3]).toBeGreaterThan(0);
    const actual = composite([...before], [...after]);
    for (let i = 0; i < 4; i += 1) expect(Math.abs(actual[i]! - expected[i]!)).toBeLessThanOrEqual(1);
  });
  it("변하지 않은 바닥은 재도포하지 않는다", () => {
    const before = new Uint8ClampedArray([20, 30, 40, 128, 60, 70, 80, 255]);
    const after = before.slice();
    studioOilSourceOverContribution(before, after);
    expect([...after]).toEqual(Array(8).fill(0));
    expect([...before]).toEqual([20, 30, 40, 128, 60, 70, 80, 255]);
  });
});
