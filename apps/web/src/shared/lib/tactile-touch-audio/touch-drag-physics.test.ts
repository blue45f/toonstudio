// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FloatingControls } from "@/shared/components/FloatingControls";
import {
  TACTILE_HAPTIC_PATTERNS,
  TOUCH_DRAG_DEFAULTS,
  attachPageTactileFeedback,
  createTactileAudioSynthesizer,
  createTouchDragMachine,
  findMagneticDropTarget,
  projectInertialEndPoint,
  stepInertialSnap,
  triggerMicroHaptic,
  triggerTactileFeedback,
  type DropTargetRect,
} from "./touch-drag-physics";

function mockReducedMotion(reduced: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function createFakeAudioContext() {
  const osc = {
    type: "sine" as OscillatorType,
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
  const filter = {
    type: "lowpass" as BiquadFilterType,
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const gain = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const ctx = {
    state: "running" as AudioContextState,
    currentTime: 1.5,
    destination: { kind: "destination" },
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn(() => osc),
    createBiquadFilter: vi.fn(() => filter),
    createGain: vi.fn(() => gain),
  };
  return { ctx: ctx as unknown as AudioContext, rawCtx: ctx, osc, filter, gain };
}

afterEach(() => {
  cleanup();
  mockReducedMotion(false);
  vi.restoreAllMocks();
});

describe("touch-drag-physics (모바일 터치 드래그 물리 · 자기장 스냅 · 햅틱 · 옵트인 Web Audio)", () => {
  it("롱프레스 리프트 판정(280ms, 8px 슬롭)이 경계값에서 정확히 동작한다", () => {
    const machine = createTouchDragMachine();
    const down = machine.pointerDown({ pointerId: 1, x: 100, y: 200, timestampMs: 1000, pointerType: "touch" });
    expect(down.phase).toBe("pending");

    // 8px 슬롭 이내 미세 흔들림 + 279ms 경과: 아직 pending 유지
    const jitter = machine.pointerMove({ pointerId: 1, x: 105, y: 205, timestampMs: 1279 });
    expect(jitter.phase).toBe("pending");

    // 280ms 경과 시 dragging 전환 + lift 햅틱 큐 발화
    const lifted = machine.tick(1280);
    expect(lifted.phase).toBe("dragging");
    expect(lifted.liftReason).toBe("long-press");
    expect(lifted.lastCue).toBe("lift");
    expect(TOUCH_DRAG_DEFAULTS.longPressMs).toBe(280);
    expect(TOUCH_DRAG_DEFAULTS.slopPx).toBe(8);
  });

  it("세로 스크롤 축 기준 방향 벡터 <= 30° 이동은 네이티브 스크롤로 양보한다", () => {
    const machine = createTouchDragMachine({ scrollAxis: "y" });
    machine.pointerDown({ pointerId: 1, x: 100, y: 100, timestampMs: 0, pointerType: "touch" });

    // dx = 5, dy = 20 -> atan2(5, 20) ≈ 14.0° (<= 30°)
    const moved = machine.pointerMove({ pointerId: 1, x: 105, y: 120, timestampMs: 40 });
    expect(moved.phase).toBe("scrolling");
    expect(moved.lastCue).toBeNull();
  });

  it("방향 벡터 > 30° 횡방향 드래그는 즉시 드래그로 진입하며 scrollAxis='x'도 대칭 동작한다", () => {
    const yAxisMachine = createTouchDragMachine({ scrollAxis: "y" });
    yAxisMachine.pointerDown({ pointerId: 1, x: 100, y: 100, timestampMs: 0 });
    // dx = 20, dy = 5 -> atan2(20, 5) ≈ 76° (> 30°)
    const dragY = yAxisMachine.pointerMove({ pointerId: 1, x: 120, y: 105, timestampMs: 30 });
    expect(dragY.phase).toBe("dragging");
    expect(dragY.liftReason).toBe("intent-vector");
    expect(dragY.lastCue).toBe("lift");

    const xAxisMachine = createTouchDragMachine({ scrollAxis: "x" });
    xAxisMachine.pointerDown({ pointerId: 2, x: 100, y: 100, timestampMs: 0 });
    // 가로 스크롤 축에서 dx = 24, dy = 4 -> atan2(4, 24) ≈ 9.5° (<= 30°) -> scrolling
    expect(xAxisMachine.pointerMove({ pointerId: 2, x: 124, y: 104, timestampMs: 30 }).phase).toBe("scrolling");
  });

  it("접촉 면적이 큰 팜 터치(> 48px)를 거부하고 기존 드래그 상태를 오염시키지 않는다", () => {
    const machine = createTouchDragMachine();
    const palmOnly = machine.pointerDown({
      pointerId: 10,
      x: 50,
      y: 50,
      timestampMs: 0,
      contactWidthPx: 64,
      contactHeightPx: 52,
    });
    expect(palmOnly.phase).toBe("idle");
    expect(palmOnly.rejectedReason).toBe("palm");

    // 정상 손가락 드래그 도중 팜이 닿아도 드래그를 유지한다
    machine.pointerDown({ pointerId: 1, x: 100, y: 100, timestampMs: 100, contactWidthPx: 14, contactHeightPx: 14 });
    machine.tick(380);
    const palmDuringDrag = machine.pointerDown({
      pointerId: 11,
      x: 220,
      y: 220,
      timestampMs: 420,
      contactWidthPx: 72,
    });
    expect(palmDuringDrag.phase).toBe("dragging");
    expect(palmDuringDrag.activePointerId).toBe(1);
    expect(palmDuringDrag.rejectedReason).toBe("palm");
  });

  it("멀티터치 2번째 손가락 유입 시 pending을 취소하고 dragging 중 보조 포인터를 격리한다", () => {
    const machine = createTouchDragMachine();
    machine.pointerDown({ pointerId: 1, x: 100, y: 100, timestampMs: 0 });
    const cancelled = machine.pointerDown({ pointerId: 2, x: 180, y: 120, timestampMs: 20 });
    expect(cancelled.phase).toBe("idle");
    expect(cancelled.rejectedReason).toBe("multi-touch");

    machine.cancel();
    machine.pointerDown({ pointerId: 3, x: 100, y: 100, timestampMs: 100 });
    machine.tick(380);
    const secondFinger = machine.pointerDown({ pointerId: 4, x: 300, y: 300, timestampMs: 400 });
    expect(secondFinger.phase).toBe("dragging");
    expect(secondFinger.activePointerId).toBe(3);

    // 보조 포인터 이동/해제는 1차 포인터 좌표를 바꾸거나 드래그를 끝내지 않는다
    const ignoredMove = machine.pointerMove({ pointerId: 4, x: 500, y: 500, timestampMs: 420 });
    expect(ignoredMove.currentPoint).toEqual({ x: 100, y: 100 });
    const ignoredUp = machine.pointerUp({ pointerId: 4, x: 500, y: 500, timestampMs: 440 });
    expect(ignoredUp.state.phase).toBe("dragging");
  });

  it("자기장 드롭 타깃이 반경 내 최근접 슬롯으로 좌표를 끌어당기고 진입 시 snap 큐를 1회 발화한다", () => {
    const targets: readonly DropTargetRect[] = [
      { id: "slot-a", x: 200, y: 100, width: 80, height: 80, magnetRadiusPx: 40 },
      { id: "slot-b", x: 360, y: 100, width: 80, height: 80, magnetRadiusPx: 40 },
    ];
    // 반경 밖이면 null
    expect(findMagneticDropTarget({ x: 120, y: 140 }, targets)).toBeNull();
    // slot-a 좌측 경계에서 20px 떨어진 지점 -> 자기장 포착
    const snap = findMagneticDropTarget({ x: 180, y: 140 }, targets);
    expect(snap?.targetId).toBe("slot-a");
    expect(snap!.snappedPoint.x).toBeGreaterThan(180);
    expect(snap!.snappedPoint.x).toBeLessThan(240);

    const machine = createTouchDragMachine();
    machine.pointerDown({ pointerId: 1, x: 100, y: 140, timestampMs: 0 });
    machine.tick(280, targets);
    const firstEnter = machine.pointerMove({ pointerId: 1, x: 210, y: 140, timestampMs: 310 }, targets);
    expect(firstEnter.activeDropTargetId).toBe("slot-a");
    expect(firstEnter.lastCue).toBe("snap");
    // 같은 타깃 내부 추가 이동 시 snap 중복 발화 없음
    const stayInside = machine.pointerMove({ pointerId: 1, x: 225, y: 140, timestampMs: 330 }, targets);
    expect(stayInside.activeDropTargetId).toBe("slot-a");
    expect(stayInside.lastCue).toBeNull();
  });

  it("관성 투척 계산이 최대 거리를 클램프하고 스프링 보간이 목표 좌표로 정확히 수렴한다", () => {
    const projected = projectInertialEndPoint({ x: 100, y: 100 }, { vx: 4000, vy: 0 }, { inertiaTimeSec: 0.14, maxThrowPx: 140 });
    expect(projected.x).toBeCloseTo(240, 4);
    expect(projected.y).toBeCloseTo(100, 4);

    // reducedMotion 시 1스텝 즉시 수렴
    const instant = stepInertialSnap({ x: 100, y: 100, vx: 300, vy: -120, settled: false }, { x: 240, y: 140 }, 16, { reducedMotion: true });
    expect(instant).toEqual({ x: 240, y: 140, vx: 0, vy: 0, settled: true });

    // 일반 물리 프레임 반복 시 목표점으로 안정 수렴
    let state = { x: 100, y: 100, vx: 220, vy: -80, settled: false };
    for (let frame = 0; frame < 120 && !state.settled; frame += 1) {
      state = stepInertialSnap(state, { x: 240, y: 140 }, 16);
    }
    expect(state.settled).toBe(true);
    expect(state.x).toBe(240);
    expect(state.y).toBe(140);
  });

  it("pointerUp 시 빠른 스와이프 관성으로 인접 드롭 타깃에 스냅되고 confirm 큐를 반환한다", () => {
    const targets: readonly DropTargetRect[] = [{ id: "dock-right", x: 300, y: 80, width: 100, height: 100 }];
    const machine = createTouchDragMachine();
    machine.pointerDown({ pointerId: 1, x: 100, y: 130, timestampMs: 0 });
    machine.tick(300, targets);
    machine.pointerMove({ pointerId: 1, x: 160, y: 130, timestampMs: 320 }, targets);
    machine.pointerMove({ pointerId: 1, x: 220, y: 130, timestampMs: 350 }, targets);

    const drop = machine.pointerUp({ pointerId: 1, x: 230, y: 130, timestampMs: 365 }, targets);
    expect(drop.dropTargetId).toBe("dock-right");
    expect(drop.state.phase).toBe("settling");
    expect(drop.state.lastCue).toBe("confirm");
    expect(drop.inertialSnap?.settled).toBe(false);
    expect(drop.projectedPoint!.x).toBeGreaterThan(230);
  });

  it("마이크로 햅틱 4패턴(tap/lift/snap/confirm)이 정확히 호출되고 reduced-motion 시 차단된다", () => {
    mockReducedMotion(false);
    const vibrate = vi.fn().mockReturnValue(true);

    for (const pattern of ["tap", "lift", "snap", "confirm"] as const) {
      expect(triggerMicroHaptic(pattern, { navigatorLike: { vibrate } })).toBe(true);
      expect(vibrate).toHaveBeenLastCalledWith([...TACTILE_HAPTIC_PATTERNS[pattern]]);
    }

    mockReducedMotion(true);
    vibrate.mockClear();
    expect(triggerMicroHaptic("confirm", { navigatorLike: { vibrate } })).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("옵트인 Web Audio 합성기가 기본 음소거이며 onended 시 노드 disconnect와 dispose 시 close를 완결한다", () => {
    mockReducedMotion(false);
    const fake = createFakeAudioContext();
    const synth = createTactileAudioSynthesizer({ throttleMs: 0, createContext: () => fake.ctx });

    // 기본값은 음소거(옵트인 전까지 AudioContext조차 생성하지 않음)
    expect(synth.isEnabled()).toBe(false);
    expect(synth.play("tap")).toBe(false);
    expect(fake.rawCtx.createOscillator).not.toHaveBeenCalled();

    // 옵트인 활성화 후 5종 사운드 합성 및 onended disconnect 완결 검증
    synth.setEnabled(true);
    for (const kind of ["tap", "lift", "snap", "switch", "confirm"] as const) {
      expect(synth.play(kind)).toBe(true);
    }
    expect(fake.rawCtx.createOscillator).toHaveBeenCalledTimes(5);
    expect(fake.osc.connect).toHaveBeenCalledWith(fake.filter);
    expect(fake.filter.connect).toHaveBeenCalledWith(fake.gain);
    expect(fake.gain.connect).toHaveBeenCalledWith(fake.rawCtx.destination);
    expect(fake.osc.onended).toBeTypeOf("function");

    fake.osc.onended?.();
    expect(fake.osc.disconnect).toHaveBeenCalledTimes(1);
    expect(fake.filter.disconnect).toHaveBeenCalledTimes(1);
    expect(fake.gain.disconnect).toHaveBeenCalledTimes(1);

    synth.dispose();
    expect(fake.rawCtx.close).toHaveBeenCalledTimes(1);
  });

  it("triggerTactileFeedback이 햅틱·사운드를 통합 실행하고 스로틀/옵트아웃을 존중한다", () => {
    mockReducedMotion(false);
    const vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    const fake = createFakeAudioContext();
    const synth = createTactileAudioSynthesizer({ enabled: false, throttleMs: 50, createContext: () => fake.ctx });

    const mutedResult = triggerTactileFeedback("snap", { soundEnabled: false, synthesizer: synth });
    expect(mutedResult).toEqual({ haptic: true, sound: false });

    const optedInResult = triggerTactileFeedback("confirm", { soundEnabled: true, soundKind: "switch", synthesizer: synth });
    expect(optedInResult).toEqual({ haptic: true, sound: true });
    synth.dispose();
  });

  it("attachPageTactileFeedback가 터치 햅틱·옵트인 클릭 사운드를 위임하고 data-no-sfx/disabled를 제외한다", () => {
    mockReducedMotion(false);
    const vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    const fake = createFakeAudioContext();
    const synth = createTactileAudioSynthesizer({ enabled: true, throttleMs: 0, createContext: () => fake.ctx });

    const host = document.createElement("div");
    host.innerHTML = `
      <button id="ok-btn" type="button">확인</button>
      <button id="switch-btn" type="button" role="switch" aria-checked="false">토글</button>
      <button id="muted-btn" type="button" data-no-sfx>음소거</button>
      <button id="disabled-btn" type="button" disabled>비활성</button>
    `;
    document.body.appendChild(host);
    const detach = attachPageTactileFeedback({ synthesizer: synth, root: host });

    try {
      const okBtn = host.querySelector<HTMLButtonElement>("#ok-btn")!;
      const switchBtn = host.querySelector<HTMLButtonElement>("#switch-btn")!;
      const mutedBtn = host.querySelector<HTMLButtonElement>("#muted-btn")!;
      const disabledBtn = host.querySelector<HTMLButtonElement>("#disabled-btn")!;

      const touchDown = new Event("pointerdown", { bubbles: true });
      Object.defineProperty(touchDown, "pointerType", { value: "touch" });
      switchBtn.dispatchEvent(touchDown);
      expect(vibrate).toHaveBeenCalledWith([...TACTILE_HAPTIC_PATTERNS.snap]);

      okBtn.click();
      switchBtn.click();
      mutedBtn.click();
      disabledBtn.click();
      expect(fake.rawCtx.createOscillator).toHaveBeenCalledTimes(2);
    } finally {
      detach();
      synth.dispose();
      host.remove();
    }
  });

  it("mobile-first-shell.css에 터치 드래그·드롭 유틸리티와 모션/고대비 해제 규칙이 원시 HEX 0건으로 존재한다", () => {
    const css = readFileSync(path.resolve(process.cwd(), "apps/web/src/app/styles/mobile-first-shell.css"), "utf8");
    const codeOnly = css.replace(/\/\*[\s\S]*?\*\//gu, "");
    expect(codeOnly.match(/#[0-9a-fA-F]{3,8}\b/gu) ?? []).toEqual([]);
    expect(codeOnly).toContain('[data-touch-draggable="true"]');
    expect(codeOnly).toContain("touch-action: none;");
    expect(codeOnly).toContain("user-select: none;");
    expect(codeOnly).toContain("-webkit-touch-callout: none;");
    expect(codeOnly).toContain('[data-touch-dragging="true"]');
    expect(codeOnly).toContain("scale(1.03) translateZ(0)");
    expect(codeOnly).toContain('[data-touch-drop-target="active"]');
    expect(codeOnly).toContain("overscroll-behavior: contain;");
    expect(codeOnly).toContain(':root[data-design-theme="contrast"]');
    expect(codeOnly).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("touch-drag-physics.ts가 260줄 이하이며 브라우저 저장소 직접 접근이 0건이다", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/shared/lib/tactile-touch-audio/touch-drag-physics.ts"),
      "utf8",
    );
    const lines = source.trimEnd().split("\n");
    expect(lines.length).toBeLessThanOrEqual(260);
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
    expect(codeOnly).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB)\b/u);
  });

  it("FloatingControls에 촉각 피드백이 실제 연결되어 모바일 토글 시 마이크로 햅틱이 발화하고 안전하게 언마운트된다", () => {
    mockReducedMotion(false);
    const vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });

    const view = render(createElement(FloatingControls, { placement: "bottom-right", showSound: true }));
    const root = view.container.querySelector<HTMLElement>('[data-floating-controls="true"]');
    expect(root?.getAttribute("data-tactile-audio")).toMatch(/^(?:enabled|muted)$/u);

    const toggle = screen.getByRole("button", { name: "화면·언어·OST 설정" });
    fireEvent.click(toggle);
    expect(vibrate).toHaveBeenCalledWith([...TACTILE_HAPTIC_PATTERNS.lift]);

    fireEvent.click(toggle);
    expect(vibrate).toHaveBeenCalledWith([...TACTILE_HAPTIC_PATTERNS.tap]);
    view.unmount();
  });
});
