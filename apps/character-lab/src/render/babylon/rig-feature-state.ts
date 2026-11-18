/** 리그·최근 GLB 내보내기 결과를 UI에 표시할 기능 상태로 설명한다. */
import { describeSparseMorphReport } from "../glb-sparse-morph";
import { summarizeJointOffsets } from "../joint-offsets";
import { describeMorphTextureMode } from "../morph-limits";
import { featureActive, featureOff, featureUnavailable } from "../scene-features";

import type { CharacterRig } from "./character-rig";
import type { SparseMorphReport } from "../glb-sparse-morph";
import type { MorphLimits } from "../morph-limits";
import type { SceneFeatureState } from "../scene-features";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager.js";

/** 지금 influence > 0인 타깃 수. attribute 모드의 numInfluencers는 8개로 잘리므로 직접 센다. */
function activeMorphTargets(manager: MorphTargetManager): number {
  let active = 0;
  for (let index = 0; index < manager.numTargets; index += 1) if (manager.getTarget(index).influence > 0) active += 1;
  return active;
}

export function describeRigMorphTextureState(rig: CharacterRig | null, limits: MorphLimits): SceneFeatureState {
  const managers = rig
    ? rig.parts.flatMap((part) =>
        part.meshes.flatMap((mesh) => {
          const manager = mesh.morphTargetManager;
          return manager
            ? [{ name: mesh.name, targetCount: manager.numTargets, vertexCount: mesh.getTotalVertices(), supportsNormals: manager.supportsNormals, usingTexture: manager.isUsingTextureForTargets, activeTargets: activeMorphTargets(manager) }]
            : [];
        }),
      )
    : [];
  return describeMorphTextureMode(managers, limits, rig ? "morph 타깃이 있는 파츠가 없습니다." : "소스가 없습니다.");
}

export function describeRigBoneTextureState(rig: CharacterRig | null): SceneFeatureState {
  if (!rig?.skeleton) return featureOff(rig ? "스켈레톤이 없습니다." : "소스가 없습니다.");
  return rig.skeleton.isUsingTextureForMatrices ? featureActive(`${rig.skeleton.bones.length}본`) : featureUnavailable("엔진이 본 행렬 텍스처를 지원하지 않아 uniform 배열 모드로 동작합니다.");
}

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
