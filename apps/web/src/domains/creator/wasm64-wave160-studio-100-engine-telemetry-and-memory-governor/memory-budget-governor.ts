/**
 * Wave 160 듀얼 풀(WASM64 Heap + WebGPU VRAM) 메모리 예산 거버너.
 * - 4개 기기 등급(`mobile-4gb`, `tablet-8gb`, `desktop-16gb`, `workstation-32gb`) 프리셋 해석
 * - `pinned: true` 및 `priorityTier === 'critical'` 엔진 100% 보호 불변식
 * - 단계적 비파괴 강등(`evict-vram-cache` -> `demote-wasm-snapshot` -> `unload-cold-module`)
 * - 보호 엔진만으로 예산 초과 시 OOM 불가 상태(`cannotSatisfyBudget: true`)와 한글 복구 권고 출력
 */

import type {
  DeviceMemoryBudgetPreset,
  DeviceMemoryTier,
  DualPoolGovernanceOptions,
  DualPoolMemoryGovernancePlan,
  DualPoolSnapshot,
  MemoryGovernanceAction,
  MemoryGovernanceActionKind,
  MemoryPressureLevel,
  StudioEnginePriorityTier,
  StudioEngineTelemetryEntry,
} from "./telemetry-governor-types";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const DEFAULT_TARGET_UTILIZATION_RATIO = 0.75;
const DEFAULT_WARNING_UTILIZATION_RATIO = 0.8;
const DEFAULT_EMERGENCY_UTILIZATION_RATIO = 0.95;
const VRAM_CACHE_RECLAIM_FRACTION = 0.75;
const WASM_SNAPSHOT_RECLAIM_FRACTION = 0.65;

const EVICTION_TIER_WEIGHT: Readonly<Record<StudioEnginePriorityTier, number>> = {
  critical: 0,
  high: 0.65,
  standard: 1.0,
  background: 1.45,
};

const DEVICE_MEMORY_BUDGET_PRESETS: Readonly<
  Record<DeviceMemoryTier, DeviceMemoryBudgetPreset>
> = {
  "mobile-4gb": {
    deviceTier: "mobile-4gb",
    labelKo: "모바일 4GB",
    totalDeviceRamBytes: 4 * GIB,
    wasmHeapBudgetBytes: 384 * MIB,
    vramBudgetBytes: 256 * MIB,
    targetUtilizationRatio: DEFAULT_TARGET_UTILIZATION_RATIO,
    warningUtilizationRatio: DEFAULT_WARNING_UTILIZATION_RATIO,
    emergencyUtilizationRatio: DEFAULT_EMERGENCY_UTILIZATION_RATIO,
    maxWarmupConcurrency: 2,
    frameBudgetMs: 16.67,
  },
  "tablet-8gb": {
    deviceTier: "tablet-8gb",
    labelKo: "태블릿 8GB",
    totalDeviceRamBytes: 8 * GIB,
    wasmHeapBudgetBytes: 1024 * MIB,
    vramBudgetBytes: 768 * MIB,
    targetUtilizationRatio: DEFAULT_TARGET_UTILIZATION_RATIO,
    warningUtilizationRatio: DEFAULT_WARNING_UTILIZATION_RATIO,
    emergencyUtilizationRatio: DEFAULT_EMERGENCY_UTILIZATION_RATIO,
    maxWarmupConcurrency: 4,
    frameBudgetMs: 16.67,
  },
  "desktop-16gb": {
    deviceTier: "desktop-16gb",
    labelKo: "데스크톱 16GB",
    totalDeviceRamBytes: 16 * GIB,
    wasmHeapBudgetBytes: 2048 * MIB,
    vramBudgetBytes: 2048 * MIB,
    targetUtilizationRatio: DEFAULT_TARGET_UTILIZATION_RATIO,
    warningUtilizationRatio: DEFAULT_WARNING_UTILIZATION_RATIO,
    emergencyUtilizationRatio: DEFAULT_EMERGENCY_UTILIZATION_RATIO,
    maxWarmupConcurrency: 6,
    frameBudgetMs: 16.67,
  },
  "workstation-32gb": {
    deviceTier: "workstation-32gb",
    labelKo: "워크스테이션 32GB",
    totalDeviceRamBytes: 32 * GIB,
    wasmHeapBudgetBytes: 4096 * MIB,
    vramBudgetBytes: 4096 * MIB,
    targetUtilizationRatio: DEFAULT_TARGET_UTILIZATION_RATIO,
    warningUtilizationRatio: DEFAULT_WARNING_UTILIZATION_RATIO,
    emergencyUtilizationRatio: DEFAULT_EMERGENCY_UTILIZATION_RATIO,
    maxWarmupConcurrency: 8,
    frameBudgetMs: 16.67,
  },
};

export interface DeviceBudgetOverrides {
  readonly targetUtilizationRatio?: number;
  readonly warningUtilizationRatio?: number;
  readonly emergencyUtilizationRatio?: number;
  readonly wasmHeapBudgetBytesOverride?: number;
  readonly vramBudgetBytesOverride?: number;
}

interface MutableEngineResidency {
  readonly entry: StudioEngineTelemetryEntry;
  readonly protected: boolean;
  wasmHeapBytes: number;
  vramBytes: number;
  vramCacheEvicted: boolean;
  wasmSnapshotDemoted: boolean;
  unloaded: boolean;
}

interface ScoredCandidate {
  readonly state: MutableEngineResidency;
  readonly action: MemoryGovernanceActionKind;
  readonly reclaimWasmBytes: number;
  readonly reclaimVramBytes: number;
  readonly effectiveReclaimBytes: number;
  readonly stalenessMs: number;
  readonly reloadPenaltyMs: number;
  readonly score: number;
}

function sanitizeBytes(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value);
}

function sanitizeMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function clampRatio(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0.05, Math.min(1, value));
}

function roundRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 10000) / 10000;
}

function formatMib(bytes: number): string {
  const mib = bytes / MIB;
  return `${mib.toFixed(1)} MiB`;
}

function classifyMemoryPressure(
  wasmRatio: number,
  vramRatio: number,
  targetRatio: number,
  warningRatio: number,
  emergencyRatio: number,
): MemoryPressureLevel {
  const peak = Math.max(wasmRatio, vramRatio);
  if (peak >= emergencyRatio) {
    return "emergency";
  }
  if (peak >= warningRatio) {
    return "warning";
  }
  if (peak > targetRatio) {
    return "elevated";
  }
  return "healthy";
}

function buildDualPoolSnapshot(
  wasmHeapBytes: number,
  vramBytes: number,
  budget: DeviceMemoryBudgetPreset,
  targetRatio: number,
): DualPoolSnapshot {
  const wasmRatio =
    budget.wasmHeapBudgetBytes > 0
      ? wasmHeapBytes / budget.wasmHeapBudgetBytes
      : wasmHeapBytes > 0
        ? 1
        : 0;
  const vramRatio =
    budget.vramBudgetBytes > 0
      ? vramBytes / budget.vramBudgetBytes
      : vramBytes > 0
        ? 1
        : 0;

  return {
    wasmHeapBytes,
    wasmHeapBudgetBytes: budget.wasmHeapBudgetBytes,
    wasmHeapUtilizationRatio: roundRatio(wasmRatio),
    vramBytes,
    vramBudgetBytes: budget.vramBudgetBytes,
    vramUtilizationRatio: roundRatio(vramRatio),
    pressureLevel: classifyMemoryPressure(
      wasmRatio,
      vramRatio,
      targetRatio,
      budget.warningUtilizationRatio,
      budget.emergencyUtilizationRatio,
    ),
  };
}

/**
 * 기기 메모리 등급별 기본 WASM64 Heap·WebGPU VRAM 예산 프리셋을 해석한다.
 */
export function resolveDeviceMemoryBudget(
  deviceTier: DeviceMemoryTier,
  overrides?: DeviceBudgetOverrides,
): DeviceMemoryBudgetPreset {
  const base = DEVICE_MEMORY_BUDGET_PRESETS[deviceTier];
  const targetUtilizationRatio = clampRatio(
    overrides?.targetUtilizationRatio,
    base.targetUtilizationRatio,
  );
  const warningUtilizationRatio = Math.max(
    targetUtilizationRatio,
    clampRatio(overrides?.warningUtilizationRatio, base.warningUtilizationRatio),
  );
  const emergencyUtilizationRatio = Math.max(
    warningUtilizationRatio,
    clampRatio(
      overrides?.emergencyUtilizationRatio,
      base.emergencyUtilizationRatio,
    ),
  );
  const wasmHeapBudgetBytes =
    overrides?.wasmHeapBudgetBytesOverride !== undefined &&
    Number.isFinite(overrides.wasmHeapBudgetBytesOverride) &&
    overrides.wasmHeapBudgetBytesOverride > 0
      ? Math.round(overrides.wasmHeapBudgetBytesOverride)
      : base.wasmHeapBudgetBytes;
  const vramBudgetBytes =
    overrides?.vramBudgetBytesOverride !== undefined &&
    Number.isFinite(overrides.vramBudgetBytesOverride) &&
    overrides.vramBudgetBytesOverride > 0
      ? Math.round(overrides.vramBudgetBytesOverride)
      : base.vramBudgetBytes;

  return {
    ...base,
    wasmHeapBudgetBytes,
    vramBudgetBytes,
    targetUtilizationRatio,
    warningUtilizationRatio,
    emergencyUtilizationRatio,
  };
}

function isEngineProtected(entry: StudioEngineTelemetryEntry): boolean {
  return entry.pinned || entry.priorityTier === "critical";
}

function computeEvictionScore(
  entry: StudioEngineTelemetryEntry,
  effectiveReclaimBytes: number,
  stalenessMs: number,
  reloadPenaltyMs: number,
): number {
  const tierWeight = EVICTION_TIER_WEIGHT[entry.priorityTier];
  const stalenessFactor = 1 + Math.log2(1 + stalenessMs / 1000);
  const reclaimFactor = 1 + effectiveReclaimBytes / MIB;
  const reloadPenaltyFactor = 1 + reloadPenaltyMs / 10;
  const raw = (tierWeight * stalenessFactor * reclaimFactor) / reloadPenaltyFactor;
  return Math.round(raw * 10000) / 10000;
}

function pickBestCandidate(
  candidates: readonly ScoredCandidate[],
): ScoredCandidate | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    const cur = candidates[i];
    if (!cur || !best) {
      continue;
    }
    if (cur.score !== best.score) {
      if (cur.score > best.score) {
        best = cur;
      }
      continue;
    }
    if (cur.stalenessMs !== best.stalenessMs) {
      if (cur.stalenessMs > best.stalenessMs) {
        best = cur;
      }
      continue;
    }
    if (cur.effectiveReclaimBytes !== best.effectiveReclaimBytes) {
      if (cur.effectiveReclaimBytes > best.effectiveReclaimBytes) {
        best = cur;
      }
      continue;
    }
    if (cur.state.entry.engineId.localeCompare(best.state.entry.engineId) < 0) {
      best = cur;
    }
  }
  return best;
}

function buildActionReasonKo(
  action: MemoryGovernanceActionKind,
  reclaimWasmBytes: number,
  reclaimVramBytes: number,
  stalenessMs: number,
): string {
  const staleSec = (stalenessMs / 1000).toFixed(1);
  if (action === "evict-vram-cache") {
    return `VRAM 텍스처 캐시 정리로 ${formatMib(reclaimVramBytes)} 회수 (미사용 ${staleSec}초)`;
  }
  if (action === "demote-wasm-snapshot") {
    return `WASM64 작업 힙 스냅샷 강등으로 ${formatMib(reclaimWasmBytes)} 회수 (미사용 ${staleSec}초)`;
  }
  return `유휴 엔진 모듈 언로드로 WASM ${formatMib(reclaimWasmBytes)}·VRAM ${formatMib(reclaimVramBytes)} 회수 (미사용 ${staleSec}초)`;
}

function buildRecoveryRecommendationsKo(
  deviceTier: DeviceMemoryTier,
  budget: DeviceMemoryBudgetPreset,
  targetWasmBytes: number,
  targetVramBytes: number,
  protectedStates: readonly MutableEngineResidency[],
  protectedWasmHeapBytes: number,
  protectedVramBytes: number,
  cannotSatisfyBudget: boolean,
  actions: readonly MemoryGovernanceAction[],
): readonly string[] {
  const recs: string[] = [];

  if (cannotSatisfyBudget) {
    if (protectedWasmHeapBytes > targetWasmBytes) {
      const overflowBytes = protectedWasmHeapBytes - targetWasmBytes;
      const topWasm = protectedStates
        .slice()
        .sort((a, b) => b.wasmHeapBytes - a.wasmHeapBytes)
        .slice(0, 3)
        .map((s) => `${s.entry.engineId}(${formatMib(s.wasmHeapBytes)})`)
        .join(", ");
      recs.push(
        `고정·필수 엔진의 WASM64 힙 상주량(${formatMib(protectedWasmHeapBytes)})이 목표 한도(${formatMib(targetWasmBytes)})를 ${formatMib(overflowBytes)} 초과했습니다. 상위 점유 엔진(${topWasm})의 고정 해제나 캔버스 타일 해상도 하향이 필요합니다.`,
      );
    }

    if (protectedVramBytes > targetVramBytes) {
      const overflowBytes = protectedVramBytes - targetVramBytes;
      const topVram = protectedStates
        .slice()
        .sort((a, b) => b.vramBytes - a.vramBytes)
        .slice(0, 3)
        .map((s) => `${s.entry.engineId}(${formatMib(s.vramBytes)})`)
        .join(", ");
      recs.push(
        `고정·필수 엔진의 WebGPU VRAM 상주량(${formatMib(protectedVramBytes)})이 목표 한도(${formatMib(targetVramBytes)})를 ${formatMib(overflowBytes)} 초과했습니다. 상위 점유 엔진(${topVram})의 텍스처 캐시 축소 또는 후처리 패스 비활성화가 필요합니다.`,
      );
    }

    if (deviceTier === "mobile-4gb" || deviceTier === "tablet-8gb") {
      recs.push(
        `${budget.labelKo} 환경에서는 경량 작업 프로필을 켜고 비활성 컷의 고해상도 타일을 로컬 OPFS로 즉시 내리세요.`,
      );
    }
    return recs;
  }

  if (actions.length > 0) {
    let cacheCount = 0;
    let snapshotCount = 0;
    let unloadCount = 0;
    for (let i = 0; i < actions.length; i += 1) {
      const act = actions[i];
      if (!act) {
        continue;
      }
      if (act.action === "evict-vram-cache") {
        cacheCount += 1;
      } else if (act.action === "demote-wasm-snapshot") {
        snapshotCount += 1;
      } else {
        unloadCount += 1;
      }
    }
    const targetPct = Math.round(budget.targetUtilizationRatio * 100);
    recs.push(
      `안전 수위(${targetPct}% 이하) 확보 완료: VRAM 캐시 정리 ${cacheCount}건, WASM 스냅샷 강등 ${snapshotCount}건, 유휴 모듈 언로드 ${unloadCount}건.`,
    );
  }

  return recs;
}

/**
 * WASM64 Heap과 WebGPU VRAM 듀얼 풀의 메모리 압력을 분석하고,
 * 보호 대상(`pinned` / `critical`)을 100% 유지하면서 안전 수위(기본 75%) 이하로 내리는
 * 결정적 3단계 강등·회수 계획을 수립한다.
 */
export function planDualPoolMemoryGovernance(
  entries: readonly StudioEngineTelemetryEntry[],
  options: DualPoolGovernanceOptions,
): DualPoolMemoryGovernancePlan {
  const budget = resolveDeviceMemoryBudget(options.deviceTier, {
    targetUtilizationRatio: options.targetUtilizationRatio,
    warningUtilizationRatio: options.warningUtilizationRatio,
    emergencyUtilizationRatio: options.emergencyUtilizationRatio,
    wasmHeapBudgetBytesOverride: options.wasmHeapBudgetBytesOverride,
    vramBudgetBytesOverride: options.vramBudgetBytesOverride,
  });
  const targetRatio = budget.targetUtilizationRatio;

  let maxLastUsedMs = 0;
  const states: MutableEngineResidency[] = [];
  let currentWasmBytes = 0;
  let currentVramBytes = 0;
  let protectedWasmHeapBytes = 0;
  let protectedVramBytes = 0;
  const protectedEngineIds: string[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry) {
      continue;
    }
    const lastUsed = sanitizeMs(entry.lastUsedMs);
    if (lastUsed > maxLastUsedMs) {
      maxLastUsedMs = lastUsed;
    }
    const wasm = sanitizeBytes(entry.wasmHeapBytes);
    const vram = sanitizeBytes(entry.vramBytes);
    const isProtected = isEngineProtected(entry);

    currentWasmBytes += wasm;
    currentVramBytes += vram;
    if (isProtected) {
      protectedWasmHeapBytes += wasm;
      protectedVramBytes += vram;
      protectedEngineIds.push(entry.engineId);
    }

    states.push({
      entry,
      protected: isProtected,
      wasmHeapBytes: wasm,
      vramBytes: vram,
      vramCacheEvicted: false,
      wasmSnapshotDemoted: false,
      unloaded: false,
    });
  }

  protectedEngineIds.sort((a, b) => a.localeCompare(b));

  const referenceNowMs =
    options.nowMs !== undefined && Number.isFinite(options.nowMs)
      ? Math.max(options.nowMs, maxLastUsedMs)
      : maxLastUsedMs;

  const before = buildDualPoolSnapshot(
    currentWasmBytes,
    currentVramBytes,
    budget,
    targetRatio,
  );

  const targetWasmBytes = Math.floor(budget.wasmHeapBudgetBytes * targetRatio);
  const targetVramBytes = Math.floor(budget.vramBudgetBytes * targetRatio);

  const actions: MemoryGovernanceAction[] = [];
  let totalReclaimedWasmHeapBytes = 0;
  let totalReclaimedVramBytes = 0;

  const pushAction = (chosen: ScoredCandidate): void => {
    actions.push({
      stepIndex: actions.length,
      engineId: chosen.state.entry.engineId,
      waveNumber: chosen.state.entry.waveNumber,
      priorityTier: chosen.state.entry.priorityTier,
      action: chosen.action,
      reclaimedWasmHeapBytes: chosen.reclaimWasmBytes,
      reclaimedVramBytes: chosen.reclaimVramBytes,
      stalenessMs: Math.round(chosen.stalenessMs),
      reloadPenaltyMs: Math.round(chosen.reloadPenaltyMs * 100) / 100,
      score: chosen.score,
      reasonKo: buildActionReasonKo(
        chosen.action,
        chosen.reclaimWasmBytes,
        chosen.reclaimVramBytes,
        chosen.stalenessMs,
      ),
    });
    currentWasmBytes -= chosen.reclaimWasmBytes;
    currentVramBytes -= chosen.reclaimVramBytes;
    totalReclaimedWasmHeapBytes += chosen.reclaimWasmBytes;
    totalReclaimedVramBytes += chosen.reclaimVramBytes;
    chosen.state.wasmHeapBytes -= chosen.reclaimWasmBytes;
    chosen.state.vramBytes -= chosen.reclaimVramBytes;
  };

  // 1단계: 비파괴 VRAM 텍스처 캐시 정리 (`evict-vram-cache`)
  while (currentVramBytes > targetVramBytes) {
    const candidates: ScoredCandidate[] = [];
    for (let i = 0; i < states.length; i += 1) {
      const state = states[i];
      if (!state || state.protected || state.unloaded || state.vramCacheEvicted) {
        continue;
      }
      if (state.vramBytes <= 0) {
        continue;
      }
      const reclaimVramBytes = Math.min(
        state.vramBytes,
        Math.max(1, Math.round(state.vramBytes * VRAM_CACHE_RECLAIM_FRACTION)),
      );
      const stalenessMs = Math.max(
        0,
        referenceNowMs - sanitizeMs(state.entry.lastUsedMs),
      );
      const reloadPenaltyMs = Math.max(
        1,
        sanitizeMs(state.entry.warmInvokeMs) * 1.5,
      );
      candidates.push({
        state,
        action: "evict-vram-cache",
        reclaimWasmBytes: 0,
        reclaimVramBytes,
        effectiveReclaimBytes: reclaimVramBytes,
        stalenessMs,
        reloadPenaltyMs,
        score: computeEvictionScore(
          state.entry,
          reclaimVramBytes,
          stalenessMs,
          reloadPenaltyMs,
        ),
      });
    }
    const chosen = pickBestCandidate(candidates);
    if (!chosen) {
      break;
    }
    chosen.state.vramCacheEvicted = true;
    pushAction(chosen);
  }

  // 2단계: 비파괴 WASM64 작업 힙 스냅샷 강등 (`demote-wasm-snapshot`)
  while (currentWasmBytes > targetWasmBytes) {
    const candidates: ScoredCandidate[] = [];
    for (let i = 0; i < states.length; i += 1) {
      const state = states[i];
      if (
        !state ||
        state.protected ||
        state.unloaded ||
        state.wasmSnapshotDemoted
      ) {
        continue;
      }
      if (state.wasmHeapBytes <= 0) {
        continue;
      }
      const reclaimWasmBytes = Math.min(
        state.wasmHeapBytes,
        Math.max(
          1,
          Math.round(state.wasmHeapBytes * WASM_SNAPSHOT_RECLAIM_FRACTION),
        ),
      );
      const stalenessMs = Math.max(
        0,
        referenceNowMs - sanitizeMs(state.entry.lastUsedMs),
      );
      const reloadPenaltyMs = Math.max(
        2,
        sanitizeMs(state.entry.coldStartMs) * 0.45 +
          sanitizeMs(state.entry.warmInvokeMs),
      );
      candidates.push({
        state,
        action: "demote-wasm-snapshot",
        reclaimWasmBytes,
        reclaimVramBytes: 0,
        effectiveReclaimBytes: reclaimWasmBytes,
        stalenessMs,
        reloadPenaltyMs,
        score: computeEvictionScore(
          state.entry,
          reclaimWasmBytes,
          stalenessMs,
          reloadPenaltyMs,
        ),
      });
    }
    const chosen = pickBestCandidate(candidates);
    if (!chosen) {
      break;
    }
    chosen.state.wasmSnapshotDemoted = true;
    pushAction(chosen);
  }

  // 3단계: 잔여 압력 해소용 유휴 모듈 완전 언로드 (`unload-cold-module`)
  while (currentWasmBytes > targetWasmBytes || currentVramBytes > targetVramBytes) {
    const needWasm = currentWasmBytes > targetWasmBytes;
    const needVram = currentVramBytes > targetVramBytes;
    const candidates: ScoredCandidate[] = [];

    for (let i = 0; i < states.length; i += 1) {
      const state = states[i];
      if (!state || state.protected || state.unloaded) {
        continue;
      }
      const helpsWasm = needWasm && state.wasmHeapBytes > 0;
      const helpsVram = needVram && state.vramBytes > 0;
      if (!helpsWasm && !helpsVram) {
        continue;
      }
      const effectiveReclaimBytes =
        (needWasm ? state.wasmHeapBytes : 0) + (needVram ? state.vramBytes : 0);
      const stalenessMs = Math.max(
        0,
        referenceNowMs - sanitizeMs(state.entry.lastUsedMs),
      );
      const reloadPenaltyMs = Math.max(1, sanitizeMs(state.entry.coldStartMs));
      candidates.push({
        state,
        action: "unload-cold-module",
        reclaimWasmBytes: state.wasmHeapBytes,
        reclaimVramBytes: state.vramBytes,
        effectiveReclaimBytes,
        stalenessMs,
        reloadPenaltyMs,
        score: computeEvictionScore(
          state.entry,
          effectiveReclaimBytes,
          stalenessMs,
          reloadPenaltyMs,
        ),
      });
    }
    const chosen = pickBestCandidate(candidates);
    if (!chosen) {
      break;
    }
    chosen.state.unloaded = true;
    chosen.state.vramCacheEvicted = true;
    chosen.state.wasmSnapshotDemoted = true;
    pushAction(chosen);
  }

  const after = buildDualPoolSnapshot(
    currentWasmBytes,
    currentVramBytes,
    budget,
    targetRatio,
  );

  const budgetSatisfied =
    currentWasmBytes <= targetWasmBytes && currentVramBytes <= targetVramBytes;
  const cannotSatisfyBudget = !budgetSatisfied;

  const protectedStates = states.filter((s) => s.protected);
  const recoveryRecommendationsKo = buildRecoveryRecommendationsKo(
    options.deviceTier,
    budget,
    targetWasmBytes,
    targetVramBytes,
    protectedStates,
    protectedWasmHeapBytes,
    protectedVramBytes,
    cannotSatisfyBudget,
    actions,
  );

  return {
    deviceTier: options.deviceTier,
    budget,
    targetUtilizationRatio: targetRatio,
    before,
    after,
    protectedEngineIds,
    protectedWasmHeapBytes,
    protectedVramBytes,
    actions,
    totalReclaimedWasmHeapBytes,
    totalReclaimedVramBytes,
    budgetSatisfied,
    cannotSatisfyBudget,
    recoveryRecommendationsKo,
  };
}
