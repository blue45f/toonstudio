/**
 * Wave 155 — 18종 정본 블렌드모드 픽셀 합성 수학 커널, W3C 알파 결합 및
 * 64-색상 표준 RGB 프로브 격자 기반 Björn Ottosson OKLab ΔE 색차 측정기.
 *
 * - 5종 DCC 포맷 능력 매트릭스(`dcc-capability-profiles.ts`)를 함께 공개 재수출한다.
 * - Clip Studio Paint 특유의 비선형 하이라이트·발광 불투명도 증폭(`add-glow`, `glow-dodge`)을 반영한다.
 */

import type { CanonicalBlendMode } from "./dcc-capability-profiles";

export {
  BLEND_MODE_LABEL_KO,
  CANONICAL_BLEND_MODES,
  DCC_CAPABILITY_MATRIX,
  DCC_FORMAT_IDS,
  DCC_LAYER_KINDS,
  getDccCapabilityProfile,
  isBlendModeSupportedInDcc,
  LAYER_KIND_LABEL_KO,
  PIXEL_BLEND_MODES,
  type CanonicalBlendMode,
  type DccBitDepth,
  type DccCapabilityProfile,
  type DccFormatId,
  type DccLayerKind,
} from "./dcc-capability-profiles";

export type RgbTuple = readonly [number, number, number];

export interface OklabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export interface CompositedRgbaPixel {
  readonly rgb: RgbTuple;
  readonly alpha: number;
}

export interface BlendModeWorstCaseSample {
  readonly backdropSrgb: RgbTuple;
  readonly sourceSrgb: RgbTuple;
  readonly sourceResultSrgb: RgbTuple;
  readonly targetResultSrgb: RgbTuple;
  readonly deltaE: number;
}

export interface BlendModeOklabFidelityOptions {
  readonly sourceOpacity?: number;
  readonly targetOpacity?: number;
  readonly probeGrid?: readonly RgbTuple[];
}

export interface BlendModeOklabFidelityResult {
  readonly sourceBlendMode: CanonicalBlendMode;
  readonly targetBlendMode: CanonicalBlendMode;
  readonly sourceOpacity: number;
  readonly targetOpacity: number;
  readonly probeColorCount: number;
  readonly evaluatedPairCount: number;
  readonly meanDeltaE: number;
  readonly maxDeltaE: number;
  readonly rmsDeltaE: number;
  readonly p95DeltaE: number;
  readonly worstCaseSample: BlendModeWorstCaseSample;
}

/** 유한수를 `[0, 1]` 범위로 안전하게 고정한다. */
export function clampUnit(value: number, fallback = 0): number {
  const safe = Number.isFinite(value) ? value : fallback;
  if (safe < 0) return 0;
  if (safe > 1) return 1;
  return safe;
}

/** 유한수를 임의 범위 `[min, max]`로 안전하게 고정한다. */
export function clampFiniteRange(value: number, min: number, max: number, fallback = min): number {
  const safe = Number.isFinite(value) ? value : fallback;
  if (safe < min) return min;
  if (safe > max) return max;
  return safe;
}

/** 부동소수점을 결정론적 고정 소수점으로 반올림한다. */
export function roundFixed(value: number, decimals = 6): number {
  const safe = Number.isFinite(value) ? value : 0;
  const clampedDecimals = Math.min(8, Math.max(0, Math.floor(decimals)));
  const factor = Math.pow(10, clampedDecimals);
  const rounded = Math.round(safe * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function buildStandard64RgbProbeGrid(): readonly RgbTuple[] {
  const levels: readonly number[] = [0, 1 / 3, 2 / 3, 1];
  const grid: RgbTuple[] = [];
  for (let ri = 0; ri < levels.length; ri += 1) {
    for (let gi = 0; gi < levels.length; gi += 1) {
      for (let bi = 0; bi < levels.length; bi += 1) {
        grid.push([levels[ri], levels[gi], levels[bi]]);
      }
    }
  }
  return grid;
}

/** 4×4×4 = 64색 정본 sRGB 프로브 격자(`[0, 1/3, 2/3, 1]^3`). */
export const STANDARD_64_RGB_PROBE_GRID: readonly RgbTuple[] = buildStandard64RgbProbeGrid();

/** sRGB 단일 채널을 선형 sRGB로 변환한다. */
export function srgbChannelToLinear(channel: number): number {
  const c = clampUnit(channel);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB 삼원색을 Björn Ottosson OKLab 좌표 `(L, a, b)`로 변환한다. */
export function srgbToOklab(srgb: RgbTuple): OklabColor {
  const r = srgbChannelToLinear(srgb[0]);
  const g = srgbChannelToLinear(srgb[1]);
  const b = srgbChannelToLinear(srgb[2]);

  const lCube = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const mCube = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const sCube = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));

  return {
    l: 0.2104542553 * lCube + 0.793617785 * mCube - 0.0040720468 * sCube,
    a: 1.9779984951 * lCube - 2.428592205 * mCube + 0.4505937099 * sCube,
    b: 0.0259040371 * lCube + 0.7827717662 * mCube - 0.808675766 * sCube,
  };
}

/** sRGB 삼원색을 지각 균등 OKLCH 좌표 `(L, C, H)`로 변환한다. */
export function srgbToOklch(srgb: RgbTuple): OklchColor {
  const lab = srgbToOklab(srgb);
  const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let hue = chroma < 1e-6 ? 0 : (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return {
    l: clampFiniteRange(lab.l, 0, 1, 0),
    c: clampFiniteRange(chroma, 0, 0.5, 0),
    h: clampFiniteRange(hue, 0, 360, 0),
  };
}

/** OKLCH 좌표를 순수 CSS `oklch(...)` 문자열로 포맷한다. */
export function formatOklchCss(oklch: OklchColor, alpha?: number): string {
  const lStr = clampFiniteRange(oklch.l, 0, 1, 0).toFixed(4);
  const cStr = clampFiniteRange(oklch.c, 0, 0.45, 0).toFixed(4);
  const hStr = clampFiniteRange(oklch.h, 0, 360, 0).toFixed(2);
  if (alpha !== undefined) {
    return `oklch(${lStr} ${cStr} ${hStr} / ${clampUnit(alpha, 1).toFixed(3)})`;
  }
  return `oklch(${lStr} ${cStr} ${hStr})`;
}

/** 두 sRGB 색상 사이의 Björn Ottosson OKLab 유클리드 ΔE 색차를 계산한다. */
export function computeSrgbOklabDeltaE(rgbA: RgbTuple, rgbB: RgbTuple): number {
  const labA = srgbToOklab(rgbA);
  const labB = srgbToOklab(rgbB);
  const dL = labA.l - labB.l;
  const dA = labA.a - labB.a;
  const dB = labA.b - labB.b;
  return Math.sqrt(dL * dL + dA * dA + dB * dB);
}

function colorDodgeChannel(b: number, s: number): number {
  if (b <= 0) return 0;
  if (s >= 1) return 1;
  return Math.min(1, b / (1 - s));
}

function colorBurnChannel(b: number, s: number): number {
  if (b >= 1) return 1;
  if (s <= 0) return 0;
  return 1 - Math.min(1, (1 - b) / s);
}

function hardLightChannel(b: number, s: number): number {
  return s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
}

function softLightChannel(b: number, s: number): number {
  if (s <= 0.5) {
    return b - (1 - 2 * s) * b * (1 - b);
  }
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
  return b + (2 * s - 1) * (d - b);
}

function vividLightChannel(b: number, s: number): number {
  return s <= 0.5 ? colorBurnChannel(b, 2 * s) : colorDodgeChannel(b, 2 * s - 1);
}

/**
 * Clip Studio Paint `Add (Glow)` 비선형 하이라이트 증폭 채널 수식.
 * 모든 `(b, s) ∈ [0, 1]^2`에서 `add-glow(b, s) >= linear-dodge(b, s)` 불변량을 유지한다.
 */
function addGlowChannel(b: number, s: number, sourceLuma: number): number {
  if (s <= 0) return b;
  const glowBoost = 0.35 * s * (0.45 + 0.55 * b) * (1 + 0.6 * sourceLuma);
  return Math.min(1, b + s + glowBoost);
}

/**
 * Clip Studio Paint `Glow Dodge` 비선형 발광 닷지 채널 수식.
 * 순흑 먹선(`b = 0`)은 0을 유지하고 명부에서만 `glow-dodge >= color-dodge` 증폭을 만든다.
 */
function glowDodgeChannel(b: number, s: number, sourceLuma: number): number {
  if (b <= 0) return 0;
  if (s <= 0) return b;
  if (s >= 1) return 1;
  const intensifiedS = Math.min(0.9999, s + 0.22 * s * (1 - s) + 0.12 * s * sourceLuma);
  return Math.min(1, b / (1 - intensifiedS) + 0.12 * b * s);
}

function evaluateBlendChannel(
  b: number,
  s: number,
  blendMode: CanonicalBlendMode,
  sourceLuma: number,
): number {
  switch (blendMode) {
    case "normal":
    case "pass-through":
      return s;
    case "multiply":
      return b * s;
    case "screen":
      return b + s - b * s;
    case "overlay":
      return hardLightChannel(s, b);
    case "darken":
      return b < s ? b : s;
    case "lighten":
      return b > s ? b : s;
    case "color-dodge":
      return colorDodgeChannel(b, s);
    case "color-burn":
      return colorBurnChannel(b, s);
    case "hard-light":
      return hardLightChannel(b, s);
    case "soft-light":
      return softLightChannel(b, s);
    case "difference":
      return Math.abs(b - s);
    case "exclusion":
      return b + s - 2 * b * s;
    case "linear-burn":
      return Math.max(0, b + s - 1);
    case "linear-dodge":
      return Math.min(1, b + s);
    case "add-glow":
      return addGlowChannel(b, s, sourceLuma);
    case "glow-dodge":
      return glowDodgeChannel(b, s, sourceLuma);
    case "vivid-light":
      return vividLightChannel(b, s);
  }
}

/** 18종 정본 블렌드모드의 `[0, 1]^3` sRGB 픽셀 합성 값을 결정론적으로 평가한다. */
export function evaluateBlendModeRgb(
  backdropSrgb: RgbTuple,
  sourceSrgb: RgbTuple,
  blendMode: CanonicalBlendMode,
): RgbTuple {
  const br = clampUnit(backdropSrgb[0]);
  const bg = clampUnit(backdropSrgb[1]);
  const bb = clampUnit(backdropSrgb[2]);
  const sr = clampUnit(sourceSrgb[0]);
  const sg = clampUnit(sourceSrgb[1]);
  const sb = clampUnit(sourceSrgb[2]);
  const sourceLuma = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;

  return [
    clampUnit(evaluateBlendChannel(br, sr, blendMode, sourceLuma)),
    clampUnit(evaluateBlendChannel(bg, sg, blendMode, sourceLuma)),
    clampUnit(evaluateBlendChannel(bb, sb, blendMode, sourceLuma)),
  ];
}

/**
 * W3C Compositing & Blending Level 1 표준 알파 결합(Source-Over + 블렌드모드 + 레이어 불투명도).
 * Clip Studio Paint 발광 계열(`add-glow`, `glow-dodge`)은 불투명 배경 위 부분 불투명도 구간에서
 * 비선형 발광 에너지 응답(`alpha + 0.32 * alpha * (1 - alpha)`)을 반영한다.
 */
export function compositeLayerPixelSrgb(
  backdropSrgb: RgbTuple,
  backdropAlpha: number,
  sourceSrgb: RgbTuple,
  sourceAlpha: number,
  blendMode: CanonicalBlendMode,
  layerOpacity = 1,
): CompositedRgbaPixel {
  const bRgb: RgbTuple = [
    clampUnit(backdropSrgb[0]),
    clampUnit(backdropSrgb[1]),
    clampUnit(backdropSrgb[2]),
  ];
  const sRgb: RgbTuple = [
    clampUnit(sourceSrgb[0]),
    clampUnit(sourceSrgb[1]),
    clampUnit(sourceSrgb[2]),
  ];
  const ab = clampUnit(backdropAlpha, 1);
  const baseOpacity = clampUnit(layerOpacity, 1);
  const isGlowFamily = blendMode === "add-glow" || blendMode === "glow-dodge";
  const effectiveOpacity =
    isGlowFamily && ab > 0
      ? clampUnit(baseOpacity + 0.32 * baseOpacity * (1 - baseOpacity))
      : baseOpacity;
  const effectiveAs = clampUnit(clampUnit(sourceAlpha, 1) * effectiveOpacity);
  const outAlpha = effectiveAs + ab * (1 - effectiveAs);

  if (outAlpha <= 1e-8) {
    return { rgb: [0, 0, 0], alpha: 0 };
  }

  const blended = evaluateBlendModeRgb(bRgb, sRgb, blendMode);
  const composedSourceR = (1 - ab) * sRgb[0] + ab * blended[0];
  const composedSourceG = (1 - ab) * sRgb[1] + ab * blended[1];
  const composedSourceB = (1 - ab) * sRgb[2] + ab * blended[2];
  const backdropWeight = ab * (1 - effectiveAs);

  return {
    rgb: [
      clampUnit((effectiveAs * composedSourceR + backdropWeight * bRgb[0]) / outAlpha),
      clampUnit((effectiveAs * composedSourceG + backdropWeight * bRgb[1]) / outAlpha),
      clampUnit((effectiveAs * composedSourceB + backdropWeight * bRgb[2]) / outAlpha),
    ],
    alpha: clampUnit(outAlpha),
  };
}

const FAST_16_SOURCE_ANCHORS: readonly RgbTuple[] = ((): readonly RgbTuple[] => {
  const indices = [0, 3, 5, 10, 12, 15, 21, 26, 37, 42, 48, 51, 53, 58, 60, 63];
  const anchors: RgbTuple[] = [];
  for (let i = 0; i < indices.length; i += 1) {
    anchors.push(STANDARD_64_RGB_PROBE_GRID[indices[i]]);
  }
  return anchors;
})();

const FIDELITY_CACHE = new Map<string, BlendModeOklabFidelityResult>();
const FIDELITY_CACHE_MAX_SIZE = 2048;

/**
 * 64-색상 표준 RGB 프로브 격자(`STANDARD_64_RGB_PROBE_GRID`) 위에서
 * 두 블렌드모드 간 평균·최대·RMS·P95 Björn Ottosson OKLab ΔE를 결정론적으로 산출한다.
 */
export function evaluateBlendModeOklabFidelity(
  sourceBlendMode: CanonicalBlendMode,
  targetBlendMode: CanonicalBlendMode,
  options: BlendModeOklabFidelityOptions = {},
): BlendModeOklabFidelityResult {
  const sourceOpacity = roundFixed(clampUnit(options.sourceOpacity ?? 1, 1), 4);
  const targetOpacity = roundFixed(clampUnit(options.targetOpacity ?? sourceOpacity, 1), 4);
  const customGrid = options.probeGrid;

  const cacheKey =
    customGrid === undefined
      ? `${sourceBlendMode}|${sourceOpacity}|${targetBlendMode}|${targetOpacity}`
      : null;
  if (cacheKey !== null) {
    const cached = FIDELITY_CACHE.get(cacheKey);
    if (cached !== undefined) return cached;
  }

  const backdropGrid = customGrid ?? STANDARD_64_RGB_PROBE_GRID;
  const sourceGrid = customGrid ?? FAST_16_SOURCE_ANCHORS;
  const totalPairs = backdropGrid.length * sourceGrid.length;

  if (totalPairs === 0) {
    return {
      sourceBlendMode,
      targetBlendMode,
      sourceOpacity,
      targetOpacity,
      probeColorCount: 0,
      evaluatedPairCount: 0,
      meanDeltaE: 0,
      maxDeltaE: 0,
      rmsDeltaE: 0,
      p95DeltaE: 0,
      worstCaseSample: {
        backdropSrgb: [0, 0, 0],
        sourceSrgb: [0, 0, 0],
        sourceResultSrgb: [0, 0, 0],
        targetResultSrgb: [0, 0, 0],
        deltaE: 0,
      },
    };
  }

  const deltas: number[] = new Array<number>(totalPairs);
  let sumDeltaE = 0;
  let sumSqDeltaE = 0;
  let maxDeltaE = -1;
  let worstBackdrop: RgbTuple = backdropGrid[0];
  let worstSource: RgbTuple = sourceGrid[0];
  let worstSourceResult: RgbTuple = [0, 0, 0];
  let worstTargetResult: RgbTuple = [0, 0, 0];

  let idx = 0;
  for (let bi = 0; bi < backdropGrid.length; bi += 1) {
    const backdrop = backdropGrid[bi];
    for (let si = 0; si < sourceGrid.length; si += 1) {
      const source = sourceGrid[si];
      const srcComposite = compositeLayerPixelSrgb(
        backdrop,
        1,
        source,
        1,
        sourceBlendMode,
        sourceOpacity,
      ).rgb;
      const tgtComposite = compositeLayerPixelSrgb(
        backdrop,
        1,
        source,
        1,
        targetBlendMode,
        targetOpacity,
      ).rgb;

      const deltaE =
        sourceBlendMode === targetBlendMode && sourceOpacity === targetOpacity
          ? 0
          : computeSrgbOklabDeltaE(srcComposite, tgtComposite);

      deltas[idx] = deltaE;
      idx += 1;
      sumDeltaE += deltaE;
      sumSqDeltaE += deltaE * deltaE;

      if (deltaE > maxDeltaE) {
        maxDeltaE = deltaE;
        worstBackdrop = backdrop;
        worstSource = source;
        worstSourceResult = srcComposite;
        worstTargetResult = tgtComposite;
      }
    }
  }

  deltas.sort((a, b) => a - b);
  const p95Index = Math.min(deltas.length - 1, Math.floor(deltas.length * 0.95));

  const result: BlendModeOklabFidelityResult = {
    sourceBlendMode,
    targetBlendMode,
    sourceOpacity,
    targetOpacity,
    probeColorCount: backdropGrid.length,
    evaluatedPairCount: totalPairs,
    meanDeltaE: roundFixed(sumDeltaE / totalPairs, 6),
    maxDeltaE: roundFixed(Math.max(0, maxDeltaE), 6),
    rmsDeltaE: roundFixed(Math.sqrt(sumSqDeltaE / totalPairs), 6),
    p95DeltaE: roundFixed(deltas[p95Index] ?? 0, 6),
    worstCaseSample: {
      backdropSrgb: worstBackdrop,
      sourceSrgb: worstSource,
      sourceResultSrgb: worstSourceResult,
      targetResultSrgb: worstTargetResult,
      deltaE: roundFixed(Math.max(0, maxDeltaE), 6),
    },
  };

  if (cacheKey !== null) {
    if (FIDELITY_CACHE.size >= FIDELITY_CACHE_MAX_SIZE) {
      FIDELITY_CACHE.clear();
    }
    FIDELITY_CACHE.set(cacheKey, result);
  }
  return result;
}
