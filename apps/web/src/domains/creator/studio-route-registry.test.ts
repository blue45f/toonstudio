import { describe, expect, it } from "vitest";

import {
  STUDIO_DISCOVERY_ROUTE_IDS,
  STUDIO_ROUTE_REGISTRY,
  auditStudioRouteRegistry,
  canonicalStudioRoutePath,
  resolveStudioRouteRegistration,
  studioProjectSectionPath,
  studioRoutePath,
  studioRouteRegistration,
} from "./studio-route-registry";

describe("Studio route registry", () => {
  it("keeps one valid canonical owner for every Studio route", () => {
    expect(auditStudioRouteRegistry()).toEqual([]);
    expect(new Set(STUDIO_ROUTE_REGISTRY.map((route) => route.id)).size)
      .toBe(STUDIO_ROUTE_REGISTRY.length);
    expect(new Set(STUDIO_ROUTE_REGISTRY.map((route) => route.pattern)).size)
      .toBe(STUDIO_ROUTE_REGISTRY.length);
  });

  it("builds canonical product and project destinations", () => {
    expect(studioRoutePath("home")).toBe("/studio");
    expect(studioRoutePath("personal-space")).toBe("/studio/space");
    expect(studioRoutePath("project-document")).toBe("/studio/p/:projectId/d/:documentId");
    expect(studioProjectSectionPath("series/한글", "story"))
      .toBe("/studio/p/series%2F%ED%95%9C%EA%B8%80/story");
  });

  it("uses the registry as the single authority for specialist Studio discovery routes", () => {
    expect(STUDIO_DISCOVERY_ROUTE_IDS).toEqual([
      "generate",
      "ai-lab",
      "ai-runtime",
      "character-convert",
      "ecosystem",
      "growth-ip",
      "environment-guide",
      "jobs",
      "pdf-workbench",
    ]);
    for (const id of STUDIO_DISCOVERY_ROUTE_IDS) {
      const registration = studioRouteRegistration(id);
      expect(studioRoutePath(id)).toBe(registration.pattern);
      expect(resolveStudioRouteRegistration(registration.pattern)?.id).toBe(id);
    }
  });

  it("resolves canonical and legacy entry points to the same route owner", () => {
    expect(resolveStudioRouteRegistration("/studio/new")?.id).toBe("new");
    expect(resolveStudioRouteRegistration("/studio/space")?.id).toBe("personal-space");
    // /make는 시작 시트(/create)의 별칭이라 스튜디오 진입점으로 해소되지 않는다.
    expect(resolveStudioRouteRegistration("/make?from=home")).toBeNull();
    expect(resolveStudioRouteRegistration("/brush-lab")?.id).toBe("asset-brush-new");
    expect(resolveStudioRouteRegistration("/studio/p/project-1/review")?.id)
      .toBe("project-review");
    expect(resolveStudioRouteRegistration("/studio/p/project-1/d/document-4")?.preserveRuntimeBy)
      .toBe("documentId");
  });

  it("returns static canonical replacements without leaking implementation routes", () => {
    // /make는 시작 시트(/create)의 별칭으로 옮겨가 스튜디오 레지스트리에서는 해소되지 않는다.
    expect(canonicalStudioRoutePath("/make")).toBeNull();
    expect(canonicalStudioRoutePath("/creator-hub/")).toBe("/studio");
    expect(canonicalStudioRoutePath("/studio/assets")).toBe("/studio/assets");
    expect(canonicalStudioRoutePath("/unrelated")).toBeNull();
  });

  it("rejects unsafe project identities", () => {
    expect(() => studioProjectSectionPath("..", "overview"))
      .toThrow("valid Studio project id");
    expect(() => studioProjectSectionPath("", "overview"))
      .toThrow("valid Studio project id");
  });
});
