import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createProductionProjectAggregate, productionTaskHasCurrentDependencyInputs, projectScope,
  type ProductionProjectAggregate, type ProductionTask, type RevisionRef, type Submission,
} from "@toonstudio/core/production";

import type { ProductionCommand } from "./production-collaboration.dto";
import type { ProductionCollaborationRepository, ProductionProjectAccess } from "./production-collaboration.repository";
import { ProductionCollaborationService } from "./production-collaboration.service";

const at = "2026-10-28T00:00:00.000Z";
const scope = projectScope("p");
const ref = (id: string, revision: number, character: string): RevisionRef => ({
  id, lineage: "visual", revision, digest: `sha256:${character.repeat(64)}`, createdAt: at,
});
const initialRef = ref("source", 1, "a"), a1 = ref("A1", 1, "b"), a2 = ref("A2", 2, "c"), b1 = ref("B1", 1, "d");
type UpstreamReplacement = "unapproved-A2" | "approved-A2";

function fixture(additionalReviewOutput = false) {
  const base = createProductionProjectAggregate({ projectId: "p", workId: "w", title: "고정 입력 재검수",
    collaborationModel: "co-creator", ownerPartyId: "artist", ownerUserId: "artist-user", ownerDisplayName: "제작자", at });
  const artist = base.assignments[0], party = base.parties[0];
  if (!artist || !party) throw new Error("검증용 소유자 배정이 없습니다.");
  const reviewer = { ...artist, id: "reviewer", partyId: "reviewer-party" };
  const submission = (id: string, deliverableId: string, revisionRef: RevisionRef,
    inputRevisionRefs: readonly RevisionRef[], status: Submission["status"]): Submission => ({
    id, projectId: "p", deliverableId, revisionRef, inputRevisionRefs, status,
    submittedByAssignmentId: artist.id, submittedAt: at, evidenceRefs: status === "approved" ? ["fixed-approval"] : [],
  });
  const oldA = submission("sA1", "output-A", a1, [initialRef], "approved");
  const nextA = submission("sA2", "output-A", a2, [initialRef], "submitted");
  const pendingB = submission("sB1", "output-B", b1, [a1], "in-review");
  const pendingSibling = submission("sB-sibling", "output-B-sibling", ref("B-sibling", 1, "f"), [a1], "in-review");
  const task = (id: string, output: string, status: ProductionTask["status"], inputs: readonly RevisionRef[], dependencies: readonly string[]): ProductionTask => ({
    id, projectId: "p", scope, processKey: "line-art", title: id, status, assignmentIds: [artist.id],
    reviewerAssignmentIds: [reviewer.id], inputRevisionRefs: inputs, outputDeliverableIds: [output],
    dependencyTaskIds: dependencies, dueAt: null, estimateHours: null, completionCriteria: [], sourceAgreementMilestoneId: null,
  });
  let current: ProductionProjectAggregate = { ...base,
    parties: [...base.parties, { ...party, id: reviewer.partyId, accountUserId: "reviewer-user", publicDisplayName: "검수자" }],
    assignments: [...base.assignments, reviewer],
    tasks: [task("A", "output-A", "done", [initialRef], []), { ...task("B", "output-B", "internal-review", [a1], ["A"]),
      outputDeliverableIds: additionalReviewOutput ? ["output-B", "output-B-sibling"] : ["output-B"] }],
    submissions: [oldA, pendingB, ...(additionalReviewOutput ? [pendingSibling] : [])],
    deliverables: [
      { id: "output-A", projectId: "p", scope, type: "선화", expectedFormat: "PNG", completionCriteria: ["검수"], currentSubmissionId: oldA.id, approvedSubmissionId: oldA.id },
      { id: "output-B", projectId: "p", scope, type: "채색", expectedFormat: "PNG", completionCriteria: ["검수"], currentSubmissionId: pendingB.id, approvedSubmissionId: null },
      ...(additionalReviewOutput ? [{ id: "output-B-sibling", projectId: "p", scope, type: "명암", expectedFormat: "PNG", completionCriteria: ["검수"], currentSubmissionId: pendingSibling.id, approvedSubmissionId: null }] : []),
    ],
    reviewPolicies: [{ id: "policy", projectId: "p", scope, responseDueHours: 24, expiredReviewAction: "escalate",
      lanes: [{ lane: "visual-direction", eligibleAssignmentIds: [reviewer.id], requiredAssignmentIds: [reviewer.id], quorum: 1, vetoAssignmentIds: [], blocksPublication: true }] }],
  };
  const repository = { mutateProject: vi.fn<ProductionCollaborationRepository["mutateProject"]>() };
  repository.mutateProject.mockImplementation(async (input) => {
    expect(input.expectedRevision).toBe(current.revision);
    const owner = input.actorUserId === "artist-user";
    const access: ProductionProjectAccess = { view: true, comment: true, edit: true, manage: owner, owner, role: owner ? "owner" : "editor" };
    const result = input.mutate(current, access);
    current = result.aggregate;
    return result;
  });
  // 실제 service/command/guard를 사용하고 transaction 저장 경계만 이 메모리 adapter로 바꾼다.
  const service = new ProductionCollaborationService(repository as unknown as ProductionCollaborationRepository);
  const execute = (command: ProductionCommand, actor = "artist-user") => service.executeCommand(actor, "p", {
    expectedRevision: current.revision, mutationId: randomUUID(), command,
  });
  const bTask = () => {
    const found = current.tasks.find((entry) => entry.id === "B");
    if (!found) throw new Error("후속 작업이 없습니다.");
    return found;
  };
  const recordApproval = (value: Submission) => execute({ type: "record-review-decision", policyId: "policy", decision: {
      id: randomUUID(), reviewRoundId: value.id, lane: "visual-direction", assignmentId: reviewer.id,
      value: "approve", reasonCode: null, evidenceScopeRefs: [scope], conditions: [], createdAt: at,
    } }, "reviewer-user");
  const approve = async (value: Submission) => {
    await recordApproval(value);
    return execute({ type: "upsert-submission", submission: { ...value, status: "approved", evidenceRefs: ["fixed-approval"] } }, "reviewer-user");
  };
  const approveA2 = async () => {
    const reviewing = { ...nextA, status: "in-review" as const };
    await execute({ type: "upsert-submission", submission: reviewing });
    await approve(reviewing);
  };
  const replaceA = async (mode: UpstreamReplacement) => {
    await execute({ type: "upsert-submission", submission: nextA });
    if (mode === "approved-A2") await approveA2();
    expect(current.deliverables.find((entry) => entry.id === "output-A")?.approvedSubmissionId).toBe(mode === "approved-A2" ? nextA.id : null);
    expect(bTask().inputRevisionRefs).toEqual([a1]);
    expect(productionTaskHasCurrentDependencyInputs(bTask(), current)).toBe(false);
  };
  return { state: () => current, execute, recordApproval, approve, approveA2, replaceA, bTask, oldA, pendingB };
}

async function rejectedByCurrentInputGuard(f: ReturnType<typeof fixture>, action: () => Promise<unknown>) {
  const before = structuredClone(f.state());
  let failure: unknown;
  try { await action(); } catch (error) { failure = error; }
  expect(failure, "upstream 현재 승인과 다른 입력의 새 승인·완료는 거절해야 합니다.").toBeInstanceOf(BadRequestException);
  if (failure instanceof BadRequestException) expect(failure.getResponse()).toMatchObject({
    issues: expect.arrayContaining([expect.stringContaining("선행 공정의 현재 승인 버전을 입력에 고정한 뒤 승인·완료하세요.")]),
  });
  expect(f.state(), "거절된 요청은 제출본·작업·포인터·revision과 기존 검수 결정을 바꾸지 않아야 합니다.").toEqual(before);
}

describe("이미 검수 중인 후속 작업의 upstream 재제출 경계", () => {
  it("현재 승인 A1이 유효하면 실제 검수 결정 뒤 B1 승인과 일반 작업 완료를 허용한다", async () => {
    const f = fixture();
    expect(productionTaskHasCurrentDependencyInputs(f.bTask(), f.state())).toBe(true);
    await f.approve(f.pendingB);
    expect(f.bTask().status).toBe("approved");
    await f.execute({ type: "upsert-task", task: { ...f.bTask(), status: "done" } });
    expect(f.bTask().status).toBe("done");
  });

  it("현재 승인 A1이 유효하면 다른 출력의 검수 중에도 B1 승인 이력을 먼저 기록할 수 있다", async () => {
    const f = fixture(true);
    await f.approve(f.pendingB);
    expect(f.bTask().status).toBe("internal-review");
    expect(f.state().submissions.find((entry) => entry.id === f.pendingB.id)?.status).toBe("approved");
    expect(f.state().deliverables.find((entry) => entry.id === "output-B")).toMatchObject({ currentSubmissionId: "sB1", approvedSubmissionId: "sB1" });
  });

  for (const mode of ["unapproved-A2", "approved-A2"] as const) {
    it(`${mode}: A2 제출·승인은 허용하고 과거 A1/B1 입력과 무관한 제목 편집을 보존한다`, async () => {
      const f = fixture();
      await f.approve(f.pendingB);
      await f.replaceA(mode);
      await f.execute({ type: "upsert-task", task: { ...f.bTask(), title: "이력 확인용 제목" } });
      await f.execute({ type: "upsert-submission", submission: { ...f.pendingB, status: "approved", evidenceRefs: ["fixed-approval"] } });
      expect(f.state().submissions.find((entry) => entry.id === f.oldA.id)).toEqual(f.oldA);
      expect(f.state().submissions.find((entry) => entry.id === f.pendingB.id)?.status).toBe("approved");
      expect(f.bTask().inputRevisionRefs).toEqual([a1]);
      expect(f.bTask().title).toBe("이력 확인용 제목");
    });

    it(`${mode}: 이미 검수 중인 B1의 새 승인 확정은 거절한다`, async () => {
      const f = fixture(); await f.replaceA(mode);
      await f.recordApproval(f.pendingB);
      await rejectedByCurrentInputGuard(f, () => f.execute({ type: "upsert-submission",
        submission: { ...f.pendingB, status: "approved", evidenceRefs: ["fixed-approval"] } }, "reviewer-user"));
    });

    it(`${mode}: 다른 출력이 검수 중이라 작업 상태가 그대로여도 stale B1 새 승인은 거절한다`, async () => {
      const f = fixture(true); await f.replaceA(mode);
      await f.recordApproval(f.pendingB);
      await rejectedByCurrentInputGuard(f, () => f.execute({ type: "upsert-submission",
        submission: { ...f.pendingB, status: "approved", evidenceRefs: ["fixed-approval"] } }, "reviewer-user"));
    });

    it(`${mode}: 기존 B1 승인 이력은 유지하되 일반 upsert-task의 새 done 전이는 거절한다`, async () => {
      const f = fixture(); await f.approve(f.pendingB); await f.replaceA(mode);
      await rejectedByCurrentInputGuard(f, () => f.execute({ type: "upsert-task", task: { ...f.bTask(), status: "done" } }));
    });

    it(`${mode}: 기존 B1 승인 이력은 유지하되 workflow batch의 새 done 전이는 거절한다`, async () => {
      const f = fixture(); await f.approve(f.pendingB); await f.replaceA(mode);
      await rejectedByCurrentInputGuard(f, () => f.execute({ type: "transition-task-batch", transitions: [{ taskId: "B", fromStatus: "approved", toStatus: "done" }] }));
    });

    it(`${mode}: 자신의 승인 출력이 있어도 stale 입력으로 새 조건부 승인을 확정하지 못한다`, async () => {
      const f = fixture(); await f.approve(f.pendingB);
      for (const status of ["changes-requested", "in-progress", "internal-review"] as const) {
        await f.execute({ type: "upsert-task", task: { ...f.bTask(), status } });
      }
      await f.replaceA(mode);
      await rejectedByCurrentInputGuard(f, () => f.execute({ type: "upsert-task", task: { ...f.bTask(), status: "conditionally-approved" } }));
    });

    it(`${mode}: 거절 후 과거 B1 승인을 보존하며 A2 입력의 B2 재작업·재승인·완료로 복구한다`, async () => {
      const f = fixture(); await f.approve(f.pendingB);
      const historicalB = structuredClone(f.state().submissions.find((entry) => entry.id === f.pendingB.id));
      const historicalDecisions = structuredClone(f.state().reviewDecisions);
      await f.replaceA(mode);
      await rejectedByCurrentInputGuard(f, () => f.execute({ type: "upsert-task", task: { ...f.bTask(), status: "done" } }));
      await f.execute({ type: "upsert-task", task: { ...f.bTask(), status: "changes-requested" } });
      if (mode === "unapproved-A2") await f.approveA2();
      await f.execute({ type: "upsert-task", task: { ...f.bTask(), status: "in-progress", inputRevisionRefs: [a2] } });
      const nextB: Submission = { ...f.pendingB, id: "sB2", revisionRef: ref("B2", 2, "e"), inputRevisionRefs: [a2], status: "submitted" };
      await f.execute({ type: "upsert-submission", submission: nextB });
      const reviewingB: Submission = { ...nextB, status: "in-review" };
      await f.execute({ type: "upsert-submission", submission: reviewingB }, "reviewer-user");
      await f.execute({ type: "upsert-task", task: { ...f.bTask(), status: "internal-review" } });
      await f.approve(reviewingB);
      await f.execute({ type: "upsert-task", task: { ...f.bTask(), status: "done" } });
      expect(f.bTask()).toMatchObject({ status: "done", inputRevisionRefs: [a2] });
      expect(productionTaskHasCurrentDependencyInputs(f.bTask(), f.state())).toBe(true);
      expect(f.state().deliverables.find((entry) => entry.id === "output-B")).toMatchObject({ currentSubmissionId: "sB2", approvedSubmissionId: "sB2" });
      expect(f.state().submissions.find((entry) => entry.id === f.oldA.id)).toEqual(f.oldA);
      expect(f.state().submissions.find((entry) => entry.id === f.pendingB.id)).toEqual(historicalB);
      expect(f.state().reviewDecisions).toEqual(expect.arrayContaining(historicalDecisions));
    });
  }

  it("작업 입력만 A2로 바꿔도 기존 B1의 A1 고정 입력을 최신 입력 승인으로 재사용하지 못한다", async () => {
    const f = fixture(true); await f.replaceA("approved-A2");
    await f.execute({ type: "upsert-task", task: { ...f.bTask(), inputRevisionRefs: [a2] } });
    expect(productionTaskHasCurrentDependencyInputs(f.bTask(), f.state())).toBe(true);
    await f.recordApproval(f.pendingB);
    await rejectedByCurrentInputGuard(f, () => f.execute({ type: "upsert-submission",
      submission: { ...f.pendingB, status: "approved", evidenceRefs: ["fixed-approval"] } }, "reviewer-user"));
  });
});
