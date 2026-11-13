import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  BellRing,
  BookOpen,
  ChartColumn,
  Clock3,
  Coins,
  Crown,
  Film,
  Images,
  KeyRound,
  Layers,
  Library,
  Mail,
  PlayCircle,
  Search,
  Settings,
  Store,
  UserRound,
} from "lucide-react";
import { useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { MySpaceVaultAndRestBar } from "./MySpaceVaultAndRestBar";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { FriendlyQuickGuide } from "@/shared/components/purpose-experience-stage";
import { LoadingState } from "@/shared/components/LoadingState";
import { SectionArt } from "@/shared/components/section-art";
import { Container } from "@/shared/components/section";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  creatorDestinationLabel,
  creatorRecentDestinationDescription,
  getCreatorContinuityServerSnapshot,
  getCreatorContinuitySnapshot,
  subscribeCreatorContinuity,
} from "@/shared/lib/creator-continuity";
import { useI18n } from "@/shared/lib/i18n";
import { useApp, useHydrated } from "@/shared/lib/store";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("MySpaceHubPage", ko, en);

type MySpaceCategory = "all" | "reader" | "creator" | "account";
const VALID_CATEGORIES: readonly MySpaceCategory[] = ["all", "reader", "creator", "account"];

function isMySpaceCategory(value: string): value is MySpaceCategory {
  return (VALID_CATEGORIES as readonly string[]).includes(value);
}

const COPY = {
  ko: {
    eyebrow: "MY SPACE",
    title: "내 작업과 기록을 한곳에서.",
    body: "프로젝트, 공개한 작품, 서재, 에셋, 활동과 설정을 각각 찾지 않아도 됩니다. 내 공간에서 필요한 다음 화면으로 바로 이동하세요.",
    syncLocal: "현재 기록은 이 브라우저를 중심으로 보관됩니다. 로그인하면 지원되는 데이터는 계정과 이어집니다.",
    syncAccount: "로그인한 계정과 이 브라우저의 작업을 이어서 사용할 수 있습니다. 프로젝트별 저장 위치는 각 작업공간에서 확인하세요.",
    statsLoading: "내 활동 요약을 불러오는 중",
    open: "열기",
    section: "내 공간 바로가기",
    filterLabel: "내 공간 역할별 보기",
    chooseBody: "독자·창작·계정 중 필요한 목적을 고르면 해당 바로가기만 보여 드립니다.",
    roleDescriptions: { reader: "서재 · 감상 기록 · 구독", creator: "프로젝트 · 작품 · 에셋 · 수익", account: "프로필 · 메시지 · 설정 · AI 연결" },
    searchLabel: "내 공간 바로가기 필터",
    searchPlaceholder: "바로가기 이름·설명 찾기",
    searchToggleShort: "검색",
    searchToggleOpen: "바로가기 검색 열기",
    searchToggleClose: "바로가기 검색 닫기",
    moreGuideSummary: "내 공간 안내·동기화 상태·세부 탐색 더보기",
    filterEmptyTitle: "선택한 조건에 맞는 바로가기가 없습니다 (0건)",
    filterEmptyBody: "검색어나 역할 필터를 초기화하면 전체 바로가기 14개를 다시 볼 수 있습니다.",
    filterResetAction: "전체 보기로 돌아가기",
    coverFallbackNotice: "일부 표지 이미지를 불러오지 못해 원본 표지 대신 텍스트 안내 카드로 대체 표시합니다.",
    recentFallbackTitle: "최근 작업 공간",
    recentFallbackBody: "이전에 열었던 화면으로 바로 이어서 이동합니다.",
    justNow: "방금 전",
    filters: [
      ["all", "전체 보기"],
      ["reader", "독자·감상"],
      ["creator", "창작·스튜디오"],
      ["account", "계정·AI 설정"],
    ] as const,
    stats: ["읽기 상태", "평가", "컬렉션"],
    guideTitle: "내 데이터가 어디에 있는지 헷갈린다면",
    guideBody: "브라우저 기록, 계정 데이터, Studio 프로젝트는 역할이 다릅니다. 이 기준만 기억하면 됩니다.",
    guideSteps: [
      "Studio 프로젝트는 프로젝트 센터에서 저장·복구·공유 상태를 확인합니다.",
      "작품 감상 기록과 컬렉션은 내 서재에서 관리합니다.",
      "설치한 에셋과 관심 에셋은 마켓의 내 에셋에서 관리합니다.",
    ],
    continueEyebrow: "CONTINUE WORK",
    continueTitle: "가장 최근 작업부터 이어가세요",
    continueAction: "이어서 작업",
    revisitTitle: "최근에 보던 곳으로 돌아가기",
    revisitAction: "이어서 보기",
    allProjects: "모든 프로젝트",
    emptyTitle: "아직 이어갈 Studio 작업이 없습니다",
    emptyBody: "새 작품을 만들거나 기존 파일을 가져오세요. 먼저 살펴보고 싶다면 실제 제작 흐름과 분리된 샘플 프로젝트를 열 수 있습니다.",
    createAction: "작품 시작하기",
    importAction: "기존 파일 가져오기",
    sampleAction: "10분 샘플로 보기",
    quickTitle: "바로 확인할 것",
    quickActions: [
      ["알림", "협업 요청과 프로젝트 변경을 확인", "/notifications"],
      ["학습", "막힌 제작 단계의 실습을 이어가기", "/learn"],
      ["내 에셋", "설치·저장한 작업 재료 정리", "/market/library"],
    ],
    destinations: [
      ["프로젝트", "최근 프로젝트, 로컬 초안, 공유 작업, 버전과 복구", "/studio", "creator"],
      ["내 작품", "공개한 창작물과 시리즈, 작성자 활동", "/me?tab=posts", "creator"],
      ["내 서재", "읽고 싶음·읽는 중·완독·평가·컬렉션", "/library", "reader"],
      ["내 에셋", "설치·보관한 Studio 리소스와 관심 에셋", "/market/library", "creator"],
      ["내 활동", "리뷰, 읽기 상태, 컬렉션 등 활동 요약", "/me?tab=activity", "reader"],
      ["프로필", "이름, 소개, 아바타와 공개 프로필", "/me?tab=profile", "account"],
      ["메시지", "작품 피드백, 협업 제안과 비공개 문의", "/messages", "account"],
      ["설정", "언어, 기록, 필터, 데이터 가져오기·내보내기", "/settings", "account"],
      ["AI 연결 설정", "캐릭터 토크·스튜디오 보조용 내 AI 키(BYOK) 관리", "/settings/ai", "account"],
      ["에셋 포인트·정산", "에셋 구매 포인트 지갑 및 판매·컷츠 리워드 내역", "/asset-points", "creator"],
      ["창작자 수익·멤버십", "후원·멤버십·선공개·마켓 수익 집계와 티어 설정", "/creator/revenue", "creator"],
      ["구독 중인 멤버십", "내가 후원·구독 중인 창작자 멤버십과 혜택 관리", "/memberships", "reader"],
      ["뉴스레터 구독·발송", "구독 중인 작가 소식지 관리 및 새 화 뉴스레터 발송", "/newsletter", "reader"],
      ["홍보 영상 스튜디오", "작품 티저·트레일러 영상 제작 및 홍보 게시판 연결", "/showcase/promo", "creator"],
    ] as const,
  },
  en: {
    eyebrow: "MY SPACE",
    title: "Keep your work and history in one place.",
    body: "You should not have to hunt separately for projects, published work, library data, assets, activity and settings. My Space connects the next destination directly.",
    syncLocal: "Current history is primarily stored in this browser. Sign in to continue supported data with your account.",
    syncAccount: "Continue with your signed-in account and work available in this browser. Check each workspace for project-specific storage details.",
    statsLoading: "Loading your activity summary",
    open: "Open",
    section: "My Space destinations",
    filterLabel: "Filter My Space by role",
    chooseBody: "Choose reading, creating or account tasks to see the destinations you need.",
    roleDescriptions: { reader: "Library, reading history and subscriptions", creator: "Projects, works, assets and earnings", account: "Profile, messages, settings and AI connections" },
    searchLabel: "Filter My Space destinations",
    searchPlaceholder: "Find by destination name or description",
    searchToggleShort: "Search",
    searchToggleOpen: "Open destination search",
    searchToggleClose: "Close destination search",
    moreGuideSummary: "More My Space guide, sync status & sub-navigation",
    filterEmptyTitle: "No destinations match the selected filter (0 results)",
    filterEmptyBody: "Reset the search or role filter to view all 14 destinations again.",
    filterResetAction: "Show all destinations",
    coverFallbackNotice: "Some cover images failed to load; showing a text fallback card instead of the original cover.",
    recentFallbackTitle: "Recent workspace",
    recentFallbackBody: "Return directly to the screen you opened earlier.",
    justNow: "Just now",
    filters: [
      ["all", "All"],
      ["reader", "Reading"],
      ["creator", "Creator & Studio"],
      ["account", "Account & AI"],
    ] as const,
    stats: ["Reading states", "Ratings", "Collections"],
    guideTitle: "If you are unsure where your data lives",
    guideBody: "Browser history, account data and Studio projects have different roles. Remember these three rules.",
    guideSteps: [
      "Use Project Center to check save, recovery and sharing state for Studio projects.",
      "Manage reading history and collections in My Library.",
      "Manage installed and bookmarked assets in Market > My Assets.",
    ],
    continueEyebrow: "CONTINUE WORK",
    continueTitle: "Continue from your most recent work",
    continueAction: "Continue working",
    revisitTitle: "Return to where you left off",
    revisitAction: "Continue browsing",
    allProjects: "All projects",
    emptyTitle: "There is no Studio work to continue yet",
    emptyBody: "Create a new work or bring in an existing file. You can also open the isolated sample project to inspect the complete production flow first.",
    createAction: "Start a work",
    importAction: "Import an existing file",
    sampleAction: "Explore the 10-minute sample",
    quickTitle: "Check next",
    quickActions: [
      ["Notifications", "Review collaboration requests and project changes", "/notifications"],
      ["Learning", "Continue a hands-on lesson for a blocked production step", "/learn"],
      ["My assets", "Organize installed and saved production materials", "/market/library"],
    ],
    destinations: [
      ["Projects", "Recent projects, local drafts, shared work, versions and recovery", "/studio", "creator"],
      ["My works", "Published creator works, series and author activity", "/me?tab=posts", "creator"],
      ["My library", "Want to read, reading, completed, ratings and collections", "/library", "reader"],
      ["My assets", "Installed and saved Studio resources plus bookmarked assets", "/market/library", "creator"],
      ["My activity", "Reviews, reading states, collections and activity summary", "/me?tab=activity", "reader"],
      ["Profile", "Name, bio, avatar and public profile", "/me?tab=profile", "account"],
      ["Messages", "Private feedback, collaboration proposals and inquiries", "/messages", "account"],
      ["Settings", "Language, history, filters and data import/export", "/settings", "account"],
      ["AI connection", "Manage your own AI keys (BYOK) for Character Talk and Studio", "/settings/ai", "account"],
      ["Points & rewards", "Asset point wallet, sales and Cuts reward history", "/asset-points", "creator"],
      ["Creator revenue & tiers", "Track tips, memberships, early access and market revenue", "/creator/revenue", "creator"],
      ["My memberships", "Manage your active creator memberships and supporter perks", "/memberships", "reader"],
      ["Newsletters", "Manage author newsletter subscriptions and send episode updates", "/newsletter", "reader"],
      ["Promo video studio", "Create work teasers and trailers and share to the promo board", "/showcase/promo", "creator"],
    ] as const,
  },
} as const;

const ICONS = [Layers, Images, Library, Store, BookOpen, UserRound, Mail, Settings, KeyRound, Coins, ChartColumn, Crown, Mail, Film] as const;
const QUICK_ICONS = [BellRing, BookOpen, Store] as const;

function visitTimeLabel(value: number, locale: "ko" | "en"): string {
  if (!Number.isFinite(value) || value <= 0) {
    return locale === "ko" ? COPY.ko.justNow : COPY.en.justNow;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return locale === "ko" ? COPY.ko.justNow : COPY.en.justNow;
  }
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * 개인 정본 허브 (BLUEPRINT §1.2). "내 것"의 유일한 시작점이며 조망 전용이다 —
 * 실제 작업은 각 모듈 표면(/library·/market/library·/me)에서 하고, 모듈 상단의
 * 공통 크롬(MySpaceModuleChrome)이 여기로 돌아온다. /home은 개인 공간이 아닌 작업 홈이다.
 */
export function MySpaceHubPage() {
  useBilingualI18nRevision();

  const copy = bi(COPY.ko, COPY.en);
  const locale = useI18n((state) => state.lang.startsWith("ko") ? "ko" : "en");
  const hydrated = useHydrated();
  const { status: sessionStatus } = useSession();
  const reads = useApp((state) => state.reads);
  const ratings = useApp((state) => state.ratings);
  const collections = useApp((state) => state.collections);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const roleFilter = searchParams.get("role")?.trim().toLowerCase() || "choose";
  const filterQuery = searchParams.get("q") ?? "";
  const [searchOpen, setSearchOpen] = useState<boolean>(() => Boolean(filterQuery));
  const [brokenCoverRecovered, setBrokenCoverRecovered] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const chipRefs = useRef<Record<MySpaceCategory, HTMLButtonElement | null>>({
    all: null,
    reader: null,
    creator: null,
    account: null,
  });
  const continuity = useSyncExternalStore(
    subscribeCreatorContinuity,
    getCreatorContinuitySnapshot,
    getCreatorContinuityServerSnapshot,
  );

  useDocumentTitle(bi("내 공간", "My Space"));

  const stats = hydrated
    ? [
        reads && typeof reads === "object" ? Object.keys(reads).length : 0,
        ratings && typeof ratings === "object" ? Object.keys(ratings).length : 0,
        Array.isArray(collections) ? collections.length : 0,
      ]
    : [0, 0, 0];
  const hasActivity = hydrated && stats.some((value) => value > 0);
  const syncCopy = sessionStatus === "authenticated" ? copy.syncAccount : copy.syncLocal;
  const validRecentEntries = Array.isArray(continuity?.recent)
    ? continuity.recent.filter(
        (entry) => Boolean(entry && typeof entry.href === "string" && entry.href.trim().startsWith("/")),
      )
    : [];
  const recent = validRecentEntries.find((entry) => entry.id === "studio")
    ?? validRecentEntries[0]
    ?? null;

  const studioRecent = recent?.id === "studio";
  const recentTitle = recent
    ? (creatorDestinationLabel(recent.id, locale)?.trim() || copy.recentFallbackTitle)
    : "";
  const recentDescription = recent
    ? (creatorRecentDestinationDescription(recent, locale)?.trim() || copy.recentFallbackBody)
    : "";

  const normalizedQuery = filterQuery.trim().toLowerCase();
  const visibleDestinations = copy.destinations
    .map((entry, index) => ({ entry, icon: ICONS[index] }))
    .filter(({ entry }) => {
      const matchesRole = roleFilter === "all" || roleFilter === "choose" || entry[3] === roleFilter;
      if (!matchesRole) return false;
      if (!normalizedQuery) return true;
      return (
        entry[0].toLowerCase().includes(normalizedQuery)
        || entry[1].toLowerCase().includes(normalizedQuery)
        || entry[2].toLowerCase().includes(normalizedQuery)
      );
    });

  const activeFilterLabel = copy.filters.find(([id]) => id === roleFilter)?.[1] ?? copy.filters[0][1];
  const isFilterActive = (roleFilter !== "all" && roleFilter !== "choose") || normalizedQuery.length > 0;
  const showDestinations = roleFilter !== "choose" || normalizedQuery.length > 0;
  const showDestinationSearch = searchOpen || normalizedQuery.length > 0 || (showDestinations && visibleDestinations.length === 0);
  const orderedFilters = showDestinations ? copy.filters : [...copy.filters.slice(1), copy.filters[0]];

  function writeFilterParams(patch: Readonly<Record<string, string | null>>, replace = false) {
    const nextParams = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) nextParams.set(key, value);
      else nextParams.delete(key);
    }
    navigate({ pathname: location.pathname, search: nextParams.toString(), hash: location.hash }, {
      replace, state: location.state, preventScrollReset: true,
    });
  }

  function selectRoleFilter(nextRole: MySpaceCategory, focusChip = false) {
    writeFilterParams({ role: nextRole });
    if (focusChip) {
      chipRefs.current[nextRole]?.focus();
    }
  }

  function resetAllFilters() {
    setSearchOpen(false);
    writeFilterParams({ role: "all", q: null });
    chipRefs.current.all?.focus();
  }

  function onFilterChipKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      resetAllFilters();
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      event.stopPropagation();
      setSearchOpen(true);
      queueMicrotask(() => searchInputRef.current?.focus());
      return;
    }
    const order = copy.filters.map(([id]) => id);
    const currentIndex = isMySpaceCategory(roleFilter) ? order.indexOf(roleFilter) : 0;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = order[(currentIndex + 1) % order.length] ?? "all";
      selectRoleFilter(next, true);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const prev = order[(currentIndex - 1 + order.length) % order.length] ?? "all";
      selectRoleFilter(prev, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectRoleFilter("all", true);
    } else if (event.key === "End") {
      event.preventDefault();
      const last = order[order.length - 1] ?? "account";
      selectRoleFilter(last, true);
    }
  }

  return (
    <Container size="wide" className="py-2 sm:py-6 lg:py-8">
      <div
        data-testid="my-space-hub-root"
        data-broken-image-recovered={brokenCoverRecovered ? "true" : undefined}
        className="min-w-0 [overflow-wrap:anywhere]"
        onErrorCapture={(event) => {
          const target = event.target;
          if (target instanceof HTMLImageElement) {
            target.setAttribute("data-broken-image", "true");
            target.setAttribute("alt", copy.coverFallbackNotice);
            target.style.opacity = "0";
            setBrokenCoverRecovered(true);
          }
        }}
      >
        <SitePageHeader
          size="default"
          surface="panel"
          icon={UserRound}
          eyebrow={copy.eyebrow}
          title={copy.title}
          className="p-4 sm:p-5 lg:p-6 [&_h1]:mt-1 [&_h1]:text-lg sm:[&_h1]:text-2xl [&>div]:gap-4 [&>div>div>div]:mt-2"
          aside={
            <div className="relative overflow-hidden rounded-2xl border border-line bg-panel/60">
              <SectionArt
                image="studio-lobby"
                className="aspect-[16/10] w-full rounded-2xl border border-line object-cover"
              />
            </div>
          }
          asideClassName="hidden lg:block"
        >
          {brokenCoverRecovered ? (
            <p
              role="status"
              data-testid="my-space-cover-fallback"
              className="max-w-2xl rounded-xl border border-line bg-panel/70 px-3 py-2 text-xs text-fg-2"
            >
              {copy.coverFallbackNotice}
            </p>
          ) : null}
        </SitePageHeader>

        <section
          className="mt-2.5"
          aria-label={recent ? (studioRecent ? copy.continueTitle : copy.revisitTitle) : copy.emptyTitle}
          data-my-space-next-action="true"
        >
          {recent ? (
            <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft/65 via-card to-panel p-3 shadow-sm sm:p-5">
              <div className="relative grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="eyebrow text-accent">{copy.continueEyebrow}</p>
                    <span className="inline-flex items-center gap-1 text-[0.68rem] font-bold text-fg-2">
                      <Clock3 size={12} aria-hidden="true" />
                      {visitTimeLabel(recent.visitedAt, locale)}
                    </span>
                  </div>
                  <h2 className="mt-0.5 break-keep text-sm font-bold tracking-tight text-fg sm:text-xl">
                    {studioRecent ? copy.continueTitle : copy.revisitTitle}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-1.5 lg:row-span-2 lg:max-w-56 lg:flex-col">
                  <Link
                    href={recent.href}
                    data-testid="my-space-primary-action"
                    className={buttonClass({ size: "sm", className: "min-h-11 flex-1 px-3 text-xs lg:w-full" })}
                  >
                    {studioRecent ? copy.continueAction : copy.revisitAction}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                  <Link
                    href="/studio"
                    className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 flex-1 px-3 text-xs lg:w-full" })}
                  >
                    {copy.allProjects}
                  </Link>
                </div>
                <div className="flex min-w-0 items-start gap-2 rounded-xl border border-line bg-card/70 p-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent-soft text-accent">
                    <PlayCircle size={16} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <strong
                      data-testid="my-space-recent-title"
                      className="block break-words [overflow-wrap:anywhere] text-xs leading-snug text-fg sm:text-sm"
                    >
                      {recentTitle}
                    </strong>
                    <p
                      data-testid="my-space-recent-description"
                      className="mt-0.5 break-words [overflow-wrap:anywhere] text-[11px] leading-4 text-fg-2 sm:text-xs"
                    >
                      {recentDescription}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <ActionableEmptyState
              art="none"
              icon={Layers}
              title={copy.emptyTitle}
              description={copy.emptyBody}
              primary={{ href: "/create", label: copy.createAction }}
              secondary={{ href: "/studio/import", label: copy.importAction }}
              sample={{ href: "/production/projects/sample-project/overview", label: copy.sampleAction }}
              className="p-3 sm:p-5 [&_h2]:text-sm sm:[&_h2]:text-lg [&_p]:mt-1 [&_p]:text-xs [&_p]:leading-4 [&>div]:gap-2 [&>div>span]:hidden sm:[&>div>span]:grid [&>div>div>div]:mt-2"
            />
          )}
        </section>

        <section className="mt-3.5" aria-labelledby="my-space-destinations">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-2">
              <h2 id="my-space-destinations" className="text-base font-bold tracking-tight text-fg sm:text-xl">{copy.section}</h2>
              {isFilterActive ? (
                <p
                  data-testid="my-space-filter-status"
                  aria-live="polite"
                  className="text-xs text-fg-2"
                >
                  {`${activeFilterLabel} · ${visibleDestinations.length} / ${copy.destinations.length}`}
                </p>
              ) : null}
            </div>
            <div className={showDestinations ? "flex flex-wrap items-center gap-1.5" : "w-full space-y-3"}>
              {showDestinationSearch ? (
                <input
                  id="my-space-destination-search"
                  ref={searchInputRef}
                  type="search"
                  value={filterQuery}
                  onChange={(event) => writeFilterParams({ q: event.target.value }, true)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      resetAllFilters();
                    }
                  }}
                  aria-label={copy.searchLabel}
                  placeholder={copy.searchPlaceholder}
                  data-testid="my-space-destination-search"
                  className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-card px-3.5 py-2 text-xs text-fg placeholder:text-fg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-52 sm:flex-none"
                />
              ) : null}
              <div
                role="group"
                aria-label={copy.filterLabel}
                className={showDestinations ? "flex flex-wrap gap-1.5" : "grid w-full gap-2 sm:grid-cols-3"}
              >
                {orderedFilters.map(([id, label]) => (
                  <button
                    key={id}
                    ref={(node) => {
                      chipRefs.current[id] = node;
                    }}
                    type="button"
                    data-testid={`my-space-role-filter-${id}`}
                    aria-pressed={roleFilter === id}
                    onClick={() => selectRoleFilter(id)}
                    onKeyDown={onFilterChipKeyDown}
                    className={buttonClass({
                      variant: roleFilter === id ? undefined : "outline",
                      size: "sm",
                      className: showDestinations || id === "all"
                        ? "h-auto min-h-11 min-w-11 [min-block-size:2.75rem]! [min-inline-size:2.75rem]! max-w-full whitespace-normal rounded-full px-3 py-1.5 text-center text-xs leading-snug"
                        : "h-auto min-h-11 min-w-11 [min-block-size:5rem]! flex-col items-start gap-1 whitespace-normal rounded-xl px-4 py-3 text-start text-sm",
                    })}
                  >
                    <span>{label}</span>
                    {!showDestinations && id !== "all" ? <span className="text-xs font-normal text-fg-2">{copy.roleDescriptions[id]}</span> : null}
                  </button>
                ))}
              </div>
              <button
                type="button"
                data-testid="my-space-search-toggle"
                aria-expanded={showDestinationSearch}
                aria-controls="my-space-destination-search"
                aria-label={showDestinationSearch ? copy.searchToggleClose : copy.searchToggleOpen}
                onClick={() => {
                  if (showDestinationSearch) {
                    setSearchOpen(false);
                    writeFilterParams({ q: null });
                  } else {
                    setSearchOpen(true);
                    queueMicrotask(() => searchInputRef.current?.focus());
                  }
                }}
                className={buttonClass({
                  variant: showDestinationSearch ? undefined : "outline",
                  size: "sm",
                  className:
                    "h-auto min-h-11 min-w-11 [min-block-size:2.75rem]! [min-inline-size:2.75rem]! inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs leading-snug",
                })}
              >
                <Search size={13} aria-hidden="true" />
                <span>{copy.searchToggleShort}</span>
              </button>
            </div>
          </div>
          {!showDestinations ? <p className="mt-3 text-sm text-fg-2">{copy.chooseBody}</p> : visibleDestinations.length > 0 ? (
            <div data-testid="my-space-destination-results" className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              {visibleDestinations.map(({ entry: [title, body, href], icon }) => (
                <SiteLinkCard key={href} href={href} icon={icon} title={title} description={body} cta={copy.open} />
              ))}
            </div>
          ) : (
            <div
              role="status"
              aria-live="polite"
              data-testid="my-space-filter-empty"
              className="mt-3 flex flex-col items-start justify-between gap-3 rounded-2xl border border-dashed border-line bg-panel/45 p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-fg">{copy.filterEmptyTitle}</p>
                <p className="mt-1 text-xs leading-5 text-fg-2">{copy.filterEmptyBody}</p>
              </div>
              <button
                type="button"
                data-testid="my-space-filter-reset"
                onClick={resetAllFilters}
                className={buttonClass({
                  variant: "outline",
                  size: "sm",
                  className:
                    "h-auto min-h-11 min-w-11 [min-block-size:2.75rem]! [min-inline-size:2.75rem]! shrink-0 rounded-full px-4 py-2 text-xs font-semibold",
                })}
              >
                {copy.filterResetAction}
              </button>
            </div>
          )}
        </section>

        {!hydrated ? (
          <LoadingState variant="skeleton" label={copy.statsLoading} className="mt-4 max-w-2xl" />
        ) : hasActivity ? (
          <dl className="mt-4 grid max-w-2xl grid-cols-3 gap-2" data-my-space-activity-summary="true">
            {copy.stats.map((label, index) => (
              <div key={label} className="flex min-w-0 flex-col rounded-xl border border-line bg-card/70 p-2.5">
                <dt className="order-2 mt-0.5 text-[0.68rem] text-fg-2 sm:text-xs">{label}</dt>
                <dd className="numeral order-1 text-lg font-bold text-fg sm:text-xl">{stats[index]}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-4 rounded-2xl border border-line bg-panel/45 p-3.5 sm:p-4">
          <h2 className="text-sm font-bold text-fg">{copy.quickTitle}</h2>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
            {copy.quickActions.map(([title, body, href], index) => (
              <SiteLinkCard key={href} layout="compact" href={href} icon={QUICK_ICONS[index]} title={title} description={body} />
            ))}
          </div>
        </div>

        <FriendlyQuickGuide
          className="mt-4"
          title={copy.guideTitle}
          description={copy.guideBody}
          steps={copy.guideSteps}
        />

        <MySpaceVaultAndRestBar />

        <details
          data-testid="my-space-more-details"
          className="group mt-4 overflow-hidden rounded-2xl border border-line/75 bg-panel/45"
        >
          <summary
            data-testid="my-space-more-summary"
            className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-xs font-semibold text-fg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span>{copy.moreGuideSummary}</span>
            <span aria-hidden="true" className="text-accent transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="border-t border-line/70 px-4 py-3.5">
            <p className="max-w-2xl text-xs leading-5 text-fg-2">{copy.body}</p>
            <p
              className="mt-2 max-w-2xl rounded-xl border border-line bg-card/60 px-3 py-2 text-xs leading-5 text-fg-2"
              aria-live="polite"
            >
              {syncCopy}
            </p>
            <SiteContextualSubNav pathnameOverride="/my" className="mt-3" />
            <SiteArtSurfaceSpotlight cardId="nb-manage-vault" compact className="mt-3" />
          </div>
        </details>
      </div>
    </Container>
  );
}
