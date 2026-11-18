import { BookOpen, GraduationCap, LayoutGrid, UsersRound, type LucideIcon } from "lucide-react";

import {
  SITE_NAVIGATION_GROUPS,
  SITE_NAVIGATION_ITEMS,
  TOONSTUDIO_PRIMARY_NAVIGATION,
  type SiteNavigationGroup,
  type SiteNavigationItem,
  type SiteNavigationText,
} from "./site-navigation";
import { isDiscoverPurposeRoute } from "./site-public-routes";
import { workspaceNavigationActiveId } from "./workspace/workspace-navigation-model";

import { canonicalSitePath } from "@/shared/lib/site-route-authority";

/**
 * 데스크톱 헤더 1차 메뉴의 구성과 현재 구역 판정.
 *
 * 헤더는 자체 분류를 갖지 않고 단일 지도(SITE_NAVIGATION_GROUPS·ITEMS)를 소비한다.
 * 이름·설명·아이콘·주소는 지도의 정본을 그대로 쓰고, 헤더가 정하는 것은 "구성"뿐이다.
 *
 * 2026-11-18 동선 재구성: 1차 메뉴는 창작 여정 순서대로 5개만 상시 노출한다.
 *   내 작업 → 작품 찾기 → 소재 찾기 → 배우기 → 커뮤니티
 * 협업(제작 관리·팀·구인)은 독립 축이 아니라 "함께 만들기" 묶음으로 내 작업 패널 안에
 * 들어간다. 팀이 없는 사용자에게 상시 축으로 보일 이유가 없고, 팀이 있는 사용자는 같은
 * 패널에서 1클릭으로 닿는다. 어느 목적지도 삭제하지 않았다 — 전체 메뉴·⌘K도 그대로다.
 */

export interface HeaderNavigationChild {
  readonly id: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: SiteNavigationText;
  readonly description: SiteNavigationText;
  /** 하위 경로 전체가 아니라 정확히 이 주소일 때만 현재 위치로 표시한다. */
  readonly exact?: boolean;
}

export interface HeaderNavigationChildGroup {
  readonly id: string;
  readonly label: SiteNavigationText;
  readonly children: readonly HeaderNavigationChild[];
}

export interface HeaderPrimaryNavigationItem {
  readonly id: HeaderSectionId;
  readonly href: string;
  readonly label: SiteNavigationText;
  readonly description: SiteNavigationText;
  readonly exact?: boolean;
  /** 패널 안의 묶음. 한 묶음이면 제목 없이 한 줄 목록으로 그린다. */
  readonly groups?: readonly HeaderNavigationChildGroup[];
}

export type HeaderSectionId = "studio" | "explore" | "market" | "learn" | "community";

const NAV_ITEMS = SITE_NAVIGATION_ITEMS;

/** 단일 지도에서 그룹을 id로 찾는다. 없는 id를 쓰면 조용히 비우지 않고 즉시 실패한다. */
function navGroup(id: string): SiteNavigationGroup {
  const group = SITE_NAVIGATION_GROUPS.find((entry) => entry.id === id);
  if (!group) throw new Error(`Unknown site navigation group: ${id}`);
  return group;
}

/** 지도 항목 → 헤더 패널 자식. 이름·설명·아이콘·주소는 지도의 정본을 쓴다. */
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

/** 지도 그룹의 항목들로 패널 자식을 만든다. 순서는 지도의 순서를 따른다. */
function childrenFromNavGroup(groupId: string, itemIds: readonly string[]): HeaderNavigationChild[] {
  const group = navGroup(groupId);
  return itemIds.map((itemId) => {
    const found = group.items.find((entry) => entry.id === itemId);
    if (!found) throw new Error(`Navigation item "${itemId}" is not in group "${groupId}"`);
    return childFromNavItem(found);
  });
}

/**
 * 지도에 아직 없는 헤더 전용 목적지. 여기에 있는 것만이 헤더가 지도 밖에서 정의하는
 * 내비 데이터이며, 지도에 항목이 생기면 이쪽을 지우고 지도를 소비한다.
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
    description: { ko: "장르·태그·플랫폼 조건으로 작품 찾기", en: "Browse stories by genre, tag and platform" },
  },
  learnClassroom: {
    id: "header-learn-classroom",
    href: "/learn/classroom",
    icon: GraduationCap,
    label: { ko: "클래스룸", en: "Classroom" },
    description: { ko: "단계별 강좌로 창작 실력 키우기", en: "Level up with step-by-step courses" },
  },
  learnGuide: {
    id: "header-learn-guide",
    href: "/guide",
    icon: BookOpen,
    // /guide의 실제 내용은 랭킹 산식 공개 페이지다. 목적지 이름과 맞춘다.
    label: { ko: "랭킹 산정 방식", en: "How ranking works" },
    description: {
      ko: "순위가 계산되는 산식과 직접 검산하는 방법",
      en: "The formula behind rankings and how to verify it",
    },
  },
} as const satisfies Record<string, HeaderNavigationChild>;

const GROUP_TEXT = {
  make: { ko: "만들기", en: "Make" },
  together: { ko: "함께 만들기", en: "Make together" },
  find: { ko: "찾아보기", en: "Browse" },
  study: { ko: "배우기", en: "Study" },
  share: { ko: "나누기", en: "Share" },
} as const satisfies Record<string, SiteNavigationText>;

export const HEADER_PRIMARY_NAVIGATION: readonly HeaderPrimaryNavigationItem[] = [
  {
    id: "studio",
    href: NAV_ITEMS.studio.href,
    label: NAV_ITEMS.studio.label,
    description: NAV_ITEMS.studio.description,
    groups: [
      {
        id: "make",
        label: GROUP_TEXT.make,
        children: childrenFromNavGroup("create", ["studio", "make", "comic", "shaper", "bg3d", "virtual-studio"]),
      },
      {
        id: "together",
        label: GROUP_TEXT.together,
        children: [
          childFromNavItem(NAV_ITEMS.production, { exact: undefined }),
          HEADER_EXTRA_CHILDREN.teamPeople,
          childFromNavItem(NAV_ITEMS.collaborate),
        ],
      },
    ],
  },
  {
    id: "explore",
    href: NAV_ITEMS.explore.href,
    label: NAV_ITEMS.explore.label,
    description: NAV_ITEMS.explore.description,
    groups: [
      {
        id: "find",
        label: GROUP_TEXT.find,
        children: [HEADER_EXTRA_CHILDREN.exploreGenres, ...childrenFromNavGroup("discover", ["ranking", "calendar"])],
      },
    ],
  },
  {
    id: "market",
    href: NAV_ITEMS.market.href,
    label: NAV_ITEMS.market.label,
    description: NAV_ITEMS.market.description,
  },
  {
    id: "learn",
    href: NAV_ITEMS.learn.href,
    label: NAV_ITEMS.learn.label,
    description: NAV_ITEMS.learn.description,
    groups: [
      {
        id: "study",
        label: GROUP_TEXT.study,
        children: [
          ...childrenFromNavGroup("grow", ["research"]),
          HEADER_EXTRA_CHILDREN.learnClassroom,
          HEADER_EXTRA_CHILDREN.learnGuide,
        ],
      },
    ],
  },
  {
    id: "community",
    href: NAV_ITEMS.community.href,
    label: NAV_ITEMS.community.label,
    description: NAV_ITEMS.community.description,
    groups: [
      {
        id: "share",
        label: GROUP_TEXT.share,
        children: [childFromNavItem(NAV_ITEMS.reviews), childFromNavItem(NAV_ITEMS.gallery), childFromNavItem(NAV_ITEMS.opportunities)],
      },
    ],
  },
];

/** 패널 묶음을 한 줄 목록으로 편다. 현재 위치 판정과 키보드 이동이 같은 순서를 쓴다. */
export function headerNavigationChildren(item: HeaderPrimaryNavigationItem): readonly HeaderNavigationChild[] {
  return item.groups?.flatMap((group) => group.children) ?? [];
}

const STUDIO_ASSET_PREFIXES = [
  "/studio/assets", "/studio/brushes", "/studio/bg3d", "/studio/poser", "/studio/character",
  "/brush-lab", "/shaper", "/music",
] as const;
const STUDIO_CREATE_PREFIXES = ["/studio/new", "/studio/import", "/make"] as const;
const STUDIO_LEARN_PREFIXES = ["/learn", "/help", "/guide", "/studio/manual", "/developers"] as const;
const STUDIO_PUBLISH_PREFIXES = [
  "/studio/publish", "/publishing", "/publish", "/creator", "/automation", "/creator-support", "/cuts/studio",
] as const;
const STUDIO_WORK_EXCLUDED_PREFIXES = [
  ...STUDIO_CREATE_PREFIXES,
  ...STUDIO_ASSET_PREFIXES,
  ...STUDIO_LEARN_PREFIXES,
  ...STUDIO_PUBLISH_PREFIXES,
  "/studio/templates",
] as const;
/** 협업 목적지: 제작 관리·팀·구인/의뢰. 내 작업 구역의 "함께 만들기" 묶음이다. */
const COLLABORATION_PURPOSE_PREFIXES = ["/production", "/team", "/collaborate"] as const;
/** 개인 가상 스튜디오와 프로젝트 협업 공간. */
export const VIRTUAL_STUDIO_PATTERN = /^\/studio\/(?:space|p\/[^/]+\/space)(?:\/|$)/u;
const COMMUNITY_PURPOSE_PREFIXES = [
  "/reviews", "/showcase", "/create", "/pencafe", "/events", "/newsletter", "/character-chat",
  "/support-creators", "/opportunities",
] as const;
const MY_PURPOSE_PREFIXES = ["/my", "/me", "/library", "/notifications", "/messages", "/settings", "/memberships"] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function pathMatchesAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

/** Return whether a pathname belongs to the Studio work purpose in the header. */
function isStudioWorkPurpose(pathname: string): boolean {
  if (!matchesPrefix(pathname, "/studio")) return false;
  return !pathMatchesAny(pathname, STUDIO_WORK_EXCLUDED_PREFIXES);
}

/** 최상위 메뉴 목적지 → 구역. 데스크톱 주 메뉴와 모바일 하단 탭이 같은 판정을 쓴다. */
const HEADER_SECTION_BY_HREF: Readonly<Record<string, HeaderSectionId>> = Object.fromEntries(
  HEADER_PRIMARY_NAVIGATION.map((entry) => [entry.href, entry.id] as const),
);

/**
 * 현재 경로가 속한 헤더 구역 하나를 고른다. 항목마다 따로 판정하면 경계 경로
 * (예: /studio/manual, /studio/space/…)에서 두 메뉴가 동시에 켜지므로, 우선순위 순서로
 * 한 번만 분류한다. 어느 구역에도 속하지 않는 소개·계정 화면은 null이다.
 */
export function headerSectionForPath(rawPathname: string): HeaderSectionId | null {
  const pathname = canonicalSitePath(rawPathname);
  // 가상 스튜디오와 협업은 내 작업 구역의 하위 묶음이다(패널 안에서 현재 위치로 표시된다).
  if (VIRTUAL_STUDIO_PATTERN.test(pathname)) return "studio";
  if (pathMatchesAny(pathname, COLLABORATION_PURPOSE_PREFIXES)) return "studio";
  // 리서치 데스크는 단일 지도에서도 자료·성장(grow) 그룹이라 배우기 구역으로 본다.
  if (pathMatchesAny(pathname, STUDIO_LEARN_PREFIXES) || matchesPrefix(pathname, "/research")) return "learn";
  if (matchesPrefix(pathname, "/market") || matchesPrefix(pathname, "/asset-points")) return "market";
  if (
    matchesPrefix(pathname, "/studio")
    || pathMatchesAny(pathname, STUDIO_CREATE_PREFIXES)
    || pathMatchesAny(pathname, STUDIO_ASSET_PREFIXES)
    || pathMatchesAny(pathname, STUDIO_PUBLISH_PREFIXES)
  ) return "studio";
  // /create 정확 경로는 작품 시작 시트라 제작 문맥이다. 하위 경로는 갤러리 문맥을 유지한다.
  if (pathname === "/create") return "studio";
  if (matchesPrefix(pathname, "/community") || pathMatchesAny(pathname, COMMUNITY_PURPOSE_PREFIXES)) return "community";
  if (isDiscoverPurposeRoute(pathname) || matchesPrefix(pathname, "/cuts")) return "explore";
  return null;
}

/** Broader state used only by the top-level purpose choices (모바일 하단 탭과 전체 메뉴). */
export function purposeActive(pathname: string, href: string, exact?: boolean): boolean {
  const section = HEADER_SECTION_BY_HREF[href];
  if (section) return headerSectionForPath(pathname) === section;
  const destination = TOONSTUDIO_PRIMARY_NAVIGATION.find((entry) => entry.href === href);
  if (destination) return workspaceNavigationActiveId(pathname) === destination.id;
  if (href === "/studio") return isStudioWorkPurpose(pathname);
  if (href === "/studio/space") return VIRTUAL_STUDIO_PATTERN.test(pathname);
  if (href === "/production") return pathMatchesAny(pathname, COLLABORATION_PURPOSE_PREFIXES);
  if (href === "/studio/assets") return pathMatchesAny(pathname, STUDIO_ASSET_PREFIXES);
  if (href === "/studio/publish") return pathMatchesAny(pathname, STUDIO_PUBLISH_PREFIXES);
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
