import { afterEach, describe, expect, it, vi } from "vitest";
import { createMasterFilterPreviewArtwork } from "../../filter/master-lut-fx/master-filter-pixel-engine";
import {
  STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION,
  toExactArrayBuffer,
  type StudioWorkerInboundMessage,
  type StudioWorkerOutboundMessage,
} from "./compute-job-executor";
import {
  StudioComputeWorkerPool,
  StudioWorkerPoolError,
  computeDefaultPoolSize,
  transferCanvasControlToOffscreen,
  type WorkerLike,
} from "./offscreen-worker-pool";
import {
  bindStudioOffloadComputeWorkerScope,
  type StudioOffloadWorkerScope,
} from "./studio-offload-compute.worker";
import {
  WASM_PIXEL_LUMA_INVERT_BYTES,
  WASM_PIXEL_SIMD128_BYTES,
  WASM_SIMD128_FUNC_PROBE_BYTES,
  WASM_SIMD128_PROBE_BYTES,
  probeWasmSimdAndWorkerSupport,
  resetWasmPixelKernelCacheForTests,
  runJsPixelKernelReference,
  runWasmPixelKernel,
  type WasmPixelKernelMode,
} from "./wasm-simd-pixel-kernel";

function expectBytesEqual(actual: Uint8ClampedArray, expected: Uint8ClampedArray): void {
  expect(actual.byteLength).toBe(expected.byteLength);
  let firstMismatch = -1;
  for (let i = 0; i < actual.byteLength; i += 1) {
    if (actual[i] !== expected[i]) {
      firstMismatch = i;
      break;
    }
  }
  expect(firstMismatch).toBe(-1);
}

function makeDeterministicRgba(pixelCount: number, seedOffset = 0): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = ((i * 37 + seedOffset * 17 + 13) ^ ((i >>> 2) * 11)) & 0xff;
  }
  return data;
}

function makeOpaqueCircleRgba(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.32;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      const idx = (y * width + x) * 4;
      if (dist <= r) {
        data[idx] = 240;
        data[idx + 1] = 160;
        data[idx + 2] = 90;
        data[idx + 3] = 255;
      } else {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }
  return data;
}

interface RealWorkerHarnessRecord {
  readonly slotIndex: number;
  readonly worker: WorkerLike;
  readonly inboundTransferCounts: number[];
  readonly inboundTransferBytes: number[];
  terminated: boolean;
  triggerCrash: (message?: string) => void;
}

/**
 * 실제 `studio-offload-compute.worker.ts`의 `bindStudioOffloadComputeWorkerScope`를
 * 비동기 메시지 턴(setTimeout)으로 구동하는 테스트 브리지.
 * Transferable 전달 목록과 바이트 수를 기록하고, 크래시/지연 시나리오를 정밀 주입한다.
 */
function createRealWorkerBridge(options: {
  readonly slotIndex: number;
  readonly delayMs?: number;
  readonly hangForever?: boolean;
  readonly crashOnJobNumber?: number;
}): RealWorkerHarnessRecord {
  const delayMs = options.delayMs ?? 4;
  let terminated = false;
  let jobCounter = 0;
  const inboundTransferCounts: number[] = [];
  const inboundTransferBytes: number[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();

  let hostOnMessage: ((event: MessageEvent<StudioWorkerOutboundMessage>) => void) | null = null;
  let hostOnError: ((event: Event | ErrorEvent) => void) | null = null;

  const workerScope: StudioOffloadWorkerScope = {
    onmessage: null,
    postMessage(message: StudioWorkerOutboundMessage) {
      if (terminated) return;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (terminated) return;
        hostOnMessage?.({ data: message } as MessageEvent<StudioWorkerOutboundMessage>);
      }, 0);
      timers.add(timer);
    },
  };

  const unbind = bindStudioOffloadComputeWorkerScope(workerScope);

  const triggerCrash = (message = "인위적 워커 크래시 시뮬레이션"): void => {
    if (terminated) return;
    hostOnError?.({ message } as ErrorEvent);
  };

  const worker: WorkerLike = {
    get onmessage() {
      return hostOnMessage;
    },
    set onmessage(fn) {
      hostOnMessage = fn;
    },
    get onerror() {
      return hostOnError;
    },
    set onerror(fn) {
      hostOnError = fn;
    },
    onmessageerror: null,
    postMessage(message: StudioWorkerInboundMessage, transfer?: Transferable[]) {
      if (terminated) {
        throw new Error("종료된 워커에 postMessage를 호출했습니다.");
      }
      const list = transfer ?? [];
      inboundTransferCounts.push(list.length);
      let bytes = 0;
      for (const item of list) {
        if (item instanceof ArrayBuffer) bytes += item.byteLength;
      }
      inboundTransferBytes.push(bytes);

      if (message.kind === "run-job") {
        jobCounter += 1;
        if (options.crashOnJobNumber !== undefined && jobCounter === options.crashOnJobNumber) {
          const crashTimer = setTimeout(() => {
            timers.delete(crashTimer);
            triggerCrash(`슬롯 #${options.slotIndex} 작업 #${jobCounter} 크래시`);
          }, Math.max(1, delayMs));
          timers.add(crashTimer);
          return;
        }
        if (options.hangForever) {
          return;
        }
      }

      const timer = setTimeout(() => {
        timers.delete(timer);
        if (terminated) return;
        workerScope.onmessage?.({ data: message } as MessageEvent<StudioWorkerInboundMessage>);
      }, message.kind === "cancel-job" ? 0 : delayMs);
      timers.add(timer);
    },
    terminate() {
      terminated = true;
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
      unbind();
    },
  };

  return {
    slotIndex: options.slotIndex,
    worker,
    inboundTransferCounts,
    inboundTransferBytes,
    get terminated() {
      return terminated;
    },
    set terminated(val: boolean) {
      terminated = val;
    },
    triggerCrash,
  };
}

afterEach(() => {
  resetWasmPixelKernelCacheForTests();
  vi.restoreAllMocks();
});

describe("Wasm SIMD128 바이너리 프로브 및 실제 WebAssembly.instantiate() 픽셀 커널", () => {
  it("표준 41바이트 Wasm SIMD128(v128.const) 프로브와 기능 스냅샷을 실제 V8에서 검증한다", () => {
    expect(WASM_SIMD128_PROBE_BYTES.byteLength).toBe(41);
    // v128.const (0xfd, 0x0c) 명령어 바이트 존재 확인
    expect(WASM_SIMD128_PROBE_BYTES[13]).toBe(0xfd);
    expect(WASM_SIMD128_PROBE_BYTES[14]).toBe(0x0c);
    expect(WebAssembly.validate(WASM_SIMD128_PROBE_BYTES)).toBe(true);
    expect(WebAssembly.validate(WASM_SIMD128_FUNC_PROBE_BYTES)).toBe(true);

    const realSnapshot = probeWasmSimdAndWorkerSupport();
    expect(realSnapshot.webAssembly).toBe(true);
    expect(realSnapshot.wasmSimd128).toBe(true);
    expect(realSnapshot.probeBinaryByteLength).toBe(41);
    expect(realSnapshot.hardwareConcurrency).toBeGreaterThanOrEqual(1);
    expect(realSnapshot.recommendedPoolSize).toBe(
      computeDefaultPoolSize(realSnapshot.hardwareConcurrency),
    );

    // 전체 기능 활성(COI + SAB + Worker + SIMD128) 조합 검증
    const fullBrowserSnapshot = probeWasmSimdAndWorkerSupport({
      webAssembly: WebAssembly,
      sharedArrayBuffer: SharedArrayBuffer,
      crossOriginIsolated: true,
      offscreenCanvas: class MockOffscreenCanvas {},
      worker: class MockWorker {},
      hardwareConcurrency: 16,
    });
    expect(fullBrowserSnapshot.wasmSimd128).toBe(true);
    expect(fullBrowserSnapshot.wasmThreadsReady).toBe(true);
    expect(fullBrowserSnapshot.offscreenCanvas).toBe(true);
    expect(fullBrowserSnapshot.worker).toBe(true);
    expect(fullBrowserSnapshot.recommendedPoolSize).toBe(4);
    expect(fullBrowserSnapshot.recommendedBackendTier).toBe("worker-wasm-simd128");

    // WebAssembly 미지원 환경 안전 폴백 티어 검증
    const noWasmSnapshot = probeWasmSimdAndWorkerSupport({
      webAssembly: undefined,
      sharedArrayBuffer: undefined,
      crossOriginIsolated: false,
      offscreenCanvas: undefined,
      worker: undefined,
      hardwareConcurrency: 1,
    });
    expect(noWasmSnapshot.webAssembly).toBe(false);
    expect(noWasmSnapshot.wasmSimd128).toBe(false);
    expect(noWasmSnapshot.recommendedPoolSize).toBe(1);
    expect(noWasmSnapshot.recommendedBackendTier).toBe("main-js-fallback");
  });

  it("WASM_PIXEL_LUMA_INVERT_BYTES(스칼라)와 WASM_PIXEL_SIMD128_BYTES(v128) 모두 유효한 Wasm 모듈이다", () => {
    expect(WASM_PIXEL_LUMA_INVERT_BYTES.byteLength).toBeGreaterThan(200);
    expect(WASM_PIXEL_SIMD128_BYTES.byteLength).toBeGreaterThan(400);
    expect(WebAssembly.validate(WASM_PIXEL_LUMA_INVERT_BYTES)).toBe(true);
    expect(WebAssembly.validate(WASM_PIXEL_SIMD128_BYTES)).toBe(true);
  });

  it("6종 전체 픽셀 모드 × 비-4배수 크기에서 Wasm SIMD128 · Wasm 스칼라 · JS 레퍼런스가 100% 바이트 동치다", async () => {
    const modes: readonly WasmPixelKernelMode[] = [
      "invert",
      "luma",
      "contrast",
      "threshold",
      "alpha-mask-count",
      "alpha-threshold",
    ];
    const pixelCounts = [0, 1, 3, 4, 17, 103];
    const thresholds = [0, 64, 128, 200, 255];

    for (const pixelCount of pixelCounts) {
      const input = makeDeterministicRgba(pixelCount, pixelCount);
      const snapshotBefore = new Uint8ClampedArray(input);

      for (const mode of modes) {
        for (const threshold of thresholds) {
          const jsRef = runJsPixelKernelReference(input, mode, threshold);
          const scalarRes = await runWasmPixelKernel(input, mode, threshold, {
            forceBackend: "wasm-scalar",
          });
          const simdRes = await runWasmPixelKernel(input, mode, threshold, {
            forceBackend: "wasm-simd128",
          });

          expect(scalarRes.backend).toBe("wasm-scalar");
          expect(simdRes.backend).toBe("wasm-simd128");
          expect(simdRes.simdVectorPixels).toBe(pixelCount & ~3);
          expect(scalarRes.totalPixelCount).toBe(pixelCount);
          expect(simdRes.totalPixelCount).toBe(pixelCount);
          expect(scalarRes.matchedPixelCount).toBe(jsRef.matchedPixelCount);
          expect(simdRes.matchedPixelCount).toBe(jsRef.matchedPixelCount);
          expect(scalarRes.data).toEqual(jsRef.data);
          expect(simdRes.data).toEqual(jsRef.data);
        }
      }

      // 입력 버퍼 불변성 검증
      expect(input).toEqual(snapshotBefore);
    }
  });

  it("다중 Wasm 선형 메모리 페이지 확장(100,000픽셀 = 400KB) 및 instantiate 실패 시 JS 동치 폴백을 검증한다", async () => {
    const largeInput = makeDeterministicRgba(100_000, 7);
    const autoResult = await runWasmPixelKernel(largeInput, "luma", 140);
    const jsRef = runJsPixelKernelReference(largeInput, "luma", 140);

    expect(autoResult.backend).toBe("wasm-simd128");
    expect(autoResult.simdVectorPixels).toBe(100_000);
    expect(autoResult.matchedPixelCount).toBe(jsRef.matchedPixelCount);
    expectBytesEqual(autoResult.data, jsRef.data);

    // WebAssembly.instantiate 실패 시에도 JS 완전 동치 폴백이 동작해야 한다
    resetWasmPixelKernelCacheForTests();
    vi.spyOn(WebAssembly, "instantiate").mockRejectedValueOnce(new Error("simulated wasm failure"));
    vi.spyOn(WebAssembly, "instantiate").mockRejectedValueOnce(new Error("simulated scalar failure"));

    const fallbackInput = makeDeterministicRgba(29, 3);
    const fallbackRes = await runWasmPixelKernel(fallbackInput, "invert", 120);
    const expected = runJsPixelKernelReference(fallbackInput, "invert", 120);

    expect(fallbackRes.backend).toBe("js-fallback");
    expect(fallbackRes.matchedPixelCount).toBe(expected.matchedPixelCount);
    expect(fallbackRes.data).toEqual(expected.data);
  });
});

describe("StudioComputeWorkerPool + 실제 워커 엔트리 병렬 큐잉 · 제로-카피 · 취소 · 자동 복구", () => {
  it("동시 8작업(5종 연산 타입 포함)을 최대 4워커로 큐잉·병렬 완료하고 제로-카피 전송 바이트를 집계한다", async () => {
    const spawnedBridges: RealWorkerHarnessRecord[] = [];
    const pool = new StudioComputeWorkerPool({
      maxWorkers: 4,
      workerFactory: (slotIndex) => {
        const bridge = createRealWorkerBridge({ slotIndex, delayMs: 8 });
        spawnedBridges.push(bridge);
        return bridge.worker;
      },
    });

    const preview = createMasterFilterPreviewArtwork(32, 32);
    const circle = makeOpaqueCircleRgba(48, 48);

    const jobPromises = [
      pool.runJob({
        type: "master-filter-rgba",
        rgba: toExactArrayBuffer(new Uint8ClampedArray(preview)),
        width: 32,
        height: 32,
        filterId: "golden-sunset",
        intensity: 0.9,
      }),
      pool.runJob({
        type: "wasm-alpha-threshold",
        rgba: toExactArrayBuffer(makeDeterministicRgba(64 * 64, 1)),
        width: 64,
        height: 64,
        threshold: 128,
        mode: "alpha-threshold",
      }),
      pool.runJob({
        type: "die-cut-alpha",
        rgba: toExactArrayBuffer(new Uint8ClampedArray(circle)),
        width: 48,
        height: 48,
        options: { offsetPx: 4, alphaThreshold: 24, includeKeyringEyelet: true },
      }),
      pool.runJob({
        type: "lighting-extract",
        rgba: toExactArrayBuffer(new Uint8ClampedArray(preview)),
        width: 32,
        height: 32,
      }),
      pool.runJob({
        type: "offscreen-stroke-raster",
        width: 64,
        height: 64,
        points: [
          { x: 10, y: 12, pressure: 0.5 },
          { x: 32, y: 28, pressure: 0.9 },
          { x: 52, y: 48, pressure: 0.7 },
        ],
        colorRgba: [20, 45, 90, 230],
        radiusPx: 6,
        hardness: 0.6,
      }),
      pool.runJob({
        type: "wasm-alpha-threshold",
        rgba: toExactArrayBuffer(makeDeterministicRgba(32 * 32, 2)),
        width: 32,
        height: 32,
        threshold: 100,
        mode: "invert",
      }),
      pool.runJob({
        type: "master-filter-rgba",
        rgba: toExactArrayBuffer(new Uint8ClampedArray(preview)),
        width: 32,
        height: 32,
        filterId: "teal-orange-cinema",
        intensity: 0.85,
      }),
      pool.runJob({
        type: "wasm-alpha-threshold",
        rgba: toExactArrayBuffer(makeDeterministicRgba(32 * 32, 3)),
        width: 32,
        height: 32,
        threshold: 160,
        mode: "contrast",
      }),
    ] as const;

    // 제출 직후 4개는 실행 중, 4개는 큐 대기 중이어야 한다
    const midTelemetry = pool.getTelemetry();
    expect(midTelemetry.maxWorkers).toBe(4);
    expect(midTelemetry.activeWorkers).toBe(4);
    expect(midTelemetry.queuedJobs).toBe(4);
    expect(midTelemetry.backendTier).toBe("worker-wasm-simd128");

    const results = await Promise.all(jobPromises);

    expect(results[0].type).toBe("master-filter-rgba");
    expect(results[0].rgba.byteLength).toBe(32 * 32 * 4);
    expect(results[0].changedPixelRatio).toBeGreaterThan(0);

    expect(results[1].type).toBe("wasm-alpha-threshold");
    expect(results[1].wasmBackend).toBe("wasm-simd128");
    expect(results[1].simdVectorPixels).toBe(64 * 64);

    expect(results[2].type).toBe("die-cut-alpha");
    expect(results[2].cutline.hasOpaqueSubject).toBe(true);
    expect(results[2].cutline.svgPathD.length).toBeGreaterThan(10);
    expect(results[2].opaquePixelCount).toBeGreaterThan(100);
    expect(results[2].wasmBackend).toBe("wasm-simd128");

    expect(results[3].type).toBe("lighting-extract");
    expect(results[3].rig.keyTemperatureKelvin).toBeGreaterThanOrEqual(2400);
    expect(results[3].wasmBackend).toBe("wasm-simd128");

    expect(results[4].type).toBe("offscreen-stroke-raster");
    expect(results[4].dabCount).toBeGreaterThan(4);
    expect(results[4].paintedPixelCount).toBeGreaterThan(50);
    expect(results[4].rgba.byteLength).toBe(64 * 64 * 4);

    expect(results[5].type).toBe("wasm-alpha-threshold");
    expect(results[6].type).toBe("master-filter-rgba");
    expect(results[7].type).toBe("wasm-alpha-threshold");

    const finalTelemetry = pool.getTelemetry();
    expect(spawnedBridges.length).toBe(4);
    expect(finalTelemetry.activeWorkers).toBe(0);
    expect(finalTelemetry.queuedJobs).toBe(0);
    expect(finalTelemetry.completedJobs).toBe(8);
    expect(finalTelemetry.failedJobs).toBe(0);
    expect(finalTelemetry.avgJobMs).toBeGreaterThanOrEqual(0);
    expect(finalTelemetry.zeroCopyBytesTransferred).toBeGreaterThan(60_000);

    // 실제 워커 postMessage의 Transferable 배열에 ArrayBuffer가 전달됐는지 검증
    const totalInboundTransfers = spawnedBridges.reduce(
      (sum, bridge) => sum + bridge.inboundTransferBytes.reduce((a, b) => a + b, 0),
      0,
    );
    expect(totalInboundTransfers).toBeGreaterThan(30_000);

    pool.dispose();
    expect(spawnedBridges.every((bridge) => bridge.terminated)).toBe(true);
  });

  it("AbortSignal로 사전 취소 · 큐 대기 취소 · 실행 중 취소를 모두 정확히 처리한다", async () => {
    const pool = new StudioComputeWorkerPool({
      maxWorkers: 1,
      workerFactory: (slotIndex) => createRealWorkerBridge({ slotIndex, delayMs: 25 }).worker,
    });

    // 1) 이미 abort된 signal로 제출
    const preAborted = new AbortController();
    preAborted.abort();
    await expect(
      pool.runJob(
        {
          type: "wasm-alpha-threshold",
          rgba: toExactArrayBuffer(makeDeterministicRgba(16)),
          width: 4,
          height: 4,
        },
        { signal: preAborted.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError", code: "aborted" });

    // 2) 실행 중(in-flight) 취소 + 큐 대기 중 취소
    const inflightController = new AbortController();
    const queuedController = new AbortController();

    const inflightPromise = pool.runJob(
      {
        type: "wasm-alpha-threshold",
        rgba: toExactArrayBuffer(makeDeterministicRgba(256)),
        width: 16,
        height: 16,
      },
      { signal: inflightController.signal },
    );
    const queuedPromise = pool.runJob(
      {
        type: "wasm-alpha-threshold",
        rgba: toExactArrayBuffer(makeDeterministicRgba(256)),
        width: 16,
        height: 16,
      },
      { signal: queuedController.signal },
    );
    const survivorPromise = pool.runJob({
      type: "wasm-alpha-threshold",
      rgba: toExactArrayBuffer(makeDeterministicRgba(256)),
      width: 16,
      height: 16,
      threshold: 100,
    });

    queuedController.abort();
    inflightController.abort();

    await expect(queuedPromise).rejects.toMatchObject({ name: "AbortError", code: "aborted" });
    await expect(inflightPromise).rejects.toMatchObject({ name: "AbortError", code: "aborted" });

    // 취소 이후 살아남은 3번째 작업은 회수된 워커 슬롯에서 정상 완료돼야 한다
    const survivorResult = await survivorPromise;
    expect(survivorResult.type).toBe("wasm-alpha-threshold");
    expect(survivorResult.totalPixelCount).toBe(256);

    const telemetry = pool.getTelemetry();
    expect(telemetry.cancelledJobs).toBe(3);
    expect(telemetry.completedJobs).toBe(1);
    pool.dispose();
  });

  it("워커 크래시 발생 시 자동 재기동(Auto-Respawn)해 대기 및 후속 작업을 무중단 완료한다", async () => {
    let spawnCount = 0;
    const pool = new StudioComputeWorkerPool({
      maxWorkers: 1,
      maxRespawnsPerSlot: 3,
      workerFactory: (slotIndex) => {
        spawnCount += 1;
        // 1번째 워커 인스턴스만 1번째 작업 중 크래시 발생, 재기동된 2번째 워커는 정상 동작
        const bridge = createRealWorkerBridge({
          slotIndex,
          delayMs: 5,
          crashOnJobNumber: spawnCount === 1 ? 1 : undefined,
        });
        return bridge.worker;
      },
    });

    const crashingJob = pool.runJob({
      type: "wasm-alpha-threshold",
      rgba: toExactArrayBuffer(makeDeterministicRgba(64)),
      width: 8,
      height: 8,
    });
    const queuedAfterCrash = pool.runJob({
      type: "wasm-alpha-threshold",
      rgba: toExactArrayBuffer(makeDeterministicRgba(64, 5)),
      width: 8,
      height: 8,
      threshold: 90,
    });

    await expect(crashingJob).rejects.toBeInstanceOf(StudioWorkerPoolError);
    await expect(crashingJob).rejects.toMatchObject({ code: "worker-crashed" });

    // 자동 재기동된 새 워커가 큐에 있던 작업과 신규 작업을 정상 완료해야 한다
    const recoveredResult = await queuedAfterCrash;
    expect(recoveredResult.type).toBe("wasm-alpha-threshold");
    expect(recoveredResult.totalPixelCount).toBe(64);

    const followUpResult = await pool.runJob({
      type: "wasm-alpha-threshold",
      rgba: toExactArrayBuffer(makeDeterministicRgba(32, 9)),
      width: 8,
      height: 4,
      mode: "luma",
      threshold: 120,
    });
    expect(followUpResult.totalPixelCount).toBe(32);

    const telemetry = pool.getTelemetry();
    expect(spawnCount).toBe(2);
    expect(telemetry.crashedWorkerCount).toBe(1);
    expect(telemetry.respawnedWorkerCount).toBe(1);
    expect(telemetry.completedJobs).toBe(2);
    expect(telemetry.failedJobs).toBe(1);
    pool.dispose();
  });

  it("타임아웃 워치독이 응답 없는 워커를 종료·재기동하고 다음 작업을 정상 실행한다", async () => {
    let spawnCount = 0;
    const pool = new StudioComputeWorkerPool({
      maxWorkers: 1,
      jobTimeoutMs: 5_000,
      workerFactory: (slotIndex) => {
        spawnCount += 1;
        return createRealWorkerBridge({
          slotIndex,
          delayMs: 3,
          hangForever: spawnCount === 1,
        }).worker;
      },
    });

    await expect(
      pool.runJob(
        {
          type: "wasm-alpha-threshold",
          rgba: toExactArrayBuffer(makeDeterministicRgba(16)),
          width: 4,
          height: 4,
        },
        { timeoutMs: 40 },
      ),
    ).rejects.toMatchObject({ code: "timeout" });

    const nextResult = await pool.runJob({
      type: "wasm-alpha-threshold",
      rgba: toExactArrayBuffer(makeDeterministicRgba(16)),
      width: 4,
      height: 4,
    });
    expect(nextResult.totalPixelCount).toBe(16);

    const telemetry = pool.getTelemetry();
    expect(spawnCount).toBe(2);
    expect(telemetry.timedOutJobs).toBe(1);
    expect(telemetry.respawnedWorkerCount).toBe(1);
    expect(telemetry.completedJobs).toBe(1);
    pool.dispose();
  });

  it("Worker 미지원(Node/JSDOM) 비동기 마이크로태스크 폴백이 워커 결과와 100% 동치 결과를 반환한다", async () => {
    const inlinePool = new StudioComputeWorkerPool({
      maxWorkers: 2,
      forceInlineFallback: true,
    });
    const workerPool = new StudioComputeWorkerPool({
      maxWorkers: 2,
      workerFactory: (slotIndex) => createRealWorkerBridge({ slotIndex, delayMs: 2 }).worker,
    });

    const inputBytes = makeDeterministicRgba(64 * 32, 11);
    const [inlineWasm, workerWasm] = await Promise.all([
      inlinePool.runJob({
        type: "wasm-alpha-threshold",
        rgba: toExactArrayBuffer(new Uint8ClampedArray(inputBytes)),
        width: 64,
        height: 32,
        mode: "threshold",
        threshold: 135,
      }),
      workerPool.runJob({
        type: "wasm-alpha-threshold",
        rgba: toExactArrayBuffer(new Uint8ClampedArray(inputBytes)),
        width: 64,
        height: 32,
        mode: "threshold",
        threshold: 135,
      }),
    ]);

    expect(new Uint8ClampedArray(inlineWasm.rgba)).toEqual(new Uint8ClampedArray(workerWasm.rgba));
    expect(inlineWasm.matchedPixelCount).toBe(workerWasm.matchedPixelCount);
    expect(inlineWasm.wasmBackend).toBe("wasm-simd128");
    expect(inlinePool.getTelemetry().backendTier).toBe("main-wasm-simd128");
    expect(workerPool.getTelemetry().backendTier).toBe("worker-wasm-simd128");

    inlinePool.dispose();
    workerPool.dispose();
  });

  it("OffscreenCanvas 제어권 이전 헬퍼가 미지원 환경에서 안전 실패하고 지원 환경에서 워커로 Transfer한다", () => {
    // Node 기본 환경에서는 OffscreenCanvas 미지원으로 안전 실패
    const unsupported = transferCanvasControlToOffscreen({});
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) {
      expect(unsupported.reason).toBe("unsupported-runtime");
    }

    // OffscreenCanvas 지원 브라우저 환경 모사 검증
    class FakeOffscreenCanvas {
      width = 128;
      height = 128;
    }
    const originalOffscreen = globalThis.OffscreenCanvas;
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = FakeOffscreenCanvas;

    try {
      const fakeOffscreen = new FakeOffscreenCanvas();
      const transferred = transferCanvasControlToOffscreen({
        transferControlToOffscreen: () => fakeOffscreen as unknown as OffscreenCanvas,
      });
      expect(transferred.ok).toBe(true);

      const transferredObjects: Transferable[] = [];
      const postedKinds: string[] = [];
      const mockWorker: WorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage(message, transfer) {
          postedKinds.push(`${message.version}:${message.kind}`);
          if (transfer) transferredObjects.push(...transfer);
        },
        terminate: () => undefined,
      };

      const pool = new StudioComputeWorkerPool({
        maxWorkers: 1,
        workerFactory: () => mockWorker,
      });
      const attach = pool.attachOffscreenCanvas("primary-viewport", {
        transferControlToOffscreen: () => fakeOffscreen as unknown as OffscreenCanvas,
      });

      expect(attach.ok).toBe(true);
      expect(attach.usedWorkerTransfer).toBe(true);
      expect(attach.targetSlotIndex).toBe(0);
      expect(postedKinds).toContain(`${STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION}:attach-offscreen-canvas`);
      expect(transferredObjects).toContain(fakeOffscreen as unknown as Transferable);
      pool.dispose();
    } finally {
      if (originalOffscreen === undefined) {
        delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
      } else {
        (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = originalOffscreen;
      }
    }
  });
});
