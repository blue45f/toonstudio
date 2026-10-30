import type { ProductionProjectAggregate, ProductionTask, SubmitProductionTaskOutputCommand } from "@toonstudio/core/production";
import type { StudioScopedWritePolicy, StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import { getStudioScopedWritePolicy } from "../studio-collab/studio-scoped-write-client";
import { taskOutputActorAssignments } from "./production-task-output-model";

export interface TaskOutputScopedPurpose {
  readonly key: string; readonly workId: string; readonly projectId: string; readonly taskId: string;
  readonly targetId: string; readonly grantId: string; readonly assignmentId: string;
  readonly pageId: string; readonly frameId: string | null; readonly context: StudioScopedWriteContext;
}
export function scopedTaskOutputPurposes(policy: StudioScopedWritePolicy, aggregate: ProductionProjectAggregate, task: ProductionTask, actorId: string, at: number): readonly TaskOutputScopedPurpose[] {
  if (!policy.scopedWrite || policy.workId !== aggregate.workId || task.projectId !== aggregate.projectId) return [];
  const assignments = new Set(taskOutputActorAssignments(aggregate, task, actorId, at).map((entry) => entry.id));
  return policy.grants.flatMap((grant) => {
    if (grant.actorUserId !== actorId || grant.taskId !== task.id || grant.productionProjectId !== aggregate.projectId || grant.revokedAt !== null || Date.parse(grant.startsAt) > at || (grant.endsAt !== null && Date.parse(grant.endsAt) < at) || !assignments.has(grant.assignmentId)) return [];
    return policy.targets.filter((target) => target.revokedAt === null && target.definition.productionProjectId === aggregate.projectId && grant.targetIds.includes(target.definition.id)).map((target) => ({
      key: JSON.stringify([grant.id, target.definition.id]), workId: aggregate.workId, projectId: aggregate.projectId, taskId: task.id,
      targetId: target.definition.id, grantId: grant.id, assignmentId: grant.assignmentId, pageId: target.definition.pageId, frameId: target.definition.frameId,
      context: { version: 1 as const, policyVersion: policy.policyVersion, grantIds: [grant.id], creations: [], restorations: [] },
    }));
  });
}
export async function refreshScopedTaskOutputPurpose(purpose: TaskOutputScopedPurpose, aggregate: ProductionProjectAggregate, task: ProductionTask, actorId: string, signal?: AbortSignal): Promise<TaskOutputScopedPurpose> {
  const policy = await getStudioScopedWritePolicy(aggregate.workId, signal);
  const current = scopedTaskOutputPurposes(policy, aggregate, task, actorId, Date.now()).find((entry) => entry.key === purpose.key && entry.taskId === purpose.taskId && entry.assignmentId === purpose.assignmentId);
  if (!current) throw new Error("선택한 작업의 담당 편집·제출 배정이 변경됐습니다. 입력을 유지한 채 현재 배정을 다시 확인하세요.");
  return current;
}
export function validateScopedTaskOutputSelection(purpose: TaskOutputScopedPurpose, command: SubmitProductionTaskOutputCommand): void {
  if (command.taskId !== purpose.taskId || command.submittedByAssignmentId !== purpose.assignmentId) throw new Error("선택한 담당 작업의 실제 제출 역할을 사용하세요.");
  if (command.selection.mode === "document") throw new Error("담당 원고 제출에는 명시적으로 배정된 페이지 또는 컷을 선택하세요.");
  if (command.selection.pages.some((page) => page.pageId !== purpose.pageId) || command.selection.pages.length !== 1) throw new Error("선택한 담당 페이지의 원고 범위만 제출하세요.");
  if (purpose.frameId !== null && (command.selection.mode !== "frames" || command.selection.pages.some((page) => page.frameIds.length !== 1 || page.frameIds[0] !== purpose.frameId))) throw new Error("선택한 담당 컷의 원고 범위만 제출하세요.");
}
