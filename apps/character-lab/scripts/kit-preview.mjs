#!/usr/bin/env node
// 키트 프리뷰 CLI(개발 전용): Blender GLB(베이스 + 파츠)를 앱의 실제 렌더러(툰/PBR 재질·조명·IBL·외곽선)로 렌더해
// (뷰 × 셰이딩)마다 PNG, 접촉 시트(ImageMagick `montage`가 있을 때), JSON 요약(stdout + <out>/<이름>__summary.json)을 만든다.
//
// 소스 경로: 베이스에 키트 이름 메시(TS_Body·TS_Head)가 있으면 kit.json 없이 GLB에서 KitPlan을 즉석 생성해 앱 엔진의 키트 소스 경로로
// 올리고(요약 JSON `sourceKind: "kit"`), 키트 규약 밖 GLB(제작 패키지 Orion 등)나 `--legacy-merge`는 기존 병합 경로(`"package"`)로 올린다.
// 입력 GLB의 바이트 수·SHA-256은 이 CLI가 디스크에서 계산해 페이지 요청에 싣고, 엔진이 받은 바이트를 그 값으로 검증한다.
//
// 동작: 임시 정적 서버(CORS, 127.0.0.1 랜덤 포트)가 GLB를 서빙하고, 개발용 Vite 서버(detached 프로세스 그룹)가 `kit-preview.html`을
// 서빙한다. Playwright Chromium(WebGL2 SwiftShader)이 페이지의 `window.__kitPreview`를 호출해 GLB를 올리고 뷰별 PNG를 받아 간다.
// 끝나면 브라우저·Vite 프로세스 그룹을 모두 종료하고 `process.exit`로 끝난다(서버가 남아 스크립트가 끝나지 않던 문제 방지).
//
// 사용법·옵션: `node apps/character-lab/scripts/kit-preview.mjs --help`, 문서 `apps/character-lab/docs/kit-preview.md`.
// 인자 파서·출력 보조는 `src/render/kit-preview/cli-args.ts`·`cli-output.ts`·`warnings.ts`(형제 import가 없는 leaf TS)를
// Node의 타입 제거 실행으로 import한다(Node 22.18+).
//
// 종료 코드: 0 성공 · 1 인자 오류 · 2 브라우저/의존성 없음 · 3 에셋 오류(조인트 불일치 등) · 4 렌더 실패
import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, createReadStream, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewDir = path.join(labRoot, "src", "render", "kit-preview");
const DEFAULT_CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const FONT_CANDIDATES = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf", "/Library/Fonts/Arial.ttf"];
const STARTED_AT = Date.now();
/** 한 번의 `page.evaluate`가 페이지 자체 타임아웃(`--timeout-sec`)을 넘겨 멈췄다고 볼 여유(ms) */
const EVALUATE_SLACK_MS = 60_000;

let quiet = false;

function log(message) {
  if (!quiet) process.stderr.write(`[kit-preview] ${message}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstLine(error) {
  return String(error?.message ?? error).split("\n")[0];
}

/** 프로미스가 `ms` 안에 끝나지 않으면 reject한다(타이머는 정리한다). */
async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}이(가) ${Math.round(ms / 1000)}초 안에 끝나지 않았습니다.`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- TS leaf import

/** Node의 타입 제거 실행으로 leaf `.ts`들을 불러온다(실험 경고는 숨긴다). 반환: 파일 이름 → 모듈. */
async function importLeaves(fileNames) {
  const original = process.emitWarning;
  process.emitWarning = function patched(warning, ...rest) {
    const text = typeof warning === "string" ? warning : String(warning?.message ?? "");
    if (/type stripping/iu.test(text)) return undefined;
    return original.call(process, warning, ...rest);
  };
  try {
    const modules = {};
    for (const fileName of fileNames) modules[fileName] = await import(pathToFileURL(path.join(previewDir, fileName)).href);
    return modules;
  } finally {
    process.emitWarning = original;
  }
}

// ---------------------------------------------------------------- 프로세스·서버

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

/** 입력 GLB를 서빙하는 임시 정적 서버. 지정한 파일만 정확한 경로로 내보내고(디렉터리 노출 없음) 127.0.0.1에만 바인딩한다. */
async function startGlbServer(files) {
  const routes = new Map(files.map((file, index) => [`/glb/${index}/${encodeURIComponent(path.basename(file.path))}`, file]));
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Allow-Headers": "*", "Cache-Control": "no-store" };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "OPTIONS") {
      response.writeHead(204, cors);
      response.end();
      return;
    }
    const file = routes.get(url.pathname);
    if ((request.method !== "GET" && request.method !== "HEAD") || !file) {
      response.writeHead(404, { ...cors, "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }
    response.writeHead(200, { ...cors, "Content-Type": "model/gltf-binary", "Content-Length": String(file.bytes) });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    const stream = createReadStream(file.path);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  return {
    urls: files.map((file, index) => `${base}/glb/${index}/${encodeURIComponent(path.basename(file.path))}`),
    close: () => {
      server.closeAllConnections?.();
      server.close();
    },
  };
}

function killGroup(child, signal) {
  if (!child || child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // 이미 종료됨(ESRCH)
  }
}

function safeTail(filePath, lines = 12) {
  try {
    return readFileSync(filePath, "utf8").split("\n").slice(-lines).join("\n");
  } catch {
    return "(로그 없음)";
  }
}

/**
 * 개발 서버(Vite) 프로세스에 `--import`로 주입하는 부모 감시자. 이 CLI가 SIGKILL 등으로 정리 없이 죽으면 2초 안에 서버가 스스로
 * 종료하고 임시 폴더를 지운다(좀비 부모도 죽은 것으로 본다). 정상 종료·SIGINT·SIGTERM은 CLI의 `cleanup`이 그룹 kill로 처리한다.
 */
const PARENT_WATCHDOG_SOURCE = `import { readFileSync, rmSync } from "node:fs";
const parent = Number(process.env.KIT_PREVIEW_PARENT_PID);
const tempDir = process.env.KIT_PREVIEW_TEMP_DIR;
function parentAlive() {
  try {
    process.kill(parent, 0);
  } catch (error) {
    return error.code === "EPERM";
  }
  try {
    const stat = readFileSync("/proc/" + parent + "/stat", "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state !== "Z" && state !== "X";
  } catch {
    return true;
  }
}
if (Number.isInteger(parent) && parent > 1) {
  setInterval(() => {
    if (parentAlive()) return;
    try {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // 임시 폴더 정리는 최선 노력이다.
    }
    process.exit(0);
  }, 2000).unref();
}
`;

/** coreutils `timeout`이 있는지(없으면 Vite를 직접 띄운다) */
function hasTimeoutCommand() {
  try {
    execFileSync("timeout", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * 개발용 Vite 서버를 detached 프로세스 그룹으로 띄운다. 종료는 그룹 전체 kill.
 * 이 CLI가 SIGKILL 등으로 정리 없이 죽어도 서버가 고아로 남지 않도록 이중 안전장치를 둔다: ① 부모 감시자(`PARENT_WATCHDOG_SOURCE`)가
 * 2초 안에 서버를 종료시키고, ② `timeout`(coreutils)으로 감싸 최대 실행 시간(`budgetSec`) 뒤 그룹 전체가 스스로 종료되게 한다
 * (`timeout`이 없는 환경에서는 직접 띄운다).
 */
async function startViteServer(tempDir, budgetSec) {
  const viteBin = path.join(labRoot, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) throw new Error("apps/character-lab/node_modules/vite를 찾지 못했습니다(pnpm install 필요).");
  const port = await freePort();
  const logPath = path.join(tempDir, "vite.log");
  const logFd = openSync(logPath, "a");
  const watchdogPath = path.join(tempDir, "watch-parent.mjs");
  writeFileSync(watchdogPath, PARENT_WATCHDOG_SOURCE);
  const viteArgs = ["--import", pathToFileURL(watchdogPath).href, viteBin, "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(port), "--strictPort", "--clearScreen", "false"];
  const [command, commandArgs] = hasTimeoutCommand() ? ["timeout", ["--kill-after=5", String(budgetSec), process.execPath, ...viteArgs]] : [process.execPath, viteArgs];
  const child = spawn(command, commandArgs, {
    cwd: labRoot,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, NO_COLOR: "1", BROWSER: "none", KIT_PREVIEW_PARENT_PID: String(process.pid), KIT_PREVIEW_TEMP_DIR: tempDir },
  });
  closeSync(logFd);
  child.unref();
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  const url = `http://127.0.0.1:${port}/`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (exited) throw new Error(`Vite 서버가 바로 종료됐습니다.\n${safeTail(logPath)}`);
    try {
      const response = await fetch(`${url}kit-preview.html`);
      if (response.ok) return { url, child, logPath };
    } catch {
      // 서버가 아직 안 떴다.
    }
    await sleep(500);
  }
  killGroup(child, "SIGKILL");
  throw new Error(`Vite 서버가 60초 안에 응답하지 않았습니다.\n${safeTail(logPath)}`);
}

// ---------------------------------------------------------------- 환경

/**
 * Chromium은 프로필 폴더 안에 UNIX 소켓(`SingletonSocket`)을 만든다. 소켓 경로가 108바이트를 넘으면 시작 직후 SIGTRAP으로 죽는다
 * (TMPDIR가 긴 샌드박스에서 실측). 그래서 프로필까지 합친 경로가 충분히 짧은 임시 폴더를 고른다: TMPDIR → /tmp 순.
 */
const MAX_SOCKET_PATH = 100;
function makeTempDir() {
  const profileTail = path.join("p", "SingletonSocket");
  for (const base of [os.tmpdir(), "/tmp"]) {
    if (!existsSync(base)) continue;
    const dir = mkdtempSync(path.join(base, "kp-"));
    if (path.join(dir, profileTail).length <= MAX_SOCKET_PATH) return dir;
    rmSync(dir, { recursive: true, force: true });
  }
  throw new Error(`임시 폴더 경로가 너무 길어 Chromium 프로필을 만들 수 없습니다(소켓 경로 ${MAX_SOCKET_PATH}바이트 한계). TMPDIR를 짧은 경로로 지정하세요.`);
}

/** 반환: 경로 문자열 | undefined(Playwright 기본 브라우저) | null(지정했는데 없음) */
function resolveChromiumPath(requested) {
  if (requested) return existsSync(requested) ? requested : null;
  const fromEnv = process.env.CHARACTER_LAB_CHROMIUM_PATH;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;
  return existsSync(DEFAULT_CHROMIUM_PATH) ? DEFAULT_CHROMIUM_PATH : undefined;
}

function chromiumArgs(renderer) {
  if (renderer === "default") return ["--ignore-gpu-blocklist", ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])];
  // GPU 없는 컨테이너: WebGL2 SwiftShader. WebGPU 소프트웨어 어댑터는 앱 정책상 쓰지 않는다.
  return ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--no-sandbox", "--enable-features=Vulkan", "--use-angle=swiftshader"];
}

function playwrightVersion() {
  try {
    return createRequire(import.meta.url)("playwright/package.json").version;
  } catch {
    return null;
  }
}

function sha256Of(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function runMontage(args, cwd) {
  const brief = (text) => String(text ?? "").trim().split("\n").slice(0, 3).join(" | ");
  return new Promise((resolve) => {
    execFile("montage", args, { cwd, timeout: 120_000 }, (error, _stdout, stderr) => {
      if (error) resolve({ ok: false, error: error.code === "ENOENT" ? "ImageMagick `montage`를 찾지 못했습니다." : firstLine(error), stderr: brief(stderr) });
      else resolve({ ok: true, error: null, stderr: brief(stderr) });
    });
  });
}

// ---------------------------------------------------------------- 파이프라인

/**
 * 브라우저 구동 → 로드 → 렌더 → 접촉 시트. 실패는 `state.failure`에 적고 돌아온다(종료 코드는 호출자가 보고서에서 결정한다).
 * 열어 둔 자원은 `state.resources`에 두어 호출자가 항상 정리한다.
 */
async function runPipeline(state) {
  const { request, output, inputFiles, jobs, prefix, outDir, timeoutMs } = state;

  let playwright;
  try {
    playwright = await import("playwright");
  } catch (error) {
    state.failure = { stage: "environment", code: "kit-preview-no-playwright", reasonKo: `playwright를 불러올 수 없습니다(${firstLine(error)}). 저장소 루트에서 pnpm install이 필요합니다.` };
    return;
  }
  const executablePath = resolveChromiumPath(request.chromiumPath);
  if (executablePath === null) {
    state.failure = { stage: "environment", code: "kit-preview-no-chromium", reasonKo: `지정한 Chromium을 찾지 못했습니다: ${request.chromiumPath ?? process.env.CHARACTER_LAB_CHROMIUM_PATH}` };
    return;
  }
  state.environment.chromiumPath = executablePath ?? null;

  log(`GLB ${inputFiles.length}개 · 뷰 ${request.views.length} × 셰이딩 ${request.shadings.length} = ${jobs.length}장 · ${request.size}px · 품질 ${request.quality}`);
  state.resources.glbServer = await startGlbServer(inputFiles);
  let devUrl;
  if (request.devUrl) {
    devUrl = request.devUrl.endsWith("/") ? request.devUrl : `${request.devUrl}/`;
  } else {
    log("Vite 개발 서버를 띄웁니다…");
    const startedAt = Date.now();
    try {
      state.resources.vite = await startViteServer(state.tempDir, state.budgetSec);
    } catch (error) {
      state.failure = { stage: "environment", code: "kit-preview-vite", reasonKo: `Vite 개발 서버를 띄우지 못했습니다: ${firstLine(error)}` };
      return;
    }
    devUrl = state.resources.vite.url;
    log(`Vite 준비 ${((Date.now() - startedAt) / 1000).toFixed(1)}초 · ${devUrl}`);
  }

  try {
    state.resources.context = await playwright.chromium.launchPersistentContext(state.userDataDir, {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: chromiumArgs(request.renderer),
      // Chromium은 TMPDIR 안에도 UNIX 소켓을 만든다. 긴 TMPDIR를 상속하면 시작 직후 죽으므로 짧은 임시 폴더를 넘긴다.
      env: { ...process.env, TMPDIR: state.tempDir },
      viewport: { width: 1024, height: 1024 },
      deviceScaleFactor: 1,
    });
  } catch (error) {
    state.failure = { stage: "environment", code: "kit-preview-chromium-launch", reasonKo: `Chromium을 실행하지 못했습니다(${firstLine(error)}). --chromium <경로> 또는 CHARACTER_LAB_CHROMIUM_PATH를 지정하세요.` };
    return;
  }
  const context = state.resources.context;
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(timeoutMs);
  page.on("console", (message) => state.browserEvents.push({ kind: "console", level: message.type(), text: message.text() }));
  page.on("pageerror", (error) => state.browserEvents.push({ kind: "pageerror", text: String(error?.message ?? error) }));
  page.on("requestfailed", (req) => state.browserEvents.push({ kind: "requestfailed", url: req.url(), reason: req.failure()?.errorText ?? "" }));
  page.on("response", (response) => state.browserEvents.push({ kind: "http", status: response.status(), url: response.url() }));
  await page.exposeFunction("__kitPreviewLog", (message) => log(`  페이지: ${message}`));

  await page.goto(`${devUrl}kit-preview.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__kitPreview !== undefined, null, { timeout: timeoutMs });
  const userAgent = await page.evaluate(() => navigator.userAgent);
  state.environment.chromium = /Chrome\/([\d.]+)/u.exec(userAgent)?.[1] ?? null;

  // 로드
  log("GLB를 올립니다…");
  const loadStarted = Date.now();
  let loadResult;
  try {
    loadResult = await withTimeout(
      page.evaluate((loadRequest) => window.__kitPreview.load(loadRequest), {
        // sha256·bytes는 위에서 디스크 원본으로 계산한 값이다(엔진이 받은 바이트를 이 값으로 검증한다).
        files: inputFiles.map((file, index) => ({ url: state.resources.glbServer.urls[index], label: path.basename(file.path), sha256: file.sha256, bytes: file.bytes })),
        colors: request.colors,
        roleOverrides: request.roleOverrides,
        hairLod: request.hairLod,
        morphs: request.morphs,
        pose: request.pose,
        quality: request.quality,
        toon: request.toon,
        legacyMerge: request.legacyMerge,
        inspectOnly: request.inspectOnly,
        timeoutMs,
      }),
      timeoutMs + EVALUATE_SLACK_MS,
      "GLB 로드",
    );
  } catch (error) {
    state.failure = { stage: "load", code: "kit-preview-load-hang", reasonKo: firstLine(error) };
    return;
  }
  state.loadMs = Date.now() - loadStarted;
  state.warnings.push(...loadResult.warnings);
  state.staticReport = loadResult.report;
  state.source = loadResult.source;
  if (loadResult.source) log(`소스 경로: ${loadResult.source.kind} — ${loadResult.source.reasonKo}`);
  if (!loadResult.ok) {
    state.failure = { stage: loadResult.stage, code: loadResult.failure.code, reasonKo: loadResult.failure.reasonKo };
    log(`로드 실패(${loadResult.stage}): [${loadResult.failure.code}] ${loadResult.failure.reasonKo}`);
    return;
  }
  state.runtime = loadResult.runtime;
  log(`로드 완료 ${(state.loadMs / 1000).toFixed(1)}초 · 메시 ${loadResult.report.totals.meshes} · 삼각형 ${loadResult.report.totals.triangles} · 경고 ${loadResult.warnings.length}건`);

  // 렌더
  const todo = request.inspectOnly ? [] : jobs;
  for (const [position, job] of todo.entries()) {
    const label = `[${position + 1}/${todo.length}] ${job.shading}/${job.view}`;
    const started = Date.now();
    let result;
    try {
      result = await withTimeout(
        page.evaluate((renderRequest) => window.__kitPreview.render(renderRequest), {
          view: job.view,
          shading: job.shading,
          size: request.size,
          transparent: request.transparent,
          background: request.background,
          quality: request.quality,
          timeoutMs,
        }),
        timeoutMs + EVALUATE_SLACK_MS,
        `렌더 ${job.shading}/${job.view}`,
      );
    } catch (error) {
      // 페이지가 멈췄거나 닫혔다(개발 서버가 의존성을 다시 최적화하며 새로고침한 경우 포함) — 더 진행할 수 없다.
      const reasonKo = firstLine(error);
      state.renders.push({ view: job.view, shading: job.shading, status: "failed", file: null, width: null, height: null, coverage: null, readyMs: null, renderMs: null, wallMs: Date.now() - started, notes: [], code: "kit-preview-render-hang", reasonKo, hud: null });
      state.failure = { stage: "render", code: "kit-preview-render-hang", reasonKo };
      log(`${label} 실패: ${reasonKo}`);
      return;
    }
    const wallMs = Date.now() - started;
    state.warnings.push(...result.warnings);
    if (result.ok) {
      writeFileSync(path.join(outDir, job.fileName), Buffer.from(result.png, "base64"));
      state.renders.push({ view: job.view, shading: job.shading, status: "ok", file: job.fileName, width: result.width, height: result.height, coverage: Math.round(result.coverage * 10000) / 10000, readyMs: Math.round(result.readyMs), renderMs: Math.round(result.renderMs), wallMs, notes: result.notes, code: null, reasonKo: null, hud: result.hud });
      log(`${label} ${(wallMs / 1000).toFixed(1)}초 · 커버리지 ${(result.coverage * 100).toFixed(1)}% → ${job.fileName}`);
    } else {
      const skipped = result.failure.code === "kit-preview-view-unavailable";
      state.renders.push({ view: job.view, shading: job.shading, status: skipped ? "skipped" : "failed", file: null, width: null, height: null, coverage: null, readyMs: null, renderMs: null, wallMs, notes: [], code: result.failure.code, reasonKo: result.failure.reasonKo, hud: null });
      if (skipped) state.warnings.push({ code: "view-skipped", severity: "warn", source: `${job.shading}/${job.view}`, messageKo: result.failure.reasonKo });
      log(`${label} ${skipped ? "건너뜀" : "실패"}: [${result.failure.code}] ${result.failure.reasonKo}`);
    }
  }
  await page.evaluate(() => window.__kitPreview.dispose()).catch(() => undefined);

  // 접촉 시트
  const okRenders = state.renders.filter((record) => record.status === "ok" && record.file);
  if (request.sheetTile > 0 && okRenders.length >= 2) {
    const sheetName = output.contactSheetFileName(prefix);
    const montageArgs = output.buildMontageArgs(
      okRenders.map((record) => ({ file: record.file, label: `${record.view} · ${record.shading}` })),
      { tile: request.sheetTile, columns: 0, background: request.transparent ? "#16161a" : request.background, outFile: sheetName, fontPath: FONT_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null },
    );
    const montage = await runMontage(montageArgs, outDir);
    if (montage.ok) {
      state.contactSheets.push(sheetName);
      log(`접촉 시트 → ${sheetName}${montage.stderr ? ` (montage: ${montage.stderr})` : ""}`);
    } else {
      state.warnings.push({ code: "contact-sheet-failed", severity: "warn", source: "montage", messageKo: `접촉 시트를 만들지 못했습니다: ${montage.error}${montage.stderr ? ` (${montage.stderr})` : ""}` });
      log(`접촉 시트 실패: ${montage.error}`);
    }
  }
}

/**
 * 열어 둔 브라우저·Vite 프로세스 그룹·임시 서버·임시 폴더를 모두 정리한다. 진행 중인 정리가 있으면 같은 프로미스를 돌려줘
 * (신호 핸들러와 정상 종료 경로가 겹쳐도) 어느 쪽이든 정리가 **끝난 뒤에** 프로세스가 종료되게 한다.
 */
function cleanup(state) {
  state.cleanupPromise ??= performCleanup(state);
  return state.cleanupPromise;
}

async function performCleanup(state) {
  const { context, vite, glbServer } = state.resources;
  const closeBrowser = async () => {
    if (!context) return;
    try {
      await withTimeout(context.close(), 8000, "브라우저 종료");
    } catch {
      // 아래 프로세스 정리로 마무리한다.
    }
    try {
      // 이 실행의 고유 프로필 경로로만 찾으므로 다른 브라우저는 건드리지 않는다.
      execFileSync("pkill", ["-KILL", "-f", `--user-data-dir=${state.userDataDir.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`], { stdio: "ignore" });
    } catch {
      // 남은 프로세스가 없으면 pkill이 1을 돌려준다.
    }
  };
  const stopVite = async () => {
    if (!vite) return;
    killGroup(vite.child, "SIGTERM");
    await sleep(300);
    killGroup(vite.child, "SIGKILL");
  };
  await Promise.all([closeBrowser(), stopVite()]);
  glbServer?.close();
  try {
    rmSync(state.tempDir, { recursive: true, force: true });
  } catch {
    // 임시 폴더 정리 실패는 결과에 영향이 없다.
  }
}

// ---------------------------------------------------------------- 메인

async function main() {
  let leaves;
  try {
    leaves = await importLeaves(["cli-args.ts", "cli-output.ts", "warnings.ts"]);
  } catch (error) {
    process.stderr.write(`[kit-preview] TypeScript 모듈을 불러오지 못했습니다(Node ${process.versions.node}): ${firstLine(error)}\n  Node 22.18 이상(저장소 권장 24.16+)이 필요합니다.\n`);
    return 2;
  }
  const args = leaves["cli-args.ts"];
  const output = leaves["cli-output.ts"];
  const { sortWarnings } = leaves["warnings.ts"];
  const EXIT = output.KIT_PREVIEW_EXIT;
  const failJson = (exitCode, stage, code, reasonKo) => `${JSON.stringify({ schema: output.KIT_PREVIEW_CLI_REPORT_SCHEMA, ok: false, exitCode, failure: { stage, code, reasonKo } }, null, 2)}\n`;

  const parsed = args.parseKitPreviewArgs(process.argv.slice(2), {
    readText: (filePath) => (existsSync(filePath) && statSync(filePath).isFile() ? readFileSync(filePath, "utf8") : null),
  });
  if (parsed.ok && parsed.help) {
    process.stdout.write(`${args.kitPreviewHelpText()}\n`);
    return EXIT.ok;
  }
  if (!parsed.ok) {
    process.stderr.write(`[kit-preview] 인자 오류:\n${parsed.errors.map((message) => `  - ${message}`).join("\n")}\n  사용법: node apps/character-lab/scripts/kit-preview.mjs --help\n`);
    process.stdout.write(failJson(EXIT.usage, "arguments", "kit-preview-arguments", parsed.errors.join(" / ")));
    return EXIT.usage;
  }
  const request = parsed.request;
  quiet = request.quiet;

  // 입력 파일
  const problems = [];
  const inputFiles = [];
  for (const glbPath of request.glbPaths) {
    const absolute = path.resolve(glbPath);
    const info = existsSync(absolute) ? statSync(absolute) : null;
    if (!info || !info.isFile()) problems.push(`GLB 파일이 없습니다: ${glbPath}`);
    else if (info.size === 0) problems.push(`GLB 파일이 비어 있습니다: ${glbPath}`);
    else inputFiles.push({ path: absolute, bytes: info.size, sha256: sha256Of(absolute) });
  }
  if (problems.length > 0) {
    process.stderr.write(`[kit-preview] 입력 오류:\n${problems.map((message) => `  - ${message}`).join("\n")}\n`);
    process.stdout.write(failJson(EXIT.usage, "arguments", "kit-preview-input", problems.join(" / ")));
    return EXIT.usage;
  }

  const outDir = path.resolve(request.outDir);
  mkdirSync(outDir, { recursive: true });
  const prefix = request.name ? output.sanitizeFileToken(request.name) : output.defaultOutputPrefix(request.glbPaths[0] ?? "kit");
  const jobs = output.planRenderJobs(prefix, request.views, request.shadings);
  let tempDir;
  try {
    tempDir = makeTempDir();
  } catch (error) {
    process.stderr.write(`[kit-preview] ${firstLine(error)}\n`);
    process.stdout.write(failJson(EXIT.environment, "environment", "kit-preview-tempdir", firstLine(error)));
    return EXIT.environment;
  }
  const state = {
    request,
    output,
    inputFiles,
    outDir,
    prefix,
    jobs,
    timeoutMs: request.timeoutSec * 1000,
    // 개발 서버 자멸 시한: 호출마다 상한(timeoutSec + 여유)을 넘길 수 없으므로 최악의 전체 시간을 넘으면 서버가 스스로 종료한다(최대 2시간).
    budgetSec: Math.min(7200, (jobs.length + 1) * (request.timeoutSec + EVALUATE_SLACK_MS / 1000) + 120),
    tempDir,
    userDataDir: path.join(tempDir, "p"),
    resources: { glbServer: null, vite: null, context: null },
    cleanupPromise: null,
    warnings: [],
    browserEvents: [],
    renders: [],
    contactSheets: [],
    staticReport: null,
    source: null,
    runtime: null,
    failure: null,
    loadMs: 0,
    environment: {
      node: process.version,
      playwright: playwrightVersion(),
      chromium: null,
      chromiumPath: null,
      renderer: request.renderer,
      devServer: request.devUrl ? `external ${request.devUrl}` : "spawned",
    },
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      void cleanup(state).finally(() => process.exit(130));
    });
  }

  try {
    await runPipeline(state);
  } catch (error) {
    const reasonKo = String(error?.stack ?? error).split("\n").slice(0, 3).join(" | ");
    state.failure ??= { stage: "render", code: "kit-preview-unexpected", reasonKo };
    log(`예기치 못한 오류: ${reasonKo}`);
  } finally {
    await cleanup(state);
  }

  for (const event of state.browserEvents) {
    const warning = output.classifyBrowserEvent(event);
    if (warning) state.warnings.push(warning);
  }
  const report = output.buildFinalReport({
    generatedAt: new Date().toISOString(),
    request,
    inputFiles,
    environment: state.environment,
    outDir,
    staticReport: state.staticReport,
    source: state.source,
    runtime: state.runtime,
    renders: state.renders,
    contactSheets: state.contactSheets,
    warnings: sortWarnings(state.warnings),
    failure: state.failure,
    loadMs: state.loadMs,
    totalMs: Date.now() - STARTED_AT,
  });
  writeFileSync(path.join(outDir, `${prefix}__summary.json`), `${JSON.stringify(report, null, 2)}\n`);
  await new Promise((resolve) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`, resolve);
  });
  return report.exitCode;
}

process.stdout.on("error", () => undefined);
main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`[kit-preview] 치명적 오류: ${String(error?.stack ?? error)}\n`);
    process.exit(1);
  },
);
