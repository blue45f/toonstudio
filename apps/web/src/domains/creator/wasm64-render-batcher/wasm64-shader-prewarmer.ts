/**
 * 프레임 예산(기본 2.0ms) 기반 비차단 WGSL 셰이더 · WASM 모듈 프리워머.
 *
 * - 유휴 시간 슬라이스(`maxSliceMs`)마다 우선순위 큐(`critical > high > background`)에서
 *   태스크를 실행하고, 예산 도달 시 호스트에 양보해 120Hz 드로잉 프레임 드롭을 방지한다.
 * - 태스크 ID 중복 제거 및 우선순위 승격, `AbortSignal` 취소, 재시도/폴백 격리,
 *   제로-히치 콜드스타트 텔레메트리를 제공한다.
 */

export const DEFAULT_PREWARM_MAX_SLICE_MS = 2.0;

export type PrewarmPriority = "critical" | "high" | "background";
export type PrewarmArtifactKind = "wgsl-compute" | "wgsl-render" | "wasm-module";
export type PrewarmTaskStatus = "queued" | "running" | "completed" | "fallback" | "failed" | "cancelled";
export type PrewarmTerminalStatus = Exclude<PrewarmTaskStatus, "queued" | "running">;

const PRIORITY_RANK: Readonly<Record<PrewarmPriority, number>> = {
  critical: 0, high: 1, background: 2,
};

export interface PrewarmYieldContext {
  readonly sliceIndex: number; readonly sliceDurationMs: number;
  readonly remainingQueue: number; readonly maxSliceMs: number;
}

export interface PrewarmTaskDescriptor<T = unknown> {
  readonly id: string;
  readonly kind: PrewarmArtifactKind;
  readonly priority: PrewarmPriority;
  readonly compile: (signal: AbortSignal) => Promise<T> | T;
  readonly fallback?: (error: unknown, signal: AbortSignal) => Promise<T> | T;
  readonly maxRetries?: number;
  readonly estimatedMs?: number;
  readonly signal?: AbortSignal;
}

export interface PrewarmTaskResult<T = unknown> {
  readonly id: string; readonly kind: PrewarmArtifactKind; readonly priority: PrewarmPriority;
  readonly status: PrewarmTerminalStatus;
  readonly value?: T; readonly error?: unknown;
  readonly durationMs: number; readonly attempts: number;
  readonly sliceIndex: number; readonly deduplicated: boolean;
}

export interface PrewarmTelemetry {
  readonly totalEnqueued: number; readonly deduplicatedCount: number; readonly priorityPromotions: number;
  readonly completedCount: number; readonly fallbackCount: number;
  readonly failedCount: number; readonly cancelledCount: number;
  readonly retryCount: number; readonly pendingCount: number;
  readonly sliceCount: number; readonly yieldCount: number;
  readonly slicesWithinBudget: number; readonly overBudgetSlices: number;
  readonly maxSliceMs: number; readonly peakSliceDurationMs: number;
  readonly totalCompileMs: number; readonly averageTaskDurationMs: number;
  readonly zeroHitchRatePct: number; readonly coldStartEliminatedCount: number;
  readonly sliceDurationsMs: readonly number[];
}

export interface Wasm64ShaderPrewarmerOptions {
  readonly maxSliceMs?: number;
  readonly defaultMaxRetries?: number;
  readonly autoStart?: boolean;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  readonly yieldToHost?: (ctx: PrewarmYieldContext) => Promise<void>;
}

interface InternalTask {
  readonly id: string; readonly kind: PrewarmArtifactKind; priority: PrewarmPriority;
  readonly seq: number;
  readonly compile: (signal: AbortSignal) => Promise<unknown> | unknown;
  readonly fallback?: (error: unknown, signal: AbortSignal) => Promise<unknown> | unknown;
  readonly maxRetries: number; readonly estimatedMs?: number;
  readonly controller: AbortController;
  readonly cleanups: (() => void)[];
  status: PrewarmTaskStatus;
  readonly promise: Promise<PrewarmTaskResult>;
  readonly resolve: (result: PrewarmTaskResult) => void;
}

function defaultYieldToHost(): Promise<void> {
  const g = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof g.requestIdleCallback === "function") {
    return new Promise<void>((resolve) => { g.requestIdleCallback?.(() => resolve(), { timeout: 16 }); });
  }
  return new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}

export class Wasm64ShaderPrewarmer {
  readonly maxSliceMs: number;
  private readonly defaultMaxRetries: number;
  private readonly autoStart: boolean;
  private readonly now: () => number;
  private readonly yieldToHost: (ctx: PrewarmYieldContext) => Promise<void>;
  private readonly globalController = new AbortController();
  private readonly queue: InternalTask[] = [];
  private readonly registry = new Map<string, InternalTask>();
  private readonly sliceDurations: number[] = [];

  private seqCounter = 0;
  private sliceCounter = 0;
  private paused = false;
  private pumpPromise: Promise<void> | null = null;
  private microtaskScheduled = false;
  private readonly stats = {
    totalEnqueued: 0, deduplicatedCount: 0, priorityPromotions: 0,
    completedCount: 0, fallbackCount: 0, failedCount: 0, cancelledCount: 0,
    retryCount: 0, yieldCount: 0, slicesWithinBudget: 0, overBudgetSlices: 0,
    peakSliceDurationMs: 0, totalCompileMs: 0, executedTaskCount: 0,
  };

  constructor(options: Wasm64ShaderPrewarmerOptions = {}) {
    const maxSliceMs = options.maxSliceMs ?? DEFAULT_PREWARM_MAX_SLICE_MS;
    const defaultMaxRetries = options.defaultMaxRetries ?? 0;
    if (!Number.isFinite(maxSliceMs) || maxSliceMs <= 0) {
      throw new RangeError(`maxSliceMs는 0보다 큰 유한수여야 합니다: ${maxSliceMs}`);
    }
    if (!Number.isSafeInteger(defaultMaxRetries) || defaultMaxRetries < 0) {
      throw new RangeError(`defaultMaxRetries는 0 이상의 정수여야 합니다: ${defaultMaxRetries}`);
    }
    this.maxSliceMs = maxSliceMs;
    this.defaultMaxRetries = defaultMaxRetries;
    this.autoStart = options.autoStart ?? true;
    this.now = options.now ?? (() => performance.now());
    this.yieldToHost = options.yieldToHost ?? (() => defaultYieldToHost());
    if (options.signal) {
      if (options.signal.aborted) this.globalController.abort(options.signal.reason);
      else options.signal.addEventListener("abort", () => this.cancelAll(options.signal?.reason), { once: true });
    }
  }

  get pendingCount(): number { return this.queue.length; }
  get isRunning(): boolean { return this.pumpPromise !== null; }
  getTaskStatus(id: string): PrewarmTaskStatus | undefined { return this.registry.get(id)?.status; }

  enqueue<T>(descriptor: PrewarmTaskDescriptor<T>): Promise<PrewarmTaskResult<T>> {
    if (!descriptor.id) throw new RangeError("프리웜 태스크 id는 빈 문자열일 수 없습니다.");
    const existing = this.registry.get(descriptor.id);
    if (existing && existing.status !== "failed" && existing.status !== "cancelled") {
      this.stats.deduplicatedCount++;
      if (existing.status === "queued" && PRIORITY_RANK[descriptor.priority] < PRIORITY_RANK[existing.priority]) {
        existing.priority = descriptor.priority;
        this.stats.priorityPromotions++;
      }
      return existing.promise.then((res) => ({ ...(res as PrewarmTaskResult<T>), deduplicated: true }));
    }

    this.stats.totalEnqueued++;
    const controller = new AbortController();
    let resolveFn: (result: PrewarmTaskResult) => void = () => undefined;
    const promise = new Promise<PrewarmTaskResult>((resolve) => { resolveFn = resolve; });
    const task: InternalTask = {
      id: descriptor.id, kind: descriptor.kind, priority: descriptor.priority,
      seq: ++this.seqCounter,
      compile: descriptor.compile as (signal: AbortSignal) => Promise<unknown> | unknown,
      fallback: descriptor.fallback as ((error: unknown, signal: AbortSignal) => Promise<unknown> | unknown) | undefined,
      maxRetries: descriptor.maxRetries ?? this.defaultMaxRetries,
      estimatedMs: descriptor.estimatedMs,
      controller, cleanups: [], status: "queued", promise, resolve: resolveFn,
    };
    this.registry.set(task.id, task);

    if (this.globalController.signal.aborted || descriptor.signal?.aborted) {
      controller.abort(descriptor.signal?.reason ?? this.globalController.signal.reason);
      this.finalizeCancelled(task);
      return promise as Promise<PrewarmTaskResult<T>>;
    }
    this.linkAbortSignal(task, this.globalController.signal);
    if (descriptor.signal) this.linkAbortSignal(task, descriptor.signal);
    this.queue.push(task);
    if (this.autoStart && !this.paused) this.schedulePumpMicrotask();
    return promise as Promise<PrewarmTaskResult<T>>;
  }

  enqueueMany(tasks: readonly PrewarmTaskDescriptor[]): Promise<readonly PrewarmTaskResult[]> {
    return Promise.all(tasks.map((task) => this.enqueue(task)));
  }

  async start(): Promise<PrewarmTelemetry> {
    this.paused = false;
    await this.ensurePump();
    return this.getTelemetry();
  }

  pause(): void { this.paused = true; }

  async drain(): Promise<PrewarmTelemetry> {
    this.paused = false;
    while (!this.paused && (this.queue.length > 0 || this.pumpPromise !== null)) await this.ensurePump();
    return this.getTelemetry();
  }

  cancel(id: string, reason?: unknown): boolean {
    const task = this.registry.get(id);
    if (!task || (task.status !== "queued" && task.status !== "running")) return false;
    task.controller.abort(reason);
    if (task.status === "queued") {
      this.removeFromQueue(task);
      this.finalizeCancelled(task);
    }
    return true;
  }

  cancelAll(reason?: unknown): number {
    if (!this.globalController.signal.aborted) this.globalController.abort(reason);
    const snapshot = this.queue.splice(0, this.queue.length);
    for (const task of snapshot) {
      if (!task.controller.signal.aborted) task.controller.abort(reason);
      this.finalizeCancelled(task);
    }
    return snapshot.length;
  }

  getTelemetry(): PrewarmTelemetry {
    const s = this.stats;
    const sliceCount = this.sliceDurations.length;
    return {
      totalEnqueued: s.totalEnqueued, deduplicatedCount: s.deduplicatedCount,
      priorityPromotions: s.priorityPromotions, completedCount: s.completedCount,
      fallbackCount: s.fallbackCount, failedCount: s.failedCount,
      cancelledCount: s.cancelledCount, retryCount: s.retryCount,
      pendingCount: this.queue.length, sliceCount, yieldCount: s.yieldCount,
      slicesWithinBudget: s.slicesWithinBudget, overBudgetSlices: s.overBudgetSlices,
      maxSliceMs: this.maxSliceMs, peakSliceDurationMs: s.peakSliceDurationMs,
      totalCompileMs: s.totalCompileMs,
      averageTaskDurationMs: s.executedTaskCount === 0 ? 0 : s.totalCompileMs / s.executedTaskCount,
      zeroHitchRatePct: sliceCount === 0 ? 100 : (s.slicesWithinBudget / sliceCount) * 100,
      coldStartEliminatedCount: s.completedCount + s.fallbackCount,
      sliceDurationsMs: [...this.sliceDurations],
    };
  }

  private linkAbortSignal(task: InternalTask, signal: AbortSignal): void {
    const onAbort = () => {
      if (!task.controller.signal.aborted) task.controller.abort(signal.reason);
      if (task.status === "queued") {
        this.removeFromQueue(task);
        this.finalizeCancelled(task);
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    task.cleanups.push(() => signal.removeEventListener("abort", onAbort));
  }

  private cleanupTaskListeners(task: InternalTask): void {
    while (task.cleanups.length > 0) task.cleanups.pop()?.();
  }

  private removeFromQueue(task: InternalTask): void {
    const idx = this.queue.indexOf(task);
    if (idx >= 0) this.queue.splice(idx, 1);
  }

  private finalizeCancelled(task: InternalTask): void {
    if (task.status !== "queued" && task.status !== "running") return;
    task.status = "cancelled";
    this.stats.cancelledCount++;
    this.cleanupTaskListeners(task);
    task.resolve({
      id: task.id, kind: task.kind, priority: task.priority, status: "cancelled",
      durationMs: 0, attempts: 0, sliceIndex: this.sliceCounter, deduplicated: false,
    });
  }

  private finishTask(
    task: InternalTask, status: Exclude<PrewarmTerminalStatus, "cancelled">,
    durationMs: number, attempts: number, sliceIndex: number, value?: unknown, error?: unknown,
  ): void {
    this.stats.totalCompileMs += durationMs;
    this.stats.executedTaskCount++;
    if (status === "completed") this.stats.completedCount++;
    else if (status === "fallback") this.stats.fallbackCount++;
    else this.stats.failedCount++;
    task.status = status;
    this.cleanupTaskListeners(task);
    task.resolve({
      id: task.id, kind: task.kind, priority: task.priority, status,
      value, error, durationMs, attempts, sliceIndex, deduplicated: false,
    });
  }

  private schedulePumpMicrotask(): void {
    if (this.pumpPromise || this.microtaskScheduled) return;
    this.microtaskScheduled = true;
    queueMicrotask(() => {
      this.microtaskScheduled = false;
      if (!this.paused && this.queue.length > 0) void this.ensurePump();
    });
  }

  private ensurePump(): Promise<void> {
    if (this.pumpPromise) return this.pumpPromise;
    if (this.paused || this.queue.length === 0) return Promise.resolve();
    const run = this.runSlices().finally(() => {
      this.pumpPromise = null;
      if (!this.paused && this.queue.length > 0) this.schedulePumpMicrotask();
    });
    this.pumpPromise = run;
    return run;
  }

  private peekBestTaskIndex(): number {
    let bestIdx = 0;
    let best = this.queue[0];
    for (let i = 1; i < this.queue.length; i++) {
      const cur = this.queue[i];
      const rankDiff = PRIORITY_RANK[cur.priority] - PRIORITY_RANK[best.priority];
      if (rankDiff < 0 || (rankDiff === 0 && cur.seq < best.seq)) { bestIdx = i; best = cur; }
    }
    return bestIdx;
  }

  private recordSliceDuration(durationMs: number): void {
    this.sliceDurations.push(durationMs);
    if (durationMs > this.stats.peakSliceDurationMs) this.stats.peakSliceDurationMs = durationMs;
    if (durationMs <= this.maxSliceMs) this.stats.slicesWithinBudget++;
    else this.stats.overBudgetSlices++;
  }

  private async yieldSlice(sliceIndex: number, elapsedMs: number): Promise<void> {
    this.recordSliceDuration(elapsedMs);
    this.stats.yieldCount++;
    await this.yieldToHost({
      sliceIndex, sliceDurationMs: elapsedMs,
      remainingQueue: this.queue.length, maxSliceMs: this.maxSliceMs,
    });
  }

  private async runSlices(): Promise<void> {
    while (!this.paused && this.queue.length > 0) {
      const sliceIndex = ++this.sliceCounter;
      const sliceStart = this.now();
      let tasksInSlice = 0;
      while (!this.paused && this.queue.length > 0) {
        const bestIdx = this.peekBestTaskIndex();
        const nextTask = this.queue[bestIdx];
        const elapsedBefore = Math.max(0, this.now() - sliceStart);
        const wouldExceed = nextTask.estimatedMs !== undefined && elapsedBefore + nextTask.estimatedMs > this.maxSliceMs;
        if (tasksInSlice > 0 && (elapsedBefore >= this.maxSliceMs || wouldExceed)) {
          await this.yieldSlice(sliceIndex, elapsedBefore);
          tasksInSlice = -1;
          break;
        }
        this.queue.splice(bestIdx, 1);
        if (nextTask.controller.signal.aborted) { this.finalizeCancelled(nextTask); continue; }
        await this.executeTask(nextTask, sliceIndex);
        tasksInSlice++;
        const elapsedAfter = Math.max(0, this.now() - sliceStart);
        if (!this.paused && this.queue.length > 0 && elapsedAfter >= this.maxSliceMs) {
          await this.yieldSlice(sliceIndex, elapsedAfter);
          tasksInSlice = -1;
          break;
        }
      }
      if (tasksInSlice > 0) this.recordSliceDuration(Math.max(0, this.now() - sliceStart));
    }
  }

  private async executeTask(task: InternalTask, sliceIndex: number): Promise<void> {
    task.status = "running";
    const start = this.now();
    let attempts = 0;
    let lastError: unknown;
    while (attempts <= task.maxRetries) {
      if (task.controller.signal.aborted) { this.finalizeCancelled(task); return; }
      attempts++;
      try {
        const value = await task.compile(task.controller.signal);
        if (task.controller.signal.aborted) { this.finalizeCancelled(task); return; }
        this.finishTask(task, "completed", Math.max(0, this.now() - start), attempts, sliceIndex, value);
        return;
      } catch (err) {
        if (task.controller.signal.aborted) { this.finalizeCancelled(task); return; }
        lastError = err;
        if (attempts <= task.maxRetries) this.stats.retryCount++;
      }
    }
    if (task.fallback && !task.controller.signal.aborted) {
      try {
        const value = await task.fallback(lastError, task.controller.signal);
        if (task.controller.signal.aborted) { this.finalizeCancelled(task); return; }
        this.finishTask(task, "fallback", Math.max(0, this.now() - start), attempts, sliceIndex, value, lastError);
        return;
      } catch (fallbackErr) { lastError = fallbackErr; }
    }
    this.finishTask(task, "failed", Math.max(0, this.now() - start), attempts, sliceIndex, undefined, lastError);
  }
}
