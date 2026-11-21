/**
 * Cascadeur 클린룸 — 다중 프레임 AutoPhysics 무게중심(CoM)·지지점(Fulcrum)·탄도 궤적 솔버,
 * 비파괴 Ghost 리그 스냅 및 Tween/Interval 구간 편집기.
 *
 * - Dempster/Winter 인체 분절 질량 비율 기반 전체 무게중심(CoM) 산출
 * - 접지 발 지지점(Fulcrum) 기준 수평 균형 오차 평가 및 지면 지지 보정
 * - 공중 도약 구간 자동 감지 + 중력 가속도(`g = 9.80665 m/s^2`) 탄도 포물선 궤적 생성
 * - 원본 포즈를 덮어쓰지 않는 반투명 Ghost 리그 제안 + 사용자 선택 강도(`0..1`) 원클릭 스냅
 * - Interval Edit Mode 구간 일괄 델타 적용 및 키프레임 간 Tween 보간기
 */

export type Vec3Tuple = readonly [number, number, number];

export interface AutoPhysicsPoseKeyFrame {
  readonly frameIndex: number;
  readonly timeSec: number;
  readonly pelvisWorldM: Vec3Tuple;
  readonly chestWorldM: Vec3Tuple;
  readonly headWorldM: Vec3Tuple;
  readonly leftHandWorldM: Vec3Tuple;
  readonly rightHandWorldM: Vec3Tuple;
  readonly leftFootWorldM: Vec3Tuple;
  readonly rightFootWorldM: Vec3Tuple;
  readonly leftFootGrounded: boolean;
  readonly rightFootGrounded: boolean;
}

export interface AutoPhysicsGhostFrame {
  readonly frameIndex: number;
  readonly timeSec: number;
  readonly rawCoM: Vec3Tuple;
  readonly ghostCoM: Vec3Tuple;
  readonly ghostPelvisWorldM: Vec3Tuple;
  readonly pelvisCorrectionDeltaM: Vec3Tuple;
  readonly fulcrumPointM: Vec3Tuple | null;
  readonly isAirborne: boolean;
  /** 균형 수평 오차(지면 구간) 또는 포물선 편차(공중 구간), m 단위. */
  readonly physicalResidualM: number;
}

export interface AutoPhysicsSolverConfig {
  readonly gravityMps2: number;
  /** 지면 지지 구간에서 CoM을 지지점 쪽으로 끌어당기는 보정 비율 (`0..1`). */
  readonly groundedBalanceWeight: number;
  /** 공중 구간에서 순수 탄도 포물선으로 끌어당기는 비율 (`0..1`). */
  readonly ballisticWeight: number;
  /** 양발 지지 구간에서 허용하는 수평 CoM 여유 반경(m). */
  readonly supportFootRadiusM: number;
}

export interface IntervalEditState {
  readonly active: boolean;
  readonly startFrame: number;
  readonly endFrame: number;
  /** 모드 혼동 방지용 2px 캔버스 외곽선 시맨틱 토큰. */
  readonly borderAccentToken: "status-interval-edit";
  /** 구간 경계에서 자연스럽게 감쇠할 블렌드 프레임 수. */
  readonly edgeFalloffFrames: number;
}

export type TweenEasingMode = "linear" | "ease-in-out" | "ballistic-arc";

export const DEFAULT_AUTOPHYSICS_CONFIG: AutoPhysicsSolverConfig = Object.freeze({
  gravityMps2: 9.80665,
  groundedBalanceWeight: 0.72,
  ballisticWeight: 1.0,
  supportFootRadiusM: 0.14,
});

// Dempster/Winter 생체역학 분절 질량 가중치 (합계 = 1.0)
const SEGMENT_MASS_WEIGHTS = Object.freeze({
  pelvis: 0.24,
  chest: 0.34,
  head: 0.08,
  leftHand: 0.05,
  rightHand: 0.05,
  leftFoot: 0.12,
  rightFoot: 0.12,
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function lerp3(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function add3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** 인체 분절 질량 가중치로 단일 프레임의 3D 무게중심(CoM)을 계산한다. */
export function computeHumanoidCenterOfMass(frame: AutoPhysicsPoseKeyFrame): Vec3Tuple {
  const w = SEGMENT_MASS_WEIGHTS;
  return [
    frame.pelvisWorldM[0] * w.pelvis
      + frame.chestWorldM[0] * w.chest
      + frame.headWorldM[0] * w.head
      + frame.leftHandWorldM[0] * w.leftHand
      + frame.rightHandWorldM[0] * w.rightHand
      + frame.leftFootWorldM[0] * w.leftFoot
      + frame.rightFootWorldM[0] * w.rightFoot,
    frame.pelvisWorldM[1] * w.pelvis
      + frame.chestWorldM[1] * w.chest
      + frame.headWorldM[1] * w.head
      + frame.leftHandWorldM[1] * w.leftHand
      + frame.rightHandWorldM[1] * w.rightHand
      + frame.leftFootWorldM[1] * w.leftFoot
      + frame.rightFootWorldM[1] * w.rightFoot,
    frame.pelvisWorldM[2] * w.pelvis
      + frame.chestWorldM[2] * w.chest
      + frame.headWorldM[2] * w.head
      + frame.leftHandWorldM[2] * w.leftHand
      + frame.rightHandWorldM[2] * w.rightHand
      + frame.leftFootWorldM[2] * w.leftFoot
      + frame.rightFootWorldM[2] * w.rightFoot,
  ];
}

/** 현재 프레임의 지면 지지점(Fulcrum)을 반환한다. 공중이면 `null`. */
export function computeSupportFulcrum(frame: AutoPhysicsPoseKeyFrame): Vec3Tuple | null {
  if (frame.leftFootGrounded && frame.rightFootGrounded) {
    return [
      (frame.leftFootWorldM[0] + frame.rightFootWorldM[0]) * 0.5,
      Math.min(frame.leftFootWorldM[1], frame.rightFootWorldM[1]),
      (frame.leftFootWorldM[2] + frame.rightFootWorldM[2]) * 0.5,
    ];
  }
  if (frame.leftFootGrounded) return frame.leftFootWorldM;
  if (frame.rightFootGrounded) return frame.rightFootWorldM;
  return null;
}

/**
 * 다중 프레임 시퀀스에 대해 지면 균형(Fulcrum)과 공중 탄도 포물선(Ballistic Arc)을 동시에 풀어
 * 비파괴 Ghost 리그 프레임을 생성한다.
 */
export function solveAutoPhysicsTrajectory(
  frames: readonly AutoPhysicsPoseKeyFrame[],
  config: AutoPhysicsSolverConfig = DEFAULT_AUTOPHYSICS_CONFIG,
): AutoPhysicsGhostFrame[] {
  const n = frames.length;
  if (n === 0) return [];

  const rawCoMs = frames.map(computeHumanoidCenterOfMass);
  const fulcrums = frames.map(computeSupportFulcrum);
  const ghostCoMs: Vec3Tuple[] = rawCoMs.map((c) => [c[0], c[1], c[2]]);

  // 1) 지면 지지 구간: 지지점 반경 밖으로 크게 벗어난 수평 CoM을 균형권 안으로 유도
  const balanceW = clamp(config.groundedBalanceWeight, 0, 1);
  const radius = Math.max(0.02, config.supportFootRadiusM);
  for (let i = 0; i < n; i += 1) {
    const fulcrum = fulcrums[i];
    if (!fulcrum) continue;
    const dx = rawCoMs[i][0] - fulcrum[0];
    const dz = rawCoMs[i][2] - fulcrum[2];
    const dist = Math.hypot(dx, dz);
    if (dist > radius) {
      const excess = dist - radius;
      const pull = (excess * balanceW) / dist;
      ghostCoMs[i] = [
        rawCoMs[i][0] - dx * pull,
        rawCoMs[i][1],
        rawCoMs[i][2] - dz * pull,
      ];
    }
  }

  // 2) 연속 공중(Airborne) 구간 감지 -> 시작/끝 지면 프레임 사이 정확한 중력 탄도 포물선 적합
  const g = Math.max(0.1, config.gravityMps2);
  const ballisticW = clamp(config.ballisticWeight, 0, 1);
  let i = 0;
  while (i < n) {
    if (fulcrums[i] !== null) {
      i += 1;
      continue;
    }
    const airStart = i;
    while (i < n && fulcrums[i] === null) {
      i += 1;
    }
    const airEnd = i - 1;
    const takeoffIdx = Math.max(0, airStart - 1);
    const landingIdx = Math.min(n - 1, airEnd + 1);
    const t0 = frames[takeoffIdx].timeSec;
    const t1 = frames[landingIdx].timeSec;
    const totalT = t1 - t0;
    if (totalT <= 1e-4) continue;

    const p0 = ghostCoMs[takeoffIdx];
    const p1 = ghostCoMs[landingIdx];
    const vx = (p1[0] - p0[0]) / totalT;
    const vz = (p1[2] - p0[2]) / totalT;
    // y(T) = y0 + vy0*T - 0.5*g*T^2 => vy0 = (y1 - y0)/T + 0.5*g*T
    const vy0 = (p1[1] - p0[1]) / totalT + 0.5 * g * totalT;

    for (let k = airStart; k <= airEnd; k += 1) {
      const dt = frames[k].timeSec - t0;
      const ballisticPoint: Vec3Tuple = [
        p0[0] + vx * dt,
        p0[1] + vy0 * dt - 0.5 * g * dt * dt,
        p0[2] + vz * dt,
      ];
      ghostCoMs[k] = lerp3(rawCoMs[k], ballisticPoint, ballisticW);
    }
  }

  return frames.map((frame, idx) => {
    const raw = rawCoMs[idx];
    const ghost = ghostCoMs[idx];
    const delta: Vec3Tuple = [ghost[0] - raw[0], ghost[1] - raw[1], ghost[2] - raw[2]];
    const residual = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1] + delta[2] * delta[2]);
    return {
      frameIndex: frame.frameIndex,
      timeSec: frame.timeSec,
      rawCoM: raw,
      ghostCoM: ghost,
      ghostPelvisWorldM: add3(frame.pelvisWorldM, delta),
      pelvisCorrectionDeltaM: delta,
      fulcrumPointM: fulcrums[idx],
      isAirborne: fulcrums[idx] === null,
      physicalResidualM: residual,
    };
  });
}

/** 비파괴 Ghost 리그 스냅: 사용자가 선택한 수용 강도(`blendRatio 0..1`)만큼 전체 신체에 평행 보정을 적용한다. */
export function snapPoseFramesToGhost(
  frames: readonly AutoPhysicsPoseKeyFrame[],
  ghostFrames: readonly AutoPhysicsGhostFrame[],
  blendRatio = 1,
): AutoPhysicsPoseKeyFrame[] {
  const ratio = clamp(blendRatio, 0, 1);
  return frames.map((frame, idx) => {
    const ghost = ghostFrames[idx];
    if (!ghost) return frame;
    const d: Vec3Tuple = [
      ghost.pelvisCorrectionDeltaM[0] * ratio,
      ghost.pelvisCorrectionDeltaM[1] * ratio,
      ghost.pelvisCorrectionDeltaM[2] * ratio,
    ];
    return {
      ...frame,
      pelvisWorldM: add3(frame.pelvisWorldM, d),
      chestWorldM: add3(frame.chestWorldM, d),
      headWorldM: add3(frame.headWorldM, d),
      leftHandWorldM: add3(frame.leftHandWorldM, d),
      rightHandWorldM: add3(frame.rightHandWorldM, d),
      leftFootWorldM: frame.leftFootGrounded ? frame.leftFootWorldM : add3(frame.leftFootWorldM, d),
      rightFootWorldM: frame.rightFootGrounded ? frame.rightFootWorldM : add3(frame.rightFootWorldM, d),
    };
  });
}

/** Cascadeur Interval Edit Mode: 선택 구간에 부드러운 경계 감쇠로 상체/골반 델타를 일괄 적용한다. */
export function applyIntervalEditPelvisDelta(
  frames: readonly AutoPhysicsPoseKeyFrame[],
  interval: IntervalEditState,
  pelvisDeltaM: Vec3Tuple,
): AutoPhysicsPoseKeyFrame[] {
  if (!interval.active) return [...frames];
  const minF = Math.min(interval.startFrame, interval.endFrame);
  const maxF = Math.max(interval.startFrame, interval.endFrame);
  const falloff = Math.max(0, Math.floor(interval.edgeFalloffFrames));

  return frames.map((frame) => {
    let weight = 0;
    if (frame.frameIndex >= minF && frame.frameIndex <= maxF) {
      weight = 1;
    } else if (falloff > 0) {
      const dist = frame.frameIndex < minF ? minF - frame.frameIndex : frame.frameIndex - maxF;
      if (dist <= falloff) {
        const u = 1 - dist / (falloff + 1);
        weight = u * u * (3 - 2 * u);
      }
    }
    if (weight <= 0) return frame;
    const d: Vec3Tuple = [
      pelvisDeltaM[0] * weight,
      pelvisDeltaM[1] * weight,
      pelvisDeltaM[2] * weight,
    ];
    return {
      ...frame,
      pelvisWorldM: add3(frame.pelvisWorldM, d),
      chestWorldM: add3(frame.chestWorldM, d),
      headWorldM: add3(frame.headWorldM, d),
    };
  });
}

/** 두 키프레임 사이 임의 비율 `t in [0, 1]`의 Tween 중간 포즈를 생성한다. */
export function generateTweenPoseFrame(
  startFrame: AutoPhysicsPoseKeyFrame,
  endFrame: AutoPhysicsPoseKeyFrame,
  t: number,
  easing: TweenEasingMode = "ease-in-out",
  gravityMps2 = DEFAULT_AUTOPHYSICS_CONFIG.gravityMps2,
): AutoPhysicsPoseKeyFrame {
  const ct = clamp(t, 0, 1);
  const eased = easing === "ease-in-out"
    ? ct * ct * (3 - 2 * ct)
    : ct;

  const totalDt = Math.max(0, endFrame.timeSec - startFrame.timeSec);
  const arcLiftY = easing === "ballistic-arc"
    ? 0.5 * gravityMps2 * totalDt * totalDt * ct * (1 - ct)
    : 0;

  const lift = (p: Vec3Tuple): Vec3Tuple => [p[0], p[1] + arcLiftY, p[2]];
  return {
    frameIndex: Math.round(startFrame.frameIndex + (endFrame.frameIndex - startFrame.frameIndex) * ct),
    timeSec: startFrame.timeSec + totalDt * ct,
    pelvisWorldM: lift(lerp3(startFrame.pelvisWorldM, endFrame.pelvisWorldM, eased)),
    chestWorldM: lift(lerp3(startFrame.chestWorldM, endFrame.chestWorldM, eased)),
    headWorldM: lift(lerp3(startFrame.headWorldM, endFrame.headWorldM, eased)),
    leftHandWorldM: lift(lerp3(startFrame.leftHandWorldM, endFrame.leftHandWorldM, eased)),
    rightHandWorldM: lift(lerp3(startFrame.rightHandWorldM, endFrame.rightHandWorldM, eased)),
    leftFootWorldM: lift(lerp3(startFrame.leftFootWorldM, endFrame.leftFootWorldM, eased)),
    rightFootWorldM: lift(lerp3(startFrame.rightFootWorldM, endFrame.rightFootWorldM, eased)),
    leftFootGrounded: ct < 0.5 ? startFrame.leftFootGrounded : endFrame.leftFootGrounded,
    rightFootGrounded: ct < 0.5 ? startFrame.rightFootGrounded : endFrame.rightFootGrounded,
  };
}
