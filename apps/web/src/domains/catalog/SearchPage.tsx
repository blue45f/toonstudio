import { Search, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import "./search-page-layout.css";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { sitePageHeaderArtFor, sitePageHeaderArtPlacementFor } from "@/domains/legal/public/site-page-header-art";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
// search.* 사전은 셸 번들에서 분리돼 이 모듈 평가 시점에 동기 등록된다.
import "@/shared/components/search-i18n";
import { SearchExplorer } from "@/shared/components/search-explorer";
import { UnifiedSearchSections } from "@/shared/components/unified-search-sections";
import { DiscoveryWorkspaceNav } from "@/shared/components/discovery-workspace-nav";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { parseCatalogDiscoveryState } from "@/shared/lib/catalog-discovery-state";
import { useT } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const state = parseCatalogDiscoveryState(searchParams);
  const freeOnly =
    state.filters.pricing.length > 0 &&
    state.filters.pricing.every(
      (pricing) => pricing === "free" || pricing === "wait-free",
    );
  const t = useT();

  return (
    <PageEntrance variant="pop">
    <Container size="wide" className="py-6 sm:py-10">
      <SitePageHeader
        className="mb-6 sm:mb-8"
        icon={Search}
        eyebrow={t("search.badge")}
        title={t("search.title")}
        description={t("search.subtitle")}
        art={sitePageHeaderArtFor("/search")}
        artPlacement={sitePageHeaderArtPlacementFor("/search")}
        actions={
          <>
            <a
              href="#toonstudio-search-explorer-top"
              className={buttonClass({ size: "sm", variant: "solid", className: "min-h-11 gap-1.5" })}
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              {t("search.filterButton")}
            </a>
            {/* 랭킹 동선은 보조 링크로 격하 — 검색이 목적인 페이지의 주 CTA가 아니다. 배너 스크림 위라 밝은 글자로 둔다. */}
            <Link
              href="/ranking"
              className="inline-flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              {t("search.compareFromRanking")}
            </Link>
          </>
        }
      >
        {/* 검색 입력은 바로 아래 탐색기 하나만 둔다 — 390px에서도 첫 화면 안에 보이므로 헤더에 중복 입력을 두지 않는다. */}
        {/* 상태 한 줄은 배너 스크림 위에 직접 얹히므로 테마 회색 대신 밝은 글자로 둔다. */}
        <p className="flex flex-wrap items-center gap-3 text-xs text-white/70">
          <span>
            {t("search.currentQuery")}:{" "}
            <span className="text-white">
              {state.query ? `"${state.query}"` : t("search.queryAll")}
            </span>
          </span>
          <span className="h-1 w-1 rounded-full bg-white/50" aria-hidden="true" />
          <span>
            {t("search.freeOnlyLabel")}: {freeOnly ? "ON" : "OFF"}
          </span>
        </p>
      </SitePageHeader>

      <DiscoveryWorkspaceNav current="search" className="mb-6 sm:mb-8" />

      <div
        role="group"
        aria-label="인기 검색 키워드"
        data-testid="search-quick-keywords"
        className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card/60 px-3.5 py-2.5"
      >
        <span className="text-xs font-bold text-fg-2">빠른 추천 검색:</span>
        {[
          { label: "#로맨스판타지", href: "/search?q=로맨스판타지" },
          { label: "#사이다회귀", href: "/search?q=회귀" },
          { label: "#일상힐링", href: "/search?q=일상" },
          { label: "#학원액션", href: "/search?q=액션" },
          { label: "#미스터리스릴러", href: "/search?q=스릴러" },
          { label: "무료·기다무 작품만", href: "/search?pricing=free" },
        ].map((chip) => (
          <Link
            key={chip.href}
            href={chip.href}
            className="inline-flex min-h-8 items-center rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:bg-accent/10 hover:text-accent"
          >
            {chip.label}
          </Link>
        ))}
      </div>

      <div
        id="toonstudio-search-explorer-top"
        tabIndex={-1}
        className="search-page-results [scroll-margin-top:var(--site-header-sticky-offset)] outline-none"
      >
        <SearchExplorer
          key={state.query}
          initialQuery={state.query}
          initialFree={freeOnly}
          initialPlatforms={state.filters.platforms}
        />
      </div>

      {/* 통합 검색 집계층: 작품 아래에 강좌·도움말(매뉴얼)·페이지 섹션과 소재 링크를
          같은 검색어로 이어 붙인다. 검색어가 없으면 패널 스스로 null을 돌려준다. */}
      <UnifiedSearchSections query={state.query} />
    </Container>
    </PageEntrance>
  );
}
