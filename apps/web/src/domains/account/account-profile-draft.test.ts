// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_CREATOR_ROLE_PROFILE } from "@/shared/lib/creator-role-contract";
import { accountI18nBuiltins } from "./account-i18n-builtins";
import {
  captureProfileDraftScope,
  changedProfileFields,
  clearProfileDraft,
  getProfileDraftIdentityGeneration,
  isProfileDraftScopeCurrent,
  readProfileDraft,
  subscribeProfileDraftIdentity,
  writeProfileDraft,
  type ProfileDraftFields,
} from "./account-profile-draft";

const auth = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  listeners: new Set<(session: { user: { id: string } } | null) => void>(),
}));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthSession: () => auth.session,
  listeners: auth.listeners,
}));

function session(userId: string | null) {
  auth.session = userId ? { user: { id: userId } } : null;
  auth.listeners.forEach((listener) => listener(auth.session));
}
const fields = (): ProfileDraftFields => ({
  name: "이름", bio: "소개", image: "https://example.test/photo.png",
  creatorRoleProfile: { ...EMPTY_CREATOR_ROLE_PROFILE, secondaryRoles: [], specialties: [] },
});
const beforeUnload = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
beforeEach(() => { session(null); session("user-a"); });
afterEach(() => { session(null); vi.restoreAllMocks(); });

describe("세션 메모리 프로필 초안", () => {
  it.each(["ko", "en"] as const)("%s 계정 지연 사전에 복구 안내와 폐기 버튼 문구가 들어 있다", (locale) => {
    const dictionary = accountI18nBuiltins[locale];
    expect(dictionary["account.profile.discardDraft"]).toBe(locale === "ko" ? "초안 버리기" : "Discard draft");
    expect(dictionary["account.profile.draftRecovered"].length).toBeGreaterThan(30);
    expect(dictionary["account.profile.draftRestored"].length).toBeGreaterThan(15);
  });

  it("같은 로그인 사용자의 다른 화면에서도 작성 필드를 복구한다", () => {
    const scope = captureProfileDraftScope("user-a");
    writeProfileDraft(scope, { bio: "임시 소개", image: null });
    expect(readProfileDraft(captureProfileDraftScope("user-a"))?.patch).toEqual({ bio: "임시 소개", image: null });
  });

  it("현재 로그인 계정과 다른 소유자의 읽기와 쓰기를 거부한다", () => {
    const first = captureProfileDraftScope("user-a");
    writeProfileDraft(first, { bio: "비공개 초안" });
    const other = captureProfileDraftScope("user-b");
    expect(readProfileDraft(other)).toBeNull();
    expect(writeProfileDraft(other, { bio: "다른 사용자" })).toBeNull();
    expect(readProfileDraft(first)?.patch.bio).toBe("비공개 초안");
  });

  it("계정 교체 시 기존 초안을 즉시 버린다", () => {
    const first = captureProfileDraftScope("user-a");
    writeProfileDraft(first, { bio: "첫 계정 초안" });
    session("user-b");
    expect(readProfileDraft(first)).toBeNull();
    expect(readProfileDraft(captureProfileDraftScope("user-b"))).toBeNull();
    expect(beforeUnload()).toBe(false);
  });

  it("같은 계정으로 다시 로그인해도 로그아웃 전 초안과 지연 쓰기를 거절한다", () => {
    const previous = captureProfileDraftScope("user-a");
    writeProfileDraft(previous, { bio: "로그아웃 전 초안" });
    session(null); session("user-a");
    const current = captureProfileDraftScope("user-a");
    expect(current.generation).not.toBe(previous.generation);
    expect(readProfileDraft(current)).toBeNull();
    expect(writeProfileDraft(previous, { bio: "지연된 편집" })).toBeNull();
  });

  it("동일 계정의 프로필 갱신·세션 재확인은 작성 중 초안을 지우지 않는다", () => {
    const scope = captureProfileDraftScope("user-a");
    writeProfileDraft(scope, { bio: "진행 중 초안" });
    session("user-a");
    expect(readProfileDraft(scope)?.patch.bio).toBe("진행 중 초안");
  });

  it("초안 변경·동일 계정 알림은 유지하고 로그아웃·재로그인 세대만 동기 발행한다", () => {
    const scope = captureProfileDraftScope("user-a");
    const initial = getProfileDraftIdentityGeneration();
    const observed: number[] = [];
    const unsubscribe = subscribeProfileDraftIdentity(() => {
      observed.push(getProfileDraftIdentityGeneration());
    });
    try {
      writeProfileDraft(scope, { bio: "현재 로그인 초안" });
      session("user-a");
      expect(observed).toEqual([]);
      expect(isProfileDraftScopeCurrent(scope)).toBe(true);
      session(null); session("user-a");
      expect(observed).toEqual([initial + 1, initial + 2]);
      expect(isProfileDraftScopeCurrent(scope)).toBe(false);
      expect(readProfileDraft(captureProfileDraftScope("user-a"))).toBeNull();
    } finally { unsubscribe(); }
    session("user-b");
    expect(observed).toEqual([initial + 1, initial + 2]);
  });

  it("이전 저장 응답이 새 화면에서 수정한 초안을 지우지 않는다", () => {
    const scope = captureProfileDraftScope("user-a");
    const oldRevision = writeProfileDraft(scope, { bio: "저장 요청 값" });
    const newRevision = writeProfileDraft(scope, { bio: "저장 대기 중 새 값" });
    expect(clearProfileDraft(scope, oldRevision)).toBe(false);
    expect(readProfileDraft(scope)?.patch.bio).toBe("저장 대기 중 새 값");
    expect(clearProfileDraft(scope, newRevision)).toBe(true);
    expect(readProfileDraft(scope)).toBeNull();
  });

  it("반환한 직무 배열의 변경은 메모리 초안을 변경하지 않는다", () => {
    const scope = captureProfileDraftScope("user-a");
    const role = { ...fields().creatorRoleProfile, secondaryRoles: ["story" as const] };
    writeProfileDraft(scope, { creatorRoleProfile: role });
    role.secondaryRoles.length = 0;
    const copy = readProfileDraft(scope);
    expect(copy?.patch.creatorRoleProfile?.secondaryRoles).toEqual(["story"]);
    const copiedRoles = copy?.patch.creatorRoleProfile?.secondaryRoles;
    if (!copiedRoles) throw new Error("복구한 직무 배열이 필요합니다.");
    // readonly 타입을 바꾸지 않고 외부 JavaScript 소비자의 런타임 변경을 모의한다.
    expect(Reflect.set(copiedRoles, "length", 0)).toBe(true);
    expect(copiedRoles).toEqual([]);
    expect(readProfileDraft(scope)?.patch.creatorRoleProfile?.secondaryRoles).toEqual(["story"]);
  });

  it("작성 중인 초안이 있는 동안만 새로고침·닫기 확인을 요청한다", () => {
    const scope = captureProfileDraftScope("user-a");
    expect(beforeUnload()).toBe(false);
    const revision = writeProfileDraft(scope, { bio: "보존할 내용" });
    expect(beforeUnload()).toBe(true);
    clearProfileDraft(scope, revision);
    expect(beforeUnload()).toBe(false);
  });

  it("프로필 내용은 localStorage·sessionStorage에 기록하지 않는다", () => {
    const persist = vi.spyOn(Storage.prototype, "setItem");
    const scope = captureProfileDraftScope("user-a");
    const revision = writeProfileDraft(scope, { name: "개인 초안", bio: "저장소에 남기지 않음" });
    readProfileDraft(scope); clearProfileDraft(scope, revision);
    expect(persist).not.toHaveBeenCalled();
  });

  it("알림을 받지 못한 계정 변경도 읽기 경계에서 차단한다", () => {
    const scope = captureProfileDraftScope("user-a");
    writeProfileDraft(scope, { bio: "예전 계정 초안" });
    auth.session = { user: { id: "user-b" } };
    expect(readProfileDraft(scope)).toBeNull();
    expect(beforeUnload()).toBe(false);
  });

  it("기존 서버 원본에 공백이 남아도 변경하지 않은 필드를 초안에 담지 않는다", () => {
    const baseline = { ...fields(), name: " 이름 ", bio: "소개\n" };
    expect(changedProfileFields(baseline, baseline, false)).toEqual({});
    expect(changedProfileFields({ ...baseline, name: "다른 이름" }, baseline, false))
      .toEqual({ name: "다른 이름" });
    expect(changedProfileFields({ ...baseline, image: null }, baseline, false)).toEqual({ image: null });
    expect(changedProfileFields(baseline, baseline, true)).toEqual({
      creatorRoleProfile: baseline.creatorRoleProfile,
    });
  });

  it("공백 포함 기존 값에서 변경이 없으면 이탈 확인을 요청하지 않는다", () => {
    const baseline = { ...fields(), name: " 이름 ", bio: "소개\n" };
    const scope = captureProfileDraftScope("user-a");
    const unchanged = changedProfileFields(baseline, baseline, false);
    expect(unchanged).toEqual({});
    expect(writeProfileDraft(scope, unchanged)).toBeNull();
    expect(readProfileDraft(scope)).toBeNull();
    expect(beforeUnload()).toBe(false);
    const patch = changedProfileFields({ ...baseline, image: null }, baseline, false);
    expect(patch).toEqual({ image: null });
    const revision = writeProfileDraft(scope, patch);
    expect(readProfileDraft(scope)?.patch).toEqual({ image: null });
    expect(beforeUnload()).toBe(true);
    expect(clearProfileDraft(scope, revision)).toBe(true);
    expect(beforeUnload()).toBe(false);
    expect(changedProfileFields({ ...baseline, name: "이름", bio: "소개" }, baseline, false))
      .toEqual({ name: "이름", bio: "소개" });
  });

  it("다른 화면의 서버 필드를 덮지 않도록 변경한 값만 초안에 포함한다", () => {
    const baseline = fields();
    expect(changedProfileFields({ ...baseline, bio: " 새 소개 " }, baseline, false)).toEqual({ bio: " 새 소개 " });
    expect(changedProfileFields({ ...baseline, image: null }, baseline, false)).toEqual({ image: null });
    expect(changedProfileFields({ ...baseline, name: "   " }, baseline, false)).toEqual({ name: "   " });
    expect(changedProfileFields(baseline, baseline, false)).toEqual({});
    expect(changedProfileFields(baseline, baseline, true)).toEqual({ creatorRoleProfile: baseline.creatorRoleProfile });
  });
});
