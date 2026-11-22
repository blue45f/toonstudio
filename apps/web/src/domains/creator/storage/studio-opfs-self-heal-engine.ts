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
import {
  diagnoseStorageQuota,
  executeOrphanTempCleanup,
  formatStorageBytes,
  inspectBrowserStorageQuota,
  normalizeOpfsRelativePath,
  planOrphanTempCleanup,
  STUDIO_OPFS_ORPHAN_GRACE_WINDOW_MS,
  STUDIO_OPFS_SELF_HEAL_ROOT_NAME,
  STUDIO_SNAPSHOT_TIMEMACHINE_DEFAULT_LIMIT,
  STUDIO_SNAPSHOT_TIMEMACHINE_SCHEMA,
  STUDIO_STORAGE_QUOTA_CRITICAL_RATIO,
  STUDIO_STORAGE_QUOTA_WARNING_RATIO,
  type StudioOpfsCleanupDecision,
  type StudioOpfsCleanupPlanItem,
  type StudioOpfsCleanupProtectionSet,
  type StudioOpfsFileEntry,
  type StudioOpfsOrphanCleanupExecutionResult,
  type StudioOpfsOrphanCleanupPlan,
  type StudioStorageQuotaDiagnosis,
  type StudioStorageQuotaEstimatorLike,
  type StudioStorageQuotaGrade,
  type StudioStorageQuotaInput,
} from "./studio-opfs-quota-cleanup";

export {
  diagnoseStorageQuota,
  executeOrphanTempCleanup,
  formatStorageBytes,
  inspectBrowserStorageQuota,
  planOrphanTempCleanup,
  STUDIO_OPFS_ORPHAN_GRACE_WINDOW_MS,
  STUDIO_OPFS_SELF_HEAL_ROOT_NAME,
  STUDIO_SNAPSHOT_TIMEMACHINE_DEFAULT_LIMIT,
  STUDIO_SNAPSHOT_TIMEMACHINE_SCHEMA,
  STUDIO_STORAGE_QUOTA_CRITICAL_RATIO,
  STUDIO_STORAGE_QUOTA_WARNING_RATIO,
};

export type {
  StudioOpfsCleanupDecision,
  StudioOpfsCleanupPlanItem,
  StudioOpfsCleanupProtectionSet,
  StudioOpfsFileEntry,
  StudioOpfsOrphanCleanupExecutionResult,
  StudioOpfsOrphanCleanupPlan,
  StudioStorageQuotaDiagnosis,
  StudioStorageQuotaEstimatorLike,
  StudioStorageQuotaGrade,
  StudioStorageQuotaInput,
};

const SHA256_HEX_RE = /^[a-f0-9]{64}$/u;
const SAFE_SEGMENT_RE = /[^a-z0-9._-]+/gu;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

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
        const normalized = normalizeOpfsRelativePath(extra.path);
        seenPaths.add(normalized);
        fileEntries.push(extra);
      }
    }

    const timelineCreatedAtByPath = new Map<string, number>();
    for (const entry of timeline.entries) {
      if (entry.path) timelineCreatedAtByPath.set(entry.path, entry.createdAtMs);
    }

    for (const path of allPaths) {
      const normalized = normalizeOpfsRelativePath(path);
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
