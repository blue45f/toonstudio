/** 실제 제품 UI의 대표 3개만 검사한다. 서버·업로드·다른 팩·전체 19개 검사는 시작하지 않는다. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdir, realpath, lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED_SCOPE = "core-3";
const IDS = ["emaceart-plasticine-01-native-8k", "emaceart-plasticine-01-godot-2k", "emaceart-plasticine-11-godot-2k"];
const DOM_MS = 15_000, LOAD_MS = 120_000, CLEANUP_MS = 60_000;
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index], value = process.argv[index + 1];
  assert.ok(key?.startsWith("--") && value && !args.has(key), "인자 이름·값·중복을 확인하세요.");
  args.set(key, value);
}
const required = ["--repo", "--expected-head", "--base-url", "--observer-url", "--out", "--browser-binary", "--scope", "--work-ms"];
assert.ok(required.every((key) => args.has(key)), "필수 인자가 없습니다. 범위 메모의 실행 예시를 확인하세요.");
assert.ok([...args.keys()].every((key) => required.includes(key)), "허용하지 않은 인자가 있습니다.");
assert.equal(args.get("--scope"), EXPECTED_SCOPE, "이 QA는 대표 3개만 검사합니다.");
const repo = await realpath(args.get("--repo"));
const base = new URL(args.get("--base-url"));
assert.equal(base.hostname, "127.0.0.1", "제품 원점은 로컬 IPv4여야 합니다.");
assert.equal(base.protocol, "http:");
assert.equal(base.pathname, "/");
assert.equal(base.search + base.hash + base.username + base.password, "");
const origin = base.origin;
const observerUrl = new URL(args.get("--observer-url"));
assert.equal(observerUrl.origin, origin);
assert.equal(observerUrl.search + observerUrl.hash + observerUrl.username + observerUrl.password, "");
const harnessRelative = "apps/web/tools/browser-harnesses/plasticine-materials";
assert.equal(await realpath(path.join(repo, harnessRelative)), HERE, "실행 검증기는 지정 저장소의 공개 도구여야 합니다.");
const observerSource = path.join(HERE, "passive-entry.ts");
assert.equal(observerUrl.pathname, "/tools/browser-harnesses/plasticine-materials/passive-entry.ts", "관측기는 같은 제품 Vite 그래프의 공개 도구여야 합니다.");
assert.equal(await realpath(observerSource), observerSource, "관측기의 링크 경로는 허용하지 않습니다.");
const observerSourceBytes = await readFile(observerSource);
assert.ok(path.isAbsolute(args.get("--out")), "출력은 아직 없는 절대 경로여야 합니다.");
const out = path.resolve(args.get("--out"));
assert.ok(out !== repo && out !== HERE && !out.startsWith(HERE + path.sep)
  && !out.startsWith(path.join(repo, "apps/web/src") + path.sep), "소스 안에 실행 결과를 쓰지 않습니다.");
await mkdir(path.dirname(out), { recursive: true });
await mkdir(out, { recursive: false });
const workMs = Number(args.get("--work-ms"));
assert.equal(workMs, 800_000, "대표 3개 검증의 원래 작업 상한 800초를 유지합니다.");
const started = Date.now(), workDeadline = started + workMs, cleanupDeadline = workDeadline + CLEANUP_MS;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expectedHead = args.get("--expected-head");
assert.match(expectedHead, /^[0-9a-f]{40}$/u);
const git = (values) => execFileSync("git", values, { cwd: repo, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, encoding: "utf8", timeout: 5_000 }).trim();
assert.equal(git(["rev-parse", "HEAD"]), expectedHead);
const sourceScopes = ["apps/web/src", "apps/web/tools", "apps/web/vite.config.ts", "apps/web/vite-react-compiler-filter.ts", "packages", "package.json", "pnpm-lock.yaml"];
async function sourceCheckpoint() {
  const changed = git(["diff", "--name-only", "-z", "HEAD", "--", ...sourceScopes]).split("\0").filter(Boolean);
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z", "--", ...sourceScopes]).split("\0").filter(Boolean);
  const names = [...new Set([...changed, ...untracked, "apps/web/src/domains/creator/bg3d/studio-bg3d-plasticine-materials.generated.json",
    "apps/web/vite.config.ts", "apps/web/vite-react-compiler-filter.ts", "package.json", "pnpm-lock.yaml", ...["browser.mjs", "passive-entry.ts", "source-server.mjs", "README.md"].map((name) => `${harnessRelative}/${name}`)])]
    .filter((name) => /\.(?:[cm]?jsx?|tsx?|json|css|ya?ml|md)$/u.test(name)).sort();
  const files = {};
  for (const name of names) {
    assert.ok(!path.isAbsolute(name) && !name.split("/").includes(".."), "소스 경계 밖 경로입니다.");
    try { files[name] = sha(await readFile(path.join(repo, name))); }
    catch (error) { if (error.code !== "ENOENT") throw error; files[name] = null; }
  }
  return { head: git(["rev-parse", "HEAD"]), files };
}
const sourceBefore = await sourceCheckpoint(), sourcePins = sourceBefore.files;
const catalogPath = path.join(repo, "apps/web/src/domains/creator/bg3d/studio-bg3d-plasticine-materials.generated.json");
const catalogBytes = await readFile(catalogPath), catalog = JSON.parse(catalogBytes);
const cases = IDS.map((id) => {
  const material = catalog.materials.find((entry) => entry.variants.some((variant) => variant.id === id));
  assert.ok(material, "대표 재질이 카탈로그에 없습니다.");
  return { material, variant: material.variants.find((entry) => entry.id === id) };
});
const { chromium } = createRequire(path.join(repo, "package.json"))("playwright");
const browserBinary = await realpath(args.get("--browser-binary"));
const events = [], results = [];
const receipt = { schema: "toonstudio.plasticine-actual-core.v2", scope: EXPECTED_SCOPE, expectedHead,
  browserKind: "Chrome for Testing chromium channel", engine: "explicit WebGL2", originalResolution: true,
  startedAt: new Date(started).toISOString(), workMs, cleanupReserveMs: CLEANUP_MS,
  catalogSha256: sha(catalogBytes), sourcePins, sourceCheckpointBefore: sourceBefore, cases: results,
  sourceCheck: { method: "catalog-local-path-size-sha256", receivedHttpBodyShaVerified: false },
  observer: { url: observerUrl.href, sourceSha256: sha(observerSourceBytes), source: `${harnessRelative}/passive-entry.ts` },
  routingMayDisableHttpCache: true,
  full19Verified: false, safariVerified: false, installedChromeVerified: false, webgpuPerformanceVerified: false,
  memorySoakVerified: false, glbExportVerified: false, productionVerified: false, retries: 0 };
let browser, failure;
function remaining(cap = DOM_MS, cleanup = false) {
  const left = (cleanup ? cleanupDeadline : workDeadline) - Date.now();
  assert.ok(left > 0, cleanup ? "정리 기한을 소진했습니다." : "원래 작업 기한을 소진했습니다.");
  return Math.max(1, Math.min(cap, left));
}
function event(phase, detail = {}) { events.push({ at: new Date().toISOString(), phase, ...detail }); }
async function saveJson(name, value) { await writeFile(path.join(out, name), JSON.stringify(value, null, 2) + "\n"); }
async function until(predicate, cap, label) {
  const deadline = Date.now() + remaining(cap);
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) {
      assert.ok(Date.now() < deadline && Date.now() < workDeadline, label + " (판정 완료 기한 초과)");
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, Math.max(1, deadline - Date.now()))));
  }
  throw new Error(label);
}
async function bounded(promise, cap, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), cap); })]);
  } finally { if (timer) clearTimeout(timer); }
}
async function verifyCatalogSources() {
  const prefix = "/assets/virtual-studio/purchased-materials-v1/plasticine/maps/";
  assert.equal(catalog.schema, "toonstudio.purchased-surface-materials.v1");
  const expectedNames = new Set(), verified = [];
  for (const asset of catalog.assets) {
    remaining();
    assert.match(asset.sha256, /^[0-9a-f]{64}$/u);
    assert.equal(asset.url, prefix + asset.sha256 + ".png");
    assert.ok(Number.isSafeInteger(asset.bytes) && asset.bytes > 0);
    assert.ok(!expectedNames.has(asset.sha256 + ".png"), "카탈로그 원본 경로가 중복됐습니다.");
    expectedNames.add(asset.sha256 + ".png");
    const file = path.join(repo, "apps/web/public", asset.url);
    assert.equal(await realpath(file), file, "원본 파일의 링크 경로는 허용하지 않습니다.");
    const before = await lstat(file, { bigint: true });
    assert.ok(before.isFile()); assert.equal(before.size, BigInt(asset.bytes));
    const digest = createHash("sha256"), stream = createReadStream(file);
    const timer = setTimeout(() => stream.destroy(new Error("원본 대조 기한을 소진했습니다.")), remaining(LOAD_MS));
    try { for await (const chunk of stream) { remaining(); digest.update(chunk); } }
    finally { clearTimeout(timer); stream.destroy(); }
    assert.equal(digest.digest("hex"), asset.sha256, "로컬 원본 SHA256이 카탈로그와 다릅니다.");
    const after = await lstat(file, { bigint: true });
    assert.deepEqual([after.dev, after.ino, after.size, after.mtimeNs, after.mode, after.nlink],
      [before.dev, before.ino, before.size, before.mtimeNs, before.mode, before.nlink], "원본 대조 중 파일이 바뀌었습니다.");
    verified.push({ url: asset.url, bytes: asset.bytes, sha256: asset.sha256 });
  }
  const names = await readdir(path.join(repo, "apps/web/public", prefix));
  assert.deepEqual([...names].sort(), [...expectedNames].sort(), "실제 원본 파일 집합이 카탈로그와 다릅니다.");
  assert.equal(verified.length, 59); assert.equal(verified.reduce((sum, asset) => sum + asset.bytes, 0), 1_938_819_011);
  for (const { variant } of cases) for (const map of Object.values(variant.maps).filter(Boolean)) {
    const asset = verified.find((entry) => entry.url === map.url);
    assert.ok(asset && asset.sha256 === map.sha256 && asset.bytes === map.bytes, "대표 채널의 원본 계약이 다릅니다.");
  }
  return { method: "catalog-local-path-size-sha256", files: verified.length, bytes: verified.reduce((sum, asset) => sum + asset.bytes, 0),
    verified, receivedHttpBodyShaVerified: false, full19BrowserVerified: false };
}
async function readObservation(page) {
  return page.evaluate(() => {
    if (!window.__plasticineActualObserver) throw new Error("수동 관측기가 준비되지 않았습니다.");
    return window.__plasticineActualObserver.observe();
  });
}
async function attachObserver(page) {
  await page.addScriptTag({ type: "module", url: observerUrl.href });
  await until(() => page.evaluate(() => Boolean(window.__plasticineActualObserver)), DOM_MS, "수동 관측기를 로드하지 못했습니다.");
}
async function openEditor(page) {
  const dialog = page.getByTestId("studio-bg3d-dialog");
  await dialog.waitFor({ state: "visible", timeout: remaining() });
  await page.getByRole("group", { name: "3D 편집 모드", exact: true }).getByRole("button", { name: /^정밀(?: 편집)?$/u }).click({ timeout: remaining() });
  await page.getByRole("dialog", { name: "정밀 3D 편집", exact: true }).waitFor({ state: "visible", timeout: remaining() });
  await page.locator("#bg3d-tab-view").first().click({ timeout: remaining() });
  const engine = page.getByTestId("studio-bg3d-engine-preference-webgl2").first();
  await engine.waitFor({ state: "visible", timeout: remaining() });
  if (await engine.getAttribute("aria-pressed") !== "true") {
    await until(() => engine.isEnabled(), DOM_MS, "제품 엔진 선택이 준비되지 않았습니다.");
    await engine.click({ timeout: remaining() });
  }
  await until(async () => /WebGL2 사용 중/u.test(await page.getByTestId("studio-bg3d-engine-active-backend").first().innerText()), DOM_MS, "제품 WebGL2 실행 상태가 아닙니다.");
  await dialog.locator("canvas").first().waitFor({ state: "visible", timeout: remaining() });
  const cutPanel = dialog.getByTestId("scene3d-cut-panel");
  if (await cutPanel.count() && await cutPanel.getAttribute("open") !== null) await cutPanel.locator(":scope > summary").click({ timeout: remaining() });
  await attachObserver(page);
  return dialog;
}
async function showPicker(page, item) {
  await page.locator("#bg3d-tab-shapes").first().click({ timeout: remaining() });
  const picker = page.getByTestId("bg3d-purchased-surface-material-picker").first();
  await picker.waitFor({ state: "visible", timeout: remaining() });
  const toggle = picker.getByTestId("bg3d-purchased-surface-material-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click({ timeout: remaining() });
  const card = picker.getByTestId("bg3d-purchased-material-" + item.material.id);
  await card.scrollIntoViewIfNeeded({ timeout: remaining() });
  return { picker, card, select: card.getByRole("combobox", { name: item.material.labelKo + " 원본 선택", exact: true }),
    apply: card.getByRole("button", { name: item.material.labelKo + " 적용", exact: true }) };
}
function validateRenderer(observation) {
  assert.equal(observation.contextLost, false);
  assert.ok(observation.renderer && /Apple|Metal/iu.test(observation.renderer), "실제 Apple/Metal 하드웨어 renderer가 아닙니다.");
  assert.doesNotMatch(observation.renderer, /SwiftShader|llvmpipe|software/iu);
  assert.ok(observation.maxTextureSize >= 8192, "원본 8K를 수용하는 texture 한도가 아닙니다.");
}
function materialReady(observation, item) {
  validateRenderer(observation);
  if (observation.entities.length !== 1) return false;
  const mesh = observation.entities[0];
  if (!mesh.visible) return false;
  for (const [channel, expected] of Object.entries(item.variant.maps)) {
    const actual = mesh.channels[channel];
    if (!expected) { if (actual !== null) return false; continue; }
    if (!actual?.decoded || actual.sourceUrl !== expected.url || actual.width !== item.variant.resolution || actual.height !== item.variant.resolution) return false;
    assert.equal(actual.colorSpace, channel === "baseColor" ? "srgb" : "");
    assert.deepEqual(actual.repeat, [1, 1]);
  }
  assert.deepEqual(mesh.normalScale, [1, 1]);
  assert.equal(mesh.normalMapType, 0);
  assert.equal(mesh.roughness, 1);
  assert.equal(mesh.metalness, item.variant.maps.metalness ? 1 : 0);
  assert.deepEqual(mesh.color, [1, 1, 1]);
  return true;
}
async function waitNaturalMaterial(page, item, initialFrame) {
  let lastNotReadyFrame = initialFrame, last;
  return until(async () => {
    last = await readObservation(page);
    if (!materialReady(last, item)) { lastNotReadyFrame = Math.max(lastNotReadyFrame, last.frame); return false; }
    // decoded image만 생기고 product demand-frame이 멈춘 경우를 추가 입력으로 살리지 않는다.
    return last.frame > lastNotReadyFrame ? { observation: last, lastNotReadyFrame } : false;
  }, LOAD_MS, "원본 채널 또는 자연스러운 제품 프레임이 제한시간 안에 준비되지 않았습니다.");
}
async function screenshot(page, name) {
  const bytes = await page.getByTestId("studio-bg3d-dialog").locator("canvas").first().screenshot({ type: "png", timeout: remaining() });
  await writeFile(path.join(out, name), bytes);
  return { bytes, file: name, sha256: sha(bytes) };
}
async function compareFrames(page, left, right) {
  return page.evaluate(async ([leftUrl, rightUrl]) => {
    const decode = async (url) => {
      const image = await createImageBitmap(await (await fetch(url)).blob());
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("증거 PNG를 읽을 2D context가 없습니다.");
      context.drawImage(image, 0, 0); image.close();
      return { width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const a = await decode(leftUrl), b = await decode(rightUrl);
    if (a.width !== b.width || a.height !== b.height) throw new Error("합성 증거의 Canvas 크기가 바뀌었습니다.");
    let changedPixels = 0, peakChannelDelta = 0, total = 0;
    const colors = new Set();
    for (let offset = 0; offset < a.pixels.length; offset += 4) {
      let changed = false;
      for (let channel = 0; channel < 3; channel++) { const delta = Math.abs(a.pixels[offset + channel] - b.pixels[offset + channel]);
        total += delta; peakChannelDelta = Math.max(peakChannelDelta, delta); if (delta > 3) changed = true; }
      if (changed) changedPixels++;
      colors.add((b.pixels[offset] << 16) | (b.pixels[offset + 1] << 8) | b.pixels[offset + 2]);
    }
    return { width: a.width, height: a.height, changedPixels, peakChannelDelta, meanDelta: total / (a.width * a.height * 3), distinctColors: colors.size };
  }, [left, right].map((entry) => "data:image/png;base64," + entry.bytes.toString("base64")));
}
function requirePaint(delta) { assert.ok(delta.changedPixels > 100 && delta.peakChannelDelta > 3 && delta.distinctColors > 3, "원본 적용 후 실제 합성 픽셀 변화가 부족합니다."); }

try {
  receipt.sourceCheck = await verifyCatalogSources();
  event("source-check-complete", { files: receipt.sourceCheck.files, bytes: receipt.sourceCheck.bytes });
  event("browser-launch-start");
  browser = await chromium.launch({ channel: "chromium", executablePath: browserBinary, headless: true,
    timeout: remaining(30_000), args: ["--disable-background-networking", "--enable-automation"] });
  const browserCdp = await browser.newBrowserCDPSession();
  receipt.browserVersion = browser.version();
  receipt.browserCommandLine = await browserCdp.send("Browser.getBrowserCommandLine");
  assert.equal(await realpath(receipt.browserCommandLine.arguments[0]), browserBinary, "실제 시작한 Chrome 바이너리가 다릅니다.");
  receipt.browserProcesses = await browserCdp.send("SystemInfo.getProcessInfo");
  for (const item of cases) {
    remaining();
    const result = { id: item.variant.id, status: "running", screenshots: [], network: [], networkPolicyFailures: [], pageErrors: [], consoleErrors: [], blockedRequests: [], actions: [] };
    results.push(result); event("case-start", { id: result.id });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, locale: "ko-KR", serviceWorkers: "block" });
    const page = await context.newPage(); page.setDefaultTimeout(DOM_MS);
    const requests = new Map(); let pending = 0;
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (["http:", "https:"].includes(url.protocol) && (url.origin !== origin || /^(?:\/api(?:\/|$)|\/trpc(?:\/|$)|\/socket\.io(?:\/|$)|\/studio-live(?:\/|$))/u.test(url.pathname))) {
        result.blockedRequests.push({ origin: url.origin, path: url.pathname, reason: "로컬 guest의 실제 DB·계정·공급자 요청 방지" }); await route.abort("blockedbyclient"); return;
      }
      await route.continue();
    });
    await context.routeWebSocket("**/*", async (webSocket) => {
      const url = new URL(webSocket.url());
      result.blockedRequests.push({ origin: url.origin, path: url.pathname });
      // connectToServer를 호출하지 않아 실제 서버 연결·메시지 송수신을 만들지 않는다.
      await webSocket.close({ code: 1008, reason: "local guest boundary" });
    });
    page.on("pageerror", (error) => result.pageErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") result.consoleErrors.push(message.text()); });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/assets/virtual-studio/purchased-materials-v1/plasticine/")) return;
      if (url.origin !== origin || url.search + url.hash + url.username + url.password !== "" || !/^\/assets\/virtual-studio\/purchased-materials-v1\/plasticine\/maps\/[0-9a-f]{64}\.png$/u.test(url.pathname)) {
        result.networkPolicyFailures.push({ origin: url.origin, path: url.pathname, reason: "구매 원본 요청 URL의 고정 경계 불일치" }); return;
      }
      const entry = { url: request.url(), method: request.method(), at: Date.now(), finished: false };
      result.network.push(entry); requests.set(request, entry); pending++;
    });
    page.on("response", (response) => { const entry = requests.get(response.request()); if (entry) { entry.status = response.status(); entry.contentLength = response.headers()["content-length"] ?? null; } });
    page.on("requestfinished", (request) => { const entry = requests.get(request); if (entry && !entry.finished) { entry.finished = true; entry.finishedAt = Date.now(); pending--; } });
    page.on("requestfailed", (request) => { const entry = requests.get(request); if (entry && !entry.finished) { entry.finished = true; entry.failure = request.failure(); pending--; } });
    let caseFailure;
    try {
      // 기존 inapp verifier와 같이 guest UI를 쓴다. auth session·문서·OPFS를 직접 주입하지 않는다.
      await page.addInitScript("globalThis.__name ??= (target) => target;");
      await page.goto(origin + "/studio/bg3d", { waitUntil: "domcontentloaded", timeout: remaining() });
      await openEditor(page);
      await page.locator("#bg3d-tab-shapes").first().click({ timeout: remaining() });
      await page.getByRole("button", { name: "상자 추가", exact: true }).first().click({ timeout: remaining() });
      await until(async () => (await readObservation(page)).entities.length === 1, DOM_MS, "기본 도형이 실제 scene에 없습니다.");
      const controls = await showPicker(page, item);
      await until(async () => pending === 0 && await controls.card.locator("img").evaluateAll((images) => images.length === 1 && images.every((image) => image.complete && image.naturalWidth > 0)), DOM_MS, "대상 원본 프리뷰 로딩이 끝나지 않았습니다.");
      const selectionCursor = result.network.length;
      if (item.material.variants.length > 1) await controls.select.selectOption(item.variant.id, { timeout: remaining() });
      else { assert.equal(await controls.select.isDisabled(), true); assert.equal(await controls.select.inputValue(), item.variant.id); }
      assert.equal(await controls.select.inputValue(), item.variant.id);
      assert.equal(remaining(500), 500, "선택 관찰 구간을 완료할 시간이 없습니다.");
      await page.waitForTimeout(500);
      assert.ok(Date.now() < workDeadline, "선택 관찰 완료가 원래 작업 기한을 넘었습니다.");
      assert.equal(result.network.length, selectionCursor, "원본 선택만으로 추가 PBR 요청이 발생했습니다.");
      assert.equal(result.networkPolicyFailures.length, 0, "구매 원본 요청 URL 경계가 다릅니다.");
      result.sourceSelection = { requestCountBefore: selectionCursor, requestCountAfter: result.network.length, observationWindowMs: 500, singleDisabledOption: item.material.variants.length === 1 };
      const before = await readObservation(page); validateRenderer(before);
      if (!receipt.hardwareProcessSnapshot) {
        receipt.hardwareProcessSnapshot = await browserCdp.send("SystemInfo.getProcessInfo");
        const gpu = receipt.hardwareProcessSnapshot.processInfo.filter((entry) => /gpu/iu.test(entry.type));
        console.log(JSON.stringify({ event: "owned-browser-gpu-observed", gpu }));
      }
      result.before = before;
      const baseline = await screenshot(page, result.id + "-before.png");
      result.screenshots.push({ file: baseline.file, sha256: baseline.sha256 });
      const applyCursor = result.network.length;
      await controls.apply.click({ timeout: remaining() });
      result.actions.push({ action: "apply", at: Date.now(), variantId: item.variant.id });
      const applied = await waitNaturalMaterial(page, item, before.frame);
      assert.equal(await controls.apply.getAttribute("aria-pressed"), "true");
      await until(() => pending === 0, LOAD_MS, "구매 원본 HTTP가 완료되지 않았습니다.");
      const expectedUrls = Object.values(item.variant.maps).filter(Boolean).map((entry) => origin + entry.url);
      for (const url of expectedUrls) assert.ok(result.network.some((entry) => entry.url === url && entry.finished && !entry.failure && entry.status === 200), "실제 요청 완료 또는 앞선 프리뷰 캐시 근거가 없습니다.");
      assert.ok(result.network.slice(applyCursor).some((entry) => expectedUrls.includes(entry.url)), "적용 이후 원본 채널 요청이 없습니다.");
      const rendered = await screenshot(page, result.id + "-applied.png");
      result.screenshots.push({ file: rendered.file, sha256: rendered.sha256 });
      result.applied = applied; result.applyPixels = await compareFrames(page, baseline, rendered); requirePaint(result.applyPixels);
      await page.locator("#bg3d-tab-templates").first().click({ timeout: remaining() });
      const library = page.locator('section[aria-labelledby="bg3d-user-template-library-title"]');
      const save = library.getByRole("button", { name: "현재 장면을 내 템플릿으로 저장", exact: true });
      await until(() => save.isEnabled(), DOM_MS, "실제 템플릿 저장 UI가 준비되지 않았습니다.");
      await save.click({ timeout: remaining() });
      const saved = library.getByRole("button", { name: /^내 소재 .+ 적용$/u });
      await saved.waitFor({ state: "visible", timeout: remaining() });
      assert.equal(await saved.count(), 1);
      result.templateButtonName = await saved.getAttribute("aria-label");
      await page.locator("#bg3d-tab-shapes").first().click({ timeout: remaining() });
      const beforeClear = await readObservation(page);
      await page.getByRole("button", { name: "표면 프리셋 해제", exact: true }).first().click({ timeout: remaining() });
      result.cleared = await until(async () => {
        const value = await readObservation(page); validateRenderer(value);
        return value.entities.length === 1 && value.frame > beforeClear.frame && Object.values(value.entities[0].channels).every((entry) => entry === null) ? value : false;
      }, DOM_MS, "UI 해제 뒤 실제 원본 채널이 제거되지 않았습니다.");
      const cleared = await screenshot(page, result.id + "-cleared.png"); result.screenshots.push({ file: cleared.file, sha256: cleared.sha256 });
      await page.reload({ waitUntil: "domcontentloaded", timeout: remaining() });
      await openEditor(page);
      const beforeReopen = await readObservation(page); result.beforeTemplateApply = beforeReopen;
      assert.equal(beforeReopen.entities.length, 0, "reload 뒤 빈 제품 장면이 아니므로 additive 템플릿 적용과 복원을 구분할 수 없습니다.");
      await page.locator("#bg3d-tab-templates").first().click({ timeout: remaining() });
      await page.locator('section[aria-labelledby="bg3d-user-template-library-title"]').getByRole("button", { name: result.templateButtonName, exact: true }).click({ timeout: remaining() });
      result.reopened = await waitNaturalMaterial(page, item, beforeReopen.frame);
      const restoredControls = await showPicker(page, item);
      assert.equal(await restoredControls.select.inputValue(), item.variant.id, "저장한 원본 선택이 재열기에서 바뀌었습니다.");
      assert.equal(await restoredControls.apply.getAttribute("aria-pressed"), "true");
      const reopened = await screenshot(page, result.id + "-reopened.png"); result.screenshots.push({ file: reopened.file, sha256: reopened.sha256 });
      result.reopenPixels = await compareFrames(page, cleared, reopened); requirePaint(result.reopenPixels);
      assert.equal(result.pageErrors.length, 0, "제품 페이지 예외가 있습니다.");
      result.unexpectedConsoleErrors = result.consoleErrors.filter((message) => message !== "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector"
        && !message.startsWith("[vite] failed to connect to websocket."));
      assert.equal(result.unexpectedConsoleErrors.length, 0, "의도한 로컬 요청 차단 외의 콘솔 오류가 있습니다.");
      assert.equal(result.networkPolicyFailures.length, 0, "구매 원본 요청 URL 경계가 다릅니다.");
      assert.ok(result.network.every((entry) => entry.finished && !entry.failure && entry.status === 200), "원본 요청 실패가 있습니다.");
      result.status = "passed";
    } catch (error) {
      result.status = "failed"; result.failure = { message: error.message, stack: error.stack };
      try {
        result.failureDiagnostics = await bounded(page.evaluate(() => ({
          path: location.pathname, readyState: document.readyState,
          text: document.body?.innerText.slice(0, 5000) ?? "",
          dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).map((dialog) => ({
            label: dialog.getAttribute("aria-label"), text: dialog.textContent?.slice(0, 2000) ?? "" })),
          images: Array.from(document.images).slice(-40).map((image) => ({
            path: new URL(image.currentSrc || image.src, location.href).pathname, complete: image.complete,
            width: image.naturalWidth, height: image.naturalHeight })),
          resources: performance.getEntriesByType("resource").slice(-80).map((entry) => ({
            path: new URL(entry.name, location.href).pathname, duration: entry.duration, responseEnd: entry.responseEnd })),
        })), remaining(5_000, true), "실패 DOM·resource 진단 기한");
        result.pendingResources = [...requests.values()].filter((entry) => !entry.finished);
      } catch (diagnosticError) { result.failureDiagnosticError = String(diagnosticError); }
      try { const image = await page.screenshot({ timeout: Math.min(5_000, remaining(5_000, true)) }); await writeFile(path.join(out, result.id + "-failure.png"), image); }
      catch (captureError) { result.failureScreenshotError = String(captureError); }
      caseFailure = error;
    } finally {
      try { await bounded(context.close({ reason: "대표 단일 검증 종료" }), remaining(15_000, true), "소유 context 정리 기한"); }
      catch (error) { result.contextCleanupError = String(error); result.status = "failed"; caseFailure ??= error; }
      finally { await saveJson(result.id + ".json", result); }
    }
    if (caseFailure) throw caseFailure;
  }
  assert.equal(results.length, 3); assert.ok(results.every((entry) => entry.status === "passed"));
} catch (error) { failure = { message: error.message, stack: error.stack }; }
finally {
  if (browser) {
    try { await bounded(browser.close({ reason: "소유한 최소 QA 종료" }), remaining(CLEANUP_MS, true), "브라우저 정리 기한"); receipt.browserClosed = true; }
    catch (error) { receipt.cleanupError = String(error); failure ??= { message: "브라우저 정리 미완료" }; }
  }
  try {
    receipt.sourceCheckpointAfter = await sourceCheckpoint();
    assert.deepEqual(receipt.sourceCheckpointAfter, sourceBefore, "실행 중 HEAD·제품 변경·QA 소스가 바뀌었습니다.");
    assert.equal(sha(await readFile(observerSource)), receipt.observer.sourceSha256);
    receipt.productSourceUnchanged = true;
  } catch (error) { receipt.productSourceUnchanged = false; failure ??= { message: error.message }; }
  if (Date.now() >= cleanupDeadline) failure ??= { message: "절대 정리 기한을 넘었습니다." };
  receipt.failure = failure ?? null; receipt.status = failure ? "failed" : "passed";
  receipt.finishedAt = new Date().toISOString(); receipt.elapsedMs = Date.now() - started;
  receipt.withinCleanupDeadline = Date.now() < cleanupDeadline;
  receipt.notExecutedIds = IDS.filter((id) => !results.some((entry) => entry.id === id));
  await saveJson("events.json", events); await saveJson("receipt.json", receipt);
  if (Date.now() >= cleanupDeadline) {
    receipt.failure ??= { message: "결과 저장 중 절대 정리 기한을 넘었습니다." };
    receipt.status = "failed"; receipt.withinCleanupDeadline = false;
    receipt.finishedAt = new Date().toISOString(); receipt.elapsedMs = Date.now() - started;
    await saveJson("receipt.json", receipt);
  }
  console.log(JSON.stringify({ status: receipt.status, cases: results.map(({ id, status }) => ({ id, status })), failure: receipt.failure, out }));
  process.exitCode = receipt.failure ? 1 : 0;
}
