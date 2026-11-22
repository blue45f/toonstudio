/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioVrmCanvasSizeSync } from "./StudioVrmViewportHelpers";

const r3fState = vi.hoisted(() => ({
  gl: null as unknown as THREE.WebGLRenderer,
  camera: null as unknown as THREE.PerspectiveCamera,
  viewport: { dpr: 1 },
  setDpr: vi.fn(),
  setSize: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: typeof r3fState) => unknown) => selector(r3fState),
  useFrame: () => undefined,
}));

describe("StudioVrmCanvasSizeSync 백킹 버퍼·DPR 동기화", () => {
  let outerHost: HTMLDivElement;
  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let hostWidth: number;
  let hostHeight: number;
  let observedElements: Element[];
  let observerCallbacks: Array<() => void>;
  let disconnectSpy: ReturnType<typeof vi.fn>;
  let visualViewportTarget: EventTarget;

  function createFakeRenderer(targetCanvas: HTMLCanvasElement) {
    let pixelRatio = 1;
    return {
      domElement: targetCanvas,
      getPixelRatio: () => pixelRatio,
      setPixelRatio: vi.fn((next: number) => {
        pixelRatio = next;
      }),
      setSize: vi.fn((w: number, h: number, updateStyle = true) => {
        targetCanvas.width = Math.floor(w * pixelRatio);
        targetCanvas.height = Math.floor(h * pixelRatio);
        if (updateStyle) {
          targetCanvas.style.width = `${w}px`;
          targetCanvas.style.height = `${h}px`;
        }
      }),
    };
  }

  beforeEach(() => {
    hostWidth = 847;
    hostHeight = 706.39;
    observedElements = [];
    observerCallbacks = [];
    disconnectSpy = vi.fn();
    visualViewportTarget = new EventTarget();

    outerHost = document.createElement("div");
    host = document.createElement("div");
    canvas = document.createElement("canvas");
    host.append(canvas);
    outerHost.append(host);
    document.body.append(outerHost);

    vi.spyOn(host, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 0, hostWidth, hostHeight),
    );
    vi.spyOn(canvas, "getBoundingClientRect").mockImplementation(() => {
      const parsedW = Number.parseFloat(canvas.style.width);
      const parsedH = Number.parseFloat(canvas.style.height);
      return new DOMRect(
        0,
        0,
        Number.isFinite(parsedW) && parsedW > 0 ? parsedW : hostWidth,
        Number.isFinite(parsedH) && parsedH > 0 ? parsedH : hostHeight,
      );
    });

    const fakeGl = createFakeRenderer(canvas);
    r3fState.gl = fakeGl as unknown as THREE.WebGLRenderer;
    r3fState.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
    r3fState.viewport = { dpr: 1 };
    r3fState.invalidate = vi.fn();
    // 실제 R3F rootStore.subscribe와 동일하게 setSize 호출 시 state.viewport.dpr로 gl을 다시 맞춘다.
    r3fState.setDpr = vi.fn((next: number) => {
      r3fState.viewport = { dpr: next };
      fakeGl.setPixelRatio(next);
    });
    r3fState.setSize = vi.fn((w: number, h: number) => {
      fakeGl.setPixelRatio(r3fState.viewport.dpr);
      fakeGl.setSize(w, h, true);
    });

    vi.stubGlobal("ResizeObserver", class {
      private readonly cb: () => void;
      constructor(callback: () => void) {
        this.cb = callback;
        observerCallbacks.push(callback);
      }
      observe(target: Element) {
        observedElements.push(target);
      }
      disconnect = disconnectSpy;
    });
    vi.stubGlobal("visualViewport", visualViewportTarget);
  });

  afterEach(() => {
    cleanup();
    outerHost.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("R3F 스토어 viewport.dpr가 초기값 1이어도 setSize 이전에 setDpr(2)을 동기화해 Retina 2배 비트맵을 유지한다", () => {
    render(<StudioVrmCanvasSizeSync dpr={2} />);

    expect(r3fState.setDpr).toHaveBeenCalledWith(2);
    expect(r3fState.setDpr.mock.invocationCallOrder[0]).toBeLessThan(
      r3fState.setSize.mock.invocationCallOrder[0]!,
    );
    expect(r3fState.gl.getPixelRatio()).toBe(2);
    expect(canvas.width).toBe(Math.floor(847 * 2));
    expect(canvas.height).toBe(Math.floor(706.39 * 2));
    expect(r3fState.camera.aspect).toBeCloseTo(847 / 706.39, 4);
    expect(r3fState.invalidate).toHaveBeenCalled();
  });

  it("모바일 배너·시트 변경으로 호스트 높이가 줄거나 늘어나면 백킹 버퍼를 2배 DPR로 즉시 재동기화한다", () => {
    hostWidth = 372;
    hostHeight = 501;
    render(<StudioVrmCanvasSizeSync dpr={2} />);
    expect(canvas.width).toBe(744);
    expect(canvas.height).toBe(1002);
    expect(observedElements).toContain(host);
    expect(observedElements).toContain(outerHost);

    // 배너 마운트로 높이가 501 → 475로 축소
    hostHeight = 475;
    act(() => {
      for (const cb of observerCallbacks) cb();
    });
    expect(canvas.width).toBe(744);
    expect(canvas.height).toBe(950);

    // 배너 해제·시트 접힘으로 높이가 475 → 520으로 확대(visualViewport 리사이즈 경로 포함)
    hostHeight = 520;
    act(() => {
      visualViewportTarget.dispatchEvent(new Event("resize"));
    });
    expect(canvas.width).toBe(744);
    expect(canvas.height).toBe(1040);
  });

  it("캡처 일시정지 중에는 백킹 버퍼를 건드리지 않고 해제 직후 최신 크기로 복원한다", () => {
    hostWidth = 372;
    hostHeight = 418.17;
    const { rerender, unmount } = render(<StudioVrmCanvasSizeSync dpr={2} paused />);
    expect(r3fState.setSize).not.toHaveBeenCalled();

    rerender(<StudioVrmCanvasSizeSync dpr={2} paused={false} />);
    expect(canvas.width).toBe(744);
    expect(canvas.height).toBe(Math.floor(418.17 * 2));

    unmount();
    expect(disconnectSpy).toHaveBeenCalled();
  });
});
