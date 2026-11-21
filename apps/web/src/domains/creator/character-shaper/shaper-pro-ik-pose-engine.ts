/**
 * 로컬 3D Shaper(HORANG v1.05 Build 9 · RootMotion FinalIK 325 types / DynamicBone) 심층 REA 완결 엔진.
 *
 * 기존 `character-shaper`에 이미 내재화된 기능(24–135mm 초점거리 · MToon 유니폼 · 두피 헤어 심기 ·
 * 무게중심 펜선 · 멀티패스 PSD) 위에 누락된 4대 Pro IK·포즈·퍼스펙티브 엔진을 완결 구현한다:
 * 1) 양손 소품·무기 소켓 자동 그립 IK (`computeShaperHandSocketGrip`)
 * 2) 바닥 발 접지 FootIK & 시선 추적 LookAt IK 솔버 (`solveShaperFootGroundAndLookAtIk`)
 * 3) 2인 인터랙션 웹툰 포즈 프리셋 12종 + 신장차 자동 보정 (`resolveShaperDuoInteractionPose`)
 * 4) 웹툰 컷 과장 원근(만화 퍼스펙티브 18mm~135mm) + 거리 감쇠 선화 두께 계산기 (`computeWebtoonPerspectiveAndLineWeight`)
 */
import * as THREE from "three";

import { solveTwoBoneTarget } from "../vrm/studio-vrm-prop-ik";
import { computeVroidDuoHeightDifference } from "../vrm/studio-vroid-atelier-engine";

import {
  SHAPER_DUO_INTERACTION_PRESETS,
  SHAPER_HAND_SOCKET_PROPS,
  SHAPER_MANGA_PERSPECTIVE_PRESETS,
  type ShaperDuoContactType,
  type ShaperDuoInteractionGenre,
  type ShaperDuoInteractionPoseId,
  type ShaperDuoInteractionPreset,
  type ShaperDynamicBonePropSwing,
  type ShaperFingerCurlProfile,
  type ShaperHandSocketPropKind,
  type ShaperHandSocketPropSpec,
  type ShaperMangaPerspectivePreset,
  type ShaperVec3,
} from "./shaper-pro-ik-pose-presets";

export {
  SHAPER_DUO_INTERACTION_PRESETS,
  SHAPER_HAND_SOCKET_PROPS,
  SHAPER_MANGA_PERSPECTIVE_PRESETS,
  type ShaperDuoContactType,
  type ShaperDuoInteractionGenre,
  type ShaperDuoInteractionPoseId,
  type ShaperDuoInteractionPreset,
  type ShaperDynamicBonePropSwing,
  type ShaperFingerCurlProfile,
  type ShaperHandSocketPropKind,
  type ShaperHandSocketPropSpec,
  type ShaperMangaPerspectivePreset,
  type ShaperVec3,
};

export const SHAPER_PRO_REA_EVIDENCE = Object.freeze({
  product: "NAVER WEBTOON / Studio HORANG SHAPER v1.05 (Build 9)",
  firstpassAssembly: "Assembly-CSharp-firstpass.dll",
  firstpassMvid: "1c4a69b8-dea1-422e-a237-95b73a63a1eb",
  finalIkTypeCount: 325,
  subsystems: Object.freeze(["InteractionSystem/HandSocket", "GrounderFBBIK", "LookAtIK", "DynamicBone"]),
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  const rounded = Math.round(value * 10_000) / 10_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function toVec3(v: THREE.Vector3): ShaperVec3 {
  return Object.freeze([round4(v.x), round4(v.y), round4(v.z)]);
}

function fromVec3(tuple: ShaperVec3): THREE.Vector3 {
  return new THREE.Vector3(tuple[0], tuple[1], tuple[2]);
}

/* -------------------------------------------------------------------------- */
/* 1. 양손 소품·무기 소켓 자동 그립 IK (`computeShaperHandSocketGrip`)           */
/* -------------------------------------------------------------------------- */

export interface ShaperArmChainInput {
  readonly shoulderWorld: ShaperVec3;
  readonly elbowWorld: ShaperVec3;
  readonly handWorld: ShaperVec3;
  readonly poleHintWorld?: ShaperVec3;
}

export interface ShaperHandSocketGripInput {
  readonly propKind: ShaperHandSocketPropKind;
  readonly dominantHand?: "right" | "left";
  readonly twoHanded?: boolean;
  /** 소품 스케일 배율 (0.5..2.0, 기본 1.0) */
  readonly propScale?: number;
  /** 주 손 목표 월드 좌표 (생략 시 현재 주 손 위치 기준) */
  readonly targetWorldPosition?: ShaperVec3;
  readonly rightArm?: ShaperArmChainInput;
  readonly leftArm?: ShaperArmChainInput;
}

export interface ShaperSolvedHandGrip {
  readonly side: "right" | "left";
  readonly role: "primary" | "secondary";
  readonly socketWorldPosition: ShaperVec3;
  readonly wristRotationDeg: ShaperVec3;
  readonly fingerCurlDeg: ShaperFingerCurlProfile;
  readonly solvedElbowWorld: ShaperVec3;
  readonly solvedHandWorld: ShaperVec3;
  readonly reachable: boolean;
  readonly residualMeters: number;
}

export interface ShaperHandSocketGripResult {
  readonly spec: ShaperHandSocketPropSpec;
  readonly dominantHand: "right" | "left";
  readonly twoHandedActive: boolean;
  readonly propWorldPosition: ShaperVec3;
  readonly primaryHand: ShaperSolvedHandGrip;
  readonly secondaryHand: ShaperSolvedHandGrip | null;
  readonly dynamicBoneSwing: ShaperDynamicBonePropSwing;
}

const DEFAULT_RIGHT_ARM: ShaperArmChainInput = Object.freeze({
  shoulderWorld: [-0.18, 1.38, 0.0] as const,
  elbowWorld: [-0.26, 1.14, 0.08] as const,
  handWorld: [-0.2, 1.02, 0.34] as const,
  poleHintWorld: [-0.36, 1.08, -0.22] as const,
});

const DEFAULT_LEFT_ARM: ShaperArmChainInput = Object.freeze({
  shoulderWorld: [0.18, 1.38, 0.0] as const,
  elbowWorld: [0.26, 1.14, 0.08] as const,
  handWorld: [0.2, 1.02, 0.34] as const,
  poleHintWorld: [0.36, 1.08, -0.22] as const,
});

function solveArmToSocket(
  arm: ShaperArmChainInput,
  side: "right" | "left",
  role: "primary" | "secondary",
  targetWorld: THREE.Vector3,
  wristRotationDeg: ShaperVec3,
  fingerCurlDeg: ShaperFingerCurlProfile,
): ShaperSolvedHandGrip {
  const start = fromVec3(arm.shoulderWorld);
  const middle = fromVec3(arm.elbowWorld);
  const end = fromVec3(arm.handWorld);
  const pole = arm.poleHintWorld
    ? fromVec3(arm.poleHintWorld)
    : new THREE.Vector3(side === "right" ? start.x - 0.18 : start.x + 0.18, start.y - 0.25, start.z - 0.25);

  const solved = solveTwoBoneTarget(start, middle, end, targetWorld, pole);
  const solvedElbow = solved ? solved.elbow : middle;
  const solvedHand = solved ? solved.end : end;
  const residual = round4(solvedHand.distanceTo(targetWorld));
  const reachable = solved ? !solved.clamped && residual <= 0.015 : false;

  const mirrorSign = side === "left" ? -1 : 1;
  const mirroredWrist: ShaperVec3 = Object.freeze([
    round4(wristRotationDeg[0]),
    round4(wristRotationDeg[1] * mirrorSign),
    round4(wristRotationDeg[2] * mirrorSign),
  ]);

  return Object.freeze({
    side,
    role,
    socketWorldPosition: toVec3(targetWorld),
    wristRotationDeg: mirroredWrist,
    fingerCurlDeg: Object.freeze({ ...fingerCurlDeg }),
    solvedElbowWorld: toVec3(solvedElbow),
    solvedHandWorld: toVec3(solvedHand),
    reachable,
    residualMeters: residual,
  });
}

/**
 * 6종 소품·무기(검·펜·커피잔·스마트폰·우산·마법봉)에 대한 주 손 / 보조 손 소켓 그립 및
 * 해석적 2-Bone 팔 IK를 계산한다.
 */
export function computeShaperHandSocketGrip(
  input: ShaperHandSocketGripInput,
): ShaperHandSocketGripResult {
  const spec = SHAPER_HAND_SOCKET_PROPS.find((item) => item.kind === input.propKind) ?? SHAPER_HAND_SOCKET_PROPS[0]!;
  const dominantHand = input.dominantHand ?? "right";
  const supportHand: "right" | "left" = dominantHand === "right" ? "left" : "right";
  const propScale = clamp(input.propScale ?? 1.0, 0.5, 2.0);
  const twoHandedActive = spec.supportsTwoHanded && (input.twoHanded ?? spec.defaultTwoHanded);

  const rightArm = input.rightArm ?? DEFAULT_RIGHT_ARM;
  const leftArm = input.leftArm ?? DEFAULT_LEFT_ARM;
  const primaryArm = dominantHand === "right" ? rightArm : leftArm;
  const secondaryArm = supportHand === "right" ? rightArm : leftArm;
  const mirrorSign = dominantHand === "right" ? 1 : -1;

  const baseAnchor = input.targetWorldPosition
    ? fromVec3(input.targetWorldPosition)
    : fromVec3(primaryArm.handWorld);

  const primaryOffset = new THREE.Vector3(
    spec.primaryLocalOffset[0] * mirrorSign * propScale,
    spec.primaryLocalOffset[1] * propScale,
    spec.primaryLocalOffset[2] * propScale,
  );
  const propWorldPosition = baseAnchor.clone().add(primaryOffset);
  const primaryHand = solveArmToSocket(
    primaryArm,
    dominantHand,
    "primary",
    baseAnchor,
    spec.primaryWristRotationDeg,
    spec.primaryFingerCurlDeg,
  );

  let secondaryHand: ShaperSolvedHandGrip | null = null;
  if (twoHandedActive) {
    const secondaryOffset = new THREE.Vector3(
      spec.secondaryOffsetFromPrimary[0] * mirrorSign * propScale,
      spec.secondaryOffsetFromPrimary[1] * propScale,
      spec.secondaryOffsetFromPrimary[2] * propScale,
    );
    const secondaryTarget = fromVec3(primaryHand.solvedHandWorld).add(secondaryOffset);
    secondaryHand = solveArmToSocket(
      secondaryArm,
      supportHand,
      "secondary",
      secondaryTarget,
      spec.secondaryWristRotationDeg,
      spec.secondaryFingerCurlDeg,
    );
  }

  return Object.freeze({
    spec,
    dominantHand,
    twoHandedActive,
    propWorldPosition: toVec3(propWorldPosition),
    primaryHand,
    secondaryHand,
    dynamicBoneSwing: spec.dynamicBoneSwing,
  });
}

/* -------------------------------------------------------------------------- */
/* 2. 바닥 발 접지 FootIK & 시선 추적 LookAt IK 솔버                             */
/* -------------------------------------------------------------------------- */

export interface ShaperLegChainInput {
  readonly hipWorld: ShaperVec3;
  readonly kneeWorld: ShaperVec3;
  readonly footWorld: ShaperVec3;
  readonly floorHeightY?: number;
  readonly floorNormal?: ShaperVec3;
}

export interface ShaperLookAtInput {
  readonly headWorld: ShaperVec3;
  readonly targetWorld: ShaperVec3;
  readonly characterForwardYawDeg?: number;
  readonly bodyWeight?: number;
  readonly headWeight?: number;
  readonly eyesWeight?: number;
}

export interface ShaperFootGroundAndLookAtInput {
  readonly floorY?: number;
  readonly soleHeightMeters?: number;
  readonly pelvisWorld?: ShaperVec3;
  readonly leftLeg?: ShaperLegChainInput;
  readonly rightLeg?: ShaperLegChainInput;
  readonly lookAt?: ShaperLookAtInput;
}

export interface ShaperSolvedFootIk {
  readonly side: "left" | "right";
  readonly targetAnkleWorld: ShaperVec3;
  readonly solvedKneeWorld: ShaperVec3;
  readonly solvedAnkleWorld: ShaperVec3;
  readonly anklePitchDeg: number;
  readonly ankleRollDeg: number;
  readonly groundResidualMeters: number;
  readonly grounded: boolean;
}

export interface ShaperSolvedLookAtIk {
  readonly rawYawDeg: number;
  readonly rawPitchDeg: number;
  readonly inComfortCone: boolean;
  readonly boneAnglesDeg: {
    readonly spine: readonly [number, number];
    readonly chest: readonly [number, number];
    readonly neck: readonly [number, number];
    readonly head: readonly [number, number];
    readonly eyes: readonly [number, number];
  };
}

export interface ShaperFootGroundAndLookAtResult {
  readonly pelvisDeltaY: number;
  readonly adjustedPelvisWorld: ShaperVec3;
  readonly leftFoot: ShaperSolvedFootIk;
  readonly rightFoot: ShaperSolvedFootIk;
  readonly maxGroundResidualMeters: number;
  readonly lookAt: ShaperSolvedLookAtIk;
}

const DEFAULT_LEFT_LEG: ShaperLegChainInput = Object.freeze({
  hipWorld: [0.095, 0.94, 0] as const,
  kneeWorld: [0.1, 0.5, 0.03] as const,
  footWorld: [0.1, 0.08, 0] as const,
});

const DEFAULT_RIGHT_LEG: ShaperLegChainInput = Object.freeze({
  hipWorld: [-0.095, 0.94, 0] as const,
  kneeWorld: [-0.1, 0.5, 0.03] as const,
  footWorld: [-0.1, 0.08, 0] as const,
});

function solveSingleFootIk(
  side: "left" | "right",
  leg: ShaperLegChainInput,
  pelvisDeltaY: number,
  defaultFloorY: number,
  soleHeight: number,
): ShaperSolvedFootIk {
  const floorY = Number.isFinite(leg.floorHeightY) ? leg.floorHeightY! : defaultFloorY;
  const normal = leg.floorNormal ? fromVec3(leg.floorNormal).normalize() : new THREE.Vector3(0, 1, 0);
  if (normal.lengthSq() < 1e-6) normal.set(0, 1, 0);

  const hip = fromVec3(leg.hipWorld).add(new THREE.Vector3(0, pelvisDeltaY, 0));
  const knee = fromVec3(leg.kneeWorld).add(new THREE.Vector3(0, pelvisDeltaY, 0));
  const foot = fromVec3(leg.footWorld).add(new THREE.Vector3(0, pelvisDeltaY, 0));
  const targetAnkle = new THREE.Vector3(foot.x, floorY + soleHeight, foot.z);
  const kneePole = new THREE.Vector3(hip.x, (hip.y + targetAnkle.y) * 0.5, hip.z + 0.45);

  const solved = solveTwoBoneTarget(hip, knee, foot, targetAnkle, kneePole);
  const solvedKnee = solved ? solved.elbow : knee;
  const solvedAnkle = solved ? solved.end : foot;
  const groundResidual = round4(Math.abs(solvedAnkle.y - targetAnkle.y));

  // 경사면 법선으로부터 발목 피치·롤 각도 추출
  const anklePitchDeg = round4(clamp((Math.atan2(normal.z, normal.y) * 180) / Math.PI, -35, 35));
  const ankleRollDeg = round4(clamp((-Math.atan2(normal.x, normal.y) * 180) / Math.PI, -25, 25));

  return Object.freeze({
    side,
    targetAnkleWorld: toVec3(targetAnkle),
    solvedKneeWorld: toVec3(solvedKnee),
    solvedAnkleWorld: toVec3(solvedAnkle),
    anklePitchDeg,
    ankleRollDeg,
    groundResidualMeters: groundResidual,
    grounded: groundResidual <= 0.012,
  });
}

function solveLookAtIkInternal(input: ShaperLookAtInput): ShaperSolvedLookAtIk {
  const head = fromVec3(input.headWorld);
  const target = fromVec3(input.targetWorld);
  const delta = target.clone().sub(head);
  const forwardYawRad = ((input.characterForwardYawDeg ?? 0) * Math.PI) / 180;
  // 캐릭터 로컬(+Z 정면)로 회전 변환
  const cosY = Math.cos(-forwardYawRad);
  const sinY = Math.sin(-forwardYawRad);
  const localX = delta.x * cosY - delta.z * sinY;
  const localZ = delta.x * sinY + delta.z * cosY;
  const horizontal = Math.max(1e-5, Math.hypot(localX, localZ));

  const rawYawDeg = round4((Math.atan2(localX, localZ) * 180) / Math.PI);
  const rawPitchDeg = round4((Math.atan2(delta.y, horizontal) * 180) / Math.PI);
  const inComfortCone = Math.abs(rawYawDeg) <= 75 && rawPitchDeg >= -40 && rawPitchDeg <= 45;

  const bodyW = clamp(input.bodyWeight ?? 0.35, 0, 1);
  const headW = clamp(input.headWeight ?? 0.65, 0, 1);
  const eyesW = clamp(input.eyesWeight ?? 1.0, 0, 1);

  const clampedYaw = clamp(rawYawDeg, -95, 95);
  const clampedPitch = clamp(rawPitchDeg, -45, 50);

  const spineYaw = round4(clamp(clampedYaw * 0.14 * bodyW, -14, 14));
  const spinePitch = round4(clamp(clampedPitch * 0.12 * bodyW, -10, 10));
  const chestYaw = round4(clamp(clampedYaw * 0.18 * bodyW, -18, 18));
  const chestPitch = round4(clamp(clampedPitch * 0.16 * bodyW, -12, 12));
  const neckYaw = round4(clamp(clampedYaw * 0.24 * headW, -25, 25));
  const neckPitch = round4(clamp(clampedPitch * 0.26 * headW, -18, 20));
  const headYaw = round4(clamp(clampedYaw * 0.34 * headW, -38, 38));
  const headPitch = round4(clamp(clampedPitch * 0.36 * headW, -24, 28));

  const consumedYaw = spineYaw + chestYaw + neckYaw + headYaw;
  const consumedPitch = spinePitch + chestPitch + neckPitch + headPitch;
  const eyeYaw = round4(clamp((rawYawDeg - consumedYaw) * eyesW, -28, 28));
  const eyePitch = round4(clamp((rawPitchDeg - consumedPitch) * eyesW, -18, 18));

  return Object.freeze({
    rawYawDeg,
    rawPitchDeg,
    inComfortCone,
    boneAnglesDeg: Object.freeze({
      spine: Object.freeze([spineYaw, spinePitch] as const),
      chest: Object.freeze([chestYaw, chestPitch] as const),
      neck: Object.freeze([neckYaw, neckPitch] as const),
      head: Object.freeze([headYaw, headPitch] as const),
      eyes: Object.freeze([eyeYaw, eyePitch] as const),
    }),
  });
}

/**
 * 바닥 발 접지(FootIK / GrounderFBBIK)와 시선 추적(LookAt IK)을 동시 해석한다.
 * 골반 높이를 자동 보정해 다리 과신전·공중 부양·바닥 관통을 막고, 척추→목→머리→안구로 시선을 분배한다.
 */
export function solveShaperFootGroundAndLookAtIk(
  input: ShaperFootGroundAndLookAtInput = {},
): ShaperFootGroundAndLookAtResult {
  const floorY = Number.isFinite(input.floorY) ? input.floorY! : 0;
  const soleHeight = clamp(input.soleHeightMeters ?? 0.08, 0.02, 0.22);
  const leftLeg = input.leftLeg ?? DEFAULT_LEFT_LEG;
  const rightLeg = input.rightLeg ?? DEFAULT_RIGHT_LEG;
  const pelvis = fromVec3(input.pelvisWorld ?? [0, 0.94, 0]);

  const computeRequiredPelvisShift = (leg: ShaperLegChainInput): number => {
    const legFloorY = Number.isFinite(leg.floorHeightY) ? leg.floorHeightY! : floorY;
    const targetAnkleY = legFloorY + soleHeight;
    const hip = fromVec3(leg.hipWorld);
    const knee = fromVec3(leg.kneeWorld);
    const foot = fromVec3(leg.footWorld);
    const maxLegReach = hip.distanceTo(knee) + knee.distanceTo(foot) - 0.004;
    const currentDeltaY = targetAnkleY - foot.y;
    const neededVerticalSpan = hip.y - targetAnkleY;
    if (neededVerticalSpan > maxLegReach) {
      return -(neededVerticalSpan - maxLegReach);
    }
    return currentDeltaY < 0 ? currentDeltaY : 0;
  };

  const leftShift = computeRequiredPelvisShift(leftLeg);
  const rightShift = computeRequiredPelvisShift(rightLeg);
  // 두 발 모두 바닥에 닿도록 더 낮은 쪽(더 작은/음수 보정)을 골반 하강량으로 선택
  const pelvisDeltaY = round4(clamp(Math.min(leftShift, rightShift), -0.45, 0.35));
  const adjustedPelvisWorld: ShaperVec3 = Object.freeze([
    round4(pelvis.x),
    round4(pelvis.y + pelvisDeltaY),
    round4(pelvis.z),
  ]);

  const leftFoot = solveSingleFootIk("left", leftLeg, pelvisDeltaY, floorY, soleHeight);
  const rightFoot = solveSingleFootIk("right", rightLeg, pelvisDeltaY, floorY, soleHeight);
  const maxGroundResidualMeters = round4(Math.max(leftFoot.groundResidualMeters, rightFoot.groundResidualMeters));

  const lookAtInput: ShaperLookAtInput = input.lookAt ?? {
    headWorld: [0, 1.52 + pelvisDeltaY, 0],
    targetWorld: [0, 1.52, 2.2],
  };
  const lookAt = solveLookAtIkInternal(lookAtInput);

  return Object.freeze({
    pelvisDeltaY,
    adjustedPelvisWorld,
    leftFoot,
    rightFoot,
    maxGroundResidualMeters,
    lookAt,
  });
}

/* -------------------------------------------------------------------------- */
/* 3. 2인 인터랙션 웹툰 포즈 프리셋 12종 + 신장차 자동 보정                        */
/* -------------------------------------------------------------------------- */

export interface ShaperDuoInteractionResolveInput {
  readonly presetId: ShaperDuoInteractionPoseId;
  readonly actorAHeightCm: number;
  readonly actorBHeightCm: number;
  readonly spacingScale?: number;
  readonly swapped?: boolean;
}

export interface ShaperDuoActorCompensation {
  readonly role: "A" | "B";
  readonly heightCm: number;
  readonly position: ShaperVec3;
  readonly yawDeg: number;
  readonly poseId: string;
  readonly expression: string;
  readonly spinePitchDeg: number;
  readonly neckPitchDeg: number;
  readonly armElevationDeg: number;
  readonly hipLiftMeters: number;
  readonly gazePitchDeg: number;
}

export interface ShaperDuoInteractionResolved {
  readonly preset: ShaperDuoInteractionPreset;
  readonly heightDiffCm: number;
  readonly spacingMeters: number;
  readonly contactAnchorWorld: ShaperVec3;
  readonly actorA: ShaperDuoActorCompensation;
  readonly actorB: ShaperDuoActorCompensation;
  readonly recommendedFocalMm: number;
  readonly compensationSummaryKo: string;
}

/**
 * 2인 인터랙션 웹툰 포즈 12종을 두 캐릭터의 신장(cm) 차이에 맞춰 자동 보정한다.
 * 벽치기 손 높이, 어깨동무 팔 각도, 이마 맞대기·귓속말 척추 숙임, 공주님 안기 승강 높이를 정밀 계산한다.
 */
export function resolveShaperDuoInteractionPose(
  input: ShaperDuoInteractionResolveInput,
): ShaperDuoInteractionResolved {
  const preset =
    SHAPER_DUO_INTERACTION_PRESETS.find((item) => item.id === input.presetId)
    ?? SHAPER_DUO_INTERACTION_PRESETS[0]!;
  const heightA = clamp(input.actorAHeightCm, 95, 220);
  const heightB = clamp(input.actorBHeightCm, 95, 220);
  const spacingMeters = round4(clamp(preset.defaultSpacingMeters * clamp(input.spacingScale ?? 1, 0.65, 1.5), 0.25, 2.4));
  const swapSign = input.swapped ? -1 : 1;

  const heightComp = computeVroidDuoHeightDifference({
    actorAHeightCm: heightA,
    actorBHeightCm: heightB,
    spacingMeters,
  });
  const heightAM = heightA / 100;
  const heightBM = heightB / 100;
  const seatFactor = preset.seated ? 0.64 : 1.0;

  // 접촉 기준 높이(m): 포즈 성격별로 상대 신장 또는 양쪽 평균 신장에 맞춤
  let contactY: number;
  let actorASpinePitchDeg = 0;
  let actorBSpinePitchDeg = 0;
  let actorAArmElevationDeg = 0;
  let actorBArmElevationDeg = 0;
  let actorBHipLiftMeters = 0;

  const deltaM = heightAM - heightBM;

  switch (preset.contactType) {
    case "wall-hand":
    case "collar":
      contactY = heightBM * preset.contactHeightRatio;
      actorAArmElevationDeg = round4(clamp(((contactY - heightAM * 0.81) / 0.55) * 58, -45, 55));
      actorASpinePitchDeg = round4(clamp(deltaM * 38, -12, 22));
      break;
    case "shoulder":
      contactY = heightBM * preset.contactHeightRatio;
      actorAArmElevationDeg = round4(clamp(((contactY - heightAM * 0.81) / 0.45) * 48, -36, 42));
      actorASpinePitchDeg = round4(clamp(deltaM * 26, -10, 18));
      break;
    case "forehead":
    case "ear-whisper": {
      const targetMeetY = ((heightAM + heightBM) * 0.5) * preset.contactHeightRatio;
      contactY = targetMeetY;
      actorASpinePitchDeg = round4(clamp((heightAM * preset.contactHeightRatio - targetMeetY) * 120, -18, 28));
      actorBSpinePitchDeg = round4(clamp((heightBM * preset.contactHeightRatio - targetMeetY) * 120, -18, 28));
      break;
    }
    case "chest-carry":
      contactY = heightAM * preset.contactHeightRatio;
      actorBHipLiftMeters = round4(clamp(contactY - heightBM * 0.52, 0.25, 0.95));
      actorAArmElevationDeg = 18;
      actorBArmElevationDeg = 28;
      break;
    case "hand-join":
    case "overhead-palm":
      contactY = ((heightAM + heightBM) * 0.5) * preset.contactHeightRatio;
      actorAArmElevationDeg = round4(clamp(((contactY - heightAM * 0.81) / 0.52) * 52, -40, 72));
      actorBArmElevationDeg = round4(clamp(((contactY - heightBM * 0.81) / 0.52) * 52, -40, 72));
      break;
    case "umbrella-canopy":
      contactY = Math.max(heightAM, heightBM) * preset.contactHeightRatio;
      actorAArmElevationDeg = round4(clamp(((contactY - heightAM * 0.81) / 0.55) * 44, 0, 56));
      break;
    default:
      contactY = ((heightAM + heightBM) * 0.5) * preset.contactHeightRatio * seatFactor;
      break;
  }

  const halfSpacing = spacingMeters * 0.5;
  const actorA: ShaperDuoActorCompensation = Object.freeze({
    role: "A",
    heightCm: Math.round(heightA),
    position: Object.freeze([round4(-halfSpacing * swapSign), 0, 0] as const),
    yawDeg: round4(preset.actorAYawDeg * swapSign),
    poseId: preset.actorAPoseId,
    expression: preset.actorAExpression,
    spinePitchDeg: actorASpinePitchDeg,
    neckPitchDeg: round4(clamp(heightComp.actorAGazePitchDeg * 0.65, -26, 26)),
    armElevationDeg: actorAArmElevationDeg,
    hipLiftMeters: 0,
    gazePitchDeg: heightComp.actorAGazePitchDeg,
  });

  const actorB: ShaperDuoActorCompensation = Object.freeze({
    role: "B",
    heightCm: Math.round(heightB),
    position: Object.freeze([round4(halfSpacing * swapSign), actorBHipLiftMeters, 0] as const),
    yawDeg: round4(preset.actorBYawDeg * swapSign),
    poseId: preset.actorBPoseId,
    expression: preset.actorBExpression,
    spinePitchDeg: actorBSpinePitchDeg,
    neckPitchDeg: round4(clamp(heightComp.actorBGazePitchDeg * 0.65, -26, 26)),
    armElevationDeg: actorBArmElevationDeg,
    hipLiftMeters: actorBHipLiftMeters,
    gazePitchDeg: heightComp.actorBGazePitchDeg,
  });

  const contactAnchorWorld: ShaperVec3 = Object.freeze([0, round4(contactY), 0]);
  const compensationSummaryKo =
    `${preset.labelKo} · A(${Math.round(heightA)}cm) vs B(${Math.round(heightB)}cm, Δ${heightComp.heightDiffCm > 0 ? "+" : ""}${heightComp.heightDiffCm}cm) · 접점 ${round4(contactY).toFixed(2)}m · 척추보정 A ${actorASpinePitchDeg.toFixed(1)}° / B ${actorBSpinePitchDeg.toFixed(1)}°`;

  return Object.freeze({
    preset,
    heightDiffCm: heightComp.heightDiffCm,
    spacingMeters,
    contactAnchorWorld,
    actorA,
    actorB,
    recommendedFocalMm: preset.recommendedFocalMm,
    compensationSummaryKo,
  });
}

/* -------------------------------------------------------------------------- */
/* 4. 웹툰 컷 과장 원근(18mm~135mm) + 거리 감쇠 선화 두께 계산기                  */
/* -------------------------------------------------------------------------- */

export interface WebtoonPerspectiveAndLineWeightInput {
  /** 초점거리 18mm(만화 과장) ~ 135mm(망원 일러스트) */
  readonly focalMm: number;
  /** 카메라 ↔ 캐릭터 중심 거리 (m) */
  readonly cameraDistanceMeters: number;
  /** 기준 선화 두께 (px, 300dpi 컷 기준 기본 2.0px) */
  readonly baseStrokePx?: number;
  /** 만화 퍼스펙티브 근접 사지 과장 강도 (0..1, 기본 0.5) */
  readonly mangaExaggeration?: number;
  /** SHAPER 비등방 필압 외곽선 적용 여부 */
  readonly outlinePressure?: boolean;
  /** 캔버스 가로/세로 비율 (기본 0.75 세로 웹툰 컷) */
  readonly aspectRatio?: number;
}

export interface WebtoonPerspectiveAndLineWeightResult {
  readonly focalMm: number;
  readonly verticalFovDeg: number;
  readonly horizontalFovDeg: number;
  /** 근접 부위(주먹·검·손) 과장 원근 배율 (1.0..1.85) */
  readonly foreshorteningBoost: number;
  /** 원근 압축 지수 (0=초광각 과장, 1=망원 평면) */
  readonly telephotoCompression: number;
  /** 거리 감쇠가 반영된 실효 선화 두께 (px) */
  readonly effectiveStrokePx: number;
  /** MToon `worldCoordinates` 외곽선 폭 계수 */
  readonly worldOutlineWidthFactor: number;
  /** MToon `screenCoordinates` 외곽선 폭 계수 */
  readonly screenOutlineWidthFactor: number;
  /** 부위별 웹툰 선화 위계 배율 */
  readonly partLineMultipliers: {
    readonly faceContour: number;
    readonly hairSilhouette: number;
    readonly hairInline: number;
    readonly bodyContour: number;
    readonly foregroundLimb: number;
  };
  readonly framingHintKo: string;
}

const SENSOR_HEIGHT_MM = 24;
const SENSOR_WIDTH_MM = 36;

/**
 * 18mm~135mm 만화 퍼스펙티브(과장 원근)와 카메라 거리 감쇠 선화 두께(px · MToon 계수)를 계산한다.
 * 가까울수록 선화가 과도하게 굵어지지 않고, 멀어질수록 선화가 뭉개지지 않도록 로그·거듭제곱 감쇠를 적용한다.
 */
export function computeWebtoonPerspectiveAndLineWeight(
  input: WebtoonPerspectiveAndLineWeightInput,
): WebtoonPerspectiveAndLineWeightResult {
  const focalMm = round4(clamp(input.focalMm, 18, 135));
  const distanceM = clamp(input.cameraDistanceMeters, 0.45, 18);
  const baseStrokePx = clamp(input.baseStrokePx ?? 2.0, 0.5, 8.0);
  const exaggeration = clamp(input.mangaExaggeration ?? 0.5, 0, 1);
  const aspectRatio = clamp(input.aspectRatio ?? 0.75, 0.4, 2.4);

  const vFovRad = 2 * Math.atan(SENSOR_HEIGHT_MM / (2 * focalMm));
  const verticalFovDeg = round4((vFovRad * 180) / Math.PI);
  const hFovRad = 2 * Math.atan((SENSOR_WIDTH_MM * Math.min(1, aspectRatio)) / (2 * focalMm));
  const horizontalFovDeg = round4((hFovRad * 180) / Math.PI);

  // 18mm일 때 광각지수 1.0, 135mm일 때 0.0
  const wideFactor = clamp((50 - focalMm) / (50 - 18), 0, 1);
  const telephotoCompression = round4(clamp((focalMm - 18) / (135 - 18), 0, 1));
  const foreshorteningBoost = round4(1 + wideFactor * exaggeration * 0.85);

  // 기준 거리 2.5m에서 1.0배; 카메라 거리가 멀어질수록 지수 감쇠해 원경 선화 뭉개짐을 방지하고,
  // 망원 렌즈에서는 소폭 보정해 과도한 얇아짐을 막는다.
  const distanceAttenuation = clamp(Math.pow(2.5 / distanceM, 0.42), 0.45, 1.85);
  const lensCompensation = clamp(Math.pow(focalMm / 50, 0.12), 0.86, 1.14);
  const pressureBoost = input.outlinePressure === false ? 1.0 : 1.08;

  const effectiveStrokePx = round4(clamp(baseStrokePx * distanceAttenuation * lensCompensation * pressureBoost, 0.65, 5.2));
  const worldOutlineWidthFactor = round4(clamp(0.0018 * (effectiveStrokePx / 2.0) * Math.pow(distanceM / 2.5, 0.35), 0.0007, 0.0042));
  const screenOutlineWidthFactor = round4(clamp(0.0015 * (effectiveStrokePx / 2.0), 0.0006, 0.0032));

  const partLineMultipliers = Object.freeze({
    faceContour: round4(clamp(0.76 + (1 - wideFactor) * 0.08, 0.68, 0.9)),
    hairSilhouette: 1.0,
    hairInline: 0.35,
    bodyContour: round4(clamp(1.05 + wideFactor * 0.12, 1.0, 1.22)),
    foregroundLimb: round4(clamp(1.12 + wideFactor * exaggeration * 0.42, 1.08, 1.6)),
  });

  const framingHintKo = focalMm <= 24
    ? `${focalMm}mm 만화 과장 원근 · 전경 손/무기 ${foreshorteningBoost.toFixed(2)}× 강조 · 선화 ${effectiveStrokePx.toFixed(2)}px`
    : focalMm >= 85
      ? `${focalMm}mm 망원 인물/일러스트 · 왜곡 억제 · 섬세한 선화 ${effectiveStrokePx.toFixed(2)}px`
      : `${focalMm}mm 표준 웹툰 컷 · 거리 ${distanceM.toFixed(1)}m 감쇠 선화 ${effectiveStrokePx.toFixed(2)}px`;

  return Object.freeze({
    focalMm,
    verticalFovDeg,
    horizontalFovDeg,
    foreshorteningBoost,
    telephotoCompression,
    effectiveStrokePx,
    worldOutlineWidthFactor,
    screenOutlineWidthFactor,
    partLineMultipliers,
    framingHintKo,
  });
}
