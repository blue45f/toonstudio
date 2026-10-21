import { describe, expect, it } from "vitest";

import { getStudioBg3dHdriLightingPreset } from "./studio-bg3d-hdri-lighting-presets";
import {
  STUDIO_BG3D_SCENE_COMPOSITION_PRESETS,
  STUDIO_BG3D_SCENE_GENRES,
  applyStudioBg3dSceneCompositionPreset,
  getStudioBg3dSceneCompositionPreset,
  listStudioBg3dSceneCompositionPresets,
  resolveStudioBg3dSceneCompositionPreset,
  studioBg3dCameraPositionFromAngle,
  type StudioBg3dSceneCompositionApplyInput,
} from "./studio-bg3d-scene-composition-presets";

const BASE_INPUT: StudioBg3dSceneCompositionApplyInput = {
  camera: {
    position: [4, 3, 6],
    target: [0, 0.6, 0],
    fovDegrees: 50,
    projection: "perspective",
    zoom: 1,
  },
  lighting: getStudioBg3dHdriLightingPreset("daylight")!.lighting,
  exposure: 1,
};

describe("studio-bg3d-scene-composition-presets", () => {
  it("exposes frozen genre packs covering every genre and every HDRI lighting preset", () => {
    expect(Object.isFrozen(STUDIO_BG3D_SCENE_COMPOSITION_PRESETS)).toBe(true);
    expect(STUDIO_BG3D_SCENE_COMPOSITION_PRESETS.length).toBeGreaterThanOrEqual(8);

    const ids = STUDIO_BG3D_SCENE_COMPOSITION_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const genre of STUDIO_BG3D_SCENE_GENRES) {
      expect(
        STUDIO_BG3D_SCENE_COMPOSITION_PRESETS.some((preset) => preset.genreId === genre.id),
      ).toBe(true);
    }
    for (const preset of STUDIO_BG3D_SCENE_COMPOSITION_PRESETS) {
      expect(Object.isFrozen(preset)).toBe(true);
      expect(Object.isFrozen(preset.camera)).toBe(true);
      expect(Object.isFrozen(preset.thumbnail)).toBe(true);
      expect(preset.labelKo.length).toBeGreaterThan(0);
      expect(preset.labelEn.length).toBeGreaterThan(0);
      expect(preset.descriptionKo.length).toBeGreaterThan(0);
      expect(preset.descriptionEn.length).toBeGreaterThan(0);
      // 팩이 참조하는 조명 프리셋은 실제로 존재해야 적용이 가능하다.
      expect(getStudioBg3dHdriLightingPreset(preset.lightingPresetId)).toBeDefined();
      // 썸네일 각도와 실제 카메라 위치가 같은 방향을 가리켜야 한다.
      const expected = studioBg3dCameraPositionFromAngle({
        target: preset.camera.target,
        azimuthDeg: preset.thumbnail.azimuthDeg,
        elevationDeg: preset.thumbnail.elevationDeg,
        distance: preset.thumbnail.distance,
      });
      expect(preset.camera.position).toEqual(expected);
      expect(preset.camera.fovDegrees).toBeGreaterThanOrEqual(10);
      expect(preset.camera.fovDegrees).toBeLessThanOrEqual(120);
    }
  });

  it("filters packs by genre and returns all for null", () => {
    expect(listStudioBg3dSceneCompositionPresets(null)).toHaveLength(
      STUDIO_BG3D_SCENE_COMPOSITION_PRESETS.length,
    );
    const romance = listStudioBg3dSceneCompositionPresets("romance");
    expect(romance.length).toBeGreaterThan(0);
    expect(romance.every((preset) => preset.genreId === "romance")).toBe(true);
  });

  it("applies camera and lighting together in one call", () => {
    const preset = getStudioBg3dSceneCompositionPreset("thriller-corridor-dutch")!;
    const lightingPreset = getStudioBg3dHdriLightingPreset(preset.lightingPresetId)!;
    const result = applyStudioBg3dSceneCompositionPreset(BASE_INPUT, preset.id);

    expect(result?.presetId).toBe(preset.id);
    expect(result?.camera).toEqual(preset.camera);
    expect(result?.lighting).toEqual(lightingPreset.lighting);
    expect(result?.exposure).toBe(lightingPreset.exposure);
    expect(result?.weatherPresetId).toBe(lightingPreset.weatherPresetId);
    expect(result?.sunTimeHours).toBe(lightingPreset.sunTimeHours);
    // 더치팩은 기울어진 up을 실제로 실어 보낸다.
    expect(result?.camera.up?.[0]).not.toBe(0);
  });

  it("fails closed for unknown packs and malformed input instead of partially applying", () => {
    expect(applyStudioBg3dSceneCompositionPreset(BASE_INPUT, "nope")).toBeNull();
    expect(
      applyStudioBg3dSceneCompositionPreset(
        { ...BASE_INPUT, camera: { ...BASE_INPUT.camera, position: [Number.NaN, 0, 0] } },
        "romance-cafe-two-shot",
      ),
    ).toBeNull();
  });

  it("resolves the active pack only when camera and lighting both match", () => {
    const applied = applyStudioBg3dSceneCompositionPreset(
      BASE_INPUT,
      "romance-cafe-two-shot",
    )!;
    expect(
      resolveStudioBg3dSceneCompositionPreset({
        camera: applied.camera,
        lighting: applied.lighting,
        exposure: applied.exposure,
      })?.id,
    ).toBe("romance-cafe-two-shot");

    // 카메라는 팩과 같지만 조명을 바꾸면 커스텀 상태다.
    expect(
      resolveStudioBg3dSceneCompositionPreset({
        camera: applied.camera,
        lighting: { ...applied.lighting, ambientIntensity: 9.99 },
        exposure: applied.exposure,
      }),
    ).toBeNull();
    // 조명은 같지만 카메라를 옮기면 커스텀 상태다.
    expect(
      resolveStudioBg3dSceneCompositionPreset({
        camera: { ...applied.camera, position: [9, 9, 9] },
        lighting: applied.lighting,
        exposure: applied.exposure,
      }),
    ).toBeNull();
  });

  it("covers six genres with sixteen packs after the G8 expansion", () => {
    expect(STUDIO_BG3D_SCENE_GENRES.map((genre) => genre.id)).toEqual([
      "romance",
      "action",
      "thriller",
      "daily",
      "fantasy",
      "scifi",
    ]);
    expect(STUDIO_BG3D_SCENE_COMPOSITION_PRESETS).toHaveLength(16);
    expect(listStudioBg3dSceneCompositionPresets("fantasy")).toHaveLength(3);
    expect(listStudioBg3dSceneCompositionPresets("scifi")).toHaveLength(3);
    expect(listStudioBg3dSceneCompositionPresets("thriller")).toHaveLength(3);
    expect(listStudioBg3dSceneCompositionPresets("daily")).toHaveLength(3);
    // G8 팩은 번들 테마를 참조하고, 기존 팩은 참조가 없다.
    const withBundle = STUDIO_BG3D_SCENE_COMPOSITION_PRESETS.filter(
      (preset) => preset.bundleThemeId !== undefined,
    );
    expect(withBundle).toHaveLength(8);
    expect(new Set(withBundle.map((preset) => preset.bundleThemeId))).toEqual(
      new Set(["nature", "city", "swamp", "sci-fi", "horror", "interior"]),
    );
    // 새 팩도 원자 적용·resolve 왕복 계약을 그대로 지킨다.
    for (const preset of withBundle) {
      const applied = applyStudioBg3dSceneCompositionPreset(BASE_INPUT, preset.id);
      expect(applied?.presetId).toBe(preset.id);
      expect(
        resolveStudioBg3dSceneCompositionPreset({
          camera: applied!.camera,
          lighting: applied!.lighting,
          exposure: applied!.exposure,
        })?.id,
      ).toBe(preset.id);
    }
  });

  it("computes camera positions on the expected sphere", () => {
    expect(
      studioBg3dCameraPositionFromAngle({
        target: [0, 1, 0],
        azimuthDeg: 0,
        elevationDeg: 0,
        distance: 5,
      }),
    ).toEqual([0, 1, 5]);
    const high = studioBg3dCameraPositionFromAngle({
      target: [0, 1, 0],
      azimuthDeg: 90,
      elevationDeg: 0,
      distance: 5,
    });
    expect(high[0]).toBe(5);
    expect(high[2]).toBe(0);
  });
});
