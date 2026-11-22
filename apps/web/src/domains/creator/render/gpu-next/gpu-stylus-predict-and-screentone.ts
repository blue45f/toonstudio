/**
 * 서브픽셀 예측 스타일러스 입력 + WebGPU Compute 비파괴 스크린톤/외곽선 통합 모듈.
 *
 * - 스타일러스 예측(`StylusSubpixelPredictor`)을 재노출하며,
 * - 회전각·LPI·원형/다이아몬드/선형/교차 도트 스크린톤과 Sobel 1패스 / Jump-Flooding(JFA) 외곽선을
 *   WebGPU Compute 셰이더 + 동일 수학의 결정적 CPU 폴백으로 비파괴 생성한다.
 */

import {
  GPU_NEXT_BUFFER_USAGE,
  type GpuBufferPool,
  type GpuPipelineWarmupQueue,
} from "./gpu-buffer-pool-and-warmup";
import { type GpuNextHdrComputeDeviceLike } from "./gpu-hdr-dither-and-frame-budget";
import {
  GPU_NEXT_JFA_STEP_UNIFORM_BYTES,
  GPU_NEXT_JFA_STEP_UNIFORM_U32S,
  GPU_NEXT_SCREENTONE_UNIFORM_BYTES,
  GPU_NEXT_SCREENTONE_UNIFORM_FLOATS,
  GPU_NEXT_WORKGROUP_SIZE_X,
  GPU_NEXT_WORKGROUP_SIZE_Y,
} from "./gpu-next-wgsl-shaders";

export {
  evaluateCentripetalCatmullRom,
  StylusSubpixelPredictor,
  type Point2DLike,
  type StylusPointerEventLike,
  type StylusPredictorOptions,
  type StylusStepPredictionResult,
  type StylusSubpixelPoint,
} from "./gpu-stylus-subpixel-predictor";

export type ComputeScreentoneDotShape = "circle" | "diamond" | "line" | "cross";
export type ComputeOutlineMode = "none" | "sobel" | "jump-flood";

export interface ScreentoneAndOutlineOptions {
  readonly width: number;
  readonly height: number;
  readonly dotShape?: ComputeScreentoneDotShape;
  /** 망선 수(Lines Per Inch, 예: 10..120, 기본 60). */
  readonly lpi?: number;
  /** 출력 해상도(DPI, 기본 300). `cellPx = dpi / lpi`. */
  readonly dpi?: number;
  /** 스크린 회전각(도, 기본 45°). */
  readonly angleDeg?: number;
  /** 기본 농도 또는 소스 휘도 승수(0..1, 기본 0.45). */
  readonly density?: number;
  /** true이면 소스 픽셀 휘도(1 - luma)에 `density`를 곱해 계조를 망점으로 변환한다. */
  readonly useSourceLuma?: boolean;
  readonly invertTone?: boolean;
  readonly phaseX?: number;
  readonly phaseY?: number;
  readonly inkRgba?: readonly [number, number, number, number];
  readonly outlineMode?: ComputeOutlineMode;
  readonly outlineWidthPx?: number;
  readonly outlineThreshold?: number;
  readonly outlineStrength?: number;
  readonly outlineAlphaThresholdU8?: number;
  readonly outlineRgba?: readonly [number, number, number, number];
}

export interface ScreentoneAndOutlineResult {
  readonly backend: "webgpu" | "cpu-fallback";
  readonly width: number;
  readonly height: number;
  readonly dotShape: ComputeScreentoneDotShape;
  readonly outlineMode: ComputeOutlineMode;
  readonly cellPx: number;
  readonly passCount: number;
  readonly jfaSteps: readonly number[];
  readonly pixels: Uint8ClampedArray | null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const denom = edge1 - edge0;
  if (Math.abs(denom) <= 1e-6) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / denom);
  return t * t * (3 - 2 * t);
}

/** RGBA [0..255] 튜플을 WGSL packed `u32` (LE: R | G<<8 | B<<16 | A<<24)로 패킹한다. */
export function packRgba8Tuple(rgba: readonly [number, number, number, number]): number {
  const r = Math.min(255, Math.max(0, Math.round(rgba[0] ?? 0))) & 0xff;
  const g = Math.min(255, Math.max(0, Math.round(rgba[1] ?? 0))) & 0xff;
  const b = Math.min(255, Math.max(0, Math.round(rgba[2] ?? 0))) & 0xff;
  const a = Math.min(255, Math.max(0, Math.round(rgba[3] ?? 255))) & 0xff;
  return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
}

/** LPI와 DPI로부터 망점 셀 한 변의 픽셀 크기를 계산한다(최소 2px). */
export function computeScreentoneCellPx(lpi: number, dpi = 300): number {
  const safeLpi = Number.isFinite(lpi) && lpi > 0 ? lpi : 60;
  const safeDpi = Number.isFinite(dpi) && dpi > 0 ? dpi : 300;
  return Math.max(2, safeDpi / safeLpi);
}

/**
 * Jump-Flooding Algorithm(JFA) 외곽선 전파 스텝 목록을 계산한다.
 * 예: `outlineWidthPx = 6` → `[4, 2, 1]` (O(log R) 패스).
 */
export function computeJfaStepSchedule(outlineWidthPx: number): readonly number[] {
  const radius = Math.max(1, Math.ceil(Number.isFinite(outlineWidthPx) ? outlineWidthPx : 1));
  let maxStep = 1;
  while (maxStep * 2 <= radius) {
    maxStep *= 2;
  }
  const steps: number[] = [];
  for (let step = maxStep; step >= 1; step = Math.floor(step / 2)) {
    steps.push(step);
  }
  return Object.freeze(steps);
}

/**
 * WGSL `screentone_coverage`와 정확히 동일한 수학으로 (x, y) 픽셀의 망점 커버리지(0..1)를 평가한다.
 * - `circle`: 원 면적 ∝ d (`r = sqrt(d / π) * cell`)
 * - `diamond`: L1 다이아몬드 면적 ∝ d (d ≤ 0.5 중심 다이아몬드, d > 0.5 코너 여집합 연속 전환)
 * - `line`: 회전 평행선 (`halfThick = 0.5 * d * cell`)
 * - `cross`: 직교 교차선 (`max(lineU, lineV)`)
 */
export function evaluateScreentoneDotCoverageCpu(
  px: number,
  py: number,
  params: {
    readonly dotShape: ComputeScreentoneDotShape;
    readonly cellPx: number;
    readonly cosAngle: number;
    readonly sinAngle: number;
    readonly phaseX: number;
    readonly phaseY: number;
  },
  density: number,
): number {
  const d = clamp01(density);
  if (d <= 0.0001) return 0;
  if (d >= 0.9999) return 1;

  const cell = Math.max(2, params.cellPx);
  const u = px * params.cosAngle + py * params.sinAngle + params.phaseX;
  const v = -px * params.sinAngle + py * params.cosAngle + params.phaseY;
  const fu = u - Math.floor(u / cell) * cell - 0.5 * cell;
  const fv = v - Math.floor(v / cell) * cell - 0.5 * cell;

  if (params.dotShape === "diamond") {
    if (d <= 0.5) {
      const halfDiag = Math.sqrt(d * 0.5) * cell;
      const dist = Math.abs(fu) + Math.abs(fv);
      return clamp01(halfDiag - dist + 0.5);
    }
    const invHalfDiag = Math.sqrt((1 - d) * 0.5) * cell;
    const cornerDist = (0.5 * cell - Math.abs(fu)) + (0.5 * cell - Math.abs(fv));
    return 1 - clamp01(invHalfDiag - cornerDist + 0.5);
  }

  if (params.dotShape === "line") {
    const halfThick = 0.5 * d * cell;
    return clamp01(halfThick - Math.abs(fu) + 0.5);
  }

  if (params.dotShape === "cross") {
    const halfThick = 0.5 * d * cell;
    const cu = clamp01(halfThick - Math.abs(fu) + 0.5);
    const cv = clamp01(halfThick - Math.abs(fv) + 0.5);
    return Math.max(cu, cv);
  }

  const dist = Math.hypot(fu, fv);
  const radius = Math.sqrt(d / Math.PI) * cell;
  return clamp01(radius - dist + 0.5);
}

function dotShapeToCode(shape: ComputeScreentoneDotShape): number {
  if (shape === "diamond") return 1;
  if (shape === "line") return 2;
  if (shape === "cross") return 3;
  return 0;
}

/** WGSL `ScreentoneOutlineParams` 64바이트(16×4) 정렬 uniform 버퍼를 패킹한다. */
export function packScreentoneOutlineUniforms(
  options: ScreentoneAndOutlineOptions,
  targetBuffer?: ArrayBuffer,
): ArrayBuffer {
  const buffer =
    targetBuffer && targetBuffer.byteLength >= GPU_NEXT_SCREENTONE_UNIFORM_BYTES
      ? targetBuffer
      : new ArrayBuffer(GPU_NEXT_SCREENTONE_UNIFORM_BYTES);
  const u32 = new Uint32Array(buffer, 0, GPU_NEXT_SCREENTONE_UNIFORM_FLOATS);
  const f32 = new Float32Array(buffer, 0, GPU_NEXT_SCREENTONE_UNIFORM_FLOATS);

  const angleRad = ((options.angleDeg ?? 45) * Math.PI) / 180;
  const cellPx = computeScreentoneCellPx(options.lpi ?? 60, options.dpi ?? 300);
  const outlineMode = options.outlineMode ?? "none";

  u32[0] = Math.max(0, Math.floor(options.width));
  u32[1] = Math.max(0, Math.floor(options.height));
  u32[2] = dotShapeToCode(options.dotShape ?? "circle");
  u32[3] = outlineMode === "sobel" ? 1 : 0;
  f32[4] = cellPx;
  f32[5] = Math.cos(angleRad);
  f32[6] = Math.sin(angleRad);
  f32[7] = clamp01(options.density ?? 0.45);
  f32[8] = options.phaseX ?? 0;
  f32[9] = options.phaseY ?? 0;
  f32[10] = clamp01(options.outlineThreshold ?? 0.25);
  f32[11] = clamp01(options.outlineStrength ?? 1);
  u32[12] = packRgba8Tuple(options.inkRgba ?? [18, 18, 22, 255]);
  u32[13] = packRgba8Tuple(options.outlineRgba ?? [12, 12, 16, 255]);
  u32[14] = options.invertTone === true ? 1 : 0;
  u32[15] = options.useSourceLuma === true ? 1 : 0;

  return buffer;
}

/** WGSL `JfaStepParams` 32바이트(8×4) 정렬 uniform 버퍼를 패킹한다. */
export function packJfaStepUniforms(
  params: {
    readonly width: number;
    readonly height: number;
    readonly stepSize: number;
    readonly alphaThresholdU8: number;
    readonly outlineWidthPx: number;
    readonly outlineRgba: readonly [number, number, number, number];
  },
  targetBuffer?: ArrayBuffer,
): ArrayBuffer {
  const buffer =
    targetBuffer && targetBuffer.byteLength >= GPU_NEXT_JFA_STEP_UNIFORM_BYTES
      ? targetBuffer
      : new ArrayBuffer(GPU_NEXT_JFA_STEP_UNIFORM_BYTES);
  const u32 = new Uint32Array(buffer, 0, GPU_NEXT_JFA_STEP_UNIFORM_U32S);
  const i32 = new Int32Array(buffer, 0, GPU_NEXT_JFA_STEP_UNIFORM_U32S);
  const f32 = new Float32Array(buffer, 0, GPU_NEXT_JFA_STEP_UNIFORM_U32S);

  u32[0] = Math.max(0, Math.floor(params.width));
  u32[1] = Math.max(0, Math.floor(params.height));
  i32[2] = Math.max(1, Math.floor(params.stepSize));
  u32[3] = Math.min(255, Math.max(1, Math.floor(params.alphaThresholdU8)));
  f32[4] = Math.max(0.5, params.outlineWidthPx);
  u32[5] = packRgba8Tuple(params.outlineRgba);
  u32[6] = 0;
  u32[7] = 0;

  return buffer;
}

function sampleAlphaClamped(
  srcRgba8: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  ix: number,
  iy: number,
): number {
  const cx = Math.min(width - 1, Math.max(0, ix));
  const cy = Math.min(height - 1, Math.max(0, iy));
  return (srcRgba8[(cy * width + cx) * 4 + 3] ?? 0) / 255;
}

function compositeSourceOverRgba8(
  dst: Uint8ClampedArray,
  offset: number,
  srcR: number,
  srcG: number,
  srcB: number,
  srcA: number,
): void {
  const oa = clamp01(srcA);
  if (oa <= 0.001) return;
  const da = (dst[offset + 3] ?? 0) / 255;
  const outA = oa + da * (1 - oa);
  if (outA <= 1e-6) return;

  const dr = (dst[offset] ?? 0) / 255;
  const dg = (dst[offset + 1] ?? 0) / 255;
  const db = (dst[offset + 2] ?? 0) / 255;

  dst[offset] = Math.round(((srcR * oa + dr * da * (1 - oa)) / outA) * 255);
  dst[offset + 1] = Math.round(((srcG * oa + dg * da * (1 - oa)) / outA) * 255);
  dst[offset + 2] = Math.round(((srcB * oa + db * da * (1 - oa)) / outA) * 255);
  dst[offset + 3] = Math.round(clamp01(outA) * 255);
}

/**
 * 결정적 CPU 비파괴 스크린톤 + Sobel / Jump-Flooding(JFA) 외곽선 렌더러.
 * WGSL 셰이더와 동일한 수식을 사용해 WebGPU 미지원 환경에서도 픽셀 동등성을 보장한다.
 */
export function renderScreentoneAndOutlineCpu(
  srcRgba8: Uint8ClampedArray | Uint8Array,
  options: ScreentoneAndOutlineOptions,
): ScreentoneAndOutlineResult {
  const width = Math.max(0, Math.floor(options.width));
  const height = Math.max(0, Math.floor(options.height));
  const dotShape: ComputeScreentoneDotShape = options.dotShape ?? "circle";
  const outlineMode: ComputeOutlineMode = options.outlineMode ?? "none";
  const cellPx = computeScreentoneCellPx(options.lpi ?? 60, options.dpi ?? 300);

  if (width === 0 || height === 0) {
    return Object.freeze({
      backend: "cpu-fallback",
      width,
      height,
      dotShape,
      outlineMode,
      cellPx,
      passCount: 0,
      jfaSteps: Object.freeze([]),
      pixels: new Uint8ClampedArray(0),
    });
  }

  const angleRad = ((options.angleDeg ?? 45) * Math.PI) / 180;
  const cosAngle = Math.cos(angleRad);
  const sinAngle = Math.sin(angleRad);
  const densityScale = clamp01(options.density ?? 0.45);
  const useSourceLuma = options.useSourceLuma === true;
  const invertTone = options.invertTone === true;
  const phaseX = options.phaseX ?? 0;
  const phaseY = options.phaseY ?? 0;

  const ink = options.inkRgba ?? [18, 18, 22, 255];
  const inkR = (ink[0] ?? 0) / 255;
  const inkG = (ink[1] ?? 0) / 255;
  const inkB = (ink[2] ?? 0) / 255;
  const inkA = (ink[3] ?? 255) / 255;

  const outline = options.outlineRgba ?? [12, 12, 16, 255];
  const outR = (outline[0] ?? 0) / 255;
  const outG = (outline[1] ?? 0) / 255;
  const outB = (outline[2] ?? 0) / 255;
  const outA = (outline[3] ?? 255) / 255;

  const sobelThreshold = Math.max(0.01, clamp01(options.outlineThreshold ?? 0.25));
  const sobelStrength = clamp01(options.outlineStrength ?? 1);

  const dst = new Uint8ClampedArray(width * height * 4);

  // Pass 1: 스크린톤 망점(+ Sobel 모드면 동일 1패스로 외곽선 합성).
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const sr = (srcRgba8[o] ?? 0) / 255;
      const sg = (srcRgba8[o + 1] ?? 0) / 255;
      const sb = (srcRgba8[o + 2] ?? 0) / 255;
      const sa = (srcRgba8[o + 3] ?? 0) / 255;

      const luma = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
      const localDensity = useSourceLuma ? clamp01((1 - luma) * densityScale) : densityScale;

      let cov = evaluateScreentoneDotCoverageCpu(
        x,
        y,
        { dotShape, cellPx, cosAngle, sinAngle, phaseX, phaseY },
        localDensity,
      );
      if (invertTone && localDensity > 0) {
        cov = 1 - cov;
      }
      cov *= sa;

      dst[o] = Math.round(inkR * 255);
      dst[o + 1] = Math.round(inkG * 255);
      dst[o + 2] = Math.round(inkB * 255);
      dst[o + 3] = Math.round(clamp01(cov * inkA) * 255);

      if (outlineMode === "sobel") {
        const tl = sampleAlphaClamped(srcRgba8, width, height, x - 1, y - 1);
        const tc = sampleAlphaClamped(srcRgba8, width, height, x, y - 1);
        const tr = sampleAlphaClamped(srcRgba8, width, height, x + 1, y - 1);
        const ml = sampleAlphaClamped(srcRgba8, width, height, x - 1, y);
        const mr = sampleAlphaClamped(srcRgba8, width, height, x + 1, y);
        const bl = sampleAlphaClamped(srcRgba8, width, height, x - 1, y + 1);
        const bc = sampleAlphaClamped(srcRgba8, width, height, x, y + 1);
        const br = sampleAlphaClamped(srcRgba8, width, height, x + 1, y + 1);

        const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
        const mag = Math.hypot(gx, gy) * 0.25;
        const edge = smoothstep(sobelThreshold * 0.5, sobelThreshold, mag) * sobelStrength;
        if (edge > 0.001) {
          compositeSourceOverRgba8(dst, o, outR, outG, outB, edge * outA);
        }
      }
    }
  }

  if (outlineMode !== "jump-flood") {
    return Object.freeze({
      backend: "cpu-fallback",
      width,
      height,
      dotShape,
      outlineMode,
      cellPx,
      passCount: 1,
      jfaSteps: Object.freeze([]),
      pixels: dst,
    });
  }

  // Jump-Flooding Algorithm (JFA): O(log R) 시드 전파로 임의 두께 유클리드 외곽선 생성.
  const outlineWidthPx = Math.max(0.5, options.outlineWidthPx ?? 3);
  const alphaThresholdU8 = Math.min(255, Math.max(1, Math.floor(options.outlineAlphaThresholdU8 ?? 128)));
  const jfaSteps = computeJfaStepSchedule(outlineWidthPx);
  const pixelCount = width * height;

  let seedA = new Int32Array(pixelCount * 2);
  let seedB = new Int32Array(pixelCount * 2);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const alphaU8 = srcRgba8[idx * 4 + 3] ?? 0;
      if (alphaU8 >= alphaThresholdU8) {
        seedA[idx * 2] = x;
        seedA[idx * 2 + 1] = y;
      } else {
        seedA[idx * 2] = -1;
        seedA[idx * 2 + 1] = -1;
      }
    }
  }

  for (const step of jfaSteps) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let bestX = -1;
        let bestY = -1;
        let bestDist2 = Number.POSITIVE_INFINITY;

        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy * step;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx * step;
            if (nx < 0 || nx >= width) continue;
            const nIdx = (ny * width + nx) * 2;
            const sx = seedA[nIdx] ?? -1;
            const sy = seedA[nIdx + 1] ?? -1;
            if (sx < 0) continue;
            const ddx = x - sx;
            const ddy = y - sy;
            const dist2 = ddx * ddx + ddy * ddy;
            if (dist2 < bestDist2) {
              bestDist2 = dist2;
              bestX = sx;
              bestY = sy;
            }
          }
        }

        const outIdx = (y * width + x) * 2;
        seedB[outIdx] = bestX;
        seedB[outIdx + 1] = bestY;
      }
    }
    const swap = seedA;
    seedA = seedB;
    seedB = swap;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if ((srcRgba8[idx * 4 + 3] ?? 0) >= alphaThresholdU8) continue;
      const sx = seedA[idx * 2] ?? -1;
      const sy = seedA[idx * 2 + 1] ?? -1;
      if (sx < 0) continue;
      const dist = Math.hypot(x - sx, y - sy);
      const cov = clamp01(outlineWidthPx - dist + 0.5);
      if (cov > 0.001) {
        compositeSourceOverRgba8(dst, idx * 4, outR, outG, outB, cov * outA);
      }
    }
  }

  return Object.freeze({
    backend: "cpu-fallback",
    width,
    height,
    dotShape,
    outlineMode,
    cellPx,
    passCount: 2 + jfaSteps.length + 1,
    jfaSteps,
    pixels: dst,
  });
}

/**
 * WebGPU Compute 비파괴 스크린톤 & 외곽선 실행기(미지원 시 결정적 CPU 폴백).
 * `GpuBufferPool`에서 임시 스토리지/유니폼 버퍼를 대여하고 완료 즉시 반납한다.
 */
export async function dispatchScreentoneAndOutline(params: {
  readonly device: GpuNextHdrComputeDeviceLike | null;
  readonly pool: GpuBufferPool;
  readonly warmupQueue: GpuPipelineWarmupQueue;
  readonly srcRgba8: Uint8ClampedArray | Uint8Array;
  readonly options: ScreentoneAndOutlineOptions;
}): Promise<ScreentoneAndOutlineResult> {
  const { device, pool, warmupQueue, srcRgba8, options } = params;
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const dotShape: ComputeScreentoneDotShape = options.dotShape ?? "circle";
  const outlineMode: ComputeOutlineMode = options.outlineMode ?? "none";
  const cellPx = computeScreentoneCellPx(options.lpi ?? 60, options.dpi ?? 300);

  if (device) {
    const tonePipeline = await warmupQueue.getOrCreatePipeline("screentone-outline-onepass");
    const useJfa = outlineMode === "jump-flood";
    const jfaInitPipeline = useJfa ? await warmupQueue.getOrCreatePipeline("jfa-seed-init") : null;
    const jfaStepPipeline = useJfa ? await warmupQueue.getOrCreatePipeline("jfa-flood-step") : null;
    const jfaResolvePipeline = useJfa ? await warmupQueue.getOrCreatePipeline("jfa-outline-resolve") : null;

    const jfaReady =
      !useJfa ||
      (jfaInitPipeline !== null &&
        jfaStepPipeline !== null &&
        jfaResolvePipeline !== null &&
        typeof jfaInitPipeline.getBindGroupLayout === "function" &&
        typeof jfaStepPipeline.getBindGroupLayout === "function" &&
        typeof jfaResolvePipeline.getBindGroupLayout === "function");

    if (tonePipeline && typeof tonePipeline.getBindGroupLayout === "function" && jfaReady) {
      const pixelCount = width * height;
      const rgbaBytes = pixelCount * Uint32Array.BYTES_PER_ELEMENT;
      const workgroupsX = Math.ceil(width / GPU_NEXT_WORKGROUP_SIZE_X);
      const workgroupsY = Math.ceil(height / GPU_NEXT_WORKGROUP_SIZE_Y);

      const uniformHandle = pool.acquireGpuBuffer(
        device,
        GPU_NEXT_SCREENTONE_UNIFORM_BYTES,
        GPU_NEXT_BUFFER_USAGE.UNIFORM | GPU_NEXT_BUFFER_USAGE.COPY_DST,
        "gpu-next-screentone-uniform",
      );
      const srcHandle = pool.acquireGpuBuffer(
        device,
        rgbaBytes,
        GPU_NEXT_BUFFER_USAGE.STORAGE | GPU_NEXT_BUFFER_USAGE.COPY_DST,
        "gpu-next-screentone-src",
      );
      const dstHandle = pool.acquireGpuBuffer(
        device,
        rgbaBytes,
        GPU_NEXT_BUFFER_USAGE.STORAGE | GPU_NEXT_BUFFER_USAGE.COPY_SRC,
        "gpu-next-screentone-dst",
      );

      const jfaSteps = useJfa ? computeJfaStepSchedule(options.outlineWidthPx ?? 3) : [];
      const seedBytes = pixelCount * 2 * Int32Array.BYTES_PER_ELEMENT;
      const seedAHandle = useJfa
        ? pool.acquireGpuBuffer(device, seedBytes, GPU_NEXT_BUFFER_USAGE.STORAGE, "gpu-next-jfa-a")
        : null;
      const seedBHandle = useJfa
        ? pool.acquireGpuBuffer(device, seedBytes, GPU_NEXT_BUFFER_USAGE.STORAGE, "gpu-next-jfa-b")
        : null;
      const jfaUniformHandles: ReturnType<typeof pool.acquireGpuBuffer>[] = [];
      const acquireJfaUniform = (stepSize: number): unknown => {
        const handle = pool.acquireGpuBuffer(
          device,
          GPU_NEXT_JFA_STEP_UNIFORM_BYTES,
          GPU_NEXT_BUFFER_USAGE.UNIFORM | GPU_NEXT_BUFFER_USAGE.COPY_DST,
          `gpu-next-jfa-uniform-step-${stepSize}`,
        );
        jfaUniformHandles.push(handle);
        const uniformBytes = packJfaStepUniforms({
          width,
          height,
          stepSize,
          alphaThresholdU8: options.outlineAlphaThresholdU8 ?? 128,
          outlineWidthPx: options.outlineWidthPx ?? 3,
          outlineRgba: options.outlineRgba ?? [12, 12, 16, 255],
        });
        device.queue.writeBuffer(handle.buffer, 0, new Uint8Array(uniformBytes));
        return handle.buffer;
      };

      try {
        const toneUniforms = packScreentoneOutlineUniforms(options);
        device.queue.writeBuffer(uniformHandle.buffer, 0, new Uint8Array(toneUniforms));
        device.queue.writeBuffer(
          srcHandle.buffer,
          0,
          new Uint8Array(srcRgba8.buffer, srcRgba8.byteOffset, Math.min(srcRgba8.byteLength, rgbaBytes)),
        );

        const toneBindGroup = device.createBindGroup({
          layout: tonePipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniformHandle.buffer } },
            { binding: 1, resource: { buffer: srcHandle.buffer } },
            { binding: 2, resource: { buffer: dstHandle.buffer } },
          ],
          label: "gpu-next-screentone-bg",
        });

        const encoder = device.createCommandEncoder({ label: "gpu-next-screentone-encoder" });
        const pass = encoder.beginComputePass({ label: "gpu-next-screentone-pass" });
        pass.setPipeline(tonePipeline);
        pass.setBindGroup(0, toneBindGroup);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);

        let passCount = 1;
        if (
          useJfa &&
          jfaInitPipeline &&
          jfaStepPipeline &&
          jfaResolvePipeline &&
          jfaInitPipeline.getBindGroupLayout &&
          jfaStepPipeline.getBindGroupLayout &&
          jfaResolvePipeline.getBindGroupLayout &&
          seedAHandle &&
          seedBHandle
        ) {
          const makeJfaBg = (layout: unknown, uniformBuf: unknown, inBuf: unknown, outBuf: unknown) =>
            device.createBindGroup({
              layout,
              entries: [
                { binding: 0, resource: { buffer: uniformBuf } },
                { binding: 1, resource: { buffer: srcHandle.buffer } },
                { binding: 2, resource: { buffer: inBuf } },
                { binding: 3, resource: { buffer: outBuf } },
                { binding: 4, resource: { buffer: dstHandle.buffer } },
              ],
            });

          // 단일 CommandEncoder 내 모든 JFA 단계가 각자의 step_size를 읽도록 단계별 풀링 uniform 버퍼를 바인딩한다.
          const initUniformBuf = acquireJfaUniform(jfaSteps[0] ?? 1);
          pass.setPipeline(jfaInitPipeline);
          pass.setBindGroup(
            0,
            makeJfaBg(jfaInitPipeline.getBindGroupLayout(0), initUniformBuf, seedBHandle.buffer, seedAHandle.buffer),
          );
          pass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
          passCount += 1;

          let readBuf = seedAHandle.buffer;
          let writeBuf = seedBHandle.buffer;
          for (const step of jfaSteps) {
            const stepUniformBuf = acquireJfaUniform(step);
            pass.setPipeline(jfaStepPipeline);
            pass.setBindGroup(0, makeJfaBg(jfaStepPipeline.getBindGroupLayout(0), stepUniformBuf, readBuf, writeBuf));
            pass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
            const tmp = readBuf;
            readBuf = writeBuf;
            writeBuf = tmp;
            passCount += 1;
          }

          const resolveUniformBuf = acquireJfaUniform(1);
          pass.setPipeline(jfaResolvePipeline);
          pass.setBindGroup(
            0,
            makeJfaBg(jfaResolvePipeline.getBindGroupLayout(0), resolveUniformBuf, readBuf, writeBuf),
          );
          pass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
          passCount += 1;
        }

        pass.end();
        device.queue.submit([encoder.finish()]);

        return Object.freeze({
          backend: "webgpu",
          width,
          height,
          dotShape,
          outlineMode,
          cellPx,
          passCount,
          jfaSteps: Object.freeze(jfaSteps),
          pixels: null,
        });
      } finally {
        uniformHandle.release();
        srcHandle.release();
        dstHandle.release();
        seedAHandle?.release();
        seedBHandle?.release();
        for (const handle of jfaUniformHandles) {
          handle.release();
        }
      }
    }
  }

  return renderScreentoneAndOutlineCpu(srcRgba8, options);
}
