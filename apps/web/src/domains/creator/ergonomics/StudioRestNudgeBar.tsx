/**
 * 60분 연속 드로잉 손목·눈 스트레칭 비침습 1줄 넛지 바 (`Calm Atelier`).
 *
 * - 모달이나 배경 가림막을 만들지 않아 작가의 캔버스 흐름을 끊지 않는다.
 * - 모든 액션 버튼은 44×44px 이상(`min-h-11 min-w-11`) 터치·펜 타깃을 보장한다.
 * - `drawing` / `snoozed` 단계에서는 DOM을 렌더링하지 않아 캔버스 82%+ 점유율을 지킨다.
 */
import { Check, Clock, Coffee, X } from "lucide-react";
import type { ReactElement } from "react";

import {
  formatStudioActiveMinutes,
  formatStudioRestCountdown,
  studioRestBreakRemainingMs,
  studioRestStretchTipKo,
  type StudioRestNudgeState,
} from "./studio-rest-nudge-timer";

import { cn } from "@/shared/lib/utils";

export interface StudioRestNudgeBarProps {
  readonly state: StudioRestNudgeState;
  readonly nowMs: number;
  readonly placement?: "floating" | "inline";
  readonly reduceMotion?: boolean;
  readonly onStartBreak: () => void;
  readonly onSnooze: () => void;
  readonly onDismiss: () => void;
}

export function StudioRestNudgeBar({
  state,
  nowMs,
  placement = "floating",
  reduceMotion = false,
  onStartBreak,
  onSnooze,
  onDismiss,
}: StudioRestNudgeBarProps): ReactElement | null {
  if (state.phase === "drawing" || state.phase === "snoozed") {
    return null;
  }

  const snoozeMinutes = Math.max(1, Math.round(state.config.snoozeDurationMs / 60_000));
  const breakMinutes = Math.max(1, Math.round(state.config.breakDurationMs / 60_000));
  const activeMinutes = formatStudioActiveMinutes(state.activeElapsedMs);
  const remainingMs = studioRestBreakRemainingMs(state, nowMs);
  const breakProgressPct = state.phase === "resting"
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round(((state.config.breakDurationMs - remainingMs) / state.config.breakDurationMs) * 100),
        ),
      )
    : 0;
  const stretchTip = studioRestStretchTipKo(state);

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="손목·눈 휴식 안내"
      data-studio-rest-nudge-bar={state.phase}
      data-studio-rest-nudge-placement={placement}
      data-studio-reduce-motion={reduceMotion ? "true" : undefined}
      className={cn(
        "studio-ergonomics-rest-nudge",
        placement === "floating"
          ? "studio-ergonomics-rest-nudge--floating"
          : "studio-ergonomics-rest-nudge--inline",
      )}
    >
      {state.phase === "nudge" ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"
          >
            <Coffee className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-xs leading-snug text-fg">
            <span className="font-semibold">{activeMinutes}분 연속 작업했어요</span>
            <span className="text-fg-2"> · 손목과 눈을 잠깐 풀어 주세요</span>
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-studio-rest-nudge-action="start-break"
              onClick={onStartBreak}
              className="studio-ergonomics-touch-target inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {breakMinutes}분 쉬기
            </button>
            <button
              type="button"
              data-studio-rest-nudge-action="snooze"
              onClick={onSnooze}
              className="studio-ergonomics-touch-target inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {snoozeMinutes}분 뒤 다시
            </button>
            <button
              type="button"
              data-studio-rest-nudge-action="dismiss"
              onClick={onDismiss}
              aria-label="휴식 알림 닫기"
              className="studio-ergonomics-touch-target inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {state.phase === "resting" ? (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"
            >
              <Clock className="size-4" />
            </span>
            <p className="min-w-0 flex-1 text-xs leading-snug text-fg">
              <strong className="tabular-nums font-semibold text-accent">
                {formatStudioRestCountdown(remainingMs)}
              </strong>
              <span className="text-fg-2"> · {stretchTip}</span>
            </p>
            <button
              type="button"
              data-studio-rest-nudge-action="resume"
              onClick={onDismiss}
              className="studio-ergonomics-touch-target inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              바로 돌아가기
            </button>
          </div>
          <div
            className="studio-ergonomics-rest-nudge__progress-track"
            role="progressbar"
            aria-label="휴식 진행률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={breakProgressPct}
          >
            <div
              className="studio-ergonomics-rest-nudge__progress-fill"
              style={{ width: `${breakProgressPct}%` }}
            />
          </div>
        </div>
      ) : null}

      {state.phase === "completed" ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-good/15 text-good"
          >
            <Check className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-xs leading-snug text-fg">
            <span className="font-semibold">휴식을 마쳤어요</span>
            <span className="text-fg-2"> · 편안하게 다음 작업을 이어가세요</span>
          </p>
          <button
            type="button"
            data-studio-rest-nudge-action="complete-ack"
            onClick={onDismiss}
            className="studio-ergonomics-touch-target inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            확인
          </button>
        </div>
      ) : null}
    </aside>
  );
}
