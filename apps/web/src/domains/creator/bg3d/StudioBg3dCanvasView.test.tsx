// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { PerspectiveCamera, Raycaster, Scene, Vector2 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dCanvasView } from "./StudioBg3dCanvasView";

const harness = vi.hoisted(() => ({
  frame: null as null | { callback: (state: unknown) => void; priority: number },
  portal: null as null | { container: unknown; options: { events: { compute: (event: unknown, state: unknown) => void; priority: number }; size?: unknown } },
  rootState: {} as Record<string, unknown>,
}));

vi.mock("@react-three/fiber", () => ({
  useFrame: (callback: (state: unknown) => void, priority: number) => { harness.frame = { callback, priority }; },
  useThree: (select?: (state: unknown) => unknown) => (select ? select(harness.rootState) : harness.rootState),
  createPortal: (children: unknown, container: unknown, options: never) => {
    harness.portal = { container, options };
    return children;
  },
}));

const resizeCallbacks: Array<() => void> = [];
class FakeResizeObserver {
  constructor(callback: () => void) { resizeCallbacks.push(callback); }
  observe() {}
  disconnect() {}
}

function createElementWithRect(initial: DOMRect) {
  const element = document.createElement("div");
  let rect = initial;
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => rect);
  return { element, setRect: (next: DOMRect) => { rect = next; } };
}

interface Mounted {
  readonly renderer: ReturnType<typeof createRenderer>;
  readonly invalidate: ReturnType<typeof vi.fn>;
  readonly setVisible: (visible: boolean) => void;
  readonly camera: PerspectiveCamera;
  readonly portalScene: Scene;
  readonly track: { current: HTMLElement | null };
  readonly setTrackRect: (rect: DOMRect) => void;
  readonly setEvents: ReturnType<typeof vi.fn>;
  readonly frame: () => void;
  readonly rerender: ReturnType<typeof render>["rerender"];
  readonly unmount: () => void;
}

function createRenderer(canvasRect: DOMRect) {
  return {
    autoClear: true,
    domElement: { getBoundingClientRect: () => canvasRect },
    setViewport: vi.fn(), setScissor: vi.fn(), setScissorTest: vi.fn(),
    getClearColor: vi.fn(), getClearAlpha: vi.fn(() => 1), setClearColor: vi.fn(), clear: vi.fn(),
    render: vi.fn(),
  };
}

function mount(canvasRect: DOMRect, trackRect: DOMRect, props: { visible?: boolean; index?: number } = {}): Mounted {
  const rootScene = new Scene();
  const renderer = createRenderer(canvasRect);
  const camera = new PerspectiveCamera(50, 1, 0.1, 200);
  const portalScene = new Scene();
  const setEvents = vi.fn();
  const invalidate = vi.fn();
  harness.rootState = {
    scene: rootScene, gl: renderer, camera, events: { connected: "previous-target" },
    get: () => harness.rootState, setEvents, invalidate, pointer: new Vector2(), raycaster: new Raycaster(),
  };
  const { element, setRect } = createElementWithRect(trackRect);
  const track = { current: element as HTMLElement | null };
  const view = (next: { visible?: boolean; index?: number }) => (
    <StudioBg3dCanvasView track={track} {...next}><mesh /></StudioBg3dCanvasView>
  );
  const result = render(view(props));
  return {
    renderer, camera, portalScene, track, setTrackRect: setRect, setEvents, invalidate,
    setVisible: (visible) => result.rerender(view({ ...props, visible })),
    frame: () => act(() => harness.frame?.callback({ gl: renderer, camera, scene: portalScene })),
    rerender: (node) => result.rerender(node),
    unmount: () => result.unmount(),
  };
}

beforeEach(() => {
  harness.frame = null;
  harness.portal = null;
  resizeCallbacks.length = 0;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  // jsdom 은 R3F 의 <group>/<mesh> 를 모르는 태그로 보고 경고한다. 이 시험은 R3F 를 대신 흉내 낸다.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Studio BG3D CanvasView", () => {
  it("정밀 편집 배치(트랙 top 589 > 캔버스 높이 380)에서도 프레임마다 그린다", () => {
    const { renderer, camera, portalScene, frame } = mount(
      new DOMRect(316, 590, 677.109375, 380),
      new DOMRect(315, 589, 679.109375, 382),
    );
    frame();
    frame();
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.render).toHaveBeenLastCalledWith(portalScene, camera);
    expect(renderer.setViewport).toHaveBeenLastCalledWith(-1, -1, 679.109375, 382);
    expect(renderer.setScissor).toHaveBeenLastCalledWith(-1, -1, 679.109375, 382);
  });

  it("트랙이 캔버스 밖으로 나가면 그 프레임부터 그리지 않고, 돌아오면 바로 다시 그린다", () => {
    const { renderer, frame, setTrackRect } = mount(new DOMRect(0, 0, 800, 600), new DOMRect(0, 0, 800, 600));
    frame();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    setTrackRect(new DOMRect(0, 2000, 800, 600));
    frame();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    setTrackRect(new DOMRect(0, 0, 800, 600));
    frame();
    expect(renderer.render).toHaveBeenCalledTimes(2);
    // 다시 그릴 수 있게 된 프레임에서 자기 칸을 지워 그림을 날리지 않는다.
    expect(renderer.clear).not.toHaveBeenCalled();
  });

  it("숨기면 자기 칸을 한 번 지우고, 다시 보이면 그릴 프레임을 요청한다", () => {
    const { renderer, frame, invalidate, setVisible } = mount(new DOMRect(0, 0, 800, 600), new DOMRect(0, 0, 800, 600));
    frame();
    invalidate.mockClear();
    setVisible(false);
    expect(renderer.clear).toHaveBeenCalledExactlyOnceWith(true, true);
    frame();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    setVisible(true);
    expect(invalidate).toHaveBeenCalledOnce();
    frame();
    expect(renderer.render).toHaveBeenCalledTimes(2);
  });

  it("보이지 않는 View 는 그리지 않고, 프레임 우선순위는 index 를 따른다", () => {
    const { renderer, frame } = mount(new DOMRect(0, 0, 800, 600), new DOMRect(0, 0, 800, 600), { visible: false, index: 3 });
    frame();
    expect(harness.frame?.priority).toBe(3);
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it("트랙 요소에 이벤트 층을 잇고 내려갈 때 이전 연결을 되돌린다", () => {
    const { track, setEvents, unmount } = mount(new DOMRect(0, 0, 800, 600), new DOMRect(0, 0, 800, 600));
    expect(setEvents).toHaveBeenCalledWith({ connected: track.current });
    unmount();
    expect(setEvents).toHaveBeenLastCalledWith({ connected: "previous-target" });
  });

  it("포털에 트랙 크기와 이벤트 설정을 넘기고, 트랙이 커지거나 줄면 크기를 새로 넘긴다", () => {
    const { setTrackRect } = mount(new DOMRect(316, 590, 677, 380), new DOMRect(315, 589, 679, 382), { index: 2 });
    expect(harness.portal?.options.events.priority).toBe(2);
    expect(harness.portal?.options.size).toEqual({ width: 679, height: 382, top: 589, left: 315 });
    setTrackRect(new DOMRect(315, 209, 730, 762));
    act(() => { for (const callback of resizeCallbacks) callback(); });
    expect(harness.portal?.options.size).toEqual({ width: 730, height: 762, top: 209, left: 315 });
  });

  it("포인터 좌표는 이벤트 대상이 트랙 요소일 때만 트랙 칸 기준으로 바꾼다", () => {
    const { track } = mount(new DOMRect(316, 590, 677, 380), new DOMRect(315, 589, 679, 382));
    const state = { pointer: new Vector2(), raycaster: { setFromCamera: vi.fn() }, camera: new PerspectiveCamera() };
    const compute = harness.portal!.options.events.compute;
    compute({ target: document.body, clientX: 0, clientY: 0 }, state);
    expect(state.raycaster.setFromCamera).not.toHaveBeenCalled();
    compute({ target: track.current, clientX: 315 + 679 / 2, clientY: 589 + 382 / 2 }, state);
    expect(state.pointer.x).toBeCloseTo(0, 10);
    expect(state.pointer.y).toBeCloseTo(0, 10);
    expect(state.raycaster.setFromCamera).toHaveBeenCalledOnce();
  });
});
