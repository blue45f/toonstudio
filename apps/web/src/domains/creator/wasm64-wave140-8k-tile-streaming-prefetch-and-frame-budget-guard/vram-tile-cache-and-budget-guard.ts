/**
 * Wave 140 — 8K 패닝·플링·핀치 줌 다중 프레임 시뮬레이터 및 Naive vs Wave 140 정량 비교기.
 *
 * - 정독 스크롤, 고속 플링(`6000 px/s`), 급격한 핀치 줌인/줌아웃, 복합 스튜디오 부하 궤적을 생성한다.
 * - 동일 궤적에서 단순 반응형(Naive Reactive) 로더와 Wave 140 선행 프리페치+폴백 스케줄러를 대조해
 *   캐시 히트율, 블랭크 체커보드 프레임/타일 감소, P95/P99 프레임 타임 및 버짓 준수율 개선을 입증한다.
 */

import {
  clampFinite,
  clampInt,
  roundDeterministic,
  sha256TileStreamingHex,
} from "./tile-streaming-sha256";
import {
  computeTileByteSize,
  createWebtoon8kVerticalSpec,
  type MultiPageCanvasSpec,
  type TileKey,
  type ViewportCameraState,
} from "./tile-pyramid-and-prefetch";
import {
  DEFAULT_UPLOAD_BUDGET_120FPS_MS,
  DEFAULT_UPLOAD_BUDGET_60FPS_MS,
  DEFAULT_UPLOAD_COST_PER_TILE_MS,
  FRAME_BUDGET_120FPS_MS,
  FRAME_BUDGET_60FPS_MS,
  VramTileStreamingCache,
  type AtlasSlotLocation,
  type CacheSegment,
  type DirtyPinResult,
  type FrameRateTarget,
  type FrameStepOptions,
  type FrameStreamingTelemetry,
  type IndirectionTableEntrySnapshot,
  type ResidentTileEntry,
  type TileVisualSnapshotCell,
  type TileVisualState,
  type VramCacheInvariantAudit,
  type VramTileCacheConfig,
} from "./vram-tile-cache-core";

export {
  DEFAULT_UPLOAD_BUDGET_120FPS_MS,
  DEFAULT_UPLOAD_BUDGET_60FPS_MS,
  DEFAULT_UPLOAD_COST_PER_TILE_MS,
  FRAME_BUDGET_120FPS_MS,
  FRAME_BUDGET_60FPS_MS,
  VramTileStreamingCache,
  type AtlasSlotLocation,
  type CacheSegment,
  type DirtyPinResult,
  type FrameRateTarget,
  type FrameStepOptions,
  type FrameStreamingTelemetry,
  type IndirectionTableEntrySnapshot,
  type ResidentTileEntry,
  type TileVisualSnapshotCell,
  type TileVisualState,
  type VramCacheInvariantAudit,
  type VramTileCacheConfig,
};

export type PanZoomScenarioPreset =
  | "reading-scroll"
  | "high-speed-fling"
  | "rapid-pinch-zoom"
  | "combined-studio-stress";

export interface PanZoomTrajectoryFrame {
  readonly frameIndex: number;
  readonly viewport: ViewportCameraState;
  readonly dirtyKeysToPin?: readonly TileKey[];
  readonly dirtyKeysToFlush?: readonly string[];
}

export interface BuildTrajectoryOptions {
  readonly spec?: MultiPageCanvasSpec;
  readonly scenario: PanZoomScenarioPreset;
  readonly targetFps?: FrameRateTarget;
  readonly frameCount?: number;
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly peakFlingVelocityPxPerSec?: number;
}

export interface PanZoomSessionConfig {
  readonly spec: MultiPageCanvasSpec;
  readonly vramBudgetBytes: number;
  readonly targetFps?: FrameRateTarget;
  readonly uploadBudgetMs?: number;
  readonly baseUploadCostMsPerTile?: number;
  readonly baseFrameOverheadMs?: number;
  readonly mode?: "wave140-predictive" | "naive-reactive";
  readonly scenarioLabel?: string;
  readonly trajectory: readonly PanZoomTrajectoryFrame[];
}

export interface PanZoomSessionMetrics {
  readonly totalFrames: number;
  readonly averageCacheHitRatio: number;
  readonly steadyStateCacheHitRatio: number;
  readonly totalVisibleTilesRequested: number;
  readonly totalPreResidentHits: number;
  readonly totalRenderedExactTiles: number;
  readonly totalRenderedFallbackTiles: number;
  readonly totalBlankTiles: number;
  readonly framesWithBlankTiles: number;
  readonly blankFrameRatio: number;
  readonly averageFrameTimeMs: number;
  readonly p50FrameTimeMs: number;
  readonly p95FrameTimeMs: number;
  readonly p99FrameTimeMs: number;
  readonly maxFrameTimeMs: number;
  readonly maxUploadTimeMs: number;
  readonly framesWithinBudget: number;
  readonly frameBudgetComplianceRatio: number;
  readonly peakVramBytes: number;
  readonly peakVramUtilizationRatio: number;
  readonly totalEvictedTiles: number;
  readonly totalLodDegradationEvents: number;
  readonly totalOomEvents: number;
}

export interface PanZoomSessionResult {
  readonly mode: "wave140-predictive" | "naive-reactive";
  readonly scenarioLabel: string;
  readonly spec: MultiPageCanvasSpec;
  readonly targetFps: FrameRateTarget;
  readonly frameBudgetMs: number;
  readonly uploadBudgetMs: number;
  readonly vramBudgetBytes: number;
  readonly frames: readonly FrameStreamingTelemetry[];
  readonly metrics: PanZoomSessionMetrics;
  readonly invariants: VramCacheInvariantAudit;
  readonly finalTileVisualSnapshot: readonly TileVisualSnapshotCell[];
  readonly sessionSha256Hex: string;
}

export interface NaiveVsPredictiveComparisonResult {
  readonly scenarioLabel: string;
  readonly targetFps: FrameRateTarget;
  readonly vramBudgetBytes: number;
  readonly naive: PanZoomSessionResult;
  readonly predictive: PanZoomSessionResult;
  readonly cacheHitRatioGain: number;
  readonly steadyStateHitRatioGain: number;
  readonly blankTileReductionCount: number;
  readonly blankTileReductionRatio: number;
  readonly blankFrameReductionCount: number;
  readonly p95FrameTimeImprovementMs: number;
  readonly p99FrameTimeImprovementMs: number;
  readonly frameBudgetComplianceGain: number;
  readonly predictiveDominatesAllMetrics: boolean;
  readonly comparisonSha256Hex: string;
}

const SCENARIO_LABELS_KO: Readonly<Record<PanZoomScenarioPreset, string>> = {
  "reading-scroll": "8K 정독 세로 스크롤",
  "high-speed-fling": "초고속 6000px/s 웹툰 플링",
  "rapid-pinch-zoom": "급격한 핀치 줌인·줌아웃",
  "combined-studio-stress": "복합 8K 패닝·플링·핀치·드로잉 스트레스",
};

/** 정렬된 배열에서 결정론적 백분위수(nearest-rank)를 계산한다. */
export function computePercentile(values: readonly number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const clampedP = clampFinite(percentile, 0, 100, 95);
  const rank = Math.ceil((clampedP / 100) * sorted.length);
  const idx = clampInt(rank - 1, 0, sorted.length - 1, 0);
  return roundDeterministic(sorted[idx], 3);
}

/**
 * 정독 스크롤, `6000 px/s` 고속 플링, 급격한 핀치 줌, 복합 스튜디오 작업 궤적을 결정론적으로 생성한다.
 */
export function buildCanvasPanZoomTrajectory(
  options: BuildTrajectoryOptions,
): readonly PanZoomTrajectoryFrame[] {
  const spec = options.spec ?? createWebtoon8kVerticalSpec();
  const targetFps: FrameRateTarget = options.targetFps === 120 ? 120 : 60;
  const dtSec = 1 / targetFps;
  const frameCount = clampInt(options.frameCount ?? (targetFps === 120 ? 90 : 60), 4, 600, 60);
  const viewW = clampInt(options.viewportWidthPx ?? 1280, 320, 4096, 1280);
  const viewH = clampInt(options.viewportHeightPx ?? 720, 240, 2160, 720);
  const peakFlingVel = clampFinite(options.peakFlingVelocityPxPerSec ?? 6000, 800, 20000, 6000);

  const frames: PanZoomTrajectoryFrame[] = [];
  let scrollX = Math.max(0, (spec.totalWorldWidthPx - viewW) * 0.5);
  let scrollY = 0;
  let zoom = 1.0;

  for (let i = 0; i < frameCount; i += 1) {
    const progress = frameCount > 1 ? i / (frameCount - 1) : 0;
    let vx = 0;
    let vy: number;
    let zoomVel = 0;
    let dirtyKeysToPin: TileKey[] | undefined = undefined;

    if (options.scenario === "reading-scroll") {
      vy = 780 + Math.sin(progress * Math.PI * 2) * 240;
      zoom = 1.0;
    } else if (options.scenario === "high-speed-fling") {
      // 초반 워밍업 이후 6000 px/s 초고속 플링 진입 후 자연 감속
      if (progress < 0.12) {
        vy = peakFlingVel * (progress / 0.12);
      } else if (progress < 0.72) {
        vy = peakFlingVel;
      } else {
        const decel = Math.max(0.1, 1 - (progress - 0.72) / 0.28);
        vy = peakFlingVel * decel;
      }
      zoom = 1.0;
    } else if (options.scenario === "rapid-pinch-zoom") {
      // 0.16x 전체 조망 <-> 1.85x 세밀 펜선 확대를 급격히 오가는 핀치 줌
      const wave = Math.sin(progress * Math.PI * 3.0);
      const nextZoom = clampFinite(0.95 + wave * 0.78, 0.16, 1.85, 1.0);
      zoomVel = i === 0 ? 0 : Math.log(nextZoom / Math.max(0.05, zoom)) / dtSec;
      zoom = nextZoom;
      vy = 1400 * Math.cos(progress * Math.PI * 2);
      vx = 280 * Math.sin(progress * Math.PI * 4);
    } else {
      // combined-studio-stress: 정독 -> 6000px/s 플링 -> 급줌인 + 브러시 편집 -> 줌아웃
      if (progress < 0.2) {
        vy = 900;
        zoom = 1.0;
      } else if (progress < 0.58) {
        vy = peakFlingVel;
        zoom = 1.0;
      } else if (progress < 0.8) {
        const localT = (progress - 0.58) / 0.22;
        const nextZoom = clampFinite(1.0 + Math.sin(localT * Math.PI) * 0.85, 0.25, 1.9, 1.0);
        zoomVel = Math.log(nextZoom / Math.max(0.05, zoom)) / dtSec;
        zoom = nextZoom;
        vy = 600;
        if (i % 5 === 0) {
          const tileY = Math.max(
            0,
            Math.floor((scrollY + (viewH / zoom) * 0.5) / spec.tileSizePx),
          );
          const tileX = Math.max(
            0,
            Math.floor((scrollX + (viewW / zoom) * 0.5) / spec.tileSizePx),
          );
          dirtyKeysToPin = [{ pageIndex: 0, mipLevel: 0, tx: tileX, ty: tileY }];
        }
      } else {
        const localT = (progress - 0.8) / 0.2;
        const nextZoom = clampFinite(1.0 - localT * 0.72, 0.25, 1.0, 0.5);
        zoomVel = Math.log(nextZoom / Math.max(0.05, zoom)) / dtSec;
        zoom = nextZoom;
        vy = -2400;
      }
    }

    const maxScrollX = Math.max(0, spec.totalWorldWidthPx - viewW / zoom);
    const maxScrollY = Math.max(0, spec.totalWorldHeightPx - viewH / zoom);
    scrollX = clampFinite(scrollX, 0, maxScrollX, 0);
    scrollY = clampFinite(scrollY, 0, maxScrollY, 0);

    frames.push({
      frameIndex: i,
      viewport: {
        scrollX: roundDeterministic(scrollX, 2),
        scrollY: roundDeterministic(scrollY, 2),
        viewportWidthPx: viewW,
        viewportHeightPx: viewH,
        zoom: roundDeterministic(zoom, 4),
        vxPxPerSec: roundDeterministic(vx, 2),
        vyPxPerSec: roundDeterministic(vy, 2),
        zoomVelocityPerSec: roundDeterministic(zoomVel, 4),
      },
      dirtyKeysToPin,
    });

    scrollX = clampFinite(scrollX + vx * dtSec, 0, maxScrollX, 0);
    scrollY = clampFinite(scrollY + vy * dtSec, 0, maxScrollY, 0);
  }

  return frames;
}

/**
 * 다중 프레임 캔버스 패닝·플링·줌 세션을 시뮬레이션하고 텔레메트리·불변량·SHA-256 지문을 집계한다.
 */
export function simulateCanvasPanZoomSession(
  config: PanZoomSessionConfig,
): PanZoomSessionResult {
  const mode = config.mode ?? "wave140-predictive";
  const cache = new VramTileStreamingCache({
    spec: config.spec,
    vramBudgetBytes: config.vramBudgetBytes,
    targetFps: config.targetFps,
    uploadBudgetMs: config.uploadBudgetMs,
    baseUploadCostMsPerTile: config.baseUploadCostMsPerTile,
    baseFrameOverheadMs: config.baseFrameOverheadMs,
    mode,
  });

  const frames: FrameStreamingTelemetry[] = [];
  const frameTimes: number[] = [];
  let sumHitRatio = 0;
  let steadyHitSum = 0;
  let steadyCount = 0;
  let totalVisible = 0;
  let totalPreHits = 0;
  let totalExact = 0;
  let totalFallback = 0;
  let totalBlank = 0;
  let framesWithBlank = 0;
  let sumFrameTime = 0;
  let maxFrameTime = 0;
  let maxUploadTime = 0;
  let framesWithinBudget = 0;
  let peakVramBytes = 0;
  let totalEvicted = 0;
  let totalLodEvents = 0;
  let totalOom = 0;

  for (let i = 0; i < config.trajectory.length; i += 1) {
    const step = config.trajectory[i];
    const telemetry = cache.stepFrame(step.viewport, {
      frameIndex: step.frameIndex,
      dirtyKeysToPin: step.dirtyKeysToPin,
      dirtyKeysToFlush: step.dirtyKeysToFlush,
    });
    frames.push(telemetry);
    frameTimes.push(telemetry.totalFrameTimeMs);
    sumHitRatio += telemetry.cacheHitRatio;
    if (i >= 2) {
      steadyHitSum += telemetry.cacheHitRatio;
      steadyCount += 1;
    }
    totalVisible += telemetry.visibleTileCount;
    totalPreHits += telemetry.preResidentExactHits;
    totalExact += telemetry.renderedExactCount;
    totalFallback += telemetry.renderedFallbackCount;
    totalBlank += telemetry.renderedBlankCount;
    if (telemetry.renderedBlankCount > 0) framesWithBlank += 1;
    sumFrameTime += telemetry.totalFrameTimeMs;
    if (telemetry.totalFrameTimeMs > maxFrameTime) maxFrameTime = telemetry.totalFrameTimeMs;
    if (telemetry.uploadTimeMs > maxUploadTime) maxUploadTime = telemetry.uploadTimeMs;
    if (telemetry.withinFrameBudget) framesWithinBudget += 1;
    if (telemetry.usedVramBytes > peakVramBytes) peakVramBytes = telemetry.usedVramBytes;
    totalEvicted += telemetry.evictedTilesCount;
    if (telemetry.gracefulLodDegradationTriggered) totalLodEvents += 1;
    totalOom += telemetry.oomEventCount;
  }

  const totalFrames = frames.length;
  const averageCacheHitRatio =
    totalFrames > 0 ? roundDeterministic(sumHitRatio / totalFrames, 4) : 1;
  const steadyStateCacheHitRatio =
    steadyCount > 0 ? roundDeterministic(steadyHitSum / steadyCount, 4) : averageCacheHitRatio;
  const averageFrameTimeMs =
    totalFrames > 0 ? roundDeterministic(sumFrameTime / totalFrames, 3) : 0;
  const frameBudgetComplianceRatio =
    totalFrames > 0 ? roundDeterministic(framesWithinBudget / totalFrames, 4) : 1;
  const blankFrameRatio =
    totalFrames > 0 ? roundDeterministic(framesWithBlank / totalFrames, 4) : 0;
  const peakVramUtilizationRatio =
    cache.vramBudgetBytes > 0
      ? roundDeterministic(peakVramBytes / cache.vramBudgetBytes, 4)
      : 0;

  const metrics: PanZoomSessionMetrics = {
    totalFrames,
    averageCacheHitRatio,
    steadyStateCacheHitRatio,
    totalVisibleTilesRequested: totalVisible,
    totalPreResidentHits: totalPreHits,
    totalRenderedExactTiles: totalExact,
    totalRenderedFallbackTiles: totalFallback,
    totalBlankTiles: totalBlank,
    framesWithBlankTiles: framesWithBlank,
    blankFrameRatio,
    averageFrameTimeMs,
    p50FrameTimeMs: computePercentile(frameTimes, 50),
    p95FrameTimeMs: computePercentile(frameTimes, 95),
    p99FrameTimeMs: computePercentile(frameTimes, 99),
    maxFrameTimeMs: roundDeterministic(maxFrameTime, 3),
    maxUploadTimeMs: roundDeterministic(maxUploadTime, 3),
    framesWithinBudget,
    frameBudgetComplianceRatio,
    peakVramBytes,
    peakVramUtilizationRatio,
    totalEvictedTiles: totalEvicted,
    totalLodDegradationEvents: totalLodEvents,
    totalOomEvents: totalOom,
  };

  const invariants = cache.auditInvariants();
  const finalTileVisualSnapshot = cache.captureTileVisualSnapshot(64);
  const scenarioLabel = config.scenarioLabel ?? "8K 타일 스트리밍 세션";

  const sessionSha256Hex = sha256TileStreamingHex(
    JSON.stringify({
      mode,
      scenarioLabel,
      targetFps: cache.targetFps,
      vramBudgetBytes: cache.vramBudgetBytes,
      metrics,
      invariantsHash: invariants.stateSha256Hex,
      frameHashes: frames.map((f) => f.planSha256Hex),
    }),
  );

  return {
    mode,
    scenarioLabel,
    spec: config.spec,
    targetFps: cache.targetFps,
    frameBudgetMs: cache.frameBudgetMs,
    uploadBudgetMs: cache.uploadBudgetMs,
    vramBudgetBytes: cache.vramBudgetBytes,
    frames,
    metrics,
    invariants,
    finalTileVisualSnapshot,
    sessionSha256Hex,
  };
}

/**
 * 동일 카메라 궤적과 VRAM 조건에서 단순 반응형(Naive Reactive) 로더와
 * Wave 140 선행 프리페치+저해상도 폴백 스케줄러의 성능을 정량 대조한다.
 */
export function compareNaiveVsPredictiveTileStreaming(options: {
  readonly spec?: MultiPageCanvasSpec;
  readonly scenario?: PanZoomScenarioPreset;
  readonly scenarioLabel?: string;
  readonly trajectory?: readonly PanZoomTrajectoryFrame[];
  readonly vramBudgetBytes?: number;
  readonly targetFps?: FrameRateTarget;
  readonly frameCount?: number;
  readonly uploadBudgetMs?: number;
  readonly baseUploadCostMsPerTile?: number;
}): NaiveVsPredictiveComparisonResult {
  const spec = options.spec ?? createWebtoon8kVerticalSpec();
  const scenario: PanZoomScenarioPreset = options.scenario ?? "high-speed-fling";
  const targetFps: FrameRateTarget = options.targetFps === 120 ? 120 : 60;
  const vramBudgetBytes = Math.max(
    computeTileByteSize(spec.tileSizePx, spec.bytesPerPixel) * 8,
    Math.floor(clampFinite(options.vramBudgetBytes ?? 96 * 1024 * 1024, 2 * 1024 * 1024, 4_000_000_000, 96 * 1024 * 1024)),
  );
  const scenarioLabel = options.scenarioLabel ?? SCENARIO_LABELS_KO[scenario];
  const trajectory =
    options.trajectory ??
    buildCanvasPanZoomTrajectory({
      spec,
      scenario,
      targetFps,
      frameCount: options.frameCount,
    });

  const naive = simulateCanvasPanZoomSession({
    spec,
    vramBudgetBytes,
    targetFps,
    uploadBudgetMs: options.uploadBudgetMs,
    baseUploadCostMsPerTile: options.baseUploadCostMsPerTile,
    mode: "naive-reactive",
    scenarioLabel,
    trajectory,
  });

  const predictive = simulateCanvasPanZoomSession({
    spec,
    vramBudgetBytes,
    targetFps,
    uploadBudgetMs: options.uploadBudgetMs,
    baseUploadCostMsPerTile: options.baseUploadCostMsPerTile,
    mode: "wave140-predictive",
    scenarioLabel,
    trajectory,
  });

  const cacheHitRatioGain = roundDeterministic(
    predictive.metrics.averageCacheHitRatio - naive.metrics.averageCacheHitRatio,
    4,
  );
  const steadyStateHitRatioGain = roundDeterministic(
    predictive.metrics.steadyStateCacheHitRatio - naive.metrics.steadyStateCacheHitRatio,
    4,
  );
  const blankTileReductionCount = naive.metrics.totalBlankTiles - predictive.metrics.totalBlankTiles;
  const blankTileReductionRatio =
    naive.metrics.totalBlankTiles > 0
      ? roundDeterministic(blankTileReductionCount / naive.metrics.totalBlankTiles, 4)
      : 0;
  const blankFrameReductionCount =
    naive.metrics.framesWithBlankTiles - predictive.metrics.framesWithBlankTiles;
  const p95FrameTimeImprovementMs = roundDeterministic(
    naive.metrics.p95FrameTimeMs - predictive.metrics.p95FrameTimeMs,
    3,
  );
  const p99FrameTimeImprovementMs = roundDeterministic(
    naive.metrics.p99FrameTimeMs - predictive.metrics.p99FrameTimeMs,
    3,
  );
  const frameBudgetComplianceGain = roundDeterministic(
    predictive.metrics.frameBudgetComplianceRatio - naive.metrics.frameBudgetComplianceRatio,
    4,
  );

  const predictiveDominatesAllMetrics =
    predictive.metrics.averageCacheHitRatio >= naive.metrics.averageCacheHitRatio &&
    predictive.metrics.totalBlankTiles <= naive.metrics.totalBlankTiles &&
    predictive.metrics.p95FrameTimeMs <= naive.metrics.p95FrameTimeMs &&
    predictive.metrics.p99FrameTimeMs <= naive.metrics.p99FrameTimeMs &&
    predictive.metrics.frameBudgetComplianceRatio >= naive.metrics.frameBudgetComplianceRatio &&
    predictive.invariants.vramHardCapRespected &&
    predictive.invariants.zeroOomEvents;

  const comparisonSha256Hex = sha256TileStreamingHex(
    JSON.stringify({
      scenarioLabel,
      targetFps,
      vramBudgetBytes,
      naiveSha: naive.sessionSha256Hex,
      predictiveSha: predictive.sessionSha256Hex,
    }),
  );

  return {
    scenarioLabel,
    targetFps,
    vramBudgetBytes,
    naive,
    predictive,
    cacheHitRatioGain,
    steadyStateHitRatioGain,
    blankTileReductionCount,
    blankTileReductionRatio,
    blankFrameReductionCount,
    p95FrameTimeImprovementMs,
    p99FrameTimeImprovementMs,
    frameBudgetComplianceGain,
    predictiveDominatesAllMetrics,
    comparisonSha256Hex,
  };
}
