/**
 * `requestIdleCallback` 시간 슬라이스(≤ 6ms/slice) 예산 기반 3D 배경·VRM PBR/MToon
 * 셰이더 배리언트 유휴 사전 컴파일러.
 *
 * - First-Frame Jank를 방지하기 위해 모든 유휴 슬라이스 예산을 ≤ 6ms로 하드 클램프한다.
 * - 매크로(defines) 키를 정규화한 결정적 캐시 키로 중복 컴파일을 100% 차단한다.
 * - `cancel()`·`dispose()`·배치별 `AbortSignal`을 모두 지원해 화면 전환 중에도 취소 안전하다.
 */

export const SHADER_IDLE_MAX_SLICE_BUDGET_MS = 6 as const;
export const SHADER_IDLE_DEFAULT_SLICE_BUDGET_MS = 5.5 as const;
export const SHADER_IDLE_DEFAULT_SAFETY_MARGIN_MS = 0.5 as const;
export const SHADER_IDLE_DEFAULT_MAX_CACHE_ENTRIES = 512 as const;

export type ShaderVariantDomain =
  | "bg3d-pbr"
  | "bg3d-npr-line"
  | "vrm-mtoon"
  | "vrm-pbr"
  | "shadow-depth"
  | "post-outline";

export type ShaderPipelineKind = "webgl2" | "webgpu";
export type ShaderPrewarmPriority = "critical" | "high" | "normal" | "low";
export type ShaderDefineValue = string | number | boolean;

export interface ShaderVariantSpec {
  readonly id: string;
  readonly domain: ShaderVariantDomain;
  readonly pipelineKind: ShaderPipelineKind;
  readonly priority: ShaderPrewarmPriority;
  readonly defines: Readonly<Record<string, ShaderDefineValue>>;
  readonly estimatedCompileMs?: number;
}

export interface CompiledShaderCacheEntry {
  readonly cacheKey: string;
  readonly spec: ShaderVariantSpec;
  readonly compiledAtMs: number;
  readonly compileDurationMs: number;
}

export interface ShaderIdleDeadlineLike {
  readonly didTimeout: boolean;
  timeRemaining(): number;
}

export interface ShaderIdleSchedulerAdapter {
  requestIdle(
    callback: (deadline: ShaderIdleDeadlineLike) => void,
    options?: { readonly timeout?: number },
  ): number;
  cancelIdle(handle: number): void;
}

export interface ShaderSliceTelemetry {
  readonly sliceIndex: number;
  readonly budgetMs: number;
  readonly elapsedMs: number;
  readonly compiledKeys: readonly string[];
  readonly withinSliceBudget: boolean;
}

export interface ShaderPrewarmSnapshot {
  readonly state: "idle" | "running" | "paused" | "cancelled" | "disposed";
  readonly sliceBudgetMs: number;
  readonly pendingCount: number;
  readonly compiledCount: number;
  readonly cacheHitCount: number;
  readonly deduplicatedQueueCount: number;
  readonly cancelledCount: number;
  readonly failedCount: number;
  readonly totalSlicesExecuted: number;
  readonly maxObservedSliceMs: number;
  readonly allSlicesWithinMaxBudget: boolean;
}

export interface ShaderPrewarmDrainResult {
  readonly status: "completed" | "cancelled" | "disposed";
  readonly snapshot: ShaderPrewarmSnapshot;
  readonly slices: readonly ShaderSliceTelemetry[];
}

export type ShaderVariantCompiler = (
  spec: ShaderVariantSpec,
  cacheKey: string,
  signal: AbortSignal,
) => Promise<void> | void;

export interface ShaderIdlePrewarmerOptions {
  readonly compileVariant: ShaderVariantCompiler;
  readonly sliceBudgetMs?: number;
  readonly safetyMarginMs?: number;
  readonly idleTimeoutMs?: number;
  readonly maxCacheEntries?: number;
  readonly scheduler?: ShaderIdleSchedulerAdapter;
  readonly nowMs?: () => number;
  readonly onVariantCompiled?: (entry: CompiledShaderCacheEntry) => void;
  readonly onVariantError?: (spec: ShaderVariantSpec, error: unknown) => void;
}

export interface EnqueueShaderVariantsOptions {
  readonly signal?: AbortSignal;
}

const PRIORITY_WEIGHT: Readonly<Record<ShaderPrewarmPriority, number>> = Object.freeze({
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
});

const DEFAULT_ESTIMATED_COMPILE_MS: Readonly<Record<ShaderVariantDomain, number>> = Object.freeze({
  "bg3d-pbr": 2.2,
  "bg3d-npr-line": 1.8,
  "vrm-mtoon": 2.4,
  "vrm-pbr": 2.3,
  "shadow-depth": 1.2,
  "post-outline": 1.4,
});

interface PendingShaderJob {
  readonly cacheKey: string;
  spec: ShaderVariantSpec;
  priorityWeight: number;
  estimatedCompileMs: number;
  readonly enqueueOrder: number;
  readonly batchSignals: Set<AbortSignal>;
}

/**
 * 셰이더 배리언트의 매크로(defines) 키 순서를 정규화해 결정적 중복 제거 캐시 키를 생성한다.
 */
export function computeShaderVariantCacheKey(spec: ShaderVariantSpec): string {
  const sortedDefines = Object.keys(spec.defines)
    .sort()
    .map((key) => `${key}=${String(spec.defines[key])}`)
    .join("&");
  return `${spec.pipelineKind}::${spec.domain}::${spec.id}::${sortedDefines}`;
}

/**
 * 3D 배경(PBR·NPR 라인·그림자)과 VRM(MToon·PBR 피부)의 표준 유휴 사전 컴파일 목록을 생성한다.
 */
export function createDefaultStudioShaderVariants(
  pipelineKind: ShaderPipelineKind = "webgl2",
): readonly ShaderVariantSpec[] {
  return [
    {
      id: "vrm-mtoon-opaque",
      domain: "vrm-mtoon",
      pipelineKind,
      priority: "critical",
      defines: { USE_MTOON: true, USE_SKINNING: true, MAX_BONES: 64, ALPHA_MODE: "OPAQUE" },
      estimatedCompileMs: 2.2,
    },
    {
      id: "vrm-mtoon-outline",
      domain: "vrm-mtoon",
      pipelineKind,
      priority: "critical",
      defines: { USE_MTOON: true, USE_OUTLINE: true, USE_SKINNING: true, MAX_BONES: 64 },
      estimatedCompileMs: 2.0,
    },
    {
      id: "bg3d-pbr-standard",
      domain: "bg3d-pbr",
      pipelineKind,
      priority: "critical",
      defines: { USE_MAP: true, USE_NORMALMAP: true, USE_SHADOWMAP: true },
      estimatedCompileMs: 2.1,
    },
    {
      id: "bg3d-npr-contour-hatch",
      domain: "bg3d-npr-line",
      pipelineKind,
      priority: "high",
      defines: { USE_SOBEL_NORMAL: true, USE_DEPTH_EDGE: true, USE_HATCHING: true },
      estimatedCompileMs: 1.8,
    },
    {
      id: "vrm-pbr-skin-rim",
      domain: "vrm-pbr",
      pipelineKind,
      priority: "high",
      defines: { USE_SKINNING: true, USE_RIM_LIGHT: true, MAX_BONES: 64 },
      estimatedCompileMs: 2.0,
    },
    {
      id: "shadow-depth-skinned",
      domain: "shadow-depth",
      pipelineKind,
      priority: "normal",
      defines: { DEPTH_PACKING: "RGBA", USE_SKINNING: true },
      estimatedCompileMs: 1.2,
    },
    {
      id: "post-outline-composite",
      domain: "post-outline",
      pipelineKind,
      priority: "low",
      defines: { EDGE_AA: true, TONE_MAP: "ACES" },
      estimatedCompileMs: 1.3,
    },
  ];
}

function clampSliceBudgetMs(requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return SHADER_IDLE_DEFAULT_SLICE_BUDGET_MS;
  }
  return Math.max(0.5, Math.min(SHADER_IDLE_MAX_SLICE_BUDGET_MS, requested));
}

function createDefaultIdleScheduler(
  fallbackSliceBudgetMs: number,
  nowMs: () => number,
): ShaderIdleSchedulerAdapter {
  const globalWithIdle = globalThis as typeof globalThis & {
    requestIdleCallback?: (
      cb: (deadline: ShaderIdleDeadlineLike) => void,
      options?: { timeout?: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (
    typeof globalWithIdle.requestIdleCallback === "function"
    && typeof globalWithIdle.cancelIdleCallback === "function"
  ) {
    const req = globalWithIdle.requestIdleCallback.bind(globalWithIdle);
    const cancel = globalWithIdle.cancelIdleCallback.bind(globalWithIdle);
    return {
      requestIdle: (callback, options) => req(callback, options),
      cancelIdle: (handle) => cancel(handle),
    };
  }

  return {
    requestIdle: (callback) => {
      return Number(
        globalThis.setTimeout(() => {
          const startedAt = nowMs();
          callback({
            didTimeout: false,
            timeRemaining: () => Math.max(0, fallbackSliceBudgetMs - (nowMs() - startedAt)),
          });
        }, 0),
      );
    },
    cancelIdle: (handle) => {
      globalThis.clearTimeout(handle);
    },
  };
}

/**
 * 6ms 이하 유휴 시간 슬라이스 예산을 엄격히 지키는 3D/VRM 셰이더 사전 컴파일러.
 */
export class ShaderIdlePrewarmer {
  private readonly compileVariant: ShaderVariantCompiler;
  private readonly sliceBudgetMs: number;
  private readonly safetyMarginMs: number;
  private readonly idleTimeoutMs: number;
  private readonly maxCacheEntries: number;
  private readonly scheduler: ShaderIdleSchedulerAdapter;
  private readonly nowMs: () => number;
  private readonly onVariantCompiled?: (entry: CompiledShaderCacheEntry) => void;
  private readonly onVariantError?: (spec: ShaderVariantSpec, error: unknown) => void;

  private readonly compiledCache = new Map<string, CompiledShaderCacheEntry>();
  private readonly pendingByKey = new Map<string, PendingShaderJob>();
  private readonly slices: ShaderSliceTelemetry[] = [];
  private readonly drainWaiters: Array<(result: ShaderPrewarmDrainResult) => void> = [];

  private state: "idle" | "running" | "paused" | "cancelled" | "disposed" = "idle";
  private scheduledIdleHandle: number | null = null;
  private activeSlicePromise: Promise<void> | null = null;
  private runAbortController = new AbortController();
  private enqueueSequence = 0;

  private cacheHitCount = 0;
  private deduplicatedQueueCount = 0;
  private cancelledCount = 0;
  private failedCount = 0;
  private maxObservedSliceMs = 0;

  constructor(options: ShaderIdlePrewarmerOptions) {
    this.compileVariant = options.compileVariant;
    this.sliceBudgetMs = clampSliceBudgetMs(options.sliceBudgetMs);
    this.safetyMarginMs = Math.max(
      0,
      Math.min(this.sliceBudgetMs * 0.5, options.safetyMarginMs ?? SHADER_IDLE_DEFAULT_SAFETY_MARGIN_MS),
    );
    this.idleTimeoutMs = Math.max(16, Math.trunc(options.idleTimeoutMs ?? 120));
    this.maxCacheEntries = Math.max(16, Math.trunc(options.maxCacheEntries ?? SHADER_IDLE_DEFAULT_MAX_CACHE_ENTRIES));
    this.nowMs = options.nowMs ?? (() => performance.now());
    this.scheduler = options.scheduler ?? createDefaultIdleScheduler(this.sliceBudgetMs, this.nowMs);
    this.onVariantCompiled = options.onVariantCompiled;
    this.onVariantError = options.onVariantError;
  }

  /**
   * 셰이더 배리언트들을 중복 제거 및 우선순위 정렬해 유휴 사전 컴파일 대기열에 등록한다.
   */
  public enqueue(
    variants: readonly ShaderVariantSpec[],
    options?: EnqueueShaderVariantsOptions,
  ): { readonly queued: number; readonly cacheHits: number; readonly deduplicated: number } {
    if (this.state === "disposed") {
      return { queued: 0, cacheHits: 0, deduplicated: 0 };
    }
    const batchSignal = options?.signal;
    if (batchSignal?.aborted) {
      this.cancelledCount += variants.length;
      return { queued: 0, cacheHits: 0, deduplicated: 0 };
    }

    if (this.state === "cancelled") {
      this.runAbortController = new AbortController();
      this.state = "idle";
    }

    let queued = 0;
    let cacheHits = 0;
    let deduplicated = 0;

    for (const spec of variants) {
      const cacheKey = computeShaderVariantCacheKey(spec);
      if (this.compiledCache.has(cacheKey)) {
        this.cacheHitCount += 1;
        cacheHits += 1;
        continue;
      }

      const priorityWeight = PRIORITY_WEIGHT[spec.priority];
      const estimatedCompileMs = Math.max(
        0.1,
        Math.min(
          SHADER_IDLE_MAX_SLICE_BUDGET_MS,
          spec.estimatedCompileMs ?? DEFAULT_ESTIMATED_COMPILE_MS[spec.domain],
        ),
      );

      const existing = this.pendingByKey.get(cacheKey);
      if (existing) {
        if (priorityWeight > existing.priorityWeight) {
          existing.priorityWeight = priorityWeight;
          existing.spec = spec;
        }
        if (batchSignal) {
          existing.batchSignals.add(batchSignal);
        }
        this.deduplicatedQueueCount += 1;
        deduplicated += 1;
        continue;
      }

      this.enqueueSequence += 1;
      const batchSignals = new Set<AbortSignal>();
      if (batchSignal) batchSignals.add(batchSignal);

      this.pendingByKey.set(cacheKey, {
        cacheKey,
        spec,
        priorityWeight,
        estimatedCompileMs,
        enqueueOrder: this.enqueueSequence,
        batchSignals,
      });
      queued += 1;
    }

    if (batchSignal && queued > 0) {
      const onBatchAbort = (): void => {
        this.pruneAbortedBatchJobs();
      };
      batchSignal.addEventListener("abort", onBatchAbort, { once: true });
    }

    if (this.pendingByKey.size > 0 && this.state !== "paused") {
      this.state = "running";
      this.scheduleNextIdleSlice();
    } else if (this.pendingByKey.size === 0 && this.activeSlicePromise === null) {
      this.resolveDrainWaiters("completed");
    }

    return { queued, cacheHits, deduplicated };
  }

  private pruneAbortedBatchJobs(): void {
    for (const [key, job] of this.pendingByKey) {
      if (job.batchSignals.size === 0) continue;
      let anyLive = false;
      for (const signal of job.batchSignals) {
        if (!signal.aborted) {
          anyLive = true;
          break;
        }
      }
      if (!anyLive) {
        this.pendingByKey.delete(key);
        this.cancelledCount += 1;
      }
    }
    if (this.pendingByKey.size === 0 && this.activeSlicePromise === null) {
      this.clearScheduledIdle();
      if (this.state === "running") {
        this.state = "idle";
      }
      this.resolveDrainWaiters("completed");
    }
  }

  private pickNextJob(): PendingShaderJob | null {
    this.pruneAbortedBatchJobs();
    let best: PendingShaderJob | null = null;
    for (const job of this.pendingByKey.values()) {
      if (
        best === null
        || job.priorityWeight > best.priorityWeight
        || (job.priorityWeight === best.priorityWeight && job.enqueueOrder < best.enqueueOrder)
      ) {
        best = job;
      }
    }
    return best;
  }

  private clearScheduledIdle(): void {
    if (this.scheduledIdleHandle !== null) {
      this.scheduler.cancelIdle(this.scheduledIdleHandle);
      this.scheduledIdleHandle = null;
    }
  }

  private scheduleNextIdleSlice(): void {
    if (
      this.scheduledIdleHandle !== null
      || this.activeSlicePromise !== null
      || this.state !== "running"
      || this.pendingByKey.size === 0
    ) {
      return;
    }
    this.scheduledIdleHandle = this.scheduler.requestIdle(
      (deadline) => {
        this.scheduledIdleHandle = null;
        this.activeSlicePromise = this.runIdleSlice(deadline).finally(() => {
          this.activeSlicePromise = null;
          if (this.state === "running" && this.pendingByKey.size > 0) {
            this.scheduleNextIdleSlice();
          } else if (this.state === "running" && this.pendingByKey.size === 0) {
            this.state = "idle";
            this.resolveDrainWaiters("completed");
          }
        });
      },
      { timeout: this.idleTimeoutMs },
    );
  }

  private async runIdleSlice(deadline: ShaderIdleDeadlineLike): Promise<void> {
    if (this.state !== "running") return;

    const sliceStartMs = this.nowMs();
    const initialRemaining = Math.max(0, deadline.timeRemaining());
    const effectiveBudgetMs = deadline.didTimeout
      ? this.sliceBudgetMs
      : Math.min(this.sliceBudgetMs, Math.max(0, initialRemaining - this.safetyMarginMs));

    const compiledKeys: string[] = [];
    const runSignal = this.runAbortController.signal;

    while (this.state === "running" && !runSignal.aborted) {
      const nextJob = this.pickNextJob();
      if (nextJob === null) break;

      const elapsedMs = Math.max(0, this.nowMs() - sliceStartMs);
      const remainingDeadlineMs = Math.max(0, deadline.timeRemaining());
      const budgetLeftMs = Math.min(
        effectiveBudgetMs - elapsedMs,
        deadline.didTimeout ? this.sliceBudgetMs - elapsedMs : remainingDeadlineMs - this.safetyMarginMs,
      );

      if (compiledKeys.length > 0 && (budgetLeftMs <= 0 || budgetLeftMs < nextJob.estimatedCompileMs)) {
        break;
      }
      if (
        compiledKeys.length === 0
        && !deadline.didTimeout
        && (effectiveBudgetMs <= 0 || remainingDeadlineMs <= this.safetyMarginMs)
      ) {
        break;
      }

      this.pendingByKey.delete(nextJob.cacheKey);

      const compileStartMs = this.nowMs();
      try {
        await this.compileVariant(nextJob.spec, nextJob.cacheKey, runSignal);
      } catch (error) {
        if (runSignal.aborted || this.isStopped()) {
          this.cancelledCount += 1;
          break;
        }
        this.failedCount += 1;
        this.onVariantError?.(nextJob.spec, error);
        continue;
      }

      if (runSignal.aborted || this.isStopped()) {
        this.cancelledCount += 1;
        break;
      }

      const compileEndMs = this.nowMs();
      const entry: CompiledShaderCacheEntry = {
        cacheKey: nextJob.cacheKey,
        spec: nextJob.spec,
        compiledAtMs: compileEndMs,
        compileDurationMs: Math.max(0, compileEndMs - compileStartMs),
      };
      this.storeCompiledEntry(entry);
      compiledKeys.push(nextJob.cacheKey);
      this.onVariantCompiled?.(entry);
    }

    const totalElapsedMs = Math.max(0, this.nowMs() - sliceStartMs);
    if (totalElapsedMs > this.maxObservedSliceMs) {
      this.maxObservedSliceMs = totalElapsedMs;
    }

    this.slices.push({
      sliceIndex: this.slices.length + 1,
      budgetMs: this.sliceBudgetMs,
      elapsedMs: totalElapsedMs,
      compiledKeys,
      withinSliceBudget: totalElapsedMs <= SHADER_IDLE_MAX_SLICE_BUDGET_MS,
    });
  }

  private isStopped(): boolean {
    return this.state === "cancelled" || this.state === "disposed";
  }

  private storeCompiledEntry(entry: CompiledShaderCacheEntry): void {
    if (this.compiledCache.size >= this.maxCacheEntries) {
      const oldestKey = this.compiledCache.keys().next().value;
      if (typeof oldestKey === "string") {
        this.compiledCache.delete(oldestKey);
      }
    }
    this.compiledCache.set(entry.cacheKey, entry);
  }

  public isCompiled(specOrKey: ShaderVariantSpec | string): boolean {
    const key = typeof specOrKey === "string"
      ? specOrKey
      : computeShaderVariantCacheKey(specOrKey);
    return this.compiledCache.has(key);
  }

  public pause(): void {
    if (this.state !== "running") return;
    this.clearScheduledIdle();
    this.state = "paused";
  }

  public resume(): void {
    if (this.state !== "paused") return;
    if (this.pendingByKey.size === 0) {
      this.state = "idle";
      return;
    }
    this.state = "running";
    this.scheduleNextIdleSlice();
  }

  /**
   * 대기 중인 모든 사전 컴파일 작업을 즉시 취소하고 예약된 유휴 콜백을 해제한다.
   */
  public cancel(): number {
    if (this.state === "disposed") return 0;
    this.clearScheduledIdle();
    const dropped = this.pendingByKey.size;
    this.pendingByKey.clear();
    this.cancelledCount += dropped;
    this.runAbortController.abort();
    this.state = "cancelled";
    this.resolveDrainWaiters("cancelled");
    return dropped;
  }

  public dispose(): void {
    if (this.state === "disposed") return;
    this.clearScheduledIdle();
    this.cancelledCount += this.pendingByKey.size;
    this.pendingByKey.clear();
    this.runAbortController.abort();
    this.state = "disposed";
    this.resolveDrainWaiters("disposed");
  }

  /**
   * 대기열이 비거나 취소/해제될 때까지 기다린 뒤 슬라이스 텔레메트리와 스냅샷을 반환한다.
   */
  public waitUntilIdle(): Promise<ShaderPrewarmDrainResult> {
    if (this.state === "disposed") {
      return Promise.resolve({
        status: "disposed",
        snapshot: this.getSnapshot(),
        slices: [...this.slices],
      });
    }
    if (this.state === "cancelled") {
      return Promise.resolve({
        status: "cancelled",
        snapshot: this.getSnapshot(),
        slices: [...this.slices],
      });
    }
    if (this.pendingByKey.size === 0 && this.activeSlicePromise === null) {
      return Promise.resolve({
        status: "completed",
        snapshot: this.getSnapshot(),
        slices: [...this.slices],
      });
    }

    return new Promise<ShaderPrewarmDrainResult>((resolve) => {
      this.drainWaiters.push(resolve);
    });
  }

  private resolveDrainWaiters(status: ShaderPrewarmDrainResult["status"]): void {
    if (this.drainWaiters.length === 0) return;
    const result: ShaderPrewarmDrainResult = {
      status,
      snapshot: this.getSnapshot(),
      slices: [...this.slices],
    };
    const pending = this.drainWaiters.splice(0, this.drainWaiters.length);
    for (const resolve of pending) {
      resolve(result);
    }
  }

  public getSlices(): readonly ShaderSliceTelemetry[] {
    return [...this.slices];
  }

  public getSnapshot(): ShaderPrewarmSnapshot {
    return {
      state: this.state,
      sliceBudgetMs: this.sliceBudgetMs,
      pendingCount: this.pendingByKey.size,
      compiledCount: this.compiledCache.size,
      cacheHitCount: this.cacheHitCount,
      deduplicatedQueueCount: this.deduplicatedQueueCount,
      cancelledCount: this.cancelledCount,
      failedCount: this.failedCount,
      totalSlicesExecuted: this.slices.length,
      maxObservedSliceMs: this.maxObservedSliceMs,
      allSlicesWithinMaxBudget: this.slices.every((slice) => slice.withinSliceBudget),
    };
  }
}

export function createShaderIdlePrewarmer(
  options: ShaderIdlePrewarmerOptions,
): ShaderIdlePrewarmer {
  return new ShaderIdlePrewarmer(options);
}
