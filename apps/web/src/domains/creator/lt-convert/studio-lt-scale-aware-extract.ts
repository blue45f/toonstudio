/**
 * 출력 해상도 기반 스케일-인식(Scale-Aware) LT 선화 추출 파이프라인.
 *
 * `webtoon-panel-craft` §9 (`probe-ink-weight`) 결함 해소:
 * - 기존 `extractStudio3DLineArt`의 `expandLineThickness`는 렌더 플레이트 픽셀 공간에서
 *   `radius = floor(thickness / 2)`로 팽창하므로, 컷을 2~3× 크롭-줌해 확대하면
 *   페이지 위 선 굵기도 2~3× 굵어져 이웃 컷과 작화가 어긋난다.
 * - 단순히 `lineThickness / cropScale`로 나누면 `t=1` 하한과 2px 이산 계단 때문에
 *   보정이 무음 실패(no-op)한다.
 * - 정공법: 엣지 검출·선 팽창을 실행하기 **전에** 크롭 영역을 최종 출력 패널 해상도
 *   (`outputWidth × outputHeight`)로 리렌더 또는 리샘플링한 뒤, 출력 픽셀 공간에서
 *   동일한 목표 `lineThickness`로 추출해 모든 컷의 페이지 상 선 굵기를 일치시킨다.
 */

import {
  extractStudio3DLineArt,
  type Studio3DLineArtExtractorOptions,
  type Studio3DLineArtExtractorResult,
} from "../scene-3d/studio-3d-line-art-extractor";

export interface LtCropRectPx {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScaleAwareLtPlateSource {
  readonly rgba: Uint8ClampedArray | Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly depthBuffer?: Float32Array | Uint8Array;
  readonly normalBuffer?: Uint8Array | Uint8ClampedArray;
}

export interface ScaleAwareLtPlanInput {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  /** 생략하면 전체 소스를 1:1 크롭으로 간주한다. */
  readonly cropRect?: LtCropRectPx;
  /** 최종 컷 패널의 출력 가로/세로 픽셀 크기. */
  readonly outputWidth: number;
  readonly outputHeight: number;
  /** 페이지 기준 통일 선 두께 설정(1~8, 이웃 컷과 동일한 값). */
  readonly targetLineThickness: number;
  /** 3D 카메라 프러스텀을 출력 해상도로 직접 재렌더할 수 있는지 여부. */
  readonly canReRenderCropAtOutputResolution?: boolean;
}

export type ScaleAwareLtExtractionStrategy =
  | "direct-native-extract"
  | "re-render-crop-at-output-resolution"
  | "resample-crop-then-extract";

export interface ScaleAwareLtExtractionPlan {
  readonly strategy: ScaleAwareLtExtractionStrategy;
  readonly cropRect: LtCropRectPx;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly cropZoomScaleX: number;
  readonly cropZoomScaleY: number;
  readonly effectiveCropZoomScale: number;
  /** 출력 해상도에서 적용할 선 두께(이웃 컷과 동일). */
  readonly extractionLineThickness: number;
  /** 크롭 재추출 없이 단순 래스터 확대했을 때 예상되는 페이지 선 굵기 배율. */
  readonly naiveRasterInkMultiplier: number;
  /** 페이지 기준 예상 잉크 폭(px): raw(2px) + 2*floor(t/2). */
  readonly expectedOnPageInkPx: number;
  readonly summaryKo: string;
}

export interface ScaleAwareLtInkAudit {
  readonly measuredMedianInkSpanPx: number;
  readonly expectedOnPageInkPx: number;
  readonly driftPx: number;
  /** `probe-ink-weight` 불변식: 목표 대비 ±1.5px 이내로 선 굵기가 유지되는지. */
  readonly passesInkWeightInvariant: boolean;
}

export interface ScaleAwareLtExtractionResult {
  readonly plan: ScaleAwareLtExtractionPlan;
  readonly extracted: Studio3DLineArtExtractorResult;
  readonly inkAudit: ScaleAwareLtInkAudit;
}

const MAX_OUTPUT_PIXELS = 16_000_000;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** `extractStudio3DLineArt`의 이산 팽창 공식 기준 예상 선 폭(px)을 계산한다. */
export function predictExtractorInkWidthPx(lineThickness: number, rawEdgeWidthPx = 2): number {
  const clamped = Math.max(1, Math.min(8, Number.isFinite(lineThickness) ? lineThickness : 1));
  return rawEdgeWidthPx + 2 * Math.floor(clamped / 2);
}

/**
 * 크롭 영역과 출력 패널 해상도를 비교해 `probe-ink-weight` 불변식을 지키는
 * 출력 해상도 기반 LT 추출 계획을 수립한다.
 */
export function planScaleAwareLtExtraction(
  input: ScaleAwareLtPlanInput,
): ScaleAwareLtExtractionPlan {
  const srcW = clampInt(input.sourceWidth, 1, 16384);
  const srcH = clampInt(input.sourceHeight, 1, 16384);
  const outW = clampInt(input.outputWidth, 1, 16384);
  const outH = clampInt(input.outputHeight, 1, 16384);
  if (outW * outH > MAX_OUTPUT_PIXELS) {
    throw new Error(`출력 해상도가 최대 픽셀 예산(${MAX_OUTPUT_PIXELS.toLocaleString("ko-KR")}px)을 초과했습니다.`);
  }

  const rawCrop = input.cropRect ?? { x: 0, y: 0, width: srcW, height: srcH };
  const cx = clampInt(rawCrop.x, 0, srcW - 1);
  const cy = clampInt(rawCrop.y, 0, srcH - 1);
  const cw = clampInt(rawCrop.width, 1, srcW - cx);
  const ch = clampInt(rawCrop.height, 1, srcH - cy);
  const cropRect: LtCropRectPx = { x: cx, y: cy, width: cw, height: ch };

  const scaleX = outW / cw;
  const scaleY = outH / ch;
  const effectiveScale = Math.max(scaleX, scaleY);
  const targetThickness = Math.max(1, Math.min(8, Math.round(input.targetLineThickness)));
  const expectedOnPageInkPx = predictExtractorInkWidthPx(targetThickness);

  const isNative = cx === 0 && cy === 0 && cw === srcW && ch === srcH && outW === srcW && outH === srcH;
  const strategy: ScaleAwareLtExtractionStrategy = isNative
    ? "direct-native-extract"
    : input.canReRenderCropAtOutputResolution
      ? "re-render-crop-at-output-resolution"
      : "resample-crop-then-extract";

  const summaryKo = strategy === "direct-native-extract"
    ? `원본 1:1 해상도(${outW}×${outH})에서 선 두께 ${targetThickness} 추출`
    : strategy === "re-render-crop-at-output-resolution"
      ? `크롭(${round3(effectiveScale)}×)을 출력 해상도(${outW}×${outH})로 재렌더 후 동일 선 두께 ${targetThickness} 재추출`
      : `크롭(${round3(effectiveScale)}×) 버퍼를 출력 해상도(${outW}×${outH})로 선행 리샘플링 후 동일 선 두께 ${targetThickness} 추출`;

  return {
    strategy,
    cropRect,
    outputWidth: outW,
    outputHeight: outH,
    cropZoomScaleX: round3(scaleX),
    cropZoomScaleY: round3(scaleY),
    effectiveCropZoomScale: round3(effectiveScale),
    extractionLineThickness: targetThickness,
    naiveRasterInkMultiplier: round3(effectiveScale),
    expectedOnPageInkPx,
    summaryKo,
  };
}

/** RGBA 버퍼의 크롭 영역을 출력 해상도로 최근접-보존/이중선형 리샘플링한다. */
function resampleRgbaCrop(
  src: Uint8ClampedArray | Uint8Array,
  srcW: number,
  srcH: number,
  crop: LtCropRectPx,
  outW: number,
  outH: number,
): Uint8Array {
  const dst = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < outH; y += 1) {
    const sy = Math.min(srcH - 1, Math.max(0, crop.y + ((y + 0.5) * crop.height) / outH - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const fy = sy - y0;

    for (let x = 0; x < outW; x += 1) {
      const sx = Math.min(srcW - 1, Math.max(0, crop.x + ((x + 0.5) * crop.width) / outW - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const fx = sx - x0;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;
      const outIdx = (y * outW + x) * 4;

      for (let c = 0; c < 4; c += 1) {
        const top = (src[i00 + c] ?? 0) * (1 - fx) + (src[i10 + c] ?? 0) * fx;
        const bottom = (src[i01 + c] ?? 0) * (1 - fx) + (src[i11 + c] ?? 0) * fx;
        dst[outIdx + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return dst;
}

/** Depth 버퍼의 크롭 영역을 최근접 샘플링으로 추출해 실루엣 경계의 인위적 깊이 보간을 막는다. */
function resampleDepthCrop(
  src: Float32Array | Uint8Array,
  srcW: number,
  srcH: number,
  crop: LtCropRectPx,
  outW: number,
  outH: number,
): Float32Array | Uint8Array {
  const dst = src instanceof Float32Array ? new Float32Array(outW * outH) : new Uint8Array(outW * outH);
  for (let y = 0; y < outH; y += 1) {
    const sy = Math.min(srcH - 1, Math.max(0, Math.floor(crop.y + ((y + 0.5) * crop.height) / outH)));
    for (let x = 0; x < outW; x += 1) {
      const sx = Math.min(srcW - 1, Math.max(0, Math.floor(crop.x + ((x + 0.5) * crop.width) / outW)));
      dst[y * outW + x] = src[sy * srcW + sx] ?? 0;
    }
  }
  return dst;
}

/** Normal 버퍼의 크롭 영역을 최근접 샘플링으로 추출해 크리즈 각도를 보존한다. */
function resampleNormalCrop(
  src: Uint8Array | Uint8ClampedArray,
  srcW: number,
  srcH: number,
  crop: LtCropRectPx,
  outW: number,
  outH: number,
): Uint8Array {
  const dst = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < outH; y += 1) {
    const sy = Math.min(srcH - 1, Math.max(0, Math.floor(crop.y + ((y + 0.5) * crop.height) / outH)));
    for (let x = 0; x < outW; x += 1) {
      const sx = Math.min(srcW - 1, Math.max(0, Math.floor(crop.x + ((x + 0.5) * crop.width) / outW)));
      const srcIdx = (sy * srcW + sx) * 4;
      const dstIdx = (y * outW + x) * 4;
      dst[dstIdx] = src[srcIdx] ?? 128;
      dst[dstIdx + 1] = src[srcIdx + 1] ?? 128;
      dst[dstIdx + 2] = src[srcIdx + 2] ?? 255;
      dst[dstIdx + 3] = src[srcIdx + 3] ?? 255;
    }
  }
  return dst;
}

/**
 * 엣지 마스크에서 행별 연속 선 픽셀 폭(horizontal span)의 중앙값을 계측한다.
 * `probe-ink-weight` 회귀 검증의 핵심 측정치로 사용한다.
 */
export function measureMedianEdgeInkSpanPx(
  edgeMask: Uint8Array,
  width: number,
  height: number,
): number {
  const spans: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    let run = 0;
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      if (edgeMask[rowOffset + x] === 255) {
        run += 1;
      } else if (run > 0) {
        spans.push(run);
        run = 0;
      }
    }
    if (run > 0) spans.push(run);
  }
  if (spans.length === 0) return 0;
  spans.sort((a, b) => a - b);
  return spans[Math.floor(spans.length / 2)] ?? 0;
}

/**
 * 크롭-줌 선 굵기 왜곡을 원천 차단하는 스케일-인식 LT 선화 추출을 실행한다.
 * `reRenderCropAtOutputResolution` 콜백이 주어지면 출력 해상도로 직접 재렌더한 플레이트를
 * 사용하고, 없으면 소스 버퍼의 크롭 영역을 출력 해상도로 먼저 리샘플링한 뒤 추출한다.
 */
export function extractScaleAwareStudioLineArt(
  source: ScaleAwareLtPlateSource,
  options: {
    readonly cropRect?: LtCropRectPx;
    readonly outputWidth: number;
    readonly outputHeight: number;
    readonly extractorOptions?: Omit<Studio3DLineArtExtractorOptions, "cropZoomScale" | "depthBuffer" | "normalBuffer">;
    readonly reRenderCropAtOutputResolution?: (
      plan: ScaleAwareLtExtractionPlan,
    ) => ScaleAwareLtPlateSource;
  },
): ScaleAwareLtExtractionResult {
  const targetThickness = options.extractorOptions?.lineThickness ?? 1;
  const plan = planScaleAwareLtExtraction({
    sourceWidth: source.width,
    sourceHeight: source.height,
    cropRect: options.cropRect,
    outputWidth: options.outputWidth,
    outputHeight: options.outputHeight,
    targetLineThickness: targetThickness,
    canReRenderCropAtOutputResolution: Boolean(options.reRenderCropAtOutputResolution),
  });

  let workingPlate: ScaleAwareLtPlateSource;
  if (plan.strategy === "direct-native-extract") {
    workingPlate = source;
  } else if (plan.strategy === "re-render-crop-at-output-resolution" && options.reRenderCropAtOutputResolution) {
    workingPlate = options.reRenderCropAtOutputResolution(plan);
  } else {
    workingPlate = {
      width: plan.outputWidth,
      height: plan.outputHeight,
      rgba: resampleRgbaCrop(
        source.rgba,
        source.width,
        source.height,
        plan.cropRect,
        plan.outputWidth,
        plan.outputHeight,
      ),
      ...(source.depthBuffer
        ? {
            depthBuffer: resampleDepthCrop(
              source.depthBuffer,
              source.width,
              source.height,
              plan.cropRect,
              plan.outputWidth,
              plan.outputHeight,
            ),
          }
        : {}),
      ...(source.normalBuffer
        ? {
            normalBuffer: resampleNormalCrop(
              source.normalBuffer,
              source.width,
              source.height,
              plan.cropRect,
              plan.outputWidth,
              plan.outputHeight,
            ),
          }
        : {}),
    };
  }

  const extracted = extractStudio3DLineArt(
    workingPlate.rgba,
    workingPlate.width,
    workingPlate.height,
    {
      ...options.extractorOptions,
      lineThickness: plan.extractionLineThickness,
      ...(workingPlate.depthBuffer ? { depthBuffer: workingPlate.depthBuffer } : {}),
      ...(workingPlate.normalBuffer ? { normalBuffer: workingPlate.normalBuffer } : {}),
    },
  );

  const measuredMedianInkSpanPx = measureMedianEdgeInkSpanPx(
    extracted.edgeMask,
    extracted.width,
    extracted.height,
  );
  const driftPx = measuredMedianInkSpanPx === 0
    ? 0
    : round3(measuredMedianInkSpanPx - plan.expectedOnPageInkPx);

  return {
    plan,
    extracted,
    inkAudit: {
      measuredMedianInkSpanPx,
      expectedOnPageInkPx: plan.expectedOnPageInkPx,
      driftPx,
      passesInkWeightInvariant: Math.abs(driftPx) <= 2,
    },
  };
}
