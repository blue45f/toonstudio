/**
 * 16-bit 선형 HDR(`rgba16float`) 페인팅 + 8×8 Bayer / 삼각 PDF(TPDF) 무밴딩 디더링 +
 * 가변 프레임 버제팅·LRU 타일 회수 통합 모듈.
 *
 * - IEC 61966-2-1 정확한 sRGB EOTF/OETF와 IEEE-754 binary16(`rgba16float`) 패킹/언패킹으로
 *   감마 공간 암부 뭉개짐과 8비트 그라데이션 계단(밴딩)을 제거한다.
 * - WebGPU `GPUDevice`가 있으면 `GpuBufferPool`·`GpuPipelineWarmupQueue`와 연동해
 *   `GPU_NEXT_HDR_LINEAR_BLEND_DITHER_WGSL` Compute 패스를 실행하고,
 *   GPU 미지원 환경에서는 100% 동일한 수학의 결정적 CPU 폴백으로 동작한다.
 */

import {
  clampStudioHighBitUnit,
  studioHighBitLinearToSrgb,
  studioHighBitSrgbToLinear,
} from "../../studio-highbit-transfer";

import {
  GPU_NEXT_BUFFER_USAGE,
  type GpuBufferPool,
  type GpuNextBufferDeviceLike,
  type GpuPipelineWarmupQueue,
} from "./gpu-buffer-pool-and-warmup";
import {
  GPU_NEXT_HDR_UNIFORM_BYTES,
  GPU_NEXT_HDR_UNIFORM_FLOATS,
  GPU_NEXT_WORKGROUP_SIZE_X,
  GPU_NEXT_WORKGROUP_SIZE_Y,
} from "./gpu-next-wgsl-shaders";

export {
  AdaptiveFrameBudgetController,
  LruTileResidencyEvictionScheduler,
  type AdaptiveFrameBudgetDecision,
  type AdaptiveFrameBudgetOptions,
  type AdaptiveFrameBudgetSnapshot,
  type FrameBudgetSampleInput,
  type FrameInteractionMode,
  type GpuMemoryPressureLevel,
  type LruTileEvictionOptions,
  type LruTileEvictionPlanResult,
  type LruTileSchedulerSnapshot,
  type ResidentTileRegistration,
  type TileBounds2D,
} from "./gpu-frame-budget-and-lru-tiles";

export const GPU_NEXT_HDR_TEXTURE_FORMAT = "rgba16float" as const;

export type HdrLinearBlendMode = "source-over" | "additive" | "multiply" | "screen";
export type HdrDitherMode = "none" | "bayer8x8" | "tpdf" | "bayer8x8-tpdf-hybrid";
export type HdrTonemapMode = "clamp" | "reinhard-extended";

export interface HdrDitherPassOptions {
  readonly width: number;
  readonly height: number;
  readonly blendMode?: HdrLinearBlendMode;
  readonly ditherMode?: HdrDitherMode;
  readonly tonemapMode?: HdrTonemapMode;
  readonly seed?: number;
  readonly opacity?: number;
  readonly exposure?: number;
  readonly whitePoint?: number;
}

export type HdrDitherUniformInput = Required<HdrDitherPassOptions>;

export interface GradientBandingMetrics {
  readonly sampleCount: number;
  /** 인접 1 LSB 계단 구간의 최대 연속 평탄 길이(px). 디더링 적용 시 급감한다. */
  readonly maxFlatRunLength: number;
  /** 8×8 공간 블록 평균과 연속 참값 평균의 최대 절대 오차(0..255 LSB 단위). */
  readonly maxBlockMeanErrorLsb: number;
  /** 8×8 공간 블록 평균 오차의 RMS(LSB 단위). */
  readonly rmsBlockMeanErrorLsb: number;
  /** 고유 양자화 전환(dither dithering transition) 밀도. */
  readonly transitionCount: number;
}

export interface GpuNextHdrComputeDeviceLike extends GpuNextBufferDeviceLike {
  readonly queue: {
    writeBuffer(
      buffer: unknown,
      bufferOffset: number,
      data: ArrayBufferView,
      dataOffset?: number,
      size?: number,
    ): void;
    submit(commandBuffers: readonly unknown[]): void;
  };
  createBindGroup(descriptor: {
    readonly layout: unknown;
    readonly entries: readonly { readonly binding: number; readonly resource: { readonly buffer: unknown } }[];
    readonly label?: string;
  }): unknown;
  createCommandEncoder(descriptor?: { readonly label?: string }): {
    beginComputePass(descriptor?: { readonly label?: string }): {
      setPipeline(pipeline: unknown): void;
      setBindGroup(index: number, bindGroup: unknown): void;
      dispatchWorkgroups(x: number, y?: number, z?: number): void;
      end(): void;
    };
    finish(): unknown;
  };
}

export interface HdrDispatchResult {
  readonly backend: "webgpu" | "cpu-fallback";
  readonly textureFormat: typeof GPU_NEXT_HDR_TEXTURE_FORMAT;
  readonly width: number;
  readonly height: number;
  readonly ditherMode: HdrDitherMode;
  readonly blendMode: HdrLinearBlendMode;
  /** CPU 폴백 또는 동기 출력 시 생성된 RGBA8 sRGB 픽셀. WebGPU 경로는 GPU 버퍼 제출 완료 후 선택적으로 CPU 미러를 생략한다. */
  readonly srgb8Pixels: Uint8ClampedArray | null;
  readonly workgroupsX: number;
  readonly workgroupsY: number;
}

const f32Scratch = new Float32Array(1);
const u32Scratch = new Uint32Array(f32Scratch.buffer);

/** IEEE-754 float32 값을 `rgba16float` 호환 16-bit half-float 비트 패턴으로 인코딩한다. */
export function float32ToFloat16Bits(value: number): number {
  if (Number.isNaN(value)) return 0x7e00;
  f32Scratch[0] = value;
  const bits = u32Scratch[0] ?? 0;
  const sign = (bits >>> 16) & 0x8000;
  const exp = (bits >>> 23) & 0xff;
  const mant = bits & 0x007fffff;

  if (exp === 0xff) {
    return mant !== 0 ? 0x7e00 : sign | 0x7c00;
  }

  const unbiased = exp - 127;
  if (unbiased > 15) {
    // HDR 페인팅 파이프라인에서 유한 오버플로가 Inf/NaN으로 번지지 않게 최대 유한값(65504)으로 고정.
    return sign | 0x7bff;
  }

  if (unbiased >= -14) {
    let halfExp = unbiased + 15;
    let halfMant = mant >>> 13;
    const rem = mant & 0x1fff;
    if (rem > 0x1000 || (rem === 0x1000 && (halfMant & 1) !== 0)) {
      halfMant += 1;
      if (halfMant === 0x400) {
        halfMant = 0;
        halfExp += 1;
        if (halfExp >= 31) return sign | 0x7bff;
      }
    }
    return sign | (halfExp << 10) | halfMant;
  }

  if (unbiased >= -24) {
    const fullMant = 0x00800000 | mant;
    const shift = -14 - unbiased + 13;
    let halfMant = fullMant >>> shift;
    const halfBit = 1 << (shift - 1);
    const remMask = (1 << shift) - 1;
    const rem = fullMant & remMask;
    if (rem > halfBit || (rem === halfBit && (halfMant & 1) !== 0)) {
      halfMant += 1;
    }
    return sign | halfMant;
  }

  return sign;
}

/** `rgba16float` 16-bit half-float 비트 패턴을 IEEE-754 float32 숫자로 디코딩한다. */
export function float16BitsToFloat32(halfBits: number): number {
  const h = halfBits & 0xffff;
  const sign = (h & 0x8000) !== 0 ? -1 : 1;
  const exp = (h >>> 10) & 0x1f;
  const mant = h & 0x03ff;

  if (exp === 0) {
    if (mant === 0) return sign < 0 ? -0 : 0;
    return sign * Math.pow(2, -14) * (mant / 1024);
  }
  if (exp === 31) {
    return mant === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
  }
  return sign * Math.pow(2, exp - 15) * (1 + mant / 1024);
}

/** 선형 RGBA float32 버퍼를 WebGPU `rgba16float` 호환 Uint16Array(픽셀당 8바이트)로 패킹한다. */
export function packLinearRgbaToRgba16Float(linearRgba: Float32Array): Uint16Array {
  const out = new Uint16Array(linearRgba.length);
  for (let i = 0; i < linearRgba.length; i += 1) {
    out[i] = float32ToFloat16Bits(linearRgba[i] ?? 0);
  }
  return out;
}

/** WebGPU `rgba16float` Uint16Array를 선형 RGBA Float32Array로 언패킹한다. */
export function unpackRgba16FloatToLinearRgba(halfRgba: Uint16Array): Float32Array {
  const out = new Float32Array(halfRgba.length);
  for (let i = 0; i < halfRgba.length; i += 1) {
    out[i] = float16BitsToFloat32(halfRgba[i] ?? 0);
  }
  return out;
}

/** sRGB 8-bit RGBA 픽셀을 선형 광학 공간 Float32Array로 디코딩한다(IEC 61966-2-1). */
export function decodeSrgb8ToLinearHdr(srgb8: Uint8ClampedArray | Uint8Array): Float32Array {
  const linear = new Float32Array(srgb8.length);
  for (let i = 0; i + 3 < srgb8.length; i += 4) {
    linear[i] = studioHighBitSrgbToLinear((srgb8[i] ?? 0) / 255);
    linear[i + 1] = studioHighBitSrgbToLinear((srgb8[i + 1] ?? 0) / 255);
    linear[i + 2] = studioHighBitSrgbToLinear((srgb8[i + 2] ?? 0) / 255);
    linear[i + 3] = (srgb8[i + 3] ?? 0) / 255;
  }
  return linear;
}

/**
 * WGSL `bayer8x8_threshold`와 비트 단위로 일치하는 O(1) 비트 인터리빙 Bayer 8×8 행렬 계산.
 * 반환값: `[-0.5 + 1/128, 0.5 - 1/128]` (평균 0).
 */
export function computeBayer8x8Cell(px: number, py: number): number {
  const x = px & 7;
  const y = py & 7;
  const p0 = (((x & 1) ^ (y & 1)) << 1) | (y & 1);
  const x1 = (x >>> 1) & 1;
  const y1 = (y >>> 1) & 1;
  const p1 = ((x1 ^ y1) << 1) | y1;
  const x2 = (x >>> 2) & 1;
  const y2 = (y >>> 2) & 1;
  const p2 = ((x2 ^ y2) << 1) | y2;
  return (p0 << 4) | (p1 << 2) | p2;
}

export function computeBayer8x8Threshold(
  px: number,
  py: number,
  seed: number,
  channel: number,
): number {
  const shift = (seed | 0) & 7;
  const x = (px + shift) & 7;
  const y = (py + channel + shift) & 7;
  return (computeBayer8x8Cell(x, y) + 0.5) / 64 - 0.5;
}

/** WGSL `dither_hash01`와 비트 일치하는 결정적 정수 해시 → [0, 1). */
export function computeDeterministicDitherHash01(
  px: number,
  py: number,
  seed: number,
  channel: number,
): number {
  let h = (Math.imul(px | 0, 0x27d4eb2d) ^ Math.imul(py | 0, 0x165667b1)) | 0;
  h = Math.imul((h ^ (channel | 0) ^ (seed | 0)) | 0, 0x85ebca6b) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 0xc2b2ae35) | 0;
  h = (h ^ (h >>> 16)) | 0;
  return (h >>> 0) / 4294967296;
}

/**
 * WGSL `dither_offset`과 100% 일치하는 디더링 오프셋(LSB 단위).
 * - `bayer8x8`: [-0.5, 0.5)
 * - `tpdf`: (-1, +1) 삼각 확률 밀도 함수(오차-신호 비상관, 평균 0)
 * - `bayer8x8-tpdf-hybrid`: Bayer 65% + TPDF 35%
 */
export function computeHdrDitherOffset(
  mode: HdrDitherMode,
  px: number,
  py: number,
  seed: number,
  channel: number,
): number {
  if (mode === "none") return 0;
  if (mode === "bayer8x8") {
    return computeBayer8x8Threshold(px, py, seed, channel);
  }
  const u0 = computeDeterministicDitherHash01(px, py, seed, channel);
  const u1 = computeDeterministicDitherHash01(px, py, (seed ^ 0x9e3779b9) | 0, channel);
  const tpdf = u0 - u1;
  if (mode === "tpdf") return tpdf;
  return computeBayer8x8Threshold(px, py, seed, channel) + tpdf * 0.5;
}

export function applyHdrTonemapChannel(
  linearValue: number,
  exposure: number,
  whitePoint: number,
  mode: HdrTonemapMode,
): number {
  const exposed = Math.max(0, (Number.isFinite(linearValue) ? linearValue : 0) * exposure);
  if (mode === "reinhard-extended") {
    const wp2 = Math.max(1, whitePoint * whitePoint);
    return (exposed * (1 + exposed / wp2)) / (1 + exposed);
  }
  return clampStudioHighBitUnit(exposed);
}

/** 선형 HDR 광학 공간에서 `srcLinear`를 `dstLinear` 위에 인플레이스 합성한다(WGSL과 동일 수식). */
export function blendLinearHdrPixelsCpu(
  dstLinear: Float32Array,
  srcLinear: Float32Array,
  pixelCount: number,
  blendMode: HdrLinearBlendMode = "source-over",
  opacity = 1,
): void {
  const safeOpacity = clampStudioHighBitUnit(opacity);
  const count = Math.min(
    pixelCount,
    Math.floor(dstLinear.length / 4),
    Math.floor(srcLinear.length / 4),
  );

  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    const sr = Math.max(0, srcLinear[o] ?? 0);
    const sg = Math.max(0, srcLinear[o + 1] ?? 0);
    const sb = Math.max(0, srcLinear[o + 2] ?? 0);
    const sa = clampStudioHighBitUnit((srcLinear[o + 3] ?? 0) * safeOpacity);

    const dr = Math.max(0, dstLinear[o] ?? 0);
    const dg = Math.max(0, dstLinear[o + 1] ?? 0);
    const db = Math.max(0, dstLinear[o + 2] ?? 0);
    const da = clampStudioHighBitUnit(dstLinear[o + 3] ?? 0);

    if (blendMode === "additive") {
      const outA = clampStudioHighBitUnit(da + sa * (1 - da));
      dstLinear[o] = dr * da + sr * sa;
      dstLinear[o + 1] = dg * da + sg * sa;
      dstLinear[o + 2] = db * da + sb * sa;
      dstLinear[o + 3] = outA;
      continue;
    }

    const outA = sa + da * (1 - sa);
    if (outA <= 1e-6) {
      dstLinear[o] = 0;
      dstLinear[o + 1] = 0;
      dstLinear[o + 2] = 0;
      dstLinear[o + 3] = 0;
      continue;
    }

    if (blendMode === "multiply") {
      dstLinear[o] = (sr * sa * (1 - da) + dr * da * (1 - sa) + sr * dr * sa * da) / outA;
      dstLinear[o + 1] = (sg * sa * (1 - da) + dg * da * (1 - sa) + sg * dg * sa * da) / outA;
      dstLinear[o + 2] = (sb * sa * (1 - da) + db * da * (1 - sa) + sb * db * sa * da) / outA;
      dstLinear[o + 3] = outA;
      continue;
    }

    if (blendMode === "screen") {
      const scrR = 1 - (1 - clampStudioHighBitUnit(sr)) * (1 - clampStudioHighBitUnit(dr));
      const scrG = 1 - (1 - clampStudioHighBitUnit(sg)) * (1 - clampStudioHighBitUnit(dg));
      const scrB = 1 - (1 - clampStudioHighBitUnit(sb)) * (1 - clampStudioHighBitUnit(db));
      dstLinear[o] = (sr * sa * (1 - da) + dr * da * (1 - sa) + scrR * sa * da) / outA;
      dstLinear[o + 1] = (sg * sa * (1 - da) + dg * da * (1 - sa) + scrG * sa * da) / outA;
      dstLinear[o + 2] = (sb * sa * (1 - da) + db * da * (1 - sa) + scrB * sa * da) / outA;
      dstLinear[o + 3] = outA;
      continue;
    }

    // source-over (선형 광학 프리멀티플라이드 합성)
    dstLinear[o] = (sr * sa + dr * da * (1 - sa)) / outA;
    dstLinear[o + 1] = (sg * sa + dg * da * (1 - sa)) / outA;
    dstLinear[o + 2] = (sb * sa + db * da * (1 - sa)) / outA;
    dstLinear[o + 3] = outA;
  }
}

/**
 * 16-bit 선형 HDR 버퍼를 8-bit sRGB(`Uint8ClampedArray`)로 변환하며 8×8 Bayer 또는 TPDF 디더링을 적용한다.
 * `simulateRgba16FloatQuantization=true`일 때 실제 `rgba16float` half-float 정밀도 왕복을 거친다.
 */
export function encodeLinearHdrToSrgb8Dithered(
  linearRgba: Float32Array,
  options: HdrDitherPassOptions & { readonly simulateRgba16FloatQuantization?: boolean },
): Uint8ClampedArray {
  const width = Math.max(0, Math.floor(options.width));
  const height = Math.max(0, Math.floor(options.height));
  const ditherMode: HdrDitherMode = options.ditherMode ?? "bayer8x8";
  const tonemapMode: HdrTonemapMode = options.tonemapMode ?? "reinhard-extended";
  const seed = Math.floor(options.seed ?? 0);
  const exposure = options.exposure ?? 1;
  const whitePoint = options.whitePoint ?? 4;
  const useF16 = options.simulateRgba16FloatQuantization === true;

  const out = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      for (let ch = 0; ch < 3; ch += 1) {
        const raw = linearRgba[o + ch] ?? 0;
        const sample = useF16 ? float16BitsToFloat32(float32ToFloat16Bits(raw)) : raw;
        const mapped = applyHdrTonemapChannel(sample, exposure, whitePoint, tonemapMode);
        const srgb01 = studioHighBitLinearToSrgb(clampStudioHighBitUnit(mapped));
        const dither = computeHdrDitherOffset(ditherMode, x, y, seed, ch);
        const quantized = Math.floor(Math.min(255, Math.max(0, srgb01 * 255 + dither)) + 0.5);
        out[o + ch] = quantized;
      }
      const alpha = clampStudioHighBitUnit(linearRgba[o + 3] ?? 1);
      out[o + 3] = Math.floor(alpha * 255 + 0.5);
    }
  }

  return out;
}

function blendModeToCode(mode: HdrLinearBlendMode): number {
  if (mode === "additive") return 1;
  if (mode === "multiply") return 2;
  if (mode === "screen") return 3;
  return 0;
}

function ditherModeToCode(mode: HdrDitherMode): number {
  if (mode === "bayer8x8") return 1;
  if (mode === "tpdf") return 2;
  if (mode === "bayer8x8-tpdf-hybrid") return 3;
  return 0;
}

/** WGSL `HdrBlendDitherParams` 16바이트 정렬 uniform 버퍼를 패킹한다. */
export function packHdrDitherUniforms(
  options: HdrDitherPassOptions,
  targetBuffer?: ArrayBuffer,
): ArrayBuffer {
  const buffer =
    targetBuffer && targetBuffer.byteLength >= GPU_NEXT_HDR_UNIFORM_BYTES
      ? targetBuffer
      : new ArrayBuffer(GPU_NEXT_HDR_UNIFORM_BYTES);
  const u32 = new Uint32Array(buffer, 0, GPU_NEXT_HDR_UNIFORM_FLOATS);
  const f32 = new Float32Array(buffer, 0, GPU_NEXT_HDR_UNIFORM_FLOATS);

  u32[0] = Math.max(0, Math.floor(options.width));
  u32[1] = Math.max(0, Math.floor(options.height));
  u32[2] = blendModeToCode(options.blendMode ?? "source-over");
  u32[3] = ditherModeToCode(options.ditherMode ?? "bayer8x8");
  u32[4] = (options.seed ?? 0) >>> 0;
  u32[5] = (options.tonemapMode ?? "reinhard-extended") === "reinhard-extended" ? 1 : 0;
  f32[6] = clampStudioHighBitUnit(options.opacity ?? 1);
  f32[7] = Math.max(0, options.exposure ?? 1);
  f32[8] = Math.max(1, options.whitePoint ?? 4);
  f32[9] = 0;
  f32[10] = 0;
  f32[11] = 0;

  return buffer;
}

/**
 * WebGPU Compute HDR 선형 블렌드 + 무밴딩 디더링 실행기(미지원 시 결정적 CPU 폴백).
 * 풀(`GpuBufferPool`)에서 버퍼를 대여·반납하므로 프레임당 GPU 할당을 최소화한다.
 */
export async function dispatchHdrBlendAndDither(params: {
  readonly device: GpuNextHdrComputeDeviceLike | null;
  readonly pool: GpuBufferPool;
  readonly warmupQueue: GpuPipelineWarmupQueue;
  readonly dstLinear: Float32Array;
  readonly srcLinear: Float32Array;
  readonly options: HdrDitherPassOptions;
}): Promise<HdrDispatchResult> {
  const { device, pool, warmupQueue, dstLinear, srcLinear, options } = params;
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const blendMode: HdrLinearBlendMode = options.blendMode ?? "source-over";
  const ditherMode: HdrDitherMode = options.ditherMode ?? "bayer8x8";
  const workgroupsX = Math.ceil(width / GPU_NEXT_WORKGROUP_SIZE_X);
  const workgroupsY = Math.ceil(height / GPU_NEXT_WORKGROUP_SIZE_Y);

  if (device) {
    const blendPipeline = await warmupQueue.getOrCreatePipeline("hdr-linear-blend");
    const ditherPipeline = await warmupQueue.getOrCreatePipeline("hdr-tonemap-dither-srgb8");

    if (
      blendPipeline &&
      ditherPipeline &&
      typeof blendPipeline.getBindGroupLayout === "function" &&
      typeof ditherPipeline.getBindGroupLayout === "function"
    ) {
      const uniformBytes = packHdrDitherUniforms(options);
      const pixelCount = width * height;
      const linearBytes = pixelCount * 4 * Float32Array.BYTES_PER_ELEMENT;
      const srgb8Bytes = pixelCount * Uint32Array.BYTES_PER_ELEMENT;

      const uniformHandle = pool.acquireGpuBuffer(
        device,
        GPU_NEXT_HDR_UNIFORM_BYTES,
        GPU_NEXT_BUFFER_USAGE.UNIFORM | GPU_NEXT_BUFFER_USAGE.COPY_DST,
        "gpu-next-hdr-uniform",
      );
      const srcHandle = pool.acquireGpuBuffer(
        device,
        linearBytes,
        GPU_NEXT_BUFFER_USAGE.STORAGE | GPU_NEXT_BUFFER_USAGE.COPY_DST,
        "gpu-next-hdr-src",
      );
      const dstHandle = pool.acquireGpuBuffer(
        device,
        linearBytes,
        GPU_NEXT_BUFFER_USAGE.STORAGE | GPU_NEXT_BUFFER_USAGE.COPY_DST | GPU_NEXT_BUFFER_USAGE.COPY_SRC,
        "gpu-next-hdr-dst",
      );
      const outHandle = pool.acquireGpuBuffer(
        device,
        srgb8Bytes,
        GPU_NEXT_BUFFER_USAGE.STORAGE | GPU_NEXT_BUFFER_USAGE.COPY_SRC,
        "gpu-next-hdr-out-srgb8",
      );

      try {
        device.queue.writeBuffer(uniformHandle.buffer, 0, new Uint8Array(uniformBytes));
        device.queue.writeBuffer(srcHandle.buffer, 0, srcLinear);
        device.queue.writeBuffer(dstHandle.buffer, 0, dstLinear);

        const entries = [
          { binding: 0, resource: { buffer: uniformHandle.buffer } },
          { binding: 1, resource: { buffer: srcHandle.buffer } },
          { binding: 2, resource: { buffer: dstHandle.buffer } },
          { binding: 3, resource: { buffer: outHandle.buffer } },
        ] as const;

        const blendBindGroup = device.createBindGroup({
          layout: blendPipeline.getBindGroupLayout(0),
          entries,
          label: "gpu-next-hdr-blend-bg",
        });
        const ditherBindGroup = device.createBindGroup({
          layout: ditherPipeline.getBindGroupLayout(0),
          entries,
          label: "gpu-next-hdr-dither-bg",
        });

        const encoder = device.createCommandEncoder({ label: "gpu-next-hdr-encoder" });
        const pass = encoder.beginComputePass({ label: "gpu-next-hdr-pass" });
        pass.setPipeline(blendPipeline);
        pass.setBindGroup(0, blendBindGroup);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
        pass.setPipeline(ditherPipeline);
        pass.setBindGroup(0, ditherBindGroup);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
        pass.end();
        device.queue.submit([encoder.finish()]);

        return Object.freeze({
          backend: "webgpu",
          textureFormat: GPU_NEXT_HDR_TEXTURE_FORMAT,
          width,
          height,
          ditherMode,
          blendMode,
          srgb8Pixels: null,
          workgroupsX,
          workgroupsY,
        });
      } finally {
        uniformHandle.release();
        srcHandle.release();
        dstHandle.release();
        outHandle.release();
      }
    }
  }

  blendLinearHdrPixelsCpu(dstLinear, srcLinear, width * height, blendMode, options.opacity ?? 1);
  const srgb8Pixels = encodeLinearHdrToSrgb8Dithered(dstLinear, {
    ...options,
    width,
    height,
    ditherMode,
    blendMode,
    simulateRgba16FloatQuantization: true,
  });

  return Object.freeze({
    backend: "cpu-fallback",
    textureFormat: GPU_NEXT_HDR_TEXTURE_FORMAT,
    width,
    height,
    ditherMode,
    blendMode,
    srgb8Pixels,
    workgroupsX,
    workgroupsY,
  });
}

/**
 * 8-bit sRGB 그라데이션 이미지의 계단 밴딩 및 8×8 공간 평균 충실도를 계측한다.
 * 무디더링 대비 Bayer 8×8 / TPDF 디더링이 평탄 계단 폭과 8×8 블록 평균 오차를
 * 0에 가깝게 줄였는지 수치 검증하는 데 사용한다.
 */
export function measureGradientBandingMetrics(
  srgb8Pixels: Uint8ClampedArray,
  expectedContinuousSrgb255: Float32Array,
  width: number,
  height: number,
  channel = 0,
): GradientBandingMetrics {
  const ch = Math.max(0, Math.min(2, Math.floor(channel)));
  let maxFlatRunLength = 0;
  let transitionCount = 0;

  for (let y = 0; y < height; y += 1) {
    let run = 1;
    let prev = srgb8Pixels[(y * width) * 4 + ch] ?? 0;
    for (let x = 1; x < width; x += 1) {
      const cur = srgb8Pixels[(y * width + x) * 4 + ch] ?? 0;
      if (cur === prev) {
        run += 1;
      } else {
        transitionCount += 1;
        if (run > maxFlatRunLength) maxFlatRunLength = run;
        run = 1;
        prev = cur;
      }
    }
    if (run > maxFlatRunLength) maxFlatRunLength = run;
  }

  let maxBlockMeanErrorLsb = 0;
  let sumSqBlockError = 0;
  let blockCount = 0;
  const blockSize = 8;

  for (let by = 0; by + blockSize <= height; by += blockSize) {
    for (let bx = 0; bx + blockSize <= width; bx += blockSize) {
      let actualSum = 0;
      let expectedSum = 0;
      for (let dy = 0; dy < blockSize; dy += 1) {
        for (let dx = 0; dx < blockSize; dx += 1) {
          const pixelIdx = (by + dy) * width + (bx + dx);
          actualSum += srgb8Pixels[pixelIdx * 4 + ch] ?? 0;
          expectedSum += expectedContinuousSrgb255[pixelIdx] ?? 0;
        }
      }
      const area = blockSize * blockSize;
      const err = Math.abs(actualSum / area - expectedSum / area);
      if (err > maxBlockMeanErrorLsb) maxBlockMeanErrorLsb = err;
      sumSqBlockError += err * err;
      blockCount += 1;
    }
  }

  return Object.freeze({
    sampleCount: width * height,
    maxFlatRunLength,
    maxBlockMeanErrorLsb,
    rmsBlockMeanErrorLsb: blockCount > 0 ? Math.sqrt(sumSqBlockError / blockCount) : 0,
    transitionCount,
  });
}
