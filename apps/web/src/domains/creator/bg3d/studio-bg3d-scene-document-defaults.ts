/**
 * Studio bg3d 씬 문서 — 정규화되지 않은 기본 원본 문서 리터럴.
 *
 * `studio-bg3d-scene-document.ts`의 정규화기가 기본값·상한 참조로 쓰는 순수 데이터다.
 * 값 변경은 문서 기본값 변경이므로 정규화 테스트와 함께 움직인다.
 */

import {
  STUDIO_BG3D_CAMERA_DEFAULT_NEAR_CLIP,
  STUDIO_BG3D_CAMERA_DEFAULT_UP,
} from "./studio-bg3d-camera-orientation";
import {
  STUDIO_BG3D_SCENE_DOCUMENT_KIND,
  STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
  type StudioBg3dVec3,
} from "./studio-bg3d-scene-document-types";

export const DEFAULT_STUDIO_BG3D_CAMERA_POSITION: StudioBg3dVec3 = [4, 3, 6];
export const DEFAULT_STUDIO_BG3D_CAMERA_TARGET: StudioBg3dVec3 = [0, 0.6, 0];

export const DEFAULT_STUDIO_BG3D_RAW_DOCUMENT = {
  kind: STUDIO_BG3D_SCENE_DOCUMENT_KIND,
  version: STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
  camera: {
    position: DEFAULT_STUDIO_BG3D_CAMERA_POSITION,
    target: DEFAULT_STUDIO_BG3D_CAMERA_TARGET,
    fovDegrees: 50,
    projection: "perspective",
    zoom: 1,
    nearClip: STUDIO_BG3D_CAMERA_DEFAULT_NEAR_CLIP,
    up: STUDIO_BG3D_CAMERA_DEFAULT_UP,
  },
  render: {
    antialias: true,
    shadows: true,
    exposure: 1,
    toneMapping: "neutral",
    colorSpace: "srgb",
  },
  background: {
    mode: "sky-preset",
    color: "#ffffff",
    skyPresetId: "blank",
    panoramaRotation: 0,
    fogEnabled: false,
    fogColor: "#ffffff",
    fogNear: 10,
    fogFar: 50,
  },
  lighting: {
    ambientColor: "#ffffff",
    ambientIntensity: 0.75,
    key: {
      color: "#ffffff",
      direction: [4, 6, 4],
      intensity: 1.1,
      castsShadow: true,
    },
    fill: {
      color: "#ffffff",
      direction: [-4, 3, -3],
      intensity: 0.35,
      castsShadow: false,
    },
    environment: {
      source: "procedural",
      assetId: null,
      intensity: 1,
      rotationDegrees: 0,
      useAsBackground: false,
    },
  },
  quality: {
    desktop: {
      targetFps: 60,
      dprMin: 1,
      dprMax: 2,
      maxRenderPixels: 12_582_912,
      shadows: true,
      shadowMapSize: 2048,
      textureScale: 1,
      lodBias: 0,
    },
    mobile: {
      targetFps: 30,
      dprMin: 0.9,
      dprMax: 1.5,
      maxRenderPixels: 4_194_304,
      shadows: true,
      shadowMapSize: 2048,
      textureScale: 1,
      lodBias: 0,
    },
  },
  output: {
    transparentBackground: false,
    exportHeight: 640,
    line: {
      enabled: true,
      layerType: "raster",
      color: "#000000",
      widthPx: 1.75,
      strength: 0.8,
      accuracy: 0.75,
      scaleAwareAccuracy: true,
      exteriorOutlineStrength: 1,
      depthEnabled: false,
      depthStrength: 0.5,
      depthOutlineOnly: true,
      smoothing: 0.5,
      textureLineEnabled: true,
      textureLineStrength: 0.5,
      creaseAngleDegrees: 20,
      hiddenLineRemoval: true,
    },
    tone: {
      // A 3D background should look like the shaded viewport when it is first inserted. Earlier
      // defaults disabled this layer, so the LT exporter truthfully emitted only edge rasters and
      // users saw an apparently broken wireframe. Dedicated line-art presets can still opt into
      // `none`; the general-purpose default preserves the rendered material colors.
      mode: "flat",
      type: "color",
      pattern: "dot",
      levels: 4,
      opacity: 1,
      frequency: 60,
      angleDegrees: 45,
    },
  },
  budgets: {
    complexity: {
      maxNodes: 256,
      maxTriangles: 2_000_000,
      maxDrawCalls: 512,
      maxMaterials: 256,
      maxLights: 4,
      maxAnimations: 64,
      maxAnimationChannels: 1_024,
      maxAnimationKeyframes: 1_000_000,
      maxAnimationValues: 8_000_000,
      maxSkins: 64,
      maxJoints: 2_048,
      maxMorphTargets: 256,
      maxAccessorElements: 40_000_000,
      maxDecodedGeometryBytes: 256 * 1024 * 1024,
      maxModelBytes: 256 * 1024 * 1024,
    },
    textures: {
      maxTextures: 128,
      maxTotalBytes: 256 * 1024 * 1024,
      maxDimension: 8192,
    },
  },
  attachments: [],
  nodes: [],
} as const;

