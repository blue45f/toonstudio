import { describe, expect, it } from "vitest";

import { AnchorFeatureError } from "./anchor-raster";
import {
  ANCHOR_SUBJECT_THRESHOLDS,
  anchorColorMask,
  countAnchorMask,
  erodeAnchorMask,
  separateAnchorSubject,
  toAnchorLabImage,
} from "./anchor-subject-mask";
import { figureRaster, figureShapes, FIGURE_STYLE_A, noiseRaster, renderSynthetic } from "./anchor-synthetic-raster";

const subjectOf = (raster: Parameters<typeof toAnchorLabImage>[0]) => separateAnchorSubject(toAnchorLabImage(raster));

describe("피사체 분리", () => {
  it("단색 배경의 그림은 가장자리 색을 배경으로 보고 background 모드로 분리한다", () => {
    const subject = subjectOf(figureRaster());
    expect(subject.mode).toBe("background");
    expect(subject.backgroundFlatness).toBe(1);
    expect(subject.coverage).toBeGreaterThan(0.15);
    expect(subject.coverage).toBeLessThan(0.3);
    expect(subject.backgroundLab?.[0]).toBeCloseTo(77.3, 0);
    expect(countAnchorMask(subject.mask) / subject.mask.length).toBeCloseTo(subject.coverage, 6);
  });

  it("배경 색이 달라도 같은 피사체 면적을 얻는다", () => {
    const gray = subjectOf(figureRaster());
    const blue = subjectOf(figureRaster({ background: [60, 120, 210] }));
    const white = subjectOf(figureRaster({ background: [250, 250, 250] }));
    expect(blue.mode).toBe("background");
    expect(Math.abs(blue.coverage - gray.coverage)).toBeLessThan(0.01);
    expect(Math.abs(white.coverage - gray.coverage)).toBeLessThan(0.01);
  });

  it("투명 PNG 는 알파가 있는 곳을 피사체로 본다", () => {
    const subject = subjectOf(figureRaster({ background: null }));
    expect(subject.mode).toBe("alpha");
    expect(subject.backgroundLab).toBeNull();
    expect(Math.abs(subject.coverage - subjectOf(figureRaster()).coverage)).toBeLessThan(0.02);
  });

  it("복잡한 배경이나 화면을 가득 채운 그림은 분리하지 않고 이미지 전체를 쓴다", () => {
    const noise = subjectOf(noiseRaster(96, 128, 5));
    expect(noise.mode).toBe("whole-image");
    expect(noise.coverage).toBe(1);
    expect(noise.backgroundLab).toBeNull();
  });

  it("가장자리가 단색이 아닌 그라데이션 배경은 분리하지 않는다", () => {
    const width = 96;
    const height = 128;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const shade = 30 + Math.round((x / (width - 1)) * 200);
        data.set([shade, shade, shade, 255], (y * width + x) * 4);
      }
    }
    const subject = subjectOf({ width, height, data });
    expect(subject.mode).toBe("whole-image");
    expect(subject.backgroundFlatness).toBeLessThan(ANCHOR_SUBJECT_THRESHOLDS.minBackgroundFlatness);
  });

  it("배경과 거의 같은 색만 있는 이미지는 피사체가 너무 작아 분리하지 않는다", () => {
    const subject = subjectOf(renderSynthetic({ width: 96, height: 128, background: [191, 191, 191], shapes: [] }));
    expect(subject.mode).toBe("whole-image");
  });

  it("떨어진 작은 잡티는 지우고 큰 피사체는 남긴다", () => {
    const width = 128;
    const height = 192;
    const speck = { kind: "rect" as const, x: 6, y: 6, w: 3, h: 3, color: [10, 200, 10] as const };
    const subject = subjectOf(renderSynthetic({ width, height, background: [191, 191, 191], shapes: [...figureShapes(width, height, FIGURE_STYLE_A), speck] }));
    expect(subject.mode).toBe("background");
    expect(subject.mask[7 * width + 7]).toBe(0);
    expect(subject.mask[Math.round(height * 0.4) * width + width / 2]).toBe(1);
  });

  it("보이는 픽셀이 하나도 없으면 empty-image 로 거절한다", () => {
    expect(() => subjectOf(renderSynthetic({ width: 64, height: 64, background: null, shapes: [] }))).toThrow(AnchorFeatureError);
    try {
      subjectOf(renderSynthetic({ width: 64, height: 64, background: null, shapes: [] }));
    } catch (error) {
      expect((error as AnchorFeatureError).code).toBe("empty-image");
    }
  });

  it("같은 입력은 같은 마스크를 만든다", () => {
    expect(subjectOf(figureRaster()).mask).toEqual(subjectOf(figureRaster()).mask);
  });
});

describe("경계 벗기기", () => {
  it("4방향 이웃이 모두 피사체인 픽셀만 남긴다", () => {
    const mask = new Uint8Array(5 * 5).fill(1);
    const eroded = erodeAnchorMask(mask, 5, 5);
    expect(countAnchorMask(eroded)).toBe(9);
    expect(eroded[2 * 5 + 2]).toBe(1);
    expect(eroded[0]).toBe(0);
  });

  it("안쪽 픽셀이 너무 적게 남으면(가는 부분) 원래 마스크를 색 통계에 쓴다", () => {
    const width = 40;
    const height = 40;
    const thin = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) thin[y * width + 20] = 1;
    const subject = { mode: "background" as const, mask: thin, coverage: 0.025, backgroundLab: null, backgroundFlatness: 1 };
    expect(anchorColorMask(subject, width, height)).toBe(thin);
    const thick = subjectOf(figureRaster());
    const interior = anchorColorMask(thick, 128, 192);
    expect(countAnchorMask(interior)).toBeLessThan(countAnchorMask(thick.mask));
    expect(countAnchorMask(interior)).toBeGreaterThan(countAnchorMask(thick.mask) * 0.5);
  });

  it("분리하지 못한 이미지는 전체 마스크를 그대로 쓴다", () => {
    const noise = subjectOf(noiseRaster(64, 64, 2));
    expect(anchorColorMask(noise, 64, 64)).toBe(noise.mask);
  });
});
