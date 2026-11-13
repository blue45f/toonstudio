import { ArrowRight, BookOpen, ChevronRight, Coffee, Compass, FolderOpen, LayoutGrid, Palette, Search, Send, Users, X, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import {
  SITE_NAVIGATION_ITEMS,
  resolveNavigationGroupsFor,
  siteNavigationText,
  type SiteNavigationLocale,
  type SiteNavigationGroup,
} from "./site-navigation";
import { searchSiteMenu } from "./site-menu-search";
import "./site-menu.css";

const TASK_PICTOGRAMS: Readonly<Partial<Record<string, LucideIcon>>> = {
  discover: Compass, create: Palette, grow: BookOpen, publish: Send,
  connect: Users, rest: Coffee, personal: FolderOpen,
};

/** 같은 목적은 전체 메뉴와 사이트맵에서 같은 그림으로 알아본다. */
export function SitePurposeGraphic({ group }: { readonly group: SiteNavigationGroup }) {
  const Icon = TASK_PICTOGRAMS[group.id] ?? LayoutGrid;
  return <span className="site-purpose-graphic" aria-hidden="true"><Icon size={30} strokeWidth={1.7} /></span>;
}

/** 전체 기능을 한 패널에 쌓지 않고 목적별 페이지 또는 검색 결과로 연결한다. */
export function SiteMenuDestinations({ locale, currentGroupId, isActive, menuId }: {
  readonly locale: SiteNavigationLocale;
  readonly currentGroupId: string | null;
  readonly isActive: (href: string, exact?: boolean) => boolean;
  readonly menuId: string;
}) {
  const bt = useBilingual("site-menu-destinations");
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const results = searchSiteMenu(query);
  return <>
    <div className="site-menu-search">
      <label htmlFor={`${menuId}-search`}>{bt("어떤 작업을 찾으세요?", "What would you like to do?")}</label>
      <div className="site-menu-search__field">
        <Search size={19} aria-hidden="true" />
        <input id={`${menuId}-search`} type="search" value={query}
          placeholder={bt("메뉴 이름이나 하고 싶은 일 검색", "Search menus or tasks")}
          autoComplete="off" aria-controls={`${menuId}-destinations`}
          onChange={(event) => setQuery(event.target.value)} />
        {query ? <button type="button" onClick={() => {
          setQuery("");
          document.getElementById(`${menuId}-search`)?.focus();
        }} aria-label={bt("메뉴 검색 지우기", "Clear menu search")}><X size={18} aria-hidden="true" /></button> : null}
      </div>
    </div>
    <div id={`${menuId}-destinations`}>
      {searching ? <>
        <p className="site-menu-search__status" role="status">{bt("검색 결과", "Results")} · {results.length}</p>
        {results.length ? <ul className="site-menu-results">
          {results.map((item) => {
            const Icon = item.icon;
            return <li key={item.id}><Link href={item.href}
              aria-label={siteNavigationText(item.label, locale)}
              aria-current={isActive(item.href, item.exact) ? "page" : undefined}>
              <Icon size={20} aria-hidden="true" />
              <span><strong>{siteNavigationText(item.label, locale)}</strong><small>{siteNavigationText(item.description, locale)}</small></span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link></li>;
          })}
        </ul> : <div className="site-menu-empty">
          <p>{bt("일치하는 메뉴가 없습니다.", "No matching menus.")}</p>
          <p>{bt("다른 단어로 검색하거나 목적별 메뉴를 선택하세요.", "Try another word or choose a task below.")}</p>
          <button type="button" onClick={() => setQuery("")}>{bt("목적별 메뉴 보기", "Browse tasks")}</button>
        </div>}
      </> : <>
        <div className="site-menu-actions">
          {[SITE_NAVIGATION_ITEMS.make, SITE_NAVIGATION_ITEMS.studio].map((item, index) => {
            const Icon = item.icon;
            return <Link key={item.id} href={item.href} aria-label={siteNavigationText(item.label, locale)}
              aria-current={isActive(item.href, true) ? "page" : undefined}
              className={index === 0 ? "site-menu-actions__create" : "site-menu-actions__projects"}>
              <Icon size={20} aria-hidden="true" /><span>{siteNavigationText(item.label, locale)}</span><ArrowRight size={18} aria-hidden="true" />
            </Link>;
          })}
        </div>
        <p className="site-menu-task-label">{bt("목적별로 찾기", "Browse by task")}</p>
        <ul className="site-menu-tasks">
          {resolveNavigationGroupsFor().map((group) => <li key={group.id}>
            <Link href={`/sitemap/${group.id}`} className="site-menu-task"
              data-current-journey={group.id === currentGroupId ? "true" : undefined}>
              <SitePurposeGraphic group={group} />
              <span className="site-menu-task__copy"><strong>{siteNavigationText(group.label, locale)}</strong><small>{siteNavigationText(group.description, locale)}</small></span>
              <span className="site-menu-task__count">{group.id === currentGroupId ? bt("현재", "Current") : group.items.length}</span><ChevronRight size={18} aria-hidden="true" />
            </Link>
          </li>)}
        </ul>
      </>}
    </div>
  </>;
}
