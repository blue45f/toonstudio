import {
  clampStudioMannequinJointRotation,
  isStudioMannequinJointId,
  type StudioMannequinJointId,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  solveMannequinHandWristsFromDetections,
  type StudioMannequinHandDetectionInput,
} from "./studio-mannequin-hand-tracking";
import {
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import {
  solvePoseToMannequinJoints,
  type PoseLandmark,
} from "./studio-mannequin-webcam-tracking";

export interface StudioMannequinPhotoPoseLandmark {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
  readonly visibility?: number;
}

/**
 * 사진 포즈 적용 범위. 스캐너 UI의 적용 범위 선택(전신/상체/팔·손)과 같은 값이다.
 * VRM 경로는 payload.bones를 범위로 걸러 적용하지만, 데생 인형 경로는 랜드마크에서
 * 관절을 다시 풀기 때문에 이 범위를 모르면 사용자가 "상체"를 골라도 다리까지
 * 덮어쓴다. 범위 밖 관절은 현재 포즈를 그대로 유지한다.
 */
export type StudioMannequinPhotoPoseJointScope = "full" | "upper" | "arms";

const PHOTO_POSE_LEG_JOINTS: ReadonlySet<StudioMannequinJointId> = new Set([
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
]);

const PHOTO_POSE_ARM_JOINTS: ReadonlySet<StudioMannequinJointId> = new Set([
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
]);

/** 관절이 사진 포즈 적용 범위 안에 있는지. 알 수 없는 범위는 "full"로 본다. */
export function isStudioMannequinJointInPhotoPoseScope(
  jointId: StudioMannequinJointId,
  scope: StudioMannequinPhotoPoseJointScope | undefined,
): boolean {
  if (scope === "arms") return PHOTO_POSE_ARM_JOINTS.has(jointId);
  if (scope === "upper") return jointId !== "pelvis" && !PHOTO_POSE_LEG_JOINTS.has(jointId);
  return true;
}

export interface StudioMannequinPhotoPoseInput {
  readonly landmarks?: Readonly<Record<string, StudioMannequinPhotoPoseLandmark>>;
  /** Validated MediaPipe Pose world landmarks from the shared VRM photo scanner. */
  readonly mediaPipeLandmarks?: readonly PoseLandmark[];
  /**
   * Validated MediaPipe Hand detections from the shared VRM photo scanner.
   * 있으면 손목 관절(leftHand/rightHand)에 손바닥 방향을 반영한다.
   * 데생 인형의 손가락은 관절이 아니라 장식 프리미티브라 손가락 굴곡은 적용하지 않는다.
   */
  readonly handDetections?: readonly StudioMannequinHandDetectionInput[];
  readonly currentPose?: StudioMannequinPose;
  readonly mirrorMode?: boolean;
  readonly minimumVisibility?: number;
  /**
   * 스캐너에서 고른 적용 범위. mediaPipeLandmarks·handDetections에서 푼 관절에만
   * 적용되고, 호출자가 직접 준 joints는 명시 지시라 범위로 거르지 않는다.
   */
  readonly jointScope?: StudioMannequinPhotoPoseJointScope;
  readonly joints?: Readonly<Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>>;
  readonly pelvisOffset?: StudioMannequinVec3;
}

export interface StudioMannequinPhotoPoseApplyPlan {
  readonly pose: StudioMannequinPose;
  readonly appliedJoints: readonly StudioMannequinJointId[];
  readonly skippedJoints: readonly string[];
}

/**
 * Calculates joint eulers from 2D/3D body landmarks or scanned joint rotators for 3D Mannequin.
 */
export function createStudioMannequinPhotoPoseApplyPlan(
  input: StudioMannequinPhotoPoseInput,
): StudioMannequinPhotoPoseApplyPlan {
  const currentPose = normalizeStudioMannequinPose(input.currentPose ?? {
    joints: {},
    pelvisOffset: [0, 0, 0],
  });
  const joints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {
    ...currentPose.joints,
  };
  const appliedJoints: StudioMannequinJointId[] = [];
  const appliedJointSet = new Set<StudioMannequinJointId>();
  const skippedJoints: string[] = [];

  const applyJoint = (key: string, value: StudioMannequinVec3 | undefined): void => {
    if (!isStudioMannequinJointId(key) || !value) {
      skippedJoints.push(key);
      return;
    }
    const rotation = clampStudioMannequinJointRotation(key, value);
    joints[key] = rotation;
    if (!appliedJointSet.has(key)) {
      appliedJointSet.add(key);
      appliedJoints.push(key);
    }
  };

  if (input.mediaPipeLandmarks) {
    const minimumVisibility = input.minimumVisibility ?? 0.35;
    const validLandmarks = input.mediaPipeLandmarks.length === 33
      && input.mediaPipeLandmarks.every((landmark) =>
        Number.isFinite(landmark.x)
        && Number.isFinite(landmark.y)
        && Number.isFinite(landmark.z)
        && (landmark.visibility === undefined
          || (Number.isFinite(landmark.visibility)
            && landmark.visibility >= 0
            && landmark.visibility <= 1)))
      && Number.isFinite(minimumVisibility)
      && minimumVisibility >= 0
      && minimumVisibility <= 1;

    if (!validLandmarks) {
      skippedJoints.push("mediaPipeLandmarks");
    } else {
      const solved = solvePoseToMannequinJoints(input.mediaPipeLandmarks, {
        mirrorMode: input.mirrorMode ?? false,
        minVisibility: minimumVisibility,
      });
      for (const [key, value] of Object.entries(solved)) {
        if (
          isStudioMannequinJointId(key)
          && !isStudioMannequinJointInPhotoPoseScope(key, input.jointScope)
        ) {
          // 범위 밖 관절은 건너뛰고 현재 포즈를 유지한다(스킵으로 보고).
          skippedJoints.push(key);
          continue;
        }
        applyJoint(key, value);
      }
    }
  }

  if (input.joints) {
    for (const [key, value] of Object.entries(input.joints)) {
      applyJoint(key, value);
    }
  }

  if (input.handDetections && input.handDetections.length > 0) {
    // 사진은 "있는 그대로 복사" 경로라 미러 반사를 적용하지 않는다.
    const hands = solveMannequinHandWristsFromDetections(input.handDetections);
    for (const side of hands.skippedSides) {
      skippedJoints.push(`${side}Hand`);
    }
    for (const [jointId, euler] of Object.entries(hands.wrists)) {
      applyJoint(jointId, euler);
    }
  }

  if (input.landmarks) {
    const lm = input.landmarks;
    const getLm = (name: string) => lm[name];

    const leftShoulder = getLm("leftShoulder") ?? getLm("11");
    const leftElbow = getLm("leftElbow") ?? getLm("13");
    const leftWrist = getLm("leftWrist") ?? getLm("15");

    if (leftShoulder && leftElbow) {
      const dx = leftElbow.x - leftShoulder.x;
      const dy = leftElbow.y - leftShoulder.y;
      const angleZ = Math.atan2(dy, dx);
      joints.leftUpperArm = clampStudioMannequinJointRotation("leftUpperArm", [
        0,
        0,
        Math.min(2.5, Math.max(-0.5, angleZ)),
      ]);
      appliedJoints.push("leftUpperArm");
    }

    if (leftElbow && leftWrist) {
      const dx = leftWrist.x - leftElbow.x;
      const dy = leftWrist.y - leftElbow.y;
      const flex = Math.min(0, -Math.abs(Math.atan2(dy, dx)));
      joints.leftLowerArm = clampStudioMannequinJointRotation("leftLowerArm", [flex, 0, 0]);
      appliedJoints.push("leftLowerArm");
    }

    const rightShoulder = getLm("rightShoulder") ?? getLm("12");
    const rightElbow = getLm("rightElbow") ?? getLm("14");
    const rightWrist = getLm("rightWrist") ?? getLm("16");

    if (rightShoulder && rightElbow) {
      const dx = rightElbow.x - rightShoulder.x;
      const dy = rightElbow.y - rightShoulder.y;
      const angleZ = Math.atan2(dy, -dx);
      joints.rightUpperArm = clampStudioMannequinJointRotation("rightUpperArm", [
        0,
        0,
        Math.max(-2.5, Math.min(0.5, -angleZ)),
      ]);
      appliedJoints.push("rightUpperArm");
    }

    if (rightElbow && rightWrist) {
      const dx = rightWrist.x - rightElbow.x;
      const dy = rightWrist.y - rightElbow.y;
      const flex = Math.min(0, -Math.abs(Math.atan2(dy, dx)));
      joints.rightLowerArm = clampStudioMannequinJointRotation("rightLowerArm", [flex, 0, 0]);
      appliedJoints.push("rightLowerArm");
    }
  }

  const pose = normalizeStudioMannequinPose({
    joints,
    pelvisOffset: input.pelvisOffset ?? currentPose.pelvisOffset,
  });

  return Object.freeze({
    pose,
    appliedJoints: Object.freeze(appliedJoints),
    skippedJoints: Object.freeze(skippedJoints),
  });
}
