import { MathUtils, Vector3 } from "three";

import type { VRM } from "@pixiv/three-vrm";

/** 정면은 두 어깨 축에서, 바깥쪽은 같은 쪽 어깨에서 구해 월드 회전·좌우 손에 맞춘다. */
export function handReviewDirection(vrm: VRM, side: "left" | "right", azimuth: number, elevation: number): Vector3 {
  const h = vrm.humanoid;
  const opposite = side === "left" ? "right" : "left";
  const shoulder = (h.getNormalizedBoneNode(`${side}Shoulder`) ?? h.getNormalizedBoneNode(`${side}UpperArm`))?.getWorldPosition(new Vector3());
  const other = (h.getNormalizedBoneNode(`${opposite}Shoulder`) ?? h.getNormalizedBoneNode(`${opposite}UpperArm`))?.getWorldPosition(new Vector3());
  const hips = h.getNormalizedBoneNode("hips")?.getWorldPosition(new Vector3());
  const hand = h.getNormalizedBoneNode(`${side}Hand`)?.getWorldPosition(new Vector3());
  const up = shoulder && other && hips ? shoulder.clone().lerp(other, 0.5).sub(hips) : new Vector3(0, 1, 0);
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
  up.normalize();
  const outward = shoulder && other ? shoulder.clone().sub(other) : new Vector3();
  outward.addScaledVector(up, -outward.dot(up));
  if (outward.lengthSq() < 1e-8 && hand && hips) {
    outward.subVectors(hand, hips);
    outward.addScaledVector(up, -outward.dot(up));
  }
  if (outward.lengthSq() < 1e-8) outward.set(side === "left" ? 1 : -1, 0, 0);
  outward.normalize();
  const front = new Vector3().crossVectors(outward, up).multiplyScalar(side === "left" ? 1 : -1).normalize();
  const yaw = MathUtils.degToRad(azimuth);
  const pitch = MathUtils.degToRad(elevation);
  return front.multiplyScalar(Math.cos(yaw) * Math.cos(pitch))
    .addScaledVector(outward, Math.sin(yaw) * Math.cos(pitch)).addScaledVector(up, Math.sin(pitch)).normalize();
}
