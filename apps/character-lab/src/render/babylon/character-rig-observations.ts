/** 엔진의 리그·본·morph·내보내기 상태를 변경 없이 읽는 진단 경계. */
import { isHumanoidBoneName } from "../../contracts";
import { describeSparseMorphReport } from "../glb-sparse-morph";
import { summarizeJointOffsets } from "../joint-offsets";
import { describeMorphTextureMode } from "../morph-limits";
import { featureActive, featureOff, featureUnavailable } from "../scene-features";

import { rigBoneWorld } from "./character-rig";
import { fromQuaternion } from "./convert";

import type { Quat, Vec3 } from "../../contracts";
import type { SparseMorphReport } from "../glb-sparse-morph";
import type { SceneFeatureState } from "../scene-features";
import type { CharacterRig } from "./character-rig";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager.js";

/** `readBone` 결과 */
export interface BoneReading {
  readonly name: string;
  readonly humanoid: string | null;
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly localRotation: Quat;
  readonly auxiliary: boolean;
}

export function readRigBone(rig: CharacterRig | null, name: string): BoneReading | null {
  if (!rig) return null;
  const rb = rig.bones.get(name) ?? (isHumanoidBoneName(name) ? rig.humanoid.get(name) : undefined);
  if (!rb) return null;
  const world = rigBoneWorld(rb);
  return { name: rb.name, humanoid: rb.humanoid, position: world.position, rotation: world.rotation, localRotation: fromQuaternion(rb.node.rotationQuaternion), auxiliary: rb.auxiliary };
}

/** influence > 0인 타깃을 직접 세어 attribute 모드에서 잘린 numInfluencers와 구분한다. */
function activeMorphTargets(manager: MorphTargetManager): number {
  let active = 0;
  for (let index = 0; index < manager.numTargets; index += 1) if (manager.getTarget(index).influence > 0) active += 1;
  return active;
}

export function rigTextureStates(rig: CharacterRig | null, caps: ReturnType<AbstractEngine["getCaps"]>): {
  readonly morphTexture: SceneFeatureState;
  readonly boneTexture: SceneFeatureState;
} {
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
  const morphTexture = describeMorphTextureMode(managers, { maxTextureSize: caps.maxTextureSize, maxArrayLayers: caps.texture2DArrayMaxLayerCount }, rig ? "morph 타깃이 있는 파츠가 없습니다." : "소스가 없습니다.");
  const boneTexture = !rig?.skeleton ? featureOff(rig ? "스켈레톤이 없습니다." : "소스가 없습니다.") : rig.skeleton.isUsingTextureForMatrices ? featureActive(`${rig.skeleton.bones.length}본`) : featureUnavailable("엔진이 본 행렬 텍스처를 지원하지 않아 uniform 배열 모드로 동작합니다.");
  return { morphTexture, boneTexture };
}

export function rigJointOffsetState(rig: CharacterRig | null): SceneFeatureState {
  if (!rig) return featureOff("소스가 없습니다.");
  const binding = rig.jointOffsets;
  if (!binding) return featureOff(rig.kind === "package" ? "제작 패키지에는 체형 morph 관절 오프셋이 없습니다." : "이 소스는 관절 오프셋을 주지 않아 morph만 정점에 반영됩니다.");
  const summary = summarizeJointOffsets(binding.table);
  const applied = binding.snapshot().size;
  return featureActive(`morph ${summary.morphCount}개 · 관절 ${summary.boneCount}개 · 최대 ${(summary.maxOffsetM * 1000).toFixed(0)} mm · 지금 ${applied}개 본이 옮겨짐(역바인드 재생성)`);
}

export function glbSparseState(report: SparseMorphReport | null): SceneFeatureState {
  if (!report) return featureActive("내보낼 때마다 변경량 0 정점의 morph를 sparse accessor로 정리합니다(아직 내보내지 않음).");
  if (report.unchanged) return report.morphAccessors === 0 ? featureOff("마지막 내보내기: morph target가 없어 정리할 것이 없습니다.") : featureUnavailable(`마지막 내보내기: ${describeSparseMorphReport(report)}`);
  return featureActive(`마지막 내보내기: ${describeSparseMorphReport(report)}`);
}
