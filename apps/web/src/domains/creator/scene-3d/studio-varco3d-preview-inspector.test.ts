import { describe, expect, it } from "vitest";

import {
  applyVarco3dLightingDialDrag,
  applyVarco3dLightingDialKeyDown,
  buildStudioVarco3dDccBridgePayload,
  buildStudioVarco3dLightingPopoverA11yProps,
  computeVarco3dAssetNormalization,
  createStudioVarco3dViewportHudState,
  createStudioVarco3dViewportPolicy,
  dispatchStudioVarco3dViewportShortcut,
  getAvailableVarco3dMapPreviewModes,
  lightingDialDegToRad,
  lightingRadToDialDeg,
  resolveStudioVarco3dCameraAndGrid,
  resolveStudioVarco3dMaterialUniforms,
  resolveVarco3dAxisSnapCameraPosition,
  STUDIO_VARCO3D_ENVIRONMENT_IDS,
  STUDIO_VARCO3D_ENVIRONMENTS,
  STUDIO_VARCO3D_LIGHTING_DIAL_TICK_ANGLES,
  STUDIO_VARCO3D_MAP_CHANNELS,
  toggleStudioVarco3dMapPreview,
  toggleStudioVarco3dViewMode,
} from "./studio-varco3d-preview-inspector";

describe("studio-varco3d-preview-inspector", () => {
  it("exposes VARCO 3D 4 HDRI environments and 24-tick (15°) lighting rotation dial constants", () => {
    expect(STUDIO_VARCO3D_ENVIRONMENT_IDS).toEqual([
      "lebombo",
      "venice_sunset",
      "studio_small",
      "daylight",
    ]);
    expect(STUDIO_VARCO3D_ENVIRONMENTS.studio_small.swatchGradientStops).toEqual([
      "#F2F5F6",
      "#6F7A82",
      "#12181F",
    ]);
    expect(STUDIO_VARCO3D_LIGHTING_DIAL_TICK_ANGLES).toHaveLength(24);
    expect(STUDIO_VARCO3D_LIGHTING_DIAL_TICK_ANGLES[0]).toBe(0);
    expect(STUDIO_VARCO3D_LIGHTING_DIAL_TICK_ANGLES[23]).toBe(345);
  });

  it("handles 360° LightingRotationDial drag and keyboard shortcuts while disabling auto-rotate", () => {
    const initial = createStudioVarco3dViewportHudState({
      lightingRotationRad: lightingDialDegToRad(350),
      isLightingAutoRotateOn: true,
    });

    const dragged = applyVarco3dLightingDialDrag(initial, 350, 25);
    expect(lightingRadToDialDeg(dragged.lightingRotationRad)).toBe(15);
    expect(dragged.isLightingAutoRotateOn).toBe(false);

    const arrowRight = applyVarco3dLightingDialKeyDown(dragged, "ArrowRight", false);
    expect(lightingRadToDialDeg(arrowRight.lightingRotationRad)).toBe(20);

    const shiftLeft = applyVarco3dLightingDialKeyDown(arrowRight, "ArrowLeft", true);
    expect(lightingRadToDialDeg(shiftLeft.lightingRotationRad)).toBe(5);

    const endKey = applyVarco3dLightingDialKeyDown(shiftLeft, "End");
    expect(lightingRadToDialDeg(endKey.lightingRotationRad)).toBe(359);

    const homeKey = applyVarco3dLightingDialKeyDown(endKey, "Home");
    expect(lightingRadToDialDeg(homeKey.lightingRotationRad)).toBe(0);
  });

  it("toggles PBR map channel preview via KeyM and switches channels via Digit1..Digit5", () => {
    const policy = createStudioVarco3dViewportPolicy({
      hasBaseColorMap: true,
      hasNormalMap: true,
      hasOrmMap: true,
      hasBones: true,
    });
    expect(getAvailableVarco3dMapPreviewModes(policy.mapPreview)).toEqual([
      "baseColor",
      "normal",
      "roughness",
      "metallic",
      "occlusion",
    ]);

    let state = createStudioVarco3dViewportHudState();
    expect(state.mapPreviewMode).toBeNull();

    // KeyM turns on map preview (defaults to baseColor)
    state = dispatchStudioVarco3dViewportShortcut(state, policy, "KeyM");
    expect(state.mapPreviewMode).toBe("baseColor");

    // Digit3 selects roughness (ORM G channel)
    state = dispatchStudioVarco3dViewportShortcut(state, policy, "Digit3");
    expect(state.mapPreviewMode).toBe("roughness");
    expect(state.preferredMapPreviewMode).toBe("roughness");

    // While map preview is active, KeyT is ignored (VARCO 3D priority rule), but KeyW still toggles wireframe
    state = dispatchStudioVarco3dViewportShortcut(state, policy, "KeyT");
    expect(state.isTextureOn).toBe(true);
    state = dispatchStudioVarco3dViewportShortcut(state, policy, "KeyW");
    expect(state.isWireframeOn).toBe(true);

    // KeyM turns off map preview; pressing KeyM again restores preferred channel ("roughness")
    state = toggleStudioVarco3dMapPreview(state, policy);
    expect(state.mapPreviewMode).toBeNull();
    state = toggleStudioVarco3dMapPreview(state, policy);
    expect(state.mapPreviewMode).toBe("roughness");
  });

  it("computes raw map channel masks and Matcap normal rotation matrix accurately", () => {
    const state = createStudioVarco3dViewportHudState({
      isTextureOn: false,
      isNormalMapOn: true,
      lightingRotationRad: Math.PI / 2,
    });
    const matcapUniforms = resolveStudioVarco3dMaterialUniforms(state);
    expect(matcapUniforms.pipeline).toBe("matcap-clay");
    expect(matcapUniforms.normalScale).toEqual([1, -1]);
    expect(matcapUniforms.matcapLightingRotationVec2[0]).toBeCloseTo(0, 5);
    expect(matcapUniforms.matcapLightingRotationVec2[1]).toBeCloseTo(1, 5);
    expect(matcapUniforms.matcapNormalRotationMat3).toEqual([0, 0, 1, 0, 1, 0, -1, 0, 0]);

    const metallicState = createStudioVarco3dViewportHudState({
      mapPreviewMode: "metallic",
    });
    const rawUniforms = resolveStudioVarco3dMaterialUniforms(metallicState);
    expect(rawUniforms.pipeline).toBe("raw-map");
    expect(rawUniforms.rawMapChannel?.channelMask).toEqual([0, 0, 1]);
    expect(STUDIO_VARCO3D_MAP_CHANNELS.roughness.channelMask).toEqual([0, 1, 0]);
    expect(STUDIO_VARCO3D_MAP_CHANNELS.occlusion.channelMask).toEqual([1, 0, 0]);
  });

  it("synchronizes fullscreen 0.85x camera framing and floor grid opacity", () => {
    const policy = createStudioVarco3dViewportPolicy();
    const normalState = createStudioVarco3dViewportHudState();
    const normalFraming = resolveStudioVarco3dCameraAndGrid(normalState);
    expect(normalFraming.gridTargetOpacity).toBe(0.3);
    expect(normalFraming.viewHelperVisible).toBe(true);
    expect(normalFraming.cameraPosition.z).toBe(3.3);

    const fullScreenState = toggleStudioVarco3dViewMode(normalState, policy, "fullScreen");
    const fullScreenFraming = resolveStudioVarco3dCameraAndGrid(fullScreenState);
    expect(fullScreenFraming.gridTargetOpacity).toBe(0);
    expect(fullScreenFraming.viewHelperVisible).toBe(false);
    expect(fullScreenFraming.cameraPosition.z).toBeCloseTo(3.3 * 0.85, 4);
  });

  it("normalizes bounding box with pivotToBottom and resolves ViewHelper 6-axis snap positions", () => {
    const normalized = computeVarco3dAssetNormalization(
      { x: -1, y: 2, z: -2 },
      { x: 3, y: 6, z: 2 },
      true,
    );
    expect(normalized.center).toEqual({ x: 1, y: 4, z: 0 });
    expect(normalized.size).toEqual({ x: 4, y: 4, z: 4 });
    // Center Y is 4, size Y is 4 => -4 + 2 = -2 shifts min.y (2) to y = 0
    expect(normalized.translationOffset).toEqual({ x: -1, y: -2, z: 0 });

    const snapPosX = resolveVarco3dAxisSnapCameraPosition("+x", 3.3, { x: 0, y: 0.5, z: 0 });
    expect(snapPosX).toEqual({ x: 3.3, y: 0.5, z: 0 });
  });

  it("builds modern-web-guidance compliant Popover/inert accessibility props and DCC bridge payloads", () => {
    const closedState = createStudioVarco3dViewportHudState({
      isLightingPopoverOpen: false,
      environmentId: "venice_sunset",
      lightingRotationRad: lightingDialDegToRad(135),
    });
    const a11y = buildStudioVarco3dLightingPopoverA11yProps(closedState);
    expect(a11y.popover).toBe("auto");
    expect(a11y.inert).toBe(true);
    expect(a11y.dialButtonProps["aria-valuenow"]).toBe(135);
    expect(a11y.dialButtonProps["aria-valuetext"]).toBe("135°");
    expect(a11y.previewImageProps.alt).toBe("");
    expect(a11y.dialRingSvgProps["aria-hidden"]).toBe("true");

    const bridgePayload = buildStudioVarco3dDccBridgePayload(closedState, "cd1e75d3-5efa", "unreal");
    expect(bridgePayload.format).toBe("fbx");
    expect(bridgePayload.lightingRotationDeg).toBe(135);
    expect(bridgePayload.pivotToBottom).toBe(true);
  });
});
