import { afterEach, describe, expect, it, vi } from "vitest";

import {
  serializeStudioCaptureNativeTrace, STUDIO_CAPTURE_NATIVE_TRACE_START_OPTIONS, withStudioCaptureNativeTrace,
} from "./studio-capture-native-trace";

import type { StudioCaptureNativeTraceCollector, StudioCaptureNativeTraceCompletion, StudioCaptureNativeTraceSession } from "./studio-capture-native-trace";

const event = (name: string, extra: Record<string, unknown> = {}) => ({
  name, cat: "devtools.timeline", ph: "X", ts: 10, dur: 4, pid: 2, tid: 3, ...extra,
});
const trace = { traceEvents: [event("RequestAnimationFrame", { args: { data: { id: 17 } } })] };
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("테스트 resolver가 준비되지 않았습니다."); };
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function setup(overrides: Partial<StudioCaptureNativeTraceSession> = {}) {
  const calls: string[] = [];
  const saved = new Map<string, string>();
  const session: StudioCaptureNativeTraceSession = {
    start: vi.fn(async () => { calls.push("start"); }),
    stop: vi.fn(async () => { calls.push("stop"); return { stream: "stream-private", dataLossOccurred: false }; }),
    read: vi.fn(async () => { calls.push("read"); return { data: JSON.stringify(trace), eof: true }; }),
    close: vi.fn(async () => { calls.push("close"); }),
    detach: vi.fn(async () => { calls.push("detach"); }),
    ...overrides,
  };
  const collector: StudioCaptureNativeTraceCollector = {
    createSession: vi.fn(async () => { calls.push("create"); return session; }),
    attach: vi.fn(async (name, body) => { saved.set(name, body); }),
  };
  const status = () => JSON.parse(saved.get("v2.png.native-trace-observation.json") ?? "{}");
  return { calls, saved, session, collector, status };
}
afterEach(() => { vi.useRealTimers(); });

describe("native trace의 정보 경계", () => {
  it("기존 rAF/Draw 시간·숫자 인자·flow와 frame 관계를 보존하고 문자열·원본 metadata는 버린다", () => {
    const input = { traceEvents: [
      event("RequestAnimationFrame", { ph: "I", id: "0xCAFE", id2: { local: "0xBEEF" }, bind_id: 9, flow_out: true, bp: "e", scope: "frame-flow",
        args: { data: { id: 17, frame: "CAFE0123", url: "https://secret.test/a", path: "/private/a", message: "원고 제목", nested: { ready: true, width: 12, secret: "값" } } } }),
      event("FireAnimationFrame", { ph: "s", ts: 20, id: "0xCAFE", id2: { local: "0xBEEF" }, flow_in: true,
        args: { data: { id: 17, frame: "CAFE0123" } } }),
      event("BeginFrame", { cat: "cc,viz", tts: 8, tdur: 2 }),
      event("https://private.test/name"),
    ], metadata: { secret: "/private/source" } };
    const body = serializeStudioCaptureNativeTrace(input), output = JSON.parse(body);
    expect(output.traceEvents).toHaveLength(3);
    expect(output.traceEvents[0]).toMatchObject({ ph: "I", ts: 10, dur: 4, pid: 2, tid: 3, bind_id: 9, flow_out: true, bp: "e", args: { data: { id: 17, nested: { ready: true, width: 12 } } } });
    expect(output.traceEvents[0].id).toMatch(/^0x[a-f0-9]{16}$/u);
    expect(output.traceEvents[0].id).toBe(output.traceEvents[1].id);
    expect(output.traceEvents[0].id2).toEqual(output.traceEvents[1].id2);
    expect(output.traceEvents[0].args.data.frame).toBe(output.traceEvents[1].args.data.frame);
    expect(body).not.toMatch(/https|private|secret|원고|CAFE|BEEF|frame-flow/u);
    expect(input.traceEvents[0]?.args).toHaveProperty("data.url");
  });


  it("flow id/bind_id 해시를 표준 importer가 읽는 uint64 hex로 유지하고 독립 관계를 구분한다", () => {
    const output = JSON.parse(serializeStudioCaptureNativeTrace({ traceEvents: [
      ...["s", "t", "f"].map((ph, index) => event("DrawFrame", { cat: "cc", ph, ts: 10 + index, id: "0x42", bind_id: "0xAB", id2: { global: "0x42" } })),
      event("DrawFrame", { cat: "cc", ph: "s", id: "0x43", bind_id: "0xAC" }),
    ] }));
    const [begin, step, end, other] = output.traceEvents;
    for (const row of output.traceEvents) for (const value of [row.id, row.bind_id]) {
      expect(value).toMatch(/^0x[a-f0-9]{16}$/u);
      const parsed = BigInt(value);
      expect(parsed).toBeGreaterThanOrEqual(0n);
      expect(parsed).toBeLessThan(1n << 64n);
    }
    expect(begin.id).toBe(step.id); expect(step.id).toBe(end.id);
    expect(begin.bind_id).toBe(step.bind_id); expect(step.bind_id).toBe(end.bind_id);
    expect(begin.id2.global).toBe(begin.id);
    expect(other.id).not.toBe(begin.id); expect(other.bind_id).not.toBe(begin.bind_id);
  });

  it("허용 capture/cache 이름의 구체 detail schema만 허용하고 임의 UserTiming은 버린다", () => {
    const output = JSON.parse(serializeStudioCaptureNativeTrace({ traceEvents: [
      event("toonstudio:capture:1:2", { cat: "blink.user_timing", ph: "R", args: { data: { detail: JSON.stringify({ domain: "readiness", phase: "paint-wait", attemptId: 1, elapsedMs: 3, fontsReady: true, assetCount: 0, error: "비밀", source: "file:///private", frameCount: -1 }) } } }),
      event("toonstudio:raster-cache:4:end", { cat: "blink.user_timing", ph: "R", args: { detail: { kind: "clip", reason: "timer", elapsedMs: 0.2, isCached: false, failed: false, rect: { x: -1, y: 2, width: 0, height: 0, src: "비밀" }, value: "원고" } } }),
      event("customer-project-name", { cat: "blink.user_timing", args: { data: { detail: { privateCount: 23 } } } }),
      event("toonstudio:capture:1:3", { cat: "blink.user_timing", args: { data: { detail: { domain: "private", phase: "https://private", elapsedMs: 4 } } } }),
    ] }));
    expect(output.traceEvents).toHaveLength(3);
    expect(output.traceEvents[0].args.data.detail).toEqual({ attemptId: 1, elapsedMs: 3, assetCount: 0, fontsReady: true, domain: "readiness", phase: "paint-wait" });
    expect(output.traceEvents[1].args.data.detail).toEqual({ elapsedMs: 0.2, isCached: false, failed: false, kind: "clip", reason: "timer", rect: { x: -1, y: 2, width: 0, height: 0 } });
    expect(output.traceEvents[2].args.data.detail).toEqual({ elapsedMs: 4 });
    expect(JSON.stringify(output)).not.toMatch(/비밀|원고|private|customer/u);
  });


  it("고정 process/thread 종류만 보존하고 동적 제목은 버린다", () => {
    const output = JSON.parse(serializeStudioCaptureNativeTrace({ traceEvents: [
      event("process_name", { cat: "__metadata", ph: "M", args: { name: "Renderer" } }),
      event("thread_name", { cat: "__metadata", ph: "M", args: { name: "CrRendererMain" } }),
      event("thread_name", { cat: "__metadata", ph: "M", args: { name: "private-title", sort_index: 2 } }),
      event("DrawFrame", { cat: "cc", args: { name: "Renderer" } }),
    ] }));
    expect(output.traceEvents[0].args).toEqual({ name: "Renderer" });
    expect(output.traceEvents[1].args).toEqual({ name: "CrRendererMain" });
    expect(output.traceEvents[2].args).toEqual({ sort_index: 2 });
    expect(output.traceEvents[3].args).toBeUndefined();
    expect(JSON.stringify(output)).not.toContain("private-title");
  });

  it("getter를 실행하지 않고 유효하지 않은 이벤트·전체 형식 오류를 구분한다", () => {
    const getter = vi.fn(() => "private");
    const values: unknown[] = [];
    Object.defineProperty(values, "0", { enumerable: true, get: getter });
    values.length = 1;
    const args = { width: 2, values };
    Object.defineProperty(args, "frame", { enumerable: true, get: getter });
    const output = JSON.parse(serializeStudioCaptureNativeTrace({ traceEvents: [event("DrawFrame", { cat: "cc", args }), event("DrawFrame", { ts: Number.NaN }), event("DrawFrame", { ph: "bad" })] }));
    expect(getter).not.toHaveBeenCalled();
    expect(output.traceEvents).toHaveLength(1);
    expect(output.nativeTrace.droppedEvents).toBe(2);
    expect(() => serializeStudioCaptureNativeTrace({ other: [] })).toThrow("형식");
    expect(() => serializeStudioCaptureNativeTrace({ traceEvents: Array.from({ length: 200_001 }, () => null) })).toThrow("한도");
  });
});

describe("native trace의 단일 작업·자원 회수 경계", () => {
  it("기본 비활성화는 CDP와 첨부를 호출하지 않고 작업을 한 번 실행한다", async () => {
    const { collector } = setup(); const operation = vi.fn(async () => 11);
    await expect(withStudioCaptureNativeTrace(false, collector, "v2.png", operation)).resolves.toBe(11);
    expect(operation).toHaveBeenCalledOnce(); expect(collector.createSession).not.toHaveBeenCalled(); expect(collector.attach).not.toHaveBeenCalled();
  });

  it("start options·stream 읽기·close·detach 뒤 원래 성공을 보존한다", async () => {
    const { collector, session, calls, saved, status } = setup(); const operation = vi.fn(async () => { calls.push("operation"); return 17; });
    await expect(withStudioCaptureNativeTrace(true, collector, "v2.png", operation)).resolves.toBe(17);
    expect(session.start).toHaveBeenCalledWith(STUDIO_CAPTURE_NATIVE_TRACE_START_OPTIONS);
    expect(STUDIO_CAPTURE_NATIVE_TRACE_START_OPTIONS.categories).not.toMatch(/screenshot|disabled-by-default/u);
    expect(calls).toEqual(["create", "start", "operation", "stop", "read", "close", "detach"]);
    expect(JSON.parse(saved.get("v2.png.native-trace.json") ?? "{}").traceEvents).toHaveLength(1);
    expect(status()).toMatchObject({ started: true, traceSaved: true, unavailable: false, incomplete: false, cleanupFailed: false, cleanupIncomplete: false });
    expect(operation).toHaveBeenCalledOnce();
  });

  it("base64 byte chunk 경계와 EOF를 보존한다", async () => {
    const raw = Buffer.from(JSON.stringify({ ...trace, metadata: { removed: "한글" } }));
    const chunks = [raw.subarray(0, raw.length - 2), raw.subarray(raw.length - 2)];
    const read = vi.fn(async () => ({ data: (chunks.shift() ?? Buffer.alloc(0)).toString("base64"), base64Encoded: true, eof: chunks.length === 0 }));
    const { collector, session, status } = setup({ read });
    await withStudioCaptureNativeTrace(true, collector, "v2.png", async () => 19);
    expect(read).toHaveBeenCalledTimes(2); expect(session.close).toHaveBeenCalledOnce(); expect(status().traceSaved).toBe(true);
  });

  it("stop·정리·첨부 실패가 실제 오류를 덮거나 재시도하지 않는다", async () => {
    const fail = async () => { throw new Error("관측 실패 private-url"); };
    const { collector, status } = setup({ stop: fail, detach: fail });
    const original = new Error("actual PNG"); const operation = vi.fn(async () => { throw original; });
    await expect(withStudioCaptureNativeTrace(true, collector, "v2.png", operation)).rejects.toBe(original);
    expect(operation).toHaveBeenCalledOnce(); expect(status()).toMatchObject({ unavailable: true, incomplete: true, cleanupFailed: true });
    collector.attach = fail;
    await expect(withStudioCaptureNativeTrace(true, collector, "v2.png", async () => 23)).resolves.toBe(23);
  });

  it("시작 거절은 다른 client의 trace를 중단하지 않고 원래 성공을 보존한다", async () => {
    const { collector, session, status } = setup({ start: async () => { throw new Error("already tracing private"); } });
    await expect(withStudioCaptureNativeTrace(true, collector, "v2.png", async () => 29)).resolves.toBe(29);
    expect(session.stop).not.toHaveBeenCalled(); expect(session.close).not.toHaveBeenCalled(); expect(session.detach).toHaveBeenCalledOnce();
    expect(status()).toMatchObject({ started: false, unavailable: true, traceSaved: false });
    expect(JSON.stringify(status())).not.toContain("private");
  });

  it("연결 제한 뒤 도착한 session은 추적을 시작하지 않고 회수한다", async () => {
    vi.useFakeTimers(); const made = deferred<StudioCaptureNativeTraceSession>();
    const { collector, session, status } = setup(); collector.createSession = () => made.promise;
    const operation = vi.fn(async () => 31); const pending = withStudioCaptureNativeTrace(true, collector, "v2.png", operation);
    await vi.advanceTimersByTimeAsync(2_001); await expect(pending).resolves.toBe(31);
    expect(operation).toHaveBeenCalledOnce(); expect(status().cleanupIncomplete).toBe(true);
    made.resolve(session); await vi.advanceTimersByTimeAsync(1);
    expect(session.start).not.toHaveBeenCalled(); expect(session.detach).toHaveBeenCalledOnce();
  });

  it("늦은 start 성공은 grace 안에서 stop/stream close하고 작업은 한 번만 실행한다", async () => {
    vi.useFakeTimers(); const started = deferred<unknown>(); const { collector, session, status } = setup({ start: () => started.promise });
    const operation = vi.fn(async () => 37); const pending = withStudioCaptureNativeTrace(true, collector, "v2.png", operation);
    await vi.advanceTimersByTimeAsync(2_001); expect(operation).toHaveBeenCalledOnce();
    started.resolve(undefined); await vi.advanceTimersByTimeAsync(1); await expect(pending).resolves.toBe(37);
    expect(session.stop).toHaveBeenCalledOnce(); expect(session.close).toHaveBeenCalledOnce(); expect(session.detach).toHaveBeenCalledOnce();
    expect(status()).toMatchObject({ started: false, startTimedOut: true, incomplete: true });
  });

  it("stop 제한 뒤 grace에 도착한 stream은 detach 전에 읽고 닫는다", async () => {
    vi.useFakeTimers(); const stopped = deferred<StudioCaptureNativeTraceCompletion>(); const { collector, session, status } = setup({ stop: () => stopped.promise });
    const operation = vi.fn(async () => 41); const pending = withStudioCaptureNativeTrace(true, collector, "v2.png", operation);
    await vi.advanceTimersByTimeAsync(2_001); expect(session.detach).not.toHaveBeenCalled();
    stopped.resolve({ stream: "late-stream" }); await vi.advanceTimersByTimeAsync(1); await expect(pending).resolves.toBe(41);
    expect(operation).toHaveBeenCalledOnce(); expect(session.close).toHaveBeenCalledWith("late-stream");
    expect(status()).toMatchObject({ stopTimedOut: true, incomplete: true, cleanupIncomplete: false, traceSaved: true });
  });

  it("grace 밖 stop은 불완전 상태로 끝내고 뒤늦은 stream close도 시도한다", async () => {
    vi.useFakeTimers(); const stopped = deferred<StudioCaptureNativeTraceCompletion>(); const { collector, session, status } = setup({ stop: () => stopped.promise });
    const pending = withStudioCaptureNativeTrace(true, collector, "v2.png", async () => 43);
    await vi.advanceTimersByTimeAsync(4_001); await expect(pending).resolves.toBe(43);
    expect(status()).toMatchObject({ stopTimedOut: true, cleanupIncomplete: true, traceSaved: false });
    expect(session.detach).toHaveBeenCalledOnce(); stopped.resolve({ stream: "too-late" }); await vi.advanceTimersByTimeAsync(1);
    expect(session.close).toHaveBeenCalledWith("too-late"); expect(status().cleanupIncomplete).toBe(true);
  });

  it("읽기 제한 시간에도 stream을 닫고 실제 오류와 단일 실행을 유지한다", async () => {
    vi.useFakeTimers(); const { collector, session, status } = setup({ read: () => new Promise(() => undefined) });
    const original = new Error("PNG failed"); const operation = vi.fn(async () => { throw original; });
    const pending = withStudioCaptureNativeTrace(true, collector, "v2.png", operation);
    const checked = expect(pending).rejects.toBe(original);
    await vi.advanceTimersByTimeAsync(2_001); await checked;
    expect(operation).toHaveBeenCalledOnce(); expect(session.close).toHaveBeenCalledOnce(); expect(session.detach).toHaveBeenCalledOnce();
    expect(status()).toMatchObject({ readTimedOut: true, incomplete: true, traceSaved: false });
  });

  it.each([
    ["잘린 JSON", () => ({ data: '{"traceEvents":[', eof: true }), false],
    ["EOF 없는 stream", () => ({ data: "", eof: false }), true],
    ["16MiB 초과", () => ({ data: "x".repeat(16 * 1024 * 1024 + 1), eof: true }), true],
  ] as const)("%s는 원문을 첨부하지 않고 회수·불완전 판정을 남긴다", async (_name, chunk, limit) => {
    const { collector, session, saved, status } = setup({ read: async () => chunk() });
    await expect(withStudioCaptureNativeTrace(true, collector, "v2.png", async () => 47)).resolves.toBe(47);
    expect(saved.has("v2.png.native-trace.json")).toBe(false); expect(session.close).toHaveBeenCalledOnce(); expect(session.detach).toHaveBeenCalledOnce();
    expect(status()).toMatchObject({ incomplete: true, unavailable: true, readLimitExceeded: limit });
  });


  it("빈 trace와 허용 mark의 detail 누락은 저장해도 불완전 상태로 남긴다", async () => {
    for (const input of [{ traceEvents: [] }, { traceEvents: [event("toonstudio:capture:1:2", { cat: "blink.user_timing", args: {} })] }]) {
      const { collector, status } = setup({ read: async () => ({ data: JSON.stringify(input), eof: true }) });
      await withStudioCaptureNativeTrace(true, collector, "v2.png", async () => 61);
      expect(status()).toMatchObject({ traceSaved: true, incomplete: true });
    }
  });

  it("grace를 넘긴 start의 정리 불확실성을 보존하고 late 성공 뒤 stop도 시도한다", async () => {
    vi.useFakeTimers(); const started = deferred<unknown>();
    const { collector, session, status } = setup({ start: () => started.promise });
    const operation = vi.fn(async () => 67); const pending = withStudioCaptureNativeTrace(true, collector, "v2.png", operation);
    await vi.advanceTimersByTimeAsync(4_001); await expect(pending).resolves.toBe(67);
    expect(status()).toMatchObject({ startTimedOut: true, cleanupIncomplete: true });
    expect(session.detach).toHaveBeenCalledOnce();
    started.resolve(undefined); await vi.advanceTimersByTimeAsync(1);
    expect(session.stop).toHaveBeenCalledOnce(); expect(session.close).toHaveBeenCalledOnce();
    expect(session.detach).toHaveBeenCalledOnce(); expect(operation).toHaveBeenCalledOnce();
  });

  it("브라우저 dataLoss와 stream 누락을 성공적인 제품 결과와 구분한다", async () => {
    const first = setup({ stop: async () => ({ stream: "data-loss", dataLossOccurred: true }) });
    await withStudioCaptureNativeTrace(true, first.collector, "v2.png", async () => 53);
    expect(first.status()).toMatchObject({ dataLossOccurred: true, incomplete: true, traceSaved: true });
    const second = setup({ stop: async () => ({ dataLossOccurred: false }) });
    await expect(withStudioCaptureNativeTrace(true, second.collector, "v2.png", async () => 59)).resolves.toBe(59);
    expect(second.status()).toMatchObject({ incomplete: true, unavailable: true, traceSaved: false });
    expect(second.session.detach).toHaveBeenCalledOnce();
  });
});
