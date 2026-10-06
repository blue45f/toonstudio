// @vitest-environment jsdom
import { initialOperationPolicy, resolveOperationPolicy } from "@toonstudio/contracts/operation-policy";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FREE_USAGE_POLICY } from "@toonstudio/contracts/production-workspace";
import { TeamPeoplePage } from "./TeamPeoplePage";

const mocks = vi.hoisted(() => ({ userId: "owner" as string | null,
  list: vi.fn(), detail: vi.fn(), usage: vi.fn(), create: vi.fn(), command: vi.fn(), accept: vi.fn(), projects: vi.fn(), operation: vi.fn(), projectInvite: vi.fn() }));
vi.mock("@/shared/lib/store", () => ({ useApp: () => mocks.userId }));
vi.mock("@/platform/api", () => ({ getApiErrorMessage: async (_error: unknown, fallback: string) => fallback }));
vi.mock("./team-workspace-api", () => ({ getEffectiveOperationPolicy: mocks.operation, listTeamWorkspaces: mocks.list, getTeamWorkspace: mocks.detail,
  getTeamUsage: mocks.usage, createTeamWorkspace: mocks.create, commandTeamWorkspace: mocks.command, acceptTeamInvite: mocks.accept }));
vi.mock("./production-dashboard-api", () => ({ listProductionProjects: mocks.projects }));
vi.mock("../studio-team-client", () => ({ inviteStudioTeamMember: mocks.projectInvite }));
const workspace = { id: "team-a", name: "비공개 검수 팀", ownerUserId: "owner", role: "owner", revision: 3,
  createdAt: "2026-09-22T00:00:00Z", projectCount: 1, memberCount: 1, pendingInvites: 0 };
function App({ path = "/team/people" }: { path?: string }) {
  return <MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/team/people" element={<TeamPeoplePage />} />
    <Route path="/team/people/:workspaceId" element={<TeamPeoplePage />} />
    <Route path="/team/people/:workspaceId/usage" element={<TeamPeoplePage />} />
  </Routes></MemoryRouter>;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.userId = "owner"; sessionStorage.clear();
  mocks.operation.mockResolvedValue(resolveOperationPolicy({ revision: 0, draft: initialOperationPolicy(), updatedAt: "2026-09-22T00:00:00Z" }, null, new Date()));
  mocks.list.mockResolvedValue({ workspaces: [workspace] });
  mocks.detail.mockResolvedValue({ workspace, projects: [{ id: "project-a", workId: "work-a", title: "검수 원고" }],
    members: [{ userId: "owner", displayName: "소유자", role: "owner", joinedAt: workspace.createdAt }], invites: [] });
  mocks.usage.mockResolvedValue({ policy: FREE_USAGE_POLICY, workspaceId: workspace.id, operationMode: "free", policyRevision: 0,
    counters: { ownedWorkspaces: 1, projects: 1, members: 1, pendingInvites: 0 },
    originalStorage: { status: "not-instrumented", usedBytes: null }, externalAiEnabled: false,
    meteredProvidersEnabled: false, nextDailyResetAt: "2026-09-22T15:00:00Z" });
  mocks.projects.mockResolvedValue({ projects: [] });
});
afterEach(() => { cleanup(); sessionStorage.clear(); window.history.replaceState({}, "", "/"); });

describe("people & access surface (wave 5 T2)", () => {
  it("summarizes people across teams on the list first screen and links the next actions", async () => {
    mocks.list.mockResolvedValue({ workspaces: [
      workspace,
      { ...workspace, id: "team-b", name: "채색 팀", role: "member", memberCount: 3, pendingInvites: 2, projectCount: 2 },
    ] });
    render(<App />);
    await screen.findByRole("heading", { name: "사람 한눈에" });
    // 전체 구성원 1+3명, 대기 초대 0+2건이 개요에 합산된다.
    expect(screen.getByText("4명")).toBeTruthy();
    expect(screen.getByText("2건")).toBeTruthy();
    // 관리 중인 팀이 있으면 초대 카드로, 초대받은 사람은 합류 시트로 이어진다.
    expect(screen.getByRole("link", { name: "사람 초대하기" }).getAttribute("href")).toBe("/team/people/team-a#team-invite");
    expect(screen.getByRole("link", { name: "초대 코드로 참여" }).getAttribute("href")).toBe("/team/people/join");
    // 워크스페이스 카드에는 팀 이름 모노그램 타일이 붙는다.
    expect(screen.getByTitle("비공개 검수 팀")).toBeTruthy();
    expect(screen.getByTitle("채색 팀")).toBeTruthy();
  });

  it("puts members and invite ahead of linked projects on the detail first screen", async () => {
    render(<App path="/team/people/team-a" />);
    const membersHeading = await screen.findByRole("heading", { name: "구성원" });
    const inviteHeading = screen.getByRole("heading", { name: "구성원 초대" });
    const projectsHeading = screen.getByRole("heading", { name: "연결한 제작 프로젝트" });
    expect(membersHeading.compareDocumentPosition(projectsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(inviteHeading.compareDocumentPosition(projectsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 구성원 행에 이니셜 아바타가 붙고, 정체성 카드 바로가기가 초대 카드로 연결된다.
    expect(screen.getByTitle("소유자")).toBeTruthy();
    expect(screen.getByRole("link", { name: "사람 초대하기" }).getAttribute("href")).toBe("#team-invite");
    // 초대 발급의 종착점이 합류 시트임을 같은 카드에서 안내한다.
    expect(screen.getByRole("link", { name: "합류 시트 열기" }).getAttribute("href")).toBe("/team/people/join");
    expect(screen.getByText(/만든 초대 링크는 합류 시트로 연결됩니다/)).toBeTruthy();
  });

  it("leads with the usage card on the usage route", async () => {
    render(<App path="/team/people/team-a/usage" />);
    const usageHeading = await screen.findByRole("heading", { name: "사용량과 공통 이용 한도" });
    const membersHeading = screen.getByRole("heading", { name: "구성원" });
    expect(usageHeading.compareDocumentPosition(membersHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "사용량 확인" })).toHaveLength(1);
  });
});
