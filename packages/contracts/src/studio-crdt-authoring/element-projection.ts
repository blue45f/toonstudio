import { STUDIO_FILTER_MASK_REFERENCE_EDIT_KEYS, isStudioFilterMaskReferenceProps } from "../studio-filter-mask-surface-contract";
import { STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS, STUDIO_WORK_ASSET_TYPES, parseStudioWorkAssetSourceUri, studioWorkAssetSourceUri } from "../studio-work-asset-contract";

import type { StudioCrdtCompatibleElement, StudioCrdtAuthoringSceneRecord, StudioCrdtAuthoringGroupRecord } from "./page-reconcile";

export interface StudioCrdtProjectedElement extends StudioCrdtCompatibleElement { [key: string]: unknown }
export interface StudioCrdtProjectedDrawElement extends StudioCrdtProjectedElement {
  type: "draw"; points: number[]; stroke: string; strokeWidth: number;
}
export interface StudioCrdtProjectionStrokePayload {
  points: number[]; stroke: string; strokeWidth: number; extensions?: Record<string, unknown>;
}
const ARRAY_KEYS = ["points", "pressures", "tiltXs", "tiltYs", "twists", "speeds", "tangentialPressures", "altitudeAngles", "azimuthAngles", "contactWidths", "contactHeights", "sampleTimeOffsets"] as const;
const SCALAR_KEYS = ["kind", "mode", "opacity", "fill", "gradient", "pattern", "brush", "brushCatalogId", "brushCatalogName", "sampleSpacing", "brushDynamics", "brushTip", "strokeStyle", "shapeParams", "symmetry", "blendMode"] as const;
const EXTENSION_KEYS = ["smartShape", "stamp", "stampPipeline", "watercolorPipeline", "name", "hidden", "locked", "noClip", "frameClipId", "lockAspect", "groupId", "clipBelow", "alphaLocked", "maskSrc", "maskEnabled", "layerRole", "layerColor", "emeresSourceId"] as const;

/** 이미 admission에서 의미 검증한 페이로드를 손실 없이 Authoring 필드로 옮긴다. 렌더러를 추정하지 않는다. */
export function projectStudioCrdtDrawStroke(record: { id: string; layerId: string; payload: StudioCrdtProjectionStrokePayload }): StudioCrdtProjectedDrawElement {
  const payload = record.payload;
  const result: StudioCrdtProjectedDrawElement = { id: record.id, type: "draw", points: [...payload.points], stroke: payload.stroke, strokeWidth: payload.strokeWidth };
  for (const key of ARRAY_KEYS) {
    const value: unknown = Reflect.get(payload, key);
    Object.assign(result, { [key]: value === undefined ? undefined : Array.isArray(value) ? [...value] : fail("획 샘플 채널이 배열이 아닙니다.") });
  }
  for (const key of SCALAR_KEYS) result[key] = Reflect.get(payload, key);
  for (const key of EXTENSION_KEYS) {
    const value = payload.extensions?.[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/** Web의 의미 검증 뒤와 서버의 검증된 Y admission 뒤가 함께 사용하는 확장 필드 투영이다. */
export function projectValidatedStudioCrdtDrawStroke(record: { id: string; layerId: string; payload: StudioCrdtProjectionStrokePayload }): StudioCrdtProjectedDrawElement {
  const result = projectStudioCrdtDrawStroke(record), extensions = record.payload.extensions ?? {};
  for (const key of ["brushEnginePrograms", "outlineStroke", "inkInput"] as const) if (extensions[key] !== undefined) result[key] = structuredClone(extensions[key]);
  if (["linear-full-v1", "linear-residual-v2", "linear-residual-path-v3"].includes(String(extensions.pressureModel))) result.pressureModel = extensions.pressureModel;
  if (extensions.paperModel === "contact-tooth-v2") result.paperModel = extensions.paperModel;
  if (extensions.materialPressureModel !== undefined || extensions.materialMinimumDiameterRatio !== undefined) {
    result.materialPressureModel = extensions.materialPressureModel; result.materialMinimumDiameterRatio = extensions.materialMinimumDiameterRatio;
  }
  if (extensions.paintModel === "layered-flow-v1" || extensions.paintModel === "bounded-flow-v2") result.paintModel = extensions.paintModel;
  if (!result.groupId && record.layerId !== "page-root") result.groupId = record.layerId;
  return result;
}

export function isStudioCrdtProjectionTopologyReference(payload: { type: string; props: Record<string, unknown> }): boolean {
  if (payload.type !== "reference") return false;
  const keys = Object.keys(payload.props), elementType = payload.props.elementType;
  if (keys.length === 1 && typeof elementType === "string" && elementType !== "draw" &&
    !["text", "bubble", "sticker", "frame", "focusLines", "speedLines", "reference"].includes(elementType)) return true;
  if (elementType !== "image" || keys.length <= 1 || keys.some((key) => key !== "elementType" && key !== "hidden" && key !== "frameClipId" && !(STUDIO_FILTER_MASK_REFERENCE_EDIT_KEYS as readonly string[]).includes(key))) return false;
  if (Object.hasOwn(payload.props, "frameClipId") && (typeof payload.props.frameClipId !== "string" || !payload.props.frameClipId || payload.props.frameClipId.length > 160)) return false;
  if (Object.hasOwn(payload.props, "hidden") && typeof payload.props.hidden !== "boolean") return false;
  const filterProps = Object.fromEntries(STUDIO_FILTER_MASK_REFERENCE_EDIT_KEYS.flatMap((key) => Object.hasOwn(payload.props, key) ? [[key, payload.props[key]]] : []));
  return Object.keys(filterProps).length === 0 || isStudioFilterMaskReferenceProps(filterProps);
}

/** 원본 자산의 본문은 baseline이 소유하며, 실시간 봉투가 허용한 속성만 덮어쓴다. */
export function projectStudioCrdtSceneElement(record: StudioCrdtAuthoringSceneRecord, referenceSource?: StudioCrdtCompatibleElement): StudioCrdtProjectedElement {
  if (record.payload.type !== "reference") return { id: record.id, type: record.payload.type, ...record.payload.props,
    ...(!record.payload.props.groupId && record.layerId !== "page-root" ? { groupId: record.layerId } : {}) };
  const elementType = record.payload.props.elementType;
  if (!referenceSource || referenceSource.id !== record.id || referenceSource.type !== elementType) fail("자산 원본 본문을 확인할 수 없습니다.");
  const referenceProps = { ...record.payload.props }; delete referenceProps.elementType; delete referenceProps.bundleSourceCredit;
  const topology = isStudioCrdtProjectionTopologyReference(record.payload);
  const result: StudioCrdtProjectedElement = { ...referenceSource, ...referenceProps, id: record.id, type: referenceSource.type };
  if (!topology) {
    if (!(STUDIO_WORK_ASSET_TYPES as readonly string[]).includes(referenceSource.type)) fail("지원하지 않는 자산 참조입니다.");
    result.src = studioWorkAssetSourceUri({ assetId: record.id, elementType: referenceSource.type as typeof STUDIO_WORK_ASSET_TYPES[number] });
    for (const key of STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS) if (key !== "bundleSourceCredit" && !Object.hasOwn(referenceProps, key)) delete result[key];
  }
  if (record.layerId === "page-root") delete result.groupId; else result.groupId = record.layerId;
  return result;
}

export function projectStudioCrdtLayerGroup(record: StudioCrdtAuthoringGroupRecord, collapsed?: boolean) {
  if (typeof record.payload.props.name !== "string") fail("레이어 그룹 이름이 올바르지 않습니다.");
  return { id: record.id, name: String(record.payload.props.name),
    ...(typeof record.payload.props.hidden === "boolean" ? { hidden: record.payload.props.hidden } : {}),
    ...(typeof record.payload.props.locked === "boolean" ? { locked: record.payload.props.locked } : {}),
    ...(collapsed === undefined ? {} : { collapsed }) };
}

export function isAdmittedStudioCrdtProjectionAsset(element: StudioCrdtCompatibleElement): boolean {
  const src: unknown = Reflect.get(element, "src"), reference = typeof src === "string" ? parseStudioWorkAssetSourceUri(src) : null;
  return reference?.assetId === element.id && reference.elementType === element.type;
}
export { studioCrdtProjectionGroupKey } from "./group-key";
function fail(message: string): never { throw new Error(message); }
