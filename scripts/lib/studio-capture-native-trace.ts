import { createHash } from "node:crypto";

/** 기존 프레임·타이밍 이벤트만 관측한다. screenshot·강제 BeginFrame·추가 rAF는 요청하지 않는다. */
export const STUDIO_CAPTURE_NATIVE_TRACE_START_OPTIONS = Object.freeze({
  categories: "devtools.timeline,blink.user_timing,cc,viz",
  transferMode: "ReturnAsStream" as const,
  streamFormat: "json" as const,
  streamCompression: "none" as const,
});
export type StudioCaptureNativeTraceStartOptions = typeof STUDIO_CAPTURE_NATIVE_TRACE_START_OPTIONS;
export interface StudioCaptureNativeTraceCompletion {
  readonly stream?: string;
  readonly dataLossOccurred?: boolean;
}
export interface StudioCaptureNativeTraceSession {
  start(options: StudioCaptureNativeTraceStartOptions): Promise<unknown>;
  /** 어댑터는 tracingComplete listener를 Tracing.end보다 먼저 등록한다. */
  stop(): Promise<StudioCaptureNativeTraceCompletion>;
  read(stream: string, size: number): Promise<{ readonly data: string; readonly base64Encoded?: boolean; readonly eof: boolean }>;
  close(stream: string): Promise<unknown>;
  detach(): Promise<unknown>;
}
export interface StudioCaptureNativeTraceCollector {
  createSession(): Promise<StudioCaptureNativeTraceSession>;
  attach(name: string, body: string): Promise<unknown>;
}

const MAX_TRACE_BYTES = 16 * 1024 * 1024;
const DEADLINE_MS = 2_000;
const CLEANUP_GRACE_MS = 2_000;
const CATEGORIES = new Set(["devtools.timeline", "blink.user_timing", "cc", "viz", "gpu", "__metadata"]);
const PROCESS_NAMES = new Set(["Browser", "Renderer", "GPU Process"]);
const THREAD_NAMES = new Set(["CrRendererMain", "CrBrowserMain", "CrGpuMain", "VizCompositorThread", "Compositor", "CompositorGpuThread", "Chrome_IOThread", "Chrome_InProcGpuThread"]);
const CAPTURE_NUMBERS = ["attemptId", "elapsedMs", "timeoutMs", "frameCount", "assetCount", "rasterCount"];
const CAPTURE_BOOLEANS = ["stagePresent", "renderedPageMatches", "commitChecked", "commitPageMatches", "historyIndexMatches", "pageObjectMatches", "exporting", "masterEditMode", "fontsReady", "assetsReady", "wetPaperWaited", "skiaInjected", "snapshotUnavailable"];
const CAPTURE_PHASES = new Set([
  "started", "commit-stage-wait", "commit-observed", "fonts-assets-wait", "fonts-ready", "assets-ready", "paint-wait",
  "wet-paper-wait", "wet-paper-ready", "raster-wait", "raster-ready", "ready", "failed", "watermark-wait", "watermark-ready",
  "readiness-wait", "readiness-ready", "skia-import-wait", "skia-import-ready", "skia-capture-wait", "skia-captured",
  "skia-unsupported", "skia-unavailable", "skia-failed", "compatibility-capture-start", "compatibility-capture-ready",
  "grade-start", "grade-ready", "encode-module-wait", "encode-module-ready", "encode-start", "encode-ready",
  "download-start", "download-dispatched", "shared-document-blocked", "watermark-draw-start", "watermark-draw-ready",
]);
const ID_FIELDS = /^(?:frame|frameId|frame_id|frameTreeNodeId|frameToken|frame_token|localFrameToken|layerTreeId|frameSinkId|surfaceId|id|id_ref|trace_id)$/u;
type JsonRecord = Record<string, unknown>;
const record = (value: unknown): value is JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const own = (value: unknown, key: string): unknown => record(value) ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;

function identifier(value: unknown): number | string | undefined {
  if (finite(value)) return value;
  if (typeof value !== "string" || !/^(?:0x)?[a-fA-F0-9_.:-]{1,128}$/u.test(value)) return undefined;
  // Chrome Trace/Perfetto flow importer가 읽을 수 있는 uint64 hexadecimal 형식을 유지한다.
  return `0x${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

/** 임의 문자열·URL·경로·getter를 버리고 수치/boolean 및 프레임 관계만 남긴다. */
function numericArgs(value: unknown, depth = 0): unknown {
  if (finite(value) || typeof value === "boolean") return value;
  if (depth >= 4) return undefined;
  if (Array.isArray(value)) {
    const values: unknown[] = [];
    for (let index = 0; index < Math.min(value.length, 64); index++) {
      const item = numericArgs(Object.getOwnPropertyDescriptor(value, String(index))?.value, depth + 1);
      if (item !== undefined) values.push(item);
    }
    return values.length ? values : undefined;
  }
  if (!record(value)) return undefined;
  const output: JsonRecord = {};
  for (const key of Object.keys(value).slice(0, 64)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/u.test(key) || /url|path|name|title|text|detail|snapshot/iu.test(key)) continue;
    const raw = own(value, key);
    const safe = ID_FIELDS.test(key) && typeof raw === "string" ? identifier(raw) : numericArgs(raw, depth + 1);
    if (safe !== undefined) output[key] = safe;
  }
  return Object.keys(output).length ? output : undefined;
}

function markDetail(args: unknown, cache: boolean): JsonRecord | undefined {
  let detail = own(own(args, "data"), "detail") ?? own(args, "detail");
  // Chromium user timing의 detail은 JSON 문자열로 전달될 수도 있다. 허용 schema만 다시 뽑는다.
  if (typeof detail === "string" && Buffer.byteLength(detail) <= 4_096) {
    try { detail = JSON.parse(detail); } catch { return undefined; }
  }
  if (!record(detail)) return undefined;
  const output: JsonRecord = {};
  for (const key of cache ? ["elapsedMs"] : CAPTURE_NUMBERS) {
    const value = own(detail, key);
    if (finite(value) && value >= 0) output[key] = value;
  }
  for (const key of cache ? ["isCached", "failed"] : CAPTURE_BOOLEANS) {
    const value = own(detail, key);
    if (typeof value === "boolean") output[key] = value;
  }
  if (cache) {
    const kind = own(detail, "kind"), reason = own(detail, "reason");
    if (kind === "clip" || kind === "blend") output.kind = kind;
    if (reason === "initial" || reason === "timer" || reason === "raster") output.reason = reason;
    const rectangle: JsonRecord = {};
    for (const key of ["x", "y", "width", "height"]) {
      const value = own(own(detail, "rect"), key);
      if (finite(value) && ((key !== "width" && key !== "height") || value >= 0)) rectangle[key] = value;
    }
    if (Object.keys(rectangle).length) output.rect = rectangle;
  } else {
    const domain = own(detail, "domain"), phase = own(detail, "phase");
    if (domain === "readiness" || domain === "raster-export") output.domain = domain;
    if (typeof phase === "string" && CAPTURE_PHASES.has(phase)) output.phase = phase;
  }
  return Object.keys(output).length ? output : undefined;
}

function sanitizeTrace(input: unknown) {
  const events = own(input, "traceEvents");
  if (!Array.isArray(events) || events.length > 200_000) throw new Error("native trace 이벤트 형식 또는 개수 한도를 확인해 주세요.");
  const traceEvents: JsonRecord[] = [];
  let captureDetailsOmitted = 0;
  for (const event of events) {
    const name = own(event, "name"), category = own(event, "cat"), phase = own(event, "ph");
    if (typeof name !== "string" || typeof category !== "string" || typeof phase !== "string" || !/^[BEXIibenSTFstfRPMCNDOV]$/u.test(phase)) continue;
    const cats = category.split(",").filter((part) => CATEGORIES.has(part));
    if (!cats.length || !finite(own(event, "ts")) || !finite(own(event, "pid")) || !finite(own(event, "tid"))) continue;
    const capture = /^toonstudio:capture:\d+:\d+$/u.test(name);
    const cache = /^toonstudio:raster-cache:\d+:(?:start|end)$/u.test(name);
    if (cats.includes("blink.user_timing") && !capture && !cache) continue;
    if (!capture && !cache && !/^[a-zA-Z0-9_][a-zA-Z0-9_.:() -]{0,159}$/u.test(name)) continue;
    const safe: JsonRecord = { name, cat: cats.join(","), ph: phase };
    for (const key of ["ts", "dur", "tts", "tdur", "pid", "tid", "ticount", "tidelta"]) {
      const value = own(event, key);
      if (finite(value)) safe[key] = value;
    }
    for (const key of ["id", "bind_id"]) {
      const value = identifier(own(event, key));
      if (value !== undefined) safe[key] = value;
    }
    const id2: JsonRecord = {};
    for (const key of ["local", "global"]) {
      const value = identifier(own(own(event, "id2"), key));
      if (value !== undefined) id2[key] = value;
    }
    if (Object.keys(id2).length) safe.id2 = id2;
    for (const key of ["flow_in", "flow_out"]) if (typeof own(event, key) === "boolean") safe[key] = own(event, key);
    const bp = own(event, "bp"), scope = own(event, "s");
    if (bp === "e" || bp === "s") safe.bp = bp;
    if (scope === "g" || scope === "p" || scope === "t") safe.s = scope;
    const flowScope = own(event, "scope");
    if (typeof flowScope === "string" && /^[a-zA-Z0-9_.:-]{1,128}$/u.test(flowScope)) {
      safe.scope = `scope:${createHash("sha256").update(flowScope).digest("hex").slice(0, 24)}`;
    }
    const args = own(event, "args");
    if (capture || cache) {
      const detail = markDetail(args, cache);
      if (detail) safe.args = { data: { detail } };
      else captureDetailsOmitted++;
    } else {
      const numeric = numericArgs(args);
      const safeArgs: JsonRecord = record(numeric) ? numeric : {};
      // process/thread 종류는 아래 고정 Chrome 이름만 허용한다. 임의 제목은 남기지 않는다.
      const metadataName = own(args, "name");
      if (cats.includes("__metadata") && typeof metadataName === "string"
        && ((name === "process_name" && PROCESS_NAMES.has(metadataName))
          || (name === "thread_name" && THREAD_NAMES.has(metadataName)))) safeArgs.name = metadataName;
      if (Object.keys(safeArgs).length) safe.args = safeArgs;
    }
    traceEvents.push(safe);
  }
  return { traceEvents, nativeTrace: { schemaVersion: 1, sanitized: true, inputEvents: events.length,
    retainedEvents: traceEvents.length, droppedEvents: events.length - traceEvents.length, captureDetailsOmitted } };
}

/** trace의 시간·흐름 관계와 허용 mark만 보존한다. 원본 JSON/metadata는 첨부하지 않는다. */
function serializedTrace(input: unknown) {
  const safe = sanitizeTrace(input);
  const body = JSON.stringify(safe);
  if (Buffer.byteLength(body) > MAX_TRACE_BYTES) throw new Error("native trace 진단 자료가 16MiB를 넘었습니다.");
  return { body, incomplete: safe.nativeTrace.retainedEvents === 0 || safe.nativeTrace.captureDetailsOmitted > 0 };
}
export function serializeStudioCaptureNativeTrace(input: unknown): string {
  return serializedTrace(input).body;
}

class TraceDeadlineError extends Error {}
class TraceReadLimitError extends Error {}
async function within<T>(pending: Promise<T>, timeoutMs = DEADLINE_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TraceDeadlineError("native trace 관측 응답 시간이 초과됐습니다.")), Math.max(0, timeoutMs));
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
async function readTrace(session: StudioCaptureNativeTraceSession, stream: string): Promise<string> {
  const expires = Date.now() + DEADLINE_MS;
  const chunks: Buffer[] = [];
  let bytes = 0;
  for (let index = 0; index < 512; index++) {
    const remaining = expires - Date.now();
    if (remaining <= 0) throw new TraceDeadlineError("native trace 읽기 시간이 초과됐습니다.");
    const chunk = await within(Promise.resolve().then(() => session.read(stream, Math.min(65_536, MAX_TRACE_BYTES - bytes + 1))), remaining);
    if (typeof chunk.data !== "string" || chunk.data.length > Math.ceil(MAX_TRACE_BYTES * 4 / 3) + 4) throw new TraceReadLimitError();
    if (chunk.base64Encoded && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(chunk.data)) throw new Error("native trace base64 형식을 확인해 주세요.");
    const buffer = Buffer.from(chunk.data, chunk.base64Encoded ? "base64" : "utf8");
    bytes += buffer.byteLength;
    if (bytes > MAX_TRACE_BYTES) throw new TraceReadLimitError();
    chunks.push(buffer);
    if (chunk.eof) return Buffer.concat(chunks).toString("utf8");
  }
  throw new TraceReadLimitError();
}

/** 관측 실패는 실제 작업의 단일 실행과 결과·오류를 바꾸지 않는다. */
export async function withStudioCaptureNativeTrace<T>(
  enabled: boolean, collector: StudioCaptureNativeTraceCollector, name: string, operation: () => Promise<T>,
): Promise<T> {
  if (!enabled) return operation();
  const label = name.replace(/[^a-zA-Z0-9_.-]/gu, "-").slice(0, 100) || "capture";
  const status = { started: false, traceSaved: false, unavailable: false, incomplete: false, cleanupFailed: false,
    cleanupIncomplete: false, startTimedOut: false, stopTimedOut: false, readTimedOut: false, readLimitExceeded: false,
    dataLossOccurred: false };
  let session: StudioCaptureNativeTraceSession | undefined;
  let start: Promise<unknown> | undefined;
  let stop: Promise<StudioCaptureNativeTraceCompletion> | undefined;
  const closed = new Set<string>();
  const detached = new WeakSet<StudioCaptureNativeTraceSession>();
  const attach = async (suffix: string, body: string) => {
    try { await within(Promise.resolve().then(() => collector.attach(label + suffix, body))); return true; }
    catch { return false; }
  };
  const detach = async (value: StudioCaptureNativeTraceSession) => {
    if (detached.has(value)) return;
    detached.add(value);
    try { await within(Promise.resolve().then(() => value.detach())); } catch { status.cleanupFailed = true; }
  };
  const close = async (value: StudioCaptureNativeTraceSession, stream?: string) => {
    if (!stream || closed.has(stream)) return;
    closed.add(stream);
    try { await within(Promise.resolve().then(() => value.close(stream))); } catch { status.cleanupFailed = true; }
  };
  const stopOnce = (value: StudioCaptureNativeTraceSession) => stop ??= Promise.resolve().then(() => value.stop());
  const lateStop = async (value: StudioCaptureNativeTraceSession) => {
    try { const completed = await within(stopOnce(value)); await close(value, completed.stream); }
    catch { status.cleanupIncomplete = true; }
    await detach(value);
  };
  const creation = Promise.resolve().then(() => collector.createSession());
  try {
    try { session = await within(creation); }
    catch {
      status.cleanupIncomplete = true;
      void creation.then(detach, () => undefined);
      throw new Error("native trace 연결을 준비하지 못했습니다.");
    }
    const value = session;
    start = Promise.resolve().then(() => value.start(STUDIO_CAPTURE_NATIVE_TRACE_START_OPTIONS));
    await within(start);
    status.started = true;
  } catch (error) {
    status.unavailable = true; status.incomplete = true;
    status.startTimedOut = error instanceof TraceDeadlineError;
  }
  try {
    return await operation();
  } finally {
    if (session) {
      const value = session;
      let confirmedStart = status.started;
      if (start && !confirmedStart) {
        try { await within(start, CLEANUP_GRACE_MS); confirmedStart = true; }
        catch (error) {
          if (error instanceof TraceDeadlineError) {
            status.cleanupIncomplete = true;
            // grace 밖 응답의 정리도 시도하지만 detach 뒤 성공을 보장할 수 없어 이력은 남긴다.
            void start.then(() => lateStop(value), () => undefined);
          }
        }
      }
      let completion: StudioCaptureNativeTraceCompletion | undefined;
      if (confirmedStart) {
        const pending = stopOnce(value);
        try { completion = await within(pending); }
        catch (error) {
          status.unavailable = true; status.incomplete = true; status.stopTimedOut = error instanceof TraceDeadlineError;
          if (status.stopTimedOut) {
            try { completion = await within(pending, CLEANUP_GRACE_MS); }
            catch {
              status.cleanupIncomplete = true;
              void pending.then(async (late) => { await close(value, late.stream); }, () => undefined);
            }
          } else status.cleanupIncomplete = true;
        }
      }
      if (completion) {
        status.dataLossOccurred = completion.dataLossOccurred === true;
        status.incomplete ||= status.dataLossOccurred;
        if (!completion.stream) {
          status.unavailable = true; status.incomplete = true;
        } else {
          try {
            const raw = await readTrace(value, completion.stream);
            const safe = serializedTrace(JSON.parse(raw));
            status.incomplete ||= safe.incomplete;
            status.traceSaved = await attach(".native-trace.json", safe.body);
            if (!status.traceSaved) { status.unavailable = true; status.incomplete = true; }
          } catch (error) {
            status.unavailable = true; status.incomplete = true;
            status.readTimedOut = error instanceof TraceDeadlineError;
            status.readLimitExceeded = error instanceof TraceReadLimitError;
          } finally { await close(value, completion.stream); }
        }
      }
      await detach(value);
    }
    await attach(".native-trace-observation.json", JSON.stringify(status));
  }
}
