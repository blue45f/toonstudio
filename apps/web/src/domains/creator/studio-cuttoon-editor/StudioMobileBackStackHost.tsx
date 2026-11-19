"use no memo";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";
import {
  createStudioMobileHistorySyncController,
  resolveStudioMobileBackLayers,
  type StudioMobileHistorySyncController,
} from "./studio-mobile-back-stack";

/**
 * 모바일 편집 화면에서 시스템 뒤로 가기(`popstate`)가 편집기 전체를 이탈하지 않고
 * 열려 있는 최상단 패널·모달·도크 팝오버부터 한 단계씩 닫도록 보장한다.
 */
export function StudioMobileBackStackHost(s: StudioCuttoonEditorViewSession) {
  const {
    admittedBg3dOpen,
    admittedCharacterShaperOpen,
    admittedPoserVrmOpen,
    dismissActiveMobileSheet,
    isMobile,
    menu,
    mobileSheet,
    quickAccessPaletteOpen,
    quickActionsOpen,
    setMenu,
    setQuickAccessPaletteOpen,
    setQuickActionsOpen,
    setShortcutsOpen,
    shortcutsOpen,
    studioRoute,
  } = s;

  const [domRevision, setDomRevision] = useState(0);
  const routedModalOwners = useRef(new WeakSet<Element>());
  // 포털은 URL 변경보다 한 커밋 먼저 그려질 수 있다. 실제 편집기에 승인된 창이 같은 이력을 소유한다.
  const routedSurface = admittedPoserVrmOpen ? "poser" : admittedCharacterShaperOpen ? "character"
    : admittedBg3dOpen ? "bg3d" : studioRoute.surface;
  const controllerRef = useRef<StudioMobileHistorySyncController | null>(null);

  const ensureController = (): StudioMobileHistorySyncController | null => {
    if (controllerRef.current === null && typeof window !== "undefined") {
      controllerRef.current = createStudioMobileHistorySyncController({
        getPathname: () => window.location.pathname,
        getHref: () => window.location.href,
        getState: () => window.history.state,
        pushState: (state, url) => window.history.pushState(state, "", url),
        go: (delta) => window.history.go(delta),
      });
    }
    return controllerRef.current;
  };

  useEffect(() => {
    if (!isMobile || typeof document === "undefined") return;
    let queued = false;
    const bump = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        setDomRevision((value) => value + 1);
      });
    };
    const observer = new MutationObserver(bump);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "open", "aria-modal"],
    });
    return () => observer.disconnect();
  }, [isMobile]);

  useLayoutEffect(() => {
    void domRevision;
    const controller = ensureController();
    if (!controller) return;
    const layers = resolveStudioMobileBackLayers({
      isMobile: Boolean(isMobile),
      routedSurface,
      routedModalOwners: routedModalOwners.current,
      mobileSheet,
      dismissActiveMobileSheet,
      menuOpen: menu !== null,
      dismissMenu: () => setMenu(null),
      quickActionsOpen: Boolean(quickActionsOpen),
      dismissQuickActions: () => setQuickActionsOpen(false),
      quickAccessPaletteOpen: Boolean(quickAccessPaletteOpen),
      dismissQuickAccessPalette: () => setQuickAccessPaletteOpen(false),
      shortcutsOpen: Boolean(shortcutsOpen),
      dismissShortcuts: () => setShortcutsOpen(false),
    });
    controller.syncLayers(layers);
  }, [
    dismissActiveMobileSheet,
    domRevision,
    isMobile,
    menu,
    mobileSheet,
    quickAccessPaletteOpen,
    quickActionsOpen,
    setMenu,
    setQuickAccessPaletteOpen,
    setQuickActionsOpen,
    setShortcutsOpen,
    shortcutsOpen,
    routedSurface,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    ensureController();
    const onPopState = (event: PopStateEvent) => {
      controllerRef.current?.handlePopState(event);
    };
    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("popstate", onPopState, true);
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  return null;
}
