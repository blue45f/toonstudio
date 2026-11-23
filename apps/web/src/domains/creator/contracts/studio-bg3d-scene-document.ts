/**
 * Engine-neutral, persistence-safe document for Studio's 3D background editor.
 *
 * Runtime objects, engine classes, Blob/File values, object URLs, remote URLs, storage keys, and
 * credentials are deliberately outside this schema. Model binaries are resolved by attachment id
 * at the runtime boundary; this document stores only bounded GLB metadata and scene intent.
 */
import { normalizeStudioBg3dModelTexturePaint } from "../studio-bg3d-model-texture-paint";
import {
  normalizeAnimationPlayback,
  normalizeAttachment,
  normalizeConstraintLayer,
  normalizeMaterialOverride,
  normalizeMorphLayer,
  normalizePoseLayer,
} from "./studio-bg3d-scene-document-graph";
import { decodeBoundedJson, deepFreeze } from "./studio-bg3d-scene-document-primitives";
import { normalizeStudioBg3dTexturePaint } from "./studio-bg3d-texture-paint-contract";

import type {
  StudioBg3dAnimationPlayback,
  StudioBg3dConstraintLayer,
  StudioBg3dMaterialOverride,
  StudioBg3dModelAttachment,
  StudioBg3dModelTexturePaint,
  StudioBg3dMorphLayer,
  StudioBg3dPoseLayer,
  StudioBg3dTexturePaint,
} from "../bg3d/studio-bg3d-scene-document-types";

export {
  DEFAULT_STUDIO_BG3D_ANIMATION_PLAYBACK,
  DEFAULT_STUDIO_BG3D_CONSTRAINT_LAYER,
  DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
  DEFAULT_STUDIO_BG3D_MORPH_LAYER,
  DEFAULT_STUDIO_BG3D_POSE_LAYER,
  STUDIO_BG3D_AIM_AXES,
  STUDIO_BG3D_GLB_MAX_BYTES,
  STUDIO_BG3D_GLB_MIME,
  STUDIO_BG3D_MAX_TWO_BONE_IK_CONSTRAINTS,
  STUDIO_BG3D_PRIMITIVE_KINDS,
  STUDIO_BG3D_SCENE_DOCUMENT_KIND,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS,
  STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
  STUDIO_BG3D_SIX_PASS_SCENE_DOCUMENT_VERSION,
  STUDIO_BG3D_SHOT_ID_MAX_LENGTH,
  STUDIO_BG3D_SHOT_MAX_NODE_VISIBILITY_OVERRIDES,
  STUDIO_BG3D_SHOT_NAME_MAX_LENGTH,
  STUDIO_BG3D_SKY_PRESET_IDS,
  StudioBg3dSceneDocumentBudgetError,
} from "./studio-bg3d-scene-document-constants";
export type {
  StudioBg3dAimAxis, StudioBg3dAnimationLoopMode, StudioBg3dAnimationPlayback, StudioBg3dAttachmentRights,
  StudioBg3dAttachmentSource, StudioBg3dBackgroundMode, StudioBg3dBackgroundSettings, StudioBg3dCameraSettings,
  StudioBg3dComplexityBudget, StudioBg3dConstraintLayer, StudioBg3dDirectionalLightSettings,
  StudioBg3dGlbVerificationFailure, StudioBg3dGlbVerificationFailureCode, StudioBg3dGlbVerificationRequest,
  StudioBg3dGlbVerificationResult, StudioBg3dGlbVerificationSuccess, StudioBg3dJointAimConstraint,
  StudioBg3dJointPoseOverride, StudioBg3dLegacyMigrationOptions, StudioBg3dLightingSettings, StudioBg3dLineLayerType,
  StudioBg3dLineOutputSettings, StudioBg3dMaterialColorMode, StudioBg3dMaterialOverride, StudioBg3dModelAttachment,
  StudioBg3dModelNode, StudioBg3dMorphLayer, StudioBg3dNodeOrganization, StudioBg3dComponentRef, StudioBg3dSceneMeta,
  StudioBg3dMorphWeightOverride, StudioBg3dOutputSettings, StudioBg3dSixPassLtSettings, StudioBg3dParsedGlbMetrics,
  StudioBg3dPoseLayer, StudioBg3dPostParseBudgetRequest, StudioBg3dPrimitiveKind, StudioBg3dPrimitiveNode,
  StudioBg3dQualityProfile, StudioBg3dQualityProfiles, StudioBg3dQuaternion, StudioBg3dRenderSettings,
  StudioBg3dRightsStatus, StudioBg3dSceneBudgets, StudioBg3dSceneDocument, StudioBg3dSceneDocumentBudgetErrorCode,
  StudioBg3dSceneNode, StudioBg3dShot, StudioBg3dShotBackgroundOverride, StudioBg3dShotCameraOverride,
  StudioBg3dShotCreateRequest, StudioBg3dShotDirectionalLightOverride, StudioBg3dShotLightingOverride,
  StudioBg3dShotLineOutputOverride, StudioBg3dShotNodeVisibilityOverride, StudioBg3dShotOutputOverride,
  StudioBg3dShotRenderOverride, StudioBg3dShotToneOutputOverride, StudioBg3dSkyPresetId, StudioBg3dTextureBudget,
  StudioBg3dModelTexturePaint, StudioBg3dModelTexturePaintTarget, StudioBg3dTexturePaint, StudioBg3dTexturePaintPoint,
  StudioBg3dTexturePaintStroke, StudioBg3dToneMapping, StudioBg3dToneMode, StudioBg3dToneOutputSettings,
  StudioBg3dToneOutputType, StudioBg3dTonePattern, StudioBg3dTransform, StudioBg3dTwoBoneIkConstraint, StudioBg3dVec3,
} from "../bg3d/studio-bg3d-scene-document-types";

export {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  createDefaultStudioBg3dSceneDocument,
  normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document-core";
export { migrateStudioBg3dSceneDocument } from "./studio-bg3d-scene-document-migrations";
export {
  normalizeStudioBg3dLineOutputSettings,
  normalizeStudioBg3dShotLineOutputOverride,
} from "./studio-bg3d-scene-document-sections";
export {
  applyStudioBg3dShot,
  captureStudioBg3dShot,
  duplicateStudioBg3dShot,
  moveStudioBg3dShot,
  removeStudioBg3dShot,
} from "./studio-bg3d-scene-document-shots";

/** Runtime/UI helper for pre-validating one metadata record without retaining hostile fields. */
export function normalizeStudioBg3dGlbAttachment(
  raw: unknown,
): StudioBg3dModelAttachment | null {
  const decoded = decodeBoundedJson(raw);
  return deepFreeze(normalizeAttachment(decoded));
}

/** Runtime adapter helper for accepting only the bounded canonical material payload. */
export function normalizeStudioBg3dMaterialOverride(
  raw: unknown,
): StudioBg3dMaterialOverride | null {
  return deepFreeze(normalizeMaterialOverride(decodeBoundedJson(raw)));
}

export function normalizeStudioBg3dAnimationPlayback(
  raw: unknown,
): StudioBg3dAnimationPlayback | null {
  return deepFreeze(normalizeAnimationPlayback(decodeBoundedJson(raw)));
}

export function normalizeStudioBg3dPoseLayer(raw: unknown): StudioBg3dPoseLayer | null {
  return deepFreeze(normalizePoseLayer(decodeBoundedJson(raw)));
}

export function normalizeStudioBg3dMorphLayer(raw: unknown): StudioBg3dMorphLayer | null {
  return deepFreeze(normalizeMorphLayer(decodeBoundedJson(raw)));
}

export function normalizeStudioBg3dConstraintLayer(raw: unknown): StudioBg3dConstraintLayer | null {
  return deepFreeze(normalizeConstraintLayer(decodeBoundedJson(raw)));
}

/** Runtime adapter helper for accepting only the bounded canonical texture-paint payload. */
export function normalizeStudioBg3dTexturePaintPayload(
  raw: unknown,
): StudioBg3dTexturePaint | null {
  return deepFreeze(normalizeStudioBg3dTexturePaint(decodeBoundedJson(raw)));
}

/** Runtime adapter helper for accepting only the bounded canonical GLB texture-paint payload. */
export function normalizeStudioBg3dModelTexturePaintPayload(
  raw: unknown,
): StudioBg3dModelTexturePaint | null {
  return deepFreeze(normalizeStudioBg3dModelTexturePaint(decodeBoundedJson(raw)));
}
