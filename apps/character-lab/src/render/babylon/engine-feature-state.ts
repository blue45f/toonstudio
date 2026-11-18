import { describeSparseMorphReport } from "../glb-sparse-morph";
import { summarizeJointOffsets } from "../joint-offsets";
import { featureActive, featureOff, featureUnavailable } from "../scene-features";

import type { CharacterRig } from "./character-rig";
import type { SparseMorphReport } from "../glb-sparse-morph";
import type { SceneFeatureState } from "../scene-features";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager.js";

/** 지금 influence > 0인 morph 타깃 수. attribute 모드의 numInfluencers 제한과 별개로 센다. */
export function activeMorphTargets(manager: MorphTargetManager): number {
  let active = 0;
  for (let index = 0; index < manager.numTargets; index += 1) if (manager.getTarget(index).influence > 0) active += 1;
  return active;
}

/** 현재 리그의 관절 오프셋 적용 상태를 읽으며 리그를 변경하지 않는다. */
export function jointOffsetState(rig: CharacterRig | null): SceneFeatureState {
  if (!rig) return featureOff("소스가 없습니다.");
  const binding = rig.jointOffsets;
  if (!binding) return featureOff(rig.kind === "package" ? "제작 패키지에는 체형 morph 관절 오프셋이 없습니다." : "이 소스는 관절 오프셋을 주지 않아 morph만 정점에 반영됩니다.");
  const summary = summarizeJointOffsets(binding.table);
  const applied = binding.snapshot().size;
  return featureActive(`morph ${summary.morphCount}개 · 관절 ${summary.boneCount}개 · 최대 ${(summary.maxOffsetM * 1000).toFixed(0)} mm · 지금 ${applied}개 본이 옮겨짐(역바인드 재생성)`);
}

/** 마지막 GLB 내보내기 결과만 표시하며 새 내보내기를 요청하지 않는다. */
export function glbSparseState(report: SparseMorphReport | null): SceneFeatureState {
  if (!report) return featureActive("내보낼 때마다 변경량 0 정점의 morph를 sparse accessor로 정리합니다(아직 내보내지 않음).");
  if (report.unchanged) return report.morphAccessors === 0 ? featureOff("마지막 내보내기: morph target가 없어 정리할 것이 없습니다.") : featureUnavailable(`마지막 내보내기: ${describeSparseMorphReport(report)}`);
  return featureActive(`마지막 내보내기: ${describeSparseMorphReport(report)}`);
}
