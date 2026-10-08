// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FREE_USAGE_POLICY } from "@toonstudio/contracts/production-workspace";
import { TeamWorkspaceUsagePage } from "./TeamWorkspaceUsagePage";

const mocks = vi.hoisted(() => ({ userId: "creator" as string | null, detail: vi.fn(), usage: vi.fn() }));
vi.mock("@/shared/lib/store", () => ({ useApp: () => mocks.userId }));
vi.mock("@/platform/api", () => ({
  getApiErrorMessage: async (_error: unknown, fallback: string) => fallback,
  httpStatus: (error: unknown) => (error as { status?: number } | null)?.status ?? null,
}));
vi.mock("./team-workspace-api", () => ({ getTeamWorkspace: mocks.detail, getTeamUsage: mocks.usage }));

const workspace = { id: "qa-team-ws-1", name: "QA 제작팀", ownerUserId: "creator", role: "owner", revision: 1,
  createdAt: "2026-10-07T00:00:00Z", projectCount: 1, memberCount: 3, pendingInvites: 0 };
const detail = { workspace, projects: [{ id: "qa-project-1", workId: "work-1", title: "한밤의 편의점" }],
  members: [{ userId: "creator", displayName: "데모 창작자", role: "owner", joinedAt: workspace.createdAt }], invites: [] };
const usage = { policy: FREE_USAGE_POLICY, workspaceId: workspace.id, operationMode: "free", policyRevision: 3,
  counters: { ownedWorkspaces: 1, projects: 1, members: 3, pendingInvites: 0 },
  originalStorage: { status: "not-instrumented", usedBytes: null }, externalAiEnabled: false,
  meteredProvidersEnabled: false, nextDailyResetAt: "2026-10-07T15:00:00.000Z" };
const httpError = (status: number): Error => Object.assign(new Error(`http ${status}`), { status });

function App({ path }: { path: string }) {
  // 사용량 화면의 실사용 마운트는 정식 /team/people 패밀리뿐이다. 옛 /production/workspaces
  // 주소는 라우트 층에서 이쪽으로 리다이렉트되며, 그 계약은 production-workspace-redirect.test.tsx가 고정한다.
  return <MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/team/people/:workspaceId/usage" element={<TeamWorkspaceUsagePage />} />
  </Routes></MemoryRouter>;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.userId = "creator";
  mocks.detail.mockResolvedValue(detail);
  mocks.usage.mockResolvedValue(usage);
});
afterEach(() => { cleanup(); });

describe("workspace usage screen (F-R1-B08-1)", () => {
  it("renders counters against policy limits on the team usage route", async () => {
    render(<App path="/team/people/qa-team-ws-1/usage" />);
    expect(await screen.findByRole("heading", { name: "QA 제작팀 사용량" })).toBeTruthy();
    expect(mocks.usage).toHaveBeenCalledWith("qa-team-ws-1");
    // 카운터→한도 매핑: 작품 1/5, 구성원+대기 초대 3/10, 소유 워크스페이스 1/2.
    const projectsBar = screen.getByRole("progressbar", { name: "연결한 작품" });
    expect(projectsBar.getAttribute("aria-valuenow")).toBe("20");
    expect(screen.getByText("1 / 5 · 20%")).toBeTruthy();
    expect(screen.getByText(/구성원 3명 · 대기 초대 0건/)).toBeTruthy();
    expect(screen.getByText("3 / 10 · 30%")).toBeTruthy();
    expect(screen.getByText("1 / 2 · 50%")).toBeTruthy();
    // 정책 한도와 정직한 미측정 표기, 정책 식별자.
    expect(screen.getByText(/워크스페이스당 2GB · 소유자 전체 4GB/)).toBeTruthy();
    expect(screen.getByText(/측정하지 않은 사용량을 0으로 표시하지 않습니다/)).toBeTruthy();
    expect(screen.getByText(/free-operations-v1\.1 · revision 3/)).toBeTruthy();
    expect(screen.getByText(/다음 초기화/)).toBeTruthy();
    // 전용 화면이므로 상세의 구성원 관리·초대 UI는 없어야 한다.
    expect(screen.queryByRole("heading", { name: "구성원" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "구성원 초대" })).toBeNull();
    expect(screen.getByRole("link", { name: "워크스페이스 상세" }).getAttribute("href")).toBe("/team/people/qa-team-ws-1");
  });

  it("shows zero counters as a normal empty state, not an error", async () => {
    mocks.usage.mockResolvedValue({ ...usage, counters: { ownedWorkspaces: 1, projects: 0, members: 1, pendingInvites: 0 } });
    render(<App path="/team/people/qa-team-ws-1/usage" />);
    expect(await screen.findByText("0 / 5 · 0%")).toBeTruthy();
    expect(screen.getByText(/아직 연결한 작품이 없어요/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a usage-shaped skeleton while loading, then the gauges", async () => {
    let resolveDetail!: (value: unknown) => void;
    mocks.detail.mockImplementation(() => new Promise((resolve) => { resolveDetail = resolve; }));
    render(<App path="/team/people/qa-team-ws-1/usage" />);
    await waitFor(() => expect(screen.getByTestId("workspace-usage-page-skeleton")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("사용량을 불러오는 중입니다.");
    resolveDetail(detail);
    await screen.findByRole("heading", { name: "현재 사용량" });
    expect(screen.queryByTestId("workspace-usage-page-skeleton")).toBeNull();
  });

  it("shows the admin-only notice to a non-manager member, matching the API 403", async () => {
    mocks.detail.mockResolvedValue({ ...detail, workspace: { ...workspace, role: "member" } });
    mocks.usage.mockRejectedValue(httpError(403));
    render(<App path="/team/people/qa-team-ws-1/usage" />);
    expect(await screen.findByRole("heading", { name: "사용량은 관리자만 확인할 수 있어요" })).toBeTruthy();
    expect(screen.getByText(/현재 내 역할은 구성원입니다/)).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the no-access notice to a non-member, matching the API 404", async () => {
    mocks.detail.mockRejectedValue(httpError(404));
    render(<App path="/team/people/qa-team-ws-1/usage" />);
    expect(await screen.findByRole("heading", { name: "접근할 수 있는 워크스페이스가 없어요" })).toBeTruthy();
    expect(mocks.usage).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "전체 팀 보기" }).getAttribute("href")).toBe("/team/people");
  });

  it("offers a retry on load failure and recovers", async () => {
    mocks.usage.mockRejectedValueOnce(httpError(500)).mockResolvedValue(usage);
    render(<App path="/team/people/qa-team-ws-1/usage" />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("사용량을 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "현재 사용량" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks guests to sign in without calling the API", async () => {
    mocks.userId = null;
    render(<App path="/team/people/qa-team-ws-1/usage" />);
    expect(await screen.findByRole("heading", { name: "로그인하면 사용량을 확인할 수 있어요" })).toBeTruthy();
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("shows the shared team scene art band above the header", async () => {
    render(<App path="/team/people/qa-team-ws-1/usage" />);
    const heading = await screen.findByRole("heading", { name: "QA 제작팀 사용량" });
    const banner = screen.getByTestId("team-scene-art");
    // 사람·권한 화면과 같은 자산·캡션의 장면 띠가 헤더보다 먼저 온다.
    expect(banner.querySelector("img")?.getAttribute("src")).toBe("/assets/production-workspace/creator-workspace.webp");
    expect(banner.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(banner.textContent).toContain("함께 만드는 작업실");
    expect(banner.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the scene art band while usage is loading", async () => {
    let resolveDetail!: (value: unknown) => void;
    mocks.detail.mockImplementation(() => new Promise((resolve) => { resolveDetail = resolve; }));
    render(<App path="/team/people/qa-team-ws-1/usage" />);
    await waitFor(() => expect(screen.getByTestId("workspace-usage-page-skeleton")).toBeTruthy());
    expect(screen.getByTestId("team-scene-art")).toBeTruthy();
    resolveDetail(detail);
    await screen.findByRole("heading", { name: "현재 사용량" });
    expect(screen.getByTestId("team-scene-art")).toBeTruthy();
  });

  it("keeps the scene art band for signed-out guests", async () => {
    mocks.userId = null;
    render(<App path="/team/people/qa-team-ws-1/usage" />);
    expect(await screen.findByRole("heading", { name: "로그인하면 사용량을 확인할 수 있어요" })).toBeTruthy();
    expect(screen.getByTestId("team-scene-art")).toBeTruthy();
  });
});
