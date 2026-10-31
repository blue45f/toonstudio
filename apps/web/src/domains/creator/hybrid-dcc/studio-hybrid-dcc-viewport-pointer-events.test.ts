// @vitest-environment jsdom
/** 실제 R3F store/event manager의 수명 회귀다. 합성 입력이며 native/GPU 성공 증거가 아니다. */
import * as Fiber from "@react-three/fiber";
import { PerspectiveCamera, Raycaster } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioHybridDccViewportPointerEvents } from "./studio-hybrid-dcc-viewport-pointer-events";

const WIDTH = 990, HEIGHT = 636;
const X = 436.98211669921875, Y = 398.64385986328125;
const cleanups: Array<() => void> = [];

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("실제 R3F 수명 fixture가 준비되지 않았습니다.");
  return value;
}

/** OS 신뢰·좌표 경계만 합성한다. MouseEvent와 R3F manager 자체는 실제 구현을 사용한다. */
function sample(canvas: HTMLCanvasElement, type: string, timeStamp: number, detail = type === "click" ? 1 : 0) {
  const click = type === "click";
  const event = new MouseEvent(type, { bubbles: true, button: 0, buttons: type === "pointerdown" ? 1 : 0, detail });
  Object.defineProperties(event, {
    target: { value: canvas }, timeStamp: { value: timeStamp },
    offsetX: { value: click ? Math.round(X) : X }, offsetY: { value: click ? Math.round(Y) : Y },
    clientX: { value: click ? Math.floor(X + 229) : X + 229 },
    clientY: { value: click ? Math.floor(Y + 80.75) : Y + 80.75 },
    pointerId: { value: 1 }, pointerType: { value: "mouse" }, isPrimary: { value: true },
  });
  return new Proxy(event, {
    get(target, key) {
      if (key === "isTrusted") return true;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function fixture() {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  // configure/render를 하지 않으므로 renderer·GPU·프레임 루프를 만들지 않는다.
  Fiber.createRoot(canvas);
  const store = required(Fiber._roots.get(canvas)).store;
  cleanups.push(() => {
    try { store.getState().events.disconnect?.(); }
    finally {
      // 미구성·미렌더 root의 등록만 제거한다. 지연 unmount/context loss는 실행하지 않는다.
      Fiber._roots.delete(canvas); canvas.remove();
    }
  });
  const camera = new PerspectiveCamera(42, WIDTH / HEIGHT, 0.001, 1000);
  camera.position.set(2, 2, 3); camera.updateMatrixWorld();
  // store의 resize 경계만 기록한다. WebGLRenderer·context를 만들거나 제품 renderer를 교체하지 않는다.
  Object.defineProperty(store.getState(), "gl", {
    value: { domElement: canvas, setPixelRatio: vi.fn(), setSize: vi.fn() }, configurable: true, writable: true,
  });
  store.setState({ camera, raycaster: new Raycaster(), size: { width: WIDTH, height: HEIGHT, left: 229, top: 80.75 } });

  const original = Fiber.events(store);
  const compute = vi.fn(required(original.compute));
  const update = vi.fn(required(original.update));
  const disconnect = vi.fn(required(original.disconnect));
  const handlers = required(original.handlers);
  const cancel = vi.fn(handlers.onPointerCancel), leave = vi.fn(handlers.onPointerLeave);
  original.compute = compute; original.update = update; original.disconnect = disconnect;
  handlers.onPointerCancel = cancel; handlers.onPointerLeave = leave;
  // factory만 실제 생성한 manager로 고정하고 handler/compute/update의 본문은 그대로 실행한다.
  vi.spyOn(Fiber, "events").mockReturnValueOnce(original);
  const adapter = createStudioHybridDccViewportPointerEvents(store);
  store.setState({ events: { ...store.getState().events, ...adapter } });
  const send = (event: MouseEvent) => required(adapter.compute)(event, store.getState());
  const replay = (event: MouseEvent) => {
    store.getState().internal.lastEvent.current = event;
    required(adapter.update)();
  };
  return { canvas, store, adapter, original, compute, update, disconnect, cancel, leave, send, replay };
}
type Fixture = ReturnType<typeof fixture>;

function release(f: Fixture, time = 100) {
  const down = sample(f.canvas, "pointerdown", time), up = sample(f.canvas, "pointerup", time + 25);
  f.send(down); f.send(up);
  return { down, up, click: sample(f.canvas, "click", time + 26) };
}
function expectOffset(f: Fixture, x: number, y: number) {
  expect(f.store.getState().pointer.x).toBe(x / WIDTH * 2 - 1);
  expect(f.store.getState().pointer.y).toBe(-(y / HEIGHT) * 2 + 1);
  expect(f.store.getState().raycaster.camera).toBe(f.store.getState().camera);
}

afterEach(() => {
  try { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); }
  finally { vi.restoreAllMocks(); document.body.replaceChildren(); }
});

describe("공개 R3F event manager에 연결한 정밀 click 수명", () => {
  it("정상 연결·해제는 원래 handler identity로 위임하고 disconnect가 cached release를 지운다", () => {
    const f = fixture();
    const add = vi.spyOn(f.canvas, "addEventListener"), remove = vi.spyOn(f.canvas, "removeEventListener");
    required(f.adapter.connect)(f.canvas);
    expect(f.store.getState().events.connected).toBe(f.canvas);
    expect(f.adapter.handlers?.onPointerDown).toBe(f.original.handlers?.onPointerDown);
    expect(f.adapter.handlers?.onClick).toBe(f.original.handlers?.onClick);
    expect(add).toHaveBeenCalledWith("pointerdown", f.original.handlers?.onPointerDown, { passive: true });
    const first = release(f);
    f.disconnect.mockClear();
    required(f.adapter.disconnect)();
    expect(f.disconnect).toHaveBeenCalledExactlyOnceWith();
    expect(f.store.getState().events.connected).toBeUndefined();
    expect(remove).toHaveBeenCalledWith("pointerdown", f.original.handlers?.onPointerDown);
    expect(remove).toHaveBeenCalledWith("pointercancel", f.adapter.handlers?.onPointerCancel);
    required(f.adapter.connect)(f.canvas);
    f.compute.mockClear(); f.send(first.click);
    expect(f.compute).toHaveBeenCalledExactlyOnceWith(first.click, f.store.getState(), undefined);
    expectOffset(f, Math.round(X), Math.round(Y));
    f.send(release(f, 200).click);
    expectOffset(f, X, Y);
  });

  const interruptions = [
    { name: "cancel", handler: "onPointerCancel", type: "pointercancel", afterRelease: false },
    { name: "cancel", handler: "onPointerCancel", type: "pointercancel", afterRelease: true },
    { name: "leave", handler: "onPointerLeave", type: "pointerleave", afterRelease: false },
    { name: "leave", handler: "onPointerLeave", type: "pointerleave", afterRelease: true },
  ] as const;
  it.each(interruptions)("$name 위임은 afterRelease=$afterRelease에서도 이전 입력을 복구하지 않는다", ({ handler, type, afterRelease }) => {
    const f = fixture(), down = sample(f.canvas, "pointerdown", 100), up = sample(f.canvas, "pointerup", 125);
    f.send(down); if (afterRelease) f.send(up);
    const interruption = sample(f.canvas, type, afterRelease ? 126 : 110);
    f.compute.mockClear();
    required(f.adapter.handlers)[handler](interruption);
    expect(type === "pointercancel" ? f.cancel : f.leave).toHaveBeenCalledExactlyOnceWith(interruption);
    expect(f.compute).not.toHaveBeenCalled();
    if (!afterRelease) f.send(up);
    const click = sample(f.canvas, "click", 127);
    f.compute.mockClear(); f.send(click);
    expect(f.compute).toHaveBeenCalledExactlyOnceWith(click, f.store.getState(), undefined);
    expectOffset(f, Math.round(X), Math.round(Y));
    f.send(release(f, 200).click);
    expectOffset(f, X, Y);
  });

  it("공개 update의 pointerdown 재생은 같은 pointer를 두 번째 down으로 세지 않는다", () => {
    const f = fixture(), down = sample(f.canvas, "pointerdown", 100);
    f.send(down); f.compute.mockClear();
    f.replay(down);
    expect(f.update).toHaveBeenCalledExactlyOnceWith();
    expect(f.compute).toHaveBeenCalledExactlyOnceWith(down, f.store.getState(), undefined);
    f.send(sample(f.canvas, "pointerup", 125));
    f.compute.mockClear(); f.send(sample(f.canvas, "click", 126));
    expect(f.compute).not.toHaveBeenCalled();
    expectOffset(f, X, Y);
  });

  it("공개 update의 pointerup 재생은 저장한 release를 다시 소비하지 않는다", () => {
    const f = fixture(), gesture = release(f);
    f.compute.mockClear(); f.replay(gesture.up);
    expect(f.update).toHaveBeenCalledExactlyOnceWith();
    expect(f.compute).toHaveBeenCalledExactlyOnceWith(gesture.up, f.store.getState(), undefined);
    f.compute.mockClear(); f.send(gesture.click);
    expect(f.compute).not.toHaveBeenCalled();
    expectOffset(f, X, Y);
  });

  it("오래된 click을 공개 update로 재생해도 새 release를 지우지 않고 실제 click은 한 번만 보정한다", () => {
    const f = fixture(), first = release(f);
    f.send(first.click); expectOffset(f, X, Y);
    const next = release(f, 200);
    // update가 읽는 lastEvent만 명시한다. 재생은 원래 onPointerMove→compute 경로를 실제로 지난다.
    f.compute.mockClear(); f.replay(first.click);
    expect(f.update).toHaveBeenCalledExactlyOnceWith();
    expect(f.compute).toHaveBeenCalledExactlyOnceWith(first.click, f.store.getState(), undefined);
    expectOffset(f, Math.round(X), Math.round(Y));
    f.compute.mockClear(); f.send(next.click);
    expect(f.compute).not.toHaveBeenCalled(); expectOffset(f, X, Y);
    f.send(next.click);
    expect(f.compute).toHaveBeenCalledExactlyOnceWith(next.click, f.store.getState(), undefined);
    expectOffset(f, Math.round(X), Math.round(Y));
  });

  it("원래 update의 compute가 throw해도 오류 identity와 replay flag 복구를 보존한다", () => {
    const f = fixture(), gesture = release(f), failure = new Error("통제된 원 compute 실패");
    f.compute.mockClear(); f.compute.mockImplementationOnce(() => { throw failure; });
    let caught: unknown;
    try { f.replay(gesture.up); } catch (error) { caught = error; }
    expect(caught).toBe(failure);
    expect(f.update).toHaveBeenCalledExactlyOnceWith();
    expect(f.compute).toHaveBeenCalledExactlyOnceWith(gesture.up, f.store.getState(), undefined);
    f.compute.mockClear(); f.send(gesture.click);
    expect(f.compute).not.toHaveBeenCalled();
    expectOffset(f, X, Y);
  });

  it("키보드 detail0 click은 cached release를 쓰지 않고 원래 compute에 위임한다", () => {
    const f = fixture(), gesture = release(f), keyboard = sample(f.canvas, "click", 126, 0);
    f.compute.mockClear(); f.send(keyboard);
    expect(f.compute).toHaveBeenCalledExactlyOnceWith(keyboard, f.store.getState(), undefined);
    expectOffset(f, Math.round(X), Math.round(Y));
    f.compute.mockClear(); f.send(gesture.click);
    expect(f.compute).toHaveBeenCalledExactlyOnceWith(gesture.click, f.store.getState(), undefined);
    expectOffset(f, Math.round(X), Math.round(Y));
  });
});
