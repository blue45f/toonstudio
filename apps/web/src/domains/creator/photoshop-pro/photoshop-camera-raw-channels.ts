/**
 * Photoshop Camera Raw(ACR) 색감 보정 엔진 + 3D LUT 보간 + RGB/CMYK/Lab 채널 믹서·분리 +
 * 배치 액션(Actions) 레코더·리플레이어(웹툰 회차 일괄 후보정 프리셋 포함).
 */

import {
  blurFloatFieldSeparable,
  clamp01,
  clampByte,
  hslDegToRgb01,
  labToSrgb01,
  luminance255,
  rgb01ToHslDeg,
  srgb01ToLab,
} from "./photoshop-pixel-math";

import type { RgbaImageBuffer } from "./photoshop-pixel-math";

export type CameraRawHslBandId =
  | "red" | "orange" | "yellow" | "green" | "aqua" | "blue" | "purple" | "magenta";

export interface CameraRawHslBand {
  readonly hue: number; readonly saturation: number; readonly luminance: number;
}

export type CameraRawHslMixer = Readonly<Record<CameraRawHslBandId, CameraRawHslBand>>;
export type PresetLutId = "none" | "webtoon-vivid" | "warm-sunset" | "cool-noir" | "pastel-romance" | "vintage-film";

export interface CameraRawSettings {
  readonly temperature: number; readonly tint: number;
  readonly exposure: number; readonly contrast: number;
  readonly highlights: number; readonly shadows: number;
  readonly whites: number; readonly blacks: number;
  readonly clarity: number; readonly dehaze: number;
  readonly vibrance: number; readonly saturation: number;
  readonly hsl: CameraRawHslMixer;
  readonly vignette: number;
  readonly grainAmount: number; readonly grainSize: number; readonly grainSeed: number;
  readonly lutPresetId: PresetLutId; readonly lutStrength: number;
}

export interface Lut3D { readonly title: string; readonly size: number; readonly table: Float32Array; }
export type ChannelColorSpace = "rgb" | "cmyk" | "lab";

export interface SeparatedChannelPlane {
  readonly id: string; readonly label: string;
  readonly mean01: number; readonly min01: number; readonly max01: number;
  readonly values: Float32Array; readonly previewRgba: Uint8ClampedArray;
}

export interface ChannelSeparationResult {
  readonly colorSpace: ChannelColorSpace; readonly width: number; readonly height: number;
  readonly channels: readonly SeparatedChannelPlane[];
}

export interface ProChannelMixerConfig {
  readonly colorSpace: ChannelColorSpace;
  readonly monochrome: boolean;
  readonly rgbRed: readonly [number, number, number, number];
  readonly rgbGreen: readonly [number, number, number, number];
  readonly rgbBlue: readonly [number, number, number, number];
  readonly cmykShift: readonly [number, number, number, number];
  readonly labAdjust: readonly [number, number, number];
}

export type PhotoshopActionStep =
  | { readonly id: string; readonly label: string; readonly enabled: boolean; readonly kind: "camera-raw"; readonly settings: Partial<CameraRawSettings> }
  | { readonly id: string; readonly label: string; readonly enabled: boolean; readonly kind: "channel-mixer"; readonly config: ProChannelMixerConfig }
  | { readonly id: string; readonly label: string; readonly enabled: boolean; readonly kind: "lut-3d"; readonly presetId: PresetLutId; readonly strength: number };

export interface PhotoshopActionSequence {
  readonly id: string; readonly name: string; readonly description: string;
  readonly steps: readonly PhotoshopActionStep[];
}

export interface BatchActionFrameInput { readonly id: string; readonly label: string; readonly image: RgbaImageBuffer; }
export interface BatchActionFrameResult {
  readonly id: string; readonly label: string; readonly output: RgbaImageBuffer; readonly appliedStepCount: number;
}
export interface ActionRecorderState { readonly recording: boolean; readonly steps: readonly PhotoshopActionStep[]; }

const ZERO_BAND: CameraRawHslBand = Object.freeze({ hue: 0, saturation: 0, luminance: 0 });
export const DEFAULT_CAMERA_RAW_HSL: CameraRawHslMixer = Object.freeze({
  red: ZERO_BAND, orange: ZERO_BAND, yellow: ZERO_BAND, green: ZERO_BAND,
  aqua: ZERO_BAND, blue: ZERO_BAND, purple: ZERO_BAND, magenta: ZERO_BAND,
});

export const DEFAULT_CAMERA_RAW_SETTINGS: CameraRawSettings = Object.freeze({
  temperature: 0, tint: 0, exposure: 0, contrast: 0,
  highlights: 0, shadows: 0, whites: 0, blacks: 0,
  clarity: 0, dehaze: 0, vibrance: 0, saturation: 0,
  hsl: DEFAULT_CAMERA_RAW_HSL, vignette: 0,
  grainAmount: 0, grainSize: 1, grainSeed: 2026,
  lutPresetId: "none", lutStrength: 0.75,
});

export const DEFAULT_PRO_CHANNEL_MIXER: ProChannelMixerConfig = Object.freeze<ProChannelMixerConfig>({
  colorSpace: "rgb", monochrome: false,
  rgbRed: [1, 0, 0, 0], rgbGreen: [0, 1, 0, 0], rgbBlue: [0, 0, 1, 0],
  cmykShift: [0, 0, 0, 0], labAdjust: [0, 1, 1],
});

export const CAMERA_RAW_HSL_BAND_LIST: readonly {
  readonly id: CameraRawHslBandId; readonly label: string; readonly centerDeg: number;
}[] = Object.freeze([
  { id: "red", label: "빨강", centerDeg: 0 }, { id: "orange", label: "주황", centerDeg: 30 },
  { id: "yellow", label: "노랑", centerDeg: 60 }, { id: "green", label: "초록", centerDeg: 120 },
  { id: "aqua", label: "청록", centerDeg: 180 }, { id: "blue", label: "파랑", centerDeg: 240 },
  { id: "purple", label: "보라", centerDeg: 275 }, { id: "magenta", label: "자주", centerDeg: 315 },
]);

export const CAMERA_RAW_PRESETS: readonly {
  readonly id: string; readonly label: string; readonly description: string; readonly patch: Partial<CameraRawSettings>;
}[] = Object.freeze([
  {
    id: "cr-clear-daylight", label: "맑은 웹툰 낮 장면",
    description: "명암과 색을 또렷하고 화사하게 정돈합니다.",
    patch: { exposure: 0.2, contrast: 14, shadows: 22, clarity: 18, vibrance: 20, lutPresetId: "webtoon-vivid", lutStrength: 0.45 },
  },
  {
    id: "cr-golden-sunset", label: "노을 감성 장면",
    description: "따뜻한 오후 햇살과 부드러운 하이라이트를 만듭니다.",
    patch: { temperature: 28, tint: 6, highlights: -18, shadows: 15, vibrance: 16, vignette: -18, lutPresetId: "warm-sunset", lutStrength: 0.65 },
  },
  {
    id: "cr-night-thriller", label: "야간 긴장감 장면",
    description: "차가운 푸른 톤과 깊은 대비, 안개 걷기로 몰입감을 높입니다.",
    patch: { temperature: -30, exposure: -0.35, contrast: 26, dehaze: 22, blacks: -14, vignette: -32, lutPresetId: "cool-noir", lutStrength: 0.6 },
  },
  {
    id: "cr-pastel-romance", label: "로맨스 파스텔 장면",
    description: "어두운 곳을 포근하게 들어 올리고 파스텔 톤으로 감쌉니다.",
    patch: { temperature: 10, tint: 10, contrast: -12, shadows: 30, whites: -10, clarity: -10, lutPresetId: "pastel-romance", lutStrength: 0.7 },
  },
]);

// ---------------------------------------------------------------------------
// 1. 3D LUT (.cube 파서 · 프리셋 생성기 · 삼선형 보간)
// ---------------------------------------------------------------------------

export function parseCubeLut(cubeText: string): Lut3D {
  let title = "사용자 색감표", size = 0;
  const triples: number[] = [];
  for (const raw of cubeText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("TITLE")) { title = line.replace(/^TITLE\s*/, "").replace(/^"|"$/g, "") || title; continue; }
    if (line.startsWith("LUT_3D_SIZE")) { size = Number.parseInt(line.split(/\s+/)[1] ?? "0", 10); continue; }
    if (/^[A-Z_]+/.test(line)) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const r = Number(parts[0]), g = Number(parts[1]), b = Number(parts[2]);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) triples.push(clamp01(r), clamp01(g), clamp01(b));
    }
  }
  if (size < 2 || triples.length < size * size * size * 3) throw new Error("유효한 3D LUT(.cube) 형식이 아닙니다.");
  return { title, size, table: new Float32Array(triples.slice(0, size * size * size * 3)) };
}

export function createPresetLut3D(presetId: PresetLutId, size = 9): Lut3D {
  const n = Math.max(2, Math.min(33, Math.round(size))), inv = 1 / (n - 1);
  const table = new Float32Array(n * n * n * 3);
  for (let bi = 0; bi < n; bi += 1) {
    const b = bi * inv;
    for (let gi = 0; gi < n; gi += 1) {
      const g = gi * inv;
      for (let ri = 0; ri < n; ri += 1) {
        const r = ri * inv, luma = luminance255(r, g, b);
        let or = r, og = g, ob = b;
        if (presetId === "webtoon-vivid") {
          or = clamp01(luma + (r - luma) * 1.18 + 0.02 * (1 - luma));
          og = clamp01(luma + (g - luma) * 1.15 + 0.015 * (1 - luma));
          ob = clamp01(luma + (b - luma) * 1.2);
        } else if (presetId === "warm-sunset") {
          or = clamp01(Math.pow(r, 0.92) + 0.05 * luma);
          og = clamp01(g * 0.98 + 0.02 * luma);
          ob = clamp01(b * 0.86 + 0.04 * (1 - luma));
        } else if (presetId === "cool-noir") {
          const s = (v: number): number => clamp01(v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) ** 2);
          or = clamp01(s(r) * 0.88); og = clamp01(s(g) * 0.95); ob = clamp01(s(b) * 1.08 + 0.04 * (1 - luma));
        } else if (presetId === "pastel-romance") {
          or = clamp01(0.08 + r * 0.88 + 0.04 * (1 - luma));
          og = clamp01(0.06 + g * 0.88 + 0.02 * (1 - luma));
          ob = clamp01(0.09 + b * 0.86 + 0.03 * (1 - luma));
        } else if (presetId === "vintage-film") {
          or = clamp01(0.05 + r * 0.9 + g * 0.06);
          og = clamp01(0.04 + g * 0.88 + r * 0.03);
          ob = clamp01(0.06 + b * 0.76 + luma * 0.1);
        }
        const idx = (bi * n * n + gi * n + ri) * 3;
        table[idx] = or; table[idx + 1] = og; table[idx + 2] = ob;
      }
    }
  }
  return { title: presetId, size: n, table };
}

function sampleLut3DTrilinear(lut: Lut3D, r01: number, g01: number, b01: number): [number, number, number] {
  const n = lut.size, maxIdx = n - 1;
  const rx = clamp01(r01) * maxIdx, gx = clamp01(g01) * maxIdx, bx = clamp01(b01) * maxIdx;
  const r0 = Math.floor(rx), g0 = Math.floor(gx), b0 = Math.floor(bx);
  const r1 = Math.min(maxIdx, r0 + 1), g1 = Math.min(maxIdx, g0 + 1), b1 = Math.min(maxIdx, b0 + 1);
  const fr = rx - r0, fg = gx - g0, fb = bx - b0;
  const at = (ri: number, gi: number, bi: number, ch: number): number => lut.table[(bi * n * n + gi * n + ri) * 3 + ch] ?? 0;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const c0 = (at(r0, g0, b0, c) * (1 - fr) + at(r1, g0, b0, c) * fr) * (1 - fg) +
      (at(r0, g1, b0, c) * (1 - fr) + at(r1, g1, b0, c) * fr) * fg;
    const c1 = (at(r0, g0, b1, c) * (1 - fr) + at(r1, g0, b1, c) * fr) * (1 - fg) +
      (at(r0, g1, b1, c) * (1 - fr) + at(r1, g1, b1, c) * fr) * fg;
    out[c] = clamp01(c0 * (1 - fb) + c1 * fb);
  }
  return out;
}

export function applyLut3DToRgba(source: RgbaImageBuffer, lut: Lut3D, strength01 = 1): RgbaImageBuffer {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data), s = clamp01(strength01);
  if (s <= 1e-4) return { width, height, data: out };
  for (let i = 0; i < width * height; i += 1) {
    const off = i * 4, r = (data[off] ?? 0) / 255, g = (data[off + 1] ?? 0) / 255, b = (data[off + 2] ?? 0) / 255;
    const [lr, lg, lb] = sampleLut3DTrilinear(lut, r, g, b);
    out[off] = clampByte((r * (1 - s) + lr * s) * 255);
    out[off + 1] = clampByte((g * (1 - s) + lg * s) * 255);
    out[off + 2] = clampByte((b * (1 - s) + lb * s) * 255);
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------------------
// 2. Camera Raw (ACR) 색감 보정 엔진
// ---------------------------------------------------------------------------

export function applyCameraRawRgba(
  source: RgbaImageBuffer, rawSettings: Partial<CameraRawSettings>, customLut?: Lut3D,
): RgbaImageBuffer {
  const settings: CameraRawSettings = {
    ...DEFAULT_CAMERA_RAW_SETTINGS, ...rawSettings,
    hsl: { ...DEFAULT_CAMERA_RAW_HSL, ...(rawSettings.hsl ?? {}) },
  };
  const { width, height, data } = source, total = width * height;

  let clarityDelta: Float32Array | null = null;
  if (Math.abs(settings.clarity) > 0.5) {
    const luma = new Float32Array(total);
    for (let i = 0; i < total; i += 1) luma[i] = luminance255(data[i * 4] ?? 0, data[i * 4 + 1] ?? 0, data[i * 4 + 2] ?? 0) / 255;
    const low = blurFloatFieldSeparable(luma, width, height, 3);
    clarityDelta = new Float32Array(total);
    const strength = (settings.clarity / 100) * 1.4;
    for (let i = 0; i < total; i += 1) {
      const l = luma[i] ?? 0;
      clarityDelta[i] = (l - (low[i] ?? l)) * strength * (4 * l * (1 - l));
    }
  }

  const expGain = Math.pow(2, Math.max(-5, Math.min(5, settings.exposure)));
  const temp = Math.max(-100, Math.min(100, settings.temperature)) / 100;
  const tint = Math.max(-100, Math.min(100, settings.tint)) / 100;
  const contrast = Math.max(-100, Math.min(100, settings.contrast)) / 100;
  const highlights = Math.max(-100, Math.min(100, settings.highlights)) / 100;
  const shadows = Math.max(-100, Math.min(100, settings.shadows)) / 100;
  const whites = Math.max(-100, Math.min(100, settings.whites)) / 100;
  const blacks = Math.max(-100, Math.min(100, settings.blacks)) / 100;
  const dehaze = Math.max(-100, Math.min(100, settings.dehaze)) / 100;
  const vibrance = Math.max(-100, Math.min(100, settings.vibrance)) / 100;
  const saturation = Math.max(-100, Math.min(100, settings.saturation)) / 100;
  const vignette = Math.max(-100, Math.min(100, settings.vignette)) / 100;
  const grainAmount = Math.max(0, Math.min(100, settings.grainAmount)) / 100;
  const grainSize = Math.max(1, Math.min(4, Math.round(settings.grainSize)));
  const useHsl = CAMERA_RAW_HSL_BAND_LIST.some((b) => {
    const band = settings.hsl[b.id];
    return band.hue !== 0 || band.saturation !== 0 || band.luminance !== 0;
  });
  const lut = customLut ?? (settings.lutPresetId !== "none" && settings.lutStrength > 0 ? createPresetLut3D(settings.lutPresetId, 9) : null);
  const lutStrength = clamp01(settings.lutStrength);

  const out = new Uint8ClampedArray(data.length);
  const halfW = Math.max(1, (width - 1) * 0.5), halfH = Math.max(1, (height - 1) * 0.5);

  for (let y = 0; y < height; y += 1) {
    const ny = (y - halfH) / halfH;
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x, off = p * 4;
      let r = (data[off] ?? 0) / 255, g = (data[off + 1] ?? 0) / 255, b = (data[off + 2] ?? 0) / 255;

      if (temp !== 0 || tint !== 0) {
        r = clamp01(r * (1 + temp * 0.28 + tint * 0.12));
        g = clamp01(g * (1 - tint * 0.2));
        b = clamp01(b * (1 - temp * 0.28 + tint * 0.12));
      }
      if (settings.exposure !== 0) { r = clamp01(r * expGain); g = clamp01(g * expGain); b = clamp01(b * expGain); }
      if (dehaze !== 0) {
        const veil = dehaze * 0.22 * (1 - Math.min(r, g, b) * 0.35);
        const scale = dehaze > 0 ? 1 / Math.max(0.5, 1 - dehaze * 0.24) : 1 + dehaze * 0.2;
        r = clamp01((r - veil) * scale); g = clamp01((g - veil) * scale); b = clamp01((b - veil) * scale);
      }

      const luma = luminance255(r, g, b);
      const toneShift = shadows * (1 - luma) ** 2 * 0.42 + highlights * luma ** 2 * 0.38
        + blacks * (1 - luma) ** 3 * 0.3 + whites * luma ** 3 * 0.28 + (clarityDelta ? clarityDelta[p] ?? 0 : 0);
      r = clamp01(r + toneShift); g = clamp01(g + toneShift); b = clamp01(b + toneShift);

      if (contrast !== 0) {
        const cGain = 1 + contrast * 0.75;
        r = clamp01((r - 0.5) * cGain + 0.5); g = clamp01((g - 0.5) * cGain + 0.5); b = clamp01((b - 0.5) * cGain + 0.5);
      }
      if (vibrance !== 0 || saturation !== 0) {
        const curSat = Math.max(r, g, b) - Math.min(r, g, b), avg = (r + g + b) / 3;
        const totalSat = Math.max(-1, saturation + vibrance * (1 - curSat) * (r > g && g > b ? 0.6 : 1) * 0.85);
        r = clamp01(avg + (r - avg) * (1 + totalSat));
        g = clamp01(avg + (g - avg) * (1 + totalSat));
        b = clamp01(avg + (b - avg) * (1 + totalSat));
      }
      if (useHsl) {
        const [h, s, l] = rgb01ToHslDeg(r, g, b);
        if (s > 0.02) {
          let dh = 0, ds = 0, dl = 0;
          for (const band of CAMERA_RAW_HSL_BAND_LIST) {
            const dist = Math.min(Math.abs(h - band.centerDeg), 360 - Math.abs(h - band.centerDeg));
            if (dist >= 45) continue;
            const w = 0.5 * (1 + Math.cos((dist / 45) * Math.PI)), adj = settings.hsl[band.id];
            dh += (adj.hue / 100) * 30 * w; ds += (adj.saturation / 100) * 0.75 * w; dl += (adj.luminance / 100) * 0.35 * w;
          }
          [r, g, b] = hslDegToRgb01(h + dh, clamp01(s * (1 + ds)), clamp01(l + dl));
        }
      }
      if (lut && lutStrength > 0) {
        const [lr, lg, lb] = sampleLut3DTrilinear(lut, r, g, b);
        r = r * (1 - lutStrength) + lr * lutStrength;
        g = g * (1 - lutStrength) + lg * lutStrength;
        b = b * (1 - lutStrength) + lb * lutStrength;
      }
      if (vignette !== 0) {
        const nx = (x - halfW) / halfW;
        const factor = Math.max(0.15, 1 + vignette * clamp01((nx * nx + ny * ny - 0.35) / 1.45) * 0.85);
        r = clamp01(r * factor); g = clamp01(g * factor); b = clamp01(b * factor);
      }
      if (grainAmount > 0) {
        let hash = Math.imul((Math.floor(y / grainSize) * 73856093) ^ (Math.floor(x / grainSize) * 19349663) ^ settings.grainSeed, 0x27d4eb2d);
        hash = (hash ^ (hash >>> 15)) * 0x85ebca6b;
        const n = (((hash >>> 0) / 0xffffffff) * 2 - 1) * grainAmount * 0.22;
        r = clamp01(r + n); g = clamp01(g + n); b = clamp01(b + n);
      }
      out[off] = clampByte(r * 255); out[off + 1] = clampByte(g * 255);
      out[off + 2] = clampByte(b * 255); out[off + 3] = data[off + 3] ?? 255;
    }
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------------------
// 3. RGB / CMYK / CIE Lab 채널 분리 및 프로 채널 믹서
// ---------------------------------------------------------------------------

function srgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const k = 1 - Math.max(r, g, b);
  if (k >= 0.9999) return [0, 0, 0, 1];
  const inv = 1 / (1 - k);
  return [(1 - r - k) * inv, (1 - g - k) * inv, (1 - b - k) * inv, k];
}

function cmykToSrgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const omk = 1 - clamp01(k);
  return [clamp01((1 - clamp01(c)) * omk), clamp01((1 - clamp01(m)) * omk), clamp01((1 - clamp01(y)) * omk)];
}

function buildChannelPlane(id: string, label: string, values: Float32Array): SeparatedChannelPlane {
  const previewRgba = new Uint8ClampedArray(values.length * 4);
  let sum = 0, min = 1, max = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = clamp01(values[i] ?? 0);
    sum += v; if (v < min) min = v; if (v > max) max = v;
    const byte = clampByte(v * 255), off = i * 4;
    previewRgba[off] = byte; previewRgba[off + 1] = byte; previewRgba[off + 2] = byte; previewRgba[off + 3] = 255;
  }
  return { id, label, mean01: values.length ? sum / values.length : 0, min01: values.length ? min : 0, max01: values.length ? max : 0, values, previewRgba };
}

export function separateColorChannels(source: RgbaImageBuffer, colorSpace: ChannelColorSpace): ChannelSeparationResult {
  const { width, height, data } = source, total = width * height;
  if (colorSpace === "cmyk") {
    const cA = new Float32Array(total), mA = new Float32Array(total), yA = new Float32Array(total), kA = new Float32Array(total);
    for (let i = 0; i < total; i += 1) {
      const [c, m, y, k] = srgbToCmyk((data[i * 4] ?? 0) / 255, (data[i * 4 + 1] ?? 0) / 255, (data[i * 4 + 2] ?? 0) / 255);
      cA[i] = c; mA[i] = m; yA[i] = y; kA[i] = k;
    }
    return {
      colorSpace, width, height,
      channels: [
        buildChannelPlane("c", "청록 잉크", cA), buildChannelPlane("m", "자주 잉크", mA),
        buildChannelPlane("y", "노랑 잉크", yA), buildChannelPlane("k", "먹색 잉크", kA),
      ],
    };
  }
  if (colorSpace === "lab") {
    const lA = new Float32Array(total), aA = new Float32Array(total), bA = new Float32Array(total);
    for (let i = 0; i < total; i += 1) {
      const [L, A, B] = srgb01ToLab((data[i * 4] ?? 0) / 255, (data[i * 4 + 1] ?? 0) / 255, (data[i * 4 + 2] ?? 0) / 255);
      lA[i] = clamp01(L / 100); aA[i] = clamp01((A + 128) / 255); bA[i] = clamp01((B + 128) / 255);
    }
    return {
      colorSpace, width, height,
      channels: [
        buildChannelPlane("l", "밝기 축", lA), buildChannelPlane("a", "초록·빨강 축", aA), buildChannelPlane("b", "파랑·노랑 축", bA),
      ],
    };
  }
  const rA = new Float32Array(total), gA = new Float32Array(total), bA = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    rA[i] = (data[i * 4] ?? 0) / 255; gA[i] = (data[i * 4 + 1] ?? 0) / 255; bA[i] = (data[i * 4 + 2] ?? 0) / 255;
  }
  return {
    colorSpace: "rgb", width, height,
    channels: [buildChannelPlane("r", "빨강 빛", rA), buildChannelPlane("g", "초록 빛", gA), buildChannelPlane("b", "파랑 빛", bA)],
  };
}

export function applyProChannelMixer(source: RgbaImageBuffer, config: ProChannelMixerConfig): RgbaImageBuffer {
  const { width, height, data } = source, out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < width * height; i += 1) {
    const off = i * 4, r = (data[off] ?? 0) / 255, g = (data[off + 1] ?? 0) / 255, b = (data[off + 2] ?? 0) / 255;
    let nr: number, ng: number, nb: number;
    if (config.colorSpace === "cmyk") {
      const [c, m, y, k] = srgbToCmyk(r, g, b);
      const [sc, sm, sy, sk] = config.cmykShift;
      [nr, ng, nb] = cmykToSrgb(clamp01(c + sc / 100), clamp01(m + sm / 100), clamp01(y + sy / 100), clamp01(k + sk / 100));
    } else if (config.colorSpace === "lab") {
      const [L, A, B] = srgb01ToLab(r, g, b);
      const [lShift, aScale, bScale] = config.labAdjust;
      [nr, ng, nb] = labToSrgb01(Math.max(0, Math.min(100, L + lShift)), A * aScale, B * bScale);
    } else {
      const rr = clamp01(r * config.rgbRed[0] + g * config.rgbRed[1] + b * config.rgbRed[2] + config.rgbRed[3]);
      if (config.monochrome) { nr = rr; ng = rr; nb = rr; }
      else {
        nr = rr;
        ng = clamp01(r * config.rgbGreen[0] + g * config.rgbGreen[1] + b * config.rgbGreen[2] + config.rgbGreen[3]);
        nb = clamp01(r * config.rgbBlue[0] + g * config.rgbBlue[1] + b * config.rgbBlue[2] + config.rgbBlue[3]);
      }
    }
    out[off] = clampByte(nr * 255); out[off + 1] = clampByte(ng * 255);
    out[off + 2] = clampByte(nb * 255); out[off + 3] = data[off + 3] ?? 255;
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------------------
// 4. 배치 액션(Actions) 레코더·리플레이어 & 웹툰 회차 일괄 후보정 프리셋
// ---------------------------------------------------------------------------

export function createActionRecorder(): ActionRecorderState { return { recording: true, steps: [] }; }

export function recordActionStep(recorder: ActionRecorderState, step: PhotoshopActionStep): ActionRecorderState {
  return recorder.recording ? { ...recorder, steps: [...recorder.steps, step] } : recorder;
}

export function finalizeActionSequence(
  recorder: ActionRecorderState, meta: { readonly id: string; readonly name: string; readonly description: string },
): PhotoshopActionSequence {
  return { id: meta.id, name: meta.name, description: meta.description, steps: [...recorder.steps] };
}

export function replayActionSequence(
  source: RgbaImageBuffer, sequence: PhotoshopActionSequence,
): { readonly output: RgbaImageBuffer; readonly appliedStepCount: number } {
  let current: RgbaImageBuffer = { width: source.width, height: source.height, data: new Uint8ClampedArray(source.data) };
  let appliedStepCount = 0;
  for (const step of sequence.steps) {
    if (!step.enabled) continue;
    if (step.kind === "camera-raw") current = applyCameraRawRgba(current, step.settings);
    else if (step.kind === "channel-mixer") current = applyProChannelMixer(current, step.config);
    else if (step.kind === "lut-3d") current = applyLut3DToRgba(current, createPresetLut3D(step.presetId, 9), step.strength);
    appliedStepCount += 1;
  }
  return { output: current, appliedStepCount };
}

export function runBatchActionOnFrames(
  frames: readonly BatchActionFrameInput[], sequence: PhotoshopActionSequence,
): readonly BatchActionFrameResult[] {
  return frames.map((frame) => {
    const { output, appliedStepCount } = replayActionSequence(frame.image, sequence);
    return { id: frame.id, label: frame.label, output, appliedStepCount };
  });
}

export const WEBTOON_BATCH_ACTION_PRESETS: readonly PhotoshopActionSequence[] = Object.freeze([
  {
    id: "webtoon-episode-finish", name: "웹툰 회차 기본 마감",
    description: "회차 전체 컷의 밝기·명료도·활기를 통일해 출고 직전 색감을 깔끔하게 맞춥니다.",
    steps: [
      { id: "ep-1", label: "기본 톤·명료도 정리", enabled: true, kind: "camera-raw", settings: { exposure: 0.15, contrast: 12, shadows: 18, clarity: 16, vibrance: 18 } },
      { id: "ep-2", label: "웹툰 선명 색감 입히기", enabled: true, kind: "lut-3d", presetId: "webtoon-vivid", strength: 0.35 },
    ],
  },
  {
    id: "webtoon-night-drama", name: "야간·긴장감 회차 일괄 보정",
    description: "밤 장면 컷들에 차분한 푸른 분위기와 깊은 그림자 대비를 한 번에 입힙니다.",
    steps: [
      { id: "ng-1", label: "야간 색온도·비네팅", enabled: true, kind: "camera-raw", settings: { temperature: -26, exposure: -0.25, contrast: 22, dehaze: 18, vignette: -25 } },
      { id: "ng-2", label: "야간 블루 톤 마무리", enabled: true, kind: "lut-3d", presetId: "cool-noir", strength: 0.55 },
    ],
  },
  {
    id: "webtoon-romance-glow", name: "로맨스 파스텔 일괄 보정",
    description: "화사하고 부드러운 파스텔 톤과 따뜻한 피부색 균형을 회차 전체에 적용합니다.",
    steps: [
      { id: "rm-1", label: "포근한 밝기·색온도", enabled: true, kind: "camera-raw", settings: { temperature: 14, tint: 8, shadows: 28, contrast: -8, vibrance: 14 } },
      { id: "rm-2", label: "파스텔 색감 입히기", enabled: true, kind: "lut-3d", presetId: "pastel-romance", strength: 0.6 },
    ],
  },
  {
    id: "webtoon-flashback-film", name: "회상 장면 필름 일괄 보정",
    description: "과거 회상 컷에 따뜻한 필름 색감과 은은한 입자, 주변부 음영을 더합니다.",
    steps: [
      { id: "fb-1", label: "필름 입자·비네팅", enabled: true, kind: "camera-raw", settings: { temperature: 20, saturation: -18, vignette: -28, grainAmount: 24, grainSize: 2 } },
      { id: "fb-2", label: "빈티지 필름 색감", enabled: true, kind: "lut-3d", presetId: "vintage-film", strength: 0.65 },
    ],
  },
]);
