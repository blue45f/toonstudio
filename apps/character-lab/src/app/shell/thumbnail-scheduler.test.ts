import { afterEach, describe, expect, it, vi } from "vitest";

import { failVisible } from "../../contracts";
import { createMockEngine } from "../../testing/mock-engine";
import { applyPlanFixture, minimalHumanoidModelFixture } from "../../testing/recipe-fixtures";

import { createBrowserThumbnailPacing, createThumbnailScheduler, defaultThumbnailPacing } from "./thumbnail-scheduler";

import type { ThumbnailPacing, ThumbnailSchedulerDeps } from "./thumbnail-scheduler";
import type { CharacterEngine, CharacterSource, PresetId, ThumbnailEntry, ThumbnailRequest } from "../../contracts";

function harness(engine: CharacterEngine | null, options: { keyVersion?: () => string; sourceFor?: ThumbnailSchedulerDeps["sourceFor"]; pacing?: ThumbnailPacing } = {}) {
  const entries = new Map<PresetId, ThumbnailEntry>();
  const updates: Array<{ presetId: PresetId; entry: ThumbnailEntry }> = [];
  const scheduler = createThumbnailScheduler({
    engine: () => engine,
    planForPreset: () => applyPlanFixture(),
    cacheKeyFor: (presetId) => `${presetId}#${options.keyVersion?.() ?? "v1"}`,
    currentEntry: (presetId) => entries.get(presetId),
    onUpdate: (presetId, entry) => {
      entries.set(presetId, entry);
      updates.push({ presetId, entry });
    },
    ...(options.sourceFor ? { sourceFor: options.sourceFor } : {}),
    ...(options.pacing ? { pacing: options.pacing } : {}),
  });
  return { scheduler, entries, updates };
}

describe("app/shell/thumbnail-scheduler", () => {
  it("동시 1개만 실행하고 가시 카드를 먼저 처리한다", async () => {
    const engine = createMockEngine({ holdThumbnails: true });
    const { scheduler, updates } = harness(engine);
    scheduler.request("hair/soft-bob");
    scheduler.request("hair/hime-cut");
    scheduler.request("eyes/almond", { visible: true });
    expect(scheduler.isRunning()).toBe(true);
    expect(scheduler.pending()).toBe(2);
    await Promise.resolve();
    expect(engine.pendingThumbnails()).toBe(1);
    engine.releaseThumbnail();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // 두 번째로 실행된 것은 가시 카드(eyes/almond)
    expect(engine.calls.filter((call) => call.method === "renderThumbnail").map((call) => (call.args[0] as { presetId: string }).presetId)).toEqual([
      "hair/soft-bob",
      "eyes/almond",
    ]);
    engine.releaseThumbnail();
    await new Promise((resolve) => setTimeout(resolve, 0));
    engine.releaseThumbnail();
    await scheduler.idle();
    const ready = updates.filter((update) => update.entry.status === "ready").map((update) => update.presetId);
    expect(ready).toEqual(["hair/soft-bob", "eyes/almond", "hair/hime-cut"]);
    expect(updates[0]?.entry.status).toBe("pending");
  });

  it("실패는 ThumbnailEntry.failed(reasonKo)로 노출하고 큐를 계속 진행한다", async () => {
    const engine = createMockEngine({
      failThumbnail: (req) => (req.presetId === "hair/hime-cut" ? failVisible("thumb-fail", "썸네일 렌더 실패(모의)", undefined, 0) : null),
    });
    const { scheduler, entries } = harness(engine);
    scheduler.request("hair/hime-cut");
    scheduler.request("hair/soft-bob");
    await scheduler.idle();
    expect(entries.get("hair/hime-cut")).toMatchObject({ status: "failed", reasonKo: "썸네일 렌더 실패(모의)" });
    expect(entries.get("hair/soft-bob")?.status).toBe("ready");
    expect(entries.get("hair/soft-bob")?.raster?.width).toBe(128);
  });

  it("같은 cacheKey로 ready이면 건너뛰고, 키가 바뀌면 다시 만든다", async () => {
    let version = "a";
    const engine = createMockEngine();
    const { scheduler } = harness(engine, { keyVersion: () => version });
    scheduler.request("hair/soft-bob");
    await scheduler.idle();
    scheduler.request("hair/soft-bob");
    await scheduler.idle();
    expect(engine.calls.filter((call) => call.method === "renderThumbnail")).toHaveLength(1);
    version = "b";
    scheduler.request("hair/soft-bob");
    await scheduler.idle();
    expect(engine.calls.filter((call) => call.method === "renderThumbnail")).toHaveLength(2);
  });

  it("엔진이 없으면 failed 사유를 기록한다", async () => {
    const { scheduler, entries } = harness(null);
    scheduler.request("hair/soft-bob");
    await scheduler.idle();
    expect(entries.get("hair/soft-bob")).toMatchObject({ status: "failed", reasonKo: expect.stringContaining("엔진이 준비되지") });
  });

  it("대기 중 중복 요청은 하나로 합치고 cancel/clear로 뺀다", async () => {
    const engine = createMockEngine({ holdThumbnails: true });
    const { scheduler } = harness(engine);
    scheduler.request("hair/soft-bob");
    scheduler.request("hair/hime-cut");
    scheduler.request("hair/hime-cut", { visible: true });
    expect(scheduler.pending()).toBe(1);
    scheduler.cancel("hair/hime-cut");
    expect(scheduler.pending()).toBe(0);
    scheduler.request("eyes/almond");
    scheduler.clear();
    expect(scheduler.pending()).toBe(0);
    engine.releaseThumbnail();
    await scheduler.idle();
  });
  describe("지오메트리 프리셋 임시 소스(thumbnailSources)", () => {
    const hairSource: CharacterSource = { kind: "procedural", model: minimalHumanoidModelFixture() };
    const requestsOf = (engine: ReturnType<typeof createMockEngine>): ThumbnailRequest[] =>
      engine.calls.filter((call) => call.method === "renderThumbnail").map((call) => call.args[0] as ThumbnailRequest);

    it("엔진이 thumbnailSources를 지원하면 sourceFor 결과를 요청에 싣고, null은 싣지 않는다", async () => {
      const engine = createMockEngine({ thumbnailSources: true });
      const asked: PresetId[] = [];
      const { scheduler, entries } = harness(engine, {
        sourceFor: (presetId) => {
          asked.push(presetId);
          return presetId.startsWith("hair/") ? hairSource : null;
        },
      });
      scheduler.request("hair/soft-bob");
      scheduler.request("eyes/almond");
      await scheduler.idle();
      const [hair, eyes] = requestsOf(engine);
      expect(hair?.source).toBe(hairSource);
      expect(eyes && "source" in eyes).toBe(false);
      expect(asked).toEqual(["hair/soft-bob", "eyes/almond"]);
      expect(entries.get("hair/soft-bob")?.status).toBe("ready");
    });

    it("엔진이 지원을 선언하지 않으면 sourceFor를 부르지 않는다(현재 소스로 그린다)", async () => {
      for (const engine of [createMockEngine(), createMockEngine({ thumbnailSources: false })]) {
        let calls = 0;
        const { scheduler } = harness(engine, {
          sourceFor: () => {
            calls += 1;
            return hairSource;
          },
        });
        scheduler.request("hair/soft-bob");
        await scheduler.idle();
        expect(calls).toBe(0);
        expect(requestsOf(engine).every((request) => !("source" in request))).toBe(true);
      }
    });

    it("sourceFor가 비동기이거나 던져도 해당 카드만 failed(reasonKo)가 되고 큐는 계속된다", async () => {
      const engine = createMockEngine({ thumbnailSources: true });
      const { scheduler, entries } = harness(engine, {
        sourceFor: async (presetId) => {
          if (presetId === "hair/hime-cut") throw failVisible("thumb-source-failed", "임시 소스를 만들지 못했습니다.", undefined, 0);
          return hairSource;
        },
      });
      scheduler.request("hair/hime-cut");
      scheduler.request("hair/soft-bob");
      await scheduler.idle();
      expect(entries.get("hair/hime-cut")).toMatchObject({ status: "failed", reasonKo: "임시 소스를 만들지 못했습니다." });
      expect(entries.get("hair/soft-bob")?.status).toBe("ready");
      expect(requestsOf(engine)).toHaveLength(1);
    });
  });
});

/** 가짜 타이머로 도는 양보 정책: 매크로태스크 양보 = setTimeout 0, 유휴 대기 = setTimeout 50 */
function fakeTimerPacing(quietMs = 100): ThumbnailPacing {
  return {
    quietMs,
    schedule(callback, ms) {
      const handle = setTimeout(callback, ms);
      return () => clearTimeout(handle);
    },
    yieldToMain: () => new Promise((resolve) => setTimeout(resolve, 0)),
    whenIdle: () => new Promise((resolve) => setTimeout(resolve, 50)),
  };
}

describe("app/shell/thumbnail-scheduler 메인 스레드 양보(P-01)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const rendered = (engine: ReturnType<typeof createMockEngine>): string[] =>
    engine.calls.filter((call) => call.method === "renderThumbnail").map((call) => (call.args[0] as { presetId: string }).presetId);

  it("다시 그릴 요청 뒤 quietMs 동안 조용해야 시작하고, 요청이 이어지면(슬라이더 드래그) 계속 미뤘다가 마지막 키로 한 번만 그린다", async () => {
    vi.useFakeTimers();
    let version = 1;
    const engine = createMockEngine();
    const { scheduler, entries } = harness(engine, { keyVersion: () => `v${version}`, pacing: fakeTimerPacing(100) });
    scheduler.request("hair/soft-bob", { visible: true });
    expect(scheduler.isRunning()).toBe(false);
    for (let step = 0; step < 6; step += 1) {
      await vi.advanceTimersByTimeAsync(40);
      version += 1;
      scheduler.request("hair/soft-bob", { visible: true });
    }
    // 드래그 6스텝(240 ms) 동안 한 번도 그리지 않았다
    expect(rendered(engine)).toEqual([]);
    await vi.advanceTimersByTimeAsync(150);
    await scheduler.idle();
    expect(rendered(engine)).toEqual(["hair/soft-bob"]);
    expect(entries.get("hair/soft-bob")).toMatchObject({ status: "ready", cacheKey: `hair/soft-bob#v${version}` });
  });

  it("보이는 카드를 먼저 그리고 보이지 않는 카드는 유휴 대기 뒤에 그린다", async () => {
    vi.useFakeTimers();
    const engine = createMockEngine();
    const { scheduler } = harness(engine, { pacing: fakeTimerPacing(100) });
    scheduler.request("hair/hime-cut");
    scheduler.request("eyes/almond", { visible: true });
    const done = scheduler.idle();
    await vi.advanceTimersByTimeAsync(400);
    await done;
    expect(rendered(engine)).toEqual(["eyes/almond", "hair/hime-cut"]);
  });

  it("작업마다 매크로태스크로 양보한다(한 태스크에서 여러 장을 연달아 그리지 않는다)", async () => {
    // 양보를 손으로 풀어 주는 정책: 양보 1번 = 매크로태스크 1개
    const hops: Array<() => void> = [];
    const pacing: ThumbnailPacing = { ...fakeTimerPacing(0), yieldToMain: () => new Promise<void>((resolve) => hops.push(resolve)) };
    const engine = createMockEngine();
    const { scheduler } = harness(engine, { pacing });
    scheduler.request("hair/soft-bob", { visible: true });
    scheduler.request("hair/hime-cut", { visible: true });
    scheduler.request("eyes/almond", { visible: true });
    const flushMicrotasks = async (): Promise<void> => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    };
    await flushMicrotasks();
    // 마이크로태스크만으로는 아무것도 그리지 않는다
    expect(rendered(engine)).toEqual([]);
    for (const expected of [["hair/soft-bob"], ["hair/soft-bob", "hair/hime-cut"], ["hair/soft-bob", "hair/hime-cut", "eyes/almond"]]) {
      expect(hops).toHaveLength(1);
      hops.shift()?.();
      await flushMicrotasks();
      // 양보 한 번마다 정확히 한 장
      expect(rendered(engine)).toEqual(expected);
    }
    await scheduler.idle();
    expect(scheduler.isRunning()).toBe(false);
  });

  it("시작 전에 레시피가 바뀐(cacheKey 불일치) 작업은 그리지 않고, 새 키 요청은 그린다", async () => {
    vi.useFakeTimers();
    let version = 1;
    const engine = createMockEngine();
    const { scheduler, entries } = harness(engine, { keyVersion: () => `v${version}`, pacing: fakeTimerPacing(0) });
    scheduler.request("hair/soft-bob", { visible: true });
    version = 2;
    await vi.advanceTimersByTimeAsync(5);
    await scheduler.idle();
    expect(rendered(engine)).toEqual([]);
    expect(entries.get("hair/soft-bob")).toMatchObject({ status: "pending", cacheKey: "hair/soft-bob#v1" });
    scheduler.request("hair/soft-bob", { visible: true });
    await vi.advanceTimersByTimeAsync(5);
    await scheduler.idle();
    expect(rendered(engine)).toEqual(["hair/soft-bob"]);
    expect(entries.get("hair/soft-bob")).toMatchObject({ status: "ready", cacheKey: "hair/soft-bob#v2" });
  });

  it("임시 소스를 만든 뒤 레시피가 바뀌면 렌더하지 않는다(소스 빌드와 렌더 사이에도 양보한다)", async () => {
    vi.useFakeTimers();
    let version = 1;
    const engine = createMockEngine({ thumbnailSources: true });
    const { scheduler } = harness(engine, {
      keyVersion: () => `v${version}`,
      pacing: fakeTimerPacing(0),
      sourceFor: () => {
        version = 2;
        return { kind: "procedural", model: minimalHumanoidModelFixture() };
      },
    });
    scheduler.request("hair/soft-bob", { visible: true });
    await vi.advanceTimersByTimeAsync(5);
    await scheduler.idle();
    expect(rendered(engine)).toEqual([]);
  });
});

describe("app/shell/thumbnail-scheduler 다시 그리는 동안 옛 그림 유지", () => {
  it("이미 그려진 카드는 새 키로 다시 요청돼도 pending으로 바꾸지 않고(그림이 사라지지 않는다) 새 그림이 나오면 바꾼다", async () => {
    let version = 1;
    const engine = createMockEngine({ holdThumbnails: true });
    const { scheduler, entries, updates } = harness(engine, { keyVersion: () => `v${version}` });
    scheduler.request("hair/soft-bob");
    expect(entries.get("hair/soft-bob")?.status).toBe("pending");
    await Promise.resolve();
    engine.releaseThumbnail();
    await scheduler.idle();
    const first = entries.get("hair/soft-bob");
    expect(first?.status).toBe("ready");
    version = 2;
    const before = updates.length;
    scheduler.request("hair/soft-bob");
    // 옛 그림(ready·v1)을 그대로 둔다
    expect(updates.length).toBe(before);
    expect(entries.get("hair/soft-bob")).toBe(first);
    await Promise.resolve();
    engine.releaseThumbnail();
    await scheduler.idle();
    expect(entries.get("hair/soft-bob")).toMatchObject({ status: "ready", cacheKey: "hair/soft-bob#v2" });
    // 실패한 카드는 그림이 없으므로 다시 요청하면 pending이다
    const failing = harness(createMockEngine({ failThumbnail: () => failVisible("thumb-fail", "실패", undefined, 0) }));
    failing.scheduler.request("eyes/almond");
    await failing.scheduler.idle();
    expect(failing.entries.get("eyes/almond")?.status).toBe("failed");
  });
});

describe("app/shell/thumbnail-scheduler 기본 양보 정책", () => {
  it("실브라우저(문서·MessageChannel, jsdom 아님)에서만 켜고 Node·jsdom에서는 끈다(requestIdleCallback이 없는 Safari도 켠다)", () => {
    const host = { setTimeout: (callback: () => void) => callback(), clearTimeout: () => undefined };
    // Node: 문서 없음
    expect(defaultThumbnailPacing({ ...host, MessageChannel })).toBeNull();
    // jsdom
    expect(defaultThumbnailPacing({ ...host, MessageChannel, document: {}, navigator: { userAgent: "Mozilla/5.0 (darwin) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/26.1.0" } })).toBeNull();
    // Chrome·Safari(requestIdleCallback 없음)
    const chrome = defaultThumbnailPacing({ ...host, MessageChannel, document: {}, navigator: { userAgent: "Mozilla/5.0 Chrome/156" }, requestIdleCallback: () => 1 });
    const safari = defaultThumbnailPacing({ ...host, MessageChannel, document: {}, navigator: { userAgent: "Mozilla/5.0 Version/26 Safari/605" } });
    expect(chrome?.quietMs).toBeGreaterThan(0);
    expect(safari?.quietMs).toBeGreaterThan(0);
  });

  it("브라우저 정책의 양보·유휴 대기·타이머가 끝난다(취소 포함)", async () => {
    const calls: string[] = [];
    const pacing = createBrowserThumbnailPacing(
      {
        setTimeout: (callback: () => void, ms: number) => {
          calls.push(`timeout:${ms}`);
          return setTimeout(callback, 0);
        },
        clearTimeout: (handle: unknown) => {
          calls.push("clear");
          clearTimeout(handle as ReturnType<typeof setTimeout>);
        },
        requestIdleCallback: (callback: () => void, options?: { readonly timeout: number }) => {
          calls.push(`idle:${options?.timeout ?? 0}`);
          setTimeout(callback, 0);
          return 1;
        },
        MessageChannel,
      },
      30,
    );
    await pacing.yieldToMain();
    await pacing.whenIdle?.();
    let fired = false;
    const cancel = pacing.schedule(() => {
      fired = true;
    }, 30);
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fired).toBe(false);
    expect(calls).toEqual(["idle:1500", "timeout:30", "clear"]);
    expect(pacing.quietMs).toBe(30);
  });
});

