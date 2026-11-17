import { Brush, CalendarDays, Clapperboard, Compass, Flame, Globe2, SlidersHorizontal, Star } from "lucide-react";

import { spectrumGradient } from "@/shared/lib/genre-color";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { GENRES } from "@/shared/lib/taxonomy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const FACET_LINKS = [
  { id: "discover", href: "/discover", icon: Compass, ko: "탐색 홈", en: "Discover Home", current: true },
  { id: "explore", href: "/explore", icon: SlidersHorizontal, ko: "장르·필터", en: "Genre & Filters", current: false },
  { id: "recommend", href: "/recommend", icon: Star, ko: "취향 추천", en: "Taste Picks", current: false },
  { id: "ranking", href: "/ranking", icon: Flame, ko: "인기 차트", en: "Top Charts", current: false },
  { id: "calendar", href: "/calendar", icon: CalendarDays, ko: "요일 연재표", en: "Daily Schedule", current: false },
  { id: "cuts", href: "/cuts", icon: Clapperboard, ko: "컷츠 피드", en: "Cuts Feed", current: false },
] as const;

const FULL_SPECTRUM_RIBBON = spectrumGradient(GENRES);

/**
 * 시안 E (Spectrum Super Hub) — 18종 장르 OKLCH 스펙트럼 리본 + 멀티플랫폼 통합 패싯 바.
 */
export function DiscoverFacetTabStrip() {
  const bt = useBilingual("DiscoverFacetTabStrip");

  return (
    <nav
      aria-label={bt("스펙트럼 빠른 이동", "Spectrum quick facets")}
      data-testid="discover-facet-tab-strip"
      className="mb-5 overflow-hidden rounded-2xl border border-line bg-card"
    >
      <div
        aria-hidden="true"
        data-discover-spectrum-ribbon="true"
        className="h-[2px] w-full"
        style={{ background: FULL_SPECTRUM_RIBBON }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/65 px-3.5 py-2">
        <span className="text-xs font-semibold text-fg">
          {bt("18종 장르 스펙트럼", "18-genre spectrum")}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-2">
          <Globe2 size={13} strokeWidth={1.5} className="text-fg-3" aria-hidden="true" />
          <span>{bt("공식 연재처 가격·무료 비교 · 컷츠", "Compare platforms, free episodes & Cuts")}</span>
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
                    "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none",
                    item.current
                      ? "bg-accent font-semibold text-on-accent"
                      : "text-fg-2 hover:bg-panel hover:text-fg",
                  )}
                >
                  <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
                  {bt(item.ko, item.en)}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href="/create"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-panel px-3.5 text-xs font-semibold text-fg transition-colors duration-150 hover:border-accent hover:bg-accent hover:text-on-accent motion-reduce:transition-none"
        >
          <Brush size={14} strokeWidth={1.5} aria-hidden="true" />
          {bt("이 감성으로 3컷 창작", "Create 3-panel story")}
        </Link>
      </div>
    </nav>
  );
}
