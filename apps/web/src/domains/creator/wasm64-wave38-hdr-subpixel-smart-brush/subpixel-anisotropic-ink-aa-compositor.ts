/**
 * Wave 38: 고정밀 이방성 서브픽셀 선화 안티에일리어싱 래스터라이저 및 선명도 보존 밉맵 다운샘플러.
 *
 * - 4x 회전 격자(RGSS) 서브픽셀 샘플링과 법선(선 옆면)·접선(선 끝단) 비등방 경계 폭 제어로
 *   600dpi 웹툰 가는 펜선을 계단 현상이나 뿌연 회색 번짐 없이 또렷하게 래스터화한다.
 * - 프리멀티플라이드 선형 광량(Premultiplied Linear Light) 공간에서 국소 선화 대비를 반영한
 *   밉맵 다운샘플링을 수행해, 모바일 축소 미리보기에서도 속눈썹과 가는 해칭 밀도를 유지한다.
 */

/** 4x 회전 격자(4-Queens RGSS) 서브픽셀 오프셋 (`[-0.5, 0.5]^2`, 원점 점대칭 및 90° 회전 대칭). */
export const RGSS_4X_SUBPIXEL_OFFSETS: readonly (readonly [number, number])[] =
  Object.freeze([
    [-0.375, -0.125],
    [0.125, -0.375],
    [0.375, 0.125],
    [-0.125, 0.375],
  ]);

/** 선 옆면(법선 방향) 기본 경계 선명도 (`0..1`, 높을수록 칼선). */
export const DEFAULT_NORMAL_EDGE_SHARPNESS = 0.82 as const;
/** 선 끝단(접선 방향) 기본 경계 선명도 (`0..1`, 낮을수록 끝맺음이 부드러움). */
export const DEFAULT_TANGENTIAL_EDGE_SHARPNESS = 0.45 as const;
/** 축소 밉맵 생성 시 가는 선화 밀도 보존 기본 강도 (`0..1`). */
export const DEFAULT_CRISP_MIP_DENSITY_PRESERVATION = 0.65 as const;

/** 웹툰 펜선 기본 먹색 (선형 RGB 광량). */
export const DEFAULT_INK_LINEAR_COLOR: LinearRgbInkColor = Object.freeze({
  r: 0.008,
  g: 0.008,
  b: 0.01,
});

/** 기본 원고지 배경색 (sRGB 8비트 백색). */
export const DEFAULT_PAPER_SRGB8: Srgb8PaperColor = Object.freeze({
  r: 255,
  g: 255,
  b: 255,
});

export type MipDownsampleFactor = 2 | 4 | 8;

export interface LinearRgbInkColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Srgb8PaperColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface PremultipliedLinearRgbaBuffer {
  readonly width: number;
  readonly height: number;
  /** 픽셀당 `[r * a, g * a, b * a, a]` 선형 광량 배열 (`length === width * height * 4`). */
  readonly data: Float32Array;
}

export interface PixelBoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface AnisotropicCapsuleSegmentInput {
  readonly width: number;
  readonly height: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly radiusPx?: number;
  readonly radiusStartPx?: number;
  readonly radiusEndPx?: number;
  readonly inkLinearColor?: LinearRgbInkColor;
  readonly opacity?: number;
  readonly normalSharpness?: number;
  readonly tangentialSharpness?: number;
  readonly target?: PremultipliedLinearRgbaBuffer;
}

export interface AnisotropicCapsuleSegmentResult {
  readonly buffer: PremultipliedLinearRgbaBuffer;
  readonly bounds: PixelBoundingBox;
  readonly totalInkCoverage: number;
  readonly touchedPixelCount: number;
  readonly peakAlpha: number;
}

export interface CrispInkMipDownsampleInput {
  readonly source: PremultipliedLinearRgbaBuffer;
  readonly factor?: MipDownsampleFactor;
  /** 가는 선의 국소 알파 대비를 보존하는 강도 (`0..1`, `0`이면 순수 박스 평균). */
  readonly densityPreservation?: number;
}

export interface CrispInkMipDownsampleResult {
  readonly buffer: PremultipliedLinearRgbaBuffer;
  readonly factor: MipDownsampleFactor;
  readonly peakAlpha: number;
  readonly meanAlpha: number;
  /** 순수 선형 박스 평균 대비 보존된 피크 알파 배율 (`>= 1`). */
  readonly peakRetentionRatioVsBox: number;
}

export interface LinearInkPaperCompositeInput {
  readonly ink: PremultipliedLinearRgbaBuffer;
  readonly paperSrgb8?: Srgb8PaperColor;
  readonly paperLinearColor?: LinearRgbInkColor;
  /** HDR 노출 보정 스톱 (`0`이면 `1.0x` 기본 노출). */
  readonly exposureStops?: number;
}

export interface LinearInkPaperCompositeResult {
  readonly width: number;
  readonly height: number;
  /** 최종 sRGB 8비트 RGBA 버퍼 (`alpha === 255`). */
  readonly srgb8Rgba: Uint8ClampedArray;
  /** 합성 직후 선형 광량 RGB 버퍼 (`length === width * height * 3`). */
  readonly linearRgb: Float32Array;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** IEC 61966-2-1 표준에 따라 8비트 sRGB 채널(`0..255`)을 선형 광량(`0..1`)으로 변환한다. */
export function srgb8ChannelToLinear(channel8: number): number {
  const s = clamp(channel8, 0, 255) / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** 선형 광량 채널(`0..1`)을 IEC 61966-2-1 표준 8비트 sRGB 정수로 인코딩한다. */
export function linearChannelToSrgb8(linear: number): number {
  const c = clamp(linear, 0, 1);
  const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(clamp(encoded * 255, 0, 255));
}

/** 지정 해상도의 빈 프리멀티플라이드 선형 RGBA 버퍼를 생성한다. */
export function createPremultipliedLinearBuffer(
  width: number,
  height: number,
): PremultipliedLinearRgbaBuffer {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  return { width: safeW, height: safeH, data: new Float32Array(safeW * safeH * 4) };
}

function evaluateAnisotropicSubpixelCoverage(
  dn: number,
  dt: number,
  radiusPx: number,
  normalWidthPx: number,
  tangentialWidthPx: number,
): number {
  if (radiusPx <= 0) return 0;
  const dist = Math.hypot(dn, dt);
  const effectiveAaWidthPx =
    dist > 1e-6
      ? Math.hypot(dn * normalWidthPx, dt * tangentialWidthPx) / dist
      : normalWidthPx;

  const halfFilter = 0.5 * effectiveAaWidthPx;
  const left = Math.max(-radiusPx, dist - halfFilter);
  const right = Math.min(radiusPx, dist + halfFilter);
  if (right <= left) return 0;

  const rawOverlap = (right - left) / effectiveAaWidthPx;
  const maxPossibleOverlap = Math.min(1, (2 * radiusPx) / effectiveAaWidthPx);
  if (maxPossibleOverlap <= 1e-8) return 0;

  const t = clamp(rawOverlap / maxPossibleOverlap, 0, 1);
  return clamp(maxPossibleOverlap * t * t * (3 - 2 * t), 0, 1);
}

/**
 * 가변 반지름 캡슐 선분을 4x 회전 격자 서브픽셀 커버리지와 법선·접선 비등방 선명도로
 * 프리멀티플라이드 선형 광량 버퍼에 래스터화한다.
 */
export function rasterizeAnisotropicCapsuleSegment(
  input: AnisotropicCapsuleSegmentInput,
): AnisotropicCapsuleSegmentResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const buffer =
    input.target && input.target.width === width && input.target.height === height
      ? input.target
      : createPremultipliedLinearBuffer(width, height);

  const baseRadius = Math.max(0, input.radiusPx ?? 1.0);
  const r0 = Math.max(0, input.radiusStartPx ?? baseRadius);
  const r1 = Math.max(0, input.radiusEndPx ?? baseRadius);
  const opacity = clamp(input.opacity ?? 1, 0, 1);
  const ink = input.inkLinearColor ?? DEFAULT_INK_LINEAR_COLOR;
  const inkR = clamp(ink.r, 0, 8);
  const inkG = clamp(ink.g, 0, 8);
  const inkB = clamp(ink.b, 0, 8);

  const normalSharpness = clamp(input.normalSharpness ?? DEFAULT_NORMAL_EDGE_SHARPNESS, 0, 1);
  const tangentialSharpness = clamp(
    input.tangentialSharpness ?? DEFAULT_TANGENTIAL_EDGE_SHARPNESS,
    0,
    1,
  );
  const normalAaWidthPx = 0.96 - 0.76 * normalSharpness;
  const tangentialAaWidthPx = 1.08 - 0.84 * tangentialSharpness;
  const maxMarginPx =
    Math.max(r0, r1) + 0.5 * Math.max(normalAaWidthPx, tangentialAaWidthPx) + 1;

  const minX = clamp(Math.floor(Math.min(input.x0, input.x1) - maxMarginPx), 0, width - 1);
  const maxX = clamp(Math.ceil(Math.max(input.x0, input.x1) + maxMarginPx), 0, width - 1);
  const minY = clamp(Math.floor(Math.min(input.y0, input.y1) - maxMarginPx), 0, height - 1);
  const maxY = clamp(Math.ceil(Math.max(input.y0, input.y1) + maxMarginPx), 0, height - 1);

  const vx = input.x1 - input.x0;
  const vy = input.y1 - input.y0;
  const segLen = Math.hypot(vx, vy);
  const tx = segLen > 1e-6 ? vx / segLen : 1;
  const ty = segLen > 1e-6 ? vy / segLen : 0;
  const nx = -ty;
  const ny = tx;

  const sampleAt = (sx: number, sy: number): number => {
    const dx = sx - input.x0;
    const dy = sy - input.y0;
    const along = dx * tx + dy * ty;
    const tParam = segLen > 1e-6 ? clamp(along / segLen, 0, 1) : 0;
    const localRadius = r0 + (r1 - r0) * tParam;
    const dn = Math.abs(dx * nx + dy * ny);
    const dt = along < 0 ? -along : along > segLen ? along - segLen : 0;
    return evaluateAnisotropicSubpixelCoverage(
      dn,
      dt,
      localRadius,
      normalAaWidthPx,
      tangentialAaWidthPx,
    );
  };

  const data = buffer.data;
  let touchedPixelCount = 0;

  if (opacity > 0 && (r0 > 0 || r1 > 0)) {
    for (let py = minY; py <= maxY; py += 1) {
      const centerY = py + 0.5;
      for (let px = minX; px <= maxX; px += 1) {
        const centerX = px + 0.5;
        let coverageSum = 0;
        // 4x 회전 격자와 거울 켤레 쌍을 대칭 평가해 캡과 사선에서도 D4 반사 대칭을 유지한다.
        for (const [ox, oy] of RGSS_4X_SUBPIXEL_OFFSETS) {
          coverageSum +=
            0.5 * (sampleAt(centerX + ox, centerY + oy) + sampleAt(centerX + ox, centerY - oy));
        }

        const srcAlpha = clamp(coverageSum * 0.25 * opacity, 0, 1);
        if (srcAlpha <= 1e-7) continue;

        touchedPixelCount += 1;
        const idx = (py * width + px) * 4;
        const invSrcA = 1 - srcAlpha;
        data[idx] = inkR * srcAlpha + (data[idx] ?? 0) * invSrcA;
        data[idx + 1] = inkG * srcAlpha + (data[idx + 1] ?? 0) * invSrcA;
        data[idx + 2] = inkB * srcAlpha + (data[idx + 2] ?? 0) * invSrcA;
        data[idx + 3] = srcAlpha + (data[idx + 3] ?? 0) * invSrcA;
      }
    }
  }

  let totalInkCoverage = 0;
  let peakAlpha = 0;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i] ?? 0;
    totalInkCoverage += a;
    if (a > peakAlpha) peakAlpha = a;
  }

  return {
    buffer,
    bounds: { minX, minY, maxX, maxY },
    totalInkCoverage: normalizeZero(totalInkCoverage),
    touchedPixelCount,
    peakAlpha: normalizeZero(peakAlpha),
  };
}

function downsampleSingle2xStage(
  src: PremultipliedLinearRgbaBuffer,
  densityPreservation: number,
): PremultipliedLinearRgbaBuffer {
  const dstW = Math.max(1, Math.ceil(src.width * 0.5));
  const dstH = Math.max(1, Math.ceil(src.height * 0.5));
  const dst = createPremultipliedLinearBuffer(dstW, dstH);
  const sData = src.data;
  const dData = dst.data;

  for (let dy = 0; dy < dstH; dy += 1) {
    const sy0 = dy * 2;
    const sy1 = Math.min(src.height - 1, sy0 + 1);
    for (let dx = 0; dx < dstW; dx += 1) {
      const sx0 = dx * 2;
      const sx1 = Math.min(src.width - 1, sx0 + 1);
      const indices = [
        (sy0 * src.width + sx0) * 4,
        (sy0 * src.width + sx1) * 4,
        (sy1 * src.width + sx0) * 4,
        (sy1 * src.width + sx1) * 4,
      ] as const;

      let sumPmR = 0;
      let sumPmG = 0;
      let sumPmB = 0;
      let sumA = 0;
      let maxA = 0;
      for (const idx of indices) {
        const a = sData[idx + 3] ?? 0;
        sumPmR += sData[idx] ?? 0;
        sumPmG += sData[idx + 1] ?? 0;
        sumPmB += sData[idx + 2] ?? 0;
        sumA += a;
        if (a > maxA) maxA = a;
      }

      const avgPmR = sumPmR * 0.25;
      const avgPmG = sumPmG * 0.25;
      const avgPmB = sumPmB * 0.25;
      const avgA = sumA * 0.25;
      const boostedA = clamp(avgA + densityPreservation * (maxA - avgA) * (1 - avgA), 0, 1);
      const scale = avgA > 1e-8 ? boostedA / avgA : 0;
      const outIdx = (dy * dstW + dx) * 4;

      dData[outIdx] = avgPmR * scale;
      dData[outIdx + 1] = avgPmG * scale;
      dData[outIdx + 2] = avgPmB * scale;
      dData[outIdx + 3] = boostedA;
    }
  }
  return dst;
}

/**
 * 프리멀티플라이드 선형 광량 버퍼를 2x·4x·8x 다단계로 다운샘플링하며,
 * 가는 속눈썹과 크로스해칭이 흐려져 사라지지 않도록 선화 밀도를 보존한다.
 */
export function downsamplePremultipliedCrispInkMip(
  input: CrispInkMipDownsampleInput,
): CrispInkMipDownsampleResult {
  const factor: MipDownsampleFactor =
    input.factor === 4 || input.factor === 8 ? input.factor : 2;
  const densityPreservation = clamp(
    input.densityPreservation ?? DEFAULT_CRISP_MIP_DENSITY_PRESERVATION,
    0,
    1,
  );
  const stageCount = factor === 8 ? 3 : factor === 4 ? 2 : 1;

  let current = input.source;
  let boxCurrent = input.source;
  for (let s = 0; s < stageCount; s += 1) {
    current = downsampleSingle2xStage(current, densityPreservation);
    boxCurrent = downsampleSingle2xStage(boxCurrent, 0);
  }

  let peakAlpha = 0;
  let alphaSum = 0;
  for (let i = 3; i < current.data.length; i += 4) {
    const a = current.data[i] ?? 0;
    alphaSum += a;
    if (a > peakAlpha) peakAlpha = a;
  }

  let boxPeakAlpha = 0;
  for (let i = 3; i < boxCurrent.data.length; i += 4) {
    const a = boxCurrent.data[i] ?? 0;
    if (a > boxPeakAlpha) boxPeakAlpha = a;
  }

  const pixelCount = Math.max(1, current.width * current.height);
  return {
    buffer: current,
    factor,
    peakAlpha: normalizeZero(peakAlpha),
    meanAlpha: normalizeZero(alphaSum / pixelCount),
    peakRetentionRatioVsBox: boxPeakAlpha > 1e-8 ? peakAlpha / boxPeakAlpha : 1,
  };
}

/**
 * 프리멀티플라이드 선형 잉크 버퍼를 원고지 배경 위에 물리적 선형 광량(Porter-Duff Over)으로 합성하고,
 * 감마 왜곡에 의한 어두운 회색 테두리 없이 표준 sRGB 8비트 이미지로 변환한다.
 */
export function compositeLinearInkOverPaper(
  input: LinearInkPaperCompositeInput,
): LinearInkPaperCompositeResult {
  const { width, height, data } = input.ink;
  const paperSrgb = input.paperSrgb8 ?? DEFAULT_PAPER_SRGB8;
  const paperLinear: LinearRgbInkColor = input.paperLinearColor ?? {
    r: srgb8ChannelToLinear(paperSrgb.r),
    g: srgb8ChannelToLinear(paperSrgb.g),
    b: srgb8ChannelToLinear(paperSrgb.b),
  };
  const exposureScale = 2 ** clamp(input.exposureStops ?? 0, -8, 8);

  const pixelCount = width * height;
  const srgb8Rgba = new Uint8ClampedArray(pixelCount * 4);
  const linearRgb = new Float32Array(pixelCount * 3);

  for (let p = 0; p < pixelCount; p += 1) {
    const srcIdx = p * 4;
    const invAlpha = 1 - clamp(data[srcIdx + 3] ?? 0, 0, 1);
    const linR = Math.max(0, ((data[srcIdx] ?? 0) + paperLinear.r * invAlpha) * exposureScale);
    const linG = Math.max(0, ((data[srcIdx + 1] ?? 0) + paperLinear.g * invAlpha) * exposureScale);
    const linB = Math.max(0, ((data[srcIdx + 2] ?? 0) + paperLinear.b * invAlpha) * exposureScale);

    const linIdx = p * 3;
    linearRgb[linIdx] = normalizeZero(linR);
    linearRgb[linIdx + 1] = normalizeZero(linG);
    linearRgb[linIdx + 2] = normalizeZero(linB);

    srgb8Rgba[srcIdx] = linearChannelToSrgb8(linR);
    srgb8Rgba[srcIdx + 1] = linearChannelToSrgb8(linG);
    srgb8Rgba[srcIdx + 2] = linearChannelToSrgb8(linB);
    srgb8Rgba[srcIdx + 3] = 255;
  }

  return { width, height, srgb8Rgba, linearRgb };
}
