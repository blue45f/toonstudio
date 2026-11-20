/**
 * Studio Camera Raw 16-bit Linear Develop Engine & Design Format Meta Adapters
 *
 * Camera Raw / Photopea 수준 비파괴 16-bit 선형 현상(색온도/틴트·노출·톤커브·클래리티·디헤이즈·
 * 8색 HSL·3-휠 그레이딩·비네팅·결정적 그레인·.cube 3D LUT) + .sketch / .ai / DNG 메타·디모자이킹 어댑터.
 */

import type { StudioImageDataLike } from "../studio-filters";

import { parseCubeLut, type StudioCubeLut } from "./studio-adjustment-executor";

export type CameraRawHslBand = "red" | "orange" | "yellow" | "green" | "aqua" | "blue" | "purple" | "magenta";
export interface HslBandAdjustment { readonly hue: number; readonly saturation: number; readonly luminance: number }
export interface ColorWheelGrade { readonly hueDeg: number; readonly saturation01: number; readonly luminance: number }
export interface ToneCurvePoint { readonly x: number; readonly y: number }

export interface CameraRawDevelopSettings {
  readonly temperatureKelvin: number; readonly tint: number; readonly exposureEv: number; readonly contrast: number;
  readonly highlights: number; readonly shadows: number; readonly whites: number; readonly blacks: number;
  readonly clarity: number; readonly dehaze: number; readonly toneCurve?: readonly ToneCurvePoint[];
  readonly hslMixer: Readonly<Record<CameraRawHslBand, HslBandAdjustment>>;
  readonly colorGrading: { readonly shadows: ColorWheelGrade; readonly midtones: ColorWheelGrade; readonly highlights: ColorWheelGrade; readonly balance: number };
  readonly vignette: { readonly amount: number; readonly midpoint: number; readonly feather: number };
  readonly grain: { readonly amount: number; readonly seed: number };
  readonly lut?: { readonly id: string; readonly title: string; readonly cubeText?: string; readonly parsed?: StudioCubeLut; readonly intensity01: number };
}

export interface CameraRawHistogram {
  readonly r: readonly number[]; readonly g: readonly number[]; readonly b: readonly number[]; readonly luma: readonly number[];
  readonly clippedShadowRatio: number; readonly clippedHighlightRatio: number;
}

export interface CameraRawDevelopResult {
  readonly image: StudioImageDataLike; readonly linear16: Uint16Array; readonly histogram: CameraRawHistogram;
  readonly lutApplied: boolean; readonly settingsHash: string;
}

export interface CameraRawLutPreset { readonly id: string; readonly title: string; readonly categoryKo: string; readonly cubeText: string }

const HSL_BANDS: readonly CameraRawHslBand[] = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"];
const HSL_BAND_CENTERS_DEG: Readonly<Record<CameraRawHslBand, number>> = { red: 0, orange: 30, yellow: 60, green: 120, aqua: 180, blue: 240, purple: 280, magenta: 325 };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** IEC 61966-2-1 sRGB -> 선형 광량(0..1). */
export function srgbChannelToLinear(c: number): number {
  const x = clamp(c, 0, 1);
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** 선형 광량(0..1) -> IEC 61966-2-1 sRGB. */
export function linearChannelToSrgb(c: number): number {
  const x = clamp(c, 0, 1);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

const defaultBand = (): HslBandAdjustment => ({ hue: 0, saturation: 0, luminance: 0 });
const defaultWheel = (): ColorWheelGrade => ({ hueDeg: 0, saturation01: 0, luminance: 0 });

export function createDefaultCameraRawSettings(overrides?: Partial<CameraRawDevelopSettings>): CameraRawDevelopSettings {
  const baseHsl: Record<CameraRawHslBand, HslBandAdjustment> = {
    red: defaultBand(), orange: defaultBand(), yellow: defaultBand(), green: defaultBand(),
    aqua: defaultBand(), blue: defaultBand(), purple: defaultBand(), magenta: defaultBand(),
  };
  return {
    temperatureKelvin: overrides?.temperatureKelvin ?? 6500, tint: overrides?.tint ?? 0, exposureEv: overrides?.exposureEv ?? 0,
    contrast: overrides?.contrast ?? 0, highlights: overrides?.highlights ?? 0, shadows: overrides?.shadows ?? 0,
    whites: overrides?.whites ?? 0, blacks: overrides?.blacks ?? 0, clarity: overrides?.clarity ?? 0, dehaze: overrides?.dehaze ?? 0,
    toneCurve: overrides?.toneCurve, hslMixer: overrides?.hslMixer ? { ...baseHsl, ...overrides.hslMixer } : baseHsl,
    colorGrading: {
      shadows: overrides?.colorGrading?.shadows ?? defaultWheel(), midtones: overrides?.colorGrading?.midtones ?? defaultWheel(),
      highlights: overrides?.colorGrading?.highlights ?? defaultWheel(), balance: overrides?.colorGrading?.balance ?? 0,
    },
    vignette: { amount: overrides?.vignette?.amount ?? 0, midpoint: overrides?.vignette?.midpoint ?? 50, feather: overrides?.vignette?.feather ?? 50 },
    grain: { amount: overrides?.grain?.amount ?? 0, seed: overrides?.grain?.seed ?? 42 },
    lut: overrides?.lut,
  };
}

function computeWhiteBalanceMultipliers(kelvin: number, tint: number): readonly [number, number, number] {
  const deltaTemp = (clamp(kelvin, 2000, 50000) - 6500) / 6500;
  const t = clamp(tint, -100, 100) / 100;
  const rGain = Math.max(0.25, 1 + deltaTemp * 0.45 + t * 0.14);
  const gGain = Math.max(0.25, 1 - t * 0.22);
  const bGain = Math.max(0.25, 1 - deltaTemp * 0.48 + t * 0.14);
  const norm = 3 / (rGain + gGain + bGain);
  return [rGain * norm, gGain * norm, bGain * norm];
}

function rgbToHsl01(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) * 0.5;
  const d = max - min;
  if (d < 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hueToRgb(p: number, q: number, rawT: number): number {
  const t = rawT < 0 ? rawT + 1 : rawT > 1 ? rawT - 1 : rawT;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 0.5) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hsl01ToRgb(hDeg: number, s: number, l: number): [number, number, number] {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const sat = clamp(s, 0, 1);
  const lum = clamp(l, 0, 1);
  if (sat < 1e-6) return [lum, lum, lum];
  const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
  const p = 2 * lum - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
}

function evaluateToneCurve(x: number, sorted: readonly ToneCurvePoint[]): number {
  if (x <= sorted[0]!.x) return clamp(sorted[0]!.y, 0, 1);
  const last = sorted[sorted.length - 1]!;
  if (x >= last.x) return clamp(last.y, 0, 1);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const p0 = sorted[i]!;
    const p1 = sorted[i + 1]!;
    if (x >= p0.x && x <= p1.x) {
      const u = (x - p0.x) / Math.max(1e-6, p1.x - p0.x);
      return clamp(p0.y + (p1.y - p0.y) * u * u * (3 - 2 * u), 0, 1);
    }
  }
  return x;
}

function sampleCubeLutTrilinear(lut: StudioCubeLut, rIn: number, gIn: number, bIn: number): [number, number, number] {
  const { size, table } = lut;
  const rp = clamp(rIn, 0, 1) * (size - 1);
  const gp = clamp(gIn, 0, 1) * (size - 1);
  const bp = clamp(bIn, 0, 1) * (size - 1);
  const r0 = Math.floor(rp);
  const g0 = Math.floor(gp);
  const b0 = Math.floor(bp);
  const r1 = Math.min(size - 1, r0 + 1);
  const g1 = Math.min(size - 1, g0 + 1);
  const b1 = Math.min(size - 1, b0 + 1);
  const fr = rp - r0;
  const fg = gp - g0;
  const fb = bp - b0;
  const at = (ri: number, gi: number, bi: number, ch: number): number => table[((bi * size + gi) * size + ri) * 3 + ch]!;
  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch += 1) {
    const x00 = at(r0, g0, b0, ch) * (1 - fr) + at(r1, g0, b0, ch) * fr;
    const x10 = at(r0, g1, b0, ch) * (1 - fr) + at(r1, g1, b0, ch) * fr;
    const x01 = at(r0, g0, b1, ch) * (1 - fr) + at(r1, g0, b1, ch) * fr;
    const x11 = at(r0, g1, b1, ch) * (1 - fr) + at(r1, g1, b1, ch) * fr;
    out[ch] = clamp((x00 * (1 - fg) + x10 * fg) * (1 - fb) + (x01 * (1 - fg) + x11 * fg) * fb, 0, 1);
  }
  return out;
}

function deterministicPixelGrain(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5;
}

function boxBlurLuma(luma: Float32Array, width: number, height: number, radius: number): Float32Array {
  const temp = new Float32Array(luma.length);
  const out = new Float32Array(luma.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dx = -radius; dx <= radius; dx += 1) sum += luma[y * width + clamp(x + dx, 0, width - 1)]!;
      temp[y * width + x] = sum / span;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dy = -radius; dy <= radius; dy += 1) sum += temp[clamp(y + dy, 0, height - 1) * width + x]!;
      out[y * width + x] = sum / span;
    }
  }
  return out;
}

function hashSettings(settings: CameraRawDevelopSettings): string {
  const payload = JSON.stringify({ ...settings, lut: settings.lut ? { id: settings.lut.id, intensity01: settings.lut.intensity01 } : undefined });
  let h = 2166136261;
  for (let i = 0; i < payload.length; i += 1) h = Math.imul(h ^ payload.charCodeAt(i), 16777619) >>> 0;
  return `raw-${h.toString(16).padStart(8, "0")}`;
}

/** 16-bit 선형 Camera Raw 비파괴 현상 파이프라인을 실행한다. */
export function developCameraRawImage(source: StudioImageDataLike, settings: CameraRawDevelopSettings): CameraRawDevelopResult {
  const { width, height } = source;
  const pixelCount = width * height;
  const linear = new Float32Array(pixelCount * 4);
  const [wbR, wbG, wbB] = computeWhiteBalanceMultipliers(settings.temperatureKelvin, settings.tint);
  const exposureGain = Math.pow(2, clamp(settings.exposureEv, -5, 5));
  const dehazeAmt = clamp(settings.dehaze, -100, 100) / 100;
  const clarityAmt = clamp(settings.clarity, -100, 100) / 100;

  let atmR = 0.85;
  let atmG = 0.88;
  let atmB = 0.92;
  let maxDark = 0;
  for (let p = 0; p < pixelCount; p += 1) {
    const i = p * 4;
    const r = srgbChannelToLinear(source.data[i]! / 255) * wbR * exposureGain;
    const g = srgbChannelToLinear(source.data[i + 1]! / 255) * wbG * exposureGain;
    const b = srgbChannelToLinear(source.data[i + 2]! / 255) * wbB * exposureGain;
    linear[i] = r;
    linear[i + 1] = g;
    linear[i + 2] = b;
    linear[i + 3] = source.data[i + 3]! / 255;
    const dark = Math.min(r, g, b);
    if (dark > maxDark) {
      maxDark = dark;
      atmR = clamp(r, 0.35, 1);
      atmG = clamp(g, 0.35, 1);
      atmB = clamp(b, 0.35, 1);
    }
  }

  if (Math.abs(dehazeAmt) > 1e-4) {
    const omega = 0.85 * Math.abs(dehazeAmt);
    for (let p = 0; p < pixelCount; p += 1) {
      const i = p * 4;
      const r = linear[i]!;
      const g = linear[i + 1]!;
      const b = linear[i + 2]!;
      if (dehazeAmt > 0) {
        const trans = clamp(1 - omega * Math.min(r / atmR, g / atmG, b / atmB), 0.2, 1);
        linear[i] = clamp((r - atmR) / trans + atmR, 0, 4);
        linear[i + 1] = clamp((g - atmG) / trans + atmG, 0, 4);
        linear[i + 2] = clamp((b - atmB) / trans + atmB, 0, 4);
      } else {
        const veil = omega * 0.45;
        linear[i] = r * (1 - veil) + atmR * veil;
        linear[i + 1] = g * (1 - veil) + atmG * veil;
        linear[i + 2] = b * (1 - veil) + atmB * veil;
      }
    }
  }

  if (Math.abs(clarityAmt) > 1e-4 && width > 2 && height > 2) {
    const luma = new Float32Array(pixelCount);
    for (let p = 0; p < pixelCount; p += 1) luma[p] = 0.2126 * linear[p * 4]! + 0.7152 * linear[p * 4 + 1]! + 0.0722 * linear[p * 4 + 2]!;
    const blurred = boxBlurLuma(luma, width, height, 2);
    for (let p = 0; p < pixelCount; p += 1) {
      const l = clamp(luma[p]!, 0, 1);
      const detail = (luma[p]! - blurred[p]!) * clarityAmt * 0.9 * (4 * l * (1 - l));
      const i = p * 4;
      linear[i] = Math.max(0, linear[i]! + detail);
      linear[i + 1] = Math.max(0, linear[i + 1]! + detail);
      linear[i + 2] = Math.max(0, linear[i + 2]! + detail);
    }
  }

  const parsedLut = settings.lut?.parsed ?? (settings.lut?.cubeText ? parseCubeLut(settings.lut.cubeText) : undefined);
  const lutIntensity = clamp(settings.lut?.intensity01 ?? 1, 0, 1);
  const sortedCurve = settings.toneCurve && settings.toneCurve.length >= 2 ? [...settings.toneCurve].sort((a, b) => a.x - b.x) : undefined;
  const contrastFactor = 1 + clamp(settings.contrast, -100, 100) / 100;
  const hiAmt = clamp(settings.highlights, -100, 100) / 100;
  const shAmt = clamp(settings.shadows, -100, 100) / 100;
  const whAmt = clamp(settings.whites, -100, 100) / 100;
  const blAmt = clamp(settings.blacks, -100, 100) / 100;
  const vigAmt = clamp(settings.vignette.amount, -100, 100) / 100;
  const vigMid = clamp(settings.vignette.midpoint, 0, 100) / 100;
  const vigFeather = Math.max(0.05, clamp(settings.vignette.feather, 0, 100) / 100);
  const grainAmt = clamp(settings.grain.amount, 0, 100) / 100;
  const balanceShift = clamp(settings.colorGrading.balance, -100, 100) / 200;
  const hasHsl = HSL_BANDS.some((b) => settings.hslMixer[b].hue !== 0 || settings.hslMixer[b].saturation !== 0 || settings.hslMixer[b].luminance !== 0);

  const outRgba = new Uint8ClampedArray(source.data.length);
  const linear16 = new Uint16Array(pixelCount * 4);
  const histR = new Array<number>(256).fill(0);
  const histG = new Array<number>(256).fill(0);
  const histB = new Array<number>(256).fill(0);
  const histL = new Array<number>(256).fill(0);
  let clippedShadows = 0;
  let clippedHighlights = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      let r = clamp(linear[i]!, 0, 1);
      let g = clamp(linear[i + 1]!, 0, 1);
      let b = clamp(linear[i + 2]!, 0, 1);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const gain = 1 + shAmt * 0.45 * (1 - luma) * (1 - luma) + hiAmt * 0.45 * luma * luma;
      const offset = blAmt * 0.12 * (1 - luma) + whAmt * 0.14 * luma;
      r = clamp((r * gain + offset - 0.5) * contrastFactor + 0.5, 0, 1);
      g = clamp((g * gain + offset - 0.5) * contrastFactor + 0.5, 0, 1);
      b = clamp((b * gain + offset - 0.5) * contrastFactor + 0.5, 0, 1);

      if (sortedCurve) {
        r = evaluateToneCurve(r, sortedCurve);
        g = evaluateToneCurve(g, sortedCurve);
        b = evaluateToneCurve(b, sortedCurve);
      }

      if (hasHsl) {
        const [h, s, l] = rgbToHsl01(r, g, b);
        let dH = 0;
        let dS = 0;
        let dL = 0;
        for (const band of HSL_BANDS) {
          const adj = settings.hslMixer[band];
          if (adj.hue === 0 && adj.saturation === 0 && adj.luminance === 0) continue;
          const rawDist = Math.abs(h - HSL_BAND_CENTERS_DEG[band]);
          const angDist = Math.min(rawDist, 360 - rawDist);
          if (angDist < 45) {
            const w = 0.5 * (1 + Math.cos((angDist / 45) * Math.PI));
            dH += (adj.hue / 100) * 30 * w;
            dS += (adj.saturation / 100) * 0.5 * w;
            dL += (adj.luminance / 100) * 0.35 * w;
          }
        }
        [r, g, b] = hsl01ToRgb(h + dH, clamp(s + dS, 0, 1), clamp(l + dL, 0, 1));
      }

      const cg = settings.colorGrading;
      const gLuma = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b + balanceShift, 0, 1);
      const wSh = (1 - gLuma) * (1 - gLuma);
      const wHi = gLuma * gLuma;
      for (const [wheel, weight] of [[cg.shadows, wSh], [cg.midtones, Math.max(0, 1 - wSh - wHi)], [cg.highlights, wHi]] as const) {
        if (weight <= 1e-4) continue;
        if (wheel.saturation01 > 1e-4) {
          const [tr, tg, tb] = hsl01ToRgb(wheel.hueDeg, 1, 0.5);
          const mix = clamp(wheel.saturation01 * 0.35 * weight, 0, 0.65);
          r = clamp(r + (tr - 0.5) * mix, 0, 1);
          g = clamp(g + (tg - 0.5) * mix, 0, 1);
          b = clamp(b + (tb - 0.5) * mix, 0, 1);
        }
        if (Math.abs(wheel.luminance) > 1e-4) {
          const shift = wheel.luminance * 0.25 * weight;
          r = clamp(r + shift, 0, 1);
          g = clamp(g + shift, 0, 1);
          b = clamp(b + shift, 0, 1);
        }
      }

      if (Math.abs(vigAmt) > 1e-4) {
        const edge = clamp((Math.hypot(width > 1 ? (x / (width - 1)) * 2 - 1 : 0, height > 1 ? (y / (height - 1)) * 2 - 1 : 0) / Math.SQRT2 - vigMid) / vigFeather, 0, 1);
        const factor = clamp(1 + vigAmt * 0.75 * edge * edge * (3 - 2 * edge), 0.1, 2);
        r = clamp(r * factor, 0, 1);
        g = clamp(g * factor, 0, 1);
        b = clamp(b * factor, 0, 1);
      }

      if (grainAmt > 1e-4) {
        const n = deterministicPixelGrain(x, y, settings.grain.seed) * grainAmt * 0.18;
        r = clamp(r + n, 0, 1);
        g = clamp(g + n, 0, 1);
        b = clamp(b + n, 0, 1);
      }

      linear16[i] = Math.round(r * 65535);
      linear16[i + 1] = Math.round(g * 65535);
      linear16[i + 2] = Math.round(b * 65535);
      linear16[i + 3] = Math.round(clamp(linear[i + 3]!, 0, 1) * 65535);

      let sr = linearChannelToSrgb(r);
      let sg = linearChannelToSrgb(g);
      let sb = linearChannelToSrgb(b);
      if (parsedLut && lutIntensity > 0) {
        const [lr, lg, lb] = sampleCubeLutTrilinear(parsedLut, sr, sg, sb);
        sr += (lr - sr) * lutIntensity;
        sg += (lg - sg) * lutIntensity;
        sb += (lb - sb) * lutIntensity;
      }

      const r8 = Math.round(clamp(sr, 0, 1) * 255);
      const g8 = Math.round(clamp(sg, 0, 1) * 255);
      const b8 = Math.round(clamp(sb, 0, 1) * 255);
      outRgba[i] = r8;
      outRgba[i + 1] = g8;
      outRgba[i + 2] = b8;
      outRgba[i + 3] = source.data[i + 3]!;
      histR[r8] = histR[r8]! + 1;
      histG[g8] = histG[g8]! + 1;
      histB[b8] = histB[b8]! + 1;
      const l8 = Math.round(0.2126 * r8 + 0.7152 * g8 + 0.0722 * b8);
      histL[l8] = histL[l8]! + 1;
      if (r8 === 0 && g8 === 0 && b8 === 0) clippedShadows += 1;
      if (r8 === 255 && g8 === 255 && b8 === 255) clippedHighlights += 1;
    }
  }

  return {
    image: { data: outRgba, width, height },
    linear16,
    histogram: { r: histR, g: histG, b: histB, luma: histL, clippedShadowRatio: pixelCount > 0 ? clippedShadows / pixelCount : 0, clippedHighlightRatio: pixelCount > 0 ? clippedHighlights / pixelCount : 0 },
    lutApplied: Boolean(parsedLut && lutIntensity > 0),
    settingsHash: hashSettings(settings),
  };
}

export function buildProceduralCubeLutText(title: string, size: number, transform: (r: number, g: number, b: number) => readonly [number, number, number]): string {
  const n = clamp(Math.floor(size), 2, 33);
  const lines: string[] = [`TITLE "${title}"`, `LUT_3D_SIZE ${n}`];
  for (let b = 0; b < n; b += 1) {
    for (let g = 0; g < n; g += 1) {
      for (let r = 0; r < n; r += 1) {
        const [or, og, ob] = transform(r / (n - 1), g / (n - 1), b / (n - 1));
        lines.push(`${clamp(or, 0, 1).toFixed(5)} ${clamp(og, 0, 1).toFixed(5)} ${clamp(ob, 0, 1).toFixed(5)}`);
      }
    }
  }
  return lines.join("\n");
}

export function createBuiltInCameraRawLutCatalog(): readonly CameraRawLutPreset[] {
  return [
    { id: "webtoon-golden-hour", title: "Golden Hour Sunset", categoryKo: "노을/따뜻함", cubeText: buildProceduralCubeLutText("Golden Hour Sunset", 5, (r, g, b) => [clamp(r * 1.08 + 0.03, 0, 1), clamp(g * 1.01 + 0.01, 0, 1), clamp(b * 0.88, 0, 1)]) },
    { id: "webtoon-midnight-teal", title: "Midnight Teal Shadows", categoryKo: "심야/시네마틱", cubeText: buildProceduralCubeLutText("Midnight Teal Shadows", 5, (r, g, b) => [clamp(r * 0.9, 0, 1), clamp(g * 0.98 + 0.02, 0, 1), clamp(b * 1.08 + 0.04, 0, 1)]) },
    {
      id: "webtoon-memory-sepia", title: "Memory Film Sepia", categoryKo: "회상/필름",
      cubeText: buildProceduralCubeLutText("Memory Film Sepia", 5, (r, g, b) => {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        return [clamp(l * 1.08 + 0.04, 0, 1), clamp(l * 0.96 + 0.01, 0, 1), clamp(l * 0.8, 0, 1)];
      }),
    },
  ];
}

// ---------------------------------------------------------------------------
// 2. .sketch / .ai / DNG 메타 어댑터 & Malvar-He-Cutler 선형 디모자이킹
// ---------------------------------------------------------------------------

export interface SketchArtboardSummary { readonly id: string; readonly name: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly layerCount: number }
export interface SketchMetaAdapterResult { readonly ok: boolean; readonly pageCount: number; readonly artboards: readonly SketchArtboardSummary[]; readonly vectorPathCount: number; readonly textLayerCount: number; readonly symbolInstanceCount: number; readonly warnings: readonly string[] }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export function parseSketchDocumentMeta(rawPages: readonly unknown[]): SketchMetaAdapterResult {
  const artboards: SketchArtboardSummary[] = [];
  const warnings: string[] = [];
  let vectorPathCount = 0;
  let textLayerCount = 0;
  let symbolInstanceCount = 0;

  const walk = (layers: unknown): number => {
    if (!Array.isArray(layers)) return 0;
    let count = 0;
    for (const item of layers) {
      if (!isRecord(item)) continue;
      count += 1;
      const cls = typeof item._class === "string" ? item._class : "";
      if (cls === "shapePath" || cls === "shapeGroup" || cls === "rectangle" || cls === "oval") vectorPathCount += 1;
      else if (cls === "text") textLayerCount += 1;
      else if (cls === "symbolInstance") symbolInstanceCount += 1;
      if (Array.isArray(item.layers)) count += walk(item.layers);
    }
    return count;
  };

  let validPages = 0;
  for (const page of rawPages) {
    if (!isRecord(page)) {
      warnings.push("유효하지 않은 Sketch 페이지 객체를 건너뛰었습니다.");
      continue;
    }
    validPages += 1;
    for (const node of Array.isArray(page.layers) ? page.layers : []) {
      if (!isRecord(node)) continue;
      if (node._class === "artboard") {
        const f = isRecord(node.frame) ? node.frame : {};
        artboards.push({
          id: typeof node.do_objectID === "string" ? node.do_objectID : `artboard-${artboards.length}`,
          name: typeof node.name === "string" ? node.name : "Untitled Artboard",
          x: typeof f.x === "number" ? f.x : 0, y: typeof f.y === "number" ? f.y : 0,
          width: typeof f.width === "number" ? f.width : 0, height: typeof f.height === "number" ? f.height : 0,
          layerCount: walk(node.layers),
        });
      } else walk([node]);
    }
  }
  return { ok: validPages > 0, pageCount: validPages, artboards, vectorPathCount, textLayerCount, symbolInstanceCount, warnings };
}

export interface AiMetaAdapterResult {
  readonly ok: boolean; readonly hasPdfCompatibleStream: boolean; readonly creator: string;
  readonly artboardBoxPt?: readonly [number, number, number, number]; readonly layerNames: readonly string[];
  readonly vectorCommandCount: number; readonly warnings: readonly string[];
}

export function parseAiDocumentMeta(rawStreamText: string): AiMetaAdapterResult {
  const hasPdf = rawStreamText.includes("%PDF-");
  const hasPsAi = rawStreamText.includes("%!PS-Adobe") || rawStreamText.includes("%AI");
  const creatorMatch = /%%Creator:\s*([^\r\n]+)/.exec(rawStreamText);
  const boxMatch = /\/(?:ArtBox|MediaBox|CropBox)\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(rawStreamText);
  const layerNames: string[] = [];
  const layerRegex = /\/Type\s*\/OCG[^]*?\/Name\s*\(([^)]+)\)/g;
  let m = layerRegex.exec(rawStreamText);
  while (m) {
    if (m[1]) layerNames.push(m[1]);
    m = layerRegex.exec(rawStreamText);
  }
  return {
    ok: hasPdf || hasPsAi, hasPdfCompatibleStream: hasPdf, creator: creatorMatch?.[1]?.trim() ?? "Unknown",
    artboardBoxPt: boxMatch ? [Number(boxMatch[1]), Number(boxMatch[2]), Number(boxMatch[3]), Number(boxMatch[4])] : undefined,
    layerNames, vectorCommandCount: rawStreamText.match(/(?:^|\s)[-\d.]+\s+[-\d.]+\s+[mlc]\b/g)?.length ?? 0,
    warnings: hasPdf ? [] : ["PDF 호환 스트림이 비활성화된 구형 .ai 파일입니다."],
  };
}

export type BayerPattern = "RGGB" | "BGGR" | "GRBG" | "GBRG";
export interface DngHeaderMeta {
  readonly ok: boolean; readonly byteOrder: "little" | "big" | "unknown"; readonly width: number; readonly height: number;
  readonly bitsPerSample: number; readonly isDng: boolean; readonly dngVersion: readonly [number, number, number, number];
  readonly blackLevel: number; readonly whiteLevel: number; readonly suggestedTemperatureKelvin: number; readonly suggestedTint: number;
}

const INVALID_DNG: DngHeaderMeta = {
  ok: false, byteOrder: "unknown", width: 0, height: 0, bitsPerSample: 0, isDng: false,
  dngVersion: [0, 0, 0, 0], blackLevel: 0, whiteLevel: 65535, suggestedTemperatureKelvin: 6500, suggestedTint: 0,
};

export function parseDngHeaderMeta(bytes: Uint8Array): DngHeaderMeta {
  if (bytes.length < 16) return INVALID_DNG;
  const isLE = bytes[0] === 0x49 && bytes[1] === 0x49;
  const isBE = bytes[0] === 0x4d && bytes[1] === 0x4d;
  if (!isLE && !isBE) return INVALID_DNG;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ifdOffset = view.getUint32(4, isLE);
  if (view.getUint16(2, isLE) !== 42 || ifdOffset + 2 > bytes.length) return { ...INVALID_DNG, byteOrder: isLE ? "little" : "big" };

  const entryCount = view.getUint16(ifdOffset, isLE);
  let width = 0;
  let height = 0;
  let bitsPerSample = 14;
  let isDng = false;
  let dngVersion: [number, number, number, number] = [0, 0, 0, 0];
  let blackLevel = 0;
  let whiteLevel = 16383;
  let neutralR = 0.5;
  let neutralG = 1;
  let neutralB = 0.5;

  for (let idx = 0; idx < entryCount; idx += 1) {
    const base = ifdOffset + 2 + idx * 12;
    if (base + 12 > bytes.length) break;
    const tag = view.getUint16(base, isLE);
    const type = view.getUint16(base + 2, isLE);
    const count = view.getUint32(base + 4, isLE);
    const valU32 = view.getUint32(base + 8, isLE);
    const scalar = type === 3 ? view.getUint16(base + 8, isLE) : valU32;
    if (tag === 256) width = scalar;
    else if (tag === 257) height = scalar;
    else if (tag === 258) bitsPerSample = scalar;
    else if (tag === 50706) {
      isDng = true;
      dngVersion = [bytes[base + 8]!, bytes[base + 9]!, bytes[base + 10]!, bytes[base + 11]!];
    } else if (tag === 50714) blackLevel = scalar;
    else if (tag === 50717) whiteLevel = scalar;
    else if (tag === 50728 && type === 5 && count >= 3 && valU32 + 24 <= bytes.length) {
      const rat = (off: number): number => view.getUint32(off, isLE) / Math.max(1, view.getUint32(off + 4, isLE));
      neutralR = rat(valU32);
      neutralG = rat(valU32 + 8);
      neutralB = rat(valU32 + 16);
    }
  }
  return {
    ok: true, byteOrder: isLE ? "little" : "big", width, height, bitsPerSample, isDng, dngVersion, blackLevel, whiteLevel,
    suggestedTemperatureKelvin: Math.round(clamp(6500 * Math.pow(neutralB / Math.max(0.05, neutralR), 0.55), 2500, 18000)),
    suggestedTint: Math.round(clamp((neutralG - (neutralR + neutralB) * 0.5) * 40, -50, 50)),
  };
}

/** Malvar-He-Cutler 5x5 선형 베이어 디모자이킹(DNG RAW -> sRGB StudioImageDataLike). */
export function demosaicBayerToImageData(
  rawSamples: Uint16Array,
  width: number,
  height: number,
  pattern: BayerPattern,
  blackLevel = 0,
  whiteLevel = 65535,
): StudioImageDataLike {
  const denom = Math.max(1, whiteLevel - blackLevel);
  const norm = new Float32Array(width * height);
  for (let i = 0; i < norm.length; i += 1) norm[i] = clamp(((rawSamples[i] ?? 0) - blackLevel) / denom, 0, 1);
  const at = (x: number, y: number): number => norm[clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)]!;
  const rRow = pattern === "RGGB" || pattern === "GRBG" ? 0 : 1;
  const rCol = pattern === "RGGB" || pattern === "GBRG" ? 0 : 1;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isR = (y & 1) === rRow && (x & 1) === rCol;
      const isB = (y & 1) === (1 - rRow) && (x & 1) === (1 - rCol);
      const c = at(x, y);
      let r: number;
      let g: number;
      let b: number;
      if (isR || isB) {
        g = clamp((4 * c + 2 * (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) - (at(x - 2, y) + at(x + 2, y) + at(x, y - 2) + at(x, y + 2))) / 8, 0, 1);
        const diag = clamp((6 * c + 2 * (at(x - 1, y - 1) + at(x + 1, y - 1) + at(x - 1, y + 1) + at(x + 1, y + 1)) - 1.5 * (at(x - 2, y) + at(x + 2, y) + at(x, y - 2) + at(x, y + 2))) / 8, 0, 1);
        r = isR ? c : diag;
        b = isR ? diag : c;
      } else {
        const horiz = clamp((5 * c + 4 * (at(x - 1, y) + at(x + 1, y)) - (at(x - 2, y) + at(x + 2, y) + at(x - 1, y - 1) + at(x + 1, y - 1) + at(x - 1, y + 1) + at(x + 1, y + 1)) + 0.5 * (at(x, y - 2) + at(x, y + 2))) / 8, 0, 1);
        const vert = clamp((5 * c + 4 * (at(x, y - 1) + at(x, y + 1)) - (at(x, y - 2) + at(x, y + 2) + at(x - 1, y - 1) + at(x + 1, y - 1) + at(x - 1, y + 1) + at(x + 1, y + 1)) + 0.5 * (at(x - 2, y) + at(x + 2, y))) / 8, 0, 1);
        const rOnRow = (y & 1) === rRow;
        r = rOnRow ? horiz : vert;
        b = rOnRow ? vert : horiz;
        g = c;
      }
      const idx = (y * width + x) * 4;
      data[idx] = Math.round(linearChannelToSrgb(r) * 255);
      data[idx + 1] = Math.round(linearChannelToSrgb(g) * 255);
      data[idx + 2] = Math.round(linearChannelToSrgb(b) * 255);
      data[idx + 3] = 255;
    }
  }
  return { data, width, height };
}
