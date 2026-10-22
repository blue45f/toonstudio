import { describe, expect, it } from "vitest";

import { ANCHOR_ANALYSIS_LIMITS, AnchorFeatureError, assertAnchorRaster, downscaleAnchorRaster, type AnchorRaster } from "./anchor-raster";

function solid(width: number, height: number, rgba: readonly [number, number, number, number]): AnchorRaster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) data.set(rgba, index * 4);
  return { width, height, data };
}

function codeOf(run: () => unknown): string {
  try {
    run();
    return "ok";
  } catch (error) {
    return error instanceof AnchorFeatureError ? error.code : "other";
  }
}

describe("분석 래스터 검증", () => {
  it("올바른 RGBA 배열은 통과한다", () => {
    expect(codeOf(() => assertAnchorRaster(solid(32, 48, [1, 2, 3, 255])))).toBe("ok");
    expect(codeOf(() => assertAnchorRaster({ width: 20, height: 20, data: new Uint8Array(20 * 20 * 4) }))).toBe("ok");
  });

  it("길이가 맞지 않거나 크기가 올바르지 않으면 invalid-raster 이다", () => {
    expect(codeOf(() => assertAnchorRaster({ width: 20, height: 20, data: new Uint8ClampedArray(10) }))).toBe("invalid-raster");
    expect(codeOf(() => assertAnchorRaster({ width: 0, height: 20, data: new Uint8ClampedArray(0) }))).toBe("invalid-raster");
    expect(codeOf(() => assertAnchorRaster({ width: 1.5, height: 20, data: new Uint8ClampedArray(120) }))).toBe("invalid-raster");
    expect(codeOf(() => assertAnchorRaster({ width: 20, height: 20, data: [1, 2, 3] as never }))).toBe("invalid-raster");
  });

  it("너무 작은 이미지를 거절한다", () => {
    expect(codeOf(() => assertAnchorRaster(solid(ANCHOR_ANALYSIS_LIMITS.minEdge - 1, 64, [0, 0, 0, 255])))).toBe("raster-too-small");
  });
});

describe("면적 평균 축소", () => {
  it("긴 변이 상한 이하면 입력을 복사 없이 그대로 돌려준다", () => {
    const raster = solid(64, 100, [10, 20, 30, 255]);
    expect(downscaleAnchorRaster(raster)).toBe(raster);
  });

  it("긴 변을 상한에 맞추고 비율을 유지한다", () => {
    const big = solid(1024, 1536, [200, 100, 50, 255]);
    const small = downscaleAnchorRaster(big);
    expect(small.height).toBe(ANCHOR_ANALYSIS_LIMITS.maxEdge);
    expect(small.width).toBe(171);
    expect(small.data.length).toBe(small.width * small.height * 4);
    expect([...small.data.subarray(0, 4)]).toEqual([200, 100, 50, 255]);
  });

  it("두 색의 경계는 평균이 된다(면적 평균)", () => {
    const width = 512;
    const height = 256;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) data.set(x < width / 2 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * width + x) * 4);
    }
    const small = downscaleAnchorRaster({ width, height, data }, 128);
    expect(small.width).toBe(128);
    expect(small.data[0]).toBe(0);
    expect(small.data[(127) * 4]).toBe(255);
    const middle = small.data[(63) * 4] ?? 0;
    expect(middle === 0 || middle === 255).toBe(true);
  });

  it("투명한 픽셀의 숨은 색이 이웃 색으로 번지지 않는다", () => {
    const width = 256;
    const height = 64;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) data.set(x % 2 === 0 ? [255, 0, 0, 255] : [0, 255, 0, 0], (y * width + x) * 4);
    }
    const small = downscaleAnchorRaster({ width, height, data }, 128);
    expect([...small.data.subarray(0, 3)]).toEqual([255, 0, 0]);
    expect(small.data[3]).toBe(128);
  });

  it("같은 입력은 같은 결과를 낸다", () => {
    const raster = solid(600, 400, [90, 90, 200, 255]);
    expect(downscaleAnchorRaster(raster).data).toEqual(downscaleAnchorRaster(raster).data);
  });
});
