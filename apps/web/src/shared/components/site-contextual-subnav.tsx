import type { CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
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

const MAX_PRIMARY_RIBBON_ITEMS = 6;

const SUBNAV_GROUP_EMBLEMS: Readonly<Record<ContextualHubGroupId, string>> = {
  "promo-cuts-hub": "/brand/luminous-atelier-20261114/icon-nav-discover-cuts.webp",
  "discover-hub": "/brand/luminous-atelier-20261114/icon-nav-discover-cuts.webp",
  "community-hub": "/brand/luminous-atelier-20261114/icon-nav-learn-collab.webp",
  "studio-hub": "/brand/luminous-atelier-20261114/icon-studio-pen-ink.webp",
  "market-hub": "/brand/luminous-atelier-20261114/icon-nav-asset-market.webp",
  "personal-library-hub": "/brand/luminous-atelier-20261114/icon-studio-layers-color.webp",
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

  const group = groupOverride ?? resolveContextualSubNavForPath(pathname);
  if (!group) return null;

  const title = isKo ? group.koTitle : group.enTitle;
  const style = { "--subnav-accent": group.accentToken } as CSSProperties;
  const nbCard = resolveSiteArtCardMetaForSubNavGroup(group.id);
  const simplicity = resolvePageSimplicityProfile(group.id);
  const goalCopy = isKo ? simplicity.koPrimaryGoal : simplicity.enPrimaryGoal;
  const simplicityBadge = isKo ? "이곳에서 할 수 있는 일" : "What you can do here";
  const emblemSrc = SUBNAV_GROUP_EMBLEMS[group.id];
  const search = new URLSearchParams(
    pathnameOverride?.includes("?")
      ? pathnameOverride.slice(pathnameOverride.indexOf("?"))
      : pathname === canonicalSitePath(currentPathname) ? currentSearch : "",
  );
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
        {item.badge ? (
          <span className="site-contextual-subnav__badge" aria-hidden="true">
            {item.badge}
          </span>
        ) : null}
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
          <img
            src={emblemSrc}
            alt=""
            width={24}
            height={24}
            loading="lazy"
            decoding="async"
            className="site-contextual-subnav__emblem"
          />
          <span className="site-contextual-subnav__hub-title">{title}</span>
        </span>
        <ul className="site-contextual-subnav__list site-contextual-subnav__list--primary">
          {primaryItems.map(renderItem)}
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
