import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_USER_ZOOM_DEFAULT,
  STUDIO_USER_ZOOM_MAX,
  STUDIO_USER_ZOOM_MIN,
  STUDIO_USER_ZOOM_STEPS,
  STUDIO_USER_ZOOM_STORAGE_KEY,
  StudioUserZoomRuntime,
  StudioUserZoomStore,
  bindStudioUserZoomWheel,
  readStudioUserZoom,
  studioUserZoomApply,
  studioUserZoomClamp,
  studioUserZoomEase,
  studioUserZoomFloor,
  studioUserZoomFromWheel,
  studioUserZoomStep,
  type StudioUserZoomStorage,
} from "./studio-virtual-space-user-zoom";

function memoryStorage(initial: Record<string, string> = {}): StudioUserZoomStorage & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}

describe("사용자 줌 단계와 범위", () => {
  it("단계는 오름차순이고 기본 배율(1)을 포함하며 양 끝이 범위와 같다", () => {
    expect([...STUDIO_USER_ZOOM_STEPS].sort((a, b) => a - b)).toEqual([...STUDIO_USER_ZOOM_STEPS]);
    expect(STUDIO_USER_ZOOM_STEPS).toContain(STUDIO_USER_ZOOM_DEFAULT);
    expect(STUDIO_USER_ZOOM_STEPS[0]).toBe(STUDIO_USER_ZOOM_MIN);
    expect(STUDIO_USER_ZOOM_STEPS.at(-1)).toBe(STUDIO_USER_ZOOM_MAX);
  });

  it("범위를 벗어나거나 숫자가 아닌 값은 범위 안(또는 기본값)으로 맞춘다", () => {
    expect(studioUserZoomClamp(10)).toBe(STUDIO_USER_ZOOM_MAX);
    expect(studioUserZoomClamp(0.01)).toBe(STUDIO_USER_ZOOM_MIN);
    expect(studioUserZoomClamp(Number.NaN)).toBe(STUDIO_USER_ZOOM_DEFAULT);
    expect(studioUserZoomClamp(Number.POSITIVE_INFINITY)).toBe(STUDIO_USER_ZOOM_DEFAULT);
    expect(studioUserZoomClamp(1.2)).toBe(1.2);
  });

  it("하한(floor)은 아래쪽만 올리고 1을 넘지 못한다(확대를 강요하지 않는다)", () => {
    expect(studioUserZoomClamp(0.6, 0.8)).toBe(0.8);
    expect(studioUserZoomClamp(0.9, 0.8)).toBe(0.9);
    expect(studioUserZoomClamp(0.5, 3)).toBe(1);
    expect(studioUserZoomClamp(0.5, Number.NaN)).toBe(STUDIO_USER_ZOOM_MIN);
  });

  it("확대·축소는 다음 단계로 가고, 단계 사이에서는 가장 가까운 다음 단계로 간다", () => {
    expect(studioUserZoomStep(1, 1)).toBe(1.15);
    expect(studioUserZoomStep(1, -1)).toBe(0.9);
    expect(studioUserZoomStep(1.2, 1)).toBe(1.3);
    expect(studioUserZoomStep(1.2, -1)).toBe(1.15);
    expect(studioUserZoomStep(STUDIO_USER_ZOOM_MAX, 1)).toBe(STUDIO_USER_ZOOM_MAX);
    expect(studioUserZoomStep(STUDIO_USER_ZOOM_MIN, -1)).toBe(STUDIO_USER_ZOOM_MIN);
  });

  it("끝 단계에서 계속 누르면 가장자리에서 멈추고, 모든 단계를 지나 되돌아온다", () => {
    let level = STUDIO_USER_ZOOM_DEFAULT;
    const visited = [level];
    for (let index = 0; index < 20; index += 1) { level = studioUserZoomApply(level, "in"); visited.push(level); }
    expect(new Set(visited)).toEqual(new Set([1, ...STUDIO_USER_ZOOM_STEPS.filter((step) => step >= 1)]));
    expect(level).toBe(STUDIO_USER_ZOOM_MAX);
    for (let index = 0; index < 20; index += 1) level = studioUserZoomApply(level, "out");
    expect(level).toBe(STUDIO_USER_ZOOM_MIN);
    expect(studioUserZoomApply(level, "reset")).toBe(STUDIO_USER_ZOOM_DEFAULT);
  });
});

describe("휠·핀치 입력", () => {
  const wheel = (deltaY: number, options: { deltaMode?: number; ctrlKey?: boolean } = {}) => ({ deltaY, deltaMode: options.deltaMode ?? 0, ctrlKey: options.ctrlKey ?? false });

  it("위로 굴리면 확대하고 아래로 굴리면 축소하며, 한 칸(100px)은 12% 안팎이다", () => {
    expect(studioUserZoomFromWheel(1, wheel(-100))).toBeCloseTo(1.12, 3);
    expect(studioUserZoomFromWheel(1, wheel(100))).toBeCloseTo(1 / 1.12, 3);
  });

  it("작은 delta(트랙패드)는 비례해서 조금만 바꾸고, 0이면 그대로다", () => {
    const small = studioUserZoomFromWheel(1, wheel(-10));
    expect(small).toBeGreaterThan(1);
    expect(small).toBeLessThan(1.02);
    expect(studioUserZoomFromWheel(1, wheel(0))).toBe(1);
  });

  it("핀치(ctrlKey)는 같은 delta에 더 크게 반응하고, 줄·페이지 단위 delta를 픽셀로 바꿔 읽는다", () => {
    expect(studioUserZoomFromWheel(1, wheel(-5, { ctrlKey: true }))).toBeGreaterThan(studioUserZoomFromWheel(1, wheel(-5)));
    expect(studioUserZoomFromWheel(1, wheel(-3, { deltaMode: 1 }))).toBeCloseTo(studioUserZoomFromWheel(1, wheel(-48)), 6);
    expect(studioUserZoomFromWheel(1, wheel(-1, { deltaMode: 2 }))).toBeGreaterThan(studioUserZoomFromWheel(1, wheel(-100)));
  });

  it("한 번의 이벤트가 범위를 넘게 바꾸지 못하고 이상한 delta는 무시한다", () => {
    expect(studioUserZoomFromWheel(1, wheel(-1_000_000))).toBeLessThanOrEqual(STUDIO_USER_ZOOM_MAX);
    expect(studioUserZoomFromWheel(1, wheel(1_000_000))).toBeGreaterThanOrEqual(STUDIO_USER_ZOOM_MIN);
    expect(studioUserZoomFromWheel(1.5, wheel(Number.NaN))).toBe(1.5);
  });
});

describe("부드러운 전환", () => {
  it("목표에 지수로 다가가고, 가까워지면 붙여서 끝낸다", () => {
    const one = studioUserZoomEase(1, 2, 1 / 60);
    expect(one).toBeGreaterThan(1);
    expect(one).toBeLessThan(2);
    let level = 1;
    for (let frame = 0; frame < 120; frame += 1) level = studioUserZoomEase(level, 2, 1 / 60);
    expect(level).toBe(2);
  });

  it("프레임 간격이 달라도 같은 시간이면 거의 같은 값에 닿고, 간격이 0이거나 이상하면 움직이지 않는다", () => {
    const run = (dt: number, frames: number) => { let level = 1; for (let index = 0; index < frames; index += 1) level = studioUserZoomEase(level, 2, dt); return level; };
    expect(run(1 / 30, 15)).toBeCloseTo(run(1 / 60, 30), 2);
    expect(studioUserZoomEase(1, 2, 0)).toBe(1);
    expect(studioUserZoomEase(1, 2, Number.NaN)).toBe(1);
  });

  it("긴 정지 뒤 한 프레임이 목표를 건너뛰지 못한다(간격 상한)", () => {
    const next = studioUserZoomEase(1, 2, 60);
    expect(next).toBeGreaterThan(1);
    expect(next).toBeLessThan(2);
  });
});

describe("월드 밖을 비추지 않는 하한", () => {
  const view = { cssWidth: 1280, cssHeight: 800, ratio: 1 };

  it("월드가 화면보다 훨씬 크면 최소 배율까지 줄일 수 있다", () => {
    expect(studioUserZoomFloor(1.2, view, { width: 6000, height: 4000 })).toBe(STUDIO_USER_ZOOM_MIN);
  });

  it("월드가 화면과 비슷하면 월드가 화면을 덮는 지점까지만 줄일 수 있다", () => {
    // 화면 1280×800, 월드 2400×1600 → 덮는 줌 = max(1280/2400, 800/1600)=0.533, 자동 줌 1.2 → 하한 0.444 → 최소 배율로 올림
    expect(studioUserZoomFloor(1.2, view, { width: 2400, height: 1600 })).toBe(STUDIO_USER_ZOOM_MIN);
    // 월드 1500×1000: 덮는 줌 0.853, 자동 줌 1.2 → 하한 0.711
    expect(studioUserZoomFloor(1.2, view, { width: 1500, height: 1000 })).toBeCloseTo(0.711, 3);
  });

  it("월드가 화면보다 작아 이미 덮지 못하면 더 줄일 수 없다(1)", () => {
    expect(studioUserZoomFloor(1.2, view, { width: 1000, height: 600 })).toBe(1);
  });

  it("잘못된 입력은 최소 배율로 둔다", () => {
    expect(studioUserZoomFloor(0, view, { width: 3000, height: 2000 })).toBe(STUDIO_USER_ZOOM_MIN);
    expect(studioUserZoomFloor(1, view, { width: 0, height: 2000 })).toBe(STUDIO_USER_ZOOM_MIN);
  });
});

describe("저장과 구독", () => {
  it("저장된 값을 범위 안으로 읽고, 없거나 깨졌으면 기본값이다", () => {
    expect(readStudioUserZoom(memoryStorage())).toBe(STUDIO_USER_ZOOM_DEFAULT);
    expect(readStudioUserZoom(memoryStorage({ [STUDIO_USER_ZOOM_STORAGE_KEY]: "1.5" }))).toBe(1.5);
    expect(readStudioUserZoom(memoryStorage({ [STUDIO_USER_ZOOM_STORAGE_KEY]: "9" }))).toBe(STUDIO_USER_ZOOM_MAX);
    expect(readStudioUserZoom(memoryStorage({ [STUDIO_USER_ZOOM_STORAGE_KEY]: "abc" }))).toBe(STUDIO_USER_ZOOM_DEFAULT);
    expect(readStudioUserZoom(null)).toBe(STUDIO_USER_ZOOM_DEFAULT);
    expect(readStudioUserZoom({ getItem: () => { throw new Error("denied"); }, setItem: () => undefined })).toBe(STUDIO_USER_ZOOM_DEFAULT);
  });

  it("값이 바뀔 때만 저장하고 구독자에게 알리며, 해제하면 더 알리지 않는다", () => {
    const storage = memoryStorage();
    const setItem = vi.spyOn(storage, "setItem");
    const store = new StudioUserZoomStore(storage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.apply("in");
    store.set(1.15);
    expect(store.get()).toBe(1.15);
    expect(setItem).toHaveBeenCalledOnce();
    expect(storage.data.get(STUDIO_USER_ZOOM_STORAGE_KEY)).toBe("1.15");
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    store.apply("reset");
    expect(listener).toHaveBeenCalledOnce();
    expect(store.get()).toBe(STUDIO_USER_ZOOM_DEFAULT);
  });

  it("스냅샷은 값이 바뀔 때만 새 객체가 되어 useSyncExternalStore가 불필요하게 다시 그리지 않는다", () => {
    const store = new StudioUserZoomStore(memoryStorage());
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    store.set(STUDIO_USER_ZOOM_DEFAULT);
    expect(store.getSnapshot()).toBe(first);
    store.set(1.3);
    const second = store.getSnapshot();
    expect(second).not.toBe(first);
    expect(second).toEqual({ level: 1.3, available: true });
    expect(Object.isFrozen(second)).toBe(true);
  });

  it("줌을 받을 수 있는지(available)는 바뀔 때만 알리고 배율 값은 건드리지 않는다", () => {
    const store = new StudioUserZoomStore(memoryStorage());
    const listener = vi.fn();
    store.subscribe(listener);
    store.setAvailable(true);
    expect(listener).not.toHaveBeenCalled();
    store.setAvailable(false);
    expect(listener).toHaveBeenCalledOnce();
    expect(store.getSnapshot()).toEqual({ level: STUDIO_USER_ZOOM_DEFAULT, available: false });
    store.setAvailable(false);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("새 저장소는 저장된 값으로 시작하고, 저장소가 막혀도 이번 방문 동안은 동작한다", () => {
    expect(new StudioUserZoomStore(memoryStorage({ [STUDIO_USER_ZOOM_STORAGE_KEY]: "0.75" })).get()).toBe(0.75);
    const blocked = new StudioUserZoomStore({ getItem: () => null, setItem: () => { throw new Error("quota"); } });
    blocked.apply("in");
    expect(blocked.get()).toBe(1.15);
  });
});

describe("캔버스 전환 상태", () => {
  const view = { cssWidth: 1280, cssHeight: 800, ratio: 1 };
  const big = { width: 6000, height: 4000 };

  it("목표가 바뀌면 프레임마다 부드럽게 따라가 목표에 닿는다", () => {
    const store = new StudioUserZoomStore(memoryStorage());
    const runtime = new StudioUserZoomRuntime(store);
    runtime.setView(1.2, view, big, true);
    expect(runtime.sample(1 / 60)).toBe(1);
    store.set(1.5);
    const first = runtime.sample(1 / 60);
    expect(first).toBeGreaterThan(1);
    expect(first).toBeLessThan(1.5);
    expect(runtime.current).toBe(first);
    for (let frame = 0; frame < 120; frame += 1) runtime.sample(1 / 60);
    expect(runtime.sample(1 / 60)).toBe(1.5);
  });

  it("줌을 받지 못하는 카메라(고정 프레임)면 항상 1이고 HUD에 그렇게 알린다", () => {
    const store = new StudioUserZoomStore(memoryStorage({ [STUDIO_USER_ZOOM_STORAGE_KEY]: "1.5" }));
    const runtime = new StudioUserZoomRuntime(store);
    runtime.setView(1.2, view, big, false);
    expect(store.getSnapshot().available).toBe(false);
    expect(runtime.sample(1 / 60)).toBe(1);
    expect(runtime.current).toBe(1);
    expect(store.get(), "저장된 목표는 그대로 남아 줌이 되는 장소로 돌아가면 이어진다").toBe(1.5);
    runtime.setView(1.2, view, big, true);
    expect(store.getSnapshot().available).toBe(true);
    expect(runtime.sample(1, true)).toBe(1.5);
  });

  it("모션 줄이기(instant)에서는 전환 없이 바로 목표에 간다", () => {
    const store = new StudioUserZoomStore(memoryStorage());
    const runtime = new StudioUserZoomRuntime(store);
    runtime.setView(1.2, view, big, true);
    store.set(1.75);
    expect(runtime.sample(1 / 60, true)).toBe(1.75);
  });

  it("월드가 화면을 덮는 하한보다 작게는 줄지 않고, 화면이 바뀌어 하한이 오르면 보이는 값도 바로 오른다", () => {
    const store = new StudioUserZoomStore(memoryStorage({ [STUDIO_USER_ZOOM_STORAGE_KEY]: "0.6" }));
    const runtime = new StudioUserZoomRuntime(store);
    runtime.setView(1.2, view, { width: 1500, height: 1000 }, true);
    for (let frame = 0; frame < 60; frame += 1) runtime.sample(1 / 60);
    expect(runtime.sample(1 / 60)).toBeCloseTo(0.711, 3);
    runtime.setView(1.2, view, { width: 1000, height: 600 }, true);
    expect(runtime.sample(1 / 60)).toBe(1);
  });
});

describe("캔버스 휠 연결", () => {
  function fakeTarget() {
    const listeners = new Map<string, { listener: EventListener; options: unknown }>();
    return {
      listeners,
      addEventListener: vi.fn((type: string, listener: EventListener, options?: unknown) => { listeners.set(type, { listener, options }); }),
      removeEventListener: vi.fn((type: string) => { listeners.delete(type); }),
    };
  }

  it("passive가 아닌 휠 리스너로 목표를 바꾸고 페이지 스크롤을 막으며, 해제하면 떼어 낸다", () => {
    const target = fakeTarget();
    const store = new StudioUserZoomStore(memoryStorage());
    const unbind = bindStudioUserZoomWheel(target as unknown as HTMLElement, store, () => true);
    const registered = target.listeners.get("wheel");
    expect(registered?.options).toEqual({ passive: false });
    const preventDefault = vi.fn();
    registered?.listener({ deltaY: -100, deltaMode: 0, ctrlKey: false, preventDefault } as unknown as Event);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(store.get()).toBeGreaterThan(1);
    unbind();
    expect(target.listeners.has("wheel")).toBe(false);
  });

  it("줌을 쓸 수 없는 상태(입력 차단·고정 프레임)에서는 이벤트를 건드리지 않는다", () => {
    const target = fakeTarget();
    const store = new StudioUserZoomStore(memoryStorage());
    bindStudioUserZoomWheel(target as unknown as HTMLElement, store, () => false);
    const preventDefault = vi.fn();
    target.listeners.get("wheel")?.listener({ deltaY: -100, deltaMode: 0, ctrlKey: false, preventDefault } as unknown as Event);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(store.get()).toBe(STUDIO_USER_ZOOM_DEFAULT);
  });
});
