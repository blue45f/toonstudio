// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_CAMERA_PANNED_THRESHOLD_PX,
  StudioCameraPanRuntime,
  StudioCameraPanStore,
  bindStudioCameraGestures,
  bindStudioCameraPan,
  type StudioCameraPanFrame,
} from "./studio-virtual-space-camera-pan";
import { StudioUserZoomStore, type StudioUserZoomStorage } from "./studio-virtual-space-user-zoom";

describe("카메라 둘러보기 저장소", () => {
  it("끈 거리를 쌓아 두었다가 한 번에 꺼내고 비운다", () => {
    const store = new StudioCameraPanStore();
    expect(store.consumeDrag()).toBeNull();
    store.drag(10, -4);
    store.drag(5, 1);
    expect(store.consumeDrag()).toEqual({ x: 15, y: -3 });
    expect(store.consumeDrag()).toBeNull();
  });

  it("유한하지 않은 값은 무시한다", () => {
    const store = new StudioCameraPanStore();
    store.drag(Number.NaN, 3);
    store.drag(2, Number.POSITIVE_INFINITY);
    expect(store.consumeDrag()).toBeNull();
  });

  it("돌아오기 요청은 한 번만 전달되고, 아직 반영하지 않은 끌기를 버린다", () => {
    const store = new StudioCameraPanStore();
    store.drag(30, 30);
    store.recenter();
    expect(store.consumeDrag()).toBeNull();
    expect(store.consumeRecenter()).toBe(true);
    expect(store.consumeRecenter()).toBe(false);
  });

  it("돌아오기를 요청한 뒤 새로 끌면 요청이 취소된다", () => {
    const store = new StudioCameraPanStore();
    store.recenter();
    store.drag(1, 0);
    expect(store.consumeRecenter()).toBe(false);
  });

  it("스냅샷은 값이 바뀔 때만 새 객체가 되고 구독자도 그때만 부른다", () => {
    const store = new StudioCameraPanStore();
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    const first = store.getSnapshot();
    expect(first).toEqual({ available: true, panned: false });
    store.setAvailable(true);
    store.setPanned(false);
    expect(store.getSnapshot()).toBe(first);
    expect(listener).not.toHaveBeenCalled();
    store.setPanned(true);
    expect(store.getSnapshot()).toEqual({ available: true, panned: true });
    expect(store.getSnapshot()).not.toBe(first);
    store.setAvailable(false);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    store.setPanned(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

function frame(overrides: Partial<StudioCameraPanFrame> = {}): StudioCameraPanFrame {
  return {
    deltaSeconds: 1 / 60, available: true, directed: false, snap: false, reducedMotion: false, moving: false,
    cssToWorld: 1, base: { x: 1500, y: 900 }, center: { x: 1500, y: 900 }, view: { width: 800, height: 500 }, world: { width: 3072, height: 1920 },
    ...overrides,
  };
}

describe("카메라 둘러보기 런타임", () => {
  it("끌지 않았으면 오프셋이 0이라 기존 카메라 동작을 건드리지 않는다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    expect(runtime.sample(frame())).toEqual({ x: 0, y: 0, direct: false });
    expect(store.getSnapshot().panned).toBe(false);
  });

  it("끈 만큼(월드 거리로 환산해) 반대 방향으로 카메라 중심을 옮기고, 그때는 카메라가 지체 없이 따른다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.drag(100, -40);
    const sample = runtime.sample(frame({ cssToWorld: 2 }));
    expect(sample).toEqual({ x: -200, y: 80, direct: true });
    expect(store.getSnapshot().panned).toBe(true);
    // 끌지 않는 다음 프레임에도 오프셋은 그대로이고, 카메라는 평소 추종으로 돌아온다.
    expect(runtime.sample(frame({ cssToWorld: 2 }))).toEqual({ x: -200, y: 80, direct: false });
  });

  it("추종 불감대 안에서 기준점과 어긋나 서 있던 카메라는 그 자리에서 끌기를 이어받는다(첫 프레임에 튀지 않는다)", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    // 카메라는 기준점에서 (-12, +7) 떨어진 곳에 서 있다. 오른쪽으로 10 끌면 중심은 그 자리에서 10 왼쪽으로 간다.
    store.drag(10, 0);
    const first = runtime.sample(frame({ center: { x: 1488, y: 907 } }));
    expect(first).toEqual({ x: -22, y: 7, direct: true });
    // 이어지는 끌기는 이미 이어받은 오프셋에 더해진다(다시 이어받지 않는다).
    store.drag(10, 0);
    expect(runtime.sample(frame({ center: { x: 1400, y: 800 } }))).toEqual({ x: -32, y: 7, direct: true });
  });

  it("끌기를 끝내고 돌아오면 카메라는 서 있던 자리가 아니라 기준점에 선다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.drag(10, 0);
    runtime.sample(frame({ center: { x: 1488, y: 907 } }));
    store.recenter();
    let last = runtime.sample(frame({ deltaSeconds: 0.1, center: { x: 1400, y: 900 } }));
    for (let index = 0; index < 120 && last.direct; index += 1) last = runtime.sample(frame({ deltaSeconds: 0.1 }));
    expect(last).toEqual({ x: 0, y: 0, direct: false });
  });

  it("카메라 중심을 알 수 없으면(NaN) 기준점에서 시작한다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.drag(10, 0);
    expect(runtime.sample(frame({ center: { x: Number.NaN, y: Number.NaN } }))).toEqual({ x: -10, y: 0, direct: true });
  });

  it("눈에 띄지 않는 작은 이동은 시점을 옮긴 것으로 치지 않는다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.drag(STUDIO_CAMERA_PANNED_THRESHOLD_PX - 2, 0);
    runtime.sample(frame());
    expect(store.getSnapshot().panned).toBe(false);
    store.drag(10, 0);
    runtime.sample(frame());
    expect(store.getSnapshot().panned).toBe(true);
  });

  it("월드 밖의 빈 띠를 비추지 않는 범위에서 멈추고, 더 끌어도 보이지 않는 값이 쌓이지 않는다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    // 중심은 [400, 2672] 안에서만 움직인다(화면 폭 800, 월드 폭 3072). 기준점 1500에서 왼쪽 끝까지 -1100.
    store.drag(100_000, 0);
    expect(runtime.sample(frame()).x).toBe(-1100);
    // 반대로 한 번 끌면 곧바로 돌아선다: 보이지 않는 초과분이 쌓여 있으면 한참 반응이 없다.
    store.drag(-300, 0);
    expect(runtime.sample(frame()).x).toBe(-800);
  });

  it("아바타가 월드 가장자리에 붙어 있어도 첫 끌기부터 바로 반응한다(범위 밖 기준점에서 죽은 구간이 없다)", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    // 카메라는 갈 수 있는 가장 왼쪽(중심 400)에 서 있고 기준점(아바타)은 그보다 더 왼쪽이다.
    const edge = frame({ base: { x: 100, y: 900 }, center: { x: 400, y: 900 } });
    expect(runtime.sample(edge)).toEqual({ x: 0, y: 0, direct: false });
    store.drag(-50, 0);
    // 중심 최소값 400에서 오른쪽으로 50 → 목표 450. 기준점 100과의 차이 350을 돌려준다.
    expect(runtime.sample(edge)).toEqual({ x: 350, y: 0, direct: true });
    store.drag(30, 0);
    expect(runtime.sample(edge).x).toBe(320);
    // 왼쪽 끝(중심 400)보다 더 갈 수 없어 오프셋은 0에서 멈춘다.
    store.drag(500, 0);
    expect(runtime.sample(edge)).toEqual({ x: 0, y: 0, direct: true });
  });

  it("화면이 월드보다 큰 축은 움직이지 않는다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.drag(200, 200);
    const sample = runtime.sample(frame({ view: { width: 800, height: 2000 } }));
    expect(sample.y).toBe(0);
    expect(sample.x).toBe(-200);
  });

  it("돌아오기를 요청하면 부드럽게 0으로 줄고 그동안은 카메라가 지체 없이 따르며, 끝나면 평소로 돌아간다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.drag(-300, 0);
    runtime.sample(frame());
    store.recenter();
    const first = runtime.sample(frame({ deltaSeconds: 0.1 }));
    expect(first.direct).toBe(true);
    expect(first.x).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(300);
    let last = first;
    for (let index = 0; index < 120 && last.direct; index += 1) last = runtime.sample(frame({ deltaSeconds: 0.1 }));
    expect(last).toEqual({ x: 0, y: 0, direct: false });
    expect(store.getSnapshot().panned).toBe(false);
  });

  it("모션 줄이기에서는 돌아오기가 전환 없이 한 프레임에 끝나고, 그 프레임에 카메라를 기준점에 바로 맞춘다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.drag(-300, 0);
    runtime.sample(frame({ reducedMotion: true }));
    store.recenter();
    // 오프셋이 0이 되는 이 프레임도 direct여야 한다. 아니면 카메라가 데드존 안에 남아 시점이 되돌아오지 않는다.
    expect(runtime.sample(frame({ reducedMotion: true }))).toEqual({ x: 0, y: 0, direct: true });
    expect(runtime.sample(frame({ reducedMotion: true }))).toEqual({ x: 0, y: 0, direct: false });
  });

  it("돌아오는 마지막 걸음(오프셋이 0에 닿는 프레임)도 direct라 카메라가 기준점에 정확히 선다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.drag(-300, 0);
    runtime.sample(frame());
    store.recenter();
    const steps: Array<{ x: number; direct: boolean }> = [];
    for (let index = 0; index < 400; index += 1) {
      const step = runtime.sample(frame({ deltaSeconds: 1 / 60 }));
      steps.push({ x: step.x, direct: step.direct });
      if (step.x === 0) break;
    }
    expect(steps.at(-1)).toEqual({ x: 0, direct: true });
    expect(steps.slice(0, -1).every((step) => step.direct && step.x > 0)).toBe(true);
    expect(runtime.sample(frame())).toEqual({ x: 0, y: 0, direct: false });
  });

  it("옮겨 둔 시점이 없으면 돌아오기 요청이나 디렉터 구간에서도 카메라를 직접 이끌지 않는다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.recenter();
    expect(runtime.sample(frame())).toEqual({ x: 0, y: 0, direct: false });
    expect(runtime.sample(frame({ directed: true }))).toEqual({ x: 0, y: 0, direct: false });
    expect(runtime.sample(frame({ moving: true }))).toEqual({ x: 0, y: 0, direct: false });
  });

  it("아바타가 걷기 시작하는 순간 자동으로 돌아오지만, 계속 걷는 동안 새로 끈 시점은 유지된다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.drag(-300, 0);
    runtime.sample(frame());
    const started = runtime.sample(frame({ moving: true, deltaSeconds: 0.1 }));
    expect(started.direct).toBe(true);
    for (let index = 0; index < 120; index += 1) runtime.sample(frame({ moving: true, deltaSeconds: 0.1 }));
    store.drag(-120, 0);
    const held = runtime.sample(frame({ moving: true }));
    expect(held.x).toBe(120);
    expect(runtime.sample(frame({ moving: true })).x).toBe(120);
  });

  it("방 전환·대화 연출 같은 디렉터 구간에서는 새 끌기를 받지 않고 오프셋을 돌려보낸다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.drag(-300, 0);
    runtime.sample(frame());
    store.drag(-100, 0);
    const directed = runtime.sample(frame({ directed: true, deltaSeconds: 0.1 }));
    expect(directed.x).toBeLessThan(300);
    for (let index = 0; index < 120; index += 1) runtime.sample(frame({ directed: true, deltaSeconds: 0.1 }));
    expect(runtime.sample(frame({ directed: true }))).toEqual({ x: 0, y: 0, direct: false });
  });

  it("순간 이동 프레임이나 둘러볼 수 없는 장소에서는 오프셋을 바로 비운다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.drag(-300, 0);
    runtime.sample(frame());
    expect(runtime.sample(frame({ snap: true }))).toEqual({ x: 0, y: 0, direct: false });
    store.drag(-300, 0);
    runtime.sample(frame());
    expect(runtime.sample(frame({ available: false }))).toEqual({ x: 0, y: 0, direct: false });
    expect(store.getSnapshot()).toEqual({ available: false, panned: false });
  });

  it("기준점이 아직 정해지지 않은 첫 프레임(NaN)에는 아무것도 하지 않는다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.drag(50, 50);
    expect(runtime.sample(frame({ base: { x: Number.NaN, y: Number.NaN } }))).toEqual({ x: 0, y: 0, direct: false });
    expect(runtime.sample(frame({ cssToWorld: 0 }))).toEqual({ x: 0, y: 0, direct: false });
  });
});

const disposers: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.innerHTML = "";
});

function pointerSetup(options: { can?: () => boolean } = {}) {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const capture = vi.fn();
  const release = vi.fn();
  Object.assign(canvas, { setPointerCapture: capture, releasePointerCapture: release });
  const store = { drag: vi.fn() };
  disposers.push(bindStudioCameraPan(canvas, store, options.can ?? (() => true), window));
  const pointer = (type: string, init: PointerEventInit) => {
    const event = new PointerEvent(type, { pointerId: 1, pointerType: "mouse", bubbles: true, cancelable: true, ...init });
    canvas.dispatchEvent(event);
    return event;
  };
  return { canvas, store, capture, release, pointer };
}

describe("마우스로 카메라 둘러보기", () => {
  it("오른쪽 버튼으로 끌면 움직인 만큼 저장소에 쌓고, 누르는 동작의 기본 처리를 취소해 클릭 이동이 시작되지 않게 한다", () => {
    const { canvas, store, capture, release, pointer } = pointerSetup();
    const down = pointer("pointerdown", { button: 2, clientX: 100, clientY: 100 });
    expect(down.defaultPrevented).toBe(true);
    expect(capture).toHaveBeenCalledWith(1);
    expect(canvas.getAttribute("data-camera-panning")).toBe("true");
    pointer("pointermove", { clientX: 130, clientY: 90 });
    pointer("pointermove", { clientX: 135, clientY: 95 });
    expect(store.drag.mock.calls).toEqual([[30, -10], [5, 5]]);
    pointer("pointerup", { button: 2, clientX: 135, clientY: 95 });
    expect(release).toHaveBeenCalledWith(1);
    expect(canvas.hasAttribute("data-camera-panning")).toBe(false);
    pointer("pointermove", { clientX: 200, clientY: 200 });
    expect(store.drag).toHaveBeenCalledTimes(2);
  });

  it("가운데 버튼도 같다", () => {
    const { store, pointer } = pointerSetup();
    expect(pointer("pointerdown", { button: 1, clientX: 0, clientY: 0 }).defaultPrevented).toBe(true);
    pointer("pointermove", { clientX: 4, clientY: 6 });
    expect(store.drag).toHaveBeenCalledWith(4, 6);
  });

  it("왼쪽 버튼만 누르면 끌기가 아니다(클릭 이동이 그대로 쓴다)", () => {
    const { store, pointer, canvas } = pointerSetup();
    const down = pointer("pointerdown", { button: 0, clientX: 10, clientY: 10 });
    expect(down.defaultPrevented).toBe(false);
    pointer("pointermove", { clientX: 80, clientY: 80 });
    expect(store.drag).not.toHaveBeenCalled();
    expect(canvas.hasAttribute("data-camera-panning")).toBe(false);
  });

  it("Space를 누른 채 왼쪽 버튼으로 끌 수 있고, Space를 떼면 다시 클릭 이동이다", () => {
    const { canvas, store, pointer } = pointerSetup();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    expect(canvas.getAttribute("data-camera-pan-ready")).toBe("true");
    expect(pointer("pointerdown", { button: 0, clientX: 50, clientY: 50 }).defaultPrevented).toBe(true);
    pointer("pointermove", { clientX: 60, clientY: 50 });
    expect(store.drag).toHaveBeenCalledWith(10, 0);
    pointer("pointerup", { button: 0, clientX: 60, clientY: 50 });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
    expect(canvas.hasAttribute("data-camera-pan-ready")).toBe(false);
    expect(pointer("pointerdown", { button: 0, clientX: 0, clientY: 0 }).defaultPrevented).toBe(false);
  });

  it("창이 초점을 잃으면 Space 상태와 끌던 동작을 놓는다", () => {
    const { canvas, store, pointer } = pointerSetup();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    pointer("pointerdown", { button: 0, clientX: 0, clientY: 0 });
    window.dispatchEvent(new Event("blur"));
    expect(canvas.hasAttribute("data-camera-panning")).toBe(false);
    expect(canvas.hasAttribute("data-camera-pan-ready")).toBe(false);
    pointer("pointermove", { clientX: 40, clientY: 40 });
    expect(store.drag).not.toHaveBeenCalled();
  });

  it("터치 포인터는 이 경로가 받지 않고(두 손가락 끌기가 맡는다), 둘러볼 수 없는 때도 받지 않는다", () => {
    const touch = pointerSetup();
    expect(touch.pointer("pointerdown", { button: 2, pointerType: "touch", clientX: 0, clientY: 0 }).defaultPrevented).toBe(false);
    let allowed = false;
    const blocked = pointerSetup({ can: () => allowed });
    expect(blocked.pointer("pointerdown", { button: 2, clientX: 0, clientY: 0 }).defaultPrevented).toBe(false);
    allowed = true;
    expect(blocked.pointer("pointerdown", { button: 2, clientX: 0, clientY: 0 }).defaultPrevented).toBe(true);
  });

  it("끄는 도중 다른 포인터는 끌기를 가로채지 못한다", () => {
    const { store, pointer } = pointerSetup();
    pointer("pointerdown", { button: 2, pointerId: 1, clientX: 0, clientY: 0 });
    expect(pointer("pointerdown", { button: 2, pointerId: 2, clientX: 5, clientY: 5 }).defaultPrevented).toBe(false);
    pointer("pointermove", { pointerId: 2, clientX: 90, clientY: 90 });
    expect(store.drag).not.toHaveBeenCalled();
  });

  it("오른쪽 버튼 메뉴는 둘러볼 수 있는 때만 막는다", () => {
    let allowed = true;
    const { canvas } = pointerSetup({ can: () => allowed });
    const open = new Event("contextmenu", { cancelable: true, bubbles: true });
    canvas.dispatchEvent(open);
    expect(open.defaultPrevented).toBe(true);
    allowed = false;
    const closed = new Event("contextmenu", { cancelable: true, bubbles: true });
    canvas.dispatchEvent(closed);
    expect(closed.defaultPrevented).toBe(false);
  });

  it("해제하면 이후 입력을 받지 않고 표시 속성도 지운다", () => {
    const { canvas, store, pointer } = pointerSetup();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    for (const dispose of disposers.splice(0)) dispose();
    expect(canvas.hasAttribute("data-camera-pan-ready")).toBe(false);
    expect(pointer("pointerdown", { button: 2, clientX: 0, clientY: 0 }).defaultPrevented).toBe(false);
    pointer("pointermove", { clientX: 30, clientY: 30 });
    expect(store.drag).not.toHaveBeenCalled();
  });
});

const memory = (): StudioUserZoomStorage => {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
};

describe("시점 제스처 묶음(줌 + 두 손가락 끌기 + 마우스 둘러보기)", () => {
  function gestureSetup(canPan = () => true) {
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const zoom = new StudioUserZoomStore(memory());
    const pan = { drag: vi.fn(), setLook: vi.fn() };
    const onPinchStart = vi.fn();
    disposers.push(bindStudioCameraGestures(canvas, { zoom, pan, canZoom: () => true, canPan, focused: () => true, onPinchStart }));
    const touch = (type: string, id: number, x: number, y = 0) =>
      canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, bubbles: true, cancelable: true }));
    return { canvas, zoom, pan, onPinchStart, touch };
  }

  it("두 손가락을 함께 움직이면 줌을 건드리지 않고 중심 이동량만큼 끌린다", () => {
    const { zoom, pan, onPinchStart, touch } = gestureSetup();
    touch("pointerdown", 1, 0);
    touch("pointerdown", 2, 100);
    expect(onPinchStart).toHaveBeenCalledOnce();
    touch("pointermove", 1, 40);
    touch("pointermove", 2, 140);
    expect(zoom.get()).toBe(1);
    expect(pan.drag.mock.calls).toEqual([[20, 0], [20, 0]]);
  });

  it("벌리면서 옮기면 줌과 끌기가 동시에 일어난다", () => {
    const { zoom, pan, touch } = gestureSetup();
    touch("pointerdown", 1, 0);
    touch("pointerdown", 2, 100);
    touch("pointermove", 2, 200);
    expect(zoom.get()).toBeCloseTo(2, 3);
    expect(pan.drag).toHaveBeenCalledWith(50, 0);
  });

  it("둘러볼 수 없는 때는 두 손가락 끌기를 저장소에 보내지 않는다(줌은 그대로)", () => {
    const { zoom, pan, touch } = gestureSetup(() => false);
    touch("pointerdown", 1, 0);
    touch("pointerdown", 2, 100);
    touch("pointermove", 2, 150);
    expect(zoom.get()).toBeCloseTo(1.5, 3);
    expect(pan.drag).not.toHaveBeenCalled();
  });

  it("손가락 하나로는 끌리지 않고, 마우스 오른쪽 끌기는 같은 묶음에서 동작한다", () => {
    const { canvas, pan, touch } = gestureSetup();
    touch("pointerdown", 1, 0);
    touch("pointermove", 1, 80);
    expect(pan.drag).not.toHaveBeenCalled();
    touch("pointerup", 1, 80);
    canvas.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 9, pointerType: "mouse", button: 2, clientX: 10, clientY: 10, bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new PointerEvent("pointermove", { pointerId: 9, pointerType: "mouse", clientX: 25, clientY: 10, bubbles: true }));
    expect(pan.drag).toHaveBeenCalledWith(15, 0);
  });
});
