import { Brush, CalendarDays, Clapperboard, Compass, Flame, Globe2, SlidersHorizontal, Sparkles } from "lucide-react";

import { spectrumGradient } from "@/shared/lib/genre-color";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { GENRES } from "@/shared/lib/taxonomy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const FACET_LINKS = [
  { id: "discover", href: "/discover", icon: Compass, ko: "탐색 홈", en: "Discover Home", current: true },
  { id: "explore", href: "/explore", icon: SlidersHorizontal, ko: "장르·필터", en: "Genre & Filters", current: false },
  { id: "recommend", href: "/recommend", icon: Sparkles, ko: "취향 추천", en: "Taste Picks", current: false },
  { id: "ranking", href: "/ranking", icon: Flame, ko: "인기 차트", en: "Top Charts", current: false },
  { id: "calendar", href: "/calendar", icon: CalendarDays, ko: "요일 연재표", en: "Daily Schedule", current: false },
  { id: "cuts", href: "/cuts", icon: Clapperboard, ko: "컷츠 피드", en: "Cuts Feed", current: false },
] as const;

const FULL_SPECTRUM_RIBBON = spectrumGradient(GENRES);

/**
 * 시안 E (Spectrum Super Hub) — 18종 장르 OKLCH 스펙트럼 리본 + 멀티플랫폼(어디서 봐·기다무·컷츠) 통합 패싯 바.
 */
export function DiscoverFacetTabStrip() {
  const bt = useBilingual("DiscoverFacetTabStrip");

  return (
    <nav
      aria-label={bt("스펙트럼 빠른 이동", "Spectrum quick facets")}
      data-testid="discover-facet-tab-strip"
      className="mb-5 overflow-hidden rounded-2xl border border-line-strong/75 bg-[linear-gradient(155deg,color-mix(in_oklch,var(--color-accent)_9%,var(--color-panel)),var(--color-card))] shadow-sm"
    >
      <div
        aria-hidden="true"
        data-discover-spectrum-ribbon="true"
        className="h-[3px] w-full"
        style={{ background: FULL_SPECTRUM_RIBBON }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/65 px-3.5 py-2">
        <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-extrabold uppercase tracking-[0.08em] text-accent">
          <Sparkles size={13} aria-hidden="true" />
          <span>{bt("SPECTRUM SUPER HUB · 18종 장르 스펙트럼", "SPECTRUM SUPER HUB · 18-GENRE SPECTRUM")}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel/80 px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
          <Globe2 size={12} className="text-accent" aria-hidden="true" />
          <span>{bt("어디서 봐 가격·무료분 비교 · 기다무(WUF) · 컷츠", "Where-to-Read Price Router · WUF · Cuts")}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 p-2">
        <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          {FACET_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors",
                    item.current
                      ? "bg-accent text-on-accent shadow-xs"
                      : "text-fg-2 hover:bg-panel hover:text-fg",
                  )}
                >
                  <Icon size={14} aria-hidden="true" />
                  {bt(item.ko, item.en)}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href="/create"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-accent/45 bg-accent-soft px-3.5 text-xs font-black text-accent transition-colors hover:border-accent hover:bg-accent hover:text-on-accent"
        >
          <Brush size={14} aria-hidden="true" />
          {bt("이 감성으로 3컷 창작", "Create 3-panel story")}
        </Link>
      </div>
    </nav>
  );
}
