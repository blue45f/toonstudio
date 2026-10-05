// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMyProfile, updateMyProfile } from "@/platform/me-client";
import { useApp } from "@/shared/lib/store";

import { RoleWorkspaceSettingsPage } from "./RoleWorkspaceSettingsPage";

vi.mock("@/platform/me-client", () => ({
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
}));

vi.mock("./CreatorRoleProfileEditor", () => ({
  CreatorRoleProfileEditor: ({
    value,
    onChange,
  }: {
    value: { primaryRole: string };
    onChange: (next: { primaryRole: string }) => void;
  }) => (
    <div data-testid="role-editor">
      <span>{value.primaryRole}</span>
      <button type="button" onClick={() => onChange({ ...value, primaryRole: "color" })}>
        직군 바꾸기
      </button>
    </div>
  ),
}));

vi.mock("@/domains/creator/public/role-personalization", () => ({
  StudioLibraryPersonalizePanels: () => <div data-testid="personalize-panels" />,
}));

const profile = {
  name: "테스트",
  bio: "",
  image: null,
  creatorRoleProfile: { primaryRole: "story", activeRole: null },
};

function renderPage(entry = "/settings/role") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <RoleWorkspaceSettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(getMyProfile).mockReset();
  vi.mocked(updateMyProfile).mockReset();
  useApp.setState({ userId: null });
});

afterEach(cleanup);

describe("내 직군 · 작업환경 설정 (R-3)", () => {
  it("로그인하지 않으면 직군을 저장할 수 없다는 안내와 로그인 링크를 보인다", () => {
    renderPage();
    expect(screen.getByText("로그인이 필요합니다")).toBeTruthy();
    expect(screen.getByRole("link", { name: "로그인하기" }).getAttribute("href")).toBe("/auth/login");
    expect(getMyProfile).not.toHaveBeenCalled();
  });

  it("직군 탭에서 서버 프로필을 불러와 편집하고 저장한다", async () => {
    useApp.setState({ userId: "user-1" });
    vi.mocked(getMyProfile).mockResolvedValue(profile as never);
    vi.mocked(updateMyProfile).mockResolvedValue({
      ...profile,
      creatorRoleProfile: { primaryRole: "color", activeRole: null },
    } as never);

    renderPage();
    expect(await screen.findByTestId("role-editor")).toBeTruthy();
    expect(screen.getByText("story")).toBeTruthy();

    const saveButton = screen.getByRole("button", { name: /직군 프로필 저장/u });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "직군 바꾸기" }));
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(saveButton);
    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateMyProfile).mock.calls[0]?.[0]).toEqual({
      creatorRoleProfile: { primaryRole: "color", activeRole: null },
    });
    expect(await screen.findByRole("button", { name: /저장됨/u })).toBeTruthy();
  });

  it("프로필을 불러오지 못하면 오류와 다시 시도 버튼을 보인다", async () => {
    useApp.setState({ userId: "user-1" });
    vi.mocked(getMyProfile).mockRejectedValue(new Error("offline"));

    renderPage();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("작업환경 탭(?tab=workspace)에서는 개인화 패널을 불러온다", async () => {
    useApp.setState({ userId: "user-1" });
    renderPage("/settings/role?tab=workspace");
    expect(await screen.findByTestId("personalize-panels")).toBeTruthy();
    expect(screen.queryByTestId("role-editor")).toBeNull();
  });

  it("탭을 누르면 주소에 남는다", async () => {
    useApp.setState({ userId: "user-1" });
    vi.mocked(getMyProfile).mockResolvedValue(profile as never);
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "작업환경" }));
    expect(await screen.findByTestId("personalize-panels")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "작업환경" }).getAttribute("aria-selected")).toBe("true");
  });
});
