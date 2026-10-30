/** 실제 카메라 → 머리의 현재 자세 → 안구 본. 하이라이트용 가상 카메라·조명 값은 쓰지 않는다. */
import { eyeAnglesFromDirection, eyeAnglesQuaternion } from "../../contracts/eye-gaze";
import { IDENTITY_QUAT } from "../../contracts/pose";
import { qConjugate, qMultiply, qRotateVec3, v3Sub } from "../../shared/math";

import { applyBoneRotation, rigBoneWorld } from "./character-rig";
import { fromQuaternion } from "./convert";
import { eyeGeometryUnavailableReason } from "./eye-geometry-support";

import type { CharacterRig, RigBone } from "./character-rig";
import type { EyeGaze, EyeGazeReading } from "../../contracts/eye-gaze";
import type { Vec3 } from "../../contracts/pose";

/** 머리·부모의 현재 포즈를 지운 모델 기준에서 시선을 계산한다. 제작 패키지의 비항등 rest 회전도 보존한다. */
export function applyRigEyeGaze(rig: CharacterRig, gaze: EyeGaze | undefined, cameraPosition: Vec3): void {
  if (!gaze || gaze.frozenPose) return;
  for (const name of ["leftEye", "rightEye"] as const) {
    const eye = rig.humanoid.get(name);
    if (!eye) continue;
    const parent = eye.parentName ? rig.bones.get(eye.parentName) : undefined;
    const parentDelta = parent ? qMultiply(rigBoneWorld(parent).rotation, qConjugate(parent.restWorld)) : IDENTITY_QUAT;
    const direction = qRotateVec3(qConjugate(parentDelta), v3Sub(cameraPosition, rigBoneWorld(eye).position));
    const angles = gaze.mode === "camera" ? eyeAnglesFromDirection(direction) : gaze[name === "leftEye" ? "left" : "right"];
    const modelPose = eyeAnglesQuaternion(angles);
    const pose = rig.poseConvention === "bone-local" ? qMultiply(qMultiply(qConjugate(eye.restWorld), modelPose), eye.restWorld) : modelPose;
    applyBoneRotation(rig, eye, pose);
  }
}

function eyePose(rig: CharacterRig, eye: RigBone) {
  const localDelta = qMultiply(fromQuaternion(eye.node.rotationQuaternion), qConjugate(eye.restLocal));
  const parent = eye.parentName ? rig.bones.get(eye.parentName) : undefined;
  const rp = parent?.restWorld ?? IDENTITY_QUAT;
  return rig.poseConvention === "bone-local"
    ? qMultiply(qConjugate(eye.restLocal), fromQuaternion(eye.node.rotationQuaternion))
    : qMultiply(qMultiply(rp, localDelta), qConjugate(rp));
}

function eyeAngles(rig: CharacterRig, eye: RigBone) {
  const pose = eyePose(rig, eye);
  const modelPose = rig.poseConvention === "bone-local" ? qMultiply(qMultiply(eye.restWorld, pose), qConjugate(eye.restWorld)) : pose;
  return eyeAnglesFromDirection(qRotateVec3(modelPose, [0, 0, 1]));
}

export function readRigEyeGaze(rig: CharacterRig | null): EyeGazeReading {
  const reasonKo = eyeGeometryUnavailableReason(rig);
  if (reasonKo) return { status: "unavailable", reasonKo };
  const left = rig?.humanoid.get("leftEye"), right = rig?.humanoid.get("rightEye");
  return rig && left && right
    ? { status: "available", left: eyeAngles(rig, left), right: eyeAngles(rig, right), frozenPose: { leftEye: eyePose(rig, left), rightEye: eyePose(rig, right) } }
    : { status: "unavailable", reasonKo: "현재 소스에 매핑된 좌·우 안구 본이 모두 필요합니다." };
}

export function createEyeGazeController(rig: () => CharacterRig | null, gaze: () => EyeGaze | undefined, camera: () => Vec3) {
  let holds = 0;
  const update = (): void => { const current = rig(); if (current && holds === 0) applyRigEyeGaze(current, gaze(), camera()); };
  const hold = (): (() => void) => { update(); holds += 1; return () => { holds -= 1; }; };
  return {
    update,
    hold,
    read: (): EyeGazeReading => readRigEyeGaze(rig()),
    async freeze<T>(task: () => Promise<T>): Promise<T> {
      const release = hold();
      try { return await task(); } finally { release(); }
    },
  };
}
