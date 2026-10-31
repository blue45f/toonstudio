import { useEffect, useId, useRef } from "react";

import {
  compareStudioQuickAccessTabOrder,
  studioQuickAccessKeyboardClaimed,
  studioQuickAccessTabBoundary,
} from "./studio-quick-access-keyboard";

/** 실제 Tab 후보를 모은다. 접힌·비활성·inert 영역은 이동 대상이 아니다. */
function visibleFocusableElements(root: HTMLElement): HTMLElement[] {
  const visible = [...root.querySelectorAll<HTMLElement>([
    "button", "a[href]", "area[href]", "input:not([type='hidden'])", "select",
    "textarea", "summary", "[tabindex]", "[contenteditable]", "audio[controls]", "video[controls]",
  ].join(","))].filter((element) => {
    if (element.tabIndex < 0 || element.matches(":disabled")
      || element.closest("[hidden], [inert], [aria-hidden='true']")
      || element.getClientRects().length === 0) return false;
    const visibility = root.ownerDocument.defaultView?.getComputedStyle(element).visibility;
    return visibility !== "hidden" && visibility !== "collapse";
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
    const activeElement = document.activeElement;
    restoreFocusRef.current = activeElement instanceof HTMLElement
      ? activeElement
      : null;
    const timer = globalThis.setTimeout(() => {
      const initialCommand = surfaceRef.current?.querySelector<HTMLElement>(
        "[data-command-available='true'] button:not([disabled])",
      );
      (initialCommand ?? surfaceRef.current)?.focus({ preventScroll: true });
    }, 0);
    return () => {
      globalThis.clearTimeout(timer);
      const restoreTarget = restoreFocusRef.current;
      if (restoreTarget?.isConnected && !restoreTarget.closest("[inert]")) {
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
        || root.closest("[inert], [hidden], [aria-hidden='true']")) return;
      // 위에 열린 별도 모달의 키 처리를 빼앗지 않는다.
      const modal = event.target instanceof Element
        ? event.target.closest("[role='dialog'][aria-modal='true'], dialog[open]") : null;
      if (modal && modal !== root) return;
      const focusable = visibleFocusableElements(root);
      const active = root.ownerDocument.activeElement;
      const next = studioQuickAccessTabBoundary(
        focusable.length, focusable.findIndex((element) => element === active), event.shiftKey,
      );
      if (next === null) return;
      event.preventDefault();
      (next < 0 ? root : focusable[next] ?? root).focus({ preventScroll: true });
    }
    document.addEventListener("keydown", trapMobileFocus);
    return () => document.removeEventListener("keydown", trapMobileFocus);
  }, [isMobile]);

  useEffect(() => {
    function handleSurfaceShortcut(event: globalThis.KeyboardEvent): void {
      if (studioQuickAccessKeyboardClaimed(event)) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target || !surfaceRef.current?.contains(target)) return;
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
