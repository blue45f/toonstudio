import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

import type { HeaderSectionId } from "./site-header-navigation";

interface HeaderInkGeometry {
  readonly left: number;
  readonly width: number;
  readonly visible: boolean;
}

type HeaderInkStyle = CSSProperties & { readonly "--ink-x": string; readonly "--ink-w": number };

/** 현재 구역의 링크를 측정한다. 키보드 초점·aria-current는 링크가 계속 소유한다. */
export function useHeaderInkIndicator(
  navigationRef: RefObject<HTMLElement | null>,
  currentSection: HeaderSectionId | null,
): HeaderInkStyle {
  const [geometry, setGeometry] = useState<HeaderInkGeometry>({ left: 0, width: 0, visible: false });

  useLayoutEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    let disposed = false;
    let measureFrame = 0;
    let readyFrame = 0;

    const measure = () => {
      if (disposed) return;
      const target = Array.from(navigation.querySelectorAll<HTMLElement>("[data-navigation-entry]"))
        .find((element) => element.dataset.navigationEntry === currentSection);
      const parentBox = navigation.getBoundingClientRect();
      const targetBox = target?.getBoundingClientRect();
      const visible = Boolean(currentSection && targetBox && targetBox.width > 0 && parentBox.width > 0);
      const left = visible && targetBox ? Math.round(targetBox.left - parentBox.left + navigation.scrollLeft) : 0;
      const width = visible && targetBox ? Math.round(targetBox.width) : 0;
      setGeometry((previous) => previous.left === left && previous.width === width && previous.visible === visible
        ? previous
        : { left, width, visible });
      // 첫 배치는 애니메이션 없이 맞추고 다음 구역부터 기존 CSS 전이를 적용한다.
      if (visible && !navigation.hasAttribute("data-ink-ready") && !readyFrame) {
        readyFrame = window.requestAnimationFrame(() => {
          readyFrame = 0;
          if (!disposed) navigation.setAttribute("data-ink-ready", "true");
        });
      }
    };
    const scheduleMeasure = () => {
      if (disposed) return;
      window.cancelAnimationFrame(measureFrame);
      measureFrame = window.requestAnimationFrame(measure);
    };

    measure();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    resizeObserver?.observe(navigation);
    for (const link of navigation.querySelectorAll("[data-navigation-entry]")) resizeObserver?.observe(link);
    const mutationObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(scheduleMeasure);
    // 언어 전환으로 글자 폭이 바뀌어도 표시 위치를 다시 맞춘다. 스타일 변경은 관찰하지 않는다.
    mutationObserver?.observe(navigation, { childList: true, characterData: true, subtree: true });
    navigation.addEventListener("focusin", scheduleMeasure);
    navigation.addEventListener("focusout", scheduleMeasure);
    navigation.addEventListener("scroll", scheduleMeasure, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    const fonts = document.fonts;
    fonts?.addEventListener("loadingdone", scheduleMeasure);
    if (fonts) void fonts.ready.then(() => { if (!disposed) scheduleMeasure(); });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(measureFrame);
      window.cancelAnimationFrame(readyFrame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      navigation.removeEventListener("focusin", scheduleMeasure);
      navigation.removeEventListener("focusout", scheduleMeasure);
      navigation.removeEventListener("scroll", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      fonts?.removeEventListener("loadingdone", scheduleMeasure);
    };
  }, [navigationRef, currentSection]);

  return { "--ink-x": `${geometry.left}px`, "--ink-w": geometry.width, opacity: geometry.visible ? 1 : 0 };
}
