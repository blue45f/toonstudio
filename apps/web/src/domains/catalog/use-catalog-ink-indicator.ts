import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
  type RefObject,
} from "react";

interface CatalogInkOptions {
  readonly activeSelector?: string;
  readonly itemSelector?: string;
  readonly maxInsetPx?: number;
}

type InkStyle = CSSProperties & { "--ink-x": string; "--ink-w": number };

/** 선택 의미는 기존 aria 속성에 두고, 포인터·키보드의 장식 밑줄만 측정한다. */
export function useCatalogInkIndicator(
  containerRef: RefObject<HTMLElement | null>,
  activeKey: string | number,
  {
    activeSelector = '[aria-current="page"], [aria-current="true"]',
    itemSelector = "a, button",
    maxInsetPx = 8,
  }: CatalogInkOptions = {},
) {
  const [line, setLine] = useState({ x: 0, width: 0 });
  const binding = useRef<{
    element: HTMLElement;
    activeKey: string | number;
    restore: () => void;
    cleanup: () => void;
  } | null>(null);

  const itemFrom = useCallback((target: EventTarget | null) => {
    const container = containerRef.current;
    const item = target instanceof Element ? target.closest<HTMLElement>(itemSelector) : null;
    return item && container?.contains(item) && !item.matches('[disabled], [aria-disabled="true"]')
      ? item
      : null;
  }, [containerRef, itemSelector]);

  const measure = useCallback((item: HTMLElement | null) => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const rect = item?.getBoundingClientRect();
    const width = rect?.width ?? 0;
    const inset = Math.min(Math.max(0, maxInsetPx), width / 4);
    const next = {
      x: rect ? rect.left - bounds.left + container.scrollLeft - container.clientLeft + inset : 0,
      width: Math.max(0, width - inset * 2),
    };
    setLine((previous) => previous.x === next.x && previous.width === next.width ? previous : next);
  }, [containerRef, maxInsetPx]);

  const restore = useCallback(() => {
    const container = containerRef.current;
    const focused = itemFrom(document.activeElement);
    measure(focused ?? container?.querySelector<HTMLElement>(activeSelector) ?? null);
  }, [activeSelector, containerRef, itemFrom, measure]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const previous = binding.current;
    if (previous?.element === container && previous.activeKey === activeKey && previous.restore === restore) return;
    previous?.cleanup();
    binding.current = null;
    if (!container) return;
    let disposed = false;
    restore();
    const frame = requestAnimationFrame(() => {
      container.dataset.inkReady = "true";
    });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(restore);
    const observeItems = () => {
      resize?.disconnect();
      resize?.observe(container);
      container.querySelectorAll(itemSelector).forEach((item) => resize?.observe(item));
      restore();
    };
    observeItems();
    const mutation = typeof MutationObserver === "undefined" ? null : new MutationObserver(observeItems);
    mutation?.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-current", "aria-selected", "aria-pressed", "disabled", "aria-disabled"],
    });
    window.addEventListener("resize", restore);
    container.addEventListener("scroll", restore, { passive: true });
    void document.fonts?.ready.then(() => {
      if (!disposed) restore();
    });
    const cleanup = () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation?.disconnect();
      window.removeEventListener("resize", restore);
      container.removeEventListener("scroll", restore);
      delete container.dataset.inkReady;
    };
    binding.current = { element: container, activeKey, restore, cleanup };
    // 로딩 뒤 DOM이 붙거나 빈 결과로 사라지는 경우에도 현재 ref를 확인한다.
    // 동일한 노드·선택에는 기존 관찰자를 유지해 hover 렌더가 전이를 끊지 않는다.
  });

  useLayoutEffect(() => () => {
    binding.current?.cleanup();
    binding.current = null;
  }, []);

  const style: InkStyle = { "--ink-x": line.x + "px", "--ink-w": line.width };
  return {
    style,
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (event.pointerType === "touch") return;
      const item = itemFrom(event.target);
      if (item) measure(item);
      else restore();
    },
    onPointerLeave: restore,
    onFocusCapture(event: FocusEvent<HTMLElement>) {
      measure(itemFrom(event.target));
    },
    onBlurCapture(event: FocusEvent<HTMLElement>) {
      measure(itemFrom(event.relatedTarget) ?? containerRef.current?.querySelector<HTMLElement>(activeSelector) ?? null);
    },
  };
}
