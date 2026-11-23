import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, MutableRefObject, RefObject, SetStateAction } from "react";
import { CANVAS_W } from "../studio-assets";
import { preloadStudioAssetMenuPanel } from "../studio-page-lazy-ui";
import { isStudioViewToolsHudEventTarget } from "../studio-page-shell-runtime";
import {
  planStudioViewRestore,
  type StudioViewRotation,
  type StudioViewSnapshot,
} from "../studio-view-controls";
import {
  computeStudioMinimapClickScrollTarget,
  resolveStudioMinimapArrowScrollDelta,
} from "./studio-host-view-and-resize-helpers";

export function runStudioMobileKeyboardInsetEffect(
  isMobile: boolean,
  setMobileKeyboardInset: Dispatch<SetStateAction<number>>,
): (() => void) | undefined {
  if (!isMobile || !globalThis.visualViewport) {
    setMobileKeyboardInset(0);
    return undefined;
  }
  const viewport = globalThis.visualViewport;
  const updateInset = () => {
    const occluded = Math.max(
      0,
      globalThis.innerHeight - viewport.height - viewport.offsetTop,
    );
    setMobileKeyboardInset(occluded >= 80 ? Math.round(occluded) : 0);
  };
  updateInset();
  viewport.addEventListener("resize", updateInset);
  viewport.addEventListener("scroll", updateInset);
  return () => {
    viewport.removeEventListener("resize", updateInset);
    viewport.removeEventListener("scroll", updateInset);
  };
}

export function runStudioCloseViewToolWithFocus({
  options = {}, wrapRef, lastNonViewHudFocusRef, viewTool, setViewTool,
}: {
  readonly options?: { preferCanvas?: boolean };
  readonly wrapRef: RefObject<HTMLDivElement | null>;
  readonly lastNonViewHudFocusRef: MutableRefObject<HTMLElement | null>;
  readonly viewTool: "zoom" | "rotate" | null;
  readonly setViewTool: Dispatch<SetStateAction<"zoom" | "rotate" | null>>;
}): void {
  const activeElement = document.activeElement;
  const focusOwnedByHud = activeElement instanceof HTMLElement
    && activeElement.closest("[data-studio-view-tools-hud]") !== null;
  const canvas = wrapRef.current
    ?? document.querySelector<HTMLElement>("[data-studio-canvas-viewport]");
  const remembered = lastNonViewHudFocusRef.current;
  const rememberedAvailable = remembered?.isConnected
    && remembered.closest('[aria-disabled="true"], [inert], [hidden]') === null;
  const currentModeTrigger = viewTool
    ? document.querySelector<HTMLElement>(`[data-studio-view-tool-trigger="${viewTool}"]`)
    : null;
  const triggerAvailable = currentModeTrigger?.isConnected
    && currentModeTrigger.closest('[aria-disabled="true"], [inert], [hidden]') === null;
  const restoreTarget = options.preferCanvas
    ? canvas
    : rememberedAvailable
      ? remembered
      : triggerAvailable
        ? currentModeTrigger
        : canvas;

  setViewTool(null);
  if (!focusOwnedByHud || !restoreTarget) return;
  globalThis.requestAnimationFrame(() => restoreTarget.focus({ preventScroll: true }));
}

export function runStudioViewRestoreEffect({
  viewTransformSuppressed, captureSuppressedViewRef, wrapRef, activePageId, canvasH, updateScrollPosRef,
}: {
  readonly viewTransformSuppressed: boolean;
  readonly captureSuppressedViewRef: MutableRefObject<StudioViewSnapshot | null>;
  readonly wrapRef: RefObject<HTMLDivElement | null>;
  readonly activePageId: string;
  readonly canvasH: number;
  readonly updateScrollPosRef: MutableRefObject<() => void>;
}): void {
  if (viewTransformSuppressed) return;
  const snapshot = captureSuppressedViewRef.current;
  const wrap = wrapRef.current;
  if (!snapshot || !wrap) return;
  const restored = planStudioViewRestore({
    snapshot,
    pageId: activePageId,
    viewportWidth: wrap.clientWidth,
    viewportHeight: wrap.clientHeight,
    canvasWidth: CANVAS_W,
    canvasHeight: canvasH,
  });
  if (!restored) return;
  captureSuppressedViewRef.current = null;
  wrap.scrollLeft = restored.scrollLeft;
  wrap.scrollTop = restored.scrollTop;
  updateScrollPosRef.current();
}

export function runStudioMutationScopeResetEffect({
  previousMutationScopeRef, mutationScopeKey, sharedDocumentSaveAbortRef,
  sharedDocumentRestoreAbortRef, ownerDetailAbortRef, documentRevalidateAbortRef,
  serverRevisionAbortRef, serverRevisionRequestRef, documentSaveInFlightRef,
  setSaving, setIsExporting, setServerRevisionLoading, setFxPanelLoading,
}: {
  readonly previousMutationScopeRef: MutableRefObject<string>;
  readonly mutationScopeKey: string;
  readonly sharedDocumentSaveAbortRef: MutableRefObject<AbortController | null>;
  readonly sharedDocumentRestoreAbortRef: MutableRefObject<AbortController | null>;
  readonly ownerDetailAbortRef: MutableRefObject<AbortController | null>;
  readonly documentRevalidateAbortRef: MutableRefObject<AbortController | null>;
  readonly serverRevisionAbortRef: MutableRefObject<AbortController | null>;
  readonly serverRevisionRequestRef: MutableRefObject<number>;
  readonly documentSaveInFlightRef: MutableRefObject<boolean>;
  readonly setSaving: Dispatch<SetStateAction<boolean>>;
  readonly setIsExporting: Dispatch<SetStateAction<boolean>>;
  readonly setServerRevisionLoading: Dispatch<SetStateAction<boolean>>;
  readonly setFxPanelLoading: Dispatch<SetStateAction<boolean>>;
}): void {
  if (previousMutationScopeRef.current === mutationScopeKey) return;
  previousMutationScopeRef.current = mutationScopeKey;
  sharedDocumentSaveAbortRef.current?.abort();
  sharedDocumentRestoreAbortRef.current?.abort();
  ownerDetailAbortRef.current?.abort();
  documentRevalidateAbortRef.current?.abort();
  serverRevisionAbortRef.current?.abort();
  serverRevisionRequestRef.current += 1;
  documentSaveInFlightRef.current = false;
  setSaving(false);
  setIsExporting(false);
  setServerRevisionLoading(false);
  setFxPanelLoading(false);
}

export function buildStudioWrapPanAndMinimapHandlers({
  isSpacePressed, tool, isPanning, setIsPanning, wrapRef, panStartRef,
  flushScrollViewportCommitRef, canvasH, canvasFlipH, canvasRotation, effScale, updateScrollPos,
}: {
  readonly isSpacePressed: boolean;
  readonly tool: string;
  readonly isPanning: boolean;
  readonly setIsPanning: Dispatch<SetStateAction<boolean>>;
  readonly wrapRef: RefObject<HTMLDivElement | null>;
  readonly panStartRef: MutableRefObject<{ scrollLeft: number; scrollTop: number; clientX: number; clientY: number }>;
  readonly flushScrollViewportCommitRef: MutableRefObject<() => void>;
  readonly canvasH: number;
  readonly canvasFlipH: boolean;
  readonly canvasRotation: StudioViewRotation;
  readonly effScale: number;
  readonly updateScrollPos: () => void;
}) {
  return {
    onWrapMouseDown: (e: ReactMouseEvent) => {
      if (isStudioViewToolsHudEventTarget(e.target)) return;
      if (!isSpacePressed && tool !== "hand") return;
      setIsPanning(true);
      const wrap = wrapRef.current;
      if (!wrap) return;
      panStartRef.current = {
        scrollLeft: wrap.scrollLeft,
        scrollTop: wrap.scrollTop,
        clientX: e.clientX,
        clientY: e.clientY,
      };
    },
    onWrapMouseMove: (e: ReactMouseEvent) => {
      if (!isPanning) return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const dx = e.clientX - panStartRef.current.clientX;
      const dy = e.clientY - panStartRef.current.clientY;
      wrap.scrollLeft = panStartRef.current.scrollLeft - dx;
      wrap.scrollTop = panStartRef.current.scrollTop - dy;
    },
    onWrapMouseUp: () => {
      setIsPanning(false);
      flushScrollViewportCommitRef.current();
    },
    onMinimapClick: (e: ReactMouseEvent<HTMLDivElement>) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const target = computeStudioMinimapClickScrollTarget({
        clientX: e.clientX, clientY: e.clientY, rect: e.currentTarget.getBoundingClientRect(),
        canvasHeight: canvasH, canvasFlipH, canvasRotation, scale: effScale,
        viewportWidth: wrap.clientWidth, viewportHeight: wrap.clientHeight,
      });
      wrap.scrollLeft = target.scrollLeft;
      wrap.scrollTop = target.scrollTop;
      updateScrollPos();
    },
    onMinimapKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const delta = resolveStudioMinimapArrowScrollDelta(e.key, wrap.clientWidth, wrap.clientHeight);
      if (!delta) return;
      e.preventDefault();
      wrap.scrollLeft += delta.dx;
      wrap.scrollTop += delta.dy;
      updateScrollPos();
    },
  };
}

export function runStudioCompanionPanelCommand({
  command, setMenu, setTool, companionPendingTextTimerRef,
  setLeftPanelOpenWithOverride, companionUiRef, setStudioUiDensityFromCompanion,
  setPoserVrmOpen, setBg3dOpen, setCanvasOnlyMode,
}: {
  readonly command: string;
  readonly setMenu: (next: "template" | "bubble" | "aiAssist" | null) => void;
  readonly setTool: (next: "select") => void;
  readonly companionPendingTextTimerRef: MutableRefObject<ReturnType<typeof globalThis.setTimeout> | null>;
  readonly setLeftPanelOpenWithOverride: (open: boolean) => void;
  readonly companionUiRef: MutableRefObject<{ uiDensityMode: string; canvasOnlyMode: boolean }>;
  readonly setStudioUiDensityFromCompanion: (density: "simple") => void;
  readonly setPoserVrmOpen: Dispatch<SetStateAction<boolean>>;
  readonly setBg3dOpen: Dispatch<SetStateAction<boolean>>;
  readonly setCanvasOnlyMode: Dispatch<SetStateAction<boolean>>;
}): void {
  switch (command) {
    case "template":
      preloadStudioAssetMenuPanel();
      setMenu("template");
      break;
    case "bubble":
      setMenu("bubble");
      break;
    case "text":
      setMenu(null);
      setTool("select");
      if (companionPendingTextTimerRef.current !== null) {
        globalThis.clearTimeout(companionPendingTextTimerRef.current);
      }
      companionPendingTextTimerRef.current = globalThis.setTimeout(() => {
        companionPendingTextTimerRef.current = null;
        window.dispatchEvent(new CustomEvent("studio-companion-add-text"));
      }, 0);
      break;
    case "layers":
      setLeftPanelOpenWithOverride(true);
      if (companionUiRef.current.uiDensityMode === "focus") {
        setStudioUiDensityFromCompanion("simple");
      }
      break;
    case "ai":
      setMenu("aiAssist");
      break;
    case "3d-character":
      setPoserVrmOpen(true);
      break;
    case "3d-bg":
      setBg3dOpen(true);
      break;
    case "focus-primary":
      try {
        window.focus();
      } catch {
        // ignore
      }
      break;
    case "toggle-canvas-only":
      setCanvasOnlyMode(!companionUiRef.current.canvasOnlyMode);
      break;
    case "enter-canvas-only":
      setCanvasOnlyMode(true);
      break;
    case "exit-canvas-only":
      setCanvasOnlyMode(false);
      break;
    default:
      break;
  }
}
