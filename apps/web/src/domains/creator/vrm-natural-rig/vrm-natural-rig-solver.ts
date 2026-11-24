/**
 * Wave 33 Track B — VRM 캐릭터 자연 리깅 4대 솔버 엔진.
 *
 * ① 쇄골-견갑골 자동 연동 분산(Clavicle-Scapula Auto-Share, Scapulohumeral Rhythm)
 * ② 듀얼 쿼터니언/트위스트 분산 전완·어깨 핀치 방지(Candy-Wrapper Guard)
 * ③ 포즈 의도 연동 자연 시선(Eye Gaze Intent) & 10손가락 자연 그립 자동 커브
 * ④ 두상/헤어 볼륨 기반 소품 표면 밀착(Surface-Seat) & 헤어-어깨 캡슐 충돌 반발 솔버
 */

import * as THREE from "three";

import {
  EXTRA_POSE_PRESETS,
  NATURAL_IDLE_POSES,
  type PoseDirectionTarget,
  type PoseGazeIntent,
  type StudioPosePreset,
} from "../studio-pose-presets";
import { clampStudioVrmJointRotation } from "../vrm/studio-vrm-joint-limits";
import {
  createDefaultHairStrands,
  solveHairShoulderCapsuleRepulsion,
  solveHeadPropSurfaceSeat,
  type BodyRepulsionCapsule,
  type HairShoulderRepulsionInput,
  type HairShoulderRepulsionResult,
  type HairStrandChain,
  type HeadPropSurfaceSeatInput,
  type HeadPropSurfaceSeatResult,
  type NaturalRigHeadPropId,
} from "./vrm-natural-rig-surface-collision";

import type { VRMHumanBoneName } from "@pixiv/three-vrm";

export {
  createDefaultHairStrands,
  solveHairShoulderCapsuleRepulsion,
  solveHeadPropSurfaceSeat,
  type BodyRepulsionCapsule,
  type HairShoulderRepulsionInput,
  type HairShoulderRepulsionResult,
  type HairStrandChain,
  type HeadPropSurfaceSeatInput,
  type HeadPropSurfaceSeatResult,
  type NaturalRigHeadPropId,
};

export type NaturalRigVec3 = readonly [number, number, number];
export type NaturalRigQuat4 = readonly [number, number, number, number];
export type NaturalRigSide = "left" | "right";
export type NaturalRigPosePresetId = "xp_wave_greeting" | "xp_phone_look" | "ni_weight_left" | "xp_banzai";
export type NaturalRigGazeOverride = "auto" | "camera" | "hands" | "forward";
export type NaturalRigHandGestureKind =
  | "relaxed-idle"
  | "open-wave"
  | "phone-cradle"
  | "cylinder-grip"
  | "pinch-grip"
  | "flat-support";

export interface NaturalRigDualQuat {
  readonly real: NaturalRigQuat4;
  readonly dual: NaturalRigQuat4;
}

export interface NaturalRigAxisWeights {
  readonly poseNatural: number;
  readonly propSeat: number;
  readonly hairCollision: number;
}

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const DIP_PIP_RATIO = 0.67;
const FINGER_NAMES = ["Index", "Middle", "Ring", "Little"] as const;

const clamp = (value: number, min: number, max: number): number =>
  (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min);
const clamp01 = (value: number): number => clamp(value, 0, 1);
const finite = (value: unknown, fallback: number): number =>
  (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function vec3Length(v: NaturalRigVec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalizeVec3(v: NaturalRigVec3, fallback: NaturalRigVec3): NaturalRigVec3 {
  const len = vec3Length(v);
  if (!Number.isFinite(len) || len <= 1e-8) return fallback;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function directionToWorldVec(direction: PoseDirectionTarget | undefined, side: NaturalRigSide): NaturalRigVec3 {
  if (!direction) return [side === "left" ? 0.28 : -0.28, -0.95, 0.04];
  if ("sideX" in direction) {
    const sign = side === "left" ? 1 : -1;
    return normalizeVec3([sign * direction.sideX, direction.y, direction.z ?? 0], [sign * 0.28, -0.95, 0.04]);
  }
  return normalizeVec3(direction, [side === "left" ? 0.28 : -0.28, -0.95, 0.04]);
}

/* ── ① 쇄골-견갑골 자동 연동 분산 (Clavicle-Scapula Auto-Share) ────────── */

export interface ClavicleScapulaInput {
  readonly side: NaturalRigSide;
  readonly upperArmDirection: NaturalRigVec3;
  readonly existingShoulderRotationRad?: NaturalRigVec3;
  readonly strength?: number;
}

export interface ClavicleContrappostoHint {
  readonly hipsRollDeg: number;
  readonly spineCounterRollDeg: number;
  readonly chestYawDeg: number;
}

export interface ClavicleScapulaShareResult {
  readonly side: NaturalRigSide;
  readonly armElevationDeg: number;
  readonly armHorizontalForwardDeg: number;
  readonly shoulderElevationDeg: number;
  readonly clavicleProtractionDeg: number;
  readonly scapulohumeralRatio: number;
  readonly shoulderRotationRad: NaturalRigVec3;
  readonly compensatedUpperArmElevationDeg: number;
  readonly pinchRiskBefore: number;
  readonly pinchRiskAfter: number;
  readonly contrappostoHint: ClavicleContrappostoHint;
}

/** 상완 거상·전방 도달 각도에 따라 견갑상완 리듬(약 2:1)으로 쇄골 상승·전인 및 체중 이동을 분산한다. */
export function solveClavicleScapulaShare(input: ClavicleScapulaInput): ClavicleScapulaShareResult {
  const strength = clamp01(finite(input.strength, 0.9));
  const dir = normalizeVec3(input.upperArmDirection, [input.side === "left" ? 0.28 : -0.28, -0.95, 0.04]);
  const sideSign = input.side === "left" ? 1 : -1;

  // 자연 하수(0,-1,0) 기준 0° ~ 머리 위 수직 180°.
  const armElevationDeg = clamp(Math.acos(clamp(-dir[1], -1, 1)) * RAD, 0, 180);
  const armHorizontalForwardDeg = clamp(Math.atan2(dir[2], Math.max(0.12, Math.abs(dir[0]))) * RAD, -75, 85);

  // Codman/Inman 견갑상완 리듬: 초기 28° 세팅 구간 이후 쇄골·견갑골이 거상의 약 1/3을 분담한다.
  const activeElevation = Math.max(0, armElevationDeg - 28);
  const targetLiftDeg = armElevationDeg <= 28
    ? -3 * (1 - armElevationDeg / 28)
    : clamp(smoothstep(28, 168, armElevationDeg) * 22, 0, 22);
  const shoulderElevationDeg = targetLiftDeg * strength;

  const forwardFactor = smoothstep(8, 70, armHorizontalForwardDeg);
  const backwardFactor = smoothstep(-8, -65, armHorizontalForwardDeg);
  const clavicleProtractionDeg = (forwardFactor * 10.5 - backwardFactor * 8.5) * strength;

  const baseRot = input.existingShoulderRotationRad ?? [0, 0, 0];
  // VRM 정규화 본 규약: 왼쪽 상승 = +Z, 전인 = -Y / 오른쪽 상승 = -Z, 전인 = +Y.
  const targetZ = sideSign * shoulderElevationDeg * DEG;
  const targetY = -sideSign * clavicleProtractionDeg * DEG;
  const blendedRot: NaturalRigVec3 = [
    finite(baseRot[0], 0) * (1 - strength * 0.5),
    finite(baseRot[1], 0) * (1 - strength) + targetY,
    finite(baseRot[2], 0) * (1 - strength) + targetZ,
  ];
  const boneName: VRMHumanBoneName = input.side === "left" ? "leftShoulder" : "rightShoulder";
  const clamped = clampStudioVrmJointRotation(boneName, blendedRot);

  const appliedLiftDeg = Math.max(0, sideSign * clamped[2] * RAD);
  const compensatedUpperArmElevationDeg = Math.max(0, armElevationDeg - appliedLiftDeg);
  const scapulohumeralRatio = activeElevation > 1 && appliedLiftDeg > 0.2
    ? Number(((armElevationDeg - appliedLiftDeg) / appliedLiftDeg).toFixed(2))
    : 0;

  // 쇄골 고정 시 75° 이상 팔을 들 때 삼각근/겨드랑이 핀치 위험 급증.
  const pinchRiskBefore = clamp01(smoothstep(62, 145, armElevationDeg));
  const pinchRiskAfter = clamp01(pinchRiskBefore * (1 - clamp01(appliedLiftDeg / 16) * 0.84));

  const asymFactor = smoothstep(55, 135, armElevationDeg) * strength;
  const contrappostoHint: ClavicleContrappostoHint = Object.freeze({
    hipsRollDeg: Number((-sideSign * asymFactor * 2.6).toFixed(2)),
    spineCounterRollDeg: Number((sideSign * asymFactor * 2.1).toFixed(2)),
    chestYawDeg: Number((-sideSign * asymFactor * 2.4).toFixed(2)),
  });

  return Object.freeze({
    side: input.side,
    armElevationDeg: Number(armElevationDeg.toFixed(2)),
    armHorizontalForwardDeg: Number(armHorizontalForwardDeg.toFixed(2)),
    shoulderElevationDeg: Number((sideSign * clamped[2] * RAD).toFixed(2)),
    clavicleProtractionDeg: Number((-sideSign * clamped[1] * RAD).toFixed(2)),
    scapulohumeralRatio,
    shoulderRotationRad: Object.freeze([clamped[0], clamped[1], clamped[2]] as const),
    compensatedUpperArmElevationDeg: Number(compensatedUpperArmElevationDeg.toFixed(2)),
    pinchRiskBefore: Number(pinchRiskBefore.toFixed(3)),
    pinchRiskAfter: Number(pinchRiskAfter.toFixed(3)),
    contrappostoHint,
  });
}

/* ── ② 듀얼 쿼터니언 / 트위스트 분산 전완·어깨 핀치 방지 (Candy-Wrapper Guard) ── */

export interface SwingTwistDecomposition {
  readonly swing: NaturalRigQuat4;
  readonly twist: NaturalRigQuat4;
  readonly twistAngleDeg: number;
}

/** 쿼터니언을 지정된 뼈 종축 기준 Swing × Twist로 엄밀 분해한다(swing * twist === q). */
export function decomposeSwingTwist(
  quaternion: NaturalRigQuat4,
  twistAxis: NaturalRigVec3,
): SwingTwistDecomposition {
  const q = new THREE.Quaternion(
    finite(quaternion[0], 0),
    finite(quaternion[1], 0),
    finite(quaternion[2], 0),
    finite(quaternion[3], 1),
  );
  if (q.lengthSq() <= 1e-12) q.identity();
  else q.normalize();

  const axis = normalizeVec3(twistAxis, [1, 0, 0]);
  const proj = q.x * axis[0] + q.y * axis[1] + q.z * axis[2];
  const twistQ = new THREE.Quaternion(axis[0] * proj, axis[1] * proj, axis[2] * proj, q.w);
  if (twistQ.lengthSq() <= 1e-12) twistQ.identity();
  else twistQ.normalize();
  if (twistQ.w < 0) twistQ.set(-twistQ.x, -twistQ.y, -twistQ.z, -twistQ.w);

  const swingQ = q.clone().multiply(twistQ.clone().invert()).normalize();
  const sinHalf = Math.hypot(twistQ.x, twistQ.y, twistQ.z);
  const sign = (twistQ.x * axis[0] + twistQ.y * axis[1] + twistQ.z * axis[2]) >= 0 ? 1 : -1;
  const twistAngleDeg = sign * 2 * Math.atan2(sinHalf, twistQ.w) * RAD;

  return Object.freeze({
    swing: Object.freeze([swingQ.x, swingQ.y, swingQ.z, swingQ.w] as const),
    twist: Object.freeze([twistQ.x, twistQ.y, twistQ.z, twistQ.w] as const),
    twistAngleDeg: Number(twistAngleDeg.toFixed(3)),
  });
}

/** 회전 쿼터니언과 평행이동 벡터로부터 단위 듀얼 쿼터니언(q_r, q_d = 0.5 * t * q_r)을 생성한다. */
export function createDualQuaternion(rotation: NaturalRigQuat4, translation: NaturalRigVec3): NaturalRigDualQuat {
  const qr = new THREE.Quaternion(
    finite(rotation[0], 0),
    finite(rotation[1], 0),
    finite(rotation[2], 0),
    finite(rotation[3], 1),
  );
  if (qr.lengthSq() <= 1e-12) qr.identity();
  else qr.normalize();
  const tx = finite(translation[0], 0);
  const ty = finite(translation[1], 0);
  const tz = finite(translation[2], 0);

  // q_d = 0.5 * (tx, ty, tz, 0) * q_r
  const dx = 0.5 * (tx * qr.w + ty * qr.z - tz * qr.y);
  const dy = 0.5 * (-tx * qr.z + ty * qr.w + tz * qr.x);
  const dz = 0.5 * (tx * qr.y - ty * qr.x + tz * qr.w);
  const dw = 0.5 * (-tx * qr.x - ty * qr.y - tz * qr.z);
  return Object.freeze({
    real: Object.freeze([qr.x, qr.y, qr.z, qr.w] as const),
    dual: Object.freeze([dx, dy, dz, dw] as const),
  });
}

/** LBS(선형 블렌드) 대비 듀얼 쿼터니언 선형 블렌딩(DLB)의 관절 단면 반경 보존율을 계산한다. */
export function blendDualQuaternionVolumeRatio(twistDeg: number, blendWeight = 0.5): {
  readonly lbsRadiusRatio: number;
  readonly dqRadiusRatio: number;
  readonly lbsPinchCollapsePct: number;
  readonly dqVolumeRetentionPct: number;
} {
  const halfAngle = Math.abs(finite(twistDeg, 0)) * DEG * 0.5;
  const w = clamp01(finite(blendWeight, 0.5));
  // LBS 단면 반경: |(1-w) + w * exp(i * twist)| = sqrt((1-w)^2 + w^2 + 2w(1-w)cos(twist))
  const cosTwist = Math.cos(halfAngle * 2);
  const lbsRadiusRatio = Math.sqrt(Math.max(0, (1 - w) * (1 - w) + w * w + 2 * w * (1 - w) * cosTwist));

  // 실제 듀얼 쿼터니언 보간(DLB): 항등 DQ와 순수 회전 DQ를 블렌딩 후 정규화해 단면 반경을 실측한다.
  const dqA = createDualQuaternion([0, 0, 0, 1], [0, 0, 0]);
  const qB = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), finite(twistDeg, 0) * DEG);
  const dqB = createDualQuaternion([qB.x, qB.y, qB.z, qB.w], [0, 0, 0]);
  const sign = (dqA.real[0] * dqB.real[0] + dqA.real[1] * dqB.real[1] + dqA.real[2] * dqB.real[2] + dqA.real[3] * dqB.real[3]) < 0 ? -1 : 1;
  const rx = (1 - w) * dqA.real[0] + w * sign * dqB.real[0];
  const ry = (1 - w) * dqA.real[1] + w * sign * dqB.real[1];
  const rz = (1 - w) * dqA.real[2] + w * sign * dqB.real[2];
  const rw = (1 - w) * dqA.real[3] + w * sign * dqB.real[3];
  const norm = Math.hypot(rx, ry, rz, rw);
  const blendedQ = norm > 1e-8 ? new THREE.Quaternion(rx / norm, ry / norm, rz / norm, rw / norm) : new THREE.Quaternion();
  const radialProbe = new THREE.Vector3(0, 1, 0).applyQuaternion(blendedQ);
  const dqRadiusRatio = Math.hypot(radialProbe.y, radialProbe.z);

  return Object.freeze({
    lbsRadiusRatio: Number(lbsRadiusRatio.toFixed(4)),
    dqRadiusRatio: Number(dqRadiusRatio.toFixed(4)),
    lbsPinchCollapsePct: Number(((1 - lbsRadiusRatio) * 100).toFixed(2)),
    dqVolumeRetentionPct: Number((dqRadiusRatio * 100).toFixed(2)),
  });
}

export interface CandyWrapperGuardInput {
  readonly side: NaturalRigSide;
  readonly wristTwistDeg: number;
  readonly upperArmAxialTwistDeg?: number;
  readonly strength?: number;
}

export interface CandyWrapperGuardResult {
  readonly side: NaturalRigSide;
  readonly forearmChainDeg: Readonly<{ readonly lowerArm: number; readonly midForearm: number; readonly wristResidual: number }>;
  readonly upperArmChainDeg: Readonly<{ readonly clavicleShare: number; readonly upperArm: number; readonly deltoidRoll: number }>;
  readonly maxSegmentTwistDeg: number;
  readonly lbsPinchBeforePct: number;
  readonly lbsPinchAfterPct: number;
  readonly dqVolumeRetentionPct: number;
  readonly candyWrapperSafe: boolean;
}

/** 전완·상완의 축 회전을 3구간 트위스트 체인 + 듀얼 쿼터니언 보전으로 분산해 캔디래퍼 핀치를 차단한다. */
export function solveCandyWrapperGuard(input: CandyWrapperGuardInput): CandyWrapperGuardResult {
  const strength = clamp01(finite(input.strength, 0.9));
  const rawWristTwist = clamp(finite(input.wristTwistDeg, 0), -165, 165);
  const rawUpperTwist = clamp(finite(input.upperArmAxialTwistDeg, 0), -135, 135);

  const beforeMetric = blendDualQuaternionVolumeRatio(Math.max(Math.abs(rawWristTwist), Math.abs(rawUpperTwist)), 0.5);

  // strength = 1이면 55/30/15(전완) 및 15/55/30(상완) 분산, 0이면 단일 관절 집중.
  const lowerArm = rawWristTwist * (0.55 * strength);
  const midForearm = rawWristTwist * (0.30 * strength);
  const wristResidual = rawWristTwist - lowerArm - midForearm;

  const clavicleShare = rawUpperTwist * (0.15 * strength);
  const deltoidRoll = rawUpperTwist * (0.30 * strength);
  const upperArm = rawUpperTwist - clavicleShare - deltoidRoll;

  const maxSegmentTwistDeg = Math.max(
    Math.abs(lowerArm),
    Math.abs(midForearm),
    Math.abs(wristResidual),
    Math.abs(clavicleShare),
    Math.abs(upperArm),
    Math.abs(deltoidRoll),
  );
  const afterMetric = blendDualQuaternionVolumeRatio(maxSegmentTwistDeg, 0.5);

  return Object.freeze({
    side: input.side,
    forearmChainDeg: Object.freeze({
      lowerArm: Number(lowerArm.toFixed(2)),
      midForearm: Number(midForearm.toFixed(2)),
      wristResidual: Number(wristResidual.toFixed(2)),
    }),
    upperArmChainDeg: Object.freeze({
      clavicleShare: Number(clavicleShare.toFixed(2)),
      upperArm: Number(upperArm.toFixed(2)),
      deltoidRoll: Number(deltoidRoll.toFixed(2)),
    }),
    maxSegmentTwistDeg: Number(maxSegmentTwistDeg.toFixed(2)),
    lbsPinchBeforePct: beforeMetric.lbsPinchCollapsePct,
    lbsPinchAfterPct: afterMetric.lbsPinchCollapsePct,
    dqVolumeRetentionPct: afterMetric.dqVolumeRetentionPct,
    candyWrapperSafe: maxSegmentTwistDeg <= 56 && afterMetric.lbsPinchCollapsePct <= 14,
  });
}

/* ── ③ 포즈 의도 연동 자연 시선 (Eye Gaze Intent) & 10손가락 자연 그립 자동 커브 ── */

export interface EyeGazeIntentInput {
  readonly headRotationRad: NaturalRigVec3;
  readonly neckRotationRad?: NaturalRigVec3;
  readonly intent?: PoseGazeIntent;
  readonly gazeOverride?: NaturalRigGazeOverride;
  readonly strength?: number;
}

export interface EyeGazeIntentResult {
  readonly resolvedTarget: PoseGazeIntent["target"];
  readonly effectivePitchDeg: number;
  readonly effectiveYawDeg: number;
  readonly vergenceDeg: number;
  readonly eyelidFollowWeight: number;
  readonly leftEyeRotationRad: NaturalRigVec3;
  readonly rightEyeRotationRad: NaturalRigVec3;
  readonly expressionWeights: Readonly<{
    readonly lookUp: number;
    readonly lookDown: number;
    readonly lookLeft: number;
    readonly lookRight: number;
  }>;
}

/** 고개 기울임·포즈 시선 의도에 맞춰 좌/우 안구 회전·근거리 폭주(수렴)·눈꺼풀 추종을 산출한다. */
export function solveEyeGazeIntent(input: EyeGazeIntentInput): EyeGazeIntentResult {
  const strength = clamp01(finite(input.strength, 1));
  const headPitchDeg = finite(input.headRotationRad[0], 0) * RAD + finite(input.neckRotationRad?.[0], 0) * RAD * 0.5;
  const headYawDeg = finite(input.headRotationRad[1], 0) * RAD + finite(input.neckRotationRad?.[1], 0) * RAD * 0.5;

  const override = input.gazeOverride ?? "auto";
  const resolvedTarget: PoseGazeIntent["target"] = override !== "auto"
    ? override
    : (input.intent?.target ?? "forward");

  let rawPitchDeg: number;
  let rawYawDeg: number;
  let rawConvergence: number;

  if (resolvedTarget === "hands") {
    rawPitchDeg = override === "auto" && input.intent ? input.intent.pitchDeg : -22;
    rawYawDeg = override === "auto" && input.intent ? input.intent.yawDeg : -headYawDeg * 0.35;
    rawConvergence = override === "auto" && input.intent ? input.intent.convergence : 0.72;
  } else if (resolvedTarget === "camera") {
    // 카메라 응시: 고개 회전의 65%를 안구 전정안반사(VOR)로 역보상해 자연스럽게 정면 시선 유지.
    rawPitchDeg = clamp(-headPitchDeg * 0.55 + (override === "auto" ? (input.intent?.pitchDeg ?? 0) : 0), -14, 14);
    rawYawDeg = clamp(-headYawDeg * 0.65 + (override === "auto" ? (input.intent?.yawDeg ?? 0) : 0), -18, 18);
    rawConvergence = override === "auto" && input.intent ? input.intent.convergence : 0.25;
  } else if (resolvedTarget === "down") {
    rawPitchDeg = -18;
    rawYawDeg = 0;
    rawConvergence = 0.45;
  } else if (resolvedTarget === "side") {
    rawPitchDeg = input.intent?.pitchDeg ?? 0;
    rawYawDeg = input.intent?.yawDeg ?? 14;
    rawConvergence = 0.2;
  } else {
    rawPitchDeg = clamp(-headPitchDeg * 0.25, -10, 10);
    rawYawDeg = clamp(-headYawDeg * 0.25, -12, 12);
    rawConvergence = 0.15;
  }

  const effectivePitchDeg = clamp(rawPitchDeg * strength, -18, 18);
  const effectiveYawDeg = clamp(rawYawDeg * strength, -22, 22);
  const vergenceDeg = clamp(rawConvergence * 5.2 * strength, 0, 5.5);

  // VRM 정규화 안구: 아래 바라보기 = +X(pitch), 왼쪽 눈 안쪽 수렴 = -Y, 오른쪽 눈 안쪽 수렴 = +Y.
  const leftRaw: NaturalRigVec3 = [-effectivePitchDeg * DEG, (effectiveYawDeg - vergenceDeg) * DEG, 0];
  const rightRaw: NaturalRigVec3 = [-effectivePitchDeg * DEG, (effectiveYawDeg + vergenceDeg) * DEG, 0];
  const leftEyeRotationRad = clampStudioVrmJointRotation("leftEye", leftRaw);
  const rightEyeRotationRad = clampStudioVrmJointRotation("rightEye", rightRaw);

  const lookUp = clamp01(effectivePitchDeg / 18);
  const lookDown = clamp01(-effectivePitchDeg / 18);
  const lookLeft = clamp01(effectiveYawDeg / 22);
  const lookRight = clamp01(-effectiveYawDeg / 22);
  // 시선이 아래를 향할 때 상안검이 자연스럽게 따라 내려와 공막 과노출(흰자 뜸)을 막는다.
  const eyelidFollowWeight = Number(clamp01(lookDown * 0.34).toFixed(3));

  return Object.freeze({
    resolvedTarget,
    effectivePitchDeg: Number(effectivePitchDeg.toFixed(2)),
    effectiveYawDeg: Number(effectiveYawDeg.toFixed(2)),
    vergenceDeg: Number(vergenceDeg.toFixed(2)),
    eyelidFollowWeight,
    leftEyeRotationRad: Object.freeze([leftEyeRotationRad[0], leftEyeRotationRad[1], leftEyeRotationRad[2]] as const),
    rightEyeRotationRad: Object.freeze([rightEyeRotationRad[0], rightEyeRotationRad[1], rightEyeRotationRad[2]] as const),
    expressionWeights: Object.freeze({
      lookUp: Number(lookUp.toFixed(3)),
      lookDown: Number(lookDown.toFixed(3)),
      lookLeft: Number(lookLeft.toFixed(3)),
      lookRight: Number(lookRight.toFixed(3)),
    }),
  });
}

export interface TenFingerCurveInput {
  readonly leftMode: NaturalRigHandGestureKind;
  readonly rightMode: NaturalRigHandGestureKind;
  readonly propRadiusM?: number;
  readonly gripFit?: number;
  readonly strength?: number;
}

export interface HandGestureSummary {
  readonly mode: NaturalRigHandGestureKind;
  readonly meanPipCurlDeg: number;
  readonly thumbOppositionDeg: number;
  readonly maxSpreadDeg: number;
}

export interface TenFingerCurveResult {
  readonly rotations: Readonly<Partial<Record<VRMHumanBoneName, NaturalRigVec3>>>;
  readonly boneCount: number;
  readonly leftSummary: HandGestureSummary;
  readonly rightSummary: HandGestureSummary;
  readonly reverseJointCount: number;
  readonly crossingPairCount: number;
  readonly dipPipMaxError: number;
}

const HAND_CURVE_PROFILES: Readonly<Record<NaturalRigHandGestureKind, {
  readonly basePipDeg: number;
  readonly mcpFactor: number;
  readonly ulnarCascade: readonly [number, number, number, number];
  readonly spreadDeg: readonly [number, number, number, number];
  readonly thumbOppDeg: number;
  readonly thumbCurlDeg: number;
}>> = Object.freeze({
  "relaxed-idle": { basePipDeg: 22, mcpFactor: 0.78, ulnarCascade: [0.92, 1.0, 1.08, 1.16], spreadDeg: [3.5, 0.5, -1.5, -4], thumbOppDeg: 14, thumbCurlDeg: 12 },
  "open-wave": { basePipDeg: 7, mcpFactor: 0.55, ulnarCascade: [0.85, 0.95, 1.05, 1.15], spreadDeg: [9.5, 2.5, -3.5, -10], thumbOppDeg: 10, thumbCurlDeg: 6 },
  "phone-cradle": { basePipDeg: 44, mcpFactor: 0.68, ulnarCascade: [0.68, 0.94, 1.08, 1.18], spreadDeg: [5, 1, -1.5, -3.5], thumbOppDeg: 32, thumbCurlDeg: 16 },
  "cylinder-grip": { basePipDeg: 72, mcpFactor: 0.76, ulnarCascade: [0.94, 1.0, 1.04, 0.98], spreadDeg: [2, 0.4, -0.6, -1.8], thumbOppDeg: 44, thumbCurlDeg: 34 },
  "pinch-grip": { basePipDeg: 54, mcpFactor: 0.66, ulnarCascade: [1.05, 0.86, 0.52, 0.46], spreadDeg: [4, 1, -2, -4], thumbOppDeg: 40, thumbCurlDeg: 28 },
  "flat-support": { basePipDeg: 18, mcpFactor: 0.52, ulnarCascade: [0.76, 0.88, 1.04, 1.18], spreadDeg: [4.5, 1, -1.5, -4], thumbOppDeg: 20, thumbCurlDeg: 12 },
});

/** 양손 10손가락(30본)에 해부학적 척측 캐스케이드·DIP=0.67×PIP·엄지 대립 커브를 생성한다. */
export function solveTenFingerNaturalCurve(input: TenFingerCurveInput): TenFingerCurveResult {
  const strength = clamp01(finite(input.strength, 1));
  const gripFit = clamp(finite(input.gripFit, 1), 0.5, 1.35);
  const radiusM = clamp(finite(input.propRadiusM, 0.012), 0.004, 0.06);
  const radiusScale = clamp(1.12 - (radiusM - 0.008) * 7.5, 0.7, 1.15);

  const rotations: Partial<Record<VRMHumanBoneName, NaturalRigVec3>> = {};
  let reverseJointCount = 0;
  let crossingPairCount = 0;
  let dipPipMaxError = 0;

  const buildHand = (side: NaturalRigSide, mode: NaturalRigHandGestureKind): HandGestureSummary => {
    const profile = HAND_CURVE_PROFILES[mode];
    const sign = side === "left" ? -1 : 1;
    const isGrip = mode === "phone-cradle" || mode === "cylinder-grip" || mode === "pinch-grip";
    const scale = strength * (isGrip ? gripFit * radiusScale : 1);

    const pipValues: number[] = [];
    const spreads: number[] = [];
    for (let i = 0; i < FINGER_NAMES.length; i += 1) {
      const finger = FINGER_NAMES[i]!;
      const pipDeg = clamp(profile.basePipDeg * profile.ulnarCascade[i]! * scale, 0, 102);
      const mcpDeg = clamp(pipDeg * profile.mcpFactor, 0, 88);
      const dipDeg = clamp(pipDeg * DIP_PIP_RATIO, 0, 72);
      // 굴곡이 커질수록 인접 손가락 간 벌림을 자동으로 줄여 교차 관통을 차단한다.
      const flexDamp = 1 - 0.78 * clamp01(mcpDeg / 90);
      const spreadDeg = profile.spreadDeg[i]! * flexDamp * strength;
      pipValues.push(pipDeg);
      spreads.push(spreadDeg);
      if (pipDeg >= 8) dipPipMaxError = Math.max(dipPipMaxError, Math.abs(dipDeg / pipDeg - DIP_PIP_RATIO));
      if (mcpDeg < 0 || pipDeg < 0 || dipDeg < 0) reverseJointCount += 1;

      const pName = `${side}${finger}Proximal` as VRMHumanBoneName;
      const iName = `${side}${finger}Intermediate` as VRMHumanBoneName;
      const dName = `${side}${finger}Distal` as VRMHumanBoneName;
      rotations[pName] = Object.freeze([0, spreadDeg * sign * DEG, mcpDeg * sign * DEG] as const);
      rotations[iName] = Object.freeze([0, 0, pipDeg * sign * DEG] as const);
      rotations[dName] = Object.freeze([0, 0, dipDeg * sign * DEG] as const);
    }

    for (let i = 0; i < spreads.length - 1; i += 1) {
      if (spreads[i]! + 0.05 < spreads[i + 1]!) crossingPairCount += 1;
    }

    const thumbOpp = clamp(profile.thumbOppDeg * strength * (isGrip ? gripFit : 1), 0, 46);
    const thumbCurl = clamp(profile.thumbCurlDeg * strength * (isGrip ? gripFit : 1), 0, 56);
    rotations[`${side}ThumbMetacarpal` as VRMHumanBoneName] = Object.freeze([
      thumbOpp * 0.42 * DEG,
      sign * thumbOpp * DEG,
      sign * thumbCurl * 0.48 * DEG,
    ] as const);
    rotations[`${side}ThumbProximal` as VRMHumanBoneName] = Object.freeze([
      thumbCurl * 0.24 * DEG,
      sign * thumbOpp * 0.35 * DEG,
      sign * thumbCurl * 0.72 * DEG,
    ] as const);
    rotations[`${side}ThumbDistal` as VRMHumanBoneName] = Object.freeze([
      0,
      sign * thumbOpp * 0.14 * DEG,
      sign * thumbCurl * 0.65 * DEG,
    ] as const);

    return Object.freeze({
      mode,
      meanPipCurlDeg: Number((pipValues.reduce((sum, v) => sum + v, 0) / pipValues.length).toFixed(1)),
      thumbOppositionDeg: Number(thumbOpp.toFixed(1)),
      maxSpreadDeg: Number(Math.max(...spreads.map((v) => Math.abs(v))).toFixed(1)),
    });
  };

  const leftSummary = buildHand("left", input.leftMode);
  const rightSummary = buildHand("right", input.rightMode);

  return Object.freeze({
    rotations: Object.freeze(rotations),
    boneCount: Object.keys(rotations).length,
    leftSummary,
    rightSummary,
    reverseJointCount,
    crossingPairCount,
    dipPipMaxError: Number(dipPipMaxError.toFixed(4)),
  });
}

/* ── 통합 진단 파이프라인 (실제 포즈 프리셋 + 루미 기준 두상 치수 연동) ── */

export interface VrmNaturalRigPipelineInput {
  readonly presetId?: NaturalRigPosePresetId;
  readonly propId?: NaturalRigHeadPropId;
  readonly weights?: Partial<NaturalRigAxisWeights>;
  readonly gazeOverride?: NaturalRigGazeOverride;
  readonly hairVolumeMm?: number;
}

export interface VrmNaturalRigDiagnosticReport {
  readonly presetId: NaturalRigPosePresetId;
  readonly presetLabel: string;
  readonly propId: NaturalRigHeadPropId;
  readonly weights: NaturalRigAxisWeights;
  readonly leftClavicle: ClavicleScapulaShareResult;
  readonly rightClavicle: ClavicleScapulaShareResult;
  readonly candyWrapperLeft: CandyWrapperGuardResult;
  readonly candyWrapperRight: CandyWrapperGuardResult;
  readonly eyeGaze: EyeGazeIntentResult;
  readonly tenFingers: TenFingerCurveResult;
  readonly propSeat: HeadPropSurfaceSeatResult;
  readonly hairCollision: HairShoulderRepulsionResult;
  readonly overallScore: number;
  readonly overallStatus: "optimal" | "adjusted" | "warning";
}

function resolvePosePresetById(id: NaturalRigPosePresetId): StudioPosePreset {
  return EXTRA_POSE_PRESETS.find((p) => p.id === id)
    ?? NATURAL_IDLE_POSES.find((p) => p.id === id)
    ?? EXTRA_POSE_PRESETS[0]!;
}

/** 실제 포즈 프리셋과 루미 기준 두상 치수에서 4대 자연 리깅 솔버를 통합 평가한다. */
export function evaluateVrmNaturalRigPipeline(
  input: VrmNaturalRigPipelineInput = {},
): VrmNaturalRigDiagnosticReport {
  const presetId: NaturalRigPosePresetId = input.presetId ?? "xp_wave_greeting";
  const propId: NaturalRigHeadPropId = input.propId ?? "beret";
  const weights: NaturalRigAxisWeights = Object.freeze({
    poseNatural: clamp01(finite(input.weights?.poseNatural, 0.92)),
    propSeat: clamp01(finite(input.weights?.propSeat, 1)),
    hairCollision: clamp01(finite(input.weights?.hairCollision, 1)),
  });

  const preset = resolvePosePresetById(presetId);
  const leftClavicle = solveClavicleScapulaShare({
    side: "left",
    upperArmDirection: directionToWorldVec(preset.bones.leftUpperArm?.direction, "left"),
    existingShoulderRotationRad: preset.bones.leftShoulder?.rotation,
    strength: weights.poseNatural,
  });
  const rightClavicle = solveClavicleScapulaShare({
    side: "right",
    upperArmDirection: directionToWorldVec(preset.bones.rightUpperArm?.direction, "right"),
    existingShoulderRotationRad: preset.bones.rightShoulder?.rotation,
    strength: weights.poseNatural,
  });

  const leftHandTwistDeg = finite(preset.bones.leftHand?.rotation?.[0], 0) * RAD;
  const rightHandTwistDeg = finite(preset.bones.rightHand?.rotation?.[0], 0) * RAD;
  const candyWrapperLeft = solveCandyWrapperGuard({
    side: "left",
    wristTwistDeg: leftHandTwistDeg,
    upperArmAxialTwistDeg: leftClavicle.armElevationDeg * 0.35,
    strength: weights.poseNatural,
  });
  const candyWrapperRight = solveCandyWrapperGuard({
    side: "right",
    wristTwistDeg: rightHandTwistDeg,
    upperArmAxialTwistDeg: rightClavicle.armElevationDeg * 0.35,
    strength: weights.poseNatural,
  });

  const eyeGaze = solveEyeGazeIntent({
    headRotationRad: preset.bones.head?.rotation ?? [0, 0, 0],
    neckRotationRad: preset.bones.neck?.rotation ?? [0, 0, 0],
    intent: preset.gazeIntent,
    gazeOverride: input.gazeOverride ?? "auto",
    strength: weights.poseNatural,
  });

  const leftMode: NaturalRigHandGestureKind = presetId === "xp_phone_look" ? "phone-cradle" : "relaxed-idle";
  const rightMode: NaturalRigHandGestureKind = presetId === "xp_wave_greeting"
    ? "open-wave"
    : presetId === "xp_phone_look"
      ? "phone-cradle"
      : presetId === "xp_banzai"
        ? "open-wave"
        : "relaxed-idle";
  const tenFingers = solveTenFingerNaturalCurve({
    leftMode,
    rightMode,
    propRadiusM: presetId === "xp_phone_look" ? 0.009 : 0.012,
    strength: weights.poseNatural,
  });

  // sample.vrm(루미) 실측 기준 두상 지표
  const propSeat = solveHeadPropSurfaceSeat({
    propId,
    headWidthM: 0.2097,
    crownHeightM: 0.2222,
    eyeDistanceM: 0.0734,
    faceFrontZM: 0.1035,
    eyeHeightM: 0.0626,
    hairVolumeMm: input.hairVolumeMm ?? 12,
    fitStrength: weights.propSeat,
  });

  const hairCollision = solveHairShoulderCapsuleRepulsion({
    strands: createDefaultHairStrands(),
    leftClavicleLiftDeg: leftClavicle.shoulderElevationDeg,
    rightClavicleLiftDeg: rightClavicle.shoulderElevationDeg,
    repulsionStrength: weights.hairCollision,
    clearanceMm: 2.5,
  });

  const poseScore = (1 - Math.max(leftClavicle.pinchRiskAfter, rightClavicle.pinchRiskAfter)) * 0.5
    + (candyWrapperLeft.candyWrapperSafe && candyWrapperRight.candyWrapperSafe ? 0.5 : 0.25);
  const propScore = clamp01(1 - propSeat.floatGapAfterMm / 16 - propSeat.opticalAlignmentErrorMm / 12);
  const hairScore = clamp01(1 - hairCollision.resolvedMaxPenetrationMm / 12);
  const overallScore = Math.round((poseScore * 0.4 + propScore * 0.35 + hairScore * 0.25) * 100);
  const overallStatus: VrmNaturalRigDiagnosticReport["overallStatus"] =
    overallScore >= 85 ? "optimal" : overallScore >= 65 ? "adjusted" : "warning";

  return Object.freeze({
    presetId,
    presetLabel: preset.label,
    propId,
    weights,
    leftClavicle,
    rightClavicle,
    candyWrapperLeft,
    candyWrapperRight,
    eyeGaze,
    tenFingers,
    propSeat,
    hairCollision,
    overallScore,
    overallStatus,
  });
}
