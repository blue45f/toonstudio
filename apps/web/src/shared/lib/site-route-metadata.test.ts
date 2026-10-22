import { describe, expect, it } from "vitest";

import {
  canonicalSitePath,
  resolveSiteRouteMetadata,
  resolveSiteRouteNavigationContext,
  SITE_ROUTE_ALIASES,
} from "./site-route-metadata";

describe("site route metadata", () => {
  it.each(Object.entries(SITE_ROUTE_ALIASES))("normalizes alias %s to %s", (alias, canonical) => {
    expect(canonicalSitePath(`${alias}?from=old#section`)).toBe(canonical);
  });


  it("treats the creator-first home as Studio product metadata", () => {
    expect(resolveSiteRouteMetadata("/")).toMatchObject({
      product: "studio",
      purpose: "discover",
      access: "public",
    });
  });

  it("projects navigation context from canonical metadata and narrow docs exceptions", () => {
    for (const pathname of [
      "/",
      "/studio",
      "/production/projects/sample-project/review",
      "/market",
      "/showcase",
      "/collaborate",
      "/now",
      "/references",
      "/research/assets",
      "/learn/webtoon",
      "/about/technology/story",
      "/help/getting-started",
    ]) {
      expect(resolveSiteRouteNavigationContext(pathname), pathname).toBe("studio");
    }
    for (const pathname of ["/discover", "/ranking", "/community", "/fortune", "/privacy"]) {
      expect(resolveSiteRouteNavigationContext(pathname), pathname).toBe("spectrum");
    }
  });

  it.each([
    ["/publishing", "/studio/publish"],
    ["/shaper", "/studio/assets/characters/new"],
    ["/music", "/studio/assets/audio"],
    ["/brush-lab", "/studio/assets/brushes/new"],
  ])("keeps legacy creator alias %s in Studio navigation through canonical %s", (alias) => {
    expect(resolveSiteRouteNavigationContext(alias)).toBe("studio");
  });

  it("follows the start sheet context for the /make and /new aliases", () => {
    // 2026-10-11 사용성 웨이브: 두 별칭의 목적지가 시작 시트(/create)로 수렴하면서
    // 내비 컨텍스트도 목적지(공개 셸의 시작 시트)를 따르는 것이 일관된다.
    expect(canonicalSitePath("/make")).toBe("/create");
    expect(canonicalSitePath("/new")).toBe("/create");
    expect(resolveSiteRouteNavigationContext("/make")).toBe(resolveSiteRouteNavigationContext("/create"));
    expect(resolveSiteRouteNavigationContext("/new")).toBe(resolveSiteRouteNavigationContext("/create"));
  });

  it("classifies a project-bound desktop Studio surface", () => {
    expect(resolveSiteRouteMetadata("/studio/review")).toMatchObject({
      product: "studio",
      purpose: "create",
      access: "project",
      projectContext: "required",
    });
  });

  it("keeps current Studio primary routes and Production in the Studio product authority", () => {
    expect(resolveSiteRouteMetadata("/production")).toMatchObject({
      product: "studio",
      purpose: "manage",
      access: "public",
      projectContext: "optional",
    });
    expect(resolveSiteRouteMetadata("/studio/new")).toMatchObject({
      product: "studio",
      purpose: "create",
      projectContext: "none",
    });
    expect(resolveSiteRouteMetadata("/studio/assets")).toMatchObject({
      product: "studio",
      purpose: "manage",
      projectContext: "optional",
    });
  });

  it("classifies Production and Studio project families without duplicating runtime parsing", () => {
    expect(resolveSiteRouteMetadata("/production/projects/sample-project/review")).toMatchObject({
      product: "studio",
      purpose: "manage",
      access: "project",
      projectContext: "required",
    });
    expect(resolveSiteRouteMetadata("/studio/p/project-1/review")).toMatchObject({
      product: "studio",
      purpose: "manage",
      access: "project",
      projectContext: "required",
    });
  });

  it("classifies policy and discovery destinations independently", () => {
    expect(resolveSiteRouteMetadata("/privacy")).toMatchObject({ product: "docs", purpose: "trust", maturity: "stable" });
    expect(resolveSiteRouteMetadata("/ranking")).toMatchObject({ product: "spectrum", purpose: "discover", access: "public" });
    expect(resolveSiteRouteMetadata("/brand-film")).toMatchObject({ product: "studio", purpose: "discover", access: "public", device: "responsive" });
  });

  it("marks heavy and emerging workspaces before users enter them", () => {
    expect(resolveSiteRouteMetadata("/studio/3d/dcc/sculpt")).toMatchObject({
      maturity: "experimental",
      device: "desktop-first",
      tier: "labs",
    });
    expect(resolveSiteRouteMetadata("/studio/bg3d")).toMatchObject({
      maturity: "beta",
      device: "desktop-first",
    });
  });

  it("exposes the character anchor lab as an experimental labs route without a project", () => {
    for (const path of ["/studio/anchor-lab", "/studio/anchor-lab/", "/studio/anchor-lab?from=sitemap"]) {
      expect(resolveSiteRouteMetadata(path), path).toMatchObject({
        canonicalPath: "/studio/anchor-lab",
        product: "studio",
        purpose: "create",
        maturity: "experimental",
        tier: "labs",
        access: "public",
        projectContext: "none",
      });
    }
  });

  it("separates the core product, connected ecosystem and optional labs", () => {
    expect(resolveSiteRouteMetadata("/studio/new")).toMatchObject({ tier: "core" });
    expect(resolveSiteRouteMetadata("/ranking")).toMatchObject({ tier: "ecosystem" });
    expect(resolveSiteRouteMetadata("/studio/ai-lab")).toMatchObject({ tier: "labs" });
  });
});
