import { activeAssignments } from "./collaboration";
import { latestProductionCuts } from "./planning";
import { stableProductionFingerprint } from "./procurement";
import { episodeScope, isProductionIdentity, projectScope, scopeContains, scopeIntersects } from "./scope";
import { createProductionTaskWorkflowReader } from "./workflow";

import type {
  ApprovalEvaluation,
  ApprovalLaneEvaluation,
  ReviewDecision,
  ReviewLane,
  ReviewPolicy,
  ProductionProjectAggregate,
  ProductionTask,
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
    const approvedDecisions = laneDecisions.filter((decision) =>
      (decision.value === "approve" || decision.value === "approve-with-conditions")
      && (policy.quorumBasis !== "accounts" || isProductionIdentity(decision.reviewerAccountUserId)));
    const approvals = policy.quorumBasis === "accounts"
      ? new Set(approvedDecisions.map((decision) => decision.reviewerAccountUserId)).size
      : approvedDecisions.length;
    const approvedAssignments = new Set(approvedDecisions.map((decision) => decision.assignmentId));
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

const RESUBMIT_PREV_PREFIX = "resubmit-prev:";
const RESUBMIT_CHANGED_CUTS_PREFIX = "resubmit-changed-cuts:";
const RESUBMIT_RESOLVED_REQS_PREFIX = "resubmit-resolved-reqs:";
const RESUBMIT_OPEN_REQS_PREFIX = "resubmit-open-reqs:";
const RESUBMIT_NOTE_PREFIX = "resubmit-note:";

export interface ResubmitForReviewCommand {
  readonly type: "resubmit-for-review";
  readonly previousSubmissionId: string;
  readonly changedCutIds: readonly string[];
  readonly resolveClarificationIds: readonly string[];
  readonly resolutionNote: string;
  readonly submittedByAssignmentId: string;
}

export class ProductionResubmissionError extends Error {}

type ResubmissionStepCommand =
  | { readonly type: "upsert-clarification"; readonly clarification: ClarificationThread }
  | { readonly type: "upsert-task"; readonly task: ProductionTask }
  | { readonly type: "upsert-submission"; readonly submission: Submission };

/** 이전 버전은 컷과 요청을 쉼표로 묶고 메모는 URI 구성요소로 저장했다. */
export function isProductionResubmissionEvidenceRef(value: string): boolean {
  if (value.startsWith(RESUBMIT_PREV_PREFIX)) return isProductionIdentity(value.slice(RESUBMIT_PREV_PREFIX.length));
  if (value.startsWith(RESUBMIT_NOTE_PREFIX)) {
    const note = value.slice(RESUBMIT_NOTE_PREFIX.length);
    if (!note || note.length > 36_000) return false;
    try {
      const decoded = decodeURIComponent(note);
      return decoded.length <= 4_000 && encodeURIComponent(decoded) === note;
    } catch {
      return false;
    }
  }
  const prefix = [RESUBMIT_CHANGED_CUTS_PREFIX, RESUBMIT_RESOLVED_REQS_PREFIX, RESUBMIT_OPEN_REQS_PREFIX]
    .find((candidate) => value.startsWith(candidate));
  if (!prefix) return false;
  const ids = value.slice(prefix.length);
  return ids === "" || ids.split(",").every(isProductionIdentity);
}

function nextRevisionId(previousId: string, revision: number): string {
  const stem = previousId.replace(/-r\d+$/u, "");
  const suffix = `-r${revision}`;
  if (stem.length + suffix.length <= 160) return stem + suffix;
  const digest = stableProductionFingerprint(stem).slice("fnv1a64:".length);
  return stem.slice(0, 160 - suffix.length - digest.length - 1) + "-" + digest + suffix;
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
    refs.push(`${RESUBMIT_NOTE_PREFIX}${encodeURIComponent(trimmedNote)}`);
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

/** 잠근 프로젝트의 현재 기록에서 재제출에 필요한 변경 순서를 정한다. */
export function planProductionReviewResubmission(
  aggregate: ProductionProjectAggregate,
  command: ResubmitForReviewCommand,
  at: string,
): { readonly nextSubmission: Submission; readonly commands: readonly ResubmissionStepCommand[] } {
  const previousSubmission = aggregate.submissions.find((entry) => entry.id === command.previousSubmissionId && entry.projectId === aggregate.projectId);
  const deliverable = aggregate.deliverables.find((entry) => entry.id === previousSubmission?.deliverableId && entry.projectId === aggregate.projectId);
  if (!previousSubmission || !deliverable || deliverable.currentSubmissionId !== previousSubmission.id || previousSubmission.status !== "changes-requested") {
    throw new ProductionResubmissionError("현재 산출물의 수정 요청 제출본에서만 재제출할 수 있습니다.");
  }
  if (previousSubmission.sourceEvidence) {
    throw new ProductionResubmissionError("고정 원고는 작업물 제출에서 수정한 원고 버전을 선택해 재제출하세요.");
  }
  const submitter = activeAssignments(aggregate.assignments, at).find((assignment) =>
    assignment.id === command.submittedByAssignmentId && assignment.status === "active" && assignment.projectId === aggregate.projectId);
  if (!submitter || !scopeContains(submitter.scope, deliverable.scope)) {
    throw new ProductionResubmissionError("산출물 범위의 활성 담당자로 재제출하세요.");
  }
  const scopePath = [...deliverable.scope.ancestors, deliverable.scope];
  const episodeId = scopePath.find((scope) => scope.kind === "episode")?.id ?? null;
  const sceneId = scopePath.find((scope) => scope.kind === "scene")?.id;
  const cutId = scopePath.find((scope) => scope.kind === "cut")?.id;
  const seasonId = scopePath.find((scope) => scope.kind === "season")?.id;
  const episodeIds = seasonId ? new Set(aggregate.episodePlans.filter((entry) => entry.projectId === aggregate.projectId && entry.seasonId === seasonId).map((entry) => entry.episodeId)) : null;
  const availableCuts = new Set(latestProductionCuts(aggregate.cutPlans).filter((cut) => cut.projectId === aggregate.projectId
    && (!episodeId || cut.episodeId === episodeId) && (!sceneId || cut.sceneId === sceneId) && (!cutId || cut.cutId === cutId)
    && (!episodeIds || episodeIds.has(cut.episodeId))).map((cut) => cut.cutId));
  const changedCutIds = normalizeUniqueIds(command.changedCutIds);
  if (!changedCutIds.length || changedCutIds.some((id) => !availableCuts.has(id))) {
    throw new ProductionResubmissionError("산출물 범위에서 수정한 컷을 선택하세요.");
  }
  if (command.resolutionNote.length > 4_000 || /\p{Surrogate}/u.test(command.resolutionNote)) {
    throw new ProductionResubmissionError("수정 요약은 올바른 문자로 4,000자 이내로 입력하세요.");
  }
  const maxRevision = aggregate.submissions.filter((entry) => entry.deliverableId === deliverable.id && entry.projectId === aggregate.projectId)
    .reduce((max, entry) => Math.max(max, entry.revisionRef.revision), previousSubmission.revisionRef.revision);
  const nextRevisionNumber = maxRevision + 1;
  const nextSubmissionId = nextRevisionId(previousSubmission.id, nextRevisionNumber);
  const nextRevision = nextRevisionId(previousSubmission.revisionRef.id, nextRevisionNumber);
  if (aggregate.submissions.some((entry) => entry.id === nextSubmissionId) || aggregate.reviewDecisions.some((entry) => entry.reviewRoundId === nextSubmissionId)) {
    throw new ProductionResubmissionError("같은 식별자의 제출본 또는 검수 기록이 이미 있습니다.");
  }
  const resolutionText = command.resolutionNote.trim() || "수정본 반영 후 재제출 완료";
  const resolveSet = new Set(normalizeUniqueIds(command.resolveClarificationIds ?? []));
  const handoffIds = new Set(
    aggregate.handoffs
      .filter((handoff) => handoff.episodeId === episodeId && !["superseded", "cancelled"].includes(handoff.status))
      .map((handoff) => handoff.id),
  );
  const episodeClarifications = aggregate.clarifications.filter((entry) => handoffIds.has(entry.handoffId));
  const knownRequests = new Set(episodeClarifications.map((entry) => entry.id));
  if ([...resolveSet].some((id) => !knownRequests.has(id))) {
    throw new ProductionResubmissionError("현재 회차에서 해결할 검수 요청을 다시 선택하세요.");
  }

  const commands: ResubmissionStepCommand[] = [];
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
      commands.push({ type: "upsert-clarification", clarification: updated });
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
    commands.push({ type: "upsert-task", task: { ...task, status: "in-progress", statusChangedAt: at } });
  }

  const nextSubmission: Submission = {
    id: nextSubmissionId,
    projectId: aggregate.projectId,
    deliverableId: deliverable.id,
    revisionRef: {
      id: nextRevision,
      lineage: previousSubmission.revisionRef.lineage,
      revision: nextRevisionNumber,
      digest: stableProductionFingerprint({ nextSubmissionId, nextRevision, changedCutIds, at }),
      createdAt: at,
    },
    submittedByAssignmentId: command.submittedByAssignmentId,
    submittedAt: at,
    status: "in-review",
    inputRevisionRefs: [...previousSubmission.inputRevisionRefs],
    evidenceRefs: encodeResubmissionEvidenceRefs({
      previousSubmissionId: previousSubmission.id,
      changedCutIds,
      resolvedRequestIds,
      openRequestIds,
      note: command.resolutionNote,
    }),
  };

  commands.push(
    { type: "upsert-submission", submission: { ...nextSubmission, status: "submitted" } },
    { type: "upsert-submission", submission: { ...previousSubmission, status: "superseded" } },
    { type: "upsert-submission", submission: nextSubmission },
  );
  for (const task of linkedChangesTasks) {
    commands.push({ type: "upsert-task", task: { ...task, status: "internal-review", statusChangedAt: at } });
  }
  return { nextSubmission, commands };
}
