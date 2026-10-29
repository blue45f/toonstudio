/** 브라우저와 서버가 같은 순서·삭제·원본 자산 보존 규칙을 사용한다. 의미 검증은 각 admission 경계가 소유한다. */
export interface StudioCrdtCompatibleElement { id: string; type: string }
export interface StudioCrdtCompatibleLayerGroup { id: string; name: string; hidden?: boolean; locked?: boolean; collapsed?: boolean }
export interface StudioCrdtCompatibleOrderedPage<T extends StudioCrdtCompatibleElement> {
  id: string; elements: T[]; groups?: StudioCrdtCompatibleLayerGroup[];
}
export interface StudioCrdtAuthoringRecord { id: string; pageId: string; layerId: string; deleted: boolean; orderIndex: number; payload: object }
export interface StudioCrdtAuthoringSceneRecord extends StudioCrdtAuthoringRecord {
  payload: { type: string; props: Record<string, unknown> };
}
export interface StudioCrdtAuthoringPageRecord {
  id: string; deleted: boolean; orderIndex: number; payload: { props: Record<string, unknown> };
  shared3dStageManaged?: boolean; shared3dStage?: unknown;
}
export interface StudioCrdtAuthoringGroupRecord {
  id: string; pageId: string; deleted: boolean;
  payload: { props: Record<string, unknown> };
}
export interface StudioCrdtPageReconcileResult<TPage> { pages: TPage[]; changed: boolean }
export interface StudioCrdtSceneGraphAuthority {
  strokeIds: ReadonlySet<string>; sceneElementIds: ReadonlySet<string>;
  pageIds: ReadonlySet<string>; layerGroupIds: ReadonlySet<string>;
}

/** 픽셀 의미 검증·자산 hydration은 주입하고, 원고 병합 알고리즘은 한 구현으로 유지한다. */
export function createStudioCrdtPageReconciler<
  Stroke extends StudioCrdtAuthoringRecord,
  Scene extends StudioCrdtAuthoringSceneRecord,
  Page extends StudioCrdtAuthoringPageRecord,
  Group extends StudioCrdtAuthoringGroupRecord,
>(ports: {
  studioCrdtStrokeToDrawElement(record: Stroke): StudioCrdtCompatibleElement;
  studioCrdtElementToSceneElement(record: Scene, source?: StudioCrdtCompatibleElement): StudioCrdtCompatibleElement;
  studioCrdtGroupToLayerGroup(record: Group, collapsed?: boolean): StudioCrdtCompatibleLayerGroup;
  studioCrdtLayerGroupKey(pageId: string, groupId: string): string;
  isStudioCrdtTopologyReferencePayload(payload: Scene["payload"]): boolean;
  isStudioCrdtAdmittedWorkAssetElement(element: StudioCrdtCompatibleElement): boolean;
  studioShared3dStageVisibilityOverlayElementIds(value: unknown, elements: readonly StudioCrdtCompatibleElement[]): ReadonlySet<string>;
  workAssetTypes: readonly string[];
}) {
  const {
    studioCrdtStrokeToDrawElement, studioCrdtElementToSceneElement, studioCrdtGroupToLayerGroup,
    studioCrdtLayerGroupKey, isStudioCrdtTopologyReferencePayload,
    isStudioCrdtAdmittedWorkAssetElement, studioShared3dStageVisibilityOverlayElementIds,
  } = ports;
  const STUDIO_WORK_ASSET_TYPE_SET = new Set<string>(ports.workAssetTypes);
  type StudioCrdtStrokeRecord = Stroke;
  type StudioCrdtSceneElementRecord = Scene;
  type StudioCrdtPageRecord = Page;
  type StudioCrdtLayerGroupRecord = Group;
  type StudioCrdtCompatibleDrawElement = StudioCrdtCompatibleElement;
  type StudioShared3dStagePersistedState = unknown;
/**
 * The converged group membership of a CRDT-managed element is a pure function of its record's
 * page/layer plus the currently reachable group keys — never of the element body. Materialization
 * reuse below depends on that: only this verdict has to be recomputed when a group appears or is
 * tombstoned, even if the element itself was untouched.
 */
function resolveConvergedGroupId(
  pageId: string,
  layerId: string,
  availableGroupKeys: ReadonlySet<string>
): string | null {
  try {
    return layerId !== "page-root" &&
      availableGroupKeys.has(studioCrdtLayerGroupKey(pageId, layerId))
      ? layerId
      : null;
  } catch {
    // Invalid/reserved layer identifiers converge to the page root.
    return null;
  }
}

function withConvergedGroupId<TElement extends StudioCrdtCompatibleElement>(
  element: TElement,
  groupId: string | null
): TElement {
  const next = { ...element } as TElement & { groupId?: string };
  if (groupId === null) delete next.groupId;
  else next.groupId = groupId;
  return next;
}

interface StudioCrdtMaterializedElementEntry {
  id: string;
  pageId: string;
  layerId: string;
  /** Only `reference` scene payloads read the local source; strokes/field payloads pass undefined. */
  source: unknown;
  groupId: string | null;
  element: unknown;
}

/**
 * Materialization memo keyed by the *record payload object itself*.
 *
 * `StudioCrdtDocument` decodes each record once, `deepFreeze`s it, and hands the very same frozen
 * payload object out of `getStrokes()`/`getSceneElements()` until a transaction touches that record
 * — at which point the cache is re-decoded into a brand new object. Payload identity is therefore
 * already the document's own "this record did not change" signal; the record cache relies on that
 * exact immutability for its own correctness. Reusing it here adds no new assumption, and it is
 * conservative in the only direction that matters: an unrecognized or mutable payload simply
 * rebuilds, exactly like today.
 *
 * A WeakMap keeps the memo bounded — a superseded payload becomes unreachable with its record.
 */
const STUDIO_CRDT_MATERIALIZED_ELEMENTS =
  new WeakMap<object, StudioCrdtMaterializedElementEntry>();

/**
 * Frozen payload + frozen direct children. `deepFreeze` guarantees both; anything looser (a
 * hand-built record in a test, a future decoder that forgets to freeze) fails this gate and is
 * rebuilt from scratch. Cost is one pass over the payload's own keys — negligible next to copying
 * `points` and eleven parallel sample channels.
 */
function isStableCrdtPayload(payload: object): boolean {
  if (!Object.isFrozen(payload)) return false;
  for (const value of Object.values(payload)) {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) return false;
  }
  return true;
}

/**
 * Returns the converged element for an authoritative record, reusing the previously materialized
 * object whenever the record demonstrably did not change.
 *
 * Reuse requires all of: the same frozen payload object, the same record identity/page/layer, and
 * the same reference source. The source test accepts either the exact object the entry was built
 * from or the entry's own output — `studioCrdtElementToSceneElement` is idempotent over its own
 * result (it re-applies the same reference props, id, type and src onto a spread of the source),
 * so a page whose element is already our previous output converges instead of oscillating.
 *
 * Group membership is the one thing allowed to change without a rebuild: when only the verdict
 * moved, the cached body is re-converged, so a remote group create/tombstone still lands on an
 * otherwise untouched element.
 */
function materializeConvergedCrdtElement<TElement extends StudioCrdtCompatibleElement>(
  payload: object,
  id: string,
  pageId: string,
  layerId: string,
  source: unknown,
  availableGroupKeys: ReadonlySet<string>,
  build: () => TElement
): TElement {
  const groupId = resolveConvergedGroupId(pageId, layerId, availableGroupKeys);
  if (!isStableCrdtPayload(payload)) return withConvergedGroupId(build(), groupId);
  const cached = STUDIO_CRDT_MATERIALIZED_ELEMENTS.get(payload);
  if (
    cached && cached.id === id && cached.pageId === pageId && cached.layerId === layerId &&
    (cached.source === source || cached.element === source)
  ) {
    if (cached.groupId === groupId) return cached.element as TElement;
    const regrouped = withConvergedGroupId(cached.element as TElement, groupId);
    STUDIO_CRDT_MATERIALIZED_ELEMENTS.set(payload, { ...cached, groupId, element: regrouped });
    return regrouped;
  }
  const element = withConvergedGroupId(build(), groupId);
  STUDIO_CRDT_MATERIALIZED_ELEMENTS.set(payload, {
    id,
    pageId,
    layerId,
    source,
    groupId,
    element,
  });
  return element;
}

/**
 * Replaces only IDs owned by the CRDT document. Legacy/non-drawing elements remain untouched.
 * Existing CRDT slots are filled in deterministic Yjs order so eraser/pen compositing converges,
 * while non-CRDT layer positions are preserved as far as the existing slot count permits.
 */
const STUDIO_CRDT_HISTORY_STROKES = new WeakMap<object, {
  id: string;
  pageId: string;
  layerId: string;
  element: StudioCrdtCompatibleDrawElement;
}>();

function sameOwnValues(left: object, right: object): boolean {
  const entries = Object.entries(left);
  return entries.length === Object.keys(right).length
    && entries.every(([key, value]) => Object.hasOwn(right, key) && value === Reflect.get(right, key));
}

// 불변 CRDT 페이로드 하나를 이력 단계마다 복제하지 않는다. 변경된 페이로드는 새 객체이므로
// 예전 이력과 채널을 혼동하지 않으며, 외부에서 전달한 가변 레코드는 기존 변환을 유지한다.
function materializeHistoryStroke(record: StudioCrdtStrokeRecord): StudioCrdtCompatibleDrawElement {
  if (!isStableCrdtPayload(record.payload)) return studioCrdtStrokeToDrawElement(record);
  const cached = STUDIO_CRDT_HISTORY_STROKES.get(record.payload);
  if (cached?.id === record.id && cached.pageId === record.pageId && cached.layerId === record.layerId) {
    return cached.element;
  }
  const element = studioCrdtStrokeToDrawElement(record);
  STUDIO_CRDT_HISTORY_STROKES.set(record.payload, {
    id: record.id, pageId: record.pageId, layerId: record.layerId, element,
  });
  return element;
}

function reconcileStudioCrdtPages<
  TElement extends StudioCrdtCompatibleElement,
  TPage extends StudioCrdtCompatiblePage<TElement>,
>(pages: readonly TPage[], records: readonly StudioCrdtStrokeRecord[]): StudioCrdtPageReconcileResult<TPage> {
  const managedIds = new Set(records.map((record) => record.id));
  const activeByPage = new Map<string, StudioCrdtStrokeRecord[]>();
  for (const record of records) {
    if (record.deleted) continue;
    const bucket = activeByPage.get(record.pageId) ?? [];
    bucket.push(record);
    activeByPage.set(record.pageId, bucket);
  }
  let changed = false;
  const nextPages = pages.map((page) => {
    const active = activeByPage.get(page.id) ?? [];
    let cursor = 0;
    const nextElements: TElement[] = [];
    for (const element of page.elements) {
      if (!managedIds.has(element.id)) {
        nextElements.push(element);
        continue;
      }
      const replacement = active[cursor++];
      if (replacement) {
        nextElements.push(materializeHistoryStroke(replacement) as unknown as TElement);
      }
    }
    while (cursor < active.length) {
      nextElements.push(
        materializeHistoryStroke(active[cursor++]!) as unknown as TElement
      );
    }
    const pageChanged = nextElements.length !== page.elements.length
      || nextElements.some((element, index) => element !== page.elements[index]);
    if (!pageChanged) return page;
    changed = true;
    return { ...page, elements: nextElements };
  });
  return { pages: changed ? nextPages : [...pages], changed };
}

/**
 * Phase-2 scene graph reconciliation. Draw and non-raster objects share the physical legacy
 * `stroke-order` Y.Array, so their `orderIndex` values form one mixed z-order. Only IDs present in
 * the supplied durable records are authoritative; legacy pages/elements remain in their slots.
 */
function reconcileStudioCrdtSceneGraphPages<
  TElement extends StudioCrdtCompatibleElement,
  TPage extends StudioCrdtCompatibleOrderedPage<TElement>,
>(
  pages: readonly TPage[],
  strokes: readonly StudioCrdtStrokeRecord[],
  sceneElements: readonly StudioCrdtSceneElementRecord[],
  pageRecords: readonly StudioCrdtPageRecord[],
  layerGroupRecords: readonly StudioCrdtLayerGroupRecord[] = [],
  authority?: StudioCrdtSceneGraphAuthority,
  referenceSources?: ReadonlyMap<string, TElement>
): StudioCrdtPageReconcileResult<TPage> {
  const sourcePageById = new Map(pages.map((page) => [page.id, page]));
  const materializePage = (record: StudioCrdtPageRecord): TPage => {
    const source = sourcePageById.get(record.id);
    const materialized = {
      ...(source ?? { id: record.id, elements: [] }),
      ...record.payload.props,
      id: record.id,
      elements: source?.elements ?? [],
    } as TPage & { shared3dStage?: StudioShared3dStagePersistedState };
    // An absent synchronized preset field is authoritative too, including remote removal.
    if (!Object.hasOwn(record.payload.props, "layerComps")) delete materialized.layerComps;
    if (!Object.hasOwn(record.payload.props, "colorProof")) delete materialized.colorProof;
    // Shared Stage state deliberately lives outside the bounded page envelope. A retained
    // inactive sidecar is authoritative too: it must remove a stale local connection instead of
    // allowing the source snapshot's optional property to survive the spread above.
    if (record.shared3dStageManaged) {
      if (record.shared3dStage === undefined) delete materialized.shared3dStage;
      else materialized.shared3dStage = record.shared3dStage;
    }
    return source && sameOwnValues(source, materialized) ? source : materialized;
  };

  const managedPageIds = new Set<string>();
  const activePages: Array<{ id: string; orderIndex: number; page: TPage }> = [];
  for (const record of pageRecords) {
    const authoritative = authority === undefined || authority.pageIds.has(record.id);
    if (authoritative) {
      managedPageIds.add(record.id);
      if (!record.deleted) {
        activePages.push({ id: record.id, orderIndex: record.orderIndex, page: materializePage(record) });
      }
      continue;
    }
    const source = sourcePageById.get(record.id);
    if (!source) continue;
    managedPageIds.add(record.id);
    activePages.push({ id: record.id, orderIndex: record.orderIndex, page: source });
  }
  activePages.sort(
    (left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id)
  );

  let pageCursor = 0;
  const orderedPages: TPage[] = [];
  for (const page of pages) {
    if (!managedPageIds.has(page.id)) {
      orderedPages.push(page);
      continue;
    }
    const replacement = activePages[pageCursor++];
    if (replacement) orderedPages.push(replacement.page);
  }
  while (pageCursor < activePages.length) {
    orderedPages.push(activePages[pageCursor++]!.page);
  }
  const topologyChanged = orderedPages.length !== pages.length
    || orderedPages.some((page, index) => page !== pages[index]);

  const pageIdSet = new Set(orderedPages.map((page) => page.id));
  const sourceGroupByKey = new Map<string, {
    pageId: string;
    group: StudioCrdtCompatibleLayerGroup;
  }>();
  for (const page of orderedPages) {
    for (const group of page.groups ?? []) {
      let key: string;
      try {
        key = studioCrdtLayerGroupKey(page.id, group.id);
      } catch {
        continue;
      }
      if (!sourceGroupByKey.has(key)) sourceGroupByKey.set(key, { pageId: page.id, group });
    }
  }
  const managedGroupIds = new Set<string>();
  const activeGroupsByPage = new Map<string, StudioCrdtCompatibleLayerGroup[]>();
  for (const record of layerGroupRecords) {
    let key: string;
    try {
      key = studioCrdtLayerGroupKey(record.pageId, record.id);
    } catch {
      continue;
    }
    const authoritative = authority === undefined || authority.layerGroupIds.has(key);
    if (authoritative) managedGroupIds.add(key);
    const source = sourceGroupByKey.get(key);
    if (!authoritative && !source) continue;
    if (!authoritative) managedGroupIds.add(key);
    if (authoritative && record.deleted) continue;
    const pageId = authoritative ? record.pageId : source!.pageId;
    if (!pageIdSet.has(pageId)) continue;
    const group = authoritative
      ? studioCrdtGroupToLayerGroup(record, source?.group.collapsed)
      : source!.group;
    const bucket = activeGroupsByPage.get(pageId) ?? [];
    bucket.push(group);
    activeGroupsByPage.set(pageId, bucket);
  }

  // Unmanaged legacy groups stay usable until their first real group operation materializes a
  // CRDT record. A managed tombstone or page reparent, however, immediately removes the old slot.
  const availableGroupKeys = new Set<string>();
  for (const [key] of sourceGroupByKey) {
    if (!managedGroupIds.has(key)) availableGroupKeys.add(key);
  }
  for (const [pageId, groups] of activeGroupsByPage) {
    for (const group of groups) availableGroupKeys.add(studioCrdtLayerGroupKey(pageId, group.id));
  }

  // Resolve topology-only asset references from the pre-reconciliation project snapshot. A page
  // tombstone can concurrently win while one of its assets is moved to a surviving page; building
  // this registry from `orderedPages` would discard the only local image/VRM/3D body before the
  // authoritative reference record gets a chance to reparent it.
  const sourceElementById = new Map<string, { pageId: string; element: TElement }>();
  for (const page of pages) {
    for (const element of page.elements) sourceElementById.set(element.id, { pageId: page.id, element });
  }
  const managedElementIds = new Set<string>();
  const activeByPage = new Map<string, Array<{
    id: string;
    orderIndex: number;
    element: TElement;
  }>>();
  for (const record of strokes) {
    const authoritative = authority === undefined || authority.strokeIds.has(record.id);
    if (authoritative) managedElementIds.add(record.id);
    const source = sourceElementById.get(record.id);
    if (!authoritative && !source) continue;
    if (!authoritative) managedElementIds.add(record.id);
    if (authoritative && record.deleted) continue;
    const pageId = authoritative ? record.pageId : source!.pageId;
    const bucket = activeByPage.get(pageId) ?? [];
    bucket.push({
      id: record.id,
      orderIndex: record.orderIndex,
      element: authoritative
        ? materializeConvergedCrdtElement(
          record.payload,
          record.id,
          record.pageId,
          record.layerId,
          // studioCrdtStrokeToDrawElement reads only the record, never a local source.
          undefined,
          availableGroupKeys,
          () => studioCrdtStrokeToDrawElement(record) as unknown as TElement
        )
        : source!.element,
    });
    activeByPage.set(pageId, bucket);
  }
  for (const record of sceneElements) {
    const authoritative = authority === undefined || authority.sceneElementIds.has(record.id);
    if (authoritative) managedElementIds.add(record.id);
    const localSource = sourceElementById.get(record.id);
    const expectedReferenceType =
      record.payload.type === "reference" &&
      typeof record.payload.props.elementType === "string"
        ? record.payload.props.elementType
        : null;
    const topologyReference = record.payload.type === "reference" &&
      isStudioCrdtTopologyReferencePayload(record.payload);
    const canonicalLocalSource =
      expectedReferenceType &&
      localSource?.element.id === record.id && localSource.element.type === expectedReferenceType &&
      (topologyReference || (
        STUDIO_WORK_ASSET_TYPE_SET.has(expectedReferenceType) &&
        isStudioCrdtAdmittedWorkAssetElement(localSource.element)
      ))
        ? localSource
        : undefined;
    const hydratedSource = authoritative && expectedReferenceType && !topologyReference
      ? referenceSources?.get(record.id)
      : undefined;
    const exactHydratedSource =
      hydratedSource?.id === record.id &&
      hydratedSource.type === expectedReferenceType
        ? hydratedSource
        : undefined;
    const source = record.payload.type !== "reference"
      ? localSource
      : exactHydratedSource
        ? {
            pageId: record.pageId,
            // Keep rich local-only editing metadata where it exists, but let the admitted server
            // descriptor provide the durable fallback. The exact local stable element may add rich
            // editing metadata, and studioCrdtElementToSceneElement applies realtime reference props
            // last so immutable upload geometry can never reset a collaborator's later move — and
            // deletes allowlisted keys absent from the envelope, so a stale descriptor or local
            // effect merged here cannot outlive a remote removal.
            element: {
              ...exactHydratedSource,
              ...(canonicalLocalSource?.element ?? {}),
            } as TElement,
          }
        : canonicalLocalSource;
    if (!authoritative && !source) continue;
    if (!authoritative) managedElementIds.add(record.id);
    if (authoritative && record.deleted) continue;
    if (
      authoritative && record.payload.type === "reference" &&
      (!source || source.element.type !== record.payload.props.elementType)
    ) {
      // A topology-only record cannot invent or replace an asset payload. Keep the ID managed so
      // a mismatched stale snapshot is removed, but fail closed until project hydration supplies
      // the exact authored source object.
      continue;
    }
    const pageId = authoritative ? record.pageId : source!.pageId;
    const bucket = activeByPage.get(pageId) ?? [];
    bucket.push({
      id: record.id,
      orderIndex: record.orderIndex,
      element: authoritative
        ? materializeConvergedCrdtElement(
          record.payload,
          record.id,
          record.pageId,
          record.layerId,
          source?.element,
          availableGroupKeys,
          () => studioCrdtElementToSceneElement(record, source?.element) as TElement
        )
        : source!.element,
    });
    activeByPage.set(pageId, bucket);
  }
  for (const bucket of activeByPage.values()) {
    bucket.sort(
      (left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id)
    );
  }

  let elementChanged = false;
  const elementPages = orderedPages.map((page) => {
    const active = activeByPage.get(page.id) ?? [];
    let cursor = 0;
    const nextElements: TElement[] = [];
    for (const element of page.elements) {
      if (!managedElementIds.has(element.id)) {
        nextElements.push(element);
        continue;
      }
      const replacement = active[cursor++];
      if (replacement) nextElements.push(replacement.element);
    }
    while (cursor < active.length) {
      nextElements.push(active[cursor++]!.element);
    }
    const pageChanged = nextElements.length !== page.elements.length
      || nextElements.some((element, index) => element !== page.elements[index]);
    if (!pageChanged) return page;
    elementChanged = true;
    return { ...page, elements: nextElements };
  });

  // Group metadata is authoritative for membership validity even when the element itself was not
  // part of this transaction. This also covers legacy/image/3D elements that are not yet payload-
  // managed by the scene CRDT: a remote group tombstone must not leave an unlocked orphan groupId
  // in an older undo snapshot.
  const membershipPages = elementPages.map((page) => {
    let pageChanged = false;
    const elements = page.elements.map((element) => {
      const groupId = (element as TElement & { groupId?: string }).groupId;
      if (!groupId) return element;
      try {
        if (availableGroupKeys.has(studioCrdtLayerGroupKey(page.id, groupId))) return element;
      } catch {
        // Invalid/reserved legacy group identifiers are normalized to the page root below.
      }
      const next = { ...element } as TElement & { groupId?: string };
      delete next.groupId;
      pageChanged = true;
      return next as TElement;
    });
    if (!pageChanged) return page;
    elementChanged = true;
    return { ...page, elements };
  });

  // Stage-owned hiding is a receipt-derived overlay. The underlying CRDT `hidden` property remains
  // available for ordinary user visibility edits and therefore survives a later unlink unchanged.
  const visibilityPages = membershipPages.map((page) => {
    const shared3dStage = (page as TPage & {
      shared3dStage?: StudioShared3dStagePersistedState;
    }).shared3dStage;
    if (shared3dStage === undefined) return page;
    const overlayIds = studioShared3dStageVisibilityOverlayElementIds(
      shared3dStage,
      page.elements,
    );
    if (overlayIds.size === 0) return page;
    let pageChanged = false;
    const elements = page.elements.map((element) => {
      if (
        !overlayIds.has(element.id)
        || (element as TElement & { hidden?: boolean }).hidden === true
      ) return element;
      pageChanged = true;
      return { ...element, hidden: true } as TElement;
    });
    if (!pageChanged) return page;
    elementChanged = true;
    return { ...page, elements };
  });

  let groupChanged = false;
  const nextPages = visibilityPages.map((page) => {
    const legacy = (page.groups ?? []).filter((group) => {
      try {
        return !managedGroupIds.has(studioCrdtLayerGroupKey(page.id, group.id));
      } catch {
        return false;
      }
    });
    const managed = [...(activeGroupsByPage.get(page.id) ?? [])];
    const firstMemberIndex = new Map<string, number>();
    page.elements.forEach((element, index) => {
      const groupId = (element as TElement & { groupId?: string }).groupId;
      if (groupId && !firstMemberIndex.has(groupId)) firstMemberIndex.set(groupId, index);
    });
    managed.sort((left, right) =>
      (firstMemberIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (firstMemberIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER) ||
      left.id.localeCompare(right.id)
    );
    const groups = [...legacy, ...managed];
    const previousGroups = page.groups ?? [];
    const same = previousGroups.length === groups.length && previousGroups.every((group, index) => {
      const next = groups[index];
      return next !== undefined && group.id === next.id && group.name === next.name &&
        group.hidden === next.hidden && group.locked === next.locked &&
        group.collapsed === next.collapsed;
    });
    if (same) return page;
    groupChanged = true;
    return { ...page, groups };
  });

  const changed = topologyChanged || elementChanged || groupChanged;
  return { pages: changed ? nextPages : [...pages], changed };
}
  return { reconcileStudioCrdtPages, reconcileStudioCrdtSceneGraphPages };
}
