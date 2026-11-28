/**
 * Wave 102 — IEC 61966-2-1 sRGB ↔ Linear ↔ Oklab/OKLCH 정밀 색채 변환 및 6종 물리 조명 프리셋.
 *
 * - Björn Ottosson 공식 Oklab 변환 행렬과 색상각 보존(hue-preserving) 이분 탐색 색역 매핑을 제공한다.
 * - 6종 시간대·분위기 스튜디오 조명 프리셋(`morning-daylight`, `golden-sunset`,
 *   `neon-rain-midnight`, `warm-cafe-interior`, `overcast-melancholy`, `flashback-sepia-memory`)을 정의한다.
 */

export interface SrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface LinearRgbColor {
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
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export type ColorMathInput = OklabColor | OklchColor | SrgbColor;

export type FlatSwatchRole = "skin" | "hair" | "costume" | "prop" | "background";

export interface FlatColorSwatch {
  readonly swatchId: string;
  readonly labelKo: string;
  readonly role: FlatSwatchRole;
  readonly srgb: SrgbColor;
}

export type LightingMoodPresetId =
  | "morning-daylight"
  | "golden-sunset"
  | "neon-rain-midnight"
  | "warm-cafe-interior"
  | "overcast-melancholy"
  | "flashback-sepia-memory";

export interface LightingMoodPreset {
  readonly id: LightingMoodPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly kelvin: number;
  readonly keyLightOklch: OklchColor;
  readonly keyTintStrength: number;
  readonly ambientFillOklch: OklchColor;
  readonly shadowShiftStrength: number;
  readonly shadowLightnessDrop: number;
  readonly litLightnessLift: number;
  readonly rimLightOklch: OklchColor;
  readonly rimStrength: number;
  readonly chromaScale: number;
  readonly midtoneLightnessBias: number;
  readonly contrastGain: number;
  readonly shadowChromaFloorRatio: number;
  readonly defaultSkinAnchorStrength: number;
  readonly maxAllowedSkinHueDriftDeg: number;
}

export const LIGHTING_MOOD_PRESET_IDS: readonly LightingMoodPresetId[] = [
  "morning-daylight",
  "golden-sunset",
  "neon-rain-midnight",
  "warm-cafe-interior",
  "overcast-melancholy",
  "flashback-sepia-memory",
];

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export const LIGHTING_MOOD_PRESETS: Readonly<Record<LightingMoodPresetId, LightingMoodPreset>> = {
  "morning-daylight": {
    id: "morning-daylight",
    labelKo: "아침 자연광",
    descriptionKo: "6000K 선명한 오전 주광과 맑은 하늘색 암부 반사광",
    kelvin: 6000,
    keyLightOklch: { l: 0.96, c: 0.055, h: 86 },
    keyTintStrength: 0.24,
    ambientFillOklch: { l: 0.62, c: 0.095, h: 244 },
    shadowShiftStrength: 0.36,
    shadowLightnessDrop: 0.16,
    litLightnessLift: 0.13,
    rimLightOklch: { l: 0.94, c: 0.075, h: 92 },
    rimStrength: 0.34,
    chromaScale: 1.04,
    midtoneLightnessBias: 0.035,
    contrastGain: 1.05,
    shadowChromaFloorRatio: 0.72,
    defaultSkinAnchorStrength: 0.74,
    maxAllowedSkinHueDriftDeg: 22,
  },
  "golden-sunset": {
    id: "golden-sunset",
    labelKo: "황금 노을",
    descriptionKo: "3200K 호박빛 사광과 깊은 자두·남빛 암부 색온도 대비",
    kelvin: 3200,
    keyLightOklch: { l: 0.82, c: 0.155, h: 56 },
    keyTintStrength: 0.44,
    ambientFillOklch: { l: 0.44, c: 0.125, h: 302 },
    shadowShiftStrength: 0.48,
    shadowLightnessDrop: 0.21,
    litLightnessLift: 0.15,
    rimLightOklch: { l: 0.84, c: 0.185, h: 52 },
    rimStrength: 0.5,
    chromaScale: 1.15,
    midtoneLightnessBias: -0.02,
    contrastGain: 1.18,
    shadowChromaFloorRatio: 0.76,
    defaultSkinAnchorStrength: 0.74,
    maxAllowedSkinHueDriftDeg: 24,
  },
  "neon-rain-midnight": {
    id: "neon-rain-midnight",
    labelKo: "네온 빗속 심야",
    descriptionKo: "7800K 차가운 심야 환경광과 마젠타·시안 림 하이라이트",
    kelvin: 7800,
    keyLightOklch: { l: 0.74, c: 0.15, h: 214 },
    keyTintStrength: 0.58,
    ambientFillOklch: { l: 0.38, c: 0.155, h: 254 },
    shadowShiftStrength: 0.58,
    shadowLightnessDrop: 0.22,
    litLightnessLift: 0.16,
    rimLightOklch: { l: 0.72, c: 0.22, h: 328 },
    rimStrength: 0.56,
    chromaScale: 1.18,
    midtoneLightnessBias: -0.13,
    contrastGain: 1.24,
    shadowChromaFloorRatio: 0.78,
    defaultSkinAnchorStrength: 0.8,
    maxAllowedSkinHueDriftDeg: 24,
  },
  "warm-cafe-interior": {
    id: "warm-cafe-interior",
    labelKo: "따뜻한 카페 실내",
    descriptionKo: "2900K 텅스텐 실내등과 부드러운 황토빛 간접 반사",
    kelvin: 2900,
    keyLightOklch: { l: 0.84, c: 0.13, h: 66 },
    keyTintStrength: 0.4,
    ambientFillOklch: { l: 0.48, c: 0.095, h: 48 },
    shadowShiftStrength: 0.38,
    shadowLightnessDrop: 0.17,
    litLightnessLift: 0.12,
    rimLightOklch: { l: 0.87, c: 0.14, h: 74 },
    rimStrength: 0.36,
    chromaScale: 1.03,
    midtoneLightnessBias: -0.04,
    contrastGain: 1.08,
    shadowChromaFloorRatio: 0.72,
    defaultSkinAnchorStrength: 0.72,
    maxAllowedSkinHueDriftDeg: 22,
  },
  "overcast-melancholy": {
    id: "overcast-melancholy",
    labelKo: "흐린 날 우울",
    descriptionKo: "6800K 확산 저대비 청회색 천공광과 차분한 슬레이트 음영",
    kelvin: 6800,
    keyLightOklch: { l: 0.78, c: 0.068, h: 242 },
    keyTintStrength: 0.34,
    ambientFillOklch: { l: 0.46, c: 0.085, h: 256 },
    shadowShiftStrength: 0.42,
    shadowLightnessDrop: 0.13,
    litLightnessLift: 0.085,
    rimLightOklch: { l: 0.82, c: 0.065, h: 230 },
    rimStrength: 0.24,
    chromaScale: 0.78,
    midtoneLightnessBias: -0.035,
    contrastGain: 0.88,
    shadowChromaFloorRatio: 0.68,
    defaultSkinAnchorStrength: 0.78,
    maxAllowedSkinHueDriftDeg: 22,
  },
  "flashback-sepia-memory": {
    id: "flashback-sepia-memory",
    labelKo: "회상 세피아 기억",
    descriptionKo: "저채도 아카이브 호박·세피아 톤 커브와 부드러운 회상 대비",
    kelvin: 3600,
    keyLightOklch: { l: 0.84, c: 0.072, h: 70 },
    keyTintStrength: 0.6,
    ambientFillOklch: { l: 0.48, c: 0.068, h: 56 },
    shadowShiftStrength: 0.52,
    shadowLightnessDrop: 0.15,
    litLightnessLift: 0.11,
    rimLightOklch: { l: 0.89, c: 0.062, h: 78 },
    rimStrength: 0.28,
    chromaScale: 0.52,
    midtoneLightnessBias: 0.015,
    contrastGain: 0.86,
    shadowChromaFloorRatio: 0.68,
    defaultSkinAnchorStrength: 0.76,
    maxAllowedSkinHueDriftDeg: 24,
  },
};

export function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/** 각도를 `[0, 360)` 범위로 정규화한다. */
export function normalizeHueDeg(hueDeg: number): number {
  if (!Number.isFinite(hueDeg)) {
    return 0;
  }
  const mod = hueDeg % 360;
  return mod < 0 ? mod + 360 : mod;
}

/** 두 색상각 사이의 최단 부호 있는 각도 차(`[-180, +180]`)를 계산한다. */
export function shortestHueDeltaDeg(fromHueDeg: number, toHueDeg: number): number {
  const from = normalizeHueDeg(fromHueDeg);
  const to = normalizeHueDeg(toHueDeg);
  let delta = to - from;
  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }
  return delta;
}

/** 두 색상각 사이를 최단 호(arc)로 선형 보간한다. */
export function interpolateHueDeg(fromHueDeg: number, toHueDeg: number, t: number): number {
  const weight = clampFinite(t, 0, 1);
  return normalizeHueDeg(fromHueDeg + shortestHueDeltaDeg(fromHueDeg, toHueDeg) * weight);
}

/** 단일 sRGB 채널(`[0..255]`)을 Linear RGB(`[0..1]`)로 변환한다. */
export function sRgbChannelToLinear(channel255: number): number {
  const v = clampFinite(channel255 / 255, 0, 1);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** 단일 Linear RGB 채널(`[0..1]`)을 sRGB 정수(`[0..255]`)로 변환한다. */
export function linearChannelToSRgb(linear: number): number {
  const v = clampFinite(linear, 0, 1);
  const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(clampFinite(encoded, 0, 1) * 255);
}

/** sRGB(`[0..255]`)를 선형 광량 Linear RGB(`[0..1]`)로 변환한다. */
export function sRgbToLinear(srgb: SrgbColor): LinearRgbColor {
  return {
    r: sRgbChannelToLinear(srgb.r),
    g: sRgbChannelToLinear(srgb.g),
    b: sRgbChannelToLinear(srgb.b),
  };
}

/** Linear RGB(`[0..1]`)를 정수 sRGB(`[0..255]`)로 변환한다. */
export function linearToSRgb(linear: LinearRgbColor): SrgbColor {
  return {
    r: linearChannelToSRgb(linear.r),
    g: linearChannelToSRgb(linear.g),
    b: linearChannelToSRgb(linear.b),
  };
}

/** Linear RGB를 Björn Ottosson Oklab으로 변환한다. */
export function linearRgbToOklab(linear: LinearRgbColor): OklabColor {
  const lRaw = 0.4122214708 * linear.r + 0.5363325363 * linear.g + 0.0514459929 * linear.b;
  const mRaw = 0.2119034982 * linear.r + 0.6806995451 * linear.g + 0.1073969566 * linear.b;
  const sRaw = 0.0883024619 * linear.r + 0.2817188376 * linear.g + 0.6299787005 * linear.b;

  const l3 = Math.cbrt(lRaw);
  const m3 = Math.cbrt(mRaw);
  const s3 = Math.cbrt(sRaw);

  return {
    l: 0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3,
    a: 1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3,
    b: 0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3,
  };
}

/** Oklab을 클램프 전(raw) Linear RGB로 역변환한다. */
export function oklabToLinearRgbUnclamped(lab: OklabColor): LinearRgbColor {
  const l3 = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m3 = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s3 = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const lVal = l3 * l3 * l3;
  const mVal = m3 * m3 * m3;
  const sVal = s3 * s3 * s3;

  return {
    r: 4.0767416621 * lVal - 3.3077115913 * mVal + 0.2309699292 * sVal,
    g: -1.2684380046 * lVal + 2.6097574011 * mVal - 0.3413193965 * sVal,
    b: -0.0041960863 * lVal - 0.7034186147 * mVal + 1.707614701 * sVal,
  };
}

/** Oklab ↔ OKLCH 극좌표 변환. */
export function oklabToOklch(lab: OklabColor): OklchColor {
  const l = clampFinite(lab.l, 0, 1);
  const c = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  const h = c < 1e-6 ? 0 : normalizeHueDeg(Math.atan2(lab.b, lab.a) * RAD_TO_DEG);
  return { l, c, h };
}

export function oklchToOklab(lch: OklchColor): OklabColor {
  const l = clampFinite(lch.l, 0, 1);
  const c = Math.max(0, Number.isFinite(lch.c) ? lch.c : 0);
  const rad = normalizeHueDeg(lch.h) * DEG_TO_RAD;
  return {
    l,
    a: c * Math.cos(rad),
    b: c * Math.sin(rad),
  };
}

function isLinearRgbInGamut(rgb: LinearRgbColor, eps = 1e-6): boolean {
  return (
    rgb.r >= -eps &&
    rgb.r <= 1 + eps &&
    rgb.g >= -eps &&
    rgb.g <= 1 + eps &&
    rgb.b >= -eps &&
    rgb.b <= 1 + eps
  );
}

/** 주어진 명도 `l`과 색상각 `h`에서 sRGB 색역 내부의 최대 채도를 이분 탐색으로 구한다. */
export function findMaxInGamutChroma(l: number, h: number): number {
  const safeL = clampFinite(l, 0, 1);
  if (safeL <= 1e-5 || safeL >= 1 - 1e-5) {
    return 0;
  }
  const rad = normalizeHueDeg(h) * DEG_TO_RAD;
  const cosH = Math.cos(rad);
  const sinH = Math.sin(rad);

  let low = 0;
  let high = 0.42;
  for (let i = 0; i < 20; i += 1) {
    const mid = (low + high) * 0.5;
    const candidate = oklabToLinearRgbUnclamped({ l: safeL, a: mid * cosH, b: mid * sinH });
    if (isLinearRgbInGamut(candidate, 0)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return low;
}

/** 색상각(`h`)과 명도(`l`)를 유지한 채 채도만 부드럽게 축소해 sRGB 색역 안으로 매핑한다. */
export function gamutMapOklch(color: OklchColor): OklchColor {
  const l = clampFinite(color.l, 0, 1);
  const c = Math.max(0, Number.isFinite(color.c) ? color.c : 0);
  const h = normalizeHueDeg(color.h);
  if (l <= 1e-5) {
    return { l: 0, c: 0, h: 0 };
  }
  if (l >= 1 - 1e-5) {
    return { l: 1, c: 0, h: 0 };
  }
  const rawRgb = oklabToLinearRgbUnclamped(oklchToOklab({ l, c, h }));
  if (isLinearRgbInGamut(rawRgb, 1e-6)) {
    return { l, c, h: c < 1e-6 ? 0 : h };
  }
  const maxC = findMaxInGamutChroma(l, h);
  const mappedC = Math.min(c, maxC);
  return { l, c: mappedC, h: mappedC < 1e-6 ? 0 : h };
}

/** sRGB(`[0..255]`)를 Oklab으로 변환한다. */
export function sRgbToOklab(srgb: SrgbColor): OklabColor {
  return linearRgbToOklab(sRgbToLinear(srgb));
}

/** sRGB(`[0..255]`)를 OKLCH로 변환한다. */
export function sRgbToOklch(srgb: SrgbColor): OklchColor {
  return oklabToOklch(sRgbToOklab(srgb));
}

/** OKLCH를 색상각 보존 색역 매핑을 거쳐 유효한 sRGB 정수(`[0..255]`)로 변환한다. */
export function oklchToSRgb(color: OklchColor): SrgbColor {
  const mapped = gamutMapOklch(color);
  const linear = oklabToLinearRgbUnclamped(oklchToOklab(mapped));
  return linearToSRgb(linear);
}

/** Oklab을 색상각 보존 색역 매핑을 거쳐 유효한 sRGB 정수(`[0..255]`)로 변환한다. */
export function oklabToSRgb(lab: OklabColor): SrgbColor {
  return oklchToSRgb(oklabToOklch(lab));
}

function toOklabInternal(input: ColorMathInput): OklabColor {
  if ("r" in input) {
    return sRgbToOklab(input);
  }
  if ("c" in input) {
    return oklchToOklab(input);
  }
  return input;
}

/** 두 색(`OklabColor`, `OklchColor`, 또는 `SrgbColor`) 사이의 유클리드 Oklab 지각 색차 `ΔE`를 계산한다. */
export function computeOklabDeltaE(first: ColorMathInput, second: ColorMathInput): number {
  const a = toOklabInternal(first);
  const b = toOklabInternal(second);
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.b - b.b;
  const dist = Math.sqrt(dl * dl + da * da + db * db);
  return Number.isFinite(dist) ? dist : 0;
}

/** OKLCH 색상을 CSS Color 4 `oklch(L C H)` 문자열로 직렬화한다. */
export function formatOklchCss(color: OklchColor, alpha?: number): string {
  const l = clampFinite(color.l, 0, 1);
  const c = Math.max(0, Number.isFinite(color.c) ? color.c : 0);
  const h = normalizeHueDeg(color.h);
  const base = `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;
  if (alpha === undefined || alpha >= 0.999) {
    return base;
  }
  const safeAlpha = clampFinite(alpha, 0, 1);
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)} / ${safeAlpha.toFixed(3)})`;
}

export function getLightingMoodPreset(presetId: LightingMoodPresetId): LightingMoodPreset {
  return LIGHTING_MOOD_PRESETS[presetId];
}
