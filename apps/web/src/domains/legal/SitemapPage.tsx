import { ArrowLeft, ArrowRight, ChevronRight, Search } from "lucide-react";
import { Navigate, useLocation, useParams } from "react-router-dom";

import {
  SITE_NAVIGATION_GROUPS,
  SITE_NAVIGATION_ITEMS,
  SITE_UTILITY_NAVIGATION,
  siteNavigationText,
  type SiteNavigationItem,
} from "@/shared/components/site-navigation";
import { OpenSearchButton } from "@/shared/components/open-search-button";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import "./sitemap-menu.css";

const DIRECTORY_QUERY_KEYS = new Set([
  "menu", "product", "purpose", "maturity", "access", "device", "tier", "saved",
]);

/** 저장해 둔 검색·필터 주소는 전체 디렉터리에서 같은 조건으로 연다. */
function useLegacyDirectoryTarget(): string | null {
  const { search, hash } = useLocation();
  const hasFilter = [...new URLSearchParams(search).keys()].some((key) => DIRECTORY_QUERY_KEYS.has(key));
  return hasFilter || hash.startsWith("#sitemap-") ? `/sitemap/all${search}${hash}` : null;
}

function MenuDestination({ item }: { readonly item: SiteNavigationItem }) {
  const locale = useI18n((state) => state.lang);
  const Icon = item.icon;
  return <Link href={item.href} aria-label={siteNavigationText(item.label, locale)} className="sitemap-menu-destination">
    <Icon size={21} aria-hidden="true" />
    <span><strong>{siteNavigationText(item.label, locale)}</strong><small>{siteNavigationText(item.description, locale)}</small></span>
    <ChevronRight size={18} aria-hidden="true" />
  </Link>;
}

export function SitemapPage() {
  const bt = useBilingual("SitemapPage");
  const locale = useI18n((state) => state.lang);
  const legacyTarget = useLegacyDirectoryTarget();
  if (legacyTarget) return <Navigate to={legacyTarget} replace />;

  return <div className="sitemap-menu-page" data-sitemap-view="hub">
    <header className="sitemap-menu-header">
      <p className="sitemap-menu-eyebrow">{bt("전체 메뉴", "All menus")}</p>
      <h1>{bt("무엇을 하고 싶으세요?", "What would you like to do?")}</h1>
      <p>{bt("목적을 고르면 필요한 메뉴만 보여드려요.", "Choose a purpose to see only the menus you need.")}</p>
    </header>

    <nav className="sitemap-menu-start" aria-label={bt("바로 시작", "Quick start")}>
      <MenuDestination item={SITE_NAVIGATION_ITEMS.make} />
      <MenuDestination item={SITE_NAVIGATION_ITEMS.studio} />
    </nav>

    <OpenSearchButton className="sitemap-menu-search" aria-label={bt("메뉴 이름으로 검색", "Search by menu name")}>
      <Search size={19} aria-hidden="true" />
      <span>{bt("메뉴 이름으로 검색", "Search by menu name")}</span>
    </OpenSearchButton>

    <nav className="sitemap-menu-sections" aria-label={bt("목적별 메뉴", "Menus by purpose")}>
      {SITE_NAVIGATION_GROUPS.map((group) => {
        const Icon = group.items[0]?.icon;
        return <Link key={group.id} href={`/sitemap/${group.id}`} className="sitemap-menu-section">
          {Icon ? <Icon size={22} aria-hidden="true" /> : null}
          <span><strong>{siteNavigationText(group.label, locale)}</strong><small>{siteNavigationText(group.description, locale)}</small></span>
          <ChevronRight size={19} aria-hidden="true" />
        </Link>;
      })}
    </nav>

    <nav className="sitemap-menu-utilities" aria-label={bt("계정과 도움말", "Account and help")}>
      {SITE_UTILITY_NAVIGATION.map((item) => <Link key={item.id} href={item.href}>{siteNavigationText(item.label, locale)}</Link>)}
    </nav>
    <Link href="/sitemap/all" className="sitemap-menu-directory">
      <span>{bt("전체 기능 목록 보기", "Browse every feature")}</span><ArrowRight size={17} aria-hidden="true" />
    </Link>
  </div>;
}

export function SitemapSectionPage() {
  const { section } = useParams<{ section: string }>();
  const bt = useBilingual("SitemapPage");
  const locale = useI18n((state) => state.lang);
  const group = SITE_NAVIGATION_GROUPS.find((item) => item.id === section?.toLowerCase());

  return <div className="sitemap-menu-page" data-sitemap-view="section">
    <Link href="/sitemap" className="sitemap-menu-back"><ArrowLeft size={18} aria-hidden="true" />{bt("전체 메뉴", "All menus")}</Link>
    <header className="sitemap-menu-header">
      <h1>{group ? siteNavigationText(group.label, locale) : bt("메뉴를 찾을 수 없어요", "Menu not found")}</h1>
      <p>{group ? siteNavigationText(group.description, locale) : bt("전체 메뉴에서 하려는 일을 다시 골라주세요.", "Return to all menus and choose what you want to do.")}</p>
    </header>
    {group ? <nav className="sitemap-menu-destinations" aria-label={siteNavigationText(group.label, locale)}>
      {group.items.map((item) => <MenuDestination key={item.id} item={item} />)}
    </nav> : null}
  </div>;
}
