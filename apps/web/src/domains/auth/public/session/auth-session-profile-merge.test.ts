// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  emitSession,
  getAuthSession,
  getAuthSessionRevision,
  listeners,
  mergeCurrentSessionProfile,
  persistSession,
  type Session,
} from "./auth-session-state";
import { readClientSession, SESSION_KEY } from "./auth-session-storage";

const profile = { id: "profile-fixture", name: "작가", email: "author@example.test", image: null, role: "creator" };
const subscribed = new Set<(session: Session) => void>();
function observeSession() {
  const listener = vi.fn();
  listeners.add(listener);
  subscribed.add(listener);
  return listener;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  persistSession(null);
});
afterEach(() => {
  for (const listener of subscribed) listeners.delete(listener);
  subscribed.clear();
  vi.restoreAllMocks();
  persistSession(null);
  localStorage.clear();
  sessionStorage.clear();
});

describe("동일한 서버 프로필의 인증 세대 보존", () => {
  it("같은 네 필드의 반복 병합은 객체·세대·인증 listener·저장소 쓰기를 늘리지 않는다", () => {
    persistSession({ user: profile, token: null });
    const current = getAuthSession();
    const revision = getAuthSessionRevision();
    const listener = observeSession();
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const removals = vi.spyOn(Storage.prototype, "removeItem");
    for (let count = 0; count < 3; count += 1) {
      expect(mergeCurrentSessionProfile({ ...profile })).toBe(current);
    }
    expect(getAuthSession()).toBe(current);
    expect(getAuthSessionRevision()).toBe(revision);
    expect(listener).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(removals).not.toHaveBeenCalled();
  });

  it("정규화 뒤 값이 같은 프로필도 불필요하게 다시 발행하지 않는다", () => {
    persistSession({ user: profile, token: null });
    const revision = getAuthSessionRevision();
    const listener = observeSession();
    const current = getAuthSession();
    expect(mergeCurrentSessionProfile({ ...profile, name: " 작가 ", role: " creator " })).toBe(current);
    expect(getAuthSessionRevision()).toBe(revision);
    expect(listener).not.toHaveBeenCalled();
  });

  it.each([
    ["name", "새 작가"],
    ["email", "changed@example.test"],
    ["image", "https://images.example.test/avatar.webp"],
    ["role", "viewer"],
  ] as const)("실제 %s 변경은 인증 세대와 알림을 한 번 갱신한다", (key, value) => {
    persistSession({ user: profile, token: null });
    const revision = getAuthSessionRevision();
    const listener = observeSession();
    const merged = mergeCurrentSessionProfile({ id: profile.id, [key]: value });
    expect(merged?.user).toEqual({ ...profile, [key]: value });
    expect(merged?.token).toBeNull();
    expect(getAuthSessionRevision()).toBe(revision + 1);
    expect(listener).toHaveBeenCalledOnce();
    expect(readClientSession()).toEqual(merged);
  });

  it("다른 사용자 프로필은 기존 세션·세대·알림을 바꾸지 않는다", () => {
    persistSession({ user: profile, token: null });
    const current = getAuthSession();
    const revision = getAuthSessionRevision();
    const listener = observeSession();
    expect(mergeCurrentSessionProfile({ ...profile, id: "different-fixture", role: "admin" })).toBe(current);
    expect(getAuthSessionRevision()).toBe(revision);
    expect(listener).not.toHaveBeenCalled();
  });

  it("같은 값의 명시적 재로그인은 여전히 인증 세대와 알림을 갱신한다", () => {
    persistSession({ user: profile, token: null });
    const revision = getAuthSessionRevision();
    const listener = observeSession();
    persistSession({ user: { ...profile }, token: null });
    expect(getAuthSessionRevision()).toBe(revision + 1);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("메모리 token이 null이어도 이전 클라이언트의 localStorage 세션만 정리한다", () => {
    persistSession({ user: profile, token: null });
    const current = getAuthSession();
    const revision = getAuthSessionRevision();
    const publicSession = sessionStorage.getItem(SESSION_KEY);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: profile, token: "local-only-fixture-token" }));
    localStorage.setItem("unrelated-profile-fixture", "preserve");
    const listener = observeSession();
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const removals = vi.spyOn(Storage.prototype, "removeItem");

    expect(mergeCurrentSessionProfile({ ...profile })).toBe(current);
    expect(getAuthSession()).toBe(current);
    expect(getAuthSession()?.token).toBeNull();
    expect(getAuthSessionRevision()).toBe(revision);
    expect(listener).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(removals).toHaveBeenCalledOnce();
    expect(removals).toHaveBeenCalledWith(SESSION_KEY);
    expect(removals.mock.contexts[0]).toBe(localStorage);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem("unrelated-profile-fixture")).toBe("preserve");
    expect(sessionStorage.getItem(SESSION_KEY)).toBe(publicSession);
  });

  it("프로필이 같아도 메모리와 이전 저장소의 legacy token은 정리한다", () => {
    const legacy = { user: { ...profile }, token: "opaque-fixture-token" };
    emitSession(legacy);
    localStorage.setItem(SESSION_KEY, JSON.stringify(legacy));
    expect(getAuthSession()?.token).toBe(legacy.token);
    const revision = getAuthSessionRevision();
    const listener = observeSession();
    expect(mergeCurrentSessionProfile({ ...profile })).toEqual({ user: profile, token: null });
    expect(getAuthSessionRevision()).toBe(revision + 1);
    expect(listener).toHaveBeenCalledOnce();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null")).toEqual({ user: profile, token: null });
  });
});
