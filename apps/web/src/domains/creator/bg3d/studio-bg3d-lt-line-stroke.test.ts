import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_LT_STROKE_MAX_WIDTH_PX,
  STUDIO_BG3D_LT_STROKE_MIN_WIDTH_PX,
  strokeStudioBg3dLtResponse,
  studioBg3dLtStrokeCoverage,
  studioBg3dLtStrokeReach,
} from "./studio-bg3d-lt-line-stroke";

/** 가운데 세로선(한 픽셀, 값 255)이 있는 width × height 반응 장. */
function verticalLine(width: number, height: number, column: number): Uint8ClampedArray {
  const response = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) response[y * width + column] = 255;
  return response;
}

function horizontalLine(width: number, height: number, row: number): Uint8ClampedArray {
  const response = new Uint8ClampedArray(width * height);
  for (let x = 0; x < width; x += 1) response[row * width + x] = 255;
  return response;
}

/** 한 행(가로 단면)의 덮임 합 = 선의 두께(px). */
function rowThickness(data: Uint8ClampedArray, width: number, row: number): number {
  let sum = 0;
  for (let x = 0; x < width; x += 1) sum += data[row * width + x]! / 255;
  return sum;
}

function columnThickness(data: Uint8ClampedArray, width: number, height: number, column: number): number {
  let sum = 0;
  for (let y = 0; y < height; y += 1) sum += data[y * width + column]! / 255;
  return sum;
}

describe("studioBg3dLtStrokeCoverage", () => {
  it("is 1 on the center line and falls linearly to 0 half a pixel past the stroke edge", () => {
    expect(studioBg3dLtStrokeCoverage(0, 1)).toBe(1);
    expect(studioBg3dLtStrokeCoverage(1, 1)).toBe(0);
    expect(studioBg3dLtStrokeCoverage(1, 1.5)).toBeCloseTo(0.25, 12);
    expect(studioBg3dLtStrokeCoverage(1, 2)).toBeCloseTo(0.5, 12);
    expect(studioBg3dLtStrokeCoverage(1, 3)).toBe(1);
    expect(studioBg3dLtStrokeCoverage(2, 3)).toBe(0);
    expect(studioBg3dLtStrokeCoverage(Math.SQRT2, 3)).toBeCloseTo(2 - Math.SQRT2, 12);
  });

  it("draws sub-pixel widths as a one pixel line with proportionally lighter ink", () => {
    expect(studioBg3dLtStrokeCoverage(0, 0.25)).toBeCloseTo(0.25, 12);
    expect(studioBg3dLtStrokeCoverage(0, 0.5)).toBeCloseTo(0.5, 12);
    expect(studioBg3dLtStrokeCoverage(1, 0.5)).toBe(0);
    // width 1 에서 두 식이 이어진다(불연속 없음).
    expect(studioBg3dLtStrokeCoverage(0, 0.999_999)).toBeCloseTo(studioBg3dLtStrokeCoverage(0, 1), 5);
  });
});

describe("studioBg3dLtStrokeReach", () => {
  it("reports the farthest integer offset that receives ink", () => {
    expect(studioBg3dLtStrokeReach(0.25)).toBe(0);
    expect(studioBg3dLtStrokeReach(1)).toBe(0);
    expect(studioBg3dLtStrokeReach(1.01)).toBe(1);
    expect(studioBg3dLtStrokeReach(3)).toBe(1);
    expect(studioBg3dLtStrokeReach(3.01)).toBe(2);
    expect(studioBg3dLtStrokeReach(8)).toBe(4);
    expect(studioBg3dLtStrokeReach(STUDIO_BG3D_LT_STROKE_MAX_WIDTH_PX)).toBe(8);
  });

  it("fits the tile halo for the widest user-facing stroke (a pixel receives input within 4px)", () => {
    expect(studioBg3dLtStrokeReach(8)).toBeLessThanOrEqual(4);
  });

  it("rejects widths outside the supported range", () => {
    expect(() => studioBg3dLtStrokeReach(0.2)).toThrow(RangeError);
    expect(() => studioBg3dLtStrokeReach(17)).toThrow(RangeError);
    expect(() => studioBg3dLtStrokeReach(Number.NaN)).toThrow(RangeError);
  });
});

describe("strokeStudioBg3dLtResponse", () => {
  const width = 31;
  const height = 21;

  it.each([0.25, 0.5, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8])(
    "gives an axis-aligned line exactly the requested thickness (width %s)",
    (widthPx) => {
      const vertical = strokeStudioBg3dLtResponse(verticalLine(width, height, 15), width, height, widthPx);
      const horizontal = strokeStudioBg3dLtResponse(horizontalLine(width, height, 10), width, height, widthPx);
      // 정수 양자화(0..256 가중치) 때문에 한 단면에 최대 몇 단계의 오차가 생긴다.
      expect(rowThickness(vertical, width, 10)).toBeCloseTo(widthPx, 1);
      expect(columnThickness(horizontal, width, height, 15)).toBeCloseTo(widthPx, 1);
    }
  );

  it("increases thickness strictly and continuously with the width setting", () => {
    const widths = [1, 1.1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 4, 5, 6, 7, 8];
    const thickness = widths.map((widthPx) =>
      rowThickness(
        strokeStudioBg3dLtResponse(verticalLine(width, height, 15), width, height, widthPx),
        width,
        10
      )
    );
    for (let index = 1; index < thickness.length; index += 1) {
      expect(thickness[index]!).toBeGreaterThan(thickness[index - 1]!);
    }
    // 큰 도약이 없다: 인접한 설정 사이 두께 차이는 설정 차이의 1.1배를 넘지 않는다.
    for (let index = 1; index < widths.length; index += 1) {
      const settingStep = widths[index]! - widths[index - 1]!;
      expect(thickness[index]! - thickness[index - 1]!).toBeLessThanOrEqual(settingStep * 1.1 + 0.02);
    }
  });

  it("makes sub-pixel widths lighter instead of ignoring them", () => {
    const thin = strokeStudioBg3dLtResponse(verticalLine(width, height, 15), width, height, 0.25);
    const half = strokeStudioBg3dLtResponse(verticalLine(width, height, 15), width, height, 0.5);
    const full = strokeStudioBg3dLtResponse(verticalLine(width, height, 15), width, height, 1);
    expect(thin[10 * width + 15]).toBe(64);
    expect(half[10 * width + 15]).toBe(128);
    expect(full[10 * width + 15]).toBe(255);
    expect(thin[10 * width + 14]).toBe(0);
    expect(thin[10 * width + 16]).toBe(0);
  });

  it("pins the cross-section of a 1.5px and a 2px line (fractional edge pixels)", () => {
    const one5 = strokeStudioBg3dLtResponse(verticalLine(width, height, 15), width, height, 1.5);
    const two = strokeStudioBg3dLtResponse(verticalLine(width, height, 15), width, height, 2);
    const section = (data: Uint8ClampedArray) => Array.from(data.slice(10 * width + 13, 10 * width + 18));
    expect(section(one5)).toEqual([0, 64, 255, 64, 0]);
    expect(section(two)).toEqual([0, 128, 255, 128, 0]);
  });

  it("never exceeds the strongest source value and merges overlapping ink by maximum, not sum", () => {
    const response = verticalLine(width, height, 15);
    for (let y = 0; y < height; y += 1) response[y * width + 15] = y % 2 === 0 ? 200 : 100;
    const stroked = strokeStudioBg3dLtResponse(response, width, height, 3);
    expect(Math.max(...stroked)).toBe(200);
    expect(stroked[0 * width + 14]).toBe(200);
    // 폭 3 에서는 한 칸 위·아래 이웃의 덮임이 1 이라, 약한 행(100)도 이웃의 진한 선(200)에 덮인다.
    expect(stroked[1 * width + 15]).toBe(200);
    // 합산이었다면 255 를 넘었을 자리다. 최대값 규칙이라 원본 최대값을 넘지 않는다.
    expect(stroked.every((value) => value <= 200)).toBe(true);
  });

  it("keeps oblique lines within a bounded error of the requested thickness", () => {
    const size = 200;
    const response = new Uint8ClampedArray(size * size);
    // 기울기 1(45°) 8-연결 선과 기울기 1/2(약 26.6°) 선
    for (let t = 20; t < 180; t += 1) response[t * size + t] = 255;
    const diagonal = strokeStudioBg3dLtResponse(response, size, size, 3);
    const interior = (data: Uint8ClampedArray) => {
      let sum = 0;
      for (let y = 60; y < 140; y += 1) for (let x = 0; x < size; x += 1) sum += data[y * size + x]! / 255;
      return sum / (80 * Math.SQRT2); // 80행 구간의 선 길이
    };
    expect(interior(diagonal)).toBeGreaterThan(3 * 0.9);
    expect(interior(diagonal)).toBeLessThan(3 * 1.1);
    const thin = strokeStudioBg3dLtResponse(response, size, size, 1);
    // 폭 1 대각선은 중점 표본 덕분에 격자 점만 쓸 때(0.71)보다 두꺼워진다.
    expect(interior(thin)).toBeGreaterThan(0.95);
    expect(interior(thin)).toBeLessThan(1.25);
  });

  it("can skip the diagonal midpoint samples for isolated speckles", () => {
    const small = new Uint8ClampedArray(5 * 5);
    small[1 * 5 + 1] = 255;
    small[2 * 5 + 2] = 255;
    const connected = strokeStudioBg3dLtResponse(small, 5, 5, 1);
    const speckle = strokeStudioBg3dLtResponse(small, 5, 5, 1, { diagonalMidpoints: false });
    // 이어진 선분으로 보면 두 점 사이 모서리 픽셀 (2,1)·(1,2) 에 옅은 덮임이 생기고, 반점으로 보면 생기지 않는다.
    expect(connected[1 * 5 + 2]).toBeGreaterThan(0);
    expect(connected[2 * 5 + 1]).toBeGreaterThan(0);
    expect(speckle[1 * 5 + 2]).toBe(0);
    expect(speckle[2 * 5 + 1]).toBe(0);
    expect(speckle[1 * 5 + 1]).toBe(255);
    expect(speckle[2 * 5 + 2]).toBe(255);
  });

  it("clips at the image border without wrapping or throwing", () => {
    const small = new Uint8ClampedArray(6 * 6);
    small[0] = 255; // 왼쪽 위 모서리
    const stroked = strokeStudioBg3dLtResponse(small, 6, 6, 3);
    expect(stroked).toHaveLength(36);
    expect(stroked[0]).toBe(255);
    expect(stroked[1]).toBe(255); // 오른쪽 이웃
    expect(stroked[6]).toBe(255); // 아래 이웃
    // 반대편 가장자리로 번지지 않는다.
    expect(stroked[5]).toBe(0);
    expect(stroked[5 * 6]).toBe(0);
    expect(stroked[5 * 6 + 5]).toBe(0);
    // 네 모서리 모두 오류 없이 칠한다.
    small.fill(0);
    small[5 * 6 + 5] = 255;
    expect(strokeStudioBg3dLtResponse(small, 6, 6, 8)[5 * 6 + 5]).toBe(255);
  });

  it("returns a fresh array, leaves the input untouched, and is deterministic", () => {
    const response = verticalLine(width, height, 15);
    const before = response.slice();
    const first = strokeStudioBg3dLtResponse(response, width, height, 2.5);
    const second = strokeStudioBg3dLtResponse(response, width, height, 2.5);
    expect(response).toEqual(before);
    expect(first).not.toBe(response);
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    // 폭 1 도 입력과 같은 값이지만 별도 배열이다.
    const same = strokeStudioBg3dLtResponse(response, width, height, 1);
    expect(same).toEqual(response);
    expect(same).not.toBe(response);
  });

  it("returns an empty response for an empty input", () => {
    expect(strokeStudioBg3dLtResponse(new Uint8ClampedArray(12), 4, 3, 8).every((v) => v === 0)).toBe(true);
  });

  it("rejects mismatched lengths and widths outside the supported range", () => {
    expect(() => strokeStudioBg3dLtResponse(new Uint8ClampedArray(5), 2, 2, 1)).toThrow(RangeError);
    expect(() =>
      strokeStudioBg3dLtResponse(new Uint8ClampedArray(4), 2, 2, STUDIO_BG3D_LT_STROKE_MIN_WIDTH_PX / 2)
    ).toThrow(RangeError);
    expect(() =>
      strokeStudioBg3dLtResponse(new Uint8ClampedArray(4), 2, 2, STUDIO_BG3D_LT_STROKE_MAX_WIDTH_PX + 1)
    ).toThrow(RangeError);
  });
});
