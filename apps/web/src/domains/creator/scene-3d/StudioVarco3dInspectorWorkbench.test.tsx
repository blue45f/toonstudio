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

  it("switches to TextureEdit mode and updates PBR channels, [ / ] ±1px brush size, bump sculpting, and MapAdjust green-Y flip", () => {
    render(<StudioVarco3dInspectorWorkbench />);

    fireEvent.click(screen.getByTestId("varco3d-studio-mode-TextureEdit"));
    expect(screen.getByTestId("varco3d-workbench-panel-texture-edit")).toBeTruthy();

    // Test [ and ] keyboard shortcuts in TextureEdit mode (±1px from default 12px)
    expect(screen.getByTestId("varco3d-pbr-brush-size-readout").textContent).toContain("12px");
    fireEvent.keyDown(window, { key: "]" });
    expect(screen.getByTestId("varco3d-pbr-brush-size-readout").textContent).toContain("13px");
    fireEvent.keyDown(window, { key: "[" });
    expect(screen.getByTestId("varco3d-pbr-brush-size-readout").textContent).toContain("12px");

    // Bump sculpting raise / carve toggle
    expect(screen.getByTestId("varco3d-bump-hex-readout").textContent).toContain("#bfbfbf");
    fireEvent.click(screen.getByTestId("varco3d-bump-dir-carve"));
    expect(screen.getByTestId("varco3d-bump-hex-readout").textContent).toContain("#404040");

    // MapAdjust normal Green-Y flip
    fireEvent.click(screen.getByTestId("varco3d-pbr-channel-normal"));
    const beforeRgb = screen.getByTestId("varco3d-map-adjust-rgb").textContent;
    fireEvent.click(screen.getByTestId("varco3d-map-adjust-invert-checkbox"));
    const afterRgb = screen.getByTestId("varco3d-map-adjust-rgb").textContent;
    expect(afterRgb).not.toBe(beforeRgb);

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

  it("switches across Part, Animation, and Comparer modes and updates Remesh/AI Unwrap, DCC Bridge, and DAG pipeline accordions", () => {
    render(<StudioVarco3dInspectorWorkbench />);

    // Part mode
    fireEvent.click(screen.getByTestId("varco3d-studio-mode-Part"));
    expect(screen.getByTestId("varco3d-part-vertex-count").textContent).toBe("3개");
    fireEvent.click(screen.getByTestId("varco3d-part-toggle-faces"));
    expect(screen.getByTestId("varco3d-part-vertex-count").textContent).toBe("4개");

    // Animation mode (with findBestTrackingBone readout)
    fireEvent.click(screen.getByTestId("varco3d-studio-mode-Animation"));
    expect(screen.getByTestId("varco3d-workbench-panel-animation")).toBeTruthy();
    expect(screen.getByTestId("varco3d-best-tracking-bone").textContent).toBe("mixamorig:Hips");
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

    // Pipeline accordion: Remesh (5K~100K), AI Unwrap (50K->20K), PivotToBottom, DCC Bridge (5324..5328), Slicers, DAG
    fireEvent.click(screen.getByTestId("varco3d-remesh-preset-10000"));
    expect(screen.getByTestId("varco3d-remesh-readout").textContent).toContain("10,000");
    expect(screen.getByTestId("varco3d-unwrap-plan-readout").textContent).toContain("20,000");
    expect(screen.getByTestId("varco3d-dcc-port-5324")).toBeTruthy();
    expect(screen.getByTestId("varco3d-dcc-port-5328")).toBeTruthy();
    expect(screen.getByTestId("varco3d-slicer-uri-readout").textContent).toContain(
      "bambustudioopen://",
    );
    expect(screen.getByTestId("varco3d-dag-first-edge-path").textContent).toContain("M124,40 C");

    // CustomWorkflow V2 connection validation (Rig -> Animate OK, Generate3D -> Animate blocked)
    expect(screen.getByTestId("varco3d-wf-connection-readout").textContent).toContain("연결 가능");
    fireEvent.click(screen.getByTestId("varco3d-wf-src-Generate3D"));
    expect(screen.getByTestId("varco3d-wf-connection-readout").textContent).toContain(
      "Animate requires a rigged 3D",
    );

    // Generate3D alpha preflight & MCP Bridge v2 backoff
    expect(screen.getByTestId("varco3d-preflight-readout").textContent).toContain("통과");
    fireEvent.click(screen.getByTestId("varco3d-preflight-has-transparency"));
    expect(screen.getByTestId("varco3d-preflight-readout").textContent).toContain(
      "error.transparentImageRequired",
    );
    expect(screen.getByTestId("varco3d-mcp-backoff-readout").textContent).toContain(
      "2s → 4s → 8s → 16s → 30s",
    );

    // UV ORM channel navigation, AR Scene Viewer links, and motion family classifier
    expect(screen.getByTestId("varco3d-uv-active-mode").textContent).toBe("baseColor");
    fireEvent.click(screen.getByTestId("varco3d-uv-step-right"));
    expect(screen.getByTestId("varco3d-uv-active-mode").textContent).toBe("normal");
    expect(screen.getByTestId("varco3d-ar-usdz-url").textContent).toContain("/api/usdz?taskId=");
    expect(screen.getByTestId("varco3d-ar-android-url").textContent).toContain(
      "intent://arvr.google.com/scene-viewer/1.0",
    );

    fireEvent.click(screen.getByTestId("varco3d-motion-sample-dog_gallop_left_lead_looping"));
    expect(screen.getByTestId("varco3d-motion-family-readout").textContent).toContain("quadruped");

    // Character Labs modular coordinator, 4-view turnaround sheet, and 3D background diorama
    expect(screen.getByTestId("varco3d-hdri-sphere-swatch-lebombo")).toBeTruthy();
    expect(screen.getByTestId("varco3d-hdri-sphere-swatch-venice_sunset")).toBeTruthy();
    expect(screen.getByTestId("varco3d-hdri-sphere-swatch-studio_small")).toBeTruthy();
    expect(screen.getByTestId("varco3d-hdri-sphere-swatch-daylight")).toBeTruthy();
    expect(screen.getByTestId("varco3d-turnaround-2x2-minigrid")).toBeTruthy();
    expect(screen.getByTestId("varco3d-charlab-loadout-readout").textContent).toContain("100%");
    expect(screen.getByTestId("varco3d-turnaround-view-url").textContent).toContain(
      "https://3d.varco.ai/api/objects/741a9a3f7fdef6f86c574d3f000b8d20.png",
    );
    fireEvent.click(screen.getByTestId("varco3d-turnaround-angle-back"));
    expect(screen.getByTestId("varco3d-turnaround-view-url").textContent).toContain(
      "https://3d.varco.ai/api/objects/dde18bc5536fb96025dbd6fa43ac068f.png",
    );
    fireEvent.change(screen.getByTestId("varco3d-diorama-select"), {
      target: { value: "diorama_school_hallway" },
    });
    expect(screen.getByTestId("varco3d-diorama-portal-url").textContent).toBe(
      "https://3d.varco.ai/myAssets/0c2f14f6-5dc3-4fba-9d2c-691cb6b779e0",
    );

    // CharacterCanonicalPartDescriptor bridge, 12-view PBR ring, 598-motion retargeting & point policy
    expect(screen.getByTestId("varco3d-canonical-part-readout").textContent).toContain(
      "skinned-transplant",
    );
    fireEvent.click(screen.getByTestId("varco3d-12view-family-mvOrm"));
    fireEvent.click(screen.getByTestId("varco3d-12view-angle-back2"));
    expect(screen.getByTestId("varco3d-12view-stage-readout").textContent).toContain(
      "pipeline:orm-multiview-generator",
    );
    expect(screen.getByTestId("varco3d-12view-stage-readout").textContent).toContain("#8");

    fireEvent.change(screen.getByTestId("varco3d-retargeted-motion-select"), {
      target: { value: "559118f7-f8eb-483f-a266-ca4bf170872f" },
    });
    fireEvent.change(screen.getByTestId("varco3d-point-policy-select"), {
      target: { value: "task:GENERATE_TEXTURED_MESH" },
    });
    expect(screen.getByTestId("varco3d-retargeted-policy-readout").textContent).toContain(
      "sprint",
    );
    expect(screen.getByTestId("varco3d-retargeted-policy-readout").textContent).toContain(
      "INSUFFICIENT_POINT",
    );

    // Zero-point optimization task selector & prop toggle
    fireEvent.change(screen.getByTestId("varco3d-zeropoint-task-select"), {
      target: { value: "521dbca5-de66-4da9-aa03-64b0030e2715" },
    });
    expect(screen.getByTestId("varco3d-zeropoint-task-readout").textContent).toContain("PBR");
    fireEvent.click(screen.getByTestId("varco3d-prop-toggle-prop_cafe_table_set"));
    expect(screen.getByTestId("varco3d-diorama-plan-readout").textContent).toContain("㎡");
  });
});

