#!/usr/bin/env node
// character-lab 손상 스켈레톤·비유한 입력 안전 경계 실브라우저 프로브.
// CHARACTER_LAB_BROWSER_PROBE=1일 때(또는 --negative-control일 때) 실행한다.
import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildOfficialFixturePackageCatalog,
  createCorruptedSkeletonFixtures,
  evaluateCorruptedSkeletonProbeReport,
  runBrowserDirectApiProbe,
  runNegativeControlSuite,
} from "./corrupted-skeleton-fixtures.mjs";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(labRoot, "..", "..");
const CANDIDATE_CHROMIUM_PATHS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/local/manual-bin/chromium",
];
const REQUIRED_ANCESTOR_COMMITS = ["f8a04aee", "06d95bc8", "39976d11"];
const CHROMIUM_TMPDIR_RESERVE_BYTES = 64;
const SOCKET_PATH_LIMIT_BYTES = 104;
const HARDWARE_DISCLAIMER_KO =
  "이 실행은 컨테이너 소프트웨어 렌더러(SwiftShader) 기반이며, 실제 물리 GPU(WebGPU/Metal/Vulkan/DX12)·웹캠 카메라 하드웨어·모바일/태블릿 터치 기기 및 실시간 프레임 성능을 검증한 증거가 아닙니다.";

const pendingCleanups = new Set();

function log(message) {
  console.log(`[corrupted-skeleton-probe] ${message}`);
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
  const options = { software: false, strictAppDefects: false, negativeControl: false, out: null, url: null, timeoutSec: 120 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[(i += 1)];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} 옵션에는 값이 필요합니다.`);
      return value;
    };
    if (arg === "--software") options.software = true;
    else if (arg === "--strict-app-defects") options.strictAppDefects = true;
    else if (arg === "--negative-control") options.negativeControl = true;
    else if (arg === "--out") options.out = next();
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
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // 이미 종료됨
    }
  }
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
  try {
    return readFileSync(filePath, "utf8").split("\n").slice(-lines).join("\n");
  } catch {
    return "(로그 없음)";
  }
}

async function startViteDevServer(timeoutSec) {
  const viteBin = path.join(labRoot, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) throw new Error("apps/character-lab/node_modules/vite를 찾지 못했습니다(pnpm install 필요).");
  const baseTmp = existsSync("/tmp") ? "/tmp" : os.tmpdir();
  const tempDir = mkdtempSync(path.join(baseTmp, "cl-cs-"));
  const logPath = path.join(tempDir, "vite.log");
  const logFd = openSync(logPath, "a");
  const watchdogPath = path.join(tempDir, "watch-parent.mjs");
  writeFileSync(watchdogPath, PARENT_WATCHDOG_SOURCE);
  const port = await freePort();
  const viteArgs = ["--import", pathToFileURL(watchdogPath).href, viteBin, "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(port), "--strictPort", "--clearScreen", "false"];
  const child = spawn(process.execPath, viteArgs, {
    cwd: labRoot,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, NO_COLOR: "1", BROWSER: "none", CHARACTER_LAB_PROBE_PARENT_PID: String(process.pid), CHARACTER_LAB_PROBE_TEMP_DIR: tempDir },
  });
  closeSync(logFd);
  child.unref();
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  const stop = () => {
    killGroup(child, "SIGTERM");
    setTimeout(() => killGroup(child, "SIGKILL"), 250).unref();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // 임시 폴더 정리 실패 무시
    }
  };
  const url = `http://127.0.0.1:${port}/`;
  const attempts = Math.max(40, Math.ceil((timeoutSec * 1000) / 500));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (exited) {
      stop();
      throw new Error(`Vite 개발 서버가 조기 종료됐습니다.\n${safeTail(logPath)}`);
    }
    try {
      if ((await fetch(url)).ok) return { url, stop, child, tempDir };
    } catch {
      // 서버 기동 대기 중
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stop();
  throw new Error(`Vite 개발 서버가 ${timeoutSec}초 안에 응답하지 않았습니다.\n${safeTail(logPath)}`);
}

function resolveChromiumPath() {
  const fromEnv = process.env.CHARACTER_LAB_CHROMIUM_PATH;
  if (fromEnv) return fromEnv;
  return CANDIDATE_CHROMIUM_PATHS.find((candidate) => existsSync(candidate));
}

function chromiumArgs(options) {
  const args = ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"];
  if (options.software) args.push("--no-sandbox", "--enable-features=Vulkan", "--use-angle=swiftshader", "--use-webgpu-adapter=swiftshader");
  return args;
}

async function readOwnedBrowserIdentity(browser, executablePath, args) {
  const identity = { requestedExecutablePath: executablePath ?? null, args, browserVersion: browser.version(), browserPid: null, observedCommand: null, cdpProcesses: [] };
  let session;
  try {
    session = await browser.newBrowserCDPSession();
    const result = await session.send("SystemInfo.getProcessInfo");
    identity.cdpProcesses = result.processInfo.map(({ id, type }) => ({ pid: id, type }));
    const processInfo = result.processInfo.find(({ type }) => type === "browser");
    if (processInfo && Number.isSafeInteger(processInfo.id) && processInfo.id > 0) {
      identity.browserPid = processInfo.id;
      if (process.platform !== "win32") {
        identity.observedCommand = execFileSync("ps", ["-p", String(processInfo.id), "-o", "command="], { encoding: "utf8", timeout: 2000 }).trim();
      }
    }
  } catch (error) {
    identity.observationError = String(error?.message ?? error).slice(0, 300);
  } finally {
    if (session) {
      try {
        await session.detach();
      } catch (error) {
        identity.detachError = String(error?.message ?? error).slice(0, 200);
      }
    }
  }
  return identity;
}

function lookupCatalogRoute(catalog, pathname) {
  if (!catalog) return null;
  if (typeof catalog.resolveRoute === "function") return catalog.resolveRoute(pathname);
  if (typeof catalog.matchRoute === "function") return catalog.matchRoute(pathname);
  if (catalog.routes instanceof Map && catalog.routes.has(pathname)) return catalog.routes.get(pathname);
  if (catalog.routes && typeof catalog.routes === "object" && pathname in catalog.routes) return catalog.routes[pathname];
  if (catalog.byPath instanceof Map && catalog.byPath.has(pathname)) return catalog.byPath.get(pathname);
  if (catalog.byPath && typeof catalog.byPath === "object" && pathname in catalog.byPath) return catalog.byPath[pathname];

  const normalized = pathname.replace(/^\/+/u, "/");
  if (normalized === "/assets/characters/index.json" && catalog.indexJson) {
    return { status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(catalog.indexJson) };
  }
  const match = /^\/assets\/characters\/([^/]+)\/([^/]+)$/u.exec(normalized);
  if (!match) return null;
  const [, id, fileName] = match;
  const pkg =
    catalog.packages instanceof Map
      ? catalog.packages.get(id)
      : Array.isArray(catalog.packages)
        ? catalog.packages.find((item) => item.characterId === id || item.id === id)
        : catalog.packages?.[id];
  if (!pkg) return null;
  if (fileName === "manifest.json" && (pkg.manifest || pkg.manifestJson)) {
    return { status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(pkg.manifest ?? pkg.manifestJson) };
  }
  if (fileName === "slot-mapping.json" && (pkg.slotMapping || pkg.slotMappingJson)) {
    return { status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(pkg.slotMapping ?? pkg.slotMappingJson) };
  }
  if (fileName === `${id}.glb` && (pkg.glbBytes || pkg.glbBuffer || pkg.glb)) {
    return { status: 200, contentType: "model/gltf-binary", body: Buffer.from(pkg.glbBytes ?? pkg.glbBuffer ?? pkg.glb) };
  }
  return null;
}

async function installSyntheticPackageRoutes(page, catalog) {
  const servedUrls = [];
  await page.route("**/assets/characters/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const entry = lookupCatalogRoute(catalog, requestUrl.pathname);
    if (!entry) {
      await route.continue();
      return;
    }
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

const IMPORT_FLOW_BOUNDARIES = [
  {
    flow: "recipe-json-import",
    entryModule: "src/export/recipe-file.ts -> src/contracts/recipe.ts (parseRecipeFile / parseRecipe)",
    reachesSkeletonBoundary: false,
    verdict: "BLOCKED_UPSTREAM",
    reasonKo: "JSON.parse가 NaN/Infinity 토큰을 구문 단계에서 거부하고, Recipe 스키마는 본 회전(pose)만 포함하며 SkeletonData.bones 배열을 전달하지 않는다.",
  },
  {
    flow: "kit-manifest-and-glb",
    entryModule: "src/domains/authored/kit-load-flow.ts + src/render/babylon/kit-loader.ts (parseKitManifest + diffJoints)",
    reachesSkeletonBoundary: false,
    verdict: "BLOCKED_UPSTREAM",
    reasonKo: "parseKitManifest와 loadKitRig의 diffJoints가 계약 상수 KIT_SKELETON_JOINTS 및 부모 맵과 비교해 조인트 불일치를 kit-joint-mismatch로 사전 차단한다.",
  },
  {
    flow: "authored-package-panel",
    entryModule: "src/app/shell/panels/PackagePanel.tsx -> src/render/babylon/package-loader.ts -> src/render/pose-skeleton.ts (poseSkeleton)",
    reachesSkeletonBoundary: true,
    verdict: "REACHES_POSE_SKELETON_BOUNDARY",
    reachableCorruptions: ["parent-cycle-humanoid (corrupt-cycle-rig)", "nan-restTranslation (corrupt-nan-rest-rig)", "normal-empty (normal-empty-rig)"],
    directApiOnlyCorruptions: ["non-array bones ({ bones: null }) — buildPoseFrameSkeleton은 항상 배열을 생성하므로 DIRECT_API_CALL로만 도달"],
    reasonKo: "PackagePanel을 통해 로드된 GLB+slot-mapping에서 다중 본 노드의 동일 휴머노이드 이름 매핑으로 부모 순환(hips <-> spine)이, 극단 평행이동 차감(Infinity - Infinity)으로 NaN restTranslation이 poseSkeleton()에 실제 도달한다.",
  },
];

async function runDomAndCallerAudit(page, serverUrl, timeoutMs, pageErrors) {
  const handleSelector = ".cl-viewport-handle, .cl-joint-handle";
  const controlPointSelector = ".cl-viewport-control-point, .cl-control-point";

  const statusText = async () => ((await page.locator('[role="status"]').first().textContent()) ?? "").trim();
  const waitEngineReady = async () => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const text = await statusText();
      if (/활성 엔진/u.test(text)) return text;
      await page.waitForTimeout(250);
    }
    throw new Error(`엔진 ready 대기 타임아웃: ${await statusText()}`);
  };
  const readHistoryDepth = async () => {
    const text = (await page.locator(".cl-topbar-group .cl-muted").first().textContent()) ?? "";
    const match = /깊이\s+(\d+)/u.exec(text);
    return match ? Number(match[1]) : Number.NaN;
  };
  const openPackageTab = async () => {
    await page.getByRole("tablist", { name: "인스펙터" }).getByRole("tab", { name: "제작 패키지", exact: true }).click();
    if ((await page.locator(".cl-package-item").count()) === 0) await page.getByRole("button", { name: "목록 새로고침" }).click();
    await page.locator(".cl-package-item").first().waitFor({ timeout: timeoutMs });
  };
  const loadPackageById = async (characterId) => {
    const item = page.locator(`.cl-package-item[data-character-id="${characterId}"]`);
    await item.waitFor({ timeout: timeoutMs });
    await item.locator("button").first().click();
    await item.locator(".cl-package-status").waitFor({ timeout: timeoutMs });
    await page.waitForTimeout(300);
  };
  const ensureOverlayToggle = async (buttonName, enabled) => {
    const button = page.getByRole("button", { name: buttonName, exact: true });
    if (((await button.getAttribute("aria-pressed")) === "true") !== enabled) {
      await button.click();
      await page.waitForTimeout(250);
    }
  };
  const dragVisibleHandle = async (preferredBones = ["leftLowerArm", "head", "rightLowerArm", "spine", "hips"]) => {
    let targetLocator = null;
    let chosenBone = null;
    for (const bone of preferredBones) {
      const direct = page.locator(`.cl-viewport-handle[data-bone="${bone}"], .cl-joint-handle[data-bone="${bone}"]`);
      if ((await direct.count()) > 0) {
        targetLocator = direct.first();
        chosenBone = bone;
        break;
      }
    }
    if (!targetLocator) {
      const anyHandle = page.locator(handleSelector);
      if ((await anyHandle.count()) === 0) return { dragged: false, bone: null, reason: "no-visible-handle" };
      targetLocator = anyHandle.first();
      chosenBone = await targetLocator.getAttribute("data-bone");
    }
    const box = await targetLocator.boundingBox();
    if (!box) return { dragged: false, bone: chosenBone, reason: "no-bounding-box" };
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 48, startY - 36, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    return { dragged: true, bone: chosenBone, startX, startY };
  };

  await page.getByRole("button", { name: "WebGL2", exact: true }).click();
  const engineStatus = await waitEngineReady();

  await openPackageTab();
  const toProceduralBtn = page.getByRole("button", { name: /절차 소스로 전환|절차 소스로 돌아가기/u });
  if ((await toProceduralBtn.count()) > 0) {
    await toProceduralBtn.first().click();
    await page.waitForTimeout(300);
  }
  const initialDepth = await readHistoryDepth();
  await ensureOverlayToggle("관절 핸들", true);
  await ensureOverlayToggle("형상 제어점", true);
  await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 0, handleSelector, { timeout: timeoutMs });
  const baselineHandleCount = await page.locator(handleSelector).count();
  const baselineControlPointCount = await page.locator(controlPointSelector).count();

  const baselineDrag = await dragVisibleHandle(["leftLowerArm", "head"]);
  const afterBaselineDragDepth = await readHistoryDepth();

  const errorsBeforeEmpty = pageErrors.length;
  await loadPackageById("normal-empty-rig");
  await page.waitForTimeout(250);
  const emptyHandleCount = await page.locator(handleSelector).count();
  const emptyViewportText = (await page.locator(".cl-viewport").textContent()) ?? "";
  const emptyExpectedNotice = "이 소스에는 스켈레톤이 없어 표시할 관절 핸들이 없습니다.";
  const emptyNoticeShown = emptyViewportText.includes(emptyExpectedNotice);
  const emptyPageErrors = pageErrors.slice(errorsBeforeEmpty);

  const errorsBeforeCycle = pageErrors.length;
  await loadPackageById("corrupt-cycle-rig");
  await page.waitForTimeout(300);
  const depthBeforeCycleDrag = await readHistoryDepth();
  const cycleHandleCount = await page.locator(handleSelector).count();
  const cycleControlPointCount = await page.locator(controlPointSelector).count();
  const cycleDragAttempt = await dragVisibleHandle(["leftLowerArm", "hips", "spine", "head"]);
  const depthAfterCycleDrag = await readHistoryDepth();
  const cycleViewportNotice = ((await page.locator(".cl-viewport-notice").textContent().catch(() => "")) ?? "").trim();
  const cycleBannerTexts = await page.locator(".cl-banner-item").allTextContents();
  const cycleBannerHasSkeletonCode = cycleBannerTexts.some((text) => /\[skeleton-cycle\]|\[skeleton-non-finite-rest\]/u.test(text));
  const cycleViewportPageErrors = pageErrors.slice(errorsBeforeCycle);

  const errorsBeforeNan = pageErrors.length;
  await loadPackageById("corrupt-nan-rest-rig");
  await page.waitForTimeout(300);
  const depthBeforeNanDrag = await readHistoryDepth();
  const nanHandleCount = await page.locator(handleSelector).count();
  const nanControlPointCount = await page.locator(controlPointSelector).count();
  const nanDragAttempt = await dragVisibleHandle(["spine", "chest", "head", "leftLowerArm", "hips"]);
  const depthAfterNanDrag = await readHistoryDepth();
  const nanBannerTexts = await page.locator(".cl-banner-item").allTextContents();
  const nanBannerHasSkeletonCode = nanBannerTexts.some((text) => /\[skeleton-cycle\]|\[skeleton-non-finite-rest\]/u.test(text));
  const nanViewportPageErrors = pageErrors.slice(errorsBeforeNan);

  const errorsBeforeRecovery = pageErrors.length;
  await loadPackageById("valid-humanoid-rig");
  await page.waitForFunction(
    ({ hSel, cpSel }) => document.querySelectorAll(hSel).length > 0 && document.querySelectorAll(cpSel).length === 13,
    { hSel: handleSelector, cpSel: controlPointSelector },
    { timeout: timeoutMs },
  );
  const recoveryHandlesFinite = await page.locator(handleSelector).evaluateAll(
    (els) => els.length > 0 && els.every((el) => Number.isFinite(Number(el.getAttribute("cx"))) && Number.isFinite(Number(el.getAttribute("cy")))),
  );
  const recoveryControlPointCount = await page.locator(controlPointSelector).count();
  const recoveryControlPointsFinite = await page.locator(controlPointSelector).evaluateAll(
    (els) => els.length === 13 && els.every((el) => Number.isFinite(Number(el.getAttribute("cx"))) && Number.isFinite(Number(el.getAttribute("cy")))),
  );
  const depthBeforeRecoveryDrag = await readHistoryDepth();
  const recoveryDrag = await dragVisibleHandle(["leftLowerArm", "head", "rightLowerArm"]);
  const depthAfterRecoveryDrag = await readHistoryDepth();
  await page.getByRole("group", { name: "히스토리" }).getByRole("button", { name: "실행 취소", exact: true }).click();
  await page.waitForTimeout(250);
  const depthAfterRecoveryUndo = await readHistoryDepth();
  const recoveryPageErrors = pageErrors.slice(errorsBeforeRecovery);

  await loadPackageById("corrupt-cycle-rig");
  const errorsBeforePoseCycle = pageErrors.length;
  await page.getByRole("tablist", { name: "인스펙터" }).getByRole("tab", { name: "포즈", exact: true }).click();
  await page.waitForTimeout(300);
  const poseCycleErrors = pageErrors.slice(errorsBeforePoseCycle);
  const poseCycleCrashed = poseCycleErrors.some((msg) => /순환 부모 관계|순환/u.test(msg));

  await page.goto(serverUrl, { waitUntil: "load" });
  await page.getByRole("button", { name: "WebGL2", exact: true }).click();
  await waitEngineReady();
  await openPackageTab();
  await loadPackageById("corrupt-nan-rest-rig");
  const errorsBeforePoseNan = pageErrors.length;
  await page.getByRole("tablist", { name: "인스펙터" }).getByRole("tab", { name: "포즈", exact: true }).click();
  await page.waitForTimeout(300);
  const poseNanErrors = pageErrors.slice(errorsBeforePoseNan);
  const poseNanCrashed = poseNanErrors.some((msg) => /restTranslation이 유한하지 않습니다|유한하지/u.test(msg));

  const syntheticInjection = {
    executionPath: "SYNTHETIC_INJECTION",
    entrySurface: "PackagePanel (official index.json + manifest.json + slot-mapping.json + GLB)",
    normalEmptyRig: {
      characterId: "normal-empty-rig", handleCount: emptyHandleCount, expectedNotice: emptyExpectedNotice,
      noticeShown: emptyNoticeShown, pageErrorCount: emptyPageErrors.length,
      passed: emptyHandleCount === 0 && emptyNoticeShown && emptyPageErrors.length === 0,
    },
    corruptCycleRig: {
      characterId: "corrupt-cycle-rig", handleCount: cycleHandleCount, controlPointCount: cycleControlPointCount,
      viewportPageErrorCount: cycleViewportPageErrors.length, viewportNotice: cycleViewportNotice,
      historyDepthBefore: depthBeforeCycleDrag, historyDepthAfter: depthAfterCycleDrag,
      atomicityPreserved: depthAfterCycleDrag === depthBeforeCycleDrag,
      passed: cycleViewportPageErrors.length === 0 && cycleControlPointCount === 0 && depthAfterCycleDrag === depthBeforeCycleDrag,
    },
    corruptNanRestRig: {
      characterId: "corrupt-nan-rest-rig", handleCount: nanHandleCount, controlPointCount: nanControlPointCount,
      viewportPageErrorCount: nanViewportPageErrors.length,
      historyDepthBefore: depthBeforeNanDrag, historyDepthAfter: depthAfterNanDrag,
      atomicityPreserved: depthAfterNanDrag === depthBeforeNanDrag,
      passed: nanViewportPageErrors.length === 0 && nanControlPointCount === 0 && depthAfterNanDrag === depthBeforeNanDrag,
    },
  };
  syntheticInjection.passed = syntheticInjection.normalEmptyRig.passed && syntheticInjection.corruptCycleRig.passed && syntheticInjection.corruptNanRestRig.passed;

  const realDomPointer = {
    executionPath: "REAL_DOM_POINTER",
    engineStatus,
    baselineProceduralDrag: {
      handleCount: baselineHandleCount, controlPointCount: baselineControlPointCount, draggedBone: baselineDrag.bone,
      historyDepthBefore: initialDepth, historyDepthAfter: afterBaselineDragDepth, depthIncremented: afterBaselineDragDepth === initialDepth + 1,
    },
    corruptedPointerAttempts: {
      cycleDragAttempt, cycleDepthUnchanged: depthAfterCycleDrag === depthBeforeCycleDrag,
      nanDragAttempt, nanDepthUnchanged: depthAfterNanDrag === depthBeforeNanDrag,
    },
    recoveryValidHumanoidDrag: {
      characterId: "valid-humanoid-rig", handlesFinite: recoveryHandlesFinite,
      controlPointCount: recoveryControlPointCount, controlPointsFinite: recoveryControlPointsFinite,
      draggedBone: recoveryDrag.bone, historyDepthBefore: depthBeforeRecoveryDrag,
      historyDepthAfterDrag: depthAfterRecoveryDrag, historyDepthAfterUndo: depthAfterRecoveryUndo,
      dragIncremented: depthAfterRecoveryDrag === depthBeforeRecoveryDrag + 1,
      undoRestored: depthAfterRecoveryUndo === depthBeforeRecoveryDrag, pageErrorCount: recoveryPageErrors.length,
      passed:
        recoveryHandlesFinite && recoveryControlPointCount === 13 && recoveryControlPointsFinite &&
        depthAfterRecoveryDrag === depthBeforeRecoveryDrag + 1 && depthAfterRecoveryUndo === depthBeforeRecoveryDrag && recoveryPageErrors.length === 0,
    },
  };
  realDomPointer.passed =
    realDomPointer.baselineProceduralDrag.depthIncremented &&
    realDomPointer.corruptedPointerAttempts.cycleDepthUnchanged &&
    realDomPointer.corruptedPointerAttempts.nanDepthUnchanged &&
    realDomPointer.recoveryValidHumanoidDrag.passed;

  const callerDefects = [
    {
      id: "viewport-pane-onfailure-unwired",
      classification: "REPRODUCED_DEFECT",
      status: !cycleBannerHasSkeletonCode && !nanBannerHasSkeletonCode ? "REPRODUCED_DEFECT" : "RESOLVED",
      reproduced: !cycleBannerHasSkeletonCode && !nanBannerHasSkeletonCode,
      entrySurface: "PackagePanel -> ViewportPane",
      sourceFile: "apps/character-lab/src/app/shell/panels/ViewportPane.tsx",
      lines: [437, 464, 481, 609, 610],
      unwiredCallSites: [
        "resolveDragPivotWithMode (line 437)", "computeShaperIkHandleDrag (line 464)",
        "computeJointDrag (line 481)", "computeVisibleBoneLinks (line 609)", "computeShaperControlPoints (line 610)",
      ],
      observedBannerItemsOnCycle: cycleBannerTexts,
      observedBannerItemsOnNanRest: nanBannerTexts,
      summaryKo: "ViewportPane.tsx(437, 464, 481, 609, 610행)가 스켈레톤 경계 함수 호출 시 { onFailure } 콜백을 전달하지 않아, 손상 스켈레톤이 로드되어도 .cl-banner-item에 [skeleton-cycle] 또는 [skeleton-non-finite-rest]가 표시되지 않는다.",
    },
    {
      id: "pose-panel-direct-fk-cycle-crash",
      classification: "REPRODUCED_DEFECT",
      status: poseCycleCrashed ? "REPRODUCED_DEFECT" : "RESOLVED",
      reproduced: poseCycleCrashed,
      entrySurface: "PackagePanel (corrupt-cycle-rig) -> Inspector Tab '포즈' (PosePanel)",
      sourceFile: "apps/character-lab/src/app/shell/panels/PosePanel.tsx",
      lines: [95, 99, 174, 180, 182, 194, 195],
      observedPageErrors: poseCycleErrors,
      summaryKo: "PackagePanel에서 corrupt-cycle-rig를 로드한 뒤 '포즈' 탭을 클릭하면 PosePanel.tsx(95, 99, 174, 180, 182, 194-195행)가 가드 없는 computeWorldTransforms(activeSkeleton, ...)를 직접 호출해 미처리 pageerror('스켈레톤에 순환 부모 관계가 있습니다')를 던진다.",
    },
    {
      id: "pose-panel-direct-fk-nan-rest-crash",
      classification: "REPRODUCED_DEFECT",
      status: poseNanCrashed ? "REPRODUCED_DEFECT" : "RESOLVED",
      reproduced: poseNanCrashed,
      entrySurface: "PackagePanel (corrupt-nan-rest-rig) -> Inspector Tab '포즈' (PosePanel)",
      sourceFile: "apps/character-lab/src/app/shell/panels/PosePanel.tsx",
      lines: [95, 99, 174, 180, 182, 194, 195],
      observedPageErrors: poseNanErrors,
      summaryKo: "페이지 새로고침 후 WebGL2를 선택하고 PackagePanel에서 corrupt-nan-rest-rig를 로드한 뒤 '포즈' 탭을 클릭하면 PosePanel.tsx가 가드 없는 computeWorldTransforms(activeSkeleton, ...)를 호출해 미처리 pageerror('restTranslation이 유한하지 않습니다')를 던진다.",
    },
  ];

  return {
    syntheticInjection,
    realDomPointer,
    liveAppCallerDefectAudit: {
      track: "LIVE_APP_CALLER_DEFECT_AUDIT", officialEntryOnly: true,
      defects: callerDefects, reproducedDefectCount: callerDefects.filter((d) => d.reproduced).length,
      importFlowBoundaries: IMPORT_FLOW_BOUNDARIES,
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const provenance = collectGitProvenance();

  if (options.negativeControl) {
    log("음성 대조군(--negative-control) 스위트를 실행합니다…");
    const negativeControl = await runNegativeControlSuite({
      fixtures: createCorruptedSkeletonFixtures(),
      evaluateReport: evaluateCorruptedSkeletonProbeReport,
    });
    const report = {
      schema: "character-lab-corrupted-skeleton-probe/v1",
      mode: "negative-control",
      generatedAt: new Date().toISOString(),
      provenance,
      negativeControl,
      exitCode: 1,
    };
    writeJsonReport(options.out, report);
    log(`음성 대조군 결과: 변이 케이스 ${negativeControl?.cases?.length ?? 0}개 · 모두 실패로 거부됨=${Boolean(negativeControl?.allRejected ?? negativeControl?.ok)} (종료 코드 1)`);
    return 1;
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
    try {
      await browser.close();
    } catch {
      // 브라우저 종료 실패 무시
    }
    try {
      server.stop();
    } catch {
      // 서버 종료 실패 무시
    }
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
    const browserIdentity = await readOwnedBrowserIdentity(browser, executablePath, launchArgs);
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.on("pageerror", (error) => pageErrors.push(String(error?.message ?? error).slice(0, 400)));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
    });

    const servedRoutes = await installSyntheticPackageRoutes(page, catalog);
    await page.goto(server.url, { waitUntil: "load" });

    log("Track A · Path 1 (DIRECT_API_CALL): 실제 Vite ES 모듈 직접 호출 검증…");
    const fixtures = createCorruptedSkeletonFixtures();
    const directApiCall = await page.evaluate(runBrowserDirectApiProbe);

    log("Track A · Path 2 & 3 (SYNTHETIC_INJECTION + REAL_DOM_POINTER) 및 Track B 라이브 결함 감사 실행…");
    const uiOutcomes = await runDomAndCallerAudit(page, server.url, timeoutMs, pageErrors);

    const rawReport = {
      schema: "character-lab-corrupted-skeleton-probe/v1",
      generatedAt: new Date().toISOString(),
      url: server.url,
      softwareRenderer: Boolean(options.software),
      strictAppDefects: Boolean(options.strictAppDefects),
      environment: {
        node: process.version,
        platform: process.platform,
        softwareRenderer: Boolean(options.software),
        hardwareDisclaimerKo: options.software ? HARDWARE_DISCLAIMER_KO : null,
        unverifiedHardware: options.software
          ? ["physical-gpu-webgpu-webgl2", "webcam-mediapipe-stream", "mobile-tablet-touch-device", "native-frame-time-budget"]
          : [],
        tmpdirGuard: tmp,
        browserIdentity,
      },
      provenance,
      fixtureKeys: Object.keys(fixtures ?? {}),
      tracks: {
        trackA: { directApiCall, syntheticInjection: uiOutcomes.syntheticInjection, realDomPointer: uiOutcomes.realDomPointer },
        trackB: uiOutcomes.liveAppCallerDefectAudit,
      },
      executionPaths: {
        DIRECT_API_CALL: directApiCall,
        SYNTHETIC_INJECTION: uiOutcomes.syntheticInjection,
        REAL_DOM_POINTER: uiOutcomes.realDomPointer,
      },
      directApiCall,
      syntheticInjection: uiOutcomes.syntheticInjection,
      realDomPointer: uiOutcomes.realDomPointer,
      liveAppCallerDefectAudit: uiOutcomes.liveAppCallerDefectAudit,
      callerDefects: uiOutcomes.liveAppCallerDefectAudit.defects,
      importFlowBoundaries: uiOutcomes.liveAppCallerDefectAudit.importFlowBoundaries,
      servedSyntheticRoutes: [...new Set(servedRoutes)],
      consoleErrors: consoleErrors.slice(0, 20),
    };

    const evaluation = evaluateCorruptedSkeletonProbeReport(rawReport, { strictAppDefects: options.strictAppDefects });
    const trackAPassed =
      Boolean(directApiCall?.passed ?? directApiCall?.ok ?? true) &&
      uiOutcomes.syntheticInjection.passed &&
      uiOutcomes.realDomPointer.passed;
    const hasReproducedAppDefects = uiOutcomes.liveAppCallerDefectAudit.reproducedDefectCount > 0;
    const computedExitCode =
      typeof evaluation?.exitCode === "number"
        ? evaluation.exitCode
        : !trackAPassed || (options.strictAppDefects && hasReproducedAppDefects)
          ? 1
          : 0;

    report = { ...rawReport, evaluation, exitCode: computedExitCode };
  } finally {
    await cleanup();
  }

  writeJsonReport(options.out, report);
  log(
    `완료: Track A(Direct=${Boolean(report.directApiCall?.passed ?? report.directApiCall?.ok)}, Synthetic=${report.syntheticInjection.passed}, Pointer=${report.realDomPointer.passed}) · Track B 재현 결함=${report.liveAppCallerDefectAudit.reproducedDefectCount}건 · 종료 코드=${report.exitCode}`,
  );
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
