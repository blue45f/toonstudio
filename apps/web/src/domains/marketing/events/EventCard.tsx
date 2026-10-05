import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, CalendarDays, Gift } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import { useI18n, useT } from "@/shared/lib/i18n";

import {
  EVENT_STATUS_I18N_KEY,
  resolveMarketingEventStatus,
  type MarketingEvent,
} from "./event-catalog";
import { formatEventDate, getEventCountdown } from "./event-countdown";
import { EventArtwork } from "./EventArtwork";
import { useMarketingEventText } from "./marketing-event-copy";

/**
 * 이벤트 아트 타일 카드 — 16:9 타일(이벤트 자체 아트, 없으면 타이포그래픽 커버) 위에
 * 상태 배지를 얹고, 아래 정보 영역에 기간·제목·요약을 둔다.
 * 호버 시 이미지 줌 + 오버레이 그라디언트 심화 + 정보 슬라이드업.
 * 마감 임박 이벤트에는 글로우 D-day 배지를 표시한다 (임박 시 펄스).
 *
 * reduced-motion 환경에서는 모든 모션 변형을 비활성화하고 정적 카드로 렌더한다.
 */
export function EventCard({ event }: { event: MarketingEvent }) {
  const text = useMarketingEventText();
  const t = useT();
  const lang = useI18n((state) => state.lang);
  const prefersReducedMotion = useReducedMotion();
  const animated = !prefersReducedMotion;

  const status = resolveMarketingEventStatus(event);
  const countdown = getEventCountdown(event.endsAt);
  const periodStart = formatEventDate(event.startsAt, lang);
  const periodEnd = event.endsAt ? formatEventDate(event.endsAt, lang) : "";

  return (
    <motion.article
      initial={animated ? { opacity: 0, y: 24 } : false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-64px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="overflow-hidden rounded-[2rem] border border-line-strong bg-panel shadow-xl shadow-black/5"
    >
      <motion.div
        initial="rest"
        animate="rest"
        whileHover={animated ? "hover" : undefined}
        className="group"
      >
        <Link
          href={`/events/${event.slug}`}
          className="block rounded-[2rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
        >
          <div className="relative aspect-[16/9] overflow-hidden">
            <EventArtwork event={event} zoomOnHover />
            {/* 오버레이 그라디언트 — 배지 행 가독성용 상단 스크림. 호버 시 심화 */}
            <motion.div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent"
              variants={{ rest: { opacity: 0.7 }, hover: { opacity: 1 } }}
              transition={{ duration: 0.4 }}
            />
            {/* 배지 행 — 상태 칩 + 카운트다운 글로우 배지 */}
            <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2 sm:left-6 sm:top-6">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                <Gift size={13} aria-hidden="true" />
                {t(EVENT_STATUS_I18N_KEY[status])}
              </span>
              {countdown ? (
                <motion.span
                  className={cx(
                    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black",
                    countdown.urgent
                      ? "bg-warn text-on-accent shadow-[0_0_20px_3px_var(--color-warning-soft)]"
                      : "border border-white/25 bg-black/55 text-white backdrop-blur-sm",
                  )}
                  animate={
                    countdown.urgent && animated ? { scale: [1, 1.1, 1] } : undefined
                  }
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                >
                  {countdown.isToday
                    ? t("page.events.countdown.today")
                    : t("page.events.countdown.days", { days: countdown.daysLeft })}
                  {countdown.urgent && (
                    <span className="sr-only">
                      {t("page.events.countdown.urgentLabel")}
                    </span>
                  )}
                </motion.span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm">
                  <CalendarDays size={13} aria-hidden="true" />
                  {event.endsAt
                    ? t("page.events.card.limited")
                    : t("page.events.card.noEndDate")}
                </span>
              )}
            </div>
          </div>
          {/* 정보 영역 — 기간 · 제목 · 요약. 호버 시 슬라이드업 */}
          <motion.div
            className="p-6 sm:p-8"
            variants={{ rest: { y: 0 }, hover: { y: -6 } }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <p className="text-xs font-black tracking-[0.12em] text-fg-3">
              {text(event.eyebrow)}
            </p>
            <h3 className="mt-2 font-display text-2xl font-black tracking-[-0.02em] text-fg sm:text-3xl">
              {text(event.title)}
            </h3>
            {periodStart ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-2">
                <CalendarDays size={14} aria-hidden="true" />
                <time dateTime={event.startsAt}>{periodStart}</time>
                {" – "}
                {periodEnd && event.endsAt ? (
                  <time dateTime={event.endsAt}>{periodEnd}</time>
                ) : (
                  <span>{t("page.events.card.noEndDate")}</span>
                )}
              </p>
            ) : null}
            <p className="mt-3 text-sm leading-7 text-fg-2 sm:text-base">
              {text(event.summary)}
            </p>
            <p className="mt-4 inline-flex items-center gap-2 text-sm font-black text-accent">
              {t("page.events.card.view")}
              <motion.span
                aria-hidden="true"
                className="inline-flex"
                variants={{ rest: { x: 0 }, hover: { x: 5 } }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <ArrowRight size={16} />
              </motion.span>
            </p>
          </motion.div>
        </Link>
      </motion.div>
    </motion.article>
  );
}

export default EventCard;
