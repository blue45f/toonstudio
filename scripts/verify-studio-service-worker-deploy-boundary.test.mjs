import assert from "node:assert/strict";
import { createFixtureServer, makeManifest, scenarioNames } from "./verify-studio-service-worker-deploy-boundary.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("배포 fixture는 buildId와 임계 자산을 실제로 바꾼다", () => {
  const a = makeManifest("a");
  const b = makeManifest("b");
  assert.notEqual(a.buildId, b.buildId);
  assert.notDeepEqual(a.criticalUrls, b.criticalUrls);
  assert.ok(a.criticalUrls.includes("/offline-draw/index.html"), "합법적인 HTML 임계 문서도 설치 검증에 포함한다");
  assert.equal(new Set(scenarioNames).size, 15);
});

test("서버 전환은 구 lazy 자산의 HTML·404·보존 조건을 구별한다", async () => {
  const fixture = await createFixtureServer({ a: "worker-a", b: "worker-b" });
  try {
    const assetUrl = `${fixture.origin}/assets/lazy-a.js`;
    assert.match(await (await fetch(assetUrl)).text(), /build = "a"/u);
    fixture.state.version = "b";
    fixture.state.oldMode = "html";
    const html = await fetch(assetUrl);
    assert.equal(html.status, 200);
    assert.match(html.headers.get("content-type"), /text\/html/u);
    assert.match(await html.text(), /entry-b\.js/u);
    fixture.state.oldMode = "404";
    assert.equal((await fetch(assetUrl)).status, 404);
    fixture.state.oldMode = "retained";
    const retained = await fetch(assetUrl);
    assert.equal(retained.status, 200);
    assert.match(retained.headers.get("content-type"), /javascript/u);
    assert.match(await retained.text(), /build = "a"/u);
    assert.match(await (await fetch(`${fixture.origin}/assets/entry-b.js`)).text(), /build = "b"/u);
    assert.equal(await (await fetch(`${fixture.origin}/sw.js`)).text(), "worker-b");
  } finally { await fixture.close(); }
});

test("일회성 HTML 오염은 정확히 다음 요청 한 번에만 적용한다", async () => {
  const fixture = await createFixtureServer({ a: "worker-a", b: "worker-b" });
  try {
    fixture.state.fault = { pathname: "/assets/entry-a.js", mode: "html-once", remaining: 1 };
    const url = `${fixture.origin}/assets/entry-a.js?evicted=1`;
    assert.match((await fetch(url)).headers.get("content-type"), /text\/html/u);
    assert.match((await fetch(url)).headers.get("content-type"), /javascript/u);
    assert.equal(fixture.requests.length, 2);
  } finally { await fixture.close(); }
});

test("실제 SW가 요구하는 구조 요청에는 각 리소스의 MIME을 제공한다", async () => {
  const fixture = await createFixtureServer({ a: "worker-a", b: "worker-b" });
  try {
    for (const [pathname, expected] of [
      ["/offline-drawing", "text/html"], ["/offline-drawing/app.js", "application/javascript"],
      ["/offline-drawing/model.js", "application/javascript"], ["/offline-drawing/style.css", "text/css"],
    ]) {
      const response = await fetch(fixture.origin + pathname);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get("content-type").startsWith(expected));
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  } finally { await fixture.close(); }
});
