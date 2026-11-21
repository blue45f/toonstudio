// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dWallCutawayToggle } from "./StudioBg3dWallCutawayToggle";
import {
  DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
  evaluateCameraWallCutaway,
} from "./studio-bg3d-wall-cutaway-runtime";

afterEach(() => {
  cleanup();
});

describe("StudioBg3dWallCutawayToggle", () => {
  it("renders main cutaway switch, shadow preservation switch, and per-wall chips", () => {
    const onChange = vi.fn();
    const evaluation = evaluateCameraWallCutaway({
      camera: { position: [0, 3.6, 6] as const, target: [0, 1.2, 0] as const },
      room: { center: [0, 1.4, 0] as const, size: [8, 2.8, 6] as const },
      config: DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
    });

    render(
      <StudioBg3dWallCutawayToggle
        config={DEFAULT_BG3D_WALL_CUTAWAY_CONFIG}
        evaluation={evaluation}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("switch", { name: /카메라 앞벽 자동 투명화/u })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /외부 채광 그림자 유지/u })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("외부 채광 그림자 유지");

    const southChip = screen.getByRole("button", { name: /남벽 숨김 중/u });
    fireEvent.click(southChip);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        lockedVisibleWalls: ["south"],
      }),
    );
  });

  it("toggles exterior shadow preservation and resets manual overrides", () => {
    const onChange = vi.fn();
    render(
      <StudioBg3dWallCutawayToggle
        config={{
          ...DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
          forcedHiddenWalls: ["north"],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: /외부 채광 그림자 유지/u }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ preserveExteriorShadows: false }),
    );

    fireEvent.click(screen.getByRole("button", { name: /자동으로 복원/u }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ lockedVisibleWalls: [], forcedHiddenWalls: [] }),
    );
  });
});
