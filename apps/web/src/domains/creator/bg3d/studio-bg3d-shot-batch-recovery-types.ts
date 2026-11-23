/**
 * Shared constants, record schemas, memory fallback state, abort helpers,
 * and storage-budget estimators for Studio 3D shot-batch recovery.
 */

import { compareStudioValidationStrings } from "../studio-validation-string-order";

import {
  type StudioBg3dShotBatchImage,
  type StudioBg3dShotBatchLayeredPsd,
  type StudioBg3dShotBatchPsdFallback,
  type StudioBg3dShotBatchSkippedArtifact,
} from "./studio-bg3d-shot-batch";
import {
  type StudioBg3dShotBatchShotArtifacts,
  type StudioBg3dVerifiedShotBatchShotArtifacts,
} from "./studio-bg3d-shot-batch-artifact-integrity";
import { type StudioBg3dShotBatchPlan } from "./studio-bg3d-shot-batch-plan";
import {
  StudioBg3dShotBatchRecoveryError,
  type StudioBg3dShotBatchRecoveryDegradedReason,
} from "./studio-bg3d-shot-batch-recovery-error";
import {
  type StudioBg3dShotBatchFailureCode,
  type StudioBg3dShotBatchQueue,
} from "./studio-bg3d-shot-batch-queue";

export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_DOWNLOAD_TTL_MS = 24 * 60 * 60 * 1_000;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS = 30_000;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_HEARTBEAT_MS = 10_000;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES = 512 * 1024 * 1024;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_RESERVE_BYTES = 64 * 1024 * 1024;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS = 64;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_AUTHORIZATION_RECEIPT_MAX_TTL_MS = 30_000;

export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOB_STORAGE_BYTES = 8 * 1024 * 1024;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_ARTIFACT_STORAGE_BYTES = 512 * 1024;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_SOURCE_BYTES = 320 * 1024;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_BASE_BYTES = 4 * 1024;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_SHOT_RESERVE_BYTES = 1_024;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_FILE_RESERVE_BYTES = 512;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_ARTIFACT_BASE_BYTES = 2 * 1024;

export const META_KEY = "usage:v1";
export const RECOVERY_KEY_PATTERN = /^bg3d-batch-v2-[0-9a-f]{64}$/u;
export const FAILURE_CODES = new Set<StudioBg3dShotBatchFailureCode>([
  "scene-restore-failed",
  "view-timeout",
  "capture-failed",
  "raster-failed",
  "encode-failed",
  "artifact-budget-exceeded",
  "visibility-interrupted",
  "unknown",
]);

export type StudioBg3dShotBatchRecoveryMode = "durable" | "memory";
export type StudioBg3dShotBatchRecoveryPersistence = "granted" | "not-granted" | "unknown";

export interface StudioBg3dShotBatchRunToken {
  readonly shotId: string;
  readonly runId: string;
  readonly fence: number;
  readonly revision: number;
}

export interface StudioBg3dShotBatchRecoveryAcquireOptions {
  readonly signal?: AbortSignal;
}

export interface StudioBg3dShotBatchRecoveryCommitOptions {
  readonly signal?: AbortSignal;
  readonly authorizeBeforeCommit?: (
    signal: AbortSignal | undefined,
  ) => StudioBg3dShotBatchRecoveryAuthorizationReceipt | null |
    Promise<StudioBg3dShotBatchRecoveryAuthorizationReceipt | null>;
}

export interface StudioBg3dShotBatchRecoveryAuthorizationReceipt {
  readonly authorizedAt: number;
  readonly expiresAt: number;
  readonly isLocallyCurrent: () => boolean;
}

export interface ActiveRun {
  readonly shotId: string;
  readonly runId: string;
  readonly fence: number;
}

export interface StudioBg3dShotBatchRecoverySession {
  readonly plan: StudioBg3dShotBatchPlan;
  readonly sourceRevision: string;
  readonly ownerId: string;
  mode: StudioBg3dShotBatchRecoveryMode;
  persistence: StudioBg3dShotBatchRecoveryPersistence;
  degradedReason: StudioBg3dShotBatchRecoveryDegradedReason | null;
  queue: StudioBg3dShotBatchQueue;
  revision: number;
  fence: number;
  leaseToken: string;
  totalArtifactBytes: number;
  artifactCount: number;
  jobStorageBytes: number;
  artifactStorageBytes: number;
  activeRun: ActiveRun | null;
  images: StudioBg3dShotBatchImage[];
  skippedArtifacts: StudioBg3dShotBatchSkippedArtifact[];
  layeredPsds: StudioBg3dShotBatchLayeredPsd[];
  psdFallbacks: StudioBg3dShotBatchPsdFallback[];
  shotArtifacts: Map<string, StudioBg3dVerifiedShotBatchShotArtifacts>;
  released: boolean;
}

export interface JobRecord {
  readonly kind: "toonstudio-bg3d-shot-batch-job";
  readonly version: 1;
  readonly recoveryKey: string;
  readonly plan: StudioBg3dShotBatchPlan;
  readonly sourceRevision: string;
  readonly queue: StudioBg3dShotBatchQueue;
  readonly revision: number;
  readonly activeRun: ActiveRun | null;
  readonly artifactKeys: readonly string[];
  readonly totalArtifactBytes: number;
  readonly artifactCount: number;
  readonly jobStorageBytes: number;
  readonly artifactStorageBytes: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly expiresAt: number;
  readonly downloadRequestedAt: number | null;
}

export interface ArtifactRecord {
  readonly kind: "toonstudio-bg3d-shot-batch-shot-artifacts";
  readonly version: 1;
  readonly artifactKey: string;
  readonly recoveryKey: string;
  readonly shotId: string;
  readonly artifacts: StudioBg3dVerifiedShotBatchShotArtifacts;
  readonly storageBytes: number;
  readonly createdAt: number;
}

export interface LeaseRecord {
  readonly kind: "toonstudio-bg3d-shot-batch-lease";
  readonly version: 1;
  readonly recoveryKey: string;
  readonly ownerId: string;
  readonly leaseToken: string;
  readonly fence: number;
  readonly acquiredAt: number;
  readonly heartbeatAt: number;
  readonly expiresAt: number;
}

export interface UsageRecord {
  readonly kind: "toonstudio-bg3d-shot-batch-usage";
  readonly version: 1;
  readonly key: typeof META_KEY;
  readonly revision: number;
  readonly artifactBytes: number;
  readonly artifactCount: number;
  readonly structuredBytes: number;
  readonly jobCount: number;
  readonly updatedAt: number;
}

export interface MemoryRecord {
  job: JobRecord;
  lease: LeaseRecord | null;
  readonly artifacts: Map<string, ArtifactRecord>;
}

export type StudioBg3dShotBatchRecoveryRunExclusive = <T>(
  task: () => Promise<T>,
) => Promise<T>;

/** Public recovery contract shared by the V12 SQLite authority and explicit legacy seam. */
export interface StudioBg3dShotBatchRecoveryStore {
  acquire(
    plan: StudioBg3dShotBatchPlan,
    sourceRevision: string,
    options?: StudioBg3dShotBatchRecoveryAcquireOptions,
  ): Promise<StudioBg3dShotBatchRecoverySession>;
  startShot(
    session: StudioBg3dShotBatchRecoverySession,
    shotId: string,
  ): Promise<StudioBg3dShotBatchRunToken>;
  completeShot(
    session: StudioBg3dShotBatchRecoverySession,
    token: StudioBg3dShotBatchRunToken,
    artifacts: StudioBg3dShotBatchShotArtifacts,
    options?: StudioBg3dShotBatchRecoveryCommitOptions,
  ): Promise<void>;
  failShot(
    session: StudioBg3dShotBatchRecoverySession,
    token: StudioBg3dShotBatchRunToken,
    failureCode: StudioBg3dShotBatchFailureCode,
  ): Promise<void>;
  resetInterrupted(session: StudioBg3dShotBatchRecoverySession): Promise<void>;
  markDownloadRequested(session: StudioBg3dShotBatchRecoverySession): Promise<void>;
  release(session: StudioBg3dShotBatchRecoverySession): Promise<void>;
  discard(session: StudioBg3dShotBatchRecoverySession): Promise<void>;
}

export const memoryRecords = new Map<string, MemoryRecord>();

export function purgeExpiredMemoryRecords(now: number): void {
  for (const [key, record] of memoryRecords) {
    if (record.job.expiresAt <= now && (!record.lease || record.lease.expiresAt <= now)) {
      memoryRecords.delete(key);
    }
  }
}

export function memoryStorageBytesExcluding(recoveryKey: string): number {
  let total = 0;
  for (const [key, record] of memoryRecords) {
    if (key !== recoveryKey) {
      total += record.job.totalArtifactBytes + record.job.jobStorageBytes +
        record.job.artifactStorageBytes;
    }
  }
  return total;
}

export function memoryJobCountExcluding(recoveryKey: string): number {
  let count = 0;
  for (const key of memoryRecords.keys()) {
    if (key !== recoveryKey) count += 1;
  }
  return count;
}

export function randomId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) {
    throw new StudioBg3dShotBatchRecoveryError(
      "storage-unavailable",
      "storageUnavailable.randomUnavailable",
    );
  }
  try {
    if (typeof cryptoApi.randomUUID === "function") {
      const uuid = cryptoApi.randomUUID();
      if (uuid) return `${prefix}-${uuid}`;
    }
    if (typeof cryptoApi.getRandomValues !== "function") {
      throw new TypeError("Web Crypto getRandomValues is unavailable");
    }
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${prefix}-${token}`;
  } catch (cause) {
    throw new StudioBg3dShotBatchRecoveryError(
      "storage-unavailable",
      "storageUnavailable.randomUnavailable",
      { cause },
    );
  }
}

export function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(compareStudioValidationStrings);
  const expected = [...keys].sort(compareStudioValidationStrings);
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

export function recoveryAbortError(): DOMException {
  return new DOMException("컷 배치 복구 작업이 취소되었습니다.", "AbortError");
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw recoveryAbortError();
}

export function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(recoveryAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (cause: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(cause);
      },
    );
  });
}

export function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}

function jsonUtf8Bytes(value: unknown, replacer?: (key: string, value: unknown) => unknown): number | null {
  try {
    const encoded = JSON.stringify(value, replacer);
    if (typeof encoded !== "string") return null;
    return new TextEncoder().encode(encoded).byteLength;
  } catch {
    return null;
  }
}

export function estimateJobStorageBytes(
  plan: unknown,
  sourceRevision: string,
): number | null {
  if (new TextEncoder().encode(sourceRevision).byteLength >
    STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_SOURCE_BYTES) return null;
  if (typeof plan !== "object" || plan === null || Array.isArray(plan)) return null;
  const shots = (plan as Partial<StudioBg3dShotBatchPlan>).shots;
  const files = (plan as Partial<StudioBg3dShotBatchPlan>).files;
  if (!Array.isArray(shots) || !Array.isArray(files)) return null;
  const planBytes = jsonUtf8Bytes(plan);
  const sourceBytes = new TextEncoder().encode(sourceRevision).byteLength;
  if (planBytes === null) return null;
  const estimated = STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_BASE_BYTES +
    (planBytes + sourceBytes) * 2 +
    shots.length * STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_SHOT_RESERVE_BYTES +
    files.length * STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_FILE_RESERVE_BYTES;
  return Number.isSafeInteger(estimated) && estimated >= 1 &&
    estimated <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOB_STORAGE_BYTES
    ? estimated
    : null;
}

type ArtifactRecordWithoutStorageBytes = Omit<ArtifactRecord, "storageBytes">;

export function estimateArtifactStorageBytes(record: ArtifactRecordWithoutStorageBytes): number | null {
  const metadataBytes = jsonUtf8Bytes(record, (_key, value) => value instanceof Blob
    ? { kind: "blob", type: value.type }
    : value);
  if (metadataBytes === null) return null;
  const estimated = STUDIO_BG3D_SHOT_BATCH_RECOVERY_ARTIFACT_BASE_BYTES + metadataBytes * 2;
  return Number.isSafeInteger(estimated) && estimated >= 1 &&
    estimated <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_ARTIFACT_STORAGE_BYTES
    ? estimated
    : null;
}

export function withArtifactStorageBytes(record: ArtifactRecordWithoutStorageBytes): ArtifactRecord {
  const storageBytes = estimateArtifactStorageBytes(record);
  if (storageBytes === null) {
    throw new StudioBg3dShotBatchRecoveryError(
      "budget-exceeded",
      "budgetExceeded.artifactMetadata",
    );
  }
  return { ...record, storageBytes };
}

export function artifactKey(recoveryKey: string, shotId: string): string {
  return `${recoveryKey}|${shotId}`;
}
