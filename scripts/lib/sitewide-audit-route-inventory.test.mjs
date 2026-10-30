import assert from "node:assert/strict";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

import { collectAuditRouteInventory, expandAuditRouteInventory } from "./sitewide-audit-route-inventory.mjs";

const GROUPS = "apps/web/src/app/routes/groups/";
const STUDIO = "apps/web/src/domains/creator/";
const ADMIN = "apps/web/src/domains/admin/router/admin-route-manifest.ts";
const LEARN = "apps/web/src/domains/learn/";

function fixture(overrides = {}) {
  const files = {
    [`${GROUPS}app-routes.tsx`]: 'import { creatorRoutes as creators } from "./creator.routes"; export const appRoutes = [...creators];',
    [`${GROUPS}creator.routes.tsx`]: `
      import { creatorShowcaseRoutes } from "./creator-showcase-routes";
      export const creatorRoutes = defineAppRoutes([
        { id: "studio", path: studioRoutePath("home"), element: <Page /> },
        ...creatorShowcaseRoutes,
        route("account", "/auth/:action", Page),
        { id: "studio-owner", path: "/studio/*", element: <Router /> },
      ]);
      // { id: "comment-only", path: "/not-a-route" }
      const unused = [{ id: "unused", path: "/also-not-a-route" }];
      throw new Error("이 모듈은 실행하면 안 됩니다");
    `,
    [`${GROUPS}creator-showcase-routes.tsx`]: `export const creatorShowcaseRoutes = [
      { id: "start", path: "/create", element: <Start /> },
      { id: "review", path: "/showcase/reviews/:shareId", element: <Review /> },
    ] as const;`,
    [`${STUDIO}studio-route-registry.ts`]: 'export const STUDIO_ROUTE_REGISTRY = Object.freeze([route("home", "/studio", "studio", "none", "내 작업", "My work", ["/creator-hub"])]);',
    [`${STUDIO}studio-router/studio-route-manifest.ts`]: `
      export const STUDIO_COMPANION_SURFACES = ["workspace", "review"] as const;
      export const STUDIO_ROUTE_MANIFEST = Object.freeze([
        { id: "editor", pattern: "/studio/(work/:workId/)?canvas" },
        { id: "companion", pattern: "/studio/companion/:surface" },
      ] as const);
    `,
    [ADMIN]: `
      export const ADMIN_ROUTES = [{ id: "members", path: "/admin/users/members" }];
      export function resolveAdminRedirectHref(pathname) {
        const normalized = pathname;
        if (normalized === "/admin" || normalized === "/admin/members") return "/admin/users/members";
        return null;
      }
    `,
    [`${LEARN}LearnPage.tsx`]: `export function LearnPage() {
      const normalizedPath = location.pathname;
      return normalizedPath === "/learn" ? <Home /> : normalizedPath === "/learn/trace" ? <Trace /> : <Content />;
    }`,
    [`${LEARN}LearnContent.tsx`]: `export function LearnPage() { return <Routes>
      <Route path="glossary" element={<Glossary />} />
      <Route path={"lessons/:lessonId"} element={<Lesson />} />
      <Route path="*" element={<NotFound />} />
    </Routes>; }`,
    [`${LEARN}learning-content.ts`]: 'export const LESSONS = [{ id: "first-lesson", sections: [{ id: "nested-id" }] }];',
    [`${LEARN}learning-paths.ts`]: 'export const LEARNING_PATHS = [{ id: "starter" }];',
    ...overrides,
  };
  return { readSource: async (filename) => {
    if (Object.hasOwn(files, filename)) return files[filename];
    throw Object.assign(new Error(`없는 fixture: ${filename}`), { code: "ENOENT" });
  } };
}

test("실제 import·spread를 따라 분리한 showcase와 create 경로를 수집하고 앱 모듈은 실행하지 않는다", async () => {
  const inventory = await collectAuditRouteInventory("/unused", fixture());
  assert.equal(inventory.appRouteDeclarations, 5);
  assert.ok(inventory.routes.includes("/create"));
  assert.ok(inventory.routes.includes("/showcase/reviews/visual-audit"));
  assert.ok(!inventory.routes.includes("/not-a-route"));
  assert.ok(!inventory.routes.includes("/also-not-a-route"));
  const entry = inventory.entries.find((item) => item.path === "/showcase/reviews/visual-audit");
  assert.equal(entry.usesPlaceholder, true);
  assert.equal(entry.sources[0].source, `${GROUPS}creator-showcase-routes.tsx`);
  assert.equal(entry.sources[0].id, "review");
  assert.ok(entry.sources[0].line > 0);
});

test("Studio 등록·별칭·선택 surface와 관리자 resolver 별칭의 출처를 보존한다", async () => {
  const inventory = await collectAuditRouteInventory("/unused", fixture());
  for (const route of ["/creator-hub", "/studio/canvas", "/studio/work/visual-audit/canvas", "/studio/companion/workspace", "/studio/companion/review", "/admin", "/admin/members"]) {
    assert.ok(inventory.routes.includes(route), route);
  }
  assert.ok(!inventory.routes.includes("/studio/companion/visual-audit"));
  assert.equal(inventory.entries.find((item) => item.path === "/studio").sources.length, 2);
  assert.equal(inventory.entries.find((item) => item.path === "/admin/members").sources[0].kind, "admin-alias");
  assert.ok(inventory.excluded.some((entry) => entry.pattern === "/studio/*" && entry.reason === "wildcard-owner"));
});

test("학습 상세는 실제 콘텐츠 ID로 펼치고 JSX 경로와 pathname 분기를 별도로 기록한다", async () => {
  const inventory = await collectAuditRouteInventory("/unused", fixture());
  for (const route of ["/learn", "/learn/trace", "/learn/glossary", "/learn/lessons/first-lesson", "/learn/paths/starter"]) {
    assert.ok(inventory.routes.includes(route), route);
  }
  assert.ok(!inventory.routes.includes("/learn/lessons/visual-audit"));
  assert.ok(!inventory.routes.includes("/learn/lessons/nested-id"));
  assert.equal(inventory.entries.find((entry) => entry.path === "/learn/lessons/first-lesson").sources.length, 2);
});

test("해석할 수 없는 path·누락된 spread·순환 배열을 조용히 제외하지 않고 실패한다", async () => {
  for (const declaration of [
    'export const appRoutes = [{ id: "dynamic", path: buildRoute(), element: null }];',
    'export const appRoutes = [...missing];',
    'const other = [...appRoutes]; export const appRoutes = [...other];',
  ]) {
    await assert.rejects(() => collectAuditRouteInventory("/unused", fixture({ [`${GROUPS}app-routes.tsx`]: declaration })), /경로 권위와 감사 수집기/u);
  }
});

test("미지정 Studio ID는 잘못된 URL을 만들지 않고 실패한다", async () => {
  await assert.rejects(() => collectAuditRouteInventory("/unused", fixture({
    [`${GROUPS}app-routes.tsx`]: 'export const appRoutes = [{ id: "missing", path: studioRoutePath("missing"), element: null }];',
  })), /path 표현식/u);
});

test("하나의 URL로 모인 별칭도 출처를 보존하고 wildcard를 별도로 보고한다", () => {
  const result = expandAuditRouteInventory([
    { id: "one", pattern: "/same" },
    { id: "two", pattern: "/same" },
    { id: "not-found", pattern: "*" },
  ]);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].sources.length, 2);
  assert.equal(result.excluded.length, 1);
});
