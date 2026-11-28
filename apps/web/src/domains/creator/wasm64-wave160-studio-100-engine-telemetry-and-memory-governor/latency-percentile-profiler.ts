/**
 * Wave 160 지연 백분위 프로파일러, 제로 초기 번들 불변성 감사기,
 * 로버스트 MAD 이상치 탐지기, 의존성 기반 프레임 예산 병렬 워밍업 플래너.
 */

import type {
  ColdStartOutlierFinding,
  ColdStartOutlierOptions,
  ColdStartOutlierReport,
  EagerBundleLeakRecord,
  FrameBudgetWarmupPlan,
  LatencyPercentileStats,
  MissingDependencyRef,
  StudioEnginePriorityTier,
  StudioEngineTelemetryEntry,
  WarmupPlanOptions,
  WarmupWaveSlice,
  ZeroEagerBundleAuditResult,
} from "./telemetry-governor-types";

const MAD_NORMAL_CONSISTENCY_CONSTANT = 0.6744897501960817;
const MEAN_AD_NORMAL_CONSISTENCY_CONSTANT = 1.2533141373155001;
const DEFAULT_FRAME_BUDGET_MS = 16.67;
const DEFAULT_MAX_WARMUP_CONCURRENCY = 4;
const DEFAULT_MODIFIED_Z_THRESHOLD = 3.5;
const DEFAULT_CRITICAL_MODIFIED_Z_THRESHOLD = 7.0;

const PRIORITY_TIER_ORDER: Readonly<Record<StudioEnginePriorityTier, number>> = {
  critical: 0,
  high: 1,
  standard: 2,
  background: 3,
};

function sanitizeNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function roundMetric(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

function interpolateSortedPercentile(
  sorted: readonly number[],
  percentile: number,
): number {
  const n = sorted.length;
  if (n === 0) {
    return 0;
  }
  if (n === 1) {
    return sorted[0] ?? 0;
  }
  const clampedP = Math.max(0, Math.min(100, percentile));
  const rank = (clampedP / 100) * (n - 1);
  const lowerIdx = Math.floor(rank);
  const upperIdx = Math.ceil(rank);
  const lowerVal = sorted[lowerIdx] ?? 0;
  const upperVal = sorted[upperIdx] ?? lowerVal;
  if (lowerIdx === upperIdx) {
    return lowerVal;
  }
  return lowerVal + (upperVal - lowerVal) * (rank - lowerIdx);
}

function computeExactMedian(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  return interpolateSortedPercentile(sorted, 50);
}

/**
 * 선형 보간(R-7) 기반 지연 백분위(min, p50, p90, p95, p99, max), 평균,
 * 모표준편차, 지터 변동계수(CV)를 정확히 계산한다.
 */
export function computeLatencyPercentiles(
  values: readonly number[],
): LatencyPercentileStats {
  const cleaned: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const raw = values[i];
    if (raw !== undefined && Number.isFinite(raw)) {
      cleaned.push(raw < 0 ? 0 : raw);
    }
  }

  const n = cleaned.length;
  if (n === 0) {
    return {
      sampleCount: 0,
      min: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      max: 0,
      mean: 0,
      stddev: 0,
      jitterCv: 0,
    };
  }

  cleaned.sort((a, b) => a - b);

  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += cleaned[i] ?? 0;
  }
  const mean = sum / n;

  let sqDiffSum = 0;
  for (let i = 0; i < n; i += 1) {
    const diff = (cleaned[i] ?? 0) - mean;
    sqDiffSum += diff * diff;
  }
  const stddev = Math.sqrt(sqDiffSum / n);
  const jitterCv = mean > 0 ? stddev / mean : 0;

  return {
    sampleCount: n,
    min: roundMetric(cleaned[0] ?? 0),
    p50: roundMetric(interpolateSortedPercentile(cleaned, 50)),
    p90: roundMetric(interpolateSortedPercentile(cleaned, 90)),
    p95: roundMetric(interpolateSortedPercentile(cleaned, 95)),
    p99: roundMetric(interpolateSortedPercentile(cleaned, 99)),
    max: roundMetric(cleaned[n - 1] ?? 0),
    mean: roundMetric(mean),
    stddev: roundMetric(stddev),
    jitterCv: roundMetric(jitterCv),
  };
}

/**
 * 초기 번들 누수 제로(0 B) 불변성 감사기.
 * eagerBundleBytes가 허용 상한(기본 0)을 초과한 엔진 ID와 누적 누수 바이트를 정확히 보고한다.
 */
export function auditZeroEagerBundleInvariant(
  entries: readonly StudioEngineTelemetryEntry[],
  maxAllowedBytes = 0,
): ZeroEagerBundleAuditResult {
  const allowed = sanitizeNonNegative(maxAllowedBytes);
  const offendingEntries: EagerBundleLeakRecord[] = [];
  let totalEagerLeakBytes = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry) {
      continue;
    }
    const eagerBytes = Math.round(sanitizeNonNegative(entry.eagerBundleBytes));
    totalEagerLeakBytes += eagerBytes;
    if (eagerBytes > allowed) {
      offendingEntries.push({
        engineId: entry.engineId,
        waveNumber: entry.waveNumber,
        eagerBundleBytes: eagerBytes,
      });
    }
  }

  offendingEntries.sort((a, b) => {
    if (b.eagerBundleBytes !== a.eagerBundleBytes) {
      return b.eagerBundleBytes - a.eagerBundleBytes;
    }
    return a.engineId.localeCompare(b.engineId);
  });

  const compliant =
    offendingEntries.length === 0 && totalEagerLeakBytes <= allowed;

  return {
    compliant,
    maxAllowedBytes: allowed,
    totalEngineCount: entries.length,
    leakingEngineCount: offendingEntries.length,
    totalEagerLeakBytes,
    totalEagerLeakKib: roundMetric(totalEagerLeakBytes / 1024, 3),
    offendingEngineIds: offendingEntries.map((item) => item.engineId),
    offendingEntries,
  };
}

/**
 * 중앙값 + MAD 기반 로버스트 수정 Z-점수(Iglewicz & Hoaglin) 콜드 스타트 이상치 탐지기.
 * - 꼬리 지연 스파이크(상향 회귀)만 탐지해 편향 없이 정상 엔진 오탐을 방지한다.
 * - MAD === 0 구간에서는 MeanAD 폴백을 적용하며 균일 분포(MeanAD === 0)는 0건으로 처리한다.
 */
export function detectColdStartOutliers(
  entries: readonly StudioEngineTelemetryEntry[],
  options?: ColdStartOutlierOptions,
): ColdStartOutlierReport {
  const thresholdModifiedZ =
    options?.thresholdModifiedZ !== undefined &&
    Number.isFinite(options.thresholdModifiedZ) &&
    options.thresholdModifiedZ > 0
      ? options.thresholdModifiedZ
      : DEFAULT_MODIFIED_Z_THRESHOLD;

  const criticalModifiedZ =
    options?.criticalModifiedZ !== undefined &&
    Number.isFinite(options.criticalModifiedZ) &&
    options.criticalModifiedZ >= thresholdModifiedZ
      ? options.criticalModifiedZ
      : Math.max(DEFAULT_CRITICAL_MODIFIED_Z_THRESHOLD, thresholdModifiedZ * 2);

  if (entries.length === 0) {
    return {
      medianMs: 0,
      madMs: 0,
      thresholdModifiedZ,
      criticalModifiedZ,
      zeroMadFallbackUsed: false,
      outliers: [],
    };
  }

  const coldStarts = entries.map((entry) => sanitizeNonNegative(entry.coldStartMs));
  const medianMs = computeExactMedian(coldStarts);

  const absDevs: number[] = [];
  let absDevSum = 0;
  for (let i = 0; i < coldStarts.length; i += 1) {
    const dev = Math.abs((coldStarts[i] ?? 0) - medianMs);
    absDevs.push(dev);
    absDevSum += dev;
  }

  const madMs = computeExactMedian(absDevs);
  const meanAbsDev = absDevSum / coldStarts.length;
  const zeroMadFallbackUsed = madMs === 0;

  const outliers: ColdStartOutlierFinding[] = [];
  if (madMs > 0 || meanAbsDev > 0) {
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (!entry) {
        continue;
      }
      const value = coldStarts[i] ?? 0;
      const signedDiff = value - medianMs;
      if (signedDiff <= 0) {
        continue;
      }

      const modifiedZ = zeroMadFallbackUsed
        ? signedDiff / (MEAN_AD_NORMAL_CONSISTENCY_CONSTANT * meanAbsDev)
        : (MAD_NORMAL_CONSISTENCY_CONSTANT * signedDiff) / madMs;

      if (modifiedZ >= thresholdModifiedZ) {
        outliers.push({
          engineId: entry.engineId,
          waveNumber: entry.waveNumber,
          coldStartMs: roundMetric(value),
          medianMs: roundMetric(medianMs),
          madMs: roundMetric(madMs),
          modifiedZScore: roundMetric(modifiedZ, 3),
          severity: modifiedZ >= criticalModifiedZ ? "critical" : "warn",
        });
      }
    }
  }

  outliers.sort((a, b) => {
    if (b.modifiedZScore !== a.modifiedZScore) {
      return b.modifiedZScore - a.modifiedZScore;
    }
    if (b.coldStartMs !== a.coldStartMs) {
      return b.coldStartMs - a.coldStartMs;
    }
    return a.engineId.localeCompare(b.engineId);
  });

  return {
    medianMs: roundMetric(medianMs),
    madMs: roundMetric(madMs),
    thresholdModifiedZ,
    criticalModifiedZ,
    zeroMadFallbackUsed,
    outliers,
  };
}

function compareReadyEntries(
  a: StudioEngineTelemetryEntry,
  b: StudioEngineTelemetryEntry,
): number {
  if (a.pinned !== b.pinned) {
    return a.pinned ? -1 : 1;
  }
  const tierDiff =
    PRIORITY_TIER_ORDER[a.priorityTier] - PRIORITY_TIER_ORDER[b.priorityTier];
  if (tierDiff !== 0) {
    return tierDiff;
  }
  if (a.waveNumber !== b.waveNumber) {
    return a.waveNumber - b.waveNumber;
  }
  const coldA = sanitizeNonNegative(a.coldStartMs);
  const coldB = sanitizeNonNegative(b.coldStartMs);
  if (coldA !== coldB) {
    return coldA - coldB;
  }
  return a.engineId.localeCompare(b.engineId);
}

/**
 * 남은 미스케줄 그래프에서 실제 순환(cycle) 참여 노드와 순환 때문에 차단된 하류 노드를 분리한다.
 */
function partitionCycleAndBlockedNodes(
  unscheduledIds: readonly string[],
  knownDepsByEngine: ReadonlyMap<string, readonly string[]>,
): {
  readonly cycleEngineIds: readonly string[];
  readonly blockedByCycleEngineIds: readonly string[];
} {
  if (unscheduledIds.length === 0) {
    return { cycleEngineIds: [], blockedByCycleEngineIds: [] };
  }

  const remaining = new Set<string>(unscheduledIds);
  const reverseDeps = new Map<string, Set<string>>();

  for (const id of remaining) {
    reverseDeps.set(id, new Set<string>());
  }
  for (const id of remaining) {
    const deps = knownDepsByEngine.get(id) ?? [];
    for (let i = 0; i < deps.length; i += 1) {
      const depId = deps[i];
      if (depId !== undefined && remaining.has(depId)) {
        const set = reverseDeps.get(depId);
        if (set) {
          set.add(id);
        }
      }
    }
  }

  // 남은 미스케줄 노드 중 다른 미스케줄 노드의 의존 대상이 아닌 리프(out-degree 0)를 반복 제거하면
  // 실제 순환 루프(또는 순환의 선행 노드)가 남는다. (자기 루프는 제외)
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of Array.from(remaining)) {
      const dependents = reverseDeps.get(id);
      if (!dependents || dependents.size === 0) {
        remaining.delete(id);
        const deps = knownDepsByEngine.get(id) ?? [];
        for (let i = 0; i < deps.length; i += 1) {
          const depId = deps[i];
          if (depId !== undefined) {
            reverseDeps.get(depId)?.delete(id);
          }
        }
        changed = true;
      }
    }
  }

  const cycleEngineIds = Array.from(remaining).sort((a, b) => a.localeCompare(b));
  const blockedByCycleEngineIds = unscheduledIds
    .filter((id) => !remaining.has(id))
    .sort((a, b) => a.localeCompare(b));

  return { cycleEngineIds, blockedByCycleEngineIds };
}

/**
 * 의존성 DAG 순서를 지키며 최대 동시성·프레임 예산(기본 16.67ms) 안에
 * 지연 로딩 엔진 워밍업 웨이브를 배치한다. 순환 의존성 그래프는 결정적으로 감지·보고한다.
 */
export function planFrameBudgetWarmupWaves(
  entries: readonly StudioEngineTelemetryEntry[],
  options?: WarmupPlanOptions,
): FrameBudgetWarmupPlan {
  const frameBudgetMs =
    options?.frameBudgetMs !== undefined &&
    Number.isFinite(options.frameBudgetMs) &&
    options.frameBudgetMs > 0
      ? options.frameBudgetMs
      : DEFAULT_FRAME_BUDGET_MS;

  const maxConcurrency =
    options?.maxConcurrency !== undefined &&
    Number.isFinite(options.maxConcurrency) &&
    options.maxConcurrency >= 1
      ? Math.floor(options.maxConcurrency)
      : DEFAULT_MAX_WARMUP_CONCURRENCY;

  const entryById = new Map<string, StudioEngineTelemetryEntry>();
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry && !entryById.has(entry.engineId)) {
      entryById.set(entry.engineId, entry);
    }
  }

  const inDegree = new Map<string, number>();
  const dependentsByDep = new Map<string, string[]>();
  const knownDepsByEngine = new Map<string, string[]>();
  const missingDependencyRefs: MissingDependencyRef[] = [];

  for (const [engineId, entry] of entryById) {
    const seenDeps = new Set<string>();
    const knownDeps: string[] = [];

    for (let i = 0; i < entry.dependencies.length; i += 1) {
      const depId = entry.dependencies[i];
      if (!depId || seenDeps.has(depId)) {
        continue;
      }
      seenDeps.add(depId);

      if (!entryById.has(depId)) {
        missingDependencyRefs.push({ engineId, missingDependencyId: depId });
        continue;
      }

      knownDeps.push(depId);
      const list = dependentsByDep.get(depId);
      if (list) {
        list.push(engineId);
      } else {
        dependentsByDep.set(depId, [engineId]);
      }
    }

    knownDepsByEngine.set(engineId, knownDeps);
    inDegree.set(engineId, knownDeps.length);
  }

  missingDependencyRefs.sort((a, b) => {
    const cmp = a.engineId.localeCompare(b.engineId);
    if (cmp !== 0) {
      return cmp;
    }
    return a.missingDependencyId.localeCompare(b.missingDependencyId);
  });

  const readyQueue: StudioEngineTelemetryEntry[] = [];
  for (const [engineId, deg] of inDegree) {
    if (deg === 0) {
      const entry = entryById.get(engineId);
      if (entry) {
        readyQueue.push(entry);
      }
    }
  }
  readyQueue.sort(compareReadyEntries);

  const waves: WarmupWaveSlice[] = [];
  const topologicalOrder: string[] = [];
  const scheduled = new Set<string>();
  let totalEstimatedMs = 0;

  while (readyQueue.length > 0) {
    let frameElapsedMs = 0;
    const frameEngineIds: string[] = [];
    const frameBatches: string[][] = [];
    let peakConcurrency = 0;
    let exceedsFrameBudget = false;

    while (readyQueue.length > 0) {
      const remainingBudgetMs = frameBudgetMs - frameElapsedMs;
      const batchEntries: StudioEngineTelemetryEntry[] = [];
      const keptReady: StudioEngineTelemetryEntry[] = [];

      for (let i = 0; i < readyQueue.length; i += 1) {
        const candidate = readyQueue[i];
        if (!candidate) {
          continue;
        }
        const costMs = sanitizeNonNegative(candidate.coldStartMs);
        if (
          batchEntries.length < maxConcurrency &&
          costMs <= remainingBudgetMs + 1e-9
        ) {
          batchEntries.push(candidate);
        } else {
          keptReady.push(candidate);
        }
      }

      if (batchEntries.length === 0) {
        if (frameEngineIds.length === 0) {
          // 단일 엔진의 콜드 스타트가 프레임 예산을 초과하는 경우 단독 프레임으로 진행
          const single = readyQueue.shift();
          if (single) {
            const singleCost = sanitizeNonNegative(single.coldStartMs);
            frameEngineIds.push(single.engineId);
            frameBatches.push([single.engineId]);
            peakConcurrency = 1;
            frameElapsedMs = singleCost;
            exceedsFrameBudget = singleCost > frameBudgetMs;
            scheduled.add(single.engineId);
            topologicalOrder.push(single.engineId);

            const unlocked = dependentsByDep.get(single.engineId) ?? [];
            for (let j = 0; j < unlocked.length; j += 1) {
              const depEngineId = unlocked[j];
              if (depEngineId === undefined) {
                continue;
              }
              const nextDeg = (inDegree.get(depEngineId) ?? 1) - 1;
              inDegree.set(depEngineId, nextDeg);
              if (nextDeg === 0) {
                const depEntry = entryById.get(depEngineId);
                if (depEntry) {
                  readyQueue.push(depEntry);
                }
              }
            }
            readyQueue.sort(compareReadyEntries);
          }
        }
        break;
      }

      readyQueue.length = 0;
      for (let i = 0; i < keptReady.length; i += 1) {
        const item = keptReady[i];
        if (item) {
          readyQueue.push(item);
        }
      }

      let batchCostMs = 0;
      const batchIds: string[] = [];
      for (let i = 0; i < batchEntries.length; i += 1) {
        const chosen = batchEntries[i];
        if (!chosen) {
          continue;
        }
        const costMs = sanitizeNonNegative(chosen.coldStartMs);
        if (costMs > batchCostMs) {
          batchCostMs = costMs;
        }
        batchIds.push(chosen.engineId);
        frameEngineIds.push(chosen.engineId);
        scheduled.add(chosen.engineId);
        topologicalOrder.push(chosen.engineId);
      }

      frameBatches.push(batchIds);
      if (batchIds.length > peakConcurrency) {
        peakConcurrency = batchIds.length;
      }
      frameElapsedMs += batchCostMs;

      for (let i = 0; i < batchIds.length; i += 1) {
        const completedId = batchIds[i];
        if (completedId === undefined) {
          continue;
        }
        const unlocked = dependentsByDep.get(completedId) ?? [];
        for (let j = 0; j < unlocked.length; j += 1) {
          const depEngineId = unlocked[j];
          if (depEngineId === undefined) {
            continue;
          }
          const nextDeg = (inDegree.get(depEngineId) ?? 1) - 1;
          inDegree.set(depEngineId, nextDeg);
          if (nextDeg === 0) {
            const depEntry = entryById.get(depEngineId);
            if (depEntry) {
              readyQueue.push(depEntry);
            }
          }
        }
      }
      readyQueue.sort(compareReadyEntries);
    }

    if (frameEngineIds.length > 0) {
      const roundedFrameMs = roundMetric(frameElapsedMs);
      totalEstimatedMs += roundedFrameMs;
      waves.push({
        frameIndex: waves.length,
        engineIds: frameEngineIds,
        batches: frameBatches,
        parallelBatchCount: frameBatches.length,
        peakConcurrency,
        estimatedFrameMs: roundedFrameMs,
        exceedsFrameBudget,
      });
    }
  }

  const unscheduledIds: string[] = [];
  for (const engineId of entryById.keys()) {
    if (!scheduled.has(engineId)) {
      unscheduledIds.push(engineId);
    }
  }
  const { cycleEngineIds, blockedByCycleEngineIds } =
    partitionCycleAndBlockedNodes(unscheduledIds, knownDepsByEngine);

  return {
    frameBudgetMs: roundMetric(frameBudgetMs),
    maxConcurrency,
    totalInputEngines: entryById.size,
    totalScheduledEngines: topologicalOrder.length,
    totalFrames: waves.length,
    totalEstimatedMs: roundMetric(totalEstimatedMs),
    waves,
    hasCycle: cycleEngineIds.length > 0,
    cycleEngineIds,
    blockedByCycleEngineIds,
    missingDependencyRefs,
    topologicalOrder,
  };
}
