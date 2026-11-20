import { CheckCircle2, Crown, ShieldAlert } from "lucide-react";
import { useMemo } from "react";

import { evaluateWave1000AutonomousGate } from "./studio-wave1000-autonomous-engine";

import type { StudioWorkflowPack } from "../assistant/studio-workflow-pack";

import { cn } from "@/shared/lib/utils";

/**
 * Wave 1000 그랜드 밀레니엄 마스터 콕핏 카드.
 * 10개 센추리(1,000 웨이브) DAG 무결성과 자율 운영 게이트를 실시간 표시한다.
 */
export function StudioWave1000MillenniumCockpitCard({
  seriesTitle = "내 연재작",
  pack,
}: {
  readonly seriesTitle?: string;
  readonly pack: StudioWorkflowPack;
}) {
  const gate = useMemo(
    () =>
      evaluateWave1000AutonomousGate({
        seriesTitle,
        masterReceiptHash: `fnv1a-${pack.id.slice(0, 8)}`,
        webgpuFrameTimeMs: 8.3,
        federatedStudiosCount: 5,
        supportedLocalesCount: 30,
        realTimeRoyaltyLatencyMs: 850,
        zkArchivalYears: 100,
        creatorWeeklyHours: 40,
        activeRegionsCount: 3,
        autoReissuanceEnabled: true,
      }),
    [seriesTitle, pack.id],
  );

  return (
    <section
      data-testid="studio-wave1000-millennium-cockpit-card"
      aria-label="Wave 1000 밀레니엄 마스터 콕핏"
      className="flex flex-col gap-2 rounded-xl border border-accent/50 bg-card p-3 text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <Crown className="size-4 text-accent" aria-hidden />
          <span>Wave 1000 밀레니엄 자율 스튜디오 OS (10 Centuries · 1,000 Waves DAG)</span>
        </div>
        <span
          data-testid="wave1000-millennium-status-badge"
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[0.62rem] font-bold",
            gate.millenniumPassed ? "bg-good/10 text-good" : "bg-warn/10 text-warn",
          )}
        >
          {gate.millenniumPassed ? (
            <CheckCircle2 className="size-3" aria-hidden />
          ) : (
            <ShieldAlert className="size-3" aria-hidden />
          )}
          <span>
            {gate.millenniumPassed
              ? `Wave ${gate.totalWavesVerified}/1000 Millennium PASS`
              : `보류 ${gate.blockers.length}건`}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-1.5 font-mono text-[0.6rem] text-fg-3">
        <span>
          Centuries: {gate.millenniumProof.totalCenturies}/10 · DAG:{" "}
          {gate.millenniumProof.dagAcyclic ? "ACYCLIC" : "CYCLE"}
        </span>
        <span>Millennium Root: {gate.millenniumProof.wave1000MillenniumRootHash}</span>
      </div>
    </section>
  );
}
