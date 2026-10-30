import type { Deliverable, ProductionProjectAggregate, ProductionTask, RevisionRef, Submission } from "@toonstudio/core/production";
import { createProductionWorkflowProfile } from "@toonstudio/contracts/production-workflow";
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

/** 스토리 1개에서 컷별 콘티·선화/배경·채색·식자·검수로 분기하는 실제 승인본 DAG다. */
export function divisionQueueDependencyFixture(cutCount: number): ProductionProjectAggregate {
  const aggregate = createProductionDemoProject();
  const template = aggregate.tasks[0];
  const input = template?.inputRevisionRefs[0];
  if (!template || !input) throw new Error("의존성 성능 검증 기준 작업이 없습니다.");
  const tasks: ProductionTask[] = [];
  const deliverables: Deliverable[] = [];
  const submissions: Submission[] = [];
  const add = (id: string, processKey: string, dependencies: readonly string[], inputs: readonly RevisionRef[], ready = false) => {
    const revisionRef: RevisionRef = { ...input, id: `${id}-revision`, digest: `sha256:${tasks.length.toString(16).padStart(64, "0")}`, revision: 1,
      lineage: processKey === "story" ? "narrative" : processKey === "lettering" ? "integrated" : "visual" };
    tasks.push({ ...template, id, title: id, processKey, status: ready ? "ready" : "approved", dueAt: null,
      dependencyTaskIds: dependencies, inputRevisionRefs: inputs, outputDeliverableIds: [`${id}-output`], briefBlocks: [] });
    deliverables.push({ id: `${id}-output`, projectId: aggregate.projectId, scope: template.scope, type: processKey,
      expectedFormat: "PNG", completionCriteria: ["고정 입력과 최종 원고 대조"],
      currentSubmissionId: ready ? null : `${id}-submission`, approvedSubmissionId: ready ? null : `${id}-submission` });
    if (!ready) submissions.push({ id: `${id}-submission`, projectId: aggregate.projectId, deliverableId: `${id}-output`,
      revisionRef, inputRevisionRefs: inputs, status: "approved", submittedAt: input.createdAt,
      submittedByAssignmentId: template.assignmentIds[0] ?? "assignment-story", evidenceRefs: [] });
    return revisionRef;
  };
  const story = add("dag-story", "story", [], [input]);
  for (let cut = 0; cut < cutCount; cut++) {
    const prefix = `dag-cut-${String(cut).padStart(5, "0")}`;
    const thumbnail = add(`${prefix}-thumbnail`, "thumbnail", ["dag-story"], [story]);
    const lineart = add(`${prefix}-lineart`, "line-art", [`${prefix}-thumbnail`], [thumbnail]);
    const background = add(`${prefix}-background`, "background", [`${prefix}-thumbnail`], [thumbnail]);
    const color = add(`${prefix}-color`, "color", [`${prefix}-lineart`, `${prefix}-background`], [lineart, background]);
    const lettering = add(`${prefix}-lettering`, "lettering", [`${prefix}-color`], [color]);
    add(`${prefix}-proof`, "joint-proof", [`${prefix}-lettering`], [lettering], true);
  }
  const profile = createProductionWorkflowProfile(aggregate.projectId, "studio", input.createdAt);
  return { ...aggregate, workflowProfile: profile, tasks, deliverables, submissions };
}
