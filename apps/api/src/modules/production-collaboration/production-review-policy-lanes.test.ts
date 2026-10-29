import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createProductionProjectAggregate, evaluateReviewApproval, projectScope, validateReviewDecision,
  type ProductionProjectAggregate, type ReviewDecision, type ReviewLane, type ReviewPolicy,
  type ReviewPolicyLane, type Submission,
} from "@toonstudio/core/production";

import type { ProductionCommand } from "./production-collaboration.dto";
import type { ProductionCollaborationRepository, ProductionProjectAccess } from "./production-collaboration.repository";
import { ProductionCollaborationService } from "./production-collaboration.service";

const at = "2026-10-28T00:00:00.000Z", scope = projectScope("p");
const lane = (name: ReviewLane, eligible: readonly string[], quorum = 1): ReviewPolicyLane => ({
  lane: name, eligibleAssignmentIds: eligible, requiredAssignmentIds: [], quorum,
  vetoAssignmentIds: [], blocksPublication: true,
});
const policy = (lanes: readonly ReviewPolicyLane[]): ReviewPolicy => ({
  id: "policy", projectId: "p", scope, lanes, responseDueHours: 24, expiredReviewAction: "escalate",
});
const duplicate = policy([lane("production", ["reviewer-r"]), lane("production", ["reviewer-s"])]);

function fixture(legacyPolicy?: ReviewPolicy, legacyDecisions: readonly ReviewDecision[] = []) {
  const base = createProductionProjectAggregate({ projectId: "p", workId: "w", title: "검수 lane 적격자",
    collaborationModel: "co-creator", ownerPartyId: "owner", ownerUserId: "owner-user", ownerDisplayName: "제작자", at });
  const author = base.assignments[0], owner = base.parties[0];
  if (!author || !owner) throw new Error("검증용 소유자 배정이 없습니다.");
  const submission: Submission = { id: "submission", projectId: "p", deliverableId: "output",
    revisionRef: { id: "r1", lineage: "visual", revision: 1, digest: `sha256:${"a".repeat(64)}`, createdAt: at },
    inputRevisionRefs: [{ id: "input", lineage: "narrative", revision: 1, digest: `sha256:${"b".repeat(64)}`, createdAt: at }],
    submittedByAssignmentId: author.id, submittedAt: at, status: "in-review", evidenceRefs: ["fixed-review"] };
  let current: ProductionProjectAggregate = { ...base,
    parties: [...base.parties, ...["r", "s"].map((id) => ({ ...owner, id: `party-${id}`,
      accountUserId: `reviewer-${id}-user`, publicDisplayName: `검수자 ${id}` }))],
    assignments: [...base.assignments, ...["r", "s"].map((id) => ({ ...author, id: `reviewer-${id}`,
      partyId: `party-${id}`, roleType: "editor" as const }))],
    deliverables: [{ id: "output", projectId: "p", scope, type: "원고", expectedFormat: "PNG",
      completionCriteria: ["검수"], currentSubmissionId: submission.id, approvedSubmissionId: null }],
    submissions: [submission], reviewPolicies: legacyPolicy ? [legacyPolicy] : [], reviewDecisions: legacyDecisions,
  };
  const repository = { mutateProject: vi.fn<ProductionCollaborationRepository["mutateProject"]>() };
  repository.mutateProject.mockImplementation(async (input) => {
    expect(input.expectedRevision).toBe(current.revision);
    const isOwner = input.actorUserId === "owner-user";
    const access: ProductionProjectAccess = { view: true, comment: true, edit: true,
      manage: isOwner, owner: isOwner, role: isOwner ? "owner" : "editor" };
    const result = input.mutate(current, access);
    current = result.aggregate;
    return result;
  });
  // 실제 DTO·service·검수 guard를 실행하고 리포지토리의 저장 경계만 메모리로 대체한다.
  const service = new ProductionCollaborationService(repository as unknown as ProductionCollaborationRepository);
  const execute = (command: ProductionCommand, actor = "owner-user") => service.executeCommand(actor, "p", {
    expectedRevision: current.revision, mutationId: randomUUID(), command,
  });
  const vote = (assignmentId: "reviewer-r" | "reviewer-s", name: ReviewLane) => execute({
    type: "record-review-decision", policyId: "policy", decision: {
      id: randomUUID(), reviewRoundId: submission.id, lane: name, assignmentId,
      value: "approve", reasonCode: null, evidenceScopeRefs: [scope], conditions: [], createdAt: at,
    },
  }, `${assignmentId}-user`);
  const approve = (actor = "reviewer-r-user") => execute({ type: "upsert-submission",
    submission: { ...submission, status: "approved" } }, actor);
  return { state: () => current, execute, vote, approve };
}

type Mutation = Awaited<ReturnType<ProductionCollaborationService["executeCommand"]>>;
async function outcome(action: () => Promise<Mutation>) {
  try { return { accepted: true as const, result: await action() }; }
  catch (error) { return { accepted: false as const, error }; }
}

describe("검수 정책 lane의 적격자와 정족수 경계", () => {
  it("서로 다른 lane 정책을 등록하고 각 lane의 적격자 결정이 모인 뒤 승인한다", async () => {
    const f = fixture();
    const valid = policy([lane("narrative", ["reviewer-r"]), lane("visual-direction", ["reviewer-s"])]);
    await f.execute({ type: "upsert-review-policy", policy: valid });
    expect(f.state().reviewPolicies).toEqual([valid]);
    const before = structuredClone(f.state());
    await expect(f.vote("reviewer-r", "visual-direction")).rejects.toBeInstanceOf(BadRequestException);
    await expect(f.vote("reviewer-s", "narrative")).rejects.toBeInstanceOf(BadRequestException);
    expect(f.state()).toEqual(before);
    await f.vote("reviewer-r", "narrative");
    await expect(f.approve()).rejects.toBeInstanceOf(BadRequestException);
    await f.vote("reviewer-s", "visual-direction");
    await f.approve("reviewer-s-user");
    expect(f.state().submissions[0]?.status).toBe("approved");
  });

  it("정상 단일 lane의 quorum 2는 같은 assignment의 새 결정 ID 두 개로 채우지 못한다", async () => {
    const f = fixture();
    const valid = policy([lane("production", ["reviewer-r", "reviewer-s"], 2)]);
    await f.execute({ type: "upsert-review-policy", policy: valid });
    await f.vote("reviewer-r", "production");
    await f.vote("reviewer-r", "production");
    expect(evaluateReviewApproval(valid, f.state().reviewDecisions)).toMatchObject({
      approved: false, laneResults: [{ approvals: 1, requiredApprovals: 2 }],
    });
    await expect(f.approve()).rejects.toBeInstanceOf(BadRequestException);
    await f.vote("reviewer-s", "production");
    await f.approve("reviewer-s-user");
    expect(f.state().deliverables[0]?.approvedSubmissionId).toBe("submission");
  });

  it.each([duplicate, policy([lane("production", ["reviewer-r"]), lane("production", ["reviewer-r"])])])(
    "적격자가 같거나 달라도 같은 lane을 중복 등록하는 정책은 저장 전에 거절한다: %j", async (value) => {
    const f = fixture();
    const before = structuredClone(f.state());
    const result = await outcome(() => f.execute({ type: "upsert-review-policy", policy: value }));
    expect({ accepted: result.accepted, savedLaneCount: f.state().reviewPolicies[0]?.lanes.length ?? 0,
      revisionDelta: f.state().revision - before.revision }).toEqual({ accepted: false, savedLaneCount: 0, revisionDelta: 0 });
    expect(f.state()).toEqual(before);
  });

  it("이미 저장된 중복 lane도 R의 한 표를 S 적격 lane의 승인으로 재사용하지 못한다", async () => {
    const decision: ReviewDecision = { id: "recorded-r", reviewRoundId: "submission", lane: "production",
      assignmentId: "reviewer-r", value: "approve", reasonCode: null, evidenceScopeRefs: [scope], conditions: [], createdAt: at };
    // 앞선 등록 경로로 만들어질 수 있는 기존 정책·표를 보존하고 새 승인만 검사한다.
    const f = fixture(duplicate, [decision]);
    const before = structuredClone(f.state());
    const evaluated = evaluateReviewApproval(duplicate, f.state().reviewDecisions);
    const result = await outcome(() => f.approve());
    expect({ accepted: result.accepted, declaredSecondLaneEligible: duplicate.lanes[1]?.eligibleAssignmentIds,
      recordedAssignments: f.state().reviewDecisions.map((entry) => entry.assignmentId),
      laneApprovals: evaluated.laneResults.map((entry) => entry.approvals),
      submissionStatus: f.state().submissions[0]?.status, approvedSubmissionId: f.state().deliverables[0]?.approvedSubmissionId,
    }).toEqual({ accepted: false, declaredSecondLaneEligible: ["reviewer-s"], recordedAssignments: ["reviewer-r"],
      laneApprovals: [1, 0], submissionStatus: "in-review", approvedSubmissionId: null });
    expect(f.state()).toEqual(before);
  });

  it.each([duplicate, policy([lane("production", ["reviewer-r"]), lane("production", ["reviewer-r"])])])(
    "기존 중복 lane의 승인을 닫고 모호한 새 표를 거절하며 과거 표는 보존한다: %j", async (value) => {
    const decision: ReviewDecision = { id: "recorded-r", reviewRoundId: "submission", lane: "production",
      assignmentId: "reviewer-r", value: "approve", reasonCode: null, evidenceScopeRefs: [scope], conditions: [], createdAt: at };
    expect(evaluateReviewApproval(value, [decision]).approved).toBe(false);
    expect(validateReviewDecision(value, decision)).toEqual(["duplicate-review-lane"]);
    const f = fixture(value, [decision]), before = structuredClone(f.state());
    await expect(f.vote("reviewer-r", "production")).rejects.toBeInstanceOf(BadRequestException);
    await expect(f.approve()).rejects.toBeInstanceOf(BadRequestException);
    expect(f.state()).toEqual(before);
    await f.execute({ type: "set-project-cover", coverImageUrl: "https://example.test/cover.png" });
    expect(f.state().coverImageUrl).toBe("https://example.test/cover.png");
    expect(f.state().reviewPolicies).toEqual(before.reviewPolicies);
    expect(f.state().reviewDecisions).toEqual(before.reviewDecisions);
  });

  it.each(["approve", "veto", "request-changes"] as const)("%s도 lane의 비적격 표는 제외하고 적격 표는 그대로 평가한다", (value) => {
    const valid = policy([{ ...lane("production", ["reviewer-r"]), vetoAssignmentIds: ["reviewer-s"] }]);
    const approve: ReviewDecision = { id: "r", reviewRoundId: "submission", lane: "production",
      assignmentId: "reviewer-r", value: "approve", reasonCode: null, evidenceScopeRefs: [scope], conditions: [], createdAt: at };
    const other: ReviewDecision = { ...approve, id: "s", assignmentId: "reviewer-s", value, reasonCode: "checked" };
    expect(evaluateReviewApproval(valid, [approve, other])).toMatchObject({ approved: true,
      laneResults: [{ approvals: 1, vetoedByAssignmentIds: [], changeRequestedByAssignmentIds: [] }] });
    const eligible = { ...valid, lanes: valid.lanes.map((entry) => ({ ...entry, eligibleAssignmentIds: ["reviewer-r", "reviewer-s"] })) };
    expect(evaluateReviewApproval(eligible, [approve, other])).toMatchObject({ approved: value === "approve",
      laneResults: [{ approvals: value === "approve" ? 2 : 1,
        vetoedByAssignmentIds: value === "veto" ? ["reviewer-s"] : [],
        changeRequestedByAssignmentIds: value === "request-changes" ? ["reviewer-s"] : [] }] });
  });
});
