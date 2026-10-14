import { describe, expect, it } from "vitest";

import {
  appRouteCanonicalGroupIds,
  appRoutes,
  isAppRouteGovernanceComplete,
  routeGovernanceFor,
  type AppRouteCanonicalGroupId,
} from "./route-manifest";

/**
 * 라우트 등록 계약 강제 지점 (BLUEPRINT §1.3, S1-8).
 *
 * 신규 표면이 선언 없이 manifest에 오르면 이 테스트가 CI에서 실패한다.
 * 타입 수준의 필수 필드가 1차 방어선이고, 이 런타임 검사가 any·캐스트로
 * 우회한 등록까지 잡는 2차 방어선이다.
 */
describe("route governance contract", () => {
  it("requires a complete governance declaration on every registered route", () => {
    for (const route of appRoutes) {
      expect(isAppRouteGovernanceComplete(route), route.path).toBe(true);
    }
  });

  it("keeps every surface role to a single non-empty sentence", () => {
    for (const route of appRoutes) {
      expect(route.surfaceRole.trim().length, route.path).toBeGreaterThan(0);
      expect(route.surfaceRole, route.path).not.toContain("\n");
    }
  });

  it("gives every canonical group exactly the hub its modules point back to", () => {
    const groupsWithHub = new Set<AppRouteCanonicalGroupId>();
    for (const route of appRoutes) {
      if (route.tier === "primary") {
        groupsWithHub.add(route.canonicalSurfaceId);
      }
    }
    // 정본 그룹은 primary 허브가 하나도 없으면 선언할 수 없다.
    for (const groupId of appRouteCanonicalGroupIds) {
      const members = appRoutes.filter(
        (route) => route.canonicalSurfaceId === groupId,
      );
      if (members.length > 0) {
        expect(groupsWithHub.has(groupId), groupId).toBe(true);
      }
    }
  });

  it("backfills the personal canonical group declared in §1.2", () => {
    const personal = appRoutes
      .filter((route) => route.canonicalSurfaceId === "personal")
      .map((route) => route.path)
      .sort();
    expect(personal).toEqual(["/library", "/market/library", "/me"]);
  });

  it("resolves governance declarations by path", () => {
    expect(routeGovernanceFor("/pricing")?.tier).toBe("primary");
    expect(routeGovernanceFor("/pricing")?.stage).toBe("account");
    expect(routeGovernanceFor("/not-a-route")).toBeUndefined();
  });
});
