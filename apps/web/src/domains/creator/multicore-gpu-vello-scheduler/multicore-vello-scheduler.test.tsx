// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COMPUTE_PRESSURE_STATES,
  CORE_COUNT_PRESETS,
  LOCK_FREE_CACHE_LINE_BYTES,
  LOCK_FREE_RING_SLOT_COUNT,
  NEXTGEN_WEB_PLATFORM_PROBES,
  SCHEDULER_MANIFEST_SCHEMA_VERSION,
  StudioMulticoreVelloSchedulerPanel,
  WEBGPU_BASELINE_STORAGE_BINDINGS_LIMIT,
  buildMulticoreVelloPlan,
  evaluateNextGenPlatformMatrix,
  exportMulticoreVelloPlanJson,
  normalizeSchedulerEnvironmentInput,
  planCpuMulticoreWorkerPool,
  planVelloComputeStageGraph,
  probeBrowserRuntimeCapabilities,
  simulateHeterogeneousFrameTimeline,
  type ComputePressureState,
  type MulticoreVelloSchedulerPlan,
} from "./index";

afterEach(cleanup);

describe("1. CPU 멀티코어 Work-Stealing 워커 풀 플래너 (planCpuMulticoreWorkerPool)", () => {
  it("hardwareConcurrency를 2~32코어 안전 범위로 정규화한다", () => {
    expect(normalizeSchedulerEnvironmentInput({ hardwareConcurrency: 1 }).hardwareConcurrency).toBe(2);
    expect(normalizeSchedulerEnvironmentInput({ hardwareConcurrency: 64 }).hardwareConcurrency).toBe(32);
    expect(normalizeSchedulerEnvironmentInput({ hardwareConcurrency: Number.NaN }).hardwareConcurrency).toBe(8);
    expect(normalizeSchedulerEnvironmentInput().hardwareConcurrency).toBe(8);
  });

  it("메인 스레드 연산 차단 0% 원칙과 AudioWorklet(1)+Render(1)+clamp(cores-2,1,12) 워커 분할을 만족한다", () => {
    const cases: readonly [number, number][] = [
      [2, 1],
      [4, 2],
      [8, 6],
      [12, 10],
      [16, 12],
      [24, 12],
      [32, 12],
    ];
    for (const [cores, expectedWasm] of cases) {
      const pool = planCpuMulticoreWorkerPool({ hardwareConcurrency: cores, pressureState: "nominal" });
      expect(pool.mainThreadBlockingBudgetPct).toBe(0);
      expect(pool.dedicatedAudioWorkletCount).toBe(1);
      expect(pool.dedicatedRenderWorkerCount).toBe(1);
      expect(pool.rawWasmSimdWorkerCount).toBe(expectedWasm);
      expect(pool.activeWasmSimdWorkerCount).toBe(expectedWasm);
      expect(pool.totalActiveWorkerThreads).toBe(2 + expectedWasm);
      expect(pool.oversubscribedLogicalCores).toBe(cores < 3);
    }
  });

  it("COOP/COEP 격리 활성 시 SharedArrayBuffer + Atomics.waitAsync 락프리 링버퍼를 사용한다", () => {
    const pool = planCpuMulticoreWorkerPool({ hardwareConcurrency: 12, coopCoepIsolated: true });
    expect(pool.queueTransport).toBe("sab-atomics-wait-async-ring");
    expect(pool.workStealingStrategy).toBe("chase-lev-atomics-wait-async");
    expect(pool.ringSlotCount).toBe(LOCK_FREE_RING_SLOT_COUNT);
    expect(pool.cacheLinePaddingBytes).toBe(LOCK_FREE_CACHE_LINE_BYTES);
    expect(pool.zeroCopyTransferCount).toBe(0);
    expect(pool.fallbackReasonKo).toBeNull();
    expect(pool.estimatedDispatchOverheadUs).toBeLessThan(30);
  });

  it("COOP/COEP 미지원 시 MessageChannel Transferable ArrayBuffer 링으로 안전 폴백한다", () => {
    const sabPool = planCpuMulticoreWorkerPool({ hardwareConcurrency: 12, coopCoepIsolated: true });
    const fallbackPool = planCpuMulticoreWorkerPool({ hardwareConcurrency: 12, coopCoepIsolated: false });

    expect(fallbackPool.queueTransport).toBe("message-channel-transferable-ring");
    expect(fallbackPool.workStealingStrategy).toBe("message-channel-transferable-fallback");
    expect(fallbackPool.zeroCopyTransferCount).toBe(0);
    expect(fallbackPool.fallbackReasonKo).toContain("MessageChannel Transferable");
    expect(fallbackPool.fallbackReasonEn).toContain("MessageChannel Transferable");
    expect(fallbackPool.estimatedDispatchOverheadUs).toBeGreaterThan(sabPool.estimatedDispatchOverheadUs);
  });

  it("Compute Pressure 4단계(nominal/fair/serious/critical)에 따라 WASM 워커 수와 주사율을 자동 스로틀한다", () => {
    const nominal = planCpuMulticoreWorkerPool({ hardwareConcurrency: 16, pressureState: "nominal" });
    const fair = planCpuMulticoreWorkerPool({ hardwareConcurrency: 16, pressureState: "fair" });
    const serious = planCpuMulticoreWorkerPool({ hardwareConcurrency: 16, pressureState: "serious" });
    const critical = planCpuMulticoreWorkerPool({ hardwareConcurrency: 16, pressureState: "critical", targetFrameRateHz: 120 });

    expect(nominal.activeWasmSimdWorkerCount).toBe(12);
    expect(fair.activeWasmSimdWorkerCount).toBe(9);
    expect(serious.activeWasmSimdWorkerCount).toBe(6);
    expect(critical.activeWasmSimdWorkerCount).toBe(1);
    expect(critical.parkedWasmWorkerCount).toBe(11);
    expect(critical.effectiveTargetFrameRateHz).toBe(60);
    expect(nominal.effectiveTargetFrameRateHz).toBe(120);
  });

  it("WASM64/Relaxed-SIMD 비활성 오버라이드 시 WASM32·SIMD128 안전 모드로 자동 강등한다", () => {
    const pool = planCpuMulticoreWorkerPool({
      hardwareConcurrency: 8,
      featureOverrides: {
        "wasm-memory64": false,
        "wasm-relaxed-simd": false,
        "prioritized-task-scheduling": false,
      },
    });
    expect(pool.wasmMemoryAddressBits).toBe(32);
    expect(pool.wasmSimdTier).toBe("simd128");
    expect(pool.postTaskNativeActive).toBe(false);
    expect(pool.roles[0]?.backingCrateOrApi).toContain("MessageChannel");
  });

  it("4개 CPU 역할 로스터가 실제 저장소 Rust 크레이트와 Web API를 정확히 참조한다", () => {
    const pool = planCpuMulticoreWorkerPool({ hardwareConcurrency: 12 });
    expect(pool.roles.map((r) => r.id)).toEqual([
      "main-ui",
      "audio-worklet",
      "webgpu-render-worker",
      "wasm-simd-steal-pool",
    ]);
    expect(pool.roles[2]?.backingCrateOrApi).toBe("crates/studio-engine-vello");
    expect(pool.roles[3]?.backingCrateOrApi).toContain("crates/studio-wasm64-drawing-core");
  });

  it("메인 스레드 역할이 scheduler.postTask 3단 우선순위와 한글 IME 경계를 명시한다", () => {
    const pool = planCpuMulticoreWorkerPool({ hardwareConcurrency: 8 });
    const mainRole = pool.roles[0];
    expect(mainRole?.schedulerPriority).toBe("user-blocking");
    expect(mainRole?.responsibilitiesKo.some((s) => s.includes("scheduler.postTask"))).toBe(true);
    expect(mainRole?.responsibilitiesKo.some((s) => s.includes("한글 IME"))).toBe(true);
  });
});

describe("2. Vello 6단계 GPU 멀티스레드 컴퓨트 파이프라인 플래너 (planVelloComputeStageGraph)", () => {
  it("Vello 6단계가 정확한 순서와 ID로 구성된다", () => {
    const graph = planVelloComputeStageGraph();
    expect(graph.totalStages).toBe(6);
    expect(graph.stages.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(graph.stages.map((s) => s.id)).toEqual([
      "path-encode",
      "flatten-cubic",
      "subgroup-coarse-bin",
      "prefix-sum-alloc",
      "fine-sparse-raster",
      "indirect-composite",
    ]);
  });

  it("모든 스테이지가 WebGPU 기본 스토리지 바인딩 상한(<=8)과 유효한 Workgroup/Dispatch 크기를 지킨다", () => {
    const graph = planVelloComputeStageGraph({ activePaths: 48_000, dirtyTiles: 1024 });
    expect(graph.withinBaselineBindingLimit).toBe(true);
    expect(graph.maxStorageBindingsUsed).toBeLessThanOrEqual(WEBGPU_BASELINE_STORAGE_BINDINGS_LIMIT);
    for (const stage of graph.stages) {
      expect(stage.storageBindingCount).toBeLessThanOrEqual(WEBGPU_BASELINE_STORAGE_BINDINGS_LIMIT);
      expect(stage.totalBindings).toBe(stage.storageBindingCount + stage.uniformBindingCount);
      expect(stage.workgroupSize[0] * stage.workgroupSize[1] * stage.workgroupSize[2]).toBeGreaterThanOrEqual(64);
      expect(stage.dispatchWorkgroups[0]).toBeGreaterThanOrEqual(1);
    }
  });

  it("Chrome Preview 활성 시 3단계 enable subgroups; 및 6단계 multi-draw-indirect가 켜진다", () => {
    const previewOn = planVelloComputeStageGraph({ chromePreviewEnabled: true });
    const stage3 = previewOn.stages[2];
    const stage6 = previewOn.stages[5];

    expect(previewOn.subgroupsActive).toBe(true);
    expect(previewOn.multiDrawIndirectActive).toBe(true);
    expect(stage3?.wgslDirectives).toContain("enable subgroups;");
    expect(stage3?.fallbackActive).toBe(false);
    expect(stage6?.activeFeatureTag).toBe("multi-draw-indirect");
    expect(stage6?.fallbackActive).toBe(false);
  });

  it("Chrome Preview 비활성 시 3·4·6단계가 공유 메모리·Blelloch·버킷 폴백으로 정직하게 전환된다", () => {
    const previewOn = planVelloComputeStageGraph({ chromePreviewEnabled: true });
    const previewOff = planVelloComputeStageGraph({ chromePreviewEnabled: false });

    expect(previewOff.subgroupsActive).toBe(false);
    expect(previewOff.multiDrawIndirectActive).toBe(false);
    expect(previewOff.stages[2]?.fallbackActive).toBe(true);
    expect(previewOff.stages[2]?.fallbackNoteKo).toContain("workgroupBarrier()");
    expect(previewOff.stages[3]?.fallbackActive).toBe(true);
    expect(previewOff.stages[5]?.fallbackActive).toBe(true);
    expect(previewOff.totalEstimatedGpuMs).toBeGreaterThan(previewOn.totalEstimatedGpuMs);
  });

  it("shader-f16 활성 시 5단계에 enable f16;이 주입되고 미지원 시 f32 폴백으로 전환된다", () => {
    const f16On = planVelloComputeStageGraph({ featureOverrides: { "webgpu-shader-f16": true } });
    const f16Off = planVelloComputeStageGraph({ featureOverrides: { "webgpu-shader-f16": false } });

    expect(f16On.shaderF16Active).toBe(true);
    expect(f16On.stages[4]?.wgslDirectives).toContain("enable f16;");
    expect(f16On.stages[4]?.warpOccupancy.estimatedOccupancyPct).toBeGreaterThan(
      f16Off.stages[4]?.warpOccupancy.estimatedOccupancyPct ?? 0,
    );

    expect(f16Off.shaderF16Active).toBe(false);
    expect(f16Off.stages[4]?.fallbackActive).toBe(true);
    expect(f16Off.stages[4]?.estimatedGpuMs).toBeGreaterThan(f16On.stages[4]?.estimatedGpuMs ?? 0);
  });

  it("createComputePipelineAsync 비동기 2-웨이브 사전 컴파일이 직렬 컴파일보다 빠르다", () => {
    const graph = planVelloComputeStageGraph();
    for (const stage of graph.stages) {
      expect(stage.asyncPrecompile.api).toBe("createComputePipelineAsync");
      expect(stage.asyncPrecompile.cacheKey).toContain("vello.stage");
    }
    expect(graph.parallelAsyncPrecompileMs).toBeLessThan(graph.sequentialPrecompileMs);
    expect(graph.precompileSpeedupRatio).toBeGreaterThan(1.5);
  });

  it("timestamp-query 비활성 시 Render Worker 소프트웨어 펜스 계측으로 폴백한다", () => {
    const on = planVelloComputeStageGraph({ featureOverrides: { "webgpu-timestamp-query": true } });
    const off = planVelloComputeStageGraph({ featureOverrides: { "webgpu-timestamp-query": false } });

    expect(on.timestampQueryActive).toBe(true);
    expect(on.timingSourceLabelKo).toContain("timestamp-query");
    expect(off.timestampQueryActive).toBe(false);
    expect(off.timingSourceLabelKo).toContain("onSubmittedWorkDone");
  });

  it("Compute Pressure 악화 시 GPU 클럭 스케일이 낮아져 GPU 소요 시간이 단조 증가한다", () => {
    const times = COMPUTE_PRESSURE_STATES.map((state) =>
      planVelloComputeStageGraph({ pressureState: state }).totalEstimatedGpuMs,
    );
    expect(times[0]).toBeLessThan(times[1] ?? 0);
    expect(times[1]).toBeLessThan(times[2] ?? 0);
    expect(times[2]).toBeLessThan(times[3] ?? 0);
  });
});

describe("3. 최신 브라우저 · Chrome Preview 10종 웹 플랫폼 매트릭스 (NEXTGEN_WEB_PLATFORM_PROBES)", () => {
  it("요구된 10종 차세대 웹 플랫폼 프로브가 중복 없이 모두 정의되어 있다", () => {
    expect(NEXTGEN_WEB_PLATFORM_PROBES).toHaveLength(10);
    expect(NEXTGEN_WEB_PLATFORM_PROBES.map((p) => p.id)).toEqual([
      "webgpu-subgroups",
      "webgpu-shader-f16",
      "webgpu-multi-draw-indirect",
      "webgpu-timestamp-query",
      "webnn-npu",
      "wasm-memory64",
      "wasm-relaxed-simd",
      "sab-atomics-wait-async",
      "compute-pressure-api",
      "prioritized-task-scheduling",
    ]);
  });

  it("모든 프로브가 Stable 또는 Preview·Origin Trial 구분과 정직한 폴백 경로를 기재한다", () => {
    const previewIds = NEXTGEN_WEB_PLATFORM_PROBES
      .filter((p) => p.chromeStatus === "preview-origin-trial")
      .map((p) => p.id);
    expect(previewIds).toEqual([
      "webgpu-subgroups",
      "webgpu-multi-draw-indirect",
      "webnn-npu",
    ]);
    for (const probe of NEXTGEN_WEB_PLATFORM_PROBES) {
      expect(probe.fallbackPathKo.length).toBeGreaterThan(10);
      expect(probe.fallbackPathEn.length).toBeGreaterThan(10);
      expect(probe.browserSupportNoteKo.length).toBeGreaterThan(10);
    }
  });

  it("기본(COOP/COEP ON · Chrome Preview ON) 평가에서 안정 7종 + Preview 3종 + 폴백 0종을 산출한다", () => {
    const report = evaluateNextGenPlatformMatrix({ coopCoepIsolated: true, chromePreviewEnabled: true });
    expect(report.totalProbes).toBe(10);
    expect(report.activeStableCount).toBe(7);
    expect(report.activePreviewCount).toBe(3);
    expect(report.fallbackCount).toBe(0);
  });

  it("Chrome Preview OFF 시 Preview 3종(subgroups·MDI·WebNN)만 폴백으로 전환된다", () => {
    const report = evaluateNextGenPlatformMatrix({ coopCoepIsolated: true, chromePreviewEnabled: false });
    expect(report.activeStableCount).toBe(7);
    expect(report.activePreviewCount).toBe(0);
    expect(report.fallbackCount).toBe(3);
    expect(report.activeById["webgpu-subgroups"]).toBe(false);
    expect(report.activeById["webgpu-multi-draw-indirect"]).toBe(false);
    expect(report.activeById["webnn-npu"]).toBe(false);
    expect(report.activeById["webgpu-shader-f16"]).toBe(true);
  });

  it("COOP/COEP OFF 시 SharedArrayBuffer 프로브가 폴백으로 전환되고 사유를 명시한다", () => {
    const report = evaluateNextGenPlatformMatrix({ coopCoepIsolated: false, chromePreviewEnabled: true });
    const sabEntry = report.probes.find((p) => p.spec.id === "sab-atomics-wait-async");
    expect(sabEntry?.runtimeState).toBe("fallback-active");
    expect(sabEntry?.statusReasonKo).toContain("COOP/COEP");
    expect(report.fallbackCount).toBe(1);
  });

  it("probeBrowserRuntimeCapabilities가 jsdom 환경에서도 예외 없이 런타임 스냅샷을 반환한다", () => {
    const snap = probeBrowserRuntimeCapabilities();
    expect(snap.detectedHardwareConcurrency).toBeGreaterThanOrEqual(2);
    expect(snap.detectedHardwareConcurrency).toBeLessThanOrEqual(32);
    expect(typeof snap.crossOriginIsolated).toBe("boolean");
    expect(typeof snap.webGpuAvailable).toBe("boolean");
    expect(typeof snap.webNnAvailable).toBe("boolean");
  });
});

describe("4. 이기종 멀티코어·GPU·NPU 타임라인 시뮬레이터 & JSON 내보내기", () => {
  it("6개 이기종 실행 레인과 Vello 6단계 순차 세그먼트를 모두 생성한다", () => {
    const timeline = simulateHeterogeneousFrameTimeline({ hardwareConcurrency: 12 });
    const lanes = new Set(timeline.segments.map((s) => s.lane));
    expect(lanes.size).toBe(6);

    const velloSegs = timeline.segments.filter((s) => s.lane === "vello-gpu");
    expect(velloSegs).toHaveLength(6);
    for (let i = 1; i < velloSegs.length; i += 1) {
      expect(velloSegs[i]?.startMs).toBeGreaterThanOrEqual(velloSegs[i - 1]?.endMs ?? 0);
    }
  });

  it("CPU·GPU·NPU 병렬 중첩 실행으로 직렬 합산 대비 양의 단축률(%)을 달성하고 메인 차단은 0%다", () => {
    const timeline = simulateHeterogeneousFrameTimeline({ hardwareConcurrency: 12, targetFrameRateHz: 120 });
    expect(timeline.mainThreadBlockingPct).toBe(0);
    expect(timeline.mainThreadBusyMs).toBeLessThan(1.0);
    expect(timeline.totalFrameWallMs).toBeLessThan(timeline.serialTotalMs);
    expect(timeline.parallelOverlapGainPct).toBeGreaterThan(25);
    expect(timeline.meetsFrameBudget).toBe(true);
  });

  it("CPU 코어 수가 늘수록(4→8→12→16) WASM SIMD 워커 풀 벽시계 시간이 단조 감소한다", () => {
    const t4 = simulateHeterogeneousFrameTimeline({ hardwareConcurrency: 4 }).wasmPoolWallMs;
    const t8 = simulateHeterogeneousFrameTimeline({ hardwareConcurrency: 8 }).wasmPoolWallMs;
    const t12 = simulateHeterogeneousFrameTimeline({ hardwareConcurrency: 12 }).wasmPoolWallMs;
    const t16 = simulateHeterogeneousFrameTimeline({ hardwareConcurrency: 16 }).wasmPoolWallMs;
    expect(t4).toBeGreaterThan(t8);
    expect(t8).toBeGreaterThan(t12);
    expect(t12).toBeGreaterThan(t16);
  });

  it("WebNN NPU 비활성 시 NPU 추론이 폴백 백엔드로 전환되고 폴백 플래그가 표시된다", () => {
    const on = simulateHeterogeneousFrameTimeline({ chromePreviewEnabled: true });
    const off = simulateHeterogeneousFrameTimeline({ chromePreviewEnabled: false });

    expect(on.npuExecutionBackend).toBe("webnn-npu-coreml-directml-nnapi");
    expect(off.npuExecutionBackend).toBe("wasm-simd-cpu-fallback");
    expect(off.npuTaskWallMs).toBeGreaterThan(on.npuTaskWallMs);
    const offNpuSeg = off.segments.find((s) => s.lane === "webnn-npu");
    expect(offNpuSeg?.isFallback).toBe(true);
  });

  it("npuInferenceWorkload='none'이면 NPU 세그먼트를 생성하지 않고 비용을 0으로 유지한다", () => {
    const timeline = simulateHeterogeneousFrameTimeline({ npuInferenceWorkload: "none" });
    expect(timeline.npuTaskWallMs).toBe(0);
    expect(timeline.segments.some((s) => s.lane === "webnn-npu")).toBe(false);
  });

  it("exportMulticoreVelloPlanJson이 스키마 버전과 현재/목표 구분이 담긴 정형 JSON을 반환한다", () => {
    const { plan, json } = exportMulticoreVelloPlanJson({ hardwareConcurrency: 16, pressureState: "fair" });
    const parsed = JSON.parse(json) as MulticoreVelloSchedulerPlan;

    expect(plan.schemaVersion).toBe(SCHEDULER_MANIFEST_SCHEMA_VERSION);
    expect(parsed.schemaVersion).toBe(SCHEDULER_MANIFEST_SCHEMA_VERSION);
    expect(parsed.cpuWorkerPool.hardwareConcurrency).toBe(16);
    expect(parsed.velloComputeGraph.stages).toHaveLength(6);
    expect(parsed.platformMatrix.probes).toHaveLength(10);
    expect(parsed.honestScopeDisclosure.currentImplementationKo).toContain("현재 구현:");
    expect(parsed.honestScopeDisclosure.targetRuntimeKo).toContain("목표 런타임:");
  });
});

describe("5. 스튜디오 스케줄러 제어판 UI (StudioMulticoreVelloSchedulerPanel)", () => {
  it("props 없이 단독 렌더링되며 기본 한국어 UI·SVG 간트·Vello 6단계·10종 프로브 표를 표시한다", () => {
    render(<StudioMulticoreVelloSchedulerPanel />);
    expect(screen.getByTestId("studio-multicore-vello-scheduler-panel")).toBeTruthy();
    expect(screen.getByTestId("kpi-main-blocking").textContent).toContain("0%");
    expect(screen.getByTestId("vello-stages-table").querySelectorAll("tbody tr")).toHaveLength(6);
    expect(screen.getByTestId("nextgen-platform-matrix-table").querySelectorAll("tbody tr")).toHaveLength(10);
  });

  it("CPU 코어 프리셋 버튼(4/8/12/16/24코어) 클릭 시 워커 풀과 SVG 속성이 갱신되고 onPlanChange가 호출된다", () => {
    const onPlanChange = vi.fn();
    render(<StudioMulticoreVelloSchedulerPanel initialCoreCount={8} onPlanChange={onPlanChange} />);

    for (const cores of CORE_COUNT_PRESETS) {
      expect(screen.getByTestId(`core-preset-${cores}`)).toBeTruthy();
    }

    fireEvent.click(screen.getByTestId("core-preset-16"));
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    const svg = screen.getByTestId("multicore-vello-gantt-svg");
    expect(svg.getAttribute("data-cores")).toBe("16");
    expect(svg.getAttribute("data-active-wasm-workers")).toBe("12");
    expect(screen.getByTestId("kpi-worker-summary").textContent).toContain("12 WASM");
  });

  it("Compute Pressure 열 상태 버튼(nominal/fair/serious/critical)이 워커 스로틀과 배지를 즉시 갱신한다", () => {
    render(<StudioMulticoreVelloSchedulerPanel initialCoreCount={16} />);
    const states: readonly ComputePressureState[] = ["fair", "serious", "critical", "nominal"];

    fireEvent.click(screen.getByTestId(`pressure-state-${states[2]}`));
    const svg = screen.getByTestId("multicore-vello-gantt-svg");
    expect(svg.getAttribute("data-pressure")).toBe("critical");
    expect(svg.getAttribute("data-active-wasm-workers")).toBe("1");
    expect(screen.getByTestId("pressure-action-note").textContent).toContain("60Hz");

    fireEvent.click(screen.getByTestId(`pressure-state-${states[0]}`));
    expect(svg.getAttribute("data-active-wasm-workers")).toBe("9");
  });

  it("COOP/COEP SAB 토글이 SAB 락프리와 MessageChannel Transferable 폴백 사이를 전환한다", () => {
    render(<StudioMulticoreVelloSchedulerPanel />);
    const sabToggle = screen.getByTestId("toggle-coop-coep-sab");
    expect(sabToggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("multicore-vello-gantt-svg").getAttribute("data-queue-transport")).toBe(
      "sab-atomics-wait-async-ring",
    );

    fireEvent.click(sabToggle);
    expect(sabToggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("multicore-vello-gantt-svg").getAttribute("data-queue-transport")).toBe(
      "message-channel-transferable-ring",
    );
    expect(screen.getByTestId("queue-fallback-note").textContent).toContain("MessageChannel Transferable");
  });

  it("Chrome Preview 토글이 Preview 3종 활성 상태와 Vello 폴백 배지를 즉시 반영한다", () => {
    render(<StudioMulticoreVelloSchedulerPanel />);
    expect(screen.getByTestId("kpi-probe-counts").textContent).toContain("Preview 3");

    fireEvent.click(screen.getByTestId("toggle-chrome-preview"));
    expect(screen.getByTestId("kpi-probe-counts").textContent).toContain("Preview 0");
    expect(screen.getByTestId("kpi-probe-counts").textContent).toContain("폴백 3");
    expect(screen.getByTestId("vello-stage-row-subgroup-coarse-bin").textContent).toContain("shared-mem-fallback");
  });

  it("순수 시맨틱 SVG 간트 도해가 Vello 6단계 블록을 모두 렌더링한다", () => {
    const { container } = render(<StudioMulticoreVelloSchedulerPanel />);
    const svg = screen.getByTestId("multicore-vello-gantt-svg");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("data-vello-stages")).toBe("6");
    expect(container.querySelectorAll("[data-vello-stage]")).toHaveLength(6);
  });

  it("JSON 매니페스트 복사 버튼이 onExportJson을 호출하고 미리보기 토글이 동작한다", () => {
    const onExportJson = vi.fn();
    render(<StudioMulticoreVelloSchedulerPanel initialCoreCount={12} onExportJson={onExportJson} />);

    expect(screen.queryByTestId("manifest-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("copy-manifest-json-btn"));

    expect(onExportJson).toHaveBeenCalledTimes(1);
    const [jsonArg, planArg] = onExportJson.mock.calls[0] as [string, MulticoreVelloSchedulerPlan];
    expect(jsonArg).toContain(SCHEDULER_MANIFEST_SCHEMA_VERSION);
    expect(planArg.cpuWorkerPool.hardwareConcurrency).toBe(12);
    expect(screen.getByTestId("manifest-json-preview").textContent).toContain("sab-atomics-wait-async-ring");
    expect(screen.getByTestId("scheduler-panel-status").textContent).toContain("매니페스트");

    fireEvent.click(screen.getByTestId("toggle-manifest-preview-btn"));
    expect(screen.queryByTestId("manifest-json-preview")).toBeNull();
  });

  it("초기값 복원(Reset) 버튼과 영문 로케일(locale='en')이 일관되게 동작한다", () => {
    const { unmount } = render(<StudioMulticoreVelloSchedulerPanel initialCoreCount={12} initialPressureState="fair" />);
    fireEvent.click(screen.getByTestId("core-preset-24"));
    fireEvent.click(screen.getByTestId("pressure-state-critical"));
    fireEvent.click(screen.getByTestId("reset-scheduler-btn"));

    const svgKo = screen.getByTestId("multicore-vello-gantt-svg");
    expect(svgKo.getAttribute("data-cores")).toBe("12");
    expect(svgKo.getAttribute("data-pressure")).toBe("fair");
    unmount();

    render(<StudioMulticoreVelloSchedulerPanel locale="en" initialCoreCount={16} />);
    expect(screen.getByTestId("multicore-vello-gantt-svg").textContent).toContain(
      "HETEROGENEOUS CPU · VELLO 6-STAGE GPU · NPU FRAME TIMELINE",
    );
    expect(screen.getByTestId("kpi-main-blocking").textContent).toContain("Main Compute Block 0%");
    expect(screen.getByTestId("nextgen-platform-matrix-table").textContent).toContain("Active Preview/OT");
  });
});

describe("6. 코드 위생 · 탈-바이올렛 OKLCH · Calm Atelier 하네스 계약 자가 검증", () => {
  it("소유 파일 4개의 줄 수 상한(engine<=750, panel<=700, 전체<=800)과 금지 패턴 0건을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "multicore-vello-scheduler-engine.ts",
      "StudioMulticoreVelloSchedulerPanel.tsx",
      "index.ts",
      "multicore-vello-scheduler.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.sort()).toEqual([...required].sort());

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "multicore-vello-scheduler-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioMulticoreVelloSchedulerPanel.tsx") expect(lines).toBeLessThanOrEqual(700);

      if (file !== "multicore-vello-scheduler.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("Sparkles");
        expect(src).not.toContain("하는 것을 가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공합니다");
        expect(src).not.toContain("원활한 워크플로우를 보장합니다");
      }

      if (file === "StudioMulticoreVelloSchedulerPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("패널 내 모든 oklch() 색상이 바이올렛 휴 대역(270~320도)을 0% 배제한다", () => {
    const panelSrc = readFileSync(
      path.resolve(import.meta.dirname, "StudioMulticoreVelloSchedulerPanel.tsx"),
      "utf8",
    );
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(6);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("렌더된 패널의 모든 버튼이 min-h-11 접근성 터치 타깃을 충족한다", () => {
    const { container } = render(<StudioMulticoreVelloSchedulerPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(15);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
  });

  it("buildMulticoreVelloPlan이 60Hz 선택 시 16.67ms 예산으로 전환하고 치명적 오류 없이 일관된 결과를 낸다", () => {
    const plan60 = buildMulticoreVelloPlan({ hardwareConcurrency: 4, targetFrameRateHz: 60, pressureState: "serious" });
    expect(plan60.frameTimeline.effectiveFrameRateHz).toBe(60);
    expect(plan60.frameTimeline.frameBudgetMs).toBe(16.67);
    expect(plan60.frameTimeline.meetsFrameBudget).toBe(true);
  });
});
