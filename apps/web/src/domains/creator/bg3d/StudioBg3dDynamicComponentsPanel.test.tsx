// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

import { StudioBg3dDynamicComponentsPanel } from "./StudioBg3dDynamicComponentsPanel";

describe("StudioBg3dDynamicComponentsPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders with default door component and toggles open/close", () => {
    const handleApply = vi.fn();
    render(<StudioBg3dDynamicComponentsPanel onApplyComponentTransform={handleApply} />);

    expect(screen.getByText("다이나믹 인터랙션 컴포넌트")).toBeDefined();
    expect(screen.getByText("단일 여닫이문 (Door Swing)")).toBeDefined();

    // The button's only text IS the label, so `getByText` matched the <button> and its <span>
    // both. Query the control by role instead — that is also the thing the user actually clicks.
    const toggleBtn = screen.getByRole("button", { name: /닫힘 \(Closed\)/ });
    fireEvent.click(toggleBtn);

    expect(handleApply).toHaveBeenCalledTimes(1);
    expect(handleApply.mock.calls[0]?.[0]?.isOpen).toBe(true);
  });

  it("switches between the 4 webtoon SKP marketplace archetypes and applies cut direction presets and OnClick interactions", () => {
    const handleApplySingle = vi.fn();
    const handleApplyBatch = vi.fn();
    render(
      <StudioBg3dDynamicComponentsPanel
        onApplyComponentTransform={handleApplySingle}
        onApplyBatchComponentTransforms={handleApplyBatch}
      />,
    );

    // Verify all 4 canonical webtoon background archetypes are rendered
    expect(screen.getByRole("button", { name: /판타지 황실/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /현대 고등학교 교실/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /주인공 자취방/ })).toBeDefined();
    const tavernBtn = screen.getByRole("button", { name: /조선시대 저막/ });
    expect(tavernBtn).toBeDefined();

    // Select '조선시대 저막'
    fireEvent.click(tavernBtn);
    expect(handleApplyBatch).toHaveBeenCalledTimes(1);
    expect(handleApplyBatch.mock.calls[0]?.[1]?.archetypeId).toBe("joseon-dynasty-tavern");

    // Trigger a Cut Direction Preset ('심야 객주 내실 밀담 연출')
    const nightPresetBtn = screen.getByRole("button", { name: /심야 객주 내실 밀담 연출/ });
    fireEvent.click(nightPresetBtn);
    expect(handleApplyBatch).toHaveBeenCalledTimes(2);
    expect(handleApplyBatch.mock.calls[1]?.[1]?.preset?.id).toBe("night-secret-meeting");

    // Trigger an individual SketchUp OnClick button on the lift-up window (들창)
    const liftWindowOnClickBtn = screen.getByRole("button", {
      name: "대청 들어열개 들창 (갈고리 걸이) OnClick 조작",
    });
    fireEvent.click(liftWindowOnClickBtn);
    expect(handleApplySingle).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "tavern-lift-up-window",
        kind: "window-lift-up",
        isOpen: true,
        value: 1,
      }),
    );
  });
});
