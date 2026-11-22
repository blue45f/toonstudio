/**
 * ₩0 로컬 주간 컷 완성 속도 이동평균(SMA/EMA) 기반 3주 전 휴재·번아웃 위험 조기 예측기,
 * 50분 연속 작업 손목 휴식 마이크로 브레이크 상태 계약,
 * 00:00~06:00 심야 마감 강행 무음·접힘 자동 억제 엔진.
 *
 * - 외부 네트워크/API 및 browser storage(localStorage/sessionStorage/indexedDB) 호출 0건.
 * - 모든 시각 판정은 주입된 결정론 시계(DeterministicLocalClock)로 재현 가능하다.
 */

import { clampNum, round1, round2, type BufferHealthTier } from "./hiatus-shield-types";

export const DEFAULT_VELOCITY_WINDOW_WEEKS = 4;
export const DEFAULT_VELOCITY_EMA_ALPHA = 0.45;
export const DEFAULT_DANGER_BUFFER_WEEKS = 0.5;
export const DEFAULT_BACKGROUND_CUT_SHARE = 0.35;
export const DEFAULT_WORK_HOURS_PER_DAY = 8;
export const DEFAULT_WRIST_BREAK_INTERVAL_MINUTES = 50;
export const DEFAULT_WRIST_BREAK_DURATION_MINUTES = 3;
export const LATE_NIGHT_QUIET_START_HOUR = 0;
export const LATE_NIGHT_QUIET_END_HOUR = 6;

export interface WeeklyCutVelocitySample {
  /** 주차 인덱스 (오래된 주 → 최근 주 순으로 증가) */
  readonly weekIndex: number;
  /** 화면 표시용 주차 라벨 (예: "10화 주간") */
  readonly weekLabel: string;
  /** 해당 주간 실측 완성 컷 수 */
  readonly completedCuts: number;
  /** 실측 컷당 평균 소요 시간 (분) */
  readonly avgMinutesPerCut: number;
  /** 주간 스트로크 누적 작업 시간 (분) */
  readonly cumulativeStrokeMinutes: number;
  /** 선택: 해당 주간 배경 비중이 높은 컷 수 */
  readonly backgroundCutsCount?: number;
}

export interface VelocityMovingAverageMetrics {
  readonly sampleCount: number;
  readonly windowSize: number;
  readonly emaAlpha: number;
  readonly smaCutsPerWeek: number;
  readonly emaCutsPerWeek: number;
  readonly smaMinutesPerCut: number;
  readonly emaMinutesPerCut: number;
  readonly smaStrokeHoursPerWeek: number;
  readonly emaStrokeHoursPerWeek: number;
  /** 최근 창 기준 주간 컷 완성 속도 기울기 (음수면 둔화 추세) */
  readonly weeklyDriftCuts: number;
  /** 기준(초기 샘플) 대비 최근 컷당 소요 시간 변화율 (%) */
  readonly minutesPerCutTrendPct: number;
  /** 보수적 실효 주간 컷 완성 속도 (SMA·EMA 중 낮은 값 기준) */
  readonly effectiveWeeklyVelocity: number;
}

export type VelocityForecastStage =
  | "stable"
  | "watch"
  | "early_warning_2_3w"
  | "imminent";

export interface WeeklyBufferTrajectoryPoint {
  readonly weekOffset: number;
  readonly projectedCuts: number;
  readonly weeklyDeficitCuts: number;
  readonly projectedBufferWeeks: number;
  readonly projectedBufferWithOutsourceWeeks: number;
}

export interface BgOutsourceSplitRecommendation {
  readonly shouldRecommend: boolean;
  readonly recommendedBgOutsourceCuts: number;
  readonly maxAvailableBgCuts: number;
  readonly estimatedMinutesSavedPerBgCut: number;
  readonly savedHoursPerWeek: number;
  /** 회차(주)당 확보되는 작업 일수 */
  readonly estimatedRecoveryDaysPerEpisode: number;
  /** 예측 구간(최대 3주) 누적 예상 일정 회복일 */
  readonly estimatedRecoveryDays: number;
  readonly projectedWeeklyCutsAfterOutsource: number;
  readonly quietRecommendationKo: string;
  readonly quietRecommendationEn: string;
}

export interface ThreeWeekHiatusForecastInput {
  readonly samples: readonly WeeklyCutVelocitySample[];
  readonly targetWeeklyCuts: number;
  readonly currentBufferWeeks: number;
  /** 비축 원고 위험선 하한 (기본 0.5주 미만 진입 시 휴재 위험선 도달) */
  readonly dangerBufferWeeks?: number;
  /** 회차 내 배경 공정 외주 분리 가능 비중 (기본 0.35) */
  readonly backgroundCutShareRatio?: number;
  /** 배경 1컷 외주 분리 시 메인 작가 절감 시간(분). 미지정 시 EMA 컷당 시간 × 0.65 */
  readonly outsourceMinutesSavedPerBgCut?: number;
  readonly workHoursPerDay?: number;
  readonly windowSize?: number;
  readonly emaAlpha?: number;
}

export interface ThreeWeekHiatusForecast {
  readonly metrics: VelocityMovingAverageMetrics;
  readonly targetWeeklyCuts: number;
  readonly currentBufferWeeks: number;
  readonly dangerBufferWeeks: number;
  readonly weeklyDeficitCuts: number;
  /** 위험선 도달까지 남은 예상 주수 (12주 내 미도달 시 null) */
  readonly weeksUntilDangerLine: number | null;
  readonly stage: VelocityForecastStage;
  readonly tier: BufferHealthTier;
  readonly isTwoToThreeWeekEarlyWindow: boolean;
  readonly trajectory: readonly WeeklyBufferTrajectoryPoint[];
  readonly outsourceRecommendation: BgOutsourceSplitRecommendation;
  readonly headlineKo: string;
  readonly headlineEn: string;
}

export interface DeterministicLocalClock {
  /** 현지 시각 시(0~23). 지정 시 Date 대신 결정론적으로 사용 */
  readonly localHour?: number;
  /** 현지 시각 분(0~59) */
  readonly localMinute?: number;
  /** Date 주입 시 getHours()/getMinutes()로 현지 시각 산출 */
  readonly now?: Date;
}

export interface LateNightSuppressionPolicy {
  readonly localHour: number;
  readonly localMinute: number;
  readonly formattedLocalTime: string;
  /** 현지 시각 00:00 <= hour < 06:00 심야 마감 구간 여부 */
  readonly isLateNightQuietWindow: boolean;
  readonly presentationMode: "silent_collapsed" | "quiet_inline";
  /** 팝업/모달 차단 불변식 */
  readonly allowPopup: false;
  readonly allowSound: boolean;
  readonly autoCollapsed: boolean;
  readonly suppressCoachingPrompts: boolean;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface WristMicroBreakInput {
  readonly continuousWorkMinutes: number;
  readonly breakIntervalMinutes?: number;
  readonly recommendedBreakDurationMinutes?: number;
  /** 사용자가 이미 확인 완료한 50분 주기 번호 (기본 0) */
  readonly acknowledgedCycleIndex?: number;
  readonly clock?: DeterministicLocalClock;
}

export type WristMicroBreakVisibility = "hidden" | "collapsed_silent" | "inline_badge";

export interface WristMicroBreakBadgeState {
  readonly continuousWorkMinutes: number;
  readonly breakIntervalMinutes: number;
  readonly recommendedBreakDurationMinutes: number;
  readonly completedWorkCycles: number;
  readonly minutesUntilNextBreak: number;
  readonly dueNow: boolean;
  /** 항상 비차단 1줄 배지 계약 */
  readonly nonBlockingSingleLine: true;
  readonly popupForbidden: true;
  readonly visibilityState: WristMicroBreakVisibility;
  readonly lateNightPolicy: LateNightSuppressionPolicy;
  readonly badgeLineKo: string;
  readonly badgeLineEn: string;
}

export interface HiatusCoachingSurfaceState {
  readonly lateNightPolicy: LateNightSuppressionPolicy;
  readonly allCoachingSilentlyCollapsed: boolean;
  readonly forecastCollapsedByDefault: boolean;
  readonly earlyWarningsCollapsedByDefault: boolean;
  readonly wristBreak: WristMicroBreakBadgeState;
  readonly popupAllowed: false;
}

function safeNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function computeMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function computeEma(values: readonly number[], alpha: number): number {
  if (values.length === 0) return 0;
  let ema = values[0] ?? 0;
  for (let i = 1; i < values.length; i += 1) {
    const current = values[i] ?? ema;
    ema = alpha * current + (1 - alpha) * ema;
  }
  return ema;
}

function computeLinearSlope(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = computeMean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - meanX;
    const dy = (values[i] ?? meanY) - meanY;
    num += dx * dy;
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * 관제실 초기 시연용 4주 실측 컷 속도·스트로크 누적 샘플을 생성한다.
 * 비축 1주 기준 위험선(0.5주) 도달 2~3주 전 조기 경보 구간에 정확히 진입하도록 구성된다.
 */
export function createStarterWeeklyVelocitySamples(): readonly WeeklyCutVelocitySample[] {
  return [
    {
      weekIndex: 1,
      weekLabel: "10화 주간",
      completedCuts: 78,
      avgMinutesPerCut: 26,
      cumulativeStrokeMinutes: 2028,
      backgroundCutsCount: 24,
    },
    {
      weekIndex: 2,
      weekLabel: "11화 주간",
      completedCuts: 72,
      avgMinutesPerCut: 30,
      cumulativeStrokeMinutes: 2160,
      backgroundCutsCount: 25,
    },
    {
      weekIndex: 3,
      weekLabel: "12화 주간",
      completedCuts: 67,
      avgMinutesPerCut: 34,
      cumulativeStrokeMinutes: 2278,
      backgroundCutsCount: 26,
    },
    {
      weekIndex: 4,
      weekLabel: "13화 주간",
      completedCuts: 63,
      avgMinutesPerCut: 38,
      cumulativeStrokeMinutes: 2394,
      backgroundCutsCount: 27,
    },
  ];
}

/**
 * 실측 컷당 소요 시간·완성 컷 수·스트로크 누적 시간의 SMA/EMA 이동평균을 계산한다.
 */
export function computeWeeklyVelocityMovingAverages(
  samples: readonly WeeklyCutVelocitySample[],
  options?: {
    readonly windowSize?: number;
    readonly emaAlpha?: number;
  },
): VelocityMovingAverageMetrics {
  const windowSize = Math.max(1, Math.round(options?.windowSize ?? DEFAULT_VELOCITY_WINDOW_WEEKS));
  const emaAlpha = round2(clampNum(options?.emaAlpha ?? DEFAULT_VELOCITY_EMA_ALPHA, 0.1, 0.9));

  if (samples.length === 0) {
    return {
      sampleCount: 0,
      windowSize,
      emaAlpha,
      smaCutsPerWeek: 0,
      emaCutsPerWeek: 0,
      smaMinutesPerCut: 0,
      emaMinutesPerCut: 0,
      smaStrokeHoursPerWeek: 0,
      emaStrokeHoursPerWeek: 0,
      weeklyDriftCuts: 0,
      minutesPerCutTrendPct: 0,
      effectiveWeeklyVelocity: 0,
    };
  }

  const ordered = [...samples].sort((a, b) => a.weekIndex - b.weekIndex);
  const recentWindow = ordered.slice(-windowSize);

  const allCuts = ordered.map((s) => safeNonNegative(s.completedCuts));
  const allMinPerCut = ordered.map((s) => safeNonNegative(s.avgMinutesPerCut));
  const allStrokeHours = ordered.map((s) => safeNonNegative(s.cumulativeStrokeMinutes) / 60);

  const windowCuts = recentWindow.map((s) => safeNonNegative(s.completedCuts));
  const windowMinPerCut = recentWindow.map((s) => safeNonNegative(s.avgMinutesPerCut));
  const windowStrokeHours = recentWindow.map((s) => safeNonNegative(s.cumulativeStrokeMinutes) / 60);

  const smaCutsPerWeek = round1(computeMean(windowCuts));
  const emaCutsPerWeek = round1(computeEma(allCuts, emaAlpha));
  const smaMinutesPerCut = round1(computeMean(windowMinPerCut));
  const emaMinutesPerCut = round1(computeEma(allMinPerCut, emaAlpha));
  const smaStrokeHoursPerWeek = round1(computeMean(windowStrokeHours));
  const emaStrokeHoursPerWeek = round1(computeEma(allStrokeHours, emaAlpha));

  const weeklyDriftCuts = round2(computeLinearSlope(windowCuts));
  const firstWindowMin = windowMinPerCut[0] ?? 0;
  const lastWindowMin = windowMinPerCut[windowMinPerCut.length - 1] ?? 0;
  const minutesPerCutTrendPct =
    firstWindowMin > 0 ? round1(((lastWindowMin - firstWindowMin) / firstWindowMin) * 100) : 0;

  const effectiveWeeklyVelocity = round1(Math.min(smaCutsPerWeek, emaCutsPerWeek));

  return {
    sampleCount: ordered.length,
    windowSize,
    emaAlpha,
    smaCutsPerWeek,
    emaCutsPerWeek,
    smaMinutesPerCut,
    emaMinutesPerCut,
    smaStrokeHoursPerWeek,
    emaStrokeHoursPerWeek,
    weeklyDriftCuts,
    minutesPerCutTrendPct,
    effectiveWeeklyVelocity,
  };
}

/**
 * 이동평균(SMA/EMA)과 둔화 기울기를 바탕으로 위험선 도달 시점(2~3주 전)을 조기 예측하고,
 * 배경 N컷 외주 분리 추천 및 예상 일정 회복일을 역산한다.
 */
export function forecastThreeWeekHiatusRisk(
  input: ThreeWeekHiatusForecastInput,
): ThreeWeekHiatusForecast {
  const targetWeeklyCuts = Math.max(1, Math.round(safeNonNegative(input.targetWeeklyCuts)));
  const currentBufferWeeks = round2(safeNonNegative(input.currentBufferWeeks));
  const dangerBufferWeeks = round2(
    clampNum(input.dangerBufferWeeks ?? DEFAULT_DANGER_BUFFER_WEEKS, 0, 2.5),
  );
  const bgShare = clampNum(input.backgroundCutShareRatio ?? DEFAULT_BACKGROUND_CUT_SHARE, 0.1, 0.6);
  const workHoursPerDay = Math.max(1, safeNonNegative(input.workHoursPerDay ?? DEFAULT_WORK_HOURS_PER_DAY));

  const metrics = computeWeeklyVelocityMovingAverages(input.samples, {
    windowSize: input.windowSize,
    emaAlpha: input.emaAlpha,
  });

  const weeklyDeficitCuts =
    metrics.sampleCount === 0
      ? 0
      : round1(Math.max(0, targetWeeklyCuts - metrics.effectiveWeeklyVelocity));

  // 음수 둔화 추세만 보수적으로 감쇠(0.3) 반영해 12주 시뮬레이션
  const conservativeNegativeDrift = Math.min(0, metrics.weeklyDriftCuts) * 0.3;

  let weeksUntilDangerLine: number | null = null;
  if (currentBufferWeeks <= dangerBufferWeeks) {
    weeksUntilDangerLine = 0;
  } else if (metrics.sampleCount > 0) {
    let simBuffer = currentBufferWeeks;
    for (let week = 1; week <= 12; week += 1) {
      const projectedCuts = Math.max(
        0,
        metrics.effectiveWeeklyVelocity + conservativeNegativeDrift * (week - 1),
      );
      const deficit = Math.max(0, targetWeeklyCuts - projectedCuts);
      const burnWeeks = deficit / targetWeeklyCuts;
      if (burnWeeks <= 0) break;
      const nextBuffer = simBuffer - burnWeeks;
      if (nextBuffer <= dangerBufferWeeks) {
        const fraction = clampNum((simBuffer - dangerBufferWeeks) / burnWeeks, 0, 1);
        weeksUntilDangerLine = round1(week - 1 + fraction);
        break;
      }
      simBuffer = nextBuffer;
    }
  }

  const stage: VelocityForecastStage =
    weeksUntilDangerLine !== null && weeksUntilDangerLine < 1.5
      ? "imminent"
      : weeksUntilDangerLine !== null && weeksUntilDangerLine <= 3.5
        ? "early_warning_2_3w"
        : weeksUntilDangerLine !== null && weeksUntilDangerLine <= 6
          ? "watch"
          : "stable";

  const tier: BufferHealthTier =
    stage === "imminent" ? "red" : stage === "early_warning_2_3w" || stage === "watch" ? "amber" : "green";
  const isTwoToThreeWeekEarlyWindow = stage === "early_warning_2_3w";

  // 배경 외주 분리 역산
  const avgSampleBgCuts =
    input.samples.length > 0
      ? computeMean(
          input.samples.map((s) =>
            s.backgroundCutsCount !== undefined
              ? safeNonNegative(s.backgroundCutsCount)
              : targetWeeklyCuts * bgShare,
          ),
        )
      : targetWeeklyCuts * bgShare;
  const maxAvailableBgCuts = Math.max(
    4,
    Math.min(targetWeeklyCuts, Math.round(Math.max(targetWeeklyCuts * bgShare, avgSampleBgCuts))),
  );

  const effectiveMinPerCut = Math.max(15, metrics.emaMinutesPerCut || metrics.smaMinutesPerCut || 25);
  const estimatedMinutesSavedPerBgCut = round1(
    Math.max(12, input.outsourceMinutesSavedPerBgCut ?? effectiveMinPerCut * 0.65),
  );

  const shouldRecommend =
    stage !== "stable" && (weeklyDeficitCuts > 0 || currentBufferWeeks <= dangerBufferWeeks);

  let recommendedBgOutsourceCuts = 0;
  let savedHoursPerWeek = 0;
  let estimatedRecoveryDaysPerEpisode = 0;
  let estimatedRecoveryDays = 0;
  let projectedWeeklyCutsAfterOutsource = metrics.effectiveWeeklyVelocity;

  if (shouldRecommend) {
    const recoveryDeficitCuts = Math.max(weeklyDeficitCuts, 4) * 1.15;
    const minutesNeeded = recoveryDeficitCuts * effectiveMinPerCut;
    const rawBgCuts = Math.ceil(minutesNeeded / estimatedMinutesSavedPerBgCut);
    recommendedBgOutsourceCuts = clampNum(rawBgCuts, 4, maxAvailableBgCuts);

    const savedMinutesPerWeek = recommendedBgOutsourceCuts * estimatedMinutesSavedPerBgCut;
    savedHoursPerWeek = round1(savedMinutesPerWeek / 60);
    estimatedRecoveryDaysPerEpisode = round1(savedHoursPerWeek / workHoursPerDay);

    const horizonWeeks = clampNum(
      Math.ceil(weeksUntilDangerLine !== null && weeksUntilDangerLine > 0 ? weeksUntilDangerLine : 2),
      1,
      3,
    );
    estimatedRecoveryDays = round1(
      Math.max(0.5, (savedHoursPerWeek * horizonWeeks) / workHoursPerDay),
    );
    const addedCutsEquivalent = savedMinutesPerWeek / effectiveMinPerCut;
    projectedWeeklyCutsAfterOutsource = round1(
      Math.min(targetWeeklyCuts * 1.15, metrics.effectiveWeeklyVelocity + addedCutsEquivalent),
    );
  }

  // 4주 예측 궤적 (외주 분리 전 vs 분리 후 비교)
  const trajectory: WeeklyBufferTrajectoryPoint[] = [];
  let rawBuf = currentBufferWeeks;
  let recBuf = currentBufferWeeks;
  for (let weekOffset = 1; weekOffset <= 4; weekOffset += 1) {
    const projectedCuts = round1(
      Math.max(0, metrics.effectiveWeeklyVelocity + conservativeNegativeDrift * (weekOffset - 1)),
    );
    const deficit = round1(Math.max(0, targetWeeklyCuts - projectedCuts));
    rawBuf = round2(Math.max(0, rawBuf - deficit / targetWeeklyCuts));

    const recCuts = shouldRecommend
      ? Math.max(0, projectedWeeklyCutsAfterOutsource + conservativeNegativeDrift * 0.25 * (weekOffset - 1))
      : projectedCuts;
    const recDelta = (recCuts - targetWeeklyCuts) / targetWeeklyCuts;
    recBuf = round2(clampNum(recBuf + recDelta, 0, 6));

    trajectory.push({
      weekOffset,
      projectedCuts,
      weeklyDeficitCuts: deficit,
      projectedBufferWeeks: rawBuf,
      projectedBufferWithOutsourceWeeks: recBuf,
    });
  }

  const quietRecommendationKo = shouldRecommend
    ? `배경 ${recommendedBgOutsourceCuts}컷 외주 분리 추천 · 주당 ${savedHoursPerWeek}시간 절감 · 예상 일정 +${estimatedRecoveryDays}일 회복`
    : "현재 주간 완성 속도가 안정적이어서 별도 외주 분리가 필요하지 않습니다.";
  const quietRecommendationEn = shouldRecommend
    ? `Quiet suggestion: outsource ${recommendedBgOutsourceCuts} background cuts · save ${savedHoursPerWeek}h/wk · est. +${estimatedRecoveryDays}d schedule recovery`
    : "Weekly cut velocity is steady; no background outsourcing split needed.";

  const headlineKo =
    stage === "imminent"
      ? `위험선 도달 임박(${weeksUntilDangerLine ?? 0}주) — 배경 ${recommendedBgOutsourceCuts}컷 외주 분리 즉시 검토`
      : stage === "early_warning_2_3w"
        ? `위험선 도달 약 ${weeksUntilDangerLine}주 전 조기 포착 — 배경 ${recommendedBgOutsourceCuts}컷 외주 분리로 일정 +${estimatedRecoveryDays}일 회복 가능`
        : stage === "watch"
          ? `완만한 속도 저하 감지(약 ${weeksUntilDangerLine}주 후 위험선 접근) — 배경 ${recommendedBgOutsourceCuts}컷 사전 분리 후보`
          : `주간 완성 속도 안정 (EMA ${metrics.emaCutsPerWeek}컷/주 · 위험선 여유)`;

  const headlineEn =
    stage === "imminent"
      ? `Danger threshold imminent (${weeksUntilDangerLine ?? 0}w) — review ${recommendedBgOutsourceCuts}-cut background outsource`
      : stage === "early_warning_2_3w"
        ? `Early signal ~${weeksUntilDangerLine}w before danger line — outsource ${recommendedBgOutsourceCuts} bg cuts to recover +${estimatedRecoveryDays}d`
        : stage === "watch"
          ? `Mild pace drift (~${weeksUntilDangerLine}w to danger line) — optional ${recommendedBgOutsourceCuts}-cut bg split`
          : `Weekly velocity stable (EMA ${metrics.emaCutsPerWeek} cuts/wk)`;

  return {
    metrics,
    targetWeeklyCuts,
    currentBufferWeeks,
    dangerBufferWeeks,
    weeklyDeficitCuts,
    weeksUntilDangerLine,
    stage,
    tier,
    isTwoToThreeWeekEarlyWindow,
    trajectory,
    outsourceRecommendation: {
      shouldRecommend,
      recommendedBgOutsourceCuts,
      maxAvailableBgCuts,
      estimatedMinutesSavedPerBgCut,
      savedHoursPerWeek,
      estimatedRecoveryDaysPerEpisode,
      estimatedRecoveryDays,
      projectedWeeklyCutsAfterOutsource,
      quietRecommendationKo,
      quietRecommendationEn,
    },
    headlineKo,
    headlineEn,
  };
}

function resolveLocalHourAndMinute(clock?: DeterministicLocalClock): {
  readonly hour: number;
  readonly minute: number;
} {
  if (clock?.localHour !== undefined && Number.isFinite(clock.localHour)) {
    const normalizedHour = ((Math.floor(clock.localHour) % 24) + 24) % 24;
    const rawMinute =
      typeof clock.localMinute === "number" && Number.isFinite(clock.localMinute)
        ? Math.floor(clock.localMinute)
        : 0;
    const normalizedMinute = clampNum(rawMinute, 0, 59);
    return { hour: normalizedHour, minute: normalizedMinute };
  }
  if (clock?.now instanceof Date && !Number.isNaN(clock.now.getTime())) {
    return { hour: clock.now.getHours(), minute: clock.now.getMinutes() };
  }
  const now = new Date();
  return { hour: now.getHours(), minute: now.getMinutes() };
}

/**
 * #075: 현지 시각 00:00 <= hour < 06:00 심야 마감 강행 구간에서는
 * 모든 코칭·휴식 배지를 팝업 없이 무음·접힘 상태로 자동 전환한다.
 */
export function evaluateLateNightCoachingSuppression(
  clock?: DeterministicLocalClock,
): LateNightSuppressionPolicy {
  const { hour, minute } = resolveLocalHourAndMinute(clock);
  const formattedLocalTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const isLateNightQuietWindow =
    hour >= LATE_NIGHT_QUIET_START_HOUR && hour < LATE_NIGHT_QUIET_END_HOUR;

  return {
    localHour: hour,
    localMinute: minute,
    formattedLocalTime,
    isLateNightQuietWindow,
    presentationMode: isLateNightQuietWindow ? "silent_collapsed" : "quiet_inline",
    allowPopup: false,
    allowSound: false,
    autoCollapsed: isLateNightQuietWindow,
    suppressCoachingPrompts: isLateNightQuietWindow,
    summaryKo: isLateNightQuietWindow
      ? `심야 마감 무음 억제(${formattedLocalTime}) · 00:00~06:00 구간 코칭·휴식 배지 자동 접힘`
      : `주간 조용한 코칭(${formattedLocalTime}) · 팝업 없이 1줄 인라인 표시`,
    summaryEn: isLateNightQuietWindow
      ? `Late-night silent guard (${formattedLocalTime}) · Coaching & rest badges auto-collapsed (00:00-06:00)`
      : `Quiet inline coaching (${formattedLocalTime}) · Non-blocking without popups`,
  };
}

/**
 * 50분 연속 작업마다 비차단 1줄 손목 휴식 마이크로 브레이크 배지 상태를 산출한다.
 * 00:00~06:00 구간에는 자동으로 collapsed_silent 상태로 억제된다.
 */
export function evaluateWristMicroBreakState(
  input: WristMicroBreakInput,
): WristMicroBreakBadgeState {
  const continuousWorkMinutes = Math.round(safeNonNegative(input.continuousWorkMinutes));
  const breakIntervalMinutes = Math.max(
    10,
    Math.round(safeNonNegative(input.breakIntervalMinutes ?? DEFAULT_WRIST_BREAK_INTERVAL_MINUTES)),
  );
  const recommendedBreakDurationMinutes = Math.max(
    1,
    Math.round(
      safeNonNegative(
        input.recommendedBreakDurationMinutes ?? DEFAULT_WRIST_BREAK_DURATION_MINUTES,
      ),
    ),
  );
  const acknowledgedCycleIndex = Math.max(
    0,
    Math.floor(safeNonNegative(input.acknowledgedCycleIndex ?? 0)),
  );

  const completedWorkCycles = Math.floor(continuousWorkMinutes / breakIntervalMinutes);
  const remainder = continuousWorkMinutes % breakIntervalMinutes;
  const dueNow = completedWorkCycles >= 1 && completedWorkCycles > acknowledgedCycleIndex;
  const minutesUntilNextBreak = dueNow ? 0 : breakIntervalMinutes - remainder;

  const lateNightPolicy = evaluateLateNightCoachingSuppression(input.clock);
  const visibilityState: WristMicroBreakVisibility = !dueNow
    ? "hidden"
    : lateNightPolicy.isLateNightQuietWindow
      ? "collapsed_silent"
      : "inline_badge";

  const badgeLineKo =
    visibilityState === "collapsed_silent"
      ? `심야 무음 접힘(${lateNightPolicy.formattedLocalTime}) · 연속 ${continuousWorkMinutes}분 경과`
      : dueNow
        ? `연속 ${continuousWorkMinutes}분 작업 완료 · 손목 ${recommendedBreakDurationMinutes}분 스트레칭 권장 (비차단)`
        : `연속 작업 ${continuousWorkMinutes}분 · 다음 손목 휴식까지 ${minutesUntilNextBreak}분`;

  const badgeLineEn =
    visibilityState === "collapsed_silent"
      ? `Silent night collapse (${lateNightPolicy.formattedLocalTime}) · ${continuousWorkMinutes}m continuous`
      : dueNow
        ? `${continuousWorkMinutes}m straight · ${recommendedBreakDurationMinutes}m wrist stretch suggested (non-blocking)`
        : `${continuousWorkMinutes}m active · ${minutesUntilNextBreak}m until next wrist micro-break`;

  return {
    continuousWorkMinutes,
    breakIntervalMinutes,
    recommendedBreakDurationMinutes,
    completedWorkCycles,
    minutesUntilNextBreak,
    dueNow,
    nonBlockingSingleLine: true,
    popupForbidden: true,
    visibilityState,
    lateNightPolicy,
    badgeLineKo,
    badgeLineEn,
  };
}

/**
 * 3주 조기 예측 코칭·경보·손목 휴식 배지의 통합 표시 정책을 계산한다.
 * 00:00~06:00 심야 구간에서는 모든 코칭/휴식 배지를 무음·접힘 상태로 통일한다.
 */
export function evaluateHiatusCoachingSurface(params: {
  readonly continuousWorkMinutes: number;
  readonly acknowledgedBreakCycle?: number;
  readonly clock?: DeterministicLocalClock;
}): HiatusCoachingSurfaceState {
  const wristBreak = evaluateWristMicroBreakState({
    continuousWorkMinutes: params.continuousWorkMinutes,
    acknowledgedCycleIndex: params.acknowledgedBreakCycle,
    clock: params.clock,
  });
  const lateNightPolicy = wristBreak.lateNightPolicy;

  return {
    lateNightPolicy,
    allCoachingSilentlyCollapsed: lateNightPolicy.isLateNightQuietWindow,
    forecastCollapsedByDefault: lateNightPolicy.autoCollapsed,
    earlyWarningsCollapsedByDefault: lateNightPolicy.autoCollapsed,
    wristBreak,
    popupAllowed: false,
  };
}
