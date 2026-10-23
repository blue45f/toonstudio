/**
 * Krita 다이내믹 concept 수식(개념 재구현, 원본 코드 미참조).
 * 획 도중 압력·기울기·속도·시간 간격을 현재 파라미터 상태로 갱신한다.
 *
 * GPL 원본(Krita Core)의 코드·식별자·주석·오프셋을 복사하지 않으며,
 * 개념·파라미터·수식 아이디어만 사용한다(license-policy.md 4.5절).
 * 모든 연산은 Math.fround로 f32 정확도를 유지한다(km-mix.ts 관례).
 */

import { SumiError } from "../core/errors";

import { kmMixRgb } from "./kubelka-munk";

export interface KritaDynamicsConfig {
  readonly pressureSmoothing: number; // 0 .. 1, 0이면 목표 압력으로 즉시 수렴
  readonly tiltSensitivity: number;   // 0 .. 1
  readonly speedDecay: number;        // 0 .. 1, 0이면 속도 영향 무시
  readonly timeConstant: number;      // ms, 0 초과
}

export interface KritaDynamicsState {
  readonly pressure: number; // 0 .. 1
  readonly tiltX: number;    // -1 .. 1
  readonly tiltY: number;    // -1 .. 1
  readonly speed: number;    // 픽셀/초 이상
}

export interface KritaDynamicsSample {
  readonly pressure: number; // 0 .. 1
  readonly tiltX: number;    // -1 .. 1
  readonly tiltY: number;    // -1 .. 1
  readonly dx: number;       // 프레임 내 X 이동량(px)
  readonly dy: number;       // 프레임 내 Y 이동량(px)
}

const DEFAULT_CONFIG: KritaDynamicsConfig = {
  pressureSmoothing: 0.3,
  tiltSensitivity: 0.5,
  speedDecay: 0.4,
  timeConstant: 50,
} as const;

const DEFAULT_STATE: KritaDynamicsState = {
  pressure: 0,
  tiltX: 0,
  tiltY: 0,
  speed: 0,
};

function isFinite01(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/** 설정 구조 검사. 위반 시 SumiError("kd-invalid-config", …). */
export function validateDynamicsConfig(config: KritaDynamicsConfig): void {
  if (!Number.isFinite(config.timeConstant) || config.timeConstant <= 0) {
    throw new SumiError("kd-invalid-config", "timeConstant은 0 초과 유한값이어야 한다", {
      timeConstant: config.timeConstant,
    });
  }
  if (!isFinite01(config.pressureSmoothing)) {
    throw new SumiError("kd-invalid-config", "pressureSmoothing은 [0, 1]이어야 한다", {
      pressureSmoothing: config.pressureSmoothing,
    });
  }
  if (!isFinite01(config.tiltSensitivity)) {
    throw new SumiError("kd-invalid-config", "tiltSensitivity은 [0, 1]이어야 한다", {
      tiltSensitivity: config.tiltSensitivity,
    });
  }
  if (!isFinite01(config.speedDecay)) {
    throw new SumiError("kd-invalid-config", "speedDecay은 [0, 1]이어야 한다", {
      speedDecay: config.speedDecay,
    });
  }
}

export function defaultDynamicsConfig(): KritaDynamicsConfig {
  return { ...DEFAULT_CONFIG };
}

export function defaultDynamicsState(): KritaDynamicsState {
  return { ...DEFAULT_STATE };
}

/**
 * 압력·기울기·속도를 시간 간격 dtMs만큼 앞선 상태로 갱신한다.
 * 입력 state는 변경하지 않고 새 상태 객체를 반환한다.
 * - dtMs <= 0 → SumiError("kd-invalid-config")
 * - pressureSmoothing이 0이면 목표 압력으로 즉시 수렴
 * - speedDecay가 0이면 속도 영향을 무시(속도 0)
 */
export function updateDynamics(
  state: KritaDynamicsState,
  sample: KritaDynamicsSample,
  dtMs: number,
  config: KritaDynamicsConfig = defaultDynamicsConfig(),
): KritaDynamicsState {
  validateDynamicsConfig(config);

  if (!Number.isFinite(dtMs) || dtMs <= 0) {
    throw new SumiError("kd-invalid-config", "dtMs은 0 초과여야 한다", { dtMs });
  }
  if (!Number.isFinite(sample.pressure) || !isFinite01(sample.pressure)) {
    throw new SumiError("kd-invalid-config", "sample.pressure는 [0, 1]이어야 한다", {
      pressure: sample.pressure,
    });
  }

  const alpha = Math.min(1, dtMs / config.timeConstant);
  const pressureStep = config.pressureSmoothing * alpha;
  const tiltStep = config.tiltSensitivity * alpha;
  const speedStep = config.speedDecay * alpha;

  const pressure =
    config.pressureSmoothing === 0
      ? sample.pressure
      : Math.fround(state.pressure + (sample.pressure - state.pressure) * pressureStep);
  const tiltX =
    config.tiltSensitivity === 0
      ? 0
      : Math.fround(state.tiltX + (sample.tiltX - state.tiltX) * tiltStep);
  const tiltY =
    config.tiltSensitivity === 0
      ? 0
      : Math.fround(state.tiltY + (sample.tiltY - state.tiltY) * tiltStep);

  const elapsedSec = dtMs / 1000;
  const newSpeed = Math.hypot(sample.dx, sample.dy) / elapsedSec;
  const speed =
    config.speedDecay === 0 ? 0 : Math.fround(state.speed + (newSpeed - state.speed) * speedStep);

  return { pressure, tiltX, tiltY, speed };
}

/**
 * 색 보간(prev → target, 비율 alpha). 원형 보간은 kubelka-munk.ts의
 * 색공간 함수(kmMixRgb, K/S 공간)를 재사용하고 새 믹서를 만들지 않는다.
 * 결과는 선형 sRGB 0..1, f32.
 */
export function smoothColor(
  prev: readonly [number, number, number],
  target: readonly [number, number, number],
  alpha: number,
): [number, number, number] {
  const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  return kmMixRgb(prev as [number, number, number], target as [number, number, number], t);
}

/**
 * 비선형 필압 전달 곡선(감마 + 3차 에르미트 S-커브 블렌드).
 * 입력 pressure ∈ [0, 1]에 대해 단조 증가하는 f32 응답을 반환한다.
 */
export function evaluatePressureCurve(
  pressure: number,
  gamma = 1.0,
  sCurveStrength = 0.0,
): number {
  if (!Number.isFinite(pressure)) {
    throw new SumiError("kd-invalid-config", "pressure는 유한값이어야 한다", { pressure });
  }
  const p = pressure < 0 ? 0 : pressure > 1 ? 1 : pressure;
  if (p === 0 || p === 1) return Math.fround(p);
  const g = Number.isFinite(gamma) && gamma > 0 ? gamma : 1.0;
  const s = !Number.isFinite(sCurveStrength)
    ? 0
    : sCurveStrength < 0
      ? 0
      : sCurveStrength > 1
        ? 1
        : sCurveStrength;
  const gammaVal = Math.pow(p, g);
  const hermiteVal = p * p * (3 - 2 * p);
  return Math.fround(gammaVal * (1 - s) + hermiteVal * s);
}

/**
 * 에어브러시 시간율(Hz)과 스트로크 이동 속도를 결합한 유효 댑 방출 빈도(dabs/sec).
 */
export function computeDabAirbrushRate(
  baseRateHz: number,
  pressure: number,
  speedPxPerSec: number,
): number {
  const rate = Number.isFinite(baseRateHz) && baseRateHz > 0 ? baseRateHz : 0;
  const p = pressure < 0 ? 0 : pressure > 1 ? 1 : pressure;
  const spd = Number.isFinite(speedPxPerSec) && speedPxPerSec > 0 ? speedPxPerSec : 0;
  const pressureFactor = 0.25 + 0.75 * p;
  const velocityBoost = 1 + Math.min(4, spd / 600);
  return Math.fround(rate * pressureFactor * velocityBoost);
}

/**
 * 진행 방향 접선(dx, dy)과 펜 기울기(tiltX, tiltY)를 결합한 브러시 팁 회전각(라디안, [-π, π]).
 */
export function computeTangentialAngle(
  dx: number,
  dy: number,
  tiltX: number,
  tiltY: number,
  tiltWeight = 0.5,
): number {
  const tw = tiltWeight < 0 ? 0 : tiltWeight > 1 ? 1 : tiltWeight;
  const strokeLen = Math.hypot(dx, dy);
  const tiltLen = Math.hypot(tiltX, tiltY);
  const vx = (strokeLen > 1e-5 ? dx / strokeLen : 1) * (1 - tw) + (tiltLen > 1e-5 ? tiltX / tiltLen : 0) * tw;
  const vy = (strokeLen > 1e-5 ? dy / strokeLen : 0) * (1 - tw) + (tiltLen > 1e-5 ? tiltY / tiltLen : 0) * tw;
  if (Math.hypot(vx, vy) <= 1e-6) return 0;
  return Math.fround(Math.atan2(vy, vx));
}

/**
 * 웨트 스머지/컬러 레이트 혼합: 캔버스 픽업 색상(pickupRgb)과 브러시 고유 색상(brushRgb)을
 * 스머지 길이(smudgeLength), 물감 적재량(paintLoad), 필압(pressure)에 따라 KM 색공간에서 혼합한다.
 */
export function computeWetSmudgeMix(
  brushRgb: readonly [number, number, number],
  pickupRgb: readonly [number, number, number],
  smudgeLength: number,
  paintLoad: number,
  pressure: number,
): [number, number, number] {
  const sl = smudgeLength < 0 ? 0 : smudgeLength > 1 ? 1 : smudgeLength;
  const pl = paintLoad < 0 ? 0 : paintLoad > 1 ? 1 : paintLoad;
  const p = pressure < 0 ? 0 : pressure > 1 ? 1 : pressure;
  // 브러시 신규 물감 투입 비율(paintLoad * pressure가 높을수록 브러시 색 우세, smudgeLength가 높을수록 픽업 색 유지)
  const freshRatio = Math.fround(
    Math.min(1, Math.max(0, pl * (0.4 + 0.6 * p) * (1 - sl * 0.65))),
  );
  return kmMixRgb(
    pickupRgb as [number, number, number],
    brushRgb as [number, number, number],
    freshRatio,
  );
}

