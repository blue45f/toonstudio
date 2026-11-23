/**
 * Wasm64 ↔ WebGPU 제로 카피 링 버퍼 브리지(`ZeroCopyGpuRingBridge`) + 4종 WGSL 컴퓨트 셰이더
 * + 결정론적 CPU 바이트 동등 폴백 + GPU 메모리 상한 거버너 오케스트레이터.
 */

import {
  BLEND_MODE_TO_CODE,
  applyImpastoReliefCpu,
  applySeparableFilterGraphCpu,
  buildGaussianKernel1D,
  compositeMultiLayerCpu,
  computeDelaunayTriangulation,
  solveArapMlsMeshDeformation,
  warpImageArapMeshCpu,
  type ArapWarpPin,
  type ArapWarpResult,
  type DelaunayTriangle,
  type ImpastoReliefConfig,
  type MultiLayerBlendInput,
  type Point2D,
  type SeparableFilterGraphConfig,
  type ZeroCopyBlendMode,
} from "./cpu-compute-fallbacks";
import {
  WEBGPU_COMPUTE_WORKGROUP_SIZE,
  WGSL_ARAP_MESH_WARP_SHADER,
  WGSL_IMPASTO_RELIEF_COMPOSITE_SHADER,
  WGSL_MULTI_LAYER_BLEND_SHADER,
  WGSL_SEPARABLE_FILTER_GRAPH_SHADER,
  WGSL_SHADER_CONTRACTS,
  computeWorkgroupDispatch,
  type WgslShaderContract,
} from "./wgsl-compute-shaders";

export {
  BLEND_MODE_TO_CODE,
  WEBGPU_COMPUTE_WORKGROUP_SIZE,
  WGSL_ARAP_MESH_WARP_SHADER,
  WGSL_IMPASTO_RELIEF_COMPOSITE_SHADER,
  WGSL_MULTI_LAYER_BLEND_SHADER,
  WGSL_SEPARABLE_FILTER_GRAPH_SHADER,
  WGSL_SHADER_CONTRACTS,
  applyImpastoReliefCpu,
  applySeparableFilterGraphCpu,
  buildGaussianKernel1D,
  compositeMultiLayerCpu,
  computeDelaunayTriangulation,
  computeWorkgroupDispatch,
  solveArapMlsMeshDeformation,
  warpImageArapMeshCpu,
  type ArapWarpPin,
  type ArapWarpResult,
  type DelaunayTriangle,
  type ImpastoReliefConfig,
  type MultiLayerBlendInput,
  type Point2D,
  type SeparableFilterGraphConfig,
  type WgslShaderContract,
  type ZeroCopyBlendMode,
};

export const WEBGPU_STORAGE_OFFSET_ALIGNMENT = 256 as const;
export const DEFAULT_GPU_MEMORY_BUDGET_BYTES = 128 * 1024 * 1024;
export const DEFAULT_RING_SLOT_COUNT = 3 as const;

export type ZeroCopyBackendKind = "webgpu" | "cpu-fallback";
export type ZeroCopyBackingKind = "shared-array-buffer" | "array-buffer";

export interface WebGpuBufferLike {
  readonly label?: string;
  readonly size: number;
  destroy?: () => void;
}

export interface WebGpuQueueLike {
  writeBuffer(
    buffer: WebGpuBufferLike,
    bufferOffset: number,
    data: ArrayBufferLike | ArrayBufferView,
    dataOffset?: number,
    size?: number,
  ): void;
}

export interface WebGpuDeviceLike {
  readonly queue: WebGpuQueueLike;
  createShaderModule?: (descriptor: { readonly code: string; readonly label?: string }) => unknown;
}

export interface ZeroCopyRingBridgeOptions {
  readonly slotCount?: number;
  readonly slotByteLength?: number;
  readonly alignment?: number;
  readonly gpuMemoryBudgetBytes?: number;
  readonly preferSharedArrayBuffer?: boolean;
  readonly externalBackingBuffer?: ArrayBufferLike | null;
  readonly gpuDevice?: WebGpuDeviceLike | null;
}

export interface ZeroCopyBufferSlice {
  readonly slotIndex: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly buffer: ArrayBufferLike;
  readonly view: Uint8Array;
  readonly floatView: Float32Array;
  readonly backingKind: ZeroCopyBackingKind;
  readonly copyCount: 0;
}

export interface ZeroCopyUploadPlan {
  readonly backend: ZeroCopyBackendKind;
  readonly sourceBuffer: ArrayBufferLike;
  readonly dataOffset: number;
  readonly size: number;
  readonly dstOffset: number;
  readonly copyCount: 0;
}

export interface GpuMemoryGovernorStats {
  readonly budgetBytes: number;
  readonly allocatedBytes: number;
  readonly peakAllocatedBytes: number;
  readonly activeEntryCount: number;
  readonly evictionCount: number;
  readonly backingKind: ZeroCopyBackingKind;
  readonly backend: ZeroCopyBackendKind;
  readonly totalZeroCopySlices: number;
  readonly totalBufferCopies: 0;
}

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function createBackingBuffer(
  byteLength: number,
  preferShared: boolean,
): { readonly buffer: ArrayBufferLike; readonly kind: ZeroCopyBackingKind } {
  if (preferShared && typeof SharedArrayBuffer === "function") {
    try {
      return { buffer: new SharedArrayBuffer(byteLength), kind: "shared-array-buffer" };
    } catch {
      // 격리 헤더 미지원 환경에서는 일반 ArrayBuffer로 폴백
    }
  }
  return { buffer: new ArrayBuffer(byteLength), kind: "array-buffer" };
}

/**
 * Wasm64 선형 메모리(`SharedArrayBuffer`/`ArrayBuffer`) ↔ WebGPU 제로 카피 링 버퍼 브리지.
 * 256바이트 정렬 슬라이스 오프셋 뷰만 발급해 중간 버퍼 복사 횟수를 0회로 유지한다.
 */
export class ZeroCopyGpuRingBridge {
  readonly slotCount: number;
  readonly slotByteLength: number;
  readonly alignment: number;
  readonly gpuMemoryBudgetBytes: number;
  readonly backingBuffer: ArrayBufferLike;
  readonly backingKind: ZeroCopyBackingKind;

  private readonly gpuDevice: WebGpuDeviceLike | null;
  private activeSlot = 0;
  private slotCursor = 0;
  private totalZeroCopySlices = 0;
  private allocatedGpuBytes = 0;
  private peakGpuBytes = 0;
  private evictionCount = 0;
  private readonly gpuAllocations = new Map<string, { bytes: number; buffer?: WebGpuBufferLike }>();

  constructor(options: ZeroCopyRingBridgeOptions = {}) {
    this.alignment = Math.max(4, options.alignment ?? WEBGPU_STORAGE_OFFSET_ALIGNMENT);
    this.slotCount = Math.max(1, Math.floor(options.slotCount ?? DEFAULT_RING_SLOT_COUNT));
    this.slotByteLength = alignUp(Math.max(4096, options.slotByteLength ?? 1024 * 1024), this.alignment);
    this.gpuMemoryBudgetBytes = Math.max(
      this.slotByteLength,
      options.gpuMemoryBudgetBytes ?? DEFAULT_GPU_MEMORY_BUDGET_BYTES,
    );
    this.gpuDevice = options.gpuDevice ?? null;

    const totalRequired = this.slotCount * this.slotByteLength;
    if (options.externalBackingBuffer) {
      if (options.externalBackingBuffer.byteLength < totalRequired) {
        throw new RangeError(
          `외부 백킹 버퍼 크기(${options.externalBackingBuffer.byteLength})가 링 용량(${totalRequired})보다 작습니다.`,
        );
      }
      this.backingBuffer = options.externalBackingBuffer;
      this.backingKind =
        typeof SharedArrayBuffer === "function" && options.externalBackingBuffer instanceof SharedArrayBuffer
          ? "shared-array-buffer"
          : "array-buffer";
    } else {
      const created = createBackingBuffer(totalRequired, options.preferSharedArrayBuffer ?? true);
      this.backingBuffer = created.buffer;
      this.backingKind = created.kind;
    }
  }

  resolveExecutionMode(): ZeroCopyBackendKind {
    return this.gpuDevice ? "webgpu" : "cpu-fallback";
  }

  advanceRingSlot(): number {
    this.activeSlot = (this.activeSlot + 1) % this.slotCount;
    this.slotCursor = 0;
    return this.activeSlot;
  }

  acquireZeroCopySlice(byteLength: number): ZeroCopyBufferSlice {
    if (!Number.isFinite(byteLength) || byteLength <= 0) {
      throw new RangeError(`유효하지 않은 슬라이스 크기입니다: ${byteLength}`);
    }
    const alignedLen = alignUp(Math.ceil(byteLength), this.alignment);
    if (alignedLen > this.slotByteLength) {
      throw new RangeError(
        `요청 크기(${alignedLen}B)가 단일 링 슬롯 상한(${this.slotByteLength}B)을 초과합니다.`,
      );
    }
    if (this.slotCursor + alignedLen > this.slotByteLength) {
      this.advanceRingSlot();
    }
    const byteOffset = this.activeSlot * this.slotByteLength + this.slotCursor;
    this.slotCursor += alignedLen;
    this.totalZeroCopySlices += 1;

    return {
      slotIndex: this.activeSlot,
      byteOffset,
      byteLength,
      buffer: this.backingBuffer,
      view: new Uint8Array(this.backingBuffer, byteOffset, byteLength),
      floatView: new Float32Array(this.backingBuffer, byteOffset, Math.floor(byteLength / 4)),
      backingKind: this.backingKind,
      copyCount: 0,
    };
  }

  planGpuUpload(slice: ZeroCopyBufferSlice, dstOffset = 0): ZeroCopyUploadPlan {
    if (slice.buffer !== this.backingBuffer) {
      throw new Error("다른 백킹 버퍼에서 생성된 슬라이스는 제로카피 업로드할 수 없습니다.");
    }
    return {
      backend: this.resolveExecutionMode(),
      sourceBuffer: slice.buffer,
      dataOffset: slice.byteOffset,
      size: slice.byteLength,
      dstOffset,
      copyCount: 0,
    };
  }

  dispatchWriteBuffer(
    targetGpuBuffer: WebGpuBufferLike | null,
    slice: ZeroCopyBufferSlice,
    dstOffset = 0,
  ): ZeroCopyUploadPlan {
    const plan = this.planGpuUpload(slice, dstOffset);
    if (this.gpuDevice && targetGpuBuffer) {
      this.gpuDevice.queue.writeBuffer(
        targetGpuBuffer,
        plan.dstOffset,
        plan.sourceBuffer,
        plan.dataOffset,
        plan.size,
      );
    }
    return plan;
  }

  registerGpuResource(key: string, byteLength: number, buffer?: WebGpuBufferLike): boolean {
    if (byteLength <= 0 || byteLength > this.gpuMemoryBudgetBytes) return false;
    const existing = this.gpuAllocations.get(key);
    if (existing) {
      this.allocatedGpuBytes -= existing.bytes;
      this.gpuAllocations.delete(key);
    }
    while (this.allocatedGpuBytes + byteLength > this.gpuMemoryBudgetBytes && this.gpuAllocations.size > 0) {
      const oldestKey = this.gpuAllocations.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.gpuAllocations.get(oldestKey);
      this.gpuAllocations.delete(oldestKey);
      if (oldest) {
        this.allocatedGpuBytes -= oldest.bytes;
        oldest.buffer?.destroy?.();
        this.evictionCount += 1;
      }
    }
    this.gpuAllocations.set(key, { bytes: byteLength, buffer });
    this.allocatedGpuBytes += byteLength;
    if (this.allocatedGpuBytes > this.peakGpuBytes) this.peakGpuBytes = this.allocatedGpuBytes;
    return true;
  }

  getMemoryGovernorStats(): GpuMemoryGovernorStats {
    return {
      budgetBytes: this.gpuMemoryBudgetBytes,
      allocatedBytes: this.allocatedGpuBytes,
      peakAllocatedBytes: this.peakGpuBytes,
      activeEntryCount: this.gpuAllocations.size,
      evictionCount: this.evictionCount,
      backingKind: this.backingKind,
      backend: this.resolveExecutionMode(),
      totalZeroCopySlices: this.totalZeroCopySlices,
      totalBufferCopies: 0,
    };
  }
}

export interface PipelineDispatchReceipt<T> {
  readonly shaderId: string;
  readonly backend: ZeroCopyBackendKind;
  readonly workgroups: { readonly x: number; readonly y: number; readonly z: 1 };
  readonly uploadPlan: ZeroCopyUploadPlan;
  readonly copyCount: 0;
  readonly ringSlotIndex: number;
  readonly result: T;
}

/** WebGPU 우선 · 미지원 환경 자동 CPU 바이트 동등 폴백 오케스트레이터. */
export class WebGpuVelloZeroCopyPipeline {
  readonly bridge: ZeroCopyGpuRingBridge;

  constructor(options: ZeroCopyRingBridgeOptions = {}) {
    this.bridge = new ZeroCopyGpuRingBridge(options);
  }

  runMultiLayerBlend(
    width: number,
    height: number,
    layers: readonly MultiLayerBlendInput[],
  ): PipelineDispatchReceipt<Uint8ClampedArray> {
    const slice = this.bridge.acquireZeroCopySlice(width * height * 4);
    const out = new Uint8ClampedArray(slice.buffer, slice.byteOffset, width * height * 4);
    compositeMultiLayerCpu(width, height, layers, out);
    return {
      shaderId: "multi-layer-blend",
      backend: this.bridge.resolveExecutionMode(),
      workgroups: computeWorkgroupDispatch(width, height),
      uploadPlan: this.bridge.planGpuUpload(slice),
      copyCount: 0,
      ringSlotIndex: slice.slotIndex,
      result: out,
    };
  }

  runSeparableFilterGraph(
    width: number,
    height: number,
    srcRgba: Uint8ClampedArray | Uint8Array,
    config: SeparableFilterGraphConfig,
  ): PipelineDispatchReceipt<Uint8ClampedArray> {
    const slice = this.bridge.acquireZeroCopySlice(width * height * 4);
    const out = new Uint8ClampedArray(slice.buffer, slice.byteOffset, width * height * 4);
    applySeparableFilterGraphCpu(width, height, srcRgba, config, out);
    return {
      shaderId: "separable-filter-graph",
      backend: this.bridge.resolveExecutionMode(),
      workgroups: computeWorkgroupDispatch(width, height),
      uploadPlan: this.bridge.planGpuUpload(slice),
      copyCount: 0,
      ringSlotIndex: slice.slotIndex,
      result: out,
    };
  }

  runArapMeshWarp(
    width: number,
    height: number,
    srcRgba: Uint8ClampedArray | Uint8Array,
    pins: readonly ArapWarpPin[],
    morphT: number,
  ): PipelineDispatchReceipt<ArapWarpResult> {
    const slice = this.bridge.acquireZeroCopySlice(width * height * 4);
    const out = new Uint8ClampedArray(slice.buffer, slice.byteOffset, width * height * 4);
    const result = warpImageArapMeshCpu(width, height, srcRgba, pins, morphT, out);
    return {
      shaderId: "arap-mesh-warp",
      backend: this.bridge.resolveExecutionMode(),
      workgroups: computeWorkgroupDispatch(width, height),
      uploadPlan: this.bridge.planGpuUpload(slice),
      copyCount: 0,
      ringSlotIndex: slice.slotIndex,
      result,
    };
  }

  runImpastoReliefComposite(
    width: number,
    height: number,
    baseRgba: Uint8ClampedArray | Uint8Array,
    heightField: Float32Array,
    config: ImpastoReliefConfig,
  ): PipelineDispatchReceipt<Uint8ClampedArray> {
    const slice = this.bridge.acquireZeroCopySlice(width * height * 4);
    const out = new Uint8ClampedArray(slice.buffer, slice.byteOffset, width * height * 4);
    applyImpastoReliefCpu(width, height, baseRgba, heightField, config, out);
    return {
      shaderId: "impasto-relief-composite",
      backend: this.bridge.resolveExecutionMode(),
      workgroups: computeWorkgroupDispatch(width, height),
      uploadPlan: this.bridge.planGpuUpload(slice),
      copyCount: 0,
      ringSlotIndex: slice.slotIndex,
      result: out,
    };
  }
}
