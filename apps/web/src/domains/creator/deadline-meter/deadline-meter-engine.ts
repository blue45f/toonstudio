/**
 * 1인 스튜디오 마감 캘린더 & 공정별 소요시간 자동 계측기 엔진 (₩0 로컬 저장).
 *
 * - 콘티 / 선화 / 밑색 / 명암 / 식자 5대 공정별 세션 타이머
 * - 누적 작업 기록으로부터 공정별·총합 컷당 평균 소요시간(분) 자동 학습(EWMA + 실측/기준치 구분)
 * - 다음 화 마감까지 남은 일수 대비 하루 목표 컷 수 및 휴재 위험도(안전 / 주의 / 긴급) 산출
 */

export type ProductionMeterStageId =
  | "conti"
  | "lineart"
  | "flatColor"
  | "shading"
  | "lettering";

export type HiatusRiskLevel = "safe" | "caution" | "urgent";

export type LearningDataSource = "measured" | "blended" | "baseline";

export interface ProductionMeterStageDefinition {
  readonly id: ProductionMeterStageId;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  /** 실측 기록 전 사용하는 1인 웹툰 작가 초기 기준치(분/컷). */
  readonly baselineMinutesPerCut: number;
}

export interface StageWorkSessionLog {
  readonly id: string;
  readonly stage: ProductionMeterStageId;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly durationMinutes: number;
  readonly cutsCompleted: number;
  readonly note: string;
}

export interface ActiveStageTimer {
  readonly stage: ProductionMeterStageId;
  readonly startedAtMs: number;
  readonly accumulatedMs: number;
  readonly running: boolean;
}

export interface EpisodeDeadlineTarget {
  readonly episodeTitle: string;
  /** YYYY-MM-DD 형식의 다음 화 마감일. */
  readonly deadlineDate: string;
  readonly targetCuts: number;
  readonly completedCuts: number;
  /** 하루 평균 투입 가능한 순수 작화 시간(시간). */
  readonly dailyWorkHours: number;
}

export interface SoloDeadlineMeterState {
  readonly schemaVersion: 1;
  readonly episode: EpisodeDeadlineTarget;
  readonly activeTimer: ActiveStageTimer | null;
  readonly sessions: readonly StageWorkSessionLog[];
}

export interface StageLearnedSpeed {
  readonly stage: ProductionMeterStageId;
  readonly labelKo: string;
  readonly minutesPerCut: number;
  readonly baselineMinutesPerCut: number;
  readonly measuredCuts: number;
  readonly measuredMinutes: number;
  readonly sessionCount: number;
  readonly source: LearningDataSource;
}

export interface DailyDeadlineBurnItem {
  readonly date: string;
  readonly dayOffset: number;
  readonly plannedCuts: number;
  readonly cumulativeCuts: number;
  readonly isDeadline: boolean;
}

export interface SoloDeadlineForecast {
  readonly todayDate: string;
  readonly deadlineDate: string;
  readonly daysRemaining: number;
  readonly isOverdue: boolean;
  readonly remainingCuts: number;
  readonly dailyTargetCuts: number;
  readonly dailyTargetCutsExact: number;
  readonly learnedMinutesPerCutTotal: number;
  readonly hasMeasuredData: boolean;
  readonly estimatedRemainingMinutes: number;
  readonly estimatedRemainingHours: number;
  readonly requiredDailyHours: number;
  readonly capacityRatio: number;
  readonly riskLevel: HiatusRiskLevel;
  readonly riskLabelKo: string;
  readonly guidanceKo: string;
  readonly stageSpeeds: readonly StageLearnedSpeed[];
  readonly dailyPlan: readonly DailyDeadlineBurnItem[];
}

export const PRODUCTION_METER_STAGES: readonly ProductionMeterStageDefinition[] = Object.freeze([
  { id: "conti", labelKo: "콘티", shortLabelKo: "콘티", baselineMinutesPerCut: 4.5 },
  { id: "lineart", labelKo: "선화", shortLabelKo: "선화", baselineMinutesPerCut: 11.0 },
  { id: "flatColor", labelKo: "밑색", shortLabelKo: "밑색", baselineMinutesPerCut: 4.0 },
  { id: "shading", labelKo: "명암", shortLabelKo: "명암", baselineMinutesPerCut: 6.5 },
  { id: "lettering", labelKo: "식자", shortLabelKo: "식자", baselineMinutesPerCut: 2.5 },
]);

export const HIATUS_RISK_LABELS: Readonly<Record<HiatusRiskLevel, string>> = Object.freeze({
  safe: "안전",
  caution: "주의",
  urgent: "긴급",
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseIsoDayUtcMs(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
}

function formatIsoDayUtc(utcMs: number): string {
  const date = new Date(utcMs);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const base = parseIsoDayUtcMs(isoDate) ?? Date.UTC(2026, 10, 22);
  return formatIsoDayUtc(base + days * 86_400_000);
}

/**
 * 오늘(`todayDate`)부터 마감일(`deadlineDate`)까지 작업 가능한 잔여 일수를 계산한다.
 * - 마감일이 오늘이면 1일(당일 작업 가능)
 * - 마감일이 오늘보다 이전이면 0일(마감 경과)
 */
export function calculateRemainingWorkDays(todayDate: string, deadlineDate: string): {
  readonly daysRemaining: number;
  readonly isOverdue: boolean;
} {
  const todayMs = parseIsoDayUtcMs(todayDate);
  const dueMs = parseIsoDayUtcMs(deadlineDate);
  if (todayMs === null || dueMs === null) {
    return { daysRemaining: 7, isOverdue: false };
  }
  const diffDays = Math.round((dueMs - todayMs) / 86_400_000);
  if (diffDays < 0) {
    return { daysRemaining: 0, isOverdue: true };
  }
  return { daysRemaining: diffDays + 1, isOverdue: false };
}

export function createDefaultSoloDeadlineMeterState(todayDate: string): SoloDeadlineMeterState {
  return Object.freeze({
    schemaVersion: 1,
    episode: Object.freeze({
      episodeTitle: "다음 연재 화",
      deadlineDate: addDaysToIsoDate(todayDate, 6),
      targetCuts: 60,
      completedCuts: 15,
      dailyWorkHours: 6,
    }),
    activeTimer: null,
    sessions: Object.freeze([]),
  });
}

export function updateEpisodeDeadlineTarget(
  state: SoloDeadlineMeterState,
  patch: Partial<EpisodeDeadlineTarget>,
): SoloDeadlineMeterState {
  const targetCuts = Math.round(clamp(patch.targetCuts ?? state.episode.targetCuts, 1, 500));
  const completedCuts = Math.round(
    clamp(patch.completedCuts ?? state.episode.completedCuts, 0, targetCuts),
  );
  const dailyWorkHours = round1(
    clamp(patch.dailyWorkHours ?? state.episode.dailyWorkHours, 1, 16),
  );
  const nextDeadline =
    patch.deadlineDate && parseIsoDayUtcMs(patch.deadlineDate) !== null
      ? patch.deadlineDate
      : state.episode.deadlineDate;

  return Object.freeze({
    ...state,
    episode: Object.freeze({
      episodeTitle: (patch.episodeTitle ?? state.episode.episodeTitle).trim() || "다음 연재 화",
      deadlineDate: nextDeadline,
      targetCuts,
      completedCuts,
      dailyWorkHours,
    }),
  });
}

export function getActiveTimerElapsedMs(
  timer: ActiveStageTimer | null,
  nowMs: number,
): number {
  if (!timer) return 0;
  const runningDelta = timer.running ? Math.max(0, nowMs - timer.startedAtMs) : 0;
  return Math.max(0, timer.accumulatedMs + runningDelta);
}

export function startStageTimer(
  state: SoloDeadlineMeterState,
  stage: ProductionMeterStageId,
  nowMs: number = Date.now(),
): SoloDeadlineMeterState {
  if (state.activeTimer && state.activeTimer.stage === stage) {
    if (state.activeTimer.running) return state;
    return Object.freeze({
      ...state,
      activeTimer: Object.freeze({
        ...state.activeTimer,
        startedAtMs: nowMs,
        running: true,
      }),
    });
  }
  return Object.freeze({
    ...state,
    activeTimer: Object.freeze({
      stage,
      startedAtMs: nowMs,
      accumulatedMs: 0,
      running: true,
    }),
  });
}

export function pauseStageTimer(
  state: SoloDeadlineMeterState,
  nowMs: number = Date.now(),
): SoloDeadlineMeterState {
  if (!state.activeTimer || !state.activeTimer.running) return state;
  const elapsed = getActiveTimerElapsedMs(state.activeTimer, nowMs);
  return Object.freeze({
    ...state,
    activeTimer: Object.freeze({
      ...state.activeTimer,
      accumulatedMs: elapsed,
      startedAtMs: nowMs,
      running: false,
    }),
  });
}

let sessionSequence = 0;

export function completeActiveStageSession(
  state: SoloDeadlineMeterState,
  input: {
    readonly cutsCompleted: number;
    readonly note?: string;
    readonly incrementEpisodeCuts?: boolean;
  },
  nowMs: number = Date.now(),
): SoloDeadlineMeterState {
  if (!state.activeTimer) return state;
  const elapsedMs = getActiveTimerElapsedMs(state.activeTimer, nowMs);
  const durationMinutes = round2(Math.max(0.5, elapsedMs / 60_000));
  const cutsCompleted = Math.round(clamp(input.cutsCompleted, 0, 200));
  sessionSequence += 1;

  const log: StageWorkSessionLog = Object.freeze({
    id: `meter-sess-${sessionSequence}-${nowMs.toString(36)}`,
    stage: state.activeTimer.stage,
    startedAtMs: nowMs - elapsedMs,
    endedAtMs: nowMs,
    durationMinutes,
    cutsCompleted,
    note: (input.note ?? "").trim(),
  });

  const nextCompleted =
    input.incrementEpisodeCuts && cutsCompleted > 0
      ? Math.min(state.episode.targetCuts, state.episode.completedCuts + cutsCompleted)
      : state.episode.completedCuts;

  return Object.freeze({
    ...state,
    episode: Object.freeze({
      ...state.episode,
      completedCuts: nextCompleted,
    }),
    activeTimer: null,
    sessions: Object.freeze([log, ...state.sessions].slice(0, 240)),
  });
}

export function recordManualStageSession(
  state: SoloDeadlineMeterState,
  input: {
    readonly stage: ProductionMeterStageId;
    readonly durationMinutes: number;
    readonly cutsCompleted: number;
    readonly note?: string;
    readonly incrementEpisodeCuts?: boolean;
  },
  nowMs: number = Date.now(),
): SoloDeadlineMeterState {
  const durationMinutes = round2(clamp(input.durationMinutes, 0.5, 720));
  const cutsCompleted = Math.round(clamp(input.cutsCompleted, 0, 200));
  sessionSequence += 1;

  const log: StageWorkSessionLog = Object.freeze({
    id: `meter-manual-${sessionSequence}-${nowMs.toString(36)}`,
    stage: input.stage,
    startedAtMs: nowMs - Math.round(durationMinutes * 60_000),
    endedAtMs: nowMs,
    durationMinutes,
    cutsCompleted,
    note: (input.note ?? "").trim(),
  });

  const nextCompleted =
    input.incrementEpisodeCuts && cutsCompleted > 0
      ? Math.min(state.episode.targetCuts, state.episode.completedCuts + cutsCompleted)
      : state.episode.completedCuts;

  return Object.freeze({
    ...state,
    episode: Object.freeze({
      ...state.episode,
      completedCuts: nextCompleted,
    }),
    sessions: Object.freeze([log, ...state.sessions].slice(0, 240)),
  });
}

/**
 * 공정별 세션 기록으로부터 컷당 평균 소요시간(분)을 자동 학습한다.
 * - 기록이 0건이면 초기 기준치(`baseline`) 사용
 * - 유효 컷 수가 1~4컷이면 기준치와 실측을 베이지안 혼합(`blended`)해 극단 편향 방지
 * - 유효 컷 수가 5컷 이상이면 최근 세션 가중 EWMA 기반 실측값(`measured`) 적용
 */
export function learnStageMinutesPerCut(
  sessions: readonly StageWorkSessionLog[],
): readonly StageLearnedSpeed[] {
  return Object.freeze(
    PRODUCTION_METER_STAGES.map((stageDef) => {
      const matching = sessions
        .filter((entry) => entry.stage === stageDef.id && entry.cutsCompleted > 0)
        .slice()
        .sort((a, b) => a.endedAtMs - b.endedAtMs);

      if (matching.length === 0) {
        return Object.freeze({
          stage: stageDef.id,
          labelKo: stageDef.labelKo,
          minutesPerCut: stageDef.baselineMinutesPerCut,
          baselineMinutesPerCut: stageDef.baselineMinutesPerCut,
          measuredCuts: 0,
          measuredMinutes: 0,
          sessionCount: 0,
          source: "baseline" as const,
        });
      }

      let measuredCuts = 0;
      let measuredMinutes = 0;
      let ewma = clamp(
        matching[0]!.durationMinutes / matching[0]!.cutsCompleted,
        0.5,
        120,
      );
      for (const entry of matching) {
        measuredCuts += entry.cutsCompleted;
        measuredMinutes += entry.durationMinutes;
        const rate = clamp(entry.durationMinutes / entry.cutsCompleted, 0.5, 120);
        // 최근 세션에 0.45 가중치를 두어 작가의 최신 작업 속도에 적응
        ewma = ewma * 0.55 + rate * 0.45;
      }

      const rawAverage = clamp(measuredMinutes / measuredCuts, 0.5, 120);
      const empirical = rawAverage * 0.5 + ewma * 0.5;

      if (measuredCuts < 5) {
        const weight = measuredCuts / 5;
        const blended = empirical * weight + stageDef.baselineMinutesPerCut * (1 - weight);
        return Object.freeze({
          stage: stageDef.id,
          labelKo: stageDef.labelKo,
          minutesPerCut: round1(blended),
          baselineMinutesPerCut: stageDef.baselineMinutesPerCut,
          measuredCuts,
          measuredMinutes: round1(measuredMinutes),
          sessionCount: matching.length,
          source: "blended" as const,
        });
      }

      return Object.freeze({
        stage: stageDef.id,
        labelKo: stageDef.labelKo,
        minutesPerCut: round1(empirical),
        baselineMinutesPerCut: stageDef.baselineMinutesPerCut,
        measuredCuts,
        measuredMinutes: round1(measuredMinutes),
        sessionCount: matching.length,
        source: "measured" as const,
      });
    }),
  );
}

/**
 * 마감일까지 남은 일수, 잔여 컷 수, 공정별 학습 소요시간을 종합해
 * 하루 목표 컷 수·예상 작업시간·휴재 위험도(안전/주의/긴급)를 산출한다.
 */
export function evaluateSoloDeadlineForecast(
  state: SoloDeadlineMeterState,
  todayDate: string,
): SoloDeadlineForecast {
  const { episode, sessions } = state;
  const stageSpeeds = learnStageMinutesPerCut(sessions);
  const learnedMinutesPerCutTotal = round1(
    stageSpeeds.reduce((sum, item) => sum + item.minutesPerCut, 0),
  );
  const hasMeasuredData = stageSpeeds.some((item) => item.source !== "baseline");

  const { daysRemaining, isOverdue } = calculateRemainingWorkDays(
    todayDate,
    episode.deadlineDate,
  );
  const remainingCuts = Math.max(0, episode.targetCuts - episode.completedCuts);
  const dailyTargetCutsExact =
    remainingCuts === 0
      ? 0
      : daysRemaining > 0
        ? round2(remainingCuts / daysRemaining)
        : remainingCuts;
  const dailyTargetCuts =
    remainingCuts === 0
      ? 0
      : daysRemaining > 0
        ? Math.ceil(remainingCuts / daysRemaining)
        : remainingCuts;

  const estimatedRemainingMinutes = round1(remainingCuts * learnedMinutesPerCutTotal);
  const estimatedRemainingHours = round1(estimatedRemainingMinutes / 60);
  const requiredDailyHours =
    remainingCuts === 0
      ? 0
      : daysRemaining > 0
        ? round2(estimatedRemainingHours / daysRemaining)
        : round2(estimatedRemainingHours);

  const safeDailyCapacity = Math.max(1, episode.dailyWorkHours);
  const capacityRatio =
    remainingCuts === 0
      ? 0
      : daysRemaining <= 0
        ? round2(Math.max(1.5, requiredDailyHours / safeDailyCapacity))
        : round2(requiredDailyHours / safeDailyCapacity);

  let riskLevel: HiatusRiskLevel;
  let guidanceKo: string;

  if (remainingCuts === 0) {
    riskLevel = "safe";
    guidanceKo = "이번 화 목표 컷을 모두 완료했습니다. 최종 검수와 식자 점검만 남았습니다.";
  } else if (isOverdue || daysRemaining <= 0) {
    riskLevel = "urgent";
    guidanceKo = `마감일이 지났고 ${remainingCuts}컷이 남았습니다. 배경 3D 간소화 또는 분량 조정이 필요합니다.`;
  } else if (capacityRatio > 1.05) {
    riskLevel = "urgent";
    guidanceKo = `하루 ${dailyTargetCuts}컷(약 ${requiredDailyHours.toFixed(1)}시간)이 필요해 가용 시간(${safeDailyCapacity}시간)을 초과합니다. 휴재 방지를 위해 컷 분배나 채색 단축을 권합니다.`;
  } else if (capacityRatio > 0.75) {
    riskLevel = "caution";
    guidanceKo = `하루 ${dailyTargetCuts}컷(약 ${requiredDailyHours.toFixed(1)}시간) 페이스가 필요합니다. 오늘 선화·밑색 구간 지연을 막아야 안전합니다.`;
  } else {
    riskLevel = "safe";
    guidanceKo = `하루 ${dailyTargetCuts}컷(약 ${requiredDailyHours.toFixed(1)}시간)이면 여유 있게 마감할 수 있습니다.`;
  }

  const planDays = Math.min(7, Math.max(1, daysRemaining || 1));
  const dailyPlan: DailyDeadlineBurnItem[] = [];
  let runningCompleted = episode.completedCuts;
  for (let offset = 0; offset < planDays; offset += 1) {
    const remainingForDay = Math.max(0, episode.targetCuts - runningCompleted);
    const planned = Math.min(remainingForDay, dailyTargetCuts);
    runningCompleted += planned;
    const date = addDaysToIsoDate(todayDate, offset);
    dailyPlan.push(
      Object.freeze({
        date,
        dayOffset: offset,
        plannedCuts: planned,
        cumulativeCuts: runningCompleted,
        isDeadline: date === episode.deadlineDate,
      }),
    );
  }

  return Object.freeze({
    todayDate,
    deadlineDate: episode.deadlineDate,
    daysRemaining,
    isOverdue,
    remainingCuts,
    dailyTargetCuts,
    dailyTargetCutsExact,
    learnedMinutesPerCutTotal,
    hasMeasuredData,
    estimatedRemainingMinutes,
    estimatedRemainingHours,
    requiredDailyHours,
    capacityRatio,
    riskLevel,
    riskLabelKo: HIATUS_RISK_LABELS[riskLevel],
    guidanceKo,
    stageSpeeds,
    dailyPlan: Object.freeze(dailyPlan),
  });
}

export function formatTimerDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const DEADLINE_METER_STORAGE_KEY = "toonstudio.solo-deadline-meter.v1";

function isStageId(value: unknown): value is ProductionMeterStageId {
  return PRODUCTION_METER_STAGES.some((stage) => stage.id === value);
}

export function loadSoloDeadlineMeterState(todayDate: string): SoloDeadlineMeterState {
  const fallback = createDefaultSoloDeadlineMeterState(todayDate);
  if (typeof globalThis.localStorage === "undefined") return fallback;
  try {
    const raw = globalThis.localStorage.getItem(DEADLINE_METER_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const record = parsed as Record<string, unknown>;
    const episodeRaw = record.episode as Record<string, unknown> | undefined;
    const sessionsRaw = Array.isArray(record.sessions) ? record.sessions : [];
    const validSessions = sessionsRaw
      .filter(
        (item): item is StageWorkSessionLog =>
          typeof item === "object"
          && item !== null
          && isStageId((item as { stage?: unknown }).stage)
          && typeof (item as { durationMinutes?: unknown }).durationMinutes === "number"
          && typeof (item as { cutsCompleted?: unknown }).cutsCompleted === "number",
      )
      .slice(0, 240);

    const activeRaw = record.activeTimer as Record<string, unknown> | null | undefined;
    const validTimer: ActiveStageTimer | null =
      activeRaw
      && isStageId(activeRaw.stage)
      && typeof activeRaw.startedAtMs === "number"
      && typeof activeRaw.accumulatedMs === "number"
      && typeof activeRaw.running === "boolean"
        ? Object.freeze({
            stage: activeRaw.stage,
            startedAtMs: activeRaw.startedAtMs,
            accumulatedMs: activeRaw.accumulatedMs,
            running: activeRaw.running,
          })
        : null;

    const hydrated = updateEpisodeDeadlineTarget(fallback, {
      episodeTitle: typeof episodeRaw?.episodeTitle === "string" ? episodeRaw.episodeTitle : undefined,
      deadlineDate: typeof episodeRaw?.deadlineDate === "string" ? episodeRaw.deadlineDate : undefined,
      targetCuts: typeof episodeRaw?.targetCuts === "number" ? episodeRaw.targetCuts : undefined,
      completedCuts: typeof episodeRaw?.completedCuts === "number" ? episodeRaw.completedCuts : undefined,
      dailyWorkHours: typeof episodeRaw?.dailyWorkHours === "number" ? episodeRaw.dailyWorkHours : undefined,
    });

    return Object.freeze({
      ...hydrated,
      activeTimer: validTimer,
      sessions: Object.freeze(validSessions),
    });
  } catch {
    return fallback;
  }
}

export function saveSoloDeadlineMeterState(state: SoloDeadlineMeterState): boolean {
  if (typeof globalThis.localStorage === "undefined") return false;
  try {
    globalThis.localStorage.setItem(DEADLINE_METER_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
