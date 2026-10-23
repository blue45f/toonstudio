/**
 * sRGB ↔ CIE L*a*b* (D65) 변환과 색 거리. 의존성 없는 순수 계산이다.
 *
 * 색 거리는 CIE76 ΔE(Lab 유클리드 거리)를 쓴다. CIEDE2000 보다 단순하고 빠르며, 이 도구의 용도(대략적인 색 분포·팔레트
 * 비교)에는 충분하다. 사람이 느끼는 차이와 정확히 일치하지는 않는다 — 특히 채도가 높은 푸른 계열에서 과대평가한다.
 */

export type LabColor = readonly [number, number, number];

const WHITE_X = 0.95047;
const WHITE_Y = 1;
const WHITE_Z = 1.08883;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

const SRGB_TO_LINEAR: Float64Array = (() => {
  const table = new Float64Array(256);
  for (let value = 0; value < 256; value += 1) {
    const unit = value / 255;
    table[value] = unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  }
  return table;
})();

function labF(value: number): number {
  return value > EPSILON ? Math.cbrt(value) : (KAPPA * value + 16) / 116;
}

function labFInverse(value: number): number {
  const cubed = value * value * value;
  return cubed > EPSILON ? cubed : (116 * value - 16) / KAPPA;
}

/** 0~255 정수 sRGB 한 점을 Lab 으로. 반환은 [L*(0~100), a*, b*]. */
export function srgbToLab(red: number, green: number, blue: number): LabColor {
  const r = SRGB_TO_LINEAR[clampByte(red)] ?? 0;
  const g = SRGB_TO_LINEAR[clampByte(green)] ?? 0;
  const b = SRGB_TO_LINEAR[clampByte(blue)] ?? 0;
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / WHITE_X;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / WHITE_Y;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / WHITE_Z;
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function clampByte(value: number): number {
  if (!(value > 0)) return 0;
  return value >= 255 ? 255 : Math.round(value);
}

function encodeGamma(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
}

/** Lab 한 점을 0~255 정수 sRGB 로(범위를 벗어나면 가장 가까운 표현 가능한 값으로 자른다). */
export function labToSrgb(lightness: number, a: number, b: number): readonly [number, number, number] {
  const fy = (lightness + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = labFInverse(fx) * WHITE_X;
  const y = labFInverse(fy) * WHITE_Y;
  const z = labFInverse(fz) * WHITE_Z;
  return [
    encodeGamma(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    encodeGamma(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    encodeGamma(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  ];
}

export function srgbToHex(red: number, green: number, blue: number): string {
  const part = (value: number): string => clampByte(value).toString(16).padStart(2, "0");
  return `#${part(red)}${part(green)}${part(blue)}`;
}

export function labToHex(lightness: number, a: number, b: number): string {
  const [red, green, blue] = labToSrgb(lightness, a, b);
  return srgbToHex(red, green, blue);
}

/** CIE76 색 거리. */
export function deltaE76(left: LabColor, right: LabColor): number {
  const dl = left[0] - right[0];
  const da = left[1] - right[1];
  const db = left[2] - right[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** 채도(chroma) = a*, b* 평면에서 원점까지의 거리. */
export function labChroma(a: number, b: number): number {
  return Math.hypot(a, b);
}

/** 색조 각도(도, 0~360). 무채색(채도 0)이면 0. */
export function labHueDegrees(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const degrees = (Math.atan2(b, a) * 180) / Math.PI;
  return degrees < 0 ? degrees + 360 : degrees;
}

/** 두 색조 각도의 차이(0~180도). */
export function hueDifferenceDegrees(left: number, right: number): number {
  const raw = Math.abs(left - right) % 360;
  return raw > 180 ? 360 - raw : raw;
}
