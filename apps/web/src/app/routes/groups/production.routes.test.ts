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
    expect(typeById.get("production-workspace-usage")).not.toBe(typeById.get("production-workspace-detail"));
    expect(typeById.get("team-people-usage")).toBe(typeById.get("production-workspace-usage"));
  });
});
