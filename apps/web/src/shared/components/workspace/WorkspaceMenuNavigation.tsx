import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";

import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { canonicalSitePath } from "@/shared/lib/site-route-authority";
import { loadChunkWithReloadRecovery } from "@/shared/lib/chunk-load-recovery";
import { siteMobilePurposeHref } from "../site-mobile-purpose";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import type { WorkspaceNavigationContext } from "./workspace-navigation-model";

type MenuComponent = typeof import("../site-header-mobile-nav").MobileHeaderNavigation;

/** 셸의 메뉴 상태만 소유한다. 문서·권한·저장·프로젝트 선택은 기존 소유자에 둔다. */
export function WorkspaceMenuNavigation({ activeId, context }: {
  readonly activeId?: string;
  readonly context?: WorkspaceNavigationContext;
}) {
  const location = useLocation();
  const mobile = useMediaQuery("(max-width: 767px)");
  // 준비 실패 시 기존 전체 기능 링크와 음악 알약을 유지한다.
  const [Menu, setMenu] = useState<MenuComponent | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState(false);
  const menuId = useId(), navigation = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null), frame = useRef(0);
  const currentKey = useRef(location.key), openedKey = useRef<string | null>(null);
  currentKey.current = location.key;
  const closeWithoutFocus = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!mobile || Menu || unavailable) return;
    let active = true;
    void loadChunkWithReloadRecovery(
      () => import("../site-header-mobile-nav"), "site-header-mobile-nav",
    ).then(
      (module) => { if (active) setMenu(() => module.MobileHeaderNavigation); },
      () => { if (active) setUnavailable(true); },
    );
    return () => { active = false; };
  }, [mobile, Menu, unavailable]);
  const closeMenu = useCallback(() => {
    setOpen(false);
    const key = openedKey.current;
    window.cancelAnimationFrame(frame.current);
    frame.current = window.requestAnimationFrame(() => {
      if (key !== currentKey.current) return;
      const target = navigation.current?.querySelector<HTMLElement>('[data-navigation-entry="all-menu"]');
      const focused = document.activeElement;
      // 다른 입력으로 이미 옮긴 초점과 새 경로의 초점은 빼앗지 않는다.
      if (focused instanceof HTMLElement && focused !== document.body && focused.isConnected && focused !== target) return;
      if (target?.isConnected && !target.closest('[hidden],[inert]')
        && (typeof target.checkVisibility !== "function" || target.checkVisibility())) target.focus({ preventScroll: true });
    });
  }, []);
  const openMenu = useCallback(() => {
    openedKey.current = currentKey.current;
    setOpen(true);
  }, []);
  useEffect(() => { setOpen(false); }, [location.key]);
  useEffect(() => { if (!mobile && open) closeMenu(); }, [mobile, open, closeMenu]);
  useEffect(() => () => window.cancelAnimationFrame(frame.current), []);
  const path = canonicalSitePath(location.pathname);
  const isActive = (href: string, exact = false) => {
    const target = canonicalSitePath(href);
    return path === target || (!exact && target !== "/" && path.startsWith(`${target}/`));
  };
  return <>
    <WorkspaceNavigation activeId={activeId} context={context} navigationRef={navigation}
      onOpenMenu={mobile && Menu ? openMenu : undefined} menuOpen={open} menuId={menuId} />
    {/* 닫힐 때도 mount를 유지해야 공통 음악 handoff가 배경 차단 정리 뒤 실행된다. */}
    {mobile && Menu && typeof document !== "undefined" ? createPortal(
      <Menu menuOpen={open} menuId={menuId} panelRef={panel}
        closeMenu={closeMenu} closeForUtility={closeWithoutFocus}
        isActive={isActive} isPurposeActive={() => false}
        currentPurposeHref={siteMobilePurposeHref(path)} hideBottomTabs isMobileViewport />
    , document.body) : null}
  </>;
}
