import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { isImeKeyboardEvent } from "@/shared/lib/palette-ime-guard";

import {
  isUntouchedStudioDrawingLayout,
  loadStudioDrawingClarityChoice,
  loadStudioDrawingClarityKnownOwnerState,
  saveStudioDrawingClarityChoice,
  saveStudioDrawingClarityKnownOwnerState,
  studioDrawingClarityEligible,
  studioDrawingRoleRequiresLayout,
  studioDrawingRouteUsesClarity,
  type StudioDrawingClarityBaseline,
  type StudioDrawingClarityStorage,
} from "./StudioDrawingClarityPolicy";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";
import { defaultStudioAppSettings } from "../studio-app-settings";
import { readStudioLaunchDensity } from "../studio-launch-mode";
import { projectStudioTaskAppSettings } from "../studio-task-tools";
import { parseStudioWorkspaceRoute } from "../studio-workspace-route";

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

/** 원고·저장 설정을 복제하지 않는 화면 선택과 도구함 상태다. choiceStorage 주입 시 새로고침·다중 탭에서도 동일 디자인을 유지한다. */
export function StudioDrawingClarityProvider({
  session: s,
  presentation = "integrated",
  choiceStorage = null,
  children,
}: {
  readonly session: StudioDrawingClaritySession;
  readonly presentation?: "integrated" | "app";
  readonly choiceStorage?: StudioDrawingClarityStorage | null;
  readonly children: ReactNode;
}) {
  const [choice, setChoice] = useState<{ owner: string; workspace: string; simple: boolean } | null>(null);
  const [selectionHost, setSelectionHost] = useState<HTMLDivElement | null>(null);
  const compactViewport = useMediaQuery("(max-width: 1279px)");
  const viewportBucket = compactViewport ? "compact" : "large";
  const [openedByBucket, setOpenedByBucket] = useState<{
    compact: { owner: string; workspace: string; panel: StudioDrawingClarityPanel } | null;
    large: { owner: string; workspace: string; panel: StudioDrawingClarityPanel } | null;
  }>({ compact: null, large: null });
  const owner = s.currentWorkspaceOwnerScope;
  const triggerRef = useRef<HTMLElement | null>(null);
  const route = parseStudioWorkspaceRoute(s.location);
  const drawingSurface = route.valid && (route.surface === "canvas" || route.surface === "comic");
  const editorPresentation = drawingSurface ? "integrated" : presentation;
  const documentWorkspace = route.valid ? route.documentWorkspace ?? (route.surface === "comic" ? "comic" : "draw") : null;
  const roleWorkspace = studioDrawingRoleRequiresLayout(s.location.search, documentWorkspace);
  const available = drawingSurface && !roleWorkspace
    && (!s.workMode || ["all", "draw", "color"].includes(s.workMode));
  const expectedToolbar = projectStudioTaskAppSettings(defaultStudioAppSettings(), route.valid ? route.documentWorkspace : null, s.uiDensityMode).toolbar;
  const toolbar = s.appSettings.toolbar;
  const personalToolbar = toolbar.configured === true || toolbar.view !== expectedToolbar.view || (toolbar.profiles?.length ?? 0) > 0
    || (toolbar.activeProfileId ?? null) !== null || toolbar.visibleIds.length !== expectedToolbar.visibleIds.length
    || toolbar.visibleIds.some((id, index) => id !== expectedToolbar.visibleIds[index]);
  const workspace = s.workspaceState.activeWorkspaceId;
  const persistedSelected = loadStudioDrawingClarityChoice(choiceStorage, owner, workspace);
  const selected = choice?.owner === owner && choice.workspace === workspace
    ? choice.simple
    : persistedSelected;
  const knownOwnerKind = loadStudioDrawingClarityKnownOwnerState(choiceStorage, owner);
  const optimisticBaseline: StudioDrawingClarityBaseline | null =
    choiceStorage && s.studioDrawingClarityBaseline === null && knownOwnerKind !== "saved"
      ? { ownerScope: owner, source: "default", state: s.workspaceState }
      : null;
  const effectiveBaseline = s.studioDrawingClarityBaseline ?? optimisticBaseline;
  const active = available && !s.canvasOnlyMode && (!s.mobileImmersive || s.isMobile)
    && studioDrawingRouteUsesClarity(s.uiDensityMode, s.location.search, documentWorkspace)
    && (selected ?? (s.workspaceState.activeWorkspaceId === effectiveBaseline?.state.activeWorkspaceId && studioDrawingClarityEligible({
      baseline: effectiveBaseline, documentWorkspace, ownerScope: owner, densityMode: s.uiDensityMode,
      workMode: s.workMode, search: s.location.search, toolbarConfigured: personalToolbar,
    })));
  useEffect(() => {
    const confirmed = s.studioDrawingClarityBaseline;
    if (!choiceStorage || !confirmed || confirmed.ownerScope !== owner) return;
    const isDefaultUntouched =
      confirmed.source === "default"
      && confirmed.state.customWorkspaces.length === 0
      && isUntouchedStudioDrawingLayout(confirmed.state);
    saveStudioDrawingClarityKnownOwnerState(
      choiceStorage,
      owner,
      isDefaultUntouched ? "default" : "saved",
    );
  }, [choiceStorage, owner, s.studioDrawingClarityBaseline]);
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
  const setDensity = s.studioMenubarContentHandlers.setStudioUiDensity;
  const { location, navigate } = s;
  const chooseSimple = useCallback(() => {
    const launch = readStudioLaunchDensity(location.search);
    if (!studioDrawingRouteUsesClarity("simple", location.search, documentWorkspace) && navigate) {
      const params = new URLSearchParams(location.search);
      params.set("uiMode", "basic");
      navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true, state: location.state });
    } else setDensity?.(launch === "focus" ? "focus" : "simple");
    setChoice({ owner, workspace, simple: true });
    saveStudioDrawingClarityChoice(choiceStorage, owner, workspace, true);
    globalThis.requestAnimationFrame?.(() => document.getElementById("studio-canvas-workspace")?.focus({ preventScroll: true }));
  }, [choiceStorage, owner, workspace, documentWorkspace, setDensity, location, navigate]);
  const showSavedLayout = useCallback(() => {
    setOpenedByBucket({ compact: null, large: null });
    setChoice({ owner, workspace, simple: false });
    saveStudioDrawingClarityChoice(choiceStorage, owner, workspace, false);
    globalThis.requestAnimationFrame?.(() => { if (!hasVisibleDialog()) document.querySelector<HTMLElement>("[data-studio-clarity-entry]")?.focus({ preventScroll: true }); });
  }, [choiceStorage, owner, workspace]);

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
      if (event.key !== "Escape" || event.defaultPrevented || isImeKeyboardEvent(event) || hasVisibleDialog()) return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener("keydown", escape);
    return () => { observer?.disconnect(); document.removeEventListener("keydown", escape); };
  }, [panel, close]);

  return <DrawingClarityContext.Provider value={{ active, available, presentation: editorPresentation, selectionHost, setSelectionHost, panel, open, reveal, close, chooseSimple, showSavedLayout }}>{children}</DrawingClarityContext.Provider>;
}

