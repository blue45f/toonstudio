/**
 * Wave 134 — LPT(Longest Processing Time First) + MCT(Minimum Completion Time)
 * 어시스턴트 작업량 평준화 옵티마이저.
 *
 * - 잠금 작업(`lockedAssignment: true`)과 공정 자격(`eligibleStages`)을 엄격히 지킨다.
 * - 위상 준비 큐 기반 LPT+MCT 초기 배정 후 결정론적 1-이동 국소 개선과 단조 안전 검사를 수행한다.
 */

import { computeEpisodeCpmSchedule } from "./episode-deadline-cpm-solver";
import {
  CRITICAL_PATH_FLOAT_EPSILON_HR,
  DEFAULT_SPEED_MULTIPLIER,
  type EpisodeCpmScheduleResult,
  type EpisodeScheduleInput,
  type EpisodeTaskItem,
  type MemberWorkloadSummary,
  type RebalanceWorkloadOptions,
  type ScheduledEpisodeTask,
  type TaskReassignmentRecord,
  type WorkloadRebalanceResult,
} from "./episode-schedule-types";
import {
  MAX_HOURS_CAP,
  STAGE_ORDER_INDEX,
  clampFinite,
  dedupeStrings,
  roundClean,
} from "./episode-schedule-validation";

function totalOverloadHours(schedule: EpisodeCpmScheduleResult): number {
  let sum = 0;
  for (let i = 0; i < schedule.memberWorkloads.length; i += 1) {
    sum += schedule.memberWorkloads[i]?.overloadHours ?? 0;
  }
  return roundClean(sum);
}

function isStrictlyBetterSchedule(
  candidate: EpisodeCpmScheduleResult,
  baseline: EpisodeCpmScheduleResult,
): boolean {
  if (!candidate.ok) return false;
  if (candidate.projectMakespanHr < baseline.projectMakespanHr - CRITICAL_PATH_FLOAT_EPSILON_HR) {
    return true;
  }
  if (candidate.projectMakespanHr > baseline.projectMakespanHr + CRITICAL_PATH_FLOAT_EPSILON_HR) {
    return false;
  }
  const candOver = totalOverloadHours(candidate);
  const baseOver = totalOverloadHours(baseline);
  if (candOver < baseOver - CRITICAL_PATH_FLOAT_EPSILON_HR) return true;
  if (candOver > baseOver + CRITICAL_PATH_FLOAT_EPSILON_HR) return false;
  if (candidate.loadSpreadHr < baseline.loadSpreadHr - CRITICAL_PATH_FLOAT_EPSILON_HR) return true;
  if (candidate.loadSpreadHr > baseline.loadSpreadHr + CRITICAL_PATH_FLOAT_EPSILON_HR) return false;
  return candidate.loadStdDevHr < baseline.loadStdDevHr - CRITICAL_PATH_FLOAT_EPSILON_HR;
}

function selectMctCandidate(params: {
  readonly candidates: readonly MemberWorkloadSummary[];
  readonly baseHr: number;
  readonly pReady: number;
  readonly originalMemberId: string;
  readonly memberReadyAt: ReadonlyMap<string, number>;
  readonly memberLoadAcc: ReadonlyMap<string, number>;
  readonly remainingLockedByMember: ReadonlyMap<string, number>;
}): MemberWorkloadSummary | undefined {
  const {
    candidates,
    baseHr,
    pReady,
    originalMemberId,
    memberReadyAt,
    memberLoadAcc,
    remainingLockedByMember,
  } = params;

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    const cand = candidates[i];
    if (!best || !cand) continue;

    const durBest = baseHr / best.speedMultiplier;
    const durCand = baseHr / cand.speedMultiplier;
    const finishBest = Math.max(pReady, memberReadyAt.get(best.memberId) ?? 0) + durBest;
    const finishCand = Math.max(pReady, memberReadyAt.get(cand.memberId) ?? 0) + durCand;

    const loadBest =
      (memberLoadAcc.get(best.memberId) ?? 0) +
      (remainingLockedByMember.get(best.memberId) ?? 0) +
      durBest;
    const loadCand =
      (memberLoadAcc.get(cand.memberId) ?? 0) +
      (remainingLockedByMember.get(cand.memberId) ?? 0) +
      durCand;

    const overBest = Math.max(0, loadBest - best.healthyBudgetHr);
    const overCand = Math.max(0, loadCand - cand.healthyBudgetHr);

    if (finishCand < finishBest - CRITICAL_PATH_FLOAT_EPSILON_HR) {
      best = cand;
    } else if (Math.abs(finishCand - finishBest) <= CRITICAL_PATH_FLOAT_EPSILON_HR) {
      if (overCand < overBest - CRITICAL_PATH_FLOAT_EPSILON_HR) {
        best = cand;
      } else if (Math.abs(overCand - overBest) <= CRITICAL_PATH_FLOAT_EPSILON_HR) {
        if (loadCand < loadBest - CRITICAL_PATH_FLOAT_EPSILON_HR) {
          best = cand;
        } else if (Math.abs(loadCand - loadBest) <= CRITICAL_PATH_FLOAT_EPSILON_HR) {
          const candIsOrig = cand.memberId === originalMemberId;
          const bestIsOrig = best.memberId === originalMemberId;
          if (candIsOrig && !bestIsOrig) {
            best = cand;
          } else if (candIsOrig === bestIsOrig && cand.memberId.localeCompare(best.memberId) < 0) {
            best = cand;
          }
        }
      }
    }
  }
  return best;
}

function runLptMctInitialAssignment(
  input: EpisodeScheduleInput,
  beforeSchedule: EpisodeCpmScheduleResult,
): EpisodeTaskItem[] {
  const memberById = new Map<string, MemberWorkloadSummary>(
    beforeSchedule.memberWorkloads.map((m) => [m.memberId, m]),
  );
  const taskInputById = new Map<string, EpisodeTaskItem>();
  const remainingDeps = new Map<string, number>();
  const explicitSuccs = new Map<string, string[]>();
  const remainingLockedByMember = new Map<string, number>(
    beforeSchedule.memberWorkloads.map((m) => [m.memberId, 0]),
  );

  for (let i = 0; i < input.tasks.length; i += 1) {
    const raw = input.tasks[i];
    if (!raw) continue;
    const id = raw.taskId.trim();
    taskInputById.set(id, raw);
    const deps = dedupeStrings(raw.dependsOnTaskIds);
    remainingDeps.set(id, deps.length);
    explicitSuccs.set(id, []);
    if (raw.lockedAssignment) {
      const m = memberById.get(raw.assignedMemberId.trim());
      const speed = m ? m.speedMultiplier : DEFAULT_SPEED_MULTIPLIER;
      const baseHr = clampFinite(raw.estimatedBaseHours, 0, MAX_HOURS_CAP, 0);
      remainingLockedByMember.set(
        raw.assignedMemberId.trim(),
        (remainingLockedByMember.get(raw.assignedMemberId.trim()) ?? 0) + baseHr / speed,
      );
    }
  }

  for (let i = 0; i < input.tasks.length; i += 1) {
    const raw = input.tasks[i];
    if (!raw) continue;
    const id = raw.taskId.trim();
    const deps = dedupeStrings(raw.dependsOnTaskIds);
    for (let j = 0; j < deps.length; j += 1) {
      const depId = deps[j];
      if (depId !== undefined) explicitSuccs.get(depId)?.push(id);
    }
  }

  const tailRank = new Map<string, number>();
  for (let i = beforeSchedule.topologicalOrderTaskIds.length - 1; i >= 0; i -= 1) {
    const id = beforeSchedule.topologicalOrderTaskIds[i];
    if (id === undefined) continue;
    const raw = taskInputById.get(id);
    const baseHr = raw ? clampFinite(raw.estimatedBaseHours, 0, MAX_HOURS_CAP, 0) : 0;
    const succs = explicitSuccs.get(id) ?? [];
    let maxSuccTail = 0;
    for (let j = 0; j < succs.length; j += 1) {
      const succId = succs[j];
      if (succId !== undefined) maxSuccTail = Math.max(maxSuccTail, tailRank.get(succId) ?? 0);
    }
    tailRank.set(id, roundClean(baseHr + maxSuccTail));
  }

  const readyIds: string[] = [];
  for (let i = 0; i < input.tasks.length; i += 1) {
    const raw = input.tasks[i];
    if (!raw) continue;
    const id = raw.taskId.trim();
    if ((remainingDeps.get(id) ?? 0) === 0) readyIds.push(id);
  }

  const scheduledFinish = new Map<string, number>();
  const memberReadyAt = new Map<string, number>();
  const memberLoadAcc = new Map<string, number>();
  const assignedMemberByTask = new Map<string, string>();

  const taskPredReadyHr = (taskId: string): number => {
    const raw = taskInputById.get(taskId);
    if (!raw) return 0;
    let maxFinish = 0;
    for (let i = 0; i < raw.dependsOnTaskIds.length; i += 1) {
      const depId = raw.dependsOnTaskIds[i]?.trim();
      if (depId) maxFinish = Math.max(maxFinish, scheduledFinish.get(depId) ?? 0);
    }
    return maxFinish;
  };

  while (readyIds.length > 0) {
    readyIds.sort((idA, idB) => {
      const taskA = taskInputById.get(idA);
      const taskB = taskInputById.get(idB);
      if (!taskA || !taskB) return idA.localeCompare(idB);
      const readyA = taskPredReadyHr(idA);
      const readyB = taskPredReadyHr(idB);
      if (Math.abs(readyA - readyB) > CRITICAL_PATH_FLOAT_EPSILON_HR) return readyA - readyB;
      const lockDiff = (taskA.lockedAssignment ? 0 : 1) - (taskB.lockedAssignment ? 0 : 1);
      if (lockDiff !== 0) return lockDiff;
      const baseA = clampFinite(taskA.estimatedBaseHours, 0, MAX_HOURS_CAP, 0);
      const baseB = clampFinite(taskB.estimatedBaseHours, 0, MAX_HOURS_CAP, 0);
      if (Math.abs(baseB - baseA) > CRITICAL_PATH_FLOAT_EPSILON_HR) return baseB - baseA;
      const tailDiff = (tailRank.get(idB) ?? 0) - (tailRank.get(idA) ?? 0);
      if (Math.abs(tailDiff) > CRITICAL_PATH_FLOAT_EPSILON_HR) return tailDiff;
      const stageDiff = STAGE_ORDER_INDEX[taskA.stage] - STAGE_ORDER_INDEX[taskB.stage];
      return stageDiff !== 0 ? stageDiff : idA.localeCompare(idB);
    });

    const currentId = readyIds.shift();
    if (currentId === undefined) break;
    const task = taskInputById.get(currentId);
    if (!task) continue;

    const pReady = taskPredReadyHr(currentId);
    const baseHr = clampFinite(task.estimatedBaseHours, 0, MAX_HOURS_CAP, 0);
    const originalMemberId = task.assignedMemberId.trim();

    let chosenMemberId = originalMemberId;
    if (!task.lockedAssignment) {
      const allEligible = beforeSchedule.memberWorkloads.filter((m) =>
        m.eligibleStages.includes(task.stage),
      );
      const availableEligible = allEligible.filter(
        (m) => m.availableDays > CRITICAL_PATH_FLOAT_EPSILON_HR,
      );
      const candidates = availableEligible.length > 0 ? availableEligible : allEligible;
      const best = selectMctCandidate({
        candidates,
        baseHr,
        pReady,
        originalMemberId,
        memberReadyAt,
        memberLoadAcc,
        remainingLockedByMember,
      });
      if (best) chosenMemberId = best.memberId;
    }

    const chosenMember = memberById.get(chosenMemberId);
    const dur = roundClean(baseHr / (chosenMember ? chosenMember.speedMultiplier : 1));
    const finishHr = roundClean(Math.max(pReady, memberReadyAt.get(chosenMemberId) ?? 0) + dur);

    assignedMemberByTask.set(currentId, chosenMemberId);
    scheduledFinish.set(currentId, finishHr);
    memberReadyAt.set(chosenMemberId, finishHr);
    memberLoadAcc.set(chosenMemberId, (memberLoadAcc.get(chosenMemberId) ?? 0) + dur);
    if (task.lockedAssignment) {
      remainingLockedByMember.set(
        chosenMemberId,
        Math.max(0, (remainingLockedByMember.get(chosenMemberId) ?? 0) - dur),
      );
    }

    const nextIds = explicitSuccs.get(currentId) ?? [];
    for (let i = 0; i < nextIds.length; i += 1) {
      const nextId = nextIds[i];
      if (nextId === undefined) continue;
      const dec = (remainingDeps.get(nextId) ?? 0) - 1;
      remainingDeps.set(nextId, dec);
      if (dec === 0) readyIds.push(nextId);
    }
  }

  return input.tasks.map((t) => {
    const reassigned = assignedMemberByTask.get(t.taskId.trim());
    return reassigned && reassigned !== t.assignedMemberId.trim()
      ? { ...t, assignedMemberId: reassigned }
      : { ...t };
  });
}

/**
 * 동일 공정 자격(`eligibleStages`)을 가진 팀원 사이에서 비잠금 작업을
 * LPT(Longest Processing Time First) + MCT(Minimum Completion Time) 알고리즘으로 평준화한다.
 */
export function rebalanceAssistantWorkload(
  input: EpisodeScheduleInput,
  options: RebalanceWorkloadOptions = {},
): WorkloadRebalanceResult {
  const beforeSchedule = computeEpisodeCpmSchedule(input);

  if (!beforeSchedule.ok) {
    return {
      ok: false,
      improved: false,
      algorithm: "lpt-mct-dag",
      beforeSchedule,
      afterSchedule: beforeSchedule,
      rebalancedTasks: [...input.tasks],
      reassignments: [],
      beforeMakespanHr: beforeSchedule.projectMakespanHr,
      afterMakespanHr: beforeSchedule.projectMakespanHr,
      makespanSavedHr: 0,
      beforeLoadSpreadHr: beforeSchedule.loadSpreadHr,
      afterLoadSpreadHr: beforeSchedule.loadSpreadHr,
      loadSpreadReducedHr: 0,
      beforeOverloadCount: beforeSchedule.burnoutOverloadAlerts.length,
      afterOverloadCount: beforeSchedule.burnoutOverloadAlerts.length,
      deadlineRecovered: false,
      beforeManifestSha256Hex: beforeSchedule.manifestSha256Hex,
      afterManifestSha256Hex: beforeSchedule.manifestSha256Hex,
      rejectionReasons: beforeSchedule.validationErrors.map((err) => err.detailKo),
    };
  }

  if (input.tasks.length === 0) {
    return {
      ok: true,
      improved: false,
      algorithm: "lpt-mct-dag",
      beforeSchedule,
      afterSchedule: beforeSchedule,
      rebalancedTasks: [],
      reassignments: [],
      beforeMakespanHr: 0,
      afterMakespanHr: 0,
      makespanSavedHr: 0,
      beforeLoadSpreadHr: 0,
      afterLoadSpreadHr: 0,
      loadSpreadReducedHr: 0,
      beforeOverloadCount: 0,
      afterOverloadCount: 0,
      deadlineRecovered: false,
      beforeManifestSha256Hex: beforeSchedule.manifestSha256Hex,
      afterManifestSha256Hex: beforeSchedule.manifestSha256Hex,
      rejectionReasons: [],
    };
  }

  let bestTasks = runLptMctInitialAssignment(input, beforeSchedule);
  let bestSchedule = computeEpisodeCpmSchedule({ ...input, tasks: bestTasks });

  if (!isStrictlyBetterSchedule(bestSchedule, beforeSchedule)) {
    const tiedAll =
      Math.abs(bestSchedule.projectMakespanHr - beforeSchedule.projectMakespanHr) <=
        CRITICAL_PATH_FLOAT_EPSILON_HR &&
      Math.abs(totalOverloadHours(bestSchedule) - totalOverloadHours(beforeSchedule)) <=
        CRITICAL_PATH_FLOAT_EPSILON_HR &&
      Math.abs(bestSchedule.loadSpreadHr - beforeSchedule.loadSpreadHr) <=
        CRITICAL_PATH_FLOAT_EPSILON_HR;
    if (!tiedAll) {
      bestTasks = input.tasks.map((t) => ({ ...t }));
      bestSchedule = beforeSchedule;
    }
  }

  // 결정론적 1-이동 국소 개선
  const maxPasses = Math.max(0, Math.min(64, Math.floor(options.maxRefinementPasses ?? 24)));
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let bestMoveTasks: EpisodeTaskItem[] | null = null;
    let bestMoveSchedule: EpisodeCpmScheduleResult = bestSchedule;

    for (let i = 0; i < bestTasks.length; i += 1) {
      const task = bestTasks[i];
      if (!task || task.lockedAssignment) continue;
      const currentMemberId = task.assignedMemberId.trim();
      const eligibleMembers = beforeSchedule.memberWorkloads.filter(
        (m) =>
          m.memberId !== currentMemberId &&
          m.eligibleStages.includes(task.stage) &&
          m.availableDays > CRITICAL_PATH_FLOAT_EPSILON_HR,
      );

      for (let j = 0; j < eligibleMembers.length; j += 1) {
        const candidateMember = eligibleMembers[j];
        if (!candidateMember) continue;
        const nextTasks = bestTasks.slice();
        nextTasks[i] = { ...task, assignedMemberId: candidateMember.memberId };
        const evaluated = computeEpisodeCpmSchedule({ ...input, tasks: nextTasks });
        if (isStrictlyBetterSchedule(evaluated, bestMoveSchedule)) {
          bestMoveSchedule = evaluated;
          bestMoveTasks = nextTasks;
        }
      }
    }
    if (!bestMoveTasks) break;
    bestTasks = bestMoveTasks;
    bestSchedule = bestMoveSchedule;
  }

  const improved = isStrictlyBetterSchedule(bestSchedule, beforeSchedule);
  const finalTasks: EpisodeTaskItem[] = improved ? bestTasks : input.tasks.map((t) => ({ ...t }));
  const afterSchedule = improved ? bestSchedule : beforeSchedule;

  const beforeMap = new Map<string, ScheduledEpisodeTask>(
    beforeSchedule.scheduledTasks.map((t) => [t.taskId, t]),
  );
  const afterMap = new Map<string, ScheduledEpisodeTask>(
    afterSchedule.scheduledTasks.map((t) => [t.taskId, t]),
  );

  const reassignments: TaskReassignmentRecord[] = [];
  for (let i = 0; i < finalTasks.length; i += 1) {
    const finalTask = finalTasks[i];
    if (!finalTask) continue;
    const id = finalTask.taskId.trim();
    const beforeTask = beforeMap.get(id);
    const afterTask = afterMap.get(id);
    if (!beforeTask || !afterTask) continue;
    if (beforeTask.assignedMemberId !== afterTask.assignedMemberId) {
      reassignments.push({
        taskId: id,
        stage: afterTask.stage,
        cutRangeLabel: afterTask.cutRangeLabel,
        fromMemberId: beforeTask.assignedMemberId,
        fromMemberNameKo: beforeTask.assignedMemberNameKo,
        toMemberId: afterTask.assignedMemberId,
        toMemberNameKo: afterTask.assignedMemberNameKo,
        beforeDurationHr: beforeTask.effectiveDurationHr,
        afterDurationHr: afterTask.effectiveDurationHr,
      });
    }
  }

  return {
    ok: true,
    improved,
    algorithm: "lpt-mct-dag",
    beforeSchedule,
    afterSchedule,
    rebalancedTasks: finalTasks,
    reassignments,
    beforeMakespanHr: beforeSchedule.projectMakespanHr,
    afterMakespanHr: afterSchedule.projectMakespanHr,
    makespanSavedHr: roundClean(beforeSchedule.projectMakespanHr - afterSchedule.projectMakespanHr),
    beforeLoadSpreadHr: beforeSchedule.loadSpreadHr,
    afterLoadSpreadHr: afterSchedule.loadSpreadHr,
    loadSpreadReducedHr: roundClean(beforeSchedule.loadSpreadHr - afterSchedule.loadSpreadHr),
    beforeOverloadCount: beforeSchedule.burnoutOverloadAlerts.length,
    afterOverloadCount: afterSchedule.burnoutOverloadAlerts.length,
    deadlineRecovered:
      beforeSchedule.deadlineStatus === "late-risk-red" &&
      afterSchedule.deadlineStatus !== "late-risk-red",
    beforeManifestSha256Hex: beforeSchedule.manifestSha256Hex,
    afterManifestSha256Hex: afterSchedule.manifestSha256Hex,
    rejectionReasons: [],
  };
}
