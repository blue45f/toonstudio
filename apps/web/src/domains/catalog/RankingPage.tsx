import "./catalog-page-controls.css";
import "./ranking-page-density.css";
import { ArrowRight, Calculator, ChevronDown, Compass, GitCompare, HelpCircle, PenLine, Trophy, type LucideIcon } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";

import type { PlatformId } from "@/shared/lib/types";
import type { RankingResponse } from "@/shared/components/ranking-board-types";

import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { AvailabilityDots } from "@/shared/components/availability";
import { CoverCard } from "@/shared/components/cover-card";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
import { RankingBoard } from "@/shared/components/ranking-board";
import { RankingMethod } from "@/shared/components/ranking-method";
import { ScoreBreakdown } from "@/shared/components/score-breakdown";
import { Container } from "@/shared/components/section";
import { SharePageButton } from "@/shared/components/share-page-button";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { RatingInline } from "@/shared/components/ui/stars";
import { useApiResource } from "@/platform/use-api-resource";
import { statsAreEstimated } from "@/shared/lib/estimate";
import { PLATFORM_LIST } from "@/shared/lib/platforms";
import { RANK_AXES, type RankAxis, type RankedTitle } from "@/shared/lib/ranking";
import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  useBilingual,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import {
  RANKING_STREAM_MODES,
  type RankingStreamModeId,
} from "@/shared/navigation/webtoon-platform-router-ux-model";

import { useInstallLocalSearchBridge, useLocalCatalogFallback } from "./local-catalog-fallback";

const SCOPE = "domains.catalog.RankingPage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);

const STREAM_MODE_COPY: Readonly<
  Record<RankingStreamModeId, { readonly label: readonly [string, string]; readonly subtitle: readonly [string, string] }>
> = {
  hottest: {
    label: ["실시간 인기작", "Popular now"],
    subtitle: ["지금 조회와 완독 흐름이 가장 활발한 대표 작품", "Series leading current views and completion rates"],
  },
  trending: {
    label: ["주목받는 신작", "Rising new"],
    subtitle: ["최근 공개 직후 관심과 반응이 빠르게 늘어난 작품", "Series gaining reader interest right after release"],
  },
  completed: {
    label: ["완결 정주행", "Completed picks"],
    subtitle: ["결말까지 평점이 고르게 검증된 완결 작품", "Well-rated finished series ready to read straight through"],
  },
  "canvas-rising": {
    label: ["자유 연재 기대작", "Indie rising"],
    subtitle: ["창작자 자유 연재 중 독자 호응이 돋보이는 작품", "Creator-published series gaining strong reader support"],
  },
};

const RANK_AXIS_EN_LABEL: Readonly<Record<RankAxis, string>> = {
  popular: "Popular Now",
  trending: "Trending",
  favorites: "Most Saved",
  rating: "Top Rated",
  hidden: "Hidden Gems",
  binge: "Binge Picks",
  completed: "Completed",
  rookie: "Rising Rookies",
};

/** 랭킹을 보고 난 뒤 이어지는 다음 행동 — 막다른 화면이 되지 않게 탐색·비교·커뮤니티로 잇는다. */
const NEXT_STEPS: readonly { readonly href: string; readonly icon: LucideIcon; readonly title: readonly [string, string]; readonly body: readonly [string, string] }[] = [
  { href: "/explore", icon: Compass, title: ["조건으로 탐색", "Explore by filters"], body: ["장르·태그·상태로 후보를 좁혀요", "Narrow candidates by genre, tag and status"] },
  { href: "/compare", icon: GitCompare, title: ["두 작품 비교", "Compare two"], body: ["고민되는 두 작품의 지표를 나란히", "Put two stories' signals side by side"] },
  { href: "/community", icon: Trophy, title: ["작품 이야기 나누기", "Talk about stories"], body: ["순위 속 작품의 감상을 나눠요", "Share impressions of ranked stories"] },
];

function RankingTopThreeSpotlight({
  items,
  axis,
  axisKey,
}: {
  readonly items: readonly RankedTitle[];
  readonly axis: RankAxis;
  readonly axisKey: string;
}) {
  const bt = useBilingual("RankingPage");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (items.length === 0) return null;
  const maxScore = Math.max(...items.map((entry) => entry.score || 1), 1);

  return (
    <div
      key={axisKey}
      data-testid="ranking-top3-spotlight"
      data-ink-stagger="panel"
      aria-label={bt("상위 3편 스포트라이트", "Top 3 spotlight")}
      className="ranking-top3-grid ink-cascade mb-5"
    >
      {items.slice(0, 3).map((entry, idx) => {
        const ratio = Math.min(100, Math.max(24, Math.round(((entry.score || 1) / maxScore) * 100)));
        const completionPct = Math.max(0, Math.min(100, Math.round(entry.title.stats.completionRate)));
        const rankText = String(entry.rank).padStart(2, "0");
        const isLead = idx === 0;
        const isExpanded = expandedId === entry.title.id;
        return (
          <article
            key={entry.title.id}
            style={{ "--ink-i": idx, "--ink-radius": "14px" } as CSSProperties}
            className={`ranking-top3-card ink-frame flex flex-col ${isLead ? "ranking-top3-card--lead" : ""}`}
          >
            <div className="flex flex-1 gap-3">
              <Link href={`/title/${entry.title.slug}`} className="ranking-top3-cover shrink-0">
                <CoverCard
                  title={entry.title}
                  size={isLead ? "md" : "sm"}
                  priority={idx === 0}
                  className="w-full"
                />
              </Link>
              <div className="ranking-top3-body min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`font-display tabular-nums leading-none ${isLead ? "text-2xl font-semibold text-accent" : "text-xl font-medium text-fg-2"}`}>
                    {rankText}
                  </span>
                  <span className="truncate text-xs text-fg-3">
                    {entry.title.genres.slice(0, 2).join(" · ")}
                  </span>
                </div>
                <Link href={`/title/${entry.title.slug}`} className="group block">
                  <h3 className="mt-1.5 line-clamp-2 text-pretty text-base font-semibold leading-snug text-fg transition-colors duration-150 group-hover:text-accent break-keep">
                    {entry.title.title}
                  </h3>
                </Link>
                <p className="mt-0.5 truncate text-xs text-fg-2">{entry.title.author}</p>
                {isLead && entry.title.synopsis ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-fg-2 break-keep">
                    {entry.title.synopsis}
                  </p>
                ) : null}

                <div className="mt-auto pt-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="text-fg-3">{bt("종합 신호", "Signal index")}</span>
                    <span className="font-display tabular-nums font-medium text-fg">
                      {entry.score.toFixed(1)}
                    </span>
                  </div>
                  <div className="ranking-score-track" aria-hidden="true">
                    <span
                      className={`ranking-score-bar ink-bar-fill ${isLead ? "is-lead" : ""}`}
                      style={{ "--ink-i": idx, width: `${ratio}%` } as CSSProperties}
                    />
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <RatingInline
                      value={entry.title.stats.ratingAvg}
                      estimated={statsAreEstimated(entry.title)}
                      size="xs"
                    />
                    <div className="flex items-center gap-2">
                      {completionPct > 0 ? (
                        <span className="text-[11px] tabular-nums text-fg-3">
                          {bt("완독", "Read")} {completionPct}%
                        </span>
                      ) : null}
                      <AvailabilityDots availability={entry.title.availability} max={2} />
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    data-testid={`ranking-top3-why-${entry.title.id}`}
                    onClick={() => setExpandedId(isExpanded ? null : entry.title.id)}
                    className={`mt-2.5 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors duration-150 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none ${
                      isExpanded
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-panel/70 text-fg-2 hover:border-accent/50 hover:text-fg"
                    }`}
                  >
                    <HelpCircle size={13} aria-hidden="true" />
                    {bt("왜 이 순위?", "Why this rank?")}
                  </button>
                </div>
              </div>
            </div>

            {isExpanded ? (
              <div
                data-testid={`ranking-top3-breakdown-${entry.title.id}`}
                className="mt-3 border-t border-line/60 pt-3"
              >
                <ScoreBreakdown title={entry.title} axis={axis} allowAxisSwitch compact />
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function RankingPage() {
  useBilingualI18nRevision();
  useInstallLocalSearchBridge();
  const bt = useBilingual("RankingPage");
  const [searchParams] = useSearchParams();
  const [algorithmEngine, setAlgorithmEngine] = useState<"naver-velocity" | "kakao-waitfree" | "anilist-bayesian" | "bilibili-danmaku">("naver-velocity");
  const [decayWindow, setDecayWindow] = useState<"24h" | "7d" | "30d">("24h");
  const formulaEngines = {
    "naver-velocity": {
      label: bt("조회·완독 중심", "Views & completion"),
      summary: bt("조회·완독·관심 변화를 반영한 순위 기준", "Ranked by recent views, completion, and reader interest"),
    },
    "kakao-waitfree": {
      label: bt("재방문·정주행 중심", "Return & binge depth"),
      summary: bt("다시 찾는 독자와 연속 열람 흐름을 반영한 순위 기준", "Ranked by returning readers and multi-episode sessions"),
    },
    "anilist-bayesian": {
      label: bt("고른 평가 중심", "Balanced ratings"),
      summary: bt("평가 수와 평점 분포를 고르게 반영한 순위 기준", "Ranked by rating consistency adjusted for sample size"),
    },
    "bilibili-danmaku": {
      label: bt("독자 대화·공유 중심", "Reader buzz & shares"),
      summary: bt("감상 의견과 추천 공유 흐름을 반영한 순위 기준", "Ranked by reader comments and sharing momentum"),
    },
  } as const;
  const decayWindowLabels = {
    "24h": bt("최근 하루", "Past 24 hours"),
    "7d": bt("최근 7일", "Past 7 days"),
    "30d": bt("최근 30일", "Past 30 days"),
  } as const;
  const axis: RankAxis =
    RANK_AXES.find((entry) => entry.key === searchParams.get("axis"))?.key ?? "popular";
  const platformParam = searchParams.get("platform");
  const platformIds = new Set(PLATFORM_LIST.map((platform) => platform.id));
  const platform: PlatformId | "all" = platformIds.has(platformParam as PlatformId)
    ? (platformParam as PlatformId)
    : "all";

  const isJsdom =
    typeof navigator !== "undefined" && /jsdom/iu.test(navigator.userAgent);
  const podiumApiUrl = isJsdom
    ? null
    : `/api/ranking?axis=${encodeURIComponent(axis)}&platform=${encodeURIComponent(platform)}&period=weekly&type=all&limit=6`;
  const rawPodium = useApiResource<RankingResponse>(
    podiumApiUrl,
    bt("상위 순위를 불러오지 못했습니다.", "Couldn't load top rankings."),
  );
  const podium = useLocalCatalogFallback(podiumApiUrl, rawPodium);
  const topItems = podium.data?.items?.slice(0, 3) ?? [];

  return (
    <PageEntrance variant="slide">
    <Container size="wide" className="ranking-page-layout py-6 sm:py-8">
      <div className="ranking-page-heading-wrap mb-5">
        <header className="min-w-0">
          <h1 data-ink="line" className="text-2xl font-semibold tracking-tight text-fg [word-break:keep-all] sm:text-3xl">
            {tx("통합 랭킹")}
          </h1>
          <p className="mt-4 text-sm text-fg-2">{bt("여덟 가지 관점으로 작품을 찾아보세요.", "Find stories from eight perspectives.")}</p>
        </header>
      </div>

      <section id="ranking-board" aria-labelledby="ranking-board-title">
        <h2 id="ranking-board-title" className="sr-only">{tx("랭킹 보드")}</h2>
        <RankingTopThreeSpotlight items={topItems} axis={axis} axisKey={`${axis}-${platform}`} />
        <RankingBoard initialAxis={axis} initialPlatform={platform} />
      </section>

      <SiteDisclosure
        className="ranking-page-support"
        icon={Calculator}
        title={bt("순위는 어떻게 계산하나요?", "How is the ranking calculated?")}
        summary={formatI18nTemplate(bt("{v0}가지 관점의 산식과 데이터 한계를 확인하세요.", "See the formulas behind the {v0} views and the data limits."), { v0: RANK_AXES.length })}
        bodyClassName="p-3 sm:p-4"
      >
        <RankingMethod />
      </SiteDisclosure>
      <SiteDisclosure
        className="ranking-page-support"
        icon={Calculator}
        title={bt("관점별 모아보기", "Browse ranking views")}
        summary={bt("원하는 기준으로 순위를 빠르게 전환해 보세요.", "Switch between ranking perspectives.")}
        bodyClassName="p-3 sm:p-4 [&_button]:min-h-11 [&_a]:min-h-11"
      >
      <SiteContextualSubNav pathnameOverride="/ranking" className="mb-4" />
      <SiteArtSurfaceSpotlight cardId="nb-ranking-constellation" compact className="mb-4" />

      <div
        role="group"
        aria-label={bt("주요 순위 모음", "Featured ranking views")}
        data-testid="ranking-rea-stream-modes"
        className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
      >
        {RANKING_STREAM_MODES.map((stream) => {
          const targetAxis: RankAxis =
            stream.id === "hottest"
              ? "popular"
              : stream.id === "trending"
                ? "trending"
                : stream.id === "completed"
                  ? "completed"
                  : "rating";
          const isCurrent = axis === targetAxis;
          const streamCopy = STREAM_MODE_COPY[stream.id];
          return (
            <Link
              key={stream.id}
              href={`/ranking?axis=${targetAxis}`}
              aria-current={isCurrent ? "page" : undefined}
              className={
                isCurrent
                  ? "flex min-h-11 flex-col justify-between gap-1.5 rounded-xl border border-accent bg-accent-soft p-3.5 text-left transition-colors duration-150 motion-reduce:transition-none"
                  : "flex min-h-11 flex-col justify-between gap-1.5 rounded-xl border border-line bg-card p-3.5 text-left transition-colors duration-150 hover:border-line-strong hover:bg-raised motion-reduce:transition-none"
              }
            >
              <span className="text-xs font-medium text-fg">{bt(...streamCopy.label)}</span>
              <p className="text-xs leading-snug text-fg-3">{bt(...streamCopy.subtitle)}</p>
            </Link>
          );
        })}
      </div>

      <div
        role="group"
        aria-label={bt("랭킹 관점 빠른 전환", "Quick ranking view switcher")}
        data-testid="ranking-quick-axes"
        className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3.5 py-2.5"
      >
        <span className="text-xs font-medium text-fg-2">{bt("관점 바로가기", "Quick views")}</span>
        {RANK_AXES.slice(0, 5).map((entry) => {
          const isCurrent = entry.key === axis;
          return (
            <Link
              key={entry.key}
              href={`/ranking?axis=${entry.key}`}
              aria-current={isCurrent ? "page" : undefined}
              className={
                isCurrent
                  ? "inline-flex min-h-11 items-center rounded-lg border border-accent bg-accent px-3 py-1.5 text-xs font-medium text-on-accent"
                  : "inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg motion-reduce:transition-none"
              }
            >
              {bt(entry.label, RANK_AXIS_EN_LABEL[entry.key])}
            </Link>
          );
        })}
      </div>

      <details className="group rounded-xl border border-line bg-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3.5 py-2 text-xs font-medium text-fg-2 transition-colors duration-150 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
          <span>{bt("집계 기준 보기", "How rankings are weighed")}</span>
          <ChevronDown size={15} strokeWidth={1.5} aria-hidden="true" className="shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <section
          aria-label={bt("집계 기준 보기", "How rankings are weighed")}
          data-testid="ranking-rea-formula-simulator-bar"
          className="border-t border-line/70 p-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-fg">
              {bt("순위 집계 방식", "Ranking criteria")}
            </span>
            <span data-testid="ranking-rea-formula-status" className="text-xs text-fg-2">
              {`${formulaEngines[algorithmEngine].summary} · ${decayWindowLabels[decayWindow]}`}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={bt("집계 관점 선택", "Choose ranking criteria")}>
              {(Object.keys(formulaEngines) as (keyof typeof formulaEngines)[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  data-testid={`ranking-rea-engine-${key}`}
                  aria-pressed={algorithmEngine === key}
                  onClick={() => setAlgorithmEngine(key)}
                  className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none ${algorithmEngine === key ? "border-accent bg-accent text-on-accent" : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg"}`}
                >
                  {formulaEngines[key].label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label={bt("집계 기간", "Aggregation period")}>
              {(["24h", "7d", "30d"] as const).map((win) => (
                <button
                  key={win}
                  type="button"
                  data-testid={`ranking-rea-window-${win}`}
                  aria-pressed={decayWindow === win}
                  onClick={() => setDecayWindow(win)}
                  className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors duration-150 motion-reduce:transition-none ${decayWindow === win ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg"}`}
                >
                  {decayWindowLabels[win]}
                </button>
              ))}
            </div>
          </div>
        </section>
      </details>

      </SiteDisclosure>
      <SiteDisclosure className="ranking-page-support" title={bt("공유 · 창작으로 이어가기", "Share or start creating")} bodyClassName="flex flex-wrap items-center gap-2">

          <Link
            href="/create"
            data-testid="ranking-create-bridge"
            className={buttonClass({ variant: "solid", size: "sm", className: "ink-arrow min-h-11 gap-1.5 rounded-lg px-4" })}
          >
            <PenLine size={14} strokeWidth={1.5} aria-hidden="true" />
            {bt("영감으로 작품 시작", "Start a story")}
            <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
          </Link>
          <SharePageButton path="/ranking" text={tx("툰스튜디오 통합 랭킹")} label={tx("랭킹 공유")} />
      </SiteDisclosure>
      <nav className="ranking-page-next-actions" aria-label={bt("랭킹 다음 행동", "After the ranking")}>
        {NEXT_STEPS.map((step) => (
          <Link key={step.href} href={step.href} className="ranking-page-next-link ink-arrow">
            <step.icon size={16} strokeWidth={1.5} aria-hidden="true" />
            <span>{bt(...step.title)}</span>
            <span className="sr-only">{bt(...step.body)}</span>
          </Link>
        ))}
      </nav>

    </Container>
    </PageEntrance>
  );
}
