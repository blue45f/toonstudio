import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Rect = { x: number; y: number; width: number; height: number };
type CacheNode = ReturnType<typeof cacheNode>;
type Effect = () => void | (() => void);

const components = vi.hoisted(() => ({
  node: null as CacheNode | null,
  effects: [] as Effect[],
  refresh: undefined as (() => boolean) | undefined,
  unregister: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: (initial: unknown) => ({ current: initial === null ? components.node : initial }),
  useLayoutEffect: (effect: Effect) => { components.effects.push(effect); },
}));
vi.mock("react-konva/lib/ReactKonvaCore", () => ({ Group: () => null }));
vi.mock("./studio-raster-presentation-cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-raster-presentation-cache")>();
  return {
    ...actual,
    registerStudioRasterPresentationCache: (node: Parameters<typeof actual.registerStudioRasterPresentationCache>[0], refresh: () => boolean) => {
      components.refresh = refresh;
      const unregister = actual.registerStudioRasterPresentationCache(node, refresh);
      return () => { unregister(); components.unregister(); };
    },
  };
});

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

function cacheNode(events: string[], rect: Rect, cacheFails = false) {
  let cached = false;
  const stage = {};
  const batchDraw = vi.fn(() => { events.push("batchDraw"); });
  return {
    getStage: vi.fn(() => stage),
    getParent: vi.fn(() => null),
    isVisible: vi.fn(() => true),
    clearCache: vi.fn(() => { events.push("clearCache"); cached = false; }),
    getClientRect: vi.fn((_options: { skipTransform: boolean }) => { events.push("getClientRect"); return rect; }),
    cache: vi.fn((_options?: { pixelRatio?: number }) => {
      events.push("cache");
      if (cacheFails) throw new Error("비공개 cache 오류");
      cached = true;
    }),
    getLayer: vi.fn(() => { events.push("getLayer"); return { batchDraw }; }),
    isCached: vi.fn(() => { events.push("isCached"); return cached; }),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DEV", true);
  components.node = null;
  components.effects = [];
  components.refresh = undefined;
  components.unregister.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("개발 환경 래스터 캐시 관측", () => {
  it("운영 환경은 같은 no-op 객체를 반환하고 performance와 rect getter에 접근하지 않는다", async () => {
    vi.stubEnv("DEV", false);
    const access = vi.fn(() => { throw new Error("관측 API 접근 금지"); });
    const rectGetter = vi.fn(() => { throw new Error("원본 접근 금지"); });
    const rect = Object.defineProperty({}, "width", { get: rectGetter });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "performance");
    Object.defineProperty(globalThis, "performance", { configurable: true, get: access });
    try {
      const { beginStudioRasterCacheDiagnostics } = await import("./studio-raster-cache-diagnostics");
      const first = beginStudioRasterCacheDiagnostics("clip", "initial");
      expect(first).toBe(beginStudioRasterCacheDiagnostics("blend", "timer"));
      expect(first.enabled).toBe(false);
      expect(() => first.finish(rect, true, false)).not.toThrow();
      expect(access).not.toHaveBeenCalled();
      expect(rectGetter).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "performance", descriptor);
      else Reflect.deleteProperty(globalThis, "performance");
    }
  });

  it("동일 performance 시계의 시작·끝과 동기 CPU 소요 시간만 기록한다", async () => {
    const timing = performanceRecorder();
    vi.stubGlobal("performance", timing);
    const { beginStudioRasterCacheDiagnostics } = await import("./studio-raster-cache-diagnostics");
    const observation = beginStudioRasterCacheDiagnostics("clip", "initial");
    timing.now.mockReturnValue(112.5);
    observation.finish({ x: -10, y: 2, width: 20, height: 30 }, true, false);
    observation.finish({ width: 999 }, false, true);
    expect(timing.mark.mock.calls).toEqual([
      ["toonstudio:raster-cache:1:start", { startTime: 100, detail: { kind: "clip", reason: "initial", elapsedMs: 0 } }],
      ["toonstudio:raster-cache:1:end", {
        startTime: 112.5,
        detail: { kind: "clip", reason: "initial", elapsedMs: 12.5, rect: { x: -10, y: 2, width: 20, height: 30 }, isCached: true, failed: false },
      }],
    ]);
    expect(timing.now).toHaveBeenCalledTimes(2);
  });

  it("own data 숫자만 읽고 상속값·getter·원본 내용·오류를 버린다", async () => {
    const timing = performanceRecorder();
    vi.stubGlobal("performance", timing);
    const { beginStudioRasterCacheDiagnostics } = await import("./studio-raster-cache-diagnostics");
    const getter = vi.fn(() => { throw new Error("원본 접근 금지"); });
    const rect = Object.create({ x: 30, height: 40 });
    Object.defineProperty(rect, "y", { get: getter });
    Object.assign(rect, { width: 20, src: "data:비공개", id: "비공개-ID", error: new Error("비공개 오류") });
    beginStudioRasterCacheDiagnostics("blend").finish(rect, false, true);
    Reflect.apply(beginStudioRasterCacheDiagnostics, undefined, ["비공개-kind", "initial"]);
    Reflect.apply(beginStudioRasterCacheDiagnostics, undefined, ["clip", "비공개-reason"]);
    expect(getter).not.toHaveBeenCalled();
    expect(timing.mark.mock.calls.at(-1)?.[1]?.detail).toEqual({
      kind: "blend", reason: "raster", elapsedMs: 0, rect: { width: 20 }, isCached: false, failed: true,
    });
    expect(timing.mark).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(timing.mark.mock.calls)).not.toContain("비공개");
    const invalid = beginStudioRasterCacheDiagnostics("clip", "timer");
    Reflect.apply(invalid.finish, invalid, [{ x: Number.NaN, y: Infinity, width: "비공개", height: -Infinity }, "비공개", 1]);
    expect(timing.mark.mock.calls.at(-1)?.[1]?.detail).toEqual({ kind: "clip", reason: "timer", elapsedMs: 0 });
  });

  it("자신의 최근 64개 marks만 유지하고 기존 capture marks를 지우지 않는다", async () => {
    const timing = performanceRecorder();
    const captureName = "toonstudio:capture:1:1";
    timing.entries.set(captureName, { detail: { phase: "paint-wait" } });
    vi.stubGlobal("performance", timing);
    const { beginStudioRasterCacheDiagnostics, STUDIO_RASTER_CACHE_DIAGNOSTICS_PREFIX } = await import("./studio-raster-cache-diagnostics");
    for (let index = 0; index < 36; index += 1) {
      beginStudioRasterCacheDiagnostics(index % 2 === 0 ? "clip" : "blend").finish({ width: 20 }, true, false);
    }
    const names = timing.mark.mock.calls.map(([name]) => name);
    expect(new Set(names).size).toBe(72);
    expect([...timing.entries.keys()].filter((name) => name.startsWith(STUDIO_RASTER_CACHE_DIAGNOSTICS_PREFIX))).toHaveLength(64);
    expect(timing.entries.has(captureName)).toBe(true);
    expect(timing.clearMarks.mock.calls).toEqual(names.slice(0, 8).map((name) => [name]));
  });

  it("관측 API·descriptor 실패와 비정상 시계는 호출자에게 전달하지 않는다", async () => {
    const timing = performanceRecorder();
    vi.stubGlobal("performance", timing);
    const { beginStudioRasterCacheDiagnostics } = await import("./studio-raster-cache-diagnostics");
    const descriptorFailure = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("비공개 descriptor 오류"); } });
    expect(() => beginStudioRasterCacheDiagnostics("clip").finish(descriptorFailure, true, false)).not.toThrow();
    const nowFailure = beginStudioRasterCacheDiagnostics("blend");
    timing.now.mockImplementationOnce(() => { throw new Error("비공개 시계 오류"); });
    expect(() => nowFailure.finish({}, true, false)).not.toThrow();
    timing.mark.mockImplementationOnce(() => { throw new Error("비공개 mark 오류"); });
    expect(beginStudioRasterCacheDiagnostics("clip").enabled).toBe(false);
    timing.now.mockReturnValueOnce(Number.NaN);
    expect(beginStudioRasterCacheDiagnostics("blend").enabled).toBe(false);
    const backwards = beginStudioRasterCacheDiagnostics("clip");
    const before = timing.mark.mock.calls.length;
    timing.now.mockReturnValueOnce(99);
    backwards.finish({}, false, false);
    expect(timing.mark).toHaveBeenCalledTimes(before);
    for (let index = 0; index < 40; index += 1) beginStudioRasterCacheDiagnostics("clip").finish({}, true, false);
    timing.clearMarks.mockImplementation(() => { throw new Error("비공개 clear 오류"); });
    expect(beginStudioRasterCacheDiagnostics("blend").enabled).toBe(false);
    expect(JSON.stringify(timing.mark.mock.calls)).not.toContain("비공개");
  });
});

describe.each(["clip", "blend"] as const)("%s 그룹의 관측 비간섭", (kind) => {
  async function mountCacheGroup() {
    const { ClipMaskGroup } = await import("../ClipMaskGroup");
    const { BlendIsolationGroup } = await import("../BlendIsolationGroup");
    const CacheGroup = kind === "clip" ? ClipMaskGroup : BlendIsolationGroup;
    CacheGroup({ cacheKey: "비공개-cache-key", composite: "multiply", children: null });
    return components.effects.map((effect) => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === "function");
  }

  it("기존 node 호출 순서·4개 timer·raster 반환값·cleanup을 유지한다", async () => {
    vi.useFakeTimers();
    const timing = performanceRecorder();
    vi.stubGlobal("performance", timing);
    const events: string[] = [];
    const rect = { x: -10, y: -10, width: 20, height: 20 };
    const node = cacheNode(events, rect);
    components.node = node;
    const cleanups = await mountCacheGroup();
    const onePass = ["clearCache", "getClientRect", "cache", "getLayer", "batchDraw", "isCached"];
    expect(events).toEqual(onePass);
    expect(vi.getTimerCount()).toBe(4);
    const refresh = components.refresh;
    expect(refresh?.()).toBe(true);
    await vi.advanceTimersByTimeAsync(119);
    expect(node.isCached).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(node.isCached).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(230);
    expect(node.isCached).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(350);
    expect(node.isCached).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(500);
    expect(node.isCached).toHaveBeenCalledTimes(6);
    expect(events).toEqual(Array.from({ length: 6 }, () => onePass).flat());
    expect(node.getClientRect.mock.calls).toEqual(Array.from({ length: 6 }, () => [{ skipTransform: true }]));
    expect(node.cache.mock.calls).toEqual(Array.from({ length: 6 }, () => [{ pixelRatio: undefined }]));
    const details = timing.mark.mock.calls.map(([, options]) => options?.detail);
    expect(details.filter((_detail, index) => index % 2 === 1)).toEqual([
      { kind, reason: "initial", elapsedMs: 0, rect, isCached: true, failed: false },
      { kind, reason: "raster", elapsedMs: 0, rect, isCached: true, failed: false },
      ...Array.from({ length: 4 }, () => ({ kind, reason: "timer", elapsedMs: 0, rect, isCached: true, failed: false })),
    ]);
    cleanups.forEach((cleanup) => cleanup());
    expect(components.unregister).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(refresh?.()).toBe(false);
    const { prepareStudioRasterCapture } = await import("./studio-raster-presentation-cache");
    prepareStudioRasterCapture(node.getStage(), 4)();
    expect(node.cache).toHaveBeenCalledTimes(6);
    expect(node.isCached).toHaveBeenCalledTimes(6);
    expect(JSON.stringify(details)).not.toContain("비공개");
  });

  it.each([2, 4] as const)("실제 registry의 %s× 준비 뒤 기존 기본 DPR로 복원한다", async (density) => {
    vi.useFakeTimers();
    const rect = { x: -10, y: 2, width: 20, height: 30 };
    const node = cacheNode([], rect);
    components.node = node;
    const cleanups = await mountCacheGroup();
    const { prepareStudioRasterCapture } = await import("./studio-raster-presentation-cache");
    const restore = prepareStudioRasterCapture(node.getStage(), density);
    expect(node.cache.mock.calls).toEqual([[{ pixelRatio: undefined }], [{ pixelRatio: density }]]);
    restore();
    expect(node.cache).toHaveBeenLastCalledWith({ pixelRatio: undefined });
    expect(rect).toEqual({ x: -10, y: 2, width: 20, height: 30 });
    cleanups.forEach((cleanup) => cleanup());
  });

  it("출력 중 네 timer와 presentation callback은 현재 밀도를 쓰고 cleanup은 등록을 해제한다", async () => {
    vi.useFakeTimers();
    const node = cacheNode([], { x: 0, y: 0, width: 20, height: 30 });
    components.node = node;
    const cleanups = await mountCacheGroup();
    const { prepareStudioRasterCapture } = await import("./studio-raster-presentation-cache");
    const restore = prepareStudioRasterCapture(node.getStage(), 4);
    node.cache.mockClear();
    await vi.advanceTimersByTimeAsync(120);
    expect(components.refresh?.()).toBe(true);
    await vi.advanceTimersByTimeAsync(1080);
    expect(node.cache.mock.calls).toEqual(Array.from({ length: 5 }, () => [{ pixelRatio: 4 }]));
    restore();
    expect(node.cache).toHaveBeenLastCalledWith({ pixelRatio: undefined });
    cleanups.forEach((cleanup) => cleanup());
    expect(vi.getTimerCount()).toBe(0);
    const calls = node.cache.mock.calls.length;
    prepareStudioRasterCapture(node.getStage(), 2)();
    expect(node.cache).toHaveBeenCalledTimes(calls);
    expect(components.refresh?.()).toBe(false);
  });

  it("준비 중 rect 직접 오류는 원래 오류와 기본 밀도를 보존한다", async () => {
    vi.useFakeTimers();
    const node = cacheNode([], { x: 0, y: 0, width: 20, height: 30 });
    components.node = node;
    const cleanups = await mountCacheGroup();
    const { prepareStudioRasterCapture } = await import("./studio-raster-presentation-cache");
    const failure = new Error("비공개 rect 오류");
    node.getClientRect.mockImplementationOnce(() => { throw failure; });
    let caught: unknown;
    try { prepareStudioRasterCapture(node.getStage(), 4); } catch (error) { caught = error; }
    expect(caught).toBe(failure);
    expect(node.cache).toHaveBeenLastCalledWith({ pixelRatio: undefined });
    await vi.advanceTimersByTimeAsync(120);
    expect(node.cache).toHaveBeenLastCalledWith({ pixelRatio: undefined });
    cleanups.forEach((cleanup) => cleanup());
  });

  it.each(["empty", "cache-fails", "timing-fails"] as const)("%s에서도 기존 분기와 반환값을 유지한다", async (mode) => {
    vi.useFakeTimers();
    const timing = performanceRecorder();
    if (mode === "timing-fails") timing.mark.mockImplementation(() => { throw new Error("비공개 관측 오류"); });
    vi.stubGlobal("performance", timing);
    const events: string[] = [];
    const node = cacheNode(events, { x: 0, y: 0, width: mode === "empty" ? 0 : 20, height: 20 }, mode === "cache-fails");
    components.node = node;
    const cleanups = await mountCacheGroup();
    expect(components.refresh?.()).toBe(mode === "timing-fails");
    const onePass = ["clearCache", "getClientRect",
      ...(mode === "empty" ? [] : mode === "cache-fails" ? ["cache", "clearCache"] : ["cache"]),
      "getLayer", "batchDraw", "isCached"];
    expect(events).toEqual([...onePass, ...onePass]);
    expect(node.isCached).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(4);
    if (mode !== "timing-fails") expect(timing.mark.mock.calls.at(-1)?.[1]?.detail).toMatchObject({
      kind, reason: "raster", isCached: false, failed: mode === "cache-fails",
    });
    cleanups.forEach((cleanup) => cleanup());
  });
});
