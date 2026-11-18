/**
 * CSP `PWColorTransferUtility` 호환 `16x16x16` CIE L*a*b* 3D LUT 색감 전이(Color Match) 엔진.
 *
 * 참조 RGBA 이미지의 L*a*b* 평균·표준편차 통계(Reinhard 색 전이) 또는 8종의 웹툰·만화 무드 프리셋
 * (`sunrise`, `sepia`, `old-paper`, `night`, `cafe`, `monochrome`, `pastel-pop`, `traditional-ink`)으로부터
 * `16x16x16` 3D LUT를 굽고, 삼선형 보간(trilinear interpolation)과 `intensity`(`0..1`) 블렌딩으로
 * 알파를 보존하며 픽셀을 변환한다. 또한 그라데이션 맵 호환 5-스톱 `GradientStop[]` 추출기를 제공한다.
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 * - evidence_id: ev_0c6a677d38f821a7c782b943662be657510c27ee397e744fa128f63a1ca2d1fa
 */

import type { StudioImageDataLike } from "../studio-filters";
import type { GradientStop } from "../studio-gradient-map";

export const LAB_LUT_GRID_SIZE = 16;

export const COLOR_TRANSFER_MOOD_PRESET_IDS = [
  "sunrise",
  "sepia",
  "old-paper",
  "night",
  "cafe",
  "monochrome",
  "pastel-pop",
  "traditional-ink",
] as const;

export type ColorTransferMoodPresetId =
  (typeof COLOR_TRANSFER_MOOD_PRESET_IDS)[number];

export interface LabChannelStats {
  readonly meanL: number;
  readonly stdL: number;
  readonly meanA: number;
  readonly stdA: number;
  readonly meanB: number;
  readonly stdB: number;
}

export interface ColorTransferMoodPreset {
  readonly id: ColorTransferMoodPresetId;
  readonly label: string;
  readonly description: string;
  readonly targetStats: LabChannelStats;
}

export interface LabColorTransferLut3D {
  readonly size: typeof LAB_LUT_GRID_SIZE;
  /** `(r * 16 + g) * 16 + b` 인덱스마다 `[R, G, B]` (0..255 float) 3채널 저장 (총 12,288 float). */
  readonly table: Float32Array;
  readonly sourceStats: LabChannelStats;
  readonly targetStats: LabChannelStats;
}

/** 중립 표준 sRGB 그라데이션의 기준 Lab 통계 (소스 이미지 미지정 시 기본 소스 통계). */
export const NEUTRAL_SOURCE_LAB_STATS: LabChannelStats = Object.freeze({
  meanL: 54,
  stdL: 26,
  meanA: 0,
  stdA: 18,
  meanB: 0,
  stdB: 18,
});

export const STUDIO_COLOR_TRANSFER_MOOD_PRESETS: readonly ColorTransferMoodPreset[] =
  Object.freeze([
    {
      id: "sunrise",
      label: "일출",
      description: "따스한 살구빛 아침 햇살과 부드러운 보랏빛 그림자를 입힙니다.",
      targetStats: { meanL: 62, stdL: 24, meanA: 14, stdA: 16, meanB: 22, stdB: 18 },
    },
    {
      id: "sepia",
      label: "세피아",
      description: "회상 장면에 어울리는 고전 황갈색 필름 톤으로 통일합니다.",
      targetStats: { meanL: 55, stdL: 23, meanA: 7, stdA: 5, meanB: 24, stdB: 7 },
    },
    {
      id: "old-paper",
      label: "오래된 종이",
      description: "빛바랜 양피지처럼 대비를 낮추고 따뜻한 황토 종이결 색감을 줍니다.",
      targetStats: { meanL: 66, stdL: 17, meanA: 4, stdA: 6, meanB: 19, stdB: 8 },
    },
    {
      id: "night",
      label: "밤",
      description: "명도를 낮추고 차가운 푸른 달빛·야경 공기를 덧입힙니다.",
      targetStats: { meanL: 34, stdL: 20, meanA: -3, stdA: 10, meanB: -24, stdB: 14 },
    },
    {
      id: "cafe",
      label: "카페",
      description: "로스팅 원두 같은 깊은 갈색 암부와 포근한 라떼 중간톤을 만듭니다.",
      targetStats: { meanL: 50, stdL: 21, meanA: 9, stdA: 11, meanB: 18, stdB: 13 },
    },
    {
      id: "monochrome",
      label: "모노크롬",
      description: "채도 편차를 완전히 제거해 또렷한 무채색 명암만 남깁니다.",
      targetStats: { meanL: 54, stdL: 28, meanA: 0, stdA: 0, meanB: 0, stdB: 0 },
    },
    {
      id: "pastel-pop",
      label: "파스텔 팝",
      description: "밝고 산뜻한 하이키 명도와 사랑스러운 파스텔 색감을 부여합니다.",
      targetStats: { meanL: 72, stdL: 16, meanA: 10, stdA: 15, meanB: 6, stdB: 15 },
    },
    {
      id: "traditional-ink",
      label: "수묵 담채",
      description: "차분한 먹빛 암부와 한지 여백, 절제된 담채 채도로 정돈합니다.",
      targetStats: { meanL: 58, stdL: 25, meanA: -1, stdA: 5, meanB: 6, stdB: 6 },
    },
  ]);

function srgbToLinear(channel255: number): number {
  const c = Math.max(0, Math.min(255, channel255)) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb255(linear: number): number {
  const clamped = Math.max(0, Math.min(1, linear));
  const c =
    clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, c * 255));
}

const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;
// D65 백색점
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;

function labF(t: number): number {
  return t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}

function labFInv(f: number): number {
  const f3 = f * f * f;
  return f3 > LAB_EPSILON ? f3 : (116 * f - 16) / LAB_KAPPA;
}

/** sRGB (0..255) -> CIE 1976 L*a*b* 변환. */
export function rgbToLab(r: number, g: number, b: number): readonly [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / XN;
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) / YN;
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / ZN;

  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE 1976 L*a*b* -> sRGB (0..255 float) 변환. */
export function labToRgbFloat(L: number, a: number, b: number): readonly [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const x = XN * labFInv(fx);
  const y = YN * labFInv(fy);
  const z = ZN * labFInv(fz);

  const lr = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const lg = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const lb = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

  return [linearToSrgb255(lr), linearToSrgb255(lg), linearToSrgb255(lb)];
}

/** RGBA 이미지의 불투명(`alpha > 0`) 픽셀들로부터 CIE L*a*b* 평균·표준편차를 계산한다. */
export function computeImageLabStats(image: StudioImageDataLike): LabChannelStats {
  const { width, height, data } = image;
  const total = Math.min(width * height, Math.floor(data.length / 4));
  if (total <= 0) return NEUTRAL_SOURCE_LAB_STATS;

  let count = 0;
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;

  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    if (data[off + 3]! === 0) continue;
    const [L, a, b] = rgbToLab(data[off]!, data[off + 1]!, data[off + 2]!);
    sumL += L;
    sumA += a;
    sumB += b;
    count += 1;
  }

  if (count === 0) return NEUTRAL_SOURCE_LAB_STATS;
  const meanL = sumL / count;
  const meanA = sumA / count;
  const meanB = sumB / count;

  let varL = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    if (data[off + 3]! === 0) continue;
    const [L, a, b] = rgbToLab(data[off]!, data[off + 1]!, data[off + 2]!);
    varL += (L - meanL) * (L - meanL);
    varA += (a - meanA) * (a - meanA);
    varB += (b - meanB) * (b - meanB);
  }

  return {
    meanL,
    stdL: Math.max(1, Math.sqrt(varL / count)),
    meanA,
    stdA: Math.max(1, Math.sqrt(varA / count)),
    meanB,
    stdB: Math.max(1, Math.sqrt(varB / count)),
  };
}

/** 소스·타깃 Lab 통계로부터 `16x16x16` 3D LUT를 생성한다. */
export function buildLabColorTransferLut(
  sourceStats: LabChannelStats,
  targetStats: LabChannelStats,
): LabColorTransferLut3D {
  const N = LAB_LUT_GRID_SIZE;
  const table = new Float32Array(N * N * N * 3);
  const scaleL = targetStats.stdL / Math.max(1, sourceStats.stdL);
  const scaleA = targetStats.stdA / Math.max(1, sourceStats.stdA);
  const scaleB = targetStats.stdB / Math.max(1, sourceStats.stdB);

  let ptr = 0;
  for (let rIdx = 0; rIdx < N; rIdx += 1) {
    const r = (rIdx / (N - 1)) * 255;
    for (let gIdx = 0; gIdx < N; gIdx += 1) {
      const g = (gIdx / (N - 1)) * 255;
      for (let bIdx = 0; bIdx < N; bIdx += 1) {
        const b = (bIdx / (N - 1)) * 255;
        const [L, labA, labB] = rgbToLab(r, g, b);
        const mappedL = Math.max(0, Math.min(100, (L - sourceStats.meanL) * scaleL + targetStats.meanL));
        const mappedA = (labA - sourceStats.meanA) * scaleA + targetStats.meanA;
        const mappedB = (labB - sourceStats.meanB) * scaleB + targetStats.meanB;
        const [outR, outG, outB] = labToRgbFloat(mappedL, mappedA, mappedB);
        table[ptr] = outR;
        table[ptr + 1] = outG;
        table[ptr + 2] = outB;
        ptr += 3;
      }
    }
  }

  return { size: LAB_LUT_GRID_SIZE, table, sourceStats, targetStats };
}

/** 참조 RGBA 이미지로부터 `16x16x16` 3D LUT를 생성한다. */
export function buildLabColorTransferLutFromReference(
  sourceImage: StudioImageDataLike,
  referenceImage: StudioImageDataLike,
): LabColorTransferLut3D {
  return buildLabColorTransferLut(
    computeImageLabStats(sourceImage),
    computeImageLabStats(referenceImage),
  );
}

/** 8종 내장 무드 프리셋 ID로 `16x16x16` 3D LUT를 생성한다. */
export function buildMoodPresetColorTransferLut(
  presetId: ColorTransferMoodPresetId,
  sourceImage?: StudioImageDataLike | null,
): LabColorTransferLut3D {
  const preset =
    STUDIO_COLOR_TRANSFER_MOOD_PRESETS.find((item) => item.id === presetId) ??
    STUDIO_COLOR_TRANSFER_MOOD_PRESETS[0]!;
  const srcStats = sourceImage ? computeImageLabStats(sourceImage) : NEUTRAL_SOURCE_LAB_STATS;
  return buildLabColorTransferLut(srcStats, preset.targetStats);
}

/** `16x16x16` 3D LUT에서 단일 sRGB(0..255) 색상을 삼선형 보간(trilinear interpolation)으로 평가한다. */
export function sampleLabLutTrilinear(
  lut: LabColorTransferLut3D,
  r: number,
  g: number,
  b: number,
): readonly [number, number, number] {
  const N = lut.size;
  const maxIdx = N - 1;
  const fr = (Math.max(0, Math.min(255, r)) / 255) * maxIdx;
  const fg = (Math.max(0, Math.min(255, g)) / 255) * maxIdx;
  const fb = (Math.max(0, Math.min(255, b)) / 255) * maxIdx;

  const r0 = Math.floor(fr);
  const g0 = Math.floor(fg);
  const b0 = Math.floor(fb);
  const r1 = Math.min(maxIdx, r0 + 1);
  const g1 = Math.min(maxIdx, g0 + 1);
  const b1 = Math.min(maxIdx, b0 + 1);

  const dr = fr - r0;
  const dg = fg - g0;
  const db = fb - b0;

  const t = lut.table;
  const idx = (ri: number, gi: number, bi: number) => ((ri * N + gi) * N + bi) * 3;

  const i000 = idx(r0, g0, b0);
  const i001 = idx(r0, g0, b1);
  const i010 = idx(r0, g1, b0);
  const i011 = idx(r0, g1, b1);
  const i100 = idx(r1, g0, b0);
  const i101 = idx(r1, g0, b1);
  const i110 = idx(r1, g1, b0);
  const i111 = idx(r1, g1, b1);

  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch += 1) {
    const c00 = t[i000 + ch]! * (1 - db) + t[i001 + ch]! * db;
    const c01 = t[i010 + ch]! * (1 - db) + t[i011 + ch]! * db;
    const c10 = t[i100 + ch]! * (1 - db) + t[i101 + ch]! * db;
    const c11 = t[i110 + ch]! * (1 - db) + t[i111 + ch]! * db;
    const c0 = c00 * (1 - dg) + c01 * dg;
    const c1 = c10 * (1 - dg) + c11 * dg;
    out[ch] = c0 * (1 - dr) + c1 * dr;
  }
  return out;
}

/**
 * `16x16x16` 3D LUT와 `intensity` (`0..1`)로 입력 RGBA 이미지를 알파 보존 변환한다.
 */
export function applyLabColorTransferLut(
  source: StudioImageDataLike,
  lut: LabColorTransferLut3D,
  intensity = 1,
): StudioImageDataLike {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data);
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return { width, height, data: out };
  }

  const w = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 1;
  if (w <= 0) return { width, height, data: out };

  const total = width * height;
  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    const alpha = data[off + 3]!;
    if (alpha === 0) continue;
    const r = data[off]!;
    const g = data[off + 1]!;
    const b = data[off + 2]!;
    const [mr, mg, mb] = sampleLabLutTrilinear(lut, r, g, b);
    out[off] = Math.round(r + (mr - r) * w);
    out[off + 1] = Math.round(g + (mg - g) * w);
    out[off + 2] = Math.round(b + (mb - b) * w);
    out[off + 3] = alpha;
  }

  return { width, height, data: out };
}

function toHexByte(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
}

/**
 * `16x16x16` 3D LUT의 무채색 대각선 `(0, 0.25, 0.5, 0.75, 1)` 지점을 샘플링해
 * 그라데이션 맵 레이어에 바로 넣을 수 있는 5-스톱 `GradientStop[]`을 추출한다.
 */
export function extractGradientStopsFromColorTransferLut(
  lut: LabColorTransferLut3D,
): GradientStop[] {
  const positions = [0, 0.25, 0.5, 0.75, 1] as const;
  return positions.map((pos) => {
    const level = pos * 255;
    const [r, g, b] = sampleLabLutTrilinear(lut, level, level, level);
    return {
      pos,
      color: `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`,
    };
  });
}
