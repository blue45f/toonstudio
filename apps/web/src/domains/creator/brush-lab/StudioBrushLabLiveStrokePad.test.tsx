// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBrushLabLiveStrokePad } from "./StudioBrushLabLiveStrokePad";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioBrushLabLiveStrokePad", () => {
  it("기본 면도날 G펜 시연 획과 서브픽셀 품질 텔레메트리를 렌더링하고 4종 필감 프리셋을 전환한다", () => {
    render(<StudioBrushLabLiveStrokePad lang="ko" />);

    const pad = screen.getByTestId("brush-lab-live-stroke-pad");
    expect(pad).toBeTruthy();

    expect(screen.getByTestId("brush-lab-live-preset-razor-gpen").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("brush-lab-live-preset-soft-bleed-wash").getAttribute("aria-pressed")).toBe("false");

    const telemetry = screen.getByTestId("brush-lab-live-pad-telemetry");
    expect(telemetry.textContent).toContain("원시 샘플 11");
    expect(telemetry.textContent).toContain("보정 지연 2.6ms");

    fireEvent.click(screen.getByTestId("brush-lab-live-preset-soft-bleed-wash"));
    expect(screen.getByTestId("brush-lab-live-preset-soft-bleed-wash").getAttribute("aria-pressed")).toBe("true");
    expect(telemetry.textContent).toContain("보정 지연 3.4ms");

    fireEvent.click(screen.getByTestId("brush-lab-live-preset-cel-hard-shadow"));
    expect(screen.getByTestId("brush-lab-live-preset-cel-hard-shadow").getAttribute("aria-pressed")).toBe("true");
    expect(telemetry.textContent).toContain("보정 지연 2.9ms");

    fireEvent.click(screen.getByTestId("brush-lab-live-preset-romance-glow"));
    expect(screen.getByTestId("brush-lab-live-preset-romance-glow").getAttribute("aria-pressed")).toBe("true");
    expect(telemetry.textContent).toContain("보정 지연 3.1ms");
  });

  it("포인터 스트로크 입력·캔버스 지우기·시연 획 재생·두께 및 테이퍼 조절이 2D 컨텍스트 유무와 무관하게 동작한다", () => {
    const clearRect = vi.fn();
    const beginPath = vi.fn();
    const arc = vi.fn();
    const fill = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() =>
        ({
          clearRect,
          beginPath,
          arc,
          fill,
          fillStyle: "#000",
          globalAlpha: 1,
        }) as unknown as CanvasRenderingContext2D) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );

    render(<StudioBrushLabLiveStrokePad lang="ko" />);
    expect(clearRect).toHaveBeenCalled();
    expect(fill).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("brush-lab-live-pad-clear-btn"));
    expect(screen.getByTestId("brush-lab-live-pad-telemetry").textContent).toContain(
      "원시 샘플 0 → 정제 스탬프 0",
    );

    fireEvent.click(screen.getByLabelText("테스트 브러시 크기 키우기"));
    expect(screen.getByTestId("brush-lab-live-stroke-pad").textContent).toContain("12px");
    fireEvent.click(screen.getByLabelText("테스트 브러시 크기 줄이기"));
    expect(screen.getByTestId("brush-lab-live-stroke-pad").textContent).toContain("10px");

    fireEvent.click(screen.getByRole("button", { name: "75%" }));
    expect(screen.getByRole("button", { name: "75%" }).getAttribute("aria-pressed")).toBe("true");

    const canvas = screen.getByTestId("brush-lab-live-pad-canvas");
    fireEvent.pointerDown(canvas, { pointerId: 7, pointerType: "pen", pressure: 0.72, clientX: 40, clientY: 50, timeStamp: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 7, pointerType: "pen", pressure: 0.85, clientX: 110, clientY: 68, timeStamp: 116 });
    fireEvent.pointerMove(canvas, { pointerId: 7, pointerType: "pen", pressure: 0.24, clientX: 196, clientY: 42, timeStamp: 132 });
    fireEvent.pointerUp(canvas, { pointerId: 7, pointerType: "pen", pressure: 0.1, clientX: 196, clientY: 42, timeStamp: 140 });

    expect(screen.getByTestId("brush-lab-live-pad-telemetry").textContent).toContain("원시 샘플 3");

    fireEvent.click(screen.getByTestId("brush-lab-live-pad-replay-btn"));
    expect(screen.getByTestId("brush-lab-live-pad-telemetry").textContent).toContain("원시 샘플 11");
  });

  it("모든 조작 버튼이 44px(min-h-11) 터치 타깃을 만족하며 en 로케일에서 한글이 0글자다", () => {
    const { container } = render(<StudioBrushLabLiveStrokePad lang="en" />);

    expect(container.textContent).not.toMatch(/[가-힣]/u);
    for (const labeled of container.querySelectorAll<HTMLElement>("[aria-label]")) {
      expect(labeled.getAttribute("aria-label") ?? "").not.toMatch(/[가-힣]/u);
    }

    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons.length).toBeGreaterThanOrEqual(11);
    for (const button of buttons) {
      expect(button.className).toContain("min-h-11");
    }
  });
});
