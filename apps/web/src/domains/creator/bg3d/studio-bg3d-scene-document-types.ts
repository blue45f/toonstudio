/**
 * Studio BG3D 씬 문서 타입·기본값 — 엔진 중립 문서 스키마(v3)의 타입, 한도 상수,
 * 기본 설정 묶음과 예산 오류 계약. 정규화·마이그레이션 로직(studio-bg3d-scene-document)이
 * 공유하는 기반 정의만 모았다.
 */

import type { StudioGeneric3dWorkflowMetadataRecord } from "../studio-generic-3d-workflow-metadata";
import type { StudioScene3dVersionedCut } from "../scene3d/studio-scene3d-shot-versions";
import type { StudioGeneric3dWorkflowMetadataRecord } from "../studio-generic-3d-workflow-metadata";

export const STUDIO_BG3D_SCENE_DOCUMENT_KIND = "toonstudio.bg3d-scene" as const;
export const STUDIO_BG3D_SCENE_DOCUMENT_VERSION = 3 as const;
export const STUDIO_BG3D_SCHEMA_V2_SCENE_DOCUMENT_VERSION = 2 as const;
export const STUDIO_BG3D_LEGACY_SCENE_DOCUMENT_VERSION = 1 as const;
// Schema v3 adds an explicit `twoBoneIks` collection to every constrained model. Keeping the old
// 256 KiB ceiling would make an otherwise valid near-cap v2 document fail migration solely because
// each aim-only layer gains `twoBoneIks: []`. The bounded 320 KiB ceiling preserves all legacy
// payloads while retaining a small, deterministic metadata budget.
export const STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES = 320 * 1024;
export const STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES = 512;
/**
 * Attachment budget must cover Hybrid DCC editable room presets (classroom ≈ 66
 * parts) plus a few CAD/prop assets. Align with Hybrid layout/room authority
 * caps (256) so "교실 세트 → 3D 배경 편집기" handoff does not fail by default.
 */
export const STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS = 256;
export const STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS = 64;
export const STUDIO_BG3D_SHOT_ID_MAX_LENGTH = 80;
export const STUDIO_BG3D_SHOT_NAME_MAX_LENGTH = 80;
export const STUDIO_BG3D_SHOT_MAX_NODE_VISIBILITY_OVERRIDES =
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES;
export const STUDIO_BG3D_GLB_MIME = "model/gltf-binary" as const;
export const STUDIO_BG3D_GLB_MAX_BYTES = 100 * 1024 * 1024;

export type StudioBg3dSceneDocumentBudgetErrorCode =
  | "input-byte-budget-exceeded"
  | "attachment-count-budget-exceeded"
  | "model-byte-budget-exceeded"
  | "node-count-budget-exceeded"
  | "pose-joint-count-budget-exceeded"
  | "morph-target-count-budget-exceeded"
  | "aim-constraint-count-budget-exceeded"
  | "two-bone-ik-count-budget-exceeded"
  | "shot-count-budget-exceeded"
  | "shot-visibility-count-budget-exceeded"
  | "document-byte-budget-exceeded";

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

export type BudgetFailureMode = "null" | "throw";

export function failBudget(code: StudioBg3dSceneDocumentBudgetErrorCode): never {
  throw new StudioBg3dSceneDocumentBudgetError(code);
}

export type StudioBg3dVec3 = readonly [number, number, number];
export type StudioBg3dQuaternion = readonly [number, number, number, number];

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

export type StudioBg3dPrimitiveKind = (typeof STUDIO_BG3D_PRIMITIVE_KINDS)[number];
export type StudioBg3dBackgroundMode = "color" | "sky-preset" | "transparent";
export const STUDIO_BG3D_SKY_PRESET_IDS = ["blank", "clear_day", "sunset", "night"] as const;
export type StudioBg3dSkyPresetId = (typeof STUDIO_BG3D_SKY_PRESET_IDS)[number];
export type StudioBg3dToneMapping = "none" | "neutral" | "aces";
export type StudioBg3dToneMode = "none" | "flat" | "cel" | "screentone";
export type StudioBg3dLineLayerType = "raster" | "vector";
export type StudioBg3dToneOutputType = "color" | "grayscale" | "pattern";
export type StudioBg3dTonePattern = "dot" | "line" | "crosshatch" | "noise";
export type StudioBg3dMaterialColorMode = "original" | "multiply" | "replace";
export type StudioBg3dAnimationLoopMode = "once" | "repeat" | "ping-pong";
export type StudioBg3dAttachmentSource = "upload" | "local-library" | "bundled";
export type StudioBg3dRightsStatus = "owned" | "licensed" | "public-domain" | "unknown";

export interface StudioBg3dTransform {
  readonly position: StudioBg3dVec3;
  /** Euler XYZ radians, normalized to [-PI, PI]. */
  readonly rotation: StudioBg3dVec3;
  readonly scale: StudioBg3dVec3;
}

/** Engine-neutral per-instance material adjustments; source textures remain asset-owned. */
export interface StudioBg3dMaterialOverride {
  readonly colorMode: StudioBg3dMaterialColorMode;
  readonly color: string;
  readonly colorStrength: number;
  readonly opacityMultiplier: number;
  readonly roughness: number | null;
  readonly metalness: number | null;
  readonly emissiveColor: string;
  readonly emissiveIntensity: number | null;
  readonly wireframe: boolean;
  readonly doubleSided: boolean;
}

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

export interface StudioBg3dAnimationPlayback {
  readonly clipIndex: number;
  readonly playing: boolean;
  readonly loop: StudioBg3dAnimationLoopMode;
  readonly timeSeconds: number;
  readonly timeScale: number;
  readonly weight: number;
}

export const DEFAULT_STUDIO_BG3D_ANIMATION_PLAYBACK: StudioBg3dAnimationPlayback = Object.freeze({
  clipIndex: 0,
  playing: false,
  loop: "repeat",
  timeSeconds: 0,
  timeScale: 1,
  weight: 1,
});

export interface StudioBg3dJointPoseOverride {
  /** Engine-neutral canonical skin/joint ordinal, e.g. `skin-0:joint-12`. */
  readonly jointKey: string;
  /** Additive local-space rotation relative to the sampled animation/rest pose. */
  readonly rotationOffset: StudioBg3dQuaternion;
}

export interface StudioBg3dPoseLayer {
  readonly enabled: boolean;
  readonly weight: number;
  readonly joints: readonly StudioBg3dJointPoseOverride[];
}

export const DEFAULT_STUDIO_BG3D_POSE_LAYER: StudioBg3dPoseLayer = Object.freeze({
  enabled: true,
  weight: 1,
  joints: Object.freeze([]),
});

export interface StudioBg3dMorphWeightOverride {
  /** Engine-neutral canonical renderable/target ordinal, e.g. `mesh-2:target-0`. */
  readonly targetKey: string;
  /** Additive offset applied after animation sampling. */
  readonly weightOffset: number;
}

export interface StudioBg3dMorphLayer {
  readonly enabled: boolean;
  readonly weight: number;
  readonly targets: readonly StudioBg3dMorphWeightOverride[];
}

export const DEFAULT_STUDIO_BG3D_MORPH_LAYER: StudioBg3dMorphLayer = Object.freeze({
  enabled: true,
  weight: 1,
  targets: Object.freeze([]),
});

export const STUDIO_BG3D_AIM_AXES = [
  "+x", "-x", "+y", "-y", "+z", "-z",
] as const;
export const STUDIO_BG3D_MAX_TWO_BONE_IK_CONSTRAINTS = 32;
export type StudioBg3dAimAxis = (typeof STUDIO_BG3D_AIM_AXES)[number];

export interface StudioBg3dJointAimConstraint {
  readonly jointKey: string;
  /** Target point in the model instance's local coordinate system. */
  readonly target: StudioBg3dVec3;
  /** Joint-local axis that should point toward the target. */
  readonly axis: StudioBg3dAimAxis;
  readonly weight: number;
}

export interface StudioBg3dTwoBoneIkConstraint {
  readonly upperJointKey: string;
  readonly middleJointKey: string;
  readonly endJointKey: string;
  /** End-effector target in the model instance's local coordinate system. */
  readonly target: StudioBg3dVec3;
  /** Model-local point defining the elbow/knee bend plane. */
  readonly poleTarget: StudioBg3dVec3;
  readonly weight: number;
}

export interface StudioBg3dConstraintLayer {
  readonly enabled: boolean;
  readonly aims: readonly StudioBg3dJointAimConstraint[];
  readonly twoBoneIks: readonly StudioBg3dTwoBoneIkConstraint[];
}

export const DEFAULT_STUDIO_BG3D_CONSTRAINT_LAYER: StudioBg3dConstraintLayer = Object.freeze({
  enabled: true,
  aims: Object.freeze([]),
  twoBoneIks: Object.freeze([]),
});

export interface StudioBg3dCameraSettings {
  readonly position: StudioBg3dVec3;
  readonly target: StudioBg3dVec3;
  readonly fovDegrees: number;
  readonly projection?: "perspective" | "orthographic";
  readonly zoom?: number;
  readonly lensShift?: readonly [number, number];
  /** Positive scene-unit near plane. Absent only on canonical pre-Camera-vNext v3 documents. */
  readonly nearClip?: number;
  /** Unit look-at up reference. It represents Dutch roll without persisting engine quaternions. */
  readonly up?: StudioBg3dVec3;
}

export interface StudioBg3dRenderSettings {
  readonly antialias: boolean;
  readonly shadows: boolean;
  readonly exposure: number;
  readonly toneMapping: StudioBg3dToneMapping;
  readonly colorSpace: "srgb";
}

export interface StudioBg3dBackgroundSettings {
  readonly mode: StudioBg3dBackgroundMode;
  readonly color: string;
  readonly skyPresetId: StudioBg3dSkyPresetId;
  /** Horizontal rotation of the allowlisted procedural equirectangular sky, in degrees. */
  readonly panoramaRotation: number;
  readonly fogEnabled?: boolean;
  readonly fogColor?: string;
  readonly fogNear?: number;
  readonly fogFar?: number;
}

export interface StudioBg3dDirectionalLightSettings {
  readonly color: string;
  /** Unit vector from the lit subject toward the light. */
  readonly direction: StudioBg3dVec3;
  readonly intensity: number;
  readonly castsShadow: boolean;
}

export interface StudioBg3dLightingSettings {
  readonly ambientColor: string;
  readonly ambientIntensity: number;
  readonly key: StudioBg3dDirectionalLightSettings;
  readonly fill: StudioBg3dDirectionalLightSettings;
}

export interface StudioBg3dQualityProfile {
  readonly targetFps: number;
  readonly dprMin: number;
  readonly dprMax: number;
  readonly maxRenderPixels: number;
  readonly shadows: boolean;
  readonly shadowMapSize: 256 | 512 | 1024 | 2048 | 4096;
  readonly textureScale: number;
  readonly lodBias: number;
}

export interface StudioBg3dQualityProfiles {
  readonly desktop: StudioBg3dQualityProfile;
  readonly mobile: StudioBg3dQualityProfile;
}

export interface StudioBg3dLineOutputSettings {
  readonly enabled: boolean;
  readonly layerType: StudioBg3dLineLayerType;
  readonly color: string;
  readonly widthPx: number;
  readonly strength: number;
  readonly accuracy: number;
  readonly scaleAwareAccuracy: boolean;
  readonly exteriorOutlineStrength: number;
  readonly depthEnabled: boolean;
  readonly depthStrength: number;
  readonly depthOutlineOnly: boolean;
  readonly smoothing: number;
  readonly textureLineEnabled: boolean;
  readonly textureLineStrength: number;
  readonly creaseAngleDegrees: number;
  readonly hiddenLineRemoval: boolean;
}

export interface StudioBg3dToneOutputSettings {
  readonly mode: StudioBg3dToneMode;
  readonly type: StudioBg3dToneOutputType;
  readonly pattern: StudioBg3dTonePattern;
  readonly levels: number;
  readonly opacity: number;
  readonly frequency: number;
  readonly angleDegrees: number;
}

export interface StudioBg3dOutputSettings {
  readonly transparentBackground: boolean;
  readonly exportHeight: number;
  /**
   * 명시적 캡처 가로세로 비율(width / height).
   *
   * 이 키가 없는 문서는 예전과 똑같이 "라이브 뷰포트 비율"을 따른다(자동). 기본값을 넣어 버리면
   * 이미 저장된 장면의 삽입 결과가 조용히 바뀌므로, 사용자가 비율을 고정했을 때만 기록한다.
   */
  readonly exportAspectRatio?: number;
  readonly line: StudioBg3dLineOutputSettings;
  readonly tone: StudioBg3dToneOutputSettings;
}

export interface StudioBg3dComplexityBudget {
  readonly maxNodes: number;
  readonly maxTriangles: number;
  readonly maxDrawCalls: number;
  readonly maxMaterials: number;
  readonly maxLights: number;
  readonly maxAnimations: number;
  readonly maxAnimationChannels: number;
  /** Sum of timeline keys referenced by animation channels. */
  readonly maxAnimationKeyframes: number;
  /** Scalar components in animation sampler outputs after accessor type expansion. */
  readonly maxAnimationValues: number;
  readonly maxSkins: number;
  /** Sum of joint references across skins. */
  readonly maxJoints: number;
  /** Sum of morph target records across mesh primitives. */
  readonly maxMorphTargets: number;
  /** Sum of accessor element counts before component expansion. */
  readonly maxAccessorElements: number;
  /** Conservative decoded allocation estimate for all accessors. */
  readonly maxDecodedGeometryBytes: number;
  readonly maxModelBytes: number;
}

export interface StudioBg3dTextureBudget {
  readonly maxTextures: number;
  readonly maxTotalBytes: number;
  readonly maxDimension: number;
}

export interface StudioBg3dSceneBudgets {
  readonly complexity: StudioBg3dComplexityBudget;
  readonly textures: StudioBg3dTextureBudget;
}

export interface StudioBg3dAttachmentRights {
  readonly status: StudioBg3dRightsStatus;
  readonly commercialUse: boolean;
  readonly attributionRequired: boolean;
  readonly attribution?: string;
  readonly licenseName?: string;
}

export interface StudioBg3dModelAttachment {
  readonly id: string;
  readonly name: string;
  readonly mime: typeof STUDIO_BG3D_GLB_MIME;
  readonly byteSize: number;
  /** Lowercase `sha256:` followed by exactly 64 hexadecimal characters. */
  readonly hash: string;
  readonly rights: StudioBg3dAttachmentRights;
  readonly source: StudioBg3dAttachmentSource;
  /**
   * Optional generic (non-VRM) workflow classification / source-format block.
   * Sanitized via `studio-generic-3d-workflow-metadata` on parse; omitted when unknown.
   */
  readonly generic3dWorkflow?: StudioGeneric3dWorkflowMetadataRecord;
}

/**
 * Input contract for the runtime GLB trust boundary. The verifier implementation lives outside
 * this persistence module. It must immediately copy `bytes`, then verify the exact response MIME,
 * metadata byte length, SHA-256, GLB `glTF` magic, version 2, header-declared length, and the
 * cumulative byte limit before handing the owned copy to an engine parser.
 */
export interface StudioBg3dGlbVerificationRequest {
  readonly attachment: StudioBg3dModelAttachment;
  readonly bytes: Uint8Array;
  readonly responseMime: string;
  readonly cumulativeResolvedBytes: number;
  readonly maxCumulativeResolvedBytes: number;
}

/** A successful verifier result; `verifiedBytes` must be the verifier-owned defensive copy. */
export interface StudioBg3dGlbVerificationSuccess {
  readonly ok: true;
  readonly attachmentId: string;
  readonly verifiedBytes: Uint8Array;
  readonly byteSize: number;
  readonly computedHash: string;
  readonly glbVersion: 2;
  readonly nextCumulativeResolvedBytes: number;
}

export type StudioBg3dGlbVerificationFailureCode =
  | "invalid-request"
  | "mime-mismatch"
  | "byte-size-mismatch"
  | "cumulative-byte-budget-exceeded"
  | "invalid-glb-header"
  | "unsupported-glb-version"
  | "declared-length-mismatch"
  | "sha256-mismatch"
  | "digest-unavailable";

export interface StudioBg3dGlbVerificationFailure {
  readonly ok: false;
  readonly code: StudioBg3dGlbVerificationFailureCode;
}

export type StudioBg3dGlbVerificationResult =
  | StudioBg3dGlbVerificationSuccess
  | StudioBg3dGlbVerificationFailure;

/**
 * Engine-reported metrics that must be checked after GLB parsing and before scene admission.
 * Counts are totals for the resolved asset, including generated primitives and decoded textures.
 */
export interface StudioBg3dParsedGlbMetrics {
  readonly nodes: number;
  readonly triangles: number;
  readonly drawCalls: number;
  readonly materials: number;
  readonly lights: number;
  readonly animations: number;
  readonly animationChannels: number;
  readonly animationKeyframes: number;
  readonly animationValues: number;
  readonly skins: number;
  readonly joints: number;
  readonly morphTargets: number;
  readonly accessorElements: number;
  readonly estimatedDecodedGeometryBytes: number;
  readonly textures: number;
  readonly textureBytes: number;
  readonly maxTextureDimension: number;
}

/**
 * Post-parse admission contract. The runtime validator must reject non-safe/non-negative metrics,
 * then compare nodes, triangles, draw calls, materials, and lights to `budgets.complexity`, plus
 * texture count, decoded texture bytes, and maximum dimension to `budgets.textures`. This check is
 * intentionally after engine parsing; file byte size is not a proxy for decoded scene complexity.
 */
export interface StudioBg3dPostParseBudgetRequest {
  readonly metrics: StudioBg3dParsedGlbMetrics;
  readonly budgets: StudioBg3dSceneBudgets;
}

export interface StudioBg3dLegacyMigrationOptions {
  /**
   * Explicit bridge from an old IndexedDB storage key to a newly issued logical attachment id.
   * A mapping whose value equals its key is rejected, and the mapped id must resolve to canonical
   * attachment metadata in the legacy payload. Storage keys never enter the persisted document.
   */
  readonly attachmentIdByLegacyStorageKey?: ReadonlyMap<string, string>;
}

interface StudioBg3dSceneNodeBase {
  readonly id: string;
  readonly name: string;
  readonly transform: StudioBg3dTransform;
  readonly visible: boolean;
  /** When true, transform gizmo and numeric edits are blocked in the editor. */
  readonly locked: boolean;
  readonly castsShadow: boolean;
  readonly receivesShadow: boolean;
  /** Parent node ID for hierarchy grouping. null/undefined means root. */
  readonly parentId?: string | null;
  /**
   * Linked-clone source node ID (연결 복제). When set, this node follows the source node's
   * appearance (color/material/shadow flags) on every canonical commit; transform, name,
   * visibility and hierarchy stay independent. Always points at the root source (never a chain).
   */
  readonly linkedSourceId?: string;
}

export interface StudioBg3dPrimitiveNode extends StudioBg3dSceneNodeBase {
  readonly kind: "primitive";
  readonly primitiveKind: StudioBg3dPrimitiveKind;
  readonly color: string;
  /** Optional to preserve byte-for-byte compatibility with pre-preset documents. */
  readonly materialOverride?: StudioBg3dMaterialOverride;
}

export interface StudioBg3dModelNode extends StudioBg3dSceneNodeBase {
  readonly kind: "model";
  readonly attachmentId: string;
  readonly materialOverride?: StudioBg3dMaterialOverride;
  readonly animation?: StudioBg3dAnimationPlayback;
  readonly pose?: StudioBg3dPoseLayer;
  readonly morph?: StudioBg3dMorphLayer;
  readonly constraints?: StudioBg3dConstraintLayer;
}

export type StudioBg3dSceneNode = StudioBg3dPrimitiveNode | StudioBg3dModelNode;

/**
 * A shot is a bounded, engine-neutral view of the same scene graph. It may override presentation
 * state, but it never owns geometry, model bytes, URLs, attachment metadata, or runtime handles.
 * Array order is the canonical storyboard order.
 */
export interface StudioBg3dShotCameraOverride {
  readonly position?: StudioBg3dVec3;
  readonly target?: StudioBg3dVec3;
  readonly fovDegrees?: number;
  readonly projection?: "perspective" | "orthographic";
  readonly zoom?: number;
  readonly lensShift?: readonly [number, number];
  readonly nearClip?: number;
  readonly up?: StudioBg3dVec3;
}

export interface StudioBg3dShotRenderOverride {
  readonly antialias?: boolean;
  readonly shadows?: boolean;
  readonly exposure?: number;
  readonly toneMapping?: StudioBg3dToneMapping;
  readonly colorSpace?: "srgb";
}

export interface StudioBg3dShotBackgroundOverride {
  readonly mode?: StudioBg3dBackgroundMode;
  readonly color?: string;
  readonly skyPresetId?: StudioBg3dSkyPresetId;
  readonly panoramaRotation?: number;
  readonly fogEnabled?: boolean;
  readonly fogColor?: string;
  readonly fogNear?: number;
  readonly fogFar?: number;
}

export interface StudioBg3dShotDirectionalLightOverride {
  readonly color?: string;
  readonly direction?: StudioBg3dVec3;
  readonly intensity?: number;
  readonly castsShadow?: boolean;
}

export interface StudioBg3dShotLightingOverride {
  readonly ambientColor?: string;
  readonly ambientIntensity?: number;
  readonly key?: StudioBg3dShotDirectionalLightOverride;
  readonly fill?: StudioBg3dShotDirectionalLightOverride;
}

export interface StudioBg3dShotLineOutputOverride {
  readonly enabled?: boolean;
  readonly layerType?: StudioBg3dLineLayerType;
  readonly color?: string;
  readonly widthPx?: number;
  readonly strength?: number;
  readonly accuracy?: number;
  readonly scaleAwareAccuracy?: boolean;
  readonly exteriorOutlineStrength?: number;
  readonly depthEnabled?: boolean;
  readonly depthStrength?: number;
  readonly depthOutlineOnly?: boolean;
  readonly smoothing?: number;
  readonly textureLineEnabled?: boolean;
  readonly textureLineStrength?: number;
  readonly creaseAngleDegrees?: number;
  readonly hiddenLineRemoval?: boolean;
}

export interface StudioBg3dShotToneOutputOverride {
  readonly mode?: StudioBg3dToneMode;
  readonly type?: StudioBg3dToneOutputType;
  readonly pattern?: StudioBg3dTonePattern;
  readonly levels?: number;
  readonly opacity?: number;
  readonly frequency?: number;
  readonly angleDegrees?: number;
}

/** Partial line/tone export state (LT) for one storyboard shot. */
export interface StudioBg3dShotOutputOverride {
  readonly transparentBackground?: boolean;
  readonly exportHeight?: number;
  readonly line?: StudioBg3dShotLineOutputOverride;
  readonly tone?: StudioBg3dShotToneOutputOverride;
}

export interface StudioBg3dShotNodeVisibilityOverride {
  readonly nodeId: string;
  readonly visible: boolean;
}

export interface StudioBg3dShot {
  readonly id: string;
  readonly name: string;
  readonly camera?: StudioBg3dShotCameraOverride;
  readonly nodeVisibility?: readonly StudioBg3dShotNodeVisibilityOverride[];
  readonly render?: StudioBg3dShotRenderOverride;
  readonly background?: StudioBg3dShotBackgroundOverride;
  readonly lighting?: StudioBg3dShotLightingOverride;
  readonly output?: StudioBg3dShotOutputOverride;
}

export interface StudioBg3dShotCreateRequest {
  readonly id: string;
  readonly name: string;
}

export interface StudioBg3dSceneDocument {
  readonly kind: typeof STUDIO_BG3D_SCENE_DOCUMENT_KIND;
  readonly version: typeof STUDIO_BG3D_SCENE_DOCUMENT_VERSION;
  readonly camera: StudioBg3dCameraSettings;
  readonly render: StudioBg3dRenderSettings;
  readonly background: StudioBg3dBackgroundSettings;
  readonly lighting: StudioBg3dLightingSettings;
  readonly quality: StudioBg3dQualityProfiles;
  readonly output: StudioBg3dOutputSettings;
  readonly budgets: StudioBg3dSceneBudgets;
  readonly attachments: readonly StudioBg3dModelAttachment[];
  readonly nodes: readonly StudioBg3dSceneNode[];
  /** Optional to preserve byte-for-byte compatibility with canonical v3 documents. */
  readonly shots?: readonly StudioBg3dShot[];
  /** Absent means no shot is currently applied; it must reference `shots` when present. */
  readonly activeShotId?: string;
  /** 원고 레이어 재편집에도 고정한 컷 원본·버전·승인 상태를 함께 보존한다. */
  readonly pinnedVersionedCut?: StudioScene3dVersionedCut;
}
