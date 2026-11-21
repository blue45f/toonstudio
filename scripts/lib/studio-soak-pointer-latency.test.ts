import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  armStudioSoakPointerLatency, drainStudioSoakPointerLatency, shouldRunStudioSoakCycle,
  studioSoakPointerLatencyIssues, summarizeStudioSoakPointerLatency,
  type StudioSoakPointerLatency, type StudioSoakPointerMode,
} from "./studio-soak-pointer-latency";

function browserFixture() {
  let clock = 0, nextRaf = 0;
  const listeners = new Map<string, Set<(event: object) => void>>();
  const frames = new Map<number, () => void>();
  const target = {}, stage = { contains: (node: unknown) => node === target };
  const context = createContext({
    performance: { timeOrigin: 1_000, now: () => clock }, location: { href: "http://preview/studio/canvas" },
    document: { querySelector: () => stage },
    requestAnimationFrame: (callback: () => void) => { frames.set(++nextRaf, callback); return nextRaf; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    addEventListener: (type: string, callback: (event: object) => void, options: unknown) => {
      expect(options).toMatchObject({ capture: true, passive: true });
      const group = listeners.get(type) ?? new Set(); group.add(callback); listeners.set(type, group);
    },
    removeEventListener: (type: string, callback: (event: object) => void) => listeners.get(type)?.delete(callback),
    __studioFiveHourTelemetry: { sessionId: "session", pageEpoch: 1_000 },
  });
  context.window = context;
  const page = { async evaluate(source: string): Promise<unknown> { return runInContext(source, context); } };
  const event = (type: string, at: number, overrides = {}) => {
    clock = at;
    for (const callback of listeners.get(type) ?? []) callback({
      type, target, pointerId: 7, pointerType: "pen", isTrusted: true, ...overrides,
    });
  };
  return {
    page, context, event, frames,
    frame(at: number) { clock = at; const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(); },
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}
const identity = { sessionId: "session", cycle: 1, inputMode: "pen" as const, expectedMoves: 2 };

function sample(cycle: number, down: number, latencies: readonly number[] = [5, 6]): StudioSoakPointerLatency {
  return {
    ...identity, cycle, pageEpoch: 1_000, documentUrl: "http://preview/studio/canvas",
    expectedMoves: latencies.length, observedMoves: latencies.length, observedPointerTypes: ["pen"],
    pointerDownAtMs: down, pointerUpAtMs: down + latencies.length + 1, cancelled: false, pendingMoves: 0,
    events: latencies.map((latencyMs, index) => ({ observedAtMs: down + index + 1,
      nextRafAtMs: down + index + 1 + latencyMs, latencyMs })), errors: [],
  };
}
const stroke = (pointerLatency: StudioSoakPointerLatency) => ({
  cycle: pointerLatency.cycle, brushId: "pen", inputMode: "pen" as const,
  pointerPoints: pointerLatency.expectedMoves + 1, pointerLatency,
});
const summarize = (strokes = [stroke(sample(1, 0)), stroke(sample(2, 100))]) => summarizeStudioSoakPointerLatency({
  requested: true, sessionId: "session", sessionStartedAt: 1_000, requestedDurationMs: 100,
  pageEpochs: [1_000], attemptedStrokes: strokes.length, strokes,
});

describe("같은 원고의 기존 포인터 입력을 수동 관측한다", () => {
  it("hover와 다음 획을 제외하고 같은 프레임의 각 입력 시각을 보존한다", async () => {
    const f = browserFixture();
    await armStudioSoakPointerLatency(f.page, identity);
    f.event("pointermove", 5); f.event("pointerdown", 10);
    f.event("pointermove", 11); f.event("pointermove", 12); f.frame(20);
    f.event("pointerup", 21); f.event("pointermove", 22);
    const result = await drainStudioSoakPointerLatency(f.page);
    expect(result).toMatchObject({ ...identity, pageEpoch: 1_000, observedMoves: 2,
      pointerDownAtMs: 10, pointerUpAtMs: 21, pendingMoves: 0, observedPointerTypes: ["pen"],
      events: [{ observedAtMs: 11, nextRafAtMs: 20, latencyMs: 9 }, { observedAtMs: 12, nextRafAtMs: 20, latencyMs: 8 }] });
    expect(studioSoakPointerLatencyIssues(result)).toEqual([]);
    expect(f.listenerCount()).toBe(0); expect(f.frames.size).toBe(0);
    expect(f.context.__studioSoakPointerLatency).toBeUndefined();
    await armStudioSoakPointerLatency(f.page, { ...identity, cycle: 2 });
    expect(f.listenerCount()).toBe(4);
    await drainStudioSoakPointerLatency(f.page);
    expect(f.listenerCount()).toBe(0);
  });

  it.each(["mouse", "pen", "touch"] as const)("실제로 받은 %s 종류를 검사하고 입력을 생성하지 않는다", async (inputMode: StudioSoakPointerMode) => {
    const f = browserFixture();
    await armStudioSoakPointerLatency(f.page, { ...identity, inputMode, expectedMoves: 1 });
    f.event("pointerdown", 10, { pointerType: inputMode });
    f.event("pointermove", 11, { pointerType: inputMode });
    f.event("pointerup", 12, { pointerType: inputMode }); f.frame(20);
    const result = await drainStudioSoakPointerLatency(f.page);
    expect(result.observedPointerTypes).toEqual([inputMode]);
    expect(studioSoakPointerLatencyIssues(result)).toEqual([]);
    // fixture에는 evaluate 외에 mouse/keyboard/CDP/navigation API 자체가 없다.
  });

  it.each([
    { name: "취소", type: "pointercancel", override: {}, issue: "pointer-cancelled" },
    { name: "틀린 입력 종류", type: "pointerup", override: { pointerType: "mouse" }, issue: "pointer-type" },
    { name: "DOM 합성 입력", type: "pointerup", override: { isTrusted: false }, issue: "untrusted-event" },
    { name: "다른 포인터", type: "pointerup", override: { pointerId: 8 }, issue: "pointer-id" },
  ])("$name을 완전한 관측으로 만들지 않는다", async ({ type, override, issue }) => {
    const f = browserFixture(); await armStudioSoakPointerLatency(f.page, identity);
    f.event("pointerdown", 10); f.event("pointermove", 11); f.event("pointermove", 12); f.frame(20);
    f.event(type, 21, override);
    expect(studioSoakPointerLatencyIssues(await drainStudioSoakPointerLatency(f.page))).toContain(issue);
    expect(f.listenerCount()).toBe(0);
  });

  it("미관측 RAF·누락 move·pointerup은 0ms 성공 표본으로 대체하지 않는다", async () => {
    const f = browserFixture(); await armStudioSoakPointerLatency(f.page, identity);
    f.event("pointerdown", 10); f.event("pointermove", 11);
    const result = await drainStudioSoakPointerLatency(f.page);
    expect(result.events).toEqual([]); expect(result.pendingMoves).toBe(1);
    expect(studioSoakPointerLatencyIssues(result)).toEqual(expect.arrayContaining(["stroke-boundary", "move-coverage"]));
    expect(f.listenerCount()).toBe(0); expect(f.frames.size).toBe(0);
  });

  it("예상 입력 수를 넘겨도 원시 배열은 획의 최대 표본 수로 제한한다", async () => {
    const f = browserFixture(); await armStudioSoakPointerLatency(f.page, identity);
    f.event("pointerdown", 10);
    for (let index = 0; index < 1_000; index += 1) f.event("pointermove", 11 + index);
    f.event("pointerup", 1_020); f.frame(1_030);
    const result = await drainStudioSoakPointerLatency(f.page);
    expect(result.events).toHaveLength(2); expect(result.observedMoves).toBe(1_000);
    expect(studioSoakPointerLatencyIssues(result)).toContain("move-overflow");
  });

  it("세션 불일치·중첩·관측기 소실과 잘못된 시각을 거절한다", async () => {
    const f = browserFixture();
    await expect(armStudioSoakPointerLatency(f.page, { ...identity, sessionId: "different" })).rejects.toThrow("세션");
    await expect(drainStudioSoakPointerLatency(f.page)).rejects.toThrow("사라졌");
    await armStudioSoakPointerLatency(f.page, identity);
    await expect(armStudioSoakPointerLatency(f.page, identity)).rejects.toThrow("중첩");
    f.event("pointerdown", 10); f.event("pointermove", Number.NaN); f.frame(20); f.event("pointerup", 21);
    await expect(drainStudioSoakPointerLatency(f.page)).rejects.toThrow("원시 표본");
    expect(f.listenerCount()).toBe(0); expect(f.frames.size).toBe(0);
  });
});

describe("10분 창의 raw 이벤트와 실제 원고 나이", () => {
  it("획별 percentile 평균 대신 전체 이벤트로 p95/p99를 계산한다", () => {
    const result = summarize([stroke(sample(1, 0, Array.from({ length: 98 }, () => 1))), stroke(sample(2, 100, [100, 100]))]);
    expect(result).toMatchObject({ measured: true, lastStrokeAgeMs: 100, lastInputAgeMs: 102,
      physicalDeviceCertified: false, pixelPresentationMeasured: false, appendCompletionMeasured: false,
      windows: [{ sampleCount: 100, p95Ms: 1, p99Ms: 100, maxMs: 100, strokeCount: 2 }] });
  });

  it("각 이벤트의 실제 나이로 10분 창을 나누고 deadline 뒤 획을 별도로 남긴다", () => {
    const strokes = [stroke(sample(1, 0)), stroke(sample(2, 600_000)), stroke(sample(3, 1_200_000))];
    const result = summarizeStudioSoakPointerLatency({ requested: true, sessionId: "session", sessionStartedAt: 1_000,
      requestedDurationMs: 1_200_000, pageEpochs: [1_000], attemptedStrokes: 3, strokes });
    expect(result.measured).toBe(true);
    expect(result.windows.map((window) => [window.startAgeMs, window.sampleCount])).toEqual([[0, 2], [600_000, 2], [1_200_000, 2]]);
    expect(result.lastStrokeAgeMs).toBe(1_200_000);
  });

  it.each([
    { name: "다른 epoch", patch: { pageEpoch: 2_000 }, issue: "2:session-cycle" },
    { name: "다른 세션", patch: { sessionId: "other" }, issue: "2:session-cycle" },
    { name: "다른 cycle", patch: { cycle: 1 }, issue: "1:session-cycle" },
    { name: "틀린 입력", patch: { inputMode: "mouse" as const }, issue: "2:input-identity" },
    { name: "미관측 RAF", patch: { pendingMoves: 1 }, issue: "2:move-coverage" },
  ])("$name을 최종 동일 원고 근거로 인정하지 않는다", ({ patch, issue }) => {
    const strokes = [stroke(sample(1, 0)), stroke(sample(2, 100))];
    strokes[1]!.pointerLatency = { ...strokes[1]!.pointerLatency, ...patch };
    const result = summarize(strokes);
    expect(result.measured).toBe(false); expect(result.issues).toContain(issue);
  });

  it("마지막 표본이 요청 시간 이전이면 전체 세션 시간만으로 보완할 수 없다", () => {
    expect(summarize([stroke(sample(1, 0)), stroke(sample(2, 99))]).issues).toContain("terminal-stroke-age");
  });

  it("중간 창 누락·URL 변경·획 누락을 마지막 정상 표본으로 채우지 않는다", () => {
    const first = stroke(sample(1, 0)), last = stroke({ ...sample(2, 1_200_000), documentUrl: "http://preview/another" });
    const result = summarizeStudioSoakPointerLatency({ requested: true, sessionId: "session", sessionStartedAt: 1_000,
      requestedDurationMs: 1_200_000, pageEpochs: [1_000], attemptedStrokes: 3, strokes: [first, last] });
    expect(result.issues).toEqual(expect.arrayContaining(["age-window:600000", "document-url", "stroke-coverage"]));
  });

  it("옵션을 끄면 기본 소크에 새 입력이나 지연 증거 요구를 추가하지 않는다", () => {
    expect(summarizeStudioSoakPointerLatency({ requested: false, requestedDurationMs: 100,
      pageEpochs: [], attemptedStrokes: 5, strokes: [] })).toMatchObject({ requested: false, measured: false, issues: [] });
    expect(shouldRunStudioSoakCycle(99, 100, false, false)).toBe(true);
    expect(shouldRunStudioSoakCycle(100, 100, false, false)).toBe(false);
    expect(shouldRunStudioSoakCycle(100, 100, true, false)).toBe(true);
    expect(shouldRunStudioSoakCycle(101, 100, true, true)).toBe(false);
  });
});
