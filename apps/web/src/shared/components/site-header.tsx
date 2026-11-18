import { LAYOUT_SITE_NAVIGATION } from "./layout/layout-site-navigation";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { Menu, Palette, Search, X } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { HeaderPrimaryNavigationEntry } from "./site-header-primary-entry";
import { HEADER_PRIMARY_NAVIGATION, VIRTUAL_STUDIO_PATTERN, headerSectionForPath, purposeActive } from "./site-header-navigation";
import { useHeaderInkIndicator } from "./use-header-ink-indicator";
import {
  SITE_NAVIGATION_ITEMS,
  siteNavigationContextForPath,
  siteNavigationLocale,
  siteNavigationText,
} from "./site-navigation";
import { ToonStudioMark } from "./toonstudio-mark";
import { ToonStudioWordmark } from "./toonstudio-brand";
import { isPublicCreativeRoute } from "./site-public-routes";
import { useSiteHeaderHeight } from "./use-site-header-height";

import { isImmersiveMobileRoute } from "@/app/routes/immersive-mobile-route";
import { usePathname } from "@/shared/navigation/navigation";
import Link from "@/shared/navigation/router-link";
import { useI18n, useT } from "@/shared/lib/i18n";
import { keepInlineText } from "@/shared/lib/text";
import { canonicalSitePath } from "@/shared/lib/site-route-authority";
import { useUi } from "@/shared/lib/ui-store";

import "./public-site-shell.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("site-header", ko, en);

const MobileHeaderNavigation = lazy(() =>
  import("./site-header-mobile-nav").then((mod) => ({
    default: mod.MobileHeaderNavigation,
  }))
);

/**
 * Canonical destinations for the header's key actions. 작품 시작의 정문은 /create
 * 시작 시트 하나이며, /studio/new는 시트에서 빈 작품을 골랐을 때 닿는
 * 2단계 생성 양식이라 헤더가 직접 가리키지 않는다.
 */
const CANONICAL_CREATE_HREF = "/create";

/** Exact destination state for drawer/utility items. A child page must not make
 * both its purpose hub and the child destination announce aria-current="page". 프로젝트 가상 스튜디오(/studio/p/:id/space)도 가상 스튜디오 목적지다. */
function useDestinationActive() {
  useBilingualI18nRevision();
  const path = canonicalSitePath(usePathname());
  return (href: string, exact?: boolean) => {
    const destination = canonicalSitePath(href);
    if (exact) return path === destination;
    return path === destination || path.startsWith(`${destination}/`) || (destination === "/studio/space" && VIRTUAL_STUDIO_PATTERN.test(path));
  };
}

function matchesMobileNavigationViewport() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(LAYOUT_SITE_NAVIGATION.mobileQuery).matches
  );
}

function useMobileNavigationViewport() {
  useBilingualI18nRevision();
  const [isMobile, setIsMobile] = useState(matchesMobileNavigationViewport);

  useEffect(() => {
    const media = window.matchMedia(LAYOUT_SITE_NAVIGATION.mobileQuery);
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isMobile;
}

function MobileNavigationFallback() {
  useBilingualI18nRevision();
  return (
    <nav
      aria-hidden="true"
      className="fixed inset-x-0 bottom-0 z-50 h-[calc(3.75rem+env(safe-area-inset-bottom))] border-t border-line/80 bg-panel/90 backdrop-blur-xl min-[1180px]:hidden"
    />
  );
}

/** Render the responsive site header for the active Studio or Spectrum context. */
export function SiteHeader({
  authMenuSlot,
  notificationsSlot,
}: {
  readonly authMenuSlot?: ReactNode;
  readonly notificationsSlot?: ReactNode;
} = {}) {
  useBilingualI18nRevision();
  const isActive = useDestinationActive();
  const pathname = usePathname();
  const language = useI18n((state) => state.lang);
  const locale = siteNavigationLocale(language);
  const t = useT();
  const openSearch = useUi((state) => state.openCommandPalette);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuRequested, setMenuRequested] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isMobileNavigationViewport = useMobileNavigationViewport();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shouldRenderMobileNavigation = menuRequested || menuOpen || isMobileNavigationViewport;
  const hideBottomTabs = isImmersiveMobileRoute(pathname);
  const navigationContext = siteNavigationContextForPath(pathname);
  const isPublicPage = isPublicCreativeRoute(pathname);
  const isHomePage = canonicalSitePath(pathname) === "/";
  const headerRef = useRef<HTMLElement>(null);
  useSiteHeaderHeight(headerRef);
  const create = SITE_NAVIGATION_ITEMS.make;
  const brandHref = "/";
  // ToonStudio is the user-facing product name across public and creator contexts. The
  // navigation contract may change by audience, but the brand must not appear to switch apps.
  const brandName = "ToonStudio";
  const brandDescription =
    navigationContext === "studio"
      ? SITE_NAVIGATION_ITEMS.production.description
      : SITE_NAVIGATION_ITEMS.home.description;
  const brandTagline = bi("이야기를 작품으로", "Bring stories to life");
  const isPurposeActive = (href: string, exact?: boolean) =>
    purposeActive(pathname, href, exact);
  const currentSection = headerSectionForPath(pathname);
  const primaryNavRef = useRef<HTMLElement>(null);
  const inkStyle = useHeaderInkIndicator(primaryNavRef, currentSection);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    window.requestAnimationFrame(() =>
      triggerRef.current?.focus({ preventScroll: true })
    );
  }, [setMenuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let frame = 0;
    const syncScrolled = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() =>
        setScrolled(window.scrollY > 8)
      );
    };
    syncScrolled();
    window.addEventListener("scroll", syncScrolled, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", syncScrolled);
    };
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        data-site-chrome="header"
        data-site-product={navigationContext}
        data-public-site={isPublicPage || undefined}
        data-site-home={isHomePage || undefined}
        data-scrolled={scrolled || undefined}
        className="site-header"
      >
        <div className="site-header__inner">
          <Link
            href={brandHref}
            aria-label={`${brandName} · ${siteNavigationText(brandDescription, locale)}`}
            className="site-header__brand group"
          >
            <span className="site-header__brand-mark"><ToonStudioMark className="size-7 rounded-md" /></span>
            <span className="site-header__brand-copy">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-display text-[1.05rem] font-semibold tracking-[-0.02em] text-fg transition-colors duration-150 group-hover:text-accent sm:text-lg"><ToonStudioWordmark /></span>
              </span>
              <span className="site-header__tagline">{brandTagline}</span>
            </span>
          </Link>

          <nav ref={primaryNavRef} aria-label={bi("주요 메뉴", "Primary navigation")} className="site-header__primary">
            {HEADER_PRIMARY_NAVIGATION.map((item) => (
              <HeaderPrimaryNavigationEntry key={item.id} item={item} locale={locale} currentSection={currentSection} isActive={isActive} />
            ))}
            {/* 현재 구역을 가리키는 잉크 밑줄 하나. 구역이 바뀌면 그 자리로 그어지듯 옮겨 간다. */}
            <span className="site-header__ink" aria-hidden="true" style={inkStyle} data-visible={currentSection ? "true" : undefined} />
          </nav>

          <div className="site-header__utilities">
            <button
              type="button"
              onClick={openSearch}
              aria-label={t("nav.searchOpen")}
              className="site-header__search group flex size-11 shrink-0 items-center justify-center rounded-[var(--site-control-radius)] border border-line bg-card/85 text-fg-3 outline-none transition-[border-color,background-color,color,transform] duration-150 hover:border-line-strong hover:bg-card hover:text-fg enabled:active:scale-[0.98] focus-visible:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none motion-reduce:transition-none sm:justify-between sm:px-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Search size={16} strokeWidth={1.5} className="shrink-0 text-fg-3 transition-colors duration-150 group-hover:text-fg" />
                <span className="site-header__search-label truncate text-sm [word-break:keep-all]">{bi("검색", t("nav.search"))}</span>
              </span>
              <kbd aria-hidden="true" className="site-header__search-shortcut items-center gap-0.5 rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-xs text-fg-3">⌘K</kbd>
            </button>

            {/* 새 작품은 위치가 아니라 동작이다. 현재 위치 표시는 주 메뉴 한 곳에만 둔다. */}
            <Link
              href={CANONICAL_CREATE_HREF}
              aria-label={siteNavigationText(create.label, locale)}
              title={siteNavigationText(create.description, locale)}
              className="site-header__create hidden h-11 min-w-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--site-control-radius)] border border-transparent bg-accent px-3.5 text-sm font-semibold text-on-accent [text-wrap:nowrap] [word-break:keep-all] outline-none transition-[background-color,border-color,color,transform] duration-150 hover:bg-accent-2 active:scale-[0.98] enabled:active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none motion-reduce:transition-none sm:flex"
            >
              <Palette size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
              <span className="hidden min-w-max whitespace-nowrap xl:inline-block">{keepInlineText(siteNavigationText(create.label, locale))}</span>
            </Link>

            <div className="site-header__notifications">{notificationsSlot}</div>

            {authMenuSlot}

            <button
              ref={triggerRef}
              type="button"
              onClick={() => { setMenuRequested(true); setMenuOpen((open) => !open); }}
              aria-haspopup="dialog" data-site-mobile-menu-trigger="true" data-site-menu-entry="available"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              className="flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-card/85 px-3 text-sm font-semibold text-fg-2 outline-none transition-[border-color,background-color,color,transform] hover:border-accent/45 hover:bg-raised hover:text-fg focus-visible:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97]"
            >
              {menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
              <span className="sr-only min-[1180px]:not-sr-only">
                <span className="block">{t("nav.allMenu")}{menuOpen && <span className="sr-only"> {t("common.close")}</span>}</span>
                <span data-site-menu-music-enabled="true">{bi("음악 켜짐", "Music enabled")}</span>
              </span>
            </button>
          </div>
        </div>
      </header>

      {shouldRenderMobileNavigation && (
        <Suspense fallback={isMobileNavigationViewport && !hideBottomTabs ? <MobileNavigationFallback /> : null}>
          <MobileHeaderNavigation
            menuOpen={menuOpen}
            menuId={menuId}
            panelRef={panelRef}
            closeMenu={closeMenu} closeForUtility={() => setMenuOpen(false)}
            isActive={isActive}
            isPurposeActive={isPurposeActive}
            hideBottomTabs={hideBottomTabs}
            isMobileViewport={isMobileNavigationViewport}
          />
        </Suspense>
      )}
    </>
  );
}
