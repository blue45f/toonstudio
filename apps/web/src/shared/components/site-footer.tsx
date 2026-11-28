import { ArrowRight, ChevronDown } from "lucide-react";

import {
  SITE_NAVIGATION_ITEMS,
  SITE_UTILITY_NAVIGATION,
  resolveNavigationGroupsFor,
  siteNavigationLocale,
  siteNavigationText,
} from "./site-navigation";
import { ToonStudioBrand } from "./toonstudio-brand";

import { useI18n, useT } from "@/shared/lib/i18n";
import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { canonicalSitePath } from "@/shared/lib/site-route-authority";
import { usePathname } from "@/shared/navigation/navigation";
import Link from "@/shared/navigation/router-link";

import "./site-footer.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("site-footer", ko, en);

const META_LINKS = [
  { key: "footer.link.about", href: "/about" },
  { key: "footer.link.guide", href: "/guide" },
  { key: "footer.link.features", href: "/features" },
  { key: "footer.link.sitemap", href: "/sitemap" },
  { key: "footer.link.support", href: "/help" },
] as const;

const POLICY_LINKS = [
  { key: "footer.link.terms", href: "/terms" },
  { key: "footer.link.privacy", href: "/privacy" },
  { key: "footer.link.copyright", href: "/copyright" },
] as const;

/** 디렉터리 그룹은 단일 지도를 사용하고 푸터 바로가기는 도착 화면을 명시한다. */
export function SiteFooter() {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const locale = siteNavigationLocale(language);
  const t = useT();
  const pathname = canonicalSitePath(usePathname());
  const mobileBottomPadding = pathname === "/"
    ? "pb-[env(safe-area-inset-bottom)]"
    : "pb-[calc(3.75rem+env(safe-area-inset-bottom))]";
  const current = (href: string) => pathname === href ? "page" : undefined;
  const year = new Date().getFullYear();
  const { make, research, help, allMenu: sitemap } = SITE_NAVIGATION_ITEMS;
  /**
   * S1-3: 모바일 메뉴·⌘K와 같은 정책 함수(resolveNavigationGroupsFor)를
   * 소비한다. 그룹 순서와 그룹 안 tier 순서가 표면마다 달라지지 않는다.
   */
  const navigationGroups = resolveNavigationGroupsFor();

  return (
    <footer data-site-chrome="footer" className={`site-footer ${mobileBottomPadding} md:pb-0`}>
      <div className="site-footer__inner">
        <div className="site-footer__story-band">
          <Link href="/" className="site-footer__brand min-h-11" aria-label={bi("ToonStudio 홈", "ToonStudio home")}>
            <ToonStudioBrand wordmarkClassName="site-footer__wordmark" />
          </Link>
          <p className="site-footer__story [word-break:keep-all]">
            <span>{bi("그리는 사람들을 위한 작업실 · 그리는 순간 이야기가 살아납니다", "A studio for people who draw · where stories come alive")}</span>
          </p>
          <Link href={make.href} className="site-footer__create min-h-11 [word-break:keep-all]">
            {siteNavigationText(make.label, locale)}<ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>

        <nav className="site-footer__quick [word-break:keep-all]" aria-label={bi("도움말과 사이트맵", "Help and sitemap")}>
          <Link href={help.href} aria-current={current(help.href)}>{siteNavigationText(help.label, locale)}</Link>
          <Link href={sitemap.href} aria-current={current(sitemap.href)}>{t("footer.link.sitemap")}<ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" /></Link>
        </nav>
        <details className="site-footer__more">
          <summary className="min-h-11 [word-break:keep-all]">{bi("서비스 안내 더 보기", "More service information")}<ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" /></summary>
        <div className="site-footer__navigation">
          <div className="site-footer__introduction [word-break:keep-all]">
            <p>{bi("상상에서 첫 장면으로, 첫 장면에서 완성한 작품으로.", "From an idea to your first scene, and from a scene to a finished story.")}</p>
            <p className="site-footer__description">{t("footer.description.secondary")}</p>
            <Link href={research.href} className="site-footer__research">
              {siteNavigationText(research.label, locale)}<ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
            </Link>
            <nav className="site-footer__utilities" aria-label={bi("계정과 환경 설정", "Account and preferences")}>
              {SITE_UTILITY_NAVIGATION.map((item) => {
                const Icon = item.icon;
                return <Link key={item.id} href={item.href}>
                  <Icon size={16} strokeWidth={1.5} aria-hidden="true" />{siteNavigationText(item.label, locale)}
                </Link>;
              })}
            </nav>
          </div>

          {/* 사이트 홈("/")은 위 브랜드 링크가 이미 소유한다. 지도에서 "내 기록" 그룹에
              "홈"("/")과 "내 홈"("/home")이 나란히 렌더되면 같은 목적지로 읽혀(시각 감사
              2026-10-13) 푸터 렌더링에서만 href "/" 항목을 제외한다 — id가 아니라
              href 중복 제거이며, 지도의 그룹 소속 자체는 현재 여정 판정
              (siteNavigationGroupForPath("/"))이 쓰므로 바꾸지 않는다.
              S1-3 이전에 함께 제외되던 "제작 기술"(technology)은 중복이 아닌데도
              조용히 빠져 모바일 메뉴·⌘K와 집합이 어긋나 있었다. tier 통일로
              제외를 없애 세 디렉터리 표면의 목적지 집합을 일치시킨다. */}
          {navigationGroups.map((group) => (
            <nav key={group.id} aria-labelledby={`footer-nav-${group.id}`} className="site-footer__group">
              <h2 id={`footer-nav-${group.id}`}>{siteNavigationText(group.label, locale)}</h2>
              <ul>
                {group.items.filter((item) => item.href !== "/").map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      title={siteNavigationText(item.description, locale)}
                    >
                      {siteNavigationText(item.label, locale)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="site-footer__meta">
          <nav aria-label={bi("도움과 서비스 안내", "Help and service information")}>
            <Link href="/about/principles">{bi("제품 원칙", "Product principles")}</Link>
            {META_LINKS.map((link) => <Link key={link.href} href={link.href}>{t(link.key)}</Link>)}
            {/* /pricing 페이지는 routes 팀이 제공. 푸터에서 요금제 진입점을 유지한다. */}
            <Link href="/pricing">{bi("요금제", "Pricing")}</Link>
            {/* 제품 투어(/product-tour), 브랜드 필름(/brand-film), 홍보 영상 자료실(/promo-library), 비교(/compare/studio), 기술·API(/tech) 진입점을 푸터에서도 유지한다. */}
            <Link href="/product-tour">{bi("제품 투어", "Product tour")}</Link>
            <Link href="/compare/studio">{bi("경쟁 도구 비교", "Compare tools")}</Link>
            <Link href="/tech">{bi("차세대 기술 · MCP API", "Tech · MCP API")}</Link>
            <Link href="/brand-film">{bi("브랜드 필름", "Brand film")}</Link>
            <Link href="/promo-library">{bi("홍보 영상 자료실", "Promo video library")}</Link>
            <Link href="/install">{bi("앱 설치", "Install app")}</Link>
          </nav>
        </div>
        </details>
        <div className="site-footer__meta">
          <nav aria-label={bi("이용 정책", "Policies")}>
            {POLICY_LINKS.map((link) => <Link key={link.href} href={link.href}>{t(link.key)}</Link>)}
          </nav>
          <small>{t("footer.copyrightLine").replace("{year}", String(year))}</small>
        </div>
      </div>
    </footer>
  );
}
