// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useApp } from "@/shared/lib/store";
import { ProductionReviewSurface } from "./ProductionReviewSurface";
import { productionReviewFlowFixture } from "./production-review-flow.test-fixture";
import type { ProductionClientCommand } from "./production-api";

vi.mock("./ProductionSubmissionVisualReview", () => ({ ProductionSubmissionVisualReview: () => <div>원고 이미지 경계</div> }));
const previousUser = useApp.getState().userId;
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-29T12:00:00.000Z")); useApp.setState({ userId: "review-flow-editor" }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); useApp.setState({ userId: previousUser }); });
describe("실제 검수 Surface의 현재 계정과 복수 역할", () => {
  it("타인 역할을 빌리지 않고 자기 두 번째 정책 역할을 명시적으로 선택해 결정한다", async () => {
    const f = productionReviewFlowFixture(), otherOwn = { ...f.editor, id: "review-flow-other-own", roleType: "art-lead" as const };
    const foreign = { ...f.editor, id: "review-flow-foreign", partyId: f.artist.partyId, roleType: "art-lead" as const };
    const aggregate = { ...f.aggregate, assignments: [foreign, ...f.aggregate.assignments, otherOwn], reviewPolicies: [{ ...f.policy, lanes: [...f.policy.lanes,
      { lane: "narrative" as const, eligibleAssignmentIds: [otherOwn.id, foreign.id], requiredAssignmentIds: [otherOwn.id], quorum: 1, vetoAssignmentIds: [], blocksPublication: true }] }] };
    const execute = vi.fn<(command: ProductionClientCommand, message: string) => Promise<void>>().mockResolvedValue(undefined);
    render(<MemoryRouter initialEntries={[`/?task=${f.task.id}&episode=${f.scope.id}`]}><ProductionReviewSurface aggregate={aggregate} execute={execute} canEdit={false} canReview roleLens="producer" /></MemoryRouter>);
    const picker = screen.getByRole("combobox", { name: "내 검수 역할" }), values = within(picker).getAllByRole("option").map((entry) => (entry as HTMLOptionElement).value);
    expect(values).toEqual(["", f.editor.id, otherOwn.id]); expect(values).not.toContain(foreign.id);
    fireEvent.change(picker, { target: { value: otherOwn.id } });
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    await waitFor(() => expect(execute.mock.calls.some(([command]) => command.type === "record-review-decision")).toBe(true));
    const decision = execute.mock.calls.find(([command]) => command.type === "record-review-decision")?.[0];
    expect(decision).toMatchObject({ type: "record-review-decision", decision: { assignmentId: otherOwn.id, lane: "narrative", reviewRoundId: f.submission.id } });
    if (decision?.type !== "record-review-decision") throw new Error("실제 결정 명령이 없습니다.");
    expect(decision.decision).not.toHaveProperty("reviewerAccountUserId");
  });
  it("현재 계정이 없으면 다른 연결 계정이나 null party의 lane 결정을 표시하지 않는다", () => {
    const f = productionReviewFlowFixture(); useApp.setState({ userId: null });
    render(<MemoryRouter initialEntries={[`/?task=${f.task.id}`]}><ProductionReviewSurface aggregate={f.aggregate} execute={vi.fn(async () => undefined)} canEdit={false} canReview roleLens="art" /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "승인" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "내 검수 역할" }).hasAttribute("disabled")).toBe(true);
  });
  it("명시적으로 고른 자기 역할이 만료돼도 다른 역할로 결정을 조용히 바꾸지 않는다", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const f = productionReviewFlowFixture(), second = { ...f.editor, id: "review-flow-expiring", roleType: "art-lead" as const, endsAt: new Date(Date.now() + 1000).toISOString() };
    const lane = f.policy.lanes[0]; if (!lane) throw new Error("검수 항목이 없습니다.");
    const aggregate = { ...f.aggregate, assignments: [...f.aggregate.assignments, second], reviewPolicies: [{ ...f.policy, lanes: [{ ...lane, eligibleAssignmentIds: [f.editor.id, second.id] }] }] };
    render(<MemoryRouter initialEntries={[`/?task=${f.task.id}`]}><ProductionReviewSurface aggregate={aggregate} execute={vi.fn(async () => undefined)} canEdit={false} canReview roleLens="art" /></MemoryRouter>);
    const picker = screen.getByRole("combobox", { name: "내 검수 역할" }); fireEvent.change(picker, { target: { value: second.id } });
    act(() => { vi.advanceTimersByTime(1001); });
    expect((picker as HTMLSelectElement).value).toBe(""); expect(screen.queryByRole("button", { name: "승인" })).toBeNull();
    fireEvent.change(picker, { target: { value: f.editor.id } }); expect(screen.getByRole("button", { name: "승인" })).toBeTruthy();
  });
  it("현재 역할 연결과 다른 과거 계정 stamp로 승인 확정 버튼을 열지 않는다", () => {
    const f = productionReviewFlowFixture();
    const aggregate = { ...f.aggregate, submissions: [{ ...f.submission, status: "in-review" as const }], reviewDecisions: [{ id: "old-account-approval",
      reviewRoundId: f.submission.id, lane: "visual-direction" as const, assignmentId: f.editor.id, reviewerAccountUserId: "old-linked-account", value: "approve" as const,
      reasonCode: null, evidenceScopeRefs: [f.scope], conditions: [], createdAt: "2026-10-29T01:00:00.000Z" }] };
    render(<MemoryRouter initialEntries={[`/?task=${f.task.id}`]}><ProductionReviewSurface aggregate={aggregate} execute={vi.fn(async () => undefined)} canEdit={false} canReview roleLens="art" /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "제출본 승인 확정" })).toBeNull(); expect(screen.getByRole("button", { name: "승인" })).toBeTruthy();
  });
});
