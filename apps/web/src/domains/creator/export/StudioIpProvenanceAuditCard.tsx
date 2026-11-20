import { CheckCircle2, Copy, Link2Off, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../studio-panel-ui";
import { copyStudioText } from "../studio-workbench-clipboard";

import { evaluateAgencySubmissionBatch } from "./studio-agency-submission-preview";
import { verifySeriesIpProvenanceChain } from "./studio-ip-provenance-chain-verifier";
import { buildIpSlateFundDdReport } from "./studio-ip-slate-fund-dd";
import { runSeriesCommercialPipeline } from "./studio-rights-monetization-pipeline";

import type { StudioWorkflowPack } from "../assistant/studio-workflow-pack";

import { cn } from "@/shared/lib/utils";

const SAMPLE_LUMA_9X8 = new Uint8Array(72).map((_, idx) => (idx * 19) % 256);
const FIXED_PARTICIPANTS = [
  { role: "story" as const, displayName: "원작자", sharePercent: 50 },
  { role: "art" as const, displayName: "작화가", sharePercent: 35 },
  { role: "bg3d-assistant" as const, displayName: "3D·배경 어시스턴트", sharePercent: 15 },
];

export function StudioIpProvenanceAuditCard({
  seriesTitle = "내 연재작",
  pack,
  episodeFeeKrw = 2_000_000,
}: {
  readonly seriesTitle?: string;
  readonly pack: StudioWorkflowPack;
  readonly episodeFeeKrw?: number;
}) {
  const [copied, setCopied] = useState(false);

  const audit = useMemo(() => {
    const ts = "2026-11-20T00:00:00.000Z";
    const subId = `SUB-${pack.id}`;
    const pipeline = runSeriesCommercialPipeline({
      seriesTitle,
      rightsHolder: pack.teamPolicyLock?.teamLabel ?? "ToonStudio Creator",
      tier: "episode-serialization-only",
      participants: FIXED_PARTICIPANTS,
      episodes: [1, 2, 3].map((ep) => ({
        episodeLabel: `${ep}화`,
        pack,
        cuts: [{ cutId: `${subId}-ep${ep}-c01`, luma9x8: SAMPLE_LUMA_9X8 }],
        baseLicenseFeeKrw: episodeFeeKrw,
      })),
      platformFeeBps: 500,
      timestampIso: ts,
    });

    const batch = evaluateAgencySubmissionBatch(
      [
        {
          submissionId: subId,
          seriesTitle,
          rightsHolder: pack.teamPolicyLock?.teamLabel ?? "ToonStudio Creator",
          pack,
          episodeCount: 3,
          proposedEpisodeFeeKrw: episodeFeeKrw,
          tier: "episode-serialization-only",
          participants: FIXED_PARTICIPANTS,
          platformFeeBps: 500,
        },
      ],
      ts,
    );

    const dd = buildIpSlateFundDdReport({
      fundName: "ToonStudio IP Slate",
      batchReport: batch,
      targetSlateBudgetKrw: 10_000_000,
      evaluatedAtIso: ts,
    });

    return verifySeriesIpProvenanceChain(pipeline, dd);
  }, [seriesTitle, pack, episodeFeeKrw]);

  async function handleCopyAuditJson() {
    const ok = await copyStudioText(JSON.stringify(audit, null, 2));
    if (ok) {
      setCopied(true);
    }
  }

  return (
    <section
      data-testid="studio-ip-provenance-audit-card"
      aria-label="8단계 IP 프로비넌스 해시 체인 감사"
      className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3 text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <ShieldCheck className="size-4 text-accent" aria-hidden />
          <span>8단계 IP 프로비넌스 해시 체인 감사</span>
        </div>
        <span
          data-testid="provenance-chain-status-badge"
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[0.62rem] font-bold",
            audit.allStagesVerified ? "bg-good/10 text-good" : "bg-warn/10 text-warn",
          )}
        >
          {audit.allStagesVerified ? (
            <CheckCircle2 className="size-3" aria-hidden />
          ) : (
            <Link2Off className="size-3" aria-hidden />
          )}
          <span>
            {audit.allStagesVerified
              ? `${audit.stages.length}/${audit.stages.length} 체인 검증 통과`
              : `끊긴 구간 ${audit.brokenStages.length}건`}
          </span>
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {audit.stages.map((stageItem) => (
          <li
            key={stageItem.stage}
            className="flex items-center justify-between gap-2 rounded-lg border border-line bg-raised/60 px-2.5 py-1.5 text-[0.62rem]"
          >
            <span className="font-semibold text-fg-2">{stageItem.stage}</span>
            <span
              className={cn(
                "font-mono font-bold",
                stageItem.valid ? "text-good" : "text-bad",
              )}
            >
              {stageItem.valid ? stageItem.hash : "BROKEN"}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2">
        <span className="font-mono text-[0.6rem] text-fg-3">
          Master Audit: {audit.masterChainAuditHash}
        </span>
        <button
          type="button"
          onClick={() => {
            void handleCopyAuditJson();
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border border-line bg-raised px-2.5 text-[0.64rem] font-bold text-fg hover:bg-card",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            STUDIO_TOUCH_TARGET,
          )}
        >
          <Copy className="size-3" aria-hidden />
          <span>{copied ? "감사 인증서 복사됨" : "8단계 감사 JSON 복사"}</span>
        </button>
      </div>
    </section>
  );
}
