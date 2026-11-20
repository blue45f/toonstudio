import type { AgencyBatchQuoteReport } from "./studio-agency-submission-preview";

export type IpSlateFundDecision = "investable" | "watchlist" | "rejected";

export interface IpSlateTitleAllocation {
  readonly submissionId: string;
  readonly seriesTitle: string;
  readonly approvedAdvanceLimitKrw: number;
  readonly allocatedCapitalKrw: number;
  readonly portfolioWeightPercent: number;
  readonly underwritingHash: string;
}

export interface IpSlateFundDdReport {
  readonly ddSchemaVersion: 1;
  readonly fundName: string;
  readonly evaluatedAtIso: string;
  readonly decision: IpSlateFundDecision;
  readonly riskFlags: readonly string[];
  readonly totalTitlesReviewed: number;
  readonly eligibleTitleCount: number;
  readonly slateCleanRatioPercent: number;
  readonly targetSlateBudgetKrw: number;
  readonly totalAllocatedCapitalKrw: number;
  readonly budgetUtilizationPercent: number;
  readonly allocations: readonly IpSlateTitleAllocation[];
  readonly portfolioQuoteHash: string;
  readonly ddPackageHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 에이전시 일괄 심사 리포트(`AgencyBatchQuoteReport`)를 바탕으로
 * 웹툰 IP 제작 조합·콘텐츠 펀드의 슬레이트 투자 실사(DD) 및 분산 자본 배분안을 산출한다.
 */
export function buildIpSlateFundDdReport(params: {
  readonly fundName: string;
  readonly batchReport: AgencyBatchQuoteReport;
  readonly targetSlateBudgetKrw: number;
  readonly minCleanRatioPercent?: number;
  readonly maxSingleTitleConcentrationPercent?: number;
  readonly evaluatedAtIso?: string;
}): IpSlateFundDdReport {
  const { fundName, batchReport } = params;
  const targetSlateBudgetKrw = Math.max(0, Math.round(params.targetSlateBudgetKrw));
  const minCleanRatioPercent = params.minCleanRatioPercent ?? 60;
  const maxSingleTitleConcentrationPercent = params.maxSingleTitleConcentrationPercent ?? 50;
  const evaluatedAtIso = params.evaluatedAtIso ?? new Date().toISOString();

  const totalTitlesReviewed = batchReport.totalSubmissions;
  const eligibleItems = batchReport.items.filter(
    (item) =>
      (item.triageStatus === "fast-track-approved" || item.triageStatus === "conditional-review") &&
      item.approvedAdvanceLimitKrw > 0,
  );
  const slateCleanRatioPercent =
    totalTitlesReviewed > 0 ? Math.round((eligibleItems.length / totalTitlesReviewed) * 100) : 0;

  const riskFlags: string[] = [];
  if (totalTitlesReviewed === 0) {
    riskFlags.push("심사 대상 작품이 0편입니다.");
  }
  if (slateCleanRatioPercent < minCleanRatioPercent) {
    riskFlags.push(
      `슬레이트 상업 클린 통과율(${slateCleanRatioPercent}%)이 최소 기준(${minCleanRatioPercent}%) 미만입니다.`,
    );
  }
  if (batchReport.rightsBlockedCount > 0) {
    riskFlags.push(
      `저작권 보류 작품 ${batchReport.rightsBlockedCount}편은 투자 배분에서 자동 제외되었습니다.`,
    );
  }

  const maxPerTitleKrw = Math.floor(
    (targetSlateBudgetKrw * maxSingleTitleConcentrationPercent) / 100,
  );

  const orderedEligible = [...eligibleItems].sort((a, b) => {
    if (a.triageStatus !== b.triageStatus) {
      return a.triageStatus === "fast-track-approved" ? -1 : 1;
    }
    return b.approvedAdvanceLimitKrw - a.approvedAdvanceLimitKrw;
  });

  let remainingBudget = targetSlateBudgetKrw;
  const rawAllocations: {
    readonly item: (typeof orderedEligible)[number];
    readonly allocatedCapitalKrw: number;
  }[] = [];

  for (const item of orderedEligible) {
    const cap = Math.min(item.approvedAdvanceLimitKrw, maxPerTitleKrw, remainingBudget);
    const allocatedCapitalKrw = Math.max(0, Math.floor(cap));
    remainingBudget -= allocatedCapitalKrw;
    rawAllocations.push({ item, allocatedCapitalKrw });
  }

  const totalAllocatedCapitalKrw = rawAllocations.reduce((s, x) => s + x.allocatedCapitalKrw, 0);
  const budgetUtilizationPercent =
    targetSlateBudgetKrw > 0
      ? Math.round((totalAllocatedCapitalKrw / targetSlateBudgetKrw) * 100)
      : 0;

  const allocations: IpSlateTitleAllocation[] = rawAllocations.map(
    ({ item, allocatedCapitalKrw }) => ({
      submissionId: item.submissionId,
      seriesTitle: item.seriesTitle,
      approvedAdvanceLimitKrw: item.approvedAdvanceLimitKrw,
      allocatedCapitalKrw,
      portfolioWeightPercent:
        totalAllocatedCapitalKrw > 0
          ? Math.round((allocatedCapitalKrw / totalAllocatedCapitalKrw) * 100)
          : 0,
      underwritingHash: item.underwritingHash,
    }),
  );

  let decision: IpSlateFundDecision;
  if (eligibleItems.length === 0 || totalAllocatedCapitalKrw === 0) {
    decision = "rejected";
  } else if (slateCleanRatioPercent >= minCleanRatioPercent && batchReport.fastTrackCount > 0) {
    decision = "investable";
  } else {
    decision = "watchlist";
  }

  const ddPackageHash = fnv1aHex(
    JSON.stringify({
      fundName,
      decision,
      totalAllocatedCapitalKrw,
      portfolioQuoteHash: batchReport.portfolioQuoteHash,
      allocations: allocations.map((a) => ({
        submissionId: a.submissionId,
        allocatedCapitalKrw: a.allocatedCapitalKrw,
        underwritingHash: a.underwritingHash,
      })),
    }),
  );

  return {
    ddSchemaVersion: 1,
    fundName,
    evaluatedAtIso,
    decision,
    riskFlags,
    totalTitlesReviewed,
    eligibleTitleCount: eligibleItems.length,
    slateCleanRatioPercent,
    targetSlateBudgetKrw,
    totalAllocatedCapitalKrw,
    budgetUtilizationPercent,
    allocations,
    portfolioQuoteHash: batchReport.portfolioQuoteHash,
    ddPackageHash,
  };
}

/**
 * VC·IP 제작 조합 투자심의위원회(IC) 제출용 Markdown DD 메모를 생성한다.
 */
export function formatIpSlateFundDdMarkdown(report: IpSlateFundDdReport): string {
  const rows = report.allocations.map(
    (a) =>
      `| ${a.submissionId} | ${a.seriesTitle} | ${a.approvedAdvanceLimitKrw.toLocaleString("ko-KR")}원 | ${a.allocatedCapitalKrw.toLocaleString("ko-KR")}원 | ${a.portfolioWeightPercent}% | \`${a.underwritingHash}\` |`,
  );

  const lines = [
    `# IP 슬레이트 펀드 투자 실사(DD) 보고서 — ${report.fundName}`,
    `- 실사 시각: ${report.evaluatedAtIso}`,
    `- 투자 판정: \`${report.decision.toUpperCase()}\` (상업 클린율 ${report.slateCleanRatioPercent}% · 적격 ${report.eligibleTitleCount}/${report.totalTitlesReviewed}편)`,
    `- 총 배정 자본: ${report.totalAllocatedCapitalKrw.toLocaleString("ko-KR")}원 / 목표 예산 ${report.targetSlateBudgetKrw.toLocaleString("ko-KR")}원 (소진율 ${report.budgetUtilizationPercent}%)`,
    `- 해시 체인: Portfolio \`${report.portfolioQuoteHash}\` · DD \`${report.ddPackageHash}\``,
    "",
    "## 작품별 분산 투자 배분표",
    "| 접수 ID | 작품명 | 승인 한도 | 배정 자본 | 비중 | 심사 해시 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
  ];

  if (report.riskFlags.length > 0) {
    lines.push("", "## 리스크 플래그", ...report.riskFlags.map((flag) => `- ${flag}`));
  }

  return lines.join("\n");
}
