import { readFileSync } from "node:fs";
import path from "node:path";

import { sceneIRSchema } from "@toonstudio/studio-project-model";
import { describe, expect, it, vi } from "vitest";

import { createWasm64AdaptiveLoadBalancer } from "../wasm64-runtime-bridge/wasm64-adaptive-load-balancer";

import {
  STUDIO_VELLO_PHASE12_FLAG_DEFAULT,
  STUDIO_VELLO_PHASE12_STORAGE_KEY,
  adaptBubbleElToVelloSpec,
  adaptViewportToolLayersToPhase1State,
  buildMarchingAntsSceneNode,
  createStudioVelloViewportRuntimeBridge,
  mapBubbleVariantToVelloShape,
  parseCssColorToIR,
  resolveStudioVelloPhase12Flag,
  type StudioVelloBridgeRendererHandle,
  type StudioViewportToolLayersPhase1Slice,
} from "./studio-vello-viewport-runtime-bridge";

import type { BubbleEl } from "../studio-element-model";
import type { StudioWasm64ExtendedSuiteRuntime } from "../wasm64-runtime-bridge/wasm64-extended-suite-types";
import type { StudioVelloOverlayViewport } from "./studio-vello-phase1-overlay-adapter";

const BASE_VIEWPORT: StudioVelloOverlayViewport = {
  width: 960,
  height: 640,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  dpr: 2,
  documentWidth: 800,
  documentHeight: 1600,
};

function makeToolLayersSlice(
  overrides: Partial<StudioViewportToolLayersPhase1Slice> = {},
): StudioViewportToolLayersPhase1Slice {
  return {
    isExporting: false,
    canvasH: 1600,
    canvasWidth: 800,
    effScale: 1,
    showGrid: true,
    gridSize: 100,
    guides: { x: [400], y: [800] },
    userGuides: [{ id: "ug-1", type: "v", pos: 120 }],
    smartGuides: {
      segments: [{ axis: "h", pos: 320, from: 60, to: 680, kind: "center" }],
      spacings: [],
    },
    perspectiveRulerActive: true,
    vanishingPoints: [{ id: "vp-left", x: 140, y: 240 }, { id: "vp-right", x: 740, y: 240 }],
    perspectiveEyeLevelY: 240,
    marqueeRect: { x: 100, y: 120, width: 220, height: 140, dashed: true },
    rulers: { visible: true, showLabels: true },
    transformBox: { bounds: { x: 200, y: 160, width: 180, height: 100 }, rotationDeg: 0 },
    ...overrides,
  };
}

function makeSampleBubbles(): BubbleEl[] {
  return [
    {
      id: "bubble-htb",
      type: "bubble",
      variant: "speech",
      text: "정말 그럴 리가 없잖아?!",
      x: 40,
      y: 40,
      width: 210,
      height: 130,
      fill: "#ffffff",
      stroke: "#111827",
      textFill: "#111827",
      rotation: 0,
      tail: "left",
      tailDirection: "bottom",
      tailXRatio: 0.4,
      tailHeight: 32,
      fontSize: 20,
      vertical: false,
    },
    {
      id: "bubble-ttb",
      type: "bubble",
      variant: "thought",
      text: "「그날 2026년」정말…놀라웠다。",
      x: 320,
      y: 50,
      width: 220,
      height: 180,
      fill: "rgba(255, 252, 244, 0.96)",
      stroke: "#1f4435",
      textFill: "#111111",
      rotation: 0,
      tail: "right",
      tailDirection: "bottom",
      fontSize: 20,
      vertical: true,
    },
    {
      id: "bubble-burst",
      type: "bubble",
      variant: "shout",
      text: "멈춰!",
      x: 580,
      y: 60,
      width: 180,
      height: 120,
      fill: "#fff7ed",
      textFill: "#991b1b",
      rotation: 0,
      tail: "none",
    },
  ];
}

function createCanvas2DSpy() {
  const calls: string[] = [];
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "butt", lineJoin: "miter", font: "",
    save: vi.fn(() => calls.push("save")),
    restore: vi.fn(() => calls.push("restore")),
    setTransform: vi.fn(() => calls.push("setTransform")),
    clearRect: vi.fn(() => calls.push("clearRect")),
    beginPath: vi.fn(() => calls.push("beginPath")),
    moveTo: vi.fn(() => calls.push("moveTo")),
    lineTo: vi.fn(() => calls.push("lineTo")),
    quadraticCurveTo: vi.fn(() => calls.push("quadraticCurveTo")),
    bezierCurveTo: vi.fn(() => calls.push("bezierCurveTo")),
    closePath: vi.fn(() => calls.push("closePath")),
    fill: vi.fn(() => calls.push("fill")),
    stroke: vi.fn(() => calls.push("stroke")),
    translate: vi.fn(() => calls.push("translate")),
    rotate: vi.fn(() => calls.push("rotate")),
    scale: vi.fn(() => calls.push("scale")),
    fillText: vi.fn(() => calls.push("fillText")),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe("studio-vello-viewport-runtime-bridge", () => {
  it("Konva 런타임 import 0건, 타입 전용 계약 참조, 800줄 이하 아키텍처 가드를 준수한다", () => {
    const src = readFileSync(path.resolve(__dirname, "studio-vello-viewport-runtime-bridge.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["'](?:konva|react-konva)/u);
    expect(src).not.toMatch(/import\s+(?!type\b)[^;]+from\s+["']\.\/StudioCanvasViewportToolLayers["']/u);
    expect(src).not.toMatch(/import\s+(?!type\b)[^;]+from\s+["']\.\.\/studio-element-model["']/u);
    expect(src.split("\n").length).toBeLessThanOrEqual(800);
  });

  it("studioVelloPhase12Enabled 기본값은 false(안전 Konva 경로)이며 플래그 우선순위·비상 차단·런타임 토글이 정확하다", async () => {
    expect(STUDIO_VELLO_PHASE12_FLAG_DEFAULT).toBe(false);
    expect(resolveStudioVelloPhase12Flag({})).toEqual({ enabled: false, source: "safe-default" });
    expect(resolveStudioVelloPhase12Flag({ urlSearch: "?studioVelloPhase12=1" })).toEqual({ enabled: true, source: "query-param" });
    expect(resolveStudioVelloPhase12Flag({ storageGet: (k) => (k === STUDIO_VELLO_PHASE12_STORAGE_KEY ? "true" : null) })).toEqual({ enabled: true, source: "storage" });
    expect(resolveStudioVelloPhase12Flag({ globalFlags: { __TOONSTUDIO_VELLO_PHASE12_ENABLED__: true } })).toEqual({ enabled: true, source: "global-flag" });
    expect(resolveStudioVelloPhase12Flag({
      studioVelloPhase12Enabled: true,
      globalFlags: { __TOONSTUDIO_VELLO_PHASE12_DISABLED__: true },
    })).toEqual({ enabled: false, source: "emergency-disabled" });

    // 기본값(false)에서는 Vello 렌더러 초기화를 전혀 호출하지 않고 Konva 소유권을 유지한다
    const initSpy = vi.fn<() => StudioVelloBridgeRendererHandle>();
    const bridge = createStudioVelloViewportRuntimeBridge({ initVelloRenderer: initSpy });
    const res = await bridge.renderFrame({ viewport: BASE_VIEWPORT, toolLayers: makeToolLayersSlice(), bubbleElements: makeSampleBubbles() });
    expect(res.activeBackend).toBe("konva");
    expect(res.fallbackReason).toBe("feature-flag-disabled");
    expect(res.ownership).toEqual({
      phase1OverlayOwner: "konva", phase2BalloonOwner: "konva",
      konvaShouldRenderOverlays: true, konvaShouldRenderBalloons: true,
    });
    expect(initSpy).not.toHaveBeenCalled();
  });

  it("Phase 1(가이드·격자·투시 자·마키·변형 상자)과 Phase 2(한국어 HTB/TTB 말풍선·꼬리)를 단일 Vello SceneIR로 통합 제출한다", async () => {
    const submittedScenes: unknown[] = [];
    const disposeSpy = vi.fn();
    const bridge = createStudioVelloViewportRuntimeBridge({
      studioVelloPhase12Enabled: true,
      initVelloRenderer: () => ({
        backendLabel: "vello-hybrid-wgpu",
        submitScene: (scene) => { submittedScenes.push(scene); },
        dispose: disposeSpy,
      }),
    });

    const frame = await bridge.renderFrame({
      viewport: BASE_VIEWPORT,
      toolLayers: makeToolLayersSlice(),
      bubbleElements: makeSampleBubbles(),
      marchingAnts: { segments: new Uint32Array([10, 20, 110, 20, 110, 20, 110, 80]), segmentCount: 2 },
    });

    expect(frame.activeBackend).toBe("vello");
    expect(frame.fallbackReason).toBe("none");
    expect(frame.ownership).toEqual({
      phase1OverlayOwner: "vello", phase2BalloonOwner: "vello",
      konvaShouldRenderOverlays: false, konvaShouldRenderBalloons: false,
    });
    expect(submittedScenes).toHaveLength(1);

    const parsed = sceneIRSchema.parse(frame.unifiedScene);
    expect(parsed.version).toBe(11);
    const ids = parsed.nodes.map((n) => n.id);
    // Phase 2 말풍선이 먼저 배치되고, 마칭 앤츠 및 Phase 1 오버레이가 위에 그려져야 한다
    expect(ids.indexOf("balloon-bubble-htb")).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf("balloon-bubble-ttb")).toBeGreaterThan(ids.indexOf("balloon-bubble-htb"));
    expect(ids.indexOf("overlay-wasm-marching-ants")).toBeGreaterThan(ids.indexOf("balloon-bubble-burst"));
    expect(ids.indexOf("overlay-perspective-rays")).toBeGreaterThan(ids.indexOf("overlay-wasm-marching-ants"));
    expect(ids).toContain("grid-v-1");
    expect(ids).toContain("user-guide-ug-1");
    expect(ids).toContain("smart-guide-0");
    expect(ids).toContain("overlay-marquee-stroke");
    expect(ids).toContain("overlay-transform-frame");

    // Phase 2 한국어 세로쓰기(TTB) 레이아웃 및 Phase 1 변형 상자 히트 테스트 검증
    expect(frame.phase2Output?.stats.balloonCount).toBe(3);
    expect(frame.phase2Output?.stats.verticalBalloonCount).toBe(1);
    expect(frame.phase2Output?.layouts.get("bubble-ttb")?.verticalMetrics?.tateChuYokoCount).toBe(1);
    expect(frame.transformHandles).toHaveLength(9);
    expect(bridge.hitTestTransform({ x: 290, y: 210 })?.handle).toBe("move");

    // 내보내기 중에는 Phase 1 도구 오버레이를 억제한다
    expect(adaptViewportToolLayersToPhase1State(makeToolLayersSlice({ isExporting: true }))).toEqual({});

    // 런타임 토글 OFF 전환 시 즉시 렌더러 정리 + Konva 복귀
    bridge.setStudioVelloPhase12Enabled(false);
    expect(disposeSpy).toHaveBeenCalledOnce();
    expect(bridge.getLayerOwnership().konvaShouldRenderOverlays).toBe(true);
    expect(bridge.getTelemetry().loadBalancer.sampleCount).toBeGreaterThanOrEqual(1);
  });

  it("렌더러 초기화 실패·제출 예외·GPU 디바이스 유실 시 예외 없이 Konva로 자동 폴백한다", async () => {
    // 1) 초기화 실패 -> 자동 Konva 폴백 + WebGPU 디바이스 유실 보고
    const initFailBridge = createStudioVelloViewportRuntimeBridge({
      studioVelloPhase12Enabled: true,
      initVelloRenderer: async () => { throw new Error("WebGPU adapter unavailable"); },
    });
    const initFailRes = await initFailBridge.renderFrame({ viewport: BASE_VIEWPORT, toolLayers: makeToolLayersSlice() });
    expect(initFailRes.activeBackend).toBe("konva");
    expect(initFailRes.fallbackReason).toBe("renderer-init-error");
    expect(initFailRes.ownership.konvaShouldRenderOverlays).toBe(true);
    expect(initFailRes.errorMessage).toContain("WebGPU adapter unavailable");
    expect(initFailBridge.getTelemetry().rendererInitFailures).toBe(1);
    expect(initFailBridge.loadBalancer.getTelemetry().gpuDeviceLost).toBe(true);

    // 2) 프레임 제출 중 예외 -> 동일 프레임에서 Konva로 즉시 복구 + 핸들 dispose
    const brokenDispose = vi.fn();
    const submitFailBridge = createStudioVelloViewportRuntimeBridge({
      studioVelloPhase12Enabled: true,
      initVelloRenderer: () => ({
        submitScene: () => { throw new Error("VK_ERROR_DEVICE_LOST"); },
        dispose: brokenDispose,
      }),
    });
    const submitFailRes = await submitFailBridge.renderFrame({ viewport: BASE_VIEWPORT, toolLayers: makeToolLayersSlice() });
    expect(submitFailRes.activeBackend).toBe("konva");
    expect(submitFailRes.fallbackReason).toBe("renderer-submit-error");
    expect(brokenDispose).toHaveBeenCalledOnce();
    expect(submitFailBridge.getTelemetry().rendererSubmitFailures).toBe(1);

    // 3) GPU 유실 시 기본 Konva 복귀 vs 명시적 Canvas2D 폴백 옵트인 검증
    const overlaySpy = createCanvas2DSpy();
    const balloonSpy = createCanvas2DSpy();
    const canvasFallbackBridge = createStudioVelloViewportRuntimeBridge({
      studioVelloPhase12Enabled: true,
      allowCanvas2dFallbackOnGpuLoss: true,
      overlayCanvas2d: overlaySpy.ctx,
      balloonCanvas2d: balloonSpy.ctx,
      initVelloRenderer: () => ({ submitScene: vi.fn() }),
    });
    canvasFallbackBridge.notifySystemPressure({ gpuDeviceLost: true });
    const fbRes = await canvasFallbackBridge.renderFrame({
      viewport: BASE_VIEWPORT, toolLayers: makeToolLayersSlice(), bubbleElements: makeSampleBubbles(),
    });
    expect(fbRes.activeBackend).toBe("vello-canvas2d-fallback");
    expect(fbRes.fallbackReason).toBe("gpu-device-lost");
    expect(overlaySpy.calls).toContain("stroke");
    expect(balloonSpy.calls).toContain("fillText");
  });

  it("Wasm64AdaptiveLoadBalancer 및 확장 WASM 핫패스 어댑터가 가속기 라우팅·지연 로드·JS 폴백을 정확히 수행한다", async () => {
    const disposeWasm = vi.fn();
    const fakeSuite = { dispose: disposeWasm } as unknown as StudioWasm64ExtendedSuiteRuntime;
    const loadSuiteSpy = vi.fn(async () => fakeSuite);
    const balancer = createWasm64AdaptiveLoadBalancer({
      capabilities: { webgpuCompute: true, wasmRelaxedSimd: true, wasmSimd128: true },
    });

    const bridge = createStudioVelloViewportRuntimeBridge({
      loadBalancer: balancer,
      loadExtendedWasmSuite: loadSuiteSpy,
    });

    const wasmRes = await bridge.dispatchExtendedWasmHotpath("small-tile-filter", {
      runWasm: () => "wasm-fast-path",
      runJsFallback: () => "js-slow-path",
    });
    expect(wasmRes.executor).toBe("wasm64-extended-suite");
    expect(wasmRes.routeDecision.accelerator).toBe("wasm-relaxed-simd");
    expect(wasmRes.value).toBe("wasm-fast-path");
    expect(loadSuiteSpy).toHaveBeenCalledOnce();

    // 두 번째 호출은 캐시된 확장 WASM 런타임을 재사용한다
    const secondRes = await bridge.dispatchExtendedWasmHotpath("brush-stamp", {
      runWasm: () => 42,
      runJsFallback: () => 0,
    });
    expect(secondRes.value).toBe(42);
    expect(loadSuiteSpy).toHaveBeenCalledOnce();

    // 로드 실패 시 JS 폴백으로 무중단 강등
    const failingBridge = createStudioVelloViewportRuntimeBridge({
      loadBalancer: createWasm64AdaptiveLoadBalancer({ capabilities: { wasmSimd128: true } }),
      loadExtendedWasmSuite: async () => { throw new Error("WASM compile failed"); },
    });
    const fallbackRes = await failingBridge.dispatchExtendedWasmHotpath("small-tile-filter", {
      runWasm: () => "unreachable",
      runJsFallback: () => "js-recovered",
    });
    expect(fallbackRes.executor).toBe("js-fallback");
    expect(fallbackRes.value).toBe("js-recovered");
    expect(fallbackRes.fallbackError).toContain("WASM compile failed");

    // 보조 변환 유틸(variant 매핑·CSS 색 파서·빈 마칭 앤츠) 검증
    expect(mapBubbleVariantToVelloShape("cloud-soft")).toBe("cloud");
    expect(mapBubbleVariantToVelloShape("explosive")).toBe("burst");
    expect(mapBubbleVariantToVelloShape("system")).toBe("box");
    expect(mapBubbleVariantToVelloShape("speech")).toBe("oval");
    expect(parseCssColorToIR("#0f0", { r: 0, g: 0, b: 0, a: 1 })).toEqual({ r: 0, g: 1, b: 0, a: 1 });
    expect(buildMarchingAntsSceneNode({ segments: new Uint32Array(0), segmentCount: 0 }, BASE_VIEWPORT)).toBeNull();
    expect(adaptBubbleElToVelloSpec(makeSampleBubbles()[1]!).writingMode).toBe("ttb");

    bridge.dispose();
    expect(disposeWasm).toHaveBeenCalledOnce();
  });
});
