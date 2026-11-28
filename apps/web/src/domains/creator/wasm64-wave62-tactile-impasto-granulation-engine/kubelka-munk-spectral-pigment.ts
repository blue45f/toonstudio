/**
 * Kubelka-Munk 7밴드 광학 안료 혼색, 선형/sRGB 색공간 변환 및 결정론적 종이 섬유 높이장 생성기.
 *
 * Smits(1999) 비음수 7원색 스펙트럼 분해와 Kubelka-Munk `(K/S)` 감산 혼색,
 * 그리고 잔차 보존 항을 결합해 파랑+노랑 혼색 시 탁한 회색이 아닌 선명한 자연 녹색을 재현하면서
 * 동일 색상 혼합 및 양 끝점(`0`, `1`)에서 왕복 항등성(`mix(c, c, t) === c`)을 보장한다.
 */

export type LinearRgbTuple = readonly [number, number, number];
export type LinearRgbaTuple = readonly [number, number, number, number];
export type SrgbTuple = readonly [number, number, number];
export type SpectralReflectance7 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type PaperToothProfileId =
  | "cold-press-watercolor"
  | "hot-press-smooth"
  | "laid-charcoal"
  | "linen-canvas"
  | "comic-bristol";

export interface KubelkaMunkMixOptions {
  readonly pigmentStrengthA?: number;
  readonly pigmentStrengthB?: number;
}

/** 따뜻한 면지(아카이벌 크림 종이) 기본 선형 RGB 배경 */
export const DEFAULT_PAPER_BACKGROUND_LINEAR_RGB: LinearRgbTuple = [0.94, 0.915, 0.855];

// 7개 가시광 대역 [415nm 보라, 455nm 파랑, 505nm 청록, 545nm 녹색, 585nm 황주황, 625nm 주홍, 670nm 심적]
const BASIS_WHITE: SpectralReflectance7 = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
const BASIS_CYAN: SpectralReflectance7 = [0.6, 0.92, 0.96, 0.86, 0.16, 0.02, 0.01];
const BASIS_MAGENTA: SpectralReflectance7 = [0.85, 0.52, 0.06, 0.03, 0.14, 0.86, 0.95];
const BASIS_YELLOW: SpectralReflectance7 = [0.008, 0.012, 0.34, 0.92, 0.97, 0.96, 0.94];
const BASIS_RED: SpectralReflectance7 = [0.22, 0.02, 0.01, 0.015, 0.36, 0.94, 0.98];
const BASIS_GREEN: SpectralReflectance7 = [0.01, 0.04, 0.62, 0.94, 0.58, 0.04, 0.01];
const BASIS_BLUE: SpectralReflectance7 = [0.86, 0.96, 0.44, 0.24, 0.02, 0.01, 0.01];

// 7밴드 스펙트럼 반사율 → D65 정규화 선형 sRGB 투영 행렬 (각 행 합 = 1.0)
const SPECTRAL_TO_LINEAR_RGB_MATRIX: readonly [
  SpectralReflectance7,
  SpectralReflectance7,
  SpectralReflectance7,
] = [
  [0.1, -0.04, -0.1, -0.06, 0.24, 0.46, 0.4],
  [-0.08, -0.08, 0.34, 0.58, 0.34, -0.06, -0.04],
  [0.42, 0.56, 0.14, -0.08, -0.04, 0.0, 0.0],
];

const MIN_REFLECTANCE = 0.001;
const MAX_REFLECTANCE = 0.9995;

export function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

export function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= min) return min;
  return value >= max ? max : value;
}

export function srgbToLinearChannel(channel: number): number {
  const c = clamp01(channel);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgbChannel(channel: number): number {
  const c = clamp01(channel);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function srgbToLinearRgb(srgb: SrgbTuple): LinearRgbTuple {
  return [srgbToLinearChannel(srgb[0]), srgbToLinearChannel(srgb[1]), srgbToLinearChannel(srgb[2])];
}

export function linearToSrgbRgb(linear: LinearRgbTuple): SrgbTuple {
  return [linearToSrgbChannel(linear[0]), linearToSrgbChannel(linear[1]), linearToSrgbChannel(linear[2])];
}

/** Kubelka-Munk 반사율 `R` → 흡수/산란 비율 `K/S = (1 - R)^2 / (2R)`. */
export function reflectanceToKubelkaMunkKS(reflectance: number): number {
  const r = clampRange(reflectance, MIN_REFLECTANCE, MAX_REFLECTANCE);
  const oneMinusR = 1 - r;
  return (oneMinusR * oneMinusR) / (2 * r);
}

/** Kubelka-Munk `K/S` → 불투명 후막 반사율 `R = 1 + (K/S) - sqrt((K/S)^2 + 2(K/S))`. */
export function kubelkaMunkKSToReflectance(ks: number): number {
  const safeKs = Math.max(0, Number.isFinite(ks) ? ks : 0);
  return clamp01(1 + safeKs - Math.sqrt(safeKs * safeKs + 2 * safeKs));
}

/** Smits(1999) 비음수 7원색 기저 분해로 선형 RGB를 7밴드 물리 반사 스펙트럼으로 변환한다. */
export function linearRgbToSpectralReflectance(rgb: LinearRgbTuple): SpectralReflectance7 {
  const r = clamp01(rgb[0]);
  const g = clamp01(rgb[1]);
  const b = clamp01(rgb[2]);
  const out = [0, 0, 0, 0, 0, 0, 0];

  if (r <= g && r <= b) {
    for (let k = 0; k < 7; k += 1) {
      out[k] = r * BASIS_WHITE[k] + (g <= b
        ? (g - r) * BASIS_CYAN[k] + (b - g) * BASIS_BLUE[k]
        : (b - r) * BASIS_CYAN[k] + (g - b) * BASIS_GREEN[k]);
    }
  } else if (g <= r && g <= b) {
    for (let k = 0; k < 7; k += 1) {
      out[k] = g * BASIS_WHITE[k] + (r <= b
        ? (r - g) * BASIS_MAGENTA[k] + (b - r) * BASIS_BLUE[k]
        : (b - g) * BASIS_MAGENTA[k] + (r - b) * BASIS_RED[k]);
    }
  } else {
    for (let k = 0; k < 7; k += 1) {
      out[k] = b * BASIS_WHITE[k] + (r <= g
        ? (r - b) * BASIS_YELLOW[k] + (g - r) * BASIS_GREEN[k]
        : (g - b) * BASIS_YELLOW[k] + (r - g) * BASIS_RED[k]);
    }
  }

  return [
    clampRange(out[0], MIN_REFLECTANCE, MAX_REFLECTANCE),
    clampRange(out[1], MIN_REFLECTANCE, MAX_REFLECTANCE),
    clampRange(out[2], MIN_REFLECTANCE, MAX_REFLECTANCE),
    clampRange(out[3], MIN_REFLECTANCE, MAX_REFLECTANCE),
    clampRange(out[4], MIN_REFLECTANCE, MAX_REFLECTANCE),
    clampRange(out[5], MIN_REFLECTANCE, MAX_REFLECTANCE),
    clampRange(out[6], MIN_REFLECTANCE, MAX_REFLECTANCE),
  ];
}

function projectSpectrumToLinearRgbUnclamped(
  spectrum: SpectralReflectance7,
): readonly [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  const [rowR, rowG, rowB] = SPECTRAL_TO_LINEAR_RGB_MATRIX;
  for (let k = 0; k < 7; k += 1) {
    const s = spectrum[k];
    r += rowR[k] * s;
    g += rowG[k] * s;
    b += rowB[k] * s;
  }
  return [r, g, b];
}

export function spectralReflectanceToLinearRgb(spectrum: SpectralReflectance7): LinearRgbTuple {
  const [r, g, b] = projectSpectrumToLinearRgbUnclamped(spectrum);
  return [clamp01(r), clamp01(g), clamp01(b)];
}

/**
 * Kubelka-Munk 기반 광학 안료 혼색.
 * 파랑+노랑 혼색 시 505~545nm 녹색 대역이 보존되어 자연스러운 녹색을 생성하며,
 * 잔차 보간으로 단일 색상의 왕복 항등성을 보장한다.
 */
export function mixPigmentsKubelkaMunk(
  colorA: LinearRgbTuple,
  colorB: LinearRgbTuple,
  ratioB: number,
  options: KubelkaMunkMixOptions = {},
): LinearRgbTuple {
  const rawT = clamp01(ratioB);
  if (rawT <= 0) return [clamp01(colorA[0]), clamp01(colorA[1]), clamp01(colorA[2])];
  if (rawT >= 1) return [clamp01(colorB[0]), clamp01(colorB[1]), clamp01(colorB[2])];

  const strengthA = Math.max(0.05, options.pigmentStrengthA ?? 1);
  const strengthB = Math.max(0.05, options.pigmentStrengthB ?? 1);
  const weightA = (1 - rawT) * strengthA;
  const weightB = rawT * strengthB;
  const t = weightA + weightB > 0 ? weightB / (weightA + weightB) : rawT;
  const invT = 1 - t;

  const specA = linearRgbToSpectralReflectance(colorA);
  const specB = linearRgbToSpectralReflectance(colorB);
  const projA = projectSpectrumToLinearRgbUnclamped(specA);
  const projB = projectSpectrumToLinearRgbUnclamped(specB);

  const mixedSpec: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 7; k += 1) {
    mixedSpec[k] = kubelkaMunkKSToReflectance(
      invT * reflectanceToKubelkaMunkKS(specA[k]) + t * reflectanceToKubelkaMunkKS(specB[k]),
    );
  }

  const mixedProj = projectSpectrumToLinearRgbUnclamped(mixedSpec);
  const resR = invT * (clamp01(colorA[0]) - projA[0]) + t * (clamp01(colorB[0]) - projB[0]);
  const resG = invT * (clamp01(colorA[1]) - projA[1]) + t * (clamp01(colorB[1]) - projB[1]);
  const resB = invT * (clamp01(colorA[2]) - projA[2]) + t * (clamp01(colorB[2]) - projB[2]);
  return [clamp01(mixedProj[0] + resR), clamp01(mixedProj[1] + resG), clamp01(mixedProj[2] + resB)];
}

/** 대조 검증용 단순 sRGB 선형 보간(디지털 회색화 비교 기준선). */
export function mixColorsSrgbNaive(srgbA: SrgbTuple, srgbB: SrgbTuple, ratioB: number): SrgbTuple {
  const t = clamp01(ratioB);
  const invT = 1 - t;
  return [
    clamp01(invT * srgbA[0] + t * srgbB[0]),
    clamp01(invT * srgbA[1] + t * srgbB[1]),
    clamp01(invT * srgbA[2] + t * srgbB[2]),
  ];
}

function hash2D(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function sampleValueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const ux = x - x0;
  const uy = y - y0;
  const fx = ux * ux * (3 - 2 * ux);
  const fy = uy * uy * (3 - 2 * uy);
  const top = hash2D(x0, y0, seed) + (hash2D(x0 + 1, y0, seed) - hash2D(x0, y0, seed)) * fx;
  const bot =
    hash2D(x0, y0 + 1, seed) + (hash2D(x0 + 1, y0 + 1, seed) - hash2D(x0, y0 + 1, seed)) * fx;
  return top + (bot - top) * fy;
}

function sampleFbm2D(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * sampleValueNoise2D(x * freq, y * freq, seed + o * 97);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return norm > 0 ? sum / norm : 0.5;
}

/**
 * 결정론적 멀티-옥타브 종이 섬유 미세 높이장(`paperToothF32`) 생성기.
 * `1.0`은 돌출된 섬유 봉우리(Peak), `0.0`은 움푹한 골짜기(Valley)를 의미한다.
 */
export function generateProceduralPaperToothField(
  width: number,
  height: number,
  profile: PaperToothProfileId = "cold-press-watercolor",
  options: { readonly seed?: number; readonly scale?: number; readonly amplitude?: number } = {},
): Float32Array {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const seed = Math.floor(options.seed ?? 6201);
  const scale = Math.max(0.15, options.scale ?? 1);
  const amplitude = clampRange(options.amplitude ?? 1, 0.1, 1);
  const field = new Float32Array(safeW * safeH);

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      let tooth: number;
      if (profile === "cold-press-watercolor") {
        const coarse = sampleFbm2D(x * 0.16 * scale, y * 0.16 * scale, seed, 3);
        const fine = sampleFbm2D(x * 0.52 * scale, y * 0.52 * scale, seed + 511, 2);
        const fiber = Math.abs(sampleValueNoise2D(x * 0.85 * scale, y * 0.25 * scale, seed + 919) - 0.5) * 2;
        tooth = clamp01((coarse * 0.58 + fine * 0.3 + fiber * 0.12 - 0.5) * 1.65 + 0.5);
      } else if (profile === "laid-charcoal") {
        const ribs = 0.5 + 0.5 * Math.sin(y * 1.15 * scale + sampleValueNoise2D(x * 0.12, y * 0.12, seed) * 1.2);
        const chainLines = 0.5 + 0.5 * Math.cos(x * 0.28 * scale);
        const grit = sampleFbm2D(x * 0.42 * scale, y * 0.42 * scale, seed + 307, 3);
        tooth = clamp01((ribs * 0.48 + grit * 0.42 + chainLines * 0.1 - 0.5) * 1.8 + 0.5);
      } else if (profile === "linen-canvas") {
        const weave = 0.5 + 0.25 * Math.sin(x * 1.05 * scale) + 0.25 * Math.sin(y * 1.05 * scale);
        const gesso = sampleFbm2D(x * 0.35 * scale, y * 0.35 * scale, seed + 701, 2);
        tooth = clamp01((weave * 0.65 + gesso * 0.35 - 0.5) * 1.6 + 0.5);
      } else if (profile === "comic-bristol") {
        const micro = sampleFbm2D(x * 0.72 * scale, y * 0.72 * scale, seed + 131, 2);
        tooth = clamp01(0.5 + (micro - 0.5) * 0.62);
      } else {
        const smooth = sampleFbm2D(x * 0.38 * scale, y * 0.38 * scale, seed + 409, 2);
        tooth = clamp01(0.5 + (smooth - 0.5) * 0.95);
      }
      field[y * safeW + x] = clamp01(0.5 + (tooth - 0.5) * amplitude);
    }
  }
  return field;
}
