import { describe, expect, it } from "vitest";

import {
  applyCspCustomReferenceColorMatch,
  applyCspLtLineAndToneExtract,
  convertCspRasterToVectorStrokes,
} from "./csp-rea-extract-vectorize";
import {
  applyCspBinarizationFilter,
  applyCspBorderEffectFilter,
  applyCspBrightnessToOpacityFilter,
  applyCspChangeLineColorToDrawingFilter,
  applyCspColorBalanceFilter,
  applyCspGradientMapFilter,
  applyCspHsvTonalFilter,
  applyCspLevelCorrectionFilter,
  applyCspPosterizeFilter,
  applyCspReverseGradientFilter,
  applyCspToneCurveFilter,
} from "./csp-rea-tonal-corrections";
import {
  CSP_REA_ALL_FILTER_SPECS,
  applyCspReaFilterToImageData,
  executeCspReaFilter,
  getCspReaFilterDialogAdapter,
} from "./csp-rea-unified-filter-registry";

function makeRichTestImage(width: number, height: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const isDarkLine =
        (Math.abs(x - Math.floor(width / 2)) <= 1 && y >= 2 && y <= height - 3) ||
        (x === y && x >= 4 && x <= width - 4);
      const isTransparentCorner = x < 3 && y < 3;
      if (isTransparentCorner) {
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
      } else if (isDarkLine) {
        buf[idx] = 16;
        buf[idx + 1] = 18;
        buf[idx + 2] = 22;
        buf[idx + 3] = 255;
      } else {
        buf[idx] = Math.round((x / Math.max(1, width - 1)) * 220 + 25);
        buf[idx + 1] = Math.round((y / Math.max(1, height - 1)) * 200 + 30);
        buf[idx + 2] = Math.round((((x + y) % width) / width) * 180 + 40);
        buf[idx + 3] = 255;
      }
    }
  }
  return buf;
}

function countDifferentPixels(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
      diff += 1;
    }
  }
  return diff;
}

describe("csp-rea 필터·색조 보정·레이어 변환 46종 전수 RGBA 픽셀 검증", () => {
  it("46종 모든 CSP 필터가 실제 RGBA 픽셀 변환을 수행하며 스텁/항등 출력을 내지 않는다", () => {
    expect(CSP_REA_ALL_FILTER_SPECS).toHaveLength(46);
    const width = 16;
    const height = 16;
    const src = makeRichTestImage(width, height);

    for (const spec of CSP_REA_ALL_FILTER_SPECS) {
      const out = executeCspReaFilter(spec.id, src, width, height);
      expect(out.byteLength, spec.id).toBe(src.byteLength);
      expect(countDifferentPixels(src, out), `filter ${spec.id} must mutate RGBA pixels`).toBeGreaterThan(0);
    }
  });

  it("파라미터 전달이 실제 픽셀 결과 차이를 만들어 낸다 (하드코딩 기본값 금지 검증)", () => {
    const src = makeRichTestImage(16, 16);
    const blurWeak = executeCspReaFilter("gauss-blur", src, 16, 16, { radiusPx: 1 });
    const blurStrong = executeCspReaFilter("gauss-blur", src, 16, 16, { radiusPx: 8 });
    expect(countDifferentPixels(blurWeak, blurStrong)).toBeGreaterThan(20);

    const post2 = executeCspReaFilter("posterize", src, 16, 16, { levels: 2 });
    const post12 = executeCspReaFilter("posterize", src, 16, 16, { levels: 12 });
    expect(countDifferentPixels(post2, post12)).toBeGreaterThan(20);

    const imgData = { width: 16, height: 16, data: new Uint8ClampedArray(src) };
    applyCspReaFilterToImageData("reverse-gradient", imgData);
    expect(imgData.data[4 * 4]).toBe(255 - src[4 * 4]!);
  });

  it("색조 보정 핵심 수식(반전·계조화·레벨·톤커브·컬러밸런스·이진화·그라데이션맵·휘도→투명·선색변경·경계효과)이 정확하다", () => {
    const src = makeRichTestImage(12, 12);
    const inv = applyCspReverseGradientFilter(src, 12, 12);
    expect(inv[16]).toBe(255 - src[16]!);

    const bin = applyCspBinarizationFilter(src, 12, 12, { threshold: 128 });
    for (let i = 0; i < bin.length; i += 4) {
      expect(bin[i] === 0 || bin[i] === 255).toBe(true);
    }

    const poster = applyCspPosterizeFilter(src, 12, 12, { levels: 3 });
    expect(countDifferentPixels(src, poster)).toBeGreaterThan(10);

    const hsv = applyCspHsvTonalFilter(src, 12, 12, { hueDeg: 90, saturation: 20, luminosity: 5 });
    expect(countDifferentPixels(src, hsv)).toBeGreaterThan(10);

    const lvl = applyCspLevelCorrectionFilter(src, 12, 12, {
      rgb: { inputBlack: 20, gamma: 1.4, inputWhite: 220, outputBlack: 0, outputWhite: 255 },
    });
    expect(countDifferentPixels(src, lvl)).toBeGreaterThan(10);

    const curve = applyCspToneCurveFilter(src, 12, 12, {
      master: [
        { x: 0, y: 0 },
        { x: 128, y: 192 },
        { x: 255, y: 255 },
      ],
    });
    expect(curve[(6 * 12 + 3) * 4]!).toBeGreaterThanOrEqual(src[(6 * 12 + 3) * 4]!);

    const bal = applyCspColorBalanceFilter(src, 12, 12, {
      midtones: { cyanRed: 45, magentaGreen: -15, yellowBlue: -30 },
      preserveLuminosity: true,
    });
    expect(countDifferentPixels(src, bal)).toBeGreaterThan(10);

    const gmap = applyCspGradientMapFilter(src, 12, 12, {
      stops: [
        { position01: 0, r: 10, g: 20, b: 80 },
        { position01: 1, r: 250, g: 220, b: 120 },
      ],
    });
    expect(countDifferentPixels(src, gmap)).toBeGreaterThan(20);

    // 휘도를 투명도로: 검은 선화 픽셀은 불투명, 밝은 픽셀은 투명도 증가
    const b2a = applyCspBrightnessToOpacityFilter(src, 12, 12);
    const darkLineIdx = (6 * 12 + 6) * 4;
    expect(b2a[darkLineIdx + 3]!).toBeGreaterThan(220);

    // 선 색 변경: 불투명 픽셀이 목표 RGB로 치환
    const recolor = applyCspChangeLineColorToDrawingFilter(b2a, 12, 12, { r: 180, g: 40, b: 90 });
    expect(recolor[darkLineIdx]).toBe(180);
    expect(recolor[darkLineIdx + 1]).toBe(40);
    expect(recolor[darkLineIdx + 2]).toBe(90);

    // 경계 효과: 투명 코너 주변 픽셀에 테두리 알파 확장
    const border = applyCspBorderEffectFilter(src, 12, 12, {
      mode: "edge",
      thicknessPx: 2,
      borderR: 255,
      borderG: 255,
      borderB: 255,
    });
    expect(border[(2 * 12 + 2) * 4 + 3]!).toBeGreaterThan(0);
  });

  it("LT 선 추출·톤 분리, 래스터→벡터 Zhang-Suen 중심선 추출, 커스텀 참조 색감 매치가 실동작한다", () => {
    const src = makeRichTestImage(20, 20);
    const lt = applyCspLtLineAndToneExtract(src, 20, 20, {
      edgeSensitivity: 70,
      lineWidthPx: 1,
      toneLevels: 4,
    });
    expect(lt.extractedEdgePixelCount).toBeGreaterThan(10);
    expect(lt.lineArtRgba.byteLength).toBe(src.byteLength);
    expect(lt.toneRgba.byteLength).toBe(src.byteLength);

    const vec = convertCspRasterToVectorStrokes(src, 20, 20, {
      inkLuminanceThreshold: 100,
      simplifyTolerancePx: 0.8,
    });
    expect(vec.skeletonPixelCount).toBeGreaterThan(5);
    expect(vec.strokes.length).toBeGreaterThanOrEqual(1);
    expect(vec.strokes[0]!.averageWidthPx).toBeGreaterThanOrEqual(1);

    // 따뜻한 참조 이미지로 색감 매치
    const warmRef = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < 64; i += 1) {
      warmRef[i * 4] = 240;
      warmRef[i * 4 + 1] = 130 + (i % 40);
      warmRef[i * 4 + 2] = 60 + (i % 20);
      warmRef[i * 4 + 3] = 255;
    }
    const matched = applyCspCustomReferenceColorMatch(src, 20, 20, {
      referenceRgba: warmRef,
      referenceWidth: 8,
      referenceHeight: 8,
      strength01: 1,
    });
    expect(countDifferentPixels(src, matched)).toBeGreaterThan(20);

    const adapter = getCspReaFilterDialogAdapter();
    expect(adapter.totalFilterCount).toBe(46);
    expect(adapter.descriptors).toHaveLength(46);
  });
});
