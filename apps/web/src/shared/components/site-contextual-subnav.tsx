import type { CSSProperties } from "react";

import { canonicalSitePath } from "@/shared/lib/site-route-authority";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { usePathname } from "@/shared/navigation/navigation";
import Link from "@/shared/navigation/router-link";
import { cn } from "@/shared/lib/utils";
import {
  resolveContextualSubNavForPath,
  type ContextualSubNavGroup,
} from "@/shared/navigation/webtoon-platform-router-ux-model";

import "./site-contextual-subnav.css";

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
  const currentPathname = usePathname();
  const pathname = canonicalSitePath(pathnameOverride ?? currentPathname);
  const lang = useI18n((state) => state.lang);
  const isKo = lang.toLowerCase().startsWith("ko");

  const group = groupOverride ?? resolveContextualSubNavForPath(pathname);
  if (!group) return null;

  const title = isKo ? group.koTitle : group.enTitle;
  const style = { "--subnav-accent": group.accentToken } as CSSProperties;

  return (
    <nav
      aria-label={title}
      data-contextual-subnav={group.id}
      className={cn("site-contextual-subnav", className)}
      style={style}
    >
      <div className="site-contextual-subnav__header">
        <span className="site-contextual-subnav__dot" aria-hidden="true" />
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
