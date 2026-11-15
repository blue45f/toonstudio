import {
  activeAssignments,
  createProductionTaskWorkflowReader,
  scopeContains,
  type ClarificationThread,
  type CutPlan,
  type ProductionProjectAggregate,
  type ReviewDecision,
  type ReviewLane,
  type ReviewPolicy,
  type Submission,
} from "@toonstudio/core/production";

import type { ProductionClientCommand } from "./production-api";

const RESUBMIT_PREV_PREFIX = "resubmit-prev:";
const RESUBMIT_CHANGED_CUTS_PREFIX = "resubmit-changed-cuts:";
const RESUBMIT_RESOLVED_REQS_PREFIX = "resubmit-resolved-reqs:";
const RESUBMIT_OPEN_REQS_PREFIX = "resubmit-open-reqs:";
const RESUBMIT_NOTE_PREFIX = "resubmit-note:";

export interface SubmissionResubmitStep {
  readonly stage:
    | "resolve-clarification"
    | "resume-task"
    | "supersede-previous"
    | "create-submission"
    | "reenter-review";
  readonly command: ProductionClientCommand;
}

export interface PlanSubmissionResubmissionInput {
  readonly aggregate: ProductionProjectAggregate;
  readonly previousSubmission: Submission;
  readonly changedCutIds: readonly string[];
  readonly resolveClarificationIds?: readonly string[];
  readonly resolutionNote?: string;
  readonly submittedByAssignmentId?: string;
  readonly at: string;
}

export interface PlannedSubmissionResubmission {
  readonly nextSubmission: Submission;
  readonly steps: readonly SubmissionResubmitStep[];
}

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

function stripTrailingRevisionSuffix(id: string): string {
  return id.replace(/-r\d+$/u, "");
}

function buildHexDigest(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
  }
  const part = `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
  return `sha256:${part.repeat(4).slice(0, 64)}`;
}

function normalizeUniqueIds(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function encodeResubmissionEvidenceRefs(input: {
  readonly previousSubmissionId: string;
  readonly changedCutIds: readonly string[];
  readonly resolvedRequestIds: readonly string[];
  readonly openRequestIds: readonly string[];
  readonly note?: string;
}): readonly string[] {
  const refs: string[] = [
    `${RESUBMIT_PREV_PREFIX}${input.previousSubmissionId}`,
    `${RESUBMIT_CHANGED_CUTS_PREFIX}${normalizeUniqueIds(input.changedCutIds).join(",")}`,
    `${RESUBMIT_RESOLVED_REQS_PREFIX}${normalizeUniqueIds(input.resolvedRequestIds).join(",")}`,
    `${RESUBMIT_OPEN_REQS_PREFIX}${normalizeUniqueIds(input.openRequestIds).join(",")}`,
  ];
  const trimmedNote = input.note?.trim() ?? "";
  if (trimmedNote) {
    refs.push(`${RESUBMIT_NOTE_PREFIX}${encodeURIComponent(trimmedNote.slice(0, 240))}`);
  }
  return refs;
}

export function decodeResubmissionEvidenceRefs(evidenceRefs: readonly string[]): {
  readonly previousSubmissionId: string | null;
  readonly changedCutIds: readonly string[];
  readonly resolvedRequestIds: readonly string[];
  readonly openRequestIds: readonly string[];
  readonly note: string | null;
} | null {
  const prevRef = evidenceRefs.find((ref) => ref.startsWith(RESUBMIT_PREV_PREFIX));
  if (!prevRef) return null;
  const parseList = (prefix: string): readonly string[] => {
    const matched = evidenceRefs.find((ref) => ref.startsWith(prefix));
    if (!matched) return [];
    return normalizeUniqueIds(matched.slice(prefix.length).split(","));
  };
  const noteRef = evidenceRefs.find((ref) => ref.startsWith(RESUBMIT_NOTE_PREFIX));
  let note: string | null = null;
  if (noteRef) {
    try {
      note = decodeURIComponent(noteRef.slice(RESUBMIT_NOTE_PREFIX.length)) || null;
    } catch {
      note = noteRef.slice(RESUBMIT_NOTE_PREFIX.length) || null;
    }
  }
  return {
    previousSubmissionId: prevRef.slice(RESUBMIT_PREV_PREFIX.length).trim() || null,
    changedCutIds: parseList(RESUBMIT_CHANGED_CUTS_PREFIX),
    resolvedRequestIds: parseList(RESUBMIT_RESOLVED_REQS_PREFIX),
    openRequestIds: parseList(RESUBMIT_OPEN_REQS_PREFIX),
    note,
  };
}

export function planProductionSubmissionResubmission(
  input: PlanSubmissionResubmissionInput,
): PlannedSubmissionResubmission {
  const { aggregate, previousSubmission, at } = input;
  const deliverable = aggregate.deliverables.find(
    (entry) => entry.id === previousSubmission.deliverableId && entry.projectId === aggregate.projectId,
  );
  if (!deliverable || deliverable.currentSubmissionId !== previousSubmission.id) {
    throw new Error("현재 산출물의 수정 요청 제출본에서만 재제출할 수 있습니다.");
  }
  if (previousSubmission.status !== "changes-requested") {
    throw new Error("수정 요청(changes-requested) 상태인 제출본만 새 리비전으로 재제출할 수 있습니다.");
  }
  const changedCutIds = normalizeUniqueIds(input.changedCutIds);
  if (changedCutIds.length === 0) {
    throw new Error("재제출 전 수정·반영한 컷을 최소 1개 이상 선택하세요.");
  }

  const activeIds = new Set(
    activeAssignments(aggregate.assignments, at)
      .filter((assignment) => assignment.projectId === aggregate.projectId)
      .map((assignment) => assignment.id),
  );
  const submitterId = input.submittedByAssignmentId && activeIds.has(input.submittedByAssignmentId)
    ? input.submittedByAssignmentId
    : activeIds.has(previousSubmission.submittedByAssignmentId)
      ? previousSubmission.submittedByAssignmentId
      : [...activeIds][0];
  if (!submitterId) {
    throw new Error("재제출을 기록할 활성 담당자 배정이 없습니다.");
  }

  const maxRev = aggregate.submissions
    .filter((entry) => entry.deliverableId === deliverable.id && entry.projectId === aggregate.projectId)
    .reduce((max, entry) => Math.max(max, entry.revisionRef.revision), previousSubmission.revisionRef.revision);
  const nextRevisionNumber = maxRev + 1;
  const nextSubmissionId = `${stripTrailingRevisionSuffix(previousSubmission.id)}-r${nextRevisionNumber}`;
  const nextRevisionId = `${stripTrailingRevisionSuffix(previousSubmission.revisionRef.id)}-r${nextRevisionNumber}`;
  const resolutionText = input.resolutionNote?.trim() || "수정본 반영 후 재제출 완료";

  const resolveSet = new Set(normalizeUniqueIds(input.resolveClarificationIds ?? []));
  const episodeId = deliverable.scope.kind === "episode"
    ? deliverable.scope.id
    : deliverable.scope.ancestors.find((ancestor) => ancestor.kind === "episode")?.id ?? null;
  const handoffIds = new Set(
    aggregate.handoffs
      .filter((handoff) => handoff.episodeId === episodeId && !["superseded", "cancelled"].includes(handoff.status))
      .map((handoff) => handoff.id),
  );
  const episodeClarifications = aggregate.clarifications.filter((entry) => handoffIds.has(entry.handoffId));

  const steps: SubmissionResubmitStep[] = [];
  const resolvedRequestIds: string[] = [];
  const openRequestIds: string[] = [];

  for (const thread of episodeClarifications) {
    if (resolveSet.has(thread.id) && (thread.status === "open" || thread.status === "answered")) {
      const updated: ClarificationThread = {
        ...thread,
        status: "decision-recorded",
        answer: thread.answer ?? resolutionText,
        updatedAt: at,
      };
      steps.push({
        stage: "resolve-clarification",
        command: { type: "upsert-clarification", clarification: updated },
      });
      resolvedRequestIds.push(thread.id);
    } else if (thread.status === "decision-recorded" || thread.status === "closed") {
      resolvedRequestIds.push(thread.id);
    } else {
      openRequestIds.push(thread.id);
    }
  }

  for (const decision of aggregate.reviewDecisions) {
    if (decision.reviewRoundId === previousSubmission.id && (decision.value === "request-changes" || decision.value === "veto")) {
      resolvedRequestIds.push(decision.id);
    }
  }

  for (const changeReq of aggregate.changeRequests) {
    if (changeReq.episodeId !== episodeId) continue;
    if (["completed", "cancelled", "rejected"].includes(changeReq.status)) {
      resolvedRequestIds.push(changeReq.id);
    } else {
      openRequestIds.push(changeReq.id);
    }
  }

  const workflowReader = createProductionTaskWorkflowReader(aggregate);
  const linkedChangesTasks = aggregate.tasks.filter(
    (task) => task.projectId === aggregate.projectId
      && task.outputDeliverableIds.includes(deliverable.id)
      && scopeContains(task.scope, deliverable.scope)
      && task.status === "changes-requested"
      && workflowReader.hasCurrentDependencyInputs(task),
  );

  for (const task of linkedChangesTasks) {
    steps.push({
      stage: "resume-task",
      command: {
        type: "upsert-task",
        task: { ...task, status: "in-progress", statusChangedAt: at },
      },
    });
  }

  steps.push({
    stage: "supersede-previous",
    command: {
      type: "upsert-submission",
      submission: { ...previousSubmission, status: "superseded" },
    },
  });

  const nextSubmission: Submission = {
    id: nextSubmissionId,
    projectId: aggregate.projectId,
    deliverableId: deliverable.id,
    revisionRef: {
      id: nextRevisionId,
      lineage: previousSubmission.revisionRef.lineage,
      revision: nextRevisionNumber,
      digest: buildHexDigest(`${nextSubmissionId}:${nextRevisionId}:${changedCutIds.join(",")}:${at}`),
      createdAt: at,
    },
    submittedByAssignmentId: submitterId,
    submittedAt: at,
    status: "in-review",
    inputRevisionRefs: [...previousSubmission.inputRevisionRefs],
    evidenceRefs: encodeResubmissionEvidenceRefs({
      previousSubmissionId: previousSubmission.id,
      changedCutIds,
      resolvedRequestIds,
      openRequestIds,
      note: input.resolutionNote,
    }),
  };

  steps.push({
    stage: "create-submission",
    command: { type: "upsert-submission", submission: nextSubmission },
  });

  for (const task of linkedChangesTasks) {
    steps.push({
      stage: "reenter-review",
      command: {
        type: "upsert-task",
        task: { ...task, status: "internal-review", statusChangedAt: at },
      },
    });
  }

  return { nextSubmission, steps };
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
