// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatorRoleId } from "@/shared/lib/creator-role-contract";
import { GLOBAL_CREATOR_ROLE_WORKSPACE_KEY, normalizeCreatorRoleWorkspacePreference, type CreatorRoleWorkspaceSnapshot } from "@/shared/lib/creator-role-workspace-contract";
import { useStudioMenubarRole } from "./use-studio-menubar-role";

const io = vi.hoisted(() => ({ actor: "A" as string | null, revision: 1, status: "authenticated", get: vi.fn(),
  authListeners: new Set<() => void>(), roleListeners: new Map<string, Set<() => void>>() }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: () => ({ status: io.status }) }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({ getAuthUserId: () => io.actor,
  getAuthSessionRevision: () => io.revision, listeners: io.authListeners }));
vi.mock("@/platform/creator-role-workspace-client", () => ({ getCreatorRoleWorkspace: io.get }));
vi.mock("@/shared/lib/creator-role-workspace-store", () => ({ subscribeCreatorRoleWorkspace: (key: string, notify: () => void) => {
  const set = io.roleListeners.get(key) ?? new Set<() => void>(); set.add(notify); io.roleListeners.set(key, set);
  return () => { set.delete(notify); };
} }));
function snapshot(key: string, role: CreatorRoleId | null): CreatorRoleWorkspaceSnapshot {
  return { projectKey: key, revision: 1, document: normalizeCreatorRoleWorkspacePreference({ activeRole: role }), updatedAt: null, source: "server" };
}
function auth(actor: string | null) {
  act(() => { io.actor = actor; io.status = actor ? "authenticated" : "unauthenticated"; io.revision += 1;
    for (const notify of io.authListeners) notify(); });
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Promise 초기화 전입니다."); };
  const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve };
}
beforeEach(() => { io.actor = "A"; io.revision = 1; io.status = "authenticated"; io.get.mockReset();
  io.roleListeners.clear(); window.history.replaceState({}, "", "/studio/p/project-A/d/document-1"); });
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });
describe("실제 메뉴의 인증 세대와 프로젝트 역할", () => {
  it("정본 A/B 문서 주소를 서로 다른 project key로 조회하고 전역 역할을 fallback한다", async () => {
    io.get.mockImplementation(async (key: string) => snapshot(key, key === GLOBAL_CREATOR_ROLE_WORKSPACE_KEY ? "story"
      : key === "project:project-A" ? "background-assistant" : null));
    const view = renderHook(() => useStudioMenubarRole());
    await waitFor(() => expect(view.result.current).toBe("background-assistant"));
    expect(io.get.mock.calls.map((call) => call[0])).toContain("project:project-A");
    window.history.replaceState({}, "", "/studio/p/project-B/d/document-2"); view.rerender();
    await waitFor(() => expect(view.result.current).toBe("story"));
    expect(io.get.mock.calls.map((call) => call[0])).toContain("project:project-B");
    expect(io.get.mock.calls.map((call) => call[0])).not.toContain("draft");
  });
  it("A 로그아웃 때 이전 값을 즉시 숨기고 B의 서버 설정으로만 메뉴를 만든다", async () => {
    io.get.mockImplementation(async (key: string) => snapshot(key, io.actor === "A" ? "background-assistant" : "effect-assistant"));
    const view = renderHook(() => useStudioMenubarRole());
    await waitFor(() => expect(view.result.current).toBe("background-assistant"));
    auth(null); expect(view.result.current).toBeNull();
    const before = io.get.mock.calls.length; auth("B"); expect(view.result.current).toBeNull();
    await waitFor(() => expect(view.result.current).toBe("effect-assistant"));
    expect(io.get.mock.calls.length).toBeGreaterThan(before);
  });
  it("계정 전환 뒤 늦게 도착한 A 응답이 B의 표시를 덮어쓰지 않는다", async () => {
    const pending = deferred<CreatorRoleWorkspaceSnapshot>();
    io.get.mockImplementation((key: string) => io.actor === "A" ? pending.promise : Promise.resolve(snapshot(key, "effect-assistant")));
    const view = renderHook(() => useStudioMenubarRole()); auth(null); auth("B");
    await waitFor(() => expect(view.result.current).toBe("effect-assistant"));
    await act(async () => { pending.resolve(snapshot(GLOBAL_CREATOR_ROLE_WORKSPACE_KEY, "background-assistant")); await pending.promise; });
    expect(view.result.current).toBe("effect-assistant");
  });
  it("인증 전에는 캐시나 서버 역할을 표시하지 않고 설정 알림은 현재 계정으로 재조회한다", async () => {
    io.status = "unauthenticated"; io.actor = null;
    io.get.mockImplementation(async (key: string) => snapshot(key, "background-assistant"));
    const view = renderHook(() => useStudioMenubarRole()); expect(view.result.current).toBeNull(); expect(io.get).not.toHaveBeenCalled();
    auth("B"); await waitFor(() => expect(view.result.current).toBe("background-assistant"));
    io.get.mockImplementation(async (key: string) => snapshot(key, "effect-assistant"));
    act(() => { for (const notify of io.roleListeners.get("project:project-A") ?? []) notify(); });
    await waitFor(() => expect(view.result.current).toBe("effect-assistant"));
  });
});
