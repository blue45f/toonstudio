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

const SCOPE = "domains.catalog.ComparePage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);
const txEn = (source: string): string => translateCurrentStaticSourceText(SCOPE, "en", source);

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
  const [radarPresetId, setRadarPresetId] = useState<(typeof COMPARE_RADAR_PRESETS)[number]["id"]>("binge-retention");
  const [cohortWindowId, setCohortWindowId] = useState<(typeof COMPARE_COHORT_WINDOWS)[number]["id"]>("ep1-to-10");
  const activePreset = COMPARE_RADAR_PRESETS.find((item) => item.id === radarPresetId) ?? COMPARE_RADAR_PRESETS[0];
  const activeCohort = COMPARE_COHORT_WINDOWS.find((item) => item.id === cohortWindowId) ?? COMPARE_COHORT_WINDOWS[0];

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
        data-testid="compare-rea-radar-synergy-bar"
        aria-label={bt("REA 5축 레이더 가중치 및 코호트 연독 시너지 비교기", "REA 5-axis radar weight & cohort read-through synergy comparator")}
        className="mb-5 rounded-2xl border border-line bg-card/90 p-3.5 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="font-extrabold text-accent">
            {bt("WATCHA PEDIA · ANILIST · MAL · SERIES · PICCOMA 5축 레이더 & 코호트 연독 시너지 비교기", "WATCHA PEDIA · ANILIST · MAL · SERIES · PICCOMA 5-Axis Radar & Cohort Synergy Comparator")}
          </strong>
          <span data-testid="compare-rea-active-cohort-badge" className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-accent">
            {bt(activeCohort.boostKo, activeCohort.boostEn)}
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
                data-testid={`compare-rea-cohort-${cohort.id}`}
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
