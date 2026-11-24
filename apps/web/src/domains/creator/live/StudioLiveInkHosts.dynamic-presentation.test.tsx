// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioLiveDynamicBrushOverlayHost, StudioLivePressureHudPill, type StudioLivePressureStore } from "./StudioLiveInkHosts";

import type { StudioLiveDynamicBrushOverlayRenderer } from "./studio-live-dynamic-brush-overlay";

afterEach(cleanup);

describe("StudioLiveDynamicBrushOverlayHost presentation surfaces", () => {
  it("keeps full-opacity coverage hidden and exposes a separate Canvas2D presentation surface", () => {
    const attach = vi.fn();
    const setSurface = vi.fn();
    const renderer = {
      attach,
      setSurface,
    } as unknown as StudioLiveDynamicBrushOverlayRenderer;
    const view = render(
      <StudioLiveDynamicBrushOverlayHost
        renderer={renderer}
        left={4}
        top={8}
        width={900}
        height={1_200}
        documentScale={1.5}
        documentWidth={900}
        flipX={false}
      />,
    );

    const coverage = view.container.querySelector<HTMLCanvasElement>(
      '[data-studio-live-dynamic-coverage="true"]',
    );
    const presentation = view.container.querySelector<HTMLCanvasElement>(
      '[data-studio-live-dynamic-active="true"]',
    );
    const settled = view.container.querySelector<HTMLCanvasElement>(
      '[data-studio-live-dynamic-settled="true"]',
    );
    expect(coverage).not.toBeNull();
    expect(coverage?.classList.contains("hidden")).toBe(true);
    expect(presentation).not.toBeNull();
    expect(presentation?.classList.contains("hidden")).toBe(false);
    expect(presentation?.style.opacity).toBe("");
    expect(attach).toHaveBeenCalledWith({
      activeCanvas: coverage,
      presentationCanvas: presentation,
      settledCanvas: settled,
    });
    expect(setSurface).toHaveBeenCalledWith({
      left: 4,
      top: 8,
      width: 900,
      height: 1_200,
      documentScale: 1.5,
      documentWidth: 900,
      flipX: false,
    });

    view.unmount();
    expect(attach).toHaveBeenLastCalledWith(null);
  });
});

describe("StudioLivePressureHudPill", () => {
  it("첫 필압 표본은 추가 청크를 기다리지 않고 작화 화면에 바로 표시한다", () => {
    const store: StudioLivePressureStore = { value: null, listeners: new Set() };
    const view = render(<StudioLivePressureHudPill store={store} />);
    expect(view.queryByRole("meter")).toBeNull();
    const meter = view.getByRole("meter", { hidden: true });
    const observer = new MutationObserver(() => {});
    observer.observe(view.container, { childList: true, subtree: true });
    act(() => {
      store.value = 0.42;
      for (const notify of store.listeners) notify();
    });
    expect(view.getByRole("meter", { name: "실시간 필압" })).toBe(meter);
    expect(meter.getAttribute("aria-valuenow")).toBe("42");
    act(() => {
      store.value = null;
      for (const notify of store.listeners) notify();
    });
    expect(view.queryByRole("meter")).toBeNull();
    expect(view.getByRole("meter", { hidden: true })).toBe(meter);
    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
  });
});
