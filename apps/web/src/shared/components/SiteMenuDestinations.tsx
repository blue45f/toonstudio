import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Coffee,
  Compass,
  FolderOpen,
  LayoutGrid,
  Palette,
  Search,
  Send,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  SITE_NAVIGATION_ITEMS,
  resolveNavigationGroupsFor,
  siteNavigationText,
  type SiteNavigationGroup,
  type SiteNavigationLocale,
} from "./site-navigation";
import { EXTRA_SITE_MENU_DESTINATIONS, searchSiteMenu } from "./site-menu-search";
import "./site-menu.css";
import "./site-menu-progressive.css";

const TASK_PICTOGRAMS: Readonly<Partial<Record<string, LucideIcon>>> = {
  discover: Compass,
  create: Palette,
  grow: BookOpen,
  publish: Send,
  connect: Users,
  rest: Coffee,
  personal: FolderOpen,
};

/** 같은 목적은 전체 메뉴와 사이트맵에서 같은 선 아이콘으로 일관되게 표현한다. */
export function SitePurposeGraphic({ group }: { readonly group: SiteNavigationGroup }) {
  const Icon = TASK_PICTOGRAMS[group.id] ?? LayoutGrid;
  return (
    <span className="site-purpose-graphic" aria-hidden="true">
      <Icon size={20} strokeWidth={1.6} />
    </span>
  );
}

/** 시작 행동은 먼저, 나머지 기능은 목적을 고른 뒤 펼친다. 주소·권한은 기존 지도를 따른다. */
export function SiteMenuDestinations({
  locale,
  currentGroupId,
  isActive,
  menuId,
  currentPathname,
  reservedDestinationHrefs = [],
}: {
  readonly locale: SiteNavigationLocale;
  readonly currentGroupId: string | null;
  readonly isActive: (href: string, exact?: boolean) => boolean;
  readonly menuId: string;
  readonly currentPathname?: string;
  readonly reservedDestinationHrefs?: readonly string[];
}) {
  const bt = useBilingual("site-menu-destinations");
  const location = useLocation();
  const activePathname = currentPathname ?? location.pathname;
  // 홈에서는 모든 묶음을 접고, 작업 중 열었다면 현재 묶음 하나만 펼친다.
  const contextualGroupId = activePathname === "/" ? null : currentGroupId;
  const [expandedGroupId, setExpandedGroupId] = useState(contextualGroupId);
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const results = searchSiteMenu(query);
  const occupiedHrefs = new Set(reservedDestinationHrefs);
  const claimDestinations = <T extends { readonly href: string }>(items: readonly T[]): T[] => items.filter((item) => {
    if (occupiedHrefs.has(item.href)) return false;
    occupiedHrefs.add(item.href);
    return true;
  });
  const primaryActions = claimDestinations([SITE_NAVIGATION_ITEMS.make, SITE_NAVIGATION_ITEMS.studio]);
  const destinationGroups = resolveNavigationGroupsFor().map((group) => ({
    ...group,
    directItems: claimDestinations([
      ...group.items,
      ...EXTRA_SITE_MENU_DESTINATIONS.filter((item) => item.groupId === group.id),
    ]),
  }));
  const clearSearch = () => {
    setQuery("");
    document.getElementById(`${menuId}-search`)?.focus();
  };

  return <div className="site-menu-progressive">
    <div className="site-menu-search">
      <label htmlFor={`${menuId}-search`}>{bt("어떤 작업을 찾으세요?", "What would you like to do?")}</label>
      <div className="site-menu-search__field">
        <Search size={18} strokeWidth={1.7} aria-hidden="true" />
        <input
          id={`${menuId}-search`}
          type="search"
          value={query}
          placeholder={bt("메뉴 이름이나 하고 싶은 일 검색", "Search menus or tasks")}
          autoComplete="off"
          aria-controls={`${menuId}-destinations`}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? <button type="button" onClick={clearSearch} aria-label={bt("메뉴 검색 지우기", "Clear menu search")}>
          <X size={16} aria-hidden="true" />
        </button> : null}
      </div>
    </div>
    <div id={`${menuId}-destinations`}>
      {searching ? <>
        <p className="site-menu-search__status" role="status">{bt("검색 결과", "Results")} · {results.length}</p>
        {results.length ? <ul className="site-menu-results ink-cascade">
          {results.map((item) => {
            const Icon = item.icon;
            return <li key={item.id}>
              <Link href={item.href} aria-label={siteNavigationText(item.label, locale)} aria-current={isActive(item.href, item.exact) ? "page" : undefined}>
                <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
                <span><strong>{siteNavigationText(item.label, locale)}</strong><small>{siteNavigationText(item.description, locale)}</small></span>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </li>;
          })}
        </ul> : <div className="site-menu-empty">
          <p>{bt("일치하는 메뉴가 없습니다", "No matching menus")}</p>
          <p>{bt("다른 단어로 검색하거나 목적별 메뉴를 선택하세요", "Try another word or choose a task below")}</p>
          <button type="button" onClick={clearSearch}>{bt("목적별 메뉴 보기", "Browse tasks")}</button>
        </div>}
      </> : <>
        <div className="site-menu-actions">
          {primaryActions.map((item, index) => {
            const Icon = item.icon;
            return <Link
              key={item.id}
              href={item.href}
              aria-label={siteNavigationText(item.label, locale)}
              aria-current={isActive(item.href, true) ? "page" : undefined}
              className={index === 0 ? "site-menu-actions__create" : "site-menu-actions__projects"}
            >
              <Icon size={21} aria-hidden="true" />
              <span>{siteNavigationText(item.label, locale)}</span>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>;
          })}
        </div>
        <p className="site-menu-task-label">{bt("필요한 메뉴만 펼쳐 보세요", "Open just what you need")}</p>
        <div className="site-menu-tasks">
          {destinationGroups.map((group) => {
            const label = siteNavigationText(group.label, locale);
            const expanded = expandedGroupId === group.id;
            return <details
              key={group.id}
              className="site-menu-group"
              data-menu-group={group.id}
              data-current-group={group.id === contextualGroupId ? "true" : undefined}
              open={expanded}
            >
              <summary
                className="site-menu-task"
                aria-expanded={expanded}
                aria-controls={`${menuId}-group-${group.id}`}
                data-current-journey={group.id === contextualGroupId ? "true" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  setExpandedGroupId(expanded ? null : group.id);
                }}
              >
                <SitePurposeGraphic group={group} />
                <span className="site-menu-task__copy"><strong>{label}</strong><small>{siteNavigationText(group.description, locale)}</small></span>
                {group.id === contextualGroupId ? <span className="site-menu-group__current">{bt("현재", "Current")}</span> : null}
                <ChevronDown size={18} className="site-menu-group__chevron" aria-hidden="true" />
              </summary>
              <div id={`${menuId}-group-${group.id}`} className="site-menu-group__body" hidden={!expanded}>
                <ul className="site-menu-task__subgrid" aria-label={`${label} ${bt("바로가기", "shortcuts")}`}>
                  {group.directItems.map((item) => {
                    const Icon = item.icon;
                    const itemLabel = siteNavigationText(item.label, locale);
                    return <li key={item.id}>
                      <Link
                        href={item.href}
                        aria-label={itemLabel}
                        aria-current={isActive(item.href, item.exact) ? "page" : undefined}
                        className="site-menu-task__sublink"
                      >
                        <Icon size={17} aria-hidden="true" /><span>{itemLabel}</span>
                      </Link>
                    </li>;
                  })}
                </ul>
                <Link href={`/sitemap/${group.id}`} className="site-menu-group__all">
                  {bt("이 메뉴 자세히 보기", "Explore this section")}<ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </details>;
          })}
        </div>
      </>}
    </div>
  </div>;
}
