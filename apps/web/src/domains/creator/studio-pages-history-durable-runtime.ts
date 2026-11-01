import { HISTORY_RECOVERY_DOCUMENT_VERSION, HISTORY_RECOVERY_ENGINE_VERSION } from "./studio-cuttoon-editor/runtime/history/studio-pages-history-recovery-identity";
import { studioAutosaveDocumentBusy } from "./studio-autosave-opfs-session";
import { withStudioHistoryCleanup } from "./studio-cuttoon-editor/runtime/history/studio-pages-history-cleanup";
import {
  calculateStudioCrc32,
} from "./studio-crc32";
import type { StudioOpfsStorageManagerLike } from "./studio-opfs-filesystem";
import type { StudioAutosaveDocumentLockManagerLike } from "./studio-autosave-document-leader";
import {
  describeStudioOpfsRecoveryJournalError,
  StudioOpfsRecoveryJournalError,
  type StudioOpfsRecoveryAppendInput,
  type StudioOpfsRecoveryCheckpointInput,
  type StudioOpfsRecoveryEntry,
  type StudioOpfsRecoveryEvictionResult,
  type StudioOpfsRecoveryJournalIdentity,
  type StudioOpfsRecoveryMutationOptions,
  type StudioOpfsRecoveryScan,
  type StudioOpfsRecoveryWriterLease,
} from "./studio-opfs-recovery-journal";
import {
  type StudioCompatibleRecoveryVaultCallbacks,
} from "./studio-opfs-recovery-runtime";
import {
  type StudioHistoryJournalNavigationTarget,
  type StudioHistoryJournalNavigationResult,
  type StudioHistoryJournalTransitionInput,
} from "./studio-pages-history-command-journal";

import type {
  StudioLocalDatabase,
} from "./studio-local-database";

const RECOVERY_DATABASE_NAME = "toonstudio-studio-crdt-recovery-vault";
const RECOVERY_DATABASE_VERSION = 1;
const RECOVERY_STORE_NAME = "rejected-frontiers";
const RECOVERY_SCOPE_WORK_INDEX = "scope-work";
const HISTORY_RECOVERY_SCOPE = "studio-pages-history-journal-v1";

const HISTORY_RECOVERY_MAX_ENTRIES = 128;
const HISTORY_RECOVERY_MAX_BYTES = 64 * 1024 * 1024;
const HISTORY_RECOVERY_CHECKPOINT_INTERVAL = 48;
const HISTORY_RECOVERY_COALESCED_IDLE_MS = 350;
const TEXT_ENCODER = new TextEncoder();

export interface StudioPagesHistoryRecoveryPort {
  scanLatest(options?: StudioOpfsRecoveryMutationOptions): Promise<StudioOpfsRecoveryScan>;
  acquireWriter(input: {
    readonly ownerId: string;
    readonly signal?: AbortSignal;
  }): Promise<StudioOpfsRecoveryWriterLease>;
  appendCommand(
    input: StudioOpfsRecoveryAppendInput,
    options?: StudioOpfsRecoveryMutationOptions,
  ): Promise<StudioOpfsRecoveryEntry>;
  compact(
    checkpoint: StudioOpfsRecoveryCheckpointInput,
    options?: StudioOpfsRecoveryMutationOptions,
  ): Promise<StudioOpfsRecoveryEntry>;
  flush(options?: StudioOpfsRecoveryMutationOptions): Promise<void>;
  abort(reason?: unknown): Promise<void>;
  releaseWriter?(): Promise<void>;
  /** Optional durable payload access used to restore the verified command frontier. */
  readLatestPayload?(): Promise<Uint8Array | null>;
}

interface StudioPagesHistoryCommandJournalPort {
  recordTransition(input: StudioHistoryJournalTransitionInput): void;
  recordUndo(
    target: StudioHistoryJournalNavigationTarget,
  ): StudioHistoryJournalNavigationResult;
  recordRedo(
    target: StudioHistoryJournalNavigationTarget,
  ): StudioHistoryJournalNavigationResult;
  rebase(target: StudioHistoryJournalNavigationTarget): void;
  reset(): void;
  serialize(): string;
  replayPlan(): unknown;
}

interface StoredHistoryRecoveryLease {
  readonly documentId: string;
  readonly ownerId: string;
  readonly token: string;
  readonly epoch: number;
  readonly acquiredAt: number;
  readonly expiresAt: number;
}

interface StoredHistoryRecoveryEntry {
  readonly kind: "operation" | "checkpoint";
  readonly id: string;
  readonly sequence: number;
  readonly pageId: string;
  readonly revision: number;
  readonly createdAt: number;
  readonly writerEpoch: number;
  readonly compactThroughSequence: number | null;
  readonly payload: Uint8Array;
  readonly crc32: number;
}

interface StoredHistoryRecoveryState {
  readonly kind: "studio-pages-history-recovery-v1";
  readonly key: string;
  readonly scope: typeof HISTORY_RECOVERY_SCOPE;
  readonly workId: string;
  readonly documentId: string;
  readonly documentVersion: typeof HISTORY_RECOVERY_DOCUMENT_VERSION;
  readonly engineVersion: typeof HISTORY_RECOVERY_ENGINE_VERSION;
  readonly generation: number;
  readonly writerEpoch: number;
  readonly lastSequence: number;
  readonly lease: StoredHistoryRecoveryLease | null;
  readonly entries: readonly StoredHistoryRecoveryEntry[];
}

interface StudioPagesHistoryDurableRuntimeOptions {
  readonly commandJournal: StudioPagesHistoryCommandJournalPort;
  readonly recovery: StudioPagesHistoryRecoveryPort;
  readonly initialScan: StudioOpfsRecoveryScan;
  readonly pageId: string;
  readonly eventTarget?: {
    addEventListener(type: "pagehide", listener: () => void): void;
    removeEventListener(type: "pagehide", listener: () => void): void;
  } | null;
  readonly onError?: (cause: unknown) => void;
  readonly persistenceKind?: StudioPagesHistoryPersistenceKind;
  readonly initialDurabilityCause?: unknown;
  readonly releaseDocumentLease?: () => Promise<void>;
  readonly onDurabilityStatus?: (status: StudioPagesHistoryDurabilityStatus) => void;
}

export type StudioPagesHistoryPersistenceKind =
  | "sqlite-opfs"
  | "native-opfs"
  | "legacy-indexeddb"
  | "memory-only";

export type StudioPagesHistoryDurabilityState = "durable" | "memory-only";

export interface StudioPagesHistoryDurabilityStatus {
  readonly state: StudioPagesHistoryDurabilityState;
  readonly durable: boolean;
  readonly persistenceKind: StudioPagesHistoryPersistenceKind;
  readonly retryable: boolean;
  readonly cause: unknown;
}

function historyDurabilityStatus(
  persistenceKind: StudioPagesHistoryPersistenceKind,
  cause: unknown = null,
): StudioPagesHistoryDurabilityStatus {
  const durable = persistenceKind !== "memory-only";
  return Object.freeze({
    state: durable ? "durable" : "memory-only",
    durable,
    persistenceKind,
    retryable: !durable,
    cause,
  });
}

export class StudioPagesHistoryDurabilityUnavailableError extends Error {
  readonly code = "STUDIO_HISTORY_DURABILITY_UNAVAILABLE";
  readonly causes: readonly unknown[];

  constructor(causes: readonly unknown[]) {
    super(
      "페이지 실행 취소 기록을 영구 저장할 수 없어 이 탭의 메모리에서만 유지합니다.",
      { cause: causes.at(-1) },
    );
    this.name = "StudioPagesHistoryDurabilityUnavailableError";
    this.causes = Object.freeze([...causes]);
  }
}

export interface CreateDefaultStudioPagesHistoryDurableRuntimeOptions {
  readonly initialTarget: StudioHistoryJournalNavigationTarget | null;
  readonly onError?: (cause: unknown) => void;
  readonly onDurabilityStatus?: (status: StudioPagesHistoryDurabilityStatus) => void;
  /** Test/embedding seam; production opens the OPFS SAH-pool SQLite database. */
  readonly openDatabase?: () => Promise<StudioLocalDatabase>;
  /** Set false only to exercise or embed the native-OPFS authority directly. */
  readonly preferSqlite?: boolean;
  /**
   * Explicit legacy/emergency seam. Product boot never constructs or passes an IndexedDB vault.
   * The caller must opt in and owns explaining this compatibility authority to the user.
   */
  readonly legacyRecoveryVault?: StudioCompatibleRecoveryVaultCallbacks | null;
}

export interface BrowserRecoveryScope {
  readonly indexedDB?: IDBFactory;
  readonly navigator?: {
    readonly storage?: Partial<StudioOpfsStorageManagerLike>;
    readonly locks?: StudioAutosaveDocumentLockManagerLike;
  };
  readonly crypto?: {
    readonly randomUUID?: () => string;
  };
  readonly addEventListener?: typeof globalThis.addEventListener;
  readonly removeEventListener?: typeof globalThis.removeEventListener;
}

function recoveryStateKey(documentId: string): string {
  return JSON.stringify([HISTORY_RECOVERY_SCOPE, documentId, "state"]);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error ?? new Error("Studio history recovery IndexedDB 요청이 실패했습니다."),
    );
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
      transaction.error ?? new DOMException("aborted", "AbortError"),
    );
    transaction.onerror = () => reject(
      transaction.error ?? new Error("Studio history recovery transaction이 실패했습니다."),
    );
  });
}

function openRecoveryDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(RECOVERY_DATABASE_NAME, RECOVERY_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(RECOVERY_STORE_NAME)
        ? request.transaction?.objectStore(RECOVERY_STORE_NAME)
        : database.createObjectStore(RECOVERY_STORE_NAME, { keyPath: "key" });
      if (store && !store.indexNames.contains(RECOVERY_SCOPE_WORK_INDEX)) {
        store.createIndex(RECOVERY_SCOPE_WORK_INDEX, ["scope", "workId"], {
          unique: false,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error ?? new Error("Studio history recovery IndexedDB를 열지 못했습니다."),
    );
    request.onblocked = () => reject(
      new Error("다른 탭이 Studio history recovery IndexedDB 갱신을 차단했습니다."),
    );
  });
}

function emptyRecoveryState(
  identity: StudioOpfsRecoveryJournalIdentity,
): StoredHistoryRecoveryState {
  return {
    kind: "studio-pages-history-recovery-v1",
    key: recoveryStateKey(identity.documentId),
    scope: HISTORY_RECOVERY_SCOPE,
    workId: identity.documentId,
    documentId: identity.documentId,
    documentVersion: HISTORY_RECOVERY_DOCUMENT_VERSION,
    engineVersion: HISTORY_RECOVERY_ENGINE_VERSION,
    generation: 0,
    writerEpoch: 0,
    lastSequence: 0,
    lease: null,
    entries: Object.freeze([]),
  };
}

function validStoredEntry(value: unknown): value is StoredHistoryRecoveryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<StoredHistoryRecoveryEntry>;
  return (
    (entry.kind === "operation" || entry.kind === "checkpoint")
    && typeof entry.id === "string"
    && entry.id.length > 0
    && typeof entry.pageId === "string"
    && entry.pageId.length > 0
    && Number.isSafeInteger(entry.sequence)
    && (entry.sequence ?? 0) > 0
    && Number.isSafeInteger(entry.revision)
    && (entry.revision ?? -1) >= 0
    && Number.isSafeInteger(entry.createdAt)
    && (entry.createdAt ?? -1) >= 0
    && Number.isSafeInteger(entry.writerEpoch)
    && (entry.writerEpoch ?? 0) > 0
    && (
      entry.compactThroughSequence === null
      || (
        Number.isSafeInteger(entry.compactThroughSequence)
        && (entry.compactThroughSequence ?? -1) >= 0
      )
    )
    && entry.payload instanceof Uint8Array
    && entry.payload.byteLength <= HISTORY_RECOVERY_MAX_BYTES
    && Number.isSafeInteger(entry.crc32)
    && calculateStudioCrc32(entry.payload) === entry.crc32
  );
}

function validStoredLease(
  value: unknown,
  documentId: string,
): value is StoredHistoryRecoveryLease {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const lease = value as Partial<StoredHistoryRecoveryLease>;
  return (
    lease.documentId === documentId
    && typeof lease.ownerId === "string"
    && lease.ownerId.length > 0
    && typeof lease.token === "string"
    && lease.token.length > 0
    && Number.isSafeInteger(lease.epoch)
    && (lease.epoch ?? 0) > 0
    && Number.isSafeInteger(lease.acquiredAt)
    && Number.isSafeInteger(lease.expiresAt)
    && (lease.expiresAt ?? 0) > (lease.acquiredAt ?? 0)
  );
}

function parseRecoveryState(
  value: unknown,
  identity: StudioOpfsRecoveryJournalIdentity,
): StoredHistoryRecoveryState {
  if (value === undefined) return emptyRecoveryState(identity);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StudioOpfsRecoveryJournalError(
      "CORRUPT_MANIFEST",
      "IndexedDB history recovery manifest가 손상되었습니다.",
    );
  }
  const state = value as Partial<StoredHistoryRecoveryState>;
  const entries = state.entries;
  if (
    state.kind !== "studio-pages-history-recovery-v1"
    || state.key !== recoveryStateKey(identity.documentId)
    || state.scope !== HISTORY_RECOVERY_SCOPE
    || state.workId !== identity.documentId
    || state.documentId !== identity.documentId
    || state.documentVersion !== identity.documentVersion
    || state.engineVersion !== identity.engineVersion
    || !Number.isSafeInteger(state.generation)
    || (state.generation ?? -1) < 0
    || !Number.isSafeInteger(state.writerEpoch)
    || (state.writerEpoch ?? -1) < 0
    || !Number.isSafeInteger(state.lastSequence)
    || (state.lastSequence ?? -1) < 0
    || !Array.isArray(entries)
    || entries.length > HISTORY_RECOVERY_MAX_ENTRIES
    || !entries.every(validStoredEntry)
    || !(
      state.lease === null
      || validStoredLease(state.lease, identity.documentId)
    )
  ) {
    throw new StudioOpfsRecoveryJournalError(
      "CORRUPT_MANIFEST",
      "IndexedDB history recovery manifest 계약이 손상되었습니다.",
    );
  }
  let previousSequence = 0;
  let totalBytes = 0;
  for (const entry of entries) {
    if (entry.sequence <= previousSequence) {
      throw new StudioOpfsRecoveryJournalError(
        "CORRUPT_MANIFEST",
        "IndexedDB history recovery sequence가 단조 증가하지 않습니다.",
      );
    }
    previousSequence = entry.sequence;
    totalBytes += entry.payload.byteLength;
  }
  if (
    previousSequence > (state.lastSequence ?? 0)
    || totalBytes > HISTORY_RECOVERY_MAX_BYTES
  ) {
    throw new StudioOpfsRecoveryJournalError(
      "CORRUPT_MANIFEST",
      "IndexedDB history recovery 집계가 한도를 벗어났습니다.",
    );
  }
  return state as StoredHistoryRecoveryState;
}

async function collectRecoveryPayload(
  input: StudioOpfsRecoveryAppendInput,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  let payload: Uint8Array;
  if (input.payload instanceof Uint8Array) {
    payload = new Uint8Array(input.payload);
  } else if (input.payload instanceof Blob) {
    payload = new Uint8Array(await input.payload.arrayBuffer());
  } else {
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const chunk of input.payload) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      length += chunk.byteLength;
      if (length > HISTORY_RECOVERY_MAX_BYTES) {
        throw new StudioOpfsRecoveryJournalError(
          "ENTRY_TOO_LARGE",
          "IndexedDB history recovery payload 한도를 초과했습니다.",
        );
      }
      chunks.push(new Uint8Array(chunk));
    }
    payload = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      payload.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  if (
    payload.byteLength > HISTORY_RECOVERY_MAX_BYTES
    || (
      input.byteLength !== undefined
      && input.byteLength !== payload.byteLength
    )
  ) {
    throw new StudioOpfsRecoveryJournalError(
      payload.byteLength > HISTORY_RECOVERY_MAX_BYTES
        ? "ENTRY_TOO_LARGE"
        : "INVALID_ARGUMENT",
      "IndexedDB history recovery payload 크기가 올바르지 않습니다.",
    );
  }
  return payload;
}

function publicRecoveryEntry(
  identity: StudioOpfsRecoveryJournalIdentity,
  entry: StoredHistoryRecoveryEntry,
): StudioOpfsRecoveryEntry {
  return Object.freeze({
    kind: entry.kind,
    id: entry.id,
    sequence: entry.sequence,
    pageId: entry.pageId,
    revision: entry.revision,
    documentId: identity.documentId,
    documentVersion: identity.documentVersion,
    engineVersion: identity.engineVersion,
    writerEpoch: entry.writerEpoch,
    createdAt: entry.createdAt,
    byteLength: entry.payload.byteLength,
    chunks: Object.freeze([]),
    compactThroughSequence: entry.compactThroughSequence,
    descriptorPath: `indexeddb-${entry.sequence}`,
    descriptorCrc32: entry.crc32,
  });
}

function publicRecoveryScan(
  identity: StudioOpfsRecoveryJournalIdentity,
  state: StoredHistoryRecoveryState,
): StudioOpfsRecoveryScan {
  return Object.freeze({
    generation: state.generation,
    writerEpoch: state.writerEpoch,
    lastSequence: state.lastSequence,
    totalPayloadBytes: state.entries.reduce(
      (total, entry) => total + entry.payload.byteLength,
      0,
    ),
    entries: Object.freeze(
      state.entries.map((entry) => publicRecoveryEntry(identity, entry)),
    ),
    selectedSlot: null,
    ignoredSlots: Object.freeze([]),
  });
}

function sameWriter(
  stored: StoredHistoryRecoveryLease | null,
  writer: StudioOpfsRecoveryWriterLease,
): stored is StoredHistoryRecoveryLease {
  return Boolean(
    stored
    && stored.documentId === writer.documentId
    && stored.ownerId === writer.ownerId
    && stored.token === writer.token
    && stored.epoch === writer.epoch
    && stored.expiresAt === writer.expiresAt,
  );
}

export function createStudioPagesHistoryIndexedDbRecoveryVault(input: {
  readonly identity: StudioOpfsRecoveryJournalIdentity;
  readonly indexedDB: IDBFactory | null;
  readonly now?: () => number;
  readonly randomToken?: () => string;
}): StudioCompatibleRecoveryVaultCallbacks {
  const now = input.now ?? Date.now;
  const randomToken = input.randomToken ?? (() => {
    if (typeof globalThis.crypto?.randomUUID !== "function") {
      throw new Error("IndexedDB history recovery writer token을 만들 수 없습니다.");
    }
    return `vault-${globalThis.crypto.randomUUID()}`;
  });
  const compatible = input.indexedDB !== null;

  async function withState<T>(
    mode: IDBTransactionMode,
    signal: AbortSignal | undefined,
    operation: (
      state: StoredHistoryRecoveryState,
      store: IDBObjectStore,
    ) => T | Promise<T>,
  ): Promise<T> {
    if (!input.indexedDB) {
      throw new StudioOpfsRecoveryJournalError(
        "OPFS_UNAVAILABLE",
        "IndexedDB history recovery vault를 사용할 수 없습니다.",
      );
    }
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const database = await openRecoveryDatabase(input.indexedDB);
    const transaction = database.transaction(RECOVERY_STORE_NAME, mode, {
      durability: "strict",
    });
    const abort = () => transaction.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const done = transactionDone(transaction);
    try {
      const store = transaction.objectStore(RECOVERY_STORE_NAME);
      const value = await requestResult(store.get(recoveryStateKey(input.identity.documentId)));
      const result = await operation(
        parseRecoveryState(value, input.identity),
        store,
      );
      await done;
      return result;
    } finally {
      signal?.removeEventListener("abort", abort);
      database.close();
    }
  }

  async function append(
    kind: "operation" | "checkpoint",
    writer: StudioOpfsRecoveryWriterLease,
    value: StudioOpfsRecoveryAppendInput,
    compactThroughSequence: number | null,
    options: StudioOpfsRecoveryMutationOptions = {},
  ): Promise<StudioOpfsRecoveryEntry> {
    const payload = await collectRecoveryPayload(value, options.signal);
    return withState("readwrite", options.signal, async (state, store) => {
      if (!sameWriter(state.lease, writer) || state.lease.expiresAt <= now()) {
        throw new StudioOpfsRecoveryJournalError(
          "LEASE_LOST",
          "IndexedDB history recovery writer lease가 만료되었습니다.",
        );
      }
      const nextSequence = state.lastSequence + 1;
      const retained = kind === "checkpoint"
        ? state.entries.filter((entry) => (
          entry.pageId !== value.pageId
          || entry.sequence > (compactThroughSequence ?? state.lastSequence)
        ))
        : [...state.entries];
      if (
        kind === "operation"
        && (
          retained.length >= HISTORY_RECOVERY_MAX_ENTRIES
          || retained.reduce((total, entry) => total + entry.payload.byteLength, 0)
            + payload.byteLength > HISTORY_RECOVERY_MAX_BYTES
        )
      ) {
        throw new StudioOpfsRecoveryJournalError(
          "COMPACTION_REQUIRED",
          "IndexedDB history recovery vault compaction이 필요합니다.",
        );
      }
      const stored: StoredHistoryRecoveryEntry = {
        kind,
        id: value.id,
        sequence: nextSequence,
        pageId: value.pageId,
        revision: value.revision,
        createdAt: value.createdAt ?? now(),
        writerEpoch: writer.epoch,
        compactThroughSequence,
        payload,
        crc32: calculateStudioCrc32(payload),
      };
      const next: StoredHistoryRecoveryState = {
        ...state,
        generation: state.generation + 1,
        writerEpoch: writer.epoch,
        lastSequence: nextSequence,
        entries: Object.freeze([...retained, stored]),
      };
      store.put(next);
      return publicRecoveryEntry(input.identity, stored);
    });
  }

  return {
    compatible,
    scan(options = {}) {
      return withState("readonly", options.signal, (state) => (
        publicRecoveryScan(input.identity, state)
      ));
    },
    acquireWriter({ ownerId, signal }) {
      return withState("readwrite", signal, async (state, store) => {
        const acquiredAt = now();
        if (state.lease && state.lease.expiresAt > acquiredAt) {
          // 사용자 문구와 내부 식별자를 분리한다 — OPFS 저널 쪽과 같은 계약.
          const busy = new StudioOpfsRecoveryJournalError(
            "LEASE_BUSY",
            "이 작품의 작업 내역 복구 저장소를 다른 탭이나 창이 사용하고 있어요.",
            {
              diagnostics:
                `lease ownerId=${state.lease.ownerId} epoch=${state.lease.epoch}`
                + ` expiresInMs=${state.lease.expiresAt - acquiredAt}`,
            },
          );
          console.warn(describeStudioOpfsRecoveryJournalError(busy));
          throw busy;
        }
        const lease: StoredHistoryRecoveryLease = {
          documentId: input.identity.documentId,
          ownerId,
          token: randomToken(),
          epoch: state.writerEpoch + 1,
          acquiredAt,
          expiresAt: acquiredAt + 30_000,
        };
        store.put({
          ...state,
          writerEpoch: lease.epoch,
          lease,
        } satisfies StoredHistoryRecoveryState);
        return Object.freeze({ ...lease });
      });
    },
    renewWriter(writer, options = {}) {
      return withState("readwrite", options.signal, async (state, store) => {
        if (!sameWriter(state.lease, writer) || state.lease.expiresAt <= now()) {
          throw new StudioOpfsRecoveryJournalError(
            "LEASE_LOST",
            "IndexedDB history recovery writer lease를 갱신할 수 없습니다.",
          );
        }
        const acquiredAt = now();
        const renewed: StoredHistoryRecoveryLease = {
          ...state.lease,
          acquiredAt,
          expiresAt: acquiredAt + 30_000,
        };
        store.put({ ...state, lease: renewed } satisfies StoredHistoryRecoveryState);
        return Object.freeze({ ...renewed });
      });
    },
    releaseWriter(writer, options = {}) {
      return withState("readwrite", options.signal, async (state, store) => {
        if (sameWriter(state.lease, writer)) {
          store.put({ ...state, lease: null } satisfies StoredHistoryRecoveryState);
        }
      });
    },
    appendOperation(writer, value, options = {}) {
      return append("operation", writer, value, null, options);
    },
    appendCheckpoint(writer, value, options = {}) {
      return append(
        "checkpoint",
        writer,
        value,
        value.compactThroughSequence,
        options,
      );
    },
    compact(writer, value, options = {}) {
      return append(
        "checkpoint",
        writer,
        value,
        value.compactThroughSequence,
        options,
      );
    },
    async cleanupQuota(): Promise<StudioOpfsRecoveryEvictionResult> {
      return Object.freeze({
        removedPaths: Object.freeze([]),
        freedBytes: 0,
      });
    },
    async flush(): Promise<void> {
      // Each state transition awaits a strict IndexedDB transaction before resolving.
    },
  };
}

/**
 * Synchronous history authority plus one asynchronously serialized durable journal.
 *
 * The selected recovery backend is never replaced during this object's lifetime. A storage
 * failure disables only this durability sidecar; accepted Studio history mutations remain owned
 * by the existing in-memory command journal and are never repeated through another backend.
 */
export class StudioPagesHistoryDurableRuntime
{
  readonly #commandJournal: StudioPagesHistoryCommandJournalPort;
  readonly #recovery: StudioPagesHistoryRecoveryPort;
  readonly #pageId: string;
  readonly #onError: ((cause: unknown) => void) | undefined;
  readonly #onDurabilityStatus:
    | ((status: StudioPagesHistoryDurabilityStatus) => void)
    | undefined;
  readonly persistenceKind: StudioPagesHistoryPersistenceKind;
  #durabilityStatus: StudioPagesHistoryDurabilityStatus;
  #lastSequence: number;
  #revision: number;
  #writesSinceCheckpoint = 0;
  #tail: Promise<void> = Promise.resolve();
  #durabilityFailed = false;
  #disposed = false;
  #closePromise: Promise<void> | null = null;
  readonly #releaseDocumentLease: (() => Promise<void>) | undefined;
  #removePageHide: (() => void) | null = null;
  #coalescedTimer: ReturnType<typeof setTimeout> | null = null;
  #coalescedPending = false;

  constructor(options: StudioPagesHistoryDurableRuntimeOptions) {
    this.#commandJournal = options.commandJournal;
    this.#recovery = options.recovery;
    this.#releaseDocumentLease = options.releaseDocumentLease;
    this.#pageId = options.pageId;
    this.#onError = options.onError;
    this.#onDurabilityStatus = options.onDurabilityStatus;
    this.persistenceKind = options.persistenceKind ?? "memory-only";
    this.#durabilityStatus = historyDurabilityStatus(
      this.persistenceKind,
      options.initialDurabilityCause,
    );
    this.#lastSequence = options.initialScan.lastSequence;
    this.#revision = options.initialScan.entries.at(-1)?.revision ?? 0;
    const target = options.eventTarget;
    if (target) {
      const listener = () => {
        void this.flush().catch((cause: unknown) => this.#reportFailure(cause));
      };
      target.addEventListener("pagehide", listener);
      this.#removePageHide = () => target.removeEventListener("pagehide", listener);
    }
    this.#publishDurabilityStatus();
  }

  #publishDurabilityStatus(): void {
    try {
      this.#onDurabilityStatus?.(this.#durabilityStatus);
    } catch {
      // Status observers cannot escape into the accepted edit path.
    }
  }

  #reportFailure(cause: unknown): void {
    if (this.#durabilityFailed) return;
    this.#durabilityFailed = true;
    this.#durabilityStatus = historyDurabilityStatus("memory-only", cause);
    this.#publishDurabilityStatus();
    if (studioAutosaveDocumentBusy(cause)) return;
    try {
      this.#onError?.(cause);
    } catch {
      // A diagnostic callback cannot escape into the accepted edit path.
    }
  }

  #enqueue(checkpoint: boolean): void {
    if (this.#disposed || this.#durabilityFailed) return;
    const payload = TEXT_ENCODER.encode(this.#commandJournal.serialize());
    const revision = ++this.#revision;
    const shouldCheckpoint =
      checkpoint
      || ++this.#writesSinceCheckpoint >= HISTORY_RECOVERY_CHECKPOINT_INTERVAL;
    if (shouldCheckpoint) this.#writesSinceCheckpoint = 0;
    this.#tail = this.#tail.then(async () => {
      if (this.#durabilityFailed) return;
      const common = {
        id: `${shouldCheckpoint ? "checkpoint" : "command"}-${revision}`,
        pageId: this.#pageId,
        revision,
        payload,
        byteLength: payload.byteLength,
      } as const;
      const entry = shouldCheckpoint
        ? await this.#recovery.compact({
            ...common,
            compactThroughSequence: this.#lastSequence,
          })
        : await this.#recovery.appendCommand(common);
      this.#lastSequence = entry.sequence;
    }).catch((cause: unknown) => {
      this.#reportFailure(cause);
    });
  }

  #clearCoalescedTimer(): boolean {
    if (this.#coalescedTimer !== null) {
      clearTimeout(this.#coalescedTimer);
      this.#coalescedTimer = null;
    }
    const pending = this.#coalescedPending;
    this.#coalescedPending = false;
    return pending;
  }

  #scheduleCoalescedWrite(): void {
    this.#clearCoalescedTimer();
    this.#coalescedPending = true;
    this.#coalescedTimer = setTimeout(() => {
      this.#coalescedTimer = null;
      if (!this.#coalescedPending) return;
      this.#coalescedPending = false;
      this.#enqueue(false);
    }, HISTORY_RECOVERY_COALESCED_IDLE_MS);
  }

  #flushCoalescedWrite(): void {
    if (this.#clearCoalescedTimer()) this.#enqueue(false);
  }

  recordTransition(input: StudioHistoryJournalTransitionInput): void {
    this.#commandJournal.recordTransition(input);
    if (input.coalesceKey !== undefined) {
      this.#scheduleCoalescedWrite();
    } else {
      this.#clearCoalescedTimer();
      this.#enqueue(false);
    }
  }

  recordUndo(
    target: StudioHistoryJournalNavigationTarget,
  ): StudioHistoryJournalNavigationResult {
    const result = this.#commandJournal.recordUndo(target);
    this.#clearCoalescedTimer();
    this.#enqueue(false);
    return result;
  }

  recordRedo(
    target: StudioHistoryJournalNavigationTarget,
  ): StudioHistoryJournalNavigationResult {
    const result = this.#commandJournal.recordRedo(target);
    this.#clearCoalescedTimer();
    this.#enqueue(false);
    return result;
  }

  rebase(target: StudioHistoryJournalNavigationTarget): void {
    this.#commandJournal.rebase(target);
    this.#clearCoalescedTimer();
    this.#enqueue(true);
  }

  reset(): void {
    this.#commandJournal.reset();
    this.#clearCoalescedTimer();
    this.#enqueue(true);
  }

  replayPlan() {
    return this.#commandJournal.replayPlan();
  }

  serialize(): string {
    return this.#commandJournal.serialize();
  }

  durabilityStatus(): StudioPagesHistoryDurabilityStatus {
    return this.#durabilityStatus;
  }

  async flush(): Promise<void> {
    this.#flushCoalescedWrite();
    await this.#tail;
    if (!this.#durabilityFailed) await this.#recovery.flush();
  }

  dispose(): void {
    void this.close();
  }

  close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    this.#flushCoalescedWrite();
    this.#disposed = true;
    this.#removePageHide?.();
    this.#removePageHide = null;
    const close = () => withStudioHistoryCleanup(
      () => this.#recovery.abort("history-runtime-disposed"),
      async () => this.#releaseDocumentLease?.(),
    );
    this.#closePromise = this.#tail.then(close, close);
    return this.#closePromise;
  }
}

export { createDefaultStudioPagesHistoryDurableRuntime } from "./studio-cuttoon-editor/runtime/history/studio-pages-history-durable-factory";
