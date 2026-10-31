// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

import { StudioBg3dMatCapStudioPanel } from "./StudioBg3dMatCapStudioPanel";
import { StudioBg3dSceneCompositionPresetPanel } from "./StudioBg3dSceneCompositionPresetPanel";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

describe("StudioBg3dMatCapStudioPanel & CC0 2K Surface / Backdrop Pickers", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders stylized material presets and triggers onApplyShader", () => {
    const handleApply = vi.fn();
    render(<StudioBg3dMatCapStudioPanel onApplyShader={handleApply} />);

    expect(screen.getAllByText(/애니메이션/i).length).toBeGreaterThan(0);

    const chromeBtn = screen.getByText("미러");
    fireEvent.click(chromeBtn);

    expect(handleApply).toHaveBeenCalledTimes(1);
    expect(handleApply.mock.calls[0][0].id).toBe("metallic-chrome");
  });

  it("expands the 82 CC0 2K PBR surface material catalog, filters by category, and applies room kits and materials", () => {
    const handleCc0Material = vi.fn();
    render(
      <StudioBg3dMatCapStudioPanel applyReady onApplyCc0SurfaceMaterial={handleCc0Material} />,
    );

    const toggleBtn = screen.getByTestId("bg3d-cc0-surface-material-toggle");
    expect(toggleBtn.textContent).toContain("82종 열기");
    fireEvent.click(toggleBtn);

    // Apply classroom room kit
    const classroomKitBtn = screen.getByTestId("bg3d-cc0-room-kit-classroom_wood_plaster");
    fireEvent.click(classroomKitBtn);
    expect(handleCc0Material).toHaveBeenCalledTimes(1);
    expect(handleCc0Material.mock.calls[0][0].id).toBe("polyhaven-wood-floor");

    // Filter by brick-stone category and select brick_wall_001
    const brickCatBtn = screen.getByTestId("bg3d-cc0-surface-cat-brick-stone");
    fireEvent.click(brickCatBtn);
    const brickItemBtn = screen.getByTestId("bg3d-cc0-surface-item-polyhaven-brick-wall-001");
    fireEvent.click(brickItemBtn);
    expect(handleCc0Material).toHaveBeenCalledTimes(2);
    expect(handleCc0Material.mock.calls[1][0].id).toBe("polyhaven-brick-wall-001");
    expect(handleCc0Material.mock.calls[1][1]).toMatchObject({
      colorMode: "multiply",
      roughness: 0.86,
    });
  });

  it("renders 2K CC0 backdrop plate badges on genre scene presets and browses all 39 backdrop plates", () => {
    const handleApplyScenePack = vi.fn();
    render(
      <StudioBg3dSceneCompositionPresetPanel
        camera={DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera}
        lighting={DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.lighting}
        exposure={DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.render.exposure}
        onApplyScenePack={handleApplyScenePack}
      />,
    );

    expect(
      screen.getByTestId("bg3d-scene-pack-backdrop-romance-cafe-two-shot").textContent,
    ).toContain("2K");

    const toggleBackdropBtn = screen.getByTestId("bg3d-cc0-backdrop-plate-toggle");
    fireEvent.click(toggleBackdropBtn);

    const hansaplatzBtn = screen.getByTestId(
      "bg3d-cc0-backdrop-item-polyhaven-background-hansaplatz",
    );
    fireEvent.click(hansaplatzBtn);

    expect(handleApplyScenePack).toHaveBeenCalledTimes(1);
    expect(handleApplyScenePack.mock.calls[0][0].presetId).toBe(
      "polyhaven-background-hansaplatz",
    );
  });
});
