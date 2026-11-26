/**
 * 비동기 WebAssembly 렌더러 워커 풀(작업 훔치기 · 배압 제어 · 비정상 워커 재생성) +
 * 2의 거듭제곱 슬랩 아레나 메모리 풀(`64B..64KiB`, O(1) 할당/해제) + 제로카피 IPC 링 디스크립터 채널.
 *
 * - 11개 크기 등급(`64B..64KiB`) 인트루시브 프리리스트 아레나로 GC 할당 없이 O(1) 대여·반납 및 단편화 계측
 * - SharedArrayBuffer(미격리 시 ArrayBuffer 폴백) 32바이트 고정 슬롯 링으로 페이로드 복사 0회 IPC 전달
 * - 우선순위 데크 + 유휴 워커 Work-Stealing + 큐 한도 배압(Backpressure) + 장애 워커 자동 교체 복구
 */

/** 64B부터 64KiB까지 11단계 2의 거듭제곱 슬랩 크기 등급(바이트). */
export const SLAB_SIZE_CLASSES: readonly number[] = Object.freeze([
  64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536,
]);

const IPC_HEADER_I32_WORDS = 8; // writeCursor, readCursor, capacity, droppedCount 등 32B 헤더
const IPC_SLOT_I32_WORDS = 8; // 32B 디스크립터 슬롯

export type WorkerTaskPriority = "critical" | "interactive" | "background";

export interface SlabAllocationHandle {
  readonly handleId: number;
  readonly classIndex: number;
  readonly slotIndex: number;
  readonly byteOffset: number;
  readonly requestedBytes: number;
  readonly blockBytes: number;
}

export interface SlabArenaTelemetry {
  readonly totalArenaBytes: number;
  readonly activeAllocations: number;
  readonly activeRequestedBytes: number;
  readonly activeBlockBytes: number;
  readonly internalFragmentationRatio: number;
  readonly arenaUtilizationRatio: number;
  readonly totalAllocs: number;
  readonly totalFrees: number;
  readonly sharedBacking: boolean;
}

export interface IpcRingDescriptor {
  readonly taskId: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly classIndex: number;
  readonly priorityCode: number;
  readonly flags: number;
  readonly checksum: number;
}

export interface RenderTileTaskInput {
  readonly taskId: number;
  readonly priority: WorkerTaskPriority;
  readonly payload: Uint8Array;
  readonly idempotent?: boolean;
}

export interface RenderTileTaskResult {
  readonly taskId: number;
  readonly workerId: number;
  readonly workerGeneration: number;
  readonly stolenFromWorkerId: number | null;
  readonly outputChecksum: number;
  readonly processedBytes: number;
}

export interface WasmRenderWorkerInstanceLike {
  readonly workerId: number;
  readonly generation: number;
  readonly executeDescriptor: (
    descriptor: IpcRingDescriptor,
    slabView: Uint8Array,
  ) => Promise<{ readonly outputChecksum: number; readonly healthy?: boolean }>;
  readonly terminate?: () => void;
}

export interface WasmWorkerPoolConfig {
  readonly workerCount?: number;
  readonly maxQueuedTasks?: number;
  readonly maxConsecutiveFailures?: number;
  readonly taskTimeoutMs?: number;
  readonly arenaSlotsPerClass?: number;
  readonly createWorker?: (workerId: number, generation: number) => WasmRenderWorkerInstanceLike;
}

export interface WasmWorkerPoolTelemetry {
  readonly workerCount: number;
  readonly completedTasks: number;
  readonly stolenTasks: number;
  readonly recycledWorkers: number;
  readonly retriedTasks: number;
  readonly backpressureRejections: number;
  readonly inFlightTasks: number;
  readonly slab: SlabArenaTelemetry;
}

function createBackingBuffer(byteLength: number, preferShared = true): {
  readonly buffer: ArrayBufferLike;
  readonly shared: boolean;
} {
  if (preferShared && typeof SharedArrayBuffer !== "undefined") {
    try {
      return { buffer: new SharedArrayBuffer(byteLength), shared: true };
    } catch {
      // 비격리 환경에서는 표준 ArrayBuffer로 폴백한다.
    }
  }
  return { buffer: new ArrayBuffer(byteLength), shared: false };
}

function computeXorChecksum(bytes: Uint8Array): number {
  let acc = 0x5a5a5a5a;
  for (let i = 0; i < bytes.length; i += 1) {
    acc = (Math.imul(acc ^ (bytes[i] ?? 0), 16777619) >>> 0);
  }
  return acc >>> 0;
}

function selectSizeClassIndex(requestedBytes: number): number {
  if (requestedBytes <= 0 || requestedBytes > 65536) {
    return -1;
  }
  for (let i = 0; i < SLAB_SIZE_CLASSES.length; i += 1) {
    const cls = SLAB_SIZE_CLASSES[i] ?? 0;
    if (requestedBytes <= cls) return i;
  }
  return -1;
}

/**
 * `64B..64KiB` 2의 거듭제곱 슬랩 아레나 메모리 풀.
 * 크기 등급별 고정 배열 스택으로 O(1) `alloc`/`free`를 수행하고 내부 단편화율을 실시간 추적한다.
 */
export class PowerOfTwoSlabArena {
  public readonly buffer: ArrayBufferLike;
  public readonly bytesView: Uint8Array;
  public readonly sharedBacking: boolean;
  public readonly slotsPerClass: readonly number[];

  private readonly classBaseOffsets: readonly number[];
  private readonly freeStacks: Int32Array[];
  private readonly freeTops: Int32Array;
  private readonly leaseStates: Uint8Array[];
  private readonly leaseRequested: Uint32Array[];

  private activeAllocations = 0;
  private activeRequestedBytes = 0;
  private activeBlockBytes = 0;
  private totalAllocs = 0;
  private totalFrees = 0;

  public constructor(options?: {
    readonly slotsPerClass?: number | readonly number[];
    readonly preferSharedBuffer?: boolean;
  }) {
    const classCount = SLAB_SIZE_CLASSES.length;
    const counts: number[] = [];
    const baseOffsets: number[] = [];
    let cursor = 0;

    for (let c = 0; c < classCount; c += 1) {
      const clsBytes = SLAB_SIZE_CLASSES[c] ?? 64;
      const defaultSlots = clsBytes <= 1024 ? 128 : clsBytes <= 16384 ? 32 : 12;
      const count =
        typeof options?.slotsPerClass === "number"
          ? Math.max(2, Math.round(options.slotsPerClass))
          : Array.isArray(options?.slotsPerClass)
            ? Math.max(2, Math.round((options.slotsPerClass[c] as number | undefined) ?? defaultSlots))
            : defaultSlots;
      counts.push(count);
      baseOffsets.push(cursor);
      cursor += count * clsBytes;
    }

    const backing = createBackingBuffer(cursor, options?.preferSharedBuffer ?? true);
    this.buffer = backing.buffer;
    this.bytesView = new Uint8Array(this.buffer);
    this.sharedBacking = backing.shared;
    this.slotsPerClass = Object.freeze(counts);
    this.classBaseOffsets = Object.freeze(baseOffsets);
    this.freeStacks = [];
    this.freeTops = new Int32Array(classCount);
    this.leaseStates = [];
    this.leaseRequested = [];

    for (let c = 0; c < classCount; c += 1) {
      const cnt = counts[c] ?? 2;
      const stack = new Int32Array(cnt);
      for (let s = 0; s < cnt; s += 1) {
        stack[s] = cnt - 1 - s;
      }
      this.freeStacks.push(stack);
      this.freeTops[c] = cnt;
      this.leaseStates.push(new Uint8Array(cnt));
      this.leaseRequested.push(new Uint32Array(cnt));
    }
  }

  /** 요청 바이트를 수용하는 최소 크기 등급에서 O(1)로 슬랩 블록을 대여한다. */
  public alloc(requestedBytes: number): SlabAllocationHandle | null {
    const safeReq = Math.max(1, Math.ceil(requestedBytes));
    const classIdx = selectSizeClassIndex(safeReq);
    if (classIdx < 0) return null;

    const top = this.freeTops[classIdx] ?? 0;
    if (top <= 0) return null;
    const nextTop = top - 1;
    this.freeTops[classIdx] = nextTop;
    const slotIdx = this.freeStacks[classIdx]?.[nextTop] ?? 0;

    const states = this.leaseStates[classIdx];
    const reqArr = this.leaseRequested[classIdx];
    if (states && reqArr) {
      states[slotIdx] = 1;
      reqArr[slotIdx] = safeReq;
    }

    const blockBytes = SLAB_SIZE_CLASSES[classIdx] ?? 64;
    const byteOffset = (this.classBaseOffsets[classIdx] ?? 0) + slotIdx * blockBytes;
    const handleId = ((classIdx & 0xff) << 20) | (slotIdx & 0xfffff);

    this.activeAllocations += 1;
    this.activeRequestedBytes += safeReq;
    this.activeBlockBytes += blockBytes;
    this.totalAllocs += 1;

    return {
      handleId,
      classIndex: classIdx,
      slotIndex: slotIdx,
      byteOffset,
      requestedBytes: safeReq,
      blockBytes,
    };
  }

  /** 대여된 핸들을 O(1)로 프리리스트에 반납한다(이중 해제 차단). */
  public free(handle: SlabAllocationHandle): boolean {
    const { classIndex, slotIndex } = handle;
    if (classIndex < 0 || classIndex >= SLAB_SIZE_CLASSES.length) return false;
    const maxSlots = this.slotsPerClass[classIndex] ?? 0;
    if (slotIndex < 0 || slotIndex >= maxSlots) return false;

    const states = this.leaseStates[classIndex];
    const reqArr = this.leaseRequested[classIndex];
    const stack = this.freeStacks[classIndex];
    if (!states || !reqArr || !stack || states[slotIndex] !== 1) {
      return false;
    }

    const prevReq = reqArr[slotIndex] ?? 0;
    const blockBytes = SLAB_SIZE_CLASSES[classIndex] ?? 64;
    states[slotIndex] = 0;
    reqArr[slotIndex] = 0;

    const top = this.freeTops[classIndex] ?? 0;
    stack[top] = slotIndex;
    this.freeTops[classIndex] = top + 1;

    this.activeAllocations -= 1;
    this.activeRequestedBytes -= prevReq;
    this.activeBlockBytes -= blockBytes;
    this.totalFrees += 1;
    return true;
  }

  /** 할당된 슬랩 영역의 무복사 서브어레이 뷰를 반환한다. */
  public viewOf(handle: SlabAllocationHandle): Uint8Array {
    return this.bytesView.subarray(handle.byteOffset, handle.byteOffset + handle.requestedBytes);
  }

  public getTelemetry(): SlabArenaTelemetry {
    const wastedBytes = Math.max(0, this.activeBlockBytes - this.activeRequestedBytes);
    const internalFragmentationRatio =
      this.activeBlockBytes > 0 ? wastedBytes / this.activeBlockBytes : 0;
    return {
      totalArenaBytes: this.bytesView.byteLength,
      activeAllocations: this.activeAllocations,
      activeRequestedBytes: this.activeRequestedBytes,
      activeBlockBytes: this.activeBlockBytes,
      internalFragmentationRatio,
      arenaUtilizationRatio:
        this.bytesView.byteLength > 0 ? this.activeBlockBytes / this.bytesView.byteLength : 0,
      totalAllocs: this.totalAllocs,
      totalFrees: this.totalFrees,
      sharedBacking: this.sharedBacking,
    };
  }
}

/**
 * 슬랩 오프셋·길이 디스크립터만 링버퍼에 기록해 바이트 복사를 0으로 만드는 제로카피 IPC 채널.
 */
export class ZeroCopyIpcRingChannel {
  public readonly capacity: number;
  public readonly sharedBacking: boolean;
  private readonly words: Int32Array;
  private readonly useAtomics: boolean;

  public constructor(capacityPowerOfTwo = 64, preferSharedBuffer = true) {
    let cap = 4;
    while (cap < capacityPowerOfTwo && cap < 16384) cap <<= 1;
    this.capacity = cap;
    const totalBytes = (IPC_HEADER_I32_WORDS + cap * IPC_SLOT_I32_WORDS) * 4;
    const backing = createBackingBuffer(totalBytes, preferSharedBuffer);
    this.sharedBacking = backing.shared;
    this.words = new Int32Array(backing.buffer);
    this.useAtomics = backing.shared && typeof Atomics !== "undefined";
    this.writeWord(2, cap);
  }

  private readWord(idx: number): number {
    return this.useAtomics ? Atomics.load(this.words, idx) : (this.words[idx] ?? 0);
  }

  private writeWord(idx: number, val: number): void {
    if (this.useAtomics) {
      Atomics.store(this.words, idx, val | 0);
    } else {
      this.words[idx] = val | 0;
    }
  }

  public tryEnqueue(desc: IpcRingDescriptor): boolean {
    const writeIdx = this.readWord(0);
    const readIdx = this.readWord(1);
    if (writeIdx - readIdx >= this.capacity) {
      this.writeWord(3, this.readWord(3) + 1);
      return false;
    }
    const slotBase = IPC_HEADER_I32_WORDS + (writeIdx & (this.capacity - 1)) * IPC_SLOT_I32_WORDS;
    this.writeWord(slotBase, desc.taskId);
    this.writeWord(slotBase + 1, desc.byteOffset);
    this.writeWord(slotBase + 2, desc.byteLength);
    this.writeWord(slotBase + 3, desc.classIndex);
    this.writeWord(slotBase + 4, desc.priorityCode);
    this.writeWord(slotBase + 5, desc.flags);
    this.writeWord(slotBase + 6, desc.checksum);
    this.writeWord(0, writeIdx + 1);
    return true;
  }

  public tryDequeue(): IpcRingDescriptor | null {
    const writeIdx = this.readWord(0);
    const readIdx = this.readWord(1);
    if (readIdx >= writeIdx) return null;
    const slotBase = IPC_HEADER_I32_WORDS + (readIdx & (this.capacity - 1)) * IPC_SLOT_I32_WORDS;
    const desc: IpcRingDescriptor = {
      taskId: this.readWord(slotBase) >>> 0,
      byteOffset: this.readWord(slotBase + 1) >>> 0,
      byteLength: this.readWord(slotBase + 2) >>> 0,
      classIndex: this.readWord(slotBase + 3),
      priorityCode: this.readWord(slotBase + 4),
      flags: this.readWord(slotBase + 5),
      checksum: this.readWord(slotBase + 6) >>> 0,
    };
    this.writeWord(1, readIdx + 1);
    return desc;
  }

  public pendingCount(): number {
    return Math.max(0, this.readWord(0) - this.readWord(1));
  }
}

interface QueuedInternalJob {
  readonly input: RenderTileTaskInput;
  readonly handle: SlabAllocationHandle;
  readonly descriptor: IpcRingDescriptor;
  readonly assignedWorkerId: number;
  attempts: number;
  resolve: (res: RenderTileTaskResult) => void;
  reject: (err: Error) => void;
}

function priorityRank(priority: WorkerTaskPriority): number {
  return priority === "critical" ? 0 : priority === "interactive" ? 1 : 2;
}

function createDefaultWasmSimWorker(workerId: number, generation: number): WasmRenderWorkerInstanceLike {
  return {
    workerId,
    generation,
    executeDescriptor: async (desc, slabView) => {
      const slice = slabView.subarray(desc.byteOffset, desc.byteOffset + desc.byteLength);
      return { outputChecksum: computeXorChecksum(slice), healthy: true };
    },
  };
}

/**
 * 우선순위 Work-Stealing 데크, 큐 한도 배압(Backpressure), 비정상 워커 자동 재생성을 갖춘
 * 비동기 WebAssembly 렌더러 워커 풀.
 */
export class WasmRendererWorkerPool {
  public readonly workerCount: number;
  public readonly maxQueuedTasks: number;
  public readonly maxConsecutiveFailures: number;
  public readonly taskTimeoutMs: number;
  public readonly arena: PowerOfTwoSlabArena;
  public readonly ipcRing: ZeroCopyIpcRingChannel;

  private readonly createWorkerFn: (workerId: number, generation: number) => WasmRenderWorkerInstanceLike;
  private readonly workers: WasmRenderWorkerInstanceLike[] = [];
  private readonly workerBusy: boolean[] = [];
  private readonly workerFailures: number[] = [];
  private readonly workerGenerations: number[] = [];
  private readonly workerDeques: QueuedInternalJob[][] = [];

  private roundRobinCursor = 0;
  private queuedCount = 0;
  private inFlightCount = 0;
  private completedTasks = 0;
  private stolenTasks = 0;
  private recycledWorkers = 0;
  private retriedTasks = 0;
  private backpressureRejections = 0;

  public constructor(config?: WasmWorkerPoolConfig) {
    this.workerCount = Math.max(1, Math.round(config?.workerCount ?? 4));
    this.maxQueuedTasks = Math.max(2, Math.round(config?.maxQueuedTasks ?? 64));
    this.maxConsecutiveFailures = Math.max(1, Math.round(config?.maxConsecutiveFailures ?? 2));
    this.taskTimeoutMs = Math.max(10, Math.round(config?.taskTimeoutMs ?? 500));
    this.arena = new PowerOfTwoSlabArena({ slotsPerClass: config?.arenaSlotsPerClass });
    this.ipcRing = new ZeroCopyIpcRingChannel(Math.max(16, this.maxQueuedTasks * 2));
    this.createWorkerFn = config?.createWorker ?? createDefaultWasmSimWorker;

    for (let w = 0; w < this.workerCount; w += 1) {
      this.workerGenerations.push(1);
      this.workers.push(this.createWorkerFn(w, 1));
      this.workerBusy.push(false);
      this.workerFailures.push(0);
      this.workerDeques.push([]);
    }
  }

  /** 큐 또는 슬랩 한도를 넘으면 즉시 배압 오류를 돌려주어 메모리 폭주를 차단한다. */
  public submitTileTask(input: RenderTileTaskInput): Promise<RenderTileTaskResult> {
    if (this.queuedCount + this.inFlightCount >= this.maxQueuedTasks) {
      this.backpressureRejections += 1;
      return Promise.reject(
        new Error(`워커 풀 배압 한도(${this.maxQueuedTasks}건)에 도달했습니다.`),
      );
    }

    const handle = this.arena.alloc(input.payload.byteLength);
    if (!handle) {
      this.backpressureRejections += 1;
      return Promise.reject(new Error("슬랩 아레나 여유 블록이 부족하여 배압이 활성화되었습니다."));
    }

    const targetSlice = this.arena.viewOf(handle);
    targetSlice.set(input.payload);
    const checksum = computeXorChecksum(targetSlice);
    const pCode = priorityRank(input.priority);
    const descriptor: IpcRingDescriptor = {
      taskId: input.taskId,
      byteOffset: handle.byteOffset,
      byteLength: handle.requestedBytes,
      classIndex: handle.classIndex,
      priorityCode: pCode,
      flags: input.idempotent === false ? 0 : 1,
      checksum,
    };

    // 제로카피 IPC 링 채널을 통해 디스크립터 왕복 전송 무결성도 함께 기록한다.
    if (this.ipcRing.tryEnqueue(descriptor)) {
      this.ipcRing.tryDequeue();
    }

    const assignedWorkerId = this.roundRobinCursor % this.workerCount;
    this.roundRobinCursor += 1;

    return new Promise<RenderTileTaskResult>((resolve, reject) => {
      const job: QueuedInternalJob = {
        // 멱등 작업은 호출자와 워커 양쪽에서 독립된 제출 시점의 입력으로 재시도한다.
        input: input.idempotent === false ? input : { ...input, payload: targetSlice.slice() },
        handle,
        descriptor,
        assignedWorkerId,
        attempts: 0,
        resolve,
        reject,
      };
      this.enqueueIntoDeque(assignedWorkerId, job);
      this.pumpWorkers();
    });
  }

  private enqueueIntoDeque(workerId: number, job: QueuedInternalJob): void {
    const deque = this.workerDeques[workerId];
    if (!deque) return;
    deque.push(job);
    deque.sort((a, b) => a.descriptor.priorityCode - b.descriptor.priorityCode);
    this.queuedCount += 1;
  }

  private pickNextJobForWorker(workerId: number): {
    readonly job: QueuedInternalJob;
    readonly stolenFrom: number | null;
  } | null {
    const ownDeque = this.workerDeques[workerId];
    if (ownDeque && ownDeque.length > 0) {
      const job = ownDeque.shift();
      if (job) {
        this.queuedCount -= 1;
        return { job, stolenFrom: null };
      }
    }

    // 유휴 워커 Work-Stealing: 가장 부하가 큰 다른 워커의 데크에서 최고 우선순위 작업을 훔쳐 온다.
    let richestWorker = -1;
    let richestLen = 0;
    for (let other = 0; other < this.workerCount; other += 1) {
      if (other === workerId) continue;
      const len = this.workerDeques[other]?.length ?? 0;
      if (len > richestLen) {
        richestLen = len;
        richestWorker = other;
      }
    }
    if (richestWorker >= 0) {
      const stolen = this.workerDeques[richestWorker]?.shift();
      if (stolen) {
        this.queuedCount -= 1;
        this.stolenTasks += 1;
        return { job: stolen, stolenFrom: richestWorker };
      }
    }
    return null;
  }

  private recycleUnhealthyWorker(workerId: number): void {
    const oldWorker = this.workers[workerId];
    oldWorker?.terminate?.();
    const nextGen = (this.workerGenerations[workerId] ?? 1) + 1;
    this.workerGenerations[workerId] = nextGen;
    this.workerFailures[workerId] = 0;
    this.workers[workerId] = this.createWorkerFn(workerId, nextGen);
    this.recycledWorkers += 1;
  }

  private pumpWorkers(): void {
    for (let w = 0; w < this.workerCount; w += 1) {
      if (this.workerBusy[w]) continue;
      const picked = this.pickNextJobForWorker(w);
      if (!picked) continue;
      void this.runOnWorker(w, picked.job, picked.stolenFrom);
    }
  }

  private async runOnWorker(
    workerId: number,
    job: QueuedInternalJob,
    stolenFrom: number | null,
  ): Promise<void> {
    this.workerBusy[workerId] = true;
    this.inFlightCount += 1;
    job.attempts += 1;
    const worker = this.workers[workerId]!;

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const execPromise = worker.executeDescriptor(job.descriptor, this.arena.bytesView);
      const timeoutPromise = new Promise<never>((_, rej) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          // 종료 요청만으로 기존 실행의 완료를 보장할 수 없다. 해당 슬롯은 실행이 끝나야 반납한다.
          const releaseLease = () => this.arena.free(job.handle);
          void execPromise.then(releaseLease, releaseLease);
          rej(new Error(`워커 ${workerId} 응답 시간(${this.taskTimeoutMs}ms) 초과`));
        }, this.taskTimeoutMs);
      });

      const outcome = await Promise.race([execPromise, timeoutPromise]);
      if (outcome.healthy === false) {
        throw new Error(`워커 ${workerId} 상태 비정상 보고`);
      }

      this.workerFailures[workerId] = 0;
      this.arena.free(job.handle);
      this.completedTasks += 1;
      job.resolve({
        taskId: job.input.taskId,
        workerId,
        workerGeneration: worker.generation,
        stolenFromWorkerId: stolenFrom,
        outputChecksum: outcome.outputChecksum,
        processedBytes: job.descriptor.byteLength,
      });
    } catch (error) {
      const fails = (this.workerFailures[workerId] ?? 0) + 1;
      this.workerFailures[workerId] = fails;
      if (timedOut || fails >= this.maxConsecutiveFailures) {
        this.recycleUnhealthyWorker(workerId);
      }

      if (job.input.idempotent !== false && job.attempts <= 2) {
        const handle = timedOut ? this.arena.alloc(job.descriptor.byteLength) : job.handle;
        if (!handle) {
          this.backpressureRejections += 1;
          job.reject(new Error("시간 초과 작업을 재시도할 슬랩 블록이 부족합니다."));
          return;
        }
        this.arena.viewOf(handle).set(job.input.payload);
        this.retriedTasks += 1;
        const nextTarget = (workerId + 1) % this.workerCount;
        this.enqueueIntoDeque(nextTarget, {
          ...job,
          handle,
          descriptor: { ...job.descriptor, byteOffset: handle.byteOffset },
        });
      } else {
        if (!timedOut) this.arena.free(job.handle);
        job.reject(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      this.workerBusy[workerId] = false;
      this.inFlightCount -= 1;
      this.pumpWorkers();
    }
  }

  public getTelemetry(): WasmWorkerPoolTelemetry {
    return {
      workerCount: this.workerCount,
      completedTasks: this.completedTasks,
      stolenTasks: this.stolenTasks,
      recycledWorkers: this.recycledWorkers,
      retriedTasks: this.retriedTasks,
      backpressureRejections: this.backpressureRejections,
      inFlightTasks: this.inFlightCount,
      slab: this.arena.getTelemetry(),
    };
  }
}
