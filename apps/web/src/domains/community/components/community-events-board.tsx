import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";

import { CommunityUnderlineTabs } from "./community-underline-tabs";

import {
  EVENT_STATUS_I18N_KEY,
  EventArtwork,
  MARKETING_EVENTS,
  formatEventDate,
  getEventCountdown,
  resolveMarketingEventStatus,
  useMarketingEventText,
  type EventStatus,
  type MarketingEvent,
} from "@/domains/marketing/public/events";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n, useT } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const MS_PER_DAY = 86_400_000;
const STATUS_ORDER: readonly EventStatus[] = ["active", "upcoming", "ended"];

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
    <div className="absolute left-3.5 top-3.5 flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center rounded-md border border-white/20 bg-black/65 px-2.5 py-1 text-xs font-medium text-white">
        {t(EVENT_STATUS_I18N_KEY[status])}
      </span>
      {dday ? (
        <span className="inline-flex items-center rounded-md bg-accent px-2.5 py-1 text-xs font-semibold tabular-nums text-on-accent">
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
      className="ink-frame group block h-full overflow-hidden rounded-2xl border border-line bg-card/85 transition-colors duration-150 hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
    >
      <article className="flex h-full flex-col">
        <div className={cn("ink-cover ink-sheen relative aspect-[16/9] overflow-hidden bg-raised", status === "ended" && "saturate-[.55]")}>
          <EventArtwork event={event} />
          <EventBadges event={event} status={status} now={now} />
        </div>
        <div className="flex flex-1 flex-col p-5">
          <p className="text-xs font-medium text-fg-3">{text(event.eyebrow)}</p>
          <h3 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-fg [word-break:keep-all] sm:text-lg">
            {text(event.title)}
          </h3>
          {period ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs tabular-nums text-fg-2">
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
    <article className="overflow-hidden rounded-2xl border border-line bg-card/85">
      <div className="ink-cover ink-sheen relative aspect-[16/8] overflow-hidden bg-raised sm:aspect-[21/8]">
        <EventArtwork event={event} priority />
        <EventBadges event={event} status="active" now={now} />
      </div>
      <div className="p-5 sm:p-7">
        <p className="text-xs font-medium text-fg-3">{text(event.eyebrow)}</p>
        <h3 className="mt-1.5 text-xl font-semibold tracking-tight text-fg [word-break:keep-all] sm:text-2xl">
          {text(event.title)}
        </h3>
        {period ? (
          <p className="mt-2.5 inline-flex items-center gap-1.5 text-sm tabular-nums text-fg-2">
            <CalendarDays size={14} aria-hidden="true" />
            {period}
          </p>
        ) : null}
        <p className="mt-2.5 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">{text(event.summary)}</p>
        <div className="mt-5">
          <Link href={`/events/${event.slug}`} className={buttonClass({ size: "md", className: "min-h-11 rounded-lg" })}>
            {text(event.primaryCta)}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

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
        <p className="text-xs font-medium text-accent">{t("공식 일정", "Official schedule")}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-fg [word-break:keep-all] sm:text-2xl">
          {t("진행 상황별로 보는 이벤트", "Events by status")}
        </h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-fg-2">
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
            <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
              <p className="text-sm font-medium text-fg">{emptyCopy[tab]}</p>
            </div>
          ) : (
            <div key={tab} className="ink-cascade grid gap-4 md:grid-cols-2">
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
