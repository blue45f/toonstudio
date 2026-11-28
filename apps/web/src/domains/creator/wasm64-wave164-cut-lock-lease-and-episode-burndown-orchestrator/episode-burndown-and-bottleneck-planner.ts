/**
 * Wasm64 Wave 164 마감 번다운·병목 분석 및 어시스턴트 부하 재배정 플래너:
 * - 공정 간 선행 의존성(`line-art -> flat-color -> shading -> final-qa`, 병렬 `background-3d`/`lettering-sfx`)과
 *   어시스턴트 처리 속도를 결합한 결정론적 완료 예상 시간(Makespan) 시뮬레이터
 * - 이상선 vs 실제·예상 번다운 궤적, 공정별 잔여 물량·선행 대기 카운트, 마감 여유 및 위험 등급 산출
 * - 과부하 담당자에서 유휴 숙련 어시스턴트로의 구체적 컷 재배정 및 완료 시간 단축 증명(`hoursSaved > 0`)
 */

import {
  DEFAULT_STAGE_DEPENDENCIES,
  STUDIO_PRODUCTION_STAGES,
  STUDIO_STAGE_LABELS_KO,
  makeCutStageSlotKey,
  type AssistantCapacityProfile,
  type AssistantLoadSnapshot,
  type AssistantRebalanceMove,
  type AssistantRebalanceOptions,
  type AssistantRebalancePlan,
  type BurndownTimelinePoint,
  type CutLockLeaseState,
  type DeadlineRiskTier,
  type EpisodeBurndownInput,
  type EpisodeBurndownReport,
  type EpisodeCutStageWorkItem,
  type StageBacklogSummary,
  type StudioProductionStage,
} from "./cut-lock-burndown-types";

const STAGE_ORDER_INDEX: Readonly<Record<StudioProductionStage, number>> = {
  "line-art": 0,
  "background-3d": 1,
  "flat-color": 2,
  "lettering-sfx": 3,
  shading: 4,
  "final-qa": 5,
};

interface NormalizedWorkItem {
  readonly slotKey: string;
  readonly cutId: string;
  readonly stage: StudioProductionStage;
  readonly estimatedHours: number;
  readonly completedHours: number;
  readonly remainingHours: number;
  readonly assignedAssistantId: string | null;
  readonly dependsOnSlots: readonly string[];
  readonly priorityWeight: number;
}

interface ScheduleSimulationResult {
  readonly projectedFinishHours: number;
  readonly criticalPathHours: number;
  readonly assistantFinishHours: Readonly<Record<string, number>>;
  readonly assistantAssignedRemainingHours: Readonly<Record<string, number>>;
  readonly assistantAssignedTaskCount: Readonly<Record<string, number>>;
  readonly unstaffedStages: readonly StudioProductionStage[];
}

function round2(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min) return min;
  return value > max ? max : value;
}

function hasOwn(obj: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function computeAssistantRate(assistant: AssistantCapacityProfile, workdayHours: number): number {
  const availability = clamp(assistant.availabilityRatio ?? 1, 0.05, 1);
  const velocity = Math.max(0.25, Number.isFinite(assistant.velocityHoursPerDay) ? assistant.velocityHoursPerDay : 1);
  return (velocity * availability) / Math.max(1, workdayHours);
}

function getActiveLeaseHolderForSlot(
  leaseState: CutLockLeaseState | undefined,
  slotKey: string,
  nowMs: number | undefined,
): string | null {
  if (!leaseState || !hasOwn(leaseState.activeLeases, slotKey)) return null;
  const lease = leaseState.activeLeases[slotKey];
  if (nowMs !== undefined && nowMs >= lease.expiresAtMs) return null;
  return lease.holderId;
}

function normalizeWorkItems(
  workItems: readonly EpisodeCutStageWorkItem[],
  leaseState: CutLockLeaseState | undefined,
  nowMs: number | undefined,
): readonly NormalizedWorkItem[] {
  const presentByCut: Record<string, Record<string, boolean>> = {};
  for (let i = 0; i < workItems.length; i += 1) {
    const item = workItems[i];
    if (!hasOwn(presentByCut, item.cutId)) presentByCut[item.cutId] = {};
    presentByCut[item.cutId][item.stage] = true;
  }

  const normalized: NormalizedWorkItem[] = [];
  for (let i = 0; i < workItems.length; i += 1) {
    const item = workItems[i];
    const estimated = Math.max(0, Number.isFinite(item.estimatedHours) ? item.estimatedHours : 0);
    const completed = clamp(item.completedHours, 0, estimated);
    const remaining = round2(Math.max(0, estimated - completed));
    const slotKey = makeCutStageSlotKey(item.cutId, item.stage);
    const activeHolder = getActiveLeaseHolderForSlot(leaseState, slotKey, nowMs);
    const rawDeps = item.dependsOnStages ?? DEFAULT_STAGE_DEPENDENCIES[item.stage];
    const cutStages = presentByCut[item.cutId];
    const dependsOnSlots: string[] = [];
    for (let j = 0; j < rawDeps.length; j += 1) {
      const depStage = rawDeps[j];
      if (depStage !== item.stage && cutStages && hasOwn(cutStages, depStage)) {
        const depKey = makeCutStageSlotKey(item.cutId, depStage);
        if (!dependsOnSlots.includes(depKey)) dependsOnSlots.push(depKey);
      }
    }
    normalized.push({
      slotKey,
      cutId: item.cutId,
      stage: item.stage,
      estimatedHours: round2(estimated),
      completedHours: round2(completed),
      remainingHours: remaining,
      assignedAssistantId: item.assignedAssistantId ?? activeHolder ?? null,
      dependsOnSlots,
      priorityWeight: Number.isFinite(item.priorityWeight ?? 1) ? (item.priorityWeight ?? 1) : 1,
    });
  }

  return normalized.sort((a, b) =>
    a.cutId !== b.cutId
      ? a.cutId.localeCompare(b.cutId)
      : STAGE_ORDER_INDEX[a.stage] - STAGE_ORDER_INDEX[b.stage],
  );
}

function classifyDeadlineRiskTier(
  deadlineRemainingHours: number,
  projectedFinishHours: number,
  hasUnstaffedRemaining: boolean,
): DeadlineRiskTier {
  if (hasUnstaffedRemaining) return "deadline-breach";
  const margin = round2(deadlineRemainingHours - projectedFinishHours);
  if (margin < 0) return "deadline-breach";
  if (projectedFinishHours <= 0) return "on-track";
  const bufferRatio = deadlineRemainingHours > 0 ? margin / deadlineRemainingHours : 0;
  if (bufferRatio < 0.12 || margin < 2) return "at-risk";
  if (bufferRatio < 0.25 || margin < 6) return "tight-buffer";
  return "on-track";
}

function simulateEpisodeSchedule(
  normalizedItems: readonly NormalizedWorkItem[],
  assistants: readonly AssistantCapacityProfile[],
  workdayHours: number,
): ScheduleSimulationResult {
  const assistantMap: Record<string, AssistantCapacityProfile> = {};
  const rateByAssistant: Record<string, number> = {};
  const freeAtByAssistant: Record<string, number> = {};
  const assignedRemByAssistant: Record<string, number> = {};
  const assignedCountByAssistant: Record<string, number> = {};
  const sortedAssistants = [...assistants].sort((a, b) =>
    a.assistantId.localeCompare(b.assistantId),
  );

  for (let i = 0; i < sortedAssistants.length; i += 1) {
    const a = sortedAssistants[i];
    assistantMap[a.assistantId] = a;
    rateByAssistant[a.assistantId] = computeAssistantRate(a, workdayHours);
    freeAtByAssistant[a.assistantId] = 0;
    assignedRemByAssistant[a.assistantId] = 0;
    assignedCountByAssistant[a.assistantId] = 0;
  }

  const remainingItems = normalizedItems.filter((item) => item.remainingHours > 0);
  const remainingBySlot: Record<string, NormalizedWorkItem> = {};
  for (let i = 0; i < remainingItems.length; i += 1) {
    remainingBySlot[remainingItems[i].slotKey] = remainingItems[i];
  }

  const unstaffedSet: Record<string, boolean> = {};
  const finishAtBySlot: Record<string, number> = {};
  const criticalFinishBySlot: Record<string, number> = {};
  const scheduled: Record<string, boolean> = {};
  let scheduledCount = 0;

  while (scheduledCount < remainingItems.length) {
    const ready: NormalizedWorkItem[] = [];
    for (let i = 0; i < remainingItems.length; i += 1) {
      const item = remainingItems[i];
      if (hasOwn(scheduled, item.slotKey)) continue;
      let depsDone = true;
      for (let d = 0; d < item.dependsOnSlots.length; d += 1) {
        const depKey = item.dependsOnSlots[d];
        if (hasOwn(remainingBySlot, depKey) && !hasOwn(scheduled, depKey)) {
          depsDone = false;
          break;
        }
      }
      if (depsDone) ready.push(item);
    }

    if (ready.length === 0) {
      for (let i = 0; i < remainingItems.length; i += 1) {
        if (!hasOwn(scheduled, remainingItems[i].slotKey)) {
          ready.push(remainingItems[i]);
          break;
        }
      }
    }

    ready.sort((a, b) => {
      if (a.priorityWeight !== b.priorityWeight) return b.priorityWeight - a.priorityWeight;
      if (a.remainingHours !== b.remainingHours) return b.remainingHours - a.remainingHours;
      return a.slotKey.localeCompare(b.slotKey);
    });

    const chosen = ready[0];
    let depFinish = 0;
    let depCritical = 0;
    for (let d = 0; d < chosen.dependsOnSlots.length; d += 1) {
      const depKey = chosen.dependsOnSlots[d];
      if (hasOwn(finishAtBySlot, depKey)) {
        depFinish = Math.max(depFinish, finishAtBySlot[depKey]);
        depCritical = Math.max(depCritical, criticalFinishBySlot[depKey]);
      }
    }

    let chosenAssistantId: string | null = null;
    if (chosen.assignedAssistantId !== null && hasOwn(assistantMap, chosen.assignedAssistantId)) {
      chosenAssistantId = chosen.assignedAssistantId;
    } else {
      let bestEnd = Number.POSITIVE_INFINITY;
      for (let aIdx = 0; aIdx < sortedAssistants.length; aIdx += 1) {
        const cand = sortedAssistants[aIdx];
        if (!cand.skills.includes(chosen.stage)) continue;
        const candEnd =
          Math.max(freeAtByAssistant[cand.assistantId], depFinish) +
          chosen.remainingHours / rateByAssistant[cand.assistantId];
        if (candEnd < bestEnd - 1e-9) {
          bestEnd = candEnd;
          chosenAssistantId = cand.assistantId;
        }
      }
    }

    if (chosenAssistantId !== null) {
      const duration = chosen.remainingHours / rateByAssistant[chosenAssistantId];
      const endAt = Math.max(freeAtByAssistant[chosenAssistantId], depFinish) + duration;
      freeAtByAssistant[chosenAssistantId] = endAt;
      assignedRemByAssistant[chosenAssistantId] = round2(
        assignedRemByAssistant[chosenAssistantId] + chosen.remainingHours,
      );
      assignedCountByAssistant[chosenAssistantId] += 1;
      finishAtBySlot[chosen.slotKey] = endAt;
      criticalFinishBySlot[chosen.slotKey] = depCritical + duration;
    } else {
      unstaffedSet[chosen.stage] = true;
      const fallbackDuration = chosen.remainingHours / 0.5;
      finishAtBySlot[chosen.slotKey] = depFinish + fallbackDuration;
      criticalFinishBySlot[chosen.slotKey] = depCritical + fallbackDuration;
    }

    scheduled[chosen.slotKey] = true;
    scheduledCount += 1;
  }

  let projectedFinishHours = 0;
  let criticalPathHours = 0;
  const keys = Object.keys(finishAtBySlot);
  for (let i = 0; i < keys.length; i += 1) {
    projectedFinishHours = Math.max(projectedFinishHours, finishAtBySlot[keys[i]]);
    criticalPathHours = Math.max(criticalPathHours, criticalFinishBySlot[keys[i]]);
  }

  const roundedFinishByAssistant: Record<string, number> = {};
  for (let i = 0; i < sortedAssistants.length; i += 1) {
    const id = sortedAssistants[i].assistantId;
    roundedFinishByAssistant[id] = round2(freeAtByAssistant[id]);
  }

  return {
    projectedFinishHours: round2(projectedFinishHours),
    criticalPathHours: round2(criticalPathHours),
    assistantFinishHours: roundedFinishByAssistant,
    assistantAssignedRemainingHours: assignedRemByAssistant,
    assistantAssignedTaskCount: assignedCountByAssistant,
    unstaffedStages: STUDIO_PRODUCTION_STAGES.filter((stage) => hasOwn(unstaffedSet, stage)),
  };
}

function buildBurndownTimeline(
  input: EpisodeBurndownInput,
  totalEffortHours: number,
  remainingEffortHours: number,
  projectedFinishHours: number,
): readonly BurndownTimelinePoint[] {
  const elapsed = Math.max(0, Number.isFinite(input.elapsedHours) ? input.elapsedHours : 0);
  const deadlineRem = Math.max(0, Number.isFinite(input.deadlineRemainingHours) ? input.deadlineRemainingHours : 0);
  const totalWindow = Math.max(
    1,
    Number.isFinite(input.totalWindowHours) ? input.totalWindowHours : elapsed + deadlineRem,
    elapsed + deadlineRem,
  );
  const idealAt = (t: number): number => round2(totalEffortHours * Math.max(0, 1 - t / totalWindow));
  const makePt = (t: number, labelKo: string, actualRem: number, isProjected: boolean): BurndownTimelinePoint => {
    const ideal = idealAt(t);
    return {
      elapsedHours: t,
      labelKo,
      idealRemainingHours: ideal,
      actualRemainingHours: actualRem,
      varianceHours: round2(actualRem - ideal),
      isProjected,
    };
  };

  const points: BurndownTimelinePoint[] = [
    makePt(0, elapsed > 0 ? "착수" : "현재", round2(elapsed > 0 ? totalEffortHours : remainingEffortHours), false),
  ];

  if (input.historicalObservations && input.historicalObservations.length > 0) {
    const sorted = [...input.historicalObservations]
      .filter((pt) => Number.isFinite(pt.elapsedHours) && Number.isFinite(pt.actualRemainingHours))
      .sort((a, b) => a.elapsedHours - b.elapsedHours);
    for (let i = 0; i < sorted.length; i += 1) {
      const obs = sorted[i];
      if (obs.elapsedHours > 0 && obs.elapsedHours < elapsed) {
        const t = round2(obs.elapsedHours);
        points.push(makePt(t, `${t}h`, round2(clamp(obs.actualRemainingHours, 0, totalEffortHours)), false));
      }
    }
  } else if (elapsed >= 4) {
    points.push(
      makePt(round2(elapsed / 2), "중간 점검", round2(totalEffortHours - (totalEffortHours - remainingEffortHours) * 0.48), false),
    );
  }

  if (elapsed > 0) {
    points.push(makePt(round2(elapsed), "현재", round2(remainingEffortHours), false));
  }

  if (remainingEffortHours > 0 && projectedFinishHours > 0) {
    const deadlineAt = round2(elapsed + deadlineRem);
    const projectedEndAt = round2(elapsed + projectedFinishHours);
    if (projectedEndAt > deadlineAt + 0.05 && deadlineRem > 0) {
      const remAtDeadline = round2(remainingEffortHours * (1 - clamp(deadlineRem / projectedFinishHours, 0, 1)));
      points.push(makePt(deadlineAt, "마감 시점 예상", remAtDeadline, true));
    }
    points.push(makePt(projectedEndAt, "완료 예상", 0, true));
  }
  return points;
}

function buildStageBacklogs(
  input: EpisodeBurndownInput,
  normalizedItems: readonly NormalizedWorkItem[],
  remainingBySlot: Readonly<Record<string, number>>,
  workdayHours: number,
  deadlineRemainingHours: number,
  projectedFinishHours: number,
  riskTier: DeadlineRiskTier,
): readonly StageBacklogSummary[] {
  const raw = STUDIO_PRODUCTION_STAGES.map((stage) => {
    const items = normalizedItems.filter((item) => item.stage === stage);
    const totalCuts = items.length;
    let completedCuts = 0;
    let blockedByUpstreamCount = 0;
    let est = 0;
    let comp = 0;
    let rem = 0;
    let activeLeaseCount = 0;

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      est += item.estimatedHours;
      comp += item.completedHours;
      rem += item.remainingHours;
      if (item.remainingHours <= 0) {
        completedCuts += 1;
      } else if (item.dependsOnSlots.some((dep) => (remainingBySlot[dep] ?? 0) > 0)) {
        blockedByUpstreamCount += 1;
      }
      if (getActiveLeaseHolderForSlot(input.leaseState, item.slotKey, input.nowMs) !== null) {
        activeLeaseCount += 1;
      }
    }

    const skilled = input.assistants.filter((a) => a.skills.includes(stage));
    let stageVelocity = 0;
    for (let i = 0; i < skilled.length; i += 1) {
      stageVelocity += computeAssistantRate(skilled[i], workdayHours);
    }
    const projectedStageHours =
      rem <= 0 ? 0 : stageVelocity > 0 ? round2(rem / stageVelocity) : round2(rem / 0.5);

    return {
      stage,
      labelKo: STUDIO_STAGE_LABELS_KO[stage],
      totalCuts,
      completedCuts,
      activeLeaseCount,
      blockedByUpstreamCount,
      estimatedHours: round2(est),
      completedHours: round2(comp),
      remainingHours: round2(rem),
      skilledAssistantCount: skilled.length,
      stageVelocityHoursPerStudioHour: round2(stageVelocity),
      projectedStageHours,
    };
  });

  let maxStageProjected = 0;
  for (let i = 0; i < raw.length; i += 1) {
    maxStageProjected = Math.max(maxStageProjected, raw[i].projectedStageHours);
  }

  return raw.map((entry) => ({
    ...entry,
    isBottleneck:
      entry.remainingHours > 0 &&
      (entry.skilledAssistantCount === 0 ||
        entry.projectedStageHours >= deadlineRemainingHours * 0.75 ||
        (maxStageProjected > 0 &&
          entry.projectedStageHours >= maxStageProjected * 0.9 &&
          (riskTier !== "on-track" || entry.projectedStageHours >= projectedFinishHours * 0.65))),
  }));
}

function buildAssistantLoads(
  input: EpisodeBurndownInput,
  sim: ScheduleSimulationResult,
  workdayHours: number,
  deadlineRemainingHours: number,
): readonly AssistantLoadSnapshot[] {
  const sorted = [...input.assistants].sort((a, b) =>
    a.assistantId.localeCompare(b.assistantId),
  );
  let totalFinish = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    totalFinish += sim.assistantFinishHours[sorted[i].assistantId] ?? 0;
  }
  const avgFinish = sorted.length > 0 ? totalFinish / sorted.length : 0;

  return sorted.map((assistant) => {
    const finishH = sim.assistantFinishHours[assistant.assistantId] ?? 0;
    let activeLeaseCount = 0;
    if (input.leaseState) {
      const leaseKeys = Object.keys(input.leaseState.activeLeases);
      for (let i = 0; i < leaseKeys.length; i += 1) {
        const lease = input.leaseState.activeLeases[leaseKeys[i]];
        const alive = input.nowMs === undefined || input.nowMs < lease.expiresAtMs;
        if (lease.holderId === assistant.assistantId && alive) activeLeaseCount += 1;
      }
    }
    const utilizationRatio =
      deadlineRemainingHours > 0 ? round2(finishH / deadlineRemainingHours) : finishH > 0 ? 2 : 0;

    return {
      assistantId: assistant.assistantId,
      nameKo: assistant.nameKo,
      skills: [...assistant.skills],
      maxConcurrentLeases: assistant.maxConcurrentLeases,
      activeLeaseCount,
      assignedTaskCount: sim.assistantAssignedTaskCount[assistant.assistantId] ?? 0,
      assignedRemainingHours: sim.assistantAssignedRemainingHours[assistant.assistantId] ?? 0,
      ratePerStudioHour: round2(computeAssistantRate(assistant, workdayHours)),
      projectedFinishHours: finishH,
      utilizationRatio,
      isOverloaded:
        finishH > 0 &&
        (finishH > deadlineRemainingHours * 0.85 ||
          (avgFinish > 0 && finishH > avgFinish * 1.25 && finishH >= sim.projectedFinishHours * 0.85)),
      isIdle:
        finishH <= Math.max(0.5, avgFinish * 0.55) &&
        finishH < Math.max(deadlineRemainingHours * 0.6, sim.projectedFinishHours * 0.65),
    };
  });
}

/**
 * 회차의 전체·완료·잔여 작업 시간, 공정별 잔여/선행 대기, 이상선 vs 실제 번다운 궤적,
 * 예상 완료 시간, 마감 여유 및 위험 등급을 산출한다.
 */
export function computeEpisodeBurndownReport(
  input: EpisodeBurndownInput,
): EpisodeBurndownReport {
  const workdayHours = Math.max(1, input.workdayHours ?? 8);
  const normalizedItems = normalizeWorkItems(input.workItems, input.leaseState, input.nowMs);

  let totalEst = 0;
  let totalComp = 0;
  let totalRem = 0;
  const remainingBySlot: Record<string, number> = {};
  for (let i = 0; i < normalizedItems.length; i += 1) {
    const item = normalizedItems[i];
    totalEst += item.estimatedHours;
    totalComp += item.completedHours;
    totalRem += item.remainingHours;
    remainingBySlot[item.slotKey] = item.remainingHours;
  }

  const totalEffortHours = round2(totalEst);
  const completedEffortHours = round2(totalComp);
  const remainingEffortHours = round2(totalRem);
  const completionRatio =
    totalEffortHours > 0 ? round2(clamp(completedEffortHours / totalEffortHours, 0, 1)) : 1;

  const sim = simulateEpisodeSchedule(normalizedItems, input.assistants, workdayHours);
  const deadlineRemainingHours = round2(
    Math.max(0, Number.isFinite(input.deadlineRemainingHours) ? input.deadlineRemainingHours : 0),
  );
  const deadlineMarginHours = round2(deadlineRemainingHours - sim.projectedFinishHours);
  const riskTier = classifyDeadlineRiskTier(
    deadlineRemainingHours,
    sim.projectedFinishHours,
    sim.unstaffedStages.length > 0,
  );

  let teamVelocity = 0;
  for (let i = 0; i < input.assistants.length; i += 1) {
    teamVelocity += computeAssistantRate(input.assistants[i], workdayHours);
  }

  const stageBacklogs = buildStageBacklogs(
    input,
    normalizedItems,
    remainingBySlot,
    workdayHours,
    deadlineRemainingHours,
    sim.projectedFinishHours,
    riskTier,
  );

  return {
    episodeId: input.episodeId,
    episodeTitleKo: input.episodeTitleKo,
    totalEffortHours,
    completedEffortHours,
    remainingEffortHours,
    completionRatio,
    elapsedHours: round2(Math.max(0, input.elapsedHours)),
    totalWindowHours: round2(Math.max(1, input.totalWindowHours)),
    deadlineRemainingHours,
    workdayHours,
    effectiveTeamVelocityPerStudioHour: round2(teamVelocity),
    projectedFinishHours: sim.projectedFinishHours,
    criticalPathHours: sim.criticalPathHours,
    deadlineMarginHours,
    riskTier,
    bottleneckStages: stageBacklogs.filter((s) => s.isBottleneck).map((s) => s.stage),
    unstaffedStages: sim.unstaffedStages,
    stageBacklogs,
    assistantLoads: buildAssistantLoads(input, sim, workdayHours, deadlineRemainingHours),
    timeline: buildBurndownTimeline(input, totalEffortHours, remainingEffortHours, sim.projectedFinishHours),
  };
}

/**
 * 과부하 어시스턴트의 잔여 컷을 유휴 숙련 어시스턴트로 재배정해
 * 예상 완료 시간 단축(`hoursSaved > 0`)을 수학적으로 증명하는 재배정 계획을 생성한다.
 */
export function planAssistantRebalanceSuggestions(
  input: EpisodeBurndownInput,
  options?: AssistantRebalanceOptions,
): AssistantRebalancePlan {
  const maxSuggestions = Math.max(1, options?.maxSuggestions ?? 8);
  const minHoursSavedPerMove = Math.max(0.05, options?.minHoursSavedPerMove ?? 0.25);
  const respectActiveLeases = options?.respectActiveLeases ?? true;
  const workdayHours = Math.max(1, input.workdayHours ?? 8);

  const baselineReport = computeEpisodeBurndownReport(input);
  let workingItems: EpisodeCutStageWorkItem[] = input.workItems.map((item) => ({ ...item }));

  const assistantById: Record<string, AssistantCapacityProfile> = {};
  const sortedAssistants = [...input.assistants].sort((a, b) =>
    a.assistantId.localeCompare(b.assistantId),
  );
  for (let i = 0; i < sortedAssistants.length; i += 1) {
    assistantById[sortedAssistants[i].assistantId] = sortedAssistants[i];
  }

  let currentSim = simulateEpisodeSchedule(
    normalizeWorkItems(workingItems, input.leaseState, input.nowMs),
    sortedAssistants,
    workdayHours,
  );
  const suggestions: AssistantRebalanceMove[] = [];

  for (let step = 0; step < maxSuggestions; step += 1) {
    if (currentSim.projectedFinishHours <= 0) break;

    const bottleneckIds = sortedAssistants
      .map((a) => a.assistantId)
      .filter((id) => {
        const finish = currentSim.assistantFinishHours[id] ?? 0;
        return finish >= currentSim.projectedFinishHours - 0.05 && finish > 0;
      });
    if (bottleneckIds.length === 0) break;

    let bestMove: {
      readonly itemIndex: number; readonly fromId: string; readonly toId: string;
      readonly beforeHours: number; readonly afterHours: number; readonly saved: number;
      readonly remainingHours: number; readonly targetLoadBefore: number;
    } | null = null;

    for (let idx = 0; idx < workingItems.length; idx += 1) {
      const item = workingItems[idx];
      const est = Math.max(0, item.estimatedHours);
      const rem = round2(Math.max(0, est - clamp(item.completedHours, 0, est)));
      if (rem <= 0) continue;

      const activeHolder = getActiveLeaseHolderForSlot(input.leaseState, makeCutStageSlotKey(item.cutId, item.stage), input.nowMs);
      if (respectActiveLeases && activeHolder !== null) continue;
      const owner = item.assignedAssistantId ?? activeHolder;
      if (!owner || !bottleneckIds.includes(owner)) continue;

      for (let aIdx = 0; aIdx < sortedAssistants.length; aIdx += 1) {
        const cand = sortedAssistants[aIdx];
        if (cand.assistantId === owner || !cand.skills.includes(item.stage)) continue;
        const trialItems = workingItems.map((entry, eIdx) =>
          eIdx === idx ? { ...entry, assignedAssistantId: cand.assistantId } : entry,
        );
        const trialSim = simulateEpisodeSchedule(normalizeWorkItems(trialItems, input.leaseState, input.nowMs), sortedAssistants, workdayHours);
        const saved = round2(currentSim.projectedFinishHours - trialSim.projectedFinishHours);
        if (saved < minHoursSavedPerMove) continue;
        const targetLoadBefore = currentSim.assistantFinishHours[cand.assistantId] ?? 0;
        if (
          bestMove === null ||
          saved > bestMove.saved + 1e-6 ||
          (Math.abs(saved - bestMove.saved) <= 1e-6 && targetLoadBefore < bestMove.targetLoadBefore - 1e-6)
        ) {
          bestMove = {
            itemIndex: idx, fromId: owner, toId: cand.assistantId,
            beforeHours: currentSim.projectedFinishHours, afterHours: trialSim.projectedFinishHours,
            saved, remainingHours: rem, targetLoadBefore,
          };
        }
      }
    }

    if (bestMove === null) break;

    const moved = workingItems[bestMove.itemIndex];
    const fromName = assistantById[bestMove.fromId]?.nameKo ?? bestMove.fromId;
    const toName = assistantById[bestMove.toId]?.nameKo ?? bestMove.toId;
    const stageKo = STUDIO_STAGE_LABELS_KO[moved.stage];

    workingItems = workingItems.map((entry, eIdx) =>
      eIdx === bestMove.itemIndex ? { ...entry, assignedAssistantId: bestMove.toId } : entry,
    );
    currentSim = simulateEpisodeSchedule(
      normalizeWorkItems(workingItems, input.leaseState, input.nowMs),
      sortedAssistants,
      workdayHours,
    );

    suggestions.push({
      cutId: moved.cutId,
      stage: moved.stage,
      stageLabelKo: stageKo,
      remainingHours: bestMove.remainingHours,
      fromAssistantId: bestMove.fromId,
      fromAssistantNameKo: fromName,
      toAssistantId: bestMove.toId,
      toAssistantNameKo: toName,
      projectedBeforeHours: bestMove.beforeHours,
      projectedAfterHours: bestMove.afterHours,
      incrementalHoursSaved: bestMove.saved,
      rationaleKo: `${stageKo} 병목 해소를 위해 ${moved.cutId}(${stageKo}, 잔여 ${bestMove.remainingHours.toFixed(1)}h)를 ${fromName}에서 숙련 여유 인력 ${toName}로 재배정 — 완료 예상 ${bestMove.saved.toFixed(1)}h 단축`,
    });
  }

  const rebalancedFinish = currentSim.projectedFinishHours;
  return {
    baselineProjectedFinishHours: baselineReport.projectedFinishHours,
    rebalancedProjectedFinishHours: rebalancedFinish,
    hoursSaved: round2(Math.max(0, baselineReport.projectedFinishHours - rebalancedFinish)),
    baselineRiskTier: baselineReport.riskTier,
    rebalancedRiskTier: classifyDeadlineRiskTier(
      baselineReport.deadlineRemainingHours,
      rebalancedFinish,
      currentSim.unstaffedStages.length > 0,
    ),
    bottleneckStagesDetected: baselineReport.bottleneckStages,
    overloadedAssistantIds: baselineReport.assistantLoads
      .filter((load) => load.isOverloaded)
      .map((load) => load.assistantId),
    suggestions,
    rebalancedWorkItems: workingItems,
  };
}
