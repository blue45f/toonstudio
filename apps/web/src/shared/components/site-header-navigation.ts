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
const STUDIO_LEARN_PREFIXES = ["/learn", "/help", "/guide", "/studio/manual", "/developers"] as const;
const STUDIO_PUBLISH_PREFIXES = ["/studio/publish", "/publishing", "/publish", "/creator", "/automation", "/creator-support", "/cuts/studio"] as const;
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
export const VIRTUAL_STUDIO_PATTERN = /^\/studio\/(?:space|p\/[^/]+\/space)(?:\/|$)/u;
const COMMUNITY_PURPOSE_PREFIXES = ["/reviews", "/showcase", "/create", "/pencafe", "/events", "/newsletter", "/character-chat", "/support-creators"] as const;
const MY_PURPOSE_PREFIXES = ["/my", "/me", "/library", "/notifications", "/messages", "/settings", "/memberships"] as const;

export type HeaderSectionId = "studio" | "explore" | "market" | "learn" | "community";

export interface HeaderNavigationChild {
  readonly id: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: SiteNavigationText;
  readonly description: SiteNavigationText;
  readonly exact?: boolean;
}

export interface HeaderNavigationGroup {
  readonly id: string;
  readonly label: SiteNavigationText;
  readonly children: readonly HeaderNavigationChild[];
}

export interface HeaderPrimaryNavigationItem {
  readonly id: HeaderSectionId;
  readonly href: string;
  readonly label: SiteNavigationText;
  readonly description: SiteNavigationText;
  readonly children?: readonly HeaderNavigationChild[];
  readonly groups?: readonly HeaderNavigationGroup[];
}

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
 * - collaborateEntry: 맥락형 메뉴의 "협업"이라는 묶음 이름은 지도 그룹 어디에도 없다
 *   (connect 그룹은 "함께 보기"). 묶음 자체는 유지하되 문구는 여기에만 둔다.
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
    // /guide의 실제 내용은 랭킹 산식 공개 페이지다(페이지 제목 "랭킹은 이렇게 매겨집니다",
    // 브라우저 제목·사이트맵은 "랭킹 산정 방식"). "서비스 사용법"으로 안내하면 사용법
    // 가이드를 기대한 사용자가 통계 산식 페이지에 도착하므로, 목적지 이름과 맞춘다.
    label: { ko: "랭킹 산정 방식", en: "How ranking works" },
    description: {
      ko: "순위가 계산되는 산식과 직접 검산하는 방법",
      en: "The formula behind rankings and how to verify it",
    },
  },
} as const satisfies Record<string, HeaderNavigationChild>;

/** 현재 주 메뉴는 창작 여정의 다섯 목적지를 따르며 협업 링크는 내 작업 패널에 보존한다. */
export const HEADER_PRIMARY_NAVIGATION: readonly HeaderPrimaryNavigationItem[] = [
  {
    id: "studio",
    href: NAV_ITEMS.studio.href,
    label: NAV_ITEMS.studio.label,
    description: NAV_ITEMS.studio.description,
    groups: [
      {
        id: "create",
        label: NAV_ITEMS.studio.label,
        children: childrenFromNavGroup("create", ["studio", "make", "comic", "shaper", "bg3d", "virtual-studio"]),
      },
      {
        id: "together",
        label: { ko: "함께 만들기", en: "Make together" },
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
    children: [HEADER_EXTRA_CHILDREN.exploreGenres, ...childrenFromNavGroup("discover", ["ranking", "calendar"])],
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
    children: [...childrenFromNavGroup("grow", ["research"]), HEADER_EXTRA_CHILDREN.learnClassroom, HEADER_EXTRA_CHILDREN.learnGuide],
  },
  {
    id: "community",
    href: NAV_ITEMS.community.href,
    label: NAV_ITEMS.community.label,
    description: NAV_ITEMS.community.description,
    children: [childFromNavItem(NAV_ITEMS.reviews), childFromNavItem(NAV_ITEMS.gallery), childFromNavItem(NAV_ITEMS.opportunities)],
  },
];

const HEADER_SECTION_BY_HREF: ReadonlyMap<string, HeaderSectionId> = new Map(
  HEADER_PRIMARY_NAVIGATION.map((item) => [item.href, item.id]),
);

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

/**
 * 현재 경로가 속한 헤더 구역 하나를 고른다. 항목마다 따로 판정하면 경계 경로
 * (예: /studio/manual, /studio/space/…)에서 두 메뉴가 동시에 켜지므로, 우선순위 순서로
 * 한 번만 분류한다. 어느 구역에도 속하지 않는 소개·계정 화면은 null이다.
 */
export function headerSectionForPath(rawPathname: string): HeaderSectionId | null {
  const pathname = canonicalSitePath(rawPathname);
  // 가상 스튜디오는 S1-2부터 제작 하위 도구라 별도 구역이 아니라 제작 구역으로 본다.
  // 제작 드롭다운 안에서 현재 위치(가상 스튜디오 자식)로 표시된다.
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
  if (matchesPrefix(pathname, "/community") || matchesPrefix(pathname, "/opportunities") || pathMatchesAny(pathname, COMMUNITY_PURPOSE_PREFIXES)) return "community";
  if (isDiscoverPurposeRoute(pathname) || matchesPrefix(pathname, "/cuts")) return "explore";
  return null;
}

/** Broader state used only by the top-level purpose choices. */
export function purposeActive(
  pathname: string,
  href: string,
  exact?: boolean
): boolean {
  const section = HEADER_SECTION_BY_HREF.get(href);
  if (section) return headerSectionForPath(pathname) === section;
  const destination = TOONSTUDIO_PRIMARY_NAVIGATION.find(
    (item) => item.href === href
  );
  if (destination)
    return workspaceNavigationActiveId(pathname) === destination.id;
  if (href === "/studio") return isStudioWorkPurpose(pathname);
  // 가상 스튜디오는 S1-2에서 최상위에서 내려와 구역 표(HEADER_SECTION_BY_HREF)에
  // 없으므로, 자체 패턴으로 직접 판정한다(프로젝트 공간 경로 포함).
  if (href === "/studio/space") return VIRTUAL_STUDIO_PATTERN.test(pathname);
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
