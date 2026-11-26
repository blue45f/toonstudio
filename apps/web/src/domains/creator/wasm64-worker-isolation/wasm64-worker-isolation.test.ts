import { describe, expect, it, vi } from "vitest";
import {
  CRDT_STROKE_OP_BYTE_LENGTH,
  CrdtStrokeOpKind,
  decodeCrdtStrokeBatch,
  decodeCrdtStrokeOp,
  detectOffscreenRendererCapability,
  encodeCrdtStrokeOp,
  LightweightCrdtStrokeLog,
  measureCrdtBandwidthSavings,
  OffscreenRendererWorkerBridge,
  POINTER_POINT_STRIDE_BYTES,
  POINTER_POINT_STRIDE_FLOATS,
  PredictiveAssetPrefetcher,
  SqliteWasmConnectionPool,
  type Canvas2DContextLike,
  type CrdtStrokeOp,
  type DispatchedPointerBatch,
  type OffscreenWorkerInboundMessage,
  type OffscreenWorkerLike,
  type PersistentAssetCacheAdapter,
  type TransferableCanvasLike,
  type WorkerMessageEventLike,
} from "./index";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMockWorker(): {
  worker: OffscreenWorkerLike;
  posted: Array<{ message: OffscreenWorkerInboundMessage; transfer?: Transferable[] }>;
  terminatedCount: () => number;
  emitMessage: (data: unknown) => void;
  listenerCount: () => number;
} {
  const posted: Array<{ message: OffscreenWorkerInboundMessage; transfer?: Transferable[] }> = [];
  const listeners = new Map<string, Set<(ev: WorkerMessageEventLike) => void>>();
  let terminated = 0;

  const worker: OffscreenWorkerLike = {
    postMessage(message: unknown, transfer?: Transferable[]) {
      posted.push({ message: message as OffscreenWorkerInboundMessage, transfer });
    },
    terminate() {
      terminated += 1;
    },
    addEventListener(type, listener) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };

  return {
    worker,
    posted,
    terminatedCount: () => terminated,
    emitMessage(data: unknown) {
      for (const listener of listeners.get("message") ?? []) {
        listener({ data });
      }
    },
    listenerCount: () =>
      Array.from(listeners.values()).reduce((sum, set) => sum + set.size, 0),
  };
}

describe("OffscreenRendererWorkerBridge", () => {
  it("transfers OffscreenCanvas ownership, dispatches transferable Float32Array pointer batches, and tracks frame drops", () => {
    const mockWorker = createMockWorker();
    const offscreenStub = { width: 1920, height: 1080 };
    const transferSpy = vi.fn(() => offscreenStub);
    const canvas: TransferableCanvasLike = {
      width: 1920,
      height: 1080,
      transferControlToOffscreen: transferSpy,
    };

    const capability = detectOffscreenRendererCapability(canvas);
    expect(capability.hasTransferControl).toBe(true);

    const bridge = new OffscreenRendererWorkerBridge({
      worker: mockWorker.worker,
      targetFps: 120,
      maxBatchPoints: 4,
    });

    const mode = bridge.attachCanvas(canvas, { dpr: 2, strokeId: 77, brushWidth: 12 });
    expect(mode).toBe("offscreen-worker");
    expect(transferSpy).toHaveBeenCalledTimes(1);
    expect(mockWorker.posted).toHaveLength(1);
    expect(mockWorker.posted[0]?.message).toMatchObject({
      type: "init",
      canvas: offscreenStub,
      width: 1920,
      height: 1080,
      dpr: 2,
      targetFps: 120,
    });
    expect(mockWorker.posted[0]?.transfer).toEqual([offscreenStub]);

    // 240Hz coalesced stylus event with 5 samples triggers auto-flush at 4 points + 1 pending point.
    const accepted = bridge.enqueueCoalescedEvents({
      getCoalescedEvents: () => [
        { x: 10, y: 20, pressure: 0.25, tiltX: 5, tiltY: -2, timeStamp: 100 },
        { x: 14, y: 26, pressure: 0.5, tiltX: 6, tiltY: -1, timeStamp: 104 },
        { x: 18, y: 31, pressure: 0.75, tiltX: 7, tiltY: 0, timeStamp: 108 },
        { x: 22, y: 37, pressure: 1.0, tiltX: 8, tiltY: 1, timeStamp: 112 },
        { x: 26, y: 42, pressure: 0.8, tiltX: 9, tiltY: 2, timeStamp: 116 },
      ],
    });
    expect(accepted).toBe(5);
    expect(mockWorker.posted).toHaveLength(2);

    const batchPost = mockWorker.posted[1];
    expect(batchPost?.message.type).toBe("pointer-batch");
    if (batchPost?.message.type === "pointer-batch") {
      expect(batchPost.message.pointCount).toBe(4);
      expect(batchPost.message.strideFloats).toBe(POINTER_POINT_STRIDE_FLOATS);
      expect(batchPost.message.pointsBuffer.byteLength).toBe(4 * POINTER_POINT_STRIDE_BYTES);
      expect(batchPost.transfer).toEqual([batchPost.message.pointsBuffer]);
      const view = new Float32Array(batchPost.message.pointsBuffer);
      expect(view[0]).toBe(10);
      expect(view[1]).toBe(20);
      expect(view[2]).toBe(0.25);
      expect(view[18]).toBe(22);
      expect(view[19]).toBe(37);
    }

    const tailBatch = bridge.flushPointerBatch();
    expect(tailBatch?.pointCount).toBe(1);
    expect(tailBatch?.byteLength).toBe(POINTER_POINT_STRIDE_BYTES);

    // Worker telemetry: 120Hz frame budget is 8.333ms -> 4.5ms ok, 12.4ms dropped.
    mockWorker.emitMessage({ type: "frame-telemetry", sequence: 1, frameDurationMs: 4.5 });
    mockWorker.emitMessage({ type: "frame-telemetry", sequence: 2, frameDurationMs: 12.4 });

    const telemetry = bridge.getTelemetry();
    expect(telemetry.submittedBatches).toBe(2);
    expect(telemetry.submittedPoints).toBe(5);
    expect(telemetry.transferredBytes).toBe(5 * POINTER_POINT_STRIDE_BYTES);
    expect(telemetry.completedFrames).toBe(2);
    expect(telemetry.droppedFrames).toBe(1);
    expect(telemetry.frameDropRatio).toBeCloseTo(0.5, 5);
    expect(telemetry.maxFrameTimeMs).toBeCloseTo(12.4, 5);
    expect(telemetry.lastWorkerSequence).toBe(2);
    expect(telemetry.pendingAcks).toBe(0);

    // Worker resize forwarding + scheduled flush cancelled cleanly on dispose.
    bridge.resize(2560, 1440, 2);
    expect(mockWorker.posted.at(-1)?.message).toEqual({
      type: "resize",
      width: 2560,
      height: 1440,
      dpr: 2,
    });

    // Idempotent dispose removes listeners, notifies worker, and terminates worker once.
    bridge.enqueuePointerPoint({ x: 50, y: 60 });
    bridge.scheduleFlush();
    bridge.dispose();
    bridge.dispose();
    expect(mockWorker.terminatedCount()).toBe(1);
    expect(mockWorker.listenerCount()).toBe(0);
    expect(mockWorker.posted.at(-1)?.message).toEqual({ type: "dispose" });
    expect(bridge.enqueuePointerPoint({ x: 1, y: 2 })).toBe(false);
    expect(() => bridge.attachCanvas(canvas)).toThrow();
  });

  it("falls back gracefully to main-thread desynchronized 2D context when transferControlToOffscreen is absent", () => {
    const drawCalls: string[] = [];
    const mockCtx: Canvas2DContextLike = {
      beginPath: () => drawCalls.push("beginPath"),
      moveTo: (x, y) => drawCalls.push(`moveTo:${x},${y}`),
      lineTo: (x, y) => drawCalls.push(`lineTo:${x},${y}`),
      stroke: () => drawCalls.push("stroke"),
    };
    const getContextSpy = vi.fn(() => mockCtx);
    const canvasWithoutOffscreen: TransferableCanvasLike = {
      width: 1280,
      height: 720,
      getContext: getContextSpy,
    };

    const receivedFallbackBatches: DispatchedPointerBatch[] = [];
    const bridge = new OffscreenRendererWorkerBridge({
      targetFps: 120,
      onFallbackBatch: (batch) => receivedFallbackBatches.push(batch),
    });

    const mode = bridge.attachCanvas(canvasWithoutOffscreen, { strokeId: 9, brushWidth: 8 });
    expect(mode).toBe("main-thread-desynchronized");
    expect(getContextSpy).toHaveBeenCalledWith("2d", { desynchronized: true, alpha: true });
    expect(bridge.getFallbackContext()).toBe(mockCtx);

    bridge.enqueuePointerPoint({ x: 100, y: 150, pressure: 0.6 });
    bridge.enqueuePointerPoint({ x: 120, y: 175, pressure: 0.9 });
    const flushed = bridge.flushPointerBatch();

    expect(flushed?.mode).toBe("main-thread-desynchronized");
    expect(flushed?.pointCount).toBe(2);
    expect(receivedFallbackBatches).toHaveLength(1);
    expect(drawCalls).toEqual(["beginPath", "moveTo:100,150", "lineTo:120,175", "stroke"]);
    expect(bridge.getTelemetry().desynchronizedFallbackActive).toBe(true);
    expect(bridge.getTelemetry().completedFrames).toBe(1);

    bridge.dispose();
    expect(bridge.getTelemetry().isDisposed).toBe(true);
    expect(bridge.getFallbackContext()).toBeNull();
  });
});

describe("LightweightCrdtStrokeLog & 28B Binary Codec", () => {
  it("encodes fixed 28-byte packets with > 80% bandwidth reduction over JSON", () => {
    const ops: CrdtStrokeOp[] = [];
    const peer = new LightweightCrdtStrokeLog(1024, 1500);
    for (let i = 0; i < 64; i += 1) {
      const { op, packet } = peer.createLocalOp({
        kind: i === 0 ? CrdtStrokeOpKind.StrokeBegin : CrdtStrokeOpKind.StrokePoint,
        layerIndex: 2,
        strokeId: 90421,
        x: 1248.375 + i * 3.25,
        y: 2910.625 + i * 1.75,
        pressure: Math.min(1, 0.25 + i * 0.01),
        brushWidth: 18.5,
      });
      expect(packet.byteLength).toBe(CRDT_STROKE_OP_BYTE_LENGTH);
      const decoded = decodeCrdtStrokeOp(packet);
      expect(decoded).toEqual(op);
      expect(Math.abs(decoded.pressure - Math.min(1, 0.25 + i * 0.01))).toBeLessThanOrEqual(
        1 / 65535 + 1e-7,
      );
      expect(decoded.brushWidth).toBeCloseTo(18.5, 4);
      ops.push(op);
    }

    const report = measureCrdtBandwidthSavings(ops);
    expect(report.binaryBytes).toBe(64 * 28);
    expect(report.jsonBytes).toBeGreaterThan(64 * 160);
    expect(report.reductionPercent).toBeGreaterThan(80);

    // Rejects invalid packet version and truncated slices.
    const firstOp = ops[0];
    if (!firstOp) throw new Error("Expected at least one encoded CRDT op");
    const corrupt = new Uint8Array(encodeCrdtStrokeOp(firstOp));
    corrupt[0] = 0xf1;
    expect(() => decodeCrdtStrokeOp(corrupt)).toThrow(RangeError);
    expect(() => decodeCrdtStrokeBatch(new Uint8Array(27))).toThrow(RangeError);
  });

  it("converges bit-identically across 3 peers (peerA, peerB, peerC) under out-of-order and duplicate delivery", () => {
    const peerA = new LightweightCrdtStrokeLog(101);
    const peerB = new LightweightCrdtStrokeLog(202);
    const peerC = new LightweightCrdtStrokeLog(303);

    // Concurrent strokes at overlapping Lamport timestamps (forcing peerId + opSeq tie-breaking).
    const packetsA = [
      peerA.createLocalOp({ kind: CrdtStrokeOpKind.StrokeBegin, layerIndex: 0, strokeId: 1, x: 10, y: 12, pressure: 0.4, brushWidth: 8 }).packet,
      peerA.createLocalOp({ kind: CrdtStrokeOpKind.StrokePoint, layerIndex: 0, strokeId: 1, x: 24.5, y: 36.25, pressure: 0.7, brushWidth: 8 }).packet,
      peerA.createLocalOp({ kind: CrdtStrokeOpKind.StrokeEnd, layerIndex: 0, strokeId: 1, x: 24.5, y: 36.25, pressure: 0.7, brushWidth: 8 }).packet,
      peerA.createLocalOp({ kind: CrdtStrokeOpKind.StrokeUndo, layerIndex: 0, strokeId: 1 }).packet,
      peerA.createLocalOp({ kind: CrdtStrokeOpKind.StrokeRedo, layerIndex: 0, strokeId: 1 }).packet,
    ];
    const packetsB = [
      peerB.createLocalOp({ kind: CrdtStrokeOpKind.StrokeBegin, layerIndex: 1, strokeId: 1, x: 300, y: 400, pressure: 0.9, brushWidth: 24 }).packet,
      peerB.createLocalOp({ kind: CrdtStrokeOpKind.StrokePoint, layerIndex: 1, strokeId: 1, x: 315, y: 420, pressure: 0.85, brushWidth: 24 }).packet,
      peerB.createLocalOp({ kind: CrdtStrokeOpKind.StrokeEnd, layerIndex: 1, strokeId: 1, x: 315, y: 420, pressure: 0.85, brushWidth: 24 }).packet,
    ];
    const packetsC = [
      peerC.createLocalOp({ kind: CrdtStrokeOpKind.StrokeBegin, layerIndex: 0, strokeId: 2, x: 50, y: 80, pressure: 0.3, brushWidth: 4.5 }).packet,
      peerC.createLocalOp({ kind: CrdtStrokeOpKind.StrokePoint, layerIndex: 0, strokeId: 2, x: 72, y: 95, pressure: 0.6, brushWidth: 4.5 }).packet,
      peerC.createLocalOp({ kind: CrdtStrokeOpKind.StrokeEnd, layerIndex: 0, strokeId: 2, x: 72, y: 95, pressure: 0.6, brushWidth: 4.5 }).packet,
      peerC.createLocalOp({ kind: CrdtStrokeOpKind.StrokeUndo, layerIndex: 0, strokeId: 2 }).packet,
    ];

    // Algebraic commutativity & associativity on unmerged logs.
    const ab = LightweightCrdtStrokeLog.mergeLogs(peerA, peerB);
    const ba = LightweightCrdtStrokeLog.mergeLogs(peerB, peerA);
    expect(ab.exportCanonicalBinary()).toEqual(ba.exportCanonicalBinary());

    const abThenC = LightweightCrdtStrokeLog.mergeLogs(ab, peerC);
    const aThenBc = LightweightCrdtStrokeLog.mergeLogs(
      peerA,
      LightweightCrdtStrokeLog.mergeLogs(peerB, peerC),
    );
    expect(abThenC.exportCanonicalBinary()).toEqual(aThenBc.exportCanonicalBinary());

    // Deliver packets in 3 completely different orders + duplicate redeliveries!
    const allPackets = [...packetsA, ...packetsB, ...packetsC];
    const orderForA = [...packetsC.slice().reverse(), ...packetsB, ...packetsC, ...packetsA];
    const interleavedForB = [
      ...packetsA.slice().reverse(),
      ...packetsC.slice().reverse(),
      ...packetsB,
      ...packetsA,
      ...packetsC,
    ];
    const orderForC = [...allPackets.slice().reverse(), ...allPackets];

    for (const pkt of orderForA) peerA.applyRemotePacket(pkt);
    for (const pkt of interleavedForB) peerB.applyRemotePacket(pkt);
    for (const pkt of orderForC) peerC.applyRemotePacket(pkt);

    // Duplicate delivery is strictly idempotent (no-op).
    const dupB0 = packetsB[0];
    const dupC0 = packetsC[0];
    const dupA0 = packetsA[0];
    if (!dupB0 || !dupC0 || !dupA0) throw new Error("Expected peer packets");
    expect(peerA.applyRemotePacket(dupB0)).toBe(false);
    expect(peerB.applyRemotePacket(dupC0)).toBe(false);
    expect(peerC.applyRemotePacket(dupA0)).toBe(false);

    const binA = peerA.exportCanonicalBinary();
    const binB = peerB.exportCanonicalBinary();
    const binC = peerC.exportCanonicalBinary();
    expect(binA.byteLength).toBe(allPackets.length * CRDT_STROKE_OP_BYTE_LENGTH);
    expect(binA).toEqual(binB);
    expect(binB).toEqual(binC);
    expect(binA).toEqual(abThenC.exportCanonicalBinary());
    expect(peerA.materializeStrokes()).toEqual(peerB.materializeStrokes());
    expect(peerB.materializeStrokes()).toEqual(peerC.materializeStrokes());
    expect(peerA.getLamportClock()).toBe(peerB.getLamportClock());
    expect(peerB.getLamportClock()).toBe(peerC.getLamportClock());

    // Anti-entropy delta sync brings a cold peerD up to bit-identical state.
    const peerD = new LightweightCrdtStrokeLog(404);
    const delta = peerA.exportDeltaForVector(peerD.getPeerSeqVector());
    expect(peerD.applyRemoteBatch(delta)).toBe(allPackets.length);
    expect(peerD.exportCanonicalBinary()).toEqual(binA);
  });
});

describe("PredictiveAssetPrefetcher", () => {
  it("preempts lower priorities (viewport > next-cut > brush-preset > background-idle) and deduplicates in-flight URLs", async () => {
    const fetchOrder: string[] = [];
    const gates = new Map<string, Deferred<Uint8Array>>();

    const prefetcher = new PredictiveAssetPrefetcher({
      maxConcurrency: 1,
      maxRamBytes: 1024,
      fetcher: async (url) => {
        fetchOrder.push(url);
        const gate = gates.get(url);
        if (gate) return gate.promise;
        return new Uint8Array(16);
      },
    });

    const firstGate = createDeferred<Uint8Array>();
    gates.set("asset://blocker", firstGate);
    const pBlocker = prefetcher.prefetch("asset://blocker", { priority: "background-idle" });

    // Queue all 4 priority tiers while concurrency slot is occupied.
    const pIdle = prefetcher.prefetch("asset://idle-1", { priority: "background-idle" });
    const pBrush = prefetcher.prefetch("asset://brush-1", { priority: "brush-preset" });
    const pNextCut = prefetcher.prefetch("asset://next-cut-1", { priority: "next-cut" });
    const pViewport = prefetcher.prefetch("asset://viewport-1", { priority: "viewport" });

    // Duplicate request for queued idle asset promotes it to viewport & deduplicates!
    const pPromotedIdle = prefetcher.prefetch("asset://idle-1", { priority: "viewport" });
    // Duplicate request for active in-flight blocker also deduplicates without extra fetch.
    const pBlockerDup = prefetcher.prefetch("asset://blocker", { priority: "viewport" });

    firstGate.resolve(new Uint8Array(16));
    const [rBlocker, rBlockerDup, rIdle, rPromoted] = await Promise.all([
      pBlocker,
      pBlockerDup,
      pIdle,
      pPromotedIdle,
      pBrush,
      pNextCut,
      pViewport,
    ]);

    expect(rBlocker.deduplicated).toBe(false);
    expect(rBlockerDup.deduplicated).toBe(true);
    expect(rIdle.deduplicated).toBe(false);
    expect(rPromoted.deduplicated).toBe(true);

    // idle-1 was promoted to viewport ahead of next-cut-1 & brush-1 (earlier enqueueSeq than viewport-1).
    expect(fetchOrder).toEqual([
      "asset://blocker",
      "asset://idle-1",
      "asset://viewport-1",
      "asset://next-cut-1",
      "asset://brush-1",
    ]);
    expect(prefetcher.getStats().networkFetches).toBe(5);
    expect(prefetcher.getStats().deduplicatedRequests).toBe(2);
  });

  it("keeps pinned base assets immune to LRU eviction, serves persistent tier hits, and enforces byte budgets", async () => {
    const persistentStore = new Map<string, Uint8Array>();
    const persistentCache: PersistentAssetCacheAdapter = {
      get: (url) => persistentStore.get(url) ?? null,
      put: (url, data) => {
        persistentStore.set(url, data);
      },
    };
    const fetchCounts = new Map<string, number>();

    const prefetcher = new PredictiveAssetPrefetcher({
      maxConcurrency: 2,
      maxRamBytes: 160,
      maxPrefetchBytes: 256,
      persistentCache,
      fetcher: async (url) => {
        fetchCounts.set(url, (fetchCounts.get(url) ?? 0) + 1);
        return new Uint8Array(64).fill(fetchCounts.size);
      },
    });

    // Pin a 64B base brush asset, then load 3 unpinned 64B cuts (exceeding 160B RAM cap).
    await prefetcher.prefetch("asset://base-gpen", { priority: "brush-preset", pin: true });
    await prefetcher.prefetch("asset://cut-1", { priority: "next-cut" });
    await prefetcher.prefetch("asset://cut-2", { priority: "next-cut" });
    await prefetcher.prefetch("asset://cut-3", { priority: "next-cut" });

    // Pinned base asset MUST survive all LRU evictions, while cut-1 & cut-2 were evicted.
    expect(prefetcher.hasInRam("asset://base-gpen")).toBe(true);
    expect(prefetcher.hasInRam("asset://cut-3")).toBe(true);
    expect(prefetcher.hasInRam("asset://cut-1")).toBe(false);
    expect(prefetcher.getStats().ramBytesUsed).toBeLessThanOrEqual(160);
    expect(prefetcher.getStats().evictions).toBeGreaterThanOrEqual(2);

    // Re-requesting evicted cut-1 hits tier-2 persistent cache without a second network fetch!
    const fromPersistent = await prefetcher.prefetch("asset://cut-1", { priority: "viewport" });
    expect(fromPersistent.source).toBe("persistent");
    expect(fetchCounts.get("asset://cut-1")).toBe(1);

    // Budget cap (256B fetched so far) rejects background-idle fetches while allowing viewport fetches.
    await expect(
      prefetcher.prefetch("asset://bg-low", { priority: "background-idle" }),
    ).rejects.toThrow(RangeError);
    const critical = await prefetcher.prefetch("asset://viewport-urgent", { priority: "viewport" });
    expect(critical.source).toBe("network");
    prefetcher.dispose();
  });
});

describe("SqliteWasmConnectionPool", () => {
  it("runs concurrent reads in parallel while strictly serializing writes with zero read/write overlap", async () => {
    const pool = new SqliteWasmConnectionPool({ maxReaderSlots: 3 });

    // Prove 3 reads execute truly in parallel across distinct reader slots.
    const rGates = [createDeferred<void>(), createDeferred<void>(), createDeferred<void>()];
    const startedReaderSlots: string[] = [];
    const rTasks = rGates.map((gate, idx) =>
      pool.read(async (slot) => {
        startedReaderSlots.push(slot.slotId);
        await gate.promise;
        return idx;
      }),
    );

    expect(startedReaderSlots).toEqual(["reader-0", "reader-1", "reader-2"]);
    expect(pool.getStats().activeReaders).toBe(3);
    expect(pool.getStats().peakConcurrentReaders).toBe(3);

    // Release readers and run heavy interleaved read/write stress verifying strict mutual exclusion.
    for (const g of rGates) g.resolve();
    expect(await Promise.all(rTasks)).toEqual([0, 1, 2]);

    let activeR = 0;
    let activeW = 0;
    let overlapViolations = 0;
    let maxParallelW = 0;

    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 2));
    const jobs: Array<Promise<unknown>> = [];
    for (let i = 0; i < 6; i += 1) {
      jobs.push(
        pool.write(async (slot) => {
          expect(slot.role).toBe("writer");
          activeW += 1;
          if (activeW > maxParallelW) maxParallelW = activeW;
          if (activeW > 1 || activeR > 0) overlapViolations += 1;
          await tick();
          if (activeW > 1 || activeR > 0) overlapViolations += 1;
          activeW -= 1;
          return `w-${i}`;
        }),
      );
      jobs.push(
        pool.read(async (slot) => {
          expect(slot.role).toBe("reader");
          activeR += 1;
          if (activeW > 0) overlapViolations += 1;
          await tick();
          if (activeW > 0) overlapViolations += 1;
          activeR -= 1;
          return `r-${i}`;
        }),
      );
    }

    await Promise.all(jobs);
    expect(overlapViolations).toBe(0);
    expect(maxParallelW).toBe(1);
    expect(pool.getStats().peakConcurrentWriters).toBe(1);
    expect(pool.getStats().completedReads).toBe(9);
    expect(pool.getStats().completedWrites).toBe(6);
  });

  it("prevents both writer starvation under read storms and reader starvation under write storms", async () => {
    const pool = new SqliteWasmConnectionPool({
      maxReaderSlots: 2,
      maxConsecutiveReadsPerTurn: 2,
      maxConsecutiveWritesPerTurn: 1,
    });
    const timeline: string[] = [];

    // 1) Read storm + waiting writer: W1 must run right after R1 & R2 finish, BEFORE R3 & R4!
    const r1Gate = createDeferred<void>();
    const r2Gate = createDeferred<void>();
    const pR1 = pool.read(async () => { timeline.push("R1-start"); await r1Gate.promise; timeline.push("R1-end"); });
    const pR2 = pool.read(async () => { timeline.push("R2-start"); await r2Gate.promise; timeline.push("R2-end"); });
    const pW1 = pool.write(async () => { timeline.push("W1-run"); });
    const pR3 = pool.read(async () => { timeline.push("R3-run"); });
    const pR4 = pool.read(async () => { timeline.push("R4-run"); });

    r1Gate.resolve();
    r2Gate.resolve();
    await Promise.all([pR1, pR2, pW1, pR3, pR4]);

    const w1Idx = timeline.indexOf("W1-run");
    expect(w1Idx).toBeGreaterThan(timeline.indexOf("R1-end"));
    expect(w1Idx).toBeGreaterThan(timeline.indexOf("R2-end"));
    expect(w1Idx).toBeLessThan(timeline.indexOf("R3-run"));
    expect(w1Idx).toBeLessThan(timeline.indexOf("R4-run"));

    // 2) Write storm + waiting readers: after W2 finishes, R5 & R6 must run BEFORE W3 & W4!
    const stormLog: string[] = [];
    const w2Gate = createDeferred<void>();
    const pW2 = pool.write(async () => { stormLog.push("W2-start"); await w2Gate.promise; stormLog.push("W2-end"); });
    const pW3 = pool.write(async () => { stormLog.push("W3-run"); });
    const pW4 = pool.write(async () => { stormLog.push("W4-run"); });
    const pR5 = pool.read(async () => { stormLog.push("R5-run"); });
    const pR6 = pool.read(async () => { stormLog.push("R6-run"); });

    w2Gate.resolve();
    await Promise.all([pW2, pW3, pW4, pR5, pR6]);

    expect(stormLog.indexOf("R5-run")).toBeLessThan(stormLog.indexOf("W3-run"));
    expect(stormLog.indexOf("R6-run")).toBeLessThan(stormLog.indexOf("W3-run"));

    // 3) Failing tasks never deadlock subsequent pool operations, and dispose rejects queued items.
    await expect(pool.write(() => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await pool.read(() => "healthy")).toBe("healthy");

    const blocker = createDeferred<void>();
    const running = pool.write(() => blocker.promise);
    const queuedAfterDispose = pool.read(() => "never");
    pool.dispose();
    await expect(queuedAfterDispose).rejects.toThrow(/disposed/i);
    blocker.resolve();
    await running;
  });
});
