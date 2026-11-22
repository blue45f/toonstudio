/**
 * 실시간 7밴드 분광 안료 혼색 프리뷰 계산 모델.
 *
 * - 기존 100% 클린룸 7밴드 Kubelka-Munk 분광 엔진(`../webgpu` → `studio-webgpu-km7-spectral-core`)을
 *   그대로 재사용한다(외부 독점 패키지·LUT 미사용).
 * - 전경색과 캔버스 바탕/보조색의 물리 감산 혼색 결과, 일반 sRGB 선형 혼색 비교,
 *   종이 광택(paperGloss)·습도(wetness) 반영 표면색, 7밴드(420..670nm) 반사율 막대 값을 산출한다.
 */

import {
  KM7_WAVELENGTHS_NM,
  computeKm7ImpastoReliefLitSrgb,
  computeKm7WetPickupStep,
  km7LinearRgbToSpectrum7,
  km7SrgbToLinear,
  km7SrgbToOklch,
  mixSpectralRgb,
  type Km7Rgb01,
} from "../webgpu";

/** Calm Atelier 정본 기준 종이 바탕·보태니컬 강조 색 토큰. */
export const CALM_ATELIER_SPECTRAL_TOKENS = Object.freeze({
  alabasterPaperHex: "#FAF8F3",
  botanicalForestHex: "#1F4435",
  warmInkHex: "#1C1917",
  cobaltDemoHex: "#0F47A6",
  cadmiumYellowDemoHex: "#F7D414",
});

export interface SpectralBlendPreviewInput {
  readonly foregroundHex: string;
  readonly canvasBaseHex?: string;
  /** 혼색 비율 (0 = 전경색 100%, 0.5 = 50:50 혼색, 1 = 바탕/보조색 100%). */
  readonly mixRatio?: number;
  /** 붓 습도 (0..1, 기본 0.35). */
  readonly wetness?: number;
  /** 미세 종이 광택 (0..1, 기본 0.25). */
  readonly paperGloss?: number;
}

export interface SpectralBlendPreviewResult {
  readonly foregroundHex: string;
  readonly canvasBaseHex: string;
  readonly mixRatio: number;
  readonly wetness: number;
  readonly paperGloss: number;
  readonly spectralHex: string;
  readonly srgbLinearHex: string;
  readonly wetSurfaceHex: string;
  readonly paperSheenHex: string;
  readonly wavelengthsNm: typeof KM7_WAVELENGTHS_NM;
  readonly spectralBands: readonly [number, number, number, number, number, number, number];
  readonly spectralChroma: number;
  readonly srgbChroma: number;
  readonly spectralHueDeg: number;
  readonly srgbHueDeg: number;
  readonly chromaDeltaPct: number;
  readonly summaryKo: string;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

export function parseHexToKm7Rgb01(raw: string, fallbackHex = "#1f4435"): Km7Rgb01 {
  const normalized = normalizeHex(raw) ?? normalizeHex(fallbackHex) ?? "#1f4435";
  const body = normalized.slice(1);
  return {
    r: Number.parseInt(body.slice(0, 2), 16) / 255,
    g: Number.parseInt(body.slice(2, 4), 16) / 255,
    b: Number.parseInt(body.slice(4, 6), 16) / 255,
  };
}

export function formatKm7Rgb01ToHex(rgb: Km7Rgb01): string {
  const toByte = (channel: number): string =>
    Math.round(clamp01(channel) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toByte(rgb.r)}${toByte(rgb.g)}${toByte(rgb.b)}`;
}

function normalizeHex(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (/^#[0-9a-f]{6}$/iu.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/iu.test(trimmed)) {
    const [, r, g, b] = trimmed.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

function mixNaiveSrgb(a: Km7Rgb01, b: Km7Rgb01, t: number): Km7Rgb01 {
  const mt = clamp01(t);
  return {
    r: a.r * (1 - mt) + b.r * mt,
    g: a.g * (1 - mt) + b.g * mt,
    b: a.b * (1 - mt) + b.b * mt,
  };
}

function buildKoreanInsight(
  spectralHueDeg: number,
  spectralChroma: number,
  srgbChroma: number,
  chromaDeltaPct: number,
): string {
  const isGreenBand = spectralHueDeg >= 105 && spectralHueDeg <= 175 && spectralChroma > 0.06;
  if (isGreenBand && chromaDeltaPct >= 15) {
    return `505·545nm 녹색 반사율 보존 · sRGB 대비 채도 +${chromaDeltaPct}%`;
  }
  if (chromaDeltaPct >= 10) {
    return `감산 혼색 채도 유지 · sRGB 대비 +${chromaDeltaPct}% 선명`;
  }
  if (spectralChroma <= 0.025 && srgbChroma <= 0.025) {
    return "무채색 농도 균형 유지 · 중립 회색 톤";
  }
  return "7밴드 분광 안료 물리 혼색 프리뷰";
}

/**
 * 전경색과 바탕/보조색의 실시간 7밴드 Kubelka-Munk 분광 혼색 + 일반 sRGB 비교 +
 * 습도·미세 종이 광택 프리뷰 결과를 계산한다.
 */
export function computeSpectralBlendPreview(
  input: SpectralBlendPreviewInput,
): SpectralBlendPreviewResult {
  const foregroundHex = normalizeHex(input.foregroundHex) ?? CALM_ATELIER_SPECTRAL_TOKENS.botanicalForestHex.toLowerCase();
  const canvasBaseHex =
    normalizeHex(input.canvasBaseHex ?? CALM_ATELIER_SPECTRAL_TOKENS.alabasterPaperHex) ??
    CALM_ATELIER_SPECTRAL_TOKENS.alabasterPaperHex.toLowerCase();

  const mixRatio = clamp01(input.mixRatio ?? 0.5);
  const wetness = clamp01(input.wetness ?? 0.35);
  const paperGloss = clamp01(input.paperGloss ?? 0.25);

  const fgRgb = parseHexToKm7Rgb01(foregroundHex);
  const bgRgb = parseHexToKm7Rgb01(canvasBaseHex);

  const spectralRgb = mixSpectralRgb(fgRgb, bgRgb, mixRatio);
  const srgbLinearRgb = mixNaiveSrgb(fgRgb, bgRgb, mixRatio);

  // 습윤 붓 픽업 + 미세 종이 부조 광택 시뮬레이션
  const wetStep = computeKm7WetPickupStep({
    canvasSrgb: bgRgb,
    paintSrgb: fgRgb,
    reservoirSrgb: spectralRgb,
    pickupRate: 0.3 + mixRatio * 0.4,
    wetness,
    paintLoad: 0.85,
    edgeRingStrength: wetness * 0.45,
    radialDist01: 0.72,
  });

  const sheenRgb = computeKm7ImpastoReliefLitSrgb({
    baseSrgb: wetStep.depositSrgb,
    heightGradX: -0.22 * (0.4 + paperGloss),
    heightGradY: -0.28 * (0.4 + paperGloss),
    reliefStrength: 0.28 + paperGloss * 0.45,
    gloss: paperGloss,
  });

  const spectrum = km7LinearRgbToSpectrum7({
    r: km7SrgbToLinear(spectralRgb.r),
    g: km7SrgbToLinear(spectralRgb.g),
    b: km7SrgbToLinear(spectralRgb.b),
  });
  const spectralBands: readonly [number, number, number, number, number, number, number] =
    Object.freeze([
      Number(spectrum.b0.toFixed(4)),
      Number(spectrum.b1.toFixed(4)),
      Number(spectrum.b2.toFixed(4)),
      Number(spectrum.b3.toFixed(4)),
      Number(spectrum.b4.toFixed(4)),
      Number(spectrum.b5.toFixed(4)),
      Number(spectrum.b6.toFixed(4)),
    ]);

  const spectralOklch = km7SrgbToOklch(spectralRgb);
  const srgbOklch = km7SrgbToOklch(srgbLinearRgb);
  const chromaDeltaPct =
    srgbOklch.C > 0.005
      ? Math.round(((spectralOklch.C - srgbOklch.C) / srgbOklch.C) * 100)
      : spectralOklch.C > 0.02
        ? 100
        : 0;

  return Object.freeze({
    foregroundHex,
    canvasBaseHex,
    mixRatio,
    wetness,
    paperGloss,
    spectralHex: formatKm7Rgb01ToHex(spectralRgb),
    srgbLinearHex: formatKm7Rgb01ToHex(srgbLinearRgb),
    wetSurfaceHex: formatKm7Rgb01ToHex(wetStep.depositSrgb),
    paperSheenHex: formatKm7Rgb01ToHex(sheenRgb),
    wavelengthsNm: KM7_WAVELENGTHS_NM,
    spectralBands,
    spectralChroma: Number(spectralOklch.C.toFixed(4)),
    srgbChroma: Number(srgbOklch.C.toFixed(4)),
    spectralHueDeg: Number(spectralOklch.hDeg.toFixed(1)),
    srgbHueDeg: Number(srgbOklch.hDeg.toFixed(1)),
    chromaDeltaPct,
    summaryKo: buildKoreanInsight(
      spectralOklch.hDeg,
      spectralOklch.C,
      srgbOklch.C,
      chromaDeltaPct,
    ),
  });
}
