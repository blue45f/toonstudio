/**
 * Canonical SQLite/OPFS catalog serialization, CAS blob persistence/hydration,
 * and cross-tab Web Locks helper for Studio 3D shot-batch recovery.
 */

import { createStudioOpfsAssetStore } from "../studio-opfs-asset-store";
import { createStudioOpfsNativeFileSystem } from "../studio-opfs-filesystem";
import { compareStudioValidationStrings } from "../studio-validation-string-order";

import {
  STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES,
  type StudioBg3dShotBatchImage,
  type StudioBg3dShotBatchLayeredPsd,
  type StudioBg3dShotBatchPsdFallback,
  type StudioBg3dShotBatchSkippedArtifact,
} from "./studio-bg3d-shot-batch";
import { type StudioBg3dVerifiedShotBatchShotArtifacts } from "./studio-bg3d-shot-batch-artifact-integrity";
import { type StudioBg3dShotBatchPlan } from "./studio-bg3d-shot-batch-plan";
import { StudioBg3dShotBatchRecoveryError } from "./studio-bg3d-shot-batch-recovery-error";
import {
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_ARTIFACT_STORAGE_BYTES,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS,
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES,
  artifactKey,
  exactKeys,
  throwIfAborted,
  type ArtifactRecord,
  type JobRecord,
  type LeaseRecord,
  type StudioBg3dShotBatchRecoveryRunExclusive,
} from "./studio-bg3d-shot-batch-recovery-types";
import {
  isGcJobRecord,
  isGcLeaseRecord,
  verifyArtifactRecords,
} from "./studio-bg3d-shot-batch-recovery-validation";

import type { StudioOpfsAssetStore } from "../studio-opfs-asset-store";
import type { StudioOpfsStorageManagerLike } from "../studio-opfs-filesystem";

export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_SQLITE_CATALOG_KEY = "catalog-v1";
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_SQLITE_LOCK_NAME =
  "toonspectrum:studio:bg3d-shot-batch-recovery:v12";
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_CAS_OWNER_PREFIX =
  "studio-bg3d-shot-batch-recovery-v12:";

export interface SqliteRecoveryBlobRef {
  readonly hash: `sha256:${string}`;
  readonly byteSize: number;
  readonly mime: string;
}

export type PutVerifiedCasBlob = (
  store: StudioOpfsAssetStore,
  blob: Blob,
  receipt: SqliteRecoveryArtifacts["blobs"][number],
  signal?: AbortSignal,
) => Promise<SqliteRecoveryBlobRef>;

interface SqliteRecoveryImage extends Omit<StudioBg3dShotBatchImage, "png"> {
  readonly pngRef: SqliteRecoveryBlobRef;
}

interface SqliteRecoveryLayeredPsd extends Omit<StudioBg3dShotBatchLayeredPsd, "psd"> {
  readonly psdRef: SqliteRecoveryBlobRef;
}

interface SqliteRecoveryArtifacts {
  readonly images: readonly SqliteRecoveryImage[];
  readonly skippedArtifacts: readonly StudioBg3dShotBatchSkippedArtifact[];
  readonly layeredPsds: readonly SqliteRecoveryLayeredPsd[];
  readonly psdFallbacks: readonly StudioBg3dShotBatchPsdFallback[];
  readonly blobs: StudioBg3dVerifiedShotBatchShotArtifacts["blobs"];
  readonly totalBytes: number;
  readonly artifactCount: number;
}

export interface SqliteRecoveryArtifactRecord extends Omit<ArtifactRecord, "artifacts"> {
  readonly artifacts: SqliteRecoveryArtifacts;
}

export interface SqliteRecoveryCatalogEntry {
  readonly job: JobRecord;
  readonly lease: LeaseRecord | null;
  readonly artifacts: readonly SqliteRecoveryArtifactRecord[];
}

export interface SqliteRecoveryCatalog {
  readonly kind: "toonstudio-bg3d-shot-batch-recovery-catalog";
  readonly version: 1;
  readonly revision: number;
  readonly updatedAt: number;
  readonly entries: readonly SqliteRecoveryCatalogEntry[];
}

const SQLITE_CATALOG_KIND = "toonstudio-bg3d-shot-batch-recovery-catalog";
const SQLITE_CATALOG_VERSION = 1;
const SQLITE_HASH_PATTERN = /^sha256:([0-9a-f]{64})$/u;
const SQLITE_CAS_ROOT = "toonstudio-studio-assets";

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSqliteBlobRef(value: unknown): value is SqliteRecoveryBlobRef {
  if (!exactKeys(value, ["hash", "byteSize", "mime"])) return false;
  const ref = value as SqliteRecoveryBlobRef;
  return SQLITE_HASH_PATTERN.test(ref.hash) && Number.isSafeInteger(ref.byteSize) &&
    ref.byteSize > 0 && ref.byteSize <= STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES &&
    typeof ref.mime === "string" && ref.mime.length >= 1 && ref.mime.length <= 160;
}

function isVerifiedBlobReceipt(value: unknown): value is SqliteRecoveryArtifacts["blobs"][number] {
  if (!exactKeys(value, ["kind", "key", "sha256", "byteSize"])) return false;
  const blob = value as SqliteRecoveryArtifacts["blobs"][number];
  return (blob.kind === "png" || blob.kind === "psd") &&
    typeof blob.key === "string" && blob.key.length >= 1 && blob.key.length <= 512 &&
    /^[0-9a-f]{64}$/u.test(blob.sha256) && Number.isSafeInteger(blob.byteSize) &&
    blob.byteSize > 0 && blob.byteSize <= STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES;
}

function isSqliteRecoveryImage(value: unknown): value is SqliteRecoveryImage {
  if (!exactKeys(value, [
    "shotId", "shotName", "width", "height", "pass", "requestedHeight", "wasReduced",
    "pngRef",
  ])) return false;
  const image = value as SqliteRecoveryImage;
  return typeof image.shotId === "string" && typeof image.shotName === "string" &&
    typeof image.pass === "string" && Number.isSafeInteger(image.width) && image.width > 0 &&
    Number.isSafeInteger(image.height) && image.height > 0 &&
    typeof image.requestedHeight === "number" &&
    Number.isSafeInteger(image.requestedHeight) && image.requestedHeight > 0 &&
    typeof image.wasReduced === "boolean" && isSqliteBlobRef(image.pngRef);
}

function isSqliteRecoveryLayeredPsd(value: unknown): value is SqliteRecoveryLayeredPsd {
  if (!exactKeys(value, ["shotId", "shotName", "width", "height", "psdRef"])) return false;
  const psd = value as SqliteRecoveryLayeredPsd;
  return typeof psd.shotId === "string" && typeof psd.shotName === "string" &&
    Number.isSafeInteger(psd.width) && psd.width > 0 &&
    Number.isSafeInteger(psd.height) && psd.height > 0 && isSqliteBlobRef(psd.psdRef);
}

function isPlainArtifactMetadata(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return exactKeys(value, keys) && typeof value === "object" && value !== null;
}

function isSqliteRecoveryArtifacts(value: unknown): value is SqliteRecoveryArtifacts {
  if (!exactKeys(value, [
    "images", "skippedArtifacts", "layeredPsds", "psdFallbacks", "blobs", "totalBytes",
    "artifactCount",
  ])) return false;
  const artifacts = value as SqliteRecoveryArtifacts;
  if (!Array.isArray(artifacts.images) || !artifacts.images.every(isSqliteRecoveryImage) ||
    !Array.isArray(artifacts.layeredPsds) ||
    !artifacts.layeredPsds.every(isSqliteRecoveryLayeredPsd) ||
    !Array.isArray(artifacts.skippedArtifacts) ||
    !artifacts.skippedArtifacts.every((item) =>
      isPlainArtifactMetadata(item, ["shotId", "shotName", "pass", "reason"])) ||
    !Array.isArray(artifacts.psdFallbacks) ||
    !artifacts.psdFallbacks.every((item) =>
      isPlainArtifactMetadata(item, ["shotId", "shotName", "reason"])) ||
    !Array.isArray(artifacts.blobs) || !artifacts.blobs.every(isVerifiedBlobReceipt) ||
    !isSafeNonNegativeInteger(artifacts.totalBytes) ||
    artifacts.totalBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES ||
    !isSafeNonNegativeInteger(artifacts.artifactCount)) return false;
  const refs = [
    ...artifacts.images.map(({ pngRef }) => pngRef),
    ...artifacts.layeredPsds.map(({ psdRef }) => psdRef),
  ];
  const receiptKeys = new Set<string>();
  if (artifacts.blobs.some((blob) => receiptKeys.size === receiptKeys.add(blob.key).size)) {
    return false;
  }
  const receiptByHash = new Map(artifacts.blobs.map((blob) => [
    `sha256:${blob.sha256}`,
    blob,
  ]));
  if (refs.length !== artifacts.blobs.length || refs.some((ref) => {
    const receipt = receiptByHash.get(ref.hash);
    return !receipt || receipt.byteSize !== ref.byteSize;
  })) return false;
  const totalBytes = artifacts.blobs.reduce((total, blob) => total + blob.byteSize, 0);
  const artifactCount = artifacts.images.length + artifacts.skippedArtifacts.length +
    artifacts.layeredPsds.length + artifacts.psdFallbacks.length;
  return totalBytes === artifacts.totalBytes && artifactCount === artifacts.artifactCount;
}

function isSqliteRecoveryArtifactRecord(value: unknown): value is SqliteRecoveryArtifactRecord {
  if (!exactKeys(value, [
    "kind", "version", "artifactKey", "recoveryKey", "shotId", "artifacts", "storageBytes",
    "createdAt",
  ])) return false;
  const record = value as SqliteRecoveryArtifactRecord;
  return record.kind === "toonstudio-bg3d-shot-batch-shot-artifacts" && record.version === 1 &&
    typeof record.artifactKey === "string" && typeof record.recoveryKey === "string" &&
    typeof record.shotId === "string" &&
    record.artifactKey === artifactKey(record.recoveryKey, record.shotId) &&
    Number.isSafeInteger(record.storageBytes) && record.storageBytes > 0 &&
    record.storageBytes <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_ARTIFACT_STORAGE_BYTES &&
    isSafeNonNegativeInteger(record.createdAt) && isSqliteRecoveryArtifacts(record.artifacts);
}

export function isSqliteRecoveryCatalogEntry(value: unknown): value is SqliteRecoveryCatalogEntry {
  if (!exactKeys(value, ["job", "lease", "artifacts"])) return false;
  const entry = value as SqliteRecoveryCatalogEntry;
  if (!isGcJobRecord(entry.job) ||
    (entry.lease !== null && !isGcLeaseRecord(entry.lease)) ||
    !Array.isArray(entry.artifacts) || !entry.artifacts.every(isSqliteRecoveryArtifactRecord)) {
    return false;
  }
  if (entry.lease !== null && entry.lease.recoveryKey !== entry.job.recoveryKey) return false;
  const seenKeys = new Set<string>();
  const seenShots = new Set<string>();
  for (const artifact of entry.artifacts) {
    if (artifact.recoveryKey !== entry.job.recoveryKey || seenKeys.has(artifact.artifactKey) ||
      seenShots.has(artifact.shotId)) return false;
    seenKeys.add(artifact.artifactKey);
    seenShots.add(artifact.shotId);
  }
  if (entry.job.artifactKeys.length !== entry.artifacts.length ||
    entry.job.artifactKeys.some((key, index) => key !== entry.artifacts[index]?.artifactKey)) {
    return false;
  }
  const artifactBytes = entry.artifacts.reduce(
    (total, artifact) => total + artifact.artifacts.totalBytes,
    0,
  );
  const artifactCount = entry.artifacts.reduce(
    (total, artifact) => total + artifact.artifacts.artifactCount,
    0,
  );
  const structuredBytes = entry.artifacts.reduce(
    (total, artifact) => total + artifact.storageBytes,
    0,
  );
  return artifactBytes === entry.job.totalArtifactBytes &&
    artifactCount === entry.job.artifactCount &&
    structuredBytes === entry.job.artifactStorageBytes;
}

export function canonicalJobRecord(job: JobRecord): JobRecord {
  return {
    kind: job.kind,
    version: job.version,
    recoveryKey: job.recoveryKey,
    plan: job.plan,
    sourceRevision: job.sourceRevision,
    queue: job.queue,
    revision: job.revision,
    activeRun: job.activeRun,
    artifactKeys: [...job.artifactKeys],
    totalArtifactBytes: job.totalArtifactBytes,
    artifactCount: job.artifactCount,
    jobStorageBytes: job.jobStorageBytes,
    artifactStorageBytes: job.artifactStorageBytes,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    expiresAt: job.expiresAt,
    downloadRequestedAt: job.downloadRequestedAt,
  };
}

export function canonicalLeaseRecord(lease: LeaseRecord | null): LeaseRecord | null {
  if (!lease) return null;
  return {
    kind: lease.kind,
    version: lease.version,
    recoveryKey: lease.recoveryKey,
    ownerId: lease.ownerId,
    leaseToken: lease.leaseToken,
    fence: lease.fence,
    acquiredAt: lease.acquiredAt,
    heartbeatAt: lease.heartbeatAt,
    expiresAt: lease.expiresAt,
  };
}

function canonicalSqliteArtifacts(artifacts: SqliteRecoveryArtifacts): SqliteRecoveryArtifacts {
  return {
    images: artifacts.images.map((image) => ({
      shotId: image.shotId,
      shotName: image.shotName,
      width: image.width,
      height: image.height,
      pass: image.pass,
      requestedHeight: image.requestedHeight,
      wasReduced: image.wasReduced,
      pngRef: { ...image.pngRef },
    })),
    skippedArtifacts: artifacts.skippedArtifacts.map((item) => ({ ...item })),
    layeredPsds: artifacts.layeredPsds.map((item) => ({
      shotId: item.shotId,
      shotName: item.shotName,
      width: item.width,
      height: item.height,
      psdRef: { ...item.psdRef },
    })),
    psdFallbacks: artifacts.psdFallbacks.map((item) => ({ ...item })),
    blobs: artifacts.blobs.map((blob) => ({ ...blob })),
    totalBytes: artifacts.totalBytes,
    artifactCount: artifacts.artifactCount,
  };
}

function canonicalSqliteCatalog(catalog: SqliteRecoveryCatalog): SqliteRecoveryCatalog {
  return {
    kind: SQLITE_CATALOG_KIND,
    version: SQLITE_CATALOG_VERSION,
    revision: catalog.revision,
    updatedAt: catalog.updatedAt,
    entries: [...catalog.entries]
      .sort((left, right) => compareStudioValidationStrings(
        left.job.recoveryKey,
        right.job.recoveryKey,
      ))
      .map((entry) => ({
        job: canonicalJobRecord(entry.job),
        lease: canonicalLeaseRecord(entry.lease),
        artifacts: entry.artifacts.map((artifact) => ({
          kind: artifact.kind,
          version: artifact.version,
          artifactKey: artifact.artifactKey,
          recoveryKey: artifact.recoveryKey,
          shotId: artifact.shotId,
          artifacts: canonicalSqliteArtifacts(artifact.artifacts),
          storageBytes: artifact.storageBytes,
          createdAt: artifact.createdAt,
        })),
      })),
  };
}

export function serializeSqliteCatalog(catalog: SqliteRecoveryCatalog): string {
  return JSON.stringify(canonicalSqliteCatalog(catalog));
}

export function parseSqliteCatalog(raw: string | null): SqliteRecoveryCatalog {
  if (raw === null) {
    return {
      kind: SQLITE_CATALOG_KIND,
      version: SQLITE_CATALOG_VERSION,
      revision: 0,
      updatedAt: 0,
      entries: [],
    };
  }
  if (new TextEncoder().encode(raw).byteLength >
    STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.catalogOversized");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new StudioBg3dShotBatchRecoveryError(
      "corrupt",
      "corrupt.catalogJson",
      { cause },
    );
  }
  if (!exactKeys(parsed, ["kind", "version", "revision", "updatedAt", "entries"])) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.catalogFields");
  }
  const catalog = parsed as SqliteRecoveryCatalog;
  if (catalog.kind !== SQLITE_CATALOG_KIND || catalog.version !== SQLITE_CATALOG_VERSION ||
    !isSafeNonNegativeInteger(catalog.revision) || !isSafeNonNegativeInteger(catalog.updatedAt) ||
    !Array.isArray(catalog.entries) ||
    catalog.entries.length > STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS ||
    !catalog.entries.every(isSqliteRecoveryCatalogEntry)) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.catalogInvalid");
  }
  const keys = catalog.entries.map(({ job }) => job.recoveryKey);
  if (new Set(keys).size !== keys.length) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.catalogDuplicateJobKey");
  }
  const artifactBytes = catalog.entries.reduce(
    (total, entry) => total + entry.job.totalArtifactBytes,
    0,
  );
  const structuredBytes = catalog.entries.reduce(
    (total, entry) => total + entry.job.jobStorageBytes + entry.job.artifactStorageBytes,
    0,
  );
  if (artifactBytes + structuredBytes > STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES ||
    serializeSqliteCatalog(catalog) !== raw) {
    throw new StudioBg3dShotBatchRecoveryError(
      "corrupt",
      "corrupt.catalogLedgerOrSerialization",
    );
  }
  return catalog;
}

export function recoveryCasOwner(recoveryKey: string): string {
  return `${STUDIO_BG3D_SHOT_BATCH_RECOVERY_CAS_OWNER_PREFIX}${recoveryKey}`;
}

export function artifactHashes(artifacts: readonly SqliteRecoveryArtifactRecord[]): `sha256:${string}`[] {
  return [...new Set(artifacts.flatMap((artifact) => [
    ...artifact.artifacts.images.map(({ pngRef }) => pngRef.hash),
    ...artifact.artifacts.layeredPsds.map(({ psdRef }) => psdRef.hash),
  ]))].sort(compareStudioValidationStrings);
}

let sharedRecoveryAssetStore: Promise<StudioOpfsAssetStore> | null = null;

export function acquireProductRecoveryAssetStore(): Promise<StudioOpfsAssetStore> {
  sharedRecoveryAssetStore ??= Promise.resolve().then(() => {
    const storage = typeof navigator === "undefined" ? null : navigator.storage;
    if (!storage || typeof storage.getDirectory !== "function") {
      throw new StudioBg3dShotBatchRecoveryError(
        "storage-unavailable",
        "storageUnavailable.opfsUnavailable",
      );
    }
    return createStudioOpfsAssetStore({
      fs: createStudioOpfsNativeFileSystem(
        storage as unknown as StudioOpfsStorageManagerLike,
        SQLITE_CAS_ROOT,
      ),
      estimator: storage,
    });
  });
  return sharedRecoveryAssetStore;
}

interface BrowserLockManagerLike {
  request<T>(
    name: string,
    options: { readonly mode: "exclusive" },
    callback: () => Promise<T>,
  ): Promise<T>;
}

export function productRunExclusive(): StudioBg3dShotBatchRecoveryRunExclusive | null {
  const manager = typeof navigator === "undefined"
    ? null
    : (navigator as Navigator & { locks?: BrowserLockManagerLike }).locks;
  if (!manager || typeof manager.request !== "function") return null;
  return <T>(task: () => Promise<T>) => manager.request(
    STUDIO_BG3D_SHOT_BATCH_RECOVERY_SQLITE_LOCK_NAME,
    { mode: "exclusive" },
    task,
  );
}

export async function persistSqliteArtifactRecord(
  record: ArtifactRecord,
  store: StudioOpfsAssetStore,
  putBlob: PutVerifiedCasBlob,
  signal?: AbortSignal,
): Promise<SqliteRecoveryArtifactRecord> {
  const receipts = new Map(record.artifacts.blobs.map((blob) => [blob.key, blob]));
  const images: SqliteRecoveryImage[] = [];
  for (const image of record.artifacts.images) {
    const receipt = receipts.get(`${record.shotId}:${image.pass}`);
    if (!receipt || receipt.kind !== "png") {
      throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.pngReceiptMissing");
    }
    images.push({
      shotId: image.shotId,
      shotName: image.shotName,
      width: image.width,
      height: image.height,
      pass: image.pass,
      requestedHeight: image.requestedHeight,
      wasReduced: image.wasReduced,
      pngRef: await putBlob(store, image.png, receipt, signal),
    });
  }
  const layeredPsds: SqliteRecoveryLayeredPsd[] = [];
  for (const psd of record.artifacts.layeredPsds) {
    const receipt = receipts.get(`${record.shotId}:layered-psd`);
    if (!receipt || receipt.kind !== "psd") {
      throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.psdReceiptMissing");
    }
    layeredPsds.push({
      shotId: psd.shotId,
      shotName: psd.shotName,
      width: psd.width,
      height: psd.height,
      psdRef: await putBlob(store, psd.psd, receipt, signal),
    });
  }
  const persisted: SqliteRecoveryArtifactRecord = {
    kind: record.kind,
    version: record.version,
    artifactKey: record.artifactKey,
    recoveryKey: record.recoveryKey,
    shotId: record.shotId,
    artifacts: {
      images,
      skippedArtifacts: record.artifacts.skippedArtifacts.map((item) => ({ ...item })),
      layeredPsds,
      psdFallbacks: record.artifacts.psdFallbacks.map((item) => ({ ...item })),
      blobs: record.artifacts.blobs.map((blob) => ({ ...blob })),
      totalBytes: record.artifacts.totalBytes,
      artifactCount: record.artifacts.artifactCount,
    },
    storageBytes: record.storageBytes,
    createdAt: record.createdAt,
  };
  if (!isSqliteRecoveryArtifactRecord(persisted)) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.casEnvelopeFailed");
  }
  return persisted;
}

async function readVerifiedCasBlob(
  store: StudioOpfsAssetStore,
  ref: SqliteRecoveryBlobRef,
  receipt: SqliteRecoveryArtifacts["blobs"][number],
  signal?: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);
  if (ref.hash !== `sha256:${receipt.sha256}` || ref.byteSize !== receipt.byteSize) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.casReferenceMismatch");
  }
  let bytes: Uint8Array | null;
  try {
    bytes = await store.get(ref.hash, { verify: true });
  } catch (cause) {
    throw new StudioBg3dShotBatchRecoveryError(
      "corrupt",
      "corrupt.casVerificationFailed",
      { cause },
    );
  }
  throwIfAborted(signal);
  if (!bytes || bytes.byteLength !== ref.byteSize) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.casBytesMissing");
  }
  return new Blob([Uint8Array.from(bytes).buffer], { type: ref.mime });
}

export async function hydrateSqliteArtifactRecords(
  plan: StudioBg3dShotBatchPlan,
  job: JobRecord,
  persisted: readonly SqliteRecoveryArtifactRecord[],
  store: StudioOpfsAssetStore,
  signal?: AbortSignal,
): Promise<ArtifactRecord[]> {
  const rawRecords: ArtifactRecord[] = [];
  for (const record of persisted) {
    const receipts = new Map(record.artifacts.blobs.map((blob) => [blob.key, blob]));
    const images: StudioBg3dShotBatchImage[] = [];
    for (const image of record.artifacts.images) {
      const receipt = receipts.get(`${record.shotId}:${image.pass}`);
      if (!receipt || receipt.kind !== "png") {
        throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.storedPngReceiptMissing");
      }
      images.push({
        shotId: image.shotId,
        shotName: image.shotName,
        width: image.width,
        height: image.height,
        pass: image.pass,
        requestedHeight: image.requestedHeight,
        wasReduced: image.wasReduced,
        png: await readVerifiedCasBlob(store, image.pngRef, receipt, signal),
      });
    }
    const layeredPsds: StudioBg3dShotBatchLayeredPsd[] = [];
    for (const psd of record.artifacts.layeredPsds) {
      const receipt = receipts.get(`${record.shotId}:layered-psd`);
      if (!receipt || receipt.kind !== "psd") {
        throw new StudioBg3dShotBatchRecoveryError("corrupt", "corrupt.storedPsdReceiptMissing");
      }
      layeredPsds.push({
        shotId: psd.shotId,
        shotName: psd.shotName,
        width: psd.width,
        height: psd.height,
        psd: await readVerifiedCasBlob(store, psd.psdRef, receipt, signal),
      });
    }
    rawRecords.push({
      kind: record.kind,
      version: record.version,
      artifactKey: record.artifactKey,
      recoveryKey: record.recoveryKey,
      shotId: record.shotId,
      artifacts: {
        images,
        skippedArtifacts: record.artifacts.skippedArtifacts.map((item) => ({ ...item })),
        layeredPsds,
        psdFallbacks: record.artifacts.psdFallbacks.map((item) => ({ ...item })),
        blobs: record.artifacts.blobs.map((blob) => ({ ...blob })),
        totalBytes: record.artifacts.totalBytes,
        artifactCount: record.artifacts.artifactCount,
      },
      storageBytes: record.storageBytes,
      createdAt: record.createdAt,
    });
  }
  return verifyArtifactRecords(plan, job, rawRecords, signal);
}

export function pruneSqliteCatalog(
  catalog: SqliteRecoveryCatalog,
  now: number,
): { readonly catalog: SqliteRecoveryCatalog; readonly removed: readonly string[] } {
  const removed: string[] = [];
  const entries = catalog.entries.filter((entry) => {
    const expired = entry.job.expiresAt <= now &&
      (!entry.lease || entry.lease.expiresAt <= now);
    if (expired) removed.push(entry.job.recoveryKey);
    return !expired;
  });
  return {
    catalog: entries.length === catalog.entries.length
      ? catalog
      : { ...catalog, entries },
    removed,
  };
}

export function replaceSqliteCatalogEntry(
  catalog: SqliteRecoveryCatalog,
  recoveryKey: string,
  replacement: SqliteRecoveryCatalogEntry | null,
  now: number,
): SqliteRecoveryCatalog {
  const entries = catalog.entries.filter((entry) => entry.job.recoveryKey !== recoveryKey);
  if (replacement) entries.push(replacement);
  const next: SqliteRecoveryCatalog = {
    kind: SQLITE_CATALOG_KIND,
    version: SQLITE_CATALOG_VERSION,
    revision: catalog.revision + 1,
    updatedAt: now,
    entries,
  };
  return parseSqliteCatalog(serializeSqliteCatalog(next));
}
