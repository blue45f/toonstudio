/**
 * serialization-pace-model.ts — 창작자 연재 리듬 · 마감 페이스 보드 순수 모델 & 영속 저장.
 *
 * 초보자도 주간/격주/인스타툰 3종 리듬 프리셋 중 하나를 고르고 5단계 공정(콘티·배경·선화·채색·식자)
 * 완료 컷 수를 +5/-5 또는 완료 체크로 갱신하면, 남은 일수·일일 권장 컷 수·번아웃 주의 신호와
 * 연속 작업 스트릭을 실시간 계산하고 브라우저에 저장한다.
 */

export type PaceCadencePresetId = "weekly-60" | "biweekly-50" | "instatoon-8";
export type PaceStageId = "storyboard" | "bg3d" | "ink" | "color" | "lettering";

export interface PaceStageSpec {
  readonly id: PaceStageId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly weight: number;
  readonly toneVar: string;
}

export interface PaceCadencePreset {
  readonly id: PaceCadencePresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly cycleDays: number;
  readonly targetCuts: number;
  readonly bufferDaysGoal: number;
}

export interface SerializationPaceState {
  readonly presetId: PaceCadencePresetId;
  readonly episodeLabel: string;
  readonly targetCuts: number;
  readonly daysRemaining: number;
  readonly completedByStage: Readonly<Record<PaceStageId, number>>;
  readonly dailyCheckInStreak: number;
  readonly lastCheckInDate: string | null;
}

export interface SerializationPaceSummary {
  readonly overallPct: number;
  readonly weightedCompletedCuts: number;
  readonly remainingCutUnits: number;
  readonly dailyRequiredUnits: number;
  readonly status: "ahead" | "steady" | "tight";
  readonly stagePercentages: Readonly<Record<PaceStageId, number>>;
  readonly completedStageCount: number;
}

export const PACE_STAGES: readonly PaceStageSpec[] = [
  { id: "storyboard", labelKo: "콘티·연출", labelEn: "Storyboard", weight: 0.16, toneVar: "var(--color-cool)" },
  { id: "bg3d", labelKo: "3D 배경", labelEn: "3D Scene", weight: 0.16, toneVar: "var(--color-accent-2)" },
  { id: "ink", labelKo: "선화", labelEn: "Inking", weight: 0.28, toneVar: "var(--color-accent)" },
  { id: "color", labelKo: "채색·조명", labelEn: "Color & Light", weight: 0.26, toneVar: "var(--color-warn)" },
  { id: "lettering", labelKo: "말풍선·검수", labelEn: "Lettering & QA", weight: 0.14, toneVar: "var(--color-good)" },
];

export const PACE_CADENCE_PRESETS: readonly PaceCadencePreset[] = [
  {
    id: "weekly-60",
    labelKo: "주간 60컷 정식",
    labelEn: "Weekly 60 cuts",
    hintKo: "7일 주기 · 주간 연재 표준 페이스",
    hintEn: "7-day cycle · standard weekly cadence",
    cycleDays: 7,
    targetCuts: 60,
    bufferDaysGoal: 1,
  },
  {
    id: "biweekly-50",
    labelKo: "격주 50컷 여유",
    labelEn: "Biweekly 50 cuts",
    hintKo: "14일 주기 · 작화 밀도 중심 페이스",
    hintEn: "14-day cycle · high-craft detail pace",
    cycleDays: 14,
    targetCuts: 50,
    bufferDaysGoal: 2,
  },
  {
    id: "instatoon-8",
    labelKo: "인스타툰 8컷",
    labelEn: "8-panel short",
    hintKo: "3일 주기 · 짧은 컷툰 빠른 발행",
    hintEn: "3-day cycle · rapid short-comic cadence",
    cycleDays: 3,
    targetCuts: 8,
    bufferDaysGoal: 1,
  },
];

export function createInitialPaceState(presetId: PaceCadencePresetId = "weekly-60"): SerializationPaceState {
  const preset = PACE_CADENCE_PRESETS.find((item) => item.id === presetId) ?? PACE_CADENCE_PRESETS[0]!;
  return {
    presetId: preset.id,
    episodeLabel: "EP.01",
    targetCuts: preset.targetCuts,
    daysRemaining: Math.max(1, preset.cycleDays - 2),
    completedByStage: {
      storyboard: preset.targetCuts,
      bg3d: Math.round(preset.targetCuts * 0.5),
      ink: Math.round(preset.targetCuts * 0.25),
      color: 0,
      lettering: 0,
    },
    dailyCheckInStreak: 0,
    lastCheckInDate: null,
  };
}

export function nudgeStageCuts(
  state: SerializationPaceState,
  stageId: PaceStageId,
  delta: number,
): SerializationPaceState {
  const current = state.completedByStage[stageId] ?? 0;
  const next = Math.max(0, Math.min(state.targetCuts, current + delta));
  return {
    ...state,
    completedByStage: {
      ...state.completedByStage,
      [stageId]: next,
    },
  };
}

export function completeStageAllCuts(
  state: SerializationPaceState,
  stageId: PaceStageId,
): SerializationPaceState {
  const isAlreadyDone = state.completedByStage[stageId] >= state.targetCuts;
  return {
    ...state,
    completedByStage: {
      ...state.completedByStage,
      [stageId]: isAlreadyDone ? 0 : state.targetCuts,
    },
  };
}

export function recordDailyPaceCheckIn(
  state: SerializationPaceState,
  todayIsoDate: string,
): { readonly state: SerializationPaceState; readonly alreadyCheckedToday: boolean } {
  if (state.lastCheckInDate === todayIsoDate) {
    return { state, alreadyCheckedToday: true };
  }
  return {
    alreadyCheckedToday: false,
    state: {
      ...state,
      dailyCheckInStreak: state.dailyCheckInStreak + 1,
      lastCheckInDate: todayIsoDate,
    },
  };
}

export function computePaceSummary(state: SerializationPaceState): SerializationPaceSummary {
  const target = Math.max(1, state.targetCuts);
  let weightedRatio = 0;
  let completedStageCount = 0;
  const stagePercentages: Record<PaceStageId, number> = {
    storyboard: 0,
    bg3d: 0,
    ink: 0,
    color: 0,
    lettering: 0,
  };

  for (const stage of PACE_STAGES) {
    const done = Math.max(0, Math.min(target, state.completedByStage[stage.id] ?? 0));
    const ratio = done / target;
    stagePercentages[stage.id] = Math.round(ratio * 100);
    weightedRatio += ratio * stage.weight;
    if (done >= target) completedStageCount += 1;
  }

  const overallPct = Math.round(weightedRatio * 100);
  const weightedCompletedCuts = Math.round(weightedRatio * target);
  const remainingCutUnits = Math.max(0, target - weightedCompletedCuts);
  const safeDays = Math.max(1, state.daysRemaining);
  const dailyRequiredUnits = Math.ceil(remainingCutUnits / safeDays);

  const preset =
    PACE_CADENCE_PRESETS.find((item) => item.id === state.presetId) ?? PACE_CADENCE_PRESETS[0]!;
  const comfortableDaily = Math.max(2, Math.ceil(target / Math.max(1, preset.cycleDays - preset.bufferDaysGoal)));

  let status: "ahead" | "steady" | "tight" = "steady";
  if (overallPct >= 100 || dailyRequiredUnits <= Math.floor(comfortableDaily * 0.75)) {
    status = "ahead";
  } else if (dailyRequiredUnits > Math.ceil(comfortableDaily * 1.25)) {
    status = "tight";
  }

  return {
    overallPct,
    weightedCompletedCuts,
    remainingCutUnits,
    dailyRequiredUnits,
    status,
    stagePercentages,
    completedStageCount,
  };
}

const STORAGE_KEY = "toonstudio.serialization-pace-board.v1";

export function loadSerializationPaceState(): SerializationPaceState {
  if (typeof window === "undefined") return createInitialPaceState("weekly-60");
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialPaceState("weekly-60");
    const parsed = JSON.parse(raw) as Partial<SerializationPaceState>;
    const presetId: PaceCadencePresetId =
      parsed.presetId === "biweekly-50" || parsed.presetId === "instatoon-8"
        ? parsed.presetId
        : "weekly-60";
    const fallback = createInitialPaceState(presetId);
    const targetCuts = Math.max(4, Math.min(200, Math.round(parsed.targetCuts ?? fallback.targetCuts)));
    const daysRemaining = Math.max(1, Math.min(30, Math.round(parsed.daysRemaining ?? fallback.daysRemaining)));
    const completedByStage: Record<PaceStageId, number> = {
      storyboard: Math.max(0, Math.min(targetCuts, Math.round(parsed.completedByStage?.storyboard ?? 0))),
      bg3d: Math.max(0, Math.min(targetCuts, Math.round(parsed.completedByStage?.bg3d ?? 0))),
      ink: Math.max(0, Math.min(targetCuts, Math.round(parsed.completedByStage?.ink ?? 0))),
      color: Math.max(0, Math.min(targetCuts, Math.round(parsed.completedByStage?.color ?? 0))),
      lettering: Math.max(0, Math.min(targetCuts, Math.round(parsed.completedByStage?.lettering ?? 0))),
    };
    return {
      presetId,
      episodeLabel: typeof parsed.episodeLabel === "string" && parsed.episodeLabel.trim()
        ? parsed.episodeLabel.trim().slice(0, 24)
        : fallback.episodeLabel,
      targetCuts,
      daysRemaining,
      completedByStage,
      dailyCheckInStreak: Math.max(0, Math.round(parsed.dailyCheckInStreak ?? 0)),
      lastCheckInDate: typeof parsed.lastCheckInDate === "string" ? parsed.lastCheckInDate : null,
    };
  } catch {
    return createInitialPaceState("weekly-60");
  }
}

export function saveSerializationPaceState(state: SerializationPaceState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 프라이빗 모드에서도 현재 세션 페이스 보드는 정상 동작한다.
  }
}
