import { sameProductionRevision } from "./revision";
import { scopeContains } from "./scope";

import type {
  EpisodeCollaboration,
  EpisodeCollaborationState,
  Deliverable,
  ProductionTask,
  ProductionTaskStatus,
  ProductionProjectAggregate,
  RevisionRef,
  Submission,
} from "./types";

const EPISODE_TRANSITIONS: Readonly<Record<EpisodeCollaborationState, readonly EpisodeCollaborationState[]>> = Object.freeze({
  "episode-planning": ["story-drafting", "cancelled"],
  "story-drafting": ["story-review", "blocked", "paused-health", "cancelled"],
  "story-review": ["story-drafting", "story-ready-for-art", "blocked", "cancelled"],
  "story-ready-for-art": ["art-clarification", "thumbnailing", "change-request-open", "cancelled"],
  "art-clarification": ["story-ready-for-art", "thumbnailing", "blocked", "change-request-open", "cancelled"],
  thumbnailing: ["thumbnail-joint-review", "blocked", "paused-health", "change-request-open", "cancelled"],
  "thumbnail-joint-review": ["thumbnailing", "thumbnail-locked", "blocked", "change-request-open", "cancelled"],
  "thumbnail-locked": ["final-art-production", "change-request-open", "cancelled"],
  "final-art-production": ["lettering-and-integration", "blocked", "paused-health", "change-request-open", "creator-replacement", "cancelled"],
  "lettering-and-integration": ["joint-proof", "final-art-production", "blocked", "change-request-open", "cancelled"],
  "joint-proof": ["lettering-and-integration", "publish-ready", "blocked", "change-request-open", "cancelled"],
  "publish-ready": ["published", "joint-proof", "change-request-open", "cancelled"],
  published: ["change-request-open"],
  blocked: ["story-drafting", "story-review", "art-clarification", "thumbnailing", "final-art-production", "lettering-and-integration", "joint-proof", "cancelled"],
  "paused-health": ["story-drafting", "thumbnailing", "final-art-production", "creator-replacement", "cancelled"],
  "paused-contract": ["story-drafting", "thumbnailing", "final-art-production", "cancelled"],
  "change-request-open": ["story-review", "story-ready-for-art", "thumbnailing", "thumbnail-joint-review", "final-art-production", "lettering-and-integration", "joint-proof", "publish-ready", "published", "cancelled"],
  "creator-replacement": ["story-drafting", "thumbnailing", "final-art-production", "paused-contract", "cancelled"],
  cancelled: [],
});

export interface EpisodeTransitionContext {
  readonly at: string;
  readonly narrativeRevisionRef?: RevisionRef | null;
  readonly visualRevisionRef?: RevisionRef | null;
  readonly integratedRevisionRef?: RevisionRef | null;
  readonly activeHandoffId?: string | null;
  readonly openBlockerCount?: number;
  readonly storyLockApproved?: boolean;
  readonly thumbnailLockApproved?: boolean;
  readonly jointProofApproved?: boolean;
  readonly creditPreflightPassed?: boolean;
  readonly publicationPreflightPassed?: boolean;
}

export function transitionEpisodeCollaboration(
  episode: EpisodeCollaboration,
  target: EpisodeCollaborationState,
  context: EpisodeTransitionContext,
): EpisodeCollaboration {
  if (!EPISODE_TRANSITIONS[episode.state].includes(target)) {
    throw new Error(`Illegal episode collaboration transition: ${episode.state} -> ${target}`);
  }
  const next = { ...episode, ...context, state: target, revision: episode.revision + 1, updatedAt: context.at };
  const blockers = context.openBlockerCount ?? episode.openBlockerCount;
  if (["story-ready-for-art", "art-clarification", "thumbnailing"].includes(target)) {
    if (!(context.storyLockApproved ?? episode.storyLockApproved)) {
      throw new Error("Episode cannot enter art production without StoryLock approval.");
    }
    if (!(context.activeHandoffId ?? episode.activeHandoffId)) {
      throw new Error("Episode cannot enter art production without an active handoff.");
    }
  }
  if (["thumbnail-locked", "final-art-production", "lettering-and-integration", "joint-proof"].includes(target)) {
    if (!(context.thumbnailLockApproved ?? episode.thumbnailLockApproved)) {
      throw new Error("Episode cannot continue without ThumbnailLock approval.");
    }
  }
  if (target === "publish-ready") {
    if (!(context.jointProofApproved ?? episode.jointProofApproved)) throw new Error("Joint proof approval is required.");
    if (!(context.creditPreflightPassed ?? episode.creditPreflightPassed)) throw new Error("Credit preflight is required.");
    if (!(context.publicationPreflightPassed ?? episode.publicationPreflightPassed)) throw new Error("Publication preflight is required.");
  }
  if (target === "published" && episode.state !== "publish-ready") {
    throw new Error("Only a publish-ready episode can be published.");
  }
  if (blockers > 0 && !["blocked", "change-request-open", "cancelled"].includes(target)) {
    throw new Error("Open blockers prevent the requested episode transition.");
  }
  return Object.freeze(next);
}

const TASK_TRANSITIONS: Readonly<Record<ProductionTaskStatus, readonly ProductionTaskStatus[]>> = Object.freeze({
  draft: ["needs-input", "ready", "cancelled", "out-of-scope"],
  "needs-input": ["ready", "blocked", "cancelled", "out-of-scope"],
  ready: ["in-progress", "blocked", "paused", "cancelled", "out-of-scope"],
  "in-progress": ["internal-review", "blocked", "paused", "cancelled"],
  "internal-review": ["changes-requested", "external-review", "conditionally-approved", "approved", "blocked"],
  "external-review": ["changes-requested", "conditionally-approved", "approved", "blocked"],
  "changes-requested": ["in-progress", "blocked", "cancelled"],
  "conditionally-approved": ["approved", "changes-requested", "blocked"],
  approved: ["done", "changes-requested"],
  done: [],
  blocked: ["needs-input", "ready", "in-progress", "cancelled"],
  paused: ["ready", "in-progress", "cancelled"],
  cancelled: [],
  "out-of-scope": [],
});

interface ProductionTaskWorkflowLookup {
  readonly tasks: ReadonlyMap<string, ProductionTask>;
  readonly deliverables: ReadonlyMap<string, Deliverable>;
  readonly submissions: ReadonlyMap<string, readonly Submission[]>;
  readonly approvedSubmissionIds: ReadonlyMap<string, ReadonlySet<string | null>>;
  readonly currentSubmissions: Map<ProductionTask, readonly Submission[] | null>;
}

/** 같은 불변 aggregate 스냅샷의 반복 판정에서만 조회 인덱스와 제출본 검증을 재사용한다. */
export function createProductionTaskWorkflowReader(
  aggregate: Pick<ProductionProjectAggregate, "tasks" | "deliverables" | "submissions">,
) {
  const tasks = new Map<string, ProductionTask>();
  const deliverables = new Map<string, Deliverable>();
  const submissions = new Map<string, Submission[]>();
  const approvedSubmissionIds = new Map<string, Set<string | null>>();
  // 기존 find의 첫 일치 및 some의 전체 일치 의미를 중복 ID가 있어도 보존한다.
  for (const task of aggregate.tasks) if (!tasks.has(task.id)) tasks.set(task.id, task);
  for (const deliverable of aggregate.deliverables) {
    if (!deliverables.has(deliverable.id)) deliverables.set(deliverable.id, deliverable);
    const approved = approvedSubmissionIds.get(deliverable.id) ?? new Set<string | null>();
    approved.add(deliverable.approvedSubmissionId);
    approvedSubmissionIds.set(deliverable.id, approved);
  }
  for (const submission of aggregate.submissions) {
    const matching = submissions.get(submission.id) ?? [];
    matching.push(submission);
    submissions.set(submission.id, matching);
  }
  const lookup: ProductionTaskWorkflowLookup = { tasks, deliverables, submissions, approvedSubmissionIds, currentSubmissions: new Map() };
  return Object.freeze({
    hasCurrentApprovedOutputs: (task: ProductionTask) => taskHasCurrentApprovedOutputs(task, aggregate, lookup),
    hasCurrentReviewOutputs: (task: ProductionTask) => taskHasCurrentReviewOutputs(task, aggregate, lookup),
    hasCurrentDependencyInputs: (task: ProductionTask) => taskHasCurrentDependencyInputs(task, aggregate, lookup),
  });
}

/** 모든 출력이 현재 승인본이며 이 작업의 고정 입력으로 제작되었는지 확인한다. */
function currentProductionTaskSubmissions(
  task: ProductionTask,
  aggregate: Pick<ProductionProjectAggregate, "deliverables" | "submissions">,
  lookup?: ProductionTaskWorkflowLookup,
): readonly Submission[] | null {
  if (lookup?.currentSubmissions.has(task)) return lookup.currentSubmissions.get(task) ?? null;
  const submissions = readCurrentProductionTaskSubmissions(task, aggregate, lookup);
  lookup?.currentSubmissions.set(task, submissions);
  return submissions;
}

function readCurrentProductionTaskSubmissions(
  task: ProductionTask,
  aggregate: Pick<ProductionProjectAggregate, "deliverables" | "submissions">,
  lookup?: ProductionTaskWorkflowLookup,
): readonly Submission[] | null {
  if (task.inputRevisionRefs.length === 0 || task.outputDeliverableIds.length === 0) return null;
  const submissions: Submission[] = [];
  for (const id of task.outputDeliverableIds) {
    const deliverable = lookup ? lookup.deliverables.get(id) : aggregate.deliverables.find((entry) => entry.id === id);
    if (!deliverable?.currentSubmissionId || deliverable.projectId !== task.projectId) return null;
    const candidates = lookup ? lookup.submissions.get(deliverable.currentSubmissionId) ?? [] : aggregate.submissions;
    const submission = candidates.find((entry) => entry.id === deliverable.currentSubmissionId
      && entry.projectId === task.projectId && entry.deliverableId === id);
    if (!submission || !task.inputRevisionRefs.every((input) => submission.inputRevisionRefs.some((revision) =>
      sameProductionRevision(revision, input)))) return null;
    submissions.push(submission);
  }
  return submissions;
}

export function productionTaskHasCurrentApprovedOutputs(
  task: ProductionTask,
  aggregate: Pick<ProductionProjectAggregate, "deliverables" | "submissions">,
): boolean {
  return taskHasCurrentApprovedOutputs(task, aggregate);
}

function taskHasCurrentApprovedOutputs(
  task: ProductionTask,
  aggregate: Pick<ProductionProjectAggregate, "deliverables" | "submissions">,
  lookup?: ProductionTaskWorkflowLookup,
): boolean {
  const submissions = currentProductionTaskSubmissions(task, aggregate, lookup);
  return submissions != null && submissions.every((submission) => submission.status === "approved"
    && (lookup ? lookup.approvedSubmissionIds.get(submission.deliverableId)?.has(submission.id)
      : aggregate.deliverables.some((entry) => entry.id === submission.deliverableId && entry.approvedSubmissionId === submission.id)));
}

/** 검수 요청은 고정 입력에 대응하는 실제 현재 제출본을 대상으로 한다. */
export function productionTaskHasCurrentReviewOutputs(
  task: ProductionTask,
  aggregate: Pick<ProductionProjectAggregate, "deliverables" | "submissions">,
): boolean {
  return taskHasCurrentReviewOutputs(task, aggregate);
}

function taskHasCurrentReviewOutputs(
  task: ProductionTask,
  aggregate: Pick<ProductionProjectAggregate, "deliverables" | "submissions">,
  lookup?: ProductionTaskWorkflowLookup,
): boolean {
  const submissions = currentProductionTaskSubmissions(task, aggregate, lookup);
  return submissions != null && submissions.every((submission) => ["submitted", "in-review", "approved"].includes(submission.status));
}

/** 선행 공정의 현재 승인 출력 revision이 후속 작업 입력에 고정되어야 한다. */
export function productionTaskHasCurrentDependencyInputs(
  task: ProductionTask,
  aggregate: Pick<ProductionProjectAggregate, "tasks" | "deliverables" | "submissions">,
): boolean {
  return taskHasCurrentDependencyInputs(task, aggregate);
}

/** 새 제출본 승인은 작업의 현재 설정 대신 그 제출본이 실제 사용한 입력을 대조한다. */
export function productionSubmissionStaleDependencyTasks(
  aggregate: Pick<ProductionProjectAggregate, "tasks" | "deliverables" | "submissions">,
  submission: Pick<Submission, "deliverableId" | "inputRevisionRefs">,
): readonly ProductionTask[] {
  const deliverable = aggregate.deliverables.find((entry) => entry.id === submission.deliverableId);
  if (!deliverable) return [];
  return aggregate.tasks.filter((task) => task.outputDeliverableIds.includes(deliverable.id)
    && scopeContains(task.scope, deliverable.scope)
    && !taskHasCurrentDependencyInputs({ ...task, inputRevisionRefs: submission.inputRevisionRefs }, aggregate));
}

function taskHasCurrentDependencyInputs(
  task: ProductionTask,
  aggregate: Pick<ProductionProjectAggregate, "tasks" | "deliverables" | "submissions">,
  lookup?: ProductionTaskWorkflowLookup,
): boolean {
  return task.dependencyTaskIds.every((id) => {
    const dependency = lookup ? lookup.tasks.get(id) : aggregate.tasks.find((entry) => entry.id === id);
    if (!dependency || !["approved", "done"].includes(dependency.status)
      || !taskHasCurrentApprovedOutputs(dependency, aggregate, lookup)) return false;
    const submissions = currentProductionTaskSubmissions(dependency, aggregate, lookup);
    return submissions != null && submissions.every((submission) => task.inputRevisionRefs.some((input) =>
      sameProductionRevision(input, submission.revisionRef)));
  });
}

export function transitionProductionTask(
  task: ProductionTask,
  target: ProductionTaskStatus,
  completedDependencyTaskIds: readonly string[],
): ProductionTask {
  if (!TASK_TRANSITIONS[task.status].includes(target)) {
    throw new Error(`Illegal production task transition: ${task.status} -> ${target}`);
  }
  if (target === "in-progress") {
    const completed = new Set(completedDependencyTaskIds);
    const missing = task.dependencyTaskIds.filter((id) => !completed.has(id));
    if (missing.length > 0) throw new Error(`Task dependencies are incomplete: ${missing.join(", ")}`);
    if (task.inputRevisionRefs.length === 0) throw new Error("Task requires pinned input revisions before work starts.");
  }
  if ((target === "approved" || target === "done") && task.outputDeliverableIds.length === 0) {
    throw new Error("An approved task must have a deliverable.");
  }
  return Object.freeze({ ...task, status: target });
}

export function detectTaskDependencyCycles(tasks: readonly ProductionTask[]): readonly (readonly string[])[] {
  const graph = new Map(tasks.map((task) => [task.id, task.dependencyTaskIds]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[][] = [];
  const stack: string[] = [];
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      cycles.push([...stack.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    stack.push(id);
    for (const dependency of graph.get(id) ?? []) {
      if (graph.has(dependency)) visit(dependency);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of tasks) visit(task.id);
  return Object.freeze(cycles.map((cycle) => Object.freeze(cycle)));
}

/** 제출본 검수 결과와 연결 작업 상태를 하나의 aggregate 변경으로 기록한다. */
export function applyProductionSubmissionReviewToTasks(
  aggregate: ProductionProjectAggregate,
  submission: Submission,
  at: string,
): ProductionProjectAggregate {
  if (submission.status !== "approved" && submission.status !== "changes-requested") return aggregate;
  const deliverable = aggregate.deliverables.find((entry) => entry.id === submission.deliverableId);
  if (!deliverable) return aggregate;
  return { ...aggregate, tasks: aggregate.tasks.map((task) => {
    if (!task.outputDeliverableIds.includes(deliverable.id) || !scopeContains(task.scope, deliverable.scope)
      || deliverable.currentSubmissionId !== submission.id) return task;
    if (submission.status === "changes-requested" && ["internal-review", "external-review", "conditionally-approved", "approved"].includes(task.status)) {
      return { ...transitionProductionTask(task, "changes-requested", []), statusChangedAt: at, completedAt: null };
    }
    if (!["internal-review", "external-review", "conditionally-approved"].includes(task.status)
      || !productionTaskHasCurrentApprovedOutputs(task, aggregate)) return task;
    return { ...transitionProductionTask(task, "approved", []), statusChangedAt: at, completedAt: task.completedAt ?? at };
  }) };
}
