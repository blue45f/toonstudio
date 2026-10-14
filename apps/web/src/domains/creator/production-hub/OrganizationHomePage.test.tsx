// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrganizationHomePage } from "./OrganizationHomePage";

const mocks = vi.hoisted(() => ({
  userId: "owner" as string | null,
  listTeams: vi.fn(),
  listOrgs: vi.fn(),
  getOrg: vi.fn(),
  createOrg: vi.fn(),
  commandOrg: vi.fn(),
  previewOrg: vi.fn(),
  acceptOrg: vi.fn(),
}));
vi.mock("@/shared/lib/store", () => ({ useApp: () => mocks.userId }));
vi.mock("@/platform/api", () => ({ getApiErrorMessage: async (_error: unknown, fallback: string) => fallback }));
vi.mock("./team-workspace-api", () => ({ listTeamWorkspaces: mocks.listTeams }));
vi.mock("./organization-api", () => ({
  listOrganizations: mocks.listOrgs,
  getOrganization: mocks.getOrg,
  createOrganization: mocks.createOrg,
  commandOrganization: mocks.commandOrg,
  previewOrganizationInvite: mocks.previewOrg,
  acceptOrganizationInvite: mocks.acceptOrg,
}));

const teamA = {
  id: "team-a", name: "본편 제작팀", ownerUserId: "owner", role: "owner", revision: 1,
  createdAt: "2026-10-01T00:00:00Z", projectCount: 3, memberCount: 4, pendingInvites: 1,
};
const teamB = {
  id: "team-b", name: "외전 제작팀", ownerUserId: "owner", role: "member", revision: 1,
  createdAt: "2026-10-01T00:00:00Z", projectCount: 2, memberCount: 5, pendingInvites: 0,
};

interface FakeDetail {
  organization: Record<string, unknown> & { revision: number };
  members: Array<Record<string, unknown>>;
  invites: Array<Record<string, unknown>>;
  notices: Array<Record<string, unknown>>;
  linkedWorkspaceIds: string[];
}

function summary(overrides: Record<string, unknown> = {}): Record<string, unknown> & { revision: number } {
  return {
    id: "org-1", name: "희준 스튜디오", kind: "studio", description: "웹툰 제작",
    ownerUserId: "owner", revision: 0, role: "owner",
    createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
    memberCount: 2, pendingInvites: 1, linkedWorkspaceCount: 0,
    ...overrides,
  };
}

function detail(overrides: Partial<FakeDetail> = {}): FakeDetail {
  return {
    organization: summary(),
    members: [
      { userId: "owner", displayName: "희준", role: "owner", joinedAt: "2026-10-01T00:00:00Z" },
      { userId: "mate", displayName: "동료 작가", role: "member", joinedAt: "2026-10-02T00:00:00Z" },
    ],
    invites: [{ id: "inv-1", email: "new@example.com", role: "member", expiresAt: "2026-10-20T00:00:00Z" }],
    notices: [{ id: "n-1", body: "금주 휴재", authorName: "희준", createdAt: "2026-10-03T00:00:00Z" }],
    linkedWorkspaceIds: [],
    ...overrides,
  } as FakeDetail;
}

let serverDetail: FakeDetail;

function App() {
  return (
    <MemoryRouter initialEntries={["/team/organization"]}>
      <Routes>
        <Route path="/team/organization" element={<OrganizationHomePage />} />
        <Route path="/team/people" element={<p>people-destination</p>} />
        <Route path="/team" element={<p>team-destination</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = "owner";
  window.localStorage.clear();
  serverDetail = detail();
  mocks.listTeams.mockResolvedValue({ workspaces: [teamA, teamB] });
  mocks.listOrgs.mockImplementation(async () => ({ organizations: serverDetail ? [serverDetail.organization] : [] }));
  mocks.getOrg.mockImplementation(async () => serverDetail);
  mocks.commandOrg.mockImplementation(async (_id: string, _revision: number, command: { type: string; workspaceId?: string }) => {
    serverDetail.organization.revision += 1;
    if (command.type === "link-workspace" && command.workspaceId) serverDetail.linkedWorkspaceIds = [...serverDetail.linkedWorkspaceIds, command.workspaceId];
    if (command.type === "unlink-workspace" && command.workspaceId) serverDetail.linkedWorkspaceIds = serverDetail.linkedWorkspaceIds.filter((id) => id !== command.workspaceId);
    return { organizationId: "org-1", revision: serverDetail.organization.revision };
  });
});
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("organization home (server contract)", () => {
  it("does not fetch organization or team data when signed out", () => {
    mocks.userId = null;
    render(<App />);
    expect(screen.getByRole("heading", { name: "로그인하면 조직을 만들고 팀을 묶을 수 있어요" })).toBeTruthy();
    expect(mocks.listOrgs).not.toHaveBeenCalled();
    expect(mocks.listTeams).not.toHaveBeenCalled();
  });

  it("renders the server organization with members, invites and notices", async () => {
    render(<App />);
    expect(await screen.findByText("희준 스튜디오")).toBeTruthy();
    // 구성원 목록은 서버 상세 응답에서 온다 — 로컬 모델에는 없던 데이터다.
    expect(screen.getByText("동료 작가")).toBeTruthy();
    expect(screen.getByText(/new@example\.com/)).toBeTruthy();
    expect(screen.getByText("금주 휴재")).toBeTruthy();
    // 조직 상태는 더 이상 이 기기 localStorage에 저장되지 않는다.
    expect(window.localStorage.length).toBe(0);
  });

  it("creates an organization through the server and links a team by command", async () => {
    serverDetail = detail({ organization: summary({ name: "새 스튜디오" }) });
    mocks.listOrgs.mockResolvedValue({ organizations: [] });
    mocks.createOrg.mockImplementation(async (input: { name: string }) => {
      mocks.listOrgs.mockResolvedValue({ organizations: [serverDetail.organization] });
      expect(input.name).toBe("새 스튜디오");
      return { organizationId: "org-1", revision: 0 };
    });
    render(<App />);

    fireEvent.change(await screen.findByLabelText("조직 이름"), { target: { value: "새 스튜디오" } });
    fireEvent.click(screen.getByRole("button", { name: "조직 만들기" }));
    await screen.findByText("본편 제작팀");
    expect(mocks.createOrg).toHaveBeenCalledTimes(1);

    const linkButtons = screen.getAllByRole("button", { name: "조직에 연결" });
    fireEvent.click(linkButtons[0]!);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "연결 해제" })).toBeTruthy();
    });
    expect(mocks.commandOrg).toHaveBeenCalledWith("org-1", 0, { type: "link-workspace", workspaceId: "team-a" });
    // 팀 A만 연결했으므로 작품 3 · 구성원 4 · 대기 초대 1이 합산된다.
    expect(screen.getByText("연결한 팀")).toBeTruthy();
  });

  it("gates surfaces by the server-reported role: a member sees no edit, invite or notice form", async () => {
    serverDetail = detail({ organization: summary({ role: "member", ownerUserId: "someone-else" }) });
    mocks.listOrgs.mockResolvedValue({ organizations: [serverDetail.organization] });
    render(<App />);
    expect(await screen.findByText("동료 작가")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "프로필 편집" })).toBeNull();
    expect(screen.queryByRole("button", { name: "초대 만들기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "공지 등록" })).toBeNull();
    // 현황과 공지 열람은 구성원에게도 열린다.
    expect(screen.getByText("조직 현황")).toBeTruthy();
    expect(screen.getByText("금주 휴재")).toBeTruthy();
  });

  it("shows a guest only the public profile", async () => {
    serverDetail = detail({
      organization: summary({ role: "guest", ownerUserId: "someone-else", linkedWorkspaceCount: 0 }),
      members: [], invites: [], notices: [], linkedWorkspaceIds: [],
    });
    mocks.listOrgs.mockResolvedValue({ organizations: [serverDetail.organization] });
    render(<App />);
    expect(await screen.findByText("희준 스튜디오")).toBeTruthy();
    expect(screen.queryByText("조직 구성원")).toBeNull();
    expect(screen.queryByText("금주 휴재")).toBeNull();
    expect(screen.queryByText("조직 현황")).toBeNull();
  });

  it("previews and accepts an invite by token", async () => {
    const token = "t".repeat(43);
    mocks.previewOrg.mockResolvedValue({
      organizationId: "org-9", organizationName: "초대받은 스튜디오", kind: "company", role: "manager",
      inviterName: "대표", expiresAt: "2026-10-20T00:00:00Z", alreadyAccepted: false, alreadyMember: false,
    });
    mocks.acceptOrg.mockResolvedValue({ organizationId: "org-9", revision: 1 });
    render(<App />);
    fireEvent.change(await screen.findByLabelText("초대 토큰"), { target: { value: token } });
    fireEvent.click(screen.getByRole("button", { name: "초대 확인" }));
    expect(await screen.findByText("초대받은 스튜디오")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "초대 수락하고 합류" }));
    await waitFor(() => { expect(mocks.acceptOrg).toHaveBeenCalledWith(token); });
  });

  it("shows an error with retry when loading fails", async () => {
    mocks.listOrgs.mockRejectedValueOnce(new Error("network"));
    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("조직 정보를 불러오지 못했습니다.");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("states plainly that organization membership grants no manuscript access", async () => {
    render(<App />);
    expect(await screen.findByText(/조직에 소속돼도 원고 접근 권한은 생기지 않습니다/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "서버 계약이 필요한 조직 기능" })).toBeTruthy();
  });
});
