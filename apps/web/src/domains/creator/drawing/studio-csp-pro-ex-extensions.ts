/**
 * Clip Studio Paint Pro/EX 잔여 핵심 기능 통합 실행 엔진.
 *
 * - 벡터 지우개 3모드(`touch` · `intersection` · `whole`), RDP 단순화, 제어점 핀치 (re-export)
 * - 컬러라이즈(Colorize) 힌트 경계 인식 자동 채색 (re-export)
 * - 그라데이션 맵 8종 웹툰 프리셋 (`CSP_WEBTOON_GRADIENT_MAPS`, `applyCspWebtoonGradientMap`)
 * - 서브뷰 레퍼런스 대표색 팔레트 추출 (`extractCspSubViewReferencePalette`)
 * - 퀵 마스크 오버레이 합성 (`renderCspQuickMaskOverlay`)
 * - 타임랩스 링버퍼 스냅샷 레코더 (`createCspTimelapseSession`)
 * - 3D 데생 인형 비율·광원 프리셋 6종 (`CSP_DRAWING_FIGURE_PRESETS`)
 */

import {
  applyCspGradientMapFilter,
  type CspGradientMapStop,
} from "../filter/csp-rea/csp-rea-tonal-corrections";

import {
  applyCspColorizeHintAutoFill,
  rgbBytesToOklab,
  rgbBytesToOklch,
  type CspColorizeHint,
  type CspColorizeHintAutoFillOptions,
  type CspColorizeHintAutoFillResult,
  type CspOklchColor,
} from "./studio-csp-pro-ex-colorize";
import {
  eraseCspVectorStrokes,
  pinchCspVectorStroke,
  simplifyCspVectorStroke,
  type CspVectorEraseResult,
  type CspVectorEraserCircle,
  type CspVectorEraserMode,
  type CspVectorStroke,
  type CspVectorStrokePoint,
} from "./studio-csp-pro-ex-vector";

export {
  applyCspColorizeHintAutoFill,
  eraseCspVectorStrokes,
  pinchCspVectorStroke,
  rgbBytesToOklch,
  simplifyCspVectorStroke,
  type CspColorizeHint,
  type CspColorizeHintAutoFillOptions,
  type CspColorizeHintAutoFillResult,
  type CspOklchColor,
  type CspVectorEraseResult,
  type CspVectorEraserCircle,
  type CspVectorEraserMode,
  type CspVectorStroke,
  type CspVectorStrokePoint,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value);
}

// ============================================================================
// 1. 그라데이션 맵 8종 웹툰 프리셋
// ============================================================================

export type CspWebtoonGradientMapId =
  | "sunset"
  | "dawn-mist"
  | "neon-cyber"
  | "vintage-sepia"
  | "rofan-gold"
  | "horror-teal"
  | "sakura-pastel"
  | "manga-monochrome";

export interface CspWebtoonGradientMapPreset {
  readonly id: CspWebtoonGradientMapId;
  readonly labelKo: string;
  readonly moodTagKo: string;
  readonly stops: readonly CspGradientMapStop[];
  readonly previewOklchStops: readonly string[];
}

function makeGradientPreset(
  id: CspWebtoonGradientMapId,
  labelKo: string,
  moodTagKo: string,
  stops: readonly CspGradientMapStop[],
): CspWebtoonGradientMapPreset {
  return {
    id,
    labelKo,
    moodTagKo,
    stops,
    previewOklchStops: stops.map((s) => rgbBytesToOklch(s.r, s.g, s.b).css),
  };
}

export const CSP_WEBTOON_GRADIENT_MAPS: readonly CspWebtoonGradientMapPreset[] = Object.freeze([
  makeGradientPreset("sunset", "노을", "감성 석양", [
    { position01: 0, r: 42, g: 22, b: 64 },
    { position01: 0.35, r: 162, g: 56, b: 84 },
    { position01: 0.72, r: 238, g: 132, b: 74 },
    { position01: 1, r: 254, g: 232, b: 176 },
  ]),
  makeGradientPreset("dawn-mist", "새벽안개", "몽환 여명", [
    { position01: 0, r: 24, g: 34, b: 68 },
    { position01: 0.38, r: 78, g: 108, b: 152 },
    { position01: 0.75, r: 166, g: 184, b: 214 },
    { position01: 1, r: 238, g: 242, b: 248 },
  ]),
  makeGradientPreset("neon-cyber", "네온사이버", "사이버펑크", [
    { position01: 0, r: 18, g: 14, b: 46 },
    { position01: 0.38, r: 196, g: 36, b: 148 },
    { position01: 0.72, r: 52, g: 204, b: 232 },
    { position01: 1, r: 224, g: 252, b: 255 },
  ]),
  makeGradientPreset("vintage-sepia", "빈티지세피아", "회상 연출", [
    { position01: 0, r: 44, g: 28, b: 18 },
    { position01: 0.42, r: 134, g: 92, b: 56 },
    { position01: 0.78, r: 208, g: 172, b: 126 },
    { position01: 1, r: 246, g: 234, b: 210 },
  ]),
  makeGradientPreset("rofan-gold", "로판골드", "화려한 황금빛", [
    { position01: 0, r: 58, g: 22, b: 42 },
    { position01: 0.36, r: 156, g: 82, b: 76 },
    { position01: 0.7, r: 226, g: 178, b: 96 },
    { position01: 1, r: 254, g: 246, b: 218 },
  ]),
  makeGradientPreset("horror-teal", "공포청록", "스릴러·미스터리", [
    { position01: 0, r: 8, g: 22, b: 26 },
    { position01: 0.4, r: 28, g: 84, b: 88 },
    { position01: 0.76, r: 112, g: 164, b: 156 },
    { position01: 1, r: 214, g: 234, b: 224 },
  ]),
  makeGradientPreset("sakura-pastel", "벚꽃파스텔", "로맨스 봄빛", [
    { position01: 0, r: 92, g: 48, b: 76 },
    { position01: 0.38, r: 212, g: 124, b: 156 },
    { position01: 0.74, r: 246, g: 196, b: 212 },
    { position01: 1, r: 255, g: 244, b: 248 },
  ]),
  makeGradientPreset("manga-monochrome", "흑백만화", "출판 고대비", [
    { position01: 0, r: 12, g: 12, b: 14 },
    { position01: 0.35, r: 68, g: 68, b: 72 },
    { position01: 0.7, r: 184, g: 184, b: 188 },
    { position01: 1, r: 252, g: 252, b: 254 },
  ]),
]);

/** 8종 웹툰 그라데이션 맵 프리셋을 실제 RGBA 픽셀 버퍼에 적용한다. */
export function applyCspWebtoonGradientMap(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  presetId: CspWebtoonGradientMapId,
  options?: { readonly mixRate01?: number; readonly reverse?: boolean },
): Uint8ClampedArray {
  const preset =
    CSP_WEBTOON_GRADIENT_MAPS.find((item) => item.id === presetId) ??
    CSP_WEBTOON_GRADIENT_MAPS[0];
  return applyCspGradientMapFilter(src, width, height, {
    stops: preset ? preset.stops : [],
    mixRate01: options?.mixRate01 ?? 1,
    reverse: options?.reverse ?? false,
  });
}

// ============================================================================
// 2. 서브뷰 레퍼런스 대표색 팔레트 추출 (RGBA 양자화 버킷팅 + OKLCH)
// ============================================================================

export interface CspSubViewPaletteSwatch {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly ratio01: number;
  readonly pixelCount: number;
  readonly oklch: {
    readonly l: number;
    readonly c: number;
    readonly h: number;
  };
  readonly oklchCss: string;
}

export interface CspSubViewPaletteOptions {
  readonly maxColors?: number;
  readonly minAlpha?: number;
  readonly bucketBits?: number;
}

export interface CspSubViewPaletteResult {
  readonly swatches: readonly CspSubViewPaletteSwatch[];
  readonly sampledPixelCount: number;
  readonly totalBucketCount: number;
}

interface QuantizedColorBucket {
  sumR: number;
  sumG: number;
  sumB: number;
  count: number;
}

/**
 * 서브뷰 레퍼런스 RGBA 버퍼를 양자화 버킷팅 및 OKLab 지각 거리 기반 다양성 병합으로 분석해
 * 대표색 6~8색과 OKLCH/RGB 정보를 추출한다.
 */
export function extractCspSubViewReferencePalette(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options?: CspSubViewPaletteOptions,
): CspSubViewPaletteResult {
  const maxColors = clamp(Math.round(options?.maxColors ?? 6), 1, 12);
  const minAlpha = clampByte(options?.minAlpha ?? 16);
  const bucketBits = clamp(Math.round(options?.bucketBits ?? 4), 2, 6);
  const shift = 8 - bucketBits;
  const pixelCount = Math.min(Math.max(0, width * height), Math.floor(rgba.length / 4));

  const buckets = new Map<number, QuantizedColorBucket>();
  let sampledPixelCount = 0;

  for (let p = 0; p < pixelCount; p += 1) {
    const idx = p * 4;
    const a = rgba[idx + 3] ?? 0;
    if (a < minAlpha) continue;
    const r = rgba[idx] ?? 0;
    const g = rgba[idx + 1] ?? 0;
    const b = rgba[idx + 2] ?? 0;
    const key = ((r >> shift) << (bucketBits * 2)) | ((g >> shift) << bucketBits) | (b >> shift);
    const existing = buckets.get(key);
    if (existing) {
      existing.sumR += r;
      existing.sumG += g;
      existing.sumB += b;
      existing.count += 1;
    } else {
      buckets.set(key, { sumR: r, sumG: g, sumB: b, count: 1 });
    }
    sampledPixelCount += 1;
  }

  if (sampledPixelCount === 0) {
    return { swatches: [], sampledPixelCount: 0, totalBucketCount: 0 };
  }

  const ranked = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .map((bucket) => {
      const r = clampByte(bucket.sumR / bucket.count);
      const g = clampByte(bucket.sumG / bucket.count);
      const b = clampByte(bucket.sumB / bucket.count);
      return {
        r,
        g,
        b,
        count: bucket.count,
        oklab: rgbBytesToOklab(r, g, b),
      };
    });

  const chosen: typeof ranked = [];
  const used = new Uint8Array(ranked.length);

  for (let i = 0; i < ranked.length && chosen.length < maxColors; i += 1) {
    const cand = ranked[i];
    if (!cand) continue;
    const isDistinct = chosen.every((sel) => {
      const dL = cand.oklab[0] - sel.oklab[0];
      const dA = cand.oklab[1] - sel.oklab[1];
      const dB = cand.oklab[2] - sel.oklab[2];
      return Math.hypot(dL, dA, dB) >= 0.08;
    });
    if (isDistinct) {
      chosen.push(cand);
      used[i] = 1;
    }
  }

  for (let i = 0; i < ranked.length && chosen.length < maxColors; i += 1) {
    const cand = ranked[i];
    if (used[i] === 0 && cand) {
      chosen.push(cand);
      used[i] = 1;
    }
  }

  const swatches: CspSubViewPaletteSwatch[] = chosen.map((item) => {
    const oklch = rgbBytesToOklch(item.r, item.g, item.b);
    return {
      r: item.r,
      g: item.g,
      b: item.b,
      ratio01: Number((item.count / sampledPixelCount).toFixed(4)),
      pixelCount: item.count,
      oklch: { l: oklch.l, c: oklch.c, h: oklch.h },
      oklchCss: oklch.css,
    };
  });

  return {
    swatches,
    sampledPixelCount,
    totalBucketCount: buckets.size,
  };
}

// ============================================================================
// 3. 퀵 마스크 반투명 오버레이 합성 (`renderCspQuickMaskOverlay`)
// ============================================================================

export interface CspQuickMaskOverlayOptions {
  readonly baseRgba: Uint8ClampedArray;
  readonly maskAlpha: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly tintRgb?: readonly [number, number, number];
  readonly opacity01?: number;
  readonly invertOverlay?: boolean;
}

export interface CspQuickMaskOverlayResult {
  readonly rgba: Uint8ClampedArray;
  readonly maskedPixelCount: number;
  readonly coverageRatio01: number;
  readonly tintOklchCss: string;
}

/** 퀵 마스크 알파 채널을 원본 RGBA 캔버스 위에 반투명 틴트로 실시간 합성한다. */
export function renderCspQuickMaskOverlay(
  options: CspQuickMaskOverlayOptions,
): CspQuickMaskOverlayResult {
  const { baseRgba, maskAlpha, width, height } = options;
  const pixelCount = Math.max(0, width * height);
  const out = new Uint8ClampedArray(pixelCount * 4);
  const tint = options.tintRgb ?? [228, 62, 86];
  const opacity01 = clamp(options.opacity01 ?? 0.48, 0, 1);
  const invert = options.invertOverlay ?? false;
  let maskedPixelCount = 0;

  for (let p = 0; p < pixelCount; p += 1) {
    const idx = p * 4;
    const br = baseRgba[idx] ?? 0;
    const bg = baseRgba[idx + 1] ?? 0;
    const bb = baseRgba[idx + 2] ?? 0;
    const ba = (baseRgba[idx + 3] ?? 0) / 255;

    const rawM = (maskAlpha[p] ?? 0) / 255;
    const effectiveMask = invert ? 1 - rawM : rawM;
    const overlayA = effectiveMask * opacity01;
    if (effectiveMask > 0.05) {
      maskedPixelCount += 1;
    }

    const outA = overlayA + ba * (1 - overlayA);
    if (outA <= 1e-5) {
      out[idx] = 0;
      out[idx + 1] = 0;
      out[idx + 2] = 0;
      out[idx + 3] = 0;
    } else {
      const tintWeight = overlayA / outA;
      out[idx] = clampByte(br * (1 - tintWeight) + tint[0] * tintWeight);
      out[idx + 1] = clampByte(bg * (1 - tintWeight) + tint[1] * tintWeight);
      out[idx + 2] = clampByte(bb * (1 - tintWeight) + tint[2] * tintWeight);
      out[idx + 3] = clampByte(outA * 255);
    }
  }

  return {
    rgba: out,
    maskedPixelCount,
    coverageRatio01: pixelCount > 0 ? Number((maskedPixelCount / pixelCount).toFixed(4)) : 0,
    tintOklchCss: rgbBytesToOklch(tint[0], tint[1], tint[2]).css,
  };
}

// ============================================================================
// 4. 타임랩스 링버퍼 스냅샷 레코더 (`createCspTimelapseSession`)
// ============================================================================

export type CspTimelapseTargetDurationSec = 15 | 30 | 60;

export interface CspTimelapseFrameSnapshot {
  readonly sequenceIndex: number;
  readonly timestampMs: number;
  readonly strokeCount: number;
  readonly width: number;
  readonly height: number;
  readonly rgbaDigest: number;
  readonly nonEmptyPixelCount: number;
  readonly rgba: Uint8ClampedArray;
}

export interface CspTimelapseExportPlan {
  readonly targetDurationSec: CspTimelapseTargetDurationSec;
  readonly fps: number;
  readonly targetFrameCount: number;
  readonly recordedFrameCount: number;
  readonly totalCapturedEver: number;
  readonly droppedOldestCount: number;
  readonly effectiveSpeedMultiplier: number;
  readonly sampledFrames: readonly CspTimelapseFrameSnapshot[];
}

export interface CspTimelapseSession {
  readonly maxRingCapacity: number;
  readonly getSnapshotCount: () => number;
  readonly getTotalCapturedCount: () => number;
  readonly getDroppedFrameCount: () => number;
  readonly getFrames: () => readonly CspTimelapseFrameSnapshot[];
  readonly recordFrame: (
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    meta?: { readonly strokeCount?: number; readonly timestampMs?: number },
  ) => CspTimelapseFrameSnapshot;
  readonly buildExportPlan: (
    targetDurationSec: CspTimelapseTargetDurationSec,
    fps?: number,
  ) => CspTimelapseExportPlan;
  readonly clear: () => void;
}

function fnv1aDigest(bytes: Uint8ClampedArray): number {
  let hash = 0x811c9dc5;
  const stride = Math.max(1, Math.floor(bytes.length / 1024));
  for (let i = 0; i < bytes.length; i += stride) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 링버퍼 기반 타임랩스 스냅샷 레코더 세션을 생성한다. */
export function createCspTimelapseSession(options?: {
  readonly maxRingCapacity?: number;
}): CspTimelapseSession {
  const maxRingCapacity = Math.max(4, Math.round(options?.maxRingCapacity ?? 120));
  const buffer: CspTimelapseFrameSnapshot[] = [];
  let totalCaptured = 0;
  let droppedFrames = 0;
  let lastTimestampMs = 0;

  return {
    maxRingCapacity,
    getSnapshotCount: () => buffer.length,
    getTotalCapturedCount: () => totalCaptured,
    getDroppedFrameCount: () => droppedFrames,
    getFrames: () => [...buffer],
    recordFrame(rgba, width, height, meta) {
      const copy = new Uint8ClampedArray(rgba);
      let nonEmptyPixelCount = 0;
      for (let i = 3; i < copy.length; i += 4) {
        if ((copy[i] ?? 0) > 0) nonEmptyPixelCount += 1;
      }
      const ts = meta?.timestampMs ?? (lastTimestampMs + 500);
      lastTimestampMs = ts;
      const frame: CspTimelapseFrameSnapshot = {
        sequenceIndex: totalCaptured,
        timestampMs: ts,
        strokeCount: meta?.strokeCount ?? totalCaptured + 1,
        width,
        height,
        rgbaDigest: fnv1aDigest(copy),
        nonEmptyPixelCount,
        rgba: copy,
      };
      totalCaptured += 1;
      if (buffer.length >= maxRingCapacity) {
        buffer.shift();
        droppedFrames += 1;
      }
      buffer.push(frame);
      return frame;
    },
    buildExportPlan(targetDurationSec, fps = 30) {
      const safeFps = clamp(Math.round(fps), 1, 60);
      const maxTargetFrames = Math.max(1, Math.round(targetDurationSec * safeFps));
      const count = buffer.length;
      if (count === 0) {
        return {
          targetDurationSec,
          fps: safeFps,
          targetFrameCount: 0,
          recordedFrameCount: 0,
          totalCapturedEver: totalCaptured,
          droppedOldestCount: droppedFrames,
          effectiveSpeedMultiplier: 1,
          sampledFrames: [],
        };
      }

      let sampledFrames: CspTimelapseFrameSnapshot[];
      if (count <= maxTargetFrames) {
        sampledFrames = [...buffer];
      } else if (maxTargetFrames === 1) {
        const last = buffer[count - 1];
        sampledFrames = last ? [last] : [];
      } else {
        sampledFrames = [];
        for (let i = 0; i < maxTargetFrames; i += 1) {
          const srcIdx = Math.round((i * (count - 1)) / (maxTargetFrames - 1));
          const frame = buffer[srcIdx];
          if (frame) sampledFrames.push(frame);
        }
      }

      const firstTs = buffer[0]?.timestampMs ?? 0;
      const lastTs = buffer[count - 1]?.timestampMs ?? firstTs;
      const elapsedSec = Math.max(0, (lastTs - firstTs) / 1000);
      const frameRatioSpeed = count / Math.max(1, sampledFrames.length);
      const durationRatioSpeed = elapsedSec > targetDurationSec ? elapsedSec / targetDurationSec : 1;
      const effectiveSpeedMultiplier = Number(Math.max(1, frameRatioSpeed, durationRatioSpeed).toFixed(2));

      return {
        targetDurationSec,
        fps: safeFps,
        targetFrameCount: sampledFrames.length,
        recordedFrameCount: count,
        totalCapturedEver: totalCaptured,
        droppedOldestCount: droppedFrames,
        effectiveSpeedMultiplier,
        sampledFrames,
      };
    },
    clear() {
      buffer.length = 0;
      totalCaptured = 0;
      droppedFrames = 0;
      lastTimestampMs = 0;
    },
  };
}

// ============================================================================
// 5. 3D 데생 인형 비율·광원 프리셋 6종 (`CSP_DRAWING_FIGURE_PRESETS`)
// ============================================================================

export type CspDrawingFigurePresetId =
  | "webtoon-hero-8head"
  | "rofan-heroine-75head"
  | "shonen-action-65head"
  | "chibi-sd-25head"
  | "muscular-fighter-8head"
  | "editorial-fashion-9head";

export interface CspDrawingFigurePreset {
  readonly id: CspDrawingFigurePresetId;
  readonly labelKo: string;
  readonly genreTagKo: string;
  readonly heightCm: number;
  readonly headToBodyRatio: number;
  readonly shoulderWidthRatio: number;
  readonly waistRatio: number;
  readonly limbSlenderness01: number;
  readonly cameraFocalLengthMm: number;
  readonly lightAzimuthDeg: number;
  readonly lightElevationDeg: number;
  readonly rimLightIntensity01: number;
  readonly keyLightOklchCss: string;
  readonly shadowToneOklchCss: string;
}

export interface CspDrawingFigureLightingSummary {
  readonly headHeightCm: number;
  readonly keyLightDir: readonly [number, number, number];
  readonly rimLightDir: readonly [number, number, number];
  readonly perspectiveStrengthKo: string;
}

export const CSP_DRAWING_FIGURE_PRESETS: readonly CspDrawingFigurePreset[] = Object.freeze([
  {
    id: "webtoon-hero-8head",
    labelKo: "웹툰 8등신 남성",
    genreTagKo: "현대·드라마",
    heightCm: 184,
    headToBodyRatio: 8.0,
    shoulderWidthRatio: 1.24,
    waistRatio: 0.78,
    limbSlenderness01: 0.42,
    cameraFocalLengthMm: 50,
    lightAzimuthDeg: 38,
    lightElevationDeg: 42,
    rimLightIntensity01: 0.65,
    keyLightOklchCss: rgbBytesToOklch(255, 238, 212).css,
    shadowToneOklchCss: rgbBytesToOklch(76, 92, 134).css,
  },
  {
    id: "rofan-heroine-75head",
    labelKo: "로판 7.5등신 여성",
    genreTagKo: "로맨스 판타지",
    heightCm: 168,
    headToBodyRatio: 7.5,
    shoulderWidthRatio: 0.94,
    waistRatio: 0.66,
    limbSlenderness01: 0.72,
    cameraFocalLengthMm: 55,
    lightAzimuthDeg: -32,
    lightElevationDeg: 36,
    rimLightIntensity01: 0.78,
    keyLightOklchCss: rgbBytesToOklch(255, 224, 216).css,
    shadowToneOklchCss: rgbBytesToOklch(118, 84, 122).css,
  },
  {
    id: "shonen-action-65head",
    labelKo: "소년 액션 6.5등신",
    genreTagKo: "배틀·소년만화",
    heightCm: 162,
    headToBodyRatio: 6.5,
    shoulderWidthRatio: 1.04,
    waistRatio: 0.8,
    limbSlenderness01: 0.56,
    cameraFocalLengthMm: 35,
    lightAzimuthDeg: 52,
    lightElevationDeg: 55,
    rimLightIntensity01: 0.82,
    keyLightOklchCss: rgbBytesToOklch(255, 214, 152).css,
    shadowToneOklchCss: rgbBytesToOklch(58, 72, 118).css,
  },
  {
    id: "chibi-sd-25head",
    labelKo: "SD 2.5등신 캐릭터",
    genreTagKo: "개그·이모티콘",
    heightCm: 92,
    headToBodyRatio: 2.5,
    shoulderWidthRatio: 0.76,
    waistRatio: 0.92,
    limbSlenderness01: 0.3,
    cameraFocalLengthMm: 50,
    lightAzimuthDeg: 18,
    lightElevationDeg: 48,
    rimLightIntensity01: 0.4,
    keyLightOklchCss: rgbBytesToOklch(255, 244, 224).css,
    shadowToneOklchCss: rgbBytesToOklch(144, 118, 138).css,
  },
  {
    id: "muscular-fighter-8head",
    labelKo: "근육질 격투가 8등신",
    genreTagKo: "하드보일드·액션",
    heightCm: 192,
    headToBodyRatio: 8.2,
    shoulderWidthRatio: 1.42,
    waistRatio: 0.84,
    limbSlenderness01: 0.18,
    cameraFocalLengthMm: 40,
    lightAzimuthDeg: 68,
    lightElevationDeg: 30,
    rimLightIntensity01: 0.9,
    keyLightOklchCss: rgbBytesToOklch(246, 198, 154).css,
    shadowToneOklchCss: rgbBytesToOklch(44, 58, 86).css,
  },
  {
    id: "editorial-fashion-9head",
    labelKo: "화보 9등신 슬림",
    genreTagKo: "패션·표지 일러스트",
    heightCm: 178,
    headToBodyRatio: 9.0,
    shoulderWidthRatio: 1.02,
    waistRatio: 0.64,
    limbSlenderness01: 0.86,
    cameraFocalLengthMm: 85,
    lightAzimuthDeg: -45,
    lightElevationDeg: 44,
    rimLightIntensity01: 0.72,
    keyLightOklchCss: rgbBytesToOklch(238, 244, 255).css,
    shadowToneOklchCss: rgbBytesToOklch(86, 78, 114).css,
  },
]);

/** 3D 데생 인형 프리셋의 머리 크기(cm)와 정규화 주광원·림라이트 3D 방향 벡터를 계산한다. */
export function computeCspDrawingFigureLightingVector(
  preset: CspDrawingFigurePreset,
): CspDrawingFigureLightingSummary {
  const azRad = (preset.lightAzimuthDeg * Math.PI) / 180;
  const elRad = (preset.lightElevationDeg * Math.PI) / 180;
  const cosEl = Math.cos(elRad);
  const lx = Number((Math.sin(azRad) * cosEl).toFixed(3));
  const ly = Number(Math.sin(elRad).toFixed(3));
  const lz = Number((Math.cos(azRad) * cosEl).toFixed(3));

  const rimAz = azRad + Math.PI;
  const rimEl = (24 * Math.PI) / 180;
  const rx = Number((Math.sin(rimAz) * Math.cos(rimEl)).toFixed(3));
  const ry = Number(Math.sin(rimEl).toFixed(3));
  const rz = Number((Math.cos(rimAz) * Math.cos(rimEl)).toFixed(3));

  const perspectiveStrengthKo =
    preset.cameraFocalLengthMm <= 40
      ? "광각 역동 원근"
      : preset.cameraFocalLengthMm >= 75
        ? "망원 인물 압축"
        : "표준 자연 시야";

  return {
    headHeightCm: Number((preset.heightCm / Math.max(1, preset.headToBodyRatio)).toFixed(1)),
    keyLightDir: [lx, ly, lz],
    rimLightDir: [rx, ry, rz],
    perspectiveStrengthKo,
  };
}
