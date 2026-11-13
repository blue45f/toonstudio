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
  type ContextualSubNavGroup,
  type ContextualSubNavItem,
} from "@/shared/navigation/webtoon-platform-router-ux-model";
import { resolveSiteArtCardMetaForSubNavGroup } from "./site-experience/site-art-card-meta";

import "./site-contextual-subnav.css";
import "./site-experience/site-art-ui.css";

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

  const renderItem = (item: ContextualSubNavItem) => (
    <li key={item.id}>
      <Link
        href={item.href}
        aria-current={item === currentItem ? "page" : undefined}
        className="site-contextual-subnav__link"
      >
        {isKo ? item.koLabel : item.enLabel}
      </Link>
    </li>
  );

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
      <details key={`${pathname}${search.toString()}`} className="site-contextual-subnav__more">
        <summary>
          <span>{title} {isKo ? "메뉴" : "menu"}</span>
          {currentItem ? <span className="site-contextual-subnav__current">{isKo ? currentItem.koLabel : currentItem.enLabel}</span> : null}
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="site-contextual-subnav__additional">
          <p data-testid="site-ux-simplicity-pill" className="text-xs leading-5 text-fg-2">
            <span className="font-semibold">{simplicityBadge}</span>{" · "}{goalCopy}
          </p>
          <ul className="site-contextual-subnav__list">{group.items.map(renderItem)}</ul>
        </div>
      </details>
    </nav>
  );
}
