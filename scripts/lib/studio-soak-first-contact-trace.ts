import { createHash } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { summarizeStudioFirstContactTrace } from "./studio-soak-first-contact-trace-evidence";
import { armStudioFirstContactTrace, finishStudioFirstContactTraceProbe, studioFirstContactTraceProbeSource } from "./studio-soak-first-contact-trace-probe";

import type { StudioFirstContactTracePage } from "./studio-soak-first-contact-trace-probe";
import type { CDPSession } from "playwright";

export const STUDIO_FIRST_CONTACT_TRACE_CATEGORIES = Object.freeze([
  "toplevel", "devtools.timeline", "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.stack", "blink.user_timing", "v8",
]);
const TRACE_FILE = "diagnostic-first-contact.trace.json";
const METADATA_FILE = "diagnostic-first-contact-trace-metadata.json";
const MAX_TRACE_BYTES = 64 * 1024 * 1024;
const DEADLINE_MS = 30_000;
interface TraceCompletion { readonly stream?: string; readonly dataLossOccurred: boolean }
export interface StudioFirstContactTraceTransport {
  frameId(): Promise<string>;
  categories(): Promise<readonly string[]>;
  start(): Promise<unknown>;
  /** tracingComplete listener는 반드시 Tracing.end보다 먼저 등록한다. */
  stop(): Promise<TraceCompletion>;
  read(stream: string, size: number): Promise<{ data: string; eof: boolean; base64Encoded?: boolean }>;
  close(stream: string): Promise<unknown>;
  detach(): Promise<unknown>;
}
export interface StudioFirstContactTraceSource {
  readonly sourceCommit: string;
  readonly sourceDirty: boolean;
  readonly buildGitSha: string | null;
  readonly sessionId: string;
  readonly profile: string;
  readonly browserVersion: string | null;
  readonly browserLaunchArgs: readonly string[];
}

export function studioFirstContactTraceSource(source: StudioFirstContactTraceSource): StudioFirstContactTraceSource {
  return { sourceCommit: source.sourceCommit, sourceDirty: source.sourceDirty, buildGitSha: source.buildGitSha,
    sessionId: source.sessionId, profile: source.profile, browserVersion: source.browserVersion,
    browserLaunchArgs: [...source.browserLaunchArgs] };
}

export function createStudioFirstContactTraceTransport(cdp: CDPSession): StudioFirstContactTraceTransport {
  return {
    frameId: async () => (await cdp.send("Page.getFrameTree")).frameTree.frame.id,
    categories: async () => (await cdp.send("Tracing.getCategories")).categories,
    start: () => cdp.send("Tracing.start", { transferMode: "ReturnAsStream", streamFormat: "json", streamCompression: "none",
      bufferUsageReportingInterval: 1_000, traceConfig: { recordMode: "recordUntilFull", traceBufferSizeInKb: MAX_TRACE_BYTES / 1024,
        includedCategories: [...STUDIO_FIRST_CONTACT_TRACE_CATEGORIES], enableSampling: false } }),
    stop: () => new Promise<TraceCompletion>((resolve, reject) => {
      let settled = false;
      const cleanup = () => { clearTimeout(timer); cdp.off("Tracing.tracingComplete", complete); };
      const complete = (value: TraceCompletion) => {
        if (settled) return; settled = true; cleanup(); resolve(value);
      };
      const timer = setTimeout(() => {
        if (settled) return; settled = true; cleanup(); reject(new Error("첫 접촉 trace 종료 응답이 30초를 넘었습니다."));
      }, DEADLINE_MS);
      cdp.on("Tracing.tracingComplete", complete);
      void cdp.send("Tracing.end").catch((error: unknown) => {
        if (settled) return; settled = true; cleanup(); reject(error);
      });
    }),
    read: (handle, size) => cdp.send("IO.read", { handle, size }),
    close: (handle) => cdp.send("IO.close", { handle }),
    detach: () => cdp.detach(),
  };
}

async function within<T>(pending: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("첫 접촉 trace 수집 응답 시간이 초과됐습니다.")), timeoutMs);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

/** 작은 진단 실행의 원본·부분 스트림·오류를 보존한다. 실패를 정상 acceptance 자료로 바꾸지 않는다. */
export function createStudioFirstContactTrace(input: {
  page: StudioFirstContactTracePage;
  transport: StudioFirstContactTraceTransport;
  directory: string;
  source: StudioFirstContactTraceSource;
  captureScope?: { kind: "first-input-attempt"; maxCycles: 1; cycle: number; stopBoundary: string };
  limits?: { maxTraceBytes?: number; timeoutMs?: number };
}) {
  const { page, transport, directory } = input;
  const source = studioFirstContactTraceSource(input.source);
  const maxTraceBytes = input.limits?.maxTraceBytes ?? MAX_TRACE_BYTES;
  const timeoutMs = input.limits?.timeoutMs ?? DEADLINE_MS;
  if (!Number.isSafeInteger(maxTraceBytes) || maxTraceBytes < 1 || maxTraceBytes > MAX_TRACE_BYTES
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DEADLINE_MS) throw new Error("trace 수집 한도를 확인해 주세요.");
  const metadata = { schemaVersion: 1, diagnosticOnly: true, acceptanceProven: false, ...source,
    captureScope: input.captureScope ?? { kind: "armed-strokes", maxCycles: 64 },
    categories: [...STUDIO_FIRST_CONTACT_TRACE_CATEGORIES], requestedCategories: [...STUDIO_FIRST_CONTACT_TRACE_CATEGORIES],
    advertisedCategories: null as readonly string[] | null, missingRequestedCategories: null as readonly string[] | null,
    categoryEvidenceAuthority: "captured native RunTask/EventDispatch/UserTiming evidence; the advertised catalog can change as code paths are reached",
    mainFrameId: null as string | null, endFrameId: null as string | null,
    started: false, completed: false, dataLossOccurred: null as boolean | null,
    rawTraceFile: null as string | null, rawTraceBytes: 0, rawTraceSha256: null as string | null, streamComplete: false,
    probe: null as unknown, correlation: null as ReturnType<typeof summarizeStudioFirstContactTrace> | null, issues: [] as string[],
    limitation: "native trace와 CPU 표본 수집은 실행 비용을 바꾸며 진단 실행에만 사용한다. 50ms 성능 기준과 정상 acceptance는 그대로 둔다." };
  let traceStarted = false, probeAttempted = false, finished = false;
  let startPromise: Promise<unknown> | null = null;
  let finishing: Promise<typeof metadata> | null = null;
  const issue = (phase: string, error: unknown) => metadata.issues.push(`${phase}: ${String(error instanceof Error ? error.message : error).slice(0, 800)}`);
  const save = () => writeFileSync(join(directory, METADATA_FILE), `${JSON.stringify(metadata, null, 2)}\n`);
  const identity = () => ({ sessionId: source.sessionId, frameId: metadata.mainFrameId! });

  async function read(stream: string): Promise<Buffer> {
    const chunks: Buffer[] = [], hash = createHash("sha256");
    const deadline = Date.now() + timeoutMs;
    writeFileSync(join(directory, TRACE_FILE), Buffer.alloc(0)); metadata.rawTraceFile = TRACE_FILE;
    try {
      for (let count = 0; count < 1024; count += 1) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) throw new Error("trace 스트림 읽기 제한 시간을 넘었습니다.");
        const chunk = await within(transport.read(stream, Math.min(262_144, maxTraceBytes - metadata.rawTraceBytes + 1)), remainingMs);
        if (typeof chunk.data !== "string" || chunk.data.length > 1_048_576 || typeof chunk.eof !== "boolean"
          || (chunk.base64Encoded !== undefined && typeof chunk.base64Encoded !== "boolean")) throw new Error("trace 스트림 chunk 형식이 잘못되었습니다.");
        if (chunk.base64Encoded && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(chunk.data)) {
          throw new Error("trace 스트림 base64 형식이 잘못되었습니다.");
        }
        const buffer = Buffer.from(chunk.data, chunk.base64Encoded ? "base64" : "utf8");
        const retained = buffer.subarray(0, maxTraceBytes - metadata.rawTraceBytes);
        appendFileSync(join(directory, TRACE_FILE), retained); hash.update(retained); chunks.push(retained);
        metadata.rawTraceBytes += retained.byteLength;
        if (retained.byteLength !== buffer.byteLength) throw new Error("trace 스트림 바이트 상한을 넘었습니다. 부분 원본을 보존했습니다.");
        if (chunk.eof) { metadata.streamComplete = true; return Buffer.concat(chunks); }
        if (buffer.byteLength === 0) throw new Error("trace 스트림이 EOF 없이 빈 chunk를 반환했습니다.");
      }
      throw new Error("trace 스트림 chunk 개수 상한을 넘었습니다.");
    } finally { metadata.rawTraceSha256 = hash.digest("hex"); }
  }

  return {
    metadataFile: METADATA_FILE,
    async start() {
      if (startPromise || finished) throw new Error("첫 접촉 trace를 다시 시작할 수 없습니다.");
      save();
      try {
        if (!/^[a-f0-9]{40}$/u.test(source.sourceCommit) || source.sourceDirty || source.buildGitSha !== source.sourceCommit
          || !/^[a-zA-Z0-9-]{1,100}$/u.test(source.sessionId)) throw new Error("trace 소스·빌드·세션 정체성이 일치하지 않습니다.");
        metadata.mainFrameId = await within(transport.frameId(), timeoutMs);
        if (!metadata.mainFrameId) throw new Error("trace의 최상위 frame ID가 없습니다.");
        const categories = await within(transport.categories(), timeoutMs);
        if (!Array.isArray(categories) || categories.some((category) => typeof category !== "string")) throw new Error("trace 범주 목록 형식이 잘못되었습니다.");
        metadata.advertisedCategories = [...categories];
        metadata.missingRequestedCategories = STUDIO_FIRST_CONTACT_TRACE_CATEGORIES.filter((category) => !categories.includes(category));
        // Chromium GetCategories의 목록은 도달한 코드 경로에 따라 바뀐다. 실제 native 증거의 누락은 finish에서 거절한다.
        startPromise = transport.start().then((value) => { traceStarted = true; metadata.started = true; return value; });
        await within(startPromise, timeoutMs);
        probeAttempted = true;
        await within(page.evaluate(studioFirstContactTraceProbeSource(identity())), timeoutMs);
      } catch (error) { issue("start", error); throw error; }
      finally { save(); }
    },
    async armStroke(cycle: number, inputMode: string) {
      try {
        if (!traceStarted || finished) throw new Error("첫 접촉 trace가 활성 상태가 아닙니다.");
        if (input.captureScope && input.captureScope.cycle !== cycle) throw new Error("첫 입력 시도 trace의 획 범위를 벗어났습니다.");
        await within(armStudioFirstContactTrace(page, identity(), cycle, inputMode), timeoutMs);
      } catch (error) { issue("arm-stroke", error); save(); throw error; }
    },
    finish(): Promise<typeof metadata> {
      if (finishing) return finishing;
      finishing = (async () => {
        finished = true;
        let stream: string | undefined, raw: Buffer | null = null;
        try {
          if (probeAttempted) try { metadata.probe = await within(finishStudioFirstContactTraceProbe(page, identity()), timeoutMs); }
          catch (error) { issue("probe-cleanup", error); }
          if (metadata.mainFrameId) try {
            metadata.endFrameId = await within(transport.frameId(), timeoutMs);
            if (metadata.endFrameId !== metadata.mainFrameId) throw new Error("최상위 frame이 바뀌었습니다.");
          } catch (error) { issue("frame-identity", error); }
          if (startPromise && !traceStarted) try { await within(startPromise, timeoutMs); } catch (error) { issue("start-settlement", error); }
          if (traceStarted) try {
            const completed = await within(transport.stop(), timeoutMs);
            metadata.dataLossOccurred = completed.dataLossOccurred;
            if (completed.dataLossOccurred !== false) issue("trace-data-loss", "trace 자료 유실 여부가 false로 확인되지 않았습니다.");
            stream = completed.stream;
            if (!stream) throw new Error("완료 trace의 원본 스트림이 없습니다.");
            raw = await read(stream);
          } catch (error) { issue("trace-stop-or-read", error); }
          else issue("trace-not-started", "이 실행에서 시작된 trace가 없습니다.");
          if (raw) try {
            metadata.correlation = summarizeStudioFirstContactTrace(JSON.parse(raw.toString("utf8")), metadata.probe, identity());
          } catch (error) { issue("trace-correlation", error); }
        } finally {
          if (stream) try { await within(transport.close(stream), timeoutMs); } catch (error) { issue("stream-close", error); }
          try { await within(transport.detach(), timeoutMs); } catch (error) { issue("session-detach", error); }
          metadata.completed = metadata.started && metadata.streamComplete && metadata.dataLossOccurred === false
            && metadata.correlation !== null && metadata.issues.length === 0;
          save();
        }
        return metadata;
      })();
      return finishing;
    },
  };
}
