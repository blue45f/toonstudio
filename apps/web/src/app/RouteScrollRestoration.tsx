import { useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

import { isStudioRoutePathname, shouldPreserveStudioRouteLifecycle } from "@/domains/creator/studio-workspace-route";
import { createNavigationMemory } from "@/shared/lib/navigation-memory";
import { safeDecodeRouteText } from "@/shared/lib/safe-route-text";

function visibleReturnAnchor(focusKey: string): HTMLAnchorElement | undefined {
  const matches = [...document.querySelectorAll<HTMLAnchorElement>("a[data-route-return-focus]")].filter((anchor) => {
    if (anchor.dataset.routeReturnFocus !== focusKey || anchor.tabIndex < 0
      || anchor.closest("[hidden], [inert], [aria-hidden='true']") || anchor.getClientRects().length === 0) return false;
    for (let parent: HTMLElement | null = anchor; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
      if (parent instanceof HTMLDetailsElement && !parent.open
        && !parent.querySelector(":scope > summary")?.contains(anchor)) return false;
    }
    return true;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

/** Restore browser history without resetting in-page filters or Studio lifecycle. */
export function RouteScrollRestoration() {
  const { pathname, search, hash, key } = useLocation();
  const navigation = useNavigationType();
  const previousRef = useRef<{ pathname: string; search: string; hash: string } | null>(null);
  const [memory] = useState(() => createNavigationMemory());

  useLayoutEffect(() => {
    const previous = previousRef.current;
    const current = { pathname, search, hash };
    previousRef.current = current;

    // Preserve the existing editor policy; no observers, history ownership or memory in Studio.
    if (isStudioRoutePathname(pathname)) {
      if (previous?.pathname === pathname && previous.search === search) return;
      if (previous && shouldPreserveStudioRouteLifecycle(previous, current)) return;
      globalThis.scrollTo({ top: 0, left: 0 });
      if (previous) document.getElementById("main-content")?.focus({ preventScroll: true });
      return;
    }

    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const saved = navigation === "POP" ? memory.get(key) : undefined;
    // 같은 fragment를 유지한 필터 입력은 새 앵커 이동이 아니다. POP의 앵커 우선 정책은 유지한다.
    const queryOnlyChange = navigation !== "POP" && previous?.pathname === pathname
      && previous.hash === hash && previous.search !== search;
    const anchorId = !queryOnlyChange && hash.length > 1 ? safeDecodeRouteText(hash.slice(1)) : "";
    const returnFocusKey = !anchorId ? saved?.focusKey : undefined;
    const preserveFilterPosition = previous?.pathname === pathname && !saved && !anchorId;
    let restoring = !preserveFilterPosition;
    let observer: ResizeObserver | undefined;
    let mutation: MutationObserver | undefined;
    let timer = 0;
    const remember = () => {
      if (!restoring) memory.set(key, { ...memory.get(key), x: window.scrollX, y: window.scrollY });
    };
    // 공개 카드가 명시한 키만 현재 history entry에 두고 다른 링크 이동은 이전 키를 지운다.
    const rememberLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target.toLowerCase() !== "_self")) return;
      let destination: URL;
      try { destination = new URL(anchor.href, window.location.href); }
      catch { return; }
      if (destination.origin !== window.location.origin || isStudioRoutePathname(destination.pathname)) return;
      const focusKey = anchor.dataset.routeReturnFocus;
      memory.set(key, { x: window.scrollX, y: window.scrollY, ...(focusKey ? { focusKey } : {}) });
    };
    const release = () => {
      restoring = false;
      observer?.disconnect();
      mutation?.disconnect();
      window.clearTimeout(timer);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
    };
    const stop = () => {
      release();
      remember();
    };
    const restore = () => {
      if (!restoring) return;
      if (anchorId) {
        const anchor = document.getElementById(anchorId);
        if (!anchor) return;
        anchor.scrollIntoView({ block: "start", behavior: "instant" });
        const hadTabIndex = anchor.hasAttribute("tabindex");
        if (!hadTabIndex) anchor.setAttribute("tabindex", "-1");
        anchor.focus({ preventScroll: true });
        if (!hadTabIndex) anchor.removeAttribute("tabindex");
        stop();
        return;
      }
      const target = saved ?? { x: 0, y: 0 };
      // Lazy routes can initially be shorter than the saved position. Wait for content,
      // but never keep pulling the user back after they start interacting.
      if (document.documentElement.scrollHeight - window.innerHeight + 2 < target.y) return;
      window.scrollTo({ left: target.x, top: target.y, behavior: "instant" });
      if (returnFocusKey) {
        const focused = document.activeElement;
        // 브라우저나 화면이 이미 고른 입력·링크의 초점을 늦은 목록 복원이 빼앗지 않는다.
        if (focused && focused !== document.body && focused !== document.documentElement && focused.id !== "main-content") {
          stop();
          return;
        }
        const anchor = visibleReturnAnchor(returnFocusKey);
        if (!anchor) return;
        anchor.focus({ preventScroll: true });
      }
      if (previous && navigation !== "POP") document.getElementById("main-content")?.focus({ preventScroll: true });
      stop();
    };
    window.addEventListener("scroll", remember, { passive: true });
    document.addEventListener("click", rememberLink, true);
    if (restoring) {
      window.addEventListener("wheel", stop, { passive: true });
      window.addEventListener("touchstart", stop, { passive: true });
      window.addEventListener("pointerdown", stop, { passive: true });
      window.addEventListener("keydown", stop);
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(restore);
        observer.observe(document.body);
      }
      // 높이가 같은 로딩 목록의 카드·fragment도 기존 복원 owner 안에서 기다린다.
      if ((anchorId || returnFocusKey) && typeof MutationObserver !== "undefined") {
        mutation = new MutationObserver(restore);
        mutation.observe(document.getElementById("main-content") ?? document.body, {
          childList: true, subtree: true,
          ...(returnFocusKey ? { attributes: true, attributeFilter: ["hidden", "inert", "aria-hidden", "open", "class", "style"] } : {}),
        });
      }
      timer = window.setTimeout(stop, 5000);
      restore();
    } else remember();

    return () => {
      window.removeEventListener("scroll", remember);
      document.removeEventListener("click", rememberLink, true);
      // 새 화면에서 줄어든 좌표가 이전 경로의 저장 위치를 덮어쓰지 않도록 한다.
      // 복원을 기다리던 기록도 보존하고 관찰자·타이머만 해제한다.
      release();
      window.history.scrollRestoration = previousRestoration;
    };
  }, [pathname, search, hash, key, navigation, memory]);
  return null;
}
