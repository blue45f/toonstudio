// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductionClientCommand } from "./production-api";
import { ProductionReviewPolicyEditor } from "./ProductionReviewPolicyEditor";
import { productionReviewFlowFixture } from "./production-review-flow.test-fixture";

const auth = vi.hoisted(() => ({ id: "review-flow-owner", revision: 1, listeners: new Set<() => void>() }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({ getAuthSession: () => ({ user: { id: auth.id } }), getAuthSessionRevision: () => auth.revision, listeners: auth.listeners }));
beforeEach(() => { auth.id = "review-flow-owner"; auth.revision = 1; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-29T12:00:00.000Z")); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
function fill() {
  fireEvent.click(screen.getByRole("button", { name: "검수 기준 만들기" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "제작" }));
  const lane = screen.getByRole("group", { name: "제작" });
  fireEvent.click(within(lane).getByRole("checkbox", { name: /제작 담당/ }));
}
describe("빈 제작 프로젝트의 실제 검수 정책 편집", () => {
  it("관리자만 빈 프로젝트에 accounts 정책을 실제 명령으로 저장한다", async () => {
    const f = productionReviewFlowFixture(), execute = vi.fn<(command: ProductionClientCommand, message: string) => Promise<void>>().mockResolvedValue(undefined);
    const view = render(<ProductionReviewPolicyEditor aggregate={f.base} canManage={false} execute={execute} />);
    expect(screen.queryByRole("button", { name: "검수 기준 만들기" })).toBeNull();
    view.rerender(<ProductionReviewPolicyEditor aggregate={f.base} canManage execute={execute} />); fill();
    fireEvent.click(screen.getByRole("button", { name: "검수 기준 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ type: "upsert-review-policy", policy: { projectId: f.base.projectId, quorumBasis: "accounts",
      lanes: [{ lane: "production", eligibleAssignmentIds: [f.base.assignments[0]?.id], quorum: 1 }] } });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); expect(f.base.reviewPolicies).toEqual([]);
  });
  it("ACK 미확인은 원래 정책을 고정하고 실제 저장 확인 전에는 새 명령을 보내지 않는다", async () => {
    const f = productionReviewFlowFixture(), execute = vi.fn<(command: ProductionClientCommand, message: string) => Promise<void>>().mockRejectedValue(new Error("응답 유실"));
    const refresh = vi.fn(async () => undefined);
    const view = render(<ProductionReviewPolicyEditor aggregate={f.base} canManage execute={execute} refresh={refresh} />); fill();
    fireEvent.click(screen.getByRole("button", { name: "검수 기준 저장" })); await screen.findByRole("alert");
    expect(screen.getByRole("combobox", { name: "정족수 집계 기준" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "저장 상태 확인" })); await waitFor(() => expect(refresh).toHaveBeenCalledOnce()); expect(execute).toHaveBeenCalledOnce();
    const command = execute.mock.calls[0]?.[0]; if (command?.type !== "upsert-review-policy") throw new Error("원래 정책 명령이 없습니다.");
    await act(async () => { view.rerender(<ProductionReviewPolicyEditor aggregate={{ ...f.base, revision: f.base.revision + 1, reviewPolicies: [command.policy] }} canManage execute={execute} refresh={refresh} />); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); expect(execute).toHaveBeenCalledOnce();
  });
});
