#!/usr/bin/env node
// brush-lab 브라우저 표시 경계(Presentation Boundary) 회귀 프로브.
// BRUSH_LAB_BROWSER_PROBE=1일 때만 실제 Chromium + Vite dev 서버(라이브 TS 소스)를 띄워 실행한다.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const labRoot = path.resolve(path.dirname(SELF), "../..");

export const EXPECTED_FIVE_PIXEL_WHITE_COMPOSITE = [
  [255, 255, 255, 255],
  [254, 254, 255, 255],
  [148, 188, 228, 255],
  [41, 121, 200, 255],
  [40, 120, 200, 255],
];

export const EXPECTED_REJECTED_CASE_IDS = [
  "zero-dim",
  "negative-sign-cancel",
  "fractional-dim",
  "nan-dim",
  "inf-dim",
  "over-budget-precheck",
  "wrong-buffer-type",
  "short-buffer",
  "oversized-buffer",
];

function log(message) {
  process.stderr.write(`[presentation-boundary-probe] ${message}\n`);
}

export function parsePresentationProbeArgs(argv) {
  const opts = {
    out: path.join(process.env.TMPDIR || os.tmpdir(), "brush-presentation-boundary-probe"),
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

export function collectPresentationSourceProvenance(rootDir = labRoot) {
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

export function evaluatePresentBoundaryReport(report) {
  const reasons = [];
  let canvasWipedOrCorrupted = false;

  if (!report || typeof report !== "object") {
    return {
      ok: false,
      detectedFailure: true,
      canvasWipedOrCorrupted: true,
      rejectedCallCount: 0,
      preservedCount: 0,
      reasons: ["invalid-report-object"],
    };
  }

  if (report.executionKind !== "real-browser-dom") {
    reasons.push("unexpected-execution-kind");
  }
  if (report.baselineWidth !== 64 || report.baselineHeight !== 48) {
    reasons.push("invalid-baseline-dimensions");
  }
  if (typeof report.baselineInkPixels !== "number" || report.baselineInkPixels <= 0) {
    reasons.push("baseline-has-no-ink");
  }
  if (typeof report.baselineHash !== "string" || report.baselineHash.length === 0) {
    reasons.push("missing-baseline-hash");
  }

  if (report.laneBaselines) {
    const cpu = report.laneBaselines.cpuReference;
    const wasm = report.laneBaselines.wasmCpu;
    if (!cpu || !cpu.hashMatched || !(cpu.inkPixels > 0)) {
      reasons.push("cpu-reference-baseline-mismatch");
    }
    if (!wasm || !wasm.hashMatched || !(wasm.inkPixels > 0)) {
      reasons.push("wasm-cpu-baseline-mismatch");
    }
  }

  const calls = Array.isArray(report.rejectedCalls) ? report.rejectedCalls : [];
  let preservedCount = 0;
  if (calls.length === 0) {
    reasons.push("empty-rejected-calls");
  } else {
    for (const call of calls) {
      const id = call?.caseId ?? "unknown";
      if (call?.threw !== true) {
        reasons.push(`rejected-call-did-not-throw:${id}`);
      }
      if (call?.code !== "lab-image-invalid") {
        reasons.push(`wrong-error-code:${id}:${String(call?.code)}`);
      }
      if (call?.expectedReason && call?.reason !== call.expectedReason) {
        reasons.push(`wrong-error-reason:${id}:${String(call?.reason)}`);
      }
      const dimsOk =
        call?.canvasDimensionsPreserved === true &&
        call?.canvasWidthAfter === report.baselineWidth &&
        call?.canvasHeightAfter === report.baselineHeight;
      const pixelsOk =
        call?.canvasPixelsPreserved === true &&
        call?.domHashAfter === report.baselineHash;
      if (!dimsOk) {
        canvasWipedOrCorrupted = true;
        reasons.push(`canvas-dimensions-mutated:${id}`);
      }
      if (!pixelsOk) {
        canvasWipedOrCorrupted = true;
        reasons.push(`canvas-pixels-corrupted:${id}`);
      }
      if (call?.sourceUnmutated !== true) {
        reasons.push(`source-buffer-mutated:${id}`);
      }
      if (dimsOk && pixelsOk && call?.threw === true && call?.code === "lab-image-invalid") {
        preservedCount += 1;
      }
    }
  }

  if (report.resizeRecovery?.recovered !== true) {
    reasons.push("resize-recovery-failed");
  }

  return {
    ok: reasons.length === 0,
    detectedFailure: reasons.length > 0,
    canvasWipedOrCorrupted,
    rejectedCallCount: calls.length,
    preservedCount,
    reasons,
  };
}

export function evaluateFaultInjectionReport(report) {
  const reasons = [];
  if (!report || typeof report !== "object") {
    return { ok: false, detectedFailure: true, reasons: ["invalid-fault-report"] };
  }
  if (report.executionKind !== "browser-dom-with-injected-context-faults") {
    reasons.push("missing-fault-injection-execution-kind");
  }
  if (report.getContextNull?.canvasPreserved !== true) {
    reasons.push("getContext-null-did-not-preserve-canvas");
  }
  if (report.createImageDataThrows?.canvasPreserved !== true) {
    reasons.push("createImageData-throw-did-not-preserve-canvas");
  }
  if (report.putImageDataThrowsSameSize?.canvasPreserved !== true) {
    reasons.push("putImageData-same-size-throw-did-not-preserve-canvas");
  }
  const cross = report.putImageDataThrowsCrossSizeAndRecovers;
  if (cross?.crossSizePutImageDataClearsBackingStore !== true) {
    reasons.push("cross-size-putImageData-backing-store-clear-not-recorded");
  }
  if (cross?.recoveredImmediately !== true) {
    reasons.push("cross-size-putImageData-did-not-recover-immediately");
  }
  return {
    ok: reasons.length === 0,
    detectedFailure: reasons.length > 0,
    reasons,
  };
}

export function evaluateFlattenWhiteAccuracy(report) {
  const reasons = [];
  let disguisedAsWhitePaper = false;
  let maxChannelError = 0;

  if (!report || typeof report !== "object") {
    return {
      ok: false,
      detectedFailure: true,
      disguisedAsWhitePaper: false,
      maxChannelError: Number.POSITIVE_INFINITY,
      reasons: ["invalid-flatten-report"],
    };
  }

  const five = report.fivePixelFixture;
  if (!five || five.width !== 5 || five.height !== 1 || !Array.isArray(five.actualPixels) || five.actualPixels.length !== 5) {
    reasons.push("invalid-five-pixel-fixture");
    maxChannelError = Number.POSITIVE_INFINITY;
  } else {
    if (five.sourceUnmutated !== true) reasons.push("five-pixel-source-mutated");
    for (let i = 0; i < EXPECTED_FIVE_PIXEL_WHITE_COMPOSITE.length; i += 1) {
      const exp = EXPECTED_FIVE_PIXEL_WHITE_COMPOSITE[i];
      const act = five.actualPixels[i];
      if (!Array.isArray(act) || act.length !== 4) {
        maxChannelError = Number.POSITIVE_INFINITY;
        reasons.push(`five-pixel-malformed:${i}`);
        continue;
      }
      for (let c = 0; c < 4; c += 1) {
        const diff = Math.abs((act[c] ?? 0) - exp[c]);
        if (diff > maxChannelError) maxChannelError = diff;
        if (diff > 0) reasons.push(`five-pixel-channel-mismatch:px${i}:ch${c}:got=${act[c]}:exp=${exp[c]}`);
      }
    }
  }

  const grid = report.grid3x2Fixture;
  if (!grid || grid.width !== 3 || grid.height !== 2 || !Array.isArray(grid.actualPixels) || !Array.isArray(grid.expectedPixels)) {
    reasons.push("invalid-grid-3x2-fixture");
  } else {
    if (grid.sourceUnmutated !== true) reasons.push("grid-3x2-source-mutated");
    if (grid.actualPixels.length !== grid.expectedPixels.length) {
      reasons.push("grid-3x2-length-mismatch");
    } else {
      for (let i = 0; i < grid.expectedPixels.length; i += 1) {
        const exp = grid.expectedPixels[i];
        const act = grid.actualPixels[i];
        for (let c = 0; c < 4; c += 1) {
          const diff = Math.abs((act?.[c] ?? 0) - exp[c]);
          if (diff > maxChannelError) maxChannelError = diff;
          if (diff > 0) reasons.push(`grid-3x2-mismatch:px${i}:ch${c}`);
        }
      }
    }
  }

  for (const laneKey of ["cpuReference", "wasmCpu"]) {
    const check = report.realLanePngChecks?.[laneKey];
    if (!check) {
      reasons.push(`missing-real-lane-png-check:${laneKey}`);
      continue;
    }
    if (check.allAlpha255 !== true) reasons.push(`non-opaque-alpha:${laneKey}`);
    if (!(check.nonWhitePixels > 0)) reasons.push(`no-visible-stroke-on-white:${laneKey}`);
    if (check.sourceUnmutated !== true) reasons.push(`real-lane-source-mutated:${laneKey}`);
    if (check.pngMagicValid !== true || !(check.pngBytesLength > 64)) {
      reasons.push(`invalid-png-encoding:${laneKey}`);
    }
  }

  const rejected = Array.isArray(report.flattenRejectedCalls) ? report.flattenRejectedCalls : [];
  if (rejected.length === 0) {
    reasons.push("empty-flatten-rejected-calls");
  } else {
    for (const item of rejected) {
      const id = item?.caseId ?? "unknown";
      if (item?.threw !== true) {
        reasons.push(`flatten-did-not-throw:${id}`);
        if (id === "short-buffer") disguisedAsWhitePaper = true;
      }
      if (item?.code !== "lab-image-invalid") {
        reasons.push(`flatten-wrong-code:${id}:${String(item?.code)}`);
      }
      if (item?.expectedReason && item?.reason !== item.expectedReason) {
        reasons.push(`flatten-wrong-reason:${id}:${String(item?.reason)}`);
      }
    }
  }

  if (
    report.disguisedShortBufferCheck?.disguisedAsWhitePaper === true ||
    (report.disguisedShortBufferCheck?.whitePaddedPixels ?? 0) > 0
  ) {
    disguisedAsWhitePaper = true;
    reasons.push("short-buffer-disguised-as-white-paper");
  }

  return {
    ok: reasons.length === 0,
    detectedFailure: reasons.length > 0,
    disguisedAsWhitePaper,
    maxChannelError,
    reasons,
  };
}

async function serveChild() {
  const { createServer } = await import("vite");
  const server = await createServer({
    root: labRoot,
    configFile: path.join(labRoot, "vite.config.ts"),
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, watch: null, headers: { "Cache-Control": "no-store" } },
    optimizeDeps: {
      force: true,
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "zod", "@dimforge/rapier2d-compat"],
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
    const timer = setTimeout(() => reject(new Error(`${label}: ${timeoutMs}ms 안에 준비되지 않았다\n${buffer.slice(-500)}`)), timeoutMs);
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
  const opts = parsePresentationProbeArgs(argv);
  if (opts.serve) {
    await serveChild();
    return 0;
  }
  if (env.BRUSH_LAB_BROWSER_PROBE !== "1") {
    log("BRUSH_LAB_BROWSER_PROBE=1이 아니라 건너뜀(게이트 꺼짐). 실행: BRUSH_LAB_BROWSER_PROBE=1 TMPDIR=/tmp node apps/brush-lab/scripts/presentation-boundary-probe/presentation-boundary-probe.mjs");
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
  const diskProvenance = collectPresentationSourceProvenance(labRoot);
  const failures = [];
  const fail = (message) => {
    failures.push(message);
    log(`FAIL ${message}`);
  };

  const summary = {
    probe: "presentation-boundary-probe",
    timestamp: new Date().toISOString(),
    chrome,
    userAgent: null,
    sourceProvenance: { disk: diskProvenance, browser: null, hashesMatched: false },
    canvasPresentBoundary: null,
    faultInjection: null,
    flattenOnWhite: null,
    negativeControls: null,
    pageErrors: [],
    consoleErrors: [],
    failures,
    ok: false,
  };

  const server = spawnGroup(process.execPath, [SELF, "--serve-child"], { stdio: ["ignore", "pipe", "pipe"], cwd: labRoot });
  if (opts.verbose) server.stderr.on("data", (c) => process.stderr.write(`[vite] ${c}`));
  const ready = await waitForLine(server, server.stdout, /READY (http:\/\/127\.0\.0\.1:\d+\/)/u, 90_000, "Vite 서버");
  const baseUrl = ready[1];
  const probeUrl = `${baseUrl}scripts/presentation-boundary-probe/presentation-boundary-probe.html`;
  log(`Vite 라이브 소스 dev 서버: ${baseUrl}`);

  const userData = mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "pbp-"));
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
    const m = await waitForLine(browserProc, browserProc.stderr, /DevTools listening on (ws:\/\/\S+)/u, 60_000, "Chromium");
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
    await page.waitForFunction(() => window.__brushLabPresentationProbeReady === true, null, { timeout: 120_000 });

    const browserProvenance = await page.evaluate(() => window.__brushLabPresentationProbe.getSourceProvenance());
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
    log(`${hashesMatched ? "ok  " : "FAIL"} 소스 프로비넌스 대조: canvas-present=${browserHashes.canvasPresentTs.slice(0, 12)}, live-session=${browserHashes.liveSessionTs.slice(0, 12)}`);
    if (!hashesMatched) fail(`브라우저 로드 소스와 디스크 해시 불일치: ${JSON.stringify({ diskHashes, browserHashes })}`);

    const rawPresent = await page.evaluate(() => window.__brushLabPresentationProbe.runCanvasPresentBoundaryCase());
    const evalPresent = evaluatePresentBoundaryReport(rawPresent);
    summary.canvasPresentBoundary = { ...rawPresent, evaluation: evalPresent };
    log(`${evalPresent.ok ? "ok  " : "FAIL"} [presentLabImage Boundary] rejected=${evalPresent.rejectedCallCount}, preserved=${evalPresent.preservedCount}, resizeRecovered=${rawPresent.resizeRecovery?.recovered}`);
    if (!evalPresent.ok) fail(`presentLabImage 경계 검증 실패: ${JSON.stringify(evalPresent)}`);

    const rawFaults = await page.evaluate(() => window.__brushLabPresentationProbe.runFaultInjectionCase());
    const evalFaults = evaluateFaultInjectionReport(rawFaults);
    summary.faultInjection = { ...rawFaults, evaluation: evalFaults };
    log(`${evalFaults.ok ? "ok  " : "FAIL"} [Fault Injection (${rawFaults.executionKind})] crossSizeClearsBacking=${rawFaults.putImageDataThrowsCrossSizeAndRecovers?.crossSizePutImageDataClearsBackingStore}, recovered=${rawFaults.putImageDataThrowsCrossSizeAndRecovers?.recoveredImmediately}`);
    if (!evalFaults.ok) fail(`Fault Injection 검증 실패: ${JSON.stringify(evalFaults)}`);

    const rawFlatten = await page.evaluate(() => window.__brushLabPresentationProbe.runFlattenOnWhiteCase());
    const evalFlatten = evaluateFlattenWhiteAccuracy(rawFlatten);
    summary.flattenOnWhite = { ...rawFlatten, evaluation: evalFlatten };
    log(`${evalFlatten.ok ? "ok  " : "FAIL"} [flattenOnWhite + encodePng] maxChannelErr=${evalFlatten.maxChannelError}, rejected=${rawFlatten.flattenRejectedCalls?.length}`);
    if (!evalFlatten.ok) fail(`flattenOnWhite 검증 실패: ${JSON.stringify(evalFlatten)}`);

    const rawNeg = await page.evaluate(() => window.__brushLabPresentationProbe.runNegativeControlCase());
    const negPresentEval = evaluatePresentBoundaryReport(rawNeg.legacyPresentMutatesBeforeValidate.simulatedBoundaryReport);
    const negFlattenEval = evaluateFlattenWhiteAccuracy(rawNeg.legacyFlattenDisguisesShortBufferAsWhite.simulatedFlattenReport);
    const neg1Detected =
      rawNeg.legacyPresentMutatesBeforeValidate.canvasWipedOrCorrupted === true &&
      negPresentEval.ok === false &&
      negPresentEval.detectedFailure === true &&
      negPresentEval.canvasWipedOrCorrupted === true;
    const neg2Detected =
      rawNeg.legacyFlattenDisguisesShortBufferAsWhite.disguisedAsWhitePaper === true &&
      negFlattenEval.ok === false &&
      negFlattenEval.detectedFailure === true &&
      negFlattenEval.disguisedAsWhitePaper === true;
    const negOk = neg1Detected && neg2Detected;
    summary.negativeControls = {
      ok: negOk,
      legacyPresentMutatesBeforeValidate: {
        detectedFailure: neg1Detected,
        canvasWipedOrCorrupted: rawNeg.legacyPresentMutatesBeforeValidate.canvasWipedOrCorrupted,
        evaluation: negPresentEval,
      },
      legacyFlattenDisguisesShortBufferAsWhite: {
        detectedFailure: neg2Detected,
        disguisedAsWhitePaper: rawNeg.legacyFlattenDisguisesShortBufferAsWhite.disguisedAsWhitePaper,
        whitePaddedPixels: rawNeg.legacyFlattenDisguisesShortBufferAsWhite.whitePaddedPixels,
        evaluation: negFlattenEval,
      },
    };
    log(`${negOk ? "ok  " : "FAIL"} [Negative Controls] legacyPresent(detected=${neg1Detected}), legacyFlatten(detected=${neg2Detected})`);
    if (!negOk) fail(`음성 대조군 탐지 실패: ${JSON.stringify(summary.negativeControls)}`);
  } catch (error) {
    fail(`치명적 예외: ${String(error?.stack ?? error).split("\n").slice(0, 4).join(" | ")}`);
  } finally {
    if (summary.pageErrors.length > 0) fail(`pageerror ${summary.pageErrors.length}건: ${summary.pageErrors[0]}`);
    summary.ok = failures.length === 0;
    const summaryPath = path.join(opts.out, "presentation-boundary-summary.json");
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

  log(summary.ok ? `전체 표시 경계 프로브 통과 (${opts.out})` : `표시 경계 프로브 실패 ${failures.length}건`);
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
  for (const [sig, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    process.on(sig, () => {
      killGroups();
      process.exit(code);
    });
  }
}
