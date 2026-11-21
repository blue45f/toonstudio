// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  attachHorizontalScrollErgonomics,
  measureHorizontalScroll,
  normalizeWheelDeltaPx,
  shouldConvertVerticalWheel,
} from "./horizontal-scroll-ergonomics";

function createScrollableElement(config: {
  scrollWidth?: number;
  clientWidth?: number;
  scrollLeft?: number;
  scrollHeight?: number;
  clientHeight?: number;
  overflowY?: string;
} = {}): HTMLDivElement {
  const element = document.createElement("div");
  let currentLeft = config.scrollLeft ?? 0;

  Object.defineProperty(element, "scrollWidth", {
    configurable: true,
    value: config.scrollWidth ?? 1200,
  });
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    value: config.clientWidth ?? 400,
  });
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: config.scrollHeight ?? 120,
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: config.clientHeight ?? 120,
  });
  Object.defineProperty(element, "scrollLeft", {
    configurable: true,
    get: () => currentLeft,
    set: (value: number) => {
      currentLeft = value;
    },
  });

  if (config.overflowY) {
    element.style.overflowY = config.overflowY;
  }

  document.body.appendChild(element);
  return element;
}

function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function dispatchPointerEvent(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  init: { clientX: number; button?: number; pointerId?: number; pointerType?: string },
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    button: init.button ?? 0,
  });
  Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
  Object.defineProperty(event, "pointerType", { value: init.pointerType ?? "mouse" });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("horizontal-scroll-ergonomics", () => {
  it("좌우 끝 도달 상태와 0..1 진행률을 정확히 계산한다", () => {
    const start = measureHorizontalScroll({ scrollLeft: 0, scrollWidth: 1000, clientWidth: 400 });
    expect(start.canScroll).toBe(true);
    expect(start.canScrollLeft).toBe(false);
    expect(start.canScrollRight).toBe(true);
    expect(start.scrollProgress).toBe(0);

    const middle = measureHorizontalScroll({ scrollLeft: 300, scrollWidth: 1000, clientWidth: 400 });
    expect(middle.canScrollLeft).toBe(true);
    expect(middle.canScrollRight).toBe(true);
    expect(middle.scrollProgress).toBeCloseTo(0.5, 4);

    const end = measureHorizontalScroll({ scrollLeft: 600, scrollWidth: 1000, clientWidth: 400 });
    expect(end.canScrollLeft).toBe(true);
    expect(end.canScrollRight).toBe(false);
    expect(end.scrollProgress).toBe(1);

    const fits = measureHorizontalScroll({ scrollLeft: 0, scrollWidth: 400, clientWidth: 400 });
    expect(fits.canScroll).toBe(false);
    expect(fits.scrollProgress).toBe(0);
  });

  it("WheelEvent deltaMode(픽셀·줄·페이지)를 픽셀 이동량으로 정규화한다", () => {
    expect(normalizeWheelDeltaPx(100, 0, 400)).toBe(100);
    expect(normalizeWheelDeltaPx(3, 1, 400)).toBe(48);
    expect(normalizeWheelDeltaPx(1, 2, 400)).toBe(340);
    expect(normalizeWheelDeltaPx(0, 0, 400)).toBe(0);
  });

  it("일반 휠 마우스의 세로 deltaY를 가로 스크롤로 부드럽게 전환하고 연속 휠을 누적한다", () => {
    stubReducedMotion(false);
    const element = createScrollableElement({ scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 });
    const scrollToSpy = vi.fn((options?: ScrollToOptions | number) => {
      if (typeof options === "object" && typeof options.left === "number") {
        element.scrollLeft = options.left;
      }
    });
    element.scrollTo = scrollToSpy;

    const controller = attachHorizontalScrollErgonomics(element);
    const wheel1 = new WheelEvent("wheel", { deltaY: 120, cancelable: true });
    element.dispatchEvent(wheel1);
    expect(wheel1.defaultPrevented).toBe(true);
    expect(scrollToSpy).toHaveBeenCalledWith({ left: 120, behavior: "smooth" });

    const wheel2 = new WheelEvent("wheel", { deltaY: 120, cancelable: true });
    element.dispatchEvent(wheel2);
    expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 240, behavior: "smooth" });

    controller.destroy();
  });

  it("양 끝단이나 세로 스크롤 컨테이너에서는 페이지 세로 스크롤을 방해하지 않고, Shift+Wheel은 허용한다", () => {
    const atStart = createScrollableElement({ scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 });
    expect(
      shouldConvertVerticalWheel(atStart, {
        deltaX: 0,
        deltaY: -100,
        deltaMode: 0,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
      }).convert,
    ).toBe(false);

    const atEnd = createScrollableElement({ scrollWidth: 1200, clientWidth: 400, scrollLeft: 800 });
    expect(
      shouldConvertVerticalWheel(atEnd, {
        deltaX: 0,
        deltaY: 100,
        deltaMode: 0,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
      }).convert,
    ).toBe(false);

    const verticalAlso = createScrollableElement({
      scrollWidth: 1200,
      clientWidth: 400,
      scrollHeight: 600,
      clientHeight: 200,
      overflowY: "auto",
    });
    expect(
      shouldConvertVerticalWheel(verticalAlso, {
        deltaX: 0,
        deltaY: 100,
        deltaMode: 0,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
      }).convert,
    ).toBe(false);
    expect(
      shouldConvertVerticalWheel(verticalAlso, {
        deltaX: 0,
        deltaY: 100,
        deltaMode: 0,
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
      }).convert,
    ).toBe(true);
  });

  it("네이티브 가로 트랙패드(deltaX 우세)와 브라우저 확대(Ctrl/Meta)는 가로채지 않는다", () => {
    const element = createScrollableElement({ scrollWidth: 1200, clientWidth: 400, scrollLeft: 100 });
    expect(
      shouldConvertVerticalWheel(element, {
        deltaX: 80,
        deltaY: 10,
        deltaMode: 0,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
      }).convert,
    ).toBe(false);
    expect(
      shouldConvertVerticalWheel(element, {
        deltaX: 0,
        deltaY: 100,
        deltaMode: 0,
        shiftKey: false,
        ctrlKey: true,
        metaKey: false,
      }).convert,
    ).toBe(false);
  });

  it("6px 미만 미세 이동은 내부 버튼 클릭을 방해하지 않는다", () => {
    const element = createScrollableElement({ scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 });
    const button = document.createElement("button");
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    element.appendChild(button);

    const controller = attachHorizontalScrollErgonomics(element, { dragThresholdPx: 6 });

    dispatchPointerEvent(button, "pointerdown", { clientX: 200 });
    dispatchPointerEvent(window, "pointermove", { clientX: 196 }); // 4px < 6px
    dispatchPointerEvent(window, "pointerup", { clientX: 196 });
    button.click();

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(element.dataset.hscrollDragging).toBeUndefined();
    expect(element.scrollLeft).toBe(0);

    controller.destroy();
  });

  it("6px 이상 마우스 드래그 시 팬 스크롤·포인터 캡처 해제·클릭 오작동 방지·관성 감속을 수행한다", () => {
    stubReducedMotion(false);
    const element = createScrollableElement({ scrollWidth: 1400, clientWidth: 400, scrollLeft: 100 });
    const button = document.createElement("button");
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    element.appendChild(button);

    let capturedId: number | null = null;
    element.setPointerCapture = vi.fn((id: number) => {
      capturedId = id;
    });
    element.hasPointerCapture = vi.fn((id: number) => capturedId === id);
    element.releasePointerCapture = vi.fn((id: number) => {
      if (capturedId === id) capturedId = null;
    });

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const onDraggingChange = vi.fn();
    const controller = attachHorizontalScrollErgonomics(element, {
      dragThresholdPx: 6,
      onDraggingChange,
    });

    dispatchPointerEvent(button, "pointerdown", { clientX: 300, pointerId: 7 });
    dispatchPointerEvent(window, "pointermove", { clientX: 220, pointerId: 7 }); // +80px scroll

    expect(element.dataset.hscrollDragging).toBe("true");
    expect(onDraggingChange).toHaveBeenCalledWith(true);
    expect(element.setPointerCapture).toHaveBeenCalledWith(7);
    expect(element.scrollLeft).toBe(180);

    dispatchPointerEvent(window, "pointerup", { clientX: 220, pointerId: 7 });
    expect(element.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(element.dataset.hscrollDragging).toBeUndefined();
    expect(onDraggingChange).toHaveBeenLastCalledWith(false);

    // 드래그 직후 잘못 발생하는 클릭은 차단된다.
    button.click();
    expect(onClick).not.toHaveBeenCalled();

    // 관성 감속 프레임 실행 시 추가 이동이 발생한다.
    if (rafCallbacks[0]) {
      const beforeInertia = element.scrollLeft;
      rafCallbacks[0](performance.now() + 20);
      expect(element.scrollLeft).toBeGreaterThanOrEqual(beforeInertia);
    }

    controller.destroy();
  });

  it("draggable 카드·입력창·터치 포인터에서는 마우스 드래그 팬을 가로채지 않는다", () => {
    const element = createScrollableElement({ scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 });
    const card = document.createElement("div");
    card.setAttribute("draggable", "true");
    const input = document.createElement("input");
    element.append(card, input);

    const controller = attachHorizontalScrollErgonomics(element);

    dispatchPointerEvent(card, "pointerdown", { clientX: 300, pointerId: 1 });
    dispatchPointerEvent(window, "pointermove", { clientX: 150, pointerId: 1 });
    dispatchPointerEvent(window, "pointerup", { clientX: 150, pointerId: 1 });
    expect(element.scrollLeft).toBe(0);

    dispatchPointerEvent(input, "pointerdown", { clientX: 300, pointerId: 2 });
    dispatchPointerEvent(window, "pointermove", { clientX: 150, pointerId: 2 });
    dispatchPointerEvent(window, "pointerup", { clientX: 150, pointerId: 2 });
    expect(element.scrollLeft).toBe(0);

    dispatchPointerEvent(element, "pointerdown", { clientX: 300, pointerId: 3, pointerType: "touch" });
    dispatchPointerEvent(window, "pointermove", { clientX: 150, pointerId: 3, pointerType: "touch" });
    dispatchPointerEvent(window, "pointerup", { clientX: 150, pointerId: 3, pointerType: "touch" });
    expect(element.scrollLeft).toBe(0);

    controller.destroy();
  });

  it("모바일 터치 스와이프 후 오동작 탭 클릭만 막고 네이티브 터치 스크롤은 차단하지 않는다", () => {
    const element = createScrollableElement({ scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 });
    const button = document.createElement("button");
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    element.appendChild(button);

    const controller = attachHorizontalScrollErgonomics(element);

    const startEvent = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(startEvent, "touches", { value: [{ clientX: 240, clientY: 50 }] });
    button.dispatchEvent(startEvent);

    const moveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(moveEvent, "touches", { value: [{ clientX: 190, clientY: 52 }] });
    button.dispatchEvent(moveEvent);
    expect(moveEvent.defaultPrevented).toBe(false);

    button.dispatchEvent(new Event("touchend", { bubbles: true }));
    button.click();
    expect(onClick).not.toHaveBeenCalled();

    controller.destroy();
  });

  it("키보드 ArrowRight·ArrowLeft·End·Home으로 스크롤하고 reduced-motion 시 auto로 폴백한다", () => {
    stubReducedMotion(true);
    const element = createScrollableElement({ scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 });
    const scrollToSpy = vi.fn((options?: ScrollToOptions | number) => {
      if (typeof options === "object" && typeof options.left === "number") {
        element.scrollLeft = options.left;
      }
    });
    element.scrollTo = scrollToSpy;

    const controller = attachHorizontalScrollErgonomics(element);

    const rightKey = new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true });
    element.dispatchEvent(rightKey);
    expect(rightKey.defaultPrevented).toBe(true);
    expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 312, behavior: "auto" });

    const endKey = new KeyboardEvent("keydown", { key: "End", cancelable: true });
    element.dispatchEvent(endKey);
    expect(endKey.defaultPrevented).toBe(true);
    expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 800, behavior: "auto" });

    const leftKey = new KeyboardEvent("keydown", { key: "ArrowLeft", cancelable: true });
    element.dispatchEvent(leftKey);
    expect(leftKey.defaultPrevented).toBe(true);
    expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 488, behavior: "auto" });

    const homeKey = new KeyboardEvent("keydown", { key: "Home", cancelable: true });
    element.dispatchEvent(homeKey);
    expect(homeKey.defaultPrevented).toBe(true);
    expect(scrollToSpy).toHaveBeenLastCalledWith({ left: 0, behavior: "auto" });

    controller.destroy();
    expect(element.dataset.hscrollErgonomics).toBeUndefined();
  });
});
