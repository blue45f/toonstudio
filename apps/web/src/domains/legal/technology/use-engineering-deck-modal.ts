import { useEffect, type RefObject } from "react";

/** 발표 화면이 열려 있는 동안 배경을 inert로 만들고, 포커스를 가두고, 닫히면 되돌린다. */
export function useDeckModalLayer(active: boolean, containerRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== container && !element.contains(container))
      .map((element) => ({ element, inert: element.inert }));
    for (const { element } of siblings) element.inert = true;
    document.body.style.overflow = "hidden";
    container?.focus();
    const trapTab = (event: KeyboardEvent): void => {
      if (event.key !== "Tab" || !container) return;
      const controls = Array.from(container.querySelectorAll<HTMLElement>('button:not(:disabled), select, a[href], summary, [tabindex="0"]'))
        .filter((element) => element.offsetParent !== null || element === document.activeElement);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapTab);
    return () => {
      document.removeEventListener("keydown", trapTab);
      document.body.style.overflow = previousOverflow;
      for (const { element, inert } of siblings) element.inert = inert;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [active, containerRef]);
}
