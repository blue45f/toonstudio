// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { ProductionProjectPage } from "./ProductionHubPage";
import { createProductionDemoProject } from "./production-demo";
import type { ScopeRef } from "@toonstudio/core/production";
import { SessionContext, persistSession } from "@/domains/auth/public/session/auth-session-store";
import { useApp } from "@/shared/lib/store";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("./production-api", async (load) => ({ ...await load<typeof import("./production-api")>(),
  getProductionProject: (...args: unknown[]) => mocks.load(...args), executeProductionCommand: (...args: unknown[]) => mocks.save(...args) }));
vi.mock("@/platform/me-client", () => ({ getMyProfile: async () => { throw new Error("profile unavailable"); } }));
const original = createProductionDemoProject();
const actualProjectId = "actual-route-project";
const ownerPartyId = original.assignments.find((assignment) => assignment.roleType === "producer")?.partyId;
const scopeForProject = (scope: ScopeRef): ScopeRef => ({ ...scope,
  id: scope.kind === "project" ? actualProjectId : scope.id,
  ancestors: scope.ancestors.map((ancestor) => ancestor.kind === "project" ? { ...ancestor, id: actualProjectId } : ancestor),
});
const project = { aggregate: { ...original, projectId: actualProjectId,
  parties: original.parties.map((party) => party.id === ownerPartyId ? { ...party, accountUserId: "local-test-owner" } : party),
  assignments: original.assignments.map((assignment) => ({ ...assignment, projectId: actualProjectId, scope: scopeForProject(assignment.scope) })),
  tasks: original.tasks.map((task) => ({ ...task, projectId: actualProjectId, scope: scopeForProject(task.scope) })),
  episodes: original.episodes.map((episode) => ({ ...episode, projectId: actualProjectId })),
  handoffs: original.handoffs.map((handoff) => ({ ...handoff, projectId: actualProjectId })),
  clarifications: original.clarifications.map((thread) => ({ ...thread, scope: scopeForProject(thread.scope) })),
  deliverables: original.deliverables.map((deliverable) => ({ ...deliverable, projectId: actualProjectId, scope: scopeForProject(deliverable.scope) })),
  submissions: original.submissions.map((submission) => ({ ...submission, projectId: actualProjectId })),
  reviewPolicies: original.reviewPolicies.map((policy) => ({ ...policy, projectId: actualProjectId, scope: scopeForProject(policy.scope) })),
}, access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" } };

// 실제 지연 모듈의 최초 변환을 기다려 저장 계약 검증을 컴파일 시간과 분리한다.
beforeAll(async () => { await import("./ProductionReviewSurface"); });
beforeEach(() => {
  vi.clearAllMocks();
  persistSession({ user: { id: "local-test-owner", name: "Test owner" }, token: null });
  useApp.setState({ userId: "local-test-owner" }); mocks.load.mockResolvedValue(project);
});
afterEach(() => { cleanup(); persistSession(null); useApp.setState({ userId: null }); });
function ReadyProjectPage() {
  const userId = useApp((state) => state.userId);
  return <SessionContext value={userId
    ? { data: { user: { id: userId, name: "Test owner" } }, ready: true, status: "authenticated", update: async () => null }
    : { data: null, ready: true, status: "unauthenticated", update: async () => null }}>
    <ProductionProjectPage surface="review" />
  </SessionContext>;
}
function mount() {
  return render(<MemoryRouter initialEntries={["/production/projects/actual-route-project/review"]}><Routes>
    <Route path="/production/projects/:projectId/review" element={<ReadyProjectPage />} />
  </Routes></MemoryRouter>);
}
it("실제 검수 페이지 연결에서 저장 실패는 초안을 삭제하지 않는다", async () => {
  mocks.save.mockRejectedValue(new Error("검수 저장 서버 오류"));
  mount();
  // 실제 라우트는 비동기 조회를 거친다. 질문 입력과 추가 버튼은 인계·배정·답변자까지
  // 준비된 뒤에만 열리므로, 비활성 상태로 클릭하면 저장이 아예 호출되지 않는다.
  const input = await screen.findByRole("textbox", { name: "검수 질문" });
  await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false));
  fireEvent.change(input, { target: { value: "서버 오류에도 남아야 하는 질문" } });
  const addQuestion = screen.getByRole("button", { name: "질문 추가" }) as HTMLButtonElement;
  await waitFor(() => expect(addQuestion.disabled).toBe(false));
  fireEvent.click(addQuestion);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("검수 저장 서버 오류"));
  expect((input as HTMLTextAreaElement).value).toBe("서버 오류에도 남아야 하는 질문");
  expect(screen.getByRole("button", { name: "최신 상태 확인" })).toBeTruthy();
});
it("계정 해제 시 실제 라우트의 비공개 원고·질문 화면을 제거한다", async () => {
  mount(); await screen.findByRole("textbox", { name: "검수 질문" });
  act(() => { persistSession(null); useApp.setState({ userId: null }); });
  await waitFor(() => expect(screen.queryByRole("textbox", { name: "검수 질문" })).toBeNull());
  expect(screen.getByRole("alert").textContent).toContain("로그인");
});
it("첫 조회 실패 뒤 페이지를 떠나지 않고 다시 불러와 복구한다", async () => {
  mocks.load.mockRejectedValueOnce(new Error("일시적인 프로젝트 조회 실패"));
  mount();
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  await screen.findByRole("textbox", { name: "검수 질문" });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(mocks.load).toHaveBeenCalledTimes(2);
});
