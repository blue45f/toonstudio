#!/usr/bin/env node
// brush-lab 브라우저 수명주기 회귀 프로브(Dedicated Browser Lifecycle Regression Probe).
// BRUSH_LAB_BROWSER_PROBE=1일 때만 실제 Chromium + Vite dev 서버(라이브 TS 소스)를 띄워 실행한다.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const SELF = fileURLToPath(import.meta.url);
const labRoot = path.resolve(path.dirname(SELF), "..");

export const DEFAULT_LIFECYCLE_LANES = ["cpu-reference", "wasm-cpu"];
export const DEFAULT_LIFECYCLE_PRESETS = ["pencil-hb", "ink-g-pen", "watercolor-wet"];
export const MAX_RECREATE_ITERATIONS = 3;

function log(message) {
  process.stderr.write(`[browser-lifecycle-probe] ${message}\n`);
}

export function parseLifecycleArgs(argv) {
  const opts = {
    lanes: [...DEFAULT_LIFECYCLE_LANES],
    presets: [...DEFAULT_LIFECYCLE_PRESETS],
    out: path.join(process.env.TMPDIR || os.tmpdir(), "brush-lifecycle-probe"),
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

export function collectSourceProvenance(rootDir = labRoot) {
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
      liveSessionTs: sha256File(path.join(resolved, "src/app/state/live-session.ts")),
      faultInjectionLaneTs: sha256File(path.join(resolved, "src/app/testing/fault-injection-lane.ts")),
      sumiKernelWasm: sha256File(path.join(resolved, "wasm/sumi-kernel/pkg/sumi_kernel.wasm")),
    },
  };
}

export function buildEvidenceBoundaryManifest() {
  return {
    verified: {
      realDomInput: {
        status: "verified-in-chromium",
        method: "CDP Input.dispatchMouseEvent(mousePressed/mouseMoved/mouseReleased) hitting <canvas> and Element.prototype.setPointerCapture",
      },
      syntheticPointerEvent: {
        status: "verified-in-chromium",
        method: "In-page new PointerEvent(...) for multi-pointer pointerId=99 interference, secondary button, lostpointercapture, and pointercancel",
      },
      testOnlyDelayInjection: {
        status: "verified-in-chromium",
        method: "FaultInjectionLane wrapping real cpu-reference and wasm-cpu lanes to hold beginStroke/addSamples/endStroke across clear() and dispose()",
      },
      cpuWasmRealPixels: {
        status: "verified-in-chromium",
        lanes: [...DEFAULT_LIFECYCLE_LANES],
        presets: [...DEFAULT_LIFECYCLE_PRESETS],
        method: "Real pixelHash, inkPixels, dabCount, strokeCount, and seed comparison in Chromium for pure CPU reference and WebAssembly sumi_kernel.wasm",
      },
    },
    unverified: {
      physicalGpu: "unverified-no-hardware-gpu-in-vm",
      realHardwareStylusPen: "unverified-no-physical-stylus-device",
      unsupportedBrowsersWebkitFirefox: "unverified-chromium-only",
      rustCleanReproducibleRebuild: "unverified-rustc-wasm32-target-not-installed-in-vm-verified-by-sha256-seal-only",
    },
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
      // 이미 종료됨
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

function decodePngInkPixels(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("PNG 시그니처가 아니다");
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const f = raw[y * (stride + 1)];
    const rIn = y * (stride + 1) + 1;
    const rOut = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const v = raw[rIn + x];
      const a = x >= ch ? out[rOut + x - ch] : 0;
      const b = y > 0 ? out[rOut - stride + x] : 0;
      const c = x >= ch && y > 0 ? out[rOut - stride + x - ch] : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      out[rOut + x] = (v + (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth)) & 255;
    }
  }
  let ink = 0;
  for (let i = 0; i < out.length; i += ch) {
    if (Math.abs(255 - out[i]) + Math.abs(255 - out[i + 1]) + Math.abs(255 - out[i + 2]) > 24) ink += 1;
  }
  return ink;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWorkbenchUiGroupD(page, baseUrl, opts, fail) {
  const stageSel = '[data-testid="lab-draw-stage"]';
  const statusSel = '[data-testid="lab-draw-status"]';
  const strokesSel = '[data-testid="lab-draw-hud-strokes"]';
  const noticesSel = '[data-testid="lab-draw-notices"]';

  const waitReady = async (label) => {
    await page
      .waitForFunction((sel) => document.querySelector(sel)?.textContent === "준비됨", statusSel, { timeout: 120_000 })
      .catch(async (error) => {
        const status = await page.locator(statusSel).textContent().catch(() => "?");
        throw new Error(`${label}: 워크벤치 준비 대기 실패(상태 '${status}'): ${String(error?.message ?? error).split("\n")[0]}`);
      });
  };

  const waitStrokes = async (want, label) => {
    await page
      .waitForFunction(([sel, target]) => Number(document.querySelector(sel)?.textContent) === target, [strokesSel, want], { timeout: 60_000 })
      .catch(async () => {
        const got = await page.locator(strokesSel).textContent().catch(() => "?");
        throw new Error(`${label}: HUD 획 수가 ${want}이 되지 않았다(현재 '${got}')`);
      });
  };

  const clearUiCanvas = async (label) => {
    await page.evaluate((sel) => document.querySelector(sel)?.setAttribute("data-old", "1"), stageSel);
    await page.locator('[data-testid="lab-draw-clear"]').click();
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return el !== null && !el.hasAttribute("data-old");
    }, stageSel, { timeout: 60_000 });
    await waitReady(label);
    await waitStrokes(0, label);
  };

  const shotStageInk = async (fileName) => {
    await page.locator(stageSel).scrollIntoViewIfNeeded();
    const box = await page.locator(stageSel).boundingBox();
    if (!box) throw new Error("워크벤치 스테이지 크기를 얻지 못했다");
    const filePath = path.join(opts.out, fileName);
    await page.screenshot({ path: filePath, clip: { x: box.x + 3, y: box.y + 3, width: box.width - 6, height: box.height - 6 } });
    return { filePath, inkPixels: decodePngInkPixels(readFileSync(filePath)), box };
  };

  const drawUiCurve = async (box, rowRatio) => {
    const x0 = box.x + box.width * 0.14;
    const x1 = box.x + box.width * 0.86;
    const cy = box.y + box.height * rowRatio;
    await page.mouse.move(x0, cy);
    await page.mouse.down();
    for (let i = 1; i <= 18; i += 1) {
      const t = i / 18;
      await page.mouse.move(x0 + (x1 - x0) * t, cy + Math.sin(t * Math.PI * 2) * (box.height * 0.06));
      await sleep(6);
    }
    await page.mouse.up();
  };

  await page.goto(baseUrl, { timeout: 120_000, waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="lab-draw-view"]', { timeout: 120_000 });
  await waitReady("초기 워크벤치");

  const results = [];
  for (const laneId of opts.lanes) {
    const currentLane = await page.locator("#lab-draw-lane-select").inputValue();
    if (currentLane !== laneId) {
      await page.evaluate((sel) => document.querySelector(sel)?.setAttribute("data-old", "1"), stageSel);
      await page.locator("#lab-draw-lane-select").selectOption(laneId);
      await page.waitForFunction((sel) => {
        const el = document.querySelector(sel);
        return el !== null && !el.hasAttribute("data-old");
      }, stageSel, { timeout: 60_000 });
      await waitReady(`UI 레인 ${laneId}`);
    }

    for (const presetId of opts.presets) {
      const entry = {
        scenarioId: `D-ui-${laneId}-${presetId}`,
        laneId,
        presetId,
        evidenceClassification: { realDomInput: true, syntheticPointerEvent: true, testOnlyDelayInjection: false, pixelVerification: "cpu-wasm-real-pixels" },
        ok: false,
      };
      results.push(entry);
      try {
        await page.locator('[data-testid="lab-draw-chip-all"]').click();
        await page.fill("#lab-draw-search", "");
        const brush = page.locator(`[data-testid="lab-draw-brush-${presetId}"]`);
        await brush.scrollIntoViewIfNeeded();
        await brush.click();
        await clearUiCanvas(`${laneId}/${presetId} 초기화`);
        await page.locator(stageSel).scrollIntoViewIfNeeded();

        const stageBox = await page.locator(stageSel).boundingBox();
        if (!stageBox) throw new Error("스테이지 boundingBox 없음");

        await drawUiCurve(stageBox, 0.35);
        await waitStrokes(1, `${laneId}/${presetId} 첫 획`);
        await sleep(120);
        const afterFirst = await shotStageInk(`D-${laneId}-${presetId}-stroke1.png`);

        await page.mouse.move(stageBox.x + stageBox.width * 0.2, stageBox.y + stageBox.height * 0.65);
        await page.mouse.down();
        for (let i = 1; i <= 8; i += 1) {
          await page.mouse.move(stageBox.x + stageBox.width * 0.2 + i * 22, stageBox.y + stageBox.height * 0.65 + i * 4);
          await sleep(6);
        }
        await page.evaluate((sel) => {
          document.querySelector(sel)?.dispatchEvent(
            new PointerEvent("pointercancel", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, clientX: 260, clientY: 260 }),
          );
        }, stageSel);
        await page.waitForFunction((sel) => document.querySelector(sel)?.textContent?.includes("stroke-canceled"), noticesSel, { timeout: 30_000 });
        await page.mouse.up();
        await sleep(120);
        const strokesAfterCancel = Number(await page.locator(strokesSel).textContent());
        const afterCancel = await shotStageInk(`D-${laneId}-${presetId}-after-cancel.png`);

        await clearUiCanvas(`${laneId}/${presetId} clear`);
        await sleep(80);
        const afterClear = await shotStageInk(`D-${laneId}-${presetId}-cleared.png`);

        await drawUiCurve(stageBox, 0.55);
        await waitStrokes(1, `${laneId}/${presetId} 복구 획`);
        await sleep(120);
        const afterRecovery = await shotStageInk(`D-${laneId}-${presetId}-recovered.png`);
        const strokesAfterRecovery = Number(await page.locator(strokesSel).textContent());

        entry.firstStrokeInk = afterFirst.inkPixels;
        entry.strokesAfterCancel = strokesAfterCancel;
        entry.cancelInkPreserved = afterCancel.inkPixels === afterFirst.inkPixels;
        entry.clearedInk = afterClear.inkPixels;
        entry.recoveryInk = afterRecovery.inkPixels;
        entry.strokesAfterRecovery = strokesAfterRecovery;
        entry.ok =
          afterFirst.inkPixels > 50 &&
          strokesAfterCancel === 1 &&
          entry.cancelInkPreserved &&
          afterClear.inkPixels === 0 &&
          strokesAfterRecovery === 1 &&
          afterRecovery.inkPixels > 50;

        log(
          `${entry.ok ? "ok  " : "FAIL"} [Group D UI] ${laneId}/${presetId}: 1획=${afterFirst.inkPixels}px, 취소후=${afterCancel.inkPixels}px, 비움=${afterClear.inkPixels}px, 복구=${afterRecovery.inkPixels}px`,
        );
        if (!entry.ok) fail(`Group D UI 실패(${laneId}/${presetId}): ${JSON.stringify(entry)}`);
      } catch (error) {
        entry.error = String(error?.message ?? error).split("\n")[0];
        fail(`Group D UI 예외(${laneId}/${presetId}): ${entry.error}`);
      }
    }
  }
  return results;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseLifecycleArgs(argv);
  if (opts.serve) {
    await serveChild();
    return 0;
  }
  if (env.BRUSH_LAB_BROWSER_PROBE !== "1") {
    log("BRUSH_LAB_BROWSER_PROBE=1이 아니라 건너뜀(게이트 꺼짐). 실행: BRUSH_LAB_BROWSER_PROBE=1 TMPDIR=/tmp node apps/brush-lab/scripts/browser-lifecycle-probe.mjs");
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
  const diskProvenance = collectSourceProvenance(labRoot);
  const evidenceBoundaries = buildEvidenceBoundaryManifest();
  const failures = [];
  const fail = (message) => {
    failures.push(message);
    log(`FAIL ${message}`);
  };

  const summary = {
    probe: "browser-lifecycle-probe",
    timestamp: new Date().toISOString(),
    chrome,
    userAgent: null,
    lanes: opts.lanes,
    presets: opts.presets,
    maxRecreateIterations: MAX_RECREATE_ITERATIONS,
    sourceProvenance: { disk: diskProvenance, browser: null, hashesMatched: false },
    evidenceBoundaries,
    scenarioGroupA: [],
    scenarioGroupB: [],
    scenarioGroupC: [],
    scenarioGroupD: [],
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
  const probeUrl = `${baseUrl}scripts/browser-lifecycle-probe.html`;
  log(`Vite 라이브 소스 dev 서버: ${baseUrl}`);

  const userData = mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "blp-"));
  const chromeArgs = [
    ...(path.basename(chrome) === "headless_shell" ? [] : ["--headless=new"]),
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${userData}`,
    "--remote-debugging-port=0",
    "--enable-unsafe-webgpu",
    "--ignore-gpu-blocklist",
    "--enable-features=Vulkan",
    "--use-angle=swiftshader",
    "--use-webgpu-adapter=swiftshader",
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

  try {
    summary.userAgent = await page.evaluate(() => navigator.userAgent);
    await page.goto(probeUrl, { timeout: 120_000, waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__brushLabLifecycleProbeReady === true, null, { timeout: 120_000 });

    const browserProvenance = await page.evaluate(() => window.__brushLabLifecycleProbe.getSourceProvenance());
    summary.sourceProvenance.browser = browserProvenance;
    const diskHashes = diskProvenance.sourceHashes;
    const browserHashes = browserProvenance.sourceHashes;
    const hashesMatched =
      diskHashes.pointerCaptureTs === browserHashes.pointerCaptureTs &&
      diskHashes.liveSessionTs === browserHashes.liveSessionTs &&
      diskHashes.faultInjectionLaneTs === browserHashes.faultInjectionLaneTs &&
      diskHashes.sumiKernelWasm === browserHashes.sumiKernelWasm &&
      browserProvenance.sumiKernelDeclaredSha256 === diskHashes.sumiKernelWasm;
    summary.sourceProvenance.hashesMatched = hashesMatched;
    log(
      `${hashesMatched ? "ok  " : "FAIL"} 소스 프로비넌스 대조: live-session=${browserHashes.liveSessionTs.slice(0, 12)}, pointer-capture=${browserHashes.pointerCaptureTs.slice(0, 12)}, wasm=${browserHashes.sumiKernelWasm.slice(0, 12)}`,
    );
    if (!hashesMatched) fail(`브라우저 로드 소스와 디스크 해시 불일치: ${JSON.stringify({ diskHashes, browserHashes })}`);

    for (const laneId of opts.lanes) {
      for (const presetId of opts.presets) {
        const resA = await page.evaluate(([l, p]) => window.__brushLabLifecycleProbe.runScenarioGroupA(l, p), [laneId, presetId]);
        summary.scenarioGroupA.push(resA);
        log(`${resA.ok ? "ok  " : "FAIL"} [Group A clear 경합] ${laneId}/${presetId}: ${resA.cases.filter((c) => c.ok).length}/${resA.cases.length} 통과 (기준선 해시=${resA.baseline.hash}, dab=${resA.baseline.dabCount})`);
        if (!resA.ok) fail(`Group A 실패(${laneId}/${presetId}): ${JSON.stringify(resA.cases.filter((c) => !c.ok))}`);

        const resB = await page.evaluate(([l, p]) => window.__brushLabLifecycleProbe.runScenarioGroupB(l, p), [laneId, presetId]);
        summary.scenarioGroupB.push(resB);
        log(`${resB.ok ? "ok  " : "FAIL"} [Group B 캡처상실·간섭] ${laneId}/${presetId}: B1=${resB.subcaseB1.ok}, B2=${resB.subcaseB2.ok} (cancelSource=${resB.subcaseB2.abortCancelSource}, 2획 해시 일치=${resB.subcaseB2.hash2Equal})`);
        if (!resB.ok) fail(`Group B 실패(${laneId}/${presetId}): ${JSON.stringify(resB)}`);

        const resC = await page.evaluate(([l, p]) => window.__brushLabLifecycleProbe.runScenarioGroupC(l, p), [laneId, presetId]);
        summary.scenarioGroupC.push(resC);
        log(`${resC.ok ? "ok  " : "FAIL"} [Group C 3회 수명주기] ${laneId}/${presetId}: C1(attach/detach×3)=${resC.subcaseC1.ok}, C2(dispose/recreate×3)=${resC.subcaseC2.ok}`);
        if (!resC.ok) fail(`Group C 실패(${laneId}/${presetId}): ${JSON.stringify(resC)}`);
      }
    }

    summary.domInputAudit = await page.evaluate(() => window.__brushLabLifecycleProbe.getDomInputAudit());
    if (!opts.skipUi) {
      summary.scenarioGroupD = await runWorkbenchUiGroupD(page, baseUrl, opts, fail);
    }
  } catch (error) {
    fail(`치명적 예외: ${String(error?.stack ?? error).split("\n").slice(0, 4).join(" | ")}`);
  } finally {
    if (summary.pageErrors.length > 0) fail(`pageerror ${summary.pageErrors.length}건: ${summary.pageErrors[0]}`);
    summary.ok = failures.length === 0;
    const summaryPath = path.join(opts.out, "lifecycle-summary.json");
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    log(`요약 리포트 저장: ${summaryPath}`);
    try {
      await browser.close();
    } catch {
      // 연결 종료 무시
    }
    try {
      rmSync(userData, { recursive: true, force: true });
    } catch {
      // 임시 디렉터리 정리 실패 무시
    }
  }

  log(summary.ok ? `전체 수명주기 프로브 통과 (${opts.out})` : `수명주기 프로브 실패 ${failures.length}건`);
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

  process.on("SIGINT", () => {
    killGroups();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    killGroups();
    process.exit(143);
  });
}
