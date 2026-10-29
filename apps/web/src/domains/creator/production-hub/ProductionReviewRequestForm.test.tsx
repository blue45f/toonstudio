// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductionClientCommand } from "./production-api";
import { ProductionReviewRequestForm } from "./ProductionReviewRequestForm";
import { productionReviewFlowFixture } from "./production-review-flow.test-fixture";

const auth = vi.hoisted(() => ({ id: "review-flow-owner", revision: 1, listeners: new Set<() => void>() }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({ getAuthSession: () => ({ user: { id: auth.id } }), getAuthSessionRevision: () => auth.revision, listeners: auth.listeners }));
beforeEach(() => { auth.id = "review-flow-owner"; auth.revision = 1; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-29T12:00:00.000Z")); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
function fill() {
  fireEvent.change(screen.getByRole("combobox", { name: "현재 원고를 검수할 작업" }), { target: { value: "review-flow-task" } });
  fireEvent.change(screen.getByRole("combobox", { name: "검수자" }), { target: { value: "review-flow-editor-assignment" } });
}
describe("현재 제출본에 연결된 검수 요청 폼", () => {
  it("새 빈 검수 작업 대신 기존 실제 task와 exact expectedTasks를 저장하고 그 작업으로 연결한다", async () => {
    const f = productionReviewFlowFixture(), execute = vi.fn<(command: ProductionClientCommand, message: string) => Promise<void>>().mockResolvedValue(undefined);
    render(<MemoryRouter><ProductionReviewRequestForm aggregate={f.aggregate} canEdit execute={execute} /></MemoryRouter>); fill();
    fireEvent.click(screen.getByRole("button", { name: "검수 요청 보내기" })); await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ type: "upsert-task-batch", expectedTasks: [f.task], tasks: [expect.objectContaining({ id: f.task.id,
      status: "internal-review", inputRevisionRefs: f.task.inputRevisionRefs, outputDeliverableIds: f.task.outputDeliverableIds, assignmentIds: f.task.assignmentIds })] });
    const link = await screen.findByRole("link", { name: "비교 검수로 열기" }); expect(link.getAttribute("href")).toContain(`task=${f.task.id}`);
    expect(f.aggregate.tasks).toHaveLength(1); expect(f.aggregate.tasks[0]?.status).toBe("in-progress");
  });
  it("준비 단계는 시작을 자동 강제하지 않고 선택한 실제 작업으로 안내한다", () => {
    const f = productionReviewFlowFixture(), execute = vi.fn(async () => undefined);
    render(<MemoryRouter><ProductionReviewRequestForm aggregate={{ ...f.aggregate, tasks: [{ ...f.task, status: "ready" }] }} canEdit execute={execute} /></MemoryRouter>); fill();
    expect(screen.getByRole("button", { name: "검수 요청 보내기" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("link", { name: "선택한 작업 열기" }).getAttribute("href")).toContain(f.task.id); expect(execute).not.toHaveBeenCalled();
  });
  it("ACK 미확인은 원래 요청을 고정하고 실제 task·제출본 저장 확인까지 새 명령을 보내지 않는다", async () => {
    const f = productionReviewFlowFixture(), execute = vi.fn<(command: ProductionClientCommand, message: string) => Promise<void>>().mockRejectedValue(new Error("응답 미확인"));
    const refresh = vi.fn(async () => undefined);
    const view = render(<MemoryRouter><ProductionReviewRequestForm aggregate={f.aggregate} canEdit execute={execute} refresh={refresh} /></MemoryRouter>); fill();
    fireEvent.click(screen.getByRole("button", { name: "검수 요청 보내기" })); await screen.findByRole("alert");
    expect(screen.getByRole("combobox", { name: "현재 원고를 검수할 작업" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "저장 상태 확인" })); await waitFor(() => expect(refresh).toHaveBeenCalledOnce()); expect(execute).toHaveBeenCalledOnce();
    const command = execute.mock.calls[0]?.[0]; if (command?.type !== "upsert-task-batch") throw new Error("원래 검수 요청 명령이 없습니다.");
    await act(async () => { view.rerender(<MemoryRouter><ProductionReviewRequestForm aggregate={{ ...f.aggregate, revision: f.aggregate.revision + 1, tasks: command.tasks }} canEdit execute={execute} refresh={refresh} /></MemoryRouter>); });
    await screen.findByRole("link", { name: "비교 검수로 열기" }); expect(execute).toHaveBeenCalledOnce();
  });
});
