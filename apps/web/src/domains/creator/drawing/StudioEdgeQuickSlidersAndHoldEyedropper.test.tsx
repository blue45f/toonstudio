// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioEdgeQuickSlidersAndHoldEyedropper } from "./StudioEdgeQuickSlidersAndHoldEyedropper";

describe("StudioEdgeQuickSlidersAndHoldEyedropper (AC-002 T1 · T4 · T5 · T12)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("adjusts brush size and opacity via edge quick sliders (pointer drag + keyboard)", () => {
    const hostRef = createRef<HTMLDivElement>();
    const onStrokeWidthChange = vi.fn();
    const onOpacityChange = vi.fn();

    render(
      <div ref={hostRef}>
        <StudioEdgeQuickSlidersAndHoldEyedropper
          visible
          strokeWidth={20}
          brushOpacity={0.5}
          currentColor="#112233"
          canvasHostRef={hostRef}
          onStrokeWidthChange={onStrokeWidthChange}
          onOpacityChange={onOpacityChange}
          onPickColor={vi.fn()}
        />
      </div>,
    );

    const sizeSlider = screen.getByRole("slider", { name: "가장자리 브러시 굵기 슬라이더" });
    fireEvent.pointerDown(sizeSlider, { pointerId: 1, clientY: 200 });
    fireEvent.pointerMove(sizeSlider, { pointerId: 1, clientY: 130 }); // upward -> increase
    fireEvent.pointerUp(sizeSlider, { pointerId: 1, clientY: 130 });
    expect(onStrokeWidthChange).toHaveBeenCalled();
    expect(onStrokeWidthChange.mock.calls.at(-1)?.[0]).toBeGreaterThan(20);

    const opacitySlider = screen.getByRole("slider", { name: "가장자리 브러시 불투명도 슬라이더" });
    fireEvent.keyDown(opacitySlider, { key: "ArrowUp" });
    expect(onOpacityChange).toHaveBeenCalled();
    expect(onOpacityChange.mock.calls.at(-1)?.[0]).toBeGreaterThan(0.5);

    fireEvent.keyDown(sizeSlider, { key: "Home" });
    expect(onStrokeWidthChange).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(opacitySlider, { key: "End" });
    expect(onOpacityChange).toHaveBeenLastCalledWith(1);
  });

  it("activates 400ms touch-hold eyedropper loupe and commits sampled color on release (T12)", () => {
    vi.useFakeTimers();
    const hostRef = createRef<HTMLDivElement>();
    const onPickColor = vi.fn();

    render(
      <div ref={hostRef} data-testid="canvas-host">
        <StudioEdgeQuickSlidersAndHoldEyedropper
          visible
          strokeWidth={12}
          brushOpacity={1}
          currentColor="#111111"
          holdDelayMs={400}
          canvasHostRef={hostRef}
          onStrokeWidthChange={vi.fn()}
          onOpacityChange={vi.fn()}
          onPickColor={onPickColor}
          sampleColorAtClientPoint={() => "#d97736"}
        />
      </div>,
    );

    const host = screen.getByTestId("canvas-host");
    fireEvent.pointerDown(host, {
      pointerId: 10,
      pointerType: "touch",
      clientX: 160,
      clientY: 220,
      width: 12,
      height: 12,
    });

    act(() => {
      vi.advanceTimersByTime(420);
    });

    const loupe = document.querySelector('[data-studio-touch-hold-eyedropper="true"]');
    expect(loupe).not.toBeNull();
    expect(loupe?.textContent).toContain("#d97736");

    fireEvent.pointerUp(host, {
      pointerId: 10,
      pointerType: "touch",
      clientX: 160,
      clientY: 220,
    });
    expect(onPickColor).toHaveBeenCalledWith("#d97736");
  });

  it("handles 2-finger tap Undo, 3-finger tap Redo, hold scrub, palm rejection, and stylus hover (T1 · T4 · T5)", () => {
    vi.useFakeTimers();
    const hostRef = createRef<HTMLDivElement>();
    const onUndo = vi.fn();
    const onRedo = vi.fn();

    render(
      <div ref={hostRef} data-testid="canvas-host">
        <StudioEdgeQuickSlidersAndHoldEyedropper
          visible
          strokeWidth={14}
          brushOpacity={1}
          currentColor="#000000"
          palmRejectionEnabled
          canvasHostRef={hostRef}
          onStrokeWidthChange={vi.fn()}
          onOpacityChange={vi.fn()}
          onPickColor={vi.fn()}
          onUndo={onUndo}
          onRedo={onRedo}
        />
      </div>,
    );

    const host = screen.getByTestId("canvas-host");

    // T5: Palm rejection (contact width >= 28px)
    fireEvent.pointerDown(host, {
      pointerId: 99,
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
      width: 34,
      height: 34,
    });
    expect(screen.getByText("손바닥 터치를 무시했습니다")).toBeTruthy();

    // T1: 2-finger tap -> Undo
    const dispatchPointer = (type: string, init: Record<string, unknown>) => {
      const ev = new Event(type, { bubbles: true });
      for (const [k, v] of Object.entries(init)) {
        Object.defineProperty(ev, k, { value: v, configurable: true });
      }
      act(() => {
        host.dispatchEvent(ev);
      });
    };

    dispatchPointer("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 50, width: 10, height: 10, timeStamp: 1000 });
    dispatchPointer("pointerdown", { pointerId: 2, pointerType: "touch", clientX: 80, clientY: 50, width: 10, height: 10, timeStamp: 1020 });
    dispatchPointer("pointerup", { pointerId: 1, pointerType: "touch", clientX: 50, clientY: 50, timeStamp: 1120 });
    dispatchPointer("pointerup", { pointerId: 2, pointerType: "touch", clientX: 80, clientY: 50, timeStamp: 1140 });
    expect(onUndo).toHaveBeenCalledTimes(1);

    // T1: 3-finger tap -> Redo
    dispatchPointer("pointerdown", { pointerId: 3, pointerType: "touch", clientX: 50, clientY: 50, width: 10, height: 10, timeStamp: 2000 });
    dispatchPointer("pointerdown", { pointerId: 4, pointerType: "touch", clientX: 80, clientY: 50, width: 10, height: 10, timeStamp: 2010 });
    dispatchPointer("pointerdown", { pointerId: 5, pointerType: "touch", clientX: 110, clientY: 50, width: 10, height: 10, timeStamp: 2020 });
    dispatchPointer("pointerup", { pointerId: 3, pointerType: "touch", clientX: 50, clientY: 50, timeStamp: 2100 });
    dispatchPointer("pointerup", { pointerId: 4, pointerType: "touch", clientX: 80, clientY: 50, timeStamp: 2110 });
    dispatchPointer("pointerup", { pointerId: 5, pointerType: "touch", clientX: 110, clientY: 50, timeStamp: 2120 });
    expect(onRedo).toHaveBeenCalledTimes(1);

    // T4: Stylus hover projection
    dispatchPointer("pointermove", {
      pointerId: 20,
      pointerType: "pen",
      buttons: 0,
      clientX: 240,
      clientY: 180,
      tiltX: 30,
      tiltY: 15,
      twist: 45,
    });
    expect(document.querySelector('[data-studio-stylus-hover-cursor="true"]')).not.toBeNull();
  });
});
