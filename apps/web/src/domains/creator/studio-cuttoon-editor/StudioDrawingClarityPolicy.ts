import { parseStudioWorkspaceRoute, type StudioWorkspaceLocationInput } from "../studio-workspace-route";
import type { StudioWorkspaceLoadSource, StudioWorkspaceState } from "../studio-workspaces";

export interface StudioDrawingClarityBaseline {
  readonly ownerScope: string;
  readonly source: StudioWorkspaceLoadSource;
  readonly state: StudioWorkspaceState;
}

export interface StudioDrawingClarityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioDrawingPanelVisibility {
  readonly bg3dOpen?: boolean;
  readonly poserVrmOpen?: boolean;
  readonly characterShaperOpen?: boolean;
  readonly timelineOpen?: boolean;
}

/** A routed panel can close one render before navigation commits the canvas URL. */
export function isStudioDrawingEditorRoute(location: StudioWorkspaceLocationInput, panels?: StudioDrawingPanelVisibility): boolean {
  const route = parseStudioWorkspaceRoute(location);
  if (!route.valid) return false;
  switch (route.surface) {
    case "canvas":
    case "comic":
      return true;
    case "bg3d": return panels?.bg3dOpen === false;
    case "poser": return panels?.poserVrmOpen === false;
    case "character": return panels?.characterShaperOpen === false;
    case "animation": return panels?.timelineOpen === false;
    default: return false;
  }
}
