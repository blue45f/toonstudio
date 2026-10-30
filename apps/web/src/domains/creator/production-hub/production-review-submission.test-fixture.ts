import type { ProductionProjectAggregate, ReviewDecision, ReviewPolicy, Submission } from "@toonstudio/core/production";
import { createProductionDemoProject } from "./production-demo";

export const REVIEW_TEST_AT = "2026-10-28T00:00:00.000Z";

export function productionSubmissionReviewFixture(episodeId = "episode-12") {
  const original = createProductionDemoProject();
  const sourceTask = original.tasks[0];
  const sourceSubmission = original.submissions.find((entry) => entry.deliverableId === sourceTask?.outputDeliverableIds[0]);
  const sourceDeliverable = original.deliverables.find((entry) => entry.id === sourceSubmission?.deliverableId);
  if (!sourceTask || !sourceSubmission || !sourceDeliverable) throw new Error("검수 fixture 기준이 없습니다.");
  const scope = { kind: "episode" as const, id: episodeId, ancestors: [{ kind: "project" as const, id: original.projectId }] };
  const task = { ...sourceTask, id: "target-task", title: "검수 대상 선화", scope, status: "internal-review" as const, outputDeliverableIds: ["target-deliverable"] };
  const submission: Submission = { ...sourceSubmission, id: "target-submission", deliverableId: "target-deliverable", status: "submitted", inputRevisionRefs: task.inputRevisionRefs };
  const deliverable = { ...sourceDeliverable, id: "target-deliverable", scope, currentSubmissionId: submission.id, approvedSubmissionId: null };
  const policy: ReviewPolicy = { ...original.reviewPolicies[0], id: "target-policy", projectId: original.projectId, scope,
    responseDueHours: 24, expiredReviewAction: "escalate",
    lanes: [{ lane: "visual-direction", eligibleAssignmentIds: ["assignment-art"], requiredAssignmentIds: ["assignment-art"], quorum: 1, vetoAssignmentIds: [], blocksPublication: true }] };
  const aggregate: ProductionProjectAggregate = { ...original, workflowProfile: null,
    tasks: [...original.tasks, task], submissions: [...original.submissions, submission], deliverables: [...original.deliverables, deliverable],
    reviewPolicies: [policy], reviewDecisions: [], clarifications: [] };
  const decision: ReviewDecision = { id: "new-approval", reviewRoundId: submission.id, lane: "visual-direction", assignmentId: "assignment-art", value: "approve", reasonCode: null,
    evidenceScopeRefs: [scope], conditions: [], createdAt: REVIEW_TEST_AT };
  return { aggregate, task, submission, deliverable, policy, decision };
}
