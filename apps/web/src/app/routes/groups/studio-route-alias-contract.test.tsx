// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { cleanup, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, matchRoutes, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { canonicalSitePath } from "@/shared/lib/site-route-metadata";
import { STUDIO_ROUTE_REGISTRY } from "../../../domains/creator/studio-route-registry";
import { appRoutes } from "./app-routes";
import { creatorRoutes } from "./creator.routes";

afterEach(() => {
  cleanup();
});

/**
 * 레지스트리 별칭 계약 (F-B21-1 재발 방지).
 *
 * `STUDIO_ROUTE_REGISTRY`의 `aliases`는 선언만으로 라우팅이 생기지 않는다 —
 * 실제 전이는 라우트 테이블에 별도 항목(Navigate 또는 와일드카드 내부 처리)이
 * 있어야 한다. /motion-webtoon이 선언만 있고 항목이 없어 전역 404로 떨어진
 * 사고가 있어서, 선언된 별칭 전수가 not-found가 아닌 실제 라우트에 닿는지를
 * 고정한다.
 */
describe("studio route registry alias contract", () => {
  it("resolves every declared registry alias to a real route, never the global 404", () => {
    const unresolved: string[] = [];
    for (const registration of STUDIO_ROUTE_REGISTRY) {
      for (const alias of registration.aliases) {
        const matchedId = matchRoutes(appRoutes, alias)?.at(-1)?.route.id;
        if (!matchedId || matchedId === "not-found") {
          unresolved.push(`${registration.id}: ${alias}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it.each([
    ["/character-lab", "/studio/character", "creator-character-lab"],
    ["/studio/character-lab", "/studio/character", "creator-studio-character-lab"],
    ["/research/character-3d", "/studio/character", "creator-research-character-3d"],
    ["/character-shaper", "/studio/assets/characters/new", "creator-character-shaper-alias"],
    ["/shaper", "/studio/assets/characters/new", "creator-character-shaper"],
  ])("캐릭터 북마크 %s의 작업 문맥을 보존한다", async (alias, pathname, id) => {
    const route = matchRoutes(appRoutes, alias)?.at(-1)?.route;
    if (!route || route.path !== alias) throw new Error(`누락된 캐릭터 별칭: ${alias}`);
    expect(route.id).toBe(id);
    expect(canonicalSitePath(alias)).toBe(pathname);
    const state = { from: "library" };
    const router = createMemoryRouter([
      { path: alias, element: route.element },
      { path: pathname, element: <p>캐릭터</p> },
    ], { initialEntries: [{ pathname: alias, search: "?assetId=hero&editor=open", hash: "#look", state }] });
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(router.state.location.pathname).toBe(pathname));
    expect(router.state.location).toMatchObject({ search: "?assetId=hero&editor=open", hash: "#look", state });
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("matches /motion-webtoon to its dedicated alias route", () => {
    expect(matchRoutes(appRoutes, "/motion-webtoon")?.at(-1)?.route.id).toBe("creator-motion-webtoon");
    expect(matchRoutes(appRoutes, "/studio/motion-webtoon")?.at(-1)?.route.id).toBe(
      "creator-studio-motion-webtoon",
    );
  });

  it("replaces /motion-webtoon with the canonical /studio/motion-webtoon", async () => {
    const aliasRoute = creatorRoutes.find((route) => route.id === "creator-motion-webtoon");
    expect(aliasRoute).toBeDefined();
    const router = createMemoryRouter(
      [
        { path: aliasRoute!.path, element: aliasRoute!.element },
        { path: "/studio/motion-webtoon", element: null },
        { path: "*", element: null },
      ],
      { initialEntries: ["/motion-webtoon"] },
    );
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(router.state.location.pathname).toBe("/studio/motion-webtoon"));
    expect(router.state.historyAction).toBe("REPLACE");
  });
});

function readRepoFile(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function readAppLocale(locale: string): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const namespace of readdirSync(path.resolve(process.cwd(), "apps/web/public/i18n/app"))) {
    const file = path.resolve(process.cwd(), "apps/web/public/i18n/app", namespace, `${locale}.json`);
    try { Object.assign(merged, JSON.parse(readFileSync(file, "utf8"))); } catch { /* namespace has no locale */ }
  }
  return merged;
}

describe("/shaper registration", () => {
  it("registers the landing page in titles, manifest, sitemap and shared site navigation", () => {
    expect(readRepoFile("apps/web/src/app/routes/route-titles.ts")).toContain('"/shaper": "route.shaper"');
    // 라우트 거버넌스(route-manifest.ts, BLUEPRINT §1.3)는 모든 표면에 정본 그룹·역할·tier·stage 선언을 요구한다.
    // 항목의 값 검증은 route-governance.test.ts 가 맡고, 여기서는 /shaper 가 네 필드를 모두 선언한 채 등록됐는지만 본다.
    expect(readRepoFile("apps/web/src/app/routes/route-manifest.ts")).toMatch(
      /\{ path: "\/shaper", label: "route\.shaper", canonicalSurfaceId: "[a-z-]+", surfaceRole: "[^"]+", tier: "[a-z-]+", stage: "[a-z-]+" \}/u,
    );
    // Editors stay in site navigation, not in the indexable SEO sitemap.
    const staticRoutes = readRepoFile("scripts/build-static-catalog.ts")
      .match(/const STATIC_ROUTES = \[([\s\S]*?)\];/u)?.[1] ?? "";
    expect(staticRoutes).not.toBe("");
    expect(staticRoutes).not.toContain('"/shaper"');
    expect(staticRoutes).not.toContain('"/studio/assets/characters/new"');

    const navigation = readRepoFile("apps/web/src/shared/components/site-navigation.ts");
    expect(navigation).toContain('"/studio/assets/characters/new"');
    expect(readRepoFile("apps/web/src/app/routes/groups/creator.routes.tsx")).toContain('path: studioRoutePath("asset-character-new"), element: <CharacterShaperLandingPage />');
    expect(navigation).toContain("I.studioAssets");
    expect(readRepoFile("apps/web/src/domains/legal/site-directory-data.ts")).toContain('"/studio/assets/characters/new"');
    // Desktop footer and mobile menus (and the command palette) share one centralized navigation authority:
    // both ask the same policy function, resolveNavigationGroupsFor(), for the ordered groups they render.
    const footer = readRepoFile("apps/web/src/shared/components/site-footer.tsx");
    expect(footer).toContain("resolveNavigationGroupsFor()");
    expect(footer).toContain("navigationGroups.map");
    const mobileNavigation = readRepoFile("apps/web/src/shared/components/site-header-mobile-nav.tsx");
    expect(mobileNavigation).toContain("<SiteMenuDestinations");
    const mobileDestinations = readRepoFile("apps/web/src/shared/components/SiteMenuDestinations.tsx");
    expect(mobileDestinations).toContain("resolveNavigationGroupsFor().map");
  });

  it("publishes the new app-shell keys in the built-in locales", () => {
    const ko = readAppLocale("ko");
    const en = readAppLocale("en");

    expect(ko["route.shaper"]).toBe("캐릭터 셰이퍼");
    expect(en["route.shaper"]).toBe("Character Shaper");
    for (const key of ["nav.shaper", "footer.link.shaper", "footer.section.create", "footer.link.studio"]) {
      expect(typeof ko[key], key).toBe("string");
      expect(typeof en[key], key).toBe("string");
    }
  });
});
