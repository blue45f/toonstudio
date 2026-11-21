/**
 * MySpaceDailyPulseRibbon.tsx — `/my` 내 공간 상단 "오늘의 작업 리듬" 모멘텀 리본.
 *
 * 14개 바로가기 목록을 훑기 전에 실제 브라우저/계정 상태 기반의 오늘의 1순위 다음 행동을
 * 즉시 실행하고, 독자·창작·계정 3대 영역의 실측 요약과 1탭 역할 필터 전환을 제공한다.
 */

import { ArrowRight, BookOpen, Compass, Layers, SlidersHorizontal, Sparkles } from "lucide-react";
import { useMemo, type CSSProperties } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import type { CreatorRecentDestination } from "@/shared/lib/creator-continuity";
import { useI18n } from "@/shared/lib/i18n";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  buildMySpaceDailyPulse,
  type MySpacePulseCategory,
  type MySpacePulseRole,
} from "./my-space-daily-pulse";

import "./my-space-daily-pulse.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("MySpaceDailyPulseRibbon", ko, en);

const DOMAIN_ICONS: Readonly<Record<MySpacePulseRole, typeof BookOpen>> = {
  reader: BookOpen,
  creator: Layers,
  account: SlidersHorizontal,
};

export interface MySpaceDailyPulseRibbonProps {
  readonly hydrated: boolean;
  readonly readsCount: number;
  readonly ratingsCount: number;
  readonly collectionsCount: number;
  readonly recentEntries: readonly CreatorRecentDestination[];
  readonly sessionStatus: string;
  readonly activeCategory: string;
  readonly onSelectCategory: (nextRole: MySpacePulseCategory) => void;
}

export function MySpaceDailyPulseRibbon({
  hydrated,
  readsCount,
  ratingsCount,
  collectionsCount,
  recentEntries,
  sessionStatus,
  activeCategory,
  onSelectCategory,
}: MySpaceDailyPulseRibbonProps) {
  useBilingualI18nRevision();
  const isKorean = useI18n((state) => state.lang.startsWith("ko"));

  const pulse = useMemo(
    () =>
      buildMySpaceDailyPulse({
        hydrated,
        readsCount,
        ratingsCount,
        collectionsCount,
        recentEntries,
        sessionStatus,
        activeCategory,
      }),
    [hydrated, readsCount, ratingsCount, collectionsCount, recentEntries, sessionStatus, activeCategory],
  );

  const normalizedActive = activeCategory.trim().toLowerCase();

  return (
    <section
      data-testid="my-space-daily-pulse-ribbon"
      aria-labelledby="my-space-daily-pulse-heading"
      className="daily-pulse-ribbon mt-3 p-3.5 sm:p-4 [word-break:keep-all]"
      style={{ "--pulse-lead-tone": pulse.topAction.toneVar } as CSSProperties}
    >
      <span className="daily-pulse-ribbon__spectrum" aria-hidden="true" />

      {/* 상단 행: 오늘의 작업 리듬 + 1순위 다음 행동 즉시 실행 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="my-space-daily-pulse-heading"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-accent"
            >
              <Compass size={13} strokeWidth={1.7} aria-hidden="true" />
              <span>{bi("오늘의 작업 리듬", "Today's work rhythm")}</span>
            </h2>
            <span
              data-testid="my-space-pulse-top-badge"
              className="inline-flex items-center rounded-full border border-line bg-card/85 px-2 py-0.5 text-[11px] font-semibold text-fg-2"
            >
              {isKorean ? pulse.topAction.badgeKo : pulse.topAction.badgeEn}
            </span>
          </div>
          <p
            data-testid="my-space-pulse-top-title"
            className="mt-1 text-sm font-bold leading-snug text-fg sm:text-base"
          >
            {isKorean ? pulse.topAction.titleKo : pulse.topAction.titleEn}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-2 tabular-nums">
            {isKorean ? pulse.topAction.detailKo : pulse.topAction.detailEn}
          </p>
        </div>

        <Link
          href={pulse.topAction.href}
          data-testid="my-space-pulse-top-cta"
          className={buttonClass({
            size: "sm",
            variant: "solid",
            className: "min-h-11 shrink-0 gap-1.5 px-4 text-xs",
          })}
        >
          <span>{isKorean ? pulse.topAction.ctaKo : pulse.topAction.ctaEn}</span>
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {/* 하단 행: 독자·창작·계정 3대 영역 실측 활성도 + 1탭 역할 필터 전환 */}
      <div
        role="group"
        aria-label={bi("오늘의 집중 모드 전환", "Switch today's focus mode")}
        className="mt-3 grid gap-2 sm:grid-cols-3"
      >
        {pulse.domains.map((domain) => {
          const Icon = DOMAIN_ICONS[domain.role];
          const pressed = domain.isActiveFilter;
          return (
            <button
              key={domain.role}
              type="button"
              data-testid={`my-space-pulse-mode-${domain.role}`}
              aria-pressed={pressed}
              onClick={() => onSelectCategory(normalizedActive === domain.role ? "all" : domain.role)}
              style={{ "--pulse-tone": domain.toneVar } as CSSProperties}
              className="daily-pulse-mode-btn flex min-h-11 w-full flex-col items-start rounded-xl px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                  <Icon size={13} strokeWidth={1.7} aria-hidden="true" style={{ color: domain.toneVar }} />
                  <span>{bi(domain.modeLabelKo, domain.modeLabelEn)}</span>
                </span>
                {domain.isRecommended ? (
                  <span
                    data-testid={`my-space-pulse-recommended-${domain.role}`}
                    className="inline-flex items-center gap-1 rounded-full border border-accent/35 bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold leading-none text-fg"
                  >
                    <Sparkles size={10} aria-hidden="true" className="text-accent" />
                    {bi("추천", "Suggested")}
                  </span>
                ) : null}
              </div>

              <span
                data-testid={`my-space-pulse-summary-${domain.role}`}
                className="mt-1 text-xs font-semibold tabular-nums text-fg-2"
              >
                {isKorean ? domain.summaryKo : domain.summaryEn}
              </span>

              <span className="mt-0.5 text-[11px] tabular-nums text-fg-3">
                {isKorean ? domain.hintKo : domain.hintEn}
              </span>

              <span
                aria-hidden="true"
                className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-raised"
              >
                <span
                  className="daily-pulse-meter-fill"
                  style={{ transform: `scaleX(${domain.barRatio})` }}
                />
              </span>
            </button>
          );
        })}
      </div>

      <p
        data-testid="my-space-pulse-recommendation-note"
        className="mt-2 text-[11px] leading-relaxed text-fg-3"
      >
        {isKorean ? pulse.recommendedReasonKo : pulse.recommendedReasonEn}
      </p>
    </section>
  );
}
