import { describe, expect, it, vi } from "vitest";

import {
  SHADER_IDLE_MAX_SLICE_BUDGET_MS,
  STROKE_DELTA_BANDWIDTH_BUDGET_BYTES_PER_SEC,
  STROKE_DELTA_MAX_COORD_ERROR_PX,
  capturePanelPinSnapshot,
  computePageSha256Hex,
  computeReconnectBackoffMs,
  computeShaderVariantCacheKey,
  createDefaultStudioShaderVariants,
  createInMemorySqliteOpfsPort,
  createShaderIdlePrewarmer,
  createSimulatedTransferWorkerPort,
  createSqliteOpfsWalScrubber,
  createStrokeDeltaTransportMachine,
  createZeroCopyExportOrchestrator,
  decodeStrokeDeltaPacket,
  encodeStrokeDeltaPacket,
  evaluateWalScheduleDecision,
  inspectRuntimeResilienceReadiness,
  measureStrokeDeltaBandwidth,
  measureStrokeQuantizationError,
  prepareZeroCopyLayerTransfer,
  restoreMultiMonitorPanelBatch,
  restorePinnedPanelRect,
  sha256HexSync,
  snapAndClampPanelToDisplay,
  verifyCheckpointSnapshotIntegrity,
  type DisplayMonitorBounds,
  type ShaderIdleDeadlineLike,
  type ShaderIdleSchedulerAdapter,
  type ShaderVariantSpec,
  type StrokeDeltaPacket,
  type StrokeDeltaTransportAdapter,
  type StrokePointerSample,
  type StrokeResyncRequest,
  type StrokeTransportTimerAdapter,
  type TransferableLayerBuffer,
} from "./index";

function generateCurvedStylusSamples(
  count: number,
  hz: number,
  startEpochMs = 1_763_800_000_000,
): StrokePointerSample[] {
  const stepMs = 1000 / hz;
  const samples: StrokePointerSample[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / hz;
    samples.push({
      x: 420.13 + t * 260 + Math.sin(t * 5.2) * 34.7,
      y: 280.67 + t * 140 + Math.cos(t * 3.8) * 28.4,
      pressure: 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 4.1)),
      tiltX: Math.sin(t * 2.4) * 32,
      tiltY: Math.cos(t * 1.9) * 24,
      timestampMs: Math.round(startEpochMs + i * stepMs),
    });
  }
  return samples;
}

function makeSolidLayerBuffer(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): ArrayBuffer {
  const buffer = new ArrayBuffer(width * height * 4);
  const view = new Uint8ClampedArray(buffer);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    view[offset] = rgba[0];
    view[offset + 1] = rgba[1];
    view[offset + 2] = rgba[2];
    view[offset + 3] = rgba[3];
  }
  return buffer;
}

describe("초저대역 스트로크 델타 브로드캐스트 & 재연결·재동기화", () => {
  it("120Hz/240Hz 포인터 스트림을 ≤ 6 KB/s 대역폭과 ≤ 0.25px 오차로 왕복 압축·복원한다", () => {
    // 240Hz × 2초 = 480포인트를 30포인트 단위 16패킷으로 분할 전송
    const samples = generateCurvedStylusSamples(480, 240);
    const encodedPackets: Uint8Array[] = [];
    const decodedAll: StrokePointerSample[] = [];

    for (let i = 0; i < samples.length; i += 30) {
      const slice = samples.slice(i, i + 30);
      const seq = Math.floor(i / 30) + 1;
      const bytes = encodeStrokeDeltaPacket({
        seq,
        strokeId: 77,
        points: slice,
      });
      encodedPackets.push(bytes);

      const decoded = decodeStrokeDeltaPacket(bytes);
      expect(decoded.seq).toBe(seq);
      expect(decoded.strokeId).toBe(77);
      expect(decoded.points).toHaveLength(slice.length);
      decodedAll.push(...decoded.points);
    }

    const bandwidth = measureStrokeDeltaBandwidth(encodedPackets, 2000, samples.length);
    const error = measureStrokeQuantizationError(samples, decodedAll);

    expect(bandwidth.withinBudget).toBe(true);
    expect(bandwidth.bytesPerSecond).toBeLessThanOrEqual(STROKE_DELTA_BANDWIDTH_BUDGET_BYTES_PER_SEC);
    expect(bandwidth.kbPerSecond).toBeLessThan(3.5);
    expect(error.withinTolerance).toBe(true);
    expect(error.maxAxisErrorPx).toBeLessThanOrEqual(0.125 + 1e-9);
    expect(error.maxEuclideanErrorPx).toBeLessThanOrEqual(STROKE_DELTA_MAX_COORD_ERROR_PX);
    expect(error.maxPressureError).toBeLessThanOrEqual(0.001);
    expect(error.maxTiltErrorDeg).toBeLessThanOrEqual(0.25 + 1e-9);
    // 41비트 유닉스 에포크 타임스탬프가 32비트 절삭 없이 정확히 보존된다.
    expect(decodedAll[0]?.timestampMs).toBe(samples[0]?.timestampMs);
    expect(decodedAll[decodedAll.length - 1]?.timestampMs).toBe(samples[samples.length - 1]?.timestampMs);
  });

  it("음수 좌표·빈 포인트 패킷을 안전하게 처리하고 손상된 바이너리를 거부한다", () => {
    const negativePacket = encodeStrokeDeltaPacket({
      seq: 1,
      strokeId: 2,
      points: [
        { x: -128.4, y: -64.6, pressure: 0.9, tiltX: -45, tiltY: 30, timestampMs: 10 },
        { x: -120.2, y: -59.1, pressure: 0.5, tiltX: -40, tiltY: 28, timestampMs: 18 },
      ],
    });
    const decoded = decodeStrokeDeltaPacket(negativePacket);
    expect(decoded.points).toHaveLength(2);
    expect(Math.abs(decoded.points[0]!.x - -128.4)).toBeLessThanOrEqual(0.125);
    expect(Math.abs(decoded.points[1]!.y - -59.1)).toBeLessThanOrEqual(0.125);

    const emptyPacket = encodeStrokeDeltaPacket({ seq: 2, strokeId: 2, points: [] });
    expect(decodeStrokeDeltaPacket(emptyPacket).points).toEqual([]);

    expect(() => decodeStrokeDeltaPacket(new Uint8Array([0x00, 1, 2, 4]))).toThrow();
    expect(() => decodeStrokeDeltaPacket(negativePacket.subarray(0, 6))).toThrow();
  });

  it("WebSocket/WebRTC 단절 시 지수 백오프 재연결·큐 플러시·시퀀스 갭 재동기화를 완수한다", () => {
    const delays: number[] = [];
    const scheduled = new Map<number, () => void>();
    let nextTimerId = 1;
    const timer: StrokeTransportTimerAdapter = {
      schedule: (cb, delayMs) => {
        delays.push(delayMs);
        const id = nextTimerId++;
        scheduled.set(id, cb);
        return id;
      },
      cancel: (id) => {
        scheduled.delete(id);
      },
    };

    let transportOpen = false;
    const sentPayloads: Uint8Array[] = [];
    const resyncRequests: StrokeResyncRequest[] = [];
    const deliveredSeqs: number[] = [];

    const adapter: StrokeDeltaTransportAdapter = {
      kind: "webrtc",
      connect: () => {
        transportOpen = true;
      },
      disconnect: () => {
        transportOpen = false;
      },
      sendBytes: (payload) => {
        if (!transportOpen) return false;
        sentPayloads.push(payload);
        return true;
      },
      requestResync: (req) => {
        resyncRequests.push(req);
      },
    };

    const machine = createStrokeDeltaTransportMachine({
      adapter,
      timer,
      randomUnit: () => 0.5,
      nowMs: () => 10_000,
      policy: { baseDelayMs: 200, maxDelayMs: 1000, backoffFactor: 2, jitterRatio: 0.2, maxAttempts: 4 },
      onPacketDelivered: (packet) => deliveredSeqs.push(packet.seq),
    });

    expect(
      computeReconnectBackoffMs(
        1,
        {
          baseDelayMs: 200,
          maxDelayMs: 1000,
          backoffFactor: 2,
          jitterRatio: 0,
          maxAttempts: 4,
          maxOutboundQueue: 32,
          maxOutOfOrderBuffer: 32,
        },
        0.5,
      ),
    ).toBe(200);

    machine.start();
    machine.handleConnected();
    expect(machine.getSnapshot().state).toBe("connected");

    // 네트워크 단절 발생 → 지수 백오프(200ms → 400ms → 800ms) 확인
    transportOpen = false;
    const d1 = machine.handleDisconnected();
    const d2 = machine.handleDisconnected();
    const d3 = machine.handleDisconnected();
    expect([d1, d2, d3]).toEqual([200, 400, 800]);
    expect(machine.getSnapshot().state).toBe("reconnecting");

    // 단절 중 로컬 패킷 2건은 보류 큐에 적재
    const sample = generateCurvedStylusSamples(4, 120);
    const local1 = machine.enqueueLocalPacket({ seq: 10, strokeId: 1, points: sample.slice(0, 2) });
    const local2 = machine.enqueueLocalPacket({ seq: 11, strokeId: 1, points: sample.slice(2, 4) });
    expect(local1.sentImmediately).toBe(false);
    expect(local2.sentImmediately).toBe(false);
    expect(machine.getSnapshot().bufferedOutboundCount).toBe(2);

    // 예약 타이머 발화 → 재연결 성공 → 보류 패킷 2건 자동 순서 플러시
    const latestTimer = [...scheduled.values()].pop()!;
    latestTimer();
    machine.handleConnected();
    expect(machine.getSnapshot().state).toBe("connected");
    expect(machine.getSnapshot().bufferedOutboundCount).toBe(0);
    expect(sentPayloads).toHaveLength(2);

    // 시퀀스 갭 수신: seq 1 → (2, 3 누락) → 4 → 5 → 중복 1, 4
    const makeBytes = (seq: number): Uint8Array =>
      encodeStrokeDeltaPacket({ seq, strokeId: 9, points: sample.slice(0, 1) });

    expect(machine.receiveBytes(makeBytes(1)).map((p) => p.seq)).toEqual([1]);
    expect(machine.receiveBytes(makeBytes(4))).toEqual([]);
    expect(machine.receiveBytes(makeBytes(5))).toEqual([]);
    expect(machine.receiveBytes(makeBytes(1))).toEqual([]);
    expect(machine.receiveBytes(makeBytes(4))).toEqual([]);

    expect(machine.getSnapshot().state).toBe("resyncing");
    expect(machine.getSnapshot().duplicateDroppedCount).toBe(2);
    expect(resyncRequests).toHaveLength(1);
    expect(resyncRequests[0]).toMatchObject({ fromSeq: 2, toSeq: 3, missingCount: 2 });

    // 누락 패킷(3, 2 역순 투입) 재동기화 적용 → [2, 3, 4, 5] 엄격 순서 전달 후 connected 복귀
    const resynced: readonly StrokeDeltaPacket[] = machine.applyResyncPackets([makeBytes(3), makeBytes(2)]);
    expect(resynced.map((p) => p.seq)).toEqual([2, 3, 4, 5]);
    expect(deliveredSeqs).toEqual([1, 2, 3, 4, 5]);
    expect(machine.getSnapshot().state).toBe("connected");
    expect(machine.getSnapshot().bufferedOutOfOrderCount).toBe(0);
    expect(delays.length).toBe(3);

    machine.close();
    expect(machine.getSnapshot().state).toBe("closed");

    // WebSocket 최대 재연결 한도 도달 시 closed 전환 검증
    const wsMachine = createStrokeDeltaTransportMachine({
      adapter: { kind: "websocket", connect: vi.fn(), disconnect: vi.fn(), sendBytes: () => false },
      timer,
      policy: { maxAttempts: 2, baseDelayMs: 100, maxDelayMs: 500 },
    });
    expect(wsMachine.handleDisconnected()).toBe(100);
    expect(wsMachine.handleDisconnected()).toBe(200);
    expect(wsMachine.handleDisconnected()).toBeNull();
    expect(wsMachine.getSnapshot().state).toBe("closed");
  });
});

describe("SQLite/OPFS 백그라운드 WAL 무결성 스크럽 & 자동 롤백 복구", () => {
  it("FIPS 180-4 SHA-256 표준 벡터와 WebCrypto 비동기 다이제스트가 일치한다", async () => {
    const empty = new Uint8Array(0);
    const abc = new TextEncoder().encode("abc");

    expect(sha256HexSync(empty)).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256HexSync(abc)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await computePageSha256Hex(abc)).toBe(sha256HexSync(abc));
  });

  it("작화 중에는 비차단 PASSIVE, 유휴 시 TRUNCATE, 전원 차단 시 즉시 복구를 스케줄링한다", async () => {
    let clockMs = 1_000;
    const port = createInMemorySqliteOpfsPort({
      "page-001": new TextEncoder().encode("cut-1-clean-ink"),
      "page-002": new TextEncoder().encode("cut-2-clean-tone"),
    });
    const scrubber = createSqliteOpfsWalScrubber({
      port,
      nowMs: () => clockMs,
      policy: {
        maxWalFrames: 4,
        maxWalBytes: 4096,
        emergencyWalBytes: 16_384,
        checkpointIntervalMs: 30_000,
        scrubIntervalMs: 60_000,
        maxRetainedCheckpoints: 3,
      },
    });

    await scrubber.captureVerifiedCheckpoint("초기 기준선");
    port.recordWalMutation("page-001", new TextEncoder().encode("cut-1-stroke-v2"), 5);

    clockMs += 5_000;
    // 작화 중(isActivelyDrawing = true) → PASSIVE로 지연 완화
    const drawingTick = await scrubber.tick(true);
    expect(drawingTick.decision.action).toBe("passive-checkpoint");
    expect(drawingTick.decision.deferredForActiveDrawing).toBe(true);
    expect(drawingTick.walExecResult?.mode).toBe("PASSIVE");

    // 유휴 전환 후 재평가 → TRUNCATE + 검증된 체크포인트 기록
    port.recordWalMutation("page-002", new TextEncoder().encode("cut-2-stroke-v2"), 5);
    clockMs += 5_000;
    const idleTick = await scrubber.tick(false);
    expect(idleTick.decision.action).toBe("truncate-checkpoint");
    expect(idleTick.checkpoint).not.toBeNull();
    expect(await verifyCheckpointSnapshotIntegrity(idleTick.checkpoint!)).toBe(true);

    // 긴급 WAL 한도 초과 시 작화 중이라도 TRUNCATE 강제
    const emergencyDecision = evaluateWalScheduleDecision({
      nowMs: clockMs,
      lastCheckpointAtMs: clockMs,
      lastScrubAtMs: clockMs,
      walStatus: {
        pendingFrames: 100,
        walBytes: 20_000_000,
        checkpointGeneration: 3,
        uncleanShutdownDetected: false,
      },
      isActivelyDrawing: true,
    });
    expect(emergencyDecision.action).toBe("truncate-checkpoint");
  });

  it("전원 차단·비트 플립·0바이트 절단 및 최신 체크포인트 손상 시 직전 정상 체크포인트로 자동 롤백한다", async () => {
    let clockMs = 10_000;
    const p1Clean = new TextEncoder().encode("원고-1페이지-정상-벡터데이터");
    const p2Clean = new TextEncoder().encode("원고-2페이지-정상-래스터타일");
    const p3Clean = new TextEncoder().encode("원고-3페이지-정상-대사말풍선");

    const port = createInMemorySqliteOpfsPort({
      "page-1": p1Clean,
      "page-2": p2Clean,
      "page-3": p3Clean,
    });
    const scrubber = createSqliteOpfsWalScrubber({
      port,
      nowMs: () => clockMs,
      policy: { maxRetainedCheckpoints: 4 },
    });

    const ckptGood = await scrubber.captureVerifiedCheckpoint("정상 저장 #1");
    clockMs += 10_000;
    port.recordWalMutation("page-1", new TextEncoder().encode("원고-1페이지-부분기록-미완성"), 2);
    const ckptLater = await scrubber.captureVerifiedCheckpoint("정상 저장 #2");

    // 전원 차단 시나리오: 최신 체크포인트 자체도 손상되고, 운영 페이지 2건이 비트 플립/절단됨
    port.corruptCheckpointSnapshot(ckptLater.checkpointId, "page-1");
    port.simulatePageBitFlip("page-2", 3);
    port.simulatePageTruncation("page-3");
    port.simulatePowerLossUncleanWal(8192);

    clockMs += 2_000;
    const tickResult = await scrubber.tick(false);
    expect(tickResult.decision.action).toBe("scrub-and-recover");
    const report = tickResult.scrubReport!;

    expect(report.status).toBe("recovered");
    expect(report.findings.some((f) => f.reason === "wal-unclean-shutdown")).toBe(true);
    expect(report.findings.some((f) => f.pageId === "page-2" && f.reason === "checksum-mismatch")).toBe(true);
    expect(report.findings.some((f) => f.pageId === "page-3" && f.reason === "truncated-page")).toBe(true);

    // 손상된 최신 체크포인트를 건너뛰고 직전 정상 체크포인트(ckptGood)로 복구 완료
    expect(report.recovery?.restoredCheckpointId).toBe(ckptGood.checkpointId);
    expect(report.recovery?.skippedCorruptCheckpointIds).toContain(ckptLater.checkpointId);
    expect(report.recovery?.verifiedAfterRestore).toBe(true);
    expect(report.walStatus.uncleanShutdownDetected).toBe(false);
    expect(report.walStatus.pendingFrames).toBe(0);
    expect(report.recovery?.walCheckpointAfterRestore.remainingFrames).toBe(0);

    // 복구 후 재스크럽은 100% healthy
    const restoredP2 = await port.readPageBytes("page-2");
    const restoredP3 = await port.readPageBytes("page-3");
    expect(restoredP2).toEqual(p2Clean);
    expect(restoredP3).toEqual(p3Clean);

    const postScrub = await scrubber.scrubIntegrity({ autoRollback: false });
    expect(postScrub.status).toBe("healthy");
    expect(postScrub.findings).toEqual([]);
  });
});

describe("3D/VRM 셰이더 유휴 사전 컴파일러 (≤ 6ms/slice)", () => {
  it("6ms/slice 시간 예산·우선순위·중복 캐시 제거를 엄격히 준수하며 모든 배리언트를 컴파일한다", async () => {
    let virtualNowMs = 0;
    const idleQueue: Array<{ readonly handle: number; readonly cb: (deadline: ShaderIdleDeadlineLike) => void }> = [];
    let nextHandle = 1;
    let cancelledHandles = 0;

    const scheduler: ShaderIdleSchedulerAdapter = {
      requestIdle: (cb) => {
        const handle = nextHandle++;
        idleQueue.push({ handle, cb });
        return handle;
      },
      cancelIdle: (handle) => {
        const idx = idleQueue.findIndex((item) => item.handle === handle);
        if (idx >= 0) {
          idleQueue.splice(idx, 1);
          cancelledHandles += 1;
        }
      },
    };

    const compiledOrder: string[] = [];
    const prewarmer = createShaderIdlePrewarmer({
      sliceBudgetMs: 12, // 6ms 초과 입력은 자동으로 6ms로 하드 클램프
      safetyMarginMs: 0.5,
      scheduler,
      nowMs: () => virtualNowMs,
      compileVariant: (spec) => {
        compiledOrder.push(`${spec.priority}:${spec.id}`);
        virtualNowMs += spec.estimatedCompileMs ?? 2.0;
      },
    });

    expect(prewarmer.getSnapshot().sliceBudgetMs).toBe(SHADER_IDLE_MAX_SLICE_BUDGET_MS);

    const defaults = createDefaultStudioShaderVariants("webgpu");
    // defines 키 순서가 다른 동일 배리언트를 중복 투입해 캐시 키 정규화 검증
    const reorderedDuplicate: ShaderVariantSpec = {
      id: "bg3d-pbr-standard",
      domain: "bg3d-pbr",
      pipelineKind: "webgpu",
      priority: "critical",
      defines: { USE_SHADOWMAP: true, USE_NORMALMAP: true, USE_MAP: true },
      estimatedCompileMs: 2.1,
    };
    expect(computeShaderVariantCacheKey(defaults[2]!)).toBe(
      computeShaderVariantCacheKey(reorderedDuplicate),
    );

    const enqueueSummary = prewarmer.enqueue([...defaults, reorderedDuplicate]);
    expect(enqueueSummary.queued).toBe(defaults.length);
    expect(enqueueSummary.deduplicated).toBe(1);

    const drainPromise = prewarmer.waitUntilIdle();

    // 각 유휴 슬라이스에 10ms 여유를 주더라도 prewarmer는 ≤ 6ms 예산 내에서만 컴파일하고 양보한다.
    let guard = 0;
    while (idleQueue.length > 0 && guard < 20) {
      guard += 1;
      const next = idleQueue.shift()!;
      const sliceWindowStart = virtualNowMs;
      next.cb({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 10 - (virtualNowMs - sliceWindowStart)),
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }

    const result = await drainPromise;
    expect(result.status).toBe("completed");
    expect(result.snapshot.compiledCount).toBe(defaults.length);
    expect(result.snapshot.totalSlicesExecuted).toBeGreaterThanOrEqual(2);
    expect(result.snapshot.maxObservedSliceMs).toBeLessThanOrEqual(SHADER_IDLE_MAX_SLICE_BUDGET_MS);
    expect(result.snapshot.allSlicesWithinMaxBudget).toBe(true);
    // critical → high → normal → low 우선순위 순서 확인
    expect(compiledOrder[0]?.startsWith("critical:")).toBe(true);
    expect(compiledOrder[compiledOrder.length - 1]?.startsWith("low:")).toBe(true);

    // 이미 컴파일된 배리언트 재등록 시 GPU 컴파일 0회, 캐시 히트 증가
    const secondEnqueue = prewarmer.enqueue([defaults[0]!, reorderedDuplicate]);
    expect(secondEnqueue.queued).toBe(0);
    expect(secondEnqueue.cacheHits).toBe(2);
    expect(compiledOrder).toHaveLength(defaults.length);
    expect(cancelledHandles).toBe(0);
  });

  it("cancel() 및 배치 AbortSignal 호출 시 대기 유휴 콜백을 즉시 해제하고 추가 컴파일을 중단한다", async () => {
    let virtualNowMs = 0;
    const idleQueue: Array<{ readonly handle: number; readonly cb: (deadline: ShaderIdleDeadlineLike) => void }> = [];
    let nextHandle = 1;
    let cancelIdleCalls = 0;

    const scheduler: ShaderIdleSchedulerAdapter = {
      requestIdle: (cb) => {
        const handle = nextHandle++;
        idleQueue.push({ handle, cb });
        return handle;
      },
      cancelIdle: (handle) => {
        const idx = idleQueue.findIndex((item) => item.handle === handle);
        if (idx >= 0) {
          idleQueue.splice(idx, 1);
          cancelIdleCalls += 1;
        }
      },
    };

    const compileSpy = vi.fn(() => {
      virtualNowMs += 1.5;
    });
    const prewarmer = createShaderIdlePrewarmer({
      scheduler,
      nowMs: () => virtualNowMs,
      compileVariant: compileSpy,
    });

    const batchAbort = new AbortController();
    const variants = createDefaultStudioShaderVariants("webgl2");
    prewarmer.enqueue(variants.slice(0, 3), { signal: batchAbort.signal });
    prewarmer.enqueue(variants.slice(3, 5));

    // 첫 번째 배치만 취소 → 나머지 2개는 유지
    batchAbort.abort();
    expect(prewarmer.getSnapshot().pendingCount).toBe(2);

    // 전체 cancel() → 예약된 유휴 콜백 해제 및 완료 대기자 cancelled 반환
    const waitPromise = prewarmer.waitUntilIdle();
    const dropped = prewarmer.cancel();
    expect(dropped).toBe(2);
    expect(cancelIdleCalls).toBeGreaterThanOrEqual(1);
    expect(compileSpy).not.toHaveBeenCalled();

    const drained = await waitPromise;
    expect(drained.status).toBe("cancelled");
    expect(drained.snapshot.state).toBe("cancelled");
  });
});

describe("제로-카피 워커 익스포트 & 다중 모니터 패널 레이아웃 고정", () => {
  it("ArrayBuffer Transferable 소유권 이전(detach)으로 extraCopiedBytes=0 제로-카피 합성을 검증한다", async () => {
    const worker = createSimulatedTransferWorkerPort();
    const orchestrator = createZeroCopyExportOrchestrator({ worker });

    // 4×4 배경(불투명 빨강) + 4×4 반투명 파랑(50% normal) + 숨김 레이어(transferList 제외)
    const baseBuffer = makeSolidLayerBuffer(4, 4, [200, 40, 20, 255]);
    const overlayBuffer = makeSolidLayerBuffer(4, 4, [20, 80, 220, 255]);
    const hiddenBuffer = makeSolidLayerBuffer(4, 4, [255, 255, 255, 255]);

    const layers: readonly TransferableLayerBuffer[] = [
      {
        layerId: "bg",
        width: 4,
        height: 4,
        opacity: 1,
        blendMode: "normal",
        visible: true,
        pixelBuffer: baseBuffer,
      },
      {
        layerId: "shading",
        width: 4,
        height: 4,
        opacity: 0.5,
        blendMode: "normal",
        visible: true,
        pixelBuffer: overlayBuffer,
      },
      {
        layerId: "hidden-guide",
        width: 4,
        height: 4,
        opacity: 1,
        blendMode: "normal",
        visible: false,
        pixelBuffer: hiddenBuffer,
      },
    ];

    const prepared = prepareZeroCopyLayerTransfer(4, 4, layers);
    expect(prepared.transferList).toHaveLength(2);
    expect(prepared.transferList[0]).toBe(baseBuffer);
    expect(prepared.transferList[1]).toBe(overlayBuffer);

    const result = await orchestrator.exportLayers({
      jobId: "export-cut-01",
      width: 4,
      height: 4,
      format: "rgba8",
      layers,
    });

    // 제로-카피 Transferable 소유권 이전으로 호출자 입력 버퍼가 실제로 detach(byteLength === 0)된다.
    expect(baseBuffer.byteLength).toBe(0);
    expect(overlayBuffer.byteLength).toBe(0);
    // 숨김 레이어는 전송되지 않아 원본 버퍼가 유지된다.
    expect(hiddenBuffer.byteLength).toBe(64);

    expect(result.extraCopiedBytes).toBe(0);
    expect(result.transferredInputBufferCount).toBe(2);
    expect(result.transferredInputBytes).toBe(128);
    expect(result.transferredOutputBytes).toBe(64);
    expect(result.compositedLayerCount).toBe(2);

    const outPixels = new Uint8ClampedArray(result.outputBuffer);
    // 50% 알파 블렌딩: R=(200+20)/2=110, G=(40+80)/2=60, B=(20+220)/2=120, A=255
    expect(outPixels[0]).toBe(110);
    expect(outPixels[1]).toBe(60);
    expect(outPixels[2]).toBe(120);
    expect(outPixels[3]).toBe(255);

    const history = worker.getDispatchHistory();
    expect(history).toEqual([
      { jobId: "export-cut-01", transferListLength: 2, transferredByteTotal: 128 },
    ]);

    // 동일 ArrayBuffer를 공유하는 두 레이어 뷰도 transferList 중복 없이 1회만 등록
    const sharedBuf = new ArrayBuffer(128);
    const sharedPrepared = prepareZeroCopyLayerTransfer(4, 4, [
      {
        layerId: "tile-a",
        width: 4,
        height: 4,
        opacity: 1,
        blendMode: "multiply",
        visible: true,
        pixelBuffer: sharedBuf,
        byteOffset: 0,
        byteLength: 64,
      },
      {
        layerId: "tile-b",
        width: 4,
        height: 4,
        opacity: 1,
        blendMode: "screen",
        visible: true,
        pixelBuffer: sharedBuf,
        byteOffset: 64,
        byteLength: 64,
      },
    ]);
    expect(sharedPrepared.transferList).toHaveLength(1);

    // AbortSignal 사전 취소 시 즉시 거부 및 cancelledJobs 카운트 증가 검증
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      orchestrator.exportLayers({
        jobId: "export-cancelled",
        width: 4,
        height: 4,
        format: "png-ready",
        layers: [],
        signal: aborted.signal,
      }),
    ).rejects.toThrow(/취소/);
    expect(orchestrator.getTelemetry().cancelledJobs).toBe(1);

    orchestrator.dispose();
  });

  it("다중 모니터(음수 좌표·해상도 축소·보조 모니터 분리)에서도 패널 화면 밖 이탈을 0px로 차단한다", () => {
    const displays: readonly DisplayMonitorBounds[] = [
      { displayId: "left-ref", left: -1440, top: -120, width: 1440, height: 900, scaleFactor: 1, isPrimary: false },
      { displayId: "primary-4k", left: 0, top: 0, width: 2560, height: 1440, scaleFactor: 2, isPrimary: true },
      { displayId: "right-cintiq", left: 2560, top: 200, width: 1920, height: 1080, scaleFactor: 1.5, isPrimary: false },
    ];

    // 1. 화면 밖 극단 좌표 + 과대 크기 패널 → 가장 가까운 모니터 안전 영역으로 클램핑·리사이즈
    const escaped = snapAndClampPanelToDisplay(
      { panelId: "layers", x: 99_999, y: -50_000, width: 4000, height: 2200 },
      displays,
    );
    expect(escaped.displayId).toBe("right-cintiq");
    expect(escaped.wasClamped).toBe(true);
    expect(escaped.wasResized).toBe(true);
    expect(escaped.rect.x).toBeGreaterThanOrEqual(2560 + 8);
    expect(escaped.rect.x + escaped.rect.width).toBeLessThanOrEqual(2560 + 1920 - 8);
    expect(escaped.rect.y).toBeGreaterThanOrEqual(200 + 8);
    expect(escaped.rect.y + escaped.rect.height).toBeLessThanOrEqual(200 + 1080 - 8);

    // 2. 음수 좌표 왼쪽 보조 모니터 우측 상단 경계 스냅 및 고정 스냅샷 저장
    const pinnedLeft = capturePanelPinSnapshot(
      { panelId: "reference-view", x: -376, y: -108, width: 360, height: 480 },
      displays,
      50_000,
    );
    expect(pinnedLeft.pinnedDisplayId).toBe("left-ref");
    expect(pinnedLeft.snappedEdges).toEqual({ horizontal: "right", vertical: "top" });

    // 3. 보조 모니터 해상도 변경 후 복원 → 우측 상단 스냅 유지 + 안전 경계 준수
    const resizedDisplays: readonly DisplayMonitorBounds[] = [
      { displayId: "left-ref", left: -1280, top: 0, width: 1280, height: 720, scaleFactor: 1, isPrimary: false },
      displays[1]!,
    ];
    const restoredSameMonitor = restorePinnedPanelRect(pinnedLeft, resizedDisplays);
    expect(restoredSameMonitor.matchedPinnedDisplay).toBe(true);
    expect(restoredSameMonitor.fallbackToPrimary).toBe(false);
    expect(restoredSameMonitor.rect.x + restoredSameMonitor.rect.width).toBe(-8);
    expect(restoredSameMonitor.rect.y).toBe(8);

    // 4. 왼쪽 보조 모니터 연결 해제(단일 노트북 화면) → 주 모니터로 안전 복귀(화면 밖 0px)
    const laptopOnly: readonly DisplayMonitorBounds[] = [
      { displayId: "primary-4k", left: 0, top: 0, width: 1440, height: 900, scaleFactor: 2, isPrimary: true },
    ];
    const batchRestored = restoreMultiMonitorPanelBatch([pinnedLeft], laptopOnly);
    expect(batchRestored).toHaveLength(1);
    const restoredFallback = batchRestored[0]!;
    expect(restoredFallback.matchedPinnedDisplay).toBe(false);
    expect(restoredFallback.fallbackToPrimary).toBe(true);
    expect(restoredFallback.displayId).toBe("primary-4k");
    expect(restoredFallback.rect.x).toBeGreaterThanOrEqual(8);
    expect(restoredFallback.rect.x + restoredFallback.rect.width).toBeLessThanOrEqual(1440 - 8);
    expect(restoredFallback.rect.y).toBeGreaterThanOrEqual(8);
    expect(restoredFallback.rect.y + restoredFallback.rect.height).toBeLessThanOrEqual(900 - 8);

    // 통합 준비 상태 스냅샷 ₩0 로컬 확인
    const readiness = inspectRuntimeResilienceReadiness();
    expect(readiness.strokeDeltaBandwidthBudgetKbPerSec).toBe(6);
    expect(readiness.strokeDeltaMaxCoordErrorPx).toBe(0.25);
    expect(readiness.shaderMaxIdleSliceMs).toBe(6);
    expect(readiness.zeroCloudCostKrw).toBe(0);
  });
});
