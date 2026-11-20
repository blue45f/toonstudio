import { CheckCircle2, FileWarning, RefreshCw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../studio-panel-ui";

import type { StudioWorkflowPack } from "../assistant/studio-workflow-pack";

import { buildReaderTrustSeal } from "@/shared/lib/reader-trust-seal";
import {
  executePortfolioBatchReissuance,
  scanPortfolioRevocationImpact,
  type PortfolioSealRecord,
} from "@/shared/lib/reader-trust-seal-batch-reissuance";
import { buildSealRevocationLedger } from "@/shared/lib/reader-trust-seal-revocation";
import { cn } from "@/shared/lib/utils";

/**
 * Wave 30: 레이블·스튜디오 포트폴리오 전체 연재작의 철회 영향을 스캔하고
 * 1클릭으로 일괄 배치 재발급을 실행하는 거버넌스 UI 카드.
 */
export function StudioPortfolioBatchReissuanceCard({
  seriesTitle = "내 연재작",
  pack,
}: {
  readonly seriesTitle?: string;
  readonly pack: StudioWorkflowPack;
}) {
  const [batchExecuted, setBatchExecuted] = useState(false);

  const { impact, batchResult } = useMemo(() => {
    const ts = "2026-11-20T00:00:00.000Z";
    const seals: PortfolioSealRecord[] = [1, 2, 3].map((ep) => ({
      episodeKey: `${pack.id}-ep0${ep}`,
      seal: buildReaderTrustSeal({
        seriesTitle: `${seriesTitle} ${ep}화`,
        verifiedStagesCount: 10,
        totalStagesCount: 10,
        commercialAssetsCleared: true,
        aiTrainingOptOut: true,
        voiceConsentVerified: true,
        globalLocalesCount: 2,
        masterAuditHash: `fnv1a-3000000${ep}`,
        issuedAtIso: ts,
      }),
    }));

    const ledger = buildSealRevocationLedger({
      entries: [
        {
          revocationId: "REV-PORTFOLIO-01",
          sealDigestHash: seals[0].seal.sealDigestHash,
          reasonCode: "font-license-expired",
          reasonDetail: "공유 타이틀 폰트 만료",
          revokedAtIso: "2026-11-21T00:00:00.000Z",
        },
        {
          revocationId: "REV-PORTFOLIO-02",
          sealDigestHash: seals[1].seal.sealDigestHash,
          reasonCode: "font-license-expired",
          reasonDetail: "공유 타이틀 폰트 만료",
          revokedAtIso: "2026-11-21T00:00:00.000Z",
        },
      ],
      updatedAtIso: "2026-11-21T00:00:00.000Z",
    });

    const impactReport = scanPortfolioRevocationImpact({
      records: seals,
      ledger,
      asOfIso: "2026-11-22T00:00:00.000Z",
    });

    const batch = executePortfolioBatchReissuance({
      records: seals,
      ledger,
      asOfIso: "2026-11-22T00:00:00.000Z",
      remediationProofsByReason: {
        "font-license-expired": {
          resolvedReasonCode: "font-license-expired",
          replacementAssetLabel: "Pretendard Commercial (OFL)",
          evidenceReferenceId: "LIC-OFL-PORTFOLIO-30",
          verifiedBy: "ToonStudio Portfolio Ops",
        },
      },
    });

    return { impact: impactReport, batchResult: batch };
  }, [seriesTitle, pack.id]);

  return (
    <section
      data-testid="studio-portfolio-batch-reissuance-card"
      aria-label="포트폴리오 일괄 철회 영향 스캔 및 배치 재발급"
      className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <ShieldCheck className="size-4 text-accent" aria-hidden />
          <span>레이블 포트폴리오 일괄 철회 스캔 & 배치 재발급 (Wave 30)</span>
        </div>
        <span
          data-testid="portfolio-batch-status-badge"
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[0.62rem] font-bold",
            batchExecuted ? "bg-good/10 text-good" : "bg-warn/10 text-warn",
          )}
        >
          {batchExecuted ? (
            <CheckCircle2 className="size-3" aria-hidden />
          ) : (
            <FileWarning className="size-3" aria-hidden />
          )}
          <span>
            {batchExecuted
              ? `일괄 복구 완료 (${batchResult.reissuedCount}/${batchResult.totalCount}화 재발급)`
              : `철회 감지 ${impact.revokedCount}/${impact.totalCount}화 · 유지 ${impact.activeCount}화`}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2">
        <span className="font-mono text-[0.6rem] text-fg-3">
          Batch Hash: {batchResult.batchReissuanceDigestHash}
        </span>
        <button
          type="button"
          data-testid="portfolio-batch-reissue-btn"
          onClick={() => setBatchExecuted(true)}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border border-accent bg-accent px-2.5 text-[0.64rem] font-bold text-on-accent hover:opacity-90",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            STUDIO_TOUCH_TARGET,
          )}
        >
          <RefreshCw className="size-3" aria-hidden />
          <span>{batchExecuted ? "배치 재발급 완료됨" : "영향 회차 일괄 재발급 실행"}</span>
        </button>
      </div>
    </section>
  );
}
