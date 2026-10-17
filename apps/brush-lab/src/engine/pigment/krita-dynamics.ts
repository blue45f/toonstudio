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
