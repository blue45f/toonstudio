// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamWorkspaceJoinPage } from "./TeamWorkspaceJoinPage";

const mocks = vi.hoisted(() => ({ userId: "member" as string | null, accept: vi.fn() }));
vi.mock("@/shared/lib/store", () => ({ useApp: () => mocks.userId }));
vi.mock("@/platform/api", () => ({ getApiErrorMessage: async (_error: unknown, fallback: string) => fallback }));
vi.mock("./team-workspace-api", () => ({ acceptTeamInvite: mocks.accept }));

const TOKEN = "c".repeat(43);
function App() {
  return <MemoryRouter initialEntries={["/team/people/join"]}><Routes>
    <Route path="/team/people/join" element={<TeamWorkspaceJoinPage />} />
    <Route path="/production/workspaces/join" element={<TeamWorkspaceJoinPage />} />
    <Route path="/team" element={<p>team-lobby-destination</p>} />
    <Route path="/studio/p/:projectId/space" element={<p>project-space-destination</p>} />
    <Route path="/team/recruiting" element={<p>interview-waiting-destination</p>} />
  </Routes></MemoryRouter>;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.userId = "member";
  mocks.accept.mockResolvedValue({ workspaceId: "team-a", revision: 4 });
});
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });

describe("team join sheet", () => {
  it("prefills the code from an invite-link fragment, announces it, and strips the secret from the URL", async () => {
    window.history.replaceState({}, "", `/team/people/join#invite=${TOKEN}&entry=team-lobby`);
    render(<App />);
    expect(screen.getByRole("heading", { name: "팀 합류" })).toBeTruthy();
    await screen.findByText(/초대 링크를 확인했어요/);
    expect((screen.getByLabelText("초대 코드") as HTMLInputElement).value).toBe(TOKEN);
    expect(window.location.hash).toBe("");
    // 수락 전에 어디로 입장하는지가 같은 화면에 보인다.
    expect(screen.getByText(/내 팀 공간\(협업 홈\)으로 입장해요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "초대 수락하기" }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith(TOKEN));
    await screen.findByText("team-lobby-destination");
  });

  it("accepts the legacy ?token= invite links issued by the virtual-studio team hub", async () => {
    window.history.replaceState({}, "", `/production/workspaces/join?token=${TOKEN}`);
    render(<App />);
    await waitFor(() => expect((screen.getByLabelText("초대 코드") as HTMLInputElement).value).toBe(TOKEN));
    // 비밀 쿼리는 읽는 즉시 주소창에서 지워진다.
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "초대 수락하기" }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith(TOKEN));
    await screen.findByText("team-lobby-destination");
  });

  it("shows the project-space landing for project invite fragments and lands there after accepting", async () => {
    window.history.replaceState({}, "", `/team/people/join#invite=${TOKEN}&entry=project-space&project=work-a`);
    render(<App />);
    await screen.findByText(/초대받은 작품의 협업 공간으로 입장해요/);
    fireEvent.click(screen.getByRole("button", { name: "초대 수락하기" }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith(TOKEN));
    await screen.findByText("project-space-destination");
  });

  it("shows the interview waiting-room landing for interview invite fragments", async () => {
    window.history.replaceState({}, "", `/team/people/join#invite=${TOKEN}&entry=interview-waiting`);
    render(<App />);
    await screen.findByText(/면접·협업 대기실로 입장해요/);
    fireEvent.click(screen.getByRole("button", { name: "초대 수락하기" }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith(TOKEN));
    await screen.findByText("interview-waiting-destination");
  });

  it("explains the granted permissions before accepting and routes people without an invite to discovery", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "합류하면 받는 권한" })).toBeTruthy();
    expect(screen.getByText(/팀 소속만으로 비공개 원고가 열리지는 않아요/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /모집 자리 찾기/ }).getAttribute("href")).toBe("/collaborate/positions");
    expect(screen.getByRole("link", { name: /구인·의뢰 게시판/ }).getAttribute("href")).toBe("/collaborate");
    expect(screen.getByRole("link", { name: /내 팀·사람 권한/ }).getAttribute("href")).toBe("/team/people");
    expect((screen.getByRole("button", { name: "초대 수락하기" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the accept button disabled while signed out even with a valid code", async () => {
    mocks.userId = null;
    window.history.replaceState({}, "", `/team/people/join#invite=${TOKEN}`);
    render(<App />);
    await screen.findByText(/로그인하면 입력된 코드로 바로 수락할 수 있어요/);
    expect((screen.getByRole("button", { name: "초대 수락하기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("surfaces accept errors in an alert and keeps the code for a retry", async () => {
    mocks.accept.mockRejectedValue(new Error("expired"));
    window.history.replaceState({}, "", `/team/people/join#invite=${TOKEN}`);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "초대 수락하기" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("초대를 수락하지 못했습니다.");
    expect((screen.getByLabelText("초대 코드") as HTMLInputElement).value).toBe(TOKEN);
  });
});
