/**
 * Studio BG3D 씬 문서 런타임 상수·예산 오류 정본 계약.
 * `bg3d/studio-bg3d-scene-document-types.ts` 의 타입 정의와 런타임 값을 분리해
 * 초기 정적 그래프가 대용량 타입 모듈을 값으로 끌어오지 않도록 유지한다.
 */

import { STUDIO_3D_LOCAL_WASM64_MAX_BYTES } from "../import-safety/studio-3d-upload-limit-policy";

import type {
  StudioBg3dAnimationPlayback,
  StudioBg3dConstraintLayer,
  StudioBg3dMaterialOverride,
  StudioBg3dMorphLayer,
  StudioBg3dPoseLayer,
  StudioBg3dSceneDocumentBudgetErrorCode,
} from "../bg3d/studio-bg3d-scene-document-types";

export const STUDIO_BG3D_SCENE_DOCUMENT_KIND = "toonstudio.bg3d-scene" as const;
export const STUDIO_BG3D_SCENE_DOCUMENT_VERSION = 3 as const;
export const STUDIO_BG3D_SIX_PASS_SCENE_DOCUMENT_VERSION = 4 as const;
export const STUDIO_BG3D_SCHEMA_V2_SCENE_DOCUMENT_VERSION = 2 as const;
export const STUDIO_BG3D_LEGACY_SCENE_DOCUMENT_VERSION = 1 as const;
export const STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES = 320 * 1024;
export const STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES = 512;
export const STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS = 256;
export const STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS = 64;
export const STUDIO_BG3D_SHOT_ID_MAX_LENGTH = 80;
export const STUDIO_BG3D_SHOT_NAME_MAX_LENGTH = 80;
export const STUDIO_BG3D_SHOT_MAX_NODE_VISIBILITY_OVERRIDES =
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES;
export const STUDIO_BG3D_GLB_MIME = "model/gltf-binary" as const;
export const STUDIO_BG3D_GLB_MAX_BYTES = STUDIO_3D_LOCAL_WASM64_MAX_BYTES;

/**
 * Typed fail-closed signal for editor normalization. Strict parse/serialize APIs continue to return
 * `null`; the lenient editor API throws this error instead of returning a valid-looking prefix.
 */
export class StudioBg3dSceneDocumentBudgetError extends Error {
  readonly code: StudioBg3dSceneDocumentBudgetErrorCode;

  constructor(code: StudioBg3dSceneDocumentBudgetErrorCode) {
    super(`Studio BG3D scene document budget exceeded: ${code}.`);
    this.name = "StudioBg3dSceneDocumentBudgetError";
    this.code = code;
  }
}

export function failBudget(code: StudioBg3dSceneDocumentBudgetErrorCode): never {
  throw new StudioBg3dSceneDocumentBudgetError(code);
}

export const STUDIO_BG3D_PRIMITIVE_KINDS = [
  "box",
  "cylinder",
  "plane",
  "sphere",
  "hemisphere",
  "cone",
  "pyramid",
  "triangularPrism",
  "hexPrism",
  "torus",
  "tube",
  "ring",
  "capsule",
] as const;

export const STUDIO_BG3D_SKY_PRESET_IDS = ["blank", "clear_day", "sunset", "night"] as const;

export const DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE: StudioBg3dMaterialOverride = Object.freeze({
  colorMode: "original",
  color: "#ffffff",
  colorStrength: 1,
  opacityMultiplier: 1,
  roughness: null,
  metalness: null,
  emissiveColor: "#000000",
  emissiveIntensity: null,
  wireframe: false,
  doubleSided: false,
});

export const DEFAULT_STUDIO_BG3D_ANIMATION_PLAYBACK: StudioBg3dAnimationPlayback = Object.freeze({
  clipIndex: 0,
  playing: false,
  loop: "repeat",
  timeSeconds: 0,
  timeScale: 1,
  weight: 1,
});

export const DEFAULT_STUDIO_BG3D_POSE_LAYER: StudioBg3dPoseLayer = Object.freeze({
  enabled: true,
  weight: 1,
  joints: Object.freeze([]),
});

export const DEFAULT_STUDIO_BG3D_MORPH_LAYER: StudioBg3dMorphLayer = Object.freeze({
  enabled: true,
  weight: 1,
  targets: Object.freeze([]),
});

export const STUDIO_BG3D_AIM_AXES = [
  "+x", "-x", "+y", "-y", "+z", "-z",
] as const;

export const STUDIO_BG3D_MAX_TWO_BONE_IK_CONSTRAINTS = 32;

export const DEFAULT_STUDIO_BG3D_CONSTRAINT_LAYER: StudioBg3dConstraintLayer = Object.freeze({
  enabled: true,
  aims: Object.freeze([]),
  twoBoneIks: Object.freeze([]),
});

export const STUDIO_BG3D_INTERIOR_SUPPRESSION_DEFAULT_STRENGTH = 0.6;
