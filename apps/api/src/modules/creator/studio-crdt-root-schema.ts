import * as Y from "yjs";

import {
  STUDIO_BRUSH_ENGINE_PROGRAM_STROKE_VERSION,
  hasValidStudioBrushEngineProgramExtension,
} from "@toonstudio/contracts/studio-brush-material-program-contract";
import { readStudioCrdtRasterDocument } from "@toonstudio/contracts/studio-crdt-raster-document-contract";
import {
  STUDIO_INK_INPUT_V2_MAX_CONTACT_DIMENSION,
  STUDIO_INK_INPUT_V2_MAX_TIME_OFFSET_MS,
  isStudioInkInputContractV2,
  normalizeStudioInkInputContract,
} from "@toonstudio/contracts/studio-ink-input-contract";
import {
  STUDIO_LEGACY_PIGMENT_ARCHIVE_STROKE_VERSION,
  hasValidStudioLegacyPigmentArchiveStroke,
} from "@toonstudio/contracts/studio-legacy-pigment-archive";
import { parseStudioLinked3dCorrectionProvenance } from "@toonstudio/contracts/studio-linked-3d-correction";
import {
  hasValidStudioBundleSceneCredit,
  studioWorkAssetReferenceKey,
} from "@toonstudio/contracts/studio-work-asset-contract";

import { hasValidStudioCrdtBg3dBundleRoots } from "./studio-crdt-bg3d-shape";
import { isBoundedStudioCrdtId } from "./studio-crdt-identifiers";
import { hasValidStudioPsdElementMetadata } from "./studio-crdt-psd-metadata";
import {
  STUDIO_CRDT_LAYER_GROUP_KEYS,
  STUDIO_CRDT_PAGE_KEYS,
  canonicalReservedLayerGroupKey,
  isValidStudioCrdtDrawingAssist,
  isValidStudioCrdtLayerComps,
  isValidStudioCrdtPaperSurface,
  parseStudioCrdtLayerGroupKey,
  type StudioCrdtLayerGroupIdentity,
} from "./studio-crdt-root-schema-page-metadata";
import {
  STUDIO_CRDT_ACTIVE_ORDER_ENTRY_MAX_COUNT,
  STUDIO_CRDT_COLLECTION_MAX_ENTRIES,
  STUDIO_CRDT_DELETION_ACKS_ROOT,
  STUDIO_CRDT_DELETION_OPS_ROOT,
  STUDIO_CRDT_DELETION_TARGET_MAX_LENGTH,
  STUDIO_CRDT_JSON_MAX_STRING_LENGTH,
  STUDIO_CRDT_LAYER_GROUP_INDEX_ROOT,
  STUDIO_CRDT_LAYER_GROUP_MAX_ENTRIES,
  STUDIO_CRDT_LAYER_GROUP_PAYLOAD_MAX_BYTES,
  STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX,
  STUDIO_CRDT_MAX_COORDINATE,
  STUDIO_CRDT_PAGE_INDEX_ROOT,
  STUDIO_CRDT_PAGE_ORDER_ROOT,
  STUDIO_CRDT_PAGE_PAYLOAD_MAX_BYTES,
  STUDIO_CRDT_PAGE_ROOT_PREFIX,
  STUDIO_CRDT_SCENE_INDEX_ROOT,
  STUDIO_CRDT_SCENE_PAYLOAD_MAX_BYTES,
  STUDIO_CRDT_SCENE_ROOT_PREFIX,
  STUDIO_CRDT_UUID_PATTERN,
  boundedExactText,
  boundedString,
  canonicalReservedRootId,
  encodedJsonByteLength,
  finiteNumberInRange,
  hasOnlyKeys,
  isBoundedJsonValue,
  materializeExistingArrayRoot,
  materializeExistingMapRoot,
  readReservedProperties,
} from "./studio-crdt-root-schema-primitives";
import {
  STUDIO_CRDT_REQUIRED_SCENE_KEYS,
  STUDIO_CRDT_SCENE_KEYS_BY_TYPE,
  STUDIO_WORK_ASSET_TYPE_SET,
  hasTopologyStudioCrdtReferenceProps,
  hasValidStudioFilterMaskSurfaceReferences,
  hasValidStudioWorkAssetReferenceProps,
  isStudioCrdtSceneType,
  isValidLegacyStudioCrdtReferenceType,
  isValidStudioWorkAssetReferenceCandidate,
} from "./studio-crdt-root-schema-scene-work-asset";
import {
  validateStudioCrdtShared3dStageRoots,
} from "./studio-crdt-root-schema-shared-3d-roots";
import {
  STUDIO_CRDT_LAYERED_FLOW_STROKE_PAYLOAD_VERSION,
  STUDIO_CRDT_LEGACY_STROKE_PAYLOAD_VERSION,
  STUDIO_CRDT_MATERIAL_PRESSURE_MODEL,
  STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION,
  STUDIO_CRDT_SEGMENTED_CAUSAL_DEPOSIT_PIPELINES,
  STUDIO_CRDT_STROKE_BASE_SAMPLE_KEYS,
  STUDIO_CRDT_STROKE_EXTENDED_INK_SAMPLE_KEYS,
  STUDIO_CRDT_STROKE_JSON_KEYS,
  STUDIO_CRDT_STROKE_METADATA_MAX_BYTES,
  STUDIO_CRDT_STROKE_OPTIONAL_STRING_KEYS,
  STUDIO_CRDT_STROKE_OPTIONAL_STRING_LIMITS,
  STUDIO_CRDT_STROKE_RECORD_KEYS,
  STUDIO_CRDT_STROKE_SAMPLE_KEYS,
  STUDIO_CRDT_STROKE_SAMPLE_MAX_COUNT,
  STUDIO_CRDT_STROKE_WIDTH_MAX,
  STUDIO_CRDT_TAPER_SPACING_STROKE_PAYLOAD_VERSION,
  hasValidStudioCrdtStrokePaintContract,
  rendererSignificantR8GrainAdmission,
  strokePayloadSupportsContinuation,
} from "./studio-crdt-root-schema-stroke-paint";

import type { StudioWorkAssetReference } from "@toonstudio/contracts/studio-work-asset-contract";

export { isBoundedStudioCrdtId } from "./studio-crdt-identifiers";

export { snapshotStudioCrdtDeletionRoots, preservesStudioCrdtDeletionRoots } from "./studio-crdt-deletion-roots";
export type { StudioCrdtDeletionRootSnapshot } from "./studio-crdt-deletion-roots";

export { STUDIO_CRDT_UUID_PATTERN } from "./studio-crdt-root-schema-primitives";

export {
  STUDIO_CRDT_SHARED_3D_STAGE_RECORDS_ROOT,
  STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPTS_ROOT,
  STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX,
  STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPT_ROOT_PREFIX,
  encodeStudioCrdtShared3dCompositeKey,
} from "./studio-crdt-root-schema-shared-3d-entry";

export {
  admitsStudioCrdtShared3dStageEvents,
  preservesStudioCrdtShared3dStageRoots,
  snapshotStudioCrdtShared3dStageRoots,
  type StudioCrdtShared3dRootSnapshot,
} from "./studio-crdt-root-schema-shared-3d-roots";

export {
  hasValidStudioCrdtStrokePaintContract,
  type StudioCrdtStrokePaintContractInput,
} from "./studio-crdt-root-schema-stroke-paint";

type StudioCrdtDeletionTarget =
  | { kind: "stroke"; id: string }
  | { kind: "scene"; id: string }
  | { kind: "page"; id: string }
  | { kind: "group"; pageId: string; id: string };

export interface StudioCrdtWorkAssetReferenceSnapshot {
  identities: ReadonlyMap<string, string>;
  admittedReferences: ReadonlyMap<string, StudioWorkAssetReference>;
  activeCount: number;
}

export { snapshotStudioCrdtR8GrainReferences, type StudioCrdtR8GrainReferenceSnapshot } from "./studio-crdt-r8-reference-snapshot";

/** Returns every materialized identity plus the non-tombstoned count in a valid document. */
export function snapshotStudioWorkAssetReferences(
  doc: Y.Doc
): StudioCrdtWorkAssetReferenceSnapshot {
  const identities = new Map<string, string>();
  const admittedReferences = new Map<string, StudioWorkAssetReference>();
  const index = materializeExistingMapRoot(doc, STUDIO_CRDT_SCENE_INDEX_ROOT);
  if (!(index instanceof Y.Map)) return { identities, admittedReferences, activeCount: 0 };
  let activeCount = 0;
  const metadataKeys = new Set(["id", "pageId", "layerId", "payloadVersion", "type", "deleted"]);
  for (const [id, tracked] of index) {
    if (tracked !== true) continue;
    const record = materializeExistingMapRoot(
      doc,
      `${STUDIO_CRDT_SCENE_ROOT_PREFIX}${encodeURIComponent(id)}`
    );
    if (
      !(record instanceof Y.Map) ||
      record.get("type") !== "reference"
    ) continue;
    const props = readReservedProperties(
      record,
      STUDIO_CRDT_SCENE_KEYS_BY_TYPE.reference,
      metadataKeys
    );
    if (!props) continue;
    const elementType = props.elementType;
    if (!isValidLegacyStudioCrdtReferenceType(elementType)) continue;
    identities.set(id, elementType);
    if (
      hasTopologyStudioCrdtReferenceProps(props) || props.bg3dLtBundleReference !== undefined ||
      !STUDIO_WORK_ASSET_TYPE_SET.has(elementType)
    ) continue;
    const reference = {
      assetId: id,
      elementType: elementType as StudioWorkAssetReference["elementType"],
    };
    admittedReferences.set(studioWorkAssetReferenceKey(reference), reference);
    if (record.get("deleted") !== true) activeCount += 1;
  }
  return { identities, admittedReferences, activeCount };
}

function encodeStudioCrdtDeletionTarget(target: StudioCrdtDeletionTarget): string {
  return target.kind === "group"
    ? JSON.stringify([target.kind, target.pageId, target.id])
    : JSON.stringify([target.kind, target.id]);
}

function parseStudioCrdtDeletionTarget(value: unknown): StudioCrdtDeletionTarget | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > STUDIO_CRDT_DELETION_TARGET_MAX_LENGTH
  ) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    if (
      parsed.length === 2 &&
      (parsed[0] === "stroke" || parsed[0] === "scene" || parsed[0] === "page") &&
      isBoundedStudioCrdtId(parsed[1])
    ) {
      const target = { kind: parsed[0], id: parsed[1] } satisfies StudioCrdtDeletionTarget;
      return encodeStudioCrdtDeletionTarget(target) === value ? target : null;
    }
    if (
      parsed.length === 3 &&
      parsed[0] === "group" &&
      isBoundedStudioCrdtId(parsed[1]) &&
      isBoundedStudioCrdtId(parsed[2]) &&
      parsed[2] !== "page-root"
    ) {
      const target = {
        kind: "group",
        pageId: parsed[1],
        id: parsed[2],
      } satisfies StudioCrdtDeletionTarget;
      return encodeStudioCrdtDeletionTarget(target) === value ? target : null;
    }
  } catch {
    return null;
  }
  return null;
}

function studioCrdtDeletionTargetExists(doc: Y.Doc, target: StudioCrdtDeletionTarget): boolean {
  if (target.kind === "stroke") {
    const strokes = materializeExistingMapRoot(doc, "strokes");
    return strokes instanceof Y.Map && strokes.get(target.id) instanceof Y.Map;
  }
  if (target.kind === "scene") {
    const index = materializeExistingMapRoot(doc, STUDIO_CRDT_SCENE_INDEX_ROOT);
    const record = materializeExistingMapRoot(
      doc,
      `${STUDIO_CRDT_SCENE_ROOT_PREFIX}${encodeURIComponent(target.id)}`
    );
    return index instanceof Y.Map && index.get(target.id) === true && record instanceof Y.Map;
  }
  if (target.kind === "page") {
    const index = materializeExistingMapRoot(doc, STUDIO_CRDT_PAGE_INDEX_ROOT);
    const record = materializeExistingMapRoot(
      doc,
      `${STUDIO_CRDT_PAGE_ROOT_PREFIX}${encodeURIComponent(target.id)}`
    );
    return index instanceof Y.Map && index.get(target.id) === true && record instanceof Y.Map;
  }
  const key = `${target.pageId.length}:${target.pageId}${target.id.length}:${target.id}`;
  const index = materializeExistingMapRoot(doc, STUDIO_CRDT_LAYER_GROUP_INDEX_ROOT);
  const record = materializeExistingMapRoot(
    doc,
    `${STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX}${encodeURIComponent(key)}`
  );
  return index instanceof Y.Map && index.get(key) === true && record instanceof Y.Map;
}

function validateStudioCrdtDeletionRoots(doc: Y.Doc): boolean {
  const operations = materializeExistingMapRoot(doc, STUDIO_CRDT_DELETION_OPS_ROOT);
  const acknowledgements = materializeExistingMapRoot(doc, STUDIO_CRDT_DELETION_ACKS_ROOT);
  if (
    operations === null ||
    acknowledgements === null ||
    (operations?.size ?? 0) > STUDIO_CRDT_COLLECTION_MAX_ENTRIES ||
    (acknowledgements?.size ?? 0) > STUDIO_CRDT_COLLECTION_MAX_ENTRIES
  ) return false;
  if (operations) {
    for (const [operationId, encodedTarget] of operations) {
      const target = parseStudioCrdtDeletionTarget(encodedTarget);
      if (!STUDIO_CRDT_UUID_PATTERN.test(operationId) || !target || !studioCrdtDeletionTargetExists(doc, target)) {
        return false;
      }
    }
  }
  if (acknowledgements) {
    for (const [operationId, encodedTarget] of acknowledgements) {
      if (
        !STUDIO_CRDT_UUID_PATTERN.test(operationId) ||
        !parseStudioCrdtDeletionTarget(encodedTarget) ||
        !operations ||
        operations.get(operationId) !== encodedTarget
      ) return false;
    }
  }
  return true;
}

function validateSceneElementRoot(id: string, record: Y.Map<unknown>): boolean {
  const metadataKeys = new Set(["id", "pageId", "layerId", "payloadVersion", "type", "deleted"]);
  const type = record.get("type");
  if (
    record.get("id") !== id ||
    !isBoundedStudioCrdtId(record.get("pageId")) ||
    !isBoundedStudioCrdtId(record.get("layerId")) ||
    record.get("payloadVersion") !== 1 ||
    !isStudioCrdtSceneType(type) ||
    (record.has("deleted") && typeof record.get("deleted") !== "boolean")
  ) {
    return false;
  }
  const props = readReservedProperties(record, STUDIO_CRDT_SCENE_KEYS_BY_TYPE[type], metadataKeys);
  if (!props || !hasValidStudioBundleSceneCredit(type, props, record)) return false;
  for (const key of STUDIO_CRDT_REQUIRED_SCENE_KEYS[type]) {
    if (!(key in props)) return false;
  }
  if (
    type === "reference" &&
    !hasValidStudioWorkAssetReferenceProps(id, props)
  ) return false;
  if (type === "reference") {
    // Validate losing baseline/override candidates too. Otherwise a valid effective `prop:` value
    // could hide an invalid `base:` candidate which becomes active after a later unset operation.
    for (const [key, value] of record) {
      const prefix = key.startsWith("base:")
        ? "base:"
        : key.startsWith("prop:")
          ? "prop:"
          : null;
      if (!prefix) continue;
      const property = key.slice(prefix.length);
      if (!isValidStudioWorkAssetReferenceCandidate(property, value)) return false;
    }
  }
  for (const key of ["x", "y"]) {
    if (key in props && !finiteNumberInRange(props[key], -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE)) {
      return false;
    }
  }
  for (const key of ["width", "height", "fontSize", "strokeWidth"]) {
    if (key in props && !finiteNumberInRange(props[key], 0, STUDIO_CRDT_MAX_COORDINATE)) return false;
  }
  for (const key of [
    "letterSpacing",
    "lineHeight",
    "shadowBlur",
    "shadowOffsetX",
    "shadowOffsetY",
    "shadowOpacity",
    "skewX",
    "skewY",
    "tailXRatio",
    "tailHeight",
    "tailBase",
    "tailBend",
    "autoShrinkMinFontSize",
    "starAmplitude",
    "lineCount",
    "innerRadius",
    "outerRadius",
    "noise",
    "centerXRatio",
    "centerYRatio",
  ]) {
    if (
      key in props &&
      !finiteNumberInRange(
        props[key],
        -STUDIO_CRDT_MAX_COORDINATE,
        STUDIO_CRDT_MAX_COORDINATE
      )
    ) return false;
  }
  if ("rotation" in props && !finiteNumberInRange(props.rotation, -1_000_000, 1_000_000)) return false;
  if ("opacity" in props && !finiteNumberInRange(props.opacity, 0, 1)) return false;
  for (const key of [
    "hidden",
    "locked",
    "noClip",
    "lockAspect",
    "clipBelow",
    "alphaLocked",
    "maskEnabled",
    "vertical",
    "autoShrinkText",
  ]) {
    if (key in props && typeof props[key] !== "boolean") return false;
  }
  if (!hasValidStudioPsdElementMetadata(props, boundedExactText, boundedString)) return false;
  if ("text" in props && !boundedString(props.text, STUDIO_CRDT_JSON_MAX_STRING_LENGTH)) return false;
  if ("stickyNotePresetId" in props && !boundedExactText(props.stickyNotePresetId, 160)) {
    return false;
  }
  for (const key of [
    "fill", "textFill", "stroke", "variant", "direction", "stickyNoteFill",
  ]) {
    if (key in props && !boundedString(props[key], 512)) return false;
  }
  const enumValues: Readonly<Record<string, readonly string[]>> = {
    align: ["left", "center", "right"],
    fontStyle: ["normal", "bold", "italic", "bold italic"],
    fillType: ["solid", "gradient"],
    gradientDirection: ["vertical", "horizontal"],
    tail: ["left", "right", "none"],
    tailDirection: ["bottom", "top", "left", "right"],
    dashStyle: ["solid", "dashed"],
    direction: ["horizontal", "vertical"],
  };
  for (const [key, values] of Object.entries(enumValues)) {
    if (key in props && !values.includes(props[key] as string)) return false;
  }
  if (
    "lineCount" in props &&
    (!Number.isInteger(props.lineCount) || (props.lineCount as number) < 1)
  ) return false;
  for (const key of ["points", "customShapePoints"] as const) {
    if (!(key in props)) continue;
    const values = props[key];
    if (
      !Array.isArray(values) ||
      values.length % 2 !== 0 ||
      (key === "points" ? values.length !== 8 : values.length < 6) ||
      values.some(
        (value) =>
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          Math.abs(value) > STUDIO_CRDT_MAX_COORDINATE
      )
    ) return false;
  }
  const byteLength = encodedJsonByteLength({ version: 1, type, props });
  return byteLength !== null && byteLength <= STUDIO_CRDT_SCENE_PAYLOAD_MAX_BYTES;
}

function validatePageRoot(id: string, record: Y.Map<unknown>): boolean {
  const metadataKeys = new Set(["id", "payloadVersion", "deleted"]);
  if (
    record.get("id") !== id ||
    record.get("payloadVersion") !== 1 ||
    (record.has("deleted") && typeof record.get("deleted") !== "boolean")
  ) {
    return false;
  }
  const props = readReservedProperties(record, STUDIO_CRDT_PAGE_KEYS, metadataKeys);
  if (!props || !boundedString(props.bg, 512)) return false;
  if (!finiteNumberInRange(props.canvasH, 1, STUDIO_CRDT_MAX_COORDINATE)) return false;
  if (
    props.bgGrad !== null &&
    (!Array.isArray(props.bgGrad) ||
      props.bgGrad.length > 32 ||
      props.bgGrad.some((color) => !boundedString(color, 512)))
  ) {
    return false;
  }
  for (const key of ["name", "note", "shotType", "cameraAngle"]) {
    if (key in props && !boundedString(props[key], key === "note" ? 8_192 : 512)) return false;
  }
  if ("hideMaster" in props && typeof props.hideMaster !== "boolean") return false;
  if ("paperGrainVisible" in props && typeof props.paperGrainVisible !== "boolean") return false;
  if ("paperSurface" in props && !isValidStudioCrdtPaperSurface(props.paperSurface)) return false;
  if ("layerComps" in props && !isValidStudioCrdtLayerComps(props.layerComps)) return false;
  if ("drawingAssist" in props && !isValidStudioCrdtDrawingAssist(props.drawingAssist)) {
    return false;
  }
  // A valid `prop:` winner can hide an invalid `base:` candidate until a later unset. Validate
  // both candidates now so every future effective page payload remains safe to materialize.
  for (const [key, value] of record) {
    if (
      (key === "base:layerComps" || key === "prop:layerComps") &&
      !isValidStudioCrdtLayerComps(value)
    ) {
      return false;
    }
    if (
      (key === "base:drawingAssist" || key === "prop:drawingAssist") &&
      !isValidStudioCrdtDrawingAssist(value)
    ) {
      return false;
    }
    if (
      (key === "base:paperSurface" || key === "prop:paperSurface") &&
      !isValidStudioCrdtPaperSurface(value)
    ) {
      return false;
    }
    if (
      (key === "base:paperGrainVisible" || key === "prop:paperGrainVisible") &&
      typeof value !== "boolean"
    ) {
      return false;
    }
  }
  const byteLength = encodedJsonByteLength({ version: 1, props });
  return byteLength !== null && byteLength <= STUDIO_CRDT_PAGE_PAYLOAD_MAX_BYTES;
}

function validateLayerGroupRoot(
  identity: StudioCrdtLayerGroupIdentity,
  record: Y.Map<unknown>
): boolean {
  const metadataKeys = new Set(["id", "pageId", "payloadVersion", "deleted"]);
  if (
    record.get("id") !== identity.groupId ||
    record.get("pageId") !== identity.pageId ||
    record.get("payloadVersion") !== 1 ||
    (record.has("deleted") && typeof record.get("deleted") !== "boolean") ||
    record.get("unset:name") === true
  ) {
    return false;
  }
  for (const [key, value] of record) {
    if (metadataKeys.has(key) || key.startsWith("unset:")) continue;
    const separator = key.indexOf(":");
    const property = separator >= 0 ? key.slice(separator + 1) : "";
    if (property === "name") {
      if (!boundedExactText(value, 512)) return false;
    } else if ((property === "hidden" || property === "locked") && typeof value !== "boolean") {
      return false;
    }
  }
  const props = readReservedProperties(record, STUDIO_CRDT_LAYER_GROUP_KEYS, metadataKeys);
  if (!props || !boundedExactText(props.name, 512)) return false;
  for (const key of ["hidden", "locked"] as const) {
    if (key in props && typeof props[key] !== "boolean") return false;
  }
  const byteLength = encodedJsonByteLength({ version: 1, props });
  return byteLength !== null && byteLength <= STUDIO_CRDT_LAYER_GROUP_PAYLOAD_MAX_BYTES;
}

function validateTrackedLayerGroupRoots(doc: Y.Doc): boolean {
  const root = materializeExistingMapRoot(doc, STUDIO_CRDT_LAYER_GROUP_INDEX_ROOT);
  const trackedKeys = new Set<string>();
  if (root !== undefined) {
    if (root === null || root.size > STUDIO_CRDT_LAYER_GROUP_MAX_ENTRIES) return false;
    for (const [key, active] of root) {
      const identity = parseStudioCrdtLayerGroupKey(key);
      if (!identity || active !== true) return false;
      const record = materializeExistingMapRoot(
        doc,
        `${STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX}${encodeURIComponent(key)}`
      );
      if (!record || !validateLayerGroupRoot(identity, record)) return false;
      trackedKeys.add(key);
    }
  }
  let dynamicRootCount = 0;
  for (const [rootName, value] of doc.share) {
    if (!rootName.startsWith(STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX)) continue;
    dynamicRootCount += 1;
    if (dynamicRootCount > STUDIO_CRDT_LAYER_GROUP_MAX_ENTRIES) return false;
    const identity = canonicalReservedLayerGroupKey(rootName);
    if (
      !identity ||
      !trackedKeys.has(identity.key) ||
      !(value instanceof Y.Map) ||
      !validateLayerGroupRoot(identity, value)
    ) {
      return false;
    }
  }
  return true;
}

function validateStrokeRoot(id: string, record: Y.Map<unknown>): boolean {
  const strokeWidth = record.get("strokeWidth");
  const payloadVersion = record.get("payloadVersion");
  const rawExtensions = record.get("extensions");
  const archive = payloadVersion === STUDIO_LEGACY_PIGMENT_ARCHIVE_STROKE_VERSION && rawExtensions !== null && typeof rawExtensions === "object" && Object.hasOwn(rawExtensions, "legacyPigmentArchive");
  if (
    !hasOnlyKeys(record, STUDIO_CRDT_STROKE_RECORD_KEYS) ||
    record.get("id") !== id ||
    !isBoundedStudioCrdtId(record.get("pageId")) ||
    !isBoundedStudioCrdtId(record.get("layerId")) ||
    (record.get("status") !== "drawing" && record.get("status") !== "finalized") ||
    (record.has("deleted") && typeof record.get("deleted") !== "boolean") ||
    (payloadVersion !== STUDIO_CRDT_LEGACY_STROKE_PAYLOAD_VERSION &&
      payloadVersion !== STUDIO_CRDT_LAYERED_FLOW_STROKE_PAYLOAD_VERSION &&
      payloadVersion !== STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION &&
      !strokePayloadSupportsContinuation(payloadVersion)) ||
    record.get("type") !== "draw" ||
    (!(archive && !record.has("mode")) && record.get("mode") !== "pen" && record.get("mode") !== "eraser") ||
    (!(archive && !record.has("kind")) && !boundedExactText(record.get("kind"), 80)) ||
    !boundedExactText(record.get("stroke"), 256) ||
    !finiteNumberInRange(strokeWidth, 0.01, STUDIO_CRDT_STROKE_WIDTH_MAX)
  ) {
    return false;
  }
  const opacity = record.get("opacity");
  if (record.has("opacity") && !finiteNumberInRange(opacity, 0, 1)) return false;
  const sampleSpacing = record.get("sampleSpacing");
  if (
    record.has("sampleSpacing") &&
    !finiteNumberInRange(sampleSpacing, 0, STUDIO_CRDT_STROKE_WIDTH_MAX)
  ) return false;
  for (const key of STUDIO_CRDT_STROKE_OPTIONAL_STRING_KEYS) {
    const value = record.get(key);
    if (
      record.has(key)
      && (
        !boundedExactText(value, STUDIO_CRDT_STROKE_OPTIONAL_STRING_LIMITS[key])
        || ((key === "brushCatalogId" || key === "brushCatalogName") && value.trim() !== value)
      )
    ) return false;
  }
  for (const key of STUDIO_CRDT_STROKE_JSON_KEYS) {
    const value = record.get(key);
    if (
      record.has(key) &&
      (value === null || typeof value !== "object" || Array.isArray(value) ||
        !isBoundedJsonValue(value))
    ) return false;
  }
  const extensionsValue = record.get("extensions");
  const extensions = extensionsValue !== null && typeof extensionsValue === "object"
    && !Array.isArray(extensionsValue)
    ? extensionsValue as Record<string, unknown>
    : undefined;
  if (extensions && Object.hasOwn(extensions, "frameClipId") && !isBoundedStudioCrdtId(extensions.frameClipId)) return false;
  const brushDynamicsValue = record.get("brushDynamics");
  const brushDynamics = brushDynamicsValue !== null
    && typeof brushDynamicsValue === "object"
    && !Array.isArray(brushDynamicsValue)
    ? brushDynamicsValue as Record<string, unknown>
    : undefined;
  if (!hasValidStudioBrushEngineProgramExtension(payloadVersion, extensions?.brushEnginePrograms)) return false;
  if (!hasValidStudioLegacyPigmentArchiveStroke({ version: payloadVersion, type: record.get("type"),
    kind: record.get("kind"), mode: record.get("mode"), extensions })) return false;
  if (payloadVersion === STUDIO_LEGACY_PIGMENT_ARCHIVE_STROKE_VERSION && (!hasValidStudioPsdElementMetadata(extensions ?? {}, boundedExactText, boundedString)
    || (extensions?.colorizeMaskEnabled !== undefined && typeof extensions.colorizeMaskEnabled !== "boolean")
    || (extensions?.colorizeMask !== undefined && (!extensions.colorizeMask || typeof extensions.colorizeMask !== "object" || Array.isArray(extensions.colorizeMask)))
    || (extensions?.linked3dCorrection !== undefined && !parseStudioLinked3dCorrectionProvenance(extensions.linked3dCorrection)))) return false;
  const hasMaterialPressureModel = extensions !== undefined
    && Object.prototype.hasOwnProperty.call(extensions, "materialPressureModel");
  const hasMaterialMinimumDiameterRatio = extensions !== undefined
    && Object.prototype.hasOwnProperty.call(extensions, "materialMinimumDiameterRatio");
  const hasDynamicMinimumDiameterRatio = brushDynamics !== undefined
    && Object.prototype.hasOwnProperty.call(brushDynamics, "minimumDiameterRatio");
  if (
    brushDynamics?.depositPipeline === "causal-deposit-v4-taper-spacing"
    && payloadVersion !== STUDIO_CRDT_TAPER_SPACING_STROKE_PAYLOAD_VERSION
    && payloadVersion !== STUDIO_BRUSH_ENGINE_PROGRAM_STROKE_VERSION
    && payloadVersion !== STUDIO_LEGACY_PIGMENT_ARCHIVE_STROKE_VERSION
  ) return false;
  const hasSegmentedCausalDeposit =
    STUDIO_CRDT_SEGMENTED_CAUSAL_DEPOSIT_PIPELINES.has(brushDynamics?.depositPipeline);
  const r8GrainAdmission = rendererSignificantR8GrainAdmission(brushDynamicsValue);
  if (
    payloadVersion !== STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION
    && !strokePayloadSupportsContinuation(payloadVersion)
    && (
      hasMaterialPressureModel
      || hasMaterialMinimumDiameterRatio
      || hasDynamicMinimumDiameterRatio
    )
  ) return false;
  if (
    (
      payloadVersion === STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION
      || strokePayloadSupportsContinuation(payloadVersion)
    )
    && (
      hasMaterialPressureModel !== hasMaterialMinimumDiameterRatio
      || (hasMaterialPressureModel
        && extensions?.materialPressureModel !== STUDIO_CRDT_MATERIAL_PRESSURE_MODEL)
      || (hasMaterialMinimumDiameterRatio
        && !finiteNumberInRange(extensions?.materialMinimumDiameterRatio, 0, 1))
      || (hasDynamicMinimumDiameterRatio
        && !finiteNumberInRange(brushDynamics?.minimumDiameterRatio, 0, 1))
    )
  ) return false;
  if (
    hasSegmentedCausalDeposit
    && !strokePayloadSupportsContinuation(payloadVersion)
  ) return false;
  if (
    r8GrainAdmission === "invalid"
    || (
      r8GrainAdmission === "valid"
      && !strokePayloadSupportsContinuation(payloadVersion)
    )
  ) return false;
  const paintModel = extensions?.paintModel;
  if (
    paintModel !== undefined
    && !hasValidStudioCrdtStrokePaintContract({
      brushEnginePrograms: extensions?.brushEnginePrograms,
      payloadVersion,
      paintModel,
      kind: record.get("kind"),
      mode: record.get("mode"),
      brush: record.get("brush"),
      sampleSpacing: record.get("sampleSpacing"),
      pressureModel: extensions?.pressureModel,
      fill: record.get("fill"),
      brushDynamics: brushDynamicsValue,
      stampPipeline: extensions?.stampPipeline,
      watercolorPipeline: extensions?.watercolorPipeline,
      symmetry: record.get("symmetry"),
    })
  ) return false;
  const inkInput = extensions?.inkInput;
  const normalizedInkInput = inkInput === undefined
    ? null
    : normalizeStudioInkInputContract(inkInput);
  if (
    inkInput !== undefined
    && normalizedInkInput === null
  ) return false;
  const requiresExtendedInkChannels =
    !archive && isStudioInkInputContractV2(normalizedInkInput);
  const metadata: Record<string, unknown> = {
    version: payloadVersion,
    type: "draw",
    kind: record.get("kind"),
    mode: record.get("mode"),
    stroke: record.get("stroke"),
    strokeWidth,
  };
  for (const key of [
    "opacity",
    "sampleSpacing",
    ...STUDIO_CRDT_STROKE_OPTIONAL_STRING_KEYS,
    ...STUDIO_CRDT_STROKE_JSON_KEYS,
  ]) {
    if (record.has(key)) metadata[key] = record.get(key);
  }
  const metadataBytes = encodedJsonByteLength(metadata);
  if (metadataBytes === null || metadataBytes > STUDIO_CRDT_STROKE_METADATA_MAX_BYTES) return false;

  const arrays = Object.fromEntries(
    STUDIO_CRDT_STROKE_SAMPLE_KEYS.map((key) => [key, record.get(key)])
  ) as Record<(typeof STUDIO_CRDT_STROKE_SAMPLE_KEYS)[number], unknown>;
  if (
    STUDIO_CRDT_STROKE_BASE_SAMPLE_KEYS.some(
      (key) => !(archive && key !== "points" && arrays[key] === undefined) && !(arrays[key] instanceof Y.Array),
    )
    || (
      requiresExtendedInkChannels
      && STUDIO_CRDT_STROKE_EXTENDED_INK_SAMPLE_KEYS.some(
        (key) => !(arrays[key] instanceof Y.Array),
      )
    )
    || STUDIO_CRDT_STROKE_EXTENDED_INK_SAMPLE_KEYS.some(
      (key) => arrays[key] !== undefined && !(arrays[key] instanceof Y.Array),
    )
  ) {
    return false;
  }
  const points = arrays.points as Y.Array<unknown>;
  if (
    points.length % 2 !== 0 ||
    points.length / 2 > STUDIO_CRDT_STROKE_SAMPLE_MAX_COUNT
  ) return false;
  const sampleCount = points.length / 2;
  if (
    STUDIO_CRDT_STROKE_BASE_SAMPLE_KEYS.slice(1).some(
      (key) => arrays[key] instanceof Y.Array && (arrays[key] as Y.Array<unknown>).length !== sampleCount
    )
    || STUDIO_CRDT_STROKE_EXTENDED_INK_SAMPLE_KEYS.some(
      (key) => (
        arrays[key] instanceof Y.Array
        && arrays[key].length !== sampleCount
      ),
    )
  ) return false;
  const ranges: Record<(typeof STUDIO_CRDT_STROKE_SAMPLE_KEYS)[number], readonly [number, number]> = {
    points: [-STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE],
    pressures: [0, 1],
    tiltXs: [-90, 90],
    tiltYs: [-90, 90],
    twists: [0, 359],
    speeds: [0, 1_000_000],
    tangentialPressures: [-1, 1],
    altitudeAngles: [0, Math.PI / 2],
    azimuthAngles: [0, Math.PI * 2],
    contactWidths: [0, STUDIO_INK_INPUT_V2_MAX_CONTACT_DIMENSION],
    contactHeights: [0, STUDIO_INK_INPUT_V2_MAX_CONTACT_DIMENSION],
    sampleTimeOffsets: [0, STUDIO_INK_INPUT_V2_MAX_TIME_OFFSET_MS],
  };
  for (const key of STUDIO_CRDT_STROKE_SAMPLE_KEYS) {
    if (!(arrays[key] instanceof Y.Array)) continue;
    const [minimum, maximum] = ranges[key];
    const values = arrays[key].toArray();
    if (
      values.some(
        (value) => (
          !finiteNumberInRange(value, minimum, maximum)
          || (key === "azimuthAngles" && value === maximum)
        )
      )
    ) return false;
  }
  const sampleTimeOffsets = arrays.sampleTimeOffsets;
  if (sampleTimeOffsets instanceof Y.Array) {
    const values = sampleTimeOffsets.toArray();
    if (requiresExtendedInkChannels && sampleCount > 0 && values[0] !== 0) {
      return false;
    }
    for (let index = 1; index < values.length; index += 1) {
      if ((values[index] as number) < (values[index - 1] as number)) return false;
    }
  }
  return true;
}

function validateTrackedDynamicRoots(
  doc: Y.Doc,
  indexRootName: string,
  dynamicPrefix: string,
  validateRecord: (id: string, record: Y.Map<unknown>) => boolean,
  maximumEntries = STUDIO_CRDT_COLLECTION_MAX_ENTRIES
): boolean {
  const root = materializeExistingMapRoot(doc, indexRootName);
  const trackedIds = new Set<string>();
  if (root !== undefined) {
    if (root === null || root.size > maximumEntries) return false;
    for (const [id, active] of root) {
      if (!isBoundedStudioCrdtId(id) || active !== true) return false;
      const record = materializeExistingMapRoot(doc, `${dynamicPrefix}${encodeURIComponent(id)}`);
      if (!record || !validateRecord(id, record)) return false;
      trackedIds.add(id);
    }
  }
  let dynamicRootCount = 0;
  for (const [rootName, value] of doc.share) {
    if (!rootName.startsWith(dynamicPrefix)) continue;
    dynamicRootCount += 1;
    if (dynamicRootCount > maximumEntries) return false;
    const id = canonicalReservedRootId(rootName, dynamicPrefix);
    if (!id || !trackedIds.has(id) || !(value instanceof Y.Map) || !validateRecord(id, value)) {
      return false;
    }
  }
  return true;
}

/** Rejects valid Yjs syntax that would poison the Studio document's runtime collection contract. */
export function hasValidStudioCrdtRootSchema(doc: Y.Doc): boolean {
  const strokesRoot = materializeExistingMapRoot(doc, "strokes");
  if (strokesRoot !== undefined) {
    if (strokesRoot === null) return false;
    for (const [id, value] of strokesRoot) {
      if (
        !isBoundedStudioCrdtId(id) ||
        !(value instanceof Y.Map) ||
        !validateStrokeRoot(id, value)
      ) return false;
    }
  }

  const orderRoot = materializeExistingArrayRoot(doc, "stroke-order");
  if (orderRoot !== undefined) {
    if (orderRoot === null || orderRoot.length > STUDIO_CRDT_COLLECTION_MAX_ENTRIES) {
      return false;
    }
    const activeCounts = new Map<string, number>();
    const matchingActiveCoordinates = new Set<string>();
    const sceneIndexRoot = materializeExistingMapRoot(doc, STUDIO_CRDT_SCENE_INDEX_ROOT);
    for (const value of orderRoot) {
      if (!(value instanceof Y.Map)) return false;
      const strokeId = value.get("strokeId");
      const elementId = value.get("elementId");
      const isStroke = isBoundedStudioCrdtId(strokeId) && elementId === undefined;
      const isScene = isBoundedStudioCrdtId(elementId) && strokeId === undefined;
      if (!isStroke && !isScene) return false;
      const allowedKeys = isStroke
        ? new Set(["strokeId", "pageId", "layerId", "active"])
        : new Set(["elementId", "pageId", "layerId", "kind", "active"]);
      if (
        !hasOnlyKeys(value, allowedKeys) ||
        !isBoundedStudioCrdtId(value.get("pageId")) ||
        !isBoundedStudioCrdtId(value.get("layerId")) ||
        typeof value.get("active") !== "boolean" ||
        (isScene && value.get("kind") !== "scene")
      ) return false;
      const targetId = (isStroke ? strokeId : elementId) as string;
      const target = isStroke
        ? strokesRoot?.get(targetId)
        : materializeExistingMapRoot(
            doc,
            `${STUDIO_CRDT_SCENE_ROOT_PREFIX}${encodeURIComponent(targetId)}`
          );
      const active = value.get("active") === true;
      if (
        !(target instanceof Y.Map) ||
        target.get("id") !== targetId ||
        (isScene && (!sceneIndexRoot || sceneIndexRoot.get(targetId) !== true))
      ) return false;
      if (active) {
        const countKey = `${isStroke ? "stroke" : "scene"}:${targetId}`;
        const count = (activeCounts.get(countKey) ?? 0) + 1;
        if (count > STUDIO_CRDT_ACTIVE_ORDER_ENTRY_MAX_COUNT) return false;
        activeCounts.set(countKey, count);
        if (
          target.get("pageId") === value.get("pageId") &&
          target.get("layerId") === value.get("layerId")
        ) matchingActiveCoordinates.add(countKey);
      }
    }
    // Concurrent reparents can leave multiple active entries with different coordinates. Y.Map
    // deterministically chooses one record owner while Y.Array retains both operations, so losing
    // active entries are valid history. At least one active entry must still describe the winning
    // record coordinate; otherwise the order log cannot place the current record coherently.
    for (const countKey of activeCounts.keys()) {
      if (!matchingActiveCoordinates.has(countKey)) return false;
    }
  }

  if (
    !validateTrackedDynamicRoots(
      doc,
      STUDIO_CRDT_SCENE_INDEX_ROOT,
      STUDIO_CRDT_SCENE_ROOT_PREFIX,
      validateSceneElementRoot
    ) ||
    !validateTrackedDynamicRoots(
      doc,
      STUDIO_CRDT_PAGE_INDEX_ROOT,
      STUDIO_CRDT_PAGE_ROOT_PREFIX,
      validatePageRoot
    ) ||
    !validateTrackedLayerGroupRoots(doc) ||
    !validateStudioCrdtShared3dStageRoots(doc, validatePageRoot) || !hasValidStudioCrdtBg3dBundleRoots(doc)
  ) {
    return false;
  }

  const pageOrderRoot = materializeExistingArrayRoot(doc, STUDIO_CRDT_PAGE_ORDER_ROOT);
  if (pageOrderRoot !== undefined) {
    if (
      pageOrderRoot === null ||
      pageOrderRoot.length > STUDIO_CRDT_COLLECTION_MAX_ENTRIES
    ) return false;
    const allowedKeys = new Set(["pageId", "active"]);
    const activeCounts = new Map<string, number>();
    const pageIndexRoot = materializeExistingMapRoot(doc, STUDIO_CRDT_PAGE_INDEX_ROOT);
    for (const value of pageOrderRoot) {
      const pageId = value instanceof Y.Map ? value.get("pageId") : undefined;
      const pageRecord = isBoundedStudioCrdtId(pageId)
        ? materializeExistingMapRoot(
            doc,
            `${STUDIO_CRDT_PAGE_ROOT_PREFIX}${encodeURIComponent(pageId)}`
          )
        : undefined;
      if (
        !(value instanceof Y.Map) ||
        !hasOnlyKeys(value, allowedKeys) ||
        !isBoundedStudioCrdtId(pageId) ||
        typeof value.get("active") !== "boolean" ||
        !pageIndexRoot ||
        pageIndexRoot.get(pageId) !== true ||
        !(pageRecord instanceof Y.Map) ||
        pageRecord.get("id") !== pageId
      ) return false;
      if (value.get("active") === true) {
        const count = (activeCounts.get(pageId) ?? 0) + 1;
        if (count > STUDIO_CRDT_ACTIVE_ORDER_ENTRY_MAX_COUNT) return false;
        activeCounts.set(pageId, count);
      }
    }
  }
  if (!validateStudioCrdtDeletionRoots(doc)) return false;
  try {
    const raster = readStudioCrdtRasterDocument(doc);
    return hasValidStudioFilterMaskSurfaceReferences(doc, raster.surfaces);
  } catch {
    return false;
  }
}
