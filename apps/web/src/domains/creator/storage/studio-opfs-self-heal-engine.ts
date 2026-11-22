/**
 * OPFS 로컬 원고 자가 치유 및 스냅샷 타임머신 코어 엔진.
 *
 * 세 가지 핵심 책임을 순수·결정론적 코어로 분리해 브라우저 런타임과 헤드리스 테스트 모두에서
 * 동일하게 검증할 수 있도록 설계한다.
 *
 * 1. 브라우저 StorageManager 잔여 용량 진단(안전 / 주의 75% / 위험 90% 등급).
 * 2. 고아 임시 파일 정리 계획(진행 중 원고·최신/검증 스냅샷·정규 DB/매니페스트 절대 보호).
 * 3. 스냅샷 SHA-256 무결성 검증 및 손상 시 직전 정상 스냅샷(last-known-good) 자동 복구 타임라인.
 */

import {
  isValidStudioOpfsPath,
  type StudioOpfsFileSystem,
} from "../studio-opfs-filesystem";
import { sha256HexPortable } from "../studio-sha256";

// ── 상수 및 경계값 ────────────────────────────────────────────────────────

/** 잔여 용량 주의 등급 임계치(75%). */
export const STUDIO_STORAGE_QUOTA_WARNING_RATIO = 0.75;
/** 잔여 용량 위험 등급 임계치(90%). */
export const STUDIO_STORAGE_QUOTA_CRITICAL_RATIO = 0.9;
/** 진행 중 쓰기와 경합하지 않기 위한 고아 임시 파일 기본 유예 시간(5분). */
export const STUDIO_OPFS_ORPHAN_GRACE_WINDOW_MS = 5 * 60 * 1000;
/** 타임머신 스냅샷 봉투 스키마 버전. */
export const STUDIO_SNAPSHOT_TIMEMACHINE_SCHEMA = 1 as const;
/** 타임머신 기본 보존 스냅샷 상한. */
export const STUDIO_SNAPSHOT_TIMEMACHINE_DEFAULT_LIMIT = 20;
/**
 * 기존 `studio-data-destruction.ts`의 등록 OPFS 루트(`studio-recovery`) 안에서
 * 타임머신 하위 경로만 사용한다(미등록 루트 드리프트 방지).
 */
export const STUDIO_OPFS_SELF_HEAL_ROOT_NAME = "studio-recovery" as const;

const SHA256_HEX_RE = /^[a-f0-9]{64}$/u;
const SAFE_SEGMENT_RE = /[^a-z0-9._-]+/gu;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

const ORPHAN_TEMP_SUFFIXES = [
  ".tmp",
  ".temp",
  ".part",
  ".partial",
  ".crswap",
  ".staging",
  ".bak.tmp",
  ".orphaned",
  ".wal-tmp",
] as const;

const ORPHAN_TEMP_DIRECTORIES = ["tmp/", "temp/", ".tmp/", "staging/", "orphans/"] as const;

const CANONICAL_PROTECTED_PATTERNS: readonly RegExp[] = [
  /\.(?:sqlite|sqlite3|db|db-wal|db-shm|db-journal)$/iu,
  /(?:^|\/)(?:manifest|index|latest|project|document|manuscript|head)\.(?:json|bin)$/iu,
  /(?:^|\/)(?:snapshot|snap|checkpoint)-[a-z0-9._-]+\.json$/iu,
];

// ── 1. StorageManager 잔여 용량 진단 ──────────────────────────────────────

export type StudioStorageQuotaGrade = "safe" | "warning" | "critical" | "unavailable";

export interface StudioStorageQuotaInput {
  readonly usage?: number | null;
  readonly quota?: number | null;
}

export interface StudioStorageQuotaEstimatorLike {
  estimate(): Promise<StudioStorageQuotaInput>;
}

export interface StudioStorageQuotaDiagnosis {
  readonly grade: StudioStorageQuotaGrade;
  readonly usageBytes: number | null;
  readonly quotaBytes: number | null;
  readonly remainingBytes: number | null;
  readonly usageRatio: number | null;
  readonly usagePercent: number | null;
  readonly warningThresholdPercent: 75;
  readonly criticalThresholdPercent: 90;
  readonly needsCleanup: boolean;
  readonly needsBackup: boolean;
  readonly summaryKo: string;
  readonly actionHintKo: string;
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

/**
 * StorageManager.estimate() 결과를 안전 / 주의(75%) / 위험(90%) / 확인 불가 등급으로 판정한다.
 */
export function diagnoseStorageQuota(
  estimate: StudioStorageQuotaInput | null | undefined,
): StudioStorageQuotaDiagnosis {
  const usage = estimate?.usage;
  const quota = estimate?.quota;
  const validUsage = typeof usage === "number" && Number.isFinite(usage) && usage >= 0;
  const validQuota = typeof quota === "number" && Number.isFinite(quota) && quota > 0;

  if (!validUsage || !validQuota) {
    return {
      grade: "unavailable",
      usageBytes: validUsage ? usage : null,
      quotaBytes: validQuota ? quota : null,
      remainingBytes: null,
      usageRatio: null,
      usagePercent: null,
      warningThresholdPercent: 75,
      criticalThresholdPercent: 90,
      needsCleanup: false,
      needsBackup: false,
      summaryKo: "브라우저 저장 공간 정보를 읽을 수 없습니다.",
      actionHintKo: "작업 중인 원고는 프로젝트 파일로 별도 백업해 두세요.",
    };
  }

  const usageRatio = usage / quota;
  const usagePercent = Math.round(usageRatio * 1000) / 10;
  const remainingBytes = Math.max(0, quota - usage);

  if (usageRatio >= STUDIO_STORAGE_QUOTA_CRITICAL_RATIO) {
    return {
      grade: "critical",
      usageBytes: usage,
      quotaBytes: quota,
      remainingBytes,
      usageRatio,
      usagePercent,
      warningThresholdPercent: 75,
      criticalThresholdPercent: 90,
      needsCleanup: true,
      needsBackup: true,
      summaryKo: `저장 공간 위험 (${usagePercent.toFixed(1)}% 사용 · 잔여 ${formatStorageBytes(remainingBytes)})`,
      actionHintKo: "즉시 원고를 파일로 백업하고 오래된 고아 임시 파일을 정리하세요.",
    };
  }

  if (usageRatio >= STUDIO_STORAGE_QUOTA_WARNING_RATIO) {
    return {
      grade: "warning",
      usageBytes: usage,
      quotaBytes: quota,
      remainingBytes,
      usageRatio,
      usagePercent,
      warningThresholdPercent: 75,
      criticalThresholdPercent: 90,
      needsCleanup: true,
      needsBackup: false,
      summaryKo: `저장 공간 주의 (${usagePercent.toFixed(1)}% 사용 · 잔여 ${formatStorageBytes(remainingBytes)})`,
      actionHintKo: "고아 임시 파일 정리로 여유 공간을 확보해 두는 편이 안전합니다.",
    };
  }

  return {
    grade: "safe",
    usageBytes: usage,
    quotaBytes: quota,
    remainingBytes,
    usageRatio,
    usagePercent,
    warningThresholdPercent: 75,
    criticalThresholdPercent: 90,
    needsCleanup: false,
    needsBackup: false,
    summaryKo: `저장 공간 안전 (${usagePercent.toFixed(1)}% 사용 · 잔여 ${formatStorageBytes(remainingBytes)})`,
    actionHintKo: "로컬 원고 자동 저장과 스냅샷 보관 여유가 충분합니다.",
  };
}

/**
 * 브라우저 StorageManager(또는 주입된 estimator)에서 잔여 용량을 안전하게 조회해 진단한다.
 */
export async function inspectBrowserStorageQuota(
  estimator?: StudioStorageQuotaEstimatorLike | null,
): Promise<StudioStorageQuotaDiagnosis> {
  try {
    if (estimator) {
      return diagnoseStorageQuota(await estimator.estimate());
    }
    const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
    if (!storage || typeof storage.estimate !== "function") {
      return diagnoseStorageQuota(null);
    }
    const result = await storage.estimate();
    return diagnoseStorageQuota(result);
  } catch {
    return diagnoseStorageQuota(null);
  }
}

// ── 2. 고아 임시 파일 정리 계획(안전 보호 우선) ──────────────────────────

export interface StudioOpfsFileEntry {
  readonly path: string;
  readonly sizeBytes: number;
  readonly updatedAtMs: number;
  readonly projectId?: string;
}

export interface StudioOpfsCleanupProtectionSet {
  /** 현재 편집 중이거나 보호해야 할 원고 파일 경로(절대 삭제 금지). */
  readonly activeManuscriptPaths?: ReadonlySet<string> | readonly string[];
  /** 현재 열려 있는 작품 ID 목록(해당 작품의 원고/최신 스냅샷 보호). */
  readonly activeProjectIds?: ReadonlySet<string> | readonly string[];
  /** 최신/검증 완료 스냅샷 파일 경로(절대 삭제 금지). */
  readonly protectedSnapshotPaths?: ReadonlySet<string> | readonly string[];
  /** 고아 임시 파일 최소 경과 시간(기본 5분). */
  readonly minOrphanAgeMs?: number;
  readonly nowMs?: number;
}

export type StudioOpfsCleanupDecision =
  | "delete-orphan-temp"
  | "protect-active-manuscript"
  | "protect-latest-snapshot"
  | "protect-canonical-file"
  | "defer-grace-window"
  | "skip-invalid-path";

export interface StudioOpfsCleanupPlanItem {
  readonly path: string;
  readonly sizeBytes: number;
  readonly ageMs: number;
  readonly decision: StudioOpfsCleanupDecision;
  readonly reasonKo: string;
}

export interface StudioOpfsOrphanCleanupPlan {
  readonly evaluatedAtMs: number;
  readonly totalFiles: number;
  readonly deletable: readonly StudioOpfsCleanupPlanItem[];
  readonly protectedItems: readonly StudioOpfsCleanupPlanItem[];
  readonly deferredItems: readonly StudioOpfsCleanupPlanItem[];
  readonly reclaimableBytes: number;
  readonly protectedBytes: number;
  readonly dryRunSummaryKo: string;
}

export interface StudioOpfsOrphanCleanupExecutionResult {
  readonly dryRun: boolean;
  readonly removedPaths: readonly string[];
  readonly failedPaths: readonly { readonly path: string; readonly error: string }[];
  readonly skippedPaths: readonly string[];
  readonly reclaimedBytes: number;
  readonly summaryKo: string;
}

function normalizeRelativePath(rawPath: string): string {
  return rawPath.replace(/\\/gu, "/").replace(/^\.\//u, "").replace(/^\/+/u, "").trim();
}

function hasUnsafePathTraversal(normalizedPath: string): boolean {
  if (!normalizedPath) return true;
  const segments = normalizedPath.split("/");
  return segments.some((segment) => segment === "" || segment === "." || segment === "..");
}

function toNormalizedPathSet(values: ReadonlySet<string> | readonly string[] | undefined): Set<string> {
  const result = new Set<string>();
  if (!values) return result;
  for (const item of values) {
    const normalized = normalizeRelativePath(item);
    if (normalized) result.add(normalized);
  }
  return result;
}

function toStringSet(values: ReadonlySet<string> | readonly string[] | undefined): Set<string> {
  const result = new Set<string>();
  if (!values) return result;
  for (const item of values) {
    const trimmed = item.trim();
    if (trimmed) result.add(trimmed);
  }
  return result;
}

function isOrphanTempCandidatePath(normalizedPath: string): boolean {
  const lower = normalizedPath.toLowerCase();
  if (ORPHAN_TEMP_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
    return true;
  }
  return ORPHAN_TEMP_DIRECTORIES.some((dir) => lower.startsWith(dir) || lower.includes(`/${dir}`));
}

function isCanonicalProtectedFile(normalizedPath: string): boolean {
  return CANONICAL_PROTECTED_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}

function findImplicitLatestSnapshotPaths(entries: readonly StudioOpfsFileEntry[]): Set<string> {
  const latestByScope = new Map<string, { path: string; updatedAtMs: number }>();
  for (const entry of entries) {
    const normalized = normalizeRelativePath(entry.path);
    if (hasUnsafePathTraversal(normalized)) continue;
    if (isOrphanTempCandidatePath(normalized)) continue;
    if (!/(?:^|\/)(?:snapshot|snap|checkpoint)-[a-z0-9._-]+\.json$/iu.test(normalized)) continue;
    const scope = entry.projectId?.trim() || normalized.slice(0, Math.max(0, normalized.lastIndexOf("/")));
    const previous = latestByScope.get(scope);
    if (!previous || entry.updatedAtMs > previous.updatedAtMs || (entry.updatedAtMs === previous.updatedAtMs && normalized > previous.path)) {
      latestByScope.set(scope, { path: normalized, updatedAtMs: entry.updatedAtMs });
    }
  }
  return new Set([...latestByScope.values()].map((item) => item.path));
}

/**
 * OPFS 파일 목록에서 안전하게 회수할 수 있는 고아 임시 파일만 선별한다.
 * 진행 중 원고, 최신 스냅샷, 정규 저장 파일, 유예 시간 내 임시 파일은 절대 삭제 후보에 넣지 않는다.
 */
export function planOrphanTempCleanup(
  entries: readonly StudioOpfsFileEntry[],
  protection: StudioOpfsCleanupProtectionSet = {},
): StudioOpfsOrphanCleanupPlan {
  const nowMs = protection.nowMs ?? Date.now();
  const minOrphanAgeMs = Math.max(0, protection.minOrphanAgeMs ?? STUDIO_OPFS_ORPHAN_GRACE_WINDOW_MS);
  const activeManuscriptPaths = toNormalizedPathSet(protection.activeManuscriptPaths);
  const protectedSnapshotPaths = toNormalizedPathSet(protection.protectedSnapshotPaths);
  const activeProjectIds = toStringSet(protection.activeProjectIds);
  const implicitLatestSnapshots = findImplicitLatestSnapshotPaths(entries);

  const deletable: StudioOpfsCleanupPlanItem[] = [];
  const protectedItems: StudioOpfsCleanupPlanItem[] = [];
  const deferredItems: StudioOpfsCleanupPlanItem[] = [];

  for (const entry of entries) {
    const normalized = normalizeRelativePath(entry.path);
    const sizeBytes = Number.isFinite(entry.sizeBytes) && entry.sizeBytes >= 0 ? entry.sizeBytes : 0;
    const ageMs = Number.isFinite(entry.updatedAtMs) ? Math.max(0, nowMs - entry.updatedAtMs) : 0;

    if (hasUnsafePathTraversal(normalized)) {
      deferredItems.push({
        path: entry.path,
        sizeBytes,
        ageMs,
        decision: "skip-invalid-path",
        reasonKo: "경로 형식이 안전하지 않아 정리 대상에서 제외했습니다.",
      });
      continue;
    }

    if (activeManuscriptPaths.has(normalized)) {
      protectedItems.push({
        path: normalized,
        sizeBytes,
        ageMs,
        decision: "protect-active-manuscript",
        reasonKo: "진행 중인 원고 파일이므로 보호합니다.",
      });
      continue;
    }

    if (protectedSnapshotPaths.has(normalized) || implicitLatestSnapshots.has(normalized)) {
      protectedItems.push({
        path: normalized,
        sizeBytes,
        ageMs,
        decision: "protect-latest-snapshot",
        reasonKo: "검증된 최신 스냅샷이므로 보호합니다.",
      });
      continue;
    }

    const isTempCandidate = isOrphanTempCandidatePath(normalized);
    if (!isTempCandidate) {
      const isActiveProjectFile = Boolean(entry.projectId && activeProjectIds.has(entry.projectId));
      const isCanonical = isCanonicalProtectedFile(normalized);
      protectedItems.push({
        path: normalized,
        sizeBytes,
        ageMs,
        decision: isActiveProjectFile ? "protect-active-manuscript" : "protect-canonical-file",
        reasonKo: isActiveProjectFile
          ? "활성 작품의 원고 자산이므로 보호합니다."
          : isCanonical
            ? "정규 로컬 저장 파일(DB·매니페스트·스냅샷)이므로 보호합니다."
            : "임시 파일 패턴이 아니므로 안전을 위해 보존합니다.",
      });
      continue;
    }

    if (ageMs < minOrphanAgeMs) {
      deferredItems.push({
        path: normalized,
        sizeBytes,
        ageMs,
        decision: "defer-grace-window",
        reasonKo: "최근 생성된 임시 파일이라 쓰기 경합 방지를 위해 정리 보류합니다.",
      });
      continue;
    }

    deletable.push({
      path: normalized,
      sizeBytes,
      ageMs,
      decision: "delete-orphan-temp",
      reasonKo: "유예 시간을 지난 고아 임시 파일로 안전하게 정리할 수 있습니다.",
    });
  }

  deletable.sort((a, b) => a.path.localeCompare(b.path));
  protectedItems.sort((a, b) => a.path.localeCompare(b.path));
  deferredItems.sort((a, b) => a.path.localeCompare(b.path));

  const reclaimableBytes = deletable.reduce((sum, item) => sum + item.sizeBytes, 0);
  const protectedBytes = protectedItems.reduce((sum, item) => sum + item.sizeBytes, 0);

  const dryRunSummaryKo = deletable.length === 0
    ? `정리할 고아 임시 파일이 없습니다 (보호 ${protectedItems.length}건 · 보류 ${deferredItems.length}건).`
    : `고아 임시 파일 ${deletable.length}건 정리 가능 (${formatStorageBytes(reclaimableBytes)} 회수 예정 · 보호 ${protectedItems.length}건 유지).`;

  return {
    evaluatedAtMs: nowMs,
    totalFiles: entries.length,
    deletable,
    protectedItems,
    deferredItems,
    reclaimableBytes,
    protectedBytes,
    dryRunSummaryKo,
  };
}

/**
 * 정리 계획에서 `delete-orphan-temp`로 확정된 항목만 삭제한다.
 * 개별 파일 잠금(NoModificationAllowedError 등)으로 실패해도 나머지 정리와 보호 상태를 유지한다.
 */
export async function executeOrphanTempCleanup(
  plan: StudioOpfsOrphanCleanupPlan,
  removeFile: (path: string) => Promise<boolean>,
  options: { readonly dryRun?: boolean } = {},
): Promise<StudioOpfsOrphanCleanupExecutionResult> {
  const dryRun = options.dryRun === true;
  const removedPaths: string[] = [];
  const failedPaths: Array<{ readonly path: string; readonly error: string }> = [];
  const skippedPaths: string[] = [];
  let reclaimedBytes = 0;

  for (const item of plan.deletable) {
    if (item.decision !== "delete-orphan-temp" || hasUnsafePathTraversal(item.path)) {
      skippedPaths.push(item.path);
      continue;
    }
    if (dryRun) {
      skippedPaths.push(item.path);
      continue;
    }
    try {
      const removed = await removeFile(item.path);
      if (removed) {
        removedPaths.push(item.path);
        reclaimedBytes += item.sizeBytes;
      } else {
        skippedPaths.push(item.path);
      }
    } catch (cause) {
      failedPaths.push({
        path: item.path,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  const summaryKo = dryRun
    ? `사전 점검 완료: 고아 임시 파일 ${plan.deletable.length}건 (${formatStorageBytes(plan.reclaimableBytes)}) 정리 예정`
    : failedPaths.length === 0
      ? `고아 임시 파일 ${removedPaths.length}건 정리 완료 (${formatStorageBytes(reclaimedBytes)} 회수)`
      : `고아 임시 파일 ${removedPaths.length}건 정리 (${formatStorageBytes(reclaimedBytes)} 회수 · 잠금/실패 ${failedPaths.length}건)`;

  return {
    dryRun,
    removedPaths,
    failedPaths,
    skippedPaths,
    reclaimedBytes,
    summaryKo,
  };
}

// ── 3. 스냅샷 SHA-256 무결성 검증 & 타임머신 자동 복구 ────────────────────

export interface StudioManuscriptSnapshotRecord {
  readonly schemaVersion: typeof STUDIO_SNAPSHOT_TIMEMACHINE_SCHEMA;
  readonly snapshotId: string;
  readonly projectId: string;
  readonly revision: number;
  readonly createdAtMs: number;
  readonly label: string;
  readonly parentSnapshotId: string | null;
  readonly payload: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export type StudioSnapshotIntegrityStatus =
  | "verified"
  | "corrupt-hash-mismatch"
  | "corrupt-byte-length"
  | "corrupt-json"
  | "corrupt-metadata"
  | "scope-mismatch";

export interface StudioSnapshotIntegrityResult {
  readonly valid: boolean;
  readonly status: StudioSnapshotIntegrityStatus;
  readonly expectedSha256: string;
  readonly actualSha256: string;
  readonly reasonKo: string;
}

export interface StudioSnapshotTimelineEntry {
  readonly snapshotId: string;
  readonly projectId: string;
  readonly revision: number;
  readonly createdAtMs: number;
  readonly label: string;
  readonly path: string | null;
  readonly byteLength: number;
  readonly sha256Prefix: string;
  readonly integrity: StudioSnapshotIntegrityResult;
  readonly isLatest: boolean;
  readonly isRecoveryTarget: boolean;
  readonly record: StudioManuscriptSnapshotRecord | null;
}

export type StudioSnapshotTimelineRecoveryStatus =
  | "healthy"
  | "auto-recovered"
  | "unrecoverable"
  | "empty";

export interface StudioSnapshotTimelineReport {
  readonly projectId: string;
  readonly recoveryStatus: StudioSnapshotTimelineRecoveryStatus;
  readonly selfHealed: boolean;
  readonly latestEntry: StudioSnapshotTimelineEntry | null;
  readonly lastKnownGood: StudioManuscriptSnapshotRecord | null;
  readonly lastKnownGoodPath: string | null;
  readonly verifiedCount: number;
  readonly corruptedCount: number;
  readonly entries: readonly StudioSnapshotTimelineEntry[];
  readonly summaryKo: string;
}

function toUtf8Bytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? TEXT_ENCODER.encode(value) : value;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return hex;
}

/** 동기 SHA-256 다이제스트(표준 FIPS 180-4 소문자 64-hex). */
export function computeSnapshotSha256Sync(payload: string | Uint8Array): string {
  return sha256HexPortable(toUtf8Bytes(payload));
}

/** Web Crypto를 우선 사용하고, 미지원 환경에서는 동일 벡터의 포터블 SHA-256으로 폴백한다. */
export async function computeSnapshotSha256(payload: string | Uint8Array): Promise<string> {
  const bytes = toUtf8Bytes(payload);
  const subtle = typeof globalThis !== "undefined" ? globalThis.crypto?.subtle : undefined;
  if (subtle && typeof subtle.digest === "function") {
    try {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const digest = await subtle.digest("SHA-256", copy.buffer);
      return bytesToHex(new Uint8Array(digest));
    } catch {
      return sha256HexPortable(bytes);
    }
  }
  return sha256HexPortable(bytes);
}

export interface CreateVerifiedManuscriptSnapshotInput {
  readonly snapshotId: string;
  readonly projectId: string;
  readonly revision: number;
  readonly label: string;
  readonly payload: string;
  readonly parentSnapshotId?: string | null;
  readonly createdAtMs?: number;
}

export function createVerifiedManuscriptSnapshot(
  input: CreateVerifiedManuscriptSnapshotInput,
): StudioManuscriptSnapshotRecord {
  const bytes = TEXT_ENCODER.encode(input.payload);
  const sha256 = sha256HexPortable(bytes);
  return {
    schemaVersion: STUDIO_SNAPSHOT_TIMEMACHINE_SCHEMA,
    snapshotId: input.snapshotId.trim(),
    projectId: input.projectId.trim(),
    revision: input.revision,
    createdAtMs: input.createdAtMs ?? Date.now(),
    label: input.label.trim() || `리비전 #${input.revision}`,
    parentSnapshotId: input.parentSnapshotId ?? null,
    payload: input.payload,
    byteLength: bytes.byteLength,
    sha256,
  };
}

/**
 * 스냅샷 메타데이터·작품 범위·UTF-8 바이트 길이·SHA-256 해시·JSON 구문을 전수 검증한다.
 */
export function verifyManuscriptSnapshotIntegrity(
  snapshot: Partial<StudioManuscriptSnapshotRecord> | null | undefined,
  options: {
    readonly expectedProjectId?: string;
    readonly requireValidJsonPayload?: boolean;
  } = {},
): StudioSnapshotIntegrityResult {
  if (!snapshot || typeof snapshot !== "object") {
    return {
      valid: false,
      status: "corrupt-metadata",
      expectedSha256: "",
      actualSha256: "",
      reasonKo: "스냅샷 레코드가 비어 있거나 손상되었습니다.",
    };
  }

  const expectedSha256 = typeof snapshot.sha256 === "string" ? snapshot.sha256 : "";
  if (
    snapshot.schemaVersion !== STUDIO_SNAPSHOT_TIMEMACHINE_SCHEMA
    || typeof snapshot.snapshotId !== "string"
    || snapshot.snapshotId.trim().length === 0
    || typeof snapshot.projectId !== "string"
    || snapshot.projectId.trim().length === 0
    || typeof snapshot.revision !== "number"
    || !Number.isSafeInteger(snapshot.revision)
    || snapshot.revision < 0
    || typeof snapshot.createdAtMs !== "number"
    || !Number.isFinite(snapshot.createdAtMs)
    || snapshot.createdAtMs < 0
    || typeof snapshot.payload !== "string"
    || typeof snapshot.byteLength !== "number"
    || !Number.isSafeInteger(snapshot.byteLength)
    || snapshot.byteLength < 0
    || !SHA256_HEX_RE.test(expectedSha256)
  ) {
    return {
      valid: false,
      status: "corrupt-metadata",
      expectedSha256,
      actualSha256: "",
      reasonKo: "스냅샷 헤더 또는 SHA-256 메타데이터가 손상되었습니다.",
    };
  }

  if (options.expectedProjectId && snapshot.projectId !== options.expectedProjectId) {
    return {
      valid: false,
      status: "scope-mismatch",
      expectedSha256,
      actualSha256: "",
      reasonKo: "현재 작품과 다른 작품의 스냅샷이어서 적용을 차단했습니다.",
    };
  }

  const encoded = TEXT_ENCODER.encode(snapshot.payload);
  const actualSha256 = sha256HexPortable(encoded);

  if (encoded.byteLength !== snapshot.byteLength) {
    return {
      valid: false,
      status: "corrupt-byte-length",
      expectedSha256,
      actualSha256,
      reasonKo: `스냅샷 크기가 일치하지 않습니다 (기록 ${snapshot.byteLength}B · 실제 ${encoded.byteLength}B).`,
    };
  }

  if (actualSha256 !== expectedSha256) {
    return {
      valid: false,
      status: "corrupt-hash-mismatch",
      expectedSha256,
      actualSha256,
      reasonKo: "SHA-256 무결성 해시가 일치하지 않아 손상된 스냅샷으로 판정했습니다.",
    };
  }

  if (options.requireValidJsonPayload !== false) {
    try {
      const parsed: unknown = JSON.parse(snapshot.payload);
      if (parsed === null || typeof parsed !== "object") {
        return {
          valid: false,
          status: "corrupt-json",
          expectedSha256,
          actualSha256,
          reasonKo: "스냅샷 원고 본문이 유효한 JSON 문서 객체가 아닙니다.",
        };
      }
    } catch {
      return {
        valid: false,
        status: "corrupt-json",
        expectedSha256,
        actualSha256,
        reasonKo: "스냅샷 원고 JSON 구문이 손상되어 복구할 수 없습니다.",
      };
    }
  }

  return {
    valid: true,
    status: "verified",
    expectedSha256,
    actualSha256,
    reasonKo: "SHA-256 무결성 검증을 통과했습니다.",
  };
}

export interface StudioSnapshotTimelineInputItem {
  readonly path?: string | null;
  readonly record: Partial<StudioManuscriptSnapshotRecord> | null;
  /** 원시 파일 파싱 자체가 실패했을 때 전달할 fallback 정보. */
  readonly fallbackId?: string;
  readonly fallbackRevision?: number;
  readonly fallbackByteLength?: number;
  readonly parseErrorKo?: string;
}

/**
 * 스냅샷 목록을 최신 리비전 순으로 평가하고, 최신본이 손상된 경우 직전 정상 스냅샷(last-known-good)을
 * 자동 복구 대상으로 선출한다.
 */
export function evaluateSnapshotTimeline(
  projectId: string,
  items: readonly StudioSnapshotTimelineInputItem[],
  options: { readonly requireValidJsonPayload?: boolean } = {},
): StudioSnapshotTimelineReport {
  if (items.length === 0) {
    return {
      projectId,
      recoveryStatus: "empty",
      selfHealed: false,
      latestEntry: null,
      lastKnownGood: null,
      lastKnownGoodPath: null,
      verifiedCount: 0,
      corruptedCount: 0,
      entries: [],
      summaryKo: "저장된 로컬 타임머신 스냅샷이 아직 없습니다.",
    };
  }

  const evaluated = items.map((item, index) => {
    const rec = item.record;
    const integrity: StudioSnapshotIntegrityResult = rec
      ? verifyManuscriptSnapshotIntegrity(rec, {
          expectedProjectId: projectId,
          requireValidJsonPayload: options.requireValidJsonPayload,
        })
      : {
          valid: false,
          status: "corrupt-json",
          expectedSha256: "",
          actualSha256: "",
          reasonKo: item.parseErrorKo ?? "스냅샷 파일을 읽거나 JSON으로 해석하지 못했습니다.",
        };

    const snapshotId = typeof rec?.snapshotId === "string" && rec.snapshotId.trim()
      ? rec.snapshotId
      : item.fallbackId ?? `corrupt-${index + 1}`;
    const revision = typeof rec?.revision === "number" && Number.isSafeInteger(rec.revision)
      ? rec.revision
      : item.fallbackRevision ?? -1;
    const createdAtMs = typeof rec?.createdAtMs === "number" && Number.isFinite(rec.createdAtMs)
      ? rec.createdAtMs
      : 0;
    const label = typeof rec?.label === "string" && rec.label.trim()
      ? rec.label.trim()
      : integrity.valid
        ? `리비전 #${revision}`
        : `손상된 스냅샷 (${snapshotId})`;
    const byteLength = typeof rec?.byteLength === "number" && Number.isSafeInteger(rec.byteLength)
      ? rec.byteLength
      : item.fallbackByteLength ?? 0;
    const sha256Prefix = integrity.expectedSha256.slice(0, 12) || "invalid";

    return {
      snapshotId,
      projectId: typeof rec?.projectId === "string" && rec.projectId ? rec.projectId : projectId,
      revision,
      createdAtMs,
      label,
      path: item.path ?? null,
      byteLength,
      sha256Prefix,
      integrity,
      record: integrity.valid ? (rec as StudioManuscriptSnapshotRecord) : null,
    };
  });

  evaluated.sort((left, right) => {
    if (right.revision !== left.revision) return right.revision - left.revision;
    if (right.createdAtMs !== left.createdAtMs) return right.createdAtMs - left.createdAtMs;
    return right.snapshotId.localeCompare(left.snapshotId);
  });

  const lastKnownGoodIndex = evaluated.findIndex((entry) => entry.integrity.valid);
  const entries: StudioSnapshotTimelineEntry[] = evaluated.map((entry, index) => ({
    ...entry,
    isLatest: index === 0,
    isRecoveryTarget: index === lastKnownGoodIndex,
  }));

  const latestEntry = entries[0] ?? null;
  const targetEntry = lastKnownGoodIndex >= 0 ? (entries[lastKnownGoodIndex] ?? null) : null;
  const verifiedCount = entries.filter((entry) => entry.integrity.valid).length;
  const corruptedCount = entries.length - verifiedCount;
  const selfHealed = Boolean(latestEntry && !latestEntry.integrity.valid && targetEntry);

  let recoveryStatus: StudioSnapshotTimelineRecoveryStatus;
  let summaryKo: string;
  if (latestEntry?.integrity.valid) {
    recoveryStatus = "healthy";
    summaryKo = corruptedCount === 0
      ? `최신 스냅샷(#${latestEntry.revision}) 포함 ${verifiedCount}건 모두 SHA-256 무결성 정상입니다.`
      : `최신 스냅샷(#${latestEntry.revision})은 정상이며 이전 손상 기록 ${corruptedCount}건을 격리 표기했습니다.`;
  } else if (selfHealed && targetEntry) {
    recoveryStatus = "auto-recovered";
    summaryKo = `최신 스냅샷 손상을 감지해 직전 정상 스냅샷(#${targetEntry.revision} · ${targetEntry.label})을 자동 복구 대상으로 선출했습니다.`;
  } else {
    recoveryStatus = "unrecoverable";
    summaryKo = `검증된 정상 스냅샷이 없습니다 (손상 ${corruptedCount}건). 외부 백업 파일에서 복원해 주세요.`;
  }

  return {
    projectId,
    recoveryStatus,
    selfHealed,
    latestEntry,
    lastKnownGood: targetEntry?.record ?? null,
    lastKnownGoodPath: targetEntry?.path ?? null,
    verifiedCount,
    corruptedCount,
    entries,
    summaryKo,
  };
}

// ── 4. OPFS 바인딩 스냅샷 타임머신 & 통합 자가 치유 진단 ─────────────────

function toSafeOpfsSlug(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.toLowerCase().replace(SAFE_SEGMENT_RE, "-").replace(/^-+|-+$/gu, "").slice(0, 28);
  const hashSuffix = sha256HexPortable(TEXT_ENCODER.encode(raw)).slice(0, 10);
  const base = cleaned || fallbackPrefix;
  return `${base}-${hashSuffix}`;
}

function buildSnapshotOpfsPath(projectId: string, revision: number, snapshotId: string): string {
  const projectSlug = toSafeOpfsSlug(projectId, "proj");
  const snapshotSlug = toSafeOpfsSlug(snapshotId, "snap");
  const paddedRevision = String(Math.max(0, revision)).padStart(6, "0");
  const path = `timemachine/${projectSlug}/snapshot-${paddedRevision}-${snapshotSlug}.json`;
  if (!isValidStudioOpfsPath(path)) {
    throw new Error(`유효하지 않은 스냅샷 저장 경로입니다: ${path}`);
  }
  return path;
}

function parseRevisionFromFilename(path: string): number {
  const match = /snapshot-(\d+)-/u.exec(path);
  return match ? Number.parseInt(match[1] ?? "-1", 10) : -1;
}

export interface StudioOpfsSelfHealReport {
  readonly projectId: string;
  readonly diagnosedAtMs: number;
  readonly quota: StudioStorageQuotaDiagnosis;
  readonly timeline: StudioSnapshotTimelineReport;
  readonly cleanupPlan: StudioOpfsOrphanCleanupPlan;
}

export interface StudioOpfsSnapshotTimeMachineOptions {
  readonly fs: StudioOpfsFileSystem;
  readonly projectId: string;
  readonly maxSnapshots?: number;
  readonly now?: () => number;
}

export interface StudioOpfsSnapshotRecoveryResult {
  readonly recovered: boolean;
  readonly selfHealed: boolean;
  readonly snapshot: StudioManuscriptSnapshotRecord | null;
  readonly snapshotPath: string | null;
  readonly corruptedPaths: readonly string[];
  readonly timeline: StudioSnapshotTimelineReport;
}

export interface StudioOpfsSnapshotTimeMachine {
  readonly projectId: string;
  readonly projectPrefix: string;
  saveSnapshot(input: {
    readonly snapshotId: string;
    readonly revision: number;
    readonly label: string;
    readonly payload: string;
    readonly parentSnapshotId?: string | null;
    readonly createdAtMs?: number;
  }): Promise<{ readonly path: string; readonly record: StudioManuscriptSnapshotRecord }>;
  inspectTimeline(): Promise<StudioSnapshotTimelineReport>;
  recoverLastKnownGood(): Promise<StudioOpfsSnapshotRecoveryResult>;
  restoreSnapshotById(snapshotId: string): Promise<StudioManuscriptSnapshotRecord | null>;
  runSelfHealDiagnosis(options?: {
    readonly estimator?: StudioStorageQuotaEstimatorLike | null;
    readonly extraFiles?: readonly StudioOpfsFileEntry[];
    readonly activeManuscriptPaths?: ReadonlySet<string> | readonly string[];
    readonly minOrphanAgeMs?: number;
    readonly nowMs?: number;
  }): Promise<StudioOpfsSelfHealReport>;
}

/**
 * `StudioOpfsFileSystem`(실제 브라우저 OPFS 또는 테스트용 메모리 FS) 위에서 동작하는
 * 원고 스냅샷 타임머신 및 자가 치유 컨트롤러.
 */
export function createOpfsSnapshotTimeMachine(
  options: StudioOpfsSnapshotTimeMachineOptions,
): StudioOpfsSnapshotTimeMachine {
  const { fs, projectId } = options;
  const maxSnapshots = Math.max(2, options.maxSnapshots ?? STUDIO_SNAPSHOT_TIMEMACHINE_DEFAULT_LIMIT);
  const now = options.now ?? Date.now;
  const projectPrefix = `timemachine/${toSafeOpfsSlug(projectId, "proj")}/`;

  async function readTimelineItems(): Promise<StudioSnapshotTimelineInputItem[]> {
    const paths = await fs.list(projectPrefix);
    const snapshotPaths = paths.filter((path) => path.endsWith(".json"));
    const items: StudioSnapshotTimelineInputItem[] = [];

    for (const path of snapshotPaths) {
      const bytes = await fs.read(path);
      if (!bytes) continue;
      const fallbackRevision = parseRevisionFromFilename(path);
      const fallbackId = path.slice(projectPrefix.length).replace(/\.json$/u, "");
      try {
        const text = TEXT_DECODER.decode(bytes);
        const parsed: unknown = JSON.parse(text);
        items.push({
          path,
          record: parsed && typeof parsed === "object" ? (parsed as Partial<StudioManuscriptSnapshotRecord>) : null,
          fallbackId,
          fallbackRevision,
          fallbackByteLength: bytes.byteLength,
        });
      } catch {
        items.push({
          path,
          record: null,
          fallbackId,
          fallbackRevision,
          fallbackByteLength: bytes.byteLength,
          parseErrorKo: "OPFS 스냅샷 파일이 비정상 종료로 손상(JSON 파싱 실패)되었습니다.",
        });
      }
    }
    return items;
  }

  async function inspectTimeline(): Promise<StudioSnapshotTimelineReport> {
    const items = await readTimelineItems();
    return evaluateSnapshotTimeline(projectId, items);
  }

  async function saveSnapshot(input: {
    readonly snapshotId: string;
    readonly revision: number;
    readonly label: string;
    readonly payload: string;
    readonly parentSnapshotId?: string | null;
    readonly createdAtMs?: number;
  }): Promise<{ readonly path: string; readonly record: StudioManuscriptSnapshotRecord }> {
    const record = createVerifiedManuscriptSnapshot({
      snapshotId: input.snapshotId,
      projectId,
      revision: input.revision,
      label: input.label,
      payload: input.payload,
      parentSnapshotId: input.parentSnapshotId ?? null,
      createdAtMs: input.createdAtMs ?? now(),
    });
    const path = buildSnapshotOpfsPath(projectId, record.revision, record.snapshotId);
    const encoded = TEXT_ENCODER.encode(JSON.stringify(record));
    await fs.write(path, encoded);

    // 보존 한도 초과 시 최신 검증 스냅샷과 최근 maxSnapshots개는 유지하고 가장 오래된 것만 정리한다.
    const timeline = await inspectTimeline();
    if (timeline.entries.length > maxSnapshots) {
      const protectedSet = new Set<string>([path]);
      if (timeline.lastKnownGoodPath) protectedSet.add(timeline.lastKnownGoodPath);
      const staleEntries = timeline.entries.slice(maxSnapshots);
      for (const stale of staleEntries) {
        if (stale.path && !protectedSet.has(stale.path)) {
          await fs.remove(stale.path);
        }
      }
    }

    return { path, record };
  }

  async function recoverLastKnownGood(): Promise<StudioOpfsSnapshotRecoveryResult> {
    const timeline = await inspectTimeline();
    const corruptedPaths = timeline.entries
      .filter((entry) => !entry.integrity.valid && entry.path !== null)
      .map((entry) => entry.path as string);

    return {
      recovered: timeline.lastKnownGood !== null,
      selfHealed: timeline.selfHealed,
      snapshot: timeline.lastKnownGood,
      snapshotPath: timeline.lastKnownGoodPath,
      corruptedPaths,
      timeline,
    };
  }

  async function restoreSnapshotById(snapshotId: string): Promise<StudioManuscriptSnapshotRecord | null> {
    const timeline = await inspectTimeline();
    const matched = timeline.entries.find((entry) => entry.snapshotId === snapshotId);
    if (!matched || !matched.integrity.valid || !matched.record) return null;
    return matched.record;
  }

  async function runSelfHealDiagnosis(
    diagnosisOptions: {
      readonly estimator?: StudioStorageQuotaEstimatorLike | null;
      readonly extraFiles?: readonly StudioOpfsFileEntry[];
      readonly activeManuscriptPaths?: ReadonlySet<string> | readonly string[];
      readonly minOrphanAgeMs?: number;
      readonly nowMs?: number;
    } = {},
  ): Promise<StudioOpfsSelfHealReport> {
    const diagnosedAtMs = diagnosisOptions.nowMs ?? now();
    const [quota, timeline, allPaths] = await Promise.all([
      inspectBrowserStorageQuota(diagnosisOptions.estimator),
      inspectTimeline(),
      fs.list(""),
    ]);

    const fileEntries: StudioOpfsFileEntry[] = [];
    const seenPaths = new Set<string>();

    if (diagnosisOptions.extraFiles) {
      for (const extra of diagnosisOptions.extraFiles) {
        const normalized = normalizeRelativePath(extra.path);
        seenPaths.add(normalized);
        fileEntries.push(extra);
      }
    }

    const timelineCreatedAtByPath = new Map<string, number>();
    for (const entry of timeline.entries) {
      if (entry.path) timelineCreatedAtByPath.set(entry.path, entry.createdAtMs);
    }

    for (const path of allPaths) {
      const normalized = normalizeRelativePath(path);
      if (seenPaths.has(normalized)) continue;
      seenPaths.add(normalized);
      const byteLength = (await fs.size(path)) ?? 0;
      fileEntries.push({
        path: normalized,
        sizeBytes: byteLength,
        updatedAtMs: timelineCreatedAtByPath.get(normalized) ?? 0,
        projectId: normalized.startsWith(projectPrefix) ? projectId : undefined,
      });
    }

    const protectedSnapshotPaths = new Set<string>();
    for (const entry of timeline.entries) {
      if (entry.path && (entry.integrity.valid || entry.isLatest || entry.isRecoveryTarget)) {
        protectedSnapshotPaths.add(entry.path);
      }
    }

    const cleanupPlan = planOrphanTempCleanup(fileEntries, {
      activeManuscriptPaths: diagnosisOptions.activeManuscriptPaths,
      activeProjectIds: [projectId],
      protectedSnapshotPaths,
      minOrphanAgeMs: diagnosisOptions.minOrphanAgeMs,
      nowMs: diagnosedAtMs,
    });

    return {
      projectId,
      diagnosedAtMs,
      quota,
      timeline,
      cleanupPlan,
    };
  }

  return {
    projectId,
    projectPrefix,
    saveSnapshot,
    inspectTimeline,
    recoverLastKnownGood,
    restoreSnapshotById,
    runSelfHealDiagnosis,
  };
}
