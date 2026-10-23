/**
 * Libmypaint 다이내믹 및 스머지 개념 재구현(원본 코드 미참조, ISC 개념 내재화).
 * 로그 반경(radius_logarithmic), 저속/고속 이중 속도 필터(fine/gross speed),
 * 슬로 트래킹(slow_tracking) 위치 안정화, 다브 누적기(dab accumulator),
 * Kubelka-Munk(K/S) 안료 공간 스머지 픽업 및 압력 기반 농도 변화를 계산한다.
 *
 * 원본 C 코드·식별자·오프셋을 복사하지 않으며 수식 아이디어만 재구현한다(license-policy.md 4.5절).
 * 모든 부동소수점 결과는 Math.fround로 f32 결정성을 유지한다.
 */

import { SumiError } from "../core/errors";

import { kmMixRgb } from "./kubelka-munk";

export type LinearRgba = readonly [number, number, number, number];

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

const DEFAULT_CONFIG: LibMypaintDynamicsConfig = {
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

function isFiniteInRange(v: number, min: number, max: number): boolean {
  return Number.isFinite(v) && v >= min && v <= max;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function defaultLibMypaintDynamicsConfig(): LibMypaintDynamicsConfig {
  return { ...DEFAULT_CONFIG };
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
  config: LibMypaintDynamicsConfig = DEFAULT_CONFIG,
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
