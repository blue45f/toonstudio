/**
 * 오프라인 퍼스트 데이터 동기화 큐 멱등·순서 보장 코어.
 *
 * 네트워크 단절 중 OPFS/로컬 큐에 누적된 컷 변경 작업을 재접속 시점에:
 * 1. 인과 순서(causalSequence → revision → createdAtMs → opId)로 결정론적 정렬하고,
 * 2. 멱등 키(`idempotencyKey`) 기반 중복 제거(이미 반영된 키 포함) 및 키 충돌을 탐지하며,
 * 3. 동일 컷의 연속 변경을 최신 개정 우선으로 압축(compaction)하고,
 * 4. 삭제 후 수정(`modify-after-delete`) 충돌을 자동 덮어쓰기 없이 명시적으로 반환하며,
 * 5. 실패/거절 작업에 대해 지수 백오프 재시도 계획을 산출하는 순수 엔진이다.
 */

import {
  verifyOfflineSyncQueueConvergence,
  type OfflineMultideviceSyncVerificationReport,
} from "../creator-trust/offline-multidevice-sync-verifier";

export type OfflineSyncMutationKind = "upsert" | "patch" | "delete";

export type OfflineSyncScalarValue = string | number | boolean | null;

export type OfflineSyncPatchMap = Readonly<Record<string, OfflineSyncScalarValue>>;

export interface OfflineSyncQueueEntry {
  readonly opId: string;
  readonly idempotencyKey: string;
  readonly surface: string;
  readonly cutId: string;
  readonly kind: OfflineSyncMutationKind;
  readonly causalSequence: number;
  readonly revision?: number;
  readonly patch: OfflineSyncPatchMap;
  readonly actorId: string;
  readonly createdAtMs: number;
  readonly retryCount?: number;
  readonly maxRetries?: number;
  readonly nextRetryAtMs?: number;
  readonly lastError?: string;
}

export type OfflineSyncConflictCode =
  | "modify-after-delete"
  | "duplicate-idempotency-divergence";

export interface OfflineSyncQueueConflict {
  readonly conflictId: string;
  readonly code: OfflineSyncConflictCode;
  readonly surface: string;
  readonly cutId: string;
  readonly idempotencyKey: string;
  readonly deleteOpId?: string;
  readonly conflictingOpId: string;
  readonly deleteCausalSequence?: number;
  readonly conflictingCausalSequence: number;
  readonly conflictingFields: readonly string[];
  readonly resolutionRequired: "manual-restore-or-discard" | "inspect-duplicate-key";
  readonly messageKo: string;
}

export interface CompactedOfflineSyncOperation {
  readonly opId: string;
  readonly idempotencyKey: string;
  readonly surface: string;
  readonly cutId: string;
  readonly kind: OfflineSyncMutationKind;
  readonly causalSequence: number;
  readonly revision: number;
  readonly patch: OfflineSyncPatchMap;
  readonly actorId: string;
  readonly createdAtMs: number;
  readonly mergedOpIds: readonly string[];
  readonly mergedIdempotencyKeys: readonly string[];
  readonly compactedCount: number;
}

export interface OfflineSyncTombstone {
  readonly opId: string;
  readonly causalSequence: number;
}

export interface MergeOfflineSyncQueueOptions {
  /** 이미 서버에 반영이 확정된 멱등 키 집합(재접속 시 중복 전송 차단). */
  readonly acknowledgedIdempotencyKeys?: ReadonlySet<string>;
  /** 이미 삭제 확정된 컷 툼스톤 맵(키 형식: `${surface}::${cutId}`). */
  readonly deletedCutTombstones?: ReadonlyMap<string, OfflineSyncTombstone>;
  /** 삭제 후 전체 재작성(`upsert`)을 충돌 대신 허용할지 여부(기본 false: 보수적 충돌 반환). */
  readonly allowRecreateAfterDelete?: boolean;
}

export interface OfflineSyncQueueMergeResult {
  readonly inputCount: number;
  readonly deduplicatedCount: number;
  readonly compactedCount: number;
  readonly conflictCount: number;
  readonly operations: readonly CompactedOfflineSyncOperation[];
  readonly droppedDuplicateOpIds: readonly string[];
  readonly conflicts: readonly OfflineSyncQueueConflict[];
  readonly summaryKo: string;
}

export interface OfflineSyncRetryPolicy {
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly multiplier?: number;
  readonly maxRetries?: number;
  /** 0~0.5 범위의 결정론적 지터 비율(idempotencyKey FNV-1a 해시 기반, 기본 0). */
  readonly jitterRatio?: number;
}

export interface OfflineSyncRetryPlanEntry {
  readonly opId: string;
  readonly idempotencyKey: string;
  readonly surface: string;
  readonly cutId: string;
  readonly attempt: number;
  readonly maxRetries: number;
  readonly exhausted: boolean;
  readonly status: "retrying" | "failed";
  readonly delayMs: number;
  readonly nextRetryAtMs: number;
  readonly reason?: string;
}

export interface OfflineSyncRetrySchedule {
  readonly plannedAtMs: number;
  readonly retryingCount: number;
  readonly exhaustedCount: number;
  readonly earliestNextRetryAtMs: number | null;
  readonly entries: readonly OfflineSyncRetryPlanEntry[];
}

export const DEFAULT_OFFLINE_SYNC_RETRY_POLICY: Required<OfflineSyncRetryPolicy> = Object.freeze({
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  multiplier: 2,
  maxRetries: 4,
  jitterRatio: 0,
});

function compareAscii(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

export function offlineSyncCutKey(surface: string, cutId: string): string {
  return `${surface}::${cutId}`;
}

function effectiveRevision(entry: OfflineSyncQueueEntry): number {
  return typeof entry.revision === "number" && Number.isFinite(entry.revision)
    ? entry.revision
    : entry.causalSequence;
}

function canonicalPatchSignature(patch: OfflineSyncPatchMap): string {
  const keys = Object.keys(patch).sort(compareAscii);
  return JSON.stringify(keys.map((key) => [key, patch[key]]));
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 컷 변경 메타데이터로부터 결정론적 멱등 키를 생성한다. */
export function deriveOfflineSyncIdempotencyKey(input: {
  readonly surface: string;
  readonly cutId: string;
  readonly kind: OfflineSyncMutationKind;
  readonly causalSequence: number;
  readonly actorId: string;
  readonly patch: OfflineSyncPatchMap;
}): string {
  const digest = fnv1a32(
    `${input.surface}|${input.cutId}|${input.kind}|${input.causalSequence}|${input.actorId}|${canonicalPatchSignature(input.patch)}`,
  )
    .toString(16)
    .padStart(8, "0");
  return `idem:${input.surface}:${input.cutId}:${input.kind}:${input.causalSequence}:${digest}`;
}

function compareEntriesCausally(left: OfflineSyncQueueEntry, right: OfflineSyncQueueEntry): number {
  return (
    left.causalSequence - right.causalSequence ||
    effectiveRevision(left) - effectiveRevision(right) ||
    left.createdAtMs - right.createdAtMs ||
    compareAscii(left.opId, right.opId) ||
    compareAscii(left.idempotencyKey, right.idempotencyKey)
  );
}

function diffPatchFields(left: OfflineSyncPatchMap, right: OfflineSyncPatchMap): readonly string[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const differing: string[] = [];
  for (const key of keys) {
    if (left[key] !== right[key]) differing.push(key);
  }
  differing.sort(compareAscii);
  return Object.freeze(differing);
}

interface CutAccumulator {
  opId: string;
  idempotencyKey: string;
  surface: string;
  cutId: string;
  kind: OfflineSyncMutationKind;
  causalSequence: number;
  revision: number;
  patch: Record<string, OfflineSyncScalarValue>;
  actorId: string;
  createdAtMs: number;
  mergedOpIds: string[];
  mergedIdempotencyKeys: string[];
  compactedCount: number;
}

/**
 * 오프라인 단절 동안 누적된 OPFS 변경 큐를 인과 순서·멱등 키 기준으로
 * 중복 제거하고 동일 컷 최신 개정 우선 압축 및 삭제 후 수정 충돌을 명시 반환한다.
 */
export function mergeOfflineSyncQueue(
  entries: readonly OfflineSyncQueueEntry[],
  options: MergeOfflineSyncQueueOptions = {},
): OfflineSyncQueueMergeResult {
  const acknowledged = options.acknowledgedIdempotencyKeys;
  const tombstones = options.deletedCutTombstones;
  const allowRecreateAfterDelete = options.allowRecreateAfterDelete === true;

  const ordered = [...entries].sort(compareEntriesCausally);
  const seenByIdempotencyKey = new Map<
    string,
    {
      readonly opId: string;
      readonly surface: string;
      readonly cutId: string;
      readonly kind: OfflineSyncMutationKind;
      readonly patch: OfflineSyncPatchMap;
      readonly patchSig: string;
      readonly causalSequence: number;
    }
  >();

  const droppedDuplicateOpIds: string[] = [];
  const conflicts: OfflineSyncQueueConflict[] = [];
  const byCut = new Map<string, CutAccumulator>();
  let deduplicatedCount = 0;
  let compactedCount = 0;

  for (const entry of ordered) {
    const normalizedKey =
      entry.idempotencyKey.trim().length > 0
        ? entry.idempotencyKey.trim()
        : deriveOfflineSyncIdempotencyKey({
            surface: entry.surface,
            cutId: entry.cutId,
            kind: entry.kind,
            causalSequence: entry.causalSequence,
            actorId: entry.actorId,
            patch: entry.patch,
          });

    // 1. 이미 서버에 반영된 멱등 키는 재전송 없이 중복 제거한다.
    if (acknowledged?.has(normalizedKey)) {
      deduplicatedCount += 1;
      droppedDuplicateOpIds.push(entry.opId);
      continue;
    }

    // 2. 큐 내부의 동일 멱등 키 중복·변조 검사.
    const patchSig = canonicalPatchSignature(entry.patch);
    const previousSameKey = seenByIdempotencyKey.get(normalizedKey);
    if (previousSameKey) {
      const sameTargetAndPayload =
        previousSameKey.surface === entry.surface &&
        previousSameKey.cutId === entry.cutId &&
        previousSameKey.kind === entry.kind &&
        previousSameKey.patchSig === patchSig;

      if (sameTargetAndPayload) {
        deduplicatedCount += 1;
        droppedDuplicateOpIds.push(entry.opId);
        continue;
      }

      const conflictingFields = diffPatchFields(previousSameKey.patch, entry.patch);
      conflicts.push(
        Object.freeze({
          conflictId: `conf-idem-${entry.surface}-${entry.cutId}-${entry.causalSequence}-${conflicts.length + 1}`,
          code: "duplicate-idempotency-divergence",
          surface: entry.surface,
          cutId: entry.cutId,
          idempotencyKey: normalizedKey,
          conflictingOpId: entry.opId,
          conflictingCausalSequence: entry.causalSequence,
          conflictingFields,
          resolutionRequired: "inspect-duplicate-key",
          messageKo: `동일 멱등 키(${normalizedKey})가 서로 다른 변경 내용(${previousSameKey.opId} ↔ ${entry.opId})에 재사용되어 자동 반영을 보류했습니다.`,
        }),
      );
      continue;
    }

    seenByIdempotencyKey.set(normalizedKey, {
      opId: entry.opId,
      surface: entry.surface,
      cutId: entry.cutId,
      kind: entry.kind,
      patch: entry.patch,
      patchSig,
      causalSequence: entry.causalSequence,
    });

    const cutKey = offlineSyncCutKey(entry.surface, entry.cutId);
    const incomingRevision = effectiveRevision(entry);
    const existing = byCut.get(cutKey);

    // 3. 외부 삭제 툼스톤 이후의 수정 충돌 검사.
    const tombstone = tombstones?.get(cutKey);
    if (!existing && tombstone && entry.kind !== "delete") {
      if (!(allowRecreateAfterDelete && entry.kind === "upsert")) {
        const conflictingFields = Object.freeze(Object.keys(entry.patch).sort(compareAscii));
        conflicts.push(
          Object.freeze({
            conflictId: `conf-del-${entry.surface}-${entry.cutId}-${entry.causalSequence}-${conflicts.length + 1}`,
            code: "modify-after-delete",
            surface: entry.surface,
            cutId: entry.cutId,
            idempotencyKey: normalizedKey,
            deleteOpId: tombstone.opId,
            conflictingOpId: entry.opId,
            deleteCausalSequence: tombstone.causalSequence,
            conflictingCausalSequence: entry.causalSequence,
            conflictingFields,
            resolutionRequired: "manual-restore-or-discard",
            messageKo: `이미 삭제된 컷(${entry.cutId})에 대한 후속 수정(${entry.opId})이 감지되어 자동 병합을 보류했습니다.`,
          }),
        );
        continue;
      }
    }

    if (!existing) {
      byCut.set(cutKey, {
        opId: entry.opId,
        idempotencyKey: normalizedKey,
        surface: entry.surface,
        cutId: entry.cutId,
        kind: entry.kind,
        causalSequence: entry.causalSequence,
        revision: incomingRevision,
        patch: entry.kind === "delete" ? {} : { ...entry.patch },
        actorId: entry.actorId,
        createdAtMs: entry.createdAtMs,
        mergedOpIds: [entry.opId],
        mergedIdempotencyKeys: [normalizedKey],
        compactedCount: 0,
      });
      continue;
    }

    // 4. 동일 컷 삭제 후 수정 충돌 명시 반환.
    if (existing.kind === "delete" && entry.kind !== "delete") {
      if (!(allowRecreateAfterDelete && entry.kind === "upsert")) {
        const conflictingFields = Object.freeze(Object.keys(entry.patch).sort(compareAscii));
        conflicts.push(
          Object.freeze({
            conflictId: `conf-del-${entry.surface}-${entry.cutId}-${entry.causalSequence}-${conflicts.length + 1}`,
            code: "modify-after-delete",
            surface: entry.surface,
            cutId: entry.cutId,
            idempotencyKey: normalizedKey,
            deleteOpId: existing.opId,
            conflictingOpId: entry.opId,
            deleteCausalSequence: existing.causalSequence,
            conflictingCausalSequence: entry.causalSequence,
            conflictingFields,
            resolutionRequired: "manual-restore-or-discard",
            messageKo: `삭제된 컷(${entry.cutId}, ${existing.opId}) 이후 후속 수정(${entry.opId})이 도착해 삭제 후 수정 충돌로 보류했습니다.`,
          }),
        );
        continue;
      }

      // 명시적 재생성 허용 시 upsert로 전환
      existing.opId = entry.opId;
      existing.idempotencyKey = normalizedKey;
      existing.kind = "upsert";
      existing.causalSequence = entry.causalSequence;
      existing.revision = incomingRevision;
      existing.patch = { ...entry.patch };
      existing.actorId = entry.actorId;
      existing.createdAtMs = entry.createdAtMs;
      existing.mergedOpIds.push(entry.opId);
      existing.mergedIdempotencyKeys.push(normalizedKey);
      existing.compactedCount += 1;
      compactedCount += 1;
      continue;
    }

    // 5. 동일 컷 삭제 압축(이전 미동기화 수정·중복 삭제를 단일 삭제로 압축).
    if (entry.kind === "delete") {
      existing.opId = entry.opId;
      existing.idempotencyKey = normalizedKey;
      existing.kind = "delete";
      existing.causalSequence = entry.causalSequence;
      existing.revision = Math.max(existing.revision, incomingRevision);
      existing.patch = {};
      existing.actorId = entry.actorId;
      existing.createdAtMs = entry.createdAtMs;
      existing.mergedOpIds.push(entry.opId);
      existing.mergedIdempotencyKeys.push(normalizedKey);
      existing.compactedCount += 1;
      compactedCount += 1;
      continue;
    }

    // 6. 동일 컷 최신 개정 우선 압축(patch/upsert).
    if (incomingRevision >= existing.revision) {
      existing.patch =
        entry.kind === "upsert"
          ? { ...entry.patch }
          : { ...existing.patch, ...entry.patch };
      existing.kind = entry.kind === "upsert" ? "upsert" : existing.kind;
      existing.opId = entry.opId;
      existing.idempotencyKey = normalizedKey;
      existing.causalSequence = entry.causalSequence;
      existing.revision = incomingRevision;
      existing.actorId = entry.actorId;
      existing.createdAtMs = entry.createdAtMs;
    } else {
      // 지연 도착한 구 개정: 최신 개정 필드는 보존하고 누락 필드만 안전 보충
      existing.patch = { ...entry.patch, ...existing.patch };
    }
    existing.mergedOpIds.push(entry.opId);
    existing.mergedIdempotencyKeys.push(normalizedKey);
    existing.compactedCount += 1;
    compactedCount += 1;
  }

  const operations: CompactedOfflineSyncOperation[] = [...byCut.values()]
    .sort(
      (left, right) =>
        left.causalSequence - right.causalSequence ||
        left.revision - right.revision ||
        left.createdAtMs - right.createdAtMs ||
        compareAscii(left.opId, right.opId),
    )
    .map((acc) =>
      Object.freeze({
        opId: acc.opId,
        idempotencyKey: acc.idempotencyKey,
        surface: acc.surface,
        cutId: acc.cutId,
        kind: acc.kind,
        causalSequence: acc.causalSequence,
        revision: acc.revision,
        patch: Object.freeze({ ...acc.patch }),
        actorId: acc.actorId,
        createdAtMs: acc.createdAtMs,
        mergedOpIds: Object.freeze([...acc.mergedOpIds]),
        mergedIdempotencyKeys: Object.freeze([...acc.mergedIdempotencyKeys]),
        compactedCount: acc.compactedCount,
      }),
    );

  const summaryKo = `오프라인 큐 병합 완료: 입력 ${entries.length}건 → 전송 ${operations.length}건 (중복 제거 ${deduplicatedCount}건 · 최신 개정 압축 ${compactedCount}건 · 충돌 보류 ${conflicts.length}건)`;

  return Object.freeze({
    inputCount: entries.length,
    deduplicatedCount,
    compactedCount,
    conflictCount: conflicts.length,
    operations: Object.freeze(operations),
    droppedDuplicateOpIds: Object.freeze(droppedDuplicateOpIds),
    conflicts: Object.freeze(conflicts),
    summaryKo,
  });
}

/**
 * 지수 백오프 대기 시간(ms)을 계산한다.
 * `jitterRatio === 0`일 때는 결정론적 순수 지수 백오프(`min(maxDelayMs, base * multiplier^retryCount)`)를 반환하며,
 * `jitterRatio > 0`이고 `idempotencyKey`가 주어지면 `Math.random` 없이 FNV-1a 해시 기반 대칭 지터를 적용한다.
 */
export function computeOfflineSyncRetryDelayMs(
  retryCount: number,
  policy: OfflineSyncRetryPolicy = {},
  idempotencyKey?: string,
): number {
  const baseDelayMs = Math.max(0, policy.baseDelayMs ?? DEFAULT_OFFLINE_SYNC_RETRY_POLICY.baseDelayMs);
  const maxDelayMs = Math.max(baseDelayMs, policy.maxDelayMs ?? DEFAULT_OFFLINE_SYNC_RETRY_POLICY.maxDelayMs);
  const multiplier = Math.max(1, policy.multiplier ?? DEFAULT_OFFLINE_SYNC_RETRY_POLICY.multiplier);
  const jitterRatio = Math.min(0.5, Math.max(0, policy.jitterRatio ?? DEFAULT_OFFLINE_SYNC_RETRY_POLICY.jitterRatio));
  const safeRetryCount = Number.isFinite(retryCount) ? Math.max(0, Math.floor(retryCount)) : 0;

  const rawDelay = Math.min(maxDelayMs, Math.round(baseDelayMs * multiplier ** safeRetryCount));
  if (jitterRatio === 0 || !idempotencyKey) return rawDelay;

  const hashUnit = fnv1a32(`${idempotencyKey}#${safeRetryCount}`) / 0xffffffff;
  const factor = 1 + (hashUnit * 2 - 1) * jitterRatio;
  return Math.min(maxDelayMs, Math.max(0, Math.round(rawDelay * factor)));
}

/**
 * 실패·거절된 오프라인 동기화 작업 목록에 대해 지수 백오프 재시도 계획을 산출한다.
 */
export function planOfflineSyncRetrySchedule(
  failedEntries: readonly Pick<
    OfflineSyncQueueEntry,
    "opId" | "idempotencyKey" | "surface" | "cutId" | "retryCount" | "maxRetries" | "lastError"
  >[],
  options: {
    readonly nowMs: number;
    readonly policy?: OfflineSyncRetryPolicy;
    readonly failureReasons?: ReadonlyMap<string, string>;
  },
): OfflineSyncRetrySchedule {
  const policy = options.policy ?? {};
  const defaultMaxRetries = Math.max(1, Math.floor(policy.maxRetries ?? DEFAULT_OFFLINE_SYNC_RETRY_POLICY.maxRetries));
  const plannedAtMs = Number.isFinite(options.nowMs) ? options.nowMs : 0;

  let retryingCount = 0;
  let exhaustedCount = 0;
  let earliestNextRetryAtMs: number | null = null;

  const planned: OfflineSyncRetryPlanEntry[] = failedEntries.map((entry) => {
    const currentRetry = Math.max(0, Math.floor(entry.retryCount ?? 0));
    const maxRetries = Math.max(1, Math.floor(entry.maxRetries ?? defaultMaxRetries));
    const nextAttempt = currentRetry + 1;
    const exhausted = nextAttempt >= maxRetries;
    const delayMs = computeOfflineSyncRetryDelayMs(nextAttempt, policy, entry.idempotencyKey);
    const nextRetryAtMs = plannedAtMs + delayMs;
    const reason = options.failureReasons?.get(entry.opId) ?? entry.lastError;

    if (exhausted) {
      exhaustedCount += 1;
    } else {
      retryingCount += 1;
      earliestNextRetryAtMs =
        earliestNextRetryAtMs === null ? nextRetryAtMs : Math.min(earliestNextRetryAtMs, nextRetryAtMs);
    }

    return Object.freeze({
      opId: entry.opId,
      idempotencyKey: entry.idempotencyKey,
      surface: entry.surface,
      cutId: entry.cutId,
      attempt: nextAttempt,
      maxRetries,
      exhausted,
      status: exhausted ? ("failed" as const) : ("retrying" as const),
      delayMs,
      nextRetryAtMs,
      ...(reason !== undefined ? { reason } : {}),
    });
  });

  planned.sort(
    (left, right) =>
      Number(left.exhausted) - Number(right.exhausted) ||
      left.nextRetryAtMs - right.nextRetryAtMs ||
      compareAscii(left.opId, right.opId),
  );

  return Object.freeze({
    plannedAtMs,
    retryingCount,
    exhaustedCount,
    earliestNextRetryAtMs,
    entries: Object.freeze(planned),
  });
}

/**
 * 오프라인 동기화 큐 항목들을 기기(`actorId`)별 CRDT/벡터 클록 세션으로 검증해
 * 6종 도착 순열 및 중복 재전송에서의 무손실·결정적 수렴을 확인한다.
 */
export function verifyOfflineSyncQueueMultideviceConvergence(
  entries: readonly OfflineSyncQueueEntry[],
): OfflineMultideviceSyncVerificationReport {
  return verifyOfflineSyncQueueConvergence(entries);
}
