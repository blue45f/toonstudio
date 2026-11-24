/**
 * Kubelka-Munk 8-밴드 스펙트럴 광학 모델 · 8종 전통/웹툰 안료 프리셋 · CIE 색차 계산 모듈.
 *
 * 가시광선 8개 파장 대역(415nm~665nm)의 반사율 `R∞(λ)`를 CIE 1931 2° 등색 함수 × D65 광원으로
 * 적분해 sRGB · CIE Lab · HSV · CIEDE2000(ΔE00) 지각 색차를 계산한다.
 */

export const SPECTRAL_BAND_COUNT = 8;

/** 가시광선 8개 대표 파장(nm). */
export const SPECTRAL_BAND_NM = [415, 450, 485, 520, 555, 590, 625, 665] as const;

export type PigmentPresetId =
  | "ultramarine-blue"
  | "cadmium-yellow"
  | "vermilion"
  | "burnt-umber"
  | "phthalo-green"
  | "titanium-white"
  | "carbon-black"
  | "rose-madder";

export type PigmentMixBackend = "wasm-simd128" | "typedarray-simd-aligned";

export interface PigmentPreset {
  readonly id: PigmentPresetId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly colorIndexCode: string;
  readonly reflectance: readonly [number, number, number, number, number, number, number, number];
  readonly scatteringScale: number;
  readonly tintingStrength: number;
  readonly granulation: number;
  readonly backrunMobility: number;
}

export interface PigmentLayerSpec {
  readonly pigmentId: PigmentPresetId;
  readonly ratio: number;
  readonly thickness?: number;
  readonly wetness?: number;
}

export interface KubelkaMunkMixOptions {
  /** 종이 기저 반사율(0.65~0.99, 기본 0.94 따뜻한 코튼 수채화지). */
  readonly paperBrightness?: number;
  /** 습윤 백런(가장자리 모세관 번짐) 강도(0~1). */
  readonly wetBackrun?: number;
  /** 안료 입자 침전·과립화 강도(0~1). */
  readonly sedimentation?: number;
  /** 종이 요철 위상 샘플(0~1). */
  readonly paperToothSample?: number;
  /** 레이어 평균 도포 두께(0.15~6.0). */
  readonly layerThickness?: number;
}

export interface CieLabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface HsvColor {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

export interface SrgbOpticalColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly linearR: number;
  readonly linearG: number;
  readonly linearB: number;
  readonly lab: CieLabColor;
  readonly hsv: HsvColor;
}

export interface WasmSimdPigmentRuntimeInfo {
  readonly wasmSupported: boolean;
  readonly simd128Supported: boolean;
  readonly backend: PigmentMixBackend;
  readonly spectralBands: number;
}

export interface KubelkaMunkMixResult {
  readonly backend: PigmentMixBackend;
  readonly spectralReflectance: readonly number[];
  readonly kmSrgb: SrgbOpticalColor;
  readonly rgbLinearMixSrgb: SrgbOpticalColor;
  readonly deltaE76: number;
  readonly deltaE2000: number;
  readonly kmHueDeg: number;
  readonly rgbHueDeg: number;
  readonly kmSaturationPct: number;
  readonly rgbSaturationPct: number;
  readonly chromaGain: number;
  readonly backrunEdgeBoost: number;
  readonly sedimentationFactor: number;
  readonly elapsedMs: number;
}

export interface SimdPigmentBatchResult {
  readonly backend: PigmentMixBackend;
  readonly pixelCount: number;
  readonly rgba: Uint8ClampedArray;
  readonly elapsedMs: number;
  readonly pixelsPerMs: number;
}

export interface PigmentSpectralEntry {
  readonly preset: PigmentPreset;
  readonly kBands: Float32Array;
  readonly sBands: Float32Array;
  readonly baseSrgb: SrgbOpticalColor;
}

/** 8종 전통/웹툰 수채·과슈 안료 프리셋. */
export const PIGMENT_PRESETS: readonly PigmentPreset[] = [
  {
    id: "ultramarine-blue",
    nameKo: "울트라마린 블루",
    nameEn: "Ultramarine Blue",
    colorIndexCode: "PB29",
    reflectance: [0.42, 0.64, 0.56, 0.31, 0.11, 0.02, 0.014, 0.022],
    scatteringScale: 0.78,
    tintingStrength: 1.12,
    granulation: 0.78,
    backrunMobility: 0.56,
  },
  {
    id: "cadmium-yellow",
    nameKo: "카드뮴 옐로",
    nameEn: "Cadmium Yellow",
    colorIndexCode: "PY35",
    reflectance: [0.014, 0.018, 0.075, 0.46, 0.85, 0.92, 0.91, 0.89],
    scatteringScale: 1.24,
    tintingStrength: 1.0,
    granulation: 0.18,
    backrunMobility: 0.42,
  },
  {
    id: "vermilion",
    nameKo: "버밀리온",
    nameEn: "Vermilion",
    colorIndexCode: "PR106",
    reflectance: [0.022, 0.02, 0.024, 0.036, 0.085, 0.42, 0.82, 0.86],
    scatteringScale: 1.18,
    tintingStrength: 1.18,
    granulation: 0.34,
    backrunMobility: 0.38,
  },
  {
    id: "burnt-umber",
    nameKo: "번트 엄버",
    nameEn: "Burnt Umber",
    colorIndexCode: "PBr7",
    reflectance: [0.032, 0.036, 0.044, 0.062, 0.098, 0.165, 0.235, 0.275],
    scatteringScale: 0.92,
    tintingStrength: 1.08,
    granulation: 0.82,
    backrunMobility: 0.48,
  },
  {
    id: "phthalo-green",
    nameKo: "프탈로 그린",
    nameEn: "Phthalo Green",
    colorIndexCode: "PG7",
    reflectance: [0.045, 0.14, 0.34, 0.44, 0.18, 0.022, 0.012, 0.012],
    scatteringScale: 0.62,
    tintingStrength: 1.42,
    granulation: 0.12,
    backrunMobility: 0.74,
  },
  {
    id: "titanium-white",
    nameKo: "티타늄 화이트",
    nameEn: "Titanium White",
    colorIndexCode: "PW6",
    reflectance: [0.92, 0.96, 0.97, 0.975, 0.98, 0.98, 0.975, 0.97],
    scatteringScale: 1.85,
    tintingStrength: 0.9,
    granulation: 0.08,
    backrunMobility: 0.24,
  },
  {
    id: "carbon-black",
    nameKo: "카본 블랙",
    nameEn: "Carbon Black",
    colorIndexCode: "PBk7",
    reflectance: [0.014, 0.014, 0.014, 0.015, 0.015, 0.015, 0.016, 0.016],
    scatteringScale: 0.48,
    tintingStrength: 1.48,
    granulation: 0.44,
    backrunMobility: 0.35,
  },
  {
    id: "rose-madder",
    nameKo: "로즈 매더",
    nameEn: "Rose Madder",
    colorIndexCode: "NR9",
    reflectance: [0.32, 0.24, 0.075, 0.042, 0.055, 0.24, 0.68, 0.78],
    scatteringScale: 0.64,
    tintingStrength: 1.05,
    granulation: 0.22,
    backrunMobility: 0.68,
  },
];

const RAW_CIE_X = [0.066, 0.393, 0.065, 0.066, 0.512, 0.913, 0.653, 0.106] as const;
const RAW_CIE_Y = [0.002, 0.044, 0.189, 0.746, 1.0, 0.674, 0.279, 0.039] as const;
const RAW_CIE_Z = [0.315, 2.073, 0.69, 0.082, 0.006, 0.001, 0.0, 0.0] as const;

const D65_WHITE_X = 0.95047;
const D65_WHITE_Y = 1.0;
const D65_WHITE_Z = 1.08883;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function normalizeWeights(raw: readonly number[], targetSum: number): Float32Array {
  let sum = 0;
  for (let i = 0; i < raw.length; i += 1) sum += raw[i]!;
  const out = new Float32Array(raw.length);
  const scale = sum > 0 ? targetSum / sum : 0;
  for (let i = 0; i < raw.length; i += 1) out[i] = raw[i]! * scale;
  return out;
}

const CIE_W_X = normalizeWeights(RAW_CIE_X, D65_WHITE_X);
const CIE_W_Y = normalizeWeights(RAW_CIE_Y, D65_WHITE_Y);
const CIE_W_Z = normalizeWeights(RAW_CIE_Z, D65_WHITE_Z);

/** 반사율 `R∞ ∈ (0, 1)`에서 Kubelka-Munk `K/S = (1 - R)^2 / (2R)`를 계산한다. */
export function reflectanceToKS(reflectance: number): number {
  const r = clamp(reflectance, 0.002, 0.996);
  const diff = 1 - r;
  return (diff * diff) / (2 * r);
}

/** Kubelka-Munk `K/S`에서 불투명 극한 반사율 `R∞`를 복원한다. */
export function ksToReflectance(ks: number): number {
  const safeKs = Math.max(0, ks);
  return clamp(1 + safeKs - Math.sqrt(safeKs * safeKs + 2 * safeKs), 0.001, 0.999);
}

function linearToSrgbChannel(c: number): number {
  const clamped = clamp(c, 0, 1);
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

export function srgbToLinearChannel(u8: number): number {
  const c = clamp(u8 / 255, 0, 1);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function xyzToLab(x: number, y: number, z: number): CieLabColor {
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / D65_WHITE_X);
  const fy = f(y / D65_WHITE_Y);
  const fz = f(z / D65_WHITE_Z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function rgbToHsv(r: number, g: number, b: number): HsvColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const maxC = Math.max(rn, gn, bn);
  const d = maxC - Math.min(rn, gn, bn);
  let h = 0;
  if (d > 1e-6) {
    if (maxC === rn) h = ((gn - bn) / d) % 6;
    else if (maxC === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: maxC > 1e-6 ? d / maxC : 0, v: maxC };
}

export function buildSrgbOpticalColor(lr: number, lg: number, lb: number): SrgbOpticalColor {
  const cr = clamp(lr, 0, 1);
  const cg = clamp(lg, 0, 1);
  const cb = clamp(lb, 0, 1);
  const r = Math.round(linearToSrgbChannel(cr) * 255);
  const g = Math.round(linearToSrgbChannel(cg) * 255);
  const b = Math.round(linearToSrgbChannel(cb) * 255);
  const x = 0.4124564 * cr + 0.3575761 * cg + 0.1804375 * cb;
  const y = 0.2126729 * cr + 0.7151522 * cg + 0.072175 * cb;
  const z = 0.0193339 * cr + 0.119192 * cg + 0.9503041 * cb;
  return {
    r,
    g,
    b,
    linearR: Number(cr.toFixed(5)),
    linearG: Number(cg.toFixed(5)),
    linearB: Number(cb.toFixed(5)),
    lab: xyzToLab(x, y, z),
    hsv: rgbToHsv(r, g, b),
  };
}

/** 8-밴드 스펙트럴 반사율을 CIE XYZ(D65) → 선형 sRGB → 감마 sRGB · Lab · HSV로 변환한다. */
export function spectralToSrgb(reflectance: ArrayLike<number>): SrgbOpticalColor {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < SPECTRAL_BAND_COUNT; i += 1) {
    const r = clamp(reflectance[i] ?? 0, 0, 1);
    x += r * CIE_W_X[i]!;
    y += r * CIE_W_Y[i]!;
    z += r * CIE_W_Z[i]!;
  }
  return buildSrgbOpticalColor(
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  );
}

/** CIE76 유클리드 색차(ΔE76)를 산출한다. */
export function computeDeltaE76(a: CieLabColor, b: CieLabColor): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

/** 국제 표준 CIEDE2000 지각 색차(ΔE00)를 산출한다. */
export function computeCiede2000(lab1: CieLabColor, lab2: CieLabColor): number {
  const deg2rad = Math.PI / 180;
  const rad2deg = 180 / Math.PI;
  const avgC = (Math.hypot(lab1.a, lab1.b) + Math.hypot(lab2.a, lab2.b)) * 0.5;
  const avgC7 = Math.pow(avgC, 7);
  const g = 0.5 * (1 - Math.sqrt(avgC7 / (avgC7 + Math.pow(25, 7))));

  const a1p = (1 + g) * lab1.a;
  const a2p = (1 + g) * lab2.a;
  const c1p = Math.hypot(a1p, lab1.b);
  const c2p = Math.hypot(a2p, lab2.b);
  const huePrime = (bVal: number, apVal: number): number => {
    if (Math.abs(bVal) < 1e-8 && Math.abs(apVal) < 1e-8) return 0;
    const h = Math.atan2(bVal, apVal) * rad2deg;
    return h >= 0 ? h : h + 360;
  };
  const h1p = huePrime(lab1.b, a1p);
  const h2p = huePrime(lab2.b, a2p);
  const dLp = lab2.l - lab1.l;
  const dCp = c2p - c1p;

  let dhp = 0;
  if (c1p * c2p > 1e-8) {
    const diff = h2p - h1p;
    dhp = Math.abs(diff) <= 180 ? diff : diff > 180 ? diff - 360 : diff + 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(dhp * 0.5 * deg2rad);
  const avgLp = (lab1.l + lab2.l) * 0.5;
  const avgCp = (c1p + c2p) * 0.5;

  let avgHp = h1p + h2p;
  if (c1p * c2p > 1e-8) {
    avgHp =
      Math.abs(h1p - h2p) <= 180
        ? (h1p + h2p) * 0.5
        : h1p + h2p < 360
          ? (h1p + h2p + 360) * 0.5
          : (h1p + h2p - 360) * 0.5;
  }

  const t =
    1 -
    0.17 * Math.cos((avgHp - 30) * deg2rad) +
    0.24 * Math.cos(2 * avgHp * deg2rad) +
    0.32 * Math.cos((3 * avgHp + 6) * deg2rad) -
    0.2 * Math.cos((4 * avgHp - 63) * deg2rad);
  const dTheta = 30 * Math.exp(-Math.pow((avgHp - 275) / 25, 2));
  const avgCp7 = Math.pow(avgCp, 7);
  const rC = 2 * Math.sqrt(avgCp7 / (avgCp7 + Math.pow(25, 7)));
  const lTerm = Math.pow(avgLp - 50, 2);
  const sL = 1 + (0.015 * lTerm) / Math.sqrt(20 + lTerm);
  const sC = 1 + 0.045 * avgCp;
  const sH = 1 + 0.015 * avgCp * t;
  const rT = -Math.sin(2 * dTheta * deg2rad) * rC;

  return Math.sqrt(
    Math.pow(dLp / sL, 2) +
      Math.pow(dCp / sC, 2) +
      Math.pow(dHp / sH, 2) +
      rT * (dCp / sC) * (dHp / sH),
  );
}

/** 다중 레이어 Kubelka-Munk 쌍곡선 반사율 식. */
export function computeKubelkaMunkLayerReflectance(
  k: number,
  s: number,
  thickness: number,
  rg: number,
): number {
  const safeS = Math.max(1e-5, s);
  const safeH = Math.max(0, thickness);
  if (safeH <= 1e-5) return rg;
  const ks = Math.max(0, k) / safeS;
  if (ks < 1e-6) {
    const sh = safeS * safeH;
    return clamp((rg + (1 - rg) * sh) / (1 + (1 - rg) * sh), 0.001, 0.999);
  }
  const a = 1 + ks;
  const b = Math.sqrt(Math.max(0, a * a - 1));
  const x = b * safeS * safeH;
  if (x > 18) return clamp(a - b, 0.001, 0.999);
  const sh = Math.sinh(x);
  const ch = Math.cosh(x);
  const denom = (a - rg) * sh + b * ch;
  if (Math.abs(denom) < 1e-8) return clamp(a - b, 0.001, 0.999);
  return clamp((sh - rg * (a * sh - b * ch)) / denom, 0.001, 0.999);
}

const pigmentCatalogIndex = new Map<PigmentPresetId, PigmentSpectralEntry>();
for (const preset of PIGMENT_PRESETS) {
  const kBands = new Float32Array(SPECTRAL_BAND_COUNT);
  const sBands = new Float32Array(SPECTRAL_BAND_COUNT);
  for (let i = 0; i < SPECTRAL_BAND_COUNT; i += 1) {
    sBands[i] = preset.scatteringScale;
    kBands[i] = reflectanceToKS(preset.reflectance[i]!) * preset.scatteringScale;
  }
  pigmentCatalogIndex.set(preset.id, {
    preset,
    kBands,
    sBands,
    baseSrgb: spectralToSrgb(preset.reflectance),
  });
}

export function getPigmentSpectralEntry(id: PigmentPresetId): PigmentSpectralEntry {
  return pigmentCatalogIndex.get(id) ?? pigmentCatalogIndex.get("ultramarine-blue")!;
}

export function findPigmentPreset(id: PigmentPresetId): PigmentPreset {
  return getPigmentSpectralEntry(id).preset;
}

export function getPigmentBaseSrgb(id: PigmentPresetId): SrgbOpticalColor {
  return getPigmentSpectralEntry(id).baseSrgb;
}
