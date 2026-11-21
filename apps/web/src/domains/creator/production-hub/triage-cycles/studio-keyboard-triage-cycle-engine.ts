/**
 * Linear형 단일키 원고·검수 고속 트리아지 인박스 & 연재 마감 사이클 번다운 엔진.
 *
 * 기능:
 * 1. 단일키 트리아지 상태 머신(`J/K` 커서, `Space` 전·후 판본 스플릿 피크, `A` 승인,
 *    `R` 수정요청 인라인 핀, `1~4` 긴급도, `D` 다음 사이클 연기, `E` 완료 아카이브,
 *    `Z` 5초 낙관적 롤백 실행취소) + 입력창/IME 자동 회피 가드
 * 2. 주간/격주 연재 사이클 6공정(콘티·3D·선화·채색·식자·프리플라이트) 번다운 곡선,
 *    중도 추가 컷(Scope Creep) 집계, 마감 48시간 전 병목 공정 위험 경보
 */

import type { StudioReviewDecision, StudioReviewStatus } from "../../studio-review-workflow";

export type TriagePriorityLevel = 1 | 2 | 3 | 4;

export type TriageItemWorkflowState =
  | "pending"
  | "approved"
  | "changes-requested"
  | "deferred"
  | "archived";

export type EpisodeProductionStage =
  | "conti"
  | "bg3d"
  | "lineart"
  | "coloring"
  | "lettering"
  | "preflight";

export const EPISODE_PRODUCTION_STAGES: readonly EpisodeProductionStage[] = Object.freeze([
  "conti",
  "bg3d",
  "lineart",
  "coloring",
  "lettering",
  "preflight",
]);

export const EPISODE_STAGE_LABELS_KO: Readonly<Record<EpisodeProductionStage, string>> = Object.freeze({
  conti: "콘티",
  bg3d: "3D 배경",
  lineart: "선화",
  coloring: "채색",
  lettering: "식자",
  preflight: "프리플라이트",
});

export const TRIAGE_PRIORITY_LABELS_KO: Readonly<Record<TriagePriorityLevel, string>> = Object.freeze({
  1: "긴급",
  2: "높음",
  3: "보통",
  4: "낮음",
});

export const TRIAGE_OPTIMISTIC_UNDO_WINDOW_MS = 5_000;

export interface TriageInboxItem {
  readonly id: string;
  readonly cutId: string;
  readonly titleKo: string;
  readonly stage: EpisodeProductionStage;
  readonly reviewStatus: StudioReviewStatus;
  readonly triageState: TriageItemWorkflowState;
  readonly priority: TriagePriorityLevel;
  readonly assigneeName?: string;
  readonly inlinePinNote?: string;
}

export interface TriageOptimisticUndoRecord {
  readonly itemId: string;
  readonly previousItem: TriageInboxItem;
  readonly previousCursorIndex: number;
  readonly actionLabelKo: string;
  readonly timestampMs: number;
}

export type TriageOutboxCommand =
  | { readonly kind: "decide"; readonly itemId: string; readonly decision: StudioReviewDecision; readonly pinNote?: string }
  | { readonly kind: "set-priority"; readonly itemId: string; readonly priority: TriagePriorityLevel }
  | { readonly kind: "defer"; readonly itemId: string }
  | { readonly kind: "archive"; readonly itemId: string }
  | { readonly kind: "rollback"; readonly itemId: string; readonly restoredState: TriageItemWorkflowState };

export interface TriageInboxState {
  readonly items: readonly TriageInboxItem[];
  readonly cursorIndex: number;
  /** Space 키로 토글하는 전·후 판본 비교 스플릿 피크 열림 여부. */
  readonly splitPeekOpen: boolean;
  /** 최근 5초 이내 낙관적 실행취소 스택(최대 20건). */
  readonly undoStack: readonly TriageOptimisticUndoRecord[];
  readonly lastStatusMessageKo: string | null;
}

export interface TriageKeyEventLike {
  readonly key: string;
  readonly code?: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly isComposing?: boolean;
  readonly targetTagName?: string;
  readonly isContentEditable?: boolean;
}

export interface TriageKeyTransitionResult {
  readonly handled: boolean;
  readonly state: TriageInboxState;
  readonly outboxCommand: TriageOutboxCommand | null;
}

/**
 * 입력창(input/textarea/select/contentEditable), IME 조합, 조합키 입력 시
 * 단일키 트리아지 단축키를 비활성화한다.
 */
export function shouldIgnoreTriageKeyEvent(event: TriageKeyEventLike): boolean {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
    return true;
  }
  const tag = (event.targetTagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.isContentEditable) {
    return true;
  }
  return false;
}

export function createTriageInboxState(
  items: readonly TriageInboxItem[],
): TriageInboxState {
  return {
    items: Object.freeze([...items]),
    cursorIndex: items.length > 0 ? 0 : -1,
    splitPeekOpen: false,
    undoStack: Object.freeze([]),
    lastStatusMessageKo: null,
  };
}

function nextActiveCursorIndex(
  items: readonly TriageInboxItem[],
  fromIndex: number,
): number {
  if (items.length === 0) return -1;
  for (let offset = 1; offset <= items.length; offset += 1) {
    const idx = (fromIndex + offset) % items.length;
    if (items[idx]?.triageState === "pending") {
      return idx;
    }
  }
  return Math.min(items.length - 1, Math.max(0, fromIndex));
}

function pushUndoRecord(
  stack: readonly TriageOptimisticUndoRecord[],
  record: TriageOptimisticUndoRecord,
): readonly TriageOptimisticUndoRecord[] {
  const next = [...stack, record];
  return Object.freeze(next.length > 20 ? next.slice(next.length - 20) : next);
}

/**
 * Linear형 단일키 입력을 트리아지 상태 전이와 낙관적 아웃박스 커맨드로 처리한다.
 */
export function reduceTriageKeyAction(
  state: TriageInboxState,
  event: TriageKeyEventLike,
  options: {
    readonly nowMs?: number;
    readonly inlinePinNote?: string;
  } = {},
): TriageKeyTransitionResult {
  if (shouldIgnoreTriageKeyEvent(event)) {
    return { handled: false, state, outboxCommand: null };
  }

  const nowMs = options.nowMs ?? Date.now();
  const key = event.key;
  const lower = key.toLowerCase();

  // Z: 5초 낙관적 롤백 실행취소
  if (lower === "z") {
    const top = state.undoStack[state.undoStack.length - 1];
    if (!top) {
      return {
        handled: true,
        state: { ...state, lastStatusMessageKo: "되돌릴 최근 트리아지 작업이 없습니다." },
        outboxCommand: null,
      };
    }
    if (nowMs - top.timestampMs > TRIAGE_OPTIMISTIC_UNDO_WINDOW_MS) {
      return {
        handled: true,
        state: {
          ...state,
          undoStack: Object.freeze([]),
          lastStatusMessageKo: "5초 실행취소 유효 시간이 지났습니다.",
        },
        outboxCommand: null,
      };
    }
    const restoredItems = state.items.map((item) =>
      item.id === top.itemId ? top.previousItem : item,
    );
    return {
      handled: true,
      state: {
        ...state,
        items: Object.freeze(restoredItems),
        cursorIndex: top.previousCursorIndex,
        undoStack: Object.freeze(state.undoStack.slice(0, -1)),
        lastStatusMessageKo: `${top.actionLabelKo} 작업을 되돌렸습니다.`,
      },
      outboxCommand: {
        kind: "rollback",
        itemId: top.itemId,
        restoredState: top.previousItem.triageState,
      },
    };
  }

  if (state.items.length === 0) {
    return { handled: false, state, outboxCommand: null };
  }

  const currentIdx = Math.max(0, Math.min(state.items.length - 1, state.cursorIndex));
  const currentItem = state.items[currentIdx]!;

  // J / ArrowDown: 다음 항목
  if (lower === "j" || key === "ArrowDown") {
    const nextIdx = Math.min(state.items.length - 1, currentIdx + 1);
    return {
      handled: true,
      state: { ...state, cursorIndex: nextIdx, lastStatusMessageKo: null },
      outboxCommand: null,
    };
  }

  // K / ArrowUp: 이전 항목
  if (lower === "k" || key === "ArrowUp") {
    const prevIdx = Math.max(0, currentIdx - 1);
    return {
      handled: true,
      state: { ...state, cursorIndex: prevIdx, lastStatusMessageKo: null },
      outboxCommand: null,
    };
  }

  // Space: 전·후 판본 스플릿 피크 토글
  if (key === " " || event.code === "Space") {
    const nextOpen = !state.splitPeekOpen;
    return {
      handled: true,
      state: {
        ...state,
        splitPeekOpen: nextOpen,
        lastStatusMessageKo: nextOpen ? "전·후 판본 비교 피크를 열었습니다." : "비교 피크를 닫았습니다.",
      },
      outboxCommand: null,
    };
  }

  // 1~4: 마감 긴급도 즉시 지정
  if (key === "1" || key === "2" || key === "3" || key === "4") {
    const priority = Number(key) as TriagePriorityLevel;
    const updatedItem: TriageInboxItem = { ...currentItem, priority };
    const nextItems = state.items.map((it, idx) => (idx === currentIdx ? updatedItem : it));
    return {
      handled: true,
      state: {
        ...state,
        items: Object.freeze(nextItems),
        undoStack: pushUndoRecord(state.undoStack, {
          itemId: currentItem.id,
          previousItem: currentItem,
          previousCursorIndex: currentIdx,
          actionLabelKo: `긴급도 ${TRIAGE_PRIORITY_LABELS_KO[priority]} 지정`,
          timestampMs: nowMs,
        }),
        lastStatusMessageKo: `${currentItem.cutId} 긴급도를 '${TRIAGE_PRIORITY_LABELS_KO[priority]}'으로 변경했습니다.`,
      },
      outboxCommand: { kind: "set-priority", itemId: currentItem.id, priority },
    };
  }

  // A: 승인
  if (lower === "a") {
    const updatedItem: TriageInboxItem = {
      ...currentItem,
      reviewStatus: "approved",
      triageState: "approved",
    };
    const nextItems = state.items.map((it, idx) => (idx === currentIdx ? updatedItem : it));
    return {
      handled: true,
      state: {
        ...state,
        items: Object.freeze(nextItems),
        cursorIndex: nextActiveCursorIndex(nextItems, currentIdx),
        undoStack: pushUndoRecord(state.undoStack, {
          itemId: currentItem.id,
          previousItem: currentItem,
          previousCursorIndex: currentIdx,
          actionLabelKo: `${currentItem.cutId} 승인`,
          timestampMs: nowMs,
        }),
        lastStatusMessageKo: `${currentItem.cutId} 승인 완료 (Z로 5초 내 취소)`,
      },
      outboxCommand: { kind: "decide", itemId: currentItem.id, decision: "approved" },
    };
  }

  // R: 수정 요청 인라인 핀
  if (lower === "r") {
    const pinNote = options.inlinePinNote?.trim() || "수정 요청 핀 등록";
    const updatedItem: TriageInboxItem = {
      ...currentItem,
      reviewStatus: "changes-requested",
      triageState: "changes-requested",
      inlinePinNote: pinNote,
    };
    const nextItems = state.items.map((it, idx) => (idx === currentIdx ? updatedItem : it));
    return {
      handled: true,
      state: {
        ...state,
        items: Object.freeze(nextItems),
        cursorIndex: nextActiveCursorIndex(nextItems, currentIdx),
        undoStack: pushUndoRecord(state.undoStack, {
          itemId: currentItem.id,
          previousItem: currentItem,
          previousCursorIndex: currentIdx,
          actionLabelKo: `${currentItem.cutId} 수정 요청`,
          timestampMs: nowMs,
        }),
        lastStatusMessageKo: `${currentItem.cutId} 수정 요청 처리됨 (Z로 5초 내 취소)`,
      },
      outboxCommand: {
        kind: "decide",
        itemId: currentItem.id,
        decision: "changes-requested",
        pinNote,
      },
    };
  }

  // D: 다음 연재 사이클로 연기
  if (lower === "d") {
    const updatedItem: TriageInboxItem = { ...currentItem, triageState: "deferred" };
    const nextItems = state.items.map((it, idx) => (idx === currentIdx ? updatedItem : it));
    return {
      handled: true,
      state: {
        ...state,
        items: Object.freeze(nextItems),
        cursorIndex: nextActiveCursorIndex(nextItems, currentIdx),
        undoStack: pushUndoRecord(state.undoStack, {
          itemId: currentItem.id,
          previousItem: currentItem,
          previousCursorIndex: currentIdx,
          actionLabelKo: `${currentItem.cutId} 다음 사이클 연기`,
          timestampMs: nowMs,
        }),
        lastStatusMessageKo: `${currentItem.cutId} 다음 사이클로 연기됨`,
      },
      outboxCommand: { kind: "defer", itemId: currentItem.id },
    };
  }

  // E: 완료 아카이브
  if (lower === "e") {
    const updatedItem: TriageInboxItem = { ...currentItem, triageState: "archived" };
    const nextItems = state.items.map((it, idx) => (idx === currentIdx ? updatedItem : it));
    return {
      handled: true,
      state: {
        ...state,
        items: Object.freeze(nextItems),
        cursorIndex: nextActiveCursorIndex(nextItems, currentIdx),
        undoStack: pushUndoRecord(state.undoStack, {
          itemId: currentItem.id,
          previousItem: currentItem,
          previousCursorIndex: currentIdx,
          actionLabelKo: `${currentItem.cutId} 완료 아카이브`,
          timestampMs: nowMs,
        }),
        lastStatusMessageKo: `${currentItem.cutId} 아카이브 처리됨`,
      },
      outboxCommand: { kind: "archive", itemId: currentItem.id },
    };
  }

  return { handled: false, state, outboxCommand: null };
}

// ── 주간/격주 연재 마감 사이클 & 6공정 번다운 분석기 ──────────────────

export interface EpisodeCycleCutProgress {
  readonly cutId: string;
  readonly completedStages: readonly EpisodeProductionStage[];
  /** 사이클 시작 이후 중도 추가된 컷이면 true(Scope Creep 집계). */
  readonly addedAfterCycleStart?: boolean;
  /** 사이클 시작 기준 완료일 인덱스(0..durationDays-1). 미완료면 null. */
  readonly completedDayIndex?: number | null;
}

export interface EpisodeCycleBurndownInput {
  readonly cycleId: string;
  readonly titleKo: string;
  /** 사이클 총 일수(예: 주간 7일, 격주 14일). */
  readonly durationDays: number;
  /** 현재 경과 일 인덱스 (0..durationDays). */
  readonly currentDayIndex: number;
  readonly cuts: readonly EpisodeCycleCutProgress[];
}

export interface StageCompletionSummary {
  readonly stage: EpisodeProductionStage;
  readonly labelKo: string;
  readonly completedCuts: number;
  readonly totalCuts: number;
  readonly completionRatio01: number;
}

export interface DailyBurndownPoint {
  readonly dayIndex: number;
  readonly idealRemainingCuts: number;
  readonly actualRemainingCuts: number;
  readonly completedCumulativeCuts: number;
}

export type CycleDeadlineRiskLevel = "on-track" | "watch" | "at-risk";

export interface EpisodeCycleBurndownReport {
  readonly cycleId: string;
  readonly titleKo: string;
  readonly totalCuts: number;
  readonly initialScopeCuts: number;
  readonly scopeCreepCuts: number;
  readonly fullyCompletedCuts: number;
  readonly remainingCuts: number;
  readonly overallProgress01: number;
  readonly hoursRemainingToDeadline: number;
  readonly riskLevel: CycleDeadlineRiskLevel;
  readonly bottleneckStage: StageCompletionSummary | null;
  readonly stageSummaries: readonly StageCompletionSummary[];
  readonly dailySeries: readonly DailyBurndownPoint[];
  readonly alertMessageKo: string | null;
}

/**
 * 6공정 완료율, 일별 잔여 컷 번다운 곡선, Scope Creep, 48시간 마감 병목 경보를 계산한다.
 */
export function computeEpisodeCycleBurndown(
  input: EpisodeCycleBurndownInput,
): EpisodeCycleBurndownReport {
  const durationDays = Math.max(1, Math.round(input.durationDays));
  const currentDay = Math.max(0, Math.min(durationDays, Math.round(input.currentDayIndex)));
  const totalCuts = input.cuts.length;
  const scopeCreepCuts = input.cuts.filter((c) => c.addedAfterCycleStart === true).length;
  const initialScopeCuts = totalCuts - scopeCreepCuts;

  const stageCounts = new Map<EpisodeProductionStage, number>();
  for (const stage of EPISODE_PRODUCTION_STAGES) {
    stageCounts.set(stage, 0);
  }

  let fullyCompletedCuts = 0;
  for (const cut of input.cuts) {
    const doneSet = new Set(cut.completedStages);
    for (const stage of EPISODE_PRODUCTION_STAGES) {
      if (doneSet.has(stage)) {
        stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
      }
    }
    if (EPISODE_PRODUCTION_STAGES.every((stage) => doneSet.has(stage))) {
      fullyCompletedCuts += 1;
    }
  }

  const stageSummaries: StageCompletionSummary[] = EPISODE_PRODUCTION_STAGES.map((stage) => {
    const completedCuts = stageCounts.get(stage) ?? 0;
    return {
      stage,
      labelKo: EPISODE_STAGE_LABELS_KO[stage],
      completedCuts,
      totalCuts,
      completionRatio01:
        totalCuts > 0 ? Math.round((completedCuts / totalCuts) * 1000) / 1000 : 1,
    };
  });

  // 가장 완료율이 낮은 공정을 병목 공정으로 식별
  const bottleneckStage =
    totalCuts > 0
      ? [...stageSummaries].sort((a, b) => a.completionRatio01 - b.completionRatio01)[0] ?? null
      : null;

  const dailySeries: DailyBurndownPoint[] = [];
  for (let day = 0; day <= durationDays; day += 1) {
    const idealRemaining = Math.max(
      0,
      Math.round(totalCuts * (1 - day / durationDays) * 10) / 10,
    );
    const completedByDay = input.cuts.filter(
      (cut) =>
        typeof cut.completedDayIndex === "number" &&
        Number.isFinite(cut.completedDayIndex) &&
        cut.completedDayIndex <= day,
    ).length;
    dailySeries.push({
      dayIndex: day,
      idealRemainingCuts: idealRemaining,
      actualRemainingCuts: Math.max(0, totalCuts - completedByDay),
      completedCumulativeCuts: completedByDay,
    });
  }

  const remainingCuts = Math.max(0, totalCuts - fullyCompletedCuts);
  const overallProgress01 =
    totalCuts > 0
      ? Math.round(
          (stageSummaries.reduce((acc, s) => acc + s.completionRatio01, 0) /
            EPISODE_PRODUCTION_STAGES.length) *
            1000,
        ) / 1000
      : 1;

  const hoursRemainingToDeadline = Math.max(0, (durationDays - currentDay) * 24);
  const expectedProgress = durationDays > 0 ? currentDay / durationDays : 1;

  let riskLevel: CycleDeadlineRiskLevel = "on-track";
  let alertMessageKo: string | null = null;

  if (remainingCuts > 0 && hoursRemainingToDeadline <= 48 && overallProgress01 < 0.85) {
    riskLevel = "at-risk";
    alertMessageKo = bottleneckStage
      ? `마감 ${hoursRemainingToDeadline}시간 전 위험 경보: '${bottleneckStage.labelKo}' 공정 완료율 ${Math.round(bottleneckStage.completionRatio01 * 100)}%`
      : `마감 ${hoursRemainingToDeadline}시간 전 잔여 ${remainingCuts}컷 확인 필요`;
  } else if (remainingCuts > 0 && overallProgress01 + 0.15 < expectedProgress) {
    riskLevel = "watch";
    alertMessageKo = bottleneckStage
      ? `진행 속도 주의: '${bottleneckStage.labelKo}' 공정이 목표 일정보다 지연되고 있습니다.`
      : "진행 속도가 목표 번다운 곡선보다 뒤처져 있습니다.";
  }

  return {
    cycleId: input.cycleId,
    titleKo: input.titleKo,
    totalCuts,
    initialScopeCuts,
    scopeCreepCuts,
    fullyCompletedCuts,
    remainingCuts,
    overallProgress01,
    hoursRemainingToDeadline,
    riskLevel,
    bottleneckStage,
    stageSummaries: Object.freeze(stageSummaries),
    dailySeries: Object.freeze(dailySeries),
    alertMessageKo,
  };
}
