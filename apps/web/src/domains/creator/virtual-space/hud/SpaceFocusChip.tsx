import { Coffee, Pause, Play, Square, Timer } from "lucide-react";
import { memo } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioSpaceEmoteId } from "../studio-virtual-space-emote-catalog";
import {
  STUDIO_FOCUS_BREAK_MS,
  formatStudioFocusClock,
  studioFocusProgress,
  studioFocusRemainingMs,
  type StudioFocusSession,
} from "../studio-virtual-space-focus-session";

/**
 * 집중 세션 칩: 집중/휴식 구간의 남은 시간·진행률 게이지·누적 완료 횟수를 보여 주고
 * 일시정지·재개·중단 및 휴식 구간 원클릭 웰니스(체조·요가·목풀기) 동작을 제공한다.
 */
export const SpaceFocusChip = memo(function SpaceFocusChip({
  session,
  now,
  onPause,
  onResume,
  onStop,
  onEmote,
}: {
  readonly session: StudioFocusSession;
  /** 페이지가 1초 간격으로 갱신하는 현재 시각 (ms). */
  readonly now: number;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStop: () => void;
  readonly onEmote?: (id: StudioSpaceEmoteId) => void;
}) {
  const bt = useBilingual("SpaceFocusChip");
  if (session.phase === "idle" || session.phase === "done") return null;
  const onBreak = session.phase === "break";
  const remainingMs = studioFocusRemainingMs(session, now);
  const clock = formatStudioFocusClock(remainingMs);
  const progressRatio = onBreak
    ? Math.min(1, Math.max(0, 1 - remainingMs / STUDIO_FOCUS_BREAK_MS))
    : studioFocusProgress(session, now);
  const progressPercent = Math.round(progressRatio * 100);
  const label = onBreak
    ? bt(`휴식 중 ${clock}`, `Break ${clock}`)
    : bt(`집중 중 ${clock}`, `Focusing ${clock}`);
  return (
    <div
      className="space-focus-chip"
      data-space-interactive="true"
      data-phase={session.phase}
      data-focus-progress={progressPercent}
    >
      {onBreak ? <Coffee size={16} aria-hidden /> : <Timer size={16} aria-hidden />}
      <p role="timer" aria-label={label}>
        <strong>{label}</strong>
      </p>
      {session.completedCount > 0 ? (
        <span
          className="space-focus-chip__streak"
          data-completed-sessions={session.completedCount}
          title={bt(`누적 집중 완료 ${session.completedCount}회`, `${session.completedCount} focus sessions completed`)}
        >
          {`🔥 ${session.completedCount}`}
        </span>
      ) : null}
      <span className="space-focus-chip__meter" aria-hidden>
        <span className="space-focus-chip__meter-fill" style={{ width: `${progressPercent}%` }} />
      </span>
      <div className="space-focus-chip__actions">
        {onBreak && onEmote ? (
          <>
            <button
              type="button"
              className="space-pill-button"
              data-break-wellness="calisthenics"
              onClick={() => onEmote("calisthenics")}
            >
              {bt("🤸 체조", "🤸 Stretch")}
            </button>
            <button
              type="button"
              className="space-pill-button"
              data-break-wellness="yoga"
              onClick={() => onEmote("yoga")}
            >
              {bt("🧘 요가", "🧘 Yoga")}
            </button>
          </>
        ) : null}
        {session.phase === "running" ? (
          <button type="button" className="space-pill-button" onClick={onPause}>
            <Pause size={14} aria-hidden />
            {bt("일시정지", "Pause")}
          </button>
        ) : null}
        {session.phase === "paused" ? (
          <button type="button" className="space-pill-button" onClick={onResume}>
            <Play size={14} aria-hidden />
            {bt("계속", "Resume")}
          </button>
        ) : null}
        <button
          type="button"
          className="space-pill-button"
          aria-label={bt("집중 세션 종료", "End focus session")}
          onClick={onStop}
        >
          <Square size={14} aria-hidden />
          {bt("종료", "End")}
        </button>
      </div>
    </div>
  );
});
