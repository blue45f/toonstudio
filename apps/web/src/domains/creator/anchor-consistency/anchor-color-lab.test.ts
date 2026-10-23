import { describe, expect, it } from "vitest";

import {
  deltaE76,
  hueDifferenceDegrees,
  labChroma,
  labHueDegrees,
  labToHex,
  labToSrgb,
  srgbToHex,
  srgbToLab,
} from "./anchor-color-lab";

describe("sRGB ↔ Lab 변환", () => {
  it("흰색·검정·회색은 무채색이다", () => {
    const white = srgbToLab(255, 255, 255);
    expect(white[0]).toBeCloseTo(100, 2);
    expect(Math.abs(white[1])).toBeLessThan(0.01);
    expect(Math.abs(white[2])).toBeLessThan(0.01);
    expect(srgbToLab(0, 0, 0)).toEqual([0, 0, 0]);
    const gray = srgbToLab(128, 128, 128);
    expect(gray[0]).toBeCloseTo(53.59, 1);
    expect(Math.abs(gray[1])).toBeLessThan(0.01);
  });

  it("원색은 표준 Lab 값과 같다(D65)", () => {
    const cases: ReadonlyArray<readonly [readonly [number, number, number], readonly [number, number, number]]> = [
      [[255, 0, 0], [53.24, 80.09, 67.2]],
      [[0, 255, 0], [87.73, -86.18, 83.18]],
      [[0, 0, 255], [32.3, 79.19, -107.86]],
    ];
    for (const [rgb, expected] of cases) {
      const lab = srgbToLab(rgb[0], rgb[1], rgb[2]);
      expect(lab[0]).toBeCloseTo(expected[0], 1);
      expect(lab[1]).toBeCloseTo(expected[1], 1);
      expect(lab[2]).toBeCloseTo(expected[2], 1);
    }
  });

  it("Lab 으로 갔다가 돌아오면 1 이내로 되돌아온다", () => {
    for (const rgb of [[0, 0, 0], [255, 255, 255], [200, 40, 50], [40, 70, 150], [236, 196, 170], [17, 99, 201], [250, 250, 5]] as const) {
      const lab = srgbToLab(rgb[0], rgb[1], rgb[2]);
      const back = labToSrgb(lab[0], lab[1], lab[2]);
      for (let channel = 0; channel < 3; channel += 1) expect(Math.abs((back[channel] ?? 0) - rgb[channel]!)).toBeLessThanOrEqual(1);
    }
  });

  it("범위를 벗어난 입력은 0~255 로 자르고, 표현할 수 없는 Lab 은 가장 가까운 값으로 자른다", () => {
    expect(srgbToLab(-20, 999, Number.NaN)).toEqual(srgbToLab(0, 255, 0));
    for (const channel of labToSrgb(50, 150, -150)) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });

  it("hex 문자열은 소문자 #rrggbb 이다", () => {
    expect(srgbToHex(255, 0, 128)).toBe("#ff0080");
    expect(srgbToHex(0, 0, 0)).toBe("#000000");
    expect(labToHex(100, 0, 0)).toBe("#ffffff");
  });
});

describe("색 거리와 색조", () => {
  it("ΔE76 은 유클리드 거리이고 대칭이다", () => {
    expect(deltaE76([50, 0, 0], [50, 3, 4])).toBe(5);
    expect(deltaE76([10, 20, 30], [10, 20, 30])).toBe(0);
    expect(deltaE76([10, 20, 30], [40, 0, 30])).toBe(deltaE76([40, 0, 30], [10, 20, 30]));
  });

  it("채도와 색조 각도", () => {
    expect(labChroma(3, 4)).toBe(5);
    expect(labHueDegrees(1, 0)).toBe(0);
    expect(labHueDegrees(0, 1)).toBe(90);
    expect(labHueDegrees(-1, 0)).toBe(180);
    expect(labHueDegrees(0, -1)).toBe(270);
    expect(labHueDegrees(0, 0)).toBe(0);
  });

  it("두 색조의 차이는 0~180도로 돌려서 잰다", () => {
    expect(hueDifferenceDegrees(10, 350)).toBe(20);
    expect(hueDifferenceDegrees(0, 180)).toBe(180);
    expect(hueDifferenceDegrees(90, 90)).toBe(0);
    expect(hueDifferenceDegrees(350, 10)).toBe(20);
  });
});
