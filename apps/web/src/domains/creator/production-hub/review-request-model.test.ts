import { describe, expect, it } from "vitest";
import { transitionProductionTaskBatch } from "@toonstudio/contracts/production-workflow";
import { buildCompareReviewPath, buildReviewRequestPlan, buildTaskReviewPath, confirmsReviewRequest, createReviewRequestDraft,
  deriveReviewRequestEpisodes, deriveReviewRequestReviewers, reviewInboxItemHref, validateReviewRequestDraft, type ReviewRequestDraft } from "./review-request-model";
import { productionReviewFlowFixture, REVIEW_FLOW_AT } from "./production-review-flow.test-fixture";

const NOW = new Date("2026-10-29T12:00:00.000Z"), localize = (ko: string) => ko;
function fixture() {
  const f = productionReviewFlowFixture();
  const draft: ReviewRequestDraft = { ...createReviewRequestDraft(f.scope.id, NOW), taskId: f.task.id, reviewerAssignmentId: f.editor.id,
    lane: "visual-direction", checkpointIds: ["art-consistency"], note: "원래 제출본으로 검수해 주세요." };
  return { ...f, draft };
}
describe("실제 제작 작업의 검수 요청", () => {
  it("빈 프로젝트는 예시 검수 작업이나 제출본을 만들지 않는다", () => {
    const f = fixture(); expect(deriveReviewRequestEpisodes(f.base)).toEqual([]);
    expect(() => buildReviewRequestPlan(f.base, f.draft, { id: "request", localize, at: REVIEW_FLOW_AT })).toThrow();
  });
  it("회차 기준뿐 아니라 실제 상위 프로젝트 정책의 대상 회차도 표시한다", () => {
    const f = fixture();
    expect(deriveReviewRequestEpisodes(f.aggregate).map((entry) => entry.episodeId)).toEqual([f.scope.id]);
    expect(deriveReviewRequestEpisodes({ ...f.aggregate, reviewPolicies: [{ ...f.policy, scope: f.editor.scope }] }).map((entry) => entry.episodeId)).toEqual([f.scope.id]);
  });
  it("원래 담당자·입력·출력·선행·제목·조건·메모를 보존하며 같은 task에 검수를 요청한다", () => {
    const f = fixture(), plan = buildReviewRequestPlan(f.aggregate, f.draft, { id: "request-one", localize, at: REVIEW_FLOW_AT });
    expect(plan.command).toMatchObject({ type: "upsert-task-batch", expectedTasks: [f.task], tasks: [plan.task] });
    expect(plan.task).toMatchObject({ id: f.task.id, title: f.task.title, assignmentIds: f.task.assignmentIds, inputRevisionRefs: f.task.inputRevisionRefs,
      outputDeliverableIds: f.task.outputDeliverableIds, dependencyTaskIds: f.task.dependencyTaskIds, status: "internal-review", reviewerAssignmentIds: [f.editor.id] });
    expect(plan.task.completionCriteria).toEqual(["기존 선화 완료 조건", "그림·캐릭터 일관성"]);
    expect(plan.task.briefBlocks).toEqual([...(f.task.briefBlocks ?? []), expect.objectContaining({ id: "request-one-note", text: expect.stringContaining(f.draft.note) })]);
    expect(plan.outputSubmissionIds).toEqual([f.submission.id]); expect(f.task.status).toBe("in-progress");
    const prepared = { ...plan.task, status: "in-progress" as const };
    expect(transitionProductionTaskBatch({ ...f.aggregate, tasks: [prepared] }, [{ taskId: prepared.id, fromStatus: "in-progress", toStatus: "internal-review" }], REVIEW_FLOW_AT)[0]?.status).toBe("internal-review");
  });
  it.each(["draft", "ready", "needs-input", "approved", "done"] as const)("%s 단계는 숨은 상태 전환으로 건너뛰지 않는다", (status) => {
    const f = fixture(); expect(() => buildReviewRequestPlan({ ...f.aggregate, tasks: [{ ...f.task, status }] }, f.draft, { id: "request", localize, at: REVIEW_FLOW_AT })).toThrow("작업 보드");
  });
  it("현재 제출본·고정 입력이 달라지거나 제출본이 없어지면 요청을 만들지 않는다", () => {
    const f = fixture();
    expect(() => buildReviewRequestPlan({ ...f.aggregate, submissions: [] }, f.draft, { id: "request", localize, at: REVIEW_FLOW_AT })).toThrow("현재 제출본");
    expect(() => buildReviewRequestPlan({ ...f.aggregate, submissions: [{ ...f.submission, inputRevisionRefs: [] }] }, f.draft, { id: "request", localize, at: REVIEW_FLOW_AT })).toThrow("현재 제출본");
  });
  it("자격 후보는 실제 연결 계정·기간·공정 검수역할·정책 lane을 함께 확인한다", () => {
    const f = fixture(); expect(deriveReviewRequestReviewers(f.aggregate, f.scope.id, f.task.id, REVIEW_FLOW_AT).map((entry) => entry.assignmentId)).toEqual([f.editor.id]);
    const unlinked = { ...f.aggregate, parties: f.aggregate.parties.map((party) => party.id === f.editorParty.id ? { ...party, accountUserId: null } : party) };
    expect(deriveReviewRequestReviewers(unlinked, f.scope.id, f.task.id, REVIEW_FLOW_AT)).toEqual([]);
    expect(() => buildReviewRequestPlan(unlinked, f.draft, { id: "request", localize, at: REVIEW_FLOW_AT })).toThrow("연결 검수자");
  });
  it("복구는 task 내용과 같은 현재 제출본이 실제로 저장됐을 때만 확인한다", () => {
    const f = fixture(), plan = buildReviewRequestPlan(f.aggregate, f.draft, { id: "request", localize, at: REVIEW_FLOW_AT });
    expect(confirmsReviewRequest({ ...f.aggregate, revision: f.aggregate.revision + 1, tasks: [plan.task] }, plan)).toBe(true);
    expect(confirmsReviewRequest(f.aggregate, plan)).toBe(false);
    expect(confirmsReviewRequest({ ...f.aggregate, revision: f.aggregate.revision + 1, tasks: [plan.task], deliverables: [{ ...f.deliverable, currentSubmissionId: "other-submission" }] }, plan)).toBe(false);
  });
  it("기본 마감·필수 선택과 실제 task deep link를 보존한다", () => {
    const f = fixture(); expect(createReviewRequestDraft(f.scope.id, NOW).dueDate).toBe("2026-11-01");
    expect(validateReviewRequestDraft({ ...f.draft, taskId: "" }, NOW)).toContain("task-required");
    expect(validateReviewRequestDraft({ ...f.draft, dueDate: "2026-10-28" }, NOW)).toContain("due-past");
    expect(validateReviewRequestDraft({ ...f.draft, dueDate: "2026-02-31" }, NOW)).toContain("due-invalid");
    expect(buildCompareReviewPath("project 1", "ep/1")).toBe("/production/projects/project%201/episodes/ep%2F1?roomView=compare");
    expect(reviewInboxItemHref({ bucket: "review", projectId: f.aggregate.projectId, taskId: f.task.id, episodeId: f.scope.id })).toBe(buildTaskReviewPath(f.aggregate.projectId, f.task.id, f.scope.id));
  });
});
