// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVarco3dInspectorWorkbench } from "./StudioVarco3dInspectorWorkbench";

afterEach(cleanup);

describe("StudioVarco3dInspectorWorkbench", () => {
  it("renders Normal mode by default and applies blended Webtoon Universe Shaper body sliders", () => {
    const onApplyMannequinBodySliders = vi.fn();
    render(
      <StudioVarco3dInspectorWorkbench
        onApplyMannequinBodySliders={onApplyMannequinBodySliders}
      />,
    );

    expect(screen.getByTestId("varco3d-workbench-panel-normal")).toBeTruthy();

    fireEvent.change(screen.getByTestId("varco3d-universe-blend-slider"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByTestId("varco3d-apply-shaper-to-mannequin"));

    expect(onApplyMannequinBodySliders).toHaveBeenCalledTimes(1);
    const applied = onApplyMannequinBodySliders.mock.calls[0]?.[0];
    expect(applied.heightCm).toBeGreaterThan(150);
    expect(applied.headCount).toBeGreaterThan(6);
  });

  it("switches to TextureEdit mode and updates PBR channels and brush hardness/strength", () => {
    render(<StudioVarco3dInspectorWorkbench />);

    fireEvent.click(screen.getByTestId("varco3d-studio-mode-TextureEdit"));
    expect(screen.getByTestId("varco3d-workbench-panel-texture-edit")).toBeTruthy();

    fireEvent.click(screen.getByTestId("varco3d-pbr-channel-restore"));
    expect(screen.getByTestId("varco3d-active-pbr-channel").textContent).toBe("restore");

    fireEvent.change(screen.getByTestId("varco3d-brush-strength-slider"), {
      target: { value: "85" },
    });
    expect(screen.getByTestId("varco3d-workbench-panel-texture-edit").textContent).toContain(
      "85%",
    );
  });

  it("switches to Rigging mode, strips mixamorig:/HandLoRA_ prefixes, renames bones, and handles [ / ] shortcuts", () => {
    render(<StudioVarco3dInspectorWorkbench />);

    fireEvent.click(screen.getByTestId("varco3d-studio-mode-Rigging"));
    expect(screen.getByTestId("varco3d-workbench-panel-rigging")).toBeTruthy();

    // Verify prefix sanitization
    expect(screen.getByTestId("varco3d-bone-item-LeftForeArm")).toBeTruthy();
    expect(screen.getByTestId("varco3d-bone-item-LeftThumb1")).toBeTruthy();

    // Test [ and ] keyboard shortcuts for weight brush size (default 20px)
    expect(screen.getByTestId("varco3d-weight-brush-size-readout").textContent).toBe("20px");
    fireEvent.keyDown(window, { key: "]" });
    expect(screen.getByTestId("varco3d-weight-brush-size-readout").textContent).toBe("22px");
    fireEvent.keyDown(window, { key: "[" });
    expect(screen.getByTestId("varco3d-weight-brush-size-readout").textContent).toBe("20px");

    // Rename selected bone
    fireEvent.change(screen.getByTestId("varco3d-bone-rename-input"), {
      target: { value: "ForeArm_Custom" },
    });
    fireEvent.click(screen.getByTestId("varco3d-bone-rename-submit"));
    expect(screen.getByTestId("varco3d-bone-item-ForeArm_Custom")).toBeTruthy();

    // Add child bone
    fireEvent.click(screen.getByTestId("varco3d-bone-add-child"));
    expect(screen.getByTestId("varco3d-bone-item-CustomBone_10")).toBeTruthy();
  });

  it("switches across Part, Animation, and Comparer modes and updates IK/Multiview states", () => {
    render(<StudioVarco3dInspectorWorkbench />);

    // Part mode
    fireEvent.click(screen.getByTestId("varco3d-studio-mode-Part"));
    expect(screen.getByTestId("varco3d-part-vertex-count").textContent).toBe("3개");
    fireEvent.click(screen.getByTestId("varco3d-part-toggle-faces"));
    expect(screen.getByTestId("varco3d-part-vertex-count").textContent).toBe("4개");

    // Animation mode
    fireEvent.click(screen.getByTestId("varco3d-studio-mode-Animation"));
    expect(screen.getByTestId("varco3d-workbench-panel-animation")).toBeTruthy();
    fireEvent.change(screen.getByTestId("varco3d-ik-target-y-slider"), {
      target: { value: "145" },
    });
    expect(screen.getByTestId("varco3d-ik-mid-pos").textContent).toContain("(");

    // Comparer mode
    fireEvent.click(screen.getByTestId("varco3d-studio-mode-Comparer"));
    expect(screen.getByTestId("varco3d-workbench-panel-comparer")).toBeTruthy();
    expect(screen.getByTestId("varco3d-multiview-slot-front")).toBeTruthy();
    expect(screen.getByTestId("varco3d-multiview-slot-left")).toBeTruthy();
    expect(screen.getByTestId("varco3d-multiview-slot-right")).toBeTruthy();
    expect(screen.getByTestId("varco3d-multiview-slot-back")).toBeTruthy();
  });
});
