#!/usr/bin/env node
/** 실제 제품 SW를 작은 A/B 배포에 번들해 WebKit의 배포 경계를 로컬에서 검증한다. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = "apps/web/src/app/service-worker/studio-service-worker-entry.ts";
const mime = { html: "text/html; charset=utf-8", js: "application/javascript; charset=utf-8", css: "text/css; charset=utf-8", text: "text/plain; charset=utf-8" };
const oldModes = ["html", "404", "retained"];
const workerStates = ["none", "active", "waiting"];
export const scenarioNames = [
  ...workerStates.flatMap((state) => oldModes.map((mode) => `${state}-${mode}`)),
  "activated-html", "activated-404",
  "pinned-html", "pinned-html-once", "install-html", "install-404",
];

export function makeManifest(version) {
  return {
    buildId: `boundary-${version}`,
    shellUrls: ["/", "/studio"],
    criticalUrls: [`/assets/entry-${version}.js`, `/assets/entry-${version}.css`, "/offline-draw/index.html"],
    warmUrls: [], offlineUrls: [],
  };
}

function documentFor(version) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>SW 배포 경계 ${version}</title><body><main>배포 ${version}</main><script type="module">import { build } from "/assets/entry-${version}.js"; window.fixtureBuild = build;</script></body></html>`;
}

/** 운영 서버를 사용하지 않으며, 실패 응답도 이 loopback 서버에서만 생성한다. */
export async function createFixtureServer(bundles) {
  const state = { version: "a", oldMode: "retained", fault: null };
  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    let status = 200;
    let contentType = mime.html;
    let body = documentFor(state.version);
    const asset = /^\/assets\/(entry|lazy|after)-([ab])\.(js|css)$/u.exec(url.pathname);
    const fault = state.fault?.pathname === url.pathname ? state.fault : null;
    let failure = fault?.mode;
    if (failure === "html-once") {
      failure = fault.remaining > 0 ? "html" : null;
      fault.remaining -= 1;
    }
    if (!failure && asset?.[2] === "a" && state.version === "b" && state.oldMode !== "retained") {
      failure = state.oldMode;
    }
    if (failure) {
      status = failure === "404" ? 404 : 200;
      contentType = failure === "404" ? mime.text : mime.html;
      body = failure === "404" ? "Fixture asset not found" : documentFor(state.version);
    } else if (url.pathname === "/sw.js") {
      contentType = mime.js;
      body = bundles[state.version];
    } else if (asset) {
      contentType = asset[3] === "js" ? mime.js : mime.css;
      body = asset[3] === "js" ? `export const build = "${asset[2]}"; export const chunk = "${asset[1]}";` : "body { color: #123; }";
    } else if (url.pathname === "/offline-drawing") {
      body = '<!doctype html><meta charset="utf-8"><main>로컬 구조 fixture</main><script type="module" src="/offline-drawing/app.js"></script>';
    } else if (url.pathname === "/offline-draw/index.html") {
      body = '<!doctype html><meta charset="utf-8"><main>임계 HTML 문서 fixture</main>';
    } else if (["/offline-drawing/app.js", "/offline-drawing/model.js"].includes(url.pathname)) {
      contentType = mime.js;
      body = "export const localRescue = true;";
    } else if (url.pathname === "/offline-drawing/style.css") {
      contentType = mime.css;
      body = "body { color: #123; }";
    }
    requests.push({ path: url.pathname + url.search, version: state.version, status, contentType });
    response.writeHead(status, { "content-type": contentType, "cache-control": "no-store", "service-worker-allowed": "/" });
    response.end(body);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return {
    state, requests, origin: `http://127.0.0.1:${server.address().port}`,
    async close() { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); },
  };
}

async function bundleWorkers() {
  const { build } = await import("vite");
  const bundles = {};
  for (const version of ["a", "b"]) {
    const built = await build({
      configFile: false, envDir: false, root, logLevel: "error", publicDir: false,
      define: { __STUDIO_SERVICE_WORKER_MANIFEST__: JSON.stringify(makeManifest(version)) },
      build: {
        write: false, emptyOutDir: false, copyPublicDir: false, manifest: false,
        sourcemap: false, reportCompressedSize: false, minify: false,
        lib: { entry: path.resolve(root, entry), formats: ["iife"], name: "toonstudioServiceWorker", fileName: () => "sw.js" },
      },
    });
    const outputs = (Array.isArray(built) ? built : [built]).flatMap((result) => result.output ?? []);
    const chunks = outputs.filter((output) => output.type === "chunk");
    assert.equal(chunks.length, 1, "실제 SW 번들은 독립 실행 가능한 단일 파일이어야 한다");
    bundles[version] = chunks[0].code;
  }
  assert.notEqual(bundles.a, bundles.b, "A/B는 서로 다른 manifest와 buildId를 가져야 한다");
  return bundles;
}

async function inspectWorker(page, kind = "controller") {
  return page.evaluate(async (targetKind) => {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = targetKind === "controller" ? navigator.serviceWorker.controller : registration?.[targetKind];
    if (!worker) return null;
    const details = await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error("SW inspect timeout")); }, 4_000);
      channel.port1.onmessage = (event) => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
      worker.postMessage({ type: "toonstudio-sw:inspect" }, [channel.port2]);
    });
    return { scriptURL: worker.scriptURL, state: worker.state, ...details };
  }, kind);
}

async function installA(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated");
  const worker = await inspectWorker(page);
  assert.equal(worker?.buildId, "boundary-a", "A 배포의 실제 worker가 현재 문서를 제어해야 한다");
  return worker;
}

async function requestUpdate(page, rejected = false) {
  return page.evaluate(async (expectRejected) => {
    const registration = await navigator.serviceWorker.getRegistration();
    const states = [];
    let candidate;
    const watch = () => {
      candidate = registration.installing;
      if (candidate) {
        states.push(candidate.state);
        candidate.addEventListener("statechange", () => states.push(candidate.state));
      }
    };
    registration.addEventListener("updatefound", watch);
    await registration.update();
    await new Promise((resolve, reject) => {
      const started = performance.now();
      const poll = () => {
        if (expectRejected ? candidate?.state === "redundant" : registration.waiting?.state === "installed") return resolve();
        if (performance.now() - started > 10_000) return reject(new Error(`SW update timeout: ${states.join(",")}`));
        setTimeout(poll, 30);
      };
      poll();
    });
    registration.removeEventListener("updatefound", watch);
    return { states, waiting: registration.waiting?.state ?? null, active: registration.active?.state ?? null };
  }, rejected);
}

async function activateB(page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SW activation timeout")), 10_000);
      navigator.serviceWorker.addEventListener("controllerchange", () => { clearTimeout(timer); resolve(); }, { once: true });
      registration.waiting.postMessage({ type: "toonstudio-sw:apply-update" });
    });
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated");
  const worker = await inspectWorker(page);
  assert.equal(worker?.buildId, "boundary-b", "명시적 갱신 후 B worker가 제어해야 한다");
  return worker;
}

async function importChunk(page, url) {
  return page.evaluate(async (moduleUrl) => {
    try { const loaded = await import(moduleUrl); return { ok: true, build: loaded.build }; }
    catch (error) { return { ok: false, error: String(error) }; }
  }, url);
}

async function cachedAssets(page, pathname) {
  return page.evaluate(async (assetPath) => {
    const matches = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname !== assetPath) continue;
        const response = await cache.match(request);
        matches.push({ cache: name, url: request.url, status: response.status, contentType: response.headers.get("content-type") });
      }
    }
    return matches;
  }, pathname);
}

async function evictAsset(page, pathname) {
  await page.evaluate(async (assetPath) => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) if (new URL(request.url).pathname === assetPath) await cache.delete(request);
    }
  }, pathname);
}

async function runScenario(name, browser, bundles, timeoutMs) {
  const fixture = await createFixtureServer(bundles);
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const evidence = { name, responses: [], pageErrors: [], checks: [] };
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/assets/")) return;
    evidence.responses.push({ path: url.pathname + url.search, status: response.status(), contentType: response.headers()["content-type"] ?? null, fromServiceWorker: response.fromServiceWorker() });
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  let timeout;
  try {
    await Promise.race([
      (async () => {
        await page.goto(fixture.origin, { waitUntil: "load" });
        await page.waitForFunction(() => window.fixtureBuild === "a");
        const [state, mode] = name.split("-");
        if (state !== "none") evidence.initialController = await installA(page);
        else assert.equal(await inspectWorker(page), null, "SW 없는 대조군에는 controller가 없어야 한다");
        evidence.checks.push("old-document-a-loaded");

        if (workerStates.includes(state) || state === "activated") {
          assert.equal((await cachedAssets(page, "/assets/lazy-a.js")).length, 0, "구버전 lazy 청크는 배포 전 캐시 미스여야 한다");
          fixture.state.version = "b";
          fixture.state.oldMode = mode;
          if (state === "waiting" || state === "activated") {
            evidence.update = await requestUpdate(page);
            evidence.waitingWorker = await inspectWorker(page, "waiting");
            assert.equal(evidence.waitingWorker?.buildId, "boundary-b");
            if (state === "activated") evidence.activatedController = await activateB(page);
          }
          evidence.controllerBeforeImport = await inspectWorker(page);
          assert.equal(evidence.controllerBeforeImport?.buildId ?? null, state === "none" ? null : state === "activated" ? "boundary-b" : "boundary-a");
          evidence.import = await importChunk(page, "/assets/lazy-a.js");
          assert.equal(evidence.import.ok, mode === "retained", "구 A lazy 모듈의 성공 여부가 실제 서버의 구 자산 보존 여부와 일치해야 한다");
          if (mode === "retained") assert.equal(evidence.import.build, "a");
          evidence.cachedAsset = await cachedAssets(page, "/assets/lazy-a.js");
          assert.ok(evidence.cachedAsset.every((item) => !item.contentType?.includes("text/html")), "일반 청크의 HTML 응답을 캐시하면 안 된다");
          assert.equal(evidence.cachedAsset.length, mode === "retained" && state !== "none" ? 1 : 0, "실제 SW 경로에서 성공한 JS만 캐시해야 한다");
          const networkRequests = fixture.requests.filter((item) => item.path === "/assets/lazy-a.js");
          assert.equal(networkRequests.length, mode === "html" && state !== "none" ? 2 : 1, "일반 청크도 HTML일 때만 실제 SW가 reload 한 번을 수행해야 한다");
          const responses = evidence.responses.filter((item) => item.path === "/assets/lazy-a.js");
          assert.ok(responses.length > 0, "실제 브라우저 응답 status/MIME 증거가 있어야 한다");
          assert.equal(responses.at(-1).status, mode === "404" ? 404 : 200);
          assert.ok(responses.at(-1).contentType?.includes(mode === "html" ? "text/html" : mode === "404" ? "text/plain" : "javascript"));
          evidence.checks.push(mode === "retained" ? "retained-old-module-loads" : "missing-old-module-fails-without-html-cache");
          if (state === "waiting" && mode === "retained") {
            evidence.activatedController = await activateB(page);
            evidence.oldImportAfterActivation = await importChunk(page, "/assets/after-a.js");
            evidence.newImportAfterActivation = await importChunk(page, "/assets/entry-b.js");
            assert.deepEqual(evidence.oldImportAfterActivation, { ok: true, build: "a" });
            assert.deepEqual(evidence.newImportAfterActivation, { ok: true, build: "b" });
            evidence.checks.push("different-build-b-activated-with-old-client");
          }
        } else if (state === "pinned") {
          await evictAsset(page, "/assets/entry-a.js");
          assert.equal((await cachedAssets(page, "/assets/entry-a.js")).length, 0);
          fixture.state.fault = { pathname: "/assets/entry-a.js", mode: name === "pinned-html-once" ? "html-once" : "html", remaining: 1 };
          const requestStart = fixture.requests.length;
          evidence.import = await importChunk(page, "/assets/entry-a.js?evicted=1");
          const recovering = name === "pinned-html-once";
          assert.equal(evidence.import.ok, recovering, "임계 청크는 유효한 JS가 복구된 경우에만 실행되어야 한다");
          evidence.cachedAsset = await cachedAssets(page, "/assets/entry-a.js");
          assert.ok(evidence.cachedAsset.every((item) => item.contentType?.includes("javascript")), "pinned 캐시에 HTML을 저장하면 안 된다");
          if (recovering) assert.ok(evidence.cachedAsset.length > 0, "reload로 복구한 JS는 캐시되어야 한다");
          else {
            assert.equal(evidence.cachedAsset.length, 0);
            assert.equal(evidence.responses.find((item) => item.path === "/assets/entry-a.js?evicted=1")?.status, 502, "반복 HTML인 임계 청크는 명시적 오류 응답이어야 한다");
          }
          evidence.assetRequests = fixture.requests.slice(requestStart).filter((request) => request.path.startsWith("/assets/entry-a.js"));
          assert.equal(evidence.assetRequests.length, 2, "HTML은 최초 요청과 reload 한 번으로 제한한다");
          evidence.checks.push(recovering ? "pinned-html-recovered-once" : "pinned-html-rejected-without-cache");
        } else if (state === "install") {
          const previous = await cachedAssets(page, "/assets/entry-a.js");
          fixture.state.version = "b";
          fixture.state.fault = { pathname: "/assets/entry-b.js", mode };
          evidence.update = await requestUpdate(page, true);
          evidence.remainingController = await inspectWorker(page);
          assert.equal(evidence.remainingController?.buildId, "boundary-a", "B 설치 거부 후 A controller가 유지되어야 한다");
          assert.equal(await inspectWorker(page, "waiting"), null);
          assert.deepEqual(await cachedAssets(page, "/assets/entry-a.js"), previous, "실패한 B 설치가 A 캐시를 변경하면 안 된다");
          evidence.rejectedBuildAssets = await cachedAssets(page, "/assets/entry-b.js");
          assert.equal(evidence.rejectedBuildAssets.length, 0, "실패한 B 설치는 불완전한 임계 캐시를 게시하면 안 된다");
          assert.equal((await cachedAssets(page, "/assets/entry-b.css")).length, 0, "실패한 설치의 정상 형제 자산도 최종 캐시에 남으면 안 된다");
          evidence.checks.push("failed-b-install-preserves-a");
        }
        assert.equal(evidence.pageErrors.length, 0, "예상한 import 실패 외의 페이지 런타임 오류가 없어야 한다");
      })(),
      new Promise((_resolve, reject) => { timeout = setTimeout(() => reject(new Error(`시나리오 제한 시간 ${timeoutMs}ms 초과`)), timeoutMs); }),
    ]);
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.error = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timeout);
    evidence.serverRequests = [...fixture.requests];
    await context.close();
    await fixture.close();
  }
  return evidence;
}

async function main() {
  const { values } = parseArgs({ options: {
    scenario: { type: "string", multiple: true, default: [] }, browser: { type: "string", default: "webkit" },
    "timeout-ms": { type: "string", default: "30000" }, report: { type: "string" }, "executable-path": { type: "string" },
    list: { type: "boolean" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("로컬 실제 SW 배포 경계 검증: node scripts/verify-studio-service-worker-deploy-boundary.mjs [--scenario waiting-html] [--browser webkit] [--timeout-ms 30000] [--executable-path /path/to/browser] [--report /tmp/sw-boundary.json]\n--list로 시나리오를 확인한다. 전체 앱 빌드·운영 접속·CI 실행은 하지 않는다.");
    return;
  }
  if (values.list) { console.log(scenarioNames.join("\n")); return; }
  assert.ok(["webkit", "chromium"].includes(values.browser), "--browser는 webkit 또는 chromium이어야 한다");
  const selected = values.scenario.length ? values.scenario : scenarioNames;
  for (const name of selected) assert.ok(scenarioNames.includes(name), `알 수 없는 시나리오 ${name}: --list로 확인한다`);
  const timeoutMs = Number(values["timeout-ms"]);
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 120_000, "--timeout-ms는 1000~120000 사이 정수여야 한다");
  const bundles = await bundleWorkers();
  const playwright = await import("playwright");
  const executablePath = values["executable-path"] ? path.resolve(values["executable-path"]) : undefined;
  const browser = await playwright[values.browser].launch({ headless: true, timeout: timeoutMs, executablePath });
  const require = createRequire(import.meta.url);
  const report = {
    schema: "toonstudio.sw-deploy-boundary/1", engine: values.browser, browserVersion: browser.version(),
    executablePath: executablePath ?? playwright[values.browser].executablePath(), customExecutable: Boolean(executablePath),
    dependencies: Object.fromEntries(await Promise.all(["vite", "playwright"].map(async (name) => [name, JSON.parse(await readFile(require.resolve(`${name}/package.json`), "utf8")).version]))),
    source: entry, sourceSha256: createHash("sha256").update(await readFile(path.resolve(root, entry))).digest("hex"),
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    workerBuilds: Object.fromEntries(["a", "b"].map((version) => [version, { manifest: makeManifest(version), sha256: createHash("sha256").update(bundles[version]).digest("hex") }])),
    scope: "loopback-only; actual production worker; minimal fixture, not full application", scenarios: [],
  };
  try {
    for (const name of selected) {
      const result = await runScenario(name, browser, bundles, timeoutMs);
      report.scenarios.push(result);
      console.log(`${result.status === "passed" ? "통과" : "실패"}: ${name}${result.error ? ` — ${result.error}` : ""}`);
    }
  } finally { await browser.close(); }
  if (values.report) {
    const output = path.resolve(values.report);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    console.log(`검증 근거: ${output}`);
  }
  const failed = report.scenarios.filter((result) => result.status === "failed").length;
  console.log(`${values.browser}: ${report.scenarios.length - failed}/${report.scenarios.length} 통과`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`SW 배포 경계 검증 실패: ${error instanceof Error ? error.message : String(error)}\n의존성 설치 상태와 브라우저를 확인한 뒤 pnpm exec playwright install webkit 또는 --help를 확인한다.`);
    process.exitCode = 1;
  });
}
