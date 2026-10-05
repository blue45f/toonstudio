/**
 * 마켓 비교함 소유자 스코프 회귀 테스트.
 *
 * 비교 목록이 계정 구분 없이 레거시 단일 키를 공유해, 계정을 바꾸면 이전
 * 계정의 비교 목록이 그대로 보이고 그 위에 덮어쓸 수 있던 혼선을 막는다.
 * 소유자 키잉·claim 계약은 찜·학습 기록과 같다.
 * 세션은 hoisted 모의 상태로 몰아 테스트가 소유자 전환을 직접 일으킨다
 * (찜 소유자 스코프 테스트와 같은 방식).
 */

// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  compareStorageKey,
  MARKET_COMPARE_EVENT,
  MARKET_COMPARE_STORAGE_KEY,
  useMarketCompare,
} from "./use-market-compare";
import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

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

function storedIds(key: string): string[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  return (JSON.parse(raw) as CreatorMarketplaceResourceRecord[]).map((record) => record.id);
}

const first = CREATOR_MARKETPLACE_STARTER_RECORDS[0];
const second = CREATOR_MARKETPLACE_STARTER_RECORDS[1];
if (!first || !second) throw new Error("소재 fixture가 필요합니다");

beforeEach(() => {
  localStorage.clear();
  auth.userId = null;
  auth.listeners.clear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("마켓 비교함 소유자 스코프", () => {
  it("계정마다 비교 목록이 갈라져 저장되고 레거시 키는 건드리지 않는다", () => {
    auth.userId = "user-a";
    const { result } = renderHook(() => useMarketCompare());

    act(() => {
      expect(result.current.toggleCompare(first)).toBe("added");
    });
    expect(result.current.compareItems.map((record) => record.id)).toEqual([first.id]);
    expect(storedIds(compareStorageKey("user-a"))).toEqual([first.id]);
    expect(localStorage.getItem(MARKET_COMPARE_STORAGE_KEY)).toBeNull();

    // 다른 계정으로 바꾸면 빈 목록에서 시작하고, 그 저장은 자기 키로만 간다.
    actSwitch("user-b");
    expect(result.current.compareItems).toEqual([]);
    act(() => {
      expect(result.current.toggleCompare(second)).toBe("added");
    });
    expect(storedIds(compareStorageKey("user-b"))).toEqual([second.id]);
    expect(storedIds(compareStorageKey("user-a"))).toEqual([first.id]);
  });

  it("소유자를 오가도 각 파티션의 비교 목록이 그대로 복원된다", () => {
    auth.userId = "user-a";
    const { result } = renderHook(() => useMarketCompare());
    act(() => {
      result.current.toggleCompare(first);
    });

    actSwitch("user-b");
    expect(result.current.compareItems).toEqual([]);
    actSwitch("user-a");
    expect(result.current.compareItems.map((record) => record.id)).toEqual([first.id]);
    expect(result.current.isCompared(first.id)).toBe(true);
  });

  it("로그아웃하면 게스트 파티션으로 돌아가고 게스트 목록과 섞이지 않는다", () => {
    const { result } = renderHook(() => useMarketCompare());
    act(() => {
      result.current.toggleCompare(first);
    });
    expect(storedIds(compareStorageKey("guest"))).toEqual([first.id]);

    // 로그인하면 게스트 목록이 따라오지 않는다.
    actSwitch("user-a");
    expect(result.current.compareItems).toEqual([]);
    act(() => {
      result.current.toggleCompare(second);
    });

    // 로그아웃하면 게스트 파티션이 그대로 복원된다.
    actSwitch(null);
    expect(result.current.compareItems.map((record) => record.id)).toEqual([first.id]);
    expect(storedIds(compareStorageKey("user-a"))).toEqual([second.id]);
  });

  it("레거시 비교 목록은 첫 계정이 claim 하고 다음 계정은 claim 하지 않는다", () => {
    localStorage.setItem(MARKET_COMPARE_STORAGE_KEY, JSON.stringify([first]));
    auth.userId = "user-a";
    const { result } = renderHook(() => useMarketCompare());

    expect(result.current.compareItems.map((record) => record.id)).toEqual([first.id]);
    expect(localStorage.getItem(MARKET_COMPARE_STORAGE_KEY)).toBeNull();
    expect(storedIds(compareStorageKey("user-a"))).toEqual([first.id]);

    actSwitch("user-b");
    expect(result.current.compareItems).toEqual([]);
  });

  it("게스트는 레거시를 claim 하지 않고, 첫 로그인 계정이 이어서 claim 한다", () => {
    localStorage.setItem(MARKET_COMPARE_STORAGE_KEY, JSON.stringify([first]));
    const { result } = renderHook(() => useMarketCompare());

    expect(result.current.compareItems).toEqual([]);
    expect(localStorage.getItem(MARKET_COMPARE_STORAGE_KEY)).toBe(JSON.stringify([first]));
    expect(localStorage.getItem(compareStorageKey("guest"))).toBeNull();

    actSwitch("user-a");
    expect(result.current.compareItems.map((record) => record.id)).toEqual([first.id]);
    expect(localStorage.getItem(MARKET_COMPARE_STORAGE_KEY)).toBeNull();
  });

  it("다른 탭 변경은 활성 소유자 키일 때만 반영한다", () => {
    auth.userId = "user-a";
    const { result } = renderHook(() => useMarketCompare());
    act(() => {
      result.current.toggleCompare(first);
    });

    // 다른 소유자 키가 바뀌어도 화면은 흔들리지 않는다.
    act(() => {
      localStorage.setItem(compareStorageKey("user-b"), JSON.stringify([second]));
      window.dispatchEvent(new StorageEvent("storage", { key: compareStorageKey("user-b") }));
    });
    expect(result.current.compareItems.map((record) => record.id)).toEqual([first.id]);

    // 활성 소유자 키가 바뀌면 다시 읽어 반영한다.
    act(() => {
      localStorage.setItem(compareStorageKey("user-a"), JSON.stringify([second]));
      window.dispatchEvent(new StorageEvent("storage", { key: compareStorageKey("user-a") }));
    });
    expect(result.current.compareItems.map((record) => record.id)).toEqual([second.id]);

    // 같은 탭 동기화 이벤트도 현재 소유자 파티션을 다시 읽는다.
    act(() => {
      localStorage.setItem(compareStorageKey("user-a"), JSON.stringify([first, second]));
      window.dispatchEvent(new CustomEvent(MARKET_COMPARE_EVENT));
    });
    expect(result.current.compareItems.map((record) => record.id)).toEqual([first.id, second.id]);
  });
});
