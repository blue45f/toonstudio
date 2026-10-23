/**
 * 분석용 래스터 — RGBA 픽셀 배열 검증과 면적 평균 축소.
 *
 * `ImageData` 와 구조가 같은 최소 모양(`width`, `height`, `data`)만 받는다. 브라우저의 디코딩·캔버스는 이 모듈 밖
 * (anchor-image-io.ts)에 있고, 이 모듈은 DOM 없이 시험할 수 있다. 큰 이미지는 분석 전에 긴 변 기준으로 줄인다.
 */

export interface AnchorRaster {
  readonly width: number;
  readonly height: number;
  /** RGBA, 길이 width×height×4. 알파는 비곱셈(non-premultiplied)이다(ImageData 와 같다). */
  readonly data: Uint8ClampedArray | Uint8Array;
}

export const ANCHOR_ANALYSIS_LIMITS = Object.freeze({
  /** 분석 래스터의 긴 변 상한. 이보다 크면 면적 평균으로 줄인다. */
  maxEdge: 256,
  /** 이보다 작은 이미지는 특징이 불안정해 분석하지 않는다. */
  minEdge: 16,
  /** 축소 전 입력 픽셀 상한(메모리 보호). 앵커 한도(4096×4096)와 같다. */
  maxInputPixels: 16_777_216,
});

export type AnchorFeatureErrorCode =
  | "invalid-raster"
  | "raster-too-small"
  | "raster-too-large"
  | "empty-image"
  | "cancelled"
  | "timeout"
  | "worker-unavailable"
  | "worker-failed"
  | "worker-protocol";

export class AnchorFeatureError extends Error {
  readonly code: AnchorFeatureErrorCode;

  constructor(code: AnchorFeatureErrorCode, options?: { readonly cause?: unknown }) {
    super(`앵커 특징 분석 실패: ${code}`, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AnchorFeatureError";
    this.code = code;
  }
}

/** 모양과 크기를 검사한다. 문제가 있으면 AnchorFeatureError. */
export function assertAnchorRaster(raster: AnchorRaster): void {
  const { width, height, data } = raster;
  if (
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || !(data instanceof Uint8ClampedArray || data instanceof Uint8Array)
    || data.length !== width * height * 4
  ) {
    throw new AnchorFeatureError("invalid-raster");
  }
  if (width * height > ANCHOR_ANALYSIS_LIMITS.maxInputPixels) throw new AnchorFeatureError("raster-too-large");
  if (Math.min(width, height) < ANCHOR_ANALYSIS_LIMITS.minEdge) throw new AnchorFeatureError("raster-too-small");
}

/**
 * 긴 변이 maxEdge 를 넘으면 면적 평균(box filter)으로 줄인다. 색은 알파로 가중해 평균하므로 투명한 가장자리의 숨은
 * 색이 번지지 않는다. 넘지 않으면 입력을 그대로 돌려준다(복사하지 않는다).
 */
export function downscaleAnchorRaster(raster: AnchorRaster, maxEdge: number = ANCHOR_ANALYSIS_LIMITS.maxEdge): AnchorRaster {
  assertAnchorRaster(raster);
  const longEdge = Math.max(raster.width, raster.height);
  if (longEdge <= maxEdge) return raster;
  const scale = maxEdge / longEdge;
  const outWidth = Math.max(1, Math.round(raster.width * scale));
  const outHeight = Math.max(1, Math.round(raster.height * scale));
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  const stepX = raster.width / outWidth;
  const stepY = raster.height / outHeight;
  const source = raster.data;
  for (let oy = 0; oy < outHeight; oy += 1) {
    const y0 = Math.floor(oy * stepY);
    const y1 = Math.max(y0 + 1, Math.min(raster.height, Math.ceil((oy + 1) * stepY)));
    for (let ox = 0; ox < outWidth; ox += 1) {
      const x0 = Math.floor(ox * stepX);
      const x1 = Math.max(x0 + 1, Math.min(raster.width, Math.ceil((ox + 1) * stepX)));
      let weightedR = 0;
      let weightedG = 0;
      let weightedB = 0;
      let alphaSum = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        let index = (y * raster.width + x0) * 4;
        for (let x = x0; x < x1; x += 1, index += 4) {
          const alpha = source[index + 3] ?? 0;
          weightedR += (source[index] ?? 0) * alpha;
          weightedG += (source[index + 1] ?? 0) * alpha;
          weightedB += (source[index + 2] ?? 0) * alpha;
          alphaSum += alpha;
          count += 1;
        }
      }
      const target = (oy * outWidth + ox) * 4;
      if (alphaSum > 0) {
        out[target] = Math.round(weightedR / alphaSum);
        out[target + 1] = Math.round(weightedG / alphaSum);
        out[target + 2] = Math.round(weightedB / alphaSum);
      }
      out[target + 3] = Math.round(alphaSum / count);
    }
  }
  return { width: outWidth, height: outHeight, data: out };
}
