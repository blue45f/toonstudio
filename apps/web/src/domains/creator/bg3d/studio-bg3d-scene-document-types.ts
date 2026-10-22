/**
 * Studio BG3D 씬 문서 타입·기본값 — 엔진 중립 문서 스키마(v3)의 타입, 한도 상수,
 * 기본 설정 묶음과 예산 오류 계약. 정규화·마이그레이션 로직(studio-bg3d-scene-document)이
 * 공유하는 기반 정의만 모았다.
 */

import type { StudioGeneric3dWorkflowMetadataRecord } from "../studio-generic-3d-workflow-metadata";
import type { StudioScene3dVersionedCut } from "../scene3d/studio-scene3d-shot-versions";
import type { StudioBg3dEnvironmentSettings } from "./studio-bg3d-hdri-environment";

export const STUDIO_BG3D_SCENE_DOCUMENT_KIND = "toonstudio.bg3d-scene" as const;
// 노드 tags·componentRef, 장면 meta, 컷 hiddenTags 는 v3 에 선택 필드로 더했고 버전은 올리지 않았다.
// 올리면 저장된 v3 데이터(고정 컷 sourceHash, 템플릿 sceneJson 등)를 함께 옮겨야 한다. 소유자 판정 대기:
// docs/features/bg3d-components-tags-scenes.md "버전을 올리지 않은 이유와 대가".
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
  | "tag-count-budget-exceeded"
  | "hidden-tag-count-budget-exceeded"
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

/** UV 좌표 쌍 [u, v]. 둘 다 0..1, 원점은 텍스처 왼쪽 아래(Three UV 관례). */
export type StudioBg3dTexturePaintPoint = readonly [number, number];

/**
 * 3D 표면 직접 그리기 1단계의 획 1개 — 프리미티브 UV 공간의 브러시 투영 결과.
 * 래스터 텍스처가 아니라 획 벡터가 정본이다: 문서 예산(320KiB) 안에서 저장/재열기를
 * 보장하고, 텍스처는 획으로부터 결정적으로 재래스터화한다(device lost 복구 포함).
 * 정규화·한도는 studio-bg3d-texture-paint의 normalizeStudioBg3dTexturePaint가 강제한다.
 */
export interface StudioBg3dTexturePaintStroke {
  readonly color: string;
  /** 브러시 지름(UV 단위, 0..0.5). */
  readonly size: number;
  readonly opacity: number;
  readonly points: readonly StudioBg3dTexturePaintPoint[];
}

/** 프리미티브 1개의 표면 페인트 전체. 획 순서가 그리기 순서(z)다. */
export interface StudioBg3dTexturePaint {
  readonly version: 1;
  readonly strokes: readonly StudioBg3dTexturePaintStroke[];
}

/**
 * 3D 표면 직접 그리기 2단계 — GLB 모델 텍스처 페인트의 대상 1개.
 * `targetKey`는 렌더 가능한 메시 프리미티브의 결정적 순서 키다: `mesh-<순서>`에 재질 배열
 * 슬롯이 있을 때만 `:slot-<슬롯>`이 붙는다. glTF JSON 분석(studio-bg3d-glb-texture-paint)과
 * Three 런타임 수집기가 같은 순서 규칙(장면 DFS → 메시 → 프리미티브)을 공유한다.
 * 획은 대상 텍스처의 UV 공간에 있으며, 같은 텍스처를 공유하는 대상은 순서대로 합성된다.
 */
export interface StudioBg3dModelTexturePaintTarget {
  readonly targetKey: string;
  readonly paint: StudioBg3dTexturePaint;
}

/**
 * GLB 모델 1개의 텍스처 페인트 전체(2단계). 프리미티브 페인트와 마찬가지로 획 벡터가
 * 정본이고 래스터 텍스처는 캐시이며, 정규화·한도는
 * studio-bg3d-glb-texture-paint의 normalizeStudioBg3dModelTexturePaint가 강제한다.
 */
export interface StudioBg3dModelTexturePaint {
  readonly version: 1;
  readonly targets: readonly StudioBg3dModelTexturePaintTarget[];
}

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
  /** 실제 HDRI 환경광 설정. 없으면 절차 파노라마 환경(현행 동작)이 기본입니다. */
  readonly environment?: StudioBg3dEnvironmentSettings;
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
  /**
   * 앞 물체에 가려지는 쪽(먼 면)에 생기는 이중선을 앞 물체의 윤곽선 한 줄로 합치고 그쪽 재질선 반점을 줄인다.
   * 깊이 캡처가 있을 때만 효과가 있다(깊이선 검출 또는 내부선 억제가 켜져 있을 때). 깊이가 없으면 아무것도
   * 바꾸지 않는다.
   */
  readonly hiddenLineRemoval: boolean;
  /**
   * 내부선 억제 켜기. 물체 안쪽 명암·재질·모서리 선을 줄이고 윤곽선과 윤곽에 붙은 선을 남긴다.
   * 선택 필드: 값이 있을 때만 저장한다. 이 키가 없는 이전 문서는 꺼짐과 같다.
   */
  readonly interiorSuppressionEnabled?: boolean;
  /** 내부선 억제 강도(0..1, 없으면 0.6). 켜져 있을 때만 의미가 있다. */
  readonly interiorSuppressionStrength?: number;
}

/**
 * 내부선 억제를 켰을 때 강도 필드가 없으면 쓰는 기본 강도. 장면 문서 정규화(라우트)가 쓰는 원본이다.
 * 같은 값을 선화 렌더러 쪽 잎 모듈(`studio-bg3d-line-output-rules`)도 가지고 있으며 두 값이 같음을 시험이 지킨다.
 * 내부선 억제 해석·깊이 캡처 판정 함수는 이 큰 모듈에 두지 않고 그 잎 모듈에만 둔다: 이 모듈에 새 런타임
 * import 가 생기면 번들러가 이 모듈을 장면 문서 청크에서 떼어 선화·생산 청크에 묶고 Studio 라우트가 그 청크를
 * 정적으로 끌어온다(2026-10-16 번들 래칫 회귀).
 */
export const STUDIO_BG3D_INTERIOR_SUPPRESSION_DEFAULT_STRENGTH = 0.6;

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

/**
 * 컴포넌트 참조 — 같은 `id` 를 가진 노드를 한 컴포넌트의 인스턴스로 묶어 본다(아웃라이너 묶음 보기).
 * 이름 기반 표지일 뿐이다: 형상·계층·SketchUp 컴포넌트 정의를 되살리지 않는다.
 */
export interface StudioBg3dComponentRef {
  /** 노드 id 와 같은 규칙의 식별자. 같은 값이면 같은 컴포넌트다. */
  readonly id: string;
  /** 사용자에게 보이는 이름(이름 바꾸기 대상). 신뢰할 수 없는 텍스트이므로 텍스트로만 그린다. */
  readonly name: string;
}

/**
 * 노드의 장면 구성 정보. 둘 다 선택 필드다: 없으면 태그·컴포넌트가 없는 것이며, 정규화는 빈 값을 생략한다
 * (이 키가 없는 기존 문서는 바이트 단위로 그대로 열린다).
 */
export interface StudioBg3dNodeOrganization {
  /** 정렬·중복 제거된 태그 목록(노드당 최대 8개). 태그 숨김은 `meta.hiddenTags` 가 정하며 `visible` 과 따로 움직인다. */
  readonly tags?: readonly string[];
  readonly componentRef?: StudioBg3dComponentRef;
}

/**
 * 장면 메타. 모든 필드가 선택이고 비어 있으면 `meta` 자체를 생략한다.
 * - `hiddenTags`: 숨긴 태그(태그 가시성 사전의 `false` 항목만 기록, 정렬·중복 제거). 이 태그가 붙은 노드는
 *   `visible` 값과 무관하게 렌더에서 빠진다. 사전을 객체 대신 목록으로 둔 것은 임의 문자열 키의 프로토타입 오염을 피하기 위해서다.
 */
export interface StudioBg3dSceneMeta {
  readonly name?: string;
  readonly memo?: string;
  readonly hiddenTags?: readonly string[];
}

interface StudioBg3dSceneNodeBase extends StudioBg3dNodeOrganization {
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
  /**
   * 표면 직접 그리기(UV 텍스처 페인팅) 획. Optional — 페인트가 없는 기존 문서와
   * 바이트 단위 호환을 유지하고, 정규화에서 유효 획이 없으면 필드 자체가 생략된다.
   */
  readonly texturePaint?: StudioBg3dTexturePaint;
}

export interface StudioBg3dModelNode extends StudioBg3dSceneNodeBase {
  readonly kind: "model";
  readonly attachmentId: string;
  readonly materialOverride?: StudioBg3dMaterialOverride;
  /**
   * 표면 직접 그리기 2단계(GLB 텍스처 페인트) 획. Optional — 페인트가 없는 기존 문서와
   * 바이트 단위 호환을 유지하고, 정규화에서 유효한 대상이 없으면 필드 자체가 생략된다.
   */
  readonly modelTexturePaint?: StudioBg3dModelTexturePaint;
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
  readonly interiorSuppressionEnabled?: boolean;
  readonly interiorSuppressionStrength?: number;
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
  /** 이 컷이 기억하는 숨긴 태그 집합. 없으면(이전 컷) 컷을 적용해도 태그 가시성을 바꾸지 않는다. */
  readonly hiddenTags?: readonly string[];
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
  /** 장면 이름·메모·숨긴 태그. 선택 필드라 이 키가 없는 기존 v3 문서는 바이트 단위로 그대로 열린다. */
  readonly meta?: StudioBg3dSceneMeta;
}
