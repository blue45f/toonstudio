import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  createProductionProjectAggregate,
  projectScope,
  episodeScope,
  type ClarificationThread,
  type StoryToArtHandoffPackage,
  type ProductionProjectAggregate,
  type ProductionTask,
  type Submission,
} from "@toonstudio/core/production";
import { applyProductionReviewDecision, assertProductionSubmissionActor, assertProductionSubmissionApproval, assertProductionTaskMutationSafety } from "./production-approval-command";

const at = "2026-10-28T09:00:00.000Z";
function fixture() {
  const base = createProductionProjectAggregate({ projectId: "p", workId: "w", title: "검수 인계",
    collaborationModel: "co-creator", ownerPartyId: "owner", ownerUserId: "owner-user", ownerDisplayName: "제작자", at });
  const assignment = base.assignments[0];
  const party = base.parties[0];
  if (!assignment || !party) throw new Error("검증용 소유자 배정이 없습니다.");
  const reviewer = { ...assignment, id: "reviewer", partyId: "reviewer-party" };
  const revision = { id: "r1", lineage: "visual" as const, revision: 1, digest: `sha256:${"a".repeat(64)}`, createdAt: at };
  const submission: Submission = { id: "s1", projectId: "p", deliverableId: "d1", revisionRef: revision,
    submittedByAssignmentId: assignment.id, submittedAt: at, status: "in-review", inputRevisionRefs: [revision], evidenceRefs: ["review-proof"] };
  const scope = projectScope("p");
  const aggregate: ProductionProjectAggregate = { ...base,
    parties: [...base.parties, { ...party, id: "reviewer-party", accountUserId: "reviewer-user", publicDisplayName: "검수자" }],
    assignments: [...base.assignments, reviewer],
    deliverables: [{ id: "d1", projectId: "p", scope, type: "원고", expectedFormat: "PNG", completionCriteria: ["교정"], currentSubmissionId: "s1", approvedSubmissionId: null }],
    submissions: [submission],
    reviewPolicies: [{ id: "policy", projectId: "p", scope, responseDueHours: 24, expiredReviewAction: "escalate",
      lanes: [{ lane: "visual-direction", eligibleAssignmentIds: [reviewer.id], requiredAssignmentIds: [reviewer.id], quorum: 1, vetoAssignmentIds: [], blocksPublication: true }] }],
    reviewDecisions: [{ id: "decision", reviewRoundId: "s1", lane: "visual-direction", assignmentId: reviewer.id,
      value: "approve", reasonCode: null, evidenceScopeRefs: [scope], conditions: [], createdAt: at }],
  };
  return { aggregate, submission: { ...submission, status: "approved" as const }, assignment, scope };
}
function task(patch: Partial<ProductionTask> = {}): ProductionTask {
  return { id: "task", projectId: "p", scope: projectScope("p"), processKey: "line-art", title: "선화",
    status: "internal-review", assignmentIds: ["assignment:owner:producer"], reviewerAssignmentIds: ["reviewer"], inputRevisionRefs: [{ id: "r1", lineage: "visual", revision: 1, digest: `sha256:${"a".repeat(64)}`, createdAt: at }],
    outputDeliverableIds: ["d1"], dependencyTaskIds: [], dueAt: null, estimateHours: null,
    completionCriteria: [], sourceAgreementMilestoneId: null, ...patch };
}

describe("제출본 검수와 인계 권위", () => {
  it.each(["paused", "ended"] as const)("%s 참여자는 활성 역할이 남아 있어도 새 제출·검수 상태 변경·신규 승인에 사용할 수 없다", (status) => {
    const { aggregate, submission } = fixture();
    const inactiveOwner = { ...aggregate, parties: aggregate.parties.map((party) => party.id === "owner" ? { ...party, status } : party) };
    const fresh: Submission = { ...submission, id: "inactive-party-submission", status: "submitted" };
    expect(() => assertProductionSubmissionActor(inactiveOwner, fresh, "owner-user", at)).toThrow(ForbiddenException);
    expect(() => assertProductionSubmissionActor(inactiveOwner, { ...submission, status: "in-review" }, "owner-user", at)).toThrow(ForbiddenException);
    const inactiveReviewer = { ...aggregate, parties: aggregate.parties.map((party) => party.id === "reviewer-party" ? { ...party, status } : party) };
    expect(() => assertProductionSubmissionApproval(inactiveReviewer, submission, "reviewer-user", at)).toThrow(BadRequestException);
    const confirmed = { ...inactiveReviewer, submissions: [submission],
      deliverables: inactiveReviewer.deliverables.map((entry) => ({ ...entry, approvedSubmissionId: submission.id })) };
    expect(() => assertProductionSubmissionApproval(confirmed, submission, "reviewer-user", at)).not.toThrow();
    expect(confirmed.submissions[0]).toBe(submission);
    expect(confirmed.reviewDecisions).toBe(aggregate.reviewDecisions);
  });

  it.each(["future", "expired", "wrong-scope"] as const)("%s 배정은 담당자·검수자에 새로 추가하거나 제작을 시작할 수 없다", (kind) => {
    const { aggregate, assignment } = fixture();
    const invalid = { ...assignment,
      ...(kind === "future" ? { startsAt: "2026-11-01T00:00:00.000Z" } : {}),
      ...(kind === "expired" ? { endsAt: "2026-10-27T00:00:00.000Z" } : {}),
      ...(kind === "wrong-scope" ? { scope: episodeScope("p", "other") } : {}),
    };
    const draft = task({ status: "draft", assignmentIds: [], reviewerAssignmentIds: [] });
    const before = { ...aggregate, assignments: [invalid], tasks: [draft] };
    for (const added of [{ ...draft, assignmentIds: [invalid.id] }, { ...draft, reviewerAssignmentIds: [invalid.id] }]) {
      expect(() => assertProductionTaskMutationSafety(before, { ...before, tasks: [added] }, at)).toThrow(BadRequestException);
    }
    const legacy = { ...draft, status: "ready" as const, assignmentIds: [invalid.id] };
    const previous = { ...before, tasks: [legacy] };
    expect(() => assertProductionTaskMutationSafety(previous, { ...previous, tasks: [{ ...legacy, title: "기존 작업 제목 수정" }] }, at)).not.toThrow();
    expect(() => assertProductionTaskMutationSafety(previous, { ...previous, tasks: [{ ...legacy, status: "in-progress" }] }, at)).toThrow(BadRequestException);
  });
  it("새 제출은 자기 활성 역할이라도 산출물 회차를 포함하지 않으면 거절한다", () => {
    const { aggregate, submission, assignment } = fixture();
    const fresh: Submission = { ...submission, id: "new-scope-submission", status: "submitted" };
    const before: ProductionProjectAggregate = { ...aggregate,
      assignments: aggregate.assignments.map((entry) => entry.id === assignment.id ? { ...entry, scope: episodeScope("p", "e1") } : entry),
      deliverables: aggregate.deliverables.map((entry) => ({ ...entry, scope: episodeScope("p", "e2"), currentSubmissionId: null })),
      submissions: [], reviewDecisions: [], tasks: [],
    };
    expect(() => assertProductionSubmissionActor(before, fresh, "owner-user", at)).toThrow(ForbiddenException);
  });
  it("새 제출의 자기 활성 역할과 산출물이 같은 회차면 허용한다", () => {
    const { aggregate, submission, assignment } = fixture();
    const scope = episodeScope("p", "e1");
    const fresh: Submission = { ...submission, id: "new-same-episode-submission", status: "submitted" };
    const before: ProductionProjectAggregate = { ...aggregate,
      assignments: aggregate.assignments.map((entry) => entry.id === assignment.id ? { ...entry, scope } : entry),
      deliverables: aggregate.deliverables.map((entry) => ({ ...entry, scope, currentSubmissionId: null })),
      submissions: [], reviewDecisions: [], tasks: [],
    };
    expect(() => assertProductionSubmissionActor(before, fresh, "owner-user", at)).not.toThrow();
  });
  it.each(["no-task", "unassigned-task", "other-assignee"] as const)(
    "프로젝트 범위 producer의 새 회차 제출은 %s여도 허용한다", (kind) => {
      const { aggregate, submission } = fixture();
      const scope = episodeScope("p", "e2");
      const fresh: Submission = { ...submission, id: "new-producer-submission", status: "submitted" };
      const tasks = kind === "no-task" ? [] : [task({ scope, status: "draft",
        assignmentIds: kind === "unassigned-task" ? [] : ["reviewer"], reviewerAssignmentIds: [] })];
      const before: ProductionProjectAggregate = { ...aggregate,
        deliverables: aggregate.deliverables.map((entry) => ({ ...entry, scope, currentSubmissionId: null })),
        submissions: [], reviewDecisions: [], tasks,
      };
      expect(() => assertProductionSubmissionActor(before, fresh, "owner-user", at)).not.toThrow();
    },
  );
  it("기존 귀속 제출의 상태 변경에는 새 제출의 역할 범위를 소급하지 않는다", () => {
    const { aggregate, submission, assignment } = fixture();
    const current: Submission = { ...submission, status: "submitted" };
    const before: ProductionProjectAggregate = { ...aggregate,
      assignments: aggregate.assignments.map((entry) => entry.id === assignment.id ? { ...entry, scope: episodeScope("p", "e1") } : entry),
      deliverables: aggregate.deliverables.map((entry) => ({ ...entry, scope: episodeScope("p", "e2") })),
      submissions: [current], reviewDecisions: [],
    };
    expect(() => assertProductionSubmissionActor(before, { ...current, status: "in-review" }, "owner-user", at)).not.toThrow();
  });
  it("현재 인수인계의 open·answered 차단 질문은 승인 전에 해결해야 한다", () => {
    const { aggregate, submission, assignment } = fixture();
    const scope = episodeScope("p", "e1");
    const handoff: StoryToArtHandoffPackage = { id: "handoff", projectId: "p", episodeId: "e1", handoffRevision: 1, status: "accepted-by-art",
      storySnapshotRef: null, storyLockRef: null, storyBibleRevisionRef: null, characterBibleRevisionRefs: [], episodeIntentRef: null,
      beatRefs: [], sceneRefs: [], lockedDialogueRefs: [], continuityReferenceRefs: [], visualRequirementRefs: [], forbiddenInterpretationRefs: [],
      assetRequirementRefs: [], locationReferenceRefs: [], costumeReferenceRefs: [], instructions: [], platformProfileRef: null,
      technicalDeliveryRuleRef: null, rightsAndAiPolicyRef: null, creditPolicyRef: null, expectedDeliverables: [], reviewPolicyRef: null,
      decisionOwnerAssignmentIds: [], dueAt: null, openRiskAcceptances: [], createdByAssignmentId: assignment.id,
      acceptedByAssignmentId: assignment.id, acceptedAt: at, digest: "handoff-proof", createdAt: at };
    const thread: ClarificationThread = { id: "question", handoffId: handoff.id, scope, category: "continuity", blocking: true,
      question: "의상 변경 확인", askedByAssignmentId: assignment.id, answerOwnerAssignmentId: "reviewer", dueAt: null,
      status: "open", answer: null, decisionRecordId: null, createdAt: at, updatedAt: at };
    const base = { ...aggregate, deliverables: aggregate.deliverables.map((entry) => ({ ...entry, scope })), handoffs: [handoff], clarifications: [thread] };
    for (const status of ["open", "answered"] as const) {
      expect(() => assertProductionSubmissionApproval({ ...base, clarifications: [{ ...thread, status }] }, submission, "reviewer-user", at)).toThrow(BadRequestException);
    }
    for (const status of ["decision-recorded", "accepted-risk", "closed"] as const) {
      expect(() => assertProductionSubmissionApproval({ ...base, clarifications: [{ ...thread, status }] }, submission, "reviewer-user", at)).not.toThrow();
    }
    for (const status of ["cancelled", "superseded"] as const) {
      expect(() => assertProductionSubmissionApproval({ ...base, handoffs: [{ ...handoff, status }] }, submission, "reviewer-user", at)).not.toThrow();
    }
    expect(() => assertProductionSubmissionApproval({ ...base, handoffs: [{ ...handoff, episodeId: "e2" }],
      clarifications: [{ ...thread, scope: episodeScope("p", "e2") }] }, submission, "reviewer-user", at)).not.toThrow();
  });
  it("타인 원고 검수 시작은 활성 검수자에게 허용하고 변경 요청에는 실제 결정을 요구한다", () => {
    const { aggregate, submission } = fixture();
    const submitted = { ...aggregate, reviewDecisions: [], submissions: [{ ...submission, status: "submitted" as const }] };
    expect(() => assertProductionSubmissionActor(submitted, { ...submission, status: "in-review" }, "reviewer-user", at)).not.toThrow();
    expect(() => assertProductionSubmissionActor(submitted, { ...submission, status: "in-review" }, "outsider", at)).toThrow(ForbiddenException);
    expect(() => assertProductionSubmissionActor(aggregate, { ...submission, status: "changes-requested" }, "reviewer-user", at)).toThrow(BadRequestException);
    const changes = { ...aggregate, reviewDecisions: aggregate.reviewDecisions.map((entry) => ({ ...entry, value: "request-changes" as const, reasonCode: "fix" })) };
    expect(() => assertProductionSubmissionActor(changes, { ...submission, status: "changes-requested" }, "reviewer-user", at)).not.toThrow();
  });
  it("다른 검수자의 거부 결정 ID를 덮어쓰거나 미래 시각으로 결정을 선점하지 못한다", () => {
    const { aggregate, assignment } = fixture();
    const decision = aggregate.reviewDecisions[0];
    if (!decision) throw new Error("검증용 검수 결정이 없습니다.");
    const veto = { ...decision, assignmentId: assignment.id, value: "veto" as const, reasonCode: "continuity" };
    const protectedReview = { ...aggregate, reviewDecisions: [veto], reviewPolicies: aggregate.reviewPolicies.map((policy) => ({ ...policy,
      lanes: policy.lanes.map((lane) => ({ ...lane, eligibleAssignmentIds: [...lane.eligibleAssignmentIds, assignment.id], vetoAssignmentIds: [assignment.id] })) })) };
    expect(() => applyProductionReviewDecision(protectedReview, "policy", { ...decision, assignmentId: "reviewer", value: "approve" }, "reviewer-user", at)).toThrow(ConflictException);
    expect(protectedReview.reviewDecisions[0]).toBe(veto);
    const fresh = applyProductionReviewDecision(aggregate, "policy", { ...decision, id: "new-decision", createdAt: "2099-01-01T00:00:00Z" }, "reviewer-user", at);
    expect(fresh.aggregate.reviewDecisions.at(-1)?.createdAt).toBe(at);
    const changes = applyProductionReviewDecision(fresh.aggregate, "policy", { ...decision, id: "change-decision", value: "request-changes", reasonCode: "fix" }, "reviewer-user", at);
    expect(changes.derived.approval.approved).toBe(false);
    expect(aggregate.reviewDecisions).toHaveLength(1);
  });
  it("미리 만든 검수 회차 ID와 새 제출본 ID의 충돌 및 구버전 검수 결정을 차단한다", () => {
    const { aggregate, submission } = fixture();
    expect(() => assertProductionSubmissionActor({ ...aggregate, submissions: [] }, { ...submission, status: "submitted" }, "owner-user", at)).toThrow(BadRequestException);
    const decision = aggregate.reviewDecisions[0];
    if (!decision) throw new Error("검증용 검수 결정이 없습니다.");
    expect(() => applyProductionReviewDecision({ ...aggregate, deliverables: aggregate.deliverables.map((entry) => ({ ...entry, currentSubmissionId: "s2" })) }, "policy", { ...decision, id: "new-decision" }, "reviewer-user", at)).toThrow(BadRequestException);
  });
  it("제출자가 아닌 실제 검수자가 해당 제출본의 승인을 확정한다", () => {
    const { aggregate, submission } = fixture();
    expect(() => assertProductionSubmissionApproval(aggregate, submission, "reviewer-user", at)).not.toThrow();
    expect(() => assertProductionSubmissionApproval(aggregate, submission, "owner-user", at)).toThrow(ForbiddenException);
  });
  it("최초 저장에서 승인 상태를 주입하거나 다른 제출본의 승인을 재사용할 수 없다", () => {
    const { aggregate, submission } = fixture();
    expect(() => assertProductionSubmissionApproval({ ...aggregate, submissions: [] }, submission, "reviewer-user", at)).toThrow(BadRequestException);
    expect(() => assertProductionSubmissionApproval({ ...aggregate, reviewDecisions: aggregate.reviewDecisions.map((entry) => ({ ...entry, reviewRoundId: "older-submission" })) }, submission, "reviewer-user", at)).toThrow(BadRequestException);
  });
  it("조건부 승인·변경 요청·만료된 검수자·빈 정책은 최종 승인을 열지 않는다", () => {
    const { aggregate, submission } = fixture();
    for (const value of ["approve-with-conditions", "request-changes", "veto"] as const) {
      expect(() => assertProductionSubmissionApproval({ ...aggregate, reviewDecisions: aggregate.reviewDecisions.map((entry) => ({ ...entry, value, conditions: ["수정 필요"] })) }, submission, "reviewer-user", at)).toThrow(BadRequestException);
    }
    expect(() => assertProductionSubmissionApproval({ ...aggregate, assignments: aggregate.assignments.map((entry) => entry.id === "reviewer" ? { ...entry, endsAt: "2026-10-27T00:00:00Z" } : entry) }, submission, "reviewer-user", at)).toThrow(BadRequestException);
    expect(() => assertProductionSubmissionApproval({ ...aggregate, reviewPolicies: aggregate.reviewPolicies.map((entry) => ({ ...entry, lanes: [] })) }, submission, "reviewer-user", at)).toThrow(BadRequestException);
  });
  it("재제출 뒤 이전 제출본 승인과 무관한 범위의 정책을 거절한다", () => {
    const { aggregate, submission } = fixture();
    expect(() => assertProductionSubmissionApproval({ ...aggregate, deliverables: aggregate.deliverables.map((entry) => ({ ...entry, currentSubmissionId: "s2" })) }, submission, "reviewer-user", at)).toThrow(BadRequestException);
    expect(() => assertProductionSubmissionApproval({ ...aggregate, reviewPolicies: aggregate.reviewPolicies.map((entry) => ({ ...entry, scope: projectScope("other") })) }, submission, "reviewer-user", at)).toThrow(BadRequestException);
  });
  it("공정 설정이 없어도 일반 작업 저장의 상태 건너뛰기와 완료 우회를 차단한다", () => {
    const { aggregate } = fixture();
    const before = { ...aggregate, tasks: [task({ status: "draft" })] };
    expect(() => assertProductionTaskMutationSafety(before, { ...before, tasks: [task({ status: "done" })] })).toThrow(BadRequestException);
    expect(() => assertProductionTaskMutationSafety(aggregate, { ...aggregate, tasks: [task({ status: "approved" })] })).toThrow(BadRequestException);
    const review = { ...aggregate, tasks: [task()] };
    expect(() => assertProductionTaskMutationSafety(review, { ...review, tasks: [task({ status: "approved" })] })).toThrow(BadRequestException);
  });
  it("모든 산출물의 현재 제출본이 승인되었을 때만 승인과 완료를 허용한다", () => {
    const { aggregate, submission } = fixture();
    const before = { ...aggregate, tasks: [task()], submissions: [submission],
      deliverables: aggregate.deliverables.map((entry) => ({ ...entry, approvedSubmissionId: submission.id })) };
    const approved = { ...before, tasks: [task({ status: "approved" })] };
    expect(() => assertProductionTaskMutationSafety(before, approved)).not.toThrow();
    expect(() => assertProductionTaskMutationSafety(approved, { ...approved, tasks: [task({ status: "done" })] })).not.toThrow();
    expect(() => assertProductionTaskMutationSafety(before, { ...approved, tasks: [task({ status: "approved", outputDeliverableIds: ["d1", "missing"] })] })).toThrow(BadRequestException);
    expect(() => assertProductionTaskMutationSafety(before, { ...approved, deliverables: approved.deliverables.map((entry) => ({ ...entry, currentSubmissionId: "new-unreviewed" })) })).toThrow(BadRequestException);
  });
  it("선행 작업 상태를 완료로 꾸미거나 승인 후 재제출해도 후속 작업을 시작하지 못한다", () => {
    const { aggregate, submission } = fixture();
    const upstream = task({ id: "upstream", status: "done" });
    const downstream = task({ status: "ready", dependencyTaskIds: [upstream.id], inputRevisionRefs: [submission.revisionRef] });
    const before = { ...aggregate, tasks: [upstream, downstream] };
    const after = { ...before, tasks: [upstream, { ...downstream, status: "in-progress" as const }] };
    expect(() => assertProductionTaskMutationSafety(before, after)).toThrow(BadRequestException);
    const reviewed = { ...before, submissions: [submission], deliverables: aggregate.deliverables.map((entry) => ({ ...entry, approvedSubmissionId: submission.id })) };
    expect(() => assertProductionTaskMutationSafety(reviewed, { ...reviewed, tasks: after.tasks })).not.toThrow();
    const revised = { ...reviewed, deliverables: reviewed.deliverables.map((entry) => ({ ...entry, currentSubmissionId: "s2", approvedSubmissionId: null })) };
    expect(() => assertProductionTaskMutationSafety(revised, { ...revised, tasks: after.tasks })).toThrow(BadRequestException);
  });
  it("무관한 레거시 완료 작업의 제목 수정은 허용하고 고정 입력 변경은 재검수한다", () => {
    const { aggregate, submission } = fixture();
    const legacy = task({ status: "done", inputRevisionRefs: [], outputDeliverableIds: [] });
    const before = { ...aggregate, tasks: [legacy] };
    expect(() => assertProductionTaskMutationSafety(before, { ...before, tasks: [{ ...legacy, title: "제목 정리" }] })).not.toThrow();
    expect(() => assertProductionTaskMutationSafety(before, { ...before, tasks: [{ ...legacy, inputRevisionRefs: [submission.revisionRef] }] })).toThrow(BadRequestException);
  });
});
