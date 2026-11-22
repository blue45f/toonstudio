import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { studioDrawingAssistHasContent } from "../brush/studio-drawing-assist-document";
import {
  requireStudioDrawingPointerTransport,
  type StudioDrawingPointerTransport,
} from "../brush/studio-drawing-pointer-transport";
import { CANVAS_W } from "../studio-assets";
import type { StudioCharacterBible } from "../studio-character-bible";
import type { El } from "../studio-element-model";
import type { DocumentMaster } from "../studio-master-page";
import { STUDIO_SERVER_AUTOSAVE_IDLE_MS } from "../studio-page-editor-runtime-contracts";
import type { PageState } from "../studio-page-state";
import {
  planStudioScrollViewportCommit,
  STUDIO_SCROLL_VIEWPORT_SETTLE_MS,
  studioScrollViewportsEqual,
  type StudioScrollViewport,
  type StudioScrollViewportStore,
} from "../studio-scroll-viewport-store";

export function bindStudioScrollViewportCommitRefs({
  pendingScrollCommitRef, scrollCommitSettleTimerRef, flushScrollViewportCommitRef,
  updateScrollPosRef, scrollRafRef, wrapRef, scrollViewportStore, scrollPosRef, setScrollPos,
}: {
  readonly pendingScrollCommitRef: MutableRefObject<StudioScrollViewport | null>;
  readonly scrollCommitSettleTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  readonly flushScrollViewportCommitRef: MutableRefObject<() => void>;
  readonly updateScrollPosRef: MutableRefObject<() => void>;
  readonly scrollRafRef: MutableRefObject<number | null>;
  readonly wrapRef: MutableRefObject<HTMLDivElement | null>;
  readonly scrollViewportStore: StudioScrollViewportStore;
  readonly scrollPosRef: MutableRefObject<StudioScrollViewport>;
  readonly setScrollPos: Dispatch<SetStateAction<StudioScrollViewport>>;
}): void {
  const commitScrollViewport = (next: StudioScrollViewport) => {
    pendingScrollCommitRef.current = null;
    if (scrollCommitSettleTimerRef.current !== null) {
      globalThis.clearTimeout(scrollCommitSettleTimerRef.current);
      scrollCommitSettleTimerRef.current = null;
    }
    setScrollPos((prev) => (studioScrollViewportsEqual(prev, next) ? prev : next));
  };
  flushScrollViewportCommitRef.current = () => {
    const pending = pendingScrollCommitRef.current;
    if (!pending) return;
    commitScrollViewport(pending);
  };
  updateScrollPosRef.current = () => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = globalThis.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const next: StudioScrollViewport = {
        left: wrap.scrollLeft,
        top: wrap.scrollTop,
        width: wrap.clientWidth,
        height: wrap.clientHeight,
        scrollWidth: wrap.scrollWidth,
        scrollHeight: wrap.scrollHeight,
      };
      scrollViewportStore.publish(next);
      const mode = planStudioScrollViewportCommit(scrollPosRef.current, next);
      if (mode === "none") {
        pendingScrollCommitRef.current = null;
        return;
      }
      if (mode === "immediate") {
        commitScrollViewport(next);
        return;
      }
      pendingScrollCommitRef.current = next;
      if (scrollCommitSettleTimerRef.current !== null) {
        globalThis.clearTimeout(scrollCommitSettleTimerRef.current);
      }
      scrollCommitSettleTimerRef.current = globalThis.setTimeout(
        () => flushScrollViewportCommitRef.current(),
        STUDIO_SCROLL_VIEWPORT_SETTLE_MS,
      );
    });
  };
}

export function runStudioServerAutosaveIdleEffect({
  workId, hasSharedDocument, loggedIn, collaborationDocumentLocked, workHydrated,
  title, pages, master, characterBible, documentSaveInFlightRef, drawingRef,
  drawingPointerTransportRef, handleSaveRef,
}: {
  readonly workId: string | null;
  readonly hasSharedDocument: boolean;
  readonly loggedIn: boolean;
  readonly collaborationDocumentLocked: boolean;
  readonly workHydrated: boolean;
  readonly title: string;
  readonly pages: readonly PageState[];
  readonly master: DocumentMaster<El>;
  readonly characterBible: StudioCharacterBible;
  readonly documentSaveInFlightRef: MutableRefObject<boolean>;
  readonly drawingRef: MutableRefObject<unknown>;
  readonly drawingPointerTransportRef: MutableRefObject<StudioDrawingPointerTransport | null>;
  readonly handleSaveRef: MutableRefObject<(status: "draft" | "published") => Promise<unknown>>;
}): (() => void) | undefined {
  if (!workId || hasSharedDocument || !loggedIn || collaborationDocumentLocked || !workHydrated || !title.trim()) {
    return undefined;
  }
  const hasContent =
    pages.some((p) => p.elements.length > 0)
    || pages.some((p) => studioDrawingAssistHasContent(p.drawingAssist, {
      canvasWidth: CANVAS_W,
      canvasHeight: p.canvasH,
    }))
    || master.elements.length > 0
    || characterBible.characters.length > 0;
  if (!hasContent) return undefined;
  const timer = setTimeout(() => {
    if (documentSaveInFlightRef.current) return;
    if (drawingRef.current || requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession()) return;
    void handleSaveRef.current("draft");
  }, STUDIO_SERVER_AUTOSAVE_IDLE_MS);
  return () => clearTimeout(timer);
}

export function runStudioToggleFullscreen({
  studioRootRef, setCanvasOnlyMode, announceDrawingShortcut,
}: {
  readonly studioRootRef: MutableRefObject<HTMLDivElement | null>;
  readonly setCanvasOnlyMode: Dispatch<SetStateAction<boolean>>;
  readonly announceDrawingShortcut: (message: string) => void;
}): void {
  if (typeof document === "undefined") return;
  setCanvasOnlyMode(false);
  const operation = document.fullscreenElement
    ? document.exitFullscreen?.()
    : studioRootRef.current?.requestFullscreen?.();
  void operation?.catch(() => {
    announceDrawingShortcut("브라우저에서 전체화면을 허용하지 않았습니다");
  });
}

export function runStudioEnterCanvasOnlyMode({
  setIsFullscreen, setMaximized, setMenu, setMobileSheet, setQuickActionsOpen, setCanvasOnlyMode,
}: {
  readonly setIsFullscreen: Dispatch<SetStateAction<boolean>>;
  readonly setMaximized: Dispatch<SetStateAction<boolean>>;
  readonly setMenu: (next: null) => void;
  readonly setMobileSheet: (next: null) => void;
  readonly setQuickActionsOpen: Dispatch<SetStateAction<boolean>>;
  readonly setCanvasOnlyMode: Dispatch<SetStateAction<boolean>>;
}): void {
  if (typeof document !== "undefined" && document.fullscreenElement) {
    void document.exitFullscreen?.();
    setIsFullscreen(false);
  }
  setMaximized(false);
  setMenu(null);
  setMobileSheet(null);
  setQuickActionsOpen(false);
  setCanvasOnlyMode(true);
}
