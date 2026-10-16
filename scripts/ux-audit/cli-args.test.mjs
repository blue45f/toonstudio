import assert from "node:assert/strict";

import { UsageError, buildPlan, formatPlan, parseArguments, resolveJourneyIds } from "./cli-args.mjs";
import { JOURNEY_ORDER } from "./journey-meta.mjs";
import { ROUTES, VIEWPORTS, annotateWithAuthority, planCells, requiresLogin, selectPlan } from "./routes.mjs";
import { RUBRIC } from "./rubric.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

describe("cli-args: 인자 해석", () => {
  it("기본값은 전체 라우트·전체 뷰포트·전체 여정이다", () => {
    const plan = buildPlan(parseArguments([]));
    assert.equal(plan.routes.length, ROUTES.length);
    assert.equal(plan.viewports.length, 3);
    assert.equal(plan.cells.length, ROUTES.length * 3);
    assert.deepEqual(plan.journeyIds, [...JOURNEY_ORDER]);
  });

  it("--routes/--viewports/--auth/--journeys 로 계획을 좁힌다", () => {
    const options = parseArguments(["--routes", "home,studio-new", "--viewports", "mobile", "--journeys", "login-logout"]);
    const plan = buildPlan(options);
    assert.deepEqual(plan.routes.map((route) => route.id), ["home", "studio-new"]);
    assert.equal(plan.cells.length, 2);
    assert.deepEqual(plan.journeyIds, ["login-logout"]);
    assert.equal(plan.loginCells, 1);
    assert.equal(buildPlan(parseArguments(["--auth", "user"])).routes.every(requiresLogin), true);
  });

  it("--journeys-only 는 라우트 측정 칸을 만들지 않는다", () => {
    const plan = buildPlan(parseArguments(["--journeys-only"]));
    assert.equal(plan.cells.length, 0);
    assert.equal(plan.journeyIds.length, 6);
  });

  it("알 수 없는 옵션·라우트·여정·뷰포트는 한글 사용법 오류로 거부한다", () => {
    assert.throws(() => parseArguments(["--nope"]), UsageError);
    assert.throws(() => parseArguments(["--routes"]), /값이 필요/u);
    assert.throws(() => buildPlan(parseArguments(["--routes", "없는-화면"])), /알 수 없는 라우트/u);
    assert.throws(() => buildPlan(parseArguments(["--viewports", "watch"])), /알 수 없는 뷰포트/u);
    assert.throws(() => resolveJourneyIds("없는여정"), /알 수 없는 여정/u);
    assert.throws(() => parseArguments(["--auth", "admin"]), /public 또는 user/u);
  });

  it("--compare 는 보고서 두 개를 요구한다", () => {
    assert.deepEqual(parseArguments(["--compare", "a.json", "b.json"]).compare, ["a.json", "b.json"]);
    assert.throws(() => parseArguments(["--compare", "a.json"]), UsageError);
  });

  it("--dry 계획 출력에 모든 라우트와 로그인 구분이 들어 있다", () => {
    const text = formatPlan(buildPlan(parseArguments(["--dry"])), { outDir: "/tmp/x" });
    for (const route of ROUTES) assert.ok(text.includes(`| ${route.id} |`), route.id);
    assert.ok(text.includes("측정 칸"));
    assert.ok(text.includes("/tmp/x"));
  });
});

describe("routes: 대상 목록 계약", () => {
  it("라우트 id 는 유일하고 30개 안팎이며 공개/로그인 구분이 있다", () => {
    const ids = ROUTES.map((route) => route.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ROUTES.length >= 28 && ROUTES.length <= 36, `${ROUTES.length}개`);
    assert.ok(ROUTES.every((route) => ["public", "user"].includes(route.auth)));
    assert.ok(ROUTES.some((route) => route.auth === "public") && ROUTES.some((route) => route.auth === "user"));
  });

  it("요구한 범주(홈·탐색·마켓·만들기 진입·라이브러리·새 작품·템플릿·리서치·협업 허브·매뉴얼·설정·에디터)를 모두 포함한다", () => {
    const ids = new Set(ROUTES.map((route) => route.id));
    for (const required of ["home", "discover", "market-home", "create-start", "studio-library", "studio-new", "studio-templates", "research-desk", "collaborate-hub", "manual", "settings", "editor-entry"]) {
      assert.ok(ids.has(required), required);
    }
  });

  it("뷰포트 3종이 사양 크기와 같다", () => {
    assert.deepEqual(VIEWPORTS.map((viewport) => [viewport.id, viewport.width, viewport.height]), [["mobile", 390, 844], ["tablet", 768, 1024], ["desktop", 1440, 900]]);
  });

  it("칸 순서는 선언 순서로 고정된다(결정적)", () => {
    const { routes, viewports } = selectPlan({ routeIds: ["settings", "home"] });
    assert.deepEqual(planCells(routes, viewports).map((cell) => cell.key).slice(0, 4), ["home@mobile", "home@tablet", "home@desktop", "settings@mobile"]);
  });

  it("사이트 라우트 권위 주석: 권위의 sign-in 라우트는 로그인 구분과 일치한다", async () => {
    const { loadSiteRouteAuthority } = await import("./routes.mjs");
    const root = new URL("../../", import.meta.url).pathname;
    const resolveAuthority = await loadSiteRouteAuthority(root);
    assert.equal(typeof resolveAuthority, "function");
    const annotated = annotateWithAuthority(ROUTES, resolveAuthority);
    for (const entry of annotated) {
      if (entry.authority?.access === "sign-in") assert.equal(entry.auth, "user", entry.id);
    }
    assert.ok(annotated.filter((entry) => entry.authority).length >= 8);
  });
});

describe("journeys: 정의 일관성", () => {
  it("여정 id 는 점수 규칙의 여정과 같고 실행 순서에서 로그아웃이 마지막이다", () => {
    assert.deepEqual([...JOURNEY_ORDER].sort(), RUBRIC.journeys.items.map((entry) => entry.id).sort());
    assert.equal(JOURNEY_ORDER.at(-1), "login-logout");
  });
});
