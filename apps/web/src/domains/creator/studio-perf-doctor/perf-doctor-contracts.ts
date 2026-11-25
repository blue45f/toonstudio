/**
 * Wave 41E — 제공된 프레임 샘플 분석 · WebGPU/WASM/타일캐시/OPFS WAL 헬스 진단기 ·
 * 자동 적응형 성능 가드레일 닥터 엔진 (100% 결정론 순수 함수 · 외부 스토리지 미사용).
 */

export type TargetRefreshHz = 120 | 60;
export type FramePipelineStageId = "input" | "brushWasm" | "webgpuComposite" | "uiReact";
export type JankSpikeSeverity = "minor" | "moderate" | "severe";
export type FrameBudgetGrade = "optimal" | "guarded" | "janky" | "stalled";
export type VramPressureLevel = "nominal" | "warm" | "pressure" | "critical";
export type GpuRuntimeBackend = "webgpu" | "webgl2" | "skia-cpu";
export type WalCheckpointMode = "PASSIVE" | "FULL" | "TRUNCATE";
export type RuntimeHealthGrade = "S" | "A" | "B" | "C" | "D";
export type RuntimeSubsystemId = "frame-budget" | "vram" | "tile-cache" | "opfs-wal";
export type GuardrailProfileId = "smooth-120hz" | "precision-4k";
export type GuardrailVisualImpact = "zero" | "preview-only" | "cadence";
export type PerfDoctorScenarioId = "nominal-120hz" | "brush-jank-warm" | "vram-tile-pressure" | "critical-opfs-stall";

export const JANK_THRESHOLD_120HZ_MS = 8.33;
export const JANK_THRESHOLD_60HZ_MS = 16.67;
export const DEFAULT_RING_CAPACITY = 120;
export const MIN_RING_CAPACITY = 16;
export const MAX_RING_CAPACITY = 2048;

export const FRAME_PIPELINE_STAGE_IDS: readonly FramePipelineStageId[] = [
  "input", "brushWasm", "webgpuComposite", "uiReact",
];
export const PERF_DOCTOR_SCENARIO_IDS: readonly PerfDoctorScenarioId[] = [
  "nominal-120hz", "brush-jank-warm", "vram-tile-pressure", "critical-opfs-stall",
];

export interface FrameStageBreakdownMs {
  readonly input: number; readonly brushWasm: number; readonly webgpuComposite: number; readonly uiReact: number;
}
export interface FrameTimeSampleInput {
  readonly timestampMs?: number; readonly totalMs?: number; readonly stages: FrameStageBreakdownMs;
}
export interface FrameTimeSample {
  readonly frameIndex: number; readonly timestampMs: number; readonly totalMs: number; readonly stages: FrameStageBreakdownMs;
}
export interface FrameTimeRingBuffer {
  readonly capacity: number; readonly writeIndex: number; readonly size: number; readonly totalRecorded: number;
  readonly slots: readonly (FrameTimeSample | null)[];
}
export interface AnalyzeFrameTimeOptions {
  readonly targetHz?: TargetRefreshHz; readonly spikeThresholdMs?: number;
}
export interface FrameJankSpikeRecord {
  readonly frameIndex: number; readonly totalMs: number; readonly overBudgetMs: number;
  readonly severity: JankSpikeSeverity; readonly dominantStage: FramePipelineStageId;
}
export interface JankSpikeSummary {
  readonly thresholdMs: number; readonly over833MsCount: number; readonly totalSpikes: number; readonly jankRatePct: number;
  readonly minorCount: number; readonly moderateCount: number; readonly severeCount: number; readonly longestStreak: number;
  readonly topSpikes: readonly FrameJankSpikeRecord[];
}
export interface FrameStageMetric {
  readonly stageId: FramePipelineStageId; readonly meanMs: number; readonly p95Ms: number; readonly maxMs: number;
  readonly sharePct: number; readonly spikeAttributionCount: number;
}
export interface FrameHistogramBin {
  readonly id: string; readonly label: string; readonly minMs: number; readonly maxMs: number | null;
  readonly count: number; readonly ratioPct: number; readonly isOverBudget: boolean;
}
export interface FrameTimeRingAnalysis {
  readonly measurementVerified: false; readonly dataSource: "provided-samples";
  readonly sampleCount: number; readonly capacity: number; readonly totalRecorded: number;
  readonly targetHz: TargetRefreshHz; readonly budgetMs: number;
  readonly meanMs: number; readonly minMs: number; readonly maxMs: number; readonly stdDevMs: number;
  readonly p50Ms: number; readonly p95Ms: number; readonly p99Ms: number;
  readonly averageFps: number; readonly onePercentLowFps: number;
  readonly jank: JankSpikeSummary;
  readonly stages: Readonly<Record<FramePipelineStageId, FrameStageMetric>>;
  readonly overheadMeanMs: number; readonly overheadSharePct: number; readonly dominantStage: FramePipelineStageId;
  readonly histogram: readonly FrameHistogramBin[];
  readonly recentWindowMs: readonly number[];
  readonly grade: FrameBudgetGrade; readonly withinTargetBudget: boolean;
}
export interface SparseTileCacheSnapshot {
  readonly tileHits: number; readonly tileMisses: number; readonly residentTiles: number; readonly maxResidentTiles: number;
  readonly evictionsPerSec: number; readonly dirtyTilesQueued: number; readonly tileSizePx: 256 | 512;
}
export interface GpuVramSnapshot {
  readonly allocatedMb: number; readonly budgetMb: number; readonly textureAtlasMb: number;
  readonly renderTargetMb: number; readonly stagingBufferMb: number; readonly deviceLostCount: number;
  readonly backend: GpuRuntimeBackend;
}
export interface OpfsWalSnapshot {
  readonly usedBytes: number; readonly quotaBytes: number; readonly walSizeBytes: number;
  readonly walFramesPending: number; readonly lastCheckpointDelayMs: number; readonly avgCheckpointDelayMs: number;
  readonly checkpointBlocked: boolean;
}
export interface StudioCanvasContextSnapshot {
  readonly canvasWidthPx: number; readonly canvasHeightPx: number; readonly layerCount: number;
  readonly activeBrushRadiusPx: number; readonly dpr: number;
}
export interface StudioRuntimeTelemetryInput {
  readonly tileCache: SparseTileCacheSnapshot; readonly vram: GpuVramSnapshot; readonly opfsWal: OpfsWalSnapshot;
  readonly canvasContext?: StudioCanvasContextSnapshot; readonly frameAnalysis?: FrameTimeRingAnalysis;
}
export interface SparseTileCacheDiagnosis extends Omit<SparseTileCacheSnapshot, "tileHits" | "tileMisses"> {
  readonly hitRatePct: number; readonly missRatePct: number; readonly occupancyPct: number;
  readonly thrashingDetected: boolean; readonly level: VramPressureLevel;
}
export interface GpuVramDiagnosis extends GpuVramSnapshot {
  readonly freeMb: number; readonly utilizationPct: number; readonly level: VramPressureLevel;
}
export interface OpfsWalDiagnosis {
  readonly usedMb: number; readonly quotaMb: number; readonly freeMb: number; readonly quotaUsagePct: number;
  readonly walSizeMb: number; readonly walFramesPending: number; readonly lastCheckpointDelayMs: number;
  readonly avgCheckpointDelayMs: number; readonly checkpointBlocked: boolean;
  readonly recommendedCheckpointMode: WalCheckpointMode; readonly level: VramPressureLevel;
}
export interface RuntimeBottleneckFinding {
  readonly id: string; readonly subsystem: RuntimeSubsystemId; readonly severity: VramPressureLevel;
  readonly metricText: string; readonly titleKo: string; readonly titleEn: string;
  readonly detailKo: string; readonly detailEn: string;
}
export interface StudioRuntimeHealthDiagnosis {
  readonly runtimeMeasured: false; readonly scope: "provided-input-model";
  readonly overallLevel: VramPressureLevel; readonly healthScore: number; readonly healthGrade: RuntimeHealthGrade;
  readonly vram: GpuVramDiagnosis; readonly tileCache: SparseTileCacheDiagnosis; readonly opfsWal: OpfsWalDiagnosis;
  readonly bottlenecks: readonly RuntimeBottleneckFinding[]; readonly requiresIntervention: boolean;
}
export interface GuardrailPrescriptionStep {
  readonly id: string; readonly order: number; readonly subsystem: RuntimeSubsystemId; readonly visualImpact: GuardrailVisualImpact;
  readonly titleKo: string; readonly titleEn: string; readonly actionKo: string; readonly actionEn: string;
  readonly estimatedP99ReductionMs: number; readonly estimatedVramReleaseMb: number;
  readonly estimatedTileHitGainPct: number; readonly estimatedWalReductionMs: number; readonly recommended: boolean;
}
export interface AdaptiveGuardrailPlan {
  readonly projectionBasis: "fixed-heuristic";
  readonly profileId: GuardrailProfileId; readonly titleKo: string; readonly titleEn: string;
  readonly taglineKo: string; readonly taglineEn: string; readonly targetRefreshHz: TargetRefreshHz;
  readonly strokeResolutionScale: number; readonly commitResolutionScale: number; readonly visualFidelityScore: number;
  readonly projectedP99Ms: number; readonly projectedFps: number; readonly projectedVramUsagePct: number;
  readonly projectedVramSavingsMb: number; readonly projectedTileHitRatePct: number; readonly projectedWalDelayMs: number;
  readonly steps: readonly GuardrailPrescriptionStep[];
  readonly tradeoffSummaryKo: string; readonly tradeoffSummaryEn: string;
}
export interface GuardrailComparisonRow {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly smooth120HzValue: string; readonly precision4KValue: string; readonly winner: GuardrailProfileId | "tie";
}
export interface RecommendGuardrailInput {
  readonly diagnosis: StudioRuntimeHealthDiagnosis; readonly frameAnalysis?: FrameTimeRingAnalysis;
  readonly preferredProfile?: GuardrailProfileId; readonly canvasContext?: StudioCanvasContextSnapshot;
}
export interface AdaptiveGuardrailReport {
  readonly escalationTier: 0 | 1 | 2 | 3; readonly preferredProfile: GuardrailProfileId;
  readonly autoRecommendedProfile: GuardrailProfileId; readonly activePlan: AdaptiveGuardrailPlan;
  readonly smooth120Hz: AdaptiveGuardrailPlan; readonly precision4K: AdaptiveGuardrailPlan;
  readonly comparisonRows: readonly GuardrailComparisonRow[];
}
export interface StudioPerfDoctorSnapshot {
  readonly source: "synthetic";
  readonly scenarioId: PerfDoctorScenarioId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly ring: FrameTimeRingBuffer; readonly telemetry: StudioRuntimeTelemetryInput;
}
export interface GuardrailApplicationResult {
  readonly scope: "example-only"; readonly runtimeApplied: false;
  readonly appliedStepIds: readonly string[]; readonly profileId: GuardrailProfileId; readonly targetHzAfter: TargetRefreshHz;
  readonly nextRing: FrameTimeRingBuffer; readonly nextTelemetry: StudioRuntimeTelemetryInput;
  readonly beforeFrameAnalysis: FrameTimeRingAnalysis; readonly afterFrameAnalysis: FrameTimeRingAnalysis;
  readonly beforeDiagnosis: StudioRuntimeHealthDiagnosis; readonly afterDiagnosis: StudioRuntimeHealthDiagnosis;
  readonly deltas: {
    readonly p99DeltaMs: number; readonly vramPctDelta: number; readonly tileHitPctDelta: number;
    readonly walDelayDeltaMs: number; readonly healthScoreDelta: number;
  };
}
