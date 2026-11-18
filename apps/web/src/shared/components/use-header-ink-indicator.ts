import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

/**
 * 헤더 1차 메뉴의 잉크 밑줄 위치.
 *
 * 현재 구역 링크의 가로 위치와 폭을 CSS 변수(--ink-x, --ink-w)로 돌려준다. 밑줄 자체는
 * 1px 폭 요소를 transform(translateX + scaleX)으로만 옮기므로 레이아웃을 다시 계산하지 않는다.
 * 첫 배치는 전이 없이 놓고(data-ready 이전), 이후 구역이 바뀔 때만 그어지듯 미끄러진다.
 * ResizeObserver가 없는 환경(jsdom 등)에서도 한 번은 측정한다.
 */
export function useHeaderInkIndicator(
  navRef: RefObject<HTMLElement | null>,
  currentSection: string | null,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    let frame = 0;
    let ready = false;
    const measure = () => {
      const link = currentSection
        ? nav.querySelector<HTMLElement>(`[data-navigation-entry="${currentSection}"]`)
        : null;
      if (!link) {
        setStyle((previous) => ({ ...previous, opacity: 0 }));
        return;
      }
      const navBox = nav.getBoundingClientRect();
      const linkBox = link.getBoundingClientRect();
      // 글자 양옆 안쪽 여백(10px)만큼 들여 글자 폭에 맞춘다.
      const inset = Math.min(10, linkBox.width / 4);
      const width = Math.max(0, linkBox.width - inset * 2);
      setStyle({
        "--ink-x": `${Math.round(linkBox.left - navBox.left + inset)}px`,
        "--ink-w": String(Math.round(width)),
        opacity: width > 0 ? 1 : 0,
      } as CSSProperties);
      if (!ready) {
        ready = true;
        frame = window.requestAnimationFrame(() => nav.setAttribute("data-ink-ready", "true"));
      }
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(nav);
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure).catch(() => undefined);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [navRef, currentSection]);

  return style;
}
