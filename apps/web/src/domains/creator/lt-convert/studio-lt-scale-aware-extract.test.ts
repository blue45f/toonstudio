import { describe, expect, it } from "vitest";

import {
  extractStudio3DLineArt,
  resolveScaleNormalizedLineThickness,
} from "../scene-3d/studio-3d-line-art-extractor";

import {
  extractScaleAwareStudioLineArt,
  measureMedianEdgeInkSpanPx,
  planScaleAwareLtExtraction,
  predictExtractorInkWidthPx,
} from "./studio-lt-scale-aware-extract";

function makeVerticalStepPlate(width: number, height: number, splitX: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const val = x < splitX ? 255 : 0;
      rgba[idx] = val;
      rgba[idx + 1] = val;
      rgba[idx + 2] = val;
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

describe("studio-lt-scale-aware-extract (probe-ink-weight invariant)", () => {
  it("preserves legacy extractStudio3DLineArt behavior when cropZoomScale is omitted and normalizes when provided", () => {
    expect(resolveScaleNormalizedLineThickness(4)).toBe(4);
    expect(resolveScaleNormalizedLineThickness(4, 1)).toBe(4);
    expect(resolveScaleNormalizedLineThickness(6, 2)).toBe(3);
    expect(resolveScaleNormalizedLineThickness(1, 2)).toBe(1);

    const plate = makeVerticalStepPlate(64, 64, 32);
    const defaultRun = extractStudio3DLineArt(plate, 64, 64, { lineThickness: 4, threshold: 48 });
    expect(defaultRun.effectiveLineThickness).toBe(4);
    expect(measureMedianEdgeInkSpanPx(defaultRun.edgeMask, 64, 64)).toBe(predictExtractorInkWidthPx(4));
  });

  it("keeps on-page ink weight identical between 1x full plate and 2x crop-zoomed panel", () => {
    const sourceW = 64;
    const sourceH = 64;
    const fullPlate = makeVerticalStepPlate(sourceW, sourceH, 32);

    // Panel A: 1x 전체 플레이트 (64x64 출력, lineThickness=4 → 페이지 선폭 6px)
    const panelA = extractScaleAwareStudioLineArt(
      { rgba: fullPlate, width: sourceW, height: sourceH },
      {
        outputWidth: 64,
        outputHeight: 64,
        extractorOptions: { algorithm: "sobel", threshold: 48, lineThickness: 4 },
      },
    );

    // Panel B: 중앙 32x32를 2x 크롭-줌해 64x64 패널로 출력 (3D 재렌더 콜백 경로)
    const panelBReRendered = extractScaleAwareStudioLineArt(
      { rgba: fullPlate, width: sourceW, height: sourceH },
      {
        cropRect: { x: 16, y: 16, width: 32, height: 32 },
        outputWidth: 64,
        outputHeight: 64,
        extractorOptions: { algorithm: "sobel", threshold: 48, lineThickness: 4 },
        reRenderCropAtOutputResolution: (plan) => ({
          width: plan.outputWidth,
          height: plan.outputHeight,
          rgba: makeVerticalStepPlate(plan.outputWidth, plan.outputHeight, Math.floor(plan.outputWidth / 2)),
        }),
      },
    );

    // Panel C: 동일 2x 크롭-줌을 래스터 선행 리샘플링 후 추출 경로로 실행
    const panelCResampled = extractScaleAwareStudioLineArt(
      { rgba: fullPlate, width: sourceW, height: sourceH },
      {
        cropRect: { x: 16, y: 16, width: 32, height: 32 },
        outputWidth: 64,
        outputHeight: 64,
        extractorOptions: { algorithm: "sobel", threshold: 48, lineThickness: 4 },
      },
    );

    expect(panelA.plan.strategy).toBe("direct-native-extract");
    expect(panelBReRendered.plan.strategy).toBe("re-render-crop-at-output-resolution");
    expect(panelCResampled.plan.strategy).toBe("resample-crop-then-extract");
    expect(panelBReRendered.plan.effectiveCropZoomScale).toBe(2);

    // 세 패널 모두 페이지 상 잉크 선폭이 6px(또는 허용 오차 이내)로 일치 — 2x 팽창(12px) 발생 0건
    expect(panelA.inkAudit.measuredMedianInkSpanPx).toBe(6);
    expect(panelBReRendered.inkAudit.measuredMedianInkSpanPx).toBe(6);
    expect(panelCResampled.inkAudit.measuredMedianInkSpanPx).toBeGreaterThanOrEqual(5);
    expect(panelCResampled.inkAudit.measuredMedianInkSpanPx).toBeLessThanOrEqual(8);
    expect(panelA.inkAudit.passesInkWeightInvariant).toBe(true);
    expect(panelBReRendered.inkAudit.passesInkWeightInvariant).toBe(true);
    expect(panelCResampled.inkAudit.passesInkWeightInvariant).toBe(true);
  });

  it("resamples depth buffer cleanly for normal-depth extraction on zoomed crops", () => {
    const w = 32;
    const h = 32;
    const rgba = new Uint8Array(w * h * 4);
    const depth = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        depth[y * w + x] = x < 16 ? 0.2 : 0.9;
      }
    }

    const res = extractScaleAwareStudioLineArt(
      { rgba, width: w, height: h, depthBuffer: depth },
      {
        cropRect: { x: 8, y: 8, width: 16, height: 16 },
        outputWidth: 64,
        outputHeight: 64,
        extractorOptions: { algorithm: "normal-depth", depthThreshold: 0.1, lineThickness: 2 },
      },
    );

    expect(res.extracted.width).toBe(64);
    expect(res.extracted.linePixelCount).toBeGreaterThan(0);
    // 4x 크롭인데도 페이지 선폭은 4px 근방 유지(단순 확대 시 16px로 튀는 문제 해결)
    expect(res.inkAudit.measuredMedianInkSpanPx).toBeLessThanOrEqual(5);
  });

  it("rejects output dimensions exceeding the pixel safety budget", () => {
    expect(() =>
      planScaleAwareLtExtraction({
        sourceWidth: 1000,
        sourceHeight: 1000,
        outputWidth: 5000,
        outputHeight: 5000,
        targetLineThickness: 2,
      })).toThrow(/최대 픽셀 예산/u);
  });
});
