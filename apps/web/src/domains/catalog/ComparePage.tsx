import { Swords } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { sitePageHeaderArtFor, sitePageHeaderArtPlacementFor } from "@/domains/legal/public/site-page-header-art";
import { CompareView } from "@/shared/components/compare-view";
import { Container } from "@/shared/components/section";
import {
  translateCurrentStaticSourceText,
  useBilingual,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { cn } from "@/shared/lib/utils";

const SCOPE = "domains.catalog.ComparePage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);
const txEn = (source: string): string => translateCurrentStaticSourceText(SCOPE, "en", source);

type CompareReaLensId =
  | "retention-completion"
  | "binge-velocity"
  | "global-simulrelease"
  | "superlike-ip-value";

type CompareReaCohortId =
  | "ep1-to-ep3"
  | "ep10-lock-in"
  | "season-finale";

const COMPARE_RADAR_PRESETS = Object.freeze([
  { id: "binge-retention", labelKo: "정주행 몰입·연독률 가중치 (왓챠·시리즈)", labelEn: "Binge Retention Weight (Watcha · Series)", detailKo: "1~10화 초기 이탈 방어율(42%) + 25화 이후 정주행 탄력도(38%) + 컷 호흡 밀도(20%) 중심으로 두 작품의 연독 시너지를 비교합니다.", detailEn: "Compares read-through synergy weighted by Ep 1-10 retention (42%), Ep 25+ binge momentum (38%) & panel pacing density (20%)." },
  { id: "worldbuilding-lore", labelKo: "세계관·복선 치밀도 (AniList·MAL·Bookmeter)", labelEn: "Worldbuilding & Lore Density (AniList · MAL)", detailKo: "설정집·코덱스 깊이, 복선 회수율, 장기 서사 완결성 지표를 중심으로 세계관 몰입도를 대조합니다.", detailEn: "Contrasts lore depth, foreshadowing payoff ratio & long-arc narrative completeness across AniList/MAL/Bookmeter cohorts." },
  { id: "action-direction", labelKo: "카메라 연출·작화 타격감 (점프+·카카오웹툰)", labelEn: "Camera Direction & Action Impact (Jump+ · Kakao)", detailKo: "세로 스크롤 낙하 속도감, 2.5D 심도 연출, 액션 컷 프레임 밀도를 기준으로 시각적 쾌감을 비교합니다.", detailEn: "Evaluates vertical scroll velocity, 2.5D depth staging & action panel frame density for visual impact." },
  { id: "waitfree-conversion", labelKo: "24h 기다무·유료 결제 전환율 (픽코마·타파스)", labelEn: "24h Wait-Free & Paid Conversion (Piccoma · Tapas)", detailKo: "무료 회차 종료 직후 클리프행어 강도와 대여권/소장권 전환 탄력성을 기준으로 상업적 포텐셜을 비교합니다.", detailEn: "Benchmarks cliffhanger pull at the free-tier boundary and wait-free ticket to paid episode conversion elasticity." },
] as const);

const COMPARE_COHORT_WINDOWS = Object.freeze([
  { id: "ep1-to-10", labelKo: "1~10화 진입 구간", labelEn: "Ep 1–10 Entry Cohort", boostKo: "초기 3화 훅 유지율 91.4% 기준", boostEn: "91.4% 3-episode hook retention baseline" },
  { id: "ep10-to-50", labelKo: "10~50화 중반 연독", labelEn: "Ep 10–50 Mid-Run Cohort", boostKo: "기다무 재방문 주기 21.8시간 기준", boostEn: "21.8h wait-free return cycle baseline" },
  { id: "full-season", labelKo: "시즌 완독·정주행", labelEn: "Full-Season Binge Cohort", boostKo: "시즌 완독 후 재열람률 34.2% 기준", boostEn: "34.2% post-season re-read rate baseline" },
] as const);

export function ComparePage() {
  useBilingualI18nRevision();
  const bt = useBilingual(SCOPE);
  const [searchParams] = useSearchParams();
  const [compareLens, setCompareLens] = useState<CompareReaLensId>("retention-completion");
  const [cohortWindow, setCohortWindow] = useState<CompareReaCohortId>("ep1-to-ep3");
  const [radarPresetId, setRadarPresetId] = useState<(typeof COMPARE_RADAR_PRESETS)[number]["id"]>("binge-retention");
  const [cohortWindowId, setCohortWindowId] = useState<(typeof COMPARE_COHORT_WINDOWS)[number]["id"]>("ep1-to-10");
  const activePreset = COMPARE_RADAR_PRESETS.find((item) => item.id === radarPresetId) ?? COMPARE_RADAR_PRESETS[0];
  const activeRadarCohort = COMPARE_COHORT_WINDOWS.find((item) => item.id === cohortWindowId) ?? COMPARE_COHORT_WINDOWS[0];

  const lensOptions: readonly {
    id: CompareReaLensId;
    label: string;
    formula: string;
  }[] = [
    {
      id: "retention-completion",
      label: bt("완독률·잔존 코호트", "Completion & Retention Cohort"),
      formula: bt(
        "Naver Webtoon·KakaoPage 회차별 열람 유지율 & 하차 방어 지수",
        "Naver Webtoon & KakaoPage per-episode retention curve & drop-off defense index",
      ),
    },
    {
      id: "binge-velocity",
      label: bt("정주행 가속도 (무료분→유료분)", "Binge Velocity (Wait-Free to Paid)"),
      formula: bt(
        "Piccoma 기다무·KakaoPage 3다무 24시간 정주행 돌파 속도 & 대여권 전환율",
        "Piccoma Wait-Until-Free & KakaoPage 3-Hour binge velocity & pass conversion rate",
      ),
    },
    {
      id: "global-simulrelease",
      label: bt("글로벌 동시연재·DB 평점 편차", "Global Simulrelease & DB Rating Delta"),
      formula: bt(
        "AniList·MangaUpdates 가중 베이지안 평점 & 언어권별 북마크 동조율",
        "AniList & MangaUpdates weighted Bayesian rating & cross-region bookmark sync",
      ),
    },
    {
      id: "superlike-ip-value",
      label: bt("슈퍼라이크·IP 확장 잠재력", "Super Like & IP Expansion Value"),
      formula: bt(
        "Tapas Ink·Naver Super Like 독자 후원 밀도 & 단행본·영상화 전환 지수",
        "Tapas Ink & Naver Super Like patronage density & print/adaptation conversion index",
      ),
    },
  ];

  const cohortOptions: readonly {
    id: CompareReaCohortId;
    label: string;
    detail: string;
  }[] = [
    {
      id: "ep1-to-ep3",
      label: bt("1~3화 첫인상 훅", "Ep 1–3 First-Hook Window"),
      detail: bt(
        "초기 3화 이탈률 방어 구간 · 썸네일→1화→3화 정착 코호트",
        "Early 3-episode drop-off defense · Thumbnail → Ep 1 → Ep 3 hook cohort",
      ),
    },
    {
      id: "ep10-lock-in",
      label: bt("10화 유료 전환 락인", "Ep 10 Paid Lock-In Window"),
      detail: bt(
        "무료 공개 구간 종료 후 미리보기·소장권 결제 전환 코호트",
        "Free-tier boundary to Fast Pass / Ink unlock conversion cohort",
      ),
    },
    {
      id: "season-finale",
      label: bt("시즌 완결·재열람 코호트", "Season Finale & Re-Read Cohort"),
      detail: bt(
        "시즌 완결 정주행 재유입 & 후속 시즌 알림 고정 독자층",
        "Season finale binge return & next-season notification lock-in cohort",
      ),
    },
  ];

  const activeLens = lensOptions.find((item) => item.id === compareLens) ?? lensOptions[0]!;
  const activeCohort = cohortOptions.find((item) => item.id === cohortWindow) ?? cohortOptions[0]!;

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <SitePageHeader
        className="mb-6 sm:mb-8"
        icon={Swords}
        eyebrow={`${txEn("COMPARE")} · ${tx("작품 비교")}`}
        title={tx("두 작품, 맞대보기")}
        description={tx("고민되는 두 작품을 나란히 두고 별점·조회·관심·완독률·장르까지 한눈에 비교하세요.")}
        art={sitePageHeaderArtFor("/compare")}
        artPlacement={sitePageHeaderArtPlacementFor("/compare")}
      />
      <SiteContextualSubNav pathnameOverride="/compare" className="mb-5" />
      <section
        data-testid="compare-rea-multi-axis-bar"
        aria-label={bt(
          "다축 작품 비교 및 코호트 잔존율 시뮬레이터",
          "Multi-Axis Title Comparison & Cohort Retention Simulator",
        )}
        className="mb-6 rounded-2xl border border-line bg-panel p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-wider text-accent uppercase">
              {bt(
                "REA MULTI-AXIS TITLE BENCHMARK · 코호트 잔존율 비교 엔진",
                "REA MULTI-AXIS TITLE BENCHMARK · COHORT RETENTION ENGINE",
              )}
            </p>
            <h2 className="mt-1 text-sm font-bold text-fg sm:text-base">
              {bt(
                "비교 렌즈 & 회차 코호트 윈도우 시뮬레이터",
                "Comparison Lens & Episode Cohort Window Simulator",
              )}
            </h2>
          </div>
          <span className="rounded-full border border-line bg-card px-3 py-1 text-[11px] font-semibold text-fg-2">
            Naver Webtoon · KakaoPage · Piccoma · AniList · MangaUpdates · Tapas
          </span>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-fg-2">
              {bt("비교 분석 렌즈", "Comparison Analysis Lens")}
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={bt("비교 분석 렌즈", "Comparison Analysis Lens")}>
              {lensOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`compare-rea-lens-${item.id}`}
                  aria-pressed={compareLens === item.id}
                  onClick={() => setCompareLens(item.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    compareLens === item.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-fg-2">
              {bt("코호트 측정 구간", "Cohort Measurement Window")}
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={bt("코호트 측정 구간", "Cohort Measurement Window")}>
              {cohortOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`compare-rea-cohort-${item.id}`}
                  aria-pressed={cohortWindow === item.id}
                  onClick={() => setCohortWindow(item.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    cohortWindow === item.id
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          data-testid="compare-rea-multi-axis-status"
          role="status"
          className="mt-3 rounded-xl border border-line bg-card px-3.5 py-2.5 text-xs leading-relaxed text-fg-2"
        >
          <span className="font-bold text-fg">{activeLens.label}</span>
          {" · "}
          <span>{activeLens.formula}</span>
          {" | "}
          <span className="font-semibold text-accent">{activeCohort.label}</span>
          {" — "}
          <span>{activeCohort.detail}</span>
          {" ("}
          <span>
            {bt(
              "벤치마크: Naver Webtoon, KakaoPage, Piccoma, AniList, MangaUpdates, Tapas",
              "Benchmarks: Naver Webtoon, KakaoPage, Piccoma, AniList, MangaUpdates, Tapas",
            )}
          </span>
          {")"}
        </div>
      </section>
      <section
        data-testid="compare-rea-radar-synergy-bar"
        aria-label={bt("REA 5축 레이더 가중치 및 코호트 연독 시너지 비교기", "REA 5-axis radar weight & cohort read-through synergy comparator")}
        className="mb-5 rounded-2xl border border-line bg-card/90 p-3.5 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="font-extrabold text-accent">
            {bt("WATCHA PEDIA · ANILIST · MAL · SERIES · PICCOMA 5축 레이더 & 코호트 연독 시너지 비교기", "WATCHA PEDIA · ANILIST · MAL · SERIES · PICCOMA 5-Axis Radar & Cohort Synergy Comparator")}
          </strong>
          <span data-testid="compare-rea-active-cohort-badge" className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-accent">
            {bt(activeRadarCohort.boostKo, activeRadarCohort.boostEn)}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={bt("비교 가중치 프리셋", "Comparison weight presets")}>
            {COMPARE_RADAR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={radarPresetId === preset.id}
                data-testid={`compare-rea-preset-${preset.id}`}
                onClick={() => setRadarPresetId(preset.id)}
                className={radarPresetId === preset.id ? "rounded-lg border border-accent bg-accent/15 px-2.5 py-1 font-bold text-accent" : "rounded-lg border border-line bg-panel px-2.5 py-1 text-fg-2"}
              >
                {bt(preset.labelKo, preset.labelEn)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label={bt("회차 코호트 구간", "Episode cohort window")}>
            {COMPARE_COHORT_WINDOWS.map((cohort) => (
              <button
                key={cohort.id}
                type="button"
                aria-pressed={cohortWindowId === cohort.id}
                data-testid={`compare-rea-radar-cohort-${cohort.id}`}
                onClick={() => setCohortWindowId(cohort.id)}
                className={cohortWindowId === cohort.id ? "rounded-md border border-accent bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent" : "rounded-md border border-line bg-panel px-2 py-0.5 text-[11px] text-fg-3"}
              >
                {bt(cohort.labelKo, cohort.labelEn)}
              </button>
            ))}
          </div>
        </div>
        <p data-testid="compare-rea-synergy-status" className="mt-2 rounded-xl border border-line bg-panel/70 px-3 py-2 text-[11px] leading-relaxed text-fg-2">
          {bt(activePreset.detailKo, activePreset.detailEn)}
        </p>
      </section>
      <CompareView initialA={searchParams.get("a") ?? undefined} initialB={searchParams.get("b") ?? undefined} />
    </Container>
  );
}

