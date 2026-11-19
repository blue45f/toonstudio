/**
 * Studio Creative Hours & Creator Wellness Card (창작 시간 및 예방형 인체공학 웰니스 카드)
 *
 * - 활성 작업 시간, 세션 시간, 누적 획 수, 작업 페이스(획/분)를 표시한다.
 * - 50분 이상 연속 작업 시 비차단 휴식·스트레칭 알림과 중립 자세 4대 체크리스트를 제공한다.
 */

import { CheckCircle2, Clock, Flame, HeartPulse, PauseCircle, PlayCircle, RotateCcw } from "lucide-react";
import { useState } from "react";

import {
  computeCreativeWorkStatistics,
  type CreativeWorkTimeTrackerState,
} from "./studio-creative-work-time-tracker";
import { formatNumber } from "@toonstudio/core/format";

export interface StudioCreativeHoursCardProps {
  readonly tracker: CreativeWorkTimeTrackerState;
  readonly onResetSession?: () => void;
  readonly className?: string;
}

const POSTURE_CHECKS = [
  { id: "wrist", label: "손목 중립 각도 유지" },
  { id: "eye", label: "모니터 상단 시선 수평" },
  { id: "lumbar", label: "허리·어깨 중립 지지" },
  { id: "glare", label: "눈부심 저감 조명 확인" },
] as const;

export function StudioCreativeHoursCard({
  tracker,
  onResetSession,
  className = "",
}: StudioCreativeHoursCardProps) {
  const stats = computeCreativeWorkStatistics(tracker);
  const [checkedIds, setCheckedIds] = useState<readonly string[]>(["wrist", "eye"]);
  const sessionMinutes = Math.floor(tracker.sessionWorkTimeSeconds / 60);
  const breakRecommended = sessionMinutes >= 50 && !stats.isCurrentlyIdle;

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  return (
    <div
      data-studio-creative-hours-card
      className={`flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs text-fg break-keep [overflow-wrap:break-word] ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2">
        <div className="flex items-center gap-1.5 font-semibold leading-[1.4] tracking-[-0.01em] text-fg">
          <Clock className="size-4 shrink-0 text-accent" strokeWidth={1.5} aria-hidden="true" />
          <span>내 창작 시간 · 웰니스</span>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${
            stats.isCurrentlyIdle
              ? "bg-warn/20 text-warn"
              : "bg-good/20 text-good"
          }`}
        >
          {stats.isCurrentlyIdle ? (
            <>
              <PauseCircle className="size-3" strokeWidth={1.5} aria-hidden="true" />
              <span>휴식 중</span>
            </>
          ) : (
            <>
              <PlayCircle className="size-3" strokeWidth={1.5} aria-hidden="true" />
              <span>작업 중</span>
            </>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[0.72rem]">
        <div className="rounded-lg bg-panel/70 p-2.5">
          <span className="text-fg-3">총 누적 시간</span>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
            {stats.totalDurationFormatted}
          </div>
        </div>
        <div className="rounded-lg bg-panel/70 p-2.5">
          <span className="text-fg-3">이번 세션 시간</span>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-accent">
            {stats.sessionDurationFormatted}
          </div>
        </div>
        <div className="rounded-lg bg-panel/70 p-2.5">
          <span className="text-fg-3">총 획(스트로크) 수</span>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
            {formatNumber(stats.strokeCount)}회
          </div>
        </div>
        <div className="rounded-lg bg-panel/70 p-2.5">
          <div className="flex items-center gap-1 text-fg-3">
            <Flame className="size-3 text-warn" strokeWidth={1.5} aria-hidden="true" />
            <span>작업 페이스</span>
          </div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
            {stats.strokesPerMinute} 획/분
          </div>
        </div>
      </div>

      {/* 예방형 창작자 인체공학 웰니스 영역 (중첩 보더 없이 헤어라인으로 분리) */}
      <div className="flex flex-col gap-2 border-t border-line/60 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold text-fg-2">
            <HeartPulse className="size-3.5 text-accent" strokeWidth={1.5} aria-hidden="true" />
            자세·손목 예방 체크
          </span>
          <span className="tabular-nums text-[0.68rem] text-fg-3">
            {checkedIds.length}/{POSTURE_CHECKS.length} 완료
          </span>
        </div>
        {breakRecommended ? (
          <p
            className="rounded-lg bg-warn/15 px-2.5 py-2 text-[0.72rem] font-medium leading-[1.55] tracking-[-0.01em] text-warn"
            role="status"
          >
            연속 {sessionMinutes}분 작업 중입니다. 5분간 손목·목 스트레칭을 권장합니다.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {POSTURE_CHECKS.map((item) => {
            const active = checkedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleCheck(item.id)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[0.72rem] leading-[1.4] transition-colors duration-150 sm:min-h-9 ${
                  active
                    ? "bg-accent-soft text-accent font-semibold"
                    : "bg-panel/60 text-fg-2 hover:bg-raised"
                }`}
              >
                <CheckCircle2 className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {onResetSession && (
        <div className="flex justify-end border-t border-line/40 pt-1.5">
          <button
            type="button"
            onClick={onResetSession}
            aria-label="세션 시간 초기화"
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-raised px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors duration-150 hover:bg-accent-soft hover:text-accent sm:min-h-9 sm:w-auto"
          >
            <RotateCcw className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            <span>세션 리셋</span>
          </button>
        </div>
      )}
    </div>
  );
}
