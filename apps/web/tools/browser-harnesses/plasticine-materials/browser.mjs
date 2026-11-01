/** 실제 제품 UI의 core-3·도형 복수 객체·대표 GLB 복수 인스턴스를 별도 범위로 검사한다. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdir, realpath, lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createMultiObjectScenario } from "./multi-object-scenario.mjs";
import { createImportedMaterialScenario, IMPORTED_CASE_ID, IMPORTED_FIXTURE } from "./imported-material-scenario.mjs";
import { createLettuceMaterialScenario, LETTUCE_CASE_ID, LETTUCE_FIXTURE, verifyLettuceFixture } from "./lettuce-material-scenario.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORE_IDS = ["emaceart-plasticine-01-native-8k", "emaceart-plasticine-01-godot-2k", "emaceart-plasticine-11-godot-2k"];
const MULTI_IDS = ["emaceart-plasticine-01-godot-2k", "emaceart-plasticine-11-godot-2k"];
const MULTI_CASE_ID = "multi-object-isolation";
const DOM_MS = 15_000, LOAD_MS = 120_000, CLEANUP_MS = 60_000;
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index], value = process.argv[index + 1];
  assert.ok(key?.startsWith("--") && value && !args.has(key), "인자 이름·값·중복을 확인하세요.");
  args.set(key, value);
}
const required = ["--repo", "--expected-head", "--base-url", "--observer-url", "--out", "--browser-binary", "--scope", "--work-ms"];
assert.ok(required.every((key) => args.has(key)), "필수 인자가 없습니다. 범위 메모의 실행 예시를 확인하세요.");
const lettuceArgs = ["--lettuce-file", "--lettuce-receipt"];
assert.ok([...args.keys()].every((key) => required.includes(key) || lettuceArgs.includes(key)), "허용하지 않은 인자가 있습니다.");
const scope = args.get("--scope");
assert.ok(["core-3", "multi-object", "imported-model", "lettuce-template"].includes(scope), "허용하지 않은 scope입니다.");
assert(lettuceArgs.every((key) => scope === "lettuce-template" ? args.has(key) && path.isAbsolute(args.get(key)) : !args.has(key)),
  "Lettuce 범위에는 원본 GLB와 정상화 receipt 절대 경로가 필요합니다.");
const IDS = scope === "core-3" ? CORE_IDS : MULTI_IDS;
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
for (const name of ["multi-object-scenario.mjs", "imported-material-scenario.mjs", "lettuce-material-scenario.mjs"]) {
  const scenarioSource = path.join(HERE, name);
  assert.equal(await realpath(scenarioSource), scenarioSource, "시나리오 모듈의 링크 경로는 허용하지 않습니다.");
}
let importedFixtureBytes, lettuceFixtureBytes;
assert.ok(path.isAbsolute(args.get("--out")), "출력은 아직 없는 절대 경로여야 합니다.");
const out = path.resolve(args.get("--out"));
assert.ok(out !== repo && out !== HERE && !out.startsWith(HERE + path.sep)
  && !out.startsWith(path.join(repo, "apps/web/src") + path.sep), "소스 안에 실행 결과를 쓰지 않습니다.");
await mkdir(path.dirname(out), { recursive: true });
await mkdir(out, { recursive: false });
const workMs = Number(args.get("--work-ms"));
assert.equal(workMs, 800_000, "scope별 검증도 원래 작업 상한 800초를 유지합니다.");
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
    "apps/web/vite.config.ts", "apps/web/vite-react-compiler-filter.ts", "package.json", "pnpm-lock.yaml", ...["browser.mjs", "passive-entry.ts", "source-server.mjs", "README.md", "multi-object-scenario.mjs", "imported-material-scenario.mjs", "lettuce-material-scenario.mjs"].map((name) => `${harnessRelative}/${name}`)])]
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
const runs = scope === "core-3"
  ? cases.map((item) => ({ id: item.variant.id, item, variantIds: [item.variant.id] }))
  : [{ id: scope === "multi-object" ? MULTI_CASE_ID : scope === "lettuce-template" ? LETTUCE_CASE_ID : IMPORTED_CASE_ID, item: null, variantIds: [...MULTI_IDS] }];
const { chromium } = createRequire(path.join(repo, "package.json"))("playwright");
const browserBinary = await realpath(args.get("--browser-binary"));
const events = [], results = [];
const receipt = { schema: scope === "core-3" ? "toonstudio.plasticine-actual-core.v3"
  : scope === "multi-object" ? "toonstudio.plasticine-actual-multi-object.v1" : scope === "lettuce-template" ? "toonstudio.plasticine-actual-lettuce-template.v1" : "toonstudio.plasticine-actual-imported-model.v1", scope, expectedHead,
  browserKind: "Chrome for Testing chromium channel", engine: "explicit WebGL2", originalResolution: true,
  startedAt: new Date(started).toISOString(), workMs, cleanupReserveMs: CLEANUP_MS,
  catalogSha256: sha(catalogBytes), sourcePins, sourceCheckpointBefore: sourceBefore, cases: results,
  plannedCaseIds: runs.map((run) => run.id), plannedVariantIds: [...IDS],
  notPlannedVariantIds: CORE_IDS.filter((id) => !IDS.includes(id)),
  sourceCheck: { method: "catalog-local-path-size-sha256", receivedHttpBodyShaVerified: false },
  observer: { url: observerUrl.href, sourceSha256: sha(observerSourceBytes), source: `${harnessRelative}/passive-entry.ts` },
  routingMayDisableHttpCache: true,
  full19Verified: false, safariVerified: false, installedChromeVerified: false, webgpuPerformanceVerified: false,
  webgpuAdapterObserved: false, webgpuDeviceObserved: false, backendEvidenceScope: "explicit-webgl2-owning-product-canvas",
  memorySoakVerified: false, glbExportVerified: false, productionVerified: false, retries: 0 };
let browser, browserCdp, failure;
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
/** 같은 허용 필터·실패 기준으로 정리 중 늦게 도착한 실제 이벤트도 검사한다. */
function assertCaseRuntimeEvents(result) {
  result.unexpectedConsoleErrors = result.consoleErrors.filter((message) => message !== "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector"
    && !message.startsWith("[vite] failed to connect to websocket."));
  assert.equal(result.contextLossEvents.length, 0, "제품 Canvas의 WebGL context lost 이벤트가 있습니다.");
  assert.equal(result.pageErrors.length, 0, "제품 페이지 예외가 있습니다.");
  assert.equal(result.unexpectedConsoleErrors.length, 0, "의도한 로컬 요청 차단 외의 콘솔 오류가 있습니다.");
  assert.equal(result.networkPolicyFailures.length, 0, "구매 원본 요청 URL 경계가 다릅니다.");
  assert.ok(result.network.every((entry) => entry.finished && !entry.failure && entry.status === 200), "원본 요청 실패가 있습니다.");
}
function recordEventRecheckFailure(result, phase, error) {
  result.status = "failed";
  result.failure ??= { message: error.message, stack: error.stack };
  result.eventRecheckFailures ??= [];
  result.eventRecheckFailures.push({ phase, message: error.message, stack: error.stack });
}
async function readPinnedFixture(expected, cleanup = false) {
  remaining(DOM_MS, cleanup);
  const file = expected.absolutePath ?? path.join(repo, expected.relativePath);
  assert.equal(await realpath(file), file, "입력 GLB·권리 근거의 링크 경로는 허용하지 않습니다.");
  const before = await lstat(file, { bigint: true });
  assert(before.isFile()); assert.equal(before.size, BigInt(expected.bytes));
  const bytes = await readFile(file); assert.equal(sha(bytes), expected.sha256, "입력 원본 SHA256이 다릅니다.");
  const after = await lstat(file, { bigint: true });
  assert.deepEqual([after.dev, after.ino, after.size, after.mtimeNs, after.mode, after.nlink],
    [before.dev, before.ino, before.size, before.mtimeNs, before.mode, before.nlink], "대조 중 원본이 바뀌었습니다.");
  return { bytes, pin: { path: expected.relativePath ?? path.basename(file), bytes: expected.bytes, sha256: expected.sha256,
    identity: [after.dev, after.ino, after.size, after.mtimeNs, after.mode, after.nlink].map(String) } };
}
async function verifyImportedFixture(cleanup = false) {
  const verified = [];
  for (const expected of [IMPORTED_FIXTURE, ...IMPORTED_FIXTURE.provenance]) {
    const { bytes, pin } = await readPinnedFixture(expected, cleanup);
    if (!cleanup && expected === IMPORTED_FIXTURE) importedFixtureBytes = bytes;
    verified.push(pin);
  }
  return { ...verified[0], provenance: verified.slice(1), licenseId: "CC0-1.0", provider: "Kenney" };
}
async function verifyLettuceSource(cleanup = false) {
  const value = await verifyLettuceFixture({ repo, file: args.get("--lettuce-file"), receiptFile: args.get("--lettuce-receipt"),
    readPinned: (expected) => readPinnedFixture(expected, cleanup) });
  if (!cleanup) lettuceFixtureBytes = value.buffer;
  return value.source;
}

async function verifyCatalogSources(cleanup = false) {
  const prefix = "/assets/virtual-studio/purchased-materials-v1/plasticine/maps/";
  assert.equal(catalog.schema, "toonstudio.purchased-surface-materials.v1");
  const expectedNames = new Set(), verified = [];
  for (const asset of catalog.assets) {
    remaining(DOM_MS, cleanup);
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
    const timer = setTimeout(() => stream.destroy(new Error("원본 대조 기한을 소진했습니다.")), remaining(LOAD_MS, cleanup));
    try { for await (const chunk of stream) { remaining(DOM_MS, cleanup); digest.update(chunk); } }
    finally { clearTimeout(timer); stream.destroy(); }
    assert.equal(digest.digest("hex"), asset.sha256, "로컬 원본 SHA256이 카탈로그와 다릅니다.");
    const after = await lstat(file, { bigint: true });
    assert.deepEqual([after.dev, after.ino, after.size, after.mtimeNs, after.mode, after.nlink],
      [before.dev, before.ino, before.size, before.mtimeNs, before.mode, before.nlink], "원본 대조 중 파일이 바뀌었습니다.");
    verified.push({ url: asset.url, bytes: asset.bytes, sha256: asset.sha256,
      identity: [after.dev, after.ino, after.size, after.mtimeNs, after.mode, after.nlink].map(String) });
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
// reader와 토큰의 수명은 같은 observe 함수 인스턴스에 묶인다. reload 전에 JSHandle을 해제한다.
const observerReaders = new Map();
let nextObserverEpoch = 1;
async function createStableObserverReader(page) {
  const expectedObserve = await page.evaluateHandle(() => {
    const observe = window.__plasticineActualObserver?.observe;
    if (typeof observe !== "function") throw new Error("실제 관측기 함수가 없습니다.");
    return observe;
  });
  const epoch = nextObserverEpoch++;
  let disposed = false;
  return {
    async read() {
      if (disposed) throw new Error("종료한 관측기 reader를 재사용할 수 없습니다.");
      const observation = await page.evaluate((expected) => {
        const current = window.__plasticineActualObserver;
        if (!current || current.observe !== expected) throw new Error("관측기가 교체돼 이전 WebGL 객체 식별자를 비교할 수 없습니다.");
        return current.observe();
      }, expectedObserve);
      return { ...observation, observerEpoch: epoch };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await expectedObserve.dispose();
    },
  };
}
async function releaseObserverReader(page) {
  const reader = observerReaders.get(page);
  if (!reader) return;
  observerReaders.delete(page);
  await bounded(reader.dispose(), remaining(5_000, true), "관측기 JSHandle 해제 기한");
}
async function readObservation(page) {
  const reader = observerReaders.get(page);
  assert.ok(reader, "같은 observe 함수에 고정된 reader가 없습니다.");
  const observation = await reader.read(); validateRenderer(observation);
  if (!receipt.hardwareProcessSnapshot) {
    receipt.hardwareProcessSnapshot = await browserCdp.send("SystemInfo.getProcessInfo");
    assert(receipt.hardwareProcessSnapshot.processInfo.some((entry) => /gpu/iu.test(entry.type)), "소유 Chrome의 실제 GPU 프로세스가 없습니다.");
    receipt.productOrigin = { origin: observation.origin, secureContext: observation.secureContext, backend: observation.backend };
  }
  return observation;
}
async function attachObserver(page) {
  assert.equal(observerReaders.has(page), false, "관측기를 다시 붙이기 전에 기존 JSHandle을 해제해야 합니다.");
  await page.addScriptTag({ type: "module", url: observerUrl.href });
  await until(() => page.evaluate(() => Boolean(window.__plasticineActualObserver)), DOM_MS, "수동 관측기를 로드하지 못했습니다.");
  observerReaders.set(page, await createStableObserverReader(page));
}
async function productCanvas(page) {
  const canvas = page.getByTestId("studio-bg3d-dialog").getByTestId("studio-bg3d-viewport").locator("canvas");
  await canvas.waitFor({ state: "attached", timeout: remaining() });
  assert.equal(await canvas.count(), 1, "실제 제품 viewport의 유일한 공유 Canvas가 아닙니다.");
  return canvas;
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
  await (await productCanvas(page)).waitFor({ state: "visible", timeout: remaining() });
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
  assert.equal(observation.backend, "webgl2"); assert.equal(observation.secureContext, true, "보안 제품 원점이 아닙니다.");
  assert.equal(observation.contextLost, false);
  assert.ok(observation.renderer && /Apple|Metal/iu.test(observation.renderer), "실제 Apple/Metal 하드웨어 renderer가 아닙니다.");
  assert.doesNotMatch(observation.renderer, /SwiftShader|llvmpipe|software/iu);
  assert.ok(observation.maxTextureSize >= 8192, "원본 8K를 수용하는 texture 한도가 아닙니다.");
}
function materialReady(observation, item) {
  validateRenderer(observation);
  if (observation.entities.length !== 1) return false;
  const mesh = observation.entities[0];
  if (!mesh.visible || !mesh.appearance || !mesh.program.linked) return false;
  for (const [channel, expected] of Object.entries(item.variant.maps)) {
    const actual = mesh.channels[channel];
    if (!expected) { if (actual !== null || mesh.program.samplers[channel] !== false) return false; continue; }
    if (!actual?.decoded || actual.sourceUrl !== expected.url || actual.width !== item.variant.resolution || actual.height !== item.variant.resolution) return false;
    if (!actual.sourceDataReady || !actual.gpuObjectAlive || actual.version <= 0 || actual.uploadedVersion !== actual.version
      || mesh.program.samplers[channel] !== true) return false;
    assert.equal(actual.colorSpace, channel === "baseColor" ? "srgb" : "");
    assert.deepEqual(actual.repeat, [1, 1]);
  }
  assert.deepEqual(mesh.normalScale, [1, 1]);
  assert.equal(mesh.normalMapType, 0);
  assert.equal(mesh.roughness, 1);
  assert.equal(mesh.metalness, item.variant.maps.metalness ? 1 : 0);
  assert.deepEqual(mesh.color, [1, 1, 1]);
  assert.equal(mesh.opacity, 1); assert.equal(mesh.transparent, false);
  assert.deepEqual(mesh.emissive, [0, 0, 0]); assert.equal(mesh.emissiveIntensity, 1); assert.equal(mesh.wireframe, false);
  return true;
}
function untexturedReady(observation) {
  validateRenderer(observation);
  if (observation.entities.length !== 1) return false;
  const mesh = observation.entities[0];
  return mesh.visible && mesh.appearance && mesh.program.linked
    && Object.values(mesh.channels).every((channel) => channel === null)
    && Object.values(mesh.program.samplers).every((active) => active === false);
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
  const bytes = await (await productCanvas(page)).screenshot({ type: "png", timeout: remaining() });
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

function appearancePreconditions(before, after) {
  assert.equal(before.entities.length, 1); assert.equal(after.entities.length, 1);
  assert.deepEqual(before.canvas, after.canvas, "표면 비교의 실제 Canvas 크기가 다릅니다.");
  const a = before.entities[0], b = after.entities[0], aa = a.appearance, ba = b.appearance;
  assert(aa && ba); assert.deepEqual(aa.geometry, ba.geometry, "저장 왕복의 표시 geometry/normal/UV가 다릅니다.");
  assert.deepEqual(aa.meshMatrixWorld, ba.meshMatrixWorld, "저장 왕복의 실제 mesh TRS가 다릅니다.");
  assert.deepEqual(aa.renderer, ba.renderer, "표면 비교의 renderer 색/톤/해상도 조건이 다릅니다.");
  assert.equal(aa.camera.type, ba.camera.type);
  const roundoffOnly = (x, y) => Number.isFinite(x) && Number.isFinite(y)
    && Math.abs(x - y) <= 64 * Number.EPSILON * Math.max(1, Math.abs(x), Math.abs(y));
  for (const field of ["matrixWorld", "matrixWorldInverse", "projection"]) {
    assert.equal(aa.camera[field].length, ba.camera[field].length);
    assert(aa.camera[field].every((value, index) => roundoffOnly(value, ba.camera[field][index])), `표면 비교의 실제 포털 camera.${field}가 다릅니다.`);
  }
  for (const field of ["left", "top", "width", "height"]) assert(roundoffOnly(aa.view[field], ba.view[field]), "실제 포털 viewport가 다릅니다.");
  assert.equal(aa.overlayBounds.length, ba.overlayBounds.length, "표면 위 실제 기즈모 개수가 다릅니다.");
  aa.overlayBounds.forEach((bounds, index) => {
    for (const field of ["left", "top", "right", "bottom"]) assert(roundoffOnly(bounds[field], ba.overlayBounds[index][field]), "표면 위 실제 기즈모 위치가 다릅니다.");
  });
  const surface = (mesh) => ({ color: mesh.color, roughness: mesh.roughness, metalness: mesh.metalness,
    opacity: mesh.opacity, transparent: mesh.transparent, emissive: mesh.emissive, emissiveIntensity: mesh.emissiveIntensity, wireframe: mesh.wireframe,
    normalMapType: mesh.normalMapType, normalScale: mesh.normalScale,
    channels: Object.fromEntries(Object.entries(mesh.channels).map(([key, value]) => [key, value ? {
      sourceUrl: value.sourceUrl, width: value.width, height: value.height, colorSpace: value.colorSpace, repeat: value.repeat,
    } : null])) });
  assert.deepEqual(surface(a), surface(b), "저장 왕복의 실제 표면 설정이 다릅니다.");
  return aa;
}
function requireSameSurface(delta, label) {
  assert(delta.comparedPixels > 100, "실제 geometry 내부의 표면 비교 픽셀이 부족합니다.");
  assert.equal(delta.changedPixelsAbove3, 0, label);
}

async function compareSurfaceAppearance(page, applied, reopened, observation, restored) {
  const surface = appearancePreconditions(observation, restored);
  return page.evaluate(async ({ first, second, surface, css }) => {
    const decode = async (encoded) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))], { type: "image/png" }));
      try {
        const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("표면 PNG 디코더가 없습니다.");
        context.drawImage(bitmap, 0, 0);
        return { width: bitmap.width, height: bitmap.height, pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
      } finally { bitmap.close(); }
    };
    const [a, b] = await Promise.all([decode(first), decode(second)]);
    if (a.width !== b.width || a.height !== b.height) throw new Error("표면 PNG 크기가 다릅니다.");
    const triangles = surface.projectedTriangles.map((triangle) => triangle.map((point) => ({ x: point.x * a.width / css.cssWidth, y: point.y * a.height / css.cssHeight })));
    const overlays = surface.overlayBounds.map((bounds) => ({ left: bounds.left * a.width / css.cssWidth - 2,
      right: bounds.right * a.width / css.cssWidth + 2, top: bounds.top * a.height / css.cssHeight - 2,
      bottom: bounds.bottom * a.height / css.cssHeight + 2 }));
    const edge = (point, from, to) => (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
    const inside = (point, triangle) => {
      const [a, b, c] = triangle, distances = [[a, b], [b, c], [c, a]].map(([from, to]) => edge(point, from, to));
      if (!distances.every((value) => value <= 0) && !distances.every((value) => value >= 0)) return false;
      // geometry가 정한 내부만 쓴다. 실루엣·wire의 AA 경계는 실제 PNG 2px 안쪽에서 제외한다.
      return [[a, b], [b, c], [c, a]].every(([from, to]) => Math.abs(edge(point, from, to)) / Math.hypot(to.x - from.x, to.y - from.y) >= 2);
    };
    const vertices = triangles.flat();
    const bounds = { left: Math.max(0, Math.floor(Math.min(...vertices.map((point) => point.x)))),
      top: Math.max(0, Math.floor(Math.min(...vertices.map((point) => point.y)))),
      right: Math.min(a.width, Math.ceil(Math.max(...vertices.map((point) => point.x)))),
      bottom: Math.min(a.height, Math.ceil(Math.max(...vertices.map((point) => point.y)))) };
    let comparedPixels = 0, changedPixelsAbove3 = 0, peakChannelDelta = 0;
    const pattern = [a, b].map(() => triangles.map(() => ({ pixels: 0, chromaticPixels: 0, colors: new Set() })));
    for (let y = bounds.top; y < bounds.bottom; y++) for (let x = bounds.left; x < bounds.right; x++) {
      const point = { x: x + 0.5, y: y + 0.5 };
      if (overlays.some((bounds) => point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom)) continue;
      const triangle = triangles.findIndex((triangle) => inside(point, triangle));
      if (triangle < 0) continue;
      comparedPixels++;
      const offset = (y * a.width + x) * 4; let changed = false;
      [a, b].forEach((image, imageIndex) => {
        const stats = pattern[imageIndex][triangle], [r, g, blue] = image.pixels.subarray(offset, offset + 3);
        stats.pixels++; if (Math.max(r, g, blue) - Math.min(r, g, blue) > 3) stats.chromaticPixels++;
        stats.colors.add(((r >> 2) << 12) | ((g >> 2) << 6) | (blue >> 2));
      });
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs(a.pixels[offset + channel] - b.pixels[offset + channel]);
        peakChannelDelta = Math.max(peakChannelDelta, delta); if (delta > 3) changed = true;
      }
      if (changed) changedPixelsAbove3++;
    }
    return { width: a.width, height: a.height, footprint: "actual-geometry-front-triangles-eroded-2-native-pixels-minus-visible-overlay-geometry-bounds",
      triangleCount: triangles.length, overlayCount: overlays.length, bounds, comparedPixels, changedPixelsAbove3, peakChannelDelta, threshold: 3,
      patterns: pattern.map((triangles) => triangles.map(({ pixels, chromaticPixels, colors }) => ({ pixels, chromaticPixels, quantizedColors: colors.size }))) };
  }, { first: applied.bytes.toString("base64"), second: reopened.bytes.toString("base64"), surface, css: observation.canvas });
}

try {
  if (scope === "imported-model") receipt.fixtureSource = await verifyImportedFixture();
  if (scope === "lettuce-template") receipt.fixtureSource = await verifyLettuceSource();
  receipt.sourceCheck = await verifyCatalogSources();
  event("source-check-complete", { files: receipt.sourceCheck.files, bytes: receipt.sourceCheck.bytes });
  event("browser-launch-start");
  browser = await chromium.launch({ channel: "chromium", executablePath: browserBinary, headless: true,
    timeout: remaining(30_000), args: ["--disable-background-networking", "--enable-automation"] });
  browserCdp = await browser.newBrowserCDPSession();
  receipt.browserVersion = browser.version();
  receipt.browserCommandLine = await browserCdp.send("Browser.getBrowserCommandLine");
  assert.equal(await realpath(receipt.browserCommandLine.arguments[0]), browserBinary, "실제 시작한 Chrome 바이너리가 다릅니다.");
  receipt.browserProcesses = await browserCdp.send("SystemInfo.getProcessInfo");
  for (const run of runs) {
    remaining();
    const item = run.item;
    const result = { id: run.id, status: "running", screenshots: [], network: [], networkPolicyFailures: [], pageErrors: [], consoleErrors: [], contextLossEvents: [], blockedRequests: [], actions: [] };
    if (scope !== "core-3") result.plannedVariantIds = [...run.variantIds];
    results.push(result); event("case-start", { id: result.id });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, locale: "ko-KR", serviceWorkers: "block" });
    const page = await context.newPage(); page.setDefaultTimeout(DOM_MS);
    await page.exposeBinding("__plasticineReportContextLoss", (_source, value) => result.contextLossEvents.push(value));
    await page.addInitScript(() => {
      // 이벤트를 취소하거나 render를 요청하지 않는다. 실제 Canvas의 손실만 외부 receipt에 전달한다.
      document.addEventListener("webglcontextlost", (event) => {
        if (event.target instanceof HTMLCanvasElement) window.__plasticineReportContextLoss({ at: performance.now(), canvasId: event.target.id });
      }, true);
    });
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
      if (scope !== "core-3") {
        const sharedCore = { origin, DOM_MS, LOAD_MS, remaining, until, bounded, openEditor,
          showPicker, readObservation, materialReady, untexturedReady, screenshot, compareSurfaceAppearance,
          requireSameSurface, releaseObserverReader };
        const scenario = scope === "multi-object" ? createMultiObjectScenario(sharedCore)
          : scope === "lettuce-template" ? createLettuceMaterialScenario(sharedCore, {
            name: LETTUCE_FIXTURE.fileName, mimeType: "model/gltf-binary", buffer: lettuceFixtureBytes,
          }) : createImportedMaterialScenario(sharedCore, { name: "chair.glb", mimeType: "model/gltf-binary", buffer: importedFixtureBytes });
        await scenario.run({ page, item01: cases.find((entry) => entry.variant.id === MULTI_IDS[0]),
          item11: cases.find((entry) => entry.variant.id === MULTI_IDS[1]), pending: () => pending, result });
        assert.equal(result.scenarioCompleted, true);
      } else {
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
      result.beforeCapture = await readObservation(page);
      assert(untexturedReady(result.beforeCapture), "첫 적용 전 실제 무맵 shader가 준비되지 않았습니다.");
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
      result.appliedCapture = await readObservation(page);
      assert(materialReady(result.appliedCapture, item), "첫 적용 PNG 시점의 실제 GPU 채널이 준비되지 않았습니다.");
      const viewport = page.getByTestId("studio-bg3d-dialog").getByTestId("studio-bg3d-viewport");
      await viewport.getByRole("button", { name: "실행 취소", exact: true }).click({ timeout: remaining() });
      result.actions.push({ action: "undo-material", at: Date.now() });
      result.undone = await until(async () => {
        const value = await readObservation(page);
        return value.frame > result.appliedCapture.frame && untexturedReady(value) ? value : false;
      }, DOM_MS, "재질 실행 취소 뒤 실제 무맵 shader가 복원되지 않았습니다.");
      const undone = await screenshot(page, result.id + "-undone.png");
      result.screenshots.push({ file: undone.file, sha256: undone.sha256 });
      result.undoneCapture = await readObservation(page);
      result.undoAppearance = await compareSurfaceAppearance(page, baseline, undone, result.beforeCapture, result.undoneCapture);
      requireSameSurface(result.undoAppearance, "실행 취소 뒤 최초 표면이 복원되지 않았습니다.");
      await viewport.getByRole("button", { name: "다시 실행", exact: true }).click({ timeout: remaining() });
      result.actions.push({ action: "redo-material", at: Date.now() });
      result.redone = await waitNaturalMaterial(page, item, result.undoneCapture.frame);
      const redone = await screenshot(page, result.id + "-redone.png");
      result.screenshots.push({ file: redone.file, sha256: redone.sha256 });
      result.redoneCapture = await readObservation(page);
      assert(materialReady(result.redoneCapture, item), "다시 실행 PNG 시점의 실제 GPU 채널이 준비되지 않았습니다.");
      result.redoAppearance = await compareSurfaceAppearance(page, rendered, redone, result.appliedCapture, result.redoneCapture);
      requireSameSurface(result.redoAppearance, "다시 실행 뒤 최초 재질 무늬가 복원되지 않았습니다.");
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
      const sourceColor = page.getByTestId("studio-bg3d-dialog").getByLabel("색상(셰이딩 미리보기 전용)", { exact: true });
      result.clearSourceColor = { before: await sourceColor.inputValue({ timeout: remaining() }) };
      assert.equal(result.clearSourceColor.before, "#ffffff", "대표 구매 원본의 제품 도형 색이 예상과 다릅니다.");
      await page.getByRole("button", { name: "표면 프리셋 해제", exact: true }).first().click({ timeout: remaining() });
      result.cleared = await until(async () => {
        const value = await readObservation(page);
        return value.frame > beforeClear.frame && untexturedReady(value) ? value : false;
      }, DOM_MS, "UI 해제 뒤 실제 원본 채널이 제거되지 않았습니다.");
      const cleared = await screenshot(page, result.id + "-cleared.png"); result.screenshots.push({ file: cleared.file, sha256: cleared.sha256 });
      result.clearedCapture = await readObservation(page);
      assert(untexturedReady(result.clearedCapture), "해제 PNG 시점의 실제 무맵 shader가 준비되지 않았습니다.");
      result.clearSourceColor.after = await sourceColor.inputValue({ timeout: remaining() });
      assert.equal(result.clearSourceColor.after, result.clearSourceColor.before, "프리셋 해제에서 제품 도형 색이 바뀌었습니다.");
      const clearedMesh = result.clearedCapture.entities[0];
      assert.deepEqual({ color: clearedMesh.color, roughness: clearedMesh.roughness, metalness: clearedMesh.metalness,
        opacity: clearedMesh.opacity, transparent: clearedMesh.transparent, emissive: clearedMesh.emissive,
        emissiveIntensity: clearedMesh.emissiveIntensity, wireframe: clearedMesh.wireframe },
      { color: [1, 1, 1], roughness: 1, metalness: 0, opacity: 1, transparent: false,
        emissive: [0, 0, 0], emissiveIntensity: 1, wireframe: false }, "프리셋 해제 뒤 실제 기본 표면 값이 다릅니다.");
      await releaseObserverReader(page);
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
      result.reopenedCapture = await readObservation(page);
      assert(materialReady(result.reopenedCapture, item), "재열기 PNG 시점의 실제 GPU 채널이 준비되지 않았습니다.");
      result.surfaceAppearance = await compareSurfaceAppearance(page, rendered, reopened, result.appliedCapture, result.reopenedCapture);
      requireSameSurface(result.surfaceAppearance, "최초 적용과 재열기의 실제 표면 무늬가 다릅니다.");
      for (const triangles of result.surfaceAppearance.patterns) assert(triangles.some((stats) => stats.chromaticPixels > 100 && stats.quantizedColors > 8),
        "기즈모를 제외한 실제 면 내부에 대표 원본의 비회색 공간 무늬가 없습니다.");
      }
      assertCaseRuntimeEvents(result);
      result.status = "passed";
    } catch (error) {
      result.status = "failed"; result.failure = { message: error.message, stack: error.stack };
      try { result.failureObservation = await readObservation(page); }
      catch (observationError) { result.failureObservationError = String(observationError); }
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
      try { await releaseObserverReader(page); result.observerHandleReleased = true; }
      catch (error) { result.observerCleanupError = String(error); result.status = "failed"; caseFailure ??= error; }
      try { await bounded(context.close({ reason: "대표 단일 검증 종료" }), remaining(15_000, true), "소유 context 정리 기한"); }
      catch (error) { result.contextCleanupError = String(error); result.status = "failed"; caseFailure ??= error; }
      finally {
        try { assertCaseRuntimeEvents(result); }
        catch (error) { recordEventRecheckFailure(result, "after-context-close", error); caseFailure ??= error; }
        result.eventsCheckedAfterContextCloseAttempt = true;
        result.eventsCheckedAfterContextClose = !result.contextCleanupError;
        await saveJson(result.id + ".json", result);
      }
    }
    if (caseFailure) throw caseFailure;
  }
  assert.equal(results.length, scope === "core-3" ? 3 : 1); assert.ok(results.every((entry) => entry.status === "passed"));
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
    if (receipt.sourceCheck.files === 59) {
      receipt.sourceCheckAfter = await verifyCatalogSources(true);
      assert.deepEqual(receipt.sourceCheckAfter, receipt.sourceCheck, "실행 중 구매 재질 59개 원본이 바뀌었습니다.");
    }
    if (scope === "imported-model" || scope === "lettuce-template") {
      receipt.fixtureSourceAfter = scope === "lettuce-template" ? await verifyLettuceSource(true) : await verifyImportedFixture(true);
      assert.deepEqual(receipt.fixtureSourceAfter, receipt.fixtureSource, "실행 전후 입력 GLB 원본이 다릅니다.");
    }
    receipt.productSourceUnchanged = true;
  } catch (error) { receipt.productSourceUnchanged = false; failure ??= { message: error.message }; }
  // browser 종료와 source 대조 뒤 같은 listener 배열을 다시 검사하고 case JSON도 최신 상태로 덮어쓴다.
  for (const result of results) {
    try { assertCaseRuntimeEvents(result); }
    catch (error) {
      recordEventRecheckFailure(result, "after-browser-close-and-source-check", error);
      failure ??= { message: error.message, stack: error.stack };
    }
    result.eventsCheckedAfterBrowserCloseAttempt = true;
    result.eventsCheckedAfterBrowserClose = receipt.browserClosed === true;
    try {
      const saveCap = remaining(5_000, true);
      await bounded(saveJson(result.id + ".json", result), saveCap, "최종 case 결과 저장 기한");
    }
    catch (error) {
      result.status = "failed"; result.finalResultSaveError = String(error);
      failure ??= { message: "최종 case JSON 저장 미완료", detail: String(error) };
    }
  }
  if (results.some((result) => result.status !== "passed")) failure ??= { message: "최종 case 실패 상태가 있습니다." };
  if (Date.now() >= cleanupDeadline) failure ??= { message: "절대 정리 기한을 넘었습니다." };
  receipt.failure = failure ?? null; receipt.status = failure ? "failed" : "passed";
  receipt.finishedAt = new Date().toISOString(); receipt.elapsedMs = Date.now() - started;
  receipt.withinCleanupDeadline = Date.now() < cleanupDeadline;
  receipt.executedCaseIds = results.map((entry) => entry.id);
  receipt.notExecutedCaseIds = runs.map((run) => run.id).filter((id) => !results.some((entry) => entry.id === id));
  receipt.passedCaseIds = results.filter((entry) => entry.status === "passed").map((entry) => entry.id);
  receipt.uiRequestedVariantIds = [...new Set(results.flatMap((entry) => entry.actions
    .filter((action) => action.action === "apply" && (scope === "core-3"
      || action.phase === "ui-requested" || action.phase === "natural-ready")).map((action) => action.variantId)))];
  receipt.naturalReadyVariantIds = scope === "core-3"
    ? results.filter((entry) => entry.applied).map((entry) => entry.id)
    : [...new Set(results.flatMap((entry) => entry.actions
      .filter((action) => action.action === "apply" && action.phase === "natural-ready").map((action) => action.variantId)))];
  // core-3의 기존 의미는 유지한다. 복수 객체는 시나리오 ID와 실제 요청한 재질 ID를 분리한다.
  receipt.notExecutedIds = scope === "core-3"
    ? IDS.filter((id) => !results.some((entry) => entry.id === id))
    : IDS.filter((id) => !receipt.uiRequestedVariantIds.includes(id));
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
