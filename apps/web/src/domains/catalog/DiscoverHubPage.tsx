import "./discover-hub-layout.css";

import {
  ArrowRight,
  CalendarDays,
  Clapperboard,
  Compass,
  HelpCircle,
  Library,
  MessageCircle,
  MessagesSquare,
  NotebookPen,
  Search,
  Shuffle,
  Sparkles,
  Swords,
  Telescope,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { StaggerReveal } from "@/shared/components/stagger-reveal";
import { SiteStepList } from "@/domains/legal/public/site-step-list";
import { Container, Section } from "@/shared/components/section";
import { TitleCard } from "@/shared/components/title-card";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { GENRES } from "@/shared/lib/taxonomy";
import Link from "@/shared/navigation/router-link";
import {
  DISCOVER_SERIALIZATION_TRACKS,
  runSameDocumentViewTransition,
  type DiscoverSerializationTrackId,
} from "@/shared/navigation/webtoon-platform-router-ux-model";
import { useApiResource } from "@/platform/use-api-resource";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { cn } from "@/shared/lib/utils";

import { DiscoverFacetTabStrip } from "./DiscoverFacetTabStrip";
import { DiscoverSpotlight } from "./DiscoverSpotlight";
import {
  DISCOVER_HOME_SNAPSHOT_URL,
  pickDiscoverSpotlight,
  snapshotDateLabel,
  type DiscoverHomeSnapshot,
} from "./discover-home";
import { collectDiscoverLocalMatches } from "./local-catalog-fallback";

/** 카드·트랙 안내 일러스트가 깨지거나 오프라인일 때 빈 영역 대신 토큰 배지를 표시한다. */
function DiscoverCardArt({
  src,
  className,
  fallbackLabel,
}: {
  readonly src: string;
  readonly className?: string;
  readonly fallbackLabel: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;
  return (
    <>
      <img
        ref={(node) => {
          if (node && node.complete && node.naturalWidth === 0 && failedSrc !== src) {
            setFailedSrc(src);
          }
        }}
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        data-fallback-active={failed ? "true" : "false"}
        onError={() => setFailedSrc(src)}
        className={cn(className, failed && "hidden")}
      />
      {failed ? (
        <span
          aria-hidden="true"
          data-testid="discover-art-fallback"
          className={cn(
            "grid place-items-center bg-[linear-gradient(145deg,color-mix(in_oklch,var(--color-accent)_26%,var(--color-panel)),color-mix(in_oklch,var(--color-cool)_20%,var(--color-canvas)))] px-2 text-center text-[11px] font-bold text-fg-2",
            className,
          )}
        >
          {fallbackLabel}
        </span>
      ) : null}
    </>
  );
}

/** 헤더에서 바로 누를 수 있는 장르 수 — 나머지는 "전체 장르"(탐색)로 이어진다. */
const QUICK_GENRE_COUNT = 7;
/** 스냅샷 수치는 정확한 값이라 약식(6만) 대신 천 단위 구분으로 보여 준다. */
const COUNT_FORMAT = new Intl.NumberFormat("en-US");

const QUICK_DISCOVERY_PRESETS: readonly {
  readonly href: string;
  readonly label: readonly [string, string];
}[] = [
  { href: "/explore?status=ongoing&sort=popular", label: ["연재중 인기작", "Popular ongoing"] },
  { href: "/explore?status=completed&sort=binge", label: ["완결 정주행", "Completed binge"] },
  { href: "/explore?minRating=4.5&sort=rating", label: ["평점 4.5+ 명작", "4.5+ top rated"] },
  { href: "/cuts", label: ["숏폼 컷츠", "Short-form Cuts"] },
  { href: "/character-chat", label: ["AI 캐릭터 토크", "Character Talk"] },
];

const SERIALIZATION_TRACK_EN: Readonly<
  Record<DiscoverSerializationTrackId, { readonly label: string; readonly description: string; readonly secondaryLabel: string }>
> = {
  all: {
    label: "All Unified Tracks",
    description: "Browse weekly originals, open Canvas leagues, Wait-Until-Free hits, and short-form Cuts in one place.",
    secondaryLabel: "Live Rankings",
  },
  originals: {
    label: "Weekly Originals",
    description: "Explore official Monday-to-Sunday serialized series and weekly spotlight hits.",
    secondaryLabel: "Originals Chart",
  },
  canvas: {
    label: "Open Canvas League",
    description: "Discover indie series published freely by creators and promoted through reader momentum.",
    secondaryLabel: "Start Canvas Series",
  },
  "wait-free": {
    label: "Wait-Until-Free (WUF)",
    description: "Catch major serialized hits that unlock free episodes on a timer plus full-free binge titles.",
    secondaryLabel: "Browse WUF Titles",
  },
  "cuts-short": {
    label: "Short-form Cuts & Trailers",
    description: "Find your next favorite story in under a minute with vertical Cuts and motion trailers.",
    secondaryLabel: "Open Cuts Feed",
  },
};

// 아래 작품 레일은 라우트 본문과 분리해 첫 화면의 동기 모듈 그래프를 줄인다.
const LazyDiscoverRecentShelf = lazyRetry(
  () => import("./DiscoverRecentShelf").then((module) => ({ default: module.DiscoverRecentShelf })),
  "DiscoverRecentShelf",
);
const LazyDiscoverShelves = lazyRetry(
  () => import("./DiscoverShelves").then((module) => ({ default: module.DiscoverShelves })),
  "DiscoverShelves",
);

// 기억으로 작품 찾기는 접힌 안내를 처음 펼칠 때만 내려받는다 — 탐색 허브의 첫 화면 번들에 넣지 않는다.
const LazyMemoryFinderSection = lazyRetry(
  () => import("./memory-finder/MemoryFinderSection").then((module) => ({ default: module.MemoryFinderSection })),
  "MemoryFinderSection",
);

interface DiscoverDestination {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly title: readonly [string, string];
  readonly body: readonly [string, string];
  /** 탐색을 넘어 제작으로 이어지는 진입점(리서치)은 눈에 띄게 강조한다. */
  readonly highlight?: boolean;
}

const DESTINATIONS: readonly DiscoverDestination[] = [
  { href: "/search", icon: Search, title: ["정확히 검색", "Exact search"], body: ["찾는 작품·작가·태그가 있을 때", "When you know a story, creator or tag"] },
  { href: "/explore", icon: Compass, title: ["조건으로 탐색", "Explore by filters"], body: ["장르·태그·상태·플랫폼을 좁혀 발견", "Narrow by genre, tag, status and platform"] },
  { href: "/recommend", icon: Sparkles, title: ["맞춤 추천", "Recommendations"], body: ["내 평가와 선호 장르를 반영한 추천", "Picks from your ratings and favorite genres"] },
  { href: "/ranking", icon: TrendingUp, title: ["통합 랭킹", "Rankings"], body: ["인기·급상승·평점 등 여러 신호로 비교", "Compare popularity, momentum and ratings"] },
  { href: "/calendar", icon: CalendarDays, title: ["연재 캘린더", "Release calendar"], body: ["요일별로 업데이트되는 작품 확인", "See which stories update on each day"] },
  { href: "/random", icon: Shuffle, title: ["랜덤 발견", "Random discovery"], body: ["고르기 어려울 때 한 편씩 미리 보기", "Preview one pick at a time when choosing is hard"] },
  { href: "/compare", icon: Swords, title: ["두 작품 비교", "Compare two"], body: ["고민되는 두 작품의 지표와 제공처 비교", "Compare signals and availability for two stories"] },
  { href: "/library", icon: Library, title: ["내 서재", "My library"], body: ["저장·평가·읽기 상태로 돌아가기", "Return to saved, rated and in-progress stories"] },
  { href: "/cuts", icon: Clapperboard, title: ["숏폼 컷츠", "Short-form Cuts"], body: ["짧은 세로형 클립으로 명장면 미리 보기", "Preview iconic scenes in vertical short clips"] },
  { href: "/character-chat", icon: MessageCircle, title: ["캐릭터 토크", "Character Talk"], body: ["작가가 승인한 설정으로 작품 속 인물과 대화", "Chat with characters using author-approved canon"] },
  // 탐색에서 이어지는 다음 행동 — 작품을 보고 난 뒤 이야기를 나누거나, 내 장면의 참고자료를 찾는다.
  { href: "/community", icon: MessagesSquare, title: ["작품 이야기 나누기", "Talk about stories"], body: ["작품·작가·펜카페 커뮤니티에서 감상 나누기", "Share impressions in story, creator and pencafe communities"] },
  { href: "/research", icon: Telescope, title: ["참고자료 찾기", "Find references"], body: ["내 장면에 필요한 레퍼런스·3D 재료·폰트", "References, 3D materials and fonts for your scenes"], highlight: true },
];

/** 공개 카탈로그 수치와 기준일은 실제 스냅샷만 사용한다. */
function CatalogSnapshotLine({ snapshot, loading }: { readonly snapshot: DiscoverHomeSnapshot | null; readonly loading: boolean }) {
  const bt = useBilingual("DiscoverHubPage");
  const dateLabel = snapshot?.generatedAt ? snapshotDateLabel(snapshot.generatedAt) : null;
  const rawStats = snapshot?.stats;
  const hasValidStats =
    rawStats != null &&
    typeof rawStats.titles === "number" &&
    Number.isFinite(rawStats.titles) &&
    typeof rawStats.platforms === "number" &&
    Number.isFinite(rawStats.platforms) &&
    typeof rawStats.genres === "number" &&
    Number.isFinite(rawStats.genres);
  const stats = hasValidStats
    ? [
        { label: bt("작품", "stories"), value: COUNT_FORMAT.format(rawStats.titles) },
        { label: bt("플랫폼", "platforms"), value: COUNT_FORMAT.format(rawStats.platforms) },
        { label: bt("장르", "genres"), value: COUNT_FORMAT.format(rawStats.genres) },
      ]
    : null;

  return (
    <div
      aria-label={bt("공개 카탈로그 요약", "Public catalog summary")}
      role="group"
      className={cn(
        "discover-hub-snapshot flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs",
        "border-line/70 text-fg-3",
      )}
    >
      {stats ? (
        <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-baseline gap-1">
              <dt className="order-2">{stat.label}</dt>
              <dd className={cn("numeral order-1 text-sm font-bold", "text-fg")}>{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : loading ? (
        <span data-slot="skeleton" aria-hidden="true" className="skeleton block h-4 w-56" />
      ) : (
        <span>{bt("카탈로그 요약을 지금은 확인할 수 없어요.", "The catalog summary isn't available right now.")}</span>
      )}
      <span className="flex flex-wrap items-center gap-x-1.5">
        {dateLabel ? <span>{`${dateLabel} ${bt("기준 공개 카탈로그", "public catalog snapshot")} ·`}</span> : null}
        <Link href="/about/data" className={cn("inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline", "text-accent")}>
          {bt("데이터 출처", "Data sources")}
        </Link>
      </span>
    </div>
  );
}

export function DiscoverHubPage() {
  const bt = useBilingual("DiscoverHubPage");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(() => urlQuery);
  const isComposingRef = useRef(false);
  const [memoryFinderOpened, setMemoryFinderOpened] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<DiscoverSerializationTrackId>("all");

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  const activeTrack =
    DISCOVER_SERIALIZATION_TRACKS.find((track) => track.id === activeTrackId) ??
    DISCOVER_SERIALIZATION_TRACKS[0];
  const home = useApiResource<DiscoverHomeSnapshot>(
    DISCOVER_HOME_SNAPSHOT_URL,
    bt("추천 작품을 불러오지 못했습니다.", "Couldn't load story picks."),
  );
  // 대표 작품이 없는 상태에는 가짜 표지나 빈 카드를 만들지 않는다.
  const showSpotlight = home.loading || (home.data != null && pickDiscoverSpotlight(home.data) != null);
  const localMatches = useMemo(
    () => (query.trim().length > 0 ? collectDiscoverLocalMatches(home.data, query, 6) : null),
    [home.data, query],
  );

  useDocumentTitle(bt("작품 탐색", "Discover"));

  const updateDiscoverQuery = (nextValue: string) => {
    setQuery(nextValue);
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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isComposingRef.current) return;
    const trimmed = query.trim();
    navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  };

  const searchLabel = bt("작품명·작가·태그 검색", "Search stories, creators or tags");

  return (
    <PageEntrance variant="rise">
    <Container size="wide" className="min-w-0 py-5 sm:py-6 lg:py-8">
      <DiscoverFacetTabStrip />
      <div className="discover-hub-hero" data-has-spotlight={showSpotlight ? "true" : "false"}>
        <div className="discover-hub-intro">
      <header className="discover-hub-header" aria-labelledby="discover-title">
        <p className="text-xs font-bold tracking-wider text-accent">DISCOVER</p>
        <h1 id="discover-title" className="discover-hub-title font-bold tracking-tight text-fg">
          {bt("새로운 이야기를 발견하세요", "Discover your next story")}
        </h1>
        <div className="mt-4">
        <form onSubmit={submit} role="search" className="discover-hub-search-form grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
          <label className="flex min-h-12 min-w-0 items-center gap-2.5 rounded-2xl border border-line-strong bg-card/90 px-3.5 focus-within:border-accent/55 focus-within:ring-2 focus-within:ring-accent/25">
            <Search size={18} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="sr-only">{searchLabel}</span>
            <input
              type="search"
              value={query}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                isComposingRef.current = false;
                updateDiscoverQuery(event.currentTarget.value);
              }}
              onChange={(event) => updateDiscoverQuery(event.target.value)}
              placeholder={searchLabel}
              enterKeyHint="search"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
            />
            {query ? (
              <button
                type="button"
                onClick={() => updateDiscoverQuery("")}
                aria-label={bt("검색어 지우기", "Clear search query")}
                className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-panel hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <button type="submit" className={buttonClass({ size: "lg", className: "min-h-12 rounded-2xl px-5 sm:px-6 text-sm font-bold" })}>
            {bt("검색", "Search")}
          </button>
        </form>
        <nav aria-label={bt("장르로 바로 찾기", "Jump in by genre")} className="mt-4">
          <ul className="discover-hub-quick-genres">
            {GENRES.slice(0, QUICK_GENRE_COUNT).map((genre) => (
              <li key={genre} className="discover-hub-quick-genre">
                <Link
                  href={`/explore?genre=${encodeURIComponent(genre)}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-line bg-card/70 px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  #{genre}
                </Link>
              </li>
            ))}
            <li className="shrink-0">
              <Link
                href="/explore"
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-accent/35 bg-accent-soft/60 px-3.5 text-xs font-bold text-accent transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                {bt("전체 장르", "All genres")}
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </nav>
        </div>
      </header>
        <CatalogSnapshotLine snapshot={home.data} loading={home.loading} />
        </div>
        {showSpotlight ? (
          <div className="discover-hub-spotlight">
            <DiscoverSpotlight snapshot={home.data} loading={home.loading} />
          </div>
        ) : null}
      </div>

      <section aria-labelledby="discover-shelves-title" className="discover-hub-shelves min-w-0">
        <h2 id="discover-shelves-title" className="sr-only">{bt("작품 둘러보기", "Browse stories")}</h2>
        {localMatches && (localMatches.titles.length > 0 || localMatches.genres.length > 0 || localMatches.tags.length > 0) ? (
          <div
            data-testid="discover-local-matches"
            className="mb-6 rounded-2xl border border-accent/35 bg-card/90 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-accent">
                {bt(`로컬 카탈로그 즉시 일치 (${localMatches.titles.length}편)`, `Instant local catalog matches (${localMatches.titles.length})`)}
              </p>
              <Link
                href={`/search?q=${encodeURIComponent(query.trim())}`}
                className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-fg-2 hover:text-accent"
              >
                {bt("전체 검색 결과 보기", "See all search results")}
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
            {localMatches.titles.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {localMatches.titles.map((item) => (
                  <TitleCard key={item.id} title={item} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-8">
          <Suspense fallback={<p role="status">{bt("추천 작품을 불러오는 중", "Loading story picks")}</p>}>
            <LazyDiscoverShelves snapshot={home.data} loading={home.loading} error={home.error} onRetry={home.reload} />
          </Suspense>
          <Suspense fallback={null}>
            <LazyDiscoverRecentShelf />
          </Suspense>
        </div>
      </section>

      <section
        aria-label={bt("연재 트랙 스위처", "Serialization track switcher")}
        data-testid="discover-serialization-track-switcher"
        className="discover-hub-tracks mt-6 rounded-2xl border border-line bg-card/85 p-2 shadow-sm"
      >
        <div>
          <div className="sr-only">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-accent">
              SERIALIZATION TRACKS · ORIGINALS / CANVAS / WUF / CUTS
            </span>
            <h2 className="mt-0.5 text-sm font-bold text-fg sm:text-base">
              {bt("연재 트랙별 바로가기", "Browse by serialization track")}
            </h2>
          </div>
          <div className="discover-hub-track-tabs" data-own-control-size="true" role="tablist" aria-label={bt("연재 트랙 선택", "Select serialization track")}>
            {DISCOVER_SERIALIZATION_TRACKS.map((track) => {
              const selected = track.id === activeTrackId;
              return (
                <button
                  key={track.id}
                  type="button"
                  role="tab"
                  id={`discover-track-${track.id}`}
                  aria-controls="discover-track-panel"
                  aria-label={bt(track.label, SERIALIZATION_TRACK_EN[track.id].label)}
                  tabIndex={selected ? 0 : -1}
                  aria-selected={selected}
                  onKeyDown={(event) => {
                    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
                    if (!keys.includes(event.key)) return;
                    event.preventDefault();
                    const index = DISCOVER_SERIALIZATION_TRACKS.findIndex((item) => item.id === track.id);
                    const count = DISCOVER_SERIALIZATION_TRACKS.length;
                    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? count - 1
                      : (index + (event.key === "ArrowRight" ? 1 : -1) + count) % count;
                    const next = DISCOVER_SERIALIZATION_TRACKS[nextIndex];
                    if (next) {
                      setActiveTrackId(next.id);
                      document.getElementById(`discover-track-${next.id}`)?.focus();
                    }
                  }}
                  onClick={() => {
                    runSameDocumentViewTransition(() => {
                      setActiveTrackId(track.id);
                    });
                  }}
                  className={cn(
                    "inline-flex min-h-11 min-w-0 items-center justify-center rounded-lg border px-1 text-[10px] font-bold transition-colors sm:text-xs",
                    selected
                      ? "border-accent bg-accent text-canvas shadow-sm"
                      : "border-line bg-panel/70 text-fg-2 hover:border-accent/45 hover:text-fg",
                  )}
                >
                  <span aria-hidden="true">{track.id === "all" ? bt("전체", "All") : track.id === "wait-free" ? "WUF" : track.id === "cuts-short" ? "CUTS" : track.badge}</span>
                </button>
              );
            })}
          </div>
        </div>
        {activeTrack ? (
          <div id="discover-track-panel" role="tabpanel" aria-labelledby={`discover-track-${activeTrack.id}`} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-3 text-xs text-fg-2">
            <div className="flex min-w-0 items-center gap-3">
              <DiscoverCardArt
                src={
                  activeTrack.id === "originals"
                    ? "/assets/site-experience/site-art-v1/cards/nb-ranking-constellation-640.webp"
                    : activeTrack.id === "canvas"
                      ? "/assets/site-experience/site-art-v1/cards/nb-community-plaza-640.webp"
                      : activeTrack.id === "wait-free"
                        ? "/assets/site-experience/site-art-v1/cards/nb-library-archive-640.webp"
                        : activeTrack.id === "cuts-short"
                          ? "/assets/site-experience/site-art-v1/cards/nb-showcase-premiere-640.webp"
                          : "/assets/site-experience/site-art-v1/cards/nb-discover-spotlight-640.webp"
                }
                fallbackLabel={activeTrack.badge}
                className="h-12 w-20 shrink-0 rounded-xl border border-line/70 object-cover"
              />
              <p className="min-w-0 max-w-2xl break-keep [overflow-wrap:anywhere]">{bt(activeTrack.description, SERIALIZATION_TRACK_EN[activeTrack.id].description)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={activeTrack.primaryRoute}
                className={buttonClass({ size: "sm", className: "min-h-11 gap-1.5 rounded-full px-4 text-xs font-bold" })}
              >
                {bt(activeTrack.label, SERIALIZATION_TRACK_EN[activeTrack.id].label)} {bt("열기", "Open")}
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
              <Link
                href={activeTrack.secondaryRoute}
                className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11 rounded-full px-3.5 text-xs font-semibold" })}
              >
                {bt(activeTrack.secondaryLabel, SERIALIZATION_TRACK_EN[activeTrack.id].secondaryLabel)}
              </Link>
            </div>
          </div>
        ) : null}
      </section>

      <Section
        className="mt-8 sm:mt-10"
        eyebrow="DISCOVERY TOOLS"
        title={bt("원하는 방식으로 찾기", "Choose how you want to find it")}
        desc={bt(
          "검색·조건 탐색·랭킹·캘린더처럼 지금 상황에 맞는 도구로 바로 이동하세요.",
          "Go straight to the tool that fits: search, filters, rankings or the release calendar.",
        )}
      >
        <StaggerReveal className="grid grid-cols-1 gap-3 sm:grid-cols-3" itemClassName="h-full">
          {DESTINATIONS.filter((destination) => ["/explore", "/ranking", "/calendar"].includes(destination.href)).map((destination) => (
            <Link key={destination.href} href={destination.href}
              className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
              <div className="relative aspect-[16/7] overflow-hidden border-b border-line">
                <DiscoverCardArt
                  src={
                    destination.href === "/ranking"
                      ? "/assets/site-experience/site-art-v1/cards/nb-ranking-constellation-640.webp"
                      : destination.href === "/calendar"
                        ? "/assets/site-experience/site-art-v1/cards/nb-library-archive-640.webp"
                        : "/assets/site-experience/site-art-v1/cards/nb-discover-spotlight-640.webp"
                  }
                  fallbackLabel={bt(...destination.title)}
                  className="size-full object-cover"
                />
                <span className="absolute bottom-2 left-2 rounded-md bg-canvas/90 px-2 py-1 text-[10px] font-semibold text-fg">
                  {bt("탐색 안내 이미지", "Discovery guide illustration")}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <span className="flex items-center justify-between gap-2">
                  <strong className="break-keep text-base text-fg">{bt(...destination.title)}</strong>
                  <ArrowRight size={16} className="shrink-0 text-accent" aria-hidden="true" />
                </span>
                <span className="break-keep text-sm text-fg-2">{bt(...destination.body)}</span>
              </div>
            </Link>
          ))}
        </StaggerReveal>
        <SiteDisclosure className="mt-4" icon={Compass} title={bt("더 많은 탐색 도구", "More discovery tools")}>
          <SiteContextualSubNav pathnameOverride="/discover" className="mb-4" />
        <nav aria-label={bt("상황별 빠른 탐색", "Quick discovery presets")} className="mt-2.5">
          <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            {QUICK_DISCOVERY_PRESETS.map((preset) => (
              <li key={preset.href} className="shrink-0">
                <Link
                  href={preset.href}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line/80 bg-panel/70 px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  {bt(...preset.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DESTINATIONS.filter((destination) => !["/explore", "/ranking", "/calendar"].includes(destination.href)).map((destination) => (
              <SiteLinkCard key={destination.href} layout="tile" href={destination.href} icon={destination.icon}
                title={bt(...destination.title)} description={bt(...destination.body)}
                className={cn("h-full", destination.highlight ? "border-accent/45 bg-accent-soft/50" : undefined)} />
            ))}
          </div>
        </SiteDisclosure>
        <SiteDisclosure
          className="mt-4"
          id="memory-finder"
          icon={NotebookPen}
          title={bt("제목이 기억나지 않으세요?", "Can't remember the title?")}
          summary={bt(
            "기억나는 장면이나 줄거리만 적으면 후보를 찾아 드려요. 확인된 것과 짐작한 것을 나눠서 말해요.",
            "Describe a scene or the plot and I'll look for candidates — separating what is confirmed from what is a guess.",
          )}
          onToggle={(open) => {
            if (open) setMemoryFinderOpened(true);
          }}
        >
          {memoryFinderOpened ? (
            <Suspense fallback={<p role="status" className="text-sm text-fg-2">{bt("불러오는 중…", "Loading…")}</p>}>
              <LazyMemoryFinderSection />
            </Suspense>
          ) : null}
        </SiteDisclosure>
        <SiteDisclosure
          className="mt-4"
          icon={HelpCircle}
          title={bt("처음이라면 30초 안내", "New here? A 30-second guide")}
          summary={bt("기능 이름을 외우지 않아도 지금 상황에 맞는 방법만 고르면 돼요.", "Pick the route that matches your situation — no feature names to memorize.")}
        >
          <SiteArtSurfaceSpotlight cardId="nb-discover-spotlight" compact className="mb-4" />
          <SiteStepList
            steps={[
              bt("찾는 제목이 있으면 위 검색창에 바로 입력합니다.", "If you know the title, type it into the search field above."),
              bt("제목이 없으면 장르나 조건 탐색, 맞춤 추천을 고릅니다.", "If you only know your taste, pick a genre, Explore or Recommendations."),
              bt("결정이 어렵다면 랭킹·랜덤·비교로 후보를 줄입니다.", "If choosing is hard, narrow candidates with Rankings, Random or Compare."),
            ]}
          />
        </SiteDisclosure>
      </Section>
    </Container>
    </PageEntrance>
  );
}
