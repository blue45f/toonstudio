// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { createStudioFoleyAudioEngine } from "../vibrant-studio-fx/studio-procedural-foley-audio";
import { prepareStudioFoleyOnToolClick } from "./studio-foley-tool-gesture";
import {
  StudioDrawingQuickErgonomicsBar,
  type StudioDrawingErgonomicsSession,
} from "./StudioDrawingQuickErgonomicsBar";
import { StudioLiveFoleyFeelControls } from "./StudioLiveFoleyFeelControls";
import {
  applyStudioPressureCurve,
  cycleLiveFoleyPreset,
  cycleStudioPressureCurvePreset,
  extractCoalescedPointerSamples,
  getLiveFoleyState,
  getStudioLiveStrokeFoleyController,
  getStudioPressureCurveGamma,
  getStudioPressureCurvePreset,
  resolveStudioFoleySoundForBrush,
  setLiveFoleyPreset,
  setStudioPressureCurvePreset,
  STUDIO_PRESSURE_CURVE_GAMMA,
  StudioLiveStrokeFoleyController,
  subscribeLiveFoleyState,
  subscribeStudioPressureCurve,
  toggleLiveFoleyMute,
} from "./studio-live-stroke-foley-bridge";

interface MockNodeRecord {
  connected: boolean;
  disconnected: boolean;
  endedCb: (() => void) | null;
}

function createMockAudioContext(initialState: AudioContextState = "running") {
  const nodes: MockNodeRecord[] = [];
  let state: AudioContextState = initialState;
  const resume = vi.fn(async () => {
    state = "running";
  });
  const close = vi.fn(async () => {
    state = "closed";
  });

  const makeParam = () => ({
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });

  const makeNode = (extra: Record<string, unknown> = {}) => {
    const rec: MockNodeRecord = { connected: false, disconnected: false, endedCb: null };
    nodes.push(rec);
    const node = {
      connect: vi.fn(() => {
        rec.connected = true;
      }),
      disconnect: vi.fn(() => {
        rec.disconnected = true;
      }),
      ...extra,
    };
    Object.defineProperty(node, "onended", {
      get: () => rec.endedCb,
      set: (fn: (() => void) | null) => {
        rec.endedCb = fn;
      },
      enumerable: true,
      configurable: true,
    });
    return node;
  };

  const ctx = {
    get state() {
      return state;
    },
    currentTime: 0,
    sampleRate: 44100,
    destination: makeNode(),
    resume,
    close,
    createGain: vi.fn(() => makeNode({ gain: makeParam() })),
    createBiquadFilter: vi.fn(() =>
      makeNode({ type: "bandpass", frequency: makeParam(), Q: makeParam() }),
    ),
    createBuffer: vi.fn((_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    })),
    createBufferSource: vi.fn(() =>
      makeNode({ buffer: null, loop: false, start: vi.fn(), stop: vi.fn() }),
    ),
    createOscillator: vi.fn(() =>
      makeNode({ type: "triangle", frequency: makeParam(), start: vi.fn(), stop: vi.fn() }),
    ),
  };

  const flushEnded = () => {
    for (const rec of nodes) {
      if (rec.endedCb) {
        const cb = rec.endedCb;
        rec.endedCb = null;
        cb();
      }
    }
  };

  return {
    ctx: ctx as unknown as AudioContext,
    nodes,
    resume,
    close,
    flushEnded,
  };
}

function createErgonomicsSession(
  overrides: Partial<StudioDrawingErgonomicsSession> = {},
): StudioDrawingErgonomicsSession {
  return {
    activeSurfaceReviewLocked: false,
    pageEditLocked: false,
    canvasInteractionBlocked: false,
    scopedCanvasDrawingAvailable: false,
    tool: "draw",
    drawMode: "pen",
    activatePrimaryCanvasTool: vi.fn(),
    strokeWidth: 8,
    setStrokeWidth: vi.fn(),
    stabilizer: 0,
    setStabilizer: vi.fn(),
    showWebtoonGuides: false,
    setShowWebtoonGuides: vi.fn(),
    effScale: 1,
    setZoom: vi.fn(),
    zoomLocked: false,
    viewTransformSuppressed: false,
    bg3dOpen: false,
    studioLeftToolRailHandlers: { toggleBg3dEditor: vi.fn() },
    exportMenuOpen: false,
    setExportMenuOpen: vi.fn(),
    canvasFlipH: false,
    symmetryType: "none",
    changeStudioSymmetryType: vi.fn(),
    proDrawPrefs: { sizeLocked: false },
    studioOptionsBarsHandlers: {
      toggleSizeLock: vi.fn(),
      flipCanvasHorizontal: vi.fn(),
      openBrushStudio: vi.fn(),
    },
    studioToolBeltContentHandlers: {
      setActualPixelView: vi.fn(),
    },
    ...overrides,
  };
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  setLiveFoleyPreset("quiet-atelier");
  setStudioPressureCurvePreset("standard");
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  setLiveFoleyPreset("quiet-atelier");
  setStudioPressureCurvePreset("standard");
  useI18n.setState({ lang: "ko" });
});

describe("Studio live stroke Foley & feel bridge", () => {
  it("신뢰된 도구 선택 클릭만 이미 등록된 Foley에 전달한다", () => {
    const prepare = vi.spyOn(getStudioLiveStrokeFoleyController(), "prewarmContextFromGesture").mockImplementation(() => {});
    const activation = { isActive: false };
    vi.spyOn(window, "navigator", "get").mockReturnValue(Object.create(navigator, {
      userActivation: { value: activation },
    }) as Navigator);
    prepareStudioFoleyOnToolClick({ type: "click", isTrusted: true });
    activation.isActive = true;
    prepareStudioFoleyOnToolClick({ type: "click", isTrusted: false });
    prepareStudioFoleyOnToolClick({ type: "pointerenter", isTrusted: true });
    expect(prepare).not.toHaveBeenCalled();
    prepareStudioFoleyOnToolClick({ type: "click", isTrusted: true });
    expect(prepare).toHaveBeenCalledOnce();
  });

  it("도구 선택에서는 소리 없이 한 번 준비하고 첫 획은 같은 장치로 한 번 재생한다", () => {
    const audio = createMockAudioContext("suspended");
    const factory = vi.fn(() => audio.ctx);
    const engineFactory = vi.fn(createStudioFoleyAudioEngine);
    const controller = new StudioLiveStrokeFoleyController({ audioContextFactory: factory, engineFactory });

    controller.prewarmContextFromGesture();
    controller.prewarmContextFromGesture();
    expect(factory).toHaveBeenCalledOnce();
    expect(audio.resume).toHaveBeenCalledOnce();
    expect(engineFactory).not.toHaveBeenCalled();
    expect(audio.ctx.createOscillator).not.toHaveBeenCalled();
    expect(audio.ctx.createBufferSource).not.toHaveBeenCalled();
    expect(controller.getState().activeSoundId).toBeNull();

    controller.toggleMute();
    const input = { x: 5, y: 10, pressure: 0.6, brushId: "gpen" };
    expect(controller.onStrokeStart(input)).toBeNull();
    expect(engineFactory).not.toHaveBeenCalled();
    controller.onStrokeEnd();
    controller.toggleMute();
    expect(controller.onStrokeStart(input)).toMatchObject({ played: true, soundId: "gpen-ink" });
    expect(factory).toHaveBeenCalledOnce();
    expect(engineFactory).toHaveBeenCalledOnce();
    controller.dispose();
    expect(audio.close).toHaveBeenCalledOnce();
  });

  it("무음과 종료 상태에서는 장치를 열지 않고, 도구 선택 때 장치가 없으면 첫 획에서 다시 준비한다", () => {
    const audio = createMockAudioContext();
    const factory = vi.fn<() => AudioContext | null>(() => audio.ctx).mockReturnValueOnce(null);
    const controller = new StudioLiveStrokeFoleyController({
      initialPreset: "silent-focus", audioContextFactory: factory, engineFactory: createStudioFoleyAudioEngine,
    });
    controller.prewarmContextFromGesture();
    expect(factory).not.toHaveBeenCalled();
    controller.toggleMute();
    controller.prewarmContextFromGesture();
    expect(factory).toHaveBeenCalledOnce();
    expect(controller.onStrokeStart({ x: 1, y: 2, brushId: "gpen" })?.played).toBe(true);
    controller.dispose();
    controller.prewarmContextFromGesture();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("전 브러시 계열(연필/색연필/크레파스/목탄/G펜/수채/마커/유화/에어브러시/지우개)을 물리 마찰음·종이 결에 정확히 매핑한다", () => {
    // 연필/색연필/크레파스/목탄/파스텔 -> graphite-pencil + 종이 결 차별화
    expect(resolveStudioFoleySoundForBrush("pencil")).toEqual({
      soundId: "graphite-pencil",
      paperTexture: "manga-kent",
    });
    expect(resolveStudioFoleySoundForBrush("graphite-2b")).toEqual({
      soundId: "graphite-pencil",
      paperTexture: "manga-kent",
    });
    expect(resolveStudioFoleySoundForBrush("colored-pencil")).toEqual({
      soundId: "graphite-pencil",
      paperTexture: "cold-press-watercolor",
    });
    expect(resolveStudioFoleySoundForBrush("pencil-6b")).toEqual({
      soundId: "graphite-pencil",
      paperTexture: "cold-press-watercolor",
    });
    for (const roughDry of ["crayon", "charcoal", "pastel", "oil-pastel", "chalk"]) {
      expect(resolveStudioFoleySoundForBrush(roughDry), roughDry).toEqual({
        soundId: "graphite-pencil",
        paperTexture: "rough-cotton",
      });
    }

    // G펜/마루펜/잉크/만년필/캘리/라이너 -> gpen-ink
    for (const inkBrush of ["gpen", "maru-pen", "fountain-pen", "calligraphy", "fineliner", "ink-brush", "pen"]) {
      expect(resolveStudioFoleySoundForBrush(inkBrush), inkBrush).toEqual({
        soundId: "gpen-ink",
        paperTexture: "manga-kent",
      });
    }

    // 수채/먹물/워시 vs 마커/형광펜(파스텔 형광펜 포함!) -> watercolor-sable
    for (const wetBrush of ["watercolor", "ink-wash", "wash-brush", "sumi"]) {
      expect(resolveStudioFoleySoundForBrush(wetBrush), wetBrush).toEqual({
        soundId: "watercolor-sable",
        paperTexture: "cold-press-watercolor",
      });
    }
    for (const markerBrush of ["marker", "alcohol-marker", "highlighter", "pastel-highlighter"]) {
      expect(resolveStudioFoleySoundForBrush(markerBrush), markerBrush).toEqual({
        soundId: "watercolor-sable",
        paperTexture: "smooth-bristol",
      });
    }

    // 유화/아크릴/임파스토/나이프 -> oil-impasto
    for (const oilBrush of ["oil", "acrylic", "impasto", "bristle", "palette-knife"]) {
      expect(resolveStudioFoleySoundForBrush(oilBrush), oilBrush).toEqual({
        soundId: "oil-impasto",
        paperTexture: "linen-canvas",
      });
    }

    // 에어브러시/스프레이/미스트 -> airbrush
    for (const airBrush of ["airbrush", "hard-airbrush", "spray", "mist"]) {
      expect(resolveStudioFoleySoundForBrush(airBrush), airBrush).toEqual({
        soundId: "airbrush",
        paperTexture: "smooth-bristol",
      });
    }

    // 지우개 (drawMode 또는 brushId) -> eraser-scrub
    expect(resolveStudioFoleySoundForBrush("gpen", "eraser")).toEqual({
      soundId: "eraser-scrub",
      paperTexture: "manga-kent",
    });
    expect(resolveStudioFoleySoundForBrush("kneaded-eraser", "pen")).toEqual({
      soundId: "eraser-scrub",
      paperTexture: "manga-kent",
    });

    // 명시적 종이 질감 override 존중
    expect(resolveStudioFoleySoundForBrush("pencil", "pen", "rough-cotton")).toEqual({
      soundId: "graphite-pencil",
      paperTexture: "rough-cotton",
    });
  });

  it("속도·필압·기울기 연동 36ms/2.5px 스로틀링, 프리셋 전환(차분함/ASMR/무음), Web Audio 노드 누수 0건을 보장한다", () => {
    let clockMs = 1000;
    const mockAudio = createMockAudioContext("suspended");
    const controller = new StudioLiveStrokeFoleyController({
      nowMs: () => clockMs,
      audioContextFactory: () => mockAudio.ctx,
      engineFactory: (options) => createStudioFoleyAudioEngine(options),
    });

    const observedPresets: string[] = [];
    const unsubscribe = controller.subscribe((state) => observedPresets.push(state.preset));

    // 첫 제스처(onStrokeStart): 오토플레이 정책 resume 요청 + 착지 시도
    expect(controller.getState().preset).toBe("quiet-atelier");
    expect(controller.getState().muted).toBe(false);
    const startResult = controller.onStrokeStart({
      x: 100,
      y: 100,
      pressure: 0.6,
      tiltX: 20,
      tiltY: 10,
      timestampMs: clockMs,
      brushId: "crayon",
    });
    expect(mockAudio.resume).toHaveBeenCalled();
    expect(startResult?.soundId).toBe("graphite-pencil");
    expect(startResult?.profile.paperTexture).toBe("rough-cotton");

    // 36ms 미만 간격은 스로틀링으로 무시
    clockMs = 1020;
    expect(
      controller.onStrokeMove({ x: 130, y: 100, pressure: 0.7, timestampMs: clockMs, brushId: "crayon" }),
    ).toBeNull();

    // 36ms 이상이지만 누적 이동 거리 < 2.5px -> 무시 (이전 누적 거리 테스트 위해 새 stroke 시작)
    controller.onStrokeEnd();
    clockMs = 1100;
    controller.onStrokeStart({ x: 50, y: 50, pressure: 0.5, timestampMs: clockMs, brushId: "colored-pencil" });
    clockMs = 1150;
    expect(
      controller.onStrokeMove({ x: 51, y: 51, pressure: 0.5, timestampMs: clockMs, brushId: "colored-pencil" }),
    ).toBeNull();

    // 36ms 이상 & 2.5px 이상 -> 연속 슥삭슥삭 재생!
    clockMs = 1200;
    const slowMove = controller.onStrokeMove({
      x: 62,
      y: 50,
      pressure: 0.4,
      tiltX: 0,
      tiltY: 0,
      timestampMs: clockMs,
      brushId: "colored-pencil",
    });
    expect(slowMove?.played).toBe(true);
    expect(slowMove?.soundId).toBe("graphite-pencil");
    expect(slowMove?.profile.paperTexture).toBe("cold-press-watercolor");

    // 고속 + 강한 필압 + 기울기 -> 주파수/게인 상승
    clockMs = 1245;
    const fastMove = controller.onStrokeMove({
      x: 180,
      y: 50,
      pressure: 0.92,
      tiltX: 45,
      tiltY: 15,
      timestampMs: clockMs,
      brushId: "gpen",
    });
    expect(fastMove?.played).toBe(true);
    expect(fastMove?.soundId).toBe("gpen-ink");
    expect(fastMove!.effectiveGain).toBeGreaterThan(0);

    // ASMR 전환 시 quiet-atelier보다 더 높은 실효 게인
    controller.setPreset("lively-asmr");
    clockMs = 1300;
    const asmrMove = controller.onStrokeMove({
      x: 240,
      y: 50,
      pressure: 0.92,
      tiltX: 0,
      tiltY: 0,
      timestampMs: clockMs,
      brushId: "gpen",
    });
    expect(asmrMove?.played).toBe(true);
    expect(asmrMove!.effectiveGain).toBeGreaterThan(fastMove!.effectiveGain);

    // silent-focus 전환 -> 즉시 무음, toggleMute로 이전 프리셋(lively-asmr) 복원
    controller.setPreset("silent-focus");
    expect(controller.getState().muted).toBe(true);
    clockMs = 1360;
    expect(
      controller.onStrokeMove({ x: 300, y: 50, pressure: 0.9, timestampMs: clockMs, brushId: "gpen" }),
    ).toBeNull();
    expect(controller.toggleMute().preset).toBe("lively-asmr");
    expect(observedPresets).toEqual(["lively-asmr", "silent-focus", "lively-asmr"]);

    // 모든 재생 종료 후 Web Audio 보이스 노드 정리 및 dispose 시 close 호출(노드 누수 0건)
    mockAudio.flushEnded();
    unsubscribe();
    controller.dispose();
    expect(mockAudio.close).toHaveBeenCalledTimes(1);
    const leakedVoiceNodes = mockAudio.nodes.filter((node) => node.connected && !node.disconnected);
    expect(leakedVoiceNodes).toHaveLength(0);
  });

  it("동적 import 지연 로딩 경로 및 무오디오(jsdom/headless) 환경에서 예외 없이 graceful no-op으로 동작한다", async () => {
    const loaderSpy = vi.fn(async () => ({ createStudioFoleyAudioEngine }));
    const headlessController = new StudioLiveStrokeFoleyController({
      audioContextFactory: () => null,
      moduleLoader: loaderSpy,
    });

    expect(() =>
      headlessController.onStrokeStart({ x: 0, y: 0, pressure: 0.5, timestampMs: 10, brushId: "pencil" }),
    ).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(loaderSpy).toHaveBeenCalledTimes(1);

    const moveRes = headlessController.onStrokeMove({
      x: 40,
      y: 20,
      pressure: 0.6,
      timestampMs: 80,
      brushId: "pencil",
    });
    expect(moveRes?.played).toBe(false);
    expect(moveRes?.reason).toBe("no-audio-context");
    headlessController.onStrokeEnd();
    headlessController.dispose();
  });

  it("필압 커브 3프리셋(soft 0.68 / standard 1.0 / firm 1.48)의 단조성·경계값·싱글턴 구독과 coalesced pointer 추출을 검증한다", () => {
    expect(STUDIO_PRESSURE_CURVE_GAMMA).toEqual({ soft: 0.68, standard: 1.0, firm: 1.48 });

    // 경계값 & 단조 증가 & soft > standard > firm 부등식
    for (const preset of ["soft", "standard", "firm"] as const) {
      expect(applyStudioPressureCurve(0, preset)).toBe(0);
      expect(applyStudioPressureCurve(1, preset)).toBe(1);
      expect(applyStudioPressureCurve(-0.5, preset)).toBe(0);
      expect(applyStudioPressureCurve(1.8, preset)).toBe(1);
      expect(applyStudioPressureCurve(Number.NaN, preset)).toBe(0);

      let prev = -1;
      for (const sample of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const next = applyStudioPressureCurve(sample, preset);
        expect(next).toBeGreaterThan(prev);
        prev = next;
      }
    }

    const pMid = 0.5;
    expect(applyStudioPressureCurve(pMid, "soft")).toBeCloseTo(0.5 ** 0.68, 5);
    expect(applyStudioPressureCurve(pMid, "standard")).toBeCloseTo(0.5, 5);
    expect(applyStudioPressureCurve(pMid, "firm")).toBeCloseTo(0.5 ** 1.48, 5);
    expect(applyStudioPressureCurve(pMid, "soft")).toBeGreaterThan(applyStudioPressureCurve(pMid, "standard"));
    expect(applyStudioPressureCurve(pMid, "standard")).toBeGreaterThan(applyStudioPressureCurve(pMid, "firm"));

    // 싱글턴 상태 순환 및 구독
    const seen: string[] = [];
    const unsub = subscribeStudioPressureCurve((preset) => seen.push(preset));
    expect(getStudioPressureCurvePreset()).toBe("standard");
    expect(getStudioPressureCurveGamma()).toBe(1.0);
    expect(cycleStudioPressureCurvePreset()).toBe("soft");
    expect(getStudioPressureCurveGamma()).toBe(0.68);
    expect(cycleStudioPressureCurvePreset()).toBe("firm");
    expect(getStudioPressureCurveGamma()).toBe(1.48);
    expect(cycleStudioPressureCurvePreset()).toBe("standard");
    expect(seen).toEqual(["soft", "firm", "standard"]);
    unsub();

    // 싱글턴 Foley 제어 및 구독
    const singletonFoleyLog: string[] = [];
    const unsubFoley = subscribeLiveFoleyState((st) => singletonFoleyLog.push(st.preset));
    expect(getLiveFoleyState().preset).toBe("quiet-atelier");
    expect(cycleLiveFoleyPreset().preset).toBe("lively-asmr");
    expect(cycleLiveFoleyPreset().preset).toBe("silent-focus");
    expect(toggleLiveFoleyMute().preset).toBe("lively-asmr");
    expect(singletonFoleyLog).toEqual(["lively-asmr", "silent-focus", "lively-asmr"]);
    unsubFoley();

    // Coalesced Pointer 샘플 추출 (지원 / 미지원 / 예외 / null)
    const coalescedSamples = extractCoalescedPointerSamples({
      clientX: 30,
      clientY: 40,
      pressure: 0.7,
      tiltX: 12,
      tiltY: -8,
      timeStamp: 120,
      pointerType: "pen",
      getCoalescedEvents: () =>
        [
          { clientX: 10, clientY: 20, pressure: 0.4, tiltX: 10, tiltY: -5, timeStamp: 100, pointerType: "pen" },
          { clientX: 20, clientY: 30, pressure: 0.55, tiltX: 11, tiltY: -6, timeStamp: 110, pointerType: "pen" },
          { clientX: 30, clientY: 40, pressure: 0.7, tiltX: 12, tiltY: -8, timeStamp: 120, pointerType: "pen" },
        ] as unknown as PointerEvent[],
    });
    expect(coalescedSamples).toHaveLength(3);
    expect(coalescedSamples[1]).toEqual({
      clientX: 20,
      clientY: 30,
      pressure: 0.55,
      tiltX: 11,
      tiltY: -6,
      timeStamp: 110,
      pointerType: "pen",
    });

    const fallbackSamples = extractCoalescedPointerSamples({
      clientX: 55,
      clientY: 66,
      pressure: 0.5,
      timeStamp: 200,
      pointerType: "mouse",
      getCoalescedEvents: () => {
        throw new Error("unsupported");
      },
    });
    expect(fallbackSamples).toHaveLength(1);
    expect(fallbackSamples[0]?.clientX).toBe(55);
    expect(extractCoalescedPointerSamples(null)).toEqual([]);
  });

  it("StudioDrawingQuickErgonomicsBar에서 중복 필압 칩 단일화·필기음(차분함→ASMR→무음)·단독 StudioLiveFoleyFeelControls 호환·KO/EN·KV 금지 계약을 충족한다", () => {
    const session = createErgonomicsSession();
    const { rerender, unmount } = render(createElement(StudioDrawingQuickErgonomicsBar, { session }));

    // 상단 퀵 바에는 중복 필압 칩이 없으며 단일 필압 버튼 하나만 존재한다.
    const quickBarPressureButtons = document.querySelectorAll<HTMLButtonElement>("[data-studio-pressure-curve]");
    expect(quickBarPressureButtons).toHaveLength(1);
    const unifiedPressureBtn = quickBarPressureButtons[0]!;
    expect(unifiedPressureBtn.getAttribute("data-studio-pressure-preset")).toBe("linear");
    expect(unifiedPressureBtn.getAttribute("data-studio-pressure-curve")).toBe("standard");
    expect(getStudioPressureCurvePreset()).toBe("standard");

    // 단일 필압 버튼 순환 시 Foley 브리지 필압 프리셋(linear→standard, soft-ink→soft, firm-gpen/expressive-brush→firm)도 동시 동기화
    fireEvent.click(unifiedPressureBtn);
    expect(unifiedPressureBtn.getAttribute("data-studio-pressure-preset")).toBe("soft-ink");
    expect(unifiedPressureBtn.getAttribute("data-studio-pressure-curve")).toBe("soft");
    expect(getStudioPressureCurvePreset()).toBe("soft");

    fireEvent.click(unifiedPressureBtn);
    expect(unifiedPressureBtn.getAttribute("data-studio-pressure-preset")).toBe("firm-gpen");
    expect(unifiedPressureBtn.getAttribute("data-studio-pressure-curve")).toBe("firm");
    expect(getStudioPressureCurvePreset()).toBe("firm");

    fireEvent.click(unifiedPressureBtn);
    expect(unifiedPressureBtn.getAttribute("data-studio-pressure-preset")).toBe("expressive-brush");
    expect(unifiedPressureBtn.getAttribute("data-studio-pressure-curve")).toBe("firm");
    expect(getStudioPressureCurvePreset()).toBe("firm");

    fireEvent.click(unifiedPressureBtn);
    expect(unifiedPressureBtn.getAttribute("data-studio-pressure-preset")).toBe("linear");
    expect(unifiedPressureBtn.getAttribute("data-studio-pressure-curve")).toBe("standard");
    expect(getStudioPressureCurvePreset()).toBe("standard");

    // 필기음 버튼 사이클: 차분함 -> ASMR -> 무음 -> 차분함
    const foleyBtn = document.querySelector<HTMLButtonElement>("[data-studio-foley-preset]")!;
    expect(foleyBtn).toBeTruthy();
    expect(foleyBtn.getAttribute("data-studio-foley-preset")).toBe("quiet-atelier");
    expect(foleyBtn.getAttribute("aria-pressed")).toBe("true");
    expect(foleyBtn.textContent).toContain("차분함");

    fireEvent.click(foleyBtn);
    expect(foleyBtn.getAttribute("data-studio-foley-preset")).toBe("lively-asmr");
    expect(foleyBtn.getAttribute("aria-pressed")).toBe("true");
    expect(foleyBtn.textContent).toContain("ASMR");

    fireEvent.click(foleyBtn);
    expect(foleyBtn.getAttribute("data-studio-foley-preset")).toBe("silent-focus");
    expect(foleyBtn.getAttribute("aria-pressed")).toBe("false");
    expect(foleyBtn.textContent).toContain("무음");

    fireEvent.click(foleyBtn);
    expect(foleyBtn.getAttribute("data-studio-foley-preset")).toBe("quiet-atelier");
    expect(foleyBtn.getAttribute("aria-pressed")).toBe("true");

    // 영문 로케일 검증 (퀵 바)
    useI18n.setState({ lang: "en" });
    rerender(createElement(StudioDrawingQuickErgonomicsBar, { session }));
    expect(foleyBtn.textContent).toContain("Quiet");
    expect(screen.getByRole("toolbar", { name: /Drawing options/ })).toBeTruthy();
    unmount();

    // 단독 StudioLiveFoleyFeelControls 기본(hidePressureChip=false) 100% 호환: 표준 -> 가볍게 -> 강하게 -> 표준
    useI18n.setState({ lang: "ko" });
    const standalone = render(
      createElement(StudioLiveFoleyFeelControls, { blocked: false, blockedReasonId: "test-blocked" }),
    );
    const pressureBtn = document.querySelector<HTMLButtonElement>("[data-studio-pressure-curve]")!;
    expect(pressureBtn).toBeTruthy();
    expect(pressureBtn.getAttribute("data-studio-pressure-curve")).toBe("standard");
    expect(pressureBtn.getAttribute("aria-pressed")).toBe("false");
    expect(pressureBtn.textContent).toContain("표준");

    fireEvent.click(pressureBtn);
    expect(pressureBtn.getAttribute("data-studio-pressure-curve")).toBe("soft");
    expect(pressureBtn.getAttribute("aria-pressed")).toBe("true");
    expect(pressureBtn.textContent).toContain("가볍게");
    expect(getStudioPressureCurvePreset()).toBe("soft");

    fireEvent.click(pressureBtn);
    expect(pressureBtn.getAttribute("data-studio-pressure-curve")).toBe("firm");
    expect(pressureBtn.getAttribute("aria-pressed")).toBe("true");
    expect(pressureBtn.textContent).toContain("강하게");
    expect(getStudioPressureCurvePreset()).toBe("firm");

    useI18n.setState({ lang: "en" });
    standalone.rerender(
      createElement(StudioLiveFoleyFeelControls, { blocked: false, blockedReasonId: "test-blocked" }),
    );
    expect(pressureBtn.textContent).toContain("Firm");

    fireEvent.click(pressureBtn);
    expect(pressureBtn.getAttribute("data-studio-pressure-curve")).toBe("standard");
    expect(pressureBtn.textContent).toContain("Standard");

    // hidePressureChip=true 전달 시 중복 필압 칩은 렌더하지 않고 필기음·필기감 FX만 유지
    standalone.rerender(
      createElement(StudioLiveFoleyFeelControls, {
        blocked: false,
        blockedReasonId: "test-blocked",
        hidePressureChip: true,
      }),
    );
    expect(document.querySelector("[data-studio-pressure-curve]")).toBeNull();
    expect(document.querySelector("[data-studio-foley-preset]")).toBeTruthy();
    expect(document.querySelector("[data-studio-nib-vfx-mode]")).toBeTruthy();

    // 정적 위생 검증: localStorage/sessionStorage 0건, transition-all 0건, 원시 hex 0건
    const root = process.cwd();
    const bridgeSrc = readFileSync(
      resolve(root, "apps/web/src/domains/creator/studio-cuttoon-editor/studio-live-stroke-foley-bridge.ts"),
      "utf8",
    );
    const controlsSrc = readFileSync(
      resolve(root, "apps/web/src/domains/creator/studio-cuttoon-editor/StudioLiveFoleyFeelControls.tsx"),
      "utf8",
    );
    expect(bridgeSrc.split("\n").length).toBeLessThanOrEqual(420);
    expect(bridgeSrc).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB)\b/u);
    expect(controlsSrc).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB)\b/u);
    expect(controlsSrc).not.toContain("transition-all");
    expect(controlsSrc.match(/#[0-9a-fA-F]{3,8}\b/gu)).toBeNull();

    // 포인터 핸들러 지연 연결 검증: 정적 import 없이 onStrokeStart/onStrokeMove/onStrokeEnd·필압 감마 배선 확인
    const downSrc = readFileSync(
      resolve(root, "apps/web/src/domains/creator/studio-cuttoon-editor/studio-cuttoon-stage-pointers-down-draw.ts"),
      "utf8",
    );
    const publishSrc = readFileSync(
      resolve(root, "apps/web/src/domains/creator/studio-cuttoon-editor/studio-cuttoon-stage-pointers-publish.ts"),
      "utf8",
    );
    const moveSrc = readFileSync(
      resolve(root, "apps/web/src/domains/creator/studio-cuttoon-editor/studio-cuttoon-stage-pointers-move-handler.ts"),
      "utf8",
    );
    const finishSrc = readFileSync(
      resolve(root, "apps/web/src/domains/creator/studio-cuttoon-editor/studio-cuttoon-stage-pointers-finish-handler.ts"),
      "utf8",
    );
    expect(downSrc).toContain("onStrokeStart");
    expect(downSrc).toContain("getStudioPressureCurveGamma");
    expect(downSrc).toContain('import("./studio-live-stroke-foley-bridge")');
    expect(publishSrc).toContain("onStrokeMove");
    expect(publishSrc).toContain("onStrokeEnd");
    expect(moveSrc).toContain("onStrokeMove");
    expect(finishSrc).toContain("onStrokeEnd");
  });
});
