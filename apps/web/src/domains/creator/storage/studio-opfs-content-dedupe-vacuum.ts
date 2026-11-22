/**
 * 장기 연재용 OPFS 콘텐츠 주소 지정(CAS) 중복 제거 압축기(Storage Vacuum) & 다중 탭 잠금 자가치유.
 *
 * - SHA-256 콘텐츠 해시 기반 중복 텍스처·브러시 스탬프·스냅샷 감지 및 참조 카운트 GC.
 * - 쓰기 직후 0손실 무결성 검증(길이·SHA-256·바이트 일치) 후 원자적 교체, 중단·오류 시 고아 청크 롤백.
 * - Web Locks(`navigator.locks`) 우선 + `BroadcastChannel` 협상 리스 폴백으로 다중 탭 동시 실행 차단(₩0 로컬).
 */

import { StudioOpfsError, isValidStudioOpfsPath, type StudioOpfsFileSystem } from "../studio-opfs-filesystem";
import { sha256HexPortable } from "../studio-sha256";
import { formatStorageBytes, normalizeOpfsRelativePath } from "./studio-opfs-quota-cleanup";

export const STUDIO_OPFS_CAS_POINTER_SCHEMA = "toonstudio.opfs.cas-pointer.v1" as const;
export const STUDIO_OPFS_CAS_INDEX_SCHEMA = "toonstudio.opfs.cas-index.v1" as const;
export const STUDIO_OPFS_VACUUM_LOCK_CHANNEL = "toonstudio:opfs-vacuum-lock:v1" as const;

const STAGING_SCHEMA = "toonstudio.opfs.cas-staging.v1" as const;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/u;
const MAX_POINTER_BYTES = 1024;
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true });
const EXCLUDED_SUFFIXES = [
  ".tmp", ".temp", ".part", ".partial", ".crswap", ".staging", ".bak.tmp", ".orphaned", ".wal-tmp",
  ".sqlite", ".sqlite3", ".db", ".db-wal", ".db-shm", ".db-journal",
] as const;
const EXCLUDED_DIRS = ["cas/", "tmp/", "temp/", ".tmp/", "staging/", "orphans/"] as const;
const BRUSH_STAMP_RE = /(?:^|\/)(?:brush|brushes|stamp|stamps|brush-tips|tips)(?:\/|$)|(?:brush|stamp|tip)[._-]/iu;
const SNAPSHOT_RE = /(?:^|\/)(?:snapshots?|checkpoints?|timemachine)(?:\/|$)|(?:snapshot|snap|checkpoint)[._-]/iu;
const TEXTURE_RE = /(?:^|\/)(?:textures?|backgrounds?|bg|cuts?|panels?|tiles?|layers?|tones?|papers?)(?:\/|$)|\.(?:png|webp|jpe?g|bmp|rgba|tex|ktx2|svg)$/iu;

export type StudioOpfsDedupableAssetKind = "texture" | "brush-stamp" | "snapshot" | "other";
export type StudioOpfsVacuumLockMechanism = "web-locks" | "broadcast-channel" | "single-tab-fallback";
export type StudioOpfsVacuumExecutionStatus = "completed" | "noop" | "locked-conflict" | "rolled-back";

export interface StudioOpfsCasPointerRecord {
  readonly schema: typeof STUDIO_OPFS_CAS_POINTER_SCHEMA;
  readonly sha256: string;
  readonly byteLength: number;
  readonly assetKind: StudioOpfsDedupableAssetKind;
  readonly blobPath: string;
}
export interface StudioOpfsCasBlobIndexEntry {
  readonly sha256: string;
  readonly blobPath: string;
  readonly byteLength: number;
  readonly assetKind: StudioOpfsDedupableAssetKind;
  readonly refCount: number;
  readonly refPaths: readonly string[];
  readonly verifiedAtMs: number;
}
export interface StudioOpfsCasIndex {
  readonly schema: typeof STUDIO_OPFS_CAS_INDEX_SCHEMA;
  readonly projectId: string;
  readonly updatedAtMs: number;
  readonly generation: number;
  readonly blobs: Readonly<Record<string, StudioOpfsCasBlobIndexEntry>>;
}
export interface StudioOpfsVacuumDuplicateGroup {
  readonly sha256: string;
  readonly assetKind: StudioOpfsDedupableAssetKind;
  readonly blobPath: string;
  readonly blobAlreadyExists: boolean;
  readonly rawByteLength: number;
  readonly rawPaths: readonly string[];
  readonly existingPointerPaths: readonly string[];
  readonly totalRefCountAfter: number;
  readonly reclaimableBytes: number;
}
export interface StudioOpfsVacuumOrphanBlob {
  readonly sha256: string;
  readonly blobPath: string;
  readonly byteLength: number;
  readonly reasonKo: string;
}
export interface StudioOpfsVacuumPlan {
  readonly projectId: string;
  readonly evaluatedAtMs: number;
  readonly casPrefix: string;
  readonly indexPath: string;
  readonly scannedFileCount: number;
  readonly trackedPointerCount: number;
  readonly totalOpfsBytesBefore: number;
  readonly estimatedOpfsBytesAfter: number;
  readonly duplicateGroups: readonly StudioOpfsVacuumDuplicateGroup[];
  readonly duplicateFileCount: number;
  readonly gcOrphanBlobs: readonly StudioOpfsVacuumOrphanBlob[];
  readonly staleStagingPaths: readonly string[];
  readonly reclaimableBytes: number;
  readonly estimatedSavingsRatio: number;
  readonly hasActionableWork: boolean;
  readonly summaryKo: string;
}
export interface StudioOpfsVacuumRollbackReport {
  readonly performed: boolean;
  readonly removedOrphanBlobPaths: readonly string[];
  readonly restoredSourcePaths: readonly string[];
  readonly preservedLiveBlobPaths: readonly string[];
  readonly stagingCleaned: boolean;
  readonly rollbackErrors: readonly string[];
}
export interface StudioOpfsVacuumExecutionResult {
  readonly status: StudioOpfsVacuumExecutionStatus;
  readonly projectId: string;
  readonly executedAtMs: number;
  readonly lockMechanism: StudioOpfsVacuumLockMechanism;
  readonly lockHolderId: string | null;
  readonly deduplicatedFileCount: number;
  readonly writtenBlobCount: number;
  readonly gcRemovedBlobCount: number;
  readonly totalOpfsBytesBefore: number;
  readonly totalOpfsBytesAfter: number;
  readonly reclaimedBytes: number;
  readonly savedRatio: number;
  readonly verifiedPointerCount: number;
  readonly rollback: StudioOpfsVacuumRollbackReport;
  readonly errorMessage: string | null;
  readonly summaryKo: string;
}
export interface StudioWebLockManagerLike {
  request<T>(
    name: string,
    options: { readonly mode?: "exclusive" | "shared"; readonly ifAvailable?: boolean },
    callback: (lock: { readonly name: string; readonly mode?: "exclusive" | "shared" } | null) => Promise<T> | T,
  ): Promise<T>;
}
export interface StudioBroadcastChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { readonly data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { readonly data: unknown }) => void): void;
  close(): void;
}
export interface StudioOpfsVacuumLockOptions {
  readonly tabId?: string;
  readonly lockManager?: StudioWebLockManagerLike | null;
  readonly createBroadcastChannel?: ((name: string) => StudioBroadcastChannelLike) | null;
  readonly negotiationWindowMs?: number;
  readonly leaseTtlMs?: number;
  readonly now?: () => number;
}
export interface StudioOpfsVacuumLockAcquireResult<T> {
  readonly acquired: boolean;
  readonly mechanism: StudioOpfsVacuumLockMechanism;
  readonly lockName: string;
  readonly holderId: string | null;
  readonly value: T | null;
  readonly reasonKo: string;
}
export interface StudioOpfsVacuumPlanOptions {
  readonly fs: StudioOpfsFileSystem;
  readonly projectId: string;
  readonly excludePaths?: ReadonlySet<string> | readonly string[];
  readonly excludePrefixes?: readonly string[];
  readonly now?: () => number;
}
export interface StudioOpfsVacuumExecuteOptions extends StudioOpfsVacuumPlanOptions {
  readonly signal?: AbortSignal;
  readonly lockOptions?: StudioOpfsVacuumLockOptions;
  readonly onStage?: (stage: "after-blob-staged" | "after-pointer-written", path: string) => void;
}

type BroadcastLockMsg =
  | { readonly type: "probe"; readonly lockName: string; readonly requesterId: string; readonly sentAtMs: number }
  | { readonly type: "busy"; readonly lockName: string; readonly holderId: string; readonly expiresAtMs: number }
  | { readonly type: "claim"; readonly lockName: string; readonly holderId: string; readonly sentAtMs: number; readonly expiresAtMs: number }
  | { readonly type: "release"; readonly lockName: string; readonly holderId: string };

interface InternalScanState {
  readonly layout: ReturnType<typeof buildCasLayout>;
  readonly plan: StudioOpfsVacuumPlan;
  readonly rawBytesByPath: ReadonlyMap<string, Uint8Array>;
  readonly livePointerByPath: ReadonlyMap<string, StudioOpfsCasPointerRecord>;
  readonly previousIndex: StudioOpfsCasIndex | null;
  readonly previousIndexBytes: Uint8Array | null;
}

const EMPTY_ROLLBACK: StudioOpfsVacuumRollbackReport = Object.freeze({
  performed: false, removedOrphanBlobPaths: [], restoredSourcePaths: [], preservedLiveBlobPaths: [], stagingCleaned: true, rollbackErrors: [],
});
const activeSingleTabLocks = new Set<string>();
let idCounter = 0;

const nextToken = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isAssetKind = (v: unknown): v is StudioOpfsDedupableAssetKind => v === "texture" || v === "brush-stamp" || v === "snapshot" || v === "other";
const isNonNegInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const toErrMsg = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));
const toJsonBytes = (value: unknown): Uint8Array => ENCODER.encode(JSON.stringify(value));

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let i = 0; i < left.byteLength; i += 1) if (left[i] !== right[i]) return false;
  return true;
}
function toSafeProjectSlug(projectId: string): string {
  const cleaned = projectId.toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^[^a-z0-9]+/u, "").replace(/-+$/u, "").slice(0, 24);
  return `${cleaned || "proj"}-${sha256HexPortable(ENCODER.encode(projectId)).slice(0, 10)}`;
}
function buildCasLayout(projectId: string) {
  const slug = toSafeProjectSlug(projectId);
  return {
    casPrefix: `cas/${slug}/`, blobsPrefix: `cas/${slug}/blobs/`, indexPath: `cas/${slug}/index.json`,
    blobPath: (sha256: string) => `cas/${slug}/blobs/${sha256}.bin`,
    stagingPath: (txId: string) => `cas/${slug}/tx-${txId}.staging`,
  };
}
function isExcludedFromVacuum(path: string, excludePaths: ReadonlySet<string>, excludePrefixes: readonly string[]): boolean {
  if (!isValidStudioOpfsPath(path) || excludePaths.has(path) || excludePrefixes.some((p) => path.startsWith(p))) return true;
  const lower = path.toLowerCase();
  return EXCLUDED_DIRS.some((d) => lower.startsWith(d) || lower.includes(`/${d}`)) || EXCLUDED_SUFFIXES.some((s) => lower.endsWith(s));
}
export const computeOpfsContentSha256 = (bytes: Uint8Array): string => sha256HexPortable(bytes);
export function classifyOpfsAssetKind(path: string): StudioOpfsDedupableAssetKind {
  if (BRUSH_STAMP_RE.test(path)) return "brush-stamp";
  if (SNAPSHOT_RE.test(path)) return "snapshot";
  return TEXTURE_RE.test(path) ? "texture" : "other";
}

export function parseOpfsCasPointer(bytes: Uint8Array): StudioOpfsCasPointerRecord | null {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_POINTER_BYTES || bytes[0] !== 0x7b) return null;
  try {
    const p: unknown = JSON.parse(DECODER.decode(bytes));
    if (!isRecord(p)) return null;
    const { schema, sha256, byteLength, assetKind, blobPath } = p;
    if (
      schema !== STUDIO_OPFS_CAS_POINTER_SCHEMA || typeof sha256 !== "string" || !SHA256_HEX_RE.test(sha256)
      || !isNonNegInt(byteLength) || !isAssetKind(assetKind)
      || typeof blobPath !== "string" || !blobPath.startsWith("cas/") || !isValidStudioOpfsPath(blobPath)
    ) return null;
    return { schema, sha256, byteLength, assetKind, blobPath };
  } catch {
    return null;
  }
}

function parseCasIndex(bytes: Uint8Array | null): StudioOpfsCasIndex | null {
  if (!bytes || bytes.byteLength === 0) return null;
  try {
    const p: unknown = JSON.parse(DECODER.decode(bytes));
    if (!isRecord(p) || p.schema !== STUDIO_OPFS_CAS_INDEX_SCHEMA || typeof p.projectId !== "string" || typeof p.updatedAtMs !== "number" || typeof p.generation !== "number" || !isRecord(p.blobs)) return null;
    const blobs: Record<string, StudioOpfsCasBlobIndexEntry> = {};
    for (const [k, e] of Object.entries(p.blobs)) {
      if (!SHA256_HEX_RE.test(k) || !isRecord(e)) continue;
      if (e.sha256 === k && typeof e.blobPath === "string" && isValidStudioOpfsPath(e.blobPath) && isNonNegInt(e.byteLength) && isAssetKind(e.assetKind) && isNonNegInt(e.refCount) && Array.isArray(e.refPaths) && e.refPaths.every((x): x is string => typeof x === "string") && typeof e.verifiedAtMs === "number") {
        blobs[k] = { sha256: k, blobPath: e.blobPath, byteLength: e.byteLength, assetKind: e.assetKind, refCount: e.refCount, refPaths: e.refPaths, verifiedAtMs: e.verifiedAtMs };
      }
    }
    return { schema: STUDIO_OPFS_CAS_INDEX_SCHEMA, projectId: p.projectId, updatedAtMs: p.updatedAtMs, generation: p.generation, blobs };
  } catch {
    return null;
  }
}

/** OPFS 경로에서 원시 파일 또는 CAS 포인터 대상을 0손실 SHA-256 무결성 검증과 함께 투명 복원한다. */
export async function readOpfsContentAddressedAsset(fs: StudioOpfsFileSystem, path: string): Promise<Uint8Array | null> {
  const raw = await fs.read(path);
  if (raw === null) return null;
  const pointer = parseOpfsCasPointer(raw);
  if (!pointer) return raw;
  const blob = await fs.read(pointer.blobPath);
  if (blob === null) throw new StudioOpfsError("CORRUPT_ENTRY", `중복 제거 저장 청크(${pointer.sha256.slice(0, 12)})를 찾을 수 없습니다.`);
  if (blob.byteLength !== pointer.byteLength || sha256HexPortable(blob) !== pointer.sha256) {
    throw new StudioOpfsError("INTEGRITY_FAILED", `저장 청크(${pointer.sha256.slice(0, 12)})의 SHA-256 무결성 검증에 실패했습니다.`);
  }
  return blob;
}

// ── 다중 탭 배타 잠금 (Web Locks 우선 + BroadcastChannel 폴백) ────────────────

function parseBroadcastMsg(d: unknown): BroadcastLockMsg | null {
  if (!isRecord(d) || typeof d.type !== "string" || typeof d.lockName !== "string") return null;
  if (d.type === "probe" && typeof d.requesterId === "string" && typeof d.sentAtMs === "number") return { type: "probe", lockName: d.lockName, requesterId: d.requesterId, sentAtMs: d.sentAtMs };
  if (d.type === "busy" && typeof d.holderId === "string" && typeof d.expiresAtMs === "number") return { type: "busy", lockName: d.lockName, holderId: d.holderId, expiresAtMs: d.expiresAtMs };
  if (d.type === "claim" && typeof d.holderId === "string" && typeof d.sentAtMs === "number" && typeof d.expiresAtMs === "number") return { type: "claim", lockName: d.lockName, holderId: d.holderId, sentAtMs: d.sentAtMs, expiresAtMs: d.expiresAtMs };
  if (d.type === "release" && typeof d.holderId === "string") return { type: "release", lockName: d.lockName, holderId: d.holderId };
  return null;
}

function resolveWebLocks(options: StudioOpfsVacuumLockOptions): StudioWebLockManagerLike | null {
  if ("lockManager" in options) return options.lockManager ?? null;
  const navLocks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!navLocks || typeof navLocks.request !== "function") return null;
  return { request: (name, reqOpts, cb) => navLocks.request(name, reqOpts, (lock) => cb(lock ? { name: lock.name, mode: lock.mode } : null)) };
}

export async function withOpfsVacuumCrossTabLock<T>(
  projectId: string,
  task: (mechanism: StudioOpfsVacuumLockMechanism) => Promise<T>,
  options: StudioOpfsVacuumLockOptions = {},
): Promise<StudioOpfsVacuumLockAcquireResult<T>> {
  const lockName = `toonstudio:opfs-vacuum:${toSafeProjectSlug(projectId)}`;
  const tabId = options.tabId?.trim() || nextToken("tab");
  const now = options.now ?? Date.now;
  const result = (acquired: boolean, mechanism: StudioOpfsVacuumLockMechanism, holderId: string | null, value: T | null, reasonKo: string) =>
    ({ acquired, mechanism, lockName, holderId, value, reasonKo });

  const webLocks = resolveWebLocks(options);
  if (webLocks) {
    let taskStarted = false;
    try {
      return await webLocks.request(lockName, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) return result(false, "web-locks", "other-tab", null, "다른 탭에서 같은 작품의 OPFS 중복 정리(Vacuum)를 실행 중입니다. 완료 후 다시 시도해 주세요.");
        taskStarted = true;
        return result(true, "web-locks", tabId, await task("web-locks"), "Web Locks(navigator.locks) 배타 잠금을 획득했습니다.");
      });
    } catch (error) {
      if (taskStarted) throw error;
    }
  }

  const createChannel = "createBroadcastChannel" in options
    ? (options.createBroadcastChannel ?? null)
    : typeof BroadcastChannel === "function" ? (name: string) => new BroadcastChannel(name) : null;

  if (createChannel) {
    const channel = createChannel(STUDIO_OPFS_VACUUM_LOCK_CHANNEL);
    const negotiationMs = Math.max(5, options.negotiationWindowMs ?? 45);
    const mySentAtMs = now();
    const myExpiresAtMs = mySentAtMs + Math.max(1_000, options.leaseTtlMs ?? 30_000);
    let holding = false;
    let conflictHolderId: string | null = null;
    const postBusy = () => channel.postMessage({ type: "busy", lockName, holderId: tabId, expiresAtMs: myExpiresAtMs });
    const postClaim = () => channel.postMessage({ type: "claim", lockName, holderId: tabId, sentAtMs: mySentAtMs, expiresAtMs: myExpiresAtMs });

    const onMessage = (event: { readonly data: unknown }) => {
      const msg = parseBroadcastMsg(event.data);
      if (!msg || msg.lockName !== lockName) return;
      if (msg.type === "busy" && msg.holderId !== tabId && msg.expiresAtMs > now()) conflictHolderId = msg.holderId;
      else if (msg.type === "probe" && msg.requesterId !== tabId) { if (holding) postBusy(); else if (conflictHolderId === null) postClaim(); }
      else if (msg.type === "claim" && msg.holderId !== tabId) {
        if (holding) postBusy();
        else if (msg.sentAtMs < mySentAtMs || (msg.sentAtMs === mySentAtMs && msg.holderId < tabId)) conflictHolderId = msg.holderId;
        else if (conflictHolderId === null) postClaim();
      }
    };

    channel.addEventListener("message", onMessage);
    try {
      channel.postMessage({ type: "probe", lockName, requesterId: tabId, sentAtMs: mySentAtMs });
      postClaim();
      await new Promise<void>((resolve) => { setTimeout(resolve, negotiationMs); });
      if (conflictHolderId !== null) return result(false, "broadcast-channel", conflictHolderId, null, "다른 탭이 BroadcastChannel 잠금으로 OPFS 중복 정리(Vacuum)를 실행 중입니다. 완료 후 다시 시도해 주세요.");
      holding = true;
      postBusy();
      return result(true, "broadcast-channel", tabId, await task("broadcast-channel"), "BroadcastChannel 폴백 배타 잠금을 획득했습니다.");
    } finally {
      if (holding) { holding = false; channel.postMessage({ type: "release", lockName, holderId: tabId }); }
      channel.removeEventListener("message", onMessage);
      channel.close();
    }
  }

  if (activeSingleTabLocks.has(lockName)) return result(false, "single-tab-fallback", "current-tab", null, "이미 현재 탭에서 OPFS 중복 정리(Vacuum)가 진행 중입니다.");
  activeSingleTabLocks.add(lockName);
  try {
    return result(true, "single-tab-fallback", tabId, await task("single-tab-fallback"), "단일 탭 잠금을 획득했습니다.");
  } finally {
    activeSingleTabLocks.delete(lockName);
  }
}

// ── 스캔 · 계획 · 원자적 Vacuum 실행 및 롤백 ─────────────────────────────────

async function measureTotalOpfsBytes(fs: StudioOpfsFileSystem): Promise<number> {
  let total = 0;
  for (const path of await fs.list("")) total += (await fs.size(path)) ?? 0;
  return total;
}

async function scanOpfsForVacuum(options: StudioOpfsVacuumPlanOptions): Promise<InternalScanState> {
  const { fs, projectId } = options;
  const nowMs = (options.now ?? Date.now)();
  const layout = buildCasLayout(projectId);
  const excludePaths = new Set([...(options.excludePaths ?? [])].map(normalizeOpfsRelativePath).filter(Boolean));
  const excludePrefixes = (options.excludePrefixes ?? []).map(normalizeOpfsRelativePath).filter(Boolean).map((p) => (p.endsWith("/") ? p : `${p}/`));

  const allPaths = await fs.list("");
  let totalOpfsBytesBefore = 0;
  for (const path of allPaths) totalOpfsBytesBefore += (await fs.size(path)) ?? 0;

  const previousIndexBytes = await fs.read(layout.indexPath);
  const previousIndex = parseCasIndex(previousIndexBytes);
  const staleStagingPaths = allPaths.filter((p) => p.startsWith(layout.casPrefix) && p.endsWith(".staging"));
  const existingBlobHealth = new Map<string, { readonly byteLength: number; readonly valid: boolean }>();

  for (const path of allPaths) {
    if (!path.startsWith(layout.blobsPrefix) || !path.endsWith(".bin")) continue;
    const hash = path.slice(layout.blobsPrefix.length, -4);
    if (!SHA256_HEX_RE.test(hash)) continue;
    const blobBytes = await fs.read(path);
    if (blobBytes) existingBlobHealth.set(hash, { byteLength: blobBytes.byteLength, valid: sha256HexPortable(blobBytes) === hash });
  }

  const rawBytesByPath = new Map<string, Uint8Array>();
  const livePointerByPath = new Map<string, StudioOpfsCasPointerRecord>();
  const rawByHash = new Map<string, { readonly paths: string[]; readonly byteLength: number; readonly assetKind: StudioOpfsDedupableAssetKind }>();
  const pointersByHash = new Map<string, string[]>();
  let scannedFileCount = 0;

  for (const path of allPaths) {
    if (isExcludedFromVacuum(path, excludePaths, excludePrefixes)) continue;
    const bytes = await fs.read(path);
    if (!bytes) continue;
    scannedFileCount += 1;
    const pointer = parseOpfsCasPointer(bytes);
    if (pointer) {
      if (pointer.blobPath.startsWith(layout.blobsPrefix)) {
        livePointerByPath.set(path, pointer);
        const list = pointersByHash.get(pointer.sha256);
        if (list) list.push(path);
        else pointersByHash.set(pointer.sha256, [path]);
      }
      continue;
    }
    const sha256 = sha256HexPortable(bytes);
    rawBytesByPath.set(path, bytes);
    const group = rawByHash.get(sha256);
    if (group) group.paths.push(path);
    else rawByHash.set(sha256, { paths: [path], byteLength: bytes.byteLength, assetKind: classifyOpfsAssetKind(path) });
  }

  const duplicateGroups: StudioOpfsVacuumDuplicateGroup[] = [];
  const referencedHashesAfter = new Set<string>(pointersByHash.keys());
  for (const [sha256, group] of rawByHash.entries()) {
    const existingPointers = pointersByHash.get(sha256) ?? [];
    const totalRefs = group.paths.length + existingPointers.length;
    if (totalRefs < 2) continue;
    const blobPath = layout.blobPath(sha256);
    const blobInfo = existingBlobHealth.get(sha256);
    const blobHealthy = Boolean(blobInfo?.valid && blobInfo.byteLength === group.byteLength);
    const pointerBytes = toJsonBytes({ schema: STUDIO_OPFS_CAS_POINTER_SCHEMA, sha256, byteLength: group.byteLength, assetKind: group.assetKind, blobPath }).byteLength;
    const reclaimable = group.paths.length * group.byteLength - ((blobHealthy ? 0 : group.byteLength) + group.paths.length * pointerBytes + (blobHealthy ? 0 : 220) + group.paths.length * 32);
    if (reclaimable <= 0) continue;
    referencedHashesAfter.add(sha256);
    duplicateGroups.push({
      sha256, assetKind: group.assetKind, blobPath, blobAlreadyExists: blobHealthy, rawByteLength: group.byteLength,
      rawPaths: [...group.paths].sort(), existingPointerPaths: [...existingPointers].sort(), totalRefCountAfter: totalRefs, reclaimableBytes: reclaimable,
    });
  }
  duplicateGroups.sort((a, b) => b.reclaimableBytes - a.reclaimableBytes || a.sha256.localeCompare(b.sha256));

  const gcOrphanBlobs: StudioOpfsVacuumOrphanBlob[] = [...existingBlobHealth.entries()]
    .filter(([sha256]) => !referencedHashesAfter.has(sha256))
    .map(([sha256, info]) => ({
      sha256, blobPath: layout.blobPath(sha256), byteLength: info.byteLength,
      reasonKo: info.valid ? "참조 카운트가 0인 미사용 CAS 청크입니다." : "참조가 없고 해시가 불일치하는 손상 고아 청크입니다.",
    }))
    .sort((a, b) => a.blobPath.localeCompare(b.blobPath));

  const duplicateFileCount = duplicateGroups.reduce((sum, g) => sum + g.rawPaths.length, 0);
  const reclaimableBytes = duplicateGroups.reduce((s, g) => s + g.reclaimableBytes, 0) + gcOrphanBlobs.reduce((s, o) => s + o.byteLength, 0);
  const estimatedSavingsRatio = totalOpfsBytesBefore > 0 ? reclaimableBytes / totalOpfsBytesBefore : 0;
  const hasActionableWork = duplicateGroups.length > 0 || gcOrphanBlobs.length > 0 || staleStagingPaths.length > 0;
  const summaryKo = !hasActionableWork
    ? `중복 제거 대상이 없습니다 (검사 ${scannedFileCount}건 · CAS 포인터 ${livePointerByPath.size}건 유지).`
    : `중복 에셋 ${duplicateFileCount}건(${duplicateGroups.length}그룹) · 고아 청크 ${gcOrphanBlobs.length}건 정리 시 약 ${formatStorageBytes(reclaimableBytes)} (${(estimatedSavingsRatio * 100).toFixed(1)}%) 회수 가능합니다.`;

  return {
    layout, rawBytesByPath, livePointerByPath, previousIndex, previousIndexBytes,
    plan: {
      projectId, evaluatedAtMs: nowMs, casPrefix: layout.casPrefix, indexPath: layout.indexPath, scannedFileCount,
      trackedPointerCount: livePointerByPath.size, totalOpfsBytesBefore, estimatedOpfsBytesAfter: Math.max(0, totalOpfsBytesBefore - reclaimableBytes),
      duplicateGroups, duplicateFileCount, gcOrphanBlobs, staleStagingPaths, reclaimableBytes, estimatedSavingsRatio, hasActionableWork, summaryKo,
    },
  };
}

export async function planOpfsContentDedupeVacuum(options: StudioOpfsVacuumPlanOptions): Promise<StudioOpfsVacuumPlan> {
  return (await scanOpfsForVacuum(options)).plan;
}

function buildNextCasIndex(scan: InternalScanState, nowMs: number): StudioOpfsCasIndex {
  const refs = new Map<string, { paths: Set<string>; byteLength: number; assetKind: StudioOpfsDedupableAssetKind; blobPath: string }>();
  const addRef = (sha256: string, byteLength: number, assetKind: StudioOpfsDedupableAssetKind, blobPath: string, path: string) => {
    let bucket = refs.get(sha256);
    if (!bucket) { bucket = { paths: new Set<string>(), byteLength, assetKind, blobPath }; refs.set(sha256, bucket); }
    bucket.paths.add(path);
  };
  for (const [path, p] of scan.livePointerByPath.entries()) addRef(p.sha256, p.byteLength, p.assetKind, p.blobPath, path);
  for (const g of scan.plan.duplicateGroups) {
    for (const path of [...g.rawPaths, ...g.existingPointerPaths]) addRef(g.sha256, g.rawByteLength, g.assetKind, g.blobPath, path);
  }
  const blobs: Record<string, StudioOpfsCasBlobIndexEntry> = {};
  for (const [sha256, b] of refs.entries()) {
    if (b.paths.size === 0) continue;
    const refPaths = [...b.paths].sort();
    blobs[sha256] = { sha256, blobPath: b.blobPath, byteLength: b.byteLength, assetKind: b.assetKind, refCount: refPaths.length, refPaths, verifiedAtMs: nowMs };
  }
  return { schema: STUDIO_OPFS_CAS_INDEX_SCHEMA, projectId: scan.plan.projectId, updatedAtMs: nowMs, generation: (scan.previousIndex?.generation ?? 0) + 1, blobs };
}

function createExecResult(
  overrides: Partial<StudioOpfsVacuumExecutionResult> & Pick<StudioOpfsVacuumExecutionResult, "status" | "projectId" | "executedAtMs" | "lockMechanism" | "summaryKo">,
): StudioOpfsVacuumExecutionResult {
  return {
    lockHolderId: null, deduplicatedFileCount: 0, writtenBlobCount: 0, gcRemovedBlobCount: 0, totalOpfsBytesBefore: 0,
    totalOpfsBytesAfter: 0, reclaimedBytes: 0, savedRatio: 0, verifiedPointerCount: 0, rollback: EMPTY_ROLLBACK, errorMessage: null, ...overrides,
  };
}

async function rollbackVacuumTx(
  fs: StudioOpfsFileSystem,
  replacedSources: readonly { readonly path: string; readonly sha256: string; readonly rawBytes: Uint8Array }[],
  stagedBlobs: readonly { readonly sha256: string; readonly blobPath: string }[],
  indexState: { readonly mutated: boolean; readonly path: string; readonly previousBytes: Uint8Array | null },
  stagingState: { readonly written: boolean; readonly path: string },
): Promise<StudioOpfsVacuumRollbackReport> {
  const restoredSourcePaths: string[] = [];
  const unrestoredHashes = new Set<string>();
  const rollbackErrors: string[] = [];
  for (let i = replacedSources.length - 1; i >= 0; i -= 1) {
    const item = replacedSources[i];
    if (!item) continue;
    try { await fs.write(item.path, item.rawBytes); restoredSourcePaths.push(item.path); }
    catch (err) { unrestoredHashes.add(item.sha256); rollbackErrors.push(`원본 복원 실패(${item.path}): ${toErrMsg(err)}`); }
  }
  if (indexState.mutated) {
    try {
      if (indexState.previousBytes) await fs.write(indexState.path, indexState.previousBytes);
      else await fs.remove(indexState.path);
    } catch (err) { rollbackErrors.push(`인덱스 복원 실패: ${toErrMsg(err)}`); }
  }
  const removedOrphanBlobPaths: string[] = [];
  const preservedLiveBlobPaths: string[] = [];
  for (const staged of stagedBlobs) {
    if (unrestoredHashes.has(staged.sha256)) { preservedLiveBlobPaths.push(staged.blobPath); continue; }
    try { if (await fs.remove(staged.blobPath)) removedOrphanBlobPaths.push(staged.blobPath); }
    catch (err) { rollbackErrors.push(`고아 청크 롤백 실패(${staged.blobPath}): ${toErrMsg(err)}`); }
  }
  let stagingCleaned = !stagingState.written;
  if (stagingState.written && rollbackErrors.length === 0) {
    try { await fs.remove(stagingState.path); stagingCleaned = true; } catch { stagingCleaned = false; }
  }
  return { performed: true, removedOrphanBlobPaths, restoredSourcePaths, preservedLiveBlobPaths, stagingCleaned, rollbackErrors };
}

const assertNotAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new StudioOpfsError("WRITE_FAILED", "중복 정리(Vacuum)가 중단되어 변경 사항을 롤백했습니다.");
};

export async function executeOpfsContentDedupeVacuum(options: StudioOpfsVacuumExecuteOptions): Promise<StudioOpfsVacuumExecutionResult> {
  const now = options.now ?? Date.now;
  const lockOutcome = await withOpfsVacuumCrossTabLock(
    options.projectId,
    async (mechanism): Promise<StudioOpfsVacuumExecutionResult> => {
      const executedAtMs = now();
      const scan = await scanOpfsForVacuum(options);
      const { fs, signal, onStage } = options;
      const { plan, layout } = scan;
      const base = { projectId: options.projectId, executedAtMs, lockMechanism: mechanism, lockHolderId: options.lockOptions?.tabId ?? null, totalOpfsBytesBefore: plan.totalOpfsBytesBefore };
      if (!plan.hasActionableWork) {
        return createExecResult({ ...base, status: "noop", totalOpfsBytesAfter: plan.totalOpfsBytesBefore, verifiedPointerCount: plan.trackedPointerCount, summaryKo: plan.summaryKo });
      }

      const txId = nextToken("vac");
      const stagingPath = layout.stagingPath(txId);
      const stagedBlobs: Array<{ readonly sha256: string; readonly blobPath: string }> = [];
      const replacedSources: Array<{ readonly path: string; readonly sha256: string; readonly rawBytes: Uint8Array }> = [];
      let indexMutated = false;
      let stagingWritten = false;

      try {
        assertNotAborted(signal);
        const plannedBlobPaths = plan.duplicateGroups.filter((g) => !g.blobAlreadyExists).map((g) => g.blobPath);
        await fs.write(stagingPath, toJsonBytes({ schema: STAGING_SCHEMA, txId, projectId: options.projectId, startedAtMs: executedAtMs, plannedBlobPaths }));
        stagingWritten = true;

        // 1단계: CAS 청크 스테이징 + 즉시 0손실 재읽기(길이·SHA-256·바이트 일치) 검증
        for (const group of plan.duplicateGroups) {
          assertNotAborted(signal);
          const sourceBytes = group.rawPaths[0] ? scan.rawBytesByPath.get(group.rawPaths[0]) : undefined;
          if (!sourceBytes) throw new StudioOpfsError("READ_FAILED", `원본 바이트를 읽지 못했습니다: ${group.sha256}`);
          if (!group.blobAlreadyExists) {
            await fs.write(group.blobPath, sourceBytes);
            stagedBlobs.push({ sha256: group.sha256, blobPath: group.blobPath });
            onStage?.("after-blob-staged", group.blobPath);
          }
          const verified = await fs.read(group.blobPath);
          if (!verified || verified.byteLength !== sourceBytes.byteLength || sha256HexPortable(verified) !== group.sha256 || !bytesEqual(verified, sourceBytes)) {
            throw new StudioOpfsError("INTEGRITY_FAILED", `CAS 청크(${group.sha256.slice(0, 12)}) 0손실 무결성 검증에 실패했습니다.`);
          }
        }

        // 2단계: 모든 청크 검증 후 원본 경로를 CAS 포인터로 원자적 교체 + 포인터 재검증
        for (const group of plan.duplicateGroups) {
          for (const path of group.rawPaths) {
            assertNotAborted(signal);
            const rawBytes = scan.rawBytesByPath.get(path);
            if (!rawBytes) throw new StudioOpfsError("READ_FAILED", `원본 스냅샷을 찾을 수 없습니다: ${path}`);
            const pointer: StudioOpfsCasPointerRecord = { schema: STUDIO_OPFS_CAS_POINTER_SCHEMA, sha256: group.sha256, byteLength: group.rawByteLength, assetKind: group.assetKind, blobPath: group.blobPath };
            await fs.write(path, toJsonBytes(pointer));
            replacedSources.push({ path, sha256: group.sha256, rawBytes });
            onStage?.("after-pointer-written", path);
            const parsedBack = parseOpfsCasPointer((await fs.read(path)) ?? new Uint8Array(0));
            if (!parsedBack || parsedBack.sha256 !== group.sha256 || parsedBack.blobPath !== group.blobPath) {
              throw new StudioOpfsError("INTEGRITY_FAILED", `포인터 기록 검증에 실패했습니다: ${path}`);
            }
          }
        }

        // 3단계: 참조 카운트 CAS 인덱스 커밋 + 재검증
        assertNotAborted(signal);
        const nextIndex = buildNextCasIndex(scan, executedAtMs);
        await fs.write(layout.indexPath, toJsonBytes(nextIndex));
        indexMutated = true;
        const verifiedIndex = parseCasIndex(await fs.read(layout.indexPath));
        if (!verifiedIndex || verifiedIndex.generation !== nextIndex.generation) {
          throw new StudioOpfsError("INTEGRITY_FAILED", "CAS 인덱스 커밋 검증에 실패했습니다.");
        }

        // 4단계: 커밋 완료 후 참조 카운트 0 고아 청크 GC 및 스테이징 저널 정리
        let gcRemovedBlobCount = 0;
        for (const orphan of plan.gcOrphanBlobs) if (await fs.remove(orphan.blobPath)) gcRemovedBlobCount += 1;
        for (const stale of plan.staleStagingPaths) await fs.remove(stale);
        if (stagingWritten) await fs.remove(stagingPath);

        const totalOpfsBytesAfter = await measureTotalOpfsBytes(fs);
        const reclaimedBytes = Math.max(0, plan.totalOpfsBytesBefore - totalOpfsBytesAfter);
        const savedRatio = plan.totalOpfsBytesBefore > 0 ? reclaimedBytes / plan.totalOpfsBytesBefore : 0;
        return createExecResult({
          ...base, status: "completed", deduplicatedFileCount: replacedSources.length, writtenBlobCount: stagedBlobs.length, gcRemovedBlobCount,
          totalOpfsBytesAfter, reclaimedBytes, savedRatio, verifiedPointerCount: plan.trackedPointerCount + replacedSources.length,
          summaryKo: `OPFS 중복 정리(Vacuum) 완료: ${replacedSources.length}건 CAS 통합 · 고아 청크 ${gcRemovedBlobCount}건 회수 (${formatStorageBytes(reclaimedBytes)} 절감, ${(savedRatio * 100).toFixed(1)}% · 잠금 ${mechanism}).`,
        });
      } catch (cause) {
        const errorMessage = toErrMsg(cause);
        const rollback = await rollbackVacuumTx(fs, replacedSources, stagedBlobs, { mutated: indexMutated, path: layout.indexPath, previousBytes: scan.previousIndexBytes }, { written: stagingWritten, path: stagingPath });
        return createExecResult({
          ...base, status: "rolled-back", totalOpfsBytesAfter: await measureTotalOpfsBytes(fs), verifiedPointerCount: plan.trackedPointerCount, rollback, errorMessage,
          summaryKo: `중복 정리(Vacuum) 중단으로 안전 롤백 완료: 원본 ${rollback.restoredSourcePaths.length}건 복원 · 고아 청크 ${rollback.removedOrphanBlobPaths.length}건 제거 (${errorMessage}).`,
        });
      }
    },
    options.lockOptions,
  );

  if (!lockOutcome.acquired || !lockOutcome.value) {
    const totalBytes = await measureTotalOpfsBytes(options.fs);
    return createExecResult({
      status: "locked-conflict", projectId: options.projectId, executedAtMs: now(),
      lockMechanism: lockOutcome.mechanism, lockHolderId: lockOutcome.holderId,
      totalOpfsBytesBefore: totalBytes, totalOpfsBytesAfter: totalBytes,
      errorMessage: lockOutcome.reasonKo, summaryKo: lockOutcome.reasonKo,
    });
  }
  return lockOutcome.value;
}
