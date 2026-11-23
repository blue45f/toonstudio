/**
 * Studio VRM 씬 문서의 구버전 PNG 프래그먼트·FullVrmState 메타데이터 마이그레이션.
 */
import { normalizedDataOrNull } from "@toonstudio/contracts/studio-vrm-scene-fields";
import {
  decodeBoundedDataGraph,
  deepFreeze,
  hasOwn,
  isRecord,
  jsonStructuresEqual,
  normalizeAppearance,
  normalizeExpressions,
  normalizeIkConstraints,
  normalizeLighting,
  normalizeLightingTone,
  normalizePhysics,
  normalizePose,
  normalizePoseBones,
  normalizePoseTranslations,
  normalizeRender,
  normalizeSafeId,
  normalizeSafeText,
  utf8ByteLength,
} from "./studio-vrm-scene-document-normalize";
import {
  DEFAULT_RAW_DOCUMENT,
  POSE_TRANSLATION_KEYS,
  STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES,
  isStudioVrmEnvironment,
  isStudioVrmLightingTone,
  type StudioVrmBundledModel,
  type StudioVrmLegacyFragmentMigration,
  type StudioVrmLegacyMetadataMigration,
  type StudioVrmLegacyMigrationOptions,
  type StudioVrmPoseTranslations,
  type StudioVrmSceneDocument,
} from "./studio-vrm-scene-document-schema";
import {
  hasStrictIkConstraints,
  parseStudioVrmSceneDocument,
  serializeStudioVrmSceneDocument,
} from "./studio-vrm-scene-document-versions";

const LEGACY_ROOT_KEYS = new Set([
  "tool",
  "poseId",
  "expressionId",
  "yOffset",
  "bodyRotationY",
  "bones",
  "expressionWeights",
  "customColors",
  "materialFx",
  "modelName",
  "modelId",
  "bodyScale",
  "fingerOverrides",
  "lighting",
  "lightingTone",
  "env",
  "avatarForge",
  "vrmProps",
  "props",
  "sceneProps",
  "costume",
  "wardrobe",
  "physics",
  "mannequin",
  "transparentBackground",
  "renderWidth",
  "renderHeight",
]);

/** Exact key vocabulary emitted by buildVrmPoseDataUrlMetadata for FullVrmState v2. */
const FULL_STATE_V2_FRAGMENT_KEYS = new Set([
  "tool",
  "version",
  "modelId",
  "poseId",
  "bones",
  "yOffset",
  "poseTranslations",
  "bodyRotation",
  "expressionId",
  "expressionWeights",
  "costume",
  "wardrobe",
  "sceneProps",
  "physics",
  "bodyScale",
  "lighting",
  "lightingTone",
  "env",
  "fingerOverrides",
  "materialFx",
  "avatarForge",
  "customColors",
  "modelName",
  "vrmProps",
]);
const FULL_STATE_V3_FRAGMENT_KEYS = new Set([
  ...FULL_STATE_V2_FRAGMENT_KEYS,
  "ikConstraints",
]);

function readLegacyBundledModel(
  value: Record<string, unknown>,
  options: StudioVrmLegacyMigrationOptions,
): StudioVrmBundledModel | null {
  const modelId = typeof value.modelId === "string" ? value.modelId : null;
  if (!modelId) return null;
  const registry = options.bundledModels ?? [{ id: "sample-vrm", name: "루미" }];
  const match = registry.find((entry) => entry.id === modelId);
  if (!match) return null;
  const id = normalizeSafeId(match.id, "");
  const name = normalizeSafeText(match.name, "", 128);
  return id && name ? { source: "bundled", id, name } : null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function strictFullStateV2Translations(
  value: Record<string, unknown>,
): StudioVrmPoseTranslations | null {
  if (!hasOwn(value, "poseTranslations")) return DEFAULT_RAW_DOCUMENT.pose.translations;
  if (!isRecord(value.poseTranslations)) return null;
  const keys = Object.keys(value.poseTranslations);
  if (
    keys.length !== POSE_TRANSLATION_KEYS.size
    || keys.some((key) => !POSE_TRANSLATION_KEYS.has(key))
  ) return null;
  const normalized = normalizePoseTranslations(value.poseTranslations);
  return jsonStructuresEqual(value.poseTranslations, normalized) ? normalized : null;
}

/**
 * Migrates the currently emitted re-editable PNG metadata. Keeping this separate from the
 * pre-version reader makes mixed old/new field names and future FullVrmState versions fail closed.
 */
export function migrateDecodedFullStateMetadata(
  value: unknown,
  options: StudioVrmLegacyMigrationOptions,
): StudioVrmLegacyMetadataMigration | null {
  const fullStateVersion = isRecord(value) ? value.version : undefined;
  const allowedKeys = fullStateVersion === 3
    ? FULL_STATE_V3_FRAGMENT_KEYS
    : FULL_STATE_V2_FRAGMENT_KEYS;
  if (
    !isRecord(value)
    || value.tool !== "vrm-poser"
    || (value.version !== 2 && value.version !== 3)
    || hasOwn(value, "kind")
    || !hasOnlyKeys(value, allowedKeys)
    || !hasOwn(value, "bones")
    || !hasOwn(value, "yOffset")
    || !hasOwn(value, "bodyRotation")
    || (value.version === 3 && !hasOwn(value, "ikConstraints"))
    || (value.version === 3 && !hasOwn(value, "poseTranslations"))
    || (hasOwn(value, "lightingTone") && !isStudioVrmLightingTone(value.lightingTone))
  ) return null;

  const translations = strictFullStateV2Translations(value);
  if (!translations) return null;
  const normalizedBones = normalizePoseBones(value.bones);
  if (!jsonStructuresEqual(value.bones, normalizedBones)) return null;
  const ikConstraints = value.version === 2
    ? DEFAULT_RAW_DOCUMENT.pose.ikConstraints
    : hasStrictIkConstraints(value.ikConstraints)
      ? normalizeIkConstraints(value.ikConstraints)
      : null;
  if (!ikConstraints || (value.version === 3 && !jsonStructuresEqual(value.ikConstraints, ikConstraints))) {
    return null;
  }
  if (
    typeof value.yOffset !== "number"
    || !Number.isFinite(value.yOffset)
    || value.yOffset < -10
    || value.yOffset > 10
    || typeof value.bodyRotation !== "number"
    || !Number.isFinite(value.bodyRotation)
    || value.bodyRotation < -Math.PI
    || value.bodyRotation > Math.PI
  ) return null;

  const bundledModel = readLegacyBundledModel(value, options);
  if (!bundledModel) {
    return deepFreeze({
      status: "unresolved-model",
      modelId: typeof value.modelId === "string" ? value.modelId : null,
      modelName: typeof value.modelName === "string"
        ? normalizeSafeText(value.modelName, "") || null
        : null,
    });
  }

  const candidate: StudioVrmSceneDocument = {
    ...DEFAULT_RAW_DOCUMENT,
    model: bundledModel,
    pose: normalizePose({
      bones: normalizedBones,
      yOffset: value.yOffset,
      translations,
      bodyRotationY: value.bodyRotation,
      fingerOverrides: value.fingerOverrides,
      ikConstraints,
    }),
    expressions: normalizeExpressions(value.expressionWeights),
    appearance: normalizeAppearance({
      bodyScale: value.bodyScale,
      customColors: value.customColors,
      materialFx: value.materialFx,
      avatarForge: value.avatarForge,
      costume: value.costume,
      wardrobe: value.wardrobe,
    }),
    props: normalizedDataOrNull(value.vrmProps),
    sceneProps: normalizedDataOrNull(value.sceneProps),
    lighting: normalizeLighting(value.lighting),
    lightingTone: normalizeLightingTone(value.lightingTone),
    physics: normalizePhysics(value.physics),
    env: isStudioVrmEnvironment(value.env) ? value.env : "none",
  };
  const serialized = serializeStudioVrmSceneDocument(candidate);
  const document = serialized ? parseStudioVrmSceneDocument(serialized) : null;
  return document ? deepFreeze({ status: "resolved", document }) : null;
}

export function migrateDecodedLegacyMetadata(
  value: unknown,
  options: StudioVrmLegacyMigrationOptions,
): StudioVrmLegacyMetadataMigration | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, LEGACY_ROOT_KEYS) ||
    (hasOwn(value, "tool") && value.tool !== "vrm-poser") ||
    hasOwn(value, "kind") ||
    hasOwn(value, "version") ||
    (hasOwn(value, "lightingTone") && !isStudioVrmLightingTone(value.lightingTone))
  ) return null;
  const bundledModel = readLegacyBundledModel(value, options);
  if (!bundledModel) {
    return deepFreeze({
      status: "unresolved-model",
      modelId: typeof value.modelId === "string" ? value.modelId : null,
      modelName: typeof value.modelName === "string"
        ? normalizeSafeText(value.modelName, "") || null
        : null,
    });
  }
  const vrmProps = value.vrmProps !== undefined ? value.vrmProps : value.props;
  const candidate: StudioVrmSceneDocument = {
    ...DEFAULT_RAW_DOCUMENT,
    model: bundledModel,
    pose: normalizePose({
      bones: value.bones,
      yOffset: value.yOffset,
      bodyRotationY: value.bodyRotationY,
      fingerOverrides: value.fingerOverrides,
    }),
    expressions: normalizeExpressions(value.expressionWeights),
    appearance: normalizeAppearance({
      bodyScale: value.bodyScale,
      customColors: value.customColors,
      materialFx: value.materialFx,
      mannequin: value.mannequin,
      avatarForge: value.avatarForge,
      costume: value.costume,
      wardrobe: value.wardrobe,
    }),
    props: normalizedDataOrNull(vrmProps),
    sceneProps: normalizedDataOrNull(value.sceneProps),
    lighting: normalizeLighting(value.lighting),
    lightingTone: normalizeLightingTone(value.lightingTone),
    physics: normalizePhysics(value.physics),
    env: isStudioVrmEnvironment(value.env) ? value.env : "none",
    render: normalizeRender({
      width: value.renderWidth,
      height: value.renderHeight,
      transparentBackground: value.transparentBackground,
      backgroundColor: "#ffffff",
    }),
  };
  const serialized = serializeStudioVrmSceneDocument(candidate);
  const document = serialized ? parseStudioVrmSceneDocument(serialized) : null;
  return document ? deepFreeze({ status: "resolved", document }) : null;
}

/** Detailed legacy migration for callers that need to surface an unresolved local-model state. */
export function migrateStudioVrmLegacyMetadata(
  raw: unknown,
  options: StudioVrmLegacyMigrationOptions = {},
): StudioVrmLegacyMetadataMigration | null {
  const decoded = decodeBoundedDataGraph(raw);
  return migrateDecodedFullStateMetadata(decoded, options)
    ?? migrateDecodedLegacyMetadata(decoded, options);
}

/**
 * Splits a legacy captured PNG data URL from its URL-encoded JSON fragment and safely migrates the
 * metadata. The returned raster source never retains the fragment. Raster bytes are not decoded.
 */
export function parseStudioVrmLegacyFragment(
  src: string,
  options: StudioVrmLegacyMigrationOptions = {},
): StudioVrmLegacyFragmentMigration | null {
  if (typeof src !== "string") return null;
  const hashIndex = src.indexOf("#");
  if (hashIndex <= 0) return null;
  const rasterSrc = src.slice(0, hashIndex);
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/i.test(rasterSrc)) return null;
  const encodedFragment = src.slice(hashIndex + 1);
  if (!encodedFragment || utf8ByteLength(encodedFragment) > STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES * 3) {
    return null;
  }
  let json: string;
  try {
    json = decodeURIComponent(encodedFragment);
  } catch {
    return null;
  }
  if (utf8ByteLength(json) > STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES) return null;
  const migration = migrateStudioVrmLegacyMetadata(json, options);
  if (!migration) return null;
  return migration.status === "resolved"
    ? deepFreeze({ status: "resolved", rasterSrc, document: migration.document })
    : deepFreeze({
        status: "unresolved-model",
        rasterSrc,
        modelId: migration.modelId,
        modelName: migration.modelName,
      });
}
