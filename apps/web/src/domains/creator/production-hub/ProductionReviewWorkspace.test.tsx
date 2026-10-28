// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { productionSubmissionReviewFixture } from "./production-review-submission.test-fixture";
import { ProductionReviewWorkspace } from "./ProductionReviewWorkspace";
import { createProductionDemoProject } from "./production-demo";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import type { ProductionClientCommand } from "./production-api";

afterEach(cleanup);
function mount(aggregate = createProductionDemoProject(), execute = vi.fn(async () => undefined)) {
  render(<ProductionReviewWorkspace aggregate={aggregate} canEdit roleLens="art" execute={execute} />);
  return execute;
}
describe("검수 우선순위와 컷별 입력", () => {
  it("해결된 질문과 완료된 수정 요청을 열린 이슈 집계에서 제외한다", () => {
    const base = createProductionDemoProject();
    mount({ ...base, clarifications: base.clarifications.map((entry) => ({ ...entry, status: "closed" })),
      changeRequests: base.changeRequests.map((entry) => ({ ...entry, status: "completed" })) });
    fireEvent.click(screen.getByRole("button", { name: "열린 이슈 컷" }));
    const navigator = screen.getByRole("complementary", { name: "검수 컷 목록" });
    expect(within(navigator).queryAllByRole("button", { name: /컷으로 이동/ })).toHaveLength(0);
    expect(within(navigator).getByRole("button", { name: /필터 초기화/ })).toBeTruthy();
  });
  it("컷을 바꿨다가 돌아와도 질문 초안과 차단 설정을 보존한다", () => {
    mount();
    fireEvent.change(screen.getByRole("textbox", { name: "검수 질문" }), { target: { value: "첫 컷의 의도 확인" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "cut-12-002 컷으로 이동" }));
    expect((screen.getByRole("textbox", { name: "검수 질문" }) as HTMLTextAreaElement).value).toBe("");
    fireEvent.change(screen.getByRole("textbox", { name: "검수 질문" }), { target: { value: "두 번째 컷 질문" } });
    fireEvent.click(screen.getByRole("button", { name: "cut-12-001 컷으로 이동" }));
    expect((screen.getByRole("textbox", { name: "검수 질문" }) as HTMLTextAreaElement).value).toBe("첫 컷의 의도 확인");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });
  it("질문 저장 실패를 표시하고 같은 컷의 입력을 유지한다", async () => {
    const execute = vi.fn(async () => { throw new Error("검수 서버 연결 실패"); });
    mount(createProductionDemoProject(), execute);
    fireEvent.change(screen.getByRole("textbox", { name: "검수 질문" }), { target: { value: "보존할 검수 질문" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 추가" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("검수 서버 연결 실패"));
    expect((screen.getByRole("textbox", { name: "검수 질문" }) as HTMLTextAreaElement).value).toBe("보존할 검수 질문");
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("다른 회차의 검수 라운드를 현재 회차 결정에 재사용하지 않는다", async () => {
    const base = createProductionDemoProject();
    const aggregate: ProductionProjectAggregate = { ...base, reviewDecisions: base.reviewDecisions.map((decision) => ({
      ...decision, reviewRoundId: "unrelated-round", evidenceScopeRefs: [{ kind: "episode", id: "episode-13", ancestors: [{ kind: "project", id: base.projectId }] }],
    })) };
    const execute = mount(aggregate);
    fireEvent.click(screen.getAllByRole("button", { name: "승인" })[0]!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "record-review-decision",
      decision: expect.objectContaining({ reviewRoundId: "submission-thumbnail-12-r2" }),
    }), expect.any(String)));
  });
});


describe("선택 작업에서 현재 제출본으로 이어지는 검수", () => {
  it("작업 링크의 회차와 현재 제출본을 선택하고 다른 산출물을 섞지 않는다", () => {
    const { aggregate, task, submission } = productionSubmissionReviewFixture("episode-13");
    render(<ProductionReviewWorkspace aggregate={aggregate} canEdit roleLens="art" execute={vi.fn(async () => undefined)} targetTaskId={task.id} preferredEpisodeId="episode-13" />);
    expect((screen.getByRole("combobox", { name: "검수 회차" }) as HTMLSelectElement).value).toBe("episode-13");
    const versions = screen.getByRole("combobox", { name: "검수 제출본" });
    expect((versions as HTMLSelectElement).value).toBe(submission.id);
    expect(within(versions).getAllByRole("option")).toHaveLength(2);
  });

  it("현재 제출본이 없으면 다른 원고를 선택하지 않고 승인과 수정을 차단한다", () => {
    const { aggregate, task, deliverable } = productionSubmissionReviewFixture();
    const noCurrent = { ...aggregate, deliverables: aggregate.deliverables.map((entry) => entry.id === deliverable.id ? { ...entry, currentSubmissionId: null } : entry) };
    render(<ProductionReviewWorkspace aggregate={noCurrent} canEdit roleLens="art" execute={vi.fn(async () => undefined)} targetTaskId={task.id} />);
    expect((screen.getByRole("combobox", { name: "검수 제출본" }) as HTMLSelectElement).value).toBe("");
    expect(screen.getByText(/이 작업에 연결된 현재 제출본이 없습니다/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "승인" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "수정" }).hasAttribute("disabled")).toBe(true);
  });

  it("현재 제출본 시작·결정·승인을 ACK 순서로 처리하고 제출본 ID로 검수를 고정한다", async () => {
    const { aggregate, task, submission } = productionSubmissionReviewFixture();
    const execute = vi.fn(async (_command: ProductionClientCommand, _message: string) => undefined);
    render(<ProductionReviewWorkspace aggregate={aggregate} canEdit roleLens="art" execute={execute} targetTaskId={task.id} />);
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(3));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ type: "upsert-submission", submission: { id: submission.id, status: "in-review" } });
    expect(execute.mock.calls[1]?.[0]).toMatchObject({ type: "record-review-decision", decision: { reviewRoundId: submission.id, assignmentId: "assignment-art" } });
    expect(execute.mock.calls[2]?.[0]).toMatchObject({ type: "upsert-submission", submission: { id: submission.id, status: "approved" } });
  });

  it("결정 저장이 실패하면 시작 ACK만 안내하고 승인 명령은 보내지 않는다", async () => {
    const { aggregate, task } = productionSubmissionReviewFixture();
    const execute = vi.fn(async (_command: ProductionClientCommand, _message: string) => undefined).mockImplementationOnce(async () => undefined).mockImplementationOnce(async () => { throw new Error("결정 저장 실패"); });
    render(<ProductionReviewWorkspace aggregate={aggregate} canEdit roleLens="art" execute={execute} targetTaskId={task.id} />);
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("검수 시작까지 저장"));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("화면 역할을 바꿔도 실제 계정 배정이 없는 참여자는 타인 명의 결정을 보낼 수 없다", () => {
    const { aggregate, task } = productionSubmissionReviewFixture();
    const execute = vi.fn(async () => undefined);
    render(<ProductionReviewWorkspace aggregate={aggregate} canEdit roleLens="art" execute={execute} targetTaskId={task.id} viewerAssignmentIds={[]} />);
    expect(screen.queryByRole("button", { name: "승인" })).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
  it("필수 승인이 모였어도 열린 인계 질문이 있으면 최종 확정을 잠그고 질문 답변으로 안내한다", () => {
    const { aggregate, task, submission, decision, deliverable } = productionSubmissionReviewFixture();
    const source = createProductionDemoProject().clarifications.find((entry) => entry.blocking);
    if (!source) throw new Error("인계 질문 기준이 없습니다.");
    const project = { ...aggregate, clarifications: [{ ...source, scope: deliverable.scope }], reviewDecisions: [decision],
      submissions: aggregate.submissions.map((entry) => entry.id === submission.id ? { ...entry, status: "in-review" as const } : entry) };
    render(<ProductionReviewWorkspace aggregate={project} canEdit roleLens="art" execute={vi.fn(async () => undefined)} targetTaskId={task.id} />);
    expect(screen.getByRole("button", { name: "제출본 승인 확정" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("link", { name: "인계 질문 확인·답변" }).getAttribute("href")).toContain("episode-12");
  });
});
