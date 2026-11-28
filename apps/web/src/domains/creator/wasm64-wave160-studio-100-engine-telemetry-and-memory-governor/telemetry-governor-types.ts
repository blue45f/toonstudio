/**
 * Wave 160 마일스톤: ToonStudio 100종 이상 라이브 엔진 텔레메트리·지연 프로파일러·
 * 듀얼 풀(WASM64 Heap + WebGPU VRAM) 메모리 예산 오케스트레이터 핵심 타입 계약.
 */

export type StudioEngineCategory =
  | "ink-brush"
  | "physics-sim"
  | "color-lighting"
  | "layout-typography"
  | "bg3d-camera"
  | "character-rig"
  | "audio-motion"
  | "export-packaging"
  | "ai-guardrail"
  | "storage-sync"
  | "telemetry-runtime";

export type StudioEnginePriorityTier =
  | "critical"
  | "high"
  | "standard"
  | "background";

export type DeviceMemoryTier =
  | "mobile-4gb"
  | "tablet-8gb"
  | "desktop-16gb"
  | "workstation-32gb";

export interface StudioEngineTelemetryEntry {
  readonly engineId: string;
  readonly waveNumber: number;
  readonly category: StudioEngineCategory;
  readonly coldStartMs: number;
  readonly warmInvokeMs: number;
  readonly wasmHeapBytes: number;
  readonly vramBytes: number;
  readonly eagerBundleBytes: number;
  readonly priorityTier: StudioEnginePriorityTier;
  readonly lastUsedMs: number;
  readonly pinned: boolean;
  readonly dependencies: readonly string[];
  readonly displayNameKo?: string;
}

export interface DeviceMemoryBudgetPreset {
  readonly deviceTier: DeviceMemoryTier;
  readonly labelKo: string;
  readonly totalDeviceRamBytes: number;
  readonly wasmHeapBudgetBytes: number;
  readonly vramBudgetBytes: number;
  readonly targetUtilizationRatio: number;
  readonly warningUtilizationRatio: number;
  readonly emergencyUtilizationRatio: number;
  readonly maxWarmupConcurrency: number;
  readonly frameBudgetMs: number;
}

export interface TelemetrySlaThresholds {
  readonly maxColdStartP95Ms: number;
  readonly maxColdStartP99Ms: number;
  readonly maxWarmInvokeP95Ms: number;
  readonly maxWarmInvokeP99Ms: number;
  readonly maxJitterCv: number;
  readonly maxEagerBundleBytes: number;
  readonly outlierModifiedZThreshold: number;
  readonly outlierCriticalModifiedZThreshold: number;
  readonly targetMemoryUtilizationRatio: number;
  readonly warningMemoryUtilizationRatio: number;
  readonly emergencyMemoryUtilizationRatio: number;
  readonly frameBudgetMs: number;
}

export interface LatencyPercentileStats {
  readonly sampleCount: number;
  readonly min: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly mean: number;
  readonly stddev: number;
  readonly jitterCv: number;
}

export interface EagerBundleLeakRecord {
  readonly engineId: string;
  readonly waveNumber: number;
  readonly eagerBundleBytes: number;
}

export interface ZeroEagerBundleAuditResult {
  readonly compliant: boolean;
  readonly maxAllowedBytes: number;
  readonly totalEngineCount: number;
  readonly leakingEngineCount: number;
  readonly totalEagerLeakBytes: number;
  readonly totalEagerLeakKib: number;
  readonly offendingEngineIds: readonly string[];
  readonly offendingEntries: readonly EagerBundleLeakRecord[];
}

export interface ColdStartOutlierFinding {
  readonly engineId: string;
  readonly waveNumber: number;
  readonly coldStartMs: number;
  readonly medianMs: number;
  readonly madMs: number;
  readonly modifiedZScore: number;
  readonly severity: "warn" | "critical";
}

export interface ColdStartOutlierOptions {
  readonly thresholdModifiedZ?: number;
  readonly criticalModifiedZ?: number;
}

export interface ColdStartOutlierReport {
  readonly medianMs: number;
  readonly madMs: number;
  readonly thresholdModifiedZ: number;
  readonly criticalModifiedZ: number;
  readonly zeroMadFallbackUsed: boolean;
  readonly outliers: readonly ColdStartOutlierFinding[];
}

export interface WarmupWaveSlice {
  readonly frameIndex: number;
  readonly engineIds: readonly string[];
  readonly batches: readonly (readonly string[])[];
  readonly parallelBatchCount: number;
  readonly peakConcurrency: number;
  readonly estimatedFrameMs: number;
  readonly exceedsFrameBudget: boolean;
}

export interface MissingDependencyRef {
  readonly engineId: string;
  readonly missingDependencyId: string;
}

export interface WarmupPlanOptions {
  readonly frameBudgetMs?: number;
  readonly maxConcurrency?: number;
}

export interface FrameBudgetWarmupPlan {
  readonly frameBudgetMs: number;
  readonly maxConcurrency: number;
  readonly totalInputEngines: number;
  readonly totalScheduledEngines: number;
  readonly totalFrames: number;
  readonly totalEstimatedMs: number;
  readonly waves: readonly WarmupWaveSlice[];
  readonly hasCycle: boolean;
  readonly cycleEngineIds: readonly string[];
  readonly blockedByCycleEngineIds: readonly string[];
  readonly missingDependencyRefs: readonly MissingDependencyRef[];
  readonly topologicalOrder: readonly string[];
}

export type MemoryGovernanceActionKind =
  | "evict-vram-cache"
  | "demote-wasm-snapshot"
  | "unload-cold-module";

export type MemoryPressureLevel =
  | "healthy"
  | "elevated"
  | "warning"
  | "emergency";

export interface MemoryGovernanceAction {
  readonly stepIndex: number;
  readonly engineId: string;
  readonly waveNumber: number;
  readonly priorityTier: StudioEnginePriorityTier;
  readonly action: MemoryGovernanceActionKind;
  readonly reclaimedWasmHeapBytes: number;
  readonly reclaimedVramBytes: number;
  readonly stalenessMs: number;
  readonly reloadPenaltyMs: number;
  readonly score: number;
  readonly reasonKo: string;
}

export interface DualPoolSnapshot {
  readonly wasmHeapBytes: number;
  readonly wasmHeapBudgetBytes: number;
  readonly wasmHeapUtilizationRatio: number;
  readonly vramBytes: number;
  readonly vramBudgetBytes: number;
  readonly vramUtilizationRatio: number;
  readonly pressureLevel: MemoryPressureLevel;
}

export interface DualPoolGovernanceOptions {
  readonly deviceTier: DeviceMemoryTier;
  readonly nowMs?: number;
  readonly targetUtilizationRatio?: number;
  readonly warningUtilizationRatio?: number;
  readonly emergencyUtilizationRatio?: number;
  readonly wasmHeapBudgetBytesOverride?: number;
  readonly vramBudgetBytesOverride?: number;
}

export interface DualPoolMemoryGovernancePlan {
  readonly deviceTier: DeviceMemoryTier;
  readonly budget: DeviceMemoryBudgetPreset;
  readonly targetUtilizationRatio: number;
  readonly before: DualPoolSnapshot;
  readonly after: DualPoolSnapshot;
  readonly protectedEngineIds: readonly string[];
  readonly protectedWasmHeapBytes: number;
  readonly protectedVramBytes: number;
  readonly actions: readonly MemoryGovernanceAction[];
  readonly totalReclaimedWasmHeapBytes: number;
  readonly totalReclaimedVramBytes: number;
  readonly budgetSatisfied: boolean;
  readonly cannotSatisfyBudget: boolean;
  readonly recoveryRecommendationsKo: readonly string[];
}

export type TelemetryGovernanceStatus = "PASS" | "WARN" | "FAIL";

export interface SlaComplianceReport {
  readonly coldStartP95Pass: boolean;
  readonly coldStartP99Pass: boolean;
  readonly warmInvokeP95Pass: boolean;
  readonly warmInvokeP99Pass: boolean;
  readonly jitterCvPass: boolean;
  readonly zeroEagerBundlePass: boolean;
  readonly memoryBudgetPass: boolean;
  readonly warmupAcyclicPass: boolean;
  readonly violationsKo: readonly string[];
  readonly warningsKo: readonly string[];
}

export interface StudioTelemetryGovernorInput {
  readonly scenarioName?: string;
  readonly capturedAtIso?: string;
  readonly nowMs?: number;
  readonly deviceTier: DeviceMemoryTier;
  readonly entries: readonly StudioEngineTelemetryEntry[];
  readonly slaOverrides?: Partial<TelemetrySlaThresholds>;
  readonly warmupOptions?: WarmupPlanOptions;
  readonly targetUtilizationRatio?: number;
  readonly wasmHeapBudgetBytesOverride?: number;
  readonly vramBudgetBytesOverride?: number;
}

export interface TelemetryWaveRange {
  readonly minWave: number;
  readonly maxWave: number;
}

export interface StudioTelemetryGovernorReport {
  readonly scenarioName: string;
  readonly capturedAtIso: string;
  readonly status: TelemetryGovernanceStatus;
  readonly engineCount: number;
  readonly waveRange: TelemetryWaveRange;
  readonly slaThresholds: TelemetrySlaThresholds;
  readonly coldStartPercentiles: LatencyPercentileStats;
  readonly warmInvokePercentiles: LatencyPercentileStats;
  readonly eagerBundleAudit: ZeroEagerBundleAuditResult;
  readonly coldStartOutliers: ColdStartOutlierReport;
  readonly warmupPlan: FrameBudgetWarmupPlan;
  readonly memoryGovernance: DualPoolMemoryGovernancePlan;
  readonly slaCompliance: SlaComplianceReport;
  readonly fingerprintSha256: string;
  readonly summaryKo: string;
  readonly dashboardSvg: string;
}

export const DEFAULT_TELEMETRY_SLA_THRESHOLDS: TelemetrySlaThresholds = {
  maxColdStartP95Ms: 35,
  maxColdStartP99Ms: 60,
  maxWarmInvokeP95Ms: 8,
  maxWarmInvokeP99Ms: 14,
  maxJitterCv: 0.65,
  maxEagerBundleBytes: 0,
  outlierModifiedZThreshold: 3.5,
  outlierCriticalModifiedZThreshold: 7.0,
  targetMemoryUtilizationRatio: 0.75,
  warningMemoryUtilizationRatio: 0.8,
  emergencyMemoryUtilizationRatio: 0.95,
  frameBudgetMs: 16.67,
};
