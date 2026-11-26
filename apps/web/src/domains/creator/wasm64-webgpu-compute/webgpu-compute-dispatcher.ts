/**
 * WebGPU 컴퓨트 파이프라인 비동기 디스패처 (`StudioWebGpuComputeDispatcher`).
 * - 실제/모의 `GPUDevice` 겸용 구조적 계약 및 비동기 파이프라인 캐싱
 * - LRU 바인드 그룹 캐싱 + 제로 카피 `GPUBuffer` 풀링
 * - WebGPU 미지원 또는 디바이스 유실(`device.lost`) 시 `wasm-relaxed-simd` / `js-fallback` 안전 전환
 */

import {
  WGSL_COMPUTE_KERNELS,
  computeDispatchWorkgroups,
  validateWgslComputeShader,
  type DispatchWorkgroupGrid,
  type WgslKernelId,
} from "./wgsl-compute-kernels";

export const GPU_BUFFER_USAGE = {
  MAP_READ: 0x0001, MAP_WRITE: 0x0002, COPY_SRC: 0x0004, COPY_DST: 0x0008, UNIFORM: 0x0040, STORAGE: 0x0080,
} as const;
export const DEFAULT_GPU_BUFFER_ALIGNMENT = 256 as const;
export const DEFAULT_MAX_POOLED_PER_BUCKET = 8 as const;
export const DEFAULT_MAX_BIND_GROUP_CACHE = 64 as const;

export type ComputeExecutionBackend = "webgpu-compute" | "wasm-relaxed-simd" | "js-fallback";

export interface ComputeFallbackDescriptor {
  readonly backend: ComputeExecutionBackend;
  readonly reason: string;
  readonly webgpuAvailable: boolean;
  readonly deviceLost: boolean;
  readonly wasmRelaxedSimdSupported: boolean;
}

export interface ComputeGpuDeviceLostInfoLike { readonly reason?: string; readonly message?: string; }
export interface ComputeGpuBufferLike { readonly size: number; readonly usage: number; readonly label?: string; destroy(): void; }
export interface ComputeGpuShaderModuleLike { readonly label?: string; }
export interface ComputeGpuBindGroupLayoutLike { readonly label?: string; }
export interface ComputeGpuPipelineLike { readonly label?: string; getBindGroupLayout(index: number): ComputeGpuBindGroupLayoutLike; }
export interface ComputeGpuBindGroupLike { readonly label?: string; }
export interface ComputeGpuCommandBufferLike { readonly label?: string; }
export interface ComputeGpuPassEncoderLike {
  setPipeline(pipeline: ComputeGpuPipelineLike): void;
  setBindGroup(index: number, bindGroup: ComputeGpuBindGroupLike): void;
  dispatchWorkgroups(workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void;
  end(): void;
}
export interface ComputeGpuCommandEncoderLike {
  beginComputePass(descriptor?: { readonly label?: string }): ComputeGpuPassEncoderLike;
  finish(descriptor?: { readonly label?: string }): ComputeGpuCommandBufferLike;
}
export interface ComputeGpuQueueLike {
  writeBuffer(buffer: ComputeGpuBufferLike, bufferOffset: number, data: ArrayBufferLike | ArrayBufferView, dataOffset?: number, size?: number): void;
  submit(commandBuffers: readonly ComputeGpuCommandBufferLike[]): void;
}
export interface ComputeBindGroupEntryLike {
  readonly binding: number;
  readonly resource: { readonly buffer: ComputeGpuBufferLike; readonly offset?: number; readonly size?: number };
}
export interface ComputePipelineDescriptorLike {
  readonly label?: string;
  readonly layout: "auto";
  readonly compute: { readonly module: ComputeGpuShaderModuleLike; readonly entryPoint: string };
}
export interface ComputeGpuDeviceLike {
  readonly queue: ComputeGpuQueueLike;
  readonly lost?: Promise<ComputeGpuDeviceLostInfoLike>;
  createShaderModule(descriptor: { readonly code: string; readonly label?: string }): ComputeGpuShaderModuleLike;
  createBuffer(descriptor: { readonly size: number; readonly usage: number; readonly label?: string }): ComputeGpuBufferLike;
  createComputePipelineAsync?: (descriptor: ComputePipelineDescriptorLike) => Promise<ComputeGpuPipelineLike>;
  createComputePipeline?: (descriptor: ComputePipelineDescriptorLike) => ComputeGpuPipelineLike;
  createBindGroup(descriptor: {
    readonly label?: string;
    readonly layout: ComputeGpuBindGroupLayoutLike;
    readonly entries: readonly ComputeBindGroupEntryLike[];
  }): ComputeGpuBindGroupLike;
  createCommandEncoder(descriptor?: { readonly label?: string }): ComputeGpuCommandEncoderLike;
}

export interface ComputeStorageBindingInput {
  readonly binding: number; readonly buffer?: ComputeGpuBufferLike; readonly data?: ArrayBufferView;
  readonly byteLength?: number; readonly usage?: number; readonly offset?: number;
  readonly size?: number; readonly label?: string;
}
export interface ComputeDispatchRequest {
  readonly kernelId: WgslKernelId; readonly width: number; readonly height: number;
  readonly uniformData: ArrayBufferView; readonly storageBindings: readonly ComputeStorageBindingInput[]; readonly label?: string;
}
export interface ComputeDispatchResult {
  readonly executedOnGpu: boolean; readonly backend: ComputeExecutionBackend; readonly kernelId: WgslKernelId;
  readonly workgroups: DispatchWorkgroupGrid; readonly fallback: ComputeFallbackDescriptor | null;
  readonly bindGroupCacheHit: boolean; readonly bufferPoolHits: number; readonly bufferPoolMisses: number;
  readonly resolvedBuffers: readonly ComputeGpuBufferLike[];
}
export interface StudioWebGpuComputeDispatcherOptions {
  readonly device?: ComputeGpuDeviceLike | null; readonly wasmRelaxedSimdSupported?: boolean;
  readonly bufferAlignmentBytes?: number; readonly maxPooledBuffersPerBucket?: number; readonly maxBindGroupCacheEntries?: number;
}
export interface ComputeDispatcherStats {
  readonly backend: ComputeExecutionBackend; readonly dispatchCount: number; readonly fallbackCount: number;
  readonly pipelineCount: number; readonly bindGroupCacheSize: number; readonly bindGroupCacheHits: number;
  readonly bindGroupCacheMisses: number; readonly bufferPoolHits: number; readonly bufferPoolMisses: number;
  readonly pooledBufferCount: number; readonly pooledBytes: number;
}

// 최소 유효 Wasm Relaxed-SIMD 모듈 (`i8x16.relaxed_swizzle` = 0xfd 0x80 0x02)
const WASM_RELAXED_SIMD_PROBE_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00, 0x0a, 0x2a, 0x01, 0x28, 0x00,
  0xfd, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0xfd, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0xfd, 0x80, 0x02, 0x0b,
]);

export function detectWasmRelaxedSimdSupport(): boolean {
  if (typeof WebAssembly === "undefined" || typeof WebAssembly.validate !== "function") return false;
  try { return WebAssembly.validate(WASM_RELAXED_SIMD_PROBE_BYTES); } catch { return false; }
}

export function alignGpuBufferSize(byteLength: number, alignment: number = DEFAULT_GPU_BUFFER_ALIGNMENT): number {
  const safeAlign = Math.max(4, Math.floor(alignment));
  const aligned = Math.ceil(Math.max(safeAlign, Math.ceil(byteLength)) / safeAlign) * safeAlign;
  let pow2 = safeAlign;
  while (pow2 < aligned && pow2 < 0x4000_0000) pow2 *= 2;
  return pow2 >= aligned ? pow2 : aligned;
}

export class StudioWebGpuComputeDispatcher {
  private device: ComputeGpuDeviceLike | null;
  private readonly wasmRelaxedSimdSupported: boolean;
  private readonly bufferAlignmentBytes: number;
  private readonly maxPooledBuffersPerBucket: number;
  private readonly maxBindGroupCacheEntries: number;
  private deviceLost = false;
  private deviceLostReason = "";
  private disposed = false;

  private readonly shaderModules = new Map<WgslKernelId, ComputeGpuShaderModuleLike>();
  private readonly pipelines = new Map<WgslKernelId, ComputeGpuPipelineLike>();
  private readonly pendingPipelines = new Map<WgslKernelId, Promise<ComputeGpuPipelineLike>>();
  private readonly bindGroupCache = new Map<string, ComputeGpuBindGroupLike>();
  private readonly bufferPools = new Map<string, ComputeGpuBufferLike[]>();
  private readonly bufferIds = new WeakMap<ComputeGpuBufferLike, number>();
  private nextBufferId = 1;

  private dispatchCount = 0;
  private fallbackCount = 0;
  private bindGroupCacheHits = 0;
  private bindGroupCacheMisses = 0;
  private bufferPoolHits = 0;
  private bufferPoolMisses = 0;

  constructor(options: StudioWebGpuComputeDispatcherOptions = {}) {
    this.device = options.device ?? null;
    this.wasmRelaxedSimdSupported = options.wasmRelaxedSimdSupported ?? detectWasmRelaxedSimdSupport();
    this.bufferAlignmentBytes = options.bufferAlignmentBytes ?? DEFAULT_GPU_BUFFER_ALIGNMENT;
    this.maxPooledBuffersPerBucket = options.maxPooledBuffersPerBucket ?? DEFAULT_MAX_POOLED_PER_BUCKET;
    this.maxBindGroupCacheEntries = options.maxBindGroupCacheEntries ?? DEFAULT_MAX_BIND_GROUP_CACHE;
    if (this.device?.lost) {
      void this.device.lost.then((info) => this.handleDeviceLost(info?.message || info?.reason || "WebGPU device lost"));
    }
  }

  public getBackendDescriptor(): ComputeFallbackDescriptor {
    if (this.device && !this.deviceLost && !this.disposed) {
      return {
        backend: "webgpu-compute", reason: "Active WebGPU compute device ready",
        webgpuAvailable: true, deviceLost: false, wasmRelaxedSimdSupported: this.wasmRelaxedSimdSupported,
      };
    }
    const backend: ComputeExecutionBackend = this.wasmRelaxedSimdSupported ? "wasm-relaxed-simd" : "js-fallback";
    const reason = this.disposed
      ? "Dispatcher disposed"
      : this.deviceLost
        ? `WebGPU device lost: ${this.deviceLostReason || "unknown"}`
        : "WebGPU device unavailable";
    return {
      backend, reason, webgpuAvailable: this.device !== null,
      deviceLost: this.deviceLost, wasmRelaxedSimdSupported: this.wasmRelaxedSimdSupported,
    };
  }

  public markDeviceLost(reason = "manual-device-loss"): void {
    this.handleDeviceLost(reason);
  }

  public acquireBuffer(byteLength: number, usage: number, label?: string): ComputeGpuBufferLike {
    const activeDevice = this.requireActiveDevice();
    const bucketSize = alignGpuBufferSize(byteLength, this.bufferAlignmentBytes);
    const reused = this.bufferPools.get(`${bucketSize}:${usage}`)?.pop();
    if (reused) {
      this.bufferPoolHits += 1;
      return reused;
    }
    this.bufferPoolMisses += 1;
    const created = activeDevice.createBuffer({ size: bucketSize, usage, label });
    this.ensureBufferId(created);
    return created;
  }

  public releaseBuffer(buffer: ComputeGpuBufferLike): void {
    if (this.disposed || this.deviceLost || !this.device) {
      buffer.destroy();
      return;
    }
    const key = `${buffer.size}:${buffer.usage}`;
    let bucket = this.bufferPools.get(key);
    if (!bucket) { bucket = []; this.bufferPools.set(key, bucket); }
    if (bucket.length >= this.maxPooledBuffersPerBucket) { buffer.destroy(); return; }
    bucket.push(buffer);
  }

  public writeBufferZeroCopy(buffer: ComputeGpuBufferLike, view: ArrayBufferView, bufferOffset = 0): void {
    this.requireActiveDevice().queue.writeBuffer(buffer, bufferOffset, view.buffer, view.byteOffset, view.byteLength);
  }

  public async getOrCreatePipeline(kernelId: WgslKernelId): Promise<ComputeGpuPipelineLike> {
    const activeDevice = this.requireActiveDevice();
    const cached = this.pipelines.get(kernelId);
    if (cached) return cached;
    const pending = this.pendingPipelines.get(kernelId);
    if (pending) return pending;
    const kernel = WGSL_COMPUTE_KERNELS[kernelId];
    const validation = validateWgslComputeShader(kernel.source, kernel.entryPoint);
    if (!validation.valid) throw new Error(`Invalid WGSL kernel '${kernelId}': ${validation.errors.join("; ")}`);
    let module = this.shaderModules.get(kernelId);
    if (!module) {
      module = activeDevice.createShaderModule({ code: kernel.source, label: `wgsl:${kernelId}` });
      this.shaderModules.set(kernelId, module);
    }
    const desc: ComputePipelineDescriptorLike = {
      label: `pipeline:${kernelId}`, layout: "auto", compute: { module, entryPoint: kernel.entryPoint },
    };
    const creation = (async (): Promise<ComputeGpuPipelineLike> => {
      let pipeline: ComputeGpuPipelineLike;
      if (typeof activeDevice.createComputePipelineAsync === "function") {
        pipeline = await activeDevice.createComputePipelineAsync(desc);
      } else if (typeof activeDevice.createComputePipeline === "function") {
        pipeline = activeDevice.createComputePipeline(desc);
      } else {
        throw new Error("GPUDevice missing createComputePipelineAsync / createComputePipeline");
      }
      // 유실·종료 중 완료된 컴파일은 해제한 캐시를 다시 채우지 않는다.
      this.requireActiveDevice();
      this.pipelines.set(kernelId, pipeline);
      return pipeline;
    })();
    this.pendingPipelines.set(kernelId, creation);
    try {
      return await creation;
    } finally {
      if (this.pendingPipelines.get(kernelId) === creation) this.pendingPipelines.delete(kernelId);
    }
  }

  public async dispatchKernel(request: ComputeDispatchRequest): Promise<ComputeDispatchResult> {
    const workgroups = computeDispatchWorkgroups(request.width, request.height);
    const descriptor = this.getBackendDescriptor();
    if (descriptor.backend !== "webgpu-compute" || !this.device) {
      this.fallbackCount += 1;
      return this.fallbackResult(request.kernelId, workgroups, descriptor);
    }
    const hitsBefore = this.bufferPoolHits;
    const missesBefore = this.bufferPoolMisses;
    let uniformBuffer: ComputeGpuBufferLike | null = null;
    try {
      const pipeline = await this.getOrCreatePipeline(request.kernelId);
      uniformBuffer = this.acquireBuffer(
        request.uniformData.byteLength, GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST, `${request.kernelId}:uniform`,
      );
      this.writeBufferZeroCopy(uniformBuffer, request.uniformData, 0);
      const entries: ComputeBindGroupEntryLike[] = [{ binding: 0, resource: { buffer: uniformBuffer } }];
      const resolvedBuffers: ComputeGpuBufferLike[] = [];
      for (const spec of request.storageBindings) {
        const gpuBuf = spec.buffer ?? this.acquireBuffer(
          spec.byteLength ?? spec.data?.byteLength ?? this.bufferAlignmentBytes,
          spec.usage ?? (GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST | GPU_BUFFER_USAGE.COPY_SRC),
          spec.label ?? `${request.kernelId}:b${spec.binding}`,
        );
        this.ensureBufferId(gpuBuf);
        if (spec.data) this.writeBufferZeroCopy(gpuBuf, spec.data, spec.offset ?? 0);
        resolvedBuffers.push(gpuBuf);
        entries.push({
          binding: spec.binding,
          resource: {
            buffer: gpuBuf,
            ...(spec.offset !== undefined ? { offset: spec.offset } : {}),
            ...(spec.size !== undefined ? { size: spec.size } : {}),
          },
        });
      }
      const { bindGroup, cacheHit } = this.getOrCreateBindGroup(request.kernelId, pipeline, entries);
      const activeDevice = this.requireActiveDevice();
      const encoder = activeDevice.createCommandEncoder({ label: request.label ?? `enc:${request.kernelId}` });
      const pass = encoder.beginComputePass({ label: `pass:${request.kernelId}` });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      if (workgroups.totalWorkgroups > 0) pass.dispatchWorkgroups(workgroups.x, workgroups.y, workgroups.z);
      pass.end();
      activeDevice.queue.submit([encoder.finish()]);
      this.releaseBuffer(uniformBuffer);
      uniformBuffer = null;
      this.dispatchCount += 1;
      return {
        executedOnGpu: true, backend: "webgpu-compute", kernelId: request.kernelId, workgroups, fallback: null,
        bindGroupCacheHit: cacheHit, bufferPoolHits: this.bufferPoolHits - hitsBefore,
        bufferPoolMisses: this.bufferPoolMisses - missesBefore, resolvedBuffers,
      };
    } catch (error) {
      if (uniformBuffer) this.releaseBuffer(uniformBuffer);
      this.handleDeviceLost(error instanceof Error ? error.message : String(error));
      this.fallbackCount += 1;
      return this.fallbackResult(request.kernelId, workgroups, this.getBackendDescriptor());
    }
  }

  public getStats(): ComputeDispatcherStats {
    let pooledBufferCount = 0;
    let pooledBytes = 0;
    for (const bucket of this.bufferPools.values()) {
      pooledBufferCount += bucket.length;
      for (const buf of bucket) pooledBytes += buf.size;
    }
    return {
      backend: this.getBackendDescriptor().backend, dispatchCount: this.dispatchCount,
      fallbackCount: this.fallbackCount, pipelineCount: this.pipelines.size,
      bindGroupCacheSize: this.bindGroupCache.size, bindGroupCacheHits: this.bindGroupCacheHits,
      bindGroupCacheMisses: this.bindGroupCacheMisses, bufferPoolHits: this.bufferPoolHits,
      bufferPoolMisses: this.bufferPoolMisses, pooledBufferCount, pooledBytes,
    };
  }

  public dispose(): void {
    this.disposed = true;
    this.clearGpuResources();
    this.device = null;
  }

  private getOrCreateBindGroup(
    kernelId: WgslKernelId, pipeline: ComputeGpuPipelineLike, entries: readonly ComputeBindGroupEntryLike[],
  ): { readonly bindGroup: ComputeGpuBindGroupLike; readonly cacheHit: boolean } {
    const key = `${kernelId}|${entries.map((e) => `${e.binding}@${this.ensureBufferId(e.resource.buffer)}:${e.resource.offset ?? 0}:${e.resource.size ?? -1}`).join(",")}`;
    const existing = this.bindGroupCache.get(key);
    if (existing) {
      this.bindGroupCache.delete(key);
      this.bindGroupCache.set(key, existing);
      this.bindGroupCacheHits += 1;
      return { bindGroup: existing, cacheHit: true };
    }
    const bindGroup = this.requireActiveDevice().createBindGroup({
      label: `bg:${kernelId}`, layout: pipeline.getBindGroupLayout(0), entries,
    });
    if (this.bindGroupCache.size >= this.maxBindGroupCacheEntries) {
      const oldestKey = this.bindGroupCache.keys().next().value;
      if (oldestKey !== undefined) this.bindGroupCache.delete(oldestKey);
    }
    this.bindGroupCache.set(key, bindGroup);
    this.bindGroupCacheMisses += 1;
    return { bindGroup, cacheHit: false };
  }

  private ensureBufferId(buffer: ComputeGpuBufferLike): number {
    let id = this.bufferIds.get(buffer);
    if (id === undefined) { id = this.nextBufferId; this.nextBufferId += 1; this.bufferIds.set(buffer, id); }
    return id;
  }

  private requireActiveDevice(): ComputeGpuDeviceLike {
    if (!this.device || this.deviceLost || this.disposed) throw new Error(this.getBackendDescriptor().reason);
    return this.device;
  }

  private handleDeviceLost(reason: string): void {
    this.deviceLost = true;
    this.deviceLostReason = reason;
    this.clearGpuResources();
  }

  private clearGpuResources(): void {
    for (const bucket of this.bufferPools.values()) for (const buf of bucket) buf.destroy();
    this.bufferPools.clear();
    this.bindGroupCache.clear();
    this.pipelines.clear();
    this.pendingPipelines.clear();
    this.shaderModules.clear();
  }

  private fallbackResult(kernelId: WgslKernelId, workgroups: DispatchWorkgroupGrid, fallback: ComputeFallbackDescriptor): ComputeDispatchResult {
    return {
      executedOnGpu: false, backend: fallback.backend, kernelId, workgroups, fallback,
      bindGroupCacheHit: false, bufferPoolHits: 0, bufferPoolMisses: 0, resolvedBuffers: [],
    };
  }
}
