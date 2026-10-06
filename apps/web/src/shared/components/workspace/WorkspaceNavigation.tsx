import { Mountain } from "lucide-react";
import { useLocation } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { useI18n } from "@/shared/lib/i18n";
import { canonicalSitePath } from "@/shared/lib/site-route-authority";

import {
  SITE_NAVIGATION_ITEMS,
  TOONSTUDIO_PRIMARY_NAVIGATION,
  siteNavigationText,
  type SiteNavigationItem,
} from "../site-navigation";
import {
  workspaceNavigationActiveId,
  workspaceNavigationContext,
  workspaceNavigationHref,
  type WorkspaceNavigationContext,
} from "./workspace-navigation-model";

const PREMIUM_NAV_ART: Readonly<Record<string, string>> = {
  "workspace-home": "/brand/toonstudio-premium-icons/home.webp",
  studio: "/brand/toonstudio-premium-icons/canvas.webp",
  explore: "/brand/toonstudio-premium-icons/assets.webp",
  community: "/brand/toonstudio-premium-icons/community.webp",
  "all-menu": "/brand/toonstudio-premium-icons/settings.webp",
};

/**
 * 시안(s1/hub)의 좌측 메뉴가 한 목록에 두는 제작 하위 목적지.
 * 다섯 개 주 목적지 계약(TOONSTUDIO_PRIMARY_NAVIGATION)은 그대로 두고,
 * 넓은 화면에서만 별도 "제작 바로가기" 묶음으로 이어 붙인다.
 */
const WORKSPACE_SHORTCUTS: readonly SiteNavigationItem[] = [
  {
    ...SITE_NAVIGATION_ITEMS.make,
    id: "shortcut-canvas",
    label: { ko: "캔버스", en: "Canvas" },
  },
  {
    ...SITE_NAVIGATION_ITEMS.shaper,
    id: "shortcut-character",
    label: { ko: "캐릭터", en: "Character" },
  },
  {
    id: "shortcut-bg3d",
    href: "/studio/bg3d",
    icon: Mountain,
    label: { ko: "배경 · 3D", en: "Background · 3D" },
    description: { ko: "장면·카메라·원근을 잡아 배경 완성", en: "Frame scenes, cameras and perspective" },
  },
  {
    ...SITE_NAVIGATION_ITEMS.studioAssets,
    id: "shortcut-assets",
    label: { ko: "에셋", en: "Assets" },
  },
  {
    ...SITE_NAVIGATION_ITEMS.virtualStudio,
    id: "shortcut-virtual-studio",
  },
  {
    ...SITE_NAVIGATION_ITEMS.workspaceTeam,
    id: "shortcut-team",
    label: { ko: "팀", en: "Team" },
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
  { id: "shortcut-canvas", primaryToSuppress: "studio", test: (path) => path === "/studio/new" || path.startsWith("/studio/new/") || path === "/studio/import" || path.startsWith("/studio/import/") },
  { id: "shortcut-virtual-studio", primaryToSuppress: "workspace-home", test: (path) => path === "/studio/space" || /^\/studio\/p\/[^/]+\/space$/u.test(path) },
  { id: "shortcut-team", primaryToSuppress: "community", test: (path) => path === "/team" || path.startsWith("/team/") },
];

/** 현재 경로에서 가장 구체적인 제작 바로가기 하나를 고른다. 없으면 null. */
export function workspaceShortcutActiveId(pathname: string): string | null {
  const path = canonicalSitePath(pathname);
  return SHORTCUT_MATCHERS.find((matcher) => matcher.test(path))?.id ?? null;
}

export function WorkspaceNavigation({ activeId, studioHref, teamHref, context }: {
  readonly activeId?: string;
  readonly context?: WorkspaceNavigationContext;
  readonly studioHref?: string;
  readonly teamHref?: string;
}) {
  const locale = useI18n((state) => state.lang);
  const { pathname, search } = useLocation();
  const navigationContext = context ?? workspaceNavigationContext(pathname, search);
  const shortcutActive = workspaceShortcutActiveId(pathname);
  const autoSelected = activeId ?? workspaceNavigationActiveId(pathname);
  // 바로가기가 현재 위치를 더 구체적으로 가리키면, 주 메뉴의 넓은 표시는 물려
  // 사이드바 안에서 현재 위치가 두 곳에 켜지지 않게 한다(명시 activeId가 오면 그 판정을 우선).
  const suppressedPrimary = activeId === undefined && shortcutActive
    ? SHORTCUT_MATCHERS.find((matcher) => matcher.id === shortcutActive)?.primaryToSuppress
    : undefined;
  const selected = suppressedPrimary !== undefined && autoSelected === suppressedPrimary
    ? null
    : autoSelected;
  return (
    <>
      <nav className="workspace-nav" aria-label={locale.startsWith("ko") ? "주 메뉴" : "Main navigation"}>
        {TOONSTUDIO_PRIMARY_NAVIGATION.map((item) => {
          const Icon = item.icon;
          const art = PREMIUM_NAV_ART[item.id];
          const href = item.id === "workspace-home"
            ? studioHref ?? workspaceNavigationHref(item.href, navigationContext)
            : item.id === "workspace-team"
              ? teamHref ?? workspaceNavigationHref(item.href, navigationContext)
              : workspaceNavigationHref(item.href, navigationContext);

          return (
            <Link
              key={item.id}
              href={href}
              aria-current={selected === item.id ? "page" : undefined}
              data-navigation-entry={item.id}
              title={siteNavigationText(item.description, locale)}
            >
              <span className="workspace-nav-visual" aria-hidden="true">
                <span className="workspace-nav-visual-art" />
                {art ? <img src={art} alt="" decoding="async" /> : null}
                <Icon
                  className="workspace-nav-line-icon"
                  size={18}
                  strokeWidth={selected === item.id ? 2.35 : 1.9}
                />
              </span>
              <Icon
                className="workspace-nav-row-icon"
                size={18}
                strokeWidth={selected === item.id ? 2.35 : 1.9}
                aria-hidden="true"
              />
              <span>{siteNavigationText(item.label, locale)}</span>
            </Link>
          );
        })}
      </nav>
      <nav className="workspace-nav-shortcuts" aria-label={locale.startsWith("ko") ? "제작 바로가기" : "Creation shortcuts"}>
        {WORKSPACE_SHORTCUTS.map((item) => {
          const Icon = item.icon;
          const href = item.id === "shortcut-team"
            ? teamHref ?? item.href
            : item.href;
          return (
            <Link
              key={item.id}
              href={href}
              aria-current={shortcutActive === item.id ? "page" : undefined}
              data-navigation-entry={item.id}
              title={siteNavigationText(item.description, locale)}
            >
              <Icon
                className="workspace-nav-row-icon"
                size={18}
                strokeWidth={shortcutActive === item.id ? 2.35 : 1.9}
                aria-hidden="true"
              />
              <span>{siteNavigationText(item.label, locale)}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
