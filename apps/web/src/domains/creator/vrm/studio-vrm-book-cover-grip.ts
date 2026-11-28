import { Euler, Matrix4, Vector3 } from "three";

import type { VrmPropRigMetrics } from "./studio-vrm-prop-rig";
import type { PropHandBone } from "./studio-vrm-props";

/** 책등을 검지·중지 첫 마디 쪽으로 옮겨 두꺼운 표지가 손가락 뿌리 안으로 파고들지 않게 한다. */
export function fitBookCoverToHand(
  hand: PropHandBone, metrics: VrmPropRigMetrics, unitsPerMeter: number, scale: number,
  offset: Vector3, x: Vector3, y: Vector3, z: Vector3,
) {
  const side = hand === "leftHand" ? "left" : "right";
  const positions = metrics.boneWorldPositions;
  const lengths = (["Index", "Middle"] as const).map(digit => {
    const base = positions[`${side}${digit}Proximal`];
    const next = positions[`${side}${digit}Intermediate`];
    return base && next ? new Vector3(...base).distanceTo(new Vector3(...next)) : 0;
  });
  if (lengths.some(length => length < 1e-4)) return;
  const firstJointLength = (lengths[0]! + lengths[1]!) * 0.5 * unitsPerMeter;
  offset.addScaledVector(x, 0.8 * firstJointLength).addScaledVector(z, 0.006 * scale * unitsPerMeter);
  const palmBasis = new Matrix4().makeBasis(x, y, z);
  // 책등의 긴 축은 검지에서 새끼손가락 쪽으로 내려가는 손가락 뿌리의 사선을 따른다.
  const cant = (side === "left" ? -1 : 1) * Math.PI / 45;
  palmBasis.multiply(new Matrix4().makeRotationFromEuler(new Euler(cant, -2 * Math.PI / 45, 0)));
  x.setFromMatrixColumn(palmBasis, 0);
  y.setFromMatrixColumn(palmBasis, 1);
  z.setFromMatrixColumn(palmBasis, 2);
}

function roundedBookPartDistance(x: number, y: number, z: number, halfWidth: number, bevel: number, scale: number) {
  const dx = Math.abs(x) - (halfWidth - bevel) * scale;
  const dy = y - (0.107 - bevel) * scale;
  const dz = z - (0.022 - bevel) * scale;
  return Math.hypot(Math.max(0, dx), Math.max(0, dy), Math.max(0, dz))
    + Math.min(0, Math.max(dx, dy, dz)) - bevel * scale;
}

/** everyday_book의 표지와 책등은 모서리 반경이 서로 다르다. 음수이면 책의 외피 안쪽이다. */
export function bookCoverDistance(point: Vector3, anchorX: number, anchorY: number, scale: number) {
  const x = point.x + anchorX * scale;
  const y = Math.abs(point.y + anchorY * scale);
  const z = Math.abs(point.z);
  const cover = roundedBookPartDistance(x, y, z, 0.079, 0.00336, scale);
  // 책등의 오른쪽 경계 너머에서는 같은 높이·두께의 표지가 항상 더 가깝다.
  if (x >= -0.066 * scale) return cover;
  const spine = roundedBookPartDistance(x + 0.075 * scale, y, z, 0.009, 0.007, scale);
  return Math.min(cover, spine);
}
