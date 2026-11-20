import { runSeriesCommercialPipeline } from "./studio-rights-monetization-pipeline";

import type { StudioWorkflowPack } from "../assistant/studio-workflow-pack";
import type { SpectrumLicenseTier, SpectrumRevenueParticipant } from "./studio-spectrum-license-offer";

export type AgencyTriageStatus = "fast-track-approved" | "conditional-review" | "rights-blocked";

export interface AgencySubmissionInput {
  readonly submissionId: string;
  readonly seriesTitle: string;
  readonly rightsHolder?: string;
  readonly pack: StudioWorkflowPack;
  readonly episodeCount: number;
  readonly proposedEpisodeFeeKrw: number;
  readonly tier: SpectrumLicenseTier;
  readonly participants: readonly SpectrumRevenueParticipant[];
  readonly platformFeeBps?: number;
}

export interface AgencySubmissionQuoteItem {
  readonly submissionId: string;
  readonly seriesTitle: string;
  readonly triageStatus: AgencyTriageStatus;
  readonly commercialReadinessPercent: number;
  readonly projectedSeasonGrossKrw: number;
  readonly approvedAdvanceLimitKrw: number;
  readonly underwritingHash: string;
  readonly blockerSummary: string | null;
}

export interface AgencyBatchQuoteReport {
  readonly reportSchemaVersion: 1;
  readonly evaluatedAtIso: string;
  readonly totalSubmissions: number;
  readonly fastTrackCount: number;
  readonly conditionalCount: number;
  readonly rightsBlockedCount: number;
  readonly totalProjectedSeasonGrossKrw: number;
  readonly totalApprovedAdvancePoolKrw: number;
  readonly items: readonly AgencySubmissionQuoteItem[];
  readonly portfolioQuoteHash: string;
}

const SAMPLE_LUMA_9X8 = new Uint8Array(72).map((_, idx) => (idx * 19) % 256);

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 에이전시·플랫폼 투고 포털에 접수된 다수 작품의 워크플로우 팩을 일괄 심사해
 * 상업 클린 여부·예상 시즌 매출·선정산 한도 풀(Pool)을 결정적으로 산출한다.
 */
export function evaluateAgencySubmissionBatch(
  submissions: readonly AgencySubmissionInput[],
  evaluatedAtIso = new Date().toISOString(),
): AgencyBatchQuoteReport {
  const items: AgencySubmissionQuoteItem[] = submissions.map((sub) => {
    const count = Math.max(1, Math.floor(sub.episodeCount));
    const episodes = Array.from({ length: count }, (_, idx) => ({
      episodeLabel: `${idx + 1}화`,
      pack: sub.pack,
      cuts: [{ cutId: `${sub.submissionId}-ep${idx + 1}-c01`, luma9x8: SAMPLE_LUMA_9X8 }],
      baseLicenseFeeKrw: sub.proposedEpisodeFeeKrw,
    }));

    const output = runSeriesCommercialPipeline({
      seriesTitle: sub.seriesTitle,
      rightsHolder: sub.rightsHolder,
      tier: sub.tier,
      participants: sub.participants,
      episodes,
      platformFeeBps: sub.platformFeeBps ?? 500,
      timestampIso: evaluatedAtIso,
    });

    let triageStatus: AgencyTriageStatus;
    if (output.advanceUnderwriting.decision === "approved") {
      triageStatus = "fast-track-approved";
    } else if (output.advanceUnderwriting.decision === "conditional") {
      triageStatus = "conditional-review";
    } else {
      triageStatus = "rights-blocked";
    }

    const blockerSummary =
      output.advanceUnderwriting.declineReasons.length > 0
        ? output.advanceUnderwriting.declineReasons.join(" / ")
        : null;

    return {
      submissionId: sub.submissionId,
      seriesTitle: sub.seriesTitle,
      triageStatus,
      commercialReadinessPercent: output.seriesDossier.commercialReadinessPercent,
      projectedSeasonGrossKrw: Math.max(0, Math.round(sub.proposedEpisodeFeeKrw)) * count,
      approvedAdvanceLimitKrw: output.advanceUnderwriting.approvedAdvanceLimitKrw,
      underwritingHash: output.advanceUnderwriting.underwritingIntegrityHash,
      blockerSummary,
    };
  });

  const fastTrackCount = items.filter((i) => i.triageStatus === "fast-track-approved").length;
  const conditionalCount = items.filter((i) => i.triageStatus === "conditional-review").length;
  const rightsBlockedCount = items.filter((i) => i.triageStatus === "rights-blocked").length;
  const totalProjectedSeasonGrossKrw = items.reduce((s, i) => s + i.projectedSeasonGrossKrw, 0);
  const totalApprovedAdvancePoolKrw = items.reduce((s, i) => s + i.approvedAdvanceLimitKrw, 0);

  const portfolioQuoteHash = fnv1aHex(
    JSON.stringify({
      totalSubmissions: items.length,
      totalApprovedAdvancePoolKrw,
      hashes: items.map((i) => i.underwritingHash),
    }),
  );

  return {
    reportSchemaVersion: 1,
    evaluatedAtIso,
    totalSubmissions: items.length,
    fastTrackCount,
    conditionalCount,
    rightsBlockedCount,
    totalProjectedSeasonGrossKrw,
    totalApprovedAdvancePoolKrw,
    items,
    portfolioQuoteHash,
  };
}

/**
 * 에이전시 PD·계약 담당자용 일괄 투고 심사표 Markdown을 생성한다.
 */
export function formatAgencyBatchQuoteMarkdown(report: AgencyBatchQuoteReport): string {
  const rows = report.items.map(
    (item) =>
      `| ${item.submissionId} | ${item.seriesTitle} | ${item.triageStatus} | ${item.commercialReadinessPercent}% | ${item.approvedAdvanceLimitKrw.toLocaleString("ko-KR")}원 | \`${item.underwritingHash}\` |`,
  );

  return [
    `# 에이전시 투고작 일괄 상업·선정산 심사 리포트`,
    `- 심사 시각: ${report.evaluatedAtIso}`,
    `- 총 접수: ${report.totalSubmissions}작 (패스트트랙 ${report.fastTrackCount} / 조건부 ${report.conditionalCount} / 저작권 보류 ${report.rightsBlockedCount})`,
    `- 총 승인 가능 선정산 풀: ${report.totalApprovedAdvancePoolKrw.toLocaleString("ko-KR")}원`,
    `- 포트폴리오 해시: \`${report.portfolioQuoteHash}\``,
    "",
    "| 접수 ID | 작품명 | 심사 분류 | 상업 클린율 | 승인 한도 | 심사 해시 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}
