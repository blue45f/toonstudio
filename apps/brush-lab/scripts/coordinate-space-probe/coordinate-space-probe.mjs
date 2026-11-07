#!/usr/bin/env node
// brush-lab 브라우저 좌표계 정확도 회귀 프로브(Coordinate Space Browser Probe).
// BRUSH_LAB_BROWSER_PROBE=1일 때만 실제 Chromium + Vite dev 서버(라이브 TS 소스)를 띄워 실행한다.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const labRoot = path.resolve(path.dirname(SELF), "../..");

export const DEFAULT_COORD_LANES = ["cpu-reference", "wasm-cpu"];
export const DEFAULT_COORD_PRESETS = ["ink-g-pen", "pencil-hb", "watercolor-wet"];
export const DEFAULT_COORD_DPRS = [1, 2, 3];
export const DEFAULT_COORD_VIEWPORTS = [320, 390, 768, 1280];
export const DEFAULT_COORD_MODES = ["baseline", "offset-scroll", "css-scale-0.75", "css-scale-1.25", "fit-dpr"];

function log(message) {
  process.stderr.write(`[coordinate-space-probe] ${message}\n`);
}

export function parseCoordProbeArgs(argv) {
  const opts = {
    lanes: [...DEFAULT_COORD_LANES],
    presets: [...DEFAULT_COORD_PRESETS],
    out: path.join(process.env.TMPDIR || os.tmpdir(), "brush-coordinate-space-probe"),
    skipUi: false,
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
    if (a === "--lanes") {
      opts.lanes = String(next()).split(",").map((s) => s.trim()).filter(Boolean);
      if (opts.lanes.length === 0) throw new Error("--lanes는 최소 1개 이상이어야 한다");
    } else if (a === "--presets") {
      opts.presets = String(next()).split(",").map((s) => s.trim()).filter(Boolean);
      if (opts.presets.length === 0) throw new Error("--presets는 최소 1개 이상이어야 한다");
    } else if (a === "--out") opts.out = String(next());
    else if (a === "--skip-ui") opts.skipUi = true;
    else if (a === "--verbose") opts.verbose = true;
    else if (a === "--serve-child") opts.serve = true;
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  return opts;
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function collectCoordSourceProvenance(rootDir = labRoot) {
  const resolved = existsSync(path.join(rootDir, "src/app/state/live-session.ts"))
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
      pointerCaptureTs: sha256File(path.join(resolved, "src/platform/pointer-capture.ts")),
      canvasPresentTs: sha256File(path.join(resolved, "src/platform/canvas-present.ts")),
      liveSessionTs: sha256File(path.join(resolved, "src/app/state/live-session.ts")),
      sumiKernelWasm: sha256File(path.join(resolved, "wasm/sumi-kernel/pkg/sumi_kernel.wasm")),
    },
  };
}

export function evaluateStrokeCoordinateAccuracy(input) {
  const reasons = [];
  const docW = input?.documentDimensions?.width ?? 0;
  const docH = input?.documentDimensions?.height ?? 0;
  if (!(docW > 0 && docH > 0 && Number.isFinite(docW) && Number.isFinite(docH))) {
    return {
      ok: false,
      maxSampleCoordErrorDocPx: Number.POSITIVE_INFINITY,
      intersectionErrorDocPx: Number.POSITIVE_INFINITY,
      intersectionErrorNorm: Number.POSITIVE_INFINITY,
      boundsErrorNorm: Number.POSITIVE_INFINITY,
      normalizedIntersection: { x: Number.NaN, y: Number.NaN },
      normalizedBounds: null,
      reasons: ["invalid-document-dimensions"],
    };
  }

  if (input.backingDimensions && (input.backingDimensions.width !== docW || input.backingDimensions.height !== docH)) {
    reasons.push("backing-dimensions-mismatch");
  }
  if (typeof input.requestedDpr === "number" && typeof input.windowDpr === "number" && Math.abs(input.windowDpr - input.requestedDpr) > 1e-3) {
    reasons.push("window-dpr-mismatch");
  }
  if (typeof input.inkPixels === "number" && input.inkPixels <= 0) {
    reasons.push("no-ink-pixels");
  }

  let maxSampleCoordErrorDocPx = 0;
  if (Array.isArray(input.samplePairs)) {
    if (input.samplePairs.length === 0) {
      maxSampleCoordErrorDocPx = Number.POSITIVE_INFINITY;
      reasons.push("empty-sample-pairs");
    } else {
      for (const pair of input.samplePairs) {
        const expX = pair?.expected?.x;
        const expY = pair?.expected?.y;
        const actX = pair?.actual?.x;
        const actY = pair?.actual?.y;
        if (!Number.isFinite(expX) || !Number.isFinite(expY) || !Number.isFinite(actX) || !Number.isFinite(actY)) {
          maxSampleCoordErrorDocPx = Number.POSITIVE_INFINITY;
          if (!reasons.includes("non-finite-sample-coordinate")) reasons.push("non-finite-sample-coordinate");
        } else {
          maxSampleCoordErrorDocPx = Math.max(maxSampleCoordErrorDocPx, Math.hypot(actX - expX, actY - expY));
        }
      }
    }
  } else if (typeof input.maxSampleCoordErrorDocPx === "number") {
    maxSampleCoordErrorDocPx = input.maxSampleCoordErrorDocPx;
    if (!Number.isFinite(maxSampleCoordErrorDocPx)) reasons.push("non-finite-sample-coordinate");
  } else {
    maxSampleCoordErrorDocPx = Number.POSITIVE_INFINITY;
    reasons.push("missing-sample-coordinates");
  }

  if (!Number.isFinite(maxSampleCoordErrorDocPx) || maxSampleCoordErrorDocPx > (input.maxSampleToleranceDocPx ?? 0.5)) {
    reasons.push("sample-coord-error-exceeded");
  }

  const expectedCenter = input.expectedIntersectionDocPx ?? { x: docW * 0.5, y: docH * 0.5 };
  const actualCenter = input.actualIntersectionDocPx ?? input.crosshairIntersectionDocPx ?? { x: Number.NaN, y: Number.NaN };
  const intersectionErrorDocPx = Math.hypot(actualCenter.x - expectedCenter.x, actualCenter.y - expectedCenter.y);
  const intersectionErrorNorm = Math.hypot((actualCenter.x - expectedCenter.x) / docW, (actualCenter.y - expectedCenter.y) / docH);
  if (!Number.isFinite(intersectionErrorDocPx) || intersectionErrorDocPx > (input.maxIntersectionToleranceDocPx ?? 2.5)) {
    reasons.push("crosshair-intersection-error-exceeded");
  }

  const expNorm = input.expectedBoundsNorm ?? [0.06, 0.06, 0.94, 0.94];
  const actBounds = input.actualBoundsDocPx ?? input.inkBoundsDocPx ?? null;
  const pad = input.brushRadiusPadDocPx ?? 4;
  let boundsErrorNorm = Number.POSITIVE_INFINITY;
  let normalizedBounds = null;

  if (
    !Array.isArray(actBounds) ||
    actBounds.length !== 4 ||
    actBounds.some((v) => typeof v !== "number" || !Number.isFinite(v)) ||
    actBounds[2] <= actBounds[0] ||
    actBounds[3] <= actBounds[1]
  ) {
    reasons.push("invalid-or-empty-ink-bounds");
  } else {
    const expMinX = Math.max(0, expNorm[0] * docW - pad);
    const expMinY = Math.max(0, expNorm[1] * docH - pad);
    const expMaxX = Math.min(docW - 1, expNorm[2] * docW + pad);
    const expMaxY = Math.min(docH - 1, expNorm[3] * docH + pad);
    boundsErrorNorm = Math.max(
      Math.abs(actBounds[0] - expMinX) / docW,
      Math.abs(actBounds[1] - expMinY) / docH,
      Math.abs(actBounds[2] - expMaxX) / docW,
      Math.abs(actBounds[3] - expMaxY) / docH,
    );
    normalizedBounds = [actBounds[0] / docW, actBounds[1] / docH, actBounds[2] / docW, actBounds[3] / docH];
    if (boundsErrorNorm > (input.maxBoundsErrorNorm ?? 0.04)) {
      reasons.push("ink-bounds-error-exceeded");
    }
  }

  return {
    ok: reasons.length === 0,
    maxSampleCoordErrorDocPx,
    intersectionErrorDocPx,
    intersectionErrorNorm,
    boundsErrorNorm,
    normalizedIntersection: { x: actualCenter.x / docW, y: actualCenter.y / docH },
    normalizedBounds,
    reasons,
  };
}

export function compareCrossResolutionNormalized(caseA, caseB, tolerance = {}) {
  const evalA = evaluateStrokeCoordinateAccuracy(caseA);
  const evalB = evaluateStrokeCoordinateAccuracy(caseB);
  const reasons = [];
  if (!evalA.ok) reasons.push(`caseA-failed:${evalA.reasons.join(",")}`);
  if (!evalB.ok) reasons.push(`caseB-failed:${evalB.reasons.join(",")}`);

  const centerDeltaNorm = Math.hypot(
    evalA.normalizedIntersection.x - evalB.normalizedIntersection.x,
    evalA.normalizedIntersection.y - evalB.normalizedIntersection.y,
  );
  if (!Number.isFinite(centerDeltaNorm) || centerDeltaNorm > (tolerance.maxCenterDeltaNorm ?? 0.015)) {
    reasons.push("cross-resolution-center-drift-exceeded");
  }

  let boundsDeltaNorm = Number.POSITIVE_INFINITY;
  if (evalA.normalizedBounds && evalB.normalizedBounds) {
    boundsDeltaNorm = Math.max(...evalA.normalizedBounds.map((v, idx) => Math.abs(v - evalB.normalizedBounds[idx])));
  }
  if (!Number.isFinite(boundsDeltaNorm) || boundsDeltaNorm > (tolerance.maxBoundsDeltaNorm ?? 0.04)) {
    reasons.push("cross-resolution-bounds-drift-exceeded");
  }

  return { ok: reasons.length === 0, centerDeltaNorm, boundsDeltaNorm, reasons };
}

export function buildCoordinateMatrixSchedule(lanes = DEFAULT_COORD_LANES, presets = DEFAULT_COORD_PRESETS) {
  const schedule = [];
  const primaryLane = lanes[0] ?? "cpu-reference";
  const primaryPreset = presets[0] ?? "ink-g-pen";
  const viewportDprPairs = [
    { viewportW: 320, viewportH: 740, dpr: 2 },
    { viewportW: 390, viewportH: 844, dpr: 3 },
    { viewportW: 768, viewportH: 1024, dpr: 2 },
    { viewportW: 1280, viewportH: 900, dpr: 1 },
  ];
  for (const mode of DEFAULT_COORD_MODES) {
    for (const vp of viewportDprPairs) schedule.push({ laneId: primaryLane, presetId: primaryPreset, mode, ...vp });
  }
  for (const dpr of DEFAULT_COORD_DPRS) {
    if (!schedule.some((c) => c.mode === "fit-dpr" && c.viewportW === 768 && c.dpr === dpr)) {
      schedule.push({ laneId: primaryLane, presetId: primaryPreset, mode: "fit-dpr", viewportW: 768, viewportH: 1024, dpr });
    }
  }
  let idx = 0;
  for (const laneId of lanes) {
    for (const presetId of presets) {
      const mode = DEFAULT_COORD_MODES[idx % DEFAULT_COORD_MODES.length];
      const dpr = DEFAULT_COORD_DPRS[idx % DEFAULT_COORD_DPRS.length];
      const viewportW = DEFAULT_COORD_VIEWPORTS[idx % DEFAULT_COORD_VIEWPORTS.length];
      const viewportH = viewportW <= 390 ? 844 : 900;
      if (!schedule.some((c) => c.laneId === laneId && c.presetId === presetId && c.mode === mode && c.dpr === dpr && c.viewportW === viewportW)) {
        schedule.push({ laneId, presetId, mode, viewportW, viewportH, dpr });
      }
      idx += 1;
    }
  }
  return schedule;
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runWorkbenchUiCoordinateCase(page, cdp, baseUrl, opts, fail) {
  const stageSel = '[data-testid="lab-draw-stage"]';
  const presentSel = '[data-testid="lab-draw-present"]';
  const statusSel = '[data-testid="lab-draw-status"]';
  const strokesSel = '[data-testid="lab-draw-hud-strokes"]';

  const waitReady = async (label) => {
    await page.waitForFunction((sel) => document.querySelector(sel)?.textContent === "준비됨", statusSel, { timeout: 120_000 }).catch(async (error) => {
      const status = await page.locator(statusSel).textContent().catch(() => "?");
      throw new Error(`${label}: 워크벤치 준비 대기 실패(상태 '${status}'): ${String(error?.message ?? error).split("\n")[0]}`);
    });
  };
  const waitStrokes = async (want, label) => {
    await page.waitForFunction(([sel, target]) => Number(document.querySelector(sel)?.textContent) === target, [strokesSel, want], { timeout: 60_000 }).catch(async () => {
      const got = await page.locator(strokesSel).textContent().catch(() => "?");
      throw new Error(`${label}: HUD 획 수가 ${want}이 되지 않았다(현재 '${got}')`);
    });
  };

  const uiConfigs = [
    { label: "desktop-1440x900-dpr1", width: 1440, height: 900, dpr: 1 },
    { label: "mobile-390x844-dpr2", width: 390, height: 844, dpr: 2 },
    { label: "tablet-768x1024-dpr2", width: 768, height: 1024, dpr: 2 },
  ];

  await page.goto(baseUrl, { timeout: 120_000, waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="lab-draw-view"]', { timeout: 120_000 });
  await waitReady("초기 워크벤치");

  const laneId = opts.lanes[0] ?? "cpu-reference";
  if ((await page.locator("#lab-draw-lane-select").inputValue()) !== laneId) {
    await page.evaluate((sel) => document.querySelector(sel)?.setAttribute("data-old", "1"), stageSel);
    await page.locator("#lab-draw-lane-select").selectOption(laneId);
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return el !== null && !el.hasAttribute("data-old");
    }, stageSel, { timeout: 60_000 });
    await waitReady(`UI 레인 ${laneId}`);
  }

  const results = [];
  for (const cfg of uiConfigs) {
    await page.setViewportSize({ width: cfg.width, height: cfg.height });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: cfg.width, height: cfg.height, deviceScaleFactor: cfg.dpr, mobile: false });
    await sleep(80);

    await page.evaluate((sel) => document.querySelector(sel)?.setAttribute("data-old", "1"), stageSel);
    await page.locator('[data-testid="lab-draw-clear"]').click();
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return el !== null && !el.hasAttribute("data-old");
    }, stageSel, { timeout: 60_000 });
    await waitReady(`${cfg.label} 초기화`);
    await waitStrokes(0, `${cfg.label} 초기화`);

    await page.locator(stageSel).scrollIntoViewIfNeeded();
    const box = await page.locator(stageSel).boundingBox();
    if (!box) throw new Error(`${cfg.label}: 스테이지 boundingBox를 얻지 못했다`);

    const drawLine = async (ax, ay, bx, by) => {
      await page.mouse.move(ax, ay);
      await page.mouse.down();
      for (let i = 1; i <= 10; i += 1) {
        await page.mouse.move(Math.round(ax + (bx - ax) * (i / 10)), Math.round(ay + (by - ay) * (i / 10)));
        await sleep(4);
      }
      await page.mouse.up();
    };
    const cx = Math.round(box.x + box.width * 0.5);
    const cy = Math.round(box.y + box.height * 0.5);
    await drawLine(Math.round(box.x + box.width * 0.2), cy, Math.round(box.x + box.width * 0.8), cy);
    await waitStrokes(1, `${cfg.label} 수평 중앙 획`);
    await drawLine(cx, Math.round(box.y + box.height * 0.2), cx, Math.round(box.y + box.height * 0.8));
    await waitStrokes(2, `${cfg.label} 수직 중앙 획`);
    await sleep(60);

    const measured = await page.evaluate((sel) => {
      const canvas = document.querySelector(sel);
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const { width, height } = canvas;
      const { data } = ctx.getImageData(0, 0, width, height);
      let inkPixels = 0;
      let sumHorizW = 0;
      let sumHorizY = 0;
      let sumVertW = 0;
      let sumVertX = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const a = data[(y * width + x) * 4 + 3] ?? 0;
          if (a >= 8) {
            inkPixels += 1;
            if (Math.abs(x - width * 0.5) > 24) {
              sumHorizW += a;
              sumHorizY += (y + 0.5) * a;
            }
            if (Math.abs(y - height * 0.5) > 24) {
              sumVertW += a;
              sumVertX += (x + 0.5) * a;
            }
          }
        }
      }
      return {
        windowDpr: window.devicePixelRatio,
        docW: width,
        docH: height,
        inkPixels,
        centroidDocPx: {
          x: sumVertW > 0 ? sumVertX / sumVertW : Number.NaN,
          y: sumHorizW > 0 ? sumHorizY / sumHorizW : Number.NaN,
        },
      };
    }, presentSel);

    const centerErrDocPx = measured
      ? Math.hypot(measured.centroidDocPx.x - measured.docW * 0.5, measured.centroidDocPx.y - measured.docH * 0.5)
      : Number.POSITIVE_INFINITY;
    const tolDocPx = measured ? Math.max(3.5, Math.min(measured.docW, measured.docH) * 0.01) : 3.5;
    const ok = measured !== null && measured.windowDpr === cfg.dpr && measured.inkPixels > 50 && centerErrDocPx <= tolDocPx;
    const entry = {
      scenarioId: `ui-coord-${cfg.label}`,
      viewport: { width: cfg.width, height: cfg.height, dpr: cfg.dpr },
      stageCssBox: box,
      ...measured,
      centerErrorDocPx: centerErrDocPx,
      toleranceDocPx: tolDocPx,
      ok,
    };
    results.push(entry);
    log(`${ok ? "ok  " : "FAIL"} [Workbench UI] ${cfg.label}: doc=${measured?.docW}x${measured?.docH}, centerErr=${centerErrDocPx.toFixed(2)}px`);
    if (!ok) fail(`Workbench UI 좌표 실패(${cfg.label}): ${JSON.stringify(entry)}`);
  }
  return results;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseCoordProbeArgs(argv);
  if (opts.serve) {
    await serveChild();
    return 0;
  }
  if (env.BRUSH_LAB_BROWSER_PROBE !== "1") {
    log("BRUSH_LAB_BROWSER_PROBE=1이 아니라 건너뜀(게이트 꺼짐). 실행: BRUSH_LAB_BROWSER_PROBE=1 TMPDIR=/tmp node apps/brush-lab/scripts/coordinate-space-probe/coordinate-space-probe.mjs");
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
  const diskProvenance = collectCoordSourceProvenance(labRoot);
  const failures = [];
  const fail = (message) => {
    failures.push(message);
    log(`FAIL ${message}`);
  };

  const summary = {
    probe: "coordinate-space-probe",
    timestamp: new Date().toISOString(),
    chrome,
    userAgent: null,
    lanes: opts.lanes,
    presets: opts.presets,
    sourceProvenance: { disk: diskProvenance, browser: null, hashesMatched: false },
    matrixCases: [],
    crossResolutionComparisons: [],
    midStrokeResizeCases: [],
    degenerateEdgeCases: [],
    negativeControls: null,
    workbenchUiCases: [],
    domInputAudit: null,
    pageErrors: [],
    consoleErrors: [],
    failures,
    ok: false,
  };

  const server = spawnGroup(process.execPath, [SELF, "--serve-child"], { stdio: ["ignore", "pipe", "pipe"], cwd: labRoot });
  if (opts.verbose) server.stderr.on("data", (c) => process.stderr.write(`[vite] ${c}`));
  const ready = await waitForLine(server, server.stdout, /READY (http:\/\/127\.0\.0\.1:\d+\/)/u, 90_000, "Vite 서버");
  const baseUrl = ready[1];
  const probeUrl = `${baseUrl}scripts/coordinate-space-probe/coordinate-space-probe.html`;
  log(`Vite 라이브 소스 dev 서버: ${baseUrl}`);

  const userData = mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "csp-"));
  const chromeArgs = [...(path.basename(chrome) === "headless_shell" ? [] : ["--headless=new"]), "--no-sandbox", "--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${userData}`, "--remote-debugging-port=0", "--window-size=1280,900", "about:blank"];
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
  const cdp = await context.newCDPSession(page);

  page.on("pageerror", (error) => {
    summary.pageErrors.push(error.message);
    log(`pageerror: ${error.message}`);
  });
  page.on("console", (msg) => {
    if (opts.verbose) log(`console.${msg.type()}: ${msg.text().slice(0, 300)}`);
    if (msg.type() === "error") summary.consoleErrors.push(msg.text().slice(0, 300));
  });

  await page.exposeFunction("__brushLabCdpDispatchMouse", async (events) => {
    for (const ev of events) {
      await cdp.send("Input.dispatchMouseEvent", {
        type: ev.type,
        x: ev.x,
        y: ev.y,
        button: ev.button ?? "left",
        buttons: ev.buttons ?? (ev.type === "mouseReleased" ? 0 : 1),
        clickCount: ev.clickCount ?? (ev.type === "mouseMoved" ? 0 : 1),
        pointerType: ev.pointerType ?? "mouse",
      });
    }
    return { count: events.length };
  });

  await page.exposeFunction("__brushLabCdpSetMetrics", async (metrics) => {
    const { width = 1280, height = 900, dpr = 1 } = metrics ?? {};
    await page.setViewportSize({ width, height });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: false });
    return { width, height, dpr };
  });

  try {
    summary.userAgent = await page.evaluate(() => navigator.userAgent);
    await page.goto(probeUrl, { timeout: 120_000, waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__brushLabCoordinateProbeReady === true, null, { timeout: 120_000 });

    const browserProvenance = await page.evaluate(() => window.__brushLabCoordinateProbe.getSourceProvenance());
    summary.sourceProvenance.browser = browserProvenance;
    const diskHashes = diskProvenance.sourceHashes;
    const browserHashes = browserProvenance.sourceHashes;
    const hashesMatched =
      diskHashes.pointerCaptureTs === browserHashes.pointerCaptureTs &&
      diskHashes.canvasPresentTs === browserHashes.canvasPresentTs &&
      diskHashes.liveSessionTs === browserHashes.liveSessionTs &&
      diskHashes.sumiKernelWasm === browserHashes.sumiKernelWasm &&
      browserProvenance.sumiKernelDeclaredSha256 === diskHashes.sumiKernelWasm;
    summary.sourceProvenance.hashesMatched = hashesMatched;
    log(`${hashesMatched ? "ok  " : "FAIL"} 소스 프로비넌스 대조: pointer-capture=${browserHashes.pointerCaptureTs.slice(0, 12)}, canvas-present=${browserHashes.canvasPresentTs.slice(0, 12)}`);
    if (!hashesMatched) fail(`브라우저 로드 소스와 디스크 해시 불일치: ${JSON.stringify({ diskHashes, browserHashes })}`);

    for (const cfg of buildCoordinateMatrixSchedule(opts.lanes, opts.presets)) {
      const rawRes = await page.evaluate((c) => window.__brushLabCoordinateProbe.runMatrixCase(c), cfg);
      const evaluation = evaluateStrokeCoordinateAccuracy(rawRes);
      const ok = evaluation.ok && rawRes.strokeCount === 4 && rawRes.dabCount > 0 && rawRes.errorsCount === 0 && rawRes.hadPointerCapture;
      const entry = { ...rawRes, evaluation, ok };
      summary.matrixCases.push(entry);
      log(`${ok ? "ok  " : "FAIL"} [Matrix] ${entry.caseId}: sampleErr=${evaluation.maxSampleCoordErrorDocPx.toFixed(3)}px, centerErr=${evaluation.intersectionErrorDocPx.toFixed(2)}px, boundsErr=${evaluation.boundsErrorNorm.toFixed(4)}`);
      if (!ok) fail(`Matrix 실패(${entry.caseId}): ${JSON.stringify({ reasons: evaluation.reasons, entry })}`);
    }

    const fitDpr1 = summary.matrixCases.find((c) => c.mode === "fit-dpr" && c.viewport.width === 768 && c.requestedDpr === 1);
    const fitDpr2 = summary.matrixCases.find((c) => c.mode === "fit-dpr" && c.viewport.width === 768 && c.requestedDpr === 2);
    if (fitDpr1 && fitDpr2) {
      const cmp = compareCrossResolutionNormalized(fitDpr1, fitDpr2);
      const backingScaled = fitDpr2.backingDimensions.width === fitDpr1.backingDimensions.width * 2;
      const ok = cmp.ok && backingScaled;
      summary.crossResolutionComparisons.push({ ...cmp, backingScaled, ok });
      log(`${ok ? "ok  " : "FAIL"} [Fit Cross-DPR] 768px DPR1(${fitDpr1.backingDimensions.width}px) vs DPR2(${fitDpr2.backingDimensions.width}px): centerDeltaNorm=${cmp.centerDeltaNorm.toFixed(4)}`);
      if (!ok) fail(`Fit Cross-DPR 정규화 비교 실패: ${JSON.stringify({ cmp, backingScaled })}`);
    }

    const primaryPreset = opts.presets[0] ?? "ink-g-pen";
    for (const laneId of opts.lanes) {
      const resMid = await page.evaluate(([l, p]) => window.__brushLabCoordinateProbe.runMidStrokeAndResizeLifecycleCase({ laneId: l, presetId: p }), [laneId, primaryPreset]);
      summary.midStrokeResizeCases.push(resMid);
      log(`${resMid.ok ? "ok  " : "FAIL"} [Mid-Stroke Resize+Cancel] ${resMid.caseId}: stroke1=${resMid.stroke1InkPixels}px 보존, postResizeErr=${resMid.postResizeMaxSampleErr.toFixed(3)}px`);
      if (!resMid.ok) fail(`Mid-Stroke Resize 실패(${resMid.caseId}): ${JSON.stringify(resMid)}`);

      const resDeg = await page.evaluate(([l, p]) => window.__brushLabCoordinateProbe.runDegenerateAndEdgeGuardCase(l, p), [laneId, primaryPreset]);
      summary.degenerateEdgeCases.push(resDeg);
      log(`${resDeg.ok ? "ok  " : "FAIL"} [Degenerate Edge Guards] ${resDeg.caseId}: zeroSize=${resDeg.strokesDuringZeroSize}, hidden=${resDeg.strokesDuringHidden}, noJump=${resDeg.midHideNoJump}`);
      if (!resDeg.ok) fail(`Degenerate Edge Guards 실패(${resDeg.caseId}): ${JSON.stringify(resDeg)}`);
    }

    const rawNeg = await page.evaluate(([l, p]) => window.__brushLabCoordinateProbe.runNegativeControlCase(l, p), [opts.lanes[0] ?? "cpu-reference", primaryPreset]);
    const evalDoubleDpr = evaluateStrokeCoordinateAccuracy(rawNeg.doubleDprBug);
    const evalScrollBug = evaluateStrokeCoordinateAccuracy(rawNeg.uncompensatedScrollBug);
    const negOk = evalDoubleDpr.ok === false && evalDoubleDpr.maxSampleCoordErrorDocPx > 50 && evalScrollBug.ok === false && evalScrollBug.maxSampleCoordErrorDocPx > 50;
    summary.negativeControls = {
      ok: negOk,
      doubleDprBug: { detectedFailure: !evalDoubleDpr.ok, ...evalDoubleDpr },
      uncompensatedScrollBug: { detectedFailure: !evalScrollBug.ok, ...evalScrollBug },
    };
    log(`${negOk ? "ok  " : "FAIL"} [Negative Controls] doubleDPR(detected=${!evalDoubleDpr.ok}, err=${evalDoubleDpr.maxSampleCoordErrorDocPx.toFixed(1)}px), scrollBug(detected=${!evalScrollBug.ok}, err=${evalScrollBug.maxSampleCoordErrorDocPx.toFixed(1)}px)`);
    if (!negOk) fail(`음성 대조군 탐지 실패: ${JSON.stringify(summary.negativeControls)}`);

    summary.domInputAudit = await page.evaluate(() => window.__brushLabCoordinateProbe.getDomInputAudit());
    if (!opts.skipUi) summary.workbenchUiCases = await runWorkbenchUiCoordinateCase(page, cdp, baseUrl, opts, fail);
  } catch (error) {
    fail(`치명적 예외: ${String(error?.stack ?? error).split("\n").slice(0, 4).join(" | ")}`);
  } finally {
    if (summary.pageErrors.length > 0) fail(`pageerror ${summary.pageErrors.length}건: ${summary.pageErrors[0]}`);
    summary.ok = failures.length === 0;
    const summaryPath = path.join(opts.out, "coordinate-space-summary.json");
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

  log(summary.ok ? `전체 좌표계 프로브 통과 (${opts.out})` : `좌표계 프로브 실패 ${failures.length}건`);
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
