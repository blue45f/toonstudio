/**
 * 피어 충돌 반발 재생 (VS 120 웨이브 3 · 피어 모션 전파).
 *
 * 웨이브 1의 충돌 반발은 로컬 플레이어에게만 적용됐다. 원격 피어의 반발 궤적은
 * presence 위치 스트림에도 실리지만, 90ms 샘플링 + 수신 측 타임라인의 100ms 지연
 * 버퍼·보간을 거치며 뭉개져 "벽에서 멈춤"처럼 보인다. 그래서 송신 측은 반발이
 * 채택된 순간의 속도를 impact 패킷으로 따로 보내고, 수신 측은 이 모듈로 재생한다.
 *
 * 재생 곡선은 새로 만들지 않는다. 로컬 몸이 쓰는 것과 같은 `stepFeelVelocity`
 * (속도 비율 기반 감속 커브)를 반발 속도에서 0을 향해 반복 스텝해 궤적을 적분한다.
 * 로컬 반발이 이저를 거쳐 감속하는 것과 수학적으로 같은 움직임이다.
 *
 * 표시 오프셋은 궤적 적분값에 흡수 봉합(absorb envelope)을 곱한 것이다. 위치
 * 스트림도 같은 되돌림을 실어 나르므로, 타임라인이 궤적을 흡수하는 창(지연 버퍼
 * 100ms + 외삽 한도 250ms)이 지나면 오프셋은 0이어야 이중 변위가 남지 않는다.
 * - reducedMotion이거나 효과 억제(low)면 항상 0이다(로컬 반발과 같은 게이트).
 * - 순수 함수다. 타이머·난수·렌더러 의존이 없다.
 */
import { stepFeelVelocity } from "./studio-virtual-space-locomotion-feel";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
  type StudioSpacePhysicsConfig,
} from "./studio-virtual-space-physics";
import {
  STUDIO_DISPLAY_MAX_DELTA_SECONDS,
  createStudioFacingHysteresis,
  stepCriticallyDampedPoint,
  stepStudioFacingHysteresis,
  type StudioFacingHysteresisState,
} from "./studio-virtual-space-sprite-smoothing";

/**
 * 반발 오프셋 흡수 창(ms). 타임라인 지연 버퍼(100ms)와 외삽 한도(250ms)를 합친
 * 시간 안에 위치 스트림이 반발 궤적을 따라잡으므로, 그 뒤에는 오프셋을 남기지 않는다.
 */
export const STUDIO_PEER_IMPACT_ABSORB_MS = 350;

/** 궤적 시뮬레이션 스텝(s). 렌더 프레임보다 잘게 잡아 적분 오차를 줄인다. */
const SIM_STEP_SECONDS = 1 / 240;
/** 시뮬레이션 상한(스텝 수). 480스텝 = 2초면 어떤 반발 속도도 정지에 도달한다. */
const SIM_MAX_STEPS = 480;
/** 이 속도(px/s) 아래면 정지로 보고 시뮬레이션을 끝낸다. */
const SIM_REST_SPEED = 0.5;

const ZERO: StudioVirtualSpacePoint = Object.freeze({ x: 0, y: 0 });
const REST: StudioVirtualSpacePoint = Object.freeze({ x: 0, y: 0 });

function safeVelocity(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * 반발 속도가 같은 감쇠 곡선으로 정지할 때까지의 전체 변위(되돌림 총량)를 구한다.
 * 온셋 순간의 튀어 나가는 크기를 재는 용도이며, 표시에는 아래 offsetAt을 쓴다.
 */
export function peerImpactExcursion(
  vx: number,
  vy: number,
  config: StudioSpacePhysicsConfig = DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
): StudioVirtualSpacePoint {
  let velocity: StudioVirtualSpacePoint = { x: safeVelocity(vx), y: safeVelocity(vy) };
  let x = 0;
  let y = 0;
  for (let step = 0; step < SIM_MAX_STEPS; step += 1) {
    if (Math.hypot(velocity.x, velocity.y) <= SIM_REST_SPEED) break;
    velocity = stepFeelVelocity(velocity, REST, SIM_STEP_SECONDS, config);
    x += velocity.x * SIM_STEP_SECONDS;
    y += velocity.y * SIM_STEP_SECONDS;
  }
  return Object.freeze({ x, y });
}

/**
 * 반발 후 경과 시간에서의 표시 오프셋.
 * 궤적을 경과 지점까지(잔여 소수 스텝 포함) 적분한 값에 C1 smoothstep 봉합을 곱한다.
 * 경과가 흡수 창을 넘으면 정확히 0이다 — 타임라인 위치와 이중으로 남지 않는다.
 */
export function peerImpactOffsetAt(
  vx: number,
  vy: number,
  elapsedMs: number,
  options: {
    readonly config?: StudioSpacePhysicsConfig;
    readonly suppressed?: boolean;
  } = {},
): StudioVirtualSpacePoint {
  if (options.suppressed) return ZERO;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= STUDIO_PEER_IMPACT_ABSORB_MS) return ZERO;
  const startX = safeVelocity(vx);
  const startY = safeVelocity(vy);
  if (startX === 0 && startY === 0) return ZERO;
  const config = options.config ?? DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG;
  const exactSteps = (elapsedMs / 1_000) / SIM_STEP_SECONDS;
  const wholeSteps = Math.floor(exactSteps);
  const remainderSec = (exactSteps - wholeSteps) * SIM_STEP_SECONDS;
  let velocity: StudioVirtualSpacePoint = { x: startX, y: startY };
  let x = 0;
  let y = 0;
  for (let step = 0; step < wholeSteps; step += 1) {
    if (Math.hypot(velocity.x, velocity.y) <= SIM_REST_SPEED) break;
    velocity = stepFeelVelocity(velocity, REST, SIM_STEP_SECONDS, config);
    x += velocity.x * SIM_STEP_SECONDS;
    y += velocity.y * SIM_STEP_SECONDS;
  }
  if (remainderSec > 1e-6 && Math.hypot(velocity.x, velocity.y) > SIM_REST_SPEED) {
    velocity = stepFeelVelocity(velocity, REST, remainderSec, config);
    x += velocity.x * remainderSec;
    y += velocity.y * remainderSec;
  }
  const progress = Math.min(1, Math.max(0, elapsedMs / STUDIO_PEER_IMPACT_ABSORB_MS));
  const envelope = 1 - progress * progress * (3 - 2 * progress);
  return Object.freeze({ x: x * envelope, y: y * envelope });
}

/* ---------------------------------------------------------------------------------------------- */
/* 원격 피어 Anti-Jitter 속도 제한 보간 & 패킷 손실 부드러운 감속 정지                                 */
/* ---------------------------------------------------------------------------------------------- */

/** 원격 피어 보간 추종 속도 상한(px/s). 패킷이 몰려 들어와도 순간이동처럼 튀지 않게 한다. */
export const STUDIO_PEER_MAX_FOLLOW_SPEED = 420;
/** 원격 피어 임계감쇠 스무딩 시간(초). 지연은 줄이면서 네트워크 지터를 매끄럽게 펴 준다. */
export const STUDIO_PEER_SMOOTH_TIME_SECONDS = 0.075;
/** 이 거리(px) 초과 점프는 텔레포트·포털 이동으로 보고 즉시 스냅한다. */
export const STUDIO_PEER_TELEPORT_SNAP_PX = 260;
/** 정지 직전 미세 진동 차단 데드존(px). */
export const STUDIO_PEER_STOP_EPSILON_PX = 0.12;
/** 스냅샷 갱신이 멈춘 뒤 부드러운 감속 정지로 진입하는 유예 시간(ms). */
export const STUDIO_PEER_STALE_GRACE_MS = 180;
/** 패킷 손실 감속 시간상수(초). 급정거 대신 부드럽게 감속해 멈춘다. */
export const STUDIO_PEER_LOSS_DECEL_TAU_SECONDS = 0.14;

export interface StudioPeerAntiJitterState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly facing: StudioVirtualSpaceFacing;
  readonly facingState: StudioFacingHysteresisState;
  readonly moving: boolean;
  readonly decelerating: boolean;
  readonly lastTargetX: number;
  readonly lastTargetY: number;
  readonly lastSnapshotAtMs: number;
}

export interface StudioPeerAntiJitterInput {
  readonly targetX: number;
  readonly targetY: number;
  readonly targetFacing: StudioVirtualSpaceFacing;
  readonly targetMoving: boolean;
  /** 마지막으로 유효한 네트워크 위치 스냅샷이 도착한 시각(ms). */
  readonly snapshotTimestampMs: number;
  readonly nowMs: number;
  readonly deltaSeconds: number;
  readonly reducedMotion?: boolean;
  readonly maxFollowSpeed?: number;
  readonly smoothTimeSeconds?: number;
  readonly teleportDistancePx?: number;
  readonly stopEpsilonPx?: number;
  readonly staleGraceMs?: number;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function createStudioPeerAntiJitterState(
  x: number,
  y: number,
  facing: StudioVirtualSpaceFacing = "down",
  nowMs = 0,
): StudioPeerAntiJitterState {
  const safeX = finiteOr(x, 0);
  const safeY = finiteOr(y, 0);
  const safeNow = finiteOr(nowMs, 0);
  return {
    x: safeX,
    y: safeY,
    vx: 0,
    vy: 0,
    facing,
    facingState: createStudioFacingHysteresis(facing, safeNow),
    moving: false,
    decelerating: false,
    lastTargetX: safeX,
    lastTargetY: safeY,
    lastSnapshotAtMs: safeNow,
  };
}

/**
 * 원격 피어 위치·방향 Anti-Jitter 필터.
 * - 정상 수신: 속도 제한이 걸린 임계감쇠 보간으로 순간이동·오버슈트·떨림을 차단한다.
 * - 짧은 패킷 손실(`nowMs - snapshotTimestampMs > staleGraceMs`): 뚝 끊기지 않고 지수 감속으로 부드럽게 정지한다.
 * - 정지 직전 데드존(`dist <= stopEpsilonPx`)에서 정확히 스냅해 제자리 0.1px 떨림을 0%로 차단한다.
 * - 방향은 히스테리시스 데드존·최소 유지 시간 필터를 통과시켜 대각선/노이즈 채터링을 제거한다.
 */
export function stepStudioPeerAntiJitter(
  state: StudioPeerAntiJitterState | null,
  input: StudioPeerAntiJitterInput,
): StudioPeerAntiJitterState {
  const targetX = finiteOr(input.targetX, state?.x ?? 0);
  const targetY = finiteOr(input.targetY, state?.y ?? 0);
  const nowMs = finiteOr(input.nowMs, state?.lastSnapshotAtMs ?? 0);
  const snapshotAt = finiteOr(input.snapshotTimestampMs, nowMs);

  if (!state || input.reducedMotion) {
    return {
      x: targetX,
      y: targetY,
      vx: 0,
      vy: 0,
      facing: input.targetFacing,
      facingState: createStudioFacingHysteresis(input.targetFacing, nowMs),
      moving: input.targetMoving,
      decelerating: false,
      lastTargetX: targetX,
      lastTargetY: targetY,
      lastSnapshotAtMs: snapshotAt,
    };
  }

  const dt = Math.min(STUDIO_DISPLAY_MAX_DELTA_SECONDS, Math.max(0, finiteOr(input.deltaSeconds, 0)));
  if (dt <= 0) return state;

  const teleportPx = finiteOr(input.teleportDistancePx ?? STUDIO_PEER_TELEPORT_SNAP_PX, STUDIO_PEER_TELEPORT_SNAP_PX);
  const stopEpsilon = Math.max(0, finiteOr(input.stopEpsilonPx ?? STUDIO_PEER_STOP_EPSILON_PX, STUDIO_PEER_STOP_EPSILON_PX));
  const maxSpeed = Math.max(20, finiteOr(input.maxFollowSpeed ?? STUDIO_PEER_MAX_FOLLOW_SPEED, STUDIO_PEER_MAX_FOLLOW_SPEED));
  const smoothTime = Math.max(0.016, finiteOr(input.smoothTimeSeconds ?? STUDIO_PEER_SMOOTH_TIME_SECONDS, STUDIO_PEER_SMOOTH_TIME_SECONDS));
  const staleGraceMs = Math.max(40, finiteOr(input.staleGraceMs ?? STUDIO_PEER_STALE_GRACE_MS, STUDIO_PEER_STALE_GRACE_MS));

  const dxToTarget = targetX - state.x;
  const dyToTarget = targetY - state.y;
  const distToTarget = Math.hypot(dxToTarget, dyToTarget);

  // 텔레포트급 점프는 즉시 스냅해 화면 가로지르기 잔상을 방지
  if (distToTarget > teleportPx) {
    return {
      x: targetX,
      y: targetY,
      vx: 0,
      vy: 0,
      facing: input.targetFacing,
      facingState: createStudioFacingHysteresis(input.targetFacing, nowMs),
      moving: false,
      decelerating: false,
      lastTargetX: targetX,
      lastTargetY: targetY,
      lastSnapshotAtMs: snapshotAt,
    };
  }

  const targetUnchanged = Math.hypot(targetX - state.lastTargetX, targetY - state.lastTargetY) <= stopEpsilon;
  const snapshotAgeMs = Math.max(0, nowMs - snapshotAt);

  // 짧은 패킷 손실 구간: 마지막 속도를 단조 지수 감속시켜 급정거나 가속 스파이크·무한 외삽을 막는다.
  if (targetUnchanged && snapshotAgeMs > staleGraceMs) {
    const prevSpeed = Math.hypot(state.vx, state.vy);
    if (prevSpeed <= 6 && distToTarget <= stopEpsilon) {
      return {
        ...state,
        x: targetX,
        y: targetY,
        vx: 0,
        vy: 0,
        moving: false,
        decelerating: false,
        facing: input.targetFacing,
        facingState: createStudioFacingHysteresis(input.targetFacing, nowMs),
      };
    }
    const decay = Math.exp(-dt / STUDIO_PEER_LOSS_DECEL_TAU_SECONDS);
    let nextSpeed = prevSpeed * decay;
    if (nextSpeed < 6) nextSpeed = 0;

    let nextX = state.x;
    let nextY = state.y;
    let nextVx = 0;
    let nextVy = 0;

    if (nextSpeed > 0) {
      if (distToTarget > stopEpsilon) {
        // 목표 방향으로 감속 속도만큼만 접근하되 목표를 지나치지 않는다.
        const stepDist = Math.min(distToTarget, nextSpeed * dt);
        const dirX = dxToTarget / distToTarget;
        const dirY = dyToTarget / distToTarget;
        nextX = state.x + dirX * stepDist;
        nextY = state.y + dirY * stepDist;
        if (Math.hypot(targetX - nextX, targetY - nextY) <= stopEpsilon) {
          nextX = targetX;
          nextY = targetY;
          nextSpeed = 0;
        } else {
          const actualSpeed = Math.min(nextSpeed, stepDist / dt);
          nextVx = dirX * actualSpeed;
          nextVy = dirY * actualSpeed;
          nextSpeed = actualSpeed;
        }
      } else {
        // 이미 목표점 근처에 도달했으면 잔여 속도만 0으로 정리한다.
        nextX = targetX;
        nextY = targetY;
        nextSpeed = 0;
      }
    }

    const stillMoving = nextSpeed > 6;
    const nextFacingState = stillMoving
      ? stepStudioFacingHysteresis(state.facingState, nextVx, nextVy, nowMs)
      : state.facingState;
    return {
      x: nextX,
      y: nextY,
      vx: nextVx,
      vy: nextVy,
      facing: nextFacingState.facing,
      facingState: nextFacingState,
      moving: stillMoving,
      decelerating: stillMoving,
      lastTargetX: targetX,
      lastTargetY: targetY,
      lastSnapshotAtMs: state.lastSnapshotAtMs,
    };
  }

  // 정상 수신 구간: 속도 상한 임계감쇠 추적
  const nextPoint = stepCriticallyDampedPoint(
    { x: state.x, y: state.y, vx: state.vx, vy: state.vy },
    { x: targetX, y: targetY },
    dt,
    {
      smoothTimeSeconds: smoothTime,
      maxSpeed,
      snapDistancePx: teleportPx,
      stopEpsilonPx: stopEpsilon,
    },
  );
  const speed = Math.hypot(nextPoint.vx, nextPoint.vy);
  const remaining = Math.hypot(targetX - nextPoint.x, targetY - nextPoint.y);
  const nextMoving = remaining > stopEpsilon && (state.moving ? speed > 6 : speed > 12);
  let nextFacingState = state.facingState;
  if (nextMoving) {
    nextFacingState = stepStudioFacingHysteresis(state.facingState, nextPoint.vx, nextPoint.vy, nowMs);
  } else if (!input.targetMoving && remaining <= stopEpsilon && state.facing !== input.targetFacing) {
    nextFacingState = createStudioFacingHysteresis(input.targetFacing, nowMs);
  }
  return {
    x: nextPoint.x,
    y: nextPoint.y,
    vx: nextPoint.vx,
    vy: nextPoint.vy,
    facing: nextFacingState.facing,
    facingState: nextFacingState,
    moving: nextMoving,
    decelerating: false,
    lastTargetX: targetX,
    lastTargetY: targetY,
    lastSnapshotAtMs: targetUnchanged ? state.lastSnapshotAtMs : snapshotAt,
  };
}
