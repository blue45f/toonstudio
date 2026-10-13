import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  BookOpen,
  ChevronDown,
  GraduationCap,
  LayoutGrid,
  Menu,
  Palette,
  Search,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { AuthMenuShell } from "../../domains/auth/components/auth-menu-shell";

import {
  SITE_NAVIGATION_GROUPS,
  SITE_NAVIGATION_ITEMS,
  TOONSTUDIO_PRIMARY_NAVIGATION,
  siteNavigationContextForPath,
  siteNavigationLocale,
  siteNavigationText,
  type SiteNavigationGroup,
  type SiteNavigationItem,
  type SiteNavigationText,
} from "./site-navigation";
import { workspaceNavigationActiveId } from "./workspace/workspace-navigation-model";
import { ToonStudioMark } from "./toonstudio-mark";
import { ToonStudioWordmark } from "./toonstudio-brand";
import { PublicSiteAppearanceToggle } from "./public-site-appearance-toggle";
import {
  isDiscoverPurposeRoute,
  isPublicCreativeRoute,
} from "./site-public-routes";
import { useSiteHeaderHeight } from "./use-site-header-height";

import { isImmersiveMobileRoute } from "@/app/routes/immersive-mobile-route";
import { usePathname } from "@/shared/navigation/navigation";
import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import { useI18n, useT } from "@/shared/lib/i18n";
import { keepInlineText } from "@/shared/lib/text";
import { canonicalSitePath } from "@/shared/lib/site-route-authority";
import { useUi } from "@/shared/lib/ui-store";

import "./public-site-shell.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("site-header", ko, en);

const MobileHeaderNavigation = lazy(() =>
  import("./site-header-mobile-nav").then((mod) => ({
    default: mod.MobileHeaderNavigation,
  }))
);

const EngagementHeaderNotifications = lazy(() =>
  import("@/domains/engagement/EngagementHeaderNotifications").then((module) => ({
    default: module.EngagementHeaderNotifications,
  })),
);

const STUDIO_ASSET_PREFIXES = [
  "/studio/assets",
  "/studio/brushes",
  "/studio/bg3d",
  "/studio/poser",
  "/studio/character",
  "/brush-lab",
  "/shaper",
  "/music",
] as const;
const STUDIO_CREATE_PREFIXES = [
  "/studio/new",
  "/studio/import",
  "/make",
] as const;
const STUDIO_LEARN_PREFIXES = ["/learn", "/help", "/guide", "/studio/manual"] as const;
const STUDIO_PUBLISH_PREFIXES = ["/studio/publish", "/publishing"] as const;
const STUDIO_WORK_EXCLUDED_PREFIXES = [
  ...STUDIO_CREATE_PREFIXES,
  ...STUDIO_ASSET_PREFIXES,
  ...STUDIO_LEARN_PREFIXES,
  ...STUDIO_PUBLISH_PREFIXES,
  "/studio/templates",
] as const;
/** 협업 목적지: 제작 관리·팀·구인/의뢰. 커뮤니티·제작과 동시에 활성 표시되지 않게 분리한다. */
const COLLABORATION_PURPOSE_PREFIXES = ["/production", "/team", "/collaborate"] as const;
/** 개인 가상 스튜디오와 프로젝트 협업 공간. */
const VIRTUAL_STUDIO_PATTERN = /^\/studio\/(?:space|p\/[^/]+\/space)(?:\/|$)/u;
const COMMUNITY_PURPOSE_PREFIXES = [
  "/reviews",
  "/showcase",
  "/create",
  "/pencafe",
] as const;
const MY_PURPOSE_PREFIXES = [
  "/my",
  "/me",
  "/library",
  "/notifications",
  "/messages",
  "/settings",
] as const;

/**
 * Canonical destinations for the header's key actions. Legacy aliases (/new, /more)
 * still redirect through the routes team, but the header links the canonical paths
 * directly so users never depend on the redirect. 작품 시작의 정문은 /create
 * 시작 시트 하나이며, /studio/new는 시트에서 빈 작품을 골랐을 때 닿는
 * 2단계 생성 양식이라 헤더가 직접 가리키지 않는다.
 */
const CANONICAL_CREATE_HREF = "/create";

interface HeaderNavigationChild {
  id: string;
  href: string;
  icon: LucideIcon;
  label: SiteNavigationText;
  description: SiteNavigationText;
  /** 하위 경로 전체가 아니라 정확히 이 주소일 때만 현재 위치로 표시한다. */
  exact?: boolean;
}

interface HeaderPrimaryNavigationItem {
  id: string;
  href: string;
  label: SiteNavigationText;
  description: SiteNavigationText;
  exact?: boolean;
  children?: readonly HeaderNavigationChild[];
}

/**
 * 헤더 주 메뉴는 자체 분류를 갖지 않는다 — 단일 지도(SITE_NAVIGATION_GROUPS)를 소비한다.
 *
 * 배경: 예전에는 헤더 전용 분류(제작/가상 스튜디오/협업/탐색/커뮤니티/배우기/마켓)가
 * 지도와 따로 있어, 같은 목적지가 표면마다 다른 그룹·다른 순서·다른 이름으로 나타났다
 * (UX 감사 2026-10-13, 최대 감점 요인). 모바일 전체 메뉴와 푸터는 이미 지도를 소비하고
 * 있었고, 데스크톱 헤더만 예외였다. 이제 헤더도 같은 지도를 읽는다.
 *
 * 헤더가 정하는 것은 "구성"뿐이다: 어떤 그룹·항목을 1차 메뉴로 올릴지, 드롭다운에
 * 무엇을 넣을지. 이름·설명·아이콘·주소는 전부 지도의 정본을 그대로 쓴다
 * (표면별 덮어씀 금지 — site-footer·site-header-mobile-nav와 같은 규칙).
 * 지도에 없는 헤더 전용 목적지·문구는 아래 headerExtras에 명시적으로 분리한다.
 *
 * 1차 메뉴로 올리지 않는 그룹: publish(연재·내보내기)는 제작 흐름의 후반이라
 * 전체 메뉴·푸터·스튜디오 셸이 맡고, connect(함께 보기)는 커뮤니티 항목이 대표하며,
 * rest(쉬어가기)·personal(내 기록)은 전체 메뉴와 모바일 탭이 같은 지도로 제공한다.
 * discover 그룹은 탐색 항목이, grow 그룹은 배우기·마켓 항목이 나눠 소비한다.
 */

const NAV_ITEMS = SITE_NAVIGATION_ITEMS;

/** 단일 지도에서 그룹을 id로 찾는다. 없는 id를 쓰면 조용히 비우지 않고 즉시 실패한다. */
function navGroup(id: string): SiteNavigationGroup {
  const group = SITE_NAVIGATION_GROUPS.find((entry) => entry.id === id);
  if (!group) throw new Error(`Unknown site navigation group: ${id}`);
  return group;
}

/** 지도 항목 → 헤더 드롭다운 자식. 이름·설명·아이콘·주소는 지도의 정본을 쓴다. */
function childFromNavItem(
  item: SiteNavigationItem,
  overrides?: Partial<HeaderNavigationChild>,
): HeaderNavigationChild {
  return {
    id: item.id,
    href: item.href,
    icon: item.icon,
    label: item.label,
    description: item.description,
    ...(item.exact ? { exact: true } : null),
    ...overrides,
  };
}

/** 지도 그룹의 항목들로 드롭다운 자식을 만든다. 순서는 지도의 순서를 따른다. */
function childrenFromNavGroup(
  groupId: string,
  itemIds: readonly string[],
): HeaderNavigationChild[] {
  const group = navGroup(groupId);
  return itemIds.map((itemId) => {
    const item = group.items.find((entry) => entry.id === itemId);
    if (!item) {
      throw new Error(`Navigation item "${itemId}" is not in group "${groupId}"`);
    }
    return childFromNavItem(item);
  });
}

/**
 * headerExtras — 지도에 아직 없는 헤더 전용 목적지와 문구. 여기에 있는 것만이
 * 헤더가 지도 밖에서 정의하는 내비 데이터이며, 그 경계를 코드로 드러내기 위해 모았다.
 *
 * - teamPeople(/team/people): 지도의 workspaceTeam 항목은 /team(팀 홈)까지만 있다.
 *   "팀·권한" 상세는 지도에 항목이 생기면 이쪽을 지우고 지도를 소비한다.
 * - exploreGenres(/explore): 장르 탐색 페이지는 라우트는 있으나 지도 항목이 아니다
 *   (지도의 탐색 항목은 /discover다). 지도 편입 여부는 지도 소유 작업에서 결정한다.
 * - learnClassroom(/learn/classroom)·learnGuide(/guide): 학습 하위 목적지로 지도에 없다.
 * - collaborateEntry: 1차 메뉴의 "협업"이라는 묶음 이름은 지도 그룹 어디에도 없다
 *   (connect 그룹은 "함께 보기"). 묶음 자체는 유지하되 문구는 여기에만 둔다.
 * - marketShortLabel: 지도의 이름은 "소재 마켓"이지만 헤더 1차 메뉴는 폭 예산
 *   (header-width-budget) 때문에 짧은 이름 "마켓"을 쓴다. 이름이 하나여야 한다는
 *   원칙과의 긴장은 이 주석으로 명시하고, 지도 쪽 이름을 바꿀 때 함께 지운다.
 */
const HEADER_EXTRA_CHILDREN = {
  teamPeople: {
    id: "header-team-people",
    href: "/team/people",
    icon: UsersRound,
    label: { ko: "팀·권한", en: "Team & roles" },
    description: { ko: "멤버 초대와 역할별 권한", en: "Invite members and manage roles" },
  },
  exploreGenres: {
    id: "header-explore-genres",
    href: "/explore",
    icon: LayoutGrid,
    label: { ko: "장르", en: "Genres" },
    description: {
      ko: "장르·태그·플랫폼 조건으로 작품 찾기",
      en: "Browse stories by genre, tag and platform",
    },
  },
  learnClassroom: {
    id: "header-learn-classroom",
    href: "/learn/classroom",
    icon: GraduationCap,
    label: { ko: "클래스룸", en: "Classroom" },
    description: {
      ko: "단계별 강좌로 창작 실력 키우기",
      en: "Level up with step-by-step courses",
    },
  },
  learnGuide: {
    id: "header-learn-guide",
    href: "/guide",
    icon: BookOpen,
    label: { ko: "가이드", en: "Guide" },
    description: {
      ko: "서비스 사용법과 창작 길잡이",
      en: "How-to guides for the service and the craft",
    },
  },
} as const satisfies Record<string, HeaderNavigationChild>;

const HEADER_EXTRA_ENTRY_TEXT: {
  readonly collaborate: {
    readonly label: SiteNavigationText;
    readonly description: SiteNavigationText;
  };
  readonly marketShortLabel: SiteNavigationText;
} = {
  collaborate: {
    label: { ko: "협업", en: "Collaborate" },
    description: {
      ko: "작품·회차·공정·원고 피드백을 팀과 함께",
      en: "Works, episodes, stages and feedback with your team",
    },
  },
  marketShortLabel: { ko: "마켓", en: "Market" },
};

/**
 * 헤더 1차 메뉴 (구성 계획).
 * 순서는 기존과 같다: 창작 여정의 세 축(제작·가상 스튜디오·협업)을 앞에 두고,
 * 발견·교류·학습·재료가 뒤따른다. 드롭다운은 하위 목적지가 실제로 구분되는
 * 곳(제작·협업·탐색·배우기)에만 둔다. 운세 같은 가벼운 즐길 거리는 전체 메뉴와
 * 푸터에서 계속 찾을 수 있다(쉬어가기 그룹).
 */
const HEADER_PRIMARY_NAVIGATION: readonly HeaderPrimaryNavigationItem[] = [
  {
    // 만들기(create) 그룹의 대표 항목이 곧 1차 메뉴다. 드롭다운은 그룹 항목 중
    // "지금 그리는 일"만 추린다 — 가상 스튜디오는 자체 1차 메뉴가 있고,
    // 작품 재료·제작 관리는 스튜디오 셸과 협업 메뉴가 맡는다.
    id: "studio",
    href: NAV_ITEMS.studio.href,
    label: NAV_ITEMS.studio.label,
    description: NAV_ITEMS.studio.description,
    children: childrenFromNavGroup("create", [
      "studio",
      "make",
      "comic",
      "shaper",
      "bg3d",
    ]),
  },
  {
    id: "virtual-studio",
    href: NAV_ITEMS.virtualStudio.href,
    label: NAV_ITEMS.virtualStudio.label,
    description: NAV_ITEMS.virtualStudio.description,
  },
  {
    id: "collaborate",
    href: NAV_ITEMS.production.href,
    label: HEADER_EXTRA_ENTRY_TEXT.collaborate.label,
    description: HEADER_EXTRA_ENTRY_TEXT.collaborate.description,
    children: [
      // 제작 관리는 지도에서 exact(정확히 /production) 항목이지만, 헤더 자식으로서는
      // 하위 프로젝트 경로에서도 현재 위치로 표시해야 해서 exact를 풀어 쓴다.
      childFromNavItem(NAV_ITEMS.production, { exact: undefined }),
      HEADER_EXTRA_CHILDREN.teamPeople,
      childFromNavItem(NAV_ITEMS.collaborate),
    ],
  },
  {
    // 작품 찾기(discover) 그룹을 탐색 항목이 대표한다.
    id: "explore",
    href: NAV_ITEMS.explore.href,
    label: NAV_ITEMS.explore.label,
    description: NAV_ITEMS.explore.description,
    children: [
      HEADER_EXTRA_CHILDREN.exploreGenres,
      ...childrenFromNavGroup("discover", ["ranking", "calendar"]),
    ],
  },
  {
    id: "community",
    href: NAV_ITEMS.community.href,
    label: NAV_ITEMS.community.label,
    description: NAV_ITEMS.community.description,
  },
  {
    // 배우기는 자료·성장(grow) 그룹의 학습 축을 대표한다. 같은 그룹의 리서치는
    // 드롭다운에, 소재 마켓은 자체 1차 메뉴로, 기회·트렌드·제작 기술은 전체 메뉴가 맡는다.
    id: "learn",
    href: NAV_ITEMS.learn.href,
    label: NAV_ITEMS.learn.label,
    description: NAV_ITEMS.learn.description,
    children: [
      ...childrenFromNavGroup("grow", ["research"]),
      HEADER_EXTRA_CHILDREN.learnClassroom,
      HEADER_EXTRA_CHILDREN.learnGuide,
    ],
  },
  {
    id: "market",
    href: NAV_ITEMS.market.href,
    label: HEADER_EXTRA_ENTRY_TEXT.marketShortLabel,
    description: NAV_ITEMS.market.description,
  },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function pathMatchesAny(
  pathname: string,
  prefixes: readonly string[]
): boolean {
  return prefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

/** Return whether a pathname belongs to the Studio work purpose in the header. */
function isStudioWorkPurpose(pathname: string): boolean {
  if (!matchesPrefix(pathname, "/studio")) return false;
  return !pathMatchesAny(pathname, STUDIO_WORK_EXCLUDED_PREFIXES);
}

/** Exact destination state for drawer/utility items. A child page must not make
 * both its purpose hub and the child destination announce aria-current="page". */
function useDestinationActive() {
  useBilingualI18nRevision();
  const path = canonicalSitePath(usePathname());
  return (href: string, exact?: boolean) => {
    const destination = canonicalSitePath(href);
    if (exact) return path === destination;
    return path === destination || path.startsWith(`${destination}/`);
  };
}

type HeaderSectionId =
  | "studio"
  | "virtual-studio"
  | "collaborate"
  | "explore"
  | "community"
  | "learn"
  | "market";

/** 최상위 메뉴 목적지 → 구역. 데스크톱 주 메뉴와 모바일 하단 탭이 같은 판정을 쓴다.
 * 손으로 쓴 표가 아니라 위 구성 계획(HEADER_PRIMARY_NAVIGATION)에서 파생한다 —
 * 메뉴 구성이 바뀌면 구역 판정도 자동으로 따라간다. */
const HEADER_SECTION_BY_HREF: Readonly<Record<string, HeaderSectionId>> =
  Object.fromEntries(
    HEADER_PRIMARY_NAVIGATION.map((item) => [item.href, item.id] as const),
  ) as Readonly<Record<string, HeaderSectionId>>;

/**
 * 현재 경로가 속한 헤더 구역 하나를 고른다. 항목마다 따로 판정하면 경계 경로
 * (예: /studio/manual, /studio/space/…)에서 두 메뉴가 동시에 켜지므로, 우선순위 순서로
 * 한 번만 분류한다. 어느 구역에도 속하지 않는 소개·계정 화면은 null이다.
 */
function headerSectionForPath(rawPathname: string): HeaderSectionId | null {
  const pathname = canonicalSitePath(rawPathname);
  if (VIRTUAL_STUDIO_PATTERN.test(pathname)) return "virtual-studio";
  if (pathMatchesAny(pathname, COLLABORATION_PURPOSE_PREFIXES)) return "collaborate";
  // 리서치 데스크는 단일 지도에서도 자료·성장(grow) 그룹이라 배우기 구역으로 본다.
  if (pathMatchesAny(pathname, STUDIO_LEARN_PREFIXES) || matchesPrefix(pathname, "/research")) return "learn";
  if (matchesPrefix(pathname, "/market")) return "market";
  if (
    matchesPrefix(pathname, "/studio")
    || pathMatchesAny(pathname, STUDIO_CREATE_PREFIXES)
    || pathMatchesAny(pathname, STUDIO_ASSET_PREFIXES)
    || pathMatchesAny(pathname, STUDIO_PUBLISH_PREFIXES)
  ) return "studio";
  // /create 정확 경로는 작품 시작 시트라 제작 문맥이다. 하위 경로는 갤러리 문맥을 유지한다.
  if (pathname === "/create") return "studio";
  if (matchesPrefix(pathname, "/community") || pathMatchesAny(pathname, COMMUNITY_PURPOSE_PREFIXES)) return "community";
  if (isDiscoverPurposeRoute(pathname)) return "explore";
  return null;
}

/** Broader state used only by the top-level purpose choices. */
function purposeActive(
  pathname: string,
  href: string,
  exact?: boolean
): boolean {
  const section = HEADER_SECTION_BY_HREF[href];
  if (section) return headerSectionForPath(pathname) === section;
  const destination = TOONSTUDIO_PRIMARY_NAVIGATION.find(
    (item) => item.href === href
  );
  if (destination)
    return workspaceNavigationActiveId(pathname) === destination.id;
  if (href === "/studio") return isStudioWorkPurpose(pathname);
  if (href === "/studio/assets")
    return pathMatchesAny(pathname, STUDIO_ASSET_PREFIXES);
  if (href === "/studio/publish")
    return pathMatchesAny(pathname, STUDIO_PUBLISH_PREFIXES);
  if (href === "/learn") return pathMatchesAny(pathname, STUDIO_LEARN_PREFIXES);
  if (exact || href === "/") return pathname === href;
  if (href === "/discover") return isDiscoverPurposeRoute(pathname);
  if (href === "/ranking") return matchesPrefix(pathname, "/ranking");
  if (href === "/community")
    // /create 정확 경로는 시작 시트(제작 목적)라 커뮤니티로 세지 않는다. 하위 경로는 그대로다.
    return pathname !== "/create" && pathMatchesAny(pathname, COMMUNITY_PURPOSE_PREFIXES);
  if (href === "/library") return matchesPrefix(pathname, "/library");
  if (href === "/my") return pathMatchesAny(pathname, MY_PURPOSE_PREFIXES);
  if (href === "/market") return matchesPrefix(pathname, "/market");
  return matchesPrefix(pathname, href);
}

function matchesMobileNavigationViewport() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches
  );
}

const DESKTOP_NAVIGATION_QUERY = "(min-width: 1180px)";

function useMobileNavigationViewport() {
  useBilingualI18nRevision();
  const [isMobile, setIsMobile] = useState(matchesMobileNavigationViewport);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isMobile;
}

function MobileNavigationFallback() {
  useBilingualI18nRevision();
  return (
    <nav
      aria-hidden="true"
      className="fixed inset-x-0 bottom-0 z-50 h-[calc(3.75rem+env(safe-area-inset-bottom))] border-t border-line/80 bg-panel/90 backdrop-blur-xl md:hidden"
    />
  );
}

/** One top-level header destination, with an optional hover/focus dropdown.
 * The panel opens on pointer hover and on keyboard focus-within; it is
 * `visibility: hidden` otherwise so its links stay out of the tab order.
 * 1차 표시는 시안처럼 글자 링크만 둔다(목적지·드롭다운은 그대로, 아이콘은 패널 안에서만). */
function HeaderPrimaryNavigationEntry({
  item,
  locale,
  currentSection,
  isActive,
}: {
  item: HeaderPrimaryNavigationItem;
  locale: string;
  currentSection: HeaderSectionId | null;
  isActive: (href: string, exact?: boolean) => boolean;
}) {
  // 구역이 하나로 정해지므로 최상위 강조도 항상 한 곳뿐이다. 하위 항목은 그 구역 안에서만 표시한다.
  const highlighted = currentSection === item.id;
  const activeChild = highlighted
    ? item.children?.find((child) => isActive(child.href, child.exact))
    : undefined;
  const label = siteNavigationText(item.label, locale);

  const link = (
    <Link
      href={item.href}
      aria-current={highlighted ? (isActive(item.href, true) ? "page" : "true") : undefined}
      aria-haspopup={item.children ? "true" : undefined}
      title={siteNavigationText(item.description, locale)}
      data-navigation-entry={item.id}
      className="site-header__primary-link group"
    >
      <span>{label}</span>
      {item.children ? (
        <ChevronDown
          size={13}
          aria-hidden="true"
          className="text-fg-3 transition-transform duration-150 group-hover:rotate-180 group-focus-within:rotate-180 motion-reduce:transition-none"
        />
      ) : null}
    </Link>
  );

  if (!item.children) return link;

  return (
    <div className="group relative">
      {link}
      <div className="invisible absolute left-0 top-full z-50 w-64 translate-y-1 pt-1 opacity-0 transition-[opacity,transform,visibility] duration-150 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none">
        <ul
          aria-label={label}
          className="rounded-xl border border-line bg-panel p-1.5 shadow-2xl"
        >
          {item.children.map((child) => {
            const childActive = activeChild?.id === child.id;
            const ChildIcon = child.icon;
            return (
              <li key={child.id}>
                <Link
                  href={child.href}
                  aria-current={childActive ? "page" : undefined}
                  className={cx(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    childActive
                      ? "bg-accent-soft text-accent"
                      : "text-fg-2 hover:bg-raised hover:text-fg"
                  )}
                >
                  <ChildIcon
                    size={16}
                    aria-hidden="true"
                    className="shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {siteNavigationText(child.label, locale)}
                    </span>
                    <span className="block truncate text-xs text-fg-3">
                      {siteNavigationText(child.description, locale)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Render the responsive site header for the active Studio or Spectrum context. */
export function SiteHeader() {
  useBilingualI18nRevision();
  const isActive = useDestinationActive();
  const pathname = usePathname();
  const language = useI18n((state) => state.lang);
  const locale = siteNavigationLocale(language);
  const t = useT();
  const openSearch = useUi((state) => state.openCommandPalette);

  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isMobileNavigationViewport = useMobileNavigationViewport();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shouldRenderMobileNavigation = menuOpen || isMobileNavigationViewport;
  const hideBottomTabs = isImmersiveMobileRoute(pathname);
  const navigationContext = siteNavigationContextForPath(pathname);
  const isPublicPage = isPublicCreativeRoute(pathname);
  const isHomePage = canonicalSitePath(pathname) === "/";
  const headerRef = useRef<HTMLElement>(null);
  useSiteHeaderHeight(headerRef);
  const create = SITE_NAVIGATION_ITEMS.make;
  const brandHref = "/";
  // ToonStudio is the user-facing product name across public and creator contexts. The
  // navigation contract may change by audience, but the brand must not appear to switch apps.
  const brandName = "ToonStudio";
  const brandDescription =
    navigationContext === "studio"
      ? SITE_NAVIGATION_ITEMS.production.description
      : SITE_NAVIGATION_ITEMS.home.description;
  const brandTagline = bi("이야기를 작품으로", "Bring stories to life");
  const isPurposeActive = (href: string, exact?: boolean) =>
    purposeActive(pathname, href, exact);
  const currentSection = headerSectionForPath(pathname);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    window.requestAnimationFrame(() =>
      triggerRef.current?.focus({ preventScroll: true })
    );
  }, [setMenuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let frame = 0;
    const syncScrolled = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() =>
        setScrolled(window.scrollY > 8)
      );
    };
    syncScrolled();
    window.addEventListener("scroll", syncScrolled, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", syncScrolled);
    };
  }, []);

  useEffect(() => {
    const desktopNavigation = window.matchMedia(DESKTOP_NAVIGATION_QUERY);
    const closeAtDesktop = () => {
      if (desktopNavigation.matches) setMenuOpen(false);
    };
    closeAtDesktop();
    desktopNavigation.addEventListener("change", closeAtDesktop);
    return () =>
      desktopNavigation.removeEventListener("change", closeAtDesktop);
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        data-site-chrome="header"
        data-site-product={navigationContext}
        data-public-site={isPublicPage || undefined}
        data-site-home={isHomePage || undefined}
        data-scrolled={scrolled || undefined}
        className="site-header"
      >
        <div className="site-header__inner">
          <Link
            href={brandHref}
            aria-label={`${brandName} · ${siteNavigationText(
              brandDescription,
              locale
            )}`}
            className="site-header__brand group"
          >
            <span className="site-header__brand-mark">
              <ToonStudioMark className="size-7 rounded-md" />
            </span>
            <span className="site-header__brand-copy">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-display text-[1.05rem] font-bold tracking-[-0.02em] text-fg transition-colors group-hover:text-accent sm:text-lg">
                  <ToonStudioWordmark />
                </span>
              </span>
              <span className="site-header__tagline">
                {brandTagline}
              </span>
            </span>
          </Link>

          <nav
            aria-label={bi("주요 메뉴", "Primary navigation")}
            className="site-header__primary"
          >
            {HEADER_PRIMARY_NAVIGATION.map((item) => (
              <HeaderPrimaryNavigationEntry
                key={item.id}
                item={item}
                locale={locale}
                currentSection={currentSection}
                isActive={isActive}
              />
            ))}
          </nav>

          <div className="site-header__utilities">
            <button
              type="button"
              onClick={openSearch}
              aria-label={t("nav.searchOpen")}
              className="site-header__search group flex size-11 shrink-0 items-center justify-center rounded-md border border-line bg-card/80 text-fg-3 outline-none transition-[border-color,background-color,color,box-shadow] duration-150 hover:border-line-strong hover:bg-card hover:text-fg-2 focus-visible:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:justify-between sm:px-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Search
                  size={16}
                  className="shrink-0 transition-colors group-hover:text-accent"
                />
                <span className="site-header__search-label truncate text-sm">
                  {t("nav.search")}
                </span>
              </span>
              <kbd
                aria-hidden="true"
                className="site-header__search-shortcut items-center gap-0.5 rounded border border-line bg-panel px-1 py-0.5 font-display text-[0.62rem] text-fg-3"
              >
                ⌘K
              </kbd>
            </button>

            {/* 새 작품은 위치가 아니라 동작이다. 현재 위치 표시는 주 메뉴 한 곳에만 둔다. */}
            <Link
              href={CANONICAL_CREATE_HREF}
              aria-label={siteNavigationText(create.label, locale)}
              title={siteNavigationText(create.description, locale)}
              className="site-header__create group relative hidden h-11 min-w-11 shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-md border border-line-strong bg-fg px-3 text-sm font-bold text-canvas [text-wrap:nowrap] [word-break:keep-all] shadow-sm outline-none transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none sm:flex"
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-on-accent/40 to-transparent"
              />
              <Palette
                size={16}
                className="shrink-0 transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-110"
              />
              <span className="hidden min-w-max whitespace-nowrap xl:inline-block">
                {keepInlineText(siteNavigationText(create.label, locale))}
              </span>
            </Link>

            {/* 화면 분위기 전환은 홈 머리글과 설정 화면에만 둔다(하위 페이지 머리글을 가볍게). */}
            {isHomePage && <PublicSiteAppearanceToggle locale={locale} className="site-header__appearance" />}

            <Suspense fallback={null}>
              <EngagementHeaderNotifications />
            </Suspense>

            <AuthMenuShell />

            <button
              ref={triggerRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={
                menuOpen
                  ? `${t("nav.allMenu")} ${t("common.close")}`
                  : t("nav.allMenu")
              }
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              className="grid size-11 shrink-0 place-items-center rounded-md border border-line bg-card/80 text-fg-2 outline-none transition-[border-color,background-color,color,transform] hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] min-[1180px]:hidden"
            >
              {menuOpen ? (
                <X size={18} aria-hidden="true" />
              ) : (
                <Menu size={18} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>

      {shouldRenderMobileNavigation && (
        <Suspense
          fallback={
            isMobileNavigationViewport && !hideBottomTabs ? (
              <MobileNavigationFallback />
            ) : null
          }
        >
          <MobileHeaderNavigation
            menuOpen={menuOpen}
            menuId={menuId}
            panelRef={panelRef}
            closeMenu={closeMenu}
            isActive={isActive}
            isPurposeActive={isPurposeActive}
            hideBottomTabs={hideBottomTabs}
            isMobileViewport={isMobileNavigationViewport}
          />
        </Suspense>
      )}
    </>
  );
}
