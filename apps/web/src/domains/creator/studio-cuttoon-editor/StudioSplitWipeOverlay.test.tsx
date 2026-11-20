// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioSplitWipeOverlay } from "./StudioSplitWipeOverlay";

afterEach(cleanup);

describe("StudioSplitWipeOverlay", () => {
  it("비율에 따라 clip-path와 라벨 백분율을 렌더링한다", () => {
    const onRatioChange = vi.fn();
    const { container } = render(
      <StudioSplitWipeOverlay
        ratio={0.35}
        onRatioChange={onRatioChange}
        leftLabel="3D 원경"
        rightLabel="선화 추출"
        leftContent={<div>LEFT</div>}
        rightContent={<div>RIGHT</div>}
      />,
    );

    const leftLayer = container.querySelector<HTMLElement>('[data-studio-split-wipe-left="true"]');
    expect(leftLayer?.style.clipPath).toBe("inset(0 65.00% 0 0)");

    const slider = screen.getByRole("slider", { name: "3D 원경과 선화 추출 비교 분할선" });
    expect(slider.getAttribute("aria-valuenow")).toBe("35");
    expect(slider.getAttribute("aria-valuetext")).toBe("3D 원경 35%, 선화 추출 65%");
    expect(screen.getByText("3D 원경")).toBeTruthy();
    expect(screen.getByText("선화 추출")).toBeTruthy();
  });

  it("키보드 화살표·Shift·Home·End 및 더블클릭으로 분할 비율을 정밀 제어한다", () => {
    const onRatioChange = vi.fn();
    render(
      <StudioSplitWipeOverlay
        ratio={0.5}
        onRatioChange={onRatioChange}
        leftLabel="전"
        rightLabel="후"
        leftContent={<span>A</span>}
        rightContent={<span>B</span>}
        ariaLabel="비교 슬라이더"
      />,
    );

    const slider = screen.getByRole("slider", { name: "비교 슬라이더" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onRatioChange).toHaveBeenLastCalledWith(0.52);

    fireEvent.keyDown(slider, { key: "ArrowLeft", shiftKey: true });
    expect(onRatioChange).toHaveBeenLastCalledWith(0.4);

    fireEvent.keyDown(slider, { key: "Home" });
    expect(onRatioChange).toHaveBeenLastCalledWith(0);

    fireEvent.keyDown(slider, { key: "End" });
    expect(onRatioChange).toHaveBeenLastCalledWith(1);

    fireEvent.doubleClick(slider);
    expect(onRatioChange).toHaveBeenLastCalledWith(0.5);
  });

  it("포인터 드래그로 컨테이너 폭 대비 비율을 계산한다", () => {
    const onRatioChange = vi.fn();
    const { container } = render(
      <StudioSplitWipeOverlay
        ratio={0.5}
        onRatioChange={onRatioChange}
        leftLabel="원본"
        rightLabel="후보정"
        leftContent={<span>L</span>}
        rightContent={<span>R</span>}
      />,
    );

    const root = container.querySelector<HTMLElement>('[data-studio-split-wipe="true"]')!;
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 0,
      width: 400,
      height: 300,
      right: 500,
      bottom: 300,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });

    const slider = screen.getByRole("slider");
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 300 });
    expect(onRatioChange).toHaveBeenLastCalledWith(0.5);

    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 400 });
    expect(onRatioChange).toHaveBeenLastCalledWith(0.75);

    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 400 });
    expect(root.dataset.dragging).toBe("false");
  });
});
