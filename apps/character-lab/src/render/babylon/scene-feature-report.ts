/**
 * 장면 기능 보고(`BabylonCharacterEngine.sceneFeatures()`): 그림자·SSS·IBL·TAA·SSAO·MSAA·GPU 타이머·morph/본 행렬 저장 방식에
 * 베타 기능과 리그·내보내기 능력(체형 관절 오프셋·GLB morph sparse 정리)을 더한 평문 보고를 만든다. 엔진이 읽기 전용 원천을 모아 넘기고,
 * 여기서는 상태를 바꾸지 않는다(Babylon 객체는 보고 밖으로 내보내지 않는다). 지원하지 않는 항목은 한글 사유와 함께 보고한다(무음 생략 금지).
 */
import { describeSparseMorphReport } from "../glb-sparse-morph";
import { summarizeJointOffsets } from "../joint-offsets";
import { describeMorphTextureMode } from "../morph-limits";
import { createFeatureReport, featureActive, featureOff, featureUnavailable } from "../scene-features";

import type { BetaController } from "./beta-controller";
import type { CharacterRig } from "./character-rig";
import type { HudProbe } from "./hud";
import type { ProceduralIbl } from "./lighting/ibl";
import type { PostProcessStack } from "./postprocess";
import type { CharacterScene } from "./scene-builder";
import type { FullSceneFeatureReport } from "../beta-features";
import type { SparseMorphReport } from "../glb-sparse-morph";
import type { SceneFeatureState } from "../scene-features";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager.js";

/** 보고에 쓰는 엔진 원천(읽기만 한다) */
export interface SceneFeatureSources {
  readonly engine: AbstractEngine;
  readonly character: CharacterScene;
  readonly postfx: Pick<PostProcessStack, "states">;
  readonly hud: Pick<HudProbe, "gpuTimerState">;
  readonly ibl: Pick<ProceduralIbl, "state">;
  readonly beta: Pick<BetaController, "report">;
  /** 지금 셰이딩 프로파일에서 IBL이 켜져 있는지 */
  readonly iblEnabled: boolean;
  /** 주 리그(소스가 없으면 null) */
  readonly rig: CharacterRig | null;
  /** 마지막 GLB 내보내기의 sparse 정리 결과(아직 내보내지 않았으면 null) */
  readonly lastGlbReport: SparseMorphReport | null;
}

/** 지금 influence > 0인 morph 타깃 수. `numInfluencers`는 attribute 모드에서 8개로 잘려 있어 초과분(무시되는 타깃)을 셀 수 없다. */
function activeMorphTargets(manager: MorphTargetManager): number {
  let active = 0;
  for (let index = 0; index < manager.numTargets; index += 1) if (manager.getTarget(index).influence > 0) active += 1;
  return active;
}

export function reportSceneFeatures(sources: SceneFeatureSources): FullSceneFeatureReport {
  const post = sources.postfx.states();
  const rig = sources.rig;
  const caps = sources.engine.getCaps();
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
  const base = createFeatureReport({
    cascadedShadows: sources.character.shadowState(),
    subsurfaceScattering: sources.character.sssState(),
    imageBasedLighting: sources.iblEnabled ? sources.ibl.state : featureOff("프로파일에서 IBL을 껐습니다."),
    taa: post.taa,
    ssao: post.ssao,
    msaa: post.msaa,
    gpuTimer: sources.hud.gpuTimerState(),
    morphTextureMode: morphTexture,
    boneTextureMode: boneTexture,
  });
  return { ...base, ...sources.beta.report(), jointOffsets: jointOffsetState(rig), glbMorphSparse: glbSparseState(sources.lastGlbReport) };
}

function jointOffsetState(rig: CharacterRig | null): SceneFeatureState {
  if (!rig) return featureOff("소스가 없습니다.");
  const binding = rig.jointOffsets;
  if (!binding) return featureOff(rig.kind === "package" ? "제작 패키지에는 체형 morph 관절 오프셋이 없습니다." : "이 소스는 관절 오프셋을 주지 않아 morph만 정점에 반영됩니다.");
  const summary = summarizeJointOffsets(binding.table);
  const applied = binding.snapshot().size;
  return featureActive(`morph ${summary.morphCount}개 · 관절 ${summary.boneCount}개 · 최대 ${(summary.maxOffsetM * 1000).toFixed(0)} mm · 지금 ${applied}개 본이 옮겨짐(역바인드 재생성)`);
}

function glbSparseState(report: SparseMorphReport | null): SceneFeatureState {
  if (!report) return featureActive("내보낼 때마다 변경량 0 정점의 morph를 sparse accessor로 정리합니다(아직 내보내지 않음).");
  if (report.unchanged) return report.morphAccessors === 0 ? featureOff("마지막 내보내기: morph target가 없어 정리할 것이 없습니다.") : featureUnavailable(`마지막 내보내기: ${describeSparseMorphReport(report)}`);
  return featureActive(`마지막 내보내기: ${describeSparseMorphReport(report)}`);
}
