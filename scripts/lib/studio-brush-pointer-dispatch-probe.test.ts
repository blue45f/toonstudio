import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { createStudioDrawingPointerTransportController } from "../../apps/web/src/domains/creator/brush/studio-drawing-pointer-transport";
import { beginStudioStrokePointerSession } from "../../apps/web/src/domains/creator/canvas/studio-pointer-input";

import {
  isStudioBrushPointerDispatchBoundaryValid,
  studioBrushPointerDispatchInitSource,
  type StudioBrushPointerDispatchProbe,
} from "./studio-brush-pointer-dispatch-probe";

/** 외부 포트 fixture다. 실제 브라우저 dispatch/성능 증명은 native fixture가 맡는다. */
function ports(readyState = "loading") {
  let now = 10;
  const performance = { timeOrigin: 100, now: () => now };
  const calls: Array<{ receiver: unknown; args: readonly unknown[] }> = [];
  type TestEvent = Pick<PointerEvent, "type" | "isTrusted" | "pointerId" | "pointerType" | "buttons"
    | "button" | "isPrimary" | "clientX" | "clientY" | "pressure" | "timeStamp"> & { target: TestNode };
  type Listener = { callback: (event: TestEvent) => void; capture: boolean };
  class Target {
    readonly listeners = new Map<string, Listener[]>();
    addEventListener(...args: unknown[]): void {
      if (!(this instanceof Target)) throw new TypeError("잘못된 수신자");
      calls.push({ receiver: this, args });
      const type = String(args[0]);
      const callback = args[1];
      const options = args[2] as boolean | AddEventListenerOptions | undefined;
      const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
      if (typeof callback !== "function") return;
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), {
        callback: callback as (event: TestEvent) => void, capture,
      }]);
    }
    removeEventListener(type: string, callback: unknown, options: boolean | EventListenerOptions = false): void {
      const capture = typeof options === "boolean" ? options : Boolean(options.capture);
      this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item => (
        item.callback !== callback || item.capture !== capture
      )));
    }
    emit(event: TestEvent, capture: boolean): void {
      for (const item of [...(this.listeners.get(event.type) ?? [])]) {
        if (item.capture === capture) item.callback(event);
      }
    }
  }
  class TestNode extends Target {
    contains(node: unknown): boolean { return node === this; }
  }
  class TestWindow extends Target {
    readonly top = this;
    __studioBrushPointerDispatch?: StudioBrushPointerDispatchProbe;
  }
  const handlerValues = new WeakMap<object, Map<string, unknown>>();
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
    Object.defineProperty(TestWindow.prototype, `on${type}`, {
      configurable: true, enumerable: true,
      get() { return handlerValues.get(this)?.get(type) ?? null; },
      set(value: unknown) {
        if (!(this instanceof TestWindow)) throw new TypeError("잘못된 handler 수신자");
        const values = handlerValues.get(this) ?? new Map<string, unknown>();
        values.set(type, value); handlerValues.set(this, values);
      },
    });
  }
  const originalAdd = Object.getOwnPropertyDescriptor(Target.prototype, "addEventListener");
  const originalSetter = Object.getOwnPropertyDescriptor(TestWindow.prototype, "onpointermove");
  const stage = new TestNode();
  const window = new TestWindow();
  const location = { href: "https://fixture.invalid/studio" };
  const sandbox = { window, document: { readyState, querySelector: () => stage }, performance,
    location, EventTarget: Target, Node: TestNode };
  runInNewContext(studioBrushPointerDispatchInitSource(), sandbox);
  const probe = window.__studioBrushPointerDispatch;
  if (!probe) throw new Error("fixture 계측 init이 없습니다.");
  const event = (type: string, overrides: Partial<TestEvent> = {}): TestEvent => ({
    type, target: stage, isTrusted: true, pointerId: 1, pointerType: "mouse", isPrimary: true,
    button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: now, clientY: 20,
    pressure: 0.5, timeStamp: now, ...overrides,
  });
  const dispatch = (type: string, duration = 2): void => {
    const current = event(type);
    window.emit(current, true); stage.emit(current, false); now += duration; window.emit(current, false);
  };
  const arm = (expectedPointerMoves = 1): void => probe.arm({
    expectedPointerMoves, stageSelector: "#stage", captureSamples: true,
  });
  const stroke = (): void => { dispatch("pointerdown"); dispatch("pointermove", 12); dispatch("pointerup", 54); };
  return { probe, window, stage, Target, TestWindow, calls, performance, location,
    event, dispatch, arm, stroke, originalAdd, originalSetter, advance: (ms: number) => { now += ms; } };
}

describe("포인터 dispatch 경계의 수명·위임 포트 계약", () => {
  it("독립 init으로 같은 Event의 최초 capture와 마지막 bubble만 짝짓는다", () => {
    const fixture = ports();
    fixture.arm(); fixture.stroke();
    const result = fixture.probe.finish();
    expect(isStudioBrushPointerDispatchBoundaryValid(result.boundary, 1, 1)).toBe(true);
    expect(result.pointerAppendDurationsMs).toEqual([12]);
    expect(result.pointerUpMainThreadMs).toBe(54);
    expect(result.samples.map(sample => [sample.sequence, sample.type, sample.durationMs])).toEqual([
      [1, "pointerdown", 2], [2, "pointermove", 12], [3, "pointerup", 54],
    ]);
  });

  it("합성 이벤트는 정상 native 표본으로 수락하지 않는다", () => {
    const fixture = ports(); fixture.arm();
    fixture.window.emit(fixture.event("pointerdown", { isTrusted: false }), true);
    fixture.stroke();
    expect(fixture.probe.finish().boundary.errors).toContain("untrusted-event");
  });

  it.each(["pointermove", "pointerup"])("%s 끝점이 전파 중단으로 빠지면 실패한다", type => {
    const fixture = ports(); fixture.arm(); fixture.dispatch("pointerdown");
    if (type === "pointerup") fixture.dispatch("pointermove");
    fixture.window.emit(fixture.event(type), true);
    const result = fixture.probe.finish();
    expect(result.boundary.errors).toContain("missing-event-end");
    expect(isStudioBrushPointerDispatchBoundaryValid(result.boundary, 1, 1)).toBe(false);
  });

  it("동일 속성의 다른 Event로 끝점을 대체할 수 없다", () => {
    const fixture = ports(); fixture.arm(); fixture.dispatch("pointerdown");
    fixture.window.emit(fixture.event("pointermove"), true);
    fixture.window.emit(fixture.event("pointermove"), false);
    const errors = fixture.probe.finish().boundary.errors;
    expect(errors).toContain("event-end-without-start");
    expect(errors).toContain("missing-event-end");
  });

  it("중복과 역순 끝점을 유효 표본으로 계산하지 않는다", () => {
    const fixture = ports(); fixture.arm(2); fixture.dispatch("pointerdown");
    const first = fixture.event("pointermove"); const second = fixture.event("pointermove");
    fixture.window.emit(first, true); fixture.window.emit(second, true);
    fixture.window.emit(second, false); fixture.window.emit(first, false); fixture.window.emit(first, false);
    fixture.dispatch("pointerup");
    expect(fixture.probe.finish().boundary.errors).toEqual(expect.arrayContaining([
      "previous-dispatch-incomplete", "event-end-order", "duplicate-event-end",
    ]));
  });

  it.each(["pointerId", "pointerType"] as const)("%s가 바뀌면 거절한다", key => {
    const fixture = ports(); fixture.arm(); fixture.dispatch("pointerdown");
    const current = fixture.event("pointermove", key === "pointerId" ? { pointerId: 2 } : { pointerType: "pen" });
    fixture.window.emit(current, true); fixture.window.emit(current, false); fixture.dispatch("pointerup");
    expect(fixture.probe.finish().boundary.errors).toContain("pointer-identity-mismatch");
  });

  it("취소와 document epoch 변경은 실패하고 이전 세션으로 대체하지 않는다", () => {
    const fixture = ports(); fixture.arm(); fixture.stroke(); fixture.dispatch("pointercancel");
    fixture.performance.timeOrigin += 1;
    expect(fixture.probe.finish().boundary.errors).toEqual(expect.arrayContaining([
      "pointer-cancelled", "document-changed",
    ]));
  });

  it("앱 실행 후 init과 중복 arm은 즉시 실패한다", () => {
    expect(() => ports("complete").arm()).toThrow(/초기화 실패/u);
    const fixture = ports(); fixture.arm();
    expect(() => fixture.arm()).toThrow(/수명/u);
  });

  it("원래 수신자·인자·options getter·DOMString 변환·예외를 그대로 위임한다", () => {
    const fixture = ports(); let optionReads = 0; let typeReads = 0;
    const options = { get capture() { optionReads += 1; return true; } };
    const type = { toString() { typeReads += 1; return "pointermove"; } };
    const listener = () => undefined;
    fixture.arm();
    const result = Reflect.apply(fixture.window.addEventListener, fixture.window, [type, listener, options]);
    expect(result).toBeUndefined();
    expect(optionReads).toBe(1); expect(typeReads).toBe(1);
    expect(fixture.calls.at(-1)).toEqual({ receiver: fixture.window, args: [type, listener, options] });
    expect(() => Reflect.apply(fixture.window.addEventListener, {}, ["pointermove", listener])).toThrow(/수신자/u);
    fixture.stroke();
    expect(fixture.probe.finish().boundary.lateWindowChanges).toBe(1);
  });

  it.each([false, true])("arm 뒤 window 등록은 capture=%s에서도 무효다", capture => {
    const fixture = ports(); fixture.arm();
    fixture.window.addEventListener("pointermove", () => undefined, { capture });
    fixture.stroke();
    expect(fixture.probe.finish().boundary.errors).toContain("late-window-listener-change");
  });

  it("다른 target·이벤트 등록과 기존 remove는 정상 의미를 유지한다", () => {
    const fixture = ports(); fixture.arm(); const listener = () => undefined;
    fixture.window.addEventListener("resize", listener);
    fixture.stage.addEventListener("pointermove", listener);
    fixture.window.removeEventListener("resize", listener);
    fixture.stroke();
    expect(fixture.probe.finish().boundary.complete).toBe(true);
  });

  it("실제 제품 transport의 down 중 원시 true 등록·release·재arm 비용을 포함한다", () => {
    const fixture = ports();
    const transport = createStudioDrawingPointerTransportController({ windowTarget: fixture.window, documentTarget: null });
    transport.updatePorts({
      getLastAuthoritativePointer: () => null,
      onAuthoritativeMove: () => fixture.advance(18),
      onRawPreviewMove: () => { throw new Error("mouse 획의 raw 경로를 실행했습니다."); },
      onDiscard: () => { throw new Error("정상 획을 폐기했습니다."); },
      onFinish: () => { fixture.advance(55); transport.release(); },
    });
    fixture.stage.addEventListener("pointerdown", (event: Event) => {
      const pointer = event as PointerEvent;
      const session = beginStudioStrokePointerSession(pointer);
      if (!session) throw new Error("실제 제품 pointer session을 만들지 못했습니다.");
      expect(transport.start({ pointerEvent: pointer, session, stage: null }).started).toBe(true);
    });
    for (let cycle = 0; cycle < 2; cycle += 1) {
      fixture.arm(); fixture.dispatch("pointerdown");
      fixture.dispatch("pointermove", 0); fixture.dispatch("pointerup", 0);
      const result = fixture.probe.finish();
      expect(result.boundary.errors).toEqual([]);
      expect(isStudioBrushPointerDispatchBoundaryValid(result.boundary, 1, 1)).toBe(true);
      expect(result.pointerAppendDurationsMs).toEqual([18]);
      expect(result.pointerUpMainThreadMs).toBe(55);
      expect(transport.getSession()).toBeNull();
      expect([...fixture.window.listeners.values()].flat()).toHaveLength(4);
    }
    expect(fixture.calls.filter(call => ["pointermove", "pointerup", "pointercancel"].includes(String(call.args[0]))
      && call.args[2] === true)).toHaveLength(6);
    transport.dispose();
  });

  it("원시 true의 DOMString 변환을 다시 실행하지 않고 capture 위상을 보존한다", () => {
    const fixture = ports(); let conversions = 0;
    const type = { toString() { conversions += 1; return "pointermove"; } };
    fixture.arm(); fixture.window.addEventListener(type, () => fixture.advance(7), true);
    fixture.stroke();
    const result = fixture.probe.finish();
    expect(conversions).toBe(1);
    expect(result.boundary.complete).toBe(true);
    expect(result.pointerAppendDurationsMs).toEqual([19]);
  });

  it("onpointer setter는 기존 getter/receiver 계약을 보존하고 arm 뒤 변경을 거절한다", () => {
    const fixture = ports(); const listener = () => undefined;
    Reflect.set(fixture.window, "onpointermove", listener);
    expect(Reflect.get(fixture.window, "onpointermove")).toBe(listener);
    const descriptor = Object.getOwnPropertyDescriptor(fixture.TestWindow.prototype, "onpointermove");
    expect(descriptor?.get).toBe(fixture.originalSetter?.get);
    expect(() => descriptor?.set?.call({}, null)).toThrow(/수신자/u);
    fixture.arm(); Reflect.set(fixture.window, "onpointermove", null); fixture.stroke();
    expect(fixture.probe.finish().boundary.lateWindowChanges).toBe(1);
  });

  it("감사 wrapper 교체는 마지막 무결성 검사에서 드러난다", () => {
    const fixture = ports(); fixture.arm(); fixture.stroke();
    Object.defineProperty(fixture.window, "addEventListener", { value: () => undefined });
    expect(fixture.probe.finish().boundary.errors).toContain("listener-audit-replaced");
  });

  it("cancel/rearm/dispose는 이전 끝점과 원형을 정리한다", () => {
    const fixture = ports(); fixture.arm(); fixture.dispatch("pointerdown"); fixture.probe.cancel();
    fixture.arm(); fixture.stroke();
    expect(fixture.probe.finish().boundary.complete).toBe(true);
    fixture.probe.dispose();
    expect(fixture.window.__studioBrushPointerDispatch).toBeUndefined();
    expect([...fixture.window.listeners.values()].flat()).toEqual([]);
    expect(Object.getOwnPropertyDescriptor(fixture.Target.prototype, "addEventListener")).toEqual(fixture.originalAdd);
    expect(Object.getOwnPropertyDescriptor(fixture.TestWindow.prototype, "onpointermove")).toEqual(fixture.originalSetter);
    expect(() => fixture.arm()).toThrow(/수명/u);
  });

  it("누락·낡은 형식·카운트 불일치는 짧은 숫자와 관계없이 실패한다", () => {
    const fixture = ports(); fixture.arm(); fixture.stroke(); const { boundary } = fixture.probe.finish();
    expect(isStudioBrushPointerDispatchBoundaryValid(null, 1, 1)).toBe(false);
    expect(isStudioBrushPointerDispatchBoundaryValid(boundary, 1, 0)).toBe(false);
    expect(isStudioBrushPointerDispatchBoundaryValid({ ...boundary, starts: 2 }, 1, 1)).toBe(false);
    expect(isStudioBrushPointerDispatchBoundaryValid({ ...boundary, complete: false }, 1, 1)).toBe(false);
  });

  it("dispose는 다른 소유자가 바꾼 descriptor 속성이나 getter를 덮지 않는다", () => {
    const fixture = ports();
    const descriptor = Object.getOwnPropertyDescriptor(fixture.TestWindow.prototype, "onpointermove");
    const getter = () => "다른 소유자";
    Object.defineProperty(fixture.TestWindow.prototype, "onpointermove", { ...descriptor, get: getter });
    Object.defineProperty(fixture.Target.prototype, "addEventListener", { enumerable: true });
    fixture.probe.dispose();
    expect(Object.getOwnPropertyDescriptor(fixture.TestWindow.prototype, "onpointermove")?.get).toBe(getter);
    expect(Object.getOwnPropertyDescriptor(fixture.Target.prototype, "addEventListener")?.enumerable).toBe(true);
  });
});
