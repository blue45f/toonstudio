import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager.js";

/** 지금 influence > 0인 morph 타깃 수. `numInfluencers`는 attribute 모드에서 8개로 잘려 있어 초과분(무시되는 타깃)을 셀 수 없다. */
export function activeMorphTargets(manager: MorphTargetManager): number {
  let active = 0;
  for (let index = 0; index < manager.numTargets; index += 1) if (manager.getTarget(index).influence > 0) active += 1;
  return active;
}
