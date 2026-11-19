import { CheckCircle2, Copy, ShieldAlert, ShieldCheck, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../studio-panel-ui";
import { copyStudioText } from "../studio-workbench-clipboard";

import { formatCreatorAdvanceUnderwritingMarkdown } from "./studio-creator-advance-underwriting";
import { formatEscrowSettlementCsv } from "./studio-episode-escrow-settlement";
import { runSeriesCommercialPipeline } from "./studio-rights-monetization-pipeline";

import type { StudioWorkflowPack } from "../assistant/studio-workflow-pack";
import type { SpectrumLicenseTier, SpectrumRevenueParticipant } from "./studio-spectrum-license-offer";

import { cn } from "@/shared/lib/utils";

const DEFAULT_PARTICIPANTS: readonly SpectrumRevenueParticipant[] = [
  { role: "story", displayName: "원작자", sharePercent: 50 },
  { role: "art", displayName: "작화가", sharePercent: 35 },
  { role: "bg3d-assistant", displayName: "3D·배경 어시스턴트", sharePercent: 15 },
];

const SAMPLE_LUMA_9X8 = new Uint8Array(72).map((_, idx) => (idx * 17) % 256);

const TIER_OPTIONS: readonly { readonly id: SpectrumLicenseTier; readonly label: string }[] = [
  { id: "episode-serialization-only", label: "연재 납품 (AI 학습 금지)" },
  { id: "secondary-ip-adaptation", label: "2차 판권 패키지" },
  { id: "verified-ai-optin-royalty", label: "AI Opt-In 로열티" },
];

export function StudioCommercialSettlementWidget({
  seriesTitle = "내 연재작",
  pack,
  defaultEpisodeFeeKrw = 2_000_000,
}: {
  readonly seriesTitle?: string;
  readonly pack: StudioWorkflowPack;
  readonly defaultEpisodeFeeKrw?: number;
}) {
  const [tier, setTier] = useState<SpectrumLicenseTier>("episode-serialization-only");
  const [episodeFeeKrw, setEpisodeFeeKrw] = useState<number>(defaultEpisodeFeeKrw);
  const [copiedKind, setCopiedKind] = useState<"csv" | "underwriting" | null>(null);

  const pipeline = useMemo(
    () =>
      runSeriesCommercialPipeline({
        seriesTitle,
        rightsHolder: pack.teamPolicyLock?.teamLabel ?? "ToonStudio Creator",
        tier,
        participants: DEFAULT_PARTICIPANTS,
        episodes: [
          {
            episodeLabel: "1화",
            pack,
            cuts: [{ cutId: "ep01-cut01", luma9x8: SAMPLE_LUMA_9X8 }],
            baseLicenseFeeKrw: episodeFeeKrw,
          },
          {
            episodeLabel: "2화",
            pack,
            cuts: [{ cutId: "ep02-cut01", luma9x8: SAMPLE_LUMA_9X8 }],
            baseLicenseFeeKrw: episodeFeeKrw,
          },
          {
            episodeLabel: "3화",
            pack,
            cuts: [{ cutId: "ep03-cut01", luma9x8: SAMPLE_LUMA_9X8 }],
            baseLicenseFeeKrw: episodeFeeKrw,
          },
        ],
        platformFeeBps: 500,
      }),
    [seriesTitle, pack, tier, episodeFeeKrw],
  );

  const firstSettlement = pipeline.settlements[0];
  const underwriting = pipeline.advanceUnderwriting;
  const mg = pipeline.mgReadiness;

  async function handleCopy(kind: "csv" | "underwriting") {
    const text =
      kind === "csv"
        ? formatEscrowSettlementCsv(firstSettlement)
        : formatCreatorAdvanceUnderwritingMarkdown(underwriting);
    const ok = await copyStudioText(text);
    if (ok) {
      setCopiedKind(kind);
    }
  }

  return (
    <section
      data-testid="studio-commercial-settlement-widget"
      aria-label="상업 정산 및 선정산 심사 미리보기"
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <Wallet className="size-4 text-accent" aria-hidden />
          <span>상업 납품 · 1원 정산 · MG 선정산 시뮬레이터</span>
        </div>
        <span
          data-testid="commercial-underwriting-badge"
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[0.62rem] font-bold",
            underwriting.decision === "approved"
              ? "bg-good/10 text-good"
              : "bg-warn/10 text-warn",
          )}
        >
          {underwriting.decision === "approved" ? (
            <ShieldCheck className="size-3" aria-hidden />
          ) : (
            <ShieldAlert className="size-3" aria-hidden />
          )}
          <span>
            {underwriting.decision === "approved"
              ? `선정산 승인 가능 · ${mg.reliabilityTier}`
              : `심사 보류 · ${mg.reliabilityTier}`}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-fg-2">
          <span>계약 티어</span>
          <select
            aria-label="라이선스 티어 선택"
            value={tier}
            onChange={(event) => {
              setTier(event.target.value as SpectrumLicenseTier);
              setCopiedKind(null);
            }}
            className={cn(
              "min-h-9 rounded-lg border border-line bg-raised px-2 text-xs text-fg",
              STUDIO_FOCUS_RING,
            )}
          >
            {TIER_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-fg-2">
          <span>회당 계약금(원)</span>
          <input
            type="number"
            min={0}
            step={100_000}
            aria-label="회당 계약금 입력"
            value={episodeFeeKrw}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              setEpisodeFeeKrw(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
              setCopiedKind(null);
            }}
            className={cn(
              "min-h-9 w-32 rounded-lg border border-line bg-raised px-2 font-mono text-xs text-fg",
              STUDIO_FOCUS_RING,
            )}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-raised/60 p-2.5">
          <div className="text-[0.62rem] font-semibold text-fg-3">1화 순 창작자 정산액</div>
          <div data-testid="settlement-net-krw" className="mt-0.5 font-mono text-sm font-bold text-fg">
            {firstSettlement.netDistributableKrw.toLocaleString("ko-KR")}원
          </div>
          <div className="text-[0.6rem] text-fg-3">
            상태: {firstSettlement.status === "ready-for-release" ? "정산 통과" : "보류됨"}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-raised/60 p-2.5">
          <div className="text-[0.62rem] font-semibold text-fg-3">승인 가능 선정산 한도 (3화 기준)</div>
          <div data-testid="underwriting-limit-krw" className="mt-0.5 font-mono text-sm font-bold text-accent">
            {underwriting.approvedAdvanceLimitKrw.toLocaleString("ko-KR")}원
          </div>
          <div className="text-[0.6rem] text-fg-3">
            권장 상환 {underwriting.recommendedRecoupmentRatePercent}% · 예상 {underwriting.estimatedRecoupmentEpisodes}화
          </div>
        </div>

        <div className="rounded-lg border border-line bg-raised/60 p-2.5">
          <div className="text-[0.62rem] font-semibold text-fg-3">저작권·AI 보호 체인</div>
          <div className="mt-0.5 flex items-center gap-1 text-xs font-bold text-good">
            <CheckCircle2 className="size-3.5" aria-hidden />
            <span>TDM Opt-Out · {pipeline.seriesDossier.commercialReadinessPercent}%</span>
          </div>
          <div className="truncate font-mono text-[0.58rem] text-fg-3">
            {underwriting.underwritingIntegrityHash}
          </div>
        </div>
      </div>

      {firstSettlement.holdReason ? (
        <p
          role="alert"
          data-testid="settlement-hold-reason"
          className="rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-[0.65rem] font-semibold text-warn"
        >
          {firstSettlement.holdReason}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2">
        <button
          type="button"
          onClick={() => {
            void handleCopy("csv");
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border border-line bg-raised px-2.5 text-[0.65rem] font-bold text-fg hover:bg-card",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            STUDIO_TOUCH_TARGET,
          )}
        >
          <Copy className="size-3" aria-hidden />
          <span>{copiedKind === "csv" ? "정산 CSV 복사됨" : "정산 CSV 복사"}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            void handleCopy("underwriting");
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border border-transparent bg-accent px-2.5 text-[0.65rem] font-bold text-on-accent hover:opacity-90",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            STUDIO_TOUCH_TARGET,
          )}
        >
          <Copy className="size-3" aria-hidden />
          <span>{copiedKind === "underwriting" ? "심사서 복사됨" : "MG·선정산 심사서 복사"}</span>
        </button>
      </div>
    </section>
  );
}
