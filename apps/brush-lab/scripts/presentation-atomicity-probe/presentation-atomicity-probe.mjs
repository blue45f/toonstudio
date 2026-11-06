#!/usr/bin/env node
// brush-lab 브라우저 교차 크기 스테이징·스냅샷-롤백 원자성(Presentation Atomicity) 회귀 프로브.
// BRUSH_LAB_BROWSER_PROBE=1일 때만 실제 Chromium + Vite dev 서버(라이브 TS 소스)를 띄워 실행한다.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const labRoot = path.resolve(path.dirname(SELF), "../..");

export const MAX_STAGE_IMAGE_BYTES = 16_777_216;
export const MAX_CROSS_SIZE_PEAK_STAGING_BYTES = 33_554_432;

export const EXPECTED_ATOMICITY_STATUS_VALUES = [
  "committed-same-size",
  "committed-cross-size",
  "preserved-pre-resize",
  "preserved-same-size",
  "restored-from-snapshot",
  "dimensions-only-snapshot-unavailable",
  "dimensions-only-rollback-put-failed",
];

function log(message) {
  process.stderr.write(`[presentation-atomicity-probe] ${message}\n`);
}

export function parseAtomicityProbeArgs(argv) {
  const opts = {
    out: path.join(process.env.TMPDIR || os.tmpdir(), "brush-presentation-atomicity-probe"),
    verbose: false,
    serve: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} 인자에 값이 필요하다`);
      return v;
    };
    if (a === "--out") opts.out = String(next());
    else if (a === "--verbose") opts.verbose = true;
    else if (a === "--serve-child") opts.serve = true;
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  return opts;
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function collectAtomicitySourceProvenance(rootDir = labRoot) {
  const resolved = existsSync(path.join(rootDir, "src/platform/canvas-present.ts"))
    ? rootDir
    : path.join(rootDir, "apps/brush-lab");
  let branch;
  let commitSha = "unknown";
  let dirtyFiles = [];
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: resolved, encoding: "utf8" }).trim();
    commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolved, encoding: "utf8" }).trim();
    dirtyFiles = execFileSync("git", ["status", "--porcelain", "--", "."], { cwd: resolved, encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    branch = `git-error:${String(error?.message ?? error).slice(0, 60)}`;
  }
  return {
    branch,
    commitSha,
    commitShort: commitSha.slice(0, 12),
    dirtyFiles,
    buildMode: "vite-dev-live-source",
    sourceHashes: {
      canvasPresentTs: sha256File(path.join(resolved, "src/platform/canvas-present.ts")),
      liveSessionTs: sha256File(path.join(resolved, "src/app/state/live-session.ts")),
      sumiKernelWasm: sha256File(path.join(resolved, "wasm/sumi-kernel/pkg/sumi_kernel.wasm")),
    },
  };
}

export function evaluateStagingCostReport(report) {
  const reasons = [];
  if (!report || typeof report !== "object") {
    return {
      ok: false,
      detectedFailure: true,
      sameSizeZeroSnapshotOverhead: false,
      crossSizeWithinPeakBudget: false,
      overBudgetRejectedPreStaging: false,
      reasons: ["invalid-staging-cost-report"],
    };
  }

  if (report.executionKind !== "real-browser-dom") {
    reasons.push("unexpected-execution-kind");
  }

  const init = report.initialMount64x48;
  if (!init || init.hashMatched !== true || !(init.inkPixels > 0)) {
    reasons.push("initial-mount-64x48-failed");
  } else if (
    init.receipt?.committed !== true ||
    init.receipt?.width !== 64 ||
    init.receipt?.height !== 48 ||
    init.receipt?.stagedBytes !== 12_288
  ) {
    reasons.push("initial-mount-receipt-mismatch");
  }

  const same = report.sameSizeCommit64x48;
  const sameSizeZeroSnapshotOverhead =
    same?.hashMatched === true &&
    same?.inkPixels > 0 &&
    same?.receipt?.committed === true &&
    same?.receipt?.crossSize === false &&
    same?.receipt?.prevWidth === 64 &&
    same?.receipt?.prevHeight === 48 &&
    same?.receipt?.width === 64 &&
    same?.receipt?.height === 48 &&
    same?.receipt?.snapshotCaptured === false &&
    same?.receipt?.snapshotBytes === 0 &&
    same?.receipt?.stagedBytes === 12_288 &&
    same?.receipt?.peakStagingBytes === 12_288 &&
    same?.receipt?.atomicityStatus === "committed-same-size";
  if (!sameSizeZeroSnapshotOverhead) {
    reasons.push("same-size-commit-receipt-or-overhead-mismatch");
  }

  const cross = report.crossSizeCommit64x48To96x64;
  const crossSizeWithinPeakBudget =
    cross?.hashMatched === true &&
    cross?.inkPixels > 0 &&
    cross?.receipt?.committed === true &&
    cross?.receipt?.crossSize === true &&
    cross?.receipt?.prevWidth === 64 &&
    cross?.receipt?.prevHeight === 48 &&
    cross?.receipt?.width === 96 &&
    cross?.receipt?.height === 64 &&
    cross?.receipt?.snapshotCaptured === true &&
    cross?.receipt?.snapshotBytes === 12_288 &&
    cross?.receipt?.stagedBytes === 24_576 &&
    cross?.receipt?.peakStagingBytes === 36_864 &&
    cross?.receipt?.snapshotBytes <= MAX_STAGE_IMAGE_BYTES &&
    cross?.receipt?.stagedBytes <= MAX_STAGE_IMAGE_BYTES &&
    cross?.receipt?.peakStagingBytes <= MAX_CROSS_SIZE_PEAK_STAGING_BYTES &&
    cross?.receipt?.atomicityStatus === "committed-cross-size";
  if (!crossSizeWithinPeakBudget) {
    reasons.push("cross-size-commit-receipt-or-budget-mismatch");
  }

  const over = report.overBudgetPrecheck;
  const overBudgetRejectedPreStaging =
    over?.threw === true &&
    over?.code === "lab-image-invalid" &&
    over?.reason === "dimensions-exceed-budget" &&
    over?.rollbackAttached === false &&
    over?.canvasPreserved === true &&
    over?.canvasWidthAfter === 96 &&
    over?.canvasHeightAfter === 64;
  if (!overBudgetRejectedPreStaging) {
    reasons.push("over-budget-precheck-did-not-preserve-canvas");
  }

  return {
    ok: reasons.length === 0,
    detectedFailure: reasons.length > 0,
    sameSizeZeroSnapshotOverhead,
    crossSizeWithinPeakBudget,
    overBudgetRejectedPreStaging,
    reasons,
  };
}

export function evaluateCrossSizeAtomicityReport(report) {
  const reasons = [];
  let screenWipedOnTransientCrossSizeFault = false;
  let dishonestPixelRestorationClaim = false;

  if (!report || typeof report !== "object") {
    return {
      ok: false,
      detectedFailure: true,
      screenWipedOnTransientCrossSizeFault: true,
      dishonestPixelRestorationClaim: false,
      reasons: ["invalid-atomicity-report"],
    };
  }

  if (report.executionKind !== "browser-dom-with-injected-context-faults") {
    reasons.push("missing-fault-injection-execution-kind");
  }
  if (
    report.baselineWidth !== 64 ||
    report.baselineHeight !== 48 ||
    typeof report.baselineInkPixels !== "number" ||
    report.baselineInkPixels <= 0 ||
    typeof report.baselineHash !== "string" ||
    report.baselineHash.length === 0
  ) {
    reasons.push("invalid-atomicity-baseline");
  }

  // Subcase A: preResizeStagingFault
  const subA = report.preResizeStagingFault;
  if (
    subA?.threw !== true ||
    subA?.preserved !== true ||
    subA?.canvasWidthAfter !== 64 ||
    subA?.canvasHeightAfter !== 48 ||
    subA?.domHashAfter !== report.baselineHash ||
    subA?.rollback?.atomicityStatus !== "preserved-pre-resize" ||
    subA?.rollback?.dimensionsRestored !== true ||
    subA?.rollback?.pixelsRestored !== true
  ) {
    reasons.push("pre-resize-staging-fault-not-preserved");
  }

  // Subcase B: sameSizePutFault
  const subB = report.sameSizePutFault;
  if (
    subB?.threw !== true ||
    subB?.preserved !== true ||
    subB?.canvasWidthAfter !== 64 ||
    subB?.canvasHeightAfter !== 48 ||
    subB?.domHashAfter !== report.baselineHash ||
    subB?.rollback?.atomicityStatus !== "preserved-same-size" ||
    subB?.rollback?.dimensionsRestored !== true ||
    subB?.rollback?.pixelsRestored !== true
  ) {
    reasons.push("same-size-put-fault-not-preserved");
  }

  // Subcase C: crossSizeTransientPutFault (core atomic rollback verification)
  const subC = report.crossSizeTransientPutFault;
  const subCRestoredDom =
    subC?.atomicallyRestored === true &&
    subC?.canvasWidthAfter === 64 &&
    subC?.canvasHeightAfter === 48 &&
    subC?.domHashAfter === report.baselineHash &&
    subC?.inkPixelsAfter === report.baselineInkPixels;
  if (!subCRestoredDom) {
    screenWipedOnTransientCrossSizeFault = true;
    reasons.push("transient-cross-size-fault-wiped-or-corrupted-screen");
  }
  if (
    subC?.threw !== true ||
    subC?.putCallCount !== 2 ||
    subC?.sourcesUnmutated !== true ||
    subC?.rollback?.committed !== false ||
    subC?.rollback?.crossSize !== true ||
    subC?.rollback?.prevWidth !== 64 ||
    subC?.rollback?.prevHeight !== 48 ||
    subC?.rollback?.targetWidth !== 96 ||
    subC?.rollback?.targetHeight !== 64 ||
    subC?.rollback?.snapshotCaptured !== true ||
    subC?.rollback?.snapshotBytes !== 12_288 ||
    subC?.rollback?.stagedBytes !== 24_576 ||
    subC?.rollback?.peakStagingBytes !== 36_864 ||
    subC?.rollback?.dimensionsRestored !== true ||
    subC?.rollback?.pixelsRestored !== true ||
    subC?.rollback?.atomicityStatus !== "restored-from-snapshot"
  ) {
    reasons.push("transient-cross-size-rollback-diagnostics-invalid");
  }
  if (subC?.recoveredImmediately !== true) {
    reasons.push("transient-cross-size-did-not-recover-immediately");
  }

  // Subcase D: crossSizePersistentPutFault (explicit non-atomic boundary 1)
  const subD = report.crossSizePersistentPutFault;
  if (
    subD?.inkPixelsAfter === 0 &&
    (subD?.rollback?.pixelsRestored === true || subD?.rollback?.atomicityStatus === "restored-from-snapshot")
  ) {
    dishonestPixelRestorationClaim = true;
    reasons.push("dishonest-pixel-restoration-claim");
  }
  if (
    subD?.threw !== true ||
    subD?.putCallCount !== 2 ||
    subD?.canvasWidthAfter !== 64 ||
    subD?.canvasHeightAfter !== 48 ||
    subD?.inkPixelsAfter !== 0 ||
    subD?.nonAtomicPixelsClearedRecorded !== true ||
    subD?.rollback?.committed !== false ||
    subD?.rollback?.crossSize !== true ||
    subD?.rollback?.snapshotCaptured !== true ||
    subD?.rollback?.dimensionsRestored !== true ||
    subD?.rollback?.pixelsRestored !== false ||
    subD?.rollback?.atomicityStatus !== "dimensions-only-rollback-put-failed" ||
    subD?.recoveredToBaseline !== true
  ) {
    reasons.push("persistent-put-fault-boundary-not-recorded-honestly");
  }

  // Subcase E: crossSizeSnapshotUnavailableFault (explicit non-atomic boundary 2)
  const subE = report.crossSizeSnapshotUnavailableFault;
  if (
    subE?.inkPixelsAfter === 0 &&
    (subE?.rollback?.pixelsRestored === true || subE?.rollback?.atomicityStatus === "restored-from-snapshot")
  ) {
    dishonestPixelRestorationClaim = true;
    if (!reasons.includes("dishonest-pixel-restoration-claim")) {
      reasons.push("dishonest-pixel-restoration-claim");
    }
  }
  if (
    subE?.threw !== true ||
    subE?.putCallCount !== 1 ||
    subE?.canvasWidthAfter !== 64 ||
    subE?.canvasHeightAfter !== 48 ||
    subE?.inkPixelsAfter !== 0 ||
    subE?.nonAtomicPixelsClearedRecorded !== true ||
    subE?.rollback?.committed !== false ||
    subE?.rollback?.crossSize !== true ||
    subE?.rollback?.snapshotCaptured !== false ||
    subE?.rollback?.dimensionsRestored !== true ||
    subE?.rollback?.pixelsRestored !== false ||
    subE?.rollback?.atomicityStatus !== "dimensions-only-snapshot-unavailable" ||
    subE?.recoveredImmediately !== true
  ) {
    reasons.push("snapshot-unavailable-fault-boundary-not-recorded-honestly");
  }

  return {
    ok: reasons.length === 0,
    detectedFailure: reasons.length > 0,
    screenWipedOnTransientCrossSizeFault,
    dishonestPixelRestorationClaim,
    reasons,
  };
}

async function serveChild() {
  const { createServer } = await import("vite");
  const server = await createServer({
    root: labRoot,
    configFile: path.join(labRoot, "vite.config.ts"),
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
      hmr: false,
      watch: null,
      headers: { "Cache-Control": "no-store" },
    },
    optimizeDeps: {
      force: true,
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "zod",
        "@dimforge/rapier2d-compat",
      ],
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Vite 서버 주소를 얻지 못했다");
  process.stdout.write(`READY http://127.0.0.1:${address.port}/\n`);
  await new Promise(() => {});
}

const groups = [];
function killGroups() {
  for (const child of groups.splice(0)) {
    if (!child.pid) continue;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // 이미 종료된 프로세스 그룹 무시
    }
  }
}

function spawnGroup(command, args, options) {
  const child = spawn(command, args, { detached: true, ...options });
  groups.push(child);
  return child;
}

function waitForLine(child, stream, pattern, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(
      () => reject(new Error(`${label}: ${timeoutMs}ms 안에 준비되지 않았다\n${buffer.slice(-500)}`)),
      timeoutMs,
    );
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const m = pattern.exec(buffer);
      if (m) {
        clearTimeout(timer);
        resolve(m);
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${label}: 준비 전에 종료됨(코드 ${code})\n${buffer.slice(-500)}`));
    });
  });
}

function findChromium() {
  if (process.env.BRUSH_LAB_CHROMIUM_PATH) return process.env.BRUSH_LAB_CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), ".cache", "ms-playwright");
  if (existsSync(root)) {
    const found = [];
    for (const name of readdirSync(root)) {
      const m = /^chromium-(\d+)$/u.exec(name);
      if (!m) continue;
      for (const sub of ["chrome-linux", "chrome-linux64"]) {
        const exe = path.join(root, name, sub, "chrome");
        if (existsSync(exe)) found.push({ revision: Number(m[1]), exe });
      }
    }
    found.sort((a, b) => b.revision - a.revision);
    if (found[0]?.exe) return found[0].exe;
  }
  for (const sysExe of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
    if (existsSync(sysExe)) return sysExe;
  }
  return null;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseAtomicityProbeArgs(argv);
  if (opts.serve) {
    await serveChild();
    return 0;
  }
  if (env.BRUSH_LAB_BROWSER_PROBE !== "1") {
    log(
      "BRUSH_LAB_BROWSER_PROBE=1이 아니라 건너뜀(게이트 꺼짐). 실행: BRUSH_LAB_BROWSER_PROBE=1 TMPDIR=/tmp node apps/brush-lab/scripts/presentation-atomicity-probe/presentation-atomicity-probe.mjs",
    );
    return 0;
  }

  let playwright;
  try {
    playwright = await import("playwright");
  } catch (error) {
    log(`playwright를 불러올 수 없다(${String(error?.message ?? error).split("\n")[0]}) — 구조적 skip`);
    return 2;
  }
  const chrome = findChromium();
  if (!chrome) {
    log("Chromium을 찾지 못했다 — 구조적 skip (BRUSH_LAB_CHROMIUM_PATH 또는 PLAYWRIGHT_BROWSERS_PATH)");
    return 2;
  }

  mkdirSync(opts.out, { recursive: true });
  const diskProvenance = collectAtomicitySourceProvenance(labRoot);
  const failures = [];
  const fail = (message) => {
    failures.push(message);
    log(`FAIL ${message}`);
  };

  const summary = {
    probe: "presentation-atomicity-probe",
    timestamp: new Date().toISOString(),
    chrome,
    userAgent: null,
    sourceProvenance: { disk: diskProvenance, browser: null, hashesMatched: false },
    stagingCostAndBudget: null,
    crossSizeAtomicityFaults: null,
    negativeControls: null,
    pageErrors: [],
    consoleErrors: [],
    failures,
    ok: false,
  };

  const server = spawnGroup(process.execPath, [SELF, "--serve-child"], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: labRoot,
  });
  if (opts.verbose) server.stderr.on("data", (c) => process.stderr.write(`[vite] ${c}`));
  const ready = await waitForLine(server, server.stdout, /READY (http:\/\/127\.0\.0\.1:\d+\/)/u, 90_000, "Vite 서버");
  const baseUrl = ready[1];
  const probeUrl = `${baseUrl}scripts/presentation-atomicity-probe/presentation-atomicity-probe.html`;
  log(`Vite 라이브 소스 dev 서버: ${baseUrl}`);

  const userData = mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "pap-"));
  const chromeArgs = [
    ...(path.basename(chrome) === "headless_shell" ? [] : ["--headless=new"]),
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${userData}`,
    "--remote-debugging-port=0",
    "--window-size=1280,900",
    "about:blank",
  ];
  const browserProc = spawnGroup(chrome, chromeArgs, { stdio: ["ignore", "ignore", "pipe"] });
  let wsEndpoint;
  try {
    const m = await waitForLine(
      browserProc,
      browserProc.stderr,
      /DevTools listening on (ws:\/\/\S+)/u,
      60_000,
      "Chromium",
    );
    wsEndpoint = m[1];
  } catch (error) {
    log(`Chromium을 실행할 수 없다(${String(error?.message ?? error).split("\n")[0]}) — 구조적 skip`);
    return 2;
  }

  const browser = await playwright.chromium.connectOverCDP(wsEndpoint);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  await page.setViewportSize({ width: 1280, height: 900 });

  page.on("pageerror", (error) => {
    summary.pageErrors.push(error.message);
    log(`pageerror: ${error.message}`);
  });
  page.on("console", (msg) => {
    if (opts.verbose) log(`console.${msg.type()}: ${msg.text().slice(0, 300)}`);
    if (msg.type() === "error") summary.consoleErrors.push(msg.text().slice(0, 300));
  });

  try {
    summary.userAgent = await page.evaluate(() => navigator.userAgent);
    await page.goto(probeUrl, { timeout: 120_000, waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__brushLabPresentationAtomicityProbeReady === true, null, {
      timeout: 120_000,
    });

    const browserProvenance = await page.evaluate(() =>
      window.__brushLabPresentationAtomicityProbe.getSourceProvenance(),
    );
    summary.sourceProvenance.browser = browserProvenance;
    const diskHashes = diskProvenance.sourceHashes;
    const browserHashes = browserProvenance.sourceHashes;
    const hashesMatched =
      diskHashes.canvasPresentTs === browserHashes.canvasPresentTs &&
      diskHashes.liveSessionTs === browserHashes.liveSessionTs &&
      diskHashes.sumiKernelWasm === browserHashes.sumiKernelWasm &&
      browserProvenance.sumiKernelDeclaredSha256 === diskHashes.sumiKernelWasm &&
      browserProvenance.constants?.MAX_LAB_IMAGE_SIDE_PX === 2048 &&
      browserProvenance.constants?.MAX_LAB_IMAGE_PIXELS === 4_194_304 &&
      browserProvenance.constants?.MAX_LAB_IMAGE_BYTES === 16_777_216;
    summary.sourceProvenance.hashesMatched = hashesMatched;
    log(
      `${hashesMatched ? "ok  " : "FAIL"} 소스 프로비넌스 대조: canvas-present=${browserHashes.canvasPresentTs.slice(0, 12)}, live-session=${browserHashes.liveSessionTs.slice(0, 12)}`,
    );
    if (!hashesMatched) {
      fail(`브라우저 로드 소스와 디스크 해시 불일치: ${JSON.stringify({ diskHashes, browserHashes })}`);
    }

    const rawStaging = await page.evaluate(() =>
      window.__brushLabPresentationAtomicityProbe.runStagingCostAndBudgetCase(),
    );
    const evalStaging = evaluateStagingCostReport(rawStaging);
    summary.stagingCostAndBudget = { ...rawStaging, evaluation: evalStaging };
    log(
      `${evalStaging.ok ? "ok  " : "FAIL"} [Staging Cost & Budget] sameSizeZeroSnapshot=${evalStaging.sameSizeZeroSnapshotOverhead}, crossSizePeakBytes=${rawStaging.crossSizeCommit64x48To96x64?.receipt?.peakStagingBytes}, overBudgetRejected=${evalStaging.overBudgetRejectedPreStaging}`,
    );
    if (!evalStaging.ok) fail(`스테이징 비용/예산 검증 실패: ${JSON.stringify(evalStaging)}`);

    const rawAtomicity = await page.evaluate(() =>
      window.__brushLabPresentationAtomicityProbe.runCrossSizeAtomicityFaultCase(),
    );
    const evalAtomicity = evaluateCrossSizeAtomicityReport(rawAtomicity);
    summary.crossSizeAtomicityFaults = { ...rawAtomicity, evaluation: evalAtomicity };
    log(
      `${evalAtomicity.ok ? "ok  " : "FAIL"} [Cross-Size Atomicity (${rawAtomicity.executionKind})] transientStatus=${rawAtomicity.crossSizeTransientPutFault?.rollback?.atomicityStatus}, persistentStatus=${rawAtomicity.crossSizePersistentPutFault?.rollback?.atomicityStatus}, taintedStatus=${rawAtomicity.crossSizeSnapshotUnavailableFault?.rollback?.atomicityStatus}`,
    );
    if (!evalAtomicity.ok) fail(`교차 크기 원자성 검증 실패: ${JSON.stringify(evalAtomicity)}`);

    const rawNeg = await page.evaluate(() =>
      window.__brushLabPresentationAtomicityProbe.runAtomicityNegativeControlCase(),
    );
    const neg1Eval = evaluateCrossSizeAtomicityReport(
      rawNeg.legacyCrossSizeWipesScreenOnTransientFault.simulatedAtomicityReport,
    );
    const neg2Eval = evaluateCrossSizeAtomicityReport(
      rawNeg.dishonestPersistentFaultAtomicityClaim.simulatedAtomicityReport,
    );
    const neg1Detected =
      rawNeg.legacyCrossSizeWipesScreenOnTransientFault.screenWipedOnTransientCrossSizeFault === true &&
      neg1Eval.ok === false &&
      neg1Eval.detectedFailure === true &&
      neg1Eval.screenWipedOnTransientCrossSizeFault === true;
    const neg2Detected =
      neg2Eval.ok === false &&
      neg2Eval.detectedFailure === true &&
      neg2Eval.dishonestPixelRestorationClaim === true &&
      neg2Eval.reasons.includes("dishonest-pixel-restoration-claim");
    const negOk = neg1Detected && neg2Detected;
    summary.negativeControls = {
      ok: negOk,
      legacyCrossSizeWipesScreenOnTransientFault: {
        detectedFailure: neg1Detected,
        screenWipedOnTransientCrossSizeFault:
          rawNeg.legacyCrossSizeWipesScreenOnTransientFault.screenWipedOnTransientCrossSizeFault,
        evaluation: neg1Eval,
      },
      dishonestPersistentFaultAtomicityClaim: {
        detectedFailure: neg2Detected,
        dishonestPixelRestorationClaim: neg2Eval.dishonestPixelRestorationClaim,
        evaluation: neg2Eval,
      },
    };
    log(
      `${negOk ? "ok  " : "FAIL"} [Negative Controls] legacyTransientWipe(detected=${neg1Detected}), dishonestPersistentClaim(detected=${neg2Detected})`,
    );
    if (!negOk) fail(`음성 대조군 탐지 실패: ${JSON.stringify(summary.negativeControls)}`);
  } catch (error) {
    fail(`치명적 예외: ${String(error?.stack ?? error).split("\n").slice(0, 4).join(" | ")}`);
  } finally {
    if (summary.pageErrors.length > 0) fail(`pageerror ${summary.pageErrors.length}건: ${summary.pageErrors[0]}`);
    summary.ok = failures.length === 0;
    const summaryPath = path.join(opts.out, "presentation-atomicity-summary.json");
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    log(`요약 리포트 저장: ${summaryPath}`);
    try {
      await browser.close();
    } catch {
      // 브라우저 연결 종료 무시
    }
    try {
      rmSync(userData, { recursive: true, force: true });
    } catch {
      // 임시 프로필 정리 실패 무시
    }
  }

  log(summary.ok ? `전체 교차 크기 원자성 프로브 통과 (${opts.out})` : `교차 크기 원자성 프로브 실패 ${failures.length}건`);
  return summary.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  main()
    .then((code) => {
      killGroups();
      process.exit(code);
    })
    .catch((error) => {
      log(`프로브 실행 오류: ${String(error?.stack ?? error)}`);
      killGroups();
      process.exit(1);
    });
  for (const [sig, code] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ]) {
    process.on(sig, () => {
      killGroups();
      process.exit(code);
    });
  }
}
