/**
 * 브라우저 로컬 멀티-워커 타일 렌더 풀 스케줄러 (₩0 로컬).
 *
 * 유료 클라우드 렌더 팜 대신 브라우저 멀티코어(Web Worker / 로컬 실행기)를 활용해
 * 캔버스 타일을 우선순위(interactive > export > background)로 병렬 처리한다.
 * AbortSignal 즉시 취소, navigator.hardwareConcurrency 기반 동시성 자동 튜닝,
 * 메모리 백프레셔 게이트를 단일 스케줄러로 통합한다.
 */

export type TileRenderPriority = "interactive" | "export" | "background";
export type MemoryBackpressureState = "nominal" | "elevated" | "critical";

export interface AutoConcurrencyOptions {
  readonly hardwareConcurrency?: number;
  readonly deviceMemoryGb?: number;
  readonly minConcurrency?: number;
  readonly maxConcurrency?: number;
  readonly reserveMainThreadCores?: number;
}

export interface TileExecutionContext {
  readonly taskId: string;
  readonly priority: TileRenderPriority;
  readonly signal: AbortSignal;
  readonly slotIndex: number;
}

export interface TileWorkerRuntime<TPayload, TResult> {
  readonly execute: (
    payload: TPayload,
    context: TileExecutionContext,
    transferables?: readonly Transferable[],
  ) => Promise<TResult>;
  readonly cancelInFlight?: (taskId: string, slotIndex: number) => void;
  readonly dispose?: () => void;
}

export interface TileRenderTaskRequest<TPayload> {
  readonly id?: string;
  readonly priority: TileRenderPriority;
  readonly payload: TPayload;
  /** 작업 실행 중 예상 점유 바이트(RGBA 타일 버퍼 등). 기본 0. */
  readonly estimatedBytes?: number;
  /** 동일 우선순위 내 정렬 가중치(작을수록 먼저 실행, 예: 뷰포트 중심 거리). */
  readonly subPriority?: number;
  readonly signal?: AbortSignal;
  readonly transferables?: readonly Transferable[];
}

export interface LocalRenderWorkerPoolOptions<TPayload, TResult> {
  readonly runtime: TileWorkerRuntime<TPayload, TResult>;
  readonly concurrency?: number;
  readonly autoConcurrencyOptions?: AutoConcurrencyOptions;
  /** 타일 렌더 메모리 상한(바이트). 기본 256 MiB. */
  readonly maxMemoryBudgetBytes?: number;
  /** 배경 작업 일시 정지 임계 비율 (0 < softRatio < hardRatio <= 1). 기본 0.75. */
  readonly softBackpressureRatio?: number;
  /** 신규 디스패치 일시 정지 임계 비율. 기본 0.92. */
  readonly hardBackpressureRatio?: number;
  /** 외부 힙/VRAM 사용량 측정 콜백(선택). */
  readonly getExternalMemoryBytes?: () => number;
  /** 테스트·결정론적 지연을 위한 시계 주입(ms). */
  readonly now?: () => number;
}

export interface LocalRenderPoolSnapshot {
  readonly targetConcurrency: number;
  readonly effectiveConcurrency: number;
  readonly inFlightCount: number;
  readonly queuedCounts: Readonly<Record<TileRenderPriority, number>>;
  readonly totalQueuedCount: number;
  readonly activeEstimatedBytes: number;
  readonly externalMemoryBytes: number;
  readonly totalTrackedBytes: number;
  readonly maxMemoryBudgetBytes: number;
  readonly memoryUtilizationRatio: number;
  readonly pressureState: MemoryBackpressureState;
  readonly completedCount: number;
  readonly cancelledCount: number;
  readonly failedCount: number;
  readonly backpressurePauses: number;
  readonly averageLatencyMs: number;
  readonly disposed: boolean;
  readonly zeroCloudCostKrw: 0;
}

export interface WebWorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: { readonly message?: string }) => void) | null;
}

export interface WebWorkerTileInboundMessage<TResult> {
  readonly type: "tile-result" | "tile-error";
  readonly taskId: string;
  readonly result?: TResult;
  readonly message?: string;
}

export interface WebWorkerTileOutboundMessage<TPayload> {
  readonly type: "render-tile";
  readonly taskId: string;
  readonly priority: TileRenderPriority;
  readonly payload: TPayload;
}

export class LocalRenderAbortError extends Error {
  readonly taskId: string;
  constructor(taskId: string, reason?: string) {
    super(reason ?? `타일 렌더 작업(${taskId})이 취소되었습니다.`);
    this.name = "AbortError";
    this.taskId = taskId;
  }
}

export class LocalRenderMemoryLimitError extends Error {
  readonly taskId: string;
  readonly requestedBytes: number;
  readonly budgetBytes: number;
  constructor(taskId: string, requestedBytes: number, budgetBytes: number) {
    super(`타일 렌더 작업(${taskId})의 예상 메모리(${requestedBytes}B)가 로컬 예산(${budgetBytes}B)을 초과합니다.`);
    this.name = "LocalRenderMemoryLimitError";
    this.taskId = taskId;
    this.requestedBytes = requestedBytes;
    this.budgetBytes = budgetBytes;
  }
}

const PRIORITY_RANK: Readonly<Record<TileRenderPriority, number>> = {
  interactive: 0,
  export: 1,
  background: 2,
};

const MIB = 1024 * 1024;
export const DEFAULT_LOCAL_RENDER_MEMORY_BUDGET_BYTES = 256 * MIB;

function readNavigatorHardwareConcurrency(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const value = navigator.hardwareConcurrency;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function readNavigatorDeviceMemoryGb(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const candidate = (navigator as Navigator & { readonly deviceMemory?: unknown }).deviceMemory;
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0 ? candidate : undefined;
}

/** `navigator.hardwareConcurrency`와 기기 메모리를 기준으로 UI 스레드 여유를 남긴 안전한 동시성 한도를 산출한다. */
export function computeAutoWorkerConcurrency(options: AutoConcurrencyOptions = {}): number {
  const minConcurrency = Math.max(1, Math.floor(options.minConcurrency ?? 1));
  const maxConcurrency = Math.max(minConcurrency, Math.floor(options.maxConcurrency ?? 16));
  const rawCores = options.hardwareConcurrency ?? readNavigatorHardwareConcurrency() ?? 4;
  const cores = Number.isFinite(rawCores) && rawCores >= 1 ? Math.floor(rawCores) : 4;
  const reserve = options.reserveMainThreadCores !== undefined
    ? Math.max(0, Math.floor(options.reserveMainThreadCores))
    : cores >= 8
      ? 2
      : 1;

  let workers = Math.max(1, cores - reserve);
  const deviceMemoryGb = options.deviceMemoryGb ?? readNavigatorDeviceMemoryGb();
  if (deviceMemoryGb !== undefined) {
    if (deviceMemoryGb <= 2) workers = Math.min(workers, 2);
    else if (deviceMemoryGb <= 4) workers = Math.min(workers, 4);
  }
  return Math.min(maxConcurrency, Math.max(minConcurrency, workers));
}

/** 기기 메모리 용량에 맞춘 로컬 타일 렌더 풀 메모리 예산을 반환한다. */
export function computeDefaultMemoryBudgetBytes(deviceMemoryGb?: number): number {
  const memoryGb = deviceMemoryGb ?? readNavigatorDeviceMemoryGb();
  if (memoryGb === undefined) return DEFAULT_LOCAL_RENDER_MEMORY_BUDGET_BYTES;
  if (memoryGb <= 2) return 96 * MIB;
  if (memoryGb <= 4) return 160 * MIB;
  if (memoryGb <= 8) return 256 * MIB;
  return 384 * MIB;
}

/** Node/Vitest 및 Worker 미지원 환경에서 ₩0 로컬 비동기 실행기를 생성한다. */
export function createInlineLocalTileRuntime<TPayload, TResult>(
  handler: (payload: TPayload, context: TileExecutionContext) => Promise<TResult> | TResult,
): TileWorkerRuntime<TPayload, TResult> {
  return {
    execute(payload, context) {
      if (context.signal.aborted) return Promise.reject(new LocalRenderAbortError(context.taskId));
      return Promise.resolve().then(() => handler(payload, context));
    },
  };
}

/**
 * 브라우저 Web Worker 풀 어댑터를 생성한다.
 * 실행 중 AbortSignal이 발동하면 해당 슬롯 워커를 즉시 종료해 CPU 점유를 회수하고,
 * 다음 작업 진입 시 새 워커를 지연 생성한다.
 */
export function createWebWorkerTileRuntime<TPayload, TResult>(
  createWorker: () => WebWorkerLike,
): TileWorkerRuntime<TPayload, TResult> {
  const workersBySlot = new Map<number, WebWorkerLike>();
  const pendingBySlot = new Map<
    number,
    { readonly taskId: string; readonly resolve: (value: TResult) => void; readonly reject: (error: Error) => void }
  >();

  const terminateSlot = (slotIndex: number, abortError?: Error): void => {
    const worker = workersBySlot.get(slotIndex);
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      workersBySlot.delete(slotIndex);
    }
    const pending = pendingBySlot.get(slotIndex);
    if (pending) {
      pendingBySlot.delete(slotIndex);
      if (abortError) pending.reject(abortError);
    }
  };

  const ensureWorker = (slotIndex: number): WebWorkerLike => {
    const existing = workersBySlot.get(slotIndex);
    if (existing) return existing;
    const worker = createWorker();
    worker.onmessage = (event) => {
      const pending = pendingBySlot.get(slotIndex);
      if (!pending) return;
      const msg = event.data as Partial<WebWorkerTileInboundMessage<TResult>> | null;
      if (!msg || msg.taskId !== pending.taskId) return;
      pendingBySlot.delete(slotIndex);
      if (msg.type === "tile-result") pending.resolve(msg.result as TResult);
      else pending.reject(new Error(msg.message ?? `워커 타일 렌더 실패(${pending.taskId})`));
    };
    worker.onerror = (event) => {
      terminateSlot(slotIndex, new Error(event.message ?? "Web Worker 실행 중 복구 불가능한 오류가 발생했습니다."));
    };
    workersBySlot.set(slotIndex, worker);
    return worker;
  };

  return {
    execute(payload, context, transferables) {
      if (context.signal.aborted) return Promise.reject(new LocalRenderAbortError(context.taskId));
      return new Promise<TResult>((resolve, reject) => {
        const worker = ensureWorker(context.slotIndex);
        pendingBySlot.set(context.slotIndex, { taskId: context.taskId, resolve, reject });
        const message: WebWorkerTileOutboundMessage<TPayload> = {
          type: "render-tile",
          taskId: context.taskId,
          priority: context.priority,
          payload,
        };
        try {
          worker.postMessage(message, transferables ? [...transferables] : undefined);
        } catch (error: unknown) {
          pendingBySlot.delete(context.slotIndex);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    cancelInFlight(taskId, slotIndex) {
      const pending = pendingBySlot.get(slotIndex);
      if (pending && pending.taskId === taskId) terminateSlot(slotIndex, new LocalRenderAbortError(taskId));
    },
    dispose() {
      for (const slotIndex of [...workersBySlot.keys()]) {
        terminateSlot(slotIndex, new LocalRenderAbortError(`slot-${slotIndex}`, "렌더 풀이 종료되었습니다."));
      }
    },
  };
}

interface QueuedTileTask<TPayload, TResult> {
  readonly id: string;
  readonly priority: TileRenderPriority;
  readonly subPriority: number;
  readonly sequence: number;
  readonly payload: TPayload;
  readonly estimatedBytes: number;
  readonly transferables?: readonly Transferable[];
  readonly externalSignal?: AbortSignal;
  readonly resolve: (value: TResult) => void;
  readonly reject: (reason: Error) => void;
  onExternalAbort?: () => void;
}

interface ActiveTileTask {
  readonly id: string;
  readonly priority: TileRenderPriority;
  readonly slotIndex: number;
  readonly estimatedBytes: number;
  readonly controller: AbortController;
  settled: boolean;
  rejectCaller: (error: Error) => void;
  cleanupExternalAbort: () => void;
}

function compareQueuedTasks<TPayload, TResult>(
  left: QueuedTileTask<TPayload, TResult>,
  right: QueuedTileTask<TPayload, TResult>,
): number {
  const rankDiff = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
  if (rankDiff !== 0) return rankDiff;
  return left.subPriority !== right.subPriority ? left.subPriority - right.subPriority : left.sequence - right.sequence;
}

export class LocalRenderWorkerPool<TPayload, TResult> {
  private readonly runtime: TileWorkerRuntime<TPayload, TResult>;
  private readonly targetConcurrency: number;
  private readonly maxMemoryBudgetBytes: number;
  private readonly softBackpressureRatio: number;
  private readonly hardBackpressureRatio: number;
  private readonly getExternalMemoryBytes: () => number;
  private readonly now: () => number;

  private readonly queue: QueuedTileTask<TPayload, TResult>[] = [];
  private readonly activeTasks = new Map<string, ActiveTileTask>();
  private readonly freeSlots: number[] = [];

  private sequenceCounter = 0;
  private activeEstimatedBytes = 0;
  private completedCount = 0;
  private cancelledCount = 0;
  private failedCount = 0;
  private backpressurePauses = 0;
  private totalLatencyMs = 0;
  private disposed = false;

  constructor(options: LocalRenderWorkerPoolOptions<TPayload, TResult>) {
    this.runtime = options.runtime;
    const rawConcurrency = options.concurrency ?? computeAutoWorkerConcurrency(options.autoConcurrencyOptions);
    this.targetConcurrency = Math.max(1, Math.floor(rawConcurrency));
    this.maxMemoryBudgetBytes = Math.max(
      1,
      Math.floor(options.maxMemoryBudgetBytes ?? DEFAULT_LOCAL_RENDER_MEMORY_BUDGET_BYTES),
    );
    const soft = options.softBackpressureRatio ?? 0.75;
    const hard = options.hardBackpressureRatio ?? 0.92;
    this.softBackpressureRatio = Math.min(0.95, Math.max(0.1, soft));
    this.hardBackpressureRatio = Math.min(1, Math.max(this.softBackpressureRatio + 0.05, hard));
    this.getExternalMemoryBytes = options.getExternalMemoryBytes ?? (() => 0);
    this.now = options.now ?? (() => Date.now());
    for (let slot = 0; slot < this.targetConcurrency; slot += 1) this.freeSlots.push(slot);
  }

  enqueue(request: TileRenderTaskRequest<TPayload>): Promise<TResult> {
    this.sequenceCounter += 1;
    const taskId = request.id ?? `tile-${this.sequenceCounter}`;
    const estimatedBytes = Math.max(0, Math.floor(request.estimatedBytes ?? 0));

    if (this.disposed) {
      this.cancelledCount += 1;
      return Promise.reject(new LocalRenderAbortError(taskId, "종료된 로컬 렌더 풀에는 작업을 등록할 수 없습니다."));
    }
    if (request.signal?.aborted) {
      this.cancelledCount += 1;
      return Promise.reject(new LocalRenderAbortError(taskId));
    }
    if (estimatedBytes > this.maxMemoryBudgetBytes) {
      this.failedCount += 1;
      return Promise.reject(new LocalRenderMemoryLimitError(taskId, estimatedBytes, this.maxMemoryBudgetBytes));
    }

    return new Promise<TResult>((resolve, reject) => {
      const task: QueuedTileTask<TPayload, TResult> = {
        id: taskId,
        priority: request.priority,
        subPriority: request.subPriority ?? 0,
        sequence: this.sequenceCounter,
        payload: request.payload,
        estimatedBytes,
        transferables: request.transferables,
        externalSignal: request.signal,
        resolve,
        reject,
      };
      if (request.signal) {
        const handleAbort = (): void => {
          const index = this.queue.indexOf(task);
          if (index < 0) return;
          this.queue.splice(index, 1);
          request.signal?.removeEventListener("abort", handleAbort);
          this.cancelledCount += 1;
          reject(new LocalRenderAbortError(taskId));
          this.pump();
        };
        task.onExternalAbort = handleAbort;
        request.signal.addEventListener("abort", handleAbort, { once: true });
      }
      this.insertSorted(task);
      this.pump();
    });
  }

  /** 특정 우선순위 대기·실행 작업을 일괄 취소한다(예: 줌/패닝 시 background 타일 중단). */
  cancelByPriority(priority: TileRenderPriority): number {
    let cancelled = 0;
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const task = this.queue[index];
      if (!task || task.priority !== priority) continue;
      this.queue.splice(index, 1);
      if (task.externalSignal && task.onExternalAbort) {
        task.externalSignal.removeEventListener("abort", task.onExternalAbort);
      }
      this.cancelledCount += 1;
      cancelled += 1;
      task.reject(new LocalRenderAbortError(task.id, `${priority} 우선순위 작업이 일괄 취소되었습니다.`));
    }
    for (const active of [...this.activeTasks.values()]) {
      if (active.priority === priority && this.abortActiveTask(active, `${priority} 우선순위 실행 작업이 취소되었습니다.`)) {
        cancelled += 1;
      }
    }
    this.pump();
    return cancelled;
  }

  /** 외부 메모리 회수 직후 백프레셔 대기 작업을 즉시 재개한다. */
  notifyMemoryReleased(): void {
    if (!this.disposed) this.pump();
  }

  getSnapshot(): LocalRenderPoolSnapshot {
    const externalMemoryBytes = this.readExternalBytes();
    const totalTrackedBytes = this.activeEstimatedBytes + externalMemoryBytes;
    const utilization = totalTrackedBytes / this.maxMemoryBudgetBytes;
    const pressureState = this.resolvePressureState(utilization);
    const queuedCounts: Record<TileRenderPriority, number> = { interactive: 0, export: 0, background: 0 };
    for (const task of this.queue) queuedCounts[task.priority] += 1;

    return {
      targetConcurrency: this.targetConcurrency,
      effectiveConcurrency: this.resolveEffectiveConcurrency(pressureState),
      inFlightCount: this.activeTasks.size,
      queuedCounts,
      totalQueuedCount: this.queue.length,
      activeEstimatedBytes: this.activeEstimatedBytes,
      externalMemoryBytes,
      totalTrackedBytes,
      maxMemoryBudgetBytes: this.maxMemoryBudgetBytes,
      memoryUtilizationRatio: Math.min(1, Math.max(0, utilization)),
      pressureState,
      completedCount: this.completedCount,
      cancelledCount: this.cancelledCount,
      failedCount: this.failedCount,
      backpressurePauses: this.backpressurePauses,
      averageLatencyMs: this.completedCount > 0 ? this.totalLatencyMs / this.completedCount : 0,
      disposed: this.disposed,
      zeroCloudCostKrw: 0,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) continue;
      if (task.externalSignal && task.onExternalAbort) {
        task.externalSignal.removeEventListener("abort", task.onExternalAbort);
      }
      this.cancelledCount += 1;
      task.reject(new LocalRenderAbortError(task.id, "로컬 렌더 풀이 종료되었습니다."));
    }
    for (const active of [...this.activeTasks.values()]) {
      this.abortActiveTask(active, "로컬 렌더 풀이 종료되었습니다.");
    }
    this.runtime.dispose?.();
  }

  private readExternalBytes(): number {
    const raw = this.getExternalMemoryBytes();
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  }

  private resolvePressureState(utilization: number): MemoryBackpressureState {
    if (utilization >= this.hardBackpressureRatio) return "critical";
    return utilization >= this.softBackpressureRatio ? "elevated" : "nominal";
  }

  private resolveEffectiveConcurrency(pressureState: MemoryBackpressureState): number {
    if (pressureState === "nominal") return this.targetConcurrency;
    return pressureState === "elevated" ? Math.max(1, Math.floor(this.targetConcurrency * 0.6)) : 1;
  }

  private insertSorted(task: QueuedTileTask<TPayload, TResult>): void {
    let low = 0;
    let high = this.queue.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      const pivot = this.queue[mid];
      if (pivot && compareQueuedTasks(pivot, task) <= 0) low = mid + 1;
      else high = mid;
    }
    this.queue.splice(low, 0, task);
  }

  private findDispatchableIndex(): { readonly index: number; readonly blockedByMemory: boolean } {
    if (this.queue.length === 0) return { index: -1, blockedByMemory: false };

    const externalBytes = this.readExternalBytes();
    const currentTracked = this.activeEstimatedBytes + externalBytes;
    const pressureState = this.resolvePressureState(currentTracked / this.maxMemoryBudgetBytes);
    const effectiveConcurrency = this.resolveEffectiveConcurrency(pressureState);

    if (this.activeTasks.size >= effectiveConcurrency || this.freeSlots.length === 0) {
      return {
        index: -1,
        blockedByMemory: pressureState !== "nominal" && this.activeTasks.size < this.targetConcurrency,
      };
    }

    const hardLimitBytes = Math.floor(this.maxMemoryBudgetBytes * this.hardBackpressureRatio);
    let sawMemoryBlock = false;
    for (let index = 0; index < this.queue.length; index += 1) {
      const candidate = this.queue[index];
      if (!candidate) continue;
      if (pressureState !== "nominal" && candidate.priority === "background") {
        sawMemoryBlock = true;
        continue;
      }
      const fitsHardLimit = currentTracked + candidate.estimatedBytes <= hardLimitBytes;
      const canAvoidDeadlock =
        this.activeTasks.size === 0 && externalBytes + candidate.estimatedBytes <= this.maxMemoryBudgetBytes;
      if (fitsHardLimit || canAvoidDeadlock) return { index, blockedByMemory: false };
      sawMemoryBlock = true;
    }
    return { index: -1, blockedByMemory: sawMemoryBlock };
  }

  private pump(): void {
    if (this.disposed) return;
    while (this.queue.length > 0 && this.freeSlots.length > 0) {
      const decision = this.findDispatchableIndex();
      if (decision.index < 0) {
        if (decision.blockedByMemory) this.backpressurePauses += 1;
        return;
      }
      const [task] = this.queue.splice(decision.index, 1);
      if (!task) return;
      if (task.externalSignal && task.onExternalAbort) {
        task.externalSignal.removeEventListener("abort", task.onExternalAbort);
      }
      if (task.externalSignal?.aborted) {
        this.cancelledCount += 1;
        task.reject(new LocalRenderAbortError(task.id));
        continue;
      }
      const slotIndex = this.freeSlots.shift();
      if (slotIndex === undefined) {
        this.insertSorted(task);
        return;
      }
      this.dispatchTask(task, slotIndex);
    }
  }

  private releaseActiveSlot(active: ActiveTileTask): void {
    if (!this.activeTasks.has(active.id)) return;
    this.activeTasks.delete(active.id);
    this.activeEstimatedBytes = Math.max(0, this.activeEstimatedBytes - active.estimatedBytes);
    active.cleanupExternalAbort();
    this.freeSlots.push(active.slotIndex);
    this.freeSlots.sort((a, b) => a - b);
  }

  private dispatchTask(task: QueuedTileTask<TPayload, TResult>, slotIndex: number): void {
    const controller = new AbortController();
    const startedAtMs = this.now();
    const active: ActiveTileTask = {
      id: task.id,
      priority: task.priority,
      slotIndex,
      estimatedBytes: task.estimatedBytes,
      controller,
      settled: false,
      rejectCaller: task.reject,
      cleanupExternalAbort: () => undefined,
    };

    if (task.externalSignal) {
      const onInFlightAbort = (): void => {
        this.abortActiveTask(active);
      };
      task.externalSignal.addEventListener("abort", onInFlightAbort, { once: true });
      active.cleanupExternalAbort = () => task.externalSignal?.removeEventListener("abort", onInFlightAbort);
    }

    this.activeTasks.set(task.id, active);
    this.activeEstimatedBytes += task.estimatedBytes;

    const context: TileExecutionContext = {
      taskId: task.id,
      priority: task.priority,
      signal: controller.signal,
      slotIndex,
    };

    Promise.resolve()
      .then(() => this.runtime.execute(task.payload, context, task.transferables))
      .then((result) => {
        if (active.settled) return;
        active.settled = true;
        this.completedCount += 1;
        this.totalLatencyMs += Math.max(0, this.now() - startedAtMs);
        this.releaseActiveSlot(active);
        this.pump();
        task.resolve(result);
      })
      .catch((error: unknown) => {
        if (active.settled) {
          this.releaseActiveSlot(active);
          this.pump();
          return;
        }
        active.settled = true;
        this.releaseActiveSlot(active);
        this.pump();
        if (error instanceof LocalRenderAbortError || (error instanceof Error && error.name === "AbortError")) {
          this.cancelledCount += 1;
          task.reject(error instanceof Error ? error : new LocalRenderAbortError(task.id));
          return;
        }
        this.failedCount += 1;
        task.reject(error instanceof Error ? error : new Error(String(error)));
      });
  }

  private abortActiveTask(active: ActiveTileTask, reason?: string): boolean {
    if (active.settled) return false;
    active.settled = true;
    this.cancelledCount += 1;
    active.controller.abort();
    this.runtime.cancelInFlight?.(active.id, active.slotIndex);
    this.releaseActiveSlot(active);
    active.rejectCaller(new LocalRenderAbortError(active.id, reason));
    this.pump();
    return true;
  }
}

export function createLocalRenderWorkerPool<TPayload, TResult>(
  options: LocalRenderWorkerPoolOptions<TPayload, TResult>,
): LocalRenderWorkerPool<TPayload, TResult> {
  return new LocalRenderWorkerPool(options);
}
