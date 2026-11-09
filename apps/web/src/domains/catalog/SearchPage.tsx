import { ChevronDown, Compass, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { SearchOtherTypes } from "./SearchOtherTypes";
import { useInstallLocalSearchBridge } from "./local-catalog-fallback";
import "./search-page-layout.css";

import { sitePageHeaderArtFor, sitePageHeaderArtSource } from "@/domains/legal/public/site-page-header-art";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
// search.* 사전은 셸 번들에서 분리돼 이 모듈 평가 시점에 동기 등록된다.
import "@/shared/components/search-i18n";
import { SearchExplorer } from "@/shared/components/search-explorer";
import { DiscoveryWorkspaceNav } from "@/shared/components/discovery-workspace-nav";
import { Container } from "@/shared/components/section";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { catalogDiscoveryHref, parseCatalogDiscoveryState } from "@/shared/lib/catalog-discovery-state";
import { useT } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const SEARCH_MODES = [
  { id: "search", icon: Search, ko: "바로 찾기", en: "Search" },
  { id: "explore", icon: Compass, ko: "조건으로 둘러보기", en: "Explore" },
  { id: "recommend", icon: Sparkles, ko: "취향 추천", en: "Recommendations" },
] as const;

export function SearchPage() {
  useInstallLocalSearchBridge();
  const [searchParams] = useSearchParams();
  const state = parseCatalogDiscoveryState(searchParams);
  const freeOnly =
    state.filters.pricing.length > 0 &&
    state.filters.pricing.every(
      (pricing) => pricing === "free" || pricing === "wait-free",
    );
  const t = useT();
  const bt = useBilingual("SearchPage");
  const art = sitePageHeaderArtFor("/search");
  const [artFailed, setArtFailed] = useState(false);

  return (
    <PageEntrance variant="pop">
      <Container size="wide" className="search-page-workspace py-4 sm:py-6">
        <div className="search-page-heading-shell">
        <header className="search-page-heading">
          <div className="min-w-0">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent">
              <Search size={14} aria-hidden="true" />
              {t("search.badge")}
            </p>
            <h1 className="text-balance text-2xl font-bold leading-tight text-fg sm:text-3xl">
              {t("search.title")}
            </h1>
          </div>
          <a
            href="#toonstudio-search-explorer-top"
            className={buttonClass({ size: "sm", variant: "quiet", className: "min-h-11 shrink-0 gap-1.5" })}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            {t("search.filterButton")}
          </a>
        </header>
        </div>

        {/* 기존 모드 URL 계약을 재사용한다. 긴 목적별 안내는 결과 뒤에서 펼친다. */}
        <nav aria-label={bt("검색 방식", "Search modes")} className="search-page-modes">
          {SEARCH_MODES.map(({ id, icon: Icon, ko, en }) => (
            <Link
              key={id}
              href={catalogDiscoveryHref(id, searchParams)}
              aria-current={id === "search" ? "page" : undefined}
              className="search-page-mode"
            >
              <Icon size={16} aria-hidden="true" className="hidden shrink-0 sm:block" />
              <span>{bt(ko, en)}</span>
            </Link>
          ))}
        </nav>

        {/* key를 바꾸거나 안내 접힘에 따라 재마운트하지 않아 입력 초안·시트·paging을 보존한다. */}
        <div
          id="toonstudio-search-explorer-top"
          tabIndex={-1}
          className="search-page-results [scroll-margin-top:var(--site-header-sticky-offset)] outline-none"
        >
          <SearchExplorer
            fullWidthQuery
            initialQuery={state.query}
            initialFree={freeOnly}
            initialPlatforms={state.filters.platforms}
          />
        </div>

        <SearchOtherTypes query={state.query} />

        <details className="search-page-tools mt-6" data-testid="search-page-tools">
          <summary className="search-page-tools-summary">
            <span>{bt("탐색 안내와 빠른 검색", "Discovery guide and quick searches")}</span>
            <ChevronDown size={18} aria-hidden="true" className="search-page-tools-chevron" />
          </summary>
          <div className="space-y-5 border-t border-line p-4 sm:p-5">
            <div className="flex items-start gap-4">
              {art ? (
                <>
                  <img
                    ref={(node) => {
                      if (node && node.complete && node.naturalWidth === 0 && !artFailed) {
                        setArtFailed(true);
                      }
                    }}
                    src={sitePageHeaderArtSource(art)}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    width={96}
                    height={72}
                    data-fallback-active={artFailed ? "true" : "false"}
                    onError={() => setArtFailed(true)}
                    className={cn(
                      "hidden h-18 w-24 shrink-0 rounded-xl object-cover",
                      artFailed ? "sm:hidden" : "sm:block",
                    )}
                  />
                  {artFailed ? (
                    <span
                      aria-hidden="true"
                      data-testid="search-tools-art-fallback"
                      className="hidden h-18 w-24 shrink-0 place-items-center rounded-xl border border-line bg-panel px-2 text-center text-[10px] font-bold text-fg-3 sm:grid"
                    >
                      SEARCH
                    </span>
                  ) : null}
                </>
              ) : null}
              <div className="min-w-0">
                <p className="text-sm leading-relaxed text-fg-2">{t("search.subtitle")}</p>
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3">
                  <span>{t("search.currentQuery")}: <strong className="text-fg">{state.query ? `"${state.query}"` : t("search.queryAll")}</strong></span>
                  <span>{t("search.freeOnlyLabel")}: {freeOnly ? "ON" : "OFF"}</span>
                </p>
              </div>
            </div>
            <SiteContextualSubNav pathnameOverride="/search" />
            <DiscoveryWorkspaceNav current="search" />
            <div
              role="group"
              aria-label={bt("인기 검색 키워드", "Popular search keywords")}
              data-testid="search-quick-keywords"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-xs font-bold text-fg-2">{bt("빠른 추천 검색:", "Quick searches:")}</span>
              {[
                { label: "#로맨스판타지", href: "/search?q=로맨스판타지" },
                { label: "#사이다회귀", href: "/search?q=회귀" },
                { label: "#일상힐링", href: "/search?q=일상" },
                { label: "#학원액션", href: "/search?q=액션" },
                { label: "#미스터리스릴러", href: "/search?q=스릴러" },
                { label: bt("무료·기다무 작품만", "Free and wait-free titles"), href: "/search?pricing=free" },
              ].map((chip) => (
                <Link key={chip.href} href={chip.href} className="inline-flex min-h-11 items-center rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:bg-accent/10 hover:text-accent">
                  {chip.label}
                </Link>
              ))}
            </div>
            <Link href="/ranking" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline">
              {t("search.compareFromRanking")}
            </Link>
          </div>
        </details>
      </Container>
    </PageEntrance>
  );
}
