/**
 * WebGPU Compute 셰이더 기반 초고속 자동 플랫팅 · Jump-Flooding(JFA) · 0~16px 선화 틈새 닫기 엔진.
 *
 * - 가용한 WebGPU `GPUDevice`가 감지되면 WGSL 컴퓨트 셰이더 3종(`gap_close_dilate/erode`,
 *   `jump_flood_step`, `flatting_region_fill`)을 직접 디스패치한다(`backend: "webgpu-compute"`).
 * - WebGPU 미지원/JSDOM 환경에서는 수학적으로 완전 동치인 고속 TypedArray JFA/EDT/BFS 커널로
 *   무손실 폴백한다(`backend: "typed-array-fallback"`).
 */

import {
  clampInt,
  computeJumpFloodDistanceField,
  DEFAULT_INK_LUMINANCE_THRESHOLD,
  extractInkBarrierFromRgba,
  nowMs,
  runMorphologicalGapCloseCpu,
  runSparseHaloJumpFloodCpu,
  type JumpFloodDistanceFieldResult,
} from "./webgpu-flatting-jfa-kernels";
import {
  applyRegionFlattingCpu,
  buildWatertightBarrierFromJfa,
  EXTERIOR_JFA_LABEL,
  floodFillFinalRegions,
  labelClosedCores,
  normalizeFlattingSeeds,
  type AutoFlattingBoundingBox,
  type AutoFlattingRegionSummary,
} from "./webgpu-flatting-region-kernels";
import {
  createBenchmarkLineartScene,
  type AutoFlattingSeed,
  type RgbaColorTuple,
} from "./webgpu-flatting-demo-scene";
import {
  acquireDefaultWebGpuDevice,
  executeWebGpuComputePipeline,
} from "./webgpu-flatting-gpu-pipeline";
import { MAX_WEBGPU_GAP_CLOSE_PX } from "./webgpu-flatting-wgsl-shaders";

export {
  computeJumpFloodDistanceField,
  DEFAULT_INK_LUMINANCE_THRESHOLD,
  EXTERIOR_JFA_LABEL,
  extractInkBarrierFromRgba,
};
export type {
  AutoFlattingBoundingBox,
  AutoFlattingRegionSummary,
  AutoFlattingSeed,
  JumpFloodDistanceFieldResult,
  RgbaColorTuple,
};

export type AutoFlattingBackend = "webgpu-compute" | "typed-array-fallback";

export interface AutoFlattingInput {
  readonly lineartRgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly gapClosePx: number;
  readonly seeds: readonly AutoFlattingSeed[];
  readonly preferWebGpu?: boolean;
  readonly inkLuminanceThreshold?: number;
  readonly underStrokeTrapPx?: number;
  readonly gpuDevice?: GPUDevice | null;
}

export interface AutoFlattingPipelineTimingsMs {
  readonly gapCloseMorphMs: number;
  readonly jumpFloodMs: number;
  readonly regionFlattingMs: number;
  readonly totalMs: number;
}

export interface AutoFlattingResult {
  readonly width: number;
  readonly height: number;
  readonly appliedGapClosePx: number;
  readonly backend: AutoFlattingBackend;
  readonly subgroupsUsed: boolean;
  readonly flattingRgba: Uint8ClampedArray;
  readonly regionMap: Uint32Array;
  readonly closedBarrier: Uint8Array;
  readonly originalInkBarrier: Uint8Array;
  readonly bridgedPixelCount: number;
  readonly filledPixelCount: number;
  readonly underStrokeTrappedPixelCount: number;
  readonly leakedPixelCount: number;
  readonly leakedToBorder: boolean;
  readonly leakBlockRatePct: number;
  readonly jfaPassCount: number;
  readonly regions: readonly AutoFlattingRegionSummary[];
  readonly timingsMs: AutoFlattingPipelineTimingsMs;
  readonly processingTimeMs: number;
}

export interface AutoFlattingBenchmarkResult {
  readonly sizePx: number;
  readonly totalPixels: number;
  readonly megapixels: number;
  readonly durationMs: number;
  readonly megapixelsPerSec: number;
  readonly backend: AutoFlattingBackend;
  readonly filledPixelCount: number;
  readonly leakedPixelCount: number;
  readonly gapClosePx: number;
  readonly jfaPassCount: number;
}

function buildEmptyResult(
  width: number,
  height: number,
  appliedGapClosePx: number,
  backend: AutoFlattingBackend,
  startedAt: number,
): AutoFlattingResult {
  const totalMs = Math.max(0, nowMs() - startedAt);
  return {
    width,
    height,
    appliedGapClosePx,
    backend,
    subgroupsUsed: false,
    flattingRgba: new Uint8ClampedArray(0),
    regionMap: new Uint32Array(0),
    closedBarrier: new Uint8Array(0),
    originalInkBarrier: new Uint8Array(0),
    bridgedPixelCount: 0,
    filledPixelCount: 0,
    underStrokeTrappedPixelCount: 0,
    leakedPixelCount: 0,
    leakedToBorder: false,
    leakBlockRatePct: 100,
    jfaPassCount: 0,
    regions: Object.freeze([]),
    timingsMs: {
      gapCloseMorphMs: 0,
      jumpFloodMs: 0,
      regionFlattingMs: 0,
      totalMs,
    },
    processingTimeMs: totalMs,
  };
}

/**
 * 결정론적 TypedArray JFA/EDT/BFS 커널로 동기 자동 플랫팅 + 틈새 닫기를 실행한다.
 */
export function executeAutoFlattingSync(
  input: Omit<AutoFlattingInput, "preferWebGpu" | "gpuDevice">,
): AutoFlattingResult {
  const startedAt = nowMs();
  const width = Math.max(0, Math.floor(input.width));
  const height = Math.max(0, Math.floor(input.height));
  const appliedGapClosePx = clampInt(input.gapClosePx, 0, MAX_WEBGPU_GAP_CLOSE_PX);

  if (width === 0 || height === 0) {
    return buildEmptyResult(width, height, appliedGapClosePx, "typed-array-fallback", startedAt);
  }

  const seeds = normalizeFlattingSeeds(input.seeds);
  const trapRadiusPx = clampInt(input.underStrokeTrapPx ?? 1, 0, 1);

  const morphStart = nowMs();
  const originalInkBarrier = extractInkBarrierFromRgba(
    input.lineartRgba,
    width,
    height,
    input.inkLuminanceThreshold,
  );
  const morphClosedBarrier = runMorphologicalGapCloseCpu(
    originalInkBarrier,
    width,
    height,
    appliedGapClosePx,
  );
  const gapCloseMorphMs = Math.max(0, nowMs() - morphStart);

  const jfaStart = nowMs();
  let watertightBarrier = originalInkBarrier;
  let bridgedPixelCount = 0;
  let jfaPassCount = 0;

  if (appliedGapClosePx > 0) {
    const coreLabels = labelClosedCores({
      originalInk: originalInkBarrier,
      closedBarrier: morphClosedBarrier,
      width,
      height,
      seeds,
      gapClosePx: appliedGapClosePx,
    });
    const jfaOut = runSparseHaloJumpFloodCpu({
      coreLabels,
      originalInk: originalInkBarrier,
      width,
      height,
      gapClosePx: appliedGapClosePx,
    });
    jfaPassCount = jfaOut.passCount;
    const bridgeOut = buildWatertightBarrierFromJfa({
      originalInk: originalInkBarrier,
      morphClosedBarrier,
      jfaLabels: jfaOut.jfaLabels,
      width,
      height,
    });
    watertightBarrier = bridgeOut.watertightBarrier;
    bridgedPixelCount = bridgeOut.bridgedPixelCount;
  }
  const jumpFloodMs = Math.max(0, nowMs() - jfaStart);

  const flatStart = nowMs();
  const filled = floodFillFinalRegions({
    watertightBarrier,
    width,
    height,
    seeds,
  });
  const flatOut = applyRegionFlattingCpu({
    regionMap: filled.regionMap,
    lineartRgba: input.lineartRgba,
    width,
    height,
    seeds,
    trapRadiusPx,
  });
  const regionFlattingMs = Math.max(0, nowMs() - flatStart);
  const totalMs = Math.max(0, nowMs() - startedAt);

  return {
    width,
    height,
    appliedGapClosePx,
    backend: "typed-array-fallback",
    subgroupsUsed: false,
    flattingRgba: flatOut.flattingRgba,
    regionMap: filled.regionMap,
    closedBarrier: watertightBarrier,
    originalInkBarrier,
    bridgedPixelCount,
    filledPixelCount: filled.filledPixelCount,
    underStrokeTrappedPixelCount: flatOut.underStrokeTrappedPixelCount,
    leakedPixelCount: filled.leakedPixelCount,
    leakedToBorder: filled.leakedToBorder,
    leakBlockRatePct: filled.leakBlockRatePct,
    jfaPassCount,
    regions: filled.regions,
    timingsMs: {
      gapCloseMorphMs,
      jumpFloodMs,
      regionFlattingMs,
      totalMs,
    },
    processingTimeMs: totalMs,
  };
}

/**
 * WebGPU Compute 우선 실행 + TypedArray 완전 동치 폴백 자동 플랫팅 엔트리포인트.
 */
export async function executeAutoFlattingWithGapClose(
  input: AutoFlattingInput,
): Promise<AutoFlattingResult> {
  const startedAt = nowMs();
  const width = Math.max(0, Math.floor(input.width));
  const height = Math.max(0, Math.floor(input.height));
  const appliedGapClosePx = clampInt(input.gapClosePx, 0, MAX_WEBGPU_GAP_CLOSE_PX);

  if (width === 0 || height === 0) {
    return buildEmptyResult(width, height, appliedGapClosePx, "typed-array-fallback", startedAt);
  }

  const preferWebGpu = input.preferWebGpu ?? true;
  if (preferWebGpu) {
    const device =
      input.gpuDevice !== undefined ? input.gpuDevice : await acquireDefaultWebGpuDevice();
    if (device) {
      try {
        return await executeWebGpuComputePipeline({
          device,
          lineartRgba: input.lineartRgba,
          width,
          height,
          appliedGapClosePx,
          seeds: input.seeds,
          inkLuminanceThreshold: input.inkLuminanceThreshold,
          underStrokeTrapPx: input.underStrokeTrapPx,
        });
      } catch {
        // WebGPU 디스패치/장치 오류 시 결정론 TypedArray 커널로 무손실 폴백한다.
      }
    }
  }

  return executeAutoFlattingSync(input);
}

/**
 * 512×512 / 1024×1024 등 지정 해상도에서 실제 처리 시간(ms)과 초당 메가픽셀(MP/s)을 실측한다.
 */
export function benchmarkAutoFlattingThroughput(
  sizePx: number = 512,
  gapClosePx: number = 6,
): AutoFlattingBenchmarkResult {
  const safeSize = clampInt(sizePx, 64, 2048);
  const safeGap = clampInt(gapClosePx, 0, MAX_WEBGPU_GAP_CLOSE_PX);
  const scene = createBenchmarkLineartScene(safeSize);
  const result = executeAutoFlattingSync({
    lineartRgba: scene.lineartRgba,
    width: scene.width,
    height: scene.height,
    gapClosePx: safeGap,
    seeds: scene.seeds,
  });

  const totalPixels = scene.width * scene.height;
  const megapixels = totalPixels / 1_000_000;
  const safeDurationMs = Math.max(0.05, result.processingTimeMs);
  const megapixelsPerSec = Number(((megapixels * 1000) / safeDurationMs).toFixed(2));

  return {
    sizePx: safeSize,
    totalPixels,
    megapixels: Number(megapixels.toFixed(4)),
    durationMs: Number(result.processingTimeMs.toFixed(2)),
    megapixelsPerSec,
    backend: result.backend,
    filledPixelCount: result.filledPixelCount,
    leakedPixelCount: result.leakedPixelCount,
    gapClosePx: safeGap,
    jfaPassCount: result.jfaPassCount,
  };
}

/**
 * WebGPU Compute 가용 시 GPU 파이프라인을 포함해 처리량(ms · MP/s)을 비동기 실측한다.
 */
export async function benchmarkAutoFlattingThroughputAsync(
  sizePx: number = 512,
  options?: {
    readonly gapClosePx?: number;
    readonly preferWebGpu?: boolean;
    readonly gpuDevice?: GPUDevice | null;
  },
): Promise<AutoFlattingBenchmarkResult> {
  const safeSize = clampInt(sizePx, 64, 2048);
  const safeGap = clampInt(options?.gapClosePx ?? 6, 0, MAX_WEBGPU_GAP_CLOSE_PX);
  const scene = createBenchmarkLineartScene(safeSize);
  const result = await executeAutoFlattingWithGapClose({
    lineartRgba: scene.lineartRgba,
    width: scene.width,
    height: scene.height,
    gapClosePx: safeGap,
    seeds: scene.seeds,
    preferWebGpu: options?.preferWebGpu ?? true,
    gpuDevice: options?.gpuDevice,
  });

  const totalPixels = scene.width * scene.height;
  const megapixels = totalPixels / 1_000_000;
  const safeDurationMs = Math.max(0.05, result.processingTimeMs);
  const megapixelsPerSec = Number(((megapixels * 1000) / safeDurationMs).toFixed(2));

  return {
    sizePx: safeSize,
    totalPixels,
    megapixels: Number(megapixels.toFixed(4)),
    durationMs: Number(result.processingTimeMs.toFixed(2)),
    megapixelsPerSec,
    backend: result.backend,
    filledPixelCount: result.filledPixelCount,
    leakedPixelCount: result.leakedPixelCount,
    gapClosePx: safeGap,
    jfaPassCount: result.jfaPassCount,
  };
}
