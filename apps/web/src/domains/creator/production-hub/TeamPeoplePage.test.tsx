// @vitest-environment jsdom
import { initialOperationPolicy, resolveOperationPolicy } from "@toonstudio/contracts/operation-policy";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FREE_USAGE_POLICY } from "@toonstudio/contracts/production-workspace";
import { SessionContext } from "@/domains/auth/public/session/auth-session-store";
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

describe("people & access surface (wave 6 T1)", () => {
  it("shows the team scene art on all three people routes", async () => {
    for (const path of ["/team/people", "/team/people/team-a", "/team/people/team-a/usage"]) {
      const view = render(<App path={path} />);
      const banner = screen.getByTestId("team-scene-art");
      expect(banner.querySelector("img")?.getAttribute("src")).toBe("/assets/production-workspace/creator-workspace.webp");
      await screen.findByRole("heading", { name: "사람·권한 관리" });
      view.unmount();
    }
  });

  it("shows an overview skeleton shaped like the strip while the list is loading", async () => {
    let resolveList!: (value: unknown) => void;
    mocks.list.mockImplementation(() => new Promise((resolve) => { resolveList = resolve; }));
    render(<App />);
    expect(screen.getByTestId("team-people-overview-skeleton")).toBeTruthy();
    expect(screen.getAllByTestId("workspace-list-skeleton-card")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "사람 한눈에" })).toBeNull();
    resolveList({ workspaces: [workspace] });
    await screen.findByRole("heading", { name: "사람 한눈에" });
    expect(screen.queryByTestId("team-people-overview-skeleton")).toBeNull();
  });

  it("renders a real empty state with next actions, not an error, when there are no teams", async () => {
    mocks.list.mockResolvedValue({ workspaces: [] });
    render(<App />);
    const empty = await screen.findByTestId("team-people-empty");
    expect(empty.textContent).toContain("아직 참여한 팀이 없습니다");
    expect(empty.querySelector("img")?.getAttribute("src")).toBe("/assets/production-workspace/creator-workspace.webp");
    expect(screen.getByRole("link", { name: "새 팀 만들기" }).getAttribute("href")).toBe("#team-create-workspace");
    expect(screen.getByRole("link", { name: "초대 코드로 참여" }).getAttribute("href")).toBe("/team/people/join");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("leads the usage route loading state with a usage-shaped skeleton", async () => {
    let resolveDetail!: (value: unknown) => void;
    mocks.detail.mockImplementation(() => new Promise((resolve) => { resolveDetail = resolve; }));
    render(<App path="/team/people/team-a/usage" />);
    await waitFor(() => expect(screen.getByTestId("workspace-usage-skeleton")).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "사용량과 공통 이용 한도" })).toBeNull();
    resolveDetail({ workspace, projects: [{ id: "project-a", workId: "work-a", title: "검수 원고" }],
      members: [{ userId: "owner", displayName: "소유자", role: "owner", joinedAt: workspace.createdAt }], invites: [] });
    await screen.findByRole("heading", { name: "사용량과 공통 이용 한도" });
    expect(screen.queryByTestId("workspace-usage-skeleton")).toBeNull();
  });

  it("shows an empty state for pending invites instead of a blank list", async () => {
    render(<App path="/team/people/team-a" />);
    const empty = await screen.findByTestId("team-invites-empty");
    expect(empty.textContent).toContain("아직 대기 중인 초대가 없어요");
  });

  it("uses the signed-in member's real profile photo and keeps monograms for members without one", async () => {
    mocks.detail.mockResolvedValue({ workspace, projects: [{ id: "project-a", workId: "work-a", title: "검수 원고" }],
      members: [
        { userId: "owner", displayName: "소유자", role: "owner", joinedAt: workspace.createdAt },
        { userId: "member-b", displayName: "채색 담당", role: "member", joinedAt: workspace.createdAt },
      ], invites: [] });
    render(
      <SessionContext.Provider value={{ data: { user: { id: "owner", name: "소유자", image: "https://images.example/me.webp" } }, ready: true, status: "authenticated", update: async () => null }}>
        <App path="/team/people/team-a" />
      </SessionContext.Provider>,
    );
    await screen.findByRole("heading", { name: "구성원" });
    const selfAvatar = screen.getByTitle("소유자");
    expect(selfAvatar.getAttribute("data-avatar-kind")).toBe("photo");
    expect(selfAvatar.querySelector("img")?.getAttribute("src")).toBe("https://images.example/me.webp");
    const otherAvatar = screen.getByTitle("채색 담당");
    expect(otherAvatar.getAttribute("data-avatar-kind")).toBe("monogram");
    expect(otherAvatar.querySelector("img")).toBeNull();
  });

  it("falls back to the monogram when the profile photo fails to load", async () => {
    render(
      <SessionContext.Provider value={{ data: { user: { id: "owner", name: "소유자", image: "https://images.example/broken.webp" } }, ready: true, status: "authenticated", update: async () => null }}>
        <App path="/team/people/team-a" />
      </SessionContext.Provider>,
    );
    await screen.findByRole("heading", { name: "구성원" });
    const avatar = screen.getByTitle("소유자");
    const img = avatar.querySelector("img");
    expect(img).toBeTruthy();
    fireEvent.error(img as HTMLImageElement);
    expect(avatar.getAttribute("data-avatar-kind")).toBe("monogram");
    expect(avatar.querySelector("img")).toBeNull();
  });
});
