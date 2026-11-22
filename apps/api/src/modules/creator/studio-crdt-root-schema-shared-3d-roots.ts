import * as Y from "yjs";

import {
  STUDIO_CRDT_COLLECTION_MAX_ENTRIES,
  STUDIO_CRDT_PAGE_INDEX_ROOT,
  STUDIO_CRDT_PAGE_ROOT_PREFIX,
  materializeExistingMapRoot,
} from "./studio-crdt-root-schema-primitives";
import {
  STUDIO_CRDT_SHARED_3D_EVENT_KEY_PATTERN,
  STUDIO_CRDT_SHARED_3D_EVENT_MAX_GENERATION,
  STUDIO_CRDT_SHARED_3D_EVENT_MAX_PER_RECORD,
  STUDIO_CRDT_SHARED_3D_EVENT_MAX_TOTAL,
  STUDIO_CRDT_SHARED_3D_RECEIPT_RECORD_KEYS,
  STUDIO_CRDT_SHARED_3D_STAGE_PAYLOAD_VERSION,
  STUDIO_CRDT_SHARED_3D_STAGE_RECORDS_ROOT,
  STUDIO_CRDT_SHARED_3D_STAGE_RECORD_KEYS,
  STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX,
  STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPTS_ROOT,
  STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPT_ROOT_PREFIX,
  hasValidStudioCrdtShared3dAggregate,
  isStudioCrdtShared3dRuntimeKey,
  isStudioCrdtShared3dSafeId,
  parseCanonicalStudioCrdtShared3dStagePayload,
  parseStudioCrdtShared3dCompositeKey,
  type StudioCrdtShared3dActiveStage,
  type StudioCrdtShared3dStageEntry,
  type StudioCrdtShared3dStageIdentity,
} from "./studio-crdt-root-schema-shared-3d-entry";

interface StudioCrdtShared3dEvents {
  readonly eventKeys: ReadonlySet<string>;
  readonly maxActivate: number;
  readonly maxDeactivate: number;
}

interface StudioCrdtShared3dValidatedStageRecord extends StudioCrdtShared3dEvents {
  readonly identity: StudioCrdtShared3dStageIdentity;
  readonly order: number;
  readonly entry: StudioCrdtShared3dStageEntry;
}

interface StudioCrdtShared3dValidatedReceiptRecord extends StudioCrdtShared3dEvents {
  readonly identity: StudioCrdtShared3dStageIdentity;
  readonly modelRuntimeKey: string;
}

interface StudioCrdtShared3dImmutableRecordSnapshot extends StudioCrdtShared3dEvents {
  readonly pageId: unknown;
  readonly id: unknown;
  readonly payloadVersion: unknown;
}

export interface StudioCrdtShared3dRootSnapshot {
  readonly stageRootExisted: boolean;
  readonly receiptRootExisted: boolean;
  readonly stages: ReadonlyMap<string, StudioCrdtShared3dImmutableRecordSnapshot>;
  readonly receipts: ReadonlyMap<string, StudioCrdtShared3dImmutableRecordSnapshot>;
}

function readStudioCrdtShared3dEvents(
  record: Y.Map<unknown>,
  fixedKeys: ReadonlySet<string>
): StudioCrdtShared3dEvents | null {
  const eventKeys = new Set<string>();
  let maxActivate = -1;
  let maxDeactivate = -1;
  for (const [key, value] of record) {
    if (fixedKeys.has(key)) continue;
    const match = STUDIO_CRDT_SHARED_3D_EVENT_KEY_PATTERN.exec(key);
    if (!match || value !== true) return null;
    const generation = Number(match[2]);
    if (
      !Number.isSafeInteger(generation) ||
      generation < 0 ||
      generation > STUDIO_CRDT_SHARED_3D_EVENT_MAX_GENERATION
    ) return null;
    eventKeys.add(key);
    if (eventKeys.size > STUDIO_CRDT_SHARED_3D_EVENT_MAX_PER_RECORD) return null;
    if (match[1] === "activate") maxActivate = Math.max(maxActivate, generation);
    else maxDeactivate = Math.max(maxDeactivate, generation);
  }
  if (eventKeys.size === 0) return null;
  for (const key of eventKeys) {
    const match = STUDIO_CRDT_SHARED_3D_EVENT_KEY_PATTERN.exec(key)!;
    const generation = Number(match[2]);
    if (
      (match[1] === "activate" && generation > 0 &&
        !eventKeys.has(`deactivate:${generation - 1}`)) ||
      (match[1] === "deactivate" && generation > 0 &&
        !eventKeys.has(`activate:${generation}`))
    ) return null;
  }
  // The final bounded-history slot is reserved for a remove-wins deactivation. Accepting an active
  // record at the cap would make that Stage/receipt impossible to unlink for the rest of the room.
  if (
    eventKeys.size === STUDIO_CRDT_SHARED_3D_EVENT_MAX_PER_RECORD
    && maxActivate > maxDeactivate
  ) return null;
  return { eventKeys, maxActivate, maxDeactivate };
}

function isStudioCrdtShared3dRecordActive(record: StudioCrdtShared3dEvents): boolean {
  return record.maxActivate > record.maxDeactivate;
}

function hasRequiredStudioCrdtShared3dFields(
  record: Y.Map<unknown>,
  requiredKeys: ReadonlySet<string>
): boolean {
  for (const key of requiredKeys) {
    if (!record.has(key)) return false;
  }
  return true;
}

function studioCrdtShared3dDynamicRootName(prefix: string, key: string): string {
  return `${prefix}${encodeURIComponent(key)}`;
}

function parseStudioCrdtShared3dDynamicRootIdentity(
  rootName: string,
  prefix: string
): StudioCrdtShared3dStageIdentity | null {
  if (!rootName.startsWith(prefix)) return null;
  const encodedKey = rootName.slice(prefix.length);
  if (!encodedKey) return null;
  try {
    const key = decodeURIComponent(encodedKey);
    return encodeURIComponent(key) === encodedKey
      ? parseStudioCrdtShared3dCompositeKey(key, isStudioCrdtShared3dSafeId)
      : null;
  } catch {
    return null;
  }
}

function validateStudioCrdtShared3dStageRecord(
  identity: StudioCrdtShared3dStageIdentity,
  record: Y.Map<unknown>
): StudioCrdtShared3dValidatedStageRecord | null {
  const events = readStudioCrdtShared3dEvents(
    record,
    STUDIO_CRDT_SHARED_3D_STAGE_RECORD_KEYS
  );
  if (
    !hasRequiredStudioCrdtShared3dFields(record, STUDIO_CRDT_SHARED_3D_STAGE_RECORD_KEYS) ||
    record.get("pageId") !== identity.pageId ||
    record.get("stageId") !== identity.id ||
    record.get("payloadVersion") !== STUDIO_CRDT_SHARED_3D_STAGE_PAYLOAD_VERSION ||
    !Number.isSafeInteger(record.get("order")) ||
    (record.get("order") as number) < 0 ||
    !events
  ) return null;
  const entry = parseCanonicalStudioCrdtShared3dStagePayload(record.get("payload"), identity.id);
  return entry
    ? { identity, order: record.get("order") as number, entry, ...events }
    : null;
}

function validateStudioCrdtShared3dReceiptRecord(
  identity: StudioCrdtShared3dStageIdentity,
  record: Y.Map<unknown>
): StudioCrdtShared3dValidatedReceiptRecord | null {
  const events = readStudioCrdtShared3dEvents(
    record,
    STUDIO_CRDT_SHARED_3D_RECEIPT_RECORD_KEYS
  );
  const modelRuntimeKey = record.get("modelRuntimeKey");
  return hasRequiredStudioCrdtShared3dFields(
    record,
    STUDIO_CRDT_SHARED_3D_RECEIPT_RECORD_KEYS
  ) &&
    record.get("pageId") === identity.pageId &&
    record.get("elementId") === identity.id &&
    record.get("payloadVersion") === STUDIO_CRDT_SHARED_3D_STAGE_PAYLOAD_VERSION &&
    events &&
    isStudioCrdtShared3dRuntimeKey(modelRuntimeKey, identity.id)
    ? { identity, modelRuntimeKey, ...events }
    : null;
}

function studioCrdtShared3dPageExists(
  doc: Y.Doc,
  pageId: string,
  validatePageRoot: (id: string, record: Y.Map<unknown>) => boolean
): boolean {
  const pageIndex = materializeExistingMapRoot(doc, STUDIO_CRDT_PAGE_INDEX_ROOT);
  const page = materializeExistingMapRoot(
    doc,
    `${STUDIO_CRDT_PAGE_ROOT_PREFIX}${encodeURIComponent(pageId)}`
  );
  return pageIndex instanceof Y.Map &&
    pageIndex.get(pageId) === true &&
    page instanceof Y.Map &&
    validatePageRoot(pageId, page);
}

export function validateStudioCrdtShared3dStageRoots(
  doc: Y.Doc,
  validatePageRoot: (id: string, record: Y.Map<unknown>) => boolean
): boolean {
  const stageIndex = materializeExistingMapRoot(doc, STUDIO_CRDT_SHARED_3D_STAGE_RECORDS_ROOT);
  const receiptIndex = materializeExistingMapRoot(
    doc,
    STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPTS_ROOT
  );
  if (
    stageIndex === null ||
    receiptIndex === null ||
    (stageIndex?.size ?? 0) > STUDIO_CRDT_COLLECTION_MAX_ENTRIES ||
    (receiptIndex?.size ?? 0) > STUDIO_CRDT_COLLECTION_MAX_ENTRIES
  ) return false;

  const stagesByPage = new Map<string, StudioCrdtShared3dActiveStage[]>();
  const receiptsByPage = new Map<string, Array<{
    readonly elementId: string;
    readonly modelRuntimeKey: string;
  }>>();
  const trackedStageKeys = new Set<string>();
  const trackedReceiptKeys = new Set<string>();
  const managedPages = new Set<string>();
  let totalEventCount = 0;

  for (const [key, tracked] of stageIndex ?? []) {
    const identity = parseStudioCrdtShared3dCompositeKey(key, isStudioCrdtShared3dSafeId);
    const record = identity
      ? materializeExistingMapRoot(
          doc,
          studioCrdtShared3dDynamicRootName(
            STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX,
            key
          )
        )
      : null;
    const validated = identity && tracked === true && record instanceof Y.Map
      ? validateStudioCrdtShared3dStageRecord(identity, record)
      : null;
    if (!validated) return false;
    totalEventCount += validated.eventKeys.size;
    if (totalEventCount > STUDIO_CRDT_SHARED_3D_EVENT_MAX_TOTAL) return false;
    trackedStageKeys.add(key);
    managedPages.add(validated.identity.pageId);
    if (isStudioCrdtShared3dRecordActive(validated)) {
      const stages = stagesByPage.get(validated.identity.pageId) ?? [];
      stages.push({ order: validated.order, entry: validated.entry });
      stagesByPage.set(validated.identity.pageId, stages);
    }
  }

  for (const [key, tracked] of receiptIndex ?? []) {
    const identity = parseStudioCrdtShared3dCompositeKey(key, isStudioCrdtShared3dSafeId);
    const record = identity
      ? materializeExistingMapRoot(
          doc,
          studioCrdtShared3dDynamicRootName(
            STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPT_ROOT_PREFIX,
            key
          )
        )
      : null;
    const validated = identity && tracked === true && record instanceof Y.Map
      ? validateStudioCrdtShared3dReceiptRecord(identity, record)
      : null;
    if (!validated || !managedPages.has(validated.identity.pageId)) return false;
    totalEventCount += validated.eventKeys.size;
    if (totalEventCount > STUDIO_CRDT_SHARED_3D_EVENT_MAX_TOTAL) return false;
    trackedReceiptKeys.add(key);
    if (isStudioCrdtShared3dRecordActive(validated)) {
      const receipts = receiptsByPage.get(validated.identity.pageId) ?? [];
      receipts.push({
        elementId: validated.identity.id,
        modelRuntimeKey: validated.modelRuntimeKey,
      });
      receiptsByPage.set(validated.identity.pageId, receipts);
    }
  }

  let dynamicStageCount = 0;
  let dynamicReceiptCount = 0;
  for (const [rootName, value] of doc.share) {
    if (rootName.startsWith(STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX)) {
      dynamicStageCount += 1;
      const identity = parseStudioCrdtShared3dDynamicRootIdentity(
        rootName,
        STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX
      );
      if (
        dynamicStageCount > STUDIO_CRDT_COLLECTION_MAX_ENTRIES ||
        !identity ||
        !trackedStageKeys.has(identity.key) ||
        !(value instanceof Y.Map) ||
        !validateStudioCrdtShared3dStageRecord(identity, value)
      ) return false;
    }
    if (rootName.startsWith(STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPT_ROOT_PREFIX)) {
      dynamicReceiptCount += 1;
      const identity = parseStudioCrdtShared3dDynamicRootIdentity(
        rootName,
        STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPT_ROOT_PREFIX
      );
      if (
        dynamicReceiptCount > STUDIO_CRDT_COLLECTION_MAX_ENTRIES ||
        !identity ||
        !trackedReceiptKeys.has(identity.key) ||
        !(value instanceof Y.Map) ||
        !validateStudioCrdtShared3dReceiptRecord(identity, value)
      ) return false;
    }
  }
  if (
    dynamicStageCount !== trackedStageKeys.size ||
    dynamicReceiptCount !== trackedReceiptKeys.size
  ) return false;

  for (const pageId of managedPages) {
    if (
      !studioCrdtShared3dPageExists(doc, pageId, validatePageRoot) ||
      !hasValidStudioCrdtShared3dAggregate(
        stagesByPage.get(pageId) ?? [],
        receiptsByPage.get(pageId) ?? []
      )
    ) return false;
  }
  return true;
}

function snapshotStudioCrdtShared3dRecord(
  record: Y.Map<unknown>,
  idKey: "stageId" | "elementId"
): StudioCrdtShared3dImmutableRecordSnapshot | null {
  const events = readStudioCrdtShared3dEvents(
    record,
    idKey === "stageId"
      ? STUDIO_CRDT_SHARED_3D_STAGE_RECORD_KEYS
      : STUDIO_CRDT_SHARED_3D_RECEIPT_RECORD_KEYS
  );
  return events
    ? {
        pageId: record.get("pageId"),
        id: record.get(idKey),
        payloadVersion: record.get("payloadVersion"),
        ...events,
      }
    : null;
}

export function snapshotStudioCrdtShared3dStageRoots(
  doc: Y.Doc
): StudioCrdtShared3dRootSnapshot | null {
  const stageIndex = materializeExistingMapRoot(doc, STUDIO_CRDT_SHARED_3D_STAGE_RECORDS_ROOT);
  const receiptIndex = materializeExistingMapRoot(
    doc,
    STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPTS_ROOT
  );
  if (stageIndex === null || receiptIndex === null) return null;
  const stages = new Map<string, StudioCrdtShared3dImmutableRecordSnapshot>();
  for (const [key, tracked] of stageIndex ?? []) {
    const record = materializeExistingMapRoot(
      doc,
      studioCrdtShared3dDynamicRootName(STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX, key)
    );
    const snapshot = tracked === true && record instanceof Y.Map
      ? snapshotStudioCrdtShared3dRecord(record, "stageId")
      : null;
    if (!snapshot) return null;
    stages.set(key, snapshot);
  }
  const receipts = new Map<string, StudioCrdtShared3dImmutableRecordSnapshot>();
  for (const [key, tracked] of receiptIndex ?? []) {
    const record = materializeExistingMapRoot(
      doc,
      studioCrdtShared3dDynamicRootName(
        STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPT_ROOT_PREFIX,
        key
      )
    );
    const snapshot = tracked === true && record instanceof Y.Map
      ? snapshotStudioCrdtShared3dRecord(record, "elementId")
      : null;
    if (!snapshot) return null;
    receipts.set(key, snapshot);
  }
  return {
    stageRootExisted: stageIndex !== undefined,
    receiptRootExisted: receiptIndex !== undefined,
    stages,
    receipts,
  };
}

function preservesStudioCrdtShared3dRecord(
  previous: StudioCrdtShared3dImmutableRecordSnapshot,
  current: Y.Map<unknown>,
  idKey: "stageId" | "elementId"
): boolean {
  return current.get("pageId") === previous.pageId &&
    current.get(idKey) === previous.id &&
    current.get("payloadVersion") === previous.payloadVersion &&
    [...previous.eventKeys].every((key) => current.get(key) === true);
}

export function preservesStudioCrdtShared3dStageRoots(
  snapshot: StudioCrdtShared3dRootSnapshot | null,
  doc: Y.Doc
): boolean {
  if (!snapshot) return false;
  const stageIndex = materializeExistingMapRoot(doc, STUDIO_CRDT_SHARED_3D_STAGE_RECORDS_ROOT);
  const receiptIndex = materializeExistingMapRoot(
    doc,
    STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPTS_ROOT
  );
  if (
    stageIndex === null ||
    receiptIndex === null ||
    (snapshot.stageRootExisted && stageIndex === undefined) ||
    (snapshot.receiptRootExisted && receiptIndex === undefined)
  ) return false;
  for (const [key, previous] of snapshot.stages) {
    const current = materializeExistingMapRoot(
      doc,
      studioCrdtShared3dDynamicRootName(STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX, key)
    );
    if (
      stageIndex?.get(key) !== true ||
      !(current instanceof Y.Map) ||
      !preservesStudioCrdtShared3dRecord(previous, current, "stageId")
    ) return false;
  }
  for (const [key, previous] of snapshot.receipts) {
    const current = materializeExistingMapRoot(
      doc,
      studioCrdtShared3dDynamicRootName(
        STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPT_ROOT_PREFIX,
        key
      )
    );
    if (
      receiptIndex?.get(key) !== true ||
      !(current instanceof Y.Map) ||
      !preservesStudioCrdtShared3dRecord(previous, current, "elementId")
    ) return false;
  }
  return true;
}

function admitsStudioCrdtShared3dRecordEvents(
  previous: StudioCrdtShared3dImmutableRecordSnapshot | undefined,
  current: StudioCrdtShared3dEvents
): boolean {
  const newEventKeys = [...current.eventKeys].filter((key) => !previous?.eventKeys.has(key));
  if (!previous) return newEventKeys.length > 0;
  const maxBefore = Math.max(previous.maxActivate, previous.maxDeactivate);
  for (const key of newEventKeys) {
    const match = STUDIO_CRDT_SHARED_3D_EVENT_KEY_PATTERN.exec(key);
    if (!match) return false;
    const generation = Number(match[2]);
    if (generation <= maxBefore) continue;
    // Offline/reconnect updates may contain several complete transitions. Accept the aggregate
    // suffix only when every event carries its causal predecessor in the same grow-only record;
    // readStudioCrdtShared3dEvents already enforces the same shape for the full current set.
    const predecessor = match[1] === "activate"
      ? generation === 0 ? null : `deactivate:${generation - 1}`
      : generation === 0 ? null : `activate:${generation}`;
    if (predecessor && !current.eventKeys.has(predecessor)) return false;
  }
  return true;
}

/**
 * Admission guard for a staged update. Call after root-schema validation and preservation checks;
 * it rejects generation gaps while still accepting late non-winning concurrent history.
 */
export function admitsStudioCrdtShared3dStageEvents(
  snapshot: StudioCrdtShared3dRootSnapshot | null,
  doc: Y.Doc
): boolean {
  if (!snapshot || !preservesStudioCrdtShared3dStageRoots(snapshot, doc)) return false;
  const stageIndex = materializeExistingMapRoot(doc, STUDIO_CRDT_SHARED_3D_STAGE_RECORDS_ROOT);
  const receiptIndex = materializeExistingMapRoot(
    doc,
    STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPTS_ROOT
  );
  if (stageIndex === null || receiptIndex === null) return false;
  for (const [key, tracked] of stageIndex ?? []) {
    const record = materializeExistingMapRoot(
      doc,
      studioCrdtShared3dDynamicRootName(STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX, key)
    );
    const current = tracked === true && record instanceof Y.Map
      ? readStudioCrdtShared3dEvents(
          record,
          STUDIO_CRDT_SHARED_3D_STAGE_RECORD_KEYS
        )
      : null;
    if (!current || !admitsStudioCrdtShared3dRecordEvents(snapshot.stages.get(key), current)) {
      return false;
    }
  }
  for (const [key, tracked] of receiptIndex ?? []) {
    const record = materializeExistingMapRoot(
      doc,
      studioCrdtShared3dDynamicRootName(
        STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPT_ROOT_PREFIX,
        key
      )
    );
    const current = tracked === true && record instanceof Y.Map
      ? readStudioCrdtShared3dEvents(
          record,
          STUDIO_CRDT_SHARED_3D_RECEIPT_RECORD_KEYS
        )
      : null;
    if (!current || !admitsStudioCrdtShared3dRecordEvents(snapshot.receipts.get(key), current)) {
      return false;
    }
  }
  return true;
}
