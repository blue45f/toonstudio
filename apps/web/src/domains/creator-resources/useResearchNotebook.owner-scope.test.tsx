/**
 * 리서치 노트(판단 노트) 소유자 스코프 회귀 테스트.
 *
 * 판단 노트가 계정 구분 없이 레거시 단일 키를 공유해, 계정을 바꾸면
 * 이전 계정의 노트가 그대로 보이고 그 위에 덮어쓸 수 있던 혼선을
 * 막는다. 소유자 키잉·claim 계약은 학습 기록·마켓 찜과 같다.
 */

// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addResearchNotebookEntry,
  RESEARCH_NOTEBOOK_KEY,
  researchNotebookStorageKey,
} from "./research-notebook";
import { useResearchNotebook } from "./useResearchNotebook";

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

function seedLegacy() {
  localStorage.setItem(RESEARCH_NOTEBOOK_KEY, JSON.stringify({
    version: 1,
    entries: [{
      id: "legacy-note",
      kind: "observation",
      text: "레거시 관찰",
      sourceIds: [],
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
    }],
  }));
}

beforeEach(() => {
  localStorage.clear();
  auth.userId = null;
  auth.listeners.clear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("리서치 노트 소유자 스코프", () => {
  it("계정마다 노트가 갈라져 저장되고 소유자 왕복 시 복원된다", async () => {
    auth.userId = "user-a";
    const { result } = renderHook(() => useResearchNotebook());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      result.current.update((current) => addResearchNotebookEntry(current, {
        id: "note-a",
        kind: "observation",
        text: "계정 A의 관찰",
        now: new Date("2026-09-09T03:00:00.000Z"),
      }));
    });
    expect(JSON.parse(localStorage.getItem(researchNotebookStorageKey("user-a"))!).entries).toHaveLength(1);
    expect(localStorage.getItem(RESEARCH_NOTEBOOK_KEY)).toBeNull();

    actSwitch("user-b");
    await waitFor(() => expect(result.current.notebook.entries).toHaveLength(0));

    actSwitch("user-a");
    await waitFor(() => expect(result.current.notebook.entries).toHaveLength(1));
    expect(result.current.notebook.entries[0]?.text).toBe("계정 A의 관찰");
  });

  it("레거시는 게스트가 claim 하지 않고 첫 계정이 claim 한다", async () => {
    seedLegacy();
    const { result } = renderHook(() => useResearchNotebook());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.notebook.entries).toHaveLength(0);
    expect(localStorage.getItem(RESEARCH_NOTEBOOK_KEY)).not.toBeNull();

    actSwitch("user-a");
    await waitFor(() => expect(result.current.notebook.entries).toHaveLength(1));
    expect(result.current.notebook.entries[0]?.text).toBe("레거시 관찰");
    expect(localStorage.getItem(RESEARCH_NOTEBOOK_KEY)).toBeNull();

    actSwitch("user-b");
    await waitFor(() => expect(result.current.notebook.entries).toHaveLength(0));
  });

  it("로그아웃하면 게스트 파티션으로 돌아가 계정 노트가 보이지 않는다", async () => {
    auth.userId = "user-a";
    const { result } = renderHook(() => useResearchNotebook());
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => {
      result.current.update((current) => addResearchNotebookEntry(current, {
        id: "note-a",
        kind: "decision",
        text: "계정 A의 결정",
        now: new Date("2026-09-09T03:00:00.000Z"),
      }));
    });
    expect(result.current.notebook.entries).toHaveLength(1);

    actSwitch(null);
    await waitFor(() => expect(result.current.notebook.entries).toHaveLength(0));
    expect(JSON.parse(localStorage.getItem(researchNotebookStorageKey("user-a"))!).entries).toHaveLength(1);
  });
});
