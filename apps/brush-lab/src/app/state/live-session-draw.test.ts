// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { presetById } from "../../engine/presets/catalog";
import { FrameScheduler } from "../../platform/raf-scheduler";
import { createMockLane, mockEnvironment } from "../testing/mock-lane";

import { LiveStrokeSession } from "./live-session";

import type { LiveSessionOptions, LiveStrokeAbort, LiveStrokeResult } from "./live-session";
import type { RawSample } from "../../engine/core/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type { MockLane } from "../testing/mock-lane";

/** 그리기 화면이 쓰는 세션 옵션(setProgram·transformSamples·skipLinear·용량 전달·획 타이밍·캡처 상실 취소). */

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
    tick(): void {
      const cbs = [...queue.values()];
      queue.clear();
      for (const cb of cbs) cb(0);
    },
  };
}

function pointerEvent(type: string, init: PointerEventInit & { timeStamp?: number } = {}): PointerEvent {
  const { timeStamp, ...rest } = init;
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
    pressure: 0.5,
    ...rest,
  });
  if (typeof timeStamp === "number") Object.defineProperty(ev, "timeStamp", { value: timeStamp });
  return ev;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

async function make(extra: Partial<LiveSessionOptions> = {}) {
  const fr = fakeRaf();
  const env = mockEnvironment();
  const lanes: MockLane[] = [];
  const programs: BrushProgram[] = [];
  const added: RawSample[][] = [];
  const results: LiveStrokeResult[] = [];
  const aborts: LiveStrokeAbort[] = [];
  const errors: unknown[] = [];
  const initConfigs: unknown[] = [];
  const session = await LiveStrokeSession.create({
    createLane: () => {
      const lane = createMockLane({ id: "cpu-reference" });
      const begin = lane.beginStroke.bind(lane);
      lane.beginStroke = (program, seed) => {
        programs.push(program);
        begin(program, seed);
      };
      const add = lane.addSamples.bind(lane);
      lane.addSamples = (samples) => {
        added.push([...samples]);
        return add(samples);
      };
      const init = lane.init.bind(lane);
      lane.init = (e, config) => {
        initConfigs.push(config);
        return init(e, config);
      };
      lanes.push(lane);
      return lane;
    },
    env,
    program: presetById("pencil-hb"),
    seed: 3,
    width: 32,
    height: 32,
    scheduler: new FrameScheduler(fr.raf, env.clock, fr.caf),
    onStrokeEnd: (r) => results.push(r),
    onStrokeAbort: (a) => aborts.push(a),
    onError: (e) => errors.push(e),
    ...extra,
  });
  const el = document.createElement("div");
  document.body.appendChild(el);
  session.attach(el);
  return { fr, session, lanes, programs, added, results, aborts, errors, initConfigs, el };
}

async function stroke(s: Awaited<ReturnType<typeof make>>, t: number): Promise<void> {
  s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 4, clientY: 4, timeStamp: t }));
  s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 10, clientY: 6, timeStamp: t + 8 }));
  s.fr.tick();
  await flush();
  s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 12, clientY: 8, timeStamp: t + 16 }));
  s.fr.tick();
  await flush();
}

describe("LiveStrokeSession: 그리기 화면 옵션", () => {
  it("setProgram은 다음 획부터 새 프로그램을 쓰고 레인·문서는 그대로 둔다", async () => {
    const s = await make();
    await stroke(s, 1);
    const next = presetById("ink-g-pen");
    s.session.setProgram(next);
    await stroke(s, 100);
    expect(s.programs.map((p) => p.id)).toEqual(["pencil-hb", "ink-g-pen"]);
    expect(s.lanes).toHaveLength(1);
    expect(s.lanes[0]?.calls).not.toContain("dispose");
    expect(s.results).toHaveLength(2);
    s.session.dispose();
  });

  it("setProgram은 진행 중인 획의 프로그램을 바꾸지 않는다", async () => {
    const s = await make();
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 4, clientY: 4, timeStamp: 1 }));
    s.fr.tick();
    await flush();
    s.session.setProgram(presetById("charcoal"));
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 5, clientY: 5, timeStamp: 9 }));
    s.fr.tick();
    await flush();
    expect(s.programs.map((p) => p.id)).toEqual(["pencil-hb"]);
    await stroke(s, 100);
    expect(s.programs.map((p) => p.id)).toEqual(["pencil-hb", "charcoal"]);
    s.session.dispose();
  });

  it("transformSamples는 스케줄러에 넣기 전에 표본을 바꾸고 up 표본의 취소 표시도 변환 뒤 표본에 붙는다", async () => {
    const s = await make({ transformSamples: (raw) => raw.map((sample) => ({ ...sample, pressure: 0.25 })) });
    await stroke(s, 1);
    expect(s.added.flat().every((sample) => sample.pressure === 0.25)).toBe(true);
    // 취소: 변환이 표본을 복사해도 abort 경로로 간다(endStroke 없음).
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 4, clientY: 4, timeStamp: 100 }));
    s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 9, clientY: 9, timeStamp: 108 }));
    s.fr.tick();
    await flush();
    s.el.dispatchEvent(pointerEvent("pointercancel", { clientX: 9, clientY: 9, timeStamp: 116 }));
    s.fr.tick();
    await flush();
    expect(s.aborts).toHaveLength(1);
    expect(s.aborts[0]).toMatchObject({ cause: "pointercancel", laneReplaced: false });
    expect(s.lanes[0]?.calls.filter((c) => c === "endStroke")).toHaveLength(1);
    s.session.dispose();
  });

  it("lostpointercapture(pointerup 없이 캡처가 풀림)도 취소로 보고 abortStroke로 버린다", async () => {
    const s = await make();
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 4, clientY: 4, timeStamp: 1 }));
    s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 9, clientY: 9, timeStamp: 9 }));
    s.fr.tick();
    await flush();
    s.el.dispatchEvent(pointerEvent("lostpointercapture", { clientX: 9, clientY: 9, timeStamp: 17 }));
    s.fr.tick();
    await flush();
    expect(s.lanes[0]?.calls.filter((c) => c === "abortStroke")).toHaveLength(1);
    expect(s.lanes[0]?.calls).not.toContain("endStroke");
    expect(s.results).toHaveLength(0);
    expect(s.errors).toHaveLength(0);
    expect(s.aborts[0]).toMatchObject({ cause: "pointercancel", laneReplaced: false });
    // 다음 획은 정상이다.
    await stroke(s, 100);
    expect(s.results).toHaveLength(1);
    s.session.dispose();
  });

  it("정상 pointerup 뒤에 따라오는 lostpointercapture는 획을 취소하지 않는다", async () => {
    const s = await make();
    await stroke(s, 1);
    s.el.dispatchEvent(pointerEvent("lostpointercapture", { clientX: 12, clientY: 8, timeStamp: 30 }));
    s.fr.tick();
    await flush();
    expect(s.aborts).toHaveLength(0);
    expect(s.results).toHaveLength(1);
    // 그 표시가 다음 획의 pointerup을 취소로 오인하지 않는다.
    await stroke(s, 100);
    expect(s.aborts).toHaveLength(0);
    expect(s.results).toHaveLength(2);
    s.session.dispose();
  });

  it("skipLinear면 선형 버퍼를 읽지 않고 획 타이밍(addSamples·endStroke·readback)을 돌려준다", async () => {
    const s = await make({ skipLinear: true });
    await stroke(s, 1);
    const result = s.results[0];
    expect(result?.linear).toBeNull();
    expect(s.lanes[0]?.calls).not.toContain("readbackLinear");
    expect(result?.timings.addSamplesMs.length).toBe(result?.frames.length);
    expect(result?.timings.addSamplesMs.length).toBeGreaterThan(0);
    expect(result?.timings.endStrokeMs).toBeGreaterThan(0);
    expect(result?.timings.readbackMs).toBeGreaterThan(0);
    const full = await make();
    await stroke(full, 1);
    expect(full.lanes[0]?.calls).toContain("readbackLinear");
    s.session.dispose();
    full.session.dispose();
  });

  it("습식·획 풀 용량을 레인 init에 넘긴다", async () => {
    const s = await make({ wetCapacityTiles: 2560, strokeCapacityTiles: 99 });
    expect(s.initConfigs[0]).toMatchObject({ wetCapacityTiles: 2560, strokeCapacityTiles: 99, width: 32, height: 32 });
    const plain = await make();
    expect(plain.initConfigs[0]).not.toHaveProperty("wetCapacityTiles");
    s.session.dispose();
    plain.session.dispose();
  });
});
