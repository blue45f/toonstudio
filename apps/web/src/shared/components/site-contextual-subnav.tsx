import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  Bookmark,
  ChevronDown,
  Compass,
  Film,
  MessageSquare,
  Package,
  PenTool,
  type LucideIcon,
} from "lucide-react";
import { useLocation } from "react-router-dom";

import { canonicalSitePath } from "@/shared/lib/site-route-authority";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { cn } from "@/shared/lib/utils";
import {
  resolveContextualSubNavForPath,
  resolvePageSimplicityProfile,
  type ContextualHubGroupId,
  type ContextualSubNavGroup,
  type ContextualSubNavItem,
} from "@/shared/navigation/webtoon-platform-router-ux-model";
import { resolveSiteArtCardMetaForSubNavGroup } from "./site-experience/site-art-card-meta";

import "./site-contextual-subnav.css";
import "./site-experience/site-art-ui.css";

const MAX_PRIMARY_RIBBON_ITEMS = 16;

const SUBNAV_GROUP_ICONS: Readonly<Record<ContextualHubGroupId, LucideIcon>> = {
  "promo-cuts-hub": Film,
  "discover-hub": Compass,
  "community-hub": MessageSquare,
  "studio-hub": PenTool,
  "market-hub": Package,
  "personal-library-hub": Bookmark,
};

function partitionSubNavItems(
  items: readonly ContextualSubNavItem[],
  currentItem: ContextualSubNavItem | undefined,
): {
  readonly primaryItems: readonly ContextualSubNavItem[];
  readonly overflowItems: readonly ContextualSubNavItem[];
} {
  if (items.length <= MAX_PRIMARY_RIBBON_ITEMS) {
    return { primaryItems: items, overflowItems: [] };
  }
  const initialPrimary = items.slice(0, MAX_PRIMARY_RIBBON_ITEMS);
  const initialOverflow = items.slice(MAX_PRIMARY_RIBBON_ITEMS);
  if (!currentItem || initialPrimary.includes(currentItem)) {
    return { primaryItems: initialPrimary, overflowItems: initialOverflow };
  }
  const displaced = initialPrimary[initialPrimary.length - 1];
  const promotedPrimary = [...initialPrimary.slice(0, -1), currentItem];
  const nextOverflow = [
    ...(displaced ? [displaced] : []),
    ...initialOverflow.filter((candidate) => candidate !== currentItem),
  ];
  return { primaryItems: promotedPrimary, overflowItems: nextOverflow };
}

export function SiteContextualSubNav({
  pathnameOverride,
  groupOverride,
  className,
}: {
  readonly pathnameOverride?: string;
  readonly groupOverride?: ContextualSubNavGroup;
  readonly className?: string;
} = {}) {
  useBilingualI18nRevision();
  const { pathname: currentPathname, search: currentSearch } = useLocation();
  const pathname = canonicalSitePath(pathnameOverride ?? currentPathname);
  const lang = useI18n((state) => state.lang);
  const isKo = lang.toLowerCase().startsWith("ko");
  const primaryListRef = useRef<HTMLUListElement>(null);
  const [inkRect, setInkRect] = useState<{ x: number; y: number; width: number } | null>(null);

  const group = groupOverride ?? resolveContextualSubNavForPath(pathname);
  const currentSearchString = pathnameOverride?.includes("?")
    ? pathnameOverride.slice(pathnameOverride.indexOf("?"))
    : pathname === canonicalSitePath(currentPathname) ? currentSearch : "";

  useLayoutEffect(() => {
    const list = primaryListRef.current;
    if (!list || typeof window === "undefined") {
      setInkRect(null);
      return undefined;
    }
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active || active.getClientRects().length === 0) {
        setInkRect(null);
        return;
      }
      const listBox = list.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();
      const inset = Math.min(10, Math.round(activeBox.width * 0.14));
      const width = Math.max(12, Math.round(activeBox.width - inset * 2));
      const x = Math.round(activeBox.left - listBox.left + inset);
      const y = Math.round(activeBox.bottom - listBox.top - 3);
      setInkRect((prev) =>
        prev && prev.x === x && prev.y === y && prev.width === width
          ? prev
          : { x, y, width },
      );
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(list);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [group?.id, pathname, currentSearchString, isKo]);

  if (!group) return null;

  const title = isKo ? group.koTitle : group.enTitle;
  const style = { "--subnav-accent": group.accentToken } as CSSProperties;
  const nbCard = resolveSiteArtCardMetaForSubNavGroup(group.id);
  const simplicity = resolvePageSimplicityProfile(group.id);
  const goalCopy = isKo ? simplicity.koPrimaryGoal : simplicity.enPrimaryGoal;
  const simplicityBadge = isKo ? "이곳에서 할 수 있는 일" : "What you can do here";
  const HubIcon = SUBNAV_GROUP_ICONS[group.id];
  const search = new URLSearchParams(currentSearchString);
  // 같은 경로의 서재 탭은 쿼리까지 비교하고, 가장 구체적인 목적지 하나만 현재 위치로 표시한다.
  const currentItem = group.items.filter((item) => {
    const itemPath = canonicalSitePath(item.href);
    const pathMatches = item.exact ? pathname === itemPath
      : pathname === itemPath || pathname.startsWith(`${itemPath}/`);
    const params = new URLSearchParams(item.href.split("?")[1]);
    return pathMatches && [...params].every(([key, value]) => search.get(key) === value);
  }).sort((left, right) => right.href.length - left.href.length)[0];

  const { primaryItems, overflowItems } = partitionSubNavItems(group.items, currentItem);

  const renderItem = (item: ContextualSubNavItem) => (
    <li key={item.id}>
      <Link
        href={item.href}
        aria-current={item === currentItem ? "page" : undefined}
        className="site-contextual-subnav__link"
      >
        <span>{isKo ? item.koLabel : item.enLabel}</span>
      </Link>
    </li>
  );

  const moreSummaryLabel = overflowItems.length > 0
    ? isKo ? `더보기 +${overflowItems.length}` : `More +${overflowItems.length}`
    : isKo ? "화면 안내" : "Guide";

  return (
    <nav
      aria-label={title}
      data-contextual-subnav={group.id}
      data-atelier-card={nbCard.cardId}
      data-visual-preset={simplicity.visualEffectPreset}
      data-simplicity-grade={simplicity.simplicityGrade}
      className={cn("site-contextual-subnav", className)}
      style={style}
    >
      <div className="site-contextual-subnav__ribbon">
        <span className="site-contextual-subnav__hub-chip" aria-hidden="true">
          <HubIcon size={14} strokeWidth={1.75} className="site-contextual-subnav__icon" />
          <span className="site-contextual-subnav__hub-title">{title}</span>
        </span>
        <ul
          ref={primaryListRef}
          className="site-contextual-subnav__list site-contextual-subnav__list--primary"
          data-ink-active={inkRect ? "true" : undefined}
        >
          {primaryItems.map(renderItem)}
          <span
            aria-hidden="true"
            className="site-contextual-subnav__ink"
            style={
              inkRect
                ? ({
                    "--subnav-ink-x": `${inkRect.x}px`,
                    "--subnav-ink-y": `${inkRect.y}px`,
                    "--subnav-ink-w": String(inkRect.width),
                    opacity: 1,
                  } as CSSProperties)
                : ({ opacity: 0 } as CSSProperties)
            }
          />
        </ul>
        <details key={`${pathname}${search.toString()}`} className="site-contextual-subnav__more">
          <summary>
            <span>{moreSummaryLabel}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className="site-contextual-subnav__additional">
            <p data-testid="site-ux-simplicity-pill" className="text-xs leading-5 text-fg-2">
              <span className="font-semibold">{simplicityBadge}</span>{" · "}{goalCopy}
            </p>
            {overflowItems.length > 0 ? (
              <ul className="site-contextual-subnav__list site-contextual-subnav__list--overflow">
                {overflowItems.map(renderItem)}
              </ul>
            ) : null}
          </div>
        </details>
      </div>
    </nav>
  );
}
