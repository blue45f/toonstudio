/**
 * Studio BG3D 씬 문서의 현행 버전(v3/v4) 정규화·엄격 파싱·직렬화·기본 문서 생성 코어.
 */
import { StudioBg3dCameraHeightValidationError } from "./studio-bg3d-camera-orientation";
import { normalizeStudioBg3dSceneOptionalFields } from "./studio-bg3d-hierarchy";
import {
  STUDIO_BG3D_SCENE_DOCUMENT_KIND,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES,
  STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
  STUDIO_BG3D_SIX_PASS_SCENE_DOCUMENT_VERSION,
  StudioBg3dSceneDocumentBudgetError,
  failBudget,
} from "./studio-bg3d-scene-document-constants";
import { DEFAULT_STUDIO_BG3D_RAW_DOCUMENT } from "./studio-bg3d-scene-document-defaults";
import { normalizeAttachments, normalizeNodes, normalizeShots } from "./studio-bg3d-scene-document-graph";
import {
  decodeBoundedJson,
  deepFreeze,
  hasCompleteCurrentRootShape,
  hasOwn,
  isRecord,
  jsonStructuresEqual,
  normalizedId,
  utf8ByteLength,
} from "./studio-bg3d-scene-document-primitives";
import {
  normalizeBackground,
  normalizeBudgets,
  normalizeCamera,
  normalizeLighting,
  normalizeOutput,
  normalizeQuality,
  normalizeRender,
  withoutRedundantSuppressionFields,
} from "./studio-bg3d-scene-document-sections";
import { studioBg3dDocumentRequiresSixPassReader } from "./studio-bg3d-six-pass-settings";

import type {
  BudgetFailureMode,
  StudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document-types";

function canonicalDocumentByteLength(document: StudioBg3dSceneDocument): number {
  return utf8ByteLength(JSON.stringify(document));
}

export function normalizeDecodedCurrentDocument(
  value: unknown,
  rootMode: "lenient" | "strict" = "lenient",
  budgetFailureMode: BudgetFailureMode = "null",
): StudioBg3dSceneDocument | null {
  try {
    if (
      !isRecord(value) ||
      value.kind !== STUDIO_BG3D_SCENE_DOCUMENT_KIND ||
      (value.version !== STUDIO_BG3D_SCENE_DOCUMENT_VERSION && value.version !== STUDIO_BG3D_SIX_PASS_SCENE_DOCUMENT_VERSION) ||
      (rootMode === "strict" && !hasCompleteCurrentRootShape(value))
    ) {
      return null;
    }
    const budgets = normalizeBudgets(value.budgets);
    const attachments = normalizeAttachments(
      value.attachments,
      budgets.complexity.maxModelBytes,
    );
    const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
    const nodes = normalizeNodes(value.nodes, attachmentIds, budgets.complexity.maxNodes);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const includesShots = hasOwn(value, "shots");
    const shots = includesShots ? normalizeShots(value.shots, nodeIds) : undefined;
    const shotIds = new Set(shots?.map((shot) => shot.id) ?? []);
    const activeShotId = normalizedId(value.activeShotId);
    const optionalFields = normalizeStudioBg3dSceneOptionalFields(value, rootMode, parseStudioBg3dSceneDocument);
    if (!optionalFields) return null;
    const normalized: StudioBg3dSceneDocument = {
      kind: STUDIO_BG3D_SCENE_DOCUMENT_KIND,
      version: studioBg3dDocumentRequiresSixPassReader(value)
        ? STUDIO_BG3D_SIX_PASS_SCENE_DOCUMENT_VERSION
        : STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
      camera: normalizeCamera(value.camera),
      render: normalizeRender(value.render),
      background: normalizeBackground(value.background),
      lighting: normalizeLighting(value.lighting),
      quality: normalizeQuality(value.quality),
      output: normalizeOutput(value.output),
      budgets,
      attachments,
      nodes,
      ...(shots ? { shots } : {}),
      ...(activeShotId && shotIds.has(activeShotId) ? { activeShotId } : {}),
      ...optionalFields,
    };
    if (canonicalDocumentByteLength(normalized) > STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES) {
      failBudget("document-byte-budget-exceeded");
    }
    if (rootMode === "strict" && !jsonStructuresEqual(withoutRedundantSuppressionFields(value), normalized)) return null;
    return deepFreeze(normalized);
  } catch (cause) {
    if ((cause instanceof StudioBg3dCameraHeightValidationError || cause instanceof TypeError) && rootMode === "strict") return null;
    if (cause instanceof StudioBg3dSceneDocumentBudgetError && budgetFailureMode === "null") {
      return null;
    }
    throw cause;
  }
}

/** Returns a new, deeply frozen default document on every call. */
export function createDefaultStudioBg3dSceneDocument(): StudioBg3dSceneDocument {
  const document = normalizeDecodedCurrentDocument(DEFAULT_STUDIO_BG3D_RAW_DOCUMENT);
  if (!document) throw new Error("Invalid internal Studio BG3D document defaults.");
  return document;
}

export const DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT = createDefaultStudioBg3dSceneDocument();

/**
 * Leniently sanitizes a current-version object for interactive editing. Missing or mistyped root
 * sections receive defaults; invalid roots, unknown versions, cyclic values, and oversized inputs
 * reset to a fresh default. Persistence must use the strict parse/serialize APIs below.
 */
export function normalizeStudioBg3dSceneDocument(raw: unknown): StudioBg3dSceneDocument {
  const decoded = decodeBoundedJson(raw, "throw");
  return normalizeDecodedCurrentDocument(decoded, "lenient", "throw")
    ?? createDefaultStudioBg3dSceneDocument();
}

/**
 * Parses only canonical, complete current-version graphs. Any lossy normalization (including
 * unknown or missing nested fields, invalid/duplicate children, value clamping, and truncation),
 * oversized input, legacy payload, or unknown schema marker is rejected.
 */
export function parseStudioBg3dSceneDocument(raw: string): StudioBg3dSceneDocument | null {
  return normalizeDecodedCurrentDocument(decodeBoundedJson(raw), "strict");
}

/**
 * Canonical current-version JSON serialization. Only already-canonical current documents are
 * accepted; callers must use the lenient editor normalizer or explicit legacy migration before
 * reaching this persistence boundary. Every non-null result is UTF-8 bounded to 320 KiB.
 */
export function serializeStudioBg3dSceneDocument(raw: unknown): string | null {
  const document = normalizeDecodedCurrentDocument(decodeBoundedJson(raw), "strict");
  if (!document) return null;
  try {
    const serialized = JSON.stringify(document);
    return utf8ByteLength(serialized) <= STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES
      ? serialized
      : null;
  } catch {
    return null;
  }
}
