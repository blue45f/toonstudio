/**
 * Wave 158 — OPFS/SQLite 스토리지 할당량(Quota) 압박 분석기 및
 * 미동기화 원고 보호(Dirty-Safe) 가비지 컬렉션 플래너.
 *
 * - `unsyncedDirty === true` 또는 `pinnedActive === true`(활성 세션·미동기화 원고 DB·활성 WAL)
 *   항목은 할당량 98% 이상 비상 상황에서도 절대 삭제 대상으로 올리지 않는다.
 * - 회수 가능 항목은 `orphan_wal_chunk` → `expired_render_cache` → `synced_cold_snapshot`
 *   → `synced_preview_tile` 우선순위와 오래된 접근 시각(LRU) 순으로 정렬해 목표 여유 비율을
 *   되찾는 시점에 즉시 중단한다.
 */

import type {
  OpfsEvictionPlan,
  OpfsQuotaGcInput,
  OpfsQuotaPolicy,
  OpfsStorageBucketKind,
  OpfsStorageEntry,
  QuotaPressureTier,
} from "./wal-recovery-types";

/** 기본 OPFS/SQLite 할당량 가비지 컬렉션 정책. */
export const DEFAULT_OPFS_QUOTA_POLICY: OpfsQuotaPolicy = {
  elevatedThresholdRatio: 0.7,
  criticalThresholdRatio: 0.85,
  emergencyThresholdRatio: 0.95,
  targetFreeRatio: 0.3,
  dirtyUnsyncedWarningRatio: 0.5,
  bucketEvictionOrder: [
    "orphan_wal_chunk",
    "expired_render_cache",
    "synced_cold_snapshot",
    "synced_preview_tile",
  ],
};

const ALL_BUCKET_KINDS: readonly OpfsStorageBucketKind[] = [
  "orphan_wal_chunk",
  "expired_render_cache",
  "synced_cold_snapshot",
  "synced_preview_tile",
  "active_wal_segment",
  "unsynced_episode_db",
];

function resolveQuotaPolicy(partial?: Partial<OpfsQuotaPolicy>): OpfsQuotaPolicy {
  return {
    elevatedThresholdRatio:
      partial?.elevatedThresholdRatio ?? DEFAULT_OPFS_QUOTA_POLICY.elevatedThresholdRatio,
    criticalThresholdRatio:
      partial?.criticalThresholdRatio ?? DEFAULT_OPFS_QUOTA_POLICY.criticalThresholdRatio,
    emergencyThresholdRatio:
      partial?.emergencyThresholdRatio ?? DEFAULT_OPFS_QUOTA_POLICY.emergencyThresholdRatio,
    targetFreeRatio:
      partial?.targetFreeRatio ?? DEFAULT_OPFS_QUOTA_POLICY.targetFreeRatio,
    dirtyUnsyncedWarningRatio:
      partial?.dirtyUnsyncedWarningRatio ?? DEFAULT_OPFS_QUOTA_POLICY.dirtyUnsyncedWarningRatio,
    bucketEvictionOrder:
      partial?.bucketEvictionOrder ?? DEFAULT_OPFS_QUOTA_POLICY.bucketEvictionOrder,
  };
}

function createEmptyBucketBreakdown(): Record<OpfsStorageBucketKind, number> {
  return {
    orphan_wal_chunk: 0,
    expired_render_cache: 0,
    synced_cold_snapshot: 0,
    synced_preview_tile: 0,
    active_wal_segment: 0,
    unsynced_episode_db: 0,
  };
}

function summarizeBuckets(
  entries: readonly OpfsStorageEntry[]
): Readonly<Record<OpfsStorageBucketKind, number>> {
  const totals = createEmptyBucketBreakdown();
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const safeBytes = Math.max(0, Math.floor(entry.bytes));
    totals[entry.bucket] += safeBytes;
  }
  return totals;
}

/** 할당량 사용률(0~1+)을 4단계 압박 등급으로 분류한다. */
export function classifyQuotaPressureTier(
  utilizationRatio: number,
  policy?: Partial<OpfsQuotaPolicy>
): QuotaPressureTier {
  const resolved = resolveQuotaPolicy(policy);
  if (utilizationRatio >= resolved.emergencyThresholdRatio) {
    return "emergency";
  }
  if (utilizationRatio >= resolved.criticalThresholdRatio) {
    return "critical";
  }
  if (utilizationRatio >= resolved.elevatedThresholdRatio) {
    return "elevated";
  }
  return "healthy";
}

/**
 * 삭제 금지 보호 대상(미동기화 원고·활성 세션 고정 항목·활성 WAL/DB) 여부를 판정한다.
 */
export function isProtectedOpfsEntry(entry: OpfsStorageEntry): boolean {
  if (entry.unsyncedDirty || entry.pinnedActive) {
    return true;
  }
  if (entry.bucket === "unsynced_episode_db" || entry.bucket === "active_wal_segment") {
    return true;
  }
  return false;
}

function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 100) {
    return `${Math.round(mb).toLocaleString("en-US")} MB`;
  }
  return `${mb.toFixed(1)} MB`;
}

/**
 * OPFS/SQLite 로컬 스토리지 압박도를 분석하고 미동기화 원고를 100% 보호하면서
 * 목표 여유 비율을 되찾는 결정론적 회수 계획을 산출한다.
 */
export function planOpfsQuotaGarbageCollection(input: OpfsQuotaGcInput): OpfsEvictionPlan {
  const quotaBytes = Math.max(1, Math.floor(input.quotaBytes));
  const policy = resolveQuotaPolicy(input.policy);
  const clampedTargetFreeRatio = Math.max(0, Math.min(0.95, policy.targetFreeRatio));

  const priorityMap = new Map<OpfsStorageBucketKind, number>();
  for (let i = 0; i < policy.bucketEvictionOrder.length; i += 1) {
    priorityMap.set(policy.bucketEvictionOrder[i], i);
  }

  const protectedEntries: OpfsStorageEntry[] = [];
  const reclaimableCandidates: OpfsStorageEntry[] = [];
  let usedBytesBefore = 0;
  let protectedDirtyBytes = 0;
  let protectedActiveBytes = 0;
  let reclaimableTotalBytes = 0;

  for (let i = 0; i < input.entries.length; i += 1) {
    const entry = input.entries[i];
    const safeBytes = Math.max(0, Math.floor(entry.bytes));
    usedBytesBefore += safeBytes;

    const isDirty = entry.unsyncedDirty || entry.bucket === "unsynced_episode_db";
    const isActive = entry.pinnedActive || entry.bucket === "active_wal_segment";
    if (isDirty) {
      protectedDirtyBytes += safeBytes;
    }
    if (isActive) {
      protectedActiveBytes += safeBytes;
    }

    const evictPriority = priorityMap.get(entry.bucket);
    if (isProtectedOpfsEntry(entry) || evictPriority === undefined) {
      protectedEntries.push(entry);
    } else {
      reclaimableCandidates.push(entry);
      reclaimableTotalBytes += safeBytes;
    }
  }

  const freeBytesBefore = Math.max(0, quotaBytes - usedBytesBefore);
  const utilizationBefore = usedBytesBefore / quotaBytes;
  const pressureTierBefore = classifyQuotaPressureTier(utilizationBefore, policy);
  const targetUsedBytes = Math.floor(quotaBytes * (1 - clampedTargetFreeRatio));
  const bytesNeededToReclaim = Math.max(0, usedBytesBefore - targetUsedBytes);

  reclaimableCandidates.sort((a, b) => {
    const rankA = priorityMap.get(a.bucket) ?? ALL_BUCKET_KINDS.length;
    const rankB = priorityMap.get(b.bucket) ?? ALL_BUCKET_KINDS.length;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    if (a.lastAccessedMs !== b.lastAccessedMs) {
      return a.lastAccessedMs - b.lastAccessedMs;
    }
    if (a.bytes !== b.bytes) {
      return b.bytes - a.bytes;
    }
    return a.id.localeCompare(b.id);
  });

  const evictEntries: OpfsStorageEntry[] = [];
  const keptReclaimable: OpfsStorageEntry[] = [];
  let plannedReclaimBytes = 0;

  for (let i = 0; i < reclaimableCandidates.length; i += 1) {
    const candidate = reclaimableCandidates[i];
    if (plannedReclaimBytes < bytesNeededToReclaim) {
      evictEntries.push(candidate);
      plannedReclaimBytes += Math.max(0, Math.floor(candidate.bytes));
    } else {
      keptReclaimable.push(candidate);
    }
  }

  const keptEntries: OpfsStorageEntry[] = [...protectedEntries, ...keptReclaimable];
  const usedBytesAfter = Math.max(0, usedBytesBefore - plannedReclaimBytes);
  const freeBytesAfter = Math.max(0, quotaBytes - usedBytesAfter);
  const utilizationAfter = usedBytesAfter / quotaBytes;
  const pressureTierAfter = classifyQuotaPressureTier(utilizationAfter, policy);
  const shortfallBytes = Math.max(0, bytesNeededToReclaim - plannedReclaimBytes);
  const targetHeadroomMet = shortfallBytes === 0;
  const dirtyBlocksHeadroom = !targetHeadroomMet && protectedDirtyBytes > 0;

  const warningsKo: string[] = [];
  const operatorActionsKo: string[] = [];

  const dirtyRatio = protectedDirtyBytes / quotaBytes;
  if (dirtyRatio >= policy.dirtyUnsyncedWarningRatio) {
    warningsKo.push(
      `미동기화 로컬 원고(${formatMegabytes(protectedDirtyBytes)}, 전체 할당량의 ${Math.round(dirtyRatio * 100)}%)가 안전 기준치를 넘었습니다.`
    );
    operatorActionsKo.push(
      "작업 중인 회차를 클라우드에 동기화하거나 로컬 백업 아카이브(.tstudio)로 내보내 여유 공간을 확보하세요."
    );
  }

  if (dirtyBlocksHeadroom) {
    warningsKo.push(
      `회수 가능한 캐시를 모두 비워도 ${formatMegabytes(shortfallBytes)}가 부족합니다. 미동기화 원고와 활성 세션 파일은 자동 삭제하지 않았습니다.`
    );
    operatorActionsKo.push(
      "네트워크 연결 후 미동기화 회차를 동기화하면 해당 로컬 스냅샷을 안전하게 정리할 수 있습니다."
    );
  } else if (!targetHeadroomMet) {
    warningsKo.push(
      `활성 세션 고정 데이터 때문에 목표 여유 공간까지 ${formatMegabytes(shortfallBytes)}가 모자랍니다.`
    );
    operatorActionsKo.push(
      "열려 있는 다른 회차 탭을 닫아 활성 고정을 해제한 뒤 스토리지 정리를 다시 실행하세요."
    );
  }

  if (pressureTierAfter === "critical" || pressureTierAfter === "emergency") {
    operatorActionsKo.push(
      "브라우저 저장 공간이 매우 빠듯합니다. 대용량 브러시 저장 전 외장 드라이브 사본을 먼저 남겨 두세요."
    );
  } else if (evictEntries.length > 0 && targetHeadroomMet) {
    operatorActionsKo.push(
      `고아 WAL·만료 캐시 ${String(evictEntries.length)}건(${formatMegabytes(plannedReclaimBytes)})을 정리해 목표 여유 공간을 확보할 수 있습니다.`
    );
  }

  return {
    quotaBytes,
    usedBytesBefore,
    usedBytesAfter,
    freeBytesBefore,
    freeBytesAfter,
    utilizationBefore,
    utilizationAfter,
    pressureTierBefore,
    pressureTierAfter,
    targetUsedBytes,
    targetFreeRatio: clampedTargetFreeRatio,
    bytesNeededToReclaim,
    reclaimableTotalBytes,
    plannedReclaimBytes,
    shortfallBytes,
    protectedDirtyBytes,
    protectedActiveBytes,
    evictEntries,
    keptEntries,
    protectedEntries,
    targetHeadroomMet,
    dirtyBlocksHeadroom,
    warningsKo,
    operatorActionsKo,
    bucketBreakdownBefore: summarizeBuckets(input.entries),
    bucketBreakdownAfter: summarizeBuckets(keptEntries),
  };
}
