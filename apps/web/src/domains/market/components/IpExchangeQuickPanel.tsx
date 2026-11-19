import { Box, Briefcase, CheckCircle2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  IP_DEAL_MEDIUM_LABELS,
  evaluate3dSellerAssetFit,
  evaluateB2bIpDealReadiness,
  type B2bIpListingSpec,
  type Seller3dAssetSpec,
} from "../models/ip-exchange-fit";

const SAMPLE_IP_DEALS: readonly B2bIpListingSpec[] = [
  {
    id: "deal-1",
    title: "서울 게이트 브레이커",
    genre: "현대판타지 · 액션",
    medium: "animation",
    episodesReady: 48,
    rightsBomCleared: true,
    hasPilotCutPack: true,
    hasStoryBible: true,
    creatorRoyaltyPercent: 12,
    targetMgKrw: 120_000_000,
  },
  {
    id: "deal-2",
    title: "남해안 골목 찻집 일기",
    genre: "로컬 · 힐링",
    medium: "local-tourism",
    episodesReady: 16,
    rightsBomCleared: true,
    hasPilotCutPack: true,
    hasStoryBible: true,
    creatorRoyaltyPercent: 22,
    targetMgKrw: 18_000_000,
  },
  {
    id: "deal-3",
    title: "밤 11시 감정 체크인 룸",
    genre: "직장인 · 웰니스",
    medium: "wellness-goods",
    episodesReady: 12,
    rightsBomCleared: true,
    hasPilotCutPack: true,
    hasStoryBible: false,
    creatorRoyaltyPercent: 24,
    targetMgKrw: 15_000_000,
  },
];

const SAMPLE_3D_SELLER_SETS: readonly Seller3dAssetSpec[] = [
  {
    assetId: "seller-3d-1",
    title: "서울 옥상·계단 조립형 3D 모듈 세트",
    format: "skp",
    modularSnap1m: true,
    manifoldClean: true,
    commercialBomCleared: true,
    autoRoyaltyPercent: 12,
  },
  {
    assetId: "seller-3d-2",
    title: "로판 궁전 아치 회랑 · 조명 프리셋 팩",
    format: "glb",
    modularSnap1m: true,
    manifoldClean: true,
    commercialBomCleared: true,
    autoRoyaltyPercent: 15,
  },
];

export function IpExchangeQuickPanel() {
  const [tab, setTab] = useState<"ip-deals" | "seller-3d">("ip-deals");

  return (
    <section
      aria-label="B2B IP 사업화 및 조립형 3D 셀러 리소스 Fit"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4 text-fg break-keep [overflow-wrap:break-word] sm:p-5"
    >
      <header className="flex flex-col gap-3 border-b border-line pb-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold leading-[1.3] tracking-[-0.015em] text-fg">
            B2B IP 사업화 · 조립형 3D 셀러 Fit 보드
          </h2>
          <p className="mt-1 text-xs leading-[1.6] tracking-[-0.01em] text-fg-2">
            상업 Rights BOM이 검증된 원천 IP 2차 판권 패키지와 1m 조립형 3D 배경 리소스를 한눈에 검토합니다.
          </p>
        </div>
        <div role="tablist" aria-label="마켓 확장 보기" className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "ip-deals"}
            onClick={() => setTab("ip-deals")}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium leading-[1.35] transition-colors duration-150 ${
              tab === "ip-deals"
                ? "bg-accent-soft text-accent"
                : "bg-card text-fg-2 hover:bg-raised hover:text-fg"
            }`}
          >
            <Briefcase className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span>B2B IP 판권 보드</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "seller-3d"}
            onClick={() => setTab("seller-3d")}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium leading-[1.35] transition-colors duration-150 ${
              tab === "seller-3d"
                ? "bg-accent-soft text-accent"
                : "bg-card text-fg-2 hover:bg-raised hover:text-fg"
            }`}
          >
            <Box className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span>조립형 3D 셀러 Fit</span>
          </button>
        </div>
      </header>

      {tab === "ip-deals" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3" role="tabpanel" aria-label="B2B IP 판권 보드">
          {SAMPLE_IP_DEALS.map((deal) => {
            const assessment = evaluateB2bIpDealReadiness(deal);
            return (
              <article key={deal.id} className="flex flex-col justify-between gap-3 rounded-xl bg-card p-4 text-xs">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-accent">
                      {IP_DEAL_MEDIUM_LABELS[deal.medium]}
                    </span>
                    <span className="font-mono tabular-nums text-fg-2">
                      {assessment.readinessScore}점
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-sm font-semibold leading-[1.35] tracking-[-0.01em] text-fg">
                    {deal.title}
                  </h3>
                  <p className="mt-0.5 leading-[1.55] text-fg-2">
                    {deal.genre} · {deal.episodesReady}화 확보
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 border-t border-line/60 pt-2.5">
                  <p className="inline-flex items-center gap-1 font-medium">
                    {assessment.status === "deal-ready" ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-good" strokeWidth={1.5} aria-hidden="true" />
                    ) : (
                      <ShieldAlert className="size-3.5 shrink-0 text-warn" strokeWidth={1.5} aria-hidden="true" />
                    )}
                    <span className={assessment.status === "deal-ready" ? "text-good" : "text-warn"}>
                      {assessment.statusLabelKo}
                    </span>
                  </p>
                  <p className="tabular-nums leading-[1.5] text-fg-2">
                    희망 MG {(deal.targetMgKrw / 10_000).toLocaleString("ko-KR")}만원 · 로열티{" "}
                    {deal.creatorRoyaltyPercent}%
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" role="tabpanel" aria-label="조립형 3D 셀러 Fit">
          {SAMPLE_3D_SELLER_SETS.map((asset) => {
            const fit = evaluate3dSellerAssetFit(asset);
            return (
              <article key={asset.assetId} className="flex flex-col gap-2 rounded-xl bg-card p-4 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-[1.35] tracking-[-0.01em] text-fg">
                    {asset.title}
                  </h3>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums ${
                      fit.tone === "good"
                        ? "bg-good/15 text-good"
                        : fit.tone === "warn"
                          ? "bg-warn/15 text-warn"
                          : "bg-bad/15 text-bad"
                    }`}
                  >
                    {fit.badgeLabelKo}
                  </span>
                </div>
                <p className="tabular-nums leading-[1.5] text-fg-2">
                  포맷 {asset.format.toUpperCase()} · 리믹스 자동 로열티 {asset.autoRoyaltyPercent}%
                </p>
                <ul className="space-y-1 border-t border-line/60 pt-2 leading-[1.6] text-fg-2">
                  {fit.notesKo.map((note) => (
                    <li key={note}>· {note}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      )}

      <footer className="flex flex-col gap-2.5 border-t border-line pt-3 text-xs leading-[1.6] tracking-[-0.01em] text-fg-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span>계약·결제는 자동 실행되지 않으며 권리 BOM 확인 후 별도 협의로 진행됩니다.</span>
        <Link
          to="/studio/growth-ip#rights"
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-lg bg-raised px-3.5 font-medium text-fg transition-colors duration-150 hover:bg-accent-soft hover:text-accent sm:w-auto"
        >
          IP 확장 스튜디오에서 피치 바이블 만들기
        </Link>
      </footer>
    </section>
  );
}
