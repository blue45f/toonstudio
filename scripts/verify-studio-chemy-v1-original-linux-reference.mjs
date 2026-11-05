/** CI 전용: 같은 job의 현재 raw와 고정 원래 소스의 두 Canvas만 비교한다. 골든·제품 코드를 갱신하지 않는다. */
import { createHash } from "node:crypto";
import { decodePng } from "image-js";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, realpathSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { arch, platform, cpus, totalmem } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const ORIGINAL = "289effabfebec9fcb215063bc1a6eddee989e98a";
const TREE = "682884bddd2c4be61b048483b825f26a138a76b8";
const ENTRY = "scripts/studio-hybrid-topology-browser.ts";
const EXPORT_ONLY = "\nexport { element as __qaElement, draw as __qaDraw, planStudioMaterialBrush as __qaPlan };\n";
/** @param {string|Uint8Array} value */
export function originalChemySha256(value) { return createHash("sha256").update(value).digest("hex"); }
/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("검증 객체 형식이 다릅니다."); return /** @type {Record<string, unknown>} */ (value); }
/** @param {unknown} condition @param {string} message @returns {asserts condition} */
function check(condition, message) { if (!condition) throw new Error(message); }
/** @typedef {{path:string,gitBlobSha:string,sha256:string,bytes:number}} SourceFile */
/** @typedef {{sourceCommit:string,sourceTree:string,entry:string,sourceFileCount:number,totalSourceBytes:number,files:SourceFile[],referenceLock:{gitBlobSha:string,sha256:string},dependencies:Record<string,{version:string,integrity?:string,tarball?:string}>,browser:{browser:string,platform:string,architecture:string},positiveControls:{baselineSha256:string,observerSha256:string}} OriginalManifest */
/** @param {unknown} value @returns {OriginalManifest} */
export function assertOriginalChemyManifest(value) {
  const m = object(value), files = m.files;
  check(m.sourceCommit === ORIGINAL && m.sourceTree === TREE && m.entry === ENTRY, "원래 commit/tree/entry가 다릅니다.");
  check(m.sourceFileCount === 57 && m.totalSourceBytes === 626941 && Array.isArray(files) && files.length === 57, "원래 소스 폐쇄 집합의 크기가 다릅니다.");
  const names = new Set(); let bytes = 0;
  for (const entry of files) { const f = object(entry);
    check(typeof f.path === "string" && /^(?:apps\/web\/src|packages\/contracts\/src|scripts)\/[A-Za-z0-9_./-]+$/u.test(f.path) && !f.path.split("/").includes("..") && !names.has(f.path), "원래 소스 경로가 중복되거나 허용 범위를 벗어났습니다.");
    check(typeof f.gitBlobSha === "string" && /^[a-f0-9]{40}$/u.test(f.gitBlobSha) && typeof f.sha256 === "string" && /^[a-f0-9]{64}$/u.test(f.sha256) && typeof f.bytes === "number" && Number.isSafeInteger(f.bytes) && f.bytes > 0, "원래 소스 지문이 올바르지 않습니다.");
    names.add(f.path); bytes += f.bytes;
  }
  check(names.has(ENTRY) && bytes === 626941, "원래 entry 또는 소스 바이트가 다릅니다.");
  const lock = object(m.referenceLock); check(typeof lock.gitBlobSha === "string" && /^[a-f0-9]{40}$/u.test(lock.gitBlobSha) && typeof lock.sha256 === "string" && /^[a-f0-9]{64}$/u.test(lock.sha256), "원래 lock 지문이 없습니다.");
  const dependencies = object(m.dependencies), mixbox = object(dependencies.mixbox), env = object(m.browser);
  check(mixbox.version === "2.0.0" && typeof mixbox.integrity === "string" && mixbox.integrity.startsWith("sha512-") && mixbox.tarball === "https://registry.npmjs.org/mixbox/-/mixbox-2.0.0.tgz", "원래 Mixbox 의존성이 다릅니다.");
  for (const [name, version] of Object.entries({"spectral.js":"3.0.0",colormix:"3.2.0",vite:"8.3.4",playwright:"1.64.1"})) check(object(dependencies[name]).version === version, "원래 의존성 pin이 다릅니다: " + name);
  const controls = object(m.positiveControls); for (const key of ["baselineSha256", "observerSha256"]) check(typeof controls[key] === "string" && /^[a-f0-9]{64}$/u.test(controls[key]), "고정 positive control 지문이 없습니다.");
  check(env.browser === "156.0.8078.4" && env.platform === "linux" && env.architecture === "x64", "독립 Linux 환경이 다릅니다.");
  return /** @type {OriginalManifest} */ (/** @type {unknown} */ (m));
}
/** @param {string} source @param {string} expected */
export function instrumentOriginalChemyEntry(source, expected) {
  check(originalChemySha256(source) === expected, "계측 전 원래 entry 지문이 다릅니다.");
  return source + EXPORT_ONLY;
}
/** @typedef {{inputSha256:string,geometrySha256:string,opacitySha256:string,raw:Uint8Array,png:Uint8Array}} ByteSide */
/** @param {{low:ByteSide,high:ByteSide}} reference @param {{low:ByteSide,high:ByteSide}} current */
export function compareOriginalChemyBytePairs(reference, current) {
  return Object.fromEntries(["low", "high"].map((side) => {
    const key = /** @type {"low"|"high"} */ (side), a = reference[key], b = current[key];
    for (const field of ["inputSha256", "geometrySha256", "opacitySha256"]) {
      const k = /** @type {"inputSha256"|"geometrySha256"|"opacitySha256"} */ (field);
      check(/^[a-f0-9]{64}$/u.test(a[k]) && a[k] === b[k], `${side} 원래/현재 ${field}가 다릅니다.`);
    }
    check(a.raw.length === 640 * 480 * 4 && b.raw.length === a.raw.length, `${side} raw 크기가 다릅니다.`);
    check(originalChemySha256(a.raw) === originalChemySha256(b.raw), `${side} raw RGBA가 정확히 같지 않습니다.`);
    for (const [label, image] of [["original", a], ["current", b]]) {
      const decoded = decodePng(image.png).getRawImage();
      check(decoded.width === 640 && decoded.height === 480 && decoded.channels === 4 && decoded.bitDepth === 8, `${side} ${label} PNG 크기/채널이 다릅니다.`);
      check(originalChemySha256(decoded.data) === originalChemySha256(image.raw), `${side} ${label} PNG decode가 자기 raw와 다릅니다.`);
    }
    return [side, { rawRgbaSha256: originalChemySha256(a.raw), originalPngSha256: originalChemySha256(a.png), currentPngSha256: originalChemySha256(b.png), decodedPngMatchesOwnRaw: true, exact: true }];
  }));
}
/** @param {string} url @param {string} origin @param {Set<string>} sourcePaths @param {Set<string>} allowedFsFiles @param {string[]} allowedFsRoots */
export function originalChemyRequestAllowed(url, origin, sourcePaths, allowedFsFiles, allowedFsRoots) {
  let parsed; try { parsed = new URL(url); } catch { return false; } if (parsed.origin !== origin) return false;
  let path; try { path = decodeURIComponent(parsed.pathname); } catch { return false; }
  if (path.includes("\\") || path.split("/").includes("..") || path.startsWith("/api/")) return false;
  if (["/__original_chemy__", "/__qa/driver.ts", "/__qa/observe.ts", "/@vite/client"].includes(path)) return true;
  if (sourcePaths.has(path.slice(1))) return true;
  if (!path.startsWith("/@fs/")) return false;
  const file = path.slice(4);
  return (allowedFsFiles.has(file) || allowedFsRoots.some((root) => file === root || file.startsWith(root + "/"))) && /\.(?:[cm]?js|ts|json|map)$/u.test(file);
}
/** @param {string} base @param {string} name */
function localFile(base, name) { check(/^[a-zA-Z0-9_.-]+$/u.test(name), "진단 파일명에 경로가 포함됐습니다."); const file = realpathSync(join(base, name)); check(file.startsWith(realpathSync(base) + sep), "진단 파일이 자체 경로 밖을 가리킵니다."); return file; }
/** @param {string} file */
function jsonFile(file) { return JSON.parse(readFileSync(file, "utf8")); }
/** @param {string} name @param {string} entry */
function packageRoot(name, entry) { let dir = dirname(entry); while (dirname(dir) !== dir) { const file = join(dir, "package.json"); if (existsSync(file) && jsonFile(file).name === name) return dir; dir = dirname(dir); } throw new Error(name + " 패키지 경로가 없습니다."); }
/** @param {string} command @param {string[]} args @param {string} cwd @param {string|undefined} input */
function command(command, args, cwd, input = undefined) { const r = spawnSync(command, args, { cwd, input, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 45000, maxBuffer: 4 * 1024 * 1024 }); check(!r.error && r.status === 0, command + " 실패: " + (r.error?.message ?? r.stderr)); return r.stdout; }
/** @param {OriginalManifest} manifest @param {string} dir */
export function sourceFence(manifest, dir) { return manifest.files.map((file) => { const data = readFileSync(join(dir, file.path)); const hash = originalChemySha256(data), blob = createHash("sha1").update("blob " + data.length + "\0").update(data).digest("hex"); check(data.length === file.bytes && hash === file.sha256 && blob === file.gitBlobSha, "원래 소스 지문 변경: " + file.path); return { path: file.path, sha256: hash }; }); }
/** @param {OriginalManifest} manifest @param {string} dir */
export async function fetchOriginalSources(manifest, dir) {
  mkdirSync(dir); command("git", ["init", "--quiet"], dir);
  command("git", ["remote", "add", "origin", "https://github.com/blue45f/toonstudio.git"], dir);
  command("git", ["config", "remote.origin.promisor", "true"], dir);
  command("git", ["config", "remote.origin.partialclonefilter", "blob:none"], dir);
  command("git", ["sparse-checkout", "init", "--no-cone"], dir);
  command("git", ["sparse-checkout", "set", "--no-cone", "--stdin"], dir, manifest.files.map((f) => "/" + f.path).join("\n") + "\n");
  command("git", ["fetch", "--no-tags", "--depth=1", "--filter=blob:none", "origin", ORIGINAL], dir);
  command("git", ["checkout", "--detach", "FETCH_HEAD"], dir);
  check(command("git", ["rev-parse", "HEAD"], dir).trim() === ORIGINAL && command("git", ["rev-parse", "HEAD^{tree}"], dir).trim() === TREE, "원래 checkout SHA/tree가 다릅니다.");
  const lock = command("git", ["show", "HEAD:pnpm-lock.yaml"], dir);
  check(originalChemySha256(lock) === manifest.referenceLock.sha256 && command("git", ["rev-parse", "HEAD:pnpm-lock.yaml"], dir).trim() === manifest.referenceLock.gitBlobSha, "원래 lock 지문이 다릅니다.");
  return sourceFence(manifest, dir);
}
/** @param {OriginalManifest} manifest @param {string} dir */
export async function fetchMixbox(manifest, dir) {
  const dependency = manifest.dependencies.mixbox; check(dependency.tarball && dependency.integrity, "Mixbox pin이 없습니다.");
  const response = await fetch(dependency.tarball, { redirect: "error", signal: AbortSignal.timeout(45000) }); check(response.ok && response.body, "원래 Mixbox tarball을 읽지 못했습니다.");
  const chunks = []; let bytes = 0; for await (const chunk of response.body) { bytes += chunk.length; check(bytes <= 8 * 1024 * 1024, "Mixbox tarball 상한을 넘었습니다."); chunks.push(chunk); }
  const archive = Buffer.concat(chunks); check("sha512-" + createHash("sha512").update(archive).digest("base64") === dependency.integrity, "원래 lock의 Mixbox SHA512와 다릅니다.");
  mkdirSync(dir); const file = join(dir, "mixbox-2.0.0.tgz"); writeFileSync(file, archive);
  const names = command("tar", ["-tzf", file], dir).trim().split("\n"); check(names.every((n) => n.startsWith("package/") && !n.split("/").includes("..")), "Mixbox archive 경로가 올바르지 않습니다.");
  const extracted = join(dir, "package"); mkdirSync(extracted); command("tar", ["-xzf", file, "--strip-components=1", "--no-same-owner", "--no-same-permissions", "-C", extracted], dir);
  const pkg = jsonFile(join(extracted, "package.json")); check(pkg.name === "mixbox" && pkg.version === "2.0.0", "원래 Mixbox package가 다릅니다.");
  const main = realpathSync(join(extracted, pkg.main ?? "index.js")); check(main.startsWith(realpathSync(extracted) + sep), "Mixbox main이 외부를 가리킵니다.");
  return { entry: main, root: extracted, tarballBytes: archive.length, integrity: dependency.integrity, installScriptsRun: false };
}
/**
 * fence·브라우저·서버 정리를 각각 시도하고 receipt 저장 뒤 모든 실패를 호출자에게 전달한다.
 * @param {{exitCode:number,finalizationFailures?:{stage:string,message:string}[]}} receipt
 * @param {{name:string,run:()=>void|Promise<void>}[]} tasks
 * @param {()=>void|Promise<void>} saveReceipt
 * @param {unknown[]} originalFailures
 */
export async function finalizeOriginalChemyReferenceRun(receipt, tasks, saveReceipt, originalFailures = []) {
  const failures = [...originalFailures];
  receipt.finalizationFailures = [];
  for (const task of tasks) {
    try { await task.run(); }
    catch (error) {
      receipt.finalizationFailures.push({ stage: task.name, message: String(error) });
      failures.push(new Error(task.name + ": " + String(error), { cause: error }));
    }
  }
  receipt.exitCode = failures.length ? 1 : 0;
  try { await saveReceipt(); }
  catch (error) {
    receipt.exitCode = 1;
    failures.push(new Error("receipt 저장: " + String(error), { cause: error }));
  }
  if (failures.length) throw new AggregateError(failures, "원래 Chemy 참조 수집·fence·정리에 실패했습니다.");
}

async function run() {
  const args = process.argv.slice(2); check(args.length === 4 && args[0] === "--current" && args[2] === "--out", "--current DIR --out DIR만 허용합니다.");
  check(platform() === "linux" && arch() === "x64" && process.env.RUNNER_TEMP, "Linux x64 CI 임시 경로가 필요합니다.");
  const temp = realpathSync(process.env.RUNNER_TEMP), current = realpathSync(args[1]); check(current.startsWith(temp + sep), "현재 raw가 같은 job의 RUNNER_TEMP 밖에 있습니다.");
  const output = resolve(args[3]); check(output.startsWith(temp + sep), "결과 경로가 RUNNER_TEMP 밖에 있습니다."); mkdirSync(output, { recursive: true });
  const startedAt = new Date().toISOString(), started = performance.now();
  const receipt = { startedAt, endedAt: "", exitCode: 1, purpose: "독립 원래 Linux source 비교; 기존 15% gate/골든/환경목록은 변경하지 않음", referenceCommit: ORIGINAL, sourceBefore: [], sourceAfter: [], ownPort: 0, browserClosed: false, serverClosed: false, diagnostics: [], blocked: [] };
  /** @type {import('playwright').Browser|undefined} */ let browser;
  /** @type {import('vite').ViteDevServer|undefined} */ let vite;
  let timeout;
  /** @type {OriginalManifest|undefined} */ let manifestForFence;
  /** @type {string|undefined} */ let referenceForFence;
  /** @type {unknown[]} */ const originalFailures = [];
  try {
    const manifest = assertOriginalChemyManifest(jsonFile(join(REPO, "scripts/fixtures/studio-chemy-v1-pressure/original-source-manifest.json")));
    const baselineFile = join(REPO, "scripts/fixtures/studio-chemy-v1-pressure/baseline.json");
    check(originalChemySha256(readFileSync(baselineFile)) === manifest.positiveControls.baselineSha256, "공유 baseline 지문이 다릅니다.");
    const baseline = jsonFile(baselineFile);
    const actual = jsonFile(localFile(current, "report.json")), env = actual.environment;
    check(env.browser === manifest.browser.browser && env.platform === "linux" && env.architecture === "x64" && env.node === process.version && env.cpu === cpus()[0]?.model && env.memoryBytes === totalmem(), "현재 raw가 동일 runner/browser/node 환경의 관측이 아닙니다.");
    check(command("git", ["rev-parse", "HEAD"], REPO).trim() === process.env.GITHUB_SHA, "현재 checkout/GITHUB_SHA가 다릅니다.");
    check(actual.reviewOnly === true && actual.backend === "real-browser-canvas2d" && actual.successfulDrawCalls?.low === 1 && actual.successfulDrawCalls?.high === 1 && actual.pressureFailureArtifacts?.length === 1 && actual.pressureFailureArtifactErrors?.length === 0 && actual.diagnostics?.length === 0, "같은 job의 명시적 2draw 진단 수집이 완전하지 않습니다.");
    const captured = actual.pressureFailureArtifacts.find((a) => a.id === "klecks-chemy"); check(captured && actual.observation, "같은 job의 현재 2draw raw가 없습니다.");
    const currentPair = {};
    for (const side of ["low", "high"]) {
      const image = captured[side], input = readFileSync(localFile(current, image.inputFile)), raw = readFileSync(localFile(current, image.rawRgbaFile)), png = readFileSync(localFile(current, image.pngFile));
      check(originalChemySha256(input) === baseline.sourceSha256[side] && image.inputSha256 === baseline.sourceSha256[side], side + " 현재 입력 positive control이 다릅니다.");
      check(image.primitive.orderedGeometrySha256 === baseline.orderedGeometrySha256 && image.primitive.opacitySha256 === baseline.opacitySha256[side] && image.primitive.count === baseline.snapshot.markCount, side + " 현재 기하/절대opacity가 다릅니다.");
      check(originalChemySha256(raw) === image.rawRgbaSha256 && image.width === 640 && image.height === 480, side + " 현재 raw 지문이 다릅니다.");
      currentPair[side] = { inputSha256: image.inputSha256, geometrySha256: image.primitive.orderedGeometrySha256, opacitySha256: image.primitive.opacitySha256, raw, png };
    }
    const require = createRequire(join(REPO, "package.json")), aliases = {}, dependencyRoots = [];
    for (const [name, specifier] of [["vite", "vite"], ["playwright", "playwright"], ["spectral.js", "spectral.js"], ["colormix", "colormix/dist/index.mjs"]]) {
      const entry = require.resolve(specifier), dir = packageRoot(name, entry); check(jsonFile(join(dir, "package.json")).version === manifest.dependencies[name].version, name + " pin이 원래/current lock과 다릅니다.");
      if (name === "spectral.js" || name === "colormix") aliases[specifier] = entry; dependencyRoots.push(dir);
    }
    const work = mkdtempSync(join(temp, "chemy-original-reference-")), reference = join(work, "source");
    manifestForFence = manifest; referenceForFence = reference;
    receipt.sourceBefore = await fetchOriginalSources(manifest, reference); const mixbox = await fetchMixbox(manifest, join(work, "mixbox")); aliases.mixbox = mixbox.entry; dependencyRoots.push(mixbox.root);
    const policyPath = join(REPO, "scripts/lib/studio-chemy-v1-pressure-policy.ts"), policyCode = readFileSync(policyPath, "utf8"), cache = join(work, "vite-cache");
    check(originalChemySha256(policyCode) === manifest.positiveControls.observerSha256, "공유 observer 지문이 다릅니다.");
    receipt.currentSourceBefore = { sha: process.env.GITHUB_SHA, baselineSha256: manifest.positiveControls.baselineSha256, observerSha256: manifest.positiveControls.observerSha256 };
    const entryFile = join(reference, ENTRY), originalCode = readFileSync(entryFile, "utf8"), entryExpected = manifest.files.find((f) => f.path === ENTRY); check(entryExpected, "원래 entry가 manifest에 없습니다.");
    const instrumented = instrumentOriginalChemyEntry(originalCode, entryExpected.sha256);
    const qaDriver = `import { __qaElement, __qaDraw, __qaPlan } from '/${ENTRY}'; import { mapBrushStudioV6Pressure } from '/apps/web/src/domains/creator/brush-lab/brush-studio-v6-material-engine.ts'; import { chemySha256, inspectLegacyChemyPrimitives, observeChemyPixels } from '/__qa/observe.ts'; export async function capture(baseline){const inputs={low:__qaElement('klecks-chemy',0.15),high:__qaElement('klecks-chemy',0.85)}, images={low:__qaDraw(inputs.low),high:__qaDraw(inputs.high)}, marks={low:__qaPlan(inputs.low),high:__qaPlan(inputs.high)}, result={}; for(const side of ['low','high']){const input=inputs[side],image=images[side],plan=marks[side]; result[side]={input:JSON.stringify(input),inputSha256:await chemySha256(JSON.stringify(input)),geometrySha256:await chemySha256(JSON.stringify(plan.map(({opacity,...m})=>m))),opacitySha256:await chemySha256(JSON.stringify(plan.map(m=>m.opacity))),count:plan.length,width:image.target.width,height:image.target.height,mappedPressure:mapBrushStudioV6Pressure(input.pressures[0],input.brushEnginePrograms.material.input),pixels:await observeChemyPixels(image.rgba,baseline.pixels[side].fixturePngSha256),raw:Array.from(image.rgba),png:image.target.toDataURL('image/png')};} result.primitive=await inspectLegacyChemyPrimitives(marks.low,marks.high,baseline.snapshot.mappedPressures);return result;}`;
    const { createServer } = await import("vite"); const { chromium } = await import("playwright");
    const paths = new Set(manifest.files.map((f) => f.path)), virtual = { "/__qa/driver.ts": qaDriver, "/__qa/observe.ts": policyCode };
    vite = await createServer({ configFile: false, envDir: false, publicDir: false, root: reference, cacheDir: cache, resolve: { alias: aliases }, optimizeDeps: { entries: [entryFile], include: ["mixbox", "spectral.js", "colormix/dist/index.mjs"] }, server: { host: "127.0.0.1", port: 0, fs: { allow: [reference, work, ...dependencyRoots] } }, plugins: [{ name: "frozen-original-chemy-export-only", enforce: "pre", configureServer(server) { server.middlewares.use((req, res, next) => { if (req.url !== "/__original_chemy__") return next(); res.setHeader("Content-Type", "text/html"); res.end("<!doctype html><title>Frozen original Chemy two Canvas</title>"); }); }, resolveId(id, importer) { if (Object.hasOwn(virtual, id)) return id;
      if (importer?.startsWith(reference + sep) && id.startsWith(".")) {
        const base = resolve(dirname(importer.split("?")[0]), id), target = [base, base + ".ts", base + ".tsx", join(base, "index.ts")].find((file) => paths.has(file.slice(reference.length + 1)));
        check(target, "원래 manifest 밖 relative import: " + id); return target;
      } if (importer?.startsWith(reference) && id.startsWith("@toonstudio/contracts/")) { const file = "packages/contracts/src/" + id.slice("@toonstudio/contracts/".length) + ".ts"; check(paths.has(file), "원래 namespace 밖 contract import"); return join(reference, file); } if (importer?.startsWith(reference) && id.startsWith("@/")) { const file = "apps/web/src/" + id.slice(2); const target = [file, file + ".ts", file + ".tsx"].find((f) => paths.has(f)); check(target, "원래 namespace 밖 @ import"); return join(reference, target); } }, load(id) { if (id.startsWith(reference + sep)) check(paths.has(id.split("?")[0].slice(reference.length + 1)), "원래 manifest 밖 local load"); return Object.hasOwn(virtual, id) ? virtual[id] : undefined; }, transform(code, id) { if (id.split("?")[0] === entryFile) { check(code === originalCode, "원래 entry가 계측 전에 변경됐습니다."); return { code: instrumented, map: null }; } } }] });
    await vite.listen(); const address = vite.httpServer?.address(); check(address && typeof address !== "string" && ![4111, 55467].includes(address.port), "독립 원래 server port가 올바르지 않습니다."); receipt.ownPort = address.port;
    const origin = "http://127.0.0.1:" + address.port; browser = await chromium.launch({ headless: true }); check(browser.version() === env.browser, "현재 raw와 다른 Chromium입니다.");
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
    await context.route("**/*", async (route) => { if (originalChemyRequestAllowed(route.request().url(), origin, paths, new Set(manifest.files.map((f) => join(reference, f.path))), [cache, ...dependencyRoots])) await route.continue(); else { receipt.blocked.push(new URL(route.request().url()).pathname); await route.abort(); } });
    await context.routeWebSocket("**/*", (route) => { const u = new URL(route.url()); if (u.protocol === "ws:" && u.hostname === "127.0.0.1" && u.port === String(address.port) && u.pathname === "/" && u.searchParams.has("token")) route.connectToServer(); else { receipt.blocked.push("websocket:" + u.pathname); route.close(); } });
    const page = await context.newPage(); page.on("pageerror", (e) => receipt.diagnostics.push(e.message)); page.on("console", (m) => { if (m.type() === "error") receipt.diagnostics.push(m.text()); });
    timeout = setTimeout(() => { void browser?.close(); void vite?.close(); }, 150000);
    await page.goto(origin + "/__original_chemy__", { waitUntil: "load", timeout: 60000 });
    const result = await page.evaluate(async ({ baseline, driverUrl }) => {
      const qa = await import(driverUrl);
      return qa.capture(baseline);
    }, { baseline, driverUrl: "/__qa/driver.ts" });
    const referencePair = {};
    for (const side of ["low", "high"]) { const image = result[side]; check(image.inputSha256 === baseline.sourceSha256[side] && image.geometrySha256 === baseline.orderedGeometrySha256 && image.opacitySha256 === baseline.opacitySha256[side] && image.count === 1758 && image.width === 640 && image.height === 480 && image.mappedPressure === baseline.snapshot.mappedPressures[side === "low" ? 0 : 1], side + " 원본 입력/기하/opacity positive control 실패"); const raw = Buffer.from(image.raw), png = Buffer.from(image.png.split(",")[1], "base64"); check(raw.length === 1228800 && originalChemySha256(raw) === image.pixels.rgbaSha256, side + " 원래 raw 지문 불일치"); writeFileSync(join(output, "original-" + side + ".rgba"), raw); writeFileSync(join(output, "original-" + side + ".png"), png); writeFileSync(join(output, "original-" + side + ".input.json"), image.input); referencePair[side] = { inputSha256: image.inputSha256, geometrySha256: image.geometrySha256, opacitySha256: image.opacitySha256, raw, png }; delete image.raw; delete image.png; }
    check(result.primitive.invalidMarks === 0 && result.primitive.proportionalityViolations === 0 && !receipt.blocked.length && !receipt.diagnostics.length, "원래 참조 primitive/진단 경계 실패");
    const comparison = compareOriginalChemyBytePairs(referencePair, currentPair); receipt.sourceAfter = sourceFence(manifest, reference); check(JSON.stringify(receipt.sourceBefore) === JSON.stringify(receipt.sourceAfter), "원래 소스 before/after fence 불일치");
    receipt.currentSourceAfter = { sha: command("git", ["rev-parse", "HEAD"], REPO).trim(), baselineSha256: originalChemySha256(readFileSync(baselineFile)), observerSha256: originalChemySha256(readFileSync(policyPath)) };
    check(JSON.stringify(receipt.currentSourceBefore) === JSON.stringify(receipt.currentSourceAfter), "현재 source/baseline/observer before/after 지문이 다릅니다.");
    writeFileSync(join(output, "comparison.json"), JSON.stringify({ purpose: receipt.purpose, currentSourceSha: process.env.GITHUB_SHA, currentEnvironment: env, originalSourceSha: ORIGINAL, originalTree: TREE, successfulDrawCalls: { low: 1, high: 1 }, currentRawRedrawn: false, comparison, observation: result, mixbox: { version: "2.0.0", integrity: mixbox.integrity, tarballBytes: mixbox.tarballBytes, installScriptsRun: false }, instrumentation: { beforeSha256: originalChemySha256(originalCode), appendedExportSha256: originalChemySha256(EXPORT_ONLY), transformedSha256: originalChemySha256(instrumented), currentObserverSha256: originalChemySha256(policyCode) }, originalMinimumExclusive: 1.15, originalAggregatePasses: result.high.pixels.alphaMass / result.low.pixels.alphaMass > 1.15, policyOrGoldenUpdated: false }, null, 2) + "\n"); receipt.exitCode = 0;
  } catch (error) { receipt.failure = String(error); originalFailures.push(error); }
  finally {
    clearTimeout(timeout);
    await finalizeOriginalChemyReferenceRun(receipt, [
      { name: "현재 source fence", run() {
        if (!receipt.currentSourceBefore) return;
        receipt.currentSourceAfter = { sha: command("git", ["rev-parse", "HEAD"], REPO).trim(), baselineSha256: originalChemySha256(readFileSync(join(REPO, "scripts/fixtures/studio-chemy-v1-pressure/baseline.json"))), observerSha256: originalChemySha256(readFileSync(join(REPO, "scripts/lib/studio-chemy-v1-pressure-policy.ts"))) };
        check(JSON.stringify(receipt.currentSourceBefore) === JSON.stringify(receipt.currentSourceAfter), "현재 source/baseline/observer before/after 지문이 다릅니다.");
      } },
      { name: "원래 source fence", run() {
        if (!manifestForFence || !referenceForFence || !receipt.sourceBefore.length) return;
        receipt.sourceAfter = sourceFence(manifestForFence, referenceForFence);
        check(JSON.stringify(receipt.sourceBefore) === JSON.stringify(receipt.sourceAfter), "원래 소스 before/after fence 불일치");
      } },
      { name: "브라우저 종료", async run() {
        try { await browser?.close(); }
        finally { receipt.browserClosed = !browser || !browser.isConnected(); }
        check(receipt.browserClosed, "독립 브라우저가 종료되지 않았습니다.");
      } },
      { name: "서버 종료", async run() {
        try { await vite?.close(); }
        finally { receipt.serverClosed = !vite?.httpServer?.listening; }
        check(receipt.serverClosed, "독립 서버가 종료되지 않았습니다.");
      } },
    ], () => {
      receipt.endedAt = new Date().toISOString(); receipt.elapsedMs = performance.now() - started;
      writeFileSync(join(output, "run-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
    }, originalFailures);
  }
}
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) run().catch((error) => { console.error(String(error)); process.exitCode = 1; });
