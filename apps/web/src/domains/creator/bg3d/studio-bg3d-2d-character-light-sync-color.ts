/**
 * 3D 배경 → 2D 캐릭터 광원 동기화용 색온도(Kelvin)·sRGB·OKLCH 순수 색채 계산 모듈.
 *
 * - Tanner Helland 흑체 근사(2400K~10000K → sRGB)
 * - CIE XYZ(McCamy) 기반 3D 키 라이트 색온도 역추정(네온 극채도 안전 폴백 포함)
 * - IEC 61966-2-1 sRGB ↔ Linear sRGB ↔ Björn Ottosson OKLab/OKLCH 변환 및
 *   색상(H)·명도(L)를 보존하는 이진 탐색 sRGB 색역 압축
 */

export const STUDIO_BG3D_2D_LIGHT_SYNC_MIN_KELVIN = 2_400;
export const STUDIO_BG3D_2D_LIGHT_SYNC_MAX_KELVIN = 10_000;
export const STUDIO_BG3D_2D_LIGHT_SYNC_NEUTRAL_KELVIN = 5_800;
export const STUDIO_BG3D_2D_LIGHT_SYNC_DEFAULT_AMBIENT_HEX = "#dbe5f0";

export interface StudioBg3d2dLightSyncOklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export interface StudioBg3d2dLightSyncColor {
  readonly srgbHex: string;
  readonly rgb: readonly [number, number, number];
  readonly oklch: StudioBg3d2dLightSyncOklch;
  readonly oklchCss: string;
}

export interface LightSyncOklabTuple {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/iu;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function clampLightSyncNumber(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  const finite = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, finite));
}

export function clampLightSync01(value: number): number {
  return clampLightSyncNumber(value, 0, 1, 0);
}

export function roundLightSync(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function deepFreezeLightSync<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeLightSync(child);
  }
  return Object.freeze(value);
}

/** 방위각을 표준 -180°..180° 범위로 정규화한다. */
export function normalizeAzimuthDeg(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  let wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  if (Math.abs(wrapped + 180) <= 1e-9) wrapped = 180;
  return roundLightSync(wrapped, 2);
}

/** #rgb / #rrggbb 헥스 색상을 소문자 #rrggbb로 정규화한다. */
export function normalizeLightSyncHex(
  value: unknown,
  fallback = STUDIO_BG3D_2D_LIGHT_SYNC_DEFAULT_AMBIENT_HEX,
): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  const match = HEX_COLOR_RE.exec(trimmed);
  if (!match) return fallback;
  const body = match[1]?.toLowerCase() ?? "";
  if (body.length === 3) {
    const r = body[0] ?? "0";
    const g = body[1] ?? "0";
    const b = body[2] ?? "0";
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return `#${body}`;
}

function hexToRgbTuple(hex: string): readonly [number, number, number] {
  const safe = normalizeLightSyncHex(hex, "#ffffff");
  return [
    Number.parseInt(safe.slice(1, 3), 16),
    Number.parseInt(safe.slice(3, 5), 16),
    Number.parseInt(safe.slice(5, 7), 16),
  ];
}

function channelToHex(channel: number): string {
  return Math.round(clampLightSyncNumber(channel, 0, 255, 0)).toString(16).padStart(2, "0");
}

function rgbTupleToHex(rgb: readonly [number, number, number]): string {
  return `#${channelToHex(rgb[0])}${channelToHex(rgb[1])}${channelToHex(rgb[2])}`;
}

function srgbChannelToLinear(channel01: number): number {
  const c = clampLightSync01(channel01);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb(linear: number): number {
  const c = clampLightSync01(linear);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * (c ** (1 / 2.4)) - 0.055;
}

function linearRgbToOklab(r: number, g: number, b: number): LightSyncOklabTuple {
  const l = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const m = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const s = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToUnclampedLinearRgb(lab: LightSyncOklabTuple): readonly [number, number, number] {
  const lPrime = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mPrime = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sPrime = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l3 = lPrime * lPrime * lPrime;
  const m3 = mPrime * mPrime * mPrime;
  const s3 = sPrime * sPrime * sPrime;

  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

function isInsideLinearSrgbGamut(rgb: readonly [number, number, number]): boolean {
  const eps = 1e-5;
  return (
    rgb[0] >= -eps && rgb[0] <= 1 + eps
    && rgb[1] >= -eps && rgb[1] <= 1 + eps
    && rgb[2] >= -eps && rgb[2] <= 1 + eps
  );
}

export function oklabToOklch(lab: LightSyncOklabTuple): StudioBg3d2dLightSyncOklch {
  const c = Math.hypot(lab.a, lab.b);
  const rawHue = c < 1e-6 ? 0 : (Math.atan2(lab.b, lab.a) * RAD_TO_DEG + 360) % 360;
  return {
    l: roundLightSync(clampLightSync01(lab.l), 4),
    c: roundLightSync(Math.max(0, c), 4),
    h: roundLightSync(rawHue, 2),
  };
}

function oklchToOklab(oklch: StudioBg3d2dLightSyncOklch): LightSyncOklabTuple {
  const rad = oklch.h * DEG_TO_RAD;
  return {
    l: clampLightSync01(oklch.l),
    a: Math.max(0, oklch.c) * Math.cos(rad),
    b: Math.max(0, oklch.c) * Math.sin(rad),
  };
}

function formatOklchCss(oklch: StudioBg3d2dLightSyncOklch): string {
  return `oklch(${roundLightSync(oklch.l, 4)} ${roundLightSync(oklch.c, 4)} ${roundLightSync(oklch.h, 2)})`;
}

/** sRGB 헥스를 sRGB + OKLCH 동기화 색상 토큰으로 변환한다. */
export function srgbHexToLightSyncColor(hex: string): StudioBg3d2dLightSyncColor {
  const srgbHex = normalizeLightSyncHex(hex, "#ffffff");
  const rgb = hexToRgbTuple(srgbHex);
  const lab = linearRgbToOklab(
    srgbChannelToLinear(rgb[0] / 255),
    srgbChannelToLinear(rgb[1] / 255),
    srgbChannelToLinear(rgb[2] / 255),
  );
  const oklch = oklabToOklch(lab);
  return deepFreezeLightSync({
    srgbHex,
    rgb,
    oklch,
    oklchCss: formatOklchCss(oklch),
  });
}

/**
 * OKLCH 목표 색상을 색상(H)·명도(L)를 유지한 채 sRGB 색역으로 안전 압축해
 * sRGB와 OKLCH가 일치하는 색상 토큰을 만든다.
 */
export function oklchToLightSyncColor(target: StudioBg3d2dLightSyncOklch): StudioBg3d2dLightSyncColor {
  const safeL = clampLightSync01(target.l);
  const safeH = ((Number.isFinite(target.h) ? target.h : 0) % 360 + 360) % 360;
  const requestedC = Math.max(0, Number.isFinite(target.c) ? target.c : 0);

  let chosenLinear = oklabToUnclampedLinearRgb(oklchToOklab({ l: safeL, c: requestedC, h: safeH }));
  if (!isInsideLinearSrgbGamut(chosenLinear) && requestedC > 0) {
    let low = 0;
    let high = requestedC;
    for (let step = 0; step < 14; step += 1) {
      const mid = (low + high) * 0.5;
      const candidate = oklabToUnclampedLinearRgb(oklchToOklab({ l: safeL, c: mid, h: safeH }));
      if (isInsideLinearSrgbGamut(candidate)) {
        low = mid;
        chosenLinear = candidate;
      } else {
        high = mid;
      }
    }
  }

  const rgb: readonly [number, number, number] = [
    Math.round(linearChannelToSrgb(chosenLinear[0]) * 255),
    Math.round(linearChannelToSrgb(chosenLinear[1]) * 255),
    Math.round(linearChannelToSrgb(chosenLinear[2]) * 255),
  ];
  return srgbHexToLightSyncColor(rgbTupleToHex(rgb));
}

export function mixLightSyncOklab(
  first: StudioBg3d2dLightSyncColor,
  second: StudioBg3d2dLightSyncColor,
  ratioSecond: number,
): LightSyncOklabTuple {
  const t = clampLightSync01(ratioSecond);
  const lab1 = oklchToOklab(first.oklch);
  const lab2 = oklchToOklab(second.oklch);
  return {
    l: lab1.l + (lab2.l - lab1.l) * t,
    a: lab1.a + (lab2.a - lab1.a) * t,
    b: lab1.b + (lab2.b - lab1.b) * t,
  };
}

/**
 * 색온도(Kelvin 2400K~10000K)를 결정적 sRGB 헥스로 변환한다(Tanner Helland 흑체 근사).
 */
export function kelvinToSrgbHex(kelvin: number): string {
  const clamped = clampLightSyncNumber(
    kelvin,
    STUDIO_BG3D_2D_LIGHT_SYNC_MIN_KELVIN,
    STUDIO_BG3D_2D_LIGHT_SYNC_MAX_KELVIN,
    6_500,
  );
  const temp = clamped / 100;
  let red: number;
  let green: number;
  let blue: number;

  if (temp <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temp) - 161.1195681661;
    blue = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * ((temp - 60) ** -0.1332047592);
    green = 288.1221695283 * ((temp - 60) ** -0.0755148492);
    blue = 255;
  }

  return rgbTupleToHex([red, green, blue]);
}

/**
 * 3D 씬 키 라이트 sRGB 색상에서 근사 색온도(2400K~10000K)를 역추정한다.
 * CIE XYZ 색도(McCamy 공식)를 우선 사용하고, 흑체 궤적에서 크게 벗어난 네온 색상은
 * R-B 상대 온도로 안전하게 2400K~10000K 구간에 사상한다.
 */
export function estimateColorTemperatureKFromHex(hex: string): number {
  const rgb = hexToRgbTuple(hex);
  const r = srgbChannelToLinear(rgb[0] / 255);
  const g = srgbChannelToLinear(rgb[1] / 255);
  const b = srgbChannelToLinear(rgb[2] / 255);

  const xBig = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const yBig = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const zBig = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  const sum = xBig + yBig + zBig;

  if (sum < 1e-6) return 6_500;

  const x = xBig / sum;
  const y = yBig / sum;
  const denom = 0.1858 - y;

  const chromaSpan = Math.max(r, g, b) - Math.min(r, g, b);
  if (Math.abs(denom) < 0.035 || y < 0.18 || (chromaSpan > 0.72 && g > r * 1.35)) {
    const warmth = clampLightSyncNumber((r - b) / Math.max(0.05, r + b), -1, 1, 0);
    return Math.round(
      clampLightSyncNumber(
        6_500 - warmth * 3_500,
        STUDIO_BG3D_2D_LIGHT_SYNC_MIN_KELVIN,
        STUDIO_BG3D_2D_LIGHT_SYNC_MAX_KELVIN,
        6_500,
      ),
    );
  }

  const n = (x - 0.332) / denom;
  const cct = 449 * n * n * n + 3525 * n * n + 6823.3 * n + 5520.33;
  if (!Number.isFinite(cct) || cct < 1_000 || cct > 25_000) {
    const warmth = clampLightSyncNumber((r - b) / Math.max(0.05, r + b), -1, 1, 0);
    return Math.round(
      clampLightSyncNumber(
        6_500 - warmth * 3_500,
        STUDIO_BG3D_2D_LIGHT_SYNC_MIN_KELVIN,
        STUDIO_BG3D_2D_LIGHT_SYNC_MAX_KELVIN,
        6_500,
      ),
    );
  }

  return Math.round(
    clampLightSyncNumber(
      cct,
      STUDIO_BG3D_2D_LIGHT_SYNC_MIN_KELVIN,
      STUDIO_BG3D_2D_LIGHT_SYNC_MAX_KELVIN,
      6_500,
    ),
  );
}

/** 색온도(K)를 ToonStudio 2D `temperature`(-100..100, 양수=따뜻하게) 필터 값으로 사상한다. */
export function kelvinToStudioTemperatureFilter(kelvin: number): number {
  const mired = 1_000_000 / clampLightSyncNumber(
    kelvin,
    STUDIO_BG3D_2D_LIGHT_SYNC_MIN_KELVIN,
    STUDIO_BG3D_2D_LIGHT_SYNC_MAX_KELVIN,
    STUDIO_BG3D_2D_LIGHT_SYNC_NEUTRAL_KELVIN,
  );
  const neutralMired = 1_000_000 / STUDIO_BG3D_2D_LIGHT_SYNC_NEUTRAL_KELVIN;
  const delta = mired - neutralMired;
  const scaled = delta >= 0 ? (delta / 244.3) * 90 : (delta / 72.4) * 72;
  return Math.round(clampLightSyncNumber(scaled, -100, 100, 0));
}
