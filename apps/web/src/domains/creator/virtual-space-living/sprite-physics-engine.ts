/**
 * 가상 스튜디오 60fps 2.5D 스프링 캐릭터 물리 엔진.
 *
 * - 서브픽셀 관성 이동(가속·감속·마찰)과 8방향 방향 벡터 스무딩
 * - 이동 속도·가속 기반 스쿼시 & 스트레치(부피 보존: scaleX * scaleY === 1)
 * - Hooke 탄성 + 점성 감쇠 2차 스프링(머리카락·망토 잔상 체인)
 * - 유휴 호흡 사인파, 결정론적 자연 눈 깜빡임, 포인터·동료 시선 추적(gazeAngle)
 */

export type FacingOctant8 = "E" | "SE" | "S" | "SW" | "W" | "NW" | "N" | "NE";
export type EyeBlinkPhase = "open" | "closing" | "closed" | "opening";
export type GazeTargetKind = "none" | "pointer" | "peer";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface StageBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface SpringChainNode {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export interface SecondarySpringParams {
  readonly stiffness: number;
  readonly damping: number;
  readonly segmentLengthPx: number;
  readonly gravityPxPerSec2: number;
  readonly dragFactor: number;
  readonly substeps: number;
}

export interface SquashStretchPose {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly volumeProduct: number;
  readonly leanDeg: number;
}

export interface EyeBlinkState {
  readonly phase: EyeBlinkPhase;
  readonly phaseElapsedSec: number;
  readonly nextBlinkInSec: number;
  readonly eyelidOpenness: number;
  readonly blinkCount: number;
  readonly pendingDoubleBlink: boolean;
  readonly rngState: number;
}

export interface GazeState {
  readonly targetKind: GazeTargetKind;
  readonly targetLabelKo: string;
  readonly gazeAngleRad: number;
  readonly gazeAngleDeg: number;
  readonly pupilOffsetX: number;
  readonly pupilOffsetY: number;
  readonly headTurnRatio: number;
}

export interface TrailGhostPoint {
  readonly x: number;
  readonly y: number;
  readonly speedRatio: number;
  readonly opacity: number;
}

export interface SpritePhysicsConfig {
  readonly bounds: StageBounds;
  readonly maxWalkSpeedPxPerSec: number;
  readonly sprintMultiplier: number;
  readonly accelPxPerSec2: number;
  readonly decelPxPerSec2: number;
  readonly frictionPerSec: number;
  readonly facingSmoothRate: number;
  readonly gazeSmoothRate: number;
  readonly maxSquashStretch: number;
  readonly strideCyclePx: number;
  readonly hairSpring: SecondarySpringParams;
  readonly capeSpring: SecondarySpringParams;
}

export interface SpriteControlInput {
  readonly moveX: number;
  readonly moveY: number;
  readonly sprinting?: boolean;
  readonly pointerTarget?: Vec2 | null;
  readonly peerTargets?: readonly { readonly id: string; readonly labelKo: string; readonly position: Vec2 }[];
}

export interface LivingSpriteState {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly acceleration: Vec2;
  readonly speedPxPerSec: number;
  readonly normalizedSpeed: number;
  readonly facingVector: Vec2;
  readonly facingOctant: FacingOctant8;
  readonly facingOctantIndex: number;
  readonly flipX: boolean;
  readonly squashStretch: SquashStretchPose;
  readonly walkCycleRad: number;
  readonly strideDistancePx: number;
  readonly stepTriggered: boolean;
  readonly footSide: "left" | "right";
  readonly breathPhaseRad: number;
  readonly breathOffsetPx: number;
  readonly blink: EyeBlinkState;
  readonly gaze: GazeState;
  readonly hairNodes: readonly SpringChainNode[];
  readonly capeNodes: readonly SpringChainNode[];
  readonly afterimageTrail: readonly TrailGhostPoint[];
  readonly elapsedSec: number;
}

export const FIXED_PHYSICS_DT_SEC = 1 / 60;
export const MAX_PHYSICS_DT_SEC = 0.05;

export const OCTANT_ORDER_8: readonly FacingOctant8[] = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"] as const;

export const OCTANT_LABEL_KO: Readonly<Record<FacingOctant8, string>> = {
  E: "동쪽",
  SE: "남동쪽",
  S: "남쪽",
  SW: "남서쪽",
  W: "서쪽",
  NW: "북서쪽",
  N: "북쪽",
  NE: "북동쪽",
};

export const DEFAULT_SPRITE_STAGE_BOUNDS: StageBounds = { minX: 48, maxX: 512, minY: 52, maxY: 268 };

export const DEFAULT_SPRITE_PHYSICS_CONFIG: SpritePhysicsConfig = {
  bounds: DEFAULT_SPRITE_STAGE_BOUNDS,
  maxWalkSpeedPxPerSec: 168,
  sprintMultiplier: 1.55,
  accelPxPerSec2: 920,
  decelPxPerSec2: 1180,
  frictionPerSec: 7.4,
  facingSmoothRate: 13.5,
  gazeSmoothRate: 11.0,
  maxSquashStretch: 0.18,
  strideCyclePx: 38,
  hairSpring: { stiffness: 175, damping: 17, segmentLengthPx: 9, gravityPxPerSec2: 110, dragFactor: 0.34, substeps: 3 },
  capeSpring: { stiffness: 112, damping: 12.5, segmentLengthPx: 13, gravityPxPerSec2: 160, dragFactor: 0.48, substeps: 3 },
};

const BLINK_CLOSE_SEC = 0.065;
const BLINK_HOLD_SEC = 0.04;
const BLINK_OPEN_SEC = 0.095;
const BREATH_HZ = 0.28;
const MAX_TRAIL_POINTS = 6;
const STOP_SPEED_EPSILON = 0.65;

export function clampScalar(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

/** 32비트 LCG 기반 결정론적 난수 [0, 1) 생성기 (BigInt 미사용). */
export function advanceDeterministicRng(seed: number): { readonly nextSeed: number; readonly unit: number } {
  const normalized = (Math.floor(seed) >>> 0) || 1337;
  const nextSeed = (Math.imul(normalized, 1664525) + 1013904223) >>> 0;
  return { nextSeed, unit: nextSeed / 4294967296 };
}

/** 방향 벡터를 8방위 옥턴트 인덱스와 방향 키로 변환한다. */
export function mapVectorToOctant8(dx: number, dy: number): { readonly index: number; readonly octant: FacingOctant8 } {
  if (Math.hypot(dx, dy) < 1e-6) return { index: 2, octant: "S" };
  const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  const index = Math.floor(((deg + 22.5) % 360) / 45);
  return { index, octant: OCTANT_ORDER_8[index] ?? "S" };
}

/** 8방향 이동 벡터 지수 스무딩 (단위 벡터 정규화 보장). */
export function smoothDirectionVector(current: Vec2, target: Vec2, dtSec: number, smoothRate: number): Vec2 {
  const targetMag = Math.hypot(target.x, target.y);
  if (targetMag < 1e-5) return current;
  const tx = target.x / targetMag;
  const ty = target.y / targetMag;
  const alpha = 1 - Math.exp(-Math.max(0.1, smoothRate) * clampScalar(dtSec, 0, MAX_PHYSICS_DT_SEC));
  if (Math.hypot(current.x, current.y) < 1e-5) return { x: tx, y: ty };
  const fromAngle = Math.atan2(current.y, current.x);
  const targetAngle = Math.atan2(ty, tx);
  let delta = Math.atan2(Math.sin(targetAngle - fromAngle), Math.cos(targetAngle - fromAngle));
  // 정확한 반대 방향은 항상 같은 회전 방향을 택해 정규화 보간의 고착을 피한다.
  if (Math.abs(Math.abs(delta) - Math.PI) < 1e-9) delta = Math.PI;
  const angle = fromAngle + delta * alpha;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/**
 * 이동 속도·가속 임펄스·보행 바운스·유휴 호흡 기반 스쿼시 & 스트레치.
 * 부피 보존 불변식: `scaleX * scaleY === 1`을 항상 유지한다.
 */
export function computeVolumePreservingSquashStretch(params: {
  readonly normalizedSpeed: number;
  readonly signedAccelImpulse: number;
  readonly walkCycleRad: number;
  readonly breathWave: number;
  readonly vx: number;
  readonly maxSpeed: number;
  readonly maxSquashStretch: number;
}): SquashStretchPose {
  const speedRatio = clampScalar(params.normalizedSpeed, 0, 1.55);
  const accelPulse = clampScalar(params.signedAccelImpulse, -1, 1);
  const walkBounce = Math.sin(params.walkCycleRad * 2) * 0.045 * Math.min(1, speedRatio);
  const idleBreath = params.breathWave * 0.018 * Math.max(0, 1 - speedRatio * 1.4);

  const rawDelta = speedRatio * 0.075 + accelPulse * 0.085 + walkBounce + idleBreath;
  const clampedDelta = clampScalar(rawDelta, -params.maxSquashStretch, params.maxSquashStretch);
  const scaleY = clampScalar(1 + clampedDelta, 0.82, 1.24);
  const scaleX = 1 / scaleY;
  const leanDeg = clampScalar((params.vx / Math.max(1, params.maxSpeed)) * 7.5, -10, 10);

  return { scaleX, scaleY, volumeProduct: scaleX * scaleY, leanDeg };
}

/** Hooke 탄성(F = -k * dx) + 점성 감쇠(F = -c * v) 기반 2차 스프링 체인 솔버. */
export function stepSecondarySpringChain(
  nodes: readonly SpringChainNode[],
  anchor: Vec2,
  carrierVelocity: Vec2,
  dtSec: number,
  params: SecondarySpringParams,
): readonly SpringChainNode[] {
  if (nodes.length === 0) return nodes;
  const clampedDt = clampScalar(dtSec, 0, MAX_PHYSICS_DT_SEC);
  const substeps = Math.max(1, Math.floor(params.substeps));
  const subDt = clampedDt / substeps;
  let working = nodes.map((n) => ({ x: n.x, y: n.y, vx: n.vx, vy: n.vy }));

  for (let step = 0; step < substeps; step += 1) {
    const nextNodes = working.map((n) => ({ ...n }));
    for (let i = 0; i < nextNodes.length; i += 1) {
      const parent = i === 0 ? anchor : nextNodes[i - 1];
      const node = nextNodes[i];
      if (!parent || !node) continue;

      const restX = parent.x - carrierVelocity.x * params.dragFactor * 0.085;
      const restY = parent.y + params.segmentLengthPx - carrierVelocity.y * params.dragFactor * 0.05;
      const fx = -params.stiffness * (node.x - restX) - params.damping * node.vx;
      const fy = -params.stiffness * (node.y - restY) - params.damping * node.vy + params.gravityPxPerSec2 * 0.12;

      node.vx += fx * subDt;
      node.vy += fy * subDt;
      node.x += node.vx * subDt;
      node.y += node.vy * subDt;

      const segDx = node.x - parent.x;
      const segDy = node.y - parent.y;
      const dist = Math.hypot(segDx, segDy);
      const maxStretch = params.segmentLengthPx * 1.65;
      if (dist > maxStretch && dist > 1e-5) {
        const ratio = maxStretch / dist;
        node.x = parent.x + segDx * ratio;
        node.y = parent.y + segDy * ratio;
        node.vx *= 0.85;
        node.vy *= 0.85;
      }
    }
    working = nextNodes;
  }
  return working;
}

/** 결정론적 자연 눈 깜빡임 상태 기계 (2.6~5.4초 주기 + 간헐적 더블 블링크). */
export function stepEyeBlinkState(blink: EyeBlinkState, dtSec: number): EyeBlinkState {
  const dt = clampScalar(dtSec, 0, MAX_PHYSICS_DT_SEC);
  if (blink.phase === "open") {
    const remaining = blink.nextBlinkInSec - dt;
    if (remaining > 0) return { ...blink, nextBlinkInSec: remaining, eyelidOpenness: 1 };
    return { ...blink, phase: "closing", phaseElapsedSec: 0, nextBlinkInSec: 0, eyelidOpenness: 0.75 };
  }

  const nextElapsed = blink.phaseElapsedSec + dt;
  if (blink.phase === "closing") {
    return nextElapsed >= BLINK_CLOSE_SEC
      ? { ...blink, phase: "closed", phaseElapsedSec: 0, eyelidOpenness: 0 }
      : { ...blink, phaseElapsedSec: nextElapsed, eyelidOpenness: clampScalar(1 - nextElapsed / BLINK_CLOSE_SEC, 0, 1) };
  }

  if (blink.phase === "closed") {
    return nextElapsed >= BLINK_HOLD_SEC
      ? { ...blink, phase: "opening", phaseElapsedSec: 0, eyelidOpenness: 0.1 }
      : { ...blink, phaseElapsedSec: nextElapsed, eyelidOpenness: 0 };
  }

  if (nextElapsed >= BLINK_OPEN_SEC) {
    if (blink.pendingDoubleBlink) {
      return {
        ...blink,
        phase: "open",
        phaseElapsedSec: 0,
        nextBlinkInSec: 0.14,
        eyelidOpenness: 1,
        blinkCount: blink.blinkCount + 1,
        pendingDoubleBlink: false,
      };
    }
    const r1 = advanceDeterministicRng(blink.rngState);
    const r2 = advanceDeterministicRng(r1.nextSeed);
    return {
      phase: "open",
      phaseElapsedSec: 0,
      nextBlinkInSec: 2.6 + r1.unit * 2.8,
      eyelidOpenness: 1,
      blinkCount: blink.blinkCount + 1,
      pendingDoubleBlink: r2.unit < 0.18,
      rngState: r2.nextSeed,
    };
  }

  return { ...blink, phaseElapsedSec: nextElapsed, eyelidOpenness: clampScalar(nextElapsed / BLINK_OPEN_SEC, 0, 1) };
}

/** 포인터 또는 가장 가까운 동료를 향한 시선 각도·동공 변위를 계산한다. */
export function stepGazeTracking(params: {
  readonly currentGaze: GazeState;
  readonly eyeOrigin: Vec2;
  readonly facingVector: Vec2;
  readonly pointerTarget?: Vec2 | null;
  readonly peerTargets?: readonly { readonly id: string; readonly labelKo: string; readonly position: Vec2 }[];
  readonly dtSec: number;
  readonly smoothRate: number;
}): GazeState {
  let targetKind: GazeTargetKind = "none";
  let targetLabelKo = "정면 작업 중";
  let desiredAngleRad = Math.atan2(params.facingVector.y, params.facingVector.x);

  if (params.pointerTarget) {
    const dx = params.pointerTarget.x - params.eyeOrigin.x;
    const dy = params.pointerTarget.y - params.eyeOrigin.y;
    if (Math.hypot(dx, dy) > 4) {
      targetKind = "pointer";
      targetLabelKo = "포인터 시선 추적";
      desiredAngleRad = Math.atan2(dy, dx);
    }
  } else if (params.peerTargets && params.peerTargets.length > 0) {
    let nearestDist = 220;
    let nearestPeer: { readonly id: string; readonly labelKo: string; readonly position: Vec2 } | null = null;
    for (const peer of params.peerTargets) {
      const dist = Math.hypot(peer.position.x - params.eyeOrigin.x, peer.position.y - params.eyeOrigin.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestPeer = peer;
      }
    }
    if (nearestPeer) {
      targetKind = "peer";
      targetLabelKo = `${nearestPeer.labelKo} 바라보는 중`;
      desiredAngleRad = Math.atan2(
        nearestPeer.position.y - params.eyeOrigin.y,
        nearestPeer.position.x - params.eyeOrigin.x,
      );
    }
  }

  let delta = desiredAngleRad - params.currentGaze.gazeAngleRad;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;

  const alpha = 1 - Math.exp(-params.smoothRate * clampScalar(params.dtSec, 0, MAX_PHYSICS_DT_SEC));
  const nextAngleRad = params.currentGaze.gazeAngleRad + delta * alpha;

  return {
    targetKind,
    targetLabelKo,
    gazeAngleRad: nextAngleRad,
    gazeAngleDeg: Math.round(((nextAngleRad * 180) / Math.PI) * 10) / 10,
    pupilOffsetX: Math.round(Math.cos(nextAngleRad) * 3.4 * 100) / 100,
    pupilOffsetY: Math.round(Math.sin(nextAngleRad) * 2.4 * 100) / 100,
    headTurnRatio: clampScalar(Math.cos(nextAngleRad), -1, 1),
  };
}

function buildInitialSpringChain(anchor: Vec2, count: number, segmentLengthPx: number): readonly SpringChainNode[] {
  return Array.from({ length: count }, (_, idx) => ({
    x: anchor.x,
    y: anchor.y + (idx + 1) * segmentLengthPx,
    vx: 0,
    vy: 0,
  }));
}

export function createLivingSpriteState(options?: {
  readonly x?: number;
  readonly y?: number;
  readonly blinkSeed?: number;
  readonly config?: SpritePhysicsConfig;
}): LivingSpriteState {
  const cfg = options?.config ?? DEFAULT_SPRITE_PHYSICS_CONFIG;
  const startX = clampScalar(options?.x ?? 280, cfg.bounds.minX, cfg.bounds.maxX);
  const startY = clampScalar(options?.y ?? 164, cfg.bounds.minY, cfg.bounds.maxY);
  const hairAnchor: Vec2 = { x: startX, y: startY - 26 };
  const capeAnchor: Vec2 = { x: startX, y: startY - 6 };

  return {
    position: { x: startX, y: startY },
    velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 },
    speedPxPerSec: 0,
    normalizedSpeed: 0,
    facingVector: { x: 0, y: 1 },
    facingOctant: "S",
    facingOctantIndex: 2,
    flipX: false,
    squashStretch: { scaleX: 1, scaleY: 1, volumeProduct: 1, leanDeg: 0 },
    walkCycleRad: 0,
    strideDistancePx: 0,
    stepTriggered: false,
    footSide: "left",
    breathPhaseRad: 0,
    breathOffsetPx: 0,
    blink: {
      phase: "open",
      phaseElapsedSec: 0,
      nextBlinkInSec: 3.1,
      eyelidOpenness: 1,
      blinkCount: 0,
      pendingDoubleBlink: false,
      rngState: options?.blinkSeed ?? 20260392,
    },
    gaze: {
      targetKind: "none",
      targetLabelKo: "정면 작업 중",
      gazeAngleRad: Math.PI / 2,
      gazeAngleDeg: 90,
      pupilOffsetX: 0,
      pupilOffsetY: 2.4,
      headTurnRatio: 0,
    },
    hairNodes: buildInitialSpringChain(hairAnchor, 3, cfg.hairSpring.segmentLengthPx),
    capeNodes: buildInitialSpringChain(capeAnchor, 4, cfg.capeSpring.segmentLengthPx),
    afterimageTrail: [],
    elapsedSec: 0,
  };
}

/** 60fps 기준 단일 프레임 2.5D 스프링 캐릭터 물리 스텝을 계산한다. */
export function stepLivingSpritePhysics(
  state: LivingSpriteState,
  input: SpriteControlInput,
  dtSec: number = FIXED_PHYSICS_DT_SEC,
  config: SpritePhysicsConfig = DEFAULT_SPRITE_PHYSICS_CONFIG,
): LivingSpriteState {
  const dt = clampScalar(dtSec, 0.001, MAX_PHYSICS_DT_SEC);
  const rawMag = Math.hypot(input.moveX, input.moveY);
  const hasInput = rawMag > 1e-4;
  const normInputX = hasInput ? input.moveX / Math.max(1, rawMag) : 0;
  const normInputY = hasInput ? input.moveY / Math.max(1, rawMag) : 0;
  const targetMaxSpeed = config.maxWalkSpeedPxPerSec * (input.sprinting ? config.sprintMultiplier : 1);

  let vx = state.velocity.x;
  let vy = state.velocity.y;
  const prevSpeed = Math.hypot(vx, vy);

  if (hasInput) {
    const desiredVx = normInputX * targetMaxSpeed;
    const desiredVy = normInputY * targetMaxSpeed;
    const dvx = desiredVx - vx;
    const dvy = desiredVy - vy;
    const dvMag = Math.hypot(dvx, dvy);
    const rate = vx * desiredVx + vy * desiredVy < 0 ? config.decelPxPerSec2 : config.accelPxPerSec2;
    const maxDelta = rate * dt;
    if (dvMag <= maxDelta || dvMag < 1e-5) {
      vx = desiredVx;
      vy = desiredVy;
    } else {
      vx += (dvx / dvMag) * maxDelta;
      vy += (dvy / dvMag) * maxDelta;
    }
  } else {
    const dampingFactor = Math.exp(-config.frictionPerSec * dt);
    vx *= dampingFactor;
    vy *= dampingFactor;
    const speedAfterDrag = Math.hypot(vx, vy);
    const linearDrop = config.decelPxPerSec2 * 0.25 * dt;
    if (speedAfterDrag <= STOP_SPEED_EPSILON || speedAfterDrag <= linearDrop) {
      vx = 0;
      vy = 0;
    } else {
      const nextRatio = (speedAfterDrag - linearDrop) / speedAfterDrag;
      vx *= nextRatio;
      vy *= nextRatio;
    }
  }

  const unclampedSpeed = Math.hypot(vx, vy);
  if (unclampedSpeed > targetMaxSpeed && unclampedSpeed > 1e-5) {
    const clampRatio = targetMaxSpeed / unclampedSpeed;
    vx *= clampRatio;
    vy *= clampRatio;
  }

  const ax = (vx - state.velocity.x) / dt;
  const ay = (vy - state.velocity.y) / dt;

  const unclampedX = state.position.x + vx * dt;
  const unclampedY = state.position.y + vy * dt;
  const nextX = clampScalar(unclampedX, config.bounds.minX, config.bounds.maxX);
  const nextY = clampScalar(unclampedY, config.bounds.minY, config.bounds.maxY);
  if (nextX !== unclampedX) vx = 0;
  if (nextY !== unclampedY) vy = 0;

  const actualSpeed = Math.hypot(vx, vy);
  const normalizedSpeed = actualSpeed / Math.max(1, config.maxWalkSpeedPxPerSec);

  const facingTarget: Vec2 = hasInput
    ? { x: normInputX, y: normInputY }
    : actualSpeed > STOP_SPEED_EPSILON
      ? { x: vx / actualSpeed, y: vy / actualSpeed }
      : { x: 0, y: 0 };
  const nextFacingVector = smoothDirectionVector(state.facingVector, facingTarget, dt, config.facingSmoothRate);
  const mappedOctant = mapVectorToOctant8(nextFacingVector.x, nextFacingVector.y);
  const flipX = Math.abs(nextFacingVector.x) > 0.15 ? nextFacingVector.x < 0 : state.flipX;

  const frameDist = actualSpeed * dt;
  const nextStrideDist = state.strideDistancePx + frameDist;
  const prevHalfStep = Math.floor(state.strideDistancePx / config.strideCyclePx);
  const nextHalfStep = Math.floor(nextStrideDist / config.strideCyclePx);
  const stepTriggered = actualSpeed > 12 && nextHalfStep > prevHalfStep;
  const footSide: "left" | "right" = nextHalfStep % 2 === 0 ? "left" : "right";
  const nextWalkCycleRad =
    actualSpeed > STOP_SPEED_EPSILON
      ? state.walkCycleRad + (frameDist / Math.max(1, config.strideCyclePx)) * Math.PI
      : state.walkCycleRad * Math.exp(-8 * dt);

  const nextElapsedSec = state.elapsedSec + dt;
  const nextBreathPhaseRad = nextElapsedSec * Math.PI * 2 * BREATH_HZ;
  const breathWave = Math.sin(nextBreathPhaseRad);
  const breathOffsetPx = Math.round(breathWave * 2.1 * Math.max(0.25, 1 - normalizedSpeed) * 100) / 100;

  const signedAccelImpulse = (actualSpeed - prevSpeed) / Math.max(1, config.accelPxPerSec2 * dt);
  const squashStretch = computeVolumePreservingSquashStretch({
    normalizedSpeed,
    signedAccelImpulse,
    walkCycleRad: nextWalkCycleRad,
    breathWave,
    vx,
    maxSpeed: config.maxWalkSpeedPxPerSec,
    maxSquashStretch: config.maxSquashStretch,
  });

  const hairAnchor: Vec2 = { x: nextX, y: nextY - 26 + breathOffsetPx };
  const capeAnchor: Vec2 = { x: nextX, y: nextY - 6 + breathOffsetPx * 0.5 };
  const nextHairNodes = stepSecondarySpringChain(state.hairNodes, hairAnchor, { x: vx, y: vy }, dt, config.hairSpring);
  const nextCapeNodes = stepSecondarySpringChain(state.capeNodes, capeAnchor, { x: vx, y: vy }, dt, config.capeSpring);

  const nextTrail: readonly TrailGhostPoint[] =
    normalizedSpeed >= 0.45
      ? [
          { x: Math.round(nextX * 10) / 10, y: Math.round(nextY * 10) / 10, speedRatio: Math.min(1, normalizedSpeed), opacity: 0.42 },
          ...state.afterimageTrail,
        ]
          .slice(0, MAX_TRAIL_POINTS)
          .map((pt, idx) => ({ ...pt, opacity: Math.round(Math.max(0.06, (1 - idx / MAX_TRAIL_POINTS) * 0.38) * 100) / 100 }))
      : state.afterimageTrail
          .map((pt) => ({ ...pt, opacity: Math.round((pt.opacity - dt * 1.8) * 100) / 100 }))
          .filter((pt) => pt.opacity > 0.04);

  const nextBlink = stepEyeBlinkState(state.blink, dt);
  const nextGaze = stepGazeTracking({
    currentGaze: state.gaze,
    eyeOrigin: { x: nextX, y: nextY - 22 + breathOffsetPx },
    facingVector: nextFacingVector,
    pointerTarget: input.pointerTarget,
    peerTargets: input.peerTargets,
    dtSec: dt,
    smoothRate: config.gazeSmoothRate,
  });

  return {
    position: { x: nextX, y: nextY },
    velocity: { x: vx, y: vy },
    acceleration: { x: ax, y: ay },
    speedPxPerSec: actualSpeed,
    normalizedSpeed,
    facingVector: nextFacingVector,
    facingOctant: mappedOctant.octant,
    facingOctantIndex: mappedOctant.index,
    flipX,
    squashStretch,
    walkCycleRad: nextWalkCycleRad,
    strideDistancePx: nextStrideDist,
    stepTriggered,
    footSide,
    breathPhaseRad: nextBreathPhaseRad,
    breathOffsetPx,
    blink: nextBlink,
    gaze: nextGaze,
    hairNodes: nextHairNodes,
    capeNodes: nextCapeNodes,
    afterimageTrail: nextTrail,
    elapsedSec: nextElapsedSec,
  };
}

/** 지정 프레임 수만큼 60fps 물리 시뮬레이션을 연속 실행한다. */
export function simulateLivingSpriteFrames(
  initialState: LivingSpriteState,
  input: SpriteControlInput,
  frameCount: number,
  dtSec: number = FIXED_PHYSICS_DT_SEC,
  config: SpritePhysicsConfig = DEFAULT_SPRITE_PHYSICS_CONFIG,
): LivingSpriteState {
  const safeFrames = Math.max(0, Math.min(600, Math.floor(frameCount)));
  let current = initialState;
  for (let i = 0; i < safeFrames; i += 1) {
    current = stepLivingSpritePhysics(current, input, dtSec, config);
  }
  return current;
}
