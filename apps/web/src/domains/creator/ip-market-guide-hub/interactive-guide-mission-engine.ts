/**
 * 맥락 인식 30초 인터랙티브 미션 가이드 · 무언(無言) 시각 시연 스텝 엔진 · 검색형 단축키/제스처 시뮬레이터.
 * 현재 페이지와 선택 도구에 꼭 맞는 단 1개의 시각 힌트만 제시하고, 5대 워크플로우 3단계 미션 진행을 계산한다.
 */

import {
  STUDIO_INTERACTIVE_MISSIONS,
  STUDIO_SHORTCUT_GESTURE_CATALOG,
  type InteractiveMissionStep,
  type ShortcutCategoryFilter,
  type ShortcutGestureEntry,
  type ShortcutPlatformFilter,
  type SilentVisualDemoCue,
  type StudioGuideMissionId,
  type StudioGuidePageContext,
  type StudioInteractiveMission,
} from "./interactive-guide-mission-catalog";

export {
  STUDIO_INTERACTIVE_MISSIONS,
  STUDIO_SHORTCUT_GESTURE_CATALOG,
  type InteractiveMissionStep,
  type ShortcutCategoryFilter,
  type ShortcutGestureEntry,
  type ShortcutPlatformFilter,
  type SilentVisualDemoCue,
  type StudioGuideMissionId,
  type StudioGuidePageContext,
  type StudioInteractiveMission,
};

export interface InteractiveMissionProgress {
  readonly missionId: StudioGuideMissionId;
  readonly completedStepIds: readonly string[];
  readonly activeStepIndex: number;
  readonly isComplete: boolean;
  readonly completionPercent: number;
  readonly remainingSecondsEstimate: number;
}

export interface ContextualGuideInput {
  readonly currentPage: StudioGuidePageContext;
  readonly activeToolId?: string;
  readonly completedMissionIds?: readonly StudioGuideMissionId[];
  readonly completedStepIds?: readonly string[];
  readonly dismissedHintIds?: readonly string[];
}

export interface ContextualGuideHint {
  readonly hintId: string;
  readonly missionId: StudioGuideMissionId;
  readonly missionTitleKo: string;
  readonly stepId: string;
  readonly stepOrder: 1 | 2 | 3;
  readonly headlineKo: string;
  readonly microCueKo: string;
  readonly visualCue: SilentVisualDemoCue;
  readonly targetSelectorHint: string;
  readonly shortcutBadge: string;
  readonly spritePath: string;
  readonly estimatedSeconds: number;
}

export interface ShortcutSimulationFeedback {
  readonly entryId: string;
  readonly titleKo: string;
  readonly executedBindingLabel: string;
  readonly canvasReactionKo: string;
  readonly visualCue: SilentVisualDemoCue;
  readonly latencyLabelKo: string;
}

function findMissionById(missionId: StudioGuideMissionId): StudioInteractiveMission {
  const found = STUDIO_INTERACTIVE_MISSIONS.find((mission) => mission.id === missionId);
  if (found) return found;
  const first = STUDIO_INTERACTIVE_MISSIONS[0];
  if (first) return first;
  throw new Error("STUDIO_INTERACTIVE_MISSIONS must contain at least one mission.");
}

/**
 * 선택한 30초 체험 미션의 진행 상태를 계산한다.
 */
export function createInteractiveMissionProgress(
  missionId: StudioGuideMissionId,
  completedStepIds: readonly string[] = [],
): InteractiveMissionProgress {
  const mission = findMissionById(missionId);
  const completedSet = new Set(completedStepIds);
  const validCompleted = mission.steps
    .filter((step) => completedSet.has(step.id))
    .map((step) => step.id);
  const nextIncompleteIdx = mission.steps.findIndex((step) => !completedSet.has(step.id));
  const isComplete = nextIncompleteIdx === -1;
  const activeStepIndex = isComplete ? mission.steps.length - 1 : nextIncompleteIdx;
  const completionPercent = Math.round((validCompleted.length / mission.steps.length) * 100);
  const remainingSecondsEstimate = mission.steps
    .filter((step) => !completedSet.has(step.id))
    .reduce((acc, step) => acc + step.estimatedSeconds, 0);

  return {
    missionId: mission.id,
    completedStepIds: validCompleted,
    activeStepIndex,
    isComplete,
    completionPercent,
    remainingSecondsEstimate,
  };
}

/**
 * 현재 미션의 다음 스텝(또는 지정 스텝)을 완료 처리해 다음 진행 상태를 반환한다.
 */
export function advanceInteractiveMissionStep(
  progress: InteractiveMissionProgress,
  explicitStepId?: string,
): InteractiveMissionProgress {
  const mission = findMissionById(progress.missionId);
  const stepToComplete =
    explicitStepId ?? mission.steps[progress.activeStepIndex]?.id ?? mission.steps[0].id;
  const nextCompleted = Array.from(new Set([...progress.completedStepIds, stepToComplete]));
  return createInteractiveMissionProgress(progress.missionId, nextCompleted);
}

/**
 * 현재 페이지와 활성 도구에 맞춰 화면에 꼭 필요한 단 1개의 무언(無言) 시각 힌트만 반환한다.
 * 관련 스텝이 모두 완료되었거나 사용자가 닫은 힌트만 남았다면 null을 반환한다.
 */
export function resolveContextualGuideHint(
  input: ContextualGuideInput,
): ContextualGuideHint | null {
  const completedMissions = new Set(input.completedMissionIds ?? []);
  const completedSteps = new Set(input.completedStepIds ?? []);
  const dismissedHints = new Set(input.dismissedHintIds ?? []);
  const normalizedTool = (input.activeToolId ?? "").trim().toLowerCase();

  const prioritizedMissions = [...STUDIO_INTERACTIVE_MISSIONS].sort((a, b) => {
    const aPageMatch = a.pageContext === input.currentPage ? 0 : 1;
    const bPageMatch = b.pageContext === input.currentPage ? 0 : 1;
    if (aPageMatch !== bPageMatch) return aPageMatch - bPageMatch;
    const aToolMatch =
      normalizedTool && a.steps.some((step) => step.targetToolId.toLowerCase() === normalizedTool)
        ? 0
        : 1;
    const bToolMatch =
      normalizedTool && b.steps.some((step) => step.targetToolId.toLowerCase() === normalizedTool)
        ? 0
        : 1;
    return aToolMatch - bToolMatch;
  });

  for (const mission of prioritizedMissions) {
    if (completedMissions.has(mission.id)) continue;

    const isHubContext = input.currentPage === "growth-ip" || input.currentPage === "market";
    if (!isHubContext && mission.pageContext !== input.currentPage) {
      const toolMatches =
        normalizedTool !== "" &&
        mission.steps.some((step) => step.targetToolId.toLowerCase() === normalizedTool);
      if (!toolMatches) continue;
    }

    for (const step of mission.steps) {
      if (completedSteps.has(step.id)) continue;
      const hintId = `${mission.id}:${step.id}`;
      if (dismissedHints.has(hintId)) continue;
      return {
        hintId,
        missionId: mission.id,
        missionTitleKo: mission.titleKo,
        stepId: step.id,
        stepOrder: step.order,
        headlineKo: `${step.order}단계 · ${step.titleKo}`,
        microCueKo: step.microCueKo,
        visualCue: step.visualCue,
        targetSelectorHint: step.targetSelectorHint,
        shortcutBadge: step.shortcutBadge,
        spritePath: mission.spritePath,
        estimatedSeconds: step.estimatedSeconds,
      };
    }
  }

  return null;
}

/**
 * 한국어·영문·키 조합으로 단축키와 터치/워치/TV 제스처 치트시트를 실시간 검색한다.
 */
export function searchInteractiveShortcutGuide(
  query: string,
  platformFilter: ShortcutPlatformFilter = "all",
  categoryFilter: ShortcutCategoryFilter = "all",
): readonly ShortcutGestureEntry[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean);

  return STUDIO_SHORTCUT_GESTURE_CATALOG.filter((entry) => {
    if (platformFilter !== "all" && entry.platform !== platformFilter) return false;
    if (categoryFilter !== "all" && entry.category !== categoryFilter) return false;
    if (tokens.length === 0) return true;

    const haystack = [
      entry.titleKo,
      entry.macCombo,
      entry.winCombo,
      entry.gestureCueKo,
      entry.effectSummaryKo,
      ...entry.keywords,
    ]
      .join(" ")
      .toLowerCase();

    return tokens.every((token) => haystack.includes(token));
  });
}

/**
 * 단축키 또는 제스처 항목을 가이드 안에서 바로 눌러 체험할 때 즉각적인 시각 시연 피드백을 반환한다.
 */
export function simulateShortcutOrGestureAction(
  entryId: string,
  osPreference: "mac" | "windows" | "touch" = "mac",
): ShortcutSimulationFeedback | null {
  const entry = STUDIO_SHORTCUT_GESTURE_CATALOG.find((item) => item.id === entryId);
  if (!entry) return null;

  const executedBindingLabel =
    osPreference === "touch"
      ? entry.gestureCueKo
      : osPreference === "windows"
        ? entry.winCombo
        : entry.macCombo;

  return {
    entryId: entry.id,
    titleKo: entry.titleKo,
    executedBindingLabel,
    canvasReactionKo: entry.effectSummaryKo,
    visualCue: entry.visualCue,
    latencyLabelKo: entry.platform === "wearable-tv" ? "로컬 채널 16ms 동기화" : "즉시 반응 (<16ms)",
  };
}
