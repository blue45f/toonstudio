import { describe, expect, it } from "vitest";
import type { ProductionProjectAggregate, ProductionTask, RoleAssignment } from "@toonstudio/core/production";
import { createProductionDemoProject } from "./production-demo";
import { buildProductionRoleDispatch } from "./production-role-dispatch";

const at = "2026-10-28T03:00:00.000Z";
function fixture() {
  const original = createProductionDemoProject();
  const task = original.tasks.find((value) => value.processKey === "color");
  const colorist = original.assignments.find((value) => value.roleType === "colorist");
  if (!task || !colorist) throw new Error("채색 테스트 기준 데이터가 없습니다.");
  const a: RoleAssignment = { ...colorist, id: "a" };
  const b: RoleAssignment = { ...colorist, id: "b", partyId: "party-other" };
  const aggregate: ProductionProjectAggregate = { ...original, assignments: [a, b], tasks: [] };
  const makeTask = (id: string, assignmentIds: readonly string[] = [], effort = 4): ProductionTask => ({
    ...task, id, status: "draft", priority: "normal", assignmentIds, estimateHours: { optimistic: effort, likely: effort, pessimistic: effort },
  });
  return { aggregate, a, b, makeTask };
}

describe("역할·업무량 기반 일괄 배정", () => {
  it("기존 업무량을 고려하고 같은 배치 안에서도 부하를 분산한다", () => {
    const { aggregate, makeTask } = fixture();
    const tasks = [makeTask("existing", ["a"], 20), makeTask("next-1", [], 12), makeTask("next-2", [], 12), makeTask("next-3", [], 2)];
    const plans = buildProductionRoleDispatch({ ...aggregate, tasks }, tasks, at);
    expect(plans.map((plan) => plan.assignmentId)).toEqual(["b", "b", "a"]);
    expect(tasks[1]?.assignmentIds).toEqual([]);
  });

  it("한 사람의 여러 역할을 따로 빈 담당자로 취급하지 않는다", () => {
    const { aggregate, a, makeTask } = fixture();
    const tasks = [makeTask("existing", ["a"], 30), makeTask("next")];
    const plans = buildProductionRoleDispatch({ ...aggregate, assignments: [a, { ...a, id: "a-alias" }, ...aggregate.assignments.filter((x) => x.id === "b")], tasks }, tasks.slice(1), at);
    expect(plans[0]?.assignmentId).toBe("b");
  });

  it("비활성·기간 만료·다른 범위의 역할과 닫힌 작업을 배제한다", () => {
    const { aggregate, a, makeTask } = fixture();
    const tasks = [makeTask("open"), { ...makeTask("closed"), status: "done" as const }];
    const assignments: readonly RoleAssignment[] = [
      { ...a, id: "inactive", status: "ended" },
      { ...a, id: "expired", endsAt: "2026-10-27T00:00:00.000Z" },
      { ...a, id: "elsewhere", scope: { ...a.scope, id: "other-project" } },
    ];
    expect(buildProductionRoleDispatch({ ...aggregate, assignments, tasks }, tasks, at)).toEqual([]);
  });

  it("긴급·마감 순서로 배정하고 중복과 명령 크기 상한을 지킨다", () => {
    const { aggregate, makeTask } = fixture();
    const tasks = Array.from({ length: 205 }, (_, i) => makeTask(`task-${i.toString().padStart(3, "0")}`));
    const urgent = { ...makeTask("urgent"), priority: "urgent" as const };
    const plans = buildProductionRoleDispatch({ ...aggregate, tasks: [...tasks, urgent] }, [...tasks, urgent, urgent], at);
    expect(plans).toHaveLength(200);
    expect(plans[0]?.task.id).toBe("urgent");
    expect(new Set(plans.map((plan) => plan.task.id)).size).toBe(200);
  });

  it("우선순위가 없는 기존 작업도 보통 순위로 배치한다", () => {
    const { aggregate, makeTask } = fixture();
    const tasks = [{ ...makeTask("legacy"), priority: undefined }, { ...makeTask("high"), priority: "high" as const }];
    expect(buildProductionRoleDispatch({ ...aggregate, tasks }, tasks, at).map((plan) => plan.task.id)).toEqual(["high", "legacy"]);
  });
});
