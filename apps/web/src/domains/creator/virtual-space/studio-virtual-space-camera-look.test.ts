// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioCameraPanRuntime,
  StudioCameraPanStore,
  bindStudioCameraGestures,
  bindStudioCameraLook,
  type StudioCameraPanFrame,
} from "./studio-virtual-space-camera-pan";
import { StudioUserZoomStore, type StudioUserZoomStorage } from "./studio-virtual-space-user-zoom";

/** 키보드 둘러보기 속도(CSS px/초). 구현의 LOOK_SPEED_CSS와 같은 값을 시험에서 고정한다. */
const SPEED = 520;
const FRAME = 1 / 60;

function frame(overrides: Partial<StudioCameraPanFrame> = {}): StudioCameraPanFrame {
  return {
    deltaSeconds: FRAME, available: true, directed: false, snap: false, reducedMotion: false, moving: false,
    cssToWorld: 1, base: { x: 1500, y: 900 }, center: { x: 1500, y: 900 }, view: { width: 800, height: 500 }, world: { width: 3072, height: 1920 },
    ...overrides,
  };
}

function run(runtime: StudioCameraPanRuntime, frames: number, overrides: Partial<StudioCameraPanFrame> = {}) {
  let sample = runtime.sample(frame(overrides));
  for (let index = 1; index < frames; index += 1) sample = runtime.sample(frame(overrides));
  return sample;
}

describe("카메라 둘러보기 저장소의 키보드 상태", () => {
  it("처음에는 둘러보는 중이 아니고 방향도 없다", () => {
    const store = new StudioCameraPanStore();
    expect(store.isLooking()).toBe(false);
    expect(store.lookDirection()).toBeNull();
  });

  it("누른 방향은 부호만 쓰고, Space를 놓으면 방향도 비운다", () => {
    const store = new StudioCameraPanStore();
    store.setLook(true, 3, -2);
    expect(store.isLooking()).toBe(true);
    expect(store.lookDirection()).toEqual({ x: 1, y: -1 });
    store.setLook(true, 0, 0);
    expect(store.isLooking()).toBe(true);
    expect(store.lookDirection()).toBeNull();
    store.setLook(true, 1, 0);
    store.setLook(false, 1, 0);
    expect(store.isLooking()).toBe(false);
    expect(store.lookDirection()).toBeNull();
    // 유한하지 않은 값은 누르지 않은 것으로 본다.
    store.setLook(true, Number.NaN, Number.POSITIVE_INFINITY);
    expect(store.lookDirection()).toBeNull();
    store.setLook(true, Number.NaN, 4);
    expect(store.lookDirection()).toEqual({ x: 0, y: 1 });
  });

  it("방향을 누르면 이미 요청한 돌아오기를 취소하지만, 방향 없이 Space만 누른 것은 취소하지 않는다", () => {
    const store = new StudioCameraPanStore();
    store.recenter();
    store.setLook(true, 0, 0);
    expect(store.consumeRecenter()).toBe(true);
    store.recenter();
    store.setLook(true, 1, 0);
    expect(store.consumeRecenter()).toBe(false);
  });

  it("키를 누르고 떼는 것만으로 화면(HUD)을 다시 그리게 하지 않는다", () => {
    const store = new StudioCameraPanStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setLook(true, 1, 0);
    store.setLook(false, 0, 0);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("카메라 둘러보기 런타임의 키보드 이동", () => {
  it("누른 방향으로 일정한 속도로 흐르고, 그동안 카메라는 목표에 바로 맞춘다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.setLook(true, 1, 0);
    const first = runtime.sample(frame());
    expect(first.x).toBeCloseTo(SPEED * FRAME, 6);
    expect(first.y).toBe(0);
    expect(first.direct).toBe(true);
    const after = run(runtime, 29);
    expect(after.x).toBeCloseTo(SPEED * 0.5, 3);
    expect(after.direct).toBe(true);
    expect(store.getSnapshot().panned).toBe(true);
  });

  it("월드 거리는 화면 배율로 환산한다(확대하면 같은 키 입력이 월드에서 더 짧다)", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.setLook(true, 0, 1);
    expect(run(runtime, 30, { cssToWorld: 0.5 }).y).toBeCloseTo(SPEED * 0.5 * 0.5, 3);
  });

  it("대각선도 같은 속도다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.setLook(true, 1, -1);
    const sample = run(runtime, 60);
    expect(sample.x).toBeGreaterThan(0);
    expect(sample.y).toBeLessThan(0);
    expect(Math.hypot(sample.x, sample.y)).toBeCloseTo(SPEED, 3);
  });

  it("키를 놓으면 그 자리에 멈추고, 카메라는 평소 추종으로 돌아간다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.setLook(true, 1, 0);
    run(runtime, 30);
    store.setLook(true, 0, 0);
    const stopped = runtime.sample(frame());
    expect(stopped.x).toBeCloseTo(SPEED * 0.5, 3);
    expect(stopped.direct).toBe(false);
    expect(runtime.sample(frame()).x).toBeCloseTo(stopped.x, 9);
  });

  it("월드 밖의 빈 띠를 비추지 않는 곳에서 멈춘다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.setLook(true, 1, 0);
    // 카메라 중심은 world.width - view.width/2 = 2672까지만 간다(기준점 1500 → 1172).
    expect(run(runtime, 600).x).toBeCloseTo(1172, 6);
    store.setLook(true, -1, 0);
    expect(run(runtime, 1200).x).toBeCloseTo(-1100, 6);
  });

  it("추종 불감대 안에서 기준점과 어긋나 서 있던 카메라는 그 자리에서 이어받는다(첫 프레임에 튀지 않는다)", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.setLook(true, 1, 0);
    const first = runtime.sample(frame({ center: { x: 1488, y: 907 } }));
    expect(first.x).toBeCloseTo(-12 + SPEED * FRAME, 6);
    expect(first.y).toBeCloseTo(7, 6);
  });

  it("프레임이 느린 기기(10fps)에서도 실제 시간에 맞는 속도로 흐르고, 아주 긴 프레임에도 한 번에 0.25초어치만 움직인다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.setLook(true, 1, 0);
    expect(run(runtime, 10, { deltaSeconds: 0.1 }).x).toBeCloseTo(SPEED, 6);
    expect(runtime.sample(frame({ deltaSeconds: 5 })).x).toBeCloseTo(SPEED + SPEED * 0.25, 6);
    expect(runtime.sample(frame({ deltaSeconds: Number.NaN })).x).toBeCloseTo(SPEED + SPEED * 0.25, 6);
  });

  it("끌기와 같은 프레임에 겹쳐도 더해진다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.drag(-30, 0);
    store.setLook(true, 1, 0);
    expect(runtime.sample(frame()).x).toBeCloseTo(30 + SPEED * FRAME, 6);
  });

  it("방 전환·대화 연출 같은 디렉터 구간과 둘러볼 수 없는 장소에서는 받지 않는다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.setLook(true, 1, 0);
    expect(runtime.sample(frame({ directed: true }))).toEqual({ x: 0, y: 0, direct: false });
    expect(runtime.sample(frame({ available: false }))).toEqual({ x: 0, y: 0, direct: false });
    expect(runtime.sample(frame({ snap: true }))).toEqual({ x: 0, y: 0, direct: false });
  });

  it("옮겨 둔 시점은 돌아오기 요청으로 되돌리고, 방향키를 누른 채라면 되돌리지 않는다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    store.setLook(true, 1, 0);
    run(runtime, 30);
    store.setLook(true, 0, 0);
    store.recenter();
    expect(run(runtime, 120).x).toBe(0);
    expect(store.getSnapshot().panned).toBe(false);

    store.setLook(true, 1, 0);
    run(runtime, 30);
    store.recenter();
    store.setLook(true, 1, 0);
    expect(run(runtime, 30).x).toBeGreaterThan(SPEED * 0.5);
  });
});

const disposers: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.innerHTML = "";
});

function lookSetup(options: { can?: () => boolean } = {}) {
  const store = { setLook: vi.fn<(held: boolean, x: number, y: number) => void>() };
  disposers.push(bindStudioCameraLook(store, options.can ?? (() => true), window));
  const key = (type: "keydown" | "keyup", code: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
    const event = new KeyboardEvent(type, { code, key: code === "Space" ? " " : code, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };
  const last = () => store.setLook.mock.calls.at(-1);
  return { store, key, last };
}

describe("키보드로 카메라 둘러보기 연결", () => {
  it("Space를 누른 채 방향키를 누르는 동안 그 방향을 알리고, 누르는 키의 기본 동작(스크롤)을 막는다", () => {
    const { key, last } = lookSetup();
    expect(key("keydown", "Space").defaultPrevented).toBe(true);
    expect(last()).toEqual([true, 0, 0]);
    expect(key("keydown", "ArrowRight").defaultPrevented).toBe(true);
    expect(last()).toEqual([true, 1, 0]);
    key("keydown", "ArrowUp");
    expect(last()).toEqual([true, 1, -1]);
    key("keyup", "ArrowRight");
    expect(last()).toEqual([true, 0, -1]);
    key("keyup", "Space");
    expect(last()).toEqual([false, 0, 0]);
  });

  it("방향키를 먼저 누르고 Space를 나중에 눌러도 같다(Space 없이는 걷기 키라 가로채지 않는다)", () => {
    const { key, last } = lookSetup();
    expect(key("keydown", "ArrowLeft").defaultPrevented).toBe(false);
    expect(last()).toEqual([false, 0, 0]);
    key("keydown", "Space");
    expect(last()).toEqual([true, -1, 0]);
  });

  it("WASD도 같고, 반대 방향을 함께 누르면 서로 지운다", () => {
    const { key, last } = lookSetup();
    key("keydown", "Space");
    key("keydown", "KeyD");
    expect(last()).toEqual([true, 1, 0]);
    key("keydown", "KeyA");
    expect(last()).toEqual([true, 0, 0]);
    key("keyup", "KeyD");
    expect(last()).toEqual([true, -1, 0]);
    key("keydown", "KeyS");
    expect(last()).toEqual([true, -1, 1]);
    key("keydown", "KeyW");
    expect(last()).toEqual([true, -1, 0]);
  });

  it("자동 반복은 상태를 다시 알리지 않지만, 스페이스의 기본 동작은 계속 막는다", () => {
    const { store, key } = lookSetup();
    key("keydown", "Space");
    expect(key("keydown", "Space", { repeat: true }).defaultPrevented).toBe(true);
    key("keydown", "ArrowDown");
    key("keydown", "ArrowDown", { repeat: true });
    expect(store.setLook).toHaveBeenCalledTimes(2);
  });

  it("월드에 초점이 없으면 Space도 방향키도 받지 않고 기본 동작도 막지 않는다", () => {
    const { store, key } = lookSetup({ can: () => false });
    expect(key("keydown", "Space").defaultPrevented).toBe(false);
    expect(key("keydown", "ArrowRight").defaultPrevented).toBe(false);
    expect(store.setLook).not.toHaveBeenCalled();
  });

  it("입력 칸에서 누른 스페이스·방향키는 받지 않는다(채팅에 띄어쓰기를 칠 수 있다)", () => {
    const { store, key } = lookSetup();
    const input = document.createElement("input");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.append(input, editable);
    for (const target of [input, editable]) {
      expect(key("keydown", "Space", {}, target).defaultPrevented).toBe(false);
      expect(key("keydown", "ArrowLeft", {}, target).defaultPrevented).toBe(false);
    }
    expect(store.setLook).not.toHaveBeenCalled();
  });

  it("보조키 조합과 한글 조합 중에는 받지 않는다", () => {
    const { store, key } = lookSetup();
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) {
      expect(key("keydown", "Space", init).defaultPrevented).toBe(false);
    }
    expect(store.setLook).not.toHaveBeenCalled();
  });

  it("창이 초점을 잃으면 눌린 키를 모두 놓고, 그 뒤 늦게 온 keyup은 아무 일도 일으키지 않는다", () => {
    const { store, key, last } = lookSetup();
    key("keydown", "Space");
    key("keydown", "ArrowDown");
    window.dispatchEvent(new Event("blur"));
    expect(last()).toEqual([false, 0, 0]);
    const calls = store.setLook.mock.calls.length;
    key("keyup", "ArrowDown");
    expect(store.setLook.mock.calls).toHaveLength(calls);
  });

  it("해제하면 눌린 상태를 놓고 이후 입력을 받지 않는다", () => {
    const store = { setLook: vi.fn<(held: boolean, x: number, y: number) => void>() };
    const dispose = bindStudioCameraLook(store, () => true, window);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", cancelable: true }));
    dispose();
    expect(store.setLook.mock.calls.at(-1)).toEqual([false, 0, 0]);
    store.setLook.mockClear();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", cancelable: true }));
    expect(store.setLook).not.toHaveBeenCalled();
  });
});

describe("시점 제스처 묶음의 키보드 둘러보기", () => {
  const memory = (): StudioUserZoomStorage => {
    const data = new Map<string, string>();
    return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
  };

  it("둘러볼 수 있고 월드에 초점이 있을 때만 받는다", () => {
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const pan = { drag: vi.fn(), setLook: vi.fn() };
    let canPan = true;
    let focused = false;
    disposers.push(bindStudioCameraGestures(canvas, {
      zoom: new StudioUserZoomStore(memory()), pan, canZoom: () => true, canPan: () => canPan, focused: () => focused,
    }));
    const press = (type: "keydown" | "keyup", code: string) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, cancelable: true }));
    press("keydown", "Space");
    expect(pan.setLook).not.toHaveBeenCalled();
    press("keyup", "Space");
    focused = true;
    press("keydown", "Space");
    expect(pan.setLook).toHaveBeenLastCalledWith(true, 0, 0);
    press("keydown", "ArrowRight");
    expect(pan.setLook).toHaveBeenLastCalledWith(true, 1, 0);
    press("keyup", "Space");
    canPan = false;
    pan.setLook.mockClear();
    press("keydown", "Space");
    expect(pan.setLook).not.toHaveBeenCalled();
  });
});
