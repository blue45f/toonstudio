import { describe, expect, it } from "vitest";

import {
  DIRECTORY_NAVIGATION_EXPOSURE_CONTEXT,
  NAVIGATION_TIER_RANK,
  SITE_NAVIGATION_GROUPS,
  SITE_NAVIGATION_ITEMS,
  SITE_UTILITY_NAVIGATION,
  directoryNavigationOrder,
  effectiveNavigationTier,
  resolveNavigationGroupsFor,
  resolveNavigationOrder,
} from "./site-navigation";

/**
 * S1-3 판정: 모바일 메뉴·푸터·⌘K 세 디렉터리 렌더러가 같은 정책 함수를
 * 소비하고, 순서·집합이 표면과 무관하게 일치한다.
 * 렌더러들은 resolveNavigationGroupsFor(그룹형: 모바일·푸터)와
 * resolveNavigationOrder(평면형: ⌘K)만 소비하므로, 두 함수의 계약을
 * 여기서 고정하면 세 표면의 순서·집합이 함께 고정된다.
 */
describe("directory tier rendering unification (S1-3)", () => {
  it("directory order covers every registry item exactly once", () => {
    const order = directoryNavigationOrder();
    expect(order.map((item) => item.id).sort()).toEqual(
      Object.values(SITE_NAVIGATION_ITEMS).map((item) => item.id).sort(),
    );
    expect(new Set(order.map((item) => item.id)).size).toBe(order.length);
  });

  it("grouped renderers keep the journey group order and lose no item", () => {
    const groups = resolveNavigationGroupsFor();
    expect(groups.map((group) => group.id)).toEqual(
      SITE_NAVIGATION_GROUPS.map((group) => group.id),
    );
    const groupedIds = groups.flatMap((group) => group.items.map((item) => item.id)).sort();
    const sourceIds = SITE_NAVIGATION_GROUPS.flatMap((group) =>
      group.items.map((item) => item.id),
    ).sort();
    expect(groupedIds).toEqual(sourceIds);
  });

  it("orders items by effective tier inside every group", () => {
    for (const group of resolveNavigationGroupsFor()) {
      const ranks = group.items.map(
        (item) => NAVIGATION_TIER_RANK[effectiveNavigationTier(item, DIRECTORY_NAVIGATION_EXPOSURE_CONTEXT)],
      );
      expect(ranks, group.id).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it("flat order is tier blocks in directory order, matching the grouped surfaces", () => {
    const flat = resolveNavigationOrder();
    // 집합: 평면형(⌘K)은 그룹 항목 + 유틸리티 + 전체 메뉴까지 전부 닿는다.
    expect(flat.map((item) => item.id).sort()).toEqual(
      Object.values(SITE_NAVIGATION_ITEMS).map((item) => item.id).sort(),
    );
    // 순서 1: tier 블록이 primary → contextual → directory 로 단조롭다.
    const ranks = flat.map(
      (item) => NAVIGATION_TIER_RANK[effectiveNavigationTier(item, DIRECTORY_NAVIGATION_EXPOSURE_CONTEXT)],
    );
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    // 순서 2: 그룹형 렌더러를 펼친 순서와, 같은 tier 안에서의 상대 순서가 같다.
    const groupedFlat = resolveNavigationGroupsFor().flatMap((group) => group.items);
    const directoryIndex = new Map(directoryNavigationOrder().map((item, index) => [item.id, index]));
    for (const tierItems of [groupedFlat, flat]) {
      const byTier = new Map<string, string[]>();
      for (const item of tierItems) {
        const tier = effectiveNavigationTier(item, DIRECTORY_NAVIGATION_EXPOSURE_CONTEXT);
        byTier.set(tier, [...(byTier.get(tier) ?? []), item.id]);
      }
      for (const ids of byTier.values()) {
        const indices = ids.map((id) => directoryIndex.get(id)!);
        expect(indices).toEqual([...indices].sort((a, b) => a - b));
      }
    }
    // 순서 3: primary 블록의 스냅샷 — 정본 디렉터리 순서대로다.
    const primaryIds = flat
      .filter((item) => effectiveNavigationTier(item, DIRECTORY_NAVIGATION_EXPOSURE_CONTEXT) === "primary")
      .map((item) => item.id);
    expect(primaryIds).toEqual([
      "explore",
      "studio",
      "virtual-studio",
      "production",
      "market",
      "learn",
      "community",
      "workspace-home",
      "home",
      "all-menu",
    ]);
  });

  it("renderer surface sets agree after documented href dedups only", () => {
    const grouped = resolveNavigationGroupsFor();
    const groupedIds = grouped.flatMap((group) => group.items.map((item) => item.id));
    const utilityIds = SITE_UTILITY_NAVIGATION.map((item) => item.id);
    // 모바일 메뉴: 그룹 목록에서 고정 행동(/create·/studio)과 href가 겹치는
    // make·studio를 빼지만 그 둘은 고정 행동 자체로 닿고, 유틸리티와
    // 전체 메뉴(메뉴를 여는 탭)까지 합치면 레지스트리 전체에 닿는다.
    const mobileIds = new Set([
      ...groupedIds,
      ...utilityIds,
      SITE_NAVIGATION_ITEMS.allMenu.id,
    ]);
    expect(mobileIds.size).toBe(Object.values(SITE_NAVIGATION_ITEMS).length);
    // 푸터: 그룹 − 브랜드 링크와 겹치는 href "/" + 유틸리티. 제작 기술이 포함돼
    // 모바일 메뉴와 집합이 어긋나지 않는다(S1-3에서 제외 해제).
    const footerIds = new Set([
      ...grouped.flatMap((group) =>
        group.items.filter((item) => item.href !== "/").map((item) => item.id),
      ),
      ...utilityIds,
    ]);
    expect(footerIds.has(SITE_NAVIGATION_ITEMS.technology.id)).toBe(true);
    expect(footerIds.has(SITE_NAVIGATION_ITEMS.home.id)).toBe(false);
    // ⌘K: 평면 순서 전체가 곧 집합이다.
    expect(new Set(resolveNavigationOrder().map((item) => item.id)).size).toBe(
      Object.values(SITE_NAVIGATION_ITEMS).length,
    );
  });

  it("does not mutate the shared group map while sorting", () => {
    const before = SITE_NAVIGATION_GROUPS.map((group) => group.items.map((item) => item.id).join(","));
    resolveNavigationGroupsFor();
    resolveNavigationOrder();
    const after = SITE_NAVIGATION_GROUPS.map((group) => group.items.map((item) => item.id).join(","));
    expect(after).toEqual(before);
  });
});
