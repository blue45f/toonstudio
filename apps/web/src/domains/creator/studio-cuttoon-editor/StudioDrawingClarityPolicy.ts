import {
  areStudioWorkspaceLayoutsEqual,
  isStudioWorkspaceDirty,
  normalizeStudioCommandBarPreferences,
  resolveStudioWorkspace,
} from "../studio-workspaces";

import type { StudioDocumentWorkspaceId } from "../studio-document-workspace";
import { studioRoleWorkspaceId, studioTaskWorkspaceId } from "../studio-task-workspace";
import { readStudioLaunchDensity } from "../studio-launch-mode";
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

export interface StudioDrawingClarityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STUDIO_DRAWING_CLARITY_CHOICE_STORAGE_KEY =
  "toonstudio:studio-drawing-clarity-choice:v1";
export const STUDIO_DRAWING_CLARITY_KNOWN_OWNER_STORAGE_KEY =
  "toonstudio:studio-drawing-clarity-known-owner:v1";

export function isUntouchedStudioDrawingLayout(state: StudioWorkspaceState): boolean {
  const preset = resolveStudioWorkspace(state, state.activeWorkspaceId);
  if (!preset || isStudioWorkspaceDirty(state)
    || !areStudioWorkspaceLayoutsEqual(state.liveLayout, preset.layout, true)) return false;
  // 수정됨 배지는 명령막대를 비교하지 않지만, 간소화는 개인 명령막대도 보존해야 한다.
  const bar = normalizeStudioCommandBarPreferences(state.liveLayout.commandBar);
  const presetBar = normalizeStudioCommandBarPreferences(preset.layout.commandBar);
  return bar.visible === presetBar.visible
    && bar.slots.every((slot, index) => slot === presetBar.slots[index]);
}

function readJsonRecord(
  storage: StudioDrawingClarityStorage | null | undefined,
  key: string,
): Record<string, unknown> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function loadStudioDrawingClarityChoice(
  storage: StudioDrawingClarityStorage | null | undefined,
  ownerScope: string,
  workspaceId: string,
): boolean | undefined {
  const map = readJsonRecord(storage, STUDIO_DRAWING_CLARITY_CHOICE_STORAGE_KEY);
  const entry = map[`${ownerScope}:${workspaceId}`];
  return typeof entry === "boolean" ? entry : undefined;
}

export function saveStudioDrawingClarityChoice(
  storage: StudioDrawingClarityStorage | null | undefined,
  ownerScope: string,
  workspaceId: string,
  simple: boolean,
): void {
  if (!storage) return;
  try {
    const map = readJsonRecord(storage, STUDIO_DRAWING_CLARITY_CHOICE_STORAGE_KEY);
    map[`${ownerScope}:${workspaceId}`] = simple;
    storage.setItem(STUDIO_DRAWING_CLARITY_CHOICE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // 저장소 접근 제한(사파리 비공개 모드 등)에서도 세션 내 전환은 유지한다.
  }
}

export function loadStudioDrawingClarityKnownOwnerState(
  storage: StudioDrawingClarityStorage | null | undefined,
  ownerScope: string,
): "default" | "saved" | undefined {
  const map = readJsonRecord(storage, STUDIO_DRAWING_CLARITY_KNOWN_OWNER_STORAGE_KEY);
  const value = map[ownerScope];
  return value === "default" || value === "saved" ? value : undefined;
}

export function saveStudioDrawingClarityKnownOwnerState(
  storage: StudioDrawingClarityStorage | null | undefined,
  ownerScope: string,
  kind: "default" | "saved",
): void {
  if (!storage) return;
  try {
    const map = readJsonRecord(storage, STUDIO_DRAWING_CLARITY_KNOWN_OWNER_STORAGE_KEY);
    if (map[ownerScope] === kind) return;
    map[ownerScope] = kind;
    storage.setItem(STUDIO_DRAWING_CLARITY_KNOWN_OWNER_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // 저장소 쿼터/보안 제한 시에도 런타임 동작을 중단하지 않는다.
  }
}

/** 같은 문서 기본 배치의 역할 링크는 원고에서 쓰던 화면을 그대로 연다. */
export function studioDrawingRoleRequiresLayout(search: string, documentWorkspace: StudioDocumentWorkspaceId | null): boolean {
  const role = studioRoleWorkspaceId(search);
  return role !== null && role !== studioTaskWorkspaceId(documentWorkspace, "simple", "");
}

/** 퀵모드 링크의 집중 밀도도 같은 원고 도구를 사용한다. 직접 저장한 집중 배치는 보존한다. */
export function studioDrawingRouteUsesClarity(density: StudioUiDensityMode, search: string, documentWorkspace: StudioDocumentWorkspaceId | null): boolean {
  const params = new URLSearchParams(search);
  if (density === "full" || studioDrawingRoleRequiresLayout(search, documentWorkspace)) return false;
  if (!params.has("uiMode")) return density === "simple";
  const launchDensity = readStudioLaunchDensity(search);
  return launchDensity === "focus" || (launchDensity === "simple" && density === "simple");
}

/** 저장한 배치·도구 구성과 명시한 작업 목적은 기존 화면으로 보존한다. */
export function studioDrawingClarityEligible(input: {
  readonly baseline: StudioDrawingClarityBaseline | null;
  readonly ownerScope: string;
  readonly densityMode: StudioUiDensityMode;
  readonly documentWorkspace: StudioDocumentWorkspaceId | null;
  readonly workMode: StudioWorkMode;
  readonly search: string;
  readonly toolbarConfigured: boolean;
}): boolean {
  const { baseline } = input;
  if (!baseline || baseline.ownerScope !== input.ownerScope || baseline.source !== "default"
    || !studioDrawingRouteUsesClarity(input.densityMode, input.search, input.documentWorkspace) || input.toolbarConfigured
    || !["all", "draw", "color"].includes(input.workMode)
    || baseline.state.customWorkspaces.length > 0
    || !DRAWING_WORKSPACES.has(baseline.state.activeWorkspaceId)
    || !isUntouchedStudioDrawingLayout(baseline.state)) return false;
  return true;
}
