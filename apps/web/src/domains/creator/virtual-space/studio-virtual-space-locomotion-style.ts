/**
 * 이동 감각 스타일 (즉응형 / 관성형)
 *
 * 가상 스튜디오의 이동은 두 가지 감각을 고를 수 있다.
 *
 * - **crisp(즉응형, 기본)**: 게더타운처럼 키를 누르면 바로 걷고 떼면 바로 선다. 속도 벡터를
 *   정해진 시간(출발 50ms · 정지 30ms · 반전 60ms) 안에 목표로 옮기는 슬루 방식이라 프레임
 *   수와 무관하게 같은 응답을 준다. 출발 램프·급회전 감속·충돌 반동·스쿼시/스트레치·몸 흔들림·
 *   카메라 데드존을 쓰지 않아 업무 공간에서 "미끄러지는" 느낌이 없다. 걸음에 맞춘 미세한
 *   위아래 bob만 남겨 걷는 느낌을 유지한다.
 * - **classic(관성형)**: 기존의 무게감 있는 이동. 가속 곡선·출발 램프·급회전 감속·충돌 반동·
 *   스쿼시를 그대로 쓴다(기존 사용자가 원하면 설정에서 되돌릴 수 있다).
 *
 * 순수 모듈이다. Phaser에 의존하지 않고 캔버스 루프는 이 모듈의 값만 읽는다.
 */

import type { StudioVirtualMoveFeel } from "./studio-virtual-space-game-feel-preference";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

export interface StudioLocomotionStyle {
  readonly feel: StudioVirtualMoveFeel;
  /** true면 기존 관성 파이프라인(출발 램프·가감속 커브·급회전 감속·충돌 반동)을 쓴다. */
  readonly inertial: boolean;
  /** 정지 → 최고 속도까지 걸리는 시간(ms). 즉응형에서만 쓴다. */
  readonly rampUpMs: number;
  /** 최고 속도 → 정지까지 걸리는 시간(ms). 즉응형에서만 쓴다. */
  readonly stopMs: number;
  /** 한 방향 최고 속도에서 반대 방향 최고 속도까지 걸리는 시간(ms). 즉응형에서만 쓴다. */
  readonly reverseMs: number;
  /** 벽에 부딪힐 때 튕겨 나오는 반동을 쓸지. */
  readonly collisionBounce: boolean;
  /** 이동 방향 스쿼시/스트레치·접지 스쿼시 강도 배율(0이면 끔). */
  readonly squashScale: number;
  /** 걸음 bob(위아래) 배율. */
  readonly gaitBobScale: number;
  /** 걸음 좌우 스웨이 배율. */
  readonly gaitSwayScale: number;
  /** 걸음 몸 흔들림(회전) 배율. */
  readonly gaitRockScale: number;
  /** 급회전 기울기(lean) 배율. */
  readonly leanScale: number;
  /** 표시 위치 감쇠 시간상수 배율(작을수록 논리 위치를 바짝 따라간다). */
  readonly displayDampScale: number;
  /** 위치가 멈춘 뒤에도 걷기 애니메이션을 유지하는 시간(ms). 렌더 프레임이 물리 스텝보다 잦을 때의 깜빡임 방지용이다. */
  readonly movingHoldMs: number;
  /** 걷기 한 걸음 주기 상한(초당 보폭 사이클). null이면 클립 원래 보폭을 그대로 쓴다. */
  readonly maxGaitCyclesPerSecond: number | null;
  /** 카메라 추종 속도 배율. */
  readonly cameraFollowScale: number;
  /** 카메라 룩어헤드 배율. */
  readonly cameraLookAheadScale: number;
  /** 카메라 데드존 크기 배율(0이면 데드존 없음). */
  readonly cameraDeadzoneScale: number;
  /** 원격 참가자 표시 위치가 이 거리(px) 안의 차이는 무시하는 데드존. */
  readonly peerDeadzonePx: number;
}

const CRISP: StudioLocomotionStyle = Object.freeze({
  feel: "crisp",
  inertial: false,
  rampUpMs: 50,
  stopMs: 30,
  reverseMs: 60,
  collisionBounce: false,
  squashScale: 0,
  gaitBobScale: 0.45,
  gaitSwayScale: 0,
  gaitRockScale: 0,
  leanScale: 0,
  displayDampScale: 0.35,
  movingHoldMs: 45,
  maxGaitCyclesPerSecond: 2.2,
  cameraFollowScale: 1.7,
  cameraLookAheadScale: 0.5,
  cameraDeadzoneScale: 0.2,
  peerDeadzonePx: 0.35,
});

const CLASSIC: StudioLocomotionStyle = Object.freeze({
  feel: "classic",
  inertial: true,
  rampUpMs: 250,
  stopMs: 217,
  reverseMs: 383,
  collisionBounce: true,
  squashScale: 1,
  gaitBobScale: 1,
  gaitSwayScale: 1,
  gaitRockScale: 1,
  leanScale: 1,
  displayDampScale: 1,
  movingHoldMs: 100,
  maxGaitCyclesPerSecond: null,
  cameraFollowScale: 1,
  cameraLookAheadScale: 1,
  cameraDeadzoneScale: 1,
  peerDeadzonePx: 2.5,
});

/** 이동 감각 이름 → 스타일 상수. 알 수 없는 값은 기본(즉응형)이다. */
export function studioLocomotionStyle(feel: StudioVirtualMoveFeel | null | undefined): StudioLocomotionStyle {
  return feel === "classic" ? CLASSIC : CRISP;
}

/** 한 번의 속도 갱신이 다룰 수 있는 최대 시간(초). 탭 전환 뒤 첫 프레임 같은 긴 틈을 자른다. */
const MAX_STEP_SECONDS = 0.05;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * 즉응형 속도 갱신.
 *
 * 현재 속도 벡터를 목표 속도 벡터로 "정해진 시간 안에" 옮긴다. 가속도는 `최고속도 / 시간`이라
 * 프레임 간격이 달라도 같은 시간에 같은 속도에 닿고, 목표에 닿으면 정확히 목표값으로 멈춘다
 * (꼬리처럼 남는 미세 속도·미끄러짐이 없다).
 *
 * - 출발·가속: `rampUpMs`
 * - 키를 떼거나 더 느린 목표로: `stopMs`
 * - 반대 방향 입력(내적 < 0): `reverseMs` (두 방향 최고 속도 사이를 이 시간에 건넌다)
 *
 * `responsiveness`는 설정의 가속 배율이다(클수록 더 즉각적).
 */
export function stepCrispVelocity(
  current: StudioVirtualSpacePoint,
  target: StudioVirtualSpacePoint,
  deltaSeconds: number,
  maxSpeed: number,
  style: Pick<StudioLocomotionStyle, "rampUpMs" | "stopMs" | "reverseMs">,
  responsiveness = 1,
): StudioVirtualSpacePoint {
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, MAX_STEP_SECONDS)) : 0;
  const cx = finiteOr(current.x, 0);
  const cy = finiteOr(current.y, 0);
  const tx = finiteOr(target.x, 0);
  const ty = finiteOr(target.y, 0);
  if (dt === 0) return { x: cx, y: cy };

  const reference = Math.max(1, finiteOr(maxSpeed, 0));
  const scale = Math.min(4, Math.max(0.25, finiteOr(responsiveness, 1)));
  const currentSpeed = Math.hypot(cx, cy);
  const targetSpeed = Math.hypot(tx, ty);

  let durationMs = style.rampUpMs;
  let span = reference;
  if (targetSpeed < 0.001) {
    durationMs = style.stopMs;
  } else if (currentSpeed > 1 && cx * tx + cy * ty < 0) {
    durationMs = style.reverseMs;
    span = reference * 2;
  } else if (targetSpeed < currentSpeed) {
    durationMs = style.stopMs;
  }
  const rate = span / Math.max(1, durationMs) * 1000 * scale;
  const limit = rate * dt;
  const dx = tx - cx;
  const dy = ty - cy;
  const difference = Math.hypot(dx, dy);
  if (difference <= limit) return { x: tx, y: ty };
  const fraction = limit / difference;
  return { x: cx + dx * fraction, y: cy + dy * fraction };
}

/**
 * 걷기 보폭을 이동 속도에 맞춰 늘린다.
 *
 * 걷기 속도가 빠른 월드(예: 247px/s)에서 클립 고유 보폭(예: 82px)을 그대로 쓰면 초당 3사이클
 * (6걸음)로 다리가 허둥대듯 돈다. `maxGaitCyclesPerSecond`를 넘지 않도록 보폭만 늘리면 걸음이
 * 차분해진다. 프레임 선택·bob·그림자가 같은 보폭을 써야 발 접지와 몸 움직임이 어긋나지 않으므로
 * 이 값을 유효 보폭 계산의 입력으로 한 번만 쓴다. 설정이 없는 스타일(관성형)이나 속도 정보가
 * 없으면 보폭을 그대로 돌려준다.
 */
export function studioCadenceLimitedStride(
  stride: number,
  walkSpeed: number,
  style: Pick<StudioLocomotionStyle, "maxGaitCyclesPerSecond">,
): number {
  const limit = style.maxGaitCyclesPerSecond;
  if (limit === null || !(limit > 0) || !Number.isFinite(stride) || stride <= 0
    || !Number.isFinite(walkSpeed) || walkSpeed <= 0) return stride;
  return Math.max(stride, walkSpeed / limit);
}

/** 1을 기준으로 변형 크기만 배율한다(배율 0이면 항상 1, 1이면 원래 값). */
export function scaleAroundOne(value: number, scale: number): number {
  if (!Number.isFinite(value)) return 1;
  if (!Number.isFinite(scale) || scale === 1) return value;
  return 1 + (value - 1) * Math.max(0, scale);
}
