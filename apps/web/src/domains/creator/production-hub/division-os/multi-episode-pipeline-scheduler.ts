/**
 * 5주 병렬 멀티 에피소드 매트릭스(5화 × 9공정), 마감 지연 파급 시뮬레이터, 병목 자동 탐지 및 재배정 추천 엔진 (T-003).
 */

import type { DivisionRoleId } from "./layer-authority-rbac";

export const PIPELINE_STAGE_IDS = [
  "script",
  "storyboard",
  "bg3d",
  "line",
  "flat",
  "shade",
  "fx_lettering",
  "ad_qa",
  "pd_delivery",
] as const;

export type PipelineStageId = (typeof PIPELINE_STAGE_IDS)[number];

export type PipelineCellStatus = "done" | "in_progress" | "queued" | "delayed" | "blocked";

export interface PipelineStageDefinition {
  readonly id: PipelineStageId;
  readonly role: DivisionRoleId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly dependsOn: readonly PipelineStageId[];
  readonly defaultHours: number;
}

export interface PipelineMatrixCell {
  readonly episodeId: string;
  readonly stageId: PipelineStageId;
  readonly role: DivisionRoleId;
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly status: PipelineCellStatus;
  readonly plannedHours: number;
  readonly remainingHours: number;
  readonly slackHours: number;
  readonly delayedHours: number;
}

export interface PipelineEpisodeRow {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly weekOffset: number;
  readonly publishDeadlineIso: string;
  readonly cells: readonly PipelineMatrixCell[];
}

export interface PipelineRosterMember {
  readonly memberId: string;
  readonly name: string;
  readonly role: DivisionRoleId;
  readonly weeklyCapacityHours: number;
}

export interface MultiEpisodePipelineMatrix {
  readonly projectTitle: string;
  readonly episodes: readonly PipelineEpisodeRow[];
  readonly roster: readonly PipelineRosterMember[];
}

export interface DelayRippleImpact {
  readonly episodeId: string;
  readonly stageId: PipelineStageId;
  readonly assigneeName: string;
  readonly addedDelayHours: number;
  readonly remainingSlackHours: number;
  readonly breachesDeadline: boolean;
  readonly impactKind: "source" | "dependency" | "resource_contention";
}

export interface EpisodeDeadlineSlip {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly slipHours: number;
  readonly breachesDeadline: boolean;
}

export interface DelayRippleReport {
  readonly sourceEpisodeId: string;
  readonly sourceStageId: PipelineStageId;
  readonly injectedDelayHours: number;
  readonly impactedCells: readonly DelayRippleImpact[];
  readonly episodeDeadlineSlips: readonly EpisodeDeadlineSlip[];
  readonly riskLevel: "stable" | "watch" | "critical";
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface StageBottleneckItem {
  readonly memberId: string;
  readonly memberName: string;
  readonly role: DivisionRoleId;
  readonly assignedHours: number;
  readonly weeklyCapacityHours: number;
  readonly utilizationPercent: number;
  readonly delayedHours: number;
  readonly severity: "critical" | "warning";
}

export interface ReassignmentRecommendation {
  readonly recommendationId: string;
  readonly episodeId: string;
  readonly stageId: PipelineStageId;
  readonly role: DivisionRoleId;
  readonly fromMemberId: string;
  readonly fromMemberName: string;
  readonly toMemberId: string;
  readonly toMemberName: string;
  readonly recoverableHours: number;
  readonly rationaleKo: string;
  readonly rationaleEn: string;
}

export interface PipelineBottleneckReport {
  readonly bottlenecks: readonly StageBottleneckItem[];
  readonly recommendations: readonly ReassignmentRecommendation[];
}

export const PIPELINE_STAGE_DEFINITIONS: readonly PipelineStageDefinition[] = [
  { id: "script", role: "writer", labelKo: "각본", labelEn: "Script", dependsOn: [], defaultHours: 8 },
  { id: "storyboard", role: "storyboard", labelKo: "콘티", labelEn: "Conti", dependsOn: ["script"], defaultHours: 14 },
  { id: "bg3d", role: "bg3d", labelKo: "3D배경", labelEn: "BG3D", dependsOn: ["storyboard"], defaultHours: 16 },
  { id: "line", role: "line", labelKo: "선화", labelEn: "Line", dependsOn: ["storyboard"], defaultHours: 22 },
  { id: "flat", role: "flat", labelKo: "밑색", labelEn: "Flat", dependsOn: ["line"], defaultHours: 12 },
  { id: "shade", role: "shade", labelKo: "명암", labelEn: "Shade", dependsOn: ["bg3d", "flat"], defaultHours: 18 },
  {
    id: "fx_lettering",
    role: "finishing_lettering",
    labelKo: "후보정·식자",
    labelEn: "FX/Letter",
    dependsOn: ["shade", "script"],
    defaultHours: 10,
  },
  { id: "ad_qa", role: "art_director", labelKo: "AD검수", labelEn: "AD QA", dependsOn: ["fx_lettering"], defaultHours: 6 },
  { id: "pd_delivery", role: "pd", labelKo: "PD납품", labelEn: "PD Ship", dependsOn: ["ad_qa"], defaultHours: 4 },
];

const STAGE_DEF_BY_ID: Readonly<Record<PipelineStageId, PipelineStageDefinition>> = Object.fromEntries(
  PIPELINE_STAGE_DEFINITIONS.map((stage) => [stage.id, stage]),
) as Readonly<Record<PipelineStageId, PipelineStageDefinition>>;

export function createDefaultFiveWeekMatrix(
  projectTitle: string,
  baseEpisodeNumber = 12,
): MultiEpisodePipelineMatrix {
  const roster: readonly PipelineRosterMember[] = [
    { memberId: "m-writer-1", name: "강민서", role: "writer", weeklyCapacityHours: 36 },
    { memberId: "m-conti-1", name: "윤하림", role: "storyboard", weeklyCapacityHours: 40 },
    { memberId: "m-bg-1", name: "정우진", role: "bg3d", weeklyCapacityHours: 40 },
    { memberId: "m-bg-2", name: "이채원", role: "bg3d", weeklyCapacityHours: 36 },
    { memberId: "m-line-1", name: "박서윤", role: "line", weeklyCapacityHours: 40 },
    { memberId: "m-line-2", name: "최도현", role: "line", weeklyCapacityHours: 36 },
    { memberId: "m-flat-1", name: "한지호", role: "flat", weeklyCapacityHours: 38 },
    { memberId: "m-shade-1", name: "오세린", role: "shade", weeklyCapacityHours: 40 },
    { memberId: "m-shade-2", name: "배민준", role: "shade", weeklyCapacityHours: 36 },
    { memberId: "m-fx-1", name: "신유나", role: "finishing_lettering", weeklyCapacityHours: 36 },
    { memberId: "m-ad-1", name: "김도영 AD", role: "art_director", weeklyCapacityHours: 36 },
    { memberId: "m-pd-1", name: "송지안 PD", role: "pd", weeklyCapacityHours: 36 },
  ];

  const primaryByRole: Readonly<Record<DivisionRoleId, PipelineRosterMember>> = {
    writer: roster[0],
    storyboard: roster[1],
    bg3d: roster[2],
    line: roster[4],
    flat: roster[6],
    shade: roster[7],
    finishing_lettering: roster[9],
    art_director: roster[10],
    pd: roster[11],
  };

  // 5주 롤링 파이프라인: 앞 회차일수록 후공정 완료, 뒷 회차일수록 선공정 진행
  const progressThresholds = [7, 5, 3, 2, 1] as const;
  const deadlineDates = [
    "2026-11-24T18:00:00.000Z",
    "2026-12-01T18:00:00.000Z",
    "2026-12-08T18:00:00.000Z",
    "2026-12-15T18:00:00.000Z",
    "2026-12-22T18:00:00.000Z",
  ] as const;

  const episodes: PipelineEpisodeRow[] = progressThresholds.map((doneCount, rowIndex) => {
    const episodeNumber = baseEpisodeNumber + rowIndex;
    const episodeId = `ep-${episodeNumber}`;
    const cells: PipelineMatrixCell[] = PIPELINE_STAGE_DEFINITIONS.map((stageDef, stageIndex) => {
      const member = primaryByRole[stageDef.role];
      let status: PipelineCellStatus;
      let remainingHours = stageDef.defaultHours;
      let delayedHours = 0;

      if (stageIndex < doneCount) {
        status = "done";
        remainingHours = 0;
      } else if (stageIndex === doneCount) {
        status = rowIndex === 1 && stageDef.id === "shade" ? "delayed" : "in_progress";
        remainingHours = Math.ceil(stageDef.defaultHours * 0.6);
        delayedHours = status === "delayed" ? 6 : 0;
      } else if (stageIndex === doneCount + 1) {
        status = "in_progress";
        remainingHours = Math.ceil(stageDef.defaultHours * 0.85);
      } else {
        status = "queued";
      }

      const slackHours = Math.max(2, (rowIndex + 1) * 6 - (stageIndex >= 6 ? 2 : 0));
      return {
        episodeId,
        stageId: stageDef.id,
        role: stageDef.role,
        assigneeId: member.memberId,
        assigneeName: member.name,
        status,
        plannedHours: stageDef.defaultHours,
        remainingHours,
        slackHours,
        delayedHours,
      };
    });

    return {
      episodeId,
      episodeNumber,
      titleKo: `${episodeNumber}화 · 주간 연재분`,
      titleEn: `Ep.${episodeNumber} · Weekly Release`,
      weekOffset: rowIndex + 1,
      publishDeadlineIso: deadlineDates[rowIndex] ?? "2026-12-22T18:00:00.000Z",
      cells,
    };
  });

  return {
    projectTitle,
    episodes,
    roster,
  };
}

/**
 * 특정 회차·공정에 delayHours 지연이 발생했을 때:
 * 1) 동일 회차 후행 DAG 공정으로의 전파(dependency)
 * 2) 동일 담당자가 맡은 후속 회차 미완료 공정으로의 자원 경합 전파(resource_contention)
 * 를 모두 계산해 마감 초과 위험을 산출한다.
 */
export function simulateStageDelayRipple(
  matrix: MultiEpisodePipelineMatrix,
  input: {
    readonly episodeId: string;
    readonly stageId: PipelineStageId;
    readonly delayHours: number;
  },
): DelayRippleReport {
  const delayHours = Math.max(0, Math.round(input.delayHours));
  const sourceEpIndex = matrix.episodes.findIndex((ep) => ep.episodeId === input.episodeId);
  if (sourceEpIndex < 0 || delayHours === 0) {
    return {
      sourceEpisodeId: input.episodeId,
      sourceStageId: input.stageId,
      injectedDelayHours: delayHours,
      impactedCells: [],
      episodeDeadlineSlips: matrix.episodes.map((ep) => ({
        episodeId: ep.episodeId,
        episodeNumber: ep.episodeNumber,
        slipHours: 0,
        breachesDeadline: false,
      })),
      riskLevel: "stable",
      summaryKo: "지연 시뮬레이션 입력이 0시간으로 모든 회차가 정상 버퍼 내입니다.",
      summaryEn: "0h delay injected; all 5 weekly episodes remain inside buffer.",
    };
  }

  const impacted = new Map<string, DelayRippleImpact>();
  const keyOf = (episodeId: string, stageId: PipelineStageId) => `${episodeId}::${stageId}`;

  const sourceEpisode = matrix.episodes[sourceEpIndex];
  const sourceCell = sourceEpisode.cells.find((cell) => cell.stageId === input.stageId);
  if (!sourceCell) {
    return {
      sourceEpisodeId: input.episodeId,
      sourceStageId: input.stageId,
      injectedDelayHours: delayHours,
      impactedCells: [],
      episodeDeadlineSlips: [],
      riskLevel: "stable",
      summaryKo: "대상 공정을 찾을 수 없습니다.",
      summaryEn: "Target stage not found.",
    };
  }

  const recordImpact = (
    cell: PipelineMatrixCell,
    addedDelayHours: number,
    impactKind: DelayRippleImpact["impactKind"],
  ) => {
    if (addedDelayHours <= 0) return;
    const key = keyOf(cell.episodeId, cell.stageId);
    const existing = impacted.get(key);
    const totalAdded = Math.max(existing?.addedDelayHours ?? 0, addedDelayHours);
    const remainingSlackHours = cell.slackHours - totalAdded;
    impacted.set(key, {
      episodeId: cell.episodeId,
      stageId: cell.stageId,
      assigneeName: cell.assigneeName,
      addedDelayHours: totalAdded,
      remainingSlackHours,
      breachesDeadline: remainingSlackHours < 0,
      impactKind: existing?.impactKind === "source" ? "source" : impactKind,
    });
  };

  // 1) 출발 셀 기록
  recordImpact(sourceCell, delayHours, "source");

  // 2) 동일 담당자 자원 경합(후속 회차 동일/유사 공정) 및 각 회차 내부 DAG 순방향 전파
  const propagateIntraEpisode = (episode: PipelineEpisodeRow) => {
    for (const stageDef of PIPELINE_STAGE_DEFINITIONS) {
      const cell = episode.cells.find((item) => item.stageId === stageDef.id);
      if (!cell || cell.status === "done") continue;
      const existingDelay = impacted.get(keyOf(episode.episodeId, stageDef.id))?.addedDelayHours ?? 0;
      let maxUpstreamDelay = existingDelay;
      for (const depId of stageDef.dependsOn) {
        const depImpact = impacted.get(keyOf(episode.episodeId, depId));
        if (depImpact) {
          // 선행 공정 슬랙을 초과한 지연분 + 최소 65% 전파(병렬 핸드오프 압박) 반영
          const propagated = Math.max(
            depImpact.addedDelayHours - Math.floor(STAGE_DEF_BY_ID[depId].defaultHours * 0.25),
            Math.ceil(depImpact.addedDelayHours * 0.65),
          );
          if (propagated > maxUpstreamDelay) {
            maxUpstreamDelay = propagated;
          }
        }
      }
      if (
        maxUpstreamDelay > existingDelay
        && !(episode.episodeId === sourceEpisode.episodeId && stageDef.id === sourceCell.stageId)
      ) {
        recordImpact(cell, maxUpstreamDelay, "dependency");
      }
    }
  };

  propagateIntraEpisode(sourceEpisode);

  // 자원 경합: 원천 회차에서 영향받은 담당자의 후속 회차 미완료 공정으로 파급
  for (let rowIndex = sourceEpIndex + 1; rowIndex < matrix.episodes.length; rowIndex += 1) {
    const nextEpisode = matrix.episodes[rowIndex];
    for (const cell of nextEpisode.cells) {
      if (cell.status === "done") continue;
      let matchingAssigneeDelay = 0;
      for (const prevImpact of impacted.values()) {
        if (
          prevImpact.episodeId === matrix.episodes[rowIndex - 1]?.episodeId
          && prevImpact.assigneeName === cell.assigneeName
        ) {
          matchingAssigneeDelay = Math.max(
            matchingAssigneeDelay,
            Math.max(0, Math.round(prevImpact.addedDelayHours * 0.6)),
          );
        }
      }
      if (matchingAssigneeDelay > 0) {
        recordImpact(cell, matchingAssigneeDelay, "resource_contention");
      }
    }
    propagateIntraEpisode(nextEpisode);
  }

  const impactedCells = [...impacted.values()];
  const episodeDeadlineSlips: EpisodeDeadlineSlip[] = matrix.episodes.map((ep) => {
    const deliveryImpact = impacted.get(keyOf(ep.episodeId, "pd_delivery"));
    const slipHours = deliveryImpact
      ? Math.max(0, deliveryImpact.addedDelayHours - Math.max(0, deliveryImpact.remainingSlackHours + deliveryImpact.addedDelayHours))
      : 0;
    const rawSlip = deliveryImpact ? Math.max(0, -deliveryImpact.remainingSlackHours) : 0;
    const effectiveSlip = Math.max(slipHours, rawSlip);
    return {
      episodeId: ep.episodeId,
      episodeNumber: ep.episodeNumber,
      slipHours: effectiveSlip,
      breachesDeadline: Boolean(deliveryImpact?.breachesDeadline),
    };
  });

  const breachedEpisodes = episodeDeadlineSlips.filter((item) => item.breachesDeadline);
  const riskLevel: DelayRippleReport["riskLevel"] =
    breachedEpisodes.length > 0 ? "critical" : impactedCells.length >= 4 ? "watch" : "stable";

  return {
    sourceEpisodeId: input.episodeId,
    sourceStageId: input.stageId,
    injectedDelayHours: delayHours,
    impactedCells,
    episodeDeadlineSlips,
    riskLevel,
    summaryKo:
      breachedEpisodes.length > 0
        ? `${sourceEpisode.episodeNumber}화 ${STAGE_DEF_BY_ID[input.stageId].labelKo} +${delayHours}h 지연 시 ${impactedCells.length}개 공정 파급 · ${breachedEpisodes.length}개 회차 마감 초과 위험`
        : `${sourceEpisode.episodeNumber}화 ${STAGE_DEF_BY_ID[input.stageId].labelKo} +${delayHours}h 지연 시 ${impactedCells.length}개 공정 파급 (버퍼 내 흡수 가능)`,
    summaryEn:
      breachedEpisodes.length > 0
        ? `+${delayHours}h delay on Ep.${sourceEpisode.episodeNumber} ${STAGE_DEF_BY_ID[input.stageId].labelEn} ripples to ${impactedCells.length} cells (${breachedEpisodes.length} deadlines breached).`
        : `+${delayHours}h delay on Ep.${sourceEpisode.episodeNumber} ${STAGE_DEF_BY_ID[input.stageId].labelEn} ripples to ${impactedCells.length} cells (absorbed within buffer).`,
  };
}

/** 병목 담당자 자동 탐지 및 동일 직군 여유 인력으로의 재배정 추천 */
export function detectPipelineBottlenecksAndRecommendations(
  matrix: MultiEpisodePipelineMatrix,
): PipelineBottleneckReport {
  const assignedHoursByMember = new Map<string, number>();
  const delayedHoursByMember = new Map<string, number>();

  for (const episode of matrix.episodes) {
    for (const cell of episode.cells) {
      if (cell.status === "done") continue;
      assignedHoursByMember.set(
        cell.assigneeId,
        (assignedHoursByMember.get(cell.assigneeId) ?? 0) + cell.remainingHours,
      );
      delayedHoursByMember.set(
        cell.assigneeId,
        (delayedHoursByMember.get(cell.assigneeId) ?? 0) + cell.delayedHours,
      );
    }
  }

  const bottlenecks: StageBottleneckItem[] = [];
  for (const member of matrix.roster) {
    const assigned = assignedHoursByMember.get(member.memberId) ?? 0;
    const delayed = delayedHoursByMember.get(member.memberId) ?? 0;
    const utilizationPercent =
      member.weeklyCapacityHours > 0 ? Math.round((assigned / member.weeklyCapacityHours) * 100) : 0;
    if (utilizationPercent >= 85 || delayed > 0) {
      bottlenecks.push({
        memberId: member.memberId,
        memberName: member.name,
        role: member.role,
        assignedHours: assigned,
        weeklyCapacityHours: member.weeklyCapacityHours,
        utilizationPercent,
        delayedHours: delayed,
        severity: utilizationPercent >= 100 || delayed >= 6 ? "critical" : "warning",
      });
    }
  }

  bottlenecks.sort((left, right) => right.utilizationPercent - left.utilizationPercent);

  const recommendations: ReassignmentRecommendation[] = [];
  for (const bottleneck of bottlenecks) {
    const candidates = matrix.roster
      .filter((member) => member.role === bottleneck.role && member.memberId !== bottleneck.memberId)
      .map((member) => ({
        member,
        freeHours: member.weeklyCapacityHours - (assignedHoursByMember.get(member.memberId) ?? 0),
      }))
      .filter((entry) => entry.freeHours >= 8)
      .sort((a, b) => b.freeHours - a.freeHours);

    const bestTarget = candidates[0];
    if (!bestTarget) continue;

    // 가장 급한 미완료 셀 1건을 재배정 대상으로 추천
    let targetCell: PipelineMatrixCell | null = null;
    for (const episode of matrix.episodes) {
      const found = episode.cells.find(
        (cell) =>
          cell.assigneeId === bottleneck.memberId
          && cell.status !== "done"
          && cell.remainingHours > 0,
      );
      if (found) {
        targetCell = found;
        break;
      }
    }
    if (!targetCell) continue;

    const recoverableHours = Math.min(targetCell.remainingHours, bestTarget.freeHours);
    const stageMeta = STAGE_DEF_BY_ID[targetCell.stageId];
    recommendations.push({
      recommendationId: `reassign-${targetCell.episodeId}-${targetCell.stageId}-${bestTarget.member.memberId}`,
      episodeId: targetCell.episodeId,
      stageId: targetCell.stageId,
      role: bottleneck.role,
      fromMemberId: bottleneck.memberId,
      fromMemberName: bottleneck.memberName,
      toMemberId: bestTarget.member.memberId,
      toMemberName: bestTarget.member.name,
      recoverableHours,
      rationaleKo: `${bottleneck.memberName}(부하 ${bottleneck.utilizationPercent}%)의 ${targetCell.episodeId.toUpperCase()} ${stageMeta.labelKo} 공정을 여유 인력 ${bestTarget.member.name}(여유 ${bestTarget.freeHours}h)에게 재배정하면 ${recoverableHours}시간 확보`,
      rationaleEn: `Reassign ${targetCell.episodeId.toUpperCase()} ${stageMeta.labelEn} from ${bottleneck.memberName} (${bottleneck.utilizationPercent}% load) to ${bestTarget.member.name} (${bestTarget.freeHours}h free) to recover ${recoverableHours}h.`,
    });
  }

  return { bottlenecks, recommendations };
}

/** 추천된 재배정을 실제 매트릭스 상태에 반영 */
export function applyReassignmentRecommendation(
  matrix: MultiEpisodePipelineMatrix,
  recommendation: ReassignmentRecommendation,
): MultiEpisodePipelineMatrix {
  return {
    ...matrix,
    episodes: matrix.episodes.map((episode) => {
      if (episode.episodeId !== recommendation.episodeId) return episode;
      return {
        ...episode,
        cells: episode.cells.map((cell) => {
          if (cell.stageId !== recommendation.stageId) return cell;
          return {
            ...cell,
            assigneeId: recommendation.toMemberId,
            assigneeName: recommendation.toMemberName,
            status: cell.status === "delayed" ? "in_progress" : cell.status,
            delayedHours: 0,
            slackHours: cell.slackHours + Math.round(recommendation.recoverableHours * 0.5),
          };
        }),
      };
    }),
  };
}
