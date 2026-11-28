/**
 * Wave 134 — 공정 입력 정규화, fail-closed 검증 및 Kahn 위상 정렬·순환 의존성 검출기.
 */

import {
  DEFAULT_MAX_HEALTHY_HOURS_PER_DAY,
  DEFAULT_SPEED_MULTIPLIER,
  MAX_SPEED_MULTIPLIER,
  MIN_SPEED_MULTIPLIER,
  PRODUCTION_STAGE_ORDER,
  type EpisodeTaskItem,
  type NormalizedStudioTeamMember,
  type ProductionStageId,
  type ScheduleValidationError,
  type StudioTeamMember,
} from "./episode-schedule-types";

export const STAGE_ORDER_INDEX: Readonly<Record<ProductionStageId, number>> = {
  "story-conti": 0,
  "bg3d-layout": 1,
  "lineart-ink": 2,
  "flat-color": 3,
  "shading-vfx": 4,
  "lettering-final-qa": 5,
};

export const MAX_HOURS_CAP = 100000;
export const MAX_DAYS_CAP = 365;
export const MAX_UTILIZATION_RATIO_CAP = 999;

export interface NormalizedTaskInternal {
  readonly taskId: string;
  readonly stage: ProductionStageId;
  readonly cutRangeLabel: string;
  readonly estimatedBaseHours: number;
  readonly dependsOnTaskIds: readonly string[];
  readonly assignedMemberId: string;
  readonly lockedAssignment: boolean;
}

export function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function roundClean(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1e9) / 1e9;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatHrOneDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0.0";
  const rounded = Math.round(value * 10) / 10;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(1);
}

export function dedupeStrings(items: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const cleaned = (items[i] ?? "").trim();
    if (cleaned.length > 0 && !seen.has(cleaned)) {
      seen.add(cleaned);
      out.push(cleaned);
    }
  }
  return out;
}

function dedupeStages(stages: readonly ProductionStageId[]): readonly ProductionStageId[] {
  const validSet = new Set<string>(PRODUCTION_STAGE_ORDER);
  const seen = new Set<ProductionStageId>();
  const out: ProductionStageId[] = [];
  for (let i = 0; i < stages.length; i += 1) {
    const s = stages[i];
    if (s !== undefined && validSet.has(s) && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export function normalizeTeamMembers(
  rawMembers: readonly StudioTeamMember[],
  errors: ScheduleValidationError[],
  warnings: string[],
): {
  readonly members: readonly NormalizedStudioTeamMember[];
  readonly memberMap: ReadonlyMap<string, NormalizedStudioTeamMember>;
} {
  const members: NormalizedStudioTeamMember[] = [];
  const memberMap = new Map<string, NormalizedStudioTeamMember>();

  for (let i = 0; i < rawMembers.length; i += 1) {
    const raw = rawMembers[i];
    if (!raw) continue;
    const memberId = raw.memberId.trim();
    if (memberId.length === 0) {
      errors.push({
        code: "INVALID_MEMBER_ID",
        detailKo: `인덱스 ${i} 팀원의 memberId가 비어 있습니다.`,
      });
      continue;
    }
    if (memberMap.has(memberId)) {
      errors.push({
        code: "DUPLICATE_MEMBER_ID",
        memberId,
        detailKo: `팀원 식별자(${memberId})가 중복 등록되었습니다.`,
      });
      continue;
    }

    const speedInvalid = !Number.isFinite(raw.speedMultiplier) || raw.speedMultiplier <= 0;
    const speedMultiplier = speedInvalid
      ? DEFAULT_SPEED_MULTIPLIER
      : clampFinite(
          raw.speedMultiplier,
          MIN_SPEED_MULTIPLIER,
          MAX_SPEED_MULTIPLIER,
          DEFAULT_SPEED_MULTIPLIER,
        );
    if (speedInvalid || speedMultiplier !== raw.speedMultiplier) {
      warnings.push(
        `팀원 ${memberId}의 속도 계수(${String(raw.speedMultiplier)})를 안전 범위 ${speedMultiplier}로 보정했습니다.`,
      );
    }

    const rawHealthy = raw.maxHealthyHoursPerDay;
    const healthyInvalid =
      rawHealthy !== undefined && (!Number.isFinite(rawHealthy) || rawHealthy <= 0);
    const maxHealthyHoursPerDay =
      rawHealthy === undefined || healthyInvalid
        ? DEFAULT_MAX_HEALTHY_HOURS_PER_DAY
        : clampFinite(rawHealthy, 1, 24, DEFAULT_MAX_HEALTHY_HOURS_PER_DAY);
    if (healthyInvalid || (rawHealthy !== undefined && maxHealthyHoursPerDay !== rawHealthy)) {
      warnings.push(
        `팀원 ${memberId}의 일 건강 작업 한계(${String(rawHealthy)})를 ${maxHealthyHoursPerDay}시간으로 보정했습니다.`,
      );
    }

    const daysInvalid = !Number.isFinite(raw.availableDays) || raw.availableDays < 0;
    const availableDays = daysInvalid ? 0 : clampFinite(raw.availableDays, 0, MAX_DAYS_CAP, 0);
    if (daysInvalid || availableDays !== raw.availableDays) {
      warnings.push(
        `팀원 ${memberId}의 가용 일수(${String(raw.availableDays)})를 ${availableDays}일로 보정했습니다.`,
      );
    }

    const normalized: NormalizedStudioTeamMember = {
      memberId,
      nameKo: raw.nameKo.trim().length > 0 ? raw.nameKo.trim() : memberId,
      eligibleStages: dedupeStages(raw.eligibleStages),
      speedMultiplier: roundClean(speedMultiplier),
      maxHealthyHoursPerDay: roundClean(maxHealthyHoursPerDay),
      availableDays: roundClean(availableDays),
      healthyBudgetHr: roundClean(maxHealthyHoursPerDay * availableDays),
    };
    members.push(normalized);
    memberMap.set(memberId, normalized);
  }

  return { members, memberMap };
}

export function normalizeAndValidateTasks(
  rawTasks: readonly EpisodeTaskItem[],
  memberMap: ReadonlyMap<string, NormalizedStudioTeamMember>,
  errors: ScheduleValidationError[],
  warnings: string[],
): {
  readonly tasks: readonly NormalizedTaskInternal[];
  readonly taskMap: ReadonlyMap<string, NormalizedTaskInternal>;
  readonly selfCycleIds: readonly string[];
} {
  const tasks: NormalizedTaskInternal[] = [];
  const taskMap = new Map<string, NormalizedTaskInternal>();
  const selfCycleIds: string[] = [];

  for (let i = 0; i < rawTasks.length; i += 1) {
    const raw = rawTasks[i];
    if (!raw) continue;
    const taskId = raw.taskId.trim();
    if (taskId.length === 0) {
      errors.push({
        code: "INVALID_TASK_ID",
        detailKo: `인덱스 ${i} 작업의 taskId가 비어 있습니다.`,
      });
      continue;
    }
    if (taskMap.has(taskId)) {
      errors.push({
        code: "DUPLICATE_TASK_ID",
        taskId,
        detailKo: `작업 식별자(${taskId})가 중복 등록되었습니다.`,
      });
      continue;
    }

    const hoursInvalid = !Number.isFinite(raw.estimatedBaseHours) || raw.estimatedBaseHours < 0;
    const estimatedBaseHours = hoursInvalid
      ? 0
      : clampFinite(raw.estimatedBaseHours, 0, MAX_HOURS_CAP, 0);
    if (hoursInvalid || estimatedBaseHours !== raw.estimatedBaseHours) {
      warnings.push(
        `작업 ${taskId}의 기준 공수(${String(raw.estimatedBaseHours)})를 ${estimatedBaseHours}시간으로 보정했습니다.`,
      );
    }

    const assignedMemberId = raw.assignedMemberId.trim();
    const member = memberMap.get(assignedMemberId);
    if (!member) {
      errors.push({
        code: "UNKNOWN_MEMBER",
        taskId,
        memberId: assignedMemberId,
        detailKo: `작업 ${taskId}에 지정된 팀원(${assignedMemberId || "미지정"})을 찾을 수 없습니다.`,
      });
    } else if (!member.eligibleStages.includes(raw.stage)) {
      errors.push({
        code: "INELIGIBLE_STAGE_ASSIGNMENT",
        taskId,
        memberId: assignedMemberId,
        detailKo: `팀원 ${member.nameKo}(${assignedMemberId})은(는) ${raw.stage} 공정 자격이 없습니다.`,
      });
    }

    const deps = dedupeStrings(raw.dependsOnTaskIds);
    if (deps.includes(taskId)) {
      selfCycleIds.push(taskId);
    }

    const normalized: NormalizedTaskInternal = {
      taskId,
      stage: raw.stage,
      cutRangeLabel: raw.cutRangeLabel.trim().length > 0 ? raw.cutRangeLabel.trim() : taskId,
      estimatedBaseHours: roundClean(estimatedBaseHours),
      dependsOnTaskIds: deps,
      assignedMemberId,
      lockedAssignment: Boolean(raw.lockedAssignment),
    };
    tasks.push(normalized);
    taskMap.set(taskId, normalized);
  }

  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    if (!task) continue;
    for (let j = 0; j < task.dependsOnTaskIds.length; j += 1) {
      const depId = task.dependsOnTaskIds[j];
      if (depId !== undefined && !taskMap.has(depId)) {
        errors.push({
          code: "MISSING_DEPENDENCY",
          taskId: task.taskId,
          detailKo: `작업 ${task.taskId}의 선행 의존 작업(${depId})이 존재하지 않습니다.`,
        });
      }
    }
  }

  return { tasks, taskMap, selfCycleIds };
}

export function computeTopologicalOrder(
  tasks: readonly NormalizedTaskInternal[],
  taskMap: ReadonlyMap<string, NormalizedTaskInternal>,
): {
  readonly orderedIds: readonly string[];
  readonly cycleTaskIds: readonly string[];
} {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (let i = 0; i < tasks.length; i += 1) {
    const t = tasks[i];
    if (!t) continue;
    inDegree.set(t.taskId, 0);
    dependents.set(t.taskId, []);
  }

  for (let i = 0; i < tasks.length; i += 1) {
    const t = tasks[i];
    if (!t) continue;
    let degree = 0;
    for (let j = 0; j < t.dependsOnTaskIds.length; j += 1) {
      const depId = t.dependsOnTaskIds[j];
      if (depId !== undefined && taskMap.has(depId)) {
        degree += 1;
        dependents.get(depId)?.push(t.taskId);
      }
    }
    inDegree.set(t.taskId, degree);
  }

  const ready: NormalizedTaskInternal[] = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const t = tasks[i];
    if (t && (inDegree.get(t.taskId) ?? 0) === 0) ready.push(t);
  }

  const orderedIds: string[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => {
      const stageDiff = STAGE_ORDER_INDEX[a.stage] - STAGE_ORDER_INDEX[b.stage];
      return stageDiff !== 0 ? stageDiff : a.taskId.localeCompare(b.taskId);
    });
    const current = ready.shift();
    if (!current) break;
    orderedIds.push(current.taskId);

    const nextIds = dependents.get(current.taskId) ?? [];
    for (let i = 0; i < nextIds.length; i += 1) {
      const nextId = nextIds[i];
      if (nextId === undefined) continue;
      const updated = (inDegree.get(nextId) ?? 0) - 1;
      inDegree.set(nextId, updated);
      if (updated === 0) {
        const nextTask = taskMap.get(nextId);
        if (nextTask) ready.push(nextTask);
      }
    }
  }

  if (orderedIds.length < tasks.length) {
    const visited = new Set<string>(orderedIds);
    const cycleTaskIds = tasks
      .filter((t) => !visited.has(t.taskId))
      .map((t) => t.taskId)
      .sort();
    return { orderedIds, cycleTaskIds };
  }

  return { orderedIds, cycleTaskIds: [] };
}
