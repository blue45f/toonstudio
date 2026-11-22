import * as Y from "yjs";

import {
  STUDIO_FILTER_MASK_REFERENCE_EDIT_KEYS,
  isStudioFilterMaskReferenceProps,
  isStudioFilterMaskSurfaceId,
  isStudioFilterMaskSurfaceSpec,
} from "@toonstudio/contracts/studio-filter-mask-surface-contract";
import {
  STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEYS,
  STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS,
  STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES,
  STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEYS,
  STUDIO_WORK_ASSET_TYPES,
  StudioWorkAssetElementSchema,
  parseStudioWorkAssetStructuredEditValue,
} from "@toonstudio/contracts/studio-work-asset-contract";

import {
  STUDIO_BG3D_IMAGE_PROPERTIES,
  hasValidStudioBg3dImageReferenceProps,
  isValidStudioBg3dImageReferenceCandidate,
} from "./studio-crdt-bg3d-shape";
import { isBoundedStudioCrdtId } from "./studio-crdt-identifiers";
import {
  STUDIO_CRDT_MAX_COORDINATE,
  STUDIO_CRDT_SCENE_INDEX_ROOT,
  STUDIO_CRDT_SCENE_ROOT_PREFIX,
  boundedExactText,
  finiteNumberInRange,
  materializeExistingMapRoot,
  readReservedProperties,
} from "./studio-crdt-root-schema-primitives";

export const STUDIO_WORK_ASSET_TYPE_SET = new Set<string>(STUDIO_WORK_ASSET_TYPES);
const STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEY_SET = new Set<string>(
  STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEYS
);
const STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEY_SET = new Set<string>(
  STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEYS
);

const STUDIO_CRDT_COMMON_SCENE_KEYS = [
  "name",
  "hidden",
  "locked",
  "noClip",
  "opacity",
  "blendMode",
  "lockAspect",
  "groupId", "frameClipId",
  "clipBelow",
  "alphaLocked",
  "maskSrc",
  "maskEnabled",
  "layerRole",
  "layerColor",
  "emeresSourceId", "psdSource", "psdGroupId", "psdFolderPath", "psdRasterSourceId",
] as const;

export const STUDIO_CRDT_SCENE_KEYS_BY_TYPE = {
  text: new Set([
    ...STUDIO_CRDT_COMMON_SCENE_KEYS,
    "text", "x", "y", "width", "fontSize", "fill", "rotation", "font", "stroke",
    "strokeWidth", "letterSpacing", "lineHeight", "vertical", "align", "fontStyle",
    "shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY", "shadowOpacity",
    "fillType", "gradientColorStart", "gradientColorEnd", "gradientDirection", "gradient",
    "textPath", "skewX", "skewY", "stickyNotePresetId", "stickyNoteFill",
  ]),
  bubble: new Set([
    ...STUDIO_CRDT_COMMON_SCENE_KEYS,
    "variant", "text", "x", "y", "width", "height", "fill", "textFill", "rotation",
    "tail", "tailDirection", "extraTails", "font", "fontSize", "lineHeight", "vertical",
    "align", "fontStyle", "tailXRatio", "tailHeight", "tailBase", "tailBend",
    "tailAnchorId", "tailAnchorPoint", "stroke", "strokeWidth", "strokeStyle", "gradient",
    "autoShrinkText", "autoShrinkMinFontSize", "starAmplitude", "shadowColor", "shadowBlur",
    "shadowOffsetX", "shadowOffsetY", "shadowOpacity", "customShapePoints",
  ]),
  sticker: new Set([
    ...STUDIO_CRDT_COMMON_SCENE_KEYS,
    "text", "x", "y", "fontSize", "rotation", "skewX", "skewY",
  ]),
  frame: new Set([
    ...STUDIO_CRDT_COMMON_SCENE_KEYS,
    "x", "y", "width", "height", "bg", "bgColor", "stroke", "strokeWidth", "dashStyle",
    "storyBeat", "aiProvenance", "points", "bundleSourceCredit",
  ]),
  focusLines: new Set([
    ...STUDIO_CRDT_COMMON_SCENE_KEYS,
    "x", "y", "width", "height", "lineCount", "innerRadius", "outerRadius", "stroke",
    "strokeWidth", "noise", "rotation", "centerXRatio", "centerYRatio",
  ]),
  speedLines: new Set([
    ...STUDIO_CRDT_COMMON_SCENE_KEYS,
    "x", "y", "width", "height", "lineCount", "direction", "stroke", "strokeWidth",
    "noise", "rotation",
  ]),
  // 원본은 작품 저장소가 소유한다. wire는 배치·효과·페이지/레이어·삭제의 bounded 상태만 소유한다.
  reference: new Set([
    "elementType",
    ...STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS,
    ...STUDIO_FILTER_MASK_REFERENCE_EDIT_KEYS, ...STUDIO_BG3D_IMAGE_PROPERTIES,
  ]),
} as const;

export type StudioCrdtSceneType = keyof typeof STUDIO_CRDT_SCENE_KEYS_BY_TYPE;

export const STUDIO_CRDT_REQUIRED_SCENE_KEYS: Record<StudioCrdtSceneType, readonly string[]> = {
  text: ["text", "x", "y", "width", "fontSize", "fill", "rotation"],
  bubble: ["variant", "text", "x", "y", "width", "height", "fill", "textFill", "rotation"],
  sticker: ["text", "x", "y", "fontSize", "rotation"],
  frame: ["x", "y", "width", "height"],
  focusLines: [
    "x", "y", "width", "height", "lineCount", "innerRadius", "outerRadius", "stroke",
    "strokeWidth", "noise", "rotation",
  ],
  speedLines: [
    "x", "y", "width", "height", "lineCount", "direction", "stroke", "strokeWidth",
    "rotation",
  ],
  reference: ["elementType"],
};

export function isStudioCrdtSceneType(value: unknown): value is StudioCrdtSceneType {
  return typeof value === "string" && Object.hasOwn(STUDIO_CRDT_SCENE_KEYS_BY_TYPE, value);
}

export function isValidLegacyStudioCrdtReferenceType(value: unknown): value is string {
  return boundedExactText(value, 160) && value !== "draw" && !isStudioCrdtSceneType(value);
}

function hasLegacyStudioCrdtReferenceProps(
  props: Record<string, unknown>
): boolean {
  return Object.keys(props).length === 1 &&
    isValidLegacyStudioCrdtReferenceType(props.elementType);
}

function studioFilterMaskReferenceProps(
  props: Record<string, unknown>
): Record<string, unknown> {
  const candidate: Record<string, unknown> = {};
  for (const key of STUDIO_FILTER_MASK_REFERENCE_EDIT_KEYS) {
    if (Object.hasOwn(props, key)) candidate[key] = props[key];
  }
  return candidate;
}

function hasStudioFilterMaskReferenceState(
  props: Record<string, unknown>
): boolean {
  return STUDIO_FILTER_MASK_REFERENCE_EDIT_KEYS.some((key) => Object.hasOwn(props, key));
}

function hasImageAuxiliaryStudioCrdtReferenceProps(
  props: Record<string, unknown>
): boolean {
  const keys = Object.keys(props);
  if (
    props.elementType !== "image" ||
    keys.length <= 1 ||
    keys.some((key) => (
      key !== "elementType" &&
      key !== "hidden" &&
      !(STUDIO_FILTER_MASK_REFERENCE_EDIT_KEYS as readonly string[]).includes(key)
    )) ||
    (Object.hasOwn(props, "hidden") && typeof props.hidden !== "boolean")
  ) {
    return false;
  }
  const filterMaskProps = studioFilterMaskReferenceProps(props);
  return Object.keys(filterMaskProps).length === 0 ||
    isStudioFilterMaskReferenceProps(filterMaskProps);
}

export function hasTopologyStudioCrdtReferenceProps(
  props: Record<string, unknown>
): boolean {
  return hasLegacyStudioCrdtReferenceProps(props) ||
    hasImageAuxiliaryStudioCrdtReferenceProps(props);
}

export function isValidStudioWorkAssetReferenceCandidate(
  property: string,
  value: unknown
): boolean {
  const bg3d = isValidStudioBg3dImageReferenceCandidate(property, value);
  if (bg3d !== undefined) return bg3d;
  if (property === "elementType") {
    return isValidLegacyStudioCrdtReferenceType(value);
  }
  if (property === "x" || property === "y") {
    return finiteNumberInRange(value, -STUDIO_CRDT_MAX_COORDINATE, STUDIO_CRDT_MAX_COORDINATE);
  }
  if (property === "width" || property === "height") {
    return finiteNumberInRange(value, Number.MIN_VALUE, STUDIO_CRDT_MAX_COORDINATE);
  }
  if (property === "rotation") return finiteNumberInRange(value, -360_000, 360_000);
  if (property === "opacity") return finiteNumberInRange(value, 0, 1);
  if (property === "filterMaskSurfaceId") return isStudioFilterMaskSurfaceId(value);
  if (property === "frameClipId") return isBoundedStudioCrdtId(value);
  if (property === "filterMaskEnabled") return typeof value === "boolean";
  if (STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEY_SET.has(property)) return typeof value === "boolean";
  if (STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEY_SET.has(property)) {
    try {
      parseStudioWorkAssetStructuredEditValue(
        property as (typeof STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEYS)[number],
        value
      );
      return true;
    } catch {
      return false;
    }
  }
  const range = STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES[
    property as keyof typeof STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES
  ];
  return Boolean(range && finiteNumberInRange(value, range.minimum, range.maximum));
}

export function hasValidStudioWorkAssetReferenceProps(
  id: string,
  props: Record<string, unknown>
): boolean {
  const bg3d = hasValidStudioBg3dImageReferenceProps(id, props);
  if (bg3d !== undefined) return bg3d;
  if (hasTopologyStudioCrdtReferenceProps(props)) return true;
  const { elementType, ...referenceProps } = props;
  const filterMaskProps = studioFilterMaskReferenceProps(props);
  if (
    hasStudioFilterMaskReferenceState(props) &&
    (
      elementType !== "image" ||
      !isStudioFilterMaskReferenceProps(filterMaskProps)
    )
  ) {
    return false;
  }
  const editProps: Record<string, unknown> = { ...referenceProps };
  for (const key of STUDIO_FILTER_MASK_REFERENCE_EDIT_KEYS) delete editProps[key];
  return typeof elementType === "string" && STUDIO_WORK_ASSET_TYPE_SET.has(elementType) &&
    StudioWorkAssetElementSchema.safeParse({
      id,
      type: elementType,
      ...editProps,
    }).success;
}

export function hasValidStudioFilterMaskSurfaceReferences(
  doc: Y.Doc,
  surfaces: ReadonlyMap<string, unknown>
): boolean {
  const index = materializeExistingMapRoot(doc, STUDIO_CRDT_SCENE_INDEX_ROOT);
  if (index === undefined) return true;
  if (!(index instanceof Y.Map)) return false;
  const metadataKeys = new Set(["id", "pageId", "layerId", "payloadVersion", "type", "deleted"]);
  for (const [id, tracked] of index) {
    if (tracked !== true || !isBoundedStudioCrdtId(id)) return false;
    const record = materializeExistingMapRoot(
      doc,
      `${STUDIO_CRDT_SCENE_ROOT_PREFIX}${encodeURIComponent(id)}`
    );
    if (!(record instanceof Y.Map) || record.get("type") !== "reference") continue;
    const props = readReservedProperties(
      record,
      STUDIO_CRDT_SCENE_KEYS_BY_TYPE.reference,
      metadataKeys
    );
    if (!props) return false;
    const candidates = new Set<unknown>();
    if (Object.hasOwn(props, "filterMaskSurfaceId")) {
      candidates.add(props.filterMaskSurfaceId);
    }
    for (const [key, value] of record) {
      if (
        key === "base:filterMaskSurfaceId" ||
        key === "prop:filterMaskSurfaceId"
      ) {
        candidates.add(value);
      }
    }
    for (const candidate of candidates) {
      if (!isStudioFilterMaskSurfaceId(candidate)) return false;
      const surface = surfaces.get(candidate);
      if (!isStudioFilterMaskSurfaceSpec(surface)) return false;
    }
  }
  return true;
}
