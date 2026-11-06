import { describe, expect, it } from "vitest";

import { circleRaster, depthStepFixture, fillRaster, idPassRaster, rectRaster } from "../testing/raster-fixtures";

import {
  DEFAULT_LINE_ART_OPTIONS,
  countLinePixels,
  extractLineArt,
  extractLineArtChannels,
  extractOutlinePassLuminanceToAlpha,
  lineArtToRaster,
  sobelMagnitude,
} from "./line-extract";

import type { CapturedDepth } from "../contracts";

function flatDepth(width: number, height: number, value: number): CapturedDepth {
  return { width, height, depth: new Float32Array(width * height).fill(value), near: 0.1, far: 10 };
}

describe("extractLineArt", () => {
  it("검은 평면 fixture: 내부 픽셀은 주선 0, 실루엣 안쪽 1px 링만 255(검은 재질 전체 주선화 회귀)", () => {
    const w = 24;
    const h = 24;
    const lit = rectRaster(w, h, 4, 4, 20, 20, [0, 0, 0, 255]);
    const normal = fillRaster(w, h, (x, y) => (x >= 4 && x < 20 && y >= 4 && y < 20 ? [128, 128, 255, 255] : [0, 0, 0, 0]));
    const mask = extractLineArt({ lit, depth: flatDepth(w, h, 0.5), normal, partId: new Uint16Array(w * h).fill(1), width: w, height: h });
    for (let y = 5; y < 19; y += 1) {
      for (let x = 5; x < 19; x += 1) expect(mask[y * w + x]).toBe(0);
    }
    for (let x = 4; x < 20; x += 1) {
      expect(mask[4 * w + x]).toBe(255);
      expect(mask[19 * w + x]).toBe(255);
    }
    for (let y = 4; y < 20; y += 1) {
      expect(mask[y * w + 4]).toBe(255);
      expect(mask[y * w + 19]).toBe(255);
    }
    // 바깥(투명)은 절대 칠하지 않는다.
    expect(mask[3 * w + 3]).toBe(0);
    expect(countLinePixels(mask)).toBe(16 * 4 - 4);
  });

  it("원 fixture: 경계만 검출하고 알파 경계를 끄면 내부 균일 색에 선이 없다", () => {
    const circle = circleRaster(32, 32, 16, 16, 10, [40, 40, 40, 255]);
    const channels = extractLineArtChannels({ lit: circle, width: 32, height: 32 });
    expect(countLinePixels(channels.silhouette)).toBeGreaterThan(40);
    expect(countLinePixels(channels.luma)).toBe(0);
    expect(channels.combined[16 * 32 + 16]).toBe(0);
    const off = extractLineArt({ lit: circle, width: 32, height: 32 }, { alphaEdges: false });
    expect(countLinePixels(off)).toBe(0);
  });

  it("깊이 계단은 검출하고 완만한 램프는 검출하지 않는다", () => {
    const w = 32;
    const h = 32;
    const lit = fillRaster(w, h, () => [120, 120, 120, 255]);
    const step = depthStepFixture(w, h);
    const channels = extractLineArtChannels({ lit, depth: step, width: w, height: h }, { alphaEdges: false, lumaEdges: false });
    for (let y = 0; y < h; y += 1) {
      expect(channels.depth[y * w + 15]).toBe(255);
      expect(channels.depth[y * w + 16]).toBe(255);
      expect(channels.depth[y * w + 5]).toBe(0);
      expect(channels.depth[y * w + 26]).toBe(0);
    }
    const ramp: CapturedDepth = { width: w, height: h, depth: new Float32Array(w * h), near: 0.1, far: 10 };
    for (let p = 0; p < w * h; p += 1) ramp.depth[p] = 0.3 + ((p % w) / (w - 1)) * 0.3; // 0.0097/px
    const rampMask = extractLineArt({ lit, depth: ramp, width: w, height: h }, { alphaEdges: false, lumaEdges: false });
    expect(countLinePixels(rampMask)).toBe(0);
  });

  it("법선 크리즈·partId 경계·휘도 경계를 각각 검출한다", () => {
    const w = 16;
    const h = 8;
    const lit = fillRaster(w, h, (x) => (x < 8 ? [200, 200, 200, 255] : [20, 20, 20, 255]));
    const normal = fillRaster(w, h, (x) => (x < 8 ? [128, 128, 255, 255] : [255, 128, 128, 255]));
    const idPass = idPassRaster(w, h, (x) => (x < 8 ? 1 : 2));
    const channels = extractLineArtChannels({ lit, normal, idPass, width: w, height: h }, { alphaEdges: false });
    for (let y = 0; y < h; y += 1) {
      expect(channels.crease[y * w + 7]).toBe(255);
      expect(channels.crease[y * w + 8]).toBe(255);
      expect(channels.crease[y * w + 2]).toBe(0);
      expect(channels.partBoundary[y * w + 7]).toBe(255);
      expect(channels.partBoundary[y * w + 8]).toBe(255);
      expect(channels.partBoundary[y * w + 12]).toBe(0);
      expect(channels.luma[y * w + 7]).toBe(255);
      expect(channels.luma[y * w + 8]).toBe(255);
      expect(channels.luma[y * w + 3]).toBe(0);
    }
    const noId = extractLineArtChannels({ lit, normal, idPass, width: w, height: h }, { alphaEdges: false, idEdges: false, lumaEdges: false, normalAngleDeg: 0 });
    expect(countLinePixels(noId.combined)).toBe(0);
    // 재질 경계: partId 같고 materialId만 다르면 검출
    const materialPass = idPassRaster(w, h, () => 1, 0);
    for (let y = 0; y < h; y += 1) for (let x = 8; x < w; x += 1) materialPass.rgba[(y * w + x) * 4 + 2] = 3;
    const material = extractLineArtChannels({ lit, idPass: materialPass, width: w, height: h }, { alphaEdges: false, lumaEdges: false, materialEdges: true });
    expect(material.materialBoundary[7]).toBe(255);
    expect(material.materialBoundary[8]).toBe(255);
    expect(material.materialBoundary[2]).toBe(0);
    expect(countLinePixels(material.partBoundary)).toBe(0);
  });

  it("선폭 3은 1px 팽창하되 실루엣 밖으로 나가지 않는다", () => {
    const w = 20;
    const h = 20;
    const lit = rectRaster(w, h, 2, 2, 18, 18, [255, 255, 255, 255]);
    const thin = extractLineArt({ lit, width: w, height: h });
    const thick = extractLineArt({ lit, width: w, height: h }, { lineWidthPx: 3 });
    expect(countLinePixels(thick)).toBeGreaterThan(countLinePixels(thin));
    expect(thick[3 * w + 3]).toBe(255);
    expect(thick[1 * w + 1]).toBe(0);
    expect(thick[10 * w + 10]).toBe(0);
    const raster = lineArtToRaster(thick, w, h, [10, 20, 30]);
    expect(Array.from(raster.rgba.subarray((3 * w + 3) * 4, (3 * w + 3) * 4 + 4))).toEqual([10, 20, 30, 255]);
    expect(raster.rgba[(10 * w + 10) * 4 + 3]).toBe(0);
  });

  it("Sobel은 단위 계단에서 1을 내고 크기 불일치는 throw한다", () => {
    const field = new Float32Array([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]);
    const magnitude = sobelMagnitude(field, 4, 3);
    expect(magnitude[1 * 4 + 1]).toBeCloseTo(1, 9);
    expect(magnitude[1 * 4 + 2]).toBeCloseTo(1, 9);
    expect(magnitude[1 * 4 + 0]).toBeCloseTo(0, 9);
    const lit = fillRaster(4, 4, () => [0, 0, 0, 255]);
    expect(() => extractLineArt({ lit, depth: flatDepth(2, 2, 0), width: 4, height: 4 })).toThrow(/depth/u);
    expect(() => extractLineArt({ lit, width: 5, height: 4 })).toThrow(/크기/u);
    expect(DEFAULT_LINE_ART_OPTIONS.lineWidthPx).toBe(1);
  });

  it("SHAPER ExportPSD 휘도-알파(Luminance-to-Alpha) 변환: c.a>=255 픽셀에서 Color(0, 0, 0, 255 - R)로 순수 선화를 추출한다", () => {
    const pass = fillRaster(3, 1, (x) => {
      if (x === 0) return [255, 255, 255, 255]; // 흰 배경 -> 알파 0
      if (x === 1) return [55, 55, 55, 255]; // 안티앨리어싱 회색 선 -> 알파 200
      return [0, 0, 0, 0]; // 투명 배경 -> 알파 0
    });
    const out = extractOutlinePassLuminanceToAlpha(pass, [10, 20, 30]);
    expect(Array.from(out.rgba.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(out.rgba.subarray(4, 8))).toEqual([10, 20, 30, 200]);
    expect(Array.from(out.rgba.subarray(8, 12))).toEqual([0, 0, 0, 0]);
  });

  it("lit/flat 기반 휘도-알파 변환 시 내부 음영 면은 투명(알파 0)으로 두고 외곽 hull·경계선만 순수 먹선으로 추출한다", () => {
    const w = 12;
    const h = 12;
    const flat = rectRaster(w, h, 3, 3, 9, 9, [200, 160, 140, 255]);
    const lit = fillRaster(w, h, (x, y) => {
      if (x >= 3 && x < 9 && y >= 3 && y < 9) return [120, 90, 80, 255]; // 어두운 내부 음영 면
      if (x >= 2 && x < 10 && y >= 2 && y < 10) return [20, 20, 25, 200]; // flat 밖 외곽 hull 선
      return [0, 0, 0, 0];
    });
    const out = extractOutlinePassLuminanceToAlpha(lit, [0, 0, 0], { flat });
    // 내부 중앙(6, 6)은 어두운 음영이어도 선이 아니므로 투명이어야 한다
    expect(out.rgba[(6 * w + 6) * 4 + 3]).toBe(0);
    // flat 밖 외곽 hull(2, 5)은 먹선 알파 > 0
    expect(out.rgba[(5 * w + 2) * 4 + 3]).toBeGreaterThan(150);
    // 실루엣 경계(3, 5)도 먹선 알파 > 0
    expect(out.rgba[(5 * w + 3) * 4 + 3]).toBeGreaterThan(0);
  });
});

