/** 리그·최근 GLB 내보내기 결과를 UI에 표시할 기능 상태로 설명한다. */
import { describeSparseMorphReport } from "../glb-sparse-morph";
import { summarizeJointOffsets } from "../joint-offsets";
import { featureActive, featureOff, featureUnavailable } from "../scene-features";

import type { CharacterRig } from "./character-rig";
import type { SparseMorphReport } from "../glb-sparse-morph";
import type { SceneFeatureState } from "../scene-features";

export function describeJointOffsetState(rig: CharacterRig | null): SceneFeatureState {
  if (!rig) return featureOff("소스가 없습니다.");
  const binding = rig.jointOffsets;
  if (!binding) return featureOff(rig.kind === "package" ? "제작 패키지에는 체형 morph 관절 오프셋이 없습니다." : "이 소스는 관절 오프셋을 주지 않아 morph만 정점에 반영됩니다.");
  const summary = summarizeJointOffsets(binding.table);
  const applied = binding.snapshot().size;
  return featureActive(`morph ${summary.morphCount}개 · 관절 ${summary.boneCount}개 · 최대 ${(summary.maxOffsetM * 1000).toFixed(0)} mm · 지금 ${applied}개 본이 옮겨짐(역바인드 재생성)`);
}

export function describeGlbSparseState(report: SparseMorphReport | null): SceneFeatureState {
  if (!report) return featureActive("내보낼 때마다 변경량 0 정점의 morph를 sparse accessor로 정리합니다(아직 내보내지 않음).");
  if (report.unchanged) return report.morphAccessors === 0 ? featureOff("마지막 내보내기: morph target가 없어 정리할 것이 없습니다.") : featureUnavailable(`마지막 내보내기: ${describeSparseMorphReport(report)}`);
  return featureActive(`마지막 내보내기: ${describeSparseMorphReport(report)}`);
}
