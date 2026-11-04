// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStudioThumbnailPixelScale } from "./use-studio-thumbnail-pixel-scale";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("실제 thumbnail viewport와 DPR", () => {
  it("SVG meet 비율을 측정하고 확대·DPR 변경 때 필요한 화소를 다시 계산한다", () => {
    let width = 200, height = 100;
    const root = document.createElement("div");
    root.getBoundingClientRect = () => DOMRect.fromRect({ width, height });
    const ref = { current: root }; let resize: (() => void) | undefined, dprChange: (() => void) | undefined;
    const disconnect = vi.fn(), remove = vi.fn();
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect = disconnect; });
    vi.stubGlobal("matchMedia", vi.fn(() => ({ addEventListener: (_event: string, callback: () => void) => { dprChange = callback; }, removeEventListener: remove })));
    vi.stubGlobal("devicePixelRatio", 2);
    const hook = renderHook(() => useStudioThumbnailPixelScale(ref, 800, 400));
    expect(hook.result.current).toBe(.5);
    act(() => { width = 400; height = 200; resize?.(); }); expect(hook.result.current).toBe(1);
    act(() => { vi.stubGlobal("devicePixelRatio", 3); dprChange?.(); }); expect(hook.result.current).toBe(1.5);
    hook.unmount(); expect(disconnect).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalled();
  });
  it("실제 표시 크기가 아직 없으면 고정 저해상도로 대신 취득하지 않는다", () => {
    const root = document.createElement("div"), ref = { current: root };
    expect(renderHook(() => useStudioThumbnailPixelScale(ref, 800, 1080)).result.current).toBeNull();
  });
});
