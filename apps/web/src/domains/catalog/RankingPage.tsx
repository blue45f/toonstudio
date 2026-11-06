import "./catalog-page-controls.css";
import { Calculator, ChevronRight, Compass, GitCompare, ListFilter, Trophy, type LucideIcon } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";

import type { PlatformId } from "@/shared/lib/types";

import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
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
import { RANKING_STREAM_MODES } from "@/shared/navigation/webtoon-platform-router-ux-model";
import { MotionIllustration } from "@/shared/motion-assets";

const SCOPE = "domains.catalog.RankingPage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);
const txEn = (source: string): string => translateCurrentStaticSourceText(SCOPE, "en", source);

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
  // 축 key("popular")를 그대로 노출하지 않고 사람이 읽는 한글 라벨("실시간 인기")로 표시.
  const axisLabel = RANK_AXES.find((entry) => entry.key === axis)?.label ?? axis;
  const platformParam = searchParams.get("platform");
  const platformIds = new Set(PLATFORM_LIST.map((platform) => platform.id));
  const platform: PlatformId | "all" = platformIds.has(platformParam as PlatformId)
    ? (platformParam as PlatformId)
    : "all";

  const jumpToBoard = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById("ranking-board")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <PageEntrance variant="slide">
    <Container size="wide" className="ranking-page-layout py-6 sm:py-10">
      <SiteContextualSubNav pathnameOverride="/ranking" className="mb-5" />
      <SitePageHeader
        className="mb-6 sm:mb-8"
        icon={Trophy}
        eyebrow={txEn("UNIFIED RANKING")}
        title={tx("통합 랭킹")}
        description={tx("무엇을 볼지 고민될 때 가장 확실한 출발점. 인기·급상승·평점까지, 여덟 가지 관점으로 지금의 흐름을 바로 확인해 보세요.")}
        aside={
          <MotionIllustration
            name="trophy"
            size="xl"
            className="mx-auto text-accent"
            title={tx("통합 랭킹 트로피 일러스트")}
          />
        }
        asideClassName="hidden lg:flex lg:justify-end"
        actions={
          <>
            <a
              href="#ranking-board"
              onClick={jumpToBoard}
              className={buttonClass({ size: "sm", className: "hidden min-h-11 gap-1.5 sm:inline-flex" })}
            >
              <ChevronRight size={14} aria-hidden="true" />
              {tx("랭킹 시작점으로 이동")}
            </a>
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-xs text-fg-2">
              <ListFilter size={14} className="text-fg-3" aria-hidden="true" />
              {tx("현재 축:")} <span className="font-medium text-fg">{axisLabel}</span>
            </span>
            {/* 랭킹 공유 — OS 공유 시트 → 클립보드 폴백 */}
            <SharePageButton path="/ranking" text={tx("툰스튜디오 통합 랭킹")} label={tx("랭킹 공유")} />
          </>
        }
      />

      <section id="ranking-board" aria-labelledby="ranking-board-title">
        <h2 id="ranking-board-title" className="sr-only">{tx("랭킹 보드")}</h2>
        <RankingBoard initialAxis={axis} initialPlatform={platform} />
      </section>



      <nav className="mt-10 grid grid-cols-1 gap-2.5 sm:mt-12 md:grid-cols-3" aria-label={bt("랭킹 다음 행동", "After the ranking")}>
        {NEXT_STEPS.map((step) => (
          <SiteLinkCard key={step.href} layout="compact" href={step.href} icon={step.icon} title={bt(...step.title)} description={bt(...step.body)} />
        ))}
      </nav>

      <SiteDisclosure
        className="mt-6"
        icon={Calculator}
        title={bt("순위는 어떻게 계산하나요?", "How is the ranking calculated?")}
        summary={formatI18nTemplate(bt("{v0}가지 관점의 산식과 데이터 한계를 확인하세요.", "See the formulas behind the {v0} views and the data limits."), { v0: RANK_AXES.length })}
        bodyClassName="p-3 sm:p-4"
      >
        <RankingMethod />
      </SiteDisclosure>
      <SiteDisclosure
        className="mt-6"
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
          return (
            <Link
              key={stream.id}
              href={`/ranking?axis=${targetAxis}`}
              aria-current={isCurrent ? "page" : undefined}
              className={
                isCurrent
                  ? "flex flex-col justify-between gap-1.5 rounded-2xl border border-accent bg-accent/12 p-3.5 text-left shadow-sm transition-colors"
                  : "flex flex-col justify-between gap-1.5 rounded-2xl border border-line bg-card/75 p-3.5 text-left transition-colors hover:border-accent/45 hover:bg-card"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-fg">{stream.label}</span>
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-extrabold text-accent">
                  {stream.badge}
                </span>
              </div>
              <p className="text-[11px] leading-snug text-fg-3">{stream.subtitle}</p>
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
                  ? "inline-flex min-h-8 items-center rounded-full border border-accent bg-accent px-3 py-1 text-xs font-bold text-on-accent"
                  : "inline-flex min-h-8 items-center rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
              }
            >
              {entry.label}
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
                className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${algorithmEngine === key ? "border-accent bg-accent text-on-accent" : "border-line bg-panel text-fg-2 hover:border-accent/50"}`}
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
                className={`rounded-lg border px-2 py-1 text-xs font-bold transition-colors ${decayWindow === win ? "border-accent bg-accent/15 text-accent" : "border-line bg-panel text-fg-3"}`}
              >
                {win}
              </button>
            ))}
          </div>
        </div>
      </section>

      </SiteDisclosure>
    </Container>
    </PageEntrance>
  );
}
