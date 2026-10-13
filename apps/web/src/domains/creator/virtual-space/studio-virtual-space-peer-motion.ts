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
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
  type StudioSpacePhysicsConfig,
} from "./studio-virtual-space-physics";

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
 * 궤적을 경과 지점까지 적분한 값에 (1 − 경과/흡수 창) 봉합을 곱한다.
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
  const targetSteps = Math.max(1, Math.round((elapsedMs / 1_000) / SIM_STEP_SECONDS));
  let velocity: StudioVirtualSpacePoint = { x: startX, y: startY };
  let x = 0;
  let y = 0;
  for (let step = 0; step < targetSteps; step += 1) {
    if (Math.hypot(velocity.x, velocity.y) <= SIM_REST_SPEED) break;
    velocity = stepFeelVelocity(velocity, REST, SIM_STEP_SECONDS, config);
    x += velocity.x * SIM_STEP_SECONDS;
    y += velocity.y * SIM_STEP_SECONDS;
  }
  const envelope = 1 - elapsedMs / STUDIO_PEER_IMPACT_ABSORB_MS;
  return Object.freeze({ x: x * envelope, y: y * envelope });
}
