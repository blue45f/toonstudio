/**
 * 마스터 필터 공용 픽셀 수학 커널 및 색보정·3D LUT 커널 14종(webtoon-mood 8 + cinema-lut 6).
 *
 * 3×3 색변환 행렬, 그림자/미드톤/하이라이트 스플릿 토닝, 비선형 S-커브·필름 토우/숄더,
 * 분리형 가우시안 블러, Sobel 3×3 경사 연산, 결정론적 2D 노이즈/fBm을 순수 TypeScript로 구현한다.
 */

import type { MasterFilterId } from "./master-filter-lut-catalog";

export type ColorLutFilterId = Extract<
  MasterFilterId,
  | "golden-sunset"
  | "dawn-blue-hour"
  | "memory-sepia"
  | "rofan-dreamy-pastel"
  | "neon-cyberpunk"
  | "horror-noir"
  | "sakura-spring-glow"
  | "rainy-mood-tone"
  | "kodak-portra-lut"
  | "fuji-velvia-anime"
  | "teal-orange-cinema"
  | "pastel-ghibli"
  | "silver-monochrome"
  | "cross-process"
>;

export type ColorMatrix3x3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type RgbTriple = readonly [number, number, number];

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function srgbLuma(r01: number, g01: number, b01: number): number {
  return 0.2126 * r01 + 0.7152 * g01 + 0.0722 * b01;
}

/**
 * 결정론적 2D 정수 해시 -> [0, 1).
 */
export function hash2d(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

export function valueNoise2d(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const n00 = hash2d(x0, y0, seed);
  const n10 = hash2d(x0 + 1, y0, seed);
  const n01 = hash2d(x0, y0 + 1, seed);
  const n11 = hash2d(x0 + 1, y0 + 1, seed);

  return lerp(lerp(n00, n10, ux), lerp(n01, n11, ux), uy);
}

export function fbm2d(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += valueNoise2d(x * freq, y * freq, seed + o * 97) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return norm > 0 ? sum / norm : 0.5;
}

export function sampleRgbaClamped(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const cx = Math.min(width - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(height - 1, Math.max(0, Math.round(y)));
  const idx = (cy * width + cx) * 4;
  return [
    src[idx] ?? 0,
    src[idx + 1] ?? 0,
    src[idx + 2] ?? 0,
    src[idx + 3] ?? 255,
  ];
}

export function sampleRgbaBilinear(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  fx: number,
  fy: number,
): readonly [number, number, number, number] {
  const clampedX = Math.min(width - 1, Math.max(0, fx));
  const clampedY = Math.min(height - 1, Math.max(0, fy));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = clampedX - x0;
  const ty = clampedY - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;

  const r = (src[i00] ?? 0) * w00 + (src[i10] ?? 0) * w10 + (src[i01] ?? 0) * w01 + (src[i11] ?? 0) * w11;
  const g =
    (src[i00 + 1] ?? 0) * w00 +
    (src[i10 + 1] ?? 0) * w10 +
    (src[i01 + 1] ?? 0) * w01 +
    (src[i11 + 1] ?? 0) * w11;
  const b =
    (src[i00 + 2] ?? 0) * w00 +
    (src[i10 + 2] ?? 0) * w10 +
    (src[i01 + 2] ?? 0) * w01 +
    (src[i11 + 2] ?? 0) * w11;
  const a =
    (src[i00 + 3] ?? 255) * w00 +
    (src[i10 + 3] ?? 255) * w10 +
    (src[i01 + 3] ?? 255) * w01 +
    (src[i11 + 3] ?? 255) * w11;

  return [r, g, b, a];
}

export function extractLumaBuffer(
  src: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const count = width * height;
  const luma = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const idx = i * 4;
    luma[i] = srgbLuma((src[idx] ?? 0) / 255, (src[idx + 1] ?? 0) / 255, (src[idx + 2] ?? 0) / 255);
  }
  return luma;
}

function buildGaussianWeights(radius: number, sigma: number): Float32Array {
  const safeR = Math.max(1, Math.floor(radius));
  const safeSigma = Math.max(0.4, sigma);
  const weights = new Float32Array(safeR * 2 + 1);
  let sum = 0;
  for (let k = -safeR; k <= safeR; k += 1) {
    const w = Math.exp(-(k * k) / (2 * safeSigma * safeSigma));
    weights[k + safeR] = w;
    sum += w;
  }
  for (let i = 0; i < weights.length; i += 1) {
    weights[i] = (weights[i] ?? 0) / sum;
  }
  return weights;
}

export function separableGaussianBlurFloat(
  src: Float32Array,
  width: number,
  height: number,
  radius: number,
  sigma: number,
): Float32Array {
  const safeR = Math.max(1, Math.floor(radius));
  const weights = buildGaussianWeights(safeR, sigma);
  const temp = new Float32Array(width * height);
  const out = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = -safeR; k <= safeR; k += 1) {
        const sx = Math.min(width - 1, Math.max(0, x + k));
        acc += (src[row + sx] ?? 0) * (weights[k + safeR] ?? 0);
      }
      temp[row + x] = acc;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = -safeR; k <= safeR; k += 1) {
        const sy = Math.min(height - 1, Math.max(0, y + k));
        acc += (temp[sy * width + x] ?? 0) * (weights[k + safeR] ?? 0);
      }
      out[row + x] = acc;
    }
  }

  return out;
}

export function separableGaussianBlurRgb(
  srcRgb: Float32Array,
  width: number,
  height: number,
  radius: number,
  sigma: number,
): Float32Array {
  const safeR = Math.max(1, Math.floor(radius));
  const weights = buildGaussianWeights(safeR, sigma);
  const temp = new Float32Array(width * height * 3);
  const out = new Float32Array(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let ar = 0;
      let ag = 0;
      let ab = 0;
      for (let k = -safeR; k <= safeR; k += 1) {
        const sx = Math.min(width - 1, Math.max(0, x + k));
        const sIdx = (y * width + sx) * 3;
        const w = weights[k + safeR] ?? 0;
        ar += (srcRgb[sIdx] ?? 0) * w;
        ag += (srcRgb[sIdx + 1] ?? 0) * w;
        ab += (srcRgb[sIdx + 2] ?? 0) * w;
      }
      const dIdx = (y * width + x) * 3;
      temp[dIdx] = ar;
      temp[dIdx + 1] = ag;
      temp[dIdx + 2] = ab;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let ar = 0;
      let ag = 0;
      let ab = 0;
      for (let k = -safeR; k <= safeR; k += 1) {
        const sy = Math.min(height - 1, Math.max(0, y + k));
        const sIdx = (sy * width + x) * 3;
        const w = weights[k + safeR] ?? 0;
        ar += (temp[sIdx] ?? 0) * w;
        ag += (temp[sIdx + 1] ?? 0) * w;
        ab += (temp[sIdx + 2] ?? 0) * w;
      }
      const dIdx = (y * width + x) * 3;
      out[dIdx] = ar;
      out[dIdx + 1] = ag;
      out[dIdx + 2] = ab;
    }
  }

  return out;
}

export function computeSobelMagnitude(
  luma: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const mag = new Float32Array(width * height);
  if (width < 2 || height < 2) return mag;

  for (let y = 0; y < height; y += 1) {
    const ym1 = Math.max(0, y - 1);
    const yp1 = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      const xm1 = Math.max(0, x - 1);
      const xp1 = Math.min(width - 1, x + 1);

      const tl = luma[ym1 * width + xm1] ?? 0;
      const tc = luma[ym1 * width + x] ?? 0;
      const tr = luma[ym1 * width + xp1] ?? 0;
      const ml = luma[y * width + xm1] ?? 0;
      const mr = luma[y * width + xp1] ?? 0;
      const bl = luma[yp1 * width + xm1] ?? 0;
      const bc = luma[yp1 * width + x] ?? 0;
      const br = luma[yp1 * width + xp1] ?? 0;

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      mag[y * width + x] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

interface ColorGradeRecipe {
  readonly matrix: ColorMatrix3x3;
  readonly shadowTint: RgbTriple;
  readonly midTint: RgbTriple;
  readonly highlightTint: RgbTriple;
  readonly lift: number;
  readonly gamma: number;
  readonly gain: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly grainAmount: number;
  readonly vignetteAmount: number;
  readonly softBloomAmount: number;
  readonly specialMode?:
    | "sunset-horizon"
    | "horror-crimson"
    | "sakura-petals"
    | "rainy-streaks"
    | "silver-mono"
    | "cross-process";
}

const COLOR_GRADE_RECIPES: Readonly<Record<ColorLutFilterId, ColorGradeRecipe>> = Object.freeze({
  "golden-sunset": {
    matrix: [1.18, 0.06, -0.06, 0.02, 0.86, -0.04, -0.08, 0.0, 0.66],
    shadowTint: [0.1, -0.04, 0.09],
    midTint: [0.18, 0.01, -0.14],
    highlightTint: [0.24, 0.06, -0.22],
    lift: 0.01,
    gamma: 0.96,
    gain: 1.08,
    contrast: 0.18,
    saturation: 1.24,
    grainAmount: 0.018,
    vignetteAmount: 0.18,
    softBloomAmount: 0.22,
    specialMode: "sunset-horizon",
  },
  "dawn-blue-hour": {
    matrix: [0.76, 0.0, 0.1, -0.02, 0.9, 0.12, 0.06, 0.12, 1.24],
    shadowTint: [-0.11, 0.01, 0.22],
    midTint: [-0.08, 0.04, 0.18],
    highlightTint: [-0.02, 0.08, 0.16],
    lift: 0.01,
    gamma: 1.12,
    gain: 0.91,
    contrast: 0.14,
    saturation: 0.92,
    grainAmount: 0.015,
    vignetteAmount: 0.2,
    softBloomAmount: 0.12,
  },
  "memory-sepia": {
    matrix: [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131],
    shadowTint: [0.05, 0.02, -0.02],
    midTint: [0.06, 0.03, -0.04],
    highlightTint: [0.08, 0.05, -0.03],
    lift: 0.05,
    gamma: 1.02,
    gain: 0.97,
    contrast: 0.08,
    saturation: 0.85,
    grainAmount: 0.055,
    vignetteAmount: 0.28,
    softBloomAmount: 0,
  },
  "rofan-dreamy-pastel": {
    matrix: [0.98, 0.04, 0.1, 0.02, 0.94, 0.08, 0.1, 0.06, 1.14],
    shadowTint: [0.11, 0.05, 0.22],
    midTint: [0.08, 0.04, 0.16],
    highlightTint: [0.14, 0.1, 0.16],
    lift: 0.15,
    gamma: 0.84,
    gain: 1.02,
    contrast: -0.22,
    saturation: 0.82,
    grainAmount: 0.01,
    vignetteAmount: 0,
    softBloomAmount: 0.42,
  },
  "neon-cyberpunk": {
    matrix: [1.14, -0.08, 0.16, -0.06, 0.94, 0.12, 0.14, 0.08, 1.18],
    shadowTint: [-0.08, 0.1, 0.16],
    midTint: [0.06, -0.04, 0.12],
    highlightTint: [0.22, -0.06, 0.18],
    lift: -0.03,
    gamma: 0.96,
    gain: 1.08,
    contrast: 0.34,
    saturation: 1.38,
    grainAmount: 0.02,
    vignetteAmount: 0.2,
    softBloomAmount: 0.24,
  },
  "horror-noir": {
    matrix: [0.35, 0.52, 0.13, 0.28, 0.56, 0.16, 0.24, 0.52, 0.24],
    shadowTint: [-0.04, -0.02, 0.02],
    midTint: [-0.03, -0.02, -0.01],
    highlightTint: [0.02, 0.01, 0.01],
    lift: -0.07,
    gamma: 1.18,
    gain: 1.06,
    contrast: 0.42,
    saturation: 0.18,
    grainAmount: 0.06,
    vignetteAmount: 0.44,
    softBloomAmount: 0,
    specialMode: "horror-crimson",
  },
  "sakura-spring-glow": {
    matrix: [1.16, 0.04, 0.02, 0.04, 0.92, 0.0, 0.08, -0.02, 0.92],
    shadowTint: [0.1, -0.01, 0.05],
    midTint: [0.18, 0.01, 0.06],
    highlightTint: [0.24, 0.06, 0.1],
    lift: 0.04,
    gamma: 0.92,
    gain: 1.06,
    contrast: 0.06,
    saturation: 1.2,
    grainAmount: 0.008,
    vignetteAmount: 0,
    softBloomAmount: 0.34,
    specialMode: "sakura-petals",
  },
  "rainy-mood-tone": {
    matrix: [0.8, 0.1, 0.08, 0.04, 0.92, 0.08, 0.06, 0.14, 1.02],
    shadowTint: [-0.08, 0.01, 0.06],
    midTint: [-0.06, 0.02, 0.06],
    highlightTint: [-0.04, 0.02, 0.05],
    lift: 0.02,
    gamma: 1.1,
    gain: 0.89,
    contrast: 0.1,
    saturation: 0.46,
    grainAmount: 0.03,
    vignetteAmount: 0.24,
    softBloomAmount: 0,
    specialMode: "rainy-streaks",
  },
  "kodak-portra-lut": {
    matrix: [1.11, 0.04, -0.03, 0.02, 1.02, -0.02, -0.03, 0.03, 0.94],
    shadowTint: [0.02, 0.02, -0.01],
    midTint: [0.08, 0.04, -0.04],
    highlightTint: [0.1, 0.07, -0.02],
    lift: 0.05,
    gamma: 0.96,
    gain: 1.02,
    contrast: 0.14,
    saturation: 1.06,
    grainAmount: 0.044,
    vignetteAmount: 0.16,
    softBloomAmount: 0,
  },
  "fuji-velvia-anime": {
    matrix: [1.16, -0.08, -0.02, -0.04, 1.14, -0.02, -0.04, 0.04, 1.16],
    shadowTint: [-0.04, 0.01, 0.06],
    midTint: [0.03, 0.05, 0.04],
    highlightTint: [0.05, 0.04, 0.06],
    lift: -0.04,
    gamma: 0.94,
    gain: 1.08,
    contrast: 0.3,
    saturation: 1.46,
    grainAmount: 0.014,
    vignetteAmount: 0.1,
    softBloomAmount: 0.08,
  },
  "teal-orange-cinema": {
    matrix: [1.16, 0.05, -0.12, -0.04, 1.0, 0.04, -0.12, 0.08, 1.1],
    shadowTint: [-0.18, 0.08, 0.16],
    midTint: [0.06, 0.01, -0.05],
    highlightTint: [0.24, 0.09, -0.18],
    lift: -0.01,
    gamma: 1.02,
    gain: 1.06,
    contrast: 0.32,
    saturation: 1.2,
    grainAmount: 0.024,
    vignetteAmount: 0.26,
    softBloomAmount: 0,
  },
  "pastel-ghibli": {
    matrix: [0.98, 0.08, -0.02, 0.02, 1.12, 0.0, 0.0, 0.06, 0.92],
    shadowTint: [0.01, 0.09, 0.06],
    midTint: [0.03, 0.11, -0.04],
    highlightTint: [0.14, 0.12, -0.03],
    lift: 0.04,
    gamma: 0.92,
    gain: 1.04,
    contrast: 0.04,
    saturation: 1.24,
    grainAmount: 0.015,
    vignetteAmount: 0.04,
    softBloomAmount: 0.16,
  },
  "silver-monochrome": {
    matrix: [0.33, 0.53, 0.14, 0.33, 0.53, 0.14, 0.33, 0.53, 0.14],
    shadowTint: [-0.01, 0, 0.01],
    midTint: [0, 0.005, 0.008],
    highlightTint: [0.02, 0.02, 0.025],
    lift: -0.02,
    gamma: 1.02,
    gain: 1.06,
    contrast: 0.32,
    saturation: 0,
    grainAmount: 0.045,
    vignetteAmount: 0.16,
    softBloomAmount: 0,
    specialMode: "silver-mono",
  },
  "cross-process": {
    matrix: [1.08, -0.04, -0.04, 0.02, 1.06, -0.05, -0.04, 0.04, 0.96],
    shadowTint: [-0.06, 0.04, 0.16],
    midTint: [-0.02, 0.07, -0.04],
    highlightTint: [0.14, 0.12, -0.14],
    lift: 0.02,
    gamma: 0.98,
    gain: 1.04,
    contrast: 0.24,
    saturation: 1.2,
    grainAmount: 0.03,
    vignetteAmount: 0.14,
    softBloomAmount: 0,
    specialMode: "cross-process",
  },
});

function applySCurve(v: number, contrast: number): number {
  const c = clamp01(v);
  if (Math.abs(contrast) < 1e-4) return c;
  if (contrast > 0) {
    const smooth = c * c * (3 - 2 * c);
    return lerp(c, smooth, Math.min(1, contrast * 1.4));
  }
  const linear = 0.5 + (c - 0.5) * (1 + contrast * 0.75);
  return clamp01(linear);
}

function applyCrossProcessCurve(r: number, g: number, b: number): RgbTriple {
  const rr = clamp01(Math.pow(clamp01(r), 0.92) + 0.06 * Math.sin(r * Math.PI));
  const gg = clamp01(g * g * (3 - 2 * g) * 0.65 + g * 0.35 + 0.03);
  const bb = clamp01(0.14 + b * 0.74 - 0.05 * b * b);
  return [rr, gg, bb];
}

export function isColorLutFilterId(id: MasterFilterId): id is ColorLutFilterId {
  return id in COLOR_GRADE_RECIPES;
}

export function applyColorLutMasterFilter(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  filterId: ColorLutFilterId,
  seed: number,
): Uint8ClampedArray {
  const recipe = COLOR_GRADE_RECIPES[filterId];
  const out = new Uint8ClampedArray(input.length);
  const pixelCount = width * height;

  let bloomRgb: Float32Array | null = null;
  if (recipe.softBloomAmount > 0 && width >= 2 && height >= 2) {
    const bright = new Float32Array(pixelCount * 3);
    for (let i = 0; i < pixelCount; i += 1) {
      const idx = i * 4;
      const r0 = (input[idx] ?? 0) / 255;
      const g0 = (input[idx + 1] ?? 0) / 255;
      const b0 = (input[idx + 2] ?? 0) / 255;
      const l = srgbLuma(r0, g0, b0);
      const mask = smoothstep(0.55, 0.95, l);
      bright[i * 3] = r0 * mask;
      bright[i * 3 + 1] = g0 * mask;
      bright[i * 3 + 2] = b0 * mask;
    }
    const radius = Math.max(1, Math.min(5, Math.round(Math.min(width, height) * 0.03)));
    bloomRgb = separableGaussianBlurRgb(bright, width, height, radius, radius * 0.65);
  }

  const m = recipe.matrix;
  const invW = 1 / Math.max(1, width - 1);
  const invH = 1 / Math.max(1, height - 1);

  for (let y = 0; y < height; y += 1) {
    const ny = y * invH;
    const dy = ny - 0.5;
    for (let x = 0; x < width; x += 1) {
      const nx = x * invW;
      const dx = nx - 0.5;
      const i = y * width + x;
      const idx = i * 4;

      const r0 = (input[idx] ?? 0) / 255;
      const g0 = (input[idx + 1] ?? 0) / 255;
      const b0 = (input[idx + 2] ?? 0) / 255;
      const a0 = input[idx + 3] ?? 255;

      // 1. 3x3 Color Matrix
      let r = clamp01(r0 * m[0] + g0 * m[1] + b0 * m[2]);
      let g = clamp01(r0 * m[3] + g0 * m[4] + b0 * m[5]);
      let b = clamp01(r0 * m[6] + g0 * m[7] + b0 * m[8]);

      // 2. Lift / Gamma / Gain + S-Curve
      r = applySCurve(Math.pow(clamp01(r * recipe.gain + recipe.lift), recipe.gamma), recipe.contrast);
      g = applySCurve(Math.pow(clamp01(g * recipe.gain + recipe.lift), recipe.gamma), recipe.contrast);
      b = applySCurve(Math.pow(clamp01(b * recipe.gain + recipe.lift), recipe.gamma), recipe.contrast);

      // 3. Saturation
      const luma = srgbLuma(r, g, b);
      r = clamp01(lerp(luma, r, recipe.saturation));
      g = clamp01(lerp(luma, g, recipe.saturation));
      b = clamp01(lerp(luma, b, recipe.saturation));

      // 4. Split-toning (Shadow / Midtone / Highlight)
      const shadowW = (1 - luma) * (1 - luma);
      const highW = luma * luma;
      const midW = 4 * luma * (1 - luma);
      r = clamp01(r + shadowW * recipe.shadowTint[0] + midW * recipe.midTint[0] + highW * recipe.highlightTint[0]);
      g = clamp01(g + shadowW * recipe.shadowTint[1] + midW * recipe.midTint[1] + highW * recipe.highlightTint[1]);
      b = clamp01(b + shadowW * recipe.shadowTint[2] + midW * recipe.midTint[2] + highW * recipe.highlightTint[2]);

      // 5. Special LUT / Webtoon Mood spatial-tonal characteristics
      if (recipe.specialMode === "sunset-horizon") {
        const horizon = smoothstep(0.1, 0.9, 1 - ny);
        r = clamp01(r + horizon * 0.15);
        g = clamp01(g + horizon * 0.01 - (1 - horizon) * 0.04);
        b = clamp01(b - horizon * 0.14);
      } else if (recipe.specialMode === "sakura-petals") {
        const petalWave = Math.sin(nx * 19 + ny * 9 + seed * 0.03) * Math.cos(nx * 7 - ny * 15);
        const petalGlow = smoothstep(0.55, 0.94, petalWave) * smoothstep(0.9, 0.05, ny) * 0.28;
        r = clamp01(r + petalGlow * 1.1);
        g = clamp01(g + petalGlow * 0.56);
        b = clamp01(b + petalGlow * 0.78);
      } else if (recipe.specialMode === "horror-crimson") {
        const redness = clamp01((r0 - Math.max(g0, b0) - 0.14) * 3.2);
        if (redness > 0) {
          r = clamp01(lerp(r, Math.min(1, r0 * 1.12), redness * 0.78));
          g = clamp01(lerp(g, g0 * 0.25, redness * 0.78));
          b = clamp01(lerp(b, b0 * 0.25, redness * 0.78));
        }
      } else if (recipe.specialMode === "rainy-streaks") {
        const diag = Math.floor(x * 0.85 + y * 0.24);
        const streakSeed = hash2d(diag, Math.floor(y * 0.07), seed + 71);
        const streakMask = streakSeed > 0.82 ? (streakSeed - 0.82) / 0.18 : 0;
        const rainLight = streakMask * 0.24;
        r = clamp01(r + rainLight * 0.78);
        g = clamp01(g + rainLight * 0.9);
        b = clamp01(b + rainLight);
      } else if (recipe.specialMode === "silver-mono") {
        const mono = srgbLuma(r, g, b);
        const silver = applySCurve(mono, 0.25);
        r = clamp01(silver * 0.99);
        g = clamp01(silver);
        b = clamp01(silver * 1.02);
      } else if (recipe.specialMode === "cross-process") {
        const [cr, cg, cb] = applyCrossProcessCurve(r, g, b);
        r = cr;
        g = cg;
        b = cb;
      }

      // 6. Soft Dream Bloom composite (Screen)
      if (bloomRgb) {
        const br = (bloomRgb[i * 3] ?? 0) * recipe.softBloomAmount;
        const bg = (bloomRgb[i * 3 + 1] ?? 0) * recipe.softBloomAmount;
        const bb = (bloomRgb[i * 3 + 2] ?? 0) * recipe.softBloomAmount;
        r = clamp01(1 - (1 - r) * (1 - br));
        g = clamp01(1 - (1 - g) * (1 - bg));
        b = clamp01(1 - (1 - b) * (1 - bb));
      }

      // 7. Vignette
      if (recipe.vignetteAmount > 0 && width > 1 && height > 1) {
        const dist2 = dx * dx + dy * dy;
        const falloff = clamp01(1 - dist2 * recipe.vignetteAmount * 2.2);
        r *= falloff;
        g *= falloff;
        b *= falloff;
      }

      // 8. Deterministic Film Grain
      if (recipe.grainAmount > 0) {
        const grain = (hash2d(x, y, seed + 19) - 0.5) * 2 * recipe.grainAmount;
        r = clamp01(r + grain);
        g = clamp01(g + grain);
        b = clamp01(b + grain);
      }

      out[idx] = clampByte(r * 255);
      out[idx + 1] = clampByte(g * 255);
      out[idx + 2] = clampByte(b * 255);
      out[idx + 3] = a0;
    }
  }

  return out;
}
