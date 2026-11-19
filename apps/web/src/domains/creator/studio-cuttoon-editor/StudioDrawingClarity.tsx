import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { isImeKeyboardEvent } from "@/shared/lib/palette-ime-guard";

import { isStudioDrawingEditorRoute, type StudioDrawingClarityStorage } from "./StudioDrawingClarityPolicy";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

import { DrawingClarityContext, type StudioDrawingClarityPanel } from "./StudioDrawingClarityContext";

export type StudioDrawingClaritySession = Pick<StudioCuttoonEditorViewSession,
  "currentWorkspaceOwnerScope" | "isMobile" | "workspaceState" | "workMode" | "canvasOnlyMode" | "mobileImmersive"
  | "uiDensityMode" | "studioDrawingClarityBaseline" | "location" | "appSettings">
  & {
    readonly navigate?: StudioCuttoonEditorViewSession["navigate"];
    readonly pendingSaveIntent?: StudioCuttoonEditorViewSession["pendingSaveIntent"];
    readonly studioMenubarContentHandlers: Pick<StudioCuttoonEditorViewSession["studioMenubarContentHandlers"], "setStudioUiDensity">;
  };

function hasVisibleDialog() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],dialog[open]'))
    .some((node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden");
}

/** 원고는 작업 단계와 저장된 배치에 관계없이 같은 셸을 사용한다. 열린 패널만 화면 크기별로 기억한다. */
export function StudioDrawingClarityProvider({
  session: s,
  presentation = "integrated",
  children,
}: {
  readonly session: StudioDrawingClaritySession;
  readonly presentation?: "integrated" | "app";
  readonly choiceStorage?: StudioDrawingClarityStorage | null;
  readonly children: ReactNode;
}) {
  const [selectionHost, setSelectionHost] = useState<HTMLDivElement | null>(null);
  const compactViewport = useMediaQuery("(max-width: 1279px)");
  const viewportBucket = compactViewport ? "compact" : "large";
  const [openedByBucket, setOpenedByBucket] = useState<{
    compact: { owner: string; workspace: string; panel: StudioDrawingClarityPanel } | null;
    large: { owner: string; workspace: string; panel: StudioDrawingClarityPanel } | null;
  }>({ compact: null, large: null });
  const owner = s.currentWorkspaceOwnerScope;
  const triggerRef = useRef<HTMLElement | null>(null);
  const available = isStudioDrawingEditorRoute(s.location);
  const editorPresentation = available ? "integrated" : presentation;
  const active = available && !s.canvasOnlyMode && (!s.mobileImmersive || s.isMobile);
  const workspace = s.workspaceState.activeWorkspaceId;
  const opened = openedByBucket[viewportBucket];
  const panel = active && opened?.owner === owner && opened.workspace === workspace ? opened.panel : null;
  const close = useCallback(() => {
    setOpenedByBucket((previous) => (previous[viewportBucket] === null ? previous : { ...previous, [viewportBucket]: null }));
    const trigger = triggerRef.current;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }, [viewportBucket]);
  const open = useCallback((next: StudioDrawingClarityPanel, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setOpenedByBucket((previous) => {
      const current = previous[viewportBucket];
      const nextEntry = current?.owner === owner && current.workspace === workspace && current.panel === next
        ? null
        : { owner, workspace, panel: next };
      return { ...previous, [viewportBucket]: nextEntry };
    });
  }, [owner, viewportBucket, workspace]);
  const reveal = useCallback((next: StudioDrawingClarityPanel, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setOpenedByBucket((previous) => ({ ...previous, [viewportBucket]: { owner, workspace, panel: next } }));
  }, [owner, viewportBucket, workspace]);
  const prevPendingSaveKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const nextIntent = s.pendingSaveIntent ?? null;
    const nextKey = active && !s.isMobile && nextIntent ? `${owner}:${workspace}:${viewportBucket}:${nextIntent}` : null;
    if (prevPendingSaveKeyRef.current === nextKey) return;
    prevPendingSaveKeyRef.current = nextKey;
    if (!nextKey) return;
    const saveTrigger = document.querySelector<HTMLElement>('[data-studio-clarity-save="true"]');
    if (saveTrigger) triggerRef.current = saveTrigger;
    setOpenedByBucket((previous) => ({ ...previous, [viewportBucket]: { owner, workspace, panel: "layers" } }));
  }, [active, owner, s.isMobile, s.pendingSaveIntent, viewportBucket, workspace]);
  const chooseSimple = useCallback(() => {
    close();
    document.getElementById("studio-canvas-workspace")?.focus({ preventScroll: true });
  }, [close]);
  const showSavedLayout = useCallback(() => {
    const trigger = document.querySelector<HTMLElement>("[data-studio-clarity-more-trigger]")
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : document.body);
    reveal("commands", trigger);
  }, [reveal]);

  useEffect(() => {
    if (!panel) return;
    const targetId = `studio-drawing-clarity-panel-${panel}`;
    const focus = () => {
      const pane = document.getElementById(targetId);
      if (pane && document.activeElement instanceof Node && pane.contains(document.activeElement)) return true;
      const target = pane?.querySelector<HTMLElement>("[data-clarity-pane-heading]");
      if (!target) return false;
      if (!hasVisibleDialog()) target.focus({ preventScroll: true });
      return true;
    };
    const observer = focus() ? null : new MutationObserver(() => { if (focus()) observer?.disconnect(); });
    observer?.observe(document.body, { childList: true, subtree: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || isImeKeyboardEvent(event) || hasVisibleDialog() || document.querySelector('[data-studio-main-menu-panel="true"]')) return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener("keydown", escape);
    return () => { observer?.disconnect(); document.removeEventListener("keydown", escape); };
  }, [panel, close]);

  return <DrawingClarityContext.Provider value={{ active, available, presentation: editorPresentation, selectionHost, setSelectionHost, panel, open, reveal, close, chooseSimple, showSavedLayout }}>{children}</DrawingClarityContext.Provider>;
}

