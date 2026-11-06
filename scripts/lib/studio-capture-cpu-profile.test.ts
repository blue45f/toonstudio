import { afterEach, describe, expect, it, vi } from "vitest";

import { serializeStudioCaptureCpuProfile, withStudioCaptureCpuProfile } from "./studio-capture-cpu-profile";

import type { StudioCaptureCpuCollector, StudioCaptureCpuProfile, StudioCaptureCpuSession } from "./studio-capture-cpu-profile";

const frame = { functionName: "render", scriptId: "7", url: "http://127.0.0.1:5199/src/render.ts?q=discard#fragment", lineNumber: 2, columnNumber: 3 };
const profile: StudioCaptureCpuProfile = {
  nodes: [{ id: 1, callFrame: frame, children: [2] }],
  startTime: 10, endTime: 20, samples: [1, 1], timeDeltas: [4, 6],
};
function setup(overrides: Partial<StudioCaptureCpuSession> = {}) {
  const events: string[] = [];
  const saved = new Map<string, string>();
  const session: StudioCaptureCpuSession = {
    enable: async () => { events.push("enable"); },
    start: async () => { events.push("start"); },
    stop: async () => { events.push("stop"); return profile; },
    disable: async () => { events.push("disable"); },
    detach: async () => { events.push("detach"); },
    ...overrides,
  };
  const collector: StudioCaptureCpuCollector = {
    createSession: vi.fn(async () => { events.push("create"); return session; }),
    attach: vi.fn(async (name, body) => { saved.set(name, body); }),
  };
  return { events, saved, collector };
}
afterEach(() => vi.useRealTimers());

describe("PNG CPU 관측의 결과 보존", () => {
  it("비활성화 때 CDP·첨부에 접근하지 않고 원래 작업을 한 번 실행한다", async () => {
    const { collector } = setup(); const operation = vi.fn(async () => 17);
    await expect(withStudioCaptureCpuProfile(false, collector, "png", operation)).resolves.toBe(17);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(collector.createSession).not.toHaveBeenCalled(); expect(collector.attach).not.toHaveBeenCalled();
  });
  it("정상 수집 뒤 결과와 프로파일 구조를 유지하고 외부 위치는 지운다", async () => {
    const { events, saved, collector } = setup();
    await expect(withStudioCaptureCpuProfile(true, collector, "../png", async () => { events.push("operation"); return 23; })).resolves.toBe(23);
    expect(events).toEqual(["create", "enable", "start", "operation", "stop", "disable", "detach"]);
    expect(JSON.parse(saved.get("..-png.cpuprofile.json") ?? "{}")).toMatchObject({
      nodes: [{ id: 1, callFrame: { url: "http://127.0.0.1:5199/src/render.ts" }, children: [2] }], samples: [1, 1], timeDeltas: [4, 6],
    });
    expect(profile.nodes[0]?.callFrame.url).toContain("?q=discard");
    expect(JSON.parse(saved.get("..-png.cpu-observation.json") ?? "{}")).toEqual({ started: true, profileSaved: true, unavailable: false, cleanupFailed: false });
  });
  it("원래 PNG 오류를 관측·정리 실패로 덮거나 재시도하지 않는다", async () => {
    const { collector } = setup({ stop: async () => { throw new Error("observer"); }, disable: async () => { throw new Error("cleanup"); } });
    const failure = new Error("actual PNG"); const operation = vi.fn(async () => { throw failure; });
    await expect(withStudioCaptureCpuProfile(true, collector, "png", operation)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it("시작 실패나 첨부 실패에도 실제 성공 결과를 유지한다", async () => {
    const { collector } = setup({ start: async () => { throw new Error("start"); } });
    collector.attach = vi.fn(async () => { throw new Error("attach"); });
    await expect(withStudioCaptureCpuProfile(true, collector, "png", async () => 31)).resolves.toBe(31);
  });
  it("관측 연결이 멈춰도 2초 뒤 원래 작업으로 진행한다", async () => {
    vi.useFakeTimers();
    const { collector } = setup(); collector.createSession = () => new Promise(() => undefined);
    const operation = vi.fn(async () => 41);
    const pending = withStudioCaptureCpuProfile(true, collector, "png", operation);
    await vi.advanceTimersByTimeAsync(2_001);
    await expect(pending).resolves.toBe(41); expect(operation).toHaveBeenCalledTimes(1);
  });
  it("개인 file 경로·외부 host·blob 식별자를 보존하지 않는다", () => {
    const urls = ["file:///private/location/render.ts?q=drop", "https://example.test/secret?q=drop", "blob:http://localhost/identifier", "http://localhost:5199/@fs/Users/private/location/render.ts?q=drop", "http://127.0.0.1:5199/%40fs/Users/private/location/render.ts#drop"];
    const output = JSON.parse(serializeStudioCaptureCpuProfile({ ...profile, nodes: urls.map((url, index) => ({ id: index + 1, callFrame: { ...frame, url } })) }));
    expect(output.nodes.map((node: { callFrame: { url: string } }) => node.callFrame.url)).toEqual(["file:///render.ts", "external-script", "blob:local", "http://localhost:5199/@fs/render.ts", "http://127.0.0.1:5199/@fs/render.ts"]);
    expect(JSON.stringify(output)).not.toMatch(/private|location|example|identifier|q=drop/u);
  });
  it("큰 표본은 저장 전에 거절한다", () => {
    expect(() => serializeStudioCaptureCpuProfile({ ...profile, samples: Array.from({ length: 200_001 }, () => 1) })).toThrow("진단 한도");
  });
  it("연결 제한 시간 뒤 늦게 도착한 CDP 세션도 회수한다", async () => {
    vi.useFakeTimers();
    const { collector, events } = setup();
    const create = collector.createSession;
    collector.createSession = async () => {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      return create();
    };
    const operation = vi.fn(async () => 43);
    const pending = withStudioCaptureCpuProfile(true, collector, "png", operation);
    await vi.advanceTimersByTimeAsync(2_001);
    await expect(pending).resolves.toBe(43);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(events).toEqual(["create", "disable", "detach"]);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

