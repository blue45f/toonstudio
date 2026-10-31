import { useEffect, useId, useRef } from "react";

import {
  compareStudioQuickAccessTabOrder,
  studioQuickAccessKeyboardClaimed,
  studioQuickAccessTabBoundary,
} from "./studio-cuttoon-editor/studio-quick-access-keyboard";

const UNAVAILABLE_SURFACE = "[inert], [hidden], [aria-hidden='true']";
const OPEN_MODAL = "[role='dialog'][aria-modal='true'], [role='alertdialog'][aria-modal='true'], dialog[open]";

/** 화면에서 사용할 수 있는 대상만 자동 초점과 복귀 대상으로 삼는다. */
function isAvailableFocusTarget(element: HTMLElement): boolean {
  if (!element.isConnected || element.matches(":disabled")
    || element.closest(UNAVAILABLE_SURFACE) || element.getClientRects().length === 0) return false;
  const visibility = element.ownerDocument.defaultView?.getComputedStyle(element).visibility;
  return visibility !== "hidden" && visibility !== "collapse";
}

/** 확인창·중첩 모달의 키는 그 창에 맡기고, 비활성 팔레트는 조작하지 않는다. */
function ownsSurfaceKeyboard(root: HTMLElement, target: EventTarget | null): boolean {
  if (root.closest(UNAVAILABLE_SURFACE)) return false;
  const modal = target instanceof Element ? target.closest(OPEN_MODAL) : null;
  return modal === null || modal === root;
}

/** 실제 Tab 후보를 모은다. 접힌·비활성·inert 영역은 이동 대상이 아니다. */
function visibleFocusableElements(root: HTMLElement): HTMLElement[] {
  const visible = [...root.querySelectorAll<HTMLElement>([
    "button", "a[href]", "area[href]", "input:not([type='hidden'])", "select",
    "textarea", "summary", "[tabindex]", "[contenteditable]", "audio[controls]", "video[controls]",
  ].join(","))].filter((element) => {
    return element.tabIndex >= 0 && isAvailableFocusTarget(element);
  });
  return visible.filter((element) => {
    if (!(element instanceof HTMLInputElement) || element.type !== "radio" || !element.name) return true;
    // 네이티브 Tab은 같은 라디오 그룹에서 선택된 항목 하나에만 멈춘다.
    const group = visible.filter((candidate): candidate is HTMLInputElement =>
      candidate instanceof HTMLInputElement && candidate.type === "radio"
      && candidate.name === element.name && candidate.form === element.form);
    return element === (group.find((candidate) => candidate.checked) ?? group[0]);
  }).sort((a, b) => compareStudioQuickAccessTabOrder(a.tabIndex, b.tabIndex));
}

function isTypingTarget(target: HTMLElement): boolean {
  return target.tagName === "INPUT"
    || target.tagName === "TEXTAREA"
    || target.tagName === "SELECT"
    || target.isContentEditable
    || target.getAttribute("role") === "textbox";
}

function hasActiveFloatingInteraction(surface: HTMLElement | null): boolean {
  return surface?.getAttribute("data-dragging") === "true"
    || surface?.getAttribute("data-resizing") === "true";
}

/** Shared focus, modal-tab, and shortcut lifecycle for both Quick Access presentations. */
export function useStudioQuickAccessSurfaceLifecycle(
  isMobile: boolean,
  onClose: () => void,
) {
  const descriptionId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const mountedSurface = surfaceRef.current;
    const ownerDocument = mountedSurface?.ownerDocument ?? document;
    const activeElement = ownerDocument.activeElement;
    restoreFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    const timer = globalThis.setTimeout(() => {
      const root = surfaceRef.current;
      if (!root || !isAvailableFocusTarget(root)) return;
      const active = ownerDocument.activeElement;
      // 예약한 동안 사용자가 입력란이나 다른 창을 선택했다면 그 초점을 유지한다.
      if (active !== null && active !== ownerDocument.body && active !== root
        && active !== restoreFocusRef.current) return;
      if (!ownsSurfaceKeyboard(root, active)) return;
      const initialCommand = visibleFocusableElements(root).find((element) => (
        element.tagName === "BUTTON" && element.closest("[data-command-available='true']")
        && ownsSurfaceKeyboard(root, element)
      ));
      // 처음 선택한 도구도 화면 밖에 숨지 않도록 기본 초점 스크롤을 허용한다.
      (initialCommand ?? root).focus();
    }, 0);
    return () => {
      globalThis.clearTimeout(timer);
      const restoreTarget = restoreFocusRef.current;
      const active = ownerDocument.activeElement;
      const focusStillOwned = active === null || active === ownerDocument.body
        || (mountedSurface?.contains(active) ?? false);
      // 사용자가 다른 화면을 조작 중이면 복귀시키지 않는다. 정상 닫기의 캔버스 스크롤은 보존한다.
      if (focusStillOwned && restoreTarget && isAvailableFocusTarget(restoreTarget)) {
        restoreTarget.focus({ preventScroll: true });
      }
      restoreFocusRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    function trapMobileFocus(event: globalThis.KeyboardEvent): void {
      const root = surfaceRef.current;
      if (event.key !== "Tab" || !root || studioQuickAccessKeyboardClaimed(event)
        || event.altKey || event.ctrlKey || event.metaKey
        || !ownsSurfaceKeyboard(root, event.target)) return;
      const focusable = visibleFocusableElements(root);
      const active = root.ownerDocument.activeElement;
      const next = studioQuickAccessTabBoundary(
        focusable.length, focusable.findIndex((element) => element === active), event.shiftKey,
      );
      if (next === null) return;
      event.preventDefault();
      // Tab 경계 이동은 대상 도구가 보이도록 기본 스크롤을 허용한다. 닫기 복귀의 스크롤 보존은 유지한다.
      (next < 0 ? root : focusable[next] ?? root).focus();
    }
    document.addEventListener("keydown", trapMobileFocus);
    return () => document.removeEventListener("keydown", trapMobileFocus);
  }, [isMobile]);

  useEffect(() => {
    function handleSurfaceShortcut(event: globalThis.KeyboardEvent): void {
      if (studioQuickAccessKeyboardClaimed(event)) return;
      const root = surfaceRef.current;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!root || !target || !root.contains(target) || !ownsSurfaceKeyboard(root, target)) return;
      if (
        event.code === "KeyQ"
        && event.shiftKey
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && !event.repeat
        && !isTypingTarget(target)
      ) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      // Customization and active floating-window interactions own Escape first.
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (hasActiveFloatingInteraction(surfaceRef.current)) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", handleSurfaceShortcut);
    return () => document.removeEventListener("keydown", handleSurfaceShortcut);
  }, [onClose]);

  return { descriptionId, surfaceRef } as const;
}
