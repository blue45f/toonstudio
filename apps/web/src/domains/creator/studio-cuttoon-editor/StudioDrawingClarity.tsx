import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { studioDrawingClarityEligible } from "./StudioDrawingClarityPolicy";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";
import { defaultStudioAppSettings } from "../studio-app-settings";
import { projectStudioTaskAppSettings } from "../studio-task-tools";
import { parseStudioWorkspaceRoute } from "../studio-workspace-route";

import { DrawingClarityContext, type StudioDrawingClarityPanel } from "./StudioDrawingClarityContext";

export type StudioDrawingClaritySession = Pick<StudioCuttoonEditorViewSession,
  "currentWorkspaceOwnerScope" | "isMobile" | "workspaceState" | "workMode" | "canvasOnlyMode" | "mobileImmersive"
  | "uiDensityMode" | "studioDrawingClarityBaseline" | "location" | "appSettings">
  & { readonly studioMenubarContentHandlers: Pick<StudioCuttoonEditorViewSession["studioMenubarContentHandlers"], "setStudioUiDensity"> };

function hasVisibleDialog() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],dialog[open]'))
    .some((node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden");
}

/** Capacitor가 제공한 플랫폼 신호만 읽고 모바일 웹·설치형 웹은 추측하지 않는다. */
function isNativeStudioShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const bridge: unknown = Reflect.get(window, "Capacitor");
    if (!bridge || typeof bridge !== "object") return false;
    const isNative: unknown = Reflect.get(bridge, "isNativePlatform");
    if (typeof isNative === "function") return Reflect.apply(isNative, bridge, []) === true;
    const getPlatform: unknown = Reflect.get(bridge, "getPlatform");
    const platform: unknown = typeof getPlatform === "function" ? Reflect.apply(getPlatform, bridge, []) : null;
    return platform === "android" || platform === "ios";
  } catch {
    // 브리지를 읽을 수 없어도 기존 웹 작업 흐름을 중단하지 않는다.
    return false;
  }
}

/** 원고·저장 설정을 복제하지 않는 세션 한정 화면 선택과 도구함 상태다. */
export function StudioDrawingClarityProvider({ session: s, presentation = "integrated", children }: {
  readonly session: StudioDrawingClaritySession;
  readonly presentation?: "integrated" | "app";
  readonly children: ReactNode;
}) {
  const [choice, setChoice] = useState<{ owner: string; workspace: string; simple: boolean } | null>(null);
  const [opened, setOpened] = useState<{ owner: string; workspace: string; panel: StudioDrawingClarityPanel } | null>(null);
  const owner = s.currentWorkspaceOwnerScope;
  const triggerRef = useRef<HTMLElement | null>(null);
  const route = parseStudioWorkspaceRoute(s.location);
  const available = !isNativeStudioShell() && presentation === "integrated" && route.valid && ["canvas", "comic"].includes(route.surface)
    && (!s.workMode || ["all", "draw", "color"].includes(s.workMode));
  const expectedToolbar = projectStudioTaskAppSettings(defaultStudioAppSettings(), route.valid ? route.documentWorkspace : null, s.uiDensityMode).toolbar;
  const toolbar = s.appSettings.toolbar;
  const personalToolbar = toolbar.configured === true || toolbar.view !== expectedToolbar.view || (toolbar.profiles?.length ?? 0) > 0
    || (toolbar.activeProfileId ?? null) !== null || toolbar.visibleIds.length !== expectedToolbar.visibleIds.length
    || toolbar.visibleIds.some((id, index) => id !== expectedToolbar.visibleIds[index]);
  const workspace = s.workspaceState.activeWorkspaceId;
  const selected = choice?.owner === owner && choice.workspace === workspace ? choice.simple : undefined;
  const active = available && !s.canvasOnlyMode && (!s.mobileImmersive || s.isMobile) && s.uiDensityMode === "simple"
    && (selected ?? (s.workspaceState.activeWorkspaceId === s.studioDrawingClarityBaseline?.state.activeWorkspaceId && studioDrawingClarityEligible({
      baseline: s.studioDrawingClarityBaseline, ownerScope: owner, densityMode: s.uiDensityMode,
      workMode: s.workMode, search: s.location.search, toolbarConfigured: personalToolbar,
    })));
  const panel = active && opened?.owner === owner && opened.workspace === workspace ? opened.panel : null;
  const close = useCallback(() => {
    setOpened(null);
    const trigger = triggerRef.current;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }, []);
  const open = useCallback((next: StudioDrawingClarityPanel, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setOpened((previous) => previous?.owner === owner && previous.workspace === workspace && previous.panel === next ? null : { owner, workspace, panel: next });
  }, [owner, workspace]);
  const reveal = useCallback((next: StudioDrawingClarityPanel, trigger: HTMLElement) => {
    triggerRef.current = trigger; setOpened({ owner, workspace, panel: next });
  }, [owner, workspace]);
  const setDensity = s.studioMenubarContentHandlers.setStudioUiDensity;
  const chooseSimple = useCallback(() => {
    setDensity?.("simple"); setChoice({ owner, workspace, simple: true });
    globalThis.requestAnimationFrame?.(() => document.getElementById("studio-canvas-workspace")?.focus({ preventScroll: true }));
  }, [owner, workspace, setDensity]);
  const showSavedLayout = useCallback(() => {
    setOpened(null); setChoice({ owner, workspace, simple: false });
    globalThis.requestAnimationFrame?.(() => { if (!hasVisibleDialog()) document.querySelector<HTMLElement>("[data-studio-clarity-entry]")?.focus({ preventScroll: true }); });
  }, [owner, workspace]);

  useEffect(() => {
    if (!panel) return;
    const targetId = `studio-drawing-clarity-panel-${panel}`;
    const focus = () => {
      const target = document.getElementById(targetId)?.querySelector<HTMLElement>("[data-clarity-pane-heading]");
      if (!target) return false;
      if (!hasVisibleDialog()) target.focus({ preventScroll: true });
      return true;
    };
    const observer = focus() ? null : new MutationObserver(() => { if (focus()) observer?.disconnect(); });
    observer?.observe(document.body, { childList: true, subtree: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || hasVisibleDialog()) return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener("keydown", escape);
    return () => { observer?.disconnect(); document.removeEventListener("keydown", escape); };
  }, [panel, close]);

  return <DrawingClarityContext.Provider value={{ active, available, panel, open, reveal, close, chooseSimple, showSavedLayout }}>{children}</DrawingClarityContext.Provider>;
}

