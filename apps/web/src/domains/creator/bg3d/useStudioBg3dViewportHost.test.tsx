// @vitest-environment jsdom

import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveStudioBg3dCaptureFrame } from "./studio-bg3d-capture-frame-geometry";
import {
  createStudioBg3dViewportHostRef,
  useStudioBg3dViewportHostObservers,
  useStudioBg3dViewportHostRef,
} from "./useStudioBg3dViewportHost";

import type { StudioBg3dDeviceSignals } from "./studio-bg3d-device-quality";
import type { StudioBg3dViewportBoxSize, StudioBg3dViewportHostRef } from "./useStudioBg3dViewportHost";

class FakeResizeObserver {
  static readonly instances: FakeResizeObserver[] = [];
  readonly observed = new Set<Element>();
  disconnected = false;
  constructor(private readonly callback: () => void) { FakeResizeObserver.instances.push(this); }
  observe(element: Element) { this.observed.add(element); }
  disconnect() { this.observed.clear(); this.disconnected = true; }
  fire() { this.callback(); }
  static live() { return FakeResizeObserver.instances.filter((observer) => !observer.disconnected); }
}

/** 실제 호스트처럼 1px border 를 둔다: border box 는 width×height, 오버레이·캔버스 칸은 (width-2)×(height-2). */
function host(width: number, height: number): HTMLDivElement {
  const element = document.createElement("div");
  withBorder(element);
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, width, height));
  return element;
}

function withBorder(element: HTMLElement) {
  for (const side of ["Top", "Right", "Bottom", "Left"] as const) element.style[`border${side}Width`] = "1px";
}

/** useState 의 setter 처럼 함수형 갱신을 받는 값 상자. */
function stateBox<T>(initial: T) {
  const box = { value: initial };
  const set = vi.fn((update: T | ((previous: T) => T)) => {
    box.value = typeof update === "function" ? (update as (previous: T) => T)(box.value) : update;
  });
  return { box, set };
}

beforeEach(() => {
  FakeResizeObserver.instances.length = 0;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("뷰포트 호스트 ref", () => {
  it("current 가 바뀔 때만 구독자에게 알리고, 구독을 풀면 더는 알리지 않는다", () => {
    const ref = createStudioBg3dViewportHostRef();
    const listener = vi.fn();
    const unsubscribe = ref.subscribe(listener);
    const a = host(10, 10);
    ref.current = a;
    ref.current = a;
    expect(listener).toHaveBeenCalledTimes(1);
    ref.current = null;
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    ref.current = a;
    expect(listener).toHaveBeenCalledTimes(2);
    expect(ref.current).toBe(a);
  });

  it("React 의 ref 로 쓰이고, 다시 마운트되면 새 요소를 가리킨다", () => {
    const { result } = renderHook(() => useStudioBg3dViewportHostRef());
    const ref = result.current;
    const view = render(<section><div ref={ref} data-host="a" /></section>);
    expect(ref.current?.getAttribute("data-host")).toBe("a");
    view.rerender(<article><div ref={ref} data-host="b" /></article>);
    expect(ref.current?.getAttribute("data-host")).toBe("b");
    view.unmount();
    expect(ref.current).toBeNull();
  });
});

describe("뷰포트 호스트 관찰", () => {
  function mountObservers(ref: StudioBg3dViewportHostRef, open = true) {
    const boxSize = stateBox<StudioBg3dViewportBoxSize | null>(null);
    const deviceSignals = stateBox<StudioBg3dDeviceSignals>({});
    const hook = renderHook(
      ({ isOpen }) => useStudioBg3dViewportHostObservers({
        open: isOpen, viewportHostRef: ref,
        setViewportBoxSize: boxSize.set, setDeviceSignals: deviceSignals.set,
      }),
      { initialProps: { isOpen: open } },
    );
    return { boxSize, deviceSignals, ...hook };
  }

  it("호스트를 잰 뒤 크기가 바뀌면 다시 재고, 면적이 없으면 무시한다", () => {
    const ref = createStudioBg3dViewportHostRef();
    const a = host(965, 784);
    ref.current = a;
    const { boxSize } = mountObservers(ref);
    // 칸 크기는 border(1px) 안쪽이다: 오버레이·캔버스가 실제로 차지하는 크기.
    expect(boxSize.box.value).toEqual({ width: 963, height: 782 });
    vi.mocked(a.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 700, 400));
    act(() => FakeResizeObserver.live().forEach((observer) => observer.fire()));
    expect(boxSize.box.value).toEqual({ width: 698, height: 398 });
    vi.mocked(a.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 0, 0));
    act(() => FakeResizeObserver.live().forEach((observer) => observer.fire()));
    expect(boxSize.box.value).toEqual({ width: 698, height: 398 });
  });

  it("호스트 요소가 바뀌면 이전 요소 관찰을 끊고 새 요소의 크기로 갱신한다", () => {
    const ref = createStudioBg3dViewportHostRef();
    const simple = host(965, 784);
    const pro = host(679, 382);
    ref.current = simple;
    const { boxSize, deviceSignals } = mountObservers(ref);
    expect(boxSize.box.value).toEqual({ width: 963, height: 782 });
    expect(FakeResizeObserver.live().flatMap((observer) => [...observer.observed])).toEqual([simple, simple]);

    act(() => { ref.current = null; ref.current = pro; });

    expect(boxSize.box.value).toEqual({ width: 677, height: 380 });
    // 기기 신호(화질 판단)는 border box 크기를 그대로 쓴다.
    expect(deviceSignals.box.value).toMatchObject({ cssWidth: 679, cssHeight: 382 });
    const observed = FakeResizeObserver.live().flatMap((observer) => [...observer.observed]);
    expect(observed).toEqual([pro, pro]);
    expect(observed).not.toContain(simple);
  });

  it("장면 도우미 → 정밀 편집처럼 다른 부모 아래에서 호스트가 다시 마운트돼도 박스 크기가 따라간다", () => {
    const ref = createStudioBg3dViewportHostRef();
    const boxSize = stateBox<StudioBg3dViewportBoxSize | null>(null);
    const deviceSignals = stateBox<StudioBg3dDeviceSignals>({});
    const sizes = new Map([["simple", [965, 784]], ["pro", [679, 382]]] as const);
    function Editor({ mode }: { readonly mode: "simple" | "pro" }) {
      useStudioBg3dViewportHostObservers({
        open: true, viewportHostRef: ref, setViewportBoxSize: boxSize.set, setDeviceSignals: deviceSignals.set,
      });
      const [width, height] = sizes.get(mode)!;
      const attach = (element: HTMLDivElement | null) => {
        if (element) {
          withBorder(element);
          vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, width, height));
        }
        ref.current = element;
      };
      return mode === "simple"
        ? <section data-parent="simple"><div ref={attach} /></section>
        : <article data-parent="pro"><div ref={attach} /></article>;
    }
    const view = render(<Editor mode="simple" />);
    expect(boxSize.box.value).toEqual({ width: 963, height: 782 });
    view.rerender(<Editor mode="pro" />);
    expect(boxSize.box.value).toEqual({ width: 677, height: 380 });
    view.rerender(<Editor mode="simple" />);
    expect(boxSize.box.value).toEqual({ width: 963, height: 782 });
  });

  it("(대조) 마운트 때 ref.current 를 한 번 읽는 이전 방식은 같은 전환에서 사라진 호스트를 계속 본다", () => {
    const sizes = new Map([["simple", [965, 784]], ["pro", [679, 382]]] as const);
    const boxSize = stateBox<StudioBg3dViewportBoxSize | null>(null);
    function LegacyEditor({ mode }: { readonly mode: "simple" | "pro" }) {
      const ref = useRef<HTMLDivElement>(null);
      useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const sync = () => {
          const rect = element.getBoundingClientRect();
          boxSize.set({ width: rect.width, height: rect.height });
        };
        sync();
        const observer = new ResizeObserver(sync);
        observer.observe(element);
        return () => observer.disconnect();
      }, []);
      const [width, height] = sizes.get(mode)!;
      const attach = (element: HTMLDivElement | null) => {
        if (element) vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, width, height));
        ref.current = element;
      };
      return mode === "simple"
        ? <section><div ref={attach} /></section>
        : <article><div ref={attach} /></article>;
    }
    const view = render(<LegacyEditor mode="simple" />);
    view.rerender(<LegacyEditor mode="pro" />);
    // 이 하니스가 결함을 잡는지 확인하는 대조군이다: 이전 방식은 간편 모드 크기에 머문다.
    expect(boxSize.box.value).toEqual({ width: 965, height: 784 });
  });

  it("잰 칸으로 그린 9:16 안내선이 오버레이 위에서 물리적으로 9:16 이다(border box 를 쓰면 어긋난다)", () => {
    // 정밀 편집 뷰포트(border 1px 포함 728.875×410)의 실제 값. 오버레이(absolute inset-0)는 border 안쪽을 덮는다.
    const ref = createStudioBg3dViewportHostRef();
    ref.current = host(728.875, 410);
    const { boxSize } = mountObservers(ref);
    const overlay = { width: 728.875 - 2, height: 410 - 2 };
    const physicalRatio = (box: StudioBg3dViewportBoxSize) => {
      const frame = resolveStudioBg3dCaptureFrame({ viewportWidth: box.width, viewportHeight: box.height, aspectRatio: 9 / 16 })!;
      // 안내선 SVG 는 viewBox 1000×1000 을 오버레이 크기로 늘린다: 비율 = 프레임 비율 × 오버레이 가로세로비 ÷ 박스 가로세로비.
      return ((frame.width / box.width) * overlay.width) / ((frame.height / box.height) * overlay.height);
    };
    expect(boxSize.box.value).toEqual(overlay);
    expect(physicalRatio(boxSize.box.value!)).toBeCloseTo(9 / 16, 10);
    expect(physicalRatio({ width: 728.875, height: 410 })).not.toBeCloseTo(9 / 16, 3);
  });

  it("닫히면 박스 크기를 비우고 관찰하지 않는다", () => {
    const ref = createStudioBg3dViewportHostRef();
    ref.current = host(965, 784);
    const { boxSize, rerender } = mountObservers(ref);
    expect(FakeResizeObserver.live()).not.toHaveLength(0);
    rerender({ isOpen: false });
    expect(boxSize.box.value).toBeNull();
    expect(FakeResizeObserver.live()).toHaveLength(0);
  });
});
