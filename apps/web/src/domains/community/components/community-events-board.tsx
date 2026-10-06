import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";

import { CommunityUnderlineTabs } from "./community-underline-tabs";

import {
  EVENT_STATUS_I18N_KEY,
  MARKETING_EVENTS,
  EventArtwork,
  formatEventDate,
  getEventCountdown,
  resolveMarketingEventStatus,
  useMarketingEventText,
  type EventStatus,
  type MarketingEvent,
} from "@/domains/marketing/public/events";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n, useT } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";
import { cn } from "@/shared/lib/utils";

const MS_PER_DAY = 86_400_000;
const STATUS_ORDER: readonly EventStatus[] = ["active", "upcoming", "ended"];

/** 시작일까지 남은 일수(다가오는 이벤트의 D-day 배지용). */
function daysUntil(iso: string, now: Date): number | null {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor((ms - now.getTime()) / MS_PER_DAY);
}

function useEventPeriod(event: MarketingEvent): string {
  const t = useT();
  const lang = useI18n((state) => state.lang);
  const start = formatEventDate(event.startsAt, lang);
  const end = event.endsAt ? formatEventDate(event.endsAt, lang) : "";
  if (!start) return "";
  return end ? `${start} – ${end}` : `${start} – ${t("page.events.card.noEndDate")}`;
}

/** 상태별 D-day 배지 문구. 종료 이벤트는 배지를 붙이지 않는다(상태 배지가 말한다). */
function useDDayLabel(event: MarketingEvent, status: EventStatus, now: Date): string | null {
  const t = useT();
  if (status === "active") {
    const countdown = getEventCountdown(event.endsAt, now);
    if (!countdown) return t("page.events.card.noEndDate");
    return countdown.isToday
      ? t("page.events.countdown.today")
      : t("page.events.countdown.days", { days: countdown.daysLeft });
  }
  if (status === "upcoming") {
    const days = daysUntil(event.startsAt, now);
    if (days === null) return null;
    return days <= 0
      ? t("page.events.countdown.today")
      : t("page.events.countdown.days", { days });
  }
  return null;
}

function EventBadges({ event, status, now }: { event: MarketingEvent; status: EventStatus; now: Date }) {
  const t = useT();
  const dday = useDDayLabel(event, status, now);
  return (
    <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center rounded-full border border-white/25 bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
        {t(EVENT_STATUS_I18N_KEY[status])}
      </span>
      {dday ? (
        <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-black text-on-accent">
          {dday}
        </span>
      ) : null}
    </div>
  );
}

function BoardEventCard({
  event,
  status,
  now,
}: {
  event: MarketingEvent;
  status: EventStatus;
  now: Date;
}) {
  const text = useMarketingEventText();
  const period = useEventPeriod(event);
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group block h-full overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <article className="flex h-full flex-col">
        <div className={cn("relative aspect-[16/9] overflow-hidden bg-raised", status === "ended" && "saturate-[.55]")}>
          <EventArtwork event={event} />
          <EventBadges event={event} status={status} now={now} />
        </div>
        <div className="flex flex-1 flex-col p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-fg-3">{text(event.eyebrow)}</p>
          <h3 className="mt-1.5 line-clamp-2 text-lg font-black leading-snug text-fg">{text(event.title)}</h3>
          {period ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-fg-2">
              <CalendarDays size={13} aria-hidden="true" />
              {period}
            </p>
          ) : null}
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-fg-2">{text(event.summary)}</p>
        </div>
      </article>
    </Link>
  );
}

function HeroEventCard({ event, now }: { event: MarketingEvent; now: Date }) {
  const text = useMarketingEventText();
  const period = useEventPeriod(event);
  return (
    <article className="overflow-hidden rounded-3xl border border-line bg-panel">
      <div className="relative aspect-[16/8] overflow-hidden bg-raised sm:aspect-[21/8]">
        <EventArtwork event={event} priority />
        <EventBadges event={event} status="active" now={now} />
      </div>
      <div className="p-6 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-fg-3">{text(event.eyebrow)}</p>
        <h3 className="mt-2 font-display text-2xl font-black tracking-tight text-fg sm:text-3xl">{text(event.title)}</h3>
        {period ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-2">
            <CalendarDays size={14} aria-hidden="true" />
            {period}
          </p>
        ) : null}
        <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">{text(event.summary)}</p>
        <div className="mt-5">
          <Link href={`/events/${event.slug}`} className={buttonClass({ size: "md", className: "min-h-11" })}>
            {text(event.primaryCta)}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/**
 * 이벤트 보드 — 공식 이벤트 카탈로그를 진행 상황으로 재구성한 표면.
 *
 * 상단에 진행 중 히어로 카드(아트 배너 + D-day 배지 + 참여 버튼)를 두고,
 * 상태 필터 탭(진행 중/예정/종료)으로 카드 그리드를 나눈다.
 * 종료 이벤트는 채도를 낮춘 커버로 표시한다. 참여 인원은 카탈로그에 데이터가 없어 표시하지 않는다.
 */
export function CommunityEventsBoard() {
  const t = useBilingual("domains.community.CommunityEventsBoard");
  const dict = useT();
  const now = useMemo(() => new Date(), []);
  const grouped = useMemo(() => {
    const map: Record<EventStatus, MarketingEvent[]> = { active: [], upcoming: [], ended: [] };
    for (const event of MARKETING_EVENTS) map[resolveMarketingEventStatus(event, now)].push(event);
    return map;
  }, [now]);

  const [tab, setTab] = useState<EventStatus>(() =>
    grouped.active.length > 0 ? "active" : grouped.upcoming.length > 0 ? "upcoming" : "ended",
  );

  const emptyCopy: Record<EventStatus, string> = {
    active: t("지금 진행 중인 이벤트가 없어요. 예정된 이벤트를 먼저 확인해 보세요.", "No event is running right now. Check what's coming up."),
    upcoming: t("예정된 이벤트가 없어요.", "No upcoming events."),
    ended: t("종료된 이벤트가 아직 없어요.", "No ended events yet."),
  };

  const hero = grouped.active[0];
  const visible = grouped[tab];

  return (
    <section aria-label={t("이벤트 보드", "Event board")} className="mt-6">
      <div>
        <p className="eyebrow text-accent">EVENT BOARD</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight">
          {t("진행 상황별로 보는 이벤트", "Events by status")}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
          {t(
            "공식 이벤트를 진행 중·예정·종료로 나눠 모았습니다. 카드를 누르면 상세와 참여 방법을 볼 수 있어요.",
            "Official events grouped by running, upcoming, and ended. Open a card for details and how to join.",
          )}
        </p>
      </div>

      {hero ? (
        <div className="mt-5">
          <HeroEventCard event={hero} now={now} />
        </div>
      ) : null}

      <div className="mt-7">
        <CommunityUnderlineTabs<EventStatus>
          ariaLabel={t("이벤트 상태 필터", "Event status filter")}
          layoutId="community-events-board-tab-underline"
          value={tab}
          onChange={setTab}
          items={STATUS_ORDER.map((status) => ({
            id: status,
            label: dict(EVENT_STATUS_I18N_KEY[status]),
            count: grouped[status].length,
          }))}
        />
        <div role="tabpanel" className="pt-5">
          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
              <p className="text-sm font-bold text-fg">{emptyCopy[tab]}</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {visible.map((event, index) => (
                <div key={event.id} {...introItemProps(index)}>
                  <BoardEventCard event={event} status={tab} now={now} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
