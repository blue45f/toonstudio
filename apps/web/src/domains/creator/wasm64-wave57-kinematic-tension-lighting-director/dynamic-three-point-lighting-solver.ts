/**
 * Wave 57: 물리 기반 동적 3점 조명(Key/Fill/Rim) 해석기 및 임계 감쇠(Critically-Damped Spring) 보간기.
 *
 * - Kang et al.(2002) 흑체 궤적 다항식으로 상관 색온도(Kelvin, `1,667K..25,000K`)를
 *   D65(`6,500K`) 중립 기준 선형 sRGB(`[0, 1]`)로 변환한다.
 * - 분석된 긴장도·몰입 흐름·무드와 장면 기본 광원 제약을 충족하는 Key/Fill/Rim 3점 조명 리깅을 계산한다.
 * - `stepDampedLightingRig`은 닫힌형 임계 감쇠 스프링과 단조 속도 클램프를 결합해
 *   깜빡임과 오버슈트(0) 없이 수렴하며, `prefersReducedMotion` 시 즉시/초저자극 전환을 보장한다.
 */

import type {
  CreativeCadenceAnalysisResult,
  SceneLightingMood,
} from "./creative-cadence-telemetry-analyzer";

/** Kang et al.(2002) 흑체 궤적 유효 하한 색온도(`1,667 K`). */
export const MIN_PHYSICAL_KELVIN = 1_667 as const;
/** Kang et al.(2002) 흑체 궤적 유효 상한 색온도(`25,000 K`). */
export const MAX_PHYSICAL_KELVIN = 25_000 as const;
/** D65 중립 주광 기준 색온도(`6,500 K`). */
export const NEUTRAL_DAYLIGHT_KELVIN = 6_500 as const;

export type ThreePointLightRole = "key" | "fill" | "rim";

/** 선형 sRGB 채널(`0..1`, 최대 채널 정규화). */
export interface LinearRgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** 3차원 단위 광원 방향 벡터(광원을 향하는 방향). */
export interface LightDirectionVector3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 3점 조명 중 단일 광원 명세. */
export interface DirectionalLightSpec {
  readonly role: ThreePointLightRole;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly directionVector3d: LightDirectionVector3D;
  readonly kelvin: number;
  readonly linearRgb: LinearRgbColor;
  readonly intensity: number;
  readonly softness: number;
}

/** 장면 기본 광원 및 연속성 보호 제약. */
export interface SceneBaseLightingConstraints {
  readonly baseKeyAzimuthDeg?: number;
  readonly baseKeyElevationDeg?: number;
  readonly baseKeyKelvin?: number;
  /** 장면 축 일관성 보호를 위한 최대 키라이트 방위각 변동 허용치(°, 기본 `45`). */
  readonly maxAzimuthSwingDeg?: number;
  readonly minElevationDeg?: number;
  readonly maxElevationDeg?: number;
  readonly minKelvin?: number;
  readonly maxKelvin?: number;
  /** 그림자 디테일 보존을 위한 최대 키-필 대비비(기본 `12`). */
  readonly maxKeyToFillRatio?: number;
  readonly minFillIntensity?: number;
  readonly maxRimIntensity?: number;
  /** 접근성 저자극 모드(`prefers-reduced-motion`). */
  readonly prefersReducedMotion?: boolean;
}

/** 동적 3점 조명 리깅 해석 결과. */
export interface DynamicThreePointLightingRig {
  readonly mood: SceneLightingMood;
  readonly tensionIndex: number;
  readonly key: DirectionalLightSpec;
  readonly fill: DirectionalLightSpec;
  readonly rim: DirectionalLightSpec;
  readonly keyToFillRatio: number;
  readonly rimIntensity: number;
  readonly ambientFloorIntensity: number;
  readonly reducedMotionMode: boolean;
}

/** 단일 광원 임계 감쇠 속도 상태. */
export interface DirectionalLightVelocityState {
  readonly azimuthDegPerSec: number;
  readonly elevationDegPerSec: number;
  readonly kelvinPerSec: number;
  readonly intensityPerSec: number;
  readonly softnessPerSec: number;
}

/** 3점 조명 임계 감쇠 보간기 누적 상태. */
export interface DampedLightingRigState {
  readonly rig: DynamicThreePointLightingRig;
  readonly keyVelocity: DirectionalLightVelocityState;
  readonly fillVelocity: DirectionalLightVelocityState;
  readonly rimVelocity: DirectionalLightVelocityState;
  readonly ambientFloorVelocity: number;
  readonly elapsedSec: number;
}

export type ReducedMotionLightingStrategy = "instant-snap" | "gentle-low-slew";

/** 임계 감쇠 스텝 옵션. */
export interface DampedLightingStepOptions {
  /** 63% 이상 수렴 기준 시간 상수(초, 기본 `0.45`). */
  readonly smoothTimeSec?: number;
  /** 깜빡임 방지를 위한 초당 최대 색온도 변화율(K/s, 기본 `3600`). */
  readonly maxKelvinPerSec?: number;
  /** 깜빡임 방지를 위한 초당 최대 광도 변화율(기본 `2.8`). */
  readonly maxIntensityPerSec?: number;
  /** 초당 최대 방위각 회전 속도(°/s, 기본 `120`). */
  readonly maxAngleDegPerSec?: number;
  readonly prefersReducedMotion?: boolean;
  /** 모션 축소 시 전환 전략(`instant-snap` 기본, 또는 `gentle-low-slew`). */
  readonly reducedMotionStrategy?: ReducedMotionLightingStrategy;
}

interface MoodLightingProfile {
  readonly keyAzOffset: number;
  readonly keyElOffset: number;
  readonly keyKelvin: number;
  readonly keyIntensity: number;
  readonly keySoftness: number;
  readonly fillAzDelta: number;
  readonly fillEl: number;
  readonly fillKelvin: number;
  readonly ratioBase: number;
  readonly ratioPeak: number;
  readonly fillSoftness: number;
  readonly rimAzDelta: number;
  readonly rimEl: number;
  readonly rimKelvin: number;
  readonly rimBase: number;
  readonly rimPeak: number;
  readonly rimSoftness: number;
  readonly ambientBase: number;
}

interface DampingLimits {
  readonly dtSec: number;
  readonly smoothTimeSec: number;
  readonly maxAngleDegPerSec: number;
  readonly maxKelvinPerSec: number;
  readonly maxIntensityPerSec: number;
}

const MOOD_LIGHTING_PROFILES: Readonly<Record<SceneLightingMood, MoodLightingProfile>> = {
  "calm-ambient": {
    keyAzOffset: 4, keyElOffset: 6, keyKelvin: 5_800, keyIntensity: 1.05, keySoftness: 0.72,
    fillAzDelta: -105, fillEl: 32, fillKelvin: 6_800, ratioBase: 1.7, ratioPeak: 2.5, fillSoftness: 0.88,
    rimAzDelta: 155, rimEl: 28, rimKelvin: 6_400, rimBase: 0.28, rimPeak: 0.48, rimSoftness: 0.65,
    ambientBase: 0.34,
  },
  "warm-intimate": {
    keyAzOffset: -14, keyElOffset: -8, keyKelvin: 3_600, keyIntensity: 1.15, keySoftness: 0.62,
    fillAzDelta: 100, fillEl: 24, fillKelvin: 4_600, ratioBase: 2.3, ratioPeak: 3.8, fillSoftness: 0.82,
    rimAzDelta: -150, rimEl: 20, rimKelvin: 3_200, rimBase: 0.52, rimPeak: 0.86, rimSoftness: 0.52,
    ambientBase: 0.24,
  },
  "dramatic-duel": {
    keyAzOffset: 36, keyElOffset: -16, keyKelvin: 6_700, keyIntensity: 1.48, keySoftness: 0.24,
    fillAzDelta: -120, fillEl: 18, fillKelvin: 9_400, ratioBase: 4.8, ratioPeak: 8.6, fillSoftness: 0.56,
    rimAzDelta: 162, rimEl: 24, rimKelvin: 5_200, rimBase: 1.05, rimPeak: 1.72, rimSoftness: 0.22,
    ambientBase: 0.12,
  },
  "noir-suspense": {
    keyAzOffset: -40, keyElOffset: -20, keyKelvin: 8_400, keyIntensity: 1.32, keySoftness: 0.18,
    fillAzDelta: 125, fillEl: 14, fillKelvin: 11_000, ratioBase: 6.4, ratioPeak: 10.8, fillSoftness: 0.48,
    rimAzDelta: -168, rimEl: 30, rimKelvin: 9_200, rimBase: 0.88, rimPeak: 1.42, rimSoftness: 0.26,
    ambientBase: 0.07,
  },
  "radiant-climax": {
    keyAzOffset: 20, keyElOffset: 12, keyKelvin: 4_700, keyIntensity: 1.72, keySoftness: 0.34,
    fillAzDelta: -110, fillEl: 34, fillKelvin: 5_900, ratioBase: 3.1, ratioPeak: 5.2, fillSoftness: 0.72,
    rimAzDelta: 170, rimEl: 38, rimKelvin: 3_800, rimBase: 1.32, rimPeak: 2.0, rimSoftness: 0.3,
    ambientBase: 0.22,
  },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeFinite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/** 각도를 `[0, 360)` 구간으로 정규화한다. */
export function normalizeAngleDeg360(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod === 0 ? 0 : mod;
}

/** 두 각도 사이의 최단 부호 있는 각도 차(`(-180, 180]`)를 계산한다. */
export function shortestAngleDeltaDeg(fromDeg: number, toDeg: number): number {
  const diff = normalizeAngleDeg360(toDeg) - normalizeAngleDeg360(fromDeg);
  if (diff > 180) return diff - 360;
  if (diff <= -180) return diff + 360;
  return diff;
}

/** 방위각과 고도각을 3D 단위 광원 방향 벡터로 변환한다. */
export function anglesToLightDirectionVector(
  azimuthDeg: number,
  elevationDeg: number,
): LightDirectionVector3D {
  const azRad = (normalizeAngleDeg360(azimuthDeg) * Math.PI) / 180;
  const elRad = (clamp(elevationDeg, -89.9, 89.9) * Math.PI) / 180;
  const cosEl = Math.cos(elRad);
  return { x: cosEl * Math.cos(azRad), y: cosEl * Math.sin(azRad), z: Math.sin(elRad) };
}

function rawPlanckianLinearRgb(kelvin: number): LinearRgbColor {
  const t = clamp(kelvin, MIN_PHYSICAL_KELVIN, MAX_PHYSICAL_KELVIN);
  const invT = 1_000 / t;
  const invT2 = invT * invT;
  const invT3 = invT2 * invT;

  const x =
    t <= 4_000
      ? -0.2661239 * invT3 - 0.2343589 * invT2 + 0.8776956 * invT + 0.17991
      : -3.0258469 * invT3 + 2.1070379 * invT2 + 0.2226347 * invT + 0.24039;
  const x2 = x * x;
  const x3 = x2 * x;
  const y =
    t <= 2_222
      ? -1.1063814 * x3 - 1.3481102 * x2 + 2.18555832 * x - 0.20219683
      : t <= 4_000
        ? -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x3 - 5.8733867 * x2 + 3.75112997 * x - 0.37001483;

  const safeY = Math.max(1e-4, y);
  const cieX = x / safeY;
  const cieZ = (1 - x - safeY) / safeY;

  return {
    r: Math.max(0, 3.2404542 * cieX - 1.5371385 - 0.4985314 * cieZ),
    g: Math.max(0, -0.969266 * cieX + 1.8760108 + 0.041556 * cieZ),
    b: Math.max(0, 0.0556434 * cieX - 0.2040259 + 1.0572252 * cieZ),
  };
}

const NEUTRAL_D65_RAW = rawPlanckianLinearRgb(NEUTRAL_DAYLIGHT_KELVIN);

/**
 * 상관 색온도(Kelvin)를 D65(`6,500K`) 중립 기준 선형 sRGB(`[0, 1]`) 색조로 변환한다.
 * `6,500K`에서 `(1, 1, 1)`을 반환하며 유효 물리 범위 밖·비유한 입력을 안전하게 클램프한다.
 */
export function kelvinToLinearRgb(kelvin: number): LinearRgbColor {
  const safeKelvin = Number.isFinite(kelvin)
    ? clamp(kelvin, MIN_PHYSICAL_KELVIN, MAX_PHYSICAL_KELVIN)
    : NEUTRAL_DAYLIGHT_KELVIN;
  const raw = rawPlanckianLinearRgb(safeKelvin);
  const bR = raw.r / Math.max(1e-6, NEUTRAL_D65_RAW.r);
  const bG = raw.g / Math.max(1e-6, NEUTRAL_D65_RAW.g);
  const bB = raw.b / Math.max(1e-6, NEUTRAL_D65_RAW.b);
  const peak = Math.max(bR, bG, bB, 1e-6);
  return { r: clamp(bR / peak, 0, 1), g: clamp(bG / peak, 0, 1), b: clamp(bB / peak, 0, 1) };
}

function buildDirectionalLight(
  role: ThreePointLightRole,
  azimuthDeg: number,
  elevationDeg: number,
  kelvin: number,
  intensity: number,
  softness: number,
): DirectionalLightSpec {
  const normAz = normalizeAngleDeg360(azimuthDeg);
  const clampedEl = clamp(elevationDeg, -30, 90);
  const clampedK = clamp(kelvin, MIN_PHYSICAL_KELVIN, MAX_PHYSICAL_KELVIN);
  return {
    role,
    azimuthDeg: normAz,
    elevationDeg: clampedEl,
    directionVector3d: anglesToLightDirectionVector(normAz, clampedEl),
    kelvin: clampedK,
    linearRgb: kelvinToLinearRgb(clampedK),
    intensity: clamp(intensity, 0, 4),
    softness: clamp(softness, 0, 1),
  };
}

/**
 * 작화 리듬·서사 긴장도 분석 결과와 장면 기본 광원 제약을 결합해
 * 물리 기반 3점 조명(Key/Fill/Rim) 목표 리깅을 계산한다.
 */
export function solveDynamicCutLightingRig(
  analysis: CreativeCadenceAnalysisResult,
  constraints: SceneBaseLightingConstraints = {},
): DynamicThreePointLightingRig {
  const p = MOOD_LIGHTING_PROFILES[analysis.mood];
  const tension = clamp(analysis.tensionIndex, 0, 1);
  const smoothness = clamp(analysis.cadenceSmoothness, 0, 1);
  const reduced = Boolean(constraints.prefersReducedMotion ?? analysis.reducedMotionHint);

  const baseAz = normalizeAngleDeg360(safeFinite(constraints.baseKeyAzimuthDeg, 45));
  const baseEl = clamp(safeFinite(constraints.baseKeyElevationDeg, 42), -10, 85);
  const baseK = clamp(safeFinite(constraints.baseKeyKelvin, 5_800), MIN_PHYSICAL_KELVIN, MAX_PHYSICAL_KELVIN);
  const maxSwing = clamp(safeFinite(constraints.maxAzimuthSwingDeg, 45), 0, 180);
  const minEl = clamp(safeFinite(constraints.minElevationDeg, 10), -30, 80);
  const maxEl = clamp(safeFinite(constraints.maxElevationDeg, 78), minEl, 90);
  const minK = clamp(safeFinite(constraints.minKelvin, 2_200), MIN_PHYSICAL_KELVIN, MAX_PHYSICAL_KELVIN);
  const maxK = clamp(safeFinite(constraints.maxKelvin, 12_000), minK, MAX_PHYSICAL_KELVIN);
  const rawMaxRatio = clamp(safeFinite(constraints.maxKeyToFillRatio, 12), 1.2, 24);
  const maxRatio = reduced ? Math.min(rawMaxRatio, 5.5) : rawMaxRatio;
  const minFill = clamp(safeFinite(constraints.minFillIntensity, 0.08), 0.02, 1.5);
  const rawMaxRim = clamp(safeFinite(constraints.maxRimIntensity, 2.2), 0.1, 4);
  const maxRim = reduced ? Math.min(rawMaxRim, 1.15) : rawMaxRim;

  const azOffset = clamp(p.keyAzOffset * (reduced ? 0.35 : 0.45 + 0.55 * tension), -maxSwing, maxSwing);
  const keyAz = normalizeAngleDeg360(baseAz + azOffset);
  const keyEl = clamp(baseEl + p.keyElOffset * (reduced ? 0.4 : 0.5 + 0.5 * tension), minEl, maxEl);
  const keyK = clamp(lerp(baseK, p.keyKelvin, reduced ? 0.45 : 0.58 + 0.34 * tension), minK, maxK);
  const keyInt = clamp(p.keyIntensity * (0.9 + 0.24 * tension) * (reduced ? 0.94 : 1), 0.45, 3.2);
  const keySoft = clamp(p.keySoftness + (smoothness - 0.5) * 0.14 + (reduced ? 0.12 : 0), 0.08, 0.96);

  const targetRatio = clamp(lerp(p.ratioBase, p.ratioPeak, tension), 1.2, maxRatio);
  const fillInt = clamp(Math.max(minFill, keyInt / targetRatio), minFill, keyInt);
  const fillK = clamp(lerp(baseK, p.fillKelvin, reduced ? 0.4 : 0.72), minK, maxK);

  const rimRaw = lerp(p.rimBase, p.rimPeak, tension);
  const rimInt = clamp(reduced ? rimRaw * 0.68 : rimRaw, 0.1, maxRim);
  const rimK = clamp(lerp(keyK, p.rimKelvin, reduced ? 0.5 : 0.8), minK, maxK);

  const key = buildDirectionalLight("key", keyAz, keyEl, keyK, keyInt, keySoft);
  const fill = buildDirectionalLight(
    "fill",
    keyAz + p.fillAzDelta,
    clamp(p.fillEl, minEl, maxEl),
    fillK,
    fillInt,
    clamp(p.fillSoftness, 0.1, 1),
  );
  const rim = buildDirectionalLight(
    "rim",
    keyAz + p.rimAzDelta,
    clamp(p.rimEl, minEl, maxEl),
    rimK,
    rimInt,
    clamp(p.rimSoftness, 0.08, 1),
  );

  return {
    mood: analysis.mood,
    tensionIndex: tension,
    key,
    fill,
    rim,
    keyToFillRatio: key.intensity / Math.max(0.02, fill.intensity),
    rimIntensity: rim.intensity,
    ambientFloorIntensity: clamp(p.ambientBase * (1 - 0.22 * tension) + (reduced ? 0.08 : 0), 0.04, 0.55),
    reducedMotionMode: reduced,
  };
}

const ZERO_LIGHT_VELOCITY: DirectionalLightVelocityState = {
  azimuthDegPerSec: 0,
  elevationDegPerSec: 0,
  kelvinPerSec: 0,
  intensityPerSec: 0,
  softnessPerSec: 0,
};

/** 초기 3점 조명 리깅으로 임계 감쇠 보간 상태를 생성한다. */
export function createInitialDampedLightingState(
  initialRig: DynamicThreePointLightingRig,
): DampedLightingRigState {
  return {
    rig: initialRig,
    keyVelocity: ZERO_LIGHT_VELOCITY,
    fillVelocity: ZERO_LIGHT_VELOCITY,
    rimVelocity: ZERO_LIGHT_VELOCITY,
    ambientFloorVelocity: 0,
    elapsedSec: 0,
  };
}

/**
 * 닫힌형 임계 감쇠 스프링 단일 스칼라 스텝(오버슈트 0 수학적 보장).
 * 시작 속도를 무오버슈트 원뿔(`v0 * e0 <= 0`, `|v0| <= omega * |e0|`)에 투영해
 * 정지 출발과 도중 목표 급반전 모두에서 목표 초과(overshoot)를 원천 차단한다.
 */
function stepCriticallyDampedScalar(
  current: number,
  velocity: number,
  target: number,
  dtSec: number,
  smoothTimeSec: number,
  maxRatePerSec: number,
): { readonly value: number; readonly velocity: number } {
  const e0 = current - target;
  if (Math.abs(e0) <= 1e-7 || dtSec <= 0) {
    return { value: target, velocity: 0 };
  }

  const omega = 2 / Math.max(0.02, smoothTimeSec);
  let v0 = velocity;
  if (v0 * e0 > 0) {
    v0 = 0;
  } else {
    const maxSafeSpeed = omega * Math.abs(e0);
    if (Math.abs(v0) > maxSafeSpeed) {
      v0 = Math.sign(v0) * maxSafeSpeed;
    }
  }

  const expTerm = Math.exp(-omega * dtSec);
  const coeff = v0 + omega * e0;
  let nextError = (e0 + coeff * dtSec) * expTerm;
  let nextVelocity = (v0 - omega * coeff * dtSec) * expTerm;
  if (nextError * e0 <= 0) {
    return { value: target, velocity: 0 };
  }

  const maxStepDelta = Math.max(1e-6, maxRatePerSec * dtSec);
  const proposedDelta = nextError - e0;
  if (Math.abs(proposedDelta) > maxStepDelta) {
    const limitedDelta = Math.sign(proposedDelta) * maxStepDelta;
    nextError = e0 + limitedDelta;
    nextVelocity = limitedDelta / dtSec;
    if (nextError * e0 <= 0) {
      return { value: target, velocity: 0 };
    }
  }

  return { value: target + nextError, velocity: nextVelocity };
}

function stepSingleLight(
  current: DirectionalLightSpec,
  velocity: DirectionalLightVelocityState,
  target: DirectionalLightSpec,
  limits: DampingLimits,
): { readonly light: DirectionalLightSpec; readonly velocity: DirectionalLightVelocityState } {
  const unwrappedAzTarget = current.azimuthDeg + shortestAngleDeltaDeg(current.azimuthDeg, target.azimuthDeg);
  const az = stepCriticallyDampedScalar(
    current.azimuthDeg,
    velocity.azimuthDegPerSec,
    unwrappedAzTarget,
    limits.dtSec,
    limits.smoothTimeSec,
    limits.maxAngleDegPerSec,
  );
  const el = stepCriticallyDampedScalar(
    current.elevationDeg,
    velocity.elevationDegPerSec,
    target.elevationDeg,
    limits.dtSec,
    limits.smoothTimeSec,
    limits.maxAngleDegPerSec,
  );
  const kelvin = stepCriticallyDampedScalar(
    current.kelvin,
    velocity.kelvinPerSec,
    target.kelvin,
    limits.dtSec,
    limits.smoothTimeSec,
    limits.maxKelvinPerSec,
  );
  const intensity = stepCriticallyDampedScalar(
    current.intensity,
    velocity.intensityPerSec,
    target.intensity,
    limits.dtSec,
    limits.smoothTimeSec,
    limits.maxIntensityPerSec,
  );
  const softness = stepCriticallyDampedScalar(
    current.softness,
    velocity.softnessPerSec,
    target.softness,
    limits.dtSec,
    limits.smoothTimeSec,
    1.8,
  );

  return {
    light: buildDirectionalLight(target.role, az.value, el.value, kelvin.value, intensity.value, softness.value),
    velocity: {
      azimuthDegPerSec: az.velocity,
      elevationDegPerSec: el.velocity,
      kelvinPerSec: kelvin.velocity,
      intensityPerSec: intensity.velocity,
      softnessPerSec: softness.velocity,
    },
  };
}

/**
 * 현재 3점 조명 상태를 목표 리깅으로 `dtSec`만큼 임계 감쇠 보간한다.
 * `prefersReducedMotion: true` 시 기본 전략(`instant-snap`)은 잔여 속도를 0으로 초기화해 즉시 전환하고,
 * `gentle-low-slew` 전략은 완만한 시간 상수와 낮은 변화율로 초저자극 보간을 수행한다.
 */
export function stepDampedLightingRig(
  currentState: DampedLightingRigState,
  targetRig: DynamicThreePointLightingRig,
  dtSec: number,
  options: DampedLightingStepOptions = {},
): DampedLightingRigState {
  const safeDt = clamp(safeFinite(dtSec, 0), 0, 10);
  const reduced = Boolean(options.prefersReducedMotion ?? targetRig.reducedMotionMode);
  const strategy: ReducedMotionLightingStrategy = options.reducedMotionStrategy ?? "instant-snap";

  if (reduced && strategy === "instant-snap") {
    return {
      rig: { ...targetRig, reducedMotionMode: true },
      keyVelocity: ZERO_LIGHT_VELOCITY,
      fillVelocity: ZERO_LIGHT_VELOCITY,
      rimVelocity: ZERO_LIGHT_VELOCITY,
      ambientFloorVelocity: 0,
      elapsedSec: currentState.elapsedSec + safeDt,
    };
  }
  if (safeDt <= 0) return currentState;

  const baseSmooth = clamp(safeFinite(options.smoothTimeSec, 0.45), 0.05, 8);
  const gentleScale = reduced ? 0.35 : 1;
  const limits: DampingLimits = {
    dtSec: safeDt,
    smoothTimeSec: reduced ? Math.max(baseSmooth * 2.2, 1.1) : baseSmooth,
    maxKelvinPerSec: clamp(safeFinite(options.maxKelvinPerSec, 3_600), 200, 30_000) * gentleScale,
    maxIntensityPerSec: clamp(safeFinite(options.maxIntensityPerSec, 2.8), 0.1, 20) * gentleScale,
    maxAngleDegPerSec: clamp(safeFinite(options.maxAngleDegPerSec, 120), 5, 720) * gentleScale,
  };

  const steppedKey = stepSingleLight(currentState.rig.key, currentState.keyVelocity, targetRig.key, limits);
  const steppedFill = stepSingleLight(currentState.rig.fill, currentState.fillVelocity, targetRig.fill, limits);
  const steppedRim = stepSingleLight(currentState.rig.rim, currentState.rimVelocity, targetRig.rim, limits);
  const steppedAmbient = stepCriticallyDampedScalar(
    currentState.rig.ambientFloorIntensity,
    currentState.ambientFloorVelocity,
    targetRig.ambientFloorIntensity,
    limits.dtSec,
    limits.smoothTimeSec,
    limits.maxIntensityPerSec,
  );

  return {
    rig: {
      mood: targetRig.mood,
      tensionIndex: targetRig.tensionIndex,
      key: steppedKey.light,
      fill: steppedFill.light,
      rim: steppedRim.light,
      keyToFillRatio: steppedKey.light.intensity / Math.max(0.02, steppedFill.light.intensity),
      rimIntensity: steppedRim.light.intensity,
      ambientFloorIntensity: clamp(steppedAmbient.value, 0.04, 0.55),
      reducedMotionMode: reduced,
    },
    keyVelocity: steppedKey.velocity,
    fillVelocity: steppedFill.velocity,
    rimVelocity: steppedRim.velocity,
    ambientFloorVelocity: steppedAmbient.velocity,
    elapsedSec: currentState.elapsedSec + safeDt,
  };
}
