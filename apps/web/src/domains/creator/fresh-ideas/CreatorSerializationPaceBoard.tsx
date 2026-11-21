/**
 * CreatorSerializationPaceBoard.tsx — 인터랙티브 창작자 연재 리듬 · 마감 페이스 보드.
 *
 * 기본 화면은 3종 연재 주기 선택 + 마감 건강 요약 + '오늘 작업 체크인' Primary CTA만 간결하게 보여 주고,
 * 5단계 공정 컷 수·남은 일수 세부 조절은 1탭 접힘 영역으로 수납해 초보자도 한눈에 바로 쓰게 한다.
 */

import { CalendarClock, Check, ChevronDown, Flame, Minus, Plus, RotateCcw } from "lucide-react";
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
            `하루 ${summary.dailyRequiredUnits}컷씩 그리면 마감 전 여유 있게 끝나요.`,
            `Draw ${summary.dailyRequiredUnits} cuts/day to finish comfortably early.`,
          ),
          toneClass: "border-good/45 bg-good/12 text-good",
        }
      : summary.status === "tight"
        ? {
            badge: bt("마감 주의", "Tight deadline"),
            detail: bt(
              `하루 ${summary.dailyRequiredUnits}컷 이상 필요해요. 남은 일정이나 컷 수를 조절해 보세요.`,
              `Needs ${summary.dailyRequiredUnits}+ cuts/day. Consider adjusting schedule or scope.`,
            ),
            toneClass: "border-warn/45 bg-warn/12 text-warn",
          }
        : {
            badge: bt("안정 페이스", "Steady pace"),
            detail: bt(
              `하루 ${summary.dailyRequiredUnits}컷 페이스를 유지하면 마감에 맞춰 완주해요.`,
              `Keep around ${summary.dailyRequiredUnits} cuts/day to finish on time.`,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="serialization-pace-heading" className="flex items-center gap-1.5 text-base font-semibold text-fg">
            <CalendarClock size={16} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden="true" />
            {bt("연재 마감 페이스 확인하기", "Check your deadline pace")}
          </h2>
          <p className="mt-0.5 text-xs text-fg-2">
            {bt("연재 주기를 고르면 하루 권장 컷 수를 바로 계산해 드려요.", "Pick a cadence to see your daily cut target right away.")}
          </p>
        </div>
        <button
          type="button"
          data-testid="pace-daily-checkin-btn"
          onClick={handleCheckIn}
          aria-pressed={checkedToday}
          className="pace-checkin-btn inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Flame size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>
            {checkedToday
              ? bt(`오늘 작업 완료 · ${state.dailyCheckInStreak}일 연속`, `Done today · ${state.dailyCheckInStreak}d streak`)
              : bt(`오늘 작업 기록하기 (${state.dailyCheckInStreak}일)`, `Log today's work (${state.dailyCheckInStreak}d)`)}
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
      </div>

      {/* 1단계: 3종 연재 주기 원클릭 선택 */}
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
              className="pace-preset-btn flex min-h-11 flex-col items-start rounded-xl px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="text-xs font-semibold text-fg">{bt(preset.labelKo, preset.labelEn)}</span>
              <span className="mt-0.5 text-xs text-fg-3">{bt(preset.hintKo, preset.hintEn)}</span>
            </button>
          );
        })}
      </div>

      {/* 핵심 상태 요약 (중첩 카드 없이 깔끔한 1블록) */}
      <div className="mt-4 border-t border-line/70 pt-3.5">
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
              · {summary.weightedCompletedCuts}/{state.targetCuts} {bt("컷", "cuts")}
            </span>
          </div>
          <span data-testid="pace-days-value" className="text-xs font-semibold tabular-nums text-fg-2">
            D-{state.daysRemaining}
          </span>
        </div>

        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-raised"
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
        <p data-testid="pace-status-detail" className="mt-1.5 text-xs text-fg-2">
          {statusCopy.detail}
        </p>
      </div>

      {/* 2단계: 5단계 공정 컷 수·남은 일수 조절은 1탭 접힘 영역으로 수납 */}
      <details
        data-testid="pace-stages-disclosure"
        className="group/pace-stages mt-3 border-t border-line/70 pt-1.5"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-1 text-xs font-semibold text-fg-2 transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          <span>
            {bt(
              `공정별 컷 수·마감일 조절하기 (완료 ${summary.completedStageCount}/5단계)`,
              `Adjust cuts & deadline (${summary.completedStageCount}/5 stages done)`,
            )}
          </span>
          <ChevronDown
            size={15}
            strokeWidth={1.5}
            aria-hidden="true"
            className="shrink-0 text-fg-3 transition-transform duration-150 group-open/pace-stages:rotate-180 motion-reduce:transition-none"
          />
        </summary>

        <div className="space-y-3 pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-fg-2">{bt("마감까지 남은 일수", "Days left")}</span>
              <button
                type="button"
                data-testid="pace-days-dec"
                aria-label={bt("마감 남은 일수 1일 줄이기", "Decrease remaining days by 1")}
                onClick={() => persist({ ...state, daysRemaining: Math.max(1, state.daysRemaining - 1) })}
                className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
              </button>
              <button
                type="button"
                data-testid="pace-days-inc"
                aria-label={bt("마감 남은 일수 1일 늘리기", "Increase remaining days by 1")}
                onClick={() => persist({ ...state, daysRemaining: Math.min(30, state.daysRemaining + 1) })}
                className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              data-testid="pace-reset-btn"
              onClick={() => {
                persist(createInitialPaceState(state.presetId));
                setNoticeEvent({ kind: "reset" });
              }}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              <RotateCcw size={13} strokeWidth={1.5} aria-hidden="true" />
              {bt("초기화", "Reset")}
            </button>
          </div>

          <ul className="divide-y divide-line/60 border-t border-line/60" aria-label={bt("공정별 컷 진행 상태", "Cut progress by stage")}>
            {PACE_STAGES.map((stage) => {
              const done = state.completedByStage[stage.id] ?? 0;
              const pct = summary.stagePercentages[stage.id];
              const isComplete = done >= state.targetCuts;
              const stageLabel = bt(stage.labelKo, stage.labelEn);
              return (
                <li
                  key={stage.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-[8.5rem] flex-1">
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
                      className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      data-testid={`pace-stage-inc-${stage.id}`}
                      aria-label={bt(`${stageLabel} ${cutStep}컷 더하기`, `Add ${cutStep} cuts to ${stageLabel}`)}
                      onClick={() => persist(nudgeStageCuts(state, stage.id, cutStep))}
                      className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
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
                          : "inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-medium text-fg-2 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
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
        </div>
      </details>

      <p className="sr-only" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
