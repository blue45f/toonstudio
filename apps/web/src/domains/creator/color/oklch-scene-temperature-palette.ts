/**
 * 장면 조명 색온도(2700K~8500K) 연동 OKLCH 3-톤(광원·중간·반사광) 자동 스와치 생성기.
 *
 * - Björn Ottosson 정확한 sRGB ↔ Linear sRGB ↔ OKLab ↔ OKLCH 변환 + 색역 이진 탐색 클램핑
 * - 난색 광원(2700K~5600K)에서는 하이라이트를 난색으로, 그림자를 한색(남보라/인디고)으로 자동 이동시켜
 *   단순 회색 Multiply 시 발생하는 탁한 회색 뭉개짐(muddy gray collapse)을 방지한다.
 * - 한색 광원(6000K~8500K)에서는 청색 주광 하이라이트와 깊은 보라·환경 반사광으로 3-톤 입체감을 유지한다.
 * - 순수 TypeScript 모듈(DOM·Storage 의존성 0, 결정론 출력).
 */

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export type RgbTuple = readonly [number, number, number];

export type OklchThreeToneRole = "light" | "midtone" | "bounce" | "shadow";

export interface OklchToneSwatch {
  readonly role: OklchThreeToneRole;
  readonly labelKo: string;
  readonly hex: string;
  readonly rgb: RgbTuple;
  readonly oklch: OklchColor;
  readonly cssOklch: string;
}

export interface SceneTemperaturePreset {
  readonly id: string;
  readonly kelvin: number;
  readonly labelKo: string;
  readonly descriptionKo: string;
}

export interface SceneLightTemperatureProfile {
  readonly kelvin: number;
  /** +1(2700K 매우 따뜻함) ~ 0(5600K 주간 중립) ~ -1(8500K 차가운 달빛). */
  readonly warmth: number;
  readonly lightRgb: RgbTuple;
  readonly lightHex: string;
  readonly lightOklch: OklchColor;
  readonly highlightTargetHueDeg: number;
  readonly shadowTargetHueDeg: number;
  readonly bounceTargetHueDeg: number;
}

export interface OklchMultiplyMudAudit {
  readonly naiveMultiplyShadowHex: string;
  readonly naiveMultiplyChroma: number;
  readonly oklchShadowChroma: number;
  readonly chromaRetentionRatio: number;
  readonly shadowHueShiftDeg: number;
  readonly highlightHueShiftDeg: number;
  readonly preventsMuddyMultiply: boolean;
}

export interface OklchThreeToneOptions {
  /** 장면 조명 색온도 (2700K ~ 8500K, 기본 5500K). */
  readonly kelvin?: number;
  /** 명암 대비 강도 (0.5 ~ 1.5, 기본 1.0). */
  readonly contrast?: number;
  /** 음영 채도 보존/보강 강도 (0 ~ 1, 기본 0.75). */
  readonly chromaPreserve?: number;
  /** 선택적 바닥/배경 반사광 기준색(#RRGGBB). */
  readonly bounceColorHex?: string;
  /** 반사광 환경색 혼합 비율 (0 ~ 0.6, 기본 0.32). */
  readonly bounceStrength?: number;
}

export interface OklchThreeTonePalette {
  readonly baseHex: string;
  readonly kelvin: number;
  readonly lightProfile: SceneLightTemperatureProfile;
  /** 핵심 3-톤 스와치 튜플: [광원, 중간, 반사광]. */
  readonly swatches: readonly [OklchToneSwatch, OklchToneSwatch, OklchToneSwatch];
  readonly lightTone: OklchToneSwatch;
  readonly midTone: OklchToneSwatch;
  readonly bounceTone: OklchToneSwatch;
  /** 셀 음영·자동 명암 패널과 연동되는 한색 이동 핵심 그림자. */
  readonly coreShadow: OklchToneSwatch;
  /** UI 스와치 스트립용 [광원, 중간, 그림자, 반사광] HEX 배열. */
  readonly orderedHexSwatches: readonly [string, string, string, string];
  readonly multiplyMudAudit: OklchMultiplyMudAudit;
}

export const SCENE_TEMPERATURE_KELVIN_RANGE = Object.freeze({
  min: 2700,
  max: 8500,
  step: 100,
  defaultKelvin: 5500,
} as const);

export const SCENE_TEMPERATURE_PRESETS: readonly SceneTemperaturePreset[] = Object.freeze([
  { id: "candle-indoor", kelvin: 2700, labelKo: "촛불·백열등 (2700K)", descriptionKo: "따뜻한 호박빛 광원 · 짙은 남보라 그림자" },
  { id: "sunset-golden", kelvin: 3200, labelKo: "노을·석양 (3200K)", descriptionKo: "금빛 하이라이트 · 차가운 보라 음영" },
  { id: "dawn-window", kelvin: 4500, labelKo: "새벽·창가광 (4500K)", descriptionKo: "부드러운 난색광 · 청보라 그림자" },
  { id: "daylight-neutral", kelvin: 5500, labelKo: "주간 자연광 (5500K)", descriptionKo: "균형 잡힌 주광 · 맑은 쿨톤 음영" },
  { id: "d65-standard", kelvin: 6500, labelKo: "표준 주광 D65 (6500K)", descriptionKo: "중립 기준광 · 선명한 명암 분리" },
  { id: "overcast-shade", kelvin: 7500, labelKo: "흐린 하늘 (7500K)", descriptionKo: "서늘한 하늘광 · 깊은 청회 음영" },
  { id: "moonlight-night", kelvin: 8500, labelKo: "달빛·야경 (8500K)", descriptionKo: "차가운 청색광 · 감성 반사광 대비" },
]);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function round4(value: number): number {
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeHueDeg(hue: number): number {
  if (!Number.isFinite(hue)) return 0;
  return ((hue % 360) + 360) % 360;
}

/** `from`에서 `to`로 향하는 최단 각도 차(-180 ~ +180). */
export function shortestHueDeltaDeg(fromDeg: number, toDeg: number): number {
  const diff = ((toDeg - fromDeg + 540) % 360) - 180;
  return diff < -180 ? diff + 360 : diff;
}

export function clampSceneTemperatureKelvin(kelvin: number | undefined): number {
  if (typeof kelvin !== "number" || !Number.isFinite(kelvin)) {
    return SCENE_TEMPERATURE_KELVIN_RANGE.defaultKelvin;
  }
  return Math.round(clamp(kelvin, SCENE_TEMPERATURE_KELVIN_RANGE.min, SCENE_TEMPERATURE_KELVIN_RANGE.max));
}

export function normalizeHexInput(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/u.exec(trimmed);
  if (short) {
    const [r, g, b] = short[1]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const full = /^#([0-9a-f]{6})$/u.exec(trimmed);
  if (full) {
    return `#${full[1]!}`;
  }
  return "#808080";
}

export function parseHexToRgb(raw: string): RgbTuple {
  const hex = normalizeHexInput(raw);
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function formatRgbToHex(rgb: RgbTuple): string {
  const r = Math.round(clamp(rgb[0], 0, 255));
  const g = Math.round(clamp(rgb[1], 0, 255));
  const b = Math.round(clamp(rgb[2], 0, 255));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function srgbChannelToLinear(channel255: number): number {
  const s = clamp(channel255 / 255, 0, 1);
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function linearChannelToSrgb255(linear: number): number {
  const c = clamp(linear, 0, 1);
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * (c ** (1 / 2.4)) - 0.055;
  return Math.round(clamp(s, 0, 1) * 255);
}

export function rgbToOklch(rgb: RgbTuple): OklchColor {
  const r = srgbChannelToLinear(rgb[0]);
  const g = srgbChannelToLinear(rgb[1]);
  const b = srgbChannelToLinear(rgb[2]);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lCbrt = Math.cbrt(l);
  const mCbrt = Math.cbrt(m);
  const sCbrt = Math.cbrt(s);

  const L = 0.2104542553 * lCbrt + 0.7936177850 * mCbrt - 0.0040720468 * sCbrt;
  const a = 1.9779984951 * lCbrt - 2.4285922050 * mCbrt + 0.4505937099 * sCbrt;
  const bLab = 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.8086757660 * sCbrt;

  const c = Math.hypot(a, bLab);
  const h = c < 1e-6 ? 0 : normalizeHueDeg((Math.atan2(bLab, a) * 180) / Math.PI);
  return {
    l: round4(clamp(L, 0, 1)),
    c: round4(Math.max(0, c)),
    h: round4(h),
  };
}

export function hexToOklch(hex: string): OklchColor {
  return rgbToOklch(parseHexToRgb(hex));
}

function oklchToLinearRgbRaw(L: number, c: number, hDeg: number): readonly [number, number, number] {
  const hRad = (normalizeHueDeg(hDeg) * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const lCbrt = L + 0.3963377774 * a + 0.2158037573 * b;
  const mCbrt = L - 0.1055613458 * a - 0.0638541728 * b;
  const sCbrt = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = lCbrt * lCbrt * lCbrt;
  const m = mCbrt * mCbrt * mCbrt;
  const s = sCbrt * sCbrt * sCbrt;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function isInSrgbGamut(rgb: readonly [number, number, number]): boolean {
  const eps = 1e-5;
  return (
    rgb[0] >= -eps && rgb[0] <= 1 + eps
    && rgb[1] >= -eps && rgb[1] <= 1 + eps
    && rgb[2] >= -eps && rgb[2] <= 1 + eps
  );
}

/** 색상을 유지하면서 sRGB 색역 안으로 채도만 이진 탐색 클램핑한다. */
export function gamutMapOklchToRgb(color: OklchColor): { readonly rgb: RgbTuple; readonly oklch: OklchColor } {
  const L = clamp(color.l, 0, 1);
  const h = normalizeHueDeg(color.h);
  const targetC = Math.max(0, Number.isFinite(color.c) ? color.c : 0);

  if (L <= 1e-4) {
    return { rgb: [0, 0, 0], oklch: { l: 0, c: 0, h } };
  }
  if (L >= 1 - 1e-4) {
    return { rgb: [255, 255, 255], oklch: { l: 1, c: 0, h } };
  }

  let linear = oklchToLinearRgbRaw(L, targetC, h);
  let mappedC = targetC;
  if (!isInSrgbGamut(linear)) {
    let lo = 0;
    let hi = targetC;
    for (let step = 0; step < 18; step += 1) {
      const mid = (lo + hi) * 0.5;
      const probe = oklchToLinearRgbRaw(L, mid, h);
      if (isInSrgbGamut(probe)) {
        lo = mid;
        linear = probe;
      } else {
        hi = mid;
      }
    }
    mappedC = lo;
  }

  const rgb: RgbTuple = [
    linearChannelToSrgb255(linear[0]),
    linearChannelToSrgb255(linear[1]),
    linearChannelToSrgb255(linear[2]),
  ];
  return {
    rgb,
    oklch: { l: round4(L), c: round4(mappedC), h: round4(h) },
  };
}

export function oklchToHex(color: OklchColor): string {
  return formatRgbToHex(gamutMapOklchToRgb(color).rgb);
}

export function formatOklchCss(color: OklchColor): string {
  const l = round4(clamp(color.l, 0, 1));
  const c = round4(Math.max(0, color.c));
  const h = round4(normalizeHueDeg(color.h));
  return `oklch(${l} ${c} ${h})`;
}

/**
 * 색온도(2700K~8500K)를 흑체 복사 근사 기반 장면 광원 프로파일로 변환한다.
 * 난색 광원은 따뜻한 하이라이트(~75°~90°)와 한색 그림자(~268°~282°)로,
 * 한색 광원은 서늘한 청색 하이라이트(~230°~250°)와 깊은 보라·환경 반사광으로 매핑한다.
 */
export function kelvinToSceneLightProfile(kelvinInput: number): SceneLightTemperatureProfile {
  const kelvin = clampSceneTemperatureKelvin(kelvinInput);
  const temp = kelvin / 100;

  let r: number;
  let g: number;
  let b: number;
  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * ((temp - 60) ** -0.1332047592);
    g = 288.1221695283 * ((temp - 60) ** -0.0755148492);
    b = 255;
  }

  const lightRgb: RgbTuple = [
    Math.round(clamp(r, 0, 255)),
    Math.round(clamp(g, 0, 255)),
    Math.round(clamp(b, 0, 255)),
  ];
  const lightHex = formatRgbToHex(lightRgb);
  const lightOklch = rgbToOklch(lightRgb);

  // 5600K 기준: 2700K -> +1.0 (매우 따뜻함), 8500K -> -1.0 (매우 차가움)
  const warmth = kelvin <= 5600
    ? round4(clamp((5600 - kelvin) / (5600 - 2700), 0, 1))
    : round4(-clamp((kelvin - 5600) / (8500 - 5600), 0, 1));

  // 광원 색온도에 따른 하이라이트·그림자·반사광 목표 색상각
  const highlightTargetHueDeg = warmth >= 0
    ? round4(88 - warmth * 16) // 88°(따뜻한 주광) → 72°(촛불 호박빛)
    : round4(225 + (-warmth) * 28); // 225°(시안 주광) → 253°(청색 달빛)

  const shadowTargetHueDeg = warmth >= 0
    ? round4(268 + warmth * 14) // 268°(쿨 인디고) → 282°(남보라 한색 그림자)
    : round4(295 + (-warmth) * 25); // 295°~320°(차가운 밤의 깊은 자줏빛 그림자)

  const bounceTargetHueDeg = warmth >= 0
    ? round4(242 + warmth * 16) // 난색 장면의 하늘/주변광 한색 반사
    : round4(62 - (-warmth) * 14); // 한색 야경에서 실내/지면 난색 반사 대비

  return {
    kelvin,
    warmth,
    lightRgb,
    lightHex,
    lightOklch,
    highlightTargetHueDeg,
    shadowTargetHueDeg,
    bounceTargetHueDeg,
  };
}

function buildSwatch(role: OklchThreeToneRole, labelKo: string, target: OklchColor): OklchToneSwatch {
  const mapped = gamutMapOklchToRgb(target);
  const hex = formatRgbToHex(mapped.rgb);
  return {
    role,
    labelKo,
    hex,
    rgb: mapped.rgb,
    oklch: mapped.oklch,
    cssOklch: formatOklchCss(mapped.oklch),
  };
}

function shiftHueToward(baseHue: number, targetHue: number, maxStepDeg: number, blendFactor: number): number {
  const delta = shortestHueDeltaDeg(baseHue, targetHue);
  const step = clamp(delta * blendFactor, -maxStepDeg, maxStepDeg);
  return normalizeHueDeg(baseHue + step);
}

/**
 * 기준 밑색(`baseHex`)과 장면 조명 색온도(`2700K~8500K`)로 OKLCH 3-톤(광원·중간·반사광)과
 * 한색 이동 핵심 그림자, 그리고 단순 회색 Multiply 대비 탁함 방지 검증 리포트를 생성한다.
 */
export function generateOklchThreeTonePalette(
  baseHexInput: string,
  options: OklchThreeToneOptions = {},
): OklchThreeTonePalette {
  const baseHex = normalizeHexInput(baseHexInput);
  const baseRgb = parseHexToRgb(baseHex);
  const baseOklch = rgbToOklch(baseRgb);
  const lightProfile = kelvinToSceneLightProfile(options.kelvin ?? SCENE_TEMPERATURE_KELVIN_RANGE.defaultKelvin);
  const contrast = clamp(options.contrast ?? 1.0, 0.5, 1.5);
  const chromaPreserve = clamp(options.chromaPreserve ?? 0.75, 0, 1);
  const bounceStrength = clamp(options.bounceStrength ?? 0.32, 0, 0.6);

  const isAchromatic = baseOklch.c < 0.015;
  const effectiveBaseHue = isAchromatic
    ? (lightProfile.warmth >= 0 ? lightProfile.highlightTargetHueDeg : lightProfile.shadowTargetHueDeg)
    : baseOklch.h;

  // 1) 광원(하이라이트): 난색 광원일수록 황금/호박쪽으로, 한색 광원일수록 청백쪽으로 부드럽게 이동
  const lightL = clamp(
    baseOklch.l + (0.14 + 0.05 * contrast) * (1 - baseOklch.l * 0.38),
    Math.min(0.97, baseOklch.l + 0.08),
    0.97,
  );
  const lightHueBlend = 0.24 + Math.abs(lightProfile.warmth) * 0.24;
  const lightHue = isAchromatic
    ? lightProfile.highlightTargetHueDeg
    : shiftHueToward(effectiveBaseHue, lightProfile.highlightTargetHueDeg, 32, lightHueBlend);
  const lightChroma = isAchromatic
    ? clamp(0.025 + Math.abs(lightProfile.warmth) * 0.045, 0.015, 0.08)
    : clamp(baseOklch.c * (0.94 + Math.abs(lightProfile.warmth) * 0.1), 0.025, 0.26);

  const lightTone = buildSwatch("light", "광원", { l: lightL, c: lightChroma, h: lightHue });

  // 2) 중간(밑색 기준)
  const midTone: OklchToneSwatch = {
    role: "midtone",
    labelKo: "중간",
    hex: baseHex,
    rgb: baseRgb,
    oklch: baseOklch,
    cssOklch: formatOklchCss(baseOklch),
  };

  // 3) 핵심 그림자(한색 이동 + 채도 보강으로 탁한 회색 Multiply 방지)
  const shadowDrop = (0.18 + 0.06 * contrast) * (0.55 + baseOklch.l * 0.65);
  const shadowL = clamp(baseOklch.l - shadowDrop, 0.14, Math.max(0.14, baseOklch.l - 0.1));
  const shadowHueBlend = 0.3 + Math.abs(lightProfile.warmth) * 0.22;
  const shadowHue = isAchromatic
    ? lightProfile.shadowTargetHueDeg
    : shiftHueToward(effectiveBaseHue, lightProfile.shadowTargetHueDeg, 38, shadowHueBlend);
  const shadowChroma = isAchromatic
    ? clamp(0.045 + chromaPreserve * 0.035, 0.035, 0.095)
    : clamp(baseOklch.c * (1.06 + chromaPreserve * 0.16), Math.max(0.055, baseOklch.c * 1.02), 0.28);

  const coreShadow = buildSwatch("shadow", "그림자", { l: shadowL, c: shadowChroma, h: shadowHue });

  // 4) 반사광(음영부 내부 환경 반사광 — 핵심 그림자보다 밝고 환경색/보색 뉘앙스 유지)
  const envBounceHue = options.bounceColorHex
    ? hexToOklch(options.bounceColorHex).h
    : lightProfile.bounceTargetHueDeg;
  const bounceL = clamp(
    coreShadow.oklch.l + 0.065 + 0.035 * contrast,
    Math.min(0.86, coreShadow.oklch.l + 0.05),
    Math.max(coreShadow.oklch.l + 0.05, baseOklch.l - 0.04),
  );
  const bounceHue = isAchromatic
    ? envBounceHue
    : shiftHueToward(coreShadow.oklch.h, envBounceHue, 48, 0.38 + bounceStrength);
  const bounceChroma = isAchromatic
    ? clamp(0.055 + bounceStrength * 0.06, 0.04, 0.12)
    : clamp(
        Math.max(baseOklch.c * 0.96, coreShadow.oklch.c * 0.92) + bounceStrength * 0.03,
        0.045,
        0.24,
      );

  const bounceTone = buildSwatch("bounce", "반사광", { l: bounceL, c: bounceChroma, h: bounceHue });

  // 단순 회색 Multiply(0.58 배수) 비교 감사
  const multiplyFactor = clamp(0.62 - (contrast - 1) * 0.08, 0.48, 0.72);
  const naiveMultiplyRgb: RgbTuple = [
    Math.round(baseRgb[0] * multiplyFactor),
    Math.round(baseRgb[1] * multiplyFactor),
    Math.round(baseRgb[2] * multiplyFactor),
  ];
  const naiveMultiplyOklch = rgbToOklch(naiveMultiplyRgb);
  const naiveChroma = naiveMultiplyOklch.c;
  const chromaRetentionRatio = naiveChroma > 1e-4
    ? round4(coreShadow.oklch.c / naiveChroma)
    : coreShadow.oklch.c > 0.02 ? 2.0 : 1.0;

  const shadowHueShiftDeg = round4(
    Math.abs(shortestHueDeltaDeg(baseOklch.h, coreShadow.oklch.h)),
  );
  const highlightHueShiftDeg = round4(
    Math.abs(shortestHueDeltaDeg(baseOklch.h, lightTone.oklch.h)),
  );
  const preventsMuddyMultiply =
    coreShadow.oklch.c > naiveChroma + 0.002
    && (isAchromatic ? coreShadow.oklch.c >= 0.03 : shadowHueShiftDeg >= 2.0 || coreShadow.oklch.c > naiveChroma * 1.05);

  return {
    baseHex,
    kelvin: lightProfile.kelvin,
    lightProfile,
    swatches: [lightTone, midTone, bounceTone],
    lightTone,
    midTone,
    bounceTone,
    coreShadow,
    orderedHexSwatches: [lightTone.hex, midTone.hex, coreShadow.hex, bounceTone.hex],
    multiplyMudAudit: {
      naiveMultiplyShadowHex: formatRgbToHex(naiveMultiplyRgb),
      naiveMultiplyChroma: naiveChroma,
      oklchShadowChroma: coreShadow.oklch.c,
      chromaRetentionRatio,
      shadowHueShiftDeg,
      highlightHueShiftDeg,
      preventsMuddyMultiply,
    },
  };
}
