import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

import { resolveTooltipPlacementAvoidingPopup, tooltipArrowStyle, tooltipSideStyle, type TooltipPlacement } from "./accessible-tooltip-placement";

type TooltipSource = Readonly<{
  target: HTMLElement;
  title: string;
  description?: string;
  shortcut?: string;
  reducedMotion: boolean;
}>;

const SHOW_DELAY_MS = 360;
const WARM_SHOW_DELAY_MS = 90;
const HIDE_DELAY_MS = 120;
const EXIT_DURATION_MS = 100;
const VIEWPORT_PADDING = 10;
const TOUCH_HOLD_DELAY_MS = 520;
const TOUCH_MOVE_TOLERANCE_PX = 10;
const QUICK_ACCESS_DESKTOP_SELECTOR = '[data-studio-quick-access-surface="true"][data-mobile="false"]';
const CANDIDATE_SELECTOR = [
  "[data-tooltip]", "[data-app-tooltip]", "[title]", "button[aria-label]", "a[aria-label]",
  '[role="button"][aria-label]', '[role="tab"][aria-label]', '[role="menuitem"][aria-label]',
  '[role="switch"][aria-label]', '[role="checkbox"][aria-label]', '[role="radio"][aria-label]',
  '[role="option"][aria-label]',
].join(",");

function cleanCopy(value: string | null | undefined): string | undefined {
  const copy = value?.replace(/\s+/gu, " ").trim();
  return copy || undefined;
}

function hasUsableArea(rect: DOMRect | null | undefined): rect is DOMRect {
  return Boolean(
    rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 0 && rect.height > 0,
  );
}

function tooltipAnchorRect(target: HTMLElement): DOMRect | null {
  const targetRect = target.getBoundingClientRect();
  if (hasUsableArea(targetRect)) return targetRect;

  // Inline wrappers can keep a zero-sized box while their rendered child
  // already has stable geometry. Anchor to that real hit area instead.
  const childRect = target.firstElementChild?.getBoundingClientRect();
  return hasUsableArea(childRect) ? childRect : null;
}

function hasVisibleText(target: HTMLElement): boolean {
  if (typeof document === "undefined" || typeof NodeFilter === "undefined") {
    return Boolean(cleanCopy(target.textContent));
  }

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!cleanCopy(node.textContent)) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || parent.closest('[aria-hidden="true"], [hidden], .sr-only')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  return Boolean(walker.nextNode());
}

function isKoreanDocument(): boolean {
  if (typeof document === "undefined") return true;
  const lang = document.documentElement.lang.trim().toLowerCase();
  return !lang || lang.startsWith("ko");
}

function targetPrefersReducedMotion(target: HTMLElement): boolean {
  if (target.closest('[data-studio-reduce-motion="true"]')) return true;
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function contextualDescription(target: HTMLElement): string | undefined {
  const explicit = cleanCopy(
    target.getAttribute("data-tooltip-description") ?? target.getAttribute("aria-description"),
  );
  if (explicit) return explicit;

  const korean = isKoreanDocument();
  const disabledReason = cleanCopy(target.getAttribute("data-tooltip-disabled-reason"));
  if (disabledReason) return disabledReason;
  if (target.hasAttribute("disabled") || target.getAttribute("aria-disabled") === "true") {
    return korean ? "현재 사용할 수 없습니다." : "Unavailable right now.";
  }

  const pressed = target.getAttribute("aria-pressed");
  if (pressed === "true") {
    return korean ? "현재 선택되어 있습니다. 누르면 해제합니다." : "Selected. Activate to turn it off.";
  }
  if (pressed === "false") {
    return korean ? "누르면 선택합니다." : "Activate to select.";
  }

  const checked = target.getAttribute("aria-checked");
  if (checked === "true") {
    return korean ? "현재 켜져 있습니다. 누르면 끕니다." : "On. Activate to turn it off.";
  }
  if (checked === "false") {
    return korean ? "현재 꺼져 있습니다. 누르면 켭니다." : "Off. Activate to turn it on.";
  }

  const expanded = target.getAttribute("aria-expanded");
  const isNavigationLink = target instanceof HTMLAnchorElement && target.hasAttribute("href");
  if (!isNavigationLink && expanded === "true") {
    return korean ? "현재 열려 있습니다. 누르면 닫습니다." : "Open. Activate to close.";
  }
  if (!isNavigationLink && expanded === "false") {
    return korean ? "누르면 관련 메뉴나 패널을 엽니다." : "Activate to open the related menu or panel.";
  }

  const selected = target.getAttribute("aria-selected");
  if (selected === "true") {
    return korean ? "현재 선택된 항목입니다." : "Currently selected.";
  }
  if (selected === "false") {
    return korean ? "누르면 이 항목으로 전환합니다." : "Activate to switch to this item.";
  }

  return undefined;
}

const EXCLUDED_SURFACE_SELECTOR =
  '[data-app-tooltip-exclude="true"], [data-studio-tool-hint-target="true"], [data-studio-tool-hint="true"], [data-studio-tool-hint-mode="off"]';

function isTooltipSuppressedTarget(eventTarget: EventTarget | null): boolean {
  return eventTarget instanceof Element && eventTarget.closest(EXCLUDED_SURFACE_SELECTOR) !== null;
}

function controlledPopupElement(target: HTMLElement): HTMLElement | null {
  if (target.getAttribute("aria-expanded") !== "true") return null;
  const ids = (target.getAttribute("aria-controls") ?? "").split(/\s+/u).filter(Boolean);
  for (const id of ids) {
    const panel = document.getElementById(id);
    if (!panel || panel.hidden || panel.closest('[hidden], [inert], [aria-hidden="true"]')) continue;
    return panel;
  }
  return null;
}

function controlledPopupRect(target: HTMLElement): DOMRect | null {
  const panel = controlledPopupElement(target);
  const rect = panel?.getBoundingClientRect();
  return hasUsableArea(rect) ? rect : null;
}

function tooltipSourceFromEventTarget(eventTarget: EventTarget | null): TooltipSource | null {
  if (!(eventTarget instanceof Element)) return null;
  if (isTooltipSuppressedTarget(eventTarget)) return null;
  const target = eventTarget.closest<HTMLElement>(CANDIDATE_SELECTOR);
  if (!target || !target.isConnected) return null;
  if (isTooltipSuppressedTarget(target)) return null;
  if (target.hidden || target.closest('[hidden], [inert], [aria-hidden="true"]')) return null;

  const dataTitle = cleanCopy(
    target.getAttribute("data-tooltip") ?? target.getAttribute("data-app-tooltip"),
  );
  const nativeTitle = cleanCopy(target.getAttribute("title"));
  const ariaLabel = cleanCopy(target.getAttribute("aria-label"));
  const explicit = Boolean(dataTitle || nativeTitle);
  if (!explicit && hasVisibleText(target)) return null;

  const title = dataTitle ?? nativeTitle ?? ariaLabel;
  if (!title) return null;

  return {
    target,
    title,
    description: contextualDescription(target),
    shortcut: cleanCopy(
      target.getAttribute("data-tooltip-shortcut") ??
        target.getAttribute("aria-keyshortcuts"),
    ),
    reducedMotion: targetPrefersReducedMotion(target),
  };
}

function addDescription(target: HTMLElement, id: string): void {
  const ids = new Set(
    (target.getAttribute("aria-describedby") ?? "").split(/\s+/u).filter(Boolean),
  );
  ids.add(id);
  target.setAttribute("aria-describedby", [...ids].join(" "));
}
function removeDescription(target: HTMLElement, id: string): void {
  const ids = (target.getAttribute("aria-describedby") ?? "")
    .split(/\s+/u)
    .filter((candidate) => candidate && candidate !== id);
  if (ids.length > 0) target.setAttribute("aria-describedby", ids.join(" "));
  else target.removeAttribute("aria-describedby");
}

function resolvePlacement(
  target: HTMLElement,
  bubble: HTMLElement,
): TooltipPlacement | null {
  const anchor = tooltipAnchorRect(target);
  if (!anchor) return null;

  const visualViewport = globalThis.visualViewport;
  const controlledPopup = controlledPopupRect(target);
  const quickAccess = target.ownerDocument.querySelector(QUICK_ACCESS_DESKTOP_SELECTOR);
  const quickAccessRect = quickAccess && !quickAccess.contains(target) ? quickAccess.getBoundingClientRect() : null;
  const side = target.closest("[data-app-tooltip-preferred-side]")?.getAttribute("data-app-tooltip-preferred-side");
  const preferredSide = side === "left" || side === "right" ? side
    : !controlledPopup && target.closest('[role="toolbar"][aria-orientation="vertical"]') ? "right" : undefined;
  return resolveTooltipPlacementAvoidingPopup({
    anchor,
    popup: bubble.getBoundingClientRect(),
    controlledPopup,
    avoidPopup: hasUsableArea(quickAccessRect) ? quickAccessRect : null,
    preferredSide,
    viewport: {
      left: visualViewport?.offsetLeft ?? 0, top: visualViewport?.offsetTop ?? 0,
      width: visualViewport?.width ?? globalThis.innerWidth,
      height: visualViewport?.height ?? globalThis.innerHeight,
    },
  });
}

export function AccessibleTooltipLayer(): ReactElement | null {
  const tooltipId = `app-tooltip-${useId().replaceAll(":", "")}`;
  const bubbleRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<TooltipSource | null>(null);
  const nativeTitleRef = useRef<Readonly<{ target: HTMLElement; value: string }> | null>(null);
  const showTimer = useRef<number>(0);
  const hideTimer = useRef<number>(0);
  const exitTimer = useRef<number>(0);
  const closeTooltipRef = useRef<(immediate: boolean) => void>(() => undefined);
  const [active, setActive] = useState<TooltipSource | null>(null);
  const [closing, setClosing] = useState(false);
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null);

  useEffect(() => {
    let hoveredTarget: HTMLElement | null = null;
    let focusedTarget: HTMLElement | null = null;
    let bubbleHovered = false;
    let touchHoldTimer = 0;
    let pointerFocusSuppressionTimer = 0;
    let pointerFocusSuppressedTarget: HTMLElement | null = null;
    // 초점 툴팁은 키보드로 이동할 때만 연다. 대화상자가 열리며 코드로 준 초기 초점이나
    // 포인터 조작 뒤의 초점 이동에 말풍선이 떠서 옆 컨트롤을 가리지 않게 한다.
    let lastInputWasKeyboard = false;
    let touchIntent: {
      source: TooltipSource;
      pointerId: number;
      x: number;
      y: number;
      opened: boolean;
    } | null = null;

    function clearShowTimer(): void {
      if (showTimer.current) globalThis.clearTimeout(showTimer.current);
      showTimer.current = 0;
    }

    function clearHideTimer(): void {
      if (hideTimer.current) globalThis.clearTimeout(hideTimer.current);
      hideTimer.current = 0;
    }

    function clearExitTimer(): void {
      if (exitTimer.current) globalThis.clearTimeout(exitTimer.current);
      exitTimer.current = 0;
    }

    function clearTouchHoldTimer(): void {
      if (touchHoldTimer) globalThis.clearTimeout(touchHoldTimer);
      touchHoldTimer = 0;
    }

    function clearPointerFocusSuppression(): void {
      if (pointerFocusSuppressionTimer) {
        globalThis.clearTimeout(pointerFocusSuppressionTimer);
      }
      pointerFocusSuppressionTimer = 0;
      pointerFocusSuppressedTarget = null;
    }

    function clearTimers(): void {
      clearShowTimer();
      clearHideTimer();
      clearExitTimer();
    }

    function isInsideTooltip(eventTarget: EventTarget | null): boolean {
      return (
        eventTarget instanceof Element &&
        eventTarget.closest('[data-app-tooltip-layer="true"]') !== null
      );
    }

    function isInsideTarget(
      target: HTMLElement | null,
      eventTarget: EventTarget | null,
    ): boolean {
      return Boolean(target && eventTarget instanceof Node && target.contains(eventTarget));
    }

    function sourceForEventTarget(eventTarget: EventTarget | null): TooltipSource | null {
      const source = tooltipSourceFromEventTarget(eventTarget);
      if (source) return source;
      const current = activeRef.current;
      return isInsideTarget(current?.target ?? null, eventTarget) ? current : null;
    }

    function restoreNativeTitle(): void {
      const original = nativeTitleRef.current;
      if (!original) return;
      if (!original.target.hasAttribute("title")) {
        original.target.setAttribute("title", original.value);
      }
      nativeTitleRef.current = null;
    }

    function finishClose(): void {
      const current = activeRef.current;
      if (current) removeDescription(current.target, tooltipId);
      restoreNativeTitle();
      activeRef.current = null;
      setActive(null);
      setPlacement(null);
      setClosing(false);
    }

    function close(immediate = false): void {
      clearTimers();
      const current = activeRef.current;
      if (!current) return;
      if (immediate || current.reducedMotion) {
        finishClose();
        return;
      }
      setClosing(true);
      exitTimer.current = globalThis.setTimeout(() => {
        exitTimer.current = 0;
        finishClose();
      }, EXIT_DURATION_MS) as unknown as number;
    }
    closeTooltipRef.current = close;

    function open(source: TooltipSource): void {
      clearTimers();
      const previous = activeRef.current;
      if (previous && previous.target !== source.target) {
        removeDescription(previous.target, tooltipId);
        restoreNativeTitle();
      }
      const nativeTitle = source.target.getAttribute("title");
      if (nativeTitle) {
        nativeTitleRef.current = { target: source.target, value: nativeTitle };
        source.target.removeAttribute("title");
      }
      addDescription(source.target, tooltipId);
      activeRef.current = source;
      setPlacement(null);
      setClosing(false);
      setActive(source);
    }

    function scheduleOpen(source: TooltipSource, immediate: boolean): void {
      clearHideTimer();
      clearExitTimer();
      setClosing(false);
      if (activeRef.current?.target === source.target) {
        activeRef.current = source;
        setActive(source);
        return;
      }
      clearShowTimer();
      if (immediate) {
        open(source);
        return;
      }
      const delay = activeRef.current ? WARM_SHOW_DELAY_MS : SHOW_DELAY_MS;
      showTimer.current = globalThis.setTimeout(() => {
        showTimer.current = 0;
        if (!source.target.isConnected || isTooltipSuppressedTarget(source.target)) return;
        open(source);
      }, delay) as unknown as number;
    }

    function scheduleClose(target: HTMLElement | null): void {
      if (!target || activeRef.current?.target !== target) {
        clearShowTimer();
        return;
      }
      if (hoveredTarget === target || focusedTarget === target || bubbleHovered) return;
      clearHideTimer();
      hideTimer.current = globalThis.setTimeout(() => {
        hideTimer.current = 0;
        close();
      }, HIDE_DELAY_MS) as unknown as number;
    }

    function cancelTouchIntent(closeOpened = false): void {
      clearTouchHoldTimer();
      if (closeOpened && touchIntent?.opened) close(true);
      touchIntent = null;
    }

    function onPointerOver(event: PointerEvent): void {
      if (isInsideTooltip(event.target)) {
        bubbleHovered = true;
        clearHideTimer();
        return;
      }
      if (event.pointerType === "touch") return;
      if (isTooltipSuppressedTarget(event.target)) {
        hoveredTarget = null;
        close(true);
        return;
      }
      const source = sourceForEventTarget(event.target);
      const current = activeRef.current;
      if (source) {
        if (pointerFocusSuppressedTarget === source.target) return;
        hoveredTarget = source.target;
        scheduleOpen(source, false);
        return;
      }
      if (current && isInsideTarget(current.target, event.target)) {
        hoveredTarget = current.target;
      }
    }

    function onPointerOut(event: PointerEvent): void {
      if (isInsideTooltip(event.target)) {
        if (isInsideTooltip(event.relatedTarget)) return;
        bubbleHovered = false;
        const currentTarget = activeRef.current?.target ?? null;
        if (isInsideTarget(currentTarget, event.relatedTarget)) {
          hoveredTarget = currentTarget;
          return;
        }
        scheduleClose(currentTarget);
        return;
      }

      const source = sourceForEventTarget(event.target);
      const activeTarget = activeRef.current?.target ?? null;
      const currentTarget = source?.target ??
        (isInsideTarget(activeTarget, event.target) ? activeTarget : null);
      if (!currentTarget) return;
      if (isInsideTarget(currentTarget, event.relatedTarget)) return;
      if (hoveredTarget === currentTarget) hoveredTarget = null;
      if (pointerFocusSuppressedTarget === currentTarget) {
        clearPointerFocusSuppression();
      }
      scheduleClose(currentTarget);
    }

    function onFocusIn(event: FocusEvent): void {
      if (isInsideTooltip(event.target)) return;
      if (isTooltipSuppressedTarget(event.target)) {
        focusedTarget = null;
        close(true);
        return;
      }
      const source = sourceForEventTarget(event.target);
      const activeTarget = activeRef.current?.target ?? null;
      if (source) {
        if (!lastInputWasKeyboard) return;
        if (pointerFocusSuppressedTarget === source.target) return;
        focusedTarget = source.target;
        scheduleOpen(source, true);
      } else if (isInsideTarget(activeTarget, event.target)) {
        focusedTarget = activeTarget;
      } else if (activeTarget && hoveredTarget !== activeTarget) {
        close(true);
      }
    }

    function onFocusOut(event: FocusEvent): void {
      const source = sourceForEventTarget(event.target);
      const currentTarget = source?.target ?? activeRef.current?.target ?? null;
      if (!currentTarget) return;
      if (isInsideTarget(currentTarget, event.relatedTarget)) return;
      if (focusedTarget === currentTarget) focusedTarget = null;
      scheduleClose(currentTarget);
    }

    function onKeyDown(event: KeyboardEvent): void {
      lastInputWasKeyboard = true;
      if (event.key !== "Escape") return;
      cancelTouchIntent();
      clearPointerFocusSuppression();
      close(true);
    }

    function onPointerDown(event: PointerEvent): void {
      lastInputWasKeyboard = false;
      if (isInsideTooltip(event.target)) {
        cancelTouchIntent();
        close(true);
        return;
      }

      const source = sourceForEventTarget(event.target);
      hoveredTarget = null;
      cancelTouchIntent();
      close(true);
      clearPointerFocusSuppression();
      if (!source) return;

      pointerFocusSuppressedTarget = source.target;
      pointerFocusSuppressionTimer = globalThis.setTimeout(() => {
        pointerFocusSuppressionTimer = 0;
        pointerFocusSuppressedTarget = null;
      }, 800) as unknown as number;

      if (event.pointerType !== "touch") return;
      touchIntent = {
        source,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        opened: false,
      };
      touchHoldTimer = globalThis.setTimeout(() => {
        touchHoldTimer = 0;
        if (!touchIntent || !touchIntent.source.target.isConnected) return;
        touchIntent.opened = true;
        open(touchIntent.source);
      }, TOUCH_HOLD_DELAY_MS) as unknown as number;
    }

    function onPointerMove(event: PointerEvent): void {
      if (event.pointerType !== "touch") {
        if (pointerFocusSuppressedTarget) clearPointerFocusSuppression();
        return;
      }
      const intent = touchIntent;
      if (!intent || intent.pointerId !== event.pointerId || intent.opened) return;
      if (
        Math.hypot(event.clientX - intent.x, event.clientY - intent.y) <=
        TOUCH_MOVE_TOLERANCE_PX
      ) {
        return;
      }
      cancelTouchIntent();
    }

    function onPointerUp(event: PointerEvent): void {
      const intent = touchIntent;
      if (event.pointerType === "touch" && intent?.pointerId === event.pointerId) {
        clearTouchHoldTimer();
        if (!intent.opened) touchIntent = null;
      }
      clearPointerFocusSuppression();
    }

    function onPointerCancel(event: PointerEvent): void {
      if (touchIntent?.pointerId !== event.pointerId) return;
      cancelTouchIntent(true);
      clearPointerFocusSuppression();
    }

    function onClick(event: MouseEvent): void {
      const intent = touchIntent;
      if (intent?.opened && isInsideTarget(intent.source.target, event.target)) {
        event.preventDefault();
        event.stopPropagation();
        touchIntent = null;
        return;
      }
      // Pointer/focus tooltips are descriptive, not interactive popovers. Once a normal control
      // click commits an action, close immediately so the old help bubble cannot cover the modal
      // or sheet that the action just opened.
      close(true);
    }

    function onContextMenu(event: MouseEvent): void {
      const intent = touchIntent;
      if (!intent?.opened || !isInsideTarget(intent.source.target, event.target)) return;
      event.preventDefault();
    }

    function onViewportChange(): void {
      cancelTouchIntent();
      clearPointerFocusSuppression();
      close(true);
    }

    function onVisibilityChange(): void {
      if (document.visibilityState !== "visible") onViewportChange();
    }

    const passiveCapture = { capture: true, passive: true } as const;
    document.addEventListener("pointerover", onPointerOver, passiveCapture);
    document.addEventListener("pointerout", onPointerOut, passiveCapture);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    globalThis.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("pointerdown", onPointerDown, passiveCapture);
    globalThis.addEventListener("pointermove", onPointerMove, passiveCapture);
    globalThis.addEventListener("pointerup", onPointerUp, passiveCapture);
    globalThis.addEventListener("pointercancel", onPointerCancel, passiveCapture);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    globalThis.addEventListener("scroll", onViewportChange, passiveCapture);
    globalThis.addEventListener("wheel", onViewportChange, passiveCapture);
    globalThis.addEventListener("resize", onViewportChange);
    globalThis.addEventListener("blur", onViewportChange);
    globalThis.visualViewport?.addEventListener("resize", onViewportChange);
    globalThis.visualViewport?.addEventListener("scroll", onViewportChange);
    document.addEventListener("visibilitychange", onVisibilityChange);

    let quickAccessSurface = document.querySelector(QUICK_ACCESS_DESKTOP_SELECTOR);
    const mutationObserver = typeof MutationObserver === "function"
      ? new MutationObserver((records) => {
          const nextSurface = records.some(record => record.type === "childList")
            ? document.querySelector(QUICK_ACCESS_DESKTOP_SELECTOR)
            : quickAccessSurface;
          const mountedQuickAccess = nextSurface !== null && nextSurface !== quickAccessSurface;
          quickAccessSurface = nextSurface;
          if (mountedQuickAccess) {
            // Shift+Q can mount a window under the hovered control's existing help.
            // Clear both visible and queued background help, but keep help within the new window.
            if (!nextSurface.contains(hoveredTarget)) hoveredTarget = null;
            if (!nextSurface.contains(focusedTarget)) focusedTarget = null;
            if (touchIntent && !nextSurface.contains(touchIntent.source.target)) cancelTouchIntent();
            if ((activeRef.current && !nextSurface.contains(activeRef.current.target))
              || (!activeRef.current && !hoveredTarget && !focusedTarget)) {
              bubbleHovered = false;
              close(true);
            }
          }
          const current = activeRef.current;
          if (!current) return;
          if (!current.target.isConnected || isTooltipSuppressedTarget(current.target)) {
            close(true);
            return;
          }
          if (bubbleRef.current) {
            const next = resolvePlacement(current.target, bubbleRef.current);
            if (next) setPlacement(next);
            else close(true);
          }
        })
      : null;
    mutationObserver?.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-expanded", "data-app-tooltip-exclude", "hidden", "inert"],
    });

    return () => {
      document.removeEventListener("pointerover", onPointerOver, passiveCapture);
      document.removeEventListener("pointerout", onPointerOut, passiveCapture);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("pointerdown", onPointerDown, passiveCapture);
      globalThis.removeEventListener("pointermove", onPointerMove, passiveCapture);
      globalThis.removeEventListener("pointerup", onPointerUp, passiveCapture);
      globalThis.removeEventListener("pointercancel", onPointerCancel, passiveCapture);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      globalThis.removeEventListener("scroll", onViewportChange, passiveCapture);
      globalThis.removeEventListener("wheel", onViewportChange, passiveCapture);
      globalThis.removeEventListener("resize", onViewportChange);
      globalThis.removeEventListener("blur", onViewportChange);
      globalThis.visualViewport?.removeEventListener("resize", onViewportChange);
      globalThis.visualViewport?.removeEventListener("scroll", onViewportChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      mutationObserver?.disconnect();
      clearTimers();
      clearTouchHoldTimer();
      clearPointerFocusSuppression();
      const current = activeRef.current;
      if (current) removeDescription(current.target, tooltipId);
      restoreNativeTitle();
      activeRef.current = null;
      closeTooltipRef.current = () => undefined;
    };
  }, [tooltipId]);

  useLayoutEffect(() => {
    const target = active?.target;
    const bubble = bubbleRef.current;
    if (!target || !bubble) return;

    const observedTarget = target;
    const observedBubble = bubble;
    function updatePlacement(): void {
      if (!observedTarget.isConnected) return;
      const next = resolvePlacement(observedTarget, observedBubble);
      if (next) setPlacement(next);
      else closeTooltipRef.current(true);
    }

    updatePlacement();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updatePlacement) : null;
    observer?.observe(observedTarget);
    observer?.observe(observedBubble);
    const controlled = controlledPopupElement(observedTarget);
    if (controlled) observer?.observe(controlled);
    const quickAccess = target.ownerDocument.querySelector(QUICK_ACCESS_DESKTOP_SELECTOR);
    const moveObserver = quickAccess && !quickAccess.contains(target) && typeof MutationObserver === "function"
      ? new MutationObserver(updatePlacement) : null;
    if (quickAccess && !quickAccess.contains(target)) {
      observer?.observe(quickAccess);
      moveObserver?.observe(quickAccess, { attributes: true, attributeFilter: ["style", "hidden", "inert", "data-minimized"] });
    }
    return () => { observer?.disconnect(); moveObserver?.disconnect(); };
  }, [active]);

  if (!active || typeof document === "undefined") return null;

  const renderedPlacement = placement ?? {
    left: VIEWPORT_PADDING,
    top: VIEWPORT_PADDING,
    arrowOffset: 20,
    side: "bottom" as const,
  };
  const style: CSSProperties = {
    ...tooltipSideStyle(renderedPlacement.side),
    left: renderedPlacement.left,
    top: renderedPlacement.top,
    "--app-tooltip-arrow-offset": `${renderedPlacement.arrowOffset}px`,
  } as CSSProperties;

  return createPortal(
    <aside aria-label={isKoreanDocument() ? "조작 도움말" : "Control help"}>
    <div
      ref={bubbleRef}
      id={tooltipId}
      role="tooltip"
      data-app-tooltip-layer="true"
      data-side={renderedPlacement.side}
      data-state={closing ? "closing" : "open"}
      data-positioned={placement ? "true" : "false"}
      data-app-tooltip-reduced-motion={active.reducedMotion ? "true" : undefined}
      className="pointer-events-auto fixed z-[240] w-max max-w-[min(18rem,calc(100vw-1.25rem))] rounded-lg border border-line/80 bg-panel/98 px-2.5 py-2 text-left shadow-[0_18px_48px_oklch(0.06_0.01_70/0.62)] backdrop-blur-xl"
      style={style}
    >
      <span aria-hidden data-app-tooltip-arrow="true" style={tooltipArrowStyle(renderedPlacement)} />
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0 text-[0.75rem] font-bold leading-snug text-fg">
          {active.title}
        </span>
        {active.shortcut ? (
          <kbd className="shrink-0 rounded border border-line/70 bg-canvas/75 px-1.5 py-0.5 text-[0.625rem] font-semibold text-fg-2">
            {active.shortcut}
          </kbd>
        ) : null}
      </span>
      {active.description ? (
        <p className="mt-1 max-w-[30ch] text-[0.7rem] leading-relaxed text-fg-2">
          {active.description}
        </p>
      ) : null}
      <span aria-hidden data-app-tooltip-accent="true" />
    </div>
    </aside>,
    document.body,
  );
}
