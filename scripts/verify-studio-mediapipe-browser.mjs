/** Studio 두 variant와 Character Lab의 실제 SDK·모델·CSP를 실패 시 차단 방식으로 검증한다. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

/** 두 관찰자가 모두 실제 전송을 배제해야 한다. 요청 실패만으로 차단을 인정하지 않는다. */
export function verifyMediaPipeNetworkEvidence({ requests, cdpRequests, violations }, allowedOrigins, { requireNoDeniedRequests = false } = {}) {
  const allowed = new Set(allowedOrigins);
  const enforcedViolation = (origin) => violations.some((entry) => entry.origin === origin
    && entry.directive === "connect-src" && entry.disposition === "enforce");
  const deniedRequests = requests.filter((entry) => !allowed.has(entry.origin));
  const deniedCdp = cdpRequests.filter((entry) => !allowed.has(entry.origin));
  // Playwright는 Dedicated Worker 요청에도 부모 frame을 붙일 수 있다.
  // 격리된 Worker 시나리오는 frame 귀속과 무관하게 미허용 origin 요청을 전부 거부한다.
  if (requireNoDeniedRequests) {
    assert.equal(deniedRequests.length, 0, "격리된 Worker 실행에 외부 origin 요청이 있습니다.");
    assert.equal(deniedCdp.length, 0, "격리된 Worker 실행에 외부 origin CDP 요청이 있습니다.");
  }
  for (const entry of deniedCdp) {
    assert.equal(entry.responseStatus, null, "금지된 origin에서 실제 응답을 받았습니다.");
    assert.equal(entry.blockedReason, "csp", "외부 요청의 네트워크 실패는 CSP 차단 증거가 아닙니다.");
    assert(enforcedViolation(entry.origin), "외부 요청에 대응하는 실제 CSP 위반 이벤트가 없습니다.");
  }
  for (const entry of deniedRequests) {
    assert.equal(entry.responseStatus, null, "금지된 origin으로 요청이 전송됐습니다.");
    assert(entry.failure, "외부 요청이 진행 중이거나 성공했으므로 차단을 입증할 수 없습니다.");
    assert(enforcedViolation(entry.origin), "요청 실패와 실제 CSP 위반 이벤트가 대응하지 않습니다.");
    assert(deniedCdp.some((observed) => observed.url === entry.url && observed.method === entry.method
      && observed.blockedReason === "csp" && observed.responseStatus === null),
    "브라우저 Network.loadingFailed의 csp 차단 근거가 없습니다.");
  }
  return { requests, cdpRequests, violations };
}

export async function verifyStudioMediaPipeBrowser() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const evidence = resolve(root, process.env.STUDIO_MEDIAPIPE_EVIDENCE_DIR ?? "artifacts/studio-mediapipe-browser");
  const require = createRequire(import.meta.url);
  const studioHeaders = await readFile(resolve(root, "apps/web/public/_headers"), "utf8");
  const studioPolicy = studioHeaders.match(/^\s*Content-Security-Policy:\s*(.+)$/mu)?.[1];
  const characterHtml = await readFile(resolve(root, "apps/character-lab/index.html"), "utf8");
  const characterPolicy = characterHtml.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?>/u)?.[1];
  assert(studioPolicy && characterPolicy, "두 앱의 실제 CSP가 필요합니다. 정책을 생략해 검사를 실행할 수 없습니다.");
  for (const [application, policy] of [["Studio", studioPolicy], ["Character Lab", characterPolicy]]) {
    const connect = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith("connect-src "));
    assert(connect, application + " connect-src 정책이 없습니다.");
    assert(!connect.split(/\s+/u).some((source) => source === "*" || source === "https:"
      || source.includes("odml.pa.googleapis.com") || source.includes("*.googleapis.com")),
    application + " 사용량 전송 origin이 허용되어 있습니다.");
  }
  const report = {
    scope: "real production factories, selected SDK/WASM, actual models, inference, disposal and CSP egress",
    policies: { studio: studioPolicy, characterLab: characterPolicy },
    packages: [], scenarios: [], errors: [],
  };
  for (const [specifier, version, assets] of [
    ["@mediapipe/tasks-vision", "1.2.3", ["vision_wasm_internal.wasm", "vision_wasm_module_internal.wasm"]],
    ["@mediapipe/tasks-vision-nosimd", "0.10.35", ["vision_wasm_nosimd_internal.wasm"]],
  ]) {
    const packageRoot = dirname(require.resolve(specifier));
    const manifest = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
    assert.equal(manifest.name, "@mediapipe/tasks-vision");
    assert.equal(manifest.version, version, specifier + " SDK 버전이 선택 계약과 다릅니다.");
    for (const asset of assets) {
      const bytes = await readFile(resolve(packageRoot, "wasm", asset));
      assert(WebAssembly.validate(bytes), specifier + "/" + asset + "가 유효한 Wasm이 아닙니다.");
      report.packages.push({ specifier, version, asset, bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }
  await mkdir(evidence, { recursive: true });
  const server = await createServer({
    configFile: false, root, publicDir: resolve(root, "apps/web/public"),
    cacheDir: resolve(evidence, "vite-cache"),
    resolve: { alias: { "@": resolve(root, "apps/web/src") } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: "127.0.0.1", port: 0, hmr: false },
    plugins: [{
      name: "mediapipe-csp-probe",
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === "/__mediapipe_character__") {
            response.setHeader("Content-Type", "text/html");
            response.end('<!doctype html><html lang="ko"><head><meta http-equiv="Content-Security-Policy" content="'
              + characterPolicy + '"></head><body></body></html>');
            return;
          }
          response.setHeader("Content-Security-Policy", studioPolicy);
          if (request.url === "/__mediapipe_studio__") {
            response.setHeader("Content-Type", "text/html");
            response.end('<!doctype html><html lang="ko"><head></head><body></body></html>');
            return;
          }
          next();
        });
      },
    }],
  });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer?.address();
    assert(address && typeof address === "object", "MediaPipe 검사 서버의 포트를 확인할 수 없습니다.");
    const origin = "http://127.0.0.1:" + address.port;
    browser = await chromium.launch({
      headless: true,
      args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    report.browserVersion = browser.version();
    const deadline = Date.now() + 600_000;
    for (const [name, application, entry, variant] of [
      ["studio-simd", "studio", "runStudioMediaPipeProbe", "simd"],
      ["studio-nosimd", "studio", "runStudioMediaPipeProbe", "nosimd"],
      ["studio-module-worker", "studio", "runStudioMediaPipeWorkerProbe", null],
      ["character-lab-simd", "character", "runCharacterLabMediaPipeProbe", null],
    ]) {
      const remainingMs = Math.min(300_000, deadline - Date.now());
      assert(remainingMs > 0, "전체 MediaPipe 검사가 10분 제한을 넘었습니다.");
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      const requests = new Map();
      const cdpRequests = new Map();
      const redirectedCdpRequests = [];
      const modelResponses = [];
      const scenario = { name, status: "running", externalRequests: [], cdpExternalRequests: [], modelResponses, pageErrors: errors };
      report.scenarios.push(scenario);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.text().startsWith("[mediapipe-case]")) console.info(name, message.text());
      });
      // context 이벤트에는 Dedicated Worker 요청도 포함된다. route를 가로채지 않는다.
      context.on("request", (request) => {
        const url = new URL(request.url());
        if (url.protocol !== "http:" && url.protocol !== "https:") return;
        requests.set(request, { url: url.href, origin: url.origin, method: request.method(),
          responseStatus: null, failure: null, finished: false });
      });
      context.on("requestfailed", (request) => {
        const record = requests.get(request);
        if (record) record.failure = request.failure()?.errorText ?? "unknown";
      });
      context.on("requestfinished", (request) => {
        const record = requests.get(request);
        if (record) record.finished = true;
      });
      context.on("response", (response) => {
        const record = requests.get(response.request());
        if (record) record.responseStatus = response.status();
        const url = new URL(response.url());
        if (url.origin === "https://storage.googleapis.com") {
          modelResponses.push({ path: url.pathname, status: response.status() });
        }
      });
      const protocol = await context.newCDPSession(page);
      protocol.on("Network.requestWillBeSent", ({ requestId, request, redirectResponse }) => {
        const redirected = cdpRequests.get(requestId);
        if (redirected && redirectResponse) {
          redirected.responseStatus = redirectResponse.status;
          redirectedCdpRequests.push(redirected);
        }
        const url = new URL(request.url);
        if (url.protocol !== "http:" && url.protocol !== "https:") return;
        cdpRequests.set(requestId, { url: url.href, origin: url.origin, method: request.method,
          responseStatus: null, blockedReason: null, failure: null });
      });
      protocol.on("Network.responseReceived", ({ requestId, response }) => {
        const record = cdpRequests.get(requestId);
        if (record) record.responseStatus = response.status;
      });
      protocol.on("Network.loadingFailed", ({ requestId, blockedReason, errorText }) => {
        const record = cdpRequests.get(requestId);
        if (record) { record.blockedReason = blockedReason ?? null; record.failure = errorText; }
      });
      await protocol.send("Network.enable");
      let result;
      try {
        await page.goto(origin + "/__mediapipe_" + application + "__", { waitUntil: "load" });
        result = await page.evaluate(async ({ entryName, selectedVariant, timeoutMs }) => {
          const runtime = await import("/scripts/studio-mediapipe-runtime-browser.mts");
          const execution = runtime[entryName](selectedVariant);
          let timer;
          try {
            return await Promise.race([
              execution,
              new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("실제 MediaPipe 모델 검사가 " + timeoutMs + "ms 안에 완료되지 않았습니다.")), timeoutMs); }),
            ]);
          } finally { clearTimeout(timer); }
        }, { entryName: entry, selectedVariant: variant, timeoutMs: remainingMs });
      } finally {
        // context를 닫아 남은 요청을 종료한 뒤 외부 전송 여부를 판정한다.
        await context.close();
        scenario.externalRequests = [...requests.values()].filter((request) => request.origin !== origin);
        scenario.cdpExternalRequests = [...redirectedCdpRequests, ...cdpRequests.values()].filter((request) => request.origin !== origin);
      }
      // 아래 단언이 실패하더라도 실제 CSP 이벤트를 보고서에 보존한다.
      scenario.policyViolations = result.policyViolations;
      assert.deepEqual(errors, [], name + ": 브라우저 오류");
      verifyMediaPipeNetworkEvidence({
        requests: scenario.externalRequests, cdpRequests: scenario.cdpExternalRequests,
        violations: result.policyViolations,
      }, [origin, "https://storage.googleapis.com"], { requireNoDeniedRequests: name === "studio-module-worker" });
      assert(modelResponses.length > 0 && modelResponses.every(({ status }) => status === 200),
        name + ": 실제 공식 모델 다운로드가 성공하지 않았습니다.");
      Object.assign(scenario, result, { status: "passed" });
      console.info("[mediapipe-browser]", JSON.stringify({ name, status: "passed", ...result }));
    }
    assert.equal(report.scenarios.length, 4, "필수 MediaPipe 실행 경로가 누락됐습니다.");
    assert(report.scenarios.every(({ status }) => status === "passed"), "완료되지 않은 MediaPipe 실행 경로가 있습니다.");
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await server.close();
    await writeFile(resolve(evidence, "report.json"), JSON.stringify(report, null, 2) + "\n");
    console.info(JSON.stringify(report, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await verifyStudioMediaPipeBrowser();
}
