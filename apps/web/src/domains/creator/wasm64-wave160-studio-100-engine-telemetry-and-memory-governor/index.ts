/**
 * Wasm64 Wave 160 마일스톤 공개 배럴 진입점 (`wasm64-wave160-studio-100-engine-telemetry-and-memory-governor`).
 *
 * - `telemetry-governor-types`: 100종 이상 라이브 엔진 텔레메트리, 기기 메모리 등급 프리셋,
 *   SLA 임계값, 강등 조치, 프레임 워밍업 계획 및 오케스트레이터 출력 계약
 * - `latency-percentile-profiler`: 선형 보간(R-7) 지연 백분위, 제로 초기 번들 감사,
 *   로버스트 MAD 이상치 탐지, 의존성 DAG 프레임 예산 병렬 워밍업 플래너
 * - `memory-budget-governor`: WASM64 Heap + WebGPU VRAM 듀얼 풀 메모리 압력 분석,
 *   `pinned`/`critical` 100% 보호 불변식, 3단계 비파괴 강등·회수 및 OOM 복구 권고
 * - `telemetry-report-and-svg`: ES2017 동기 FIPS 180-4 SHA-256 지문, 순수 OKLCH SVG 대시보드,
 *   자연스러운 한국어 스튜디오 운영 QA 브리프
 */

import {
  auditZeroEagerBundleInvariant,
  computeLatencyPercentiles,
  detectColdStartOutliers,
  planFrameBudgetWarmupWaves,
} from "./latency-percentile-profiler";
import {
  planDualPoolMemoryGovernance,
  resolveDeviceMemoryBudget,
} from "./memory-budget-governor";
import {
  DEFAULT_TELEMETRY_SLA_THRESHOLDS,
  type DeviceMemoryTier,
  type SlaComplianceReport,
  type StudioEngineCategory,
  type StudioEnginePriorityTier,
  type StudioEngineTelemetryEntry,
  type StudioTelemetryGovernorInput,
  type StudioTelemetryGovernorReport,
  type TelemetryGovernanceStatus,
  type TelemetrySlaThresholds,
  type TelemetryWaveRange,
} from "./telemetry-governor-types";
import {
  computeTelemetryGovernanceFingerprint,
  renderStudioTelemetryGovernorSvg,
  summarizeTelemetryGovernorKo,
} from "./telemetry-report-and-svg";

export {
  DEFAULT_TELEMETRY_SLA_THRESHOLDS,
  type ColdStartOutlierFinding,
  type ColdStartOutlierOptions,
  type ColdStartOutlierReport,
  type DeviceMemoryBudgetPreset,
  type DeviceMemoryTier,
  type DualPoolGovernanceOptions,
  type DualPoolMemoryGovernancePlan,
  type DualPoolSnapshot,
  type EagerBundleLeakRecord,
  type FrameBudgetWarmupPlan,
  type LatencyPercentileStats,
  type MemoryGovernanceAction,
  type MemoryGovernanceActionKind,
  type MemoryPressureLevel,
  type MissingDependencyRef,
  type SlaComplianceReport,
  type StudioEngineCategory,
  type StudioEnginePriorityTier,
  type StudioEngineTelemetryEntry,
  type StudioTelemetryGovernorInput,
  type StudioTelemetryGovernorReport,
  type TelemetryGovernanceStatus,
  type TelemetrySlaThresholds,
  type TelemetryWaveRange,
  type WarmupPlanOptions,
  type WarmupWaveSlice,
  type ZeroEagerBundleAuditResult,
} from "./telemetry-governor-types";

export {
  auditZeroEagerBundleInvariant,
  computeLatencyPercentiles,
  detectColdStartOutliers,
  planFrameBudgetWarmupWaves,
} from "./latency-percentile-profiler";

export {
  planDualPoolMemoryGovernance,
  resolveDeviceMemoryBudget,
  type DeviceBudgetOverrides,
} from "./memory-budget-governor";

export {
  computeTelemetryGovernanceFingerprint,
  escapeSvgXml,
  renderStudioTelemetryGovernorSvg,
  sha256TelemetryHex,
  summarizeTelemetryGovernorKo,
  type TelemetryDashboardSvgInput,
  type TelemetryFingerprintPayload,
  type TelemetrySummaryKoInput,
} from "./telemetry-report-and-svg";

const MIB = 1024 * 1024;
const SAMPLE_BASE_NOW_MS = 1795800000000;
const SAMPLE_CAPTURED_AT_ISO = "2026-11-28T12:00:00.000Z";

export interface SampleTelemetryScenarioOptions {
  readonly deviceTier?: DeviceMemoryTier;
  readonly scenarioName?: string;
  readonly nowMs?: number;
  readonly capturedAtIso?: string;
}

const SAMPLE_CATEGORIES: readonly StudioEngineCategory[] = [
  "ink-brush",
  "physics-sim",
  "color-lighting",
  "layout-typography",
  "bg3d-camera",
  "character-rig",
  "audio-motion",
  "export-packaging",
  "ai-guardrail",
  "storage-sync",
  "telemetry-runtime",
];

const SAMPLE_LAZY_TIERS: readonly StudioEnginePriorityTier[] = [
  "high",
  "standard",
  "standard",
  "background",
  "background",
];

const CORE_ENGINE_SPECS: readonly {
  readonly engineId: string;
  readonly waveNumber: number;
  readonly category: StudioEngineCategory;
  readonly coldStartMs: number;
  readonly warmInvokeMs: number;
  readonly wasmMib: number;
  readonly vramMib: number;
  readonly staleSec: number;
  readonly dependencies: readonly string[];
  readonly displayNameKo: string;
}[] = [
  {
    engineId: "wave037-canvas-tile-compositor",
    waveNumber: 37,
    category: "ink-brush",
    coldStartMs: 4.1,
    warmInvokeMs: 0.45,
    wasmMib: 24,
    vramMib: 20,
    staleSec: 1,
    dependencies: [],
    displayNameKo: "캔버스 타일 합성 코어",
  },
  {
    engineId: "wave042-ink-stroke-authority",
    waveNumber: 42,
    category: "ink-brush",
    coldStartMs: 4.6,
    warmInvokeMs: 0.52,
    wasmMib: 18,
    vramMib: 14,
    staleSec: 2,
    dependencies: ["wave037-canvas-tile-compositor"],
    displayNameKo: "잉크 스트로크 정본 엔진",
  },
  {
    engineId: "wave048-layer-blend-pipeline",
    waveNumber: 48,
    category: "color-lighting",
    coldStartMs: 5.0,
    warmInvokeMs: 0.6,
    wasmMib: 16,
    vramMib: 18,
    staleSec: 3,
    dependencies: ["wave037-canvas-tile-compositor"],
    displayNameKo: "레이어 블렌드 파이프라인",
  },
  {
    engineId: "wave056-opfs-sqlite-authority",
    waveNumber: 56,
    category: "storage-sync",
    coldStartMs: 4.4,
    warmInvokeMs: 0.55,
    wasmMib: 14,
    vramMib: 4,
    staleSec: 4,
    dependencies: [],
    displayNameKo: "OPFS SQLite 로컬 저장소",
  },
  {
    engineId: "wave070-rights-bom-guard",
    waveNumber: 70,
    category: "export-packaging",
    coldStartMs: 3.8,
    warmInvokeMs: 0.4,
    wasmMib: 10,
    vramMib: 2,
    staleSec: 5,
    dependencies: ["wave056-opfs-sqlite-authority"],
    displayNameKo: "권리 BOM 라이선스 감사기",
  },
  {
    engineId: "wave160-telemetry-memory-governor",
    waveNumber: 160,
    category: "telemetry-runtime",
    coldStartMs: 3.5,
    warmInvokeMs: 0.35,
    wasmMib: 8,
    vramMib: 4,
    staleSec: 0,
    dependencies: [
      "wave037-canvas-tile-compositor",
      "wave056-opfs-sqlite-authority",
    ],
    displayNameKo: "100+ 엔진 텔레메트리·메모리 거버너",
  },
];

function padWaveNumber(waveNumber: number): string {
  return String(waveNumber).padStart(3, "0");
}

/**
 * `/studio` 런타임 허브 자가 진단용 결정적 103종 라이브 엔진 텔레메트리 시나리오(Wave 37–164)를 생성한다.
 * - 핵심 고정·필수 엔진 6종 + 지연 로딩 전문 엔진 97종 = 총 103종
 * - 전 엔진 초기 번들 누수 `0 B` (`0.0 KiB`) 및 비순환(acyclic) 의존성 DAG 보장
 */
export function createSample100EngineTelemetryScenario(
  options?: SampleTelemetryScenarioOptions,
): StudioTelemetryGovernorInput {
  const nowMs = options?.nowMs ?? SAMPLE_BASE_NOW_MS;
  const deviceTier = options?.deviceTier ?? "desktop-16gb";
  const scenarioName =
    options?.scenarioName ?? "ToonStudio /studio 103종 라이브 런타임 허브 자가 점검";
  const capturedAtIso = options?.capturedAtIso ?? SAMPLE_CAPTURED_AT_ISO;

  const coreWaveSet = new Set<number>(
    CORE_ENGINE_SPECS.map((spec) => spec.waveNumber),
  );
  const availableLazyWaves: number[] = [];
  for (let w = 38; w <= 164; w += 1) {
    if (!coreWaveSet.has(w)) {
      availableLazyWaves.push(w);
    }
  }

  // 122개 후보 웨이브 중 끝점 164를 포함해 97개 웨이브를 결정적으로 선택
  const lazyTargetCount = 97;
  const selectedLazyWaves: number[] = [];
  for (let i = 0; i < lazyTargetCount; i += 1) {
    const idx = Math.round(
      (i * (availableLazyWaves.length - 1)) / (lazyTargetCount - 1),
    );
    const waveNum = availableLazyWaves[idx];
    if (waveNum !== undefined) {
      selectedLazyWaves.push(waveNum);
    }
  }

  const entries: StudioEngineTelemetryEntry[] = [];

  for (let i = 0; i < CORE_ENGINE_SPECS.length; i += 1) {
    const spec = CORE_ENGINE_SPECS[i];
    if (!spec) {
      continue;
    }
    entries.push({
      engineId: spec.engineId,
      waveNumber: spec.waveNumber,
      category: spec.category,
      coldStartMs: spec.coldStartMs,
      warmInvokeMs: spec.warmInvokeMs,
      wasmHeapBytes: spec.wasmMib * MIB,
      vramBytes: spec.vramMib * MIB,
      eagerBundleBytes: 0,
      priorityTier: "critical",
      lastUsedMs: nowMs - spec.staleSec * 1000,
      pinned: true,
      dependencies: spec.dependencies,
      displayNameKo: spec.displayNameKo,
    });
  }

  const coreAnchorIds = [
    "wave037-canvas-tile-compositor",
    "wave042-ink-stroke-authority",
    "wave048-layer-blend-pipeline",
    "wave056-opfs-sqlite-authority",
    "wave070-rights-bom-guard",
  ];
  const lazyEngineIds: string[] = [];

  for (let i = 0; i < selectedLazyWaves.length; i += 1) {
    const waveNumber = selectedLazyWaves[i] ?? 38 + i;
    const category =
      SAMPLE_CATEGORIES[i % SAMPLE_CATEGORIES.length] ?? "ink-brush";
    const priorityTier =
      SAMPLE_LAZY_TIERS[i % SAMPLE_LAZY_TIERS.length] ?? "standard";
    const engineId = `wave${padWaveNumber(waveNumber)}-${category}-engine`;
    lazyEngineIds.push(engineId);

    const coldStartMs = Math.round((4.8 + ((i * 19 + 7) % 81) * 0.1) * 100) / 100;
    const warmInvokeMs = Math.round((0.55 + ((i * 13 + 3) % 23) * 0.1) * 100) / 100;
    const wasmMib = 8 + ((i * 5 + 3) % 8);
    const vramMib = 6 + ((i * 7 + 1) % 7);
    const staleSec =
      priorityTier === "high"
        ? 15 + (i % 12) * 15
        : priorityTier === "standard"
          ? 180 + (i % 20) * 35
          : 900 + (i % 25) * 90;

    const deps: string[] = [];
    const primaryAnchor = coreAnchorIds[i % coreAnchorIds.length];
    if (primaryAnchor !== undefined) {
      deps.push(primaryAnchor);
    }
    if (i >= 10 && i % 4 === 0) {
      const earlierLazyId = lazyEngineIds[i - 7];
      if (earlierLazyId !== undefined) {
        deps.push(earlierLazyId);
      }
    }

    entries.push({
      engineId,
      waveNumber,
      category,
      coldStartMs,
      warmInvokeMs,
      wasmHeapBytes: wasmMib * MIB,
      vramBytes: vramMib * MIB,
      eagerBundleBytes: 0,
      priorityTier,
      lastUsedMs: nowMs - staleSec * 1000,
      pinned: false,
      dependencies: deps,
    });
  }

  entries.sort((a, b) => {
    if (a.waveNumber !== b.waveNumber) {
      return a.waveNumber - b.waveNumber;
    }
    return a.engineId.localeCompare(b.engineId);
  });

  return {
    scenarioName,
    capturedAtIso,
    nowMs,
    deviceTier,
    entries,
  };
}

function computeWaveRange(
  entries: readonly StudioEngineTelemetryEntry[],
): TelemetryWaveRange {
  if (entries.length === 0) {
    return { minWave: 0, maxWave: 0 };
  }
  let minWave = Number.POSITIVE_INFINITY;
  let maxWave = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry) {
      continue;
    }
    if (entry.waveNumber < minWave) {
      minWave = entry.waveNumber;
    }
    if (entry.waveNumber > maxWave) {
      maxWave = entry.waveNumber;
    }
  }
  return {
    minWave: Number.isFinite(minWave) ? minWave : 0,
    maxWave: Number.isFinite(maxWave) ? maxWave : 0,
  };
}

function resolveSlaThresholds(
  overrides?: Partial<TelemetrySlaThresholds>,
): TelemetrySlaThresholds {
  if (!overrides) {
    return { ...DEFAULT_TELEMETRY_SLA_THRESHOLDS };
  }
  return {
    ...DEFAULT_TELEMETRY_SLA_THRESHOLDS,
    ...overrides,
  };
}

/**
 * 100종 이상 라이브 엔진의 지연 프로파일링, 제로 초기 번들 감사, MAD 스파이크 탐지,
 * 프레임 예산 워밍업 계획, 듀얼 풀 메모리 거버넌스, SHA-256 지문 및 OKLCH SVG 대시보드를
 * 단일 호출로 실행하는 Wave 160 통합 오케스트레이터.
 */
export function runStudio100EngineTelemetryGovernor(
  input: StudioTelemetryGovernorInput,
): StudioTelemetryGovernorReport {
  const scenarioName =
    input.scenarioName?.trim() || "ToonStudio 100+ 라이브 엔진 텔레메트리 점검";
  const capturedAtIso = input.capturedAtIso ?? SAMPLE_CAPTURED_AT_ISO;
  const slaThresholds = resolveSlaThresholds(input.slaOverrides);
  const devicePreset = resolveDeviceMemoryBudget(input.deviceTier, {
    targetUtilizationRatio:
      input.targetUtilizationRatio ?? slaThresholds.targetMemoryUtilizationRatio,
    warningUtilizationRatio: slaThresholds.warningMemoryUtilizationRatio,
    emergencyUtilizationRatio: slaThresholds.emergencyMemoryUtilizationRatio,
    wasmHeapBudgetBytesOverride: input.wasmHeapBudgetBytesOverride,
    vramBudgetBytesOverride: input.vramBudgetBytesOverride,
  });

  const coldStarts = input.entries.map((e) => e.coldStartMs);
  const warmInvokes = input.entries.map((e) => e.warmInvokeMs);

  const coldStartPercentiles = computeLatencyPercentiles(coldStarts);
  const warmInvokePercentiles = computeLatencyPercentiles(warmInvokes);
  const eagerBundleAudit = auditZeroEagerBundleInvariant(
    input.entries,
    slaThresholds.maxEagerBundleBytes,
  );
  const coldStartOutliers = detectColdStartOutliers(input.entries, {
    thresholdModifiedZ: slaThresholds.outlierModifiedZThreshold,
    criticalModifiedZ: slaThresholds.outlierCriticalModifiedZThreshold,
  });
  const warmupPlan = planFrameBudgetWarmupWaves(input.entries, {
    frameBudgetMs:
      input.warmupOptions?.frameBudgetMs ?? slaThresholds.frameBudgetMs,
    maxConcurrency:
      input.warmupOptions?.maxConcurrency ?? devicePreset.maxWarmupConcurrency,
  });
  const memoryGovernance = planDualPoolMemoryGovernance(input.entries, {
    deviceTier: input.deviceTier,
    nowMs: input.nowMs,
    targetUtilizationRatio:
      input.targetUtilizationRatio ?? slaThresholds.targetMemoryUtilizationRatio,
    warningUtilizationRatio: slaThresholds.warningMemoryUtilizationRatio,
    emergencyUtilizationRatio: slaThresholds.emergencyMemoryUtilizationRatio,
    wasmHeapBudgetBytesOverride: input.wasmHeapBudgetBytesOverride,
    vramBudgetBytesOverride: input.vramBudgetBytesOverride,
  });

  const coldStartP95Pass =
    coldStartPercentiles.p95 <= slaThresholds.maxColdStartP95Ms;
  const coldStartP99Pass =
    coldStartPercentiles.p99 <= slaThresholds.maxColdStartP99Ms;
  const warmInvokeP95Pass =
    warmInvokePercentiles.p95 <= slaThresholds.maxWarmInvokeP95Ms;
  const warmInvokeP99Pass =
    warmInvokePercentiles.p99 <= slaThresholds.maxWarmInvokeP99Ms;
  const jitterCvPass =
    coldStartPercentiles.jitterCv <= slaThresholds.maxJitterCv;
  const zeroEagerBundlePass = eagerBundleAudit.compliant;
  const memoryBudgetPass = !memoryGovernance.cannotSatisfyBudget;
  const warmupAcyclicPass = !warmupPlan.hasCycle;

  const violationsKo: string[] = [];
  const warningsKo: string[] = [];

  if (!zeroEagerBundlePass) {
    violationsKo.push(
      `초기 번들 누수 ${eagerBundleAudit.totalEagerLeakBytes} B (${eagerBundleAudit.leakingEngineCount}종: ${eagerBundleAudit.offendingEngineIds.slice(0, 3).join(", ")})`,
    );
  }
  if (!memoryBudgetPass) {
    violationsKo.push(
      `${memoryGovernance.budget.labelKo} 듀얼 풀 목표 예산 충족 불가 (고정·필수 엔진 상주량 초과)`,
    );
  }
  if (!warmupAcyclicPass) {
    violationsKo.push(
      `엔진 의존성 순환 감지 (${warmupPlan.cycleEngineIds.join(", ")})`,
    );
  }
  if (!coldStartP99Pass) {
    violationsKo.push(
      `Cold Start p99(${coldStartPercentiles.p99.toFixed(1)}ms)가 SLA 상한(${slaThresholds.maxColdStartP99Ms}ms)을 초과했습니다`,
    );
  }
  if (!warmInvokeP99Pass) {
    violationsKo.push(
      `Warm 호출 p99(${warmInvokePercentiles.p99.toFixed(1)}ms)가 SLA 상한(${slaThresholds.maxWarmInvokeP99Ms}ms)을 초과했습니다`,
    );
  }

  if (!coldStartP95Pass) {
    warningsKo.push(
      `Cold Start p95(${coldStartPercentiles.p95.toFixed(1)}ms)가 목표(${slaThresholds.maxColdStartP95Ms}ms)를 넘겼습니다`,
    );
  }
  if (!warmInvokeP95Pass) {
    warningsKo.push(
      `Warm 호출 p95(${warmInvokePercentiles.p95.toFixed(1)}ms)가 목표(${slaThresholds.maxWarmInvokeP95Ms}ms)를 넘겼습니다`,
    );
  }
  if (!jitterCvPass) {
    warningsKo.push(
      `Cold Start 지터 CV(${coldStartPercentiles.jitterCv.toFixed(3)})가 기준(${slaThresholds.maxJitterCv})보다 높습니다`,
    );
  }
  if (coldStartOutliers.outliers.length > 0) {
    warningsKo.push(
      `MAD 콜드 스타트 스파이크 ${coldStartOutliers.outliers.length}건 감지`,
    );
  }
  if (
    memoryGovernance.before.pressureLevel === "emergency" &&
    memoryBudgetPass
  ) {
    warningsKo.push(
      `초기 긴급 메모리 압력을 자동 회수(${memoryGovernance.actions.length}건)로 안전 수위 이하로 낮췄습니다`,
    );
  } else if (
    memoryGovernance.actions.some((a) => a.action === "unload-cold-module") &&
    memoryBudgetPass
  ) {
    warningsKo.push(
      `메모리 예산 유지를 위해 유휴 모듈 언로드가 포함되었습니다`,
    );
  }
  if (warmupPlan.waves.some((w) => w.exceedsFrameBudget)) {
    warningsKo.push(
      `단일 프레임 예산(${warmupPlan.frameBudgetMs}ms)을 초과한 워밍업 슬라이스가 있습니다`,
    );
  }
  if (warmupPlan.missingDependencyRefs.length > 0) {
    warningsKo.push(
      `미등록 의존성 참조 ${warmupPlan.missingDependencyRefs.length}건이 발견되었습니다`,
    );
  }

  const slaCompliance: SlaComplianceReport = {
    coldStartP95Pass,
    coldStartP99Pass,
    warmInvokeP95Pass,
    warmInvokeP99Pass,
    jitterCvPass,
    zeroEagerBundlePass,
    memoryBudgetPass,
    warmupAcyclicPass,
    violationsKo,
    warningsKo,
  };

  const status: TelemetryGovernanceStatus =
    violationsKo.length > 0
      ? "FAIL"
      : warningsKo.length > 0
        ? "WARN"
        : "PASS";

  const waveRange = computeWaveRange(input.entries);
  const fingerprintSha256 = computeTelemetryGovernanceFingerprint({
    scenarioName,
    status,
    entries: input.entries,
    coldStartPercentiles,
    warmInvokePercentiles,
    eagerBundleAudit,
    coldStartOutliers,
    warmupPlan,
    memoryGovernance,
    slaCompliance,
  });

  const summaryKo = summarizeTelemetryGovernorKo({
    scenarioName,
    status,
    engineCount: input.entries.length,
    waveRange,
    coldStartPercentiles,
    warmInvokePercentiles,
    eagerBundleAudit,
    coldStartOutliers,
    warmupPlan,
    memoryGovernance,
    slaCompliance,
    fingerprintSha256,
  });

  const dashboardSvg = renderStudioTelemetryGovernorSvg({
    scenarioName,
    status,
    engineCount: input.entries.length,
    waveRange,
    slaThresholds,
    coldStartPercentiles,
    warmInvokePercentiles,
    eagerBundleAudit,
    coldStartOutliers,
    warmupPlan,
    memoryGovernance,
    fingerprintSha256,
  });

  return {
    scenarioName,
    capturedAtIso,
    status,
    engineCount: input.entries.length,
    waveRange,
    slaThresholds,
    coldStartPercentiles,
    warmInvokePercentiles,
    eagerBundleAudit,
    coldStartOutliers,
    warmupPlan,
    memoryGovernance,
    slaCompliance,
    fingerprintSha256,
    summaryKo,
    dashboardSvg,
  };
}
