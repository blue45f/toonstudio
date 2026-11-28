import * as THREE from "three";

import { resolveVrmForwardAxisFromVrm } from "./vrm-forward-axis-normalizer";
import type { PoseBoneMap } from "./studio-vrm-poser-utils";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

const TORSO_BONES = ["hips", "spine", "chest", "upperChest", "neck", "head"] as const;

/** 프리셋의 정면(+Z) 기준 몸통 회전을 모델의 정규화 본 로컬 좌표로 옮긴다. */
export function retargetStudioVrmPresetTorso(
  vrm: VRM | null | undefined,
  bones: PoseBoneMap,
  appliedBones?: readonly VRMHumanBoneName[],
): PoseBoneMap {
  const yaw = -resolveVrmForwardAxisFromVrm(vrm).recommendedBaseRotationY;
  if (yaw === 0) return bones;
  const toModel = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const toPreset = toModel.clone().invert();
  const result = { ...bones };
  for (const bone of TORSO_BONES) {
    const rotation = bones[bone]?.rotation;
    if (!rotation || (appliedBones && !appliedBones.includes(bone))) continue;
    const local = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation, "XYZ"));
    const { x, y, z } = new THREE.Euler().setFromQuaternion(local.premultiply(toModel).multiply(toPreset), "XYZ");
    result[bone] = { ...bones[bone], rotation: [x, y, z] };
  }
  return result;
}
