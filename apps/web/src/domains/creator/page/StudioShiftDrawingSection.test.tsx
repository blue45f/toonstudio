// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioShiftDrawingSection } from "./StudioShiftDrawingSection";

afterEach(cleanup);

function openRootDisclosure(container: HTMLElement): void {
  const rootDetails = container.querySelector('details[data-studio-shift-drawing="true"]') as HTMLDetailsElement | null;
  if (rootDetails) rootDetails.open = true;
}

describe("StudioShiftDrawingSection", () => {
  it("기본 접힘 디스클로저(세로 스크롤 여백 벌리기·좁히기)를 열면 여백 추가 플랜과 캔버스 높이를 갱신한다", () => {
    const onApplyShiftPlan = vi.fn();
    const onCanvasHeightChange = vi.fn();
    const { container } = render(
      <StudioShiftDrawingSection
        canvasWidth={800}
        canvasHeight={2000}
        initialAnchorY={500}
        elements={[
          { id: "top-cut", name: "1컷", x: 0, y: 100, width: 800, height: 300 },
          { id: "straddle-bg", name: "연결 배경", x: 0, y: 420, width: 800, height: 300 },
          { id: "bottom-cut", name: "2컷", x: 0, y: 900, width: 800, height: 400 },
        ]}
        onApplyShiftPlan={onApplyShiftPlan}
        onCanvasHeightChange={onCanvasHeightChange}
      />,
    );

    const rootDetails = container.querySelector('details[data-studio-shift-drawing="true"]') as HTMLDetailsElement;
    expect(rootDetails.open).toBe(false);
    expect(screen.getByText("세로 스크롤 여백 벌리기·좁히기")).toBeDefined();

    openRootDisclosure(container);
    fireEvent.click(screen.getByRole("button", { name: "장면 전환 +600px" }));
    expect(screen.getByText("2000px → 2600px")).toBeDefined();
    expect(screen.getByText("이동 1개 · 걸침 1개")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "여백 추가 적용" }));
    expect(onApplyShiftPlan).toHaveBeenCalledTimes(1);
    expect(onCanvasHeightChange).toHaveBeenCalledWith(2600);
  });

  it("편집 콜백이 전혀 없으면 이유 안내와 함께 적용 버튼을 비활성화하여 무동작을 막는다", () => {
    const { container } = render(
      <StudioShiftDrawingSection
        canvasWidth={800}
        canvasHeight={1800}
        elements={[]}
      />,
    );
    openRootDisclosure(container);

    const applyBtn = screen.getByRole("button", { name: "여백 추가 적용" }) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    expect(applyBtn.title).toContain("적용할 페이지 편집 연결이 없어");
  });

  it("onCanvasHeightChange만 연결된 경우에도 여백 삭제 시 새 캔버스 높이를 전달한다", () => {
    const onCanvasHeightChange = vi.fn();
    const { container } = render(
      <StudioShiftDrawingSection
        canvasWidth={800}
        canvasHeight={1800}
        initialAnchorY={600}
        elements={[]}
        onCanvasHeightChange={onCanvasHeightChange}
      />,
    );
    openRootDisclosure(container);

    fireEvent.click(screen.getByRole("button", { name: /여백 삭제/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "여백 변화량" }), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByRole("button", { name: "여백 삭제 적용" }));
    expect(onCanvasHeightChange).toHaveBeenCalledWith(1550);
  });
});
