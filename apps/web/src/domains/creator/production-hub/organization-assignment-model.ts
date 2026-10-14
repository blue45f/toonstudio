import type {
  ProductionProjectAggregate,
  ProductionRoleType,
  ProductionTask,
} from "@toonstudio/core/production";

/**
 * 조직 대시보드 — 배정 단위 집계와 주간 재배분 리포트.
 *
 * 원자 단위 전환: 작품 진척(%)을 직접 세지 않고, 배정(누가·무엇을·언제까지·몇 시간)을
 * 원자로 삼아 작품·장르·사람 집계를 전부 이 단위에서 도출한다.
 *
 * 근거(체크리스트 항목):
 * - Boxel Studio: ShotGrid 파이프라인으로 샷/태스크 단위 배정을 추적해 스케일을 만든 사례.
 * - 케나즈: 장르별 서브스튜디오(클러스터) 단위 운영 — 장르 클러스터 집계를 함께 제공한다.
 * - 와이랩 시스템화 반성: 관리 지표만으로는 기획 감도를 못 본다 — 기획 감도 지표는
 *   관리 지표와 분리된 슬롯으로 두고, 측정원이 없으면 지어내지 않고 not-instrumented로 둔다.
 *
 * 정직성 규칙:
 * - 닫힌 작업(approved/done/cancelled/out-of-scope)은 배정 단위에서 제외한다.
 * - 견적이 없는 작업은 0시간으로 지어내지 않고 estimateKnown=false로 표시해 시간 합계에서 빼고 따로 센다.
 * - 여러 명에게 배정된 작업의 시간은 배정자 수로 균등 분할한다(부하 추정용 규칙, 화면 각주에 명시).
 * - 가용 시간(용량)은 ResourceCalendar.weeklyHours가 정본이다. 달력이 없는 배정은
 *   기본값(DEFAULT_WEEKLY_CAPACITY_HOURS)을 쓰되 capacitySource="default"로 구분한다.
 * - 기획 감도(파일럿 반응·기획 리드타임)는 서버 측정원이 아직 없어 입력 계약만 둔다.
 *   입력이 없으면 status="not-instrumented"이고 수치는 전부 null이다.
 */

export const DEFAULT_WEEKLY_CAPACITY_HOURS = 40;
/** 부하율이 이 값 이상이면 '여유 없음(tight)'으로 본다. 1을 넘으면 과배정이다. */
export const TIGHT_LOAD_RATIO = 0.85;

const CLOSED_STATUSES: ReadonlySet<ProductionTask["status"]> = new Set([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);

/** 아직 시작 전이라 재배분이 가능한 상태. 진행 중·검수 중 작업은 재배분 후보에서 제외한다. */
const MOVABLE_STATUSES: ReadonlySet<ProductionTask["status"]> = new Set([
  "draft",
  "needs-input",
  "ready",
]);

export interface OrgAssignmentUnit {
  readonly unitId: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly processKey: string;
  readonly status: ProductionTask["status"];
  /** 배정(assignment) id. 미배정 작업이면 null. */
  readonly assignmentId: string | null;
  /** 담당자(party) id. 미배정 작업이면 null. */
  readonly assigneePartyId: string | null;
  readonly assigneeName: string | null;
  /** 담당자의 역할 배정(roleType). 미배정이면 null. */
  readonly roleType: ProductionRoleType | null;
  /** 공정 단계가 요구하는 역할(workflowProfile step의 defaultRole). 프로필이 없으면 null. */
  readonly requiredRole: ProductionRoleType | null;
  readonly dueAt: string | null;
  /** 이 담당자에게 귀속되는 잔여 시간(다인 배정은 균등 분할). 견적이 없으면 null. */
  readonly remainingHours: number | null;
  readonly estimateKnown: boolean;
  readonly overdue: boolean;
  /** 요구 역할과 담당자 역할이 다르면 true. 요구 역할을 모르면 false(판정 불가 ≠ 미스매치). */
  readonly roleMismatch: boolean;
}

export interface OrgPersonWeekLoad {
  readonly partyId: string;
  readonly displayName: string;
  readonly loadHours: number;
  readonly capacityHours: number;
  readonly capacitySource: "calendar" | "default";
  readonly loadRatio: number;
  readonly state: "over" | "tight" | "ok";
  readonly unitCount: number;
  readonly overdueCount: number;
}

export interface OrgRebalanceSuggestion {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly fromPartyId: string | null;
  readonly fromName: string | null;
  readonly toPartyId: string;
  readonly toName: string;
  readonly hours: number | null;
  readonly reason: "over-allocation" | "role-mismatch" | "unassigned";
}

export interface OrgWeeklyRebalanceReport {
  readonly weekStartAt: string;
  readonly weekEndAt: string;
  readonly units: readonly OrgAssignmentUnit[];
  readonly personLoads: readonly OrgPersonWeekLoad[];
  readonly overAllocated: readonly OrgPersonWeekLoad[];
  readonly mismatches: readonly OrgAssignmentUnit[];
  readonly unassignedUnits: readonly OrgAssignmentUnit[];
  readonly unknownEstimateCount: number;
  readonly suggestions: readonly OrgRebalanceSuggestion[];
}

export interface OrgProjectProgress {
  readonly projectId: string;
  readonly title: string;
  /** 완료 견적 시간 / 전체 견적 시간. 견적이 전혀 없으면 null(퍼센트를 지어내지 않는다). */
  readonly progressPercent: number | null;
  readonly openUnitCount: number;
  readonly overdueUnitCount: number;
  readonly remainingHours: number;
}

export interface OrgGenreCluster {
  readonly genreKey: string;
  readonly projectCount: number;
  readonly projectTitles: readonly string[];
  readonly openUnitCount: number;
  readonly remainingHours: number;
  readonly overdueUnitCount: number;
}

/** 기획 감도 지표의 입력 계약. 측정원이 연결되기 전까지는 호출자가 빈 배열을 넘긴다. */
export interface PlanningSensitivityInput {
  readonly projectId: string;
  /** 파일럿(시범 공개) 반응 점수 0–100. 측정 전이면 null. */
  readonly pilotReactionScore: number | null;
  readonly pilotResponseCount: number | null;
  /** 기획 착수→제작 착수까지의 리드타임(일). 측정 전이면 null. */
  readonly planningLeadTimeDays: number | null;
  readonly measuredAt: string | null;
}

export interface PlanningSensitivitySlot {
  readonly projectId: string;
  readonly title: string;
  readonly status: "measured" | "not-instrumented";
  readonly pilotReactionScore: number | null;
  readonly pilotResponseCount: number | null;
  readonly planningLeadTimeDays: number | null;
  readonly measuredAt: string | null;
}

/** 월요일 00:00 UTC부터 다음 월요일 00:00 UTC까지를 한 주로 본다. */
export function isoWeekWindow(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = start.getUTCDay(); // 0=일요일
  const shift = day === 0 ? -6 : 1 - day;
  start.setUTCDate(start.getUTCDate() + shift);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  return { start, end };
}

function taskRemainingHours(task: ProductionTask): number | null {
  if (task.remainingEstimateHours != null && Number.isFinite(task.remainingEstimateHours)) {
    return task.remainingEstimateHours;
  }
  if (task.estimateHours && Number.isFinite(task.estimateHours.likely)) return task.estimateHours.likely;
  return null;
}

function requiredRoleFor(aggregate: ProductionProjectAggregate, processKey: string): ProductionRoleType | null {
  const step = aggregate.workflowProfile?.steps.find((item) => item.key === processKey);
  return step?.defaultRole ?? null;
}

function latestGenreKeys(aggregate: ProductionProjectAggregate): readonly string[] {
  let best: ProductionProjectAggregate["projectBriefs"][number] | undefined;
  for (const brief of aggregate.projectBriefs) {
    if (!best || brief.revision > best.revision) best = brief;
  }
  return best?.genreKeys ?? [];
}

/** 프로젝트 애그리게이트들을 배정 단위 목록으로 편다. 닫힌 작업은 제외한다. */
export function buildAssignmentUnits(
  aggregates: readonly ProductionProjectAggregate[],
  now: Date,
): OrgAssignmentUnit[] {
  const nowMs = now.getTime();
  const units: OrgAssignmentUnit[] = [];
  for (const aggregate of aggregates) {
    const assignmentById = new Map(aggregate.assignments.map((item) => [item.id, item]));
    const partyById = new Map(aggregate.parties.map((item) => [item.id, item]));
    for (const task of aggregate.tasks) {
      if (CLOSED_STATUSES.has(task.status)) continue;
      const requiredRole = requiredRoleFor(aggregate, task.processKey);
      const totalHours = taskRemainingHours(task);
      const overdue = task.dueAt != null && Date.parse(task.dueAt) < nowMs;
      const base = {
        projectId: aggregate.projectId,
        projectTitle: aggregate.title,
        taskId: task.id,
        taskTitle: task.title,
        processKey: task.processKey,
        status: task.status,
        requiredRole,
        dueAt: task.dueAt,
        overdue,
      };
      if (task.assignmentIds.length === 0) {
        units.push({
          ...base,
          unitId: `${task.id}:unassigned`,
          assignmentId: null,
          assigneePartyId: null,
          assigneeName: null,
          roleType: null,
          remainingHours: totalHours,
          estimateKnown: totalHours != null,
          roleMismatch: false,
        });
        continue;
      }
      const share = totalHours == null ? null : totalHours / task.assignmentIds.length;
      for (const assignmentId of task.assignmentIds) {
        const assignment = assignmentById.get(assignmentId);
        const party = assignment ? partyById.get(assignment.partyId) : undefined;
        units.push({
          ...base,
          unitId: `${task.id}:${assignmentId}`,
          assignmentId,
          assigneePartyId: assignment?.partyId ?? null,
          assigneeName: party?.publicDisplayName ?? null,
          roleType: assignment?.roleType ?? null,
          remainingHours: share,
          estimateKnown: totalHours != null,
          roleMismatch:
            requiredRole != null && assignment != null && assignment.roleType !== requiredRole,
        });
      }
    }
  }
  return units;
}

/** 담당자별 주간 용량. 같은 사람이 여러 작품에 배정돼 있으면 달력 중 가장 큰 weeklyHours를 쓴다(중복 합산 방지). */
function capacityByParty(
  aggregates: readonly ProductionProjectAggregate[],
): Map<string, { hours: number; source: "calendar" | "default" }> {
  const result = new Map<string, { hours: number; source: "calendar" | "default" }>();
  for (const aggregate of aggregates) {
    const assignmentById = new Map(aggregate.assignments.map((item) => [item.id, item]));
    for (const calendar of aggregate.resourceCalendars ?? []) {
      const assignment = assignmentById.get(calendar.assignmentId);
      if (!assignment || !Number.isFinite(calendar.weeklyHours) || calendar.weeklyHours <= 0) continue;
      const current = result.get(assignment.partyId);
      if (!current || calendar.weeklyHours > current.hours) {
        result.set(assignment.partyId, { hours: calendar.weeklyHours, source: "calendar" });
      }
    }
  }
  return result;
}

function inWeek(unit: OrgAssignmentUnit, startMs: number, endMs: number): boolean {
  if (unit.overdue) return true;
  if (unit.status === "in-progress") return true;
  if (unit.dueAt == null) return false;
  const due = Date.parse(unit.dueAt);
  return due >= startMs && due < endMs;
}

/**
 * 주간 재배분 리포트: 이번 주(지연 포함) 배정 단위에서 사람별 부하를 구하고,
 * 과배정·역량 미스매치·미배정을 탐지해 이동 제안을 만든다.
 * 제안은 결정이 아니라 초안이다 — 실제 재배정은 작품 화면의 배정 변경으로 확정한다.
 */
export function buildWeeklyRebalanceReport(
  aggregates: readonly ProductionProjectAggregate[],
  now: Date,
): OrgWeeklyRebalanceReport {
  const { start, end } = isoWeekWindow(now);
  const allUnits = buildAssignmentUnits(aggregates, now);
  const units = allUnits.filter((unit) => inWeek(unit, start.getTime(), end.getTime()));

  const capacities = capacityByParty(aggregates);
  const nameByParty = new Map<string, string>();
  for (const aggregate of aggregates) {
    for (const party of aggregate.parties) {
      if (!nameByParty.has(party.id)) nameByParty.set(party.id, party.publicDisplayName);
    }
  }

  const loadByParty = new Map<string, { hours: number; count: number; overdue: number }>();
  for (const unit of units) {
    if (!unit.assigneePartyId) continue;
    const entry = loadByParty.get(unit.assigneePartyId) ?? { hours: 0, count: 0, overdue: 0 };
    entry.hours += unit.remainingHours ?? 0;
    entry.count += 1;
    if (unit.overdue) entry.overdue += 1;
    loadByParty.set(unit.assigneePartyId, entry);
  }

  const personLoads: OrgPersonWeekLoad[] = [...loadByParty.entries()]
    .map(([partyId, load]) => {
      const capacity = capacities.get(partyId);
      const capacityHours = capacity?.hours ?? DEFAULT_WEEKLY_CAPACITY_HOURS;
      const loadRatio = capacityHours > 0 ? load.hours / capacityHours : 0;
      return {
        partyId,
        displayName: nameByParty.get(partyId) ?? partyId,
        loadHours: load.hours,
        capacityHours,
        capacitySource: capacity?.source ?? "default",
        loadRatio,
        state: loadRatio > 1 ? "over" : loadRatio >= TIGHT_LOAD_RATIO ? "tight" : "ok",
        unitCount: load.count,
        overdueCount: load.overdue,
      } satisfies OrgPersonWeekLoad;
    })
    .sort((a, b) => b.loadRatio - a.loadRatio || a.displayName.localeCompare(b.displayName));

  const loadMap = new Map(personLoads.map((person) => [person.partyId, person]));
  const mismatches = units.filter((unit) => unit.roleMismatch);
  const unassignedUnits = units.filter((unit) => unit.assigneePartyId == null);

  // 재배분 후보: 같은 작품의 활성 배정 중 요구 역할(없으면 단위 역할)과 일치하고 여유가 있는 사람.
  function findCandidate(
    unit: OrgAssignmentUnit,
    projectedHours: Map<string, number>,
  ): { partyId: string; name: string } | null {
    const aggregate = aggregates.find((item) => item.projectId === unit.projectId);
    if (!aggregate) return null;
    const wantedRole = unit.requiredRole ?? unit.roleType;
    let best: { partyId: string; name: string; ratio: number } | null = null;
    for (const assignment of aggregate.assignments) {
      if (assignment.status !== "active" && assignment.status !== "onboarding") continue;
      if (assignment.partyId === unit.assigneePartyId) continue;
      if (wantedRole != null && assignment.roleType !== wantedRole) continue;
      const capacity = capacities.get(assignment.partyId);
      const capacityHours = capacity?.hours ?? DEFAULT_WEEKLY_CAPACITY_HOURS;
      const projected = (projectedHours.get(assignment.partyId) ?? loadMap.get(assignment.partyId)?.loadHours ?? 0)
        + (unit.remainingHours ?? 0);
      if (projected > capacityHours) continue;
      const ratio = capacityHours > 0 ? projected / capacityHours : 1;
      if (!best || ratio < best.ratio) {
        const party = aggregate.parties.find((item) => item.id === assignment.partyId);
        best = { partyId: assignment.partyId, name: party?.publicDisplayName ?? assignment.partyId, ratio };
      }
    }
    return best;
  }

  const projectedHours = new Map<string, number>();
  const suggestions: OrgRebalanceSuggestion[] = [];
  const suggestedTaskIds = new Set<string>();

  function propose(unit: OrgAssignmentUnit, reason: OrgRebalanceSuggestion["reason"]): void {
    if (suggestedTaskIds.has(unit.taskId)) return;
    if (!MOVABLE_STATUSES.has(unit.status)) return;
    const candidate = findCandidate(unit, projectedHours);
    if (!candidate) return;
    suggestedTaskIds.add(unit.taskId);
    projectedHours.set(candidate.partyId, (projectedHours.get(candidate.partyId) ?? loadMap.get(candidate.partyId)?.loadHours ?? 0) + (unit.remainingHours ?? 0));
    suggestions.push({
      taskId: unit.taskId,
      taskTitle: unit.taskTitle,
      projectId: unit.projectId,
      projectTitle: unit.projectTitle,
      fromPartyId: unit.assigneePartyId,
      fromName: unit.assigneeName,
      toPartyId: candidate.partyId,
      toName: candidate.name,
      hours: unit.remainingHours,
      reason,
    });
  }

  // 1순위: 과배정된 사람의 이동 가능 단위를 덜 바쁜 같은 역할 담당자에게.
  // 큰 작업부터 옮기되, 그 사람의 부하가 용량 이하로 내려오면 더 제안하지 않는다(과잉 재배분 방지).
  for (const person of personLoads.filter((item) => item.state === "over")) {
    let remainingLoad = person.loadHours;
    const movable = units
      .filter((unit) => unit.assigneePartyId === person.partyId)
      .sort((a, b) => (b.remainingHours ?? 0) - (a.remainingHours ?? 0));
    for (const unit of movable) {
      if (remainingLoad <= person.capacityHours) break;
      const before = suggestions.length;
      propose(unit, "over-allocation");
      if (suggestions.length > before) remainingLoad -= unit.remainingHours ?? 0;
    }
  }
  // 2순위: 역할 미스매치 단위를 요구 역할 담당자에게.
  for (const unit of mismatches) propose(unit, "role-mismatch");
  // 3순위: 미배정 단위를 여유 있는 담당자에게.
  for (const unit of unassignedUnits) propose(unit, "unassigned");

  return {
    weekStartAt: start.toISOString(),
    weekEndAt: end.toISOString(),
    units,
    personLoads,
    overAllocated: personLoads.filter((person) => person.state === "over"),
    mismatches,
    unassignedUnits,
    unknownEstimateCount: units.filter((unit) => !unit.estimateKnown).length,
    suggestions,
  };
}

/** 작품 진척을 배정 단위 집계로 도출한다: 완료 견적 시간 비중 + 남은 단위 수. */
export function deriveProjectProgress(
  aggregates: readonly ProductionProjectAggregate[],
  now: Date,
): OrgProjectProgress[] {
  const units = buildAssignmentUnits(aggregates, now);
  return aggregates.map((aggregate) => {
    let doneHours = 0;
    let totalKnown = 0;
    for (const task of aggregate.tasks) {
      if (task.status === "cancelled" || task.status === "out-of-scope") continue;
      const hours = task.estimateHours?.likely;
      if (hours == null || !Number.isFinite(hours)) continue;
      totalKnown += hours;
      if (task.status === "approved" || task.status === "done") doneHours += hours;
    }
    const projectUnits = units.filter((unit) => unit.projectId === aggregate.projectId);
    return {
      projectId: aggregate.projectId,
      title: aggregate.title,
      progressPercent: totalKnown > 0 ? Math.round((doneHours / totalKnown) * 100) : null,
      openUnitCount: projectUnits.length,
      overdueUnitCount: projectUnits.filter((unit) => unit.overdue).length,
      remainingHours: projectUnits.reduce((sum, unit) => sum + (unit.remainingHours ?? 0), 0),
    };
  });
}

/** 장르 클러스터(케나즈 서브스튜디오 방식) 단위 집계. 대표 장르는 최신 기획서 genreKeys의 첫 항목. */
export function buildGenreClusters(
  aggregates: readonly ProductionProjectAggregate[],
  now: Date,
): OrgGenreCluster[] {
  const units = buildAssignmentUnits(aggregates, now);
  interface MutableCluster {
    genreKey: string;
    projectCount: number;
    projectTitles: string[];
    openUnitCount: number;
    remainingHours: number;
    overdueUnitCount: number;
  }
  const clusters = new Map<string, MutableCluster>();
  for (const aggregate of aggregates) {
    const genreKey = latestGenreKeys(aggregate)[0] ?? "uncategorized";
    const cluster = clusters.get(genreKey) ?? {
      genreKey,
      projectCount: 0,
      projectTitles: [],
      openUnitCount: 0,
      remainingHours: 0,
      overdueUnitCount: 0,
    };
    const projectUnits = units.filter((unit) => unit.projectId === aggregate.projectId);
    cluster.projectCount += 1;
    cluster.projectTitles.push(aggregate.title);
    cluster.openUnitCount += projectUnits.length;
    cluster.remainingHours += projectUnits.reduce((sum, unit) => sum + (unit.remainingHours ?? 0), 0);
    cluster.overdueUnitCount += projectUnits.filter((unit) => unit.overdue).length;
    clusters.set(genreKey, cluster);
  }
  return [...clusters.values()].sort(
    (a, b) => b.remainingHours - a.remainingHours || a.genreKey.localeCompare(b.genreKey),
  );
}

/**
 * 기획 감도 지표 슬롯. 관리 지표(부하·진척)와 분리된 축이다.
 * 입력이 없는 작품은 not-instrumented로 두고 수치를 만들지 않는다.
 */
export function buildPlanningSensitivitySlots(
  aggregates: readonly ProductionProjectAggregate[],
  inputs: readonly PlanningSensitivityInput[],
): PlanningSensitivitySlot[] {
  const inputByProject = new Map(inputs.map((input) => [input.projectId, input]));
  return aggregates.map((aggregate) => {
    const input = inputByProject.get(aggregate.projectId);
    const measured = input != null && (input.pilotReactionScore != null || input.planningLeadTimeDays != null);
    return {
      projectId: aggregate.projectId,
      title: aggregate.title,
      status: measured ? "measured" : "not-instrumented",
      pilotReactionScore: measured ? input.pilotReactionScore : null,
      pilotResponseCount: measured ? input.pilotResponseCount : null,
      planningLeadTimeDays: measured ? input.planningLeadTimeDays : null,
      measuredAt: measured ? input.measuredAt : null,
    };
  });
}
