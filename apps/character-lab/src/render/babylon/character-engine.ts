/**
 * BabylonCharacterEngine — contracts/engine.ts `CharacterEngine` 포트 구현 본체. WebGPU/WebGL2/NullEngine 어느 `AbstractEngine`이든
 * 생성자 주입으로 받아 같은 클래스가 돈다. 장면·리그·재질·캡처·물리·GLB는 각 helper에 위임한다.
 * 엔진 생성은 engine-factory, Node 검증은 render/testing/null-engine-harness가 맡는다.
 * NullEngine 캡처는 synthetic=true·backend=null이며 실제 셰이더·readback 검증은 브라우저 프로브가 맡는다.
 */
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";

import { DEFAULT_FRAMING, DEFAULT_SHADING, failVisible, isHumanoidBoneName, isLabFailure } from "../../contracts";
import { fnv1a64Hex, sha256Hex } from "../../shared/hash";
import { v3Cross, v3Length, v3Normalize, v3Sub } from "../../shared/math";
import { stableStringify } from "../../shared/stable-json";
import { BETA_FEATURE_IDS } from "../beta-features";
import { generateFaceSdf } from "../face-sdf";
import { createFrameStats } from "../frame-stats";
import { createKitBytesCache } from "../kit-bytes-cache";
import { generateMouthMask, MOUTH_MASK_SIZE } from "../mouth-shade";
import { hullOutlineAllowed, hullOutlineWidthScale } from "../outline-policy";

import { BABYLON_SIDE_EFFECTS_LOADED } from "./babylon-side-effects";
import { createBetaController } from "./beta-controller";
import { capturePasses, captureThumbnail } from "./capture";
import { FACE_SDF_SIZE, THUMBNAIL_LAYER_MASK, TOON_EDGE_EPSILON, TOON_OUTLINE_WIDTH } from "./character-engine-constants";
import { CharacterOutlineController } from "./character-outline-controller";
import { applyRigPlan, computeRigBounds, inspectRig, restoreRig, rigBoneWorld, rigPoseSkeleton, rigVisibleMeshes, setRigPartVisible, snapshotRig } from "./character-rig";
import { fromQuaternion, fromVector3, toVector3 } from "./convert";
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
import { rigPartAlbedoTexture, rigPartAlphaCutoff, rigPartHasAlbedoTexture, rigPartOpenPbrParams, rigToonValues, usesRigVertexColor } from "./rig-material-values";
import { createCharacterScene, inspectCharacterScene } from "./scene-builder";
import { createScenePropController } from "./scene-prop-controller";

import type { CaptureDeps, PassMaterialSet } from "./capture";
import type { BabylonCharacterEngineDeps, BoneReading } from "./character-engine-types";
import type { CharacterRig, RigMaterialHooks, RigPart } from "./character-rig";
import type { KitRigHandle, KitUpdateReport } from "./kit-loader";
import type {
  ApplyPlan,
  ApplyReceipt,
  AuthoredPackagePlan,
  CameraFraming,
  CaptureRequest,
  CaptureResult,
  CapturedRaster,
  CharacterEngine,
  CharacterSource,
  DuoPartnerAttachment,
  EngineBackend,
  EngineDiagnostics,
  HandPropAttachment,
  HeadPropAttachment,
  HudSample,
  StagePropAttachment,
  JointDragHandle,
  KitPlan,
  PaintLayer,
  PartRole,
  PhysicsProviderId,
  PhysicsStatus,
  CharacterPickOptions, PickHit,
  SettleReceipt,
  ShadingProfile,
  SkeletonData,
  SourceCapabilities,
  ThumbnailRequest,
  Vec3,
} from "../../contracts";
import type { BetaFeaturePort, BetaFeatureId, BetaFeatureReport, BetaFeatureState, FullSceneFeatureReport } from "../beta-features";
import type { SparseMorphReport } from "../glb-sparse-morph";
import type { ProjectionPaintHost, ProjectionPaintPort } from "../projection-paint";
import type { BetaController } from "./beta-controller";
import type { MaterialFactoryOptions } from "./materials/material-factory";
import type { NodeToonTextures } from "./materials/node-toon-material";
import type { ToonUniformValues } from "./materials/toon-shader";
import type { PhysicsBridge, PhysicsReceiptLike } from "./physics-bridge";
import type { CharacterScene } from "./scene-builder";
import type { ReadbackLane } from "../readback";
import type { PaintInspection, RigInspection, SceneInspection } from "../rig-inspection";
import type { SceneFeatureSource } from "../scene-features";
import type { ViewportCameraInfo, ViewportCameraSource } from "../viewport-camera";
import type { ProceduralIbl } from "./lighting/ibl";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";

export { FACE_SDF_SIZE, THUMBNAIL_LAYER_MASK, TOON_EDGE_EPSILON, TOON_OUTLINE_WIDTH } from "./character-engine-constants";
export type { ReadbackLane } from "../readback";
export type { BabylonCharacterEngineDeps, BoneReading } from "./character-engine-types";

export class BabylonCharacterEngine implements CharacterEngine, SceneFeatureSource, ViewportCameraSource, BetaFeaturePort, ProjectionPaintHost {
  readonly backend: EngineBackend;
  readonly diagnostics: EngineDiagnostics;
  readonly lane: ReadbackLane;
  /** `ThumbnailRequest.source`(지오메트리 프리셋의 임시 소스)를 처리한다: 주 리그를 건드리지 않고 임시 리그로 그린 뒤 해제. */
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
  /** 입 안 UV 섬을 어둡게 곱하는 알베도 마스크(절차 소스 `head` 파츠만, `mouth-shade.ts`) */
  private readonly mouthMask: RawTexture;
  private readonly maskedParts = new WeakSet<RigPart>();
  private readonly beta: BetaController;
  private lastGlbReport: SparseMorphReport | null = null;
  private readonly flatMaterials = new Map<number, ShaderMaterial>();
  private readonly idMaterials = new Map<number, ShaderMaterial>();
  private normalMaterial: ShaderMaterial | null = null;
  private depthMaterial: ShaderMaterial | null = null;
  private rig: CharacterRig | null = null;
  /** 주 리그가 키트일 때의 로더 핸들(같은 베이스에서 파츠만 바뀌면 `update`로 증분 교체한다, 계약 4.11) */
  private kit: KitRigHandle | null = null;
  /** 키트 GLB 바이트 캐시(합계 64 MiB, 최근 사용 우선). 파츠 교체·지오메트리 썸네일이 같은 파일을 다시 받지 않게 한다. */
  private readonly kitBytes = createKitBytesCache();
  /** 키트 파일 URL → 플랜이 선언한 SHA-256. 바이트 캐시 키에 넣어, 같은 URL의 파일이 키트 갱신으로 바뀌었을 때 옛 바이트를 돌려주지 않는다. */
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
    releaseParts: (rig, parts) => this.beta.releaseRig(rigWithParts(rig, parts)),
    refresh: (rig) => this.finalizeRigPropRefresh(rig),
  });
  private readonly gaze = createEyeGazeController(() => this.rig, () => this.lastPlan?.eyeGaze, () => this.viewportCamera().position);
  private disposed = false;
  private loopRunning = false;
  /** 캡처(썸네일·멀티패스)는 캡처 카메라·RTT·플랜 상태를 공유하므로 한 번에 하나만 실행한다. */
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
    const sdf = generateFaceSdf(FACE_SDF_SIZE);
    // 얼굴 SDF 임계 맵: R8, 선형 보간, invertY=false(생성 행 0 = v 0)
    this.sdfTexture = RawTexture.CreateRTexture(sdf.data, sdf.size, sdf.size, scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
    this.sdfTexture.name = "default:face-sdf";
    this.sdfTexture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    this.sdfTexture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
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
      openPbrParams: (part) => rigPartOpenPbrParams(part, this.character.sssAvailable),
      openPbrAlbedoTexture: (part) => (part.hasAlbedoTexture ? part.pbr.albedoTexture : this.maskedParts.has(part) ? this.mouthMask : null),
      materialsChanged: () => {
        this.applyMaterialsForMode(this.rig);
        this.beta.syncIblShadows();
      },
      now: this.now,
      // GPU 레인은 셰이더 컴파일이 끝날 때까지(소프트웨어 렌더러는 PBR 한 변종에 약 10초) 기다린다. NullEngine은 컴파일하지 않는다.
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

  /**
   * 장면·IBL까지 준비된 엔진을 만든다(IBL 프리필터가 비동기). IBL은 **최종 장면**에 만든다: 텍스처는 만든 장면과 수명을 같이 하므로
   * 임시 장면에 만들면 그 장면을 버릴 때 파괴돼 PBR 재질이 환경 텍스처 대기(isReady=false)에서 영원히 그려지지 않는다.
   */
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

  /** 물리 1스텝 + 장면 1프레임 렌더(렌더 루프와 테스트가 공유) */
  renderFrame(): void {
    if (this.disposed) return;
    try {
      this.physics.step();
    } catch (error) {
      // 브리지가 이미 물리를 중단했다(같은 예외가 프레임마다 반복되지 않는다). Babylon `_renderLoop`는 렌더 함수가 던지면 다음 프레임을
      // 예약하지 않아 뷰포트가 멈추므로 예외를 삼켜 루프를 유지하고, 실패는 앱에 알린다.
      this.reportFailure(error, "physics-step-failed", "물리 스텝 중 오류가 나 물리를 중단했습니다.");
    }
    this.beta.tick();
    this.pressureOutline.renderScene();
    this.frameStats.push(this.engine.getDeltaTime());
  }

  /** 뷰포트 카메라 조작(회전·핀치·휠·팬·키보드·더블클릭 초기화, scene-builder `attachControls`)을 캔버스에 붙인다. 드로잉 모드는 ViewportPane 오버레이가 가로챈다. */
  attachCameraControl(canvas: HTMLCanvasElement): void {
    this.character.attachControls(canvas, () => this.setCamera(this.framing));
  }


  /**
   * 소스 로드는 캡처와 같은 큐에서 한 번에 하나만 실행한다. 리그 교체는 unload → 비동기 빌드 → 대입이라 두 호출이 겹치면 둘 다 빈 상태에서
   * 시작해 각자 리그를 만들고, 나중 대입이 앞 리그를 덮어써 앞 리그의 노드·메시·GPU 자원이 장면에 남는다(두 캐릭터가 겹쳐 보임).
   * 캡처 중 리그가 해제되는 경합도 함께 막는다. 앞 작업이 실패해도 다음 작업은 실행된다.
   */
  async loadSource(source: CharacterSource): Promise<SourceCapabilities> {
    this.assertAlive();
    return this.runExclusive(() => this.loadSourceExclusive(source));
  }

  private async loadSourceExclusive(source: CharacterSource): Promise<SourceCapabilities> {
    // 큐에서 기다리는 동안 엔진이 해제됐을 수 있다.
    this.assertAlive();
    if (source.kind === "kit") this.rememberKitPlan(source.plan);
    // 같은 키트·베이스·베이스 파일이면 리그를 부수지 않고 바뀐 파츠만 교체한다(8 MiB 베이스를 다시 파싱하지 않는다).
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
      // 로드 중 엔진이 해제됐다: 장면은 이미 정리됐으므로 리그 객체만 해제하고 실패로 알린다.
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
      // provider가 새 리그의 체인을 거부해도 소스 로드는 끝까지 진행한다(브리지가 provider를 해제하고 비활성으로 되돌렸다).
      // 던지면 재질·카메라·페인트 연결이 빠진 반쯤 로드된 리그가 남고 앱은 이 소스를 실패로 막아 버린다.
      this.reportFailure(error, "physics-chains-rejected", "물리 provider가 체인·캡슐 설정을 거부했습니다.");
    }
    this.reattachPaint(rig);
    // 켜진 베타(NodeMaterial 툰·OpenPBR·IBL 그림자)의 자원을 새 리그에 맞춘다(비동기 빌드가 끝난 뒤 재질을 끼운다).
    await this.beta.reconcile();
    this.applyMaterialsForMode(rig);
    this.beta.syncIblShadows();
    this.setCamera(this.framing);
    return readRigSourceCapabilities(rig);
  }

  /**
   * 키트 증분 교체(계약 4.11): 로더가 바뀐 파츠만 받아 합치고 빠진 파츠만 해제한다. 엔진은 자기 쪽 참조(그림자 캐스터·패스 재질·베타 재질·
   * 페인트 데칼·물리 바인딩·재질 프리셋/틴트·마지막 플랜)를 새 파츠 구성에 맞춘다. 어느 단계든 실패하면 반쯤 바뀐 리그를 남기지 않고
   * 키트 전체를 해제한 뒤 실패를 던진다(앱 루프가 같은 소스를 값이 바뀔 때까지 다시 시도하지 않는다).
   */
  private async updateKitExclusive(kit: KitRigHandle, plan: KitPlan): Promise<SourceCapabilities> {
    const rig = kit.rig as CharacterRig;
    const before = [...rig.parts];
    let report: KitUpdateReport;
    try {
      report = await kit.update(plan);
    } catch (error) {
      // 로더가 이미 키트를 해제했다. 엔진 쪽 참조(베타 재질·패스 재질·캐스터·물리)를 정리한다.
      this.beta.releaseRig(rigWithParts(rig, before));
      this.unloadRig();
      for (const part of plan.parts) this.kitBytes.delete(this.kitCacheKey(part.url));
      return toFailure(error, "source-load-failed", "캐릭터 소스를 엔진에 바인딩하지 못했습니다.", this.now());
    }
    if (this.disposed) {
      // 교체를 기다리는 동안 엔진이 해제됐다: 장면은 이미 정리됐으므로 키트 객체만 해제하고 실패로 알린다.
      kit.dispose();
      throw failVisible("engine-disposed", "소스를 올리는 도중 엔진이 해제됐습니다. 엔진을 다시 선택하세요.", undefined, this.now());
    }
    try {
      if (report.removedRigParts.length > 0) {
        this.beta.releaseRig(rigWithParts(rig, report.removedRigParts));
        // 패스 재질은 partId 키라 같은 역할의 새 파츠(정점 색 유무가 다를 수 있다)가 옛 재질을 물려받지 않도록 버린다(다음 캡처에서 다시 만든다).
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
      // 새 타깃은 influence 0으로 시작하므로 마지막 플랜(morph·본 회전·색)을 다시 적용한다. 플랜이 아직 없으면 앱 루프가 곧 적용한다.
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

  /** partId를 키로 캐시한 밑색·ID 패스 재질을 해제한다(다음 캡처에서 파츠에 맞게 다시 만든다). */
  private disposePassMaterials(partId: number): void {
    this.flatMaterials.get(partId)?.dispose(true, false);
    this.flatMaterials.delete(partId);
    this.idMaterials.get(partId)?.dispose(true, false);
    this.idMaterials.delete(partId);
  }

  /**
   * 키트 파츠가 올라온 직후 재질을 맞춘다. 로더가 만든 PBR의 metallic·roughness는 GLB 값이므로 재질 프리셋(역할 기본)을 즉시 적용해 첫 플랜 전에도
   * 프리셋 값이 되게 하고, 틴트 파츠는 알베도 색(= 틴트 색)을 PBR에도 곱해 둔다. 플랜이 프리셋·색을 바꾸지 않아도 PBR이 흰색으로 남지 않는다.
   */
  private initializeKitParts(parts: readonly RigPart[], hooks: RigMaterialHooks): void {
    for (const part of parts) hooks.applyPreset(part, part.materialPreset);
  }

  /**
   * 키트 로더로 리그를 만든다. 주 리그(핸들 보관)와 썸네일 임시 리그(리그만 쓴다)가 공유한다.
   * `isolated`면 파일이 씬에 올라오는 순간부터 뷰포트 카메라가 보지 못하게 한다(`isolateTemporaryRig`는 조립이 끝난 뒤에야 불려 늦다 —
   * 그 사이 비동기 GLB 로드마다 프레임이 그려져 임시 캐릭터가 주 캐릭터 위에 겹쳐 보였다).
   */
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
      // 받은 바이트가 손상됐을 수 있으므로 이 키트의 캐시를 비운다(다음 시도가 다시 받는다).
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

  /** 키트 파일 바이트(캐시 우선, 키 = URL + 플랜 SHA-256). 검증은 키트 로더가 플랜의 bytes·SHA-256으로 한다. */
  private async fetchKitFile(url: string): Promise<Uint8Array> {
    const key = this.kitCacheKey(url);
    const cached = this.kitBytes.get(key);
    if (cached) return cached;
    const bytes = await (this.deps.fetchBytes ?? fetchKitBytesDefault)(url);
    this.kitBytes.set(key, bytes);
    return bytes;
  }

  /** 소스(절차·패키지·썸네일용 키트)에서 리그를 만든다. 주 리그와 썸네일 임시 리그가 공유한다(`isolated`는 썸네일 임시 리그). */
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
    // 썸네일 임시 리그 경로(주 리그의 키트는 `loadSourceExclusive`가 핸들을 보관하며 직접 만든다). 리그를 해제하면 키트 전체가 해제된다.
    if (source.kind === "kit") {
      this.rememberKitPlan(source.plan);
      return (await this.buildKit(source.plan, hooks, options)).rig as CharacterRig;
    }
    return this.loadPackage(source.plan, materialOptions, hooks);
  }

  /** 소스 로드 중 발견한 비치명 사항(규약 밖 메시·본 링크 없음 등, 한글) */
  sourceNotes(): readonly string[] {
    return this.rig?.notes ?? [];
  }

  /** 리그 평문 보고(파츠·메시 이름·morph 수·본 수). 소스가 없으면 null. Babylon 객체는 노출하지 않는다. */
  inspectRig(): RigInspection | null {
    return this.rig ? inspectRig(this.rig) : null;
  }

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
    // 패스 재질이 참조하는 텍스처는 공유(white·clear·SDF·알베도·페인트)이므로 재질만 해제한다(forceDisposeTextures=false).
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

  async setHandProp(attachment: HandPropAttachment | null): Promise<void> {
    return this.sceneProps.setHandProp(attachment);
  }

  async setHeadProp(attachment: HeadPropAttachment | null): Promise<void> {
    return this.sceneProps.setHeadProp(attachment);
  }

  async setStageProp(attachment: StagePropAttachment | null): Promise<void> {
    return this.sceneProps.setStageProp(attachment);
  }

  async setDuoPartner(attachment: DuoPartnerAttachment | null): Promise<void> {
    return this.sceneProps.setDuoPartner(attachment);
  }
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
    // 모드·IBL이 바뀌면 베타 자원(툰↔PBR 전용 재질, IBL 그림자)을 요청과 다시 맞춘다. 실패는 컨트롤러가 사유로 기록한다.
    void this.beta.reconcile().catch(() => undefined);
  }

  setCamera(framing: CameraFraming): void {
    this.assertAlive();
    this.framing = framing;
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const bounds = this.rig ? computeRigBounds(this.rig) : null;
    this.character.applyFraming(this.character.camera, framing, bounds, height > 0 ? width / height : 1);
    this.gaze.update();
  }
  eyeGaze() { return this.gaze.read(); }
  psdHairLayers() { return hairLayerSupport(this.rig); }

  currentFraming(): CameraFraming {
    return this.framing;
  }

  currentShading(): ShadingProfile {
    return this.shading;
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

  /** 모드(PBR/툰)에 맞춰 파츠 재질·외곽선·outline 셸 가시성을 바꾼다. */
  private applyMaterialsForMode(rig: CharacterRig | null, useBeta = true): void {
    if (!rig) return;
    const toon = this.shading.mode === "toon";
    const outline = toon ? this.shading.toon.outline : "none";
    const pressure = outline === "hull" && this.shading.toon.outlinePressure === true;
    this.pressureOutline.sync(rig, pressure, TOON_OUTLINE_WIDTH, outline === "hull" && !pressure);
    // 키트 hull은 Babylon 기본 깊이 오프셋(카메라 쪽으로 당김)을 끈다: 몸·속옷 hull이 꽉 낀 의상·신발(남성 부츠 발끝 등)을 뚫고 어두운 얼룩으로 비쳤다(실측, 0이면 사라짐).
    if (outline === "hull" && rig.kind === "kit") {
      const renderer = this.character.scene.getOutlineRenderer();
      renderer.zOffset = 0;
      renderer.zOffsetUnits = 0;
    }
    for (const part of rig.parts) {
      // 베타 재질(NodeMaterial 툰·OpenPBR)은 만들어져 있고 요청된 때만 끼운다. 아니면 기본 경로(ShaderMaterial 툰·PBRMaterial).
      const nodeToon = toon && useBeta ? this.beta.nodeToonMaterial(part) : null;
      const openPbr = !toon && useBeta ? this.beta.openPbrMaterial(part) : null;
      // 기본 ShaderMaterial 툰은 `ensureToonMaterial`이 값을 넣지만 NodeMaterial 툰은 따로 넣어야 한다(램프 단계·림·얼굴 SDF 변경이 반영되도록).
      if (nodeToon) this.beta.updateNodeToon(part, this.toonValues(part, rig), this.toonTextures(part));
      // 키트의 눈·입 안 계열·머리·속옷은 hull 외곽선을 켜지 않고 몸은 얇게 그린다(`outline-policy.ts`). 절차 소스는 모든 파츠에 켠다.
      const hull = outline === "hull" && hullOutlineAllowed(rig.kind, part.role);
      part.meshes.forEach((mesh, meshIndex) => {
        mesh.material = toon ? (nodeToon ?? this.ensureToonMaterial(part, rig)) : (openPbr ?? part.meshPbrs?.[meshIndex] ?? part.pbr);
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

  private ensureToonMaterial(part: RigPart, rig: CharacterRig): ShaderMaterial {
    if (!part.toon) {
      part.toon = createPassMaterial({ scene: this.character.scene, language: shaderLanguageFor(this.engine) }, "toon", `toon:${part.id}`, { vertexColor: usesRigVertexColor(part, rig) });
      part.toon.backFaceCulling = part.pbr.backFaceCulling;
    }
    setToonUniforms(part.toon, this.toonValues(part, rig));
    setAlphaCutoff(part.toon, rigPartAlphaCutoff(part));
    setToonTextures(part.toon, this.toonTextures(part));
    return part.toon;
  }

  /** 툰 uniform·텍스처를 ShaderMaterial 툰과 NodeMaterial 툰(있으면)에 같은 값으로 넣는다. */
  private pushToon(part: RigPart, rig: CharacterRig | null): void {
    const values = this.toonValues(part, rig);
    if (part.toon) setToonUniforms(part.toon, values);
    this.beta.updateNodeToon(part, values, this.toonTextures(part));
  }

  private refreshToonUniforms(rig: CharacterRig | null): void {
    if (!rig || this.shading.mode !== "toon") return;
    for (const part of rig.parts) this.pushToon(part, rig);
  }

  private toonTextures(part: RigPart): NodeToonTextures {
    return { albedo: rigPartAlbedoTexture(part, this.maskedParts.has(part), this.mouthMask, this.whiteTexture), paint: this.paintTextures.get(part.role) ?? this.clearTexture, sdf: this.sdfTexture };
  }

  /**
   * 절차 소스 `head` 파츠의 입 안 UV 섬을 어둡게 곱하는 알베도 마스크를 붙인다(PBR albedoTexture × albedoColor, 툰 albedoSampler × baseColor).
   * 알베도 텍스처가 이미 있는 파츠(제작 패키지)는 건드리지 않는다.
   */
  private applyMouthMask(rig: CharacterRig): void {
    if (rig.kind !== "procedural") return;
    for (const part of rig.parts) {
      if (part.role !== "head" || part.hasAlbedoTexture) continue;
      part.pbr.albedoTexture = this.mouthMask;
      this.maskedParts.add(part);
    }
  }

  private toonValues(part: RigPart, rig: CharacterRig | null): ToonUniformValues {
    return rigToonValues(part, rig, {
      shading: this.shading, character: this.character, averageColor: this.ibl.averageColor,
      hasPaint: this.paintTextures.get(part.role) !== null, hasAlbedo: rigPartHasAlbedoTexture(part, this.maskedParts.has(part)),
    });
  }

  private materialOptions(): MaterialFactoryOptions {
    return { scene: this.character.scene, sssAvailable: this.character.sssAvailable };
  }

  /**
   * 리그 재질 훅. `rigOf`는 훅이 호출될 때의 리그를 돌려준다(주 리그는 `this.rig`, 임시 리그는 자기 자신 — 툰 얼굴 SDF 축이 리그별이다).
   * `trackFlatPass`가 true면(주 리그만) 색 변경을 밑색 패스 재질 캐시에도 반영한다. 임시 리그는 패스 재질 캐시(partId 키)를
   * 공유하면 주 리그와 충돌하므로 건드리지 않는다.
   */
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
        // 알베도 텍스처가 있는 파츠는 보통 레시피 색을 곱하지 않지만, 키트 틴트 파츠(recolor·fixed)는 텍스처 × 색을 PBR에도 곱한다(툰의 baseColor × 알베도와 같다).
        if (!part.hasAlbedoTexture || part.tint !== undefined) setMaterialAlbedo(part.pbr, part.materialPreset, hex);
        this.pushToon(part, rigOf());
        this.beta.updateOpenPbr(part);
        if (!trackFlatPass) return;
        const flat = this.flatMaterials.get(part.partId);
        if (flat) setFlatUniforms(flat, { baseColor: srgb(hex), hasPaint: this.paintTextures.get(part.role) !== null, hasAlbedo: rigPartHasAlbedoTexture(part, this.maskedParts.has(part)) });
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

  /** 결정성 영수증(provider가 포트를 주면). poseHash는 호출자(export)가 레시피에서 만든다. */
  physicsReceipt(poseHash: string): Promise<PhysicsReceiptLike | null> {
    return this.physics.receipt(poseHash);
  }

  /** 월드 변환이 없어 비활성인 충돌 캡슐 본(진단) */
  pendingColliderBones(): readonly string[] {
    return this.physics.pendingColliderBones();
  }

  /**
   * 캡처 계열 작업과 소스 로드를 직렬화한다: 캡처 카메라·RTT·(현재 리그의 일시 플랜 적용)을 공유하므로 겹치면 서로의 프레이밍·플랜을
   * 오염시키고, 소스 로드는 리그를 해제·교체하므로 캡처나 다른 로드와 겹치면 안 된다. 앞선 작업이 실패해도 다음 작업은 실행된다.
   */
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

  /**
   * 현재 리그에 플랜을 일시 적용해 그리고 정확히 되돌린다(스냅샷 복원: 마지막 플랜 유무와 무관).
   * 적용·렌더·readPixels 호출·복원은 한 번의 동기 구간이라(capture.ts `around`) readback을 기다리는 동안 뷰포트는 원래 상태를 그린다.
   */
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
        // 비동기 셰이더 준비 중 메인 applyLoop의 최신 포즈를 덮어쓰지 않도록 동기 적용 직전에 스냅샷을 뜬다.
        snapshot = snapshotRig(rig);
        applyRigPlan(rig, req.plan, { outlinesVisible: this.outlinesVisible() });
        applyRigEyeGaze(rig, req.plan.eyeGaze, this.viewportCamera().position);
        this.refreshToonUniforms(rig);
      },
      after: restore,
    });
  }

  /**
   * 지오메트리 프리셋 카드: `req.source`로 **임시 리그**를 만들어 `req.plan`을 적용해 그린 뒤 해제한다. 주 리그·마지막 플랜·
   * 그림자 캐스터·물리 바인딩은 건드리지 않는다. 임시 메시는 전용 레이어 마스크로 메인 카메라에서 숨기고 그림자를 받지 않는다
   * (주 리그의 그림자 맵이 섞이지 않도록 그림자 맵 갱신도 하지 않는다). 키트 임시 리그는 GLB를 비동기로 하나씩 올리므로 마스크를
   * 조립이 끝난 뒤(`isolateTemporaryRig`)가 아니라 **씬에 올리기 전에** 로더가 건다(`buildKit`의 `isolated`).
   */
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
      // 썸네일 임시 리그는 베타 재질을 만들지 않는다(기본 경로로 그린다).
      this.applyMaterialsForMode(rig, false);
      applyRigPlan(rig, req.plan, { outlinesVisible: this.outlinesVisible() });
      applyRigEyeGaze(rig, req.plan.eyeGaze, this.viewportCamera().position);
      this.refreshToonUniforms(rig);
      return await captureThumbnail({ ...this.captureDeps(rig), shadow: null }, req.size, req.framing);
    } finally {
      // 엔진이 해제됐으면 scene.dispose가 모든 객체를 정리했으므로 다시 해제하지 않는다.
      if (holder.rig && !this.disposed) { this.pressureOutline.release(holder.rig); holder.rig.dispose(); }
    }
  }

  /** 임시 리그 메시를 메인 카메라에서 숨기고(레이어 마스크) 그림자를 받지 않게 한다. */
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

  /** 마지막 플랜의 결정적 digest(없으면 "no-plan"). 레시피 digest는 export 측이 레시피에서 만든다. */
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
          material = createPassMaterial(deps, "flat", `flat:${part.id}`, { vertexColor: usesRigVertexColor(part, this.rig) });
          this.flatMaterials.set(part.partId, material);
        }
        material.backFaceCulling = part.pbr.backFaceCulling;
        setFlatUniforms(material, { baseColor: srgb(part.colorHex), hasPaint: this.paintTextures.get(part.role) !== null, hasAlbedo: rigPartHasAlbedoTexture(part, this.maskedParts.has(part)) });
        setAlphaCutoff(material, rigPartAlphaCutoff(part));
        setFlatTextures(material, { albedo: rigPartAlbedoTexture(part, this.maskedParts.has(part), this.mouthMask, this.whiteTexture), paint: this.paintTextures.get(part.role) ?? this.clearTexture });
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

  jointHandles(): readonly JointDragHandle[] {
    const rig = this.rig;
    if (this.disposed || !rig) return [];
    const camera = this.character.camera;
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const viewProjection = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
    const viewport = new Viewport(0, 0, width, height);
    const handles: JointDragHandle[] = [];
    for (const [bone, rb] of rig.humanoid) {
      const world = rigBoneWorld(rb).position;
      const projected = Vector3.Project(toVector3(world), Matrix.IdentityReadOnly, viewProjection, viewport);
      handles.push({ bone, screen: [projected.x, projected.y], world });
    }
    return handles;
  }

  viewportCamera(): ViewportCameraInfo {
    const camera = this.character.camera;
    // 위치는 구면 좌표에서 직접 계산한다(ArcRotateCamera의 globalPosition은 다음 렌더 전까지 이전 값일 수 있다).
    const target = fromVector3(camera.target);
    const sinBeta = Math.sin(camera.beta);
    const position: Vec3 = [
      target[0] + camera.radius * Math.cos(camera.alpha) * sinBeta,
      target[1] + camera.radius * Math.cos(camera.beta),
      target[2] + camera.radius * Math.sin(camera.alpha) * sinBeta,
    ];
    const direction = v3Sub(target, position);
    const forward: Vec3 = v3Length(direction) < 1e-9 ? [0, 0, -1] : v3Normalize(direction);
    // 우수 좌표 카메라 기저: right = forward × worldUp (forward가 world up과 평행이면 +X로 대체), up = right × forward
    const crossUp = v3Cross(forward, [0, 1, 0]);
    const right: Vec3 = v3Length(crossUp) < 1e-6 ? [1, 0, 0] : v3Normalize(crossUp);
    const up: Vec3 = v3Cross(right, forward);
    return { position, forward, right, up, fovY: camera.fov, width: this.engine.getRenderWidth(), height: this.engine.getRenderHeight() };
  }

  /** 관절 드래그·IK용 포즈 프레임 스켈레톤(휴머노이드 이름, 포즈 규약별 rest). 본이 없으면 null. */
  poseSkeleton(): SkeletonData | null {
    return this.rig ? rigPoseSkeleton(this.rig) : null;
  }

  /** 본의 현재 월드 변환·로컬 회전(진단·테스트). 이름은 소스 이름 또는 휴머노이드 이름. */
  readBone(name: string): BoneReading | null {
    const rig = this.rig;
    if (!rig) return null;
    const rb = rig.bones.get(name) ?? (isHumanoidBoneName(name) ? rig.humanoid.get(name) : undefined);
    if (!rb) return null;
    const world = rigBoneWorld(rb);
    return { name: rb.name, humanoid: rb.humanoid, position: world.position, rotation: world.rotation, localRotation: fromQuaternion(rb.node.rotationQuaternion), auxiliary: rb.auxiliary };
  }

  /** 부위별 페인트 텍스처 점검(크기·revision·invertY·decal 연결). 텍스처가 없으면 빈 배열. */
  inspectPaint(): readonly PaintInspection[] {
    return readPaintInspection(this.rig, this.paintTextures);
  }

  /** 장면 설정 평문 보고(우수 좌표·clear 알파·톤맵·광원·그림자 생성기 등). Babylon 객체는 노출하지 않는다. */
  inspectScene(): SceneInspection {
    return inspectCharacterScene(this.character);
  }

  updatePaintTexture(layer: PaintLayer): void {
    this.assertAlive();
    const texture = this.paintTextures.upload(layer);
    const rig = this.rig;
    if (!rig) return;
    this.bindPaint(rig, layer.part, texture);
  }

  /** 새 리그에 기존 페인트 텍스처(부위별)를 다시 붙인다(소스 재로드·device lost 복원). */
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
      // PBR decalMap 플러그인 getter가 지연 생성하므로 런타임에는 null이 아니다(타입만 Nullable).
      const decal = part.pbr.decalMap;
      if (decal) decal.isEnabled = true;
      if (part.toon) setToonTextures(part.toon, { albedo: rigPartAlbedoTexture(part, this.maskedParts.has(part), this.mouthMask, this.whiteTexture), paint: texture, sdf: this.sdfTexture });
      this.pushToon(part, rig);
      const flat = this.flatMaterials.get(part.partId);
      if (flat) setFlatTextures(flat, { albedo: rigPartAlbedoTexture(part, this.maskedParts.has(part), this.mouthMask, this.whiteTexture), paint: texture });
    }
  }


  async exportGlb(): Promise<Uint8Array> {
    this.assertAlive();
    const rig = this.requireRig("glb-no-source", "GLB로 내보낼 캐릭터 소스가 없습니다.");
    const releaseGaze = this.gaze.hold();
    // 입 안 마스크는 알베도 RawTexture라 serializer가 `readPixels`로 PNG를 만든다. GPU 레인에서는 baseColor 텍스처로 함께 내보내진다(브라우저 실측: 이미지 1장).
    // readback이 없는 레인(NullEngine)은 그 읽기가 끝나지 않아 내보내기가 멈추므로 이때만 마스크를 잠시 떼고 내보낸다.
    const detached = this.lane === "null" ? rig.parts.filter((part) => this.maskedParts.has(part)) : [];
    for (const part of detached) part.pbr.albedoTexture = null;
    // 툰(ShaderMaterial·NodeMaterial)·OpenPBR는 glTF 재질로 내보낼 수 없다(serializer가 "Unsupported material"로 기본 재질을 쓴다 — 브라우저 실측).
    // 내보내기는 보는 셰이딩 모드와 무관하게 파츠의 PBR 재질로 하므로 내보내는 동안만 PBR로 바꿨다가 되돌린다(뷰포트가 그동안 PBR로 보인다).
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

  readHud(): HudSample {
    return readEngineHud({
      scene: this.character.scene,
      diagnostics: this.diagnostics,
      lane: this.lane,
      frameStats: this.frameStats,
      hud: this.hud,
      backend: this.backend,
      physics: this.physics,
      shading: this.shading,
    });
  }

  sceneFeatures(): FullSceneFeatureReport {
    return readEngineFeatures({
      postfx: this.postfx,
      rig: this.rig,
      engine: this.engine,
      character: this.character,
      shading: this.shading,
      ibl: this.ibl,
      hud: this.hud,
      beta: this.beta,
      lastGlbReport: this.lastGlbReport,
    });
  }

  betaFeatures(): BetaFeatureReport {
    return this.beta.report();
  }

  async setBetaFeature(id: BetaFeatureId, enabled: boolean): Promise<BetaFeatureState> {
    this.assertAlive();
    if (!BETA_FEATURE_IDS.includes(id)) throw failVisible("beta-unknown", `알 수 없는 베타 기능입니다: ${String(id)}`, undefined, this.now());
    return this.beta.set(id, enabled);
  }

  /** 투영 페인트 포트(베타가 켜져 있을 때만). 드로잉 드라이버가 스트로크마다 확인한다. */
  projectionPaint(): ProjectionPaintPort | null {
    return this.disposed ? null : this.beta.projectionPort();
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
    this.postfx.dispose();
    this.hud.dispose();
    this.physics.dispose();
    this.ibl.dispose();
    this.character.dispose();
    if (this.deps.disposeEngine) this.deps.disposeEngine();
    else this.engine.dispose();
  }

  /** 엔진을 계속 쓸 수 있는 실패를 앱에 알린다. 보고 콜백이 던져도 렌더 루프·로드를 깨지 않는다. */
  private reportFailure(error: unknown, code: string, reasonKo: string): void {
    const failure = isLabFailure(error) ? error : failVisible(code, reasonKo, error, this.now());
    try {
      this.deps.onFailure?.(failure);
    } catch {
      // 의도적으로 무시: 알림 경로 자체의 오류로 프레임 루프를 멈추지 않는다.
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
