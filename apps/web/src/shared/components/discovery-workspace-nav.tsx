import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { Compass, Search, Sparkles, type LucideIcon } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { catalogDiscoveryHref, type CatalogDiscoveryMode } from "@/shared/lib/catalog-discovery-state";

import { cn } from "@/shared/lib/utils";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("discovery-workspace-nav", ko, en);

interface DiscoveryDestination {
  readonly id: CatalogDiscoveryMode;
  readonly icon: LucideIcon;
  readonly ko: string;
  readonly en: string;
  readonly koDescription: string;
  readonly enDescription: string;
}

const DESTINATIONS: readonly DiscoveryDestination[] = [
  {
    id: "search",
    icon: Search,
    ko: "바로 찾기",
    en: "Search",
    koDescription: "제목·작가·태그를 검색",
    enDescription: "Search titles, creators and tags",
  },
  {
    id: "explore",
    icon: Compass,
    ko: "조건으로 둘러보기",
    en: "Explore",
    koDescription: "장르·분위기·상태로 좁히기",
    enDescription: "Browse by genre, mood and status",
  },
  {
    id: "recommend",
    icon: Sparkles,
    ko: "취향 추천",
    en: "Recommendations",
    koDescription: "선택과 평가로 추천 다듬기",
    enDescription: "Shape recommendations with feedback",
  },
] as const;

const QUICK_SURFACES = [
  { href: "/discover", ko: "발견 허브", en: "Discover Hub" },
  { href: "/cuts", ko: "컷 쇼츠", en: "Cuts Shorts" },
  { href: "/character-chat", ko: "캐릭터 대화", en: "Character Chat" },
  { href: "/studio", ko: "웹툰 만들기", en: "Create in Studio" },
  { href: "/market", ko: "소재 마켓", en: "Asset Market" },
] as const;

export function DiscoveryWorkspaceNav({
  current,
  className,
}: {
  readonly current: CatalogDiscoveryMode;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const [params] = useSearchParams();

  return (
    <nav
      aria-label={bi("작품 발견 방식", "Discovery modes")}
      className={cn(
        "overflow-visible sm:overflow-x-auto sm:overscroll-x-contain sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <div className="grid grid-cols-3 gap-1.5 sm:min-w-0 sm:gap-2">
        {DESTINATIONS.map((destination) => {
          const active = destination.id === current;
          const Icon = destination.icon;
          return (
            <Link
              key={destination.id}
              href={catalogDiscoveryHref(destination.id, params)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex min-h-[5.25rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border px-1.5 py-2 text-center transition-[border-color,background-color,transform] sm:min-h-16 sm:flex-row sm:justify-start sm:gap-3 sm:px-3 sm:py-2.5 sm:text-left",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                active
                  ? "border-accent/55 bg-accent-soft text-fg"
                  : "border-line bg-card/75 text-fg-2 hover:-translate-y-0.5 hover:border-line-strong hover:bg-card",
              )}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-xl border",
                  active
                    ? "border-accent/35 bg-accent/15 text-accent"
                    : "border-line bg-panel text-fg-3 group-hover:text-accent",
                )}
              >
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0 max-w-full">
                <strong className="block truncate text-[0.68rem] font-bold sm:text-sm">
                  {bi(destination.ko, destination.en)}
                </strong>
                <span className="mt-0.5 hidden truncate text-[0.7rem] text-fg-3 sm:block">
                  {bi(destination.koDescription, destination.enDescription)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
      <div
        data-testid="discovery-quick-surfaces"
        className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs"
      >
        <span className="px-1 text-[0.7rem] font-bold text-fg-3">
          {bi("목적별 바로가기:", "Quick jump:")}
        </span>
        {QUICK_SURFACES.map((surface) => (
          <Link
            key={surface.href}
            href={surface.href}
            className="inline-flex min-h-8 items-center rounded-full border border-line bg-card/65 px-2.5 py-1 text-[0.7rem] font-semibold text-fg-2 transition-colors hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {bi(surface.ko, surface.en)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
