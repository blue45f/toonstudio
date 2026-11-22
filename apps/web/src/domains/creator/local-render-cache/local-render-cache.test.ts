import { describe, expect, it } from "vitest";

import {
  DEFAULT_FAN_FUNDING_FEE_POLICY,
  HybridCacheIntegrityError,
  HybridCacheOfflineMissError,
  HybridCacheValidationError,
  LocalRenderAbortError,
  LocalRenderMemoryLimitError,
  allocateIntegerProportionally,
  buildR2ImmutableAssetUrl,
  compareCopyrightFingerprints,
  computeAssetSha256Hex,
  computeAutoWorkerConcurrency,
  computeCopyrightFingerprint,
  computeDHash64,
  computeDefaultMemoryBudgetBytes,
  createCopyrightTrackingRecord,
  createHybridTierAssetCache,
  createInlineLocalTileRuntime,
  createLocalRenderWorkerPool,
  createMemoryPersistentCacheAdapter,
  createWebWorkerTileRuntime,
  hammingDistance64,
  inspectLocalRenderCacheReadiness,
  multiplyKrwByBps,
  parseDHash64Hex,
  planFanFundingMilestones,
  scanManuscriptAgainstReferences,
  sha256PureHex,
  transformPixelSurface,
  type PixelSurfaceInput,
  type WebWorkerLike,
  type WebWorkerTileOutboundMessage,
} from "./index";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createStructuredArtwork(width: number, height: number, variant: "hero" | "distinct"): PixelSurfaceInput {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      let luma: number;
      if (variant === "hero") {
        // 비대칭 대각선 구도 + 우상단 원형 스포트라이트 + 좌하단 암부(웹툰 컷 명암 모사)
        const diag = 225 - nx * 120 - ny * 75;
        const spotDist = Math.hypot(nx - 0.78, ny - 0.24);
        const spot = spotDist < 0.22 ? 95 * (1 - spotDist / 0.22) : 0;
        const bar = nx > 0.16 && nx < 0.34 && ny > 0.42 && ny < 0.88 ? -95 : 0;
        luma = diag + spot + bar;
      } else {
        // 좌우·상하 기울기가 반전된 다중 체크 + 수직 스트라이프 구도
        const wave = Math.sin(nx * Math.PI * 5.2) * 75 + Math.cos(ny * Math.PI * 3.5) * 65;
        const ramp = 50 + nx * 135 - ny * 40;
        luma = ramp + wave;
      }
      const clamped = Math.max(0, Math.min(255, Math.round(luma)));
      const idx = (y * width + x) * 4;
      data[idx] = clamped;
      data[idx + 1] = clamped;
      data[idx + 2] = clamped;
      data[idx + 3] = 255;
    }
  }
  return { width, height, data, channels: 4 };
}

function addDeterministicNoise(surface: PixelSurfaceInput, amplitude: number): PixelSurfaceInput {
  const out = new Uint8ClampedArray(surface.data);
  let seed = 0x9e3779b9;
  for (let i = 0; i < out.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const delta = ((seed % (amplitude * 2 + 1)) - amplitude);
    for (let c = 0; c < 3; c += 1) {
      out[i + c] = Math.max(0, Math.min(255, (out[i + c] ?? 0) + delta));
    }
  }
  return { ...surface, data: out };
}

function rotateSmallAngleBilinear(surface: PixelSurfaceInput, degrees: number): PixelSurfaceInput {
  const { width, height, data } = surface;
  const out = new Uint8ClampedArray(width * height * 4);
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = Math.max(0, Math.min(width - 1, cx + dx * cos + dy * sin));
      const sy = Math.max(0, Math.min(height - 1, cy - dx * sin + dy * cos));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const dst = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const v00 = data[(y0 * width + x0) * 4 + c] ?? 0;
        const v10 = data[(y0 * width + x1) * 4 + c] ?? 0;
        const v01 = data[(y1 * width + x0) * 4 + c] ?? 0;
        const v11 = data[(y1 * width + x1) * 4 + c] ?? 0;
        const top = v00 * (1 - fx) + v10 * fx;
        const bot = v01 * (1 - fx) + v11 * fx;
        out[dst + c] = Math.round(top * (1 - fy) + bot * fy);
      }
      out[dst + 3] = 255;
    }
  }
  return { width, height, data: out, channels: 4 };
}

describe("LocalRenderWorkerPool", () => {
  it("auto-tunes concurrency from hardwareConcurrency and device memory", () => {
    expect(computeAutoWorkerConcurrency({ hardwareConcurrency: 1 })).toBe(1);
    expect(computeAutoWorkerConcurrency({ hardwareConcurrency: 4 })).toBe(3);
    expect(computeAutoWorkerConcurrency({ hardwareConcurrency: 8, deviceMemoryGb: 8 })).toBe(6);
    expect(computeAutoWorkerConcurrency({ hardwareConcurrency: 12, deviceMemoryGb: 2 })).toBe(2);
    expect(computeAutoWorkerConcurrency({ hardwareConcurrency: 32, maxConcurrency: 12 })).toBe(12);
    expect(computeAutoWorkerConcurrency({ hardwareConcurrency: -5 })).toBe(3);
    expect(computeDefaultMemoryBudgetBytes(2)).toBe(96 * 1024 * 1024);
    expect(computeDefaultMemoryBudgetBytes(16)).toBe(384 * 1024 * 1024);
  });

  it("dispatches interactive > export > background strictly within concurrency limit", async () => {
    const executionOrder: string[] = [];
    const gates = new Map<string, ReturnType<typeof createDeferred<string>>>();
    let activeNow = 0;
    let peakActive = 0;

    const pool = createLocalRenderWorkerPool<string, string>({
      concurrency: 1,
      runtime: createInlineLocalTileRuntime(async (tileId) => {
        activeNow += 1;
        peakActive = Math.max(peakActive, activeNow);
        executionOrder.push(tileId);
        const gate = gates.get(tileId);
        const result = gate ? await gate.promise : tileId;
        activeNow -= 1;
        return result;
      }),
    });

    const firstGate = createDeferred<string>();
    gates.set("seed-bg", firstGate);

    const pSeed = pool.enqueue({ id: "seed-bg", priority: "background", payload: "seed-bg" });
    const pBg = pool.enqueue({ id: "bg-1", priority: "background", payload: "bg-1" });
    const pExp = pool.enqueue({ id: "exp-1", priority: "export", payload: "exp-1" });
    const pIntFar = pool.enqueue({ id: "int-far", priority: "interactive", subPriority: 10, payload: "int-far" });
    const pIntNear = pool.enqueue({ id: "int-near", priority: "interactive", subPriority: 1, payload: "int-near" });

    firstGate.resolve("seed-bg");
    const results = await Promise.all([pSeed, pBg, pExp, pIntFar, pIntNear]);

    expect(results).toEqual(["seed-bg", "bg-1", "exp-1", "int-far", "int-near"]);
    expect(executionOrder).toEqual(["seed-bg", "int-near", "int-far", "exp-1", "bg-1"]);
    expect(peakActive).toBe(1);
    expect(pool.getSnapshot().completedCount).toBe(5);
    expect(pool.getSnapshot().zeroCloudCostKrw).toBe(0);
  });

  it("handles pre-aborted, queued-aborted, in-flight-aborted, and priority-batch cancellation", async () => {
    const started: string[] = [];
    const firstGate = createDeferred<string>();
    let inFlightSignalAborted = false;

    const pool = createLocalRenderWorkerPool<string, string>({
      concurrency: 1,
      runtime: createInlineLocalTileRuntime(async (tileId, ctx) => {
        started.push(tileId);
        ctx.signal.addEventListener("abort", () => {
          inFlightSignalAborted = true;
        });
        if (tileId === "running") {
          return firstGate.promise;
        }
        return `ok:${tileId}`;
      }),
    });

    const preAborted = new AbortController();
    preAborted.abort();
    await expect(
      pool.enqueue({ id: "pre", priority: "interactive", payload: "pre", signal: preAborted.signal }),
    ).rejects.toBeInstanceOf(LocalRenderAbortError);

    const runningCtrl = new AbortController();
    const queuedCtrl = new AbortController();
    const pRunning = pool.enqueue({ id: "running", priority: "interactive", payload: "running", signal: runningCtrl.signal });
    const pQueued = pool.enqueue({ id: "queued", priority: "export", payload: "queued", signal: queuedCtrl.signal });
    const pBg = pool.enqueue({ id: "bg-drop", priority: "background", payload: "bg-drop" });
    const pSurvive = pool.enqueue({ id: "survive", priority: "interactive", payload: "survive" });

    queuedCtrl.abort();
    await expect(pQueued).rejects.toBeInstanceOf(LocalRenderAbortError);

    expect(pool.cancelByPriority("background")).toBe(1);
    await expect(pBg).rejects.toBeInstanceOf(LocalRenderAbortError);

    runningCtrl.abort();
    await expect(pRunning).rejects.toBeInstanceOf(LocalRenderAbortError);
    expect(inFlightSignalAborted).toBe(true);

    expect(await pSurvive).toBe("ok:survive");
    expect(started).toEqual(["running", "survive"]);
    expect(pool.getSnapshot().cancelledCount).toBe(4);
    pool.dispose();
  });

  it("applies memory backpressure gate and wakes up when memory releases", async () => {
    const started: string[] = [];
    const gateA = createDeferred<string>();
    let externalBytes = 0;

    const pool = createLocalRenderWorkerPool<string, string>({
      concurrency: 4,
      maxMemoryBudgetBytes: 1000,
      softBackpressureRatio: 0.7,
      hardBackpressureRatio: 0.9,
      getExternalMemoryBytes: () => externalBytes,
      runtime: createInlineLocalTileRuntime(async (tileId) => {
        started.push(tileId);
        if (tileId === "heavy-a") return gateA.promise;
        return tileId;
      }),
    });

    await expect(
      pool.enqueue({ id: "too-big", priority: "interactive", payload: "too-big", estimatedBytes: 1001 }),
    ).rejects.toBeInstanceOf(LocalRenderMemoryLimitError);

    const pA = pool.enqueue({ id: "heavy-a", priority: "export", payload: "heavy-a", estimatedBytes: 750 });
    const pBg = pool.enqueue({ id: "bg-wait", priority: "background", payload: "bg-wait", estimatedBytes: 100 });
    const pHard = pool.enqueue({ id: "exp-wait", priority: "export", payload: "exp-wait", estimatedBytes: 200 });

    const snapDuring = pool.getSnapshot();
    expect(snapDuring.pressureState).toBe("elevated");
    expect(snapDuring.inFlightCount).toBe(1);
    expect(snapDuring.totalQueuedCount).toBe(2);
    expect(snapDuring.backpressurePauses).toBeGreaterThan(0);

    externalBytes = 950;
    gateA.resolve("heavy-a");
    await pA;
    // 외부 메모리가 아직 critical(950/1000)이므로 bg-wait(100B)는 대기 유지
    expect(pool.getSnapshot().pressureState).toBe("critical");
    expect(started).toEqual(["heavy-a"]);

    externalBytes = 0;
    pool.notifyMemoryReleased();
    expect(await Promise.all([pHard, pBg])).toEqual(["exp-wait", "bg-wait"]);
    expect(started).toEqual(["heavy-a", "exp-wait", "bg-wait"]);
  });

  it("terminates and respawns WebWorker slots cleanly on abort", async () => {
    let createdWorkers = 0;
    let terminatedWorkers = 0;
    const workers: {
      worker: WebWorkerLike;
      lastMessage: WebWorkerTileOutboundMessage<string> | null;
    }[] = [];

    const runtime = createWebWorkerTileRuntime<string, string>(() => {
      createdWorkers += 1;
      const entry: { worker: WebWorkerLike; lastMessage: WebWorkerTileOutboundMessage<string> | null } = {
        lastMessage: null,
        worker: {
          onmessage: null,
          onerror: null,
          postMessage(message) {
            entry.lastMessage = message as WebWorkerTileOutboundMessage<string>;
          },
          terminate() {
            terminatedWorkers += 1;
          },
        },
      };
      workers.push(entry);
      return entry.worker;
    });

    const pool = createLocalRenderWorkerPool<string, string>({ concurrency: 1, runtime });
    const abortCtrl = new AbortController();
    const pAborted = pool.enqueue({ id: "w-1", priority: "interactive", payload: "tile-1", signal: abortCtrl.signal });
    await Promise.resolve();
    abortCtrl.abort();
    await expect(pAborted).rejects.toBeInstanceOf(LocalRenderAbortError);
    expect(terminatedWorkers).toBe(1);

    const pNext = pool.enqueue({ id: "w-2", priority: "interactive", payload: "tile-2" });
    await Promise.resolve();
    const respawned = workers[1];
    expect(createdWorkers).toBe(2);
    expect(respawned?.lastMessage?.payload).toBe("tile-2");
    respawned?.worker.onmessage?.({ data: { type: "tile-result", taskId: "w-2", result: "rendered-2" } });
    expect(await pNext).toBe("rendered-2");

    pool.dispose();
    expect(terminatedWorkers).toBe(2);
  });
});

describe("HybridTierAssetCache", () => {
  it("matches NIST SHA-256 vectors in pure TS and Web Crypto and builds immutable R2 URLs", async () => {
    const empty = new Uint8Array(0);
    const abc = new TextEncoder().encode("abc");
    const emptyExpected = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const abcExpected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    expect(sha256PureHex(empty)).toBe(emptyExpected);
    expect(sha256PureHex(abc)).toBe(abcExpected);
    expect(await computeAssetSha256Hex(abc)).toBe(abcExpected);

    expect(buildR2ImmutableAssetUrl("https://cdn.toonstudio.cloud/", abcExpected, "webp")).toBe(
      `https://cdn.toonstudio.cloud/sha256/ba/${abcExpected}.webp`,
    );
    expect(() => buildR2ImmutableAssetUrl("https://cdn.toonstudio.cloud", "not-a-hash")).toThrow(
      HybridCacheValidationError,
    );
  });

  it("promotes L3 → L2 → L1, evicts by byte budget LRU, and reports exact per-tier hit rates", async () => {
    let clock = 1000;
    let l3FetchCalls = 0;
    const payloadA = new Uint8Array(60).fill(1);
    const payloadB = new Uint8Array(60).fill(2);
    const payloadC = new Uint8Array(60).fill(3);
    const hashA = await computeAssetSha256Hex(payloadA);
    const hashB = await computeAssetSha256Hex(payloadB);
    const hashC = await computeAssetSha256Hex(payloadC);
    const remoteStore = new Map<string, Uint8Array>([
      [hashA, payloadA],
      [hashB, payloadB],
      [hashC, payloadC],
    ]);

    const cache = createHybridTierAssetCache({
      r2BaseUrl: "https://assets.toonstudio.cloud",
      l2Adapter: createMemoryPersistentCacheAdapter(),
      maxL1Bytes: 120,
      maxL2Bytes: 120,
      now: () => {
        clock += 10;
        return clock;
      },
      l3Fetcher: {
        async fetchByHash({ sha256 }) {
          l3FetchCalls += 1;
          const bytes = remoteStore.get(sha256);
          if (!bytes) throw new Error("404");
          return { bytes, mimeType: "image/webp" };
        },
      },
    });

    // 1. 콜드 미스 → L3 적중 후 L2/L1 승격
    const rA1 = await cache.get(hashA);
    expect(rA1.tier).toBe("l3");
    expect(rA1.promotedToL1).toBe(true);

    // 2. 즉시 재조회 → L1 적중
    const rA2 = await cache.get(hashA);
    expect(rA2.tier).toBe("l1");

    // 3. B 조회(L3) → L1 = [A, B](120B). A를 다시 터치하면 B가 LRU가 됨.
    await cache.get(hashB);
    await cache.get(hashA);

    // 4. L1만 비우고 A 조회 → L2 적중 후 L1 재승격
    cache.clearL1();
    const rA3 = await cache.get(hashA);
    expect(rA3.tier).toBe("l2");
    expect(rA3.promotedToL1).toBe(true);

    // 5. C 조회(L3) → L2 예산(120B) 초과로 LRU였던 B가 L2에서 축출됨
    await cache.get(hashC);
    const tel = cache.getTelemetry();
    expect(l3FetchCalls).toBe(3);
    expect(tel.totalRequests).toBe(6);
    expect(tel.l1Hits + tel.l2Hits + tel.l3Hits + tel.misses).toBe(tel.totalRequests);
    expect(tel.l1Hits).toBe(2);
    expect(tel.l2Hits).toBe(1);
    expect(tel.l3Hits).toBe(3);
    expect(tel.localHitRate).toBeCloseTo(3 / 6, 5);
    expect(tel.l2Evictions).toBe(1);
    expect(tel.l2BytesUsed).toBe(120);
    expect(tel.estimatedR2EgressSavedBytes).toBe(180);
  });

  it("coalesces concurrent L3 requests, rejects tampered bytes, and serves L2 offline fallback", async () => {
    let online = true;
    let l3Calls = 0;
    const validBytes = new TextEncoder().encode("toonstudio-immutable-tile-payload");
    const validHash = await computeAssetSha256Hex(validBytes);
    const tamperedHash = await computeAssetSha256Hex(new TextEncoder().encode("expected-clean"));
    const gate = createDeferred<void>();

    const cache = createHybridTierAssetCache({
      r2BaseUrl: "https://assets.toonstudio.cloud",
      l2Adapter: createMemoryPersistentCacheAdapter(),
      isOnline: () => online,
      l3Fetcher: {
        async fetchByHash({ sha256 }) {
          l3Calls += 1;
          if (sha256 === validHash) {
            await gate.promise;
            return { bytes: validBytes, mimeType: "application/octet-stream" };
          }
          return { bytes: new TextEncoder().encode("corrupted-bytes"), mimeType: "application/octet-stream" };
        },
      },
    });

    // 동시 3건 요청 → L3 1회만 호출(single-flight)
    const pending = [cache.get(validHash), cache.get(validHash), cache.get(validHash)];
    gate.resolve();
    const results = await Promise.all(pending);
    expect(l3Calls).toBe(1);
    expect(results.filter((r) => r.coalesced)).toHaveLength(2);

    // 위변조 응답 차단
    await expect(cache.get(tamperedHash)).rejects.toBeInstanceOf(HybridCacheIntegrityError);
    expect(cache.getTelemetry().integrityFailures).toBe(1);

    // 오프라인 전환 후 L1 비움 → L2에서 무오류 오프라인 폴백
    online = false;
    cache.clearL1();
    const offlineHit = await cache.get(validHash);
    expect(offlineHit.tier).toBe("l2");
    expect(offlineHit.offlineFallback).toBe(true);
    expect(cache.getTelemetry().offlineFallbackHits).toBe(1);

    // 오프라인 + L1/L2 모두 없는 해시 → 명시적 오프라인 미스 오류
    const missingHash = await computeAssetSha256Hex(new TextEncoder().encode("never-cached"));
    await expect(cache.get(missingHash)).rejects.toBeInstanceOf(HybridCacheOfflineMissError);
  });
});

describe("PerceptualCopyrightFingerprint (64-bit dHash)", () => {
  it("produces deterministic 64-bit dHash and withstands resize, brightness shift, and noise", () => {
    const base = createStructuredArtwork(96, 72, "hero");
    const resized = createStructuredArtwork(48, 36, "hero");
    const noisy = addDeterministicNoise(base, 14);
    const brightenedData = new Uint8ClampedArray(base.data);
    for (let i = 0; i < brightenedData.length; i += 4) {
      brightenedData[i] = Math.min(255, Math.round((brightenedData[i] ?? 0) * 0.8 + 30));
      brightenedData[i + 1] = Math.min(255, Math.round((brightenedData[i + 1] ?? 0) * 0.8 + 30));
      brightenedData[i + 2] = Math.min(255, Math.round((brightenedData[i + 2] ?? 0) * 0.8 + 30));
    }
    const brightened: PixelSurfaceInput = { ...base, data: brightenedData };

    const hBase = computeDHash64(base);
    expect(hBase.hex).toMatch(/^[0-9a-f]{16}$/);
    expect(hBase.bits).toHaveLength(64);
    expect(parseDHash64Hex(hBase.hex).hex).toBe(hBase.hex);
    expect(hammingDistance64(hBase, computeDHash64(base))).toBe(0);
    expect(hammingDistance64(hBase, computeDHash64(resized))).toBeLessThanOrEqual(4);
    expect(hammingDistance64(hBase, computeDHash64(brightened))).toBeLessThanOrEqual(2);
    expect(hammingDistance64(hBase, computeDHash64(noisy))).toBeLessThanOrEqual(6);
  });

  it("detects small-angle rotation, 90/180/270-deg rotation, and mirror flips while separating distinct art", () => {
    const hero = createStructuredArtwork(96, 96, "hero");
    const distinct = createStructuredArtwork(96, 96, "distinct");
    const heroFp = computeCopyrightFingerprint(hero);
    const distinctFp = computeCopyrightFingerprint(distinct);

    // 소각도 회전(3.5°) 내성 검증
    const slightRotated = computeCopyrightFingerprint(rotateSmallAngleBilinear(hero, 3.5));
    const slightCmp = compareCopyrightFingerprints(slightRotated, heroFp, { checkOrientations: false });
    expect(slightCmp.canonicalDistance).toBeLessThanOrEqual(8);
    expect(slightCmp.warningRequired).toBe(true);

    // 90°/180°/270° 회전 및 좌우 반전 탐지 검증
    for (const orientation of ["90deg", "180deg", "270deg", "flip-h-0deg"] as const) {
      const transformed = computeCopyrightFingerprint(transformPixelSurface(hero, orientation));
      const cmp = compareCopyrightFingerprints(transformed, heroFp);
      expect(cmp.bestDistance).toBeLessThanOrEqual(2);
      expect(cmp.verdict).toBe("critical-duplicate");
      expect(cmp.warningRequired).toBe(true);
    }

    // 이질 작품 해밍 거리 분리 검증
    const distinctCmp = compareCopyrightFingerprints(distinctFp, heroFp);
    expect(distinctCmp.bestDistance).toBeGreaterThanOrEqual(19);
    expect(distinctCmp.verdict).toBe("distinct");
    expect(distinctCmp.warningRequired).toBe(false);

    // 레퍼런스 일괄 스캔 및 영수증 레코드 생성 검증
    const scan = scanManuscriptAgainstReferences(slightRotated, [
      { id: "ref-distinct", label: "다른 작품", fingerprint: distinctFp },
      { id: "ref-hero", label: "원본 레퍼런스", fingerprint: heroFp },
    ]);
    expect(scan.matches[0]?.referenceId).toBe("ref-hero");
    expect(scan.warningCount).toBe(1);
    expect(scan.zeroCloudCostKrw).toBe(0);

    const record = createCopyrightTrackingRecord({
      workId: "work-1",
      episodeId: "ep-12",
      cutId: "cut-04",
      creatorHandle: "artist-kim",
      surface: hero,
      capturedAtIso: "2026-11-22T00:00:00.000Z",
    });
    expect(record.schema).toBe("toonstudio.dhash-copyright-fingerprint/1");
    expect(record.fingerprint.canonical.hex).toBe(heroFp.canonical.hex);
  });
});

describe("FanFundingMilestonePlanner (1원 오차 0건 정수 정산)", () => {
  it("maintains zero 1-KRW reconciliation and tier-apportionment error across prime prices and bps rates", () => {
    const oddAllocated = allocateIntegerProportionally(100_003, [13_333, 27_777, 41_999, 7_777]);
    expect(oddAllocated.reduce((acc, v) => acc + v, 0)).toBe(100_003);
    expect(multiplyKrwByBps(13_333, 333)).toBe(444);

    for (let seed = 1; seed <= 30; seed += 1) {
      const plan = planFanFundingMilestones({
        projectTitle: `단행본 펀딩 시뮬레이션 #${seed}`,
        targetFundingKrw: 4_000_000 + seed * 11_111,
        fixedCostKrw: 1_150_000 + seed * 7_777,
        feePolicy: {
          platformFeeBps: 500 + (seed % 7) * 11,
          paymentFeeBps: 330 + (seed % 5) * 7,
          contingencyReserveBps: 450 + (seed % 9) * 13,
          feeVatBps: 1000,
        },
        tiers: [
          {
            id: "tier-a",
            name: "전자책 + 엽서",
            priceKrw: 13_333 + seed * 101,
            unitProductionCostKrw: 2_111,
            unitShippingCostKrw: 0,
            plannedBackerCount: 37 + seed,
          },
          {
            id: "tier-b",
            name: "단행본 1권",
            priceKrw: 27_777 + seed * 137,
            unitProductionCostKrw: 7_333,
            unitShippingCostKrw: 3_500,
            plannedBackerCount: 83 + seed * 2,
          },
          {
            id: "tier-c",
            name: "하드커버 한정판",
            priceKrw: 59_999 + seed * 211,
            unitProductionCostKrw: 18_777,
            unitShippingCostKrw: 4_200,
            plannedBackerCount: 29 + (seed % 11),
          },
        ],
      });

      const s = plan.plannedSettlement;
      expect(s.reconciliationErrorKrw).toBe(0);
      expect(s.tierAllocationErrorKrw).toBe(0);
      expect(s.totalCostAndDeductionsKrw + s.netCreatorProfitKrw).toBe(s.grossFundingKrw);
    }
  });

  it("solves exact integer BEP and detects negative-margin tiers and stretch-goal margin traps", () => {
    const plan = planFanFundingMilestones({
      projectTitle: "웹툰 시즌1 단행본 크라우드펀딩",
      targetFundingKrw: 1_500_000,
      fixedCostKrw: 1_200_000,
      feePolicy: DEFAULT_FAN_FUNDING_FEE_POLICY,
      tiers: [
        {
          id: "book",
          name: "단행본 기본 세트",
          priceKrw: 25_000,
          unitProductionCostKrw: 7_000,
          unitShippingCostKrw: 3_500,
          plannedBackerCount: 140,
          mixWeight: 7,
        },
        {
          id: "deluxe",
          name: "한정판 굿즈 세트",
          priceKrw: 55_000,
          unitProductionCostKrw: 16_000,
          unitShippingCostKrw: 4_000,
          plannedBackerCount: 60,
          mixWeight: 3,
        },
      ],
      milestones: [
        {
          id: "ms-100",
          title: "100% 출간 확정 + 투명 포토카드",
          unlockAmountKrw: 3_500_000,
          additionalFixedCostKrw: 150_000,
          additionalUnitCostKrw: 800,
        },
        {
          id: "ms-trap",
          title: "과도한 메탈 피규어 무료 증정",
          unlockAmountKrw: 5_000_000,
          additionalFixedCostKrw: 2_500_000,
          additionalUnitCostKrw: 18_000,
        },
      ],
    });

    expect(plan.breakEven.reachable).toBe(true);
    const bepBackers = plan.breakEven.breakEvenBackers ?? 0;
    expect(bepBackers).toBeGreaterThan(0);
    expect(plan.breakEven.netProfitAtBreakEvenKrw).toBeGreaterThanOrEqual(0);
    expect(plan.breakEven.isTargetAboveBep).toBe(false);
    expect(plan.breakEven.targetShortfallToBepKrw).toBeGreaterThan(0);

    // BEP - 1명(동일 티어 비중 배분)에서는 반드시 순수익이 음수임을 재검증
    const oneBelowCounts = allocateIntegerProportionally(bepBackers - 1, [7, 3]);
    const oneBelowPlan = planFanFundingMilestones({
      projectTitle: "BEP-1 검증",
      targetFundingKrw: 1_500_000,
      fixedCostKrw: 1_200_000,
      feePolicy: DEFAULT_FAN_FUNDING_FEE_POLICY,
      tiers: [
        {
          id: "book",
          name: "단행본 기본 세트",
          priceKrw: 25_000,
          unitProductionCostKrw: 7_000,
          unitShippingCostKrw: 3_500,
          plannedBackerCount: oneBelowCounts[0] ?? 0,
        },
        {
          id: "deluxe",
          name: "한정판 굿즈 세트",
          priceKrw: 55_000,
          unitProductionCostKrw: 16_000,
          unitShippingCostKrw: 4_000,
          plannedBackerCount: oneBelowCounts[1] ?? 0,
        },
      ],
    });
    expect(oneBelowPlan.plannedSettlement.netCreatorProfitKrw).toBeLessThan(0);

    // 마일스톤 수익 함정 감지 확인
    expect(plan.milestones[0]?.marginTrapDetected).toBe(false);
    expect(plan.milestones[0]?.netProfitAtUnlockKrw).toBeGreaterThan(0);
    expect(plan.milestones[1]?.marginTrapDetected).toBe(true);
    expect(plan.milestones[1]?.netProfitAtUnlockKrw).toBeLessThan(0);
    expect(plan.milestones[1]?.reconciliationErrorKrw).toBe(0);

    // 역마진 티어 경고 검증
    const inverted = planFanFundingMilestones({
      projectTitle: "역마진 테스트",
      targetFundingKrw: 1_000_000,
      fixedCostKrw: 500_000,
      feePolicy: DEFAULT_FAN_FUNDING_FEE_POLICY,
      tiers: [
        {
          id: "loss-tier",
          name: "원가 초과 리워드",
          priceKrw: 10_000,
          unitProductionCostKrw: 7_500,
          unitShippingCostKrw: 3_500,
          plannedBackerCount: 50,
        },
      ],
    });
    expect(inverted.plannedSettlement.tierBreakdowns[0]?.negativeMarginWarning).toBe(true);
    expect(inverted.plannedSettlement.tierBreakdowns[0]?.standaloneBreakEvenBackers).toBeNull();
    expect(inverted.breakEven.reachable).toBe(false);
  });

  it("summarizes studio local runtime readiness with zero cloud cost and zero KRW drift", () => {
    const readiness = inspectLocalRenderCacheReadiness();
    expect(readiness.autoWorkerCount).toBeGreaterThanOrEqual(1);
    expect(readiness.zeroCloudCostKrw).toBe(0);
    expect(readiness.sampleReconciliationErrorKrw).toBe(0);
    expect(readiness.sampleBepBackers).toBeGreaterThan(0);
  });
});
