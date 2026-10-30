import type { ProductionProjectAggregate, ProductionTask, RoleAssignment } from "@toonstudio/core/production";
import { taskOutputActorAssignments } from "./production-task-output-model";
import { useProductionReviewClock } from "./use-production-review-clock";

/** 표시 목록은 현재 시각으로 갱신하며, 제출 직전과 서버의 기간 검사를 대신하지 않는다. */
export function useTaskOutputAssignments(aggregate: ProductionProjectAggregate, task: ProductionTask | null | undefined,
  actorId: string | null): readonly RoleAssignment[] {
  const at = Date.parse(useProductionReviewClock(aggregate.assignments,
    JSON.stringify([aggregate.projectId, aggregate.revision, task?.id, actorId, aggregate.parties])));
  return task ? taskOutputActorAssignments(aggregate, task, actorId, at) : [];
}
