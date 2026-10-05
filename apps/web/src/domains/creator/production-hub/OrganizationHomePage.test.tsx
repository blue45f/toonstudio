// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrganizationHomePage } from "./OrganizationHomePage";
import { organizationStorageKey } from "./organization-model";

const mocks = vi.hoisted(() => ({ userId: "owner" as string | null, list: vi.fn() }));
vi.mock("@/shared/lib/store", () => ({ useApp: () => mocks.userId }));
vi.mock("@/platform/api", () => ({ getApiErrorMessage: async (_error: unknown, fallback: string) => fallback }));
vi.mock("./team-workspace-api", () => ({ listTeamWorkspaces: mocks.list }));

const teamA = {
  id: "team-a", name: "본편 제작팀", ownerUserId: "owner", role: "owner", revision: 1,
  createdAt: "2026-10-01T00:00:00Z", projectCount: 3, memberCount: 4, pendingInvites: 1,
};
const teamB = {
  id: "team-b", name: "외전 제작팀", ownerUserId: "owner", role: "member", revision: 1,
  createdAt: "2026-10-01T00:00:00Z", projectCount: 2, memberCount: 5, pendingInvites: 0,
};

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
  mocks.list.mockResolvedValue({ workspaces: [teamA, teamB] });
});
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("organization home", () => {
  it("does not fetch team data when signed out", () => {
    mocks.userId = null;
    render(<App />);
    expect(screen.getByRole("heading", { name: "로그인하면 조직을 만들고 팀을 묶을 수 있어요" })).toBeTruthy();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("creates an organization locally, links a team, and rolls up server counters", async () => {
    render(<App />);
    await screen.findByText("본편 제작팀");

    fireEvent.change(screen.getByLabelText("조직 이름"), { target: { value: "희준 스튜디오" } });
    fireEvent.click(screen.getByRole("button", { name: "조직 만들기" }));
    await screen.findByRole("status");

    // 프로필이 소유자 스코프 키로 저장됐는지 확인한다.
    const saved = window.localStorage.getItem(organizationStorageKey("owner"));
    expect(saved).toContain("희준 스튜디오");

    // 연결 전에는 롤업이 0이다.
    expect(screen.getByText("연결한 팀")).toBeTruthy();

    const linkButtons = screen.getAllByRole("button", { name: "조직에 연결" });
    fireEvent.click(linkButtons[0]!);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "연결 해제" })).toBeTruthy();
    });
    // 팀 A만 연결했으므로 작품 3 · 구성원 4 · 대기 초대 1이 합산된다.
    const savedAfterLink = window.localStorage.getItem(organizationStorageKey("owner"));
    expect(savedAfterLink).toContain("team-a");
    expect(savedAfterLink).not.toContain("team-b");
  });

  it("shows an error with retry when the team list fails", async () => {
    mocks.list.mockRejectedValueOnce(new Error("network"));
    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("팀 목록을 불러오지 못했습니다.");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("states plainly that organization membership grants no manuscript access", async () => {
    render(<App />);
    await screen.findByText("본편 제작팀");
    expect(screen.getByText(/조직에 소속돼도 원고 접근 권한은 생기지 않습니다/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "서버 계약이 필요한 조직 기능" })).toBeTruthy();
  });
});
