import {
  AlertTriangle,
  ArrowRight,
  PackageSearch,
  RefreshCw,
  Store,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";

import { MarketGrandAtelierShowcase } from "../components/MarketGrandAtelierShowcase";
import {
  MarketHomeExploreBand,
  MarketHomeGuideBand,
  MarketHomeSellBand,
} from "../components/MarketHomeExploreShelves";
import { MarketHomePresets } from "../components/MarketHomePresets";
import { MarketHomeSearch } from "../components/MarketHomeSearch";
import { MarketHomeSectionNavigation } from "../components/MarketHomeSectionNavigation";
import { MarketMaterialPreview } from "../components/MarketMaterialPreview";
import { MarketQuickPreviewDialog } from "../components/MarketQuickPreviewDialog";
import { MarketResourceCard } from "../components/MarketResourceCard";
import { StaleNoticeBar } from "../components/StaleNoticeBar";
import {
  MARKET_HOME_SECTIONS,
  marketHomeSectionFromSearch,
  type MarketHomeSection,
} from "../components/market-home-section";
import { useCommerceConfig } from "../hooks/use-commerce-config";
import { useMarketResources } from "../hooks/use-market-resources";
import { isMarketPublicKeywordTag } from "../models/market-catalog-public";
import { marketHomeJsonLd } from "../models/market-jsonld";

import { SiteShowMoreButton } from "@/domains/legal/public/site-rail";
import { useMobileShowMore } from "@/domains/legal/public/site-show-more";
import { useServiceCapabilityState } from "@/platform/service-capability-state";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { type MarketEcosystemPresetId } from "@/shared/navigation/webtoon-platform-router-ux-model";
import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";
import "./market-home-visual.css";

const MOBILE_RECENT_LIMIT = 6;
const POPULAR_TAG_LIMIT = 8;

type MarketQuickFilterId =
  | "all"
  | "free-cc0"
  | "commercial"
  | "no-ai"
  | "team-ready"
  | "brush"
  | "space-3d";

const MARKET_QUICK_FILTERS: readonly {
  readonly id: MarketQuickFilterId;
  readonly ko: string;
  readonly en: string;
  readonly dotTone: "neutral" | "good" | "accent";
}[] = [
  { id: "all", ko: "전체", en: "All", dotTone: "neutral" },
  { id: "free-cc0", ko: "무료·CC0", en: "Free · CC0", dotTone: "good" },
  { id: "commercial", ko: "상업용 즉시 가능", en: "Commercial ready", dotTone: "good" },
  { id: "no-ai", ko: "No-AI 직접 제작 검증", en: "No-AI verified", dotTone: "good" },
  { id: "team-ready", ko: "팀 공동 작업 공유 가능", en: "Team share ready", dotTone: "accent" },
  { id: "brush", ko: "펜·브러시", en: "Pens & Brushes", dotTone: "neutral" },
  { id: "space-3d", ko: "3D 배경·포즈", en: "3D Spaces & Poses", dotTone: "neutral" },
];

/** 기본 /market 진입에서는 통합 큐레이션 허브를 한눈에 펼치고, 명시적 ?section= 주소에서는 해당 구역에 집중한다. */
export function MarketHomePage() {
  const t = useBilingual("MarketHomePage");
  const { search } = useLocation();
  const section = marketHomeSectionFromSearch(search);
  const explicitSectionParam = new URLSearchParams(search).get("section")?.trim().toLowerCase() ?? "";
  const isUnifiedHub = section === "buy" && explicitSectionParam !== "buy";
  const showBand = (band: MarketHomeSection) => isUnifiedHub || section === band;
  const marketHomeDescription = t(
    "웹툰 템플릿, 2D·3D 에셋, 브러시, 팔레트와 필터를 찾고 미리 본 뒤 ToonStudio 프로젝트에 바로 연결하세요.",
    "Find and preview webtoon templates, 2D/3D assets, brushes, palettes, and filters, then connect them straight to your ToonStudio project.",
  );
  const [searchDraft, setSearchDraft] = useState("");
  const latest = useMarketResources({ limit: 12, sort: "newest" });
  const { isPaidMode } = useCommerceConfig();
  const hasLatestItems = latest.items.length > 0;
  const hasFatalLatestError = Boolean(latest.error) && !hasLatestItems;
  const capability = useServiceCapabilityState();
  const coveredByGlobalNotice = capability.status === "degraded" || capability.warmingUp === true;
  const recoveredAt = capability.recoveredAt;
  const reloadLatest = latest.reload;

  useEffect(() => {
    if (recoveredAt !== null && hasFatalLatestError) reloadLatest();
  }, [recoveredAt, hasFatalLatestError, reloadLatest]);

  const sectionInfo = MARKET_HOME_SECTIONS.find((item) => item.id === section) ?? MARKET_HOME_SECTIONS[0];
  useDocumentTitle(
    section === "buy" ? t("소재 마켓", "Material Market") : t(sectionInfo.title[0], sectionInfo.title[1]),
  );
  useMetaDescription(marketHomeDescription);
  usePageSocialMeta({
    canonicalPath: "/market",
    title: t("소재 마켓 · 툰스튜디오", "Material Market · ToonStudio"),
    description: marketHomeDescription,
  });
  useJsonLd(marketHomeJsonLd(latest.items));

  const tagCounts = new Map<string, number>();
  for (const record of latest.items) {
    for (const tag of record.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const popularTags = [...tagCounts.entries()]
    .filter(([tag]) => isMarketPublicKeywordTag(tag))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, POPULAR_TAG_LIMIT)
    .map(([tag]) => tag);

  const materials3D = latest.items.filter(
    (item) => item.kind === "3d-asset" || item.kind === "3d-preset",
  );
  const allPresetRef = useRef<HTMLButtonElement>(null);
  const [activePresetId, setActivePresetId] = useState<MarketEcosystemPresetId>("all");
  const [quickFilterId, setQuickFilterId] = useState<MarketQuickFilterId>("all");
  const [quickPreviewRecord, setQuickPreviewRecord] =
    useState<CreatorMarketplaceResourceRecord | null>(null);

  const presetFilteredItems = useMemo(() => {
    const byPreset =
      activePresetId === "all"
        ? latest.items
        : latest.items.filter((item) => {
            if (activePresetId === "brush-2d") return item.kind === "brush";
            if (activePresetId === "bg-3d") return item.kind === "3d-asset";
            if (activePresetId === "char-pose-3d") {
              return item.kind === "3d-preset" || item.kind === "template";
            }
            if (activePresetId === "tone-sfx") {
              return item.kind === "palette" || item.kind === "filter" || item.kind === "asset";
            }
            return true;
          });
    if (quickFilterId === "all") return byPreset;
    return byPreset.filter((item) => {
      if (quickFilterId === "free-cc0") {
        return (
          item.license === "cc0-1.0" ||
          item.license === "cc-by-4.0" ||
          item.license === "cc-by-nc-4.0" ||
          item.tags?.some((tag) => /cc0|무료|free/iu.test(tag)) === true
        );
      }
      if (quickFilterId === "commercial") {
        return item.license !== "cc-by-nc-4.0";
      }
      if (quickFilterId === "no-ai") {
        return item.containsAi === false;
      }
      if (quickFilterId === "team-ready") {
        return item.license === "cc0-1.0" || item.license === "cc-by-4.0";
      }
      if (quickFilterId === "brush") {
        return item.kind === "brush";
      }
      if (quickFilterId === "space-3d") {
        return item.kind === "3d-asset" || item.kind === "3d-preset";
      }
      return true;
    });
  }, [activePresetId, latest.items, quickFilterId]);

  const recentMore = useMobileShowMore(presetFilteredItems.length, MOBILE_RECENT_LIMIT);

  const featuredPublishers = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; count: number; noAiCount: number }
    >();
    for (const item of latest.items) {
      const pub = item.publisher;
      if (!pub?.id || !pub.name) continue;
      const existing = map.get(pub.id) ?? {
        id: pub.id,
        name: pub.name,
        count: 0,
        noAiCount: 0,
      };
      map.set(pub.id, {
        ...existing,
        count: existing.count + 1,
        noAiCount: existing.noAiCount + (item.containsAi === false ? 1 : 0),
      });
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 4);
  }, [latest.items]);

  return (
    <div className="market-home-front">
      <MarketHomeSectionNavigation section={section} />

      {showBand("buy") ? (
        <div data-market-band="buy">
          <section>
            <div className="border-b border-line bg-canvas">
              <Container size="wide" className="py-7 sm:py-9 lg:py-12">
              <div className="grid gap-7 lg:grid-cols-[minmax(0,1.06fr)_minmax(22rem,0.94fr)] lg:items-center lg:gap-12">
                <div data-ink-enter="rise" style={{ "--ink-i": 0 } as CSSProperties}>
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-3">
                    <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                    {t("소재 마켓", "Material market")}
                  </p>
                  <h1 className="mt-2.5 text-2xl font-semibold tracking-tight text-fg [word-break:keep-all] sm:text-3xl lg:text-4xl">
                    {t("장면에 필요한 소재", "Materials for your scene")}
                  </h1>
                  <p className="mt-2.5 max-w-xl text-sm leading-6 text-fg-2 [word-break:keep-all] sm:text-base sm:leading-7">
                    {t(
                      "배경·브러시·템플릿을 찾고 사용 조건을 확인하세요",
                      "Find backgrounds, brushes and templates, then check their usage conditions",
                    )}
                  </p>

                  <MarketHomeSearch
                    className="mt-5 max-w-xl"
                    queryValue={searchDraft}
                    onQueryChange={setSearchDraft}
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-3">
                    <Link
                      href="/market/browse"
                      className="ink-arrow inline-flex min-h-11 items-center gap-1.5 rounded-[8px] font-medium text-fg-2 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Store className="size-3.5 text-fg-3" aria-hidden="true" />
                      <span>{t("전체 소재 보기", "Browse all materials")}</span>
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                    <span aria-hidden="true" className="text-fg-3/40">
                      ·
                    </span>
                    <span>
                      {isPaidMode
                        ? t("현재 유료 운영 모드", "Currently in paid operation mode")
                        : t("현재 무료 운영 모드", "Currently in free operation mode")}
                    </span>
                  </div>
                </div>

                <div
                  data-ink-enter="panel"
                  style={{ "--ink-i": 1, "--ink-radius": "16px" } as CSSProperties}
                >
                  <MarketMaterialPreview />
                </div>
              </div>
              </Container>
            </div>
          </section>

          <Container size="wide" className="pt-5 sm:pt-6">
            <MarketHomePresets
              activeId={activePresetId}
              onSelect={setActivePresetId}
              allButtonRef={allPresetRef}
            />

            <div
              role="group"
              aria-label={t("빠른 라이선스·소재 필터", "Quick license and asset filters")}
              data-testid="market-quick-license-filters"
              className="mt-3 flex flex-wrap items-center gap-1.5"
            >
              {MARKET_QUICK_FILTERS.map((chip) => {
                const active = quickFilterId === chip.id;
                const dotColor = active
                  ? "bg-accent"
                  : chip.dotTone === "good"
                    ? "bg-good"
                    : chip.dotTone === "accent"
                      ? "bg-accent/70"
                      : "bg-fg-3/60";
                return (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setQuickFilterId(chip.id)}
                    className={cn(
                      "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                      active
                        ? "border-accent/65 bg-accent-soft font-medium text-fg"
                        : "border-line bg-panel/60 font-normal text-fg-2 hover:border-line-strong hover:text-fg",
                    )}
                  >
                    <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", dotColor)} />
                    <span>{t(chip.ko, chip.en)}</span>
                  </button>
                );
              })}
            </div>
          </Container>

          <Container size="wide" className="pb-10 pt-7 sm:pb-12 sm:pt-8">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h2 data-ink="line" className="text-base font-semibold text-fg [word-break:keep-all] sm:text-lg">
                  {t("최근 공유", "Recently shared")}
                </h2>
                <p className="mt-2 text-xs leading-5 text-fg-3 [word-break:keep-all]">
                  {t(
                    "최근 공개된 리소스를 실제 미리보기와 함께 확인합니다",
                    "Browse recently published resources with real previews",
                  )}
                </p>
              </div>
              <Link
                href="/market/browse"
                className="ink-arrow inline-flex min-h-11 min-w-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-[8px] px-2 text-xs font-medium text-accent hover:text-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <span>{t("전체 보기", "View all")}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>

            {hasFatalLatestError && coveredByGlobalNotice ? (
              <div
                role="status"
                className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-[14px] border border-line bg-panel px-5 py-4"
              >
                <p className="text-sm text-fg-2">
                  {t(
                    "온라인 기능이 복구되면 최근 공유를 자동으로 다시 불러옵니다",
                    "When online features recover, recently shared resources will reload automatically",
                  )}
                </p>
                <button
                  type="button"
                  onClick={latest.reload}
                  className={buttonClass({
                    variant: "outline",
                    size: "sm",
                    className: "h-11 min-h-11 min-w-11 rounded-[8px]",
                  })}
                >
                  <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
                  {t("지금 다시 시도", "Retry now")}
                </button>
              </div>
            ) : null}

            {hasFatalLatestError && !coveredByGlobalNotice ? (
              <div
                role="alert"
                className="mt-6 rounded-[16px] border border-warn/30 bg-warn/5 p-8 text-center sm:p-10"
              >
                <div className="mx-auto flex size-11 items-center justify-center rounded-[10px] bg-warn/10 text-warn">
                  <AlertTriangle className="size-5" aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-fg [word-break:keep-all]">
                  {t("최근 공유 리소스를 불러올 수 없어요", "Recently shared resources could not be loaded")}
                </h3>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-fg-2 [word-break:keep-all]">
                  {t(
                    "일시적인 네트워크 문제이거나 서버 장애일 수 있어요. 다시 시도해도 다른 작업에는 영향을 주지 않습니다.",
                    "This may be a temporary network issue or a server problem. Retrying will not affect your other work.",
                  )}
                </p>
                <button
                  type="button"
                  onClick={latest.reload}
                  className={buttonClass({
                    variant: "outline",
                    size: "sm",
                    className: "mt-4 h-11 min-h-11 min-w-11 rounded-[8px]",
                  })}
                >
                  <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
                  {t("다시 시도", "Try again")}
                </button>
              </div>
            ) : null}

            {latest.stale ? (
              <StaleNoticeBar
                savedAt={latest.staleSavedAt ?? new Date().toISOString()}
                onRetry={latest.reload}
                className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[10px] border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2 [&>button]:ml-auto"
              />
            ) : null}

            {hasFatalLatestError ? null : (
              <>
                {latest.loading ? (
                  <p role="status" className="sr-only">
                    {t(
                      "최근 공유된 마켓 리소스를 불러오는 중입니다.",
                      "Loading recently shared market resources.",
                    )}
                  </p>
                ) : null}
                <ul
                  key={`${activePresetId}-${quickFilterId}`}
                  aria-busy={latest.loading || undefined}
                  data-ink-stagger="panel"
                  className="ink-cascade mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
                >
                  {latest.loading && latest.items.length === 0
                    ? Array.from({ length: 8 }, (_, index) => (
                        <li key={index} aria-hidden="true">
                          <div className="skeleton aspect-[16/10] w-full rounded-t-[14px]" />
                          <div className="space-y-2 rounded-b-[14px] border border-t-0 border-line bg-card p-3.5">
                            <div className="skeleton h-4 w-4/5" />
                            <div className="skeleton h-3 w-2/5" />
                          </div>
                        </li>
                      ))
                    : presetFilteredItems.map((record, index) => (
                        <li
                          key={record.id}
                          {...introItemProps(index)}
                          style={{ "--ink-radius": "14px" } as CSSProperties}
                          className={recentMore.hiddenOnMobile(index) ? "max-sm:hidden" : undefined}
                        >
                          <MarketResourceCard
                            record={record}
                            onQuickPreview={setQuickPreviewRecord}
                            className="h-full"
                          />
                        </li>
                      ))}
                </ul>
                <SiteShowMoreButton
                  className="sm:hidden"
                  remaining={recentMore.remaining}
                  onClick={recentMore.expand}
                  label={t(
                    `최근 공유 ${recentMore.remaining}개 더 보기`,
                    `Show ${recentMore.remaining} more`,
                  )}
                />

                {!latest.loading && hasLatestItems && presetFilteredItems.length === 0 ? (
                  <div
                    role="status"
                    className="mt-6 rounded-[16px] border border-dashed border-line bg-panel p-6 text-center"
                  >
                    <PackageSearch className="mx-auto size-7 text-fg-3" aria-hidden="true" />
                    <h3 className="mt-3 text-base font-semibold text-fg [word-break:keep-all]">
                      {t("선택한 유형의 최근 소재가 없어요", "No recent materials match this type")}
                    </h3>
                    <p className="mt-1.5 text-sm text-fg-2 [word-break:keep-all]">
                      {t(
                        "최근 공개된 소재 안에서 찾은 결과입니다. 전체 카탈로그에서 더 찾아보거나 유형을 바꿔 보세요.",
                        "These results cover recently published materials. Browse the full catalog or choose another type.",
                      )}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setActivePresetId("all");
                          setQuickFilterId("all");
                          allPresetRef.current?.focus({ preventScroll: true });
                        }}
                        className={buttonClass({
                          variant: "solid",
                          size: "md",
                          className: "min-h-11 min-w-11 rounded-[9px]",
                        })}
                      >
                        {t("최근 소재 전체 보기", "Show all recent materials")}
                      </button>
                      <Link
                        href="/market/browse"
                        className={buttonClass({
                          variant: "outline",
                          size: "md",
                          className: "min-h-11 min-w-11 rounded-[9px]",
                        })}
                      >
                        {t("전체 에셋 카탈로그", "Full asset catalog")}
                      </Link>
                    </div>
                  </div>
                ) : null}

                {!latest.loading && latest.items.length === 0 ? (
                  <div className="mt-6 rounded-[16px] border border-dashed border-line bg-panel p-8 text-center sm:p-10">
                    <div className="mx-auto flex size-11 items-center justify-center rounded-[10px] bg-raised text-fg-3">
                      <PackageSearch className="size-5" aria-hidden="true" />
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-fg [word-break:keep-all]">
                      {t("아직 공유된 리소스가 없어요", "No shared resources yet")}
                    </h3>
                    <p className="mx-auto mt-1.5 max-w-md text-sm text-fg-2 [word-break:keep-all]">
                      {t(
                        "공개 마켓 소재와 별개로 기본 무료 제작 소재는 회원가입 없이 사용할 수 있습니다. 원본 파일과 사용 조건을 확인한 뒤 내 편집기로 가져오세요.",
                        "Separately from public market materials, the built-in free production materials are available without signing up. Check the source files and terms, then bring them into your editor.",
                      )}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                      <Link
                        href="/studio/assets?view=essentials"
                        className={buttonClass({
                          variant: "solid",
                          size: "sm",
                          className: "min-h-11 min-w-11 rounded-[9px]",
                        })}
                      >
                        {t("기본 무료 소재 사용하기", "Use built-in free materials")}
                      </Link>
                      <Link
                        href="/studio?assetMarket=community&communityView=share"
                        className={buttonClass({
                          variant: "outline",
                          size: "sm",
                          className: "min-h-11 min-w-11 rounded-[9px]",
                        })}
                      >
                        <Upload className="mr-1.5 size-3.5" aria-hidden="true" />
                        {t("Studio에서 첫 리소스 공유하기", "Share your first resource from Studio")}
                      </Link>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </Container>

          <MarketGrandAtelierShowcase />
        </div>
      ) : null}

      {showBand("explore") ? (
        <MarketHomeExploreBand
          isUnifiedHub={isUnifiedHub}
          materials3D={materials3D}
          featuredPublishers={featuredPublishers}
          popularTags={popularTags}
          onQuickPreview={setQuickPreviewRecord}
        />
      ) : null}

      {showBand("sell") ? <MarketHomeSellBand /> : null}

      {showBand("guide") ? <MarketHomeGuideBand /> : null}

      <MarketQuickPreviewDialog
        record={quickPreviewRecord}
        onClose={() => setQuickPreviewRecord(null)}
      />
    </div>
  );
}
