// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CANVAS_MEMORY_WORKLOAD_PRESETS,
  EIGHT_K_HEIGHT_PX,
  EIGHT_K_WIDTH_PX,
  LOCAL_INFERENCE_SERVER_COST_KRW,
  LOD_RECOVERY_STABLE_FRAME_THRESHOLD,
  NEXTGEN_PERF_SPRITE_SRC,
  StudioNextGenPerfTelemetryCard,
  VECTOR_INK_VERTEX_STRIDE_FLOATS,
  WASM_PAGE_SIZE_BYTES,
  cancelWebNnInferenceTask,
  compareWasm64VsWasm32Plan,
  completeWebNnInferenceTask,
  computeDynamicLodProfile,
  createComputePressureMonitor,
  createWebNnTaskQueue,
  detectWasm64Support,
  detectWebCodecsCapability,
  detectWebNnCapability,
  dispatchNextWebNnTask,
  enqueueWebNnInferenceTask,
  evaluateOpfsWebRtcP2pSync,
  planCanvasMemoryStrategy,
  planWebCodecsMirrorProfile,
  probeNextGenPerfCapabilities,
  tessellateShaderVectorInkRibbon,
  type PressureObserverConstructorLike,
  type PressureRecordLike,
  type WasmMemoryConstructorLike,
  type WasmMemoryDescriptorLike,
} from "./index";

describe("nextgen-perf-engine", () => {
  afterEach(() => {
    cleanup();
  });

  describe("Wasm64 감지 및 32비트 안전 폴백", () => {
    it("Memory64(address: 'i64') 할당과 BigInt grow가 성공하면 64비트 모드를 활성화한다", () => {
      const descriptors: WasmMemoryDescriptorLike[] = [];
      const growCalls: (number | bigint)[] = [];
      const MockMemory64: WasmMemoryConstructorLike = class {
        readonly buffer = new ArrayBuffer(WASM_PAGE_SIZE_BYTES);
        constructor(descriptor: WasmMemoryDescriptorLike) {
          descriptors.push(descriptor);
          if (descriptor.address !== "i64" || typeof descriptor.initial !== "bigint") {
            throw new TypeError("expected i64 bigint descriptor");
          }
        }
        grow(delta: number | bigint): bigint {
          growCalls.push(delta);
          return BigInt(1);
        }
      };

      const report = detectWasm64Support({
        memoryConstructor: MockMemory64,
        deviceMemoryGiB: 16,
        sharedArrayBufferAvailable: true,
        crossOriginIsolated: true,
        nowMs: 1_700_000_000_000,
      });

      expect(report.supported).toBe(true);
      expect(report.addressMode).toBe("i64");
      expect(report.wasmAvailable).toBe(true);
      expect(report.maxLinearMemoryGiB).toBe(16);
      expect(report.safeArenaCeilingMiB).toBeGreaterThan(8_000);
      expect(report.sharedMemorySupported).toBe(true);
      expect(report.fallbackReason).toBeNull();
      expect(descriptors[0]?.address).toBe("i64");
      expect(growCalls).toHaveLength(1);
    });

    it("i64 생성이 실패하면 32비트 표준 WebAssembly.Memory 폴백으로 안전 전환한다", () => {
      const MockMemory32Only: WasmMemoryConstructorLike = class {
        readonly buffer = new ArrayBuffer(WASM_PAGE_SIZE_BYTES);
        constructor(descriptor: WasmMemoryDescriptorLike) {
          if (descriptor.address === "i64" || typeof descriptor.initial === "bigint") {
            throw new TypeError("Cannot convert a BigInt value to a number");
          }
        }
      };

      const report = detectWasm64Support({
        memoryConstructor: MockMemory32Only,
        deviceMemoryGiB: 8,
        sharedArrayBufferAvailable: true,
        crossOriginIsolated: false,
        nowMs: 100,
      });

      expect(report.supported).toBe(false);
      expect(report.addressMode).toBe("i32");
      expect(report.wasmAvailable).toBe(true);
      expect(report.maxLinearMemoryGiB).toBe(4);
      expect(report.safeArenaCeilingMiB).toBeLessThanOrEqual(1_792);
      expect(report.sharedMemorySupported).toBe(false);
      expect(report.fallbackReason).toContain("32비트");
    });

    it("WebAssembly.Memory가 없으면 unavailable 안전 폴백을 반환하고 실제 런타임 프로브도 예외 없이 완료된다", () => {
      const missing = detectWasm64Support({ memoryConstructor: null, nowMs: 0 });
      expect(missing.supported).toBe(false);
      expect(missing.addressMode).toBe("unavailable");
      expect(missing.wasmAvailable).toBe(false);

      const live = detectWasm64Support({ nowMs: 0 });
      expect(["i64", "i32", "unavailable"]).toContain(live.addressMode);
      expect(live.probedPageBytes).toBeGreaterThanOrEqual(0);
    });
  });

  describe("8K 다중 레이어 · 고밀도 3D 메시 타일 메모리 예산 및 전략 선택", () => {
    it("8K 64레이어 작업에서 Wasm64는 스왑리스 64비트 아레나를, Wasm32는 256px LRU 페이징을 자동 선택한다", () => {
      const comparison = compareWasm64VsWasm32Plan(
        {
          widthPx: EIGHT_K_WIDTH_PX,
          heightPx: EIGHT_K_HEIGHT_PX,
          layerCount: 64,
          bitDepth: "rgba8",
          activeSparseFillRatio: 0.48,
          meshTriangleCount: 300_000,
          undoHistoryDepth: 32,
          opfsAvailable: true,
        },
        16,
      );

      expect(comparison.wasm64Plan.strategy).toBe("wasm64-swapless-arena");
      expect(comparison.wasm64Plan.swapless).toBe(true);
      expect(comparison.wasm64Plan.estimatedSwapStallMsPerPan).toBe(0);
      expect(comparison.wasm64Plan.opfsSpillMiB).toBe(0);
      expect(comparison.wasm64Plan.breakdown.tilesPerLayer).toBe(30 * 17);

      expect(comparison.wasm32Plan.strategy).toBe("wasm32-lru-tile-paging");
      expect(comparison.wasm32Plan.swapless).toBe(false);
      expect(comparison.wasm32Plan.usesLruTilePaging).toBe(true);
      expect(comparison.wasm32Plan.pagingBackingStore).toBe("opfs-async-tier");
      expect(comparison.wasm32Plan.evictedTileCount).toBeGreaterThan(0);
      expect(comparison.wasm32Plan.opfsSpillMiB).toBeGreaterThan(1_000);
      expect(comparison.swapStallSavedMs).toBeGreaterThan(0);
      expect(comparison.avoidedOpfsSpillMiB).toBeGreaterThan(1_000);
    });

    it("8K 128레이어 HDR(RGBA16F) + 3.2M 3D 메시 초과 부하는 Wasm64 OPFS 콜드 티어링으로 승격한다", () => {
      const wasm64Report = detectWasm64Support({
        memoryConstructor: class {
          readonly buffer = new ArrayBuffer(WASM_PAGE_SIZE_BYTES);
        },
        deviceMemoryGiB: 8,
        nowMs: 0,
      });

      const plan = planCanvasMemoryStrategy({
        widthPx: EIGHT_K_WIDTH_PX,
        heightPx: EIGHT_K_HEIGHT_PX,
        layerCount: 128,
        bitDepth: "rgba16f",
        activeSparseFillRatio: 0.5,
        meshTriangleCount: 3_200_000,
        deviceMemoryGiB: 8,
        wasm64: wasm64Report,
        opfsAvailable: true,
      });

      expect(plan.strategy).toBe("wasm64-tiered-opfs-overflow");
      expect(plan.breakdown.meshGeometryMiB).toBeGreaterThan(250);
      expect(plan.opfsSpillMiB).toBeGreaterThan(0);
      expect(plan.pagingBackingStore).toBe("opfs-async-tier");
    });

    it("소형 캔버스는 32비트 환경에서도 페이징 없는 상주 콤팩트 아레나를 선택한다", () => {
      const wasm32Report = detectWasm64Support({
        memoryConstructor: class {
          readonly buffer = new ArrayBuffer(WASM_PAGE_SIZE_BYTES);
          constructor(descriptor: WasmMemoryDescriptorLike) {
            if (descriptor.address === "i64") throw new TypeError("no i64");
          }
        },
        deviceMemoryGiB: 8,
        nowMs: 0,
      });

      const compact = planCanvasMemoryStrategy({
        widthPx: 2_048,
        heightPx: 2_048,
        layerCount: 12,
        bitDepth: "rgba8",
        wasm64: wasm32Report,
      });

      expect(compact.strategy).toBe("wasm32-resident-compact");
      expect(compact.swapless).toBe(true);
      expect(compact.estimatedSwapStallMsPerPan).toBe(0);
    });
  });

  describe("WebNN NPU 스케줄러 · WebCodecs 미러링 · OPFS+WebRTC P2P", () => {
    it("WebNN NPU 우선 선택 · WebGPU/WASM CPU 폴백 · 인터랙티브 브러시 영역 대체 큐를 정확히 동작시킨다", () => {
      const npuCap = detectWebNnCapability({
        hasNavigatorMl: true,
        preferredMlDevice: "npu",
        hasWebGpu: true,
      });
      expect(npuCap.preferredBackend).toBe("webnn-npu");
      expect(npuCap.maxConcurrentTasks).toBe(2);
      expect(npuCap.serverCostKrw).toBe(LOCAL_INFERENCE_SERVER_COST_KRW);

      const webgpuFallback = detectWebNnCapability({
        hasNavigatorMl: false,
        hasWebGpu: true,
      });
      expect(webgpuFallback.preferredBackend).toBe("webgpu-compute");

      const cpuFallback = detectWebNnCapability({
        hasNavigatorMl: false,
        hasWebGpu: false,
        hasWasmSimd: true,
      });
      expect(cpuFallback.preferredBackend).toBe("wasm-simd-cpu");

      let queue = createWebNnTaskQueue(npuCap);
      queue = enqueueWebNnInferenceTask(queue, {
        id: "bg-1",
        kind: "texture-synthesis",
        priority: "background-prefetch",
        regionKey: "cut-2",
        tileCount: 4,
        submittedAtMs: 10,
      });
      queue = enqueueWebNnInferenceTask(queue, {
        id: "brush-old",
        kind: "sketch-inpaint",
        priority: "interactive-brush",
        regionKey: "cut-1-tile-4",
        tileCount: 2,
        submittedAtMs: 20,
      });
      queue = enqueueWebNnInferenceTask(queue, {
        id: "brush-new",
        kind: "sketch-inpaint",
        priority: "interactive-brush",
        regionKey: "cut-1-tile-4",
        tileCount: 2,
        submittedAtMs: 30,
      });

      expect(queue.supersededCount).toBe(1);
      expect(queue.queued.map((task) => task.id)).toEqual(["brush-new", "bg-1"]);

      const d1 = dispatchNextWebNnTask(queue);
      expect(d1.dispatched?.id).toBe("brush-new");
      expect(d1.dispatched?.assignedBackend).toBe("webnn-npu");

      const d2 = dispatchNextWebNnTask(d1.state);
      expect(d2.dispatched?.id).toBe("bg-1");

      const d3 = dispatchNextWebNnTask(d2.state);
      expect(d3.dispatched).toBeNull();

      const completed = completeWebNnInferenceTask(d2.state, "brush-new");
      expect(completed.completedCount).toBe(1);
      expect(completed.active).toHaveLength(1);

      const cancelled = cancelWebNnInferenceTask(completed, "bg-1");
      expect(cancelled.cancelledCount).toBe(1);
      expect(cancelled.active).toHaveLength(0);
    });

    it("WebCodecs 지원/미지원 환경별로 보조 모니터 · 아이패드 · 스마트TV 프로파일과 폴백을 계산한다", () => {
      const fullCap = detectWebCodecsCapability({
        hasVideoEncoder: true,
        hasVideoFrame: true,
        hasMediaStreamTrackProcessor: true,
        hasRtcPeerConnection: true,
        hardwareAccelerationLikely: true,
      });
      const ipadLossless = planWebCodecsMirrorProfile({
        targetDevice: "ipad-companion",
        qualityMode: "lossless-444",
        capability: fullCap,
      });
      expect(ipadLossless.transportMode).toBe("webcodecs-webrtc-p2p");
      expect(ipadLossless.chromaSubsampling).toBe("4:4:4");
      expect(ipadLossless.targetFps).toBe(120);
      expect(ipadLossless.fallbackActive).toBe(false);

      const tvCast = planWebCodecsMirrorProfile({
        targetDevice: "smart-tv-cast",
        qualityMode: "studio-hq",
        capability: fullCap,
      });
      expect(tvCast.widthPx).toBe(3_840);
      expect(tvCast.heightPx).toBe(2_160);
      expect(tvCast.targetBitrateMbps).toBeGreaterThan(20);

      const noWebCodecs = detectWebCodecsCapability({
        hasVideoEncoder: false,
        hasVideoFrame: false,
        hasMediaStreamTrackProcessor: false,
        hasRtcPeerConnection: false,
      });
      const fallbackProfile = planWebCodecsMirrorProfile({
        targetDevice: "secondary-monitor",
        qualityMode: "lossless-444",
        capability: noWebCodecs,
      });
      expect(fallbackProfile.fallbackActive).toBe(true);
      expect(fallbackProfile.transportMode).toBe("canvas-tile-delta-fallback");
      expect(fallbackProfile.chromaSubsampling).toBe("4:2:0");

      const syncReport = evaluateOpfsWebRtcP2pSync({
        hasOpfs: true,
        hasWebRtcP2p: true,
        hasBroadcastChannel: true,
      });
      expect(syncReport.ultraLowLatencyReady).toBe(true);
      expect(syncReport.estimatedPeerSyncRttMs).toBeLessThan(20);
    });
  });

  describe("Compute Pressure + 프레임 타임 기반 동적 LOD 계단 강등 및 복구", () => {
    it("열 압력 상승 및 프레임 예산 초과 시 계단 강등하고, 안정 프레임 누적 후 1단계씩 복구한다", () => {
      const step1 = computeDynamicLodProfile({
        pressureState: "nominal",
        frameTimeMs: 20.5,
        targetFps: 60,
        previousTier: "ultra",
      });
      expect(step1.tier).toBe("high");
      expect(step1.direction).toBe("downgraded");
      expect(step1.shadowMapResolution).toBe(1024);
      expect(step1.watercolorSubsteps).toBe(5);

      const step2 = computeDynamicLodProfile({
        pressureState: "serious",
        frameTimeMs: 18.0,
        targetFps: 60,
        previousTier: step1.tier,
      });
      expect(step2.tier).toBe("balanced");
      expect(step2.aaMode3d).toBe("fxaa");

      const step3 = computeDynamicLodProfile({
        pressureState: "critical",
        frameTimeMs: 31.0,
        targetFps: 60,
        previousTier: step2.tier,
      });
      expect(step3.tier).toBe("performance");
      expect(step3.particleDensityScale).toBe(0.15);
      expect(step3.shadowMapResolution).toBe(256);
      expect(step3.watercolorSubsteps).toBe(1);
      expect(step3.aaMode3d).toBe("off");

      // 히스테리시스: 안정 프레임이 임계치 미만이면 성급히 복구하지 않는다.
      const holdBeforeThreshold = computeDynamicLodProfile({
        pressureState: "nominal",
        frameTimeMs: 9.5,
        targetFps: 60,
        previousTier: "performance",
        consecutiveStableFrames: LOD_RECOVERY_STABLE_FRAME_THRESHOLD - 1,
      });
      expect(holdBeforeThreshold.tier).toBe("performance");
      expect(holdBeforeThreshold.direction).toBe("hold");

      // 임계치 이상 연속 안정 프레임 달성 시 1단계만 점진 복구한다.
      const recovered = computeDynamicLodProfile({
        pressureState: "nominal",
        frameTimeMs: 9.5,
        targetFps: 60,
        previousTier: "performance",
        consecutiveStableFrames: LOD_RECOVERY_STABLE_FRAME_THRESHOLD,
      });
      expect(recovered.tier).toBe("balanced");
      expect(recovered.direction).toBe("recovered");
    });

    it("PressureObserver를 안전하게 구독·해제하고 미지원 시 unavailable을 보고한다", () => {
      const states: string[] = [];
      const callbackBox: {
        fn: ((records: readonly PressureRecordLike[]) => void) | null;
      } = { fn: null };
      const disconnectSpy = vi.fn();

      const MockObserver: PressureObserverConstructorLike = class {
        constructor(cb: (records: readonly PressureRecordLike[]) => void) {
          callbackBox.fn = cb;
        }
        observe(): void {
          // mock observe
        }
        disconnect(): void {
          disconnectSpy();
        }
      };

      const monitor = createComputePressureMonitor({
        onChange: (state) => states.push(state),
        observerConstructor: MockObserver,
      });
      expect(monitor.supported).toBe(true);
      callbackBox.fn?.([{ state: "serious" }]);
      expect(states).toEqual(["serious"]);
      monitor.stop();
      expect(disconnectSpy).toHaveBeenCalledOnce();

      const unsupportedStates: string[] = [];
      const fallbackMonitor = createComputePressureMonitor({
        onChange: (state) => unsupportedStates.push(state),
        observerConstructor: null,
      });
      expect(fallbackMonitor.supported).toBe(false);
      expect(unsupportedStates).toEqual(["unavailable"]);
    });
  });

  describe("셰이더 기반 벡터 잉크 Bezier → GPU 리본 테셀레이션 커널", () => {
    it("Bezier 세그먼트를 인터리브 버텍스/인덱스 버퍼로 정확히 테셀레이션하고 필압 테이퍼를 반영한다", () => {
      const mesh = tessellateShaderVectorInkRibbon(
        [
          {
            p0: { x: 0, y: 0 },
            p1: { x: 33, y: 0 },
            p2: { x: 66, y: 0 },
            p3: { x: 100, y: 0 },
            pressureStart: 0.25,
            pressureEnd: 1.0,
            baseRadiusPx: 8,
          },
        ],
        { subdivisions: 10, zoomScale: 4 },
      );

      expect(mesh.strideFloats).toBe(VECTOR_INK_VERTEX_STRIDE_FLOATS);
      expect(mesh.vertexCount).toBe(22);
      expect(mesh.triangleCount).toBe(20);
      expect(mesh.arcLengthPx).toBeCloseTo(100, 1);
      expect(mesh.aaFeatherPx).toBe(0.25);
      expect(mesh.gpuBufferBytes).toBe(mesh.vertices.byteLength + mesh.indices.byteLength);

      // 시작점(step=0)과 끝점(step=10)의 반폭(signedEdgeDist)이 필압 증가에 따라 단조 증가해야 한다.
      const startHalfWidth = Math.abs(mesh.vertices[4] ?? 0);
      const endHalfWidth = Math.abs(mesh.vertices[(mesh.vertexCount - 1) * 6 + 4] ?? 0);
      expect(endHalfWidth).toBeGreaterThan(startHalfWidth * 3);

      for (let i = 0; i < mesh.vertices.length; i += 1) {
        expect(Number.isFinite(mesh.vertices[i])).toBe(true);
      }
    });

    it("퇴화(영길이) 제어점과 빈 입력에서도 NaN/Infinity 없이 안전하게 처리한다", () => {
      const empty = tessellateShaderVectorInkRibbon([]);
      expect(empty.vertexCount).toBe(0);
      expect(empty.triangleCount).toBe(0);

      const degenerate = tessellateShaderVectorInkRibbon(
        [
          {
            p0: { x: 12, y: 12 },
            p1: { x: 12, y: 12 },
            p2: { x: 12, y: 12 },
            p3: { x: 12, y: 12 },
            pressureStart: 0.5,
            pressureEnd: 0.5,
            baseRadiusPx: 4,
          },
        ],
        { subdivisions: 4 },
      );
      expect(degenerate.vertexCount).toBe(10);
      for (let i = 0; i < degenerate.vertices.length; i += 1) {
        expect(Number.isFinite(degenerate.vertices[i])).toBe(true);
      }
    });
  });

  describe("StudioNextGenPerfTelemetryCard UI · 스프라이트 · CSS 계약", () => {
    it("8대 신호등 · tech-webgpu.webp 스프라이트 · 8K 시뮬레이터 · LOD · WebCodecs 인터랙션을 렌더한다", () => {
      const snapshot = probeNextGenPerfCapabilities({
        wasm64Probe: {
          memoryConstructor: class {
            readonly buffer = new ArrayBuffer(WASM_PAGE_SIZE_BYTES);
          },
          deviceMemoryGiB: 16,
          sharedArrayBufferAvailable: true,
          crossOriginIsolated: true,
          nowMs: 0,
        },
        webgpuSupported: true,
        webnnProbe: { hasNavigatorMl: true, preferredMlDevice: "npu", hasWebGpu: true },
        webcodecsProbe: {
          hasVideoEncoder: true,
          hasVideoFrame: true,
          hasMediaStreamTrackProcessor: true,
          hasRtcPeerConnection: true,
        },
        opfsWebRtcProbe: { hasOpfs: true, hasWebRtcP2p: true, hasBroadcastChannel: true },
        computePressureSupported: true,
      });

      expect(snapshot.readinessScore).toBe(100);
      expect(snapshot.readinessTier).toBe("nextgen-ready");

      const { container } = render(
        <StudioNextGenPerfTelemetryCard initialCapabilities={snapshot} />,
      );

      const spriteImg = container.querySelector(`img[src="${NEXTGEN_PERF_SPRITE_SRC}"]`);
      expect(spriteImg).not.toBeNull();
      expect(screen.getByTestId("ngp-readiness-score").textContent).toContain("100/100");

      for (const signalId of [
        "wasm64",
        "webgpu",
        "webnn",
        "webcodecs",
        "opfs",
        "webrtc",
        "pressure",
        "lod",
      ]) {
        expect(screen.getByTestId(`ngp-signal-${signalId}`)).toBeTruthy();
      }

      // 8K 128레이어 및 32비트 비교 버튼 전환
      fireEvent.click(screen.getByTestId(`ngp-preset-${CANVAS_MEMORY_WORKLOAD_PRESETS[2].id}`));
      fireEvent.click(screen.getByRole("button", { name: "32비트 비교" }));
      expect(screen.getByTestId("ngp-memory-strategy").textContent).toContain("LRU");

      // Compute Pressure 긴급 부하 전환 시 LOD 즉시 강등
      fireEvent.click(screen.getByTestId("ngp-pressure-critical"));
      expect(screen.getByTestId("ngp-lod-particles").textContent).toBe("15%");
      expect(screen.getByTestId("ngp-lod-shadow").textContent).toBe("256px");
      expect(screen.getByTestId("ngp-lod-watercolor").textContent).toBe("1단계");

      // WebCodecs 스마트 TV 전환
      fireEvent.click(screen.getByTestId("ngp-mirror-smart-tv-cast"));
      expect(screen.getByTestId("ngp-mirror-res").textContent).toContain("3840×2160");
    });

    it("SSR(renderToStaticMarkup)에서 안전하게 렌더되고 CSS·스프라이트 위생 계약을 지킨다", () => {
      const html = renderToStaticMarkup(<StudioNextGenPerfTelemetryCard reduceMotion />);
      expect(html).toContain('data-testid="studio-nextgen-perf-telemetry-card"');
      expect(html).toContain('data-ngp-reduce-motion="true"');
      expect(html).toContain(NEXTGEN_PERF_SPRITE_SRC);

      const spriteAssetPath = resolve(
        process.cwd(),
        "apps/web/public/assets/studio/vibrant-sprites/tech-webgpu.webp",
      );
      expect(existsSync(spriteAssetPath)).toBe(true);

      const cssText = readFileSync(
        resolve(
          process.cwd(),
          "apps/web/src/domains/creator/nextgen-perf-engine/nextgen-perf-engine.css",
        ),
        "utf8",
      );
      expect(cssText).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
      expect(cssText).not.toContain("transition: all");
      expect(cssText).toContain("word-break: keep-all");
      expect(cssText).toContain("font-variant-numeric: tabular-nums");
      expect(cssText).toContain("min-height: 44px");
      expect(cssText).toContain("prefers-reduced-motion: reduce");
      expect(cssText).toContain("forced-colors: active");
    });
  });
});
