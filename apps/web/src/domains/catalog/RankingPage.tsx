import "./catalog-page-controls.css";
import "./ranking-page-density.css";
import { Calculator, ChevronDown, Compass, GitCompare, PenLine, Trophy, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { PlatformId } from "@/shared/lib/types";

import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
import { RankingBoard } from "@/shared/components/ranking-board";
import { RankingMethod } from "@/shared/components/ranking-method";
import { Container } from "@/shared/components/section";
import { SharePageButton } from "@/shared/components/share-page-button";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { PLATFORM_LIST } from "@/shared/lib/platforms";
import { RANK_AXES, type RankAxis } from "@/shared/lib/ranking";
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

export function RankingPage() {
  useBilingualI18nRevision();
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

  return (
    <PageEntrance variant="slide">
    <Container size="wide" className="ranking-page-layout py-6">
      <header className="mb-3 min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{tx("통합 랭킹")}</h1>
        <p className="mt-1 text-sm text-fg-2">{bt("여덟 가지 관점으로 작품을 찾아보세요.", "Find stories from eight perspectives.")}</p>
      </header>
      <SiteContextualSubNav pathnameOverride="/ranking" className="mb-3" />

      <section id="ranking-board" aria-labelledby="ranking-board-title">
        <h2 id="ranking-board-title" className="sr-only">{tx("랭킹 보드")}</h2>
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
              <span className="text-xs font-semibold text-fg">{bt(...streamCopy.label)}</span>
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
        <span className="text-xs font-semibold text-fg-2">{bt("관점 바로가기", "Quick views")}</span>
        {RANK_AXES.slice(0, 5).map((entry) => {
          const isCurrent = entry.key === axis;
          return (
            <Link
              key={entry.key}
              href={`/ranking?axis=${entry.key}`}
              aria-current={isCurrent ? "page" : undefined}
              className={
                isCurrent
                  ? "inline-flex min-h-11 items-center rounded-lg border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent"
                  : "inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg motion-reduce:transition-none"
              }
            >
              {bt(entry.label, RANK_AXIS_EN_LABEL[entry.key])}
            </Link>
          );
        })}
      </div>

      <details className="group rounded-xl border border-line bg-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
          <span>{bt("집계 기준 보기", "How rankings are weighed")}</span>
          <ChevronDown size={15} strokeWidth={1.5} aria-hidden="true" className="shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <section
          aria-label={bt("집계 기준 보기", "How rankings are weighed")}
          data-testid="ranking-rea-formula-simulator-bar"
          className="border-t border-line/70 p-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg">
              {bt("순위 집계 방식", "Ranking criteria")}
            </span>
            <span data-testid="ranking-rea-formula-status" className="text-xs font-medium text-fg-2">
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
                  className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none ${algorithmEngine === key ? "border-accent bg-accent font-semibold text-on-accent" : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg"}`}
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
                  className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors duration-150 motion-reduce:transition-none ${decayWindow === win ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg"}`}
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
            className={buttonClass({ variant: "solid", size: "sm", className: "min-h-11 gap-1.5 rounded-lg px-4" })}
          >
            <PenLine size={14} strokeWidth={1.5} aria-hidden="true" />
            {bt("영감으로 작품 시작", "Start a story")}
          </Link>
          <SharePageButton path="/ranking" text={tx("툰스튜디오 통합 랭킹")} label={tx("랭킹 공유")} />
      </SiteDisclosure>
      <nav className="ranking-page-next-actions" aria-label={bt("랭킹 다음 행동", "After the ranking")}>
        {NEXT_STEPS.map((step) => (
          <Link key={step.href} href={step.href} className="ranking-page-next-link">
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
