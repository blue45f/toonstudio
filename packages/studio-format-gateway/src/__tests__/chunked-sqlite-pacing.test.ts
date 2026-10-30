import { describe, expect, it, vi } from "vitest";

import { ClipDocumentError } from "../chunked-sqlite-document-types";
import { CLIP_YIELD_INTERVAL_MS, createClipPacer, type ClipPacerEnvironment } from "../chunked-sqlite-pacing";

/** 시계와 양보를 손으로 움직이는 환경. */
function fakeEnvironment(start = 0): { environment: ClipPacerEnvironment; clock: { time: number }; yields: { count: number }; onYield: { run: () => void } } {
  const clock = { time: start };
  const yields = { count: 0 };
  const onYield = { run: () => undefined };
  const environment: ClipPacerEnvironment = {
    now: () => clock.time,
    yieldToEventLoop: async () => {
      yields.count += 1;
      onYield.run();
    },
  };
  return { environment, clock, yields, onYield };
}

describe("createClipPacer", () => {
  it("양보 간격은 25ms다", () => {
    expect(CLIP_YIELD_INTERVAL_MS).toBe(25);
  });

  it("경과가 25ms 미만이면 양보하지 않고, 정확히 25ms와 그 이상이면 양보한다(24/25/26ms 경계)", async () => {
    const results: number[] = [];
    for (const elapsed of [0, 1, 24, 25, 26, 1000]) {
      const { environment, clock, yields } = fakeEnvironment(500);
      const pace = createClipPacer(undefined, environment);
      clock.time = 500 + elapsed;
      await pace();
      results.push(yields.count);
    }

    expect(results).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it("기준 시각은 만들 때의 시각이다(0이 아니다)", async () => {
    const { environment, clock, yields } = fakeEnvironment(1000);
    const pace = createClipPacer(undefined, environment);

    clock.time = 1024;
    await pace();
    expect(yields.count).toBe(0);
    clock.time = 1025;
    await pace();
    expect(yields.count).toBe(1);
  });

  it("양보한 뒤에는 양보가 끝난 시각이 새 기준이 된다", async () => {
    const { environment, clock, yields, onYield } = fakeEnvironment(0);
    const pace = createClipPacer(undefined, environment);
    onYield.run = () => {
      clock.time += 10; // 양보하는 동안 10ms가 더 흘렀다.
    };

    clock.time = 30;
    await pace(); // 30ms 경과 → 양보, 끝난 시각 40이 새 기준.
    expect(yields.count).toBe(1);
    clock.time = 40 + 24;
    await pace();
    expect(yields.count).toBe(1);
    clock.time = 40 + 25;
    await pace();
    expect(yields.count).toBe(2);
  });

  it("양보하지 않을 때는 기준 시각을 옮기지 않는다", async () => {
    const { environment, clock, yields } = fakeEnvironment(0);
    const pace = createClipPacer(undefined, environment);

    clock.time = 20;
    await pace();
    clock.time = 24;
    await pace();
    expect(yields.count).toBe(0);
    clock.time = 25;
    await pace();
    expect(yields.count).toBe(1);
  });

  it("중단 신호가 서 있으면 양보하지 않을 때도 매번 aborted를 던진다", async () => {
    const { environment, yields } = fakeEnvironment(0);
    const controller = new AbortController();
    const pace = createClipPacer(controller.signal, environment);

    await pace();
    controller.abort();
    await expect(pace()).rejects.toMatchObject({ code: "aborted" });
    await expect(pace()).rejects.toBeInstanceOf(ClipDocumentError);
    expect(yields.count).toBe(0);
  });

  it("양보하는 동안 중단되면 양보를 마친 뒤 aborted를 던진다", async () => {
    const { environment, clock, onYield } = fakeEnvironment(0);
    const controller = new AbortController();
    const pace = createClipPacer(controller.signal, environment);
    onYield.run = () => controller.abort();

    clock.time = 100;
    await expect(pace()).rejects.toMatchObject({ code: "aborted" });
  });

  it("이미 중단된 신호로 만들어도 만드는 일은 던지지 않고 부를 때 던진다", async () => {
    const controller = new AbortController();
    controller.abort();
    const { environment } = fakeEnvironment(0);
    const pace = createClipPacer(controller.signal, environment);

    await expect(pace()).rejects.toMatchObject({ code: "aborted" });
  });

  it("기본 환경은 performance 시계와 setTimeout(0)으로 양보한다(가짜 타이머로 확인)", async () => {
    vi.useFakeTimers();
    try {
      let clock = 1_000;
      const performanceSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);
      const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => 5);
      const pace = createClipPacer(undefined);

      // 25ms 미만이면 양보(타이머)를 걸지 않는다.
      clock = 1_000 + CLIP_YIELD_INTERVAL_MS - 1;
      await pace();
      expect(vi.getTimerCount()).toBe(0);

      // 25ms가 지나면 delay 0인 타이머 하나로 양보하고, 그 타이머가 돌아야 pace()가 끝난다.
      clock = 1_000 + CLIP_YIELD_INTERVAL_MS;
      let finished = false;
      const waiting = pace().then(() => {
        finished = true;
      });
      await Promise.resolve();
      expect(vi.getTimerCount()).toBe(1);
      expect(finished).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      await waiting;
      expect(finished).toBe(true);
      expect(performanceSpy).toHaveBeenCalled();
      // performance가 있으면 Date.now()는 시계로 쓰지 않는다.
      expect(dateSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it("performance가 없는 환경에서는 Date.now()를 시계로 쓴다", async () => {
    vi.useFakeTimers();
    try {
      let now = 10_000;
      vi.stubGlobal("performance", undefined);
      const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
      const pace = createClipPacer(undefined);

      now = 10_000 + CLIP_YIELD_INTERVAL_MS - 1;
      await pace();
      expect(vi.getTimerCount()).toBe(0);
      now = 10_000 + CLIP_YIELD_INTERVAL_MS;
      const waiting = pace();
      await Promise.resolve();
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(0);
      await waiting;
      expect(dateSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it("기본 환경도 이미 중단된 신호에는 aborted를 던진다", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(createClipPacer(controller.signal)()).rejects.toMatchObject({ code: "aborted" });
  });
});
