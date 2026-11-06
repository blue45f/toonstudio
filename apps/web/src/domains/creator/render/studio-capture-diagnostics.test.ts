import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function performanceRecorder() {
  const entries = new Map<string, PerformanceMarkOptions | undefined>();
  return {
    entries,
    now: vi.fn(() => 100),
    mark: vi.fn((name: string, options?: PerformanceMarkOptions) => { entries.set(name, options); }),
    clearMarks: vi.fn((name?: string) => {
      if (name === undefined) entries.clear();
      else entries.delete(name);
    }),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DEV", true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("개발 환경 캡처 진단", () => {
  it("준비 관측은 기존 getter의 호출 순서·단락 평가·프레임 수를 유지한다", async () => {
    const timing = performanceRecorder();
    vi.stubGlobal("performance", timing);
    const { waitForStudioCaptureReady } = await import("../studio-capture-readiness");
    const events: string[] = [];
    let frames = 0;
    const stage = { batchDraw() {} };
    const page = { id: "private-page-id", elements: [] };
    const committed = { pageId: page.id, historyIndex: 0, page, exporting: true, masterEditMode: false };
    const result = await waitForStudioCaptureReady({
      pageId: page.id,
      getRenderedPageId: () => { events.push(`page:${frames}`); return frames === 0 ? "old-private-page" : page.id; },
      getStage: () => { events.push(`stage:${frames}`); return frames === 1 ? null : stage; },
      document: {
        drawingRef: { current: null }, drawingPointerTransportRef: { current: null }, pendingStrokeCommitsRef: { current: null },
        flushPendingStrokes() {}, pagesHistoryRef: { current: [[page]] }, pagesHiRef: { current: 0 }, master: undefined,
        captureCommitRef: { get current() { events.push("commit"); return committed; } },
      },
      nextFrame: async () => { frames += 1; events.push(`frame:${frames}`); },
      waitForFonts: async () => { events.push("fonts"); },
      waitForWetPaperBakes: async () => { events.push("wet"); return false; },
      waitForRasterPresentations: async () => { events.push("raster"); },
    });
    expect(result).toBe(stage);
    expect(events).toEqual([
      "page:0", "frame:1", "page:1", "stage:1", "frame:2", "page:2", "stage:2", "commit", "fonts",
      "frame:3", "frame:4", "page:4", "commit", "stage:4", "wet", "raster", "frame:5", "page:5", "stage:5", "commit",
    ]);
    const details = timing.mark.mock.calls.map((call) => call[1]?.detail);
    expect(details.map((detail) => detail.phase)).toEqual(expect.arrayContaining([
      "commit-stage-wait", "fonts-assets-wait", "fonts-ready", "assets-ready", "paint-wait", "wet-paper-wait", "raster-wait", "ready",
    ]));
    expect(details.at(-1)).toMatchObject({ phase: "ready", frameCount: 5, commitChecked: true, pageObjectMatches: true });
    expect(JSON.stringify(details)).not.toContain("private-page");
  });

  it("준비 제한시간 실패는 getter를 다시 부르지 않고 plain ref의 불리언만 보완한다", async () => {
    vi.useFakeTimers();
    const timing = performanceRecorder();
    vi.stubGlobal("performance", timing);
    const { waitForStudioCaptureReady } = await import("../studio-capture-readiness");
    const page = { id: "private-page-id", elements: [] };
    const committed = { pageId: page.id, historyIndex: 0, page, exporting: false, masterEditMode: true };
    const getRenderedPageId = vi.fn(() => null);
    const getStage = vi.fn(() => ({ batchDraw() {} }));
    const promise = waitForStudioCaptureReady({
      pageId: page.id, getRenderedPageId, getStage, timeoutMs: 250,
      document: {
        drawingRef: { current: null }, drawingPointerTransportRef: { current: null }, pendingStrokeCommitsRef: { current: null },
        flushPendingStrokes() {}, pagesHistoryRef: { current: [[page]] }, pagesHiRef: { current: 0 }, master: undefined,
        captureCommitRef: { current: committed },
      },
      nextFrame: () => new Promise(() => undefined),
    });
    const rejected = expect(promise).rejects.toMatchObject({ code: "render-timeout" });
    await vi.advanceTimersByTimeAsync(250);
    await rejected;
    expect(getRenderedPageId).toHaveBeenCalledTimes(1);
    expect(getStage).not.toHaveBeenCalled();
    expect(timing.mark.mock.calls.at(-1)?.[1]?.detail).toMatchObject({
      phase: "failed", timeoutMs: 250, frameCount: 0, renderedPageMatches: false,
      commitChecked: false, commitPageMatches: true, historyIndexMatches: true, pageObjectMatches: true,
      exporting: false, masterEditMode: true,
    });
    expect(timing.mark.mock.calls.at(-1)?.[1]?.detail).not.toHaveProperty("stagePresent");
    expect(JSON.stringify(timing.mark.mock.calls)).not.toContain("private-page");
  });

  it("fonts와 assets는 동시에 시작하고 미완료 fonts에서 실패한 위치를 구분한다", async () => {
    vi.useFakeTimers();
    const timing = performanceRecorder();
    vi.stubGlobal("performance", timing);
    const { waitForStudioCaptureReady } = await import("../studio-capture-readiness");
    let resolveFonts: (() => void) | undefined;
    const fonts = vi.fn(() => new Promise<void>((resolve) => { resolveFonts = resolve; }));
    const assets = vi.fn(async () => undefined);
    const promise = waitForStudioCaptureReady({
      pageId: "private-page", getRenderedPageId: () => "private-page", getStage: () => ({ batchDraw() {} }), timeoutMs: 250,
      nextFrame: async () => undefined, waitForFonts: fonts, preloadImage: assets, assetSources: ["https://private.invalid/key"],
    });
    const rejected = expect(promise).rejects.toMatchObject({ code: "render-timeout" });
    await vi.advanceTimersByTimeAsync(250);
    await rejected;
    expect(fonts).toHaveBeenCalledTimes(1);
    expect(assets).toHaveBeenCalledTimes(1);
    const detail = timing.mark.mock.calls.at(-1)?.[1]?.detail;
    expect(detail).toMatchObject({ phase: "failed", fontsReady: false, assetsReady: true, assetCount: 1 });
    expect(JSON.stringify(timing.mark.mock.calls)).not.toContain("private.invalid");
    resolveFonts?.();
    await Promise.resolve();
    expect(timing.mark.mock.calls.at(-1)?.[1]?.detail.phase).toBe("failed");
  });

  it("운영 환경은 같은 no-op 객체를 반환하고 performance에 접근하지 않는다", async () => {
    vi.stubEnv("DEV", false);
    const access = vi.fn(() => { throw new Error("관측 API 접근 금지"); });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "performance");
    Object.defineProperty(globalThis, "performance", { configurable: true, get: access });
    try {
      const { beginStudioCaptureDiagnostics } = await import("./studio-capture-diagnostics");
      const first = beginStudioCaptureDiagnostics("readiness");
      const second = beginStudioCaptureDiagnostics("raster-export");
      expect(first).toBe(second);
      expect(first.enabled).toBe(false);
      expect(() => first.mark("started", { assetCount: 1 })).not.toThrow();
      expect(access).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "performance", descriptor);
      else Reflect.deleteProperty(globalThis, "performance");
    }
  });

  it("명시된 상수와 숫자·불리언만 기록하며 원본 문자열과 임의 키를 버린다", async () => {
    const timing = performanceRecorder();
    vi.stubGlobal("performance", timing);
    const { beginStudioCaptureDiagnostics } = await import("./studio-capture-diagnostics");
    const diagnostics = beginStudioCaptureDiagnostics("readiness");
    timing.now.mockReturnValue(125);
    const unknownGetter = vi.fn(() => "private");
    const fields = {
      timeoutMs: 8000, assetCount: 2, stagePresent: true, fontsReady: false,
      src: "data:private", title: "원고 제목", phase: "개인 phase", domain: "개인 domain",
      attemptId: "비밀", elapsedMs: "비밀", error: new Error("비공개 오류"),
    };
    Object.defineProperty(fields, "unknown", { get: unknownGetter });
    diagnostics.mark("commit-stage-wait", fields);
    expect(diagnostics.enabled).toBe(true);
    expect(timing.mark.mock.calls[0]?.[1]?.detail).toEqual({
      domain: "readiness", phase: "commit-stage-wait", attemptId: 1, elapsedMs: 25,
      timeoutMs: 8000, assetCount: 2, stagePresent: true, fontsReady: false,
    });
    expect(unknownGetter).not.toHaveBeenCalled();
    Reflect.apply(diagnostics.mark, diagnostics, ["private-phase", fields]);
    Reflect.apply(beginStudioCaptureDiagnostics, undefined, ["private-domain"]);
    expect(timing.mark).toHaveBeenCalledTimes(1);
  });

  it("허용 필드도 문자열·비유한 수·음수·상속값·getter이면 기록하지 않는다", async () => {
    const timing = performanceRecorder();
    vi.stubGlobal("performance", timing);
    const { beginStudioCaptureDiagnostics } = await import("./studio-capture-diagnostics");
    const diagnostics = beginStudioCaptureDiagnostics("readiness");
    const getter = vi.fn(() => { throw new Error("원본 접근 금지"); });
    const inherited = Object.create({ assetCount: 9 });
    Object.defineProperty(inherited, "stagePresent", { get: getter });
    Reflect.apply(diagnostics.mark, diagnostics, ["started", inherited]);
    Reflect.apply(diagnostics.mark, diagnostics, ["failed", {
      timeoutMs: Number.NaN, frameCount: Number.POSITIVE_INFINITY, assetCount: -1,
      rasterCount: "private", stagePresent: "private", fontsReady: 1,
    }]);
    expect(getter).not.toHaveBeenCalled();
    expect(timing.mark.mock.calls.map((call) => call[1]?.detail)).toEqual([
      { domain: "readiness", phase: "started", attemptId: 1, elapsedMs: 0 },
      { domain: "readiness", phase: "failed", attemptId: 1, elapsedMs: 0 },
    ]);
    diagnostics.mark("ready", { timeoutMs: 0, frameCount: 1.5, assetCount: 0, rasterCount: 2 });
    expect(timing.mark.mock.calls[2]?.[1]?.detail).toMatchObject({ timeoutMs: 0, frameCount: 1.5, assetCount: 0, rasterCount: 2 });
  });

  it("전체 시도에서 고유한 이름과 증가하는 번호를 쓰며 자신의 최근 64개만 유지한다", async () => {
    const timing = performanceRecorder();
    timing.entries.set("foreign-mark", { detail: { private: true } });
    vi.stubGlobal("performance", timing);
    const { beginStudioCaptureDiagnostics, STUDIO_CAPTURE_DIAGNOSTICS_PREFIX } = await import("./studio-capture-diagnostics");
    const first = beginStudioCaptureDiagnostics("readiness");
    const second = beginStudioCaptureDiagnostics("raster-export");
    for (let index = 0; index < 70; index += 1) (index % 2 === 0 ? first : second).mark("started");
    const ownNames = [...timing.entries.keys()].filter((name) => name.startsWith(STUDIO_CAPTURE_DIAGNOSTICS_PREFIX));
    const allNames = timing.mark.mock.calls.map((call) => call[0]);
    expect(ownNames).toHaveLength(64);
    expect(new Set(allNames).size).toBe(70);
    expect(allNames.map((name) => Number(name.split(":").at(-1)))).toEqual(Array.from({ length: 70 }, (_, index) => index + 1));
    expect(timing.entries.has("foreign-mark")).toBe(true);
    expect(timing.clearMarks.mock.calls).toEqual(allNames.slice(0, 6).map((name) => [name]));
    expect(timing.mark.mock.calls[0]?.[1]?.detail.attemptId).toBe(1);
    expect(timing.mark.mock.calls[1]?.[1]?.detail.attemptId).toBe(2);
  });

  it("관측 API와 필드 접근이 실패해도 내보내기 호출자에게 오류를 전달하지 않는다", async () => {
    const timing = performanceRecorder();
    vi.stubGlobal("performance", timing);
    const { beginStudioCaptureDiagnostics } = await import("./studio-capture-diagnostics");
    timing.now.mockImplementationOnce(() => { throw new Error("clock failed"); });
    expect(beginStudioCaptureDiagnostics("readiness").enabled).toBe(false);
    const diagnostics = beginStudioCaptureDiagnostics("readiness");
    timing.mark.mockImplementationOnce(() => { throw new Error("mark failed"); });
    expect(() => diagnostics.mark("started")).not.toThrow();
    const fields = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("field failed"); } });
    expect(() => diagnostics.mark("started", fields)).not.toThrow();
    for (let index = 0; index < 64; index += 1) diagnostics.mark("started");
    timing.clearMarks.mockImplementationOnce(() => { throw new Error("clear failed"); });
    expect(() => diagnostics.mark("ready")).not.toThrow();
    expect(timing.entries.size).toBe(64);
    expect(() => diagnostics.mark("ready")).not.toThrow();
    expect(timing.entries.size).toBe(64);
    timing.now.mockReturnValue(Number.NaN);
    expect(() => diagnostics.mark("ready")).not.toThrow();
    expect(timing.entries.size).toBe(64);
  });
});
