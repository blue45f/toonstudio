/**
 * 학습 실습 기록 소유자 스코프 회귀 테스트.
 *
 * 실습 미션 기록이 계정 구분 없이 레거시 단일 키를 공유해, 계정을 바꾸면
 * 이전 계정의 시작·완료 기록이 그대로 보이고 그 위에 덮어쓸 수 있던
 * 혼선을 막는다. 소유자 키잉·claim 계약은 진도·노트/수강 등록과 같다.
 */

// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PRACTICE_STORAGE_KEY,
  emptyPracticeProgress,
  loadPracticeProgress,
  markMissionStarted,
  practiceStorageKey,
  savePracticeProgress,
  type PracticeProgress,
} from "./learning-practice";
import { useLearningPractice } from "./use-learning-practice";

const NOW = "2026-10-02T00:00:00.000Z";

// 세션은 hoisted 모의 상태로 몰아, 테스트가 소유자 전환을 직접 일으킨다
// (character-chat 소유자 스코프 테스트와 같은 방식).
const auth = vi.hoisted(() => ({
  userId: null as string | null,
  listeners: new Set<(session: { user: { id: string } } | null) => void>(),
}));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => auth.userId,
  listeners: auth.listeners,
}));

function switchSession(userId: string | null) {
  auth.userId = userId;
  const session = userId ? { user: { id: userId } } : null;
  auth.listeners.forEach((listener) => listener(session));
}
function actSwitch(userId: string | null) {
  act(() => {
    switchSession(userId);
  });
}

function memoryStorage() {
  const memory = new Map<string, string>();
  return {
    memory,
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };
}

const started = (lessonId: string): PracticeProgress =>
  markMissionStarted(emptyPracticeProgress(), lessonId, NOW);

describe("실습 기록 소유자 스코프 (저장 함수)", () => {
  it("계정마다 실습 기록이 갈라져 저장되고 레거시 키는 건드리지 않는다", () => {
    const storage = memoryStorage();
    expect(savePracticeProgress(storage, started("story-board"), "user-a")).toBe(true);

    expect(storage.memory.has(practiceStorageKey("user-a"))).toBe(true);
    expect(storage.memory.has(PRACTICE_STORAGE_KEY)).toBe(false);
    expect(loadPracticeProgress(storage, "user-a").missions["story-board"]?.startedAt).toBe(NOW);
    expect(loadPracticeProgress(storage, "user-b").missions).toEqual({});
    expect(loadPracticeProgress(storage, "guest").missions).toEqual({});

    // 다른 계정의 저장이 앞 계정의 기록을 덮지 않는다.
    expect(savePracticeProgress(storage, started("inking"), "user-b")).toBe(true);
    expect(loadPracticeProgress(storage, "user-a").missions["story-board"]?.startedAt).toBe(NOW);
    expect(loadPracticeProgress(storage, "user-a").missions.inking).toBeUndefined();
  });

  it("소유자를 되돌리면 그 계정의 저장된 기록이 다시 보인다", () => {
    const storage = memoryStorage();
    savePracticeProgress(storage, started("story-board"), "user-a");

    expect(loadPracticeProgress(storage, "user-b").missions).toEqual({});
    expect(loadPracticeProgress(storage, "user-a")).toEqual(started("story-board"));
  });

  it("레거시(무스코프) 기록은 첫 계정이 claim 하고 게스트에게는 보이지 않는다", () => {
    const storage = memoryStorage();
    savePracticeProgress(storage, started("story-board"));

    // 게스트는 claim 하지 않는다 — 레거시는 그대로 남고 게스트 파티션은 비어 있다.
    expect(loadPracticeProgress(storage, "guest").missions).toEqual({});
    expect(storage.memory.has(PRACTICE_STORAGE_KEY)).toBe(true);

    // 첫 로그인 계정이 읽는 자리에서 claim 한다: 스코프 키로 옮기고 레거시를 지운다.
    expect(loadPracticeProgress(storage, "user-a")).toEqual(started("story-board"));
    expect(storage.memory.has(practiceStorageKey("user-a"))).toBe(true);
    expect(storage.memory.has(PRACTICE_STORAGE_KEY)).toBe(false);

    // claim은 레거시를 소비한다 — 다른 계정이 같은 기록을 또 가져가지 않는다.
    expect(loadPracticeProgress(storage, "user-b").missions).toEqual({});
  });
});

// 훅의 상태는 반환값을 붙잡는 대신 화면으로 드러내 읽는다(컴포넌트 순수성 유지).
function Probe() {
  const practice = useLearningPractice();
  return (
    <div>
      <output data-testid="missions">{JSON.stringify(practice.progress.missions)}</output>
      <output data-testid="warning">{practice.warning}</output>
      <button type="button" onClick={() => practice.startMission("story-board")}>
        보드 시작
      </button>
      <button type="button" onClick={() => practice.startMission("inking")}>
        잉킹 시작
      </button>
    </div>
  );
}
function shownMissions(): Record<string, { startedAt: string | null; completedAt: string | null }> {
  return JSON.parse(screen.getByTestId("missions").textContent ?? "{}") as Record<
    string,
    { startedAt: string | null; completedAt: string | null }
  >;
}
function shownWarning(): string {
  return screen.getByTestId("warning").textContent ?? "";
}

describe("실습 기록 소유자 스코프 (훅 세션 바인딩)", () => {
  beforeEach(() => {
    auth.userId = null;
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("세션이 바뀌면 그 소유자의 파티션으로 갈아끼우고 로그아웃하면 게스트로 돌아간다", () => {
    render(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "보드 시작" }));
    expect(shownMissions()["story-board"]?.startedAt).toBeTruthy();
    expect(window.localStorage.getItem(practiceStorageKey("guest"))).toContain("story-board");
    expect(window.localStorage.getItem(PRACTICE_STORAGE_KEY)).toBeNull();

    actSwitch("user-a");
    expect(shownMissions()).toEqual({});
    fireEvent.click(screen.getByRole("button", { name: "잉킹 시작" }));
    expect(
      JSON.parse(window.localStorage.getItem(practiceStorageKey("user-a")) ?? "{}").missions.inking,
    ).toBeTruthy();
    expect(
      JSON.parse(window.localStorage.getItem(practiceStorageKey("guest")) ?? "{}").missions.inking,
    ).toBeUndefined();

    actSwitch(null);
    expect(shownMissions()["story-board"]?.startedAt).toBeTruthy();
    expect(shownMissions().inking).toBeUndefined();
  });

  it("레거시 기록은 게스트가 아닌 첫 로그인 계정이 claim 한다", () => {
    window.localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(started("story-board")));
    render(<Probe />);

    // 게스트 마운트에서는 claim 하지 않는다.
    expect(shownMissions()).toEqual({});
    expect(window.localStorage.getItem(PRACTICE_STORAGE_KEY)).not.toBeNull();

    actSwitch("user-a");
    expect(shownMissions()["story-board"]?.startedAt).toBe(NOW);
    expect(window.localStorage.getItem(PRACTICE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(practiceStorageKey("user-a"))).not.toBeNull();
  });

  it("저장되지 못한 변경은 소유자 전환 때 다음 소유자에게 넘어가지 않는다", () => {
    render(<Probe />);
    const failing = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    fireEvent.click(screen.getByRole("button", { name: "보드 시작" }));
    // 저장은 실패했지만 메모리에는 변경이 남아 있고 경고가 붙는다.
    expect(shownWarning()).not.toBe("");
    expect(shownMissions()["story-board"]).toBeTruthy();
    failing.mockRestore();

    actSwitch("user-b");
    expect(shownMissions()).toEqual({});
    // 실패한 기록은 어느 파티션에도 쓰이지 않았다.
    expect(window.localStorage.getItem(practiceStorageKey("user-b"))).toBeNull();
    expect(window.localStorage.getItem(practiceStorageKey("guest"))).toBeNull();
  });
});
