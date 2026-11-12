import { useFx } from "@toonstudio/core/fx";
import { ChevronDown, Compass, LayoutGrid, RefreshCw, RotateCcw, Rows3, Search, Shuffle, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";

import type { SortKey } from "@/shared/lib/search";
import type { PlatformId, Title, WorkType } from "@/shared/lib/types";

import { AdSlot } from "@/shared/components/ad-slot";
import { DiscoveryWorkspaceNav } from "@/shared/components/discovery-workspace-nav";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
import { CountUp } from "@/shared/components/count-up";
import { Container } from "@/shared/components/section";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { TitleCard } from "@/shared/components/title-card";
import { TitleFilterPanel } from "@/shared/components/title-filter-panel";

import { ExploreReaDirectoryBar } from "./ExploreReaDirectoryBar";
import { snapshotDateLabel } from "./discover-home";
import { filterTitlesByLocalQuery, normalizePlatformId, useLocalCatalogFallback } from "./local-catalog-fallback";
import { genreBorder, genreColor, genreTextColor, genreTint } from "@/shared/lib/genre-color";
import { catalogDiscoveryHref, parseCatalogDiscoveryState, writeCatalogDiscoveryState } from "@/shared/lib/catalog-discovery-state";
import { formatI18nTemplate, useBilingual, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { useSavedTitleIds } from "@/shared/lib/store";
import { GENRES, TYPE_LABEL } from "@/shared/lib/taxonomy";
import { applyClientOnlyFilters, countActiveTitleFilters, type TitleFilterState } from "@/shared/lib/title-filters";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { useApiResource } from "@/platform/use-api-resource";

import "./explore-page-layout.css";

type ExploreParams = Record<string, string | undefined>;

// 표시 라벨은 (ko, en) 튜플이다. 화면에서는 bt(...label)로 펼쳐 쓴다.
const SORTS: { key: SortKey; label: readonly [string, string] }[] = [
  { key: "popular", label: ["인기순", "Most popular"] },
  { key: "rating", label: ["평점순", "Top rated"] },
  { key: "trending", label: ["급상승", "Trending"] },
  { key: "newest", label: ["최신순", "Newest"] },
];

const TYPES: { value: WorkType | "all"; label: readonly [string, string] }[] = [
  { value: "all", label: ["전체", "All"] },
  { value: "webtoon", label: [TYPE_LABEL.webtoon, "Webtoons"] },
  { value: "webnovel", label: [TYPE_LABEL.webnovel, "Web novels"] },
];

const FACETS = ["saved", "type", "genre", "status", "platform", "age", "pricing", "minRating", "year", "tag", "adapted"] as const;

interface PlatformCoverage {
  id: PlatformId;
  label: string;
  color: string;
  count: number;
  share: number;
}

interface ExploreResponse {
  filters: { genre?: string; tag?: string; type?: WorkType; sort: SortKey };
  current: ExploreParams;
  results: Title[];
  shown: Title[];
  hasMore: boolean;
  showCount: number;
  pageSize: number;
  tags: { tag: string; count: number }[];
  genres: string[];
  catalog?: { platformCoverage?: PlatformCoverage[]; filteredPlatformCoverage?: PlatformCoverage[] };
  generatedAt: string;
  source: string;
}

export function ExplorePage() {
  useBilingualI18nRevision();
  const bt = useBilingual("ExplorePage");
  const [searchParams, setSearchParams] = useSearchParams();
  const savedIds = useSavedTitleIds();
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelView, setPanelView] = useState<"filters" | "genres">("filters");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const localQueryRef = useRef<HTMLInputElement>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const urlLocalQuery = searchParams.get("q") ?? "";
  const [localQuery, setLocalQuery] = useState(() => urlLocalQuery);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [emptyArtFailed, setEmptyArtFailed] = useState(false);
  const fx = useFx();

  useEffect(() => {
    setLocalQuery(urlLocalQuery);
  }, [urlLocalQuery]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!panelOpen) { if (dialog.open) dialog.close(); return; }
    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [panelOpen]);
  const openPanel = (view: "filters" | "genres", trigger: HTMLButtonElement) => {
    panelTriggerRef.current = trigger;
    setPanelView(view);
    setPanelOpen(true);
  };
  const closeDisclosure = (event: KeyboardEvent<HTMLElement>) => {
    const details = event.currentTarget.closest("details");
    if (event.key !== "Escape" || event.nativeEvent.isComposing || !details?.open) return;
    event.preventDefault(); event.stopPropagation();
    details.open = false;
    details.querySelector("summary")?.focus({ preventScroll: true });
  };

  const updateLocalQuery = (nextValue: string) => {
    setLocalQuery(nextValue);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextValue.trim()) next.set("q", nextValue);
        else next.delete("q");
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const discoveryState = useMemo(
    () => parseCatalogDiscoveryState(searchParams, { defaultSort: "popular" }),
    [searchParams],
  );
  const { filters, sort } = discoveryState;
  const sortExplicit = searchParams.has("sort");
  const showParam = searchParams.get("show") ?? undefined;
  const activeFilters = countActiveTitleFilters(filters);
  const heroGenre = filters.genres[0];
  const visibleGenres = [...new Set([...filters.genres, ...GENRES.filter((genre) => ["로맨스", "판타지", "액션"].includes(genre))])];

  const writeState = (
    nextFilters: TitleFilterState,
    override?: { sort?: SortKey | null; show?: string | null },
  ) => {
    const nextState = {
      ...discoveryState,
      filters: nextFilters,
      sort:
        override && "sort" in override
          ? (override.sort ?? "popular")
          : discoveryState.sort,
    };
    const nextParams = writeCatalogDiscoveryState(searchParams, nextState, {
      includeQuery: false,
      includeView: false,
      includeRecommendation: false,
    });
    if (localQuery.trim()) nextParams.set("q", localQuery);
    else nextParams.delete("q");
    const nextShow = override && "show" in override ? override.show : null;
    if (nextShow) nextParams.set("show", nextShow);
    else nextParams.delete("show");
    setSearchParams(nextParams, { replace: true, preventScrollReset: true });
  };

  const applyFilters = (next: TitleFilterState) => writeState(next);
  const changeSort = (key: SortKey) =>
    writeState(filters, { sort: key, show: showParam ?? null });
  const showMore = () =>
    writeState(filters, {
      sort: sortExplicit ? sort : null,
      show: String(showCount + pageSize),
    });

  // 빌드된 서버 쿼리(로컬 결과 내 필터 q는 제외하여 키스트로크당 불필요한 API 재호출 방지).
  const serverSearchParams = new URLSearchParams(searchParams);
  serverSearchParams.delete("q");
  const query = serverSearchParams.toString();
  const apiUrl = query ? `/api/explore?${query}` : "/api/explore";
  const rawResource = useApiResource<ExploreResponse>(
    apiUrl,
    bt("탐색 데이터를 불러오지 못했습니다.", "Couldn't load the explore data."),
  );
  const { data, loading, error, reload } = useLocalCatalogFallback(
    apiUrl,
    rawResource,
  );
  const rawResults = data?.results ?? [];
  const activePlatforms = filters.platforms
    .map((p) => normalizePlatformId(p))
    .filter((p): p is PlatformId => p !== null);
  // 서버가 적용하지 못한 클라 전용 facet(가격 정밀·내 찜만·플랫폼 정합) 및 로컬 키워드 필터를 결과에 추가 적용.
  const baseClientResults = applyClientOnlyFilters(rawResults, filters, savedIds);
  const clientFilteredResults =
    activePlatforms.length === 0
      ? baseClientResults
      : baseClientResults.filter((title) =>
          (title.availability ?? []).some((a) => {
            const pid = normalizePlatformId(a?.platformId);
            return pid !== null && activePlatforms.includes(pid);
          }),
        );
  const trimmedLocalQuery = localQuery.trim();
  const results = trimmedLocalQuery
    ? filterTitlesByLocalQuery(clientFilteredResults, trimmedLocalQuery)
    : clientFilteredResults;
  const showCount = data?.showCount ?? 40;
  const pageSize = data?.pageSize ?? 40;
  const shown = results.slice(0, showCount);
  const tags = data?.tags ?? [];
  const tagCount = new Map(tags.map((entry) => [entry.tag, entry.count]));
  const visibleTags = showAllTags
    ? tags
    : [
        ...new Map([
          ...filters.tags.map(
            (tag) => [tag, { tag, count: tagCount.get(tag) ?? 0 }] as const,
          ),
          ...tags.slice(0, 12).map((entry) => [entry.tag, entry] as const),
        ]).values(),
      ];
  const hiddenTagCount = Math.max(0, tags.length - visibleTags.length);
  // 데이터에 존재하는 유효 플랫폼만 정규화·중복 제거하여 노출(빈 배열이면 기본 플랫폼 목록 유지).
  const rawCoverageIds = (data?.catalog?.platformCoverage ?? [])
    .filter((entry) => Boolean(entry) && (entry.count ?? 1) > 0)
    .map((entry) => normalizePlatformId(entry.id))
    .filter((id): id is PlatformId => id !== null);
  const mergedPlatformOptions = [...new Set([...rawCoverageIds, ...activePlatforms])];
  const platformOptions = mergedPlatformOptions.length > 0 ? mergedPlatformOptions : undefined;
  const hasFilter = sortExplicit || activeFilters > 0 || trimmedLocalQuery.length > 0;

  // 무한 스크롤 — 하단 센티넬이 보이면 자동으로 다음 페이지 로드(더보기 버튼 누를 필요 없음).
  // useInView는 1회용이라 부적합 → 반복 트리거 IntersectionObserver를 직접 둔다. 버튼은 a11y/수동 폴백으로 유지.
  const hasMore = results.length > shown.length;
  const loaderRef = useRef<HTMLDivElement>(null);
  const showMoreRef = useRef(showMore);
  showMoreRef.current = showMore;
  useEffect(() => {
    const node = loaderRef.current;
    if (!node || !hasMore || typeof IntersectionObserver === "undefined")
      return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) showMoreRef.current();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loading]);

  return (
    <PageEntrance variant="pop">
      <Container size="wide" className="explore-page-layout">
        {/* 전역 Container 직계 header 장식을 피하고 탐색 도구를 첫 화면에 둔다. */}
        <div className="explore-page-heading-wrap">
          <header className="explore-page-heading"><h1>{bt("조건으로 작품 찾기", "Find titles by condition")}</h1></header>
          <details className="explore-page-mode-menu" data-testid="explore-page-mode-menu">
            <summary onKeyDown={closeDisclosure}>{bt("다른 찾는 방법", "Other ways to find titles")}<ChevronDown size={14} aria-hidden="true" /></summary>
            <nav className="explore-page-modes" aria-label={bt("탐색 방식", "Explore modes")}>
              {([
                { mode: "search", label: ["바로 찾기", "Search"] },
                { mode: "explore", label: ["조건으로 둘러보기", "Explore"] },
                { mode: "recommend", label: ["취향 추천", "Recommendations"] },
              ] as const).map(({ mode, label }) => (
                <Link key={mode} onKeyDown={closeDisclosure} href={catalogDiscoveryHref(mode, searchParams)} aria-current={mode === "explore" ? "page" : undefined}>
                  {bt(label[0], label[1])}
                </Link>
              ))}
            </nav>
          </details>
        </div>
        <div className="explore-page-tools">
          <div role="search" aria-label={bt("현재 목록에서 찾기", "Filter this list")} className="explore-page-local-search">
            <Search size={16} aria-hidden="true" />
            <input ref={localQueryRef} type="search" value={localQuery} onChange={(event) => updateLocalQuery(event.target.value)} placeholder={bt("현재 목록에서 찾기", "Filter this list")} aria-label={bt("현재 목록에서 제목·작가·태그 찾기", "Filter this list by title, author or tag")} aria-describedby="explore-local-query-help" />
            <span id="explore-local-query-help" className="sr-only">{bt("불러온 작품 목록만 좁힙니다. 전체 검색은 다른 찾는 방법의 바로 찾기를 이용하세요.", "Filters the loaded list only. For a full search, choose Search under Other ways to find titles.")}</span>
            {localQuery.length > 0 && <button type="button" onClick={() => { updateLocalQuery(""); localQueryRef.current?.focus({ preventScroll: true }); }} aria-label={bt("검색어 지우기", "Clear search query")}><X size={16} aria-hidden="true" /></button>}
          </div>
          <div className="explore-page-compact-controls">
            <select aria-label={bt("작품 유형", "Work type")} value={filters.types.length > 1 ? "multiple" : (filters.types[0] ?? "all")} onChange={(event) => { const value = event.target.value; if (value === "all" || value === "webtoon" || value === "webnovel") applyFilters({ ...filters, types: value === "all" ? [] : [value] }); }}>
              {filters.types.length > 1 && <option value="multiple" disabled>{bt("여러 유형 선택", "Multiple types selected")}</option>}
              {TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.value === "all" ? bt("전체 유형", "All types") : bt(...entry.label)}</option>)}
            </select>
            <select aria-label={bt("정렬", "Sort")} value={sort} onChange={(event) => { const selected = SORTS.find((entry) => entry.key === event.target.value); if (selected) changeSort(selected.key); }}>
              {SORTS.map((entry) => <option key={entry.key} value={entry.key}>{bt(...entry.label)}</option>)}
            </select>
            <button type="button" aria-label={activeFilters > 0 ? formatI18nTemplate(bt("상세 필터·태그 · {v0}개 선택", "Filters and tags · {v0} selected"), { v0: activeFilters }) : bt("상세 필터·태그", "Filters and tags")} aria-haspopup="dialog" aria-expanded={panelOpen && panelView === "filters"} aria-controls="explore-page-filter-panel" onClick={(event) => openPanel("filters", event.currentTarget)} className={cn("explore-page-filter-trigger", activeFilters > 0 && "is-active")}>
              <SlidersHorizontal size={15} aria-hidden="true" />{bt("필터", "Filters")}{activeFilters > 0 && <span>{activeFilters}</span>}
            </button>
          </div>
        </div>
        <section aria-label={bt("장르 선택", "Choose genres")}>
            <div className="explore-page-genres">
              {visibleGenres.map((entry) => {
                const active = filters.genres.includes(entry);
                return (
                  <button
                    key={entry}
                    type="button"
                    data-no-sfx
                    onClick={(event) => {
                      // 선택(off→on)되는 순간만 그 장르색으로 파티클 "팡" — 색을 고르는 보상감.
                      if (!active) {
                        fx.sfx("pop");
                        fx.burstAt(event.currentTarget, {
                          count: 12,
                          spread: 0.8,
                          colors: [
                            genreColor(entry, 0.82),
                            genreColor(entry, 0.66),
                            "oklch(0.95 0.02 85)",
                          ],
                        });
                      }
                      applyFilters({
                        ...filters,
                        genres: toggleValue(filters.genres, entry),
                      });
                    }}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium",
                      "transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out-expo",
                      "hover:-translate-y-px active:scale-[0.96]",
                      active && "ring-1",
                    )}
                    style={{
                      color: genreTextColor(entry, active ? 0.92 : 0.82),
                      backgroundColor: genreTint(entry, active ? 0.3 : 0.12),
                      borderColor: genreBorder(entry, active ? 0.7 : 0.26),
                      // 선택된 칩엔 그 장르색 글로우로 "켜진" 느낌을 강화.
                      boxShadow: active
                        ? `0 6px 20px -10px ${genreColor(entry, 0.62)}`
                        : undefined,
                    }}
                  >
                    {entry}
                  </button>
                );
              })}
              <button type="button" aria-haspopup="dialog" aria-expanded={panelOpen && panelView === "genres"} aria-controls="explore-page-filter-panel" onClick={(event) => openPanel("genres", event.currentTarget)} className="explore-page-all-genres">
                {bt("모든 장르", "All genres")}
              </button>
            </div>

        </section>

        <dialog ref={dialogRef} id="explore-page-filter-panel" className="explore-page-filter-dialog" aria-labelledby="explore-filter-title" onCancel={(event) => { event.preventDefault(); setPanelOpen(false); }} onClose={() => { setPanelOpen(false); panelTriggerRef.current?.focus({ preventScroll: true }); }}>
          <div className="explore-page-filter-heading"><h2 id="explore-filter-title">{panelView === "genres" ? bt("모든 장르", "All genres") : bt("필터·태그", "Filters and tags")}</h2><button type="button" onClick={() => setPanelOpen(false)} aria-label={bt("필터 닫기", "Close filters")}><X size={18} aria-hidden="true" /></button></div>
          {panelOpen && <>
            <TitleFilterPanel value={filters} onChange={applyFilters} facets={panelView === "genres" ? ["genre"] : [...FACETS]} platformOptions={platformOptions} savedCount={savedIds.size} />
            {panelView === "filters" && <>
              <details className="explore-page-disclosure" data-testid="explore-page-tags">
                <summary>{bt("태그로 좁히기", "Narrow down by tags")}{filters.tags.length > 0 && <span className="explore-page-selection-count">{formatI18nTemplate(bt("{v0}개 선택", "{v0} selected"), { v0: filters.tags.length })}</span>}</summary>
                <div className="explore-page-disclosure-body">
                <div className="flex flex-wrap gap-2">
                  {visibleTags.map(({ tag: entry, count }) => {
                    const active = filters.tags.includes(entry);
                    return (
                      <button
                        key={entry}
                        type="button"
                        data-no-sfx
                        onClick={(event) => {
                          if (!active) {
                            fx.sfx("pop");
                            fx.burstAt(event.currentTarget, {
                              count: 10,
                              spread: 0.7,
                            });
                          }
                          applyFilters({
                            ...filters,
                            tags: toggleValue(filters.tags, entry),
                          });
                        }}
                        aria-pressed={active}
                        className={cn(
                          "group inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.96]",
                          active
                            ? "border-accent/60 bg-accent-soft text-accent shadow-[0_4px_16px_-8px_oklch(0.72_0.185_42/0.5)]"
                            : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                        )}
                      >
                        <span
                          className={cn(
                            active
                              ? "text-accent"
                              : "text-fg-3 group-hover:text-accent",
                          )}
                        >
                          #
                        </span>
                        {entry}
                        <span className="tnum text-xs text-fg-3">{count}</span>
                      </button>
                    );
                  })}
                  {hiddenTagCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllTags(true)}
                      className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-line bg-card px-3 text-sm font-semibold text-fg transition-colors hover:border-accent/45 hover:text-accent"
                    >
                      {formatI18nTemplate(bt("태그 더 보기 · {v0}개", "Show more tags · {v0}"), { v0: hiddenTagCount })}
                    </button>
                  ) : showAllTags && tags.length > 12 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllTags(false)}
                      className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-sm font-semibold text-fg-3 hover:text-fg"
                    >
                      {bt("주요 태그만 보기", "Show main tags only")}
                    </button>
                  ) : null}
                </div>

                </div>
              </details>

            </>}
          </>}
        </dialog>

        {/* 수익화 OFF면 렌더되지 않음(기본 invisible). 결과 그리드 위 광고 지면(탐색 전용 슬롯). */}
        <AdSlot
          slots={[
            "discover-spotlight-1",
            "discover-spotlight-2",
            "discover-spotlight-3",
          ]}
        />

        <section
          className="explore-page-results"
          data-density={density}
          aria-label={bt("탐색 결과", "Explore results")}
          aria-busy={loading}
        >
        <div className="explore-page-results-heading">
          <div className="explore-page-result-label"><h2 className="explore-page-results-title">{bt("탐색 결과", "Explore results")}</h2>
            <p className="explore-page-count" role="status" aria-label={bt("탐색 결과 상태", "Explore result status")} aria-live="polite">
              {loading ? bt("불러오는 중…", "Loading…") : error ? bt("작품 수 확인 불가", "Title count unavailable") : <>
              {bt("작품", "Titles")}{" "}
              <CountUp
                key={results.length}
                value={results.length}
                duration={0.7}
                separator={results.length >= 1000}
                className="numeral text-base text-fg"
              />
              {bt("편", "")}
              </>}
            </p>
          </div>
          <details className="explore-page-view" data-testid="explore-page-view">
            <summary onKeyDown={closeDisclosure}>{bt("보기 설정", "View settings")}{density === "compact" && <span>{bt("조밀", "Compact")}</span>}<ChevronDown size={14} aria-hidden="true" /></summary>
            <div className="explore-page-view-body">
              <div role="group" aria-label={bt("카드 밀도", "Card density")} className="explore-page-density">
                {([{ key: "comfortable", label: ["표준", "Standard"], Icon: LayoutGrid }, { key: "compact", label: ["조밀", "Compact"], Icon: Rows3 }] as const).map(({ key, label, Icon }) => <button type="button" key={key} onKeyDown={closeDisclosure} onClick={() => setDensity(key)} aria-pressed={density === key}><Icon size={14} aria-hidden="true" />{bt(label[0], label[1])}</button>)}
              </div>
            {!loading && !error && data && (
              <span data-testid="catalog-provenance-meta" className="text-xs text-fg-3">
                {snapshotDateLabel(data.generatedAt) ? <>{snapshotDateLabel(data.generatedAt)} {bt("기준 공개 스냅샷", "public snapshot")}</> : bt("공개 카탈로그 스냅샷", "Public catalog snapshot")}
              </span>
            )}
            <button
              type="button"
              onKeyDown={closeDisclosure}
              onClick={reload}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-fg-3 transition-colors duration-150 hover:text-accent"
            >
              <RefreshCw size={13} className={cn(loading && "animate-spin")} />
              {bt("갱신", "Refresh")}
            </button>
            {hasFilter && (
              <Link
                href="/explore"
                onKeyDown={closeDisclosure}
                onClick={() => setLocalQuery("")}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-fg-3 transition-colors duration-150 hover:text-accent"
              >
                <RotateCcw size={13} />
                {bt("필터 초기화", "Reset filters")}
              </Link>
            )}
            </div>
          </details>
        </div>
        {loading ? (
          <div aria-label={bt("작품을 불러오는 중", "Loading titles")} className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="space-y-3">
                <span className="skeleton block aspect-[3/4] rounded-xl" />
                <span className="skeleton block h-4 w-3/4" />
                <span className="skeleton block h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState
            title={bt("탐색 데이터를 불러오지 못했습니다.", "Couldn't load the explore data.")}
            message={error}
            onRetry={reload}
          />
        ) : results.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
              {shown.map((title) => (
                <TitleCard
                  key={title.id}
                  title={title}
                  size={density === "compact" ? "sm" : "md"}
                  className={density === "compact" ? "explore-card-compact" : undefined}
                />
              ))}
            </div>
            {hasMore && (
              <div ref={loaderRef} className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={showMore}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-5 py-2.5 text-sm font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
                >
                  {loading ? bt("불러오는 중…", "Loading…") : bt("더 보기", "Show more")}
                  <span className="numeral text-fg-3">
                    {shown.length} / {results.length}
                  </span>
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="relative flex flex-col items-center overflow-hidden rounded-3xl border border-dashed border-line bg-gradient-to-b from-card/55 to-panel/30 p-8 text-center sm:p-12">
            {/* 은은한 액센트 글로우 — 배경에만 깔려 가독성 영향 없음(창작 게시판 빈-상태와 톤 정합). */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-2 h-32 w-32 -translate-x-1/2 rounded-full opacity-50 blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, color-mix(in oklch, var(--color-accent) 32%, transparent), transparent 70%)",
              }}
            />
            <img
              ref={(node) => {
                if (node && node.complete && node.naturalWidth === 0) {
                  setEmptyArtFailed(true);
                }
              }}
              src="/images/empty-generic.webp"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              onError={() => setEmptyArtFailed(true)}
              data-fallback-active={emptyArtFailed ? "true" : undefined}
              className={cn(
                "relative mb-2 h-36 w-full max-w-sm rounded-2xl border border-line/60 object-cover",
                emptyArtFailed && "hidden",
              )}
            />
            {emptyArtFailed && (
              <div
                aria-hidden="true"
                data-testid="explore-empty-art-fallback"
                className="relative mb-2 flex h-24 w-full max-w-sm items-center justify-center rounded-2xl border border-line/60 bg-panel/70 px-4 text-xs font-semibold tracking-wider text-fg-3"
              >
                {bt("조건에 맞는 작품 없음", "No titles match these filters")}
              </div>
            )}
            <span
              aria-hidden
              className="pf-glow relative mb-4 grid size-14 place-items-center rounded-2xl border border-accent/30 bg-accent-soft/60 text-accent"
            >
              <Compass size={26} />
              <Sparkles
                size={12}
                className="pf-sparkle absolute -right-1 -top-1 text-warn"
              />
            </span>
            <p className="relative text-sm font-medium text-fg">
              {bt("조건에 맞는 작품이 없어요.", "No titles match these conditions.")}
            </p>
            <p className="relative mt-1 text-xs text-fg-3">
              {hasFilter
                ? bt("필터를 조금 넓히거나 초기화해 보세요.", "Try widening or resetting the filters.")
                : bt("다른 장르나 태그로 탐색해 보세요.", "Try exploring other genres or tags.")}
            </p>
            {hasFilter ? (
              <Link
                href="/explore"
                onClick={() => setLocalQuery("")}
                className="relative mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium text-fg-2 transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-accent"
              >
                <RotateCcw size={14} />
                {bt("필터 초기화", "Reset filters")}
              </Link>
            ) : (
              <div className="relative mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={reload}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium text-fg-2 transition-colors hover:border-accent/50 hover:text-accent"
                >
                  <RefreshCw size={14} />
                  {bt("다시 시도", "Try again")}
                </button>
                <Link
                  href="/discover"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft/60 px-4 py-2 text-sm font-medium text-accent transition-colors hover:border-accent"
                >
                  {bt("작품 탐색 허브로 이동", "Go to Discover hub")}
                </Link>
              </div>
            )}
          </div>
        )}
        </section>

        <details className="explore-page-disclosure explore-page-guide" data-testid="explore-page-guide">
          <summary>{bt("탐색 가이드 · 빠른 조건", "Explore guide · quick presets")}</summary>
          <div className="explore-page-disclosure-body">
            <p className="text-sm leading-relaxed text-fg-2">
              {bt(
                "조건으로 좁혀 보는 화면입니다. 장르·태그·유형별로 웹툰과 웹소설을 좁혀봅니다. 작품 카드에는 줄거리와 연재 상태가 함께 표시되어 무슨 작품인지 바로 판단할 수 있습니다. 어디서부터 볼지 모르겠다면",
                "Narrow things down by condition here. Filter webtoons and web novels by genre, tag, and type. Each card shows the synopsis and release status, so you can tell what a title is at a glance. Not sure where to start? Try",
              )}{" "}
              <Link href="/discover" className="font-semibold text-accent hover:underline">{bt("작품 탐색", "Discover titles")}</Link>
              {bt("에서 추천·랭킹부터 보세요.", " for recommendations and rankings first.")}

            </p>
            <Link
              href={
                heroGenre
                  ? `/random?genre=${encodeURIComponent(heroGenre)}`
                  : "/random"
              }
              className="group mt-4 inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-fg-3 transition-colors hover:text-accent sm:mt-5"
            >
              <Shuffle
                size={13}
                aria-hidden="true"
                className="transition-transform duration-300 ease-out-expo group-hover:rotate-180"
              />
              {heroGenre
                ? formatI18nTemplate(bt("{v0}에서 즉흥으로 한 편", "One spontaneous pick from {v0}"), { v0: heroGenre })
                : bt("조건은 됐고, 그냥 놀래켜줘", "Skip the filters — surprise me")}
            </Link>
            <SiteContextualSubNav pathnameOverride="/explore" />
            <DiscoveryWorkspaceNav current="explore" />
            <ExploreReaDirectoryBar filters={filters} sort={sort} onApplyFilters={applyFilters} onChangeSort={changeSort} />
            <SiteArtSurfaceSpotlight cardId="nb-explore-spectrum" compact />
          </div>
        </details>
      </Container>
    </PageEntrance>
  );
}

function toggleValue<T>(arr: T[], value: T): T[] {
  return arr.includes(value)
    ? arr.filter((entry) => entry !== value)
    : [...arr, value];
}
