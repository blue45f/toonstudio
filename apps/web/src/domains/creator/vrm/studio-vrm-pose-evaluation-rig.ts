import { VRM, VRMHumanoid } from "@pixiv/three-vrm";
import { Group, Object3D } from "three";

import { STUDIO_HUMANOID_BONE_NAMES } from "../studio-humanoid-bones";

import type { VRMHumanBones, VRMRequiredHumanBoneName } from "@pixiv/three-vrm";

/** 메시를 복제하지 않고 현재 모델의 정규화 rest 뼈대만 별도로 구성한다. */
export function createStudioVrmPoseEvaluationRig(
  source: VRM | null | undefined,
  root?: { readonly position: readonly [number, number, number]; readonly rotation: readonly [number, number, number, number] },
): VRM {
  if (!source?.humanoid?.normalizedRestPose || !source.humanoid.getNormalizedBoneNode("hips")) {
    throw new Error("포즈를 계산할 수 있는 정규화된 VRM 뼈대가 필요합니다.");
  }
  const scene = new Group();
  const clones = new Map<Object3D, Object3D>([[source.scene, scene]]);
  const copy = (node: Object3D): Object3D => {
    const found = clones.get(node);
    if (found) return found;
    const clone = new Object3D();
    clone.position.copy(node.position);
    clone.quaternion.copy(node.quaternion);
    clone.scale.copy(node.scale);
    clones.set(node, clone);
    if (node.parent) copy(node.parent).add(clone);
    else scene.add(clone);
    return clone;
  };
  const bones: Partial<VRMHumanBones> = {};
  for (const name of STUDIO_HUMANOID_BONE_NAMES) {
    const node = source.humanoid.getNormalizedBoneNode(name);
    if (!node) continue;
    const clone = copy(node);
    const rest = source.humanoid.normalizedRestPose[name];
    if (rest?.position) clone.position.fromArray(rest.position);
    if (rest?.rotation) clone.quaternion.fromArray(rest.rotation);
    bones[name] = { node: clone };
  }
  scene.updateMatrixWorld(true);
  const required = (name: VRMRequiredHumanBoneName) => {
    const bone = bones[name];
    if (!bone) throw new Error(`${name}: 포즈 계산에 필요한 VRM 관절이 없습니다.`);
    return bone;
  };
  const humanoid = new VRMHumanoid({ ...bones,
    hips: required("hips"), spine: required("spine"), head: required("head"),
    leftUpperLeg: required("leftUpperLeg"), leftLowerLeg: required("leftLowerLeg"), leftFoot: required("leftFoot"),
    rightUpperLeg: required("rightUpperLeg"), rightLowerLeg: required("rightLowerLeg"), rightFoot: required("rightFoot"),
    leftUpperArm: required("leftUpperArm"), leftLowerArm: required("leftLowerArm"), leftHand: required("leftHand"),
    rightUpperArm: required("rightUpperArm"), rightLowerArm: required("rightLowerArm"), rightHand: required("rightHand"),
  });
  scene.add(humanoid.normalizedHumanBonesRoot);
  // 정규화 rest 위치에 화면의 root 변환이 두 번 구워지지 않도록 뼈대 생성 후 적용한다.
  if (root) {
    scene.position.set(...root.position);
    scene.quaternion.set(...root.rotation);
  } else {
    scene.position.copy(source.scene.position);
    scene.quaternion.copy(source.scene.quaternion);
  }
  scene.scale.copy(source.scene.scale);
  return new VRM({ scene, humanoid, meta: source.meta });
}
