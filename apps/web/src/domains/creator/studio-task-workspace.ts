import type { StudioDocumentWorkspaceId } from "./studio-document-workspace";
import { readStudioLaunchDensity } from "./studio-launch-mode";
import type { StudioUiDensityMode } from "./studio-ui-density";
import {
  STUDIO_DEFAULT_WORKSPACE_IDS,
  switchStudioWorkspace,
  type StudioDefaultWorkspaceId,
  type StudioWorkspaceState,
} from "./studio-workspaces";

const TASK_LAYOUTS: Partial<Record<StudioDocumentWorkspaceId, StudioDefaultWorkspaceId>> = {
  draw: "lineart",
  comic: "pro-comic",
  image: "photo-edit",
  design: "vector-design",
  slides: "slides-deck",
  storyboard: "storyboard",
  whiteboard: "vector-design",
  "3d": "pose-3d",
  animation: "animation",
  motion: "animation",
  audio: "animation",
  localization: "lettering",
  review: "review",
};
const DEFAULT_WORKSPACE_IDS = new Set<string>(STUDIO_DEFAULT_WORKSPACE_IDS);

function workspaceSearch(search: string | URLSearchParams | null | undefined): URLSearchParams {
  if (search instanceof URLSearchParams) return search;
  return new URLSearchParams(search ?? globalThis.location?.search ?? "");
}

export function studioRoleWorkspaceId(
  search?: string | URLSearchParams | null,
): StudioDefaultWorkspaceId | null {
  const params = workspaceSearch(search);
  const values = params.getAll("roleWorkspace");
  if (values.length !== 1 || !DEFAULT_WORKSPACE_IDS.has(values[0] ?? "")) return null;
  return values[0] as StudioDefaultWorkspaceId;
}

export function studioTaskWorkspaceId(
  workspace: StudioDocumentWorkspaceId | null,
  density: StudioUiDensityMode,
  search?: string | URLSearchParams | null,
): StudioDefaultWorkspaceId | null {
  const params = workspaceSearch(search);
  const roleWorkspace = studioRoleWorkspaceId(params);
  if (roleWorkspace) return roleWorkspace;
  if (!workspace) return null;
  // 같은 원고의 퀵 링크는 펜과 밀도만 바꾼다. 배치·명령막대의 저장 키는 원래 문서의 것을 사용한다.
  if ((workspace === "draw" || workspace === "comic") && readStudioLaunchDensity(params.toString()) === "focus") {
    return TASK_LAYOUTS[workspace] ?? null;
  }
  if (density === "focus" && ["draw", "comic", "image", "design"].includes(workspace)) return "quick-sketch";
  return TASK_LAYOUTS[workspace] ?? null;
}

/** Layout only: no pages, strokes, history, dimensions or document mutators. */
export function applyStudioTaskWorkspace(
  state: StudioWorkspaceState,
  workspaceId: StudioDefaultWorkspaceId | null | undefined,
): StudioWorkspaceState {
  const customWorkspaceActive = state.customWorkspaces.some(
    (workspace) => workspace.id === state.activeWorkspaceId,
  );
  return !workspaceId || state.activeWorkspaceId === workspaceId || customWorkspaceActive
    ? state
    : switchStudioWorkspace(state, workspaceId);
}
