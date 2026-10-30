import { stableProductionFingerprint, type ProductionProjectAggregate } from "@toonstudio/core/production";

import type { ProductionCommand } from "./production-collaboration.dto";

export type ProductionTaskBatchPreconditions = Extract<ProductionCommand, { readonly type: "upsert-task-batch" }>;

/** 모든 저장 대상을 정확히 하나의 기존 스냅샷 또는 부재 조건으로 보호한다. */
function hasCompletePreconditions(batch: ProductionTaskBatchPreconditions): boolean {
  if (batch.type !== "upsert-task-batch" || batch.tasks.length === 0) return false;
  const ids = new Set(batch.tasks.map((task) => task.id));
  const expectedIds = new Set(batch.expectedTasks.map((task) => task.id));
  const absent = batch.expectedAbsentTaskIds ?? [];
  const absentIds = new Set(absent);
  return ids.size === batch.tasks.length && expectedIds.size === batch.expectedTasks.length
    && absentIds.size === absent.length && expectedIds.size + absentIds.size === ids.size
    && [...expectedIds].every((id) => ids.has(id) && !absentIds.has(id))
    && [...absentIds].every((id) => ids.has(id));
}

/** 서비스는 허용 플래그 대신 비교할 배치 원문을 저장소에 전달한다. */
export function productionTaskBatchPreconditions(command: ProductionCommand): ProductionTaskBatchPreconditions | undefined {
  return command.type === "upsert-task-batch" && hasCompletePreconditions(command) ? command : undefined;
}

/** 저장소가 잠근 최신 aggregate에서 전체 CAS 조건을 다시 검증한다. */
export function matchesProductionTaskBatchPreconditions(
  aggregate: ProductionProjectAggregate,
  batch: ProductionTaskBatchPreconditions | undefined,
): boolean {
  if (!batch || !hasCompletePreconditions(batch)) return false;
  if (batch.tasks.some((task) => task.projectId !== aggregate.projectId)
    || batch.expectedTasks.some((task) => task.projectId !== aggregate.projectId)) return false;
  const currentById = new Map(aggregate.tasks.map((task) => [task.id, task]));
  return batch.expectedTasks.every((expected) => {
    const current = currentById.get(expected.id);
    return current != null && stableProductionFingerprint(current) === stableProductionFingerprint(expected);
  }) && (batch.expectedAbsentTaskIds ?? []).every((id) => !currentById.has(id));
}
