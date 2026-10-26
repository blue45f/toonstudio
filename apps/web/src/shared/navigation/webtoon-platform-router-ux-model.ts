/**
 * 글로벌 웹툰·만화·창작·에셋 플랫폼 13종 REA(Reverse-Engineer-Anything) 라우터·동선 및 UI/UX 아키텍처 엔진.
 *
 * 분석 기준일: 2026-10-26
 * 13개 플랫폼의 REA 증거 원장은 `./webtoon-platform-rea-ledger.ts`에서 재수출하며,
 * 이 모듈은 역공학으로 도출한 라우터 프리셋, 월요일 기준 요일 계산식, 4-Tab 개인 서재,
 * 6단계 창작 스튜디오 파이프라인, 3-Mode 뷰 스위처, 6대 맥락형 허브 서브탭을 정의한다.
 */

import { canonicalSitePath } from "@/shared/lib/site-route-authority";

import {
  COMPETITOR_PLATFORM_REA_LEDGER,
  type CompetitorPlatformId,
  type CompetitorPlatformReaEvidence,
} from "./webtoon-platform-rea-ledger";

export {
  COMPETITOR_PLATFORM_REA_LEDGER,
  type CompetitorPlatformId,
  type CompetitorPlatformReaEvidence,
};

/**
 * Kakao Webtoon `source-13-89cae4c1decd50887cbf2f5bfd05957c3e68b79ab1548c434f55a5e9ef5b7c27.js`에서
 * 역공학한 월요일 시작 요일 인덱스 계산식 `(weekday + 6) % 7` 및 요일 키.
 */
export const KAKAO_WEBTOON_WEEKDAY_KEYS = Object.freeze([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const);

export type KakaoWebtoonWeekdayKey = (typeof KAKAO_WEBTOON_WEEKDAY_KEYS)[number];

export function resolveMondayFirstWeekdayIndex(jsDay: number): number {
  const normalized = ((Math.trunc(jsDay) % 7) + 7) % 7;
  return (normalized + 6) % 7;
}

export function resolveActiveWeekdayKey(
  dateOrJsDay: Date | number = new Date(),
): KakaoWebtoonWeekdayKey {
  const jsDay =
    typeof dateOrJsDay === "number" ? dateOrJsDay : dateOrJsDay.getDay();
  const idx = resolveMondayFirstWeekdayIndex(jsDay);
  return KAKAO_WEBTOON_WEEKDAY_KEYS[idx] ?? "mon";
}

/**
 * Manga Plus `/manga_list/{all,ongoing,completed,one_shot,updated}` +
 * `/ranking/{hottest,trending,completed}` + Manta `/new-and-now`, `/curation`을
 * ToonStudio 라우터 쿼리와 매핑한 경쟁사 표준 탐색 프리셋.
 */
export interface CompetitorRouterPreset {
  readonly id: string;
  readonly competitorSource: CompetitorPlatformId;
  readonly competitorRoute: string;
  readonly toonstudioHref: string;
  readonly koLabel: string;
  readonly enLabel: string;
}

export const COMPETITOR_DISCOVERY_ROUTER_PRESETS: readonly CompetitorRouterPreset[] = Object.freeze([
  {
    id: "mangaplus-hottest",
    competitorSource: "mangaplus",
    competitorRoute: "/ranking/hottest",
    toonstudioHref: "/ranking?axis=popular",
    koLabel: "실시간 인기 (Hottest)",
    enLabel: "Hottest Ranking",
  },
  {
    id: "mangaplus-trending",
    competitorSource: "mangaplus",
    competitorRoute: "/ranking/trending",
    toonstudioHref: "/ranking?axis=rising",
    koLabel: "급상승 트렌딩 (Trending)",
    enLabel: "Trending Now",
  },
  {
    id: "mangaplus-completed",
    competitorSource: "mangaplus",
    competitorRoute: "/ranking/completed",
    toonstudioHref: "/explore?status=completed&sort=popular",
    koLabel: "완결 명작 랭킹 (Completed)",
    enLabel: "Completed Hits",
  },
  {
    id: "kakao-webtoon-timetable",
    competitorSource: "kakao-webtoon",
    competitorRoute: "/[[...home]]?tab=timetable",
    toonstudioHref: "/calendar",
    koLabel: "요일별 연재표 (Timetable)",
    enLabel: "Weekly Timetable",
  },
  {
    id: "manta-new-and-now",
    competitorSource: "manta",
    competitorRoute: "/new-and-now",
    toonstudioHref: "/explore?status=ongoing&sort=latest",
    koLabel: "신작·최신 업데이트 (New & Now)",
    enLabel: "New & Now",
  },
  {
    id: "pixiv-cover-visual",
    competitorSource: "pixiv-comic",
    competitorRoute: "/search/cover",
    toonstudioHref: "/promo-library",
    koLabel: "표지·포스터 비주얼 탐색",
    enLabel: "Visual Cover & Poster Grid",
  },
]);

/**
 * Postype `/library/{view,purchases,likes,collections}` +
 * Tapas `/library/{reading-list,recent,subscribed,unlocked}` +
 * NAVER WEBTOON `/mypage/{favorite,recently,bookmark}`를 통합한 4-Tab 개인 서재 택소노미.
 */
export interface PersonalLibrarySegmentSpec {
  readonly id: "view" | "purchases" | "likes" | "collections";
  readonly postypeRoute: string;
  readonly tapasRoute: string;
  readonly naverRoute: string;
  readonly toonstudioHref: string;
  readonly koLabel: string;
  readonly enLabel: string;
}

export const PERSONAL_LIBRARY_SEGMENTS: readonly PersonalLibrarySegmentSpec[] = Object.freeze([
  {
    id: "view",
    postypeRoute: "/library/view",
    tapasRoute: "/library/recent",
    naverRoute: "/mypage/recently",
    toonstudioHref: "/library?tab=diary",
    koLabel: "최근 감상·일기",
    enLabel: "Recent & Diary",
  },
  {
    id: "likes",
    postypeRoute: "/library/likes",
    tapasRoute: "/library/subscribed",
    naverRoute: "/mypage/favorite",
    toonstudioHref: "/library?tab=shelf",
    koLabel: "관심·구독 작품",
    enLabel: "Saved & Subscribed",
  },
  {
    id: "purchases",
    postypeRoute: "/library/purchases",
    tapasRoute: "/library/unlocked",
    naverRoute: "/mypage/bookmark",
    toonstudioHref: "/library?tab=rated",
    koLabel: "평가·소장 기록",
    enLabel: "Rated & Unlocked",
  },
  {
    id: "collections",
    postypeRoute: "/library/collections",
    tapasRoute: "/library/reading-list",
    naverRoute: "/mypage/favorite",
    toonstudioHref: "/library?tab=collections",
    koLabel: "큐레이션 컬렉션",
    enLabel: "Collections",
  },
]);

/**
 * Manta `/creator/studio/*` + `/uot-printcomic-v2` + NAVER WEBTOON `/creators/manage/{title,article,cuts}` +
 * Postype `/studio` ↔ `/editor`를 통합한 6단계 창작자 엔드투엔드 파이프라인 모델.
 */
export interface CreatorStudioPipelineStep {
  readonly stepNumber: number;
  readonly id: string;
  readonly mantaRoute: string;
  readonly naverRoute: string;
  readonly toonstudioHref: string;
  readonly koTitle: string;
  readonly enTitle: string;
  readonly koSummary: string;
  readonly enSummary: string;
}

export const CREATOR_STUDIO_PIPELINE_STEPS: readonly CreatorStudioPipelineStep[] = Object.freeze([
  {
    stepNumber: 1,
    id: "onboarding-apply",
    mantaRoute: "/creator/apply",
    naverRoute: "/creators/welcome",
    toonstudioHref: "/create",
    koTitle: "01 · 창작 시작·설계",
    enTitle: "01 · Creator Launchpad",
    koSummary: "작품 기획·세계관·콘티 워크플로를 고르고 프로젝트를 시작합니다.",
    enSummary: "Pick your planning, worldbuilding and storyboard workflow.",
  },
  {
    stepNumber: 2,
    id: "series-new",
    mantaRoute: "/creator/studio/series/new",
    naverRoute: "/creators/manage/title/new",
    toonstudioHref: "/studio/new",
    koTitle: "02 · 신작 시리즈 개설",
    enTitle: "02 · New Series Setup",
    koSummary: "표지·장르·연재 주기·캐릭터 시트를 등록합니다.",
    enSummary: "Register cover art, genres, schedule and character sheets.",
  },
  {
    stepNumber: 3,
    id: "episode-editor",
    mantaRoute: "/creator/studio/series/[seriesId]/episodes/new",
    naverRoute: "/creators/manage/article/new",
    toonstudioHref: "/studio/comic",
    koTitle: "03 · 원고·에피소드 작화",
    enTitle: "03 · Episode Canvas Editor",
    koSummary: "브러시·3D 포즈·배경·말풍선으로 회차 원고를 완성합니다.",
    enSummary: "Draw episodes with brushes, 3D poses, backgrounds and balloons.",
  },
  {
    stepNumber: 4,
    id: "print-to-webtoon",
    mantaRoute: "/uot-printcomic-v2",
    naverRoute: "/creators/article/preview",
    toonstudioHref: "/studio/import",
    koTitle: "04 · 출판만화·세로 스크롤 변환",
    enTitle: "04 · Print-to-Webtoon & Import",
    koSummary: "기존 원고·컷을 웹툰 스크롤 호흡과 모바일 뷰어 규격으로 변환·검수합니다.",
    enSummary: "Convert and inspect panels for vertical scroll webtoon readers.",
  },
  {
    stepNumber: 5,
    id: "short-vod-cuts",
    mantaRoute: "/preview/episodes/[episodeId]",
    naverRoute: "/creators/manage/cuts/title/new",
    toonstudioHref: "/showcase/promo",
    koTitle: "05 · 예고편 · 숏폼 컷츠 제작",
    enTitle: "05 · Promo Trailer & Cuts",
    koSummary: "완성 원고로 9:16 숏폼 컷츠(/cuts/studio)와 AI 보이스 예고편을 만듭니다.",
    enSummary: "Turn finished panels into 9:16 Cuts and AI-voiced promo trailers.",
  },
  {
    stepNumber: 6,
    id: "publish-promote",
    mantaRoute: "/campaigns/voting",
    naverRoute: "/creators/community",
    toonstudioHref: "/community/promote",
    koTitle: "06 · 연재 배포 · 독자 홍보",
    enTitle: "06 · Publish & Reader Spotlight",
    koSummary: "신작·작가 홍보 게시판과 창작 갤러리에 공개하고 독자 피드백을 받습니다.",
    enSummary: "Share on the Creator Promo Board and gather reader feedback.",
  },
]);

/**
 * KakaoPage `/landing/series/{card,list,poster}/[[...pathParams]]` 및
 * Pixiv Comic `/search/cover`에서 검증된 3-Mode 뷰 스위처 타입.
 */
export type SeriesLandingViewMode = "card" | "list" | "poster";

export interface SeriesLandingViewModeSpec {
  readonly id: SeriesLandingViewMode;
  readonly koLabel: string;
  readonly enLabel: string;
  readonly koDescription: string;
  readonly enDescription: string;
  readonly kakaopageRoutePattern: string;
}

export const SERIES_LANDING_VIEW_MODES: readonly SeriesLandingViewModeSpec[] = Object.freeze([
  {
    id: "card",
    koLabel: "카드 뷰",
    enLabel: "Card view",
    koDescription: "미리보기 영상·설명·활용처를 한눈에 비교하는 와이드 카드 레이아웃",
    enDescription: "Wide card layout with video preview, description and usage context",
    kakaopageRoutePattern: "/landing/series/card/[[...pathParams]]",
  },
  {
    id: "poster",
    koLabel: "포스터·쇼츠 그리드",
    enLabel: "Poster & Shorts grid",
    koDescription: "표지·썸네일과 규격 중심으로 빠르게 훑어보는 고밀도 그리드 레이아웃",
    enDescription: "High-density visual grid focused on covers, thumbnails and aspect ratios",
    kakaopageRoutePattern: "/landing/series/poster/[[...pathParams]]",
  },
  {
    id: "list",
    koLabel: "컴팩트 리스트",
    enLabel: "Compact list",
    koDescription: "제목·규격·길이·쓰는 곳·내려받기를 한 줄씩 빠르게 탐색하는 목록 레이아웃",
    enDescription: "Compact row layout for scanning title, spec, duration, usage and download",
    kakaopageRoutePattern: "/landing/series/list/[[...pathParams]]",
  },
]);

/**
 * 홍보 영상·쇼츠 자료실 및 시리즈 탐색을 위한 화면 비율(Aspect Ratio) 필터.
 * NAVER WEBTOON `/creators/manage/cuts/*`(9:16 숏폼) 및 KakaoPage `/cms/short-vod-viewer-preview` 대응.
 */
export type MediaAspectFilter = "all" | "landscape-16-9" | "vertical-9-16" | "square-1-1";

export interface PromoMediaFilterState {
  readonly viewMode: SeriesLandingViewMode;
  readonly aspectFilter: MediaAspectFilter;
  readonly categoryFilter: string;
  readonly searchQuery: string;
}

export const DEFAULT_PROMO_MEDIA_FILTER_STATE: PromoMediaFilterState = Object.freeze({
  viewMode: "card",
  aspectFilter: "all",
  categoryFilter: "all",
  searchQuery: "",
});

export function classifyMediaAspectRatio(width: number, height: number): Exclude<MediaAspectFilter, "all"> {
  if (height > width) return "vertical-9-16";
  if (width === height) return "square-1-1";
  return "landscape-16-9";
}

export function matchesPromoMediaFilter(
  item: {
    readonly categoryId?: string;
    readonly category?: string;
    readonly width: number;
    readonly height: number;
    readonly ko: { readonly title: string; readonly body: string };
    readonly en: { readonly title: string; readonly body: string };
    readonly usage: { readonly ko: string; readonly en: string };
  },
  filter: PromoMediaFilterState,
): boolean {
  const itemCategory = item.categoryId ?? item.category ?? "";
  if (filter.categoryFilter !== "all" && itemCategory !== filter.categoryFilter) {
    return false;
  }
  if (filter.aspectFilter !== "all" && classifyMediaAspectRatio(item.width, item.height) !== filter.aspectFilter) {
    return false;
  }
  const q = filter.searchQuery.trim().toLowerCase();
  if (q.length > 0) {
    const haystack = [
      item.ko.title,
      item.ko.body,
      item.en.title,
      item.en.body,
      item.usage.ko,
      item.usage.en,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  }
  return true;
}

/**
 * NAVER WEBTOON 2단 서브 내비게이션 + KakaoPage `depth: 2` Subtab (`h-57pxr`) +
 * Tapas `bar/tab` + Postype `/library/*` + Manta `/creator/studio/*`를 결합한 6대 맥락형 허브 서브탭 모델.
 */
export type ContextualHubBadge = "UP" | "NEW" | "SHORT-VOD" | "AI STUDIO" | "GALLERY" | "3D·ASSET";

export interface ContextualSubNavItem {
  readonly id: string;
  readonly href: string;
  readonly koLabel: string;
  readonly enLabel: string;
  readonly badge?: ContextualHubBadge;
  readonly exact?: boolean;
}

export type ContextualHubGroupId =
  | "promo-cuts-hub"
  | "discover-hub"
  | "community-hub"
  | "studio-hub"
  | "market-hub"
  | "personal-library-hub";

export interface ContextualSubNavGroup {
  readonly id: ContextualHubGroupId;
  readonly koTitle: string;
  readonly enTitle: string;
  readonly accentToken: string;
  readonly items: readonly ContextualSubNavItem[];
}

export const CONTEXTUAL_SUBNAV_GROUPS: readonly ContextualSubNavGroup[] = Object.freeze([
  {
    id: "promo-cuts-hub",
    koTitle: "영상 · 홍보 · 컷츠 허브",
    enTitle: "Promo Video & Cuts Hub",
    accentToken: "oklch(0.72 0.17 154)",
    items: [
      {
        id: "promo-library",
        href: "/promo-library",
        koLabel: "홍보 영상 자료실 (204편)",
        enLabel: "Promo Video Library (204)",
        badge: "SHORT-VOD",
        exact: true,
      },
      {
        id: "showcase-promo",
        href: "/showcase/promo",
        koLabel: "홍보 영상 스튜디오",
        enLabel: "Promo Video Studio",
        badge: "AI STUDIO",
      },
      {
        id: "community-promote",
        href: "/community/promote",
        koLabel: "신작·작가 홍보 게시판",
        enLabel: "Creator Promo Board",
        badge: "UP",
      },
      {
        id: "cuts-feed",
        href: "/cuts",
        koLabel: "숏폼 컷츠 피드",
        enLabel: "Short-form Cuts",
        badge: "NEW",
        exact: true,
      },
      {
        id: "cuts-studio",
        href: "/cuts/studio",
        koLabel: "컷츠 스튜디오",
        enLabel: "Cuts Studio",
      },
      {
        id: "brand-film",
        href: "/brand-film",
        koLabel: "브랜드 필름",
        enLabel: "Brand Film",
      },
      {
        id: "product-tour",
        href: "/product-tour",
        koLabel: "제품 투어",
        enLabel: "Product Tour",
      },
    ],
  },
  {
    id: "discover-hub",
    koTitle: "작품 탐색 · 큐레이션",
    enTitle: "Discover & Curation",
    accentToken: "oklch(0.68 0.16 245)",
    items: [
      { id: "discover", href: "/discover", koLabel: "통합 탐색", enLabel: "Discover", exact: true },
      { id: "explore", href: "/explore", koLabel: "장르·태그", enLabel: "Genres & Tags" },
      { id: "ranking", href: "/ranking", koLabel: "실시간 랭킹", enLabel: "Rankings", badge: "UP" },
      { id: "calendar", href: "/calendar", koLabel: "연재 캘린더", enLabel: "Release Calendar" },
      { id: "recommend", href: "/recommend", koLabel: "맞춤 추천", enLabel: "For You", badge: "NEW" },
      { id: "cuts", href: "/cuts", koLabel: "숏폼 컷츠", enLabel: "Cuts", badge: "SHORT-VOD" },
    ],
  },
  {
    id: "community-hub",
    koTitle: "커뮤니티 · 갤러리 · 홍보",
    enTitle: "Community & Showcase",
    accentToken: "oklch(0.7 0.17 42)",
    items: [
      { id: "community", href: "/community", koLabel: "커뮤니티 홈", enLabel: "Community", exact: true },
      { id: "community-promote", href: "/community/promote", koLabel: "작품·작가 홍보", enLabel: "Promote Work", badge: "UP" },
      { id: "showcase", href: "/showcase", koLabel: "창작 갤러리", enLabel: "Showcase", badge: "GALLERY", exact: true },
      { id: "showcase-promo", href: "/showcase/promo", koLabel: "예고편 제작", enLabel: "Trailer Maker", badge: "AI STUDIO" },
      { id: "reviews", href: "/reviews", koLabel: "독자 리뷰", enLabel: "Reviews" },
      { id: "collaborate", href: "/collaborate", koLabel: "구인·의뢰", enLabel: "Collaborate" },
    ],
  },
  {
    id: "studio-hub",
    koTitle: "창작 스튜디오 · 파이프라인",
    enTitle: "Creator Studio Pipeline",
    accentToken: "oklch(0.71 0.16 290)",
    items: [
      { id: "create", href: "/create", koLabel: "창작 시작점", enLabel: "Launchpad", exact: true },
      { id: "studio", href: "/studio", koLabel: "통합 스튜디오", enLabel: "Studio Home", badge: "AI STUDIO", exact: true },
      { id: "studio-new", href: "/studio/new", koLabel: "신작 개설", enLabel: "New Series", badge: "NEW" },
      { id: "studio-comic", href: "/studio/comic", koLabel: "원고 에디터", enLabel: "Comic Editor" },
      { id: "studio-import", href: "/studio/import", koLabel: "원고 변환·검수", enLabel: "Import & Convert" },
      { id: "showcase-promo", href: "/showcase/promo", koLabel: "예고편 스튜디오", enLabel: "Promo Trailer", badge: "SHORT-VOD" },
      { id: "studio-publish", href: "/studio/publish", koLabel: "연재·유통 배포", enLabel: "Publish" },
    ],
  },
  {
    id: "market-hub",
    koTitle: "소재 마켓 · 3D · 브러시 에셋",
    enTitle: "Asset Market & 3D Studio",
    accentToken: "oklch(0.72 0.15 190)",
    items: [
      { id: "market", href: "/market", koLabel: "소재 마켓 홈", enLabel: "Market Home", exact: true },
      { id: "market-browse", href: "/market/browse", koLabel: "전체 소재 탐색", enLabel: "Browse Assets", badge: "3D·ASSET" },
      { id: "studio-assets", href: "/studio/assets", koLabel: "내 에셋 보관함", enLabel: "My Assets" },
      { id: "studio-brushes", href: "/studio/brushes", koLabel: "브러시 엔진", enLabel: "Brush Engine", badge: "NEW" },
      { id: "research", href: "/research", koLabel: "레퍼런스 탐색", enLabel: "Reference Search" },
    ],
  },
  {
    id: "personal-library-hub",
    koTitle: "내 서재 · 감상 · 컬렉션",
    enTitle: "My Library & Collections",
    accentToken: "oklch(0.71 0.15 330)",
    items: [
      { id: "library-shelf", href: "/library", koLabel: "내 서재 (관심·구독)", enLabel: "Saved Shelf", exact: true },
      { id: "library-diary", href: "/library?tab=diary", koLabel: "최근 감상·일기", enLabel: "Reading Diary", badge: "NEW" },
      { id: "library-rated", href: "/library?tab=rated", koLabel: "평가·소장 기록", enLabel: "Rated & Owned" },
      { id: "library-collections", href: "/library?tab=collections", koLabel: "큐레이션 컬렉션", enLabel: "Collections" },
      { id: "recommend", href: "/recommend", koLabel: "취향 맞춤 추천", enLabel: "For You", badge: "UP" },
    ],
  },
]);

export function resolveContextualSubNavForPath(rawPathname: string): ContextualSubNavGroup | null {
  const pathname = canonicalSitePath(rawPathname);
  if (
    pathname === "/promo-library" ||
    pathname === "/showcase/promo" ||
    pathname === "/community/promote" ||
    pathname === "/cuts" ||
    pathname === "/cuts/studio" ||
    pathname === "/cuts/rewards" ||
    pathname === "/brand-film" ||
    pathname === "/product-tour"
  ) {
    return CONTEXTUAL_SUBNAV_GROUPS[0] ?? null;
  }
  if (
    pathname === "/discover" ||
    pathname === "/explore" ||
    pathname === "/ranking" ||
    pathname === "/calendar" ||
    pathname === "/recommend" ||
    pathname === "/search" ||
    pathname === "/random" ||
    pathname === "/compare"
  ) {
    return CONTEXTUAL_SUBNAV_GROUPS[1] ?? null;
  }
  if (
    pathname === "/community" ||
    pathname === "/showcase" ||
    pathname === "/reviews" ||
    pathname === "/collaborate" ||
    pathname === "/opportunities"
  ) {
    return CONTEXTUAL_SUBNAV_GROUPS[2] ?? null;
  }
  if (
    pathname === "/create" ||
    pathname === "/studio" ||
    pathname === "/studio/new" ||
    pathname === "/studio/comic" ||
    pathname === "/studio/import" ||
    pathname === "/studio/motion-webtoon" ||
    pathname === "/studio/publish"
  ) {
    return CONTEXTUAL_SUBNAV_GROUPS[3] ?? null;
  }
  if (
    pathname === "/market" ||
    pathname === "/market/browse" ||
    pathname === "/studio/assets" ||
    pathname === "/studio/brushes" ||
    pathname === "/research"
  ) {
    return CONTEXTUAL_SUBNAV_GROUPS[4] ?? null;
  }
  if (
    pathname === "/library" ||
    pathname === "/my" ||
    pathname === "/notifications" ||
    pathname === "/messages"
  ) {
    return CONTEXTUAL_SUBNAV_GROUPS[5] ?? null;
  }
  return null;
}

/**
 * Modern Web Guidance (`same-document-transitions`):
 * `document.startViewTransition`을 점진적 향상(Progressive Enhancement)으로 감싸고
 * `prefers-reduced-motion: reduce` 환경을 존중한다.
 */
export function runSameDocumentViewTransition(updateCallback: () => void): void {
  if (typeof document === "undefined") {
    updateCallback();
    return;
  }
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    updateCallback();
    return;
  }
  const docWithTransition = document as Document & {
    startViewTransition?: (callback: () => void) => unknown;
  };
  if (typeof docWithTransition.startViewTransition === "function") {
    docWithTransition.startViewTransition(() => {
      updateCallback();
    });
    return;
  }
  updateCallback();
}
