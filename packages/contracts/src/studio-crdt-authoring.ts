import { isAdmittedStudioCrdtProjectionAsset, isStudioCrdtProjectionTopologyReference, projectStudioCrdtSceneElement, projectStudioCrdtLayerGroup, projectValidatedStudioCrdtDrawStroke, studioCrdtProjectionGroupKey, type StudioCrdtProjectedElement } from "./studio-crdt-authoring/element-projection";
import { createStudioCrdtPageReconciler, type StudioCrdtCompatibleElement, type StudioCrdtCompatibleOrderedPage, type StudioCrdtAuthoringSceneRecord, type StudioCrdtAuthoringPageRecord, type StudioCrdtAuthoringGroupRecord } from "./studio-crdt-authoring/page-reconcile";
import { decodeValidatedStudioCrdtAuthoring, authoringId, authoringRecord, type StudioCrdtDecodedStroke } from "./studio-crdt-authoring/raw-reader";
import { readValidatedStudioCrdtSharedStagePages, validatedStudioSharedStageOverlay } from "./studio-crdt-authoring/shared-stage-projection";
import { STUDIO_WORK_ASSET_TYPES } from "./studio-work-asset-contract";

import type * as Y from "yjs";

export { createStudioCrdtPageReconciler } from "./studio-crdt-authoring/page-reconcile";
export type { StudioCrdtPageReconcileResult, StudioCrdtSceneGraphAuthority } from "./studio-crdt-authoring/page-reconcile";
export { projectStudioCrdtDrawStroke, projectStudioCrdtSceneElement, projectStudioCrdtLayerGroup, studioCrdtProjectionGroupKey } from "./studio-crdt-authoring/element-projection";

export interface StudioCrdtAuthoringMaterializeInput {
  /** 실제 저장된 전체 Authoring 원고. 원본 자산·VRM·3D 본문은 이 baseline이 소유한다. */
  readonly baseline: unknown;
  /** 호출자는 전체 root/schema/brush/raster/3D 의미 검증과 causal 검사를 먼저 통과시켜야 한다. */
  readonly doc: Y.Doc;
  readonly referenceSources?: ReadonlyMap<string, StudioCrdtCompatibleElement>;
}
export interface StudioCrdtScopedRecord {
  readonly kind: "element" | "stroke" | "group";
  readonly id: string; readonly pageId: string; readonly layerId: string; readonly deleted: boolean;
  readonly value: Readonly<Record<string, unknown>>; readonly raw: unknown;
  /** topology-only tombstone의 본문이 baseline에도 없으면 원래 알 수 없는 필드를 추정하지 않는다. */
  readonly unresolved?: boolean;
}
type AuthoringPage = StudioCrdtCompatibleOrderedPage<StudioCrdtProjectedElement> & Record<string, unknown>;

const { reconcileStudioCrdtSceneGraphPages } = createStudioCrdtPageReconciler<StudioCrdtDecodedStroke, StudioCrdtAuthoringSceneRecord, StudioCrdtAuthoringPageRecord, StudioCrdtAuthoringGroupRecord>({
  studioCrdtStrokeToDrawElement: projectValidatedStudioCrdtDrawStroke,
  studioCrdtElementToSceneElement: projectStudioCrdtSceneElement,
  studioCrdtGroupToLayerGroup: projectStudioCrdtLayerGroup,
  studioCrdtLayerGroupKey: studioCrdtProjectionGroupKey,
  isStudioCrdtTopologyReferencePayload: isStudioCrdtProjectionTopologyReference,
  isStudioCrdtAdmittedWorkAssetElement: isAdmittedStudioCrdtProjectionAsset,
  studioShared3dStageVisibilityOverlayElementIds: validatedStudioSharedStageOverlay,
  workAssetTypes: STUDIO_WORK_ASSET_TYPES,
});

function baselinePages(baseline: unknown): { document: Record<string, unknown>; pages: AuthoringPage[]; sources: ReadonlyMap<string, StudioCrdtProjectedElement> } {
  const document = authoringRecord(baseline);
  if (!Array.isArray(document.pagesList)) throw new Error("저장 원고의 pagesList가 없습니다.");
  const pageIds = new Set<string>(), sources = new Map<string, StudioCrdtProjectedElement>();
  const pages = document.pagesList.map((raw) => {
    const page = authoringRecord(raw), id = authoringId(page.id);
    if (pageIds.has(id) || !Array.isArray(page.elements) || (page.groups !== undefined && !Array.isArray(page.groups))) throw new Error("저장 원고 페이지가 중복되거나 불완전합니다.");
    pageIds.add(id);
    const elements = page.elements.map((value) => {
      const element = authoringRecord(value), elementId = authoringId(element.id);
      if (typeof element.type !== "string" || !element.type || sources.has(elementId)) throw new Error("원본 원고 요소가 중복되거나 불완전합니다.");
      const result: StudioCrdtProjectedElement = { ...element, id: elementId, type: element.type }; sources.set(elementId, result); return result;
    });
    return { ...page, id, elements } as AuthoringPage;
  });
  return { document, pages, sources };
}

/**
 * 최신 durable Y를 원래 Authoring 원고에 반영한다. 픽셀 의미 검증을 대신하지 않는다.
 * 순서·삭제·unset·원본 자산 보존은 Web과 같은 공용 병합 알고리즘을 사용한다.
 * body가 없는 활성 참조는 삭제하거나 빈 객체로 바꾸지 않고 호출 전체를 거절한다.
 */
export function materializeStudioAuthoringFromCrdt(input: StudioCrdtAuthoringMaterializeInput): unknown {
  const { document, pages, sources } = baselinePages(input.baseline), records = decodeValidatedStudioCrdtAuthoring(input.doc);
  for (const record of records.sceneElements) {
    if (record.deleted || record.payload.type !== "reference") continue;
    const source = input.referenceSources?.get(record.id) ?? sources.get(record.id);
    if (!source || source.type !== record.payload.props.elementType) throw new Error("활성 원고 자산의 원본 본문을 불러올 수 없습니다.");
    if (!isStudioCrdtProjectionTopologyReference(record.payload) && !isAdmittedStudioCrdtProjectionAsset(source)) throw new Error("활성 원고 자산의 승인된 원본을 확인할 수 없습니다.");
  }
  const stages = new Map(readValidatedStudioCrdtSharedStagePages(input.doc).map((entry) => [entry.pageId, entry]));
  const pageRecords = records.pages.map((record) => {
    const state = stages.get(record.id);
    return state ? { ...record, shared3dStageManaged: state.managed, shared3dStage: state.value } : record;
  });
  const result = reconcileStudioCrdtSceneGraphPages(pages, records.strokes, records.sceneElements, pageRecords, records.groups, undefined, input.referenceSources);
  return { ...document, pagesList: result.pages };
}

/** 검증 전용 이력 투영이다. 삭제된 객체를 없애거나 새 ID로 바꾸지 않는다. */
export function readStudioCrdtScopedRecords(input: StudioCrdtAuthoringMaterializeInput): readonly StudioCrdtScopedRecord[] {
  const { sources } = baselinePages(input.baseline), records = decodeValidatedStudioCrdtAuthoring(input.doc);
  const result: StudioCrdtScopedRecord[] = records.strokes.map((record) => ({
    kind: "stroke", id: record.id, pageId: record.pageId, layerId: record.layerId, deleted: record.deleted,
    value: projectValidatedStudioCrdtDrawStroke(record), raw: records.rawByEntity.get(`stroke:${record.id}`),
  }));
  for (const record of records.sceneElements) {
    const source = input.referenceSources?.get(record.id) ?? sources.get(record.id), reference = record.payload.type === "reference";
    const unresolved = reference && (!source || source.type !== record.payload.props.elementType);
    const value = unresolved ? { ...record.payload.props, id: record.id, type: String(record.payload.props.elementType),
      ...(record.layerId !== "page-root" ? { groupId: record.layerId } : {}) } : projectStudioCrdtSceneElement(record, source);
    result.push({ kind: "element", id: record.id, pageId: record.pageId, layerId: record.layerId, deleted: record.deleted, value,
      raw: records.rawByEntity.get(`element:${record.id}`), ...(unresolved ? { unresolved: true } : {}) });
  }
  for (const record of records.groups) result.push({ kind: "group", id: record.id, pageId: record.pageId, layerId: record.id, deleted: record.deleted,
    value: projectStudioCrdtLayerGroup(record), raw: records.rawByEntity.get(`group:${studioCrdtProjectionGroupKey(record.pageId, record.id)}`) });
  return result;
}
