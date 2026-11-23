/**
 * 1인 스튜디오 마감 캘린더 & 공정별 소요시간 자동 계측기 패널 (₩0 로컬).
 *
 * `StudioProductionCalendar` 내부에 연결되어 콘티/선화/밑색/명암/식자 공정별 타이머,
 * 컷당 평균 소요시간(분) 자동 학습, 다음 화 마감까지 남은 일수 대비 하루 목표 컷 수 및
 * 휴재 위험도(안전·주의·긴급)를 실시간으로 계산해 보여 준다.
 */

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Pause,
  Play,
  PlusCircle,
  ShieldAlert,
  SquareCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  PRODUCTION_METER_STAGES,
  completeActiveStageSession,
  evaluateSoloDeadlineForecast,
  formatTimerDuration,
  getActiveTimerElapsedMs,
  loadSoloDeadlineMeterState,
  pauseStageTimer,
  recordManualStageSession,
  saveSoloDeadlineMeterState,
  startStageTimer,
  updateEpisodeDeadlineTarget,
  type HiatusRiskLevel,
  type ProductionMeterStageId,
  type SoloDeadlineMeterState,
} from "./deadline-meter-engine";

import { StudioLargePmConveyorConsole } from "../smart-defaults-pm-ops";

import { cn } from "@/shared/lib/utils";

export interface StudioSoloDeadlineMeterPanelProps {
  /** YYYY-MM-DD 형식의 기준 오늘 날짜. */
  readonly today: string;
  /** 캘린더의 미완료 작업 수 등 보조 맥락(선택). */
  readonly activeTaskCount?: number;
}

const RISK_BADGE_STYLES: Readonly<Record<HiatusRiskLevel, string>> = {
  safe: "border-good/40 bg-good/10 text-good",
  caution: "border-warn/40 bg-warn/10 text-warn",
  urgent: "border-bad/45 bg-bad/10 text-bad",
};

function RiskIcon({ level }: { readonly level: HiatusRiskLevel }) {
  if (level === "safe") {
    return <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />;
  }
  if (level === "caution") {
    return <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />;
  }
  return <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />;
}

export function StudioSoloDeadlineMeterPanel({
  today,
  activeTaskCount,
}: StudioSoloDeadlineMeterPanelProps) {
  const [state, setState] = useState<SoloDeadlineMeterState>(() =>
    loadSoloDeadlineMeterState(today),
  );
  const [selectedStage, setSelectedStage] = useState<ProductionMeterStageId>("lineart");
  const [sessionCutsInput, setSessionCutsInput] = useState("4");
  const [manualMinutesInput, setManualMinutesInput] = useState("45");
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [pmConveyorOpen, setPmConveyorOpen] = useState<boolean>(false);

  const runningTimer = state.activeTimer?.running ?? false;
  useEffect(() => {
    if (!runningTimer) return undefined;
    const intervalId = globalThis.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => globalThis.clearInterval(intervalId);
  }, [runningTimer]);

  const commitState = (next: SoloDeadlineMeterState) => {
    setState(next);
    saveSoloDeadlineMeterState(next);
  };

  const forecast = useMemo(
    () => evaluateSoloDeadlineForecast(state, today),
    [state, today],
  );

  const elapsedMs = getActiveTimerElapsedMs(state.activeTimer, nowMs);
  const activeStageLabel = state.activeTimer
    ? PRODUCTION_METER_STAGES.find((s) => s.id === state.activeTimer?.stage)?.labelKo ?? "작업"
    : null;

  const handleStartOrResume = () => {
    const currentNow = Date.now();
    setNowMs(currentNow);
    const stageToRun = state.activeTimer ? state.activeTimer.stage : selectedStage;
    const next = startStageTimer(state, stageToRun, currentNow);
    commitState(next);
    const label = PRODUCTION_METER_STAGES.find((s) => s.id === stageToRun)?.labelKo ?? stageToRun;
    setStatusNotice(`${label} 공정 계측 타이머를 시작했습니다.`);
  };

  const handlePause = () => {
    const currentNow = Date.now();
    setNowMs(currentNow);
    const next = pauseStageTimer(state, currentNow);
    commitState(next);
    setStatusNotice("공정 계측 타이머를 일시 정지했습니다.");
  };

  const handleCompleteSession = () => {
    if (!state.activeTimer) return;
    const currentNow = Date.now();
    setNowMs(currentNow);
    const cuts = Math.max(0, Number.parseInt(sessionCutsInput, 10) || 0);
    const finishedStage = state.activeTimer.stage;
    const next = completeActiveStageSession(
      state,
      { cutsCompleted: cuts, incrementEpisodeCuts: finishedStage === "lettering" },
      currentNow,
    );
    commitState(next);
    const label = PRODUCTION_METER_STAGES.find((s) => s.id === finishedStage)?.labelKo ?? finishedStage;
    setStatusNotice(`${label} 세션을 저장해 컷당 소요시간에 반영했습니다 (${cuts}컷).`);
  };

  const handleRecordManual = () => {
    const durationMinutes = Math.max(1, Number.parseFloat(manualMinutesInput) || 0);
    const cuts = Math.max(1, Number.parseInt(sessionCutsInput, 10) || 1);
    const next = recordManualStageSession(
      state,
      {
        stage: selectedStage,
        durationMinutes,
        cutsCompleted: cuts,
        note: "수동 기록",
      },
      Date.now(),
    );
    commitState(next);
    const label = PRODUCTION_METER_STAGES.find((s) => s.id === selectedStage)?.labelKo ?? selectedStage;
    setStatusNotice(`${label} ${durationMinutes}분(${cuts}컷) 기록으로 컷당 평균 속도를 갱신했습니다.`);
  };

  return (
    <section
      aria-label="1인 스튜디오 마감 캘린더 및 공정별 소요시간 자동 계측기"
      data-testid="studio-solo-deadline-meter-panel"
      className="space-y-4 rounded-xl border border-line bg-card p-4 text-fg"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line/60 pb-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-fg [word-break:keep-all]">
            <CalendarClock className="size-4 shrink-0 text-accent" aria-hidden="true" />
            1인 스튜디오 마감 캘린더 & 공정별 소요시간 계측기
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2 [word-break:keep-all]">
            공정별 실제 작업 시간을 로컬에 기록해 컷당 소요시간을 자동 학습하고 휴재 위험도를 계산합니다 (서버 ₩0).
            {typeof activeTaskCount === "number" ? ` · 현재 연동 작업 ${activeTaskCount}건` : ""}
          </p>
        </div>
        <span
          data-testid="deadline-meter-risk-badge"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-extrabold",
            RISK_BADGE_STYLES[forecast.riskLevel],
          )}
        >
          <RiskIcon level={forecast.riskLevel} />
          휴재 위험도: {forecast.riskLabelKo}
        </span>
      </header>

      {/* 핵심 지표 4칸 (tabular-nums) */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-lg border border-line bg-panel p-3">
          <span className="block text-[0.6875rem] font-semibold text-fg-3">마감까지 남은 일수</span>
          <strong className="mt-1 block text-lg font-extrabold tabular-nums text-fg" data-testid="deadline-meter-days">
            {forecast.isOverdue ? "마감 경과" : `D-${Math.max(0, forecast.daysRemaining - 1)} (${forecast.daysRemaining}일)`}
          </strong>
        </div>
        <div className="rounded-lg border border-line bg-panel p-3">
          <span className="block text-[0.6875rem] font-semibold text-fg-3">하루 목표 컷 수</span>
          <strong className="mt-1 block text-lg font-extrabold tabular-nums text-accent" data-testid="deadline-meter-daily-cuts">
            {forecast.dailyTargetCuts}컷 / 일
          </strong>
          <span className="text-[0.6875rem] tabular-nums text-fg-3">잔여 {forecast.remainingCuts}컷</span>
        </div>
        <div className="rounded-lg border border-line bg-panel p-3">
          <span className="block text-[0.6875rem] font-semibold text-fg-3">컷당 학습 소요시간</span>
          <strong className="mt-1 block text-lg font-extrabold tabular-nums text-fg" data-testid="deadline-meter-min-per-cut">
            {forecast.learnedMinutesPerCutTotal.toFixed(1)}분
          </strong>
          <span className="text-[0.6875rem] text-fg-3">
            {forecast.hasMeasuredData ? "실측 학습 반영" : "초기 기준치(추정)"}
          </span>
        </div>
        <div className="rounded-lg border border-line bg-panel p-3">
          <span className="block text-[0.6875rem] font-semibold text-fg-3">일일 필요 작화시간</span>
          <strong className="mt-1 block text-lg font-extrabold tabular-nums text-fg">
            {forecast.requiredDailyHours.toFixed(1)}시간
          </strong>
          <span className="text-[0.6875rem] tabular-nums text-fg-3">
            잔여 총 {forecast.estimatedRemainingHours.toFixed(1)}시간 · 가용 {state.episode.dailyWorkHours}시간
          </span>
        </div>
      </div>

      <p className="rounded-lg border border-line bg-panel px-3 py-2 text-xs leading-5 text-fg-2 [word-break:keep-all]">
        {forecast.guidanceKo}
      </p>

      {/* 다음 화 마감 설정 */}
      <div className="grid gap-2.5 border-t border-line/60 pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-semibold text-fg-2">
          <span>다음 화 마감일</span>
          <input
            type="date"
            aria-label="다음 화 마감일"
            value={state.episode.deadlineDate}
            onChange={(event) =>
              commitState(updateEpisodeDeadlineTarget(state, { deadlineDate: event.target.value }))
            }
            className="min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs tabular-nums text-fg"
          />
        </label>
        <label className="space-y-1 text-xs font-semibold text-fg-2">
          <span>목표 컷 수</span>
          <input
            type="number"
            aria-label="목표 컷 수"
            min={1}
            max={500}
            value={state.episode.targetCuts}
            onChange={(event) =>
              commitState(
                updateEpisodeDeadlineTarget(state, {
                  targetCuts: Number.parseInt(event.target.value, 10) || 1,
                }),
              )
            }
            className="min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs tabular-nums text-fg"
          />
        </label>
        <label className="space-y-1 text-xs font-semibold text-fg-2">
          <span>완료 컷 수</span>
          <input
            type="number"
            aria-label="완료 컷 수"
            min={0}
            max={state.episode.targetCuts}
            value={state.episode.completedCuts}
            onChange={(event) =>
              commitState(
                updateEpisodeDeadlineTarget(state, {
                  completedCuts: Number.parseInt(event.target.value, 10) || 0,
                }),
              )
            }
            className="min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs tabular-nums text-fg"
          />
        </label>
        <label className="space-y-1 text-xs font-semibold text-fg-2">
          <span>하루 작업 시간(시간)</span>
          <input
            type="number"
            aria-label="하루 작업 시간"
            min={1}
            max={16}
            step={0.5}
            value={state.episode.dailyWorkHours}
            onChange={(event) =>
              commitState(
                updateEpisodeDeadlineTarget(state, {
                  dailyWorkHours: Number.parseFloat(event.target.value) || 1,
                }),
              )
            }
            className="min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs tabular-nums text-fg"
          />
        </label>
      </div>

      {/* 5대 공정별 세션 타이머 + 수동 빠른 기록 */}
      <div className="space-y-3 border-t border-line/60 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Clock3 className="size-4 text-accent" aria-hidden="true" />
            공정별 세션 타이머 (콘티 · 선화 · 밑색 · 명암 · 식자)
          </span>
          <output
            data-testid="deadline-meter-timer-readout"
            className="rounded-lg border border-line bg-panel px-2.5 py-1 text-sm font-extrabold tabular-nums text-fg"
          >
            {activeStageLabel ? `${activeStageLabel} · ` : ""}
            {formatTimerDuration(elapsedMs)}
          </output>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="계측 공정 선택">
          {PRODUCTION_METER_STAGES.map((stage) => {
            const active = (state.activeTimer?.stage ?? selectedStage) === stage.id;
            return (
              <button
                key={stage.id}
                type="button"
                aria-pressed={active}
                disabled={Boolean(state.activeTimer)}
                onClick={() => setSelectedStage(stage.id)}
                className={cn(
                  "min-h-11 rounded-lg border px-3 text-xs font-bold transition-colors disabled:opacity-60 [word-break:keep-all]",
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {stage.labelKo}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {!runningTimer ? (
            <button
              type="button"
              onClick={handleStartOrResume}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 text-xs font-bold text-on-accent hover:opacity-90"
            >
              <Play className="size-4" aria-hidden="true" />
              {state.activeTimer ? "타이머 재개" : "공정 타이머 시작"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePause}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-warn/50 bg-warn/10 px-3.5 text-xs font-bold text-warn"
            >
              <Pause className="size-4" aria-hidden="true" />
              일시 정지
            </button>
          )}

          <label className="space-y-1 text-xs text-fg-2">
            <span className="block">이번 세션 컷 수</span>
            <input
              type="number"
              aria-label="이번 세션 컷 수"
              min={1}
              max={200}
              value={sessionCutsInput}
              onChange={(event) => setSessionCutsInput(event.target.value)}
              className="min-h-11 w-24 rounded-lg border border-line bg-panel px-2.5 text-xs tabular-nums text-fg"
            />
          </label>

          {state.activeTimer ? (
            <button
              type="button"
              onClick={handleCompleteSession}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-good/50 bg-good/10 px-3.5 text-xs font-bold text-good"
            >
              <SquareCheck className="size-4" aria-hidden="true" />
              세션 종료 · 학습 반영
            </button>
          ) : (
            <>
              <label className="space-y-1 text-xs text-fg-2">
                <span className="block">작업 시간(분)</span>
                <input
                  type="number"
                  aria-label="수동 작업 시간(분)"
                  min={1}
                  max={720}
                  value={manualMinutesInput}
                  onChange={(event) => setManualMinutesInput(event.target.value)}
                  className="min-h-11 w-24 rounded-lg border border-line bg-panel px-2.5 text-xs tabular-nums text-fg"
                />
              </label>
              <button
                type="button"
                onClick={handleRecordManual}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3.5 text-xs font-semibold text-fg hover:bg-raised"
              >
                <PlusCircle className="size-4 text-accent" aria-hidden="true" />
                실측 기록 추가
              </button>
            </>
          )}
        </div>
      </div>

      {/* 공정별 학습 속도 표 + 7일 목표 컷 번다운 스트립 */}
      <div className="grid gap-3 border-t border-line/60 pt-3 lg:grid-cols-2">
        <div className="space-y-2">
          <span className="block text-xs font-bold text-fg">공정별 컷당 평균 소요시간</span>
          <ul className="space-y-1.5">
            {forecast.stageSpeeds.map((item) => (
              <li
                key={item.stage}
                className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs"
              >
                <span className="font-semibold text-fg">{item.labelKo}</span>
                <span className="tabular-nums text-fg-2">
                  <strong className="text-fg">{item.minutesPerCut.toFixed(1)}분/컷</strong>
                  <span className="ml-2 text-[0.6875rem] text-fg-3">
                    {item.source === "measured"
                      ? `실측 ${item.measuredCuts}컷`
                      : item.source === "blended"
                        ? `혼합 ${item.measuredCuts}컷`
                        : "기준치"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-bold text-fg">일별 목표 컷 마감 캘린더</span>
          <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {forecast.dailyPlan.map((day) => (
              <li
                key={day.date}
                className={cn(
                  "rounded-lg border px-2.5 py-2 text-xs",
                  day.isDeadline
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg",
                )}
              >
                <time dateTime={day.date} className="block font-bold tabular-nums">
                  {day.date.slice(5)}
                  {day.isDeadline ? " · 마감" : ""}
                </time>
                <span className="mt-0.5 block tabular-nums text-fg-2">
                  +{day.plannedCuts}컷 (누적 {day.cumulativeCuts})
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {statusNotice ? (
        <p role="status" className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg-2">
          {statusNotice}
        </p>
      ) : null}

      <details
        className="rounded-xl border border-line bg-panel p-3"
        data-testid="deadline-meter-pm-conveyor-details"
        open={pmConveyorOpen}
        onToggle={(event) => setPmConveyorOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-xs font-bold text-fg [word-break:keep-all]">
          <span>
            대형 스튜디오 PM 3~4화차 로테이션 · 난이도 정산 · 사전 QC &amp; 빈칸 제로 스마트 기본값 콘솔 열기
          </span>
          <span className="text-[0.6875rem] font-semibold text-fg-3">
            {pmConveyorOpen ? "접기" : "펼치기"}
          </span>
        </summary>
        {pmConveyorOpen ? (
          <div className="mt-3">
            <StudioLargePmConveyorConsole />
          </div>
        ) : null}
      </details>
    </section>
  );
}
