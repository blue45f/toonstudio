/**
 * Wave 83 색각이상(CVD)·360px 소형 모바일 야외 저조도 시뮬레이터.
 *
 * - Machado-Oliveira-Fernandes (2009) 생리학 기반 선형 RGB 색각이상 변환 행렬
 *   (`protanopia`/`protanomaly`, `deuteranopia`/`deuteranomaly`, `tritanopia`/`tritanomaly`, `achromatopsia`)
 * - IEC 61966-2-1 sRGB ↔ 선형 RGB 변환 및 심각도 `0` 항등 보장 (`maxDiff === 0`)
 * - Ottosson OKLab/OKLCH 지각 거리(`computeOklchDeltaE`) 및 CIEDE2000 보조 거리 계산
 * - 360px 모바일 다운샘플링·야외 직사광선 베일 글레어(`0..0.28`)·저휘도 OLED 딤 모드 하의
 *   WCAG 2.1 명암비 및 APCA W3 Lc 지각 명도 대비 시뮬레이션
 */

export interface RgbColor { readonly r: number; readonly g: number; readonly b: number; }
export interface LinearRgbColor { readonly r: number; readonly g: number; readonly b: number; }
export interface OklabColor { readonly L: number; readonly a: number; readonly b: number; }
export interface OklchColor { readonly L: number; readonly C: number; readonly H: number; }
export interface CielabColor { readonly L: number; readonly a: number; readonly b: number; }

export type CvdType =
  | "protanopia"
  | "protanomaly"
  | "deuteranopia"
  | "deuteranomaly"
  | "tritanopia"
  | "tritanomaly"
  | "achromatopsia";

export type CanonicalCvdFamily = "protan" | "deutan" | "tritan" | "achromatopsia";
export type Matrix3x3 = readonly [number, number, number, number, number, number, number, number, number];

export interface MobileViewingEnvironmentConfig {
  readonly sourcePanelWidthPx: number;
  readonly targetViewportWidthPx?: number;
  readonly ambientGlareVeil?: number;
  readonly oledDimFactor?: number;
  readonly cvdType?: CvdType;
  readonly cvdSeverity?: number;
}

export interface MobileColorPairViewingInput {
  readonly id?: string;
  readonly label?: string;
  readonly foreground: RgbColor;
  readonly background: RgbColor;
  readonly sourceFontSizePx?: number;
  readonly sourceStrokeWidthPx?: number;
  readonly isLargeOrBoldText?: boolean;
}

export interface MobileSourceRgbaBuffer {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

export interface MobileColorPairViewingMetrics {
  readonly id: string;
  readonly label: string;
  readonly originalForeground: RgbColor;
  readonly originalBackground: RgbColor;
  readonly viewedForeground: RgbColor;
  readonly viewedBackground: RgbColor;
  readonly baselineWcagRatio: number;
  readonly effectiveWcagRatio: number;
  readonly baselineApcaLc: number;
  readonly effectiveApcaLc: number;
  readonly baselineOklchDeltaE: number;
  readonly effectiveOklchDeltaE: number;
  readonly effectiveFontSizePx: number | null;
  readonly effectiveStrokeWidthPx: number | null;
  readonly hairlineContrastRatio: number | null;
}

export interface MobileViewingEnvironmentResult {
  readonly sourcePanelWidthPx: number;
  readonly targetViewportWidthPx: number;
  readonly downsampleScale: number;
  readonly ambientGlareVeil: number;
  readonly oledDimFactor: number;
  readonly blackFloorLuminance: number;
  readonly maxAchievableWcagRatio: number;
  readonly pairs: readonly MobileColorPairViewingMetrics[];
  readonly previewBuffer?: { readonly width: number; readonly height: number; readonly rgba: Uint8ClampedArray };
}

export const DEFAULT_MOBILE_VIEWPORT_WIDTH_PX = 360;
export const DEFAULT_OUTDOOR_GLARE_VEIL = 0.12;
export const MAX_OUTDOOR_GLARE_VEIL = 0.28;
export const MIN_OLED_DIM_FACTOR = 0.25;
export const OKLCH_CHROMA_JND_SCALE = 2.0;

const IDENTITY_MATRIX: Matrix3x3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Machado (2009) 제1색각이상(L-원추세포 결핍, Protan) 선형 sRGB 행렬표 (0.0..1.0, 0.1 간격). */
const MACHADO_PROTAN_TABLE: readonly Matrix3x3[] = [
  IDENTITY_MATRIX,
  [0.856167, 0.182038, -0.038205, 0.029342, 0.951159, 0.019499, -0.002880, -0.000612, 1.003492],
  [0.734765, 0.334872, -0.069637, 0.051840, 0.919198, 0.028963, -0.004928, -0.004209, 1.009137],
  [0.630323, 0.465641, -0.095964, 0.069181, 0.890046, 0.040773, -0.006308, -0.007724, 1.014032],
  [0.539009, 0.579343, -0.118352, 0.082546, 0.861261, 0.056193, -0.007149, -0.011220, 1.018369],
  [0.458064, 0.679578, -0.137642, 0.092785, 0.846313, 0.060902, -0.007494, -0.016807, 1.024301],
  [0.385450, 0.769005, -0.154455, 0.100526, 0.829802, 0.069673, -0.007442, -0.022190, 1.029632],
  [0.319627, 0.849633, -0.169261, 0.106241, 0.815969, 0.077790, -0.007025, -0.028051, 1.035076],
  [0.259411, 0.923008, -0.182420, 0.110296, 0.804340, 0.085364, -0.006276, -0.034346, 1.040622],
  [0.203876, 0.990338, -0.194214, 0.112975, 0.794542, 0.092483, -0.005222, -0.041043, 1.046265],
  [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
];

/** Machado (2009) 제2색각이상(M-원추세포 결핍, Deutan) 선형 sRGB 행렬표 (0.0..1.0, 0.1 간격). */
const MACHADO_DEUTAN_TABLE: readonly Matrix3x3[] = [
  IDENTITY_MATRIX,
  [0.866435, 0.177704, -0.044139, 0.049567, 0.939063, 0.011370, -0.003453, 0.007233, 0.996220],
  [0.760729, 0.319078, -0.079807, 0.090568, 0.889315, 0.020117, -0.006027, 0.013325, 0.992702],
  [0.675425, 0.433850, -0.109275, 0.125303, 0.847755, 0.026942, -0.007950, 0.018572, 0.989378],
  [0.605511, 0.528560, -0.134071, 0.155318, 0.812366, 0.032316, -0.009376, 0.023176, 0.986200],
  [0.547494, 0.607765, -0.155259, 0.181692, 0.781742, 0.036566, -0.010410, 0.027275, 0.983136],
  [0.498864, 0.674741, -0.173604, 0.205199, 0.754872, 0.039929, -0.011131, 0.030969, 0.980162],
  [0.457771, 0.731899, -0.189670, 0.226409, 0.731012, 0.042579, -0.011595, 0.034333, 0.977261],
  [0.422823, 0.781057, -0.203881, 0.245752, 0.709602, 0.044646, -0.011843, 0.037423, 0.974421],
  [0.392952, 0.823610, -0.216562, 0.263559, 0.690210, 0.046232, -0.011910, 0.040281, 0.971630],
  [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
];

/** Machado (2009) 제3색각이상(S-원추세포 결핍, Tritan) 선형 sRGB 행렬표 (0.0..1.0, 0.1 간격). */
const MACHADO_TRITAN_TABLE: readonly Matrix3x3[] = [
  IDENTITY_MATRIX,
  [0.926670, 0.092514, -0.019184, 0.021191, 0.964503, 0.014306, 0.008437, 0.054813, 0.936750],
  [0.895720, 0.133330, -0.029050, 0.029997, 0.945400, 0.024603, 0.013027, 0.104707, 0.882266],
  [0.905871, 0.127791, -0.033662, 0.026856, 0.941251, 0.031893, 0.013410, 0.148296, 0.838294],
  [0.948035, 0.089490, -0.037526, 0.014364, 0.946792, 0.038844, 0.010853, 0.193991, 0.795156],
  [1.017277, 0.027029, -0.044306, -0.006113, 0.958479, 0.047634, 0.006379, 0.248708, 0.744913],
  [1.104996, -0.046633, -0.058363, -0.032137, 0.971635, 0.060503, 0.001336, 0.317922, 0.680742],
  [1.193214, -0.109812, -0.083402, -0.058496, 0.979410, 0.079086, -0.002346, 0.403492, 0.598854],
  [1.257728, -0.139648, -0.118081, -0.078003, 0.975409, 0.102594, -0.003316, 0.501214, 0.502102],
  [1.278864, -0.125333, -0.153531, -0.084748, 0.957674, 0.127074, -0.000989, 0.601151, 0.399838],
  [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.303900],
];

const ACHROMATOPSIA_LUMINANCE_MATRIX: Matrix3x3 = [
  0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722,
];

const SRGB_BYTE_TO_LINEAR_LUT: Float64Array = (() => {
  const lut = new Float64Array(256);
  for (let i = 0; i < 256; i += 1) lut[i] = srgbChannelToLinear(i);
  return lut;
})();

export function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return value < min ? min : value > max ? max : value;
}

export function clampUnit(value: number): number { return clampFinite(value, 0, 1, 0); }
export function clampByte(value: number): number { return Math.round(clampFinite(value, 0, 255, 0)); }

export function normalizeRgbColor(color: RgbColor): RgbColor {
  return { r: clampByte(color.r), g: clampByte(color.g), b: clampByte(color.b) };
}

/** 8비트 RGB 색상을 6자리 16진 표기 문자열로 직렬화한다. */
export function rgbToHex(color: RgbColor): string {
  const n = normalizeRgbColor(color);
  return `#${n.r.toString(16).padStart(2, "0")}${n.g.toString(16).padStart(2, "0")}${n.b.toString(16).padStart(2, "0")}`;
}

/** 3자리/6자리 16진 색상 문자열을 RGB 구조체로 해석한다. */
export function hexToRgb(hex: string): RgbColor {
  const s = hex.trim().replace(/^#/u, "");
  if (/^[0-9a-fA-F]{3}$/u.test(s)) {
    return {
      r: parseInt(s[0] + s[0], 16),
      g: parseInt(s[1] + s[1], 16),
      b: parseInt(s[2] + s[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/u.test(s)) {
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
    };
  }
  return { r: 0, g: 0, b: 0 };
}

/** OKLCH 구조체를 CSS Color 4 표기(`oklch(L C H)`)로 직렬화한다. */
export function formatOklchCss(color: OklchColor): string {
  const L = clampFinite(color.L, 0, 1, 0).toFixed(3);
  const C = clampFinite(color.C, 0, 0.5, 0).toFixed(3);
  return `oklch(${L} ${C} ${normalizeHueDeg(color.H).toFixed(1)})`;
}

export function normalizeHueDeg(hueDeg: number): number {
  if (!Number.isFinite(hueDeg)) return 0;
  const mod = hueDeg % 360;
  return mod < 0 ? mod + 360 : mod;
}

/** 두 색상각(도) 사이의 최단 원호 각거리(`0..180°`)를 구한다. */
export function computeHueDistanceDeg(hueA: number, hueB: number): number {
  const diff = Math.abs(normalizeHueDeg(hueA) - normalizeHueDeg(hueB));
  return diff > 180 ? 360 - diff : diff;
}

/** IEC 61966-2-1 sRGB(0..255) → 선형 RGB(0..1). */
export function srgbChannelToLinear(channel255: number): number {
  const c = clampFinite(channel255, 0, 255, 0) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** IEC 61966-2-1 선형 RGB(0..1) → sRGB 부동소수점(0..255). */
export function linearChannelToSrgbFloat(linear: number): number {
  const l = clampUnit(linear);
  const s = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return clampUnit(s) * 255;
}

/** IEC 61966-2-1 선형 RGB(0..1) → 8비트 정수 sRGB(0..255). */
export function linearChannelToSrgb(linear: number): number {
  return Math.round(linearChannelToSrgbFloat(linear));
}

export function srgbToLinearRgb(color: RgbColor): LinearRgbColor {
  return {
    r: srgbChannelToLinear(color.r),
    g: srgbChannelToLinear(color.g),
    b: srgbChannelToLinear(color.b),
  };
}

export function linearRgbToSrgb(color: LinearRgbColor): RgbColor {
  return {
    r: linearChannelToSrgb(color.r),
    g: linearChannelToSrgb(color.g),
    b: linearChannelToSrgb(color.b),
  };
}

export function resolveCvdFamily(cvdType: CvdType): CanonicalCvdFamily {
  if (cvdType === "protanopia" || cvdType === "protanomaly") return "protan";
  if (cvdType === "deuteranopia" || cvdType === "deuteranomaly") return "deutan";
  if (cvdType === "tritanopia" || cvdType === "tritanomaly") return "tritan";
  return "achromatopsia";
}

export function getDefaultCvdSeverity(cvdType: CvdType): number {
  return cvdType === "protanomaly" || cvdType === "deuteranomaly" || cvdType === "tritanomaly" ? 0.6 : 1.0;
}

function interpolateMatrix3x3(a: Matrix3x3, b: Matrix3x3, t: number): Matrix3x3 {
  const u = 1 - t;
  return [
    a[0] * u + b[0] * t, a[1] * u + b[1] * t, a[2] * u + b[2] * t,
    a[3] * u + b[3] * t, a[4] * u + b[4] * t, a[5] * u + b[5] * t,
    a[6] * u + b[6] * t, a[7] * u + b[7] * t, a[8] * u + b[8] * t,
  ];
}

/** 지정된 색각이상 유형·심각도(`0.0..1.0`)에 대응하는 Machado (2009) 3x3 선형 RGB 행렬을 반환한다. */
export function getMachadoCvdMatrix(cvdType: CvdType, severity?: number): Matrix3x3 {
  const s = clampUnit(severity === undefined ? getDefaultCvdSeverity(cvdType) : severity);
  if (s === 0) return IDENTITY_MATRIX;
  const family = resolveCvdFamily(cvdType);
  if (family === "achromatopsia") {
    return s === 1 ? ACHROMATOPSIA_LUMINANCE_MATRIX : interpolateMatrix3x3(IDENTITY_MATRIX, ACHROMATOPSIA_LUMINANCE_MATRIX, s);
  }
  const table = family === "protan" ? MACHADO_PROTAN_TABLE : family === "deutan" ? MACHADO_DEUTAN_TABLE : MACHADO_TRITAN_TABLE;
  const scaled = s * 10;
  const lo = Math.min(10, Math.floor(scaled));
  const hi = Math.min(10, Math.ceil(scaled));
  return lo === hi ? table[lo] : interpolateMatrix3x3(table[lo], table[hi], scaled - lo);
}

function multiplyMatrixLinearRgb(m: Matrix3x3, lin: LinearRgbColor): LinearRgbColor {
  return {
    r: clampUnit(m[0] * lin.r + m[1] * lin.g + m[2] * lin.b),
    g: clampUnit(m[3] * lin.r + m[4] * lin.g + m[5] * lin.b),
    b: clampUnit(m[6] * lin.r + m[7] * lin.g + m[8] * lin.b),
  };
}

/** 단일 sRGB 색상에 색각이상 시뮬레이션을 적용한다(`severity = 0`일 때 `maxDiff === 0` 보장). */
export function simulateCvdRgb(color: RgbColor, cvdType: CvdType, severity?: number): RgbColor {
  const normalized = normalizeRgbColor(color);
  const s = clampUnit(severity === undefined ? getDefaultCvdSeverity(cvdType) : severity);
  if (s === 0) return normalized;

  const lin = srgbToLinearRgb(normalized);
  if (cvdType === "achromatopsia" && s === 1) {
    const gray = linearChannelToSrgb(0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b);
    return { r: gray, g: gray, b: gray };
  }
  return linearRgbToSrgb(multiplyMatrixLinearRgb(getMachadoCvdMatrix(cvdType, s), lin));
}

/** RGBA 픽셀 버퍼 전체에 색각이상 시뮬레이션을 적용한다(알파 채널 무손실 보존). */
export function simulateCvdRgbaBuffer(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  cvdType: CvdType,
  severity?: number,
): Uint8ClampedArray {
  const byteLength = Math.min(rgba.length, Math.max(0, Math.floor(width)) * Math.max(0, Math.floor(height)) * 4);
  const out = new Uint8ClampedArray(byteLength);
  const s = clampUnit(severity === undefined ? getDefaultCvdSeverity(cvdType) : severity);
  if (s === 0) {
    out.set(rgba.subarray(0, byteLength));
    return out;
  }
  if (cvdType === "achromatopsia" && s === 1) {
    for (let i = 0; i < byteLength; i += 4) {
      const lum =
        0.2126 * SRGB_BYTE_TO_LINEAR_LUT[rgba[i]] +
        0.7152 * SRGB_BYTE_TO_LINEAR_LUT[rgba[i + 1]] +
        0.0722 * SRGB_BYTE_TO_LINEAR_LUT[rgba[i + 2]];
      const gray = linearChannelToSrgb(lum);
      out[i] = gray;
      out[i + 1] = gray;
      out[i + 2] = gray;
      out[i + 3] = rgba[i + 3];
    }
    return out;
  }

  const m = getMachadoCvdMatrix(cvdType, s);
  for (let i = 0; i < byteLength; i += 4) {
    const lr = SRGB_BYTE_TO_LINEAR_LUT[rgba[i]];
    const lg = SRGB_BYTE_TO_LINEAR_LUT[rgba[i + 1]];
    const lb = SRGB_BYTE_TO_LINEAR_LUT[rgba[i + 2]];
    out[i] = linearChannelToSrgb(m[0] * lr + m[1] * lg + m[2] * lb);
    out[i + 1] = linearChannelToSrgb(m[3] * lr + m[4] * lg + m[5] * lb);
    out[i + 2] = linearChannelToSrgb(m[6] * lr + m[7] * lg + m[8] * lb);
    out[i + 3] = rgba[i + 3];
  }
  return out;
}

/** 선형 RGB → Björn Ottosson OKLab 변환. */
export function linearRgbToOklab(lin: LinearRgbColor): OklabColor {
  const l = Math.cbrt(0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b);
  const m = Math.cbrt(0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b);
  const s = Math.cbrt(0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

/** OKLab → 비클램핑 선형 RGB 역변환(색역 내부 판별용). */
export function oklabToUnclampedLinearRgb(lab: OklabColor): LinearRgbColor {
  const lP = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mP = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sP = lab.L - 0.0894841775 * lab.a - 1.2914855480 * lab.b;
  const l = lP * lP * lP;
  const m = mP * mP * mP;
  const s = sP * sP * sP;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

export function rgbToOklab(color: RgbColor): OklabColor { return linearRgbToOklab(srgbToLinearRgb(color)); }

export function oklabToOklch(lab: OklabColor): OklchColor {
  const C = Math.hypot(lab.a, lab.b);
  return { L: lab.L, C, H: C < 1e-6 ? 0 : normalizeHueDeg((Math.atan2(lab.b, lab.a) * 180) / Math.PI) };
}

export function oklchToOklab(lch: OklchColor): OklabColor {
  const C = Math.max(0, Number.isFinite(lch.C) ? lch.C : 0);
  const rad = (normalizeHueDeg(lch.H) * Math.PI) / 180;
  return { L: clampUnit(lch.L), a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

export function rgbToOklch(color: RgbColor): OklchColor { return oklabToOklch(rgbToOklab(color)); }

function isLinearInSrgbGamut(lin: LinearRgbColor): boolean {
  const eps = 1e-6;
  return lin.r >= -eps && lin.r <= 1 + eps && lin.g >= -eps && lin.g <= 1 + eps && lin.b >= -eps && lin.b <= 1 + eps;
}

/** OKLCH 색상을 명도(L)·색상각(H) 보존 채도 이진 탐색으로 sRGB 8비트에 매핑한다. */
export function oklchToSrgbGamutMapped(lch: OklchColor): RgbColor {
  const L = clampUnit(lch.L);
  if (L <= 0) return { r: 0, g: 0, b: 0 };
  if (L >= 1) return { r: 255, g: 255, b: 255 };

  const targetC = Math.max(0, Number.isFinite(lch.C) ? lch.C : 0);
  const H = normalizeHueDeg(lch.H);
  const direct = oklabToUnclampedLinearRgb(oklchToOklab({ L, C: targetC, H }));
  if (isLinearInSrgbGamut(direct)) return linearRgbToSrgb(direct);

  let lo = 0;
  let hi = targetC;
  for (let iter = 0; iter < 16; iter += 1) {
    const mid = (lo + hi) * 0.5;
    if (isLinearInSrgbGamut(oklabToUnclampedLinearRgb(oklchToOklab({ L, C: mid, H })))) lo = mid;
    else hi = mid;
  }
  return linearRgbToSrgb(oklabToUnclampedLinearRgb(oklchToOklab({ L, C: lo, H })));
}

/** OKLCH/OKLab 기반 결정론적 지각 색차(`0..100+` JND 보정 스케일, 흑백 = 100.0). */
export function computeOklchDeltaE(colorA: RgbColor, colorB: RgbColor): number {
  const a = rgbToOklab(colorA);
  const b = rgbToOklab(colorB);
  const dist = Math.hypot(
    (a.L - b.L) * 100,
    (a.a - b.a) * (100 * OKLCH_CHROMA_JND_SCALE),
    (a.b - b.b) * (100 * OKLCH_CHROMA_JND_SCALE),
  );
  return Number.isFinite(dist) ? dist : 0;
}

/** 색각이상 시뮬레이션 하에서 두 영역 사이의 OKLCH 지각 색차를 계산한다. */
export function computeCvdOklchDeltaE(colorA: RgbColor, colorB: RgbColor, cvdType: CvdType, severity?: number): number {
  return computeOklchDeltaE(simulateCvdRgb(colorA, cvdType, severity), simulateCvdRgb(colorB, cvdType, severity));
}

/** sRGB → D65 CIELAB 변환(CIEDE2000 보조 검증용). */
export function rgbToCielab(color: RgbColor): CielabColor {
  const lin = srgbToLinearRgb(color);
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((0.4124564 * lin.r + 0.3575761 * lin.g + 0.1804375 * lin.b) / 0.95047);
  const fy = f(0.2126729 * lin.r + 0.7151522 * lin.g + 0.0721750 * lin.b);
  const fz = f((0.0193339 * lin.r + 0.1191920 * lin.g + 0.9503041 * lin.b) / 1.08883);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Sharma-Wu-Dalal (2005) 표준 CIEDE2000 색차 계산. */
export function computeCiede2000DeltaE(colorA: RgbColor, colorB: RgbColor): number {
  const l1 = rgbToCielab(colorA);
  const l2 = rgbToCielab(colorB);
  const avgC7 = Math.pow((Math.hypot(l1.a, l1.b) + Math.hypot(l2.a, l2.b)) * 0.5, 7);
  const g = 0.5 * (1 - Math.sqrt(avgC7 / (avgC7 + Math.pow(25, 7))));
  const a1p = (1 + g) * l1.a;
  const a2p = (1 + g) * l2.a;
  const c1p = Math.hypot(a1p, l1.b);
  const c2p = Math.hypot(a2p, l2.b);
  const h1p = c1p < 1e-8 ? 0 : normalizeHueDeg((Math.atan2(l1.b, a1p) * 180) / Math.PI);
  const h2p = c2p < 1e-8 ? 0 : normalizeHueDeg((Math.atan2(l2.b, a2p) * 180) / Math.PI);

  let dhp = 0;
  let avgHp = h1p + h2p;
  if (c1p * c2p > 1e-12) {
    const diff = h2p - h1p;
    dhp = Math.abs(diff) <= 180 ? diff : diff > 180 ? diff - 360 : diff + 360;
    avgHp = Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) * 0.5 : h1p + h2p < 360 ? (h1p + h2p + 360) * 0.5 : (h1p + h2p - 360) * 0.5;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((dhp * Math.PI) / 360);
  const avgLp = (l1.L + l2.L) * 0.5;
  const avgCp = (c1p + c2p) * 0.5;
  const rad = Math.PI / 180;
  const t =
    1 - 0.17 * Math.cos((avgHp - 30) * rad) + 0.24 * Math.cos(2 * avgHp * rad) +
    0.32 * Math.cos((3 * avgHp + 6) * rad) - 0.20 * Math.cos((4 * avgHp - 63) * rad);
  const sq = (avgLp - 50) * (avgLp - 50);
  const sL = 1 + (0.015 * sq) / Math.sqrt(20 + sq);
  const sC = 1 + 0.045 * avgCp;
  const sH = 1 + 0.015 * avgCp * t;
  const avgCp7 = Math.pow(avgCp, 7);
  const rT = -Math.sin(60 * Math.exp(-Math.pow((avgHp - 275) / 25, 2)) * rad) * 2 * Math.sqrt(avgCp7 / (avgCp7 + Math.pow(25, 7)));
  const tL = (l2.L - l1.L) / sL;
  const tC = (c2p - c1p) / sC;
  const tH = dHp / sH;
  const dist = Math.sqrt(tL * tL + tC * tC + tH * tH + rT * tC * tH);
  return Number.isFinite(dist) ? dist : 0;
}

/** WCAG 2.1 상대 휘도(`0.0..1.0`). */
export function computeRelativeLuminance(color: RgbColor): number {
  const lin = srgbToLinearRgb(color);
  return 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
}

export function computeWcagContrastFromLuminance(lumA: number, lumB: number): number {
  const a = clampUnit(lumA);
  const b = clampUnit(lumB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** WCAG 2.1 명암비(`1.0..21.0`). */
export function computeWcagContrastRatio(foreground: RgbColor, background: RgbColor): number {
  return computeWcagContrastFromLuminance(computeRelativeLuminance(foreground), computeRelativeLuminance(background));
}

/** APCA W3 0.0.98G-4g 지각 명도 대비(Lc). 양수 = 밝은 바탕 위 어두운 글자, 음수 = 반대 극성. */
export function computeApcaContrastFromSrgbFloat(
  fgR: number, fgG: number, fgB: number, bgR: number, bgG: number, bgB: number,
): number {
  const yTxtRaw =
    0.2126729 * Math.pow(clampUnit(fgR / 255), 2.4) +
    0.7151522 * Math.pow(clampUnit(fgG / 255), 2.4) +
    0.0721750 * Math.pow(clampUnit(fgB / 255), 2.4);
  const yBgRaw =
    0.2126729 * Math.pow(clampUnit(bgR / 255), 2.4) +
    0.7151522 * Math.pow(clampUnit(bgG / 255), 2.4) +
    0.0721750 * Math.pow(clampUnit(bgB / 255), 2.4);

  const yTxt = yTxtRaw > 0.022 ? yTxtRaw : yTxtRaw + Math.pow(0.022 - yTxtRaw, 1.414);
  const yBg = yBgRaw > 0.022 ? yBgRaw : yBgRaw + Math.pow(0.022 - yBgRaw, 1.414);
  if (Math.abs(yBg - yTxt) < 0.0005) return 0;

  if (yBg > yTxt) {
    const sapc = (Math.pow(yBg, 0.56) - Math.pow(yTxt, 0.57)) * 1.14;
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  }
  const sapc = (Math.pow(yBg, 0.65) - Math.pow(yTxt, 0.62)) * 1.14;
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
}

export function computeApcaContrastLc(textColor: RgbColor, backgroundColor: RgbColor): number {
  const fg = normalizeRgbColor(textColor);
  const bg = normalizeRgbColor(backgroundColor);
  return computeApcaContrastFromSrgbFloat(fg.r, fg.g, fg.b, bg.r, bg.g, bg.b);
}

/** 야외 직사광선 베일 글레어(`0..0.28`)와 저휘도 OLED 딤 모드(`0.25..1.0`)를 선형 광량 공간에 적용한다. */
export function applyMobileOpticalEnvironmentLinear(
  linear: LinearRgbColor,
  ambientGlareVeil: number,
  oledDimFactor: number,
): LinearRgbColor {
  const v = clampFinite(ambientGlareVeil, 0, MAX_OUTDOOR_GLARE_VEIL, 0);
  const d = clampFinite(oledDimFactor, MIN_OLED_DIM_FACTOR, 1, 1);
  const invNorm = 1 / (1 + v);
  return {
    r: clampUnit((d * linear.r + v) * invNorm),
    g: clampUnit((d * linear.g + v) * invNorm),
    b: clampUnit((d * linear.b + v) * invNorm),
  };
}

function applyOpticalEnvironmentToColor(
  color: RgbColor, ambientGlareVeil: number, oledDimFactor: number, cvdType?: CvdType, cvdSeverity?: number,
): { readonly linear: LinearRgbColor; readonly srgb: RgbColor } {
  const base = cvdType ? simulateCvdRgb(color, cvdType, cvdSeverity) : normalizeRgbColor(color);
  const optLin = applyMobileOpticalEnvironmentLinear(srgbToLinearRgb(base), ambientGlareVeil, oledDimFactor);
  return { linear: optLin, srgb: linearRgbToSrgb(optLin) };
}

function downsampleAndSimulateMobileBuffer(
  source: MobileSourceRgbaBuffer,
  targetWidthPx: number,
  ambientGlareVeil: number,
  oledDimFactor: number,
  cvdType?: CvdType,
  cvdSeverity?: number,
): { readonly width: number; readonly height: number; readonly rgba: Uint8ClampedArray } {
  const srcW = Math.max(1, Math.floor(source.width));
  const srcH = Math.max(1, Math.floor(source.height));
  const dstW = Math.max(1, Math.min(srcW, Math.floor(targetWidthPx)));
  const dstH = Math.max(1, Math.round((srcH * dstW) / srcW));
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const useCvd = cvdType !== undefined;
  const cvdMat = useCvd ? getMachadoCvdMatrix(cvdType, cvdSeverity) : IDENTITY_MATRIX;
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let y = 0; y < dstH; y += 1) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.min(srcH, Math.ceil((y + 1) * scaleY)));
    for (let x = 0; x < dstW; x += 1) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.max(x0 + 1, Math.min(srcW, Math.ceil((x + 1) * scaleX)));
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        const rowOff = sy * srcW * 4;
        for (let sx = x0; sx < x1; sx += 1) {
          const idx = rowOff + sx * 4;
          if (idx + 3 >= source.rgba.length) continue;
          sumR += SRGB_BYTE_TO_LINEAR_LUT[source.rgba[idx]];
          sumG += SRGB_BYTE_TO_LINEAR_LUT[source.rgba[idx + 1]];
          sumB += SRGB_BYTE_TO_LINEAR_LUT[source.rgba[idx + 2]];
          sumA += source.rgba[idx + 3];
          count += 1;
        }
      }
      const inv = count > 0 ? 1 / count : 1;
      let lin: LinearRgbColor = { r: sumR * inv, g: sumG * inv, b: sumB * inv };
      if (useCvd) lin = multiplyMatrixLinearRgb(cvdMat, lin);
      const viewed = applyMobileOpticalEnvironmentLinear(lin, ambientGlareVeil, oledDimFactor);
      const dstIdx = (y * dstW + x) * 4;
      out[dstIdx] = linearChannelToSrgb(viewed.r);
      out[dstIdx + 1] = linearChannelToSrgb(viewed.g);
      out[dstIdx + 2] = linearChannelToSrgb(viewed.b);
      out[dstIdx + 3] = clampByte(sumA * inv);
    }
  }
  return { width: dstW, height: dstH, rgba: out };
}

/** 360px 소형 모바일 다운샘플링·야외 베일 글레어·저휘도 OLED 딤 모드 하의 WCAG/APCA 대비를 시뮬레이션한다. */
export function simulateMobileViewingEnvironment(
  config: MobileViewingEnvironmentConfig,
  pairs: readonly MobileColorPairViewingInput[],
  sourceBuffer?: MobileSourceRgbaBuffer,
): MobileViewingEnvironmentResult {
  const sourcePanelWidthPx = Math.max(1, clampFinite(config.sourcePanelWidthPx, 1, 16384, 800));
  const targetViewportWidthPx = Math.max(
    1,
    clampFinite(config.targetViewportWidthPx ?? DEFAULT_MOBILE_VIEWPORT_WIDTH_PX, 120, 4096, DEFAULT_MOBILE_VIEWPORT_WIDTH_PX),
  );
  const downsampleScale = targetViewportWidthPx / sourcePanelWidthPx;
  const ambientGlareVeil = clampFinite(config.ambientGlareVeil ?? DEFAULT_OUTDOOR_GLARE_VEIL, 0, MAX_OUTDOOR_GLARE_VEIL, DEFAULT_OUTDOOR_GLARE_VEIL);
  const oledDimFactor = clampFinite(config.oledDimFactor ?? 1.0, MIN_OLED_DIM_FACTOR, 1.0, 1.0);
  const blackFloorLuminance = ambientGlareVeil / (1 + ambientGlareVeil);
  const maxAchievableWcagRatio = computeWcagContrastFromLuminance(
    (oledDimFactor + ambientGlareVeil) / (1 + ambientGlareVeil),
    blackFloorLuminance,
  );

  const pairResults: MobileColorPairViewingMetrics[] = pairs.map((pair, index) => {
    const id = pair.id && pair.id.trim().length > 0 ? pair.id : `pair-${index + 1}`;
    const label = pair.label && pair.label.trim().length > 0 ? pair.label : id;
    const origFg = normalizeRgbColor(pair.foreground);
    const origBg = normalizeRgbColor(pair.background);
    const viewedFg = applyOpticalEnvironmentToColor(origFg, ambientGlareVeil, oledDimFactor, config.cvdType, config.cvdSeverity);
    const viewedBg = applyOpticalEnvironmentToColor(origBg, ambientGlareVeil, oledDimFactor, config.cvdType, config.cvdSeverity);
    const fgLum = 0.2126 * viewedFg.linear.r + 0.7152 * viewedFg.linear.g + 0.0722 * viewedFg.linear.b;
    const bgLum = 0.2126 * viewedBg.linear.r + 0.7152 * viewedBg.linear.g + 0.0722 * viewedBg.linear.b;
    const effectiveWcagRatio = computeWcagContrastFromLuminance(fgLum, bgLum);
    const effectiveApcaLc = computeApcaContrastFromSrgbFloat(
      linearChannelToSrgbFloat(viewedFg.linear.r),
      linearChannelToSrgbFloat(viewedFg.linear.g),
      linearChannelToSrgbFloat(viewedFg.linear.b),
      linearChannelToSrgbFloat(viewedBg.linear.r),
      linearChannelToSrgbFloat(viewedBg.linear.g),
      linearChannelToSrgbFloat(viewedBg.linear.b),
    );
    const effectiveFontSizePx =
      pair.sourceFontSizePx !== undefined && Number.isFinite(pair.sourceFontSizePx)
        ? Math.max(0, pair.sourceFontSizePx) * downsampleScale
        : null;
    const effectiveStrokeWidthPx =
      pair.sourceStrokeWidthPx !== undefined && Number.isFinite(pair.sourceStrokeWidthPx)
        ? Math.max(0, pair.sourceStrokeWidthPx) * downsampleScale
        : null;

    let hairlineContrastRatio: number | null = null;
    if (effectiveStrokeWidthPx !== null) {
      const coverage = clampFinite(effectiveStrokeWidthPx, 0.05, 1.0, 1.0);
      hairlineContrastRatio = computeWcagContrastFromLuminance(fgLum * coverage + bgLum * (1 - coverage), bgLum);
    }

    return {
      id,
      label,
      originalForeground: origFg,
      originalBackground: origBg,
      viewedForeground: viewedFg.srgb,
      viewedBackground: viewedBg.srgb,
      baselineWcagRatio: computeWcagContrastRatio(origFg, origBg),
      effectiveWcagRatio,
      baselineApcaLc: computeApcaContrastLc(origFg, origBg),
      effectiveApcaLc,
      baselineOklchDeltaE: computeOklchDeltaE(origFg, origBg),
      effectiveOklchDeltaE: computeOklchDeltaE(viewedFg.srgb, viewedBg.srgb),
      effectiveFontSizePx,
      effectiveStrokeWidthPx,
      hairlineContrastRatio,
    };
  });

  return {
    sourcePanelWidthPx,
    targetViewportWidthPx,
    downsampleScale,
    ambientGlareVeil,
    oledDimFactor,
    blackFloorLuminance,
    maxAchievableWcagRatio,
    pairs: pairResults,
    previewBuffer: sourceBuffer
      ? downsampleAndSimulateMobileBuffer(sourceBuffer, targetViewportWidthPx, ambientGlareVeil, oledDimFactor, config.cvdType, config.cvdSeverity)
      : undefined,
  };
}
