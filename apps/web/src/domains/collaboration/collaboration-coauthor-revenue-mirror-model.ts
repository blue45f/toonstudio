/**
 * 포스타입 Postype (`ev_1658697c3873a26ba941c5c1cd68ff985aa5a3e181633a377f953121af72cc87` — 공동집필 시리즈 유료 회차·후원금 RS 정산) +
 * Monday.com (`ev_095c1d4126a37583d8b7c3d2f5f026e21af18d5d96e862473125c9f16f5349bb` — 크로스보드 미러 컬럼 & 100% 배터리 정합성 게이지)
 * 역공학 내재화 순수 도메인 모델.
 */

export type CoauthorSettlementCycle =
  | "monthly-25th"
  | "per-episode-release"
  | "mg-recoup-then-rs";

export interface CoauthorLaneShareInput {
  readonly laneId: "story_conte" | "main_line_art" | "color_shading" | "bg_3d_lettering";
  readonly roleLabelKo: string;
  readonly roleLabelEn: string;
  readonly revenueSharePct: number;
  readonly secondaryRightsPct: number;
  readonly mirrorColumnLinked: boolean;
}

export interface CoauthorRevenueMirrorInput {
  readonly ledgerCode: string;
  readonly settlementCycle: CoauthorSettlementCycle;
  readonly projectedGrossKrw: number;
  readonly platformFeePct: number;
  readonly includeFanSponsorshipPool: boolean;
  readonly lanes: readonly CoauthorLaneShareInput[];
}

export interface EvaluatedCoauthorLaneShare extends CoauthorLaneShareInput {
  readonly estimatedMonthlyNetKrw: number;
}

export interface CoauthorRevenueMirrorEvaluation {
  readonly ledgerCode: string;
  readonly totalSharePct: number;
  readonly totalSecondaryRightsPct: number;
  readonly allocationBalanced: boolean;
  readonly netDistributableKrw: number;
  readonly mirroredLaneCount: number;
  readonly lanes: readonly EvaluatedCoauthorLaneShare[];
  readonly statusSummaryKo: string;
  readonly statusSummaryEn: string;
}

export const DEFAULT_COAUTHOR_LANES: readonly CoauthorLaneShareInput[] = Object.freeze([
  {
    laneId: "story_conte",
    roleLabelKo: "스토리·글/그림콘티 작가",
    roleLabelEn: "Story & Storyboard Writer",
    revenueSharePct: 35,
    secondaryRightsPct: 45,
    mirrorColumnLinked: true,
  },
  {
    laneId: "main_line_art",
    roleLabelKo: "메인 작화·선화 작가",
    roleLabelEn: "Lead Line-Art Artist",
    revenueSharePct: 35,
    secondaryRightsPct: 35,
    mirrorColumnLinked: true,
  },
  {
    laneId: "color_shading",
    roleLabelKo: "밑색·명암·렌더링 담당",
    roleLabelEn: "Flats & Shading Colorist",
    revenueSharePct: 20,
    secondaryRightsPct: 12,
    mirrorColumnLinked: true,
  },
  {
    laneId: "bg_3d_lettering",
    roleLabelKo: "3D 배경·식자·후보정 담당",
    roleLabelEn: "3D Backgrounds & Lettering",
    revenueSharePct: 10,
    secondaryRightsPct: 8,
    mirrorColumnLinked: true,
  },
]);

export function evaluateCoauthorRevenueMirror(
  input: CoauthorRevenueMirrorInput,
): CoauthorRevenueMirrorEvaluation {
  const safeCode = input.ledgerCode.trim() || "POSTYPE-RS-2026";
  const safeGross = Math.max(0, Math.round(input.projectedGrossKrw));
  const safeFeePct = Math.min(50, Math.max(0, input.platformFeePct));
  const sponsorshipBonusKrw = input.includeFanSponsorshipPool
    ? Math.round(safeGross * 0.08)
    : 0;
  const netDistributableKrw = Math.round(
    (safeGross + sponsorshipBonusKrw) * (1 - safeFeePct / 100),
  );

  const totalSharePct = input.lanes.reduce(
    (sum, lane) => sum + Math.max(0, Math.round(lane.revenueSharePct)),
    0,
  );
  const totalSecondaryRightsPct = input.lanes.reduce(
    (sum, lane) => sum + Math.max(0, Math.round(lane.secondaryRightsPct)),
    0,
  );
  const allocationBalanced =
    totalSharePct === 100 && totalSecondaryRightsPct === 100;

  const mirroredLaneCount = input.lanes.filter(
    (lane) => lane.mirrorColumnLinked,
  ).length;

  const evaluatedLanes: EvaluatedCoauthorLaneShare[] = input.lanes.map((lane) => ({
    ...lane,
    estimatedMonthlyNetKrw: Math.round(
      (netDistributableKrw * Math.max(0, lane.revenueSharePct)) / 100,
    ),
  }));

  const statusSummaryKo = !allocationBalanced
    ? `배터리 지분 불일치 경고: 연재 RS 합계(${totalSharePct}%) 및 2차 판권 합계(${totalSecondaryRightsPct}%)가 각각 정확히 100%여야 Monday.com 미러 원장에 게시됩니다.`
    : `포스타입·Monday.com 공동창작 RS 원장 정합성 통과 (100% 배분 완료 · 미러 컬럼 ${mirroredLaneCount}/4개 동기화 · 월 배분 가능 순수익 ${netDistributableKrw.toLocaleString("ko-KR")}원)`;

  const statusSummaryEn = !allocationBalanced
    ? `Battery Share Mismatch: Episode RS (${totalSharePct}%) and Secondary Rights (${totalSecondaryRightsPct}%) must each equal 100% before syncing to Monday.com mirror columns.`
    : `Postype & Monday.com Co-Author RS Ledger Verified (100% balanced · ${mirroredLaneCount}/4 mirror columns synced · Net pool KRW ${netDistributableKrw.toLocaleString("en-US")})`;

  return Object.freeze({
    ledgerCode: safeCode,
    totalSharePct,
    totalSecondaryRightsPct,
    allocationBalanced,
    netDistributableKrw,
    mirroredLaneCount,
    lanes: Object.freeze(evaluatedLanes),
    statusSummaryKo,
    statusSummaryEn,
  });
}
