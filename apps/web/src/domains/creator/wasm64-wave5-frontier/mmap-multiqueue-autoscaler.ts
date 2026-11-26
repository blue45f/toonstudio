/**
 * 크로스플랫폼 OPFS `SyncAccessHandle` 기반 64 KiB 정렬 제로카피 가상 메모리 윈도 매퍼,
 * WebGPU 멀티-큐(Graphics · Async Compute · Copy) 타임라인 펜스 동기화기,
 * 그리고 서버 비용 `₩0` 클라이언트-로컬 및 P2P 렌더 부하 오토스케일러.
 *
 * 주의: 루트 `tsconfig.json`(`target: "ES2017"`) 호환을 위해 BigInt 리터럴(`0n`)을 쓰지 않고
 * 모든 64비트 오프셋과 타임라인 펜스 값을 `BigInt(...)` 생성자로만 다룬다.
 */

export const MMAP_PAGE_SIZE_BYTES = 65536;
export const DEFAULT_TARGET_FRAME_MS = 16.67;

const ZERO_U64 = BigInt(0);
const ONE_U64 = BigInt(1);
const PAGE_BYTES_U64 = BigInt(MMAP_PAGE_SIZE_BYTES);

export type MmapAccessMode = "readonly" | "readwrite";
export type GpuQueueKind = "graphics" | "compute" | "copy";
export type ResourceAccessMode = "read" | "write";
export type AutoscaleActionKind = "scale-up-local" | "delegate-p2p" | "scale-down" | "hold";

/** OPFS `FileSystemSyncAccessHandle`과 구조적으로 호환되는 동기 페이지 저장소 포트. */
export interface SyncAccessHandleLike {
  read(buffer: Uint8Array, options?: { readonly at?: number }): number;
  write(buffer: Uint8Array, options?: { readonly at?: number }): number;
  flush(): void;
  getSize(): number;
  truncate(newSize: number): void;
  close(): void;
}

export interface MmapWriteSpanRecord {
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly pageCount: number;
}

export interface MmapWindowTelemetry {
  readonly residentPages: number;
  readonly dirtyPages: number;
  readonly pinnedPages: number;
  readonly pageFaults: number;
  readonly zeroCopyHits: number;
  readonly dirtyPagesFlushed: number;
  readonly coalescedWriteCalls: number;
  readonly savedWriteSyscalls: number;
  readonly serverCostKrw: 0;
}

export interface MappedPageWindow {
  readonly virtualPageIndex: bigint;
  readonly byteOffsetInPage: number;
  readonly view: Uint8Array;
  readonly zeroCopySlabBacked: true;
}

export interface TimelineFenceWait {
  readonly queue: GpuQueueKind;
  readonly fenceValue: bigint;
}

export interface ResourceHazardDecl {
  readonly resourceId: string;
  readonly access: ResourceAccessMode;
}

export interface GpuQueueSubmissionSpec {
  readonly label: string;
  readonly queue: GpuQueueKind;
  readonly waits?: readonly TimelineFenceWait[];
  readonly resources?: readonly ResourceHazardDecl[];
}

export interface ScheduledGpuSubmission {
  readonly submissionId: string;
  readonly label: string;
  readonly queue: GpuQueueKind;
  readonly signalFenceValue: bigint;
  readonly resolvedWaits: readonly TimelineFenceWait[];
}

export interface MultiQueueBatchResult {
  readonly accepted: boolean;
  readonly deadlockReasonKo: string | null;
  readonly submissions: readonly ScheduledGpuSubmission[];
  readonly topologicalOrderIds: readonly string[];
  readonly serverCostKrw: 0;
}

export interface P2pHelperPeerStat {
  readonly peerId: string;
  readonly rttMs: number;
  readonly availableSlots: number;
  readonly trustedSameSession: boolean;
}

export interface RenderFrameLoadSample {
  readonly frameDurationMs: number;
  readonly queueDepthTiles: number;
  readonly thermalHeadroom01?: number;
  readonly peers?: readonly P2pHelperPeerStat[];
}

export interface P2pShardAssignment {
  readonly peerId: string;
  readonly assignedTiles: number;
  readonly estimatedTransferMs: number;
}

export interface RenderAutoscaleDecision {
  readonly action: AutoscaleActionKind;
  readonly ewmaFrameMs: number;
  readonly p95FrameMs: number;
  readonly localWorkerCount: number;
  readonly activeP2pPeerCount: number;
  readonly localAssignedTiles: number;
  readonly p2pAssignedTiles: number;
  readonly p2pShardRatio: number;
  readonly peerAssignments: readonly P2pShardAssignment[];
  readonly cloudFallbackUsed: false;
  readonly serverCostKrw: 0;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function toNonNegativeBigInt(value: bigint | number): bigint {
  if (typeof value === "bigint") {
    if (value < ZERO_U64) throw new RangeError("가상 오프셋 및 펜스 값은 음수일 수 없습니다.");
    return value;
  }
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new RangeError(`유효하지 않은 정수 오프셋입니다: ${value}`);
  }
  return BigInt(value);
}

/** 테스트 및 비-OPFS 런타임용 메모리 기반 `SyncAccessHandleLike` 구현체. */
export class InMemorySyncAccessHandle implements SyncAccessHandleLike {
  private storage: Uint8Array;
  private logicalSize: number;
  private closed = false;
  public readSyscalls = 0;
  public writeSyscalls = 0;
  public flushSyscalls = 0;
  public readonly writeHistory: MmapWriteSpanRecord[] = [];

  public constructor(initialBytes: number = 0) {
    const cap = Math.max(MMAP_PAGE_SIZE_BYTES, initialBytes);
    this.storage = new Uint8Array(cap);
    this.logicalSize = Math.max(0, initialBytes);
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error("동기 페이지 핸들이 이미 닫혔습니다.");
  }

  private ensureCapacity(required: number): void {
    if (required <= this.storage.byteLength) return;
    let nextCap = this.storage.byteLength;
    while (nextCap < required) nextCap *= 2;
    const grown = new Uint8Array(nextCap);
    grown.set(this.storage.subarray(0, this.logicalSize), 0);
    this.storage = grown;
  }

  public read(buffer: Uint8Array, options?: { readonly at?: number }): number {
    this.ensureOpen();
    this.readSyscalls += 1;
    const at = Math.max(0, Math.floor(options?.at ?? 0));
    if (at >= this.logicalSize) return 0;
    const readable = Math.min(buffer.byteLength, this.logicalSize - at);
    buffer.set(this.storage.subarray(at, at + readable), 0);
    return readable;
  }

  public write(buffer: Uint8Array, options?: { readonly at?: number }): number {
    this.ensureOpen();
    this.writeSyscalls += 1;
    const at = Math.max(0, Math.floor(options?.at ?? 0));
    const end = at + buffer.byteLength;
    this.ensureCapacity(end);
    this.storage.set(buffer, at);
    if (end > this.logicalSize) this.logicalSize = end;
    this.writeHistory.push({
      byteOffset: at,
      byteLength: buffer.byteLength,
      pageCount: Math.ceil(buffer.byteLength / MMAP_PAGE_SIZE_BYTES),
    });
    return buffer.byteLength;
  }

  public flush(): void {
    this.ensureOpen();
    this.flushSyscalls += 1;
  }

  public getSize(): number {
    this.ensureOpen();
    return this.logicalSize;
  }

  public truncate(newSize: number): void {
    this.ensureOpen();
    const clamped = Math.max(0, Math.floor(newSize));
    this.ensureCapacity(clamped);
    if (clamped < this.logicalSize) this.storage.fill(0, clamped, this.logicalSize);
    this.logicalSize = clamped;
  }

  public close(): void {
    this.closed = true;
  }
}

interface ResidentSlot {
  readonly slotIndex: number;
  readonly fullPageView: Uint8Array;
  virtualPageIndex: bigint | null;
  dirty: boolean;
  pinCount: number;
  lastUsedTick: number;
}

/**
 * 64 KiB 정렬 단일 `ArrayBuffer` 슬랩 위에서 제로카피 서브뷰 매핑과 연속 더티 페이지 병합 쓰기를 수행한다.
 */
export class PageAlignedMmapWindowManager {
  public readonly slabBuffer: ArrayBuffer;
  private readonly backing: SyncAccessHandleLike;
  private readonly slots: ResidentSlot[];
  private readonly pageTable = new Map<bigint, ResidentSlot>();
  private clockTick = 0;
  private pageFaults = 0;
  private zeroCopyHits = 0;
  private dirtyPagesFlushed = 0;
  private coalescedWriteCalls = 0;
  private savedWriteSyscalls = 0;

  public constructor(backing: SyncAccessHandleLike, maxResidentPages: number = 16) {
    if (!Number.isInteger(maxResidentPages) || maxResidentPages < 2) {
      throw new RangeError(`상주 페이지 슬롯 수는 최소 2 이상이어야 합니다: ${maxResidentPages}`);
    }
    this.backing = backing;
    this.slabBuffer = new ArrayBuffer(maxResidentPages * MMAP_PAGE_SIZE_BYTES);
    this.slots = [];
    for (let i = 0; i < maxResidentPages; i += 1) {
      this.slots.push({
        slotIndex: i,
        fullPageView: new Uint8Array(this.slabBuffer, i * MMAP_PAGE_SIZE_BYTES, MMAP_PAGE_SIZE_BYTES),
        virtualPageIndex: null,
        dirty: false,
        pinCount: 0,
        lastUsedTick: 0,
      });
    }
  }

  private writeSingleSlotIfDirty(slot: ResidentSlot): void {
    if (!slot.dirty || slot.virtualPageIndex === null) return;
    const byteOffset = Number(slot.virtualPageIndex * PAGE_BYTES_U64);
    this.backing.write(slot.fullPageView, { at: byteOffset });
    slot.dirty = false;
    this.dirtyPagesFlushed += 1;
    this.coalescedWriteCalls += 1;
  }

  private acquireSlot(virtualPageIndex: bigint): ResidentSlot {
    const hit = this.pageTable.get(virtualPageIndex);
    if (hit) {
      this.zeroCopyHits += 1;
      this.clockTick += 1;
      hit.lastUsedTick = this.clockTick;
      return hit;
    }

    this.pageFaults += 1;
    let victim: ResidentSlot | null = null;
    for (const slot of this.slots) {
      if (slot.virtualPageIndex === null) { victim = slot; break; }
      if (slot.pinCount === 0 && (victim === null || slot.lastUsedTick < victim.lastUsedTick)) {
        victim = slot;
      }
    }
    if (victim === null) {
      throw new Error("모든 상주 메모리 페이지가 고정(pin)되어 교체할 슬롯이 없습니다.");
    }
    if (victim.virtualPageIndex !== null) {
      this.writeSingleSlotIfDirty(victim);
      this.pageTable.delete(victim.virtualPageIndex);
    }

    victim.fullPageView.fill(0);
    const diskOffset = Number(virtualPageIndex * PAGE_BYTES_U64);
    this.backing.read(victim.fullPageView, { at: diskOffset });
    victim.virtualPageIndex = virtualPageIndex;
    victim.dirty = false;
    victim.pinCount = 0;
    this.clockTick += 1;
    victim.lastUsedTick = this.clockTick;
    this.pageTable.set(virtualPageIndex, victim);
    return victim;
  }

  /** 가상 바이트 오프셋에 대응하는 제로카피 `Uint8Array` 윈도를 매핑한다. */
  public mapWindow(
    virtualByteOffset: bigint | number,
    byteLength?: number,
    mode: MmapAccessMode = "readonly",
  ): MappedPageWindow {
    const offset = toNonNegativeBigInt(virtualByteOffset);
    const virtualPageIndex = offset / PAGE_BYTES_U64;
    const byteOffsetInPage = Number(offset % PAGE_BYTES_U64);
    const len = byteLength ?? (MMAP_PAGE_SIZE_BYTES - byteOffsetInPage);
    if (len <= 0 || byteOffsetInPage + len > MMAP_PAGE_SIZE_BYTES) {
      throw new RangeError(`윈도 범위(${byteOffsetInPage} + ${len})가 단일 64 KiB 페이지 경계를 넘습니다.`);
    }
    const slot = this.acquireSlot(virtualPageIndex);
    if (mode === "readwrite") slot.dirty = true;
    const view = new Uint8Array(
      this.slabBuffer,
      slot.slotIndex * MMAP_PAGE_SIZE_BYTES + byteOffsetInPage,
      len,
    );
    return { virtualPageIndex, byteOffsetInPage, view, zeroCopySlabBacked: true };
  }

  public markPageDirty(virtualPageIndex: bigint | number): void {
    const slot = this.pageTable.get(toNonNegativeBigInt(virtualPageIndex));
    if (slot) slot.dirty = true;
  }

  public pinPage(virtualPageIndex: bigint | number): void {
    const slot = this.acquireSlot(toNonNegativeBigInt(virtualPageIndex));
    slot.pinCount += 1;
  }

  public unpinPage(virtualPageIndex: bigint | number): void {
    const slot = this.pageTable.get(toNonNegativeBigInt(virtualPageIndex));
    if (slot && slot.pinCount > 0) slot.pinCount -= 1;
  }

  /** 인접한 더티 가상 페이지 구간 `[p..p+k]`를 단일 연속 `write()` 호출로 병합해 디스크에 반영한다. */
  public flushDirtyPages(): { readonly flushedPages: number; readonly writeCalls: number; readonly savedSyscalls: number } {
    const dirtySlots = [...this.pageTable.values()]
      .filter((s) => s.dirty && s.virtualPageIndex !== null)
      .sort((a, b) => (a.virtualPageIndex! < b.virtualPageIndex! ? -1 : a.virtualPageIndex! > b.virtualPageIndex! ? 1 : 0));
    if (dirtySlots.length === 0) return { flushedPages: 0, writeCalls: 0, savedSyscalls: 0 };

    let writeCalls = 0;
    let saved = 0;
    let runStart = 0;
    while (runStart < dirtySlots.length) {
      let runEnd = runStart + 1;
      while (
        runEnd < dirtySlots.length &&
        dirtySlots[runEnd]!.virtualPageIndex! === dirtySlots[runEnd - 1]!.virtualPageIndex! + ONE_U64
      ) {
        runEnd += 1;
      }
      const runLen = runEnd - runStart;
      const startOffset = Number(dirtySlots[runStart]!.virtualPageIndex! * PAGE_BYTES_U64);

      if (runLen === 1) {
        const single = dirtySlots[runStart]!;
        this.backing.write(single.fullPageView, { at: startOffset });
        single.dirty = false;
      } else {
        // 슬랩 내 슬롯 인덱스까지 연속이면 복사 없이 슬랩 뷰를 바로 기록하고, 아니면 병합 버퍼로 1회 호출
        let slabContiguous = true;
        for (let k = runStart + 1; k < runEnd; k += 1) {
          if (dirtySlots[k]!.slotIndex !== dirtySlots[k - 1]!.slotIndex + 1) {
            slabContiguous = false;
            break;
          }
        }
        if (slabContiguous) {
          const directRunView = new Uint8Array(
            this.slabBuffer,
            dirtySlots[runStart]!.slotIndex * MMAP_PAGE_SIZE_BYTES,
            runLen * MMAP_PAGE_SIZE_BYTES,
          );
          this.backing.write(directRunView, { at: startOffset });
        } else {
          const coalesced = new Uint8Array(runLen * MMAP_PAGE_SIZE_BYTES);
          for (let k = 0; k < runLen; k += 1) {
            coalesced.set(dirtySlots[runStart + k]!.fullPageView, k * MMAP_PAGE_SIZE_BYTES);
          }
          this.backing.write(coalesced, { at: startOffset });
        }
        for (let k = runStart; k < runEnd; k += 1) dirtySlots[k]!.dirty = false;
        saved += runLen - 1;
      }
      writeCalls += 1;
      runStart = runEnd;
    }

    this.backing.flush();
    this.dirtyPagesFlushed += dirtySlots.length;
    this.coalescedWriteCalls += writeCalls;
    this.savedWriteSyscalls += saved;
    return { flushedPages: dirtySlots.length, writeCalls, savedSyscalls: saved };
  }

  public getTelemetry(): MmapWindowTelemetry {
    let dirtyPages = 0;
    let pinnedPages = 0;
    for (const s of this.pageTable.values()) {
      if (s.dirty) dirtyPages += 1;
      if (s.pinCount > 0) pinnedPages += 1;
    }
    return {
      residentPages: this.pageTable.size,
      dirtyPages,
      pinnedPages,
      pageFaults: this.pageFaults,
      zeroCopyHits: this.zeroCopyHits,
      dirtyPagesFlushed: this.dirtyPagesFlushed,
      coalescedWriteCalls: this.coalescedWriteCalls,
      savedWriteSyscalls: this.savedWriteSyscalls,
      serverCostKrw: 0,
    };
  }
}

interface ResourceAccessState {
  lastWrite: { readonly queue: GpuQueueKind; readonly fenceValue: bigint } | null;
  lastReads: Map<GpuQueueKind, bigint>;
}

/**
 * Graphics · Async Compute · Copy 3개 큐의 단조 타임라인 펜스와 리소스 해저드(RAW/WAR/WAW)를 추적하며
 * 제출 전에 위상 정렬로 교차 큐 데드락을 무결점 차단하는 동기화기.
 */
export class WebGpuMultiQueueFenceSynchronizer {
  private readonly submittedFence: Record<GpuQueueKind, bigint> = {
    graphics: ZERO_U64, compute: ZERO_U64, copy: ZERO_U64,
  };
  private readonly completedFence: Record<GpuQueueKind, bigint> = {
    graphics: ZERO_U64, compute: ZERO_U64, copy: ZERO_U64,
  };
  private readonly pending = new Map<string, ScheduledGpuSubmission>();
  private readonly resourceState = new Map<string, ResourceAccessState>();
  private nextSeq = 1;

  public getSubmittedFence(queue: GpuQueueKind): bigint {
    return this.submittedFence[queue];
  }

  public getCompletedFence(queue: GpuQueueKind): bigint {
    return this.completedFence[queue];
  }

  /** 단일 또는 복수 큐 작업 배치를 원자적으로 검증(미제출 펜스 대기 및 순환 대기 차단) 후 등록한다. */
  public submitBatch(specs: readonly GpuQueueSubmissionSpec[]): MultiQueueBatchResult {
    if (specs.length === 0) {
      return { accepted: true, deadlockReasonKo: null, submissions: [], topologicalOrderIds: [], serverCostKrw: 0 };
    }

    const tempSubmitted: Record<GpuQueueKind, bigint> = { ...this.submittedFence };
    const tempResources = new Map<string, ResourceAccessState>();
    for (const [resId, st] of this.resourceState) {
      tempResources.set(resId, { lastWrite: st.lastWrite, lastReads: new Map(st.lastReads) });
    }

    const drafted: ScheduledGpuSubmission[] = [];
    for (let i = 0; i < specs.length; i += 1) {
      const spec = specs[i]!;
      const nextFence = tempSubmitted[spec.queue] + ONE_U64;
      tempSubmitted[spec.queue] = nextFence;

      const waitMap = new Map<GpuQueueKind, bigint>();
      const mergeWait = (q: GpuQueueKind, fv: bigint): void => {
        if (fv < ZERO_U64) throw new RangeError("대기 펜스 값은 음수일 수 없습니다.");
        if (q === spec.queue || fv <= this.completedFence[q]) return;
        const prev = waitMap.get(q);
        if (prev === undefined || fv > prev) waitMap.set(q, fv);
      };

      for (const w of spec.waits ?? []) mergeWait(w.queue, w.fenceValue);

      // 리소스 RAW / WAR / WAW 교차 큐 자동 해저드 펜스 합성
      for (const res of spec.resources ?? []) {
        let entry = tempResources.get(res.resourceId);
        if (!entry) {
          entry = { lastWrite: null, lastReads: new Map() };
          tempResources.set(res.resourceId, entry);
        }
        if (res.access === "read") {
          if (entry.lastWrite && entry.lastWrite.queue !== spec.queue) {
            mergeWait(entry.lastWrite.queue, entry.lastWrite.fenceValue);
          }
          entry.lastReads.set(spec.queue, nextFence);
        } else {
          if (entry.lastWrite && entry.lastWrite.queue !== spec.queue) {
            mergeWait(entry.lastWrite.queue, entry.lastWrite.fenceValue);
          }
          for (const [readerQ, readerFv] of entry.lastReads) {
            if (readerQ !== spec.queue) mergeWait(readerQ, readerFv);
          }
          entry.lastReads.clear();
          entry.lastWrite = { queue: spec.queue, fenceValue: nextFence };
        }
      }

      const resolvedWaits: TimelineFenceWait[] = [...waitMap.entries()].map(([queue, fenceValue]) => ({
        queue,
        fenceValue,
      }));
      drafted.push({
        submissionId: `sub-${this.nextSeq + i}`,
        label: spec.label,
        queue: spec.queue,
        signalFenceValue: nextFence,
        resolvedWaits,
      });
    }

    // 검증 1: 배치 완료 시점에도 신호 생산자가 없는 미래 펜스 대기 차단
    for (const sub of drafted) {
      for (const w of sub.resolvedWaits) {
        if (w.fenceValue > tempSubmitted[w.queue]) {
          return {
            accepted: false,
            deadlockReasonKo: `${sub.label}(${sub.queue}) 작업이 제출되지 않은 ${w.queue} 펜스(${w.fenceValue.toString()})를 대기합니다.`,
            submissions: [],
            topologicalOrderIds: [],
            serverCostKrw: 0,
          };
        }
      }
    }

    // 검증 2: 미완료 제출 + 신규 배치 전체에 대해 동일 큐 순서 간선과 교차 큐 펜스 간선을 포함한 Kahn 위상 정렬 수행
    const allNodes: ScheduledGpuSubmission[] = [...this.pending.values(), ...drafted];
    const adj = new Map<string, Set<string>>();
    const inDeg = new Map<string, number>();
    for (const n of allNodes) {
      adj.set(n.submissionId, new Set());
      inDeg.set(n.submissionId, 0);
    }
    const addEdge = (fromId: string, toId: string): void => {
      if (fromId === toId) return;
      const targets = adj.get(fromId)!;
      if (!targets.has(toId)) {
        targets.add(toId);
        inDeg.set(toId, (inDeg.get(toId) ?? 0) + 1);
      }
    };

    for (const q of ["graphics", "compute", "copy"] as const) {
      const qNodes = allNodes
        .filter((n) => n.queue === q)
        .sort((a, b) => (a.signalFenceValue < b.signalFenceValue ? -1 : a.signalFenceValue > b.signalFenceValue ? 1 : 0));
      for (let i = 1; i < qNodes.length; i += 1) {
        addEdge(qNodes[i - 1]!.submissionId, qNodes[i]!.submissionId);
      }
    }

    for (const consumer of allNodes) {
      for (const w of consumer.resolvedWaits) {
        for (const candidate of allNodes) {
          if (candidate.queue === w.queue && candidate.signalFenceValue <= w.fenceValue) {
            addEdge(candidate.submissionId, consumer.submissionId);
          }
        }
      }
    }

    const readyQueue: string[] = [];
    for (const [id, deg] of inDeg) if (deg === 0) readyQueue.push(id);
    const topoOrder: string[] = [];
    while (readyQueue.length > 0) {
      const cur = readyQueue.shift()!;
      topoOrder.push(cur);
      for (const nxt of adj.get(cur) ?? []) {
        const nextDeg = (inDeg.get(nxt) ?? 1) - 1;
        inDeg.set(nxt, nextDeg);
        if (nextDeg === 0) readyQueue.push(nxt);
      }
    }

    if (topoOrder.length !== allNodes.length) {
      return {
        accepted: false,
        deadlockReasonKo: "교차 큐 타임라인 펜스 순환 대기(데드락)가 감지되어 제출을 거부했습니다.",
        submissions: [],
        topologicalOrderIds: [],
        serverCostKrw: 0,
      };
    }

    // 무결성 통과: 상태 커밋
    this.submittedFence.graphics = tempSubmitted.graphics;
    this.submittedFence.compute = tempSubmitted.compute;
    this.submittedFence.copy = tempSubmitted.copy;
    this.resourceState.clear();
    for (const [k, v] of tempResources) this.resourceState.set(k, v);
    for (const sub of drafted) this.pending.set(sub.submissionId, sub);
    this.nextSeq += drafted.length;

    return {
      accepted: true,
      deadlockReasonKo: null,
      submissions: drafted,
      topologicalOrderIds: topoOrder,
      serverCostKrw: 0,
    };
  }

  /** 특정 큐의 GPU 완료 타임라인 펜스를 단조 전진시키고 은퇴한 제출을 정리한다. */
  public completeUpTo(queue: GpuQueueKind, completedValue: bigint | number): bigint {
    const val = toNonNegativeBigInt(completedValue);
    if (val < this.completedFence[queue]) {
      throw new RangeError(`완료 펜스는 역행할 수 없습니다: ${val.toString()} < ${this.completedFence[queue].toString()}`);
    }
    if (val > this.submittedFence[queue]) {
      throw new RangeError(`제출된 펜스(${this.submittedFence[queue].toString()})보다 큰 완료 값은 설정할 수 없습니다.`);
    }
    this.completedFence[queue] = val;
    for (const [id, sub] of this.pending) {
      if (sub.queue === queue && sub.signalFenceValue <= val) {
        this.pending.delete(id);
      }
    }
    return val;
  }
}

export interface ClientP2pAutoscalerOptions {
  readonly minLocalWorkers?: number;
  readonly maxLocalWorkers?: number;
  readonly maxP2pPeers?: number;
  readonly targetFrameMs?: number;
  readonly ewmaAlpha?: number;
  readonly maxPeerRttMs?: number;
  readonly cooldownFrames?: number;
}

/**
 * 프레임 시간 EWMA·큐 깊이·발열 여유도에 따라 로컬 Worker 동시성과 신뢰된 P2P 헬퍼 샤드 위임을
 * 서버 비용 `₩0` 범위 안에서 자동 조절하는 오토스케일러.
 */
export class ClientLocalP2pRenderAutoscaler {
  private readonly minWorkers: number;
  private readonly maxWorkers: number;
  private readonly maxPeers: number;
  private readonly targetFrameMs: number;
  private readonly ewmaAlpha: number;
  private readonly maxPeerRttMs: number;
  private readonly cooldownFrames: number;
  private localWorkers: number;
  private ewmaFrameMs: number | null = null;
  private readonly recentFrames: number[] = [];
  private lowLoadStreak = 0;

  public constructor(options: ClientP2pAutoscalerOptions = {}) {
    this.minWorkers = Math.max(1, Math.floor(options.minLocalWorkers ?? 1));
    this.maxWorkers = Math.max(this.minWorkers, Math.floor(options.maxLocalWorkers ?? 8));
    this.maxPeers = Math.max(0, Math.floor(options.maxP2pPeers ?? 4));
    this.targetFrameMs = Math.max(4, options.targetFrameMs ?? DEFAULT_TARGET_FRAME_MS);
    this.ewmaAlpha = clamp(options.ewmaAlpha ?? 0.28, 0.05, 0.9);
    this.maxPeerRttMs = Math.max(5, options.maxPeerRttMs ?? 45);
    this.cooldownFrames = Math.max(1, Math.floor(options.cooldownFrames ?? 3));
    this.localWorkers = Math.min(2, this.maxWorkers);
  }

  public step(sample: RenderFrameLoadSample): RenderAutoscaleDecision {
    const frameMs = Math.max(0.1, sample.frameDurationMs);
    this.ewmaFrameMs = this.ewmaFrameMs === null
      ? frameMs
      : this.ewmaAlpha * frameMs + (1 - this.ewmaAlpha) * this.ewmaFrameMs;
    this.recentFrames.push(frameMs);
    if (this.recentFrames.length > 32) this.recentFrames.shift();
    const sorted = [...this.recentFrames].sort((a, b) => a - b);
    const p95FrameMs = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? frameMs;

    const thermal = clamp(sample.thermalHeadroom01 ?? 1.0, 0.1, 1.0);
    const thermalWorkerCap = Math.max(this.minWorkers, Math.round(this.maxWorkers * thermal));
    const queueTiles = Math.max(0, Math.floor(sample.queueDepthTiles));
    const overloaded = this.ewmaFrameMs > this.targetFrameMs * 1.05 || queueTiles > this.localWorkers * 3;
    const underloaded = this.ewmaFrameMs < this.targetFrameMs * 0.62 && queueTiles <= this.localWorkers;

    let action: AutoscaleActionKind = "hold";
    if (overloaded) {
      this.lowLoadStreak = 0;
      if (this.localWorkers < thermalWorkerCap) {
        const jump = this.ewmaFrameMs > this.targetFrameMs * 1.6 ? 2 : 1;
        this.localWorkers = Math.min(thermalWorkerCap, this.localWorkers + jump);
        action = "scale-up-local";
      }
    } else if (underloaded) {
      this.lowLoadStreak += 1;
      if (this.lowLoadStreak >= this.cooldownFrames && this.localWorkers > this.minWorkers) {
        this.localWorkers = Math.max(this.minWorkers, this.localWorkers - 1);
        this.lowLoadStreak = 0;
        action = "scale-down";
      }
    } else {
      this.lowLoadStreak = 0;
    }
    if (this.localWorkers > thermalWorkerCap) this.localWorkers = thermalWorkerCap;

    // 로컬 워커가 상한에 도달했는데도 부하가 남을 때만 동일 세션 저지연 P2P 피어에게 샤드 위임
    const eligiblePeers = (sample.peers ?? [])
      .filter((p) => p.trustedSameSession && p.availableSlots > 0 && p.rttMs <= this.maxPeerRttMs)
      .sort((a, b) => a.rttMs - b.rttMs)
      .slice(0, this.maxPeers);

    const peerAssignments: P2pShardAssignment[] = [];
    let p2pTiles = 0;
    const localCapacityTiles = this.localWorkers * 2;
    if (overloaded && this.localWorkers >= thermalWorkerCap && queueTiles > localCapacityTiles && eligiblePeers.length > 0) {
      let delegatable = Math.min(Math.floor(queueTiles * 0.55), queueTiles - localCapacityTiles);
      for (const peer of eligiblePeers) {
        if (delegatable <= 0) break;
        const give = Math.min(delegatable, peer.availableSlots * 2);
        if (give > 0) {
          peerAssignments.push({
            peerId: peer.peerId,
            assignedTiles: give,
            estimatedTransferMs: peer.rttMs * 0.5 + give * 0.35,
          });
          p2pTiles += give;
          delegatable -= give;
        }
      }
      if (p2pTiles > 0) action = "delegate-p2p";
    }

    const localAssignedTiles = Math.max(0, queueTiles - p2pTiles);
    return {
      action,
      ewmaFrameMs: this.ewmaFrameMs,
      p95FrameMs,
      localWorkerCount: this.localWorkers,
      activeP2pPeerCount: peerAssignments.length,
      localAssignedTiles,
      p2pAssignedTiles: p2pTiles,
      p2pShardRatio: queueTiles > 0 ? p2pTiles / queueTiles : 0,
      peerAssignments,
      cloudFallbackUsed: false,
      serverCostKrw: 0,
    };
  }
}
