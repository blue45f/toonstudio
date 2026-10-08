#!/usr/bin/env node
// brush-lab "그리기" 탭 브라우저 실검증 프로브. BRUSH_LAB_BROWSER_PROBE=1일 때만 실행한다(다른 프로브와 같은 게이트).
//
// 하는 일: Vite dev 서버(detached 프로세스 그룹)와 Chromium(detached 프로세스 그룹, SwiftShader 소프트웨어 WebGPU/WebGL2)을 띄우고
// CDP로 연결해 앱의 "그리기" 탭에서 **실제로 그린다**:
//   - 마우스(속도 기반 압력 시뮬레이션 켬) 곡선, 펜(CDP `Input.dispatchMouseEvent`의 pointerType=pen·force·tilt) 지그재그
//   - 브러시 가족별(기본 9종: 연필·목탄·잉크·수채·유화·에어브러시·수묵·마커·해칭)로 캔버스를 비우고 다시 그린 뒤 스크린샷
//   - 캔버스 잉크 픽셀 수(스크린샷 PNG를 직접 디코딩한 객관 수치), HUD(addSamples p50/p95·endStroke·readback·dab 수)
//   - 우클릭 메뉴 차단, 합성 pointercancel → abortStroke(문서 보존), PNG 저장 다운로드, 좁은 폭(모바일 세로) 레이아웃
// 소프트웨어 렌더러(SwiftShader) 결과이므로 속도는 성능 증거가 아니고 실 GPU·실기기 펜 압력은 검증하지 못한다.
//
// 사용 예:
//   BRUSH_LAB_BROWSER_PROBE=1 TMPDIR=/tmp node scripts/browser-draw-probe.mjs
//   BRUSH_LAB_BROWSER_PROBE=1 TMPDIR=/tmp node scripts/browser-draw-probe.mjs --lane wasm-cpu --presets pencil-hb,charcoal --out /tmp/shots
//   --lane <id|auto>   : auto(기본)는 앱이 능력 탐지로 정한 시작 레인 그대로. id를 주면 엔진 셀렉터로 직접 고른다
//   --presets a,b,c    : 그릴 프리셋(기본 9종)
//   --out <dir>        : 스크린샷·summary.json 위치(기본 $TMPDIR/brush-draw-shots)
//   --size <mode>      : 캔버스 크기 모드(1024x640 | 512 | 1024 | fit, 기본 1024x640)
//   --colors a,b,c,d[,e]: 색 확인 단계(BL-1b). 프리셋마다 캔버스를 비우고 처음 4색(이름 red|blue|green|purple|orange|teal 또는 #rrggbb)으로 가로 획 4개를,
//                          5번째 색이 있으면 세로 교차 획 1개를 그리고, 마지막에 빠른 획(이벤트당 40 px ≈ 5000 px/s)을 그린다.
//                          띠별 평균 색이 지정색과 가까운지(색조 거리)와 빠른 획이 그려졌는지 객관 수치로 기록한다. 스크린샷 `<레인>-<프리셋>-colors.png`
//   --skip-extras      : 우클릭·pointercancel·PNG 저장·모바일 레이아웃 점검을 건너뛴다
//   --colors-only      : 기본 그리기(마우스 곡선·펜 지그재그)를 건너뛰고 색 확인 단계만 한다
//   --verbose          : 페이지 콘솔 전체와 Chromium stderr를 stderr에 그대로 쓴다(진단용)
// 종료 코드: 0 통과(또는 게이트 꺼짐), 1 점검 실패, 2 브라우저를 실행할 수 없음(구조적 skip).
// 서버·브라우저는 detached 프로세스 그룹으로 띄우고 종료 시 그룹 전체를 kill한 뒤 process.exit한다.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);

const DEFAULT_PRESETS = [
  "pencil-hb",
  "charcoal",
  "ink-g-pen",
  "watercolor-wet",
  "oil-impasto",
  "airbrush",
  "sumi-ink-wet",
  "marker-alcohol",
  "hatch-pen",
];

function log(message) {
  process.stderr.write(`[browser-draw-probe] ${message}\n`);
}

function parseArgs(argv) {
  const opts = {
    lane: "auto",
    presets: DEFAULT_PRESETS,
    out: path.join(process.env.TMPDIR || os.tmpdir(), "brush-draw-shots"),
    size: "1024x640",
    skipExtras: false,
    verbose: false,
    serve: false,
    colors: [],
    skipDefaultDraw: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--lane") opts.lane = String(next());
    else if (a === "--presets") opts.presets = String(next()).split(",").filter(Boolean);
    else if (a === "--out") opts.out = String(next());
    else if (a === "--size") opts.size = String(next());
    else if (a === "--colors") opts.colors = String(next()).split(",").filter(Boolean);
    else if (a === "--colors-only") opts.skipDefaultDraw = true;
    else if (a === "--skip-extras") opts.skipExtras = true;
    else if (a === "--verbose") opts.verbose = true;
    else if (a === "--serve-child") opts.serve = true;
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  return opts;
}

/* ------------------------------------------------------------------ */
/* 자식 모드: Vite dev 서버(HMR·watch 끔 — 다른 작업자의 소스 변경이 페이지를 새로고침하지 않게)          */
/* ------------------------------------------------------------------ */
async function serveChild() {
  const { createServer } = await import("vite");
  const server = await createServer({
    root: labRoot,
    configFile: path.join(labRoot, "vite.config.ts"),
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, watch: null },
    // React(CJS)는 사전 번들이 필요하다. 첫 로드 도중 새 의존성 발견으로 페이지가 다시 로드되지 않게 목록을 미리 준다.
    optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "zod"] },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Vite 서버 주소를 얻지 못했다");
  process.stdout.write(`READY http://127.0.0.1:${address.port}/\n`);
  // 부모가 그룹을 kill할 때까지 산다.
  await new Promise(() => {});
}

/* ------------------------------------------------------------------ */
/* 프로세스 그룹 관리                                                    */
/* ------------------------------------------------------------------ */
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
  if (!existsSync(root)) return null;
  const found = [];
  for (const name of readdirSync(root)) {
    const m = /^chromium-(\d+)$/.exec(name);
    if (!m) continue;
    for (const sub of ["chrome-linux", "chrome-linux64"]) {
      const exe = path.join(root, name, sub, "chrome");
      if (existsSync(exe)) found.push({ revision: Number(m[1]), exe });
    }
  }
  found.sort((a, b) => b.revision - a.revision);
  return found[0]?.exe ?? null;
}

/* ------------------------------------------------------------------ */
/* 최소 PNG 디코더(비인터레이스 8비트 RGB/RGBA) — 스크린샷의 잉크 픽셀을 객관적으로 센다                   */
/* ------------------------------------------------------------------ */
function decodePng(buf) {
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
      if (data[8] !== 8 || data[12] !== 0) throw new Error("8비트 비인터레이스 PNG만 지원한다");
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`지원하지 않는 PNG 색 유형 ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const rowIn = y * (stride + 1) + 1;
    const rowOut = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const v = raw[rowIn + x];
      const a = x >= channels ? out[rowOut + x - channels] : 0;
      const b = y > 0 ? out[rowOut - stride + x] : 0;
      const c = x >= channels && y > 0 ? out[rowOut - stride + x - channels] : 0;
      let r;
      if (filter === 0) r = v;
      else if (filter === 1) r = v + a;
      else if (filter === 2) r = v + b;
      else if (filter === 3) r = v + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[rowOut + x] = r & 255;
    }
  }
  return { width, height, channels, data: out };
}

/** 흰 종이(#fff) 위에서 충분히 어두워졌거나 색이 있는 픽셀 수와 잉크 경계 상자. */
function inkStats(png) {
  let ink = 0;
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const o = (y * png.width + x) * png.channels;
      const r = png.data[o];
      const g = png.data[o + 1];
      const b = png.data[o + 2];
      // 흰 종이와 24/255 이상 다르면 잉크로 센다.
      if (Math.abs(255 - r) + Math.abs(255 - g) + Math.abs(255 - b) > 24) {
        ink += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { inkPixels: ink, total: png.width * png.height, bbox: ink > 0 ? [minX, minY, maxX, maxY] : null };
}

/* ------------------------------------------------------------------ */
/* 색 확인 도우미(BL-1b)                                               */
/* ------------------------------------------------------------------ */
const NAMED_COLORS = {
  red: "#d62828",
  blue: "#1d4ed8",
  green: "#16a34a",
  purple: "#7e22ce",
  orange: "#ea580c",
  teal: "#0d9488",
};

function resolveColor(token) {
  if (/^#[0-9a-fA-F]{6}$/u.test(token)) return { name: token, hex: token.toLowerCase() };
  const hex = NAMED_COLORS[token];
  if (!hex) throw new Error(`알 수 없는 색 이름: ${token} (red|blue|green|purple|orange|teal 또는 #rrggbb)`);
  return { name: token, hex };
}

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** RGB(0..255) → 색조(도, 0..360)와 채도 폭(max-min). */
function hueOf([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { hue: 0, chroma: 0 };
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { hue: (h * 60 + 360) % 360, chroma: d };
}

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** 스크린샷의 영역(x0..x1, y0..y1 px) 안에서 흰 종이와 충분히 다른 픽셀의 평균 RGB. 잉크가 없으면 null. */
function meanInkRgb(png, x0, x1, y0, y1) {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(png.height, Math.ceil(y1)); y += 1) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(png.width, Math.ceil(x1)); x += 1) {
      const o = (y * png.width + x) * png.channels;
      const r = png.data[o];
      const g = png.data[o + 1];
      const b = png.data[o + 2];
      // 가장자리 반투명 픽셀은 흰 종이에 가까워 색을 흐리므로 충분히 진한 픽셀만 센다.
      if (Math.abs(255 - r) + Math.abs(255 - g) + Math.abs(255 - b) > 120) {
        sr += r;
        sg += g;
        sb += b;
        n += 1;
      }
    }
  }
  return n > 0 ? { rgb: [sr / n, sg / n, sb / n].map((v) => Math.round(v)), pixels: n } : null;
}

/* ------------------------------------------------------------------ */
/* 메인                                                                */
/* ------------------------------------------------------------------ */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.serve) {
    await serveChild();
    return 0;
  }
  if (process.env.BRUSH_LAB_BROWSER_PROBE !== "1") {
    log("BRUSH_LAB_BROWSER_PROBE=1이 아니라 건너뜀(게이트 꺼짐). 실행: BRUSH_LAB_BROWSER_PROBE=1 TMPDIR=/tmp node scripts/browser-draw-probe.mjs");
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
  const failures = [];
  const fail = (message) => {
    failures.push(message);
    log(`FAIL ${message}`);
  };
  const summary = { chrome, userAgent: null, lane: opts.lane, size: opts.size, presets: [], extras: {}, failures, pageErrors: [], consoleErrors: [] };

  // 1) Vite dev 서버(detached 그룹)
  const server = spawnGroup(process.execPath, [SELF, "--serve-child"], { stdio: ["ignore", "pipe", "pipe"], cwd: labRoot });
  server.stderr.on("data", (c) => process.stderr.write(`[vite] ${c}`));
  const ready = await waitForLine(server, server.stdout, /READY (http:\/\/127\.0\.0\.1:\d+\/)/u, 90_000, "Vite 서버");
  const url = ready[1];
  log(`dev 서버: ${url}`);

  // 2) Chromium(detached 그룹, SwiftShader WebGPU)
  const userData = mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "bdp-"));
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
    "--window-size=1440,1000",
    "about:blank",
  ];
  const browserProc = spawnGroup(chrome, chromeArgs, { stdio: ["ignore", "ignore", "pipe"] });
  let wsEndpoint;
  try {
    const m = await waitForLine(browserProc, browserProc.stderr, /DevTools listening on (ws:\/\/\S+)/u, 60_000, "Chromium");
    wsEndpoint = m[1];
  } catch (error) {
    log(`Chromium을 실행할 수 없다(${String(error.message).split("\n")[0]}) — 구조적 skip`);
    return 2;
  }
  if (opts.verbose) browserProc.stderr.on("data", (c) => process.stderr.write(`[chrome] ${c}`));
  const browser = await playwright.chromium.connectOverCDP(wsEndpoint);
  const context = browser.contexts()[0] ?? (await browser.newContext({ acceptDownloads: true }));
  const page = context.pages()[0] ?? (await context.newPage());
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.on("pageerror", (error) => {
    summary.pageErrors.push(error.message);
    log(`pageerror: ${error.message}`);
  });
  page.on("console", (msg) => {
    if (opts.verbose) log(`console.${msg.type()}: ${msg.text().slice(0, 400)}`);
    if (msg.type() === "error") {
      summary.consoleErrors.push(msg.text().slice(0, 300));
      log(`console.error: ${msg.text().slice(0, 300)}`);
    }
  });
  summary.userAgent = await page.evaluate(() => navigator.userAgent);
  log(`브라우저: ${summary.userAgent}`);

  // 입력 증거: 페이지에서 받은 포인터 이벤트(종류·압력·기울기)와 contextmenu 처리 결과를 기록한다.
  await page.addInitScript(() => {
    window.__drawProbe = { pointer: [], contextmenu: [] };
    window.addEventListener(
      "pointermove",
      (e) => {
        if (e.buttons === 0) return;
        window.__drawProbe.pointer.push({ t: e.pointerType, p: Number(e.pressure.toFixed(3)), tx: e.tiltX, ty: e.tiltY });
        if (window.__drawProbe.pointer.length > 5000) window.__drawProbe.pointer.shift();
      },
      true,
    );
    window.addEventListener("contextmenu", (e) => window.__drawProbe.contextmenu.push({ prevented: e.defaultPrevented }), false);
  });

  const stageSel = '[data-testid="lab-draw-stage"]';
  const statusSel = '[data-testid="lab-draw-status"]';
  const cdp = await context.newCDPSession(page);

  const waitReady = async (label) => {
    await page.waitForFunction(
      (sel) => document.querySelector(sel)?.textContent === "준비됨",
      statusSel,
      { timeout: 240_000 },
    ).catch(async (error) => {
      const status = await page.locator(statusSel).textContent().catch(() => "?");
      const notices = await page.locator('[data-testid="lab-draw-notices"]').textContent().catch(() => "");
      throw new Error(`${label}: 세션이 준비되지 않았다(상태 '${status}'): ${notices}\n${String(error.message).split("\n")[0]}`);
    });
  };
  const strokeCount = async () => Number(await page.locator('[data-testid="lab-draw-hud-strokes"]').textContent());
  const waitStrokes = async (n, label) => {
    await page.waitForFunction(
      ([sel, want]) => Number(document.querySelector(sel)?.textContent) >= want,
      ['[data-testid="lab-draw-hud-strokes"]', n],
      { timeout: 90_000 },
    ).catch(async () => {
      const notices = await page.locator('[data-testid="lab-draw-notices"]').textContent().catch(() => "");
      const status = await page.locator(statusSel).textContent().catch(() => "?");
      throw new Error(`${label}: 획 ${n}개가 끝나지 않았다(상태 '${status}', 알림: ${String(notices).slice(0, 400)})`);
    });
  };
  const clearAndWait = async (label) => {
    await page.evaluate((sel) => document.querySelector(sel)?.setAttribute("data-old", "1"), stageSel);
    await page.locator('[data-testid="lab-draw-clear"]').click();
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return el !== null && !el.hasAttribute("data-old");
    }, stageSel, { timeout: 60_000 });
    await waitReady(label);
    // 상태 문구는 새 세션 효과가 돌기 전에 이전 "준비됨"일 수 있다. 문서 통계가 0으로 초기화된 것으로 새 세션 시작을 확인한다.
    await page.waitForFunction(
      (sel) => document.querySelector(sel)?.textContent === "0",
      '[data-testid="lab-draw-hud-strokes"]',
      { timeout: 60_000 },
    );
    await waitReady(label);
  };

  try {
    await page.goto(url, { timeout: 120_000, waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="lab-draw-view"]', { timeout: 120_000 });
    // 기본 탭 확인
    const tabs = await page.locator('[role="tab"]').allTextContents();
    const selected = await page.locator('[role="tab"][aria-selected="true"]').textContent();
    summary.extras.tabs = { tabs, selected };
    if (tabs[0] !== "그리기" || selected !== "그리기") fail(`그리기가 첫 번째·기본 탭이 아니다: ${JSON.stringify({ tabs, selected })}`);

    // 레인 선택
    await waitReady("시작 레인");
    const initialLane = await page.locator("#lab-draw-lane-select").inputValue();
    const initialOrigin = await page.locator('[data-testid="lab-draw-lane-origin"]').textContent();
    summary.extras.initialLane = { laneId: initialLane, origin: initialOrigin };
    log(`시작 레인(능력 탐지): ${initialLane} — ${initialOrigin}`);
    if (opts.lane !== "auto" && opts.lane !== initialLane) {
      await page.evaluate((sel) => document.querySelector(sel)?.setAttribute("data-old", "1"), stageSel);
      await page.locator("#lab-draw-lane-select").selectOption(opts.lane);
      await page.waitForFunction((sel) => {
        const el = document.querySelector(sel);
        return el !== null && !el.hasAttribute("data-old");
      }, stageSel, { timeout: 60_000 });
      await waitReady(`레인 ${opts.lane}`);
    }
    const laneId = await page.locator("#lab-draw-lane-select").inputValue();
    summary.lane = laneId;
    const options = await page.locator("#lab-draw-lane-select option").evaluateAll((els) =>
      els.map((o) => ({ value: o.value, disabled: o.disabled, text: o.textContent })),
    );
    summary.extras.laneOptions = options;
    log(`레인 옵션: ${options.map((o) => `${o.value}${o.disabled ? "(비활성)" : ""}`).join(", ")}`);
    const badges = await page.locator('[data-testid="lab-draw-hud"] .lab-badge').allTextContents();
    summary.extras.hudBadges = badges;
    log(`HUD 배지: ${badges.join(" | ") || "(없음)"}`);

    if (opts.size !== "1024x640") {
      await page.locator("#lab-draw-canvas-size").selectOption(opts.size);
      await waitReady(`크기 ${opts.size}`);
    }

    // 캔버스 크기 확인
    const dims = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="lab-draw-present"]');
      return { width: c.width, height: c.height };
    });
    summary.extras.canvas = dims;
    log(`문서 크기: ${dims.width}×${dims.height}`);

    const box = async () => {
      const b = await page.locator(stageSel).boundingBox();
      if (!b) throw new Error("캔버스 스테이지의 위치를 얻지 못했다");
      return b;
    };

    /**
     * 마우스 곡선(사인 곡선). 이벤트 간격 ~8 ms로 속도 기반 압력 시뮬레이션이 의미를 갖게 한다.
     * 이벤트당 `stepPx`(기본 6 px ≈ 750 px/s)씩 움직인다. 이 값이 클수록 빠른 획이다
     * (BL-1b 이전에는 프레임 사이 이동이 큰 빠른 획이 dab 배치 용량 추정 한계로 stroke-budget-exceeded가 났다. 지금은 그려지며 fastStroke 점검이 이를 기록한다).
     */
    const drawMouseCurve = async (b, row, stepPx = 6) => {
      const x0 = b.x + b.width * 0.08;
      const x1 = b.x + b.width * 0.92;
      const cy = b.y + b.height * row;
      const amp = b.height * 0.08;
      const steps = Math.max(8, Math.round((x1 - x0) / stepPx));
      await page.mouse.move(x0, cy);
      await page.mouse.down();
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        await page.mouse.move(x0 + (x1 - x0) * t, cy + Math.sin(t * Math.PI * 2) * amp);
        await sleep(8);
      }
      await page.mouse.up();
    };

    /** 펜 지그재그: CDP로 pointerType=pen, force(압력)를 0.1→1→0.1로 올렸다 내리고 기울기를 준다. */
    const drawPenZigzag = async (b, row) => {
      const x0 = b.x + b.width * 0.1;
      const x1 = b.x + b.width * 0.9;
      const cy = b.y + b.height * row;
      const amp = b.height * 0.07;
      const n = 6;
      const send = (type, x, y, force, tilt) =>
        cdp.send("Input.dispatchMouseEvent", {
          type,
          x,
          y,
          button: type === "mouseMoved" && force === null ? "none" : "left",
          buttons: type === "mouseReleased" ? 0 : 1,
          clickCount: type === "mouseMoved" ? 0 : 1,
          pointerType: "pen",
          force: force ?? 0,
          tiltX: tilt[0],
          tiltY: tilt[1],
        });
      // 삼각파는 t=0에서 +1(= cy + amp)이므로 시작점도 거기서 잡는다(시작·끝에 큰 도약을 만들지 않는다).
      await send("mousePressed", x0, cy + amp, 0.1, [20, 10]);
      // 이벤트당 이동이 약 7 px이 되도록 구간 수를 잡는다(삼각파 길이 = 가로 + 세로 왕복).
      const pathLen = (x1 - x0) + n * 2 * amp * 2;
      const segs = Math.round(pathLen / 7);
      for (let i = 1; i <= segs; i += 1) {
        const t = i / segs;
        const zig = Math.abs(((t * n) % 2) - 1) * 2 - 1; // -1..1 삼각파
        const force = 0.1 + 0.9 * Math.sin(Math.PI * t);
        await send("mouseMoved", x0 + (x1 - x0) * t, cy + zig * amp, force, [20 + 30 * Math.sin(t * 6), 10]);
        await sleep(8);
      }
      await send("mouseReleased", x1, cy + amp, 0.1, [0, 0]);
    };

    const shotCanvas = async (name) => {
      const b = await box();
      const file = path.join(opts.out, name);
      await page.screenshot({ path: file, clip: { x: b.x, y: b.y, width: b.width, height: b.height } });
      const stats = inkStats(decodePng(readFileSync(file)));
      return { file, ...stats };
    };

    const readHud = async () => ({
      strokes: await page.locator('[data-testid="lab-draw-hud-strokes"]').textContent(),
      addSamples: await page.locator('[data-testid="lab-draw-hud-add"]').textContent(),
      endStroke: await page.locator('[data-testid="lab-draw-hud-end"]').textContent(),
      readback: await page.locator('[data-testid="lab-draw-hud-readback"]').textContent(),
      dabs: await page.locator('[data-testid="lab-draw-hud-dabs"]').textContent(),
      wetNote: await page.locator('[data-testid="lab-draw-hud-wet"]').textContent().catch(() => null),
    });

    // 브러시별 그리기
    for (const presetId of opts.skipDefaultDraw ? [] : opts.presets) {
      const entry = { presetId, laneId, ok: false };
      summary.presets.push(entry);
      try {
        await page.locator('[data-testid="lab-draw-chip-all"]').click();
        await page.fill("#lab-draw-search", "");
        const brush = page.locator(`[data-testid="lab-draw-brush-${presetId}"]`);
        await brush.scrollIntoViewIfNeeded();
        await brush.click();
        await clearAndWait(presetId);
        entry.name = (await brush.locator(".lab-draw-brush-name").textContent()) ?? presetId;
        const before = await strokeCount();
        const b = await box();
        await page.evaluate(() => {
          window.__drawProbe.pointer.length = 0;
        });
        const t0 = Date.now();
        await drawMouseCurve(b, 0.3);
        await waitStrokes(before + 1, `${presetId} 마우스 곡선`);
        const mouseEvents = await page.evaluate(() => window.__drawProbe.pointer.filter((p) => p.t === "mouse"));
        await drawPenZigzag(b, 0.65);
        await waitStrokes(before + 2, `${presetId} 펜 지그재그`);
        const penEvents = await page.evaluate(() => window.__drawProbe.pointer.filter((p) => p.t === "pen"));
        entry.drawMs = Date.now() - t0;
        // 표시가 반영될 시간을 준다(GPU 표시 레인은 다음 프레임).
        await sleep(400);
        entry.hud = await readHud();
        entry.input = {
          mouseMoves: mouseEvents.length,
          mouseBrowserPressure: [...new Set(mouseEvents.map((p) => p.p))],
          penMoves: penEvents.length,
          penPressureMin: penEvents.length ? Math.min(...penEvents.map((p) => p.p)) : null,
          penPressureMax: penEvents.length ? Math.max(...penEvents.map((p) => p.p)) : null,
          penTiltRange: penEvents.length ? [Math.min(...penEvents.map((p) => p.tx)), Math.max(...penEvents.map((p) => p.tx))] : null,
        };
        const shot = await shotCanvas(`${laneId}-${presetId}.png`);
        Object.assign(entry, { shot: shot.file, inkPixels: shot.inkPixels, inkBbox: shot.bbox, total: shot.total });
        entry.notices = await page.locator('[data-testid="lab-draw-notices"]').textContent().catch(() => null);
        entry.ok = shot.inkPixels > 200 && Number(entry.hud.dabs) > 0;
        log(`${entry.ok ? "ok  " : "FAIL"} ${laneId} ${presetId}(${entry.name}): 잉크 ${shot.inkPixels}px, dab ${entry.hud.dabs}, addSamples ${entry.hud.addSamples} ms, endStroke ${entry.hud.endStroke} ms, readback ${entry.hud.readback} ms, 펜 압력 ${entry.input.penPressureMin}~${entry.input.penPressureMax}, 마우스 브라우저 압력 ${JSON.stringify(entry.input.mouseBrowserPressure)}`);
        if (!entry.ok) fail(`${presetId}: 잉크가 보이지 않거나 dab이 0이다`);
        if (entry.notices) log(`  알림: ${entry.notices.slice(0, 300)}`);
      } catch (error) {
        entry.error = String(error.message ?? error).split("\n")[0];
        fail(`${presetId}: ${entry.error}`);
      }
    }


    // 색 확인 단계(BL-1b): 서로 다른 색으로 그려 색이 실제로 적용되는지, 습식 색 번짐·빠른 획을 본다.
    if (opts.colors.length > 0) {
      const palette = opts.colors.map(resolveColor);
      if (palette.length < 2) throw new Error("--colors는 2개 이상이어야 한다");
      const rows = [0.14, 0.32, 0.5, 0.68];
      const bands = palette.slice(0, rows.length);
      const crossColor = palette[rows.length] ?? null;
      const FAST_ROW = 0.88;
      summary.colorShots = [];
      for (const presetId of opts.presets) {
        const entry = { presetId, laneId, ok: false, bands: [] };
        summary.colorShots.push(entry);
        try {
          await page.locator('[data-testid="lab-draw-chip-all"]').click();
          await page.fill("#lab-draw-search", "");
          const brush = page.locator(`[data-testid="lab-draw-brush-${presetId}"]`);
          await brush.scrollIntoViewIfNeeded();
          await brush.click();
          await clearAndWait(`${presetId} 색 확인`);
          const b = await box();
          const setColor = async (c) => {
            await page.fill("#lab-draw-hex", c.hex);
            await page.press("#lab-draw-hex", "Enter");
            await page.waitForSelector(`[aria-label="현재 색 ${c.hex}"]`, { timeout: 10_000 });
          };
          let count = await strokeCount();
          for (let i = 0; i < bands.length; i += 1) {
            await setColor(bands[i]);
            await drawMouseCurve(b, rows[i]);
            count += 1;
            await waitStrokes(count, `${presetId} ${bands[i].name} 획`);
          }
          if (crossColor) {
            await setColor(crossColor);
            const xCross = b.x + b.width * 0.52;
            await page.mouse.move(xCross, b.y + b.height * 0.06);
            await page.mouse.down();
            for (let y = b.y + b.height * 0.06; y < b.y + b.height * 0.8; y += 6) {
              await page.mouse.move(xCross + Math.sin(y / 40) * 6, y);
              await sleep(8);
            }
            await page.mouse.up();
            count += 1;
            await waitStrokes(count, `${presetId} ${crossColor.name} 교차 획`);
          }
          // 빠른 획: 이벤트당 40 px(≈ 5000 px/s). 마지막 띠 색을 쓴다.
          const fastColor = bands[bands.length - 1];
          await setColor(fastColor);
          const noticeBefore = (await page.locator('[data-testid="lab-draw-notices"]').textContent().catch(() => "")) ?? "";
          const fastBefore = count;
          await drawMouseCurve(b, FAST_ROW, 40);
          await sleep(1500);
          const fastAfter = await strokeCount();
          const noticeAfter = (await page.locator('[data-testid="lab-draw-notices"]').textContent().catch(() => "")) ?? "";
          entry.fast = { stepPx: 40, completed: fastAfter === fastBefore + 1, newNotice: noticeAfter.length > noticeBefore.length ? noticeAfter.slice(noticeBefore.length, noticeBefore.length + 240) : null };
          await sleep(400);
          const file = path.join(opts.out, `${laneId}-${presetId}-colors.png`);
          await page.screenshot({ path: file, clip: { x: b.x, y: b.y, width: b.width, height: b.height } });
          entry.shot = file;
          const png = decodePng(readFileSync(file));
          const scale = png.width / b.width;
          const amp = b.height * 0.08;
          const analyze = (row, label, expected) => {
            const yc = b.height * row;
            const m = meanInkRgb(png, b.width * 0.08 * scale, b.width * 0.42 * scale, (yc - amp - 12) * scale, (yc + amp + 12) * scale);
            if (!m) return { label, expected: expected?.hex ?? null, rgb: null, ok: false, note: "잉크 없음" };
            const got = hueOf(m.rgb);
            let ok = true;
            let nearest = null;
            if (expected) {
              const want = hueOf(hexToRgb(expected.hex));
              const ranked = palette
                .map((c) => ({ name: c.name, d: hueDistance(got.hue, hueOf(hexToRgb(c.hex)).hue) }))
                .sort((x, y) => x.d - y.d);
              nearest = ranked[0].name;
              ok = got.chroma >= 20 && nearest === expected.name && hueDistance(got.hue, want.hue) < 40;
            }
            return { label, expected: expected?.hex ?? null, rgb: m.rgb, hue: Math.round(got.hue), chroma: Math.round(got.chroma), nearestPalette: nearest, ok, pixels: m.pixels };
          };
          for (let i = 0; i < bands.length; i += 1) entry.bands.push(analyze(rows[i], bands[i].name, bands[i]));
          const fastBand = analyze(FAST_ROW, `${fastColor.name}(빠른 획)`, fastColor);
          entry.fast.band = fastBand;
          entry.ok = entry.bands.every((x) => x.ok) && entry.fast.completed;
          log(`${entry.ok ? "ok  " : "FAIL"} ${laneId} ${presetId} 색 확인: ${entry.bands.map((x) => `${x.label}→rgb(${x.rgb?.join(",") ?? "-"})${x.ok ? "" : "!"}`).join(" ")} | 빠른 획 ${entry.fast.completed ? "그려짐" : "버려짐"}${fastBand.rgb ? ` rgb(${fastBand.rgb.join(",")})` : ""}${entry.fast.newNotice ? ` 알림: ${entry.fast.newNotice.slice(0, 120)}` : ""}`);
          if (!entry.ok) fail(`${presetId}: 색 확인 실패 ${JSON.stringify({ bands: entry.bands.filter((x) => !x.ok).map((x) => x.label), fast: entry.fast.completed })}`);
        } catch (error) {
          entry.error = String(error.message ?? error).split("\n")[0];
          fail(`${presetId}(색 확인): ${entry.error}`);
        }
      }
    }

    if (!opts.skipExtras) {
      // 전체 화면(데스크톱) 스크린샷
      await page.screenshot({ path: path.join(opts.out, `${laneId}-full-desktop.png`), fullPage: true });

      // 우클릭 메뉴 차단
      const b = await box();
      await page.evaluate(() => {
        window.__drawProbe.contextmenu.length = 0;
      });
      const strokesBeforeRight = await strokeCount();
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: "right" });
      await sleep(400);
      const strokesAfterRight = await strokeCount();
      summary.extras.rightClickStrokes = { before: strokesBeforeRight, after: strokesAfterRight };
      if (strokesAfterRight !== strokesBeforeRight) fail(`우클릭이 획을 만들었다(${strokesBeforeRight}→${strokesAfterRight})`);
      const menu = await page.evaluate(() => window.__drawProbe.contextmenu);
      summary.extras.contextmenu = menu;
      const touchAction = await page.locator(stageSel).evaluate((el) => getComputedStyle(el).touchAction);
      summary.extras.touchAction = touchAction;
      // contextmenu 리스너가 bubbling 단계에서 본 defaultPrevented: 스테이지 핸들러가 이미 막았어야 한다.
      if (!(menu.length >= 1 && menu.every((m) => m.prevented))) fail(`우클릭 contextmenu가 차단되지 않았다: ${JSON.stringify(menu)}`);
      if (touchAction !== "none") fail(`touch-action이 none이 아니다: ${touchAction}`);
      log(`우클릭 차단 ${JSON.stringify(menu)}, touch-action ${touchAction}`);

      // 캔버스 밖으로 나가도 획 유지: 스테이지 안에서 눌러 밖으로 끌고 나갔다 놓는다.
      const before = await strokeCount();
      await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.9);
      await page.mouse.down();
      // 이벤트당 약 8 px씩 오른쪽 아래로 끌어 스테이지 밖(오른쪽·아래)까지 간다(엔진 배치 용량 한계를 건드리지 않는 속도).
      for (let i = 1; i <= 100; i += 1) {
        await page.mouse.move(b.x + b.width * 0.5 + i * 7, b.y + b.height * 0.9 + i * 3);
        await sleep(8);
      }
      await page.mouse.up();
      await waitStrokes(before + 1, "캔버스 밖 드래그");
      summary.extras.dragOutside = "스테이지 밖(오른쪽·아래)까지 끌고 가도 획이 하나로 끝났다";
      log(`캔버스 밖 드래그: ${summary.extras.dragOutside}`);

      // pointercancel(합성) → abortStroke, 문서 보존
      const preCancel = await shotCanvas(`${laneId}-before-cancel.png`);
      const strokesBefore = await strokeCount();
      await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.5);
      await page.mouse.down();
      for (let i = 1; i <= 10; i += 1) {
        await page.mouse.move(b.x + b.width * 0.2 + i * 30, b.y + b.height * 0.5 + i * 3);
        await sleep(8);
      }
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        el.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, clientX: 300, clientY: 300 }));
      }, stageSel);
      await page
        .waitForFunction((sel) => document.querySelector(sel)?.textContent?.includes("stroke-canceled"), '[data-testid="lab-draw-notices"]', { timeout: 30_000 })
        .catch(async () => {
          const notices = await page.locator('[data-testid="lab-draw-notices"]').textContent().catch(() => "(알림 없음)");
          const status = await page.locator(statusSel).textContent().catch(() => "?");
          throw new Error(`pointercancel 알림(stroke-canceled)이 없다: 상태 '${status}', 알림 '${String(notices).slice(0, 300)}'`);
        });
      await page.mouse.up();
      await sleep(500);
      const strokesAfter = await strokeCount();
      const postCancel = await shotCanvas(`${laneId}-after-cancel.png`);
      summary.extras.pointercancel = { strokesBefore, strokesAfter, inkBefore: preCancel.inkPixels, inkAfter: postCancel.inkPixels };
      if (strokesAfter !== strokesBefore) fail(`pointercancel 뒤 획 수가 늘었다(${strokesBefore}→${strokesAfter})`);
      if (preCancel.inkPixels !== postCancel.inkPixels) fail(`pointercancel로 문서가 바뀌었다(잉크 ${preCancel.inkPixels}→${postCancel.inkPixels})`);
      log(`pointercancel: 획 ${strokesBefore}→${strokesAfter}, 잉크 ${preCancel.inkPixels}→${postCancel.inkPixels} (같아야 한다)`);
      // 다음 획은 정상
      await drawMouseCurve(b, 0.12);
      await waitStrokes(strokesAfter + 1, "취소 뒤 새 획");

      // 빠른 획(정보용): 프레임 사이 이동이 큰 획(≈ 5000 px/s)이 그려지는지, 레인 오류로 드러나면(무음 보정 없음) 그 사유와 그 뒤 복구를 기록한다.
      {
        const fastBefore = await strokeCount();
        const noticeBefore = (await page.locator('[data-testid="lab-draw-notices"]').textContent().catch(() => "")) ?? "";
        await drawMouseCurve(b, 0.45, 40);
        await sleep(1500);
        const fastAfter = await strokeCount();
        const noticeAfter = (await page.locator('[data-testid="lab-draw-notices"]').textContent().catch(() => "")) ?? "";
        summary.extras.fastStroke = {
          stepPx: 40,
          strokesBefore: fastBefore,
          strokesAfter: fastAfter,
          completed: fastAfter === fastBefore + 1,
          newNotice: noticeAfter.length > noticeBefore.length ? noticeAfter.slice(noticeBefore.length, noticeBefore.length + 300) : null,
        };
        log(`빠른 획(이벤트당 40 px ≈ 5000 px/s): ${JSON.stringify(summary.extras.fastStroke)}`);
        // 어느 쪽이든 다음 일반 획은 정상이어야 한다.
        const base = await strokeCount();
        await drawMouseCurve(b, 0.52);
        await waitStrokes(base + (fastAfter === fastBefore + 1 ? 1 : 1), "빠른 획 뒤 일반 획");
      }

      // PNG 저장
      try {
        const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20_000 }), page.locator('[data-testid="lab-draw-save"]').click()]);
        const savePath = path.join(opts.out, `${laneId}-saved-${download.suggestedFilename()}`);
        await download.saveAs(savePath);
        const bytes = readFileSync(savePath);
        const png = decodePng(bytes);
        summary.extras.pngSave = { file: savePath, suggested: download.suggestedFilename(), bytes: bytes.length, width: png.width, height: png.height, ...inkStats(png) };
        log(`PNG 저장: ${download.suggestedFilename()} ${bytes.length} B ${png.width}×${png.height} 잉크 ${summary.extras.pngSave.inkPixels}px`);
        if (png.width !== dims.width || png.height !== dims.height) fail(`저장한 PNG 크기가 문서와 다르다(${png.width}×${png.height})`);
        if (summary.extras.pngSave.inkPixels < 200) fail("저장한 PNG에 잉크가 없다");
      } catch (error) {
        summary.extras.pngSave = { error: String(error.message ?? error).split("\n")[0] };
        log(`PNG 저장 다운로드를 관찰하지 못했다(미검증): ${summary.extras.pngSave.error}`);
      }

      // 좁은 폭(모바일 세로)
      await page.setViewportSize({ width: 390, height: 844 });
      await sleep(500);
      await page.screenshot({ path: path.join(opts.out, `${laneId}-mobile-portrait.png`), fullPage: true });
      const layout = await page.evaluate(() => {
        const stage = document.querySelector('[data-testid="lab-draw-stage"]').getBoundingClientRect();
        const side = document.getElementById("lab-draw-side")?.getBoundingClientRect() ?? null;
        return { stageBottom: stage.bottom, sideTop: side ? side.top : null, sideLeft: side ? side.left : null, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
      });
      summary.extras.mobile = layout;
      if (layout.sideTop === null || layout.sideTop < layout.stageBottom - 1) fail(`좁은 폭에서 설정 패널이 캔버스 아래로 내려오지 않았다: ${JSON.stringify(layout)}`);
      if (layout.scrollW > layout.innerW + 1) fail(`좁은 폭에서 가로 스크롤이 생겼다: ${JSON.stringify(layout)}`);
      log(`모바일 레이아웃: ${JSON.stringify(layout)}`);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  } catch (error) {
    fail(`예외: ${String(error.stack ?? error).split("\n").slice(0, 4).join(" | ")}`);
    try {
      await page.screenshot({ path: path.join(opts.out, `${summary.lane}-error.png`), fullPage: true });
    } catch {
      // 스크린샷 실패는 무시
    }
  } finally {
    writeFileSync(path.join(opts.out, `summary-${summary.lane}.json`), `${JSON.stringify(summary, null, 2)}\n`);
    try {
      await browser.close();
    } catch {
      // 연결 종료 실패는 무시
    }
    try {
      rmSync(userData, { recursive: true, force: true });
    } catch {
      // 임시 프로필 삭제 실패는 무시
    }
  }
  if (summary.pageErrors.length > 0) {
    // 페이지 오류는 실패로 센다(콘솔 오류는 리소스 404 등 잡음이 있어 보고만 한다).
    failures.push(`pageerror ${summary.pageErrors.length}건: ${summary.pageErrors[0]}`);
  }
  log(failures.length === 0 ? `통과 — 스크린샷: ${opts.out}` : `실패 ${failures.length}건 — ${failures.join(" / ")}`);
  return failures.length === 0 ? 0 : 1;
}

main()
  .then((code) => {
    killGroups();
    process.exit(code);
  })
  .catch((error) => {
    log(`프로브 오류: ${String(error?.stack ?? error)}`);
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
