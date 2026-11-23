/**
 * Web Worker + OffscreenCanvas + Transferable ArrayBuffer 제로-카피 범용 병렬 연산 풀.
 *
 * - 최대 `min(4, max(1, hardwareConcurrency - 1))`개의 전용 워커를 관리한다.
 * - 입·출력 `ArrayBuffer`를 `Transferable` 제로-카피로 전송해 메인 스레드 복사/GC 부하를 없앤다.
 * - `AbortSignal` 취소, 타임아웃 워치독, 워커 크래시 자동 재기동(Auto-Respawn),
 *   `OffscreenCanvas` 제어권 이전(`transferControlToOffscreen`), 그리고 `Worker` 미지원(JSDOM/SSR)
 *   환경의 비동기 마이크로태스크 완전 동치 폴백을 제공한다.
 */

import {
  STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
  collectInputTransferables,
  collectOutputTransferables,
  executeStudioComputeJob,
  measureTransferableBytes,
  type StudioComputeJobInput,
  type StudioComputeJobOutput,
  type StudioComputeJobOutputByType,
  type StudioWorkerOutboundMessage,
} from "./compute-job-executor";
import {
  MAX_STUDIO_COMPUTE_WORKERS,
  StudioWorkerPoolError,
  cloneJobInputForNonTransfer,
  computeDefaultPoolSize,
  createDefaultModuleWorker,
  transferCanvasControlToOffscreen,
  type OffscreenCanvasAttachResult,
  type OffscreenCanvasTransferResult,
  type StudioComputeJobOptions,
  type StudioComputeWorkerPoolOptions,
  type StudioComputeWorkerPoolTelemetry,
  type StudioWorkerPoolErrorCode,
  type TransferControlCapableCanvas,
  type WorkerLike,
} from "./offscreen-worker-pool-types";
import {
  probeWasmSimdAndWorkerSupport,
  type ComputeBackendTier,
  type WasmSimdWorkerSupportSnapshot,
} from "./wasm-simd-pixel-kernel";

export {
  MAX_STUDIO_COMPUTE_WORKERS,
  StudioWorkerPoolError,
  computeDefaultPoolSize,
  transferCanvasControlToOffscreen,
  type OffscreenCanvasAttachResult,
  type OffscreenCanvasTransferResult,
  type StudioComputeJobOptions,
  type StudioComputeWorkerPoolOptions,
  type StudioComputeWorkerPoolTelemetry,
  type StudioWorkerPoolErrorCode,
  type TransferControlCapableCanvas,
  type WorkerLike,
};

const DEFAULT_JOB_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPAWNS_PER_SLOT = 3;
const CANCEL_RECYCLE_GRACE_MS = 250;

interface PendingJob {
  readonly jobId: number;
  readonly input: StudioComputeJobInput;
  readonly timeoutMs: number;
  readonly transferInput: boolean;
  readonly signal: AbortSignal | undefined;
  readonly enqueuedAtMs: number;
  startedAtMs: number;
  settled: boolean;
  abortCleanup: (() => void) | null;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  readonly resolve: (output: StudioComputeJobOutput) => void;
  readonly reject: (reason: Error) => void;
}

interface WorkerSlot {
  readonly slotIndex: number;
  worker: WorkerLike | null;
  activeJob: PendingJob | null;
  cancellingJobId: number | null;
  cancelGraceTimer: ReturnType<typeof setTimeout> | null;
  respawnCount: number;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/**
 * ToonStudio 백그라운드 병렬 연산 풀.
 *
 * Web Worker + Wasm SIMD128 + Transferable 제로-카피를 기본으로 사용하며,
 * JSDOM/SSR 등 `Worker` 미지원 런타임에서는 비동기 마이크로태스크 폴백으로 완전 동치 결과를 제공한다.
 */
export class StudioComputeWorkerPool {
  private readonly maxWorkers: number;
  private readonly defaultTimeoutMs: number;
  private readonly maxRespawnsPerSlot: number;
  private readonly workerFactory: ((slotIndex: number) => WorkerLike) | null;
  private readonly useWorkerMode: boolean;
  private readonly capabilities: WasmSimdWorkerSupportSnapshot;
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: PendingJob[] = [];
  private readonly inlineOffscreenSurfaces = new Map<string, OffscreenCanvas>();

  private nextJobId = 1;
  private inlineActiveCount = 0;
  private completedJobs = 0;
  private failedJobs = 0;
  private cancelledJobs = 0;
  private timedOutJobs = 0;
  private crashedWorkerCount = 0;
  private respawnedWorkerCount = 0;
  private totalJobMs = 0;
  private zeroCopyBytesTransferred = 0;
  private disposed = false;

  constructor(options: StudioComputeWorkerPoolOptions = {}) {
    const probed = probeWasmSimdAndWorkerSupport(
      options.hardwareConcurrency !== undefined
        ? { hardwareConcurrency: options.hardwareConcurrency }
        : undefined,
    );
    const desiredWorkers =
      options.maxWorkers !== undefined && Number.isFinite(options.maxWorkers)
        ? Math.min(MAX_STUDIO_COMPUTE_WORKERS, Math.max(1, Math.floor(options.maxWorkers)))
        : computeDefaultPoolSize(probed.hardwareConcurrency);

    this.maxWorkers = desiredWorkers;
    this.defaultTimeoutMs = Math.max(10, Math.floor(options.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS));
    this.maxRespawnsPerSlot = Math.max(
      0,
      Math.floor(options.maxRespawnsPerSlot ?? DEFAULT_MAX_RESPAWNS_PER_SLOT),
    );

    const hasWorkerRuntime =
      !options.forceInlineFallback
      && (typeof options.workerFactory === "function" || probed.worker);

    this.useWorkerMode = hasWorkerRuntime;
    this.workerFactory = hasWorkerRuntime
      ? (options.workerFactory ?? createDefaultModuleWorker)
      : null;
    this.capabilities = probed;

    for (let i = 0; i < this.maxWorkers; i += 1) {
      this.slots.push({
        slotIndex: i,
        worker: null,
        activeJob: null,
        cancellingJobId: null,
        cancelGraceTimer: null,
        respawnCount: 0,
      });
    }
  }

  getCapabilities(): WasmSimdWorkerSupportSnapshot {
    return this.capabilities;
  }

  private resolveBackendTier(): ComputeBackendTier {
    if (this.useWorkerMode) {
      return this.capabilities.wasmSimd128
        ? "worker-wasm-simd128"
        : "worker-wasm-scalar";
    }
    if (this.capabilities.wasmSimd128) return "main-wasm-simd128";
    if (this.capabilities.webAssembly) return "main-wasm-scalar";
    return "main-js-fallback";
  }

  /**
   * 실시간 풀 텔레메트리 스냅샷을 반환한다.
   */
  getTelemetry(): StudioComputeWorkerPoolTelemetry {
    const spawnedWorkers = this.useWorkerMode
      ? this.slots.filter((slot) => slot.worker !== null).length
      : 0;
    const activeWorkers = this.useWorkerMode
      ? this.slots.filter((slot) => slot.activeJob !== null || slot.cancellingJobId !== null).length
      : this.inlineActiveCount;
    const idleWorkers = Math.max(0, spawnedWorkers - activeWorkers);
    const avgJobMs = this.completedJobs > 0 ? this.totalJobMs / this.completedJobs : 0;

    return Object.freeze({
      maxWorkers: this.maxWorkers,
      activeWorkers,
      idleWorkers,
      spawnedWorkers,
      crashedWorkerCount: this.crashedWorkerCount,
      respawnedWorkerCount: this.respawnedWorkerCount,
      queuedJobs: this.queue.length,
      completedJobs: this.completedJobs,
      failedJobs: this.failedJobs,
      cancelledJobs: this.cancelledJobs,
      timedOutJobs: this.timedOutJobs,
      avgJobMs,
      totalJobMs: this.totalJobMs,
      zeroCopyBytesTransferred: this.zeroCopyBytesTransferred,
      backendTier: this.resolveBackendTier(),
      wasmSimd128: this.capabilities.wasmSimd128,
      offscreenCanvasSupported: this.capabilities.offscreenCanvas,
    });
  }

  /**
   * 필요 시 지정 개수만큼 워커를 선제 기동한다.
   */
  prewarm(count = this.maxWorkers): number {
    if (this.disposed || !this.useWorkerMode) return 0;
    const target = Math.min(this.maxWorkers, Math.max(0, Math.floor(count)));
    let spawned = 0;
    for (let i = 0; i < target; i += 1) {
      const slot = this.slots[i];
      if (slot && !slot.worker && this.spawnSlotWorker(slot, false)) {
        spawned += 1;
      }
    }
    return spawned;
  }

  /**
   * HTMLCanvasElement 또는 OffscreenCanvas 제어권을 워커 슬롯 0(또는 폴백 맵)에 연결한다.
   */
  attachOffscreenCanvas(
    surfaceId: string,
    canvas: TransferControlCapableCanvas | OffscreenCanvas,
  ): OffscreenCanvasAttachResult {
    if (this.disposed) {
      return { ok: false, surfaceId, targetSlotIndex: null, usedWorkerTransfer: false, reason: "disposed" };
    }

    let offscreen: OffscreenCanvas;
    if (typeof OffscreenCanvas === "function" && canvas instanceof OffscreenCanvas) {
      offscreen = canvas;
    } else {
      const transferred = transferCanvasControlToOffscreen(canvas as TransferControlCapableCanvas);
      if (!transferred.ok) {
        return {
          ok: false,
          surfaceId,
          targetSlotIndex: null,
          usedWorkerTransfer: false,
          reason: transferred.reason,
        };
      }
      offscreen = transferred.offscreenCanvas;
    }

    if (!this.useWorkerMode) {
      this.inlineOffscreenSurfaces.set(surfaceId, offscreen);
      return { ok: true, surfaceId, targetSlotIndex: null, usedWorkerTransfer: false };
    }

    const slot = this.slots[0];
    if (!slot) {
      return { ok: false, surfaceId, targetSlotIndex: null, usedWorkerTransfer: false, reason: "no-slot" };
    }
    if (!slot.worker && !this.spawnSlotWorker(slot, false)) {
      return {
        ok: false,
        surfaceId,
        targetSlotIndex: null,
        usedWorkerTransfer: false,
        reason: "worker-spawn-failed",
      };
    }

    try {
      slot.worker?.postMessage(
        {
          version: STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
          kind: "attach-offscreen-canvas",
          surfaceId,
          canvas: offscreen,
        },
        [offscreen as unknown as Transferable],
      );
      return { ok: true, surfaceId, targetSlotIndex: slot.slotIndex, usedWorkerTransfer: true };
    } catch (error: unknown) {
      return {
        ok: false,
        surfaceId,
        targetSlotIndex: slot.slotIndex,
        usedWorkerTransfer: false,
        reason: error instanceof Error ? error.message : "transfer-failed",
      };
    }
  }

  /**
   * 5종 백그라운드 연산 작업 중 하나를 큐에 등록하고 제로-카피로 실행한다.
   */
  runJob<T extends StudioComputeJobInput>(
    input: T,
    options?: StudioComputeJobOptions,
  ): Promise<StudioComputeJobOutputByType[T["type"]]> {
    if (this.disposed) {
      return Promise.reject(
        new StudioWorkerPoolError("disposed", "이미 종료(dispose)된 워커 풀에는 작업을 제출할 수 없습니다."),
      );
    }

    if (options?.signal?.aborted) {
      this.cancelledJobs += 1;
      return Promise.reject(
        new StudioWorkerPoolError("aborted", "작업이 제출 시점에 이미 취소되었습니다."),
      );
    }

    const jobId = this.nextJobId;
    this.nextJobId += 1;
    const timeoutMs = Math.max(10, Math.floor(options?.timeoutMs ?? this.defaultTimeoutMs));
    const transferInput = options?.transferInput ?? true;

    return new Promise<StudioComputeJobOutputByType[T["type"]]>((resolve, reject) => {
      const job: PendingJob = {
        jobId,
        input,
        timeoutMs,
        transferInput,
        signal: options?.signal,
        enqueuedAtMs: nowMs(),
        startedAtMs: 0,
        settled: false,
        abortCleanup: null,
        timeoutHandle: null,
        resolve: resolve as (output: StudioComputeJobOutput) => void,
        reject,
      };

      if (options?.signal) {
        const onAbort = (): void => {
          this.handleJobAbort(job);
        };
        options.signal.addEventListener("abort", onAbort, { once: true });
        job.abortCleanup = () => {
          options.signal?.removeEventListener("abort", onAbort);
        };
      }

      this.queue.push(job);
      this.pumpQueue();
    });
  }

  /**
   * 모든 워커를 즉시 종료하고 대기/실행 중인 작업을 취소한다.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    const disposedError = new StudioWorkerPoolError(
      "disposed",
      "워커 풀이 종료되어 대기·실행 중이던 작업이 취소되었습니다.",
    );

    while (this.queue.length > 0) {
      const queued = this.queue.shift();
      if (queued) this.settleJobReject(queued, disposedError, "cancelled");
    }

    for (const slot of this.slots) {
      if (slot.cancelGraceTimer !== null) {
        clearTimeout(slot.cancelGraceTimer);
        slot.cancelGraceTimer = null;
      }
      if (slot.activeJob) {
        const active = slot.activeJob;
        slot.activeJob = null;
        this.settleJobReject(active, disposedError, "cancelled");
      }
      slot.cancellingJobId = null;
      this.terminateSlotWorker(slot);
    }

    this.inlineOffscreenSurfaces.clear();
  }

  private clearJobResources(job: PendingJob): void {
    if (job.timeoutHandle !== null) {
      clearTimeout(job.timeoutHandle);
      job.timeoutHandle = null;
    }
    if (job.abortCleanup !== null) {
      job.abortCleanup();
      job.abortCleanup = null;
    }
  }

  private settleJobResolve(job: PendingJob, output: StudioComputeJobOutput): void {
    if (job.settled) return;
    job.settled = true;
    this.clearJobResources(job);
    const elapsed = Math.max(0, nowMs() - (job.startedAtMs || job.enqueuedAtMs));
    this.completedJobs += 1;
    this.totalJobMs += elapsed;
    job.resolve(output);
  }

  private settleJobReject(
    job: PendingJob,
    error: Error,
    category: "failed" | "cancelled" | "timeout",
  ): void {
    if (job.settled) return;
    job.settled = true;
    this.clearJobResources(job);
    if (category === "cancelled") {
      this.cancelledJobs += 1;
    } else if (category === "timeout") {
      this.timedOutJobs += 1;
      this.failedJobs += 1;
    } else {
      this.failedJobs += 1;
    }
    job.reject(error);
  }

  private handleJobAbort(job: PendingJob): void {
    if (job.settled) return;

    const abortError = new StudioWorkerPoolError(
      "aborted",
      `작업 #${job.jobId}이(가) AbortSignal에 의해 취소되었습니다.`,
    );

    const queueIdx = this.queue.indexOf(job);
    if (queueIdx !== -1) {
      this.queue.splice(queueIdx, 1);
      this.settleJobReject(job, abortError, "cancelled");
      return;
    }

    const ownerSlot = this.slots.find((slot) => slot.activeJob === job);
    this.settleJobReject(job, abortError, "cancelled");

    if (ownerSlot && ownerSlot.worker) {
      ownerSlot.activeJob = null;
      ownerSlot.cancellingJobId = job.jobId;
      try {
        ownerSlot.worker.postMessage({
          version: STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
          kind: "cancel-job",
          jobId: job.jobId,
        });
      } catch {
        this.respawnSlotAfterFault(ownerSlot);
        return;
      }

      ownerSlot.cancelGraceTimer = setTimeout(() => {
        if (ownerSlot.cancellingJobId === job.jobId) {
          ownerSlot.cancelGraceTimer = null;
          ownerSlot.cancellingJobId = null;
          this.respawnSlotAfterFault(ownerSlot);
        }
      }, CANCEL_RECYCLE_GRACE_MS);
    }
  }

  private terminateSlotWorker(slot: WorkerSlot): void {
    if (!slot.worker) return;
    const target = slot.worker;
    slot.worker = null;
    target.onmessage = null;
    target.onerror = null;
    if ("onmessageerror" in target) target.onmessageerror = null;
    try {
      target.terminate();
    } catch {
      // 이미 종료된 워커의 terminate 오류는 무시
    }
  }

  private spawnSlotWorker(slot: WorkerSlot, isRespawn: boolean): boolean {
    if (this.disposed || !this.workerFactory) return false;
    if (isRespawn) {
      if (slot.respawnCount >= this.maxRespawnsPerSlot) return false;
      slot.respawnCount += 1;
      this.respawnedWorkerCount += 1;
    }

    let worker: WorkerLike;
    try {
      worker = this.workerFactory(slot.slotIndex);
    } catch {
      return false;
    }

    worker.onmessage = (event: MessageEvent<StudioWorkerOutboundMessage>) => {
      this.handleWorkerMessage(slot, event.data);
    };
    worker.onerror = (event: Event | ErrorEvent) => {
      const detail =
        "message" in event && typeof event.message === "string" && event.message.length > 0
          ? event.message
          : "워커 스레드에서 예기치 않은 크래시가 발생했습니다.";
      this.handleWorkerCrash(slot, detail);
    };
    worker.onmessageerror = () => {
      this.handleWorkerCrash(slot, "워커 메시지 역직렬화(onmessageerror)에 실패했습니다.");
    };

    slot.worker = worker;
    return true;
  }

  private respawnSlotAfterFault(slot: WorkerSlot): void {
    if (slot.cancelGraceTimer !== null) {
      clearTimeout(slot.cancelGraceTimer);
      slot.cancelGraceTimer = null;
    }
    slot.cancellingJobId = null;
    this.terminateSlotWorker(slot);
    if (!this.disposed) {
      this.spawnSlotWorker(slot, true);
      this.pumpQueue();
    }
  }

  private handleWorkerCrash(slot: WorkerSlot, reasonMessage: string): void {
    if (this.disposed) return;
    this.crashedWorkerCount += 1;

    const active = slot.activeJob;
    slot.activeJob = null;
    if (active) {
      this.settleJobReject(
        active,
        new StudioWorkerPoolError(
          "worker-crashed",
          `워커 슬롯 #${slot.slotIndex} 크래시로 작업 #${active.jobId}이(가) 중단되었습니다: ${reasonMessage}`,
        ),
        "failed",
      );
    }

    this.respawnSlotAfterFault(slot);

    const anyHealthyOrSpawnable = this.slots.some(
      (item) => item.worker !== null || item.respawnCount < this.maxRespawnsPerSlot,
    );
    if (!anyHealthyOrSpawnable) {
      while (this.queue.length > 0) {
        const orphaned = this.queue.shift();
        if (orphaned) {
          this.settleJobReject(
            orphaned,
            new StudioWorkerPoolError(
              "worker-crashed",
              "모든 워커 슬롯이 최대 재기동 횟수를 초과해 대기 작업을 실행할 수 없습니다.",
            ),
            "failed",
          );
        }
      }
    }
  }

  private handleWorkerMessage(slot: WorkerSlot, message: StudioWorkerOutboundMessage): void {
    if (!message || typeof message !== "object") return;
    if (message.version !== STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION) return;
    if (message.kind === "ready" || message.kind === "canvas-attached" || message.kind === "pong") {
      return;
    }

    if (slot.cancellingJobId === message.jobId) {
      if (slot.cancelGraceTimer !== null) {
        clearTimeout(slot.cancelGraceTimer);
        slot.cancelGraceTimer = null;
      }
      slot.cancellingJobId = null;
      this.pumpQueue();
      return;
    }

    const active = slot.activeJob;
    if (!active || active.jobId !== message.jobId) return;
    slot.activeJob = null;

    if (message.kind === "job-result") {
      const returnedBytes =
        message.transferBytes > 0
          ? message.transferBytes
          : measureTransferableBytes(collectOutputTransferables(message.output));
      this.zeroCopyBytesTransferred += returnedBytes;
      this.settleJobResolve(active, message.output);
    } else {
      const code: StudioWorkerPoolErrorCode =
        message.code === "cancelled" ? "aborted" : "execution-failed";
      const category = message.code === "cancelled" ? "cancelled" : "failed";
      this.settleJobReject(active, new StudioWorkerPoolError(code, message.message), category);
    }

    this.pumpQueue();
  }

  private pumpQueue(): void {
    if (this.disposed || this.queue.length === 0) return;

    if (!this.useWorkerMode) {
      this.pumpInlineQueue();
      return;
    }

    for (const slot of this.slots) {
      if (this.queue.length === 0) break;
      if (slot.activeJob !== null || slot.cancellingJobId !== null) continue;
      if (!slot.worker && !this.spawnSlotWorker(slot, false)) continue;

      const job = this.queue.shift();
      if (!job || job.settled) continue;
      this.dispatchJobToWorkerSlot(slot, job);
    }
  }

  private dispatchJobToWorkerSlot(slot: WorkerSlot, job: PendingJob): void {
    const worker = slot.worker;
    if (!worker) {
      this.queue.unshift(job);
      return;
    }

    slot.activeJob = job;
    job.startedAtMs = nowMs();
    job.timeoutHandle = setTimeout(() => {
      if (slot.activeJob !== job || job.settled) return;
      slot.activeJob = null;
      this.settleJobReject(
        job,
        new StudioWorkerPoolError(
          "timeout",
          `작업 #${job.jobId}이(가) 제한 시간(${job.timeoutMs}ms)을 초과했습니다.`,
        ),
        "timeout",
      );
      this.respawnSlotAfterFault(slot);
    }, job.timeoutMs);

    const payloadInput = job.transferInput
      ? job.input
      : cloneJobInputForNonTransfer(job.input);
    const transfers = collectInputTransferables(payloadInput);
    const transferBytes = measureTransferableBytes(transfers);

    try {
      worker.postMessage(
        {
          version: STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
          kind: "run-job",
          jobId: job.jobId,
          input: payloadInput,
        },
        transfers,
      );
      this.zeroCopyBytesTransferred += transferBytes;
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : "postMessage 전송 실패";
      this.handleWorkerCrash(slot, detail);
    }
  }

  private pumpInlineQueue(): void {
    while (this.inlineActiveCount < this.maxWorkers && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job || job.settled) continue;

      this.inlineActiveCount += 1;
      job.startedAtMs = nowMs();
      job.timeoutHandle = setTimeout(() => {
        if (job.settled) return;
        this.settleJobReject(
          job,
          new StudioWorkerPoolError(
            "timeout",
            `폴백 작업 #${job.jobId}이(가) 제한 시간(${job.timeoutMs}ms)을 초과했습니다.`,
          ),
          "timeout",
        );
      }, job.timeoutMs);

      const inputBytes = measureTransferableBytes(collectInputTransferables(job.input));

      void Promise.resolve()
        .then(() => {
          if (job.settled) return null;
          this.zeroCopyBytesTransferred += inputBytes;
          return executeStudioComputeJob(job.input, {
            isCancelled: () => job.settled || Boolean(job.signal?.aborted),
            offscreenSurfaces: this.inlineOffscreenSurfaces,
          });
        })
        .then((output) => {
          if (output && !job.settled) {
            const outBytes = measureTransferableBytes(collectOutputTransferables(output));
            this.zeroCopyBytesTransferred += outBytes;
            this.settleJobResolve(job, output);
          }
        })
        .catch((error: unknown) => {
          if (!job.settled) {
            const isAborted = Boolean(job.signal?.aborted);
            this.settleJobReject(
              job,
              new StudioWorkerPoolError(
                isAborted ? "aborted" : "execution-failed",
                error instanceof Error ? error.message : "비동기 폴백 연산에 실패했습니다.",
              ),
              isAborted ? "cancelled" : "failed",
            );
          }
        })
        .finally(() => {
          this.inlineActiveCount = Math.max(0, this.inlineActiveCount - 1);
          this.pumpQueue();
        });
    }
  }
}
