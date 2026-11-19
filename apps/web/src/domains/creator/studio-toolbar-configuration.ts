import {
  DEFAULT_STUDIO_RAIL_TOOL_ORDER, normalizeStudioToolbarPreferences,
  type StudioRailToolId, type StudioToolbarPreferences, type StudioToolbarView,
} from "./studio-app-settings";
import { isStudioDrawingCoreTool, studioDrawingVisibleTools } from "./studio-drawing-core-tools";

/** 새 원고 레일에 항상 있는 작업이다. 색상과 레이어는 도구 카탈로그에 속하지 않는다. */
export const STUDIO_DRAWING_RAIL_FIXED_IDS: readonly StudioRailToolId[] = ["select", "pen", "eraser", "fill", "bubble", "comment", "bg3d"];

export function studioDrawingPinnedToolbar(toolbar: StudioToolbarPreferences): StudioToolbarPreferences {
  const saved = toolbar.configured ? toolbar.visibleIds : [];
  return { ...toolbar, configured: true, visibleIds: [...new Set([...STUDIO_DRAWING_RAIL_FIXED_IDS, ...saved])] };
}

/** 프로젝트 배치는 저장 순서를 따르고, 구성 전에는 작업 모드에서 제공하는 기본 도구를 포함한다. */
export function studioProjectRailVisibleIds(toolbar: StudioToolbarPreferences, isVisible: (id: StudioRailToolId) => boolean): StudioRailToolId[] {
  const configured = toolbar.configured === true;
  const order = [...new Set([...studioDrawingVisibleTools(toolbar.visibleIds, configured), ...DEFAULT_STUDIO_RAIL_TOOL_ORDER])];
  return order.filter(id => configured ? toolbar.visibleIds.includes(id) : isStudioDrawingCoreTool(id) || isVisible(id));
}

export function configuredStudioToolbar(toolbar: StudioToolbarPreferences): StudioToolbarPreferences {
  return { ...normalizeStudioToolbarPreferences(toolbar), configured: true,
    visibleIds: studioDrawingVisibleTools(toolbar.visibleIds, toolbar.configured === true) };
}

export function pinStudioToolbarTools(toolbar: StudioToolbarPreferences, ids: readonly StudioRailToolId[]): StudioToolbarPreferences {
  const next = configuredStudioToolbar(toolbar);
  return { ...next, activeProfileId: null, visibleIds: [...new Set([...next.visibleIds, ...ids])] };
}

export function unpinStudioToolbarTools(toolbar: StudioToolbarPreferences, ids: readonly StudioRailToolId[]): StudioToolbarPreferences {
  const next = configuredStudioToolbar(toolbar);
  const remaining = next.visibleIds.filter((id) => !ids.includes(id));
  return remaining.length ? { ...next, activeProfileId: null, visibleIds: remaining } : next;
}

export function moveStudioToolbarTool(toolbar: StudioToolbarPreferences, id: StudioRailToolId, to: number): StudioToolbarPreferences {
  const next = configuredStudioToolbar(toolbar);
  if (!next.visibleIds.includes(id)) return next;
  const ids = next.visibleIds.filter((item) => item !== id);
  ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
  return { ...next, activeProfileId: null, visibleIds: ids };
}

export function pinAllStudioToolbarTools(toolbar: StudioToolbarPreferences): StudioToolbarPreferences {
  return pinStudioToolbarTools(toolbar, DEFAULT_STUDIO_RAIL_TOOL_ORDER);
}

export const STUDIO_TOOLBAR_PRESETS = [
  { id: "line", name: "선화", ids: ["select", "pen", "eraser", "transform", "lasso", "reference", "zoom-fit"] },
  { id: "paint", name: "채색", ids: ["select", "pen", "eraser", "fill", "lasso-fill", "eyedropper", "blend", "wet-mix", "reference", "zoom-fit"] },
  { id: "comic", name: "웹툰", ids: ["select", "pen", "eraser", "fill", "text", "bubble", "image", "shape-rect", "reference", "zoom-fit"] },
  { id: "all", name: "전체", ids: DEFAULT_STUDIO_RAIL_TOOL_ORDER },
] as const satisfies readonly { id: string; name: string; ids: readonly StudioRailToolId[] }[];

export function toolbarViewWidth(view: StudioToolbarView | undefined): number {
  return view === "double" ? 104 : view === "list" ? 184 : 56;
}
