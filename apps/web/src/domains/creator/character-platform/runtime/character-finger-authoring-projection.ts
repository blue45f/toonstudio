import { Euler, Quaternion } from "three";

import { getStudioHumanoidBoneDescriptor, isStudioHumanoidBoneName } from "../../studio-humanoid-bones";
import { resolveFingerAdductPolarity, resolveFingerCurlPolarity } from "../../vrm/studio-vrm-poser-utils";
import { createCharacterPoseEvaluationVrm } from "./character-pose-preset-document";

import type { VRM } from "@pixiv/three-vrm";
import type { FingerRotationMap } from "../../vrm/studio-vrm-poser-utils";
import type { CharacterPoseDocumentV3 } from "../pose-v3/character-pose-v3";

/** V3의 모델 축 회전을 기존 저장 형식의 저작 축으로 되돌린다. 실제 모델은 건드리지 않는다. */
export function projectCharacterFingerAuthoringEdits(
  source: VRM,
  pose: CharacterPoseDocumentV3,
  fallback: FingerRotationMap,
): FingerRotationMap {
  const normalized: FingerRotationMap = {};
  for (const [name, rotation] of Object.entries(pose.bones)) {
    if (!isStudioHumanoidBoneName(name) || getStudioHumanoidBoneDescriptor(name).region !== "finger") continue;
    const euler = new Euler().setFromQuaternion(new Quaternion(...rotation), "XYZ");
    normalized[name] = [euler.x, euler.y, euler.z];
  }
  if (!Object.keys(normalized).length) return fallback;
  const isolated = createCharacterPoseEvaluationVrm(source, pose);
  const result: FingerRotationMap = { ...fallback };
  for (const side of ["left", "right"] as const) {
    const curl = resolveFingerCurlPolarity(isolated, normalized, side);
    const adduct = resolveFingerAdductPolarity(isolated, normalized, side);
    for (const [name, rotation] of Object.entries(normalized)) {
      if (!rotation || !isStudioHumanoidBoneName(name) || !name.startsWith(side)) continue;
      result[name] = [rotation[0], rotation[1] * (name.includes("Thumb") ? -adduct : adduct), rotation[2] * curl];
    }
  }
  return result;
}
