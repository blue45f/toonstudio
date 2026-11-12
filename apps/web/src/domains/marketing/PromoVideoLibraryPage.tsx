import { SITE_URL } from "@toonstudio/core/business";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  LayoutGrid,
  List,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";

import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { normalizeLocaleCode, useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";
import {
  COMPETITOR_DISCOVERY_ROUTER_PRESETS,
  COMPETITOR_PLATFORM_REA_LEDGER,
  CREATOR_STUDIO_PIPELINE_STEPS,
  DEFAULT_PROMO_MEDIA_FILTER_STATE,
  SERIES_LANDING_VIEW_MODES,
  matchesPromoMediaFilter,
  runSameDocumentViewTransition,
  type MediaAspectFilter,
  type PromoMediaFilterState,
  type SeriesLandingViewMode,
} from "@/shared/navigation/webtoon-platform-router-ux-model";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";

import {
  PROMO_VIDEO_CATEGORIES,
  PROMO_VIDEO_ITEMS,
  promoVideosByCategory,
  type PromoVideoItem,
} from "./promo-video-library";
import { PromoClipPlayer } from "./PromoClipPlayer";
import { promoClipPoster } from "./promo-clip-posters";

import "./marketing-page.css";
import "./promo-video-library.css";

const COPY = {
  ko: {
    pageTitle: "홍보 영상 자료실",
    metaDescription:
      "툰스튜디오 홍보에 쓰는 생성형 AI 영상 204편을 카테고리별로 모았습니다. 미리 보고 원본을 내려받아 쇼츠와 마케팅 소재로 활용하세요.",
    imageAlt: "툰스튜디오 홍보 영상 자료실",
    back: "서비스 소개",
    eyebrow: "PROMO VIDEO LIBRARY",
    title: ["홍보 영상,", "한곳에 모았습니다."],
    lead: "지금까지 만든 홍보 영상을 카테고리별로 모아 둔 자료실입니다. 나중에 쇼츠를 새로 편집하거나 마케팅 소재가 필요할 때, 여기서 미리 보고 원본 파일을 바로 내려받을 수 있습니다.",
    notice:
      "이 자료실의 영상은 전부 생성형 AI로 만든 개념 영상입니다. 실제 제품 화면 캡처가 아니라 분위기와 흐름을 전하는 홍보 소재라, 화면 구성은 실제 제품과 다를 수 있습니다.",
    howto:
      "각 항목의 재생 버튼으로 바로 확인하고, 원본 내려받기로 MP4 파일을 가져가세요. 지금 사이트 어딘가에 걸려 쓰이는 영상은 항목마다 '쓰는 곳'으로 표시했습니다.",
    factsLabel: "자료실 규모",
    jumpLabel: "카테고리 바로가기",
    clipsUnit: "편",
    specLabel: "규격",
    usageLabel: "쓰는 곳",
    download: "원본 내려받기",
    conceptBadge: "개념 영상",
    closingTitle: "영상이 쓰이는 자리도 함께 보세요.",
    closingBody:
      "이 자료실의 영상 상당수는 이미 브랜드 필름과 제품 투어, 기능 요약 페이지에 걸려 있습니다. 완성된 화면에서 어떻게 보이는지 먼저 확인하거나, 내 작품의 홍보 예고편을 직접 만들어 보세요.",
    closingBrandFilm: "브랜드 필름 보기",
    closingTour: "제품 투어 보기",
    closingPromoStudio: "내 작품 홍보 영상 만들기",
    closingPromoteBoard: "신작·작가 홍보 게시판",
    closingCuts: "숏폼 컷츠 피드",
    wayfindingLabel: "영상·홍보 바로가기",
    viewModeLabel: "화면 보기 방식",
    aspectFilterLabel: "화면 비율 필터",
    aspectAll: "전체 비율",
    aspectLandscape: "가로 16:9",
    aspectVertical: "세로 9:16 쇼츠",
    aspectSquare: "정사각 1:1",
    searchPlaceholder: "영상 제목·설명·쓰는 곳으로 검색",
    resetFilter: "필터 초기화",
    reaBenchmarkTitle:
      "웹툰·창작 서비스의 구성과 사용 흐름 참고 자료",
    pipelineLabel: "창작·예고편·배포 6단계 통합 동선",
    discoveryPresetsLabel: "경쟁사 표준 탐색·랭킹 바로가기",
    relatedMenu: "홍보 메뉴",
    conceptNotice: "생성형 AI 개념 영상입니다. 실제 제품 화면과 다를 수 있어요.",
    categoryFilterLabel: "영상 분류",
    categoryAll: "전체 분류",
    viewOptions: "보기 설정",
    helpLabel: "다운로드·활용 안내",
    referenceLabel: "제작·탐색 참고 자료",
    emptyTitle: "조건에 맞는 영상이 없어요",
    emptyBody: "검색어·분류·화면 비율을 확인하거나 필터를 초기화해 주세요.",
    jumpHelp: "현재 조건에 맞는 영상이 있는 분류로 이동합니다. 다른 분류를 보려면 위에서 전체 분류를 선택하세요.",
  },
  en: {
    pageTitle: "Promo Video Library",
    metaDescription:
      "All 204 AI-generated ToonStudio promo clips in one library, organized by category. Preview each clip and download the originals for shorts and marketing use.",
    imageAlt: "ToonStudio promo video library",
    back: "About ToonStudio",
    eyebrow: "PROMO VIDEO LIBRARY",
    title: ["Every promo clip,", "in one library."],
    lead: "A library of every promo clip we have made, organized by category. When you need to cut a new short or pull marketing material later, preview a clip here and download the original file right away.",
    notice:
      "Every clip in this library is an AI-generated concept video. They are promotional material that conveys mood and flow — not captures of the actual product — so layouts may differ from the real product.",
    howto:
      "Press play on any item to preview it, and use Download original to take the MP4 with you. Clips already running somewhere on the site are marked with where they are used.",
    factsLabel: "Library at a glance",
    jumpLabel: "Jump to a category",
    clipsUnit: "clips",
    specLabel: "Spec",
    usageLabel: "Used on",
    download: "Download original",
    conceptBadge: "Concept clip",
    closingTitle: "See the clips where they run.",
    closingBody:
      "Many of these clips already run on the brand film, the product tour and the features overview. Check how they look in the finished pages first, or make a promo trailer for your own work.",
    closingBrandFilm: "Watch the brand film",
    closingTour: "Watch the product tour",
    closingPromoStudio: "Make a promo for my work",
    closingPromoteBoard: "Creator promotion board",
    closingCuts: "Short-form Cuts feed",
    wayfindingLabel: "Video & promotion shortcuts",
    viewModeLabel: "View mode",
    aspectFilterLabel: "Aspect ratio filter",
    aspectAll: "All ratios",
    aspectLandscape: "16:9 Landscape",
    aspectVertical: "9:16 Shorts",
    aspectSquare: "1:1 Square",
    searchPlaceholder: "Search by clip title, description or usage",
    resetFilter: "Reset filters",
    reaBenchmarkTitle:
      "Reference material on webtoon and creator service workflows",
    pipelineLabel: "6-Step Creator-to-Promotion Pipeline",
    discoveryPresetsLabel: "Competitor-Standard Discovery & Ranking Presets",
    relatedMenu: "Promo menu",
    conceptNotice: "AI-generated concept clips. They may differ from the actual product.",
    categoryFilterLabel: "Clip category",
    categoryAll: "All categories",
    viewOptions: "View settings",
    helpLabel: "Download and usage guide",
    referenceLabel: "Creation and discovery references",
    emptyTitle: "No clips match these filters",
    emptyBody: "Check the search, category or aspect ratio, or reset the filters.",
    jumpHelp: "Jump to categories that match the current filters. Select all categories above to browse another category.",
  },
} as const;

function readPromoFilter(search: string): PromoMediaFilterState {
  const params = new URLSearchParams(search);
  return {
    viewMode: SERIES_LANDING_VIEW_MODES.find((mode) => mode.id === params.get("promo-view"))?.id ?? DEFAULT_PROMO_MEDIA_FILTER_STATE.viewMode,
    aspectFilter: (["all", "landscape-16-9", "vertical-9-16", "square-1-1"] as const).find((aspect) => aspect === params.get("promo-ratio")) ?? "all",
    categoryFilter: PROMO_VIDEO_CATEGORIES.find((category) => category.id === params.get("promo-category"))?.id ?? "all",
    searchQuery: params.get("promo-q") ?? "",
  };
}

function samePromoFilter(left: PromoMediaFilterState, right: PromoMediaFilterState): boolean {
  return left.viewMode === right.viewMode && left.aspectFilter === right.aspectFilter
    && left.categoryFilter === right.categoryFilter && left.searchQuery === right.searchQuery;
}

function closePromoDisclosure(event: globalThis.KeyboardEvent, root: HTMLElement | null): void {
  if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || !(event.target instanceof Element) || !root?.contains(event.target)) return;
  const owner = event.target.closest("[data-promo-disclosure]");
  const nested = event.target instanceof Element ? event.target.closest("details[open]") : null;
  if (!(nested instanceof HTMLDetailsElement) || !owner || !owner.contains(nested)) return;
  event.preventDefault(); event.stopPropagation();
  nested.open = false;
  nested.querySelector("summary")?.focus();
}

function PromoVideoCard({ item }: { readonly item: PromoVideoItem }) {
  const bi = useBilingualLocalizer("domains.marketing.PromoVideoLibraryPage");
  const copy = bi(COPY.ko, COPY.en);
  const itemCopy = bi(item.ko, item.en);
  const usage = bi(item.usage.ko, item.usage.en);
  const note = item.note ? bi(item.note.ko, item.note.en) : undefined;
  return (
    <li className="promo-library__card mk-card" data-promo-video={item.id}>
      <header className="promo-library__card-heading"><h3>{itemCopy.title}</h3></header>
      {/*
        자료실은 목록 페이지라 자동재생을 쓰지 않는다. 수십 개 영상이 한꺼번에
        움직이면 어지럽고 데이터도 많이 쓰며, 움직임 최소화를 선호하는
        사용자에게도 안전하지 않다. 재생은 사용자가 직접 누를 때만 일어난다.
      */}
      <PromoClipPlayer
        src={item.src}
        poster={promoClipPoster(item.src)}
        width={item.width}
        height={item.height}
        title={itemCopy.title}
      />
      <div className="promo-library__card-copy">
        <p>{itemCopy.body}</p>
        {note ? <p className="promo-library__note">{note}</p> : null}
        <div className="promo-library__meta">
          <span className="mk-badge">
            <Sparkles size={13} aria-hidden="true" />
            {copy.conceptBadge}
          </span>
          <span className="promo-library__spec">
            {copy.specLabel} {item.width}×{item.height} · {item.durationLabel}
          </span>
        </div>
        <p className="promo-library__usage">
          <span>{copy.usageLabel}</span>
          {usage}
        </p>
        <div className="promo-library__card-actions">
          <a href={item.src} download className="mk-button">
            <Download size={15} aria-hidden="true" />
            {copy.download}
          </a>
        </div>
      </div>
    </li>
  );
}

export function PromoVideoLibraryPage() {
  const bi = useBilingualLocalizer("domains.marketing.PromoVideoLibraryPage");
  const language = useI18n((state) => state.lang);
  const documentLocale = normalizeLocaleCode(language) || "en";
  const isKo = documentLocale === "ko";
  const copy = bi(COPY.ko, COPY.en);
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const routeRef = useRef(location);
  routeRef.current = location;
  const mounted = useRef(true);
  const [filter, setFilter] = useState<PromoMediaFilterState>(() => readPromoFilter(location.search));
  const filterRef = useRef(filter);
  const authoredSearch = useRef<string | null>(null);
  const composing = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const closeDisclosure = (event: globalThis.KeyboardEvent) => closePromoDisclosure(event, rootRef.current);
    document.addEventListener("keydown", closeDisclosure);
    return () => document.removeEventListener("keydown", closeDisclosure);
  }, []);
  useLayoutEffect(() => {
    if (navigationType !== "POP" && authoredSearch.current === location.search) { authoredSearch.current = null; return; }
    authoredSearch.current = null; composing.current = false;
    const restored = readPromoFilter(location.search);
    if (samePromoFilter(filterRef.current, restored)) return;
    filterRef.current = restored; setFilter(restored);
  }, [location.key, location.search, navigationType]);
  const patchFilter = (patch: Partial<PromoMediaFilterState>, writeUrl = true) => {
    if (!mounted.current) return;
    const next = { ...filterRef.current, ...patch };
    filterRef.current = next; setFilter(next);
    if (!writeUrl) return;
    const currentRoute = routeRef.current;
    const params = new URLSearchParams(currentRoute.search);
    for (const [key, value, defaultValue] of [
      ["promo-q", next.searchQuery, ""], ["promo-category", next.categoryFilter, "all"],
      ["promo-ratio", next.aspectFilter, "all"], ["promo-view", next.viewMode, "card"],
    ] as const) { if (value === defaultValue) params.delete(key); else params.set(key, value); }
    const search = params.size ? `?${params.toString()}` : "";
    let hash = currentRoute.hash;
    if (hash.startsWith("#promo-category-")) {
      const targetCategory = hash.slice("#promo-category-".length);
      if (!PROMO_VIDEO_ITEMS.some((item) => item.categoryId === targetCategory && matchesPromoMediaFilter(item, next))) hash = "";
    }
    if (search === currentRoute.search && hash === currentRoute.hash) return;
    authoredSearch.current = search;
    navigate({ pathname: currentRoute.pathname, search, hash }, { replace: true, state: currentRoute.state });
  };

  useDocumentTitle(copy.pageTitle);
  useMetaDescription(copy.metaDescription);
  usePageSocialMeta({
    canonicalPath: "/promo-library",
    title: copy.pageTitle,
    description: copy.metaDescription,
    image: `${SITE_URL}/brand/toonstudio-og.png`,
    imageAlt: copy.imageAlt,
  });

  const updateViewMode = (viewMode: SeriesLandingViewMode) => {
    runSameDocumentViewTransition(() => {
      patchFilter({ viewMode });
    });
  };

  const updateAspectFilter = (aspectFilter: MediaAspectFilter) => {
    runSameDocumentViewTransition(() => {
      patchFilter({ aspectFilter });
    });
  };

  const hasActiveFilter =
    filter.aspectFilter !== "all" ||
    filter.categoryFilter !== "all" ||
    filter.searchQuery.trim().length > 0;

  const categoryResults = PROMO_VIDEO_CATEGORIES.map((category) => ({ category, items: promoVideosByCategory(category.id).filter((item) => matchesPromoMediaFilter(item, filter)) }));
  const resultCount = categoryResults.reduce((count, result) => count + result.items.length, 0);

  const aspectOptions: readonly { id: MediaAspectFilter; label: string }[] = [
    { id: "all", label: copy.aspectAll },
    { id: "landscape-16-9", label: copy.aspectLandscape },
    { id: "vertical-9-16", label: copy.aspectVertical },
    { id: "square-1-1", label: copy.aspectSquare },
  ];

  return (
    <div
      ref={rootRef}
      className="mk-page promo-library"
      lang={documentLocale}
      data-view-mode={filter.viewMode}
    >
      <header className="mk-shell promo-library__hero">
        <div className="promo-library__heading">
          <h1 className="mk-title">{copy.pageTitle}</h1>
          <details className="promo-library__related" data-promo-disclosure="true">
            <summary>{copy.relatedMenu}</summary>
            <div className="promo-library__related-panel"><SiteContextualSubNav pathnameOverride="/promo-library" /></div>
          </details>
        </div>
        <p className="promo-library__concept">{copy.conceptNotice}</p>
        <div className="promo-library__facts" role="group" aria-label={copy.factsLabel}>
          <strong>{bi(`전체 ${PROMO_VIDEO_ITEMS.length}편`, `${PROMO_VIDEO_ITEMS.length} clips total`)}</strong>
          <span>{bi(`세로 쇼츠 ${promoVideosByCategory("shorts").length}편 포함`, `${promoVideosByCategory("shorts").length} vertical shorts included`)}</span>
          <span>{bi("원본 MP4 제공", "Original MP4 files")}</span>
        </div>
        <form className="promo-library__controls" aria-label={bi("홍보 영상 찾기", "Find promo clips")} onSubmit={(event) => {
          event.preventDefault();
          if (!composing.current) patchFilter({ searchQuery: searchInput.current?.value ?? filterRef.current.searchQuery });
        }}>
          <div className="promo-library__controls-row">
            <label className="promo-library__search-box">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">{copy.searchPlaceholder}</span>
              <input ref={searchInput} type="search" value={filter.searchQuery} placeholder={copy.searchPlaceholder}
                onChange={(event) => patchFilter({ searchQuery: event.currentTarget.value }, !composing.current)}
                onCompositionStart={() => { composing.current = true; }}
                onCompositionEnd={(event) => { composing.current = false; patchFilter({ searchQuery: event.currentTarget.value }); }}
                onKeyDown={(event) => { if (event.key === "Enter" && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }} />
            </label>
            <label className="promo-library__select">
              <span className="sr-only">{copy.categoryFilterLabel}</span>
              <select data-select-native="true" aria-label={copy.categoryFilterLabel} value={filter.categoryFilter} onChange={(event) => {
                const categoryFilter = PROMO_VIDEO_CATEGORIES.find((category) => category.id === event.currentTarget.value)?.id ?? "all";
                patchFilter({ categoryFilter });
              }}>
                <option value="all">{`${copy.categoryAll} · ${PROMO_VIDEO_ITEMS.length}${copy.clipsUnit}`}</option>
                {PROMO_VIDEO_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{`${bi(category.ko, category.en).title} · ${promoVideosByCategory(category.id).length}${copy.clipsUnit}`}</option>)}
              </select>
            </label>
            <label className="promo-library__select">
              <span className="sr-only">{copy.aspectFilterLabel}</span>
              <select data-select-native="true" aria-label={copy.aspectFilterLabel} value={filter.aspectFilter} onChange={(event) => {
                const aspect = aspectOptions.find((option) => option.id === event.currentTarget.value)?.id;
                if (aspect) updateAspectFilter(aspect);
              }}>{aspectOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
            </label>
          </div>
          <div className="promo-library__controls-secondary">
            <p role="status" aria-live="polite" aria-atomic="true" className="promo-library__results-count">{bi(`${resultCount} / ${PROMO_VIDEO_ITEMS.length}편`, `${resultCount} / ${PROMO_VIDEO_ITEMS.length} clips`)}</p>
            {hasActiveFilter && resultCount > 0 ? <button type="button" onClick={() => patchFilter(DEFAULT_PROMO_MEDIA_FILTER_STATE)} className="promo-library__filter-btn"><RotateCcw size={14} aria-hidden="true" />{copy.resetFilter}</button> : null}
            <details className="promo-library__guidance" data-promo-disclosure="true">
              <summary>{copy.helpLabel}</summary>
              <div className="promo-library__guidance-panel">
                <p className="mk-body">{copy.lead}</p><p className="mk-body promo-library__notice">{copy.notice}</p><p className="mk-body">{copy.howto}</p>
                <nav className="mk-actions" aria-label={copy.wayfindingLabel}>
                  <Link href="/showcase/promo" className="mk-button">{copy.closingPromoStudio}<ArrowRight size={17} aria-hidden="true" /></Link>
                  <Link href="/community/promote" className="mk-button">{copy.closingPromoteBoard}</Link><Link href="/cuts" className="mk-button">{copy.closingCuts}</Link>
                </nav>
                <details className="promo-library__rea-benchmark">
                  <summary>{bi("분류별 영상 안내", "About each clip category")}</summary>
                  {PROMO_VIDEO_CATEGORIES.map((category) => <div key={category.id}><h3>{bi(category.ko, category.en).title}</h3><p className="mk-body">{bi(category.ko, category.en).body}</p></div>)}
                </details>
                <p className="mk-body">{copy.jumpHelp}</p>
                <nav className="promo-library__nav" aria-label={copy.jumpLabel}>
                  {categoryResults.map(({ category, items }) => {
                    const label = `${bi(category.ko, category.en).title} · ${items.length}${copy.clipsUnit}`;
                    return items.length > 0 ? <a key={category.id} href={`#promo-category-${category.id}`} className="mk-chip promo-library__nav-chip">{label}</a> : <span key={category.id} className="mk-chip promo-library__nav-chip" aria-disabled="true">{label}</span>;
                  })}
                </nav>
        <details className="promo-library__rea-benchmark">
          <summary>{copy.referenceLabel}</summary>
          <p className="mk-body">{copy.reaBenchmarkTitle}</p>
          <ul className="promo-library__rea-grid">
            {COMPETITOR_PLATFORM_REA_LEDGER.map((entry) => (
              <li key={entry.id} className="promo-library__rea-item" data-rea-platform={entry.id}>
                <strong>
                  {entry.name} ({entry.appVersion})
                </strong>
                <span>{entry.routerFramework}</span>
                <code>{entry.astAnalysisViewEvidenceId}</code>
              </li>
            ))}
          </ul>
          <nav className="promo-library__rea-flows" aria-label={copy.pipelineLabel}>
            <ul className="promo-library__rea-grid">
              {CREATOR_STUDIO_PIPELINE_STEPS.map((step) => (
                <li key={step.id} className="promo-library__rea-item">
                  <Link href={step.toonstudioHref}>
                    <strong>{isKo ? step.koTitle : step.enTitle}</strong>
                  </Link>
                  <span>{isKo ? step.koSummary : step.enSummary}</span>
                  <code>{step.mantaRoute} · {step.naverRoute}</code>
                </li>
              ))}
            </ul>
          </nav>
          <nav className="promo-library__rea-presets" aria-label={copy.discoveryPresetsLabel}>
            {COMPETITOR_DISCOVERY_ROUTER_PRESETS.map((preset) => (
              <Link
                key={preset.id}
                href={preset.toonstudioHref}
                className="mk-chip promo-library__nav-chip"
              >
                {isKo ? preset.koLabel : preset.enLabel}
              </Link>
            ))}
          </nav>
        </details>
              </div>
            </details>
            <details className="promo-library__view-options" data-promo-disclosure="true">
              <summary>{copy.viewOptions}</summary>
              <div className="promo-library__view-switcher" role="group" aria-label={copy.viewModeLabel}>
                {SERIES_LANDING_VIEW_MODES.map((mode) => <button key={mode.id} type="button" aria-pressed={filter.viewMode === mode.id} onClick={() => updateViewMode(mode.id)} className="promo-library__filter-btn" data-view-switcher={mode.id}>
                  {mode.id === "list" ? <List size={14} aria-hidden="true" /> : <LayoutGrid size={14} aria-hidden="true" />}<span>{isKo ? mode.koLabel : mode.enLabel}</span>
                </button>)}
              </div>
            </details>
          </div>
        </form>
      </header>
      {resultCount === 0 ? <section className="mk-shell promo-library__empty" aria-labelledby="promo-library-empty-title"><h2 id="promo-library-empty-title" className="mk-h2">{copy.emptyTitle}</h2><p className="mk-body">{copy.emptyBody}</p><button type="button" className="mk-button mk-button--primary" onClick={() => patchFilter(DEFAULT_PROMO_MEDIA_FILTER_STATE)}>{copy.resetFilter}</button></section> : null}

      {categoryResults.map(({ category, items }) => {
        const categoryCopy = bi(category.ko, category.en);
        if (items.length === 0) return null;
        return (
          <section
            key={category.id}
            id={`promo-category-${category.id}`}
            tabIndex={-1}
            className="mk-shell promo-library__section"
            aria-labelledby={`promo-category-${category.id}-title`}
          >
            <div className="promo-library__section-head">
              <h2 id={`promo-category-${category.id}-title`} className="mk-h2">{categoryCopy.title}</h2>
              <span className="promo-library__count">{items.length}{copy.clipsUnit}</span>
            </div>
            <ul className={`promo-library__grid${category.id === "shorts" ? " promo-library__grid--portrait" : ""}`}>
              {items.map((item) => (
                <PromoVideoCard key={item.id} item={item} />
              ))}
            </ul>
          </section>
        );
      })}

      <div className="mk-shell promo-library__footer">
        <section className="mk-closing promo-library__closing" aria-labelledby="promo-library-closing-title">
          <div>
            <h2 id="promo-library-closing-title" className="mk-h2">{copy.closingTitle}</h2>
            <p className="mk-body">{copy.closingBody}</p>
          </div>
          <div className="mk-actions">
            <Link href="/brand-film" className="mk-button mk-button--primary">
              {copy.closingBrandFilm}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link href="/product-tour" className="mk-button">
              {copy.closingTour}
            </Link>
            <Link href="/showcase/promo" className="mk-button">
              {copy.closingPromoStudio}
            </Link>
            <Link href="/community/promote" className="mk-button">
              {copy.closingPromoteBoard}
            </Link>
          </div>
        </section>
        <div className="promo-library__back">
          <Link href="/about" className="mk-back">
            <ArrowLeft size={16} aria-hidden="true" />
            {copy.back}
          </Link>
        </div>
      </div>
    </div>
  );
}
