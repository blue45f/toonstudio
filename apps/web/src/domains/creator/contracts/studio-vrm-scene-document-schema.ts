/**
 * Studio VRM 씬 문서(v6)의 스키마 상수·예산 오류·타입·기본값 및 키 집합 계약.
 */
import {
  STUDIO_VRM_FINGER_BONES,
  STUDIO_VRM_HUMANOID_BONES,
  type StudioVrmCanonicalData,
} from "@toonstudio/contracts/studio-vrm-scene-fields";
import {
  STUDIO_VRM_RIG_PROFILE_PURPOSE,
  STUDIO_VRM_RIG_PROFILE_VERSION,
  type StudioVrmRigProfileSelection,
} from "./studio-vrm-rig-profile-selection";

import type {
  StudioVrmTexturePaintChannel,
  StudioVrmTexturePaintChannelEncoding,
} from "@toonstudio/contracts/studio-vrm-texture-paint-channel";

export const STUDIO_VRM_SCENE_DOCUMENT_KIND = "studio-vrm-scene" as const;
export const STUDIO_VRM_SCENE_DOCUMENT_VERSION = 6 as const;
export const STUDIO_VRM_SCENE_DOCUMENT_LEGACY_VERSION = 1 as const;
export const STUDIO_VRM_SCENE_DOCUMENT_VERSION_TWO = 2 as const;
export const STUDIO_VRM_SCENE_DOCUMENT_VERSION_THREE = 3 as const;
export const STUDIO_VRM_SCENE_DOCUMENT_VERSION_FOUR = 4 as const;
export const STUDIO_VRM_SCENE_DOCUMENT_PREVIOUS_VERSION = 5 as const;
export const STUDIO_VRM_SCENE_DOCUMENT_V1_MAX_BYTES = 128 * 1024;
export const STUDIO_VRM_SCENE_DOCUMENT_V2_MAX_BYTES =
  STUDIO_VRM_SCENE_DOCUMENT_V1_MAX_BYTES + 512;
/**
 * v3 reserves bounded headroom for the required translation block so every historically valid v2
 * scene can be promoted without dropping authoring data at the former ceiling.
 */
export const STUDIO_VRM_SCENE_DOCUMENT_V3_MAX_BYTES =
  STUDIO_VRM_SCENE_DOCUMENT_V2_MAX_BYTES + 512;
/** v4 reserves bounded headroom for four persistent IK target/pole constraints. */
export const STUDIO_VRM_SCENE_DOCUMENT_V4_MAX_BYTES =
  STUDIO_VRM_SCENE_DOCUMENT_V3_MAX_BYTES + 2 * 1024;
/** v5 reserves bounded metadata headroom for deterministic surface-paint texture bindings. */
export const STUDIO_VRM_SCENE_DOCUMENT_V5_MAX_BYTES =
  STUDIO_VRM_SCENE_DOCUMENT_V4_MAX_BYTES + 128 * 1024;
/** v5 조명 톤 승격과 기존 v6 씬에 최대 256자의 제작 문서 ID를 연결할 여유를 둔다. */
export const STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES =
  STUDIO_VRM_SCENE_DOCUMENT_V5_MAX_BYTES + 1_024;
/** Matches the default project-archive per-attachment ceiling so every accepted scene is portable. */
export const STUDIO_VRM_MODEL_MAX_BYTES = 96 * 1024 * 1024;
export const STUDIO_VRM_MAX_POSE_BONES = 64;
export const STUDIO_VRM_MAX_FINGER_BONES = 32;
export const STUDIO_VRM_MAX_EXPRESSIONS = 64;
export const STUDIO_VRM_MAX_IK_CONSTRAINTS = 4;
export const STUDIO_VRM_SURFACE_PAINT_MAX_TEXTURES = 128;
export const STUDIO_VRM_SURFACE_PAINT_BASE_COLOR_SLOT = "baseColor" as const;
/** Mirrors the project archive's 96 MB per-attachment ceiling. */
export const STUDIO_VRM_SURFACE_PAINT_TEXTURE_MAX_BYTES = 96_000_000;
/** Content-addressed PNG bytes are counted once even when multiple bindings share a hash. */
export const STUDIO_VRM_SURFACE_PAINT_TOTAL_MAX_BYTES = 96_000_000;
export const STUDIO_VRM_SURFACE_PAINT_MAX_DIMENSION = 4_096;
export const STUDIO_VRM_SURFACE_PAINT_MAX_TEXTURE_PIXELS =
  STUDIO_VRM_SURFACE_PAINT_MAX_DIMENSION * STUDIO_VRM_SURFACE_PAINT_MAX_DIMENSION;
/** At most two full-resolution unique decoded textures may be admitted into one scene document. */
export const STUDIO_VRM_SURFACE_PAINT_MAX_DECODED_PIXELS =
  STUDIO_VRM_SURFACE_PAINT_MAX_TEXTURE_PIXELS * 2;

export type StudioVrmSceneDocumentBudgetErrorCode =
  | "surface-paint-count-budget-exceeded"
  | "surface-paint-byte-budget-exceeded"
  | "surface-paint-decoded-pixel-budget-exceeded";

/** Lenient normalization must never disguise a surface-paint budget failure as a valid subset. */
export class StudioVrmSceneDocumentBudgetError extends Error {
  readonly code: StudioVrmSceneDocumentBudgetErrorCode;

  constructor(code: StudioVrmSceneDocumentBudgetErrorCode) {
    super(`Studio VRM scene document budget exceeded: ${code}.`);
    this.name = "StudioVrmSceneDocumentBudgetError";
    this.code = code;
  }
}

export function failSceneBudget(code: StudioVrmSceneDocumentBudgetErrorCode): never {
  throw new StudioVrmSceneDocumentBudgetError(code);
}

export type StudioVrmVec3 = readonly [number, number, number];

export const STUDIO_VRM_IK_EFFECTORS = [
  "leftHand",
  "rightHand",
  "leftFoot",
  "rightFoot",
] as const;

export type StudioVrmIkEffector = (typeof STUDIO_VRM_IK_EFFECTORS)[number];

/**
 * A persistent IK pin expressed in VRM scene-local coordinates.
 *
 * `enabled` controls participation and visibility. `locked` means other authoritative pose edits
 * must preserve the target; it never prevents the user from explicitly moving or deleting it.
 */
export interface StudioVrmIkConstraint {
  readonly effector: StudioVrmIkEffector;
  readonly enabled: boolean;
  readonly locked: boolean;
  readonly target: StudioVrmVec3;
  readonly pole: StudioVrmVec3 | null;
}

export type StudioVrmHumanoidBoneName = (typeof STUDIO_VRM_HUMANOID_BONES)[number];
export type StudioVrmFingerBoneName = (typeof STUDIO_VRM_FINGER_BONES)[number];

export interface StudioVrmBundledModel {
  readonly source: "bundled";
  readonly id: string;
  readonly name: string;
}

export interface StudioVrmAttachmentModel {
  readonly source: "attachment";
  /** Lowercase `sha256:` followed by exactly 64 hexadecimal characters. */
  readonly hash: string;
  readonly byteSize: number;
  readonly mime: "model/vrm" | "model/gltf-binary";
  readonly name: string;
}

export type StudioVrmSceneModel = StudioVrmBundledModel | StudioVrmAttachmentModel;

/** Rotation-only subset of `PoseBoneMap`; direction targets are resolved at the runtime boundary. */
export interface StudioVrmPoseBone {
  readonly rotation: StudioVrmVec3;
}

/**
 * Persistable additive translations used by deterministic full-body IK.
 *
 * `root` is expressed in the scene parent's horizontal coordinate system and owns X/Z placement
 * only; its Y component is canonically zero because the historical `yOffset` field remains the
 * sole vertical scene-root coordinate. `hips` and `spine` are expressed in the avatar scene-root
 * coordinate system before body scale. `hips` moves the whole humanoid below the scene root, while
 * `spine` moves the upper-body subtree without translating either leg.
 */
export interface StudioVrmPoseTranslations {
  readonly version: 1;
  readonly root: StudioVrmVec3;
  readonly hips: StudioVrmVec3;
  readonly spine: StudioVrmVec3;
}

export type StudioVrmPoseBoneMap = Partial<
  Record<StudioVrmHumanoidBoneName, StudioVrmPoseBone>
>;
export type StudioVrmFingerRotationMap = Partial<
  Record<StudioVrmFingerBoneName, StudioVrmVec3>
>;

export interface StudioVrmPoseState {
  readonly bones: StudioVrmPoseBoneMap;
  readonly yOffset: number;
  readonly translations: StudioVrmPoseTranslations;
  /** Character-root yaw, in canonical radians `[-PI, PI)`. */
  readonly bodyRotationY: number;
  readonly fingerOverrides: StudioVrmFingerRotationMap;
  readonly ikConstraints: readonly StudioVrmIkConstraint[];
}

export interface StudioVrmCameraSettings {
  readonly projection: "perspective";
  readonly position: StudioVrmVec3;
  readonly target: StudioVrmVec3;
  readonly up: StudioVrmVec3;
  readonly fovDegrees: number;
  readonly near: number;
  readonly far: number;
}

export interface StudioVrmBodyScale {
  readonly height: number;
  readonly width: number;
}

export interface StudioVrmMaterialFx {
  readonly shadeColor: string | null;
  readonly outlineColor: string | null;
  readonly rimColor: string | null;
  readonly rimIntensity: number;
  readonly emissiveColor: string | null;
  readonly emissiveIntensity: number;
}

export interface StudioVrmAppearanceSettings {
  readonly bodyScale: StudioVrmBodyScale;
  readonly customColors: Readonly<Record<string, string>>;
  readonly materialFx: StudioVrmMaterialFx;
  readonly mannequin: boolean;
  readonly avatarForge: StudioVrmCanonicalData;
  readonly costume: StudioVrmCanonicalData;
  readonly wardrobe: StudioVrmCanonicalData;
}

export interface StudioVrmLightingSettings {
  readonly intensity: number;
  readonly colorTemp: number;
  readonly directionDeg: number;
}

export const STUDIO_VRM_LIGHTING_TONES = [
  "morning",
  "sunset",
  "night",
  "studio",
] as const;

export type StudioVrmLightingTone = (typeof STUDIO_VRM_LIGHTING_TONES)[number];

export const DEFAULT_STUDIO_VRM_LIGHTING_TONE: StudioVrmLightingTone = "morning";

export interface StudioVrmPhysicsSettings {
  readonly version: 1;
  readonly stiffnessScale: number;
  readonly gravityScale: number;
  readonly windDirectionDeg: number;
  readonly windStrength: number;
}

export type StudioVrmEnvironment = "none" | "floor" | "wall" | "room" | "outdoor";

export interface StudioVrmRenderSettings {
  readonly width: number;
  readonly height: number;
  readonly transparentBackground: boolean;
  readonly backgroundColor: string;
}

/** Versioned, engine-neutral drawing-assist settings persisted with a VRM scene. */
export interface StudioVrmRigSettings {
  readonly version: 1;
  readonly jointProfile: StudioVrmRigProfileSelection;
  readonly fullBodyIk: boolean;
  readonly footPlant: boolean;
  readonly floorHeight: number;
}

/**
 * One portable PNG texture and its engine-neutral VRM material binding.
 *
 * The PNG bytes live in the project archive's content-addressed attachment store. Runtime object
 * identities, object URLs, Blob/File values, raw pixels, and library-specific UUIDs are never
 * persisted here. `materialLocator + textureSlot` is the authoritative binding identity.
 */
export interface StudioVrmSurfacePaintTexture {
  readonly bindingKey: string;
  readonly materialLocator: string;
  readonly textureSlot: StudioVrmTexturePaintChannel;
  readonly colorSpace?: StudioVrmTexturePaintChannelEncoding["colorSpace"];
  readonly channelPacking?: StudioVrmTexturePaintChannelEncoding["channelPacking"];
  readonly hash: string;
  readonly mime: "image/png";
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioVrmSurfacePaintSettings {
  readonly version: 1 | 2;
  readonly textures: readonly StudioVrmSurfacePaintTexture[];
}

export interface StudioVrmSceneDocument {
  readonly kind: typeof STUDIO_VRM_SCENE_DOCUMENT_KIND;
  readonly version: typeof STUDIO_VRM_SCENE_DOCUMENT_VERSION;
  /** 라이브러리에서 제작한 캐릭터의 문서 ID. 같은 VRM을 쓰는 별개 캐릭터를 구분한다. */
  readonly characterDocumentId?: string;
  readonly model: StudioVrmSceneModel;
  readonly pose: StudioVrmPoseState;
  readonly expressions: Readonly<Record<string, number>>;
  readonly camera: StudioVrmCameraSettings;
  readonly appearance: StudioVrmAppearanceSettings;
  readonly rig: StudioVrmRigSettings;
  readonly props: StudioVrmCanonicalData;
  readonly sceneProps: StudioVrmCanonicalData;
  readonly lighting: StudioVrmLightingSettings;
  readonly lightingTone: StudioVrmLightingTone;
  readonly physics: StudioVrmPhysicsSettings;
  readonly env: StudioVrmEnvironment;
  readonly render: StudioVrmRenderSettings;
  readonly surfacePaint: StudioVrmSurfacePaintSettings;
}

export interface StudioVrmBundledModelDescriptor {
  readonly id: string;
  readonly name: string;
}

export interface StudioVrmLegacyMigrationOptions {
  /** Authoritative bundled registry. IndexedDB ids must never be placed in this list. */
  readonly bundledModels?: readonly StudioVrmBundledModelDescriptor[];
}

export type StudioVrmLegacyMetadataMigration =
  | { readonly status: "resolved"; readonly document: StudioVrmSceneDocument }
  | {
      readonly status: "unresolved-model";
      readonly modelId: string | null;
      readonly modelName: string | null;
    };

export type StudioVrmLegacyFragmentMigration =
  | {
      readonly status: "resolved";
      /** The original PNG data URL with its metadata fragment removed. */
      readonly rasterSrc: string;
      readonly document: StudioVrmSceneDocument;
    }
  | {
      readonly status: "unresolved-model";
      readonly rasterSrc: string;
      readonly modelId: string | null;
      readonly modelName: string | null;
    };

const HUMANOID_BONE_SET = new Set<string>(STUDIO_VRM_HUMANOID_BONES);
const FINGER_BONE_SET = new Set<string>(STUDIO_VRM_FINGER_BONES);
const IK_EFFECTOR_SET = new Set<string>(STUDIO_VRM_IK_EFFECTORS);
const ENVIRONMENT_SET = new Set<string>(["none", "floor", "wall", "room", "outdoor"]);
const LIGHTING_TONE_SET = new Set<string>(STUDIO_VRM_LIGHTING_TONES);

export function isStudioVrmHumanoidBoneName(value: string): value is StudioVrmHumanoidBoneName {
  return HUMANOID_BONE_SET.has(value);
}

export function isStudioVrmFingerBoneName(value: string): value is StudioVrmFingerBoneName {
  return FINGER_BONE_SET.has(value);
}

export function isStudioVrmIkEffector(value: unknown): value is StudioVrmIkEffector {
  return typeof value === "string" && IK_EFFECTOR_SET.has(value);
}

export function isStudioVrmEnvironment(value: unknown): value is StudioVrmEnvironment {
  return typeof value === "string" && ENVIRONMENT_SET.has(value);
}

export function isStudioVrmLightingTone(value: unknown): value is StudioVrmLightingTone {
  return typeof value === "string" && LIGHTING_TONE_SET.has(value);
}

export const DEFAULT_RAW_DOCUMENT: StudioVrmSceneDocument = {
  kind: STUDIO_VRM_SCENE_DOCUMENT_KIND,
  version: STUDIO_VRM_SCENE_DOCUMENT_VERSION,
  model: { source: "bundled", id: "sample-vrm", name: "루미" },
  pose: {
    bones: {},
    yOffset: 0,
    translations: {
      version: 1,
      root: [0, 0, 0],
      hips: [0, 0, 0],
      spine: [0, 0, 0],
    },
    bodyRotationY: 0,
    fingerOverrides: {},
    ikConstraints: [],
  },
  expressions: {},
  camera: {
    projection: "perspective",
    position: [0, 1.42, 3.15],
    target: [0, 1.22, 0],
    up: [0, 1, 0],
    fovDegrees: 30,
    near: 0.1,
    far: 100,
  },
  appearance: {
    bodyScale: { height: 1, width: 1 },
    customColors: {},
    materialFx: {
      shadeColor: null,
      outlineColor: null,
      rimColor: null,
      rimIntensity: 0,
      emissiveColor: null,
      emissiveIntensity: 0,
    },
    mannequin: false,
    avatarForge: null,
    costume: null,
    wardrobe: null,
  },
  rig: {
    version: 1,
    jointProfile: {
      version: STUDIO_VRM_RIG_PROFILE_VERSION,
      purpose: STUDIO_VRM_RIG_PROFILE_PURPOSE,
      id: "neutral",
    },
    fullBodyIk: false,
    footPlant: false,
    floorHeight: 0,
  },
  props: null,
  sceneProps: null,
  lighting: { intensity: 1, colorTemp: 0.5, directionDeg: 45 },
  lightingTone: DEFAULT_STUDIO_VRM_LIGHTING_TONE,
  physics: {
    version: 1,
    stiffnessScale: 1,
    gravityScale: 1,
    windDirectionDeg: 0,
    windStrength: 0,
  },
  env: "none",
  render: {
    width: 1024,
    height: 1024,
    transparentBackground: true,
    backgroundColor: "#ffffff",
  },
  surfacePaint: {
    version: 1,
    textures: [],
  },
};

export const VERSION_ONE_ROOT_KEYS = new Set([
  "kind",
  "version",
  "model",
  "pose",
  "expressions",
  "camera",
  "appearance",
  "props",
  "sceneProps",
  "lighting",
  "physics",
  "env",
  "render",
]);

export const VERSION_TWO_TO_FOUR_ROOT_KEYS = new Set([
  ...VERSION_ONE_ROOT_KEYS,
  "rig",
]);
export const VERSION_FIVE_ROOT_KEYS = new Set([
  ...VERSION_TWO_TO_FOUR_ROOT_KEYS,
  "surfacePaint",
]);
const VERSION_ONE_POSE_KEYS = new Set([
  "bones",
  "yOffset",
  "bodyRotationY",
  "fingerOverrides",
]);
export const VERSION_THREE_POSE_KEYS = new Set([
  ...VERSION_ONE_POSE_KEYS,
  "translations",
]);
export const CURRENT_POSE_KEYS = new Set([
  ...VERSION_THREE_POSE_KEYS,
  "ikConstraints",
]);
export const POSE_TRANSLATION_KEYS = new Set(["version", "root", "hips", "spine"]);
export const IK_CONSTRAINT_KEYS = new Set(["effector", "enabled", "locked", "target", "pole"]);
export const RIG_KEYS = new Set([
  "version",
  "jointProfile",
  "fullBodyIk",
  "footPlant",
  "floorHeight",
]);
export const SURFACE_PAINT_KEYS = new Set(["version", "textures"]);
export const SURFACE_PAINT_TEXTURE_KEYS = new Set([
  "bindingKey",
  "materialLocator",
  "textureSlot",
  "hash",
  "mime",
  "byteSize",
  "width",
  "height",
]);
