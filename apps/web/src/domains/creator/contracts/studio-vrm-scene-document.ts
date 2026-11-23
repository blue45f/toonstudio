/**
 * Engine-neutral, persistence-safe scene document for the Studio VRM poser.
 *
 * Three.js/React objects, VRM binary bytes, Blob/File values, object URLs, remote URLs, and
 * IndexedDB keys deliberately stay outside this contract. Uploaded models are addressed only by
 * immutable attachment metadata; the runtime must resolve and verify their bytes separately.
 */
import {
  migrateDecodedFullStateMetadata,
  migrateDecodedLegacyMetadata,
} from "./studio-vrm-scene-document-legacy";
import {
  decodeBoundedDataGraph,
  exceedsHistoricalSourceLimit,
  normalizeDecodedCurrentDocument,
} from "./studio-vrm-scene-document-normalize";
import {
  DEFAULT_RAW_DOCUMENT,
  type StudioVrmLegacyMigrationOptions,
  type StudioVrmSceneDocument,
  type StudioVrmSceneModel,
} from "./studio-vrm-scene-document-schema";
import {
  migrateStrictDecodedVersionFiveDocument,
  migrateStrictDecodedVersionFourDocument,
  migrateStrictDecodedVersionOneDocument,
  migrateStrictDecodedVersionThreeDocument,
  migrateStrictDecodedVersionTwoDocument,
  serializeStudioVrmSceneDocument,
  strictDecodedCurrentDocument,
} from "./studio-vrm-scene-document-versions";

export {
  DEFAULT_STUDIO_VRM_LIGHTING_TONE,
  STUDIO_VRM_IK_EFFECTORS,
  STUDIO_VRM_LIGHTING_TONES,
  STUDIO_VRM_MAX_EXPRESSIONS,
  STUDIO_VRM_MAX_FINGER_BONES,
  STUDIO_VRM_MAX_IK_CONSTRAINTS,
  STUDIO_VRM_MAX_POSE_BONES,
  STUDIO_VRM_MODEL_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_KIND,
  STUDIO_VRM_SCENE_DOCUMENT_LEGACY_VERSION,
  STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_PREVIOUS_VERSION,
  STUDIO_VRM_SCENE_DOCUMENT_V1_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_V2_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_V3_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_V4_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_V5_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_VERSION,
  STUDIO_VRM_SCENE_DOCUMENT_VERSION_FOUR,
  STUDIO_VRM_SCENE_DOCUMENT_VERSION_THREE,
  STUDIO_VRM_SCENE_DOCUMENT_VERSION_TWO,
  STUDIO_VRM_SURFACE_PAINT_BASE_COLOR_SLOT,
  STUDIO_VRM_SURFACE_PAINT_MAX_DECODED_PIXELS,
  STUDIO_VRM_SURFACE_PAINT_MAX_DIMENSION,
  STUDIO_VRM_SURFACE_PAINT_MAX_TEXTURES,
  STUDIO_VRM_SURFACE_PAINT_MAX_TEXTURE_PIXELS,
  STUDIO_VRM_SURFACE_PAINT_TEXTURE_MAX_BYTES,
  STUDIO_VRM_SURFACE_PAINT_TOTAL_MAX_BYTES,
  StudioVrmSceneDocumentBudgetError,
  type StudioVrmAppearanceSettings,
  type StudioVrmAttachmentModel,
  type StudioVrmBodyScale,
  type StudioVrmBundledModel,
  type StudioVrmBundledModelDescriptor,
  type StudioVrmCameraSettings,
  type StudioVrmEnvironment,
  type StudioVrmFingerBoneName,
  type StudioVrmFingerRotationMap,
  type StudioVrmHumanoidBoneName,
  type StudioVrmIkConstraint,
  type StudioVrmIkEffector,
  type StudioVrmLegacyFragmentMigration,
  type StudioVrmLegacyMetadataMigration,
  type StudioVrmLegacyMigrationOptions,
  type StudioVrmLightingSettings,
  type StudioVrmLightingTone,
  type StudioVrmMaterialFx,
  type StudioVrmPhysicsSettings,
  type StudioVrmPoseBone,
  type StudioVrmPoseBoneMap,
  type StudioVrmPoseState,
  type StudioVrmPoseTranslations,
  type StudioVrmRenderSettings,
  type StudioVrmRigSettings,
  type StudioVrmSceneDocument,
  type StudioVrmSceneDocumentBudgetErrorCode,
  type StudioVrmSceneModel,
  type StudioVrmSurfacePaintSettings,
  type StudioVrmSurfacePaintTexture,
  type StudioVrmVec3,
} from "./studio-vrm-scene-document-schema";
export {
  STUDIO_VRM_FINGER_BONES,
  STUDIO_VRM_HUMANOID_BONES,
  type StudioVrmCanonicalData,
} from "@toonstudio/contracts/studio-vrm-scene-fields";
export {
  migrateStudioVrmLegacyMetadata,
  parseStudioVrmLegacyFragment,
} from "./studio-vrm-scene-document-legacy";
export {
  parseStudioVrmSceneDocument,
  serializeStudioVrmSceneDocument,
} from "./studio-vrm-scene-document-versions";

/** Returns a new, deeply frozen default scene document on every call. */
export function createDefaultStudioVrmSceneDocument(): StudioVrmSceneDocument {
  const decoded = decodeBoundedDataGraph(DEFAULT_RAW_DOCUMENT);
  const document = strictDecodedCurrentDocument(decoded);
  if (!document) throw new Error("Invalid internal Studio VRM scene defaults.");
  return document;
}

/** Creates a default scene with a validated model descriptor. */
export function createStudioVrmSceneDocument(model?: StudioVrmSceneModel): StudioVrmSceneDocument {
  return normalizeStudioVrmSceneDocument({
    ...DEFAULT_RAW_DOCUMENT,
    model: model ?? DEFAULT_RAW_DOCUMENT.model,
  });
}

export const DEFAULT_STUDIO_VRM_SCENE_DOCUMENT = createDefaultStudioVrmSceneDocument();

/**
 * Lenient editor normalizer. Invalid roots, future versions, accessors, cycles, and oversized input
 * reset to a fresh default; persistence must use the strict parse/serialize functions below.
 */
export function normalizeStudioVrmSceneDocument(raw: unknown): StudioVrmSceneDocument {
  const decoded = decodeBoundedDataGraph(raw);
  if (exceedsHistoricalSourceLimit(raw, decoded)) return createDefaultStudioVrmSceneDocument();
  return normalizeDecodedCurrentDocument(decoded)
    ?? migrateStrictDecodedVersionFiveDocument(decoded)
    ?? migrateStrictDecodedVersionFourDocument(decoded)
    ?? migrateStrictDecodedVersionThreeDocument(decoded)
    ?? migrateStrictDecodedVersionTwoDocument(decoded)
    ?? migrateStrictDecodedVersionOneDocument(decoded)
    ?? createDefaultStudioVrmSceneDocument();
}

/**
 * Migrates a canonical scene or a legacy PNG-fragment metadata object. Legacy local-library ids
 * intentionally return null unless the id appears in the explicit bundled registry.
 */
export function migrateStudioVrmSceneDocument(
  raw: unknown,
  options: StudioVrmLegacyMigrationOptions = {},
): StudioVrmSceneDocument | null {
  const decoded = decodeBoundedDataGraph(raw);
  if (exceedsHistoricalSourceLimit(raw, decoded)) return null;
  const current = strictDecodedCurrentDocument(decoded);
  if (current) return current;
  const versionFive = migrateStrictDecodedVersionFiveDocument(decoded);
  if (versionFive) return versionFive;
  const versionFour = migrateStrictDecodedVersionFourDocument(decoded);
  if (versionFour) return versionFour;
  const versionThree = migrateStrictDecodedVersionThreeDocument(decoded);
  if (versionThree) return versionThree;
  const versionTwo = migrateStrictDecodedVersionTwoDocument(decoded);
  if (versionTwo) return versionTwo;
  const versionOne = migrateStrictDecodedVersionOneDocument(decoded);
  if (versionOne) return versionOne;
  const migrated = migrateDecodedFullStateMetadata(decoded, options)
    ?? migrateDecodedLegacyMetadata(decoded, options);
  return migrated?.status === "resolved" ? migrated.document : null;
}

/** Canonical semantic equality independent of object identity and key insertion order. */
export function areStudioVrmSceneDocumentsEqual(left: unknown, right: unknown): boolean {
  const leftSerialized = serializeStudioVrmSceneDocument(migrateStudioVrmSceneDocument(left));
  return leftSerialized !== null
    && leftSerialized === serializeStudioVrmSceneDocument(migrateStudioVrmSceneDocument(right));
}

/** Returns whether a canonical scene contains authoring intent beyond the fresh default. */
export function studioVrmSceneHasContent(raw: unknown): boolean {
  const serialized = serializeStudioVrmSceneDocument(migrateStudioVrmSceneDocument(raw));
  if (!serialized) return false;
  return serialized !== serializeStudioVrmSceneDocument(DEFAULT_STUDIO_VRM_SCENE_DOCUMENT);
}
