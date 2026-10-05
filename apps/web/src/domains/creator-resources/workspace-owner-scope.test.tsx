/**
 * 크리에이터 워크스페이스 소유자 스코프 회귀 테스트.
 *
 * 워크스페이스(기획서·저장 보드)가 계정 구분 없이 레거시 단일 키를
 * 공유해, 계정을 바꾸면 이전 계정의 보드가 그대로 보이고 그 위에
 * 덮어쓸 수 있던 혼선을 막는다. 소유자 키잉·claim 계약은 학습
 * 기록·마켓 찜과 같다. 세션은 hoisted 모의 상태로 몰아 테스트가
 * 소유자 전환을 직접 일으킨다(찜 소유자 스코프 테스트와 같은 방식).
 */

// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCreatorWorkspace } from "./workspace";
import {
  CREATOR_WORKSPACE_KEY,
  creatorWorkspaceStorageKey,
} from "@/shared/lib/creator-workspace-persistence";

import type { CreatorResource } from "@/shared/lib/creator-resources";

const auth = vi.hoisted(() => ({
  userId: null as string | null,
  listeners: new Set<(session: { user: { id: string } } | null) => void>(),
}));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => auth.userId,
  listeners: auth.listeners,
}));

function actSwitch(userId: string | null) {
  act(() => {
    auth.userId = userId;
    const session = userId ? { user: { id: userId } } : null;
    auth.listeners.forEach((listener) => listener(session));
  });
}

const item: CreatorResource = {
  id: "met:costume",
  provider: "met",
  title: "Costume reference",
  creator: "Creator",
  description: "Detailed visual reference",
  sourceUrl: "https://www.metmuseum.org/art/collection/search/1",
  license: "CC0",
  licenseUrl: "",
  credit: "Provider",
  fetchedAt: "2026-09-08T00:00:00.000Z",
};

function seedLegacy() {
  localStorage.setItem(CREATOR_WORKSPACE_KEY, JSON.stringify({
    version: 1,
    saved: [item],
    story: { title: "레거시 기획" },
    checks: [],
  }));
}

beforeEach(() => {
  localStorage.clear();
  auth.userId = null;
  auth.listeners.clear();
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
    locks: { request: async (_name: string, _options: unknown, operation: () => unknown) => operation() },
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("크리에이터 워크스페이스 소유자 스코프", () => {
  it("계정마다 보드가 갈라져 저장되고 레거시 키는 건드리지 않는다", async () => {
    auth.userId = "user-a";
    const { result } = renderHook(() => useCreatorWorkspace());
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      await result.current.update((current) => ({ ...current, saved: [item] }));
    });
    expect(JSON.parse(localStorage.getItem(creatorWorkspaceStorageKey("user-a"))!).saved).toHaveLength(1);
    expect(localStorage.getItem(CREATOR_WORKSPACE_KEY)).toBeNull();
    expect(localStorage.getItem(creatorWorkspaceStorageKey("user-b"))).toBeNull();

    actSwitch("user-b");
    await waitFor(() => expect(result.current.workspace.saved).toHaveLength(0));

    actSwitch("user-a");
    await waitFor(() => expect(result.current.workspace.saved).toHaveLength(1));
    expect(result.current.workspace.saved[0]?.id).toBe("met:costume");
  });

  it("레거시는 게스트가 claim 하지 않고 첫 계정이 읽는 자리에서 claim 한다", async () => {
    seedLegacy();
    const { result } = renderHook(() => useCreatorWorkspace());
    await waitFor(() => expect(result.current.ready).toBe(true));
    // 게스트 파티션은 빈 채로 시작하고 레거시는 그대로 남는다.
    expect(result.current.workspace.saved).toHaveLength(0);
    expect(localStorage.getItem(CREATOR_WORKSPACE_KEY)).not.toBeNull();
    expect(localStorage.getItem(creatorWorkspaceStorageKey("guest"))).toBeNull();

    actSwitch("user-a");
    await waitFor(() => expect(result.current.workspace.saved).toHaveLength(1));
    expect(result.current.workspace.story.title).toBe("레거시 기획");
    // claim 으로 레거시는 소비되고, 두 번째 계정은 또 claim 하지 않는다.
    expect(localStorage.getItem(CREATOR_WORKSPACE_KEY)).toBeNull();
    expect(localStorage.getItem(creatorWorkspaceStorageKey("user-a"))).not.toBeNull();

    actSwitch("user-b");
    await waitFor(() => expect(result.current.workspace.saved).toHaveLength(0));
  });

  it("로그아웃하면 게스트 파티션으로 돌아가 계정 보드가 보이지 않는다", async () => {
    auth.userId = "user-a";
    const { result } = renderHook(() => useCreatorWorkspace());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.update((current) => ({ ...current, saved: [item] }));
    });
    expect(result.current.workspace.saved).toHaveLength(1);

    actSwitch(null);
    await waitFor(() => expect(result.current.workspace.saved).toHaveLength(0));
    // 계정 파티션의 기록은 지워지지 않고 그 자리에 남는다.
    expect(JSON.parse(localStorage.getItem(creatorWorkspaceStorageKey("user-a"))!).saved).toHaveLength(1);
  });
});
