// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudioBg3dShaperTooningStudioPanel } from "../../bg3d/StudioBg3dShaperTooningStudioPanel";
import {
  applyTdCharacterStyleAcrossSceneCuts,
  applyTdSceneTemplateWithCharacterMapping,
  clampTdBoneValue,
  computeTdCameraCompositionTransform,
  createDefaultTdBodyBoneValues,
  evaluateTdBoneScaleMultipliers,
  setTdEyeGazeDirection,
  syncTdSymmetricExpression,
  TD_BONE_SLIDER_SPECS,
  TD_CAMERA_ANGLE_SPECS,
  TD_CAMERA_LENS_SPECS,
  TD_CAMERA_POSITION_SPECS,
  TD_ELEMENT_PRIMITIVES,
  TD_GAZE_GRID_3X3,
  TD_MEDIAPIPE_RETARGET_CONFIG,
  TD_SHOT_SIZE_SPECS,
  TD_STYLE_PART_CATEGORIES,
  TOONING_3D_ASSET_STORE_CATALOG,
  updateTdStylePartPreset,
  type TdFacialExpressionState,
} from "../studio-3d-tooning-plus-suite";

describe("Tooning 3D Studio (TD) & 3D Asset Store Engine", () => {
  it("defines all 21 bone transform sliders (-100 to +100), 7 style parts, 10 primitives, and 23 camera presets", () => {
    expect(TD_BONE_SLIDER_SPECS).toHaveLength(21);
    expect(TD_STYLE_PART_CATEGORIES).toHaveLength(7);
    expect(TD_ELEMENT_PRIMITIVES).toHaveLength(10);
    expect(TD_GAZE_GRID_3X3).toHaveLength(9);

    const totalCameraPresets =
      TD_SHOT_SIZE_SPECS.length +
      TD_CAMERA_ANGLE_SPECS.length +
      TD_CAMERA_POSITION_SPECS.length +
      TD_CAMERA_LENS_SPECS.length;
    expect(totalCameraPresets).toBe(23); // 7 + 5 + 8 + 3 = 23
    expect(TOONING_3D_ASSET_STORE_CATALOG.length).toBeGreaterThanOrEqual(5);
    expect(TD_MEDIAPIPE_RETARGET_CONFIG).toEqual({
      LANDMARK_Z_SCALE: 0.2,
      TORSO_HEMISPHERE_THRESHOLD: 0.2,
      QUATERNION_SLERP_FACTOR: 0.5,
    });
  });

  it("clamps bone values to [-100, +100] and computes exact scale multipliers", () => {
    expect(clampTdBoneValue(150)).toBe(100);
    expect(clampTdBoneValue(-180)).toBe(-100);

    const bones = {
      ...createDefaultTdBodyBoneValues(),
      shoulderWidth: 100,
      headSize: -100,
    };
    const scales = evaluateTdBoneScaleMultipliers(bones);
    expect(scales.shoulderWidth).toBe(1.35);
    expect(scales.headSize).toBe(0.65);
    expect(scales.neckLength).toBe(1);
  });

  it("handles symmetric/asymmetric 5-region facial expressions and linked/unlinked 3x3 eye gaze", () => {
    const baseState: TdFacialExpressionState = {
      isAsymmetric: true,
      leftEyebrowPreset: "a",
      leftEyebrowIntensity: 50,
      rightEyebrowPreset: "b",
      rightEyebrowIntensity: 60,
      leftEyePreset: "c",
      leftEyeIntensity: 70,
      rightEyePreset: "d",
      rightEyeIntensity: 80,
      mouthPreset: "e",
      mouthIntensity: 90,
      isDirectionLink: true,
      leftEyeGaze: "Center",
      rightEyeGaze: "Center",
    };

    const linkedGaze = setTdEyeGazeDirection(baseState, "left", "UpRight");
    expect(linkedGaze.leftEyeGaze).toBe("UpRight");
    expect(linkedGaze.rightEyeGaze).toBe("UpRight");

    const unlinkedGaze = setTdEyeGazeDirection(
      { ...baseState, isDirectionLink: false },
      "right",
      "DownLeft",
    );
    expect(unlinkedGaze.leftEyeGaze).toBe("Center");
    expect(unlinkedGaze.rightEyeGaze).toBe("DownLeft");

    const synced = syncTdSymmetricExpression(baseState, "eyebrow", "brow-angry", 95);
    expect(synced.leftEyebrowPreset).toBe("brow-angry");
    expect(synced.rightEyebrowPreset).toBe("brow-angry");
    expect(synced.leftEyebrowIntensity).toBe(95);
    expect(synced.rightEyebrowIntensity).toBe(95);
  });

  it("computes 3D world-space camera coordinates across ShotSize, Angle, Position, and Lens", () => {
    const telephotoClose = computeTdCameraCompositionTransform({
      shotSize: "ExtremeCloseUp",
      angle: "BirdEyesAngle",
      position: "Front",
      lens: "Telephoto",
      isLocked: true,
    });
    expect(telephotoClose.fovDeg).toBe(7);
    expect(telephotoClose.isLocked).toBe(true);
    expect(telephotoClose.cameraPositionWorld[1]).toBeGreaterThan(
      telephotoClose.lookAtTargetWorld[1],
    );

    const wideLow = computeTdCameraCompositionTransform({
      shotSize: "LongShot",
      angle: "WormsEyeAngle",
      position: "RightSide",
      lens: "WideAngle",
    });
    expect(wideLow.fovDeg).toBe(100);
    expect(wideLow.cameraPositionWorld[1]).toBeLessThan(wideLow.lookAtTargetWorld[1]);
  });

  it("preserves main color when isKeepMainColor is true and syncs character style/templates across cuts", () => {
    const kept = updateTdStylePartPreset(
      {
        partType: "HairFront",
        presetId: "hair-01",
        mainColorHex: "#112233",
        subColorHex: "#ffffff",
        isKeepMainColor: true,
      },
      "hair-02",
      "#999999",
    );
    expect(kept.mainColorHex).toBe("#112233");

    const replaced = updateTdStylePartPreset(
      { ...kept, isKeepMainColor: false },
      "hair-03",
      "#999999",
    );
    expect(replaced.mainColorHex).toBe("#999999");

    const cam = computeTdCameraCompositionTransform({
      shotSize: "BustShot",
      angle: "EyeLevelAngle",
      position: "Front",
      lens: "Standard",
    });

    const cuts = applyTdCharacterStyleAcrossSceneCuts(
      [
        {
          cutId: "c1",
          cutNumber: 1,
          storyboardContent: "컷 1",
          cutPrompt: "",
          aspectRatio: "9:16",
          camera: cam,
          lightType: "Directional",
          shadowMapSize: 4096,
          characters: [
            {
              characterId: "ch-1",
              characterName: "주인공",
              styleParts: [],
              bodyBones: createDefaultTdBodyBoneValues(),
              action: {
                animationType: "Pose",
                presetId: "pose-1",
                playTimePercent: 0,
                isPreserveCustomPose: true,
                webcamTrackingActive: false,
              },
              expression: {
                isAsymmetric: false,
                leftEyebrowPreset: "",
                leftEyebrowIntensity: 50,
                rightEyebrowPreset: "",
                rightEyebrowIntensity: 50,
                leftEyePreset: "",
                leftEyeIntensity: 50,
                rightEyePreset: "",
                rightEyeIntensity: 50,
                mouthPreset: "",
                mouthIntensity: 50,
                isDirectionLink: true,
                leftEyeGaze: "Center",
                rightEyeGaze: "Center",
              },
            },
          ],
        },
      ],
      "ch-1",
      [kept],
    );
    expect(cuts[0]?.characters[0]?.styleParts).toHaveLength(1);

    const templated = applyTdSceneTemplateWithCharacterMapping({
      cut: cuts[0]!,
      scope: "Both",
      templatePoseId: "pose-duel-99",
      templateCamera: cam,
      slotMap: { slotA: "ch-1" },
    });
    expect(templated.characters[0]?.action.presetId).toBe("pose-duel-99");
  });

  it("renders StudioBg3dShaperTooningStudioPanel with the integrated 3D Studio 5-tab inspector", () => {
    render(<StudioBg3dShaperTooningStudioPanel />);
    expect(screen.getByTestId("tooning-3d-studio-inspector-panel")).toBeTruthy();
    expect(screen.getByTestId("td-body-21-bones-tab")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /비대칭·시선/u }));
    expect(screen.getByTestId("td-asymmetric-expression-tab")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /23종 카메라/u }));
    expect(screen.getByTestId("td-camera-23-presets-tab")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /3D 에셋스토어/u }));
    expect(screen.getByTestId("td-3d-asset-store-tab")).toBeTruthy();
  });
});
