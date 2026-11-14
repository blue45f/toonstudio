import { ArrowRight, BookOpen, ChevronRight, Coffee, Compass, FolderOpen, LayoutGrid, Palette, Search, Send, Sparkles, Users, X, type LucideIcon } from "lucide-react";
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

const TASK_EMBLEMS: Readonly<Partial<Record<string, string>>> = {
  discover: "/brand/luminous-atelier-20261114/icon-nav-discover-cuts.webp",
  create: "/brand/luminous-atelier-20261114/icon-studio-pen-ink.webp",
  grow: "/brand/luminous-atelier-20261114/icon-nav-learn-collab.webp",
  publish: "/brand/luminous-atelier-20261114/icon-studio-layers-color.webp",
  connect: "/brand/luminous-atelier-20261114/icon-nav-learn-collab.webp",
  rest: "/brand/luminous-atelier-20261114/icon-nav-discover-cuts.webp",
  personal: "/brand/luminous-atelier-20261114/icon-nav-asset-market.webp",
};

const CREATOR_JOURNEY_QUICK_STEPS = [
  {
    step: "01",
    item: SITE_NAVIGATION_ITEMS.now,
    emblem: "/brand/luminous-atelier-20261114/icon-nav-learn-collab.webp",
    koSub: "아이디어·콘티 출발",
    enSub: "Prompt & story",
  },
  {
    step: "02",
    item: SITE_NAVIGATION_ITEMS.comic,
    emblem: "/brand/luminous-atelier-20261114/icon-studio-pen-ink.webp",
    koSub: "펜·채색·말풍선",
    enSub: "Ink, color, type",
  },
  {
    step: "03",
    item: SITE_NAVIGATION_ITEMS.bg3d,
    emblem: "/brand/luminous-atelier-20261114/icon-studio-3d-pose.webp",
    koSub: "카메라·조명·마네킹",
    enSub: "Camera & rig",
  },
  {
    step: "04",
    item: SITE_NAVIGATION_ITEMS.market,
    emblem: "/brand/luminous-atelier-20261114/icon-nav-asset-market.webp",
    koSub: "브러시·CC0 3D",
    enSub: "Brushes & 3D",
  },
  {
    step: "05",
    item: SITE_NAVIGATION_ITEMS.publish,
    emblem: "/brand/luminous-atelier-20261114/icon-studio-layers-color.webp",
    koSub: "모바일 폭·연재",
    enSub: "QA & release",
  },
] as const;

/** 같은 목적은 전체 메뉴와 사이트맵에서 같은 입체 엠블럼과 아이콘으로 알아본다. */
export function SitePurposeGraphic({ group }: { readonly group: SiteNavigationGroup }) {
  const Icon = TASK_PICTOGRAMS[group.id] ?? LayoutGrid;
  const emblem = TASK_EMBLEMS[group.id];
  return (
    <span className="site-purpose-graphic" aria-hidden="true">
      {emblem ? (
        <img
          src={emblem}
          alt=""
          width={38}
          height={38}
          loading="lazy"
          decoding="async"
          className="site-purpose-graphic__emblem"
        />
      ) : (
        <Icon size={28} strokeWidth={1.75} />
      )}
    </span>
  );
}

/** 전체 기능을 한 패널에 쌓지 않고 5단계 창작 여정·목적별 페이지·검색 결과로 직관 연결한다. */
export function SiteMenuDestinations({ locale, currentGroupId, isActive, menuId }: {
  readonly locale: SiteNavigationLocale;
  readonly currentGroupId: string | null;
  readonly isActive: (href: string, exact?: boolean) => boolean;
  readonly menuId: string;
}) {
  const bt = useBilingual("site-menu-destinations");
  const isKo = locale === "ko";
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
        <section className="site-menu-journey" aria-label={bt("창작 5단계 빠른 이동", "5-stage creator workflow")}>
          <div className="site-menu-journey__head">
            <Sparkles size={15} aria-hidden="true" />
            <span>{bt("한눈에 이어지는 웹툰 창작 5단계 동선", "5-Stage Webtoon Creation Flow")}</span>
          </div>
          <ol className="site-menu-journey__grid">
            {CREATOR_JOURNEY_QUICK_STEPS.map((stage) => {
              const label = siteNavigationText(stage.item.label, locale);
              return (
                <li key={stage.item.id}>
                  <Link
                    href={stage.item.href}
                    aria-label={label}
                    aria-current={isActive(stage.item.href, stage.item.exact) ? "page" : undefined}
                    className="site-menu-journey__card"
                  >
                    <span className="site-menu-journey__emblem-wrap" aria-hidden="true">
                      <img
                        src={stage.emblem}
                        alt=""
                        width={36}
                        height={36}
                        loading="lazy"
                        decoding="async"
                        className="site-menu-journey__emblem"
                      />
                      <span className="site-menu-journey__step">{stage.step}</span>
                    </span>
                    <span className="site-menu-journey__text">
                      <strong>{label}</strong>
                      <small>{isKo ? stage.koSub : stage.enSub}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
        <div className="site-menu-purpose-section">
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
        </div>
      </>}
    </div>
  </>;
}
