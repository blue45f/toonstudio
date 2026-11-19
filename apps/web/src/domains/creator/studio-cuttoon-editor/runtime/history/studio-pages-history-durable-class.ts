import { studioAutosaveDocumentBusy } from "../../../studio-autosave-opfs-session";
import type { StudioAutosaveDocumentLockManagerLike } from "../../../studio-autosave-document-leader";
import type { StudioLocalDatabase } from "../../../studio-local-database";
import type { StudioOpfsStorageManagerLike } from "../../../studio-opfs-filesystem";
import type {
  StudioOpfsRecoveryAppendInput,
  StudioOpfsRecoveryCheckpointInput,
  StudioOpfsRecoveryEntry,
  StudioOpfsRecoveryMutationOptions,
  StudioOpfsRecoveryScan,
  StudioOpfsRecoveryWriterLease,
} from "../../../studio-opfs-recovery-journal";
import type { StudioCompatibleRecoveryVaultCallbacks } from "../../../studio-opfs-recovery-runtime";
import type {
  StudioHistoryJournalNavigationResult,
  StudioHistoryJournalNavigationTarget,
  StudioHistoryJournalTransitionInput,
} from "../../../studio-pages-history-command-journal";
import { withStudioHistoryCleanup } from "./studio-pages-history-cleanup";

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

/**
 * Synchronous history authority plus one asynchronously serialized durable journal.
 *
 * The selected recovery backend is never replaced during this object's lifetime. A storage
 * failure disables only this durability sidecar; accepted Studio history mutations remain owned
 * by the existing in-memory command journal and are never repeated through another backend.
 */
export class StudioPagesHistoryDurableRuntime {
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
