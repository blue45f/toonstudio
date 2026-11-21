/**
 * calendar-today-pulse-model.ts — /calendar 오늘의 연재 펄스 & 7요일 OKLCH 컬러 리듬 순수 모델.
 *
 * 실제 KST 오늘 요일(todayIdx)과 실제 요일별 연재 목록, 사용자의 저장 서재(savedIds)만을
 * 근거로 오늘 집중 점프, 내 서재 필터 현황, 7요일 OKLCH 컬러 리듬 밀도를 산출한다.
 */

import { WEEK_DAYS } from "@/shared/lib/taxonomy";

export interface CalendarDayBucketLike {
  readonly day: string;
  readonly items: readonly { readonly id: string }[];
}

export interface CalendarWeekdayToneSpec {
  readonly index: number;
  readonly day: (typeof WEEK_DAYS)[number];
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortEn: string;
  readonly toneOklch: string;
}

export const CALENDAR_WEEKDAY_SPECTRUM: readonly CalendarWeekdayToneSpec[] = [
  { index: 0, day: "월", labelKo: "월요일", labelEn: "Monday", shortEn: "Mon", toneOklch: "oklch(0.73 0.15 248)" },
  { index: 1, day: "화", labelKo: "화요일", labelEn: "Tuesday", shortEn: "Tue", toneOklch: "oklch(0.73 0.17 28)" },
  { index: 2, day: "수", labelKo: "수요일", labelEn: "Wednesday", shortEn: "Wed", toneOklch: "oklch(0.75 0.14 168)" },
  { index: 3, day: "목", labelKo: "목요일", labelEn: "Thursday", shortEn: "Thu", toneOklch: "oklch(0.76 0.15 112)" },
  { index: 4, day: "금", labelKo: "금요일", labelEn: "Friday", shortEn: "Fri", toneOklch: "oklch(0.75 0.16 60)" },
  { index: 5, day: "토", labelKo: "토요일", labelEn: "Saturday", shortEn: "Sat", toneOklch: "oklch(0.74 0.15 322)" },
  { index: 6, day: "일", labelKo: "일요일", labelEn: "Sunday", shortEn: "Sun", toneOklch: "oklch(0.73 0.18 42)" },
] as const;

export interface CalendarDayRhythmSlot {
  readonly index: number;
  readonly day: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortEn: string;
  readonly count: number;
  readonly savedCount: number;
  readonly densityRatio: number;
  readonly isToday: boolean;
  readonly isSelected: boolean;
  readonly toneOklch: string;
}

export interface CalendarTodayPulseModel {
  readonly todayIdx: number;
  readonly selectedDayIdx: number;
  readonly todayDay: string;
  readonly todayLabelKo: string;
  readonly todayLabelEn: string;
  readonly todayCount: number;
  readonly savedTodayCount: number;
  readonly savedWeekCount: number;
  readonly isViewingToday: boolean;
  readonly savedOnly: boolean;
  readonly spectrumCss: string;
  readonly daySlots: readonly CalendarDayRhythmSlot[];
}

export function buildCalendarTodayPulse(input: {
  readonly days: readonly CalendarDayBucketLike[];
  readonly rawDays: readonly CalendarDayBucketLike[];
  readonly todayIdx: number;
  readonly selectedDayIdx: number;
  readonly savedIds: ReadonlySet<string>;
  readonly savedOnly: boolean;
}): CalendarTodayPulseModel {
  const safeTodayIdx = Math.min(Math.max(0, input.todayIdx), CALENDAR_WEEKDAY_SPECTRUM.length - 1);
  const safeSelectedIdx = Math.min(Math.max(0, input.selectedDayIdx), CALENDAR_WEEKDAY_SPECTRUM.length - 1);

  const counts = CALENDAR_WEEKDAY_SPECTRUM.map((spec) => input.days[spec.index]?.items.length ?? 0);
  const maxCount = counts.reduce((acc, value) => Math.max(acc, value), 0);

  const uniqueSavedWeekIds = new Set<string>();
  const savedCountByDay = CALENDAR_WEEKDAY_SPECTRUM.map((spec) => {
    const rawItems = input.rawDays[spec.index]?.items ?? [];
    let daySaved = 0;
    for (const item of rawItems) {
      if (input.savedIds.has(item.id)) {
        daySaved += 1;
        uniqueSavedWeekIds.add(item.id);
      }
    }
    return daySaved;
  });

  const daySlots: CalendarDayRhythmSlot[] = CALENDAR_WEEKDAY_SPECTRUM.map((spec, idx) => {
    const count = counts[idx] ?? 0;
    return {
      index: idx,
      day: spec.day,
      labelKo: spec.labelKo,
      labelEn: spec.labelEn,
      shortEn: spec.shortEn,
      count,
      savedCount: savedCountByDay[idx] ?? 0,
      densityRatio: maxCount > 0 ? count / maxCount : 0,
      isToday: idx === safeTodayIdx,
      isSelected: idx === safeSelectedIdx,
      toneOklch: spec.toneOklch,
    };
  });

  const todaySpec = CALENDAR_WEEKDAY_SPECTRUM[safeTodayIdx]!;
  const spectrumStops = CALENDAR_WEEKDAY_SPECTRUM.map((spec, idx) => {
    const pct = Math.round((idx / (CALENDAR_WEEKDAY_SPECTRUM.length - 1)) * 100);
    return `${spec.toneOklch} ${pct}%`;
  }).join(", ");

  return {
    todayIdx: safeTodayIdx,
    selectedDayIdx: safeSelectedIdx,
    todayDay: todaySpec.day,
    todayLabelKo: todaySpec.labelKo,
    todayLabelEn: todaySpec.labelEn,
    todayCount: counts[safeTodayIdx] ?? 0,
    savedTodayCount: savedCountByDay[safeTodayIdx] ?? 0,
    savedWeekCount: uniqueSavedWeekIds.size,
    isViewingToday: safeSelectedIdx === safeTodayIdx,
    savedOnly: input.savedOnly,
    spectrumCss: `linear-gradient(90deg, ${spectrumStops})`,
    daySlots,
  };
}
