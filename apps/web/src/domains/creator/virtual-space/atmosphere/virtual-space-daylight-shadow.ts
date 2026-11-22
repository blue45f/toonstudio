import type { StudioWeatherCondition } from "../studio-virtual-space-weather";

/**
 * 가상 스튜디오 24시간 자연광 · 창문 빛줄기(God-ray) · 캐릭터 발밑 접지 그림자 계산기.
 *
 * - 00:00~24:00 전 구간을 순환 키프레임과 스무스스텝으로 보간해 자정 경계(23:59 → 00:00)에서도
 *   색온도·빛줄기 각도·그림자 길이가 끊기지 않는다.
 * - 자연광 색온도는 2700K(야간 책상 스탠드)~6800K(정오 주광) 범위로 유지한다.
 * - 캐릭터 본체 등신 배율(`scaleX`, `scaleY`)은 어떤 시간대·날씨·점프 높이에서도
 *   항상 `1.0`으로 잠겨 사이즈 요동을 원천 차단한다.
 * - 순수 계산 모듈(₩0 로컬, 브라우저 스토리지 미사용).
 */

/** 자연광 시간대 4구간 (아침·낮·노을·야간 스탠드). */
export type StudioDaylightPeriod = "morning" | "day" | "sunset" | "night-lamp";

/** 지원하는 시간대 4구간 정본 순서. */
export const STUDIO_DAYLIGHT_PERIODS: readonly StudioDaylightPeriod[] = Object.freeze([
  "morning",
  "day",
  "sunset",
  "night-lamp",
]);

/** 자연광 색온도 하한(야간 스탠드, K). */
export const STUDIO_DAYLIGHT_MIN_KELVIN = 2_700;

/** 자연광 색온도 상한(한낮 주광, K). */
export const STUDIO_DAYLIGHT_MAX_KELVIN = 6_800;

/** 캐릭터 본체 등신 불변 잠금 계약(항상 1.0 고정). */
export interface StudioCharacterBodyScaleLock {
  readonly scaleX: 1;
  readonly scaleY: 1;
}

/** 전 구간 불변 캐릭터 스케일 상수. */
export const STUDIO_CHARACTER_BODY_SCALE_LOCK: StudioCharacterBodyScaleLock = Object.freeze({
  scaleX: 1,
  scaleY: 1,
});

/** 창문 빛줄기(God-ray) 파라미터. */
export interface StudioGodRaySpec {
  /** 빛줄기 진행 각도(도, 0°=우측, 90°=수직 하강, 180°=좌측). */
  readonly angleDeg: number;
  /** 빛줄기 진행 각도(라디안). */
  readonly angleRad: number;
  /** 빛줄기 정규화 방향 벡터 X. */
  readonly directionX: number;
  /** 빛줄기 정규화 방향 벡터 Y. */
  readonly directionY: number;
  /** 빛줄기 투명도(0~0.55). */
  readonly opacity: number;
  /** 창문 개구부 빛 퍼짐 각도(도). */
  readonly spreadDeg: number;
  /** 빛줄기 색온도 기반 색상(#rrggbb). */
  readonly colorHex: string;
  /** 빛줄기 상대 세기(0~1). */
  readonly intensity: number;
}

/** 캐릭터 발밑 접지 그림자(Contact Shadow) 파라미터. */
export interface StudioContactShadowSpec {
  /** 그림자 투사 각도(도). */
  readonly angleDeg: number;
  /** 그림자 투사 각도(라디안). */
  readonly angleRad: number;
  /** 그림자 투사 단위 벡터 X. */
  readonly directionX: number;
  /** 그림자 투사 단위 벡터 Y. */
  readonly directionY: number;
  /** 기준 발밑 반경 대비 그림자 길이 배율(정오에 짧고 아침·노을에 길다). */
  readonly lengthMultiplier: number;
  /** 최종 그림자 길이(px). */
  readonly lengthPx: number;
  /** 발밑 기준 그림자 중심 X 오프셋(px). */
  readonly offsetX: number;
  /** 발밑 기준 그림자 중심 Y 오프셋(px). */
  readonly offsetY: number;
  /** 접지 타원 가로 반경(px). */
  readonly radiusX: number;
  /** 접지 타원 세로 반경(px). */
  readonly radiusY: number;
  /** 그림자 중심 농도(0~0.44). */
  readonly opacity: number;
  /** 그림자 가장자리 소프트 페더 반경(px). */
  readonly blurPx: number;
  /** 시간대 색온도에 맞춘 그림자 색(#rrggbb). */
  readonly colorHex: string;
  /** 캐릭터 본체 X 배율 — 항상 1.0 고정. */
  readonly characterScaleX: 1;
  /** 캐릭터 본체 Y 배율 — 항상 1.0 고정. */
  readonly characterScaleY: 1;
}

/** 24시간 자연광·빛줄기·접지 그림자 스냅샷. */
export interface StudioDaylightSample {
  /** 정규화된 시각([0, 24)). */
  readonly hour: number;
  /** 하루 분율([0, 1)). */
  readonly timeOfDay: number;
  readonly period: StudioDaylightPeriod;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 자연광 색온도(2700~6800K). */
  readonly kelvin: number;
  /** 색온도 대응 광원 색(#rrggbb). */
  readonly colorHex: string;
  /** 태양 고도각 근사(0~75도, 야간 0). */
  readonly sunElevationDeg: number;
  /** 야간 책상 스탠드 기여 비중(0~1). */
  readonly deskLampWeight: number;
  readonly godRay: StudioGodRaySpec;
  readonly contactShadow: StudioContactShadowSpec;
  /** 캐릭터 본체 스케일 불변 잠금(항상 1.0). */
  readonly characterScale: StudioCharacterBodyScaleLock;
}

/** 접지 그림자 세부 조정 입력. */
export interface StudioContactShadowOptions {
  /** 캐릭터 발밑 기본 가로 반경(px). 기본 22. */
  readonly baseRadiusX?: number;
  /** 캐릭터 발밑 기본 세로 반경(px). 기본 9. */
  readonly baseRadiusY?: number;
  /** 점프 공중 높이(px). 높을수록 그림자가 작고 옅어진다. 기본 0. */
  readonly jumpHeightPx?: number;
  /** 착석 여부. 착석 시 의자 아래로 그림자가 단정하게 모인다. 기본 false. */
  readonly seated?: boolean;
}

/** 자연광 샘플링 옵션. */
export interface StudioDaylightOptions extends StudioContactShadowOptions {
  readonly weather?: StudioWeatherCondition | null;
}

interface DaylightKeyframe {
  readonly hour: number;
  readonly kelvin: number;
  readonly sunElevationDeg: number;
  readonly rayAngleDeg: number;
  readonly godRayOpacity: number;
  readonly godRaySpreadDeg: number;
  readonly deskLampWeight: number;
  readonly shadowLengthMultiplier: number;
  readonly shadowOpacity: number;
  readonly shadowBlurPx: number;
}

/**
 * 24시간 순환 키프레임.
 * 0.0시(자정)로 되돌아오는 마지막 구간(22.5 → 24.0)이 0.0 키프레임과 정확히 일치해
 * 24시간 경계에서 값이 튀지 않는다.
 */
const DAYLIGHT_KEYFRAMES: readonly DaylightKeyframe[] = Object.freeze([
  Object.freeze({
    hour: 0.0,
    kelvin: 2_700,
    sunElevationDeg: 0,
    rayAngleDeg: 90,
    godRayOpacity: 0.05,
    godRaySpreadDeg: 18,
    deskLampWeight: 0.96,
    shadowLengthMultiplier: 0.88,
    shadowOpacity: 0.24,
    shadowBlurPx: 9.0,
  }),
  Object.freeze({
    hour: 4.0,
    kelvin: 2_760,
    sunElevationDeg: 0,
    rayAngleDeg: 68,
    godRayOpacity: 0.07,
    godRaySpreadDeg: 20,
    deskLampWeight: 0.88,
    shadowLengthMultiplier: 0.98,
    shadowOpacity: 0.24,
    shadowBlurPx: 8.6,
  }),
  Object.freeze({
    hour: 6.0,
    kelvin: 3_750,
    sunElevationDeg: 11,
    rayAngleDeg: 34,
    godRayOpacity: 0.25,
    godRaySpreadDeg: 28,
    deskLampWeight: 0.42,
    shadowLengthMultiplier: 1.62,
    shadowOpacity: 0.27,
    shadowBlurPx: 7.4,
  }),
  Object.freeze({
    hour: 8.5,
    kelvin: 5_250,
    sunElevationDeg: 36,
    rayAngleDeg: 54,
    godRayOpacity: 0.41,
    godRaySpreadDeg: 32,
    deskLampWeight: 0.12,
    shadowLengthMultiplier: 1.24,
    shadowOpacity: 0.33,
    shadowBlurPx: 5.8,
  }),
  Object.freeze({
    hour: 12.5,
    kelvin: 6_800,
    sunElevationDeg: 72,
    rayAngleDeg: 88,
    godRayOpacity: 0.34,
    godRaySpreadDeg: 24,
    deskLampWeight: 0.0,
    shadowLengthMultiplier: 0.62,
    shadowOpacity: 0.38,
    shadowBlurPx: 4.5,
  }),
  Object.freeze({
    hour: 15.5,
    kelvin: 5_850,
    sunElevationDeg: 45,
    rayAngleDeg: 118,
    godRayOpacity: 0.38,
    godRaySpreadDeg: 30,
    deskLampWeight: 0.08,
    shadowLengthMultiplier: 1.08,
    shadowOpacity: 0.34,
    shadowBlurPx: 5.6,
  }),
  Object.freeze({
    hour: 18.2,
    kelvin: 3_150,
    sunElevationDeg: 12,
    rayAngleDeg: 148,
    godRayOpacity: 0.47,
    godRaySpreadDeg: 37,
    deskLampWeight: 0.44,
    shadowLengthMultiplier: 1.72,
    shadowOpacity: 0.30,
    shadowBlurPx: 7.5,
  }),
  Object.freeze({
    hour: 20.5,
    kelvin: 2_820,
    sunElevationDeg: 0,
    rayAngleDeg: 114,
    godRayOpacity: 0.09,
    godRaySpreadDeg: 21,
    deskLampWeight: 0.86,
    shadowLengthMultiplier: 1.02,
    shadowOpacity: 0.25,
    shadowBlurPx: 8.5,
  }),
  Object.freeze({
    hour: 22.5,
    kelvin: 2_720,
    sunElevationDeg: 0,
    rayAngleDeg: 96,
    godRayOpacity: 0.06,
    godRaySpreadDeg: 18,
    deskLampWeight: 0.94,
    shadowLengthMultiplier: 0.91,
    shadowOpacity: 0.24,
    shadowBlurPx: 8.9,
  }),
]);

const PERIOD_LABELS: Readonly<Record<StudioDaylightPeriod, { readonly ko: string; readonly en: string }>> = Object.freeze({
  morning: Object.freeze({ ko: "아침 자연광", en: "Morning daylight" }),
  day: Object.freeze({ ko: "한낮 주광", en: "Midday sun" }),
  sunset: Object.freeze({ ko: "노을빛", en: "Sunset glow" }),
  "night-lamp": Object.freeze({ ko: "야간 스탠드", en: "Night desk lamp" }),
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function smoothstep01(t: number): number {
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function toHexByte(channel: number): string {
  return Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0");
}

/** 시각(시간)을 `[0, 24)`로 순환 정규화한다. 비정상 숫자는 정오(12)로 대체한다. */
export function normalizeDaylightHour(hour: number): number {
  if (!Number.isFinite(hour)) return 12;
  const wrapped = ((hour % 24) + 24) % 24;
  return wrapped >= 24 ? 0 : wrapped;
}

/** 시각(0~24) → 자연광 4구간 분류. */
export function studioDaylightPeriodForHour(hour: number): StudioDaylightPeriod {
  const h = normalizeDaylightHour(hour);
  if (h >= 6 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "day";
  if (h >= 17 && h < 20) return "sunset";
  return "night-lamp";
}

/** 자연광 시간대 한글·영문 라벨. */
export function studioDaylightPeriodLabel(
  period: StudioDaylightPeriod,
): { readonly ko: string; readonly en: string } {
  return PERIOD_LABELS[period];
}

/**
 * 색온도(2700K~6800K)를 물리 근사(흑체 복사 곡선)로 `#rrggbb` 색상으로 변환한다.
 */
export function studioKelvinToHexColor(kelvin: number): string {
  const clampedK = clamp(kelvin, STUDIO_DAYLIGHT_MIN_KELVIN, STUDIO_DAYLIGHT_MAX_KELVIN);
  const temp = clampedK / 100;

  let red: number;
  let green: number;
  let blue: number;

  if (temp <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temp) - 161.1195681661;
    blue = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    blue = 255;
  }

  return `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`;
}

/** 색온도·야간 비중에 따라 그림자 틴트 색상을 부드럽게 섞는다. */
function shadowColorForKelvin(kelvin: number, deskLampWeight: number): string {
  const coolness = clamp(
    (kelvin - STUDIO_DAYLIGHT_MIN_KELVIN) / (STUDIO_DAYLIGHT_MAX_KELVIN - STUDIO_DAYLIGHT_MIN_KELVIN),
    0,
    1,
  );
  // 따뜻한 노을·야간 스탠드는 깊은 웜 브라운 슬레이트, 낮 주광은 차분한 블루 슬레이트
  const warmMix = clamp(1 - coolness + deskLampWeight * 0.25, 0, 1);
  const r = lerp(24, 42, warmMix);
  const g = lerp(34, 32, warmMix);
  const b = lerp(56, 44, warmMix);
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

function weatherLightFactors(weather: StudioWeatherCondition | null | undefined): {
  readonly godRayFactor: number;
  readonly shadowOpacityFactor: number;
  readonly blurBoostPx: number;
  readonly kelvinShift: number;
} {
  switch (weather) {
    case "cloudy":
      return { godRayFactor: 0.45, shadowOpacityFactor: 0.78, blurBoostPx: 2.0, kelvinShift: 180 };
    case "fog":
      return { godRayFactor: 0.35, shadowOpacityFactor: 0.72, blurBoostPx: 2.8, kelvinShift: 220 };
    case "rain":
      return { godRayFactor: 0.25, shadowOpacityFactor: 0.68, blurBoostPx: 3.0, kelvinShift: 320 };
    case "snow":
      return { godRayFactor: 0.55, shadowOpacityFactor: 0.82, blurBoostPx: 1.6, kelvinShift: 280 };
    case "thunderstorm":
      return { godRayFactor: 0.18, shadowOpacityFactor: 0.62, blurBoostPx: 3.5, kelvinShift: 360 };
    case "clear":
    default:
      return { godRayFactor: 1.0, shadowOpacityFactor: 1.0, blurBoostPx: 0, kelvinShift: 0 };
  }
}

function sampleCyclicKeyframe(hour: number): DaylightKeyframe {
  const count = DAYLIGHT_KEYFRAMES.length;
  let prevIndex = count - 1;
  let nextIndex = 0;

  for (let index = 0; index < count; index += 1) {
    const current = DAYLIGHT_KEYFRAMES[index];
    const next = DAYLIGHT_KEYFRAMES[(index + 1) % count];
    const endHour = index === count - 1 ? 24 : next.hour;
    if (hour >= current.hour && hour < endHour) {
      prevIndex = index;
      nextIndex = (index + 1) % count;
      break;
    }
  }

  const prev = DAYLIGHT_KEYFRAMES[prevIndex];
  const next = DAYLIGHT_KEYFRAMES[nextIndex];
  const span = nextIndex === 0 ? 24 - prev.hour : next.hour - prev.hour;
  const elapsed = hour >= prev.hour ? hour - prev.hour : hour + (24 - prev.hour);
  const t = smoothstep01(span > 0 ? elapsed / span : 0);

  return {
    hour,
    kelvin: lerp(prev.kelvin, next.kelvin, t),
    sunElevationDeg: lerp(prev.sunElevationDeg, next.sunElevationDeg, t),
    rayAngleDeg: lerp(prev.rayAngleDeg, next.rayAngleDeg, t),
    godRayOpacity: lerp(prev.godRayOpacity, next.godRayOpacity, t),
    godRaySpreadDeg: lerp(prev.godRaySpreadDeg, next.godRaySpreadDeg, t),
    deskLampWeight: lerp(prev.deskLampWeight, next.deskLampWeight, t),
    shadowLengthMultiplier: lerp(prev.shadowLengthMultiplier, next.shadowLengthMultiplier, t),
    shadowOpacity: lerp(prev.shadowOpacity, next.shadowOpacity, t),
    shadowBlurPx: lerp(prev.shadowBlurPx, next.shadowBlurPx, t),
  };
}

/**
 * 자연광 샘플과 캐릭터 상태(점프 높이·착석 여부)로 발밑 접지 그림자를 계산한다.
 * 캐릭터 본체 스케일(`characterScaleX`, `characterScaleY`)은 항상 `1.0`으로 고정한다.
 */
export function computeVirtualSpaceContactShadow(
  daylight: Pick<StudioDaylightSample, "kelvin" | "deskLampWeight" | "godRay"> & {
    readonly baseShadowLengthMultiplier?: number;
    readonly baseShadowOpacity?: number;
    readonly baseShadowBlurPx?: number;
  },
  options: StudioContactShadowOptions = {},
): StudioContactShadowSpec {
  const baseRadiusX = Number.isFinite(options.baseRadiusX) && (options.baseRadiusX as number) > 0
    ? (options.baseRadiusX as number)
    : 22;
  const baseRadiusY = Number.isFinite(options.baseRadiusY) && (options.baseRadiusY as number) > 0
    ? (options.baseRadiusY as number)
    : 9;
  const jumpHeightPx = Math.max(0, Number.isFinite(options.jumpHeightPx) ? (options.jumpHeightPx as number) : 0);
  const seated = options.seated === true;

  // 점프 높이에 따라 바닥 접지 그림자가 자연스럽게 작아지고 옅어진다(캐릭터 본체 크기는 불변).
  const airFactor = clamp(1 - jumpHeightPx / 90, 0.45, 1);
  const seatedFactor = seated ? 0.88 : 1;

  const angleDeg = roundTo(daylight.godRay.angleDeg, 2);
  const angleRad = (angleDeg * Math.PI) / 180;
  const directionX = roundTo(Math.cos(angleRad), 4);
  const directionY = roundTo(Math.sin(angleRad), 4);

  const rawLengthMultiplier = daylight.baseShadowLengthMultiplier ?? 1.0;
  const lengthMultiplier = roundTo(
    clamp(rawLengthMultiplier * seatedFactor, 0.55, 1.85),
    3,
  );
  const lengthPx = roundTo(baseRadiusX * lengthMultiplier * airFactor, 2);

  // 빛줄기 방향으로 살짝 미끄러지되 발밑 접지가 떨어지지 않도록 오프셋 상한을 둔다.
  const lateralShift = directionX * (lengthMultiplier - 0.5) * baseRadiusX * 0.42 * airFactor;
  const depthShift = (directionY * 0.16 * lengthMultiplier) * baseRadiusY * airFactor;

  const radiusX = roundTo(baseRadiusX * (0.72 + lengthMultiplier * 0.28) * airFactor * seatedFactor, 2);
  const radiusY = roundTo(baseRadiusY * (0.86 + Math.abs(directionY) * 0.14) * airFactor * seatedFactor, 2);

  const baseOpacity = daylight.baseShadowOpacity ?? 0.3;
  const opacity = roundTo(clamp(baseOpacity * (0.55 + 0.45 * airFactor), 0.1, 0.44), 3);
  const baseBlur = daylight.baseShadowBlurPx ?? 6;
  const blurPx = roundTo(clamp(baseBlur + jumpHeightPx * 0.08, 3.5, 14), 2);

  return Object.freeze({
    angleDeg,
    angleRad: roundTo(angleRad, 4),
    directionX,
    directionY,
    lengthMultiplier,
    lengthPx,
    offsetX: roundTo(lateralShift, 2),
    offsetY: roundTo(depthShift, 2),
    radiusX,
    radiusY,
    opacity,
    blurPx,
    colorHex: shadowColorForKelvin(daylight.kelvin, daylight.deskLampWeight),
    characterScaleX: STUDIO_CHARACTER_BODY_SCALE_LOCK.scaleX,
    characterScaleY: STUDIO_CHARACTER_BODY_SCALE_LOCK.scaleY,
  });
}

/**
 * 24시간 시각(`0..24`) 기준 자연광·창문 빛줄기·캐릭터 접지 그림자 스냅샷을 계산한다.
 */
export function computeVirtualSpaceDaylightAtHour(
  hour: number,
  options: StudioDaylightOptions = {},
): StudioDaylightSample {
  const normalizedHour = normalizeDaylightHour(hour);
  const key = sampleCyclicKeyframe(normalizedHour);
  const weather = weatherLightFactors(options.weather);
  const period = studioDaylightPeriodForHour(normalizedHour);
  const label = PERIOD_LABELS[period];

  // 야간 스탠드 시간대에는 구름/비의 차가운 색온도 이동이 실내 스탠드 색을 깨지 않도록 억제한다.
  const outdoorWeight = clamp(1 - key.deskLampWeight, 0, 1);
  const kelvin = Math.round(
    clamp(
      key.kelvin + weather.kelvinShift * outdoorWeight,
      STUDIO_DAYLIGHT_MIN_KELVIN,
      STUDIO_DAYLIGHT_MAX_KELVIN,
    ),
  );
  const colorHex = studioKelvinToHexColor(kelvin);

  const angleDeg = roundTo(key.rayAngleDeg, 2);
  const angleRad = roundTo((angleDeg * Math.PI) / 180, 4);
  const godRayOpacity = roundTo(clamp(key.godRayOpacity * weather.godRayFactor, 0, 0.55), 3);
  const godRay: StudioGodRaySpec = Object.freeze({
    angleDeg,
    angleRad,
    directionX: roundTo(Math.cos(angleRad), 4),
    directionY: roundTo(Math.sin(angleRad), 4),
    opacity: godRayOpacity,
    spreadDeg: roundTo(key.godRaySpreadDeg, 2),
    colorHex,
    intensity: roundTo(clamp(godRayOpacity / 0.5, 0, 1), 3),
  });

  const deskLampWeight = roundTo(clamp(key.deskLampWeight, 0, 1), 3);
  const contactShadow = computeVirtualSpaceContactShadow(
    {
      kelvin,
      deskLampWeight,
      godRay,
      baseShadowLengthMultiplier: key.shadowLengthMultiplier,
      baseShadowOpacity: key.shadowOpacity * weather.shadowOpacityFactor,
      baseShadowBlurPx: key.shadowBlurPx + weather.blurBoostPx,
    },
    options,
  );

  return Object.freeze({
    hour: roundTo(normalizedHour, 4),
    timeOfDay: roundTo(normalizedHour / 24, 5),
    period,
    labelKo: label.ko,
    labelEn: label.en,
    kelvin,
    colorHex,
    sunElevationDeg: roundTo(clamp(key.sunElevationDeg, 0, 75), 2),
    deskLampWeight,
    godRay,
    contactShadow,
    characterScale: STUDIO_CHARACTER_BODY_SCALE_LOCK,
  });
}

/**
 * 하루 분율(`0..1`) 기준 자연광·창문 빛줄기·캐릭터 접지 그림자 스냅샷을 계산한다.
 */
export function computeVirtualSpaceDaylightAtTimeOfDay(
  timeOfDay: number,
  options: StudioDaylightOptions = {},
): StudioDaylightSample {
  const safeFraction = Number.isFinite(timeOfDay) ? timeOfDay : 0.5;
  return computeVirtualSpaceDaylightAtHour(safeFraction * 24, options);
}
