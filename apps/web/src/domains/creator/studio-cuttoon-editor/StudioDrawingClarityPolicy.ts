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

export function isStudioDrawingEditorRoute(location: StudioWorkspaceLocationInput): boolean {
  const route = parseStudioWorkspaceRoute(location);
  return route.valid && (route.surface === "canvas" || route.surface === "comic");
}
