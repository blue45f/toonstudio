// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioContextMiniDock } from "./StudioContextMiniDock";

afterEach(cleanup);

describe("StudioContextMiniDock", () => {
  it("펜 모드에서 두께·농도 스크러버와 보정·대칭·퀵 휠 컨트롤을 5~7개 이내로 표시한다", () => {
    const onStrokeWidthChange = vi.fn();
    const onOpacityPercentChange = vi.fn();
    const onOpenQuickWheel = vi.fn();

    render(
      <StudioContextMiniDock
        mode="pen"
        strokeWidth={12}
        onStrokeWidthChange={onStrokeWidthChange}
        opacityPercent={85}
        onOpacityPercentChange={onOpacityPercentChange}
        stabilizer={2}
        onCycleStabilizer={vi.fn()}
        symmetryActive={false}
        onToggleSymmetry={vi.fn()}
        onOpenQuickWheel={onOpenQuickWheel}
      />,
    );

    const toolbar = screen.getByRole("toolbar", { name: "상황 인식 미니 도구 독" });
    expect(toolbar.getAttribute("data-studio-context-mode")).toBe("pen");

    const sizeScrubber = screen.getByRole("slider", { name: "두께" });
    expect(sizeScrubber.getAttribute("aria-valuenow")).toBe("12");

    // 좌우 포인터 드래그 스크러빙(+30px / 3px = +10px)
    fireEvent.pointerDown(sizeScrubber, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(sizeScrubber, { pointerId: 1, clientX: 130 });
    expect(onStrokeWidthChange).toHaveBeenLastCalledWith(22);
    fireEvent.pointerUp(sizeScrubber, { pointerId: 1, clientX: 130 });

    // 키보드 Shift+Arrow로 빠른 단계 조절
    fireEvent.keyDown(sizeScrubber, { key: "ArrowRight", shiftKey: true });
    expect(onStrokeWidthChange).toHaveBeenLastCalledWith(22);

    const opacityScrubber = screen.getByRole("slider", { name: "농도" });
    fireEvent.keyDown(opacityScrubber, { key: "ArrowLeft" });
    expect(onOpacityPercentChange).toHaveBeenLastCalledWith(84);

    fireEvent.click(screen.getByRole("button", { name: /퀵 휠/ }));
    expect(onOpenQuickWheel).toHaveBeenCalledTimes(1);
  });

  it("지우개·말풍선·3D 모드 전환 시 해당 문맥 컨트롤만 표시한다", () => {
    const onReturnToPen = vi.fn();
    const { rerender } = render(
      <StudioContextMiniDock
        mode="eraser"
        strokeWidth={24}
        onStrokeWidthChange={vi.fn()}
        onReturnToPen={onReturnToPen}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "펜으로 복귀" }));
    expect(onReturnToPen).toHaveBeenCalledTimes(1);

    const onOpenBubblePicker = vi.fn();
    rerender(
      <StudioContextMiniDock
        mode="bubble"
        strokeWidth={12}
        onStrokeWidthChange={vi.fn()}
        onOpenBubblePicker={onOpenBubblePicker}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "말풍선 스타일" }));
    expect(onOpenBubblePicker).toHaveBeenCalledTimes(1);
  });
});
