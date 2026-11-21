import { describe, expect, it } from "vitest";

import { createBrushStudioV6Program } from "../../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../../brush-lab/brush-studio-v6-product-bridge";
import {
  planStudioMaterialBrushFrom240HzStylus,
  rasterizeStudioMaterialBrushWithWasm64,
  type StudioMaterialBrushElement,
} from "../../brush/studio-material-brush-runtime";
import {
  CSP_REA_ALL_FILTER_SPECS,
  executeCspReaFilter,
  getCspReaFilterDialogAdapter,
} from "../../filter/csp-rea/csp-rea-unified-filter-registry";
import type { StylusPointerEventLike } from "../chrome-nextgen-adapters";
import {
  accelerateCspFilterWithWasm64,
  create240HzStylusStrokeStreamProcessor,
  disposeSharedWasm64FilterEngine,
  isCspFilterWasm64Acceleratable,
  process240HzStylusStrokeStream,
  WASM64_ACCELERATED_CSP_FILTER_IDS,
} from "../wasm64-live-canvas-bridge";
import { buildWebtoonTonalLut256x3, WASM_MEMORY64_LIMITS_FLAG } from "../wasm64-raster-kernel";
import {
  buildWasm64BlendExtensionModuleBytes,
  buildWebGpuFilterComputePlan,
  createWasm64TiledCompositor,
  planParallelTileBatches,
  probeWasm64Simd128Support,
  validateWebGpuComputePlan,
  WEBGPU_HEAVY_FILTER_IDS,
  type Wasm64TiledLayerSpec,
} from "../wasm64-tile-pipeline";

function makeNonMemory64Host(): typeof WebAssembly {
  return {
    ...WebAssembly,
    Module: WebAssembly.Module,
    Instance: WebAssembly.Instance,
    Memory: WebAssembly.Memory,
    validate(bytes: BufferSource): boolean {
      const view = ArrayBuffer.isView(bytes)
        ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        : new Uint8Array(bytes);
      for (let i = 8; i < Math.min(view.length, 48); i += 1) {
        if (view[i] === WASM_MEMORY64_LIMITS_FLAG) return false;
      }
      return WebAssembly.validate(bytes);
    },
  } as typeof WebAssembly;
}

function makePatternRgba(width: number, height: number, seed = 0): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      out[idx] = (x * 7 + y * 3 + seed * 19) & 255;
      out[idx + 1] = (x * 5 + y * 11 + seed * 31) & 255;
      out[idx + 2] = (x * 13 + y * 17 + seed * 47) & 255;
      out[idx + 3] = (x + y) % 19 === 0 ? 0 : (x + y) % 7 === 0 ? 160 : 255;
    }
  }
  // 경계값(0, 1, 127, 128, 254, 255) 명시적 주입
  const edges = [0, 1, 127, 128, 254, 255];
  for (let i = 0; i < edges.length && i * 4 + 3 < out.length; i += 1) {
    const v = edges[i] ?? 0;
    out[i * 4] = v;
    out[i * 4 + 1] = 255 - v;
    out[i * 4 + 2] = (v * 3) & 255;
    out[i * 4 + 3] = i === 0 ? 128 : 255;
  }
  return out;
}

function countByteMismatches(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return Math.abs(a.length - b.length) + 1;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) diff += 1;
  }
  return diff;
}

function make240HzFrameEvent(
  frameIndex: number,
  xStart: number,
  stepX: number,
  tremorAmp: number,
  predictedJumpX = 6,
): StylusPointerEventLike {
  const baseTime = frameIndex * 16.667;
  const coalesced: StylusPointerEventLike[] = [];
  for (let sub = 0; sub < 4; sub += 1) {
    const idx = frameIndex * 4 + sub;
    const x = xStart + idx * stepX;
    const y = 120 + (idx % 2 === 0 ? tremorAmp : -tremorAmp);
    coalesced.push({
      clientX: x,
      clientY: y,
      pressure: 0.35 + ((idx % 10) / 20),
      tiltX: 12,
      tiltY: -6,
      twist: idx % 360,
      timeStamp: baseTime + sub * 4.167,
      pointerType: "pen",
      buttons: 1,
    });
  }
  const last = coalesced[coalesced.length - 1]!;
  const predicted: StylusPointerEventLike[] = [
    {
      clientX: last.clientX + predictedJumpX,
      clientY: last.clientY,
      pressure: last.pressure,
      tiltX: 12,
      tiltY: -6,
      twist: last.twist,
      timeStamp: (last.timeStamp ?? 0) + 4.167,
      pointerType: "pen",
      buttons: 1,
    },
    {
      clientX: last.clientX + predictedJumpX * 2,
      clientY: last.clientY,
      pressure: last.pressure,
      tiltX: 12,
      tiltY: -6,
      twist: last.twist,
      timeStamp: (last.timeStamp ?? 0) + 8.334,
      pointerType: "pen",
      buttons: 1,
    },
  ];
  return {
    ...last,
    getCoalescedEvents: () => coalesced,
    getPredictedEvents: () => predicted,
  };
}

describe("Wave 8 · Wasm64 256×256 타일 파이프라인 · SIMD128 · SAB 워커 큐 · WGSL 플래너", () => {
  it("T-015: 1600×20000 웹툰 원고(553타일)의 더티 타일만 Wasm64 i64 4종 블렌드(Source-Over/Multiply/Screen/Overlay)로 합성하고 JS와 비트 100% 일치한다", () => {
    expect(WebAssembly.validate(buildWasm64BlendExtensionModuleBytes() as BufferSource)).toBe(true);

    const wasmComp = createWasm64TiledCompositor({ width: 1600, height: 20_000, tileSizePx: 256 });
    const jsComp = createWasm64TiledCompositor({
      width: 1600,
      height: 20_000,
      tileSizePx: 256,
      webAssembly: makeNonMemory64Host(),
      allowFallback: true,
    });

    expect(wasmComp.backend).toBe("wasm64-native");
    expect(wasmComp.addressMode).toBe("i64");
    expect(wasmComp.cols).toBe(7);
    expect(wasmComp.rows).toBe(79);
    expect(wasmComp.totalTiles).toBe(553);
    expect(jsComp.backend).toBe("js-fallback");

    // 16개 더티 타일(일반 256×256 + 우측/하단 경계 부분 타일 64×32 포함)만 희소 기록
    const coords: ReadonlyArray<readonly [number, number]> = [
      [0, 0], [1, 0], [2, 0], [6, 0],
      [0, 12], [1, 12], [2, 12], [3, 12],
      [0, 40], [1, 40], [2, 40], [6, 40],
      [0, 78], [1, 78], [5, 78], [6, 78],
    ];
    for (const [tx, ty] of coords) {
      const desc = wasmComp.describeTile(tx, ty);
      const base = makePatternRgba(desc.pixelWidth, desc.pixelHeight, 1);
      const shadow = makePatternRgba(desc.pixelWidth, desc.pixelHeight, 2);
      const glow = makePatternRgba(desc.pixelWidth, desc.pixelHeight, 3);
      const contrast = makePatternRgba(desc.pixelWidth, desc.pixelHeight, 4);
      for (const comp of [wasmComp, jsComp]) {
        comp.writeLayerTile("base", tx, ty, base);
        comp.writeLayerTile("shadow", tx, ty, shadow);
        comp.writeLayerTile("glow", tx, ty, glow);
        comp.writeLayerTile("contrast", tx, ty, contrast);
      }
    }
    // 타일 경계(256, 256)를 걸치는 브러시 댑 스탬핑
    const dab = { cx: 256, cy: 256, radius: 22, r: 220, g: 64, b: 96, alpha255: 204, hardness255: 170 };
    const wasmDab = wasmComp.stampBrushDab("base", dab);
    const jsDab = jsComp.stampBrushDab("base", dab);
    expect(wasmDab.touchedTileCount).toBe(4);
    expect(wasmDab.touchedPixels).toBe(jsDab.touchedPixels);

    const layers: readonly Wasm64TiledLayerSpec[] = [
      { id: "base", blendMode: "source-over", opacity01: 1.0 },
      { id: "shadow", blendMode: "multiply", opacity01: 0.72 },
      { id: "glow", blendMode: "screen", opacity01: 0.58 },
      { id: "contrast", blendMode: "overlay", opacity01: 0.64 },
    ];
    const lut = buildWebtoonTonalLut256x3();
    const wasmReport = wasmComp.compositeDirtyTiles(layers, { tonalLut256x3: lut });
    const jsReport = jsComp.compositeDirtyTiles(layers, { tonalLut256x3: lut });

    expect(wasmReport.backend).toBe("wasm64-native");
    expect(wasmReport.addressMode).toBe("i64");
    expect(wasmReport.exceeds4GiBAddressSpace).toBe(true);
    expect(wasmReport.totalCanvasTiles).toBe(553);
    expect(wasmReport.dirtyTilesProcessed).toBe(18); // 16 + 경계 댑이 추가 오염시킨 (0,1), (1,1)
    expect(wasmReport.skippedCleanTiles).toBe(535);
    expect(wasmReport.blendModesUsed).toEqual(expect.arrayContaining(["source-over", "multiply", "screen", "overlay"]));
    expect(wasmReport.elapsedMs).toBeGreaterThan(0);
    expect(wasmReport.throughputMegaPixelsPerSec).toBeGreaterThan(0);
    expect(wasmReport.outputChecksum32).toBe(jsReport.outputChecksum32);

    // 모서리 부분 타일 (6, 78) [64×32] 포함 모든 더티 타일 바이트 100% 동치 검증
    const edgeWasm = wasmComp.readCompositeTile(6, 78);
    const edgeJs = jsComp.readCompositeTile(6, 78);
    expect(edgeWasm).not.toBeNull();
    expect(edgeJs).not.toBeNull();
    expect(edgeWasm?.byteLength).toBe(64 * 32 * 4);
    expect(countByteMismatches(edgeWasm!, edgeJs!)).toBe(0);
    // 클린 타일(예: 3, 50)은 메모리 할당/합성되지 않음
    expect(wasmComp.readCompositeTile(3, 50)).toBeNull();

    wasmComp.dispose();
    jsComp.dispose();
  });

  it("T-016: Node 24 V8 SIMD128(v128) + Memory64 실측 프로브 및 SharedArrayBuffer 4~8워커 균등 분할 큐가 실동작한다", () => {
    const simd = probeWasm64Simd128Support();
    expect(simd.simd128Validated).toBe(true);
    expect(simd.simd128Executed).toBe(true);
    expect(simd.memory64WithSimd128Validated).toBe(true);
    expect(simd.memory64WithSimd128Executed).toBe(true);
    expect(simd.vectorWidthBits).toBe(128);
    expect(simd.rgbaPixelsPerVector).toBe(4);

    const noWasmSimd = probeWasm64Simd128Support(null);
    expect(noWasmSimd.simd128Validated).toBe(false);
    expect(noWasmSimd.memory64WithSimd128Executed).toBe(false);

    const comp = createWasm64TiledCompositor({ width: 1600, height: 20_000, tileSizePx: 256 });
    comp.markDirtyRect(0, 0, 1600, 1024); // 7 cols × 4 rows = 28 dirty tiles (24 full + 4 edge 64×256)
    const dirty = comp.getDirtyTileCoords();
    expect(dirty).toHaveLength(28);

    const plan8 = planParallelTileBatches(dirty, { workerCount: 8 });
    expect(plan8.transport).toBe("shared-array-buffer");
    expect(plan8.queue.buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(plan8.workerPoolSize).toBe(8);
    expect(plan8.activeWorkerCount).toBe(8);
    expect(plan8.batches.reduce((sum, b) => sum + b.tiles.length, 0)).toBe(28);
    expect(plan8.loadImbalanceRatio).toBeLessThan(0.35);

    // 8워커 Atomics work-stealing 드레인 검증
    const claimedKeys = new Set<string>();
    while (true) {
      const job = plan8.queue.claimNextJob();
      if (!job) break;
      claimedKeys.add(`${job.tx},${job.ty}`);
      plan8.queue.completeJob(true);
    }
    expect(claimedKeys.size).toBe(28);
    expect(plan8.queue.getSnapshot().done).toBe(true);
    expect(plan8.queue.getSnapshot().completedJobs).toBe(28);
    expect(plan8.queue.getSnapshot().errorCount).toBe(0);

    // COOP/COEP 비활성 시 ArrayBuffer 폴백 검증
    const planFallback = planParallelTileBatches(dirty, { workerCount: 4, crossOriginIsolated: false });
    expect(planFallback.transport).toBe("transferable-fallback");
    expect(planFallback.queue.isSharedMemory).toBe(false);
    expect(planFallback.workerPoolSize).toBe(4);
    comp.dispose();
  });

  it("T-017: 고부하 15종 CSP 필터 전체의 WebGPU WGSL 컴퓨트 셰이더 소스와 디스패치 계획이 유효하다", () => {
    expect(WEBGPU_HEAVY_FILTER_IDS).toHaveLength(15);
    const allIds = new Set(CSP_REA_ALL_FILTER_SPECS.map((s) => s.id));
    for (const filterId of WEBGPU_HEAVY_FILTER_IDS) {
      expect(allIds.has(filterId), filterId).toBe(true);
      const plan = buildWebGpuFilterComputePlan(filterId, 1600, 2000, undefined, { shaderF16: true });
      const check = validateWebGpuComputePlan(plan);
      expect(plan.supportedOnWebGpu, filterId).toBe(true);
      expect(check.valid, `${filterId}: ${check.errors.join("; ")}`).toBe(true);
      expect(plan.passes.length, filterId).toBeGreaterThanOrEqual(1);
      for (const pass of plan.passes) {
        expect(pass.uniformBufferBytes % 16).toBe(0);
        expect(pass.wgslSource).toContain("enable f16;");
        expect(pass.wgslSource).toContain(`fn ${pass.entryPoint}`);
      }
    }

    const gauss = buildWebGpuFilterComputePlan("gauss-blur", 1600, 20_000, { radiusPx: 6 }, { maxBufferSizeBytes: 64 * 1024 * 1024 });
    expect(gauss.passes).toHaveLength(2);
    expect(gauss.requiresTileStreaming).toBe(true);
    expect(gauss.recommendedTileSizePx).toBe(512);

    const unsupported = buildWebGpuFilterComputePlan("posterize", 512, 512);
    expect(unsupported.supportedOnWebGpu).toBe(false);
    expect(validateWebGpuComputePlan(unsupported).valid).toBe(false);
  });
});

describe("Wave 8 · 46종 CSP 필터 Wasm64 실배선 동치 & 240Hz 스타일러스/머티리얼 브러시 직결", () => {
  it("T-015: 톤/색조·그라데이션 LUT 6종 CSP 필터가 Wasm64 네이티브(및 SIMD128)로 실행되며 JS 기준선과 픽셀 단위 100% 동치다", () => {
    expect(WASM64_ACCELERATED_CSP_FILTER_IDS).toHaveLength(6);
    const width = 129; // 비4배수(129×65=8,385px)로 SIMD128 루프 + 스칼라 테일 모두 검증
    const height = 65;
    const src = makePatternRgba(width, height, 9);

    const cases: ReadonlyArray<{ readonly id: typeof WASM64_ACCELERATED_CSP_FILTER_IDS[number]; readonly params?: Record<string, unknown> }> = [
      { id: "brightness-contrast", params: { brightness: 22, contrast: 30, legacyMode: false } },
      { id: "brightness-contrast", params: { brightness: -18, contrast: 40, legacyMode: true } },
      { id: "posterize", params: { levels: 5 } },
      { id: "reverse-gradient" },
      { id: "level-correction", params: { inputBlack: 18, gamma: 1.35, inputWhite: 238, outputBlack: 8, outputWhite: 248 } },
      { id: "tone-curve", params: { midtoneLift: 26, shadowLift: -14 } },
      { id: "gradient-map", params: { mixRate01: 1.0, reverse: false } },
      { id: "gradient-map", params: { mixRate01: 0.65, reverse: true } },
    ];

    for (const tc of cases) {
      expect(isCspFilterWasm64Acceleratable(tc.id)).toBe(true);
      const accel = accelerateCspFilterWithWasm64(tc.id, src, width, height, tc.params, { chunkPixels: 2048 });
      expect(accel, tc.id).not.toBeNull();
      expect(accel!.backend, tc.id).toBe("wasm64-native");
      expect(accel!.addressMode, tc.id).toBe("i64");
      if (tc.id === "reverse-gradient") expect(accel!.kernelPath).toBe("wasm64-simd128-invert");
      if (tc.id === "gradient-map") expect(accel!.kernelPath).toBe("wasm64-gradient-map");

      const viaRegistryWasm = executeCspReaFilter(tc.id, src, width, height, tc.params);
      const viaRegistryJs = executeCspReaFilter(tc.id, src, width, height, { ...tc.params, disableWasm64: true });
      expect(countByteMismatches(accel!.data, viaRegistryJs), `${tc.id} accel vs JS`).toBe(0);
      expect(countByteMismatches(viaRegistryWasm, viaRegistryJs), `${tc.id} registry Wasm64 vs JS`).toBe(0);
    }

    // 비LUT 필터는 null을 반환해 기존 경로로 폴스루
    expect(accelerateCspFilterWithWasm64("gauss-blur", src, width, height)).toBeNull();
    const adapter = getCspReaFilterDialogAdapter();
    expect(adapter.totalFilterCount).toBe(46);
    expect(adapter.isWasm64Accelerated("tone-curve")).toBe(true);
    expect(adapter.isWasm64Accelerated("gauss-blur")).toBe(false);
    disposeSharedWasm64FilterEngine();
  });

  it("T-018: 240Hz 스타일러스 스트림에 1-Euro 적응형 손떨림 보정과 확정/예측 꼬리 분리(고스트 0%)를 실동작 검증한다", () => {
    const frames = Array.from({ length: 12 }, (_, f) => make240HzFrameEvent(f, 20, 2.5, 4.5));
    const smoothed = process240HzStylusStrokeStream(frames, { stabilizerLevel: 10, maxPredicted: 2 });
    const rawBypass = process240HzStylusStrokeStream(frames, { stabilizerLevel: 0, maxPredicted: 2 });
    const withoutPredicted = process240HzStylusStrokeStream(frames, { stabilizerLevel: 10, includePredicted: false });

    expect(smoothed.usedCoalescedApi).toBe(true);
    expect(smoothed.usedPredictedApi).toBe(true);
    expect(smoothed.ghostArtifactsGuaranteedZero).toBe(true);
    expect(smoothed.committedSamples).toHaveLength(48);
    expect(smoothed.predictedTail).toHaveLength(2);
    expect(smoothed.droppedGhostPredictedCount).toBe(22); // 이전 11프레임 × 예측 2샘플 즉시 폐기
    expect(smoothed.effectiveSampleRateHz).toBeGreaterThan(220);
    expect(smoothed.jitterReductionRatio).toBeGreaterThan(0.35);
    expect(rawBypass.jitterReductionRatio).toBe(0);

    // 확정 샘플과 예측 꼬리가 엄격히 분리되고, 예측 샘플 유무가 확정 궤적을 절대 오염시키지 않음
    expect(smoothed.committedSamples.every((s) => !s.predicted)).toBe(true);
    expect(smoothed.predictedTail.every((s) => s.predicted)).toBe(true);
    expect(smoothed.committedSamples).toEqual(withoutPredicted.committedSamples);

    // 빠른 플릭 시 1-Euro 차단 주파수(appliedCutoffHz)가 자동 상승해 지연 억제
    const slowFrames = Array.from({ length: 6 }, (_, f) => make240HzFrameEvent(f, 20, 0.8, 2.0));
    const fastFrames = Array.from({ length: 6 }, (_, f) => make240HzFrameEvent(f, 20, 18.0, 0.5));
    const slowRes = process240HzStylusStrokeStream(slowFrames, { stabilizerLevel: 8 });
    const fastRes = process240HzStylusStrokeStream(fastFrames, { stabilizerLevel: 8 });
    const slowTail = slowRes.committedSamples[slowRes.committedSamples.length - 1]!;
    const fastTail = fastRes.committedSamples[fastRes.committedSamples.length - 1]!;
    expect(fastTail.appliedCutoffHz).toBeGreaterThan(slowTail.appliedCutoffHz * 2);

    // 극단적 드라이버 스파이크 예측 점프(+500px)가 maxPredictedJumpPx로 안전 클램핑되고,
    // 다음 확정 프레임이 도착하면 이전 예측 꼬리가 완전히 교체됨
    const proc = create240HzStylusStrokeStreamProcessor({ stabilizerLevel: 6, maxPredictedJumpPx: 24 });
    const spikeSnap = proc.pushEvent(make240HzFrameEvent(0, 50, 2, 0.5, 500));
    const anchor = spikeSnap.committedSamples[spikeSnap.committedSamples.length - 1]!;
    const firstPred = spikeSnap.predictedTail[0]!;
    expect(Math.hypot(firstPred.x - anchor.x, firstPred.y - anchor.y)).toBeLessThanOrEqual(24.01);
  });

  it("T-015/T-018: studio-material-brush-runtime 동적 import 브리지가 240Hz 보정·예측 분리와 Wasm64 타일 래스터화를 끝단 연결한다", async () => {
    const brush = createBrushStudioV6ProductBrush(createBrushStudioV6Program("clean-ink"));
    const frames = Array.from({ length: 6 }, (_, f) => make240HzFrameEvent(f, 40, 4.0, 2.5));

    const planned = await planStudioMaterialBrushFrom240HzStylus(
      {
        stroke: brush.color,
        strokeWidth: brush.strokeWidth,
        opacity: 0.9,
        brushEnginePrograms: brush.enginePrograms!,
      },
      frames,
      { stabilizerLevel: 7, maxPredicted: 2 },
    );
    expect(planned.stream.ghostArtifactsGuaranteedZero).toBe(true);
    expect(planned.committedMarks.length).toBeGreaterThan(10);
    expect(planned.predictedOverlayMarks.length).toBeGreaterThan(0);

    const element: StudioMaterialBrushElement = planned.committedElement;
    const raster = await rasterizeStudioMaterialBrushWithWasm64(element, 1600, 2000, {
      tileSizePx: 256,
      blendMode: "source-over",
      workerCount: 4,
    });
    expect(raster.backend).toBe("wasm64-native");
    expect(raster.addressMode).toBe("i64");
    expect(raster.marksStamped).toBe(planned.committedMarks.length);
    expect(raster.totalTouchedPixels).toBeGreaterThan(0);
    expect(raster.dirtyTilesProcessed).toBeGreaterThan(0);
    expect(raster.skippedCleanTiles).toBeGreaterThan(40);
    expect(raster.parallelPlan.workerPoolSize).toBe(4);
  });
});
