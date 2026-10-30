import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductionProjectAggregate, episodeScope, type ProductionProjectAggregate, type ReviewDecision,
  type ReviewPolicy, type Submission } from "@toonstudio/core/production";
import { applyProductionReviewDecision, assertProductionSubmissionApproval } from "./production-approval-command";
import { ProductionCommandSchema } from "./production-collaboration.dto";
import { ProductionCollaborationService } from "./production-collaboration.service";
import type { ProductionCollaborationRepository } from "./production-collaboration.repository";
import { applyProductionReviewPolicyCommand } from "./production-review-policy-command";

const at = "2026-10-29T09:00:00.000Z", scope = episodeScope("project", "episode-one");
const policy: ReviewPolicy = { id: "policy", projectId: "project", scope, quorumBasis: "accounts", responseDueHours: 24,
  expiredReviewAction: "escalate", lanes: [{ lane: "production", eligibleAssignmentIds: ["a", "b", "c"],
    requiredAssignmentIds: ["a"], vetoAssignmentIds: ["b"], quorum: 2, blocksPublication: true }] };
function fixture(): ProductionProjectAggregate {
  const base = createProductionProjectAggregate({ projectId: "project", workId: "work", title: "검수 정책 등록",
    collaborationModel: "co-creator", ownerPartyId: "owner", ownerUserId: "owner-user", ownerDisplayName: "제작자", at });
  const role = base.assignments[0], party = base.parties[0];
  if (!role || !party) throw new Error("검수 정책 fixture가 없습니다.");
  const ref = { id: "revision", lineage: "visual" as const, revision: 1, digest: `sha256:${"a".repeat(64)}`, createdAt: at };
  const submission: Submission = { id: "submission", projectId: base.projectId, deliverableId: "deliverable", revisionRef: ref,
    submittedByAssignmentId: role.id, submittedAt: at, status: "in-review", inputRevisionRefs: [ref], evidenceRefs: ["review-proof"] };
  return { ...base, parties: [...base.parties, ...["a", "b", "c"].map((id) => ({ ...party, id: `party-${id}`,
    accountUserId: id === "c" ? "reviewer-two" : "reviewer-one" }))],
    assignments: [...base.assignments, ...["a", "b", "c"].map((id) => ({ ...role, id, partyId: `party-${id}` }))],
    deliverables: [{ id: "deliverable", projectId: base.projectId, scope, type: "원고", expectedFormat: "PNG",
      completionCriteria: ["검수"], currentSubmissionId: submission.id, approvedSubmissionId: null }],
    submissions: [submission], reviewPolicies: [policy] };
}
function decision(assignmentId = "a", id = `decision-${assignmentId}`): ReviewDecision {
  return { id, reviewRoundId: "submission", lane: "production", assignmentId, value: "approve", reasonCode: null,
    evidenceScopeRefs: [scope], conditions: [], createdAt: "2099-01-01T00:00:00.000Z" };
}
const approve = (aggregate: ProductionProjectAggregate) => {
  const submission = aggregate.submissions[0];
  if (!submission) throw new Error("검수 제출 fixture가 없습니다.");
  return { ...submission, status: "approved" as const };
};

afterEach(() => { vi.useRealTimers(); });
describe("현재 검수 정책 등록과 서버 계정 stamp", () => {
  it("공개 DTO는 신규 계정 기준과 기존 필드 생략을 모두 보존한다", () => {
    expect(ProductionCommandSchema.parse({ type: "upsert-review-policy", policy })).toEqual({ type: "upsert-review-policy", policy });
    const { quorumBasis, ...legacy } = policy;
    expect(quorumBasis).toBe("accounts");
    expect(ProductionCommandSchema.parse({ type: "upsert-review-policy", policy: legacy })).toEqual({ type: "upsert-review-policy", policy: legacy });
    expect(ProductionCommandSchema.parse({ type: "record-review-decision", policyId: policy.id,
      decision: { ...decision(), reviewerAccountUserId: "reviewer-one" } })).toMatchObject({ decision: { reviewerAccountUserId: "reviewer-one" } });
  });

  it("실제 연결 인원 정책만 저장하고 같은 범위의 다른 ID는 기존 정책 수정으로 안내한다", () => {
    const current = fixture();
    expect(applyProductionReviewPolicyCommand({ ...current, reviewPolicies: [] }, policy, at).aggregate.reviewPolicies).toEqual([policy]);
    expect(() => applyProductionReviewPolicyCommand(current, { ...policy, id: "shadow-policy" }, at)).toThrow(BadRequestException);
    const samePerson = { ...policy, lanes: policy.lanes.map((lane) => ({ ...lane, eligibleAssignmentIds: ["a", "b"] })) };
    expect(() => applyProductionReviewPolicyCommand(current, samePerson, at)).toThrow(BadRequestException);
    expect(() => applyProductionReviewPolicyCommand(current, { ...policy, projectId: "other" }, at)).toThrow(BadRequestException);
  });

  it("기존 미연결 표와 이미 확정된 제출 이력은 정책 수정 때 재작성하지 않는다", () => {
    const original = fixture(), legacy = { ...decision(), createdAt: at };
    const { quorumBasis, ...legacyPolicy } = policy;
    expect(quorumBasis).toBe("accounts");
    const current = { ...original, submissions: [approve(original)], reviewDecisions: [legacy],
      deliverables: original.deliverables.map((entry) => ({ ...entry, approvedSubmissionId: "submission" })),
      reviewPolicies: [{ ...legacyPolicy, lanes: legacyPolicy.lanes.map((lane) => ({ ...lane, quorum: 1 })) }] };
    const result = applyProductionReviewPolicyCommand(current, { ...policy, responseDueHours: 48 }, at);
    expect(result.aggregate.reviewDecisions).toBe(current.reviewDecisions);
    expect(result.aggregate.submissions).toBe(current.submissions);
    expect(result.aggregate.reviewDecisions[0]?.reviewerAccountUserId).toBeUndefined();
    expect(() => assertProductionSubmissionApproval(result.aggregate, approve(current), "reviewer-one", at)).not.toThrow();
  });

  it("기록마다 실제 actor와 서버 시각을 고정하고 다른 계정 주장과 기존 ID 수정을 거절한다", () => {
    const original = fixture();
    const first = applyProductionReviewDecision(original, policy.id, decision(), "reviewer-one", at);
    expect(first.aggregate.reviewDecisions[0]).toMatchObject({ reviewerAccountUserId: "reviewer-one", createdAt: at });
    expect(() => applyProductionReviewDecision(original, policy.id, { ...decision(), reviewerAccountUserId: "reviewer-two" }, "reviewer-one", at)).toThrow(ForbiddenException);
    expect(() => applyProductionReviewDecision(first.aggregate, policy.id, { ...decision(), reviewerAccountUserId: "reviewer-two" }, "reviewer-two", at)).toThrow(ConflictException);
    expect(first.aggregate.reviewDecisions[0]?.reviewerAccountUserId).toBe("reviewer-one");
    expect(original.reviewDecisions).toEqual([]);
  });

  it("한 계정 두 역할은 승인 두 명을 만들지 못하고 두 번째 계정의 표 뒤에만 확정한다", () => {
    const first = applyProductionReviewDecision(fixture(), policy.id, decision("a"), "reviewer-one", at);
    const second = applyProductionReviewDecision(first.aggregate, policy.id, decision("b"), "reviewer-one", at);
    expect(second.derived.approval.laneResults[0]?.approvals).toBe(1);
    expect(() => assertProductionSubmissionApproval(second.aggregate, approve(second.aggregate), "reviewer-one", at)).toThrow(BadRequestException);
    const third = applyProductionReviewDecision(second.aggregate, policy.id, decision("c"), "reviewer-two", at);
    expect(third.derived.approval.approved).toBe(true);
    expect(() => assertProductionSubmissionApproval(third.aggregate, approve(third.aggregate), "reviewer-two", at)).not.toThrow();
  });

  it("과거 무계정 표나 역할의 다른 계정 재연결을 현재 인원 승인으로 추정하지 않는다", () => {
    const original = fixture();
    const legacy = { ...original, reviewDecisions: [decision("a"), { ...decision("c"), reviewerAccountUserId: "reviewer-two" }] };
    expect(() => assertProductionSubmissionApproval(legacy, approve(legacy), "reviewer-two", at)).toThrow(BadRequestException);
    const recorded = applyProductionReviewDecision(original, policy.id, decision("a"), "reviewer-one", at);
    const both = applyProductionReviewDecision(recorded.aggregate, policy.id, decision("c"), "reviewer-two", at);
    const rebound = { ...both.aggregate, parties: both.aggregate.parties.map((party) => party.id === "party-a"
      ? { ...party, accountUserId: "new-reviewer" } : party) };
    expect(() => assertProductionSubmissionApproval(rebound, approve(rebound), "reviewer-two", at)).toThrow(BadRequestException);
    expect(rebound.reviewDecisions[0]?.reviewerAccountUserId).toBe("reviewer-one");
  });

  it("중지된 party나 중복 역할 ID는 새 표를 남기지 못한다", () => {
    const original = fixture(), role = original.assignments.find((entry) => entry.id === "a");
    if (!role) throw new Error("검수 역할 fixture가 없습니다.");
    for (const current of [{ ...original, assignments: [...original.assignments, role] },
      { ...original, parties: original.parties.map((party) => party.id === "party-a" ? { ...party, status: "paused" as const } : party) }]) {
      expect(() => applyProductionReviewDecision(current, policy.id, decision(), "reviewer-one", at)).toThrow(ForbiddenException);
      expect(current.reviewDecisions).toEqual([]);
    }
  });

  it("서비스는 정책 manage와 결정 comment를 유지하면서 새 helper와 stamp를 연결한다", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(at));
    let current = fixture();
    const repository = { mutateProject: vi.fn<ProductionCollaborationRepository["mutateProject"]>() };
    repository.mutateProject.mockImplementation(async (input) => {
      expect(input.requiredCapability).toBe(input.actorUserId === "owner-user" ? "manage" : "comment");
      const result = input.mutate(current, { view: true, comment: true, edit: input.actorUserId === "owner-user",
        manage: input.actorUserId === "owner-user", owner: input.actorUserId === "owner-user", role: input.actorUserId === "owner-user" ? "owner" : "commenter" });
      current = result.aggregate; return result;
    });
    const service = new ProductionCollaborationService(repository as unknown as ProductionCollaborationRepository);
    await service.executeCommand("owner-user", current.projectId, { mutationId: randomUUID(), expectedRevision: current.revision,
      command: { type: "upsert-review-policy", policy: { ...policy, responseDueHours: 48 } } });
    await service.executeCommand("reviewer-one", current.projectId, { mutationId: randomUUID(), expectedRevision: current.revision,
      command: { type: "record-review-decision", policyId: policy.id, decision: decision() } });
    expect(current.reviewPolicies[0]?.responseDueHours).toBe(48);
    expect(current.reviewDecisions[0]?.reviewerAccountUserId).toBe("reviewer-one");
  });
});
