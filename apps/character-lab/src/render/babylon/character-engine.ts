/**
 * BabylonCharacterEngine — contracts/engine.ts `CharacterEngine` 포트 구현 본체. WebGPU/WebGL2/NullEngine 어느 `AbstractEngine`이든
 * 생성자 주입으로 받아 같은 클래스가 돈다. 장면·리그·재질·캡처·물리·GLB는 각 helper에 위임한다.
 * 엔진 생성은 engine-factory, Node 검증은 render/testing/null-engine-harness가 맡는다.
 * NullEngine 캡처는 synthetic=true·backend=null이며 실제 셰이더·readback 검증은 브라우저 프로브가 맡는다.
 */
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { Material } from "@babylonjs/core/Materials/material.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";

import { DEFAULT_FRAMING, DEFAULT_SHADING, failVisible, isHumanoidBoneName, isLabFailure } from "../../contracts";
import { fnv1a64Hex, sha256Hex } from "../../shared/hash";
import { qConjugate, qMultiply, qRotateVec3 } from "../../shared/math";
import { stableStringify } from "../../shared/stable-json";
import { BETA_FEATURE_IDS } from "../beta-features";
import { faceSdfUniforms, generateFaceSdf } from "../face-sdf";
import { createFrameStats } from "../frame-stats";
import { createKitBytesCache } from "../kit-bytes-cache";
import { MATERIAL_PRESETS, hexToLinear, toonShadeTint } from "../material-presets";
import { generateMouthMask, MOUTH_MASK_SIZE } from "../mouth-shade";
import { mapPresetToOpenPbr } from "../openpbr-mapping";
import { hullOutlineAllowed, hullOutlineWidthScale } from "../outline-policy";
import { applyPackageHairColor } from "../package-hair-color";
import { DEFAULT_EYEBALL_HIGHLIGHT_CONFIG } from "../render-telemetry";
import { normalizeToonLighting } from "../toon-reference";

import { BABYLON_SIDE_EFFECTS_LOADED } from "./babylon-side-effects";
import { createBetaController } from "./beta-controller";
import { capturePasses, captureThumbnail } from "./capture";
import { collectEngineRenderTelemetry, evaluateAndApplyEyeballHighlight, projectRigJointHandles, readViewportCameraInfo, resolveEnhancedToonParams, resolveMeshToonMaterial, syncPartSubmeshToonUniforms } from "./character-engine-toon";
import { CharacterOutlineController } from "./character-outline-controller";
import { applyRigPlan, computeRigBounds, inspectRig, isKitPart, partHasVertexColors, restoreRig, rigBoneWorld, rigPoseSkeleton, rigVisibleMeshes, setRigPartVisible, snapshotRig } from "./character-rig";
import { fromQuaternion } from "./convert";
import { fetchBytesDefault, fetchKitBytesDefault, rigWithParts, srgb, toFailure } from "./engine-io";
import { readEngineFeatures, readEngineHud, readPaintInspection, readRigSourceCapabilities } from "./engine-reports";
import { applyRigEyeGaze, createEyeGazeController } from "./eye-gaze";
import { exportRigGlbWithReport } from "./glb-exporter";
import { hairLayerSupport } from "./hair-ownership";
import { createHudProbe } from "./hud";
import { loadKitRig } from "./kit-loader";
import { createProceduralIbl } from "./lighting/ibl";
import { adaptLoadedMaterial, applyPresetParams, createPresetMaterial, setMaterialAlbedo } from "./materials/material-factory";
import { createPassMaterial, setAlphaCutoff, setFlatTextures, setFlatUniforms, setIdUniform, setDepthUniform, setToonTextures, setToonUniforms, shaderLanguageFor } from "./materials/toon-shader";
import { bindProceduralModel } from "./mesh-binding";
import { loadPackageRig } from "./package-loader";
import { createPhysicsBridge } from "./physics-bridge";
import { attachDecalToMesh, createPaintTextures, pickRig } from "./pick-and-paint";
import { createPostProcessStack } from "./postprocess";
import { createCharacterScene, inspectCharacterScene } from "./scene-builder";
import { createScenePropController } from "./scene-prop-controller";

import type {
  ApplyPlan, ApplyReceipt, AuthoredPackagePlan, CameraFraming, CaptureRequest, CaptureResult, CapturedRaster,
  CharacterEngine, CharacterPickOptions, CharacterSource, DuoPartnerAttachment, EngineBackend, EngineDiagnostics,
  HandPropAttachment, HeadPropAttachment, HudSample, JointDragHandle, KitPlan, LabFailure, PaintLayer, PartRole,
  PhysicsProviderFactory, PhysicsProviderId, PhysicsStatus, PickHit, Quat, SettleReceipt, SfxStampAttachment,
  ShadingProfile, SkeletonData, SourceCapabilities, StagePropAttachment, ThumbnailRequest, Vec3,
} from "../../contracts";
import type { BetaFeaturePort, BetaFeatureId, BetaFeatureReport, BetaFeatureState, FullSceneFeatureReport } from "../beta-features";
import type { SparseMorphReport } from "../glb-sparse-morph";
import type { OpenPbrParams } from "../openpbr-mapping";
import type { ProjectionPaintHost, ProjectionPaintPort } from "../projection-paint";
import type { ReadbackLane } from "../readback";
import type { EyeballHighlightConfig, EyeballHighlightPort, EyeballHighlightState, RenderTelemetryPort } from "../render-telemetry";
import type { PaintInspection, RigInspection, SceneInspection } from "../rig-inspection";
import type { SceneFeatureSource } from "../scene-features";
import type { CharacterLabRenderTelemetry } from "../style/character-verify-ai-fresh-ideas";
import type { ViewportCameraInfo, ViewportCameraSource } from "../viewport-camera";
import type { BetaController, BetaLoaders } from "./beta-controller";
import type { CaptureDeps, PassMaterialSet } from "./capture";
import type { CharacterRig, RigMaterialHooks, RigPart } from "./character-rig";
import type { KitRigHandle, KitUpdateReport } from "./kit-loader";
import type { ProceduralIbl } from "./lighting/ibl";
import type { MaterialFactoryOptions } from "./materials/material-factory";
import type { NodeToonTextures } from "./materials/node-toon-material";
import type { ToonUniformValues } from "./materials/toon-shader";
import type { PhysicsBridge, PhysicsReceiptLike } from "./physics-bridge";
import type { CharacterScene } from "./scene-builder";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

export type { ReadbackLane } from "../readback";

export const THUMBNAIL_LAYER_MASK = 0x10000000;
export const FACE_SDF_SIZE = 128;
export const TOON_OUTLINE_WIDTH = 0.004;
export const TOON_EDGE_EPSILON = 0.95;

export interface BoneReading {
  readonly name: string;
  readonly humanoid: string | null;
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly localRotation: Quat;
  readonly auxiliary: boolean;
}

export interface BabylonCharacterEngineDeps {
  readonly engine: AbstractEngine;
  readonly lane: ReadbackLane;
  readonly diagnostics: EngineDiagnostics;
  readonly physicsProviders: PhysicsProviderFactory;
  readonly fetchBytes?: (url: string) => Promise<Uint8Array>;
  readonly verifyPackageSha?: boolean;
  readonly awaitShaderCompile?: boolean;
  readonly runRenderLoop?: boolean;
  readonly disposeEngine?: () => void;
  readonly now?: () => number;
  readonly createIbl?: (scene: Scene) => Promise<ProceduralIbl>;
  readonly betaLoaders?: BetaLoaders;
  readonly betaMaterialReadyTimeoutMs?: number;
  readonly captureCompileTimeoutMs?: number;
  readonly onFailure?: (failure: LabFailure) => void;
}

export class BabylonCharacterEngine
  implements CharacterEngine, SceneFeatureSource, ViewportCameraSource, BetaFeaturePort, ProjectionPaintHost, EyeballHighlightPort, RenderTelemetryPort {
  readonly backend: EngineBackend;
  readonly diagnostics: EngineDiagnostics;
  readonly lane: ReadbackLane;
  readonly thumbnailSources = true;

  private readonly engine: AbstractEngine;
  private readonly deps: BabylonCharacterEngineDeps;
  private readonly now: () => number;
  private readonly character: CharacterScene;
  private readonly physics: PhysicsBridge;
  private readonly hud: ReturnType<typeof createHudProbe>;
  private readonly frameStats = createFrameStats(240);
  private readonly paintTextures: ReturnType<typeof createPaintTextures>;
  private readonly postfx: ReturnType<typeof createPostProcessStack>;
  private readonly ibl: ProceduralIbl;
  private readonly whiteTexture: RawTexture;
  private readonly pressureOutline: CharacterOutlineController;
  private readonly clearTexture: RawTexture;
  private readonly sdfTexture: RawTexture;
  private portraitSdfTexture: RawTexture | null = null;
  private readonly mouthMask: RawTexture;
  private readonly maskedParts = new WeakSet<RigPart>();
  private readonly beta: BetaController;
  private lastGlbReport: SparseMorphReport | null = null;
  private readonly flatMaterials = new Map<number, ShaderMaterial>();
  private readonly idMaterials = new Map<number, ShaderMaterial>();
  private normalMaterial: ShaderMaterial | null = null;
  private depthMaterial: ShaderMaterial | null = null;
  private rig: CharacterRig | null = null;
  private kit: KitRigHandle | null = null;
  private readonly kitBytes = createKitBytesCache();
  private readonly kitShaByUrl = new Map<string, string>();
  private shading: ShadingProfile = DEFAULT_SHADING;
  private framing: CameraFraming = DEFAULT_FRAMING;
  private lastPlan: ApplyPlan | null = null;
  private readonly sceneProps = createScenePropController({
    assertAlive: () => this.assertAlive(),
    runExclusive: (operation) => this.runExclusive(operation),
    readRig: () => this.rig,
    loadDeps: () => this.scenePropDeps(),
    disposePassMaterials: (partId) => this.disposePassMaterials(partId),
    releasePart: (rig, part) => this.beta.releaseRig(rigWithParts(rig, [part])),
    refresh: (rig) => this.finalizeRigPropRefresh(rig),
  });
  private readonly gaze = createEyeGazeController(() => this.rig, () => this.lastPlan?.eyeGaze, () => this.viewportCamera().position);
  private eyeballHighlightConfig: EyeballHighlightConfig = { ...DEFAULT_EYEBALL_HIGHLIGHT_CONFIG };
  private disposed = false;
  private loopRunning = false;
  private captureChain: Promise<unknown> = Promise.resolve();

  private constructor(deps: BabylonCharacterEngineDeps, character: CharacterScene, ibl: ProceduralIbl) {
    if (!BABYLON_SIDE_EFFECTS_LOADED) throw new Error("babylon-side-effects가 로드되지 않았습니다.");
    this.deps = deps;
    this.engine = deps.engine;
    this.lane = deps.lane;
    this.backend = deps.diagnostics.backend;
    this.diagnostics = deps.diagnostics;
    this.now = deps.now ?? (() => Date.now());
    this.character = character;
    const scene = this.character.scene;
    this.ibl = ibl;
    if (ibl.texture) scene.environmentTexture = ibl.texture;
    this.postfx = createPostProcessStack(scene, this.character.camera);
    this.hud = createHudProbe(scene, this.engine);
    this.physics = createPhysicsBridge({ factory: deps.physicsProviders, now: this.now });
    this.paintTextures = createPaintTextures(scene);
    this.whiteTexture = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE);
    this.whiteTexture.name = "default:white";
    this.pressureOutline = new CharacterOutlineController(scene, this.whiteTexture);
    scene.onBeforeActiveMeshesEvaluationObservable.add(() => this.gaze.update());
    this.clearTexture = RawTexture.CreateRGBATexture(new Uint8Array([0, 0, 0, 0]), 1, 1, scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE);
    this.clearTexture.name = "default:clear";
    this.sdfTexture = this.makeFaceSdf(false);
    this.mouthMask = RawTexture.CreateRGBATexture(generateMouthMask(MOUTH_MASK_SIZE), MOUTH_MASK_SIZE, MOUTH_MASK_SIZE, scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
    this.mouthMask.name = "default:mouth-mask";
    this.mouthMask.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    this.mouthMask.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    this.beta = createBetaController(
      {
        scene,
        engine: this.engine,
        lane: this.lane,
        camera: this.character.camera,
        sssAvailable: this.character.sssAvailable,
        shadingMode: () => this.shading.mode,
        iblUsable: () => this.shading.ibl.enabled && this.ibl.texture !== null,
        rig: () => this.rig,
        toonParams: (part, rig) => this.toonValues(part, rig),
        toonTextures: (part) => this.toonTextures(part),
        openPbrParams: (part) => this.openPbrParams(part),
        openPbrAlbedoTexture: (part) => (part.hasAlbedoTexture ? part.pbr.albedoTexture : this.maskedParts.has(part) ? this.mouthMask : null),
        materialsChanged: () => {
          this.applyMaterialsForMode(this.rig);
          this.beta.syncIblShadows();
        },
        now: this.now,
        materialReadyTimeoutMs: deps.betaMaterialReadyTimeoutMs ?? ((deps.awaitShaderCompile ?? deps.lane !== "null") ? 90_000 : 0),
      },
      deps.betaLoaders,
    );
    this.applyShadingToScene();
    if (deps.runRenderLoop ?? deps.lane !== "null") {
      this.loopRunning = true;
      this.engine.runRenderLoop(() => this.renderFrame());
    }
  }

  static async create(deps: BabylonCharacterEngineDeps): Promise<BabylonCharacterEngine> {
    const character = createCharacterScene(deps.engine);
    let ibl: ProceduralIbl;
    try {
      ibl = await (deps.createIbl ?? ((scene: Scene) => createProceduralIbl(scene)))(character.scene);
    } catch (error) {
      character.dispose();
      throw error;
    }
    return new BabylonCharacterEngine(deps, character, ibl);
  }

  renderFrame(): void {
    if (this.disposed) return;
    try {
      this.physics.step();
    } catch (error) {
      this.reportFailure(error, "physics-step-failed", "물리 스텝 중 오류가 나 물리를 중단했습니다.");
    }
    this.beta.tick();
    this.pressureOutline.renderScene();
    this.frameStats.push(this.engine.getDeltaTime());
  }

  attachCameraControl(canvas: HTMLCanvasElement): void {
    this.character.attachControls(canvas, () => this.setCamera(this.framing));
  }

  async loadSource(source: CharacterSource): Promise<SourceCapabilities> {
    this.assertAlive();
    return this.runExclusive(() => this.loadSourceExclusive(source));
  }

  private async loadSourceExclusive(source: CharacterSource): Promise<SourceCapabilities> {
    this.assertAlive();
    if (source.kind === "kit") this.rememberKitPlan(source.plan);
    if (source.kind === "kit" && this.kit !== null && this.rig === this.kit.rig && this.kit.compatible(source.plan)) return this.updateKitExclusive(this.kit, source.plan);
    this.unloadRig();
    const hooks = this.materialHooks(() => this.rig, true);
    let rig: CharacterRig;
    let kit: KitRigHandle | null = null;
    try {
      if (source.kind === "kit") {
        kit = await this.buildKit(source.plan, hooks);
        rig = kit.rig;
      } else {
        rig = await this.buildRig(source, hooks);
      }
    } catch (error) {
      return toFailure(error, "source-load-failed", "캐릭터 소스를 엔진에 바인딩하지 못했습니다.", this.now());
    }
    if (this.disposed) {
      rig.dispose();
      throw failVisible("engine-disposed", "소스를 올리는 도중 엔진이 해제됐습니다. 엔진을 다시 선택하세요.", undefined, this.now());
    }
    this.rig = rig;
    this.kit = kit;
    if (this.sceneProps.hasActive()) {
      try {
        await this.sceneProps.syncActive(rig);
      } catch (error) {
        this.reportFailure(error, "scene-prop-reattach-failed", "새 캐릭터 소스에 장착 중이던 3D 소품·듀오 파트너를 다시 연결하지 못했습니다.");
      }
    }
    this.character.addShadowCasters(rigVisibleMeshes(rig, { includeOutlines: false }));
    try {
      this.physics.bindRig(rig);
    } catch (error) {
      this.reportFailure(error, "physics-chains-rejected", "물리 provider가 체인·캡슐 설정을 거부했습니다.");
    }
    this.reattachPaint(rig);
    await this.beta.reconcile();
    this.applyMaterialsForMode(rig);
    this.beta.syncIblShadows();
    this.setCamera(this.framing);
    return readRigSourceCapabilities(rig);
  }

  private async updateKitExclusive(kit: KitRigHandle, plan: KitPlan): Promise<SourceCapabilities> {
    const rig = kit.rig as CharacterRig;
    const before = [...rig.parts];
    let report: KitUpdateReport;
    try {
      report = await kit.update(plan);
    } catch (error) {
      this.beta.releaseRig(rigWithParts(rig, before));
      this.unloadRig();
      for (const part of plan.parts) this.kitBytes.delete(this.kitCacheKey(part.url));
      return toFailure(error, "source-load-failed", "캐릭터 소스를 엔진에 바인딩하지 못했습니다.", this.now());
    }
    if (this.disposed) {
      kit.dispose();
      throw failVisible("engine-disposed", "소스를 올리는 도중 엔진이 해제됐습니다. 엔진을 다시 선택하세요.", undefined, this.now());
    }
    try {
      if (report.removedRigParts.length > 0) {
        this.beta.releaseRig(rigWithParts(rig, report.removedRigParts));
        for (const part of report.removedRigParts) this.disposePassMaterials(part.partId);
      }
      for (const part of report.addedRigParts) this.disposePassMaterials(part.partId);
      this.initializeKitParts(report.addedRigParts, rig.materials);
      this.character.clearShadowCasters();
      this.character.addShadowCasters(rigVisibleMeshes(rig, { includeOutlines: false }));
      try {
        this.physics.bindRig(rig);
      } catch (error) {
        this.reportFailure(error, "physics-chains-rejected", "물리 provider가 체인·캡슐 설정을 거부했습니다.");
      }
      this.reattachPaint(rig);
      if (report.needsPlanReapply && this.lastPlan) applyRigPlan(rig, this.lastPlan, { outlinesVisible: this.outlinesVisible() });
      await this.beta.reconcile();
      this.applyMaterialsForMode(rig);
      this.refreshToonUniforms(rig);
      this.beta.syncIblShadows();
      this.beta.markPoseChanged();
      this.setCamera(this.framing);
    } catch (error) {
      this.unloadRig();
      return toFailure(error, "source-load-failed", "키트 파츠를 엔진에 합치지 못했습니다.", this.now());
    }
    return readRigSourceCapabilities(rig);
  }

  private disposePassMaterials(partId: number): void {
    this.flatMaterials.get(partId)?.dispose(true, false);
    this.flatMaterials.delete(partId);
    this.idMaterials.get(partId)?.dispose(true, false);
    this.idMaterials.delete(partId);
  }

  private initializeKitParts(parts: readonly RigPart[], hooks: RigMaterialHooks): void {
    for (const part of parts) hooks.applyPreset(part, part.materialPreset);
  }

  private async buildKit(plan: KitPlan, hooks: RigMaterialHooks, options: { readonly isolated?: boolean } = {}): Promise<KitRigHandle> {
    const materialOptions = this.materialOptions();
    let handle: KitRigHandle;
    try {
      handle = await loadKitRig(plan, {
        scene: this.character.scene,
        fetchBytes: (url) => this.fetchKitFile(url),
        adaptMaterial: (role, mesh) => adaptLoadedMaterial(materialOptions, mesh.material, role, `mat:${mesh.name}`).material,
        materials: hooks,
        verifyIntegrity: this.deps.verifyPackageSha ?? true,
        now: this.now(),
        ...(options.isolated ? { meshLayerMask: THUMBNAIL_LAYER_MASK } : {}),
      });
    } catch (error) {
      for (const part of plan.parts) this.kitBytes.delete(this.kitCacheKey(part.url));
      throw error;
    }
    try {
      this.initializeKitParts(handle.rig.parts, hooks);
    } catch (error) {
      handle.dispose();
      throw error;
    }
    return handle;
  }

  private rememberKitPlan(plan: KitPlan): void {
    for (const part of plan.parts) this.kitShaByUrl.set(part.url, part.sha256);
  }

  private kitCacheKey(url: string): string {
    return `${url}|${this.kitShaByUrl.get(url) ?? ""}`;
  }

  private async fetchKitFile(url: string): Promise<Uint8Array> {
    const key = this.kitCacheKey(url);
    const cached = this.kitBytes.get(key);
    if (cached) return cached;
    const bytes = await (this.deps.fetchBytes ?? fetchKitBytesDefault)(url);
    this.kitBytes.set(key, bytes);
    return bytes;
  }

  private async buildRig(source: CharacterSource, hooks: RigMaterialHooks, options: { readonly isolated?: boolean } = {}): Promise<CharacterRig> {
    const materialOptions = this.materialOptions();
    if (source.kind === "procedural") {
      const rig = bindProceduralModel(source.model, {
        scene: this.character.scene,
        createMaterial: (part, colorHex) => createPresetMaterial(materialOptions, `mat:${part.id}`, part.materialPreset, colorHex),
        materials: hooks,
        now: this.now(),
      });
      this.applyMouthMask(rig);
      return rig;
    }
    if (source.kind === "kit") {
      this.rememberKitPlan(source.plan);
      return (await this.buildKit(source.plan, hooks, options)).rig as CharacterRig;
    }
    return this.loadPackage(source.plan, materialOptions, hooks);
  }

  sourceNotes(): readonly string[] { return this.rig?.notes ?? []; }
  inspectRig(): RigInspection | null { return this.rig ? inspectRig(this.rig) : null; }
  currentFraming(): CameraFraming { return this.framing; }
  currentShading(): ShadingProfile { return this.shading; }
  poseSkeleton(): SkeletonData | null { return this.rig ? rigPoseSkeleton(this.rig) : null; }
  inspectPaint(): readonly PaintInspection[] { return readPaintInspection(this.rig, this.paintTextures); }
  inspectScene(): SceneInspection { return inspectCharacterScene(this.character); }
  readHud(): HudSample { return readEngineHud({ scene: this.character.scene, diagnostics: this.diagnostics, lane: this.lane, frameStats: this.frameStats, hud: this.hud, backend: this.backend, physics: this.physics, shading: this.shading }); }
  sceneFeatures(): FullSceneFeatureReport { return readEngineFeatures({ postfx: this.postfx, rig: this.rig, engine: this.engine, character: this.character, shading: this.shading, ibl: this.ibl, hud: this.hud, beta: this.beta, lastGlbReport: this.lastGlbReport }); }
  betaFeatures(): BetaFeatureReport { return this.beta.report(); }
  projectionPaint(): ProjectionPaintPort | null { return this.disposed ? null : this.beta.projectionPort(); }
  physicsReceipt(poseHash: string): Promise<PhysicsReceiptLike | null> { return this.physics.receipt(poseHash); }
  pendingColliderBones(): readonly string[] { return this.physics.pendingColliderBones(); }
  jointHandles(): readonly JointDragHandle[] { return this.disposed || !this.rig ? [] : projectRigJointHandles(this.rig, this.character.camera, this.engine); }
  viewportCamera(): ViewportCameraInfo { return readViewportCameraInfo(this.character.camera, this.engine); }

  private async loadPackage(plan: AuthoredPackagePlan, materialOptions: MaterialFactoryOptions, hooks: RigMaterialHooks): Promise<CharacterRig> {
    const bytes = await (this.deps.fetchBytes ?? fetchBytesDefault)(plan.glbUrl);
    if (this.deps.verifyPackageSha ?? true) {
      const digest = await sha256Hex(bytes);
      if (digest !== plan.glbSha256) {
        throw failVisible("package-sha-mismatch", `제작 패키지 GLB의 SHA-256이 플랜과 다릅니다(${digest.slice(0, 8)}… ≠ ${plan.glbSha256.slice(0, 8)}…). 파일이 바뀌었거나 손상됐습니다.`, undefined, this.now());
      }
    }
    return loadPackageRig(plan, bytes, {
      scene: this.character.scene,
      adaptMaterial: (role, mesh) => adaptLoadedMaterial(materialOptions, mesh.material, role, `mat:${mesh.name}`).material,
      materials: hooks,
      now: this.now(),
    });
  }

  private unloadRig(): void {
    const rig = this.rig;
    if (!rig) return;
    this.rig = null;
    this.kit = null;
    this.lastPlan = null;
    this.physics.bindRig(null);
    this.character.clearShadowCasters();
    for (const material of this.flatMaterials.values()) material.dispose(true, false);
    for (const material of this.idMaterials.values()) material.dispose(true, false);
    this.flatMaterials.clear();
    this.idMaterials.clear();
    this.sceneProps.detach(rig);
    this.beta.releaseRig(rig);
    this.pressureOutline.release(rig);
    rig.dispose();
  }

  private scenePropDeps() {
    const materialOptions = this.materialOptions();
    return {
      scene: this.character.scene,
      fetchBytes: (url: string) => (this.deps.fetchBytes ?? fetchBytesDefault)(url),
      adaptMaterial: (role: PartRole, mesh: import("@babylonjs/core/Meshes/mesh.js").Mesh) =>
        adaptLoadedMaterial(materialOptions, mesh.material, role, `mat:${mesh.name}`).material,
      verifyIntegrity: this.deps.verifyPackageSha ?? true,
      now: this.now(),
    };
  }

  private async finalizeRigPropRefresh(rig: CharacterRig): Promise<void> {
    this.character.clearShadowCasters();
    this.character.addShadowCasters(rigVisibleMeshes(rig, { includeOutlines: false }));
    await this.beta.reconcile();
    this.applyMaterialsForMode(rig);
    this.refreshToonUniforms(rig);
    this.beta.syncIblShadows();
  }

  async setHandProp(attachment: HandPropAttachment | null): Promise<void> { return this.sceneProps.setHandProp(attachment); }
  async setHeadProp(attachment: HeadPropAttachment | null): Promise<void> { return this.sceneProps.setHeadProp(attachment); }
  async setStageProp(attachment: StagePropAttachment | null): Promise<void> { return this.sceneProps.setStageProp(attachment); }
  async setDuoPartner(attachment: DuoPartnerAttachment | null): Promise<void> { return this.sceneProps.setDuoPartner(attachment); }
  async setSfxStamp(attachment: SfxStampAttachment | null): Promise<void> { return this.sceneProps.setSfxStamp(attachment); }

  applyPlan(plan: ApplyPlan): ApplyReceipt {
    this.assertAlive();
    const rig = this.requireRig("apply-plan-no-source", "플랜을 적용할 캐릭터 소스가 없습니다. loadSource 뒤에 호출하세요.");
    const receipt = applyRigPlan(rig, plan, { outlinesVisible: this.outlinesVisible() });
    this.lastPlan = plan;
    this.gaze.update();
    this.refreshToonUniforms(rig);
    this.beta.markPoseChanged();
    return receipt;
  }

  setShading(profile: ShadingProfile): void {
    this.assertAlive();
    this.shading = profile;
    this.applyShadingToScene();
    this.applyMaterialsForMode(this.rig);
    void this.beta.reconcile().catch(() => undefined);
  }

  setCamera(framing: CameraFraming): void {
    this.assertAlive();
    this.framing = framing;
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const bounds = this.rig ? computeRigBounds(this.rig, framing.mode) : null;
    this.character.applyFraming(this.character.camera, framing, bounds, height > 0 ? width / height : 1);
    this.gaze.update();
  }
  eyeGaze() { return this.gaze.read(); }
  psdHairLayers() { return hairLayerSupport(this.rig); }

  eyeballHighlight(): EyeballHighlightState {
    const gazeState = this.gaze.read();
    const eyeballEulerDeg: Vec3 = gazeState.status === "available"
      ? [(gazeState.left.pitchDeg + gazeState.right.pitchDeg) * 0.5, (gazeState.left.yawDeg + gazeState.right.yawDeg) * 0.5, 0]
      : [0, 0, 0];
    return evaluateAndApplyEyeballHighlight({
      config: this.eyeballHighlightConfig,
      rig: this.rig,
      eyeballEulerDeg,
      cameraForward: this.viewportCamera().forward,
      sunDirection: this.character.sunDirection,
    });
  }

  setEyeballHighlight(patch: Partial<EyeballHighlightConfig>): EyeballHighlightState {
    this.assertAlive();
    this.eyeballHighlightConfig = {
      mode: patch.mode ?? this.eyeballHighlightConfig.mode,
      offsetPos: patch.offsetPos ?? this.eyeballHighlightConfig.offsetPos,
      fixEyeballCam: patch.fixEyeballCam ?? this.eyeballHighlightConfig.fixEyeballCam,
    };
    return this.eyeballHighlight();
  }

  renderTelemetry(): CharacterLabRenderTelemetry {
    const outlineTelemetry = this.rig ? this.pressureOutline.telemetryFor(this.rig) : null;
    return collectEngineRenderTelemetry(this.rig, this.shading, outlineTelemetry);
  }

  private applyShadingToScene(): void {
    const profile = this.shading;
    this.character.setToneMapping(profile.toneMapping);
    this.character.applyShadowProfile(profile.shadows);
    this.postfx.apply(profile.postfx);
    this.character.scene.environmentIntensity = profile.ibl.enabled ? profile.ibl.intensity : 0;
  }

  private outlinesVisible(): boolean {
    return this.shading.mode === "toon" && this.shading.toon.outline === "hull";
  }

  private applyMaterialsForMode(rig: CharacterRig | null, useBeta = true): void {
    if (!rig) return;
    const toon = this.shading.mode === "toon";
    const outline = toon ? this.shading.toon.outline : "none";
    const pressure = outline === "hull" && this.shading.toon.outlinePressure === true;
    const disableHairInline = !this.shading.look.line.inner.enabled;
    this.pressureOutline.sync(rig, pressure, TOON_OUTLINE_WIDTH, outline === "hull" && !pressure, {
      kitHeadContour: true,
      disableHairInline,
      screenSpaceCompensation: 0.75,
      colorTintStrength: 0.45,
    });
    if (outline === "hull" && rig.kind === "kit") {
      const renderer = this.character.scene.getOutlineRenderer();
      renderer.zOffset = 0;
      renderer.zOffsetUnits = 0;
    }
    for (const part of rig.parts) {
      const nodeToon = toon && useBeta ? this.beta.nodeToonMaterial(part) : null;
      const openPbr = !toon && useBeta ? this.beta.openPbrMaterial(part) : null;
      if (nodeToon) this.beta.updateNodeToon(part, this.toonValues(part, rig), this.toonTextures(part));
      const hull = outline === "hull" && hullOutlineAllowed(rig.kind, part.role);
      part.meshes.forEach((mesh, meshIndex) => {
        mesh.material = toon ? (nodeToon ?? this.ensureToonMaterial(part, rig, meshIndex)) : (openPbr ?? part.meshPbrs?.[meshIndex] ?? part.pbr);
        mesh.renderOutline = hull && !pressure;
        if (hull) {
          mesh.outlineWidth = TOON_OUTLINE_WIDTH * hullOutlineWidthScale(rig.kind, part.role);
          mesh.outlineColor.set(0.05, 0.04, 0.06);
        }
        if (outline === "edge") {
          mesh.enableEdgesRendering(TOON_EDGE_EPSILON);
          mesh.edgesWidth = 1.5;
          mesh.edgesColor.set(0.05, 0.04, 0.06, 1);
        } else if (mesh.edgesRenderer) {
          mesh.disableEdgesRendering();
        }
      });
      setRigPartVisible(part, part.visible, this.outlinesVisible());
    }
  }

  private ensureToonMaterial(part: RigPart, rig: CharacterRig, meshIndex = 0): ShaderMaterial {
    const values = this.toonValues(part, rig);
    const textures = this.toonTextures(part);
    const vertexColor = this.usesVertexColor(part, rig);
    if (!part.toon) {
      part.toon = createPassMaterial({ scene: this.character.scene, language: shaderLanguageFor(this.engine) }, "toon", `toon:${part.id}`, { vertexColor, faceShadowUv: part.faceShadowUv === true, hairFlowUv: part.hairFlowUv === true });
      part.toon.backFaceCulling = part.pbr.backFaceCulling;
    }
    setToonUniforms(part.toon, values);
    setAlphaCutoff(part.toon, this.alphaCutoffOf(part));
    setToonTextures(part.toon, textures);
    return resolveMeshToonMaterial({ part, meshIndex, primaryToon: part.toon, baseValues: values, baseTextures: textures, whiteTexture: this.whiteTexture, scene: this.character.scene, engine: this.engine, vertexColor });
  }

  private pushToon(part: RigPart, rig: CharacterRig | null): void {
    const values = this.toonValues(part, rig);
    if (part.toon) setToonUniforms(part.toon, values);
    syncPartSubmeshToonUniforms(part, values);
    this.beta.updateNodeToon(part, values, this.toonTextures(part));
  }

  private refreshToonUniforms(rig: CharacterRig | null): void {
    if (!rig || this.shading.mode !== "toon") return;
    for (const part of rig.parts) this.pushToon(part, rig);
  }

  private usesVertexColor(part: RigPart, rig: CharacterRig | null): boolean {
    return isKitPart(rig, part) && partHasVertexColors(part);
  }

  private alphaCutoffOf(part: RigPart): number {
    return part.hasAlbedoTexture && part.pbr.transparencyMode === Material.MATERIAL_ALPHATEST ? part.pbr.alphaCutOff : 0;
  }

  private makeFaceSdf(portrait: boolean): RawTexture {
    const sdf = generateFaceSdf(portrait ? 256 : FACE_SDF_SIZE, { portrait });
    const texture = RawTexture.CreateRTexture(sdf.data, sdf.size, sdf.size, this.character.scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
    texture.name = portrait ? "portrait:face-sdf" : "default:face-sdf";
    texture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    return texture;
  }

  private toonTextures(part: RigPart): NodeToonTextures {
    const sdf = part.faceShadowUv ? (this.portraitSdfTexture ??= this.makeFaceSdf(true)) : this.sdfTexture;
    return { albedo: this.albedoTexture(part), paint: this.paintTextures.get(part.role) ?? this.clearTexture, sdf };
  }

  private usesAlbedoTexture(part: RigPart): boolean {
    return part.hasAlbedoTexture || this.maskedParts.has(part);
  }

  private albedoTexture(part: RigPart): BaseTexture {
    if (part.hasAlbedoTexture && part.pbr.albedoTexture) return part.pbr.albedoTexture;
    return this.maskedParts.has(part) ? this.mouthMask : this.whiteTexture;
  }

  private applyMouthMask(rig: CharacterRig): void {
    if (rig.kind !== "procedural") return;
    for (const part of rig.parts) {
      if (part.role !== "head" || part.hasAlbedoTexture) continue;
      part.pbr.albedoTexture = this.mouthMask;
      this.maskedParts.add(part);
    }
  }

  private openPbrParams(part: RigPart): OpenPbrParams {
    const albedo: readonly [number, number, number] = part.hasAlbedoTexture && part.tint === undefined ? [1, 1, 1] : hexToLinear(part.colorHex);
    return mapPresetToOpenPbr(MATERIAL_PRESETS[part.materialPreset], albedo, { sssAvailable: this.character.sssAvailable });
  }

  private headAxes(rig: CharacterRig | null): { readonly forward: Vec3; readonly right: Vec3 } {
    const head = rig?.humanoid.get("head");
    if (!head) return { forward: [0, 0, 1], right: [1, 0, 0] };
    const delta = qMultiply(rigBoneWorld(head).rotation, qConjugate(head.restWorld));
    return { forward: qRotateVec3(delta, [0, 0, 1]), right: qRotateVec3(delta, [1, 0, 0]) };
  }

  private toonValues(part: RigPart, rig: CharacterRig | null): ToonUniformValues {
    const toon = this.shading.toon;
    const ibl = this.shading.ibl;
    const key = this.character.keyLight;
    const lightScale = Math.min(1, key.intensity / 2.4);
    const ambientScale = (ibl.enabled ? ibl.intensity : 0) * 0.5 + this.character.fillLight.intensity * 0.5;
    const average = this.ibl.averageColor;
    const axes = this.headAxes(rig);
    const face = faceSdfUniforms(axes.forward, axes.right, this.character.sunDirection);
    const useFaceSdf = toon.faceSdfShadow && part.role === "head" && (!isKitPart(rig, part) || part.faceShadowUv === true);
    const lighting = normalizeToonLighting(
      [key.diffuse.r * lightScale, key.diffuse.g * lightScale, key.diffuse.b * lightScale],
      [Math.min(1, average[0] * ambientScale), Math.min(1, average[1] * ambientScale), Math.min(1, average[2] * ambientScale)],
    );
    const look = this.shading.look;
    return {
      baseColor: srgb(part.colorHex),
      shadeTint: toonShadeTint(part.role),
      lightColor: lighting.light,
      ambientColor: lighting.ambient,
      toLight: this.character.sunDirection,
      rimColor: [0.35, 0.35, 0.4],
      rampSteps: toon.rampSteps,
      rim: toon.rim,
      faceSdf: useFaceSdf,
      hasPaint: this.paintTextures.get(part.role) !== null,
      faceThreshold: face.threshold,
      // 정면 투영 UV는 캐릭터의 +X 방향으로 증가한다. 절차 머리의 펼친 UV와 방향이 반대다.
      flipU: part.faceShadowUv ? (face.flipU === 1 ? 0 : 1) : face.flipU,
      sdfOffset: 0,
      hasAlbedo: this.usesAlbedoTexture(part),
      mangaToneKind: look.tone.kind,
      mangaToneStrength: look.tone.strength,
      mangaCellPerHead: look.tone.cellPerHead,
      mangaAngleDeg: look.tone.angleDeg,
      mangaInk: look.tone.ink,
      gradeSaturation: look.grade.saturation,
      gradeLightness: look.grade.lightness,
      rampSoftness: look.ramp.softness,
      ...resolveEnhancedToonParams(part, this.shading),
    };
  }

  private materialOptions(): MaterialFactoryOptions {
    return { scene: this.character.scene, sssAvailable: this.character.sssAvailable };
  }

  private materialHooks(rigOf: () => CharacterRig | null, trackFlatPass: boolean): RigMaterialHooks {
    const options = this.materialOptions();
    return {
      applyPreset: (part, preset) => {
        if (rigOf()?.kind === "package") for (const mat of part.meshPbrs ?? [part.pbr]) adaptLoadedMaterial(options, mat, part.role, mat.name);
        else applyPresetParams(options, part.pbr, preset, part.hasAlbedoTexture && part.tint === undefined ? null : part.colorHex);
        if (part.toon) part.toon.backFaceCulling = part.pbr.backFaceCulling;
        this.pushToon(part, rigOf());
        this.beta.updateOpenPbr(part);
      },
      applyColor: (part, hex) => {
        if (part.packageHairAlbedos) applyPackageHairColor(part.packageHairAlbedos, hex);
        else if (!part.hasAlbedoTexture || part.tint !== undefined) setMaterialAlbedo(part.pbr, part.materialPreset, hex);
        this.pushToon(part, rigOf());
        this.beta.updateOpenPbr(part);
        if (!trackFlatPass) return;
        const flat = this.flatMaterials.get(part.partId);
        if (flat) setFlatUniforms(flat, { baseColor: srgb(hex), hasPaint: this.paintTextures.get(part.role) !== null, hasAlbedo: this.usesAlbedoTexture(part) });
      },
    };
  }

  async setPhysicsProvider(id: PhysicsProviderId): Promise<PhysicsStatus> {
    this.assertAlive();
    return this.physics.setProvider(id);
  }

  settle(maxSteps: number): Promise<SettleReceipt> {
    this.assertAlive();
    return this.physics.settle(maxSteps);
  }

  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.captureChain.then(task);
    this.captureChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async renderThumbnail(req: ThumbnailRequest): Promise<CapturedRaster> {
    this.assertAlive();
    return this.runExclusive(() => this.gaze.freeze(() => (req.source ? this.renderTemporaryThumbnail(req, req.source) : this.renderCurrentThumbnail(req))));
  }

  private async renderCurrentThumbnail(req: ThumbnailRequest): Promise<CapturedRaster> {
    this.assertAlive();
    const rig = this.requireRig("thumbnail-no-source", "썸네일을 그릴 캐릭터 소스가 없습니다.");
    let snapshot: ReturnType<typeof snapshotRig> | null = null;
    const restore = (): void => {
      if (!snapshot || this.disposed) return;
      const saved = snapshot;
      snapshot = null;
      restoreRig(rig, saved, { outlinesVisible: this.outlinesVisible() });
      this.refreshToonUniforms(rig);
    };
    return captureThumbnail(this.captureDeps(rig), req.size, req.framing, {
      before: () => {
        snapshot = snapshotRig(rig);
        applyRigPlan(rig, req.plan, { outlinesVisible: this.outlinesVisible() });
        applyRigEyeGaze(rig, req.plan.eyeGaze, this.viewportCamera().position);
        this.refreshToonUniforms(rig);
      },
      after: restore,
    });
  }

  private async renderTemporaryThumbnail(req: ThumbnailRequest, source: CharacterSource): Promise<CapturedRaster> {
    this.assertAlive();
    const holder: { rig: CharacterRig | null } = { rig: null };
    try {
      try {
        holder.rig = await this.buildRig(source, this.materialHooks(() => holder.rig, false), { isolated: true });
      } catch (error) {
        return toFailure(error, "thumbnail-source-failed", "썸네일용 임시 소스를 만들지 못했습니다.", this.now());
      }
      const rig = holder.rig;
      this.assertAlive();
      this.isolateTemporaryRig(rig);
      this.applyMaterialsForMode(rig, false);
      applyRigPlan(rig, req.plan, { outlinesVisible: this.outlinesVisible() });
      applyRigEyeGaze(rig, req.plan.eyeGaze, this.viewportCamera().position);
      this.refreshToonUniforms(rig);
      return await captureThumbnail({ ...this.captureDeps(rig), shadow: null }, req.size, req.framing);
    } finally {
      if (holder.rig && !this.disposed) { this.pressureOutline.release(holder.rig); holder.rig.dispose(); }
    }
  }

  private isolateTemporaryRig(rig: CharacterRig): void {
    for (const part of rig.parts) {
      for (const mesh of [...part.meshes, ...part.outlineMeshes]) {
        mesh.layerMask = THUMBNAIL_LAYER_MASK;
        mesh.receiveShadows = false;
      }
    }
  }

  async renderPasses(req: CaptureRequest): Promise<CaptureResult> {
    this.assertAlive();
    return this.runExclusive(async () => {
      this.assertAlive();
      const rig = this.requireRig("capture-no-source", "캡처할 캐릭터 소스가 없습니다.");
      if (req.settleSteps > 0) await this.physics.settle(req.settleSteps);
      return this.gaze.freeze(() => capturePasses(this.captureDeps(rig), req, req.camera ?? this.framing));
    });
  }

  private captureDeps(rig: CharacterRig): CaptureDeps {
    return {
      scene: this.character.scene,
      character: this.character,
      lane: this.lane,
      rig,
      passMaterials: this.passMaterials(),
      shadow: this.character.shadow,
      includeOutlines: this.outlinesVisible(),
      pressureOutlines: () => this.pressureOutline.meshesFor(rig),
      waitForShaders: this.deps.awaitShaderCompile ?? this.lane !== "null",
      ...(this.deps.captureCompileTimeoutMs !== undefined ? { compileTimeoutMs: this.deps.captureCompileTimeoutMs } : {}),
      provenance: { physicsProvider: this.physics.currentId(), settleSteps: 0, recipeDigest: this.planDigest() },
      now: this.now(),
    };
  }

  planDigest(): string {
    const plan = this.lastPlan;
    if (!plan) return "no-plan";
    return `plan-${plan.revision}-${fnv1a64Hex(stableStringify({ morphWeights: plan.morphWeights, boneRotations: plan.boneRotations, parts: plan.parts, colors: plan.colors, ...(plan.eyeGaze ? { eyeGaze: plan.eyeGaze } : {}) }))}`;
  }

  private passMaterials(): PassMaterialSet {
    const deps = { scene: this.character.scene, language: shaderLanguageFor(this.engine) };
    return {
      flat: (part) => {
        let material = this.flatMaterials.get(part.partId);
        if (!material) {
          material = createPassMaterial(deps, "flat", `flat:${part.id}`, { vertexColor: this.usesVertexColor(part, this.rig) });
          this.flatMaterials.set(part.partId, material);
        }
        material.backFaceCulling = part.pbr.backFaceCulling;
        setFlatUniforms(material, { baseColor: srgb(part.colorHex), hasPaint: this.paintTextures.get(part.role) !== null, hasAlbedo: this.usesAlbedoTexture(part) });
        setAlphaCutoff(material, this.alphaCutoffOf(part));
        setFlatTextures(material, { albedo: this.albedoTexture(part), paint: this.paintTextures.get(part.role) ?? this.clearTexture });
        return material;
      },
      id: (part) => {
        let material = this.idMaterials.get(part.partId);
        if (!material) {
          material = createPassMaterial(deps, "id", `id:${part.id}`);
          this.idMaterials.set(part.partId, material);
        }
        material.backFaceCulling = part.pbr.backFaceCulling;
        setIdUniform(material, part.partId, part.materialId);
        return material;
      },
      normal: () => {
        this.normalMaterial ??= createPassMaterial(deps, "normal", "pass:normal");
        return this.normalMaterial;
      },
      depth: (near, far) => {
        this.depthMaterial ??= createPassMaterial(deps, "depth", "pass:depth");
        setDepthUniform(this.depthMaterial, near, far);
        return this.depthMaterial;
      },
    };
  }

  pick(ndcX: number, ndcY: number, options?: CharacterPickOptions): PickHit | null {
    if (this.disposed || !this.rig) return null;
    return pickRig(this.character.scene, this.character.camera, this.rig, ndcX, ndcY, options);
  }

  readBone(name: string): BoneReading | null {
    const rig = this.rig;
    if (!rig) return null;
    const rb = rig.bones.get(name) ?? (isHumanoidBoneName(name) ? rig.humanoid.get(name) : undefined);
    if (!rb) return null;
    const world = rigBoneWorld(rb);
    return { name: rb.name, humanoid: rb.humanoid, position: world.position, rotation: world.rotation, localRotation: fromQuaternion(rb.node.rotationQuaternion), auxiliary: rb.auxiliary };
  }

  updatePaintTexture(layer: PaintLayer): void {
    this.assertAlive();
    const texture = this.paintTextures.upload(layer);
    const rig = this.rig;
    if (!rig) return;
    this.bindPaint(rig, layer.part, texture);
  }

  private reattachPaint(rig: CharacterRig): void {
    const roles = new Set<PartRole>(rig.parts.map((part) => part.role));
    for (const role of roles) {
      const texture = this.paintTextures.get(role);
      if (texture) this.bindPaint(rig, role, texture);
    }
  }

  private bindPaint(rig: CharacterRig, role: PartRole, texture: RawTexture): void {
    for (const part of rig.parts) {
      if (part.role !== role) continue;
      for (const mesh of part.meshes) attachDecalToMesh(this.character.scene, mesh, texture);
      const decal = part.pbr.decalMap;
      if (decal) decal.isEnabled = true;
      if (part.toon) setToonTextures(part.toon, { ...this.toonTextures(part), paint: texture });
      this.pushToon(part, rig);
      const flat = this.flatMaterials.get(part.partId);
      if (flat) setFlatTextures(flat, { albedo: this.albedoTexture(part), paint: texture });
    }
  }

  async exportGlb(): Promise<Uint8Array> {
    this.assertAlive();
    const rig = this.requireRig("glb-no-source", "GLB로 내보낼 캐릭터 소스가 없습니다.");
    const releaseGaze = this.gaze.hold();
    const detached = this.lane === "null" ? rig.parts.filter((part) => this.maskedParts.has(part)) : [];
    for (const part of detached) part.pbr.albedoTexture = null;
    const swapped: Array<() => void> = [];
    for (const part of rig.parts) {
      part.meshes.forEach((mesh, meshIndex) => {
        const targetPbr = part.meshPbrs?.[meshIndex] ?? part.pbr;
        const current = mesh.material;
        if (current === targetPbr) return;
        mesh.material = targetPbr;
        swapped.push(() => void (mesh.material = current));
      });
    }
    try {
      const exported = await exportRigGlbWithReport(this.character.scene, rig, "character", this.now());
      this.lastGlbReport = exported.sparse;
      return exported.glb;
    } finally {
      releaseGaze();
      for (const undo of swapped) undo();
      for (const part of detached) part.pbr.albedoTexture = this.mouthMask;
    }
  }

  async setBetaFeature(id: BetaFeatureId, enabled: boolean): Promise<BetaFeatureState> {
    this.assertAlive();
    if (!BETA_FEATURE_IDS.includes(id)) throw failVisible("beta-unknown", `알 수 없는 베타 기능입니다: ${String(id)}`, undefined, this.now());
    return this.beta.set(id, enabled);
  }

  resize(width: number, height: number): void {
    if (this.disposed) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    this.engine.setSize(w, h);
    this.setCamera(this.framing);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.loopRunning) this.engine.stopRenderLoop();
    this.unloadRig();
    this.normalMaterial?.dispose(true, false);
    this.depthMaterial?.dispose(true, false);
    this.beta.dispose();
    this.pressureOutline.dispose();
    this.paintTextures.dispose();
    this.mouthMask.dispose();
    this.whiteTexture.dispose();
    this.clearTexture.dispose();
    this.sdfTexture.dispose();
    this.portraitSdfTexture?.dispose();
    this.postfx.dispose();
    this.hud.dispose();
    this.physics.dispose();
    this.ibl.dispose();
    this.character.dispose();
    if (this.deps.disposeEngine) this.deps.disposeEngine();
    else this.engine.dispose();
  }

  private reportFailure(error: unknown, code: string, reasonKo: string): void {
    const failure = isLabFailure(error) ? error : failVisible(code, reasonKo, error, this.now());
    try {
      this.deps.onFailure?.(failure);
    } catch {
      // 알림 경로 자체의 오류로 프레임 루프를 멈추지 않는다.
    }
  }

  private assertAlive(): void {
    if (this.disposed) throw failVisible("engine-disposed", "이미 해제된 엔진입니다. 엔진을 다시 선택하세요.", undefined, this.now());
  }

  private requireRig(code: string, reasonKo: string): CharacterRig {
    if (!this.rig) throw failVisible(code, reasonKo, undefined, this.now());
    return this.rig;
  }
}
