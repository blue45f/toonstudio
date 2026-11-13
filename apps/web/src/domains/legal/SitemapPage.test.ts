import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SITEMAP_CORE_DESTINATION_GROUPS,
  SITEMAP_DIRECTORY_ENTRIES,
  SITEMAP_EXTENDED_DESTINATION_GROUPS,
} from "./site-directory-data";

import {
  SITE_NAVIGATION_GROUPS,
  SITE_UTILITY_NAVIGATION,
} from "@/shared/components/site-navigation";
import { canonicalSitePath } from "@/shared/lib/site-route-metadata";

const SITEMAP_SOURCE = "apps/web/src/domains/legal/SitemapDirectoryPage.tsx";
const PUBLIC_ROUTE_SOURCE_FILES = [
  "apps/web/src/app/routes/groups/account.routes.tsx",
  "apps/web/src/app/routes/groups/catalog.routes.tsx",
  "apps/web/src/app/routes/groups/character-chat.routes.tsx",
  "apps/web/src/app/routes/groups/community.routes.tsx",
  "apps/web/src/app/routes/groups/creator.routes.tsx",
  "apps/web/src/app/routes/groups/creator-showcase-routes.tsx",
  "apps/web/src/app/routes/groups/creator-resources.routes.tsx",
  "apps/web/src/app/routes/groups/cuts.routes.tsx",
  "apps/web/src/app/routes/groups/experience.routes.tsx",
  "apps/web/src/app/routes/groups/legal.routes.tsx",
  "apps/web/src/app/routes/groups/market.routes.tsx",
  "apps/web/src/app/routes/groups/marketing.routes.tsx",
  "apps/web/src/app/routes/groups/monetization.routes.tsx",
  "apps/web/src/app/routes/groups/newsletter.routes.tsx",
  "apps/web/src/app/routes/groups/production.routes.tsx",
  "apps/web/src/app/routes/groups/reference.routes.tsx",
] as const;

const INTENTIONAL_NON_DIRECTORY_ROUTES = new Set([
  "/auth/callback",
  "/auth/reset-password",
  "/auth/verify-email",
  "/collaborate/moderation",
  "/community/promote/moderation",
  "/challenges",
  "/creator-hub",
  "/creator-hub/references",
  // Token-bearing immutable review links require a fragment lease and are not a standalone destination.
  "/production/pinned-review",
  "/showcase",
  "/sitemap",
  // 전체 메뉴 자체의 상세 화면은 메뉴 허브에서 직접 연결한다.
  "/sitemap/all",
  "/studio/brush-lab",
]);

const LEGACY_REDIRECT_ALIASES = new Map([
  ["/asset-points", "/account/points"],
  ["/brush-lab", "/studio/assets/brushes/new"],
  ["/create/challenges", "/showcase/challenges"],
  ["/create/promo", "/showcase/promo"],
  ["/creator-support", "/support-creators"],
  ["/market/fit-lab", "/market/fit"],
  ["/motion-webtoon", "/studio/motion-webtoon"],
  ["/music", "/studio/assets/audio"],
  ["/publishing", "/studio/publish"],
  ["/research/story", "/story-lab"],
]);

const LEGACY_CROSS_DOMAIN_ALIASES = new Map([
  ["/collaborate/workspace", "/team/recruiting"],
  ["/production/workspaces", "/team/people"],
  ["/production/workspaces/join", "/team/people/join"],
]);

const NESTED_USER_FACING_DESTINATIONS = [
  "/learn",
  "/learn/contract-checklist",
  "/learn/glossary",
  "/learn/records",
  "/learn/studio",
  "/production",
  "/studio",
  "/studio/new",
  "/studio/assets",
  "/studio/3d/dcc/build",
  "/studio/3d/dcc/cad",
  "/studio/3d/dcc/material",
  "/studio/3d/dcc/model",
  "/studio/3d/dcc/sculpt",
  "/studio/3d/dcc/shot",
  "/studio/animation",
  "/studio/assets/characters/new",
  "/studio/bg3d",
  "/studio/brushes",
  "/studio/character",
  "/studio/comic",
  "/studio/join",
  "/studio/lift3d",
  "/studio/manual",
  "/studio/poser",
  "/studio/present",
  "/studio/publish",
  "/studio/review",
  "/studio/share",
  "/studio/storyworld",
  "/studio/versions",
] as const;

const sitemapSource = readFileSync(SITEMAP_SOURCE, "utf8");
const directoryPaths = new Set(
  SITEMAP_DIRECTORY_ENTRIES.map((entry) => canonicalSitePath(entry.href)),
);
const coreDestinationPaths = new Set(
  SITEMAP_CORE_DESTINATION_GROUPS
    .flatMap((group) => group.items)
    .map((item) => canonicalSitePath(item.href)),
);
const extendedDestinationHrefs = SITEMAP_EXTENDED_DESTINATION_GROUPS
  .flatMap((group) => group.items)
  .map((item) => item.href);

const canonicalDirectoryPath = (href: string) => (
  LEGACY_REDIRECT_ALIASES.get(href)
  ?? LEGACY_CROSS_DOMAIN_ALIASES.get(href)
  ?? canonicalSitePath(href)
);

function staticUserFacingRoutes(): string[] {
  const routes = PUBLIC_ROUTE_SOURCE_FILES.flatMap((sourcePath) => {
    const source = readFileSync(sourcePath, "utf8");
    const fromPathField = [...source.matchAll(/\bpath:\s*"([^"]+)"/gu)].map((match) => match[1]);
    const fromRouteHelper = [...source.matchAll(/\broute\(\s*"[^"]+"\s*,\s*"([^"]+)"/gu)].map((match) => match[1]);
    return [...fromPathField, ...fromRouteHelper];
  });

  return [...new Set(routes)]
    .filter((href) => !href.includes(":") && !href.includes("*"))
    .filter((href) => !INTENTIONAL_NON_DIRECTORY_ROUTES.has(href))
    .sort();
}

describe("site directory experience contracts", () => {
  it("builds actual directory entries from the shared navigation and explicit destinations", () => {
    for (const item of [
      ...SITE_NAVIGATION_GROUPS.flatMap((group) => group.items),
      ...SITE_UTILITY_NAVIGATION,
    ]) {
      expect(directoryPaths, `missing rendered navigation destination: ${item.href}`)
        .toContain(canonicalSitePath(item.href));
    }
  });

  it("keeps every standalone user-facing route reachable from rendered directory data", () => {
    const expectedDestinations = new Set([
      ...staticUserFacingRoutes().map(canonicalDirectoryPath),
      ...NESTED_USER_FACING_DESTINATIONS,
    ]);

    expect([...expectedDestinations].filter((href) => !directoryPaths.has(href)), `missing public directory destinations: ${[...expectedDestinations].filter((href) => !directoryPaths.has(href)).join(", ")}`).toEqual([]);
  });

  it("keeps the first directory layer creator-first without losing discovery paths", () => {
    for (const href of [
      "/production",
      "/studio",
      "/create",
      "/studio/assets",
      "/studio/publish",
      "/learn",
      "/research",
      "/discover",
      "/community",
    ]) {
      expect(coreDestinationPaths, `missing primary sitemap destination: ${href}`).toContain(href);
    }

    expect(SITEMAP_CORE_DESTINATION_GROUPS.map((group) => group.id)).toEqual([
      "start-create",
      "learn-prepare",
      "discover-inspire",
      "connect-manage",
    ]);
  });

  it("uses the canonical team recruiting destination instead of the legacy collaboration workspace", () => {
    expect(directoryPaths).toContain("/team/recruiting");
    expect(extendedDestinationHrefs).toContain("/team/recruiting");
    expect(extendedDestinationHrefs).not.toContain("/collaborate/workspace");
  });

  it("keeps creator entry points and the product tour visible before the long directory", () => {
    expect(sitemapSource).toContain('href="/create"');
    expect(sitemapSource).toContain('href="/studio"');
    expect(sitemapSource).toContain('href="/product-tour"');
    expect(sitemapSource.indexOf('href="/product-tour"')).toBeLessThan(
      sitemapSource.indexOf("SITEMAP_EXTENDED_DESTINATION_GROUPS.map"),
    );
    expect(directoryPaths).toContain("/brand-film");
  });

  it("redirects legacy create detail pages to their canonical showcase pages", () => {
    // O-04 일원화: /create 상세는 페이지를 공유하지 않고 정식 /showcase 주소로 리다이렉트한다.
    // 라우트 그룹 분리(호스트 래칫) 이후 이 리다이렉트들은 creator-showcase-routes.tsx가 소유한다.
    const routes = readFileSync("apps/web/src/app/routes/groups/creator-showcase-routes.tsx", "utf8");

    for (const [legacy, canonical] of [
      ["/create/challenges", "/showcase/challenges"],
      ["/create/promo", "/showcase/promo"],
    ] as const) {
      expect(routes).toContain(`path: "${legacy}", element: <ShowcaseRedirect to="${canonical}" />`);
      expect(directoryPaths).toContain(canonical);
      expect(extendedDestinationHrefs).not.toContain(legacy);
    }
  });

  it("keeps cross-domain team aliases out while preserving canonical targets", () => {
    const routes = PUBLIC_ROUTE_SOURCE_FILES
      .map((sourcePath) => readFileSync(sourcePath, "utf8"))
      .join("\n");

    for (const [legacy, canonical] of LEGACY_CROSS_DOMAIN_ALIASES) {
      expect(routes).toContain(`path: "${legacy}"`);
      expect(directoryPaths).toContain(canonical);
      expect(extendedDestinationHrefs).not.toContain(legacy);
    }
  });

  it("keeps redirect aliases out while preserving canonical targets", () => {
    const routes = PUBLIC_ROUTE_SOURCE_FILES
      .map((sourcePath) => readFileSync(sourcePath, "utf8"))
      .join("\n");

    for (const [legacy, canonical] of LEGACY_REDIRECT_ALIASES) {
      expect(routes).toContain(`path: "${legacy}"`);
      expect(directoryPaths).toContain(canonical);
      expect(extendedDestinationHrefs).not.toContain(legacy);
    }
  });

  it("uses only unique canonical static destinations in the extended directory", () => {
    const canonical = extendedDestinationHrefs.map(canonicalSitePath);
    expect(new Set(canonical).size).toBe(canonical.length);
    expect(canonical.every((href) => !href.includes(":") && !href.includes("*"))).toBe(true);

    for (const href of [
      "/admin",
      "/auth/callback",
      "/auth/reset-password",
      "/auth/verify-email",
      "/collaborate/moderation",
      "/creator-hub",
      "/showcase",
      "/sitemap",
      "/studio/3d",
      "/studio/brush-lab",
      "/studio/companion/workspace",
    ]) {
      expect(canonical).not.toContain(href);
    }
  });

  it("exposes current Studio primary destinations instead of relying on unused source constants", () => {
    expect(directoryPaths).toContain("/production");
    expect(directoryPaths).toContain("/studio/new");
    expect(directoryPaths).toContain("/studio/assets");
    expect(directoryPaths).toContain("/studio/publish");
  });

  it("keeps the long directory collapsed by category until the user opens it", () => {
    expect(sitemapSource).toContain("<details");
    expect(sitemapSource).toContain("<summary");
    expect(sitemapSource).toContain("{group.items.length}");
  });

  it("provides bilingual page copy and keyboard-visible focus treatments", () => {
    expect(sitemapSource).toContain("TOONSTUDIO DIRECTORY");
    expect(sitemapSource).toContain("All features and pages");
    expect(sitemapSource).toContain("전체 기능과 페이지");
    expect(sitemapSource).toContain("focus-visible:ring-2");
  });

  it("shows the directory scale from the same data the directory renders", () => {
    // 규모 수치는 손으로 적지 않고 디렉터리 원본 배열에서 직접 센다.
    expect(sitemapSource).toContain("{SITEMAP_DIRECTORY_ENTRIES.length}");
    expect(sitemapSource).toContain("{SITEMAP_CORE_DESTINATION_GROUPS.length}");
    expect(sitemapSource).toContain("{SITEMAP_EXTENDED_DESTINATION_GROUPS.length}");
    expect(sitemapSource).toContain("디렉터리 규모");
    expect(sitemapSource).toContain("Directory at a glance");
    expect(SITEMAP_DIRECTORY_ENTRIES.length).toBeGreaterThan(0);
  });

  it("enforces >=44px touch targets (min-h-11) and collapsible hub/pipeline groups without undersized min-h-7/min-h-9 links (GAP-R6-05)", () => {
    expect(sitemapSource).not.toMatch(/\bmin-h-7\b/u);
    expect(sitemapSource).not.toMatch(/\bmin-h-9\b/u);
    expect(sitemapSource).toContain('data-testid="sitemap-promo-hub-cta"');
    expect(sitemapSource).toContain('data-testid={`sitemap-hub-group-${hub.id}`}');
    expect(sitemapSource).toContain('data-testid={`sitemap-hub-chip-${hub.id}-${item.id}`}');
    expect(sitemapSource).toContain('data-testid="sitemap-pipeline-group"');
    expect(sitemapSource).toContain('data-testid={`sitemap-pipeline-step-${step.stepNumber}`}');
    expect(sitemapSource).toContain("open={hubIndex === 0}");
    expect(sitemapSource).toContain("{hub.items.length}");
    expect(sitemapSource).toContain("{CREATOR_STUDIO_PIPELINE_STEPS.length}");
    expect(sitemapSource).toContain("focus-visible:outline-2");
    expect(sitemapSource).toContain("motion-reduce:transition-none");
    expect(sitemapSource).toContain("break-words");
    expect(sitemapSource.split("\n").length).toBeLessThanOrEqual(800);
  });
});

// 원본 와이어프레임 §1의 제목 → 검색 순서를 보존한다.
describe("사이트맵 검색 우선 정보 위계", () => {
  const source = readFileSync(SITEMAP_SOURCE, "utf8");
  it("검색과 개인화를 통계 및 보조 허브 앞에 둔다", () => {
    const search = source.indexOf('<div id="sitemap-directory"');
    const personal = source.indexOf("<SiteDirectoryPersonalized");
    expect(search).toBeGreaterThan(source.indexOf("<SitePageHeader"));
    expect(personal).toBeGreaterThan(search);
    expect(personal).toBeLessThan(source.indexOf("aria-label={copy.statsLabel}"));
    expect(personal).toBeLessThan(source.indexOf('data-testid="sitemap-rea-hub-architecture"'));
  });
  it("검색을 밀어내는 큰 장식 대신 작업형 헤더를 쓴다", () => {
    expect(source).toContain('surface="plain"');
    expect(source).not.toContain('size="hero"');
    expect(source).not.toContain('art={sitePageHeaderArtFor');
  });
});
