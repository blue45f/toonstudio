/**
 * OPFS 저장 공간 용량 진단 및 고아 임시 파일 안전 정리 모듈.
 */

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

export function normalizeOpfsRelativePath(rawPath: string): string {
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
    const normalized = normalizeOpfsRelativePath(item);
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
    const normalized = normalizeOpfsRelativePath(entry.path);
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
    const normalized = normalizeOpfsRelativePath(entry.path);
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
