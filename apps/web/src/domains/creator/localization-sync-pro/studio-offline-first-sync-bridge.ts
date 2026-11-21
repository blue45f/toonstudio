/**
 * T-036 · T-043 · T-044:
 * - Plotr · Tooning Plus · Character Chat · Virtual Studio 통합 오프라인 우선(Local-First) 동기화 브리지
 *   (IndexedDB/로컬 스냅샷 권위 유지, 낙관적 동기화, 필드 단위 충돌 머지, 지수 백오프 오프라인 큐 재시도)
 * - 가상 스튜디오 근접 원고 합평 테이블 & 화면공유 시그널링 상태 머신 재수출
 */

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
  readonly backend: "indexeddb-mirror" | "local-storage" | "memory";
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
  readonly authority: "local-first";
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

export function createBrowserSnapshotStore(namespace = "toonstudio:local-first-sync:v1"): LocalSnapshotStore {
  const hasLocalStorage = typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  const hasIdb = typeof globalThis !== "undefined" && "indexedDB" in globalThis;
  const fallback = createMemorySnapshotStore();

  const mirrorToIndexedDb = (key: string, value: string): void => {
    if (!hasIdb) return;
    try {
      const request = globalThis.indexedDB.open("toonstudio_offline_sync_v1", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots");
      };
      request.onsuccess = () => {
        try {
          const db = request.result;
          db.transaction("snapshots", "readwrite").objectStore("snapshots").put(value, `${namespace}:${key}`);
        } catch { /* 로컬스토리지 권위가 이미 저장됨 */ }
      };
    } catch { /* 사생활 보호 모드 등 IDB 미지원 시 무시 */ }
  };

  if (!hasLocalStorage) return fallback;
  return {
    backend: hasIdb ? "indexeddb-mirror" : "local-storage",
    read: (key) => {
      try { return window.localStorage.getItem(`${namespace}:${key}`); }
      catch { return fallback.read(key); }
    },
    write: (key, value) => {
      try { window.localStorage.setItem(`${namespace}:${key}`, value); }
      catch { fallback.write(key, value); }
      mirrorToIndexedDb(key, value);
    },
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
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, Math.floor(retryCount)));
}

export interface OfflineFirstSyncBridge {
  getState(): OfflineSyncSnapshotDocument;
  setNetworkStatus(status: SyncNetworkStatus): OfflineSyncSnapshotDocument;
  enqueueLocalMutation(input: {
    readonly surface: SyncStudioSurface;
    readonly entityId: string;
    readonly patch: Readonly<Record<string, string | number | boolean | null>>;
    readonly actorId?: string;
    readonly nowMs?: number;
  }): { readonly record: SyncEntityRecord; readonly operation: SyncQueueOperation };
  syncNow(
    transport: RemoteSyncTransport,
    options?: { readonly strategy?: ConflictResolutionStrategy; readonly nowMs?: number },
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
      authority: "local-first",
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
  persist();

  return {
    getState: () => state,

    setNetworkStatus(status) {
      state = { ...state, networkStatus: status };
      persist();
      return state;
    },

    enqueueLocalMutation({ surface, entityId, patch, actorId = "author-local", nowMs = Date.now() }) {
      const nextLamport = state.lamportClock + 1;
      const key = recordKey(surface, entityId);
      const existing = state.records[key];
      const nextRecord: SyncEntityRecord = Object.freeze({
        surface,
        entityId,
        lamport: nextLamport,
        updatedAtMs: nowMs,
        actorId,
        payload: Object.freeze({ ...(existing?.payload ?? {}), ...patch }),
      });

      const operation: SyncQueueOperation = Object.freeze({
        opId: `op-${surface}-${entityId}-${nextLamport}`,
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

      const coalesced = state.queue.filter((op) => !(op.status === "pending" && op.surface === surface && op.entityId === entityId));
      const existingPending = state.queue.find((op) => op.status === "pending" && op.surface === surface && op.entityId === entityId);
      const finalOp: SyncQueueOperation = existingPending
        ? Object.freeze({ ...operation, patch: Object.freeze({ ...existingPending.patch, ...patch }) })
        : operation;

      state = { ...state, lamportClock: nextLamport, records: { ...state.records, [key]: nextRecord }, queue: [...coalesced, finalOp] };
      persist();
      return { record: nextRecord, operation: finalOp };
    },

    async syncNow(transport, syncOptions = {}) {
      const nowMs = syncOptions.nowMs ?? Date.now();
      const strategy = syncOptions.strategy ?? "field-level-merge";
      if (state.networkStatus === "offline") {
        const waitingCount = state.queue.filter((q) => q.status === "pending" || q.status === "retrying").length;
        return Object.freeze({
          attempted: 0, synced: 0, retried: 0, failed: 0, mergedConflicts: 0, manualConflicts: 0, skippedOffline: true,
          summaryKo: `오프라인 상태입니다. 대기 작업 ${waitingCount}건이 로컬 스냅샷에 안전 보관 중입니다.`,
        });
      }

      const eligible = state.queue.filter((op) => (op.status === "pending" || op.status === "retrying") && op.nextRetryAtMs <= nowMs);
      if (eligible.length === 0) {
        return Object.freeze({
          attempted: 0, synced: 0, retried: 0, failed: 0, mergedConflicts: 0, manualConflicts: 0, skippedOffline: false,
          summaryKo: "동기화할 대기 변경사항이 없습니다(최신 상태).",
        });
      }

      let synced = 0;
      let retried = 0;
      let failed = 0;
      let mergedConflicts = 0;
      let manualConflicts = 0;

      try {
        const response = await transport.pushOperations(eligible);
        const acceptedSet = new Set(response.acceptedOpIds);
        const rejectedMap = new Map((response.rejected ?? []).map((item) => [item.opId, item.reason]));

        const nextQueue: SyncQueueOperation[] = [];
        for (const op of state.queue) {
          if (acceptedSet.has(op.opId)) { synced += 1; continue; }
          if (rejectedMap.has(op.opId)) {
            const nextRetryCount = op.retryCount + 1;
            const exhausted = nextRetryCount >= op.maxRetries;
            if (exhausted) failed += 1; else retried += 1;
            nextQueue.push(Object.freeze({
              ...op,
              status: exhausted ? "failed" : "retrying",
              retryCount: nextRetryCount,
              nextRetryAtMs: nowMs + computeRetryBackoffMs(nextRetryCount),
              lastError: rejectedMap.get(op.opId),
            }));
          } else {
            nextQueue.push(op);
          }
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
          attempted: eligible.length, synced, retried, failed, mergedConflicts, manualConflicts, skippedOffline: false,
          summaryKo: `낙관적 동기화 완료: 반영 ${synced}건 · 재시도 예약 ${retried}건 · 충돌 병합 ${mergedConflicts}건`,
        });
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : "네트워크 오류";
        const nextQueue = state.queue.map((op) => {
          if (!eligible.some((item) => item.opId === op.opId)) return op;
          const nextRetryCount = op.retryCount + 1;
          const exhausted = nextRetryCount >= op.maxRetries;
          if (exhausted) failed += 1; else retried += 1;
          return Object.freeze({
            ...op,
            status: exhausted ? ("failed" as const) : ("retrying" as const),
            retryCount: nextRetryCount,
            nextRetryAtMs: nowMs + computeRetryBackoffMs(nextRetryCount),
            lastError: reason,
          });
        });
        state = { ...state, networkStatus: "degraded", queue: nextQueue };
        persist();
        return Object.freeze({
          attempted: eligible.length, synced: 0, retried, failed, mergedConflicts: 0, manualConflicts: 0, skippedOffline: false,
          summaryKo: `API 연결 실패(${reason}) → 로컬 스냅샷 보존 및 재시도 큐 ${retried}건 예약`,
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
