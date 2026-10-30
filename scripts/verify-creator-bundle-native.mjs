#!/usr/bin/env node
/**
 * 사용: node scripts/verify-creator-bundle-native.mjs --asset-root <private ingest> \
 *   --base-url http://127.0.0.1:<Vite port> [--out <local evidence directory>]
 *   [--reuse-validation <같은 카탈로그로 성공한 증거 폴더>]
 *   [--expected-intake licensed-20261029] (Cemetery50+SmallProps115의 paired 편입 검수)
 *   [--expected-intake atlas-20261030] (기존 1929+Nature 3300의 전수 검증과 11대표 렌더)
 * 원격 요청/업로드 없이 공개 SHA URL만 private 검증 바이트로 응답한다. 출력은 로컬 증거와 계획뿐이다.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { WEB_PUBLIC } from "./lib/repo-paths.mjs";
import { loadPackRightsLedger } from "./lib/creator-bundle-pack-rights.mjs";
import { createBundleV2DeployPlan } from "./plan-creator-bundle-deploy.mjs";
import { RELEASE_DESCRIPTOR_PATH, STATIC_URL_PREFIX } from "./publish-creator-bundle-release.mjs";
import { assertNativeBundleReleaseCurrent, loadNativeBundleRelease } from "./lib/creator-bundle-native-release.mjs";
import { ATLAS_NATIVE_INTAKE, assertPrivateNativeBody, isSupportedNativeIntake, nativeCatalogRightsProblems, nativeProofProblems, reusableNativeValidationProblems, selectNativeRepresentatives } from "./lib/creator-bundle-native-proof.mjs";

const options = {};
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!["--asset-root", "--base-url", "--out", "--lane", "--reuse-validation", "--expected-intake"].includes(key) || !process.argv[index + 1]) {
    throw new Error("--asset-root, --base-url, --out, --lane, --reuse-validation, --expected-intake 옵션과 값을 확인하세요.");
  }
  options[key.slice(2)] = process.argv[++index];
}
if (!options["asset-root"] || !options["base-url"]) throw new Error("private --asset-root와 로컬 Vite --base-url이 필요합니다.");
const origin = new URL(options["base-url"]);
if (origin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)
  || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
  throw new Error("--base-url은 자격증명 없는 로컬 HTTP origin만 허용합니다.");
}
const lane = options.lane ?? "hardware";
if (!["hardware", "swiftshader"].includes(lane)) throw new Error("--lane은 hardware 또는 swiftshader여야 합니다.");
const expectedIntake = options["expected-intake"];
if (!isSupportedNativeIntake(expectedIntake)) throw new Error("--expected-intake는 licensed-20261029 또는 atlas-20261030만 지원합니다. 명시한 편입 버전을 확인하세요.");
const output = options.out ? resolve(options.out) : mkdtempSync(join(tmpdir(), "toonstudio-bundle-native-"));
if (output === WEB_PUBLIC || output.startsWith(`${WEB_PUBLIC}${sep}`)) throw new Error("검증 출력은 public 밖이어야 합니다.");
mkdirSync(output, { recursive: true });
const themePath = join(WEB_PUBLIC, "assets/3d/environments/bundle-v1/theme-packs.json");
// 옛 모드는 역사 1929 catalog를 보존하고 새 Atlas 모드만 빌드 고정 release를 읽는다.
const release = expectedIntake === ATLAS_NATIVE_INTAKE ? loadNativeBundleRelease() : null;
const themeBody = release?.catalogFile.body ?? readFileSync(themePath);
const catalogSha256 = createHash("sha256").update(themeBody).digest("hex");
const themePacks = JSON.parse(themeBody);
const ledger = loadPackRightsLedger();
const releaseBinding = release?.binding;
const releaseTrace = release ? { catalog: { ...releaseBinding.catalog, requests: 0 },
  index: { ...releaseBinding.index, requests: 0 }, unexpected: [], descriptorRequests: 0 } : undefined;
const rightsContext = { themePacks, ledger, expectedIntake, catalogSha256, releaseBinding, releaseTrace };
const rightsProblems = nativeCatalogRightsProblems(rightsContext);
if (rightsProblems.length) throw new Error(`native 카탈로그/원장 권리 대조 실패: ${rightsProblems.join(" / ")}`);
const assetRoot = realpathSync(options["asset-root"]);
const { plan, errors: planErrors } = createBundleV2DeployPlan({ themePacks, assetRoot, ledger });
if (!plan || planErrors.length || plan.excludedByRights.length) throw new Error(`권리/경로/실물 계획 검증 실패: ${planErrors.join(" / ")}`);
const representatives = selectNativeRepresentatives(themePacks, { expectedIntake });
const byPath = new Map(plan.objects.filter((object) => object.source).map((object) => [object.publicPath, object]));
if (plan.totals.glbAssets !== themePacks.assets.length) throw new Error("계획의 전수 모델 개수가 다릅니다.");
writeFileSync(join(output, "native-deploy-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
if (release) writeFileSync(join(output, "native-release-binding.json"), `${JSON.stringify({ descriptor: release.descriptor, binding: releaseBinding }, null, 2)}\n`);
const rows = [];
let reusedValidation;
if (options["reuse-validation"]) {
  const previous = resolve(options["reuse-validation"]);
  if (previous === output) throw new Error("이전 증거를 덮어쓰지 않도록 --out을 다른 폴더로 정하세요.");
  const summaryBody = readFileSync(join(previous, "summary.json"));
  const rowsBody = readFileSync(join(previous, "native-validation.json"));
  const summary = JSON.parse(summaryBody);
  const previousRows = JSON.parse(rowsBody);
  const problems = reusableNativeValidationProblems({ assets: themePacks.assets, rows: previousRows, summary, catalogSha256, ...rightsContext });
  if (problems.length) throw new Error(problems.join(" / "));
  rows.push(...previousRows);
  reusedValidation = { evidence: basename(previous), validated: previousRows.length, sourceCatalogSha256: catalogSha256,
    expectedIntake: summary.expectedIntake,
    releaseBinding: summary.releaseBinding,
    summarySha256: createHash("sha256").update(summaryBody).digest("hex"),
    rowsSha256: createHash("sha256").update(rowsBody).digest("hex"), priorWorker: summary.worker };
  writeFileSync(join(output, "native-validation.json"), rowsBody);
}
const renders = [];
const errors = [];
let browser;
let page;
let worker;
let wrongHash;
let browserBinary;
let browserGpuFlags;
let stage = "browser-start";
try {
  browser = await chromium.launch({ channel: "chromium", headless: true,
    args: ["--enable-automation", ...(lane === "swiftshader" ? ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [])] });
  const cdp = await browser.newBrowserCDPSession();
  const command = await cdp.send("Browser.getBrowserCommandLine");
  browserBinary = command.arguments[0];
  browserGpuFlags = command.arguments.filter((argument) => /^--(?:headless|use-angle|enable-unsafe-webgpu|enable-unsafe-swiftshader)(?:=|$)/.test(argument));
  if (browserBinary !== chromium.executablePath()) throw new Error("실행한 브라우저가 선언한 Chromium 바이너리와 다릅니다.");
  await cdp.detach();
  page = await browser.newPage({ viewport: { width: 1000, height: 800 }, serviceWorkers: "block" });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.addInitScript(() => {
    const trace = { requests: 0, responses: 0, rejected: 0, profileErrors: 0, errors: [], urls: [] };
    Object.assign(window, { __bundleNativeWorkerTrace: trace });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, workerOptions) {
        super(url, workerOptions);
        if (workerOptions?.name !== "toonstudio-bg3d-glb-validator") return;
        trace.urls.push(String(url));
        const original = this.postMessage.bind(this);
        this.postMessage = (message, transfer) => {
          if (message.kind === "validate") {
            trace.requests += 1;
            if (message.options.profile !== "mobile" || !/^sha256:[a-f0-9]{64}$/.test(message.options.declared.sha256)) trace.profileErrors += 1;
          }
          original(message, transfer);
        };
        this.addEventListener("message", (event) => {
          if (event.data.kind !== "result") return;
          trace.responses += 1;
          if (!event.data.result.ok) trace.rejected += 1;
        });
        this.addEventListener("error", () => trace.errors.push("validator Worker error"));
        this.addEventListener("messageerror", () => trace.errors.push("validator Worker messageerror"));
      }
    };
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin.origin) {
      errors.push(`원격 요청 거부: ${url.origin}${url.pathname}`);
      await route.abort("blockedbyclient"); return;
    }
    if (url.pathname === "/__creator_bundle_native__") {
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="ko"><head><link rel="icon" href="data:,"></head><body><h1>구매 번들 3D 로컬 검증</h1><script type="module" src="/tools/browser-harnesses/creator-bundle-native-validation.ts"></script></body></html>' }); return;
    }
    if (release && url.pathname === "/" + RELEASE_DESCRIPTOR_PATH.replace(/^apps\/web\//u, "")) {
      // Vite의 JSON import도 이 실행에서 검사한 동일 descriptor로 고정한다.
      releaseTrace.descriptorRequests += 1;
      await route.fulfill({ contentType: "application/javascript", body: `export default ${JSON.stringify(release.descriptor)};` }); return;
    }
    if (release && (url.pathname.startsWith(STATIC_URL_PREFIX + "theme-packs")
      || url.pathname.startsWith(STATIC_URL_PREFIX + "deploy-index"))) {
      const kind = url.pathname === release.descriptor.catalog.url ? "catalog"
        : url.pathname === release.descriptor.index.url ? "index" : null;
      if (!kind || url.search) {
        releaseTrace.unexpected.push(url.pathname + url.search);
        errors.push("release에 없는 정적 metadata 요청을 거부했습니다.");
        await route.abort("blockedbyclient"); return;
      }
      try {
        assertNativeBundleReleaseCurrent(release);
        releaseTrace[kind].requests += 1;
        await route.fulfill({ contentType: "application/json", body: kind === "catalog" ? release.catalogFile.body : release.indexFile.body });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        await route.abort("failed");
      }
      return;
    }
    if (url.pathname === "/assets/3d/environments/bundle-v1/theme-packs.json") {
      await route.fulfill({ contentType: "application/json", body: themeBody }); return;
    }
    if (url.pathname.startsWith("/assets/studio/bundle-v2/")) {
      const object = byPath.get(url.pathname);
      if (!object || url.search) { errors.push(`검증 목록에 없는 GLB 요청: ${url.pathname}`); await route.abort("blockedbyclient"); return; }
      try {
        const file = realpathSync(resolve(assetRoot, object.source));
        if (!file.startsWith(`${assetRoot}${sep}`)) throw new Error("private GLB 경로가 루트를 벗어났습니다.");
        const body = readFileSync(file);
        assertPrivateNativeBody(body, object);
        await route.fulfill({ contentType: "model/gltf-binary", body });
      } catch (error) {
        errors.push(`private GLB 응답 거부: ${error instanceof Error ? error.message : String(error)}`);
        await route.abort("failed");
      }
      return;
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/trpc/")) {
      errors.push(`API 요청 거부: ${url.pathname}`); await route.abort("blockedbyclient"); return;
    }
    await route.continue();
  });
  stage = "module-load";
  await page.goto(`${origin.origin}/__creator_bundle_native__?lane=${lane}&catalog=${release ? "release" : "legacy"}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__creatorBundleNative || window.__creatorBundleNativeError), undefined, { timeout: 120_000 });
  const startupError = await page.evaluate(() => window.__creatorBundleNativeError);
  if (startupError) throw new Error(JSON.stringify(startupError));
  stage = "expected-sha-negative-control";
  wrongHash = await page.evaluate(() => window.__creatorBundleNative.rejectWrongHash());
  stage = "mobile-worker-all-models";
  if (!reusedValidation) {
    // 같은 실제 하네스로 모든 모델을 순차 검증한다. 샘플 제한·자동 재시도는 추가하지 않는다.
    for (let start = 0; start < themePacks.assets.length; start += 40) {
      rows.push(...await page.evaluate(([from, to]) => window.__creatorBundleNative.validateRange(from, to), [start, start + 40]));
      writeFileSync(join(output, "native-validation.json"), `${JSON.stringify(rows)}\n`);
      console.log(`모바일 Worker 검증 ${rows.length}/${themePacks.assets.length}, 실패 ${rows.filter((row) => !row.ok).length}`);
    }
  } else {
    console.log(`카탈로그·원본 SHA가 같은 이전 모바일 Worker 전수 증거 ${rows.length}개 재사용`);
  }
  stage = "registered-pack-representative-renders";
  for (const [index, representative] of representatives.entries()) {
    const proof = await page.evaluate((assetIndex) => window.__creatorBundleNative.render(assetIndex), representative.index);
    const screenshot = `${String(index + 1).padStart(2, "0")}-${themePacks.packs[proof.packIndex].catalogIds[0]}.png`;
    await page.screenshot({ path: join(output, screenshot) });
    renders.push({ ...proof, screenshot });
    console.log(`실제 3D 검수 ${index + 1}/${representatives.length}: ${proof.title}`);
  }
  stage = "proof-complete";
} catch (error) {
  errors.push(`${stage}: ${error instanceof Error ? error.stack : String(error)}`);
} finally {
  if (page && !page.isClosed()) worker = await page.evaluate(() => window.__bundleNativeWorkerTrace).catch(() => undefined);
  try { if (release) assertNativeBundleReleaseCurrent(release); }
  catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  const problems = nativeProofProblems({ assets: themePacks.assets, rows, worker, representatives, renders, wrongHash, errors, lane, reusedValidation, ...rightsContext });
  const summary = { schema: "toonstudio.creator-bundle-native-proof.v1", status: problems.length ? "failed" : "ok", stage,
    scope: "로컬 SHA URL 응답 · 실제 prepareVerifiedBg3dModelRecord · 모바일 Worker 전수 · 실제 Three 로더/2m 정규화 대표 검수. 운영 배포/실제 모바일 GPU 성능 검증은 아님.",
    lane, browserVersion: browser?.version(), browserBinary, browserGpuFlags, reusedValidation,
    catalogSha256, expectedIntake, releaseBinding, releaseTrace,
    assets: themePacks.assets.length, bytes: plan.totals.assetBytes, validated: rows.filter((row) => row.ok).length,
    failures: rows.filter((row) => !row.ok), worker, wrongHash, renders, problems, rawModelsPublished: false };
  writeFileSync(join(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ status: summary.status, stage, validated: summary.validated, assets: summary.assets,
    renders: renders.length, problems: problems.slice(0, 12), evidence: output }, null, 2));
  process.exitCode = problems.length ? 1 : 0;
  await browser?.close();
}
