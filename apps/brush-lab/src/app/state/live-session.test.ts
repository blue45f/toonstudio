// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { presetById } from "../../engine/presets/catalog";
import { createCpuReferenceLane } from "../../lanes/cpu-reference-lane";
import { FrameScheduler } from "../../platform/raf-scheduler";
import { createMockLane, mockEnvironment } from "../testing/mock-lane";

import { LiveStrokeSession } from "./live-session";

import type { LiveStrokeAbort, LiveStrokeResult } from "./live-session";
import type { LabImage } from "../../engine/core/types";
import type { BrushEngineLane } from "../../lanes/lane";
import type { PreviewPoint } from "../../platform/canvas-present";
import type { MockLane } from "../testing/mock-lane";

/** 가짜 rAF: `tick()`으로 한 프레임씩 실행한다. */
function fakeRaf() {
  const queue = new Map<number, (t: number) => void>();
  let next = 1;
  return {
    raf: (cb: (t: number) => void): number => {
      const id = next;
      next += 1;
      queue.set(id, cb);
      return id;
    },
    caf: (id: number): void => {
      queue.delete(id);
    },
    tick(): number {
      const cbs = [...queue.values()];
      queue.clear();
      for (const cb of cbs) cb(0);
      return cbs.length;
    },
  };
}

interface SyntheticInit extends PointerEventInit {
  timeStamp?: number;
  predicted?: PointerEvent[];
}

function pointerEvent(type: string, init: SyntheticInit = {}): PointerEvent {
  const { timeStamp, predicted, ...rest } = init;
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: "pen",
    pressure: 0.5,
    ...rest,
  });
  if (typeof timeStamp === "number") Object.defineProperty(ev, "timeStamp", { value: timeStamp });
  if (predicted) Object.defineProperty(ev, "getPredictedEvents", { value: () => predicted });
  return ev;
}

/** 마이크로태스크 체인이 비워질 때까지 기다린다. */
async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

/** 외부에서 resolve/reject하는 약속(init 진행 중 상태를 붙잡아 두는 용도). */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
  let resolve: () => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface MakeSessionOptions {
  failAddSamples?: boolean;
  /** 두 번째로 만든 레인(clear가 만드는 새 레인)의 init을 이 약속이 끝날 때까지 붙잡는다. */
  holdSecondInit?: Promise<void>;
}

async function makeSession(opts: MakeSessionOptions = {}) {
  const fr = fakeRaf();
  const env = mockEnvironment();
  const lanes: MockLane[] = [];
  const previews: PreviewPoint[][] = [];
  const canonical: number[] = [];
  const results: LiveStrokeResult[] = [];
  const errors: unknown[] = [];
  const session = await LiveStrokeSession.create({
    createLane: () => {
      const lane = createMockLane({ id: "cpu-reference" });
      if (opts.failAddSamples && lanes.length === 0) {
        const original = lane.addSamples.bind(lane);
        let failed = false;
        lane.addSamples = (samples) => {
          if (!failed) {
            failed = true;
            throw new Error("레인 addSamples 실패");
          }
          return original(samples);
        };
      }
      if (opts.holdSecondInit && lanes.length === 1) {
        const hold = opts.holdSecondInit;
        const originalInit = lane.init.bind(lane);
        lane.init = async (laneEnv, config) => {
          await hold;
          return originalInit(laneEnv, config);
        };
      }
      lanes.push(lane);
      return lane;
    },
    env,
    program: presetById("pencil-hb"),
    seed: 7,
    width: 32,
    height: 32,
    scheduler: new FrameScheduler(fr.raf, env.clock, fr.caf),
    onPreview: (points) => previews.push(points),
    onCanonical: (samples) => canonical.push(samples.length),
    onStrokeEnd: (res) => results.push(res),
    onError: (error) => errors.push(error),
  });
  const el = document.createElement("div");
  document.body.appendChild(el);
  const detach = session.attach(el);
  return { fr, session, lanes, previews, canonical, results, errors, el, detach };
}

describe("LiveStrokeSession", () => {
  it("예측 표본은 onPreview로만 가고 정본 표본은 프레임당 addSamples 1회로 레인에 들어가며 up에서 획을 끝낸다", async () => {
    const s = await makeSession();
    expect(s.lanes).toHaveLength(1);
    expect(s.lanes[0]?.calls).toEqual(["init"]);
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 2, clientY: 2, timeStamp: 10 }));
    const p = pointerEvent("pointermove", { clientX: 9, clientY: 9, timeStamp: 30 });
    s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 5, clientY: 5, timeStamp: 20, predicted: [p] }));
    s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 6, clientY: 6, timeStamp: 24 }));
    // 이벤트 3개 → 정본 3개(down, move, move), 예측 1개는 미리보기에만
    expect(s.canonical).toEqual([1, 1, 1]);
    expect(s.previews.at(-1)).toEqual([]);
    expect(s.previews.some((pts) => pts.length === 1 && pts[0]?.x === 9)).toBe(true);
    expect(s.lanes[0]?.calls.filter((c) => c === "addSamples")).toHaveLength(0);
    expect(s.fr.tick()).toBe(1);
    await flush();
    const lane = s.lanes[0]!;
    expect(lane.calls.filter((c) => c === "beginStroke")).toHaveLength(1);
    expect(lane.calls.filter((c) => c === "addSamples")).toHaveLength(1);
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 7, clientY: 7, timeStamp: 40 }));
    s.fr.tick();
    await flush();
    expect(lane.calls.filter((c) => c === "addSamples")).toHaveLength(2);
    expect(lane.calls).toContain("endStroke");
    expect(lane.calls).toContain("readback");
    expect(s.results).toHaveLength(1);
    const res = s.results[0]!;
    expect(res.samples.map((x) => x.phase)).toEqual(["down", "move", "move", "up"]);
    expect(res.samples.every((x) => x.source !== "predicted")).toBe(true);
    expect(res.seed).toBe(7);
    expect(res.image.width).toBe(32);
    expect(res.receipt.dabCount).toBe(4);
    expect(res.frames).toHaveLength(2);
    expect(session(s).strokes).toBe(1);
    expect(s.errors).toEqual([]);
    // 획 밖의 move 잔여는 폐기된다(새 획 시작 없음)
    s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 1, timeStamp: 50 }));
    s.fr.tick();
    await flush();
    expect(lane.calls.filter((c) => c === "beginStroke")).toHaveLength(1);
    s.detach();
    session(s).dispose();
    expect(lane.calls.at(-1)).toBe("dispose");
  });

  it("같은 프레임에 up과 새 down이 오면 획 경계에서 배치를 나눠 두 획으로 처리한다", async () => {
    const s = await makeSession();
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, timeStamp: 1 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 2, clientY: 2, timeStamp: 2 }));
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 3, clientY: 3, timeStamp: 3 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 4, clientY: 4, timeStamp: 4 }));
    expect(s.fr.tick()).toBe(1);
    await flush();
    expect(s.results).toHaveLength(2);
    expect(s.results.map((r) => r.seed)).toEqual([7, 8]);
    expect(s.lanes[0]?.calls.filter((c) => c === "beginStroke")).toHaveLength(2);
    session(s).dispose();
  });

  it("레인 오류는 onError로 드러나고 세션은 다음 획을 받을 수 있다", async () => {
    const s = await makeSession({ failAddSamples: true });
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, timeStamp: 1 }));
    s.fr.tick();
    await flush();
    expect(s.errors).toHaveLength(1);
    expect(s.results).toHaveLength(0);
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 2, clientY: 2, timeStamp: 2 }));
    s.fr.tick();
    await flush();
    // 획 밖의 up은 폐기, 새 down부터 다시 받는다
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 3, clientY: 3, timeStamp: 3 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 4, clientY: 4, timeStamp: 4 }));
    s.fr.tick();
    await flush();
    expect(s.results).toHaveLength(1);
    expect(s.errors).toHaveLength(1);
    session(s).dispose();
  });

  it("clear는 레인을 버리고 새로 init하며, dispose 뒤에는 입력이 무시된다", async () => {
    const s = await makeSession();
    await session(s).clear();
    expect(s.lanes).toHaveLength(2);
    expect(s.lanes[0]?.calls.at(-1)).toBe("dispose");
    expect(s.lanes[1]?.calls).toEqual(["init"]);
    expect(session(s).currentLane).toBe(s.lanes[1]);
    session(s).dispose();
    expect(s.lanes[1]?.calls.at(-1)).toBe("dispose");
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, timeStamp: 1 }));
    expect(s.fr.tick()).toBe(0);
    expect(s.canonical).toEqual([]);
  });

  it("clear의 새 레인 init 중에 dispose되면 새 레인도 해제하고 이전 레인을 두 번 해제하지 않는다(누수 방지)", async () => {
    const gate = deferred();
    const s = await makeSession({ holdSecondInit: gate.promise });
    const clearing = session(s).clear();
    await flush();
    // 이전 레인은 해제됐고 새 레인은 만들어졌으나 init이 끝나지 않았다.
    expect(s.lanes).toHaveLength(2);
    expect(s.lanes[0]?.calls.at(-1)).toBe("dispose");
    expect(s.lanes[1]?.calls).toEqual([]);
    session(s).dispose();
    gate.resolve();
    await clearing;
    // 새 레인은 init을 마친 뒤 곧바로 해제되고, 세션에 대입되지 않는다.
    expect(s.lanes[1]?.calls).toEqual(["init", "dispose"]);
    expect(session(s).currentLane).toBe(s.lanes[0]);
    // 이미 해제된 이전 레인을 dispose()가 다시 해제하지 않는다.
    expect(s.lanes[0]?.calls.filter((c) => c === "dispose")).toHaveLength(1);
    expect(s.errors).toEqual([]);
  });

  it("clear 중에 들어온 표본은 해제된 이전 레인이 아니라 새 레인이 준비된 뒤 새 레인에 적용된다", async () => {
    const gate = deferred();
    const s = await makeSession({ holdSecondInit: gate.promise });
    const clearing = session(s).clear();
    await flush();
    // 새 레인 init이 진행되는 동안 한 획 전체가 들어온다.
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 2, clientY: 2, timeStamp: 10 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 6, clientY: 6, timeStamp: 20 }));
    expect(s.fr.tick()).toBe(1);
    await flush();
    // 아직 새 레인이 준비되지 않았으므로 어떤 레인도 표본을 받지 않고 오류도 없다(보류).
    expect(s.errors).toEqual([]);
    expect(s.results).toHaveLength(0);
    expect(s.lanes[0]?.calls).not.toContain("beginStroke");
    gate.resolve();
    await clearing;
    await flush();
    expect(s.errors).toEqual([]);
    expect(s.results).toHaveLength(1);
    expect(s.lanes[0]?.calls).not.toContain("beginStroke");
    expect(s.lanes[1]?.calls).toEqual(expect.arrayContaining(["init", "beginStroke", "addSamples", "endStroke", "readback"]));
    expect(session(s).currentLane).toBe(s.lanes[1]);
    session(s).dispose();
    expect(s.lanes[1]?.calls.filter((c) => c === "dispose")).toHaveLength(1);
  });

  it("clear의 새 레인 init이 실패하면 호출자에게 던지고, 이후 입력은 체인을 끊지 않고 onError로 드러난다", async () => {
    const gate = deferred();
    const s = await makeSession({ holdSecondInit: gate.promise });
    const clearing = session(s).clear();
    await flush();
    gate.reject(new Error("새 레인 init 실패"));
    await expect(clearing).rejects.toThrow("새 레인 init 실패");
    // 세션은 해제된 이전 레인을 그대로 들고 있으므로 다음 획은 무음 성공이 아니라 오류로 드러나야 한다.
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 2, clientY: 2, timeStamp: 10 }));
    s.fr.tick();
    await flush();
    expect(s.errors).toHaveLength(1);
    expect(s.results).toHaveLength(0);
    // init에 실패한 새 레인은 아무도 가리키지 않으므로 세션이 해제한다(누수 방지).
    expect(s.lanes[1]?.calls).toContain("dispose");
    session(s).dispose();
    expect(s.lanes[0]?.calls.filter((c) => c === "dispose")).toHaveLength(1);
  });

  it("create의 레인 init이 실패하면 방금 만든 레인을 해제하고 오류를 그대로 던진다", async () => {
    const env = mockEnvironment();
    const lanes: MockLane[] = [];
    const err = await LiveStrokeSession.create({
      createLane: () => {
        const lane = createMockLane({ id: "cpu-reference", failInit: "adapter-unavailable" });
        lanes.push(lane);
        return lane;
      },
      env,
      program: presetById("pencil-hb"),
      seed: 7,
      width: 32,
      height: 32,
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "adapter-unavailable" });
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.calls).toEqual(["init", "dispose"]);
  });

  /**
   * 실제 CPU 참조 레인으로 세션을 만든다. 첫 레인의 `failAddSamplesCall`번째(1부터) `addSamples`만 던진다
   * (MockLane이 아니라 beginStroke 상태를 강제하는 실제 레인).
   */
  async function makeRealLaneSession(failAddSamplesCall: number | null) {
    const fr = fakeRaf();
    const env = mockEnvironment();
    const lanes: BrushEngineLane[] = [];
    const results: LiveStrokeResult[] = [];
    const errors: unknown[] = [];
    const aborts: LiveStrokeAbort[] = [];
    const session = await LiveStrokeSession.create({
      createLane: () => {
        const lane = createCpuReferenceLane();
        if (failAddSamplesCall !== null && lanes.length === 0) {
          const original = lane.addSamples.bind(lane);
          let calls = 0;
          lane.addSamples = (samples) => {
            calls += 1;
            if (calls === failAddSamplesCall) throw new Error("boom");
            return original(samples);
          };
        }
        lanes.push(lane);
        return lane;
      },
      env,
      program: presetById("pencil-hb"),
      seed: 7,
      width: 32,
      height: 32,
      scheduler: new FrameScheduler(fr.raf, env.clock, fr.caf),
      onStrokeEnd: (res) => results.push(res),
      onError: (error) => errors.push(error),
      onStrokeAbort: (abort) => aborts.push(abort),
    });
    const el = document.createElement("div");
    document.body.appendChild(el);
    session.attach(el);
    return { fr, session, lanes, results, errors, aborts, el };
  }

  /** 이미지에서 알파가 있는 픽셀 수. */
  function inkedPixels(image: LabImage): number {
    let n = 0;
    for (let i = 3; i < image.data.length; i += 4) if ((image.data[i] ?? 0) > 0) n += 1;
    return n;
  }

  function sameImage(a: LabImage, b: LabImage): boolean {
    return a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);
  }

  /** 길이가 있는 획 하나(down → move → up)를 같은 프레임에 보낸다. */
  async function drawFullStroke(s: { el: HTMLElement; fr: { tick(): number } }, t: number): Promise<void> {
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 4, clientY: 4, timeStamp: t, pressure: 0.8 }));
    s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 12, clientY: 10, timeStamp: t + 8, pressure: 0.8 }));
    s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 20, clientY: 18, timeStamp: t + 16, pressure: 0.8 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 26, clientY: 24, timeStamp: t + 24 }));
    s.fr.tick();
    await flush();
  }

  // 이전 계약(레인에 획 되돌리기가 없어 레인을 통째로 교체해 문서가 지워짐)을 가정한 테스트였다.
  // 새 계약: abortStroke가 documentPreserved를 돌려주면 레인을 유지하고 그때까지 그린 문서가 남는다.
  it("획 도중 addSamples가 실패해도 실제 레인을 유지한다: 문서가 보존되고 다음 획이 성공한다(onError 1회, 레인 교체 없음)", async () => {
    const s = await makeRealLaneSession(2);
    await drawFullStroke(s, 1);
    expect(s.results).toHaveLength(1);
    const first = s.results[0]!.image;
    expect(inkedPixels(first)).toBeGreaterThan(0);

    // 두 번째 획: 첫 프레임의 addSamples(= 전체 호출 2번째)가 던진다.
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 4, clientY: 24, timeStamp: 100, pressure: 0.8 }));
    s.fr.tick();
    await flush();
    expect(s.errors).toHaveLength(1);
    expect(String(s.errors[0])).toContain("boom");
    expect(s.aborts).toEqual([
      { cause: "error", receipt: expect.objectContaining({ documentPreserved: true }) as unknown, laneReplaced: false },
    ]);
    // 레인은 그대로이고 방금까지 그린 문서가 남아 있다.
    expect(s.lanes).toHaveLength(1);
    expect(s.session.currentLane).toBe(s.lanes[0]);
    expect(sameImage(await s.session.currentLane.readback(), first)).toBe(true);

    // 획 밖의 up은 폐기, 이어지는 새 획은 같은 레인이 받는다(이전 구현은 레인을 교체했고 그 전에는 영구 실패했다).
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 5, clientY: 25, timeStamp: 101 }));
    s.fr.tick();
    await flush();
    await drawFullStroke(s, 200);
    expect(s.errors).toHaveLength(1);
    expect(s.results).toHaveLength(2);
    expect(s.lanes).toHaveLength(1);
    // 세 번째 획 결과는 첫 획의 잉크를 포함한다.
    expect(inkedPixels(s.results[1]!.image)).toBeGreaterThanOrEqual(inkedPixels(first));
    s.session.dispose();
  });

  it("레인 교체가 실패하면 그 오류도 onError로 드러내고, 세션은 체인을 끊지 않는다", async () => {
    const fr = fakeRaf();
    const env = mockEnvironment();
    const lanes: MockLane[] = [];
    const errors: unknown[] = [];
    const session = await LiveStrokeSession.create({
      createLane: () => {
        const lane = createMockLane({
          id: "cpu-reference",
          // 첫 레인은 획을 되돌릴 수 없는 유형이라 세션이 레인 교체를 시도한다(이전 계약에서는 항상 교체했다).
          ...(lanes.length === 0 ? { abort: "lossy" as const } : {}),
          ...(lanes.length === 1 ? { failInit: "adapter-unavailable" as const } : {}),
        });
        if (lanes.length === 0) {
          lane.addSamples = () => {
            throw new Error("boom");
          };
        }
        lanes.push(lane);
        return lane;
      },
      env,
      program: presetById("pencil-hb"),
      seed: 7,
      width: 32,
      height: 32,
      scheduler: new FrameScheduler(fr.raf, env.clock, fr.caf),
      onError: (error) => errors.push(error),
    });
    const el = document.createElement("div");
    document.body.appendChild(el);
    session.attach(el);
    el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, timeStamp: 1 }));
    fr.tick();
    await flush();
    // 복원 불가 레인: 원래 오류 + 레인 교체 실패(init 거부) 두 개가 드러나고, 실패한 새 레인은 해제된다.
    expect(errors).toHaveLength(2);
    expect(String(errors[0])).toContain("boom");
    expect(errors[1]).toMatchObject({ code: "adapter-unavailable" });
    expect(lanes[1]?.calls).toEqual(["init", "dispose"]);
    session.dispose();
    expect(lanes[0]?.calls.filter((c) => c === "dispose")).toHaveLength(1);
  });

  it("endStroke 안의 실패는 레인이 스스로 정리하므로 레인을 교체하지 않는다(문서를 비우지 않는다)", async () => {
    const s = await makeSession();
    const lane = s.lanes[0]!;
    const originalEnd = lane.endStroke.bind(lane);
    let failed = false;
    lane.endStroke = async () => {
      if (failed) return originalEnd();
      failed = true;
      await originalEnd();
      throw new Error("endStroke 실패");
    };
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1, timeStamp: 1 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 2, clientY: 2, timeStamp: 2 }));
    s.fr.tick();
    await flush();
    expect(s.errors).toHaveLength(1);
    expect(s.lanes).toHaveLength(1);
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 3, clientY: 3, timeStamp: 3 }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 4, clientY: 4, timeStamp: 4 }));
    s.fr.tick();
    await flush();
    expect(s.errors).toHaveLength(1);
    expect(s.results).toHaveLength(1);
    expect(s.lanes).toHaveLength(1);
    session(s).dispose();
  });
});

describe("LiveStrokeSession — 획 되돌리기(abortStroke) 경로", () => {
  interface AbortSessionOptions {
    /** 첫 레인의 abortStroke 유형. */
    abort?: "restore" | "lossy" | "throw";
    /** 첫 레인의 이 번째(1부터) addSamples를 던지게 한다. */
    failAddSamplesCall?: number;
  }

  async function makeAbortSession(opts: AbortSessionOptions = {}) {
    const fr = fakeRaf();
    const env = mockEnvironment();
    const lanes: MockLane[] = [];
    const results: LiveStrokeResult[] = [];
    const errors: unknown[] = [];
    const aborts: LiveStrokeAbort[] = [];
    const previews: PreviewPoint[][] = [];
    const session = await LiveStrokeSession.create({
      createLane: () => {
        const first = lanes.length === 0;
        const lane = createMockLane({ id: "cpu-reference", ...(first && opts.abort ? { abort: opts.abort } : {}) });
        if (first && opts.failAddSamplesCall !== undefined) {
          const original = lane.addSamples.bind(lane);
          let calls = 0;
          lane.addSamples = (samples) => {
            calls += 1;
            if (calls === opts.failAddSamplesCall) throw new Error("레인 addSamples 실패");
            return original(samples);
          };
        }
        lanes.push(lane);
        return lane;
      },
      env,
      program: presetById("pencil-hb"),
      seed: 7,
      width: 32,
      height: 32,
      scheduler: new FrameScheduler(fr.raf, env.clock, fr.caf),
      onPreview: (points) => previews.push(points),
      onStrokeEnd: (res) => results.push(res),
      onError: (error) => errors.push(error),
      onStrokeAbort: (abort) => aborts.push(abort),
    });
    const el = document.createElement("div");
    document.body.appendChild(el);
    session.attach(el);
    return { fr, session, lanes, results, errors, aborts, previews, el };
  }

  type AbortSession = Awaited<ReturnType<typeof makeAbortSession>>;

  async function strokeDownMove(s: AbortSession, t: number): Promise<void> {
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 5, clientY: 5, timeStamp: t }));
    s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 9, clientY: 9, timeStamp: t + 8 }));
    s.fr.tick();
    await flush();
  }

  async function fullStroke(s: AbortSession, t: number): Promise<void> {
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 3, clientY: 3, timeStamp: t }));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 4, clientY: 4, timeStamp: t + 8 }));
    s.fr.tick();
    await flush();
  }

  it("복원 가능한 레인: 획 도중 throw → abortStroke 후 레인 유지·다음 획 정상·onError 1회", async () => {
    const s = await makeAbortSession({ failAddSamplesCall: 2 });
    await fullStroke(s, 1); // 호출 1번(성공)
    const lane = s.lanes[0]!;
    const before = await lane.readback();
    await strokeDownMove(s, 100); // 호출 2번이 던진다
    expect(s.errors).toHaveLength(1);
    expect(String(s.errors[0])).toContain("레인 addSamples 실패");
    expect(s.lanes).toHaveLength(1);
    expect(lane.calls.filter((c) => c === "abortStroke")).toHaveLength(1);
    expect(lane.calls).not.toContain("dispose");
    expect(s.aborts).toHaveLength(1);
    expect(s.aborts[0]).toMatchObject({ cause: "error", laneReplaced: false, receipt: { documentPreserved: true } });
    expect(await lane.readback()).toEqual(before);
    // 같은 레인이 다음 획을 받는다(beginStroke가 '이전 획이 endStroke되지 않았다'로 막히지 않는다).
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 9, clientY: 9, timeStamp: 120 }));
    s.fr.tick();
    await flush();
    await fullStroke(s, 200);
    expect(s.errors).toHaveLength(1);
    expect(s.results).toHaveLength(2);
    expect(s.lanes).toHaveLength(1);
    s.session.dispose();
  });

  it("복원 불가 레인(documentPreserved false): 레인을 교체하고 원래 오류 1개만 onError로, 교체 사실은 onStrokeAbort로 드러낸다", async () => {
    const s = await makeAbortSession({ abort: "lossy", failAddSamplesCall: 1 });
    await strokeDownMove(s, 1);
    expect(s.errors).toHaveLength(1);
    expect(s.lanes).toHaveLength(2);
    expect(s.lanes[0]?.calls.slice(-2)).toEqual(["abortStroke", "dispose"]);
    expect(s.aborts).toHaveLength(1);
    expect(s.aborts[0]).toMatchObject({
      cause: "error",
      laneReplaced: true,
      receipt: { documentPreserved: false, reasonKo: expect.stringContaining("되돌릴 수 없다") as unknown },
    });
    expect(s.session.currentLane).toBe(s.lanes[1]);
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 9, clientY: 9, timeStamp: 20 }));
    s.fr.tick();
    await flush();
    await fullStroke(s, 100);
    expect(s.results).toHaveLength(1);
    s.session.dispose();
  });

  it("abortStroke 자체가 던지면 레인 교체로 폴백하고 두 오류를 모두 onError로 드러낸다", async () => {
    const s = await makeAbortSession({ abort: "throw", failAddSamplesCall: 1 });
    await strokeDownMove(s, 1);
    expect(s.errors).toHaveLength(2);
    expect(String(s.errors[0])).toContain("레인 addSamples 실패");
    expect(String(s.errors[1])).toContain("abortStroke 실패");
    expect(s.lanes).toHaveLength(2);
    expect(s.lanes[0]?.calls.slice(-2)).toEqual(["abortStroke", "dispose"]);
    expect(s.aborts[0]).toMatchObject({ laneReplaced: true, receipt: null });
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 9, clientY: 9, timeStamp: 20 }));
    s.fr.tick();
    await flush();
    await fullStroke(s, 100);
    expect(s.results).toHaveLength(1);
    expect(s.errors).toHaveLength(2);
    s.session.dispose();
  });

  it("beginStroke가 던져도 abortStroke를 거친다(복원 가능 레인은 유지)", async () => {
    const s = await makeAbortSession();
    const lane = s.lanes[0]!;
    const original = lane.beginStroke.bind(lane);
    let failed = false;
    lane.beginStroke = (program, seed) => {
      if (!failed) {
        failed = true;
        throw new Error("beginStroke 실패");
      }
      original(program, seed);
    };
    await strokeDownMove(s, 1);
    expect(s.errors).toHaveLength(1);
    expect(lane.calls.filter((c) => c === "abortStroke")).toHaveLength(1);
    expect(s.lanes).toHaveLength(1);
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 9, clientY: 9, timeStamp: 20 }));
    s.fr.tick();
    await flush();
    await fullStroke(s, 100);
    expect(s.results).toHaveLength(1);
    s.session.dispose();
  });

  describe("포인터 취소(pointercancel)", () => {
    it("진행 중인 획을 합성하지 않고 abortStroke로 버린다: endStroke·onStrokeEnd·onError 없음, 레인 유지, 다음 획 정상", async () => {
      const s = await makeAbortSession();
      const lane = s.lanes[0]!;
      await fullStroke(s, 1);
      expect(s.results).toHaveLength(1);
      const before = await lane.readback();
      const endsBefore = lane.calls.filter((c) => c === "endStroke").length;

      await strokeDownMove(s, 100);
      expect(lane.calls.filter((c) => c === "beginStroke")).toHaveLength(2);
      s.el.dispatchEvent(pointerEvent("pointercancel", { clientX: 9, clientY: 9, timeStamp: 120 }));
      s.fr.tick();
      await flush();

      expect(lane.calls.filter((c) => c === "endStroke")).toHaveLength(endsBefore);
      expect(lane.calls.filter((c) => c === "abortStroke")).toHaveLength(1);
      expect(s.results).toHaveLength(1);
      expect(s.errors).toHaveLength(0);
      expect(s.aborts).toEqual([{ cause: "pointercancel", receipt: { discardedDabs: 2, documentPreserved: true }, laneReplaced: false }]);
      expect(s.previews.at(-1)).toEqual([]);
      expect(await lane.readback()).toEqual(before);
      expect(s.lanes).toHaveLength(1);

      await fullStroke(s, 200);
      expect(s.results).toHaveLength(2);
      expect(s.lanes).toHaveLength(1);
      s.session.dispose();
    });

    it("같은 프레임에 down과 pointercancel이 오면 레인에는 아무것도 들어가지 않는다", async () => {
      const s = await makeAbortSession();
      const lane = s.lanes[0]!;
      s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 5, clientY: 5, timeStamp: 1 }));
      s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 8, clientY: 8, timeStamp: 5 }));
      s.el.dispatchEvent(pointerEvent("pointercancel", { clientX: 8, clientY: 8, timeStamp: 9 }));
      s.fr.tick();
      await flush();
      expect(lane.calls).toEqual(["init"]);
      expect(s.errors).toHaveLength(0);
      expect(s.aborts).toHaveLength(0);
      await fullStroke(s, 100);
      expect(s.results).toHaveLength(1);
      s.session.dispose();
    });

    it("취소 뒤 같은 프레임에 새 획이 시작돼도 새 획은 정상 처리된다", async () => {
      const s = await makeAbortSession();
      const lane = s.lanes[0]!;
      await strokeDownMove(s, 1);
      s.el.dispatchEvent(pointerEvent("pointercancel", { clientX: 9, clientY: 9, timeStamp: 20 }));
      s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 3, clientY: 3, timeStamp: 30 }));
      s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 4, clientY: 4, timeStamp: 38 }));
      s.fr.tick();
      await flush();
      expect(lane.calls.filter((c) => c === "abortStroke")).toHaveLength(1);
      expect(s.results).toHaveLength(1);
      expect(s.errors).toHaveLength(0);
      s.session.dispose();
    });

    it("복원 불가 레인이면 레인을 교체하고 조용히 넘기지 않고 오류로 드러낸다", async () => {
      const s = await makeAbortSession({ abort: "lossy" });
      await strokeDownMove(s, 1);
      s.el.dispatchEvent(pointerEvent("pointercancel", { clientX: 9, clientY: 9, timeStamp: 20 }));
      s.fr.tick();
      await flush();
      expect(s.lanes).toHaveLength(2);
      expect(s.errors).toHaveLength(1);
      expect(s.errors[0]).toMatchObject({ code: "document-not-preserved" });
      expect(s.aborts[0]).toMatchObject({ cause: "pointercancel", laneReplaced: true });
      await fullStroke(s, 100);
      expect(s.results).toHaveLength(1);
      s.session.dispose();
    });

    it("abortStroke가 던지면 교체로 폴백하고 그 오류를 onError로 드러낸다", async () => {
      const s = await makeAbortSession({ abort: "throw" });
      await strokeDownMove(s, 1);
      s.el.dispatchEvent(pointerEvent("pointercancel", { clientX: 9, clientY: 9, timeStamp: 20 }));
      s.fr.tick();
      await flush();
      expect(s.lanes).toHaveLength(2);
      expect(s.errors).toHaveLength(1);
      expect(String(s.errors[0])).toContain("abortStroke 실패");
      s.session.dispose();
    });

    it("소유하지 않은 포인터의 pointercancel은 진행 중인 획을 취소하지 않는다", async () => {
      const s = await makeAbortSession();
      const lane = s.lanes[0]!;
      await strokeDownMove(s, 1);
      s.el.dispatchEvent(pointerEvent("pointercancel", { pointerId: 99, clientX: 1, clientY: 1, timeStamp: 10 }));
      s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 9, clientY: 9, timeStamp: 20 }));
      s.fr.tick();
      await flush();
      expect(lane.calls).not.toContain("abortStroke");
      expect(s.results).toHaveLength(1);
      s.session.dispose();
    });

    it("실제 CPU 참조 레인: 취소한 획은 문서에 남지 않고, 취소한 획이 끼어도 결과가 취소 없이 그린 것과 같다", async () => {
      const run = async (withCanceled: boolean): Promise<{ afterFirst: LabImage; final: LabImage; errors: unknown[]; strokes: number }> => {
        const fr = fakeRaf();
        const env = mockEnvironment();
        const results: LiveStrokeResult[] = [];
        const errors: unknown[] = [];
        const session = await LiveStrokeSession.create({
          createLane: () => createCpuReferenceLane(),
          env,
          program: presetById("pencil-hb"),
          seed: 7,
          width: 32,
          height: 32,
          scheduler: new FrameScheduler(fr.raf, env.clock, fr.caf),
          onStrokeEnd: (res) => results.push(res),
          onError: (error) => errors.push(error),
        });
        const el = document.createElement("div");
        document.body.appendChild(el);
        session.attach(el);
        const draw = async (t: number, fromX: number, endType: "pointerup" | "pointercancel"): Promise<void> => {
          el.dispatchEvent(pointerEvent("pointerdown", { clientX: fromX, clientY: 6, timeStamp: t, pressure: 0.8 }));
          el.dispatchEvent(pointerEvent("pointermove", { clientX: fromX + 8, clientY: 14, timeStamp: t + 8, pressure: 0.8 }));
          el.dispatchEvent(pointerEvent("pointermove", { clientX: fromX + 14, clientY: 22, timeStamp: t + 16, pressure: 0.8 }));
          fr.tick();
          await flush();
          el.dispatchEvent(pointerEvent(endType, { clientX: fromX + 16, clientY: 24, timeStamp: t + 24 }));
          fr.tick();
          await flush();
        };
        await draw(1, 4, "pointerup");
        const afterFirst = await session.currentLane.readback();
        if (withCanceled) {
          await draw(100, 10, "pointercancel");
          expect(await session.currentLane.readback()).toEqual(afterFirst);
        }
        await draw(200, 16, "pointerup");
        const final = await session.currentLane.readback();
        const strokes = results.length;
        session.dispose();
        return { afterFirst, final, errors, strokes };
      };
      const withCancel = await run(true);
      const without = await run(false);
      expect(withCancel.errors).toHaveLength(0);
      expect(withCancel.strokes).toBe(2);
      expect(withCancel.final).toEqual(without.final);
      // 시드는 획 순번으로 정해지므로 취소한 획은 순번을 쓰지 않는다 — 두 경로의 결과가 같아야 한다.
      let inked = 0;
      for (let i = 3; i < withCancel.final.data.length; i += 4) if ((withCancel.final.data[i] ?? 0) > 0) inked += 1;
      expect(inked).toBeGreaterThan(0);
    });
  });
});

function session(s: Awaited<ReturnType<typeof makeSession>>): LiveStrokeSession {
  return s.session;
}
