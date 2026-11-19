import {
  ArrowRight,
  BadgeCheck,
  Cuboid,
  HelpCircle,
  Plus,
  ShieldCheck,
  Store,
  Upload,
} from "lucide-react";
import type { CSSProperties } from "react";

import { MARKET_LICENSE_GUIDE } from "../models/market-kind";
import { MARKET_CURATED_THEMES } from "../models/market-theme";

import { MarketCategoryTiles } from "./MarketCategoryTiles";
import { MarketNavHeader } from "./MarketNavHeader";
import { MarketRecentlyViewedStrip } from "./MarketRecentlyViewedStrip";
import { MarketResourceCard } from "./MarketResourceCard";
import { MarketResourceFamilyExplorer } from "./MarketResourceFamilyExplorer";

import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { SiteRail } from "@/domains/legal/public/site-rail";
import { SiteStepList } from "@/domains/legal/public/site-step-list";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

export interface FeaturedPublisherSummary {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly noAiCount: number;
}

const STARTER_STAGES = [
  {
    step: "1",
    stageKo: "콘티·연출",
    stageEn: "Storyboard & Layout",
    descKo: "세로 스크롤 컷 분할 템플릿·구도 가이드",
    descEn: "Vertical scroll panel templates & framing guides",
    href: "/market/browse?kind=template",
  },
  {
    step: "2",
    stageKo: "3D 배경",
    stageEn: "3D Backgrounds",
    descKo: "학교·방·거리 등 카메라 앵글 회전형 3D 공간",
    descEn: "Orbitable 3D scenes for rooms, schools, and streets",
    href: "/market/browse?kind=3d-asset",
  },
  {
    step: "3",
    stageKo: "선화·펜",
    stageEn: "Line Art & Pens",
    descKo: "필압 G펜·거친 먹선·머리카락 전용 브러시",
    descEn: "Pressure G-pens, rough ink, and hair brushes",
    href: "/market/browse?kind=brush",
  },
  {
    step: "4",
    stageKo: "채색·음영",
    stageEn: "Color & Shading",
    descKo: "캐릭터 피부·시간대별 조명 팔레트와 스크린톤",
    descEn: "Skin palettes, time-of-day lighting, and screentones",
    href: "/market/browse?kind=palette",
  },
  {
    step: "5",
    stageKo: "말풍선·마감",
    stageEn: "Balloons & Finish",
    descKo: "대사 말풍선·효과음 레터링·분위기 보정 필터",
    descEn: "Dialogue balloons, SFX lettering, and mood filters",
    href: "/market/browse?kind=filter",
  },
] as const;

const RIGHTS_VERIFIED_SHELVES = [
  {
    titleKo: "AI 미포함 · 상업 연재 허용",
    titleEn: "No-AI · Commercial serial OK",
    descKo: "containsAi=false 및 상업 이용 허용 사용권만 선별",
    descEn: "Manifests disclosed as No-AI with commercial rights",
    href: "/market/browse?containsAi=false&commercial=true",
  },
  {
    titleKo: "CC0 퍼블릭 도메인 소재",
    titleEn: "CC0 1.0 Public Domain",
    descKo: "출처 표기 부담 없이 원고에 즉시 투입 가능한 공개 소재",
    descEn: "Zero-attribution public domain production assets",
    href: "/market/browse?license=cc0-1.0",
  },
  {
    titleKo: "Three.js 3D 회전 공간·프리셋",
    titleEn: "Three.js 3D Orbitable Stages",
    descKo: "카메라 구도를 자유롭게 잡아 선화·배경으로 쓰는 3D 에셋",
    descEn: "3D environments & camera presets ready for Studio",
    href: "/market/browse?engine=three&commercial=true",
  },
  {
    titleKo: "작가 직접 창작 원본",
    titleEn: "Author-created Originals",
    descKo: "배급자가 직접 제작해 서명·공개한 오리지널 패키지",
    descEn: "Original packages authored directly by the publisher",
    href: "/market/browse?origin=original&containsAi=false",
  },
] as const;

export function MarketHomeExploreBand({
  isUnifiedHub,
  materials3D,
  featuredPublishers,
  popularTags,
  onQuickPreview,
}: {
  readonly isUnifiedHub: boolean;
  readonly materials3D: readonly CreatorMarketplaceResourceRecord[];
  readonly featuredPublishers: readonly FeaturedPublisherSummary[];
  readonly popularTags: readonly string[];
  readonly onQuickPreview: (record: CreatorMarketplaceResourceRecord) => void;
}) {
  const t = useBilingual("MarketHomePage");

  return (
    <div data-market-band="explore">
      <Container size="wide" className="pt-4">
        <MarketCategoryTiles />
        <MarketNavHeader className="mt-6" />
      </Container>

      <Container size="wide" className="py-8 sm:py-12">
        <MarketResourceFamilyExplorer />
      </Container>

      <Container size="wide" className="pb-10 sm:pb-12">
        <section
          data-market-starter-guide="true"
          aria-labelledby="market-starter-guide-heading"
          className="rounded-[16px] border border-line bg-panel p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-accent">
                {t("공정별 시작 소재", "Assets by stage")}
              </p>
              <h2
                id="market-starter-guide-heading"
                className="mt-1 text-base font-semibold text-fg [word-break:keep-all] sm:text-lg"
              >
                {t("웹툰 5대 공정별 필수 에셋 스타터 가이드", "5-Stage Webtoon Essential Asset Starter Guide")}
              </h2>
              <p className="mt-1 text-xs leading-5 text-fg-2 [word-break:keep-all]">
                {t(
                  "입문 작가가 공정마다 가장 먼저 챙겨야 할 필수 소재와 원고 위 호환성 시험(Fit Lab) 동선입니다",
                  "Essential materials for beginners at each webtoon stage, plus direct Fit Lab testing",
                )}
              </p>
            </div>
            <Link
              href="/market/fit-lab"
              className="ink-arrow inline-flex min-h-11 items-center gap-1.5 rounded-[8px] border border-line-strong bg-card px-3.5 py-2 text-xs font-medium text-fg transition-colors hover:border-accent hover:text-accent"
            >
              <span>{t("원고 위 시험 (Fit Lab) 바로가기", "Open Fit Lab")}</span>
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <ol
            data-ink-stagger
            className="mt-4 grid gap-3 break-keep [overflow-wrap:break-word] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
          >
            {STARTER_STAGES.map((item) => (
              <li
                key={item.step}
                className="ink-frame flex flex-col justify-between rounded-[12px] bg-card p-3.5"
              >
                <div>
                  <span className="text-xs font-medium text-accent tabular-nums">
                    {t(`${item.step}단계`, `Step ${item.step}`)}
                  </span>
                  <h3 className="mt-1 text-sm font-semibold leading-[1.35] text-fg">
                    {t(item.stageKo, item.stageEn)}
                  </h3>
                  <p className="mt-1 text-xs leading-[1.6] tracking-[-0.01em] text-fg-2">
                    {t(item.descKo, item.descEn)}
                  </p>
                </div>
                <Link
                  href={item.href}
                  className="ink-arrow mt-2.5 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <span>{t(`${item.stageKo} 소재 보기`, `Browse ${item.stageEn}`)}</span>
                  <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </Container>

      <section>
        <div className="border-y border-line bg-panel/45 py-10 sm:py-12">
          <Container size="wide">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-accent">
                {t("주제별 컬렉션", "Curated collections")}
              </p>
              <h2
                data-ink="line"
                className="mt-1 text-lg font-semibold text-fg [word-break:keep-all] sm:text-xl"
              >
                {t("장르·제작 목적 컬렉션", "Genre & purpose collections")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-fg-2 [word-break:keep-all]">
                {t(
                  "장면 예시에서 출발해 관련 태그의 리소스를 탐색하세요",
                  "Start from a scene example and explore resources with related tags",
                )}
              </p>
            </div>
            <Link
              href="/market/browse"
              className="ink-arrow inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-[8px] px-2 text-xs font-medium text-accent hover:text-accent-2"
            >
              <span>{t("전체 보기", "View all")}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <SiteRail
            label={t("장르·제작 목적 컬렉션", "Genre & purpose collections")}
            columns="sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
            className="mt-5 gap-4"
            itemClassName="w-[min(78vw,17rem)]"
          >
            {MARKET_CURATED_THEMES.map((theme, index) => {
              const ThemeIcon = theme.icon;
              return (
                <Link
                  key={theme.id}
                  {...introItemProps(index)}
                  href={theme.browseHref}
                  className="market-collection-card ink-frame group relative flex w-full flex-col justify-between overflow-hidden rounded-[14px] border border-line bg-card p-4 transition-colors duration-150 hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  <div className="ink-cover ink-sheen -mx-4 -mt-4 mb-4 border-b border-line">
                    <img
                      src={theme.image}
                      alt=""
                      loading="lazy"
                      width={640}
                      height={360}
                      className="market-collection-card__img aspect-[1.9] w-full object-cover"
                      style={{
                        objectPosition: theme.id === "pose-guide-3d" ? "40% 45%" : "center",
                      }}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-[6px] border border-line bg-panel px-2 py-0.5 text-xs font-medium text-fg-2">
                        {theme.badge}
                      </span>
                      <ThemeIcon
                        className="size-4 text-fg-3 transition-colors group-hover:text-accent"
                        aria-hidden="true"
                      />
                    </div>
                    <h3 className="mt-2.5 text-base font-semibold text-fg transition-colors [word-break:keep-all] group-hover:text-accent">
                      {theme.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-fg-2 [word-break:keep-all]">
                      {theme.subtitle}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-line/70 pt-2.5 text-xs font-medium text-fg-2">
                    <span className="text-accent">
                      {t(`#${theme.tag} 소재 찾기`, `Find #${theme.tag} materials`)}
                    </span>
                    <span className="ink-arrow flex items-center gap-1 text-fg-3">
                      <span>{t("보러가기", "See more")}</span>
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </SiteRail>
          </Container>
        </div>
      </section>

      {!isUnifiedHub && materials3D.length > 0 ? (
        <Container size="wide" className="py-10 sm:py-12">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Cuboid className="size-4 text-accent" aria-hidden="true" />
                <h2 className="text-base font-semibold text-fg [word-break:keep-all] sm:text-lg">
                  {t("3D 배경·데생 추천", "Recommended 3D backgrounds & drawing guides")}
                </h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-fg-3 [word-break:keep-all]">
                {t(
                  "카메라를 돌려 구도를 잡고 캔버스로 가져올 수 있는 3D 리소스입니다",
                  "3D resources you can orbit to frame a shot, then bring onto the canvas",
                )}
              </p>
            </div>
            <Link
              href="/market/browse?kind=3d-asset"
              className="ink-arrow inline-flex min-h-11 items-center gap-1 text-xs font-medium text-accent hover:text-accent-2"
            >
              <span>{t("3D 전체 보기", "View all 3D")}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <ul
            data-ink-stagger="panel"
            className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
          >
            {materials3D.slice(0, 4).map((record, index) => (
              <li
                key={record.id}
                {...introItemProps(index)}
                style={{ "--ink-radius": "14px" } as CSSProperties}
              >
                <MarketResourceCard
                  record={record}
                  onQuickPreview={onQuickPreview}
                  className="h-full"
                />
              </li>
            ))}
          </ul>
        </Container>
      ) : null}

      <Container size="wide" className="py-10 sm:py-12">
        <section
          aria-label={t(
            "안심 연재·호환 엔진 및 배급자 스토어 탐색",
            "Rights-verified shelves & creator storefronts",
          )}
          className="rounded-[16px] border border-line bg-panel p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-accent">
                {t("사용 조건 검증 소재", "Rights-verified materials")}
              </p>
              <h2 className="mt-1 text-base font-semibold text-fg [word-break:keep-all] sm:text-lg">
                {t(
                  "안심 연재 조건 · 배급자 스토어 바로가기",
                  "Commercial No-AI picks & creator storefronts",
                )}
              </h2>
            </div>
            <Link
              href="/market/browse?containsAi=false&commercial=true"
              className="ink-arrow inline-flex min-h-11 items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              <span>{t("No-AI 상업 허용 전체 보기", "Browse all No-AI commercial")}</span>
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>

          <div
            data-ink-stagger
            className="mt-4 grid gap-3 break-keep [overflow-wrap:break-word] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          >
            {RIGHTS_VERIFIED_SHELVES.map((shelf) => (
              <Link
                key={shelf.href}
                href={shelf.href}
                className="ink-frame group flex flex-col justify-between rounded-[12px] bg-card p-4 transition-colors duration-150 hover:bg-raised"
              >
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-3">
                    <span className="size-1.5 rounded-full bg-good" aria-hidden="true" />
                    <ShieldCheck className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                    {t("사용 조건 표기됨", "Terms disclosed")}
                  </span>
                  <h3 className="mt-1.5 text-sm font-semibold leading-[1.35] text-fg group-hover:text-accent">
                    {t(shelf.titleKo, shelf.titleEn)}
                  </h3>
                  <p className="mt-1 text-xs leading-[1.6] tracking-[-0.01em] text-fg-2">
                    {t(shelf.descKo, shelf.descEn)}
                  </p>
                </div>
                <span className="ink-arrow mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent">
                  <span>{t("조건으로 탐색", "Filter catalog")}</span>
                  <ArrowRight className="size-3" strokeWidth={1.5} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>

          {featuredPublishers.length > 0 ? (
            <div className="mt-4 border-t border-line/70 pt-4">
              <p className="text-xs font-medium text-fg-3">
                {t("최근 활동 배급자 스토어", "Active publisher storefronts")}
              </p>
              <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0">
                {featuredPublishers.map((pub) => (
                  <Link
                    key={pub.id}
                    href={`/market/creator/${encodeURIComponent(pub.id)}`}
                    className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[8px] bg-card px-3 py-2 text-xs font-medium text-fg transition-colors duration-150 hover:bg-raised hover:text-accent"
                  >
                    <Store className="size-3.5 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                    <span>{pub.name}</span>
                    <span className="numeral tnum rounded-[4px] bg-raised px-1.5 py-0.5 text-xs text-fg-2 tabular-nums">
                      {t(`패키지 ${pub.count}개`, `${pub.count} pkgs`)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <MarketRecentlyViewedStrip className="mt-6" />
      </Container>

      {popularTags.length >= 3 ? (
        <Container size="wide" className="pb-10 sm:pb-12">
          <h2 className="text-xs font-medium text-fg-3">
            {t("최근 공유 소재의 키워드", "Keywords from recently shared materials")}
          </h2>
          <ul className="-mx-4 mt-2.5 flex snap-x gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            {popularTags.map((tag) => (
              <li key={tag} className="shrink-0 snap-start">
                <Link
                  href={`/market/browse?tag=${encodeURIComponent(tag)}`}
                  className="inline-flex min-h-11 items-center rounded-[8px] border border-line bg-card px-3 py-2 text-xs font-medium text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      ) : null}
    </div>
  );
}

export function MarketHomeSellBand() {
  const t = useBilingual("MarketHomePage");
  return (
    <section
      data-market-band="sell"
      aria-labelledby="market-seller-band-title"
    >
      <div className="border-y border-line bg-panel py-8 sm:py-12">
        <Container
          size="wide"
          className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between"
        >
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-accent">
            {t("소재 판매·공유", "Sell & share materials")}
          </p>
          <h2
            id="market-seller-band-title"
            className="mt-1.5 text-xl font-semibold text-fg [word-break:keep-all] sm:text-2xl"
          >
            {t("만든 소재를 공유하고 판매해 보세요", "Share and sell the materials you made")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-2 [word-break:keep-all]">
            {t(
              "브러시·템플릿·3D 에셋을 올리면 다른 작가의 컷에 쓰입니다. 안내를 따라 5분이면 시작할 수 있습니다.",
              "List your brushes, templates and 3D assets and other artists will use them in their panels. Start in about 5 minutes.",
            )}
          </p>
        </div>
        <div className="grid w-full shrink-0 grid-cols-1 gap-2.5 sm:flex sm:w-auto sm:flex-wrap">
          <Link
            href="/market/publish"
            className={buttonClass({
              variant: "solid",
              size: "md",
              className: "min-h-11 w-full justify-center rounded-[9px] font-medium sm:w-auto",
            })}
          >
            <Plus className="size-4" strokeWidth={1.5} aria-hidden="true" />
            {t("소재 공유하기", "Share materials")}
          </Link>
          <Link
            href="/studio?assetMarket=community&communityView=share"
            className={buttonClass({
              variant: "outline",
              size: "md",
              className: "min-h-11 w-full justify-center rounded-[9px] font-medium sm:w-auto",
            })}
          >
            <Upload className="size-4" strokeWidth={1.5} aria-hidden="true" />
            {t("Studio에서 공유", "Share from Studio")}
          </Link>
        </div>
        </Container>
      </div>
    </section>
  );
}

export function MarketHomeGuideBand() {
  const t = useBilingual("MarketHomePage");
  return (
    <div data-market-band="guide">
      <Container size="wide" className="py-10 sm:py-14">
        <SiteDisclosure
          className="mb-10"
          icon={HelpCircle}
          title={t(
            "처음이라면 종류보다 하고 싶은 작업부터 고르세요",
            "New here? Start from the task you want to do, not the asset type",
          )}
          summary={t(
            "템플릿·에셋·브러시는 적용 방식이 서로 다릅니다",
            "Templates, assets and brushes are applied differently",
          )}
        >
          <p className="text-sm leading-6 text-fg-2 [word-break:keep-all]">
            {t(
              "상세 화면에서 실제 사용 위치와 호환성을 먼저 보여드립니다.",
              "The detail screen shows where each is used and its compatibility first.",
            )}
          </p>
          <SiteStepList
            className="mt-3"
            steps={[
              t(
                "장면을 통째로 시작하려면 템플릿, 캔버스에 놓을 재료가 필요하면 2D·3D를 고릅니다.",
                "To start a whole scene, pick a template; for materials to place on the canvas, pick 2D/3D.",
              ),
              t(
                "선화·채색 도구는 브러시, 작품의 색감과 마감은 색·보정에서 찾습니다.",
                "Find line-art and coloring tools under brushes, and your work's color and finish under color/retouch.",
              ),
              t(
                "미리보기에서 결과와 사용권을 확인한 뒤 Studio에서 시험하거나 내 에셋에 저장합니다.",
                "Check the result and license in the preview, then test in Studio or save to your assets.",
              ),
            ]}
          />
        </SiteDisclosure>

        <section className="market-production-route mb-12" aria-labelledby="market-next-step-title">
          <div>
            <span className="text-xs font-medium text-accent">
              {t("다음 작업 이어가기", "Continue to your panel")}
            </span>
            <h2 id="market-next-step-title" className="mt-2.5">
              {t("재료를 골랐다면", "Picked your materials?")}
              <br />
              {t("이제 내 원고에 맞춰보세요", "Now fit them to your manuscript")}
            </h2>
            <p>
              {t(
                "마음에 드는 소재를 모으고 제작 조건을 비교하세요. 선화·채색이 막히는 순간에는 학습 과정을, 장면의 근거가 필요할 때에는 리서치 데스크를 이어서 활용할 수 있습니다.",
                "Collect the materials you like and compare production conditions. When line art or coloring stalls, continue with learning paths; when a scene needs grounding, continue with the research desk.",
              )}
            </p>
          </div>
          <nav aria-label={t("리소스 선택 다음 작업", "Next steps after choosing resources")}>
            <Link href="/market/library" className="ink-arrow">
              <span>{t("내 에셋에서 작업 재료 정리", "Organize working materials in my assets")}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/learn/paths/visual-finish" className="ink-arrow">
              <span>{t("선과 색의 완성도를 높이는 실습", "Practice to polish lines and colors")}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/research/assets" className="ink-arrow">
              <span>{t("복식·소품·배경 레퍼런스 찾기", "Find costume, prop & background references")}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/studio" className="ink-arrow">
              <span>{t("ToonStudio에서 다음 컷 그리기", "Draw the next panel in ToonStudio")}</span>
              <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
            </Link>
            <Link href="/studio/growth-ip#rights" className="ink-arrow">
              <span>{t("2차 판권·시즌 펀딩 IP 확장 설계", "Plan secondary IP rights & season funding")}</span>
              <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </nav>
        </section>

        <SiteDisclosure
          icon={BadgeCheck}
          title={t("사용권 안내", "License guide")}
          summary={t(
            "무료 여부와 별개로 상업 이용, 수정, 출처 표기 조건을 확인하세요",
            "Regardless of whether it is free, check the conditions for commercial use, modification, and attribution",
          )}
          badge={
            <span className="shrink-0 rounded-[6px] border border-line px-2 py-0.5 text-xs font-medium text-fg-2 tabular-nums">
              {MARKET_LICENSE_GUIDE.length}
            </span>
          }
        >
          <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {MARKET_LICENSE_GUIDE.map((license) => (
              <li
                key={license.license}
                className="rounded-[12px] border border-line bg-card p-4 transition-colors hover:border-line-strong"
              >
                <h3 className="text-sm font-semibold text-fg">{license.label}</h3>
                <p className="mt-1.5 text-sm leading-6 text-fg-2 [word-break:keep-all]">
                  {license.summary}
                </p>
                <a
                  href={license.url ?? "/terms"}
                  target={license.url ? "_blank" : undefined}
                  rel={license.url ? "noreferrer" : undefined}
                  className="mt-2 inline-flex min-h-11 items-center text-sm text-cool underline decoration-current underline-offset-2 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  {t("사용권 전문 보기", "Read the full license")}
                  {license.url ? " ↗" : ""}
                </a>
              </li>
            ))}
          </ul>
        </SiteDisclosure>
      </Container>
    </div>
  );
}
