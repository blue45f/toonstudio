import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import { eligibleAssignmentsForTask, productionTaskHasCurrentApprovedOutputs, productionTaskHasCurrentDependencyInputs, type Deliverable, type ProductionProjectAggregate, type ProductionTask, type ProductionTaskStatus, type Submission } from "@toonstudio/core/production";

import { previewProductionBoardMove, type ProductionBoardMovePreview } from "./production-board-move-preview";
import { PRODUCTION_DEFAULT_PROCESS_ORDER } from "./production-labels";

export interface DivisionHandoffOutput {
  readonly id: string;
  readonly deliverable: Deliverable | null;
  readonly current: Submission | null;
  readonly approved: Submission | null;
}

export interface DivisionHandoffQueueEntry {
  readonly task: ProductionTask;
  readonly episodeId: string | null;
  readonly dependencies: readonly { readonly id: string; readonly task: ProductionTask | null; readonly complete: boolean }[];
  readonly activeAssignmentIds: readonly string[];
  readonly activeReviewerIds: readonly string[];
  readonly outputs: readonly DivisionHandoffOutput[];
  readonly uncheckedCount: number;
  readonly inputVersionsCurrent: boolean;
  readonly action: { readonly target: ProductionTaskStatus; readonly preview: ProductionBoardMovePreview } | null;
}

const NEXT_STATUS: Readonly<Partial<Record<ProductionTaskStatus, ProductionTaskStatus>>> = {
  draft: "ready",
  "needs-input": "ready",
  ready: "in-progress",
  "changes-requested": "in-progress",
  paused: "in-progress",
  blocked: "in-progress",
  "in-progress": "internal-review",
  approved: "done",
};

export function divisionTaskEpisode(task: ProductionTask): string | null {
  return task.scope.kind === "episode" ? task.scope.id : task.scope.ancestors.find((scope) => scope.kind === "episode")?.id ?? null;
}

/** 인계 작업함은 실제 작업·제출본 참조만 읽고 보드와 같은 상태 전환 검증을 사용한다. */
export function buildDivisionHandoffQueue(
  aggregate: ProductionProjectAggregate,
  episodeId: string | null,
  at: string,
): readonly DivisionHandoffQueueEntry[] {
  const assignments = new Map(aggregate.assignments.filter((assignment) => assignment.projectId === aggregate.projectId).map((assignment) => [assignment.id, assignment]));
  const tasks = new Map(aggregate.tasks.filter((task) => task.projectId === aggregate.projectId).map((task) => [task.id, task]));
  const deliverables = new Map(aggregate.deliverables.map((entry) => [entry.id, entry]));
  const submissions = new Map(aggregate.submissions.map((entry) => [entry.id, entry]));
  const dependencyComplete = new Map<string, boolean>();
  const order = aggregate.workflowProfile?.steps.map((step) => canonicalProductionProcessKey(step.key)) ?? PRODUCTION_DEFAULT_PROCESS_ORDER;
  const processPositions = new Map(order.map((key, index) => [key, index]));
  const position = (task: ProductionTask) => {
    return processPositions.get(canonicalProductionProcessKey(task.processKey)) ?? order.length;
  };
  const submissionFor = (id: string | null | undefined, deliverableId: string): Submission | null => {
    const submission = id ? submissions.get(id) : undefined;
    return submission?.deliverableId === deliverableId && submission.projectId === aggregate.projectId ? submission : null;
  };
  return aggregate.tasks
    .filter((task) => task.projectId === aggregate.projectId && (!episodeId || divisionTaskEpisode(task) === episodeId) && !["cancelled", "out-of-scope"].includes(task.status))
    .sort((left, right) => position(left) - position(right) || (left.dueAt ?? "9999").localeCompare(right.dueAt ?? "9999") || left.title.localeCompare(right.title))
    .map((task) => {
      const target = NEXT_STATUS[task.status];
      const linkedAssignments = [...new Set([...task.assignmentIds, ...task.reviewerAssignmentIds])]
        .flatMap((id) => { const assignment = assignments.get(id); return assignment ? [assignment] : []; });
      const eligibleOwners = new Set(eligibleAssignmentsForTask({ task, assignments: linkedAssignments, kind: "owner", at }).map((assignment) => assignment.id));
      const eligibleReviewers = new Set(eligibleAssignmentsForTask({ task, assignments: linkedAssignments, kind: "reviewer", at }).map((assignment) => assignment.id));
      let cachedPreview: ProductionBoardMovePreview | undefined;
      return {
        task,
        episodeId: divisionTaskEpisode(task),
        dependencies: task.dependencyTaskIds.map((id) => {
          const dependency = tasks.get(id) ?? null;
          if (!dependencyComplete.has(id)) dependencyComplete.set(id, Boolean(dependency && ["approved", "done"].includes(dependency.status) && productionTaskHasCurrentApprovedOutputs(dependency, aggregate)));
          return { id, task: dependency, complete: dependencyComplete.get(id) ?? false };
        }),
        activeAssignmentIds: task.assignmentIds.filter((id) => eligibleOwners.has(id)),
        activeReviewerIds: task.reviewerAssignmentIds.filter((id) => eligibleReviewers.has(id)),
        outputs: task.outputDeliverableIds.map((id) => {
          const candidate = deliverables.get(id);
          const deliverable = candidate?.projectId === aggregate.projectId ? candidate : null;
          const current = submissionFor(deliverable?.currentSubmissionId, id);
          const approved = submissionFor(deliverable?.approvedSubmissionId, id);
          return { id, deliverable, current, approved: approved?.status === "approved" ? approved : null };
        }),
        uncheckedCount: task.briefBlocks?.filter((block) => block.kind === "checklist" && !block.checked).length ?? 0,
        inputVersionsCurrent: productionTaskHasCurrentDependencyInputs(task, aggregate),
        action: target ? { target, get preview() {
          // 전체 큐를 만들 때는 실행하지 않는다. 표시 행의 판정만 이 스냅샷에서 캐시한다.
          cachedPreview ??= previewProductionBoardMove(aggregate, [task.id], target, at);
          return cachedPreview;
        } } : null,
      };
    });
}

export type DivisionQueueFilter = "all" | "actionable" | "blocked" | "review";

/** 전체 목록의 후보·누락 분류이며 이동 허가를 뜻하지 않는다. 실제 허가는 preview가 판정한다. */
export function divisionQueueCandidateMatches(entry: DivisionHandoffQueueEntry, filter: DivisionQueueFilter): boolean {
  if (filter === "actionable") return entry.action !== null;
  if (filter === "review") return ["internal-review", "external-review", "conditionally-approved"].includes(entry.task.status);
  if (filter === "blocked") return entry.task.status === "blocked" || entry.dependencies.some((dependency) => !dependency.complete)
    || !entry.activeAssignmentIds.length || !entry.task.inputRevisionRefs.length || !entry.inputVersionsCurrent || entry.uncheckedCount > 0;
  return true;
}

/** 개별 작업의 정확한 이동 검증용이다. 전체 목록 집계에는 후보 분류를 사용한다. */
export function divisionQueueMatches(entry: DivisionHandoffQueueEntry, filter: DivisionQueueFilter): boolean {
  if (filter === "actionable") return Boolean(entry.action?.preview.allowed);
  if (filter === "review") return ["internal-review", "external-review", "conditionally-approved"].includes(entry.task.status);
  if (filter === "blocked") return entry.task.status === "blocked" || Boolean(entry.action && !entry.action.preview.allowed)
    || entry.dependencies.some((dependency) => !dependency.complete)
    || !entry.activeAssignmentIds.length || !entry.task.inputRevisionRefs.length;
  return true;
}
