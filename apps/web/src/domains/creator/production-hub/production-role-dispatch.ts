import {
  eligibleAssignmentsForTask,
  inferProductionTaskDepartment,
  type ProductionProjectAggregate,
  type ProductionTask,
} from "@toonstudio/core/production";

const CLOSED = new Set(["approved", "done", "cancelled", "out-of-scope"]);

/** 역할·범위를 지키며 같은 사람의 여러 역할을 합산해 미배정 작업을 나눈다. */
export function buildProductionRoleDispatch(
  aggregate: ProductionProjectAggregate,
  visibleTasks: readonly ProductionTask[],
  at: string,
): readonly { readonly task: ProductionTask; readonly assignmentId: string }[] {
  const partyById = new Map(aggregate.parties.map((party) => [party.id, party]));
  const personByAssignment = new Map(aggregate.assignments.map((assignment) => {
    const party = partyById.get(assignment.partyId);
    return [assignment.id, party?.accountUserId ? `user:${party.accountUserId}` : `party:${assignment.partyId}`];
  }));
  const load = new Map<string, { hours: number; count: number }>();
  const hours = (task: ProductionTask) => {
    const value = task.estimateHours?.likely;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  };
  const addLoad = (person: string, effort: number) => {
    const previous = load.get(person) ?? { hours: 0, count: 0 };
    load.set(person, { hours: previous.hours + effort, count: previous.count + 1 });
  };
  for (const task of aggregate.tasks) {
    if (CLOSED.has(task.status)) continue;
    const people = new Set(task.assignmentIds.flatMap((id) => {
      const person = personByAssignment.get(id);
      return person ? [person] : [];
    }));
    for (const person of people) addLoad(person, hours(task));
  }
  const result: { task: ProductionTask; assignmentId: string }[] = [];
  const seen = new Set<string>();
  const candidates = [...visibleTasks].sort((a, b) => {
    const priority = { urgent: 0, high: 1, normal: 2, low: 3 };
    return priority[a.priority ?? "normal"] - priority[b.priority ?? "normal"]
      || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999")
      || a.id.localeCompare(b.id);
  });
  for (const task of candidates) {
    if (result.length === 200) break;
    if (task.assignmentIds.length || CLOSED.has(task.status) || seen.has(task.id)) continue;
    seen.add(task.id);
    const eligible = [...eligibleAssignmentsForTask({
      task, assignments: aggregate.assignments,
      departmentKey: inferProductionTaskDepartment(task, aggregate.assignments), kind: "owner", at,
    })].sort((a, b) => {
      const left = load.get(personByAssignment.get(a.id) ?? a.id) ?? { hours: 0, count: 0 };
      const right = load.get(personByAssignment.get(b.id) ?? b.id) ?? { hours: 0, count: 0 };
      return left.hours - right.hours || left.count - right.count || a.id.localeCompare(b.id);
    });
    const assignment = eligible[0];
    if (!assignment) continue;
    result.push({ task, assignmentId: assignment.id });
    addLoad(personByAssignment.get(assignment.id) ?? assignment.id, hours(task));
  }
  return result;
}
