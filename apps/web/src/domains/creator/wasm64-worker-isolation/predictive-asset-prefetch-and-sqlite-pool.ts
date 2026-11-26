/**
 * 우선순위 기반 예측 에셋 프리페처(`PredictiveAssetPrefetcher`) 및
 * SQLite-WASM 단일 라이터 / 풀드 리더 스케줄러(`SqliteWasmConnectionPool`).
 *
 * - 프리페처: `viewport > next-cut > brush-preset > background-idle` 우선순위 스케줄링,
 *   진행 중 요청 중복 제거 + 우선순위 승격, 핀 고정 베이스 에셋(LRU 퇴출 면제) 2계층(RAM + OPFS/CacheStorage) 캐시.
 * - SQLite-WASM 풀: 제한된 리더 슬롯 병렬 실행 + 단일 라이터 상호 배타 직렬화 +
 *   교대 턴(anti-starvation) 공정성으로 OPFS `SQLITE_BUSY` 락 경합과 리더/라이터 기아를 방지한다.
 */

export type PrefetchPriority = "viewport" | "next-cut" | "brush-preset" | "background-idle";

export const PREFETCH_PRIORITY_RANK: Readonly<Record<PrefetchPriority, number>> = {
  viewport: 0, "next-cut": 1, "brush-preset": 2, "background-idle": 3,
};

export interface PersistentAssetCacheAdapter {
  get(url: string): Promise<Uint8Array | null> | Uint8Array | null;
  put(url: string, data: Uint8Array): Promise<void> | void;
  delete?(url: string): Promise<void> | void;
}

export interface PrefetchAssetOptions { readonly priority?: PrefetchPriority; readonly pin?: boolean }

export interface PrefetchAssetResult {
  readonly url: string; readonly data: Uint8Array; readonly byteLength: number;
  readonly source: "ram" | "persistent" | "network"; readonly pinned: boolean; readonly deduplicated: boolean;
}

export interface PredictiveAssetPrefetcherOptions {
  readonly fetcher: (url: string) => Promise<Uint8Array | ArrayBuffer>;
  readonly persistentCache?: PersistentAssetCacheAdapter;
  readonly maxConcurrency?: number; readonly maxRamBytes?: number;
  readonly maxPrefetchBytes?: number; readonly autoPinHitThreshold?: number;
}

export interface PredictiveAssetPrefetcherStats {
  readonly ramBytesUsed: number; readonly maxRamBytes: number; readonly pinnedBytes: number;
  readonly entryCount: number; readonly pinnedCount: number; readonly inFlightCount: number;
  readonly queuedCount: number; readonly cacheHits: number; readonly persistentHits: number;
  readonly networkFetches: number; readonly networkBytesFetched: number;
  readonly deduplicatedRequests: number; readonly evictions: number; readonly disposed: boolean;
}

interface RamEntry { readonly data: Uint8Array; readonly byteLength: number; pinned: boolean; hitCount: number }
interface PrefetchJob {
  readonly url: string; priority: PrefetchPriority; pin: boolean; readonly enqueueSeq: number; started: boolean;
  readonly promise: Promise<PrefetchAssetResult>;
  readonly resolve: (value: PrefetchAssetResult) => void;
  readonly reject: (reason?: unknown) => void;
}

const nowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

export class PredictiveAssetPrefetcher {
  private readonly fetcher: (url: string) => Promise<Uint8Array | ArrayBuffer>;
  private readonly persistentCache?: PersistentAssetCacheAdapter;
  private readonly maxConcurrency: number;
  private readonly maxRamBytes: number;
  private readonly maxPrefetchBytes: number;
  private readonly autoPinHitThreshold: number;
  private readonly ramCache = new Map<string, RamEntry>();
  private readonly pendingByUrl = new Map<string, PrefetchJob>();
  private readonly queue: PrefetchJob[] = [];
  private enqueueSeq = 0;
  private disposed = false;
  private readonly counters = {
    inFlight: 0, ramBytes: 0, cacheHits: 0, persistentHits: 0,
    networkFetches: 0, networkBytes: 0, deduplicated: 0, evictions: 0,
  };

  constructor(options: PredictiveAssetPrefetcherOptions) {
    const maxConcurrency = options.maxConcurrency ?? 4;
    const maxRamBytes = options.maxRamBytes ?? 32 * 1024 * 1024;
    if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1) throw new RangeError(`Invalid maxConcurrency: ${maxConcurrency}`);
    if (!Number.isFinite(maxRamBytes) || maxRamBytes <= 0) throw new RangeError(`Invalid maxRamBytes: ${maxRamBytes}`);
    this.fetcher = options.fetcher;
    this.persistentCache = options.persistentCache;
    this.maxConcurrency = maxConcurrency;
    this.maxRamBytes = maxRamBytes;
    this.maxPrefetchBytes = options.maxPrefetchBytes ?? Number.POSITIVE_INFINITY;
    this.autoPinHitThreshold = Math.max(0, Math.trunc(options.autoPinHitThreshold ?? 0));
  }

  prefetch(url: string, options: PrefetchAssetOptions = {}): Promise<PrefetchAssetResult> {
    if (this.disposed) return Promise.reject(new Error("PredictiveAssetPrefetcher disposed"));
    const priority = options.priority ?? "background-idle";
    const wantPin = options.pin ?? false;

    const cached = this.ramCache.get(url);
    if (cached) {
      this.ramCache.delete(url);
      cached.hitCount += 1;
      if (wantPin || (this.autoPinHitThreshold > 0 && cached.hitCount >= this.autoPinHitThreshold)) cached.pinned = true;
      this.ramCache.set(url, cached);
      this.counters.cacheHits += 1;
      return Promise.resolve({
        url, data: cached.data, byteLength: cached.byteLength, source: "ram", pinned: cached.pinned, deduplicated: false,
      });
    }

    const existing = this.pendingByUrl.get(url);
    if (existing) {
      this.counters.deduplicated += 1;
      if (wantPin) existing.pin = true;
      if (!existing.started && PREFETCH_PRIORITY_RANK[priority] < PREFETCH_PRIORITY_RANK[existing.priority]) {
        existing.priority = priority;
      }
      return existing.promise.then((res) => ({ ...res, pinned: existing.pin || res.pinned, deduplicated: true }));
    }

    let resolveFn!: (value: PrefetchAssetResult) => void;
    let rejectFn!: (reason?: unknown) => void;
    const promise = new Promise<PrefetchAssetResult>((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });
    const job: PrefetchJob = {
      url, priority, pin: wantPin, enqueueSeq: ++this.enqueueSeq, started: false, promise, resolve: resolveFn, reject: rejectFn,
    };
    this.pendingByUrl.set(url, job);
    this.queue.push(job);
    this.pumpQueue();
    return promise;
  }

  pinAsset(url: string): boolean { const e = this.ramCache.get(url); if (!e) return false; e.pinned = true; return true; }
  unpinAsset(url: string): boolean { const e = this.ramCache.get(url); if (!e) return false; e.pinned = false; return true; }
  hasInRam(url: string): boolean { return this.ramCache.has(url); }
  getRamKeys(): readonly string[] { return Array.from(this.ramCache.keys()); }

  getStats(): PredictiveAssetPrefetcherStats {
    let pinnedBytes = 0;
    let pinnedCount = 0;
    for (const e of this.ramCache.values()) { if (e.pinned) { pinnedBytes += e.byteLength; pinnedCount += 1; } }
    const c = this.counters;
    return {
      ramBytesUsed: c.ramBytes, maxRamBytes: this.maxRamBytes, pinnedBytes, entryCount: this.ramCache.size,
      pinnedCount, inFlightCount: c.inFlight, queuedCount: this.queue.length, cacheHits: c.cacheHits,
      persistentHits: c.persistentHits, networkFetches: c.networkFetches, networkBytesFetched: c.networkBytes,
      deduplicatedRequests: c.deduplicated, evictions: c.evictions, disposed: this.disposed,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) continue;
      this.pendingByUrl.delete(job.url);
      job.reject(new Error("PredictiveAssetPrefetcher disposed before fetch started"));
    }
    this.ramCache.clear();
    this.counters.ramBytes = 0;
  }

  private pumpQueue(): void {
    while (!this.disposed && this.counters.inFlight < this.maxConcurrency && this.queue.length > 0) {
      let bestIdx = 0;
      let best = this.queue[0];
      for (let i = 1; i < this.queue.length; i += 1) {
        const cand = this.queue[i];
        if (!cand || !best) continue;
        const cr = PREFETCH_PRIORITY_RANK[cand.priority];
        const br = PREFETCH_PRIORITY_RANK[best.priority];
        if (cr < br || (cr === br && cand.enqueueSeq < best.enqueueSeq)) { bestIdx = i; best = cand; }
      }
      const [job] = this.queue.splice(bestIdx, 1);
      if (!job) break;
      job.started = true;
      this.counters.inFlight += 1;
      void this.executeJob(job);
    }
  }

  private async executeJob(job: PrefetchJob): Promise<void> {
    try {
      const persisted = this.persistentCache ? await this.persistentCache.get(job.url) : null;
      if (persisted) {
        this.counters.persistentHits += 1;
        const pinned = this.storeInRam(job.url, persisted, job.pin);
        job.resolve({ url: job.url, data: persisted, byteLength: persisted.byteLength, source: "persistent", pinned, deduplicated: false });
        return;
      }
      if (this.counters.networkBytes >= this.maxPrefetchBytes && job.priority !== "viewport") {
        throw new RangeError(`Prefetch byte budget exceeded (${this.maxPrefetchBytes}B) for ${job.url}`);
      }
      const raw = await this.fetcher(job.url);
      const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      this.counters.networkFetches += 1;
      this.counters.networkBytes += data.byteLength;
      if (this.persistentCache) await this.persistentCache.put(job.url, data);
      const pinned = this.storeInRam(job.url, data, job.pin);
      job.resolve({ url: job.url, data, byteLength: data.byteLength, source: "network", pinned, deduplicated: false });
    } catch (error) {
      job.reject(error);
    } finally {
      this.counters.inFlight -= 1;
      this.pendingByUrl.delete(job.url);
      this.pumpQueue();
    }
  }

  private storeInRam(url: string, data: Uint8Array, pin: boolean): boolean {
    if (this.disposed) return false;
    const byteLength = data.byteLength;
    const prev = this.ramCache.get(url);
    if (prev) { this.counters.ramBytes -= prev.byteLength; this.ramCache.delete(url); }
    for (const [key, entry] of this.ramCache.entries()) {
      if (this.counters.ramBytes + byteLength <= this.maxRamBytes) break;
      if (entry.pinned) continue;
      this.ramCache.delete(key);
      this.counters.ramBytes -= entry.byteLength;
      this.counters.evictions += 1;
    }
    if (this.counters.ramBytes + byteLength > this.maxRamBytes) return false;
    this.ramCache.set(url, { data, byteLength, pinned: pin, hitCount: 1 });
    this.counters.ramBytes += byteLength;
    return pin;
  }
}

export interface SqlitePoolSlot { readonly role: "reader" | "writer"; readonly slotIndex: number; readonly slotId: string }

export interface SqliteWasmConnectionPoolOptions {
  readonly maxReaderSlots?: number;
  readonly maxConsecutiveReadsPerTurn?: number;
  readonly maxConsecutiveWritesPerTurn?: number;
}

export interface SqliteWasmPoolStats {
  readonly maxReaderSlots: number; readonly activeReaders: number; readonly activeWriters: number;
  readonly peakConcurrentReaders: number; readonly peakConcurrentWriters: number;
  readonly queuedReads: number; readonly queuedWrites: number;
  readonly completedReads: number; readonly completedWrites: number; readonly failedTasks: number;
  readonly maxReadWaitMs: number; readonly maxWriteWaitMs: number; readonly disposed: boolean;
}

interface QueuedPoolTask {
  readonly enqueuedAtMs: number;
  readonly run: (slot: SqlitePoolSlot) => Promise<unknown> | unknown;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason?: unknown) => void;
}

export class SqliteWasmConnectionPool {
  private readonly maxReaderSlots: number;
  private readonly maxReadsPerTurn: number;
  private readonly maxWritesPerTurn: number;
  private readonly freeReaderSlots: number[] = [];
  private readonly readQueue: QueuedPoolTask[] = [];
  private readonly writeQueue: QueuedPoolTask[] = [];
  private turn: "idle" | "read" | "write" = "idle";
  private dispatchedInTurn = 0;
  private disposed = false;
  private readonly counters = {
    activeReaders: 0, activeWriters: 0, peakReaders: 0, peakWriters: 0,
    completedReads: 0, completedWrites: 0, failed: 0, maxReadWaitMs: 0, maxWriteWaitMs: 0,
  };

  constructor(options: SqliteWasmConnectionPoolOptions = {}) {
    const maxReaders = options.maxReaderSlots ?? 4;
    if (!Number.isSafeInteger(maxReaders) || maxReaders < 1) throw new RangeError(`Invalid maxReaderSlots: ${maxReaders}`);
    this.maxReaderSlots = maxReaders;
    this.maxReadsPerTurn = Math.max(1, Math.trunc(options.maxConsecutiveReadsPerTurn ?? maxReaders));
    this.maxWritesPerTurn = Math.max(1, Math.trunc(options.maxConsecutiveWritesPerTurn ?? 1));
    for (let i = 0; i < maxReaders; i += 1) this.freeReaderSlots.push(i);
  }

  read<T>(task: (slot: SqlitePoolSlot) => Promise<T> | T): Promise<T> { return this.enqueue(this.readQueue, task); }
  write<T>(task: (slot: SqlitePoolSlot) => Promise<T> | T): Promise<T> { return this.enqueue(this.writeQueue, task); }

  getStats(): SqliteWasmPoolStats {
    const c = this.counters;
    return {
      maxReaderSlots: this.maxReaderSlots, activeReaders: c.activeReaders, activeWriters: c.activeWriters,
      peakConcurrentReaders: c.peakReaders, peakConcurrentWriters: c.peakWriters,
      queuedReads: this.readQueue.length, queuedWrites: this.writeQueue.length,
      completedReads: c.completedReads, completedWrites: c.completedWrites, failedTasks: c.failed,
      maxReadWaitMs: c.maxReadWaitMs, maxWriteWaitMs: c.maxWriteWaitMs, disposed: this.disposed,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const err = new Error("SqliteWasmConnectionPool disposed while task was queued");
    while (this.readQueue.length > 0) this.readQueue.shift()?.reject(err);
    while (this.writeQueue.length > 0) this.writeQueue.shift()?.reject(err);
  }

  private enqueue<T>(queue: QueuedPoolTask[], run: (slot: SqlitePoolSlot) => Promise<T> | T): Promise<T> {
    if (this.disposed) return Promise.reject(new Error("SqliteWasmConnectionPool disposed"));
    return new Promise<T>((resolve, reject) => {
      queue.push({
        enqueuedAtMs: nowMs(),
        run: run as (slot: SqlitePoolSlot) => Promise<unknown> | unknown,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.schedule();
    });
  }

  private schedule(): void {
    const c = this.counters;
    if (this.disposed || c.activeWriters > 0) return;
    if (c.activeReaders > 0) { this.dispatchReaders(); return; }

    const hasReads = this.readQueue.length > 0;
    const hasWrites = this.writeQueue.length > 0;
    if (!hasReads && !hasWrites) { this.turn = "idle"; this.dispatchedInTurn = 0; return; }

    const runReadsNext =
      hasReads && (!hasWrites || (this.turn === "write" && this.dispatchedInTurn >= this.maxWritesPerTurn));
    if (runReadsNext) {
      if (this.turn !== "read") { this.turn = "read"; this.dispatchedInTurn = 0; }
      this.dispatchReaders();
      return;
    }
    if (this.turn !== "write") { this.turn = "write"; this.dispatchedInTurn = 0; }
    this.dispatchNextWriter();
  }

  private dispatchReaders(): void {
    const c = this.counters;
    while (this.freeReaderSlots.length > 0 && this.readQueue.length > 0) {
      if (this.writeQueue.length > 0 && this.dispatchedInTurn >= this.maxReadsPerTurn) break;
      const slotIndex = this.freeReaderSlots.shift();
      const task = this.readQueue.shift();
      if (slotIndex === undefined || !task) break;
      c.activeReaders += 1;
      this.dispatchedInTurn += 1;
      if (c.activeReaders > c.peakReaders) c.peakReaders = c.activeReaders;
      const waitMs = Math.max(0, nowMs() - task.enqueuedAtMs);
      if (waitMs > c.maxReadWaitMs) c.maxReadWaitMs = waitMs;
      void this.runTask(task, { role: "reader", slotIndex, slotId: `reader-${slotIndex}` });
    }
  }

  private dispatchNextWriter(): void {
    const task = this.writeQueue.shift();
    if (!task) return;
    const c = this.counters;
    c.activeWriters = 1;
    this.dispatchedInTurn += 1;
    if (c.activeWriters > c.peakWriters) c.peakWriters = c.activeWriters;
    const waitMs = Math.max(0, nowMs() - task.enqueuedAtMs);
    if (waitMs > c.maxWriteWaitMs) c.maxWriteWaitMs = waitMs;
    void this.runTask(task, { role: "writer", slotIndex: 0, slotId: "writer-0" });
  }

  private async runTask(task: QueuedPoolTask, slot: SqlitePoolSlot): Promise<void> {
    try {
      const value = await task.run(slot);
      if (slot.role === "reader") this.counters.completedReads += 1;
      else this.counters.completedWrites += 1;
      task.resolve(value);
    } catch (error) {
      this.counters.failed += 1;
      task.reject(error);
    } finally {
      if (slot.role === "reader") { this.counters.activeReaders -= 1; this.freeReaderSlots.push(slot.slotIndex); }
      else this.counters.activeWriters = 0;
      this.schedule();
    }
  }
}
