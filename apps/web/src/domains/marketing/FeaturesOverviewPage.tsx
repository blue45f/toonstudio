import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { ArrowRight, LayoutGrid, Map as MapIcon } from "lucide-react";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { sitePageHeaderArtFor } from "@/domains/legal/public/site-page-header-art";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";

import {
  FEATURE_OVERVIEW_CATEGORIES,
  FEATURE_OVERVIEW_CATALOG_TITLES,
  FEATURE_OVERVIEW_PLATFORM_COUNT,
  type FeatureOverviewText,
} from "./features-overview-data";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("FeaturesOverviewPage", ko, en);

const text = (value: FeatureOverviewText): string => bi(value.ko, value.en);

const PAGE_COPY = {
  ko: {
    eyebrow: "TOONSTUDIO FEATURES",
    title: "툰스튜디오의 모든 기능을 한눈에.",
    description:
      "기획·스토리부터 그리기, 3D, AI, 제작 관리, 배우기, 작품 발견과 커뮤니티까지 — 웹툰 한 편이 태어나 독자에게 닿는 전 과정을 한곳에서 이어 갑니다. 이 페이지는 영역별 대표 기능을 요약한 지도이고, 직접 열 수 있는 모든 페이지의 목록은 전체 사이트맵이 소유합니다.",
    start: "새 작품 시작하기",
    sitemap: "전체 사이트맵",
    factsLabel: "서비스 규모",
    factTitles: "외부 플랫폼 작품 정보",
    factPlatforms: "작품을 모으는 플랫폼",
    factCategories: "기능 영역",
    factFeatures: "이 페이지의 수록 기능",
    jumpLabel: "영역 바로가기",
    itemsUnit: "개 기능",
    ctaTitle: "찾는 기능이 여기 없나요?",
    ctaBody: "이 페이지는 대표 기능만 추린 요약입니다. 실험 도구와 세부 페이지를 포함한 전체 목록은 사이트맵에서 검색할 수 있습니다.",
    ctaSitemap: "사이트맵에서 전체 찾기",
    ctaSupport: "문의하기",
  },
  en: {
    eyebrow: "TOONSTUDIO FEATURES",
    title: "Every ToonStudio feature at a glance.",
    description:
      "From planning and story to drawing, 3D, AI, production management, learning, discovery and community — the whole journey of a webtoon, from first idea to readers, in one place. This page is a summary map of the main features by area; the sitemap owns the complete list of every page you can open.",
    start: "Start a new work",
    sitemap: "Full sitemap",
    factsLabel: "Service at a glance",
    factTitles: "External platform catalog entries",
    factPlatforms: "Platforms collected",
    factCategories: "Feature areas",
    factFeatures: "Features listed here",
    jumpLabel: "Jump to an area",
    itemsUnit: "features",
    ctaTitle: "Can't find the feature you need?",
    ctaBody: "This page is a curated summary of the main features. The sitemap lets you search the complete directory, including experimental tools and detail pages.",
    ctaSitemap: "Search the full sitemap",
    ctaSupport: "Contact support",
  },
} as const;

/**
 * `/features` — 전체 기능·콘텐츠 요약 페이지.
 *
 * 역할 구분: 이 페이지는 "무엇을 할 수 있는 곳인지"를 영역별 요약으로 읽는
 * 지도이고, `/sitemap`은 "원하는 페이지를 찾는" 검색형 디렉터리다. 그래서
 * 여기서는 대표 기능만 추리고, 전수 목록은 사이트맵으로 위임한다.
 * 데이터는 features-overview-data.ts가 소유하고 링크 무결성은 그 테스트가 고정한다.
 */
export function FeaturesOverviewPage() {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const copy = bi((PAGE_COPY).ko, (PAGE_COPY).en);
  const locale = language.toLowerCase().startsWith("ko") ? "ko-KR" : "en-US";

  const totalItems = FEATURE_OVERVIEW_CATEGORIES.reduce(
    (sum, category) => sum + category.items.length,
    0,
  );

  const facts: readonly { readonly value: string; readonly label: string }[] = [
    { value: FEATURE_OVERVIEW_CATALOG_TITLES.toLocaleString(locale), label: copy.factTitles },
    { value: String(FEATURE_OVERVIEW_PLATFORM_COUNT), label: copy.factPlatforms },
    { value: String(FEATURE_OVERVIEW_CATEGORIES.length), label: copy.factCategories },
    { value: String(totalItems), label: copy.factFeatures },
  ];

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <SitePageHeader
        size="hero"
        icon={LayoutGrid}
        eyebrow={copy.eyebrow}
        titleId="features-overview-title"
        title={copy.title}
        description={copy.description}
        art={sitePageHeaderArtFor("/features")}
        actions={
          <>
            <Link href="/studio/new" className={buttonClass({ size: "md", className: "min-h-11" })}>
              {copy.start}
            </Link>
            <Link href="/sitemap" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
              <MapIcon size={16} aria-hidden="true" />
              {copy.sitemap}
            </Link>
          </>
        }
      />

      <section className="mt-8 sm:mt-10" aria-label={copy.factsLabel}>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="rounded-3xl border border-line bg-card/75 px-5 py-4">
              <dd className="font-display text-2xl font-bold tracking-[-0.03em] text-fg sm:text-3xl">
                {fact.value}
              </dd>
              <dt className="mt-1 text-xs leading-5 text-fg-3 sm:text-sm">{fact.label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <nav className="mt-8 flex flex-wrap gap-2" aria-label={copy.jumpLabel}>
        {FEATURE_OVERVIEW_CATEGORIES.map((category) => (
          <a
            key={category.id}
            href={`#features-${category.id}`}
            className="inline-flex min-h-10 items-center rounded-full border border-line bg-panel/60 px-4 text-sm font-semibold text-fg-2 transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            {text(category.title)}
          </a>
        ))}
      </nav>

      {FEATURE_OVERVIEW_CATEGORIES.map((category, categoryIndex) => {
        const Icon = category.icon;
        const titleId = `features-${category.id}-title`;
        return (
          <section
            key={category.id}
            id={`features-${category.id}`}
            className="mt-12 scroll-mt-24 sm:mt-16"
            aria-labelledby={titleId}
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex max-w-3xl items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-line bg-panel text-accent">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-display text-xs font-bold uppercase tracking-[0.15em] text-accent">
                    {String(categoryIndex + 1).padStart(2, "0")}
                  </p>
                  <h2 id={titleId} className="mt-1 font-display text-2xl font-bold tracking-[-0.035em] text-fg sm:text-3xl">
                    {text(category.title)}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-fg-3">{text(category.summary)}</p>
                </div>
              </div>
              <span className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-bold text-fg-3">
                {category.items.length}
                {copy.itemsUnit}
              </span>
            </div>

            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {category.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex h-full min-h-[5.5rem] items-start gap-3 rounded-2xl border border-line bg-card/75 p-4 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-card hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                  >
                    <span className="min-w-0 flex-1 pt-0.5">
                      <strong className="block text-sm font-bold text-fg transition-colors group-hover:text-accent">
                        {text(item.name)}
                      </strong>
                      <span className="mt-1 block text-xs leading-5 text-fg-3">
                        {text(item.description)}
                      </span>
                    </span>
                    <ArrowRight
                      size={15}
                      className="mt-1 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section
        className="mt-14 flex flex-col gap-4 rounded-3xl border border-line/70 bg-gradient-to-r from-accent-soft/70 via-panel/70 to-panel/40 p-5 sm:mt-20 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        aria-labelledby="features-overview-cta-title"
      >
        <div>
          <h2 id="features-overview-cta-title" className="font-display text-lg font-bold text-fg">
            {copy.ctaTitle}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-2">{copy.ctaBody}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/sitemap" className={buttonClass({ size: "md", className: "min-h-11" })}>
            <MapIcon size={16} aria-hidden="true" />
            {copy.ctaSitemap}
          </Link>
          <Link href="/support" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
            {copy.ctaSupport}
          </Link>
        </div>
      </section>
    </Container>
  );
}
