import { describe, expect, it } from "vitest";

import { EMPTY_FRAME_COVERAGE, measureRaster } from "./raster-stats";

function raster(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set(fill(x, y), (y * width + x) * 4);
  }
  return data;
}

describe("measureRaster", () => {
  it("투명 배경: 알파 > 8인 픽셀 비율과 모서리 알파를 잰다", () => {
    const data = raster(10, 10, (x, y) => (x >= 2 && x < 7 && y >= 2 && y < 6 ? [200, 100, 50, 255] : [0, 0, 0, 0]));
    const stats = measureRaster(data, 10, 10, null);
    expect(stats.coverage).toBeCloseTo(20 / 100, 9);
    expect(stats.cornerAlphas).toEqual([0, 0, 0, 0]);
  });

  it("단색 배경: 배경과 충분히 다른 픽셀만 센다(약한 노이즈는 무시)", () => {
    const bg: [number, number, number] = [48, 52, 63];
    const data = raster(10, 10, (x) => (x < 3 ? [200, 180, 160, 255] : [bg[0] + 4, bg[1], bg[2] - 3, 255]));
    const stats = measureRaster(data, 10, 10, bg);
    expect(stats.coverage).toBeCloseTo(0.3, 9);
    expect(stats.cornerAlphas).toEqual([255, 255, 255, 255]);
  });

  it("완전히 빈 프레임은 coverage 0이고 빈 프레임 하한 아래다", () => {
    const empty = measureRaster(new Uint8ClampedArray(16 * 16 * 4), 16, 16, null);
    expect(empty.coverage).toBe(0);
    expect(empty.coverage).toBeLessThan(EMPTY_FRAME_COVERAGE);
    expect(measureRaster(new Uint8ClampedArray(0), 0, 0, null).coverage).toBe(0);
  });
});
