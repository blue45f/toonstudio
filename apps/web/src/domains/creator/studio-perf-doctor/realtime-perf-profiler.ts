/**
 * Wave 41E — 실시간 120Hz/60Hz 프레임타임 프로파일러 · WebGPU/WASM/타일캐시/OPFS WAL 헬스 진단기 ·
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
  readonly scenarioId: PerfDoctorScenarioId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly ring: FrameTimeRingBuffer; readonly telemetry: StudioRuntimeTelemetryInput;
}
export interface GuardrailApplicationResult {
  readonly appliedStepIds: readonly string[]; readonly profileId: GuardrailProfileId; readonly targetHzAfter: TargetRefreshHz;
  readonly nextRing: FrameTimeRingBuffer; readonly nextTelemetry: StudioRuntimeTelemetryInput;
  readonly beforeFrameAnalysis: FrameTimeRingAnalysis; readonly afterFrameAnalysis: FrameTimeRingAnalysis;
  readonly beforeDiagnosis: StudioRuntimeHealthDiagnosis; readonly afterDiagnosis: StudioRuntimeHealthDiagnosis;
  readonly deltas: {
    readonly p99DeltaMs: number; readonly vramPctDelta: number; readonly tileHitPctDelta: number;
    readonly walDelayDeltaMs: number; readonly healthScoreDelta: number;
  };
}

const PRESSURE_RANK: Readonly<Record<VramPressureLevel, number>> = { nominal: 0, warm: 1, pressure: 2, critical: 3 };
const BYTES_PER_MB = 1024 * 1024;
const HISTOGRAM_BINS: readonly { readonly id: string; readonly label: string; readonly minMs: number; readonly maxMs: number | null }[] = [
  { id: "bin-0-4", label: "0–4ms", minMs: 0, maxMs: 4 },
  { id: "bin-4-6", label: "4–6ms", minMs: 4, maxMs: 6 },
  { id: "bin-6-833", label: "6–8.33ms", minMs: 6, maxMs: JANK_THRESHOLD_120HZ_MS },
  { id: "bin-833-125", label: "8.33–12.5ms", minMs: JANK_THRESHOLD_120HZ_MS, maxMs: 12.5 },
  { id: "bin-125-1667", label: "12.5–16.67ms", minMs: 12.5, maxMs: JANK_THRESHOLD_60HZ_MS },
  { id: "bin-1667-25", label: "16.67–25ms", minMs: JANK_THRESHOLD_60HZ_MS, maxMs: 25 },
  { id: "bin-25-plus", label: "25ms+", minMs: 25, maxMs: null },
];

const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const nonNeg = (v: number | undefined): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const roundTo = (v: number, d = 2): number => (Number.isFinite(v) ? Math.round(v * Math.pow(10, d)) / Math.pow(10, d) : 0);
const maxPressure = (a: VramPressureLevel, b: VramPressureLevel): VramPressureLevel => (PRESSURE_RANK[a] >= PRESSURE_RANK[b] ? a : b);

function computePercentile(sortedAsc: readonly number[], percentile: number): number {
  if (sortedAsc.length === 0) return 0;
  const pos = (clamp(percentile, 0, 100) / 100) * (sortedAsc.length - 1);
  const lo = sortedAsc[Math.floor(pos)] ?? 0;
  const hi = sortedAsc[Math.ceil(pos)] ?? lo;
  return lo + (hi - lo) * (pos - Math.floor(pos));
}

function resolveDominantStage(stages: FrameStageBreakdownMs): FramePipelineStageId {
  let best: FramePipelineStageId = "brushWasm";
  let bestVal = -1;
  for (const id of FRAME_PIPELINE_STAGE_IDS) {
    if (stages[id] > bestVal) { bestVal = stages[id]; best = id; }
  }
  return best;
}

function sanitizeStages(stages: FrameStageBreakdownMs): FrameStageBreakdownMs {
  return {
    input: roundTo(nonNeg(stages.input), 3),
    brushWasm: roundTo(nonNeg(stages.brushWasm), 3),
    webgpuComposite: roundTo(nonNeg(stages.webgpuComposite), 3),
    uiReact: roundTo(nonNeg(stages.uiReact), 3),
  };
}

/** 고정 길이 불변 프레임타임 링버퍼를 생성한다. */
export function createFrameTimeRingBuffer(capacity: number = DEFAULT_RING_CAPACITY): FrameTimeRingBuffer {
  const safeCapacity = Math.round(clamp(capacity, MIN_RING_CAPACITY, MAX_RING_CAPACITY));
  return { capacity: safeCapacity, writeIndex: 0, size: 0, totalRecorded: 0, slots: Array.from({ length: safeCapacity }, () => null) };
}

/** 여러 프레임 샘플을 고정 길이 링버퍼에 불변 기록한다. */
export function pushFrameSamples(ring: FrameTimeRingBuffer, samples: readonly FrameTimeSampleInput[]): FrameTimeRingBuffer {
  if (samples.length === 0) return ring;
  const nextSlots = ring.slots.slice();
  let writeIndex = ring.writeIndex;
  let size = ring.size;
  let totalRecorded = ring.totalRecorded;
  for (const sample of samples) {
    const stages = sanitizeStages(sample.stages);
    const stageSum = stages.input + stages.brushWasm + stages.webgpuComposite + stages.uiReact;
    const totalMs = roundTo(Math.max(nonNeg(sample.totalMs), stageSum), 3);
    totalRecorded += 1;
    const timestampMs =
      typeof sample.timestampMs === "number" && Number.isFinite(sample.timestampMs)
        ? roundTo(Math.max(0, sample.timestampMs), 2)
        : roundTo(totalRecorded * JANK_THRESHOLD_120HZ_MS, 2);
    nextSlots[writeIndex] = { frameIndex: totalRecorded, timestampMs, totalMs, stages };
    writeIndex = (writeIndex + 1) % ring.capacity;
    size = Math.min(ring.capacity, size + 1);
  }
  return { capacity: ring.capacity, writeIndex, size, totalRecorded, slots: nextSlots };
}

/** 단일 프레임 샘플을 링버퍼에 기록한다. */
export function pushFrameSample(ring: FrameTimeRingBuffer, sample: FrameTimeSampleInput): FrameTimeRingBuffer {
  return pushFrameSamples(ring, [sample]);
}

/** 링버퍼 샘플을 가장 오래된 순서부터 시간순으로 반환한다. */
export function readFrameSamplesChronological(ring: FrameTimeRingBuffer): readonly FrameTimeSample[] {
  if (ring.size === 0) return [];
  const startIdx = ring.size < ring.capacity ? 0 : ring.writeIndex;
  const ordered: FrameTimeSample[] = [];
  for (let i = 0; i < ring.size; i += 1) {
    const slot = ring.slots[(startIdx + i) % ring.capacity];
    if (slot !== null && slot !== undefined) ordered.push(slot);
  }
  return ordered;
}

function isRingBuffer(src: FrameTimeRingBuffer | readonly FrameTimeSample[]): src is FrameTimeRingBuffer {
  return !Array.isArray(src);
}

/** 고정 길이 링버퍼(또는 샘플 배열)의 p50/p95/p99, 1% low FPS, > 8.33ms 쟁크 분류, 4스테이지 비중을 분석한다. */
export function analyzeFrameTimeRing(
  source: FrameTimeRingBuffer | readonly FrameTimeSample[],
  options?: AnalyzeFrameTimeOptions,
): FrameTimeRingAnalysis {
  const targetHz: TargetRefreshHz = options?.targetHz ?? 120;
  const budgetMs = targetHz === 120 ? JANK_THRESHOLD_120HZ_MS : JANK_THRESHOLD_60HZ_MS;
  const thresholdMs =
    typeof options?.spikeThresholdMs === "number" && Number.isFinite(options.spikeThresholdMs) && options.spikeThresholdMs > 0
      ? roundTo(options.spikeThresholdMs, 2)
      : budgetMs;

  const samples = isRingBuffer(source) ? readFrameSamplesChronological(source) : source;
  const capacity = isRingBuffer(source) ? source.capacity : Math.max(samples.length, DEFAULT_RING_CAPACITY);
  const totalRecorded = isRingBuffer(source) ? source.totalRecorded : samples.length;
  const emptyStages: Record<FramePipelineStageId, FrameStageMetric> = {
    input: { stageId: "input", meanMs: 0, p95Ms: 0, maxMs: 0, sharePct: 0, spikeAttributionCount: 0 },
    brushWasm: { stageId: "brushWasm", meanMs: 0, p95Ms: 0, maxMs: 0, sharePct: 0, spikeAttributionCount: 0 },
    webgpuComposite: { stageId: "webgpuComposite", meanMs: 0, p95Ms: 0, maxMs: 0, sharePct: 0, spikeAttributionCount: 0 },
    uiReact: { stageId: "uiReact", meanMs: 0, p95Ms: 0, maxMs: 0, sharePct: 0, spikeAttributionCount: 0 },
  };

  if (samples.length === 0) {
    return {
      sampleCount: 0, capacity, totalRecorded, targetHz, budgetMs,
      meanMs: 0, minMs: 0, maxMs: 0, stdDevMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, averageFps: 0, onePercentLowFps: 0,
      jank: { thresholdMs, over833MsCount: 0, totalSpikes: 0, jankRatePct: 0, minorCount: 0, moderateCount: 0, severeCount: 0, longestStreak: 0, topSpikes: [] },
      stages: emptyStages, overheadMeanMs: 0, overheadSharePct: 0, dominantStage: "brushWasm",
      histogram: HISTOGRAM_BINS.map((b) => ({ ...b, count: 0, ratioPct: 0, isOverBudget: b.minMs >= thresholdMs })),
      recentWindowMs: [], grade: "optimal", withinTargetBudget: true,
    };
  }

  const totals = samples.map((s) => nonNeg(s.totalMs));
  const sorted = totals.slice().sort((a, b) => a - b);
  const meanMs = totals.reduce((a, v) => a + v, 0) / totals.length;
  const stdDevMs = Math.sqrt(totals.reduce((a, v) => a + (v - meanMs) * (v - meanMs), 0) / totals.length);
  const p50Ms = computePercentile(sorted, 50);
  const p95Ms = computePercentile(sorted, 95);
  const p99Ms = computePercentile(sorted, 99);
  const slowSlice = sorted.slice(sorted.length - Math.max(1, Math.ceil(sorted.length * 0.01)));
  const slowMeanMs = slowSlice.reduce((a, v) => a + v, 0) / slowSlice.length;

  let over833MsCount = 0; let minorCount = 0; let moderateCount = 0; let severeCount = 0;
  let curStreak = 0; let longestStreak = 0; let overheadSum = 0;
  const spikeRecords: FrameJankSpikeRecord[] = [];
  const spikeAttr: Record<FramePipelineStageId, number> = { input: 0, brushWasm: 0, webgpuComposite: 0, uiReact: 0 };
  const stageSeries: Record<FramePipelineStageId, number[]> = { input: [], brushWasm: [], webgpuComposite: [], uiReact: [] };
  const binCounts = HISTOGRAM_BINS.map(() => 0);

  for (const sample of samples) {
    const clean = sanitizeStages(sample.stages);
    const stageSum = clean.input + clean.brushWasm + clean.webgpuComposite + clean.uiReact;
    const total = Math.max(nonNeg(sample.totalMs), stageSum);
    overheadSum += Math.max(0, total - stageSum);
    for (const id of FRAME_PIPELINE_STAGE_IDS) stageSeries[id].push(clean[id]);

    if (total > JANK_THRESHOLD_120HZ_MS) over833MsCount += 1;
    if (total > thresholdMs) {
      const severity: JankSpikeSeverity = total > thresholdMs * 2.5 ? "severe" : total > thresholdMs * 1.5 ? "moderate" : "minor";
      const dominant = resolveDominantStage(clean);
      spikeAttr[dominant] += 1;
      if (severity === "minor") minorCount += 1;
      else if (severity === "moderate") moderateCount += 1;
      else severeCount += 1;
      curStreak += 1;
      if (curStreak > longestStreak) longestStreak = curStreak;
      spikeRecords.push({ frameIndex: sample.frameIndex, totalMs: roundTo(total, 2), overBudgetMs: roundTo(total - thresholdMs, 2), severity, dominantStage: dominant });
    } else {
      curStreak = 0;
    }

    for (let idx = 0; idx < HISTOGRAM_BINS.length; idx += 1) {
      const bin = HISTOGRAM_BINS[idx];
      if (!bin) continue;
      if ((idx === 0 ? total >= bin.minMs : total > bin.minMs) && (bin.maxMs === null || total <= bin.maxMs)) {
        binCounts[idx] = (binCounts[idx] ?? 0) + 1;
        break;
      }
    }
  }

  const totalSpikes = minorCount + moderateCount + severeCount;
  const jankRatePct = (totalSpikes / samples.length) * 100;
  const stageMetrics: Record<FramePipelineStageId, FrameStageMetric> = { ...emptyStages };
  let dominantStage: FramePipelineStageId = "brushWasm";
  let highestMean = -1;

  for (const id of FRAME_PIPELINE_STAGE_IDS) {
    const arr = stageSeries[id];
    const stSorted = arr.slice().sort((a, b) => a - b);
    const stMean = arr.reduce((a, v) => a + v, 0) / arr.length;
    stageMetrics[id] = {
      stageId: id, meanMs: roundTo(stMean, 2), p95Ms: roundTo(computePercentile(stSorted, 95), 2),
      maxMs: roundTo(stSorted[stSorted.length - 1] ?? 0, 2),
      sharePct: roundTo(meanMs > 0 ? (stMean / meanMs) * 100 : 0, 1), spikeAttributionCount: spikeAttr[id],
    };
    if (stMean > highestMean) { highestMean = stMean; dominantStage = id; }
  }

  const overheadMeanMs = overheadSum / samples.length;
  const grade: FrameBudgetGrade =
    severeCount >= 2 || jankRatePct >= 25 || p95Ms > thresholdMs * 1.8 ? "stalled"
      : severeCount >= 1 || jankRatePct >= 10 || p95Ms > thresholdMs * 1.15 ? "janky"
        : totalSpikes > 0 || p99Ms > thresholdMs ? "guarded" : "optimal";

  return {
    sampleCount: samples.length, capacity, totalRecorded, targetHz, budgetMs: roundTo(budgetMs, 2),
    meanMs: roundTo(meanMs, 2), minMs: roundTo(sorted[0] ?? 0, 2), maxMs: roundTo(sorted[sorted.length - 1] ?? 0, 2),
    stdDevMs: roundTo(stdDevMs, 2), p50Ms: roundTo(p50Ms, 2), p95Ms: roundTo(p95Ms, 2), p99Ms: roundTo(p99Ms, 2),
    averageFps: roundTo(meanMs > 0 ? 1000 / meanMs : 0, 1),
    onePercentLowFps: roundTo(slowMeanMs > 0 ? 1000 / slowMeanMs : 0, 1),
    jank: {
      thresholdMs: roundTo(thresholdMs, 2), over833MsCount, totalSpikes, jankRatePct: roundTo(jankRatePct, 1),
      minorCount, moderateCount, severeCount, longestStreak,
      topSpikes: spikeRecords.slice().sort((a, b) => b.totalMs - a.totalMs || a.frameIndex - b.frameIndex).slice(0, 6),
    },
    stages: stageMetrics, overheadMeanMs: roundTo(overheadMeanMs, 2),
    overheadSharePct: roundTo(meanMs > 0 ? (overheadMeanMs / meanMs) * 100 : 0, 1), dominantStage,
    histogram: HISTOGRAM_BINS.map((spec, idx) => ({
      ...spec, count: binCounts[idx] ?? 0,
      ratioPct: roundTo(((binCounts[idx] ?? 0) / samples.length) * 100, 1), isOverBudget: spec.minMs >= thresholdMs,
    })),
    recentWindowMs: samples.slice(-48).map((s) => roundTo(s.totalMs, 2)),
    grade, withinTargetBudget: p95Ms <= thresholdMs && severeCount === 0,
  };
}

/** 희소 타일 캐시 히트율 · GPU VRAM 압박 등급 · OPFS 할당량 및 SQLite WAL 체크포인트 지연을 종합 진단한다. */
export function diagnoseStudioRuntimeHealth(input: StudioRuntimeTelemetryInput): StudioRuntimeHealthDiagnosis {
  const vramBudget = Math.max(1, nonNeg(input.vram.budgetMb));
  const vramAlloc = nonNeg(input.vram.allocatedMb);
  const vramRatio = vramAlloc / vramBudget;
  const vramLevel: VramPressureLevel =
    input.vram.deviceLostCount > 0 || vramRatio >= 0.9 ? "critical" : vramRatio >= 0.78 ? "pressure" : vramRatio >= 0.62 ? "warm" : "nominal";
  const vram: GpuVramDiagnosis = {
    allocatedMb: roundTo(vramAlloc, 1), budgetMb: roundTo(vramBudget, 1), freeMb: roundTo(Math.max(0, vramBudget - vramAlloc), 1),
    utilizationPct: roundTo(vramRatio * 100, 1), textureAtlasMb: roundTo(nonNeg(input.vram.textureAtlasMb), 1),
    renderTargetMb: roundTo(nonNeg(input.vram.renderTargetMb), 1), stagingBufferMb: roundTo(nonNeg(input.vram.stagingBufferMb), 1),
    deviceLostCount: Math.round(nonNeg(input.vram.deviceLostCount)), backend: input.vram.backend, level: vramLevel,
  };

  const hits = nonNeg(input.tileCache.tileHits);
  const misses = nonNeg(input.tileCache.tileMisses);
  const hitRatePct = hits + misses > 0 ? roundTo((hits / (hits + misses)) * 100, 1) : 100;
  const maxTiles = Math.max(1, nonNeg(input.tileCache.maxResidentTiles));
  const resTiles = nonNeg(input.tileCache.residentTiles);
  const occPct = roundTo((resTiles / maxTiles) * 100, 1);
  const evict = roundTo(nonNeg(input.tileCache.evictionsPerSec), 1);
  const dirty = Math.round(nonNeg(input.tileCache.dirtyTilesQueued));
  const tileLevel: VramPressureLevel =
    hitRatePct < 70 || evict >= 40 || dirty >= 96 ? "critical"
      : hitRatePct < 82 || evict >= 22 || dirty >= 48 || occPct >= 94 ? "pressure"
        : hitRatePct < 91 || evict >= 10 || occPct >= 82 ? "warm" : "nominal";
  const tileCache: SparseTileCacheDiagnosis = {
    hitRatePct, missRatePct: roundTo(100 - hitRatePct, 1), occupancyPct: occPct,
    residentTiles: Math.round(resTiles), maxResidentTiles: Math.round(maxTiles),
    evictionsPerSec: evict, dirtyTilesQueued: dirty, tileSizePx: input.tileCache.tileSizePx,
    thrashingDetected: hitRatePct < 82 || evict >= 22 || dirty >= 48, level: tileLevel,
  };

  const quotaBytes = Math.max(1, nonNeg(input.opfsWal.quotaBytes));
  const usedBytes = nonNeg(input.opfsWal.usedBytes);
  const quotaPct = roundTo((usedBytes / quotaBytes) * 100, 1);
  const walFrames = Math.round(nonNeg(input.opfsWal.walFramesPending));
  const lastDelay = roundTo(nonNeg(input.opfsWal.lastCheckpointDelayMs), 1);
  const avgDelay = roundTo(nonNeg(input.opfsWal.avgCheckpointDelayMs), 1);
  const opfsLevel: VramPressureLevel =
    input.opfsWal.checkpointBlocked || quotaPct >= 90 || lastDelay >= 320 || walFrames >= 1500 ? "critical"
      : quotaPct >= 78 || lastDelay >= 150 || avgDelay >= 110 || walFrames >= 800 ? "pressure"
        : quotaPct >= 62 || lastDelay >= 55 || walFrames >= 300 ? "warm" : "nominal";
  const checkpointMode: WalCheckpointMode =
    opfsLevel === "critical" || walFrames >= 1000 || quotaPct >= 82 ? "TRUNCATE"
      : opfsLevel === "pressure" || walFrames >= 350 ? "FULL" : "PASSIVE";
  const opfsWal: OpfsWalDiagnosis = {
    usedMb: roundTo(usedBytes / BYTES_PER_MB, 1), quotaMb: roundTo(quotaBytes / BYTES_PER_MB, 1),
    freeMb: roundTo(Math.max(0, quotaBytes - usedBytes) / BYTES_PER_MB, 1), quotaUsagePct: quotaPct,
    walSizeMb: roundTo(nonNeg(input.opfsWal.walSizeBytes) / BYTES_PER_MB, 2), walFramesPending: walFrames,
    lastCheckpointDelayMs: lastDelay, avgCheckpointDelayMs: avgDelay,
    checkpointBlocked: input.opfsWal.checkpointBlocked, recommendedCheckpointMode: checkpointMode, level: opfsLevel,
  };

  const frameLevel: VramPressureLevel = input.frameAnalysis
    ? input.frameAnalysis.grade === "stalled" ? "critical"
      : input.frameAnalysis.grade === "janky" ? "pressure"
        : input.frameAnalysis.grade === "guarded" ? "warm" : "nominal"
    : "nominal";
  const overallLevel = maxPressure(maxPressure(vramLevel, tileLevel), maxPressure(opfsLevel, frameLevel));

  const bottlenecks: RuntimeBottleneckFinding[] = [];
  if (vramLevel !== "nominal") {
    bottlenecks.push({
      id: "bn-vram-pressure", subsystem: "vram", severity: vramLevel,
      metricText: `${vram.allocatedMb}/${vram.budgetMb} MB (${vram.utilizationPct}%)`,
      titleKo: vramLevel === "critical" ? "GPU VRAM 임계 포화" : "GPU VRAM 압박 감지",
      titleEn: vramLevel === "critical" ? "GPU VRAM Critical Saturation" : "GPU VRAM Pressure Detected",
      detailKo: `아틀라스 ${vram.textureAtlasMb}MB · 렌더타깃 ${vram.renderTargetMb}MB가 예산의 ${vram.utilizationPct}%를 점유 중입니다.`,
      detailEn: `Atlas (${vram.textureAtlasMb}MB) & render targets (${vram.renderTargetMb}MB) use ${vram.utilizationPct}% of VRAM.`,
    });
  }
  if (tileLevel !== "nominal") {
    bottlenecks.push({
      id: "bn-tile-cache", subsystem: "tile-cache", severity: tileLevel,
      metricText: `Hit ${tileCache.hitRatePct}% · Evict ${tileCache.evictionsPerSec}/s`,
      titleKo: tileCache.thrashingDetected ? "희소 타일 캐시 스래싱 발생" : "희소 타일 캐시 적중률 저하",
      titleEn: tileCache.thrashingDetected ? "Sparse Tile Cache Thrashing" : "Sparse Tile Hit Rate Dip",
      detailKo: `타일 히트율 ${tileCache.hitRatePct}%, 초당 축출 ${tileCache.evictionsPerSec}타일, 더티 큐 ${tileCache.dirtyTilesQueued}개로 지연이 누적됩니다.`,
      detailEn: `Hit rate ${tileCache.hitRatePct}% with ${tileCache.evictionsPerSec} evictions/s and ${tileCache.dirtyTilesQueued} dirty tiles queued.`,
    });
  }
  if (opfsLevel !== "nominal") {
    bottlenecks.push({
      id: "bn-opfs-wal", subsystem: "opfs-wal", severity: opfsLevel,
      metricText: `WAL ${opfsWal.lastCheckpointDelayMs}ms · OPFS ${opfsWal.quotaUsagePct}%`,
      titleKo: opfsWal.checkpointBlocked ? "SQLite WAL 체크포인트 차단됨" : "OPFS 할당량 · WAL 체크포인트 지연",
      titleEn: opfsWal.checkpointBlocked ? "SQLite WAL Checkpoint Blocked" : "OPFS Quota & WAL Checkpoint Lag",
      detailKo: `대기 WAL ${opfsWal.walFramesPending}프레임(${opfsWal.walSizeMb}MB), 지연 ${opfsWal.lastCheckpointDelayMs}ms — ${checkpointMode} 실행 권장.`,
      detailEn: `${opfsWal.walFramesPending} pending WAL frames (${opfsWal.walSizeMb}MB), ${opfsWal.lastCheckpointDelayMs}ms lag; run ${checkpointMode}.`,
    });
  }
  if (input.frameAnalysis && frameLevel !== "nominal") {
    bottlenecks.push({
      id: "bn-frame-jank", subsystem: "frame-budget", severity: frameLevel,
      metricText: `p99 ${input.frameAnalysis.p99Ms}ms · 1% Low ${input.frameAnalysis.onePercentLowFps} FPS`,
      titleKo: `프레임 예산 초과 (지배 스테이지: ${input.frameAnalysis.dominantStage})`,
      titleEn: `Frame Budget Overrun (Dominant: ${input.frameAnalysis.dominantStage})`,
      detailKo: `${input.frameAnalysis.targetHz}Hz 예산(${input.frameAnalysis.budgetMs}ms) 대비 쟁크 ${input.frameAnalysis.jank.totalSpikes}회(${input.frameAnalysis.jank.jankRatePct}%) 감지.`,
      detailEn: `${input.frameAnalysis.jank.totalSpikes} spikes (${input.frameAnalysis.jank.jankRatePct}%) exceeded the ${input.frameAnalysis.targetHz}Hz budget.`,
    });
  }
  bottlenecks.sort((a, b) => PRESSURE_RANK[b.severity] - PRESSURE_RANK[a.severity]);

  const penalty =
    clamp((vram.utilizationPct - 50) * 0.75, 0, 34) + (vram.deviceLostCount > 0 ? 18 : 0) +
    clamp((95 - hitRatePct) * 0.85 + evict * 0.2, 0, 26) +
    clamp((quotaPct - 55) * 0.45 + lastDelay * 0.05, 0, 24) + (opfsWal.checkpointBlocked ? 10 : 0) +
    (input.frameAnalysis ? clamp(input.frameAnalysis.jank.jankRatePct * 0.55 + input.frameAnalysis.jank.severeCount * 2.5, 0, 24) : 0);
  const healthScore = Math.round(clamp(100 - penalty, 0, 100));
  const healthGrade: RuntimeHealthGrade =
    healthScore >= 90 ? "S" : healthScore >= 78 ? "A" : healthScore >= 64 ? "B" : healthScore >= 48 ? "C" : "D";

  return { overallLevel, healthScore, healthGrade, vram, tileCache, opfsWal, bottlenecks, requiresIntervention: overallLevel === "pressure" || overallLevel === "critical" };
}

function buildGuardrailPlan(
  profileId: GuardrailProfileId,
  tier: 0 | 1 | 2 | 3,
  diagnosis: StudioRuntimeHealthDiagnosis,
  frameAnalysis?: FrameTimeRingAnalysis,
): AdaptiveGuardrailPlan {
  const walNeed = diagnosis.opfsWal.level !== "nominal";
  const tileNeed = diagnosis.tileCache.level !== "nominal";
  const vramNeed = diagnosis.vram.level !== "nominal";
  const frameNeed = frameAnalysis ? !frameAnalysis.withinTargetBudget : tier >= 1;
  const strokeScale = profileId === "smooth-120hz" ? (tier >= 3 ? 0.75 : tier === 2 ? 0.85 : tier === 1 ? 0.92 : 1) : 1;

  const steps: readonly GuardrailPrescriptionStep[] = [
    {
      id: `${profileId}-wal-checkpoint`, order: 1, subsystem: "opfs-wal", visualImpact: "zero",
      titleKo: `SQLite WAL 유휴 ${diagnosis.opfsWal.recommendedCheckpointMode} 체크포인트`,
      titleEn: `Idle SQLite WAL ${diagnosis.opfsWal.recommendedCheckpointMode} Checkpoint`,
      actionKo: "스트로크 종료 직후 비차단 WAL 체크포인트와 임시 스냅샷 정리를 실행해 디스크 스톨을 제거합니다.",
      actionEn: "Flush pending WAL frames between strokes and prune stale snapshots with zero visual change.",
      estimatedP99ReductionMs: walNeed ? roundTo(Math.min(4.2, diagnosis.opfsWal.lastCheckpointDelayMs * 0.014), 2) : 0.2,
      estimatedVramReleaseMb: 0, estimatedTileHitGainPct: 0,
      estimatedWalReductionMs: walNeed ? roundTo(diagnosis.opfsWal.lastCheckpointDelayMs * 0.72, 1) : 4,
      recommended: walNeed || tier >= 1,
    },
    {
      id: `${profileId}-tile-hud-hygiene`, order: 2, subsystem: "tile-cache", visualImpact: "zero",
      titleKo: "비가시 타일 LRU 회수 · 드로잉 중 HUD 갱신 배칭",
      titleEn: "Offscreen Tile LRU Trim & Stroke HUD Batching",
      actionKo: "뷰포트 밖 희소 타일을 압축하고 펜 이동 중 React HUD 갱신을 30Hz로 배칭해 화질 손실 없이 여유를 확보합니다.",
      actionEn: "Compress off-viewport sparse tiles and batch React inspector updates to 30Hz while drawing.",
      estimatedP99ReductionMs: roundTo((frameNeed ? 1.8 : 0.4) + (tileNeed ? 1.1 : 0), 2),
      estimatedVramReleaseMb: roundTo(Math.max(48, diagnosis.vram.textureAtlasMb * 0.16), 1),
      estimatedTileHitGainPct: tileNeed ? roundTo(Math.min(18, (96 - diagnosis.tileCache.hitRatePct) * 0.55), 1) : 1.5,
      estimatedWalReductionMs: 0, recommended: tileNeed || vramNeed || frameNeed,
    },
    profileId === "smooth-120hz"
      ? {
          id: "smooth-120hz-stroke-proxy", order: 3, subsystem: "frame-budget", visualImpact: "preview-only",
          titleKo: `스트로크 중 ${Math.round(strokeScale * 100)}% 동적 프리뷰 (펜 떼면 100% 원해상도 커밋)`,
          titleEn: `${Math.round(strokeScale * 100)}% Dynamic Stroke Preview (100% Full-Res Commit)`,
          actionKo: "펜 이동 중에만 합성 프리뷰 배율을 조정하고 포인터 업 즉시 100% 원해상도로 커밋해 120Hz 체감을 사수합니다.",
          actionEn: "Scale composite preview only during pointer motion and commit 100% full ink resolution on lift.",
          estimatedP99ReductionMs: tier >= 2 ? roundTo(tier === 3 ? 5.6 : 3.2, 2) : 1.1,
          estimatedVramReleaseMb: roundTo(diagnosis.vram.renderTargetMb * (tier >= 3 ? 0.34 : 0.22), 1),
          estimatedTileHitGainPct: tileNeed ? 6.5 : 1.0, estimatedWalReductionMs: 0,
          recommended: tier >= 2 || (frameAnalysis !== undefined && frameAnalysis.p99Ms > JANK_THRESHOLD_120HZ_MS),
        }
      : {
          id: "precision-4k-vram-spill-cadence", order: 3, subsystem: "vram", visualImpact: tier >= 2 ? "cadence" : "zero",
          titleKo: tier >= 2 ? "4K 100% 원해상도 고정 · 60Hz 안정 락 + 언두 OPFS 오프로드" : "4K 100% 원해상도 유지 · 스테이징 버퍼 압축",
          titleEn: tier >= 2 ? "Lock 4K 100% Native · Steady 60Hz & Undo OPFS Offload" : "Keep 4K 100% Native · Staging Compaction",
          actionKo: tier >= 2
            ? "캔버스 배율을 100%로 고정해 선화·망점 정밀도를 지키고 주사율만 60Hz(16.67ms)로 전환하며 언두 스냅샷을 OPFS로 이관합니다."
            : "원해상도 4K 캔버스를 유지하고 미사용 WebGPU 스테이징 버퍼만 회수합니다.",
          actionEn: tier >= 2
            ? "Keep 100% 4K pixel precision by locking 60Hz cadence (16.67ms) and spilling cold undo tiles to OPFS."
            : "Keep 4K native canvas intact while reclaiming idle WebGPU staging buffers.",
          estimatedP99ReductionMs: tier >= 2 ? roundTo(tier === 3 ? 3.8 : 2.1, 2) : 0.7,
          estimatedVramReleaseMb: roundTo(diagnosis.vram.stagingBufferMb * 0.48 + diagnosis.vram.textureAtlasMb * (tier >= 3 ? 0.24 : 0.14), 1),
          estimatedTileHitGainPct: tileNeed ? 8.5 : 1.5,
          estimatedWalReductionMs: walNeed ? roundTo(diagnosis.opfsWal.lastCheckpointDelayMs * 0.12, 1) : 0,
          recommended: tier >= 2 || vramNeed,
        },
  ];

  const active = steps.filter((s) => s.recommended);
  const p99Drop = active.reduce((a, s) => a + s.estimatedP99ReductionMs, 0);
  const vramRel = active.reduce((a, s) => a + s.estimatedVramReleaseMb, 0);
  const tileGain = active.reduce((a, s) => a + s.estimatedTileHitGainPct, 0);
  const walDrop = active.reduce((a, s) => a + s.estimatedWalReductionMs, 0);
  const baseP99 = frameAnalysis?.p99Ms ?? (tier === 0 ? 7.2 : tier === 1 ? 10.4 : tier === 2 ? 14.8 : 24.5);
  const projectedP99Ms = roundTo(Math.max(3.6, baseP99 - p99Drop), 2);
  const targetRefreshHz: TargetRefreshHz = profileId === "precision-4k" && tier >= 2 ? 60 : 120;
  const projectedFps = roundTo(Math.min(targetRefreshHz, 1000 / Math.max(3.6, projectedP99Ms * 0.78)), 1);
  const projectedVramUsagePct = roundTo((Math.max(64, diagnosis.vram.allocatedMb - vramRel) / Math.max(1, diagnosis.vram.budgetMb)) * 100, 1);
  const visualFidelityScore =
    profileId === "precision-4k" ? (tier >= 3 ? 98 : 100) : tier >= 3 ? 91 : tier === 2 ? 95 : tier === 1 ? 98 : 100;

  return {
    profileId,
    titleKo: profileId === "smooth-120hz" ? "120Hz 유지 우선" : "4K 정밀 우선",
    titleEn: profileId === "smooth-120hz" ? "Maintain 120Hz Priority" : "4K Precision Priority",
    taglineKo: profileId === "smooth-120hz" ? "펜 추종 8.33ms 이하 사수 · 커밋 시 100% 원해상도 복원" : "선화·망점 100% 원해상도 고정 · VRAM 회수 및 60Hz 안정 락",
    taglineEn: profileId === "smooth-120hz" ? "Guard sub-8.33ms pen response with 100% full-res commit" : "Keep 100% native 4K precision with VRAM offload & 60Hz lock",
    targetRefreshHz, strokeResolutionScale: strokeScale, commitResolutionScale: 1, visualFidelityScore,
    projectedP99Ms, projectedFps, projectedVramUsagePct, projectedVramSavingsMb: roundTo(vramRel, 1),
    projectedTileHitRatePct: roundTo(clamp(diagnosis.tileCache.hitRatePct + tileGain, 0, 99.5), 1),
    projectedWalDelayMs: roundTo(Math.max(6, diagnosis.opfsWal.lastCheckpointDelayMs - walDrop), 1),
    steps,
    tradeoffSummaryKo:
      profileId === "smooth-120hz"
        ? strokeScale < 1
          ? `스트로크 중에만 프리뷰를 ${Math.round(strokeScale * 100)}%로 낮추고 펜을 떼면 100% 원해상도로 커밋합니다.`
          : "화질 손실 없이 WAL 체크포인트와 비가시 타일 정리만으로 120Hz 여유를 확보합니다."
        : targetRefreshHz === 60
          ? "4K 100% 픽셀 정밀도를 지키는 대신 주사율 목표를 안정 60Hz(16.67ms)로 전환하고 VRAM을 회수합니다."
          : "4K 100% 원해상도와 120Hz를 모두 유지하면서 스테이징 버퍼만 정리합니다.",
    tradeoffSummaryEn:
      profileId === "smooth-120hz"
        ? strokeScale < 1
          ? `Previews strokes at ${Math.round(strokeScale * 100)}% during drag and commits 100% native ink on lift.`
          : "Secures 120Hz headroom purely through WAL checkpointing and offscreen tile hygiene."
        : targetRefreshHz === 60
          ? "Preserves 100% 4K sharpness by locking stable 60Hz cadence (16.67ms) and reclaiming VRAM."
          : "Maintains both 100% native 4K and 120Hz while compacting idle staging buffers.",
  };
}

/** 압박 감지 시 화질 타협을 최소화하는 단계별 1클릭 처방과 120Hz vs 4K 정밀 프로파일 비교표를 생성한다. */
export function recommendAdaptiveGuardrail(input: RecommendGuardrailInput): AdaptiveGuardrailReport {
  const tier = PRESSURE_RANK[input.diagnosis.overallLevel] as 0 | 1 | 2 | 3;
  const smooth120Hz = buildGuardrailPlan("smooth-120hz", tier, input.diagnosis, input.frameAnalysis);
  const precision4K = buildGuardrailPlan("precision-4k", tier, input.diagnosis, input.frameAnalysis);
  const is4KHeavy = (input.canvasContext?.canvasWidthPx ?? 0) >= 3840 || (input.canvasContext?.layerCount ?? 0) >= 60;
  const brushDominant = input.frameAnalysis?.dominantStage === "brushWasm" || input.frameAnalysis?.dominantStage === "input";
  const autoRecommendedProfile: GuardrailProfileId =
    is4KHeavy && input.diagnosis.vram.level === "critical" && !brushDominant ? "precision-4k" : "smooth-120hz";
  const preferredProfile = input.preferredProfile ?? autoRecommendedProfile;

  const comparisonRows: readonly GuardrailComparisonRow[] = [
    { id: "cmp-hz", labelKo: "목표 주사율", labelEn: "Target Refresh", smooth120HzValue: `${smooth120Hz.targetRefreshHz} Hz`, precision4KValue: `${precision4K.targetRefreshHz} Hz`, winner: smooth120Hz.targetRefreshHz === precision4K.targetRefreshHz ? "tie" : "smooth-120hz" },
    { id: "cmp-p99", labelKo: "처방 후 예상 p99", labelEn: "Projected p99", smooth120HzValue: `${smooth120Hz.projectedP99Ms.toFixed(2)} ms`, precision4KValue: `${precision4K.projectedP99Ms.toFixed(2)} ms`, winner: smooth120Hz.projectedP99Ms === precision4K.projectedP99Ms ? "tie" : smooth120Hz.projectedP99Ms < precision4K.projectedP99Ms ? "smooth-120hz" : "precision-4k" },
    { id: "cmp-scale", labelKo: "스트로크 / 커밋 해상도", labelEn: "Stroke / Commit Scale", smooth120HzValue: `${Math.round(smooth120Hz.strokeResolutionScale * 100)}% / 100%`, precision4KValue: `${Math.round(precision4K.strokeResolutionScale * 100)}% / 100%`, winner: smooth120Hz.strokeResolutionScale < precision4K.strokeResolutionScale ? "precision-4k" : "tie" },
    { id: "cmp-vram", labelKo: "예상 VRAM 절감", labelEn: "Projected VRAM Relief", smooth120HzValue: `-${smooth120Hz.projectedVramSavingsMb.toFixed(0)} MB (${smooth120Hz.projectedVramUsagePct}%)`, precision4KValue: `-${precision4K.projectedVramSavingsMb.toFixed(0)} MB (${precision4K.projectedVramUsagePct}%)`, winner: smooth120Hz.projectedVramSavingsMb === precision4K.projectedVramSavingsMb ? "tie" : precision4K.projectedVramSavingsMb > smooth120Hz.projectedVramSavingsMb ? "precision-4k" : "smooth-120hz" },
    { id: "cmp-fidelity", labelKo: "화질 보존 지수", labelEn: "Visual Fidelity Score", smooth120HzValue: `${smooth120Hz.visualFidelityScore} / 100`, precision4KValue: `${precision4K.visualFidelityScore} / 100`, winner: precision4K.visualFidelityScore === smooth120Hz.visualFidelityScore ? "tie" : precision4K.visualFidelityScore > smooth120Hz.visualFidelityScore ? "precision-4k" : "smooth-120hz" },
  ];

  return {
    escalationTier: tier, preferredProfile, autoRecommendedProfile,
    activePlan: preferredProfile === "precision-4k" ? precision4K : smooth120Hz,
    smooth120Hz, precision4K, comparisonRows,
  };
}

/** 선택된 가드레일 단계를 링버퍼·런타임 텔레메트리에 결정론 적용하고 적용 전/후 개선 델타를 반환한다. */
export function applyGuardrailPrescription(
  snapshot: StudioPerfDoctorSnapshot,
  plan: AdaptiveGuardrailPlan,
  enabledStepIds?: readonly string[],
  currentTargetHz: TargetRefreshHz = 120,
): GuardrailApplicationResult {
  const allowed = new Set(enabledStepIds ?? plan.steps.filter((s) => s.recommended).map((s) => s.id));
  const applied = plan.steps.filter((s) => allowed.has(s.id));
  const beforeFrame = analyzeFrameTimeRing(snapshot.ring, { targetHz: currentTargetHz });
  const beforeDiag = diagnoseStudioRuntimeHealth({ ...snapshot.telemetry, frameAnalysis: beforeFrame });

  const p99Drop = applied.reduce((a, s) => a + s.estimatedP99ReductionMs, 0);
  const vramRel = applied.reduce((a, s) => a + s.estimatedVramReleaseMb, 0);
  const tileGain = applied.reduce((a, s) => a + s.estimatedTileHitGainPct, 0);
  const walDrop = applied.reduce((a, s) => a + s.estimatedWalReductionMs, 0);
  const ratio = beforeFrame.p99Ms > 0 ? clamp(1 - p99Drop / Math.max(beforeFrame.p99Ms, 8), 0.42, 1) : 1;
  const uiBatched = applied.some((s) => s.subsystem === "tile-cache");
  const walFlushed = applied.some((s) => s.subsystem === "opfs-wal");

  const nextRing = pushFrameSamples(
    createFrameTimeRingBuffer(snapshot.ring.capacity),
    readFrameSamplesChronological(snapshot.ring).map((sample) => {
      const stages: FrameStageBreakdownMs = {
        input: roundTo(sample.stages.input * Math.min(1, ratio + 0.15), 3),
        brushWasm: roundTo(sample.stages.brushWasm * (plan.profileId === "smooth-120hz" ? ratio : Math.min(1, ratio + 0.08)), 3),
        webgpuComposite: roundTo(sample.stages.webgpuComposite * (plan.profileId === "precision-4k" ? Math.max(0.55, ratio - 0.04) : ratio), 3),
        uiReact: roundTo(sample.stages.uiReact * (uiBatched ? 0.65 : 1), 3),
      };
      const stageSum = stages.input + stages.brushWasm + stages.webgpuComposite + stages.uiReact;
      return { timestampMs: sample.timestampMs, totalMs: roundTo(Math.max(stageSum, sample.totalMs * ratio), 3), stages };
    }),
  );

  const prevVram = snapshot.telemetry.vram;
  const nextAlloc = roundTo(Math.max(120, prevVram.allocatedMb - vramRel), 1);
  const vramScale = prevVram.allocatedMb > 0 ? nextAlloc / prevVram.allocatedMb : 1;
  const prevTile = snapshot.telemetry.tileCache;
  const lookups = Math.max(1, prevTile.tileHits + prevTile.tileMisses);
  const nextHits = Math.round(lookups * (clamp(beforeDiag.tileCache.hitRatePct + tileGain, 0, 99.4) / 100));
  const prevWal = snapshot.telemetry.opfsWal;

  const nextTelemetry: StudioRuntimeTelemetryInput = {
    canvasContext: snapshot.telemetry.canvasContext,
    vram: { ...prevVram, allocatedMb: nextAlloc, textureAtlasMb: roundTo(prevVram.textureAtlasMb * vramScale, 1), renderTargetMb: roundTo(prevVram.renderTargetMb * vramScale, 1), stagingBufferMb: roundTo(prevVram.stagingBufferMb * Math.max(0.45, vramScale - 0.1), 1), deviceLostCount: 0 },
    tileCache: { ...prevTile, tileHits: nextHits, tileMisses: Math.max(0, lookups - nextHits), residentTiles: Math.max(64, Math.round(prevTile.residentTiles * (vramRel > 0 ? 0.82 : 0.94))), evictionsPerSec: roundTo(Math.max(1.2, prevTile.evictionsPerSec * (tileGain > 0 ? 0.35 : 0.85)), 1), dirtyTilesQueued: Math.max(2, Math.round(prevTile.dirtyTilesQueued * (tileGain > 0 ? 0.32 : 0.8))) },
    opfsWal: { ...prevWal, usedBytes: walFlushed ? Math.round(prevWal.usedBytes * 0.84) : prevWal.usedBytes, walSizeBytes: walFlushed ? Math.round(prevWal.walSizeBytes * 0.18) : prevWal.walSizeBytes, walFramesPending: walFlushed ? Math.max(12, Math.round(prevWal.walFramesPending * 0.12)) : prevWal.walFramesPending, lastCheckpointDelayMs: roundTo(Math.max(8, prevWal.lastCheckpointDelayMs - walDrop), 1), avgCheckpointDelayMs: roundTo(Math.max(6, prevWal.avgCheckpointDelayMs - walDrop * 0.65), 1), checkpointBlocked: walFlushed ? false : prevWal.checkpointBlocked },
  };

  const targetHzAfter: TargetRefreshHz = applied.length > 0 ? plan.targetRefreshHz : currentTargetHz;
  const afterFrame = analyzeFrameTimeRing(nextRing, { targetHz: targetHzAfter });
  const afterDiag = diagnoseStudioRuntimeHealth({ ...nextTelemetry, frameAnalysis: afterFrame });

  return {
    appliedStepIds: applied.map((s) => s.id), profileId: plan.profileId, targetHzAfter, nextRing, nextTelemetry,
    beforeFrameAnalysis: beforeFrame, afterFrameAnalysis: afterFrame, beforeDiagnosis: beforeDiag, afterDiagnosis: afterDiag,
    deltas: {
      p99DeltaMs: roundTo(afterFrame.p99Ms - beforeFrame.p99Ms, 2),
      vramPctDelta: roundTo(afterDiag.vram.utilizationPct - beforeDiag.vram.utilizationPct, 1),
      tileHitPctDelta: roundTo(afterDiag.tileCache.hitRatePct - beforeDiag.tileCache.hitRatePct, 1),
      walDelayDeltaMs: roundTo(afterDiag.opfsWal.lastCheckpointDelayMs - beforeDiag.opfsWal.lastCheckpointDelayMs, 1),
      healthScoreDelta: afterDiag.healthScore - beforeDiag.healthScore,
    },
  };
}

interface ScenarioBlueprint {
  readonly labelKo: string; readonly labelEn: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly base: FrameStageBreakdownMs; readonly spikeEvery: number; readonly spikeStage: FramePipelineStageId;
  readonly spikeAddMs: number; readonly severeEvery: number; readonly severeAddMs: number;
  readonly telemetry: StudioRuntimeTelemetryInput;
}

const SCENARIO_BLUEPRINTS: Readonly<Record<PerfDoctorScenarioId, ScenarioBlueprint>> = {
  "nominal-120hz": {
    labelKo: "안정 120Hz 연재 작업", labelEn: "Nominal 120Hz Inking",
    summaryKo: "모든 프레임이 8.33ms 예산 이내에서 안정 유지되며 VRAM·타일·OPFS WAL 모두 쾌적함",
    summaryEn: "All frames stay within the 8.33ms budget with healthy VRAM, tile cache, and OPFS WAL",
    base: { input: 0.62, brushWasm: 2.35, webgpuComposite: 1.85, uiReact: 0.72 },
    spikeEvery: 0, spikeStage: "brushWasm", spikeAddMs: 0, severeEvery: 0, severeAddMs: 0,
    telemetry: {
      canvasContext: { canvasWidthPx: 2560, canvasHeightPx: 4096, layerCount: 18, activeBrushRadiusPx: 32, dpr: 2 },
      vram: { allocatedMb: 940, budgetMb: 2048, textureAtlasMb: 510, renderTargetMb: 290, stagingBufferMb: 140, deviceLostCount: 0, backend: "webgpu" },
      tileCache: { tileHits: 4820, tileMisses: 180, residentTiles: 520, maxResidentTiles: 1024, evictionsPerSec: 2.1, dirtyTilesQueued: 6, tileSizePx: 256 },
      opfsWal: { usedBytes: 340 * BYTES_PER_MB, quotaBytes: 1024 * BYTES_PER_MB, walSizeBytes: 4.5 * BYTES_PER_MB, walFramesPending: 64, lastCheckpointDelayMs: 18, avgCheckpointDelayMs: 14, checkpointBlocked: false },
    },
  },
  "brush-jank-warm": {
    labelKo: "대형 수채 브러시 부하", labelEn: "Heavy Wet-Brush Load",
    summaryKo: "240px 수채 브러시 고속 스트로크 중 WASM 브러시에서 간헐적 > 8.33ms 쟁크 발생",
    summaryEn: "Intermittent > 8.33ms WASM brush spikes during 240px wet-brush rapid strokes",
    base: { input: 0.68, brushWasm: 3.15, webgpuComposite: 1.85, uiReact: 0.82 },
    spikeEvery: 20, spikeStage: "brushWasm", spikeAddMs: 2.6, severeEvery: 0, severeAddMs: 0,
    telemetry: {
      canvasContext: { canvasWidthPx: 2560, canvasHeightPx: 4096, layerCount: 34, activeBrushRadiusPx: 240, dpr: 2 },
      vram: { allocatedMb: 1390, budgetMb: 2048, textureAtlasMb: 740, renderTargetMb: 440, stagingBufferMb: 210, deviceLostCount: 0, backend: "webgpu" },
      tileCache: { tileHits: 4320, tileMisses: 590, residentTiles: 840, maxResidentTiles: 1024, evictionsPerSec: 12.5, dirtyTilesQueued: 28, tileSizePx: 256 },
      opfsWal: { usedBytes: 680 * BYTES_PER_MB, quotaBytes: 1024 * BYTES_PER_MB, walSizeBytes: 18 * BYTES_PER_MB, walFramesPending: 380, lastCheckpointDelayMs: 68, avgCheckpointDelayMs: 49, checkpointBlocked: false },
    },
  },
  "vram-tile-pressure": {
    labelKo: "4K 80레이어 VRAM·타일 압박", labelEn: "4K 80-Layer VRAM & Tile Pressure",
    summaryKo: "VRAM 84% 점유 · 희소 타일 스래싱(히트율 72%) · WebGPU 합성 스파이크 누적",
    summaryEn: "VRAM at 84% with sparse tile thrashing (72% hit rate) and WebGPU composite spikes",
    base: { input: 0.65, brushWasm: 2.35, webgpuComposite: 3.4, uiReact: 0.9 },
    spikeEvery: 7, spikeStage: "webgpuComposite", spikeAddMs: 4.8, severeEvery: 0, severeAddMs: 0,
    telemetry: {
      canvasContext: { canvasWidthPx: 4096, canvasHeightPx: 8192, layerCount: 80, activeBrushRadiusPx: 96, dpr: 2 },
      vram: { allocatedMb: 1720, budgetMb: 2048, textureAtlasMb: 960, renderTargetMb: 520, stagingBufferMb: 240, deviceLostCount: 0, backend: "webgpu" },
      tileCache: { tileHits: 3600, tileMisses: 1400, residentTiles: 980, maxResidentTiles: 1024, evictionsPerSec: 31.4, dirtyTilesQueued: 64, tileSizePx: 512 },
      opfsWal: { usedBytes: 825 * BYTES_PER_MB, quotaBytes: 1024 * BYTES_PER_MB, walSizeBytes: 46 * BYTES_PER_MB, walFramesPending: 940, lastCheckpointDelayMs: 185, avgCheckpointDelayMs: 132, checkpointBlocked: false },
    },
  },
  "critical-opfs-stall": {
    labelKo: "임계 압박 · OPFS WAL 정체", labelEn: "Critical Pressure & WAL Stall",
    summaryKo: "VRAM 94% 임계 포화 · OPFS 91% · SQLite WAL 체크포인트 차단으로 25ms+ 심각 정체 발생",
    summaryEn: "VRAM 94% critical, OPFS 91%, blocked SQLite WAL checkpoint causing 25ms+ severe stalls",
    base: { input: 1.15, brushWasm: 4.3, webgpuComposite: 5.2, uiReact: 1.95 },
    spikeEvery: 4, spikeStage: "webgpuComposite", spikeAddMs: 9.5, severeEvery: 12, severeAddMs: 18.6,
    telemetry: {
      canvasContext: { canvasWidthPx: 4096, canvasHeightPx: 10240, layerCount: 112, activeBrushRadiusPx: 180, dpr: 2 },
      vram: { allocatedMb: 1925, budgetMb: 2048, textureAtlasMb: 1090, renderTargetMb: 575, stagingBufferMb: 260, deviceLostCount: 0, backend: "webgpu" },
      tileCache: { tileHits: 2950, tileMisses: 1850, residentTiles: 1018, maxResidentTiles: 1024, evictionsPerSec: 46.8, dirtyTilesQueued: 114, tileSizePx: 512 },
      opfsWal: { usedBytes: 932 * BYTES_PER_MB, quotaBytes: 1024 * BYTES_PER_MB, walSizeBytes: 94 * BYTES_PER_MB, walFramesPending: 1820, lastCheckpointDelayMs: 412, avgCheckpointDelayMs: 265, checkpointBlocked: true },
    },
  },
};

/** 4가지 결정론 스튜디오 성능 시나리오 스냅샷을 생성한다. */
export function createPerfDoctorScenario(
  scenarioId: PerfDoctorScenarioId = "nominal-120hz",
  ringCapacity: number = DEFAULT_RING_CAPACITY,
): StudioPerfDoctorSnapshot {
  const bp = SCENARIO_BLUEPRINTS[scenarioId];
  const samples: FrameTimeSampleInput[] = [];
  for (let i = 0; i < 96; i += 1) {
    const wave = Math.sin((i + 1) * 0.63) * 0.28 + Math.cos((i + 1) * 0.29) * 0.18;
    const extra = bp.severeEvery > 0 && (i + 1) % bp.severeEvery === 0 ? bp.severeAddMs
      : bp.spikeEvery > 0 && (i + 1) % bp.spikeEvery === 0 ? bp.spikeAddMs : 0;
    const stages: FrameStageBreakdownMs = {
      input: roundTo(Math.max(0.25, bp.base.input + wave * 0.15 + (bp.spikeStage === "input" ? extra : 0)), 3),
      brushWasm: roundTo(Math.max(0.4, bp.base.brushWasm + wave * 0.55 + (bp.spikeStage === "brushWasm" ? extra : 0)), 3),
      webgpuComposite: roundTo(Math.max(0.4, bp.base.webgpuComposite + wave * 0.45 + (bp.spikeStage === "webgpuComposite" ? extra : 0)), 3),
      uiReact: roundTo(Math.max(0.2, bp.base.uiReact + wave * 0.2 + (bp.spikeStage === "uiReact" ? extra : 0)), 3),
    };
    const overhead = roundTo(0.22 + Math.abs(wave) * 0.18, 3);
    samples.push({ timestampMs: roundTo((i + 1) * JANK_THRESHOLD_120HZ_MS, 2), totalMs: roundTo(stages.input + stages.brushWasm + stages.webgpuComposite + stages.uiReact + overhead, 3), stages });
  }
  return {
    scenarioId, labelKo: bp.labelKo, labelEn: bp.labelEn, summaryKo: bp.summaryKo, summaryEn: bp.summaryEn,
    ring: pushFrameSamples(createFrameTimeRingBuffer(ringCapacity), samples), telemetry: bp.telemetry,
  };
}
