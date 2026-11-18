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

interface CatalogInkIndicatorOptions {
  /** 현재 활성 탭/링크를 찾는 CSS 선택자 (기본: `[aria-current="page"], [aria-selected="true"]`). */
  readonly activeSelector?: string;
  /** 호버·포커스 미리보기 대상 자식 선택자 (예: `a, [role="tab"], button`). 생략하면 활성 항목만 추적한다. */
  readonly itemSelector?: string;
  /** 글자 폭에 맞춰 양옆에서 들여놓을 최대 여백(px). 0이면 요소 전체 폭에 맞춘다. */
  readonly maxInsetPx?: number;
}

export interface CatalogInkIndicatorResult {
  readonly style: CSSProperties;
  readonly onPointerMove?: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerLeave?: () => void;
  readonly onFocusCapture?: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlurCapture?: (event: FocusEvent<HTMLElement>) => void;
}

/**
 * 카탈로그 탭·요일 스트립 전용 transform 기반 슬라이딩 인디케이터 훅.
 *
 * width/left 레이아웃 애니메이션 없이 1px 기준 막대를 `translateX(--ink-x) scaleX(--ink-w)`로만
 * 이동시킨다. 첫 측정 전에는 전이를 켜지 않아 초기 점프가 없고, ResizeObserver가 없는 jsdom에서도
 * 안전하게 동작한다.
 */
export function useCatalogInkIndicator(
  containerRef: RefObject<HTMLElement | null>,
  activeKey: string | number,
  options: CatalogInkIndicatorOptions = {},
): CatalogInkIndicatorResult {
  const {
    activeSelector = '[aria-current="page"], [aria-selected="true"], [data-ink-active="true"]',
    itemSelector,
    maxInsetPx = 8,
  } = options;

  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 });
  const previewTargetRef = useRef<HTMLElement | null>(null);

  const measureTarget = useCallback(
    (explicitTarget?: HTMLElement | null) => {
      const container = containerRef.current;
      if (!container) return;
      const target =
        explicitTarget ??
        previewTargetRef.current ??
        container.querySelector<HTMLElement>(activeSelector);
      if (!target || !container.contains(target)) {
        setStyle((prev) => (prev.opacity === 0 ? prev : { ...prev, opacity: 0 }));
        return;
      }
      const containerBox = container.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      const inset = maxInsetPx > 0 ? Math.min(maxInsetPx, targetBox.width * 0.18) : 0;
      const width = Math.max(0, targetBox.width - inset * 2);
      const offsetX = targetBox.left - containerBox.left + container.scrollLeft + inset;
      setStyle({
        "--ink-x": `${Math.round(offsetX)}px`,
        "--ink-w": String(Math.max(1, Math.round(width))),
        opacity: width > 0 ? 1 : 0,
      } as CSSProperties);
    },
    [activeSelector, containerRef, maxInsetPx],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    previewTargetRef.current = null;
    let frame = 0;
    measureTarget(null);
    if (!container.hasAttribute("data-ink-ready") && typeof window !== "undefined") {
      frame = window.requestAnimationFrame(() => {
        container.setAttribute("data-ink-ready", "true");
      });
    }
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => measureTarget(null))
        : null;
    observer?.observe(container);
    const handleResize = () => measureTarget(null);
    window.addEventListener("resize", handleResize);
    void document.fonts?.ready?.then(() => measureTarget(null)).catch(() => undefined);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [activeKey, containerRef, measureTarget]);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!itemSelector || event.pointerType === "touch") return;
      const item = (event.target as Element | null)?.closest?.(itemSelector);
      if (item instanceof HTMLElement && containerRef.current?.contains(item)) {
        if (previewTargetRef.current !== item) {
          previewTargetRef.current = item;
          measureTarget(item);
        }
      }
    },
    [containerRef, itemSelector, measureTarget],
  );

  const onPointerLeave = useCallback(() => {
    if (!previewTargetRef.current) return;
    previewTargetRef.current = null;
    measureTarget(null);
  }, [measureTarget]);

  const onFocusCapture = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (!itemSelector) return;
      const item = (event.target as Element | null)?.closest?.(itemSelector);
      if (item instanceof HTMLElement && containerRef.current?.contains(item)) {
        previewTargetRef.current = item;
        measureTarget(item);
      }
    },
    [containerRef, itemSelector, measureTarget],
  );

  const onBlurCapture = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (!itemSelector) return;
      const nextFocused = event.relatedTarget as Node | null;
      if (!nextFocused || !containerRef.current?.contains(nextFocused)) {
        previewTargetRef.current = null;
        measureTarget(null);
      }
    },
    [containerRef, itemSelector, measureTarget],
  );

  if (!itemSelector) {
    return { style };
  }

  return {
    style,
    onPointerMove,
    onPointerLeave,
    onFocusCapture,
    onBlurCapture,
  };
}
