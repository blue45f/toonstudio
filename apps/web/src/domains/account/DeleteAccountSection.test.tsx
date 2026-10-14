// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeleteAccountSection } from "./DeleteAccountSection";

const deleteMyAccount = vi.fn(async () => ({ ok: true as const, deletedAt: "2026-10-03T00:00:00Z" }));
const signOut = vi.fn(async () => ({ ok: true as const }));
const assign = vi.fn();

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  formatI18nTemplate: (template: string) => template,
  getActiveI18nLocale: () => "ko",
  translateBilingualValueForActiveLocale: (_scope: string, ko: string) => ko,
  translateCurrentStaticSourceText: (_scope: string, _locale: string, text: string) => text,
}));

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => key,
}));

vi.mock("@/shared/lib/store", () => ({
  useApp: () => null,
  useHydrated: () => true,
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ status: "authenticated", data: null }),
  signOut: (...args: unknown[]) => signOut(...(args as [])),
}));

vi.mock("@/domains/auth/public/account-auth-modal", () => ({ AuthModal: () => null }));
vi.mock("@/shared/components/avatar-uploader", () => ({ AvatarUploader: () => null }));
vi.mock("@/shared/components/cover-image", () => ({ CoverImage: () => null }));
vi.mock("@/shared/components/feedback/error-state", () => ({ ErrorState: () => null }));
vi.mock("@/shared/components/section", () => ({
  Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/platform/creator-client", () => ({
  listWorks: vi.fn(),
  getCurrentUserId: () => "user-1",
}));
vi.mock("@/platform/me-client", () => ({
  deleteMyAccount: (...args: unknown[]) => deleteMyAccount(...(args as [])),
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
}));
vi.mock("./CreatorRoleProfileEditor", () => ({ CreatorRoleProfileEditor: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign },
    configurable: true,
    writable: true,
  });
});

describe("DeleteAccountSection", () => {
  it("게스트(userId 없음)에게는 탈퇴 섹션을 그리지 않는다", () => {
    const { container } = render(<DeleteAccountSection userId={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("탈퇴 버튼을 누르면 확인 다이얼로그가 열린다", () => {
    render(<DeleteAccountSection userId="user-1" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "account.profile.deleteTitle" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("확인하면 계정을 삭제하고 로그아웃한 뒤 홈으로 이동한다", async () => {
    render(<DeleteAccountSection userId="user-1" />);
    fireEvent.click(screen.getByRole("button", { name: "account.profile.deleteTitle" }));
    const dialog = screen.getByRole("dialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("account.profile.deleteTitle"),
    );
    expect(confirm).toBeTruthy();
    fireEvent.click(confirm as HTMLButtonElement);
    await waitFor(() => expect(deleteMyAccount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });
});

describe("DeleteAccountSection 탈퇴 전 작품 점검 (G4)", () => {
  const LIBRARY_KEY = "toonspectrum:studio-project-library:v1";
  const MARKER_KEY = "toonstudio:account-bulk-export:v1";

  function seedWorks() {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify({
      schemaVersion: 1,
      updatedAt: "2026-10-14T00:00:00.000Z",
      projects: [{
        id: "p-1", title: "내 작품", kind: "webtoon", status: "active",
        statusBeforeTrash: null, templateId: null, description: "",
        primaryLocale: "ko-KR", createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-10T00:00:00.000Z", lastOpenedAt: "2026-10-10T00:00:00.000Z",
        lastOpenedDocumentId: null, thumbnailUrl: null,
      }],
    }));
  }

  it("받지 못한 작품이 있으면 탈퇴 버튼이 잠기고, '내보내지 않고 탈퇴' 확인 후 열린다", () => {
    window.localStorage.clear();
    seedWorks();
    render(<MemoryRouter><DeleteAccountSection userId="user-1" /></MemoryRouter>);
    const deleteButton = screen.getByRole("button", { name: "account.profile.deleteTitle" });
    expect((deleteButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/받지 못한 작품이 1개/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    expect((deleteButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(deleteButton);
    expect(screen.getByRole("dialog")).toBeTruthy();
    window.localStorage.clear();
  });

  it("최신 일괄 다운로드 표식이 있으면 확인 없이 탈퇴할 수 있다", () => {
    window.localStorage.clear();
    seedWorks();
    window.localStorage.setItem(MARKER_KEY, JSON.stringify({
      exportedAt: "2026-10-12T00:00:00.000Z", successCount: 1, failureCount: 0, successIds: ["p-1"],
    }));
    render(<MemoryRouter><DeleteAccountSection userId="user-1" /></MemoryRouter>);
    const deleteButton = screen.getByRole("button", { name: "account.profile.deleteTitle" });
    expect((deleteButton as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("checkbox")).toBeNull();
    window.localStorage.clear();
  });
});
