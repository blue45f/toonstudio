/**
 * CalendarTodayPulseRibbon.tsx — /calendar 오늘의 연재 펄스 & 7요일 OKLCH 컬러 리본.
 *
 * 실제 KST 오늘 요일 기준 오늘 업데이트 집중 점프, "내 서재에 담은 작품만 보기" 1탭 토글,
 * 320px 모바일에서도 페이지 가로 스크롤 없이 스냅되는 7요일 OKLCH 컬러 리듬 스트립을 제공한다.
 */

import { BookmarkCheck, CalendarCheck2, Sparkles } from "lucide-react";
import { useMemo, type CSSProperties } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import "./catalog-wave4-fresh-ideas.css";
import {
  buildCalendarTodayPulse,
  type CalendarDayBucketLike,
} from "./calendar-today-pulse-model";

export interface CalendarTodayPulseRibbonProps {
  readonly days: readonly CalendarDayBucketLike[];
  readonly rawDays: readonly CalendarDayBucketLike[];
  readonly todayIdx: number;
  readonly selectedDayIdx: number;
  readonly savedIds: ReadonlySet<string>;
  readonly savedOnly: boolean;
  readonly onSelectDay: (dayIdx: number) => void;
  readonly onJumpToToday: () => void;
  readonly onToggleSavedOnly: () => void;
}

export function CalendarTodayPulseRibbon({
  days,
  rawDays,
  todayIdx,
  selectedDayIdx,
  savedIds,
  savedOnly,
  onSelectDay,
  onJumpToToday,
  onToggleSavedOnly,
}: CalendarTodayPulseRibbonProps) {
  const bt = useBilingual("CalendarTodayPulseRibbon");

  const pulse = useMemo(
    () =>
      buildCalendarTodayPulse({
        days,
        rawDays,
        todayIdx,
        selectedDayIdx,
        savedIds,
        savedOnly,
      }),
    [days, rawDays, todayIdx, selectedDayIdx, savedIds, savedOnly],
  );

  const summaryTextKo =
    pulse.savedTodayCount > 0
      ? `KST 기준 ${pulse.todayLabelKo} 새 회차 ${pulse.todayCount}편 · 내 서재 ${pulse.savedTodayCount}편`
      : `KST 기준 ${pulse.todayLabelKo} 새 회차 ${pulse.todayCount}편`;
  const summaryTextEn =
    pulse.savedTodayCount > 0
      ? `KST ${pulse.todayLabelEn}: ${pulse.todayCount} updates · ${pulse.savedTodayCount} in library`
      : `KST ${pulse.todayLabelEn}: ${pulse.todayCount} updates`;

  return (
    <section
      aria-labelledby="calendar-today-pulse-heading"
      data-testid="calendar-today-pulse-ribbon"
      style={{ "--w4-spectrum": pulse.spectrumCss } as CSSProperties}
      className="catalog-w4-card mb-4 p-3.5 sm:p-4"
    >
      <span aria-hidden="true" className="catalog-w4-spectrum-strip" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="min-w-0">
            <h2
              id="calendar-today-pulse-heading"
              className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]"
            >
              <Sparkles size={15} strokeWidth={1.6} className="shrink-0 text-accent" aria-hidden="true" />
              {bt("오늘의 연재 펄스 · 요일 컬러 리듬", "Today's release pulse & weekday rhythm")}
            </h2>
            <p
              data-testid="calendar-today-pulse-summary"
              className="mt-0.5 text-xs tabular-nums text-fg-2 [word-break:keep-all]"
            >
              {bt(summaryTextKo, summaryTextEn)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="calendar-pulse-today-jump"
              aria-pressed={pulse.isViewingToday}
              onClick={onJumpToToday}
              style={{ "--w4-tone": "var(--color-accent)" } as CSSProperties}
              className="catalog-w4-chip inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold [word-break:keep-all]"
            >
              <CalendarCheck2 size={14} strokeWidth={1.6} aria-hidden="true" />
              {bt("오늘 연재 집중", "Focus today's drops")}
            </button>

            <button
              type="button"
              data-testid="calendar-pulse-saved-only-toggle"
              aria-pressed={savedOnly}
              onClick={onToggleSavedOnly}
              style={{ "--w4-tone": "var(--color-good)" } as CSSProperties}
              className="catalog-w4-chip inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold [word-break:keep-all]"
            >
              <BookmarkCheck size={14} strokeWidth={1.6} aria-hidden="true" />
              <span>{bt("내 서재에 담은 작품만 보기", "My library titles only")}</span>
              <span className="numeral rounded-md bg-raised px-1.5 py-0.5 text-[11px] tabular-nums text-fg">
                {pulse.savedWeekCount}
              </span>
            </button>
          </div>
        </div>

        {/* 7요일 OKLCH 컬러 리듬 스트립 (320px 스냅 레일 · 420px+ 7열 그리드) */}
        <div
          role="group"
          aria-label={bt("7요일 연재 컬러 리듬 이동", "7-day color rhythm switcher")}
          data-testid="calendar-weekday-rhythm-rail"
          className="catalog-w4-day-rail"
        >
          {pulse.daySlots.map((slot) => {
            const ariaDayLabel = slot.isToday
              ? bt(`${slot.labelKo} 오늘 연재 ${slot.count}편`, `${slot.labelEn} today, ${slot.count} releases`)
              : bt(`${slot.labelKo} 연재 ${slot.count}편`, `${slot.labelEn}, ${slot.count} releases`);
            const barScale = slot.count === 0 ? 0.08 : Math.max(0.18, slot.densityRatio);

            return (
              <button
                key={slot.day}
                type="button"
                data-testid={`calendar-rhythm-day-${slot.index}`}
                data-today={slot.isToday ? "true" : "false"}
                aria-pressed={slot.isSelected}
                aria-label={ariaDayLabel}
                onClick={() => onSelectDay(slot.index)}
                style={{ "--w4-day-tone": slot.toneOklch } as CSSProperties}
                className="catalog-w4-day-pill"
              >
                <span className="flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: slot.toneOklch }}
                  />
                  <span className="font-display text-xs font-semibold text-fg">
                    {bt(slot.day, slot.shortEn)}
                  </span>
                </span>
                <span className="numeral text-[11px] font-medium tabular-nums text-fg-2">
                  {slot.count}
                </span>
                <span aria-hidden="true" className="catalog-w4-day-bar-track">
                  <span
                    className="catalog-w4-day-bar-fill"
                    style={{ transform: `scaleX(${barScale})` }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
