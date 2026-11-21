// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { studioBrushDynamicsPresetSettings } from "./studio-brush-dynamics";
import { DEFAULT_STUDIO_BRUSH_UNIFIED_MEDIA_PHYSICS } from "./studio-brush-studio-constants";
import { StudioBrushLiveTestPad } from "./StudioBrushLiveTestPad";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubCanvas2d() {
  const clearRect = vi.fn();
  const save = vi.fn();
  const restore = vi.fn();
  const translate = vi.fn();
  const rotate = vi.fn();
  const beginPath = vi.fn();
  const ellipse = vi.fn();
  const arc = vi.fn();
  const fill = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (() =>
      ({
        clearRect,
        save,
        restore,
        translate,
        rotate,
        beginPath,
        ellipse,
        arc,
        fill,
        fillStyle: "#000",
        globalAlpha: 1,
      }) as unknown as CanvasRenderingContext2D) as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
  return { clearRect, ellipse, arc, fill };
}

describe("StudioBrushLiveTestPad", () => {
  it("포인터 스트로크 입력(필압·기울기·속도)에 실시간 반응하고 1클릭 지우기 및 예시 복원을 지원한다", () => {
    const ctx = stubCanvas2d();
    render(
      <StudioBrushLiveTestPad
        settings={studioBrushDynamicsPresetSettings("ink-particle")}
        strokeWidth={10}
        color="#2a1e18"
        mediaPhysics={{
          ...DEFAULT_STUDIO_BRUSH_UNIFIED_MEDIA_PHYSICS,
          impastoDepth: 0.6,
          wetMixStrength: 0.45,
          railroadEnabled: true,
        }}
      />,
    );

    const canvas = screen.getByTestId("studio-brush-live-test-canvas");
    expect(ctx.clearRect).toHaveBeenCalled();

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 3,
      pointerType: "pen",
      pressure: 0.82,
      tiltX: 18,
      tiltY: 12,
      clientX: 30,
      clientY: 40,
      timeStamp: 100,
    });
    fireEvent.pointerMove(canvas, {
      button: 0,
      pointerId: 3,
      pointerType: "pen",
      pressure: 0.9,
      tiltX: 24,
      tiltY: 15,
      clientX: 120,
      clientY: 56,
      timeStamp: 124,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      pointerId: 3,
      pointerType: "pen",
      pressure: 0.12,
      clientX: 120,
      clientY: 56,
      timeStamp: 140,
    });

    const status = screen.getByTestId("studio-brush-live-pad-status");
    expect(status.textContent).toContain("필압 90%");
    expect(status.textContent).toContain("기울기");
    expect(status.textContent).toContain("도장");

    fireEvent.click(screen.getByTestId("studio-brush-live-pad-clear"));
    expect(status.textContent).toContain("패드가 비었습니다");

    fireEvent.click(screen.getByTestId("studio-brush-live-pad-sample"));
    expect(status.textContent).toContain("직접 그어 필압");
  });

  it("밝은 종이·어두운 종이 배경 전환과 44px 터치 타깃을 만족한다", () => {
    const { container } = render(
      <StudioBrushLiveTestPad
        settings={studioBrushDynamicsPresetSettings("dry-media")}
        strokeWidth={12}
        color="#1d3557"
      />,
    );

    const lightBtn = screen.getByTestId("studio-brush-live-pad-paper-light");
    const darkBtn = screen.getByTestId("studio-brush-live-pad-paper-dark");
    expect(darkBtn.getAttribute("aria-pressed")).toBe("true");
    expect(lightBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(lightBtn);
    expect(lightBtn.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-paper-tone="light"]')).not.toBeNull();

    for (const button of container.querySelectorAll<HTMLButtonElement>("button")) {
      expect(button.className).toContain("min-h-11");
    }
  });
});
