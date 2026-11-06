// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { fnv1a64 } from "../../engine/core/hash";
import { composeStages } from "../../engine/input/stages/chain";
import { createLazyBrushStage } from "../../engine/input/stages/lazy-brush";
import { createPenSpringStage } from "../../engine/input/stages/pen-spring";
import { presetById } from "../../engine/presets/catalog";
import { createCpuReferenceLane } from "../../lanes/cpu-reference-lane";
import { createWasmCpuLane } from "../../lanes/wasm-cpu-lane";
import { FrameScheduler } from "../../platform/raf-scheduler";
import { createFaultInjectionLane } from "../testing/fault-injection-lane";
import { mockEnvironment } from "../testing/mock-lane";

import { LiveStrokeSession } from "./live-session";

import type { LiveSessionOptions, LiveStrokeAbort, LiveStrokeResult } from "./live-session";
import type { LabImage } from "../../engine/core/types";
import type { BrushEngineLane } from "../../lanes/lane";
import type { PreviewPoint } from "../../platform/canvas-present";
import type { FaultInjectionLane, FaultOp } from "../testing/fault-injection-lane";

/**
 * `LiveStrokeSession` 비동기 수명주기·결함 주입(fault-injection) 검증 스위트.
 *
 * - 실제 CPU(`cpu-reference`)·WASM(`wasm-cpu`) 레인 픽셀 해시 검증과
 *   모의 GPU 손실(`abort: "lossy"` / `"throw"`) 레인 검증을 명확히 구분한다.
 * - 지연 완료(held gate) 및 비동기 거부(rejected Promise)가 `clear()`·`replaceLane()`·`dispose()`·동시 후속 입력(`pointerdown` #2)과
 *   겹칠 때의 세대(epoch)·제스처(gestureId)·포인터 소유자(ownerPointerId) 불변식을 검증한다.
 */

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

interface SyntheticPointerInit extends PointerEventInit {
  timeStamp?: number;
  predicted?: PointerEvent[];
}

function pointerEvent(type: string, init: SyntheticPointerInit = {}): PointerEvent {
  const { timeStamp, predicted, ...rest } = init;
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: "pen",
    pressure: 0.7,
    ...rest,
  });
  if (typeof timeStamp === "number") Object.defineProperty(ev, "timeStamp", { value: timeStamp });
  if (predicted) Object.defineProperty(ev, "getPredictedEvents", { value: () => predicted });
  return ev;
}

async function flushMicrotasks(ticks = 12): Promise<void> {
  for (let i = 0; i < ticks; i += 1) await Promise.resolve();
}

function imageHash(image: LabImage): string {
  return fnv1a64(new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength));
}

interface HarnessOptions extends Partial<LiveSessionOptions> {
  createInnerLane?: (index: number) => BrushEngineLane;
  abortMode?: "restore" | "lossy" | "throw";
  configureLane?: (lane: FaultInjectionLane, index: number) => void;
}

async function createHarness(opts: HarnessOptions = {}) {
  const fr = fakeRaf();
  const env = mockEnvironment();
  const lanes: FaultInjectionLane[] = [];
  const results: LiveStrokeResult[] = [];
  const errors: unknown[] = [];
  const aborts: LiveStrokeAbort[] = [];
  const previews: PreviewPoint[][] = [];
  const canonicalCounts: number[] = [];
  let previewResets = 0;

  const session = await LiveStrokeSession.create({
    createLane: () => {
      const idx = lanes.length;
      const inner = opts.createInnerLane ? opts.createInnerLane(idx) : undefined;
      const lane = createFaultInjectionLane({
        id: inner?.id ?? "cpu-reference",
        ...(inner ? { inner } : {}),
        ...(opts.abortMode ? { abort: opts.abortMode } : {}),
      });
      opts.configureLane?.(lane, idx);
      lanes.push(lane);
      return lane;
    },
    env,
    program: opts.program ?? presetById("pencil-hb"),
    seed: opts.seed ?? 11,
    width: opts.width ?? 48,
    height: opts.height ?? 48,
    scheduler: new FrameScheduler(fr.raf, env.clock, fr.caf),
    onPreview: (pts) => previews.push(pts),
    onPreviewReset: () => {
      previewResets += 1;
    },
    onCanonical: (samples) => canonicalCounts.push(samples.length),
    onStrokeEnd: (res) => results.push(res),
    onError: (err) => errors.push(err),
    onStrokeAbort: (abort) => aborts.push(abort),
    ...opts,
  });

  const el = document.createElement("div");
  document.body.appendChild(el);
  const detach = session.attach(el);

  return {
    fr,
    env,
    session,
    lanes,
    results,
    errors,
    aborts,
    previews,
    canonicalCounts,
    get previewResets() {
      return previewResets;
    },
    el,
    detach,
  };
}

function dispatchStroke(
  el: HTMLElement,
  t0: number,
  coords: { x0: number; y0: number; x1: number; y1: number },
  pointerId = 1,
): void {
  el.dispatchEvent(pointerEvent("pointerdown", { pointerId, clientX: coords.x0, clientY: coords.y0, timeStamp: t0, pressure: 0.75 }));
  el.dispatchEvent(
    pointerEvent("pointermove", {
      pointerId,
      clientX: (coords.x0 + coords.x1) / 2,
      clientY: (coords.y0 + coords.y1) / 2,
      timeStamp: t0 + 8,
      pressure: 0.8,
    }),
  );
  el.dispatchEvent(pointerEvent("pointerup", { pointerId, clientX: coords.x1, clientY: coords.y1, timeStamp: t0 + 16, pressure: 0.7 }));
}

describe("LiveStrokeSession 비동기 결함 주입: clear() 세대(epoch) 격리", () => {
  const STALE_OPS: ReadonlyArray<FaultOp> = ["beginStroke", "addSamples", "endStroke", "readback", "readbackLinear"];

  it.each(STALE_OPS)(
    "[실제 CPU 레인 픽셀 검증] %s 지연 중 clear()가 불리면 이전 레인의 늦은 resolve가 새 레인의 획 수·영수증·픽셀을 오염시키지 않는다",
    async (op) => {
      // 기준선: 깨끗한 CPU 레인에서 획 #2 하나만 그린 결과
      const refHarness = await createHarness({ createInnerLane: () => createCpuReferenceLane() });
      dispatchStroke(refHarness.el, 200, { x0: 6, y0: 36, x1: 38, y1: 10 });
      refHarness.fr.tick();
      await flushMicrotasks();
      expect(refHarness.results).toHaveLength(1);
      const expectedHash = imageHash(refHarness.results[0]!.image);
      const expectedLinear = refHarness.results[0]!.linear;
      const expectedSeed = refHarness.results[0]!.seed;
      refHarness.session.dispose();

      // 시험 대상: 레인 0의 op를 보류한 상태에서 clear() 호출 후 레인 1에서 획 #2 실행
      const h = await createHarness({ createInnerLane: () => createCpuReferenceLane() });
      const lane0 = h.lanes[0]!;
      const gate = lane0.holdNext(op);

      // 획 #1 입력(레인 0)
      dispatchStroke(h.el, 10, { x0: 4, y0: 4, x1: 28, y1: 28 });
      h.fr.tick();
      await gate.entered;

      // clear() 전에 스케줄러에 쌓였으나 아직 tick되지 않은 잔여 입력도 함께 폐기되는지 확인
      h.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 20, clientY: 5, timeStamp: 40 }));
      h.el.dispatchEvent(pointerEvent("pointermove", { clientX: 25, clientY: 15, timeStamp: 48 }));

      const clearing = h.session.clear();
      // clear() 직후 포인터를 떼면 거부된 이전 제스처의 up은 무시된다
      h.el.dispatchEvent(pointerEvent("pointerup", { clientX: 30, clientY: 25, timeStamp: 52 }));

      // clear() 이후에 들어온 새 획(레인 1에 그려져야 함)
      dispatchStroke(h.el, 200, { x0: 6, y0: 36, x1: 38, y1: 10 });
      h.fr.tick();

      // 이제 레인 0의 보류된 연산이 뒤늦게 성공(resolve)한다
      gate.resolve();
      await clearing;
      await flushMicrotasks(20);

      expect(h.errors).toEqual([]);
      expect(h.aborts).toEqual([]);
      expect(h.lanes).toHaveLength(2);
      expect(h.session.currentLane).toBe(h.lanes[1]);

      // 레인 0의 획은 폐기되어 strokes 및 results에 포함되지 않고, 레인 1의 획만 정확히 1회 기록된다
      expect(h.session.strokes).toBe(1);
      expect(h.results).toHaveLength(1);
      expect(h.results[0]!.seed).toBe(expectedSeed);
      expect(imageHash(h.results[0]!.image)).toBe(expectedHash);
      expect(h.results[0]!.linear).toEqual(expectedLinear);

      // 레인 0은 해제 후 추가 readback/abortStroke 등이 호출되지 않았다
      expect(lane0.disposedCount).toBe(1);
      expect(lane0.postDisposeCalls).toEqual([]);
      expect(lane0.activeInFlightCount).toBe(0);

      h.session.dispose();
      expect(h.lanes[1]!.disposedCount).toBe(1);
    },
  );

  it.each(STALE_OPS)(
    "[모의 GPU 레인 검증] %s 지연 중 clear()가 불린 뒤 이전 레인의 연산이 reject되어도 onError·이중 replaceLane 없이 새 레인이 유지된다",
    async (op) => {
      const h = await createHarness({ abortMode: "lossy" });
      const lane0 = h.lanes[0]!;
      const gate = lane0.holdNext(op);

      dispatchStroke(h.el, 10, { x0: 4, y0: 4, x1: 20, y1: 20 });
      h.fr.tick();
      await gate.entered;

      const clearing = h.session.clear();
      dispatchStroke(h.el, 100, { x0: 8, y0: 30, x1: 30, y1: 12 });
      h.fr.tick();

      gate.reject(new Error(`${op} 지연 실패`));
      await clearing;
      await flushMicrotasks(20);

      // 이미 clear()로 폐기된 이전 세대의 실패이므로 onError나 추가 레인 교체를 일으키지 않는다
      expect(h.errors).toEqual([]);
      expect(h.aborts).toEqual([]);
      expect(h.lanes).toHaveLength(2);
      expect(h.session.strokes).toBe(1);
      expect(h.results).toHaveLength(1);
      expect(h.results[0]!.seed).toBe(11);
      expect(lane0.disposedCount).toBe(1);
      expect(lane0.postDisposeCalls).toEqual([]);

      h.session.dispose();
    },
  );
});

describe("LiveStrokeSession 비동기 결함 주입: dispose() 수명주기·무누수 보장", () => {
  const IN_FLIGHT_OPS: ReadonlyArray<FaultOp> = ["beginStroke", "addSamples", "endStroke", "readback", "readbackLinear"];

  it.each(IN_FLIGHT_OPS)(
    "%s 진행 중 dispose()가 불리면 이후 resolve/reject 모두 콜백(onStrokeEnd·onError·onStrokeAbort)과 해제 후 레인 호출이 0이다",
    async (op) => {
      for (const outcome of ["resolve", "reject"] as const) {
        const h = await createHarness({ abortMode: "lossy" });
        const lane0 = h.lanes[0]!;
        const gate = lane0.holdNext(op);

        dispatchStroke(h.el, 10, { x0: 5, y0: 5, x1: 25, y1: 25 });
        h.fr.tick();
        await gate.entered;

        // 진행 중 상태에서 dispose() (멱등성 확인을 위해 2회 호출)
        h.session.dispose();
        h.session.dispose();
        expect(lane0.disposedCount).toBe(1);

        if (outcome === "resolve") gate.resolve();
        else gate.reject(new Error(`${op} 해제 후 실패`));
        await flushMicrotasks(20);

        expect(h.results).toEqual([]);
        expect(h.errors).toEqual([]);
        expect(h.aborts).toEqual([]);
        expect(lane0.disposedCount).toBe(1);
        expect(lane0.postDisposeCalls).toEqual([]);
        expect(lane0.activeInFlightCount).toBe(0);
      }
    },
  );

  it("abortStroke 비동기 지연 중 dispose()가 불리면 replaceLane·onError·onStrokeAbort를 부르지 않고 레인을 한 번만 해제한다", async () => {
    const h = await createHarness({ abortMode: "lossy" });
    const lane0 = h.lanes[0]!;
    lane0.failNextSync("addSamples", new Error("addSamples 실패"));
    const abortGate = lane0.holdNext("abortStroke");

    h.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 5, clientY: 5, timeStamp: 10 }));
    h.fr.tick();
    await abortGate.entered;

    h.session.dispose();
    abortGate.resolve();
    await flushMicrotasks(20);

    expect(h.lanes).toHaveLength(1);
    expect(h.errors).toEqual([]);
    expect(h.aborts).toEqual([]);
    expect(lane0.disposedCount).toBe(1);
    expect(lane0.postDisposeCalls).toEqual([]);
    expect(lane0.activeInFlightCount).toBe(0);
  });
});

describe("LiveStrokeSession 비동기 결함 주입: 동시 입력 제스처(Gesture #2) vs 이전 획(Gesture #1) 비동기 실패", () => {
  it.each([
    { label: "실제 CPU 참조 레인(cpu-reference)", makeLane: () => createCpuReferenceLane() },
    { label: "실제 WASM CPU 레인(wasm-cpu)", makeLane: () => createWasmCpuLane() },
  ])(
    "[$label 픽셀 검증] 획 #1의 endStroke/readback 지연 중 시작된 획 #2는 획 #1이 뒤늦게 실패해도 거부되지 않고 기준선과 비트 동일하게 완성된다",
    async ({ makeLane }) => {
      const makeStage = () => composeStages([createLazyBrushStage({ radiusPx: 8 }), createPenSpringStage({ lagMs: 16 })]);

      // 기준선: 깨끗한 세션에서 획 #2와 같은 궤적을 첫 획(seed 11)으로 그린 결과
      const ref = await createHarness({
        createInnerLane: makeLane,
        inputStage: makeStage(),
      });
      ref.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 8, clientY: 36, timeStamp: 100, pressure: 0.75 }));
      ref.el.dispatchEvent(pointerEvent("pointermove", { clientX: 18, clientY: 26, timeStamp: 108, pressure: 0.8 }));
      ref.fr.tick();
      await flushMicrotasks();
      ref.el.dispatchEvent(pointerEvent("pointermove", { clientX: 28, clientY: 16, timeStamp: 116, pressure: 0.85 }));
      ref.el.dispatchEvent(pointerEvent("pointerup", { clientX: 38, clientY: 8, timeStamp: 124, pressure: 0.7 }));
      ref.fr.tick();
      await flushMicrotasks(20);
      expect(ref.results).toHaveLength(1);
      const refResult = ref.results[0]!;
      ref.session.dispose();

      // 시험 대상: 획 #1의 readback이 보류된 상태에서 사용자가 획 #2의 pointerdown + 첫 pointermove를 시작하고,
      // 그 순간 획 #1의 readback이 거부된 뒤 사용자가 획 #2의 나머지 move + pointerup을 마친다.
      const h = await createHarness({
        createInnerLane: makeLane,
        inputStage: makeStage(),
      });
      const lane0 = h.lanes[0]!;
      // 획 #1이 표면을 오염시키지 않도록 획 #1의 endStroke를 진입 직전 비동기 거부로 주입
      const endGate = createFaultInjectionLane();
      void endGate;
      let holdFirstEndResolve: (() => void) | null = null;
      let holdFirstEndEntered: (() => void) | null = null;
      const enteredPromise = new Promise<void>((res) => {
        holdFirstEndEntered = res;
      });
      const origEnd = lane0.inner.endStroke.bind(lane0.inner);
      let firstCall = true;
      lane0.inner.endStroke = async () => {
        if (firstCall) {
          firstCall = false;
          holdFirstEndEntered?.();
          await new Promise<void>((res) => {
            holdFirstEndResolve = res;
          });
          // 표면 합성 전에 실패를 던져 표면이 깨끗하게 복원되게 한다
          lane0.inner.abortStroke();
          throw new Error("획 #1 비동기 마감 실패");
        }
        return origEnd();
      };

      // 1. 획 #1 전체 입력 전송 후 endStroke에서 대기
      dispatchStroke(h.el, 10, { x0: 4, y0: 4, x1: 20, y1: 20 });
      h.fr.tick();
      await enteredPromise;

      // 2. 획 #1이 아직 비동기 마감 중인 상태에서 사용자가 획 #2를 시작(pointerdown + 첫 pointermove)
      h.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 8, clientY: 36, timeStamp: 100, pressure: 0.75 }));
      h.el.dispatchEvent(pointerEvent("pointermove", { clientX: 18, clientY: 26, timeStamp: 108, pressure: 0.8 }));

      // 3. 이제 획 #1의 endStroke가 실패한다! (이 시점에 this.pointerDown === true이지만 제스처 ID는 획 #2다)
      holdFirstEndResolve!();
      await flushMicrotasks(20);
      expect(h.errors).toHaveLength(1);
      expect(String(h.errors[0])).toContain("획 #1 비동기 마감 실패");
      expect(h.aborts).toHaveLength(1);
      expect(h.aborts[0]).toMatchObject({ cause: "error", laneReplaced: false });

      // 4. 획 #2의 나머지 move + pointerup을 보내고 프레임을 진행시킨다
      h.fr.tick();
      await flushMicrotasks();
      h.el.dispatchEvent(pointerEvent("pointermove", { clientX: 28, clientY: 16, timeStamp: 116, pressure: 0.85 }));
      h.el.dispatchEvent(pointerEvent("pointerup", { clientX: 38, clientY: 8, timeStamp: 124, pressure: 0.7 }));
      h.fr.tick();
      await flushMicrotasks(20);

      // 획 #2는 거부되지 않고 정상 완료되며, 획 #1이 실패했으므로 시드(11)와 픽셀 해시·선형 버퍼가 기준선과 비트 동일하다!
      expect(h.results).toHaveLength(1);
      expect(h.session.strokes).toBe(1);
      expect(h.results[0]!.seed).toBe(refResult.seed);
      expect(h.results[0]!.samples).toEqual(refResult.samples);
      expect(imageHash(h.results[0]!.image)).toBe(imageHash(refResult.image));
      expect(h.results[0]!.linear).toEqual(refResult.linear);

      h.session.dispose();
    },
  );

  it("[모의 GPU 손실 레인 검증] 포인터가 눌린 채 복원 불가 레인이 실패해 replaceLane()이 실행돼도 pointerup 전까지 잔여 move/up은 거부되고 입력 단계가 오염되지 않는다", async () => {
    const h = await createHarness({
      abortMode: "lossy",
      inputStage: createLazyBrushStage({ radiusPx: 14 }),
    });
    const lane0 = h.lanes[0]!;
    lane0.failNextAsync("addSamples", new Error("GPU 손실 중 addSamples 비동기 실패"), 1);

    // 제스처 #1 시작: down + move → 첫 프레임에서 비동기 실패 → lossy이므로 replaceLane() 호출
    h.el.dispatchEvent(pointerEvent("pointerdown", { clientX: 4, clientY: 4, timeStamp: 10 }));
    h.el.dispatchEvent(pointerEvent("pointermove", { clientX: 24, clientY: 24, timeStamp: 18 }));
    h.fr.tick();
    await flushMicrotasks(20);

    expect(h.errors).toHaveLength(1);
    expect(h.aborts).toHaveLength(1);
    expect(h.aborts[0]).toMatchObject({ cause: "error", laneReplaced: true });
    expect(h.lanes).toHaveLength(2);

    const canonicalAfterFail = h.canonicalCounts.length;
    // 포인터가 아직 눌려 있는 동안의 잔여 move·up은 replaceLane() 이후에도 모두 차단되어야 한다
    h.el.dispatchEvent(pointerEvent("pointermove", { clientX: 35, clientY: 35, timeStamp: 26 }));
    h.el.dispatchEvent(pointerEvent("pointerup", { clientX: 40, clientY: 40, timeStamp: 34 }));
    h.fr.tick();
    await flushMicrotasks(10);
    expect(h.canonicalCounts.length).toBe(canonicalAfterFail);
    expect(h.results).toHaveLength(0);

    // 다음 제스처(#2)는 이전 제스처의 끈 위치(40, 40)를 끌고 오지 않고 새 down 위치(6, 6)에서 정확히 시작한다
    dispatchStroke(h.el, 100, { x0: 6, y0: 6, x1: 26, y1: 16 });
    h.fr.tick();
    await flushMicrotasks(20);

    expect(h.results).toHaveLength(1);
    expect(h.results[0]!.samples[0]).toMatchObject({ phase: "down", x: 6, y: 6 });
    expect(h.results[0]!.samples.at(-1)).toMatchObject({ phase: "up", x: 26, y: 16 });
    h.session.dispose();
  });
});

describe("LiveStrokeSession: 포인터 취소(pointercancel / lostpointercapture) 순서·소유자·동일 프레임 경합", () => {
  it("lostpointercapture → pointercancel 순서에서 cancelSource: 'lostpointercapture'와 '·캡처상실' 단서를 보존한다", async () => {
    const h = await createHarness();
    h.el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 5, clientY: 5, timeStamp: 10, buttons: 1 }));
    h.el.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 15, clientY: 15, timeStamp: 18, buttons: 3 }));
    h.fr.tick();
    await flushMicrotasks();

    h.el.dispatchEvent(pointerEvent("lostpointercapture", { pointerId: 1, clientX: 15, clientY: 15, timeStamp: 24, buttons: 0 }));
    h.el.dispatchEvent(pointerEvent("pointercancel", { pointerId: 1, clientX: 15, clientY: 15, timeStamp: 26, buttons: 0 }));
    h.fr.tick();
    await flushMicrotasks();

    expect(h.aborts).toHaveLength(1);
    expect(h.aborts[0]).toMatchObject({
      cause: "pointercancel",
      cancelSource: "lostpointercapture",
      laneReplaced: false,
    });
    expect(h.aborts[0]!.strokeKo).toContain("·우클릭 병행");
    expect(h.aborts[0]!.strokeKo).toContain("·캡처상실");
    h.session.dispose();
  });

  it("pointercancel → lostpointercapture 순서에서는 cancelSource: 'pointercancel'을 유지하고 다음 획을 오염시키지 않는다", async () => {
    const h = await createHarness();
    h.el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 5, clientY: 5, timeStamp: 10 }));
    h.el.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 15, clientY: 15, timeStamp: 18 }));
    h.fr.tick();
    await flushMicrotasks();

    // pointercancel 직후(tick 전) 따라오는 lostpointercapture
    h.el.dispatchEvent(pointerEvent("pointercancel", { pointerId: 1, clientX: 15, clientY: 15, timeStamp: 24 }));
    h.el.dispatchEvent(pointerEvent("lostpointercapture", { pointerId: 1, clientX: 15, clientY: 15, timeStamp: 25 }));
    h.fr.tick();
    await flushMicrotasks();

    expect(h.aborts).toHaveLength(1);
    expect(h.aborts[0]).toMatchObject({
      cause: "pointercancel",
      cancelSource: "pointercancel",
      laneReplaced: false,
    });
    expect(h.aborts[0]!.strokeKo).not.toContain("·캡처상실");

    // 다음 획이 취소되더라도 이전 lostpointercapture가 남지 않는다
    h.el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 6, clientY: 6, timeStamp: 100 }));
    h.el.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 16, clientY: 16, timeStamp: 108 }));
    h.fr.tick();
    await flushMicrotasks();
    h.el.dispatchEvent(pointerEvent("pointercancel", { pointerId: 1, clientX: 16, clientY: 16, timeStamp: 116 }));
    h.fr.tick();
    await flushMicrotasks();

    expect(h.aborts).toHaveLength(2);
    expect(h.aborts[1]!.cancelSource).toBe("pointercancel");
    h.session.dispose();
  });

  it("소유하지 않은 포인터(pointerId 99)의 lostpointercapture·pointercancel은 소유 포인터(pointerId 1)의 취소 출처와 버튼을 오염시키지 않는다", async () => {
    const h = await createHarness();
    h.el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 5, clientY: 5, timeStamp: 10, buttons: 1 }));
    h.el.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 15, clientY: 15, timeStamp: 18, buttons: 1 }));
    h.fr.tick();
    await flushMicrotasks();

    // 비소유 포인터(99)가 우클릭 비트와 함께 lostpointercapture 및 pointercancel 발생
    h.el.dispatchEvent(pointerEvent("lostpointercapture", { pointerId: 99, clientX: 1, clientY: 1, timeStamp: 20, buttons: 2 }));
    h.el.dispatchEvent(pointerEvent("pointercancel", { pointerId: 99, clientX: 1, clientY: 1, timeStamp: 22, buttons: 2 }));

    // 이후 소유 포인터(1)가 일반 pointercancel로 취소됨
    h.el.dispatchEvent(pointerEvent("pointercancel", { pointerId: 1, clientX: 15, clientY: 15, timeStamp: 26, buttons: 0 }));
    h.fr.tick();
    await flushMicrotasks();

    expect(h.aborts).toHaveLength(1);
    expect(h.aborts[0]!.cancelSource).toBe("pointercancel");
    expect(h.aborts[0]!.strokeKo).not.toContain("·캡처상실");
    expect(h.aborts[0]!.strokeKo).not.toContain("·우클릭 병행");
    h.session.dispose();
  });

  it("같은 프레임에서 lostpointercapture+pointercancel 직후 새 pointerdown이 들어와도 취소된 획의 단서(캡처상실·우클릭 병행)가 보존되고 새 획도 완료된다", async () => {
    const h = await createHarness();
    h.el.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 5, clientY: 5, timeStamp: 10, buttons: 1 }));
    h.el.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 15, clientY: 15, timeStamp: 18, buttons: 3 }));
    h.fr.tick();
    await flushMicrotasks();

    // 같은 프레임(tick 전) 안에서: 획 #1 캡처 상실 취소 + 획 #2 새로 시작 및 완료
    h.el.dispatchEvent(pointerEvent("lostpointercapture", { pointerId: 1, clientX: 15, clientY: 15, timeStamp: 24, buttons: 0 }));
    h.el.dispatchEvent(pointerEvent("pointercancel", { pointerId: 1, clientX: 15, clientY: 15, timeStamp: 26, buttons: 0 }));
    dispatchStroke(h.el, 30, { x0: 8, y0: 8, x1: 28, y1: 28 }, 2);
    h.fr.tick();
    await flushMicrotasks(20);

    expect(h.aborts).toHaveLength(1);
    expect(h.aborts[0]!.cancelSource).toBe("lostpointercapture");
    expect(h.aborts[0]!.strokeKo).toContain("·우클릭 병행");
    expect(h.aborts[0]!.strokeKo).toContain("·캡처상실");
    expect(h.results).toHaveLength(1);
    expect(h.results[0]!.seed).toBe(11);
    h.session.dispose();
  });
});

describe("LiveStrokeSession: 실제 CPU/WASM 레인 endStroke 합성 도중 실패 시 replaceLane 복구", () => {
  it.each([
    { label: "cpu-reference", makeLane: () => createCpuReferenceLane() },
    { label: "wasm-cpu", makeLane: () => createWasmCpuLane() },
  ])(
    "[$label 실제 픽셀 검증] endStroke가 타일 일부 합성 뒤 실패하면 abortStroke가 documentPreserved:false를 돌려줘 세션을 새 레인으로 교체한다",
    async ({ makeLane }) => {
      const h = await createHarness({ createInnerLane: makeLane });
      // 획 #1 정상 완료
      dispatchStroke(h.el, 10, { x0: 4, y0: 4, x1: 30, y1: 30 });
      h.fr.tick();
      await flushMicrotasks(20);
      expect(h.results).toHaveLength(1);

      // 획 #2: 레인 0의 표면이 첫 타일을 문서에 합성한 직후 던지도록 결함 주입(문서가 일부 오염됨)
      const lane0Inner = h.lanes[0]!.inner as BrushEngineLane & {
        currentSurface(): { stroke: { tiles(): Iterable<[number, Float32Array]> } } | null;
      };
      const surface = lane0Inner.currentSurface();
      expect(surface).not.toBeNull();
      const origTiles = surface!.stroke.tiles.bind(surface!.stroke);
      surface!.stroke.tiles = function* failingTiles(): Iterable<[number, Float32Array]> {
        for (const entry of origTiles()) {
          yield entry;
          throw new Error("타일 합성 도중 실패");
        }
      };

      dispatchStroke(h.el, 100, { x0: 6, y0: 36, x1: 36, y1: 6 });
      h.fr.tick();
      // wasm-cpu의 replaceLane()은 WebCrypto SHA-256 + WebAssembly.compile을 비동기 태스크로 수행하므로 완료될 때까지 대기한다
      for (let attempt = 0; attempt < 50 && h.errors.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await flushMicrotasks(20);

      // 문서가 일부 오염됐으므로 pendingAbort를 통해 documentPreserved: false가 전달되고 레인이 교체되어야 한다
      expect(h.errors).toHaveLength(1);
      expect(String(h.errors[0])).toContain("타일 합성 도중 실패");
      expect(h.aborts).toHaveLength(1);
      expect(h.aborts[0]).toMatchObject({
        cause: "error",
        laneReplaced: true,
        receipt: { documentPreserved: false },
      });
      expect(h.lanes).toHaveLength(2);
      expect(h.session.currentLane).toBe(h.lanes[1]);

      // 교체된 레인 1에서 다음 획이 정상 동작한다
      dispatchStroke(h.el, 200, { x0: 10, y0: 10, x1: 32, y1: 32 });
      h.fr.tick();
      await flushMicrotasks(20);
      expect(h.results).toHaveLength(2);

      h.session.dispose();
    },
  );
});
