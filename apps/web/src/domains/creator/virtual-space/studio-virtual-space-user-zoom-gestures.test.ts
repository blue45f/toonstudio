// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_PINCH_MIN_START_DISTANCE_PX,
  STUDIO_USER_ZOOM_MAX,
  STUDIO_USER_ZOOM_MIN,
  StudioUserZoomStore,
  bindStudioUserZoomGestures,
  bindStudioUserZoomPinch,
  studioUserZoomFromPinch,
  type StudioUserZoomStorage,
} from "./studio-virtual-space-user-zoom";

const memory = (): StudioUserZoomStorage => {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
};

const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); });

function setup(options: { level?: number; can?: () => boolean } = {}) {
  const target = document.createElement("div");
  const store = new StudioUserZoomStore(memory());
  if (options.level !== undefined) store.set(options.level);
  const onStart = vi.fn();
  disposers.push(bindStudioUserZoomPinch(target, store, options.can ?? (() => true), onStart));
  const fire = (type: string, id: number, x: number, y = 0, pointerType = "touch") => {
    const event = new PointerEvent(type, { pointerId: id, pointerType, clientX: x, clientY: y, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };
  return { target, store, onStart, fire };
}

describe("핀치 배율 계산", () => {
  it("시작 거리 대비 지금 거리의 비율을 시작 배율에 곱한다", () => {
    expect(studioUserZoomFromPinch(1, 100, 150)).toBeCloseTo(1.5, 6);
    expect(studioUserZoomFromPinch(1.15, 100, 80)).toBeCloseTo(0.92, 6);
    expect(studioUserZoomFromPinch(1, 100, 100)).toBe(1);
  });

  it("허용 범위를 넘으면 끝 배율에서 멈춘다", () => {
    expect(studioUserZoomFromPinch(1, 100, 1000)).toBe(STUDIO_USER_ZOOM_MAX);
    expect(studioUserZoomFromPinch(1, 100, 1)).toBe(STUDIO_USER_ZOOM_MIN);
  });

  it("기준 거리나 지금 거리가 비정상이면 시작 배율을 그대로 둔다", () => {
    for (const [start, now] of [[0, 100], [-5, 100], [Number.NaN, 100], [100, Number.NaN], [100, -1], [100, Number.POSITIVE_INFINITY]] as const) {
      expect(studioUserZoomFromPinch(1.3, start, now), `${start}→${now}`).toBe(1.3);
    }
  });
});

describe("터치 두 손가락 핀치 줌", () => {
  it("두 손가락을 벌리면 그만큼 확대하고, 모으면 축소한다", () => {
    const { store, fire, onStart } = setup();
    fire("pointerdown", 1, 100);
    expect(onStart).not.toHaveBeenCalled();
    fire("pointerdown", 2, 200);
    expect(onStart).toHaveBeenCalledOnce();
    fire("pointermove", 2, 250);
    expect(store.get()).toBeCloseTo(1.5, 3);
    fire("pointermove", 2, 180);
    expect(store.get()).toBeCloseTo(0.8, 3);
  });

  it("손가락을 얼마나 천천히 움직였든 같은 거리 변화는 같은 배율이다(이전 배율이 아니라 시작 배율이 기준)", () => {
    const { store, fire } = setup({ level: 1.15 });
    fire("pointerdown", 1, 0);
    fire("pointerdown", 2, 100);
    for (let x = 101; x <= 150; x += 1) fire("pointermove", 2, x);
    expect(store.get()).toBeCloseTo(1.15 * 1.5, 3);
  });

  it("끝 배율을 넘겨 벌려도 최대, 최소 아래로 모아도 최소에서 멈춘다", () => {
    const { store, fire } = setup();
    fire("pointerdown", 1, 0);
    fire("pointerdown", 2, 100);
    fire("pointermove", 2, 900);
    expect(store.get()).toBe(STUDIO_USER_ZOOM_MAX);
    fire("pointermove", 2, 5);
    expect(store.get()).toBe(STUDIO_USER_ZOOM_MIN);
  });

  it("핀치 중의 움직임은 브라우저 기본 동작을 막고, 한 손가락의 움직임은 건드리지 않는다", () => {
    const { fire } = setup();
    fire("pointerdown", 1, 0);
    expect(fire("pointermove", 1, 40).defaultPrevented).toBe(false);
    fire("pointerdown", 2, 100);
    expect(fire("pointermove", 2, 140).defaultPrevented).toBe(true);
  });

  it("마우스·펜 포인터는 핀치로 세지 않는다", () => {
    const { store, fire, onStart } = setup();
    fire("pointerdown", 1, 0, 0, "mouse");
    fire("pointerdown", 2, 100, 0, "pen");
    fire("pointermove", 2, 300, 0, "pen");
    expect(onStart).not.toHaveBeenCalled();
    expect(store.get()).toBe(1);
  });

  it("줌을 받지 못하는 때(고정 프레임·장면 준비 전)에는 시작하지 않는다", () => {
    let allowed = false;
    const { store, fire, onStart } = setup({ can: () => allowed });
    fire("pointerdown", 1, 0);
    fire("pointerdown", 2, 100);
    fire("pointermove", 2, 300);
    expect(onStart).not.toHaveBeenCalled();
    expect(store.get()).toBe(1);
    allowed = true;
    fire("pointermove", 2, 300);
    expect(store.get(), "이미 시작이 거부된 손동작은 도중에 켜져도 이어받지 않는다").toBe(1);
  });

  it("손가락 하나를 떼면 핀치가 끝나고, 남은 손가락의 움직임은 배율을 바꾸지 않는다", () => {
    const { store, fire } = setup();
    fire("pointerdown", 1, 0);
    fire("pointerdown", 2, 100);
    fire("pointermove", 2, 150);
    const zoomed = store.get();
    fire("pointerup", 2, 150);
    fire("pointermove", 1, 400);
    expect(store.get()).toBe(zoomed);
  });

  it("셋째 손가락이 닿으면 멈추고, 다시 둘이 되면 그 거리를 새 기준으로 삼아 배율이 튀지 않는다", () => {
    const { store, fire, onStart } = setup();
    fire("pointerdown", 1, 0);
    fire("pointerdown", 2, 100);
    fire("pointermove", 2, 150);
    const zoomed = store.get();
    fire("pointerdown", 3, 300);
    fire("pointermove", 2, 500);
    expect(store.get(), "손가락이 셋이면 배율은 그대로").toBe(zoomed);
    fire("pointerup", 3, 300);
    expect(onStart).toHaveBeenCalledTimes(2);
    expect(store.get(), "다시 둘이 된 순간에는 배율이 바뀌지 않는다").toBe(zoomed);
    fire("pointermove", 2, 500 + 400);
    expect(store.get()).toBeGreaterThan(zoomed);
  });

  it("같은 점에 닿은 두 손가락(거리 너무 가까움)은 핀치를 시작하지 않는다", () => {
    const { store, fire, onStart } = setup();
    fire("pointerdown", 1, 100);
    fire("pointerdown", 2, 100 + STUDIO_PINCH_MIN_START_DISTANCE_PX - 1);
    fire("pointermove", 2, 400);
    expect(onStart).not.toHaveBeenCalled();
    expect(store.get()).toBe(1);
  });

  it("pointercancel로 손가락이 사라져도 핀치가 풀린다", () => {
    const { store, fire } = setup();
    fire("pointerdown", 1, 0);
    fire("pointerdown", 2, 100);
    fire("pointercancel", 2, 100);
    fire("pointermove", 1, 500);
    expect(store.get()).toBe(1);
  });

  it("대각선 거리도 두 점 사이 실제 거리로 잰다", () => {
    const { store, fire } = setup();
    fire("pointerdown", 1, 0, 0);
    fire("pointerdown", 2, 30, 40);
    fire("pointermove", 2, 60, 80);
    expect(store.get()).toBeCloseTo(2, 3);
  });

  it("해제하면 이후 이벤트를 받지 않는다", () => {
    const { target, store, fire, onStart } = setup();
    const extra = bindStudioUserZoomPinch(target, store, () => true, onStart);
    extra();
    fire("pointerdown", 1, 0);
    fire("pointerdown", 2, 100);
    expect(onStart, "해제한 바인딩은 부르지 않고 남은 바인딩만 한 번 부른다").toHaveBeenCalledOnce();
  });
});

describe("휠과 핀치를 함께 연결하는 묶음", () => {
  function gestures(can = () => true) {
    const target = document.createElement("div");
    const store = new StudioUserZoomStore(memory());
    const onStart = vi.fn();
    const release = bindStudioUserZoomGestures(target, store, can, onStart);
    disposers.push(release);
    const touch = (type: string, id: number, x: number) => target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, bubbles: true, cancelable: true }));
    const wheel = (deltaY: number) => {
      const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    };
    return { store, onStart, release, touch, wheel };
  }

  it("휠 한 칸은 배율을 올리고 두 손가락 핀치도 같은 저장소의 배율을 바꾼다", () => {
    const { store, onStart, touch, wheel } = gestures();
    expect(wheel(-100).defaultPrevented).toBe(true);
    const afterWheel = store.get();
    expect(afterWheel).toBeGreaterThan(1);
    touch("pointerdown", 1, 0);
    touch("pointerdown", 2, 100);
    expect(onStart).toHaveBeenCalledOnce();
    touch("pointermove", 2, 150);
    expect(store.get()).toBeCloseTo(afterWheel * 1.5, 3);
  });

  it("줌을 받지 못하는 때에는 휠도 핀치도 받지 않고 휠의 기본 동작도 막지 않는다", () => {
    const { store, onStart, touch, wheel } = gestures(() => false);
    expect(wheel(-100).defaultPrevented).toBe(false);
    touch("pointerdown", 1, 0);
    touch("pointerdown", 2, 100);
    touch("pointermove", 2, 300);
    expect(onStart).not.toHaveBeenCalled();
    expect(store.get()).toBe(1);
  });

  it("해제하면 휠도 핀치도 더는 받지 않는다", () => {
    const { store, release, touch, wheel } = gestures();
    release();
    wheel(-100);
    touch("pointerdown", 1, 0);
    touch("pointerdown", 2, 100);
    touch("pointermove", 2, 300);
    expect(store.get()).toBe(1);
  });
});

describe("두 손가락 중심 이동(onPinchPan)", () => {
  function panSetup(can = () => true) {
    const target = document.createElement("div");
    const store = new StudioUserZoomStore(memory());
    const onPan = vi.fn();
    disposers.push(bindStudioUserZoomPinch(target, store, can, undefined, onPan));
    const fire = (type: string, id: number, x: number, y = 0) =>
      target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, bubbles: true, cancelable: true }));
    return { store, onPan, fire };
  }

  it("두 손가락이 닿은 뒤 중심이 움직인 만큼만 알린다(닿는 순간에는 알리지 않는다)", () => {
    const { onPan, fire } = panSetup();
    fire("pointerdown", 1, 0, 0);
    fire("pointerdown", 2, 100, 0);
    expect(onPan).not.toHaveBeenCalled();
    fire("pointermove", 1, 40, 20);
    fire("pointermove", 2, 140, 20);
    expect(onPan.mock.calls).toEqual([[20, 10], [20, 10]]);
  });

  it("서로 반대로 벌어지는 순수 핀치는 줌만 바꾸고 중심 이동의 합은 0이다", () => {
    const { store, onPan, fire } = panSetup();
    fire("pointerdown", 1, 40, 0);
    fire("pointerdown", 2, 60, 0);
    fire("pointermove", 1, 0, 0);
    fire("pointermove", 2, 100, 0);
    expect(store.get()).toBeGreaterThan(1);
    // 손가락이 하나씩 움직이는 이벤트라 중간에는 ±20이지만, 둘 다 움직이고 나면 중심은 제자리다.
    expect(onPan.mock.calls).toEqual([[-20, 0], [20, 0]]);
  });

  it("손가락 하나이거나 셋이면 알리지 않고, 다시 둘이 되면 새 중심에서 이어간다", () => {
    const { onPan, fire } = panSetup();
    fire("pointerdown", 1, 0);
    fire("pointermove", 1, 30);
    expect(onPan).not.toHaveBeenCalled();
    fire("pointerdown", 2, 100);
    fire("pointerdown", 3, 200);
    fire("pointermove", 3, 260);
    expect(onPan).not.toHaveBeenCalled();
    fire("pointerup", 3, 260);
    fire("pointermove", 2, 120);
    expect(onPan.mock.calls).toEqual([[10, 0]]);
  });

  it("핀치를 받을 수 없는 때(줌 불가 장소)에는 알리지 않는다", () => {
    const { onPan, fire } = panSetup(() => false);
    fire("pointerdown", 1, 0);
    fire("pointerdown", 2, 100);
    fire("pointermove", 2, 200);
    expect(onPan).not.toHaveBeenCalled();
  });
});
