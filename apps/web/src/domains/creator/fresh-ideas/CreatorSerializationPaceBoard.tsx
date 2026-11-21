/**
 * CreatorSerializationPaceBoard.tsx — 인터랙티브 창작자 연재 리듬 · 마감 페이스 보드.
 *
 * 초보자도 3종 연재 주기 프리셋(주간 60컷 · 격주 50컷 · 인스타툰 8컷)을 1클릭으로 고르고
 * 5단계 공정(콘티·3D 배경·선화·채색·말풍선/검수) 컷 진도를 조절하면,
 * 남은 마감 일수 대비 하루 권장 컷 수와 리듬 건강 신호, 오늘 출석 체크인을 즉시 계산해 저장한다.
 */

import { CalendarClock, Check, Flame, Minus, Plus, RotateCcw } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  completeStageAllCuts,
  computePaceSummary,
  createInitialPaceState,
  loadSerializationPaceState,
  nudgeStageCuts,
  PACE_CADENCE_PRESETS,
  PACE_STAGES,
  recordDailyPaceCheckIn,
  saveSerializationPaceState,
  type PaceCadencePresetId,
  type SerializationPaceState,
} from "./serialization-pace-model";

import "./serialization-pace.css";

const CHECKIN_SPARKS: readonly { readonly sx: string; readonly sy: string; readonly tone: string }[] = [
  { sx: "-24px", sy: "-20px", tone: "var(--color-good)" },
  { sx: "-4px", sy: "-28px", tone: "var(--color-accent)" },
  { sx: "18px", sy: "-24px", tone: "var(--color-accent-2)" },
  { sx: "26px", sy: "-6px", tone: "var(--color-cool)" },
  { sx: "-20px", sy: "10px", tone: "var(--color-warn)" },
  { sx: "20px", sy: "12px", tone: "var(--color-good)" },
];

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CreatorSerializationPaceBoard() {
  const bt = useBilingual("CreatorSerializationPaceBoard");
  const [state, setState] = useState<SerializationPaceState>(() => loadSerializationPaceState());
  const [burstNonce, setBurstNonce] = useState(0);
  const [noticeEvent, setNoticeEvent] = useState<
    | { readonly kind: "preset" }
    | { readonly kind: "reset" }
    | { readonly kind: "checkin"; readonly streak: number }
    | null
  >(null);

  const persist = (next: SerializationPaceState) => {
    setState(next);
    saveSerializationPaceState(next);
  };

  const summary = useMemo(() => computePaceSummary(state), [state]);
  const today = todayDateKey();
  const checkedToday = state.lastCheckInDate === today;
  const cutStep = state.targetCuts <= 16 ? 2 : 5;

  const statusCopy =
    summary.status === "ahead"
      ? {
          badge: bt("여유 리듬", "Ahead of pace"),
          detail: bt(
            `지금 속도라면 마감 전 여유 있게 마무리할 수 있어요 (하루 권장 ${summary.dailyRequiredUnits}컷).`,
            `You are comfortably ahead of deadline (${summary.dailyRequiredUnits} cuts/day recommended).`,
          ),
          toneClass: "border-good/45 bg-good/12 text-good",
        }
      : summary.status === "tight"
        ? {
            badge: bt("마감 주의", "Tight deadline"),
            detail: bt(
              `하루 ${summary.dailyRequiredUnits}컷 이상 필요해요. 배경 3D 활용이나 남은 일정 조정을 검토해 보세요.`,
              `Requires ${summary.dailyRequiredUnits}+ cuts/day. Consider 3D background assist or schedule buffer.`,
            ),
            toneClass: "border-warn/45 bg-warn/12 text-warn",
          }
        : {
            badge: bt("안정 페이스", "Steady pace"),
            detail: bt(
              `마감까지 하루 ${summary.dailyRequiredUnits}컷 페이스를 유지하면 무리 없이 완주해요.`,
              `Stay around ${summary.dailyRequiredUnits} cuts/day to finish smoothly on time.`,
            ),
            toneClass: "border-accent/45 bg-accent-soft text-accent",
          };

  const handleSelectPreset = (presetId: PaceCadencePresetId) => {
    const next = createInitialPaceState(presetId);
    persist({
      ...next,
      dailyCheckInStreak: state.dailyCheckInStreak,
      lastCheckInDate: state.lastCheckInDate,
    });
    setNoticeEvent({ kind: "preset" });
  };

  const handleCheckIn = () => {
    const outcome = recordDailyPaceCheckIn(state, today);
    persist(outcome.state);
    if (!outcome.alreadyCheckedToday) {
      setBurstNonce((prev) => prev + 1);
      setNoticeEvent({ kind: "checkin", streak: outcome.state.dailyCheckInStreak });
    }
  };

  const notice = !noticeEvent
    ? ""
    : noticeEvent.kind === "preset"
      ? bt("연재 주기 프리셋을 바꿨어요.", "Switched serialization cadence preset.")
      : noticeEvent.kind === "reset"
        ? bt("현재 주기 기본값으로 되돌렸어요.", "Reset to preset baseline.")
        : bt(
            `오늘 작업 출석을 기록했어요 (연속 ${noticeEvent.streak}일).`,
            `Logged today's work check-in (${noticeEvent.streak}-day streak).`,
          );

  return (
    <section
      data-testid="creator-serialization-pace-board"
      aria-labelledby="serialization-pace-heading"
      className="pace-board break-keep p-4 sm:p-5"
    >
      <span className="pace-board__ribbon" aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
            <CalendarClock size={14} strokeWidth={1.5} aria-hidden="true" />
            {bt("연재 리듬 · 마감 페이스 보드", "Serialization rhythm & deadline pace board")}
          </p>
          <h2 id="serialization-pace-heading" className="mt-1 text-base font-semibold text-fg sm:text-lg">
            {bt("오늘 몇 컷만 그리면 마감 여유가 생길까요?", "How many cuts today keep your deadline calm?")}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-fg-2">
            {bt(
              "연재 주기를 고르고 단계별 완료 컷 수를 눌러 보세요. 모든 진도는 이 브라우저에 자동 저장돼요.",
              "Pick a cadence and tap completed cuts per stage. Progress saves automatically in this browser.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="pace-daily-checkin-btn"
            onClick={handleCheckIn}
            aria-pressed={checkedToday}
            className="pace-checkin-btn inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-xs font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Flame size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>
              {checkedToday
                ? bt(`오늘 작업 완료 · ${state.dailyCheckInStreak}일 연속`, `Done today · ${state.dailyCheckInStreak}d streak`)
                : bt(`오늘 작업 체크인 (${state.dailyCheckInStreak}일)`, `Log today's work (${state.dailyCheckInStreak}d)`)}
            </span>
            {burstNonce > 0 ? (
              <span key={burstNonce} className="pace-burst-layer" aria-hidden="true">
                {CHECKIN_SPARKS.map((spark, index) => (
                  <span
                    key={index}
                    className="pace-burst-spark"
                    style={{
                      "--spark-tone": spark.tone,
                      "--sx": spark.sx,
                      "--sy": spark.sy,
                    } as CSSProperties}
                  />
                ))}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            data-testid="pace-reset-btn"
            onClick={() => {
              persist(createInitialPaceState(state.presetId));
              setNoticeEvent({ kind: "reset" });
            }}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            <RotateCcw size={13} strokeWidth={1.5} aria-hidden="true" />
            {bt("초기화", "Reset")}
          </button>
        </div>
      </div>

      {/* 3종 1클릭 연재 주기 프리셋 */}
      <div
        role="group"
        aria-label={bt("연재 주기 프리셋", "Serialization cadence presets")}
        className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {PACE_CADENCE_PRESETS.map((preset) => {
          const active = state.presetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`pace-preset-${preset.id}`}
              aria-pressed={active}
              onClick={() => handleSelectPreset(preset.id)}
              className="pace-preset-btn flex min-h-11 flex-col items-start rounded-xl px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="text-xs font-semibold text-fg">{bt(preset.labelKo, preset.labelEn)}</span>
              <span className="mt-0.5 text-xs text-fg-2">{bt(preset.hintKo, preset.hintEn)}</span>
            </button>
          );
        })}
      </div>

      {/* 전체 진도 + 마감 남은 일수 컨트롤 */}
      <div className="mt-4 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="pace-status-badge"
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusCopy.toneClass}`}
            >
              {statusCopy.badge}
            </span>
            <span data-testid="pace-overall-pct" className="text-sm font-semibold tabular-nums text-fg">
              {summary.overallPct}%
            </span>
            <span className="text-xs tabular-nums text-fg-2">
              ({summary.weightedCompletedCuts}/{state.targetCuts} {bt("컷 환산", "cuts eq.")})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-fg-2">{bt("마감까지", "Deadline in")}</span>
            <button
              type="button"
              data-testid="pace-days-dec"
              aria-label={bt("마감 남은 일수 1일 줄이기", "Decrease remaining days by 1")}
              onClick={() => persist({ ...state, daysRemaining: Math.max(1, state.daysRemaining - 1) })}
              className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <span data-testid="pace-days-value" className="min-w-[3.2rem] text-center text-xs font-semibold tabular-nums text-fg">
              D-{state.daysRemaining}
            </span>
            <button
              type="button"
              data-testid="pace-days-inc"
              aria-label={bt("마감 남은 일수 1일 늘리기", "Increase remaining days by 1")}
              onClick={() => persist({ ...state, daysRemaining: Math.min(30, state.daysRemaining + 1) })}
              className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-raised"
          role="progressbar"
          aria-label={bt("회차 전체 진행률", "Overall episode completion")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.overallPct}
        >
          <span
            className="pace-overall-fill"
            style={{ transform: `scaleX(${summary.overallPct / 100})` }}
          />
        </div>
        <p data-testid="pace-status-detail" className="mt-2 text-xs leading-5 text-fg-2">
          {statusCopy.detail}
        </p>
      </div>

      {/* 5단계 공정 컷 진도 레일 */}
      <ul className="mt-3 space-y-2" aria-label={bt("공정별 컷 진행 상태", "Cut progress by stage")}>
        {PACE_STAGES.map((stage) => {
          const done = state.completedByStage[stage.id] ?? 0;
          const pct = summary.stagePercentages[stage.id];
          const isComplete = done >= state.targetCuts;
          const stageLabel = bt(stage.labelKo, stage.labelEn);
          return (
            <li
              key={stage.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card/85 px-3 py-2"
            >
              <div className="min-w-[9rem] flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: stage.toneVar }}
                    />
                    {stageLabel}
                  </span>
                  <span
                    data-testid={`pace-stage-count-${stage.id}`}
                    className="text-xs font-medium tabular-nums text-fg-2"
                  >
                    {done}/{state.targetCuts} ({pct}%)
                  </span>
                </div>
                <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-raised" aria-hidden="true">
                  <span
                    className="pace-meter-fill"
                    style={{
                      "--stage-tone": stage.toneVar,
                      transform: `scaleX(${pct / 100})`,
                    } as CSSProperties}
                  />
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid={`pace-stage-dec-${stage.id}`}
                  aria-label={bt(`${stageLabel} ${cutStep}컷 줄이기`, `Subtract ${cutStep} cuts from ${stageLabel}`)}
                  onClick={() => persist(nudgeStageCuts(state, stage.id, -cutStep))}
                  className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  data-testid={`pace-stage-inc-${stage.id}`}
                  aria-label={bt(`${stageLabel} ${cutStep}컷 더하기`, `Add ${cutStep} cuts to ${stageLabel}`)}
                  onClick={() => persist(nudgeStageCuts(state, stage.id, cutStep))}
                  className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  data-testid={`pace-stage-done-${stage.id}`}
                  aria-pressed={isComplete}
                  onClick={() => persist(completeStageAllCuts(state, stage.id))}
                  className={
                    isComplete
                      ? "inline-flex min-h-11 items-center gap-1 rounded-lg bg-good px-2.5 text-xs font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-accent"
                      : "inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                  }
                >
                  <Check size={13} strokeWidth={1.5} aria-hidden="true" />
                  {bt("완료", "Done")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="sr-only" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
