// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountPage } from "./AccountPage";
import { EMPTY_CREATOR_ROLE_PROFILE } from "@/shared/lib/creator-role-contract";

const state = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(),
  user: { id: "profile-recovery-user", name: "세션의 예전 이름", image: "https://example.test/old.png", role: "user" },
}));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  formatI18nTemplate: (value: string) => value,
  getActiveI18nLocale: () => "ko",
  translateBilingualValueForActiveLocale: (_scope: string, ko: string) => ko,
  translateCurrentStaticSourceText: (_scope: string, _locale: string, text: string) => text,
}));
vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => key,
  registerI18nLocaleEntries: vi.fn(), registerI18nEnglishSourceEntries: vi.fn(),
}));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ status: "authenticated", data: { user: state.user } }),
}));
vi.mock("@/platform/creator-client", () => ({ getCurrentUserId: () => state.user.id }));
vi.mock("@/platform/me-client", () => ({ getMyProfile: state.get, updateMyProfile: state.update }));
vi.mock("@/shared/components/my-space-module-chrome", () => ({ MySpaceModuleChrome: () => null }));
vi.mock("@/shared/components/section", () => ({ Container: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("./AccountPageSubSections", () => ({
  ActivityTab: () => <p>감상 기록</p>, PostsTab: () => <p>게시 작품</p>,
  SignInPrompt: () => null, DeleteAccountDialog: () => null,
  ProfilePreview: ({ dirty }: { dirty: boolean }) => <p>{dirty ? "저장 전" : "저장한 프로필"}</p>,
}));
vi.mock("@/shared/components/avatar-uploader", () => ({
  AvatarUploader: ({ value, disabled }: { value: string | null; disabled: boolean }) => <button type="button" disabled={disabled} aria-label="사진 변경">{value ?? "사진 없음"}</button>,
}));
vi.mock("./CreatorRoleProfileEditor", () => ({
  CreatorRoleProfileEditor: ({ disabled }: { disabled: boolean }) => <button type="button" disabled={disabled}>직무 변경</button>,
}));

const profile = () => ({
  id: state.user.id, name: "서버의 최신 이름", image: null, bio: "서버에 보관한 소개", avatar: null,
  email: "fixture@example.test", regionSettings: null,
  creatorRoleProfile: { ...EMPTY_CREATOR_ROLE_PROFILE, secondaryRoles: [], specialties: [] },
});
function renderAccount() {
  return render(<MemoryRouter initialEntries={["/account?tab=profile"]}><AccountPage /></MemoryRouter>);
}
const nameInput = () => screen.getByLabelText<HTMLInputElement>("account.profile.nameLabel");
const bioInput = () => screen.getByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
const save = () => screen.getByRole("button", { name: "account.profile.saveButton" });

beforeEach(() => {
  state.get.mockReset().mockImplementation(async () => profile());
  state.update.mockReset().mockImplementation(async (payload) => ({ ...profile(), ...payload }));
  state.user = { id: "profile-recovery-user", name: "세션의 예전 이름", image: "https://example.test/old.png", role: "user" };
});
afterEach(() => cleanup());

describe("계정 프로필의 안전한 조회·저장·복구", () => {
  it("입력 전에는 서버의 최신 이름과 사진 제거 상태가 세션 캐시보다 우선한다", async () => {
    renderAccount();
    await screen.findByLabelText("account.profile.nameLabel");
    expect(nameInput().value).toBe("서버의 최신 이름");
    expect(screen.getByRole("button", { name: "사진 변경" }).textContent).toBe("사진 없음");
    expect(screen.queryByText("저장 전")).toBeNull();
  });

  it("조회 실패 때 알 수 없는 서버 소개·사진을 빈 값으로 저장하지 못한다", async () => {
    state.get.mockRejectedValueOnce(new Error("조회 장애"));
    renderAccount();
    await screen.findByRole("alert");
    expect(save().hasAttribute("disabled")).toBe(true);
    expect(nameInput().hasAttribute("disabled")).toBe(true);
    expect(bioInput().hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "사진 변경" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "직무 변경", hidden: true }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(save());
    expect(state.update).not.toHaveBeenCalled();
  });

  it("조회 재시도는 캐시 대신 서버를 확인한 뒤 폼을 복구한다", async () => {
    state.get.mockRejectedValueOnce(new Error("조회 장애"));
    renderAccount();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    await waitFor(() => expect(bioInput().value).toBe("서버에 보관한 소개"));
    expect(state.get).toHaveBeenLastCalledWith(expect.any(AbortSignal), true);
    expect(nameInput().value).toBe("서버의 최신 이름");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("저장 실패 시 작성 내용을 보존하고 같은 내용으로 재시도한다", async () => {
    state.update.mockRejectedValueOnce(new Error("저장 연결 실패"));
    renderAccount();
    await screen.findByLabelText("account.profile.bioLabel");
    fireEvent.change(nameInput(), { target: { value: "새 이름" } });
    fireEvent.change(bioInput(), { target: { value: "보존할 소개" } });
    fireEvent.click(save());
    await screen.findByText("저장 연결 실패");
    expect(bioInput().value).toBe("보존할 소개");
    fireEvent.click(save());
    await screen.findByRole("button", { name: "account.profile.saved" });
    expect(state.update).toHaveBeenCalledTimes(2);
    expect(state.update).toHaveBeenLastCalledWith(expect.objectContaining({ name: "새 이름", bio: "보존할 소개" }));
    expect(screen.queryByText("저장 전")).toBeNull();
  });

  it("탭을 바꾸고 돌아와도 저장하지 않은 소개를 잃지 않는다", async () => {
    renderAccount();
    await screen.findByLabelText("account.profile.bioLabel");
    fireEvent.change(bioInput(), { target: { value: "아직 저장하지 않은 초안" } });
    fireEvent.click(screen.getByRole("tab", { name: "account.tabs.posts" }));
    fireEvent.click(screen.getByRole("tab", { name: "account.tabs.profile" }));
    await screen.findByLabelText("account.profile.bioLabel");
    expect(bioInput().value).toBe("아직 저장하지 않은 초안");
    expect(state.get).toHaveBeenCalledTimes(1);
  });

  it("공백 이름의 오류를 해당 입력란과 연결한다", async () => {
    renderAccount();
    await screen.findByLabelText("account.profile.nameLabel");
    fireEvent.change(nameInput(), { target: { value: "   " } });
    expect(nameInput().getAttribute("aria-invalid")).toBe("true");
    const errorId = nameInput().getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId ?? "")?.textContent).toBe("account.profile.nameRequired");
    expect(save().hasAttribute("disabled")).toBe(true);
  });

  it("계정이 바뀌면 이전 계정의 폼 상태와 지연 응답을 재사용하지 않는다", async () => {
    let finish: ((value: ReturnType<typeof profile>) => void) | undefined;
    state.get.mockImplementationOnce(() => new Promise<ReturnType<typeof profile>>((resolve) => { finish = resolve; }));
    const first = profile();
    const view = renderAccount();
    state.user = { ...state.user, id: "second-profile-user" };
    view.rerender(<MemoryRouter initialEntries={["/account?tab=profile"]}><AccountPage /></MemoryRouter>);
    await screen.findByLabelText("account.profile.nameLabel");
    await act(async () => { finish?.({ ...first, name: "이전 계정의 지연 응답" }); });
    expect(nameInput().value).toBe("서버의 최신 이름");
  });
  it("저장 전 새로고침은 보호하고 저장 완료 뒤에는 확인을 요구하지 않는다", async () => {
    renderAccount(); await screen.findByLabelText("account.profile.bioLabel");
    fireEvent.change(bioInput(), { target: { value: "창 닫기 보호 대상" } });
    const before = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(before); expect(before.defaultPrevented).toBe(true);
    fireEvent.click(save()); await screen.findByRole("button", { name: "account.profile.saved" });
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after); expect(after.defaultPrevented).toBe(false);
  });

  it("같은 순간의 중복 제출은 한 번만 전송한다", async () => {
    let finish: ((value: ReturnType<typeof profile>) => void) | undefined;
    state.update.mockImplementationOnce(() => new Promise<ReturnType<typeof profile>>((resolve) => { finish = resolve; }));
    renderAccount(); await screen.findByLabelText("account.profile.bioLabel");
    fireEvent.change(bioInput(), { target: { value: "한 번 저장" } });
    const form = screen.getByRole("form", { name: "공개 프로필 편집" });
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(state.update).toHaveBeenCalledTimes(1);
    await act(async () => { finish?.({ ...profile(), bio: "한 번 저장" }); });
    expect(screen.getByRole("status").textContent).toBe("프로필을 저장했어요.");
  });

  it("조회 실패 중 직접 submit 이벤트도 서버 데이터를 수정하지 않는다", async () => {
    state.get.mockRejectedValueOnce(new Error("조회 장애")); renderAccount();
    await screen.findByRole("alert");
    fireEvent.submit(screen.getByRole("form", { name: "공개 프로필 편집" }));
    expect(state.update).not.toHaveBeenCalled();
  });

  it("소개만 바꾸면 조회만 한 이름·사진·직무를 함께 덮어쓰지 않는다", async () => {
    renderAccount(); await screen.findByLabelText("account.profile.bioLabel");
    fireEvent.change(bioInput(), { target: { value: "소개만 변경" } });
    fireEvent.click(save()); await screen.findByRole("button", { name: "account.profile.saved" });
    expect(state.update).toHaveBeenCalledWith({ bio: "소개만 변경" });
  });

  it("긴 직무 설정은 선택해서 펼치며 기본 이름·소개 저장을 가리지 않는다", async () => {
    renderAccount(); await screen.findByLabelText("account.profile.nameLabel");
    const summary = screen.getByText("직무·협업 정보 (선택)");
    const details = summary.closest("details");
    expect(details).not.toBeNull(); expect(details?.open).toBe(false);
    // jsdom은 details의 렌더링을 모의하지 않으므로 브라우저 회귀가 실제 숨김을 검증한다.
    expect(screen.getByRole("button", { name: "직무 변경", hidden: true }).closest("details")).toBe(details);
    expect(save()).toBeTruthy();
    if (!details) throw new Error("직무 상세 구역이 필요합니다.");
    details.open = true;
    expect(screen.getByRole("button", { name: "직무 변경" })).toBeTruthy();
  });

});
