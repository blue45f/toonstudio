#!/usr/bin/env node
/**
 * Godot 3D PoC 측정 하네스(Playwright + 헤드리스 Chromium, 저장소의 playwright 사용).
 *
 * 측정 조건(결과 JSON 의 environment 에 그대로 기록한다):
 *  - GPU 없음: Chromium --use-angle=swiftshader (소프트웨어 WebGL2). 절대 FPS·프레임 시간은 대표성이 없고
 *    같은 조건에서 두 엔진을 비교한 상대값과 크기·메모리·시작 시간만 의미가 있다.
 *  - 반복 횟수(--repeat, 기본 5)마다 새 브라우저를 띄워 캐시·V8 코드 캐시·GPU 프로세스를 초기화한다(워밍 시작 측정 제외).
 *  - 같은 머신에서 다른 작업이 돌고 있을 수 있어 loadavg 를 매 스위트 앞뒤로 기록한다. 중앙값과 MAD 로 요약한다.
 *
 * 사용(저장소 루트에서):
 *   node tools/godot-3d-poc/measure/make-fixtures.mjs
 *   node tools/godot-3d-poc/measure/run.mjs --label 4.4.1 --out docs/evidence/godot-3d-poc/2026-10-15
 * 선택: --only sizes,cold,warm,revisit,coi,glb,ext,bridge,capture,twopoint,bench,compare,memory  --repeat 5
 *       --build <빌드 루트>  --fixtures <폴더>  --room <studio-room.glb>  --avatar <avatar.glb>  --chromium <실행 파일>
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

import { chromium } from "playwright";

import { loadAverage, processTreeRss } from "./lib/proc.mjs";
import { startServers } from "./lib/server.mjs";
import { round, summarize } from "./lib/stats.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pocRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pocRoot, "../..");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const args = {
  label: argValue("--label", "4.4.1"),
  build: path.resolve(argValue("--build", path.join(pocRoot, "build"))),
  fixtures: path.resolve(argValue("--fixtures", path.join(pocRoot, ".cache", "fixtures"))),
  room: path.resolve(argValue("--room", path.join(repoRoot, "apps/web/public/godot-space/spaces/studio-room.glb"))),
  avatar: path.resolve(argValue("--avatar", path.join(repoRoot, "apps/character-lab/public/assets/characters/avatar-orion-authored/avatar-orion-authored.glb"))),
  out: path.resolve(argValue("--out", path.join(repoRoot, "docs/evidence/godot-3d-poc", new Date().toISOString().slice(0, 10)))),
  repeat: Number(argValue("--repeat", "5")),
  only: argValue("--only", "sizes,cold,warm,revisit,coi,glb,ext,bridge,capture,twopoint,bench,compare,memory").split(","),
  chromium: argValue("--chromium", process.env.PW_CHROMIUM_PATH ?? ""),
  prodPublic: path.resolve(argValue("--prod-public", path.join(repoRoot, "apps/web/public"))),
  engineTag: argValue("--engine-tag", ""),
};
mkdirSync(args.out, { recursive: true });

const VIEWPORT = { width: 960, height: 540 };
const CHROMIUM_ARGS = [
  "--use-angle=swiftshader",
  "--use-gl=angle",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--enable-precise-memory-info",
  // 컨테이너 root 실행용. 일반 개발 머신에서는 필요 없다.
  "--no-sandbox",
  "--disable-dev-shm-usage",
];

const hostScript = readFileSync(path.join(here, "host/ts3d-host.js"), "utf8").replace("export function createTs3dHost", "function createTs3dHost");
const STANDALONE_INIT = `${hostScript}\nwindow.__host = createTs3dHost(window);`;

const log = (...parts) => console.error("[measure]", ...parts);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launch() {
  return chromium.launch({ headless: true, args: CHROMIUM_ARGS, ...(args.chromium ? { executablePath: args.chromium } : {}) });
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

// ── 서버·번들 준비 ──────────────────────────────────────────────────────────

async function buildThreeBundle(cacheDir) {
  const { build } = await import("vite");
  const baseline = path.join(here, "three-baseline");
  for (const [entry, outName] of [
    ["main.mjs", "full"],
    ["size-min.mjs", "min"],
  ]) {
    await build({
      configFile: false,
      root: baseline,
      logLevel: "error",
      build: {
        outDir: path.join(cacheDir, outName),
        emptyOutDir: true,
        target: "es2022",
        minify: "esbuild",
        lib: { entry: path.join(baseline, entry), formats: ["es"], fileName: () => "bundle.js" },
      },
    });
  }
  writeFileSync(path.join(cacheDir, "full", "index.html"), readFileSync(path.join(baseline, "index.html")));
  return cacheDir;
}

function fixtureMap() {
  const map = {};
  if (existsSync(args.avatar)) map["orion.glb"] = args.avatar;
  if (existsSync(args.room)) map["studio-room.glb"] = args.room;
  return map;
}

function listFixtures() {
  const names = existsSync(args.fixtures) ? ["synthetic-character.glb", "ext-meshopt.glb", "ext-quantized.glb", "ext-draco.glb", "ext-basisu.glb", "ext-basisu-uastc-raw.glb", "ext-basisu-etc1s.glb", "declared-khr_draco_mesh_compression.glb", "declared-khr_texture_basisu.glb", "declared-ext_meshopt_compression.glb", "declared-khr_mesh_quantization.glb"] : [];
  return names.filter((name) => existsSync(path.join(args.fixtures, name)));
}

// ── Godot 페이지 도우미 ─────────────────────────────────────────────────────

async function openGodot(url, { timeoutMs = 120000, standalone = true, collectConsole = true } = {}) {
  const browser = await launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const logs = [];
  if (collectConsole) {
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error" || message.type() === "warning") logs.push({ type: message.type(), text: text.slice(0, 400) });
    });
    page.on("pageerror", (error) => logs.push({ type: "pageerror", text: String(error).slice(0, 400) }));
  }
  if (standalone) await page.addInitScript(STANDALONE_INIT);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "commit" });
  const godotWindow = standalone ? "window" : "document.getElementById('stage').contentWindow";
  let outcome;
  try {
    await page.waitForFunction(
      (expr) => {
        const w = eval(expr);
        return Boolean(w.__ts3dBootError) || (window.__host?.events ?? []).some((event) => event.type === "first-frame");
      },
      godotWindow,
      { timeout: timeoutMs, polling: 20 },
    );
    const failed = await page.evaluate((expr) => Boolean(eval(expr).__ts3dBootError), godotWindow);
    outcome = failed ? "boot-error" : "ok";
  } catch {
    outcome = "timeout";
  }
  const wallToOutcomeMs = Date.now() - t0;
  const api = {
    browser,
    context,
    page,
    logs,
    outcome,
    wallToOutcomeMs,
    godotWindow,
    async send(command, timeoutMsInner = 300000) {
      return page.evaluate(
        async ({ cmd, timeout }) => {
          const result = await window.__host.send(cmd, timeout);
          return { event: result.event, rtt: result.roundTripMs };
        },
        { cmd: command, timeout: timeoutMsInner },
      );
    },
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
  return api;
}

/** 부팅 메트릭(시각은 페이지 탐색 시작 기준 ms). */
async function bootMetrics(godot, { measureUa = false } = {}) {
  const { page, godotWindow } = godot;
  const raw = await page.evaluate(
    async ({ expr, measureUa: wantUa }) => {
      const w = eval(expr);
      const events = window.__host?.events ?? [];
      const ready = events.find((event) => event.type === "ready");
      const first = events.find((event) => event.type === "first-frame");
      const resources = w.performance
        .getEntriesByType("resource")
        .filter((entry) => /index\.(wasm|pck|js)(\?|$)/u.test(entry.name))
        .map((entry) => ({ file: entry.name.split("/").pop().split("?")[0], start: entry.startTime, end: entry.responseEnd, transfer: entry.transferSize, encoded: entry.encodedBodySize, decoded: entry.decodedBodySize }));
      const wasm = w.__ts3dWasm;
      const memory = wasm?.instances?.[0]?.exports?.memory ?? wasm?.memories?.[0] ?? null;
      let uaMemory = null;
      if (wantUa && w.crossOriginIsolated && typeof w.performance.measureUserAgentSpecificMemory === "function") {
        try {
          const result = await Promise.race([w.performance.measureUserAgentSpecificMemory(), new Promise((resolve) => setTimeout(() => resolve(null), 20000))]);
          uaMemory = result ? { bytes: result.bytes } : null;
        } catch (error) {
          uaMemory = { error: String(error).slice(0, 120) };
        }
      }
      return {
        marks: w.__ts3dMarks?.t ?? null,
        spans: wasm?.spans ?? [],
        resources,
        ready: ready ? { hostReceivedAt: ready.hostReceivedAt, engine: ready.engine } : null,
        firstFrame: first ? { hostReceivedAt: first.hostReceivedAt, sinceBootMs: first.sinceBootMs } : null,
        wasmMemoryBytes: memory ? memory.buffer.byteLength : null,
        jsHeapUsedBytes: w.performance.memory?.usedJSHeapSize ?? null,
        crossOriginIsolated: w.crossOriginIsolated,
        sharedArrayBuffer: typeof w.SharedArrayBuffer,
        threadsEnabled: w.__ts3dThreadsEnabled ?? null,
        missingFeatures: w.__ts3dMissingFeatures ?? null,
        bootError: w.__ts3dBootError ?? null,
        uaMemory,
      };
    },
    { expr: godotWindow, measureUa },
  );
  const span = raw.spans.find((entry) => entry.name === "instantiateStreaming" || entry.name === "instantiate");
  const rss = processTreeRss(process.pid);
  const wasmRes = raw.resources.find((entry) => entry.file === "index.wasm");
  const mib = (bytes) => (typeof bytes === "number" ? round(bytes / (1024 * 1024), 2) : null);
  return {
    engineJsReadyMs: raw.marks?.["engine-js-ready"] ?? null,
    startGameMs: raw.marks?.["start-game"] ?? null,
    wasmFetchEndMs: wasmRes?.end ?? null,
    wasmInstantiateMs: span?.end != null && span?.start != null ? span.end - span.start : null,
    wasmInstantiateEndMs: span?.end ?? null,
    readyMs: raw.ready?.hostReceivedAt ?? null,
    firstFrameMs: raw.firstFrame?.hostReceivedAt ?? null,
    wasmMemoryMiB: mib(raw.wasmMemoryBytes),
    jsHeapUsedMiB: mib(raw.jsHeapUsedBytes),
    rssTotalMiB: rss.totalMiB,
    rssByTypeMiB: rss.byTypeMiB,
    uaMemoryMiB: mib(raw.uaMemory?.bytes),
    crossOriginIsolated: raw.crossOriginIsolated,
    threadsEnabled: raw.threadsEnabled,
    missingFeatures: raw.missingFeatures,
    bootError: raw.bootError,
    resources: raw.resources,
    engine: raw.ready?.engine ? { version: raw.ready.engine.version, hash: raw.ready.engine.hash, threads: raw.ready.engine.threads, renderer: raw.ready.engine.currentRenderingMethod } : null,
  };
}

function summarizeBoot(runs) {
  const pick = (selector) => summarize(runs.map(selector));
  return {
    n: runs.length,
    outcomes: Object.fromEntries([...new Set(runs.map((run) => run.outcome))].map((outcome) => [outcome, runs.filter((run) => run.outcome === outcome).length])),
    engineJsReadyMs: pick((run) => run.metrics.engineJsReadyMs),
    wasmInstantiateMs: pick((run) => run.metrics.wasmInstantiateMs),
    readyMs: pick((run) => run.metrics.readyMs),
    firstFrameMs: pick((run) => run.metrics.firstFrameMs),
    wallToOutcomeMs: pick((run) => run.wallMs),
    wasmMemoryMiB: pick((run) => run.metrics.wasmMemoryMiB),
    jsHeapUsedMiB: pick((run) => run.metrics.jsHeapUsedMiB),
    rssTotalMiB: pick((run) => run.metrics.rssTotalMiB),
    uaMemoryMiB: pick((run) => run.metrics.uaMemoryMiB),
  };
}

async function coldRun(url, options = {}) {
  const godot = await openGodot(url, options);
  const metrics = await bootMetrics(godot, { measureUa: options.measureUa });
  const record = { outcome: godot.outcome, wallMs: godot.wallToOutcomeMs, metrics, errors: godot.logs.slice(0, 4) };
  await godot.close();
  return record;
}

// ── 스위트 ──────────────────────────────────────────────────────────────────

const context = { servers: null, threeDir: null, environment: null };
const results = { label: args.label, schema: 1, startedAt: new Date().toISOString(), environment: null, suites: {} };

async function gatherEnvironment() {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setContent("<canvas id=c></canvas>");
  const gl = await page.evaluate(() => {
    const canvas = document.getElementById("c");
    const g = canvas.getContext("webgl2");
    const dbg = g?.getExtension("WEBGL_debug_renderer_info");
    return { webgl2: Boolean(g), renderer: dbg ? g.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null, maxTextureSize: g?.getParameter(g.MAX_TEXTURE_SIZE) ?? null, userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, webgpu: typeof navigator.gpu };
  });
  const version = browser.version();
  await browser.close();
  const buildFiles = {};
  for (const dir of ["web", "web-threads"]) {
    for (const file of ["index.wasm", "index.js", "index.pck"]) {
      const full = path.join(args.build, dir, file);
      if (existsSync(full)) buildFiles[`${dir}/${file}`] = { bytes: statSync(full).size, sha256: sha256(full) };
    }
  }
  return {
    date: new Date().toISOString(),
    node: process.version,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? null,
    totalMemMiB: Math.round(os.totalmem() / 1048576),
    chromium: version,
    webgl: gl,
    software: "소프트웨어 렌더링(SwiftShader). 실제 GPU 아님",
    viewport: VIEWPORT,
    repeat: args.repeat,
    godotLabel: args.label,
    buildFiles,
    loadAverageAtStart: loadAverage(),
  };
}

function sizeTriple(file) {
  const buffer = readFileSync(file);
  return {
    raw: buffer.length,
    gzip9: gzipSync(buffer, { level: 9 }).length,
    // 저장소 배포 파이프라인(scripts/prepare-cloudflare-static-assets.mts)과 같은 brotli 품질 9, gzip 레벨 9.
    brotli9: brotliCompressSync(buffer, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: buffer.length } }).length,
  };
}

async function suiteSizes() {
  const out = { note: "gzip 레벨 9, brotli 품질 9(저장소 sidecar 생성과 같은 설정). 전송 시간이 아니라 파일 크기다.", godot: {}, productionBuildsInRepo: {}, threeBundles: {} };
  for (const dir of ["web", "web-threads"]) {
    out.godot[dir] = {};
    for (const file of ["index.wasm", "index.pck", "index.js", "index.html"]) {
      const full = path.join(args.build, dir, file);
      if (existsSync(full)) out.godot[dir][file] = sizeTriple(full);
    }
  }
  for (const name of ["godot-space", "play-godot", "cuts-godot"]) {
    const base = path.join(args.prodPublic, name);
    const entry = {};
    for (const file of ["index.wasm", "index.pck", "index.js"]) {
      const full = path.join(base, file);
      if (existsSync(full)) entry[file] = { ...sizeTriple(full), sha256: file === "index.wasm" ? sha256(full) : undefined };
    }
    if (Object.keys(entry).length > 0) out.productionBuildsInRepo[name] = entry;
  }
  for (const variant of ["full", "min"]) {
    const full = path.join(context.threeDir, variant, "bundle.js");
    if (existsSync(full)) out.threeBundles[variant] = sizeTriple(full);
  }
  return out;
}

async function emptyWebglBaseline() {
  const rows = [];
  for (let i = 0; i < Math.min(args.repeat, 3); i += 1) {
    const browser = await launch();
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent("<canvas id=c width=960 height=540></canvas>");
    await page.evaluate(() => {
      const gl = document.getElementById("c").getContext("webgl2");
      gl.clearColor(0.9, 0.9, 0.9, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.finish();
    });
    await sleep(500);
    rows.push(processTreeRss(process.pid));
    await browser.close();
  }
  return { rssTotalMiB: summarize(rows.map((row) => row.totalMiB)), byTypeSample: rows[0].byTypeMiB, note: "빈 페이지 + WebGL2 컨텍스트(SwiftShader GPU 프로세스 포함). 엔진 메모리의 바닥값이다." };
}

async function suiteCold() {
  const variants = ["n", "ni", "nr", "t", "ti", "tr"];
  const out = {
    note: "매 반복마다 새 브라우저(캐시·V8 코드 캐시 없음). 시각은 탐색 시작 기준 ms. 라운드 로빈: 반복 i 마다 모든 변형을 한 번씩, 시작 변형을 한 칸씩 돌려 가며 실행해 머신 부하 변화가 변형 사이에 고르게 퍼지게 했다.",
    baselineEmptyWebgl: await emptyWebglBaseline(),
    runOrder: [],
    variants: {},
  };
  const runsBy = Object.fromEntries(variants.map((variant) => [variant, []]));
  for (let i = 0; i < args.repeat; i += 1) {
    const order = variants.map((_, k) => variants[(k + i) % variants.length]);
    out.runOrder.push(order.join(","));
    for (const variant of order) {
      log(`cold ${variant} ${i + 1}/${args.repeat}`);
      const measureUa = variant.endsWith("i") || variant.endsWith("r");
      runsBy[variant].push(await coldRun(`${context.servers.origin}/g/${variant}/index.html`, { timeoutMs: variant === "t" ? 15000 : 120000, measureUa }));
    }
  }
  for (const variant of variants) {
    const runs = runsBy[variant];
    out.variants[variant] = { summary: summarizeBoot(runs), sample: runs[0].metrics.engine, isolated: runs[0].metrics.crossOriginIsolated, missingFeatures: runs[0].metrics.missingFeatures, bootError: runs[0].metrics.bootError, firstErrors: runs[0].errors, runs: runs.map((run) => ({ outcome: run.outcome, firstFrameMs: round(run.metrics.firstFrameMs, 1), wasmInstantiateMs: round(run.metrics.wasmInstantiateMs, 1), wasmMemoryMiB: run.metrics.wasmMemoryMiB, rssTotalMiB: run.metrics.rssTotalMiB })) };
  }
  return out;
}

async function suiteWarm() {
  const out = { note: "같은 브라우저 컨텍스트에서 같은 주소로 다시 탐색. HTTP 캐시 허용(max-age=3600). 첫 항목은 캐시를 채우는 콜드 실행.", runs: [] };
  const browser = await launch();
  const context2 = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const url = `${context.servers.origin}/g/nw/index.html`;
  for (let i = 0; i < args.repeat + 1; i += 1) {
    log(`warm ${i + 1}/${args.repeat + 1}`);
    const page = await context2.newPage();
    await page.addInitScript(STANDALONE_INIT);
    await page.goto(url, { waitUntil: "commit" });
    await page.waitForFunction(() => (window.__host?.events ?? []).some((event) => event.type === "first-frame"), null, { timeout: 120000, polling: 20 });
    const godot = { page, godotWindow: "window" };
    const metrics = await bootMetrics(godot);
    out.runs.push({ index: i, kind: i === 0 ? "cold-fill" : "warm", firstFrameMs: round(metrics.firstFrameMs, 1), wasmInstantiateMs: round(metrics.wasmInstantiateMs, 1), engineJsReadyMs: round(metrics.engineJsReadyMs, 1), wasmTransfer: metrics.resources.find((entry) => entry.file === "index.wasm")?.transfer ?? null });
    await page.close();
  }
  await browser.close();
  const warmRuns = out.runs.filter((run) => run.kind === "warm");
  out.coldFill = out.runs[0];
  out.warmSummary = { firstFrameMs: summarize(warmRuns.map((run) => run.firstFrameMs)), wasmInstantiateMs: summarize(warmRuns.map((run) => run.wasmInstantiateMs)) };
  return out;
}

/**
 * 재방문 비용: 영구 프로필(디스크 HTTP 캐시)과 brotli 압축 전송(운영의 sidecar 압축 전송과 비슷한 조건)에서 같은 페이지를 방문마다 새 브라우저 프로세스로 연다.
 * 방문 1 = 빈 프로필, 방문 2·3 = 같은 프로필(캐시가 채워진 뒤). `warm` 스위트와 달리 같은 프로세스 안의 재탐색이 아니다.
 * 응답이 압축되어(wasm 약 7 MB) 브라우저 캐시 항목 크기 한도에 걸리지 않을 것으로 기대한다. 로컬 서버라 네트워크 시간은 거의 0이다.
 */
async function suiteRevisit() {
  const url = `${context.servers.origin}/g/nz/index.html`;
  const visitCount = 3;
  const repeats = args.repeat;
  const rows = [];
  for (let repetition = 0; repetition < repeats; repetition += 1) {
    const profile = mkdtempSync(path.join(os.tmpdir(), "ts3d-revisit-"));
    try {
      for (let visit = 1; visit <= visitCount; visit += 1) {
        log(`revisit ${repetition + 1}/${repeats} 방문 ${visit}`);
        const persistent = await chromium.launchPersistentContext(profile, {
          headless: true,
          args: CHROMIUM_ARGS,
          viewport: VIEWPORT,
          deviceScaleFactor: 1,
          ...(args.chromium ? { executablePath: args.chromium } : {}),
        });
        try {
          const page = persistent.pages()[0] ?? (await persistent.newPage());
          await page.addInitScript(STANDALONE_INIT);
          await page.goto(url, { waitUntil: "commit" });
          await page.waitForFunction(() => Boolean(window.__ts3dBootError) || (window.__host?.events ?? []).some((event) => event.type === "first-frame"), null, { timeout: 120000, polling: 20 });
          const metrics = await bootMetrics({ page, godotWindow: "window" });
          const resource = (file) => metrics.resources.find((entry) => entry.file === file) ?? null;
          rows.push({
            repetition: repetition + 1,
            visit,
            firstFrameMs: round(metrics.firstFrameMs, 1),
            wasmInstantiateMs: round(metrics.wasmInstantiateMs, 1),
            wasmFetchEndMs: round(metrics.wasmFetchEndMs, 1),
            engineJsReadyMs: round(metrics.engineJsReadyMs, 1),
            wasm: resource("index.wasm"),
            js: resource("index.js"),
            pck: resource("index.pck"),
            bootError: metrics.bootError,
          });
        } finally {
          await persistent.close().catch(() => {});
        }
      }
    } finally {
      rmSync(profile, { recursive: true, force: true });
    }
  }
  const visits = {};
  for (let visit = 1; visit <= visitCount; visit += 1) {
    const set = rows.filter((row) => row.visit === visit);
    visits[visit] = {
      n: set.length,
      firstFrameMs: summarize(set.map((row) => row.firstFrameMs)),
      wasmInstantiateMs: summarize(set.map((row) => row.wasmInstantiateMs)),
      wasmFetchEndMs: summarize(set.map((row) => row.wasmFetchEndMs)),
      wasmTransferBytes: [...new Set(set.map((row) => row.wasm?.transfer))],
      wasmEncodedBytes: [...new Set(set.map((row) => row.wasm?.encoded))],
      wasmDecodedBytes: [...new Set(set.map((row) => row.wasm?.decoded))],
    };
  }
  return {
    note: "방문마다 새 브라우저 프로세스, 같은 영구 프로필(디스크 HTTP 캐시). 서버는 index.wasm·index.js 를 brotli 9 로 압축해 보내고 max-age=3600 으로 캐시를 허용한다. transferSize 0 은 캐시에서 받았다는 뜻이다.",
    packedBytes: context.servers.packedBytes,
    visits,
    rows,
  };
}

async function suiteCoi() {
  const origin = context.servers.origin;
  const scenarios = [
    { name: "부모 격리 없음 + 단일 스레드 스테이지", iso: "none", stage: "n" },
    { name: "부모 격리 없음 + 스레드 스테이지(격리 헤더 있음)", iso: "none", stage: "ti" },
    { name: "부모 COEP credentialless + 스레드 스테이지(credentialless)", iso: "credentialless", stage: "ti" },
    { name: "부모 COEP credentialless + 단일 스레드 스테이지(COEP 헤더 없음)", iso: "credentialless", stage: "n" },
    { name: "부모 COEP credentialless + 단일 스레드 스테이지(credentialless)", iso: "credentialless", stage: "ni" },
    { name: "부모 COEP require-corp + 스레드 스테이지(require-corp)", iso: "require-corp", stage: "tr" },
  ];
  const out = { note: "iframe 임베드 시나리오. 운영 /studio 와 godot-space 는 COOP same-origin + COEP credentialless 를 쓴다(config/http-response-headers.json).", scenarios: [] };
  for (const scenario of scenarios) {
    const runs = [];
    for (let i = 0; i < Math.min(args.repeat, 3); i += 1) {
      const url = `${origin}/host/embed.html?iso=${scenario.iso}&stage=${encodeURIComponent(`/g/${scenario.stage}/index.html`)}&img=${encodeURIComponent(`${context.servers.otherOrigin}/x.png`)}`;
      const godot = await openGodot(url, { standalone: false, timeoutMs: 20000 });
      const info = await godot.page.evaluate(async () => ({
        parentIsolated: window.__hostInfo?.crossOriginIsolated ?? null,
        img: await Promise.race([window.__imgResult, new Promise((resolve) => setTimeout(() => resolve({ loaded: null, timeout: true }), 3000))]),
        frameIsolated: (() => {
          try {
            return document.getElementById("stage").contentWindow.crossOriginIsolated;
          } catch {
            return null;
          }
        })(),
        bootError: (() => {
          try {
            return document.getElementById("stage").contentWindow.__ts3dBootError ?? null;
          } catch {
            return "frame-inaccessible";
          }
        })(),
      }));
      runs.push({ outcome: godot.outcome, wallMs: godot.wallToOutcomeMs, ...info, consoleErrors: godot.logs.slice(0, 2) });
      await godot.close();
    }
    out.scenarios.push({ ...scenario, runs, outcomes: [...new Set(runs.map((run) => run.outcome))] });
  }
  return out;
}

function expectedFixtures() {
  const file = path.join(args.fixtures, "fixtures.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

async function suiteGlb() {
  const models = [
    { name: "synthetic-character", url: "/fixtures/synthetic-character.glb", expect: expectedFixtures()?.files?.["synthetic-character.glb"]?.expected ?? null },
    { name: "orion-avatar", url: "/fixtures/orion.glb", expect: { triangles: 14604 } },
    { name: "studio-room", url: "/fixtures/studio-room.glb", expect: { triangles: 254771 } },
  ].filter((model) => model.name === "synthetic-character" ? existsSync(path.join(args.fixtures, "synthetic-character.glb")) : Boolean(fixtureMap()[model.url.split("/").pop()]));
  const out = { note: "같은 페이지에서 방법별로 반복 로드. parse/generate/toon 은 Godot 쪽 측정(ms), acquire 는 바이트 확보(HTTP/복사), total 은 명령 전송~응답.", models: {} };
  for (const model of models) {
    const godot = await openGodot(`${context.servers.origin}/g/n/index.html`);
    const methods = {
      "url-64k": { source: { kind: "url", url: model.url, chunkBytes: 65536 } },
      "url-8m": { source: { kind: "url", url: model.url, chunkBytes: 8388608 } },
      "inbox-no-eval": { source: { kind: "inbox" }, prefetch: true },
      "inbox-eval": { source: { kind: "inbox-eval" }, prefetch: true },
    };
    const rows = Object.fromEntries(Object.keys(methods).map((key) => [key, []]));
    let verification = null;
    for (let rep = 0; rep < args.repeat; rep += 1) {
      for (const [key, method] of Object.entries(methods)) {
        log(`glb ${model.name} ${key} ${rep + 1}/${args.repeat}`);
        let jsFetchMs = null;
        if (method.prefetch) {
          jsFetchMs = await godot.page.evaluate(async (url) => {
            const t0 = performance.now();
            const buffer = await (await fetch(url)).arrayBuffer();
            window.__host.setInbox(buffer);
            return performance.now() - t0;
          }, model.url);
        }
        const { event, rtt } = await godot.send({ cmd: "load-glb", source: method.source, toon: true, fit: true });
        rows[key].push({ ok: event.ok, totalMs: rtt, jsFetchMs, acquireMs: event.acquireMs, parseMs: event.parseMs, generateMs: event.generateMs, toonMs: event.toonMs, error: event.error ?? null });
        if (event.ok) verification = event.model;
      }
    }
    const afterStats = (await godot.send({ cmd: "get-stats" })).event;
    const metrics = await bootMetrics(godot);
    const expectOk = model.expect
      ? {
          trianglesMatch: model.expect.triangles === verification?.triangles,
          expectedTriangles: model.expect.triangles,
          godotTriangles: verification?.triangles ?? null,
          aabbMaxAbsDiff: model.expect.aabb && verification?.aabb ? round(Math.max(...model.expect.aabb.map((value, index) => Math.abs(value - verification.aabb[index]))), 6) : null,
        }
      : null;
    out.models[model.name] = {
      model: verification,
      verification: expectOk,
      methods: Object.fromEntries(
        Object.entries(rows).map(([key, list]) => [key, { ok: list.every((row) => row.ok), total: summarize(list.map((row) => row.totalMs)), jsFetch: summarize(list.map((row) => row.jsFetchMs)), acquire: summarize(list.map((row) => row.acquireMs)), parse: summarize(list.map((row) => row.parseMs)), generate: summarize(list.map((row) => row.generateMs)), toon: summarize(list.map((row) => row.toonMs)), first: list[0], errors: [...new Set(list.map((row) => row.error).filter(Boolean))] }]),
      ),
      afterLoads: { wasmMemoryMiB: metrics.wasmMemoryMiB, jsHeapUsedMiB: metrics.jsHeapUsedMiB, rssTotalMiB: metrics.rssTotalMiB, videoMemMiB: round((afterStats.videoMemBytes ?? 0) / 1048576, 2), textureMemMiB: round((afterStats.textureMemBytes ?? 0) / 1048576, 2) },
    };
    await godot.close();
  }
  return out;
}

async function suiteExt() {
  const urls = listFixtures().map((name) => `/fixtures/${name}`);
  const out = { note: "같은 GLB 를 Godot 4.4.1 GLTFDocument 와 Three(+Meshopt/Draco/KTX2 디코더)로 연다.", godot: {}, three: null, godotSupportedExtensions: null };
  const godot = await openGodot(`${context.servers.origin}/g/n/index.html`);
  const ready = await godot.page.evaluate(() => window.__host.events.find((event) => event.type === "ready").engine.gltfExtensions);
  out.godotSupportedExtensions = ready;
  for (const url of urls) {
    godot.logs.length = 0;
    const fileName = url.split("/").pop();
    const renderCheck = fileName === "synthetic-character.glb" || fileName.startsWith("ext-basisu");
    const { event } = await godot.send({ cmd: "load-glb", source: { kind: "url", url, chunkBytes: 1048576 }, toon: true, fit: renderCheck });
    await sleep(150);
    let render = null;
    if (event.ok && renderCheck) {
      // 텍스처가 실제로 화면에 반영되는지: 체커 텍스처가 있으면 단색 모델보다 고유 색 수가 훨씬 많다.
      const captured = (await godot.send({ cmd: "capture", size: [256, 256], passes: ["beauty"] })).event;
      const stats = captured.passes?.beauty?.stats;
      render = stats ? { uniqueColorsSampled: stats.uniqueColorsSampled, coveredRatio: round(stats.coveredRatio, 4) } : null;
    }
    out.godot[fileName] = {
      renderCheck: render,
      ok: event.ok,
      error: event.error ?? null,
      errorCode: event.errorCode ?? null,
      extensionsRequired: event.extensionsRequired ?? null,
      triangles: event.model?.triangles ?? null,
      texturesReported: event.model?.textures ?? null,
      consoleErrors: godot.logs.filter((entry) => /glTF:|Couldn't load/u.test(entry.text)).map((entry) => entry.text.slice(0, 200)).slice(0, 4),
    };
  }
  await godot.close();
  const browser = await launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(`${context.servers.origin}/three/index.html`);
  await page.waitForFunction(() => window.__threeReady === true, null, { timeout: 60000 });
  out.three = await page.evaluate((list) => window.__three.runExt({ urls: list }), urls);
  await browser.close();
  return out;
}

async function pngCheck(godot, id) {
  return godot.page.evaluate(async (replyId) => {
    const list = window.__host.takeBinaries(replyId);
    const rows = [];
    for (const item of list) {
      const blob = new Blob([item.bytes], { type: "image/png" });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque += 1;
      rows.push({ name: item.name, width: bitmap.width, height: bitmap.height, pngBytes: item.bytes.length, base64Chars: item.base64Length, hostDecodeMs: item.decodeMs, nonTransparentRatio: opaque / (bitmap.width * bitmap.height), signature: Array.from(item.bytes.slice(0, 8)).join(",") });
    }
    return rows;
  }, id);
}

async function suiteCapture() {
  const out = { note: "패스별 시간은 Godot 쪽 측정(렌더 + GPU 읽기), png_* 는 PNG 인코딩, 호스트 디코드는 base64 -> 바이트 변환 시간.", models: {} };
  const sizes = [[512, 512], [960, 540], [1920, 1080]];
  const map = fixtureMap();
  for (const [name, url] of [["orion-avatar", "/fixtures/orion.glb"], ["studio-room", "/fixtures/studio-room.glb"]]) {
    if (!map[url.split("/").pop()]) continue;
    const godot = await openGodot(`${context.servers.origin}/g/n/index.html`);
    const load = (await godot.send({ cmd: "load-glb", source: { kind: "url", url, chunkBytes: 8388608 }, toon: true, fit: true })).event;
    const modelOut = { model: load.model, sizes: {} };
    for (const [w, h] of sizes) {
      const runs = [];
      const reps = w >= 1920 ? Math.min(args.repeat, 3) : args.repeat;
      for (let rep = 0; rep < reps; rep += 1) {
        log(`capture ${name} ${w}x${h} ${rep + 1}`);
        const { event, rtt } = await godot.send({ cmd: "capture", size: [w, h], passes: ["beauty", "line", "tone", "depth", "normal"] });
        const checks = event.ok ? await pngCheck(godot, event.replyTo) : [];
        runs.push({ ok: event.ok, error: event.error ?? null, rtt, timingsMs: event.timingsMs, base64EncodeMsTotal: event.base64EncodeMsTotal, checks, diag: event.diag ?? null });
      }
      const okRuns = runs.filter((run) => run.ok);
      modelOut.sizes[`${w}x${h}`] = {
        ok: okRuns.length === runs.length,
        error: runs.find((run) => !run.ok)?.error ?? null,
        firstRttMs: round(okRuns[0]?.rtt, 1),
        firstTotalGodotMs: round(okRuns[0]?.timingsMs?.total, 1),
        rttMs: summarize(okRuns.slice(1).map((run) => run.rtt)),
        totalGodotMs: summarize(okRuns.slice(1).map((run) => run.timingsMs?.total)),
        warmNote: "rttMs/totalGodotMs/perPassMs 는 첫 실행(셰이더 컴파일·인코딩 진단 포함)을 제외한 중앙값이다.",
        perPassMs: Object.fromEntries(["beauty", "depth", "normal", "ndl", "line", "tone", "png_beauty", "png_depth", "png_normal", "png_line", "png_tone"].map((key) => [key, summarize(okRuns.slice(1).map((run) => run.timingsMs?.[key]))])),
        base64EncodeMs: summarize(okRuns.slice(1).map((run) => run.base64EncodeMsTotal)),
        pngBytes: okRuns[0] ? Object.fromEntries(okRuns[0].checks.map((check) => [check.name, check.pngBytes])) : null,
        validity: okRuns[0] ? okRuns[0].checks.map((check) => ({ name: check.name, width: check.width, height: check.height, nonTransparentRatio: round(check.nonTransparentRatio, 4), pngSignatureOk: check.signature === "137,80,78,71,13,10,26,10" })) : null,
        diag: okRuns[0]?.diag ?? null,
      };
    }
    out.models[name] = modelOut;
    await godot.close();
  }
  return out;
}

async function suiteTwoPoint() {
  const godot = await openGodot(`${context.servers.origin}/g/n/index.html`);
  const cases = [
    { yaw: 0, pitch: 20, distance: 10, fovDegrees: 40 },
    { yaw: 25, pitch: 12, distance: 8, fovDegrees: 50 },
    { yaw: -40, pitch: 30, distance: 14, fovDegrees: 35 },
    { yaw: 70, pitch: -15, distance: 9, fovDegrees: 60 },
    { yaw: 120, pitch: 45, distance: 12, fovDegrees: 24 },
    { yaw: -75, pitch: 5, distance: 6, fovDegrees: 90 },
    { yaw: 10, pitch: -35, distance: 11, fovDegrees: 45 },
    { yaw: 180, pitch: 60, distance: 16, fovDegrees: 30 },
  ];
  const { event } = await godot.send({ cmd: "verify-two-point", cases, render: true });
  await godot.close();
  const rows = event.cases ?? [];
  return {
    note: "수직 모서리(높이 3m) 위·아래 점의 화면 x 차이(px), 타깃의 화면 중심 오차(px), 저장소 공식과 엔진 frustum_offset 에서 역산한 lensShiftY 비교. 960x540.",
    cases: rows.map((row) => ({ case: row.case, pitchedMaxVerticalEdgeDxPx: round(row.pitchedMaxVerticalEdgeDxPx, 4), twoPointMaxVerticalEdgeDxPx: round(row.twoPointMaxVerticalEdgeDxPx, 6), pitchedTargetErrPx: round(row.pitchedTargetErrPx, 6), twoPointTargetErrPx: round(row.twoPointTargetErrPx, 6), formulaLensShiftY: round(row.formulaLensShiftY, 9), formulaLensShiftYUnclamped: round(row.formulaLensShiftYUnclamped, 6), clampedByDocumentLimit: row.clampedByDocumentLimit, engineLensShiftY: round(row.engineLensShiftY, 9) })),
    maxTwoPointDxPx: Math.max(...rows.map((row) => row.twoPointMaxVerticalEdgeDxPx)),
    minPitchedDxPx: Math.min(...rows.map((row) => row.pitchedMaxVerticalEdgeDxPx)),
    maxLensShiftDiff: Math.max(...rows.map((row) => Math.abs(row.formulaLensShiftY - row.engineLensShiftY))),
    render: event.render ?? null,
  };
}

async function suiteBench() {
  const counts = [1000, 10000, 100000];
  const out = { note: "12삼각형 박스 N 개를 한 번의 드로로 그린다. SwiftShader 소프트웨어 렌더링이라 프레임 시간은 상대 비교용이다.", godot: {}, three: {} };
  for (const count of counts) {
    const godotRuns = [];
    const threeRuns = [];
    for (let rep = 0; rep < Math.min(args.repeat, 3); rep += 1) {
      log(`bench ${count} ${rep + 1}`);
      const godot = await openGodot(`${context.servers.origin}/g/n/index.html`);
      const before = await bootMetrics(godot);
      const { event } = await godot.send({ cmd: "bench-instances", count, frames: count >= 100000 ? 4 : 6, warmup: 2, useBuffer: true });
      const after = await bootMetrics(godot);
      godotRuns.push({ ok: event.ok, bench: event.bench, wasmMemoryDeltaMiB: round((after.wasmMemoryMiB ?? 0) - (before.wasmMemoryMiB ?? 0), 2), rssTotalMiB: after.rssTotalMiB });
      await godot.close();
      const browser = await launch();
      const page = await browser.newPage({ viewport: VIEWPORT });
      await page.goto(`${context.servers.origin}/three/index.html`);
      await page.waitForFunction(() => window.__threeReady === true, null, { timeout: 60000 });
      const result = await page.evaluate((n) => window.__three.runBench({ count: n, frames: n >= 100000 ? 4 : 6, warmup: 2 }), count);
      const rss = processTreeRss(process.pid);
      threeRuns.push({ ...result, rssTotalMiB: rss.totalMiB });
      await browser.close();
    }
    out.godot[count] = { setupMs: summarize(godotRuns.map((run) => run.bench?.setupMs)), frameMsMedian: summarize(godotRuns.map((run) => run.bench?.frameMs?.median)), firstFrameMs: summarize(godotRuns.map((run) => run.bench?.firstFrameMs)), drawCalls: godotRuns[0]?.bench?.drawCalls ?? null, primitivesInFrame: godotRuns[0]?.bench?.primitivesInFrame ?? null, videoMemBytes: godotRuns[0]?.bench?.videoMemBytes ?? null, wasmMemoryDeltaMiB: summarize(godotRuns.map((run) => run.wasmMemoryDeltaMiB)), rssTotalMiB: summarize(godotRuns.map((run) => run.rssTotalMiB)) };
    out.three[count] = { setupMs: summarize(threeRuns.map((run) => run.setupMs)), frameMsMedian: summarize(threeRuns.map((run) => run.frameMs?.median)), firstFrameMs: summarize(threeRuns.map((run) => run.firstFrameMs)), drawCalls: threeRuns[0]?.info?.calls ?? null, triangles: threeRuns[0]?.info?.triangles ?? null, heapMiB: summarize(threeRuns.map((run) => run.heapMiB)), rssTotalMiB: summarize(threeRuns.map((run) => run.rssTotalMiB)) };
  }
  // 설정 경로 비교(버퍼 일괄 vs 인스턴스별 호출) 10k
  const godot = await openGodot(`${context.servers.origin}/g/n/index.html`);
  const buffered = [];
  const looped = [];
  for (let i = 0; i < 4; i += 1) {
    // 같은 페이지에서 두 경로를 교대로 반복해 워밍·순서 영향을 줄인다(첫 쌍은 워밍으로 버린다).
    const a = (await godot.send({ cmd: "bench-instances", count: 10000, frames: 1, warmup: 1, useBuffer: true })).event.bench?.setupMs;
    const b = (await godot.send({ cmd: "bench-instances", count: 10000, frames: 1, warmup: 1, useBuffer: false })).event.bench?.setupMs;
    if (i > 0) {
      buffered.push(a);
      looped.push(b);
    }
  }
  out.godotSetupPath10k = { bufferMs: summarize(buffered), perInstanceCallMs: summarize(looped), note: "10,000 인스턴스 설정 시간(생성+채우기). 한 페이지에서 두 경로를 교대로 4쌍 실행하고 첫 쌍은 버렸다." };
  await godot.close();
  return out;
}

async function suiteCompare() {
  const map = fixtureMap();
  const models = [
    ["synthetic-character", "/fixtures/synthetic-character.glb", existsSync(path.join(args.fixtures, "synthetic-character.glb"))],
    ["orion-avatar", "/fixtures/orion.glb", Boolean(map["orion.glb"])],
    ["studio-room", "/fixtures/studio-room.glb", Boolean(map["studio-room.glb"])],
  ].filter((entry) => entry[2]);
  const out = { note: "같은 GLB·카메라·툰 3단 + 픽셀 외곽선 2px·960x540·MSAA 없음. 탐색 시작 -> GLB 가 그려진 첫 프레임까지(ms, 로컬 서버라 네트워크 시간은 거의 0)와 이후 프레임, 메모리.", models: {} };
  for (const [name, url] of models) {
    const godotRuns = [];
    const threeRuns = [];
    for (let rep = 0; rep < args.repeat; rep += 1) {
      log(`compare ${name} ${rep + 1}/${args.repeat}`);
      const godot = await openGodot(`${context.servers.origin}/g/n/index.html`);
      const loadReply = await godot.send({ cmd: "load-glb", source: { kind: "url", url, chunkBytes: 8388608 }, toon: true, fit: true });
      const waited = await godot.page.evaluate(async () => {
        const r = await window.__host.send({ cmd: "wait-frames", n: 1 });
        return r.event.hostReceivedAt;
      });
      await godot.page.evaluate(async () => window.__host.send({ cmd: "wait-frames", n: 25 }));
      const stats = (await godot.send({ cmd: "get-stats" })).event;
      const metrics = await bootMetrics(godot);
      godotRuns.push({ ok: loadReply.event.ok, modelFirstFrameMs: waited, engineFirstFrameMs: metrics.firstFrameMs, loadMs: loadReply.rtt, parseMs: loadReply.event.parseMs, generateMs: loadReply.event.generateMs, frameMsMedian: stats.frameMsMedian, wasmMemoryMiB: metrics.wasmMemoryMiB, jsHeapUsedMiB: metrics.jsHeapUsedMiB, rssTotalMiB: metrics.rssTotalMiB, rssByTypeMiB: metrics.rssByTypeMiB, triangles: loadReply.event.model?.triangles ?? null });
      await godot.close();

      const browser = await launch();
      const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      await page.goto(`${context.servers.origin}/three/index.html`, { waitUntil: "commit" });
      await page.waitForFunction(() => window.__threeReady === true, null, { timeout: 60000 });
      const result = await page.evaluate((u) => window.__three.runModel({ url: u, frames: 25, warmup: 3 }), url);
      const rss = processTreeRss(process.pid);
      threeRuns.push({ modelFirstFrameMs: result.marks.t["first-frame"], parseMs: result.parseMs, buildMs: result.buildMs, fetchMs: result.fetchMs, frameMsMedian: result.frameMs.median, jsHeapMiB: result.heapMiB, rssTotalMiB: rss.totalMiB, rssByTypeMiB: rss.byTypeMiB, triangles: result.triangles, drawCalls: result.info.calls });
      await browser.close();
    }
    out.models[name] = {
      godot: { ok: godotRuns.every((run) => run.ok), triangles: godotRuns[0]?.triangles, modelFirstFrameMs: summarize(godotRuns.map((run) => run.modelFirstFrameMs)), engineFirstFrameMs: summarize(godotRuns.map((run) => run.engineFirstFrameMs)), loadMs: summarize(godotRuns.map((run) => run.loadMs)), parseMs: summarize(godotRuns.map((run) => run.parseMs)), generateMs: summarize(godotRuns.map((run) => run.generateMs)), frameMsMedian: summarize(godotRuns.map((run) => run.frameMsMedian)), wasmMemoryMiB: summarize(godotRuns.map((run) => run.wasmMemoryMiB)), jsHeapUsedMiB: summarize(godotRuns.map((run) => run.jsHeapUsedMiB)), rssTotalMiB: summarize(godotRuns.map((run) => run.rssTotalMiB)), rssByTypeSample: godotRuns[0]?.rssByTypeMiB },
      three: { triangles: threeRuns[0]?.triangles, drawCalls: threeRuns[0]?.drawCalls, modelFirstFrameMs: summarize(threeRuns.map((run) => run.modelFirstFrameMs)), fetchMs: summarize(threeRuns.map((run) => run.fetchMs)), parseMs: summarize(threeRuns.map((run) => run.parseMs)), buildMs: summarize(threeRuns.map((run) => run.buildMs)), frameMsMedian: summarize(threeRuns.map((run) => run.frameMsMedian)), jsHeapMiB: summarize(threeRuns.map((run) => run.jsHeapMiB)), rssTotalMiB: summarize(threeRuns.map((run) => run.rssTotalMiB)), rssByTypeSample: threeRuns[0]?.rssByTypeMiB },
    };
  }
  return out;
}

async function suiteBridge() {
  const out = { note: "JS 호스트 -> Godot -> JS 호스트 왕복(ms). 호스트 쪽 performance.now 로 잰다. 크기는 바이트.", standalone: {}, iframe: {} };
  for (const mode of ["standalone", "iframe"]) {
    const url = mode === "standalone" ? `${context.servers.origin}/g/n/index.html` : `${context.servers.origin}/host/embed.html?iso=none&stage=${encodeURIComponent("/g/n/index.html")}`;
    const godot = await openGodot(url, { standalone: mode === "standalone" });
    const table = out[mode];
    const pings = [];
    for (let i = 0; i < 40; i += 1) pings.push((await godot.send({ cmd: "ping" })).rtt);
    table.pingRttMs = summarize(pings.slice(5));
    table.jsonEcho = {};
    for (const bytes of [1024, 65536, 1048576, 8388608]) {
      const rows = [];
      for (let rep = 0; rep < args.repeat; rep += 1) {
        const payload = "a".repeat(bytes);
        const { event, rtt } = await godot.send({ cmd: "bridge-echo", payload });
        rows.push({ rtt, parseMs: event.parseMs, chars: event.payloadChars });
      }
      table.jsonEcho[bytes] = { rttMs: summarize(rows.map((row) => row.rtt)), godotJsonParseMs: summarize(rows.map((row) => row.parseMs)), receivedChars: rows[0].chars };
    }
    // 이진 입력. 키 = "<호스트가 둔 형태>/<Godot 읽기 경로>". `view` = Uint8Array 뷰(권장), `arraybuffer` = 부모 창의 ArrayBuffer 그대로.
    // iframe 에서는 arraybuffer 가 교차 realm 이라 엔진의 instanceof 검사에 걸려 빈 입력(bytes 0)이 된다 — 대조군으로 함께 잰다.
    table.binaryIn = {};
    for (const kind of ["view", "arraybuffer"]) {
      for (const via of ["no-eval", "eval"]) {
        const key = `${kind}/${via}`;
        table.binaryIn[key] = {};
        for (const mib of [1, 8, 32]) {
          const rows = [];
          for (let rep = 0; rep < args.repeat; rep += 1) {
            const hostSha = await godot.page.evaluate(
              async ({ size, as }) => {
                const bytes = new Uint8Array(size);
                for (let i = 0; i < size; i += 1) bytes[i] = i % 251;
                window.__host.setInbox(bytes, { as }); // 호스트(부모) 창의 __ts3dInbox. iframe 모드에서도 Godot 는 parent.__ts3dInbox 를 읽는다.
                const digest = await crypto.subtle.digest("SHA-256", bytes);
                return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
              },
              { size: mib * 1048576, as: kind },
            );
            const { event, rtt } = await godot.send({ cmd: "bridge-binary-in", via });
            rows.push({ rtt, copyMs: event.copyMs, hashMs: event.hashMs, bytes: event.bytes, match: event.sha256 === hostSha });
          }
          table.binaryIn[key][`${mib}MiB`] = { rttMs: summarize(rows.map((row) => row.rtt)), godotCopyMs: summarize(rows.map((row) => row.copyMs)), godotSha256Ms: summarize(rows.map((row) => row.hashMs)), allShaMatch: rows.every((row) => row.match), bytes: rows[0].bytes, firstCopyMs: round(rows[0].copyMs, 2) };
        }
      }
    }
    table.binaryOut = {};
    for (const mib of [0.25, 1, 4]) {
      const rows = [];
      for (let rep = 0; rep < args.repeat; rep += 1) {
        const { event, rtt } = await godot.send({ cmd: "bridge-binary-out", bytes: Math.round(mib * 1048576) });
        const check = await godot.page.evaluate(async (id) => {
          const item = window.__host.takeBinaries(id)[0];
          const digest = await crypto.subtle.digest("SHA-256", item.bytes);
          return { hostDecodeMs: item.decodeMs, chars: item.base64Length, sha: Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join(""), bytes: item.bytes.length };
        }, event.replyTo);
        rows.push({ rtt, godotBase64Ms: event.base64EncodeMs, hostDecodeMs: check.hostDecodeMs, chars: check.chars, match: check.sha === event.sha256, bytes: check.bytes });
      }
      table.binaryOut[`${mib}MiB`] = { rttMs: summarize(rows.map((row) => row.rtt)), godotBase64EncodeMs: summarize(rows.map((row) => row.godotBase64Ms)), hostBase64DecodeMs: summarize(rows.map((row) => row.hostDecodeMs)), base64Chars: rows[0].chars, expansion: round(rows[0].chars / rows[0].bytes, 3), allShaMatch: rows.every((row) => row.match) };
    }
    await godot.close();
  }
  return out;
}

/**
 * 메모리 반환: 모델을 올리기 전 / 올린 뒤 / `clear-model` 뒤(30 프레임 대기)의 wasm 선형 메모리, JS 힙, 브라우저 프로세스 RSS 합, 엔진이 보고하는 비디오·텍스처 메모리.
 * "모바일 브라우저 메모리" 한계의 근거 중 하나다: 모델을 지워도 wasm 선형 메모리가 줄어드는지, GPU 쪽 자원이 돌아오는지를 본다. 실기기 측정이 아니다.
 */
async function suiteMemory() {
  const out = { note: "같은 페이지에서 단계별로 잰다: 부팅 직후(before) / GLB 로드 + 10 프레임(loaded) / clear-model + 30 프레임(cleared). 소프트웨어 렌더링 브라우저의 값이다.", models: {} };
  const map = fixtureMap();
  for (const [name, url] of [["orion-avatar", "/fixtures/orion.glb"], ["studio-room", "/fixtures/studio-room.glb"]]) {
    if (!map[url.split("/").pop()]) continue;
    const runs = [];
    for (let rep = 0; rep < Math.min(args.repeat, 3); rep += 1) {
      log(`memory ${name} ${rep + 1}`);
      const godot = await openGodot(`${context.servers.origin}/g/n/index.html`);
      const sample = async () => {
        const stats = (await godot.send({ cmd: "get-stats" })).event;
        const metrics = await bootMetrics(godot);
        return { wasmMemoryMiB: metrics.wasmMemoryMiB, jsHeapUsedMiB: metrics.jsHeapUsedMiB, rssTotalMiB: metrics.rssTotalMiB, videoMemMiB: round((stats.videoMemBytes ?? 0) / 1048576, 2), textureMemMiB: round((stats.textureMemBytes ?? 0) / 1048576, 2), bufferMemMiB: round((stats.bufferMemBytes ?? 0) / 1048576, 2), nodeCount: stats.nodeCount, objectCount: stats.objectCount };
      };
      await godot.send({ cmd: "wait-frames", n: 5 });
      const before = await sample();
      const load = (await godot.send({ cmd: "load-glb", source: { kind: "url", url, chunkBytes: 8388608 }, toon: true, fit: true })).event;
      await godot.send({ cmd: "wait-frames", n: 10 });
      const loaded = await sample();
      await godot.send({ cmd: "clear-model" });
      await godot.send({ cmd: "wait-frames", n: 30 });
      const cleared = await sample();
      runs.push({ ok: load.ok, before, loaded, cleared });
      await godot.close();
    }
    const stage = (key, field) => summarize(runs.map((run) => run[key][field]));
    out.models[name] = Object.fromEntries(["before", "loaded", "cleared"].map((key) => [key, Object.fromEntries(["wasmMemoryMiB", "jsHeapUsedMiB", "rssTotalMiB", "videoMemMiB", "textureMemMiB", "bufferMemMiB", "nodeCount"].map((field) => [field, stage(key, field)]))]));
    out.models[name].allLoadsOk = runs.every((run) => run.ok);
  }
  return out;
}

const SUITES = { sizes: suiteSizes, cold: suiteCold, warm: suiteWarm, revisit: suiteRevisit, coi: suiteCoi, glb: suiteGlb, ext: suiteExt, bridge: suiteBridge, capture: suiteCapture, twopoint: suiteTwoPoint, bench: suiteBench, compare: suiteCompare, memory: suiteMemory };

async function main() {
  log(`label=${args.label} repeat=${args.repeat} only=${args.only.join(",")}`);
  context.threeDir = path.join(pocRoot, ".cache", "three-baseline");
  mkdirSync(context.threeDir, { recursive: true });
  await buildThreeBundle(context.threeDir);
  context.servers = await startServers({
    buildDir: args.build,
    fixtureRoots: fixtureMap(),
    fixtureDirs: [args.fixtures],
    precompress: args.only.includes("revisit"),
    threeBundleDir: path.join(context.threeDir, "full"),
    threeVendorDir: path.join(repoRoot, "node_modules", "three"),
    hostDir: path.join(here, "host"),
  });
  results.environment = await gatherEnvironment();
  for (const name of args.only) {
    const suite = SUITES[name];
    if (!suite) {
      log(`알 수 없는 스위트: ${name}`);
      continue;
    }
    const before = loadAverage();
    const t0 = Date.now();
    log(`스위트 시작: ${name}`);
    try {
      const value = await suite();
      results.suites[name] = { ...value, _meta: { loadAverageBefore: before, loadAverageAfter: loadAverage(), seconds: round((Date.now() - t0) / 1000, 1) } };
    } catch (error) {
      results.suites[name] = { error: String(error?.stack ?? error).slice(0, 1500), _meta: { loadAverageBefore: before, loadAverageAfter: loadAverage(), seconds: round((Date.now() - t0) / 1000, 1) } };
      log(`스위트 실패: ${name}`, error);
    }
    writeFileSync(path.join(args.out, `results-${args.label}${args.engineTag}.json`), `${JSON.stringify(results, null, 1)}\n`);
  }
  results.finishedAt = new Date().toISOString();
  writeFileSync(path.join(args.out, `results-${args.label}${args.engineTag}.json`), `${JSON.stringify(results, null, 1)}\n`);
  await context.servers.close();
  log(`완료: ${path.join(args.out, `results-${args.label}${args.engineTag}.json`)}`);
}

await main();
