// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMarketCollections } from "./use-market-collections";
import { useMarketFollowedCreators } from "./use-market-followed-creators";
import { useMarketRecentlyViewed } from "./use-market-recently-viewed";
import {
  buildMarketQuerySearchParams,
  useMarketSearchHistory,
} from "./use-market-search-history";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

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

describe("마켓 탐색·무드보드 소유자 격리 훅", () => {
  it("최근 검색어와 필터 프리셋을 계정별로 분리 저장하고 URLSearchParams를 직렬화한다", () => {
    auth.userId = "user-a";
    const { result } = renderHook(() => useMarketSearchHistory());

    act(() => {
      result.current.recordRecentSearch("  잉크 브러시  ");
      result.current.recordRecentSearch("배경 3D");
      result.current.recordRecentSearch("잉크 브러시");
      result.current.saveFilterPreset("No-AI 상업 브러시", {
        kind: "brush",
        containsAi: false,
        commercial: true,
        engine: "canvas2d",
      });
    });

    expect(result.current.recentSearches).toEqual(["잉크 브러시", "배경 3D"]);
    expect(result.current.savedPresets).toHaveLength(1);
    const params = buildMarketQuerySearchParams(result.current.savedPresets[0]!.query);
    expect(params.get("kind")).toBe("brush");
    expect(params.get("containsAi")).toBe("false");
    expect(params.get("commercial")).toBe("true");
    expect(params.get("engine")).toBe("canvas2d");

    actSwitch("user-b");
    expect(result.current.recentSearches).toEqual([]);
    expect(result.current.savedPresets).toEqual([]);

    actSwitch("user-a");
    expect(result.current.recentSearches).toEqual(["잉크 브러시", "배경 3D"]);
  });

  it("최근 본 소재 스냅샷을 중복 없이 최신순으로 기록하고 계정별로 격리한다", () => {
    auth.userId = "user-a";
    const { result } = renderHook(() => useMarketRecentlyViewed());

    act(() => {
      result.current.recordRecentlyViewed(first);
      result.current.recordRecentlyViewed(second);
      result.current.recordRecentlyViewed(first);
    });

    expect(result.current.recentlyViewed.map((item) => item.id)).toEqual([
      first.id,
      second.id,
    ]);

    actSwitch("user-b");
    expect(result.current.recentlyViewed).toEqual([]);
  });

  it("배급자 팔로우 상태를 소문자 정규화 ID로 토글하고 계정별로 격리한다", () => {
    auth.userId = "user-a";
    const { result } = renderHook(() => useMarketFollowedCreators());

    act(() => {
      expect(
        result.current.toggleFollowCreator({
          id: "00000000-0000-4000-8000-000000000001".toUpperCase(),
          name: "ToonSpectrum 공식",
          avatar: null,
        }),
      ).toBe(true);
    });

    expect(result.current.isFollowingCreator("00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(result.current.followedCount).toBe(1);

    actSwitch("user-b");
    expect(result.current.followedCount).toBe(0);
  });

  it("무드보드 컬렉션과 제작 메모를 생성·할당·수정하고 계정별로 격리한다", () => {
    auth.userId = "user-a";
    const { result } = renderHook(() => useMarketCollections());

    let collectionId = "";
    act(() => {
      const created = result.current.createCollection("로판 1화 배경 세트", "성당 + 조명");
      expect(created).not.toBeNull();
      collectionId = created!.id;
    });

    act(() => {
      result.current.toggleResourceInCollection(collectionId, first.id);
      result.current.setResourceMemo(first.id, "  회차 하단 출처 표기 불필요 확인  ");
    });

    expect(result.current.collections[0]?.resourceIds).toEqual([first.id]);
    expect(result.current.memos[first.id]).toBe("회차 하단 출처 표기 불필요 확인");

    actSwitch("user-b");
    expect(result.current.collections).toEqual([]);
    expect(result.current.memos).toEqual({});
  });
});
