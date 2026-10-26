/**
 * SHAPER Assembly-CSharp-firstpass.dll (RootMotion.FinalIK) 역공학 클린룸 내재화:
 * - IKSolverLookAt (0x06000412): 척추(spine[])·머리(head)·안구(eyes[]) 가중치 분배 및 clampWeight + clampSmoothing 사인파 감쇠
 * - IKSolverFABRIK (0x060003c7): 전방(SolveForward)·후방(SolveBackward) 양방향 도달 패스 및 관절 원뿔 제한
 * - TwistSolver / TwistRelaxer (0x0600045d): 부모-자식 비틀림 교차 페이드(parentChildCrossfade) 및 오프셋 보정
 * - RotationLimitAngle (0x06000516) & RotationLimitHinge (0x0600051e): 스윙 원뿔 + 트위스트 클램프 및 경첩(Hinge) 각도 제한
 * - Grounding (0x0600032b): 좌·우 발 접지 단차로부터 골반 하강(lowerPelvisWeight)·상승(liftPelvisWeight) 및 발바닥 경사각 제한 계산
 */
import {
  clamp,
  degToRad,
  lerp,
  qFromAxisAngle,
  qMultiply,
  qNormalize,
  quatFromTo,
  v3Add,
  v3Cross,
  v3Dot,
  v3Length,
  v3Normalize,
  v3Scale,
  v3Sub,
} from "../shared/math";

import type { Quat, Vec3 } from "../contracts/pose";

export interface ShaperFinalIkLookAtInput {
  readonly forward: Vec3;
  readonly toTarget: Vec3;
  readonly weight?: number;
  readonly bodyWeight?: number;
  readonly headWeight?: number;
  readonly eyesWeight?: number;
  readonly clampWeight?: number;
  readonly clampWeightHead?: number;
  readonly clampWeightEyes?: number;
  readonly clampSmoothing?: 0 | 1 | 2;
  readonly spineCount?: number;
}

export interface ShaperFinalIkLookAtResult {
  readonly clampedBodyDirection: Vec3;
  readonly clampedHeadDirection: Vec3;
  readonly clampedEyesDirection: Vec3;
  readonly spineRotations: readonly Quat[];
  readonly headRotation: Quat;
  readonly eyeRotation: Quat;
}

/**
 * RootMotion.FinalIK.IKSolverLookAt::GetClampedDirection 역공학 내재화:
 * 기준 전방 벡터(`forward`)와 목표 방향(`toTarget`) 사이의 각도 결손율을 `clampWeight`와 `clampSmoothing`회의 사인 곡선으로 감쇠한다.
 */
export function clampShaperLookAtDirection(
  forward: Vec3,
  toTarget: Vec3,
  clampWeight: number,
  clampSmoothing: 0 | 1 | 2 = 2,
): Vec3 {
  const f = v3Normalize(forward);
  const t = v3Normalize(toTarget);
  if (v3Length(f) === 0 || v3Length(t) === 0) return [0, 0, 1];
  const cw = clamp(clampWeight, 0, 1);
  if (cw <= 0) return t;
  if (cw >= 1) return f;

  const dot = clamp(v3Dot(f, t), -1, 1);
  const angleRatio = 1 - (dot + 1) * 0.5;
  if (angleRatio <= 1e-8) return t;

  let m = angleRatio < 1 - cw ? angleRatio / (1 - cw) : 1;
  const steps = clamp(Math.trunc(clampSmoothing), 0, 2);
  for (let i = 0; i < steps; i += 1) {
    m = Math.sin(m * Math.PI - Math.PI * 0.5) * 0.5 + 0.5;
  }
  const targetRatio = m * (1 - cw);
  const blend = clamp(targetRatio / angleRatio, 0, 1);
  return v3Normalize(
    v3Add(v3Scale(f, 1 - blend), v3Scale(t, blend)),
  );
}

/**
 * SHAPER FinalIK IKSolverLookAt::Solve 역공학 내재화:
 * 척추 체인(`spineCount`개), 머리(`head`), 안구(`eyes`)의 시선 추적 회전을 가중치와 클램프 곡선에 따라 분배한다.
 */
export function solveShaperFinalIkLookAt(
  input: ShaperFinalIkLookAtInput,
): ShaperFinalIkLookAtResult {
  const {
    forward,
    toTarget,
    weight = 1,
    bodyWeight = 0.5,
    headWeight = 0.8,
    eyesWeight = 1,
    clampWeight = 0.5,
    clampWeightHead = 0.5,
    clampWeightEyes = 0.5,
    clampSmoothing = 2,
    spineCount = 2,
  } = input;

  const masterW = clamp(weight, 0, 1);
  const f = v3Normalize(forward);
  const clampedBodyDirection = clampShaperLookAtDirection(f, toTarget, clampWeight, clampSmoothing);
  const clampedHeadDirection = clampShaperLookAtDirection(f, toTarget, clampWeightHead, clampSmoothing);
  const clampedEyesDirection = clampShaperLookAtDirection(f, toTarget, clampWeightEyes, clampSmoothing);

  const count = Math.max(0, Math.trunc(spineCount));
  const spineRotations: Quat[] = [];
  if (count > 0) {
    const denom = (count * (count + 1)) * 0.5;
    for (let i = 0; i < count; i += 1) {
      const stepW = ((i + 1) / denom) * clamp(bodyWeight, 0, 1) * masterW;
      const stepDir = v3Normalize(
        v3Add(v3Scale(f, 1 - stepW), v3Scale(clampedBodyDirection, stepW)),
      );
      spineRotations.push(quatFromTo(f, stepDir));
    }
  }

  const hw = clamp(headWeight, 0, 1) * masterW;
  const headDir = v3Normalize(v3Add(v3Scale(f, 1 - hw), v3Scale(clampedHeadDirection, hw)));
  const headRotation = quatFromTo(f, headDir);

  const ew = clamp(eyesWeight, 0, 1) * masterW;
  const eyeDir = v3Normalize(v3Add(v3Scale(f, 1 - ew), v3Scale(clampedEyesDirection, ew)));
  const eyeRotation = quatFromTo(f, eyeDir);

  return {
    clampedBodyDirection,
    clampedHeadDirection,
    clampedEyesDirection,
    spineRotations,
    headRotation,
    eyeRotation,
  };
}

export interface ShaperFabrikChainInput {
  readonly positions: readonly Vec3[];
  readonly target: Vec3;
  readonly maxIterations?: number;
  readonly tolerance?: number;
  /** 각 내부 관절(1..n-2)에서 이전 본 방향 대비 허용하는 최대 꺾임 각도(도) */
  readonly maxBendDeg?: readonly number[];
}

export interface ShaperFabrikChainResult {
  readonly positions: readonly Vec3[];
  readonly boneLengths: readonly number[];
  readonly iterations: number;
  readonly error: number;
  readonly reached: boolean;
}

function clampDirectionCone(referenceDir: Vec3, candidateDir: Vec3, maxAngleDeg: number): Vec3 {
  const ref = v3Normalize(referenceDir);
  const cand = v3Normalize(candidateDir);
  const limitRad = degToRad(clamp(maxAngleDeg, 0, 180));
  const dot = clamp(v3Dot(ref, cand), -1, 1);
  const angle = Math.acos(dot);
  if (angle <= limitRad || angle <= 1e-8) return cand;
  const t = limitRad / angle;
  return v3Normalize(v3Add(v3Scale(ref, 1 - t), v3Scale(cand, t)));
}

/**
 * SHAPER FinalIK IKSolverFABRIK::SolveForward & SolveBackward 역공학 내재화:
 * 본 길이를 엄격히 보존하면서 말단→루트(Forward), 루트→말단(Backward) 양방향 도달 패스를 반복 수행한다.
 */
export function solveShaperFinalIkFabrikChain(
  input: ShaperFabrikChainInput,
): ShaperFabrikChainResult {
  const {
    positions,
    target,
    maxIterations = 10,
    tolerance = 1e-3,
    maxBendDeg,
  } = input;

  const n = positions.length;
  if (n < 2) {
    return {
      positions: positions.map((p) => [...p] as Vec3),
      boneLengths: [],
      iterations: 0,
      error: n === 1 ? v3Length(v3Sub(positions[0], target)) : 0,
      reached: false,
    };
  }

  const pts: Vec3[] = positions.map((p) => [...p] as Vec3);
  const root: Vec3 = [...pts[0]] as Vec3;
  const boneLengths: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    boneLengths.push(Math.max(1e-6, v3Length(v3Sub(pts[i + 1], pts[i]))));
  }

  let iterations = 0;
  const maxIter = Math.max(1, Math.trunc(maxIterations));
  for (let iter = 0; iter < maxIter; iter += 1) {
    const err = v3Length(v3Sub(pts[n - 1], target));
    if (err <= tolerance) break;
    iterations += 1;

    // 1. Forward reaching (말단을 target에 놓고 루트 쪽으로 당김)
    pts[n - 1] = [...target] as Vec3;
    for (let i = n - 2; i >= 0; i -= 1) {
      const dir = v3Normalize(v3Sub(pts[i], pts[i + 1]));
      const safeDir: Vec3 = v3Length(dir) > 0 ? dir : [0, 1, 0];
      pts[i] = v3Add(pts[i + 1], v3Scale(safeDir, boneLengths[i]));
    }

    // 2. Backward reaching (루트를 원위치에 고정하고 말단 쪽으로 밀어냄)
    pts[0] = root;
    for (let i = 0; i < n - 1; i += 1) {
      let dir = v3Normalize(v3Sub(pts[i + 1], pts[i]));
      if (v3Length(dir) === 0) dir = [0, 1, 0];
      const limitDeg = maxBendDeg?.[i];
      if (i > 0 && limitDeg !== undefined && Number.isFinite(limitDeg)) {
        const prevDir = v3Normalize(v3Sub(pts[i], pts[i - 1]));
        dir = clampDirectionCone(prevDir, dir, limitDeg);
      }
      pts[i + 1] = v3Add(pts[i], v3Scale(dir, boneLengths[i]));
    }
  }

  const error = v3Length(v3Sub(pts[n - 1], target));
  return {
    positions: pts,
    boneLengths,
    iterations,
    error,
    reached: error <= tolerance,
  };
}

export interface ShaperTwistRelaxerInput {
  readonly parentTwistDeg: number;
  readonly childTwistDeg: number;
  readonly weight?: number;
  readonly parentChildCrossfade?: number;
  readonly twistAngleOffsetDeg?: number;
}

export interface ShaperTwistRelaxerResult {
  readonly twistAngleDeg: number;
  readonly localDeltaRotation: Quat;
}

/**
 * SHAPER FinalIK TwistSolver::Relax (0x0600045d) 역공학 내재화:
 * 상완/허벅지(parent)와 손목/발목(child) 사이의 급격한 비틀림(Candy-wrapper 현상)을
 * `parentChildCrossfade`(0..1)와 `weight`(0..1)로 보정하는 보조 트위스트 회전을 산출한다.
 */
export function solveShaperFinalIkTwistRelaxer(
  input: ShaperTwistRelaxerInput,
): ShaperTwistRelaxerResult {
  const {
    parentTwistDeg,
    childTwistDeg,
    weight = 1,
    parentChildCrossfade = 0.5,
    twistAngleOffsetDeg = 0,
  } = input;

  const w = clamp(weight, 0, 1);
  const crossfade = clamp(parentChildCrossfade, 0, 1);
  const targetTwist = lerp(-parentTwistDeg, childTwistDeg, crossfade) + twistAngleOffsetDeg;
  const twistAngleDeg = targetTwist * w;
  const localDeltaRotation = qNormalize(qFromAxisAngle([1, 0, 0], degToRad(twistAngleDeg)));
  return { twistAngleDeg, localDeltaRotation };
}

/**
 * SHAPER FinalIK RotationLimitAngle::LimitRotation (0x06000516) 역공학 내재화:
 * 스윙 성분(Y, Z 오일러 각의 방사 반경)을 `limitDeg` 원뿔 안으로 클램프하고,
 * 비틀림 성분(X 오일러 각)을 `[-twistLimitDeg, +twistLimitDeg]` 구간으로 제한한다.
 */
export function applyShaperRotationLimitAngle(
  eulerDeg: Vec3,
  limitDeg: number,
  twistLimitDeg = 180,
): Vec3 {
  const maxSwing = clamp(limitDeg, 0, 180);
  const maxTwist = clamp(twistLimitDeg, 0, 180);
  const clampedTwist = clamp(eulerDeg[0], -maxTwist, maxTwist);
  const swingRadius = Math.hypot(eulerDeg[1], eulerDeg[2]);
  if (swingRadius <= maxSwing || swingRadius <= 1e-8) {
    return [clampedTwist, eulerDeg[1], eulerDeg[2]];
  }
  const scale = maxSwing / swingRadius;
  return [clampedTwist, eulerDeg[1] * scale, eulerDeg[2] * scale];
}

/**
 * SHAPER FinalIK RotationLimitHinge::LimitHinge (0x0600051e) 역공학 내재화:
 * 팔꿈치·무릎·손가락 등 1자유도 경첩(Hinge) 관절 각도를 `[minDeg, maxDeg]` 범위로 클램프한다.
 */
export function applyShaperRotationLimitHinge(
  angleDeg: number,
  minDeg: number,
  maxDeg: number,
  useLimits = true,
): number {
  if (!useLimits) return angleDeg;
  const lo = Math.min(minDeg, maxDeg);
  const hi = Math.max(minDeg, maxDeg);
  return clamp(angleDeg, lo, hi);
}

export interface ShaperFinalIkGroundingInput {
  readonly leftFootHeightOffset: number;
  readonly rightFootHeightOffset: number;
  readonly maxStep?: number;
  readonly lowerPelvisWeight?: number;
  readonly liftPelvisWeight?: number;
  readonly footGroundNormal?: Vec3;
  readonly maxFootRotationAngleDeg?: number;
}

export interface ShaperFinalIkGroundingResult {
  readonly clampedLeftOffsetY: number;
  readonly clampedRightOffsetY: number;
  readonly pelvisOffsetY: number;
  readonly footTiltDeg: number;
}

/**
 * SHAPER FinalIK Grounding::Update (0x0600032b) 역공학 내재화:
 * 양발의 지면 단차(`leftFootHeightOffset`, `rightFootHeightOffset`)를 `[-maxStep, +maxStep]`으로 제한하고,
 * 골반 하강(`lowerPelvisWeight`)·상승(`liftPelvisWeight`) 오프셋 및 지면 법선에 따른 발목 최대 경사각(`maxFootRotationAngleDeg`)을 계산한다.
 */
export function solveShaperFinalIkGrounding(
  input: ShaperFinalIkGroundingInput,
): ShaperFinalIkGroundingResult {
  const {
    leftFootHeightOffset,
    rightFootHeightOffset,
    maxStep = 0.45,
    lowerPelvisWeight = 0.8,
    liftPelvisWeight = 0.2,
    footGroundNormal = [0, 1, 0],
    maxFootRotationAngleDeg = 45,
  } = input;

  const stepLimit = Math.max(0, maxStep);
  const clampedLeftOffsetY = clamp(leftFootHeightOffset, -stepLimit, stepLimit);
  const clampedRightOffsetY = clamp(rightFootHeightOffset, -stepLimit, stepLimit);

  const minOffset = Math.min(clampedLeftOffsetY, clampedRightOffsetY);
  const maxOffset = Math.max(clampedLeftOffsetY, clampedRightOffsetY);
  let pelvisOffsetY = 0;
  if (minOffset < 0) {
    pelvisOffsetY = minOffset * clamp(lowerPelvisWeight, 0, 1);
  } else if (maxOffset > 0) {
    pelvisOffsetY = maxOffset * clamp(liftPelvisWeight, 0, 1);
  }

  const n = v3Normalize(footGroundNormal);
  const upDot = clamp(v3Dot([0, 1, 0], v3Length(n) > 0 ? n : [0, 1, 0]), -1, 1);
  const rawTiltDeg = (Math.acos(upDot) * 180) / Math.PI;
  const footTiltDeg = clamp(rawTiltDeg, 0, clamp(maxFootRotationAngleDeg, 0, 90));

  return {
    clampedLeftOffsetY,
    clampedRightOffsetY,
    pelvisOffsetY,
    footTiltDeg,
  };
}

export interface ShaperBoneWeightInfluence {
  readonly boneIndex: number;
  readonly weight: number;
}

export interface ShaperNormalizedBoneWeights4 {
  readonly boneIndices: readonly [number, number, number, number];
  readonly weights: readonly [number, number, number, number];
}

/**
 * TriLibCore.Utils.GeometryGroupUtils::LimitBoneWeights (`0x060003a5`, RVA `62324`) &
 * LimitMaxBoneWeights (`0x060003a8`, RVA `63880`, `ev_71f4448ae78893676b89317bcb4badfb36e0462c47a073039e04846a2b4024a8`) 역공학 내재화:
 * 정점에 연결된 가중치 후보들을 내림차순(`BoneWeightComparer` `0x020000cb`)으로 정렬해 최대 `maxWeights`(`1..4`)개만 남기고,
 * `invSum = 1 / (w0 + w1 + w2 + w3)`를 곱하여 총합이 `1.0`이 되도록 정규화한다.
 */
export function limitAndNormalizeShaperBoneWeights(
  influences: readonly ShaperBoneWeightInfluence[],
  maxWeights = 4,
): ShaperNormalizedBoneWeights4 {
  const limit = clamp(Math.trunc(maxWeights), 1, 4);
  const sorted = influences
    .filter((item) => item.weight > 0)
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);

  const indices: [number, number, number, number] = [0, 0, 0, 0];
  const rawWeights: [number, number, number, number] = [0, 0, 0, 0];
  let sum = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const entry = sorted[i]!;
    indices[i] = entry.boneIndex;
    rawWeights[i] = entry.weight;
    sum += entry.weight;
  }

  if (sum <= 1e-8) {
    return {
      boneIndices: indices,
      weights: [0, 0, 0, 0],
    };
  }

  const invSum = 1.0 / sum;
  return {
    boneIndices: indices,
    weights: [
      rawWeights[0] * invSum,
      rawWeights[1] * invSum,
      rawWeights[2] * invSum,
      rawWeights[3] * invSum,
    ],
  };
}

export interface ShaperHumanoidTPoseBoneInput {
  readonly bonePosition: Vec3;
  readonly childPosition: Vec3;
  readonly boneRotation: Quat;
  readonly targetDirection: Vec3;
  readonly secondaryChildPosition?: Vec3;
}

export interface ShaperHumanoidTPoseBoneResult {
  readonly correctedRotation: Quat;
  readonly alignmentDot: number;
  readonly wasAdjusted: boolean;
  readonly referenceForward: Vec3;
}

/**
 * TriLibCore.HumanoidAvatarMapper::GetReferenceForward (`0x06000270`, RVA `44508`) &
 * EnforceBoneTPose (`0x06000271`, RVA `44596`) 역공학 내재화:
 * 부모-자식 본 방향 벡터 `dir1 = normalize(child - bone)`와 목표 T-포즈 축 `targetDirection`의 내적이
 * `0.999` 미만이면 `FromToRotation(dir1, targetDirection) * boneRotation`으로 회전시켜 T-포즈를 강제한다.
 */
export function enforceShaperHumanoidBoneTPose(
  input: ShaperHumanoidTPoseBoneInput,
): ShaperHumanoidTPoseBoneResult {
  const {
    bonePosition,
    childPosition,
    boneRotation,
    targetDirection,
    secondaryChildPosition,
  } = input;

  const dir1 = v3Normalize(v3Sub(childPosition, bonePosition));
  const targetDir = v3Normalize(targetDirection);
  const dir2 = secondaryChildPosition
    ? v3Normalize(v3Sub(secondaryChildPosition, bonePosition))
    : ([0, 1, 0] as Vec3);
  const crossFwd = v3Normalize(v3Cross(dir2, dir1));
  const referenceForward: Vec3 = v3Length(crossFwd) > 0 ? crossFwd : [0, 0, 1];

  if (v3Length(dir1) === 0 || v3Length(targetDir) === 0) {
    return {
      correctedRotation: qNormalize(boneRotation),
      alignmentDot: 1,
      wasAdjusted: false,
      referenceForward,
    };
  }

  const alignmentDot = clamp(v3Dot(dir1, targetDir), -1, 1);
  if (Math.abs(alignmentDot) >= 0.999 && alignmentDot > 0) {
    return {
      correctedRotation: qNormalize(boneRotation),
      alignmentDot,
      wasAdjusted: false,
      referenceForward,
    };
  }

  const deltaQuat = quatFromTo(dir1, targetDir);
  const correctedRotation = qNormalize(qMultiply(deltaQuat, boneRotation));
  return {
    correctedRotation,
    alignmentDot,
    wasAdjusted: true,
    referenceForward,
  };
}
