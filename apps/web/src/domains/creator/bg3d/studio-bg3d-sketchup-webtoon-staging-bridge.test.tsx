// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioBg3dSketchUpWebtoonStagingSection } from "./StudioBg3dSketchUpWebtoonStagingSection";
import {
  buildDynamicComponentArticulatedPrimitives,
  buildSketchUpWebtoonSixPassLtRecipe,
  commitSketchUpDirectModelingToPrimitives,
  computeShadowPreservingRoomCutawayPlan,
  generateDynamicComponentActionShotSequence,
  panSketchUpTwoPointPerspectiveLockedCamera,
  resolveSketchUpStyleAndOutlinerPreset,
  resolveWebtoonSketchUpSolarRig,
} from "./studio-bg3d-sketchup-webtoon-staging-bridge";

describe("SketchUp 3D Background Webtoon Staging Bridge (REA Reverse-Engineered)", () => {
  it("commits Push/Pull through-hole wall opening, Offset frame, Follow-Me molding, and *N array to BgPrimitive[]", () => {
    const res = commitSketchUpDirectModelingToPrimitives({
      wallWidthMeters: 3.6,
      wallHeightMeters: 2.8,
      wallThicknessMeters: 0.22,
      openingWidthMeters: 1.4,
      openingHeightMeters: 1.3,
      sillHeightMeters: 0.85,
      frameOffsetMeters: 0.06,
      includeCrownMolding: true,
      axisLock: "red-x",
      arrayInputToken: "*2",
      arraySpanMeters: 3.8,
    });

    expect(res.meshTriangleCount).toBeGreaterThan(0);
    expect(res.MoldingQuadCount).toBeGreaterThan(0);
    expect(res.primitives.length).toBe(12);
    expect(res.axisLockColorHex).toBe("#ef4444");
  });

  it("locks camera pitch horizontal in Two-Point Perspective while panning vertical lensShiftY", () => {
    const panned = panSketchUpTwoPointPerspectiveLockedCamera(
      {
        position: [3.2, 1.65, 4.8],
        target: [0, 0.9, 0],
        up: [0, 1, 0],
        fovDegrees: 38,
        projection: "perspective",
        lensShift: [0, 0],
      },
      0.05,
      0.18,
    );

    expect(panned.target[1]).toBe(1.65);
    expect(panned.lensShift).toEqual([0.05, 0.18]);
  });

  it("hides camera-facing walls and ceiling while preserving exterior shadow casters", () => {
    const plan = computeShadowPreservingRoomCutawayPlan({
      cameraPosition: [3.8, 2.5, 5.2],
      roomCenter: [0, 1.5, 0],
      roomSize: [6, 3, 6],
      preserveExteriorShadows: true,
    });

    expect(plan.hiddenFromCameraWalls).toContain("south");
    expect(plan.hiddenFromCameraWalls).toContain("east");
    expect(plan.hiddenFromCameraWalls).toContain("ceiling");
    expect(plan.preservedShadowCasters).toEqual(plan.hiddenFromCameraWalls);
  });

  it("resolves Webtoon SketchUp solar shadow rig presets and style/outliner tag sets", () => {
    const solar = resolveWebtoonSketchUpSolarRig({
      presetId: "golden-hour-sunset",
      overrideShadowSoftness: 0.6,
    });
    expect(solar.solar.isDaytime).toBe(true);
    expect(solar.shadowSoftness).toBe(0.6);

    const styleOutliner = resolveSketchUpStyleAndOutlinerPreset(
      "hidden-line",
      "interior-clean-line",
    );
    expect(styleOutliner.resolvedStyle.line.enabled).toBe(true);
    expect(styleOutliner.tagPreset.hiddenTags).toContain("clutter-props");
  });

  it("articulates Dynamic Components and generates 3-cut door opening action sequences", () => {
    const prims = buildDynamicComponentArticulatedPrimitives({
      doorSwingAngleDeg: 90,
      windowSlideOffsetMeters: 0.5,
      drawerPullOffsetMeters: 0.3,
      ceilingLightSwitchOn: true,
    });
    expect(prims).toHaveLength(4);
    expect(prims[0]?.rotation[1]).toBe(-90);

    const shots = generateDynamicComponentActionShotSequence({
      tabId: "cut-door",
      labelKo: "문 열기",
      camera: {
        position: [2, 1.6, 4],
        target: [0, 1.6, 0],
        up: [0, 1, 0],
        fovDegrees: 40,
        projection: "perspective",
      },
      twoPointPerspectiveLocked: true,
      solarPresetId: "noon-clear",
      stylePresetId: "shaded-with-textures",
      tagPresetId: "interior-clean-line",
      preserveExteriorShadowsOnCutaway: true,
      dynamicComponents: {
        doorSwingAngleDeg: 0,
        windowSlideOffsetMeters: 0.4,
        drawerPullOffsetMeters: 0.2,
        ceilingLightSwitchOn: true,
      },
    });
    expect(shots).toHaveLength(3);
    expect(shots.map((s) => s.dynamicComponents.doorSwingAngleDeg)).toEqual([0, 45, 110]);
  });

  it("builds a non-exclusive 6-pass Webtoon LT layer stack recipe (color + tone + shadow + depth + lines)", () => {
    const recipe = buildSketchUpWebtoonSixPassLtRecipe();
    expect(recipe.map((r) => r.role)).toEqual([
      "color",
      "tone",
      "shadow",
      "depth",
      "texture-line",
      "main-line",
    ]);
  });

  it("renders StudioBg3dSketchUpWebtoonStagingSection and dispatches primitive/camera callbacks", () => {
    const onInsert = vi.fn();
    const onCamera = vi.fn();
    const onStatus = vi.fn();

    render(
      <StudioBg3dSketchUpWebtoonStagingSection
        onInsertScenePrimitives={onInsert}
        onApplySceneCamera={onCamera}
        onStatusChange={onStatus}
      />,
    );

    fireEvent.click(screen.getByTestId("sketchup-direct-modeling-commit-btn"));
    expect(onInsert).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("sketchup-two-point-apply-btn"));
    expect(onCamera).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("sketchup-dc-spawn-btn"));
    expect(onInsert).toHaveBeenCalledTimes(2);
  });
});
