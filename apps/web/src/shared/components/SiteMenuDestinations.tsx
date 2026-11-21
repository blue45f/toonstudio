import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Coffee,
  Compass,
  FolderOpen,
  Home,
  LayoutGrid,
  LifeBuoy,
  Palette,
  Search,
  Send,
  Store,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";

import { cx } from "@/shared/lib/cx";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  SITE_NAVIGATION_ITEMS,
  resolveNavigationGroupsFor,
  siteNavigationText,
  type SiteNavigationGroup,
  type SiteNavigationLocale,
} from "./site-navigation";
import { searchSiteMenu } from "./site-menu-search";
import {
  CORE_SURFACE_QUICK_LINKS,
  CREATOR_JOURNEY_STAGES,
  accentToneBadgeClasses,
  accentToneChipClasses,
  journeyStageForNavigationGroupId,
  resolvePageRoleJourney,
  type JourneyStageNumber,
} from "./workspace/page-role-journey-map";
import "./site-menu.css";

const TASK_PICTOGRAMS: Readonly<Partial<Record<string, LucideIcon>>> = {
  discover: Compass,
  create: Palette,
  grow: BookOpen,
  publish: Send,
  connect: Users,
  rest: Coffee,
  personal: FolderOpen,
};

const STAGE_ICONS: Readonly<Record<JourneyStageNumber, LucideIcon>> = {
  1: Home,
  2: Palette,
  3: Workflow,
  4: Store,
  5: LifeBuoy,
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

/** 전체 기능을 한 패널에 쌓지 않고 5단계 창작 여정·현재 페이지 역할·목적별 지도·검색 결과로 직관 연결한다. */
export function SiteMenuDestinations({
  locale,
  currentGroupId,
  isActive,
  menuId,
  currentPathname,
}: {
  readonly locale: SiteNavigationLocale;
  readonly currentGroupId: string | null;
  readonly isActive: (href: string, exact?: boolean) => boolean;
  readonly menuId: string;
  readonly currentPathname?: string;
}) {
  const bt = useBilingual("site-menu-destinations");
  const location = useLocation();
  const activePathname = currentPathname ?? location.pathname;
  const isKo = locale === "ko";
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const results = searchSiteMenu(query);
  const currentRole = resolvePageRoleJourney(activePathname);
  const safeNextSteps = currentRole.recommendedNextSteps.filter(
    (step) => step.href !== "/settings",
  );

  return <>
    <div className="site-menu-search">
      <label htmlFor={`${menuId}-search`}>{bt("어떤 작업을 찾으세요?", "What would you like to do?")}</label>
      <div className="site-menu-search__field">
        <Search size={17} strokeWidth={1.5} aria-hidden="true" />
        <input
          id={`${menuId}-search`}
          type="search"
          value={query}
          placeholder={bt("메뉴 이름이나 하고 싶은 일 검색", "Search menus or tasks")}
          autoComplete="off"
          aria-controls={`${menuId}-destinations`}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              document.getElementById(`${menuId}-search`)?.focus();
            }}
            aria-label={bt("메뉴 검색 지우기", "Clear menu search")}
          >
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
    <div id={`${menuId}-destinations`}>
      {searching ? <>
        <p className="site-menu-search__status" role="status">{bt("검색 결과", "Results")} · {results.length}</p>
        {results.length ? (
          <ul className="site-menu-results ink-cascade">
            {results.map((item) => {
              const Icon = item.icon;
              const itemRole = resolvePageRoleJourney(item.href);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-label={siteNavigationText(item.label, locale)}
                    aria-current={isActive(item.href, item.exact) ? "page" : undefined}
                    data-journey-stage={itemRole.stageNumber}
                    data-accent-tone={itemRole.accentTone}
                  >
                    <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
                    <span>
                      <strong className="flex flex-wrap items-center gap-1.5">
                        <span>{siteNavigationText(item.label, locale)}</span>
                        <span
                          aria-hidden="true"
                          className={cx(
                            "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                            accentToneBadgeClasses(itemRole.accentTone),
                          )}
                        >
                          {isKo ? itemRole.stageBadgeKo : itemRole.stageBadgeEn}
                        </span>
                      </strong>
                      <small>{siteNavigationText(item.description, locale)}</small>
                    </span>
                    <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="site-menu-empty">
            <p>{bt("일치하는 메뉴가 없습니다", "No matching menus")}</p>
            <p>{bt("다른 단어로 검색하거나 목적별 메뉴를 선택하세요", "Try another word or choose a task below")}</p>
            <button type="button" onClick={() => setQuery("")}>{bt("목적별 메뉴 보기", "Browse tasks")}</button>
          </div>
        )}
      </> : <>
        <section
          className="site-menu-journey"
          data-journey-stage={currentRole.stageNumber}
          data-accent-tone={currentRole.accentTone}
          aria-label={bt("5단계 창작 여정 빠른 이동", "5-stage creator journey")}
        >
          <div className="site-menu-journey__head justify-between">
            <span>{bt("5단계 창작 여정 순서", "5-stage creation workflow")}</span>
            <span
              data-accent-tone={currentRole.accentTone}
              className={cx(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums [word-break:keep-all]",
                accentToneBadgeClasses(currentRole.accentTone),
              )}
            >
              {bt("현재", "Now")} · {isKo ? currentRole.stageBadgeKo : currentRole.stageBadgeEn}
            </span>
          </div>
          <ol className="site-menu-journey__grid ink-cascade">
            {CREATOR_JOURNEY_STAGES.map((stage, index) => {
              const label = isKo ? stage.shortLabelKo : stage.shortLabelEn;
              const StageIcon = STAGE_ICONS[stage.stageNumber];
              const isCurrentStage = stage.stageNumber === currentRole.stageNumber;
              return (
                <li key={stage.stageId} style={{ "--ink-i": index } as CSSProperties}>
                  <Link
                    href={stage.primaryHref}
                    aria-label={label}
                    aria-current={isActive(stage.primaryHref, stage.primaryHref === "/studio") ? "page" : undefined}
                    data-journey-stage={stage.stageNumber}
                    data-accent-tone={stage.accentTone}
                    data-current-stage={isCurrentStage ? "true" : undefined}
                    className="site-menu-journey__card ink-frame"
                  >
                    <span className="site-menu-journey__emblem-wrap" aria-hidden="true">
                      <span className="site-menu-journey__icon">
                        <StageIcon size={16} strokeWidth={1.5} />
                      </span>
                      <span className="site-menu-journey__step">{stage.stepCode}</span>
                    </span>
                    <span className="site-menu-journey__text">
                      <strong>{label}</strong>
                      <small>{isKo ? stage.subtitleKo : stage.subtitleEn}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <div className="mt-2.5 border-t border-line/70 pt-2.5">
            <p className="text-xs font-semibold text-fg [word-break:keep-all]">
              {bt("현재 페이지 역할", "Current page role")}: {isKo ? currentRole.roleHeadlineKo : currentRole.roleHeadlineEn}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={bt("핵심 표면 바로가기", "Core surface shortcuts")}>
              {CORE_SURFACE_QUICK_LINKS.map((surface) => {
                const label = isKo ? surface.labelKo : surface.labelEn;
                const reason = isKo ? surface.reasonKo : surface.reasonEn;
                return (
                  <li key={surface.href}>
                    <Link
                      href={surface.href}
                      title={reason}
                      data-accent-tone={surface.accentTone}
                      className={cx(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all]",
                        accentToneChipClasses(surface.accentTone, isActive(surface.href, surface.href === "/studio")),
                      )}
                    >
                      <span>{label}</span>
                      <ArrowRight size={13} strokeWidth={1.7} aria-hidden="true" className="text-fg-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {safeNextSteps.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-fg-3 [word-break:keep-all]">
                  {bt("다음 추천 동선", "Next steps")}:
                </span>
                {safeNextSteps.slice(0, 2).map((step) => (
                  <Link
                    key={step.href}
                    href={step.href}
                    title={isKo ? step.reasonKo : step.reasonEn}
                    data-accent-tone={step.accentTone}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] font-medium text-fg-2 transition-[border-color,background-color,color] duration-150 hover:border-accent/50 hover:bg-raised hover:text-fg motion-reduce:transition-none [word-break:keep-all]"
                  >
                    <span>{isKo ? step.labelKo : step.labelEn}</span>
                    <ChevronRight size={12} strokeWidth={1.6} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </section>
        <div className="site-menu-purpose-section">
          <div className="site-menu-actions">
            {[SITE_NAVIGATION_ITEMS.make, SITE_NAVIGATION_ITEMS.studio].map((item, index) => {
              const Icon = item.icon;
              const actionRole = resolvePageRoleJourney(item.href);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-label={siteNavigationText(item.label, locale)}
                  aria-current={isActive(item.href, true) ? "page" : undefined}
                  data-journey-stage={actionRole.stageNumber}
                  data-accent-tone={actionRole.accentTone}
                  className={`${index === 0 ? "site-menu-actions__create" : "site-menu-actions__projects"} ink-arrow`}
                >
                  <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
                  <span>{siteNavigationText(item.label, locale)}</span>
                  <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
          <p className="site-menu-task-label">{bt("목적별로 찾기 · 5단계 여정 연동", "Browse by purpose · 5-stage journey")}</p>
          <ul className="site-menu-tasks ink-cascade">
            {resolveNavigationGroupsFor().map((group, index) => {
              const directItems = group.items.filter(
                (item) => item.href !== "/create" && item.href !== "/studio",
              );
              const groupStage = journeyStageForNavigationGroupId(group.id);
              return (
                <li
                  key={group.id}
                  className="site-menu-task-card"
                  data-journey-stage={groupStage.stageNumber}
                  data-accent-tone={groupStage.accentTone}
                  style={{ "--ink-i": index } as CSSProperties}
                >
                  <Link
                    href={`/sitemap/${group.id}`}
                    className="site-menu-task ink-arrow"
                    data-current-journey={group.id === currentGroupId ? "true" : undefined}
                    data-journey-stage={groupStage.stageNumber}
                    data-accent-tone={groupStage.accentTone}
                  >
                    <SitePurposeGraphic group={group} />
                    <span className="site-menu-task__copy">
                      <strong className="flex items-center gap-1.5">
                        <span>{siteNavigationText(group.label, locale)}</span>
                        <span
                          aria-hidden="true"
                          className={cx(
                            "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                            accentToneBadgeClasses(groupStage.accentTone),
                          )}
                        >
                          {groupStage.circleBadge}
                        </span>
                      </strong>
                      <small>{siteNavigationText(group.description, locale)}</small>
                    </span>
                    <span className="site-menu-task__count">
                      {group.id === currentGroupId ? bt("현재", "Current") : group.items.length}
                    </span>
                    <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                  {directItems.length > 0 ? (
                    <ul
                      className="site-menu-task__subgrid"
                      aria-label={`${siteNavigationText(group.label, locale)} ${bt("바로가기", "shortcuts")}`}
                    >
                      {directItems.map((subItem) => {
                        const SubIcon = subItem.icon;
                        const subRole = resolvePageRoleJourney(subItem.href);
                        const subLabel =
                          subItem.id === "explore"
                            ? bt("작품 탐색 홈", "Discover hub")
                            : siteNavigationText(subItem.label, locale);
                        return (
                          <li key={subItem.id}>
                            <Link
                              href={subItem.href}
                              aria-current={isActive(subItem.href, subItem.exact) ? "page" : undefined}
                              data-journey-stage={subRole.stageNumber}
                              data-accent-tone={subRole.accentTone}
                              title={`${isKo ? subRole.stageBadgeKo : subRole.stageBadgeEn} · ${isKo ? subRole.roleHeadlineKo : subRole.roleHeadlineEn}`}
                              className="site-menu-task__sublink"
                            >
                              <SubIcon size={14} strokeWidth={1.5} aria-hidden="true" />
                              <span>{subLabel}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </>}
    </div>
  </>;
}
