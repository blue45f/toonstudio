import { isBoundedStudioCrdtId } from "./studio-crdt-identifiers";
import {
  STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX,
  STUDIO_CRDT_MAX_COORDINATE,
  STUDIO_CRDT_PAGE_PAYLOAD_MAX_BYTES,
  boundedExactText,
  boundedString,
  encodedJsonByteLength,
  finiteNumberInRange,
  hasOnlyJsonKeys,
  isExactJsonObject,
} from "./studio-crdt-root-schema-primitives";

export const STUDIO_CRDT_PAGE_KEYS = new Set([
  "bg",
  "bgGrad",
  "canvasH",
  "name",
  "note",
  "hideMaster",
  "shotType",
  "cameraAngle",
  "drawingAssist",
  "paperSurface",
  "paperGrainVisible",
  "layerComps",
]);

export const STUDIO_CRDT_LAYER_GROUP_KEYS = new Set(["name", "hidden", "locked"]);

export interface StudioCrdtLayerGroupIdentity {
  key: string;
  pageId: string;
  groupId: string;
}

const STUDIO_CRDT_DRAWING_ASSIST_LEGACY_VERSION = 1;
const STUDIO_CRDT_DRAWING_ASSIST_VERSION = 2;
const STUDIO_CRDT_DRAWING_ASSIST_MAX_VANISHING_POINTS = 3;
const STUDIO_CRDT_DRAWING_ASSIST_ANGLE_MIN_DEG = 1;
const STUDIO_CRDT_DRAWING_ASSIST_ANGLE_MAX_DEG = 89;
const STUDIO_CRDT_DRAWING_ASSIST_CELL_SIZE_MIN = 8;
const STUDIO_CRDT_DRAWING_ASSIST_CELL_SIZE_MAX = 200;
const STUDIO_CRDT_ADVANCED_RULER_VERSION = 1;
const STUDIO_CRDT_ADVANCED_RULER_MAX_COUNT = 12;
const STUDIO_CRDT_ADVANCED_RULER_MAX_BYTES = 6 * 1_024;
const STUDIO_CRDT_ADVANCED_RULER_MAX_NAME_LENGTH = 80;
const STUDIO_CRDT_ADVANCED_RULER_MAX_OFFSET = 1_000_000;
const STUDIO_CRDT_ADVANCED_RULER_MIN_CONTROL_POLYGON_LENGTH = 1e-6;

const STUDIO_CRDT_PAPER_GRAIN_KINDS = new Set([
  "hot-press",
  "cold-press",
  "rough",
  "bristol",
  "washi",
  "kraft",
  "canvas",
  "charcoal",
  "newsprint",
  "pastel-board",
  "cotton-rag",
  "watercolor-block",
  "linen-canvas",
  "marker-pad",
  "manga-paper",
  "toned-tan",
  "toned-gray",
  "sanded-pastel",
  "rice-paper",
  "mulberry",
  "vellum",
]);
const STUDIO_CRDT_PAPER_SURFACE_KEYS = new Set(["kind", "seed"]);
const STUDIO_CRDT_PAPER_SURFACE_MAX_SEED = 0xffff_ffff;

export function isValidStudioCrdtPaperSurface(value: unknown): boolean {
  if (!isExactJsonObject(value, STUDIO_CRDT_PAPER_SURFACE_KEYS)) return false;
  return typeof value.kind === "string" &&
    STUDIO_CRDT_PAPER_GRAIN_KINDS.has(value.kind) &&
    typeof value.seed === "number" &&
    Number.isInteger(value.seed) &&
    value.seed >= 0 &&
    value.seed <= STUDIO_CRDT_PAPER_SURFACE_MAX_SEED;
}

const STUDIO_CRDT_DRAWING_ASSIST_LEGACY_KEYS = new Set([
  "version",
  "perspective",
  "isometric",
]);
const STUDIO_CRDT_DRAWING_ASSIST_KEYS = new Set([
  "version",
  "perspective",
  "isometric",
  "advanced",
]);
const STUDIO_CRDT_PERSPECTIVE_ASSIST_KEYS_LEGACY = new Set(["active", "points"]);
/** Canonical: independent eye-level horizon + optional VP horizon lock (CSP-class). */
const STUDIO_CRDT_PERSPECTIVE_ASSIST_KEYS = new Set([
  "active",
  "points",
  "eyeLevelY",
  "lockHorizon",
]);
const STUDIO_CRDT_VANISHING_POINT_KEYS = new Set(["id", "x", "y"]);
const STUDIO_CRDT_ISOMETRIC_ASSIST_KEYS = new Set([
  "active",
  "angleDeg",
  "cellSize",
  "originX",
  "originY",
]);
const STUDIO_CRDT_ADVANCED_RULER_KEYS = new Set([
  "version",
  "rulers",
  "activeSnapRulerId",
  "selectedRulerId",
]);
const STUDIO_CRDT_ADVANCED_RULER_SCOPE_KEYS = new Set(["kind", "groupId"]);
const STUDIO_CRDT_ADVANCED_RULER_POINT_KEYS = new Set(["x", "y"]);
const STUDIO_CRDT_ADVANCED_CURVE_RULER_KEYS = new Set([
  "id",
  "type",
  "name",
  "enabled",
  "visible",
  "scope",
  "snapMode",
  "fixedOffset",
  "p0",
  "p1",
  "p2",
  "p3",
]);
const STUDIO_CRDT_ADVANCED_FISHEYE_RULER_KEYS = new Set([
  "id",
  "type",
  "name",
  "enabled",
  "visible",
  "scope",
  "guideFamily",
  "centerX",
  "centerY",
  "radius",
  "rotationDeg",
  "fovDeg",
  "strength",
  "outsidePolicy",
]);

function isValidStudioCrdtAdvancedRulerScope(value: unknown): boolean {
  if (!isExactJsonObject(value, STUDIO_CRDT_ADVANCED_RULER_SCOPE_KEYS)) return false;
  return (value.kind === "page" && value.groupId === null) ||
    (value.kind === "group" && isBoundedStudioCrdtId(value.groupId));
}

function isValidStudioCrdtAdvancedRulerPoint(value: unknown): value is {
  x: number;
  y: number;
} {
  return isExactJsonObject(value, STUDIO_CRDT_ADVANCED_RULER_POINT_KEYS) &&
    finiteNumberInRange(value.x, -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE) &&
    finiteNumberInRange(value.y, -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE);
}

function hasValidStudioCrdtAdvancedRulerBase(value: Record<string, unknown>): boolean {
  return isBoundedStudioCrdtId(value.id) &&
    boundedExactText(value.name, STUDIO_CRDT_ADVANCED_RULER_MAX_NAME_LENGTH) &&
    typeof value.enabled === "boolean" &&
    typeof value.visible === "boolean" &&
    isValidStudioCrdtAdvancedRulerScope(value.scope);
}

function isValidStudioCrdtAdvancedCurveRuler(value: unknown): value is Record<string, unknown> {
  if (
    !isExactJsonObject(value, STUDIO_CRDT_ADVANCED_CURVE_RULER_KEYS) ||
    value.type !== "curve" ||
    !hasValidStudioCrdtAdvancedRulerBase(value) ||
    !["through-start", "on-curve", "fixed"].includes(value.snapMode as string) ||
    !finiteNumberInRange(
      value.fixedOffset,
      -STUDIO_CRDT_ADVANCED_RULER_MAX_OFFSET,
      STUDIO_CRDT_ADVANCED_RULER_MAX_OFFSET
    ) ||
    !isValidStudioCrdtAdvancedRulerPoint(value.p0) ||
    !isValidStudioCrdtAdvancedRulerPoint(value.p1) ||
    !isValidStudioCrdtAdvancedRulerPoint(value.p2) ||
    !isValidStudioCrdtAdvancedRulerPoint(value.p3)
  ) {
    return false;
  }
  const controlPolygonLength = Math.hypot(value.p1.x - value.p0.x, value.p1.y - value.p0.y) +
    Math.hypot(value.p2.x - value.p1.x, value.p2.y - value.p1.y) +
    Math.hypot(value.p3.x - value.p2.x, value.p3.y - value.p2.y);
  return controlPolygonLength >= STUDIO_CRDT_ADVANCED_RULER_MIN_CONTROL_POLYGON_LENGTH;
}

function isValidStudioCrdtAdvancedFisheyeRuler(value: unknown): value is Record<string, unknown> {
  return isExactJsonObject(value, STUDIO_CRDT_ADVANCED_FISHEYE_RULER_KEYS) &&
    value.type === "fisheye" &&
    hasValidStudioCrdtAdvancedRulerBase(value) &&
    ["auto", "radial", "spherical"].includes(value.guideFamily as string) &&
    finiteNumberInRange(
      value.centerX,
      -STUDIO_CRDT_MAX_COORDINATE,
      STUDIO_CRDT_MAX_COORDINATE
    ) &&
    finiteNumberInRange(
      value.centerY,
      -STUDIO_CRDT_MAX_COORDINATE,
      STUDIO_CRDT_MAX_COORDINATE
    ) &&
    finiteNumberInRange(value.radius, 8, STUDIO_CRDT_MAX_COORDINATE) &&
    finiteNumberInRange(value.rotationDeg, 0, 360) &&
    value.rotationDeg !== 360 &&
    finiteNumberInRange(value.fovDeg, 30, 220) &&
    finiteNumberInRange(value.strength, 0.25, 4) &&
    ["reject", "clamp", "passthrough"].includes(value.outsidePolicy as string);
}

function isValidStudioCrdtAdvancedRulerDocument(value: unknown): value is Record<string, unknown> {
  if (
    !isExactJsonObject(value, STUDIO_CRDT_ADVANCED_RULER_KEYS) ||
    value.version !== STUDIO_CRDT_ADVANCED_RULER_VERSION ||
    !Array.isArray(value.rulers) ||
    value.rulers.length > STUDIO_CRDT_ADVANCED_RULER_MAX_COUNT
  ) {
    return false;
  }
  const ids = new Set<string>();
  const enabledIds = new Set<string>();
  for (const ruler of value.rulers) {
    if (
      (!isValidStudioCrdtAdvancedCurveRuler(ruler) &&
        !isValidStudioCrdtAdvancedFisheyeRuler(ruler)) ||
      ids.has(ruler.id as string)
    ) {
      return false;
    }
    ids.add(ruler.id as string);
    if (ruler.enabled === true) enabledIds.add(ruler.id as string);
  }
  if (
    value.activeSnapRulerId !== null &&
    (!isBoundedStudioCrdtId(value.activeSnapRulerId) ||
      !enabledIds.has(value.activeSnapRulerId))
  ) {
    return false;
  }
  if (
    value.selectedRulerId !== null &&
    (!isBoundedStudioCrdtId(value.selectedRulerId) || !ids.has(value.selectedRulerId))
  ) {
    return false;
  }
  const byteLength = encodedJsonByteLength(value);
  return byteLength !== null && byteLength <= STUDIO_CRDT_ADVANCED_RULER_MAX_BYTES;
}

export function isValidStudioCrdtDrawingAssist(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const version = (value as Record<string, unknown>).version;
  const expectedKeys = version === STUDIO_CRDT_DRAWING_ASSIST_LEGACY_VERSION
    ? STUDIO_CRDT_DRAWING_ASSIST_LEGACY_KEYS
    : version === STUDIO_CRDT_DRAWING_ASSIST_VERSION
      ? STUDIO_CRDT_DRAWING_ASSIST_KEYS
      : null;
  if (!expectedKeys || !isExactJsonObject(value, expectedKeys)) return false;
  const { perspective, isometric } = value;
  const perspectiveKeysOk = isExactJsonObject(perspective, STUDIO_CRDT_PERSPECTIVE_ASSIST_KEYS)
    || isExactJsonObject(perspective, STUDIO_CRDT_PERSPECTIVE_ASSIST_KEYS_LEGACY);
  if (
    !perspectiveKeysOk ||
    !isExactJsonObject(isometric, STUDIO_CRDT_ISOMETRIC_ASSIST_KEYS) ||
    typeof perspective.active !== "boolean" ||
    typeof isometric.active !== "boolean" ||
    (perspective.active && isometric.active) ||
    !Array.isArray(perspective.points) ||
    perspective.points.length > STUDIO_CRDT_DRAWING_ASSIST_MAX_VANISHING_POINTS ||
    !finiteNumberInRange(
      isometric.angleDeg,
      STUDIO_CRDT_DRAWING_ASSIST_ANGLE_MIN_DEG,
      STUDIO_CRDT_DRAWING_ASSIST_ANGLE_MAX_DEG
    ) ||
    !finiteNumberInRange(
      isometric.cellSize,
      STUDIO_CRDT_DRAWING_ASSIST_CELL_SIZE_MIN,
      STUDIO_CRDT_DRAWING_ASSIST_CELL_SIZE_MAX
    ) ||
    !finiteNumberInRange(
      isometric.originX,
      -STUDIO_CRDT_MAX_COORDINATE,
      STUDIO_CRDT_MAX_COORDINATE
    ) ||
    !finiteNumberInRange(
      isometric.originY,
      -STUDIO_CRDT_MAX_COORDINATE,
      STUDIO_CRDT_MAX_COORDINATE
    )
  ) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(perspective, "eyeLevelY")) {
    const eyeLevelY = (perspective as { eyeLevelY: unknown }).eyeLevelY;
    if (
      eyeLevelY !== null
      && !finiteNumberInRange(eyeLevelY, -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE)
    ) {
      return false;
    }
  }
  if (Object.prototype.hasOwnProperty.call(perspective, "lockHorizon")) {
    if (typeof (perspective as { lockHorizon: unknown }).lockHorizon !== "boolean") {
      return false;
    }
  }

  const pointIds = new Set<string>();
  for (const point of perspective.points) {
    if (
      !isExactJsonObject(point, STUDIO_CRDT_VANISHING_POINT_KEYS) ||
      !isBoundedStudioCrdtId(point.id) ||
      pointIds.has(point.id) ||
      !finiteNumberInRange(point.x, -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE) ||
      !finiteNumberInRange(point.y, -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE)
    ) {
      return false;
    }
    pointIds.add(point.id);
  }
  if (value.version === STUDIO_CRDT_DRAWING_ASSIST_VERSION) {
    if (!isValidStudioCrdtAdvancedRulerDocument(value.advanced)) return false;
    if (
      value.advanced.activeSnapRulerId !== null &&
      (perspective.active || isometric.active)
    ) {
      return false;
    }
  }
  const byteLength = encodedJsonByteLength(value);
  return byteLength !== null && byteLength <= STUDIO_CRDT_PAGE_PAYLOAD_MAX_BYTES;
}

function isStudioCrdtLayerCompObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStudioCrdtLayerCompText(value: unknown, maximum = 160): value is string {
  return boundedString(value, maximum) && value.length > 0;
}

function isValidStudioCrdtLayerCompStates(value: unknown, kind: "layer" | "group"): boolean {
  if (!isStudioCrdtLayerCompObject(value) || Object.keys(value).length > 10_000) return false;
  const allowed = new Set(kind === "layer"
    ? ["layerId", "visible", "opacity", "blendMode", "groupId"]
    : ["groupId", "visible"]);
  return Object.entries(value).every(([id, state]) => {
    if (!isStudioCrdtLayerCompText(id) || !isStudioCrdtLayerCompObject(state)
      || !hasOnlyJsonKeys(state, allowed) || state[`${kind}Id`] !== id
      || typeof state.visible !== "boolean") return false;
    return kind === "group" || (finiteNumberInRange(state.opacity, 0, 1)
      && (!("blendMode" in state) || boundedString(state.blendMode, 80))
      && (!("groupId" in state) || isStudioCrdtLayerCompText(state.groupId)));
  });
}

/** Validate every wire candidate, including baselines hidden by a newer property winner. */
export function isValidStudioCrdtLayerComps(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 64) return false;
  const ids = new Set<string>();
  const allowed = new Set(["id", "name", "createdAt", "notes", "layerStates", "groupStates"]);
  for (const comp of value) {
    if (!isStudioCrdtLayerCompObject(comp) || !hasOnlyJsonKeys(comp, allowed)
      || !isStudioCrdtLayerCompText(comp.id) || ids.has(comp.id)
      || !isStudioCrdtLayerCompText(comp.name) || !Number.isInteger(comp.createdAt)
      || !finiteNumberInRange(comp.createdAt, 0, Number.MAX_SAFE_INTEGER)
      || ("notes" in comp && !boundedString(comp.notes, 8_192))
      || !isValidStudioCrdtLayerCompStates(comp.layerStates, "layer")
      || ("groupStates" in comp && !isValidStudioCrdtLayerCompStates(comp.groupStates, "group"))) {
      return false;
    }
    ids.add(comp.id);
  }
  const byteLength = encodedJsonByteLength(value);
  return byteLength !== null && byteLength <= STUDIO_CRDT_PAGE_PAYLOAD_MAX_BYTES;
}

export function parseStudioCrdtLayerGroupKey(key: string): StudioCrdtLayerGroupIdentity | null {
  if (key.length < 5 || key.length > 328) return null;
  const readPart = (offset: number): { value: string; nextOffset: number } | null => {
    const separator = key.indexOf(":", offset);
    if (separator < 0) return null;
    const lengthToken = key.slice(offset, separator);
    if (!/^(?:0|[1-9][0-9]*)$/u.test(lengthToken)) return null;
    const length = Number(lengthToken);
    if (!Number.isSafeInteger(length) || length <= 0 || length > 160) return null;
    const start = separator + 1;
    const end = start + length;
    if (end > key.length) return null;
    return { value: key.slice(start, end), nextOffset: end };
  };
  const page = readPart(0);
  if (!page) return null;
  const group = readPart(page.nextOffset);
  if (
    !group ||
    group.nextOffset !== key.length ||
    !isBoundedStudioCrdtId(page.value) ||
    !isBoundedStudioCrdtId(group.value) ||
    group.value === "page-root"
  ) {
    return null;
  }
  const canonical = `${page.value.length}:${page.value}${group.value.length}:${group.value}`;
  return canonical === key
    ? { key, pageId: page.value, groupId: group.value }
    : null;
}

export function canonicalReservedLayerGroupKey(
  rootName: string
): StudioCrdtLayerGroupIdentity | null {
  if (!rootName.startsWith(STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX)) return null;
  const encodedKey = rootName.slice(STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX.length);
  if (!encodedKey) return null;
  try {
    const key = decodeURIComponent(encodedKey);
    if (encodeURIComponent(key) !== encodedKey) return null;
    return parseStudioCrdtLayerGroupKey(key);
  } catch {
    return null;
  }
}
