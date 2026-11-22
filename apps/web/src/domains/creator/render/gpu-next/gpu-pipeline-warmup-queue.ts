/**
 * 유휴 시간 비동기 WebGPU Compute 파이프라인 프리웜업 큐 (`createComputePipelineAsync`).
 *
 * 브라우저 유휴 시간(`requestIdleCallback`, 미지원 환경은 `setTimeout` 폴백)에
 * 셰이더 모듈을 중복 없이 캐시하고 우선순위 순서로 파이프라인을 1개씩 순차 컴파일해
 * 첫 붓터치/스크린톤 실행 시 발생하는 셰이더 컴파일 스터터링을 제거한다.
 */

import {
  GPU_NEXT_HDR_LINEAR_BLEND_DITHER_WGSL,
  GPU_NEXT_JFA_OUTLINE_WGSL,
  GPU_NEXT_SCREENTONE_OUTLINE_ONEPASS_WGSL,
} from "./gpu-next-wgsl-shaders";

export interface GpuNextShaderModuleLike {
  readonly label?: string;
}

export interface GpuNextComputePipelineLike {
  readonly label?: string;
  getBindGroupLayout?(index: number): GPUBindGroupLayout;
}

export interface GpuNextPipelineDeviceLike {
  createShaderModule(descriptor: {
    readonly code: string;
    readonly label?: string;
  }): GpuNextShaderModuleLike;
  createComputePipelineAsync(descriptor: {
    readonly layout: "auto" | GPUPipelineLayout;
    readonly compute: {
      readonly module: GpuNextShaderModuleLike;
      readonly entryPoint: string;
      readonly constants?: Record<string, number>;
    };
    readonly label?: string;
  }): Promise<GpuNextComputePipelineLike>;
}

export interface GpuWarmupIdleDeadline {
  readonly didTimeout: boolean;
  timeRemaining(): number;
}

export interface GpuWarmupIdleScheduler {
  requestIdle(
    callback: (deadline: GpuWarmupIdleDeadline) => void,
    options?: { readonly timeout?: number },
  ): number;
  cancelIdle(handle: number): void;
}

export interface GpuPipelineWarmupTaskSpec {
  readonly id: string;
  readonly label: string;
  /** 낮을수록 우선 컴파일(0 = 핵심 페인팅/HDR, 1 = 스크린톤/외곽선, 2 = 보조). */
  readonly priority: number;
  readonly wgslCode: string;
  readonly entryPoint: string;
  readonly constants?: Record<string, number>;
}

export type GpuWarmupTaskStatus =
  | "pending"
  | "compiling"
  | "ready"
  | "cpu-fallback"
  | "failed"
  | "cancelled";

export interface GpuPipelineWarmupMetrics {
  readonly running: boolean;
  readonly disposed: boolean;
  readonly backend: "webgpu" | "cpu-fallback";
  readonly totalTasks: number;
  readonly readyCount: number;
  readonly compilingCount: number;
  readonly pendingCount: number;
  readonly cpuFallbackCount: number;
  readonly failedCount: number;
  readonly allReady: boolean;
  readonly totalCompileMs: number;
  readonly maxSingleCompileMs: number;
}

export interface GpuPipelineWarmupQueueOptions {
  readonly scheduler?: GpuWarmupIdleScheduler;
  /** 단일 유휴 슬라이스 실행을 허용하는 최소 잔여 시간(ms, 기본 4ms). */
  readonly minIdleBudgetMs?: number;
  /** `requestIdleCallback` 최대 대기 타임아웃(ms, 기본 1200ms). */
  readonly idleTimeoutMs?: number;
  readonly now?: () => number;
}

interface InternalWarmupRecord {
  readonly spec: GpuPipelineWarmupTaskSpec;
  status: GpuWarmupTaskStatus;
  pipeline: GpuNextComputePipelineLike | null;
  inFlight: Promise<GpuNextComputePipelineLike | null> | null;
  compileMs: number;
  errorMessage: string | null;
}

function defaultNowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function createDefaultIdleScheduler(): GpuWarmupIdleScheduler {
  const globalWithIdle = globalThis as {
    requestIdleCallback?: (
      cb: (deadline: GpuWarmupIdleDeadline) => void,
      options?: { timeout?: number },
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (
    typeof globalWithIdle.requestIdleCallback === "function" &&
    typeof globalWithIdle.cancelIdleCallback === "function"
  ) {
    const req = globalWithIdle.requestIdleCallback.bind(globalWithIdle);
    const cancel = globalWithIdle.cancelIdleCallback.bind(globalWithIdle);
    return {
      requestIdle: (cb, options) => req(cb, options),
      cancelIdle: (handle) => cancel(handle),
    };
  }

  return {
    requestIdle: (cb) => {
      const handle = setTimeout(() => {
        const sliceStart = defaultNowMs();
        cb({
          didTimeout: false,
          timeRemaining: () => Math.max(0, 8 - (defaultNowMs() - sliceStart)),
        });
      }, 0);
      return Number(handle);
    },
    cancelIdle: (handle) => {
      clearTimeout(handle);
    },
  };
}

/** 차세대 WebGPU 코어 기본 프리웜업 파이프라인 목록. */
export const DEFAULT_GPU_NEXT_WARMUP_TASKS: readonly GpuPipelineWarmupTaskSpec[] = Object.freeze([
  Object.freeze({
    id: "hdr-linear-blend",
    label: "HDR 16-bit 선형 광학 블렌드",
    priority: 0,
    wgslCode: GPU_NEXT_HDR_LINEAR_BLEND_DITHER_WGSL,
    entryPoint: "hdr_linear_blend_main",
  }),
  Object.freeze({
    id: "hdr-tonemap-dither-srgb8",
    label: "HDR Bayer8x8/TPDF 무밴딩 sRGB8 출력",
    priority: 0,
    wgslCode: GPU_NEXT_HDR_LINEAR_BLEND_DITHER_WGSL,
    entryPoint: "hdr_tonemap_dither_srgb8_main",
  }),
  Object.freeze({
    id: "screentone-outline-onepass",
    label: "비파괴 스크린톤·Sobel 1패스 외곽선",
    priority: 1,
    wgslCode: GPU_NEXT_SCREENTONE_OUTLINE_ONEPASS_WGSL,
    entryPoint: "screentone_and_outline_main",
  }),
  Object.freeze({
    id: "jfa-seed-init",
    label: "JFA 외곽선 시드 초기화",
    priority: 2,
    wgslCode: GPU_NEXT_JFA_OUTLINE_WGSL,
    entryPoint: "jfa_seed_init_main",
  }),
  Object.freeze({
    id: "jfa-flood-step",
    label: "JFA 외곽선 점프 플러딩 스텝",
    priority: 2,
    wgslCode: GPU_NEXT_JFA_OUTLINE_WGSL,
    entryPoint: "jfa_flood_step_main",
  }),
  Object.freeze({
    id: "jfa-outline-resolve",
    label: "JFA 외곽선 거리장 합성",
    priority: 2,
    wgslCode: GPU_NEXT_JFA_OUTLINE_WGSL,
    entryPoint: "jfa_outline_resolve_main",
  }),
]);

export class GpuPipelineWarmupQueue {
  private readonly device: GpuNextPipelineDeviceLike | null;
  private readonly scheduler: GpuWarmupIdleScheduler;
  private readonly minIdleBudgetMs: number;
  private readonly idleTimeoutMs: number;
  private readonly now: () => number;

  private readonly records = new Map<string, InternalWarmupRecord>();
  private readonly shaderModules = new Map<string, GpuNextShaderModuleLike>();
  private readonly pendingOrder: string[] = [];

  private idleHandle: number | null = null;
  private running = false;
  private disposed = false;

  constructor(
    device: GpuNextPipelineDeviceLike | null,
    tasks: readonly GpuPipelineWarmupTaskSpec[] = DEFAULT_GPU_NEXT_WARMUP_TASKS,
    options: GpuPipelineWarmupQueueOptions = {},
  ) {
    this.device = device;
    this.scheduler = options.scheduler ?? createDefaultIdleScheduler();
    this.minIdleBudgetMs = Math.max(0, options.minIdleBudgetMs ?? 4);
    this.idleTimeoutMs = Math.max(50, options.idleTimeoutMs ?? 1200);
    this.now = options.now ?? defaultNowMs;

    const sorted = [...tasks].sort((a, b) => a.priority - b.priority);
    for (const spec of sorted) {
      this.enqueue(spec);
    }
  }

  enqueue(spec: GpuPipelineWarmupTaskSpec): void {
    if (this.disposed || this.records.has(spec.id)) return;
    const record: InternalWarmupRecord = {
      spec,
      status: this.device === null ? "cpu-fallback" : "pending",
      pipeline: null,
      inFlight: null,
      compileMs: 0,
      errorMessage: null,
    };
    this.records.set(spec.id, record);
    if (this.device !== null) {
      this.pendingOrder.push(spec.id);
      this.pendingOrder.sort((left, right) => {
        const lp = this.records.get(left)?.spec.priority ?? 99;
        const rp = this.records.get(right)?.spec.priority ?? 99;
        return lp - rp;
      });
    }
  }

  /** 유휴 시간 순차 프리웜업을 시작한다(이미 실행 중이면 중복 예약하지 않는다). */
  start(): void {
    if (this.disposed || this.device === null || this.running) return;
    if (this.pendingOrder.length === 0) return;
    this.running = true;
    this.scheduleNextIdleSlice();
  }

  /**
   * 특정 파이프라인이 즉시 필요할 때 호출한다.
   * 이미 준비됐으면 즉시 반환하고, 유휴 컴파일 중이면 같은 Promise를 공유하며,
   * 아직 대기 중이면 대기열을 앞질러 즉시 `createComputePipelineAsync`를 시작한다.
   */
  async getOrCreatePipeline(id: string): Promise<GpuNextComputePipelineLike | null> {
    if (this.disposed || this.device === null) return null;
    const record = this.records.get(id);
    if (!record) return null;
    if (record.pipeline) return record.pipeline;
    if (record.inFlight) return record.inFlight;
    return this.compileRecord(record);
  }

  /** 준비 완료된 파이프라인을 동기 조회한다(없으면 null). */
  getReadyPipeline(id: string): GpuNextComputePipelineLike | null {
    return this.records.get(id)?.pipeline ?? null;
  }

  getTaskStatus(id: string): GpuWarmupTaskStatus | null {
    return this.records.get(id)?.status ?? null;
  }

  /** 대기 중인 유휴 프리웜업을 중단한다. */
  cancel(): void {
    this.running = false;
    if (this.idleHandle !== null) {
      this.scheduler.cancelIdle(this.idleHandle);
      this.idleHandle = null;
    }
    for (const id of this.pendingOrder.splice(0)) {
      const record = this.records.get(id);
      if (record && record.status === "pending") {
        record.status = "cancelled";
      }
    }
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
    this.shaderModules.clear();
  }

  getMetrics(): GpuPipelineWarmupMetrics {
    let readyCount = 0;
    let compilingCount = 0;
    let pendingCount = 0;
    let cpuFallbackCount = 0;
    let failedCount = 0;
    let totalCompileMs = 0;
    let maxSingleCompileMs = 0;

    for (const record of this.records.values()) {
      if (record.status === "ready") readyCount += 1;
      else if (record.status === "compiling") compilingCount += 1;
      else if (record.status === "pending") pendingCount += 1;
      else if (record.status === "cpu-fallback") cpuFallbackCount += 1;
      else if (record.status === "failed") failedCount += 1;

      totalCompileMs += record.compileMs;
      if (record.compileMs > maxSingleCompileMs) {
        maxSingleCompileMs = record.compileMs;
      }
    }

    const totalTasks = this.records.size;
    const allReady =
      totalTasks > 0 &&
      (this.device === null ? cpuFallbackCount === totalTasks : readyCount === totalTasks);

    return Object.freeze({
      running: this.running,
      disposed: this.disposed,
      backend: this.device === null ? "cpu-fallback" : "webgpu",
      totalTasks,
      readyCount,
      compilingCount,
      pendingCount,
      cpuFallbackCount,
      failedCount,
      allReady,
      totalCompileMs,
      maxSingleCompileMs,
    });
  }

  private scheduleNextIdleSlice(): void {
    if (this.disposed || !this.running) return;
    if (this.pendingOrder.length === 0) {
      this.running = false;
      return;
    }
    if (this.idleHandle !== null) return;

    this.idleHandle = this.scheduler.requestIdle(
      (deadline) => {
        this.idleHandle = null;
        void this.processIdleSlice(deadline);
      },
      { timeout: this.idleTimeoutMs },
    );
  }

  private async processIdleSlice(deadline: GpuWarmupIdleDeadline): Promise<void> {
    if (this.disposed || !this.running) return;

    if (!deadline.didTimeout && deadline.timeRemaining() < this.minIdleBudgetMs) {
      this.scheduleNextIdleSlice();
      return;
    }

    const nextRecord = this.shiftNextPendingRecord();
    if (!nextRecord) {
      this.running = false;
      return;
    }

    await this.compileRecord(nextRecord);

    if (!this.disposed && this.running && this.pendingOrder.length > 0) {
      this.scheduleNextIdleSlice();
    } else {
      this.running = false;
    }
  }

  private shiftNextPendingRecord(): InternalWarmupRecord | null {
    while (this.pendingOrder.length > 0) {
      const id = this.pendingOrder.shift();
      if (!id) continue;
      const record = this.records.get(id);
      if (record && record.status === "pending" && !record.inFlight && !record.pipeline) {
        return record;
      }
    }
    return null;
  }

  private getOrCreateShaderModule(
    device: GpuNextPipelineDeviceLike,
    wgslCode: string,
    label: string,
  ): GpuNextShaderModuleLike {
    const cached = this.shaderModules.get(wgslCode);
    if (cached) return cached;
    const created = device.createShaderModule({
      code: wgslCode,
      label: `gpu-next-shader:${label}`,
    });
    this.shaderModules.set(wgslCode, created);
    return created;
  }

  private compileRecord(record: InternalWarmupRecord): Promise<GpuNextComputePipelineLike | null> {
    const device = this.device;
    if (!device || this.disposed) return Promise.resolve(null);
    if (record.pipeline) return Promise.resolve(record.pipeline);
    if (record.inFlight) return record.inFlight;

    record.status = "compiling";
    const startedAt = this.now();

    const compilePromise = (async () => {
      try {
        const shaderModule = this.getOrCreateShaderModule(device, record.spec.wgslCode, record.spec.id);
        const pipeline = await device.createComputePipelineAsync({
          layout: "auto",
          label: `gpu-next-pipeline:${record.spec.id}`,
          compute: {
            module: shaderModule,
            entryPoint: record.spec.entryPoint,
            ...(record.spec.constants ? { constants: record.spec.constants } : {}),
          },
        });
        record.compileMs = Math.max(0, this.now() - startedAt);
        if (this.disposed) {
          record.status = "cancelled";
          return null;
        }
        record.pipeline = pipeline;
        record.status = "ready";
        return pipeline;
      } catch (error) {
        record.compileMs = Math.max(0, this.now() - startedAt);
        record.status = "failed";
        record.errorMessage = error instanceof Error ? error.message : String(error);
        return null;
      } finally {
        record.inFlight = null;
      }
    })();

    record.inFlight = compilePromise;
    return compilePromise;
  }
}
