import {
  areStudioWorkspaceLayoutsEqual,
  isStudioWorkspaceDirty,
  normalizeStudioCommandBarPreferences,
  resolveStudioWorkspace,
} from "../studio-workspaces";

import type { StudioUiDensityMode } from "../studio-ui-density";
import type { StudioWorkMode } from "../studio-work-mode";
import type { StudioWorkspaceLoadSource, StudioWorkspaceState } from "../studio-workspaces";

/** 복원 당시의 UI 배치다. 이후 패널 조작·자동 저장으로 진입 판단을 바꾸지 않는다. */
export interface StudioDrawingClarityBaseline {
  readonly ownerScope: string;
  readonly source: StudioWorkspaceLoadSource;
  readonly state: StudioWorkspaceState;
}

const DRAWING_WORKSPACES = new Set([
  "lineart", "pro-comic", "quick-sketch", "coloring", "pen-display", "mobile-draw",
]);

function untouchedDrawingLayout(state: StudioWorkspaceState): boolean {
  const preset = resolveStudioWorkspace(state, state.activeWorkspaceId);
  if (!preset || isStudioWorkspaceDirty(state)
    || !areStudioWorkspaceLayoutsEqual(state.liveLayout, preset.layout, true)) return false;
  // 수정됨 배지는 명령막대를 비교하지 않지만, 간소화는 개인 명령막대도 보존해야 한다.
  const bar = normalizeStudioCommandBarPreferences(state.liveLayout.commandBar);
  const presetBar = normalizeStudioCommandBarPreferences(preset.layout.commandBar);
  return bar.visible === presetBar.visible
    && bar.slots.every((slot, index) => slot === presetBar.slots[index]);
}

/** 저장한 배치·도구 구성과 명시한 작업 목적은 기존 화면으로 보존한다. */
export function studioDrawingClarityEligible(input: {
  readonly baseline: StudioDrawingClarityBaseline | null;
  readonly ownerScope: string;
  readonly densityMode: StudioUiDensityMode;
  readonly workMode: StudioWorkMode;
  readonly search: string;
  readonly toolbarConfigured: boolean;
}): boolean {
  const { baseline } = input;
  if (!baseline || baseline.ownerScope !== input.ownerScope || baseline.source !== "default"
    || input.densityMode !== "simple" || input.toolbarConfigured !== false
    || !["all", "draw", "color"].includes(input.workMode)
    || baseline.state.customWorkspaces.length > 0
    || !DRAWING_WORKSPACES.has(baseline.state.activeWorkspaceId)
    || !untouchedDrawingLayout(baseline.state)) return false;
  const params = new URLSearchParams(input.search);
  const modes = params.getAll("uiMode");
  // 기존 별칭 simple은 focus다. 중복·알 수 없는 모드와 명시한 셸/역할도 바꾸지 않는다.
  return !params.has("roleWorkspace") && !params.has("drawingShell")
    && (modes.length === 0 || (modes.length === 1 && ["basic", "standard"].includes(modes[0] ?? "")));
}
