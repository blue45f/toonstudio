import { describe, expect, it } from "vitest";

import { productionRoutes } from "./production.routes";

describe("production route ownership", () => {
  it("owns the complete planning, production, handoff, review, procurement and rights surfaces", () => {
    const paths = productionRoutes.map((route) => route.path);
    expect(paths).toEqual(expect.arrayContaining([
      "/production",
      "/production/projects/:projectId/overview",
      "/production/projects/:projectId/planning",
      "/production/projects/:projectId/episodes",
      "/production/projects/:projectId/manuscripts",
      "/production/projects/:projectId/production",
      "/production/projects/:projectId/schedule",
      "/production/projects/:projectId/risks",
      "/production/projects/:projectId/handoff",
      "/production/projects/:projectId/review",
      "/production/projects/:projectId/activity",
      "/production/projects/:projectId/procurement",
      "/production/projects/:projectId/rights",
      "/production/projects/:projectId/settings",
      "/production/projects/:projectId/episodes/:episodeId",
      "/team/people",
      "/team/organization",
      "/team/people/join",
      "/team/people/:workspaceId",
      "/team/people/:workspaceId/usage",
    ]));
    expect(new Set(productionRoutes.map((route) => route.id)).size).toBe(productionRoutes.length);
  });

  it("routes workspace usage paths to a dedicated screen, not the detail page", () => {
    const typeById = new Map(productionRoutes.map((route) => [route.id, route.element.type]));
    // F-R1-B08-1: /usage가 상세와 같은 컴포넌트를 렌더하면 사용량 전용 화면이 없는 것과 같다.
    expect(typeById.get("team-people-usage")).not.toBe(typeById.get("team-people-detail"));
  });

  it("keeps the legacy production workspace family as redirects, not page renders", () => {
    const typeById = new Map(productionRoutes.map((route) => [route.id, route.element.type]));
    // O-03 일원화: 옛 패밀리는 페이지를 직접 렌더하지 않고 정식 /team/people로 넘긴다.
    // 실제 도착 경로는 production-workspace-redirect.test.tsx가 렌더링으로 고정한다.
    expect(typeById.get("production-workspace-detail")).not.toBe(typeById.get("team-people-detail"));
    expect(typeById.get("production-workspace-usage")).not.toBe(typeById.get("team-people-usage"));
    expect(typeById.get("production-workspace-join")).not.toBe(typeById.get("team-people-join"));
  });
});
