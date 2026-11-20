// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPressureCurveGraph } from "../StudioPressureCurveGraph";

function renderPressureCurve(onPressureCurveChange = vi.fn<(value: number) => void>()) {
  const view = render(
    <StudioPressureCurveGraph
      pressureCurve={1}
      onPressureCurveChange={onPressureCurveChange}
      pressureMinSize={0.25}
    />
  );
  return { onPressureCurveChange, view };
}

function stubCurveGeometry(svg: SVGSVGElement): void {
  svg.getBoundingClientRect = () =>
    ({
      bottom: 88,
      height: 88,
      left: 0,
      right: 160,
      toJSON: () => ({}),
      top: 0,
      width: 160,
      x: 0,
      y: 0,
    }) as DOMRect;
}

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.removeItem("toonstudio:colordrop-settings:v1");
  cleanup();
});

describe("StudioPressureCurveGraph interaction", () => {
  it("maps keyboard directions to visible curve output rather than inverted gamma numbers", () => {
    const { onPressureCurveChange } = renderPressureCurve();
    const handle = screen.getByRole("slider", { name: "필압 곡선 제어점" });

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "Home" });
    fireEvent.keyDown(handle, { key: "End" });

    expect(onPressureCurveChange.mock.calls).toEqual([
      [0.95],
      [0.95],
      [1.05],
      [1.05],
      [2.5],
      [0.35],
    ]);
  });

  it("converts a dragged mid-pressure output back into the compatible scalar exponent", () => {
    const { onPressureCurveChange, view } = renderPressureCurve();
    const handle = screen.getByRole("slider", { name: "필압 곡선 제어점" });
    const svg = view.container.querySelector<SVGSVGElement>(
      'svg[data-studio-pressure-curve-chart="true"]'
    );
    expect(svg).not.toBeNull();
    stubCurveGeometry(svg!);

    // Mid-pressure input x=0.5, output y=0.75 (22px from the top of an 88px chart).
    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 80,
      clientY: 22,
      pointerId: 7,
    });

    expect(onPressureCurveChange).toHaveBeenCalledTimes(1);
    expect(onPressureCurveChange.mock.calls[0]?.[0]).toBeCloseTo(
      Math.log(0.75) / Math.log(0.5),
      5
    );
  });

  it("leaves secondary and barrel-button contacts available to context actions", () => {
    const { onPressureCurveChange } = renderPressureCurve();
    const handle = screen.getByRole("slider", { name: "필압 곡선 제어점" });

    fireEvent.pointerDown(handle, {
      button: 2,
      clientX: 80,
      clientY: 22,
      pointerId: 9,
    });

    expect(onPressureCurveChange).not.toHaveBeenCalled();
  });

  it("6점 단조 스플라인 제어점 추가·삭제·속성 탭 전환 및 베지어 프리셋을 지원한다", () => {
    const { onPressureCurveChange } = renderPressureCurve();

    // 속성 탭 전환 (전역 → 크기 → 불투명도 → 유량 → 번짐)
    const sizeTab = screen.getByRole("tab", { name: "크기" });
    fireEvent.click(sizeTab);
    expect(sizeTab.getAttribute("aria-selected")).toBe("true");

    // 제어점 추가 (최대 6개까지)
    const addBtn = screen.getByTestId("studio-pressure-add-point");
    for (let i = 0; i < 6; i += 1) {
      fireEvent.click(addBtn);
    }
    expect(addBtn.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("slider", { name: "스플라인 제어점 1" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "스플라인 제어점 6" })).toBeTruthy();

    // 선택한 제어점 삭제
    const point1 = screen.getByRole("slider", { name: "스플라인 제어점 1" });
    fireEvent.focus(point1);
    fireEvent.click(screen.getByTestId("studio-pressure-remove-point"));
    expect(addBtn.hasAttribute("disabled")).toBe(false);

    // 전역 탭으로 돌아와 베지어 프리셋(단단한 G펜) 적용 시 스칼라 감마도 연동된다
    fireEvent.click(screen.getByRole("tab", { name: "전역" }));
    fireEvent.click(screen.getByRole("button", { name: "단단한 G펜" }));
    expect(onPressureCurveChange).toHaveBeenCalled();
  });

  it("시험선 기반 스플라인 자동 피팅과 ColorDrop 450ms 임계값 스크럽이 동작한다", () => {
    const { onPressureCurveChange, view } = renderPressureCurve();

    const testPad = view.container.querySelector<SVGSVGElement>(
      'svg[data-studio-pressure-test-pad="true"]',
    );
    expect(testPad).not.toBeNull();
    testPad!.getBoundingClientRect = () =>
      ({
        bottom: 78,
        height: 78,
        left: 0,
        right: 320,
        toJSON: () => ({}),
        top: 0,
        width: 320,
        x: 0,
        y: 0,
      }) as DOMRect;

    // 14개 다양한 필압 샘플로 시험선 입력
    fireEvent.pointerDown(testPad!, {
      button: 0,
      pointerId: 5,
      pointerType: "pen",
      pressure: 0.08,
      clientX: 10,
      clientY: 40,
    });
    for (let i = 1; i <= 13; i += 1) {
      fireEvent.pointerMove(testPad!, {
        button: 0,
        pointerId: 5,
        pointerType: "pen",
        pressure: 0.08 + i * 0.068,
        clientX: 10 + i * 22,
        clientY: 40,
      });
    }
    fireEvent.pointerUp(testPad!, {
      button: 0,
      pointerId: 5,
      pointerType: "pen",
      pressure: 0.96,
      clientX: 296,
      clientY: 40,
    });

    const fitBtn = screen.getByTestId("studio-pressure-spline-fit-btn");
    expect(fitBtn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(fitBtn);
    expect(onPressureCurveChange).toHaveBeenCalled();

    // ColorDrop 450ms 홀드 & 좌우 스크럽 테스트
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));
    const scrubPad = screen.getByTestId("studio-colordrop-scrub-pad");
    fireEvent.pointerDown(scrubPad, { button: 0, pointerId: 11, clientX: 100, clientY: 20 });
    expect(scrubPad.getAttribute("data-colordrop-phase")).toBe("holding");

    act(() => {
      vi.advanceTimersByTime(460);
    });
    expect(scrubPad.getAttribute("data-colordrop-phase")).toBe("scrubbing");

    fireEvent.pointerMove(scrubPad, { button: 0, pointerId: 11, clientX: 150, clientY: 20 });
    fireEvent.pointerUp(scrubPad, { button: 0, pointerId: 11, clientX: 150, clientY: 20 });
    expect(scrubPad.textContent).toContain("60%");
    expect(window.localStorage.getItem("toonstudio:colordrop-settings:v1")).toContain('"thresholdPercent":60');
  });
});
