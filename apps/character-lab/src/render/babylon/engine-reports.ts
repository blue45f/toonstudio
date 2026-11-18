/** 엔진의 소스·HUD·장면 기능·페인트 점검을 읽기 전용 보고로 모은다. */
import { describeSparseMorphReport } from "../glb-sparse-morph";
import { describeMorphTextureMode } from "../morph-limits";
import { createFeatureReport, featureActive, featureOff, featureUnavailable } from "../scene-features";

import { readJointOffsetState } from "./joint-offset-rig";

import type { EngineBackend, EngineDiagnostics, HudSample, Quat, ShadingProfile, SourceCapabilities, Vec3 } from "../../contracts";
import type { FullSceneFeatureReport } from "../beta-features";
import type { FrameStats } from "../frame-stats";
import type { SparseMorphReport } from "../glb-sparse-morph";
import type { ReadbackLane } from "../readback";
import type { PaintInspection } from "../rig-inspection";
import type { SceneFeatureState } from "../scene-features";
import type { BetaController } from "./beta-controller";
import type { CharacterRig } from "./character-rig";
import type { HudProbe } from "./hud";
import type { ProceduralIbl } from "./lighting/ibl";
import type { PhysicsBridge } from "./physics-bridge";
import type { PaintTextureSet } from "./pick-and-paint";
import type { PostProcessStack } from "./postprocess";
import type { CharacterScene } from "./scene-builder";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** `readBone` 결과 */
export interface BoneReading {
  readonly name: string;
  readonly humanoid: string | null;
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly localRotation: Quat;
  readonly auxiliary: boolean;
}

interface HudReportSource {
  readonly scene: Scene;
  readonly diagnostics: EngineDiagnostics;
  readonly lane: ReadbackLane;
  readonly frameStats: Pick<FrameStats, "last" | "p95">;
  readonly hud: Pick<HudProbe, "gpuFrameMs" | "drawCalls">;
  readonly backend: EngineBackend;
  readonly physics: Pick<PhysicsBridge, "currentId">;
  readonly shading: ShadingProfile;
}

interface FeatureReportSource {
  readonly postfx: Pick<PostProcessStack, "states">;
  readonly rig: CharacterRig | null;
  readonly engine: Pick<AbstractEngine, "getCaps">;
  readonly character: Pick<CharacterScene, "shadowState" | "sssState">;
  readonly shading: ShadingProfile;
  readonly ibl: Pick<ProceduralIbl, "state">;
  readonly hud: Pick<HudProbe, "gpuTimerState">;
  readonly beta: Pick<BetaController, "report">;
  readonly lastGlbReport: SparseMorphReport | null;
}

export function readRigSourceCapabilities(rig: CharacterRig): SourceCapabilities {
  return {
    capabilities: rig.capabilities,
    morphNames: rig.morphNames,
    boneNames: [...rig.bones.keys()],
    partIdPalette: rig.partIdPalette,
  };
}

export function readEngineHud(source: HudReportSource): HudSample {
  const scene = source.scene;
  const adapter = source.diagnostics.adapter;
  const adapterLabel = source.lane === "null" ? "NullEngine" : [adapter?.vendor, adapter?.device ?? adapter?.description].filter((value): value is string => Boolean(value)).join(" ") || (source.diagnostics.renderer ?? "어댑터 정보 없음");
  return {
    frameMs: source.frameStats.last(),
    frameMsP95: source.frameStats.p95(),
    gpuFrameMs: source.hud.gpuFrameMs(),
    drawCalls: source.hud.drawCalls(),
    activeMeshes: scene.getActiveMeshes().length,
    triangles: Math.floor(scene.getActiveIndices() / 3),
    backend: source.backend,
    adapterLabel,
    physicsProvider: source.physics.currentId(),
    shadingMode: source.shading.mode,
  };
}

/** 지금 influence > 0인 morph 타깃 수. `numInfluencers`는 attribute 모드에서 8개로 잘려 있어 초과분(무시되는 타깃)을 셀 수 없다. */
function activeMorphTargets(manager: MorphTargetManager): number {
  let active = 0;
  for (let index = 0; index < manager.numTargets; index += 1) if (manager.getTarget(index).influence > 0) active += 1;
  return active;
}

export function readEngineFeatures(source: FeatureReportSource): FullSceneFeatureReport {
  const post = source.postfx.states();
  const rig = source.rig;
  const caps = source.engine.getCaps();
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
    cascadedShadows: source.character.shadowState(),
    subsurfaceScattering: source.character.sssState(),
    imageBasedLighting: source.shading.ibl.enabled ? source.ibl.state : featureOff("프로파일에서 IBL을 껐습니다."),
    taa: post.taa,
    ssao: post.ssao,
    msaa: post.msaa,
    gpuTimer: source.hud.gpuTimerState(),
    morphTextureMode: morphTexture,
    boneTextureMode: boneTexture,
  });
  return { ...base, ...source.beta.report(), jointOffsets: readJointOffsetState(source.rig), glbMorphSparse: readGlbSparseState(source.lastGlbReport) };
}

function readGlbSparseState(report: SparseMorphReport | null): SceneFeatureState {
  if (!report) return featureActive("내보낼 때마다 변경량 0 정점의 morph를 sparse accessor로 정리합니다(아직 내보내지 않음).");
  if (report.unchanged) return report.morphAccessors === 0 ? featureOff("마지막 내보내기: morph target가 없어 정리할 것이 없습니다.") : featureUnavailable(`마지막 내보내기: ${describeSparseMorphReport(report)}`);
  return featureActive(`마지막 내보내기: ${describeSparseMorphReport(report)}`);
}

export function readPaintInspection(rig: CharacterRig | null, paintTextures: Pick<PaintTextureSet, "describe" | "get">): readonly PaintInspection[] {
  return paintTextures.describe().map((info) => {
    const texture = paintTextures.get(info.part);
    const parts = rig ? rig.parts.filter((part) => part.role === info.part) : [];
    const decalMeshes = parts.reduce((sum, part) => sum + part.meshes.filter((mesh) => texture !== null && mesh.decalMap?.texture === texture).length, 0);
    return { ...info, decalMeshes, decalEnabled: parts.length > 0 && parts.every((part) => part.pbr.decalMap?.isEnabled === true) };
  });
}
