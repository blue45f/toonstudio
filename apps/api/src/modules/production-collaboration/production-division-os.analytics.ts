import type { CutSliceRecord, RoyaltyLedgerRecord } from "./production-division-os.domain";
import {
  DIVISION_STAGE_CODES,
  type DivisionSettlementModel,
  type DivisionStageCode,
} from "./production-division-os.dto";

export type PipelineStageCellStatus =
  | "not_started"
  | "in_progress"
  | "retake"
  | "blocked"
  | "approved"
  | "stitched";

export interface PipelineStageCell {
  readonly stageCode: DivisionStageCode;
  readonly sliceCount: number;
  readonly totalCuts: number;
  readonly approvedCuts: number;
  readonly stitchedCuts: number;
  readonly retakeCount: number;
  readonly overdueSliceCount: number;
  readonly expiredLeaseCount: number;
  readonly completionRate: number;
  readonly status: PipelineStageCellStatus;
  readonly earliestDueAt: string | null;
  readonly assigneeUserIds: readonly string[];
}

export interface PipelineEpisodeRow {
  readonly episodeId: string;
  readonly weekSlot: string;
  readonly totalSlices: number;
  readonly totalCuts: number;
  readonly completedCuts: number;
  readonly completionRate: number;
  readonly overdueCount: number;
  readonly retakeCount: number;
  readonly stages: readonly PipelineStageCell[];
}

export interface PipelineStageBottleneck {
  readonly stageCode: DivisionStageCode;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly score: number;
  readonly openSlices: number;
  readonly overdueSlices: number;
  readonly retakeSlices: number;
  readonly expiredLeases: number;
  readonly affectedEpisodes: readonly string[];
  readonly recommendation: string;
}

export interface PipelineMatrixResult {
  readonly projectId: string;
  readonly generatedAt: string;
  readonly windowWeeks: number;
  readonly stages: readonly DivisionStageCode[];
  readonly episodes: readonly PipelineEpisodeRow[];
  readonly bottlenecks: readonly PipelineStageBottleneck[];
  readonly riskSummary: {
    readonly overallHealth: "healthy" | "watch" | "critical";
    readonly totalEpisodes: number;
    readonly totalSlices: number;
    readonly overdueSlices: number;
    readonly retakeSlices: number;
    readonly expiredLeases: number;
    readonly delayRippleRiskEpisodes: number;
    readonly activeLocksCount: number;
  };
}

function deriveCellStatus(
  slices: readonly CutSliceRecord[],
  overdueCount: number,
  retakeCount: number,
): PipelineStageCellStatus {
  if (slices.length === 0) return "not_started";
  if (slices.every((slice) => slice.status === "stitched")) return "stitched";
  if (slices.every((slice) => slice.status === "approved" || slice.status === "stitched")) {
    return "approved";
  }
  if (overdueCount > 0) return "blocked";
  if (retakeCount > 0) return "retake";
  return "in_progress";
}

export function buildPipelineMatrix(input: {
  readonly projectId: string;
  readonly slices: readonly CutSliceRecord[];
  readonly activeLocksCount: number;
  readonly weeks: number;
  readonly episodeIds?: readonly string[];
  readonly asOf: Date;
}): PipelineMatrixResult {
  const asOfMs = input.asOf.getTime();
  const distinctEpisodes =
    input.episodeIds && input.episodeIds.length > 0
      ? [...new Set(input.episodeIds)]
      : [...new Set(input.slices.map((slice) => slice.episodeId))].sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true }),
        );
  const windowedEpisodes = distinctEpisodes.slice(0, input.weeks);

  let totalOverdue = 0;
  let totalRetake = 0;
  let totalExpiredLeases = 0;
  let totalSlices = 0;
  let delayRippleRiskEpisodes = 0;

  const stageAggregates = new Map<
    DivisionStageCode,
    {
      openSlices: number;
      overdueSlices: number;
      retakeSlices: number;
      expiredLeases: number;
      episodes: Set<string>;
    }
  >();
  for (const stage of DIVISION_STAGE_CODES) {
    stageAggregates.set(stage, {
      openSlices: 0,
      overdueSlices: 0,
      retakeSlices: 0,
      expiredLeases: 0,
      episodes: new Set(),
    });
  }

  const episodes: PipelineEpisodeRow[] = windowedEpisodes.map((episodeId, epIndex) => {
    const episodeSlices = input.slices.filter((slice) => slice.episodeId === episodeId);
    let epTotalCuts = 0;
    let epCompletedCuts = 0;
    let epOverdue = 0;
    let epRetake = 0;

    const stages: PipelineStageCell[] = DIVISION_STAGE_CODES.map((stageCode) => {
      const stageSlices = episodeSlices.filter((slice) => slice.stageCode === stageCode);
      const totalCuts = stageSlices.reduce((sum, s) => sum + (s.cutEnd - s.cutStart + 1), 0);
      const approvedCuts = stageSlices
        .filter((s) => s.status === "approved" || s.status === "stitched")
        .reduce((sum, s) => sum + (s.cutEnd - s.cutStart + 1), 0);
      const stitchedCuts = stageSlices
        .filter((s) => s.status === "stitched")
        .reduce((sum, s) => sum + (s.cutEnd - s.cutStart + 1), 0);

      const openSlices = stageSlices.filter(
        (s) => s.status !== "approved" && s.status !== "stitched",
      );
      const retakeCount = stageSlices.filter((s) => s.status === "retake").length;
      const overdueSliceCount = openSlices.filter(
        (s) => s.dueAt !== null && Date.parse(s.dueAt) < asOfMs,
      ).length;
      const expiredLeaseCount = openSlices.filter(
        (s) => s.leaseExpiresAt !== null && Date.parse(s.leaseExpiresAt) < asOfMs,
      ).length;

      const agg = stageAggregates.get(stageCode)!;
      agg.openSlices += openSlices.length;
      agg.overdueSlices += overdueSliceCount;
      agg.retakeSlices += retakeCount;
      agg.expiredLeases += expiredLeaseCount;
      if (overdueSliceCount > 0 || retakeCount > 0 || expiredLeaseCount > 0) {
        agg.episodes.add(episodeId);
      }

      epTotalCuts += totalCuts;
      epCompletedCuts += approvedCuts;
      epOverdue += overdueSliceCount;
      epRetake += retakeCount;
      totalSlices += stageSlices.length;

      const dueDates = stageSlices
        .map((s) => s.dueAt)
        .filter((value): value is string => value !== null)
        .sort();
      const assignees = [
        ...new Set(
          stageSlices
            .map((s) => s.assigneeUserId)
            .filter((value): value is string => value !== null),
        ),
      ];

      return {
        stageCode,
        sliceCount: stageSlices.length,
        totalCuts,
        approvedCuts,
        stitchedCuts,
        retakeCount,
        overdueSliceCount,
        expiredLeaseCount,
        completionRate: totalCuts > 0 ? Number((approvedCuts / totalCuts).toFixed(4)) : 0,
        status: deriveCellStatus(stageSlices, overdueSliceCount, retakeCount),
        earliestDueAt: dueDates[0] ?? null,
        assigneeUserIds: assignees,
      };
    });

    totalOverdue += epOverdue;
    totalRetake += epRetake;
    totalExpiredLeases += stages.reduce((sum, cell) => sum + cell.expiredLeaseCount, 0);
    if (epOverdue > 0 || epRetake >= 2) delayRippleRiskEpisodes += 1;

    return {
      episodeId,
      weekSlot: `W+${epIndex}`,
      totalSlices: episodeSlices.length,
      totalCuts: epTotalCuts,
      completedCuts: epCompletedCuts,
      completionRate: epTotalCuts > 0 ? Number((epCompletedCuts / epTotalCuts).toFixed(4)) : 0,
      overdueCount: epOverdue,
      retakeCount: epRetake,
      stages,
    };
  });

  const bottlenecks: PipelineStageBottleneck[] = [];
  for (const [stageCode, agg] of stageAggregates.entries()) {
    const score =
      agg.overdueSlices * 4 + agg.retakeSlices * 3 + agg.expiredLeases * 2 + agg.openSlices;
    if (score === 0) continue;
    const severity: PipelineStageBottleneck["severity"] =
      agg.overdueSlices >= 2 || score >= 12
        ? "critical"
        : agg.overdueSlices >= 1 || agg.retakeSlices >= 2 || score >= 7
          ? "high"
          : agg.retakeSlices >= 1 || agg.expiredLeases >= 1
            ? "medium"
            : "low";
    const recommendation =
      agg.overdueSlices > 0
        ? `${stageCode} 공정 마감 지연(${agg.overdueSlices}건) 해소 위해 유휴 작업자 분할 투입 권장`
        : agg.retakeSlices > 0
          ? `${stageCode} 공정 리테이크(${agg.retakeSlices}건) 집중 발생 — AD 레드라인 피드백 우선 처리 필요`
          : agg.expiredLeases > 0
            ? `${stageCode} 공정 만료 리스(${agg.expiredLeases}건) 재배정 검토 필요`
            : `${stageCode} 공정 진행 슬라이스(${agg.openSlices}건) 정상 추적 중`;
    bottlenecks.push({
      stageCode,
      severity,
      score,
      openSlices: agg.openSlices,
      overdueSlices: agg.overdueSlices,
      retakeSlices: agg.retakeSlices,
      expiredLeases: agg.expiredLeases,
      affectedEpisodes: [...agg.episodes],
      recommendation,
    });
  }
  bottlenecks.sort((a, b) => b.score - a.score);

  const overallHealth: "healthy" | "watch" | "critical" =
    totalOverdue > 0 || bottlenecks.some((item) => item.severity === "critical")
      ? "critical"
      : totalRetake > 0 || totalExpiredLeases > 0
        ? "watch"
        : "healthy";

  return {
    projectId: input.projectId,
    generatedAt: input.asOf.toISOString(),
    windowWeeks: input.weeks,
    stages: DIVISION_STAGE_CODES,
    episodes,
    bottlenecks,
    riskSummary: {
      overallHealth,
      totalEpisodes: episodes.length,
      totalSlices,
      overdueSlices: totalOverdue,
      retakeSlices: totalRetake,
      expiredLeases: totalExpiredLeases,
      delayRippleRiskEpisodes,
      activeLocksCount: input.activeLocksCount,
    },
  };
}

export interface RoyaltyLedgerEntryPayout extends RoyaltyLedgerRecord {
  readonly basePayoutKrw: number;
  readonly royaltyPayoutKrw: number;
  readonly mgRecoupedKrw: number;
  readonly remainingMgBalanceKrw: number;
  readonly grossPayoutKrw: number;
  readonly withholdingTaxKrw: number;
  readonly netPayoutKrw: number;
}

export interface RoyaltyLedgerAggregateResult {
  readonly projectId: string;
  readonly viewerScope: "all" | "self";
  readonly parameters: {
    readonly grossRevenueKrw: number;
    readonly platformFeeBps: number;
    readonly netRevenueKrw: number;
    readonly withholdingTaxBps: number;
  };
  readonly entries: readonly RoyaltyLedgerEntryPayout[];
  readonly summary: {
    readonly entryCount: number;
    readonly totalApprovedCuts: number;
    readonly totalBaseAmountKrw: number;
    readonly totalRoyaltyPayoutKrw: number;
    readonly totalGrossPayoutKrw: number;
    readonly totalWithholdingTaxKrw: number;
    readonly totalNetPayoutKrw: number;
    readonly totalMgRecoupedKrw: number;
    readonly totalRemainingMgBalanceKrw: number;
    readonly byModel: Readonly<
      Record<
        DivisionSettlementModel,
        { readonly entries: number; readonly grossPayoutKrw: number; readonly netPayoutKrw: number }
      >
    >;
  };
}

export function calculateRoyaltyLedger(input: {
  readonly projectId: string;
  readonly viewerScope: "all" | "self";
  readonly entries: readonly RoyaltyLedgerRecord[];
  readonly grossRevenueKrw: number;
  readonly platformFeeBps: number;
  readonly withholdingTaxBps: number;
}): RoyaltyLedgerAggregateResult {
  const netRevenueKrw = Math.floor(
    (input.grossRevenueKrw * (10_000 - input.platformFeeBps)) / 10_000,
  );

  const byModel: Record<
    DivisionSettlementModel,
    { entries: number; grossPayoutKrw: number; netPayoutKrw: number }
  > = {
    "hybrid-base-plus-royalty": { entries: 0, grossPayoutKrw: 0, netPayoutKrw: 0 },
    "mg-recoup-rs": { entries: 0, grossPayoutKrw: 0, netPayoutKrw: 0 },
    "per-cut": { entries: 0, grossPayoutKrw: 0, netPayoutKrw: 0 },
    flat: { entries: 0, grossPayoutKrw: 0, netPayoutKrw: 0 },
  };

  let totalApprovedCuts = 0;
  let totalBaseAmountKrw = 0;
  let totalRoyaltyPayoutKrw = 0;
  let totalGrossPayoutKrw = 0;
  let totalWithholdingTaxKrw = 0;
  let totalNetPayoutKrw = 0;
  let totalMgRecoupedKrw = 0;
  let totalRemainingMgBalanceKrw = 0;

  const entries: RoyaltyLedgerEntryPayout[] = input.entries.map((entry) => {
    const basePayoutKrw = entry.baseAmountKrw;
    let royaltyPayoutKrw = 0;
    let mgRecoupedKrw = 0;
    let remainingMgBalanceKrw = entry.mgBalanceKrw;

    if (entry.settlementModel === "hybrid-base-plus-royalty") {
      royaltyPayoutKrw = Math.floor((netRevenueKrw * entry.royaltyBps) / 10_000);
    } else if (entry.settlementModel === "mg-recoup-rs") {
      const earnedRsKrw = Math.floor((netRevenueKrw * entry.royaltyBps) / 10_000);
      mgRecoupedKrw = Math.min(entry.mgBalanceKrw, earnedRsKrw);
      remainingMgBalanceKrw = Math.max(0, entry.mgBalanceKrw - mgRecoupedKrw);
      royaltyPayoutKrw = Math.max(0, earnedRsKrw - entry.mgBalanceKrw);
    }

    const grossPayoutKrw = basePayoutKrw + royaltyPayoutKrw;
    const withholdingTaxKrw = Math.floor((grossPayoutKrw * input.withholdingTaxBps) / 10_000);
    const netPayoutKrw = grossPayoutKrw - withholdingTaxKrw;

    totalApprovedCuts += entry.approvedCuts;
    totalBaseAmountKrw += basePayoutKrw;
    totalRoyaltyPayoutKrw += royaltyPayoutKrw;
    totalGrossPayoutKrw += grossPayoutKrw;
    totalWithholdingTaxKrw += withholdingTaxKrw;
    totalNetPayoutKrw += netPayoutKrw;
    totalMgRecoupedKrw += mgRecoupedKrw;
    totalRemainingMgBalanceKrw += remainingMgBalanceKrw;

    byModel[entry.settlementModel].entries += 1;
    byModel[entry.settlementModel].grossPayoutKrw += grossPayoutKrw;
    byModel[entry.settlementModel].netPayoutKrw += netPayoutKrw;

    return {
      ...entry,
      basePayoutKrw,
      royaltyPayoutKrw,
      mgRecoupedKrw,
      remainingMgBalanceKrw,
      grossPayoutKrw,
      withholdingTaxKrw,
      netPayoutKrw,
    };
  });

  return {
    projectId: input.projectId,
    viewerScope: input.viewerScope,
    parameters: {
      grossRevenueKrw: input.grossRevenueKrw,
      platformFeeBps: input.platformFeeBps,
      netRevenueKrw,
      withholdingTaxBps: input.withholdingTaxBps,
    },
    entries,
    summary: {
      entryCount: entries.length,
      totalApprovedCuts,
      totalBaseAmountKrw,
      totalRoyaltyPayoutKrw,
      totalGrossPayoutKrw,
      totalWithholdingTaxKrw,
      totalNetPayoutKrw,
      totalMgRecoupedKrw,
      totalRemainingMgBalanceKrw,
      byModel,
    },
  };
}
