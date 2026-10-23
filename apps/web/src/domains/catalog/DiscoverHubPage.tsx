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
  type LucideIcon,
} from "lucide-react";
import { Suspense, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { sitePageHeaderArtFor, sitePageHeaderArtPlacementFor } from "@/domains/legal/public/site-page-header-art";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
import { RevealOnScroll } from "@/shared/components/reveal-on-scroll";
import { StaggerReveal } from "@/shared/components/stagger-reveal";
import { SiteStepList } from "@/domains/legal/public/site-step-list";
import { Container, Section } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { GENRES } from "@/shared/lib/taxonomy";
import Link from "@/shared/navigation/router-link";
import { useApiResource } from "@/platform/use-api-resource";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { cn } from "@/shared/lib/utils";

import { DiscoverSpotlight } from "./DiscoverSpotlight";
import {
  DISCOVER_HOME_SNAPSHOT_URL,
  pickDiscoverSpotlight,
  snapshotDateLabel,
  type DiscoverHomeSnapshot,
} from "./discover-home";

/** 헤더에서 바로 누를 수 있는 장르 수 — 나머지는 "전체 장르"(탐색)로 이어진다. */
const QUICK_GENRE_COUNT = 8;
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

/**
 * 공개 카탈로그 요약 한 줄 — 작품·플랫폼·장르 수와 기준일, 데이터 출처.
 * 대표 작품 카드가 히어로 오른쪽을 차지하므로 수치는 검색 아래 한 줄로 둔다.
 * 스포트라이트가 없을 때 헤더는 배너형이 되므로, 그 경우(`onArt`) 스크림 위
 * 밝은 글자 톤으로 갈아 신는다.
 */
function CatalogSnapshotLine({ snapshot, loading, onArt }: { readonly snapshot: DiscoverHomeSnapshot | null; readonly loading: boolean; readonly onArt: boolean }) {
  const bt = useBilingual("DiscoverHubPage");
  const dateLabel = snapshot ? snapshotDateLabel(snapshot.generatedAt) : null;
  const stats = snapshot
    ? [
        { label: bt("작품", "stories"), value: COUNT_FORMAT.format(snapshot.stats.titles) },
        { label: bt("플랫폼", "platforms"), value: COUNT_FORMAT.format(snapshot.stats.platforms) },
        { label: bt("장르", "genres"), value: COUNT_FORMAT.format(snapshot.stats.genres) },
      ]
    : null;

  return (
    <div
      aria-label={bt("공개 카탈로그 요약", "Public catalog summary")}
      role="group"
      className={cn(
        "mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-4 text-xs",
        onArt ? "border-white/25 text-white/70" : "border-line/70 text-fg-3",
      )}
    >
      {stats ? (
        <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-baseline gap-1">
              <dt className="order-2">{stat.label}</dt>
              <dd className={cn("numeral order-1 text-sm font-bold", onArt ? "text-white" : "text-fg")}>{stat.value}</dd>
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
        <Link href="/about/data" className={cn("inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline sm:min-h-0", onArt ? "text-white" : "text-accent")}>
          {bt("데이터 출처", "Data sources")}
        </Link>
      </span>
    </div>
  );
}

export function DiscoverHubPage() {
  const bt = useBilingual("DiscoverHubPage");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [memoryFinderOpened, setMemoryFinderOpened] = useState(false);
  const home = useApiResource<DiscoverHomeSnapshot>(
    DISCOVER_HOME_SNAPSHOT_URL,
    bt("추천 작품을 불러오지 못했습니다.", "Couldn't load story picks."),
  );
  // 대표 작품을 못 고르면 히어로 오른쪽 칸을 비운 채로 두지 않는다 — 칸 자체를 빼서 제목 영역이 넓어지게 한다.
  const showSpotlight = home.loading || (home.data != null && pickDiscoverSpotlight(home.data) != null);

  useDocumentTitle(bt("작품 탐색", "Discover"));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  };

  const searchLabel = bt("작품명·작가·태그 검색", "Search stories, creators or tags");

  return (
    <PageEntrance variant="rise">
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <SitePageHeader
        size="hero"
        icon={Compass}
        eyebrow="DISCOVER"
        title={bt("다음 컷의 영감은, 새로운 이야기에서.", "Find the story that sparks your next panel.")}
        description={bt(
          "작품 찾기를 시작하는 곳입니다. 작품·작가·태그로 검색하거나 장르로 바로 들어가 보세요. 요일 연재와 평점 높은 작품은 아래에서 바로 볼 수 있고, 조건을 좁혀 찾고 싶으면 '조건으로 탐색'으로 이어집니다.",
          "This is where finding a story starts. Search by title, creator or tag, or jump in by genre. Weekly serials and top-rated stories are right below — and when you want to narrow by conditions, the filter explorer continues from here.",
        )}
        aside={showSpotlight ? <DiscoverSpotlight snapshot={home.data} loading={home.loading} /> : undefined}
        art={sitePageHeaderArtFor("/discover")}
        artPlacement={sitePageHeaderArtPlacementFor("/discover")}
        asideSize="wide"
        actions={
          <Link href="/research" className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11 gap-1.5 text-accent" })}>
            {bt("내 웹툰을 위한 참고자료 찾기", "Find references for your webtoon")}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        }
      >
        <form onSubmit={submit} role="search" className="grid max-w-2xl gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex min-h-12 min-w-0 items-center gap-3 rounded-2xl border border-line-strong bg-card/90 px-4 focus-within:border-accent/55 focus-within:ring-2 focus-within:ring-accent/25">
            <Search size={18} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="sr-only">{searchLabel}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchLabel}
              enterKeyHint="search"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
            />
          </label>
          <button type="submit" className={buttonClass({ size: "lg", className: "min-h-12 rounded-2xl px-6 text-sm font-bold" })}>
            {bt("검색", "Search")}
          </button>
        </form>
        <nav aria-label={bt("장르로 바로 찾기", "Jump in by genre")} className="mt-4">
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            {GENRES.slice(0, QUICK_GENRE_COUNT).map((genre) => (
              <li key={genre} className="shrink-0">
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
        <nav aria-label={bt("상황별 빠른 탐색", "Quick discovery presets")} className="mt-2.5">
          <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            {QUICK_DISCOVERY_PRESETS.map((preset) => (
              <li key={preset.href} className="shrink-0">
                <Link
                  href={preset.href}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line/80 bg-panel/70 px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  {bt(...preset.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <CatalogSnapshotLine snapshot={home.data} loading={home.loading} onArt={!showSpotlight} />
      </SitePageHeader>

      <section aria-labelledby="discover-shelves-title" className="mt-10 flex flex-col gap-12 sm:mt-12 sm:gap-14">
        <h2 id="discover-shelves-title" className="sr-only">{bt("작품 둘러보기", "Browse stories")}</h2>
        <RevealOnScroll>
          <Suspense fallback={null}>
            <LazyDiscoverRecentShelf />
          </Suspense>
        </RevealOnScroll>
        <RevealOnScroll>
          <Suspense fallback={null}>
            <LazyDiscoverShelves snapshot={home.data} loading={home.loading} error={home.error} onRetry={home.reload} />
          </Suspense>
        </RevealOnScroll>
      </section>

      <Section
        className="mt-14 sm:mt-16"
        eyebrow="DISCOVERY TOOLS"
        title={bt("원하는 방식으로 찾기", "Choose how you want to find it")}
        desc={bt(
          "검색·조건 탐색·랭킹·캘린더처럼 지금 상황에 맞는 도구로 바로 이동하세요.",
          "Go straight to the tool that fits: search, filters, rankings or the release calendar.",
        )}
      >
        <StaggerReveal className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-5" itemClassName="h-full">
          {DESTINATIONS.map((destination) => (
            <SiteLinkCard
              key={destination.href}
              layout="tile"
              href={destination.href}
              icon={destination.icon}
              title={bt(...destination.title)}
              description={bt(...destination.body)}
              className={cn("h-full", destination.highlight ? "border-accent/45 bg-accent-soft/50" : undefined)}
            />
          ))}
        </StaggerReveal>
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
