// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductionProjectAggregate, Submission } from "@toonstudio/core/production";

import { productionSubmissionReviewFixture, REVIEW_TEST_AT } from "./production-review-submission.test-fixture";
import { planProductionSubmissionApproval, planProductionSubmissionReview } from "./production-review-submission";
import { ProductionReviewWorkspace } from "./ProductionReviewWorkspace";

afterEach(cleanup);

function fixture(mode: "current" | "unapproved" | "reapproved", taskRepinned = false) {
  const f = productionSubmissionReviewFixture();
  const a1 = { ...f.submission.revisionRef, id: "upstream-a1", revision: 1, digest: `sha256:${"a".repeat(64)}` };
  const a2 = { ...a1, id: "upstream-a2", revision: 2, digest: `sha256:${"b".repeat(64)}` };
  const prior: Submission = { ...f.submission, id: "upstream-submission-a1", deliverableId: "upstream-output", revisionRef: a1, status: "approved" };
  const latest: Submission = { ...prior, id: "upstream-submission-a2", revisionRef: a2,
    status: mode === "reapproved" ? "approved" : "submitted" };
  const upstream = { ...f.task, id: "upstream-task", status: "done" as const, dependencyTaskIds: [], outputDeliverableIds: [prior.deliverableId] };
  const task = { ...f.task, inputRevisionRefs: [taskRepinned ? a2 : a1], dependencyTaskIds: [upstream.id] };
  const submission = { ...f.submission, status: "in-review" as const, inputRevisionRefs: [a1] };
  const aggregate: ProductionProjectAggregate = { ...f.aggregate,
    tasks: [...f.aggregate.tasks.filter((entry) => entry.id !== task.id), task, upstream],
    submissions: [...f.aggregate.submissions.filter((entry) => entry.id !== submission.id), submission, prior,
      ...(mode === "current" ? [] : [latest])],
    deliverables: [...f.aggregate.deliverables, { ...f.deliverable, id: prior.deliverableId,
      currentSubmissionId: mode === "current" ? prior.id : latest.id,
      approvedSubmissionId: mode === "unapproved" ? null : mode === "current" ? prior.id : latest.id }],
  };
  return { ...f, aggregate, task, submission };
}

describe("현재 선행 입력과 다른 제출본의 검수 계획", () => {
  for (const mode of ["unapproved", "reapproved"] as const) {
    it(`${mode}: 의견은 기록하지만 낡은 제출본의 자동 승인 명령은 계획하지 않는다`, () => {
      const f = fixture(mode), before = structuredClone(f.aggregate);
      expect(planProductionSubmissionReview(f.aggregate, f.submission, f.policy, f.decision, REVIEW_TEST_AT)
        .map((step) => step.stage)).toEqual(["record-decision"]);
      expect(f.aggregate).toEqual(before);
    });

    it(`${mode}: 기존 승인 의견이 있어도 명시적 확정 전에 재작업 이유를 알린다`, () => {
      const f = fixture(mode);
      expect(() => planProductionSubmissionApproval({ ...f.aggregate, reviewDecisions: [f.decision] },
        f.submission, f.policy, f.decision.assignmentId, REVIEW_TEST_AT)).toThrow("선행 입력");
    });

    it(`${mode}: 수정 요청은 계속 저장하여 새 입력의 재작업으로 이어진다`, () => {
      const f = fixture(mode);
      expect(planProductionSubmissionReview(f.aggregate, f.submission, f.policy,
        { ...f.decision, value: "request-changes", reasonCode: "new-upstream" }, REVIEW_TEST_AT)
        .map((step) => step.stage)).toEqual(["record-decision", "request-changes"]);
    });
  }

  it("작업만 새 입력으로 바꿔도 이전 제출본의 자동 승인을 계획하지 않는다", () => {
    const f = fixture("reapproved", true);
    expect(planProductionSubmissionReview(f.aggregate, f.submission, f.policy, f.decision, REVIEW_TEST_AT)
      .map((step) => step.stage)).toEqual(["record-decision"]);
  });

  it("현재 선행 승인 입력이 일치하면 기존 자동 승인과 명시적 확정을 유지한다", () => {
    const f = fixture("current");
    expect(planProductionSubmissionReview(f.aggregate, f.submission, f.policy, f.decision, REVIEW_TEST_AT)
      .map((step) => step.stage)).toEqual(["record-decision", "approve-submission"]);
    expect(planProductionSubmissionApproval({ ...f.aggregate, reviewDecisions: [f.decision] },
      f.submission, f.policy, f.decision.assignmentId, REVIEW_TEST_AT).stage).toBe("approve-submission");
  });

  it("화면에서 선행 입력 변경을 알리고 확정만 막으며 검수 의견은 보존한다", async () => {
    const f = fixture("reapproved");
    const execute = vi.fn(async () => undefined);
    render(<ProductionReviewWorkspace aggregate={{ ...f.aggregate, reviewDecisions: [f.decision] }}
      targetTaskId={f.task.id} roleLens="art" canEdit execute={execute} />);
    expect(screen.getByText(/선행 입력이 바뀌었습니다/)).toBeTruthy();
    expect(screen.queryByText("검수 통과")).toBeNull();
    expect(screen.getByRole("button", { name: "제출본 승인 확정" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]).toEqual([expect.objectContaining({ type: "record-review-decision" }), expect.any(String)]);
  });
});
