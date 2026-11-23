/**
 * Record guards, authorization/lease assertions, artifact verification,
 * and session helpers for Studio 3D shot-batch recovery.
 */

import { STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES } from "./studio-bg3d-shot-batch";
import {
  reverifyStudioBg3dShotBatchShotArtifacts,
  type StudioBg3dVerifiedShotBatchShotArtifacts,
} from "./studio-bg3d-shot-batch-artifact-integrity";
import { type StudioBg3dShotBatchPlan } from "./studio-bg3d-shot-batch-plan";
import {
  createStudioBg3dShotBatchQueue,
  STUDIO_BG3D_SHOT_BATCH_MAX_ATTEMPTS,
  type StudioBg3dShotBatchQueue,
} from "./studio-bg3d-shot-batch-queue";
import { StudioBg3dShotBatchRecoveryError } from "./studio-bg3d-shot-batch-recovery-error";
import {
  FAILURE_CODES,
  META_KEY,
  RECOVERY_KEY_PATTERN,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_AUTHORIZATION_RECEIPT_MAX_TTL_MS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_DOWNLOAD_TTL_MS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_TTL_MS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES,
  artifactKey,
  awaitWithAbort,
  estimateArtifactStorageBytes,
  estimateJobStorageBytes,
  exactKeys,
  isAbortError,
  throwIfAborted,
  type ActiveRun,
  type ArtifactRecord,
  type JobRecord,
  type LeaseRecord,
  type StudioBg3dShotBatchRecoveryAuthorizationReceipt,
  type StudioBg3dShotBatchRecoveryPersistence,
  type StudioBg3dShotBatchRecoverySession,
  type UsageRecord,
} from "./studio-bg3d-shot-batch-recovery-types";

function isQueue(value: unknown, plan: StudioBg3dShotBatchPlan): value is StudioBg3dShotBatchQueue {
  if (!exactKeys(value, ["version", "resumeKey", "items"])) return false;
  const queue = value as StudioBg3dShotBatchQueue;
  return queue.version === 2 && queue.resumeKey === plan.resumeKey &&
    Array.isArray(queue.items) && queue.items.length === plan.shots.length &&
    queue.items.every((item, index) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
      const expectedKeys = item.failureCode === undefined
        ? ["shotId", "status", "attempts"]
        : ["shotId", "status", "attempts", "failureCode"];
      return exactKeys(item, expectedKeys) && item.shotId === plan.shots[index]?.shotId &&
        (["pending", "running", "succeeded", "failed"] as const).includes(item.status) &&
        Number.isSafeInteger(item.attempts) && item.attempts >= 0 &&
        item.attempts <= STUDIO_BG3D_SHOT_BATCH_MAX_ATTEMPTS &&
        (item.status === "failed") === (item.failureCode !== undefined) &&
        (item.failureCode === undefined || FAILURE_CODES.has(item.failureCode));
    }) && queue.items.filter(({ status }) => status === "running").length <= 1;
}

function isActiveRun(value: unknown, plan: StudioBg3dShotBatchPlan): value is ActiveRun {
  if (!exactKeys(value, ["shotId", "runId", "fence"])) return false;
  const run = value as ActiveRun;
  return plan.shots.some(({ shotId }) => shotId === run.shotId) &&
    typeof run.runId === "string" && run.runId.length >= 1 && run.runId.length <= 160 &&
    Number.isSafeInteger(run.fence) && run.fence >= 1;
}

export function isJobRecord(value: unknown, plan: StudioBg3dShotBatchPlan): value is JobRecord {
  if (!exactKeys(value, [
    "kind", "version", "recoveryKey", "plan", "sourceRevision", "queue", "revision",
    "activeRun", "artifactKeys", "totalArtifactBytes", "artifactCount", "jobStorageBytes",
    "artifactStorageBytes", "createdAt", "updatedAt", "expiresAt", "downloadRequestedAt",
  ])) return false;
  const job = value as JobRecord;
  const expectedJobStorageBytes = typeof job.sourceRevision === "string"
    ? estimateJobStorageBytes(job.plan, job.sourceRevision)
    : null;
  return job.kind === "toonstudio-bg3d-shot-batch-job" && job.version === 1 &&
    job.recoveryKey === plan.resumeKey && job.plan?.resumeKey === plan.resumeKey &&
    typeof job.sourceRevision === "string" && isQueue(job.queue, plan) &&
    Number.isSafeInteger(job.revision) && job.revision >= 0 &&
    (job.activeRun === null || isActiveRun(job.activeRun, plan)) &&
    Array.isArray(job.artifactKeys) && job.artifactKeys.length <= plan.shots.length &&
    job.artifactKeys.every((key) => typeof key === "string" && key.startsWith(`${plan.resumeKey}|`)) &&
    new Set(job.artifactKeys).size === job.artifactKeys.length &&
    Number.isSafeInteger(job.totalArtifactBytes) && job.totalArtifactBytes >= 0 &&
    job.totalArtifactBytes <= STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES &&
    Number.isSafeInteger(job.artifactCount) && job.artifactCount >= 0 &&
    expectedJobStorageBytes !== null && job.jobStorageBytes === expectedJobStorageBytes &&
    Number.isSafeInteger(job.artifactStorageBytes) && job.artifactStorageBytes >= 0 &&
    job.artifactStorageBytes <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES &&
    job.totalArtifactBytes + job.jobStorageBytes + job.artifactStorageBytes <=
      STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES &&
    [job.createdAt, job.updatedAt, job.expiresAt].every((time) =>
      Number.isSafeInteger(time) && time >= 0,
    ) &&
    (job.downloadRequestedAt === null || (
      Number.isSafeInteger(job.downloadRequestedAt) && job.downloadRequestedAt >= 0
    ));
}

export function isLeaseRecord(value: unknown, recoveryKey: string): value is LeaseRecord {
  if (!exactKeys(value, [
    "kind", "version", "recoveryKey", "ownerId", "leaseToken", "fence",
    "acquiredAt", "heartbeatAt", "expiresAt",
  ])) return false;
  const lease = value as LeaseRecord;
  return lease.kind === "toonstudio-bg3d-shot-batch-lease" && lease.version === 1 &&
    lease.recoveryKey === recoveryKey && typeof lease.ownerId === "string" &&
    lease.ownerId.length >= 1 && lease.ownerId.length <= 200 &&
    typeof lease.leaseToken === "string" && lease.leaseToken.length >= 1 &&
    lease.leaseToken.length <= 200 && Number.isSafeInteger(lease.fence) && lease.fence >= 1 &&
    [lease.acquiredAt, lease.heartbeatAt, lease.expiresAt].every((time) =>
      Number.isSafeInteger(time) && time >= 0,
    );
}

export function isUsageRecord(value: unknown): value is UsageRecord {
  if (!exactKeys(value, [
    "kind", "version", "key", "revision", "artifactBytes", "artifactCount",
    "structuredBytes", "jobCount", "updatedAt",
  ])) return false;
  const usage = value as UsageRecord;
  return usage.kind === "toonstudio-bg3d-shot-batch-usage" && usage.version === 1 &&
    usage.key === META_KEY && Number.isSafeInteger(usage.revision) && usage.revision >= 0 &&
    Number.isSafeInteger(usage.artifactBytes) && usage.artifactBytes >= 0 &&
    usage.artifactBytes <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES &&
    Number.isSafeInteger(usage.artifactCount) && usage.artifactCount >= 0 &&
    Number.isSafeInteger(usage.structuredBytes) && usage.structuredBytes >= 0 &&
    usage.structuredBytes <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES &&
    usage.artifactBytes + usage.structuredBytes <=
      STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES &&
    Number.isSafeInteger(usage.jobCount) && usage.jobCount >= 0 &&
    usage.jobCount <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS &&
    Number.isSafeInteger(usage.updatedAt) && usage.updatedAt >= 0;
}

/** Minimal plan-independent parser used only to delete expired, inactive jobs atomically. */
export function isGcJobRecord(value: unknown): value is JobRecord {
  if (!exactKeys(value, [
    "kind", "version", "recoveryKey", "plan", "sourceRevision", "queue", "revision",
    "activeRun", "artifactKeys", "totalArtifactBytes", "artifactCount", "jobStorageBytes",
    "artifactStorageBytes", "createdAt", "updatedAt", "expiresAt", "downloadRequestedAt",
  ])) return false;
  const job = value as JobRecord;
  const expectedJobStorageBytes = typeof job.sourceRevision === "string"
    ? estimateJobStorageBytes(job.plan, job.sourceRevision)
    : null;
  return job.kind === "toonstudio-bg3d-shot-batch-job" && job.version === 1 &&
    typeof job.recoveryKey === "string" && RECOVERY_KEY_PATTERN.test(job.recoveryKey) &&
    typeof job.plan === "object" && job.plan !== null &&
    typeof job.sourceRevision === "string" && Number.isSafeInteger(job.revision) && job.revision >= 0 &&
    Array.isArray(job.artifactKeys) && new Set(job.artifactKeys).size === job.artifactKeys.length &&
    job.artifactKeys.every((key) => typeof key === "string" && key.startsWith(`${job.recoveryKey}|`)) &&
    Number.isSafeInteger(job.totalArtifactBytes) && job.totalArtifactBytes >= 0 &&
    job.totalArtifactBytes <= STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES &&
    Number.isSafeInteger(job.artifactCount) && job.artifactCount >= 0 &&
    expectedJobStorageBytes !== null && job.jobStorageBytes === expectedJobStorageBytes &&
    Number.isSafeInteger(job.artifactStorageBytes) && job.artifactStorageBytes >= 0 &&
    job.artifactStorageBytes <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES &&
    [job.createdAt, job.updatedAt, job.expiresAt].every((time) =>
      Number.isSafeInteger(time) && time >= 0,
    ) && (job.downloadRequestedAt === null || (
      Number.isSafeInteger(job.downloadRequestedAt) && job.downloadRequestedAt >= 0
    ));
}

export function isGcLeaseRecord(value: unknown): value is LeaseRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const recoveryKey = (value as Partial<LeaseRecord>).recoveryKey;
  return typeof recoveryKey === "string" && RECOVERY_KEY_PATTERN.test(recoveryKey) &&
    isLeaseRecord(value, recoveryKey);
}

/** Plan-independent artifact envelope validation used by GC. */
export function isGcArtifactRecord(value: unknown): value is ArtifactRecord {
  if (!exactKeys(value, [
    "kind", "version", "artifactKey", "recoveryKey", "shotId", "artifacts",
    "storageBytes", "createdAt",
  ])) return false;
  const record = value as ArtifactRecord;
  if (record.kind !== "toonstudio-bg3d-shot-batch-shot-artifacts" || record.version !== 1 ||
    typeof record.recoveryKey !== "string" || !RECOVERY_KEY_PATTERN.test(record.recoveryKey) ||
    typeof record.shotId !== "string" || record.shotId.length < 1 || record.shotId.length > 160 ||
    record.artifactKey !== artifactKey(record.recoveryKey, record.shotId) ||
    !Number.isSafeInteger(record.createdAt) || record.createdAt < 0 ||
    !Number.isSafeInteger(record.storageBytes) || record.storageBytes < 1 ||
    !exactKeys(record.artifacts, [
      "images", "skippedArtifacts", "layeredPsds", "psdFallbacks",
      "blobs", "totalBytes", "artifactCount",
    ])) return false;
  const artifacts = record.artifacts;
  if (!Array.isArray(artifacts.images) || artifacts.images.length > 16 ||
    !Array.isArray(artifacts.skippedArtifacts) || artifacts.skippedArtifacts.length > 16 ||
    !Array.isArray(artifacts.layeredPsds) || artifacts.layeredPsds.length > 1 ||
    !Array.isArray(artifacts.psdFallbacks) || artifacts.psdFallbacks.length > 1 ||
    !Array.isArray(artifacts.blobs) || artifacts.blobs.length > 17 ||
    !Number.isSafeInteger(artifacts.totalBytes) || artifacts.totalBytes < 0 ||
    artifacts.totalBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES ||
    !Number.isSafeInteger(artifacts.artifactCount) || artifacts.artifactCount < 0 ||
    artifacts.artifactCount !== artifacts.images.length + artifacts.skippedArtifacts.length +
      artifacts.layeredPsds.length + artifacts.psdFallbacks.length) return false;
  let receiptBytes = 0;
  for (const receipt of artifacts.blobs) {
    if (!exactKeys(receipt, ["kind", "key", "sha256", "byteSize"]) ||
      (receipt.kind !== "png" && receipt.kind !== "psd") ||
      typeof receipt.key !== "string" || typeof receipt.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(receipt.sha256) || !Number.isSafeInteger(receipt.byteSize) ||
      receipt.byteSize < 1) return false;
    receiptBytes += receipt.byteSize;
  }
  let actualBlobBytes = 0;
  for (const image of artifacts.images) {
    if (typeof image !== "object" || image === null || !(image.png instanceof Blob)) return false;
    actualBlobBytes += image.png.size;
  }
  for (const layered of artifacts.layeredPsds) {
    if (typeof layered !== "object" || layered === null || !(layered.psd instanceof Blob)) return false;
    actualBlobBytes += layered.psd.size;
  }
  const { storageBytes: _storageBytes, ...withoutStorageBytes } = record;
  return artifacts.blobs.length === artifacts.images.length + artifacts.layeredPsds.length &&
    receiptBytes === artifacts.totalBytes && actualBlobBytes === artifacts.totalBytes &&
    estimateArtifactStorageBytes(withoutStorageBytes) === record.storageBytes;
}

export function emptyUsage(now: number): UsageRecord {
  return {
    kind: "toonstudio-bg3d-shot-batch-usage",
    version: 1,
    key: META_KEY,
    revision: 0,
    artifactBytes: 0,
    artifactCount: 0,
    structuredBytes: 0,
    jobCount: 0,
    updatedAt: now,
  };
}

export function newJob(
  plan: StudioBg3dShotBatchPlan,
  sourceRevision: string,
  now: number,
): JobRecord {
  const jobStorageBytes = estimateJobStorageBytes(plan, sourceRevision);
  if (jobStorageBytes === null) {
    throw new StudioBg3dShotBatchRecoveryError(
      "budget-exceeded",
      "budgetExceeded.jobMetadata",
    );
  }
  return {
    kind: "toonstudio-bg3d-shot-batch-job",
    version: 1,
    recoveryKey: plan.resumeKey,
    plan,
    sourceRevision,
    queue: createStudioBg3dShotBatchQueue(plan),
    revision: 0,
    activeRun: null,
    artifactKeys: [],
    totalArtifactBytes: 0,
    artifactCount: 0,
    jobStorageBytes,
    artifactStorageBytes: 0,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_TTL_MS,
    downloadRequestedAt: null,
  };
}

export function copyJob(job: JobRecord, patch: Partial<JobRecord>): JobRecord {
  return { ...job, ...patch };
}

export function queueIsComplete(queue: StudioBg3dShotBatchQueue): boolean {
  return queue.items.length > 0 && queue.items.every(({ status }) => status === "succeeded");
}

export function recoveryExpiry(queue: StudioBg3dShotBatchQueue, now: number): number {
  return now + (queueIsComplete(queue)
    ? STUDIO_BG3D_SHOT_BATCH_RECOVERY_DOWNLOAD_TTL_MS
    : STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_TTL_MS);
}

function storageCauseName(cause: unknown): string | null {
  let current: unknown = cause;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof DOMException) return current.name;
    if (current instanceof Error && "cause" in current) current = current.cause;
    else break;
  }
  return null;
}

export function isQuotaError(cause: unknown): boolean {
  return storageCauseName(cause) === "QuotaExceededError";
}

export function assertAuthorizationReceipt(
  receipt: StudioBg3dShotBatchRecoveryAuthorizationReceipt,
  now: number,
): void {
  const locallyCurrent = (() => {
    try {
      return receipt.isLocallyCurrent();
    } catch {
      return false;
    }
  })();
  if (
    !Number.isSafeInteger(receipt.authorizedAt) ||
    receipt.authorizedAt < 0 ||
    !Number.isSafeInteger(receipt.expiresAt) ||
    receipt.authorizedAt > now ||
    receipt.expiresAt <= now ||
    receipt.expiresAt - receipt.authorizedAt >
      STUDIO_BG3D_SHOT_BATCH_RECOVERY_AUTHORIZATION_RECEIPT_MAX_TTL_MS ||
    !locallyCurrent
  ) {
    throw new StudioBg3dShotBatchRecoveryError(
      "access-denied",
      "accessDenied.receiptExpired",
    );
  }
}

export function assertLeaseAndRevision(
  session: StudioBg3dShotBatchRecoverySession,
  job: JobRecord,
  lease: LeaseRecord,
  now: number,
): void {
  if (
    lease.ownerId !== session.ownerId || lease.leaseToken !== session.leaseToken ||
    lease.fence !== session.fence || lease.expiresAt <= now
  ) {
    throw new StudioBg3dShotBatchRecoveryError(
      "lease-lost",
      "leaseLost.takenOver",
    );
  }
  if (job.revision !== session.revision) {
    throw new StudioBg3dShotBatchRecoveryError(
      "cas-conflict",
      "casConflict.stateChanged",
    );
  }
}

export function aggregateArtifacts(records: readonly ArtifactRecord[]): Pick<
  StudioBg3dShotBatchRecoverySession,
  "images" | "skippedArtifacts" | "layeredPsds" | "psdFallbacks"
> {
  return {
    images: records.flatMap(({ artifacts }) => [...artifacts.images]),
    skippedArtifacts: records.flatMap(({ artifacts }) => [...artifacts.skippedArtifacts]),
    layeredPsds: records.flatMap(({ artifacts }) => [...artifacts.layeredPsds]),
    psdFallbacks: records.flatMap(({ artifacts }) => [...artifacts.psdFallbacks]),
  };
}

export async function verifyArtifactRecords(
  plan: StudioBg3dShotBatchPlan,
  job: JobRecord,
  values: readonly unknown[],
  signal?: AbortSignal,
): Promise<ArtifactRecord[]> {
  throwIfAborted(signal);
  if (values.length !== job.artifactKeys.length) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.artifactList");
  }
  const records: ArtifactRecord[] = [];
  const seenShotIds = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const expectedKey = job.artifactKeys[index];
    if (!exactKeys(value, [
      "kind", "version", "artifactKey", "recoveryKey", "shotId", "artifacts",
      "storageBytes", "createdAt",
    ])) {
      throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.artifactRecord");
    }
    const record = value as ArtifactRecord;
    if (
      record.kind !== "toonstudio-bg3d-shot-batch-shot-artifacts" || record.version !== 1 ||
      record.artifactKey !== expectedKey || record.recoveryKey !== plan.resumeKey ||
      !plan.shots.some(({ shotId }) => shotId === record.shotId) ||
      record.artifactKey !== artifactKey(plan.resumeKey, record.shotId) ||
      seenShotIds.has(record.shotId) ||
      !Number.isSafeInteger(record.createdAt) || record.createdAt < 0 ||
      !Number.isSafeInteger(record.storageBytes) || record.storageBytes < 1
    ) {
      throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.artifactOwnership");
    }
    seenShotIds.add(record.shotId);
    const { storageBytes: _storageBytes, ...withoutStorageBytes } = record;
    if (estimateArtifactStorageBytes(withoutStorageBytes) !== record.storageBytes) {
      throw new StudioBg3dShotBatchRecoveryError(
        "corrupt",
        "corrupt.artifactMetadataLedger",
      );
    }
    throwIfAborted(signal);
    let verified: StudioBg3dVerifiedShotBatchShotArtifacts;
    try {
      verified = await awaitWithAbort(
        reverifyStudioBg3dShotBatchShotArtifacts(
          plan,
          record.shotId,
          record.artifacts,
          signal,
        ),
        signal,
      );
    } catch (cause) {
      if (isAbortError(cause)) throw cause;
      throw new StudioBg3dShotBatchRecoveryError(
        "corrupt",
        "corrupt.artifactIntegrityFailed",
        { cause },
      );
    }
    throwIfAborted(signal);
    records.push({ ...record, artifacts: verified });
  }
  const bytes = records.reduce((total, record) => total + record.artifacts.totalBytes, 0);
  const count = records.reduce((total, record) => total + record.artifacts.artifactCount, 0);
  const storageBytes = records.reduce((total, record) => total + record.storageBytes, 0);
  if (bytes !== job.totalArtifactBytes || count !== job.artifactCount ||
    storageBytes !== job.artifactStorageBytes) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.artifactUsageLedger");
  }
  const succeededIds = new Set(job.queue.items
    .filter(({ status }) => status === "succeeded")
    .map(({ shotId }) => shotId));
  if (records.length !== succeededIds.size || records.some(({ shotId }) => !succeededIds.has(shotId))) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.completedShotArtifactMismatch");
  }
  throwIfAborted(signal);
  return records;
}

export function applyRecoverySession(
  target: StudioBg3dShotBatchRecoverySession,
  source: StudioBg3dShotBatchRecoverySession,
): void {
  target.mode = source.mode;
  target.persistence = source.persistence;
  target.degradedReason = source.degradedReason;
  target.queue = source.queue;
  target.revision = source.revision;
  target.fence = source.fence;
  target.leaseToken = source.leaseToken;
  target.totalArtifactBytes = source.totalArtifactBytes;
  target.artifactCount = source.artifactCount;
  target.jobStorageBytes = source.jobStorageBytes;
  target.artifactStorageBytes = source.artifactStorageBytes;
  target.activeRun = source.activeRun;
  target.images = [...source.images];
  target.skippedArtifacts = [...source.skippedArtifacts];
  target.layeredPsds = [...source.layeredPsds];
  target.psdFallbacks = [...source.psdFallbacks];
  target.shotArtifacts = new Map(source.shotArtifacts);
  target.released = source.released;
}

export async function storagePersistence(
  manager: Pick<StorageManager, "persist"> | null,
): Promise<StudioBg3dShotBatchRecoveryPersistence> {
  if (!manager || typeof manager.persist !== "function") return "unknown";
  try {
    return await manager.persist() ? "granted" : "not-granted";
  } catch {
    return "unknown";
  }
}
