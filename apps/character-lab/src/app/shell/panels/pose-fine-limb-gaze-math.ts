/**
 * P2-17 포즈 세부 관절 편집용 순수 회전·좌우 반전 계산 헬퍼.
 * 손(손가락 30본 + 손목 2본), 발(발목 2본 + 발끝 2본), 시선(`EyeGaze` ±25°) 계산을 분리해 테스트 가능성과 파일 크기 규약을 지킨다.
 */
import {
  anklePitch,
  fingerCurl,
  fingerSpread,
  rotX,
  rotZ,
  seq,
  sideSign,
  thumbCurl,
  thumbSpread,
  wristDeviate,
  wristFlex,
  type Side,
} from "../../../animation";
import {
  EYE_GAZE_LIMIT_DEG,
  LEFT_FINGER_BONE_NAMES,
  RIGHT_FINGER_BONE_NAMES,
  resolveEyeGaze,
} from "../../../contracts";
import { clamp } from "../../../shared/math";

import { mirrorHumanoidPoseLeftRight } from "./pose-panel-helpers";

import type { CharacterRecipe, EyeGaze, HumanoidBoneName, Pose, Quat } from "../../../contracts";

export type FootSide = "both" | "left" | "right";
export const FOOT_SIDES: readonly FootSide[] = ["both", "left", "right"];
export const FOOT_SIDE_LABELS_KO: Readonly<Record<FootSide, string>> = {
  both: "양발",
  left: "왼발",
  right: "오른발",
};

export type GazeControlMode = "conjugate" | "independent" | "symmetry" | "camera";

export interface HandSlidersState {
  readonly curlDeg: number;
  readonly spreadDeg: number;
  readonly wristFlexDeg: number;
  readonly wristDeviateDeg: number;
}

export interface FootSlidersState {
  readonly anklePitchDeg: number;
  readonly ankleRollDeg: number;
  readonly toeLiftDeg: number;
}

export const DEFAULT_HAND_SLIDERS: HandSlidersState = {
  curlDeg: 0,
  spreadDeg: 0,
  wristFlexDeg: 0,
  wristDeviateDeg: 0,
};

export const DEFAULT_FOOT_SLIDERS: FootSlidersState = {
  anklePitchDeg: 0,
  ankleRollDeg: 0,
  toeLiftDeg: 0,
};

const FOUR_FINGERS = ["Index", "Middle", "Ring", "Little"] as const;
export const ARM_UPPER_BONES: readonly HumanoidBoneName[] = [
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
];
export const LEG_UPPER_BONES: readonly HumanoidBoneName[] = [
  "hips",
  "leftUpperLeg",
  "leftLowerLeg",
  "rightUpperLeg",
  "rightLowerLeg",
];

function isNonIdentity(q: Quat): boolean {
  return Math.abs(q[0]) > 1e-9 || Math.abs(q[1]) > 1e-9 || Math.abs(q[2]) > 1e-9;
}

export function buildSingleHandFinePose(side: Side, sliders: HandSlidersState): Pose {
  const out: Partial<Record<HumanoidBoneName, Quat>> = {};
  const put = (bone: HumanoidBoneName, q: Quat): void => {
    if (isNonIdentity(q)) out[bone] = q;
  };
  const wrist = seq(wristDeviate(side, sliders.wristDeviateDeg), wristFlex(side, sliders.wristFlexDeg));
  put(`${side}Hand`, wrist);

  const thumbMeta = seq(thumbSpread(side, sliders.spreadDeg * 0.9), thumbCurl(side, sliders.curlDeg * 0.45));
  put(`${side}ThumbMetacarpal`, thumbMeta);
  put(`${side}ThumbProximal`, thumbCurl(side, sliders.curlDeg * 0.55));
  put(`${side}ThumbDistal`, thumbCurl(side, sliders.curlDeg * 0.4));

  const spreadWeights: Readonly<Record<(typeof FOUR_FINGERS)[number], number>> = {
    Index: 0.75,
    Middle: 0.15,
    Ring: -0.45,
    Little: -0.9,
  };
  for (const finger of FOUR_FINGERS) {
    const spread = sliders.spreadDeg * spreadWeights[finger];
    put(`${side}${finger}Proximal`, seq(fingerSpread(side, spread), fingerCurl(side, sliders.curlDeg * 0.95)));
    put(`${side}${finger}Intermediate`, fingerCurl(side, sliders.curlDeg));
    put(`${side}${finger}Distal`, fingerCurl(side, sliders.curlDeg * 0.7));
  }
  return out;
}

export function buildSingleFootFinePose(side: Side, sliders: FootSlidersState): Pose {
  const out: Partial<Record<HumanoidBoneName, Quat>> = {};
  const put = (bone: HumanoidBoneName, q: Quat): void => {
    if (isNonIdentity(q)) out[bone] = q;
  };
  const footRot = seq(rotZ(-sideSign(side) * sliders.ankleRollDeg), anklePitch(sliders.anklePitchDeg));
  put(`${side}Foot`, footRot);
  put(`${side}Toes`, rotX(-sliders.toeLiftDeg));
  return out;
}

export function mirrorHandsOnlyPose(recipe: CharacterRecipe): Pose {
  const combined: Partial<Record<HumanoidBoneName, Quat>> = {
    ...recipe.pose,
    ...recipe.handPose.left,
    ...recipe.handPose.right,
  };
  const handSource: Partial<Record<HumanoidBoneName, Quat>> = {};
  const handBones: readonly HumanoidBoneName[] = [
    "leftHand",
    ...LEFT_FINGER_BONE_NAMES,
    "rightHand",
    ...RIGHT_FINGER_BONE_NAMES,
  ];
  for (const bone of handBones) {
    const q = combined[bone];
    if (q) handSource[bone] = q;
  }
  const mirroredHands = mirrorHumanoidPoseLeftRight(handSource);
  const nextArmsHands: Partial<Record<HumanoidBoneName, Quat>> = {};
  for (const bone of ARM_UPPER_BONES) {
    const q = recipe.pose[bone];
    if (q) nextArmsHands[bone] = q;
  }
  for (const bone of handBones) {
    const q = mirroredHands[bone];
    if (q) nextArmsHands[bone] = q;
  }
  return nextArmsHands;
}

export function mirrorFeetOnlyPose(pose: Pose): Pose {
  const footBones: readonly HumanoidBoneName[] = ["leftFoot", "leftToes", "rightFoot", "rightToes"];
  const footSource: Partial<Record<HumanoidBoneName, Quat>> = {};
  for (const bone of footBones) {
    const q = pose[bone];
    if (q) footSource[bone] = q;
  }
  const mirroredFeet = mirrorHumanoidPoseLeftRight(footSource);
  const nextLower: Partial<Record<HumanoidBoneName, Quat>> = {};
  for (const bone of LEG_UPPER_BONES) {
    const q = pose[bone];
    if (q) nextLower[bone] = q;
  }
  for (const bone of footBones) {
    const q = mirroredFeet[bone];
    if (q) nextLower[bone] = q;
  }
  return nextLower;
}

export function mirrorEyeGazeLeftRight(gaze: EyeGaze): EyeGaze {
  const resolved = resolveEyeGaze(gaze);
  if (resolved.mode === "camera") {
    return resolved;
  }
  if (resolved.symmetry) {
    return resolveEyeGaze({
      mode: "manual",
      symmetry: true,
      left: {
        yawDeg: clamp(-resolved.left.yawDeg, -EYE_GAZE_LIMIT_DEG, EYE_GAZE_LIMIT_DEG),
        pitchDeg: resolved.left.pitchDeg,
      },
      right: resolved.right,
    });
  }
  return {
    mode: "manual",
    symmetry: false,
    left: {
      yawDeg: clamp(-resolved.right.yawDeg, -EYE_GAZE_LIMIT_DEG, EYE_GAZE_LIMIT_DEG),
      pitchDeg: resolved.right.pitchDeg,
    },
    right: {
      yawDeg: clamp(-resolved.left.yawDeg, -EYE_GAZE_LIMIT_DEG, EYE_GAZE_LIMIT_DEG),
      pitchDeg: resolved.left.pitchDeg,
    },
  };
}

export function deriveGazeControlMode(gaze: EyeGaze): GazeControlMode {
  if (gaze.mode === "camera") return "camera";
  if (gaze.symmetry) return "symmetry";
  if (gaze.left.yawDeg === gaze.right.yawDeg && gaze.left.pitchDeg === gaze.right.pitchDeg) {
    return "conjugate";
  }
  return "independent";
}
