import { describe, expect, it } from "vitest";
import { productionDemoAdapter, resetProductionDemoSession } from "./production-demo-adapter";
import { productionSubmissionReviewFixture, REVIEW_TEST_AT } from "./production-review-submission.test-fixture";
import { planProductionSubmissionApproval, planProductionSubmissionReview, resolveProductionReviewTarget } from "./production-review-submission";
import { createProductionDemoProject } from "./production-demo";

describe("분업 작업의 정확한 제출본 검수", () => {
  it("다른 회차에 첫 제출본이 있어도 선택 작업의 현재 산출물 제출본만 연다", () => {
    const { aggregate, task, submission } = productionSubmissionReviewFixture("episode-13");
    const target = resolveProductionReviewTarget(aggregate, task.id, "episode-13");
    expect(target.episodeId).toBe("episode-13");
    expect(target.submissions.map((entry) => entry.id)).toEqual([submission.id]);
    expect(target.issue).toBeNull();
  });
  it("작업·회차가 없거나 충돌하거나 current 포인터가 없으면 관련 없는 제출본으로 대체하지 않는다", () => {
    const { aggregate, task, deliverable } = productionSubmissionReviewFixture();
    expect(resolveProductionReviewTarget(aggregate, "missing").submissions).toEqual([]);
    expect(resolveProductionReviewTarget(aggregate, task.id, "episode-13").issue).toBe("episode-conflict");
    const noCurrent = { ...aggregate, deliverables: aggregate.deliverables.map((entry) => entry.id === deliverable.id ? { ...entry, currentSubmissionId: null } : entry) };
    expect(resolveProductionReviewTarget(noCurrent, task.id).submissions).toEqual([]);
    const noOutputs = { ...aggregate, tasks: aggregate.tasks.map((entry) => entry.id === task.id ? { ...entry, outputDeliverableIds: [] } : entry) };
    expect(resolveProductionReviewTarget(noOutputs, task.id).submissions).toEqual([]);
  });
  it("제출본 시작 ACK, 제출본 ID에 고정된 결정 ACK, 최종 승인 순서로 내용을 바꾸지 않고 저장한다", () => {
    const { aggregate, submission, policy, decision } = productionSubmissionReviewFixture();
    const steps = planProductionSubmissionReview(aggregate, submission, policy, decision, REVIEW_TEST_AT);
    expect(steps.map((step) => step.stage)).toEqual(["start-review", "record-decision", "approve-submission"]);
    expect(steps[1]?.command).toMatchObject({ type: "record-review-decision", decision: { reviewRoundId: submission.id } });
    expect(steps[2]?.command).toMatchObject({ type: "upsert-submission", submission: { ...submission, status: "approved", evidenceRefs: [...submission.evidenceRefs, decision.id] } });
  });
  it("다른 제출본의 승인과 조건부 승인을 재사용해 최종 확정하지 않는다", () => {
    const { aggregate, submission, policy, decision } = productionSubmissionReviewFixture();
    const two = { ...policy, lanes: policy.lanes.map((lane) => ({ ...lane, eligibleAssignmentIds: [...lane.eligibleAssignmentIds, "assignment-story"], quorum: 2 })) };
    const project = { ...aggregate, reviewPolicies: [two], reviewDecisions: [{ ...decision, id: "old", reviewRoundId: "old-submission", assignmentId: "assignment-story" }] };
    expect(planProductionSubmissionReview(project, submission, two, decision, REVIEW_TEST_AT).map((step) => step.stage)).not.toContain("approve-submission");
    const conditional = { ...project, reviewDecisions: [{ ...decision, id: "conditional", assignmentId: "assignment-story", value: "approve-with-conditions" as const, conditions: ["수정 필요"] }] };
    expect(planProductionSubmissionReview(conditional, submission, two, decision, REVIEW_TEST_AT).map((step) => step.stage)).not.toContain("approve-submission");
  });
  it("수정 요청은 결정 저장 다음에 현재 제출본 상태에 반영한다", () => {
    const { aggregate, submission, policy, decision } = productionSubmissionReviewFixture();
    const steps = planProductionSubmissionReview(aggregate, submission, policy, { ...decision, value: "request-changes", reasonCode: "needs-revision" }, REVIEW_TEST_AT);
    expect(steps.map((step) => step.stage)).toEqual(["start-review", "record-decision", "request-changes"]);
    expect(steps[2]?.command).toMatchObject({ type: "upsert-submission", submission: { status: "changes-requested", id: submission.id } });
  });
  it("정족수는 모였지만 확정 ACK가 실패한 경우 현재 검수본의 기존 결정을 사용해 명시적으로 재시도한다", () => {
    const { aggregate, submission, policy, decision } = productionSubmissionReviewFixture();
    const current = { ...submission, status: "in-review" as const };
    const project = { ...aggregate, submissions: aggregate.submissions.map((entry) => entry.id === submission.id ? current : entry), reviewDecisions: [decision] };
    expect(planProductionSubmissionApproval(project, current, policy, decision.assignmentId, REVIEW_TEST_AT).command).toMatchObject({ type: "upsert-submission", submission: { status: "approved", id: submission.id } });
    expect(() => planProductionSubmissionApproval(project, current, policy, "unrelated", REVIEW_TEST_AT)).toThrow();
  });
  it("인계 차단 질문이 열려 있거나 답변 확인 중이면 의견은 기록하되 최종 제출본 승인은 확정하지 않는다", () => {
    const { aggregate, submission, policy, decision, deliverable } = productionSubmissionReviewFixture();
    const source = createProductionDemoProject().clarifications.find((entry) => entry.blocking);
    if (!source) throw new Error("인계 질문 기준이 없습니다.");
    for (const status of ["open", "answered"] as const) {
      const project = { ...aggregate, clarifications: [{ ...source, status, scope: deliverable.scope }] };
      expect(planProductionSubmissionReview(project, submission, policy, decision, REVIEW_TEST_AT).map((step) => step.stage)).toEqual(["start-review", "record-decision"]);
      expect(() => planProductionSubmissionApproval({ ...project, reviewDecisions: [decision] }, { ...submission, status: "in-review" }, policy, decision.assignmentId, REVIEW_TEST_AT)).toThrow("인계 질문");
    }
  });
  it("로컬 샘플도 실제 제출본 포인터와 모든 산출물 검수를 통과한 공정 승인 상태를 함께 갱신한다", () => {
    resetProductionDemoSession();
    const { aggregate, submission, policy, decision, task, deliverable } = productionSubmissionReviewFixture();
    let current = aggregate;
    for (const step of planProductionSubmissionReview(aggregate, submission, policy, decision, REVIEW_TEST_AT)) current = productionDemoAdapter.reduce(current, step.command);
    expect(current.deliverables.find((entry) => entry.id === deliverable.id)).toMatchObject({ currentSubmissionId: submission.id, approvedSubmissionId: submission.id });
    expect(current.tasks.find((entry) => entry.id === task.id)?.status).toBe("approved");
    resetProductionDemoSession();
  });
  it("로컬 샘플의 수정 요청도 제출본과 연결 공정에 함께 반영하고 기존 결정은 덮어쓰지 않는다", () => {
    resetProductionDemoSession();
    const { aggregate, submission, policy, decision, task } = productionSubmissionReviewFixture();
    const revise = { ...decision, value: "request-changes" as const, reasonCode: "needs-revision" };
    let current = aggregate;
    const steps = planProductionSubmissionReview(aggregate, submission, policy, revise, REVIEW_TEST_AT);
    for (const step of steps) current = productionDemoAdapter.reduce(current, step.command);
    expect(current.submissions.find((entry) => entry.id === submission.id)?.status).toBe("changes-requested");
    expect(current.tasks.find((entry) => entry.id === task.id)?.status).toBe("changes-requested");
    expect(() => productionDemoAdapter.reduce(current, { type: "record-review-decision", policyId: policy.id, decision: revise })).toThrow("이미 기록된");
    resetProductionDemoSession();
  });
});
