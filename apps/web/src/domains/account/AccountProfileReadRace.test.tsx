// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountPage } from "./AccountPage";
import { SessionProvider } from "@/domains/auth/public/session/auth-session";
import { persistSession } from "@/domains/auth/public/session/auth-session-state";
import { getCachedMyProfile, invalidateMyProfileCache, updateMyProfile } from "@/platform/me-client";
import { EMPTY_CREATOR_ROLE_PROFILE } from "@/shared/lib/creator-role-contract";
import { captureProfileDraftScope, getProfileDraftIdentityGeneration, readProfileDraft } from "./account-profile-draft";

const network = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("@/platform/api", () => ({
  api: network,
  toApiError: async (error: unknown) => error instanceof Error ? error : new Error("요청 실패"),
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
vi.mock("@/domains/auth/public/session/auth-session-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domains/auth/public/session/auth-session-store")>();
  return {
    ...actual,
    // 원격 세션 확인만 대체하고 실제 Provider의 setData·인증 publication은 그대로 사용한다.
    synchronizeServerSession: vi.fn(async () => actual.getAuthSession()),
    synchronizeServerSessionState: vi.fn(async () => {
      const session = actual.getAuthSession();
      return session ? { status: "authenticated" as const, session }
        : { status: "unauthenticated" as const, session: null };
    }),
  };
});
vi.mock("@/platform/creator-client", async () => {
  const { getAuthUserId } = await import("@/domains/auth/public/session/auth-session-state");
  return { getCurrentUserId: getAuthUserId };
});
vi.mock("@/shared/components/my-space-module-chrome", () => ({ MySpaceModuleChrome: () => null }));
vi.mock("@/shared/components/section", () => ({ Container: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("./AccountPageSubSections", () => ({
  ActivityTab: () => null, PostsTab: () => null,
  SignInPrompt: () => null, DeleteAccountDialog: () => null, ProfilePreview: () => null,
}));
vi.mock("@/shared/components/avatar-uploader", () => ({ AvatarUploader: () => null }));
vi.mock("./CreatorRoleProfileEditor", () => ({ CreatorRoleProfileEditor: () => null }));

const profile = (name: string, bio: string) => ({
  id: "profile-race-user", name, bio, image: null, avatar: null, email: null,
  creatorRoleProfile: { ...EMPTY_CREATOR_ROLE_PROFILE, secondaryRoles: [], specialties: [] },
  regionSettings: null,
});
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("요청 준비 전 응답"); };
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function mount() {
  return render(<SessionProvider><MemoryRouter initialEntries={["/me?tab=profile"]}>
    <Routes>
      <Route path="/me" element={<><Link to="/elsewhere">다른 화면</Link><AccountPage /></>} />
      <Route path="/elsewhere" element={<Link to="/me?tab=profile">프로필로 돌아가기</Link>} />
    </Routes>
  </MemoryRouter></SessionProvider>);
}
function signInAgain() {
  // Provider가 중간 guest 화면을 commit했다고 가정하지 않는다.
  persistSession(null);
  persistSession({ user: { id: "profile-race-user", name: "재로그인 세션" }, token: null });
}
function beforeUnload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
beforeEach(() => {
  network.get.mockReset(); network.patch.mockReset();
  persistSession(null);
  persistSession({ user: { id: "profile-race-user", name: "세션 이름" }, token: null });
  invalidateMyProfileCache({ broadcast: false });
});
afterEach(() => {
  cleanup(); persistSession(null); invalidateMyProfileCache({ broadcast: false });
});

describe("실제 프로필 클라이언트와 편집 폼의 갱신 경합", () => {
  it("조회 도중 설정 저장이 끝나도 폼이 비활성 오류에 머물지 않고 최신 값으로 열린다", async () => {
    const old = deferred<{ profile: ReturnType<typeof profile> }>();
    network.get.mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ profile: profile("서버 최신 이름", "저장한 소개") });
    network.patch.mockResolvedValue({ profile: profile("서버 최신 이름", "저장한 소개") });
    mount();
    expect(network.get).toHaveBeenCalledTimes(1);
    await act(async () => {
      await updateMyProfile({ bio: "저장한 소개" });
      old.resolve({ profile: profile("저장 전 이름", "이전 소개") });
    });
    const bio = await screen.findByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
    expect(bio.value).toBe("저장한 소개");
    expect(bio.disabled).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>("account.profile.nameLabel").value).toBe("서버 최신 이름");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(network.get).toHaveBeenCalledTimes(2);
    expect(network.patch).toHaveBeenCalledTimes(1);
  });

  it("계속된 무효화는 두 번의 조회 뒤 명시적 재시도로 복구한다", async () => {
    network.get.mockImplementation(async () => {
      invalidateMyProfileCache({ broadcast: false });
      return { profile: profile("충돌 중 이름", "충돌 중 소개") };
    });
    mount();
    await screen.findByRole("alert");
    expect(network.get).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText<HTMLTextAreaElement>("account.profile.bioLabel").disabled).toBe(true);
    network.get.mockResolvedValue({ profile: profile("재시도 이름", "복구한 소개") });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" })); });
    const bio = await screen.findByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
    expect(bio.value).toBe("복구한 소개");
    expect(bio.disabled).toBe(false);
    expect(network.get).toHaveBeenCalledTimes(3);
    expect(network.patch).not.toHaveBeenCalled();
  });

  it("같은 commit의 로그아웃·동일 계정 재로그인은 이전 폼을 폐기하고 새 초안을 왕복 복구한다", async () => {
    const fresh = deferred<{ profile: ReturnType<typeof profile> }>();
    network.get.mockResolvedValueOnce({ profile: profile("이전 이름", "이전 서버 소개") })
      .mockReturnValueOnce(fresh.promise)
      .mockResolvedValueOnce({ profile: profile("재로그인 이름", "새 서버 소개") });
    mount();
    const previousBio = await screen.findByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
    const previousForm = previousBio.form;
    if (!previousForm) throw new Error("이전 로그인 프로필 폼이 필요합니다.");
    const previousScope = captureProfileDraftScope("profile-race-user");
    fireEvent.change(previousBio, { target: { value: "이전 로그인에서 작성한 소개" } });
    expect(beforeUnload()).toBe(true);

    act(() => { signInAgain(); fireEvent.submit(previousForm); });
    expect(document.contains(previousBio)).toBe(false);
    expect(screen.queryByLabelText("account.profile.bioLabel")).toBeNull();
    expect(beforeUnload()).toBe(false);
    expect(readProfileDraft(previousScope)).toBeNull();
    expect(network.get).toHaveBeenCalledTimes(2);
    await act(async () => { fresh.resolve({ profile: profile("재로그인 이름", "새 서버 소개") }); });
    const currentBio = await screen.findByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
    expect(currentBio.value).toBe("새 서버 소개");
    fireEvent.change(currentBio, { target: { value: "새 로그인에서 작성한 초안" } });
    const currentScope = captureProfileDraftScope("profile-race-user");
    expect(currentScope.generation).not.toBe(previousScope.generation);
    expect(readProfileDraft(currentScope)?.patch.bio).toBe("새 로그인에서 작성한 초안");
    expect(beforeUnload()).toBe(true);

    fireEvent.click(screen.getByRole("link", { name: "다른 화면" }));
    expect(screen.queryByLabelText("account.profile.bioLabel")).toBeNull();
    expect(beforeUnload()).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: "프로필로 돌아가기" }));
    const restored = await screen.findByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
    expect(restored.value).toBe("새 로그인에서 작성한 초안");
    expect(screen.getByLabelText<HTMLInputElement>("account.profile.nameLabel").value).toBe("재로그인 이름");
    expect(network.patch).not.toHaveBeenCalled();
  });

  it("동일 계정 재로그인 전의 늦은 GET은 새 폼·캐시를 되돌리거나 추가 재조회하지 않는다", async () => {
    const previous = deferred<{ profile: ReturnType<typeof profile> }>();
    network.get.mockReturnValueOnce(previous.promise)
      .mockResolvedValueOnce({ profile: profile("새 로그인 이름", "새 로그인 소개") });
    mount();
    const previousSignal = network.get.mock.calls[0]?.[1]?.signal;
    act(() => { signInAgain(); });
    const bio = await screen.findByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
    expect(previousSignal?.aborted).toBe(true);
    await act(async () => { previous.resolve({ profile: profile("로그아웃 전 이름", "로그아웃 전 소개") }); });
    expect(bio.value).toBe("새 로그인 소개");
    expect(getCachedMyProfile()?.name).toBe("새 로그인 이름");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(network.get).toHaveBeenCalledTimes(2);
  });

  it("이전 로그인의 늦은 PATCH 완료는 새 로그인 초안과 저장 상태를 지우지 않는다", async () => {
    const previousSave = deferred<{ profile: ReturnType<typeof profile> }>();
    network.get.mockResolvedValueOnce({ profile: profile("이전 이름", "이전 소개") })
      .mockResolvedValueOnce({ profile: profile("새 이름", "새 서버 소개") });
    network.patch.mockReturnValueOnce(previousSave.promise);
    mount();
    const previousBio = await screen.findByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
    fireEvent.change(previousBio, { target: { value: "이전 로그인의 저장 요청" } });
    fireEvent.click(screen.getByRole("button", { name: "account.profile.saveButton" }));
    expect(network.patch).toHaveBeenCalledTimes(1);
    act(() => { signInAgain(); });
    const currentBio = await screen.findByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
    fireEvent.change(currentBio, { target: { value: "새 로그인에서 작성 중" } });
    const currentScope = captureProfileDraftScope("profile-race-user");
    await act(async () => { previousSave.resolve({ profile: profile("이전 이름", "이전 로그인의 저장 요청") }); });
    expect(currentBio.value).toBe("새 로그인에서 작성 중");
    expect(readProfileDraft(currentScope)?.patch.bio).toBe("새 로그인에서 작성 중");
    expect(getCachedMyProfile()?.name).toBe("새 이름");
    expect(screen.queryByRole("button", { name: "account.profile.saved" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(beforeUnload()).toBe(true);
    expect(network.patch).toHaveBeenCalledTimes(1);
  });

  it("동일 계정의 프로필 반영·세션 재확인은 폼과 작성 중 초안을 유지한다", async () => {
    network.get.mockResolvedValueOnce({ profile: profile("처음 이름", "서버 소개") })
      .mockResolvedValueOnce({ profile: profile("갱신한 이름", "서버 소개") });
    network.patch.mockResolvedValueOnce({ profile: profile("갱신한 이름", "서버 소개") });
    mount();
    const bio = await screen.findByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
    fireEvent.change(bio, { target: { value: "계속 작성할 초안" } });
    const scope = captureProfileDraftScope("profile-race-user");
    const generation = getProfileDraftIdentityGeneration();
    await act(async () => {
      await updateMyProfile({ name: "갱신한 이름" });
      persistSession({ user: { id: "profile-race-user", name: "재확인한 세션 이름" }, token: null });
    });
    expect(screen.getByLabelText("account.profile.bioLabel")).toBe(bio);
    expect(bio.value).toBe("계속 작성할 초안");
    expect(getProfileDraftIdentityGeneration()).toBe(generation);
    expect(readProfileDraft(scope)?.patch.bio).toBe("계속 작성할 초안");
    expect(beforeUnload()).toBe(true);
    expect(network.get).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("link", { name: "다른 화면" }));
    fireEvent.click(screen.getByRole("link", { name: "프로필로 돌아가기" }));
    expect((await screen.findByLabelText<HTMLTextAreaElement>("account.profile.bioLabel")).value).toBe("계속 작성할 초안");
    expect(screen.getByLabelText<HTMLInputElement>("account.profile.nameLabel").value).toBe("갱신한 이름");
  });

  it("공백 포함 서버 원본은 입력 전 초안이나 저장 요청을 만들지 않는다", async () => {
    const legacy = profile(" 이름 ", "소개\n");
    network.get.mockResolvedValueOnce({ profile: legacy })
      .mockResolvedValueOnce({ profile: { ...legacy, name: "외부에서 갱신한 이름" } });
    mount();
    const name = await screen.findByLabelText<HTMLInputElement>("account.profile.nameLabel");
    expect(name.value).toBe(legacy.name);
    expect(screen.getByLabelText<HTMLTextAreaElement>("account.profile.bioLabel").value).toBe(legacy.bio);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "account.profile.saveButton" }).disabled).toBe(true);
    const scope = captureProfileDraftScope("profile-race-user");
    expect(readProfileDraft(scope)).toBeNull();
    expect(beforeUnload()).toBe(false);
    fireEvent.submit(screen.getByRole("form", { name: "공개 프로필 편집" }));
    expect(network.patch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: "다른 화면" }));
    fireEvent.click(screen.getByRole("link", { name: "프로필로 돌아가기" }));
    const returned = await screen.findByLabelText<HTMLInputElement>("account.profile.nameLabel");
    expect(returned.value).toBe("외부에서 갱신한 이름");
    expect(screen.getByLabelText<HTMLTextAreaElement>("account.profile.bioLabel").value).toBe(legacy.bio);
    expect(screen.queryByRole("button", { name: "account.profile.discardDraft" })).toBeNull();
    expect(readProfileDraft(scope)).toBeNull();
    expect(beforeUnload()).toBe(false);
    expect(network.get).toHaveBeenCalledTimes(2);
    expect(network.patch).not.toHaveBeenCalled();
  });

  it("공백 포함 서버 원본에서 이름만 저장하면 미수정 소개를 PATCH에 넣지 않는다", async () => {
    const legacy = profile(" 이름 ", "소개\n");
    network.get.mockResolvedValueOnce({ profile: legacy });
    network.patch.mockResolvedValueOnce({ profile: { ...legacy, name: "새 이름" } });
    mount();
    const name = await screen.findByLabelText<HTMLInputElement>("account.profile.nameLabel");
    fireEvent.change(name, { target: { value: " 새 이름 " } });
    expect(readProfileDraft(captureProfileDraftScope("profile-race-user"))?.patch).toEqual({ name: " 새 이름 " });
    expect(beforeUnload()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "account.profile.saveButton" }));
    const saved = await screen.findByRole<HTMLButtonElement>("button", { name: "account.profile.saved" });
    expect(network.patch).toHaveBeenCalledTimes(1);
    expect(network.patch).toHaveBeenCalledWith("/me/profile", { name: "새 이름" });
    expect(name.value).toBe("새 이름");
    expect(screen.getByLabelText<HTMLTextAreaElement>("account.profile.bioLabel").value).toBe(legacy.bio);
    expect(getCachedMyProfile()?.bio).toBe(legacy.bio);
    expect(saved.disabled).toBe(true);
    expect(readProfileDraft(captureProfileDraftScope("profile-race-user"))).toBeNull();
    expect(beforeUnload()).toBe(false);
  });

  it("공백 포함 서버 원본의 초안 폐기는 최신 이름·서버 소개·초점을 복구한다", async () => {
    const legacy = profile(" 이름 ", "소개\n");
    const latest = { ...legacy, name: "다른 화면의 최신 이름" };
    network.get.mockResolvedValue({ profile: latest }).mockResolvedValueOnce({ profile: legacy });
    mount();
    const bio = await screen.findByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
    fireEvent.change(bio, { target: { value: "폐기할 소개" } });
    const scope = captureProfileDraftScope("profile-race-user");
    expect(readProfileDraft(scope)?.patch).toEqual({ bio: "폐기할 소개" });
    fireEvent.click(screen.getByRole("link", { name: "다른 화면" }));
    fireEvent.click(screen.getByRole("link", { name: "프로필로 돌아가기" }));
    const restored = await screen.findByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
    const name = screen.getByLabelText<HTMLInputElement>("account.profile.nameLabel");
    expect(restored.value).toBe("폐기할 소개");
    expect(name.value).toBe(latest.name);
    expect(beforeUnload()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "account.profile.discardDraft" }));
    expect(document.activeElement).toBe(name);
    expect(name.value).toBe(latest.name);
    expect(restored.value).toBe(legacy.bio);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "account.profile.saveButton" }).disabled).toBe(true);
    expect(readProfileDraft(scope)).toBeNull();
    expect(beforeUnload()).toBe(false);

    fireEvent.click(screen.getByRole("link", { name: "다른 화면" }));
    fireEvent.click(screen.getByRole("link", { name: "프로필로 돌아가기" }));
    expect((await screen.findByLabelText<HTMLTextAreaElement>("account.profile.bioLabel")).value).toBe(legacy.bio);
    expect(screen.getByLabelText<HTMLInputElement>("account.profile.nameLabel").value).toBe(latest.name);
    expect(screen.queryByRole("button", { name: "account.profile.discardDraft" })).toBeNull();
    expect(network.get).toHaveBeenCalledTimes(3);
    expect(network.patch).not.toHaveBeenCalled();
  });

  it("공백 포함 서버 원본을 의도적으로 정리한 입력은 저장하고 재방문 때 초안을 남기지 않는다", async () => {
    const legacy = profile(" 이름 ", "소개\n");
    const normalized = profile("이름", "소개");
    network.get.mockResolvedValue({ profile: normalized }).mockResolvedValueOnce({ profile: legacy });
    network.patch.mockResolvedValueOnce({ profile: normalized });
    mount();
    const name = await screen.findByLabelText<HTMLInputElement>("account.profile.nameLabel");
    const bio = screen.getByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
    fireEvent.change(name, { target: { value: "이름" } });
    fireEvent.change(bio, { target: { value: "소개" } });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "account.profile.saveButton" }).disabled).toBe(false);
    expect(readProfileDraft(captureProfileDraftScope("profile-race-user"))?.patch).toEqual({ name: "이름", bio: "소개" });
    fireEvent.click(screen.getByRole("button", { name: "account.profile.saveButton" }));
    const saved = await screen.findByRole<HTMLButtonElement>("button", { name: "account.profile.saved" });
    expect(network.patch).toHaveBeenCalledTimes(1);
    expect(network.patch).toHaveBeenCalledWith("/me/profile", { name: "이름", bio: "소개" });
    expect(saved.disabled).toBe(true);
    expect(beforeUnload()).toBe(false);
    fireEvent.click(screen.getByRole("link", { name: "다른 화면" }));
    fireEvent.click(screen.getByRole("link", { name: "프로필로 돌아가기" }));
    expect((await screen.findByLabelText<HTMLInputElement>("account.profile.nameLabel")).value).toBe("이름");
    expect(screen.getByLabelText<HTMLTextAreaElement>("account.profile.bioLabel").value).toBe("소개");
    expect(screen.queryByRole("button", { name: "account.profile.discardDraft" })).toBeNull();
    expect(readProfileDraft(captureProfileDraftScope("profile-race-user"))).toBeNull();
    expect(network.get).toHaveBeenCalledTimes(2);
  });
});
