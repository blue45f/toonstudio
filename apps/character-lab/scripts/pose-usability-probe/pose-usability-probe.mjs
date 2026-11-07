#!/usr/bin/env node
// character-lab 포즈 모바일·태블릿 사용성(반응형·44px 터치 타겟·접이식 진단·손상 리그 조작 차단 및 즉시 복구) 실브라우저 프로브.
import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildOfficialFixturePackageCatalog } from "../corrupted-skeleton-fixtures.mjs";

import {
  REQUIRED_ANCESTOR_COMMITS,
  evaluatePoseUsabilityReport,
  runPoseUsabilityNegativeControlSuite,
} from "./pose-usability-evaluator.mjs";

const probeDir = path.dirname(fileURLToPath(import.meta.url));
const labRoot = path.resolve(probeDir, "..", "..");
const repoRoot = path.resolve(labRoot, "..", "..");

const CANDIDATE_CHROMIUM_PATHS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/local/manual-bin/chromium",
];
const CHROMIUM_TMPDIR_RESERVE_BYTES = 64;
const SOCKET_PATH_LIMIT_BYTES = 104;
const DEFAULT_SCREENSHOTS_DIR = "/tmp/character-lab-pose-usability-probe";
const DEFAULT_BEFORE_DIR = "/tmp/character-lab-pose-usability-probe/before";
const DEFAULT_OUT_PATH = "/tmp/character-lab-pose-usability-probe/pose-usability-report.json";
const HARDWARE_DISCLAIMER_KO =
  "이 실행은 컨테이너 소프트웨어 렌더러(SwiftShader) 기반이며, 실제 물리 GPU(WebGPU/Metal/Vulkan/DX12)·웹캠 카메라 하드웨어·모바일/태블릿 터치 기기 및 실시간 프레임 성능을 검증한 증거가 아닙니다.";

const VIEWPORT_CONFIGS = [
  { id: "320px", width: 320, height: 800, zoom: 1 },
  { id: "390px", width: 390, height: 844, zoom: 1 },
  { id: "768px", width: 768, height: 1024, zoom: 1 },
  { id: "1440px", width: 1440, height: 900, zoom: 1 },
  { id: "200pct-zoom", width: 1440, height: 900, zoom: 2 },
];

const INTERACTIVE_SELECTOR =
  ".cl-pose-panel button, .cl-pose-panel select, .cl-pose-panel summary, .cl-pose-panel input[type='number'], .cl-pose-panel .cl-pose-radio, .cl-viewport-toolbar button, .cl-viewport-toolbar select, .cl-inspector-tab";

const pendingCleanups = new Set();

function log(message) {
  console.log(`[pose-usability-probe] ${message}`);
}

export function guardTmpdir(env = process.env, platform = process.platform, tmpdirOf = () => os.tmpdir()) {
  if (platform === "win32") return { changed: false, tmpdir: tmpdirOf(), warning: null };
  const current = tmpdirOf();
  const bytes = Buffer.byteLength(current);
  if (bytes + CHROMIUM_TMPDIR_RESERVE_BYTES <= SOCKET_PATH_LIMIT_BYTES) return { changed: false, tmpdir: current, warning: null };
  if (!existsSync("/tmp")) {
    return { changed: false, tmpdir: current, warning: `TMPDIR(${bytes}바이트)가 길어 Chromium 소켓 한도(${SOCKET_PATH_LIMIT_BYTES}바이트)를 넘지만 /tmp가 없어 바꾸지 못했다.` };
  }
  env.TMPDIR = "/tmp";
  return { changed: true, tmpdir: "/tmp", warning: `TMPDIR가 ${bytes}바이트로 길어(소켓 경로 한도 ${SOCKET_PATH_LIMIT_BYTES}바이트) 이 프로세스에서만 /tmp로 바꿨다. 원래 값: ${current}` };
}

export function parseArgs(argv) {
  const options = {
    software: false, negativeControl: false, out: DEFAULT_OUT_PATH,
    screenshotsDir: DEFAULT_SCREENSHOTS_DIR, beforeDir: DEFAULT_BEFORE_DIR, url: null, timeoutSec: 120,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[(i += 1)];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} 옵션에는 값이 필요합니다.`);
      return value;
    };
    if (arg === "--software") options.software = true;
    else if (arg === "--negative-control") options.negativeControl = true;
    else if (arg === "--out") options.out = next();
    else if (arg === "--screenshots-dir") options.screenshotsDir = next();
    else if (arg === "--before-dir") options.beforeDir = next();
    else if (arg === "--url") options.url = next();
    else if (arg === "--timeout-sec") options.timeoutSec = Number(next());
    else throw new Error(`알 수 없는 옵션: ${arg}`);
  }
  if (!Number.isFinite(options.timeoutSec) || options.timeoutSec <= 0) throw new Error("--timeout-sec는 양수여야 합니다.");
  return options;
}

function gitOutput(args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", timeout: 5000 }).trim();
  } catch {
    return "";
  }
}

export function collectGitProvenance() {
  const commitSha = gitOutput(["rev-parse", "HEAD"]);
  const shortCommit = gitOutput(["rev-parse", "--short", "HEAD"]);
  const branch = gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]);
  const ancestorCommits = REQUIRED_ANCESTOR_COMMITS.map((commit) => {
    let isAncestor;
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { cwd: repoRoot, stdio: "ignore", timeout: 5000 });
      isAncestor = true;
    } catch {
      isAncestor = false;
    }
    return { commit, present: isAncestor, isAncestor, subject: gitOutput(["log", "-n", "1", "--format=%s", commit]) };
  });
  const porcelain = gitOutput(["status", "--porcelain"]);
  const dirtyFiles = porcelain ? porcelain.split("\n").map((line) => line.trim()).filter(Boolean) : [];
  return { commitSha, shortCommit, branch, ancestorCommits, allRequiredAncestorsPresent: ancestorCommits.every((e) => e.isAncestor), dirtyFiles };
}

const PARENT_WATCHDOG_SOURCE = `import { readFileSync, rmSync } from "node:fs";
const parent = Number(process.env.CHARACTER_LAB_PROBE_PARENT_PID);
const tempDir = process.env.CHARACTER_LAB_PROBE_TEMP_DIR;
function parentAlive() {
  try { process.kill(parent, 0); } catch (error) { return error.code === "EPERM"; }
  try {
    const stat = readFileSync("/proc/" + parent + "/stat", "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state !== "Z" && state !== "X";
  } catch { return true; }
}
if (Number.isInteger(parent) && parent > 1) {
  setInterval(() => {
    if (parentAlive()) return;
    try { if (tempDir) rmSync(tempDir, { recursive: true, force: true }); } catch {}
    process.exit(0);
  }, 2000).unref();
}
`;

function killGroup(child, signal = "SIGTERM") {
  if (!child || child.pid === undefined) return;
  try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch { /* ignore */ } }
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function safeTail(filePath, lines = 12) {
  try { return readFileSync(filePath, "utf8").split("\n").slice(-lines).join("\n"); } catch { return "(로그 없음)"; }
}

async function startViteDevServer(timeoutSec) {
  const viteBin = path.join(labRoot, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) throw new Error("apps/character-lab/node_modules/vite를 찾지 못했습니다(pnpm install 필요).");
  const baseTmp = existsSync("/tmp") ? "/tmp" : os.tmpdir();
  const tempDir = mkdtempSync(path.join(baseTmp, "cl-pu-"));
  const logPath = path.join(tempDir, "vite.log");
  const logFd = openSync(logPath, "a");
  const watchdogPath = path.join(tempDir, "watch-parent.mjs");
  writeFileSync(watchdogPath, PARENT_WATCHDOG_SOURCE);
  const port = await freePort();
  const viteArgs = ["--import", pathToFileURL(watchdogPath).href, viteBin, "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(port), "--strictPort", "--clearScreen", "false"];
  const child = spawn(process.execPath, viteArgs, {
    cwd: labRoot, detached: true, stdio: ["ignore", logFd, logFd],
    env: { ...process.env, NO_COLOR: "1", BROWSER: "none", CHARACTER_LAB_PROBE_PARENT_PID: String(process.pid), CHARACTER_LAB_PROBE_TEMP_DIR: tempDir },
  });
  closeSync(logFd);
  child.unref();
  let exited = false;
  child.once("exit", () => { exited = true; });
  const stop = () => {
    killGroup(child, "SIGTERM");
    setTimeout(() => killGroup(child, "SIGKILL"), 250).unref();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  };
  const url = `http://127.0.0.1:${port}/`;
  const attempts = Math.max(40, Math.ceil((timeoutSec * 1000) / 500));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (exited) {
      stop();
      throw new Error(`Vite 개발 서버가 조기 종료됐습니다.\n${safeTail(logPath)}`);
    }
    try { if ((await fetch(url)).ok) return { url, stop, child, tempDir }; } catch { /* wait */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stop();
  throw new Error(`Vite 개발 서버가 ${timeoutSec}초 안에 응답하지 않았습니다.\n${safeTail(logPath)}`);
}

export function resolveChromiumPath() {
  return process.env.CHARACTER_LAB_CHROMIUM_PATH || CANDIDATE_CHROMIUM_PATHS.find((candidate) => existsSync(candidate));
}

function chromiumArgs(options) {
  const args = ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"];
  if (options.software) args.push("--no-sandbox", "--enable-features=Vulkan", "--use-angle=swiftshader", "--use-webgpu-adapter=swiftshader");
  return args;
}

function lookupCatalogRoute(catalog, pathname) {
  if (!catalog) return null;
  if (typeof catalog.resolveRoute === "function") return catalog.resolveRoute(pathname);
  return catalog.routes?.[pathname] ?? catalog.byPath?.get?.(pathname) ?? null;
}

async function installSyntheticPackageRoutes(page, catalog) {
  const servedUrls = [];
  await page.route("**/assets/characters/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const entry = lookupCatalogRoute(catalog, requestUrl.pathname);
    if (!entry) return await route.continue();
    servedUrls.push(requestUrl.pathname);
    const contentType = entry.contentType ?? (requestUrl.pathname.endsWith(".glb") ? "model/gltf-binary" : "application/json; charset=utf-8");
    const rawBody = entry.body ?? entry.bytes ?? entry.json;
    const body = Buffer.isBuffer(rawBody) || rawBody instanceof Uint8Array ? Buffer.from(rawBody) : typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
    await route.fulfill({
      status: entry.status ?? 200,
      headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", "Content-Type": contentType },
      body,
    });
  });
  return servedUrls;
}

function writeJsonReport(outPath, report) {
  if (!outPath) return;
  const resolved = path.resolve(outPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`);
  log(`리포트 저장: ${resolved}`);
}

async function waitEngineReady(page, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const okCount = await page.locator('.cl-engine-badge[data-tone="ok"]').count();
    const statusText = ((await page.locator('[role="status"]').first().textContent().catch(() => "")) ?? "").trim();
    if (okCount > 0 || /활성 엔진/u.test(statusText)) return statusText;
    await page.waitForTimeout(200);
  }
  throw new Error("엔진 ready 대기 타임아웃");
}

async function readHistoryDepth(page) {
  const text = (await page.locator(".cl-topbar-group .cl-muted").first().textContent()) ?? "";
  const match = /깊이\s+(\d+)/u.exec(text);
  return match ? Number(match[1]) : Number.NaN;
}

async function openPoseTab(page) {
  await page.getByRole("tablist", { name: "인스펙터" }).getByRole("tab", { name: "포즈", exact: true }).click();
  await page.locator(".cl-pose-panel").waitFor({ state: "visible" });
  await page.waitForTimeout(150);
}

async function openPackageTab(page, timeoutMs) {
  await page.getByRole("tablist", { name: "인스펙터" }).getByRole("tab", { name: /패키지/u }).click();
  if ((await page.locator(".cl-package-item").count()) === 0) {
    const refreshBtn = page.getByRole("button", { name: "목록 새로고침" });
    if ((await refreshBtn.count()) > 0) await refreshBtn.click();
  }
  await page.locator(".cl-package-item").first().waitFor({ timeout: timeoutMs });
}

async function loadPackageById(page, characterId, timeoutMs) {
  await openPackageTab(page, timeoutMs);
  const item = page.locator(`.cl-package-item[data-character-id="${characterId}"]`);
  await item.waitFor({ timeout: timeoutMs });
  await item.locator("button").first().click();
  await item.locator(".cl-package-status").waitFor({ timeout: timeoutMs });
  await page.waitForTimeout(250);
}

async function dismissAllFailureBanners(page) {
  const closeButtons = page.locator('.cl-banner-item button[aria-label^="닫기"]');
  const count = await closeButtons.count();
  for (let i = 0; i < count; i += 1) {
    if ((await closeButtons.count()) === 0) break;
    await closeButtons.first().click();
    await page.waitForTimeout(50);
  }
}

async function probeDiagnosticsAndGrouping(page) {
  await openPoseTab(page);
  const initial = await page.evaluate(() => {
    const primary = document.querySelector('[data-testid="pose-primary-controls"]');
    const details = document.querySelector('[data-testid="pose-advanced-diagnostics"]');
    const buttons = Array.from(document.querySelectorAll(".cl-pose-panel button, .cl-viewport-toolbar button"));
    const unnamedButtons = buttons
      .filter((btn) => (btn.getAttribute("aria-label") || btn.textContent || btn.getAttribute("title") || "").trim().length === 0)
      .map((btn) => btn.outerHTML.slice(0, 120));
    return {
      primaryGroupPresent: Boolean(primary) && primary.getAttribute("role") === "region" && primary.getAttribute("aria-label") === "주요 포즈 조작",
      detailsPresent: details instanceof HTMLDetailsElement,
      defaultOpen: details instanceof HTMLDetailsElement ? details.open : null,
      buttonNamesAccessible: buttons.length > 0 && unnamedButtons.length === 0,
      checkedButtonCount: buttons.length,
      unnamedButtons,
    };
  });

  const summary = page.locator('[data-testid="pose-diagnostics-summary"], [data-testid="pose-advanced-diagnostics"] > summary').first();
  let openedAfterClick = false;
  let closedAfterSecondClick = false;
  if (initial.detailsPresent && (await summary.count()) > 0) {
    await summary.click();
    await page.waitForTimeout(100);
    openedAfterClick = await page.evaluate(() => {
      const details = document.querySelector('[data-testid="pose-advanced-diagnostics"]');
      return details instanceof HTMLDetailsElement && details.open === true;
    });
    await summary.click();
    await page.waitForTimeout(100);
    closedAfterSecondClick = await page.evaluate(() => {
      const details = document.querySelector('[data-testid="pose-advanced-diagnostics"]');
      return details instanceof HTMLDetailsElement && details.open === false;
    });
  }

  return { ...initial, openedAfterClick, closedAfterSecondClick };
}

async function probeViewportMatrix(page, options) {
  const afterDir = path.resolve(options.screenshotsDir, "after");
  const beforeDir = path.resolve(options.beforeDir);
  mkdirSync(afterDir, { recursive: true });

  await openPoseTab(page);
  const viewports = {};

  for (const vp of VIEWPORT_CONFIGS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.evaluate((zoom) => { document.documentElement.style.zoom = zoom > 1 ? String(zoom) : ""; }, vp.zoom);
    await page.waitForTimeout(200);

    const metrics = await page.evaluate((selector) => {
      const doc = document.documentElement;
      const posePanel = document.querySelector(".cl-pose-panel");
      const rawEls = Array.from(document.querySelectorAll(selector));
      const visibleEls = rawEls.filter((el) => {
        if (!(el instanceof HTMLElement)) return false;
        const cs = window.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const under44 = [];
      for (const el of visibleEls) {
        const r = el.getBoundingClientRect();
        const widthOk = Math.ceil(r.width) >= 44 || r.width >= 43.5;
        const heightOk = Math.ceil(r.height) >= 44 || r.height >= 43.5;
        if (!widthOk || !heightOk) {
          under44.push({
            tag: el.tagName.toLowerCase(),
            text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 32),
            width: Math.round(r.width * 10) / 10,
            height: Math.round(r.height * 10) / 10,
          });
        }
      }
      return {
        clientWidth: doc.clientWidth,
        scrollWidth: doc.scrollWidth,
        horizontalOverflowPx: Math.max(0, doc.scrollWidth - doc.clientWidth),
        posePanelClientWidth: posePanel ? posePanel.clientWidth : 0,
        posePanelScrollWidth: posePanel ? posePanel.scrollWidth : 0,
        posePanelOverflowPx: posePanel ? Math.max(0, posePanel.scrollWidth - posePanel.clientWidth) : -1,
        totalInteractiveChecked: visibleEls.length,
        under44Count: under44.length,
        sampleUnder44: under44.slice(0, 8),
      };
    }, INTERACTIVE_SELECTOR);

    if (vp.width <= 768 || vp.zoom > 1) {
      await page.evaluate(() => {
        document.querySelector(".cl-pose-panel")?.scrollIntoView({ block: "start" });
      });
      await page.waitForTimeout(100);
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    const afterScreenshot = path.join(afterDir, `after-${vp.id}.png`);
    const beforeScreenshot = path.join(beforeDir, `before-${vp.id}.png`);
    await page.screenshot({ path: afterScreenshot, fullPage: false });

    viewports[vp.id] = {
      id: vp.id,
      ...metrics,
      beforeScreenshot,
      beforeScreenshotExists: existsSync(beforeScreenshot),
      afterScreenshot,
      afterScreenshotExists: existsSync(afterScreenshot),
    };
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
  return viewports;
}

async function probeInteractions(page, timeoutMs, pageErrors) {
  await openPoseTab(page);
  const handleSelector = ".cl-viewport-handle, .cl-joint-handle";
  const handlesBtn = page.getByRole("button", { name: "관절 핸들", exact: true });
  if ((await handlesBtn.getAttribute("aria-pressed")) !== "true") {
    await handlesBtn.click();
    await page.waitForTimeout(250);
  }
  await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 0, handleSelector, { timeout: timeoutMs });

  const errBeforeDrag = pageErrors.length;
  const depthBeforeDrag = await readHistoryDepth(page);
  const preferredBones = ["leftLowerArm", "head", "rightLowerArm", "spine", "hips"];
  let targetHandle = null;
  let chosenBone = null;
  for (const bone of preferredBones) {
    const loc = page.locator(`.cl-viewport-handle[data-bone="${bone}"], .cl-joint-handle[data-bone="${bone}"]`);
    if ((await loc.count()) > 0) {
      targetHandle = loc.first();
      chosenBone = bone;
      break;
    }
  }
  if (!targetHandle) {
    targetHandle = page.locator(handleSelector).first();
    chosenBone = await targetHandle.getAttribute("data-bone");
  }
  const box = await targetHandle.boundingBox();
  let dragged = false;
  if (box) {
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 48, startY - 36, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    dragged = true;
  }
  const depthAfterDrag = await readHistoryDepth(page);
  const pointerHandleDrag = {
    dragged, bone: chosenBone, historyDepthBefore: depthBeforeDrag, historyDepthAfter: depthAfterDrag,
    historyDepthIncremented: depthAfterDrag === depthBeforeDrag + 1, pageErrorCount: pageErrors.slice(errBeforeDrag).length,
  };

  const firstCard = page.locator(".cl-pose-panel .cl-pose-card").first();
  await firstCard.focus();
  await page.keyboard.press("Tab");
  await page.waitForTimeout(100);
  const keyboardFocus = await page.evaluate(() => {
    const active = document.activeElement;
    const inPosePanel = Boolean(active && active.closest(".cl-pose-panel"));
    const cs = active ? window.getComputedStyle(active) : null;
    const outlineObserved = Boolean(cs && cs.outlineStyle !== "none" && Number.parseFloat(cs.outlineWidth || "0") > 0);
    return {
      tabReachedPoseControl: inPosePanel, focusVisibleOutlineObserved: outlineObserved,
      activeTag: active?.tagName?.toLowerCase() ?? null, outlineStyle: cs?.outlineStyle ?? null, outlineWidth: cs?.outlineWidth ?? null,
    };
  });

  const errBeforeUndo = pageErrors.length;
  await firstCard.focus();
  const depthBeforeUndo = await readHistoryDepth(page);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  const depthAfterCtrlZ = await readHistoryDepth(page);
  const keyboardCtrlZWorked = depthAfterCtrlZ === depthBeforeUndo - 1;

  await firstCard.focus();
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(200);
  const depthAfterCtrlY = await readHistoryDepth(page);
  const keyboardCtrlYWorked = depthAfterCtrlY === depthBeforeUndo;

  const undoBtn = page.getByRole("group", { name: "히스토리" }).getByRole("button", { name: "실행 취소", exact: true });
  const redoBtn = page.getByRole("group", { name: "히스토리" }).getByRole("button", { name: "다시 실행", exact: true });
  await undoBtn.click();
  await page.waitForTimeout(200);
  const depthAfterUndoBtn = await readHistoryDepth(page);
  await redoBtn.click();
  await page.waitForTimeout(200);
  const depthAfterRedoBtn = await readHistoryDepth(page);
  await undoBtn.click();
  await page.waitForTimeout(200);

  const undoRedo = {
    undoRestoredDepth: keyboardCtrlZWorked && depthAfterUndoBtn === depthBeforeUndo - 1,
    redoReappliedDepth: keyboardCtrlYWorked && depthAfterRedoBtn === depthBeforeUndo,
    keyboardCtrlZWorked, keyboardCtrlYWorked, pageErrorCount: pageErrors.slice(errBeforeUndo).length,
  };

  return { pointerHandleDrag, keyboardFocus, undoRedo };
}

async function readCorruptPosePanelState(page, codeRegex) {
  const state = await page.evaluate(() => {
    const panel = document.querySelector(".cl-pose-panel");
    const panelText = panel?.textContent ?? "";
    const banners = Array.from(document.querySelectorAll(".cl-banner-item")).map((el) => el.textContent ?? "");
    const buttons = Array.from(document.querySelectorAll(".cl-pose-panel button"));
    const byText = (label) => buttons.find((b) => (b.textContent ?? "").trim() === label);
    const resetBtn = byText("포즈 초기화");
    const ikBtn = byText("IK 적용");
    const readBtn = byText("현재 위치 읽기");
    const presetCards = Array.from(document.querySelectorAll(".cl-pose-panel .cl-pose-card"));
    const controlsDisabled =
      Boolean(resetBtn?.disabled) && Boolean(ikBtn?.disabled) && Boolean(readBtn?.disabled) &&
      presetCards.length > 0 && presetCards.every((b) => b.disabled);
    const controlsEnabled =
      Boolean(resetBtn && !resetBtn.disabled) && Boolean(ikBtn && !ikBtn.disabled) && Boolean(readBtn && !readBtn.disabled) &&
      presetCards.length > 0 && presetCards.every((b) => !b.disabled);
    return { panelText, banners, controlsDisabled, controlsEnabled };
  });
  const diagnosticShown = codeRegex ? codeRegex.test(state.panelText) || state.banners.some((t) => codeRegex.test(t)) : false;
  return { ...state, diagnosticShown };
}

async function probeRigTransitions(page, serverUrl, timeoutMs, pageErrors) {
  await dismissAllFailureBanners(page);

  const errBeforeEmpty = pageErrors.length;
  await loadPackageById(page, "normal-empty-rig", timeoutMs);
  await openPoseTab(page);
  const emptyViewportText = (await page.locator(".cl-viewport").textContent().catch(() => "")) ?? "";
  const emptyPoseText = (await page.locator(".cl-pose-panel").textContent().catch(() => "")) ?? "";
  const emptyFailureBannerCount = await page.locator('.cl-banner-item[data-tone="error"]').count();
  const normalEmptyRig = {
    characterId: "normal-empty-rig",
    pageErrorCount: pageErrors.slice(errBeforeEmpty).length,
    failureBannerCount: emptyFailureBannerCount,
    emptyNoticeShown:
      emptyViewportText.includes("이 소스에는 스켈레톤이 없어 표시할 관절 핸들이 없습니다.") ||
      emptyPoseText.includes("스켈레톤이 없는 정적 메시"),
  };

  const errBeforeCycle = pageErrors.length;
  await loadPackageById(page, "corrupt-cycle-rig", timeoutMs);
  const depthBeforeCycle = await readHistoryDepth(page);
  await openPoseTab(page);
  const cycleState = await readCorruptPosePanelState(page, /\[skeleton-cycle\]/u);
  const depthAfterCycle = await readHistoryDepth(page);
  const corruptCycleRig = {
    characterId: "corrupt-cycle-rig",
    pageErrorCount: pageErrors.slice(errBeforeCycle).length,
    diagnosticShown: cycleState.diagnosticShown,
    controlsDisabledOnCorrupt: cycleState.controlsDisabled,
    historyDepthUnchanged: depthAfterCycle === depthBeforeCycle,
  };

  await page.goto(serverUrl, { waitUntil: "load" });
  await page.getByRole("button", { name: "WebGL2", exact: true }).click();
  await waitEngineReady(page, timeoutMs);

  const errBeforeNan = pageErrors.length;
  await loadPackageById(page, "corrupt-nan-rest-rig", timeoutMs);
  const depthBeforeNan = await readHistoryDepth(page);
  await openPoseTab(page);
  const nanState = await readCorruptPosePanelState(page, /\[skeleton-non-finite-rest\]/u);
  const depthAfterNan = await readHistoryDepth(page);
  const corruptNanRestRig = {
    characterId: "corrupt-nan-rest-rig",
    pageErrorCount: pageErrors.slice(errBeforeNan).length,
    diagnosticShown: nanState.diagnosticShown,
    controlsDisabledOnCorrupt: nanState.controlsDisabled,
    historyDepthUnchanged: depthAfterNan === depthBeforeNan,
  };

  const errBeforeRecovery = pageErrors.length;
  await loadPackageById(page, "valid-humanoid-rig", timeoutMs);
  await openPoseTab(page);
  const recoveryState = await readCorruptPosePanelState(page, null);
  const depthBeforeRecoveryAction = await readHistoryDepth(page);

  const nudgeBtn = page.locator(".cl-pose-panel").getByRole("button", { name: "위로 +10cm", exact: true });
  const ikApplyBtn = page.locator(".cl-pose-panel").getByRole("button", { name: "IK 적용", exact: true });
  if ((await nudgeBtn.count()) > 0 && (await nudgeBtn.isEnabled()) && (await ikApplyBtn.count()) > 0 && (await ikApplyBtn.isEnabled())) {
    await nudgeBtn.click();
    await page.waitForTimeout(100);
    await ikApplyBtn.click();
    await page.waitForTimeout(200);
  }
  let depthAfterRecoveryAction = await readHistoryDepth(page);
  if (depthAfterRecoveryAction !== depthBeforeRecoveryAction + 1) {
    const presetCard = page.locator('.cl-pose-panel .cl-pose-card:not([aria-pressed="true"])').first();
    if ((await presetCard.count()) > 0 && (await presetCard.isEnabled())) {
      await presetCard.click();
      await page.waitForTimeout(200);
      depthAfterRecoveryAction = await readHistoryDepth(page);
    }
  }
  const recoveryPageErrorCount = pageErrors.slice(errBeforeRecovery).length;
  const historyDepthIncremented = depthAfterRecoveryAction === depthBeforeRecoveryAction + 1;
  const immediateRecoveryToValidRig = {
    characterId: "valid-humanoid-rig",
    pageErrorCount: recoveryPageErrorCount,
    controlsEnabledAfterRecovery: recoveryState.controlsEnabled,
    poseActionSucceeded: recoveryState.controlsEnabled && historyDepthIncremented && recoveryPageErrorCount === 0,
    historyDepthIncremented,
  };

  return { normalEmptyRig, corruptCycleRig, corruptNanRestRig, immediateRecoveryToValidRig };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const provenance = collectGitProvenance();

  if (options.negativeControl) {
    log("음성 대조군(--negative-control) 스위트를 실행합니다…");
    const negativeControl = runPoseUsabilityNegativeControlSuite();
    const report = {
      schema: "character-lab-pose-usability-probe/v1", mode: "negative-control",
      generatedAt: new Date().toISOString(), provenance, negativeControl, exitCode: negativeControl.allRejected ? 1 : 2,
    };
    writeJsonReport(options.out, report);
    log(`음성 대조군 결과: 변이 케이스 ${negativeControl.cases.length}개 · 모두 거부됨=${negativeControl.allRejected} (종료 코드 ${report.exitCode})`);
    return report.exitCode;
  }

  if (process.env.CHARACTER_LAB_BROWSER_PROBE !== "1") {
    log("CHARACTER_LAB_BROWSER_PROBE=1이 아니라 건너뜁니다(게이트 꺼짐).");
    return 0;
  }

  const tmp = guardTmpdir();
  if (tmp.warning) log(`경고: ${tmp.warning}`);

  let playwright;
  try {
    playwright = await import("playwright");
  } catch (error) {
    log(`playwright를 불러올 수 없다(${String(error?.message ?? error).split("\n")[0]}) — 구조적 skip`);
    return 2;
  }

  const executablePath = resolveChromiumPath();
  const launchArgs = chromiumArgs(options);
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: launchArgs });
  } catch (error) {
    log(`Chromium을 실행할 수 없다(${String(error?.message ?? error).split("\n")[0]}) — 구조적 skip`);
    return 2;
  }

  let server = { url: options.url ?? "", stop: () => undefined };
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    pendingCleanups.delete(cleanup);
    try { await browser.close(); } catch { /* ignore */ }
    try { server.stop(); } catch { /* ignore */ }
  };
  pendingCleanups.add(cleanup);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      log(`${signal} 수신 — 브라우저와 Vite 서버를 정리하고 종료합니다.`);
      cleanup().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
    });
  }

  try {
    if (!options.url) {
      log("Vite 개발 서버를 띄웁니다…");
      server = await startViteDevServer(options.timeoutSec);
      log(`Vite 개발 서버 준비 완료: ${server.url}`);
    }
  } catch (error) {
    await cleanup();
    throw error;
  }

  const timeoutMs = options.timeoutSec * 1000;
  const pageErrors = [];
  const consoleErrors = [];
  const catalog = buildOfficialFixturePackageCatalog("/assets/characters/");

  let report;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.on("pageerror", (error) => pageErrors.push(String(error?.message ?? error).slice(0, 400)));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
    });

    const servedRoutes = await installSyntheticPackageRoutes(page, catalog);
    await page.goto(server.url, { waitUntil: "load" });
    await page.getByRole("button", { name: "WebGL2", exact: true }).click();
    await waitEngineReady(page, timeoutMs);

    await openPackageTab(page, timeoutMs);
    const toProceduralBtn = page.getByRole("button", { name: /절차 소스로 전환|절차 소스로 돌아가기/u });
    if ((await toProceduralBtn.count()) > 0) {
      await toProceduralBtn.first().click();
      await page.waitForTimeout(250);
    }
    await dismissAllFailureBanners(page);

    log("1/4 · 그룹화 및 접이식 진단(diagnosticsAndGrouping) 검증…");
    const diagnosticsAndGrouping = await probeDiagnosticsAndGrouping(page);

    log("2/4 · 5개 뷰포트·200% 줌 매트릭스 및 스크린샷(viewports) 측정…");
    const viewports = await probeViewportMatrix(page, options);

    log("3/4 · 포인터 관절 드래그·키보드 포커스·Undo/Redo(interactions) 검증…");
    const interactions = await probeInteractions(page, timeoutMs, pageErrors);

    log("4/4 · 리그 전환·손상 스켈레톤 차단 및 즉시 복구(rigTransitions) 검증…");
    const rigTransitions = await probeRigTransitions(page, server.url, timeoutMs, pageErrors);

    const rawReport = {
      schema: "character-lab-pose-usability-probe/v1",
      generatedAt: new Date().toISOString(),
      url: server.url,
      softwareRenderer: Boolean(options.software),
      environment: {
        node: process.version, platform: process.platform, softwareRenderer: Boolean(options.software),
        hardwareDisclaimerKo: options.software ? HARDWARE_DISCLAIMER_KO : null, tmpdirGuard: tmp,
      },
      provenance,
      viewports,
      diagnosticsAndGrouping,
      rigTransitions,
      interactions,
      servedSyntheticRoutes: [...new Set(servedRoutes)],
      pageErrors,
      consoleErrors: consoleErrors.slice(0, 20),
    };

    const evaluation = evaluatePoseUsabilityReport(rawReport);
    report = { ...rawReport, evaluation, exitCode: evaluation.ok ? 0 : 1 };
  } finally {
    await cleanup();
  }

  writeJsonReport(options.out, report);
  log(`완료: ok=${report.evaluation.ok} · 실패=${report.evaluation.failures.length}건 · 종료 코드=${report.exitCode}`);
  if (!report.evaluation.ok) {
    for (const failure of report.evaluation.failures) log(`  - ${failure}`);
  }
  return report.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    async (error) => {
      console.error(error);
      await Promise.all([...pendingCleanups].map((fn) => fn().catch(() => undefined)));
      process.exit(1);
    },
  );
}
