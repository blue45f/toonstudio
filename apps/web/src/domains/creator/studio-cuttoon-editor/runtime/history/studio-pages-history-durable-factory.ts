import { calculateStudioCrc32 } from "../../../studio-crc32";
import { acquireStudioLocalDatabase } from "../../../studio-local-database-runtime";
import { selectStudioOpfsFileSystem, type StudioOpfsFileSystemSelection } from "../../../studio-opfs-filesystem";
import { createStudioOpfsRecoveryJournal, createStudioOpfsRecoveryJournalAdapter,
  type StudioOpfsRecoveryAppendInput, type StudioOpfsRecoveryCheckpointInput,
  type StudioOpfsRecoveryEntry, type StudioOpfsRecoveryJournalIdentity,
  type StudioOpfsRecoveryScan, type StudioOpfsRecoveryWriterLease } from "../../../studio-opfs-recovery-journal";
import { createStudioOpfsRecoveryRuntime, type StudioOpfsRecoveryRuntime } from "../../../studio-opfs-recovery-runtime";
import { createStudioPagesHistoryCommandJournal, restoreStudioPagesHistoryCommandJournal,
} from "../../../studio-pages-history-command-journal";
import { createStudioPagesHistorySqliteRecovery } from "../../../studio-pages-history-sqlite-recovery";
import { requestStudioAutosaveDocumentLeadership } from "../../../studio-autosave-document-leader";
import { StudioAutosaveDocumentBusyError } from "../../../studio-autosave-opfs-error";
import { createStudioPagesHistoryWriterSession } from "./studio-pages-history-writer-session";
import { hashStudioPagesHistoryIdentity, studioPagesHistoryRecoveryIdentity, studioPagesHistoryRecoveryPageId, studioPagesHistoryDocumentKey } from "./studio-pages-history-recovery-identity";
import { withStudioHistoryCleanup } from "./studio-pages-history-cleanup";
import { StudioPagesHistoryDurableRuntime, StudioPagesHistoryDurabilityUnavailableError,
  type BrowserRecoveryScope, type CreateDefaultStudioPagesHistoryDurableRuntimeOptions,
  type StudioPagesHistoryRecoveryPort, type StudioPagesHistoryPersistenceKind } from "../../../studio-pages-history-durable-runtime";

const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

/** 두 영속 backend가 실패해도 편집·실행 취소는 유지하고 메모리 전용 상태를 명시한다. */
function createStudioPagesHistoryMemoryRecovery(
  identity: StudioOpfsRecoveryJournalIdentity,
): StudioPagesHistoryRecoveryPort {
  let sequence = 0;
  let writerEpoch = 0;
  let latestPayload: Uint8Array | null = null;
  const entries: StudioOpfsRecoveryEntry[] = [];
  const payloadBytes = async (
    source: StudioOpfsRecoveryAppendInput["payload"],
  ): Promise<Uint8Array> => {
    if (source instanceof Uint8Array) return new Uint8Array(source);
    if (source instanceof Blob) return new Uint8Array(await source.arrayBuffer());
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    for await (const chunk of source) {
      chunks.push(chunk);
      byteLength += chunk.byteLength;
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  };
  const append = async (
    kind: "operation" | "checkpoint",
    input: StudioOpfsRecoveryAppendInput | StudioOpfsRecoveryCheckpointInput,
  ): Promise<StudioOpfsRecoveryEntry> => {
    const payload = await payloadBytes(input.payload);
    sequence += 1;
    latestPayload = payload;
    const entry = Object.freeze({
      kind,
      id: input.id,
      sequence,
      pageId: input.pageId,
      revision: input.revision,
      documentId: identity.documentId,
      documentVersion: identity.documentVersion,
      engineVersion: identity.engineVersion,
      writerEpoch,
      createdAt: Date.now(),
      byteLength: payload.byteLength,
      chunks: Object.freeze([]),
      compactThroughSequence: kind === "checkpoint"
        ? (input as StudioOpfsRecoveryCheckpointInput).compactThroughSequence
        : null,
      descriptorPath: `memory-only://${identity.documentId}/${sequence}`,
      descriptorCrc32: calculateStudioCrc32(payload),
    } satisfies StudioOpfsRecoveryEntry);
    // The command journal already owns the full in-tab history. Keep only the latest serialized
    // recovery frontier here so a non-durable fallback cannot double memory on long sessions.
    entries.splice(0, entries.length, entry);
    return entry;
  };
  return {
    async scanLatest(): Promise<StudioOpfsRecoveryScan> {
      return Object.freeze({
        generation: 0,
        writerEpoch,
        lastSequence: sequence,
        totalPayloadBytes: entries.reduce((total, entry) => total + entry.byteLength, 0),
        entries: Object.freeze([...entries]),
        selectedSlot: null,
        ignoredSlots: Object.freeze([]),
      });
    },
    async acquireWriter({ ownerId }): Promise<StudioOpfsRecoveryWriterLease> {
      writerEpoch += 1;
      const acquiredAt = Date.now();
      return Object.freeze({
        documentId: identity.documentId,
        ownerId,
        token: `memory-only-${writerEpoch}`,
        epoch: writerEpoch,
        acquiredAt,
        expiresAt: acquiredAt + 30_000,
      });
    },
    async appendCommand(input): Promise<StudioOpfsRecoveryEntry> {
      return await append("operation", input);
    },
    async compact(input): Promise<StudioOpfsRecoveryEntry> {
      return await append("checkpoint", input);
    },
    async flush(): Promise<void> {
      // Session memory is already synchronous; this is not a durability receipt.
    },
    async abort(): Promise<void> {
      // The in-memory command journal owns accepted edits and is disposed with the client.
    },
    async readLatestPayload(): Promise<Uint8Array | null> {
      return latestPayload ? new Uint8Array(latestPayload) : null;
    },
  };
}

export async function createDefaultStudioPagesHistoryDurableRuntime(
  options: CreateDefaultStudioPagesHistoryDurableRuntimeOptions,
  scope: BrowserRecoveryScope = globalThis as unknown as BrowserRecoveryScope,
): Promise<StudioPagesHistoryDurableRuntime> {
  const firstPageId = options.initialTarget?.pages[0]?.id;
  const identity = studioPagesHistoryRecoveryIdentity(firstPageId);
  const ownerId = typeof scope.crypto?.randomUUID === "function"
    ? `history-${scope.crypto.randomUUID()}`
    : `history-${hashStudioPagesHistoryIdentity(`${Date.now()}:${identity.documentId}`)}`;
  const documentLease = await requestStudioAutosaveDocumentLeadership({
    autosaveKey: studioPagesHistoryDocumentKey(firstPageId),
    locks: scope.navigator?.locks,
  });
  let recovery: StudioPagesHistoryRecoveryPort | null = null;
  try {
    const reportInitializationError = (cause: unknown): void => {
      try {
        options.onError?.(cause);
      } catch {
        // Diagnostics cannot escape into the accepted edit path.
      }
    };
    const activationFailures: unknown[] = [];
    let initialScan: StudioOpfsRecoveryScan | null = null;
    let persistenceKind: StudioPagesHistoryPersistenceKind = "memory-only";
    let initialDurabilityCause: unknown = null;

    const activate = async (
      backend: StudioPagesHistoryRecoveryPort,
      kind: Exclude<StudioPagesHistoryPersistenceKind, "memory-only">,
    ): Promise<boolean> => {
      const candidate = createStudioPagesHistoryWriterSession(backend, documentLease);
      try {
        const scan = await candidate.scanLatest();
        await candidate.acquireWriter({ ownerId });
        recovery = candidate;
        initialScan = scan;
        persistenceKind = kind;
        return true;
      } catch (cause) {
        activationFailures.push(cause);
        await candidate.abort("history-authority-activation-failed").catch(() => undefined);
        return false;
      }
    };

    if (documentLease.role !== "leader") activationFailures.push(new StudioAutosaveDocumentBusyError());
    if (documentLease.role === "leader" && options.preferSqlite !== false) {
      try {
        const database = await (options.openDatabase?.()
          ?? acquireStudioLocalDatabase());
        await activate(createStudioPagesHistorySqliteRecovery({
          database,
          identity,
          closeDatabaseOnAbort: false,
          lockManager: scope.navigator?.locks ?? null,
        }), "sqlite-opfs");
      } catch (cause) {
        activationFailures.push(cause);
      }
    }

    if (documentLease.role === "leader" && recovery === null) {
      try {
        let selection: StudioOpfsFileSystemSelection | null = null;
        const opfsRecovery: StudioOpfsRecoveryRuntime = await createStudioOpfsRecoveryRuntime({
          probeCapabilities: async () => {
            selection = await selectStudioOpfsFileSystem(scope, {
              rootName: "toonstudio-studio-history-recovery",
            });
            return {
              fileSystemKind: selection.kind,
              originLockAvailable: typeof scope.navigator?.locks?.request === "function",
            };
          },
          createOpfsJournal: () => {
            if (!selection || selection.kind !== "opfs") {
              throw new Error("선택되지 않은 OPFS history recovery journal입니다.");
            }
            return createStudioOpfsRecoveryJournal({
              identity,
              adapter: createStudioOpfsRecoveryJournalAdapter({
                fileSystem: selection.fs,
                lockManager: scope.navigator?.locks ?? null,
                quotaEstimator: scope.navigator?.storage?.estimate
                  ? {
                      estimate: () => scope.navigator!.storage!.estimate!(),
                    }
                  : null,
              }),
            });
          },
          // IndexedDB is never constructed here. A compatibility vault can participate only when
          // an embedding caller explicitly creates and passes it through the named legacy seam.
          existingRecoveryVault: options.legacyRecoveryVault ?? null,
        });
        const backend = opfsRecovery.status().backend;
        if (backend === "fail-closed") {
          throw new Error("native OPFS history authority is unavailable");
        }
        await activate(
          opfsRecovery,
          backend === "opfs-journal" ? "native-opfs" : "legacy-indexeddb",
        );
      } catch (cause) {
        activationFailures.push(cause);
      }
    }

    if (recovery === null || initialScan === null) {
      initialDurabilityCause = new StudioPagesHistoryDurabilityUnavailableError(
        activationFailures,
      );
      reportInitializationError(initialDurabilityCause);
      recovery = createStudioPagesHistoryMemoryRecovery(identity);
      initialScan = await recovery.scanLatest();
      await recovery.acquireWriter({ ownerId });
      persistenceKind = "memory-only";
    }

    let commandJournal = createStudioPagesHistoryCommandJournal();
    const latestPayload = await recovery.readLatestPayload?.();
    if (latestPayload && options.initialTarget) {
      try {
        const restored = restoreStudioPagesHistoryCommandJournal(TEXT_DECODER.decode(latestPayload));
        if (restored.matchesTarget(options.initialTarget)) commandJournal = restored;
        else commandJournal.rebase(options.initialTarget);
      } catch (cause) {
        reportInitializationError(cause);
        commandJournal.rebase(options.initialTarget);
      }
    } else if (options.initialTarget) {
      commandJournal.rebase(options.initialTarget);
    }
    return new StudioPagesHistoryDurableRuntime({
      commandJournal,
      recovery,
      initialScan,
      pageId: studioPagesHistoryRecoveryPageId(identity),
      eventTarget:
        typeof scope.addEventListener === "function"
        && typeof scope.removeEventListener === "function"
          ? scope as typeof globalThis
          : null,
      onError: options.onError,
      persistenceKind,
      initialDurabilityCause,
      onDurabilityStatus: options.onDurabilityStatus,
      releaseDocumentLease: () => documentLease.release(),
    });
  } catch (cause) {
    // writer를 얻은 뒤 payload 로드가 실패해도 재시도가 이전 권위와 경합하지 않는다.
    return withStudioHistoryCleanup(() => Promise.reject(cause), () => withStudioHistoryCleanup(
      async () => recovery?.abort("history-initialization-failed"),
      () => documentLease.release(),
    ));
  }
}
