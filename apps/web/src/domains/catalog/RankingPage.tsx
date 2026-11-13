import "./catalog-page-controls.css";
import "./ranking-page-density.css";
import { Calculator, Compass, GitCompare, PenLine, Trophy, type LucideIcon } from "lucide-react";
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

const STREAM_MODE_EN_COPY: Readonly<
  Record<RankingStreamModeId, { readonly label: string; readonly subtitle: string }>
> = {
  hottest: {
    label: "Hottest Now",
    subtitle: "Flagship hits leading live views and reader completion rates",
  },
  trending: {
    label: "Trending New",
    subtitle: "Series surging in bookmarks and trailer engagement right after release",
  },
  completed: {
    label: "Completed Classics",
    subtitle: "Top-rated finished series verified through the finale for binge reading",
  },
  "canvas-rising": {
    label: "CANVAS Rising",
    subtitle: "Open-league contenders on track for official serialization promotion",
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
      label: bt("네이버·라인웹툰 조회 가속도 + 완독률(91%)", "Naver/LINE Velocity + Read-Through (91%)"),
      summary: bt("Score = 0.55×ΔViews + 0.35×ReadThrough(91%) + 0.10×SuperLike", "Score = 0.55×ΔViews + 0.35×ReadThrough(91%) + 0.10×SuperLike"),
    },
    "kakao-waitfree": {
      label: bt("카카오페이지·픽코마 24h 기다무 충전 전환율(+34%)", "KakaoPage/Piccoma 24h Wait-Free Conversion (+34%)"),
      summary: bt("Score = 0.45×WaitFreeReturn(24h) + 0.40×PaidPass + 0.15×BingeDepth", "Score = 0.45×WaitFreeReturn(24h) + 0.40×PaidPass + 0.15×BingeDepth"),
    },
    "anilist-bayesian": {
      label: bt("AniList·MangaUpdates·MAL 베이지안 가중 평점(WR)", "AniList/MangaUpdates/MAL Bayesian Weighted Rating (WR)"),
      summary: bt("WR = (v/(v+m))×R + (m/(v+m))×C · 표본 편향 제거 정밀 랭킹", "WR = (v/(v+m))×R + (m/(v+m))×C · Sample-bias corrected"),
    },
    "bilibili-danmaku": {
      label: bt("빌리빌리·콰이칸 탄막(Danmaku) 밀도 & 열기 지수", "Bilibili/Kuaikan Danmaku Density & Heat Index"),
      summary: bt("Heat = 0.50×DanmakuPerCut + 0.30×ShareVelocity + 0.20×CoinGift", "Heat = 0.50×DanmakuPerCut + 0.30×ShareVelocity + 0.20×CoinGift"),
    },
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
        <h1 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">{tx("통합 랭킹")}</h1>
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
        title={bt("랭킹 스트림 · 산식 시뮬레이터", "Ranking streams and formula simulator")}
        summary={bt("빠른 관점 전환과 산식 설명을 펼쳐보세요.", "Expand quick views and formula explanations.")}
        bodyClassName="p-3 sm:p-4 [&_button]:min-h-11 [&_a]:min-h-11"
      >
      <SiteArtSurfaceSpotlight cardId="nb-ranking-constellation" compact className="mb-5" />

      <div
        role="group"
        aria-label={bt("4대 글로벌 랭킹 스트림", "4-stream ranking selector")}
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
          const enStream = STREAM_MODE_EN_COPY[stream.id];
          return (
            <Link
              key={stream.id}
              href={`/ranking?axis=${targetAxis}`}
              aria-current={isCurrent ? "page" : undefined}
              className={
                isCurrent
                  ? "flex min-h-11 flex-col justify-between gap-1.5 rounded-2xl border border-accent bg-accent/12 p-3.5 text-left shadow-sm transition-colors"
                  : "flex min-h-11 flex-col justify-between gap-1.5 rounded-2xl border border-line bg-card/75 p-3.5 text-left transition-colors hover:border-accent/45 hover:bg-card"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-fg">{bt(stream.label, enStream.label)}</span>
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-extrabold text-accent">
                  {stream.badge}
                </span>
              </div>
              <p className="text-[11px] leading-snug text-fg-3">{bt(stream.subtitle, enStream.subtitle)}</p>
            </Link>
          );
        })}
      </div>

      <div
        role="group"
        aria-label={bt("랭킹 관점 빠른 전환", "Quick ranking view switcher")}
        data-testid="ranking-quick-axes"
        className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card/65 px-3.5 py-2.5"
      >
        <span className="text-xs font-bold text-fg-2">{bt("관점 바로가기:", "Quick views:")}</span>
        {RANK_AXES.slice(0, 5).map((entry) => {
          const isCurrent = entry.key === axis;
          return (
            <Link
              key={entry.key}
              href={`/ranking?axis=${entry.key}`}
              aria-current={isCurrent ? "page" : undefined}
              className={
                isCurrent
                  ? "inline-flex min-h-11 items-center rounded-full border border-accent bg-accent px-3.5 py-1.5 text-xs font-bold text-on-accent"
                  : "inline-flex min-h-11 items-center rounded-full border border-line bg-panel px-3.5 py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
              }
            >
              {bt(entry.label, RANK_AXIS_EN_LABEL[entry.key])}
            </Link>
          );
        })}
      </div>

      <section
        aria-label={bt("REA 글로벌 플랫폼 랭킹 산식 및 감쇠 윈도우 시뮬레이터", "REA Global Platform Ranking Formula & Decay Simulator")}
        data-testid="ranking-rea-formula-simulator-bar"
        className="mb-5 rounded-2xl border border-line bg-card/80 p-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-extrabold text-fg">
            {bt("네이버 · 카카오/픽코마 · AniList/MangaUpdates · 빌리빌리 랭킹 산식 시뮬레이터", "Naver / Kakao·Piccoma / AniList·MangaUpdates / Bilibili Ranking Formula Simulator")}
          </span>
          <span data-testid="ranking-rea-formula-status" className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-accent">
            {`${formulaEngines[algorithmEngine].summary} · Window(${decayWindow})`}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={bt("랭킹 산식 엔진", "Ranking formula engine")}>
            {(Object.keys(formulaEngines) as (keyof typeof formulaEngines)[]).map((key) => (
              <button
                key={key}
                type="button"
                data-testid={`ranking-rea-engine-${key}`}
                aria-pressed={algorithmEngine === key}
                onClick={() => setAlgorithmEngine(key)}
                className={`inline-flex min-h-11 items-center rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${algorithmEngine === key ? "border-accent bg-accent text-on-accent" : "border-line bg-panel text-fg-2 hover:border-accent/50"}`}
              >
                {formulaEngines[key].label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5" role="group" aria-label={bt("시간 감쇠 윈도우", "Time decay window")}>
            {(["24h", "7d", "30d"] as const).map((win) => (
              <button
                key={win}
                type="button"
                data-testid={`ranking-rea-window-${win}`}
                aria-pressed={decayWindow === win}
                onClick={() => setDecayWindow(win)}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${decayWindow === win ? "border-accent bg-accent/15 text-accent" : "border-line bg-panel text-fg-3"}`}
              >
                {win}
              </button>
            ))}
          </div>
        </div>
      </section>

      </SiteDisclosure>
      <SiteDisclosure className="ranking-page-support" title={bt("공유 · 창작으로 이어가기", "Share or start creating")} bodyClassName="flex flex-wrap items-center gap-2">

          <Link
            href="/create"
            data-testid="ranking-create-bridge"
            className={buttonClass({ variant: "solid", size: "sm", className: "min-h-11 gap-1.5 rounded-full px-4" })}
          >
            <PenLine size={14} aria-hidden="true" />
            {bt("영감으로 작품 시작", "Start a story")}
          </Link>
          <SharePageButton path="/ranking" text={tx("툰스튜디오 통합 랭킹")} label={tx("랭킹 공유")} />
      </SiteDisclosure>
      <nav className="ranking-page-next-actions" aria-label={bt("랭킹 다음 행동", "After the ranking")}>
        {NEXT_STEPS.map((step) => (
          <Link key={step.href} href={step.href} className="ranking-page-next-link">
            <step.icon size={16} aria-hidden="true" />
            <span>{bt(...step.title)}</span>
            <span className="sr-only">{bt(...step.body)}</span>
          </Link>
        ))}
      </nav>

    </Container>
    </PageEntrance>
  );
}
