import { indexBones } from "../../../animation/skeleton-fk";
import { isHumanoidBoneName } from "../../../contracts";
import {
  diagnoseSkeletonData,
  reportBoundaryFailure,
  safeComputeWorldTransforms,
  type SkeletonBoundaryOptions,
} from "./skeleton-boundary-guard";

import type { HumanoidBoneName, Pose, SkeletonData, Vec3 } from "../../../contracts";

export interface DragPivot {
  /** 실제로 회전하는 본(핸들 본의 부모, 루트면 자기 자신) */
  readonly pivotBone: HumanoidBoneName;
  /** 피벗의 월드 원점(현재 포즈 기준 FK) */
  readonly pivotWorld: Vec3;
}

/**
 * 핸들 본에서 드래그 피벗을 정한다. 스켈레톤에서 부모 사슬을 거슬러 처음 만나는 휴머노이드 본이 피벗이다
 * (보조 본은 건너뛴다). 휴머노이드 본이 아니거나 스켈레톤에 없으면 null, 손상 스켈레톤이면 진단 후 null.
 */
export function resolveDragPivot(
  skeleton: SkeletonData,
  pose: Pose,
  handleBone: HumanoidBoneName,
  options?: SkeletonBoundaryOptions,
): DragPivot | null {
  const precheck = diagnoseSkeletonData(skeleton, options?.now);
  if (precheck) {
    reportBoundaryFailure(precheck, options);
    return null;
  }
  const byName = indexBones(skeleton);
  const handle = byName.get(handleBone);
  if (!handle) return null;
  const visited = new Set<string>([handleBone]);
  let pivot = handle.parent !== null ? byName.get(handle.parent) : undefined;
  while (pivot && !isHumanoidBoneName(pivot.name)) {
    if (visited.has(pivot.name)) return null;
    visited.add(pivot.name);
    pivot = pivot.parent !== null ? byName.get(pivot.parent) : undefined;
  }
  const pivotName = pivot?.name ?? handleBone;
  if (!isHumanoidBoneName(pivotName)) return null;
  const fkResult = safeComputeWorldTransforms(skeleton, pose, options);
  if (!fkResult.ok) return null;
  const world = fkResult.transforms.get(pivotName);
  if (!world) return null;
  return { pivotBone: pivotName, pivotWorld: [...world.position] };
}
