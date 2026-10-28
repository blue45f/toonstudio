import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { createProductionDemoProject } from "./production-demo";

/** 같은 회차의 독립 초안 작업으로 큐 구성·표시 상한을 검증한다. */
export function divisionQueueScaleFixture(count: number): ProductionProjectAggregate {
  const aggregate = createProductionDemoProject();
  const template = aggregate.tasks[0];
  if (!template) throw new Error("큐 성능 검증 기준 작업이 없습니다.");
  return { ...aggregate, workflowProfile: null, tasks: Array.from({ length: count }, (_, index) => ({
    ...template, id: `scale-task-${String(index).padStart(5, "0")}`, title: `분업 작업 ${String(index).padStart(5, "0")}`,
    status: "draft" as const, dependencyTaskIds: [], dueAt: null,
  })) };
}
