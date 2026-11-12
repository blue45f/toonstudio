import {
  AlertTriangle,
  ChevronDown,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Search,
  SearchX,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigationType, useSearchParams } from "react-router-dom";

import { MarketBrowseFacetBar } from "../components/MarketBrowseFacetBar";
import { MarketCompareShelf } from "../components/MarketCompareShelf";
import { MarketFamilyPicker } from "../components/MarketFamilyPicker";
import { MarketQuickPreviewDialog } from "../components/MarketQuickPreviewDialog";
import { MarketRecentlyViewedStrip } from "../components/MarketRecentlyViewedStrip";
import { MarketViewToggle } from "../components/MarketViewToggle";
import { MarketNavHeader } from "../components/MarketNavHeader";
import { MarketSentenceSearch } from "../components/MarketSentenceSearch";
import { MARKET_COMPARE_MAX_ITEMS, useMarketCompare } from "../hooks/use-market-compare";
import { useMarketSearchHistory } from "../hooks/use-market-search-history";

import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { MarketResourceCard } from "../components/MarketResourceCard";
import { StaleNoticeBar } from "../components/StaleNoticeBar";
import { useMarketResources } from "../hooks/use-market-resources";
import { marketBrowseJsonLd } from "../models/market-jsonld";
import { MARKET_LICENSES, marketKindMeta } from "../models/market-kind";
import {
  MARKET_RESOURCE_FAMILIES,
  marketResourceFamilyForKind,
  type MarketResourceFamily,
} from "../models/market-resource-taxonomy";
import {
  parseMarketBrowseQuery,
  resolveMarketBrowseSort,
} from "../models/market-query";
import {
  sortMarketResourcesForDisplay,
  type MarketDisplaySortMode,
} from "../models/market-similar-resources";

import { Container } from "@/shared/components/section";
import { ListTemplate } from "@/shared/components/layout/ListTemplate";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS,
  CreatorMarketplaceResourceSearchQuerySchema,
  type CreatorMarketplaceResourceRecord,
} from "@/shared/lib/creator-marketplace-resource-contract";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";

import "../components/market-atelier.css";
import "./market-browse-search.css";

const PAGE_SIZE = 12;

interface ProcessPresetFilter {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly kind: string | null;
  readonly tag: string | null;
  readonly license: string | null;
}

const PROCESS_PRESET_FILTERS: readonly ProcessPresetFilter[] = [
  { id: "all", labelKo: "전체 공정", labelEn: "All stages", kind: null, tag: null, license: null },
  { id: "3d-bg", labelKo: "3D 배경·소품", labelEn: "3D backgrounds & props", kind: "3d-asset", tag: null, license: null },
  { id: "line-brush", labelKo: "선화·펜 브러시", labelEn: "Line-art & pen brushes", kind: "brush", tag: null, license: null },
  { id: "pose-char", labelKo: "포즈·캐릭터", labelEn: "Poses & characters", kind: "3d-preset", tag: null, license: null },
  { id: "color-tone", labelKo: "채색·톤·텍스처", labelEn: "Color, tone & textures", kind: "palette", tag: null, license: null },
  { id: "lettering", labelKo: "식자·말풍선", labelEn: "Lettering & balloons", kind: "template", tag: null, license: null },
  { id: "free-cc0", labelKo: "무료/즉시 사용", labelEn: "Free / CC0 ready", kind: null, tag: null, license: "cc0-1.0" },
] as const;

export function MarketBrowsePage({ embedded = false }: { readonly embedded?: boolean } = {}) {
  const t = useBilingual("MarketBrowsePage");
  const searchInputId = useId();
  const supplementaryMenus = useRef<HTMLDivElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const filterPanel = useRef<HTMLElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterPanelId = `${searchInputId}-filters`;
  useEffect(() => {
    const owner = supplementaryMenus.current;
    if (!owner) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target;
      const details = target instanceof HTMLElement ? target.closest("details") : null;
      if (details?.open && owner.contains(details)) {
        event.preventDefault();
        event.stopPropagation();
        details.open = false;
        details.querySelector("summary")?.focus({ preventScroll: true });
      } else if (target instanceof Node && filterPanel.current?.contains(target)) {
        event.preventDefault();
        event.stopPropagation();
        setFiltersOpen(false);
        filterTrigger.current?.focus();
      }
    };
    owner.addEventListener("keydown", closeOnEscape);
    return () => owner.removeEventListener("keydown", closeOnEscape);
  }, []);
  const { compareCount, clearCompare } = useMarketCompare();
  const { recordRecentSearch } = useMarketSearchHistory();
  const [displaySort, setDisplaySort] = useState<MarketDisplaySortMode>("server");
  const [quickPreviewRecord, setQuickPreviewRecord] =
    useState<CreatorMarketplaceResourceRecord | null>(null);
  const marketBrowseDescription = t(
    "웹툰 템플릿, 2D·3D 에셋, 브러시, 팔레트와 필터를 제작 목적과 사용권으로 찾아보세요.",
    "Find webtoon templates, 2D/3D assets, brushes, palettes, and filters by production purpose and license.",
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const navigationType = useNavigationType();
  const layout = searchParams.get("layout") === "list" ? "list" : "grid";
  const composingRef = useRef(false);
  const serializedSearchParams = searchParams.toString();
  const searchParamsRef = useRef(new URLSearchParams(searchParams));
  // React Router search-param updates are navigation calls, not queued React state updates.
  // Keep an eager snapshot so submit + sort/filter actions in the same turn merge instead of
  // replacing one another with a stale render's URL.
  if (searchParamsRef.current.toString() !== serializedSearchParams) {
    searchParamsRef.current = new URLSearchParams(searchParams);
  }
  const parsedUrlQuery = parseMarketBrowseQuery(searchParams);
  const [draftSearch, setDraftSearch] = useState(() => parsedUrlQuery.searchDraft);
  const pendingSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = {
    limit: PAGE_SIZE,
    ...parsedUrlQuery.values,
    sort: resolveMarketBrowseSort(parsedUrlQuery.values),
  };
  const hasInvalidQuery = parsedUrlQuery.issues.length > 0;
  const page = useMarketResources(hasInvalidQuery ? null : query);
  const activeFamily = marketResourceFamilyForKind(query.kind);
  const pageTitle = activeFamily
    ? t(`${activeFamily.label} 찾기`, `Find ${activeFamily.labelEn}`)
    : query.kind
      ? t(`${marketKindMeta(query.kind).label} 찾기`, `Find ${marketKindMeta(query.kind).label}`)
      : t("소재 찾기", "Find materials");

  useDocumentTitle(pageTitle);
  useMetaDescription(marketBrowseDescription);
  usePageSocialMeta({
    canonicalPath: "/market/browse",
    title: `${pageTitle} · ${t("툰스튜디오", "ToonStudio")}`,
    description: marketBrowseDescription,
  });
  useJsonLd(marketBrowseJsonLd(page.items, query.kind));

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParamsRef.current);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value.length === 0) next.delete(key);
        else next.set(key, value);
      }
      searchParamsRef.current = next;
      setSearchParams(next, { replace: true });
    },
    [setSearchParams],
  );

  const activeSearch = query.search;
  const activeKind = query.kind;
  const activeLicense = query.license;
  const activePublisherLabel = query.publisher
    ? page.items.find((record) => record.publisher.id === query.publisher)?.publisher.name ?? t("선택한 배급자", "Selected publisher")
    : null;

  const committedSearch = parsedUrlQuery.searchDraft;
  const cancelPendingSearchCommit = useCallback(() => {
    if (pendingSearchTimerRef.current === null) return;
    clearTimeout(pendingSearchTimerRef.current);
    pendingSearchTimerRef.current = null;
  }, []);

  useEffect(() => {
    cancelPendingSearchCommit();
    setDraftSearch(committedSearch);
    return cancelPendingSearchCommit;
  }, [cancelPendingSearchCommit, committedSearch]);

  useEffect(() => {
    if (navigationType !== "POP") return;
    cancelPendingSearchCommit();
    setDraftSearch(committedSearch);
  }, [cancelPendingSearchCommit, committedSearch, navigationType, serializedSearchParams]);

  const updateDraftSearch = useCallback((value: string) => {
    setDraftSearch(value);
    cancelPendingSearchCommit();
    if (composingRef.current) return;
    const parsed = CreatorMarketplaceResourceSearchQuerySchema.safeParse(value);
    if (!parsed.success) return;
    pendingSearchTimerRef.current = setTimeout(() => {
      pendingSearchTimerRef.current = null;
      patchParams({ q: parsed.data || null, ...(parsed.data ? {} : { sort: null }) });
    }, 300);
  }, [cancelPendingSearchCommit, patchParams]);

  const clearSearch = useCallback(() => {
    cancelPendingSearchCommit();
    setDraftSearch("");
    patchParams({ q: null, ...(query.sort === "relevance" ? { sort: null } : {}) });
  }, [cancelPendingSearchCommit, patchParams, query.sort]);

  const resetFilters = useCallback(() => {
    cancelPendingSearchCommit();
    setDraftSearch("");
    setDisplaySort("server");
    patchParams({
      q: null,
      tag: null,
      publisher: null,
      kind: null,
      license: null,
      sort: null,
      containsAi: null,
      engine: null,
      commercial: null,
      origin: null,
    });
  }, [cancelPendingSearchCommit, patchParams]);

  // 문장으로 읽은 조건은 기존 URL 필터를 그대로 바꾼다(새 API 없음). 대기 중이던 키워드 반영이 뒤늦게 덮어쓰지 않게 먼저 멈춘다.
  const applySentenceFilters = useCallback((patch: Readonly<Record<string, string | null>>) => {
    cancelPendingSearchCommit();
    patchParams({ ...patch });
  }, [cancelPendingSearchCommit, patchParams]);

  const applyPresetSearch = useCallback((rawSearch: string) => {
    cancelPendingSearchCommit();
    const next = new URLSearchParams(rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch);
    const currentLayout = searchParamsRef.current.get("layout");
    if (currentLayout === "list") next.set("layout", "list");
    searchParamsRef.current = next;
    setDraftSearch(next.get("q") ?? "");
    setSearchParams(next, { replace: true });
  }, [cancelPendingSearchCommit, setSearchParams]);

  const hasActiveFilters = Boolean(
    query.search ||
      query.tag ||
      query.publisher ||
      activeKind ||
      activeLicense ||
      query.containsAi !== undefined ||
      query.engine ||
      query.commercial !== undefined ||
      query.origin,
  );

  const activeFilterCount = [activeKind, activeLicense, query.tag, query.publisher,
    query.containsAi !== undefined, query.engine, query.commercial !== undefined, query.origin,
  ].filter(Boolean).length;

  const visibleItems = useMemo(
    () => sortMarketResourcesForDisplay(page.items, displaySort),
    [displaySort, page.items],
  );

  const selectFamily = (family: MarketResourceFamily | null) => {
    patchParams({ kind: family ? family.subcategories[0].kind : null, tag: null });
  };

  return (
    <div ref={supplementaryMenus} className="market-browse-page market-browse-search">
      <CampusObjectSource objects={hasInvalidQuery ? [] : page.items.map((record) => ({
        id: record.id, title: record.name, href: `/market/resource/${encodeURIComponent(record.id)}`,
      }))} />
      <section className="border-b border-line bg-ledger">
        <Container size="wide" className="py-4 sm:py-6">
          <h1 className="font-display text-2xl font-bold text-fg sm:text-3xl">{pageTitle}</h1>

          <form
            role="search"
            aria-label={t("소재 검색", "Material search")}
            className="mt-3 grid max-w-2xl gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (composingRef.current) return;
              cancelPendingSearchCommit();
              const parsed = CreatorMarketplaceResourceSearchQuerySchema.safeParse(draftSearch);
              if (parsed.success) {
                if (parsed.data) recordRecentSearch(parsed.data);
                patchParams({ q: parsed.data || null, ...(parsed.data ? {} : { sort: null }) });
              }
            }}
          >
            <label htmlFor={searchInputId} className="text-sm font-medium text-fg">{t("어떤 소재가 필요한가요?", "What material do you need?")}</label>
            <div className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <input
                id={searchInputId}
                type="search"
                value={draftSearch}
                onCompositionStart={() => { composingRef.current = true; cancelPendingSearchCommit(); }}
                onCompositionEnd={(event) => { composingRef.current = false; updateDraftSearch(event.currentTarget.value); }}
                onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}
                onChange={(event) => updateDraftSearch(event.target.value)}
                maxLength={CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS}
                aria-invalid={parsedUrlQuery.issues.some((issue) => issue.param === "q") || undefined}
                aria-describedby={parsedUrlQuery.issues.some((issue) => issue.param === "q") ? "market-invalid-query" : undefined}
                placeholder={t("예: 고백 장면, 학교 배경, G펜, 야간 보정", "e.g. confession scene, school background, G-pen, night retouch")}
                className="h-12 w-full appearance-none rounded-2xl border border-line bg-card pl-10 pr-14 text-base text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/50 [&::-webkit-search-cancel-button]:hidden"
              />
              {draftSearch ? (
                <button type="button" aria-label={t("검색어 지우기", "Clear search")} onClick={clearSearch} className="absolute right-0 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-xl text-fg-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <button type="submit" className={buttonClass({ variant: "solid", size: "md", className: "min-h-12" })}>{t("검색", "Search")}</button>
            </div>
          </form>

        </Container>
      </section>

      <Container size="wide" className="py-4 sm:py-6">
        {compareCount > 0 ? (
          <div
            data-market-compare-tray-banner="true"
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/50 bg-accent-soft/20 px-4 py-3 shadow-sm"
          >
            <p className="text-sm font-bold text-fg">
              {t(
                `선택한 에셋 ${compareCount}/${MARKET_COMPARE_MAX_ITEMS}개`,
                `Selected assets ${compareCount}/${MARKET_COMPARE_MAX_ITEMS}`,
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={clearCompare}
                className={buttonClass({ variant: "outline", size: "sm", className: "min-h-12" })}
              >
                {t("비교함 비우기", "Clear comparison tray")}
              </button>
              <Link
                href="/market/compare"
                className={buttonClass({ variant: "solid", size: "sm", className: "min-h-12" })}
              >
                {t("나란히 비교하기", "Compare side by side")}
              </Link>
            </div>
          </div>
        ) : null}
        <ListTemplate
          filters={
            <>

        <div className="flex items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium text-fg">
            {t("소재 종류", "Material kind")}
            <select aria-label={t("소재 종류 필터", "Material kind filter")} value={activeFamily?.id ?? "all"}
              onChange={(event) => selectFamily(MARKET_RESOURCE_FAMILIES.find((family) => family.id === event.target.value) ?? null)}
              className="min-h-12 min-w-0 rounded-xl border border-line bg-card px-3 text-base text-fg">
              <option value="all">{t("모든 소재", "All materials")}</option>
              {MARKET_RESOURCE_FAMILIES.map((family) => <option key={family.id} value={family.id}>{t(family.label, family.labelEn)}</option>)}
            </select>
          </label>
          <button ref={filterTrigger} type="button" aria-expanded={filtersOpen} aria-controls={filterPanelId}
            onClick={() => setFiltersOpen((value) => !value)}
            className={buttonClass({ variant: "outline", size: "md", className: "min-h-12 gap-2" })}>
            <SlidersHorizontal size={16} aria-hidden="true" />{t("필터", "Filters")}
            {activeFilterCount > 0 ? <span className="numeral tnum text-accent">{activeFilterCount}</span> : null}
          </button>
        </div>
        <section ref={filterPanel} id={filterPanelId} data-market-filter-panel="" hidden={!filtersOpen}
          aria-label={t("소재 조건과 찾기 방법", "Material filters and search methods")}
          className="market-browse-menu-body mt-3 rounded-xl border border-line bg-panel">
          <label className="grid gap-2 text-sm font-semibold text-fg">
            {t("라이선스", "License")}
            <select aria-label={t("라이선스 필터", "License filter")} value={activeLicense ?? ""}
              onChange={(event) => patchParams({ license: event.target.value || null })}
              className="min-h-12 rounded-xl border border-line bg-card px-3 text-base text-fg">
              <option value="">{t("전체 라이선스", "All licenses")}</option>
              {MARKET_LICENSES.map((license) => <option key={license.license} value={license.license}>{license.label}</option>)}
            </select>
          </label>
          <p className="mt-2 text-xs leading-5 text-fg-2">{t("무료 여부와 상업 이용 조건은 다릅니다. 사용하기 전에 상세 화면에서 이용 조건을 확인하세요.", "Free materials can have different commercial-use terms. Check the usage terms on the detail page before using them.")}</p>
        <section aria-labelledby="market-work-family-title" className="max-sm:hidden">
          <h2 id="market-work-family-title" className="text-sm font-bold text-fg">{t("어떤 리소스가 필요한가요?", "What kind of resource do you need?")}</h2>
          <p className="mt-1 text-sm text-fg-2 max-sm:sr-only">{t("한 번 선택하면 그 작업군에 필요한 세부 카테고리만 아래에 보여줍니다.", "Once selected, only the subcategories for that work family are shown below.")}</p>
          <MarketFamilyPicker
            className="mt-3"
            labelledBy="market-work-family-title"
            selected={activeFamily?.id ?? (activeKind ? null : "all")}
            target={{ kind: "button", onSelect: selectFamily }}
          />
        </section>

        {activeFamily ? (
          <details className="market-browse-extra-menu mt-4" data-market-subcategories="">
            <summary>{t("세부 소재 고르기", "Choose a subcategory")} <ChevronDown size={16} aria-hidden="true" /></summary>
            <div className="market-browse-menu-body" aria-labelledby="market-subcategory-title">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel text-accent">
                <activeFamily.icon className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h2 id="market-subcategory-title" className="text-sm font-bold text-fg">{t(`${activeFamily.label} 세부 카테고리`, `${activeFamily.labelEn} subcategories`)}</h2>
                <p className="mt-0.5 text-xs leading-5 text-fg-3">{t(activeFamily.description, activeFamily.descriptionEn)}</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeFamily.subcategories.map((subcategory) => {
                const selected = activeKind === subcategory.kind && query.tag === subcategory.tag;
                return (
                  <button
                    key={subcategory.id}
                    type="button"
                    onClick={() => patchParams({ kind: subcategory.kind, tag: selected ? null : subcategory.tag ?? null })}
                    aria-pressed={selected}
                    className={cn(
                      "min-h-14 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                      selected ? "border-accent/50 bg-accent-soft" : "border-line bg-panel hover:border-line-strong hover:bg-raised",
                    )}
                  >
                    <strong className={cn("block text-xs", selected ? "text-accent" : "text-fg")}>{t(subcategory.label, subcategory.labelEn)}</strong>
                    <span className="mt-0.5 block text-xs leading-5 text-fg-3">{t(subcategory.description, subcategory.descriptionEn)}</span>
                  </button>
                );
              })}
            </div>
            </div>
          </details>
        ) : null}

        <details className="market-browse-extra-menu mt-4" data-market-quick-filters="">
          <summary>{t("자주 쓰는 조건으로 찾기", "Find with common filters")} <ChevronDown size={16} aria-hidden="true" /></summary>
        <section
          aria-label={t("웹툰 제작 공정별 원클릭 프리셋", "Webtoon production stage presets")}
          className="mb-4 rounded-2xl border border-line bg-card/70 p-3"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-bold text-fg-3">
              {t("공정별 프리셋:", "Stage presets:")}
            </span>
            {PROCESS_PRESET_FILTERS.map((preset) => {
              const selected =
                preset.id === "all"
                  ? !activeKind && !query.tag && !activeLicense
                  : preset.id === "free-cc0"
                    ? activeLicense === "cc0-1.0" && !activeKind
                    : activeKind === preset.kind && (preset.tag ? query.tag === preset.tag : !query.tag);
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selected}
                  data-market-process-preset={preset.id}
                  onClick={() =>
                    patchParams({
                      kind: preset.kind,
                      tag: preset.tag,
                      license: preset.license,
                    })
                  }
                  className={cn(
                    "min-h-12 rounded-full border px-3 text-xs font-semibold transition-colors",
                    selected
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {t(preset.labelKo, preset.labelEn)}
                </button>
              );
            })}
          </div>
        </section>

        </details>

        <details className="market-browse-extra-menu mt-4" data-market-advanced-filters="">
          <summary>{t("상업 이용·호환 조건", "Commercial use & compatibility")} <ChevronDown size={16} aria-hidden="true" /></summary>
          <div className="market-browse-menu-body">
        <MarketBrowseFacetBar
          query={parsedUrlQuery.values}
          hasActiveFilters={hasActiveFilters}
          displaySort={displaySort}
          onChangeDisplaySort={setDisplaySort}
          onPatchParams={patchParams}
          onApplyPresetSearch={applyPresetSearch}
        />
          </div>
        </details>

          <MarketSentenceSearch onApply={applySentenceFilters} />
          {!embedded ? (
            <details className="market-browse-extra-menu mt-4" data-market-tools="">
              <summary>{t("마켓 메뉴·제작 도구", "Market menu & creation tools")} <ChevronDown size={16} aria-hidden="true" /></summary>
              <div className="market-browse-menu-body">
                <MarketNavHeader />
                <nav aria-label={t("원고와 리서치 도구", "Manuscript and research tools")} className="flex flex-wrap gap-2">
                  <Link href="/studio/assets" className={buttonClass({ variant: "outline", size: "sm" })}>{t("원고의 소재 보관함", "Manuscript assets")}</Link>
                  <Link href="/studio/brushes" className={buttonClass({ variant: "outline", size: "sm" })}>{t("브러시 만들기", "Create brushes")}</Link>
                  <Link href="/research" className={buttonClass({ variant: "outline", size: "sm" })}>{t("리서치 데스크", "Research desk")}</Link>
                  <Link href="/learn/paths/visual-finish" className={buttonClass({ variant: "outline", size: "sm" })}>{t("선화·채색 실습", "Line-art & coloring practice")}</Link>
                  <Link href="/research/3d-assets" className={buttonClass({ variant: "outline", size: "sm" })}>{t("무료 CC0 재료 찾기", "Find free CC0 materials")}</Link>
                </nav>
              </div>
            </details>
          ) : null}
        </section>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {!hasInvalidQuery && !page.loading && !page.error ? (
            <p className="text-xs text-fg-3" aria-live="polite">
              {t("현재", "Showing")} <span className="numeral tnum font-semibold text-fg">{page.items.length}</span>{t("개 표시", " items")}
            </p>
          ) : <span />}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <MarketViewToggle value={layout} onChange={(value) => patchParams({ layout: value === "grid" ? null : value })} />



            <label className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-fg-2">
              <span>{t("정렬", "Sort")}</span>
              <select aria-label={t("정렬 기준", "Sort by")} value={query.sort} onChange={(event) => patchParams({ sort: event.target.value })} className="h-12 rounded-xl border border-line bg-card px-2.5 text-base text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/70">
                <option value="relevance" disabled={!query.search}>{t("관련도순", "By relevance")}</option>
                <option value="newest">{t("최신순", "Newest")}</option>
              </select>
            </label>
          </div>
        </div>

        {hasActiveFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs" aria-label={t("적용된 조건", "Applied filters")}>
            {activeKind ? <button type="button" aria-label={t(`종류: ${marketKindMeta(activeKind).label} 필터 제거`, `Remove kind filter: ${marketKindMeta(activeKind).label}`)} onClick={() => patchParams({ kind: null })} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">{marketKindMeta(activeKind).label}<X className="size-3" aria-hidden="true" /></button> : null}
            {query.search ? <button type="button" aria-label={t(`검색: “${query.search}” 필터 제거`, `Remove search filter: “${query.search}”`)} onClick={clearSearch} className="inline-flex min-h-12 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">{t("검색", "Search")}: “{query.search}” <X className="size-3" aria-hidden="true" /></button> : null}
            {query.tag ? <button type="button" aria-label={t(`#${query.tag} 태그 필터 제거`, `Remove #${query.tag} tag filter`)} onClick={() => patchParams({ tag: null })} className="inline-flex min-h-12 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">#{query.tag} <X className="size-3" aria-hidden="true" /></button> : null}
            {activeLicense ? <button type="button" aria-label={t(`${MARKET_LICENSES.find((meta) => meta.license === activeLicense)?.label ?? activeLicense} 필터 제거`, `Remove license filter: ${MARKET_LICENSES.find((meta) => meta.license === activeLicense)?.label ?? activeLicense}`)} onClick={() => patchParams({ license: null })} className="inline-flex min-h-12 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">{MARKET_LICENSES.find((meta) => meta.license === activeLicense)?.label} <X className="size-3" aria-hidden="true" /></button> : null}
            {query.containsAi !== undefined ? <button type="button" aria-label={t(`${query.containsAi ? "AI 포함 공개" : "AI 미포함만"} 필터 제거`, "Remove AI disclosure filter")} onClick={() => patchParams({ containsAi: null })} className="inline-flex min-h-12 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">{query.containsAi ? t("AI 포함 공개", "AI included") : t("AI 미포함만", "No-AI only")} <X className="size-3" aria-hidden="true" /></button> : null}
            {query.commercial !== undefined ? <button type="button" aria-label={t(`${query.commercial ? "상업 연재 허용" : "비상업 전용"} 필터 제거`, "Remove commercial filter")} onClick={() => patchParams({ commercial: null })} className="inline-flex min-h-12 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">{query.commercial ? t("상업 연재 허용", "Commercial OK") : t("비상업 전용", "Non-commercial")} <X className="size-3" aria-hidden="true" /></button> : null}
            {query.engine ? <button type="button" aria-label={t(`렌더러: ${query.engine} 필터 제거`, `Remove engine filter: ${query.engine}`)} onClick={() => patchParams({ engine: null })} className="inline-flex min-h-12 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">{t("렌더러", "Engine")}: {query.engine} <X className="size-3" aria-hidden="true" /></button> : null}
            {query.origin ? <button type="button" aria-label={t(`출처: ${query.origin} 필터 제거`, `Remove origin filter: ${query.origin}`)} onClick={() => patchParams({ origin: null })} className="inline-flex min-h-12 items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg">{t("출처", "Origin")}: {query.origin} <X className="size-3" aria-hidden="true" /></button> : null}
            {query.publisher ? <button type="button" aria-label={t(`배급자: ${activePublisherLabel} 필터 제거`, `Remove publisher filter: ${activePublisherLabel}`)} onClick={() => patchParams({ publisher: null })} className="inline-flex min-h-12 max-w-full items-center gap-1 rounded-lg bg-raised px-2.5 text-fg-2 hover:text-fg"><span className="max-w-64 truncate">{t("배급자", "Publisher")}: {activePublisherLabel}</span><X className="size-3 shrink-0" aria-hidden="true" /></button> : null}
            <button type="button" onClick={resetFilters} className="inline-flex min-h-12 items-center gap-1 rounded-lg bg-bad/10 px-2.5 text-bad hover:bg-bad/20"><RotateCcw className="size-3" aria-hidden="true" />{t("조건 초기화", "Reset filters")}</button>
          </div>
        ) : null}

            </>
          }
        >
        {hasInvalidQuery ? (
          <div id="market-invalid-query" role="alert" className="mt-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-fg-2">
            <p className="font-medium text-fg">{t("주소의 검색 조건을 적용할 수 없어요.", "The search conditions in the URL could not be applied.")}</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed">
              {parsedUrlQuery.issues.map((issue) => <li key={`${issue.param}-${issue.code}`}>{issue.message}</li>)}
            </ul>
            <button type="button" onClick={() => { cancelPendingSearchCommit(); const patch = Object.fromEntries([...new Set(parsedUrlQuery.issues.map((issue) => issue.param))].map((param) => [param, null])); if ("q" in patch) setDraftSearch(""); patchParams(patch); }} className={buttonClass({ variant: "outline", size: "sm", className: "mt-3" })}>
              {t("잘못된 조건 제거", "Remove invalid conditions")}
            </button>
          </div>
        ) : null}

        {!hasInvalidQuery && page.stale ? <StaleNoticeBar savedAt={page.staleSavedAt ?? new Date().toISOString()} onRetry={page.reload} className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2 [&>button]:ml-auto" /> : null}

        {!hasInvalidQuery && page.error && page.items.length === 0 ? (
          <div role="alert" className="mt-8 rounded-2xl border border-warn/30 bg-warn/5 p-8 text-center sm:p-12">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-warn/10 text-warn"><AlertTriangle className="size-6" aria-hidden="true" /></div>
            <h2 className="mt-4 text-base font-bold text-fg">{t("리소스를 불러올 수 없어요", "Resources could not be loaded")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">{t("일시적인 네트워크 문제이거나 서버에 장애가 발생했을 수 있어요. 현재 조건은 유지되므로 다시 시도해도 됩니다.", "This may be a temporary network issue or a server problem. Your current filters are kept, so feel free to try again.")}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3"><button type="button" onClick={page.reload} className={buttonClass({ variant: "solid", size: "sm" })}><RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />{t("다시 시도", "Try again")}</button><Link href="/studio" className={buttonClass({ variant: "outline", size: "sm" })}>{t("Studio로 이동", "Go to Studio")}</Link></div>
          </div>
        ) : null}

        {hasInvalidQuery || (page.error && page.items.length === 0) ? null : (
          <>
            <h2 className="sr-only">{t("탐색 결과", "Browse results")}</h2>
            {page.loading ? <p role="status" className="sr-only">{t("마켓 탐색 결과를 불러오는 중입니다.", "Loading market browse results.")}</p> : null}
            <ul aria-busy={page.loading || undefined} className={`market-browse-results market-browse-results--${layout}`}>
              {page.loading && page.items.length === 0
                ? Array.from({ length: PAGE_SIZE }, (_, index) => <li key={index} aria-hidden="true"><div className="skeleton aspect-[16/9] w-full rounded-t-xl" /><div className="space-y-2 rounded-b-xl border border-t-0 border-line bg-card p-3.5"><div className="skeleton h-4 w-4/5" /><div className="skeleton h-3 w-2/5" /></div></li>)
                : visibleItems.map((record, index) => <li key={record.id} {...introItemProps(index)}><MarketResourceCard record={record} onQuickPreview={setQuickPreviewRecord} className="h-full" /></li>)}
            </ul>

            {!page.loading && page.items.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-line bg-panel p-8 text-center sm:p-12">
                {activeSearch ? (
                  <><div className="mx-auto flex size-12 items-center justify-center rounded-full bg-raised text-fg-3"><SearchX className="size-6" aria-hidden="true" /></div><h2 className="mt-4 text-base font-bold text-fg">{t(`“${activeSearch}” 검색 결과가 없어요`, `No results for “${activeSearch}”`)}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">{t("더 짧은 단어로 검색하거나 선택한 카테고리를 하나씩 해제해 보세요.", "Try shorter keywords or clear the selected categories one by one.")}</p><div className="mt-6 flex flex-wrap justify-center gap-2.5"><button type="button" onClick={clearSearch} className={buttonClass({ variant: "solid", size: "sm" })}>{t("검색어 초기화", "Clear search")}</button>{hasActiveFilters ? <button type="button" onClick={resetFilters} className={buttonClass({ variant: "outline", size: "sm" })}><RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />{t("모든 조건 초기화", "Reset all filters")}</button> : null}</div></>
                ) : activeKind ? (
                  <><div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">{(() => { const Icon = marketKindMeta(activeKind).icon; return <Icon className="size-6" aria-hidden="true" />; })()}</div><h2 className="mt-4 text-base font-bold text-fg">{t(`아직 이 조건에 맞는 ${marketKindMeta(activeKind).label}이 없어요`, `No ${marketKindMeta(activeKind).label} matches these conditions yet`)}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">{t("세부 카테고리를 바꾸거나 Studio에서 만든 리소스를 첫 번째로 공유해 보세요.", "Try a different subcategory, or be the first to share a resource you made in Studio.")}</p><div className="mt-6 flex flex-wrap justify-center gap-2.5"><Link href="/studio?assetMarket=community&communityView=share" className={buttonClass({ variant: "solid", size: "sm" })}><Upload className="mr-1.5 size-3.5" aria-hidden="true" />{t("Studio에서 공유하기", "Share from Studio")}</Link><button type="button" onClick={() => patchParams({ kind: null, tag: null })} className={buttonClass({ variant: "outline", size: "sm" })}>{t("전체 리소스 보기", "View all resources")}</button></div></>
                ) : (
                  <><div className="mx-auto flex size-12 items-center justify-center rounded-full bg-raised text-fg-3"><PackageSearch className="size-6" aria-hidden="true" /></div><h2 className="mt-4 text-base font-bold text-fg">{t("조건에 맞는 공유 리소스가 없어요", "No shared resources match these conditions")}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">{t("공개 마켓에 없는 소재는 기본 무료 제작 소재에서 찾아보세요. 회원가입 없이 원본 파일과 사용 조건을 확인할 수 있습니다.", "For materials not on the public market, try the built-in free production materials. You can check source files and terms without signing up.")}</p><div className="mt-6 flex flex-wrap justify-center gap-2.5"><Link href="/studio/assets?view=essentials" className={buttonClass({ variant: "solid", size: "sm" })}>{t("기본 무료 소재 사용하기", "Use built-in free materials")}</Link><Link href="/studio?assetMarket=community&communityView=share" className={buttonClass({ variant: "solid", size: "sm" })}><Upload className="mr-1.5 size-3.5" aria-hidden="true" />{t("Studio에서 첫 리소스 공유하기", "Share your first resource from Studio")}</Link>{hasActiveFilters ? <button type="button" onClick={resetFilters} className={buttonClass({ variant: "outline", size: "sm" })}><RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />{t("모든 조건 초기화", "Reset all filters")}</button> : null}</div></>
                )}
              </div>
            ) : null}

            {!page.loading && page.loadMoreError && !page.error ? (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-bad" role="alert"><span>{page.loadMoreError}</span><button type="button" onClick={page.loadMore} disabled={page.loadingMore} className={buttonClass({ variant: "outline", size: "sm" })}>{page.loadingMore ? t("다시 불러오는 중…", "Loading again…") : t("다시 시도", "Try again")}</button></div>
            ) : !page.loading && page.hasMore && !page.error ? (
              <div className="mt-8 text-center"><button type="button" onClick={page.loadMore} disabled={page.loadingMore} className={buttonClass({ variant: "outline", size: "md" })}>{page.loadingMore ? t("불러오는 중…", "Loading…") : t("더 많은 리소스 불러오기", "Load more resources")}</button></div>
            ) : null}
          </>
        )}
        </ListTemplate>
        <MarketRecentlyViewedStrip className="mt-8" />
        <MarketCompareShelf />
      </Container>
      <MarketQuickPreviewDialog
        record={quickPreviewRecord}
        onClose={() => setQuickPreviewRecord(null)}
      />
    </div>
  );
}
