/**
 * Libmypaint(ISC) 브러시 동역학 및 스머지 개념 재구현(원본 C 코드 미참조, 순수 TypeScript 내재화).
 *
 * 주요 내재화 요소:
 * 1. 이중 지수 이동평균 속도 필터(fine speed1 / gross speed2 + 로그 감마 정규화)
 * 2. 방향 필터(타원 댑 회전용 지수 감쇠 방향 벡터 및 각도) 및 슬로 트래킹(slow_tracking)
 * 3. 로그 반경(radius_logarithmic) + 압력·속도 모듈레이션 → 유효 반경(px)
 * 4. 불투명도 및 opaque_multiply 비선형 압력 게이트, 다브 누적기(dab accumulator)
 * 5. Kubelka-Munk(kmMixRgb) 기반 스머지 버킷(smudge bucket) 상태 갱신 및 안료 픽업
 *
 * 원본 C 코드·식별자·오프셋을 복사하지 않으며 수식 아이디어만 재구현한다(license-policy.md 4.5절).
 * 모든 연산은 Math.fround로 f32 결정성을 유지한다.
 */

import { SumiError } from "../core/errors";

import { kmMixRgb } from "./kubelka-munk";

const f32 = Math.fround;

export type LinearRgba = readonly [number, number, number, number];

function isFiniteInRange(v: number, min: number, max: number): boolean {
  return Number.isFinite(v) && v >= min && v <= max;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ============================================================================
// 1. 스텝 누적·슬로 트래킹·다브 방출 기반 API (LibMypaint*)
// ============================================================================

export interface LibMypaintDynamicsConfig {
  /** 기본 로그 반경(예: Math.log(4) ≈ 1.386 → 반경 4px). 범위 [-2, 6]. */
  readonly radiusLog: number;
  /** 기본 불투명도 [0, 1]. */
  readonly opaque: number;
  /** 기본 경도 [0, 1]. */
  readonly hardness: number;
  /** 반경당 다브 밀도(0 이상). */
  readonly dabsPerRadius: number;
  /** 초당 시간 다브 수(0 이상). */
  readonly dabsPerSecond: number;
  /** 슬로 트래킹 안정화 계수 [0, 10]. 0이면 원시 좌표 즉시 추종. */
  readonly slowTracking: number;
  /** 속도 감쇠 민감도 [0, 2]. 빠를수록 반경이 가늘어지거나 두꺼워지는 정도. */
  readonly speedRadiusGamma: number;
  /** 캔버스 색 픽업(스머지) 비율 [0, 1]. 0이면 순수 브러시 색, 1이면 픽업 색 유지. */
  readonly smudgeRate: number;
  /** 압력에 따른 안료 농도 강화 비율 [0, 1]. */
  readonly pressurePigmentGain: number;
}

export interface LibMypaintDynamicsState {
  readonly initialized: boolean;
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly fineSpeed: number;
  readonly grossSpeed: number;
  readonly dabRemainder: number;
  readonly smudgeColor: LinearRgba;
}

export interface LibMypaintSampleInput {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  /** 현재 캔버스 위치에서 샘플링한 하부 픽셀 색(스머지용, 선택). */
  readonly canvasColor?: LinearRgba;
}

export interface LibMypaintStepResult {
  readonly state: LibMypaintDynamicsState;
  readonly effectiveRadiusPx: number;
  readonly effectiveOpacity: number;
  readonly effectiveHardness: number;
  readonly aspectRatio: number;
  readonly angleRad: number;
  readonly dabsToEmit: number;
  readonly emittedColor: LinearRgba;
}

const DEFAULT_MYPAINT_STEP_CONFIG: LibMypaintDynamicsConfig = {
  radiusLog: Math.fround(Math.log(6)),
  opaque: 0.9,
  hardness: 0.75,
  dabsPerRadius: 2.5,
  dabsPerSecond: 20,
  slowTracking: 1.2,
  speedRadiusGamma: 0.35,
  smudgeRate: 0.25,
  pressurePigmentGain: 0.3,
} as const;

export function defaultLibMypaintDynamicsConfig(): LibMypaintDynamicsConfig {
  return { ...DEFAULT_MYPAINT_STEP_CONFIG };
}

export function defaultLibMypaintDynamicsState(
  initialColor: LinearRgba = [0, 0, 0, 1],
): LibMypaintDynamicsState {
  return {
    initialized: false,
    x: 0,
    y: 0,
    pressure: 0,
    fineSpeed: 0,
    grossSpeed: 0,
    dabRemainder: 0,
    smudgeColor: [
      Math.fround(initialColor[0]),
      Math.fround(initialColor[1]),
      Math.fround(initialColor[2]),
      Math.fround(initialColor[3]),
    ],
  };
}

export function validateLibMypaintDynamicsConfig(config: LibMypaintDynamicsConfig): void {
  if (!isFiniteInRange(config.radiusLog, -2, 6)) {
    throw new SumiError("lmp-invalid-config", "radiusLog는 [-2, 6] 유한값이어야 한다", {
      radiusLog: config.radiusLog,
    });
  }
  if (!isFiniteInRange(config.opaque, 0, 1)) {
    throw new SumiError("lmp-invalid-config", "opaque는 [0, 1]이어야 한다", {
      opaque: config.opaque,
    });
  }
  if (!isFiniteInRange(config.hardness, 0, 1)) {
    throw new SumiError("lmp-invalid-config", "hardness는 [0, 1]이어야 한다", {
      hardness: config.hardness,
    });
  }
  if (!Number.isFinite(config.dabsPerRadius) || config.dabsPerRadius < 0) {
    throw new SumiError("lmp-invalid-config", "dabsPerRadius는 0 이상이어야 한다", {
      dabsPerRadius: config.dabsPerRadius,
    });
  }
  if (!Number.isFinite(config.dabsPerSecond) || config.dabsPerSecond < 0) {
    throw new SumiError("lmp-invalid-config", "dabsPerSecond는 0 이상이어야 한다", {
      dabsPerSecond: config.dabsPerSecond,
    });
  }
  if (!isFiniteInRange(config.slowTracking, 0, 10)) {
    throw new SumiError("lmp-invalid-config", "slowTracking은 [0, 10]이어야 한다", {
      slowTracking: config.slowTracking,
    });
  }
  if (!isFiniteInRange(config.smudgeRate, 0, 1)) {
    throw new SumiError("lmp-invalid-config", "smudgeRate는 [0, 1]이어야 한다", {
      smudgeRate: config.smudgeRate,
    });
  }
}

/**
 * 한 프레임 입력 표본으로 Libmypaint 개념 다이내믹 상태와 방출 다브 파라미터를 갱신한다.
 */
export function stepLibMypaintDynamics(
  state: LibMypaintDynamicsState,
  sample: LibMypaintSampleInput,
  dtMs: number,
  brushColor: LinearRgba,
  config: LibMypaintDynamicsConfig = DEFAULT_MYPAINT_STEP_CONFIG,
): LibMypaintStepResult {
  validateLibMypaintDynamicsConfig(config);

  if (!Number.isFinite(dtMs) || dtMs <= 0) {
    throw new SumiError("lmp-invalid-sample", "dtMs는 0 초과 유한값이어야 한다", { dtMs });
  }
  if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
    throw new SumiError("lmp-invalid-sample", "좌표 x/y는 유한값이어야 한다", {
      x: sample.x,
      y: sample.y,
    });
  }
  if (!isFiniteInRange(sample.pressure, 0, 1)) {
    throw new SumiError("lmp-invalid-sample", "pressure는 [0, 1]이어야 한다", {
      pressure: sample.pressure,
    });
  }

  const dtSec = dtMs / 1000;
  const trackingFactor =
    !state.initialized || config.slowTracking <= 0
      ? 1
      : Math.min(1, dtSec / (dtSec + config.slowTracking * 0.015));

  const nextX = state.initialized
    ? Math.fround(state.x + (sample.x - state.x) * trackingFactor)
    : Math.fround(sample.x);
  const nextY = state.initialized
    ? Math.fround(state.y + (sample.y - state.y) * trackingFactor)
    : Math.fround(sample.y);

  const distPx = state.initialized ? Math.hypot(nextX - state.x, nextY - state.y) : 0;
  const baseRadius = Math.max(0.5, Math.exp(config.radiusLog));
  const normSpeed = distPx / Math.max(0.0001, dtSec * baseRadius);

  const fineDecay = Math.min(1, dtSec / 0.04);
  const grossDecay = Math.min(1, dtSec / 0.25);
  const fineSpeed = Math.fround(state.fineSpeed + (normSpeed - state.fineSpeed) * fineDecay);
  const grossSpeed = Math.fround(state.grossSpeed + (normSpeed - state.grossSpeed) * grossDecay);

  const pressureSmooth = state.initialized
    ? Math.fround(state.pressure + (sample.pressure - state.pressure) * 0.65)
    : Math.fround(sample.pressure);

  const speedLogMod = -config.speedRadiusGamma * Math.log1p(fineSpeed * 0.25);
  const pressureRadiusMod = 0.35 + 0.65 * Math.pow(pressureSmooth, 0.85);
  const effectiveRadiusPx = Math.fround(
    Math.max(0.5, Math.exp(config.radiusLog + speedLogMod) * pressureRadiusMod),
  );

  const effectiveOpacity = Math.fround(
    clamp01(config.opaque * (0.2 + 0.8 * pressureSmooth)),
  );
  const effectiveHardness = Math.fround(
    clamp01(config.hardness * (0.75 + 0.25 * pressureSmooth)),
  );

  const tiltMag = Math.min(1, Math.hypot(sample.tiltX, sample.tiltY) / 90);
  const aspectRatio = Math.fround(1 / (1 + tiltMag * 1.4));
  const angleRad = Math.fround(
    tiltMag > 0.01 ? Math.atan2(sample.tiltY, sample.tiltX) : 0,
  );

  const spatialDabs = (distPx / Math.max(0.5, effectiveRadiusPx)) * config.dabsPerRadius;
  const temporalDabs = dtSec * config.dabsPerSecond;
  const totalDabs = state.dabRemainder + spatialDabs + temporalDabs;
  const dabsToEmit = state.initialized ? Math.floor(totalDabs) : Math.max(1, Math.floor(totalDabs));
  const dabRemainder = Math.fround(Math.max(0, totalDabs - dabsToEmit));

  // Kubelka-Munk(K/S) 공간에서 스머지 색과 브러시 색을 혼합
  const canvasTarget = sample.canvasColor ?? state.smudgeColor;
  const pickupWeight = clamp01(config.smudgeRate * (1 - 0.3 * config.pressurePigmentGain * pressureSmooth));
  const [mixedR, mixedG, mixedB] = kmMixRgb(
    [brushColor[0], brushColor[1], brushColor[2]],
    [canvasTarget[0], canvasTarget[1], canvasTarget[2]],
    pickupWeight,
  );
  const mixedA = Math.fround(
    brushColor[3] * (1 - pickupWeight) + canvasTarget[3] * pickupWeight,
  );
  const nextSmudgeColor: LinearRgba = [
    Math.fround(mixedR),
    Math.fround(mixedG),
    Math.fround(mixedB),
    mixedA,
  ];

  const nextState: LibMypaintDynamicsState = {
    initialized: true,
    x: nextX,
    y: nextY,
    pressure: pressureSmooth,
    fineSpeed,
    grossSpeed,
    dabRemainder,
    smudgeColor: nextSmudgeColor,
  };

  return {
    state: nextState,
    effectiveRadiusPx,
    effectiveOpacity,
    effectiveHardness,
    aspectRatio,
    angleRad,
    dabsToEmit,
    emittedColor: nextSmudgeColor,
  };
}

// ============================================================================
// 2. 변위(dx/dy)·방향 필터·스머지 버킷 기반 API (Libmypaint*)
// ============================================================================

export interface LibmypaintDynamicsConfig {
  /** 기본 로그 반경: r_px = exp(radiusLog). 예: ln(4) ≈ 1.386 */
  readonly radiusLog: number;
  /** 압력에 따른 로그 반경 변화량(-2 .. 2) */
  readonly radiusByPressure: number;
  /** 세밀 속도(speed1)에 따른 로그 반경 변화량(-2 .. 2) */
  readonly radiusBySpeed1: number;
  /** 기본 불투명도(0 .. 1) */
  readonly opaque: number;
  /** 압력 곱셈 지수(0 = 비활성, 1 = 선형 압력 게이트, >1 = 소프트 진입) */
  readonly opaqueMultiplyGamma: number;
  /** 타원 종횡비(1.0 = 원형, >1 = 장축 연신) */
  readonly ellipticalDabRatio: number;
  /** 빠른 속도 필터 시간 상수(초 단위 환산 계수, > 0) */
  readonly speed1Slowness: number;
  /** 느린 속도 필터 시간 상수(초 단위 환산 계수, > 0) */
  readonly speed2Slowness: number;
  /** 속도 로그 감마(> 0) */
  readonly speedGamma: number;
  /** 방향 필터 관성(> 0) */
  readonly directionFilterSlowness: number;
  /** 스머지 흡수율(0 = 스머지 없음, 1 = 캔버스 색 즉시 흡수) */
  readonly smudgeRate: number;
}

export interface LibmypaintDynamicsState {
  readonly speed1: number;
  readonly speed2: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly directionRad: number;
  readonly effectiveRadiusPx: number;
  readonly effectiveOpacity: number;
  readonly smudgeColor: readonly [number, number, number, number];
}

export interface LibmypaintSampleInput {
  readonly dx: number;
  readonly dy: number;
  readonly pressure: number;
  readonly dtSec: number;
  readonly canvasSampleColor?: readonly [number, number, number, number];
}

const DEFAULT_CONFIG: LibmypaintDynamicsConfig = {
  radiusLog: Math.fround(Math.log(6)),
  radiusByPressure: 0.45,
  radiusBySpeed1: -0.18,
  opaque: 0.85,
  opaqueMultiplyGamma: 1.15,
  ellipticalDabRatio: 1.35,
  speed1Slowness: 0.04,
  speed2Slowness: 0.32,
  speedGamma: 4.0,
  directionFilterSlowness: 0.08,
  smudgeRate: 0.25,
} as const;

export function defaultLibmypaintDynamicsConfig(): LibmypaintDynamicsConfig {
  return { ...DEFAULT_CONFIG };
}

export function defaultLibmypaintDynamicsState(
  initialColor: readonly [number, number, number, number] = [0, 0, 0, 1],
): LibmypaintDynamicsState {
  return {
    speed1: 0,
    speed2: 0,
    dirX: 1,
    dirY: 0,
    directionRad: 0,
    effectiveRadiusPx: f32(Math.exp(DEFAULT_CONFIG.radiusLog)),
    effectiveOpacity: 0,
    smudgeColor: [
      f32(clamp01(initialColor[0])),
      f32(clamp01(initialColor[1])),
      f32(clamp01(initialColor[2])),
      f32(clamp01(initialColor[3])),
    ],
  };
}

export function validateLibmypaintDynamicsConfig(config: LibmypaintDynamicsConfig): void {
  if (!Number.isFinite(config.radiusLog) || config.radiusLog < -4 || config.radiusLog > 7) {
    throw new SumiError("lmp-invalid-config", "radiusLog는 [-4, 7] 범위여야 한다", {
      radiusLog: config.radiusLog,
    });
  }
  if (!Number.isFinite(config.opaque) || config.opaque < 0 || config.opaque > 1) {
    throw new SumiError("lmp-invalid-config", "opaque는 [0, 1]이어야 한다", {
      opaque: config.opaque,
    });
  }
  if (
    !Number.isFinite(config.speed1Slowness) ||
    config.speed1Slowness <= 0 ||
    !Number.isFinite(config.speed2Slowness) ||
    config.speed2Slowness <= 0
  ) {
    throw new SumiError("lmp-invalid-config", "속도 필터 시간 상수는 0 초과여야 한다", {
      speed1Slowness: config.speed1Slowness,
      speed2Slowness: config.speed2Slowness,
    });
  }
  if (!Number.isFinite(config.ellipticalDabRatio) || config.ellipticalDabRatio < 1) {
    throw new SumiError("lmp-invalid-config", "ellipticalDabRatio는 1 이상이어야 한다", {
      ellipticalDabRatio: config.ellipticalDabRatio,
    });
  }
}

/**
 * 원시 이동 속도를 로그 감마 정규화 속도 지표로 변환한다.
 * normSpeed = log(gamma + rawSpeed) - log(gamma)
 */
export function computeNormalizedSpeed(rawSpeed: number, gamma = 4.0): number {
  const g = Math.max(0.1, Number.isFinite(gamma) ? gamma : 4.0);
  const s = Math.max(0, Number.isFinite(rawSpeed) ? rawSpeed : 0);
  return f32(Math.log(g + s) - Math.log(g));
}

/**
 * 스머지 버킷 색상을 캔버스 표본 색상과 KM(Kubelka-Munk) 색공간에서 지수 감쇠 혼합한다.
 */
export function updateMyPaintSmudgeBucket(
  currentBucket: readonly [number, number, number, number],
  canvasSample: readonly [number, number, number, number],
  smudgeRate: number,
  dtSec: number,
): readonly [number, number, number, number] {
  const rate = clamp01(smudgeRate);
  if (rate === 0 || dtSec <= 0) {
    return [
      f32(currentBucket[0]),
      f32(currentBucket[1]),
      f32(currentBucket[2]),
      f32(currentBucket[3]),
    ];
  }
  const blendFactor = f32(clamp01(1 - Math.exp(-rate * Math.max(1e-4, dtSec) * 60)));
  const [r, g, b] = kmMixRgb(
    [currentBucket[0], currentBucket[1], currentBucket[2]],
    [canvasSample[0], canvasSample[1], canvasSample[2]],
    blendFactor,
  );
  const a = f32(currentBucket[3] + (canvasSample[3] - currentBucket[3]) * blendFactor);
  return [f32(r), f32(g), f32(b), clamp01(a)];
}

/**
 * 한 표본 구간(dtSec) 동안 Libmypaint 동역학 상태를 갱신한다.
 */
export function stepLibmypaintDynamics(
  state: LibmypaintDynamicsState,
  sample: LibmypaintSampleInput,
  config: LibmypaintDynamicsConfig = defaultLibmypaintDynamicsConfig(),
): LibmypaintDynamicsState {
  validateLibmypaintDynamicsConfig(config);
  if (!Number.isFinite(sample.dtSec) || sample.dtSec <= 0) {
    throw new SumiError("lmp-invalid-sample", "dtSec는 0 초과 유한값이어야 한다", {
      dtSec: sample.dtSec,
    });
  }
  if (!Number.isFinite(sample.pressure) || sample.pressure < 0 || sample.pressure > 1) {
    throw new SumiError("lmp-invalid-sample", "pressure는 [0, 1]이어야 한다", {
      pressure: sample.pressure,
    });
  }

  const baseRadius = Math.max(0.5, Math.exp(config.radiusLog));
  const distPx = Math.hypot(sample.dx, sample.dy);
  // 반경 정규화 순간 속도(반경/초)
  const instNormSpeed = computeNormalizedSpeed(
    distPx / (sample.dtSec * baseRadius),
    config.speedGamma,
  );

  const alphaSpeed1 = 1 - Math.exp(-sample.dtSec / config.speed1Slowness);
  const alphaSpeed2 = 1 - Math.exp(-sample.dtSec / config.speed2Slowness);

  const speed1 = f32(state.speed1 + (instNormSpeed - state.speed1) * alphaSpeed1);
  const speed2 = f32(state.speed2 + (instNormSpeed - state.speed2) * alphaSpeed2);

  // 방향 벡터 갱신(이동량이 있을 때만 지수 감쇠 적용)
  let dirX = state.dirX;
  let dirY = state.dirY;
  if (distPx > 1e-4) {
    const ux = sample.dx / distPx;
    const uy = sample.dy / distPx;
    const alphaDir = 1 - Math.exp(-sample.dtSec / Math.max(1e-3, config.directionFilterSlowness));
    const nx = state.dirX + (ux - state.dirX) * alphaDir;
    const ny = state.dirY + (uy - state.dirY) * alphaDir;
    const norm = Math.hypot(nx, ny) || 1;
    dirX = f32(nx / norm);
    dirY = f32(ny / norm);
  }
  const directionRad = f32(Math.atan2(dirY, dirX));

  // 로그 반경 모듈레이션
  const pressureCentered = sample.pressure - 0.5;
  const modulatedRadiusLog =
    config.radiusLog +
    config.radiusByPressure * pressureCentered +
    config.radiusBySpeed1 * speed1;
  const effectiveRadiusPx = f32(Math.max(0.25, Math.exp(modulatedRadiusLog)));

  // 불투명도 및 opaque_multiply 게이트
  const gamma = Math.max(0, config.opaqueMultiplyGamma);
  const pressureGate =
    sample.pressure <= 0 ? 0 : gamma === 0 ? 1 : Math.pow(sample.pressure, gamma);
  const effectiveOpacity = f32(clamp01(config.opaque * pressureGate));

  const smudgeColor = sample.canvasSampleColor
    ? updateMyPaintSmudgeBucket(
        state.smudgeColor,
        sample.canvasSampleColor,
        config.smudgeRate,
        sample.dtSec,
      )
    : state.smudgeColor;

  return {
    speed1,
    speed2,
    dirX,
    dirY,
    directionRad,
    effectiveRadiusPx,
    effectiveOpacity,
    smudgeColor,
  };
}
