/**
 * 장면 빌더: 우수 좌표·투명 clear·ArcRotateCamera(뷰포트용 + 캡처 전용)·약한 반구광 + key DirectionalLight·
 * CascadedShadowGenerator(PCF/PCSS, 지원 엔진) 또는 ShadowGenerator 대체(사유 기록)·톤맵(KHR_PBR_NEUTRAL/ACES/없음)·
 * PrePass SubSurface(지원 시). 모든 가용성은 scene-features로 보고한다.
 */
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";

import { DEFAULT_FRAMING, describeDetail } from "../../contracts";
import { v3Negate, v3Scale } from "../../shared/math";
import { DEFAULT_VERTICAL_FOV, FALLBACK_BOUNDS, resolveFraming } from "../camera-framing";
import { DEFAULT_SKY } from "../procedural-sky";
import { featureActive, featureOff, featureUnavailable } from "../scene-features";
import { resolveOrbitLimits } from "../viewport-orbit";

import { toVector3 } from "./convert";
import { attachViewportControls, setPanBounds } from "./viewport-controls";

import type { CameraFraming, ShadingProfile, ToneMapping, Vec3 } from "../../contracts";
import type { WorldBounds } from "../camera-framing";
import type { SceneInspection } from "../rig-inspection";
import type { SceneFeatureState } from "../scene-features";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";

export const SHADOW_MAP_SIZE = 2048;
export const CAMERA_NEAR = 0.05;
export const CAMERA_FAR = 50;

export interface CharacterScene {
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  /** 캡처 전용(후처리 파이프라인을 붙이지 않는다) */
  readonly captureCamera: ArcRotateCamera;
  readonly keyLight: DirectionalLight;
  readonly fillLight: HemisphericLight;
  readonly shadow: ShadowGenerator | null;
  /** 태양(광원)을 향하는 단위 벡터 */
  readonly sunDirection: Vec3;
  readonly sssAvailable: boolean;
  shadowState(): SceneFeatureState;
  sssState(): SceneFeatureState;
  applyShadowProfile(shadows: ShadingProfile["shadows"]): void;
  setToneMapping(mode: ToneMapping): void;
  /**
   * 프레이밍을 카메라에 적용(aspect = 렌더 종횡비). 대상 크기 기반 궤도 한계(최소·최대 거리, 팬 범위 = 캐릭터 경계 상자)도 함께 건다(F-01, `viewport-orbit.ts`).
   * 프레이밍이 정한 반경은 항상 한계 안이라 캡처 카메라 결과는 바뀌지 않는다.
   */
  applyFraming(camera: ArcRotateCamera, framing: CameraFraming, bounds: WorldBounds | null, aspect: number): void;
  /** 뷰포트 카메라 입력(회전·핀치는 Babylon, 휠·팬·키보드·더블클릭은 `viewport-controls.ts`)을 캔버스에 붙인다. `resetView`는 시점 초기화. */
  attachControls(canvas: HTMLCanvasElement, resetView: () => void): () => void;
  addShadowCasters(meshes: readonly AbstractMesh[]): void;
  clearShadowCasters(): void;
  dispose(): void;
}

function createCamera(name: string, scene: Scene): ArcRotateCamera {
  const camera = new ArcRotateCamera(name, Math.PI / 2, Math.PI / 2, 3, new Vector3(0, 0.85, 0), scene, false);
  camera.minZ = CAMERA_NEAR;
  camera.maxZ = CAMERA_FAR;
  camera.fov = DEFAULT_VERTICAL_FOV;
  // 소스를 올리기 전 기본 한계(1.7 m 인체 bbox 전신 기준). 이전 고정 하한 0.15 m는 얼굴 프레이밍에서 머리 안이었다(F-01).
  const limits = resolveOrbitLimits(DEFAULT_FRAMING, FALLBACK_BOUNDS);
  camera.lowerRadiusLimit = limits.lowerRadius;
  camera.upperRadiusLimit = limits.upperRadius;
  return camera;
}

export function createCharacterScene(engine: AbstractEngine): CharacterScene {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.autoClear = true;
  scene.autoClearDepthAndStencil = true;
  scene.environmentIntensity = 1;

  const imageProcessing = scene.imageProcessingConfiguration;
  imageProcessing.toneMappingEnabled = true;
  imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  imageProcessing.exposure = 1;
  imageProcessing.contrast = 1;

  const camera = createCamera("main-camera", scene);
  scene.activeCamera = camera;
  const captureCamera = createCamera("capture-camera", scene);

  const sunDirection = DEFAULT_SKY.sunDirection;
  const fillLight = new HemisphericLight("fill-light", new Vector3(0, 1, 0), scene);
  fillLight.intensity = 0.35;
  fillLight.groundColor = new Color3(0.3, 0.28, 0.3);
  const keyLight = new DirectionalLight("key-light", toVector3(v3Negate(sunDirection)), scene);
  keyLight.intensity = 2.4;
  keyLight.diffuse = new Color3(1, 0.97, 0.92);
  keyLight.position = toVector3(v3Scale(sunDirection, 6));
  keyLight.shadowMinZ = 0.1;
  keyLight.shadowMaxZ = 20;

  let shadow: ShadowGenerator | null = null;
  let csm: CascadedShadowGenerator | null = null;
  let shadowState: SceneFeatureState;
  try {
    if (CascadedShadowGenerator.IsSupported) {
      csm = new CascadedShadowGenerator(SHADOW_MAP_SIZE, keyLight);
      csm.numCascades = 2;
      csm.lambda = 0.85;
      csm.stabilizeCascades = true;
      csm.autoCalcDepthBounds = false;
      csm.shadowMaxZ = 12;
      csm.depthClamp = true;
      csm.cascadeBlendPercentage = 0.1;
      csm.bias = 0.004;
      csm.normalBias = 0.02;
      csm.usePercentageCloserFiltering = true;
      csm.filteringQuality = ShadowGenerator.QUALITY_HIGH;
      shadow = csm;
      shadowState = featureActive(`${SHADOW_MAP_SIZE}² CSM`);
    } else {
      shadow = new ShadowGenerator(Math.min(SHADOW_MAP_SIZE, Math.max(256, engine.getCaps().maxTextureSize)), keyLight);
      shadow.bias = 0.004;
      shadow.normalBias = 0.02;
      shadow.usePercentageCloserFiltering = true;
      shadowState = featureUnavailable("이 엔진은 CascadedShadowGenerator를 지원하지 않아 단일 ShadowGenerator로 대체합니다(캐스케이드 수 무시).");
    }
  } catch (error) {
    shadow = null;
    shadowState = featureUnavailable(`그림자 생성기를 만들지 못했습니다(${describeDetail(error) ?? "알 수 없는 오류"}).`);
  }

  let sssAvailable = false;
  let sssState: SceneFeatureState;
  try {
    // PrePassRenderer.isSupported = caps.drawBuffersExtension. 미지원 엔진에서 enablePrePassRenderer를 부르면 Babylon이
    // 콘솔 오류를 내므로(NullEngine·WebGL1) 먼저 능력을 확인하고 사유만 남긴다.
    const prePass = engine.getCaps().drawBuffersExtension ? scene.enablePrePassRenderer() : null;
    const subSurface = prePass ? scene.enableSubSurfaceForPrePass() : null;
    if (subSurface) {
      subSurface.metersPerUnit = 1;
      sssAvailable = true;
      sssState = featureActive("PrePass SubSurfaceConfiguration");
    } else {
      sssState = featureUnavailable("PrePassRenderer를 만들 수 없어(다중 렌더 타깃이 있는 WebGL2/WebGPU 필요) 피부 SSS를 끕니다.");
    }
  } catch (error) {
    sssState = featureUnavailable(`PrePass 초기화 실패(${describeDetail(error) ?? "알 수 없는 오류"}).`);
  }

  let shadowsEnabled = true;
  const casters = new Set<AbstractMesh>();

  return {
    scene,
    camera,
    captureCamera,
    keyLight,
    fillLight,
    shadow,
    sunDirection,
    sssAvailable,
    shadowState: () => (shadowsEnabled ? shadowState : featureOff("프로파일에서 그림자를 껐습니다.")),
    sssState: () => sssState,
    applyShadowProfile(shadows) {
      shadowsEnabled = shadows.enabled;
      keyLight.shadowEnabled = shadows.enabled;
      if (!shadow) return;
      if (csm) csm.numCascades = shadows.cascades;
      shadow.useContactHardeningShadow = shadows.contactHardening;
      if (!shadows.contactHardening) shadow.usePercentageCloserFiltering = shadows.pcf;
      shadow.filteringQuality = shadows.pcf ? ShadowGenerator.QUALITY_HIGH : ShadowGenerator.QUALITY_LOW;
    },
    setToneMapping(mode) {
      imageProcessing.toneMappingEnabled = mode !== "none";
      imageProcessing.toneMappingType = mode === "aces" ? ImageProcessingConfiguration.TONEMAPPING_ACES : ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
    },
    applyFraming(target, framing, bounds, aspect) {
      const box = bounds ?? FALLBACK_BOUNDS;
      const ratio = aspect > 0 ? aspect : 1;
      const resolved = resolveFraming(framing, box, DEFAULT_VERTICAL_FOV, ratio);
      const limits = resolveOrbitLimits(framing, box, DEFAULT_VERTICAL_FOV, ratio);
      target.lowerRadiusLimit = limits.lowerRadius;
      target.upperRadiusLimit = limits.upperRadius;
      target.target = toVector3(resolved.target);
      target.alpha = resolved.alpha;
      target.beta = resolved.beta;
      target.radius = resolved.radius;
      target.fov = resolved.fov;
      setPanBounds(target, limits.panBounds);
    },
    attachControls(canvas, resetView) {
      return attachViewportControls(camera, canvas, resetView);
    },
    addShadowCasters(meshes) {
      for (const mesh of meshes) {
        if (casters.has(mesh)) continue;
        casters.add(mesh);
        shadow?.addShadowCaster(mesh, false);
      }
    },
    clearShadowCasters() {
      for (const mesh of casters) shadow?.removeShadowCaster(mesh, false);
      casters.clear();
    },
    dispose() {
      shadow?.dispose();
      scene.dispose();
    },
  };
}

/** 장면 설정 평문 보고 */
export function inspectCharacterScene(character: CharacterScene): SceneInspection {
  const { scene, shadow } = character;
  const cascaded = shadow instanceof CascadedShadowGenerator ? shadow : null;
  const clear = scene.clearColor;
  return {
    rightHanded: scene.useRightHandedSystem,
    clearColor: [clear.r, clear.g, clear.b, clear.a],
    toneMappingEnabled: scene.imageProcessingConfiguration.toneMappingEnabled,
    toneMappingType: scene.imageProcessingConfiguration.toneMappingType,
    exposure: scene.imageProcessingConfiguration.exposure,
    environmentIntensity: scene.environmentIntensity,
    cameraNames: scene.cameras.map((camera) => camera.name),
    activeCamera: scene.activeCamera?.name ?? null,
    lightNames: scene.lights.map((light) => light.name),
    shadowGenerator: shadow ? shadow.getClassName() : "none",
    shadowCascades: cascaded ? cascaded.numCascades : null,
    shadowEnabled: character.keyLight.shadowEnabled,
    shadowMapSize: shadow ? shadow.getShadowMap()?.getSize().width ?? null : null,
    sssPrePass: character.sssAvailable,
    meshCount: scene.meshes.length,
    viewportMeshCount: scene.meshes.filter((mesh) => mesh.isVisible && mesh.isEnabled() && (mesh.layerMask & character.camera.layerMask) !== 0).length,
    skeletonCount: scene.skeletons.length,
    materialCount: scene.materials.length,
    textureCount: scene.textures.length,
    transformNodeCount: scene.transformNodes.length,
  };
}
