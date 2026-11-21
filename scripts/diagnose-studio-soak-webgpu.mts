/**
 * 제품을 로드하지 않는 WebGPU 수명·표시 진단. 제품 acceptance/5시간 증명을 대체하지 않는다.
 * 실행: pnpm exec tsx scripts/diagnose-studio-soak-webgpu.mts
 * 출력: TOONSTUDIO_SOAK_GPU_DIAGNOSTIC_OUT 아래 실행별 디렉터리 (기본 /tmp/studio-soak-gpu-diagnostic).
 * 조건별 오류를 모두 보존하고 나머지 조건을 계속 실행한다. 관측 실패가 있으면 종료 코드는 1이다.
 * GPU 프로세스 stderr도 필요하면 실행 환경에서 DEBUG=pw:browser를 지정해 작업 로그를 보존한다.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { arch, availableParallelism, cpus, freemem, loadavg, platform, release, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

import { decodePng, encodePng, Image } from "image-js";
import { chromium, errors, type Browser, type BrowserContext, type Page } from "playwright";

import { STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS } from "./lib/studio-soak-browser-launch";
import { installGpuAndPerfCollector } from "./lib/studio-soak-telemetry";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SCRIPT_FILE = fileURLToPath(import.meta.url);
const OPERATION_TIMEOUT_MS = 8_000;
const MAX_CONSOLE_EVENTS = 200;
const SIZE = 64;
// CDP의 실제 실행 인자 조회에 필요하다. 제품 acceptance가 아닌 8개 진단 조건에만 동일하게 추가한다.
const METADATA_LAUNCH_ARGS = ["--enable-automation"] as const;
const CONFIGURATIONS = [
  { id: "existing", args: ["--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-gl=swiftshader", "--enable-unsafe-webgpu"] },
  { id: "vulkan-angle", args: STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS },
] as const;

interface Failure { phase: string; name: string; message: string; stack: string | null; code: string | null; raw?: unknown }
interface Stage { phase: string; startedAt: string; endedAt: string; outcome: "completed" | "failed"; value?: unknown; error?: Failure }
interface DiagnosticCase {
  id: string; configuration: string; surface: "offscreen" | "canvas"; telemetryWrapper: boolean;
  requestedLaunchArgs: readonly string[]; actualLaunchArgs: string[] | null; browserVersion: string | null;
  browserProtocolVersion: unknown; startedAt: string; endedAt: string | null;
  status: "running" | "no-failure-observed" | "observed-failure";
  consoleEvents: Array<{ at: string; type: string; text: string }>; consoleEventsDropped: number;
  pageErrors: Failure[]; stages: Stage[]; failures: Failure[];
  environmentBefore: unknown; environmentAfter: unknown;
}

function failure(phase: string, value: unknown): Failure {
  return { phase, name: value instanceof Error ? value.name : "Error",
    message: value instanceof Error ? value.message : String(value), stack: value instanceof Error ? value.stack ?? null : null,
    code: record(value) && typeof value.code === "string" ? value.code : null,
    ...(value instanceof BrowserDiagnosticError ? { raw: value.raw } : {}) };
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function browserTimedOut(value: unknown): boolean { return record(value) && value.code === "STUDIO_GPU_DIAGNOSTIC_TIMEOUT"; }
function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function readSystemFile(path: string): { value: string | null; error: string | null } {
  try { return { value: readFileSync(path, "utf8").trim(), error: null }; }
  catch (error) { return { value: null, error: failure("environment", error).message }; }
}
function environment() {
  return {
    at: new Date().toISOString(), platform: platform(), arch: arch(), release: release(), nodeVersion: process.version,
    availableParallelism: availableParallelism(), logicalCpuCount: cpus().length,
    cpuModels: [...new Set(cpus().map((cpu) => cpu.model))], totalMemoryBytes: totalmem(), freeMemoryBytes: freemem(),
    loadAverage: loadavg(), processMemory: process.memoryUsage(), processResources: process.resourceUsage(),
    ci: process.env.CI === "true", githubActions: process.env.GITHUB_ACTIONS === "true",
    cpuThrottlingOverrideApplied: false, nativeHardwareCertification: false,
    cgroup: Object.fromEntries(["cpu.max", "cpu.stat", "cpuset.cpus.effective", "memory.max", "memory.current", "memory.events"]
      .map((name) => [name, readSystemFile("/sys/fs/cgroup/" + name)])),
  };
}
class DiagnosticTimeoutError extends Error {
  constructor(message: string) { super(message); this.name = "DiagnosticTimeoutError"; }
}
class BrowserDiagnosticError extends Error {
  readonly code: string | null;
  constructor(readonly raw: Record<string, unknown>) {
    super(typeof raw.message === "string" ? raw.message : "브라우저 GPU 진단 오류");
    this.name = typeof raw.name === "string" ? raw.name : "BrowserDiagnosticError";
    this.code = typeof raw.code === "string" ? raw.code : null;
    if (typeof raw.stack === "string") this.stack = raw.stack;
  }
}
async function bounded<T>(work: Promise<T>, label: string, milliseconds = OPERATION_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DiagnosticTimeoutError(label + ": " + milliseconds + "ms 진단 기한 초과")), milliseconds);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

// 문자열로 실행하여 tsx의 Node 전용 __name 변환이 브라우저에 유입되지 않게 한다.
// device/context 하나만 후속 GC 이후 작업을 위해 보유하며 adapter나 device 관측용 전역 배열은 만들지 않는다.
const BROWSER_PROBE = String.raw`(() => {
  const data = { phase: "setup", pageEpoch: performance.timeOrigin, deviceId: null,
    adapter: null, device: null, lost: [], uncapturedErrors: [], operationErrors: [] };
  let device = null;
  let context = null;
  let surface = null;
  let format = null;
  const describe = (error) => ({ name: error?.name ?? "Error", code: error?.code ?? null,
    message: error?.message ?? String(error), stack: error?.stack ?? null });
  const wait = async (promise, label) => {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(label + ": 5000ms 진단 기한 초과");
          error.name = "StudioGpuDiagnosticTimeoutError";
          error.code = "STUDIO_GPU_DIAGNOSTIC_TIMEOUT";
          reject(error);
        }, 5000);
      })]);
    } finally { clearTimeout(timer); }
  };
  const snapshot = () => {
    const telemetry = window.__studioFiveHourTelemetry;
    return { ...data, atMs: performance.now(), deviceLost: data.lost.length > 0,
      telemetry: telemetry ? { sessionId: telemetry.sessionId, pageEpoch: telemetry.pageEpoch,
        gpuObserverAvailable: telemetry.gpuObserverAvailable, errors: telemetry.errors.slice(), gpu: telemetry.gpu.slice() } : null };
  };
  window.__studioGpuDiagnostic = {
    async initialize(input) {
      data.phase = "initializing";
      surface = input.surface;
      const gpu = navigator.gpu;
      if (!window.isSecureContext) throw new Error("진단 origin이 secure context가 아닙니다.");
      if (!gpu) throw new Error("navigator.gpu가 없습니다.");
      const adapter = await wait(gpu.requestAdapter({ powerPreference: "high-performance" }), "requestAdapter");
      if (!adapter) throw new Error("WebGPU adapter가 없습니다.");
      const info = adapter.info;
      data.adapter = { vendor: info?.vendor ?? null, architecture: info?.architecture ?? null,
        device: info?.device ?? null, description: info?.description ?? null,
        isFallbackAdapter: info?.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null,
        features: [...adapter.features].sort() };
      device = await wait(adapter.requestDevice({ label: input.caseId + ":device-1" }), "requestDevice");
      data.deviceId = input.caseId + ":device-1";
      data.device = { label: device.label, features: [...device.features].sort(),
        maxTextureDimension2D: device.limits.maxTextureDimension2D, maxBufferSize: device.limits.maxBufferSize };
      device.lost.then((info) => data.lost.push({ atMs: performance.now(), phase: data.phase,
        deviceId: data.deviceId, reason: String(info.reason), message: String(info.message) }));
      device.addEventListener("uncapturederror", (event) => data.uncapturedErrors.push({ atMs: performance.now(),
        phase: data.phase, deviceId: data.deviceId, error: describe(event.error) }));
      format = gpu.getPreferredCanvasFormat();
      if (format !== "rgba8unorm" && format !== "bgra8unorm") throw new Error("지원하지 않는 진단 표시 형식: " + format);
      const canvas = document.getElementById("probe");
      canvas.hidden = surface !== "canvas";
      if (surface === "canvas") {
        context = canvas.getContext("webgpu");
        if (!context) throw new Error("GPUCanvasContext가 없습니다.");
        context.configure({ device, format, alphaMode: "premultiplied",
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      }
      data.phase = "ready";
      return snapshot();
    },
    markPhase(phase) { data.phase = phase; return snapshot(); },
    snapshot,
    async operate(phase) {
      data.phase = phase;
      const startedAtMs = performance.now();
      if (!device) throw new Error("후속 연산에 사용할 device가 없습니다.");
      let texture = null, buffer = null, mapped = false, result = null;
      const errors = [];
      let pushedScopes = 0;
      try {
        for (const filter of ["validation", "out-of-memory", "internal"]) { device.pushErrorScope(filter); pushedScopes++; }
        texture = surface === "canvas" ? context.getCurrentTexture() : device.createTexture({
          label: phase + ":offscreen", size: [64, 64], format,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
        buffer = device.createBuffer({ label: phase + ":readback", size: 64 * 256,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const encoder = device.createCommandEncoder({ label: phase + ":clear-and-readback" });
        const color = phase === "before-gc" ? { r: 1, g: 0, b: 0, a: 1 } : { r: 0, g: 1, b: 0, a: 1 };
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: texture.createView(), clearValue: color,
          loadOp: "clear", storeOp: "store" }] });
        pass.end();
        encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: 256, rowsPerImage: 64 }, [64, 64]);
        device.queue.submit([encoder.finish()]);
        await wait(device.queue.onSubmittedWorkDone(), "onSubmittedWorkDone");
        await wait(buffer.mapAsync(GPUMapMode.READ), "mapAsync");
        mapped = true;
        result = { format, width: 64, height: 64, pixels: Array.from(new Uint8Array(buffer.getMappedRange())) };
        if (surface === "canvas") {
          await wait(new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))), "canvas presentation frame");
        }
      } catch (error) { errors.push(describe(error)); }
      finally {
        if (mapped) { try { buffer.unmap(); } catch (error) { errors.push(describe(error)); } }
        if (buffer) { try { buffer.destroy(); } catch (error) { errors.push(describe(error)); } }
        if (texture && surface !== "canvas") { try { texture.destroy(); } catch (error) { errors.push(describe(error)); } }
        for (let index = 0; index < pushedScopes; index++) {
          try { const error = await wait(device.popErrorScope(), "popErrorScope"); if (error) errors.push(describe(error)); }
          catch (error) { errors.push(describe(error)); }
        }
      }
      for (const error of errors) data.operationErrors.push({ phase, atMs: performance.now(), error });
      return { startedAtMs, endedAtMs: performance.now(), success: errors.length === 0 && data.lost.length === 0,
        errors, result, state: snapshot() };
    },
    async dispose() {
      data.phase = "intentional-cleanup";
      const errors = [];
      if (context) { try { context.unconfigure(); } catch (error) { errors.push(describe(error)); } }
      if (device) { try { device.destroy(); } catch (error) { errors.push(describe(error)); } }
      context = null; device = null;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { errors, state: snapshot() };
    },
  };
})()`;

function pixelEvidence(bytes: Uint8Array, width: number, height: number, phase: string) {
  const expected = phase === "before-gc" ? [255, 0, 0, 255] : [0, 255, 0, 255];
  let mismatchedPixels = 0;
  for (let index = 0; index < bytes.length; index += 4) {
    if (expected.some((value, channel) => bytes[index + channel] !== value)) mismatchedPixels += 1;
  }
  return { width, height, expectedRgba: expected, firstPixel: Array.from(bytes.slice(0, 4)), mismatchedPixels,
    exact: width === SIZE && height === SIZE && bytes.length === SIZE * SIZE * 4 && mismatchedPixels === 0 };
}

function saveReadback(value: unknown, out: string, caseId: string, phase: string): unknown {
  if (!record(value) || !record(value.result)) return value;
  const result = value.result;
  if (result.width !== SIZE || result.height !== SIZE || !Array.isArray(result.pixels)
    || result.pixels.length !== SIZE * SIZE * 4 || !result.pixels.every((byte: unknown) => typeof byte === "number" && Number.isInteger(byte) && byte >= 0 && byte <= 255)
    || (result.format !== "rgba8unorm" && result.format !== "bgra8unorm")) throw new Error("GPU readback 데이터 형식이 올바르지 않습니다.");
  const bytes = Buffer.from(result.pixels);
  if (result.format === "bgra8unorm") {
    for (let index = 0; index < bytes.length; index += 4) [bytes[index], bytes[index + 2]] = [bytes[index + 2]!, bytes[index]!];
  }
  const file = caseId + "-" + phase + "-readback.png";
  const encoded = Buffer.from(encodePng(new Image(SIZE, SIZE, { data: bytes, colorModel: "RGBA" })));
  writeFileSync(join(out, file), encoded);
  const evidence = pixelEvidence(bytes, SIZE, SIZE, phase);
  return { ...value, success: value.success === true && evidence.exact,
    result: { format: result.format, ...evidence, file, sha256: sha256(encoded) } };
}

async function stage(entry: DiagnosticCase, phase: string, run: () => Promise<unknown>, checkpoint: () => void): Promise<unknown> {
  const startedAt = new Date().toISOString();
  let value: unknown;
  try {
    value = await bounded(run(), phase, 30_000);
    const timeout = record(value) && Array.isArray(value.errors) ? value.errors.find(browserTimedOut) : null;
    if (record(timeout)) throw new BrowserDiagnosticError(timeout);
    entry.stages.push({ phase, startedAt, endedAt: new Date().toISOString(), outcome: "completed", value });
    if (record(value) && value.success === false) entry.failures.push(failure(phase, "연산·픽셀 또는 device 생존 검증 실패. 해당 stage의 원문을 확인하세요."));
    return value;
  } catch (error) {
    const detail = failure(phase, error);
    entry.failures.push(detail);
    entry.stages.push({ phase, startedAt, endedAt: new Date().toISOString(), outcome: "failed", value, error: detail });
    // Promise.race는 GPU/CDP 연산을 취소하지 않는다. 완료가 확인되지 않은 조건은 닫고 다음 독립 조건으로 이동한다.
    if (error instanceof DiagnosticTimeoutError || error instanceof errors.TimeoutError || browserTimedOut(error)) throw error;
    return null;
  } finally { checkpoint(); }
}

async function browserMethod(page: Page, method: "initialize" | "markPhase" | "snapshot" | "operate" | "dispose", argument?: unknown): Promise<unknown> {
  // Playwright의 Error 직렬화에 사용자 code 보존을 맡기지 않고 거절 값도 명시적 데이터로 전달한다.
  const envelope: unknown = await bounded(page.evaluate(`(async () => {
    try {
      return { protocol: "studio-gpu-diagnostic-result", success: true,
        value: await window.__studioGpuDiagnostic.${method}(${argument === undefined ? "" : JSON.stringify(argument)}) };
    } catch (error) {
      return { protocol: "studio-gpu-diagnostic-result", success: false,
        error: { name: error?.name ?? "Error", code: error?.code ?? null,
          message: error?.message ?? String(error), stack: error?.stack ?? null },
        state: window.__studioGpuDiagnostic?.snapshot() ?? null };
    }
  })()`), method, 25_000);
  if (!record(envelope) || envelope.protocol !== "studio-gpu-diagnostic-result") throw new Error("브라우저 GPU 진단 응답 계약이 올바르지 않습니다.");
  if (envelope.success === false && record(envelope.error)) throw new BrowserDiagnosticError({ ...envelope.error, state: envelope.state });
  if (envelope.success !== true) throw new Error("브라우저 GPU 진단 결과 상태가 없습니다.");
  return envelope.value;
}

function recordStateFailures(entry: DiagnosticCase, state: unknown, phase: string): void {
  if (!record(state)) { entry.failures.push(failure(phase, "device 상태 증거가 없습니다.")); return; }
  for (const field of ["lost", "uncapturedErrors", "operationErrors"] as const) {
    const events = state[field];
    if (!Array.isArray(events)) { entry.failures.push(failure(phase + "." + field, "device 이벤트 배열이 없습니다.")); continue; }
    const failures = field === "lost" ? events.filter((event: unknown) => !record(event) || event.reason !== "destroyed"
      || phase !== "after-cleanup" || event.phase !== "intentional-cleanup") : events;
    if (failures.length > 0) entry.failures.push(failure(phase + "." + field, JSON.stringify(failures)));
  }
  const telemetry = state.telemetry;
  if (!entry.telemetryWrapper) return;
  if (!record(telemetry) || telemetry.sessionId !== entry.id || telemetry.gpuObserverAvailable !== true
    || !Array.isArray(telemetry.errors) || telemetry.errors.length > 0 || !Array.isArray(telemetry.gpu)) {
    entry.failures.push(failure(phase + ".telemetry-wrapper", "기존 소크 wrapper가 준비되지 않았거나 수집 오류가 있습니다."));
  } else {
    const failures = telemetry.gpu.filter((event: unknown) => !Array.isArray(event) || event[1] !== "lost"
      || event[2] !== "destroyed" || phase !== "after-cleanup");
    if (failures.length > 0) entry.failures.push(failure(phase + ".telemetry-gpu", JSON.stringify(failures)));
  }
}

async function runCase(entry: DiagnosticCase, origin: string, out: string, checkpoint: () => void): Promise<void> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let intentionalClose = false;
  try {
    browser = await chromium.launch({ headless: true, args: [...entry.requestedLaunchArgs], timeout: 15_000 });
    entry.browserVersion = browser.version();
    browser.on("disconnected", () => {
      if (!intentionalClose) entry.failures.push(failure("browser-disconnected", "진단 도중 Chromium 연결이 끊겼습니다."));
    });
    const browserCdp = await browser.newBrowserCDPSession();
    await stage(entry, "browser-metadata", async () => {
      const args = await bounded(browserCdp.send("Browser.getBrowserCommandLine"), "browser command line");
      entry.actualLaunchArgs = args.arguments;
      entry.browserProtocolVersion = await bounded(browserCdp.send("Browser.getVersion"), "browser version");
      return { actualLaunchArgs: entry.actualLaunchArgs, version: entry.browserProtocolVersion };
    }, checkpoint);
    context = await browser.newContext({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(OPERATION_TIMEOUT_MS);
    const activePage = page;
    page.on("console", (message) => {
      if (entry.consoleEvents.length < MAX_CONSOLE_EVENTS) entry.consoleEvents.push({ at: new Date().toISOString(), type: message.type(), text: message.text() });
      else entry.consoleEventsDropped += 1;
    });
    page.on("pageerror", (error) => entry.pageErrors.push(failure("pageerror", error)));
    page.on("crash", () => entry.failures.push(failure("page-crash", "진단 페이지가 충돌했습니다.")));
    if (entry.telemetryWrapper) await installGpuAndPerfCollector(page, entry.id);
    await page.goto(origin, { waitUntil: "load", timeout: OPERATION_TIMEOUT_MS });
    await page.evaluate(BROWSER_PROBE);
    const cdp = await context.newCDPSession(page);
    await stage(entry, "initialize", () => browserMethod(activePage, "initialize", { caseId: entry.id, surface: entry.surface }), checkpoint);
    for (const phase of ["before-gc", "after-gc"] as const) {
      if (phase === "after-gc") {
        await stage(entry, "forced-gc", async () => {
          const before = await browserMethod(activePage, "markPhase", "forced-gc");
          const beforeHeap = await bounded(cdp.send("Runtime.getHeapUsage"), "before GC heap");
          const invokedAt = new Date().toISOString();
          await bounded(cdp.send("HeapProfiler.collectGarbage"), "forced GC");
          const completedAt = new Date().toISOString();
          const afterHeap = await bounded(cdp.send("Runtime.getHeapUsage"), "after GC heap");
          await activePage.waitForTimeout(100);
          return { invokedAt, completedAt, beforeHeap, afterHeap, before, after: await browserMethod(activePage, "snapshot") };
        }, checkpoint);
      }
      await stage(entry, phase, async () => saveReadback(await browserMethod(activePage, "operate", phase), out, entry.id, phase), checkpoint);
      if (entry.surface === "canvas") {
        await stage(entry, phase + "-presentation", async () => {
          const file = entry.id + "-" + phase + "-canvas.png";
          const bytes = await activePage.locator("#probe").screenshot({ path: join(out, file), timeout: OPERATION_TIMEOUT_MS });
          const png = decodePng(bytes).convertColor("RGBA").getRawImage();
          const evidence = pixelEvidence(new Uint8Array(png.data), png.width, png.height, phase);
          return { success: evidence.exact, ...evidence, file, sha256: sha256(bytes) };
        }, checkpoint);
      }
    }
    const final = await stage(entry, "before-cleanup", () => browserMethod(activePage, "snapshot"), checkpoint);
    recordStateFailures(entry, final, "before-cleanup");
    await stage(entry, "intentional-cleanup", async () => {
      const value = await browserMethod(activePage, "dispose");
      if (!record(value) || !Array.isArray(value.errors)) throw new Error("명시적 device 정리 증거가 없습니다.");
      recordStateFailures(entry, value.state, "after-cleanup");
      return { ...value, success: value.errors.length === 0 };
    }, checkpoint);
  } catch (error) { entry.failures.push(failure("case-interrupted", error)); }
  finally {
    intentionalClose = true;
    if (context) { try { await bounded(context.close(), "context close"); } catch (error) { entry.failures.push(failure("context-close", error)); } }
    if (browser) { try { await bounded(browser.close(), "browser close"); } catch (error) { entry.failures.push(failure("browser-close", error)); } }
    entry.failures.push(...entry.pageErrors);
    if (entry.consoleEventsDropped > 0) entry.failures.push(failure("console-overflow", "진단 console 표본 " + entry.consoleEventsDropped + "개를 보관하지 못했습니다."));
    entry.environmentAfter = environment();
    entry.endedAt = new Date().toISOString();
    entry.status = entry.failures.length === 0 ? "no-failure-observed" : "observed-failure";
    checkpoint();
  }
}

async function main(): Promise<void> {
  new Script(BROWSER_PROBE, { filename: "studio-soak-gpu-diagnostic-browser.js" });
  const runId = new Date().toISOString().replace(/[:.]/gu, "-") + "-" + randomUUID().slice(0, 8);
  const out = join(resolve(ROOT, process.env.TOONSTUDIO_SOAK_GPU_DIAGNOSTIC_OUT ?? "/tmp/studio-soak-gpu-diagnostic"), runId);
  mkdirSync(out, { recursive: true });
  const report = {
    schemaVersion: 1, diagnosticOnly: true, productAcceptanceEvaluated: false, physicalDeviceCertified: false,
    purpose: "동일 Chromium의 software flags·표시 표면·기존 telemetry wrapper와 forced GC 전후 device 생존을 분리한다.",
    runId, startedAt: new Date().toISOString(), endedAt: null as string | null, status: "running",
    sourceCommit: execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceDirty: execFileSync("git", ["-C", ROOT, "status", "--porcelain"], { encoding: "utf8" }).trim().length > 0,
    scriptSha256: sha256(readFileSync(SCRIPT_FILE)), telemetrySourceSha256: sha256(readFileSync(join(ROOT, "scripts/lib/studio-soak-telemetry.ts"))),
    executablePath: chromium.executablePath(), metadataLaunchArgs: METADATA_LAUNCH_ARGS, environment: environment(), origin: null as string | null,
    nativeGpuStderr: "직접 수집하지 않음. DEBUG=pw:browser 실행 로그를 함께 보존해야 native GPU 프로세스 원문을 확인할 수 있습니다.",
    expectedCases: CONFIGURATIONS.length * 4, cases: [] as DiagnosticCase[], failures: [] as Failure[],
  };
  const checkpoint = () => {
    const file = join(out, "report.json");
    writeFileSync(file + ".tmp", JSON.stringify(report, null, 2) + "\n");
    renameSync(file + ".tmp", file);
  };
  const server = createServer((request, response) => {
    if (request.url === "/favicon.ico") { response.writeHead(204); response.end(); return; }
    if (request.url !== "/") { response.writeHead(404); response.end("not found"); return; }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end('<!doctype html><html><head><meta charset="utf-8"><title>WebGPU diagnostic only</title><style>html,body{margin:0;background:#000}canvas{display:block;width:64px;height:64px}canvas[hidden]{display:none}</style></head><body><canvas id="probe" width="64" height="64"></canvas></body></html>');
  });
  checkpoint();
  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", () => { server.off("error", rejectListen); resolveListen(); });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("loopback HTTP 주소를 확인할 수 없습니다.");
    report.origin = "http://127.0.0.1:" + address.port + "/";
    for (const configuration of CONFIGURATIONS) {
      for (const surface of ["offscreen", "canvas"] as const) {
        for (const telemetryWrapper of [false, true]) {
          const entry: DiagnosticCase = {
            id: configuration.id + "-" + surface + "-wrapper-" + (telemetryWrapper ? "on" : "off"),
            configuration: configuration.id, surface, telemetryWrapper, requestedLaunchArgs: [...configuration.args, ...METADATA_LAUNCH_ARGS],
            actualLaunchArgs: null, browserVersion: null, browserProtocolVersion: null,
            startedAt: new Date().toISOString(), endedAt: null, status: "running", consoleEvents: [], consoleEventsDropped: 0,
            pageErrors: [], stages: [], failures: [], environmentBefore: environment(), environmentAfter: null,
          };
          report.cases.push(entry); checkpoint();
          await runCase(entry, report.origin, out, checkpoint);
          process.stdout.write(entry.id + ": " + entry.status + "\n");
        }
      }
    }
  } catch (error) { report.failures.push(failure("diagnostic-run", error)); }
  finally {
    try { await bounded(new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose())), "loopback server close"); }
    catch (error) { report.failures.push(failure("loopback-close", error)); }
    report.endedAt = new Date().toISOString();
    report.status = report.failures.length === 0 && report.cases.length === report.expectedCases ? "completed" : "incomplete";
    checkpoint();
    process.stdout.write("진단 전용 보고서: " + join(out, "report.json") + "\n제품 acceptance는 평가하지 않았습니다.\n");
    if (report.status !== "completed" || report.cases.some((entry) => entry.failures.length > 0)) process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_FILE) await main();
