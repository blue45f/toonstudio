/**
 * Wave 134 — 웹툰 주간 연재 마감 임계 경로법(CPM) 분석기.
 *
 * - 순환 의존성·미존재 작업/팀원·자격 외 배정을 fail-closed로 즉시 차단한다.
 * - 단일 작업자의 순차 수행 제약을 반영한 자원 인지 DAG(Disjunctive Resource-Aware CPM)로
 *   ES/EF/LS/LF/TotalFloat/CriticalPath, 마감 위험도, 팀원 과부하 및 최종 24시간 크런치를 산출한다.
 */

import {
  CRITICAL_PATH_FLOAT_EPSILON_HR,
  CRUNCH_WINDOW_HOURS,
  CRUNCH_WORK_SHARE_THRESHOLD,
  DEFAULT_SPEED_MULTIPLIER,
  ON_TRACK_MARGIN_THRESHOLD_HR,
  PRODUCTION_STAGE_PHASE,
  type BurnoutOverloadAlert,
  type CrunchWindowMetrics,
  type DeadlineStatus,
  type EpisodeCpmScheduleResult,
  type EpisodeScheduleInput,
  type MemberWorkloadSummary,
  type NormalizedStudioTeamMember,
  type ScheduleValidationError,
  type ScheduledEpisodeTask,
} from "./episode-schedule-types";
import {
  MAX_HOURS_CAP,
  MAX_UTILIZATION_RATIO_CAP,
  STAGE_ORDER_INDEX,
  clampFinite,
  computeTopologicalOrder,
  dedupeStrings,
  formatHrOneDecimal,
  normalizeAndValidateTasks,
  normalizeTeamMembers,
  roundClean,
  type NormalizedTaskInternal,
} from "./episode-schedule-validation";
import { computeScheduleManifestSha256Hex } from "./schedule-sha256-and-canonical";

export { computeScheduleManifestSha256Hex } from "./schedule-sha256-and-canonical";

function classifyDeadlineStatus(deadlineBudgetHr: number, makespanHr: number): DeadlineStatus {
  const marginHr = deadlineBudgetHr - makespanHr;
  if (marginHr < -CRITICAL_PATH_FLOAT_EPSILON_HR) return "late-risk-red";
  if (marginHr + CRITICAL_PATH_FLOAT_EPSILON_HR >= ON_TRACK_MARGIN_THRESHOLD_HR) return "on-track";
  return "tight-buffer";
}

function computeCrunchWindow(
  scheduledTasks: readonly ScheduledEpisodeTask[],
  deadlineBudgetHr: number,
  deadlineStatus: DeadlineStatus,
  totalEffectiveWorkHr: number,
): CrunchWindowMetrics {
  const windowStartHr =
    deadlineBudgetHr > CRUNCH_WINDOW_HOURS ? roundClean(deadlineBudgetHr - CRUNCH_WINDOW_HOURS) : 0;
  const windowEndHr = roundClean(deadlineBudgetHr);

  let workInFinal24hHr = 0;
  for (let i = 0; i < scheduledTasks.length; i += 1) {
    const task = scheduledTasks[i];
    if (!task) continue;
    const overlapStart = Math.max(task.earliestStartHr, windowStartHr);
    workInFinal24hHr += Math.max(0, task.earliestFinishHr - overlapStart);
  }

  const roundedWork = roundClean(workInFinal24hHr);
  const share =
    totalEffectiveWorkHr > CRITICAL_PATH_FLOAT_EPSILON_HR
      ? roundClean(roundedWork / totalEffectiveWorkHr)
      : 0;
  const eligibleForCrunch =
    deadlineBudgetHr > CRUNCH_WINDOW_HOURS || deadlineStatus !== "on-track";
  const detected =
    eligibleForCrunch &&
    totalEffectiveWorkHr > CRITICAL_PATH_FLOAT_EPSILON_HR &&
    share > CRUNCH_WORK_SHARE_THRESHOLD + 1e-9;

  return {
    windowStartHr,
    windowEndHr,
    workInFinal24hHr: roundedWork,
    totalEffectiveWorkHr: roundClean(totalEffectiveWorkHr),
    final24hWorkShare: share,
    thresholdShare: CRUNCH_WORK_SHARE_THRESHOLD,
    crunchBottleneckDetected: detected,
  };
}

function buildFailClosedResult(params: {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly deadlineBudgetHr: number;
  readonly cycleDetected: boolean;
  readonly cycleTaskIds: readonly string[];
  readonly validationErrors: readonly ScheduleValidationError[];
  readonly sanitizationWarnings: readonly string[];
  readonly members: readonly NormalizedStudioTeamMember[];
  readonly manifestSha256Hex: string;
}): EpisodeCpmScheduleResult {
  const emptyWorkloads: MemberWorkloadSummary[] = params.members.map((m) => ({
    memberId: m.memberId,
    nameKo: m.nameKo,
    eligibleStages: m.eligibleStages,
    speedMultiplier: m.speedMultiplier,
    maxHealthyHoursPerDay: m.maxHealthyHoursPerDay,
    availableDays: m.availableDays,
    healthyBudgetHr: m.healthyBudgetHr,
    assignedTaskCount: 0,
    assignedTaskIds: [],
    assignedBaseHours: 0,
    assignedEffectiveHours: 0,
    finishTimeHr: 0,
    overloadHours: 0,
    utilizationRatio: 0,
    isOverloaded: false,
  }));

  return {
    ok: false,
    episodeId: params.episodeId,
    episodeTitleKo: params.episodeTitleKo,
    deadlineBudgetHr: params.deadlineBudgetHr,
    cycleDetected: params.cycleDetected,
    cycleTaskIds: params.cycleTaskIds,
    validationErrors: params.validationErrors,
    sanitizationWarnings: params.sanitizationWarnings,
    topologicalOrderTaskIds: [],
    scheduledTasks: [],
    criticalPathTaskIds: [],
    projectMakespanHr: 0,
    unconstrainedDagMakespanHr: 0,
    deadlineMarginHr: params.deadlineBudgetHr,
    deadlineStatus: "late-risk-red",
    totalEffectiveWorkHr: 0,
    memberWorkloads: emptyWorkloads,
    maxMemberLoadHr: 0,
    minMemberLoadHr: 0,
    loadSpreadHr: 0,
    loadStdDevHr: 0,
    burnoutOverloadAlerts: [],
    crunchWindow: {
      windowStartHr: Math.max(0, roundClean(params.deadlineBudgetHr - CRUNCH_WINDOW_HOURS)),
      windowEndHr: params.deadlineBudgetHr,
      workInFinal24hHr: 0,
      totalEffectiveWorkHr: 0,
      final24hWorkShare: 0,
      thresholdShare: CRUNCH_WORK_SHARE_THRESHOLD,
      crunchBottleneckDetected: false,
    },
    crunchBottleneckDetected: false,
    manifestSha256Hex: params.manifestSha256Hex,
  };
}

function aggregateMemberWorkloads(
  members: readonly NormalizedStudioTeamMember[],
  scheduledTasks: readonly ScheduledEpisodeTask[],
): {
  readonly memberWorkloads: readonly MemberWorkloadSummary[];
  readonly burnoutOverloadAlerts: readonly BurnoutOverloadAlert[];
  readonly maxMemberLoadHr: number;
  readonly minMemberLoadHr: number;
  readonly loadSpreadHr: number;
  readonly loadStdDevHr: number;
} {
  const baseSum = new Map<string, number>();
  const effSum = new Map<string, number>();
  const finishMax = new Map<string, number>();
  const taskIdsByMember = new Map<string, string[]>();

  for (let i = 0; i < members.length; i += 1) {
    const m = members[i];
    if (!m) continue;
    baseSum.set(m.memberId, 0);
    effSum.set(m.memberId, 0);
    finishMax.set(m.memberId, 0);
    taskIdsByMember.set(m.memberId, []);
  }

  for (let i = 0; i < scheduledTasks.length; i += 1) {
    const t = scheduledTasks[i];
    if (!t) continue;
    baseSum.set(t.assignedMemberId, (baseSum.get(t.assignedMemberId) ?? 0) + t.estimatedBaseHours);
    effSum.set(t.assignedMemberId, (effSum.get(t.assignedMemberId) ?? 0) + t.effectiveDurationHr);
    finishMax.set(
      t.assignedMemberId,
      Math.max(finishMax.get(t.assignedMemberId) ?? 0, t.earliestFinishHr),
    );
    taskIdsByMember.get(t.assignedMemberId)?.push(t.taskId);
  }

  const memberWorkloads: MemberWorkloadSummary[] = [];
  const burnoutOverloadAlerts: BurnoutOverloadAlert[] = [];
  let maxMemberLoadHr = 0;
  let minMemberLoadHr = members.length > 0 ? Number.POSITIVE_INFINITY : 0;

  for (let i = 0; i < members.length; i += 1) {
    const m = members[i];
    if (!m) continue;
    const eff = roundClean(effSum.get(m.memberId) ?? 0);
    const base = roundClean(baseSum.get(m.memberId) ?? 0);
    const finish = roundClean(finishMax.get(m.memberId) ?? 0);
    const assignedIds = taskIdsByMember.get(m.memberId) ?? [];
    const overload = roundClean(Math.max(0, eff - m.healthyBudgetHr));
    const isOverloaded = overload > CRITICAL_PATH_FLOAT_EPSILON_HR;
    const utilizationRatio =
      m.healthyBudgetHr > CRITICAL_PATH_FLOAT_EPSILON_HR
        ? roundClean(Math.min(MAX_UTILIZATION_RATIO_CAP, eff / m.healthyBudgetHr))
        : eff > CRITICAL_PATH_FLOAT_EPSILON_HR
          ? MAX_UTILIZATION_RATIO_CAP
          : 0;

    maxMemberLoadHr = Math.max(maxMemberLoadHr, eff);
    minMemberLoadHr = Math.min(minMemberLoadHr, eff);

    memberWorkloads.push({
      memberId: m.memberId,
      nameKo: m.nameKo,
      eligibleStages: m.eligibleStages,
      speedMultiplier: m.speedMultiplier,
      maxHealthyHoursPerDay: m.maxHealthyHoursPerDay,
      availableDays: m.availableDays,
      healthyBudgetHr: m.healthyBudgetHr,
      assignedTaskCount: assignedIds.length,
      assignedTaskIds: assignedIds,
      assignedBaseHours: base,
      assignedEffectiveHours: eff,
      finishTimeHr: finish,
      overloadHours: overload,
      utilizationRatio,
      isOverloaded,
    });

    if (isOverloaded) {
      const severity = overload >= 8.0 || utilizationRatio >= 1.25 ? "critical" : "caution";
      burnoutOverloadAlerts.push({
        memberId: m.memberId,
        memberNameKo: m.nameKo,
        assignedEffectiveHours: eff,
        healthyBudgetHr: m.healthyBudgetHr,
        overloadHours: overload,
        utilizationRatio,
        severity,
        messageKo: `${m.nameKo} 예정 작업량(${formatHrOneDecimal(eff)}시간)이 주간 공정 건강 기준(${formatHrOneDecimal(m.healthyBudgetHr)}시간)을 ${formatHrOneDecimal(overload)}시간 초과합니다. 비잠금 공정의 분산 배정을 검토하세요.`,
      });
    }
  }

  if (!Number.isFinite(minMemberLoadHr)) minMemberLoadHr = 0;
  const loadSpreadHr = roundClean(Math.max(0, maxMemberLoadHr - minMemberLoadHr));
  let loadStdDevHr = 0;
  if (memberWorkloads.length > 0) {
    let mean = 0;
    for (let i = 0; i < memberWorkloads.length; i += 1) {
      mean += memberWorkloads[i]?.assignedEffectiveHours ?? 0;
    }
    mean /= memberWorkloads.length;
    let variance = 0;
    for (let i = 0; i < memberWorkloads.length; i += 1) {
      const diff = (memberWorkloads[i]?.assignedEffectiveHours ?? 0) - mean;
      variance += diff * diff;
    }
    loadStdDevHr = roundClean(Math.sqrt(variance / memberWorkloads.length));
  }

  return {
    memberWorkloads,
    burnoutOverloadAlerts,
    maxMemberLoadHr: roundClean(maxMemberLoadHr),
    minMemberLoadHr: roundClean(minMemberLoadHr),
    loadSpreadHr,
    loadStdDevHr,
  };
}

/**
 * 웹툰 5단계 공정 DAG 및 단일 작업자 순차 제약 기반 임계 경로(CPM)·마감/번아웃/크런치 분석을 실행한다.
 */
export function computeEpisodeCpmSchedule(input: EpisodeScheduleInput): EpisodeCpmScheduleResult {
  const episodeId = input.episodeId.trim().length > 0 ? input.episodeId.trim() : "episode-untitled";
  const episodeTitleKo =
    input.episodeTitleKo && input.episodeTitleKo.trim().length > 0
      ? input.episodeTitleKo.trim()
      : episodeId;

  const errors: ScheduleValidationError[] = [];
  const warnings: string[] = [];

  const deadlineInvalid = !Number.isFinite(input.deadlineBudgetHr) || input.deadlineBudgetHr < 0;
  const deadlineBudgetHr = roundClean(
    deadlineInvalid ? 0 : clampFinite(input.deadlineBudgetHr, 0, MAX_HOURS_CAP, 0),
  );
  if (deadlineInvalid || deadlineBudgetHr !== input.deadlineBudgetHr) {
    warnings.push(
      `마감 시간 예산(${String(input.deadlineBudgetHr)})을 ${deadlineBudgetHr}시간으로 보정했습니다.`,
    );
  }

  const { members, memberMap } = normalizeTeamMembers(input.teamMembers, errors, warnings);
  const { tasks, taskMap, selfCycleIds } = normalizeAndValidateTasks(
    input.tasks,
    memberMap,
    errors,
    warnings,
  );

  const manifestSha256Hex = computeScheduleManifestSha256Hex({
    deadlineBudgetHr,
    episodeId,
    episodeTitleKo,
    tasks,
    teamMembers: members,
  });

  const topo = computeTopologicalOrder(tasks, taskMap);
  const combinedCycleIds = dedupeStrings([...selfCycleIds, ...topo.cycleTaskIds]).slice().sort();
  const cycleDetected = combinedCycleIds.length > 0;
  if (cycleDetected) {
    errors.push({
      code: "CYCLE_DETECTED",
      detailKo: `공정 선후행 의존 그래프에서 순환 의존성이 검출되었습니다: ${combinedCycleIds.join(", ")}`,
    });
  }

  if (errors.length > 0) {
    return buildFailClosedResult({
      episodeId,
      episodeTitleKo,
      deadlineBudgetHr,
      cycleDetected,
      cycleTaskIds: combinedCycleIds,
      validationErrors: errors,
      sanitizationWarnings: warnings,
      members,
      manifestSha256Hex,
    });
  }

  // 1) 비제약 순수 DAG 기준 Makespan (참고 지표) 및 실효 소요시간
  const durationById = new Map<string, number>();
  const unconstrainedEf = new Map<string, number>();
  let unconstrainedDagMakespanHr = 0;

  for (let i = 0; i < topo.orderedIds.length; i += 1) {
    const taskId = topo.orderedIds[i];
    if (taskId === undefined) continue;
    const task = taskMap.get(taskId);
    if (!task) continue;
    const member = memberMap.get(task.assignedMemberId);
    const dur = roundClean(
      task.estimatedBaseHours / (member ? member.speedMultiplier : DEFAULT_SPEED_MULTIPLIER),
    );
    durationById.set(taskId, dur);

    let es = 0;
    for (let j = 0; j < task.dependsOnTaskIds.length; j += 1) {
      const depId = task.dependsOnTaskIds[j];
      if (depId !== undefined) es = Math.max(es, unconstrainedEf.get(depId) ?? 0);
    }
    const ef = roundClean(es + dur);
    unconstrainedEf.set(taskId, ef);
    unconstrainedDagMakespanHr = Math.max(unconstrainedDagMakespanHr, ef);
  }

  // 2) 단일 팀원 순차 수행 제약을 반영한 무순환 실행 순서 및 Forward Pass
  const remainingDeps = new Map<string, number>();
  const explicitSuccs = new Map<string, string[]>();
  const effectiveSuccsMap = new Map<string, string[]>();
  for (let i = 0; i < tasks.length; i += 1) {
    const t = tasks[i];
    if (!t) continue;
    remainingDeps.set(t.taskId, t.dependsOnTaskIds.length);
    explicitSuccs.set(t.taskId, []);
    effectiveSuccsMap.set(t.taskId, []);
  }
  for (let i = 0; i < tasks.length; i += 1) {
    const t = tasks[i];
    if (!t) continue;
    for (let j = 0; j < t.dependsOnTaskIds.length; j += 1) {
      const depId = t.dependsOnTaskIds[j];
      if (depId !== undefined) explicitSuccs.get(depId)?.push(t.taskId);
    }
  }

  const readyPool: NormalizedTaskInternal[] = tasks.filter(
    (t) => (remainingDeps.get(t.taskId) ?? 0) === 0,
  );
  const memberFreeAtHr = new Map<string, number>();
  const memberLastTask = new Map<string, string>();
  const execOrder: string[] = [];
  const earliestStartMap = new Map<string, number>();
  const earliestFinishMap = new Map<string, number>();
  const resourcePredMap = new Map<string, string | null>();

  const predReadyTime = (task: NormalizedTaskInternal): number => {
    let tMax = 0;
    for (let i = 0; i < task.dependsOnTaskIds.length; i += 1) {
      const depId = task.dependsOnTaskIds[i];
      if (depId !== undefined) tMax = Math.max(tMax, earliestFinishMap.get(depId) ?? 0);
    }
    return tMax;
  };

  while (readyPool.length > 0) {
    readyPool.sort((a, b) => {
      const predA = predReadyTime(a);
      const predB = predReadyTime(b);
      const candA = Math.max(predA, memberFreeAtHr.get(a.assignedMemberId) ?? 0);
      const candB = Math.max(predB, memberFreeAtHr.get(b.assignedMemberId) ?? 0);
      if (Math.abs(candA - candB) > CRITICAL_PATH_FLOAT_EPSILON_HR) return candA - candB;
      if (Math.abs(predA - predB) > CRITICAL_PATH_FLOAT_EPSILON_HR) return predA - predB;
      const stageDiff = STAGE_ORDER_INDEX[a.stage] - STAGE_ORDER_INDEX[b.stage];
      if (stageDiff !== 0) return stageDiff;
      const durDiff = (durationById.get(b.taskId) ?? 0) - (durationById.get(a.taskId) ?? 0);
      if (Math.abs(durDiff) > CRITICAL_PATH_FLOAT_EPSILON_HR) return durDiff;
      return a.taskId.localeCompare(b.taskId);
    });

    const current = readyPool.shift();
    if (!current) break;
    const pReady = predReadyTime(current);
    const mFree = memberFreeAtHr.get(current.assignedMemberId) ?? 0;
    const prevMemberTask = memberLastTask.get(current.assignedMemberId) ?? null;
    const es = roundClean(Math.max(pReady, mFree));
    const dur = durationById.get(current.taskId) ?? 0;
    const ef = roundClean(es + dur);

    execOrder.push(current.taskId);
    earliestStartMap.set(current.taskId, es);
    earliestFinishMap.set(current.taskId, ef);
    resourcePredMap.set(current.taskId, prevMemberTask);

    const effPreds =
      prevMemberTask !== null && !current.dependsOnTaskIds.includes(prevMemberTask)
        ? [...current.dependsOnTaskIds, prevMemberTask]
        : [...current.dependsOnTaskIds];
    for (let i = 0; i < effPreds.length; i += 1) {
      const predId = effPreds[i];
      if (predId !== undefined) effectiveSuccsMap.get(predId)?.push(current.taskId);
    }

    memberFreeAtHr.set(current.assignedMemberId, ef);
    memberLastTask.set(current.assignedMemberId, current.taskId);

    const nextIds = explicitSuccs.get(current.taskId) ?? [];
    for (let i = 0; i < nextIds.length; i += 1) {
      const nextId = nextIds[i];
      if (nextId === undefined) continue;
      const dec = (remainingDeps.get(nextId) ?? 0) - 1;
      remainingDeps.set(nextId, dec);
      if (dec === 0) {
        const nextTask = taskMap.get(nextId);
        if (nextTask) readyPool.push(nextTask);
      }
    }
  }

  // 3) Makespan 및 Backward Pass(LF, LS, Total Float, Free Float)
  let projectMakespanHr = 0;
  for (let i = 0; i < execOrder.length; i += 1) {
    const id = execOrder[i];
    if (id !== undefined) projectMakespanHr = Math.max(projectMakespanHr, earliestFinishMap.get(id) ?? 0);
  }
  projectMakespanHr = roundClean(projectMakespanHr);

  const latestStartMap = new Map<string, number>();
  const latestFinishMap = new Map<string, number>();
  for (let i = execOrder.length - 1; i >= 0; i -= 1) {
    const taskId = execOrder[i];
    if (taskId === undefined) continue;
    const succs = effectiveSuccsMap.get(taskId) ?? [];
    let lf = projectMakespanHr;
    for (let j = 0; j < succs.length; j += 1) {
      const succId = succs[j];
      if (succId !== undefined) lf = Math.min(lf, latestStartMap.get(succId) ?? projectMakespanHr);
    }
    const dur = durationById.get(taskId) ?? 0;
    latestFinishMap.set(taskId, roundClean(lf));
    latestStartMap.set(taskId, roundClean(lf - dur));
  }

  // 4) 최종 스케줄 조립 및 팀원 부하·크런치 산출
  const scheduledTasks: ScheduledEpisodeTask[] = [];
  const criticalPathTaskIds: string[] = [];
  let totalEffectiveWorkHr = 0;

  for (let i = 0; i < execOrder.length; i += 1) {
    const taskId = execOrder[i];
    if (taskId === undefined) continue;
    const task = taskMap.get(taskId);
    if (!task) continue;
    const member = memberMap.get(task.assignedMemberId);
    const es = earliestStartMap.get(taskId) ?? 0;
    const ef = earliestFinishMap.get(taskId) ?? 0;
    const ls = latestStartMap.get(taskId) ?? 0;
    const lf = latestFinishMap.get(taskId) ?? 0;
    const dur = durationById.get(taskId) ?? 0;

    const rawFloat = ls - es;
    const totalFloatHr =
      Math.abs(rawFloat) <= CRITICAL_PATH_FLOAT_EPSILON_HR ? 0 : roundClean(Math.max(0, rawFloat));
    const isCriticalPath = totalFloatHr <= CRITICAL_PATH_FLOAT_EPSILON_HR;
    if (isCriticalPath) criticalPathTaskIds.push(taskId);

    const succs = effectiveSuccsMap.get(taskId) ?? [];
    let minSuccEs = projectMakespanHr;
    for (let j = 0; j < succs.length; j += 1) {
      const succId = succs[j];
      if (succId !== undefined) minSuccEs = Math.min(minSuccEs, earliestStartMap.get(succId) ?? projectMakespanHr);
    }
    const rawFree = minSuccEs - ef;
    const freeFloatHr =
      Math.abs(rawFree) <= CRITICAL_PATH_FLOAT_EPSILON_HR ? 0 : roundClean(Math.max(0, rawFree));

    scheduledTasks.push({
      taskId: task.taskId,
      stage: task.stage,
      stagePhaseNumber: PRODUCTION_STAGE_PHASE[task.stage],
      cutRangeLabel: task.cutRangeLabel,
      estimatedBaseHours: task.estimatedBaseHours,
      effectiveDurationHr: dur,
      dependsOnTaskIds: task.dependsOnTaskIds,
      resourcePredecessorTaskId: resourcePredMap.get(taskId) ?? null,
      assignedMemberId: task.assignedMemberId,
      assignedMemberNameKo: member ? member.nameKo : task.assignedMemberId,
      lockedAssignment: task.lockedAssignment,
      earliestStartHr: es,
      earliestFinishHr: ef,
      latestStartHr: ls,
      latestFinishHr: lf,
      totalFloatHr,
      freeFloatHr,
      isCriticalPath,
    });
    totalEffectiveWorkHr += dur;
  }

  const workloadAgg = aggregateMemberWorkloads(members, scheduledTasks);
  const deadlineMarginHr = roundClean(deadlineBudgetHr - projectMakespanHr);
  const deadlineStatus = classifyDeadlineStatus(deadlineBudgetHr, projectMakespanHr);
  const crunchWindow = computeCrunchWindow(
    scheduledTasks,
    deadlineBudgetHr,
    deadlineStatus,
    totalEffectiveWorkHr,
  );

  return {
    ok: true,
    episodeId,
    episodeTitleKo,
    deadlineBudgetHr,
    cycleDetected: false,
    cycleTaskIds: [],
    validationErrors: [],
    sanitizationWarnings: warnings,
    topologicalOrderTaskIds: execOrder,
    scheduledTasks,
    criticalPathTaskIds,
    projectMakespanHr,
    unconstrainedDagMakespanHr: roundClean(unconstrainedDagMakespanHr),
    deadlineMarginHr,
    deadlineStatus,
    totalEffectiveWorkHr: roundClean(totalEffectiveWorkHr),
    ...workloadAgg,
    crunchWindow,
    crunchBottleneckDetected: crunchWindow.crunchBottleneckDetected,
    manifestSha256Hex,
  };
}
