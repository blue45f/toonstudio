// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamWorkspaceJoinPage } from "./TeamWorkspaceJoinPage";

const mocks = vi.hoisted(() => ({ userId: "member" as string | null, accept: vi.fn(), preview: vi.fn() }));
vi.mock("@/shared/lib/store", () => ({ useApp: () => mocks.userId }));
vi.mock("@/platform/api", () => ({ getApiErrorMessage: async (_error: unknown, fallback: string) => fallback }));
vi.mock("./team-workspace-api", () => ({ acceptTeamInvite: mocks.accept, previewTeamInvite: mocks.preview }));

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
  mocks.preview.mockResolvedValue({
    workspaceId: "team-a", workspaceName: "달빛 스튜디오", role: "member",
    inviterName: "초대한 사람", expiresAt: "2027-01-01T00:00:00.000Z",
    alreadyAccepted: false, alreadyMember: false,
  });
});
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); window.sessionStorage.clear(); window.localStorage.clear(); });
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });

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

  it("previews the workspace name and granted role before accepting", async () => {
    window.history.replaceState({}, "", `/team/people/join#invite=${TOKEN}&entry=team-lobby`);
    render(<App />);
    expect(await screen.findByText(/달빛 스튜디오 팀에 구성원 역할로 초대받았어요/)).toBeTruthy();
    expect(screen.getByText(/초대한 사람님이 보낸 초대예요/)).toBeTruthy();
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith(TOKEN));
    // 미리보기는 읽기 전용이라 수락은 여전히 명시적 행동으로 남아 있다.
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("guides members who reopen an invite link straight to the team space", async () => {
    mocks.preview.mockResolvedValue({
      workspaceId: "team-a", workspaceName: "달빛 스튜디오", role: "member",
      inviterName: "초대한 사람", expiresAt: "2027-01-01T00:00:00.000Z",
      alreadyAccepted: true, alreadyMember: true,
    });
    window.history.replaceState({}, "", `/team/people/join#invite=${TOKEN}&entry=team-lobby`);
    render(<App />);
    expect(await screen.findByText(/이미 달빛 스튜디오 팀에 합류해 있어요/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "팀 공간으로 이동" }).getAttribute("href")).toBe("/team?workspace=team-a&lobby=1");
  });

  it("shows the onboarding package carried by the invite fragment before accepting", async () => {
    window.history.replaceState({}, "", `/team/people/join#invite=${TOKEN}&entry=team-lobby&pkg=invite-line-art`);
    render(<App />);
    // 패키지는 수락 전 열람용이다 — 역할 규칙·참조 컷·일정 규칙이 같은 화면에 보인다.
    expect(await screen.findByTestId("onboarding-package-panel")).toBeTruthy();
    expect(screen.getByText(/온보딩 패키지 · 선화 작가/)).toBeTruthy();
    expect(screen.getByText(/대표 선화 컷 3장/)).toBeTruthy();
    expect(screen.getByText(/첫 컷은 전체 마감보다 먼저 확인받습니다/)).toBeTruthy();
    // 패키지가 보여도 수락 자체는 여전히 명시적 행동이다.
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("hides the onboarding package for an unknown package hint", async () => {
    window.history.replaceState({}, "", `/team/people/join#invite=${TOKEN}&entry=team-lobby&pkg=invite-nope`);
    render(<App />);
    await screen.findByText(/초대 링크를 확인했어요/);
    expect(screen.queryByTestId("onboarding-package-panel")).toBeNull();
  });

  it("keeps accepting available when the preview cannot be opened", async () => {
    mocks.preview.mockRejectedValue(new Error("not-found"));
    window.history.replaceState({}, "", `/team/people/join#invite=${TOKEN}`);
    render(<App />);
    expect(await screen.findByText(/이 코드는 미리보기를 열 수 없어요/)).toBeTruthy();
    const button = screen.getByRole("button", { name: "초대 수락하기" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith(TOKEN));
  });

  it("keeps a completed code in tab-session storage only — never localStorage or the URL", async () => {
    window.history.replaceState({}, "", `/team/people/join#invite=${TOKEN}&entry=team-lobby`);
    render(<App />);
    await screen.findByText(/초대 링크를 확인했어요/);
    await waitFor(() => expect(window.sessionStorage.getItem("toonspectrum:pending-team-invite:v1")).toContain(TOKEN));
    expect(window.localStorage.getItem("toonspectrum:pending-team-invite:v1")).toBeNull();
    expect(window.location.href).not.toContain(TOKEN);
  });

  it("restores the code after leaving and returning to the sheet in the same tab", async () => {
    window.sessionStorage.setItem("toonspectrum:pending-team-invite:v1", JSON.stringify({
      v: 1, token: TOKEN, context: { kind: "project-space", projectId: "work-a" }, savedAt: Date.now(),
    }));
    render(<App />);
    expect(await screen.findByText(/떠나기 전에 입력한 초대 코드를 복원했어요/)).toBeTruthy();
    expect((screen.getByLabelText("초대 코드") as HTMLInputElement).value).toBe(TOKEN);
    // 복원된 착지 안내도 원래 입장 맥락을 따른다.
    expect(screen.getByText(/초대받은 작품의 협업 공간으로 입장해요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "초대 수락하기" }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith(TOKEN));
    await screen.findByText("project-space-destination");
    // 수락이 끝나면 임시 보관분도 함께 지워진다.
    expect(window.sessionStorage.getItem("toonspectrum:pending-team-invite:v1")).toBeNull();
  });

  it("prefers a fresh invite link over a stored code and lets the user discard a restored code", async () => {
    const stored = "d".repeat(43);
    window.sessionStorage.setItem("toonspectrum:pending-team-invite:v1", JSON.stringify({
      v: 1, token: stored, context: { kind: "team-lobby" }, savedAt: Date.now(),
    }));
    window.history.replaceState({}, "", `/team/people/join#invite=${TOKEN}`);
    render(<App />);
    await screen.findByText(/초대 링크를 확인했어요/);
    expect((screen.getByLabelText("초대 코드") as HTMLInputElement).value).toBe(TOKEN);
    expect(screen.queryByText(/복원했어요/)).toBeNull();
    cleanup();
    window.sessionStorage.setItem("toonspectrum:pending-team-invite:v1", JSON.stringify({
      v: 1, token: stored, context: { kind: "team-lobby" }, savedAt: Date.now(),
    }));
    window.history.replaceState({}, "", "/team/people/join");
    render(<App />);
    expect(await screen.findByText(/떠나기 전에 입력한 초대 코드를 복원했어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "코드 지우기" }));
    expect((screen.getByLabelText("초대 코드") as HTMLInputElement).value).toBe("");
    expect(window.sessionStorage.getItem("toonspectrum:pending-team-invite:v1")).toBeNull();
  });

  it("reassures signed-out users that leaving for email verification keeps the code", async () => {
    mocks.userId = null;
    window.history.replaceState({}, "", `/team/people/join#invite=${TOKEN}`);
    render(<App />);
    expect(await screen.findByText(/이메일 인증을 확인하러 이 화면을 떠나도 괜찮아요/)).toBeTruthy();
    expect(screen.getByText(/탭을 닫으면 사라지고 주소창이나 기기에 저장되지 않아요/)).toBeTruthy();
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
