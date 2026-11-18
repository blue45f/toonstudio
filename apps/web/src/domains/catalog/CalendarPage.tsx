import "./catalog-page-controls.css";
import { CalendarDays, CalendarPlus, RotateCcw } from "lucide-react";
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { PlatformId, Title, TitleCard } from "@/shared/lib/types";

import { AdultOverlay } from "@/shared/components/adult-overlay";
import { AvailabilityDots } from "@/shared/components/availability";
import { CoverImage } from "@/shared/components/cover-image";
import { MiniPoster } from "@/shared/components/rank-row";
import { Container } from "@/shared/components/section";
import { SectionArt } from "@/shared/components/section-art";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { RatingInline } from "@/shared/components/ui/stars";
import { coverStandardSrcSet } from "@/shared/lib/cover-proxy";
import { statsAreEstimated } from "@/shared/lib/estimate";
import { buildWeeklyIcs, downloadIcs, titleToWeeklyIcsEvent } from "@/shared/lib/ics";
import { useSavedTitleIds } from "@/shared/lib/store";
import { WEEK_DAYS } from "@/shared/lib/taxonomy";
import {
  EMPTY_TITLE_FILTERS,
  applyTitleFilters,
  countActiveTitleFilters,
} from "@/shared/lib/title-filters";
import { useRememberedFilters } from "@/shared/lib/use-remembered-filters";
import {
  formatI18nTemplate,
  getCurrentUiLocale,
  useBilingual,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn, kstTodayIdx } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import {
  runSameDocumentViewTransition,
  type CalendarBmFilterId,
} from "@/shared/navigation/webtoon-platform-router-ux-model";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { useApiResource } from "@/platform/use-api-resource";

import { CalendarFilters } from "./CalendarFilters";
import { useLocalCatalogFallback } from "./local-catalog-fallback";
import { useCatalogInkIndicator } from "./use-catalog-ink-indicator";

interface CalendarResponse {
  todayIdx: number;
  todayDay: string;
  todayCount: number;
  totalScheduled: number;
  platformCoverage: { id: PlatformId; label: string; color: string; count: number; share: number }[];
  days: { day: string; items: TitleCard[] }[];
  generatedAt: string;
}

const WEEK_DAY_LABEL: Readonly<Record<string, readonly [string, string]>> = {
  "월": ["월요일", "Monday"],
  "화": ["화요일", "Tuesday"],
  "수": ["수요일", "Wednesday"],
  "목": ["목요일", "Thursday"],
  "금": ["금요일", "Friday"],
  "토": ["토요일", "Saturday"],
  "일": ["일요일", "Sunday"],
};
const CALENDAR_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const asTitle = (card: TitleCard) => card as unknown as Title;
const asTitleList = (cards: TitleCard[]) => cards as unknown as Title[];

/** 선택한 요일의 표지 그리드 카드 — 아트워크가 색을 담고 메타는 조용히 받친다. */
function CalendarCoverTile({
  title,
  day,
  index,
}: {
  readonly title: TitleCard;
  readonly day: string;
  readonly index: number;
}) {
  const [coverFrom, coverTo] = title.cover ?? ["var(--color-panel)", "var(--color-canvas)"];
  const glyph = title.title.replace(/[^\p{L}\p{N}]/gu, "").charAt(0) || "T";

  return (
    <Link
      href={`/title/${title.slug}`}
      data-route-return-focus={`catalog-calendar:${day}:${title.id}`}
      style={{ "--ink-i": Math.min(index, 8), "--ink-radius": "12px" } as CSSProperties}
      className="ink-frame group flex flex-col gap-2 rounded-xl border border-line bg-card p-2 transition-colors duration-150 hover:border-line-strong hover:bg-raised motion-reduce:transition-none"
    >
      <span
        className="ink-cover ink-sheen relative block aspect-[3/4] w-full overflow-hidden rounded-lg border border-line/70"
        style={{
          background: `linear-gradient(145deg, color-mix(in oklch, ${coverFrom} 82%, var(--color-panel)), color-mix(in oklch, ${coverTo} 78%, var(--color-canvas)))`,
        }}
      >
        {title.coverImage ? (
          <CoverImage
            src={title.coverImage}
            alt=""
            priority={index < 6}
            srcSet={coverStandardSrcSet(title.coverImage)}
            sizes="(max-width: 639px) 46vw, (max-width: 1023px) 30vw, 14rem"
            fallback={
              <span aria-hidden="true" className="grid size-full place-items-center font-display text-3xl font-semibold text-fg/65">
                {glyph}
              </span>
            }
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span aria-hidden="true" className="grid size-full place-items-center font-display text-3xl font-semibold text-fg/65">
            {glyph}
          </span>
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-2 rounded-md border border-line/60 bg-canvas/75 px-1.5 py-0.5 font-display text-[11px] font-medium tabular-nums text-fg backdrop-blur-sm [-webkit-backdrop-filter:blur(4px)]"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        {title.ageRating === "19" ? <AdultOverlay compact hasCover={Boolean(title.coverImage)} /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-between gap-1 px-0.5">
        <span className="line-clamp-2 text-xs font-medium leading-snug text-fg transition-colors duration-150 group-hover:text-accent [word-break:keep-all]">
          {title.title}
        </span>
        <span className="flex flex-wrap items-center justify-between gap-x-1 gap-y-0.5 pt-0.5">
          <span className="whitespace-nowrap">
            <RatingInline value={title.stats.ratingAvg} estimated={statsAreEstimated(asTitle(title))} size="xs" />
          </span>
          <AvailabilityDots availability={title.availability} max={2} />
        </span>
      </span>
    </Link>
  );
}

// 주간 7열 요약 행 — 데스크톱 주간 전체 보드용 컴팩트 행.
function CalItem({ title, day, className }: { title: TitleCard; day: string; className?: string }) {
  return (
    <Link
      href={`/title/${title.slug}`}
      data-route-return-focus={`catalog-calendar:${day}:${title.id}`}
      className={cn(
        "group flex min-h-11 gap-2.5 rounded-lg p-1.5 transition-colors duration-150 hover:bg-raised motion-reduce:transition-none",
        className,
      )}
    >
      <MiniPoster title={title} className="w-9 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <span className="line-clamp-2 text-xs font-medium leading-tight text-fg group-hover:text-accent">
          {title.title}
        </span>
        <span className="flex flex-wrap items-center justify-between gap-x-1 gap-y-0.5">
          <span className="whitespace-nowrap">
            <RatingInline value={title.stats.ratingAvg} estimated={statsAreEstimated(asTitle(title))} size="xs" />
          </span>
          <AvailabilityDots availability={title.availability} max={2} />
        </span>
      </span>
    </Link>
  );
}

function CalendarDayItems({ items, day, compact = false }: { items: TitleCard[]; day: string; compact?: boolean }) {
  const bt = useBilingual("CalendarPage");
  const locale = getCurrentUiLocale();
  const dayPair = WEEK_DAY_LABEL[day];
  const dayLabel = dayPair ? bt(...dayPair) : day;
  const [limit, setLimit] = useState(compact ? 10 : 18);
  const listId = useId();
  const visible = items.slice(0, limit);
  const pageStep = compact ? 16 : 18;

  return (
    <>
      {compact ? (
        <div id={listId} className="flex flex-col gap-2">
          {visible.map((title) => (
            <CalItem key={title.id} title={title} day={day} />
          ))}
        </div>
      ) : (
        <div
          id={listId}
          data-ink-stagger="panel"
          className="ink-cascade grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
        >
          {visible.map((title, idx) => (
            <CalendarCoverTile key={title.id} title={title} day={day} index={idx} />
          ))}
        </div>
      )}
      {items.length > (compact ? 10 : 18) && (
        <div className="mt-4 border-t border-line pt-3">
          <p role="status" className="mb-2 text-xs tabular-nums text-fg-3">
            {formatI18nTemplate(bt("{v0} {v1} / {v2}편", "{v0} · {v1} / {v2} stories"), {
              v0: dayLabel,
              v1: visible.length.toLocaleString(locale),
              v2: items.length.toLocaleString(locale),
            })}
          </p>
          {limit < items.length && (
            <button
              type="button"
              aria-controls={listId}
              onClick={() => setLimit((current) => current + pageStep)}
              className="min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-xs font-medium text-fg-2 transition-colors duration-150 hover:border-line-strong hover:bg-raised hover:text-fg motion-reduce:transition-none"
            >
              {formatI18nTemplate(bt("{v0} {v1}편 더 보기", "Show {v1} more on {v0}"), {
                v0: dayLabel,
                v1: Math.min(pageStep, items.length - limit),
              })}
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function CalendarPage() {
  useBilingualI18nRevision();
  const bt = useBilingual("CalendarPage");
  const locale = getCurrentUiLocale();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const rawResource = useApiResource<CalendarResponse>(
    "/api/calendar",
    bt("연재 캘린더를 불러오지 못했습니다.", "Couldn't load the release calendar."),
  );
  const { data, loading, error, reload } = useLocalCatalogFallback("/api/calendar", rawResource);
  const countsReady = !loading && !error && !!data;
  const { filters, setFilters, remember, toggleRemember } = useRememberedFilters("calendar");
  const platformFilterActive = filters.platforms.length > 0;

  const dayTabsId = useId();
  const dayTabListRef = useRef<HTMLDivElement>(null);
  const requestedDay = new URLSearchParams(search).get("day");
  const selectedDayIdx = CALENDAR_DAY_KEYS.findIndex((day) => day === requestedDay);
  const selectDay = (index: number | null) => {
    const day = index === null ? null : CALENDAR_DAY_KEYS[index];
    if (index !== null && !day) return;
    const next = new URLSearchParams(search);
    if (day) next.set("day", day);
    else next.delete("day");
    const nextSearch = next.toString();
    navigate({ pathname, search: nextSearch ? `?${nextSearch}` : "", hash }, { replace: true, preventScrollReset: true });
  };
  const applyBmPreset = (nextBmId: CalendarBmFilterId) => {
    runSameDocumentViewTransition(() => {
      if (nextBmId === "all") {
        setFilters({ ...filters, pricing: [], status: [], yearRange: null });
      } else if (nextBmId === "wait-free") {
        setFilters({ ...filters, pricing: ["wait-free"], status: [], yearRange: null });
      } else if (nextBmId === "free") {
        setFilters({ ...filters, pricing: ["free"], status: [], yearRange: null });
      } else if (nextBmId === "new") {
        setFilters({ ...filters, pricing: [], status: ["ongoing"], yearRange: [2025, 2026] });
      } else if (nextBmId === "completed") {
        setFilters({ ...filters, pricing: [], status: ["completed"], yearRange: null });
      }
    });
  };
  const savedIds = useSavedTitleIds();
  const titleFilterCount = countActiveTitleFilters(filters) - filters.platforms.length;
  const titleFilterActive = titleFilterCount > 0;
  const anyFilterActive = platformFilterActive || titleFilterActive;

  const todayIdx = kstTodayIdx();
  const todayDay = WEEK_DAYS[todayIdx];
  const todayPair = WEEK_DAY_LABEL[todayDay];
  const todayLabel = todayPair ? bt(...todayPair) : todayDay;
  const rawDays = data?.days ?? WEEK_DAYS.map((day) => ({ day, items: [] }));
  const days = anyFilterActive
    ? rawDays.map((d) => ({
        day: d.day,
        items: applyTitleFilters(asTitleList(d.items), filters, savedIds),
      }))
    : rawDays;
  const totalScheduled = anyFilterActive
    ? days.reduce((n, d) => n + d.items.length, 0)
    : data?.totalScheduled ?? 0;
  const todayCount = days[todayIdx]?.items.length ?? 0;
  const selDay = Math.min(selectedDayIdx < 0 ? todayIdx : selectedDayIdx, Math.max(0, days.length - 1));
  const selItems = days[selDay]?.items ?? [];
  const selDayPair = WEEK_DAY_LABEL[days[selDay]?.day ?? ""];
  const selDayLabel = selDayPair ? bt(...selDayPair) : (days[selDay]?.day ?? "");
  const filterIdentity = JSON.stringify(filters);
  const dayInk = useCatalogInkIndicator(dayTabListRef, selDay, {
    activeSelector: '[aria-selected="true"]',
    itemSelector: '[role="tab"]',
    maxInsetPx: 0,
  });

  const onDayKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = event.key === "ArrowRight" ? (index + 1) % days.length
      : event.key === "ArrowLeft" ? (index + days.length - 1) % days.length
        : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    selectDay(next);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]').item(next).focus();
  };

  const exportable = new Map<string, { title: TitleCard; days: string[] }>();
  for (const { day, items } of days) {
    for (const title of items) {
      const entry = exportable.get(title.id);
      if (entry) entry.days.push(day);
      else exportable.set(title.id, { title, days: [day] });
    }
  }
  const exportIcs = () => {
    if (exportable.size === 0) return;
    const events = [...exportable.values()].map(({ title, days: titleDays }) =>
      titleToWeeklyIcsEvent(asTitle(title), titleDays),
    );
    downloadIcs(
      buildWeeklyIcs(events, { calendarName: bt("툰스튜디오 연재 캘린더", "ToonStudio Release Calendar") }),
      "toonstudio-calendar.ics",
    );
  };

  const jumpToToday = () => {
    selectDay(null);
    const target =
      document.getElementById(`${dayTabsId}-panel`) ??
      document.getElementById("calendar-today-col");
    target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  return (
    <Container size="wide" className="calendar-page-layout py-6 sm:py-8">
      <div className="calendar-page-heading-wrap mb-4">
        <header className="min-w-0">
          <h1 data-ink="line" className="text-2xl font-semibold tracking-tight text-fg [word-break:keep-all] sm:text-3xl">
            {bt("연재 캘린더", "Release Calendar")}
          </h1>
          <p className="mt-4 text-sm text-fg-2">
            {bt("오늘은", "Today is")} <span className="font-medium text-accent">{todayLabel}</span>{" · "}
            {loading
              ? bt("연재 정보를 확인하고 있어요.", "Checking release information.")
              : countsReady
                ? <>{todayCount.toLocaleString(locale)}{bt("편의 새 회차", " stories with new episodes")}</>
                : bt("연재 편수를 확인할 수 없습니다.", "Release counts are unavailable.")}
          </p>
        </header>
      </div>

      <CalendarFilters
        filters={filters}
        onChange={setFilters}
        onPreset={applyBmPreset}
        platforms={data?.platformCoverage ?? []}
        savedCount={savedIds.size}
        remember={remember}
        onToggleRemember={toggleRemember}
        actions={
          <button
            type="button"
            onClick={exportIcs}
            disabled={loading || !!error || exportable.size === 0}
            title={bt("현재 필터 기준 연재 일정을 캘린더 앱용 .ics 파일로 저장 (주간 반복 일정)", "Save the release schedule for the current filters as an .ics file for calendar apps (weekly repeating schedule)")}
            className={buttonClass({ size: "sm", variant: "quiet", className: "min-h-11 min-w-11 gap-1.5 rounded-lg" })}
          >
            <CalendarPlus size={14} strokeWidth={1.5} aria-hidden="true" />
            {bt("내보내기 (.ics)", "Export (.ics)")}
            {exportable.size > 0 && (
              <span className="numeral text-xs tabular-nums text-fg-3">
                {exportable.size.toLocaleString(locale)}
              </span>
            )}
          </button>
        }
      />

      {!loading && !error && (
        <section
          aria-label={bt("오늘 연재 하이라이트", "Today's release highlights")}
          className="sticky top-[var(--site-header-sticky-offset,5rem)] z-30 mb-5 overflow-hidden rounded-xl border border-line bg-card/92 backdrop-blur-md [-webkit-backdrop-filter:blur(12px)]"
        >
          <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
            <p className="flex min-w-0 items-center gap-2 text-sm">
              <span className="inline-flex size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <span className="truncate">
                <strong className="font-medium text-fg">{bt("오늘", "Today")} {todayLabel}</strong>
                <span className="text-fg-2">
                  {" "}{bt("· 새 회차", "· new episodes")}{" "}
                  <span className="numeral font-medium tabular-nums text-fg">
                    {todayCount.toLocaleString(locale)}
                  </span>
                  {bt("편", " stories")}
                </span>
              </span>
            </p>
            <button
              type="button"
              onClick={jumpToToday}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-line bg-panel px-3 text-xs font-medium text-accent transition-colors duration-150 hover:border-accent/50 hover:bg-accent-soft motion-reduce:transition-none"
            >
              {bt("오늘 보기", "View today")}
            </button>
          </div>
        </section>
      )}

      {error ? (
        <ErrorState title={bt("연재 캘린더를 불러오지 못했습니다.", "Couldn't load the release calendar.")} message={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {WEEK_DAYS.map((day) => (
            <section key={day} data-calendar-loading-day={day} className={cn("rounded-xl border border-line bg-panel/30 p-3", day === WEEK_DAYS[selDay] ? "block" : "hidden xl:block")}>
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-sm font-semibold">{day}</span>
                <span className="skeleton h-4 w-8" />
              </div>
              <div className="space-y-2.5">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="flex gap-2.5">
                    <span className="skeleton h-12 w-10 rounded-lg" />
                    <span className="flex-1 space-y-2 py-1">
                      <span className="skeleton block h-3 w-full" />
                      <span className="skeleton block h-3 w-2/3" />
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <>
          {/* 모든 화면 폭에서 작동하는 슬라이딩 요일 탭 + 선택 요일 표지 그리드 */}
          <div>
            <div
              ref={dayTabListRef}
              role="tablist"
              aria-label={bt("요일 선택", "Choose a day")}
              onPointerMove={dayInk.onPointerMove}
              onPointerLeave={dayInk.onPointerLeave}
              onFocusCapture={dayInk.onFocusCapture}
              onBlurCapture={dayInk.onBlurCapture}
              className="calendar-day-tabs"
            >
              {days.map(({ day, items }, index) => {
                const on = index === selDay;
                const isToday = index === todayIdx;
                return (
                  <button
                    key={day}
                    type="button"
                    role="tab"
                    id={`${dayTabsId}-tab-${index}`}
                    aria-selected={on}
                    aria-controls={`${dayTabsId}-panel`}
                    tabIndex={on ? 0 : -1}
                    onKeyDown={(event) => onDayKey(event, index)}
                    onClick={() => selectDay(index)}
                    className={cn(
                      "calendar-day-tab",
                      on && "is-selected",
                    )}
                  >
                    <span className={cn("font-display text-sm font-medium", isToday && !on && "text-accent", on && "font-semibold text-fg")}>
                      {day}
                      {isToday && <span aria-hidden="true" className="ml-1 align-top text-[0.55rem] text-accent">●</span>}
                    </span>
                    <span className="numeral text-xs tabular-nums text-fg-3">{items.length}</span>
                  </button>
                );
              })}
              <span aria-hidden="true" className="calendar-day-ink-indicator" style={dayInk.style} />
            </div>

            <div
              className="mt-5 scroll-mt-[calc(var(--site-header-sticky-offset,5rem)+5rem)]"
              id={`${dayTabsId}-panel`}
              role="tabpanel"
              aria-labelledby={`${dayTabsId}-tab-${selDay}`}
              tabIndex={0}
            >
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-fg [word-break:keep-all] sm:text-lg">
                  {formatI18nTemplate(bt("{v0} 연재 ({v1}편)", "{v0} releases ({v1} stories)"), {
                    v0: selDayLabel,
                    v1: selItems.length.toLocaleString(locale),
                  })}
                </h2>
              </div>
              {selItems.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line bg-card/40 px-4 py-10 text-center text-xs text-fg-3">
                  {formatI18nTemplate(bt("{v0} 연재 없음", "No releases on {v0}"), { v0: selDayLabel })}
                </p>
              ) : (
                <CalendarDayItems key={`${selDay}-${filterIdentity}`} items={selItems} day={days[selDay]?.day ?? ""} />
              )}
            </div>
          </div>

          {/* 데스크톱(xl+): 한눈에 훑는 주간 7열 요약 보드 */}
          <div className="mt-12 hidden border-t border-line pt-8 xl:block">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg">{bt("주간 전체 시간표", "Full weekly board")}</h2>
              <span className="numeral text-xs tabular-nums text-fg-3">
                {totalScheduled.toLocaleString(locale)}{bt("편", " series")}
              </span>
            </div>
            <div className="grid gap-3 xl:grid-cols-7">
              {days.map(({ day, items }, index) => {
                const isToday = index === todayIdx;
                return (
                  <section
                    key={day}
                    id={isToday ? "calendar-today-col" : undefined}
                    className={cn(
                      "relative flex scroll-mt-[calc(var(--site-header-sticky-offset,5rem)+5rem)] flex-col overflow-hidden rounded-xl border",
                      isToday ? "border-accent/55 bg-card" : "border-line bg-panel/35",
                    )}
                  >
                    <header
                      className={cn(
                        "flex items-center justify-between border-b px-3 py-2.5",
                        isToday ? "border-accent/30" : "border-line",
                      )}
                    >
                      <span className={cn("font-display text-sm font-semibold", isToday ? "text-accent" : "text-fg")}>
                        {day}
                        {isToday && <span className="ml-1.5 text-xs font-medium">{bt("오늘", "Today")}</span>}
                      </span>
                      <span className="numeral text-xs tabular-nums text-fg-3">{items.length}</span>
                    </header>
                    <div className="flex flex-col gap-2 p-2">
                      {items.length === 0 ? (
                        <p className="px-1 py-6 text-center text-xs text-fg-3">{bt("연재 없음", "No releases")}</p>
                      ) : (
                        <CalendarDayItems key={`${day}-${filterIdentity}`} items={items} day={day} compact />
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}

      {!loading && !error && totalScheduled === 0 && (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-card/40 p-10 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-raised text-fg-3">
            <CalendarDays size={22} strokeWidth={1.5} aria-hidden="true" />
          </span>
          {anyFilterActive ? (
            <>
              <div>
                <p className="text-sm font-medium text-fg">{bt("선택한 조건에 맞는 연재 작품이 없습니다.", "No series match the selected filters.")}</p>
                <p className="mt-1 text-xs text-fg-3">{bt("필터를 초기화하면 전체 연재 일정을 볼 수 있어요.", "Reset the filters to see the full release schedule.")}</p>
              </div>
              <button
                type="button"
                onClick={() => setFilters(EMPTY_TITLE_FILTERS)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised"
              >
                <RotateCcw size={14} strokeWidth={1.5} aria-hidden="true" />
                {bt("필터 초기화", "Reset filters")}
              </button>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-fg">{bt("연재요일 정보가 있는 작품이 없습니다.", "No stories have release-day information.")}</p>
                <p className="mt-1 text-xs text-fg-3">{bt("다음 카탈로그 수집이 성공하면 DB 스냅샷 기준으로 자동 반영됩니다.", "Once the next catalog collection succeeds, this updates automatically from the DB snapshot.")}</p>
              </div>
              <Link
                href="/explore"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised"
              >
                {bt("탐색으로 작품 찾기", "Find stories in Explore")}
              </Link>
            </>
          )}
        </div>
      )}

      <details className="mt-8 rounded-xl border border-line bg-panel/30 p-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-fg-2 hover:text-fg">
          {bt("연재 캘린더 활용 안내", "Release calendar guide")}
        </summary>
        <div className="mt-3 space-y-4">
          <SiteContextualSubNav pathnameOverride="/calendar" />
          <SectionArt
            image="explore"
            className="block h-36 w-full rounded-xl object-cover object-center sm:h-44"
          />
          <SiteArtSurfaceSpotlight cardId="nb-ranking-constellation" defaultLensId="workflow" compact />
        </div>
      </details>
    </Container>
  );
}
