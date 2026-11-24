/**
 * Oklab/OKLCH 색과학 + 완성 컷 RGBA 버퍼 자동 화풍 특징 추출기.
 *
 * 수동 개입 없이 단일 RGBA 버퍼에서 선화 굵기 분포, OKLCH 주조 팔레트, 그림자 색온도(K),
 * 명암 대비 단계, 스크린톤 고주파 밀도를 결정론적으로 계측한다.
 */

export interface OklabColor {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

export interface OklchColor {
  readonly L: number;
  readonly C: number;
  readonly H: number;
}

export type PaletteSwatchRole = "base" | "midtone" | "shadow" | "highlight" | "accent";

export interface OklchPaletteSwatch {
  readonly L: number;
  readonly C: number;
  readonly H: number;
  readonly share: number;
  readonly role: PaletteSwatchRole;
  readonly cssOklch: string;
}

export interface LineworkThicknessHistogram {
  readonly hairlineCount: number;
  readonly mediumCount: number;
  readonly boldCount: number;
  readonly heavyCount: number;
}

export interface LineworkThicknessProfile {
  readonly meanPx: number;
  readonly medianPx: number;
  readonly p10Px: number;
  readonly p90Px: number;
  readonly stdDevPx: number;
  readonly inkCoverageRatio: number;
  readonly taperVarianceRatio: number;
  readonly sampledLinePixels: number;
  readonly histogram: LineworkThicknessHistogram;
}

export interface ShadowTemperatureProfile {
  readonly meanLightness: number;
  readonly meanChroma: number;
  readonly meanHueDeg: number;
  readonly meanA: number;
  readonly meanB: number;
  readonly coolWarmIndex: number;
  readonly estimatedKelvin: number;
  readonly highlightMeanLightness: number;
  readonly highlightMeanHueDeg: number;
  readonly shadowPixelRatio: number;
  readonly cssOklch: string;
}

export interface ContrastStepsProfile {
  readonly p05L: number;
  readonly p25L: number;
  readonly p50L: number;
  readonly p75L: number;
  readonly p95L: number;
  readonly dynamicRange: number;
  readonly midtoneContrast: number;
  readonly rmsContrast: number;
  readonly detectedToneSteps: number;
}

export type ScreentonePatternKind = "none" | "halftone-dot" | "crosshatch" | "soft-grain";

export interface ScreentoneDensityProfile {
  readonly coverageRatio: number;
  readonly meanDotDensity: number;
  readonly alternatingRateX: number;
  readonly alternatingRateY: number;
  readonly estimatedLpiFrequency: number;
  readonly patternKind: ScreentonePatternKind;
}

export interface AutoStyleFrameBuffer {
  readonly frameId: string;
  readonly episodeId?: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray | Uint8Array;
}

export interface ExtractedFrameStyleMetrics {
  readonly frameId: string;
  readonly episodeId: string;
  readonly width: number;
  readonly height: number;
  readonly linework: LineworkThicknessProfile;
  readonly dominantPalette: readonly OklchPaletteSwatch[];
  readonly shadowTemperature: ShadowTemperatureProfile;
  readonly contrast: ContrastStepsProfile;
  readonly screentone: ScreentoneDensityProfile;
}

export type SyntheticStylePresetId = "cool-noir-atelier" | "sunset-romance-pastel";

export const INK_LIGHTNESS_MAX = 0.31;
export const SHADOW_L_MIN = 0.16;
export const SHADOW_L_MAX = 0.62;
const HIGHLIGHT_L_MIN = 0.78;
const MAX_LINE_RUN_PX = 14;

export const clampStyleScalar = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const roundStyle3 = (value: number): number => Math.round(value * 1000) / 1000;

export const normalizeHueDeg = (deg: number): number => {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
};

export function angularHueDiffDeg(aDeg: number, bDeg: number): number {
  const diff = Math.abs(normalizeHueDeg(aDeg) - normalizeHueDeg(bDeg));
  return diff > 180 ? 360 - diff : diff;
}

/** IEC 61966-2-1 sRGB byte [0..255] → 선형 광도 [0..1]. */
export function srgbByteToLinear(u8: number): number {
  const s = clampStyleScalar(u8, 0, 255) / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** 선형 광도 [0..1] → IEC 61966-2-1 sRGB byte [0..255]. */
export function linearToSrgbByte(lin: number): number {
  const c = clampStyleScalar(lin, 0, 1);
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return clampStyleScalar(Math.round(s * 255), 0, 255);
}

/** sRGB [0..255] → Björn Ottosson Oklab. */
export function srgbToOklab(r: number, g: number, b: number): OklabColor {
  const lr = srgbByteToLinear(r);
  const lg = srgbByteToLinear(g);
  const lb = srgbByteToLinear(b);
  const lCbrt = Math.cbrt(Math.max(0, 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb));
  const mCbrt = Math.cbrt(Math.max(0, 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb));
  const sCbrt = Math.cbrt(Math.max(0, 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb));
  return {
    L: 0.2104542553 * lCbrt + 0.793617785 * mCbrt - 0.0040720468 * sCbrt,
    a: 1.9779984951 * lCbrt - 2.428592205 * mCbrt + 0.4505937099 * sCbrt,
    b: 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.808675766 * sCbrt,
  };
}

/** Oklab → sRGB [0..255] (색역 클램핑 포함). */
export function oklabToSrgb(L: number, a: number, b: number): readonly [number, number, number] {
  const lCbrt = L + 0.3963377774 * a + 0.2158037573 * b;
  const mCbrt = L - 0.1055613458 * a - 0.0638541728 * b;
  const sCbrt = L - 0.0894841775 * a - 1.291485548 * b;
  const l = lCbrt * lCbrt * lCbrt;
  const m = mCbrt * mCbrt * mCbrt;
  const s = sCbrt * sCbrt * sCbrt;
  return [
    linearToSrgbByte(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgbByte(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgbByte(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function oklabToOklch(color: OklabColor): OklchColor {
  const C = Math.hypot(color.a, color.b);
  const H = C < 1e-6 ? 0 : normalizeHueDeg((Math.atan2(color.b, color.a) * 180) / Math.PI);
  return { L: clampStyleScalar(color.L, 0, 1), C, H };
}

export function oklchToOklab(color: OklchColor): OklabColor {
  const rad = (normalizeHueDeg(color.H) * Math.PI) / 180;
  return { L: clampStyleScalar(color.L, 0, 1), a: color.C * Math.cos(rad), b: color.C * Math.sin(rad) };
}

/** Oklab 지각 색차 (0..100 스케일; 2.0 ≈ JND, 6.0+ 명확한 화풍 이탈). */
export function computeOklabDeltaE100(c1: OklabColor, c2: OklabColor): number {
  return Math.hypot(c1.L - c2.L, c1.a - c2.a, c1.b - c2.b) * 100;
}

export function formatOklchCss(color: OklchColor): string {
  return `oklch(${clampStyleScalar(color.L, 0, 1).toFixed(3)} ${Math.max(0, color.C).toFixed(4)} ${normalizeHueDeg(color.H).toFixed(1)})`;
}

export function classifySwatchRole(swatch: { readonly L: number; readonly C: number }, index: number): PaletteSwatchRole {
  if (index === 0) return "base";
  if (swatch.L <= 0.45) return "shadow";
  if (swatch.L >= 0.82 && swatch.C < 0.08) return "highlight";
  return swatch.C >= 0.1 ? "accent" : "midtone";
}

export function estimateShadowKelvinFromHue(hueDeg: number, chroma: number): {
  readonly coolWarmIndex: number;
  readonly kelvin: number;
} {
  const rad = ((normalizeHueDeg(hueDeg) - 45) * Math.PI) / 180;
  const coolWarmIndex = clampStyleScalar(Math.cos(rad) * clampStyleScalar(chroma / 0.09, 0.15, 1.0), -1, 1);
  return { coolWarmIndex: roundStyle3(coolWarmIndex), kelvin: clampStyleScalar(Math.round(5800 - coolWarmIndex * 2850), 2600, 9600) };
}

export function computeFnv1a64Hex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x84222325;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((ch + i) & 0xff), 0x01000193) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

function percentileFromSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[clampStyleScalar(Math.floor((sorted.length - 1) * clampStyleScalar(p, 0, 1)), 0, sorted.length - 1)] ?? 0;
}

function extractDominantOklchPalette(samples: readonly OklabColor[], maxSwatches = 5): readonly OklchPaletteSwatch[] {
  if (samples.length === 0) {
    const fallback: OklchColor = { L: 0.94, C: 0.006, H: 85 };
    return [{ ...fallback, share: 1, role: "base", cssOklch: formatOklchCss(fallback) }];
  }
  const k = Math.min(maxSwatches, samples.length);
  const first = samples[0] ?? { L: 0.5, a: 0, b: 0 };
  const centroids: OklabColor[] = [{ ...first }];

  while (centroids.length < k) {
    let bestIdx = 0;
    let bestDistSq = -1;
    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i];
      if (!s) continue;
      let minDistSq = Number.POSITIVE_INFINITY;
      for (const c of centroids) {
        const dSq = (s.L - c.L) ** 2 + (s.a - c.a) ** 2 + (s.b - c.b) ** 2;
        if (dSq < minDistSq) minDistSq = dSq;
      }
      if (minDistSq > bestDistSq) {
        bestDistSq = minDistSq;
        bestIdx = i;
      }
    }
    if (bestDistSq < 1e-6) break;
    const chosen = samples[bestIdx];
    if (!chosen) break;
    centroids.push({ ...chosen });
  }

  const count = centroids.length;
  const clusterCounts = new Int32Array(count);
  const sumL = new Float64Array(count);
  const sumA = new Float64Array(count);
  const sumB = new Float64Array(count);

  for (let iter = 0; iter < 6; iter += 1) {
    clusterCounts.fill(0);
    sumL.fill(0);
    sumA.fill(0);
    sumB.fill(0);
    for (const s of samples) {
      let bestC = 0;
      let bestDistSq = Number.POSITIVE_INFINITY;
      for (let cIdx = 0; cIdx < count; cIdx += 1) {
        const c = centroids[cIdx];
        if (!c) continue;
        const dSq = (s.L - c.L) ** 2 + (s.a - c.a) ** 2 + (s.b - c.b) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestC = cIdx;
        }
      }
      clusterCounts[bestC] = (clusterCounts[bestC] ?? 0) + 1;
      sumL[bestC] = (sumL[bestC] ?? 0) + s.L;
      sumA[bestC] = (sumA[bestC] ?? 0) + s.a;
      sumB[bestC] = (sumB[bestC] ?? 0) + s.b;
    }
    for (let cIdx = 0; cIdx < count; cIdx += 1) {
      const n = clusterCounts[cIdx] ?? 0;
      if (n > 0) centroids[cIdx] = { L: (sumL[cIdx] ?? 0) / n, a: (sumA[cIdx] ?? 0) / n, b: (sumB[cIdx] ?? 0) / n };
    }
  }

  const total = Math.max(1, samples.length);
  return centroids
    .map((lab, idx) => ({ lch: oklabToOklch(lab), share: (clusterCounts[idx] ?? 0) / total }))
    .filter((item) => item.share > 0)
    .sort((a, b) => b.share - a.share)
    .map((item, idx) => ({
      L: roundStyle3(item.lch.L),
      C: roundStyle3(item.lch.C),
      H: roundStyle3(item.lch.H),
      share: roundStyle3(item.share),
      role: classifySwatchRole(item.lch, idx),
      cssOklch: formatOklchCss(item.lch),
    }));
}

function detectTonalStepCount(hist64: Int32Array, totalOpaque: number): number {
  if (totalOpaque === 0) return 2;
  const smooth = new Float64Array(64);
  for (let i = 0; i < 64; i += 1) {
    smooth[i] = ((hist64[Math.max(0, i - 1)] ?? 0) + 2 * (hist64[i] ?? 0) + (hist64[Math.min(63, i + 1)] ?? 0)) / (4 * totalOpaque);
  }
  const peaks: number[] = [];
  for (let i = 1; i < 63; i += 1) {
    const v = smooth[i] ?? 0;
    if (v >= 0.025 && v >= (smooth[i - 1] ?? 0) && v > (smooth[i + 1] ?? 0)) {
      const prev = peaks[peaks.length - 1];
      if (prev === undefined || i - prev >= 4) peaks.push(i);
    }
  }
  return clampStyleScalar(peaks.length || 3, 2, 6);
}

function measureLineworkProfile(
  inkMask: Uint8Array,
  width: number,
  height: number,
  opaqueCount: number,
): LineworkThicknessProfile {
  const pixelCount = width * height;
  const hRun = new Uint16Array(pixelCount);
  const vRun = new Uint16Array(pixelCount);

  for (let y = 0; y < height; y += 1) {
    let x = 0;
    while (x < width) {
      if (inkMask[y * width + x] === 1) {
        let end = x;
        while (end < width && inkMask[y * width + end] === 1) end += 1;
        for (let k = x; k < end; k += 1) hRun[y * width + k] = end - x;
        x = end;
      } else x += 1;
    }
  }
  for (let x = 0; x < width; x += 1) {
    let y = 0;
    while (y < height) {
      if (inkMask[y * width + x] === 1) {
        let end = y;
        while (end < height && inkMask[end * width + x] === 1) end += 1;
        for (let k = y; k < end; k += 1) vRun[k * width + x] = end - y;
        y = end;
      } else y += 1;
    }
  }

  const widths: number[] = [];
  let hairlineCount = 0;
  let mediumCount = 0;
  let boldCount = 0;
  let heavyCount = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    if (inkMask[i] !== 1) continue;
    const minRun = Math.min(hRun[i] ?? 0, vRun[i] ?? 0);
    if (minRun <= 0 || minRun > MAX_LINE_RUN_PX) continue;
    widths.push(minRun);
    if (minRun <= 1.5) hairlineCount += 1;
    else if (minRun <= 3.0) mediumCount += 1;
    else if (minRun <= 5.0) boldCount += 1;
    else heavyCount += 1;
  }
  widths.sort((a, b) => a - b);
  const meanPx = widths.length > 0 ? widths.reduce((a, b) => a + b, 0) / widths.length : 2.0;
  const medianPx = widths.length > 0 ? percentileFromSorted(widths, 0.5) : 2.0;
  const p10Px = widths.length > 0 ? percentileFromSorted(widths, 0.1) : 1.0;
  const p90Px = widths.length > 0 ? percentileFromSorted(widths, 0.9) : 3.0;
  const variance = widths.length > 0 ? widths.reduce((acc, v) => acc + (v - meanPx) ** 2, 0) / widths.length : 0;

  return {
    meanPx: roundStyle3(meanPx),
    medianPx: roundStyle3(medianPx),
    p10Px: roundStyle3(p10Px),
    p90Px: roundStyle3(p90Px),
    stdDevPx: roundStyle3(Math.sqrt(variance)),
    inkCoverageRatio: roundStyle3(widths.length / Math.max(1, opaqueCount)),
    taperVarianceRatio: roundStyle3((p90Px - p10Px) / Math.max(0.5, medianPx)),
    sampledLinePixels: widths.length,
    histogram: { hairlineCount, mediumCount, boldCount, heavyCount },
  };
}

/** 완성 컷 RGBA 버퍼에서 수동 입력 없이 작가 고유 화풍 매개변수를 자동 추출한다. */
export function extractAutoStyleMetricsFromRgba(frame: AutoStyleFrameBuffer): ExtractedFrameStyleMetrics {
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0) {
    throw new Error(`Invalid frame dimensions: ${frame.width}x${frame.height}`);
  }
  if (frame.rgba.length !== frame.width * frame.height * 4) {
    throw new Error(`Invalid RGBA buffer length: expected ${frame.width * frame.height * 4}, got ${frame.rgba.length}`);
  }

  const { width, height, rgba } = frame;
  const pixelCount = width * height;
  const lumGrid = new Float32Array(pixelCount);
  const alphaMask = new Uint8Array(pixelCount);
  const inkMask = new Uint8Array(pixelCount);
  const hist64 = new Int32Array(64);
  const opaqueLums: number[] = [];
  const paletteSamples: OklabColor[] = [];

  let opaqueCount = 0;
  let shadowSumL = 0;
  let shadowSumA = 0;
  let shadowSumB = 0;
  let shadowCount = 0;
  let highlightSumL = 0;
  let highlightSin = 0;
  let highlightCos = 0;
  let highlightCount = 0;
  const sampleStride = Math.max(1, Math.floor(pixelCount / 1800));

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    if ((rgba[off + 3] ?? 0) < 128) continue;
    alphaMask[i] = 1;
    opaqueCount += 1;
    const lab = srgbToOklab(rgba[off] ?? 0, rgba[off + 1] ?? 0, rgba[off + 2] ?? 0);
    lumGrid[i] = lab.L;
    opaqueLums.push(lab.L);
    const bin = clampStyleScalar(Math.floor(lab.L * 63.999), 0, 63);
    hist64[bin] = (hist64[bin] ?? 0) + 1;

    if (lab.L <= INK_LIGHTNESS_MAX && Math.hypot(lab.a, lab.b) <= 0.085) {
      inkMask[i] = 1;
    } else {
      if (i % sampleStride === 0) paletteSamples.push(lab);
      if (lab.L >= SHADOW_L_MIN && lab.L <= SHADOW_L_MAX) {
        shadowSumL += lab.L;
        shadowSumA += lab.a;
        shadowSumB += lab.b;
        shadowCount += 1;
      } else if (lab.L >= HIGHLIGHT_L_MIN) {
        highlightSumL += lab.L;
        const lch = oklabToOklch(lab);
        const rad = (lch.H * Math.PI) / 180;
        highlightSin += Math.sin(rad) * Math.max(0.01, lch.C);
        highlightCos += Math.cos(rad) * Math.max(0.01, lch.C);
        highlightCount += 1;
      }
    }
  }

  const linework = measureLineworkProfile(inkMask, width, height, opaqueCount);
  const dominantPalette = extractDominantOklchPalette(paletteSamples, 5);

  const shadowMeanL = shadowCount > 0 ? shadowSumL / shadowCount : 0.36;
  const shadowMeanA = shadowCount > 0 ? shadowSumA / shadowCount : 0;
  const shadowMeanB = shadowCount > 0 ? shadowSumB / shadowCount : -0.02;
  const shadowLch = oklabToOklch({ L: shadowMeanL, a: shadowMeanA, b: shadowMeanB });
  const temp = estimateShadowKelvinFromHue(shadowLch.H, shadowLch.C);
  const shadowTemperature: ShadowTemperatureProfile = {
    meanLightness: roundStyle3(shadowLch.L),
    meanChroma: roundStyle3(shadowLch.C),
    meanHueDeg: roundStyle3(shadowLch.H),
    meanA: roundStyle3(shadowMeanA),
    meanB: roundStyle3(shadowMeanB),
    coolWarmIndex: temp.coolWarmIndex,
    estimatedKelvin: temp.kelvin,
    highlightMeanLightness: roundStyle3(highlightCount > 0 ? highlightSumL / highlightCount : 0.92),
    highlightMeanHueDeg: roundStyle3(highlightCount > 0 ? normalizeHueDeg((Math.atan2(highlightSin, highlightCos) * 180) / Math.PI) : 85),
    shadowPixelRatio: roundStyle3(shadowCount / Math.max(1, opaqueCount)),
    cssOklch: formatOklchCss(shadowLch),
  };

  opaqueLums.sort((a, b) => a - b);
  const p05L = percentileFromSorted(opaqueLums, 0.05);
  const p25L = percentileFromSorted(opaqueLums, 0.25);
  const p50L = percentileFromSorted(opaqueLums, 0.5);
  const p75L = percentileFromSorted(opaqueLums, 0.75);
  const p95L = percentileFromSorted(opaqueLums, 0.95);
  const meanLum = opaqueLums.length > 0 ? opaqueLums.reduce((a, b) => a + b, 0) / opaqueLums.length : 0.5;
  const lumVar = opaqueLums.length > 0 ? opaqueLums.reduce((a, v) => a + (v - meanLum) ** 2, 0) / opaqueLums.length : 0;
  const contrast: ContrastStepsProfile = {
    p05L: roundStyle3(p05L),
    p25L: roundStyle3(p25L),
    p50L: roundStyle3(p50L),
    p75L: roundStyle3(p75L),
    p95L: roundStyle3(p95L),
    dynamicRange: roundStyle3(p95L - p05L),
    midtoneContrast: roundStyle3(p75L - p25L),
    rmsContrast: roundStyle3(Math.sqrt(lumVar)),
    detectedToneSteps: detectTonalStepCount(hist64, opaqueCount),
  };

  let tonedPixels = 0;
  let altXCount = 0;
  let altYCount = 0;
  let toneDarknessSum = 0;
  let interiorNonInk = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      if (alphaMask[idx] !== 1 || inkMask[idx] === 1) continue;
      interiorNonInk += 1;
      const c = lumGrid[idx] ?? 0;
      const l = lumGrid[idx - 1] ?? c;
      const r = lumGrid[idx + 1] ?? c;
      const u = lumGrid[idx - width] ?? c;
      const d = lumGrid[idx + width] ?? c;
      const isAltX = (c - l) * (c - r) > 0 && Math.abs(c - 0.5 * (l + r)) >= 0.055;
      const isAltY = (c - u) * (c - d) > 0 && Math.abs(c - 0.5 * (u + d)) >= 0.055;
      if (isAltX) altXCount += 1;
      if (isAltY) altYCount += 1;
      if (isAltX || isAltY) {
        tonedPixels += 1;
        toneDarknessSum += clampStyleScalar(1 - c, 0, 1);
      }
    }
  }
  const denom = Math.max(1, interiorNonInk);
  const coverageRatio = tonedPixels / denom;
  const altX = altXCount / denom;
  const altY = altYCount / denom;
  let patternKind: ScreentonePatternKind = "none";
  if (coverageRatio >= 0.03) {
    const symmetry = Math.min(altX, altY) / Math.max(1e-5, Math.max(altX, altY));
    patternKind = symmetry >= 0.62 && coverageRatio >= 0.06 ? "halftone-dot" : symmetry < 0.62 ? "crosshatch" : "soft-grain";
  }

  return {
    frameId: frame.frameId,
    episodeId: frame.episodeId ?? "ep-01",
    width,
    height,
    linework,
    dominantPalette,
    shadowTemperature,
    contrast,
    screentone: {
      coverageRatio: roundStyle3(coverageRatio),
      meanDotDensity: roundStyle3(tonedPixels > 0 ? toneDarknessSum / tonedPixels : 0),
      alternatingRateX: roundStyle3(altX),
      alternatingRateY: roundStyle3(altY),
      estimatedLpiFrequency: roundStyle3(coverageRatio > 0.02 ? 32 + (altX + altY) * 90 : 0),
      patternKind,
    },
  };
}

/** 테스트 및 스튜디오 미리보기용 결정론적 웹툰 컷 RGBA 버퍼 생성기. */
export function createSyntheticStyleFrame(params: {
  readonly frameId: string;
  readonly episodeId?: string;
  readonly preset: SyntheticStylePresetId;
  readonly variant: "master" | "aligned" | "drifted";
  readonly width?: number;
  readonly height?: number;
}): AutoStyleFrameBuffer {
  const width = params.width ?? 64;
  const height = params.height ?? 64;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const isNoir = params.preset === "cool-noir-atelier";
  const isDrifted = params.variant === "drifted";
  const isAligned = params.variant === "aligned";

  const bgRgb = isDrifted ? (isNoir ? [214, 196, 178] : [182, 204, 214]) : isNoir ? (isAligned ? [232, 238, 246] : [236, 241, 248]) : (isAligned ? [250, 238, 224] : [252, 240, 226]);
  const midRgb = isDrifted ? (isNoir ? [184, 152, 118] : [132, 170, 156]) : isNoir ? [144, 168, 206] : [236, 176, 146];
  const shadowRgb = isDrifted ? (isNoir ? [136, 108, 72] : [68, 108, 128]) : isNoir ? [56, 76, 126] : [132, 74, 78];
  const accentRgb = isDrifted ? (isNoir ? [196, 160, 74] : [88, 158, 168]) : isNoir ? [64, 128, 218] : [228, 108, 92];
  const lineWidth = isDrifted ? 4 : isNoir ? 2 : 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      let rgb = bgRgb;
      const dx = x - width * 0.5;
      const dy = y - height * 0.52;
      const rDist = Math.hypot(dx, dy);
      if (rDist < width * 0.34) rgb = dx > width * 0.04 ? shadowRgb : midRgb;
      if (y > height * 0.7 && x > width * 0.22 && x < width * 0.78) rgb = accentRgb;
      if (!isDrifted && x >= 4 && x < width * 0.34 && y >= 4 && y < height * 0.34 && (x + y) % 2 === 0) {
        rgb = [Math.max(40, (bgRgb[0] ?? 200) - 72), Math.max(40, (bgRgb[1] ?? 200) - 72), Math.max(40, (bgRgb[2] ?? 200) - 66)];
      }
      if (x < lineWidth || x >= width - lineWidth || y < lineWidth || y >= height - lineWidth || Math.abs(rDist - width * 0.34) <= lineWidth * 0.55) {
        rgb = [22, 24, 30];
      }
      rgba[idx] = rgb[0] ?? 0;
      rgba[idx + 1] = rgb[1] ?? 0;
      rgba[idx + 2] = rgb[2] ?? 0;
      rgba[idx + 3] = 255;
    }
  }
  return { frameId: params.frameId, episodeId: params.episodeId ?? (isDrifted ? "ep-04" : "ep-01"), width, height, rgba };
}
