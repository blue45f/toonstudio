import {
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  CalendarDays,
  Compass,
  Cpu,
  FlaskConical,
  Gamepad2,
  Grip,
  Home,
  Images,
  Layers,
  LayoutGrid,
  Library,
  LifeBuoy,
  Lightbulb,
  Map as MapIcon,
  MessageCircle,
  MessageSquareQuote,
  Moon,
  Mountain,
  PackageCheck,
  Palette,
  Settings,
  Shapes,
  Sparkles,
  SquarePen,
  Store,
  Telescope,
  TrendingUp,
  Trophy,
  UserRound,
  UserRoundPen,
  Workflow,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  canonicalSitePath,
  primarySiteRouteAuthority,
  type SitePrimaryRouteId,
} from "@/shared/lib/site-route-authority";
import { resolveSiteRouteNavigationContext } from "@/shared/lib/site-route-metadata";
import { isPublicCreativeRoute } from "./site-public-routes";


export type SiteNavigationLocale = "ko" | "en";
export type SiteNavigationContext = "studio" | "spectrum";
export type SiteNavigationText = Record<SiteNavigationLocale, string>;

export type SiteNavigationTier = "primary" | "contextual" | "directory";

/** 노출 대상 — public은 비로그인, signed-in은 로그인, team은 팀 소속, project는 담당 회차 보유. */
export type SiteNavigationAudience = "public" | "signed-in" | "team" | "project";

/** 항목 성격 — 디렉터리 표면에서창작 목적지만 1차 블록으로 올린다. */
export type SiteNavigationKind =
  | "destination"
  | "workspace"
  | "creation"
  | "discovery"
  | "social"
  | "personal"
  | "reference";

export interface SiteNavigationItem {
  id: string;
  href: string;
  label: SiteNavigationText;
  description: SiteNavigationText;
  icon: LucideIcon;
  exact?: boolean;
  kind: SiteNavigationKind;
  tier: SiteNavigationTier;
  audience: SiteNavigationAudience;
}

/** 핵심 여정 4단계. 지도는 하나이고, 현재 여정에 맞는 구간만 강조가 바뀐다. */
export type SiteNavigationJourney = "start" | "create" | "publish" | "collaborate" | "rest";

export interface SiteNavigationGroup {
  id: string;
  label: SiteNavigationText;
  description: SiteNavigationText;
  /** 이 구간이 속한 핵심 여정. 현재 여정 구간 하이라이트의 기준이다.
   * 단일 지도(SITE_NAVIGATION_GROUPS)는 항상 지정한다. 사이트 디렉터리처럼
   * 같은 타입을 쓰는 자체 구간 데이터는 지정하지 않을 수 있다. */
  journey?: SiteNavigationJourney;
  items: readonly SiteNavigationItem[];
}

const item = (
  id: string,
  href: string,
  icon: LucideIcon,
  ko: string,
  en: string,
  koDescription: string,
  enDescription: string,
  exact = false,
  kind: SiteNavigationKind = "reference",
  tier: SiteNavigationTier = "contextual",
  audience: SiteNavigationAudience = "public",
): SiteNavigationItem => ({
  id,
  href,
  icon,
  exact,
  kind,
  tier,
  audience,
  label: { ko, en },
  description: { ko: koDescription, en: enDescription },
});

const primaryItem = (
  id: string,
  routeId: SitePrimaryRouteId,
  icon: LucideIcon,
  exact = false,
  kind: SiteNavigationKind = "reference",
  tier: SiteNavigationTier = "contextual",
  audience: SiteNavigationAudience = "public",
): SiteNavigationItem => {
  const definition = primarySiteRouteAuthority(routeId);
  return item(
    id,
    definition.canonicalPath,
    icon,
    definition.label.ko,
    definition.label.en,
    definition.description.ko,
    definition.description.en,
    exact,
    kind,
    tier,
    audience,
  );
};

/**
 * 아이콘 규칙(2026-10-13 UX 고도화): 한 아이콘은 한 목적지만 뜻한다.
 * 같은 아이콘이 서로 다른 목적지를 가리키면 사용자는 아이콘만 보고 구분할 수 없다.
 * 과거 중복: Palette(스튜디오·작품 시작하기), Store(작품 재료·소재 마켓),
 * BookOpen(배우기·제작 기술·리서치·도움말), Sparkles(맞춤 추천·창작 기회),
 * MessageCircle(구인·의뢰·커뮤니티), BarChart3(트렌드·성장 실험), Workflow(제작·제작 기술),
 * LayoutGrid(웹툰 만들기·전체 메뉴), Compass(둘러보기 허브·탐색).
 * 예외는 Home 하나뿐이다: 개인 홈(/home)과 공개 홈(/)은 같은 "홈" 개념이고
 * 두 내비는 컨텍스트상 동시에 보이지 않으며, 라벨이 항상 함께 보인다.
 */
export const SITE_NAVIGATION_ITEMS = {
  workspaceHome: primaryItem("workspace-home", "workspace-home", Home, true, "workspace", "primary", "signed-in"),
  workspaceTeam: primaryItem("workspace-team", "workspace-team", Users, false, "workspace", "contextual", "team"),
  workspaceHub: primaryItem("workspace-hub", "workspace-hub", Shapes, false, "workspace", "contextual", "public"),
  // 지도 차원 라벨 구분 (2026-10-14 결정): 디렉터리 표면(모바일 메뉴·전체 메뉴·⌘K)에서는
  // personal 그룹 안에서 workspaceHome("내 홈", /home)과 이 항목이 나란히 놓인다.
  // 둘 다 "홈"으로 읽히면 목적지를 고를 수 없으므로, 공개 홈("/")의 정본 라벨을
  // "사이트 홈"으로 구분한다. id·href·아이콘·그룹 소속은 무변경이라
  // siteNavigationGroupForPath("/") === "personal" 계약은 그대로 유지된다.
  // 푸터는 브랜드 링크가 "/"를 이미 소유해 이 항목을 렌더링에서 제외하므로(유지),
  // 이 구분이 실제로 보이는 곳은 디렉터리 표면과 공개 셸 1차 내비다.
  home: item(
    "home",
    "/",
    Home,
    "사이트 홈",
    "Site home",
    "작품 탐색과 서비스 소개",
    "Discover stories and explore the service",
    true, "reference", "primary", "public",
  ),
  production: primaryItem("production", "production", Workflow, true, "destination", "contextual", "project"),
  // 작품 시작의 정문은 /create 시작 시트 하나다. /studio/new는 시트에서
  // "새 작품"을 골랐을 때 닿는 2단계 생성 양식이라 내비가 직접 가리키지 않는다.
  make: item(
    "make",
    "/create",
    SquarePen,
    "작품 시작하기",
    "Start a work",
    "새 작품·템플릿·이어가기를 한 화면에서 고르기",
    "Start new, begin from a template or continue — in one place",
    true, "creation", "contextual", "public",
  ),
  studio: primaryItem("studio", "studio-home", Palette, true, "creation", "primary", "public"),
  studioAssets: primaryItem("studio-assets", "studio-assets", Layers, false, "creation", "contextual", "public"),
  publish: primaryItem("publish", "studio-publish", PackageCheck, false, "creation", "contextual", "public"),
  learn: item(
    "learn",
    "/learn",
    BookOpen,
    "배우기",
    "Learn",
    "처음 시작부터 전문 제작과 문제 해결까지",
    "From first steps to professional workflows and troubleshooting",
    false, "reference", "primary", "public",
  ),
  technology: item(
    "technology",
    "/about/technology",
    Cpu,
    "제작 기술",
    "Engineering",
    "제작 과정·아키텍처·오픈소스·적용 가이드",
    "Build process, architecture, open source and implementation guides",
  ),
  comic: item(
    "comic",
    "/studio/comic",
    LayoutGrid,
    "웹툰 만들기",
    "Webtoon",
    "컷·말풍선·대사를 한 화면에서",
    "Arrange panels, dialogue and balloons",
    false, "creation", "contextual", "public",
  ),
  shaper: item(
    "shaper",
    "/studio/assets/characters/new",
    UserRoundPen,
    "캐릭터 만들기",
    "Character",
    "캐릭터·표정·포즈와 3D 참고",
    "Build characters, expressions, poses and 3D reference",
    false, "creation", "contextual", "public",
  ),
  virtualStudio: item(
    "virtual-studio",
    "/studio/space",
    MapIcon,
    "가상 스튜디오",
    "Virtual studio",
    "내 캐릭터로 걷고 만나고 함께 작업하는 공간",
    "Walk, meet and work together as your character",
    false, "destination", "contextual", "signed-in",
  ),
  market: item(
    "market",
    "/market",
    Store,
    "소재 마켓",
    "Materials market",
    "호환성과 사용 권리를 확인하고 새 에셋 탐색",
    "Discover assets with compatibility and rights information",
    false, "discovery", "primary", "public",
  ),
  gallery: item(
    "gallery",
    "/showcase",
    Images,
    "창작 갤러리",
    "Showcase",
    "다른 창작자의 작품과 제작 흐름",
    "Meet creators and their work",
    false, "discovery", "contextual", "public",
  ),
  explore: item(
    "explore",
    "/discover",
    Compass,
    "탐색",
    "Discover",
    "검색·취향·추천에서 원하는 작품 발견",
    "Find stories through search, taste and recommendations",
    false, "discovery", "primary", "public",
  ),
  ranking: item(
    "ranking",
    "/ranking",
    TrendingUp,
    "랭킹",
    "Rankings",
    "기간과 지표별 인기 흐름",
    "See trends across periods and signals",
    false, "discovery", "contextual", "public",
  ),
  calendar: item(
    "calendar",
    "/calendar",
    CalendarDays,
    "연재 캘린더",
    "Release calendar",
    "요일별 신작과 연재 일정",
    "Track releases by day",
    false, "discovery", "contextual", "public",
  ),
  recommend: item(
    "recommend",
    "/recommend",
    Sparkles,
    "맞춤 추천",
    "Recommendations",
    "지금 취향에 맞는 작품",
    "Find stories matched to your taste",
    false, "discovery", "contextual", "public",
  ),
  now: item(
    "now",
    "/now",
    Lightbulb,
    "오늘의 영감",
    "Daily inspiration",
    "빈 화면의 부담을 줄이는 짧은 창작 시작",
    "A small creative prompt to overcome the blank page",
    false, "discovery", "contextual", "public",
  ),
  fortune: item(
    "fortune",
    "/fortune",
    Moon,
    "운세",
    "Fortune",
    "오늘의 운세·별자리·사주·궁합·타로·독서 처방",
    "Explore daily fortune, zodiac, saju, compatibility, tarot and reading prescriptions",
    false, "reference", "directory", "public",
  ),
  bg3d: item(
    "bg3d",
    "/studio/bg3d",
    Mountain,
    "배경 · 3D",
    "Background · 3D",
    "장면·카메라·원근을 잡아 배경 완성",
    "Frame scenes, cameras and perspective to finish backgrounds",
    false, "creation", "contextual", "public",
  ),
  research: item(
    "research",
    "/research",
    Telescope,
    "리서치 데스크",
    "Research desk",
    "출처·작품·트렌드 자료를 창작 소재와 판단으로 연결",
    "Turn sourced references, works and trends into creative direction",
    false, "reference", "contextual", "public",
  ),
  opportunities: item(
    "opportunities",
    "/opportunities",
    Trophy,
    "창작 기회",
    "Opportunities",
    "공모전·지원사업·제작 기회",
    "Find contests, programs and opportunities",
    false, "social", "contextual", "public",
  ),
  insights: item(
    "insights",
    "/insights",
    BarChart3,
    "트렌드",
    "Trends",
    "장르·플랫폼 흐름을 데이터로",
    "Read genre and platform trends",
    false, "reference", "contextual", "public",
  ),
  reviews: item(
    "reviews",
    "/reviews",
    MessageSquareQuote,
    "리뷰",
    "Reviews",
    "작품을 깊게 읽고 기록하기",
    "Read and write thoughtful reviews",
    false, "social", "contextual", "public",
  ),
  collaborate: item("collaborate", "/collaborate", Briefcase, "구인·의뢰", "Collaborate", "웹툰 팀원 모집·작업 의뢰·작업자 홍보", "Find teammates, commission work and share your skills", false, "social", "contextual", "public"),
  community: item(
    "community",
    "/community",
    MessageCircle,
    "커뮤니티",
    "Community",
    "창작과 감상을 함께 나누기",
    "Share creation and discovery",
    false, "social", "primary", "public",
  ),
  play: item(
    "play",
    "/play",
    Gamepad2,
    "놀이터",
    "Playground",
    "가볍게 즐기는 인터랙티브 콘텐츠",
    "Enjoy playful interactive content",
    false, "social", "contextual", "public",
  ),
  library: item(
    "library",
    "/library",
    Library,
    "내 서재",
    "My library",
    "저장한 작품과 취향을 한곳에서",
    "Keep saved stories and taste in one place",
    false, "personal", "contextual", "signed-in",
  ),
  notifications: item(
    "notifications",
    "/notifications",
    Bell,
    "알림 센터",
    "Notifications",
    "연재·제공처 변화·제작 업무를 한곳에서",
    "Release, availability and production updates in one place",
    false, "personal", "contextual", "signed-in",
  ),
  growthLab: item(
    "growth-lab",
    "/studio/growth",
    FlaskConical,
    "성장 실험",
    "Growth lab",
    "썸네일·제목 실험과 익명 독자 퍼널",
    "Thumbnail and title experiments with aggregate audience funnels",
    false, "creation", "contextual", "public",
  ),
  me: item(
    "me",
    "/my",
    UserRound,
    "내 공간",
    "My space",
    "작품·활동·프로필과 계정 관리",
    "Works, activity, profile and account",
    false, "personal", "contextual", "signed-in",
  ),
  settings: item(
    "settings",
    "/settings",
    Settings,
    "설정",
    "Settings",
    "언어·데이터·서비스 환경",
    "Language, data and service preferences",
    false, "personal", "contextual", "signed-in",
  ),
  allMenu: item(
    "all-menu",
    "/sitemap",
    Grip,
    "전체 메뉴",
    "All menu",
    "모든 기능과 신규 콘텐츠를 한곳에서",
    "Open every tool, destination and new experience",
    true, "reference", "primary", "public",
  ),
  help: item(
    "help",
    "/help",
    LifeBuoy,
    "도움말",
    "Help",
    "작업과 문제에서 바로 해결 경로 찾기",
    "Find help from the task or problem",
  ),
} as const satisfies Record<string, SiteNavigationItem>;

const I = SITE_NAVIGATION_ITEMS;

/** Public and personal shells share the same five purposes but keep different home contracts. */
export const TOONSTUDIO_PRIMARY_NAVIGATION = [
  I.workspaceHome,
  I.studio,
  I.explore,
  I.community,
  I.allMenu,
] as const;

export const TOONSPECTRUM_PRIMARY_NAVIGATION = [
  I.home,
  I.studio,
  I.explore,
  I.community,
  I.allMenu,
] as const;

/** Compatibility exports retain the public navigation contract. */
export const UNIFIED_PRIMARY_NAVIGATION = TOONSPECTRUM_PRIMARY_NAVIGATION;
export const PRIMARY_SITE_NAVIGATION = TOONSPECTRUM_PRIMARY_NAVIGATION;

/**
 * 사이트 전체의 단일 목적지 지도 (R7에서 확정).
 *
 * 예전에는 작업실 컨텍스트용 15항목 지도와 공개 컨텍스트용 25항목 지도가
 * 따로 있어, 같은 목적지가 화면 맥락마다 다른 그룹·다른 순서로 나타났다.
 * 이제 지도는 이 하나뿐이고, 컨텍스트가 바꾸는 것은 어느 여정 구간이
 * 강조되는지뿐이다. 두 구 지도의 목적지는 하나도 빠짐없이 여기에 있다.
 * 그룹 순서는 핵심 여정(시작 → 제작 → 연재 → 협업)을 따른다.
 *
 * 2026-10-13 UX 고도화(2차): 운세·놀이터·오늘의 영감은 "일"이 아니라 "쉼"이다.
 * 자료·성장(grow)과 함께 보기(connect)에 섞여 있으면 사용자의 멘탈 모델이 깨져,
 * 전용 구간 "쉬어가기(rest)"로 분리했다. 목적지 자체는 하나도 사라지지 않는다.
 */
export const SITE_NAVIGATION_GROUPS: readonly SiteNavigationGroup[] = [
  {
    id: "discover",
    label: { ko: "작품 찾기", en: "Discover" },
    description: {
      ko: "취향과 흐름에서 다음 작품을",
      en: "Find the next story for your taste",
    },
    journey: "start",
    items: [I.explore, I.ranking, I.calendar, I.recommend],
  },
  {
    id: "create",
    label: { ko: "만들기", en: "Create" },
    description: {
      ko: "그리고 조립하고 함께 작업하는 창작 도구",
      en: "Draw, compose and work together",
    },
    journey: "create",
    items: [I.studio, I.make, I.comic, I.shaper, I.bg3d, I.virtualStudio, I.studioAssets, I.production],
  },
  {
    id: "grow",
    label: { ko: "자료·성장", en: "Research & grow" },
    description: {
      ko: "영감·자료·기회를 실제 작업으로",
      en: "Connect inspiration, research and opportunity",
    },
    journey: "create",
    items: [I.research, I.market, I.learn, I.opportunities, I.insights, I.technology],
  },
  {
    id: "publish",
    label: { ko: "연재·내보내기", en: "Publish" },
    description: {
      ko: "검수하고 내보내고 독자 반응으로 다음 화를 준비",
      en: "Review, export and prepare the next episode from reader response",
    },
    journey: "publish",
    items: [I.publish, I.growthLab],
  },
  {
    id: "connect",
    label: { ko: "함께 보기", en: "Connect" },
    description: {
      ko: "작품과 생각을 사람들과",
      en: "Share stories and ideas with people",
    },
    journey: "collaborate",
    items: [I.gallery, I.reviews, I.community, I.collaborate, I.workspaceTeam, I.workspaceHub],
  },
  {
    id: "rest",
    label: { ko: "쉬어가기", en: "Take a break" },
    description: {
      ko: "가볍게 즐기는 영감과 재미",
      en: "Light inspiration and fun, away from work",
    },
    journey: "rest",
    items: [I.now, I.fortune, I.play],
  },
  {
    id: "personal",
    label: { ko: "내 기록", en: "Personal" },
    description: {
      ko: "내 작업실과 읽던 작품으로 돌아가기",
      en: "Return to your workspace and reading library",
    },
    journey: "start",
    items: [I.workspaceHome, I.library, I.home],
  },
];

/**
 * 호환 별칭: 단일 지도 확정 이전의 컨텍스트별 그룹 이름으로 import하는
 * 소비자를 위해 남겨 둔다. 두 이름 모두 같은 단일 지도를 가리킨다.
 */
export const TOONSTUDIO_NAVIGATION_GROUPS = SITE_NAVIGATION_GROUPS;
export const TOONSPECTRUM_NAVIGATION_GROUPS = SITE_NAVIGATION_GROUPS;

export const TOONSTUDIO_MOBILE_TABS = TOONSTUDIO_PRIMARY_NAVIGATION;
export const TOONSPECTRUM_MOBILE_TABS = TOONSPECTRUM_PRIMARY_NAVIGATION;
export const UNIFIED_MOBILE_TABS = TOONSPECTRUM_MOBILE_TABS;

/** Compatibility export for consumers not yet context-aware. */
export const MOBILE_SITE_TABS = TOONSPECTRUM_MOBILE_TABS;

export const SITE_UTILITY_NAVIGATION = [I.notifications, I.help, I.settings, I.me] as const;

/** Select a public or personal navigation contract without exposing workspace chrome publicly. */
export function siteNavigationContextForPath(pathname: string): SiteNavigationContext {
  if (isPublicCreativeRoute(pathname)) return "spectrum";
  return resolveSiteRouteNavigationContext(pathname);
}

/** Return the primary navigation destinations for the pathname's product context. */
export function primarySiteNavigationForPath(pathname: string): readonly SiteNavigationItem[] {
  return siteNavigationContextForPath(pathname) === "studio"
    ? TOONSTUDIO_PRIMARY_NAVIGATION
    : TOONSPECTRUM_PRIMARY_NAVIGATION;
}

/**
 * 그룹 지도는 컨텍스트와 무관하게 단일 지도를 반환한다.
 * 컨텍스트가 바꾸는 것은 지도 자체가 아니라 강조(현재 여정 구간)뿐이다.
 */
export function siteNavigationGroupsForPath(_pathname: string): readonly SiteNavigationGroup[] {
  return SITE_NAVIGATION_GROUPS;
}

/**
 * 현재 경로가 속한 지도 구간을 찾는다. 항목 href와의 최장 접두사 일치가
 * 기준이며, 루트("/")는 정확히 일치할 때만 내 기록 구간의 홈으로 본다.
 * 어느 구간에도 속하지 않는 경로는 null이다.
 */
export function siteNavigationGroupForPath(pathname: string): SiteNavigationGroup | null {
  const path = canonicalSitePath(pathname);
  let current: SiteNavigationGroup | null = null;
  let longest = -1;
  for (const group of SITE_NAVIGATION_GROUPS) {
    for (const entry of group.items) {
      const href = canonicalSitePath(entry.href);
      const matches = href === "/"
        ? path === "/"
        : path === href || path.startsWith(`${href}/`);
      if (matches && href.length > longest) {
        current = group;
        longest = href.length;
      }
    }
  }
  return current;
}

/** 현재 경로가 속한 핵심 여정. 지도에 없는 경로는 null이다. */
export function siteNavigationJourneyForPath(pathname: string): SiteNavigationJourney | null {
  return siteNavigationGroupForPath(pathname)?.journey ?? null;
}

/** Return stable mobile tabs for the pathname's product context. */
export function mobileSiteTabsForPath(pathname: string): readonly SiteNavigationItem[] {
  return siteNavigationContextForPath(pathname) === "studio"
    ? TOONSTUDIO_MOBILE_TABS
    : TOONSPECTRUM_MOBILE_TABS;
}

export function siteNavigationLocale(locale: string): SiteNavigationLocale {
  return locale.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

export function siteNavigationText(text: SiteNavigationText, locale: string): string {
  return text[siteNavigationLocale(locale)];
}

export interface SiteNavigationExposureContext {
  readonly signedIn: boolean;
  readonly hasTeam: boolean;
  readonly hasProject: boolean;
  readonly isSeller: boolean;
}

export const DIRECTORY_NAVIGATION_EXPOSURE_CONTEXT: SiteNavigationExposureContext = Object.freeze({
  signedIn: true,
  hasTeam: true,
  hasProject: true,
  isSeller: true,
});

export const NAVIGATION_TIER_RANK: Readonly<Record<SiteNavigationTier, number>> = Object.freeze({
  primary: 0,
  contextual: 1,
  directory: 2,
});

function navigationAudienceSatisfied(
  audience: SiteNavigationAudience,
  context: SiteNavigationExposureContext,
): boolean {
  switch (audience) {
    case "public":
      return true;
    case "signed-in":
      return context.signedIn;
    case "team":
      return context.hasTeam;
    case "project":
      return context.hasProject;
  }
}

function isDirectorySurfaceContext(context: SiteNavigationExposureContext): boolean {
  return (
    context === DIRECTORY_NAVIGATION_EXPOSURE_CONTEXT
    || (context.signedIn && context.hasTeam && context.hasProject && context.isSeller)
  );
}

export function effectiveNavigationTier(
  item: SiteNavigationItem,
  context: SiteNavigationExposureContext,
): SiteNavigationTier {
  if (item.tier === "directory") return "directory";
  if (isDirectorySurfaceContext(context)) {
    if (item.tier === "primary") return "primary";
    return item.kind === "destination" ? "primary" : "contextual";
  }
  if (!navigationAudienceSatisfied(item.audience, context)) return "directory";
  return item.tier;
}

const SITE_NAVIGATION_BY_ID: ReadonlyMap<string, SiteNavigationItem> = new Map(
  Object.values(SITE_NAVIGATION_ITEMS).map((item) => [item.id, item] as const),
);

function navigationItemById(id: string): SiteNavigationItem {
  const item = SITE_NAVIGATION_BY_ID.get(id);
  if (!item) throw new Error(`Unknown site navigation item: ${id}`);
  return item;
}

/**
 * 정본 디렉터리 순서 — 그룹 전개 순서와 같다. 그룹에 없는
 * 전체 메뉴·유틸리티 항목은 맨 뒤에 둔다. tier 블록 정렬과
 * 그룹 전개가 같은 순서를 공유하므로, 평면형과 그룹형을 펼친
 * tier 블록이 항상 디렉터리 순서와 일치한다.
 */
const DIRECTORY_TAIL_IDS: readonly string[] = Object.freeze([
  "all-menu",
  "me",
  "settings",
  "notifications",
  "help",
]);

export function directoryNavigationOrder(): readonly SiteNavigationItem[] {
  const items: SiteNavigationItem[] = [];
  for (const group of SITE_NAVIGATION_GROUPS) items.push(...group.items);
  for (const id of DIRECTORY_TAIL_IDS) items.push(navigationItemById(id));
  return Object.freeze(items);
}

export interface SiteNavigationTierResolution {
  readonly primary: readonly SiteNavigationItem[];
  readonly contextual: readonly SiteNavigationItem[];
  readonly directory: readonly SiteNavigationItem[];
}

export function resolveNavigationFor(context: SiteNavigationExposureContext): SiteNavigationTierResolution {
  const primary: SiteNavigationItem[] = [];
  const contextual: SiteNavigationItem[] = [];
  const directory: SiteNavigationItem[] = [];
  for (const item of directoryNavigationOrder()) {
    const tier = effectiveNavigationTier(item, context);
    if (tier === "primary") primary.push(item);
    else if (tier === "contextual") contextual.push(item);
    else directory.push(item);
  }
  return Object.freeze({
    primary: Object.freeze(primary),
    contextual: Object.freeze(contextual),
    directory: Object.freeze(directory),
  });
}

export function resolveNavigationGroupsFor(
  context: SiteNavigationExposureContext = DIRECTORY_NAVIGATION_EXPOSURE_CONTEXT,
): readonly SiteNavigationGroup[] {
  const orderIndex = new Map(directoryNavigationOrder().map((item, index) => [item.id, index]));
  const rankOf = (item: SiteNavigationItem): number =>
    NAVIGATION_TIER_RANK[effectiveNavigationTier(item, context)];
  const at = (item: SiteNavigationItem): number => orderIndex.get(item.id) ?? Number.MAX_SAFE_INTEGER;
  return Object.freeze(
    SITE_NAVIGATION_GROUPS.map((group) =>
      Object.freeze({
        ...group,
        items: Object.freeze(
          [...group.items].sort((a, b) => rankOf(a) - rankOf(b) || at(a) - at(b)),
        ),
      }),
    ),
  );
}

export function resolveNavigationOrder(
  context: SiteNavigationExposureContext = DIRECTORY_NAVIGATION_EXPOSURE_CONTEXT,
): readonly SiteNavigationItem[] {
  const orderIndex = new Map(directoryNavigationOrder().map((item, index) => [item.id, index]));
  const rankOf = (item: SiteNavigationItem): number =>
    NAVIGATION_TIER_RANK[effectiveNavigationTier(item, context)];
  const at = (item: SiteNavigationItem): number => orderIndex.get(item.id) ?? Number.MAX_SAFE_INTEGER;
  return Object.freeze(
    [...directoryNavigationOrder()].sort((a, b) => rankOf(a) - rankOf(b) || at(a) - at(b)),
  );
}
