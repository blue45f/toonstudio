/**
 * Studio VRM 씬 문서의 엄격 v6 검증·직렬화 및 v1~v5 무손실 승격 파서.
 */
import { hasStudioVrmV6Fields } from "@toonstudio/contracts/studio-vrm-scene-fields";
import {
  decodeBoundedDataGraph,
  deepFreeze,
  exceedsHistoricalSourceLimit,
  hasOwn,
  isRecord,
  jsonStructuresEqual,
  normalizeDecodedCurrentDocument,
  normalizeDecodedDocumentFields,
  utf8ByteLength,
} from "./studio-vrm-scene-document-normalize";
import {
  CURRENT_POSE_KEYS,
  DEFAULT_RAW_DOCUMENT,
  DEFAULT_STUDIO_VRM_LIGHTING_TONE,
  IK_CONSTRAINT_KEYS,
  POSE_TRANSLATION_KEYS,
  RIG_KEYS,
  STUDIO_VRM_MAX_IK_CONSTRAINTS,
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
  STUDIO_VRM_SURFACE_PAINT_MAX_TEXTURES,
  SURFACE_PAINT_KEYS,
  SURFACE_PAINT_TEXTURE_KEYS,
  StudioVrmSceneDocumentBudgetError,
  VERSION_FIVE_ROOT_KEYS,
  VERSION_ONE_ROOT_KEYS,
  VERSION_THREE_POSE_KEYS,
  VERSION_TWO_TO_FOUR_ROOT_KEYS,
  isStudioVrmIkEffector,
  type StudioVrmIkEffector,
  type StudioVrmSceneDocument,
} from "./studio-vrm-scene-document-schema";

export function hasStrictIkConstraints(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > STUDIO_VRM_MAX_IK_CONSTRAINTS) return false;
  const effectors = new Set<StudioVrmIkEffector>();
  for (const constraint of value) {
    if (!isRecord(constraint)) return false;
    const keys = Object.keys(constraint);
    if (
      keys.length !== IK_CONSTRAINT_KEYS.size
      || keys.some((key) => !IK_CONSTRAINT_KEYS.has(key))
      || !isStudioVrmIkEffector(constraint.effector)
      || effectors.has(constraint.effector)
    ) return false;
    effectors.add(constraint.effector);
  }
  return true;
}

function hasStrictSurfacePaint(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (
    keys.length !== SURFACE_PAINT_KEYS.size
    || keys.some((key) => !SURFACE_PAINT_KEYS.has(key))
    || (value.version !== 1 && value.version !== 2)
    || !Array.isArray(value.textures)
    || value.textures.length > STUDIO_VRM_SURFACE_PAINT_MAX_TEXTURES
  ) return false;
  return value.textures.every((texture) => {
    if (!isRecord(texture)) return false;
    const textureKeys = Object.keys(texture);
    const encodingKeys = value.version === 2 ? ["colorSpace", "channelPacking"] : [];
    return textureKeys.length === SURFACE_PAINT_TEXTURE_KEYS.size + encodingKeys.length
      && textureKeys.every((key) => SURFACE_PAINT_TEXTURE_KEYS.has(key) || encodingKeys.includes(key));
  });
}

export function strictDecodedCurrentDocument(value: unknown): StudioVrmSceneDocument | null {
  if (!hasStudioVrmV6Fields(value)
    || !hasStrictIkConstraints(value.pose.ikConstraints)
    || !hasStrictSurfacePaint(value.surfacePaint)
  ) return null;
  let normalized: StudioVrmSceneDocument | null;
  try {
    normalized = normalizeDecodedCurrentDocument(value);
  } catch (cause) {
    if (cause instanceof StudioVrmSceneDocumentBudgetError) return null;
    throw cause;
  }
  if (!normalized || !jsonStructuresEqual(value, normalized)) return null;
  try {
    return utf8ByteLength(JSON.stringify(normalized)) <= STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES
      ? normalized
      : null;
  } catch {
    return null;
  }
}

function versionFiveProjection(document: StudioVrmSceneDocument): Record<string, unknown> {
  const { lightingTone: _lightingTone, ...projection } = document;
  return {
    ...projection,
    version: STUDIO_VRM_SCENE_DOCUMENT_PREVIOUS_VERSION,
  };
}

/**
 * Strict reader for v5 documents written before `lightingTone` became persistent. The historical
 * root vocabulary remains exact; the only authored addition is the deterministic morning tone.
 */
export function migrateStrictDecodedVersionFiveDocument(
  value: unknown,
): StudioVrmSceneDocument | null {
  if (
    !isRecord(value)
    || value.kind !== STUDIO_VRM_SCENE_DOCUMENT_KIND
    || value.version !== STUDIO_VRM_SCENE_DOCUMENT_PREVIOUS_VERSION
  ) return null;
  const keys = Object.keys(value);
  if (
    keys.length !== VERSION_FIVE_ROOT_KEYS.size
    || keys.some((key) => !VERSION_FIVE_ROOT_KEYS.has(key))
  ) return null;
  const migrated = strictDecodedCurrentDocument({
    ...value,
    version: STUDIO_VRM_SCENE_DOCUMENT_VERSION,
    lightingTone: DEFAULT_STUDIO_VRM_LIGHTING_TONE,
  });
  if (!migrated || !jsonStructuresEqual(value, versionFiveProjection(migrated))) return null;
  try {
    return utf8ByteLength(JSON.stringify(value)) <= STUDIO_VRM_SCENE_DOCUMENT_V5_MAX_BYTES
      ? migrated
      : null;
  } catch {
    return null;
  }
}

function versionOneProjection(document: StudioVrmSceneDocument): Record<string, unknown> {
  const {
    translations: _translations,
    ikConstraints: _ikConstraints,
    ...legacyPose
  } = document.pose;
  return {
    kind: document.kind,
    version: STUDIO_VRM_SCENE_DOCUMENT_LEGACY_VERSION,
    model: document.model,
    pose: legacyPose,
    expressions: document.expressions,
    camera: document.camera,
    appearance: document.appearance,
    props: document.props,
    sceneProps: document.sceneProps,
    lighting: document.lighting,
    physics: document.physics,
    env: document.env,
    render: document.render,
  };
}

function versionTwoProjection(document: StudioVrmSceneDocument): Record<string, unknown> {
  const {
    translations: _translations,
    ikConstraints: _ikConstraints,
    ...versionTwoPose
  } = document.pose;
  return {
    kind: document.kind,
    version: STUDIO_VRM_SCENE_DOCUMENT_VERSION_TWO,
    model: document.model,
    pose: versionTwoPose,
    expressions: document.expressions,
    camera: document.camera,
    appearance: document.appearance,
    rig: document.rig,
    props: document.props,
    sceneProps: document.sceneProps,
    lighting: document.lighting,
    physics: document.physics,
    env: document.env,
    render: document.render,
  };
}

function versionThreeProjection(document: StudioVrmSceneDocument): Record<string, unknown> {
  const { ikConstraints: _ikConstraints, ...versionThreePose } = document.pose;
  return {
    kind: document.kind,
    version: STUDIO_VRM_SCENE_DOCUMENT_VERSION_THREE,
    model: document.model,
    pose: versionThreePose,
    expressions: document.expressions,
    camera: document.camera,
    appearance: document.appearance,
    rig: document.rig,
    props: document.props,
    sceneProps: document.sceneProps,
    lighting: document.lighting,
    physics: document.physics,
    env: document.env,
    render: document.render,
  };
}

function versionFourProjection(document: StudioVrmSceneDocument): Record<string, unknown> {
  return {
    kind: document.kind,
    version: STUDIO_VRM_SCENE_DOCUMENT_VERSION_FOUR,
    model: document.model,
    pose: document.pose,
    expressions: document.expressions,
    camera: document.camera,
    appearance: document.appearance,
    rig: document.rig,
    props: document.props,
    sceneProps: document.sceneProps,
    lighting: document.lighting,
    physics: document.physics,
    env: document.env,
    render: document.render,
  };
}

/** Strict v1 reader; all later-version fields are added with documented neutral defaults. */
export function migrateStrictDecodedVersionOneDocument(value: unknown): StudioVrmSceneDocument | null {
  if (
    !isRecord(value)
    || value.kind !== STUDIO_VRM_SCENE_DOCUMENT_KIND
    || value.version !== STUDIO_VRM_SCENE_DOCUMENT_LEGACY_VERSION
  ) return null;
  const keys = Object.keys(value);
  if (
    keys.length !== VERSION_ONE_ROOT_KEYS.size
    || keys.some((key) => !VERSION_ONE_ROOT_KEYS.has(key))
  ) return null;
  const migrated = deepFreeze(normalizeDecodedDocumentFields({
    ...value,
    pose: isRecord(value.pose)
      ? {
          ...value.pose,
          translations: DEFAULT_RAW_DOCUMENT.pose.translations,
          ikConstraints: DEFAULT_RAW_DOCUMENT.pose.ikConstraints,
        }
      : value.pose,
    rig: DEFAULT_RAW_DOCUMENT.rig,
    surfacePaint: DEFAULT_RAW_DOCUMENT.surfacePaint,
  }));
  if (!jsonStructuresEqual(value, versionOneProjection(migrated))) return null;
  try {
    const sourceBytes = utf8ByteLength(JSON.stringify(value));
    const migratedBytes = utf8ByteLength(JSON.stringify(migrated));
    return sourceBytes <= STUDIO_VRM_SCENE_DOCUMENT_V1_MAX_BYTES
      && migratedBytes <= STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES
      ? migrated
      : null;
  } catch {
    return null;
  }
}

/** Strict v2 reader; translation, IK, and surface-paint fields receive neutral defaults. */
export function migrateStrictDecodedVersionTwoDocument(value: unknown): StudioVrmSceneDocument | null {
  if (
    !isRecord(value)
    || value.kind !== STUDIO_VRM_SCENE_DOCUMENT_KIND
    || value.version !== STUDIO_VRM_SCENE_DOCUMENT_VERSION_TWO
  ) return null;
  const keys = Object.keys(value);
  if (
    keys.length !== VERSION_TWO_TO_FOUR_ROOT_KEYS.size
    || keys.some((key) => !VERSION_TWO_TO_FOUR_ROOT_KEYS.has(key))
    || !isRecord(value.rig)
    || Object.keys(value.rig).length !== RIG_KEYS.size
    || Object.keys(value.rig).some((key) => !RIG_KEYS.has(key))
    || !isRecord(value.pose)
    || hasOwn(value.pose, "translations")
  ) return null;
  const migrated = deepFreeze(normalizeDecodedDocumentFields({
    ...value,
    pose: {
      ...value.pose,
      translations: DEFAULT_RAW_DOCUMENT.pose.translations,
      ikConstraints: DEFAULT_RAW_DOCUMENT.pose.ikConstraints,
    },
    surfacePaint: DEFAULT_RAW_DOCUMENT.surfacePaint,
  }));
  if (!jsonStructuresEqual(value, versionTwoProjection(migrated))) return null;
  try {
    const sourceBytes = utf8ByteLength(JSON.stringify(value));
    const migratedBytes = utf8ByteLength(JSON.stringify(migrated));
    return sourceBytes <= STUDIO_VRM_SCENE_DOCUMENT_V2_MAX_BYTES
      && migratedBytes <= STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES
      ? migrated
      : null;
  } catch {
    return null;
  }
}

/** Strict v3 reader; persistent IK and surface-paint fields receive neutral defaults. */
export function migrateStrictDecodedVersionThreeDocument(value: unknown): StudioVrmSceneDocument | null {
  if (
    !isRecord(value)
    || value.kind !== STUDIO_VRM_SCENE_DOCUMENT_KIND
    || value.version !== STUDIO_VRM_SCENE_DOCUMENT_VERSION_THREE
  ) return null;
  const keys = Object.keys(value);
  if (
    keys.length !== VERSION_TWO_TO_FOUR_ROOT_KEYS.size
    || keys.some((key) => !VERSION_TWO_TO_FOUR_ROOT_KEYS.has(key))
    || !isRecord(value.rig)
    || Object.keys(value.rig).length !== RIG_KEYS.size
    || Object.keys(value.rig).some((key) => !RIG_KEYS.has(key))
    || !isRecord(value.pose)
    || Object.keys(value.pose).length !== VERSION_THREE_POSE_KEYS.size
    || Object.keys(value.pose).some((key) => !VERSION_THREE_POSE_KEYS.has(key))
    || !isRecord(value.pose.translations)
    || Object.keys(value.pose.translations).length !== POSE_TRANSLATION_KEYS.size
    || Object.keys(value.pose.translations).some((key) => !POSE_TRANSLATION_KEYS.has(key))
  ) return null;
  const migrated = deepFreeze(normalizeDecodedDocumentFields({
    ...value,
    pose: {
      ...value.pose,
      ikConstraints: DEFAULT_RAW_DOCUMENT.pose.ikConstraints,
    },
    surfacePaint: DEFAULT_RAW_DOCUMENT.surfacePaint,
  }));
  if (!jsonStructuresEqual(value, versionThreeProjection(migrated))) return null;
  try {
    const sourceBytes = utf8ByteLength(JSON.stringify(value));
    const migratedBytes = utf8ByteLength(JSON.stringify(migrated));
    return sourceBytes <= STUDIO_VRM_SCENE_DOCUMENT_V3_MAX_BYTES
      && migratedBytes <= STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES
      ? migrated
      : null;
  } catch {
    return null;
  }
}

/** Strict, lossless v4 reader. The only authored addition is the empty surface-paint block. */
export function migrateStrictDecodedVersionFourDocument(value: unknown): StudioVrmSceneDocument | null {
  if (
    !isRecord(value)
    || value.kind !== STUDIO_VRM_SCENE_DOCUMENT_KIND
    || value.version !== STUDIO_VRM_SCENE_DOCUMENT_VERSION_FOUR
  ) return null;
  const keys = Object.keys(value);
  if (
    keys.length !== VERSION_TWO_TO_FOUR_ROOT_KEYS.size
    || keys.some((key) => !VERSION_TWO_TO_FOUR_ROOT_KEYS.has(key))
    || !isRecord(value.rig)
    || Object.keys(value.rig).length !== RIG_KEYS.size
    || Object.keys(value.rig).some((key) => !RIG_KEYS.has(key))
    || !isRecord(value.pose)
    || Object.keys(value.pose).length !== CURRENT_POSE_KEYS.size
    || Object.keys(value.pose).some((key) => !CURRENT_POSE_KEYS.has(key))
    || !isRecord(value.pose.translations)
    || Object.keys(value.pose.translations).length !== POSE_TRANSLATION_KEYS.size
    || Object.keys(value.pose.translations).some((key) => !POSE_TRANSLATION_KEYS.has(key))
    || !hasStrictIkConstraints(value.pose.ikConstraints)
  ) return null;
  const migrated = deepFreeze(normalizeDecodedDocumentFields({
    ...value,
    surfacePaint: DEFAULT_RAW_DOCUMENT.surfacePaint,
  }));
  if (!jsonStructuresEqual(value, versionFourProjection(migrated))) return null;
  try {
    const sourceBytes = utf8ByteLength(JSON.stringify(value));
    const migratedBytes = utf8ByteLength(JSON.stringify(migrated));
    return sourceBytes <= STUDIO_VRM_SCENE_DOCUMENT_V4_MAX_BYTES
      && migratedBytes <= STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES
      ? migrated
      : null;
  } catch {
    return null;
  }
}

/** Parses canonical v6 and losslessly promotes complete canonical v1-v5 documents. */
export function parseStudioVrmSceneDocument(raw: string): StudioVrmSceneDocument | null {
  const decoded = decodeBoundedDataGraph(raw);
  if (exceedsHistoricalSourceLimit(raw, decoded)) return null;
  return strictDecodedCurrentDocument(decoded)
    ?? migrateStrictDecodedVersionFiveDocument(decoded)
    ?? migrateStrictDecodedVersionFourDocument(decoded)
    ?? migrateStrictDecodedVersionThreeDocument(decoded)
    ?? migrateStrictDecodedVersionTwoDocument(decoded)
    ?? migrateStrictDecodedVersionOneDocument(decoded);
}

/** Serializes only complete, losslessly canonical version-6 documents. */
export function serializeStudioVrmSceneDocument(raw: unknown): string | null {
  const document = strictDecodedCurrentDocument(decodeBoundedDataGraph(raw));
  if (!document) return null;
  try {
    const serialized = JSON.stringify(document);
    return utf8ByteLength(serialized) <= STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES
      ? serialized
      : null;
  } catch {
    return null;
  }
}
