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

export function ComparePage() {
  useBilingualI18nRevision();
  const bt = useBilingual(SCOPE);
  const [searchParams] = useSearchParams();
  const [compareLens, setCompareLens] = useState<CompareReaLensId>("retention-completion");
  const [cohortWindow, setCohortWindow] = useState<CompareReaCohortId>("ep1-to-ep3");

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
      <CompareView initialA={searchParams.get("a") ?? undefined} initialB={searchParams.get("b") ?? undefined} />
    </Container>
  );
}

