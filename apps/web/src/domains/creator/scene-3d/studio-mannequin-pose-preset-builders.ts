/**
 * Studio 3D 데생 인형 — 포즈 프리셋 저작 헬퍼(각도·포즈 생성).
 *
 * 프리셋 표(part A/B)가 공유하는 순수 생성 함수다.
 */

import type { StudioMannequinJointId, StudioMannequinVec3 } from "./studio-mannequin-model";
import type { StudioMannequinPose } from "./studio-mannequin-poses";

export type MannequinPoseJointMap = Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>;

export function deg3(x: number, y: number, z: number): StudioMannequinVec3 {
  return [(x * Math.PI) / 180, (y * Math.PI) / 180, (z * Math.PI) / 180];
}

export function pose(
  joints: MannequinPoseJointMap,
  pelvisOffset: StudioMannequinVec3 = [0, 0, 0],
): StudioMannequinPose {
  return { joints, pelvisOffset };
}
