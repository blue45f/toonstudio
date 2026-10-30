import { describe, expect, it } from "vitest";

import { createProductionProjectAggregate } from "./aggregate";
import { episodeScope } from "./scope";
import { applyProductionStudioRevisionLink, evaluateProductionStudioRevisionCoverage, productionStudioDeliverableRole } from "./studio-revision";
import { applyProductionTaskOutput } from "./task-output";

import type { SubmitProductionTaskOutputCommand, VerifiedProductionTaskOutputCapture } from "./task-output-contract";
import type { EpisodeCollaboration, ProductionProjectAggregate, ProductionStudioRevisionLink, ProductionTask } from "./types";

const AT = "2026-10-29T06:00:00.000Z", ACTOR = "owner", ASSIGNMENT = "assignment:owner-party:producer";

function fixture() {
  const aggregate = createProductionProjectAggregate({ projectId: "production", workId: "work", title: "현재 승인 검수",
    ownerPartyId: "owner-party", ownerUserId: ACTOR, ownerDisplayName: "담당자", collaborationModel: "studio-production", at: AT });
  const scope = episodeScope(aggregate.projectId, "episode");
  const episode: EpisodeCollaboration = { id: "episode-collaboration", projectId: aggregate.projectId, episodeId: "episode",
    revision: 0, state: "episode-planning", narrativeRevisionRef: null, visualRevisionRef: null, integratedRevisionRef: null,
    activeHandoffId: null, openBlockerCount: 0, storyLockApproved: false, thumbnailLockApproved: false, jointProofApproved: false,
    creditPreflightPassed: false, publicationPreflightPassed: false, updatedAt: AT };
  const task: ProductionTask = { id: "task", projectId: aggregate.projectId, scope, processKey: "final", title: "최종 원고",
    status: "draft", assignmentIds: [], reviewerAssignmentIds: [], dependencyTaskIds: [], inputRevisionRefs: [], outputDeliverableIds: [],
    dueAt: null, estimateHours: null, completionCriteria: ["검수"], sourceAgreementMilestoneId: null };
  const capture: VerifiedProductionTaskOutputCapture = { subject: { schemaVersion: 1, workId: aggregate.workId, projectId: "graph",
    artifactId: "capture", reviewId: "review", revisionId: "snapshot", rootGraphHash: "a".repeat(64) },
  sourceServerRevision: 3, captureSequence: 7, createdAt: AT, pages: [{ pageId: "page", ordinal: 0, sha256: "b".repeat(64), frameIds: [] }] };
  const command: SubmitProductionTaskOutputCommand = { type: "submit-task-output", taskId: task.id, submissionId: "submission",
    submittedByAssignmentId: ASSIGNMENT, documentRole: "final", source: { subject: capture.subject }, selection: { mode: "document" },
    inputs: { mode: "initial-capture", source: { subject: capture.subject } },
    target: { kind: "create", deliverableId: "deliverable", type: "자유 원고 정의", expectedFormat: "studio-document", completionCriteria: ["확인"] } };
  return { aggregate: { ...aggregate, episodes: [episode], tasks: [task] }, task, capture, command };
}

function approveAndLink(aggregate: ProductionProjectAggregate, submissionId: string): ProductionProjectAggregate {
  const submission = aggregate.submissions.find((entry) => entry.id === submissionId);
  if (!submission) throw new Error("승인할 실제 제출이 필요합니다.");
  const approved: ProductionProjectAggregate = { ...aggregate,
    submissions: aggregate.submissions.map((entry) => entry.id === submissionId ? { ...entry, status: "approved", evidenceRefs: ["decision"] } : entry),
    deliverables: aggregate.deliverables.map((entry) => entry.id === submission.deliverableId
      ? { ...entry, currentSubmissionId: submissionId, approvedSubmissionId: submissionId } : entry),
  };
  const link: ProductionStudioRevisionLink = { id: `link-${submissionId}`, projectId: aggregate.projectId, workId: aggregate.workId,
    episodeId: "episode", studioDocumentRef: submission.revisionRef.id, documentRole: "final", studioRevisionRef: submission.revisionRef,
    deliverableId: submission.deliverableId, submissionId, linkedByAssignmentId: ASSIGNMENT,
    status: "approved", linkedAt: AT, approvedAt: AT };
  return applyProductionStudioRevisionLink(approved, link);
}

describe("현재 산출물 승인에 근거한 Studio coverage", () => {
  it("명시한 제출 역할을 자유 type보다 우선하고 재제출 뒤 이전 승인 링크로 완료하지 않는다", () => {
    const f = fixture();
    const first = applyProductionTaskOutput(f.aggregate, f.command, ACTOR, AT, { output: f.capture, initial: f.capture });
    const approved = approveAndLink(first.aggregate, f.command.submissionId);
    const deliverable = approved.deliverables[0];
    if (!deliverable) throw new Error("산출물이 필요합니다.");
    expect(productionStudioDeliverableRole(approved, deliverable)).toBe("final");
    expect(evaluateProductionStudioRevisionCoverage(approved, "episode")).toMatchObject({ expectedRoles: ["final"], approvedRoles: ["final"], readyForIntegratedReview: true });
    const command: SubmitProductionTaskOutputCommand = { ...f.command, submissionId: "submission-next", inputs: { mode: "current" },
      target: { kind: "existing", deliverableId: first.deliverableId } };
    const next = applyProductionTaskOutput(approved, command, ACTOR, AT, { output: f.capture }).aggregate;
    expect(next.studioRevisionLinks).toBe(approved.studioRevisionLinks);
    expect(next.studioRevisionLinks?.[0]?.status).toBe("approved");
    expect(evaluateProductionStudioRevisionCoverage(next, "episode")).toMatchObject({ approvedRoles: [], pendingRoles: [], missingRoles: ["final"], readyForIntegratedReview: false });
    const submission = next.submissions.find((entry) => entry.id === command.submissionId);
    const oldLink = next.studioRevisionLinks?.[0];
    if (!submission || !oldLink) throw new Error("현재 제출과 과거 링크가 필요합니다.");
    const pending: ProductionStudioRevisionLink = { ...oldLink, id: "link-current", submissionId: submission.id,
      studioRevisionRef: submission.revisionRef, status: "submitted", approvedAt: null };
    const awaiting = { ...next, studioRevisionLinks: [...(next.studioRevisionLinks ?? []), pending] };
    expect(evaluateProductionStudioRevisionCoverage(awaiting, "episode")).toMatchObject({ pendingRoles: ["final"], missingRoles: [], readyForIntegratedReview: false });
    expect(evaluateProductionStudioRevisionCoverage(approveAndLink(awaiting, command.submissionId), "episode").readyForIntegratedReview).toBe(true);
    expect(evaluateProductionStudioRevisionCoverage(approved, "episode").readyForIntegratedReview).toBe(true);
  });

  it("같은 역할의 일부 산출물만 승인되면 전체 역할을 승인으로 집계하지 않는다", () => {
    const f = fixture(), otherTask = { ...f.task, id: "other-task" };
    const first = applyProductionTaskOutput({ ...f.aggregate, tasks: [f.task, otherTask] }, f.command, ACTOR, AT, { output: f.capture, initial: f.capture });
    const other: SubmitProductionTaskOutputCommand = { ...f.command, taskId: otherTask.id, submissionId: "other-submission",
      target: { kind: "create", deliverableId: "other-deliverable", type: "두 번째 자유 원고", expectedFormat: "studio-document", completionCriteria: ["확인"] } };
    const second = applyProductionTaskOutput(first.aggregate, other, ACTOR, AT, { output: f.capture, initial: f.capture }).aggregate;
    const partial = approveAndLink(second, f.command.submissionId);
    expect(evaluateProductionStudioRevisionCoverage(partial, "episode")).toMatchObject({ expectedRoles: ["final"], approvedRoles: [], missingRoles: ["final"], readyForIntegratedReview: false });
    expect(evaluateProductionStudioRevisionCoverage(approveAndLink(partial, other.submissionId), "episode"))
      .toMatchObject({ approvedRoles: ["final"], missingRoles: [], readyForIntegratedReview: true });
  });

  it("현재 승인 이력은 담당 종료 뒤에도 유지하지만 잘못된 pointer·상태·업무 참조는 승인으로 보지 않는다", () => {
    const f = fixture(), first = applyProductionTaskOutput(f.aggregate, f.command, ACTOR, AT, { output: f.capture, initial: f.capture });
    const approved = approveAndLink(first.aggregate, f.command.submissionId);
    const ended = { ...approved, assignments: approved.assignments.map((assignment) => ({ ...assignment, status: "ended" as const })) };
    expect(evaluateProductionStudioRevisionCoverage(ended, "episode").readyForIntegratedReview).toBe(true);
    const link = approved.studioRevisionLinks?.[0];
    if (!link) throw new Error("승인 링크가 필요합니다.");
    const invalid: readonly ProductionProjectAggregate[] = [
      { ...approved, deliverables: approved.deliverables.map((deliverable) => ({ ...deliverable, currentSubmissionId: null })) },
      { ...approved, submissions: approved.submissions.map((submission) => ({ ...submission, status: "changes-requested" })) },
      { ...approved, studioRevisionLinks: [{ ...link, workId: "other-work" }] },
      { ...approved, studioRevisionLinks: [{ ...link, studioRevisionRef: { ...link.studioRevisionRef, productionSubmissionId: "other-submission" } }] },
    ];
    for (const aggregate of invalid) expect(evaluateProductionStudioRevisionCoverage(aggregate, "episode").approvedRoles).toEqual([]);
  });
});
