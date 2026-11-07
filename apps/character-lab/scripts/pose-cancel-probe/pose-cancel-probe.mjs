#!/usr/bin/env node
// character-lab 포즈·관절·제어점 드래그 중 인터럽트(pointercancel, lostpointercapture, Escape, window.blur) 취소·롤백·연속 리그 전환 실브라우저 프로브.
import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildOfficialFixturePackageCatalog } from "../corrupted-skeleton-fixtures.mjs";

import {
  REQUIRED_ANCESTOR_COMMITS,
  evaluatePoseCancelProbeReport,
  runPoseCancelNegativeControlSuite,
} from "./pose-cancel-evaluator.mjs";

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
const DEFAULT_SCREENSHOTS_DIR = "/tmp/character-lab-pose-cancel-probe";
const DEFAULT_OUT_PATH = "/tmp/character-lab-pose-cancel-probe/pose-cancel-report.json";
const HARDWARE_DISCLAIMER_KO =
  "이 실행은 컨테이너 소프트웨어 렌더러(SwiftShader) 기반이며, 실제 물리 멀티터치 하드웨어·Safari/WebKit 브라우저·하드웨어 가속 물리 GPU(Metal/Vulkan/DX12) 및 실시간 프레임 성능을 검증한 증거가 아닙니다.";

const UNVERIFIED_BOUNDARIES = Object.freeze({
  physicalMultiTouchHardware: false,
  safariWebKitBrowser: false,
  hardwareAcceleratedPhysicalGpu: false,
  statementKo:
    "물리 멀티터치 하드웨어, Safari/WebKit 브라우저, 하드웨어 가속 물리 GPU(Metal/Vulkan/DX12)는 이 컨테이너 SwiftShader Chromium 실행에서 검증되지 않았습니다.",
});

const pendingCleanups = new Set();

function log(message) {
  console.log(`[pose-cancel-probe] ${message}`);
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
    screenshotsDir: DEFAULT_SCREENSHOTS_DIR, url: null, timeoutSec: 120,
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
  const tempDir = mkdtempSync(path.join(baseTmp, "cl-pc-"));
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

async function ensureOverlayToggle(page, buttonName, enabled) {
  const btn = page.getByRole("button", { name: buttonName, exact: true });
  if (((await btn.getAttribute("aria-pressed")) === "true") !== enabled) {
    await btn.click();
    await page.waitForTimeout(200);
  }
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
  await page.waitForTimeout(300);
}

async function readHandleState(page, bone) {
  return await page.evaluate((targetBone) => {
    const el = document.querySelector(`.cl-viewport-handle[data-bone="${targetBone}"]`);
    const draggingEls = document.querySelectorAll('[data-dragging="true"], [data-gizmo-ring]');
    const rect = el ? el.getBoundingClientRect() : null;
    return {
      present: Boolean(el),
      cx: el ? Number(el.getAttribute("cx")) : Number.NaN,
      cy: el ? Number(el.getAttribute("cy")) : Number.NaN,
      clientX: rect ? rect.left + rect.width / 2 : Number.NaN,
      clientY: rect ? rect.top + rect.height / 2 : Number.NaN,
      isDragging: el?.getAttribute("data-dragging") === "true",
      activeDraggingOrRingCount: draggingEls.length,
    };
  }, bone);
}

async function chooseTargetBone(page, preferredBones = ["leftLowerArm", "hips", "spine", "head"]) {
  for (const bone of preferredBones) {
    if ((await page.locator(`.cl-viewport-handle[data-bone="${bone}"]`).count()) > 0) return bone;
  }
  const first = page.locator(".cl-viewport-handle").first();
  return (await first.count()) > 0 ? await first.getAttribute("data-bone") : null;
}

async function runSingleCancelScenario(page, scenarioId, options, pageErrors) {
  const errStart = pageErrors.length;
  const bone = await chooseTargetBone(page, ["leftLowerArm", "hips"]);
  if (!bone) throw new Error(`시나리오 ${scenarioId}: 드래그할 관절 핸들을 찾지 못했습니다.`);

  const depthBefore = await readHistoryDepth(page);
  const beforeState = await readHandleState(page, bone);
  const startX = beforeState.clientX;
  const startY = beforeState.clientY;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 48, startY - 36, { steps: 6 });
  await page.waitForTimeout(120);

  const midState = await readHandleState(page, bone);
  const previewMovedPx = Math.hypot(midState.cx - beforeState.cx, midState.cy - beforeState.cy);
  const dragStarted = midState.activeDraggingOrRingCount > 0 && previewMovedPx > 0.25;

  if (scenarioId === "pointerCancelMidDrag") {
    await page.evaluate((targetBone) => {
      const el = document.querySelector(`.cl-viewport-handle[data-bone="${targetBone}"]`);
      el?.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, cancelable: true, pointerId: 1, button: 0 }));
    }, bone);
  } else if (scenarioId === "lostPointerCaptureMidDrag") {
    await page.evaluate((targetBone) => {
      const el = document.querySelector(`.cl-viewport-handle[data-bone="${targetBone}"]`);
      if (el && typeof el.releasePointerCapture === "function" && el.hasPointerCapture?.(1)) el.releasePointerCapture(1);
      el?.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true, cancelable: true, pointerId: 1, button: 0 }));
    }, bone);
  } else if (scenarioId === "escapeKeyMidDrag") {
    await page.keyboard.press("Escape");
  } else if (scenarioId === "windowBlurMidDrag") {
    await page.evaluate(() => { window.dispatchEvent(new Event("blur")); });
  }

  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(150);

  const afterCancelState = await readHandleState(page, bone);
  const depthAfterCancel = await readHistoryDepth(page);
  const revertDeltaPx = Math.hypot(afterCancelState.cx - beforeState.cx, afterCancelState.cy - beforeState.cy);
  const draggingClearedAfterCancel = afterCancelState.activeDraggingOrRingCount === 0;
  const historyDepthUnchanged = depthAfterCancel === depthBefore;
  const uncommittedMutationReverted = Number.isFinite(revertDeltaPx) && revertDeltaPx <= 1.5;

  if (scenarioId === "pointerCancelMidDrag" && options.screenshotsDir) {
    mkdirSync(path.resolve(options.screenshotsDir), { recursive: true });
    await page.screenshot({ path: path.resolve(options.screenshotsDir, "after-cancel-clean.png"), fullPage: false });
  }

  const recoveryStart = await readHandleState(page, bone);
  await page.mouse.move(recoveryStart.clientX, recoveryStart.clientY);
  await page.mouse.down();
  await page.mouse.move(recoveryStart.clientX + 48, recoveryStart.clientY - 36, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(220);

  const depthAfterRecoveryDrag = await readHistoryDepth(page);
  if (scenarioId === "pointerCancelMidDrag" && options.screenshotsDir) {
    await page.screenshot({ path: path.resolve(options.screenshotsDir, "after-recovery-commit.png"), fullPage: false });
  }

  const undoBtn = page.getByRole("group", { name: "히스토리" }).getByRole("button", { name: "실행 취소", exact: true });
  if (await undoBtn.isEnabled()) {
    await undoBtn.click();
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      await page.waitForTimeout(80);
      const st = await readHandleState(page, bone);
      if (Math.hypot(st.cx - beforeState.cx, st.cy - beforeState.cy) <= 1.5) break;
    }
  }
  const depthAfterRecoveryUndo = await readHistoryDepth(page);
  const recoveryDragCommitted = depthAfterRecoveryDrag === depthBefore + 1 && depthAfterRecoveryUndo === depthBefore;

  return {
    id: scenarioId, bone, dragStarted,
    previewMovedPx: Math.round(previewMovedPx * 100) / 100,
    draggingClearedAfterCancel, historyDepthBefore: depthBefore, historyDepthAfterCancel: depthAfterCancel,
    historyDepthUnchanged, revertDeltaPx: Math.round(revertDeltaPx * 100) / 100,
    uncommittedMutationReverted, historyDepthAfterRecoveryDrag: depthAfterRecoveryDrag,
    historyDepthAfterRecoveryUndo: depthAfterRecoveryUndo, recoveryDragCommitted,
    pageErrorCount: pageErrors.slice(errStart).length,
  };
}

async function probeModeCancelChecks(page, pageErrors) {
  const errStartMode3 = pageErrors.length;
  const gizmoSelect = page.getByLabel("기즈모 조작 모드");
  await gizmoSelect.selectOption("3");
  await page.waitForTimeout(150);

  const spineBone = (await chooseTargetBone(page, ["spine", "hips", "head"])) ?? "spine";
  const depthBeforeMode3 = await readHistoryDepth(page);
  const spineBefore = await readHandleState(page, spineBone);

  await page.mouse.move(spineBefore.clientX, spineBefore.clientY);
  await page.mouse.down();
  await page.mouse.move(spineBefore.clientX + 40, spineBefore.clientY - 32, { steps: 6 });
  await page.waitForTimeout(100);
  const spineMid = await readHandleState(page, spineBone);
  const mode3DragStarted = spineMid.activeDraggingOrRingCount > 0;

  await page.evaluate((targetBone) => {
    const el = document.querySelector(`.cl-viewport-handle[data-bone="${targetBone}"]`);
    el?.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, cancelable: true, pointerId: 1, button: 0 }));
  }, spineBone);
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(150);

  const spineAfter = await readHandleState(page, spineBone);
  const depthAfterMode3 = await readHistoryDepth(page);
  await gizmoSelect.selectOption("2");
  await page.waitForTimeout(150);
  const restoredModeValue = await gizmoSelect.inputValue();

  const mode3BoneScaleCancel = {
    mode: 3, bone: spineBone, dragStarted: mode3DragStarted,
    draggingClearedAfterCancel: spineAfter.activeDraggingOrRingCount === 0,
    historyDepthBefore: depthBeforeMode3, historyDepthAfterCancel: depthAfterMode3,
    historyDepthUnchanged: depthAfterMode3 === depthBeforeMode3,
    uncommittedMutationReverted: depthAfterMode3 === depthBeforeMode3,
    mode2Restored: restoredModeValue === "2",
    pageErrorCount: pageErrors.slice(errStartMode3).length,
  };

  const errStartCp = pageErrors.length;
  await ensureOverlayToggle(page, "형상 제어점", true);
  const cpLocator = page.locator('.cl-viewport-control-point[data-control-point="cp-face-jaw"], .cl-viewport-control-point').first();
  await cpLocator.waitFor({ state: "visible" });
  const cpId = (await cpLocator.getAttribute("data-control-point")) ?? "cp-face-jaw";
  const cpBox = await cpLocator.boundingBox();
  const depthBeforeCp = await readHistoryDepth(page);

  let cpDragStarted = false;
  if (cpBox) {
    const cx = cpBox.x + cpBox.width / 2;
    const cy = cpBox.y + cpBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 36, cy + 24, { steps: 6 });
    await page.waitForTimeout(100);
    cpDragStarted = await page.evaluate((id) => {
      const el = document.querySelector(`.cl-viewport-control-point[data-control-point="${id}"]`);
      return el?.getAttribute("data-dragging") === "true";
    }, cpId);
    await page.evaluate((id) => {
      const el = document.querySelector(`.cl-viewport-control-point[data-control-point="${id}"]`);
      el?.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, cancelable: true, pointerId: 1, button: 0 }));
    }, cpId);
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(150);
  }

  const cpLeftover = await page.locator('[data-dragging="true"], [data-gizmo-ring]').count();
  const depthAfterCp = await readHistoryDepth(page);

  const controlPointCancel = {
    controlPointId: cpId, dragStarted: cpDragStarted,
    draggingClearedAfterCancel: cpLeftover === 0,
    historyDepthBefore: depthBeforeCp, historyDepthAfterCancel: depthAfterCp,
    historyDepthUnchanged: depthAfterCp === depthBeforeCp,
    uncommittedMutationReverted: depthAfterCp === depthBeforeCp,
    pageErrorCount: pageErrors.slice(errStartCp).length,
  };

  return { mode3BoneScaleCancel, controlPointCancel };
}

async function readCorruptViewportState(page, codeRegex) {
  const deadline = Date.now() + 2500;
  let last = { controlsDisabled: false, diagnosticShown: false };
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const handles = Array.from(document.querySelectorAll(".cl-viewport-handle"));
      const controlPoints = document.querySelectorAll(".cl-viewport-control-point");
      const banners = Array.from(document.querySelectorAll(".cl-banner-item")).map((el) => el.textContent ?? "");
      const notice = document.querySelector(".cl-viewport-notice")?.textContent ?? "";
      const controlsDisabled =
        controlPoints.length === 0 &&
        (handles.length === 0 || handles.every((h) => h.getAttribute("aria-disabled") === "true"));
      return { banners, notice, controlsDisabled };
    });
    const diagnosticShown = codeRegex ? codeRegex.test(state.notice) || state.banners.some((t) => codeRegex.test(t)) : false;
    last = { controlsDisabled: state.controlsDisabled, diagnosticShown };
    if (last.controlsDisabled && last.diagnosticShown) return last;
    await page.waitForTimeout(80);
  }
  return last;
}

async function probeContinuousRigTransitions(page, _serverUrl, timeoutMs, pageErrors) {
  const errStart = pageErrors.length;
  const sequence = ["procedural"];

  await loadPackageById(page, "valid-humanoid-rig", timeoutMs);
  sequence.push("valid-humanoid-rig");
  await ensureOverlayToggle(page, "관절 핸들", true);
  await ensureOverlayToggle(page, "형상 제어점", true);
  await page.waitForFunction(() => document.querySelectorAll(".cl-viewport-handle").length > 0, null, { timeout: timeoutMs });
  const firstValidOut = await runSingleCancelScenario(page, "escapeKeyMidDrag", {}, pageErrors);

  await loadPackageById(page, "normal-empty-rig", timeoutMs);
  sequence.push("normal-empty-rig");
  await page.waitForTimeout(250);
  const emptyHandles = await page.locator(".cl-viewport-handle").count();

  await loadPackageById(page, "corrupt-cycle-rig", timeoutMs);
  sequence.push("corrupt-cycle-rig");
  const cycleState = await readCorruptViewportState(page, /\[skeleton-cycle\]/u);

  await loadPackageById(page, "corrupt-nan-rest-rig", timeoutMs);
  sequence.push("corrupt-nan-rest-rig");
  const nanState = await readCorruptViewportState(page, /\[skeleton-non-finite-rest\]/u);

  await loadPackageById(page, "valid-humanoid-rig", timeoutMs);
  sequence.push("valid-humanoid-rig");
  await ensureOverlayToggle(page, "관절 핸들", true);
  await ensureOverlayToggle(page, "형상 제어점", true);
  await page.waitForFunction(
    () => document.querySelectorAll(".cl-viewport-handle").length > 0 && document.querySelectorAll(".cl-viewport-control-point").length === 13,
    null,
    { timeout: timeoutMs },
  );

  const finalCancelOut = await runSingleCancelScenario(page, "pointerCancelMidDrag", {}, pageErrors);
  const redoBtn = page.getByRole("group", { name: "히스토리" }).getByRole("button", { name: "다시 실행", exact: true });
  const undoBtn = page.getByRole("group", { name: "히스토리" }).getByRole("button", { name: "실행 취소", exact: true });
  const depthBeforeRedo = await readHistoryDepth(page);
  let redoWorked = false;
  if (await redoBtn.isEnabled()) {
    await redoBtn.click();
    await page.waitForTimeout(200);
    const depthAfterRedo = await readHistoryDepth(page);
    redoWorked = depthAfterRedo === depthBeforeRedo + 1;
    if (await undoBtn.isEnabled()) {
      await undoBtn.click();
      await page.waitForTimeout(200);
    }
  }

  const leftoverDraggingElements = await page.locator('[data-dragging="true"], [data-gizmo-ring]').count();
  const corruptRigBlockedCleanly =
    emptyHandles === 0 && cycleState.controlsDisabled && cycleState.diagnosticShown &&
    nanState.controlsDisabled && nanState.diagnosticShown;
  const finalValidRigCancelAndCommitPassed =
    firstValidOut.dragStarted && firstValidOut.draggingClearedAfterCancel && firstValidOut.historyDepthUnchanged &&
    firstValidOut.recoveryDragCommitted && finalCancelOut.dragStarted && finalCancelOut.draggingClearedAfterCancel &&
    finalCancelOut.historyDepthUnchanged && finalCancelOut.uncommittedMutationReverted && finalCancelOut.recoveryDragCommitted && redoWorked;

  return {
    sequence, allTransitionsCompleted: sequence.length === 6, leftoverDraggingElements,
    corruptRigBlockedCleanly, finalValidRigCancelAndCommitPassed,
    firstValidRigSummary: firstValidOut, finalValidRigSummary: { ...finalCancelOut, redoWorked },
    pageErrorCount: pageErrors.slice(errStart).length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const provenance = collectGitProvenance();

  if (options.negativeControl) {
    log("음성 대조군(--negative-control) 스위트를 실행합니다…");
    const negativeControl = runPoseCancelNegativeControlSuite();
    const report = {
      schema: "character-lab-pose-cancel-probe/v1", mode: "negative-control",
      generatedAt: new Date().toISOString(), provenance, unverifiedBoundaries: UNVERIFIED_BOUNDARIES,
      negativeControl, exitCode: negativeControl.allRejected ? 1 : 2,
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

    await ensureOverlayToggle(page, "관절 핸들", true);
    await ensureOverlayToggle(page, "형상 제어점", true);
    await page.waitForFunction(() => document.querySelectorAll(".cl-viewport-handle").length > 0, null, { timeout: timeoutMs });

    log("1/3 · 4종 드래그 인터럽트(pointercancel, lostpointercapture, Escape, window.blur) 취소·롤백·복구 검증…");
    const cancelScenarios = {
      pointerCancelMidDrag: await runSingleCancelScenario(page, "pointerCancelMidDrag", options, pageErrors),
      lostPointerCaptureMidDrag: await runSingleCancelScenario(page, "lostPointerCaptureMidDrag", options, pageErrors),
      escapeKeyMidDrag: await runSingleCancelScenario(page, "escapeKeyMidDrag", options, pageErrors),
      windowBlurMidDrag: await runSingleCancelScenario(page, "windowBlurMidDrag", options, pageErrors),
    };

    log("2/3 · Mode 3(R 스케일) 및 형상 제어점(ControlPoint) 드래그 취소 원자성 검증…");
    const modeCancelChecks = await probeModeCancelChecks(page, pageErrors);

    log("3/3 · 연속 리그 전환(procedural -> valid -> empty -> cycle -> nan -> valid) 및 취소·커밋·Undo/Redo 검증…");
    const continuousRigTransitions = await probeContinuousRigTransitions(page, server.url, timeoutMs, pageErrors);

    const rawReport = {
      schema: "character-lab-pose-cancel-probe/v1",
      generatedAt: new Date().toISOString(),
      url: server.url,
      softwareRenderer: Boolean(options.software),
      environment: {
        node: process.version, platform: process.platform, softwareRenderer: Boolean(options.software),
        hardwareDisclaimerKo: options.software ? HARDWARE_DISCLAIMER_KO : null, tmpdirGuard: tmp,
      },
      unverifiedBoundaries: UNVERIFIED_BOUNDARIES,
      provenance,
      cancelScenarios,
      modeCancelChecks,
      continuousRigTransitions,
      servedSyntheticRoutes: [...new Set(servedRoutes)],
      pageErrors,
      consoleErrors: consoleErrors.slice(0, 20),
    };

    const evaluation = evaluatePoseCancelProbeReport(rawReport);
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
