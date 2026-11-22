/**
 * 차세대 WebGPU 렌더링 코어 통합 런타임 브리지.
 *
 * - `GpuBufferPool` + `GpuPipelineWarmupQueue`
 * - `AdaptiveFrameBudgetController` + `LruTileResidencyEvictionScheduler` + `rgba16float` HDR 디더링
 * - `StylusSubpixelPredictor` + Compute 스크린톤/JFA 외곽선
 *
 * 지연 로드(`import("../render/gpu-next/gpu-next-runtime-bridge")`) 경계로 설계해
 * Studio 초기 정적 번들 그래프를 키우지 않고 성능 HUD·기기 진단·스크린톤 렌더러에서
 * 실측 상태와 가속 경로를 공유한다.
 */

import {
  DEFAULT_GPU_NEXT_WARMUP_TASKS,
  GpuBufferPool,
  GpuPipelineWarmupQueue,
  type GpuBufferPoolMetrics,
  type GpuBufferPoolOptions,
  type GpuNextPipelineDeviceLike,
  type GpuPipelineWarmupMetrics,
  type GpuPipelineWarmupQueueOptions,
} from "./gpu-buffer-pool-and-warmup";
import {
  AdaptiveFrameBudgetController,
  GPU_NEXT_HDR_TEXTURE_FORMAT,
  LruTileResidencyEvictionScheduler,
  dispatchHdrBlendAndDither,
  type AdaptiveFrameBudgetDecision,
  type AdaptiveFrameBudgetOptions,
  type AdaptiveFrameBudgetSnapshot,
  type FrameInteractionMode,
  type GpuMemoryPressureLevel,
  type GpuNextHdrComputeDeviceLike,
  type HdrDispatchResult,
  type HdrDitherPassOptions,
  type LruTileEvictionOptions,
  type LruTileSchedulerSnapshot,
} from "./gpu-hdr-dither-and-frame-budget";
import {
  StylusSubpixelPredictor,
  dispatchScreentoneAndOutline,
  type ScreentoneAndOutlineOptions,
  type ScreentoneAndOutlineResult,
  type StylusPointerEventLike,
  type StylusPredictorOptions,
  type StylusStepPredictionResult,
} from "./gpu-stylus-predict-and-screentone";
import {
  WebGpuMemoryFailSafeGuard,
  type WebGpuMemoryFailSafeOptions,
  type WebGpuMemoryFailSafeSnapshot,
} from "../../webgpu";

export interface StudioGpuNextDiagnosticsSnapshot {
  readonly hdrTextureFormat: typeof GPU_NEXT_HDR_TEXTURE_FORMAT;
  readonly bufferPool: GpuBufferPoolMetrics;
  readonly warmup: GpuPipelineWarmupMetrics;
  readonly frameBudget: AdaptiveFrameBudgetSnapshot;
  readonly tileResidency: LruTileSchedulerSnapshot;
  readonly vramFailSafe: WebGpuMemoryFailSafeSnapshot;
  readonly stylus: {
    readonly historyLength: number;
    readonly totalAuthoritativeCount: number;
    readonly totalPredictedCount: number;
    readonly totalClampedCount: number;
  };
}

export interface StudioGpuNextRuntimeHubOptions {
  readonly device?: (GpuNextPipelineDeviceLike & GpuNextHdrComputeDeviceLike) | null;
  readonly bufferPool?: GpuBufferPoolOptions;
  readonly warmup?: GpuPipelineWarmupQueueOptions;
  readonly frameBudget?: AdaptiveFrameBudgetOptions;
  readonly tileResidency?: LruTileEvictionOptions;
  readonly vramFailSafe?: WebGpuMemoryFailSafeOptions;
  readonly stylus?: StylusPredictorOptions;
  readonly autoStartWarmup?: boolean;
}

export class StudioGpuNextRuntimeHub {
  readonly pool: GpuBufferPool;
  readonly warmupQueue: GpuPipelineWarmupQueue;
  readonly frameBudget: AdaptiveFrameBudgetController;
  readonly tileScheduler: LruTileResidencyEvictionScheduler;
  readonly vramGuard: WebGpuMemoryFailSafeGuard;
  readonly stylusPredictor: StylusSubpixelPredictor;
  private readonly device: (GpuNextPipelineDeviceLike & GpuNextHdrComputeDeviceLike) | null;

  constructor(options: StudioGpuNextRuntimeHubOptions = {}) {
    this.device = options.device ?? null;
    this.pool = new GpuBufferPool(options.bufferPool);
    this.warmupQueue = new GpuPipelineWarmupQueue(
      this.device,
      DEFAULT_GPU_NEXT_WARMUP_TASKS,
      options.warmup,
    );
    this.frameBudget = new AdaptiveFrameBudgetController(options.frameBudget);
    this.tileScheduler = new LruTileResidencyEvictionScheduler(options.tileResidency);
    this.vramGuard = new WebGpuMemoryFailSafeGuard({
      ...options.vramFailSafe,
      onEvictTile: (allocation) => {
        options.vramFailSafe?.onEvictTile?.(allocation);
      },
    });
    this.stylusPredictor = new StylusSubpixelPredictor(options.stylus);

    if (options.autoStartWarmup !== false && this.device !== null) {
      this.warmupQueue.start();
    }
  }

  /** 프레임 시간 샘플을 기록하고 동적 해상도 스케일 결정을 반환한다. */
  recordFrameSample(
    frameDurationMs: number,
    interactionMode: FrameInteractionMode = "idle",
    overridePressure?: GpuMemoryPressureLevel,
  ): AdaptiveFrameBudgetDecision {
    const pressure = overridePressure ?? this.tileScheduler.classifyPressure();
    return this.frameBudget.recordFrame({
      frameDurationMs,
      interactionMode,
      memoryPressure: pressure,
    });
  }

  /** 스타일러스 포인터 이벤트를 수집해 Catmull-Rom 1프레임 선행 예측 결과를 반환한다. */
  ingestStylusEvent(
    event: StylusPointerEventLike,
    lookaheadMs?: number,
  ): StylusStepPredictionResult {
    return this.stylusPredictor.ingestPointerEvent(event, lookaheadMs);
  }

  /** HDR 16-bit 선형 블렌드 + Bayer 8×8 / TPDF 디더링 패스를 실행한다(GPU 또는 CPU 폴백). */
  async runHdrBlendAndDither(
    dstLinear: Float32Array,
    srcLinear: Float32Array,
    options: HdrDitherPassOptions,
  ): Promise<HdrDispatchResult> {
    return dispatchHdrBlendAndDither({
      device: this.device,
      pool: this.pool,
      warmupQueue: this.warmupQueue,
      dstLinear,
      srcLinear,
      options,
    });
  }

  /** 비파괴 스크린톤 + Sobel/JFA 외곽선 패스를 실행한다(GPU 또는 CPU 폴백). */
  async runScreentoneAndOutline(
    srcRgba8: Uint8ClampedArray | Uint8Array,
    options: ScreentoneAndOutlineOptions,
  ): Promise<ScreentoneAndOutlineResult> {
    return dispatchScreentoneAndOutline({
      device: this.device,
      pool: this.pool,
      warmupQueue: this.warmupQueue,
      srcRgba8,
      options,
    });
  }

  /** 현재 실측 텔레메트리 스냅샷을 반환한다(추정값·더미값 없이 실측 카운터만 노출). */
  getDiagnosticsSnapshot(): StudioGpuNextDiagnosticsSnapshot {
    return Object.freeze({
      hdrTextureFormat: GPU_NEXT_HDR_TEXTURE_FORMAT,
      bufferPool: this.pool.getMetrics(),
      warmup: this.warmupQueue.getMetrics(),
      frameBudget: this.frameBudget.getSnapshot(),
      tileResidency: this.tileScheduler.getSnapshot(),
      vramFailSafe: this.vramGuard.getSnapshot(),
      stylus: this.stylusPredictor.getStats(),
    });
  }

  dispose(): void {
    this.warmupQueue.dispose();
    this.pool.dispose();
    this.tileScheduler.dispose();
    this.vramGuard.dispose();
    this.stylusPredictor.reset();
  }
}

let sharedHub: StudioGpuNextRuntimeHub | null = null;

/** Studio 공유 차세대 WebGPU 런타임 허브를 지연 생성한다. */
export function getStudioGpuNextRuntimeHub(): StudioGpuNextRuntimeHub {
  if (!sharedHub) {
    sharedHub = new StudioGpuNextRuntimeHub({ device: null, autoStartWarmup: false });
  }
  return sharedHub;
}

/** 현재 공유 허브의 진단 스냅샷을 반환한다(아직 생성 전이면 null). */
export function peekStudioGpuNextDiagnosticsSnapshot(): StudioGpuNextDiagnosticsSnapshot | null {
  return sharedHub ? sharedHub.getDiagnosticsSnapshot() : null;
}

/** 공유 런타임 허브를 정리하고 해제한다(테스트·세션 종료용). */
export function disposeStudioGpuNextRuntimeHub(): void {
  if (sharedHub) {
    sharedHub.dispose();
    sharedHub = null;
  }
}

/**
 * 진단 리포트·성능 HUD용 한 줄 요약 문자열을 생성한다.
 */
export function formatStudioGpuNextTelemetrySummary(
  snapshot: StudioGpuNextDiagnosticsSnapshot,
): string {
  const scalePercent = Math.round(
    Math.min(snapshot.frameBudget.currentScale, snapshot.vramFailSafe.previewRenderScale) * 100,
  );
  const poolHitPercent = Math.round(snapshot.bufferPool.gpuHitRate * 100);
  const warmupReady =
    snapshot.warmup.backend === "webgpu"
      ? `${snapshot.warmup.readyCount}/${snapshot.warmup.totalTasks}`
      : `CPU 폴백(${snapshot.warmup.totalTasks})`;
  const vramPct = Math.round(snapshot.vramFailSafe.utilizationRatio * 100);
  const rendererTag =
    snapshot.vramFailSafe.activeRenderer === "canvas2d-cpu-safe"
      ? "2D 안전모드"
      : `VRAM ${vramPct}%`;
  return `${snapshot.hdrTextureFormat} · 스케일 ${scalePercent}% · ${rendererTag} · 풀 재사용 ${poolHitPercent}% · 셰이더 ${warmupReady}`;
}
