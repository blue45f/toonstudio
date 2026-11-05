import { hasValidStudioLegacyPigmentArchiveStroke, STUDIO_LEGACY_PIGMENT_ARCHIVE_STROKE_VERSION } from "@toonstudio/contracts/studio-legacy-pigment-archive";
import { STUDIO_CRDT_BG3D_IMAGE_KEYS, validateStudioCrdtBg3dImageReference } from "./studio-crdt-bg3d-image-reference";
import type { StudioBg3dSixPassBundleState } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import type { StudioBrushEngineProgramSet } from "../brush/studio-brush-engine-program-set";
import { createStudioCrdtPageReconciler } from "@toonstudio/contracts/studio-crdt-authoring/page-reconcile";
import { projectStudioCrdtDrawStroke, projectStudioCrdtSceneElement, projectStudioCrdtLayerGroup } from "@toonstudio/contracts/studio-crdt-authoring/element-projection";
import { hasValidStudioBrushEngineProgramExtension, STUDIO_BRUSH_ENGINE_PROGRAM_STROKE_VERSION } from "../../../shared/lib/studio-brush-material-program-contract";
import {
  isStudioDynamicBrushMinimumDiameterRatio,
  studioDynamicBrushDepositPipelineUsesContinuation,
  STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4,
} from "../brush/studio-brush-dynamics";
import { serializeStudioBrushR8TextureGrainSourceCanonical } from "../brush/studio-brush-r8-grain-asset-contract";
import { isStudioInkPressureModel } from "../brush/studio-ink-pressure-model";
import { isStudioPaperSubstrateModel } from "../brush/studio-paper-substrate-model";
import { isStudioStrokePaintModelCompatible } from "../brush/studio-stroke-paint-model";
import {
  isStudioMaterialMinimumDiameterRatio,
  isStudioMaterialPressureModel,
} from "../studio-material-pressure-model";
import { normalizeStudioOutlineStrokeContract } from "../studio-outline-stroke-contract";
import {
  studioShared3dStageVisibilityOverlayElementIds,
} from "../studio-shared-3d-stage-collection";

import {
  STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION,
  STUDIO_CRDT_PAINT_STROKE_PAYLOAD_VERSION,
  studioCrdtStrokePayloadSupportsContinuation,
  isStudioCrdtStrokePayloadVersion,
  STUDIO_CRDT_TAPER_SPACING_STROKE_PAYLOAD_VERSION,
} from "./studio-crdt-protocol";
import {
  STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION,
  STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
  isStudioCrdtPayloadSceneElementType,
  isStudioCrdtTopologyReferencePayload,
  studioCrdtLayerGroupKey,
  validateStudioCrdtLayerGroupPayload,
  validateStudioCrdtSceneElementPayload,
  type StudioCrdtJsonObject,
  type StudioCrdtPayloadSceneElementType,
} from "./studio-crdt-scene-schema";
import { jsonObject, jsonValue } from "./studio-crdt-json-value";
import { StudioCrdtPageBridgeError } from "./studio-crdt-page-bridge-error";

import type {
  StudioCrdtLayerGroupInput,
  StudioCrdtLayerGroupRecord,
  StudioCrdtPageRecord,
  StudioCrdtSceneElementInput,
  StudioCrdtSceneElementRecord,
  StudioCrdtStrokeRecord,
} from "./studio-crdt-document";
import type { StudioCrdtCompatibleDrawElement } from "./studio-crdt-draw-bridge";

import {
  STUDIO_FILTER_MASK_REFERENCE_EDIT_KEYS,
  isStudioFilterMaskReferenceProps,
  isStudioFilterMaskSurfaceId,
} from "@/shared/lib/studio-filter-mask-surface-contract";
import { normalizeStudioInkInputContract } from "@/shared/lib/studio-ink-input-contract";
import {
  STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS,
  STUDIO_WORK_ASSET_TYPES,
  parseStudioWorkAssetSourceUri,
} from "@/shared/lib/studio-work-asset-contract";

export { StudioCrdtPageBridgeError, type StudioCrdtPageBridgeErrorCode } from "./studio-crdt-page-bridge-error";

export {
  isStudioCrdtPayloadSceneElementType,
  isStudioCrdtSceneElementType,
} from "./studio-crdt-scene-schema";
export {
  studioDrawElementSampleSlice,
  studioDrawElementToCrdtStroke,
} from "./studio-crdt-draw-bridge";
export type { StudioCrdtCompatibleDrawElement } from "./studio-crdt-draw-bridge";
export { studioPageToCrdtPage } from "./studio-crdt-page-payload";
export type { StudioCrdtCompatibleOrderedPage } from "./studio-crdt-page-payload";

const STUDIO_WORK_ASSET_TYPE_SET = new Set<string>(STUDIO_WORK_ASSET_TYPES);

export interface StudioCrdtCompatibleElement {
  id: string;
  type: string;
}

export interface StudioCrdtCompatiblePage<TElement extends StudioCrdtCompatibleElement> {
  id: string;
  elements: TElement[];
  bg3dLtBundles?: StudioBg3dSixPassBundleState;
}

export interface StudioCrdtCompatibleLayerGroup {
  id: string;
  name: string;
  hidden?: boolean;
  locked?: boolean;
  /** Local navigator state. This value is deliberately never serialized into CRDT. */
  collapsed?: boolean;
}

export interface StudioCrdtCompatibleSceneElement extends StudioCrdtCompatibleElement {
  type: StudioCrdtPayloadSceneElementType;
  groupId?: string;
  [key: string]: unknown;
}

export function isStudioCrdtWorkAssetElement(
  element: StudioCrdtCompatibleElement
): boolean {
  return STUDIO_WORK_ASSET_TYPE_SET.has(element.type);
}

export function isStudioCrdtAdmittedWorkAssetElement(
  element: StudioCrdtCompatibleElement
): boolean {
  if (!isStudioCrdtWorkAssetElement(element)) return false;
  const src = (element as StudioCrdtCompatibleElement & { src?: unknown }).src;
  if (typeof src !== "string") return false;
  const reference = parseStudioWorkAssetSourceUri(src);
  return reference?.assetId === element.id && reference.elementType === element.type;
}

const EXTENSION_KEYS = [
  "smartShape",
  // 스탬프 브러시 튜닝 — draw-bridge 의 쓰기 목록과 짝을 이루는 읽기 목록.
  "stamp",
  "stampPipeline",
  "watercolorPipeline",
  "name",
  "hidden",
  "locked",
  "noClip",
  "frameClipId",
  "lockAspect",
  "groupId",
  "clipBelow",
  "alphaLocked",
  "maskSrc",
  "maskEnabled",
  "layerRole",
  "layerColor",
  "emeresSourceId",
] as const;

function studioElementLayerId(element: StudioCrdtCompatibleElement): string {
  const groupId = (element as StudioCrdtCompatibleElement & { groupId?: unknown }).groupId;
  return typeof groupId === "string" && groupId.length > 0 ? groupId : "page-root";
}

function hasCanonicalRendererSignificantR8Grain(
  brushDynamics: StudioCrdtJsonObject | undefined,
): boolean {
  const grain = brushDynamics?.grain;
  if (!grain || typeof grain !== "object" || Array.isArray(grain)) return false;
  if (!Object.hasOwn(grain, "source") || grain.source == null) return false;
  const source = grain.source;
  const canonical = serializeStudioBrushR8TextureGrainSourceCanonical(source);
  if (canonical === null || canonical !== JSON.stringify(source)) {
    throw new StudioCrdtPageBridgeError("r8-grain-reference-invalid");
  }
  return true;
}

export function studioCrdtStrokeToDrawElement(
  record: StudioCrdtStrokeRecord
): StudioCrdtCompatibleDrawElement {
  const payload = record.payload;
  if (!isStudioCrdtStrokePayloadVersion(payload.version)) {
    throw new StudioCrdtPageBridgeError("stroke-payload-version-unsupported");
  }
  const extensions = payload.extensions ?? {};
  if (!hasValidStudioBrushEngineProgramExtension(payload.version, extensions.brushEnginePrograms)) {
    throw new StudioCrdtPageBridgeError("brush-program-version-incompatible");
  }
  if (!hasValidStudioLegacyPigmentArchiveStroke(payload)) {
    throw new StudioCrdtPageBridgeError("legacy-pigment-archive-invalid");
  }
  const result: StudioCrdtCompatibleDrawElement = projectStudioCrdtDrawStroke(record);
  for (const key of EXTENSION_KEYS) {
    const value = extensions[key];
    if (value !== undefined) Object.assign(result, { [key]: value });
  }
  if (extensions.brushEnginePrograms !== undefined) {
    result.brushEnginePrograms = structuredClone(extensions.brushEnginePrograms) as unknown as StudioBrushEngineProgramSet;
  }
  if (extensions.legacyPigmentArchive !== undefined) {
    result.legacyPigmentArchive = structuredClone(extensions.legacyPigmentArchive) as StudioCrdtCompatibleDrawElement["legacyPigmentArchive"];
  }
  const pressureModel = extensions.pressureModel;
  if (isStudioInkPressureModel(pressureModel)) result.pressureModel = pressureModel;
  const paperModel = extensions.paperModel;
  if (isStudioPaperSubstrateModel(paperModel)) result.paperModel = paperModel;
  if (extensions.outlineStroke !== undefined) {
    if (!studioCrdtStrokePayloadSupportsContinuation(payload.version)) {
      throw new StudioCrdtPageBridgeError("outline-stroke-version-incompatible");
    }
    const outlineStroke = normalizeStudioOutlineStrokeContract(
      extensions.outlineStroke,
    );
    if (!outlineStroke) {
      throw new StudioCrdtPageBridgeError("outline-stroke-invalid");
    }
    result.outlineStroke = outlineStroke;
  }
  if (extensions.inkInput !== undefined) {
    const inkInput = normalizeStudioInkInputContract(extensions.inkInput);
    if (!inkInput) {
      throw new StudioCrdtPageBridgeError("stroke-input-contract-invalid");
    }
    result.inkInput = inkInput;
  }
  if (
    payload.brushDynamics?.depositPipeline === STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4
    && payload.version !== STUDIO_CRDT_TAPER_SPACING_STROKE_PAYLOAD_VERSION
    && payload.version !== STUDIO_BRUSH_ENGINE_PROGRAM_STROKE_VERSION
    && payload.version !== STUDIO_LEGACY_PIGMENT_ARCHIVE_STROKE_VERSION
  ) {
    throw new StudioCrdtPageBridgeError("taper-spacing-version-required");
  }
  const dynamicMinimumDiameterRatio = payload.brushDynamics?.minimumDiameterRatio;
  if (
    dynamicMinimumDiameterRatio !== undefined
    && (
      (
        payload.version !== STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION
        && !studioCrdtStrokePayloadSupportsContinuation(payload.version)
      )
      || !isStudioDynamicBrushMinimumDiameterRatio(
        dynamicMinimumDiameterRatio,
      )
    )
  ) {
    throw new StudioCrdtPageBridgeError("dynamic-min-diameter-invalid");
  }
  if (
    studioDynamicBrushDepositPipelineUsesContinuation(
      payload.brushDynamics?.depositPipeline,
    )
    && !studioCrdtStrokePayloadSupportsContinuation(payload.version)
  ) {
    throw new StudioCrdtPageBridgeError("continuation-pipeline-version-incompatible");
  }
  if (
    hasCanonicalRendererSignificantR8Grain(payload.brushDynamics)
    && !studioCrdtStrokePayloadSupportsContinuation(payload.version)
  ) {
    throw new StudioCrdtPageBridgeError("r8-grain-version-incompatible");
  }
  const materialPressureModel = extensions.materialPressureModel;
  const materialMinimumDiameterRatio = extensions.materialMinimumDiameterRatio;
  const hasMaterialPressureSnapshot = materialPressureModel !== undefined || materialMinimumDiameterRatio !== undefined;
  if (
    hasMaterialPressureSnapshot
    && payload.version !== STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION
    && !studioCrdtStrokePayloadSupportsContinuation(payload.version)
  ) {
    throw new StudioCrdtPageBridgeError("material-pressure-version-incompatible");
  }
  if (
    hasMaterialPressureSnapshot
    && !isStudioMaterialPressureModel(materialPressureModel)
  ) {
    throw new StudioCrdtPageBridgeError("material-pressure-invalid");
  }
  if (
    hasMaterialPressureSnapshot
    && !isStudioMaterialMinimumDiameterRatio(materialMinimumDiameterRatio)
  ) {
    throw new StudioCrdtPageBridgeError("material-min-diameter-invalid");
  }
  if (hasMaterialPressureSnapshot) {
    result.materialPressureModel = materialPressureModel;
    result.materialMinimumDiameterRatio = materialMinimumDiameterRatio;
  }
  const paintModel = extensions.paintModel;
  const paintModelCandidate = { ...result, paintModel };
  if (
    (
      payload.version === STUDIO_CRDT_PAINT_STROKE_PAYLOAD_VERSION
      || payload.version === STUDIO_CRDT_MATERIAL_STROKE_PAYLOAD_VERSION
      || studioCrdtStrokePayloadSupportsContinuation(payload.version)
    )
    && isStudioStrokePaintModelCompatible(paintModelCandidate)
  ) {
    result.paintModel = paintModelCandidate.paintModel;
  }
  if (!result.groupId && record.layerId !== "page-root") result.groupId = record.layerId;
  return result;
}

export function studioSceneElementToCrdtElement(
  pageId: string,
  element: StudioCrdtCompatibleSceneElement
): StudioCrdtSceneElementInput {
  if (!isStudioCrdtPayloadSceneElementType(element.type)) {
    throw new StudioCrdtPageBridgeError("element-type-unsupported", { elementType: element.type });
  }
  const propsSource: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(element)) {
    if (key === "id" || key === "type" || value === undefined) continue;
    propsSource[key] = value;
  }
  const props = jsonObject(propsSource) ?? {};
  const payload = validateStudioCrdtSceneElementPayload({
    version: STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
    type: element.type,
    props,
  });
  return {
    id: element.id,
    pageId,
    layerId: studioElementLayerId(element),
    payload,
  };
}

/**
 * Encodes every non-draw Studio element into the shared scene topology. Rich vector objects keep
 * their field-editable payload; asset-backed and future objects use a wire-only `reference`
 * envelope so large image/VRM/3D sources never enter a realtime operation.
 */
export function studioElementToCrdtSceneElement(
  pageId: string,
  element: StudioCrdtCompatibleElement
): StudioCrdtSceneElementInput {
  if (element.type === "draw") {
    throw new StudioCrdtPageBridgeError("draw-element-stroke-sync-required");
  }
  if (isStudioCrdtPayloadSceneElementType(element.type)) {
    return studioSceneElementToCrdtElement(
      pageId,
      element as StudioCrdtCompatibleSceneElement
    );
  }
  const props: StudioCrdtJsonObject = { elementType: element.type };
  const source = element as StudioCrdtCompatibleElement & Record<string, unknown>;
  if (source.frameClipId !== undefined) {
    if (typeof source.frameClipId !== "string" || !source.frameClipId || source.frameClipId.length > 160 || /\p{Cc}/u.test(source.frameClipId)) throw new Error("원고 컷 클립 ID가 올바르지 않습니다.");
    props.frameClipId = source.frameClipId;
  }
  const bundle = element.type === "image" && source.bg3dLtBundleReference !== undefined;
  if (bundle) {
    for (const key of STUDIO_CRDT_BG3D_IMAGE_KEYS) {
      const normalized = jsonValue(source[key]); if (normalized !== undefined) props[key] = normalized;
    }
    validateStudioCrdtBg3dImageReference(props);
  }
  if (bundle || isStudioCrdtAdmittedWorkAssetElement(element)) {
    for (const key of STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS) {
      const normalized = jsonValue(source[key]);
      if (normalized !== undefined) props[key] = normalized;
    }
  }
  // A local image/VRM body remains topology-only, but its ordinary visibility scalar is safe and
  // required for Shared Stage's receipt-derived visibility overlay to disappear on unlink.
  if (
    element.type === "image"
    && source.hidden !== undefined
    && typeof source.hidden === "boolean"
  ) {
    props.hidden = source.hidden;
  }
  if (source.filterMaskSurfaceId !== undefined && element.type !== "image") {
    throw new StudioCrdtPageBridgeError("filter-mask-non-image-reference");
  }
  if (element.type === "image" && source.filterMaskSurfaceId !== undefined) {
    if (!isStudioFilterMaskSurfaceId(source.filterMaskSurfaceId)) {
      throw new StudioCrdtPageBridgeError("filter-mask-surface-id-invalid");
    }
    const filterMaskProps: StudioCrdtJsonObject = {
      filterMaskSurfaceId: source.filterMaskSurfaceId,
    };
    if (source.filterMaskEnabled !== undefined) {
      filterMaskProps.filterMaskEnabled = jsonValue(source.filterMaskEnabled)!;
    }
    if (!isStudioFilterMaskReferenceProps(filterMaskProps)) {
      throw new StudioCrdtPageBridgeError("filter-mask-surface-state-invalid");
    }
    for (const key of STUDIO_FILTER_MASK_REFERENCE_EDIT_KEYS) {
      if (Object.hasOwn(filterMaskProps, key)) props[key] = filterMaskProps[key]!;
    }
  }
  return {
    id: element.id,
    pageId,
    layerId: studioElementLayerId(element),
    payload: validateStudioCrdtSceneElementPayload({
      version: STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
      type: "reference",
      props,
    }),
  };
}

export function studioCrdtElementToSceneElement<
  TElement extends StudioCrdtCompatibleElement = StudioCrdtCompatibleSceneElement,
>(
  record: StudioCrdtSceneElementRecord,
  referenceSource?: TElement
): StudioCrdtCompatibleSceneElement | TElement {
  if (record.payload.type === "reference") {
    const elementType = record.payload.props.elementType;
    if (
      !referenceSource || referenceSource.id !== record.id ||
      referenceSource.type !== elementType
    ) {
      throw new StudioCrdtPageBridgeError("reference-source-missing");
    }
  }
  return projectStudioCrdtSceneElement(record, referenceSource) as StudioCrdtCompatibleSceneElement | TElement;
}

export function studioLayerGroupToCrdtGroup(
  pageId: string,
  group: StudioCrdtCompatibleLayerGroup
): StudioCrdtLayerGroupInput {
  const props: StudioCrdtJsonObject = { name: group.name };
  if (group.hidden !== undefined) props.hidden = group.hidden;
  if (group.locked !== undefined) props.locked = group.locked;
  return {
    id: group.id,
    pageId,
    payload: validateStudioCrdtLayerGroupPayload({
      version: STUDIO_CRDT_LAYER_GROUP_PAYLOAD_VERSION,
      props,
    }),
  };
}

export function studioCrdtGroupToLayerGroup(
  record: StudioCrdtLayerGroupRecord,
  collapsed?: boolean
): StudioCrdtCompatibleLayerGroup {
  return projectStudioCrdtLayerGroup(record, collapsed);
}

export type { StudioCrdtPageReconcileResult, StudioCrdtSceneGraphAuthority } from "@toonstudio/contracts/studio-crdt-authoring";

// 검증은 이 경계에 남기고, 브라우저·서버의 원고 병합은 같은 순수 구현을 사용한다.
export const { reconcileStudioCrdtPages, reconcileStudioCrdtSceneGraphPages } = createStudioCrdtPageReconciler<
  StudioCrdtStrokeRecord, StudioCrdtSceneElementRecord, StudioCrdtPageRecord, StudioCrdtLayerGroupRecord
>({
  studioCrdtStrokeToDrawElement,
  studioCrdtElementToSceneElement,
  studioCrdtGroupToLayerGroup,
  studioCrdtLayerGroupKey,
  isStudioCrdtTopologyReferencePayload,
  isStudioCrdtAdmittedWorkAssetElement,
  studioShared3dStageVisibilityOverlayElementIds,
  workAssetTypes: STUDIO_WORK_ASSET_TYPES,
});
