/**
 * T-036 · T-043 · T-044:
 * - Plotr · Tooning Plus · Character Chat · Virtual Studio의 메모리 동기화 시연 모델
 *   (샘플 큐·충돌 머지·백오프 검증용이며 실제 원고 저장·서버 반영 권위와 연결하지 않는다.)
 * - 가상 스튜디오 근접 원고 합평 테이블 & 화면공유 시그널링 상태 머신 재수출
 */

import {
  computeOfflineSyncRetryDelayMs, deriveOfflineSyncIdempotencyKey, mergeOfflineSyncQueue,
  offlineSyncCutKey, planOfflineSyncRetrySchedule,
  type CompactedOfflineSyncOperation, type OfflineSyncMutationKind, type OfflineSyncQueueConflict,
  type OfflineSyncQueueEntry, type OfflineSyncQueueMergeResult, type OfflineSyncRetryPlanEntry,
  type OfflineSyncRetryPolicy, type OfflineSyncRetrySchedule, type OfflineSyncTombstone,
} from "../live/studio-offline-sync-queue-merger";

export {
  computeOfflineSyncRetryDelayMs, deriveOfflineSyncIdempotencyKey, mergeOfflineSyncQueue, planOfflineSyncRetrySchedule,
  type CompactedOfflineSyncOperation, type OfflineSyncMutationKind, type OfflineSyncQueueConflict,
  type OfflineSyncQueueEntry, type OfflineSyncQueueMergeResult, type OfflineSyncRetryPlanEntry,
  type OfflineSyncRetryPolicy, type OfflineSyncRetrySchedule,
};

export {
  addReviewCommentPin,
  computeAvatarDistance,
  createInitialProximityReviewTable,
  createInitialScreenShareSignalState,
  evaluateProximityChannels,
  moveProximityParticipant,
  toggleReviewCommentPinResolved,
  transitionScreenShareState,
  updateSharedCutPointer,
  type ProximityAudioLink,
  type ProximityChannelEvaluation,
  type ProximityParticipant,
  type ProximityReviewTableState,
  type ReviewCommentPin,
  type ReviewPinCategory,
  type ScreenShareQualityPreset,
  type ScreenShareSignalEvent,
  type ScreenShareSignalState,
  type ScreenShareSignalStatus,
  type SharedCutPointer,
} from "./proximity-review-table";

export const SYNC_STUDIO_SURFACES = [
  "plotr",
  "tooning-plus",
  "character-chat",
  "virtual-studio",
] as const;

export type SyncStudioSurface = (typeof SYNC_STUDIO_SURFACES)[number];
export type SyncNetworkStatus = "online" | "offline" | "degraded";
export type ConflictResolutionStrategy = "field-level-merge" | "local-wins" | "remote-wins" | "manual-review";

export interface SyncSurfaceDescriptor {
  readonly id: SyncStudioSurface;
  readonly labelKo: string;
  readonly summaryKo: string;
}

export const SYNC_SURFACE_DESCRIPTORS: Readonly<Record<SyncStudioSurface, SyncSurfaceDescriptor>> = Object.freeze({
  plotr: { id: "plotr", labelKo: "Plotr 스토리보드", summaryKo: "장면 비트·플롯 카드·에피소드 대본 동기화" },
  "tooning-plus": { id: "tooning-plus", labelKo: "Tooning Plus 컷·식자", summaryKo: "웹툰 컷 레이아웃·말풍선·로컬 자산 스냅샷" },
  "character-chat": { id: "character-chat", labelKo: "Character Chat 인물 설정", summaryKo: "캐릭터 페르소나·대사 톤·호칭 규칙 메모리" },
  "virtual-studio": { id: "virtual-studio", labelKo: "Virtual Studio 협업 룸", summaryKo: "근접 합평 테이블·컷 포인터·코멘트 핀 상태" },
});

export interface SyncEntityRecord {
  readonly surface: SyncStudioSurface;
  readonly entityId: string;
  readonly lamport: number;
  readonly updatedAtMs: number;
  readonly actorId: string;
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
}

export interface SyncQueueOperation {
  readonly opId: string;
  readonly idempotencyKey?: string;
  readonly mutationKind?: OfflineSyncMutationKind;
  readonly revision?: number;
  readonly surface: SyncStudioSurface;
  readonly entityId: string;
  readonly patch: Readonly<Record<string, string | number | boolean | null>>;
  readonly lamport: number;
  readonly createdAtMs: number;
  readonly actorId: string;
  readonly status: "pending" | "retrying" | "synced" | "failed";
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly nextRetryAtMs: number;
  readonly lastError?: string;
}

export interface SyncConflictRecord {
  readonly conflictId: string;
  readonly surface: SyncStudioSurface;
  readonly entityId: string;
  readonly conflictingFields: readonly string[];
  readonly localRecord: SyncEntityRecord;
  readonly remoteRecord: SyncEntityRecord;
  readonly resolution: "merged" | "local-wins" | "remote-wins" | "pending-manual";
  readonly resolvedRecord: SyncEntityRecord | null;
  readonly detectedAtMs: number;
}

export interface LocalSnapshotStore {
  readonly backend: "memory";
  read(key: string): string | null;
  write(key: string, value: string): void;
}

export interface RemoteSyncTransport {
  pushOperations(ops: readonly SyncQueueOperation[]): Promise<{
    readonly acceptedOpIds: readonly string[];
    readonly rejected?: readonly { readonly opId: string; readonly reason: string }[];
    readonly remoteUpdates?: readonly SyncEntityRecord[];
  }>;
}

export interface OfflineSyncSnapshotDocument {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly authority: "session-demo";
  readonly lamportClock: number;
  readonly networkStatus: SyncNetworkStatus;
  readonly storageBackend: LocalSnapshotStore["backend"];
  readonly records: Readonly<Record<string, SyncEntityRecord>>;
  readonly queue: readonly SyncQueueOperation[];
  readonly conflicts: readonly SyncConflictRecord[];
  readonly lastSyncedAtMs: number | null;
  readonly syncedOpCount: number;
}

export interface SyncCycleResult {
  readonly attempted: number;
  readonly synced: number;
  readonly retried: number;
  readonly failed: number;
  readonly mergedConflicts: number;
  readonly manualConflicts: number;
  readonly deduplicatedOps?: number;
  readonly queueConflicts?: readonly OfflineSyncQueueConflict[];
  readonly retrySchedule?: OfflineSyncRetrySchedule;
  readonly skippedOffline: boolean;
  readonly summaryKo: string;
}

export interface ConflictMergeOutput {
  readonly record: SyncEntityRecord;
  readonly hadConflict: boolean;
  readonly conflictingFields: readonly string[];
  readonly conflictEntry: SyncConflictRecord | null;
}

function recordKey(surface: SyncStudioSurface, entityId: string): string {
  return `${surface}::${entityId}`;
}

export function createMemorySnapshotStore(): LocalSnapshotStore {
  const map = new Map<string, string>();
  return {
    backend: "memory",
    read: (key) => map.get(key) ?? null,
    write: (key, value) => { map.set(key, value); },
  };
}

/** 결정론적 충돌 머지 엔진 (필드 단위 병합 · Local/Remote 우선 · 수동 검토) */
export function resolveSyncConflict(
  localRecord: SyncEntityRecord,
  remoteRecord: SyncEntityRecord,
  strategy: ConflictResolutionStrategy = "field-level-merge",
  nowMs = Date.now(),
): ConflictMergeOutput {
  const allKeys = new Set([...Object.keys(localRecord.payload), ...Object.keys(remoteRecord.payload)]);
  const conflictingFields: string[] = [];
  for (const key of allKeys) {
    const lv = localRecord.payload[key];
    const rv = remoteRecord.payload[key];
    if (lv !== undefined && rv !== undefined && lv !== rv) conflictingFields.push(key);
  }

  const nextLamport = Math.max(localRecord.lamport, remoteRecord.lamport) + 1;
  const nextUpdated = Math.max(localRecord.updatedAtMs, remoteRecord.updatedAtMs, nowMs);
  const conflictId = `conf-${localRecord.surface}-${localRecord.entityId}-${nextLamport}`;

  if (conflictingFields.length === 0) {
    return Object.freeze({
      record: Object.freeze({
        surface: localRecord.surface,
        entityId: localRecord.entityId,
        lamport: nextLamport,
        updatedAtMs: nextUpdated,
        actorId: localRecord.actorId,
        payload: Object.freeze({ ...remoteRecord.payload, ...localRecord.payload }),
      }),
      hadConflict: false,
      conflictingFields: Object.freeze([]),
      conflictEntry: null,
    });
  }

  if (strategy === "manual-review") {
    return Object.freeze({
      record: localRecord,
      hadConflict: true,
      conflictingFields: Object.freeze(conflictingFields),
      conflictEntry: Object.freeze({
        conflictId,
        surface: localRecord.surface,
        entityId: localRecord.entityId,
        conflictingFields: Object.freeze(conflictingFields),
        localRecord,
        remoteRecord,
        resolution: "pending-manual",
        resolvedRecord: null,
        detectedAtMs: nowMs,
      }),
    });
  }

  const preferLocal =
    strategy === "local-wins"
      ? true
      : strategy === "remote-wins"
        ? false
        : localRecord.lamport > remoteRecord.lamport ||
          (localRecord.lamport === remoteRecord.lamport && localRecord.updatedAtMs >= remoteRecord.updatedAtMs);

  const mergedPayload: Record<string, string | number | boolean | null> = {};
  for (const key of allKeys) {
    const lv = localRecord.payload[key];
    const rv = remoteRecord.payload[key];
    if (lv === undefined && rv !== undefined) mergedPayload[key] = rv;
    else if (rv === undefined && lv !== undefined) mergedPayload[key] = lv;
    else mergedPayload[key] = (preferLocal ? lv : rv) ?? null;
  }

  const resolvedRecord: SyncEntityRecord = Object.freeze({
    surface: localRecord.surface,
    entityId: localRecord.entityId,
    lamport: nextLamport,
    updatedAtMs: nextUpdated,
    actorId: preferLocal ? localRecord.actorId : remoteRecord.actorId,
    payload: Object.freeze(mergedPayload),
  });
  const resolution: SyncConflictRecord["resolution"] =
    strategy === "local-wins" ? "local-wins" : strategy === "remote-wins" ? "remote-wins" : "merged";

  return Object.freeze({
    record: resolvedRecord,
    hadConflict: true,
    conflictingFields: Object.freeze(conflictingFields),
    conflictEntry: Object.freeze({
      conflictId,
      surface: localRecord.surface,
      entityId: localRecord.entityId,
      conflictingFields: Object.freeze(conflictingFields),
      localRecord,
      remoteRecord,
      resolution,
      resolvedRecord,
      detectedAtMs: nowMs,
    }),
  });
}

export function computeRetryBackoffMs(retryCount: number, baseMs = 1000, maxMs = 60_000): number {
  return computeOfflineSyncRetryDelayMs(retryCount, {
    baseDelayMs: baseMs,
    maxDelayMs: maxMs,
    multiplier: 2,
    jitterRatio: 0,
  });
}

function toMergerEntry(op: SyncQueueOperation): OfflineSyncQueueEntry {
  const kind = op.mutationKind ?? "patch";
  const idempotencyKey =
    op.idempotencyKey ??
    deriveOfflineSyncIdempotencyKey({
      surface: op.surface,
      cutId: op.entityId,
      kind,
      causalSequence: op.lamport,
      actorId: op.actorId,
      patch: op.patch,
    });
  return {
    opId: op.opId,
    idempotencyKey,
    surface: op.surface,
    cutId: op.entityId,
    kind,
    causalSequence: op.lamport,
    revision: op.revision ?? op.lamport,
    patch: op.patch,
    actorId: op.actorId,
    createdAtMs: op.createdAtMs,
    retryCount: op.retryCount,
    maxRetries: op.maxRetries,
    nextRetryAtMs: op.nextRetryAtMs,
    ...(op.lastError !== undefined ? { lastError: op.lastError } : {}),
  };
}

function fromCompactedOperation(
  compacted: CompactedOfflineSyncOperation,
  template?: SyncQueueOperation,
): SyncQueueOperation {
  return Object.freeze({
    opId: compacted.opId,
    idempotencyKey: compacted.idempotencyKey,
    mutationKind: compacted.kind,
    revision: compacted.revision,
    surface: compacted.surface as SyncStudioSurface,
    entityId: compacted.cutId,
    patch: compacted.patch,
    lamport: compacted.causalSequence,
    createdAtMs: compacted.createdAtMs,
    actorId: compacted.actorId,
    status: template?.status ?? "pending",
    retryCount: template?.retryCount ?? 0,
    maxRetries: template?.maxRetries ?? 4,
    nextRetryAtMs: template?.nextRetryAtMs ?? compacted.createdAtMs,
    ...(template?.lastError !== undefined ? { lastError: template.lastError } : {}),
  });
}

export interface OfflineFirstSyncBridge {
  getState(): OfflineSyncSnapshotDocument;
  getQueueConflicts(): readonly OfflineSyncQueueConflict[];
  planReconnectMerge(nowMs?: number): OfflineSyncQueueMergeResult;
  setNetworkStatus(status: SyncNetworkStatus): OfflineSyncSnapshotDocument;
  enqueueLocalMutation(input: {
    readonly surface: SyncStudioSurface;
    readonly entityId: string;
    readonly patch: Readonly<Record<string, string | number | boolean | null>>;
    readonly actorId?: string;
    readonly nowMs?: number;
    readonly idempotencyKey?: string;
    readonly kind?: OfflineSyncMutationKind;
    readonly revision?: number;
  }): {
    readonly record: SyncEntityRecord;
    readonly operation: SyncQueueOperation;
    readonly queueConflicts?: readonly OfflineSyncQueueConflict[];
  };
  syncNow(
    transport: RemoteSyncTransport,
    options?: {
      readonly strategy?: ConflictResolutionStrategy;
      readonly nowMs?: number;
      readonly retryPolicy?: OfflineSyncRetryPolicy;
    },
  ): Promise<SyncCycleResult>;
  resolveManualConflict(conflictId: string, winner: "local" | "remote", nowMs?: number): boolean;
  exportSnapshotJson(): string;
}

export function createOfflineFirstSyncBridge(
  projectId: string,
  options: { readonly store?: LocalSnapshotStore; readonly initialNetwork?: SyncNetworkStatus; readonly seedDemoRecords?: boolean } = {},
): OfflineFirstSyncBridge {
  const store = options.store ?? createMemorySnapshotStore();
  const storageKey = `project:${projectId}`;

  const createEmpty = (): OfflineSyncSnapshotDocument => {
    const baseRecords: Record<string, SyncEntityRecord> = {};
    if (options.seedDemoRecords) {
      const t0 = 1_763_720_000_000;
      baseRecords[recordKey("plotr", "ep12-beat-1")] = { surface: "plotr", entityId: "ep12-beat-1", lamport: 1, updatedAtMs: t0, actorId: "author-local", payload: { title: "옥상 대치", tension: 85, locked: true } };
      baseRecords[recordKey("tooning-plus", "cut-01")] = { surface: "tooning-plus", entityId: "cut-01", lamport: 1, updatedAtMs: t0, actorId: "author-local", payload: { balloons: 3, localized: true, dpi: 300 } };
      baseRecords[recordKey("character-chat", "char-seoyeon")] = { surface: "character-chat", entityId: "char-seoyeon", lamport: 1, updatedAtMs: t0, actorId: "author-local", payload: { speechTone: "단호한 반말", targetName: "현우" } };
      baseRecords[recordKey("virtual-studio", "table-main")] = { surface: "virtual-studio", entityId: "table-main", lamport: 1, updatedAtMs: t0, actorId: "author-local", payload: { activeCut: "cut-01", openPins: 2 } };
    }
    return {
      schemaVersion: 1,
      projectId,
      authority: "session-demo",
      lamportClock: options.seedDemoRecords ? 1 : 0,
      networkStatus: options.initialNetwork ?? "online",
      storageBackend: store.backend,
      records: baseRecords,
      queue: [],
      conflicts: [],
      lastSyncedAtMs: null,
      syncedOpCount: 0,
    };
  };

  let state: OfflineSyncSnapshotDocument = (() => {
    const raw = store.read(storageKey);
    if (!raw) return createEmpty();
    try {
      const parsed = JSON.parse(raw) as Partial<OfflineSyncSnapshotDocument>;
      if (parsed.schemaVersion === 1 && parsed.projectId === projectId && parsed.records && Array.isArray(parsed.queue)) {
        return { ...createEmpty(), ...parsed, storageBackend: store.backend };
      }
    } catch { /* 손상 캐시 무시 */ }
    return createEmpty();
  })();

  const persist = () => { store.write(storageKey, JSON.stringify(state)); };
  const acknowledgedKeys = new Set<string>();
  const deletedTombstones = new Map<string, OfflineSyncTombstone>();
  let queueConflicts: readonly OfflineSyncQueueConflict[] = Object.freeze([]);
  persist();

  const recordQueueConflicts = (incoming: readonly OfflineSyncQueueConflict[]) => {
    if (incoming.length === 0) return;
    const seen = new Set(queueConflicts.map((item) => `${item.code}:${item.conflictingOpId}:${item.idempotencyKey}`));
    const appended = [...queueConflicts];
    for (const conflict of incoming) {
      const signature = `${conflict.code}:${conflict.conflictingOpId}:${conflict.idempotencyKey}`;
      if (!seen.has(signature)) {
        seen.add(signature);
        appended.push(conflict);
      }
    }
    queueConflicts = Object.freeze(appended);
  };

  return {
    getState: () => state,
    getQueueConflicts: () => queueConflicts,

    planReconnectMerge(nowMs = Date.now()) {
      const eligible = state.queue.filter((op) => (op.status === "pending" || op.status === "retrying") && op.nextRetryAtMs <= nowMs);
      return mergeOfflineSyncQueue(eligible.map(toMergerEntry), {
        acknowledgedIdempotencyKeys: acknowledgedKeys,
        deletedCutTombstones: deletedTombstones,
      });
    },

    setNetworkStatus(status) {
      state = { ...state, networkStatus: status };
      persist();
      return state;
    },

    enqueueLocalMutation({
      surface,
      entityId,
      patch,
      actorId = "author-local",
      nowMs = Date.now(),
      idempotencyKey,
      kind = "patch",
      revision,
    }) {
      const nextLamport = state.lamportClock + 1;
      const key = recordKey(surface, entityId);
      const existing = state.records[key];
      const effectiveRev = revision ?? nextLamport;
      const resolvedIdempotencyKey =
        idempotencyKey && idempotencyKey.trim().length > 0
          ? idempotencyKey.trim()
          : deriveOfflineSyncIdempotencyKey({
              surface,
              cutId: entityId,
              kind,
              causalSequence: nextLamport,
              actorId,
              patch,
            });

      const operation: SyncQueueOperation = Object.freeze({
        opId: `op-${surface}-${entityId}-${nextLamport}`,
        idempotencyKey: resolvedIdempotencyKey,
        mutationKind: kind,
        revision: effectiveRev,
        surface,
        entityId,
        patch: Object.freeze({ ...patch }),
        lamport: nextLamport,
        createdAtMs: nowMs,
        actorId,
        status: "pending",
        retryCount: 0,
        maxRetries: 4,
        nextRetryAtMs: nowMs,
      });

      const nonPending = state.queue.filter((op) => op.status !== "pending");
      const pending = state.queue.filter((op) => op.status === "pending");
      const mergeResult = mergeOfflineSyncQueue([...pending.map(toMergerEntry), toMergerEntry(operation)], {
        acknowledgedIdempotencyKeys: acknowledgedKeys,
        deletedCutTombstones: deletedTombstones,
      });
      recordQueueConflicts(mergeResult.conflicts);

      const templateByOpId = new Map<string, SyncQueueOperation>(
        [...pending, operation].map((item) => [item.opId, item]),
      );
      const compactedPending = mergeResult.operations.map((compacted) =>
        fromCompactedOperation(compacted, templateByOpId.get(compacted.opId)),
      );
      const wasDroppedOrConflicted =
        mergeResult.droppedDuplicateOpIds.includes(operation.opId) ||
        mergeResult.conflicts.some((item) => item.conflictingOpId === operation.opId);

      const nextRecords: Record<string, SyncEntityRecord> = { ...state.records };
      let nextRecord: SyncEntityRecord;
      if (wasDroppedOrConflicted) {
        nextRecord =
          existing ??
          Object.freeze({
            surface,
            entityId,
            lamport: state.lamportClock,
            updatedAtMs: nowMs,
            actorId,
            payload: Object.freeze({}),
          });
      } else if (kind === "delete") {
        delete nextRecords[key];
        nextRecord = Object.freeze({
          surface,
          entityId,
          lamport: nextLamport,
          updatedAtMs: nowMs,
          actorId,
          payload: Object.freeze({}),
        });
      } else {
        nextRecord = Object.freeze({
          surface,
          entityId,
          lamport: nextLamport,
          updatedAtMs: nowMs,
          actorId,
          payload: Object.freeze(kind === "upsert" ? { ...patch } : { ...(existing?.payload ?? {}), ...patch }),
        });
        nextRecords[key] = nextRecord;
      }

      const finalOp =
        compactedPending.find((op) => op.surface === surface && op.entityId === entityId) ?? operation;

      state = {
        ...state,
        lamportClock: nextLamport,
        records: nextRecords,
        queue: [...nonPending, ...compactedPending],
      };
      persist();
      return {
        record: nextRecord,
        operation: finalOp,
        ...(mergeResult.conflicts.length > 0 ? { queueConflicts: mergeResult.conflicts } : {}),
      };
    },

    async syncNow(transport, syncOptions = {}) {
      const nowMs = syncOptions.nowMs ?? Date.now();
      const strategy = syncOptions.strategy ?? "field-level-merge";
      const retryPolicy = syncOptions.retryPolicy;
      if (state.networkStatus === "offline") {
        const waitingCount = state.queue.filter((q) => q.status === "pending" || q.status === "retrying").length;
        return Object.freeze({
          attempted: 0, synced: 0, retried: 0, failed: 0, mergedConflicts: 0, manualConflicts: 0, skippedOffline: true,
          summaryKo: `오프라인 시연입니다. 대기 작업 ${waitingCount}건은 현재 세션 메모리에만 있으며 화면을 닫으면 사라집니다.`,
        });
      }

      const eligible = state.queue.filter((op) => (op.status === "pending" || op.status === "retrying") && op.nextRetryAtMs <= nowMs);
      if (eligible.length === 0) {
        return Object.freeze({
          attempted: 0, synced: 0, retried: 0, failed: 0, mergedConflicts: 0, manualConflicts: 0, skippedOffline: false,
          summaryKo: "동기화 시연에 대기 중인 샘플 변경사항이 없습니다.",
        });
      }

      const mergeResult = mergeOfflineSyncQueue(eligible.map(toMergerEntry), {
        acknowledgedIdempotencyKeys: acknowledgedKeys,
        deletedCutTombstones: deletedTombstones,
      });
      recordQueueConflicts(mergeResult.conflicts);

      const eligibleByOpId = new Map<string, SyncQueueOperation>(eligible.map((item) => [item.opId, item]));
      const dispatchOps: SyncQueueOperation[] = [];
      const mergedOpIdsByDispatch = new Map<string, readonly string[]>();
      const mergedKeysByDispatch = new Map<string, readonly string[]>();
      for (const compacted of mergeResult.operations) {
        const template =
          eligibleByOpId.get(compacted.opId) ??
          compacted.mergedOpIds.map((id) => eligibleByOpId.get(id)).find((item) => item !== undefined);
        const dispatchOp = fromCompactedOperation(compacted, template);
        dispatchOps.push(dispatchOp);
        mergedOpIdsByDispatch.set(dispatchOp.opId, compacted.mergedOpIds);
        mergedKeysByDispatch.set(dispatchOp.opId, compacted.mergedIdempotencyKeys);
      }

      const droppedSet = new Set(mergeResult.droppedDuplicateOpIds);
      if (dispatchOps.length === 0) {
        const remainingQueue = state.queue.filter((op) => !droppedSet.has(op.opId));
        state = { ...state, queue: remainingQueue };
        persist();
        return Object.freeze({
          attempted: 0,
          synced: 0,
          retried: 0,
          failed: 0,
          mergedConflicts: 0,
          manualConflicts: mergeResult.conflicts.length,
          deduplicatedOps: mergeResult.deduplicatedCount,
          queueConflicts: mergeResult.conflicts,
          skippedOffline: false,
          summaryKo: mergeResult.summaryKo,
        });
      }

      const applyRetryPlan = (op: SyncQueueOperation, plan: OfflineSyncRetryPlanEntry): SyncQueueOperation =>
        Object.freeze({
          ...op,
          status: plan.status,
          retryCount: plan.attempt,
          nextRetryAtMs: plan.nextRetryAtMs,
          ...(plan.reason !== undefined ? { lastError: plan.reason } : {}),
        });
      const collectConsumedIds = () => {
        const ids = new Set<string>(droppedSet);
        for (const op of dispatchOps) {
          for (const id of mergedOpIdsByDispatch.get(op.opId) ?? [op.opId]) ids.add(id);
        }
        return ids;
      };

      let synced = 0;
      let mergedConflicts = 0;
      let manualConflicts = 0;

      try {
        const response = await transport.pushOperations(dispatchOps);
        const acceptedSet = new Set(response.acceptedOpIds);
        const rejectedMap = new Map((response.rejected ?? []).map((item) => [item.opId, item.reason]));
        const consumedEligibleIds = collectConsumedIds();
        const rejectedDispatchOps: SyncQueueOperation[] = [];
        for (const dispatchOp of dispatchOps) {
          if (acceptedSet.has(dispatchOp.opId)) {
            synced += 1;
            for (const keyItem of mergedKeysByDispatch.get(dispatchOp.opId) ?? []) acknowledgedKeys.add(keyItem);
            if (dispatchOp.mutationKind === "delete") {
              deletedTombstones.set(offlineSyncCutKey(dispatchOp.surface, dispatchOp.entityId), {
                opId: dispatchOp.opId,
                causalSequence: dispatchOp.lamport,
              });
            }
          } else if (rejectedMap.has(dispatchOp.opId)) {
            rejectedDispatchOps.push(dispatchOp);
          }
        }

        const retrySchedule = planOfflineSyncRetrySchedule(
          rejectedDispatchOps.map(toMergerEntry),
          { nowMs, policy: retryPolicy, failureReasons: rejectedMap },
        );
        const planByOpId = new Map(retrySchedule.entries.map((entry) => [entry.opId, entry]));
        const retried = retrySchedule.retryingCount;
        const failed = retrySchedule.exhaustedCount;

        const nextQueue: SyncQueueOperation[] = state.queue.filter((op) => !consumedEligibleIds.has(op.opId));
        for (const dispatchOp of dispatchOps) {
          if (acceptedSet.has(dispatchOp.opId)) continue;
          const retryPlan = planByOpId.get(dispatchOp.opId);
          nextQueue.push(retryPlan ? applyRetryPlan(dispatchOp, retryPlan) : dispatchOp);
        }

        const nextRecords: Record<string, SyncEntityRecord> = { ...state.records };
        const nextConflicts: SyncConflictRecord[] = [...state.conflicts];
        let nextLamport = state.lamportClock;

        for (const remote of response.remoteUpdates ?? []) {
          const key = recordKey(remote.surface, remote.entityId);
          const local = nextRecords[key];
          if (!local) {
            nextRecords[key] = remote;
            nextLamport = Math.max(nextLamport, remote.lamport);
          } else {
            const resolved = resolveSyncConflict(local, remote, strategy, nowMs);
            nextRecords[key] = resolved.record;
            nextLamport = Math.max(nextLamport, resolved.record.lamport);
            if (resolved.conflictEntry) {
              nextConflicts.push(resolved.conflictEntry);
              if (resolved.conflictEntry.resolution === "pending-manual") manualConflicts += 1;
              else mergedConflicts += 1;
            }
          }
        }

        state = {
          ...state,
          lamportClock: nextLamport,
          records: nextRecords,
          queue: nextQueue,
          conflicts: nextConflicts,
          lastSyncedAtMs: synced > 0 ? nowMs : state.lastSyncedAtMs,
          syncedOpCount: state.syncedOpCount + synced,
        };
        persist();
        return Object.freeze({
          attempted: dispatchOps.length,
          synced,
          retried,
          failed,
          mergedConflicts,
          manualConflicts,
          deduplicatedOps: mergeResult.deduplicatedCount,
          queueConflicts: mergeResult.conflicts,
          ...(retrySchedule.entries.length > 0 ? { retrySchedule } : {}),
          skippedOffline: false,
          summaryKo: `메모리 동기화 시연: 반영 ${synced}건 · 재시도 예약 ${retried}건 · 충돌 병합 ${mergedConflicts}건`,
        });
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : "네트워크 오류";
        const retrySchedule = planOfflineSyncRetrySchedule(
          dispatchOps.map(toMergerEntry),
          { nowMs, policy: retryPolicy, failureReasons: new Map(dispatchOps.map((op) => [op.opId, reason])) },
        );
        const planByOpId = new Map(retrySchedule.entries.map((entry) => [entry.opId, entry]));
        const retried = retrySchedule.retryingCount;
        const failed = retrySchedule.exhaustedCount;

        const consumedEligibleIds = collectConsumedIds();
        const nextQueue: SyncQueueOperation[] = state.queue.filter((op) => !consumedEligibleIds.has(op.opId));
        for (const dispatchOp of dispatchOps) {
          const retryPlan = planByOpId.get(dispatchOp.opId);
          nextQueue.push(
            retryPlan
              ? applyRetryPlan(dispatchOp, retryPlan)
              : Object.freeze({ ...dispatchOp, status: "retrying" as const, retryCount: dispatchOp.retryCount + 1, nextRetryAtMs: nowMs + computeRetryBackoffMs(dispatchOp.retryCount + 1), lastError: reason }),
          );
        }
        state = { ...state, networkStatus: "degraded", queue: nextQueue };
        persist();
        return Object.freeze({
          attempted: dispatchOps.length,
          synced: 0,
          retried,
          failed,
          mergedConflicts: 0,
          manualConflicts: 0,
          deduplicatedOps: mergeResult.deduplicatedCount,
          queueConflicts: mergeResult.conflicts,
          retrySchedule,
          skippedOffline: false,
          summaryKo: `시연 전송 실패(${reason}) → 현재 세션 메모리의 재시도 큐 ${retried}건 예약(영구 저장 아님)`,
        });
      }
    },

    resolveManualConflict(conflictId, winner, nowMs = Date.now()) {
      const target = state.conflicts.find((c) => c.conflictId === conflictId && c.resolution === "pending-manual");
      if (!target) return false;
      const chosen = winner === "local" ? target.localRecord : target.remoteRecord;
      const nextLamport = Math.max(state.lamportClock, target.localRecord.lamport, target.remoteRecord.lamport) + 1;
      const resolvedRecord: SyncEntityRecord = Object.freeze({ ...chosen, lamport: nextLamport, updatedAtMs: nowMs });
      state = {
        ...state,
        lamportClock: nextLamport,
        records: { ...state.records, [recordKey(target.surface, target.entityId)]: resolvedRecord },
        conflicts: state.conflicts.map((c) =>
          c.conflictId === conflictId
            ? Object.freeze({ ...c, resolution: winner === "local" ? "local-wins" : "remote-wins", resolvedRecord })
            : c,
        ),
      };
      persist();
      return true;
    },

    exportSnapshotJson: () => JSON.stringify(state, null, 2),
  };
}
