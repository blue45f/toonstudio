import { Brush, CalendarDays, Clapperboard, Compass, Flame, Sparkles, SlidersHorizontal } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
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

export function DiscoverFacetTabStrip() {
  const bt = useBilingual("DiscoverFacetTabStrip");

  return (
    <nav
      aria-label={bt("스펙트럼 빠른 이동", "Spectrum quick facets")}
      data-testid="discover-facet-tab-strip"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card/80 p-1.5"
    >
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
                    ? "bg-accent text-on-accent"
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
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft px-3 text-xs font-black text-accent transition-colors hover:border-accent"
      >
        <Brush size={14} aria-hidden="true" />
        {bt("이 감성으로 3컷 창작", "Create 3-panel story")}
      </Link>
    </nav>
  );
}
