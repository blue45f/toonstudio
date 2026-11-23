/**
 * Browser-durable, shot-atomic recovery for Studio 3D batch renders.
 *
 * Product authority is one canonical catalog row in the shared V12 SQLite/OPFS database, fenced
 * by Web Locks; PNG/PSD bytes live in the SHA-256 OPFS CAS. The former IndexedDB implementation is
 * opened only through the explicit `indexedDB` legacy/test seam and is never read on product boot.
 */

import { STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES } from "./studio-bg3d-shot-batch";
import {
  verifyStudioBg3dShotBatchShotArtifacts,
  type StudioBg3dShotBatchShotArtifacts,
} from "./studio-bg3d-shot-batch-artifact-integrity";
import {
  hydrateStudioBg3dShotBatchPlan,
  verifyStudioBg3dShotBatchSourceRevision,
  type StudioBg3dShotBatchPlan,
} from "./studio-bg3d-shot-batch-plan";
import {
  failStudioBg3dShotBatchQueueItem,
  retryStudioBg3dShotBatchQueue,
  startStudioBg3dShotBatchQueueItem,
  succeedStudioBg3dShotBatchQueueItem,
  type StudioBg3dShotBatchFailureCode,
} from "./studio-bg3d-shot-batch-queue";
import {
  StudioBg3dShotBatchRecoveryError,
  type StudioBg3dShotBatchRecoveryDegradedReason,
} from "./studio-bg3d-shot-batch-recovery-error";
import {
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_CAS_OWNER_PREFIX,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_SQLITE_CATALOG_KEY,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_SQLITE_LOCK_NAME,
  type PutVerifiedCasBlob,
} from "./studio-bg3d-shot-batch-recovery-sqlite-catalog";
import { SqliteOpfsStudioBg3dShotBatchRecoveryStore } from "./studio-bg3d-shot-batch-recovery-sqlite-store";
import {
  META_KEY,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_DOWNLOAD_TTL_MS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_HEARTBEAT_MS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_RESERVE_BYTES,
  artifactKey,
  awaitWithAbort,
  isAbortError,
  memoryJobCountExcluding,
  memoryRecords,
  memoryStorageBytesExcluding,
  purgeExpiredMemoryRecords,
  randomId,
  recoveryAbortError,
  throwIfAborted,
  withArtifactStorageBytes,
  type ActiveRun,
  type ArtifactRecord,
  type JobRecord,
  type LeaseRecord,
  type MemoryRecord,
  type StudioBg3dShotBatchRecoveryAcquireOptions,
  type StudioBg3dShotBatchRecoveryCommitOptions,
  type StudioBg3dShotBatchRecoveryRunExclusive,
  type StudioBg3dShotBatchRecoverySession,
  type StudioBg3dShotBatchRecoveryStore,
  type StudioBg3dShotBatchRunToken,
  type UsageRecord,
} from "./studio-bg3d-shot-batch-recovery-types";
import {
  aggregateArtifacts,
  assertAuthorizationReceipt,
  assertLeaseAndRevision,
  copyJob,
  emptyUsage,
  isGcArtifactRecord,
  isGcJobRecord,
  isGcLeaseRecord,
  isJobRecord,
  isLeaseRecord,
  isQuotaError,
  isUsageRecord,
  newJob,
  queueIsComplete,
  recoveryExpiry,
  storagePersistence,
  verifyArtifactRecords,
} from "./studio-bg3d-shot-batch-recovery-validation";

import type { StudioLocalDatabase } from "../studio-local-database";
import type { StudioOpfsAssetStore } from "../studio-opfs-asset-store";

export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_DATABASE_NAME =
  "toonstudio-studio-bg3d-shot-batch-recovery";
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_DATABASE_VERSION = 1;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_SQLITE_NAMESPACE =
  "studio-bg3d-shot-batch-recovery-v12";

export {
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_CAS_OWNER_PREFIX,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_SQLITE_CATALOG_KEY,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_SQLITE_LOCK_NAME,
};
export { StudioBg3dShotBatchRecoveryError } from "./studio-bg3d-shot-batch-recovery-error";
export type {
  StudioBg3dShotBatchRecoveryDegradedReason,
  StudioBg3dShotBatchRecoveryDegradedReasonCode,
  StudioBg3dShotBatchRecoveryErrorCode,
  StudioBg3dShotBatchRecoveryErrorSubcode,
} from "./studio-bg3d-shot-batch-recovery-error";
export {
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_AUTHORIZATION_RECEIPT_MAX_TTL_MS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_DOWNLOAD_TTL_MS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_HEARTBEAT_MS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_TTL_MS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_RESERVE_BYTES,
  type StudioBg3dShotBatchRecoveryAcquireOptions,
  type StudioBg3dShotBatchRecoveryAuthorizationReceipt,
  type StudioBg3dShotBatchRecoveryCommitOptions,
  type StudioBg3dShotBatchRecoveryMode,
  type StudioBg3dShotBatchRecoveryPersistence,
  type StudioBg3dShotBatchRecoveryRunExclusive,
  type StudioBg3dShotBatchRecoverySession,
  type StudioBg3dShotBatchRecoveryStore,
  type StudioBg3dShotBatchRunToken,
} from "./studio-bg3d-shot-batch-recovery-types";

export interface StudioBg3dShotBatchRecoveryStoreOptions {
  /**
   * Explicit legacy/test seam. Merely having a global IndexedDB no longer selects it; product
   * boot uses the shared V12 SQLite/OPFS authority unless this property is explicitly supplied.
   */
  readonly indexedDB?: IDBFactory | null;
  readonly acquireDatabase?: () => Promise<StudioLocalDatabase>;
  readonly acquireAssetStore?: () => Promise<StudioOpfsAssetStore>;
  /** Cross-tab read/modify/write fence. Product default is navigator.locks exclusive mode. */
  readonly runExclusive?: StudioBg3dShotBatchRecoveryRunExclusive | null;
  readonly now?: () => number;
  readonly ownerId?: string;
  /** Tests can disable timers while still exercising all lease/CAS transitions explicitly. */
  readonly heartbeat?: boolean;
  readonly storageManager?: Pick<StorageManager, "estimate" | "persist"> | null;
}

const JOBS_STORE = "jobs";
const ARTIFACTS_STORE = "artifacts";
const LEASES_STORE = "leases";
const META_STORE = "meta";
const STORE_NAMES = [JOBS_STORE, ARTIFACTS_STORE, LEASES_STORE, META_STORE] as const;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new DOMException("IndexedDB request failed", "UnknownError"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(
      transaction.error ?? new DOMException("IndexedDB transaction failed", "UnknownError"),
    );
    transaction.onabort = () => reject(
      transaction.error ?? new DOMException("IndexedDB transaction aborted", "AbortError"),
    );
  });
}

function abortTransaction(transaction: IDBTransaction): void {
  try {
    transaction.abort();
  } catch {
    // The transaction may already be committed or aborted. Awaiting transactionDone remains
    // the authoritative completion boundary.
  }
}

function readwriteTransaction(database: IDBDatabase): IDBTransaction {
  try {
    return database.transaction([...STORE_NAMES], "readwrite", { durability: "strict" });
  } catch {
    return database.transaction([...STORE_NAMES], "readwrite");
  }
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(
        STUDIO_BG3D_SHOT_BATCH_RECOVERY_DATABASE_NAME,
        STUDIO_BG3D_SHOT_BATCH_RECOVERY_DATABASE_VERSION,
      );
    } catch (cause) {
      reject(new StudioBg3dShotBatchRecoveryError(
        "storage-unavailable",
        "storageUnavailable.indexedDbOpenFailed",
        { cause },
      ));
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(JOBS_STORE)) {
        database.createObjectStore(JOBS_STORE, { keyPath: "recoveryKey" });
      }
      if (!database.objectStoreNames.contains(ARTIFACTS_STORE)) {
        database.createObjectStore(ARTIFACTS_STORE, { keyPath: "artifactKey" });
      }
      if (!database.objectStoreNames.contains(LEASES_STORE)) {
        database.createObjectStore(LEASES_STORE, { keyPath: "recoveryKey" });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    request.onerror = () => reject(new StudioBg3dShotBatchRecoveryError(
      "storage-unavailable",
      "storageUnavailable.indexedDbOpenFailed",
      { cause: request.error ?? undefined },
    ));
    request.onblocked = () => {
      blocked = true;
      reject(new StudioBg3dShotBatchRecoveryError(
        "storage-unavailable",
        "storageUnavailable.upgradeBlocked",
      ));
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function withDatabase<T>(factory: IDBFactory, callback: (database: IDBDatabase) => Promise<T>): Promise<T> {
  const database = await openDatabase(factory);
  try {
    return await callback(database);
  } finally {
    database.close();
  }
}

class LegacyIndexedDbStudioBg3dShotBatchRecoveryStore
  implements StudioBg3dShotBatchRecoveryStore {
  private readonly now: () => number;
  private readonly ownerId: string;
  private readonly explicitFactory: IDBFactory | null | undefined;
  private readonly heartbeatEnabled: boolean;
  private readonly storageManager: Pick<StorageManager, "estimate" | "persist"> | null;
  private readonly heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(options: StudioBg3dShotBatchRecoveryStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ownerId = options.ownerId ?? randomId("bg3d-batch-owner");
    this.explicitFactory = options.indexedDB;
    this.heartbeatEnabled = options.heartbeat ?? true;
    this.storageManager = options.storageManager === undefined
      ? (typeof navigator === "undefined" ? null : navigator.storage ?? null)
      : options.storageManager;
  }

  private factory(): IDBFactory | null {
    return this.explicitFactory === undefined ? globalThis.indexedDB ?? null : this.explicitFactory;
  }

  private async assertStorageEstimateCapacity(additionalBytes: number): Promise<void> {
    if (!this.storageManager || typeof this.storageManager.estimate !== "function") return;
    try {
      const estimate = await this.storageManager.estimate();
      if (typeof estimate.usage !== "number" || !Number.isFinite(estimate.usage) ||
        typeof estimate.quota !== "number" || !Number.isFinite(estimate.quota) ||
        estimate.usage < 0 || estimate.quota <= 0) return;
      const reserve = Math.max(
        STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_RESERVE_BYTES,
        Math.floor(estimate.quota * 0.2),
      );
      if (estimate.quota - estimate.usage < additionalBytes + reserve) {
        throw new DOMException(
          "Studio 3D recovery would consume the browser storage reserve.",
          "QuotaExceededError",
        );
      }
    } catch (cause) {
      if (isQuotaError(cause)) throw cause;
      // StorageManager is advisory. IndexedDB plus the app-level ledger remain authoritative when
      // an estimate cannot be obtained (private mode and older engines commonly reject it).
    }
  }

  private startHeartbeat(session: StudioBg3dShotBatchRecoverySession): void {
    this.stopHeartbeat(session.plan.resumeKey);
    if (!this.heartbeatEnabled) return;
    const timer = setInterval(() => {
      void this.renewLease(session).catch(() => {
        // The next authoritative mutation surfaces lease/storage loss. A heartbeat never mutates
        // queue state or silently switches execution mode behind an in-flight capture.
      });
    }, STUDIO_BG3D_SHOT_BATCH_RECOVERY_HEARTBEAT_MS);
    this.heartbeatTimers.set(session.plan.resumeKey, timer);
  }

  private stopHeartbeat(recoveryKey: string): void {
    const timer = this.heartbeatTimers.get(recoveryKey);
    if (timer !== undefined) clearInterval(timer);
    this.heartbeatTimers.delete(recoveryKey);
  }

  private async collectExpiredDurable(
    factory: IDBFactory,
    protectedRecoveryKey: string | null,
  ): Promise<void> {
    const now = this.now();
    await withDatabase(factory, async (database) => {
      const transaction = readwriteTransaction(database);
      const done = transactionDone(transaction);
      try {
        const jobs = transaction.objectStore(JOBS_STORE);
        const artifacts = transaction.objectStore(ARTIFACTS_STORE);
        const leases = transaction.objectStore(LEASES_STORE);
        const meta = transaction.objectStore(META_STORE);
        const [rawJobs, rawLeases, rawUsage, rawArtifacts] = await Promise.all([
          requestResult<unknown[]>(jobs.getAll()),
          requestResult<unknown[]>(leases.getAll()),
          requestResult<unknown>(meta.get(META_KEY)),
          requestResult<unknown[]>(artifacts.getAll()),
        ]);
        if (rawJobs.some((job) => !isGcJobRecord(job)) ||
          rawLeases.some((lease) => !isGcLeaseRecord(lease)) ||
          rawArtifacts.some((artifact) => !isGcArtifactRecord(artifact)) ||
          (rawUsage !== undefined && !isUsageRecord(rawUsage)) ||
          (rawUsage === undefined && rawJobs.length > 0)) {
          throw new StudioBg3dShotBatchRecoveryError(
            "corrupt",
            "corrupt.expiredCleanupUnsafe",
          );
        }
        const parsedJobs = rawJobs as JobRecord[];
        const parsedLeases = rawLeases as LeaseRecord[];
        const parsedArtifacts = rawArtifacts as ArtifactRecord[];
        const activeLeaseKeys = new Set(parsedLeases
          .filter(({ expiresAt }) => expiresAt > now)
          .map(({ recoveryKey }) => recoveryKey));
        const expiredJobs = parsedJobs.filter((job) =>
          job.recoveryKey !== protectedRecoveryKey && job.expiresAt <= now &&
          !activeLeaseKeys.has(job.recoveryKey)
        );
        const expiredJobKeys = new Set(expiredJobs.map(({ recoveryKey }) => recoveryKey));
        const retainedJobs = parsedJobs.filter(({ recoveryKey }) => !expiredJobKeys.has(recoveryKey));
        const retainedJobKeys = new Set(retainedJobs.map(({ recoveryKey }) => recoveryKey));
        // Keep an expired lease row as the monotonic fence counter while its job survives. It no
        // longer grants ownership, but deleting it would reset the next takeover fence to one.
        const expiredLeases = parsedLeases.filter((lease) =>
          lease.recoveryKey !== protectedRecoveryKey && lease.expiresAt <= now &&
          !retainedJobKeys.has(lease.recoveryKey)
        );
        const declaredArtifactKeys = new Set(parsedJobs.flatMap(({ artifactKeys }) => artifactKeys));
        const artifactByKey = new Map(parsedArtifacts.map((record) => [record.artifactKey, record]));
        const actualStringKeys = new Set(artifactByKey.keys());
        if ([...declaredArtifactKeys].some((key) => !actualStringKeys.has(key))) {
          throw new StudioBg3dShotBatchRecoveryError(
            "corrupt",
            "corrupt.jobArtifactMissing",
          );
        }
        const orphanArtifactKeys = parsedArtifacts
          .filter(({ artifactKey: key }) => !declaredArtifactKeys.has(key))
          .map(({ artifactKey: key }) => key);
        for (const job of retainedJobs) {
          const records = job.artifactKeys.map((key) => artifactByKey.get(key)!);
          const bytes = records.reduce((total, record) => total + record.artifacts.totalBytes, 0);
          const count = records.reduce((total, record) => total + record.artifacts.artifactCount, 0);
          const storageBytes = records.reduce((total, record) => total + record.storageBytes, 0);
          if (records.some(({ recoveryKey }) => recoveryKey !== job.recoveryKey) ||
            bytes !== job.totalArtifactBytes || count !== job.artifactCount ||
            storageBytes !== job.artifactStorageBytes) {
            throw new StudioBg3dShotBatchRecoveryError(
              "corrupt",
              "corrupt.artifactJobUsageMismatch",
            );
          }
        }
        const retainedBytes = retainedJobs.reduce((total, job) => total + job.totalArtifactBytes, 0);
        const retainedCount = retainedJobs.reduce((total, job) => total + job.artifactCount, 0);
        const retainedStructuredBytes = retainedJobs.reduce((total, job) =>
          total + job.jobStorageBytes + job.artifactStorageBytes, 0);
        const retainedJobCount = retainedJobs.length;
        if (retainedBytes + retainedStructuredBytes >
          STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES ||
          retainedJobCount > STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS) {
          throw new StudioBg3dShotBatchRecoveryError(
            "corrupt",
            "corrupt.usageOriginBudgetExceeded",
          );
        }
        const usage = rawUsage === undefined ? emptyUsage(now) : rawUsage;
        const shouldRewriteUsage = rawUsage === undefined || expiredJobs.length > 0 ||
          orphanArtifactKeys.length > 0 || usage.artifactBytes !== retainedBytes ||
          usage.artifactCount !== retainedCount ||
          usage.structuredBytes !== retainedStructuredBytes ||
          usage.jobCount !== retainedJobCount;
        await Promise.all([
          ...expiredJobs.flatMap((job) => [
            ...job.artifactKeys.map((key) => requestResult(artifacts.delete(key))),
            requestResult(jobs.delete(job.recoveryKey)),
          ]),
          ...orphanArtifactKeys.map((key) => requestResult(artifacts.delete(key))),
          ...expiredLeases.map((lease) => requestResult(leases.delete(lease.recoveryKey))),
          ...(shouldRewriteUsage
            ? [requestResult(meta.put({
                ...usage,
                revision: usage.revision + 1,
                artifactBytes: retainedBytes,
                artifactCount: retainedCount,
                structuredBytes: retainedStructuredBytes,
                jobCount: retainedJobCount,
                updatedAt: now,
              }))]
            : []),
        ]);
        await done;
      } catch (cause) {
        abortTransaction(transaction);
        await done.catch(() => undefined);
        if (cause instanceof StudioBg3dShotBatchRecoveryError) throw cause;
        throw new StudioBg3dShotBatchRecoveryError(
          "storage-unavailable",
          "storageUnavailable.expiredCleanupFailed",
          { cause },
        );
      }
    });
  }

  private async releaseExactDurableLease(
    factory: IDBFactory,
    lease: LeaseRecord,
  ): Promise<void> {
    try {
      await withDatabase(factory, async (database) => {
        let transaction: IDBTransaction;
        try {
          transaction = database.transaction([LEASES_STORE], "readwrite", { durability: "strict" });
        } catch {
          transaction = database.transaction([LEASES_STORE], "readwrite");
        }
        const done = transactionDone(transaction);
        try {
          const store = transaction.objectStore(LEASES_STORE);
          const raw = await requestResult<unknown>(store.get(lease.recoveryKey));
          if (isLeaseRecord(raw, lease.recoveryKey) && raw.ownerId === lease.ownerId &&
            raw.leaseToken === lease.leaseToken && raw.fence === lease.fence) {
            await requestResult(store.delete(lease.recoveryKey));
          }
          await done;
        } catch {
          abortTransaction(transaction);
          await done.catch(() => undefined);
        }
      });
    } catch {
      // Best effort. Expiry plus fencing still prevents a stale verifier from committing.
    }
  }

  private async durableAcquire(
    factory: IDBFactory,
    plan: StudioBg3dShotBatchPlan,
    sourceRevision: string,
    signal?: AbortSignal,
  ): Promise<{ job: JobRecord; lease: LeaseRecord; values: unknown[] }> {
    throwIfAborted(signal);
    const now = this.now();
    return withDatabase(factory, async (database) => {
      const transaction = readwriteTransaction(database);
      const done = transactionDone(transaction);
      const onSignalAbort = () => abortTransaction(transaction);
      signal?.addEventListener("abort", onSignalAbort, { once: true });
      try {
        const jobs = transaction.objectStore(JOBS_STORE);
        const artifacts = transaction.objectStore(ARTIFACTS_STORE);
        const leases = transaction.objectStore(LEASES_STORE);
        const meta = transaction.objectStore(META_STORE);
        const [rawJob, rawLease, rawUsage] = await Promise.all([
          requestResult<unknown>(jobs.get(plan.resumeKey)),
          requestResult<unknown>(leases.get(plan.resumeKey)),
          requestResult<unknown>(meta.get(META_KEY)),
        ]);
        throwIfAborted(signal);
        const created = rawJob === undefined;
        let job = created ? newJob(plan, sourceRevision, now) : rawJob as JobRecord;
        if (!isJobRecord(job, plan)) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.jobCorrupt");
        }
        if (job.sourceRevision !== sourceRevision) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.sourceSnapshotMismatch");
        }
        const existingLease = rawLease === undefined ? null : rawLease;
        if (existingLease !== null && !isLeaseRecord(existingLease, plan.resumeKey)) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.leaseCorrupt");
        }
        if (existingLease && existingLease.expiresAt > now && existingLease.ownerId !== this.ownerId) {
          throw new StudioBg3dShotBatchRecoveryError(
            "busy",
            "busy.otherTab",
          );
        }
        if (rawUsage !== undefined && !isUsageRecord(rawUsage)) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.storageUsageLedger");
        }
        const usage = rawUsage === undefined ? emptyUsage(now) : rawUsage;
        let nextUsage = usage;
        if (created) {
          if (usage.jobCount + 1 > STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS ||
            usage.artifactBytes + usage.structuredBytes + job.jobStorageBytes >
              STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES) {
            throw new StudioBg3dShotBatchRecoveryError(
              "budget-exceeded",
              "budgetExceeded.jobCountOrigin",
            );
          }
          nextUsage = {
            ...usage,
            revision: usage.revision + 1,
            structuredBytes: usage.structuredBytes + job.jobStorageBytes,
            jobCount: usage.jobCount + 1,
            updatedAt: now,
          };
        }
        const fence = (existingLease?.fence ?? 0) + 1;
        const recoveredQueue = retryStudioBg3dShotBatchQueue(job.queue);
        const interrupted = job.activeRun !== null ||
          job.queue.items.some(({ status }) => status === "running" || status === "failed");
        if (interrupted || rawJob === undefined) {
          job = copyJob(job, {
            plan,
            queue: recoveredQueue,
            activeRun: null,
            revision: job.revision + (interrupted ? 1 : 0),
            updatedAt: now,
            expiresAt: recoveryExpiry(recoveredQueue, now),
          });
        }
        const artifactRequests = job.artifactKeys.map((key) =>
          requestResult<unknown>(artifacts.get(key))
        );
        const values = await Promise.all(artifactRequests);
        throwIfAborted(signal);
        const leaseNow = this.now();
        const lease: LeaseRecord = {
          kind: "toonstudio-bg3d-shot-batch-lease",
          version: 1,
          recoveryKey: plan.resumeKey,
          ownerId: this.ownerId,
          leaseToken: randomId("bg3d-batch-lease"),
          fence,
          acquiredAt: leaseNow,
          heartbeatAt: leaseNow,
          expiresAt: leaseNow + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
        };
        await Promise.all([
          requestResult(jobs.put(job)),
          requestResult(leases.put(lease)),
          ...(created || rawUsage === undefined ? [requestResult(meta.put(nextUsage))] : []),
        ]);
        await done;
        return { job, lease, values };
      } catch (cause) {
        abortTransaction(transaction);
        await done.catch(() => undefined);
        if (cause instanceof StudioBg3dShotBatchRecoveryError || isAbortError(cause)) throw cause;
        throw new StudioBg3dShotBatchRecoveryError(
          "storage-unavailable",
          "storageUnavailable.storeReadFailed",
          { cause },
        );
      } finally {
        signal?.removeEventListener("abort", onSignalAbort);
      }
    });
  }

  private memoryAcquire(
    plan: StudioBg3dShotBatchPlan,
    sourceRevision: string,
    reason: StudioBg3dShotBatchRecoveryDegradedReason | null,
  ): StudioBg3dShotBatchRecoverySession {
    const now = this.now();
    purgeExpiredMemoryRecords(now);
    let record = memoryRecords.get(plan.resumeKey);
    if (!record) {
      const job = newJob(plan, sourceRevision, now);
      if (memoryJobCountExcluding(plan.resumeKey) + 1 >
        STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS ||
        memoryStorageBytesExcluding(plan.resumeKey) + job.jobStorageBytes >
          STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES) {
        throw new StudioBg3dShotBatchRecoveryError(
          "budget-exceeded",
          "budgetExceeded.memoryJobCountOrigin",
        );
      }
      record = { job, lease: null, artifacts: new Map() };
      memoryRecords.set(plan.resumeKey, record);
    }
    if (!isJobRecord(record.job, plan) || record.job.sourceRevision !== sourceRevision) {
      throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.memoryJobCorrupt");
    }
    if (record.lease && record.lease.expiresAt > now && record.lease.ownerId !== this.ownerId) {
      throw new StudioBg3dShotBatchRecoveryError("busy", "busy.sameTabEditor");
    }
    const fence = (record.lease?.fence ?? 0) + 1;
    const lease: LeaseRecord = {
      kind: "toonstudio-bg3d-shot-batch-lease",
      version: 1,
      recoveryKey: plan.resumeKey,
      ownerId: this.ownerId,
      leaseToken: randomId("bg3d-batch-memory-lease"),
      fence,
      acquiredAt: now,
      heartbeatAt: now,
      expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
    };
    const interrupted = record.job.activeRun !== null ||
      record.job.queue.items.some(({ status }) => status === "running" || status === "failed");
    record.job = copyJob(record.job, {
      queue: retryStudioBg3dShotBatchQueue(record.job.queue),
      activeRun: null,
      revision: record.job.revision + (interrupted ? 1 : 0),
      updatedAt: now,
      expiresAt: recoveryExpiry(retryStudioBg3dShotBatchQueue(record.job.queue), now),
    });
    record.lease = lease;
    const aggregate = aggregateArtifacts([...record.artifacts.values()]);
    return {
      plan,
      sourceRevision,
      ownerId: this.ownerId,
      mode: "memory",
      persistence: "unknown",
      degradedReason: reason,
      queue: record.job.queue,
      revision: record.job.revision,
      fence,
      leaseToken: lease.leaseToken,
      totalArtifactBytes: record.job.totalArtifactBytes,
      artifactCount: record.job.artifactCount,
      jobStorageBytes: record.job.jobStorageBytes,
      artifactStorageBytes: record.job.artifactStorageBytes,
      activeRun: null,
      ...aggregate,
      shotArtifacts: new Map([...record.artifacts.values()].map(({ shotId, artifacts }) => [
        shotId,
        artifacts,
      ])),
      released: false,
    };
  }

  async acquire(
    plan: StudioBg3dShotBatchPlan,
    sourceRevision: string,
    options: StudioBg3dShotBatchRecoveryAcquireOptions = {},
  ): Promise<StudioBg3dShotBatchRecoverySession> {
    throwIfAborted(options.signal);
    const verifiedPlan = await awaitWithAbort(
      hydrateStudioBg3dShotBatchPlan(plan),
      options.signal,
    );
    throwIfAborted(options.signal);
    if (!verifiedPlan || !await awaitWithAbort(
      verifyStudioBg3dShotBatchSourceRevision(verifiedPlan, sourceRevision),
      options.signal,
    )) {
      throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.planVerificationFailed");
    }
    throwIfAborted(options.signal);
    const factory = this.factory();
    if (verifiedPlan.scope.durability !== "durable" || !factory) {
      const session = this.memoryAcquire(
        verifiedPlan,
        sourceRevision,
        verifiedPlan.scope.durability === "durable"
          ? { code: "indexedDbUnavailable" }
          : null,
      );
      throwIfAborted(options.signal);
      this.startHeartbeat(session);
      return session;
    }
    let durableLeaseAcquired = false;
    try {
      await this.collectExpiredDurable(factory, null);
      throwIfAborted(options.signal);
      const persistencePromise = storagePersistence(this.storageManager);
      let acquired: { job: JobRecord; lease: LeaseRecord; values: unknown[] };
      try {
        acquired = await this.durableAcquire(factory, verifiedPlan, sourceRevision, options.signal);
      } catch (cause) {
        if (!isQuotaError(cause)) throw cause;
        await this.collectExpiredDurable(factory, verifiedPlan.resumeKey);
        throwIfAborted(options.signal);
        acquired = await this.durableAcquire(factory, verifiedPlan, sourceRevision, options.signal);
      }
      durableLeaseAcquired = true;
      const { job, lease, values } = acquired;
      const session: StudioBg3dShotBatchRecoverySession = {
        plan: verifiedPlan,
        sourceRevision,
        ownerId: this.ownerId,
        mode: "durable",
        persistence: "unknown",
        degradedReason: null,
        queue: job.queue,
        revision: job.revision,
        fence: lease.fence,
        leaseToken: lease.leaseToken,
        totalArtifactBytes: job.totalArtifactBytes,
        artifactCount: job.artifactCount,
        jobStorageBytes: job.jobStorageBytes,
        artifactStorageBytes: job.artifactStorageBytes,
        activeRun: job.activeRun,
        images: [],
        skippedArtifacts: [],
        layeredPsds: [],
        psdFallbacks: [],
        shotArtifacts: new Map(),
        released: false,
      };
      // Rehashing hundreds of MiB can exceed the normal lease window. Heartbeat the exact
      // provisional token while bytes are verified, then assert it once more before returning.
      this.startHeartbeat(session);
      try {
        session.persistence = await awaitWithAbort(persistencePromise, options.signal);
        throwIfAborted(options.signal);
        const storedPlan = await awaitWithAbort(
          hydrateStudioBg3dShotBatchPlan(job.plan),
          options.signal,
        );
        throwIfAborted(options.signal);
        if (!storedPlan || storedPlan.resumeKey !== verifiedPlan.resumeKey ||
          storedPlan.planDigest !== verifiedPlan.planDigest ||
          storedPlan.scopeDigest !== verifiedPlan.scopeDigest ||
          !await awaitWithAbort(
            verifyStudioBg3dShotBatchSourceRevision(storedPlan, job.sourceRevision),
            options.signal,
          )) {
          throw new StudioBg3dShotBatchRecoveryError(
            "corrupt",
            "corrupt.planDigestCorrupt",
          );
        }
        throwIfAborted(options.signal);
        const records = await verifyArtifactRecords(verifiedPlan, job, values, options.signal);
        throwIfAborted(options.signal);
        const aggregate = aggregateArtifacts(records);
        session.images = aggregate.images;
        session.skippedArtifacts = aggregate.skippedArtifacts;
        session.layeredPsds = aggregate.layeredPsds;
        session.psdFallbacks = aggregate.psdFallbacks;
        session.shotArtifacts = new Map(records.map(({ shotId, artifacts }) => [shotId, artifacts]));
        await this.renewLease(session);
        throwIfAborted(options.signal);
        return session;
      } catch (cause) {
        this.stopHeartbeat(session.plan.resumeKey);
        if (options.signal?.aborted || isAbortError(cause)) {
          await this.releaseExactDurableLease(factory, lease);
          session.released = true;
          throw recoveryAbortError();
        }
        if (isQuotaError(cause)) {
          this.degradeToMemory(session, cause);
          await this.releaseExactDurableLease(factory, lease);
          if (options.signal?.aborted) {
            await this.release(session);
            throw recoveryAbortError();
          }
          return session;
        }
        await this.releaseExactDurableLease(factory, lease);
        session.released = true;
        throw cause;
      }
    } catch (cause) {
      // A transient/open IndexedDB failure is ambiguous: another tab may still hold durable
      // authority. Only an explicit quota boundary may opt into the documented same-tab mode.
      if (durableLeaseAcquired || isAbortError(cause) || !isQuotaError(cause)) throw cause;
      const session = this.memoryAcquire(
        verifiedPlan,
        sourceRevision,
        { code: "quotaExceeded" },
      );
      throwIfAborted(options.signal);
      this.startHeartbeat(session);
      return session;
    }
  }

  private memoryRecord(session: StudioBg3dShotBatchRecoverySession): MemoryRecord {
    const record = memoryRecords.get(session.plan.resumeKey);
    if (!record || !record.lease) {
      throw new StudioBg3dShotBatchRecoveryError("lease-lost", "leaseLost.memoryMissing");
    }
    if (record.lease.ownerId !== session.ownerId ||
      record.lease.leaseToken !== session.leaseToken || record.lease.fence !== session.fence) {
      throw new StudioBg3dShotBatchRecoveryError(
        "lease-lost",
        "leaseLost.memoryTakenOver",
      );
    }
    if (record.job.revision !== session.revision) {
      throw new StudioBg3dShotBatchRecoveryError(
        "cas-conflict",
        "casConflict.memoryStateChanged",
      );
    }
    const now = this.now();
    record.lease = {
      ...record.lease,
      heartbeatAt: now,
      expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
    };
    return record;
  }

  private async durableMutate(
    session: StudioBg3dShotBatchRecoverySession,
    mutate: (input: {
      readonly job: JobRecord;
      readonly usage: UsageRecord;
      readonly now: number;
    }) => {
      readonly job: JobRecord;
      readonly usage?: UsageRecord;
      readonly artifactToAdd?: ArtifactRecord;
    },
    signal?: AbortSignal,
    assertAuthorizationReceipt?: () => void,
  ): Promise<JobRecord> {
    throwIfAborted(signal);
    const factory = this.factory();
    if (!factory) {
      throw new StudioBg3dShotBatchRecoveryError("storage-unavailable", "storageUnavailable.indexedDbGone");
    }
    return withDatabase(factory, async (database) => {
      const transaction = readwriteTransaction(database);
      const done = transactionDone(transaction);
      const onSignalAbort = () => abortTransaction(transaction);
      signal?.addEventListener("abort", onSignalAbort, { once: true });
      try {
        const jobs = transaction.objectStore(JOBS_STORE);
        const artifacts = transaction.objectStore(ARTIFACTS_STORE);
        const leases = transaction.objectStore(LEASES_STORE);
        const meta = transaction.objectStore(META_STORE);
        const [rawJob, rawLease, rawUsage] = await Promise.all([
          requestResult<unknown>(jobs.get(session.plan.resumeKey)),
          requestResult<unknown>(leases.get(session.plan.resumeKey)),
          requestResult<unknown>(meta.get(META_KEY)),
        ]);
        throwIfAborted(signal);
        if (!isJobRecord(rawJob, session.plan) || !isLeaseRecord(rawLease, session.plan.resumeKey) ||
          !isUsageRecord(rawUsage)) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.storeCorrupt");
        }
        const now = this.now();
        assertLeaseAndRevision(session, rawJob, rawLease, now);
        assertAuthorizationReceipt?.();
        const result = mutate({ job: rawJob, usage: rawUsage, now });
        if (result.artifactToAdd) {
          // Keep the transaction alive with the Blob add, then timestamp the renewed lease near
          // commit instead of before a potentially long browser storage write.
          await requestResult(artifacts.add(result.artifactToAdd));
          throwIfAborted(signal);
          assertAuthorizationReceipt?.();
        }
        const leaseNow = this.now();
        const refreshedLease: LeaseRecord = {
          ...rawLease,
          heartbeatAt: leaseNow,
          expiresAt: leaseNow + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
        };
        assertAuthorizationReceipt?.();
        await Promise.all([
          requestResult(jobs.put(result.job)),
          requestResult(leases.put(refreshedLease)),
          ...(result.usage ? [requestResult(meta.put(result.usage))] : []),
        ]);
        throwIfAborted(signal);
        await done;
        return result.job;
      } catch (cause) {
        abortTransaction(transaction);
        await done.catch(() => undefined);
        if (cause instanceof StudioBg3dShotBatchRecoveryError || isAbortError(cause)) throw cause;
        throw new StudioBg3dShotBatchRecoveryError(
          "storage-unavailable",
          "storageUnavailable.transactionFailed",
          { cause },
        );
      } finally {
        signal?.removeEventListener("abort", onSignalAbort);
      }
    });
  }

  private applyJob(session: StudioBg3dShotBatchRecoverySession, job: JobRecord): void {
    session.queue = job.queue;
    session.revision = job.revision;
    session.activeRun = job.activeRun;
    session.totalArtifactBytes = job.totalArtifactBytes;
    session.artifactCount = job.artifactCount;
    session.jobStorageBytes = job.jobStorageBytes;
    session.artifactStorageBytes = job.artifactStorageBytes;
  }

  private degradeToMemory(
    session: StudioBg3dShotBatchRecoverySession,
    cause: unknown,
    pendingArtifactBytes = 0,
    pendingArtifactStorageBytes = 0,
  ): void {
    const now = this.now();
    purgeExpiredMemoryRecords(now);
    const existing = memoryRecords.get(session.plan.resumeKey);
    if (existing?.lease && existing.lease.expiresAt > now &&
      (existing.lease.ownerId !== session.ownerId ||
        existing.lease.leaseToken !== session.leaseToken)) {
      throw new StudioBg3dShotBatchRecoveryError(
        "busy",
        "busy.memoryOtherEditor",
      );
    }
    const records = new Map<string, ArtifactRecord>();
    for (const shot of session.plan.shots) {
      const verified = session.shotArtifacts.get(shot.shotId);
      if (!verified) continue;
      const existingKey = artifactKey(session.plan.resumeKey, shot.shotId);
      records.set(existingKey, withArtifactStorageBytes({
        kind: "toonstudio-bg3d-shot-batch-shot-artifacts",
        version: 1,
        artifactKey: existingKey,
        recoveryKey: session.plan.resumeKey,
        shotId: shot.shotId,
        artifacts: verified,
        createdAt: now,
      }));
    }
    const artifactStorageBytes = [...records.values()].reduce(
      (total, record) => total + record.storageBytes,
      0,
    );
    if (session.totalArtifactBytes + pendingArtifactBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES ||
      memoryJobCountExcluding(session.plan.resumeKey) + 1 >
        STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS ||
      memoryStorageBytesExcluding(session.plan.resumeKey) + session.totalArtifactBytes +
        pendingArtifactBytes + session.jobStorageBytes + artifactStorageBytes +
        pendingArtifactStorageBytes > STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES) {
      throw new StudioBg3dShotBatchRecoveryError(
        "budget-exceeded",
        "budgetExceeded.memoryOrigin",
      );
    }
    this.stopHeartbeat(session.plan.resumeKey);
    const lease: LeaseRecord = {
      kind: "toonstudio-bg3d-shot-batch-lease",
      version: 1,
      recoveryKey: session.plan.resumeKey,
      ownerId: session.ownerId,
      leaseToken: randomId("bg3d-batch-memory-lease"),
      fence: session.fence,
      acquiredAt: now,
      heartbeatAt: now,
      expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
    };
    const job: JobRecord = {
      kind: "toonstudio-bg3d-shot-batch-job",
      version: 1,
      recoveryKey: session.plan.resumeKey,
      plan: session.plan,
      sourceRevision: session.sourceRevision,
      queue: session.queue,
      revision: session.revision,
      activeRun: session.activeRun,
      artifactKeys: [...records.keys()],
      totalArtifactBytes: session.totalArtifactBytes,
      artifactCount: session.artifactCount,
      jobStorageBytes: session.jobStorageBytes,
      artifactStorageBytes,
      createdAt: now,
      updatedAt: now,
      expiresAt: recoveryExpiry(session.queue, now),
      downloadRequestedAt: null,
    };
    memoryRecords.set(session.plan.resumeKey, { job, lease, artifacts: records });
    session.mode = "memory";
    session.persistence = "unknown";
    session.degradedReason = isQuotaError(cause)
      ? { code: "quotaExceeded" }
      : { code: "indexedDbError" };
    session.fence = lease.fence;
    session.leaseToken = lease.leaseToken;
    session.artifactStorageBytes = artifactStorageBytes;
    this.startHeartbeat(session);
  }

  private async mutateWithDegradation(
    session: StudioBg3dShotBatchRecoverySession,
    durable: () => Promise<JobRecord>,
    memory: () => JobRecord | Promise<JobRecord>,
    pendingArtifactBytes = 0,
    pendingArtifactStorageBytes = 0,
  ): Promise<JobRecord> {
    if (session.released) {
      throw new StudioBg3dShotBatchRecoveryError("lease-lost", "leaseLost.sessionReleased");
    }
    if (session.mode === "memory") return await memory();
    try {
      return await durable();
    } catch (cause) {
      let terminalCause = cause;
      if (isQuotaError(cause)) {
        const factory = this.factory();
        if (factory) {
          try {
            await this.collectExpiredDurable(factory, session.plan.resumeKey);
            return await durable();
          } catch (retryCause) {
            terminalCause = retryCause;
          }
        }
      }
      const durableLeaseIdentity: LeaseRecord = {
        kind: "toonstudio-bg3d-shot-batch-lease",
        version: 1,
        recoveryKey: session.plan.resumeKey,
        ownerId: session.ownerId,
        leaseToken: session.leaseToken,
        fence: session.fence,
        acquiredAt: 0,
        heartbeatAt: 0,
        expiresAt: 0,
      };
      const factory = this.factory();
      if (!isQuotaError(terminalCause)) {
        if (terminalCause instanceof StudioBg3dShotBatchRecoveryError &&
          terminalCause.code === "storage-unavailable") {
          this.stopHeartbeat(session.plan.resumeKey);
          session.released = true;
          if (factory) await this.releaseExactDurableLease(factory, durableLeaseIdentity);
        }
        throw terminalCause;
      }
      this.degradeToMemory(
        session,
        terminalCause,
        pendingArtifactBytes,
        pendingArtifactStorageBytes,
      );
      if (factory) await this.releaseExactDurableLease(factory, durableLeaseIdentity);
      return await memory();
    }
  }

  async startShot(
    session: StudioBg3dShotBatchRecoverySession,
    shotId: string,
  ): Promise<StudioBg3dShotBatchRunToken> {
    const runId = randomId("bg3d-batch-run");
    const nextQueue = startStudioBg3dShotBatchQueueItem(session.queue, shotId);
    if (!nextQueue) throw new StudioBg3dShotBatchRecoveryError("cas-conflict", "casConflict.startTransition");
    const activeRun: ActiveRun = { shotId, runId, fence: session.fence };
    const nextJob = await this.mutateWithDegradation(
      session,
      () => this.durableMutate(session, ({ job, now }) => ({
        job: copyJob(job, {
          queue: nextQueue,
          activeRun,
          revision: job.revision + 1,
          updatedAt: now,
          expiresAt: recoveryExpiry(nextQueue, now),
          downloadRequestedAt: null,
        }),
      })),
      () => {
        const record = this.memoryRecord(session);
        record.job = copyJob(record.job, {
          queue: nextQueue,
          activeRun: { ...activeRun, fence: session.fence },
          revision: record.job.revision + 1,
          updatedAt: this.now(),
          expiresAt: recoveryExpiry(nextQueue, this.now()),
          downloadRequestedAt: null,
        });
        return record.job;
      },
    );
    this.applyJob(session, nextJob);
    const actual = session.activeRun!;
    return { shotId, runId, fence: actual.fence, revision: session.revision };
  }

  private assertRun(
    session: StudioBg3dShotBatchRecoverySession,
    token: StudioBg3dShotBatchRunToken,
  ): void {
    if (!session.activeRun || session.activeRun.shotId !== token.shotId ||
      session.activeRun.runId !== token.runId || session.activeRun.fence !== token.fence ||
      session.revision !== token.revision) {
      throw new StudioBg3dShotBatchRecoveryError("cas-conflict", "casConflict.staleCommit");
    }
  }

  async completeShot(
    session: StudioBg3dShotBatchRecoverySession,
    token: StudioBg3dShotBatchRunToken,
    artifactsInput: StudioBg3dShotBatchShotArtifacts,
    options: StudioBg3dShotBatchRecoveryCommitOptions = {},
  ): Promise<void> {
    throwIfAborted(options.signal);
    this.assertRun(session, token);
    const verified = await awaitWithAbort(
      verifyStudioBg3dShotBatchShotArtifacts(
        session.plan,
        token.shotId,
        artifactsInput,
        options.signal,
      ),
      options.signal,
    );
    throwIfAborted(options.signal);
    this.assertRun(session, token);
    const usedAuthorizationReceipts = new WeakSet<object>();
    const obtainCommitAuthorization = async (): Promise<(() => void) | undefined> => {
      throwIfAborted(options.signal);
      this.assertRun(session, token);
      if (!options.authorizeBeforeCommit) return undefined;
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
      if (usedAuthorizationReceipts.has(receipt)) {
        throw new StudioBg3dShotBatchRecoveryError(
          "access-denied",
          "accessDenied.receiptReused",
        );
      }
      usedAuthorizationReceipts.add(receipt);
      throwIfAborted(options.signal);
      this.assertRun(session, token);
      const assertCurrent = () => assertAuthorizationReceipt(receipt, this.now());
      assertCurrent();
      return assertCurrent;
    };
    const nextQueue = succeedStudioBg3dShotBatchQueueItem(session.queue, token.shotId);
    if (!nextQueue) throw new StudioBg3dShotBatchRecoveryError("cas-conflict", "casConflict.completeTransition");
    const key = artifactKey(session.plan.resumeKey, token.shotId);
    const createdAt = this.now();
    const record = withArtifactStorageBytes({
      kind: "toonstudio-bg3d-shot-batch-shot-artifacts",
      version: 1,
      artifactKey: key,
      recoveryKey: session.plan.resumeKey,
      shotId: token.shotId,
      artifacts: verified,
      createdAt,
    });
    const nextJob = await this.mutateWithDegradation(
      session,
      async () => {
        await this.assertStorageEstimateCapacity(verified.totalBytes + record.storageBytes);
        const assertCurrentAuthorization = await obtainCommitAuthorization();
        return this.durableMutate(session, ({ job, usage, now }) => {
          if (!job.activeRun || job.activeRun.runId !== token.runId ||
            job.activeRun.fence !== token.fence || job.activeRun.shotId !== token.shotId) {
            throw new StudioBg3dShotBatchRecoveryError("cas-conflict", "casConflict.fenceChanged");
          }
          if (job.artifactKeys.includes(key)) {
            throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.duplicateArtifact");
          }
          const totalArtifactBytes = job.totalArtifactBytes + verified.totalBytes;
          const artifactCount = job.artifactCount + verified.artifactCount;
          const artifactStorageBytes = job.artifactStorageBytes + record.storageBytes;
          const originBytes = usage.artifactBytes + verified.totalBytes;
          const originStructuredBytes = usage.structuredBytes + record.storageBytes;
          if (totalArtifactBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES) {
            throw new StudioBg3dShotBatchRecoveryError(
              "budget-exceeded",
              "budgetExceeded.artifactJobStorage",
            );
          }
          if (originBytes + originStructuredBytes >
            STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES) {
            // Origin pressure can be relieved by collecting another expired Job, unlike the
            // immutable per-Job limit above. Route it through the bounded GC + one-retry path.
            throw new DOMException(
              "Studio 3D recovery origin ledger is full.",
              "QuotaExceededError",
            );
          }
          return {
            artifactToAdd: record,
            job: copyJob(job, {
              queue: nextQueue,
              activeRun: null,
              artifactKeys: [...job.artifactKeys, key],
              totalArtifactBytes,
              artifactCount,
              artifactStorageBytes,
              revision: job.revision + 1,
              updatedAt: now,
              expiresAt: recoveryExpiry(nextQueue, now),
            }),
            usage: {
              ...usage,
              revision: usage.revision + 1,
              artifactBytes: originBytes,
              artifactCount: usage.artifactCount + verified.artifactCount,
              structuredBytes: originStructuredBytes,
              updatedAt: now,
            },
          };
        }, options.signal, assertCurrentAuthorization);
      },
      async () => {
        const assertCurrentAuthorization = await obtainCommitAuthorization();
        assertCurrentAuthorization?.();
        const memory = this.memoryRecord(session);
        if (memory.job.artifactKeys.includes(key)) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.duplicateArtifact");
        }
        const totalArtifactBytes = memory.job.totalArtifactBytes + verified.totalBytes;
        const artifactStorageBytes = memory.job.artifactStorageBytes + record.storageBytes;
        if (totalArtifactBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES ||
          memoryStorageBytesExcluding(session.plan.resumeKey) + totalArtifactBytes +
            memory.job.jobStorageBytes + artifactStorageBytes >
            STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES) {
          throw new StudioBg3dShotBatchRecoveryError("budget-exceeded", "budgetExceeded.memoryExceeded");
        }
        memory.artifacts.set(key, record);
        memory.job = copyJob(memory.job, {
          queue: nextQueue,
          activeRun: null,
          artifactKeys: [...memory.job.artifactKeys, key],
          totalArtifactBytes,
          artifactCount: memory.job.artifactCount + verified.artifactCount,
          artifactStorageBytes,
          revision: memory.job.revision + 1,
          updatedAt: this.now(),
          expiresAt: recoveryExpiry(nextQueue, this.now()),
        });
        return memory.job;
      },
      verified.totalBytes,
      record.storageBytes,
    );
    this.applyJob(session, nextJob);
    session.images.push(...verified.images);
    session.skippedArtifacts.push(...verified.skippedArtifacts);
    session.layeredPsds.push(...verified.layeredPsds);
    session.psdFallbacks.push(...verified.psdFallbacks);
    session.shotArtifacts.set(token.shotId, verified);
  }

  async failShot(
    session: StudioBg3dShotBatchRecoverySession,
    token: StudioBg3dShotBatchRunToken,
    failureCode: StudioBg3dShotBatchFailureCode,
  ): Promise<void> {
    this.assertRun(session, token);
    const nextQueue = failStudioBg3dShotBatchQueueItem(session.queue, token.shotId, failureCode);
    if (!nextQueue) throw new StudioBg3dShotBatchRecoveryError("cas-conflict", "casConflict.failTransition");
    const nextJob = await this.mutateWithDegradation(
      session,
      () => this.durableMutate(session, ({ job, now }) => ({
        job: copyJob(job, {
          queue: nextQueue,
          activeRun: null,
          revision: job.revision + 1,
          updatedAt: now,
          expiresAt: recoveryExpiry(nextQueue, now),
        }),
      })),
      () => {
        const memory = this.memoryRecord(session);
        memory.job = copyJob(memory.job, {
          queue: nextQueue,
          activeRun: null,
          revision: memory.job.revision + 1,
          updatedAt: this.now(),
          expiresAt: recoveryExpiry(nextQueue, this.now()),
        });
        return memory.job;
      },
    );
    this.applyJob(session, nextJob);
  }

  async resetInterrupted(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    if (!session.activeRun && !session.queue.items.some(({ status }) => status === "running")) return;
    const nextQueue = retryStudioBg3dShotBatchQueue(session.queue);
    const nextJob = await this.mutateWithDegradation(
      session,
      () => this.durableMutate(session, ({ job, now }) => ({
        job: copyJob(job, {
          queue: nextQueue,
          activeRun: null,
          revision: job.revision + 1,
          updatedAt: now,
          expiresAt: recoveryExpiry(nextQueue, now),
        }),
      })),
      () => {
        const memory = this.memoryRecord(session);
        memory.job = copyJob(memory.job, {
          queue: nextQueue,
          activeRun: null,
          revision: memory.job.revision + 1,
          updatedAt: this.now(),
          expiresAt: recoveryExpiry(nextQueue, this.now()),
        });
        return memory.job;
      },
    );
    this.applyJob(session, nextJob);
  }

  async markDownloadRequested(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    if (!queueIsComplete(session.queue) || session.activeRun !== null) {
      throw new StudioBg3dShotBatchRecoveryError(
        "cas-conflict",
        "casConflict.downloadGate",
      );
    }
    const nextJob = await this.mutateWithDegradation(
      session,
      () => this.durableMutate(session, ({ job, now }) => ({
        job: copyJob(job, {
          revision: job.revision + 1,
          updatedAt: now,
          expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_DOWNLOAD_TTL_MS,
          downloadRequestedAt: now,
        }),
      })),
      () => {
        const memory = this.memoryRecord(session);
        const now = this.now();
        memory.job = copyJob(memory.job, {
          revision: memory.job.revision + 1,
          updatedAt: now,
          expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_DOWNLOAD_TTL_MS,
          downloadRequestedAt: now,
        });
        return memory.job;
      },
    );
    this.applyJob(session, nextJob);
  }

  private async renewLease(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    if (session.released) return;
    if (session.mode === "memory") {
      this.memoryRecord(session);
      return;
    }
    const factory = this.factory();
    if (!factory) return;
    await withDatabase(factory, async (database) => {
      const transaction = readwriteTransaction(database);
      const done = transactionDone(transaction);
      const store = transaction.objectStore(LEASES_STORE);
      try {
        const raw = await requestResult<unknown>(store.get(session.plan.resumeKey));
        if (!isLeaseRecord(raw, session.plan.resumeKey) || raw.ownerId !== session.ownerId ||
          raw.leaseToken !== session.leaseToken || raw.fence !== session.fence) {
          throw new StudioBg3dShotBatchRecoveryError("lease-lost", "leaseLost.renewFailed");
        }
        const now = this.now();
        await requestResult(store.put({
          ...raw,
          heartbeatAt: now,
          expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
        }));
        await done;
      } catch (cause) {
        abortTransaction(transaction);
        await done.catch(() => undefined);
        if (cause instanceof StudioBg3dShotBatchRecoveryError) throw cause;
        throw new StudioBg3dShotBatchRecoveryError(
          "storage-unavailable",
          "storageUnavailable.leaseRenewFailed",
          { cause },
        );
      }
    });
  }

  async release(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    if (session.released) return;
    this.stopHeartbeat(session.plan.resumeKey);
    session.released = true;
    if (session.mode === "memory") {
      const record = memoryRecords.get(session.plan.resumeKey);
      if (record?.lease?.ownerId === session.ownerId &&
        record.lease.leaseToken === session.leaseToken && record.lease.fence === session.fence) {
        record.lease = null;
      }
      return;
    }
    const factory = this.factory();
    if (!factory) return;
    try {
      await withDatabase(factory, async (database) => {
        const transaction = readwriteTransaction(database);
        const done = transactionDone(transaction);
        const leases = transaction.objectStore(LEASES_STORE);
        const raw = await requestResult<unknown>(leases.get(session.plan.resumeKey));
        if (isLeaseRecord(raw, session.plan.resumeKey) && raw.ownerId === session.ownerId &&
          raw.leaseToken === session.leaseToken && raw.fence === session.fence) {
          await requestResult(leases.delete(session.plan.resumeKey));
        }
        await done;
      });
    } catch {
      // Release is best effort; expiry + fencing still prevents a stale owner from committing.
    }
  }

  async discard(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    if (session.released) return;
    this.stopHeartbeat(session.plan.resumeKey);
    if (session.mode === "memory") {
      this.memoryRecord(session);
      memoryRecords.delete(session.plan.resumeKey);
      session.released = true;
      return;
    }
    const factory = this.factory();
    if (!factory) throw new StudioBg3dShotBatchRecoveryError(
      "storage-unavailable",
      "storageUnavailable.indexedDbMissingForDiscard",
    );
    await withDatabase(factory, async (database) => {
      const transaction = readwriteTransaction(database);
      const done = transactionDone(transaction);
      try {
        const jobs = transaction.objectStore(JOBS_STORE);
        const artifacts = transaction.objectStore(ARTIFACTS_STORE);
        const leases = transaction.objectStore(LEASES_STORE);
        const meta = transaction.objectStore(META_STORE);
        const [rawJob, rawLease, rawUsage] = await Promise.all([
          requestResult<unknown>(jobs.get(session.plan.resumeKey)),
          requestResult<unknown>(leases.get(session.plan.resumeKey)),
          requestResult<unknown>(meta.get(META_KEY)),
        ]);
        if (!isJobRecord(rawJob, session.plan) || !isLeaseRecord(rawLease, session.plan.resumeKey) ||
          !isUsageRecord(rawUsage)) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.discardJobCorrupt");
        }
        assertLeaseAndRevision(session, rawJob, rawLease, this.now());
        const structuredBytes = rawJob.jobStorageBytes + rawJob.artifactStorageBytes;
        if (rawUsage.artifactBytes < rawJob.totalArtifactBytes ||
          rawUsage.artifactCount < rawJob.artifactCount ||
          rawUsage.structuredBytes < structuredBytes || rawUsage.jobCount < 1) {
          throw new StudioBg3dShotBatchRecoveryError(
            "corrupt",
            "corrupt.usageLedgerTooSmallForDiscard",
          );
        }
        await Promise.all([
          ...rawJob.artifactKeys.map((key) => requestResult(artifacts.delete(key))),
          requestResult(jobs.delete(session.plan.resumeKey)),
          requestResult(leases.delete(session.plan.resumeKey)),
          requestResult(meta.put({
            ...rawUsage,
            revision: rawUsage.revision + 1,
            artifactBytes: rawUsage.artifactBytes - rawJob.totalArtifactBytes,
            artifactCount: rawUsage.artifactCount - rawJob.artifactCount,
            structuredBytes: rawUsage.structuredBytes - structuredBytes,
            jobCount: rawUsage.jobCount - 1,
            updatedAt: this.now(),
          })),
        ]);
        await done;
        session.released = true;
        const memory = memoryRecords.get(session.plan.resumeKey);
        if (!memory?.lease || memory.lease.expiresAt <= this.now()) {
          memoryRecords.delete(session.plan.resumeKey);
        }
      } catch (cause) {
        abortTransaction(transaction);
        await done.catch(() => undefined);
        throw cause;
      }
    });
  }
}

const putVerifiedCasBlob: PutVerifiedCasBlob = async (store, blob, receipt, signal) => {
  throwIfAborted(signal);
  const bytes = new Uint8Array(await awaitWithAbort(blob.arrayBuffer(), signal));
  throwIfAborted(signal);
  if (bytes.byteLength !== receipt.byteSize) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.byteLedgerChanged");
  }
  const written = await store.put(bytes, { mime: blob.type });
  const expectedHash = `sha256:${receipt.sha256}` as const;
  if (written.ref.hash !== expectedHash || written.ref.bytes !== receipt.byteSize) {
    throw new StudioBg3dShotBatchRecoveryError(
      "corrupt",
      "corrupt.casAddressMismatch",
    );
  }
  return { hash: expectedHash, byteSize: receipt.byteSize, mime: blob.type };
};

export function createStudioBg3dShotBatchRecoveryStore(
  options: StudioBg3dShotBatchRecoveryStoreOptions = {},
): StudioBg3dShotBatchRecoveryStore {
  if (Object.prototype.hasOwnProperty.call(options, "indexedDB")) {
    return new LegacyIndexedDbStudioBg3dShotBatchRecoveryStore(options);
  }
  return new SqliteOpfsStudioBg3dShotBatchRecoveryStore(options, {
    sqliteNamespace: STUDIO_BG3D_SHOT_BATCH_RECOVERY_SQLITE_NAMESPACE,
    putVerifiedBlob: putVerifiedCasBlob,
    createMemoryDelegate: ({ now, ownerId }) => new LegacyIndexedDbStudioBg3dShotBatchRecoveryStore({
      indexedDB: null,
      now,
      ownerId,
      heartbeat: false,
      storageManager: null,
    }),
  });
}
