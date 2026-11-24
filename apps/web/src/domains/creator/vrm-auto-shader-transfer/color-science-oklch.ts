/**
 * OKLab/OKLCH 색공간 변환, Sharma (2005) CIEDE2000 ΔE00 지각 색차,
 * CIE xy → McCamy 색온도(K) 추정 및 RGBA8 텍스처 주조색 샘플링 커널.
 *
 * - 외부 3D 엔진 의존성 및 브라우저 스토리지 없이 100% 결정적 부동소수점 연산만 수행한다.
 * - 원시 색상 리터럴(#hex/rgb/hsl)을 UI로 노출하지 않고 OKLCH/정규화 Rgb01 구조를 유지한다.
 */

export interface Rgb01 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface OklabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface OklchColor {
  /** 지각 밝기 [0..1] */
  readonly l: number;
  /** 지각 채도 [0..0.4] */
  readonly c: number;
  /** 색상각 [0..360) deg */
  readonly h: number;
}

export interface CieLabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface VrmTextureBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface TextureDominantSample {
  readonly oklch: OklchColor;
  readonly rgb: Rgb01;
  readonly sampledPixels: number;
  readonly meanChroma: number;
  readonly meanLightness: number;
}

const D65_XN = 0.95047;
const D65_YN = 1.0;
const D65_ZN = 1.08883;
const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;
const POW_25_7 = 25 ** 7;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizeHueDeg(hue: number): number {
  if (!Number.isFinite(hue)) return 0;
  const wrapped = hue % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function shortestHueDeltaDeg(fromHue: number, toHue: number): number {
  const diff = normalizeHueDeg(toHue) - normalizeHueDeg(fromHue);
  if (diff > 180) return diff - 360;
  if (diff < -180) return diff + 360;
  return diff;
}

export function lerpHueDeg(fromHue: number, toHue: number, t: number): number {
  const delta = shortestHueDeltaDeg(fromHue, toHue);
  return normalizeHueDeg(fromHue + delta * clamp(t, 0, 1));
}

export function srgbChannelToLinear(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function linearChannelToSrgb(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

export function srgbToOklab(rgb: Rgb01): OklabColor {
  const lr = srgbChannelToLinear(rgb.r);
  const lg = srgbChannelToLinear(rgb.g);
  const lb = srgbChannelToLinear(rgb.b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const lCbrt = Math.cbrt(Math.max(0, l));
  const mCbrt = Math.cbrt(Math.max(0, m));
  const sCbrt = Math.cbrt(Math.max(0, s));

  return {
    l: 0.2104542553 * lCbrt + 0.793617785 * mCbrt - 0.0040720468 * sCbrt,
    a: 1.9779984951 * lCbrt - 2.428592205 * mCbrt + 0.4505937099 * sCbrt,
    b: 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.808675766 * sCbrt,
  };
}

export function oklabToLinearRgbRaw(lab: OklabColor): Rgb01 {
  const lCbrt = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mCbrt = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sCbrt = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l = lCbrt * lCbrt * lCbrt;
  const m = mCbrt * mCbrt * mCbrt;
  const s = sCbrt * sCbrt * sCbrt;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export function oklabToOklch(lab: OklabColor): OklchColor {
  const c = Math.hypot(lab.a, lab.b);
  const h = c < 1e-6 ? 0 : normalizeHueDeg(Math.atan2(lab.b, lab.a) * RAD_TO_DEG);
  return {
    l: clamp(lab.l, 0, 1),
    c: Math.max(0, c),
    h,
  };
}

export function oklchToOklab(lch: OklchColor): OklabColor {
  const rad = normalizeHueDeg(lch.h) * DEG_TO_RAD;
  const c = Math.max(0, lch.c);
  return {
    l: clamp(lch.l, 0, 1),
    a: c * Math.cos(rad),
    b: c * Math.sin(rad),
  };
}

export function srgbToOklch(rgb: Rgb01): OklchColor {
  return oklabToOklch(srgbToOklab(rgb));
}

function isInsideUnitGamut(linear: Rgb01): boolean {
  const eps = 1e-5;
  return (
    linear.r >= -eps &&
    linear.r <= 1 + eps &&
    linear.g >= -eps &&
    linear.g <= 1 + eps &&
    linear.b >= -eps &&
    linear.b <= 1 + eps
  );
}

/**
 * OKLCH 좌표를 sRGB 색역 안으로 안전하게 투영한다.
 * 밝기(L)와 색상각(H)을 유지한 채 채도(C)만 이분 탐색으로 수축시켜 색상 틀어짐을 방지한다.
 */
export function oklchToSrgbGamutSafe(lch: OklchColor): Rgb01 {
  const safeL = clamp(lch.l, 0, 1);
  const safeH = normalizeHueDeg(lch.h);
  const initial = oklabToLinearRgbRaw(oklchToOklab({ l: safeL, c: Math.max(0, lch.c), h: safeH }));
  if (isInsideUnitGamut(initial)) {
    return {
      r: linearChannelToSrgb(initial.r),
      g: linearChannelToSrgb(initial.g),
      b: linearChannelToSrgb(initial.b),
    };
  }

  let lo = 0;
  let hi = Math.max(0, lch.c);
  for (let iter = 0; iter < 14; iter += 1) {
    const mid = (lo + hi) * 0.5;
    const probe = oklabToLinearRgbRaw(oklchToOklab({ l: safeL, c: mid, h: safeH }));
    if (isInsideUnitGamut(probe)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const clipped = oklabToLinearRgbRaw(oklchToOklab({ l: safeL, c: lo, h: safeH }));
  return {
    r: linearChannelToSrgb(clipped.r),
    g: linearChannelToSrgb(clipped.g),
    b: linearChannelToSrgb(clipped.b),
  };
}

export function formatOklchCss(lch: OklchColor): string {
  const l = roundTo(clamp(lch.l, 0, 1), 3);
  const c = roundTo(Math.max(0, lch.c), 3);
  const h = roundTo(normalizeHueDeg(lch.h), 1);
  return `oklch(${l} ${c} ${h})`;
}

export function srgbToRelativeLuminance(rgb: Rgb01): number {
  return (
    0.2126 * srgbChannelToLinear(rgb.r) +
    0.7152 * srgbChannelToLinear(rgb.g) +
    0.0722 * srgbChannelToLinear(rgb.b)
  );
}

export function srgbToXyzD65(rgb: Rgb01): readonly [number, number, number] {
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}

function labPivot(t: number): number {
  return t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}

export function srgbToCieLab(rgb: Rgb01): CieLabColor {
  const [x, y, z] = srgbToXyzD65(rgb);
  const fx = labPivot(x / D65_XN);
  const fy = labPivot(y / D65_YN);
  const fz = labPivot(z / D65_ZN);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/**
 * Sharma, Wu, Dalal (2005) 공식 CIEDE2000 ΔE00 (kL = kC = kH = 1).
 */
export function computeCiede2000Lab(lab1: CieLabColor, lab2: CieLabColor): number {
  const c1 = Math.hypot(lab1.a, lab1.b);
  const c2 = Math.hypot(lab2.a, lab2.b);
  const cBar = (c1 + c2) * 0.5;
  const cBar7 = cBar ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + POW_25_7)));

  const a1Prime = (1 + g) * lab1.a;
  const a2Prime = (1 + g) * lab2.a;
  const c1Prime = Math.hypot(a1Prime, lab1.b);
  const c2Prime = Math.hypot(a2Prime, lab2.b);

  const h1Prime = c1Prime < 1e-10 ? 0 : normalizeHueDeg(Math.atan2(lab1.b, a1Prime) * RAD_TO_DEG);
  const h2Prime = c2Prime < 1e-10 ? 0 : normalizeHueDeg(Math.atan2(lab2.b, a2Prime) * RAD_TO_DEG);

  const dLPrime = lab2.l - lab1.l;
  const dCPrime = c2Prime - c1Prime;

  let dhPrime = 0;
  if (c1Prime * c2Prime > 1e-10) {
    const rawDiff = h2Prime - h1Prime;
    if (Math.abs(rawDiff) <= 180) dhPrime = rawDiff;
    else if (rawDiff > 180) dhPrime = rawDiff - 360;
    else dhPrime = rawDiff + 360;
  }
  const dHPrime = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin((dhPrime * 0.5) * DEG_TO_RAD);

  const lBarPrime = (lab1.l + lab2.l) * 0.5;
  const cBarPrime = (c1Prime + c2Prime) * 0.5;

  let hBarPrime = h1Prime + h2Prime;
  if (c1Prime * c2Prime > 1e-10) {
    if (Math.abs(h1Prime - h2Prime) <= 180) hBarPrime = (h1Prime + h2Prime) * 0.5;
    else if (h1Prime + h2Prime < 360) hBarPrime = (h1Prime + h2Prime + 360) * 0.5;
    else hBarPrime = (h1Prime + h2Prime - 360) * 0.5;
  }

  const t =
    1 -
    0.17 * Math.cos((hBarPrime - 30) * DEG_TO_RAD) +
    0.24 * Math.cos(2 * hBarPrime * DEG_TO_RAD) +
    0.32 * Math.cos((3 * hBarPrime + 6) * DEG_TO_RAD) -
    0.2 * Math.cos((4 * hBarPrime - 63) * DEG_TO_RAD);

  const deltaTheta = 30 * Math.exp(-(((hBarPrime - 275) / 25) ** 2));
  const cBarPrime7 = cBarPrime ** 7;
  const rc = 2 * Math.sqrt(cBarPrime7 / (cBarPrime7 + POW_25_7));

  const lMinus50Sq = (lBarPrime - 50) ** 2;
  const sl = 1 + (0.015 * lMinus50Sq) / Math.sqrt(20 + lMinus50Sq);
  const sc = 1 + 0.045 * cBarPrime;
  const sh = 1 + 0.015 * cBarPrime * t;
  const rt = -Math.sin(2 * deltaTheta * DEG_TO_RAD) * rc;

  const termL = dLPrime / sl;
  const termC = dCPrime / sc;
  const termH = dHPrime / sh;

  return Math.sqrt(Math.max(0, termL * termL + termC * termC + termH * termH + rt * termC * termH));
}

export function computeCiede2000Rgb(rgb1: Rgb01, rgb2: Rgb01): number {
  return computeCiede2000Lab(srgbToCieLab(rgb1), srgbToCieLab(rgb2));
}

/**
 * McCamy (1992) 색도 근사식으로 sRGB 색상의 상관 색온도(CCT, Kelvin)를 추정한다.
 * 그림자 색온도 틴트(한색/중성/난색) 분류에 사용한다.
 */
export function estimateColorTemperatureKelvin(rgb: Rgb01): number {
  // 매우 어두운 색은 D65 기준 중립 흰색과 섞어 색도 특이점을 회피한다.
  const boosted: Rgb01 = {
    r: clamp(rgb.r * 0.72 + 0.28, 0.02, 1),
    g: clamp(rgb.g * 0.72 + 0.28, 0.02, 1),
    b: clamp(rgb.b * 0.72 + 0.28, 0.02, 1),
  };
  const [x, y, z] = srgbToXyzD65(boosted);
  const sum = x + y + z;
  if (sum <= 1e-6) return 6500;
  const cx = x / sum;
  const cy = y / sum;
  const denom = 0.1858 - cy;
  if (Math.abs(denom) < 1e-4) return 6500;
  const n = (cx - 0.332) / denom;
  const cct = 449 * n * n * n + 3525 * n * n + 6823.3 * n + 5520.33;
  return Math.round(clamp(cct, 2400, 13000));
}

export function blendOklabRgb(a: Rgb01, b: Rgb01, t: number): Rgb01 {
  const k = clamp(t, 0, 1);
  const la = srgbToOklab(a);
  const lb = srgbToOklab(b);
  const mixed: OklabColor = {
    l: la.l + (lb.l - la.l) * k,
    a: la.a + (lb.a - la.a) * k,
    b: la.b + (lb.b - la.b) * k,
  };
  return oklchToSrgbGamutSafe(oklabToOklch(mixed));
}

/**
 * RGBA8 텍스처 버퍼에서 투명 픽셀과 극단 외곽선 암부를 배제하고
 * OKLab 공간 가중 평균으로 주조 OKLCH 색상을 추출한다.
 */
export function sampleDominantOklchFromTexture(
  texture: VrmTextureBuffer,
  fallbackRgb: Rgb01,
): TextureDominantSample {
  const totalPixels = Math.min(
    Math.max(0, Math.floor(texture.width) * Math.floor(texture.height)),
    Math.floor(texture.data.length / 4),
  );
  if (totalPixels === 0) {
    const lch = srgbToOklch(fallbackRgb);
    return {
      oklch: lch,
      rgb: fallbackRgb,
      sampledPixels: 0,
      meanChroma: lch.c,
      meanLightness: lch.l,
    };
  }

  let sumW = 0;
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  let sumChroma = 0;
  let sampledPixels = 0;

  for (let i = 0; i < totalPixels; i += 1) {
    const off = i * 4;
    const alpha = (texture.data[off + 3] ?? 0) / 255;
    if (alpha < 0.15) continue;

    const rgb: Rgb01 = {
      r: (texture.data[off] ?? 0) / 255,
      g: (texture.data[off + 1] ?? 0) / 255,
      b: (texture.data[off + 2] ?? 0) / 255,
    };
    const lab = srgbToOklab(rgb);
    const chroma = Math.hypot(lab.a, lab.b);
    // 극단적인 검정 선화 픽셀이 주조색을 왜곡하지 않도록 미세 가중 조절
    const lumaWeight = lab.l < 0.08 ? 0.25 : 1;
    const weight = alpha * lumaWeight * (0.7 + chroma * 1.4);

    sumW += weight;
    sumL += lab.l * weight;
    sumA += lab.a * weight;
    sumB += lab.b * weight;
    sumChroma += chroma * weight;
    sampledPixels += 1;
  }

  if (sumW <= 1e-6 || sampledPixels === 0) {
    const lch = srgbToOklch(fallbackRgb);
    return {
      oklch: lch,
      rgb: fallbackRgb,
      sampledPixels: 0,
      meanChroma: lch.c,
      meanLightness: lch.l,
    };
  }

  const avgLab: OklabColor = {
    l: sumL / sumW,
    a: sumA / sumW,
    b: sumB / sumW,
  };
  const oklch = oklabToOklch(avgLab);
  const rgb = oklchToSrgbGamutSafe(oklch);
  return {
    oklch,
    rgb,
    sampledPixels,
    meanChroma: sumChroma / sumW,
    meanLightness: oklch.l,
  };
}
