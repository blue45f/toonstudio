/**
 * 일반 휠 마우스(비-매직마우스) 가로 스크롤 · 클릭-드래그 팬(관성 감속) ·
 * 키보드 탐색 · 모바일 터치 스크롤 최적화를 통합 제공하는 공용 유틸리티.
 */

const EDGE_EPSILON_PX = 2;
const DEFAULT_DRAG_THRESHOLD_PX = 6;
const DEFAULT_STEP_RATIO = 0.78;
const DEFAULT_MIN_STEP_PX = 160;
const WHEEL_LINE_PX = 16;
const WHEEL_ACCUMULATE_WINDOW_MS = 220;
const CLICK_SUPPRESS_MOUSE_MS = 80;
const CLICK_SUPPRESS_TOUCH_MS = 60;
const INERTIA_MIN_VELOCITY_PX_PER_MS = 0.12;
const INERTIA_STOP_VELOCITY_PX_PER_MS = 0.025;
const INERTIA_FRICTION_PER_FRAME = 0.92;
const INERTIA_FRAME_MS = 16.67;

const DRAG_SKIP_SELECTOR =
  'input, textarea, select, option, [contenteditable="true"], [draggable="true"], [data-horizontal-scroll-no-drag]';

const KEYBOARD_SKIP_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [role="slider"], [role="spinbutton"], [role="listbox"], [role="combobox"], [role="tablist"]';

export interface HorizontalScrollMetrics {
  readonly scrollLeft: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly maxScrollLeft: number;
  readonly canScroll: boolean;
  readonly canScrollLeft: boolean;
  readonly canScrollRight: boolean;
  /** 0..1 범위의 현재 가로 스크롤 진행률 */
  readonly scrollProgress: number;
}

export interface HorizontalScrollErgonomicsOptions {
  /** 세로 휠(deltaY)을 가로 스크롤로 전환할지 여부 (기본 true) */
  readonly wheelToHorizontal?: boolean;
  /** 세로 휠 변환 배율 (기본 1) */
  readonly wheelMultiplier?: number;
  /** 마우스 클릭-드래그 팬 활성 여부 (기본 true) */
  readonly dragToScroll?: boolean;
  /** 클릭과 드래그를 구분하는 최소 이동 거리 px (기본 6) */
  readonly dragThresholdPx?: number;
  /** 마우스 드래그 해제 시 관성 감속 활성 여부 (기본 true) */
  readonly inertia?: boolean;
  /** 키보드 ArrowLeft/ArrowRight/Home/End 지원 여부 (기본 true) */
  readonly keyboard?: boolean;
  /** 스텝 이동 시 가시 너비 대비 비율 (기본 0.78) */
  readonly stepRatio?: number;
  /** 스텝 이동 최소 거리 px (기본 160) */
  readonly minStepPx?: number;
  /** 스크롤 지표가 바뀔 때 호출되는 콜백 */
  readonly onMetricsChange?: (metrics: HorizontalScrollMetrics) => void;
  /** 마우스 드래그 상태가 바뀔 때 호출되는 콜백 */
  readonly onDraggingChange?: (dragging: boolean) => void;
}

export interface HorizontalScrollController {
  readonly measure: () => HorizontalScrollMetrics;
  readonly scrollByStep: (direction: -1 | 1, stepRatioOverride?: number) => boolean;
  readonly scrollToProgress: (progress: number) => void;
  readonly scrollToEdge: (edge: "start" | "end") => void;
  readonly stopInertia: () => void;
  readonly destroy: () => void;
}

export interface WheelConversionDecision {
  readonly convert: boolean;
  readonly deltaPx: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** 사용자 시스템의 동작 줄이기(prefers-reduced-motion) 설정 여부를 안전하게 판별한다. */
export function prefersHorizontalReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/** 가로 스크롤 컨테이너의 현재 경계 상태와 0..1 진행률을 계산한다. */
export function measureHorizontalScroll(
  element: Pick<HTMLElement, "scrollLeft" | "scrollWidth" | "clientWidth">,
): HorizontalScrollMetrics {
  const scrollWidth = Math.max(0, element.scrollWidth);
  const clientWidth = Math.max(0, element.clientWidth);
  const maxScrollLeft = Math.max(0, Math.round(scrollWidth - clientWidth));
  const canScroll = maxScrollLeft > EDGE_EPSILON_PX;
  const scrollLeft = canScroll ? clamp(element.scrollLeft, 0, maxScrollLeft) : 0;
  const canScrollLeft = canScroll && scrollLeft > EDGE_EPSILON_PX;
  const canScrollRight = canScroll && scrollLeft < maxScrollLeft - EDGE_EPSILON_PX;
  const scrollProgress = canScroll ? clamp(scrollLeft / maxScrollLeft, 0, 1) : 0;

  return {
    scrollLeft,
    scrollWidth,
    clientWidth,
    maxScrollLeft,
    canScroll,
    canScrollLeft,
    canScrollRight,
    scrollProgress,
  };
}

/** WheelEvent의 deltaMode(픽셀·줄·페이지)를 픽셀 단위 이동량으로 정규화한다. */
export function normalizeWheelDeltaPx(delta: number, deltaMode: number, pageSizePx: number): number {
  if (!Number.isFinite(delta) || delta === 0) return 0;
  if (deltaMode === 1) return delta * WHEEL_LINE_PX;
  if (deltaMode === 2) return delta * Math.max(pageSizePx * 0.85, 320);
  return delta;
}

function canScrollElementVertically(element: HTMLElement): boolean {
  if (element.scrollHeight - element.clientHeight <= EDGE_EPSILON_PX) return false;
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") return true;
  const overflowY = window.getComputedStyle(element).overflowY;
  return overflowY !== "hidden" && overflowY !== "clip" && overflowY !== "visible";
}

/**
 * 일반 휠 마우스의 세로 휠 입력을 가로 스크롤로 전환할지 결정한다.
 * - 브라우저 확대/축소(Ctrl/Meta), 네이티브 가로 트랙패드, 수직 스크롤 가능 컨테이너(Shift 제외),
 *   이미 양 끝단에 도달한 경우(Shift 제외)는 가로 변환을 건너뛰어 페이지 세로 스크롤을 방해하지 않는다.
 */
export function shouldConvertVerticalWheel(
  element: HTMLElement,
  event: Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "shiftKey" | "ctrlKey" | "metaKey">,
  options?: { readonly wheelMultiplier?: number },
): WheelConversionDecision {
  if (event.ctrlKey || event.metaKey) return { convert: false, deltaPx: 0 };

  const metrics = measureHorizontalScroll(element);
  if (!metrics.canScroll) return { convert: false, deltaPx: 0 };

  if (canScrollElementVertically(element) && !event.shiftKey) {
    return { convert: false, deltaPx: 0 };
  }

  const dx = normalizeWheelDeltaPx(event.deltaX, event.deltaMode, element.clientWidth);
  const dy = normalizeWheelDeltaPx(event.deltaY, event.deltaMode, element.clientWidth);

  if (!event.shiftKey && Math.abs(dx) > Math.abs(dy)) {
    return { convert: false, deltaPx: 0 };
  }
  if (dy === 0) return { convert: false, deltaPx: 0 };

  const multiplier = options?.wheelMultiplier ?? 1;
  const deltaPx = dy * multiplier;

  if (!event.shiftKey) {
    if (deltaPx > 0 && !metrics.canScrollRight) return { convert: false, deltaPx: 0 };
    if (deltaPx < 0 && !metrics.canScrollLeft) return { convert: false, deltaPx: 0 };
  }

  return { convert: true, deltaPx };
}

function applyHorizontalScrollPosition(element: HTMLElement, targetLeft: number, smooth: boolean): void {
  const { maxScrollLeft } = measureHorizontalScroll(element);
  const clamped = clamp(targetLeft, 0, maxScrollLeft);

  if (!smooth) {
    element.scrollLeft = clamped;
    return;
  }

  const behavior: ScrollBehavior = prefersHorizontalReducedMotion() ? "auto" : "smooth";
  if (typeof element.scrollTo === "function") {
    try {
      element.scrollTo({ left: clamped, behavior });
      return;
    } catch {
      // jsdom 등 scrollTo 미구현 환경에서는 직접 대입으로 폴백한다.
    }
  }
  element.scrollLeft = clamped;
}

function sameMetrics(a: HorizontalScrollMetrics | null, b: HorizontalScrollMetrics): boolean {
  if (!a) return false;
  return (
    a.canScroll === b.canScroll &&
    a.canScrollLeft === b.canScrollLeft &&
    a.canScrollRight === b.canScrollRight &&
    Math.abs(a.scrollLeft - b.scrollLeft) < 0.5 &&
    Math.abs(a.scrollProgress - b.scrollProgress) < 0.002 &&
    a.maxScrollLeft === b.maxScrollLeft
  );
}

function isElementMatching(target: EventTarget | null, selector: string): boolean {
  if (!target || !(target instanceof Element)) return false;
  return target.closest(selector) !== null;
}

/**
 * 가로 스크롤 컨테이너에 일반 휠 마우스 가로 전환, 마우스 클릭-드래그 팬 + 관성 감속,
 * 키보드 탐색, 모바일 터치 탭-드래그 충돌 방지를 부착한다.
 */
export function attachHorizontalScrollErgonomics(
  element: HTMLElement,
  options: HorizontalScrollErgonomicsOptions = {},
): HorizontalScrollController {
  const wheelToHorizontal = options.wheelToHorizontal ?? true;
  const wheelMultiplier = options.wheelMultiplier ?? 1;
  const dragToScroll = options.dragToScroll ?? true;
  const dragThresholdPx = Math.max(1, options.dragThresholdPx ?? DEFAULT_DRAG_THRESHOLD_PX);
  const inertia = options.inertia ?? true;
  const keyboard = options.keyboard ?? true;
  const stepRatio = options.stepRatio ?? DEFAULT_STEP_RATIO;
  const minStepPx = options.minStepPx ?? DEFAULT_MIN_STEP_PX;

  let destroyed = false;
  let lastMetrics: HorizontalScrollMetrics | null = null;

  let wheelTarget: number | null = null;
  let wheelResetAt = 0;

  let inertiaFrameId: number | null = null;
  let inertiaVelocity = 0;
  let inertiaLastTime = 0;

  let activePointerId: number | null = null;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;
  let dragLastX = 0;
  let dragLastTime = 0;
  let dragVelocity = 0;
  let isDragging = false;

  let suppressNextClick = false;
  let suppressClickTimer: number | null = null;

  let touchStartX = 0;
  let touchStartY = 0;
  let touchMovedBeyondThreshold = false;

  element.dataset.hscrollErgonomics = "true";

  const clearClickSuppression = () => {
    suppressNextClick = false;
    if (suppressClickTimer !== null) {
      window.clearTimeout(suppressClickTimer);
      suppressClickTimer = null;
    }
  };

  const armClickSuppression = (durationMs: number) => {
    clearClickSuppression();
    suppressNextClick = true;
    suppressClickTimer = window.setTimeout(() => {
      suppressNextClick = false;
      suppressClickTimer = null;
    }, durationMs);
  };

  const emitMetrics = (force = false): HorizontalScrollMetrics => {
    const metrics = measureHorizontalScroll(element);
    element.dataset.hscrollCanScroll = metrics.canScroll ? "true" : "false";
    element.dataset.hscrollAtStart = metrics.canScrollLeft ? "false" : "true";
    element.dataset.hscrollAtEnd = metrics.canScrollRight ? "false" : "true";

    if (force || !sameMetrics(lastMetrics, metrics)) {
      lastMetrics = metrics;
      options.onMetricsChange?.(metrics);
    }
    return metrics;
  };

  const stopInertia = () => {
    if (inertiaFrameId !== null) {
      window.cancelAnimationFrame(inertiaFrameId);
      inertiaFrameId = null;
    }
    inertiaVelocity = 0;
  };

  const clearWheelTarget = () => {
    wheelTarget = null;
    wheelResetAt = 0;
  };

  const startInertia = (initialVelocityPxPerMs: number) => {
    stopInertia();
    if (!inertia || prefersHorizontalReducedMotion()) return;
    if (Math.abs(initialVelocityPxPerMs) < INERTIA_MIN_VELOCITY_PX_PER_MS) return;

    inertiaVelocity = initialVelocityPxPerMs;
    inertiaLastTime = nowMs();

    const step = (timestamp: number) => {
      if (destroyed) {
        inertiaFrameId = null;
        return;
      }
      const dt = clamp(timestamp - inertiaLastTime, 4, 64);
      inertiaLastTime = timestamp;

      const currentMetrics = measureHorizontalScroll(element);
      const nextLeft = clamp(element.scrollLeft + inertiaVelocity * dt, 0, currentMetrics.maxScrollLeft);
      const hitEdge =
        (inertiaVelocity < 0 && nextLeft <= 0) ||
        (inertiaVelocity > 0 && nextLeft >= currentMetrics.maxScrollLeft);

      element.scrollLeft = nextLeft;
      emitMetrics();

      inertiaVelocity *= Math.pow(INERTIA_FRICTION_PER_FRAME, dt / INERTIA_FRAME_MS);
      if (hitEdge || Math.abs(inertiaVelocity) < INERTIA_STOP_VELOCITY_PX_PER_MS) {
        stopInertia();
        return;
      }
      inertiaFrameId = window.requestAnimationFrame(step);
    };

    inertiaFrameId = window.requestAnimationFrame(step);
  };

  const releasePointerCaptureSafe = (pointerId: number) => {
    try {
      if (typeof element.hasPointerCapture === "function" && element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      // 이미 해제됐거나 분리된 노드의 포인터 캡처 예외를 안전하게 무시한다.
    }
  };

  const finishPointerDrag = (shouldLaunchInertia: boolean) => {
    const pointerId = activePointerId;
    activePointerId = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);

    if (pointerId !== null) {
      releasePointerCaptureSafe(pointerId);
    }

    if (isDragging) {
      isDragging = false;
      delete element.dataset.hscrollDragging;
      options.onDraggingChange?.(false);
      armClickSuppression(CLICK_SUPPRESS_MOUSE_MS);
      if (shouldLaunchInertia) {
        startInertia(dragVelocity);
      }
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (activePointerId === null || event.pointerId !== activePointerId) return;

    const totalDeltaX = event.clientX - dragStartX;
    if (!isDragging) {
      if (Math.abs(totalDeltaX) < dragThresholdPx) return;
      isDragging = true;
      element.dataset.hscrollDragging = "true";
      options.onDraggingChange?.(true);
      try {
        element.setPointerCapture?.(event.pointerId);
      } catch {
        // jsdom 등 포인터 캡처 미지원 환경을 안전하게 통과한다.
      }
    }

    event.preventDefault();
    const currentMetrics = measureHorizontalScroll(element);
    const nextScrollLeft = clamp(dragStartScrollLeft - totalDeltaX, 0, currentMetrics.maxScrollLeft);
    element.scrollLeft = nextScrollLeft;

    const now = nowMs();
    const dt = Math.max(1, now - dragLastTime);
    const instantVelocity = (dragLastX - event.clientX) / dt;
    dragVelocity = dragVelocity * 0.45 + instantVelocity * 0.55;
    dragLastX = event.clientX;
    dragLastTime = now;
    emitMetrics();
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (activePointerId === null || event.pointerId !== activePointerId) return;
    finishPointerDrag(true);
  };

  const handlePointerCancel = (event: PointerEvent) => {
    if (activePointerId === null || event.pointerId !== activePointerId) return;
    finishPointerDrag(false);
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (!dragToScroll) return;
    if (event.button !== 0) return;
    if (event.pointerType === "touch" || event.pointerType === "pen") return;
    if (isElementMatching(event.target, DRAG_SKIP_SELECTOR)) return;

    const metrics = measureHorizontalScroll(element);
    if (!metrics.canScroll) return;

    stopInertia();
    clearWheelTarget();

    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartScrollLeft = element.scrollLeft;
    dragLastX = event.clientX;
    dragLastTime = nowMs();
    dragVelocity = 0;
    isDragging = false;

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
  };

  const handleWheel = (event: WheelEvent) => {
    if (!wheelToHorizontal) return;
    stopInertia();

    const decision = shouldConvertVerticalWheel(element, event, { wheelMultiplier });
    if (!decision.convert) return;

    const metrics = measureHorizontalScroll(element);
    const now = nowMs();
    const baseLeft = wheelTarget !== null && now <= wheelResetAt ? wheelTarget : element.scrollLeft;
    const nextTarget = clamp(baseLeft + decision.deltaPx, 0, metrics.maxScrollLeft);

    if (Math.abs(nextTarget - baseLeft) < 0.5 && !event.shiftKey) {
      return;
    }

    event.preventDefault();
    wheelTarget = nextTarget;
    wheelResetAt = now + WHEEL_ACCUMULATE_WINDOW_MS;
    applyHorizontalScrollPosition(element, nextTarget, true);
    emitMetrics();
  };

  const handleCaptureClick = (event: MouseEvent) => {
    if (!suppressNextClick) return;
    event.preventDefault();
    event.stopPropagation();
    clearClickSuppression();
  };

  const handleTouchStart = (event: TouchEvent) => {
    stopInertia();
    clearWheelTarget();
    const touch = event.touches[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchMovedBeyondThreshold = false;
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (touchMovedBeyondThreshold) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (Math.hypot(dx, dy) >= dragThresholdPx) {
      touchMovedBeyondThreshold = true;
    }
  };

  const handleTouchEnd = () => {
    if (touchMovedBeyondThreshold) {
      armClickSuppression(CLICK_SUPPRESS_TOUCH_MS);
      touchMovedBeyondThreshold = false;
    }
  };

  const scrollByStep = (direction: -1 | 1, stepRatioOverride?: number): boolean => {
    stopInertia();
    clearWheelTarget();
    const metrics = measureHorizontalScroll(element);
    if (!metrics.canScroll) return false;
    if (direction < 0 && !metrics.canScrollLeft) return false;
    if (direction > 0 && !metrics.canScrollRight) return false;

    const ratio = stepRatioOverride ?? stepRatio;
    const stepDistance = Math.max(minStepPx, Math.round(metrics.clientWidth * ratio));
    const targetLeft = clamp(metrics.scrollLeft + direction * stepDistance, 0, metrics.maxScrollLeft);
    applyHorizontalScrollPosition(element, targetLeft, true);
    emitMetrics();
    return true;
  };

  const scrollToProgress = (progress: number) => {
    stopInertia();
    clearWheelTarget();
    const metrics = measureHorizontalScroll(element);
    if (!metrics.canScroll) return;
    const targetLeft = clamp(progress, 0, 1) * metrics.maxScrollLeft;
    applyHorizontalScrollPosition(element, targetLeft, true);
    emitMetrics();
  };

  const scrollToEdge = (edge: "start" | "end") => {
    scrollToProgress(edge === "start" ? 0 : 1);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!keyboard) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (isElementMatching(event.target, KEYBOARD_SKIP_SELECTOR)) return;

    const metrics = measureHorizontalScroll(element);
    if (!metrics.canScroll) return;

    if (event.key === "ArrowLeft") {
      if (scrollByStep(-1)) event.preventDefault();
      return;
    }
    if (event.key === "ArrowRight") {
      if (scrollByStep(1)) event.preventDefault();
      return;
    }
    if (event.target === element && event.key === "Home") {
      event.preventDefault();
      scrollToEdge("start");
      return;
    }
    if (event.target === element && event.key === "End") {
      event.preventDefault();
      scrollToEdge("end");
    }
  };

  const handleScroll = () => {
    emitMetrics();
  };

  const handleScrollEnd = () => {
    clearWheelTarget();
    emitMetrics();
  };

  const handleWindowResize = () => {
    emitMetrics();
  };

  element.addEventListener("wheel", handleWheel, { passive: false });
  element.addEventListener("pointerdown", handlePointerDown);
  element.addEventListener("click", handleCaptureClick, true);
  element.addEventListener("keydown", handleKeyDown);
  element.addEventListener("scroll", handleScroll, { passive: true });
  element.addEventListener("scrollend", handleScrollEnd, { passive: true });
  element.addEventListener("touchstart", handleTouchStart, { passive: true });
  element.addEventListener("touchmove", handleTouchMove, { passive: true });
  element.addEventListener("touchend", handleTouchEnd, { passive: true });
  element.addEventListener("touchcancel", handleTouchEnd, { passive: true });
  window.addEventListener("resize", handleWindowResize, { passive: true });

  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          emitMetrics();
        });
  resizeObserver?.observe(element);
  if (element.firstElementChild) {
    resizeObserver?.observe(element.firstElementChild);
  }

  emitMetrics(true);

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stopInertia();
    clearWheelTarget();
    clearClickSuppression();
    finishPointerDrag(false);
    resizeObserver?.disconnect();
    element.removeEventListener("wheel", handleWheel);
    element.removeEventListener("pointerdown", handlePointerDown);
    element.removeEventListener("click", handleCaptureClick, true);
    element.removeEventListener("keydown", handleKeyDown);
    element.removeEventListener("scroll", handleScroll);
    element.removeEventListener("scrollend", handleScrollEnd);
    element.removeEventListener("touchstart", handleTouchStart);
    element.removeEventListener("touchmove", handleTouchMove);
    element.removeEventListener("touchend", handleTouchEnd);
    element.removeEventListener("touchcancel", handleTouchEnd);
    window.removeEventListener("resize", handleWindowResize);
    delete element.dataset.hscrollErgonomics;
    delete element.dataset.hscrollCanScroll;
    delete element.dataset.hscrollAtStart;
    delete element.dataset.hscrollAtEnd;
    delete element.dataset.hscrollDragging;
  };

  return {
    measure: () => emitMetrics(true),
    scrollByStep,
    scrollToProgress,
    scrollToEdge,
    stopInertia,
    destroy,
  };
}
