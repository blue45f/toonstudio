import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";
import { decodePng } from "image-js";

const WIDTH = 733, HEIGHT = 769;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const message = (value) => value instanceof Error ? value.message : String(value);
function check(value, reason) { if (!value) throw new Error(reason); }
function git(root, args) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }

/** 기본 레인은 설치된 고정 Playwright의 Chromium 한 버전이며, 명시한 실험 버전은 그대로 우선한다. */
export function resolveGraphiteBrowserPin(metadata, override) {
  if (override !== undefined) {
    check(typeof override === "string" && /^\d+\.\d+\.\d+\.\d+$/.test(override), "명시한 고정 browser version 형식이 아닙니다.");
    return { version: override, source: "GRAPHITE_EXPECTED_BROWSER" };
  }
  const candidates = Array.isArray(metadata?.browsers)
    ? metadata.browsers.filter((entry) => entry?.name === "chromium") : [];
  check(candidates.length === 1, "공식 Playwright 메타데이터의 Chromium 항목이 하나가 아닙니다. 고정 의존성 설치를 확인하세요.");
  const { browserVersion, revision } = candidates[0];
  check(typeof browserVersion === "string" && /^\d+\.\d+\.\d+\.\d+$/.test(browserVersion)
    && typeof revision === "string" && /^\d+$/.test(revision), "공식 Playwright Chromium 버전·revision이 올바르지 않습니다.");
  return { version: browserVersion, revision, source: "playwright-core/browsers.json" };
}

export function readInstalledGraphiteBrowserPin() {
  const playwrightManifest = createRequire(import.meta.url).resolve("playwright/package.json");
  // chromium을 import한 Playwright의 의존성에서 찾는다. 우연히 hoist된 다른 core는 사용하지 않는다.
  const coreManifest = createRequire(playwrightManifest).resolve("playwright-core/package.json");
  const metadata = readFileSync(join(dirname(coreManifest), "browsers.json"));
  return { ...resolveGraphiteBrowserPin(JSON.parse(metadata.toString("utf8"))),
    playwrightVersion: JSON.parse(readFileSync(playwrightManifest, "utf8")).version,
    coreVersion: JSON.parse(readFileSync(coreManifest, "utf8")).version,
    metadataSha256: sha256(metadata) };
}

export function assertGraphiteBrowserVersion(actual, expected) {
  check(actual === expected, `고정 Chromium version이 아닙니다. 기대: ${expected}, 실제: ${actual}`);
}
export function getViteBrowserModuleUrl(root, file, candidateDirectory) {
  const absolute = realpathSync(file), inside = relative(root, absolute);
  if (inside && inside !== ".." && !inside.startsWith(".." + sep)) {
    return "/" + inside.split(sep).map(encodeURIComponent).join("/");
  }
  check(dirname(absolute) === realpathSync(candidateDirectory), "허용하지 않은 외부 browser entry입니다.");
  return "/@fs/" + absolute;
}
function fence(root, entry) {
  const paths = [entry, fileURLToPath(import.meta.url), join(root, "package.json"), join(root, "pnpm-lock.yaml"),
    ...["brush/studio-brush-pack-runtime.ts", "brush/studio-brush-dynamics.ts",
      "brush/studio-material-brush-catalog.ts", "studio-dynamic-brush-render-plan.ts",
      "studio-dynamic-brush-coverage-renderer.ts"].map((name) => join(root, "apps/web/src/domains/creator", name))];
  return { head: git(root, ["rev-parse", "HEAD"]),
    trackedStatus: git(root, ["status", "--porcelain", "--untracked-files=no"]),
    files: paths.map((path) => ({ path, sha256: sha256(readFileSync(path)) })) };
}
function byte(data, index) {
  const value = data[index];
  check(typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255, "PNG의8비트 channel이 아닙니다.");
  return value;
}
export function compareGraphiteScreenshots(before, after) {
  const decode = (buffer) => {
    const image = decodePng(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
    check(image.width === WIDTH && image.height === HEIGHT && image.bitDepth === 8
      && image.components === 3 && (image.channels === 3 || image.channels === 4), "고정 screenshot 크기/색 모델이 아닙니다.");
    return { channels: image.channels, data: image.getRawImage().data };
  };
  const a = decode(before), b = decode(after);
  let changedPixels = 0, maxChannelDelta = 0;
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    let delta = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const original = byte(a.data, pixel * a.channels + channel);
      check(original === 255, "baseline screenshot이 white가 아닙니다.");
      delta = Math.max(delta, Math.abs(original - byte(b.data, pixel * b.channels + channel)));
    }
    if (a.channels === 4) check(byte(a.data, pixel * 4 + 3) === 255, "baseline alpha가 불투명하지 않습니다.");
    if (b.channels === 4) check(byte(b.data, pixel * 4 + 3) === 255, "screenshot alpha가 불투명하지 않습니다.");
    if (delta > 2) changedPixels += 1;
    maxChannelDelta = Math.max(maxChannelDelta, delta);
  }
  return { changedPixels, maxChannelDelta, totalPixels: WIDTH * HEIGHT,
    meaningful: changedPixels >= 4 && maxChannelDelta >= 4, rgbTolerance: 2 };
}
async function run() {
  check(process.argv.length === 2, "flow/phase/기준 override 인자는 허용하지 않습니다.");
  const here = dirname(fileURLToPath(import.meta.url));
  const root = realpathSync(process.env.GRAPHITE_WORKTREE ?? resolve(here, ".."));
  const entry = join(here, "studio-graphite-coverage-browser.mts");
  const base = resolve(process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), "studio-stability-evidence"));
  mkdirSync(base, { recursive: true });
  const output = mkdtempSync(join(base, "graphite-actual-screen-"));
  /** @type {import("vite").ViteDevServer | undefined} */ let vite;
  /** @type {import("playwright").Browser | undefined} */ let browser;
  /** @type {import("playwright").BrowserContext | undefined} */ let context;
  let cache, sourceBefore;
  const errors = [], diagnostics = [], rows = [], cleanup = [];
  const receipt = { scope: "controlled actual Canvas2D browser screenshot; full UI/GPU성능 또는 정확한 CI UI 재현 주장이 아님",
    startedAt: new Date().toISOString(), browserExpected: null,
    flowOverridden: false, rgbTolerance: 2, meaningfulMinimum: { changedPixels: 4, maxChannelDelta: 4 },
    modes: ["white", "transparent"], phaseIndices: [0,1,2,3,4,5,6,7], pixelsRead: false };
  try {
    const pin = process.env.GRAPHITE_EXPECTED_BROWSER === undefined
      ? readInstalledGraphiteBrowserPin()
      : resolveGraphiteBrowserPin(null, process.env.GRAPHITE_EXPECTED_BROWSER);
    receipt.browserExpected = pin.version;
    receipt.browserPin = pin;
    cache = mkdtempSync(join(tmpdir(), "studio-graphite-vite-"));
    sourceBefore = fence(root, entry); receipt.sourceBefore = sourceBefore;
    if (process.env.GITHUB_ACTIONS === "true") {
      check(!sourceBefore.trackedStatus, "CI source에 미커밋 tracked 변경이 있습니다.");
      check(process.env.GITHUB_SHA === sourceBefore.head, "checkout SHA가 GITHUB_SHA와 다릅니다.");
    }
    const moduleUrl = getViteBrowserModuleUrl(root, entry, here), route = "/__graphite_coverage__";
    vite = await createServer({ configFile: false, envDir: false, envPrefix: [], publicDir: false, root, cacheDir: cache,
      resolve: { alias: [{ find: "@", replacement: join(root, "apps/web/src") },
        { find: /^@toonstudio\/contracts\/(.+)$/, replacement: join(root, "packages/contracts/src/$1") }] },
      optimizeDeps: { entries: [entry] }, server: { host: "127.0.0.1", port: 0, hmr: false, fs: { allow: [root, here] } },
      plugins: [{ name: "graphite-actual-screen", configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/favicon.ico") { res.statusCode = 204; res.end(); return; }
          if (req.url !== route) { next(); return; }
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;overflow:hidden"></body>');
        });
      } }] });
    await vite.listen();
    const address = vite.httpServer?.address();
    check(address && typeof address !== "string", "독립 localhost port가 없습니다.");
    const origin = "http://127.0.0.1:" + address.port;
    const launchArgs = ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
    browser = await chromium.launch({ channel: "chromium", headless: true, args: launchArgs });
    receipt.browserVersion = browser.version();
    assertGraphiteBrowserVersion(receipt.browserVersion, pin.version);
    receipt.browser = { executablePath: chromium.executablePath(), channel: "chromium", headless: true,
      additionalLaunchArgs: launchArgs, platform: process.platform, architecture: process.arch, nodeVersion: process.version };
    context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    await context.route("**/*", async (routeRequest) => {
      const url = new URL(routeRequest.request().url());
      if (url.origin === origin) await routeRequest.continue();
      else { diagnostics.push("차단한 외부 요청: " + url.origin + url.pathname); await routeRequest.abort(); }
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => diagnostics.push(error.message));
    page.on("console", (entry) => { if (entry.type() === "error") diagnostics.push(entry.text()); });
    page.on("requestfailed", (request) => diagnostics.push(new URL(request.url()).pathname + ": " + request.failure()?.errorText));
    await page.goto(origin + route, { waitUntil: "load" });
    // 측정용 Canvas와 screenshot을 만들기 전에 lane을 fail-closed 확인한다.
    receipt.fingerprint = await page.evaluate(async () => {
      if (!isSecureContext || devicePixelRatio !== 1) throw new Error("secure localhost/DPR1이 아닙니다.");
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter || adapter.info.vendor !== "google" || adapter.info.architecture !== "swiftshader") throw new Error("선언한 SwiftShader adapter가 아닙니다.");
      const canvas = document.createElement("canvas");
      try {
        const gl = canvas.getContext("webgl2"), extension = gl?.getExtension("WEBGL_debug_renderer_info");
        if (!gl || !extension) throw new Error("lane renderer를 확인할 수 없습니다.");
        const renderer = gl.getParameter(extension.UNMASKED_RENDERER_WEBGL);
        if (typeof renderer !== "string" || !renderer.includes("SwiftShader")) throw new Error("선언한 SwiftShader renderer가 아닙니다.");
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        return { purpose: "Canvas2D software-lane diagnostic", adapterQueried: true, deviceRequested: false, origin: location.origin, secureContext: isSecureContext,
          isFallbackAdapter: adapter.info.isFallbackAdapter, featureCount: adapter.features.size,
          maxBufferSize: adapter.limits.maxBufferSize, vendor: adapter.info.vendor, architecture: adapter.info.architecture, renderer, userAgent: navigator.userAgent, devicePixelRatio };
      } finally { canvas.remove(); canvas.width = 1; canvas.height = 1; }
    });
    check(diagnostics.length === 0, "lane 초기화 diagnostics가 있습니다.");
    receipt.recipe = await page.evaluate(async (url) => (await import(url)).initializeGraphiteProbe(), moduleUrl);
    for (const mode of ["white", "transparent"]) {
      let weakest;
      for (let x = 0; x < 8; x += 1) for (let y = 0; y < 8; y += 1) {
        await page.evaluate(async ({ url, mode }) => (await import(url)).resetGraphiteProbe(mode), { url: moduleUrl, mode });
        const before = await page.screenshot({ animations: "disabled", caret: "hide", scale: "device" });
        const render = await page.evaluate(async ({ url, x, y }) => (await import(url)).drawGraphiteProbe(x, y), { url: moduleUrl, x, y });
        const after = await page.screenshot({ animations: "disabled", caret: "hide", scale: "device" });
        receipt.pixelsRead = true;
        const diff = compareGraphiteScreenshots(before, after);
        const row = { mode, x, y, render, diff, beforePngSha256: sha256(before), afterPngSha256: sha256(after) };
        rows.push(row);
        if (!weakest || diff.maxChannelDelta < weakest.row.diff.maxChannelDelta
          || (diff.maxChannelDelta === weakest.row.diff.maxChannelDelta && diff.changedPixels < weakest.row.diff.changedPixels)) weakest = { row, before, after };
      }
      check(weakest, "destination의64개 결과가 없습니다.");
      writeFileSync(join(output, mode + "-weakest-before.png"), weakest.before, { mode: 0o600 });
      writeFileSync(join(output, mode + "-weakest-after.png"), weakest.after, { mode: 0o600 });
    }
    receipt.control = await page.evaluate(async (url) => (await import(url)).finishGraphiteProbe(), moduleUrl);
    await page.evaluate(async (url) => (await import(url)).disposeGraphiteProbe(), moduleUrl);
    check(rows.length === 128 && ["white","transparent"].every((mode) => rows.filter((row) => row.mode === mode).length === 64), "128개 고정 case가 불완전합니다.");
    check(diagnostics.length === 0, "browser diagnostics가 있습니다.");
    const failures = rows.filter((row) => !row.diff.meaningful);
    if (failures.length) errors.push("기존 meaningful 기준 미달: " + failures.length + "/128");
  } catch (error) { errors.push(message(error)); }
  finally {
    const tasks = [
      { name: "context 종료", run: async () => { await context?.close(); } },
      { name: "browser 종료", run: async () => { await browser?.close(); } },
      { name: "Vite 종료", run: async () => { await vite?.close(); } },
      { name: "소유한 cache 삭제", run: async () => { if (cache) rmSync(cache, { recursive: true, force: true }); } },
      { name: "source fence", run: async () => {
        if (sourceBefore) { receipt.sourceAfter = fence(root, entry);
          check(JSON.stringify(sourceBefore) === JSON.stringify(receipt.sourceAfter), "실행 중 fenced source가 변경됐습니다."); }
      } },
    ];
    for (const task of tasks) { try { await task.run(); cleanup.push({ stage: task.name, ok: true }); }
      catch (error) { const reason = task.name + ": " + message(error); errors.push(reason); cleanup.push({ stage: task.name, ok: false, error: reason }); } }
    if (diagnostics.length) errors.push("browser 종료 전후 diagnostics: " + diagnostics.join("; "));
    receipt.endedAt = new Date().toISOString(); receipt.rows = rows;
    receipt.diagnostics = diagnostics; receipt.errors = errors; receipt.cleanup = cleanup; receipt.exitCode = errors.length ? 1 : 0;
    try { writeFileSync(join(output, "report.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 }); }
    catch (error) { errors.push("report 저장: " + message(error)); }
  }
  if (errors.length) throw new AggregateError(errors.map((reason) => new Error(reason)),
    "Graphite actual-screen 회귀 검사 실패: " + errors.join("; ") + "; 보고서: " + join(output, "report.json"));
  console.log(JSON.stringify({ cases: rows.length, failed: 0, output }));
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  run().catch((error) => { console.error(message(error)); process.exitCode = 1; });
}
