import { describe, expect, it } from "vitest";

import {
  ACOUSTIC_ROOM_PRESETS,
  bake4dShLightfieldCache,
  ClientLocalP2pRenderAutoscaler,
  computeDeltaEOklab,
  createMulberry32Prng,
  createXoshiro128StarStarPrng,
  daltonizePaletteBiObjective,
  decodeFloat16,
  DifferentiableStrokeInverseSolver,
  encodeFloat16,
  evaluateShL2Basis,
  executeAndVerifyCanvasSequence,
  InMemorySyncAccessHandle,
  MAX_SH_PROBE_CACHE_BYTES,
  mergeCanvasReplicaPair,
  MMAP_PAGE_SIZE_BYTES,
  oklabToOklch,
  oklabToSrgb8,
  oklchToOklab,
  PageAlignedMmapWindowManager,
  restoreOriginalPaletteFromSidecar,
  runDeterministicCanvasFuzzCampaign,
  sampleLightfieldQuadrilinear,
  SH_RGB_SCALARS_PER_PROBE,
  simulateCvdSrgb8,
  solveDifferentiableStrokeInverse,
  srgb8ToOklab,
  synthesizeAudioToonImpulseResponse,
  WebGpuMultiQueueFenceSynchronizer,
  type CanvasFuzzCommand,
  type SrgbColor8,
  type Vec3,
} from "./index";

/** 테스트용 흰 배경(255) 흑백 타일에 가변 반경 브러시 다각선을 그린다. */
function stampVariableWidthCurve(
  width: number,
  height: number,
  sampleFn: (t: number) => { readonly x: number; readonly y: number; readonly radius: number },
  steps: number = 160,
): Uint8Array {
  const tile = new Uint8Array(width * height);
  tile.fill(255);
  for (let s = 0; s <= steps; s += 1) {
    const { x: cx, y: cy, radius } = sampleFn(s / steps);
    const margin = Math.ceil(radius + 1.5);
    const x0 = Math.max(0, Math.floor(cx - margin));
    const x1 = Math.min(width - 1, Math.ceil(cx + margin));
    const y0 = Math.max(0, Math.floor(cy - margin));
    const y1 = Math.min(height - 1, Math.ceil(cy + margin));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const cov = Math.max(0, Math.min(1, radius + 0.5 - dist));
        const gray = Math.round(255 * (1 - cov));
        const idx = y * width + x;
        if (gray < (tile[idx] ?? 255)) tile[idx] = gray;
      }
    }
  }
  return tile;
}

describe("wasm64-wave5-frontier: 1. 미분 가능 선화 역산 솔버", () => {
  it("가변 두께 곡선 래스터 타일에서 중심축 골격·필압 곡선·3차 Bézier를 복원하고 손실을 단조 감소시킨다", () => {
    const width = 64;
    const height = 48;
    const pixels = stampVariableWidthCurve(width, height, (t) => ({
      x: 8 + t * 48,
      y: 24 + Math.sin(t * Math.PI) * 9,
      radius: 1.1 + Math.sin(t * Math.PI) * 2.4,
    }));

    const result = solveDifferentiableStrokeInverse({
      pixels,
      width,
      height,
      format: "monochrome",
      inkPolarity: "dark-on-light",
      refineIterations: 8,
    });

    expect(result.serverCostKrw).toBe(0);
    expect(result.strokes.length).toBeGreaterThanOrEqual(1);
    const mainStroke = result.strokes[0]!;
    expect(mainStroke.closed).toBe(false);
    expect(mainStroke.points.length).toBeGreaterThanOrEqual(3);
    expect(mainStroke.catmullRomSpans.length).toBe(mainStroke.bezierSegments.length);
    expect(mainStroke.totalArcLengthPx).toBeGreaterThan(40);

    for (const pt of mainStroke.points) {
      expect(pt.pressure).toBeGreaterThanOrEqual(0);
      expect(pt.pressure).toBeLessThanOrEqual(1);
    }
    const startP = mainStroke.points[0]!.pressure;
    const endP = mainStroke.points[mainStroke.points.length - 1]!.pressure;
    expect(mainStroke.maxPressure).toBeGreaterThan(Math.min(startP, endP));

    expect(result.refinedLossMse).toBeLessThanOrEqual(result.initialLossMse + 1e-9);
    expect(result.iouScore).toBeGreaterThan(0.72);
  });

  it("RGBA X-교차 선화를 접선 연속성으로 병합하고 닫힌 원형 고리를 closed 스트로크로 추출한다", () => {
    const width = 56;
    const height = 56;
    const monoCross = new Uint8Array(width * height).fill(255);
    const lineA = stampVariableWidthCurve(width, height, (t) => ({ x: 8 + t * 40, y: 8 + t * 40, radius: 1.6 }));
    const lineB = stampVariableWidthCurve(width, height, (t) => ({ x: 8 + t * 40, y: 48 - t * 40, radius: 1.6 }));
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      const dark = Math.min(monoCross[i]!, lineA[i]!, lineB[i]!);
      rgba[i * 4] = dark;
      rgba[i * 4 + 1] = dark;
      rgba[i * 4 + 2] = dark;
      rgba[i * 4 + 3] = 255;
    }

    const solver = new DifferentiableStrokeInverseSolver({ format: "rgba", refineIterations: 4 });
    const crossRes = solver.solveTile(rgba, width, height);
    expect(crossRes.strokes.length).toBe(2);
    expect(crossRes.iouScore).toBeGreaterThan(0.7);

    const ringMono = stampVariableWidthCurve(width, height, (t) => ({
      x: 28 + Math.cos(t * Math.PI * 2) * 14,
      y: 28 + Math.sin(t * Math.PI * 2) * 14,
      radius: 1.8,
    }), 200);
    const ringRes = solveDifferentiableStrokeInverse({ pixels: ringMono, width, height, refineIterations: 4 });
    expect(ringRes.strokes.some((s) => s.closed)).toBe(true);
    expect(() => solveDifferentiableStrokeInverse({ pixels: new Uint8Array(4), width: 16, height: 16 })).toThrow(RangeError);
  });
});

describe("wasm64-wave5-frontier: 2. 3D 음향 레이마칭 및 4D 구면 조화 라이트필드 캐시", () => {
  it("석조 복도·목조 방·야외 골목·유리 아트리움의 Sabine/Eyring RT60과 스크롤·차폐 스테레오 IR을 합성한다", () => {
    expect(Object.keys(ACOUSTIC_ROOM_PRESETS)).toEqual([
      "stone-corridor",
      "timber-room",
      "outdoor-alley",
      "glass-atrium",
    ]);

    const stone = synthesizeAudioToonImpulseResponse({
      presetId: "stone-corridor",
      sourcePosition: [0.6, 1.6, 15.0],
      listenerStart: [1.3, 1.6, 2.0],
      listenerEnd: [1.3, 1.6, 12.0],
      scrollNormalized: 0.0,
      scrollVelocityNormPerSec: 0,
    });
    const timber = synthesizeAudioToonImpulseResponse({
      presetId: "timber-room",
      sourcePosition: [2.2, 1.4, 4.2],
      listenerStart: [2.2, 1.4, 1.2],
    });
    const alley = synthesizeAudioToonImpulseResponse({
      presetId: "outdoor-alley",
      sourcePosition: [1.6, 1.5, 10.0],
      listenerStart: [1.6, 1.5, 2.0],
    });
    const atrium = synthesizeAudioToonImpulseResponse({
      presetId: "glass-atrium",
      sourcePosition: [11.0, 2.0, 12.0],
      listenerStart: [4.0, 1.7, 3.0],
    });

    expect(stone.eyringRt60MidSec).toBeGreaterThan(timber.eyringRt60MidSec);
    expect(atrium.eyringRt60MidSec).toBeGreaterThan(timber.eyringRt60MidSec);
    // 고흡음 야외 골목에서는 Eyring RT60이 Sabine 추정치보다 엄격히 짧아야 한다
    expect(alley.eyringRt60MidSec).toBeLessThan(alley.sabineRt60MidSec);
    expect(stone.earlyReflections.length).toBe(18);
    expect(stone.serverCostKrw).toBe(0);

    // 스크롤 전진 및 양의 스크롤 속도 -> 도달 지연 단축 + 도플러 피치 상승 + 차폐 감쇠 확인
    const scrolledOccluded = synthesizeAudioToonImpulseResponse({
      presetId: "stone-corridor",
      sourcePosition: [0.6, 1.6, 15.0],
      listenerStart: [1.3, 1.6, 2.0],
      listenerEnd: [1.3, 1.6, 12.0],
      scrollNormalized: 0.85,
      scrollVelocityNormPerSec: 1.2,
      occluders: [{ min: [0.2, 0.0, 12.5], max: [2.4, 3.2, 13.5], transmissionGain: 0.35 }],
    });
    expect(scrolledOccluded.directDelayMs).toBeLessThan(stone.directDelayMs);
    expect(scrolledOccluded.dopplerPitchRatio).toBeGreaterThan(1.0);
    expect(scrolledOccluded.earlyReflections.some((t) => t.occluded)).toBe(true);
    expect(scrolledOccluded.leftImpulse.length).toBe(scrolledOccluded.rightImpulse.length);
  });

  it("4개 시간대 L2 구면 조화 그리드를 32 KiB 미만으로 압축하고 시공간 4선형 보간을 O(1)로 수행한다", () => {
    for (const sample of [0, -0.375, 1.25, 14.5, -0.002]) {
      expect(decodeFloat16(encodeFloat16(sample))).toBeCloseTo(sample, 2);
    }

    const cache = bake4dShLightfieldCache({
      dims: [4, 4, 4],
      boundsMin: [0, 0, 0],
      boundsMax: [10, 6, 10],
    });
    expect(cache.byteLength).toBeLessThan(MAX_SH_PROBE_CACHE_BYTES);
    expect(cache.probeCountPerTimeSlice).toBe(64);
    expect(cache.totalStoredProbes).toBe(256);
    expect(cache.serverCostKrw).toBe(0);

    const midnight = sampleLightfieldQuadrilinear(cache, [5, 3, 5], [0, 1, 0], 0);
    const dawn = sampleLightfieldQuadrilinear(cache, [5, 3, 5], [0, 1, 0], 6);
    const noon = sampleLightfieldQuadrilinear(cache, [5, 3, 5], [0, 1, 0], 12);
    const lateEvening = sampleLightfieldQuadrilinear(cache, [5, 4.5, 5], [-0.7, 0.7, 0], 21);

    const luma = (rgb: Vec3): number => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    expect(luma(noon.diffuseIrradianceRgb)).toBeGreaterThan(luma(dawn.diffuseIrradianceRgb));
    expect(luma(dawn.diffuseIrradianceRgb)).toBeGreaterThan(luma(midnight.diffuseIrradianceRgb));
    expect(lateEvening.bracketSlices).toEqual(["sunset", "midnight"]);
    expect(lateEvening.timeBlendFactor).toBeCloseTo(0.5, 5);

    // 선형 공간 필드 투영 시 3선형 공간 보간 정확성 검증
    const linearCache = bake4dShLightfieldCache(
      { dims: [3, 3, 3], boundsMin: [0, 0, 0], boundsMax: [4, 4, 4] },
      {},
      (_slice, pos) => {
        const arr = new Float32Array(SH_RGB_SCALARS_PER_PROBE);
        arr[0] = pos[0] * 0.25 + pos[1] * 0.5 + pos[2] * 0.125;
        return arr;
      },
    );
    const midSample = sampleLightfieldQuadrilinear(linearCache, [1.6, 2.4, 3.2], [0, 1, 0], 12);
    expect(midSample.shCoeffsRgb[0]).toBeCloseTo(1.6 * 0.25 + 2.4 * 0.5 + 3.2 * 0.125, 2);

    // 32 KiB 한도 초과 그리드 방어 검증
    expect(() =>
      bake4dShLightfieldCache({ dims: [6, 6, 6], boundsMin: [0, 0, 0], boundsMax: [1, 1, 1] }),
    ).toThrow(RangeError);
  });
});

describe("wasm64-wave5-frontier: 3. 결정론적 캔버스 상태 퍼저 및 무손실 CVD 달토나이저", () => {
  it("xoshiro128** 및 mulberry32 시드 고정 퍼징에서 수천 건의 캔버스·CRDT 4대 불변식을 100% 통과한다", () => {
    const rngA = createXoshiro128StarStarPrng(20261127);
    const rngB = createXoshiro128StarStarPrng(20261127);
    const mulA = createMulberry32Prng(20261127);
    const mulB = createMulberry32Prng(20261127);
    for (let i = 0; i < 16; i += 1) {
      expect(rngA.nextUint32()).toBe(rngB.nextUint32());
      expect(mulA.nextUint32()).toBe(mulB.nextUint32());
    }

    const reportXo = runDeterministicCanvasFuzzCampaign({
      seed: 424242,
      prngAlgorithm: "xoshiro128**",
      sequenceCount: 30,
      operationsPerSequence: 75,
    });
    expect(reportXo.allInvariantsPassed).toBe(true);
    expect(reportXo.totalOperationsExecuted).toBeGreaterThanOrEqual(2250);
    expect(reportXo.violation).toBeNull();
    expect(reportXo.serverCostKrw).toBe(0);

    const reportMul = runDeterministicCanvasFuzzCampaign({
      seed: 777777,
      prngAlgorithm: "mulberry32",
      sequenceCount: 20,
      operationsPerSequence: 60,
    });
    expect(reportMul.allInvariantsPassed).toBe(true);

    // 오프라인 파티션 동시 편집 후 CRDT 교환법칙·멱등성 직접 검증
    const seq: CanvasFuzzCommand[] = [
      { kind: "offline-partition" },
      { kind: "add-layer", replica: "local", layerId: "layer-fx", orderKey: 15 },
      { kind: "draw-stroke", replica: "local", layerId: "layer-fx", strokeId: "st-1", checksum: 111 },
      { kind: "add-layer", replica: "peer", layerId: "layer-bg2", orderKey: 5 },
      { kind: "draw-stroke", replica: "peer", layerId: "layer-0", strokeId: "st-2", checksum: 222 },
      { kind: "undo", replica: "local" },
      { kind: "redo", replica: "local" },
    ];
    const diverged = executeAndVerifyCanvasSequence(seq);
    expect(diverged.violation).toBeNull();
    const ab = mergeCanvasReplicaPair(diverged.finalState.local, diverged.finalState.peer);
    const ba = mergeCanvasReplicaPair(diverged.finalState.peer, diverged.finalState.local);
    const idemp = mergeCanvasReplicaPair(ab.local, ab.local);
    expect(ab.local.contentDigest).toBe(ba.local.contentDigest);
    expect(idemp.local.contentDigest).toBe(ab.local.contentDigest);
  });

  it("결함 주입 시 불변식 위반을 즉시 포착하고 델타 디버깅으로 최소 반례로 축소한다", () => {
    const buggyReport = runDeterministicCanvasFuzzCampaign({
      seed: 9001,
      sequenceCount: 10,
      operationsPerSequence: 50,
      faultInjector: (snap, cmd) => {
        if (cmd.kind === "reorder-layer" && cmd.replica === "local") {
          const corruptedLayers = new Map(snap.local.layers);
          corruptedLayers.delete("layer-0");
          return {
            ...snap,
            local: {
              ...snap.local,
              layers: corruptedLayers,
              activeLayerOrder: snap.local.activeLayerOrder.filter((id) => id !== "layer-0"),
            },
          };
        }
        return snap;
      },
    });

    expect(buggyReport.allInvariantsPassed).toBe(false);
    expect(buggyReport.violation?.invariant).toBe("no-lost-layer-ids");
    expect(buggyReport.shrunkCounterexample).not.toBeNull();
    expect(buggyReport.shrunkCounterexample!.length).toBeLessThanOrEqual(2);
    expect(buggyReport.shrunkCounterexample!.length).toBeLessThan(buggyReport.failingSequence!.length);
  });

  it("적색맹·녹색맹·청색맹 혼동 팔레트의 지각 대비를 보장하고 무손실 사이드카로 원작 색상을 복원한다", () => {
    const artistPalette: readonly SrgbColor8[] = [
      [212, 52, 48],  // 채도 높은 적색
      [48, 148, 56],  // 혼동되기 쉬운 녹색
      [14, 14, 16],   // 먹선 흑색
      [250, 249, 245], // 원고지 백색
    ];

    const deuterResult = daltonizePaletteBiObjective({
      palette: artistPalette,
      targetMode: "deuteranopia",
      minCvdDeltaE: 0.11,
    });
    expect(deuterResult.simulatedBeforeMinDeltaE).toBeLessThan(0.08);
    expect(deuterResult.simulatedAfterMinDeltaE).toBeGreaterThanOrEqual(0.11);
    expect(deuterResult.contrastSatisfied).toBe(true);
    expect(deuterResult.meanOriginalDriftDeltaE).toBeLessThan(0.18);
    // 무채색 먹선·원고지 극단값 보존 확인
    expect(deuterResult.daltonizedPalette[2]).toEqual([14, 14, 16]);
    expect(deuterResult.daltonizedPalette[3]).toEqual([250, 249, 245]);

    const restored = restoreOriginalPaletteFromSidecar(deuterResult.losslessSidecar);
    expect(restored).toEqual(artistPalette);

    // 3종 색각 이상 동시 최적화(Protanopia + Deuteranopia + Tritanopia) 검증
    const triConfusePalette: readonly SrgbColor8[] = [
      [210, 58, 52],
      [52, 150, 62],
      [65, 125, 220],
      [60, 155, 140],
    ];
    const omniResult = daltonizePaletteBiObjective({
      palette: triConfusePalette,
      targetMode: "all-dichromats",
      minCvdDeltaE: 0.085,
    });
    expect(omniResult.contrastSatisfied).toBe(true);
    for (const mode of ["protanopia", "deuteranopia", "tritanopia"] as const) {
      const sim = omniResult.daltonizedPalette.map((c) => simulateCvdSrgb8(c, mode, 1.0));
      for (let i = 0; i < sim.length; i += 1) {
        for (let j = i + 1; j < sim.length; j += 1) {
          expect(computeDeltaEOklab(sim[i]!, sim[j]!)).toBeGreaterThanOrEqual(0.085 - 1e-6);
        }
      }
    }
  });
});

describe("wasm64-wave5-frontier: 4. 64 KiB 제로카피 Mmap · WebGPU 멀티-큐 펜스 · 로컬/P2P 오토스케일러", () => {
  it("64 KiB 페이지 정렬 제로카피 서브뷰 매핑, 핀 고정 보호, 연속 더티 페이지 병합 쓰기를 수행한다", () => {
    const backing = new InMemorySyncAccessHandle(MMAP_PAGE_SIZE_BYTES * 8);
    const manager = new PageAlignedMmapWindowManager(backing, 4);

    // 페이지 1, 2, 3, 4를 역순으로 더티 매핑하여 정렬 병합 쓰기 검증
    for (const pageIdx of [3, 1, 4, 2]) {
      const win = manager.mapWindow(BigInt(pageIdx) * BigInt(MMAP_PAGE_SIZE_BYTES), 256, "readwrite");
      expect(win.zeroCopySlabBacked).toBe(true);
      expect(win.view.buffer).toBe(manager.slabBuffer);
      win.view[0] = pageIdx * 11;
      win.view[255] = pageIdx * 17;
    }
    // 캐시 히트 검증
    const cachedHit = manager.mapWindow(BigInt(2) * BigInt(MMAP_PAGE_SIZE_BYTES) + BigInt(128), 128, "readonly");
    expect(cachedHit.view[127]).toBe(34);
    expect(manager.getTelemetry().zeroCopyHits).toBe(1);

    // 4개 연속 가상 페이지(1..4)가 단일 256 KiB write() 호출로 병합되는지 확인
    const flushStats = manager.flushDirtyPages();
    expect(flushStats.flushedPages).toBe(4);
    expect(flushStats.writeCalls).toBe(1);
    expect(flushStats.savedSyscalls).toBe(3);
    expect(backing.writeHistory[0]).toEqual({
      byteOffset: MMAP_PAGE_SIZE_BYTES,
      byteLength: MMAP_PAGE_SIZE_BYTES * 4,
      pageCount: 4,
    });

    // 핀 고정 및 교체 검증
    manager.pinPage(1);
    manager.pinPage(2);
    manager.pinPage(3);
    const evictedIntoSlot4 = manager.mapWindow(BigInt(6) * BigInt(MMAP_PAGE_SIZE_BYTES), 64, "readonly");
    expect(evictedIntoSlot4.virtualPageIndex).toBe(BigInt(6));
    manager.pinPage(6);
    expect(() => manager.mapWindow(BigInt(7) * BigInt(MMAP_PAGE_SIZE_BYTES), 64)).toThrow();
    manager.unpinPage(6);
    backing.close();
  });

  it("Graphics·Compute·Copy 3-큐 리소스 해저드 펜스를 자동 합성하고 순환 대기 데드락을 거부한다", () => {
    const sync = new WebGpuMultiQueueFenceSynchronizer();
    const validPipeline = sync.submitBatch([
      { label: "upload-voxels", queue: "copy", resources: [{ resourceId: "buf-vox", access: "write" }] },
      {
        label: "skin-and-cull",
        queue: "compute",
        resources: [
          { resourceId: "buf-vox", access: "read" },
          { resourceId: "buf-indirect", access: "write" },
        ],
      },
      {
        label: "toon-gbuffer",
        queue: "graphics",
        resources: [
          { resourceId: "buf-indirect", access: "read" },
          { resourceId: "tex-hdr", access: "write" },
        ],
      },
      {
        label: "bloom-downsample",
        queue: "compute",
        resources: [{ resourceId: "tex-hdr", access: "read" }],
      },
    ]);

    expect(validPipeline.accepted).toBe(true);
    expect(validPipeline.submissions).toHaveLength(4);
    // graphics -> compute -> graphics 왕복이라도 타임라인 값이 단조 증가하므로 비순환 승인!
    expect(validPipeline.submissions[1]!.resolvedWaits).toEqual([{ queue: "copy", fenceValue: BigInt(1) }]);
    expect(validPipeline.submissions[2]!.resolvedWaits).toEqual([{ queue: "compute", fenceValue: BigInt(1) }]);
    expect(validPipeline.submissions[3]!.resolvedWaits).toEqual([{ queue: "graphics", fenceValue: BigInt(1) }]);

    expect(sync.completeUpTo("copy", BigInt(1))).toBe(BigInt(1));
    expect(sync.completeUpTo("compute", BigInt(1))).toBe(BigInt(1));
    expect(sync.completeUpTo("graphics", BigInt(1))).toBe(BigInt(1));
    expect(sync.completeUpTo("compute", BigInt(2))).toBe(BigInt(2));

    // 교차 큐 상호 대기 데드락 거부 검증 (상태 오염 0)
    const prevGraphicsSubmitted = sync.getSubmittedFence("graphics");
    const deadlockBatch = sync.submitBatch([
      { label: "gfx-deadlock", queue: "graphics", waits: [{ queue: "compute", fenceValue: BigInt(3) }] },
      { label: "cmp-deadlock", queue: "compute", waits: [{ queue: "graphics", fenceValue: BigInt(2) }] },
    ]);
    expect(deadlockBatch.accepted).toBe(false);
    expect(deadlockBatch.deadlockReasonKo).toContain("데드락");
    expect(sync.getSubmittedFence("graphics")).toBe(prevGraphicsSubmitted);

    // 미제출 미래 펜스 대기 거부 검증
    const futureWait = sync.submitBatch([
      { label: "orphan-wait", queue: "graphics", waits: [{ queue: "copy", fenceValue: BigInt(99) }] },
    ]);
    expect(futureWait.accepted).toBe(false);
  });

  it("프레임 EWMA·발열 한도·신뢰 피어 RTT를 기반으로 로컬 워커와 P2P 샤드를 ₩0 비용으로 스케일링한다", () => {
    const autoscaler = new ClientLocalP2pRenderAutoscaler({
      minLocalWorkers: 1,
      maxLocalWorkers: 4,
      maxP2pPeers: 2,
      targetFrameMs: 16.67,
      maxPeerRttMs: 40,
      cooldownFrames: 2,
    });

    // 과부하 발생 -> 로컬 워커 우선 확장
    const step1 = autoscaler.step({ frameDurationMs: 28.5, queueDepthTiles: 14 });
    expect(step1.action).toBe("scale-up-local");
    expect(step1.localWorkerCount).toBe(4);
    expect(step1.serverCostKrw).toBe(0);
    expect(step1.cloudFallbackUsed).toBe(false);

    // 로컬 워커 포화 + 지속 과부하 -> 신뢰된 저지연 P2P 피어에게만 샤드 위임 (비신뢰·고지연 피어 제외)
    const step2 = autoscaler.step({
      frameDurationMs: 24.0,
      queueDepthTiles: 20,
      peers: [
        { peerId: "peer-lan-fast", rttMs: 12, availableSlots: 3, trustedSameSession: true },
        { peerId: "peer-untrusted", rttMs: 8, availableSlots: 8, trustedSameSession: false },
        { peerId: "peer-high-rtt", rttMs: 120, availableSlots: 4, trustedSameSession: true },
      ],
    });
    expect(step2.action).toBe("delegate-p2p");
    expect(step2.activeP2pPeerCount).toBe(1);
    expect(step2.peerAssignments[0]?.peerId).toBe("peer-lan-fast");
    expect(step2.p2pAssignedTiles).toBeGreaterThan(0);
    expect(step2.localAssignedTiles + step2.p2pAssignedTiles).toBe(20);

    // 발열 제한 시 워커 상한 자동 축소 검증
    const stepThermal = autoscaler.step({ frameDurationMs: 19.0, queueDepthTiles: 6, thermalHeadroom01: 0.5 });
    expect(stepThermal.localWorkerCount).toBeLessThanOrEqual(2);

    // 유휴 프레임 연속 진입 시 쿨다운 후 스케일 다운 검증
    for (let k = 0; k < 10; k += 1) {
      autoscaler.step({ frameDurationMs: 5.0, queueDepthTiles: 1, thermalHeadroom01: 1.0 });
    }
    const idleStep = autoscaler.step({ frameDurationMs: 5.0, queueDepthTiles: 1, thermalHeadroom01: 1.0 });
    expect(idleStep.localWorkerCount).toBe(1);
    expect(idleStep.p2pAssignedTiles).toBe(0);
  });

  it("빈 타일·light-on-dark 반전 선화·양귀 스테레오 패닝·L2 기저 대칭·OKLCH 왕복 정밀도를 검증한다", () => {
    const emptyTile = new Uint8Array(32 * 32).fill(255);
    const emptySolved = solveDifferentiableStrokeInverse({ pixels: emptyTile, width: 32, height: 32 });
    expect(emptySolved.strokes).toHaveLength(0);
    expect(emptySolved.iouScore).toBe(1);

    // 어두운 배경 위 밝은 선화(light-on-dark) 복원
    const darkOnLight = stampVariableWidthCurve(40, 28, (t) => ({ x: 6 + t * 28, y: 14, radius: 1.8 }));
    const lightOnDark = darkOnLight.map((v) => 255 - v);
    const invSolved = solveDifferentiableStrokeInverse({
      pixels: lightOnDark,
      width: 40,
      height: 28,
      inkPolarity: "light-on-dark",
      refineIterations: 3,
    });
    expect(invSolved.strokes).toHaveLength(1);
    expect(invSolved.iouScore).toBeGreaterThan(0.75);

    // 좌측 음원 vs 우측 음원의 양귀 게인 역전 검증
    const leftSrcIr = synthesizeAudioToonImpulseResponse({
      presetId: "timber-room",
      sourcePosition: [4.2, 1.5, 3.5],
      listenerStart: [2.25, 1.5, 1.0],
      listenerForward: [0, 0, 1],
    });
    const rightSrcIr = synthesizeAudioToonImpulseResponse({
      presetId: "timber-room",
      sourcePosition: [0.3, 1.5, 3.5],
      listenerStart: [2.25, 1.5, 1.0],
      listenerForward: [0, 0, 1],
    });
    expect(leftSrcIr.directLeftGain).toBeGreaterThan(leftSrcIr.directRightGain);
    expect(rightSrcIr.directRightGain).toBeGreaterThan(rightSrcIr.directLeftGain);

    // L2 구면 조화 기저 우함수/기함수 대칭 및 Oklab/OKLCH 왕복 검증
    const bPos = evaluateShL2Basis([0.6, 0.8, 0]);
    const bNeg = evaluateShL2Basis([-0.6, -0.8, 0]);
    expect(bPos[0]).toBeCloseTo(bNeg[0]!, 6);
    expect(bPos[1]).toBeCloseTo(-bNeg[1]!, 6);
    expect(bPos[4]).toBeCloseTo(bNeg[4]!, 6);

    const sampleRgb: SrgbColor8 = [196, 84, 132];
    const roundTripRgb = oklabToSrgb8(oklchToOklab(oklabToOklch(srgb8ToOklab(sampleRgb))));
    expect(computeDeltaEOklab(sampleRgb, roundTripRgb)).toBeLessThan(0.005);
    expect(() => restoreOriginalPaletteFromSidecar(new Uint8Array([1, 2, 3]))).toThrow(RangeError);
  });

  it("분리된 다중 더티 페이지 구간 병합과 스텝 간 보류 큐 데드락 차단을 추가로 검증한다", () => {
    const backing = new InMemorySyncAccessHandle(MMAP_PAGE_SIZE_BYTES * 10);
    const manager = new PageAlignedMmapWindowManager(backing, 6);
    // 구간 A: [0, 1], 구간 B: [4, 5] -> 총 4페이지지만 2회 연속 write()로 병합되어야 한다
    for (const p of [5, 0, 4, 1]) {
      const w = manager.mapWindow(BigInt(p) * BigInt(MMAP_PAGE_SIZE_BYTES), 32, "readwrite");
      w.view[0] = p + 50;
    }
    const res = manager.flushDirtyPages();
    expect(res.flushedPages).toBe(4);
    expect(res.writeCalls).toBe(2);
    expect(res.savedSyscalls).toBe(2);

    // 두 번의 개별 submitBatch 호출에 걸친 교차 데드락 차단 검증
    const sync = new WebGpuMultiQueueFenceSynchronizer();
    expect(sync.submitBatch([{ label: "g1", queue: "graphics" }]).accepted).toBe(true);
    expect(sync.submitBatch([{ label: "c1", queue: "compute", waits: [{ queue: "graphics", fenceValue: BigInt(1) }] }]).accepted).toBe(true);
    // 이제 c2가 아직 안 나온 g2를 기다리고 g2가 c2를 기다리면 데드락 거부
    const crossBatchCycle = sync.submitBatch([
      { label: "g2", queue: "graphics", waits: [{ queue: "compute", fenceValue: BigInt(2) }] },
      { label: "c2", queue: "compute", waits: [{ queue: "graphics", fenceValue: BigInt(2) }] },
    ]);
    expect(crossBatchCycle.accepted).toBe(false);
  });
});
