/**
 * Studio 3D 데생 인형 — 손 전용 2단계 컨트롤러 (순수 포즈 모델).
 *
 * Design Doll 식 손 편집을 데생 인형 관절 계약(손목 관절만으로 손을 표현)에 맞게 옮긴 것.
 *
 * - 1단계 "크게 잡기(coarse)": 손 모양 프리셋을 골라 손목 관절만 현재 포즈 위에 얹는다.
 *   기존 손 프리셋 적용은 포즈 전체 교체라 몸 포즈가 날아갔다. 이 모듈은 손목 관절만
 *   교체하므로 몸 포즈·골반 오프셋·팔 관절을 절대 건드리지 않는 것이 계약이다.
 * - 2단계 "세부 조정(fine)": 1단계 결과 위에서 손목 3축(굽히기 X·비틀기 Y·기울이기 Z)을
 *   도(°) 단위 델타로 조금씩 더한다. 모든 결과는 관절 한계 클램프 + 정규화를 거친다.
 *
 * Three.js import 없음 — 결정적이고 단위 테스트 가능하다.
 */

import {
  clampStudioMannequinJointRotation,
  type StudioMannequinJointId,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";

export type StudioMannequinHandSide = "left" | "right";

/** 컨트롤러가 대상으로 삼는 손. "both"는 1단계 기본값(양손 동시 적용). */
export type StudioMannequinHandSideSelection = StudioMannequinHandSide | "both";

/** 손(side) → 손목 관절 id. 데생 인형에서 손 모양은 이 관절 회전으로만 표현된다. */
export const STUDIO_MANNEQUIN_HAND_JOINT_BY_SIDE = Object.freeze({
  left: "leftHand",
  right: "rightHand",
} as const satisfies Record<StudioMannequinHandSide, StudioMannequinJointId>);

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const IDENTITY_ROTATION: StudioMannequinVec3 = [0, 0, 0];

export function otherStudioMannequinHandSide(
  side: StudioMannequinHandSide,
): StudioMannequinHandSide {
  return side === "left" ? "right" : "left";
}

function sidesOf(selection: StudioMannequinHandSideSelection): readonly StudioMannequinHandSide[] {
  return selection === "both" ? ["left", "right"] : [selection];
}

/** 현재 포즈에서 한쪽 손목의 유효 회전(rad). 관절이 생략돼 있으면 항등 회전이다. */
export function getStudioMannequinHandRotation(
  pose: StudioMannequinPose,
  side: StudioMannequinHandSide,
): StudioMannequinVec3 {
  const rotation = pose.joints[STUDIO_MANNEQUIN_HAND_JOINT_BY_SIDE[side]];
  return rotation ? [rotation[0], rotation[1], rotation[2]] : [...IDENTITY_ROTATION];
}

/** 손목 회전을 도(°) 축 값으로 읽는다 — 2단계 슬라이더 표시·테스트용. */
export function getStudioMannequinHandRotationDeg(
  pose: StudioMannequinPose,
  side: StudioMannequinHandSide,
): { readonly bendDeg: number; readonly twistDeg: number; readonly tiltDeg: number } {
  const rotation = getStudioMannequinHandRotation(pose, side);
  return {
    bendDeg: rotation[0] * RAD_TO_DEG,
    twistDeg: rotation[1] * RAD_TO_DEG,
    tiltDeg: rotation[2] * RAD_TO_DEG,
  };
}

/**
 * 1단계(크게 잡기): 손 모양 프리셋의 손목 관절만 현재 포즈에 얹는다.
 *
 * - 선택한 손(side)의 손목 관절만 프리셋 값으로 교체한다. 프리셋이 그 관절을 생략했으면
 *   항등 회전(펴진 손 기준)으로 되돌린다.
 * - 손목 이외의 모든 관절과 골반 오프셋은 base 를 그대로 유지한다(몸 포즈 보존 계약).
 */
export function applyStudioMannequinHandPresetToPose(
  base: StudioMannequinPose,
  presetPose: StudioMannequinPose,
  side: StudioMannequinHandSideSelection = "both",
): StudioMannequinPose {
  const joints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {
    ...base.joints,
  };
  for (const target of sidesOf(side)) {
    const jointId = STUDIO_MANNEQUIN_HAND_JOINT_BY_SIDE[target];
    const presetRotation = presetPose.joints[jointId] ?? IDENTITY_ROTATION;
    joints[jointId] = clampStudioMannequinJointRotation(jointId, presetRotation);
  }
  return normalizeStudioMannequinPose({ joints, pelvisOffset: base.pelvisOffset });
}

/** 2단계(세부 조정) 델타. 축 의미: bend=X(굽히기/젖히기), twist=Y(비틀기), tilt=Z(옆 기울이기). */
export interface StudioMannequinHandFineDeltaDeg {
  readonly bendDeg?: number;
  readonly twistDeg?: number;
  readonly tiltDeg?: number;
}

function finiteDelta(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * 2단계(세부 조정): 한쪽 손목 회전에 도(°) 델타를 더한다.
 * 결과는 관절 한계로 클램프되고, 손목 이외의 관절·골반 오프셋은 변하지 않는다.
 */
export function offsetStudioMannequinHandRotation(
  base: StudioMannequinPose,
  side: StudioMannequinHandSide,
  delta: StudioMannequinHandFineDeltaDeg,
): StudioMannequinPose {
  const jointId = STUDIO_MANNEQUIN_HAND_JOINT_BY_SIDE[side];
  const current = getStudioMannequinHandRotation(base, side);
  const next = clampStudioMannequinJointRotation(jointId, [
    current[0] + finiteDelta(delta.bendDeg) * DEG_TO_RAD,
    current[1] + finiteDelta(delta.twistDeg) * DEG_TO_RAD,
    current[2] + finiteDelta(delta.tiltDeg) * DEG_TO_RAD,
  ]);
  return normalizeStudioMannequinPose({
    joints: { ...base.joints, [jointId]: next },
    pelvisOffset: base.pelvisOffset,
  });
}

/**
 * 한쪽 손목 회전을 반대쪽 손에 복사한다. 부호 규칙은 하우스 미러 계약
 * (YZ 평면 반사 = X 유지, Y/Z 부호 반전)과 동일하다.
 */
export function mirrorStudioMannequinHandToOtherSide(
  base: StudioMannequinPose,
  fromSide: StudioMannequinHandSide,
): StudioMannequinPose {
  const targetSide = otherStudioMannequinHandSide(fromSide);
  const targetJointId = STUDIO_MANNEQUIN_HAND_JOINT_BY_SIDE[targetSide];
  const source = getStudioMannequinHandRotation(base, fromSide);
  const mirrored = clampStudioMannequinJointRotation(targetJointId, [
    source[0],
    -source[1],
    -source[2],
  ]);
  return normalizeStudioMannequinPose({
    joints: { ...base.joints, [targetJointId]: mirrored },
    pelvisOffset: base.pelvisOffset,
  });
}
