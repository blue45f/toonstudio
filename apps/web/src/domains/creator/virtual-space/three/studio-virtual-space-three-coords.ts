import * as THREE from "three";

import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";

/** 2D 월드 좌표(3072×1984 px)를 3D 미터 단위로 변환하는 비율 (32px = 1m). */
export const STUDIO_THREE_SCALE = 1 / 32;

export function worldToThree(point: StudioVirtualSpacePoint, y = 0): THREE.Vector3 {
  return new THREE.Vector3(point.x * STUDIO_THREE_SCALE, y, point.y * STUDIO_THREE_SCALE);
}

export function threeToWorld(vec: { readonly x: number; readonly z: number }): StudioVirtualSpacePoint {
  return {
    x: Math.round(vec.x / STUDIO_THREE_SCALE),
    y: Math.round(vec.z / STUDIO_THREE_SCALE),
  };
}
