import { describe, expect, it } from "vitest";

import {
  applyShaperCameraPointerDelta,
  applyShaperLightingShortcut,
  computeShaperShaderUniforms,
  createDefaultShaperCameraViewState,
  createDefaultShaperShaderPipelineState,
  resetShaperCameraView,
  resolveShaperCameraPointerAction,
  SHAPER_RE_EVIDENCE_METADATA,
  toggleShaperLightSourceMode,
  toggleShaperShaderMode,
} from "./studio-vrm-shaper-shader-camera-controller";

describe("studio-vrm-shaper-shader-camera-controller", () => {
  it("preserves SHAPER v1.05 reverse-engineering metadata tokens", () => {
    expect(SHAPER_RE_EVIDENCE_METADATA.assemblySha256).toBe(
      "cfb9e2ad3aee04fe6a7beaf7e27d9ec69abc1bfd54e5adfd0fbfd4144e3c189d",
    );
    expect(SHAPER_RE_EVIDENCE_METADATA.materialDataToken).toBe("0x02000045");
    expect(SHAPER_RE_EVIDENCE_METADATA.settingManagerToken).toBe("0x02000054");
    expect(SHAPER_RE_EVIDENCE_METADATA.inputStyleToken).toBe("0x02000053");
    expect(SHAPER_RE_EVIDENCE_METADATA.cameraManagerToken).toBe("0x0200001c");
  });

  it("toggles between toonShade and modeling-matcap via [Space] and front/scene light via [F12]", () => {
    const initial = createDefaultShaperShaderPipelineState();
    expect(initial.shaderMode).toBe("toon");
    expect(initial.lightSourceMode).toBe("scene-directional");

    const spaceResult = applyShaperLightingShortcut(initial, {
      key: " ",
      code: "Space",
    });
    expect(spaceResult.handled).toBe(true);
    expect(spaceResult.command).toBe("toggle-shader-mode");
    expect(spaceResult.state.shaderMode).toBe("modeling-matcap");

    const matCapUniforms = computeShaperShaderUniforms(spaceResult.state);
    expect(matCapUniforms.shaderVariant).toBe("simpleDisableInlineMatCapShader");
    expect(matCapUniforms.matCapEnabled).toBe(true);
    expect(matCapUniforms.inlineOutlineDisabled).toBe(true);
    expect(matCapUniforms.outline.effectiveThickness).toBe(0);
    expect(matCapUniforms.rimLight.active).toBe(false);

    const toggledBack = toggleShaperShaderMode(spaceResult.state);
    expect(toggledBack.shaderMode).toBe("toon");

    const f12Result = applyShaperLightingShortcut(toggledBack, {
      key: "F12",
      code: "F12",
    });
    expect(f12Result.handled).toBe(true);
    expect(f12Result.command).toBe("toggle-light-source-mode");
    expect(f12Result.state.lightSourceMode).toBe("front");

    const frontUniforms = computeShaperShaderUniforms(f12Result.state);
    expect(frontUniforms.lightDirection).toEqual({ x: 0, y: 0, z: 1 });
    expect(toggleShaperLightSourceMode(f12Result.state).lightSourceMode).toBe(
      "scene-directional",
    );
  });

  it("rotates scene light angles with arrow keys and adjusts shadow/rim parameters with Alt/Shift+Alt", () => {
    const initial = createDefaultShaperShaderPipelineState({
      lightSourceMode: "front",
    });

    const rotated = applyShaperLightingShortcut(
      initial,
      { key: "ArrowRight" },
      { angleStepDeg: 10 },
    );
    expect(rotated.handled).toBe(true);
    expect(rotated.command).toBe("rotate-light-angle");
    expect(rotated.state.lightSourceMode).toBe("scene-directional");
    expect(rotated.state.material.lAY).toBe(-20);

    const pitched = applyShaperLightingShortcut(
      rotated.state,
      { key: "ArrowUp" },
      { angleStepDeg: 8 },
    );
    expect(pitched.state.material.lAX).toBe(30);

    const shadowShifted = applyShaperLightingShortcut(
      pitched.state,
      { key: "ArrowRight", altKey: true },
      { shadowLocationStep: 0.05 },
    );
    expect(shadowShifted.command).toBe("adjust-shadow-boundary");
    expect(shadowShifted.state.material.ssL).toBe(0.55);

    const featherAndRim = applyShaperLightingShortcut(
      shadowShifted.state,
      { key: "ArrowLeft", altKey: true, shiftKey: true },
      { shadowWidthStep: 0.02, rimStep: 0.04 },
    );
    expect(featherAndRim.command).toBe("adjust-shadow-feather-and-rim");
    expect(featherAndRim.state.material.ssW).toBe(0.06);
    expect(featherAndRim.state.material.rsW).toBe(0.02);
    expect(featherAndRim.state.material.rsL).toBe(0.76);

    const uniforms = computeShaperShaderUniforms(featherAndRim.state);
    const len = Math.hypot(
      uniforms.lightDirection.x,
      uniforms.lightDirection.y,
      uniforms.lightDirection.z,
    );
    expect(len).toBeCloseTo(1, 5);
    expect(uniforms.shadowRamp.threshold).toBe(0.55);
    expect(uniforms.shadowRamp.lowerEdge).toBe(0.52);
    expect(uniforms.shadowRamp.upperEdge).toBe(0.58);
  });

  it("maps Unity, Blender, and 3ds Max camera navigation styles accurately", () => {
    // 1. Unity: RightClick / Alt+LeftClick = Orbit, MiddleClick = Pan, Alt+RightClick / Wheel = Zoom
    expect(
      resolveShaperCameraPointerAction("unity", {
        button: 2,
        deltaX: 20,
        deltaY: -10,
      }).action,
    ).toBe("orbit");
    expect(
      resolveShaperCameraPointerAction("unity", {
        button: 0,
        altKey: true,
        deltaX: 10,
        deltaY: 5,
      }).action,
    ).toBe("orbit");
    expect(
      resolveShaperCameraPointerAction("unity", {
        button: 1,
        deltaX: 15,
        deltaY: 15,
      }).action,
    ).toBe("pan");
    expect(
      resolveShaperCameraPointerAction("unity", {
        button: 2,
        altKey: true,
        deltaY: -20,
      }).action,
    ).toBe("zoom");

    // 2. Blender: MiddleClick = Orbit, Shift+MiddleClick = Pan, Ctrl+MiddleClick = Zoom
    expect(
      resolveShaperCameraPointerAction("blender", {
        button: 1,
        deltaX: 12,
        deltaY: 8,
      }).action,
    ).toBe("orbit");
    expect(
      resolveShaperCameraPointerAction("blender", {
        button: 1,
        shiftKey: true,
        deltaX: 12,
        deltaY: 8,
      }).action,
    ).toBe("pan");
    expect(
      resolveShaperCameraPointerAction("blender", {
        button: 1,
        ctrlKey: true,
        deltaY: -25,
      }).action,
    ).toBe("zoom");

    // 3. 3ds Max: Alt+MiddleClick = Orbit, MiddleClick = Pan, Ctrl+Alt+MiddleClick = Zoom
    expect(
      resolveShaperCameraPointerAction("max", {
        button: 1,
        altKey: true,
        deltaX: 18,
        deltaY: -6,
      }).action,
    ).toBe("orbit");
    expect(
      resolveShaperCameraPointerAction("max", {
        button: 1,
        deltaX: 18,
        deltaY: -6,
      }).action,
    ).toBe("pan");
    expect(
      resolveShaperCameraPointerAction("max", {
        button: 1,
        altKey: true,
        ctrlKey: true,
        deltaY: -30,
      }).action,
    ).toBe("zoom");
  });

  it("updates camera view state and resets on [F5] resetShaperCameraView", () => {
    const start = createDefaultShaperCameraViewState();
    const orbited = applyShaperCameraPointerDelta(start, "blender", {
      button: 1,
      deltaX: 40,
      deltaY: -20,
    });
    expect(orbited.yawDeg).toBeGreaterThan(start.yawDeg);
    expect(orbited.pitchDeg).toBeGreaterThan(start.pitchDeg);

    const zoomed = applyShaperCameraPointerDelta(orbited, "blender", {
      button: 0,
      wheelDeltaY: -120,
    });
    expect(zoomed.distance).toBeLessThan(orbited.distance);

    const reset = resetShaperCameraView(zoomed);
    expect(reset).toEqual(start);
  });
});
