import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioSoakCpuDiagnostic } from "./studio-soak-cpu-diagnostic";
import { createStudioFirstContactTrace, createStudioFirstContactTraceTransport, STUDIO_FIRST_CONTACT_TRACE_CATEGORIES } from "./studio-soak-first-contact-trace";

import type { StudioFirstContactTraceSource, StudioFirstContactTraceTransport } from "./studio-soak-first-contact-trace";
import type { CDPSession } from "playwright";

const directories: string[] = [];
const source: StudioFirstContactTraceSource = { sourceCommit: "a".repeat(40), buildGitSha: "a".repeat(40), sourceDirty: false,
  sessionId: "test-session", profile: "desktop", browserVersion: "fixture-browser", browserLaunchArgs: ["--fixture"] };
type FixtureEvent = { type: string; target: object; pointerId: number; pointerType: string; isTrusted: boolean };
type NativeEvent = { name: string; cat: string; ph: string; ts: number; pid: number; tid: number; dur?: number; args?: unknown };

/** 실제 브라우저 없이 관측 listener의 실행 순서와 CDP 스트림 계약을 실행한다. */
function browserFixture() {
  let time = 10, nextRaf = 0;
  const target = {}, stage = { contains: (node: object) => node === target };
  const bindings = new Map<string, Set<(event: FixtureEvent) => void>>();
  const pendingRafs = new Map<number, () => void>(), retainedMarks = new Map<string, unknown>();
  const events: NativeEvent[] = [];
  const win: Record<string, unknown> = {};
  win.top = win;
  win.addEventListener = (name: string, listener: (event: FixtureEvent) => void) => {
    if (!bindings.has(name)) bindings.set(name, new Set()); bindings.get(name)!.add(listener);
  };
  win.removeEventListener = (name: string, listener: (event: FixtureEvent) => void) => bindings.get(name)?.delete(listener);
  const clearMark = vi.fn((name: string) => retainedMarks.delete(name));
  const cancelRaf = vi.fn((id: number) => pendingRafs.delete(id));
  const performance = { timeOrigin: 1000, now: () => time,
    mark: (name: string, options: { detail: unknown }) => {
      const mark = { name, startTime: time }; retainedMarks.set(name, mark);
      events.push({ name, cat: "blink.user_timing", ph: "R", ts: (time + 1000) * 1000, pid: 11, tid: 12,
        args: { data: { detail: JSON.stringify(options.detail), frame: "frame-one" } } });
      return mark;
    }, clearMarks: clearMark };
  const context = createContext({ window: win, location: { href: "http://preview/studio/canvas" }, performance,
    document: { querySelector: () => stage }, requestAnimationFrame: (callback: () => void) => {
      const id = ++nextRaf; pendingRafs.set(id, callback); return id;
    }, cancelAnimationFrame: cancelRaf });
  const page = { evaluate: vi.fn(async (code: string): Promise<unknown> => structuredClone(runInContext(code, context))) };
  function dispatch(type: string, at: number, patch: Partial<FixtureEvent> = {}) {
    time = at;
    for (const listener of bindings.get(type) ?? []) listener({ type, target, pointerId: 7, pointerType: "pen", isTrusted: true, ...patch });
    if (type === "pointerdown") {
      events.push({ name: "ThreadControllerImpl::RunTask", cat: "toplevel", ph: "X", ts: (at + 999.8) * 1000, dur: 5000, pid: 11, tid: 12 });
      events.push({ name: "EventDispatch", cat: "devtools.timeline", ph: "X", ts: (at + 999.9) * 1000, dur: 4000, pid: 11, tid: 12, args: { data: { type } } });
      events.push({ name: "EventDispatch", cat: "devtools.timeline", ph: "X", ts: (at + 1004) * 1000, dur: 500, pid: 11, tid: 12, args: { data: { type: "mousedown" } } });
      events.push({ name: "Layout", cat: "devtools.timeline", ph: "X", ts: (at + 1001) * 1000, dur: 2000, pid: 11, tid: 12,
        args: { beginData: { stackTrace: [{ functionName: "getBoundingClientRect", url: "http://preview/fixture.js" }] } } });
    }
  }
  function frame(at: number) {
    time = at; const callbacks = [...pendingRafs.values()]; pendingRafs.clear(); for (const callback of callbacks) callback();
  }
  function stroke(base = 0) { dispatch("pointerdown", base + 20); frame(base + 25); dispatch("pointermove", base + 30); dispatch("pointerup", base + 40); time = base + 50; }
  return { page, events, dispatch, frame, stroke, win, performance, pendingRafs, retainedMarks, clearMark, cancelRaf,
    activeListeners: () => [...bindings.values()].reduce((sum, value) => sum + value.size, 0) };
}

function fixture(options: { maxTraceBytes?: number; timeoutMs?: number } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "studio-first-contact-trace-")); directories.push(directory);
  const browser = browserFixture(), calls: string[] = [];
  let transform = (events: NativeEvent[]) => events;
  const transport: StudioFirstContactTraceTransport = {
    frameId: vi.fn(async () => "frame-one"), categories: vi.fn(async () => STUDIO_FIRST_CONTACT_TRACE_CATEGORIES),
    start: vi.fn(async () => { calls.push("start"); }),
    stop: vi.fn(async () => { calls.push("stop"); return { stream: "trace-stream", dataLossOccurred: false }; }),
    read: vi.fn(async () => { calls.push("read"); return { data: JSON.stringify({ traceEvents: transform(browser.events) }), eof: true }; }),
    close: vi.fn(async () => { calls.push("close"); }), detach: vi.fn(async () => { calls.push("detach"); }),
  };
  const trace = createStudioFirstContactTrace({ page: browser.page, transport, directory, source, limits: options });
  const metadata = () => JSON.parse(readFileSync(join(directory, trace.metadataFile), "utf8"));
  return { ...browser, directory, transport, calls, trace, metadata,
    transform: (value: typeof transform) => { transform = value; } };
}

afterEach(() => { vi.useRealTimers(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("첫 접촉 native trace 원본·clock·입력 정체성", () => {
  it("원본 bytes/hash와 같은 frame/thread의 native marker 시각을 보존하고 compatibility mousedown/Layout을 남긴다", async () => {
    const f = fixture(); await f.trace.start(); await f.trace.armStroke(4, "pen"); f.stroke();
    const result = await f.trace.finish();
    expect(result).toMatchObject({ completed: true, dataLossOccurred: false, streamComplete: true, mainFrameId: "frame-one", endFrameId: "frame-one", issues: [] });
    const raw = readFileSync(join(f.directory, "diagnostic-first-contact.trace.json"));
    expect(result.rawTraceBytes).toBe(raw.byteLength); expect(result.rawTraceSha256).toBe(createHash("sha256").update(raw).digest("hex"));
    expect(JSON.parse(raw.toString()).traceEvents).toEqual(f.events);
    expect(result.correlation).toMatchObject({ sessionId: source.sessionId, frameId: "frame-one", pid: 11, tid: 12,
      nativeFrameMarkerCount: 6, diagnosticOnly: true, acceptanceProven: false,
      clock: { pageMinusTraceOffsetMinMs: -1000, pageMinusTraceOffsetMaxMs: -1000, observedOffsetSpreadMs: 0, cpuClockBoundsModified: false, absoluteClockAccuracyClaimed: false } });
    expect(result.correlation?.strokes[0]?.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "EventDispatch", eventType: "mousedown" }),
      expect.objectContaining({ name: "Layout", dur: 2000, args: expect.objectContaining({ beginData: expect.any(Object) }) }),
    ]));
    expect(f.calls).toEqual(["start", "stop", "read", "close", "detach"]);
    expect(f.activeListeners()).toBe(0); expect(f.pendingRafs.size).toBe(0); expect(f.retainedMarks.size).toBe(0);
    expect(await f.trace.finish()).toBe(result); expect(f.transport.stop).toHaveBeenCalledOnce();
  });

  it.each([
    ["누락", (events: NativeEvent[]) => events.filter((event) => !event.name.endsWith(":first-move")), "native-marker-count"],
    ["중복", (events: NativeEvent[]) => [...events, events.find((event) => event.name.endsWith(":pointerdown"))!], "native-marker-count"],
    ["다른 thread", (events: NativeEvent[]) => events.map((event) => event.name.endsWith(":first-move") ? { ...event, tid: 13 } : event), "renderer-thread-changed"],
    ["clock drift", (events: NativeEvent[]) => events.map((event) => event.name.endsWith(":first-move") ? { ...event, ts: event.ts + 2000 } : event), "clock-spread"],
    ["RunTask 누락", (events: NativeEvent[]) => events.filter((event) => !event.name.includes("RunTask")), "first-contact-task"],
    ["pointerdown dispatch 누락", (events: NativeEvent[]) => events.filter((event) => event.name !== "EventDispatch"), "pointerdown-dispatch"],
  ])("%s를 정밀한 증거로 바꾸지 않고 원본을 보존한다", async (_label, transform, issue) => {
    const f = fixture(); f.transform(transform); await f.trace.start(); await f.trace.armStroke(1, "pen"); f.stroke();
    const result = await f.trace.finish();
    expect(result.completed).toBe(false); expect(result.streamComplete).toBe(true); expect(result.correlation).toBeNull();
    expect(result.issues.join(" ")).toContain(issue); expect(result.rawTraceSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(f.transport.close).toHaveBeenCalledWith("trace-stream"); expect(f.activeListeners()).toBe(0);
  });

  it("실제 native frame이 다른 marker는 self-label과 별개로 거절한다", async () => {
    const f = fixture(); f.transform((events) => events.map((event) => event.name.endsWith(":pointerdown")
      ? { ...event, args: { data: { detail: JSON.stringify({ ...source, frameId: "frame-one", cycle: 1, phase: "pointerdown", pageEpoch: 1000 }), frame: "different-frame" } } } : event));
    await f.trace.start(); await f.trace.armStroke(1, "pen"); f.stroke();
    expect((await f.trace.finish()).issues.join(" ")).toContain("native-frame-mismatch");
  });

  it("수집 도중 frame 변경은 marker가 남아 있어도 완료로 인정하지 않는다", async () => {
    const f = fixture(); vi.mocked(f.transport.frameId).mockResolvedValueOnce("frame-one").mockResolvedValue("frame-two");
    await f.trace.start(); await f.trace.armStroke(1, "pen"); f.stroke();
    expect(await f.trace.finish()).toMatchObject({ completed: false, endFrameId: "frame-two", issues: [expect.stringContaining("frame-identity")] });
  });

  it.each([
    ["pointer type", { pointerType: "touch" }], ["untrusted event", { isTrusted: false }],
  ])("%s 불일치를 관측 오류로 남긴다", async (_label, patch) => {
    const f = fixture(); await f.trace.start(); await f.trace.armStroke(1, "pen");
    f.dispatch("pointerdown", 20, patch); f.frame(25); f.dispatch("pointermove", 30); f.dispatch("pointerup", 40);
    expect((await f.trace.finish()).issues.join(" ")).toContain("marker-session-or-probe-errors");
  });

  it("끝나지 않은 RAF와 취소된 입력도 listener·RAF·UserTiming entry를 회수하고 실패를 남긴다", async () => {
    const f = fixture(); await f.trace.start(); await f.trace.armStroke(1, "pen");
    f.dispatch("pointerdown", 20); f.dispatch("pointermove", 30); f.dispatch("pointercancel", 40);
    const result = await f.trace.finish();
    expect(result.completed).toBe(false); expect(result.probe).toMatchObject({ errors: expect.arrayContaining(["first-raf-pending", "pointer-cancelled"]) });
    expect(f.cancelRaf).toHaveBeenCalledOnce(); expect(f.pendingRafs.size).toBe(0); expect(f.activeListeners()).toBe(0); expect(f.retainedMarks.size).toBe(0);
  });

  it("64획/258marker 상한 뒤 추가 arm을 거절하고 기존 표본을 보존한다", async () => {
    const f = fixture(); await f.trace.start();
    for (let cycle = 1; cycle <= 64; cycle += 1) { await f.trace.armStroke(cycle, "pen"); f.stroke(cycle * 100); }
    await expect(f.trace.armStroke(65, "pen")).rejects.toThrow("획 식별자");
    const result = await f.trace.finish(); expect(result.completed).toBe(false);
    expect(result.probe).toMatchObject({ markers: expect.any(Array), cycles: expect.any(Array) });
    expect(f.metadata().probe.markers).toHaveLength(258); expect(f.metadata().probe.cycles).toHaveLength(64);
    expect(f.activeListeners()).toBe(0);
  });

  it("설치 실패 뒤 다른 session의 probe를 cleanup하거나 교체하지 않는다", async () => {
    const f = fixture(); const foreign = { sessionId: "foreign", frameId: "foreign-frame", finish: vi.fn() };
    f.win.__studioFirstContactTrace = foreign;
    await expect(f.trace.start()).rejects.toThrow("중첩"); const result = await f.trace.finish();
    expect(result.completed).toBe(false); expect(result.issues.join(" ")).toContain("probe-cleanup");
    expect(foreign.finish).not.toHaveBeenCalled(); expect(f.win.__studioFirstContactTrace).toBe(foreign);
    expect(f.transport.stop).toHaveBeenCalledOnce();
  });
});

describe("진단 trace의 원본 실패 보존과 제한", () => {
  it("dataLossOccurred=true여도 받은 원본을 저장하며 완료로 바꾸지 않는다", async () => {
    const f = fixture(); vi.mocked(f.transport.stop).mockResolvedValue({ stream: "trace-stream", dataLossOccurred: true });
    await f.trace.start(); await f.trace.armStroke(1, "pen"); f.stroke();
    expect(await f.trace.finish()).toMatchObject({ completed: false, streamComplete: true, dataLossOccurred: true,
      rawTraceSha256: expect.stringMatching(/^[a-f0-9]{64}$/u), issues: [expect.stringContaining("trace-data-loss")] });
  });

  it("스트림 용량 초과의 실제 부분 bytes/hash와 실패를 함께 남긴다", async () => {
    const f = fixture({ maxTraceBytes: 512 }); await f.trace.start(); await f.trace.armStroke(1, "pen"); f.stroke();
    const result = await f.trace.finish(); const raw = readFileSync(join(f.directory, "diagnostic-first-contact.trace.json"));
    expect(raw.byteLength).toBe(512); expect(result).toMatchObject({ completed: false, streamComplete: false, rawTraceBytes: 512, correlation: null });
    expect(result.rawTraceSha256).toBe(createHash("sha256").update(raw).digest("hex")); expect(result.issues.join(" ")).toContain("바이트 상한");
    expect(f.transport.close).toHaveBeenCalledOnce(); expect(f.transport.detach).toHaveBeenCalledOnce();
  });

  it("멀티바이트를 나눈 base64 chunk도 원본을 바꾸지 않는다", async () => {
    const f = fixture(); await f.trace.start(); await f.trace.armStroke(1, "pen"); f.stroke();
    let pieces: Buffer[] | null = null, expected: Buffer | null = null;
    vi.mocked(f.transport.read).mockImplementation(async () => {
      if (!pieces) {
        expected = Buffer.from(JSON.stringify({ traceEvents: f.events, comment: "진단" }));
        pieces = [expected.subarray(0, expected.length - 3), expected.subarray(expected.length - 3)];
      }
      return { data: pieces.shift()!.toString("base64"), base64Encoded: true, eof: pieces.length === 0 };
    });
    expect((await f.trace.finish()).completed).toBe(true);
    expect(readFileSync(join(f.directory, "diagnostic-first-contact.trace.json"))).toEqual(expected);
  });

  it.each(["stop", "read", "close", "detach"] as const)("%s 실패는 metadata와 실패 결과에 남긴다", async (method) => {
    const f = fixture(); vi.mocked(f.transport[method]).mockRejectedValue(new Error(`${method} failed`));
    await f.trace.start(); await f.trace.armStroke(1, "pen"); f.stroke();
    const result = await f.trace.finish(); expect(result.completed).toBe(false); expect(result.issues.join(" ")).toContain(`${method} failed`);
    expect(f.metadata().completed).toBe(false); expect(f.activeListeners()).toBe(0); expect(f.transport.detach).toHaveBeenCalledOnce();
    if (method === "stop") expect(result.rawTraceFile).toBeNull();
  });

  it("다른 client가 시작한 trace 때문에 start가 거절되면 그 trace를 중단하지 않는다", async () => {
    const f = fixture(); vi.mocked(f.transport.start).mockRejectedValue(new Error("already tracing"));
    await expect(f.trace.start()).rejects.toThrow("already tracing");
    const result = await f.trace.finish(); expect(result.completed).toBe(false);
    expect(f.transport.stop).not.toHaveBeenCalled(); expect(f.transport.read).not.toHaveBeenCalled(); expect(f.transport.detach).toHaveBeenCalledOnce();
    expect(f.page.evaluate).not.toHaveBeenCalled(); expect(result.issues.join(" ")).toContain("already tracing");
  });

  it("응답이 멈춘 read는 시간 제한 후 부분 원본과 marker cleanup을 보존한다", async () => {
    vi.useFakeTimers(); const f = fixture({ timeoutMs: 20 });
    await f.trace.start(); await f.trace.armStroke(1, "pen"); f.stroke();
    vi.mocked(f.transport.read).mockImplementation(() => new Promise(() => undefined));
    const pending = f.trace.finish(); await vi.advanceTimersByTimeAsync(21);
    const result = await pending; expect(result.completed).toBe(false); expect(result.streamComplete).toBe(false);
    expect(result.issues.join(" ")).toContain("초과"); expect(f.transport.close).toHaveBeenCalledOnce(); expect(f.activeListeners()).toBe(0);
  });

  it("필수 범주나 깨끗한 동일 source/build가 없으면 trace를 시작하지 않는다", async () => {
    const f = fixture(); vi.mocked(f.transport.categories).mockResolvedValue(["blink.user_timing"]);
    await expect(f.trace.start()).rejects.toThrow("필수 trace 범주"); await f.trace.finish();
    expect(f.transport.start).not.toHaveBeenCalled();
    const bad = createStudioFirstContactTrace({ page: f.page, transport: f.transport, directory: f.directory,
      source: { ...source, buildGitSha: "b".repeat(40) } });
    await expect(bad.start()).rejects.toThrow("정체성"); await bad.finish();
    expect(f.transport.start).not.toHaveBeenCalled();
  });
});

describe("CDP 종료 listener 순서와 CPU 진단 옵션 경계", () => {
  it("tracingComplete가 Tracing.end 응답보다 먼저 와도 수집하고 listener를 회수한다", async () => {
    const listeners = new Map<string, (value: unknown) => void>();
    const cdp = { on: vi.fn((name: string, listener: (value: unknown) => void) => listeners.set(name, listener)),
      off: vi.fn((name: string) => listeners.delete(name)), send: vi.fn(async (method: string) => {
        expect(method).toBe("Tracing.end"); expect(listeners.has("Tracing.tracingComplete")).toBe(true);
        listeners.get("Tracing.tracingComplete")!({ stream: "stream", dataLossOccurred: false }); return {};
      }) } as unknown as CDPSession;
    await expect(createStudioFirstContactTraceTransport(cdp).stop()).resolves.toEqual({ stream: "stream", dataLossOccurred: false });
    expect(listeners.size).toBe(0);
  });

  it("Tracing.end 거절과 완료 event 누락도 listener를 남기지 않는다", async () => {
    vi.useFakeTimers(); const off = vi.fn(), send = vi.fn(async (): Promise<unknown> => { throw new Error("stop rejected"); });
    const cdp = { on: vi.fn(), off, send } as unknown as CDPSession;
    await expect(createStudioFirstContactTraceTransport(cdp).stop()).rejects.toThrow("stop rejected"); expect(off).toHaveBeenCalledOnce();
    send.mockImplementation(async () => undefined);
    const pending = createStudioFirstContactTraceTransport(cdp).stop(); const checked = expect(pending).rejects.toThrow("30초");
    await vi.advanceTimersByTimeAsync(30_001); await checked; expect(off).toHaveBeenCalledTimes(2);
  });

  it("diagnostic_cpu=false는 CDP·page·RAF·파일을 전혀 사용하지 않는다", async () => {
    const f = fixture(); const send = vi.fn(), factory = vi.fn(async () => f.transport);
    const diagnostic = createStudioSoakCpuDiagnostic({ enabled: false, page: f.page, cdp: { send } as unknown as CDPSession,
      directory: f.directory, source, createTraceTransport: factory });
    await diagnostic.start(); await diagnostic.armStroke(1, "pen"); await expect(diagnostic.finish()).resolves.toBeNull();
    expect(factory).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); expect(f.page.evaluate).not.toHaveBeenCalled();
    expect(readdirSync(f.directory)).toEqual([]); expect(f.activeListeners()).toBe(0); expect(f.pendingRafs.size).toBe(0);
  });

  it("CPU stop 실패가 독립 native trace 원본·cleanup을 지우지 않는다", async () => {
    const f = fixture(); const send = vi.fn(async (method: string) => {
      if (method === "Profiler.stop") throw new Error("CPU stop failed"); return {};
    });
    const diagnostic = createStudioSoakCpuDiagnostic({ enabled: true, page: f.page, cdp: { send } as unknown as CDPSession,
      directory: f.directory, source, createTraceTransport: async () => f.transport });
    await diagnostic.start(); await diagnostic.armStroke(1, "pen"); f.stroke();
    expect(await diagnostic.finish()).toMatchObject({ captured: false, traceCaptured: true, issues: [expect.stringContaining("CPU stop failed")] });
    expect(JSON.parse(readFileSync(join(f.directory, "diagnostic-cpu-metadata.json"), "utf8"))).toMatchObject({ rawProfileFile: null, issues: [expect.stringContaining("CPU stop failed")] });
    expect(f.activeListeners()).toBe(0); expect(f.transport.detach).toHaveBeenCalledOnce();
  });

  it("CPU stop 무응답도30초뒤 native trace를 저장하고 완료실패를 보존한다", async () => {
    vi.useFakeTimers(); const f = fixture(); const send = vi.fn(async (method: string) => {
      if (method === "Profiler.stop") return new Promise(() => undefined); return {};
    });
    const diagnostic = createStudioSoakCpuDiagnostic({ enabled: true, page: f.page, cdp: { send } as unknown as CDPSession,
      directory: f.directory, source, createTraceTransport: async () => f.transport });
    await diagnostic.start(); await diagnostic.armStroke(1, "pen"); f.stroke();
    const pending = diagnostic.finish(); await vi.advanceTimersByTimeAsync(30_001);
    expect(await pending).toMatchObject({ captured: false, traceCaptured: true, issues: [expect.stringContaining("30초")] });
    expect(f.activeListeners()).toBe(0); expect(f.transport.detach).toHaveBeenCalledOnce();
  });

  it("trace 손실이 있어도 원래 CPU profile/hash/시계 범위는 그대로 보존한다", async () => {
    const f = fixture(); vi.mocked(f.transport.stop).mockResolvedValue({ stream: "trace-stream", dataLossOccurred: true });
    const profile = { startTime: 100, endTime: 200, samples: [1, 1], timeDeltas: [1, -3], nodes: [] };
    const send = vi.fn(async (method: string) => method === "Profiler.stop" ? { profile } : {});
    const suppliedSource = { ...source, schemaVersion: 99, diagnosticOnly: false, rawProfileSha256: "override", reportArrays: ["unrelated"] };
    const diagnostic = createStudioSoakCpuDiagnostic({ enabled: true, page: f.page, cdp: { send } as unknown as CDPSession,
      directory: f.directory, source: suppliedSource, createTraceTransport: async () => f.transport });
    await diagnostic.start(); await diagnostic.armStroke(1, "pen"); f.stroke();
    const result = await diagnostic.finish(); expect(result).toMatchObject({ captured: true, traceCaptured: false });
    const raw = readFileSync(join(f.directory, "diagnostic-cpu.cpuprofile")); expect(JSON.parse(raw.toString())).toEqual(profile);
    const metadata = JSON.parse(readFileSync(join(f.directory, "diagnostic-cpu-metadata.json"), "utf8"));
    expect(metadata).toMatchObject({ rawProfileSha256: createHash("sha256").update(raw).digest("hex"),
      startClock: { pageEpoch: 1000, beforeStartMs: 10, afterStartMs: 10 }, stopClock: { beforeStopMs: 50, afterStopMs: 50 } });
    expect(metadata.diagnosticOnly).toBe(true); expect(metadata).not.toHaveProperty("reportArrays"); expect(metadata).not.toHaveProperty("schemaVersion");
    expect(f.metadata()).toMatchObject({ schemaVersion: 1, diagnosticOnly: true }); expect(f.metadata()).not.toHaveProperty("reportArrays");
  });
});
