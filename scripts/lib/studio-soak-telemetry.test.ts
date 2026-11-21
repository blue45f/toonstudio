import { createContext, runInContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import { drainGpuAndPerf, gcHeap, installGpuAndPerfCollector, markStudioSoakStroke } from "./studio-soak-telemetry";

function browserFixture(observerAvailable = true) {
  let clock = 0;
  let entries: Array<{ startTime: number; duration: number }> = [];
  const context = createContext({
    performance: { timeOrigin: 1_000, now: () => clock },
    navigator: {},
    PerformanceObserver: class {
      observe() { if (!observerAvailable) throw new Error("observer unavailable"); }
      takeRecords() { const result = entries; entries = []; return result; }
    },
  });
  context.window = context;
  const page = {
    async addInitScript(source: string): Promise<void> { runInContext(source, context); },
    async evaluate(source: string): Promise<unknown> { return runInContext(source, context); },
  };
  return { page, context, setClock: (value: number) => { clock = value; },
    longTask: (startTime: number, duration: number) => entries.push({ startTime, duration }) };
}

describe("소크 브라우저 계측기의 실제 설치·수집 계약", () => {
  it("콜백 전달이 늦어도 실제 입력 구간과 겹친 longtask만 분리한다", async () => {
    const browser = browserFixture();
    await installGpuAndPerfCollector(browser.page, "one-session");
    browser.longTask(10, 100); // 입력 전 UI 준비
    browser.setClock(200);
    await markStudioSoakStroke(browser.page, true);
    browser.setClock(300);
    await markStudioSoakStroke(browser.page, false);
    browser.longTask(210, 60);
    browser.longTask(310, 500); // 입력 뒤 강제 GC
    const result = await drainGpuAndPerf(browser.page, 1_000, "one-session", false);
    expect(result).toMatchObject({ sessionId: "one-session", pageEpoch: 1_000,
      longTasks: [
        { atMs: 10, durationMs: 100, duringStroke: false },
        { atMs: 210, durationMs: 60, duringStroke: true },
        { atMs: 310, durationMs: 500, duringStroke: false },
      ] });
    expect((await drainGpuAndPerf(browser.page, 1_000, "one-session", false)).longTasks).toEqual([]);
  });

  it("마지막 입력 뒤 시작한 관측은 이전 입력 구간으로 분류하지 않는다", async () => {
    const browser = browserFixture();
    await installGpuAndPerfCollector(browser.page, "s");
    browser.setClock(100);
    await markStudioSoakStroke(browser.page, true);
    browser.setClock(150);
    await markStudioSoakStroke(browser.page, false);
    await drainGpuAndPerf(browser.page, 1_000, "s", false);
    browser.longTask(200, 50);
    expect((await drainGpuAndPerf(browser.page, 1_000, "s", false)).longTasks[0]?.duringStroke).toBe(false);
  });

  it("설치 누락·observer 오류·다른 세션을 빈 성공 표본으로 대체하지 않는다", async () => {
    const missing = browserFixture();
    await expect(drainGpuAndPerf(missing.page, 1_000, "s", false)).rejects.toThrow();
    const broken = browserFixture(false);
    await installGpuAndPerfCollector(broken.page, "s");
    await expect(drainGpuAndPerf(broken.page, 1_000, "s", false)).rejects.toThrow("필수");
    const different = browserFixture();
    await installGpuAndPerfCollector(different.page, "other");
    await expect(drainGpuAndPerf(different.page, 1_000, "s", false)).rejects.toThrow("필수");
  });

  it("WebGPU 요청 시 observer 부재를 확인되지 않은 상태로 반환한다", async () => {
    const browser = browserFixture();
    await installGpuAndPerfCollector(browser.page, "s");
    await expect(drainGpuAndPerf(browser.page, 1_000, "s", true)).rejects.toThrow("필수");
    expect((await drainGpuAndPerf(browser.page, 1_000, "s", false)).gpuObserverAvailable).toBe(false);
  });

  it("동일 세션의 중첩된 stroke 계측을 거절한다", async () => {
    const browser = browserFixture();
    await installGpuAndPerfCollector(browser.page, "s");
    await markStudioSoakStroke(browser.page, true);
    await expect(markStudioSoakStroke(browser.page, true)).rejects.toThrow("중첩");
  });
});

describe("필수 GC 후 메모리 계측", () => {
  const usage = { usedSize: 100, totalSize: 200, embedderHeapUsedSize: 30, backingStorageSize: 40 };
  const dom = { documents: 1, nodes: 20, jsEventListeners: 4 };
  const cdp = (heapUsage: unknown = usage, domCounters: unknown = dom) => ({
    send: vi.fn(async (method: string): Promise<unknown> => {
      if (method === "Runtime.getHeapUsage") return heapUsage;
      if (method === "Memory.getDOMCounters") return domCounters;
      return {};
    }),
  });

  it("GC 이후 heap·backing storage·DOM을 실제 값으로 반환한다", async () => {
    const session = cdp();
    const result = await gcHeap(session, Date.now());
    expect(session.send.mock.calls.map(([method]) => method)).toEqual([
      "HeapProfiler.collectGarbage", "Runtime.getHeapUsage", "Memory.getDOMCounters",
    ]);
    expect(result).toMatchObject({ usedBytes: 100, totalBytes: 200, embedderBytes: 30,
      backingStorageBytes: 40, documents: 1, nodes: 20, jsEventListeners: 4 });
  });

  it("CDP 연결과 명령 실패를 null로 숨기지 않는다", async () => {
    await expect(gcHeap(null, 0)).rejects.toThrow("CDP");
    const broken = { send: vi.fn(async (): Promise<unknown> => { throw new Error("target detached"); }) };
    await expect(gcHeap(broken, 0)).rejects.toThrow("target detached");
  });

  it.each([
    { usage: { ...usage, usedSize: Number.NaN }, dom },
    { usage: { ...usage, usedSize: 201 }, dom },
    { usage: { usedSize: 100, totalSize: 200 }, dom },
    { usage, dom: { ...dom, jsEventListeners: -1 } },
    { usage, dom: null },
  ])("누락되거나 잘못된 메모리·DOM 표본을 거절한다", async (sample) => {
    await expect(gcHeap(cdp(sample.usage, sample.dom), 0)).rejects.toThrow("필수");
  });
});
