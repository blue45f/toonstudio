import {
  activeAssignments,
  currentProductionReviewDecisions,
  eligibleProductionReviewAssignments,
  evaluateReviewApproval,
  productionScopeDepth,
  productionSubmissionBlockingClarifications,
  productionSubmissionStaleDependencyTasks,
  scopeContains,
  validateReviewDecision,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ReviewDecision,
  type ReviewPolicy,
  type ScopeRef,
  type Submission,
} from "@toonstudio/core/production";

import type { ProductionClientCommand } from "./production-api";

function episodeForScope(scope: ScopeRef): string | null {
  return scope.kind === "episode" ? scope.id : scope.ancestors.find((ancestor) => ancestor.kind === "episode")?.id ?? null;
}

export interface ProductionReviewTarget {
  readonly targeted: boolean;
  readonly task: ProductionTask | null;
  readonly episodeId: string | null;
  readonly issue: "missing-task" | "missing-episode" | "episode-conflict" | null;
  readonly submissions: readonly Submission[];
}

/** 작업 링크의 대상이 없거나 서로 충돌하면 다른 회차·제출본으로 대체하지 않는다. */
export function resolveProductionReviewTarget(
  aggregate: ProductionProjectAggregate,
  taskId: string | undefined,
  requestedEpisodeId?: string,
): ProductionReviewTarget {
  if (taskId === undefined) return { targeted: false, task: null, episodeId: requestedEpisodeId ?? null, issue: null, submissions: [] };
  const task = aggregate.tasks.find((entry) => entry.id === taskId && entry.projectId === aggregate.projectId) ?? null;
  if (!task) return { targeted: true, task: null, episodeId: null, issue: "missing-task", submissions: [] };
  const outputs = task.outputDeliverableIds.map((id) => aggregate.deliverables.find((entry) => entry.id === id
    && entry.projectId === aggregate.projectId && scopeContains(task.scope, entry.scope))).filter((entry) => entry != null);
  const outputEpisodes = new Set(outputs.map((entry) => episodeForScope(entry.scope)).filter((id) => id != null));
  const episodeId = episodeForScope(task.scope) ?? (outputEpisodes.size === 1 ? [...outputEpisodes][0] ?? null : requestedEpisodeId ?? null);
  if (requestedEpisodeId !== undefined && requestedEpisodeId !== episodeId) return { targeted: true, task, episodeId, issue: "episode-conflict", submissions: [] };
  if (episodeId && !aggregate.episodes.some((episode) => episode.episodeId === episodeId && episode.state !== "cancelled")) {
    return { targeted: true, task, episodeId, issue: "missing-episode", submissions: [] };
  }
  const submissions = outputs.flatMap((output) => {
    const current = aggregate.submissions.find((entry) => entry.id === output.currentSubmissionId
      && entry.projectId === aggregate.projectId && entry.deliverableId === output.id && entry.status !== "superseded");
    return current ? [current] : [];
  });
  return { targeted: true, task, episodeId, issue: null, submissions };
}

/** 서버와 같은 가장 구체적인 산출물 범위의 정책을 사용한다. */
export function policyForProductionSubmission(aggregate: ProductionProjectAggregate, submission: Submission | null): ReviewPolicy | null {
  const deliverable = aggregate.deliverables.find((entry) => entry.id === submission?.deliverableId && entry.projectId === aggregate.projectId);
  return deliverable ? aggregate.reviewPolicies.filter((policy) => policy.projectId === aggregate.projectId && scopeContains(policy.scope, deliverable.scope))
    .sort((left, right) => productionScopeDepth(right.scope) - productionScopeDepth(left.scope))[0] ?? null : null;
}

export function decisionsForProductionSubmission(
  aggregate: ProductionProjectAggregate,
  submission: Submission,
  policy: ReviewPolicy,
  at: string,
): readonly ReviewDecision[] {
  const deliverable = aggregate.deliverables.find((entry) => entry.id === submission.deliverableId);
  if (!deliverable) return [];
  const eligible = new Set(activeAssignments(aggregate.assignments, at)
    .filter((assignment) => assignment.projectId === aggregate.projectId && scopeContains(assignment.scope, deliverable.scope)).map((assignment) => assignment.id));
  return currentProductionReviewDecisions(aggregate, policy, deliverable.scope, aggregate.reviewDecisions.filter((decision) => decision.reviewRoundId === submission.id
    && eligible.has(decision.assignmentId) && validateReviewDecision(policy, decision).length === 0), at);
}

export function plainSubmissionApproval(policy: ReviewPolicy, decisions: readonly ReviewDecision[]) {
  return evaluateReviewApproval(policy, decisions.map((decision) => decision.value === "approve-with-conditions"
    ? { ...decision, value: "request-changes" as const } : decision));
}

export interface SubmissionReviewStep {
  readonly stage: "start-review" | "record-decision" | "approve-submission" | "request-changes";
  readonly command: ProductionClientCommand;
}

function approvedSubmission(submission: Submission, decisions: readonly ReviewDecision[]): Submission {
  return { ...submission, status: "approved", evidenceRefs: [...new Set([...submission.evidenceRefs,
    ...decisions.filter((decision) => decision.value === "approve").map((decision) => decision.id)])] };
}

function assertCurrentSubmission(aggregate: ProductionProjectAggregate, submission: Submission): void {
  const deliverable = aggregate.deliverables.find((entry) => entry.id === submission.deliverableId && entry.projectId === aggregate.projectId);
  if (submission.projectId !== aggregate.projectId || deliverable?.currentSubmissionId !== submission.id) throw new Error("현재 산출물의 고정 제출본을 다시 선택하세요.");
  if (!["submitted", "in-review"].includes(submission.status)) throw new Error("새 검수는 제출 또는 검수 중인 현재 버전에서 진행하세요.");
}

/** 각 단계 ACK 뒤 다음 명령을 보내며, 원고 내용·입력 버전은 바꾸지 않는다. */
export function planProductionSubmissionReview(
  aggregate: ProductionProjectAggregate,
  submission: Submission,
  policy: ReviewPolicy,
  decision: ReviewDecision,
  at: string,
): readonly SubmissionReviewStep[] {
  assertCurrentSubmission(aggregate, submission);
  if (policyForProductionSubmission(aggregate, submission)?.id !== policy.id || decision.reviewRoundId !== submission.id) throw new Error("제출본과 검수 정책이 변경되었습니다. 현재 버전에서 다시 확인하세요.");
  const candidate = { ...aggregate, reviewDecisions: [...aggregate.reviewDecisions, decision] };
  const decisions = decisionsForProductionSubmission(candidate, submission, policy, at);
  const deliverable = aggregate.deliverables.find((entry) => entry.id === submission.deliverableId);
  const eligible = deliverable && (policy.quorumBasis === "accounts" ? eligibleProductionReviewAssignments(aggregate, deliverable.scope, at)
    : activeAssignments(aggregate.assignments, at).filter((entry) => entry.status === "active" && entry.projectId === aggregate.projectId && scopeContains(entry.scope, deliverable.scope)));
  // 새 요청의 계정 stamp는 서버가 기록한다. 자격 검증과 이미 확인된 표의 집계를 구분한다.
  if (!eligible || !eligible.some((entry) => entry.id === decision.assignmentId) || validateReviewDecision(policy, decision).length) throw new Error("현재 범위의 유효한 검수 담당자만 결정을 기록할 수 있습니다.");
  const steps: SubmissionReviewStep[] = [];
  if (submission.status === "submitted") steps.push({ stage: "start-review", command: { type: "upsert-submission", submission: { ...submission, status: "in-review" } } });
  steps.push({ stage: "record-decision", command: { type: "record-review-decision", policyId: policy.id, decision } });
  if (decision.value === "approve" && plainSubmissionApproval(policy, decisions).approved
    && productionSubmissionBlockingClarifications(aggregate, submission).length === 0
    && productionSubmissionStaleDependencyTasks(aggregate, submission).length === 0) {
    steps.push({ stage: "approve-submission", command: { type: "upsert-submission", submission: approvedSubmission(submission, decisions) } });
  } else if (decision.value === "request-changes" || decision.value === "veto") {
    steps.push({ stage: "request-changes", command: { type: "upsert-submission", submission: { ...submission, status: "changes-requested" } } });
  }
  return steps;
}

export function planProductionSubmissionApproval(
  aggregate: ProductionProjectAggregate,
  submission: Submission,
  policy: ReviewPolicy,
  actorAssignmentId: string,
  at: string,
): SubmissionReviewStep {
  assertCurrentSubmission(aggregate, submission);
  if (productionSubmissionStaleDependencyTasks(aggregate, submission).length) throw new Error("선행 입력이 바뀌었습니다. 현재 승인된 선행 입력으로 새 제출본을 준비한 뒤 승인을 확정하세요.");
  if (productionSubmissionBlockingClarifications(aggregate, submission).length) throw new Error("진행을 막는 인계 질문을 해결한 뒤 제출본 승인을 확정하세요.");
  const decisions = decisionsForProductionSubmission(aggregate, submission, policy, at);
  if (submission.status !== "in-review" || policyForProductionSubmission(aggregate, submission)?.id !== policy.id
    || !plainSubmissionApproval(policy, decisions).approved || !decisions.some((decision) => decision.assignmentId === actorAssignmentId && decision.value === "approve")) {
    throw new Error("이 제출본의 필수 승인과 본인의 승인을 확인한 뒤 확정하세요.");
  }
  return { stage: "approve-submission", command: { type: "upsert-submission", submission: approvedSubmission(submission, decisions) } };
}
