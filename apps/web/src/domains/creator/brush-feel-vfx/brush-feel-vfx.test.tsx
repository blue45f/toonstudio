// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_NIB_VFX_PARTICLES,
  NIB_VFX_KIND_CODE,
  NON_EXPORT_OVERLAY_POLICY,
  NibTactileVfxEngine,
  computeDynamicNibCursorGeometry,
  cycleNibTactileVfxMode,
  resolveEffectiveNibVfxMode,
  resolveNibVfxProfile,
} from "./nib-tactile-vfx-engine";
import {
  StudioNibTactileVfxOverlay,
  emitStudioNibVfxSample,
  getStudioNibVfxMode,
  resetStudioNibVfxBridge,
  setStudioNibVfxMode,
  subscribeStudioNibVfxMode,
} from "./StudioNibTactileVfxOverlay";

interface MockMatchMediaController {
  readonly setMatches: (next: boolean) => void;
  readonly listenerCount: () => number;
  readonly restore: () => void;
}

const activeRestorers: Array<() => void> = [];

function installMatchMediaMock(initialMatches = false): MockMatchMediaController {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      get matches() { return matches; },
      media: query,
      onchange: null,
      addEventListener: (_type: string, cb: EventListenerOrEventListenerObject) => {
        if (typeof cb === "function") listeners.add(cb as (event: MediaQueryListEvent) => void);
      },
      removeEventListener: (_type: string, cb: EventListenerOrEventListenerObject) => {
        if (typeof cb === "function") listeners.delete(cb as (event: MediaQueryListEvent) => void);
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    } as unknown as MediaQueryList)),
  });

  const restore = () => {
    if (originalDescriptor) {
      Object.defineProperty(window, "matchMedia", originalDescriptor);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  };
  activeRestorers.push(restore);

  return {
    setMatches(next: boolean) {
      matches = next;
      const evt = { matches: next, media: "(prefers-reduced-motion: reduce)" } as MediaQueryListEvent;
      for (const listener of listeners) listener(evt);
    },
    listenerCount: () => listeners.size,
    restore,
  };
}

function createMockCanvas2dContext() {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt" as CanvasLineCap,
    globalAlpha: 1,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  };
}

beforeEach(() => {
  resetStudioNibVfxBridge("subtle");
});

afterEach(() => {
  cleanup();
  resetStudioNibVfxBridge("subtle");
  while (activeRestorers.length > 0) {
    activeRestorers.pop()?.();
  }
  vi.restoreAllMocks();
});

describe("nib-tactile-vfx-engine: 6종 매체 프로필 · SoA 고정 풀 · 물리 · 강도 · 커서 기하", () => {
  it("6종 브러시 매체 및 별칭을 정확한 필기감 VFX 프로필로 매핑한다", () => {
    expect(resolveNibVfxProfile("graphite-pencil").kind).toBe("dust-fleck");
    expect(resolveNibVfxProfile("charcoal").kind).toBe("dust-fleck");
    expect(resolveNibVfxProfile("soft-pastel").kind).toBe("dust-fleck");
    expect(resolveNibVfxProfile("graphite-pencil").drag).toBeCloseTo(0.86, 5);

    // oil-pastel은 oil/pastel보다 먼저 wax-crumb(crayon)으로 분류되어야 한다
    expect(resolveNibVfxProfile("crayon").kind).toBe("wax-crumb");
    expect(resolveNibVfxProfile("oil-pastel").kind).toBe("wax-crumb");

    expect(resolveNibVfxProfile("watercolor").kind).toBe("capillary-soak-ring");
    expect(resolveNibVfxProfile("wash").kind).toBe("capillary-soak-ring");
    expect(resolveNibVfxProfile("sumi").kind).toBe("capillary-soak-ring");

    expect(resolveNibVfxProfile("oil").kind).toBe("impasto-ridge-glint");
    expect(resolveNibVfxProfile("acrylic").kind).toBe("impasto-ridge-glint");
    expect(resolveNibVfxProfile("impasto").kind).toBe("impasto-ridge-glint");

    expect(resolveNibVfxProfile("gpen").kind).toBe("ink-snap-trail");
    expect(resolveNibVfxProfile("ink").kind).toBe("ink-snap-trail");
    expect(resolveNibVfxProfile("calligraphy").kind).toBe("ink-snap-trail");
    expect(resolveNibVfxProfile("gpen").minSpeedPxPerMs).toBeCloseTo(1.4, 5);

    expect(resolveNibVfxProfile("eraser").kind).toBe("eraser-shaving");
    expect(resolveNibVfxProfile("gpen", "eraser").kind).toBe("eraser-shaving");
  });

  it("흑연·목탄은 샘플당 2~5개 가루를 생성해 drag=0.86 감속 후 260ms 내 완전 소멸한다", () => {
    const engine = new NibTactileVfxEngine();
    engine.ingestSample({ x: 100, y: 100, phase: "down", brushId: "graphite-pencil", pressure: 0.7, tiltX: 25, timestampMs: 0 });
    engine.clearParticles();
    const spawned = engine.ingestSample({
      x: 118, y: 102, phase: "move", brushId: "charcoal", pressure: 0.75, tiltX: 30, timestampMs: 16,
      strokeRgb: [42, 46, 54],
    });
    expect(spawned).toBeGreaterThanOrEqual(2);
    expect(spawned).toBeLessThanOrEqual(5);
    expect(engine.activeCount).toBe(spawned);

    // drag=0.86 감속 검증 (1프레임 16.67ms 후 속력 감소)
    const speedBefore = Math.hypot(engine.buffers.vx[0], engine.buffers.vy[0]);
    expect(engine.buffers.drag[0]).toBeCloseTo(0.86, 4);
    expect(engine.buffers.lifeMs[0]).toBeGreaterThanOrEqual(180);
    expect(engine.buffers.lifeMs[0]).toBeLessThanOrEqual(260);
    engine.step(1000 / 60);
    const speedAfter = Math.hypot(engine.buffers.vx[0], engine.buffers.vy[0]);
    expect(speedAfter).toBeLessThan(speedBefore);

    // 260ms 이상 경과 시 모든 입자 소멸
    engine.step(100);
    engine.step(100);
    engine.step(100);
    expect(engine.activeCount).toBe(0);
  });

  it("크레파스는 획 수직 방향으로 왁스 부스러기를 방출하고 수채는 착지·저속·펜업 시 260ms 모세관 링을 생성한다", () => {
    const crayonEngine = new NibTactileVfxEngine();
    crayonEngine.ingestSample({ x: 40, y: 80, phase: "down", brushId: "oil-pastel", timestampMs: 0 });
    const crumbs = crayonEngine.ingestSample({
      x: 70, y: 80, phase: "move", brushId: "crayon", pressure: 0.8, timestampMs: 16,
    });
    expect(crumbs).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < crumbs; i += 1) {
      expect(crayonEngine.buffers.kind[i]).toBe(NIB_VFX_KIND_CODE["wax-crumb"]);
      // 수평 이동(heading=0)이므로 수직 성분(|vy|)이 수평 성분(|vx|)보다 우세해야 한다
      expect(Math.abs(crayonEngine.buffers.vy[i])).toBeGreaterThan(Math.abs(crayonEngine.buffers.vx[i]));
    }

    const waterEngine = new NibTactileVfxEngine();
    const downCount = waterEngine.ingestSample({
      x: 120, y: 120, phase: "down", brushId: "watercolor", pressure: 0.6, timestampMs: 100,
    });
    expect(downCount).toBeGreaterThanOrEqual(3); // 1 capillary ring + mist droplets
    expect(waterEngine.buffers.kind[0]).toBe(NIB_VFX_KIND_CODE["capillary-soak-ring"]);
    expect(waterEngine.buffers.subKind[0]).toBe(0);
    expect(waterEngine.buffers.lifeMs[0]).toBe(260);
    expect(waterEngine.buffers.endSize[0]).toBeGreaterThan(waterEngine.buffers.size[0]);

    // 고속 이동에서는 모세관 링이 억제되고 펜업에서는 다시 생성된다
    const fastMove = waterEngine.ingestSample({
      x: 240, y: 120, phase: "move", brushId: "sumi", speedPxPerMs: 2.2, timestampMs: 200,
    });
    expect(fastMove).toBe(0);
    const upCount = waterEngine.ingestSample({
      x: 245, y: 120, phase: "up", brushId: "wash", pressure: 0.5, timestampMs: 240,
    });
    expect(upCount).toBeGreaterThanOrEqual(3);
  });

  it("유화는 브리스틀·능선 글린트 쌍을, G펜은 >1.4 px/ms 고속에서만 탄성 테일을, 지우개는 고무 가루를 생성한다", () => {
    const oilEngine = new NibTactileVfxEngine();
    oilEngine.ingestSample({ x: 10, y: 10, phase: "down", brushId: "impasto", timestampMs: 0 });
    oilEngine.clearParticles();
    const oilCount = oilEngine.ingestSample({ x: 30, y: 20, phase: "move", brushId: "oil", timestampMs: 20 });
    expect(oilCount).toBe(2);
    expect(oilEngine.buffers.kind[0]).toBe(NIB_VFX_KIND_CODE["impasto-ridge-glint"]);
    expect(oilEngine.buffers.subKind[0]).toBe(1); // bristle ribbon
    expect(oilEngine.buffers.subKind[1]).toBe(0); // ridge glint

    const gpenEngine = new NibTactileVfxEngine();
    gpenEngine.ingestSample({ x: 0, y: 0, phase: "down", brushId: "gpen", timestampMs: 0 });
    // <= 1.4 px/ms 차단 검증
    expect(gpenEngine.ingestSample({ x: 14, y: 0, phase: "move", brushId: "gpen", speedPxPerMs: 1.4, timestampMs: 10 })).toBe(0);
    expect(gpenEngine.activeCount).toBe(0);
    // > 1.4 px/ms 고속에서만 생성
    const fastGpen = gpenEngine.ingestSample({ x: 50, y: 0, phase: "move", brushId: "calligraphy", speedPxPerMs: 2.1, timestampMs: 20 });
    expect(fastGpen).toBe(2);
    expect(gpenEngine.buffers.kind[0]).toBe(NIB_VFX_KIND_CODE["ink-snap-trail"]);
    expect(gpenEngine.buffers.kind[1]).toBe(NIB_VFX_KIND_CODE["ink-snap-trail"]);

    const eraserEngine = new NibTactileVfxEngine();
    eraserEngine.ingestSample({ x: 50, y: 50, phase: "down", drawMode: "eraser", timestampMs: 0 });
    const shavings = eraserEngine.ingestSample({ x: 65, y: 52, phase: "move", drawMode: "eraser", pressure: 0.7, timestampMs: 16 });
    expect(shavings).toBeGreaterThanOrEqual(2);
    expect(eraserEngine.buffers.kind[0]).toBe(NIB_VFX_KIND_CODE["eraser-shaving"]);
    expect(eraserEngine.buffers.gravity[0]).toBeGreaterThan(0);
    expect(Math.abs(eraserEngine.buffers.spin[0])).toBeGreaterThan(0);
  });

  it("SoA 고정 링 버퍼는 160개 상한을 초과하지 않고 덮어쓰며 내부 TypedArray 재할당이 0건이다", () => {
    const engine = new NibTactileVfxEngine(MAX_NIB_VFX_PARTICLES);
    const refX = engine.buffers.x;
    const refY = engine.buffers.y;
    const refActive = engine.buffers.active;
    const refLife = engine.buffers.lifeMs;
    const refCursor = engine.cursorState;

    engine.setMode("vivid");
    engine.ingestSample({ x: 0, y: 0, phase: "down", brushId: "graphite-pencil", timestampMs: 0, strokeRgb: [30, 50, 90] });
    for (let stepIdx = 1; stepIdx <= 120; stepIdx += 1) {
      engine.ingestSample({
        x: stepIdx * 4, y: 60, phase: "move", brushId: "graphite-pencil",
        pressure: 0.9, tiltX: 35, timestampMs: stepIdx * 2, strokeRgb: [30, 50, 90],
      });
    }

    expect(engine.capacity).toBe(160);
    expect(engine.totalSpawned).toBeGreaterThan(300);
    expect(engine.activeCount).toBe(160);
    expect(engine.overwriteCount).toBeGreaterThan(100);
    // 동일 TypedArray 버퍼 참조 유지(무할당)
    expect(engine.buffers.x).toBe(refX);
    expect(engine.buffers.y).toBe(refY);
    expect(engine.buffers.active).toBe(refActive);
    expect(engine.buffers.lifeMs).toBe(refLife);
    expect(engine.cursorState).toBe(refCursor);
    expect(engine.getStrokePaletteEntry(engine.buffers.strokePaletteIndex[0])).toContain("color(srgb ");
  });

  it("강도 3단계(off/subtle/vivid)와 prefers-reduced-motion 자동 off 강등 · 비출력 계약을 보장한다", () => {
    expect(cycleNibTactileVfxMode("subtle")).toBe("vivid");
    expect(cycleNibTactileVfxMode("vivid")).toBe("off");
    expect(cycleNibTactileVfxMode("off")).toBe("subtle");
    expect(resolveEffectiveNibVfxMode("vivid", true)).toBe("off");
    expect(resolveEffectiveNibVfxMode("subtle", false)).toBe("subtle");
    expect(NON_EXPORT_OVERLAY_POLICY.nonExportOnly).toBe(true);
    expect(NON_EXPORT_OVERLAY_POLICY.exportMixRatio).toBe(0);

    const subtleEngine = new NibTactileVfxEngine();
    subtleEngine.setMode("subtle");
    const vividEngine = new NibTactileVfxEngine();
    vividEngine.setMode("vivid");
    const offEngine = new NibTactileVfxEngine();
    offEngine.setMode("off");

    const sample = { x: 80, y: 80, phase: "move" as const, brushId: "graphite-pencil", pressure: 0.8, speedPxPerMs: 0.9, timestampMs: 16 };
    const subtleCount = subtleEngine.ingestSample(sample);
    const vividCount = vividEngine.ingestSample(sample);
    const offCount = offEngine.ingestSample(sample);

    expect(offCount).toBe(0);
    expect(vividCount).toBeGreaterThanOrEqual(subtleCount);
    expect(vividEngine.buffers.alpha[0]).toBeGreaterThan(subtleEngine.buffers.alpha[0]);

    vividEngine.setPrefersReducedMotion(true);
    expect(vividEngine.effectiveMode).toBe("off");
    expect(vividEngine.activeCount).toBe(0);
    expect(vividEngine.ingestSample(sample)).toBe(0);
  });

  it("동적 틸트·필압 브러시 닙 커서 기하가 기울기 타원 신장·회전각·방향 지시선·필압 확장을 정확히 계산한다", () => {
    const uprightLight = computeDynamicNibCursorGeometry({
      x: 100, y: 100, brushSizePx: 20, pressure: 0.2, tiltX: 0, tiltY: 0, headingRad: 0, profileId: "graphite-pencil",
    });
    const uprightHeavy = computeDynamicNibCursorGeometry({
      x: 100, y: 100, brushSizePx: 20, pressure: 0.95, tiltX: 0, tiltY: 0, headingRad: 0, profileId: "graphite-pencil",
    });
    expect(uprightLight.isTilted).toBe(false);
    expect(uprightLight.majorRadiusPx).toBeCloseTo(uprightLight.minorRadiusPx, 4);
    expect(uprightHeavy.majorRadiusPx).toBeGreaterThan(uprightLight.majorRadiusPx);

    const tilted = computeDynamicNibCursorGeometry({
      x: 200, y: 150, brushSizePx: 24, pressure: 0.7, tiltX: 40, tiltY: 30, headingRad: 0, profileId: "graphite-pencil",
    });
    expect(tilted.isTilted).toBe(true);
    expect(tilted.tiltMagnitudeDeg).toBeCloseTo(50, 2);
    expect(tilted.majorRadiusPx).toBeGreaterThan(tilted.minorRadiusPx);
    expect(tilted.rotationRad).toBeCloseTo(Math.atan2(30, 40), 4);
    expect(tilted.indicatorTipX).toBeGreaterThan(tilted.indicatorStartX);
    expect(tilted.indicatorTipY).toBeGreaterThan(tilted.indicatorStartY);
  });
});

describe("StudioNibTactileVfxOverlay: Idle 0% CPU rAF · 브리지 · Reduced Motion · 언마운트 정리 · 위생", () => {
  it("초기 유휴 시 rAF를 시작하지 않고, 포인터 입력 시 깨어났다가 수명 만료 후 즉시 자동 정지한다", () => {
    installMatchMediaMock(false);
    const mockCtx = createMockCanvas2dContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() => mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );

    let nextRafId = 1;
    const queuedFrames = new Map<number, FrameRequestCallback>();
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      const id = nextRafId;
      nextRafId += 1;
      queuedFrames.set(id, cb);
      return id;
    });
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id: number) => {
      queuedFrames.delete(id);
    });

    let activeEngine: NibTactileVfxEngine | null = null;
    const { container, unmount } = render(
      <StudioNibTactileVfxOverlay width={640} height={480} onEngineReady={(engine) => { activeEngine = engine; }} />,
    );
    const canvas = container.querySelector('[data-studio-nib-vfx-overlay="true"]') as HTMLCanvasElement | null;
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute("aria-hidden")).toBe("true");
    expect(canvas?.style.pointerEvents).toBe("none");
    expect(canvas?.getAttribute("data-nib-vfx-non-export")).toBe("true");
    expect(canvas?.getAttribute("data-nib-vfx-mode")).toBe("subtle");
    expect(canvas?.getAttribute("data-nib-vfx-loop-active")).toBe("false");
    // 초기 마운트 시 유휴 상태이므로 rAF 호출 0건!
    expect(rafSpy).toHaveBeenCalledTimes(0);

    // hover 샘플은 입자 없이 닙 커서만 단발 렌더링하고 rAF 루프는 시작하지 않는다
    act(() => {
      emitStudioNibVfxSample({ x: 50, y: 50, phase: "hover", brushId: "graphite-pencil", tiltX: 25, tiltY: 15, timestampMs: 1 });
    });
    expect(rafSpy).toHaveBeenCalledTimes(0);
    expect(mockCtx.ellipse).toHaveBeenCalled();

    // 6종 매체 샘플 주입 -> rAF 깨어남 및 렌더링 확인
    act(() => {
      emitStudioNibVfxSample({ x: 80, y: 90, phase: "down", brushId: "graphite-pencil", pressure: 0.7, timestampMs: 10 });
      emitStudioNibVfxSample({ x: 110, y: 95, phase: "move", brushId: "crayon", pressure: 0.8, timestampMs: 26 });
      emitStudioNibVfxSample({ x: 130, y: 100, phase: "down", brushId: "watercolor", pressure: 0.6, timestampMs: 42 });
      emitStudioNibVfxSample({ x: 150, y: 105, phase: "move", brushId: "impasto", pressure: 0.7, timestampMs: 58 });
      emitStudioNibVfxSample({ x: 220, y: 110, phase: "move", brushId: "gpen", speedPxPerMs: 2.0, timestampMs: 74 });
      emitStudioNibVfxSample({ x: 240, y: 115, phase: "move", drawMode: "eraser", pressure: 0.7, timestampMs: 90 });
    });
    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(canvas?.getAttribute("data-nib-vfx-loop-active")).toBe("true");
    expect((activeEngine as NibTactileVfxEngine | null)?.activeCount).toBeGreaterThan(0);

    // 프레임 1회 실행 -> 2D 드로잉 호출 확인
    const runNextFrame = (ts: number) => {
      const entry = queuedFrames.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!entry) return false;
      queuedFrames.delete(entry[0]);
      entry[1](ts);
      return true;
    };

    expect(runNextFrame(100)).toBe(true);
    expect(mockCtx.clearRect).toHaveBeenCalled();
    expect(mockCtx.fillRect).toHaveBeenCalled();
    expect(mockCtx.arc).toHaveBeenCalled();
    expect(mockCtx.ellipse).toHaveBeenCalled();

    // 450ms 경과까지 프레임 진행 -> 수명 만료 후 rAF 자동 정지(Idle 0% CPU)
    let ts = 100;
    for (let i = 0; i < 12 && queuedFrames.size > 0; i += 1) {
      ts += 50;
      runNextFrame(ts);
    }
    expect((activeEngine as NibTactileVfxEngine | null)?.activeCount).toBe(0);
    expect(queuedFrames.size).toBe(0);
    expect(canvas?.getAttribute("data-nib-vfx-loop-active")).toBe("false");

    // 새 샘플 입력 시 다시 깨어나고, 언마운트 시 진행 중 rAF와 리스너를 완전히 정리한다
    act(() => {
      emitStudioNibVfxSample({ x: 300, y: 200, phase: "down", brushId: "watercolor", pressure: 0.8, timestampMs: 900 });
    });
    expect(queuedFrames.size).toBe(1);
    const callsBeforeUnmount = rafSpy.mock.calls.length;
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    expect(activeEngine).toBeNull();

    // 언마운트 후 외부 이벤트 발행에도 rAF 재시작 0건
    emitStudioNibVfxSample({ x: 320, y: 210, phase: "down", brushId: "graphite-pencil", timestampMs: 950 });
    expect(rafSpy.mock.calls.length).toBe(callsBeforeUnmount);
  });

  it("모드 브리지 구독과 prefers-reduced-motion 동적 전환 시 즉시 off 강등 및 루프 중단을 수행한다", () => {
    const mm = installMatchMediaMock(false);
    const mockCtx = createMockCanvas2dContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() => mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
    const queued = new Map<number, FrameRequestCallback>();
    let rafSeq = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      const id = rafSeq++;
      queued.set(id, cb);
      return id;
    });
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id: number) => {
      queued.delete(id);
    });

    const observedModes: string[] = [];
    const unsubscribe = subscribeStudioNibVfxMode((m) => observedModes.push(m));
    const { container, unmount } = render(<StudioNibTactileVfxOverlay width={400} height={300} />);
    const canvas = container.querySelector('[data-studio-nib-vfx-overlay="true"]');
    expect(getStudioNibVfxMode()).toBe("subtle");

    act(() => { setStudioNibVfxMode("vivid"); });
    expect(observedModes).toEqual(["vivid"]);
    expect(canvas?.getAttribute("data-nib-vfx-mode")).toBe("vivid");

    // 활성 입자 생성 후 prefers-reduced-motion=true 전환 -> 즉시 off 강등 + rAF 취소
    act(() => {
      emitStudioNibVfxSample({ x: 50, y: 50, phase: "down", brushId: "watercolor", timestampMs: 10 });
    });
    expect(queued.size).toBe(1);

    act(() => { mm.setMatches(true); });
    expect(canvas?.getAttribute("data-nib-vfx-mode")).toBe("off");
    expect(canvas?.getAttribute("data-nib-vfx-reduced-motion")).toBe("true");
    expect(canvas?.getAttribute("data-nib-vfx-loop-active")).toBe("false");
    expect(cancelSpy).toHaveBeenCalled();
    expect(queued.size).toBe(0);

    // reduced-motion 상태에서는 새 샘플도 rAF를 깨우지 않는다
    act(() => {
      emitStudioNibVfxSample({ x: 60, y: 60, phase: "down", brushId: "graphite-pencil", timestampMs: 30 });
    });
    expect(queued.size).toBe(0);

    unsubscribe();
    unmount();
    expect(mm.listenerCount()).toBe(0);
  });

  it("소유 파일은 배럴 금지 · 줄 수 상한 · 원시 색상 0건 · transition-all 0건 · 영속 KV 미사용 위생 계약을 준수한다", () => {
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/brush-feel-vfx");
    expect(existsSync(path.join(dir, "index.ts"))).toBe(false);

    const engineSource = readFileSync(path.join(dir, "nib-tactile-vfx-engine.ts"), "utf8");
    const overlaySource = readFileSync(path.join(dir, "StudioNibTactileVfxOverlay.tsx"), "utf8");
    const testSource = readFileSync(path.join(dir, "brush-feel-vfx.test.tsx"), "utf8");

    expect(engineSource.split(/\r?\n/).length).toBeLessThanOrEqual(650);
    expect(overlaySource.split(/\r?\n/).length).toBeLessThanOrEqual(420);
    expect(testSource.split(/\r?\n/).length).toBeLessThanOrEqual(700);

    for (const source of [engineSource, overlaySource]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toMatch(/\brgba?\s*\(/i);
      expect(source).not.toMatch(/\bhsla?\s*\(/i);
      expect(source).not.toContain("transition-all");
      expect(source).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB|Dexie)\b/);
    }
  });
});
