// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioBg3dLensShiftControls,
  type StudioBg3dLensShiftControlsProps,
} from "./StudioBg3dLensShiftControls";

afterEach(cleanup);

function renderControls(overrides: Partial<StudioBg3dLensShiftControlsProps> = {}) {
  const handlers = {
    onPreviewShift: vi.fn(),
    onFinishShift: vi.fn(),
    onResetShift: vi.fn(),
    onApplyTwoPointPerspective: vi.fn(),
  };
  const view = render(
    <StudioBg3dLensShiftControls
      lensShift={[0.3, -0.6]}
      disabled={false}
      twoPointPerspectiveActive={false}
      {...handlers}
      {...overrides}
    />,
  );
  return { ...handlers, ...view };
}

function slider(id: "bg3d-lens-shift-x" | "bg3d-lens-shift-y"): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

describe("StudioBg3dLensShiftControls", () => {
  it("shows the stored horizontal and vertical shift on two sliders with the document limit", () => {
    renderControls();
    const x = slider("bg3d-lens-shift-x");
    const y = slider("bg3d-lens-shift-y");
    expect(Number(x.value)).toBeCloseTo(0.3, 10);
    expect(Number(y.value)).toBeCloseTo(-0.6, 10);
    for (const input of [x, y]) {
      expect(input.type).toBe("range");
      expect(input.min).toBe("-2");
      expect(input.max).toBe("2");
      expect(input.step).toBe("0.01");
    }
    expect(x.getAttribute("aria-valuetext")).toBe("+0.30");
    expect(y.getAttribute("aria-valuetext")).toBe("−0.60");
    expect(screen.getByText("가로 시프트")).toBeTruthy();
    expect(screen.getByText("세로 시프트")).toBeTruthy();
    expect(screen.getByRole("group", { name: "렌즈 시프트" })).toBeTruthy();
  });

  it("reports a horizontal change with the vertical value kept, and the reverse", () => {
    const { onPreviewShift } = renderControls();
    fireEvent.change(slider("bg3d-lens-shift-x"), { target: { value: "0.45" } });
    expect(onPreviewShift).toHaveBeenLastCalledWith([0.45, -0.6]);
    fireEvent.change(slider("bg3d-lens-shift-y"), { target: { value: "1.2" } });
    expect(onPreviewShift).toHaveBeenLastCalledWith([0.3, 1.2]);
    expect(onPreviewShift).toHaveBeenCalledTimes(2);
  });

  it("treats a missing shift as zero on both axes", () => {
    const { onPreviewShift } = renderControls({ lensShift: undefined });
    expect(Number(slider("bg3d-lens-shift-x").value)).toBe(0);
    expect(Number(slider("bg3d-lens-shift-y").value)).toBe(0);
    fireEvent.change(slider("bg3d-lens-shift-y"), { target: { value: "-0.25" } });
    expect(onPreviewShift).toHaveBeenLastCalledWith([0, -0.25]);
  });

  it("ends one adjustment on key release, blur and pointer release", () => {
    const { onFinishShift } = renderControls();
    const x = slider("bg3d-lens-shift-x");
    fireEvent.keyUp(x, { key: "ArrowRight" });
    fireEvent.blur(x);
    fireEvent.pointerUp(slider("bg3d-lens-shift-y"));
    expect(onFinishShift).toHaveBeenCalledTimes(3);
  });

  it("resets both axes only when a shift is set", () => {
    const { onResetShift, rerender } = renderControls();
    const reset = screen.getByRole("button", { name: "시프트 초기화" }) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    expect(onResetShift).toHaveBeenCalledTimes(1);

    rerender(
      <StudioBg3dLensShiftControls
        lensShift={[0, 0]}
        disabled={false}
        twoPointPerspectiveActive={false}
        onPreviewShift={vi.fn()}
        onFinishShift={vi.fn()}
        onResetShift={onResetShift}
        onApplyTwoPointPerspective={vi.fn()}
      />,
    );
    expect((screen.getByRole("button", { name: "시프트 초기화" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the two-point perspective button and exposes its active state", () => {
    const { onApplyTwoPointPerspective } = renderControls({ twoPointPerspectiveActive: true });
    const button = screen.getByRole("button", { name: "2점 투시 보정" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(onApplyTwoPointPerspective).toHaveBeenCalledTimes(1);
  });

  it("locks every control while the editor cannot take camera edits", () => {
    renderControls({ disabled: true });
    expect(slider("bg3d-lens-shift-x").disabled).toBe(true);
    expect(slider("bg3d-lens-shift-y").disabled).toBe(true);
    expect((screen.getByRole("button", { name: "2점 투시 보정" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "시프트 초기화" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("tells authors which way a positive value moves the scene", () => {
    renderControls();
    expect(
      screen.getByText(/\+값은 장면이 화면에서 가로로는 왼쪽, 세로로는 위쪽으로 이동합니다/),
    ).toBeTruthy();
  });
});
