/**
 * 대형 웹툰 스튜디오(CP사) PM 3~4화차 동시 로테이션 컨베이어 엔진 (₩0 로컬).
 *
 * - Ep.12(식자·최종QC), Ep.13(채색·후보정), Ep.14(선화·3D배경), Ep.15(각색·콘티) 동시 회전 추적
 * - 도미노 마감 지연 조기 경보(`detectDominoDelayRisk`) 및 여유 인력 자동 재배정(`evaluateMultiEpisodeConveyor`)
 * - 난이도 가중치 외주 정산 및 플랫폼 사전 QC는 `large-studio-settlement-qc-engine.ts`에서 함께 재노출한다.
 */

export {
  CUT_DIFFICULTY_TIERS,
  DEFAULT_PLATFORM_QC_INPUT,
  DEFAULT_SETTLEMENT_ENTRIES,
  PLATFORM_QC_SPECS,
  SETTLEMENT_STAGE_RATES_KRW,
  calculateWeightedStudioSettlement,
  runPlatformPreSubmissionQc,
  type CalculatedSettlementLine,
  type CutDifficultyGradeId,
  type CutDifficultyTierSpec,
  type DifficultyCutCounts,
  type PlatformAgeRatingId,
  type PlatformPreSubmissionInput,
  type PlatformPreSubmissionQcReport,
  type PlatformQcCheckItem,
  type PlatformQcSpec,
  type PlatformQcTargetId,
  type QcCheckStatus,
  type SettlementContractorEntry,
  type SettlementStageId,
  type SettlementTaxMode,
  type WeightedStudioSettlementReport,
} from "./large-studio-settlement-qc-engine";

export const CONVEYOR_STAGE_ORDER = [
  "adapt-storyboard",
  "lineart-bg3d",
  "color-post",
  "lettering-qc",
] as const;

export type ConveyorStageId = (typeof CONVEYOR_STAGE_ORDER)[number];

export const CONVEYOR_STAGE_LABELS: Readonly<Record<ConveyorStageId, string>> = {
  "adapt-storyboard": "각색 · 콘티",
  "lineart-bg3d": "선화 · 3D 배경",
  "color-post": "채색 · 후보정",
  "lettering-qc": "식자 · 최종 QC",
};

export interface ConveyorEpisodeSlot {
  readonly episodeNumber: number;
  readonly episodeTitleKo: string;
  readonly stageId: ConveyorStageId;
  readonly leadNameKo: string;
  readonly totalCuts: number;
  readonly completedCuts: number;
  readonly remainingWorkHours: number;
  readonly hoursUntilStageDeadline: number;
  readonly assignedDailyCapacityHours: number;
  readonly publishDDay: number;
}

export interface StudioStaffMember {
  readonly staffId: string;
  readonly nameKo: string;
  readonly primaryStage: ConveyorStageId;
  readonly secondaryStages: readonly ConveyorStageId[];
  readonly assignedEpisodeNumber: number | null;
  readonly dailyCapacityHours: number;
  readonly committedHours: number;
  readonly spareHours: number;
}

export type EpisodeHealthStatus = "on-track" | "watch" | "delayed" | "critical";

export interface EvaluatedConveyorEpisode extends ConveyorEpisodeSlot {
  readonly stageLabelKo: string;
  readonly progressPercent: number;
  readonly remainingCuts: number;
  readonly availableWorkHours: number;
  readonly slackHours: number;
  readonly delayHours: number;
  readonly status: EpisodeHealthStatus;
  readonly nextStageId: ConveyorStageId | null;
  readonly nextStageLabelKo: string;
}

export type DominoRiskSeverity = "none" | "warning" | "critical";

export interface DominoDelayAlert {
  readonly alertId: string;
  readonly severity: Exclude<DominoRiskSeverity, "none">;
  readonly cascadeType: "same-stage-slot" | "downstream-handoff";
  readonly sourceEpisodeNumber: number;
  readonly sourceStageLabelKo: string;
  readonly impactedEpisodes: readonly number[];
  readonly cascadedDelayHours: number;
  readonly deadlineImpactKo: string;
  readonly mitigationKo: string;
}

export interface DominoDelayReport {
  readonly overallSeverity: DominoRiskSeverity;
  readonly alerts: readonly DominoDelayAlert[];
  readonly totalCascadedDelayHours: number;
  readonly affectedEpisodeNumbers: readonly number[];
  readonly headlineKo: string;
}

export interface ReallocationProposal {
  readonly proposalId: string;
  readonly staffId: string;
  readonly staffNameKo: string;
  readonly fromEpisodeNumber: number | null;
  readonly targetEpisodeNumber: number;
  readonly targetStageId: ConveyorStageId;
  readonly targetStageLabelKo: string;
  readonly allocatedHours: number;
  readonly recoveredDelayHours: number;
  readonly residualDelayHours: number;
  readonly isPrimarySkillMatch: boolean;
  readonly reasonKo: string;
}

export interface MultiEpisodeConveyorEvaluation {
  readonly episodes: readonly EvaluatedConveyorEpisode[];
  readonly domino: DominoDelayReport;
  readonly reallocationProposals: readonly ReallocationProposal[];
  readonly totalActiveEpisodes: number;
  readonly delayedEpisodeCount: number;
  readonly totalSpareStaffHours: number;
  readonly summaryKo: string;
}

export const DEFAULT_STUDIO_CONVEYOR_EPISODES: readonly ConveyorEpisodeSlot[] = [
  {
    episodeNumber: 12,
    episodeTitleKo: "Ep.12 탑의 균열 (최종 출고)",
    stageId: "lettering-qc",
    leadNameKo: "정하린 (식자·QC)",
    totalCuts: 68,
    completedCuts: 62,
    remainingWorkHours: 4,
    hoursUntilStageDeadline: 12,
    assignedDailyCapacityHours: 10,
    publishDDay: 1,
  },
  {
    episodeNumber: 13,
    episodeTitleKo: "Ep.13 야간 추격전",
    stageId: "color-post",
    leadNameKo: "윤서아 (채색 팀장)",
    totalCuts: 72,
    completedCuts: 44,
    remainingWorkHours: 22,
    hoursUntilStageDeadline: 30,
    assignedDailyCapacityHours: 26,
    publishDDay: 8,
  },
  {
    episodeNumber: 14,
    episodeTitleKo: "Ep.14 길드 본부 습격",
    stageId: "lineart-bg3d",
    leadNameKo: "강도윤 (선화 메인)",
    totalCuts: 74,
    completedCuts: 28,
    remainingWorkHours: 36,
    hoursUntilStageDeadline: 24,
    assignedDailyCapacityHours: 24,
    publishDDay: 15,
  },
  {
    episodeNumber: 15,
    episodeTitleKo: "Ep.15 반격의 설계도",
    stageId: "adapt-storyboard",
    leadNameKo: "최지우 (각색·콘티)",
    totalCuts: 66,
    completedCuts: 48,
    remainingWorkHours: 10,
    hoursUntilStageDeadline: 36,
    assignedDailyCapacityHours: 12,
    publishDDay: 22,
  },
];

export const DEFAULT_STUDIO_STAFF_POOL: readonly StudioStaffMember[] = [
  {
    staffId: "staff-kim-daon",
    nameKo: "김다온 (선화·3D 보조)",
    primaryStage: "lineart-bg3d",
    secondaryStages: ["adapt-storyboard"],
    assignedEpisodeNumber: 15,
    dailyCapacityHours: 8,
    committedHours: 2,
    spareHours: 10,
  },
  {
    staffId: "staff-park-seojun",
    nameKo: "박서준 (채색·후보정)",
    primaryStage: "color-post",
    secondaryStages: ["lineart-bg3d", "lettering-qc"],
    assignedEpisodeNumber: 12,
    dailyCapacityHours: 8,
    committedHours: 3,
    spareHours: 6,
  },
  {
    staffId: "staff-lee-yujin",
    nameKo: "이유진 (식자·검수)",
    primaryStage: "lettering-qc",
    secondaryStages: ["color-post"],
    assignedEpisodeNumber: 12,
    dailyCapacityHours: 8,
    committedHours: 4,
    spareHours: 5,
  },
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function getNextStageId(stageId: ConveyorStageId): ConveyorStageId | null {
  const index = CONVEYOR_STAGE_ORDER.indexOf(stageId);
  if (index < 0 || index >= CONVEYOR_STAGE_ORDER.length - 1) return null;
  return CONVEYOR_STAGE_ORDER[index + 1] ?? null;
}

function classifyEpisodeHealth(slackHours: number, publishDDay: number): EpisodeHealthStatus {
  if (slackHours <= -8 || (slackHours < 0 && publishDDay <= 2)) return "critical";
  if (slackHours < 0) return "delayed";
  if (slackHours <= 4) return "watch";
  return "on-track";
}

/**
 * 3~4화차 동시 로테이션 컨베이어에서 도미노 마감 지연 위험을 조기 탐지한다.
 */
export function detectDominoDelayRisk(
  evaluatedEpisodes: readonly EvaluatedConveyorEpisode[],
): DominoDelayReport {
  const sortedByEpisode = [...evaluatedEpisodes].sort((a, b) => a.episodeNumber - b.episodeNumber);
  const alerts: DominoDelayAlert[] = [];
  const affectedSet = new Set<number>();

  for (const episode of sortedByEpisode) {
    if (episode.delayHours <= 0) continue;
    affectedSet.add(episode.episodeNumber);

    if (episode.nextStageId) {
      const cascadedDownstream = round1(Math.max(episode.delayHours - 4, 1));
      alerts.push({
        alertId: `domino-handoff-ep${episode.episodeNumber}`,
        severity: episode.delayHours >= 8 || episode.publishDDay <= 8 ? "critical" : "warning",
        cascadeType: "downstream-handoff",
        sourceEpisodeNumber: episode.episodeNumber,
        sourceStageLabelKo: episode.stageLabelKo,
        impactedEpisodes: [episode.episodeNumber],
        cascadedDelayHours: cascadedDownstream,
        deadlineImpactKo: `Ep.${episode.episodeNumber} ${episode.stageLabelKo}가 ${episode.delayHours}시간 지연되어 ${episode.nextStageLabelKo} 착수 버퍼가 ${cascadedDownstream}시간 잠식됩니다.`,
        mitigationKo: `${episode.stageLabelKo} 유휴 보조 인력 투입 또는 난이도 높은 배경 컷 우선 분리가 필요합니다.`,
      });
    }

    const followingEpisodes = sortedByEpisode.filter(
      (candidate) => candidate.episodeNumber > episode.episodeNumber,
    );
    if (followingEpisodes.length > 0) {
      const impactedNumbers = followingEpisodes.map((item) => item.episodeNumber);
      for (const epNo of impactedNumbers) affectedSet.add(epNo);
      const cascadedSlotDelay = round1(episode.delayHours * (0.85 + 0.15 * impactedNumbers.length));
      alerts.push({
        alertId: `domino-slot-ep${episode.episodeNumber}`,
        severity: episode.delayHours >= 8 ? "critical" : "warning",
        cascadeType: "same-stage-slot",
        sourceEpisodeNumber: episode.episodeNumber,
        sourceStageLabelKo: episode.stageLabelKo,
        impactedEpisodes: impactedNumbers,
        cascadedDelayHours: cascadedSlotDelay,
        deadlineImpactKo: `Ep.${episode.episodeNumber} ${episode.stageLabelKo} 인력이 묶여 후속 회차(${impactedNumbers.map((n) => `Ep.${n}`).join(", ")})의 동일 공정 진입이 최대 ${cascadedSlotDelay}시간 밀립니다.`,
        mitigationKo: `후속 회차 착수 전 여유 인력을 Ep.${episode.episodeNumber} ${episode.stageLabelKo}에 긴급 지원하세요.`,
      });
    }
  }

  const totalCascadedDelayHours = round1(
    alerts.reduce((acc, alert) => acc + alert.cascadedDelayHours, 0),
  );
  const overallSeverity: DominoRiskSeverity = alerts.some((a) => a.severity === "critical")
    ? "critical"
    : alerts.length > 0
      ? "warning"
      : "none";
  const affectedEpisodeNumbers = [...affectedSet].sort((a, b) => a - b);

  const headlineKo =
    overallSeverity === "none"
      ? "3~4화차 동시 로테이션 정상 가동 중 — 도미노 지연 위험 0건입니다."
      : `도미노 지연 경보 ${alerts.length}건 감지 · 영향 회차 ${affectedEpisodeNumbers.map((n) => `Ep.${n}`).join(", ")} (연쇄 지연 추정 ${totalCascadedDelayHours}시간)`;

  return {
    overallSeverity,
    alerts,
    totalCascadedDelayHours,
    affectedEpisodeNumbers,
    headlineKo,
  };
}

/**
 * 3~4화차 동시 로테이션 컨베이어를 평가하고 도미노 경보 및 여유 인력 자동 재배정안을 산출한다.
 */
export function evaluateMultiEpisodeConveyor(
  episodes: readonly ConveyorEpisodeSlot[] = DEFAULT_STUDIO_CONVEYOR_EPISODES,
  staffPool: readonly StudioStaffMember[] = DEFAULT_STUDIO_STAFF_POOL,
): MultiEpisodeConveyorEvaluation {
  const evaluatedEpisodes: EvaluatedConveyorEpisode[] = episodes.map((ep) => {
    const safeTotal = Math.max(1, ep.totalCuts);
    const safeCompleted = Math.min(safeTotal, Math.max(0, ep.completedCuts));
    const remainingCuts = Math.max(0, safeTotal - safeCompleted);
    const progressPercent = Math.round((safeCompleted / safeTotal) * 100);
    const availableWorkHours = round1(
      Math.max(0, Math.min(ep.hoursUntilStageDeadline, ep.assignedDailyCapacityHours)),
    );
    const slackHours = round1(availableWorkHours - Math.max(0, ep.remainingWorkHours));
    const delayHours = slackHours < 0 ? round1(Math.abs(slackHours)) : 0;
    const nextStageId = getNextStageId(ep.stageId);
    const status = classifyEpisodeHealth(slackHours, ep.publishDDay);

    return {
      ...ep,
      completedCuts: safeCompleted,
      stageLabelKo: CONVEYOR_STAGE_LABELS[ep.stageId],
      progressPercent,
      remainingCuts,
      availableWorkHours,
      slackHours,
      delayHours,
      status,
      nextStageId,
      nextStageLabelKo: nextStageId ? CONVEYOR_STAGE_LABELS[nextStageId] : "플랫폼 출고 완료",
    };
  });

  const domino = detectDominoDelayRisk(evaluatedEpisodes);

  const needsHelp = evaluatedEpisodes
    .filter((ep) => ep.delayHours > 0 || ep.status === "watch")
    .sort((a, b) => b.delayHours - a.delayHours || a.publishDDay - b.publishDDay);

  const remainingSpareByStaff = new Map<string, number>();
  for (const staff of staffPool) {
    remainingSpareByStaff.set(staff.staffId, Math.max(0, staff.spareHours));
  }

  const reallocationProposals: ReallocationProposal[] = [];

  for (const target of needsHelp) {
    let stillNeeded = target.delayHours > 0 ? target.delayHours : 4;
    const candidates = [...staffPool]
      .filter((staff) => {
        const spare = remainingSpareByStaff.get(staff.staffId) ?? 0;
        if (spare <= 0) return false;
        return (
          staff.primaryStage === target.stageId || staff.secondaryStages.includes(target.stageId)
        );
      })
      .sort((a, b) => {
        const aPrimary = a.primaryStage === target.stageId ? 1 : 0;
        const bPrimary = b.primaryStage === target.stageId ? 1 : 0;
        if (bPrimary !== aPrimary) return bPrimary - aPrimary;
        return (remainingSpareByStaff.get(b.staffId) ?? 0) - (remainingSpareByStaff.get(a.staffId) ?? 0);
      });

    for (const staff of candidates) {
      if (stillNeeded <= 0) break;
      const availableSpare = remainingSpareByStaff.get(staff.staffId) ?? 0;
      if (availableSpare <= 0) continue;

      const isPrimary = staff.primaryStage === target.stageId;
      const efficiency = isPrimary ? 1.0 : 0.8;
      const allocatedHours = round1(Math.min(availableSpare, stillNeeded / efficiency));
      const recoveredDelayHours = round1(Math.min(stillNeeded, allocatedHours * efficiency));
      const residualDelayHours = round1(Math.max(0, stillNeeded - recoveredDelayHours));

      remainingSpareByStaff.set(staff.staffId, round1(Math.max(0, availableSpare - allocatedHours)));
      stillNeeded = residualDelayHours;

      reallocationProposals.push({
        proposalId: `realloc-${staff.staffId}-ep${target.episodeNumber}`,
        staffId: staff.staffId,
        staffNameKo: staff.nameKo,
        fromEpisodeNumber: staff.assignedEpisodeNumber,
        targetEpisodeNumber: target.episodeNumber,
        targetStageId: target.stageId,
        targetStageLabelKo: target.stageLabelKo,
        allocatedHours,
        recoveredDelayHours,
        residualDelayHours,
        isPrimarySkillMatch: isPrimary,
        reasonKo: isPrimary
          ? `${staff.nameKo}의 유휴 ${allocatedHours}시간을 Ep.${target.episodeNumber} ${target.stageLabelKo} 주력 공정에 투입하면 지연 ${recoveredDelayHours}시간을 즉시 회복합니다.`
          : `${staff.nameKo}의 보조 공정 역량(${allocatedHours}시간 · 효율 80%)으로 Ep.${target.episodeNumber} 지연 ${recoveredDelayHours}시간을 완화합니다.`,
      });
    }
  }

  const delayedEpisodeCount = evaluatedEpisodes.filter((ep) => ep.delayHours > 0).length;
  const totalSpareStaffHours = round1(
    staffPool.reduce((acc, member) => acc + Math.max(0, member.spareHours), 0),
  );
  const summaryKo =
    delayedEpisodeCount === 0
      ? `동시 가동 ${evaluatedEpisodes.length}화차 모두 마감 안전권입니다 (유휴 역량 ${totalSpareStaffHours}시간 확보).`
      : `동시 가동 ${evaluatedEpisodes.length}화차 중 ${delayedEpisodeCount}화차 지연 위험 · 자동 재배정안 ${reallocationProposals.length}건 생성됨.`;

  return {
    episodes: evaluatedEpisodes,
    domino,
    reallocationProposals,
    totalActiveEpisodes: evaluatedEpisodes.length,
    delayedEpisodeCount,
    totalSpareStaffHours,
    summaryKo,
  };
}

/**
 * 제안된 여유 인력 재배정을 컨베이어 상태에 시뮬레이션 반영한다.
 */
export function applyReallocationProposal(
  episodes: readonly ConveyorEpisodeSlot[],
  staffPool: readonly StudioStaffMember[],
  proposal: ReallocationProposal,
): {
  readonly episodes: readonly ConveyorEpisodeSlot[];
  readonly staffPool: readonly StudioStaffMember[];
} {
  const nextEpisodes = episodes.map((ep) => {
    if (ep.episodeNumber !== proposal.targetEpisodeNumber) return ep;
    return {
      ...ep,
      remainingWorkHours: round1(Math.max(0, ep.remainingWorkHours - proposal.recoveredDelayHours)),
      assignedDailyCapacityHours: round1(
        ep.assignedDailyCapacityHours + proposal.recoveredDelayHours,
      ),
    };
  });

  const nextStaffPool = staffPool.map((member) => {
    if (member.staffId !== proposal.staffId) return member;
    return {
      ...member,
      committedHours: round1(member.committedHours + proposal.allocatedHours),
      spareHours: round1(Math.max(0, member.spareHours - proposal.allocatedHours)),
    };
  });

  return { episodes: nextEpisodes, staffPool: nextStaffPool };
}
