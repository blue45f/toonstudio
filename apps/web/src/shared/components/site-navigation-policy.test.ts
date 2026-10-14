import { describe, expect, it } from "vitest";

import {
  SITE_NAVIGATION_ITEMS,
  effectiveNavigationTier,
  resolveNavigationFor,
  type SiteNavigationExposureContext,
} from "./site-navigation";

const GUEST: SiteNavigationExposureContext = { signedIn: false, hasTeam: false, hasProject: false, isSeller: false };
const MEMBER: SiteNavigationExposureContext = { signedIn: true, hasTeam: false, hasProject: false, isSeller: false };
const TEAM_MEMBER: SiteNavigationExposureContext = { signedIn: true, hasTeam: true, hasProject: true, isSeller: false };

describe("site navigation exposure policy (S1-1 backfill)", () => {
  it("gives every registry item a complete policy", () => {
    for (const item of Object.values(SITE_NAVIGATION_ITEMS)) {
      expect(item.kind, item.id).toBeDefined();
      expect(item.tier, item.id).toBeDefined();
      expect(item.audience, item.id).toBeDefined();
    }
  });

  it("backfills primary as the union of today's primary surfaces and header top level", () => {
    const primaryIds = Object.values(SITE_NAVIGATION_ITEMS)
      .filter((item) => item.tier === "primary")
      .map((item) => item.id)
      .sort();
    // S1-2: virtual-studio·production은 primary에서 내려 이 목록에 없다.
    expect(primaryIds).toEqual(
      [
        "all-menu", "community", "explore", "home", "learn", "market",
        "studio", "workspace-home",
      ].sort(),
    );
  });

  it("S1-2: demotes the virtual-studio tool and gates collaboration contextually", () => {
    // 가상 스튜디오는 도구가 primary일 수 없다. 창작자 맥락에서는 contextual,
    // 게스트에게는 숨겨지지 않고 directory로 강등된다.
    expect(SITE_NAVIGATION_ITEMS.virtualStudio.tier).toBe("contextual");
    expect(effectiveNavigationTier(SITE_NAVIGATION_ITEMS.virtualStudio, MEMBER)).toBe("contextual");
    expect(effectiveNavigationTier(SITE_NAVIGATION_ITEMS.virtualStudio, GUEST)).toBe("directory");
    // 협업 대표(제작 관리)는 프로젝트가 있을 때만 contextual, 없으면 directory.
    expect(SITE_NAVIGATION_ITEMS.production.tier).toBe("contextual");
    expect(effectiveNavigationTier(SITE_NAVIGATION_ITEMS.production, TEAM_MEMBER)).toBe("contextual");
    expect(effectiveNavigationTier(SITE_NAVIGATION_ITEMS.production, MEMBER)).toBe("directory");
    expect(effectiveNavigationTier(SITE_NAVIGATION_ITEMS.production, GUEST)).toBe("directory");
  });

  it("never hides an item: unmet context only demotes it to directory", () => {
    for (const context of [GUEST, MEMBER, TEAM_MEMBER]) {
      const resolved = resolveNavigationFor(context);
      const total = resolved.primary.length + resolved.contextual.length + resolved.directory.length;
      expect(total).toBe(Object.values(SITE_NAVIGATION_ITEMS).length);
    }
    // 팀이 없는 사용자에게 협업 표면은 사라지지 않고 전체 메뉴로 강등된다.
    expect(effectiveNavigationTier(SITE_NAVIGATION_ITEMS.workspaceTeam, MEMBER)).toBe("directory");
    expect(effectiveNavigationTier(SITE_NAVIGATION_ITEMS.workspaceTeam, TEAM_MEMBER)).toBe("contextual");
    // 게스트에게 로그인 전용 표면도 같은 규칙을 따른다.
    expect(effectiveNavigationTier(SITE_NAVIGATION_ITEMS.me, GUEST)).toBe("directory");
    expect(effectiveNavigationTier(SITE_NAVIGATION_ITEMS.me, MEMBER)).toBe("contextual");
    // directory 항목은 어떤 맥락에서도 승격되지 않는다.
    expect(effectiveNavigationTier(SITE_NAVIGATION_ITEMS.fortune, TEAM_MEMBER)).toBe("directory");
  });
});
