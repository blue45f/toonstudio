// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPuppetWarpPanel } from "../StudioPuppetWarpPanel";

describe("StudioPuppetWarpPanel AC-003 Simple/Pro Mode Accessibility", () => {
  afterEach(cleanup);

  it("switches smoothly between Simple beginner checklist and Pro pin coordinate/displacement view", () => {
    const onToggle = vi.fn();
    const onRemovePin = vi.fn();
    const onResetPositions = vi.fn();
    const onApply = vi.fn();
    const onCancel = vi.fn();

    render(
      <StudioPuppetWarpPanel
        active
        canApply
        pins={[
          { id: "pin-1", restX: 100, restY: 120, x: 130, y: 160 },
          { id: "pin-2", restX: 200, restY: 220, x: 200, y: 220 },
        ]}
        onToggle={onToggle}
        onRemovePin={onRemovePin}
        onResetPositions={onResetPositions}
        onApply={onApply}
        onCancel={onCancel}
      />,
    );

    // Default Simple mode shows 3-step guide and friendly labels
    expect(screen.getByText("1. 관절 핀 찍기")).toBeTruthy();
    expect(screen.getByText("이동됨")).toBeTruthy();

    // Switch to Pro mode -> shows exact coordinates & displacement delta
    fireEvent.click(screen.getByRole("radio", { name: "전문 모드" }));
    expect(screen.getByText("130, 160 (Δ50px)")).toBeTruthy();
    expect(screen.getByText("200, 220 (고정)")).toBeTruthy();

    // Pin deletion, reset, apply, cancel callbacks work
    fireEvent.click(screen.getByRole("button", { name: "핀 1 삭제" }));
    expect(onRemovePin).toHaveBeenCalledWith("pin-1");

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(onResetPositions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(onApply).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
