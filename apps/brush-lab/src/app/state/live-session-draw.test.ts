// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { composeStages } from "../../engine/input/stages/chain";
import { createCornerGateStage } from "../../engine/input/stages/corner-gate";
import { createLazyBrushStage } from "../../engine/input/stages/lazy-brush";
import { createPenSpringStage } from "../../engine/input/stages/pen-spring";
import { presetById } from "../../engine/presets/catalog";
import { FrameScheduler } from "../../platform/raf-scheduler";
import { createMockLane, mockEnvironment } from "../testing/mock-lane";

import { LiveStrokeSession } from "./live-session";

import type { LiveSessionOptions, LiveStrokeAbort, LiveStrokeResult } from "./live-session";
import type { RawSample } from "../../engine/core/types";
import type { RawStage } from "../../engine/input/stages/raw-stage";
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
      lane.beginStroke = (program, seed, options) => {
        programs.push(program);
        begin(program, seed, options);
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

  it("획 색: 색이 없으면 beginStroke에 옵션을 넘기지 않고(기존과 같다), 생성 색·setColor 색은 다음 획부터 beginStroke options.color로 전달된다", async () => {
    const plain = await make();
    await stroke(plain, 1);
    expect(plain.lanes[0]?.strokeOptions).toEqual([undefined]);
    plain.session.dispose();

    const s = await make({ color: [0.2, 0.4, 0.6, 1] });
    await stroke(s, 1);
    s.session.setColor([1, 0, 0, 1]);
    await stroke(s, 100);
    expect(s.lanes[0]?.strokeOptions).toEqual([{ color: [0.2, 0.4, 0.6, 1] }, { color: [1, 0, 0, 1] }]);
    expect(s.lanes).toHaveLength(1);
    expect(s.lanes[0]?.calls).not.toContain("dispose");
    s.session.dispose();
  });

  it("setColor는 진행 중인 획의 색을 바꾸지 않는다(시작할 때의 색을 끝까지 쓰고 다음 획부터 새 색)", async () => {
    const s = await make({ color: [0, 0, 1, 1] });
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 4, clientY: 4, timeStamp: 1 }));
    s.fr.tick();
    await flush();
    s.session.setColor([0, 1, 0, 1]);
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: 5, clientY: 5, timeStamp: 9 }));
    s.fr.tick();
    await flush();
    expect(s.lanes[0]?.strokeOptions).toEqual([{ color: [0, 0, 1, 1] }]);
    await stroke(s, 100);
    expect(s.lanes[0]?.strokeOptions).toEqual([{ color: [0, 0, 1, 1] }, { color: [0, 1, 0, 1] }]);
    s.session.dispose();
  });

  it("잘못된 색은 획 시작에서 레인이 거부하고(onError) 세션은 다음 획을 받을 수 있다", async () => {
    const s = await make({ color: [0, 0, 0, 1] });
    s.session.setColor([2, 0, 0, 1]);
    await stroke(s, 1);
    expect(s.errors).toHaveLength(1);
    expect(s.results).toHaveLength(0);
    s.session.setColor([0, 0, 0, 1]);
    await stroke(s, 100);
    expect(s.results).toHaveLength(1);
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

  /** reset 호출 횟수를 세는 단계 래퍼(내부 동작은 그대로). */
  function withResetCount(inner: RawStage): { stage: RawStage; resets: () => number } {
    let resets = 0;
    const stage: RawStage = {
      id: inner.id,
      label: inner.label,
      apply: (samples) => inner.apply(samples),
      flush: () => inner.flush(),
      reset: () => {
        resets += 1;
        inner.reset();
      },
    };
    return { stage, resets: () => resets };
  }

  async function dragStroke(s: Awaited<ReturnType<typeof make>>, t: number, to: { x: number; y: number }): Promise<void> {
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 2, clientY: 2, timeStamp: t }));
    for (let i = 1; i <= 6; i += 1) {
      s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 2 + ((to.x - 2) * i) / 6, clientY: 2 + ((to.y - 2) * i) / 6, timeStamp: t + i * 4 }));
    }
    s.fr.tick();
    await flush();
    s.el.dispatchEvent(pointerEvent("pointerup", { clientX: to.x, clientY: to.y, timeStamp: t + 28 }));
    s.fr.tick();
    await flush();
  }

  it("입력 단계: 끈 당김은 모서리 없는 획에서도 끝점이 포인터 업 위치에 닿는다(획 끝 따라잡기, flush 표본이 up 앞에 이어진다)", async () => {
    const plain = await make();
    await dragStroke(plain, 1, { x: 30, y: 20 });
    const plainSamples = plain.added.flat();
    expect(plainSamples[plainSamples.length - 1]).toMatchObject({ x: 30, y: 20, phase: "up" });
    plain.session.dispose();

    const s = await make({ inputStage: createLazyBrushStage({ radiusPx: 12 }) });
    await dragStroke(s, 1, { x: 30, y: 20 });
    const samples = s.added.flat();
    const last = samples[samples.length - 1];
    expect(last).toMatchObject({ x: 30, y: 20, phase: "up" });
    expect(samples.filter((sample) => sample.phase === "up")).toHaveLength(1);
    // 끈 때문에 중간 표본은 포인터보다 뒤지고, 따라잡기 표본이 더해져 표본 수가 늘었다.
    expect(samples.length).toBeGreaterThan(plainSamples.length);
    const beforeCatchUp = samples.filter((sample) => sample.phase === "move");
    expect(Math.max(...beforeCatchUp.map((sample) => sample.x))).toBeLessThanOrEqual(30);
    expect(samples[1]?.x).toBe(2); // 끈 길이(12 px) 안의 첫 이동은 붓을 움직이지 않는다
    for (let i = 1; i < samples.length; i += 1) expect(samples[i]?.tMs).toBeGreaterThanOrEqual(samples[i - 1]?.tMs ?? 0);
    expect(s.results).toHaveLength(1);
    s.session.dispose();
  });

  it("입력 단계: 물리 펜+코너 게이트 체인도 끝점이 포인터 업 위치이고 다음 획은 새로 시작한다", async () => {
    const chain = composeStages([createCornerGateStage(createPenSpringStage({ lagMs: 20 }))]);
    const s = await make({ inputStage: chain });
    await dragStroke(s, 1, { x: 28, y: 14 });
    const first = s.added.flat();
    expect(first[first.length - 1]).toMatchObject({ x: 28, y: 14, phase: "up" });
    s.added.length = 0;
    await dragStroke(s, 500, { x: 10, y: 24 });
    const second = s.added.flat();
    expect(second[0]).toMatchObject({ x: 2, y: 2, phase: "down" });
    expect(second[second.length - 1]).toMatchObject({ x: 10, y: 24, phase: "up" });
    expect(s.results).toHaveLength(2);
    s.session.dispose();
  });

  it("입력 단계: pointercancel로 획을 버리면 abortStroke와 함께 체인이 reset되고 보류한 마무리가 새지 않는다", async () => {
    const { stage, resets } = withResetCount(createLazyBrushStage({ radiusPx: 12 }));
    const s = await make({ inputStage: stage });
    s.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 4, clientY: 4, timeStamp: 1 }));
    s.el.dispatchEvent(pointerEvent("pointermove", { clientX: 30, clientY: 20, timeStamp: 9 }));
    s.fr.tick();
    await flush();
    const before = resets();
    s.el.dispatchEvent(pointerEvent("pointercancel", { clientX: 30, clientY: 20, timeStamp: 17 }));
    s.fr.tick();
    await flush();
    expect(s.aborts).toHaveLength(1);
    expect(s.aborts[0]).toMatchObject({ cause: "pointercancel", laneReplaced: false });
    expect(s.lanes[0]?.calls.filter((c) => c === "abortStroke")).toHaveLength(1);
    expect(s.lanes[0]?.calls).not.toContain("endStroke");
    expect(resets()).toBeGreaterThan(before);
    expect(stage.flush()).toEqual([]);
    // 다음 획은 이전 붓 위치를 끌고 오지 않고 down 위치에서 시작한다.
    s.added.length = 0;
    await dragStroke(s, 100, { x: 20, y: 28 });
    const next = s.added.flat();
    expect(next[0]).toMatchObject({ x: 2, y: 2, phase: "down" });
    expect(next[next.length - 1]).toMatchObject({ x: 20, y: 28, phase: "up" });
    s.session.dispose();
  });

  it("입력 단계: 레인 오류로 획이 버려져도(abortStroke) 체인이 reset된다", async () => {
    const { stage, resets } = withResetCount(createLazyBrushStage({ radiusPx: 12 }));
    const s = await make({ inputStage: stage });
    const lane = s.lanes[0];
    expect(lane).toBeDefined();
    if (!lane) return;
    const add = lane.addSamples.bind(lane);
    let fail = true;
    lane.addSamples = (samples) => {
      // 획을 끝내는 배치(up 포함)에서 한 번 실패시킨다: 이때 포인터는 이미 떼어져 있다.
      if (fail && samples.some((sample) => sample.phase === "up")) {
        fail = false;
        throw new Error("모의 레인 오류");
      }
      return add(samples);
    };
    await dragStroke(s, 1, { x: 30, y: 20 });
    expect(s.errors.length).toBeGreaterThan(0);
    expect(s.aborts).toHaveLength(1);
    expect(s.lanes[0]?.calls.filter((c) => c === "abortStroke")).toHaveLength(1);
    expect(resets()).toBeGreaterThan(0);
    s.added.length = 0;
    await dragStroke(s, 200, { x: 20, y: 10 });
    expect(s.results).toHaveLength(1);
    expect(s.added.flat()[0]).toMatchObject({ x: 2, y: 2, phase: "down" });
    s.session.dispose();
  });

  it("setInputStage는 다음 획부터 바뀌고 이전 단계를 reset하며 null이면 단계 없음이다", async () => {
    const first = withResetCount(createLazyBrushStage({ radiusPx: 12 }));
    const s = await make({ inputStage: first.stage });
    await dragStroke(s, 1, { x: 30, y: 20 });
    const withStage = s.added.flat().length;
    s.session.setInputStage(null);
    expect(first.resets()).toBeGreaterThan(0);
    s.added.length = 0;
    await dragStroke(s, 100, { x: 30, y: 20 });
    expect(s.added.flat().length).toBeLessThan(withStage);
    expect(s.added.flat()[1]?.x).toBeCloseTo(2 + (30 - 2) / 6, 9);
    s.session.setInputStage(createLazyBrushStage({ radiusPx: 40 }));
    s.added.length = 0;
    await dragStroke(s, 300, { x: 30, y: 20 });
    expect(s.added.flat()[1]?.x).toBe(2);
    s.session.dispose();
  });
});
