import type { CSSProperties } from "react";
import { useLocation } from "react-router-dom";

import { canonicalSitePath } from "@/shared/lib/site-route-authority";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { cn } from "@/shared/lib/utils";
import {
  resolveContextualSubNavForPath,
  type ContextualSubNavGroup,
} from "@/shared/navigation/webtoon-platform-router-ux-model";
import { resolveNanoBananaCardForSubNavGroup } from "./site-experience/nano-banana-site-ui-pack";

import "./site-contextual-subnav.css";
import "./site-experience/nano-banana-site-ui.css";

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
  const { pathname: currentPathname } = useLocation();
  const pathname = canonicalSitePath(pathnameOverride ?? currentPathname);
  const lang = useI18n((state) => state.lang);
  const isKo = lang.toLowerCase().startsWith("ko");

  const group = groupOverride ?? resolveContextualSubNavForPath(pathname);
  if (!group) return null;

  const title = isKo ? group.koTitle : group.enTitle;
  const style = { "--subnav-accent": group.accentToken } as CSSProperties;
  const nbCard = resolveNanoBananaCardForSubNavGroup(group.id);

  return (
    <nav
      aria-label={title}
      data-contextual-subnav={group.id}
      data-nano-banana-card={nbCard.cardId}
      className={cn("site-contextual-subnav", className)}
      style={style}
    >
      <div className="site-contextual-subnav__header">
        <span className="nb-site-subnav-brand" aria-hidden="true">
          <img
            src={nbCard.src320}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            width={34}
            height={20}
            className="nb-site-subnav-thumb"
          />
          <span className="site-contextual-subnav__dot" aria-hidden="true" />
        </span>
        <span>{title}</span>
      </div>
      <ul className="site-contextual-subnav__list">
        {group.items.map((item) => {
          const itemPath = canonicalSitePath(item.href);
          const isCurrent = item.exact
            ? pathname === itemPath
            : pathname === itemPath || pathname.startsWith(`${itemPath}/`);
          const label = isKo ? item.koLabel : item.enLabel;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className="site-contextual-subnav__link"
              >
                <span>{label}</span>
                {item.badge ? (
                  <span
                    className="site-contextual-subnav__badge"
                    data-badge={item.badge}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
