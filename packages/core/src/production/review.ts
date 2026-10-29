import { episodeScope, projectScope, scopeContains, scopeIntersects } from "./scope";

import type {
  ApprovalEvaluation,
  ApprovalLaneEvaluation,
  ReviewDecision,
  ReviewLane,
  ReviewPolicy,
  ProductionProjectAggregate,
  Submission,
  ClarificationThread,
} from "./types";

/** 현재 인수인계와 겹치는 미해결 차단 질문만 제출본 승인에 적용한다. */
export function productionSubmissionBlockingClarifications(
  aggregate: Pick<ProductionProjectAggregate, "deliverables" | "handoffs" | "clarifications" | "episodes">,
  submission: Submission,
): readonly ClarificationThread[] {
  const deliverable = aggregate.deliverables.find((entry) => entry.id === submission.deliverableId && entry.projectId === submission.projectId);
  if (!deliverable) return [];
  const activeHandoffIds = new Set(aggregate.handoffs.filter((handoff) => {
    if (handoff.projectId !== submission.projectId || ["cancelled", "superseded"].includes(handoff.status)
      || !scopeIntersects(episodeScope(handoff.projectId, handoff.episodeId), deliverable.scope)) return false;
    const episode = aggregate.episodes.find((entry) => entry.projectId === submission.projectId && entry.episodeId === handoff.episodeId);
    return !episode?.activeHandoffId || episode.activeHandoffId === handoff.id;
  }).map((handoff) => handoff.id));
  return aggregate.clarifications.filter((thread) => thread.blocking && ["open", "answered"].includes(thread.status)
    && activeHandoffIds.has(thread.handoffId) && scopeContains(projectScope(submission.projectId), thread.scope)
    && scopeIntersects(thread.scope, deliverable.scope));
}

export function evaluateReviewApproval(
  policy: ReviewPolicy,
  decisions: readonly ReviewDecision[],
): ApprovalEvaluation {
  const laneCounts = new Map<ReviewLane, number>();
  for (const lane of policy.lanes) laneCounts.set(lane.lane, (laneCounts.get(lane.lane) ?? 0) + 1);
  const latestByLaneAndAssignment = new Map<string, ReviewDecision>();
  for (const decision of decisions) {
    const key = `${decision.lane}:${decision.assignmentId}`;
    const current = latestByLaneAndAssignment.get(key);
    if (!current || Date.parse(decision.createdAt) >= Date.parse(current.createdAt)) {
      latestByLaneAndAssignment.set(key, decision);
    }
  }

  const results: ApprovalLaneEvaluation[] = policy.lanes.map((lanePolicy) => {
    const laneDecisions = [...latestByLaneAndAssignment.values()].filter(
      (decision) => decision.lane === lanePolicy.lane && lanePolicy.eligibleAssignmentIds.includes(decision.assignmentId),
    );
    const approvals = laneDecisions.filter((decision) =>
      decision.value === "approve" || decision.value === "approve-with-conditions").length;
    const approvedAssignments = new Set(laneDecisions.filter((decision) =>
      decision.value === "approve" || decision.value === "approve-with-conditions")
      .map((decision) => decision.assignmentId));
    const missingRequired = lanePolicy.requiredAssignmentIds.filter(
      (assignmentId) => !approvedAssignments.has(assignmentId),
    );
    const vetoedBy = laneDecisions.filter(
      (decision) => decision.value === "veto" && lanePolicy.vetoAssignmentIds.includes(decision.assignmentId),
    ).map((decision) => decision.assignmentId);
    const changeRequestedBy = laneDecisions.filter(
      (decision) => decision.value === "request-changes",
    ).map((decision) => decision.assignmentId);
    const approved = laneCounts.get(lanePolicy.lane) === 1 && approvals >= lanePolicy.quorum
      && missingRequired.length === 0
      && vetoedBy.length === 0
      && changeRequestedBy.length === 0;
    return Object.freeze({
      lane: lanePolicy.lane,
      approved,
      approvals,
      requiredApprovals: lanePolicy.quorum,
      missingRequiredAssignmentIds: Object.freeze(missingRequired),
      vetoedByAssignmentIds: Object.freeze(vetoedBy),
      changeRequestedByAssignmentIds: Object.freeze(changeRequestedBy),
    });
  });
  const blockingLanes = results
    .filter((result, index) => !result.approved && policy.lanes[index]?.blocksPublication)
    .map((result) => result.lane as ReviewLane);
  return Object.freeze({
    approved: results.every((result) => result.approved),
    blockingLanes: Object.freeze(blockingLanes),
    laneResults: Object.freeze(results),
  });
}

export function validateReviewDecision(
  policy: ReviewPolicy,
  decision: ReviewDecision,
): readonly string[] {
  const issues: string[] = [];
  const lanes = policy.lanes.filter((entry) => entry.lane === decision.lane);
  if (lanes.length > 1) return Object.freeze(["duplicate-review-lane"]);
  const lane = lanes[0];
  if (!lane) return Object.freeze(["unknown-review-lane"]);
  if (!lane.eligibleAssignmentIds.includes(decision.assignmentId)) issues.push("reviewer-not-eligible");
  if (decision.value === "veto") {
    if (!lane.vetoAssignmentIds.includes(decision.assignmentId)) issues.push("reviewer-cannot-veto");
    if (!decision.reasonCode) issues.push("veto-reason-required");
    if (decision.evidenceScopeRefs.length === 0) issues.push("veto-evidence-required");
  }
  if (decision.value === "request-changes" && !decision.reasonCode) issues.push("change-reason-required");
  if (decision.value === "approve-with-conditions" && decision.conditions.length === 0) {
    issues.push("approval-conditions-required");
  }
  return Object.freeze(issues);
}
