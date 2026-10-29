import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  createProductionProjectAggregate,
  episodeScope,
  projectScope,
  type Deliverable,
  type ProductionProjectAggregate,
  type ProductionStudioRevisionLink,
  type ProductionTask,
  type ProductionTaskOutputCaptures,
  type ProductionTaskOutputEvidence,
  type Submission,
  type SubmitProductionTaskOutputCommand,
} from "@toonstudio/core/production";
import { applyProductionSubmissionCommand } from "./production-submission-command";
import { ProductionCollaborationRepository, type ProductionProjectAccess } from "./production-collaboration.repository";
import { ProductionCollaborationService } from "./production-collaboration.service";
import { SubmitProductionTaskOutputCommandSchema } from "./production-submission.dto";

const at = "2026-10-29T09:00:00.000Z";
const assignmentId = "assignment:party-owner:producer";
const inputRevision = { id: "input-1", lineage: "integrated" as const, revision: 2,
  digest: `sha256:${"c".repeat(64)}`, createdAt: at };
const subject = { schemaVersion: 1 as const, workId: "work-1", projectId: "graph-1", artifactId: "capture-1",
  reviewId: "review-1", revisionId: "revision-7", rootGraphHash: "a".repeat(64) };
const scope = projectScope("production-1");
const captures: ProductionTaskOutputCaptures = { output: { subject, sourceServerRevision: 7, captureSequence: 900, createdAt: at,
  pages: [{ pageId: "page/work-1:0", ordinal: 0, sha256: "b".repeat(64), frameIds: ["frame@1"] }] } };
const evidence: ProductionTaskOutputEvidence = { version: 1, kind: "studio-review-capture", taskId: "task-1", scope,
  documentRole: "lineart", subject, sourceServerRevision: 7, captureSequence: 900, selectionMode: "document",
  pages: [{ pageId: "page/work-1:0", ordinal: 0, sha256: "b".repeat(64), frameIds: [] }] };
const deliverable: Deliverable = { id: "deliverable-1", projectId: "production-1", scope, type: "lineart", expectedFormat: "PNG",
  completionCriteria: ["선화 확인"], currentSubmissionId: "submission-current", approvedSubmissionId: null };
const task: ProductionTask = { id: "task-1", projectId: "production-1", scope, processKey: "line-art", title: "선화",
  status: "internal-review", assignmentIds: [assignmentId], reviewerAssignmentIds: [], inputRevisionRefs: [inputRevision],
  outputDeliverableIds: [deliverable.id], dependencyTaskIds: [], dueAt: null, estimateHours: null,
  completionCriteria: ["선화 확인"], sourceAgreementMilestoneId: null };
const command: SubmitProductionTaskOutputCommand = { type: "submit-task-output", taskId: task.id, submissionId: "submission-new",
  submittedByAssignmentId: assignmentId, documentRole: "lineart", source: { subject }, selection: { mode: "document" },
  inputs: { mode: "current" }, target: { kind: "existing", deliverableId: deliverable.id } };

function legacySubmission(): Submission {
  return { id: "submission-current", projectId: "production-1", deliverableId: deliverable.id,
    revisionRef: { id: subject.revisionId, lineage: "visual", revision: 7, digest: `sha256:${subject.rootGraphHash}`, createdAt: at },
    submittedByAssignmentId: assignmentId, submittedAt: at, status: "in-review", inputRevisionRefs: [inputRevision], evidenceRefs: [] };
}

function revisionLink(linkedByAssignmentId: string = assignmentId): ProductionStudioRevisionLink {
  return { id: "link-1", projectId: "production-1", workId: "work-1", episodeId: null,
    studioDocumentRef: "document-lineart", documentRole: "lineart", studioRevisionRef: legacySubmission().revisionRef,
    deliverableId: deliverable.id, submissionId: "submission-current", linkedByAssignmentId,
    status: "submitted", linkedAt: at, approvedAt: null };
}

function fixture(sourceEvidence?: ProductionTaskOutputEvidence): ProductionProjectAggregate {
  const base = createProductionProjectAggregate({ projectId: "production-1", workId: "work-1", title: "제출 계약",
    collaborationModel: "co-creator", ownerPartyId: "party-owner", ownerUserId: "owner-1", ownerDisplayName: "제작자", at });
  const submission = sourceEvidence ? { ...legacySubmission(), sourceEvidence,
    revisionRef: { ...legacySubmission().revisionRef, productionSubmissionId: "submission-current" } } : legacySubmission();
  return { ...base, tasks: [task], deliverables: [deliverable], submissions: [submission] };
}

describe("Production 제출 명령 경계", () => {
  it("검증한 capture를 core에 전달하고 실제 서버 revision과 새 포인터를 반환한다", () => {
    const before = fixture();
    const result = applyProductionSubmissionCommand(before, command, "owner-1", at, captures);
    expect(result.derived).toEqual({ deliverableId: deliverable.id, submissionId: "submission-new" });
    expect(result.aggregate.submissions.at(-1)).toMatchObject({ id: "submission-new", status: "submitted",
      revisionRef: { revision: 7, lineage: "visual" }, sourceEvidence: { captureSequence: 900, subject } });
    expect(result.aggregate.deliverables[0]).toMatchObject({ currentSubmissionId: "submission-new", approvedSubmissionId: null });
    expect(before.deliverables[0]?.currentSubmissionId).toBe("submission-current");
    expect(before.submissions).toHaveLength(1);
  });

  it("검증된 capture가 없으면 새 제출을 만들지 않는다", () => {
    expect(() => applyProductionSubmissionCommand(fixture(), command, "owner-1", at)).toThrow(BadRequestException);
  });

  it("core의 역할 거부·ID 충돌·입력 오류를 각각 403·409·400으로 변환한다", () => {
    expect(() => applyProductionSubmissionCommand(fixture(), command, "stranger", at, captures)).toThrow(ForbiddenException);
    expect(() => applyProductionSubmissionCommand(fixture(), { ...command, submissionId: "submission-current" }, "owner-1", at, captures))
      .toThrow(ConflictException);
    const before = fixture();
    expect(() => applyProductionSubmissionCommand({ ...before, tasks: [{ ...task, inputRevisionRefs: [] }] }, command, "owner-1", at, captures))
      .toThrow(BadRequestException);
  });

  it("이전 클라이언트가 근거를 생략해도 기존 서버 근거와 연결 작업 상태를 보존한다", () => {
    const before = fixture(evidence);
    const submission: Submission = { ...legacySubmission(), status: "changes-requested" };
    const result = applyProductionSubmissionCommand(before, { type: "upsert-submission", submission }, "owner-1", at);
    expect(result.aggregate.submissions[0]?.sourceEvidence).toEqual(evidence);
    expect(result.aggregate.submissions[0]?.status).toBe("changes-requested");
    expect(result.aggregate.tasks[0]).toMatchObject({ status: "changes-requested", statusChangedAt: at, completedAt: null });
    expect(before.submissions[0]?.status).toBe("in-review");
    expect(before.tasks[0]?.status).toBe("internal-review");
  });

  it("같은 근거를 포함한 상태 변경과 근거 없는 기존 제출을 계속 허용한다", () => {
    for (const sourceEvidence of [undefined, evidence]) {
      const before = fixture(sourceEvidence);
      const submission = { ...legacySubmission(), ...(sourceEvidence ? { sourceEvidence } : {}), status: "changes-requested" as const };
      const result = applyProductionSubmissionCommand(before, { type: "upsert-submission", submission }, "owner-1", at);
      expect(result.aggregate.submissions[0]?.sourceEvidence).toEqual(sourceEvidence);
    }
  });

  it("generic upsert로 근거를 새로 추가하거나 저장된 근거를 바꾸지 못한다", () => {
    const forged: Submission = { ...legacySubmission(), id: "forged", status: "submitted", sourceEvidence: evidence };
    expect(() => applyProductionSubmissionCommand(fixture(), { type: "upsert-submission", submission: forged }, "owner-1", at))
      .toThrow(BadRequestException);
    expect(() => applyProductionSubmissionCommand(fixture(), { type: "upsert-submission",
      submission: { ...legacySubmission(), sourceEvidence: evidence } }, "owner-1", at)).toThrow(BadRequestException);
    for (const sourceEvidence of [
      { ...evidence, sourceServerRevision: 8 },
      { ...evidence, taskId: "other-task" },
      { ...evidence, subject: { ...subject, revisionId: "other-revision" } },
      { ...evidence, pages: [{ pageId: "page/work-1:0", ordinal: 0, sha256: "d".repeat(64), frameIds: [] }] },
    ]) {
      expect(() => applyProductionSubmissionCommand(fixture(evidence), { type: "upsert-submission",
        submission: { ...legacySubmission(), sourceEvidence } }, "owner-1", at)).toThrow(BadRequestException);
    }
  });

  it("근거 생략 호환 처리가 기존 제출 내용의 변경을 허용하지 않는다", () => {
    expect(() => applyProductionSubmissionCommand(fixture(evidence), { type: "upsert-submission",
      submission: { ...legacySubmission(), revisionRef: { ...legacySubmission().revisionRef, revision: 8 } } }, "owner-1", at))
      .toThrow(BadRequestException);
  });

  it("기존 source evidence 상태 저장에서 출력·입력의 누락된 실제 제출 귀속 ID만 보존한다", () => {
    const before = fixture(evidence);
    const current: Submission = { ...legacySubmission(), sourceEvidence: evidence,
      revisionRef: { ...legacySubmission().revisionRef, productionSubmissionId: "submission-current" },
      inputRevisionRefs: [{ ...inputRevision, productionSubmissionId: "input-submission" }] };
    const result = applyProductionSubmissionCommand({ ...before, submissions: [current] }, { type: "upsert-submission",
      submission: { ...legacySubmission(), status: "changes-requested" } }, "owner-1", at);
    expect(result.aggregate.submissions[0]?.revisionRef.productionSubmissionId).toBe("submission-current");
    expect(result.aggregate.submissions[0]?.inputRevisionRefs[0]?.productionSubmissionId).toBe("input-submission");
    expect(result.aggregate.submissions[0]?.sourceEvidence).toEqual(evidence);
    expect(current.status).toBe("in-review");
  });

  it("generic 저장으로 출력 귀속을 새로 주장하거나 기존 출력·입력 귀속을 바꾸지 못한다", () => {
    expect(() => applyProductionSubmissionCommand(fixture(), { type: "upsert-submission",
      submission: { ...legacySubmission(), revisionRef: { ...legacySubmission().revisionRef, productionSubmissionId: "submission-current" } } }, "owner-1", at))
      .toThrow(BadRequestException);
    expect(() => applyProductionSubmissionCommand(fixture(), { type: "upsert-submission",
      submission: { ...legacySubmission(), id: "new-generic", status: "submitted",
        revisionRef: { ...legacySubmission().revisionRef, productionSubmissionId: "new-generic" } } }, "owner-1", at))
      .toThrow(BadRequestException);
    const before = fixture(evidence);
    const current: Submission = { ...legacySubmission(), sourceEvidence: evidence,
      revisionRef: { ...legacySubmission().revisionRef, productionSubmissionId: "submission-current" },
      inputRevisionRefs: [{ ...inputRevision, productionSubmissionId: "input-submission" }] };
    for (const submission of [
      { ...current, revisionRef: { ...current.revisionRef, productionSubmissionId: "other-submission" } },
      { ...current, inputRevisionRefs: [{ ...inputRevision, productionSubmissionId: "other-input" }] },
      { ...legacySubmission(), revisionRef: { ...legacySubmission().revisionRef, revision: 8 } },
    ]) {
      expect(() => applyProductionSubmissionCommand({ ...before, submissions: [current] }, { type: "upsert-submission", submission }, "owner-1", at))
        .toThrow(BadRequestException);
    }
  });

  it("산출물 upsert의 포인터 보호와 승인 계약 보호를 보존한다", () => {
    expect(() => applyProductionSubmissionCommand(fixture(), { type: "upsert-deliverable",
      deliverable: { ...deliverable, currentSubmissionId: "forged" } }, "owner-1", at)).toThrow(BadRequestException);
    const before = fixture();
    const approved = { ...deliverable, approvedSubmissionId: deliverable.currentSubmissionId };
    expect(() => applyProductionSubmissionCommand({ ...before, deliverables: [approved] }, { type: "upsert-deliverable",
      deliverable: { ...approved, expectedFormat: "PSD" } }, "owner-1", at)).toThrow(BadRequestException);
  });

  it("새 원고 링크는 미래·만료·다른 범위의 자기 역할을 403으로 거절한다", () => {
    const before = fixture();
    const ownerAssignment = before.assignments[0];
    if (!ownerAssignment) throw new Error("테스트 소유 역할이 없습니다.");
    for (const assignment of [
      { ...ownerAssignment, startsAt: "2026-10-30T09:00:00.000Z" },
      { ...ownerAssignment, endsAt: "2026-10-28T09:00:00.000Z" },
      { ...ownerAssignment, scope: episodeScope(before.projectId, "other-episode") },
    ]) {
      expect(() => applyProductionSubmissionCommand({ ...before, assignments: [assignment] }, {
        type: "upsert-studio-revision-link", link: revisionLink(),
      }, "owner-1", at)).toThrow(ForbiddenException);
    }
    expect(before.studioRevisionLinks).toHaveLength(0);
  });

  it("넓은 project producer 역할은 episode 산출물의 새 링크를 기록할 수 있다", () => {
    const before = fixture();
    const result = applyProductionSubmissionCommand({ ...before,
      deliverables: [{ ...deliverable, scope: episodeScope(before.projectId, "episode-1") }],
    }, { type: "upsert-studio-revision-link", link: revisionLink() }, "owner-1", at);
    expect(result.aggregate.studioRevisionLinks).toEqual([revisionLink()]);
    expect(before.studioRevisionLinks).toHaveLength(0);
  });

  it("같은 사용자의 두 번째 활성 party에 속한 역할도 선택할 수 있다", () => {
    const before = fixture();
    const ownerParty = before.parties[0];
    const ownerAssignment = before.assignments[0];
    if (!ownerParty || !ownerAssignment) throw new Error("테스트 소유 역할이 없습니다.");
    const secondParty = { ...ownerParty, id: "party-owner-second" };
    const secondAssignment = { ...ownerAssignment, id: "assignment-owner-second", partyId: secondParty.id };
    const link = revisionLink(secondAssignment.id);
    const result = applyProductionSubmissionCommand({ ...before, parties: [...before.parties, secondParty],
      assignments: [...before.assignments, secondAssignment],
    }, { type: "upsert-studio-revision-link", link }, "owner-1", at);
    expect(result.aggregate.studioRevisionLinks).toEqual([link]);
    expect(() => applyProductionSubmissionCommand({ ...before,
      parties: [...before.parties, { ...secondParty, status: "paused" }], assignments: [...before.assignments, secondAssignment],
    }, { type: "upsert-studio-revision-link", link }, "owner-1", at)).toThrow(ForbiddenException);
  });

  it("서비스가 edit·정확한 project revision·검증 대상과 세 번째 capture 인수를 연결한다", async () => {
    const repository = new ProductionCollaborationRepository();
    const before = fixture();
    const access: ProductionProjectAccess = { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" };
    const mutate = vi.spyOn(repository, "mutateProject").mockImplementation(async (input) => {
      expect(input.requiredCapability).toBe("edit");
      expect(input.expectedRevision).toBe(before.revision);
      expect(input.taskBatchPreconditions).toBeUndefined();
      expect(input.taskOutputSources).toEqual({ output: command.source });
      expect(input.mutationId).toBe("11111111-1111-4111-8111-111111111111");
      return input.mutate(before, access, captures);
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(at));
    try {
      const result = await new ProductionCollaborationService(repository).executeCommand("owner-1", before.projectId, {
        expectedRevision: before.revision, mutationId: "11111111-1111-4111-8111-111111111111",
        command: SubmitProductionTaskOutputCommandSchema.parse(command),
      });
      expect(mutate).toHaveBeenCalledOnce();
      expect(result.aggregate.revision).toBe(before.revision + 1);
      expect(result.aggregate.auditEvents.at(-1)).toMatchObject({ action: "submit-task-output", targetType: "submission", targetId: command.submissionId });
      expect(result.derived).toEqual({ deliverableId: deliverable.id, submissionId: command.submissionId });
    } finally {
      vi.useRealTimers();
      mutate.mockRestore();
    }
  });

  it("initial-capture의 별도 입력 근거를 저장소 검증 대상으로 함께 전달한다", async () => {
    const repository = new ProductionCollaborationRepository();
    const initial = { subject: { ...subject, reviewId: "initial-review", revisionId: "initial-revision" } };
    const mutate = vi.spyOn(repository, "mutateProject").mockImplementation(async (input) => {
      expect(input.taskOutputSources).toEqual({ output: command.source, initial });
      expect(input.taskBatchPreconditions).toBeUndefined();
      return { aggregate: fixture() };
    });
    try {
      await new ProductionCollaborationService(repository).executeCommand("owner-1", "production-1", {
        expectedRevision: 0, mutationId: "11111111-1111-4111-8111-111111111111",
        command: SubmitProductionTaskOutputCommandSchema.parse({ ...command, inputs: { mode: "initial-capture", source: initial } }),
      });
      expect(mutate).toHaveBeenCalledOnce();
    } finally {
      mutate.mockRestore();
    }
  });
});
