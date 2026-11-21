import { useLayoutEffect, useRef, useState, type CSSProperties, type Ref, type RefObject } from "react";
import { ArrowRight, ChevronDown, Palette } from "lucide-react";
import { useLocation } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import { useI18n } from "@/shared/lib/i18n";
import { canonicalSitePath } from "@/shared/lib/site-route-authority";

import {
  SITE_NAVIGATION_ITEMS,
  TOONSTUDIO_PRIMARY_NAVIGATION,
  siteNavigationText,
  type SiteNavigationItem,
} from "../site-navigation";
import {
  CREATOR_JOURNEY_STAGES,
  accentToneBadgeClasses,
  accentToneChipClasses,
  resolvePageRoleJourney,
} from "./page-role-journey-map";
import {
  workspaceNavigationActiveId,
  workspaceNavigationContext,
  workspaceNavigationHref,
  type WorkspaceNavigationContext,
} from "./workspace-navigation-model";

/**
 * 시안(s1/hub)의 좌측 메뉴가 한 목록에 두는 제작 하위 목적지.
 * 다섯 개 주 목적지 계약(TOONSTUDIO_PRIMARY_NAVIGATION)은 그대로 두고,
 * 넓은 화면에서만 별도 "제작 바로가기" 묶음으로 이어 붙인다.
 * 이름은 단일 지도(SITE_NAVIGATION_ITEMS)의 정본 라벨을 그대로 쓴다.
 */
const WORKSPACE_SHORTCUTS: readonly SiteNavigationItem[] = [
  {
    ...SITE_NAVIGATION_ITEMS.make,
    id: "shortcut-canvas",
  },
  {
    ...SITE_NAVIGATION_ITEMS.shaper,
    id: "shortcut-character",
  },
  {
    ...SITE_NAVIGATION_ITEMS.bg3d,
    id: "shortcut-bg3d",
  },
  {
    ...SITE_NAVIGATION_ITEMS.studioAssets,
    id: "shortcut-assets",
  },
  {
    ...SITE_NAVIGATION_ITEMS.virtualStudio,
    id: "shortcut-virtual-studio",
  },
  {
    ...SITE_NAVIGATION_ITEMS.workspaceTeam,
    id: "shortcut-team",
  },
];

/** 바로가기 목적지별 경로 접두사. 구체적인 것(캐릭터)이 넓은 것(에셋)보다 먼저 와야 한다. */
const SHORTCUT_MATCHERS: readonly {
  readonly id: string;
  readonly primaryToSuppress: string;
  readonly test: (path: string) => boolean;
}[] = [
  { id: "shortcut-character", primaryToSuppress: "studio", test: (path) => path === "/studio/assets/characters/new" || path.startsWith("/studio/assets/characters/") },
  { id: "shortcut-bg3d", primaryToSuppress: "studio", test: (path) => path === "/studio/bg3d" || path.startsWith("/studio/bg3d/") },
  { id: "shortcut-assets", primaryToSuppress: "studio", test: (path) => path === "/studio/assets" || path.startsWith("/studio/assets/") },
  { id: "shortcut-canvas", primaryToSuppress: "studio", test: (path) => path === "/create" || path === "/studio/new" || path.startsWith("/studio/new/") || path === "/studio/import" || path.startsWith("/studio/import/") },
  { id: "shortcut-virtual-studio", primaryToSuppress: "workspace-home", test: (path) => path === "/studio/space" || /^\/studio\/p\/[^/]+\/space$/u.test(path) },
  { id: "shortcut-team", primaryToSuppress: "community", test: (path) => path === "/team" || path.startsWith("/team/") },
];

/** 현재 경로에서 가장 구체적인 제작 바로가기 하나를 고른다. 없으면 null. */
function workspaceShortcutActiveId(pathname: string): string | null {
  const path = canonicalSitePath(pathname);
  return SHORTCUT_MATCHERS.find((matcher) => matcher.test(path))?.id ?? null;
}

interface InkState {
  readonly top: number;
  readonly height: number;
  readonly visible: boolean;
}

/**
 * 좌측 레일의 현재 항목을 따라 미끄러지는 2px 수직 잉크 막대.
 * translateY + scaleY 만 갱신해 레이아웃 재계산을 일으키지 않으며,
 * 첫 측정 전에는 정적 표시를 유지하다가 준비된 뒤에만 전이한다.
 */
function useWorkspaceRailInk(
  railRef: RefObject<HTMLDivElement | null>,
  shortcutId: string | null,
  primaryId: string | null,
  expanded: boolean,
): { readonly style: CSSProperties; readonly visible: boolean } {
  const [ink, setInk] = useState<InkState>({ top: 0, height: 18, visible: false });

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail || typeof window === "undefined") return undefined;
    let frame = 0;
    let ready = rail.getAttribute("data-ink-ready") === "true";

    const measure = () => {
      if (window.matchMedia?.("(max-width: 767px)").matches) {
        setInk((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }
      const candidates = [shortcutId, primaryId];
      let target: HTMLElement | null = null;
      for (const candidate of candidates) {
        if (!candidate) continue;
        const el = rail.querySelector<HTMLElement>(`[data-navigation-entry="${candidate}"]`);
        if (el && el.getClientRects().length > 0) {
          target = el;
          break;
        }
      }
      if (!target) {
        setInk((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }
      const railBox = rail.getBoundingClientRect();
      const itemBox = target.getBoundingClientRect();
      const inset = Math.min(7, Math.max(4, Math.round(itemBox.height * 0.18)));
      const height = Math.max(14, Math.round(itemBox.height - inset * 2));
      const top = Math.round(itemBox.top - railBox.top + inset);
      setInk((prev) =>
        prev.visible && prev.top === top && prev.height === height
          ? prev
          : { top, height, visible: true },
      );
      if (!ready) {
        ready = true;
        frame = window.requestAnimationFrame(() => rail.setAttribute("data-ink-ready", "true"));
      }
    };

    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(rail);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [railRef, shortcutId, primaryId, expanded]);

  return {
    style: {
      "--ink-y": `${ink.top}px`,
      "--ink-h": String(ink.height),
      opacity: ink.visible ? 1 : 0,
    } as CSSProperties,
    visible: ink.visible,
  };
}

export function WorkspaceNavigation({ activeId, studioHref, teamHref, context, onOpenMenu, menuOpen, menuId, navigationRef }: {
  readonly activeId?: string;
  readonly onOpenMenu?: (trigger: HTMLButtonElement) => void;
  readonly menuOpen?: boolean;
  readonly menuId?: string;
  readonly navigationRef?: Ref<HTMLElement>;
  readonly context?: WorkspaceNavigationContext;
  readonly studioHref?: string;
  readonly teamHref?: string;
}) {
  const locale = useI18n((state) => state.lang);
  const isKo = locale.toLowerCase().startsWith("ko");
  const { pathname, search } = useLocation();
  const railRef = useRef<HTMLDivElement>(null);
  const navigationContext = context ?? workspaceNavigationContext(pathname, search);
  const currentJourney = resolvePageRoleJourney(pathname);
  const shortcutActive = workspaceShortcutActiveId(pathname);
  const [shortcutsExpanded, setShortcutsExpanded] = useState(true);
  const autoSelected = activeId ?? workspaceNavigationActiveId(pathname);
  // 바로가기가 현재 위치를 더 구체적으로 가리키면, 주 메뉴의 넓은 표시는 물려
  // 사이드바 안에서 현재 위치가 두 곳에 켜지지 않게 한다(명시 activeId가 오면 그 판정을 우선).
  const suppressedPrimary = activeId === undefined && shortcutActive
    ? SHORTCUT_MATCHERS.find((matcher) => matcher.id === shortcutActive)?.primaryToSuppress
    : undefined;
  const selected = suppressedPrimary !== undefined && autoSelected === suppressedPrimary
    ? null
    : autoSelected;
  const detailsOpen = shortcutsExpanded || shortcutActive !== null;
  const ink = useWorkspaceRailInk(railRef, shortcutActive, selected, detailsOpen);

  return (
    <div
      ref={railRef}
      className="workspace-nav-rail"
      data-journey-stage={currentJourney.stageNumber}
      data-accent-tone={currentJourney.accentTone}
    >
      <nav
        ref={navigationRef}
        className="workspace-nav"
        data-slot="workspace-nav"
        data-site-mobile-utilities={onOpenMenu ? "available" : undefined}
        aria-label={isKo ? "주 메뉴" : "Main navigation"}
      >
        {TOONSTUDIO_PRIMARY_NAVIGATION.map((item) => {
          const Icon = item.icon;
          const entryRole = resolvePageRoleJourney(item.href);
          const entryTitle = `${isKo ? entryRole.stageBadgeKo : entryRole.stageBadgeEn} · ${siteNavigationText(item.description, locale)}`;
          const href = item.id === "workspace-home"
            ? studioHref ?? workspaceNavigationHref(item.href, navigationContext)
            : item.id === "workspace-team"
              ? teamHref ?? workspaceNavigationHref(item.href, navigationContext)
              : workspaceNavigationHref(item.href, navigationContext);

          const content = (
            <>
              <span className="workspace-nav-visual" aria-hidden="true">
                <Icon
                  className="workspace-nav-line-icon workspace-nav-row-icon"
                  size={17}
                  strokeWidth={1.6}
                />
              </span>
              <span>{siteNavigationText(item.label, locale)}</span>
            </>
          );
          if (item.id === "all-menu" && onOpenMenu) {
            return (
              <button
                key={item.id}
                type="button"
                data-navigation-entry={item.id}
                data-journey-stage={entryRole.stageNumber}
                data-accent-tone={entryRole.accentTone}
                data-site-mobile-menu-trigger="true"
                data-workspace-menu-trigger="true"
                aria-haspopup="dialog"
                aria-expanded={menuOpen ?? false}
                aria-controls={menuOpen ? menuId : undefined}
                title={entryTitle}
                onClick={(event) => onOpenMenu(event.currentTarget)}
              >
                {content}
              </button>
            );
          }
          return (
            <Link
              key={item.id}
              href={href}
              aria-current={selected === item.id ? "page" : undefined}
              data-navigation-entry={item.id}
              data-journey-stage={entryRole.stageNumber}
              data-accent-tone={entryRole.accentTone}
              title={entryTitle}
            >
              {content}
            </Link>
          );
        })}
      </nav>
      <details className="workspace-shortcut-group" open={detailsOpen}>
        <summary
          onClick={(event) => {
            if (shortcutActive !== null) return;
            event.preventDefault();
            setShortcutsExpanded((prev) => !prev);
          }}
        >
          <Palette size={16} strokeWidth={1.6} aria-hidden="true" />
          <span>{isKo ? "제작 바로가기" : "Creation shortcuts"}</span>
          <ChevronDown size={15} strokeWidth={1.6} aria-hidden="true" />
        </summary>
        <nav className="workspace-nav-shortcuts" aria-label={isKo ? "제작 바로가기" : "Creation shortcuts"}>
          {WORKSPACE_SHORTCUTS.map((item) => {
            const Icon = item.icon;
            const shortcutRole = resolvePageRoleJourney(item.href);
            const href = item.id === "shortcut-team"
              ? teamHref ?? item.href
              : item.href;
            return (
              <Link
                key={item.id}
                href={href}
                aria-current={shortcutActive === item.id ? "page" : undefined}
                data-navigation-entry={item.id}
                data-journey-stage={shortcutRole.stageNumber}
                data-accent-tone={shortcutRole.accentTone}
                title={`${isKo ? shortcutRole.stageBadgeKo : shortcutRole.stageBadgeEn} · ${isKo ? shortcutRole.roleHeadlineKo : shortcutRole.roleHeadlineEn}`}
              >
                <span className="workspace-nav-visual" aria-hidden="true">
                  <Icon
                    className="workspace-nav-line-icon workspace-nav-row-icon"
                    size={17}
                    strokeWidth={1.6}
                  />
                </span>
                <span>{siteNavigationText(item.label, locale)}</span>
              </Link>
            );
          })}
        </nav>
      </details>
      <section
        data-workspace-journey-hub="true"
        data-journey-stage={currentJourney.stageNumber}
        data-accent-tone={currentJourney.accentTone}
        aria-label={isKo ? "5단계 창작 여정" : "5-stage creation journey"}
        className="mt-3 hidden border-t border-line pt-3 xl:block"
      >
        <div className="mb-2 px-2">
          <span
            data-accent-tone={currentJourney.accentTone}
            className={cx(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums [word-break:keep-all]",
              accentToneBadgeClasses(currentJourney.accentTone),
            )}
          >
            {isKo ? currentJourney.stageBadgeKo : currentJourney.stageBadgeEn}
          </span>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-fg-3 [word-break:keep-all]">
            {isKo ? currentJourney.roleHeadlineKo : currentJourney.roleHeadlineEn}
          </p>
        </div>
        <ol className="flex flex-col gap-1" aria-label={isKo ? "창작 여정 단계 이동" : "Jump by journey stage"}>
          {CREATOR_JOURNEY_STAGES.map((stage) => {
            const isCurrentStage = stage.stageNumber === currentJourney.stageNumber;
            const stageHref = workspaceNavigationHref(stage.primaryHref, navigationContext);
            return (
              <li key={stage.stageId}>
                <Link
                  href={stageHref}
                  data-journey-stage={stage.stageNumber}
                  data-accent-tone={stage.accentTone}
                  data-current-stage={isCurrentStage ? "true" : undefined}
                  title={isKo ? stage.subtitleKo : stage.subtitleEn}
                  className={cx(
                    "flex min-h-9 items-center gap-2 rounded-lg border px-2 py-1 text-xs font-medium outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all]",
                    accentToneChipClasses(stage.accentTone, isCurrentStage),
                  )}
                >
                  <span aria-hidden="true" className="font-mono text-[10px] font-bold tabular-nums text-fg-3">
                    {stage.stepCode}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {isKo ? stage.shortLabelKo : stage.shortLabelEn}
                  </span>
                  <ArrowRight size={12} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-fg-3" />
                </Link>
              </li>
            );
          })}
        </ol>
        <Link
          href="/creator-support"
          data-journey-stage={5}
          data-accent-tone="support"
          className="mt-1.5 flex min-h-9 items-center justify-between rounded-lg border border-success/35 bg-success-soft/55 px-2.5 py-1 text-[11px] font-semibold text-fg transition-[border-color,background-color] duration-150 hover:border-success hover:bg-success-soft motion-reduce:transition-none [word-break:keep-all]"
        >
          <span>{isKo ? "창작자 지원 프로그램" : "Creator support"}</span>
          <ArrowRight size={12} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-success" />
        </Link>
      </section>
      <span
        className="workspace-nav-ink"
        aria-hidden="true"
        style={ink.style}
        data-visible={ink.visible ? "true" : undefined}
      />
    </div>
  );
}
