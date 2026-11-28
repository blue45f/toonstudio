import * as THREE from "three";

import type { GarmentPart } from "./studio-vrm-wardrobe";

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

/** 재단 때 측정한 좌우·깊이 단면을 원본 VRM 본의 로컬 좌표로 돌려놓는다. */
export function studioVrmGarmentPartMatrix(part: GarmentPart): THREE.Matrix4 {
  const rotation = new THREE.Quaternion();
  if (part.align) {
    const up = new THREE.Vector3(...part.align).normalize();
    const left = part.forward ? up.clone().cross(new THREE.Vector3(...part.forward)) : null;
    if (left && left.lengthSq() > 1e-8) {
      left.normalize();
      rotation.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, left.clone().cross(up)));
    } else if (up.lengthSq() > 1e-8) {
      rotation.setFromUnitVectors(part.shape.kind === "torus" ? FORWARD : UP, up);
    }
  }
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...part.offset), rotation,
    part.squash ? new THREE.Vector3(...part.squash) : new THREE.Vector3(1, 1, 1),
  );
}
