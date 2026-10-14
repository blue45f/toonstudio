// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorAdaptiveOnboardingGate } from "./CreatorAdaptiveOnboardingGate";

import { EMPTY_CREATOR_ROLE_PROFILE, normalizeCreatorRoleProfile } from "@/shared/lib/creator-role-contract";
import { hasAcknowledgedCreatorOnboarding } from "@/shared/lib/creator-adaptive-onboarding-policy";
import { normalizeCreatorRoleWorkspacePreference } from "@/shared/lib/creator-role-workspace-contract";
import { useI18n } from "@/shared/lib/i18n";

const mocks = vi.hoisted(() => ({
  getMyProfile: vi.fn(), updateMyProfile: vi.fn(), saveWorkspace: vi.fn(), useWorkspace: vi.fn(),
  userId: "creator-1", authenticated: true,
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({
    status: mocks.authenticated ? "authenticated" : "unauthenticated",
    data: mocks.authenticated ? { user: { id: mocks.userId } } : null,
  }),
}));
vi.mock("@/platform/me-client", () => ({
  getMyProfile: mocks.getMyProfile, updateMyProfile: mocks.updateMyProfile,
}));
vi.mock("@/shared/lib/use-creator-role-workspace", () => ({ useCreatorRoleWorkspace: mocks.useWorkspace }));

const emptyProfile = {
  id: "creator-1", name: "테스트 작가", image: null, avatar: null,
  email: "creator@example.com", bio: null, regionSettings: null,
  creatorRoleProfile: normalizeCreatorRoleProfile(EMPTY_CREATOR_ROLE_PROFILE),
};
let sequence = 0;
function LocationProbe() {
  const { pathname } = useLocation();
  return <output data-testid="gate-location">{pathname}</output>;
}
function gateUi(path = "/studio", enabled = true) {
  return <MemoryRouter initialEntries={[path]}><CreatorAdaptiveOnboardingGate enabled={enabled} /><LocationProbe /></MemoryRouter>;
}
function workspaceState(status = "ready", onboardingComplete = false) {
  return {
    projectKey: "global", status,
    snapshot: {
      projectKey: "global", revision: 0,
      document: normalizeCreatorRoleWorkspacePreference({ onboardingComplete }),
      updatedAt: null, source: "server",
    },
    error: null, save: mocks.saveWorkspace, reload: vi.fn(),
  };
}
async function fillWorkspace() {
  await screen.findByRole("heading", { name: "나에게 맞는 작업 환경 만들기" });
  fireEvent.click(screen.getByRole("button", { name: /팀 · 스튜디오/ }));
  fireEvent.click(screen.getByRole("button", { name: /현업 · 전문/ }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: /글작가/ }));
  fireEvent.click(screen.getByRole("button", { name: /어시스턴트/ }));
  fireEvent.change(screen.getByLabelText("대표 역할"), { target: { value: "story" } });
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "스토리·대본 집필" }));
  // 목적과 작업 방식이 한 단계로 합쳐져 같은 화면에서 이어서 고른다.
  fireEvent.click(screen.getByRole("button", { name: /함께 작업해요/ }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: /Production/ }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mocks.userId = `creator-gate-${++sequence}`;
  mocks.authenticated = true;
  useI18n.setState({ lang: "ko" });
  mocks.getMyProfile.mockImplementation(async () => ({ ...emptyProfile, id: mocks.userId }));
  mocks.updateMyProfile.mockImplementation(async ({ creatorRoleProfile }) => ({
    ...emptyProfile, id: mocks.userId, creatorRoleProfile,
  }));
  mocks.useWorkspace.mockImplementation(() => workspaceState());
  mocks.saveWorkspace.mockResolvedValue(workspaceState("ready", true));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  document.body.style.overflow = "";
  document.body.style.pointerEvents = "";
});

describe("CreatorAdaptiveOnboardingGate", () => {
  it("saves all five steps and closes only after persistence succeeds", async () => {
    const view = render(gateUi());
    await fillWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "이 작업실로 시작" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.updateMyProfile).toHaveBeenCalledTimes(1);
    expect(mocks.updateMyProfile).toHaveBeenCalledWith({ creatorRoleProfile: expect.objectContaining({
      experienceLevel: "professional", primaryRole: "story", secondaryRoles: ["assistant"], activeRole: "story",
      onboarding: expect.objectContaining({ status: "completed", step: 4 }),
    }) });
    expect(mocks.saveWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      activeRole: "story", usageGoals: ["story-writing"], accountContext: "studio",
      collaborationMode: "team", workspaceMode: "production", onboardingComplete: true,
    }));
    expect(hasAcknowledgedCreatorOnboarding(mocks.userId)).toBe(true);
    // 완료 CTA 보강: 스토리 집필 목적은 완료 즉시 스토리 랩이 단일 다음 행동이다.
    expect(screen.getByTestId("gate-location").textContent).toBe("/story-lab");
    view.unmount();
    render(gateUi());
    expect(mocks.getMyProfile).toHaveBeenCalledTimes(1);
  });

  it("previews role quick actions in order with preset defaults on the final step", async () => {
    render(gateUi());
    await fillWorkspace();
    expect(screen.getByText("이렇게 적용됩니다")).toBeTruthy();
    const first = screen.getByText("대본·설정 열기");
    const second = screen.getByText("회차 기획 확인");
    const third = screen.getByText("프로젝트 이어가기");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((screen.getByLabelText("기본 편집기 작업공간") as HTMLSelectElement).value).toBe("quick-sketch");
    expect((screen.getByLabelText("알림 수준") as HTMLSelectElement).value).toBe("balanced");
  });

  it("counts notifications in the preview with the document's existing overrides applied", async () => {
    const base = workspaceState();
    mocks.useWorkspace.mockImplementation(() => ({
      ...base,
      snapshot: {
        ...base.snapshot,
        document: normalizeCreatorRoleWorkspacePreference({
          notificationOverrides: { assignment: false },
        }),
      },
    }));
    render(gateUi());
    await fillWorkspace();
    // story·balanced 기본 도출은 5개가 켜지지만, 문서에 이미 있는 assignment 끄기가 우선한다.
    expect(screen.getByText(/알림 종류 10개 중 4개가 켜집니다/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("알림 수준"), { target: { value: "all" } });
    expect(screen.getByText(/알림 종류 10개 중 9개가 켜집니다/)).toBeTruthy();
  });

  it("saves notification and workspace presets changed in place on the preview step", async () => {
    render(gateUi());
    await fillWorkspace();
    fireEvent.change(screen.getByLabelText("알림 수준"), { target: { value: "muted" } });
    expect(screen.getByText(/알림 종류 10개 중 0개가 켜집니다/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("기본 편집기 작업공간"), { target: { value: "coloring" } });
    fireEvent.click(screen.getByRole("button", { name: "이 작업실로 시작" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.saveWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      activeRole: "story", notificationPreset: "muted", workspacePreset: "coloring",
    }));
  });

  it("lets a beginner finish with no role decided and lands on the default create CTA", async () => {
    render(gateUi());
    await screen.findByRole("heading", { name: "나에게 맞는 작업 환경 만들기" });
    fireEvent.click(screen.getByRole("button", { name: /처음 · 입문/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    // 역할 단계의 초보 기본값: "아직 정하지 않음"이 이미 선택돼 있어 그대로 다음으로 갈 수 있다.
    const undecided = screen.getByRole("button", { name: /아직 정하지 않음/ });
    expect(undecided.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    // 목적을 고르지 않아도 완료 지점의 단일 다음 행동이 미리보기에 표시된다.
    expect(screen.getByText(/완료하면 바로 “새 작품 만들기”/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이 작업실로 시작" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.updateMyProfile).toHaveBeenCalledWith({ creatorRoleProfile: expect.objectContaining({
      experienceLevel: "beginner", primaryRole: null, secondaryRoles: [], activeRole: null,
      onboarding: expect.objectContaining({ status: "completed" }),
    }) });
    expect(mocks.saveWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      activeRole: null, detailedLens: null, onboardingComplete: true,
    }));
    expect(screen.getByTestId("gate-location").textContent).toBe("/studio/new");
  });

  it("names the role settings entry in the always-visible skip guidance", async () => {
    render(gateUi());
    await screen.findByRole("dialog");
    const guidance = screen.getByText(/내 직군 · 작업환경/);
    expect(guidance.textContent).toContain("건너뛰어도");
    expect(guidance.className).not.toContain("hidden");
  });

  it.each(["header", "footer", "escape"])("remembers %s dismissal across remounts", async (way) => {
    const view = render(gateUi());
    const dialog = await screen.findByRole("dialog");
    if (way === "escape") fireEvent.keyDown(dialog, { key: "Escape" });
    else fireEvent.click(screen.getAllByRole("button", { name: "나중에 설정" })[way === "header" ? 0 : 1]!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(hasAcknowledgedCreatorOnboarding(mocks.userId)).toBe(true);
    expect(mocks.updateMyProfile).not.toHaveBeenCalled();
    view.unmount();
    render(gateUi());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.getMyProfile).toHaveBeenCalledTimes(1);
  });

  it.each(["/home", "/home/", "/team", "/team/"])("opens on first workspace entry at %s", async (path) => {
    render(gateUi(path));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(mocks.getMyProfile).toHaveBeenCalled();
  });

  it.each(["/home?tour=1", "/team?invite=1"])("does not interrupt a query-bearing workspace entry at %s", (path) => {
    render(gateUi(path));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.getMyProfile).not.toHaveBeenCalled();
  });

  it.each([
    "/", "/hub", "/settings", "/create", "/studio/canvas",
    "/studio/bg3d", "/studio/character", "/studio/lift3d", "/studio/new", "/studio/import",
    "/studio/assets/3d", "/studio/p/project-1/space", "/studio/p/project-1/doc/document-1",
    "/studio/work/work-1/bg3d", "/studio/remix/work-1/character",
    "/studio?id=work-1", "/studio?mode=bg3d", "/studio?mode=", "/studio?remix=work-1",
    "/studio?view=archived", "/studio?drawingShell=app",
  ])("does not interrupt or request personalization data at %s", (path) => {
    render(gateUi(path));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.getMyProfile).not.toHaveBeenCalled();
    expect(mocks.useWorkspace).not.toHaveBeenCalled();
  });

  it("does not load disabled or unauthenticated onboarding", () => {
    const view = render(gateUi("/studio", false));
    mocks.authenticated = false;
    view.rerender(gateUi());
    expect(mocks.getMyProfile).not.toHaveBeenCalled();
    expect(mocks.useWorkspace).not.toHaveBeenCalled();
  });

  it.each(["completed", "skipped"])("respects existing %s role onboarding", async (status) => {
    mocks.getMyProfile.mockResolvedValue({
      ...emptyProfile, id: mocks.userId,
      creatorRoleProfile: normalizeCreatorRoleProfile({ ...EMPTY_CREATOR_ROLE_PROFILE, onboarding: { status } }),
    });
    await act(async () => { render(gateUi()); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not require new optional fields after workspace completion", async () => {
    mocks.useWorkspace.mockReturnValue(workspaceState("ready", true));
    await act(async () => { render(gateUi()); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each(["error", "offline", "loading"])("does not open from uncertain %s workspace data", async (status) => {
    mocks.useWorkspace.mockReturnValue(workspaceState(status));
    await act(async () => { render(gateUi()); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("yields to an existing modal", async () => {
    const other = document.createElement("div");
    other.setAttribute("aria-modal", "true");
    document.body.append(other);
    await act(async () => { render(gateUi()); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("portals outside the app root and restores focus when dismissed", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = render(gateUi());
    const dialog = await screen.findByRole("dialog");
    expect(view.container.contains(dialog)).toBe(false);
    expect(dialog.closest("[inert]")).toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it.each(["offline", "conflict"])("keeps %s save failures visible and permits a retry", async (failure) => {
    if (failure === "conflict") mocks.saveWorkspace.mockRejectedValueOnce(new Error("저장 충돌"));
    else mocks.saveWorkspace.mockResolvedValueOnce({ ...workspaceState("offline", true), error: "서버 저장 실패" });
    render(gateUi());
    await fillWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "이 작업실로 시작" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/저장/);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(hasAcknowledgedCreatorOnboarding(mocks.userId)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "이 작업실로 시작" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.saveWorkspace).toHaveBeenCalledTimes(2);
  });

  it("does not carry a dismissal into another authenticated account", async () => {
    const view = render(gateUi());
    await screen.findByRole("dialog");
    fireEvent.click(screen.getAllByRole("button", { name: "나중에 설정" })[0]!);
    mocks.userId = `${mocks.userId}-other`;
    view.rerender(gateUi());
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("prevents duplicate saves and dismissal while persistence is pending", async () => {
    let finish!: (value: typeof emptyProfile) => void;
    mocks.updateMyProfile.mockReturnValueOnce(new Promise<typeof emptyProfile>((resolve) => { finish = resolve; }));
    render(gateUi());
    await fillWorkspace();
    const submit = screen.getByRole("button", { name: "이 작업실로 시작" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    for (const close of screen.getAllByRole("button", { name: "나중에 설정" })) {
      expect((close as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(close);
    }
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(mocks.updateMyProfile).toHaveBeenCalledTimes(1);
    expect(mocks.saveWorkspace).not.toHaveBeenCalled();
    await act(async () => { finish({ ...emptyProfile, id: mocks.userId }); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.saveWorkspace).toHaveBeenCalledTimes(1);
  });

  it("does not continue a stale save after the route unmounts", async () => {
    let finish!: (value: typeof emptyProfile) => void;
    mocks.updateMyProfile.mockReturnValueOnce(new Promise<typeof emptyProfile>((resolve) => { finish = resolve; }));
    const view = render(gateUi());
    await fillWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "이 작업실로 시작" }));
    view.unmount();
    await act(async () => { finish({ ...emptyProfile, id: mocks.userId }); });
    expect(mocks.saveWorkspace).not.toHaveBeenCalled();
    expect(hasAcknowledgedCreatorOnboarding(mocks.userId)).toBe(false);
  });

  it("ignores a profile response belonging to another account", async () => {
    mocks.getMyProfile.mockResolvedValue({ ...emptyProfile, id: "other-account" });
    await act(async () => { render(gateUi()); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
