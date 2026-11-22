import {
  decodeResubmissionEvidenceRefs,
  planProductionReviewResubmission,
  type CutPlan,
  type ProductionProjectAggregate,
  type ResubmitForReviewCommand,
  type ReviewDecision,
  type ReviewLane,
  type ReviewPolicy,
  type Submission,
} from "@toonstudio/core/production";

export { decodeResubmissionEvidenceRefs, encodeResubmissionEvidenceRefs } from "@toonstudio/core/production";

export interface ResubmissionRequestEntry {
  readonly id: string;
  readonly kind: "clarification" | "change-request" | "review-decision";
  readonly scopeLabel: string;
  readonly summary: string;
  readonly blocking: boolean;
  readonly status: "resolved" | "open";
}

export interface NextLaneReviewerEntry {
  readonly lane: ReviewLane;
  readonly assignmentId: string;
  readonly displayName: string;
  readonly roleLabel: string;
  readonly approvedInCurrentRevision: boolean;
}

export interface PriorRevisionApprovalEntry {
  readonly lane: ReviewLane;
  readonly assignmentId: string;
  readonly displayName: string;
  readonly previousRevision: number;
}

export interface DerivedSubmissionResubmissionSummary {
  readonly isResubmitted: boolean;
  readonly previousSubmission: Submission | null;
  readonly previousRevisionNumber: number | null;
  readonly changedCutIds: readonly string[];
  readonly unchangedCutIds: readonly string[];
  readonly resolvedRequests: readonly ResubmissionRequestEntry[];
  readonly openRequests: readonly ResubmissionRequestEntry[];
  readonly nextReviewers: readonly NextLaneReviewerEntry[];
  readonly priorApprovedReviewers: readonly PriorRevisionApprovalEntry[];
  readonly note: string | null;
}

export function planProductionSubmissionResubmission(input: {
  readonly aggregate: ProductionProjectAggregate;
  readonly previousSubmission: Submission;
  readonly changedCutIds: readonly string[];
  readonly resolveClarificationIds?: readonly string[];
  readonly resolutionNote?: string;
  readonly submittedByAssignmentId?: string;
  readonly at: string;
}) {
  const command: ResubmitForReviewCommand = {
    type: "resubmit-for-review",
    previousSubmissionId: input.previousSubmission.id,
    submittedByAssignmentId: input.submittedByAssignmentId ?? input.previousSubmission.submittedByAssignmentId,
    changedCutIds: input.changedCutIds,
    resolveClarificationIds: input.resolveClarificationIds ?? [],
    resolutionNote: input.resolutionNote ?? "",
  };
  const { nextSubmission } = planProductionReviewResubmission(input.aggregate, command, input.at);
  return { nextSubmission, steps: [{ command }] as const };
}

export function deriveSubmissionResubmissionSummary(input: {
  readonly aggregate: ProductionProjectAggregate;
  readonly submission: Submission | null;
  readonly policy: ReviewPolicy | null;
  readonly currentDecisions: readonly ReviewDecision[];
  readonly cuts: readonly CutPlan[];
  readonly episodeId: string;
  readonly partyLabelForAssignment: (assignmentId: string) => string;
  readonly roleLabelForAssignment: (assignmentId: string) => string;
}): DerivedSubmissionResubmissionSummary | null {
  const { aggregate, submission, policy, currentDecisions, cuts, episodeId } = input;
  if (!submission) return null;
  const decoded = decodeResubmissionEvidenceRefs(submission.evidenceRefs);
  const supersededSiblings = aggregate.submissions
    .filter(
      (entry) => entry.deliverableId === submission.deliverableId
        && entry.projectId === aggregate.projectId
        && entry.id !== submission.id
        && entry.revisionRef.revision < submission.revisionRef.revision,
    )
    .sort((a, b) => b.revisionRef.revision - a.revisionRef.revision);

  const previousSubmission = decoded?.previousSubmissionId
    ? aggregate.submissions.find((entry) => entry.id === decoded.previousSubmissionId) ?? supersededSiblings[0] ?? null
    : supersededSiblings[0] ?? null;

  if (!decoded && !previousSubmission) return null;

  const cutIds = cuts.map((cut) => cut.cutId);
  const changedCutIds = decoded
    ? decoded.changedCutIds.filter((id) => cutIds.includes(id) || cutIds.length === 0)
    : [];
  const changedSet = new Set(changedCutIds);
  const unchangedCutIds = cutIds.filter((id) => !changedSet.has(id));

  const handoffIds = new Set(
    aggregate.handoffs
      .filter((handoff) => handoff.episodeId === episodeId && !["superseded", "cancelled"].includes(handoff.status))
      .map((handoff) => handoff.id),
  );
  const clarifications = aggregate.clarifications.filter((entry) => handoffIds.has(entry.handoffId));
  const resolvedRequests: ResubmissionRequestEntry[] = [];
  const openRequests: ResubmissionRequestEntry[] = [];

  for (const thread of clarifications) {
    const entry: ResubmissionRequestEntry = {
      id: thread.id,
      kind: "clarification",
      scopeLabel: thread.scope.id,
      summary: thread.question,
      blocking: thread.blocking,
      status: thread.status === "open" || thread.status === "answered" ? "open" : "resolved",
    };
    if (entry.status === "open") openRequests.push(entry);
    else resolvedRequests.push(entry);
  }

  if (previousSubmission) {
    for (const decision of aggregate.reviewDecisions) {
      if (decision.reviewRoundId === previousSubmission.id && (decision.value === "request-changes" || decision.value === "veto")) {
        resolvedRequests.push({
          id: decision.id,
          kind: "review-decision",
          scopeLabel: `${previousSubmission.revisionRef.revision}차 검수`,
          summary: decision.conditions[0] ?? "이전 리비전 수정 요청 반영",
          blocking: false,
          status: "resolved",
        });
      }
    }
  }

  for (const req of aggregate.changeRequests) {
    if (req.episodeId !== episodeId) continue;
    const isResolved = ["completed", "cancelled", "rejected"].includes(req.status);
    const item: ResubmissionRequestEntry = {
      id: req.id,
      kind: "change-request",
      scopeLabel: req.changedScopes[0]?.id ?? episodeId,
      summary: req.reason,
      blocking: false,
      status: isResolved ? "resolved" : "open",
    };
    if (isResolved) resolvedRequests.push(item);
    else openRequests.push(item);
  }

  const currentApprovedSet = new Set(
    currentDecisions
      .filter((decision) => decision.value === "approve")
      .map((decision) => `${decision.lane}:${decision.assignmentId}`),
  );

  const nextReviewers: NextLaneReviewerEntry[] = (policy?.lanes ?? []).flatMap((lane) =>
    lane.eligibleAssignmentIds.map((assignmentId) => ({
      lane: lane.lane,
      assignmentId,
      displayName: input.partyLabelForAssignment(assignmentId),
      roleLabel: input.roleLabelForAssignment(assignmentId),
      approvedInCurrentRevision: currentApprovedSet.has(`${lane.lane}:${assignmentId}`),
    })),
  );

  const priorApprovedReviewers: PriorRevisionApprovalEntry[] = previousSubmission
    ? aggregate.reviewDecisions
        .filter(
          (decision) => decision.reviewRoundId === previousSubmission.id
            && (decision.value === "approve" || decision.value === "approve-with-conditions"),
        )
        .map((decision) => ({
          lane: decision.lane,
          assignmentId: decision.assignmentId,
          displayName: input.partyLabelForAssignment(decision.assignmentId),
          previousRevision: previousSubmission.revisionRef.revision,
        }))
    : [];

  return {
    isResubmitted: Boolean(decoded),
    previousSubmission,
    previousRevisionNumber: previousSubmission?.revisionRef.revision ?? null,
    changedCutIds,
    unchangedCutIds,
    resolvedRequests,
    openRequests,
    nextReviewers,
    priorApprovedReviewers,
    note: decoded?.note ?? null,
  };
}
