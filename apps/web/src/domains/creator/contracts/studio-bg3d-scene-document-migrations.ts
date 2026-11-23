/**
 * Studio BG3D 씬 문서의 구버전 스키마(v1·v2·panoramaUrl·비버전 레거시) 마이그레이션.
 */
import { containsStudioBg3dControlCharacter as containsControlCharacter } from "./studio-bg3d-hierarchy";
import {
  STUDIO_BG3D_LEGACY_SCENE_DOCUMENT_VERSION,
  STUDIO_BG3D_SCENE_DOCUMENT_KIND,
  STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
  STUDIO_BG3D_SCHEMA_V2_SCENE_DOCUMENT_VERSION,
} from "./studio-bg3d-scene-document-constants";
import { normalizeDecodedCurrentDocument } from "./studio-bg3d-scene-document-core";
import { DEFAULT_STUDIO_BG3D_RAW_DOCUMENT } from "./studio-bg3d-scene-document-defaults";
import {
  decodeBoundedJson,
  hasCompleteCurrentRootShape,
  hasCompleteRootShapeForVersion,
  hasOwn,
  isExplicitUnversionedLegacyRoot,
  isRecord,
  normalizedId,
  utf8ByteLength,
} from "./studio-bg3d-scene-document-primitives";

import type {
  StudioBg3dLegacyMigrationOptions,
  StudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document-types";

function legacyPrimitiveNode(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return {
    id: value.id,
    name: value.kind,
    kind: "primitive",
    primitiveKind: value.kind,
    color: value.color,
    parentId: null,
    transform: {
      position: value.position,
      rotation: value.rotation,
      scale: value.scale,
    },
    visible: true,
    locked: false,
    castsShadow: true,
    receivesShadow: true,
    // 레거시 런타임 형상에 페인트가 실려 오면 정규화 단계가 검증하므로 그대로 넘긴다.
    ...(isRecord(value.texturePaint) ? { texturePaint: value.texturePaint } : {}),
  };
}

function legacyModelNode(
  value: unknown,
  options: StudioBg3dLegacyMigrationOptions,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const storageKey = value.modelId;
  if (
    typeof storageKey !== "string" ||
    !storageKey ||
    containsControlCharacter(storageKey) ||
    utf8ByteLength(storageKey) > 512
  ) {
    return null;
  }
  let mappedAttachmentId: unknown;
  try {
    mappedAttachmentId = options.attachmentIdByLegacyStorageKey?.get(storageKey);
  } catch {
    return null;
  }
  const attachmentId = normalizedId(mappedAttachmentId);
  if (!attachmentId || attachmentId === storageKey) return null;
  return {
    id: value.id,
    name: "GLB 모델",
    kind: "model",
    attachmentId,
    transform: {
      position: value.position,
      rotation: value.rotation,
      scale: value.scale,
    },
    parentId: null,
    visible: true,
    locked: false,
    castsShadow: true,
    receivesShadow: true,
  };
}

function migrateDecodedLegacyDocument(
  value: unknown,
  options: StudioBg3dLegacyMigrationOptions,
): StudioBg3dSceneDocument | null {
  if (!isExplicitUnversionedLegacyRoot(value)) return null;
  const primitiveNodes = value.primitives.map(legacyPrimitiveNode).filter(isRecord);
  const modelNodes = Array.isArray(value.customModels)
    ? value.customModels.map((model) => legacyModelNode(model, options)).filter(isRecord)
    : [];
  return normalizeDecodedCurrentDocument({
    kind: STUDIO_BG3D_SCENE_DOCUMENT_KIND,
    version: STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
    camera: value.camera,
    render: value.render,
    background: isRecord(value.background)
      ? value.background
      : {
          mode: "sky-preset",
          skyPresetId: value.skyPresetId,
          color: value.backgroundColor,
        },
    lighting: value.lighting,
    quality: value.quality,
    output: isRecord(value.output)
      ? value.output
      : {
          transparentBackground: value.transparentInsert,
          line: { enabled: true },
        },
    budgets: value.budgets,
    attachments: value.attachments,
    nodes: [...primitiveNodes, ...modelNodes],
  });
}

/**
 * Early scene documents briefly persisted an optional `background.panoramaUrl`. The URL is no longer part of
 * the persistence contract, but rejecting the whole marked document would also discard its camera,
 * nodes, attachments, and LT settings. Migrate only that exact historical shape: remove the URL,
 * then require every remaining field to pass the current strict schema boundary without any other
 * lossy rewrite. This is intentionally separate from the unversioned legacy payload migration.
 */
const SCHEMA_V2_ONLY_COMPLEXITY_BUDGET_KEYS = Object.freeze([
  "maxAnimations",
  "maxAnimationChannels",
  "maxAnimationKeyframes",
  "maxAnimationValues",
  "maxSkins",
  "maxJoints",
  "maxMorphTargets",
  "maxAccessorElements",
  "maxDecodedGeometryBytes",
] as const);

/**
 * Schema v1 predates animation, rigging, morph, and decoded-accessor budgets. Add those defaults
 * before the strict current-version equality check, while rejecting payloads that claim v2-only fields under a
 * v1 version marker. Unknown or missing historical fields are still rejected by strict normalize.
 */
function migrateSchemaV1Budgets(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || !isRecord(value.complexity)) return null;
  const complexity = value.complexity;
  if (SCHEMA_V2_ONLY_COMPLEXITY_BUDGET_KEYS.some((key) => hasOwn(complexity, key))) {
    return null;
  }
  return {
    ...value,
    complexity: {
      ...complexity,
      maxAnimations: DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxAnimations,
      maxAnimationChannels: DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxAnimationChannels,
      maxAnimationKeyframes: DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxAnimationKeyframes,
      maxAnimationValues: DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxAnimationValues,
      maxSkins: DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxSkins,
      maxJoints: DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxJoints,
      maxMorphTargets: DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxMorphTargets,
      maxAccessorElements: DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxAccessorElements,
      maxDecodedGeometryBytes: DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxDecodedGeometryBytes,
    },
  };
}

/**
 * Schema v3 adds analytic two-bone IK to every persisted constraint layer. Preserve canonical v2
 * aim-only layers by adding the explicit empty collection, while rejecting documents that claim
 * the v3-only field under a v2 marker.
 */
function migrateSchemaV2Nodes(value: readonly unknown[]): readonly unknown[] | null {
  const nodes: unknown[] = [];
  for (const node of value) {
    if (isRecord(node) && (hasOwn(node, "tags") || hasOwn(node, "componentRef") || hasOwn(node, "surface"))) return null;
    if (!isRecord(node) || node.kind !== "model" || !hasOwn(node, "constraints")) {
      nodes.push(node);
      continue;
    }
    if (!isRecord(node.constraints) || hasOwn(node.constraints, "twoBoneIks")) return null;
    nodes.push({
      ...node,
      constraints: {
        ...node.constraints,
        twoBoneIks: [],
      },
    });
  }
  return nodes;
}

function migrateDecodedSchemaV2Document(value: unknown): StudioBg3dSceneDocument | null {
  if (
    !hasCompleteRootShapeForVersion(value, STUDIO_BG3D_SCHEMA_V2_SCENE_DOCUMENT_VERSION) ||
    (isRecord(value.camera) && (
      hasOwn(value.camera, "nearClip") ||
      hasOwn(value.camera, "up") || hasOwn(value.camera, "orthographicHeight")
    )) ||
    hasOwn(value, "shots") ||
    hasOwn(value, "activeShotId") ||
    hasOwn(value, "meta") || hasOwn(value, "sceneRecipe") || hasOwn(value, "measurements")
  ) {
    return null;
  }
  const nodes = migrateSchemaV2Nodes(value.nodes);
  if (!nodes) return null;
  return normalizeDecodedCurrentDocument({
    ...value,
    version: STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
    nodes,
  }, "strict");
}

function migrateDecodedSchemaV1Document(value: unknown): StudioBg3dSceneDocument | null {
  if (
    !hasCompleteRootShapeForVersion(value, STUDIO_BG3D_LEGACY_SCENE_DOCUMENT_VERSION) ||
    (isRecord(value.camera) && (
      hasOwn(value.camera, "nearClip") ||
      hasOwn(value.camera, "up") || hasOwn(value.camera, "orthographicHeight")
    )) ||
    hasOwn(value, "shots") ||
    hasOwn(value, "activeShotId") ||
    hasOwn(value, "meta") || hasOwn(value, "sceneRecipe") || hasOwn(value, "measurements")
  ) {
    return null;
  }
  if (
    value.nodes.some((node) =>
      isRecord(node) && (
        hasOwn(node, "materialOverride") || hasOwn(node, "texturePaint") || hasOwn(node, "modelTexturePaint")
        || hasOwn(node, "animation") || hasOwn(node, "pose") || hasOwn(node, "morph") || hasOwn(node, "constraints")
        || hasOwn(node, "tags") || hasOwn(node, "componentRef") || hasOwn(node, "surface")
      ))
  ) return null;
  const budgets = migrateSchemaV1Budgets(value.budgets);
  if (!budgets) return null;
  return normalizeDecodedCurrentDocument({
    ...value,
    version: STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
    budgets,
  }, "strict");
}

function migrateDecodedSchemaPanoramaDocument(
  value: unknown,
): StudioBg3dSceneDocument | null {
  if (
    !isRecord(value) ||
    !(
      hasCompleteCurrentRootShape(value)
      || hasCompleteRootShapeForVersion(value, STUDIO_BG3D_SCHEMA_V2_SCENE_DOCUMENT_VERSION)
      || hasCompleteRootShapeForVersion(value, STUDIO_BG3D_LEGACY_SCENE_DOCUMENT_VERSION)
    ) ||
    !isRecord(value.background) ||
    !hasOwn(value.background, "panoramaUrl") || hasOwn(value, "measurements") ||
    typeof value.background.panoramaUrl !== "string"
  ) {
    return null;
  }
  if (
    value.version === STUDIO_BG3D_LEGACY_SCENE_DOCUMENT_VERSION
    && value.nodes.some((node) =>
      isRecord(node) && (
        hasOwn(node, "materialOverride") || hasOwn(node, "texturePaint") || hasOwn(node, "modelTexturePaint")
        || hasOwn(node, "animation") || hasOwn(node, "pose") || hasOwn(node, "morph") || hasOwn(node, "constraints")
        || hasOwn(node, "tags") || hasOwn(node, "componentRef") || hasOwn(node, "surface")
      ))
  ) {
    return null;
  }
  if (
    value.version !== STUDIO_BG3D_SCENE_DOCUMENT_VERSION &&
    isRecord(value.camera) &&
    (hasOwn(value.camera, "nearClip") || hasOwn(value.camera, "up") || hasOwn(value.camera, "orthographicHeight"))
  ) {
    return null;
  }
  if (
    value.version !== STUDIO_BG3D_SCENE_DOCUMENT_VERSION &&
    (hasOwn(value, "shots") || hasOwn(value, "activeShotId") || hasOwn(value, "meta") || hasOwn(value, "sceneRecipe"))
  ) {
    return null;
  }
  const budgets = value.version === STUDIO_BG3D_LEGACY_SCENE_DOCUMENT_VERSION
    ? migrateSchemaV1Budgets(value.budgets)
    : value.budgets;
  if (!budgets) return null;
  const nodes = value.version === STUDIO_BG3D_SCHEMA_V2_SCENE_DOCUMENT_VERSION
    ? migrateSchemaV2Nodes(value.nodes)
    : value.nodes;
  if (!nodes) return null;
  const { panoramaUrl: _discardedPanoramaUrl, ...background } = value.background;
  return normalizeDecodedCurrentDocument({
    ...value,
    version: STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
    background,
    budgets,
    nodes,
  }, "strict");
}

/**
 * Accepts the current document or the actual legacy `{tool:"bg3d", primitives, customModels}` hash
 * payload. Any legacy `modelId` is an IndexedDB key, never an attachment id. A model placement
 * survives only when `attachmentIdByLegacyStorageKey` explicitly maps that key to a different,
 * valid logical id backed by canonical GLB metadata; otherwise it is intentionally dropped.
 * Documents with any unsupported/current `kind` or any `version` marker never enter legacy logic.
 */
export function migrateStudioBg3dSceneDocument(
  raw: unknown,
  options: StudioBg3dLegacyMigrationOptions = {},
): StudioBg3dSceneDocument | null {
  let rawHasSchemaMarker: boolean;
  try {
    rawHasSchemaMarker =
      isRecord(raw) && (hasOwn(raw, "kind") || hasOwn(raw, "version"));
  } catch {
    return null;
  }
  const decoded = decodeBoundedJson(raw);
  const current = normalizeDecodedCurrentDocument(decoded, "strict");
  if (current) return current;
  const schemaV1Panorama = migrateDecodedSchemaPanoramaDocument(decoded);
  if (schemaV1Panorama) return schemaV1Panorama;
  const schemaV2 = migrateDecodedSchemaV2Document(decoded);
  if (schemaV2) return schemaV2;
  const schemaV1 = migrateDecodedSchemaV1Document(decoded);
  if (schemaV1) return schemaV1;
  if (
    rawHasSchemaMarker ||
    (isRecord(decoded) && (hasOwn(decoded, "kind") || hasOwn(decoded, "version")))
  ) {
    return null;
  }
  return migrateDecodedLegacyDocument(decoded, options);
}
