/**
 * V12 SQLite/OPFS durable recovery store implementation for Studio 3D shot batches.
 */

import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";

import { type StudioBg3dShotBatchShotArtifacts } from "./studio-bg3d-shot-batch-artifact-integrity";
import {
  hydrateStudioBg3dShotBatchPlan,
  verifyStudioBg3dShotBatchSourceRevision,
  type StudioBg3dShotBatchPlan,
} from "./studio-bg3d-shot-batch-plan";
import { type StudioBg3dShotBatchFailureCode } from "./studio-bg3d-shot-batch-queue";
import { StudioBg3dShotBatchRecoveryError } from "./studio-bg3d-shot-batch-recovery-error";
import {
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_SQLITE_CATALOG_KEY,
  acquireProductRecoveryAssetStore,
  artifactHashes,
  canonicalJobRecord,
  canonicalLeaseRecord,
  hydrateSqliteArtifactRecords,
  isSqliteRecoveryCatalogEntry,
  parseSqliteCatalog,
  persistSqliteArtifactRecord,
  productRunExclusive,
  pruneSqliteCatalog,
  recoveryCasOwner,
  replaceSqliteCatalogEntry,
  serializeSqliteCatalog,
  type PutVerifiedCasBlob,
  type SqliteRecoveryArtifactRecord,
  type SqliteRecoveryCatalog,
  type SqliteRecoveryCatalogEntry,
} from "./studio-bg3d-shot-batch-recovery-sqlite-catalog";
import {
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_HEARTBEAT_MS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
  awaitWithAbort,
  memoryRecords,
  randomId,
  throwIfAborted,
  type ArtifactRecord,
  type MemoryRecord,
  type StudioBg3dShotBatchRecoveryAcquireOptions,
  type StudioBg3dShotBatchRecoveryCommitOptions,
  type StudioBg3dShotBatchRecoveryRunExclusive,
  type StudioBg3dShotBatchRecoverySession,
  type StudioBg3dShotBatchRecoveryStore,
  type StudioBg3dShotBatchRunToken,
} from "./studio-bg3d-shot-batch-recovery-types";
import {
  aggregateArtifacts,
  applyRecoverySession,
  assertAuthorizationReceipt,
  assertLeaseAndRevision,
  isJobRecord,
  isQuotaError,
  storagePersistence,
} from "./studio-bg3d-shot-batch-recovery-validation";

import type { StudioLocalDatabase } from "../studio-local-database";
import type { StudioOpfsAssetStore } from "../studio-opfs-asset-store";

export interface SqliteOpfsShotBatchRecoveryStoreOptions {
  readonly acquireDatabase?: () => Promise<StudioLocalDatabase>;
  readonly acquireAssetStore?: () => Promise<StudioOpfsAssetStore>;
  readonly runExclusive?: StudioBg3dShotBatchRecoveryRunExclusive | null;
  readonly now?: () => number;
  readonly ownerId?: string;
  readonly heartbeat?: boolean;
  readonly storageManager?: Pick<StorageManager, "estimate" | "persist"> | null;
}

export interface SqliteOpfsShotBatchRecoveryStoreDeps {
  readonly sqliteNamespace: string;
  readonly putVerifiedBlob: PutVerifiedCasBlob;
  readonly createMemoryDelegate: (config: {
    readonly now: () => number;
    readonly ownerId: string;
  }) => StudioBg3dShotBatchRecoveryStore;
}

export class SqliteOpfsStudioBg3dShotBatchRecoveryStore
  implements StudioBg3dShotBatchRecoveryStore {
  private readonly sqliteNamespace: string;
  private readonly putVerifiedBlob: PutVerifiedCasBlob;
  private readonly now: () => number;
  private readonly ownerId: string;
  private readonly heartbeatEnabled: boolean;
  private readonly storageManager: Pick<StorageManager, "estimate" | "persist"> | null;
  private readonly acquireDatabase: () => Promise<StudioLocalDatabase>;
  private readonly acquireAssetStore: () => Promise<StudioOpfsAssetStore>;
  private readonly runExclusive: StudioBg3dShotBatchRecoveryRunExclusive | null;
  private readonly delegate: StudioBg3dShotBatchRecoveryStore;
  private readonly heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly activeArtifacts = new Map<string, Map<string, ArtifactRecord>>();

  constructor(
    options: SqliteOpfsShotBatchRecoveryStoreOptions,
    deps: SqliteOpfsShotBatchRecoveryStoreDeps,
  ) {
    this.sqliteNamespace = deps.sqliteNamespace;
    this.putVerifiedBlob = deps.putVerifiedBlob;
    this.now = options.now ?? Date.now;
    this.ownerId = options.ownerId ?? randomId("bg3d-batch-owner");
    this.heartbeatEnabled = options.heartbeat ?? true;
    this.storageManager = options.storageManager === undefined
      ? (typeof navigator === "undefined" ? null : navigator.storage ?? null)
      : options.storageManager;
    this.acquireDatabase = options.acquireDatabase ?? acquireStudioLocalDatabase;
    this.acquireAssetStore = options.acquireAssetStore ?? acquireProductRecoveryAssetStore;
    this.runExclusive = options.runExclusive === undefined
      ? productRunExclusive()
      : options.runExclusive;
    this.delegate = deps.createMemoryDelegate({
      now: this.now,
      ownerId: this.ownerId,
    });
  }

  private startHeartbeat(session: StudioBg3dShotBatchRecoverySession): void {
    this.stopHeartbeat(session.plan.resumeKey);
    if (!this.heartbeatEnabled) return;
    const timer = setInterval(() => {
      void this.renewLease(session).catch(() => {
        // The next state mutation remains the authoritative error boundary.
      });
    }, STUDIO_BG3D_SHOT_BATCH_RECOVERY_HEARTBEAT_MS);
    this.heartbeatTimers.set(session.plan.resumeKey, timer);
  }

  private stopHeartbeat(recoveryKey: string): void {
    const timer = this.heartbeatTimers.get(recoveryKey);
    if (timer !== undefined) clearInterval(timer);
    this.heartbeatTimers.delete(recoveryKey);
  }

  private async loadCatalog(database: StudioLocalDatabase): Promise<SqliteRecoveryCatalog> {
    try {
      return parseSqliteCatalog(await database.kvGet(
        this.sqliteNamespace,
        STUDIO_BG3D_SHOT_BATCH_RECOVERY_SQLITE_CATALOG_KEY,
      ));
    } catch (cause) {
      if (cause instanceof StudioBg3dShotBatchRecoveryError) throw cause;
      throw new StudioBg3dShotBatchRecoveryError(
        "storage-unavailable",
        "storageUnavailable.sqliteCatalogReadFailed",
        { cause },
      );
    }
  }

  private async saveCatalog(
    database: StudioLocalDatabase,
    catalog: SqliteRecoveryCatalog,
  ): Promise<void> {
    const serialized = serializeSqliteCatalog(catalog);
    parseSqliteCatalog(serialized);
    try {
      await database.kvSet(
        this.sqliteNamespace,
        STUDIO_BG3D_SHOT_BATCH_RECOVERY_SQLITE_CATALOG_KEY,
        serialized,
      );
    } catch (cause) {
      if (isQuotaError(cause)) throw cause;
      throw new StudioBg3dShotBatchRecoveryError(
        "storage-unavailable",
        "storageUnavailable.sqliteCatalogCommitFailed",
        { cause },
      );
    }
  }

  private installMemoryCatalog(
    catalog: SqliteRecoveryCatalog,
    targetKey: string,
    targetArtifacts: readonly ArtifactRecord[],
  ): { readonly restore: () => void; readonly target: () => MemoryRecord | undefined } {
    const keys = new Set(catalog.entries.map(({ job }) => job.recoveryKey));
    keys.add(targetKey);
    const previous = new Map<string, MemoryRecord | undefined>();
    for (const key of keys) previous.set(key, memoryRecords.get(key));
    memoryRecords.delete(targetKey);
    for (const entry of catalog.entries) {
      memoryRecords.set(entry.job.recoveryKey, {
        job: canonicalJobRecord(entry.job),
        lease: canonicalLeaseRecord(entry.lease),
        artifacts: new Map(entry.job.recoveryKey === targetKey
          ? targetArtifacts.map((artifact) => [artifact.artifactKey, artifact])
          : []),
      });
    }
    return {
      target: () => memoryRecords.get(targetKey),
      restore: () => {
        for (const key of keys) {
          const value = previous.get(key);
          if (value === undefined) memoryRecords.delete(key);
          else memoryRecords.set(key, value);
        }
      },
    };
  }

  private async artifactRecordsForActiveSession(
    session: StudioBg3dShotBatchRecoverySession,
    entry: SqliteRecoveryCatalogEntry,
    assetStore: StudioOpfsAssetStore,
    signal?: AbortSignal,
  ): Promise<ArtifactRecord[]> {
    const cached = this.activeArtifacts.get(session.plan.resumeKey);
    if (cached && entry.job.artifactKeys.every((key) => cached.has(key))) {
      return entry.job.artifactKeys.map((key) => cached.get(key)!);
    }
    const hydrated = await hydrateSqliteArtifactRecords(
      session.plan,
      entry.job,
      entry.artifacts,
      assetStore,
      signal,
    );
    this.activeArtifacts.set(
      session.plan.resumeKey,
      new Map(hydrated.map((artifact) => [artifact.artifactKey, artifact])),
    );
    return hydrated;
  }

  private workingSession(
    source: StudioBg3dShotBatchRecoverySession,
    entry: SqliteRecoveryCatalogEntry,
    records: readonly ArtifactRecord[],
  ): StudioBg3dShotBatchRecoverySession {
    if (!entry.lease) {
      throw new StudioBg3dShotBatchRecoveryError("lease-lost", "leaseLost.sqliteMissing");
    }
    assertLeaseAndRevision(source, entry.job, entry.lease, this.now());
    const aggregate = aggregateArtifacts(records);
    return {
      plan: source.plan,
      sourceRevision: source.sourceRevision,
      ownerId: source.ownerId,
      mode: "memory",
      persistence: source.persistence,
      degradedReason: null,
      queue: entry.job.queue,
      revision: entry.job.revision,
      fence: entry.lease.fence,
      leaseToken: entry.lease.leaseToken,
      totalArtifactBytes: entry.job.totalArtifactBytes,
      artifactCount: entry.job.artifactCount,
      jobStorageBytes: entry.job.jobStorageBytes,
      artifactStorageBytes: entry.job.artifactStorageBytes,
      activeRun: entry.job.activeRun,
      ...aggregate,
      shotArtifacts: new Map(records.map(({ shotId, artifacts }) => [shotId, artifacts])),
      released: false,
    };
  }

  private async entryFromMemoryRecord(
    record: MemoryRecord,
    existing: SqliteRecoveryCatalogEntry | undefined,
    assetStore: StudioOpfsAssetStore,
    signal?: AbortSignal,
  ): Promise<SqliteRecoveryCatalogEntry> {
    const existingArtifacts = new Map(
      (existing?.artifacts ?? []).map((artifact) => [artifact.artifactKey, artifact]),
    );
    const artifacts: SqliteRecoveryArtifactRecord[] = [];
    for (const key of record.job.artifactKeys) {
      const persisted = existingArtifacts.get(key);
      if (persisted) {
        artifacts.push(persisted);
        continue;
      }
      const artifact = record.artifacts.get(key);
      if (!artifact) {
        throw new StudioBg3dShotBatchRecoveryError(
          "corrupt",
          "corrupt.newArtifactMissingInMemory",
        );
      }
      artifacts.push(await persistSqliteArtifactRecord(
        artifact,
        assetStore,
        this.putVerifiedBlob,
        signal,
      ));
    }
    const entry: SqliteRecoveryCatalogEntry = {
      job: canonicalJobRecord(record.job),
      lease: canonicalLeaseRecord(record.lease),
      artifacts,
    };
    if (!isSqliteRecoveryCatalogEntry(entry)) {
      throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.sqliteEntryCreateFailed");
    }
    return entry;
  }

  private async clearRemovedOwners(
    store: StudioOpfsAssetStore,
    removed: readonly string[],
  ): Promise<void> {
    await Promise.all(removed.map((key) =>
      store.setOwnerRefs(recoveryCasOwner(key), []).catch(() => [])));
  }

  private async authorizeCommit(
    options: StudioBg3dShotBatchRecoveryCommitOptions,
  ): Promise<void> {
    if (!options.authorizeBeforeCommit) return;
    throwIfAborted(options.signal);
    const receipt = await awaitWithAbort(
      Promise.resolve(options.authorizeBeforeCommit(options.signal)),
      options.signal,
    );
    if (!receipt || typeof receipt !== "object" ||
      typeof receipt.isLocallyCurrent !== "function") {
      throw new StudioBg3dShotBatchRecoveryError(
        "access-denied",
        "accessDenied.scopeDenied",
      );
    }
    assertAuthorizationReceipt(receipt, this.now());
    throwIfAborted(options.signal);
  }

  private async mutateSession<T>(
    session: StudioBg3dShotBatchRecoverySession,
    operation: (
      store: StudioBg3dShotBatchRecoveryStore,
      working: StudioBg3dShotBatchRecoverySession,
    ) => Promise<T>,
    options: {
      readonly signal?: AbortSignal;
      readonly beforeCommit?: () => Promise<void>;
    } = {},
  ): Promise<T> {
    if (session.mode === "memory") return operation(this.delegate, session);
    if (!this.runExclusive) {
      throw new StudioBg3dShotBatchRecoveryError(
        "storage-unavailable",
        "storageUnavailable.webLocksUnavailable",
      );
    }
    return this.runExclusive(async () => {
      throwIfAborted(options.signal);
      const [database, assetStore] = await Promise.all([
        this.acquireDatabase(),
        this.acquireAssetStore(),
      ]);
      const loaded = await this.loadCatalog(database);
      const pruned = pruneSqliteCatalog(loaded, this.now());
      const entry = pruned.catalog.entries.find(
        ({ job }) => job.recoveryKey === session.plan.resumeKey,
      );
      if (!entry || !isJobRecord(entry.job, session.plan) ||
        entry.job.sourceRevision !== session.sourceRevision) {
        throw new StudioBg3dShotBatchRecoveryError(
          entry ? "corrupt" : "lease-lost",
          entry ? "corrupt.sqliteJobPlanMismatch" : "leaseLost.sqliteJobMissingOrExpired",
        );
      }
      const records = await this.artifactRecordsForActiveSession(
        session,
        entry,
        assetStore,
        options.signal,
      );
      const installed = this.installMemoryCatalog(
        pruned.catalog,
        session.plan.resumeKey,
        records,
      );
      try {
        const working = this.workingSession(session, entry, records);
        const result = await operation(this.delegate, working);
        throwIfAborted(options.signal);
        const updatedRecord = installed.target();
        const replacement = updatedRecord
          ? await this.entryFromMemoryRecord(updatedRecord, entry, assetStore, options.signal)
          : null;
        if (replacement) {
          await assetStore.setOwnerRefs(
            recoveryCasOwner(session.plan.resumeKey),
            artifactHashes(replacement.artifacts),
          );
        }
        await options.beforeCommit?.();
        throwIfAborted(options.signal);
        const nextCatalog = replaceSqliteCatalogEntry(
          pruned.catalog,
          session.plan.resumeKey,
          replacement,
          this.now(),
        );
        await this.saveCatalog(database, nextCatalog);
        await this.clearRemovedOwners(assetStore, [
          ...pruned.removed,
          ...(replacement ? [] : [session.plan.resumeKey]),
        ]);
        if (updatedRecord) {
          this.activeArtifacts.set(
            session.plan.resumeKey,
            new Map(updatedRecord.artifacts),
          );
        } else {
          this.activeArtifacts.delete(session.plan.resumeKey);
        }
        working.mode = "durable";
        working.degradedReason = null;
        applyRecoverySession(session, working);
        return result;
      } finally {
        installed.restore();
      }
    });
  }

  async acquire(
    plan: StudioBg3dShotBatchPlan,
    sourceRevision: string,
    options: StudioBg3dShotBatchRecoveryAcquireOptions = {},
  ): Promise<StudioBg3dShotBatchRecoverySession> {
    if (plan.scope.durability !== "durable" || !this.runExclusive) {
      const memory = await this.delegate.acquire(plan, sourceRevision, options);
      if (plan.scope.durability === "durable") {
        memory.degradedReason = { code: "webLocksUnavailable" };
      }
      this.startHeartbeat(memory);
      return memory;
    }
    const verifiedPlan = await awaitWithAbort(hydrateStudioBg3dShotBatchPlan(plan), options.signal);
    if (!verifiedPlan || !await awaitWithAbort(
      verifyStudioBg3dShotBatchSourceRevision(verifiedPlan, sourceRevision),
      options.signal,
    )) {
      throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.planVerificationFailed");
    }
    const session = await this.runExclusive(async () => {
      throwIfAborted(options.signal);
      const [database, assetStore] = await Promise.all([
        this.acquireDatabase(),
        this.acquireAssetStore(),
      ]);
      const loaded = await this.loadCatalog(database);
      const pruned = pruneSqliteCatalog(loaded, this.now());
      const existing = pruned.catalog.entries.find(
        ({ job }) => job.recoveryKey === verifiedPlan.resumeKey,
      );
      let records: ArtifactRecord[] = [];
      if (existing) {
        if (!isJobRecord(existing.job, verifiedPlan) ||
          existing.job.sourceRevision !== sourceRevision) {
          throw new StudioBg3dShotBatchRecoveryError(
            "corrupt",
            "corrupt.sqliteJobMismatch",
          );
        }
        await assetStore.setOwnerRefs(
          recoveryCasOwner(verifiedPlan.resumeKey),
          artifactHashes(existing.artifacts),
        );
        records = await hydrateSqliteArtifactRecords(
          verifiedPlan,
          existing.job,
          existing.artifacts,
          assetStore,
          options.signal,
        );
      }
      const installed = this.installMemoryCatalog(pruned.catalog, verifiedPlan.resumeKey, records);
      try {
        const acquired = await this.delegate.acquire(verifiedPlan, sourceRevision, options);
        const updatedRecord = installed.target();
        if (!updatedRecord) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.sqliteAcquireJobMissing");
        }
        const replacement = await this.entryFromMemoryRecord(
          updatedRecord,
          existing,
          assetStore,
          options.signal,
        );
        await assetStore.setOwnerRefs(
          recoveryCasOwner(verifiedPlan.resumeKey),
          artifactHashes(replacement.artifacts),
        );
        const nextCatalog = replaceSqliteCatalogEntry(
          pruned.catalog,
          verifiedPlan.resumeKey,
          replacement,
          this.now(),
        );
        await this.saveCatalog(database, nextCatalog);
        await this.clearRemovedOwners(assetStore, pruned.removed);
        acquired.mode = "durable";
        acquired.persistence = await storagePersistence(this.storageManager);
        acquired.degradedReason = null;
        this.activeArtifacts.set(
          verifiedPlan.resumeKey,
          new Map(updatedRecord.artifacts),
        );
        return acquired;
      } finally {
        installed.restore();
      }
    });
    this.startHeartbeat(session);
    return session;
  }

  startShot(
    session: StudioBg3dShotBatchRecoverySession,
    shotId: string,
  ): Promise<StudioBg3dShotBatchRunToken> {
    return this.mutateSession(session, (store, working) => store.startShot(working, shotId));
  }

  completeShot(
    session: StudioBg3dShotBatchRecoverySession,
    token: StudioBg3dShotBatchRunToken,
    artifacts: StudioBg3dShotBatchShotArtifacts,
    options: StudioBg3dShotBatchRecoveryCommitOptions = {},
  ): Promise<void> {
    if (session.mode === "memory") {
      return this.delegate.completeShot(session, token, artifacts, options);
    }
    return this.mutateSession(
      session,
      (store, working) => store.completeShot(working, token, artifacts, {
        signal: options.signal,
      }),
      {
        signal: options.signal,
        beforeCommit: () => this.authorizeCommit(options),
      },
    );
  }

  failShot(
    session: StudioBg3dShotBatchRecoverySession,
    token: StudioBg3dShotBatchRunToken,
    failureCode: StudioBg3dShotBatchFailureCode,
  ): Promise<void> {
    return this.mutateSession(
      session,
      (store, working) => store.failShot(working, token, failureCode),
    );
  }

  resetInterrupted(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    return this.mutateSession(session, (store, working) => store.resetInterrupted(working));
  }

  markDownloadRequested(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    return this.mutateSession(session, (store, working) => store.markDownloadRequested(working));
  }

  private async renewLease(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    if (session.released) return;
    if (session.mode === "memory") {
      const record = memoryRecords.get(session.plan.resumeKey);
      if (!record?.lease || record.lease.ownerId !== session.ownerId ||
        record.lease.leaseToken !== session.leaseToken || record.lease.fence !== session.fence) {
        throw new StudioBg3dShotBatchRecoveryError("lease-lost", "leaseLost.memoryRenewFailed");
      }
      const now = this.now();
      record.lease = { ...record.lease, heartbeatAt: now, expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS };
      return;
    }
    if (!this.runExclusive) return;
    await this.runExclusive(async () => {
      const database = await this.acquireDatabase();
      const catalog = await this.loadCatalog(database);
      const entry = catalog.entries.find(({ job }) => job.recoveryKey === session.plan.resumeKey);
      if (!entry?.lease || entry.lease.ownerId !== session.ownerId ||
        entry.lease.leaseToken !== session.leaseToken || entry.lease.fence !== session.fence ||
        entry.job.revision !== session.revision || entry.lease.expiresAt <= this.now()) {
        throw new StudioBg3dShotBatchRecoveryError("lease-lost", "leaseLost.sqliteRenewFailed");
      }
      const now = this.now();
      const nextEntry: SqliteRecoveryCatalogEntry = {
        ...entry,
        lease: { ...entry.lease, heartbeatAt: now, expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS },
      };
      await this.saveCatalog(
        database,
        replaceSqliteCatalogEntry(catalog, session.plan.resumeKey, nextEntry, now),
      );
    });
  }

  async release(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    if (session.released) return;
    this.stopHeartbeat(session.plan.resumeKey);
    if (session.mode === "memory") {
      await this.delegate.release(session);
      return;
    }
    try {
      await this.mutateSession(session, (store, working) => store.release(working));
    } catch {
      // Release is best effort. The persisted lease expiry and fence remain authoritative.
      session.released = true;
    } finally {
      this.activeArtifacts.delete(session.plan.resumeKey);
    }
  }

  async discard(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    this.stopHeartbeat(session.plan.resumeKey);
    await this.mutateSession(session, (store, working) => store.discard(working));
    this.activeArtifacts.delete(session.plan.resumeKey);
  }
}
