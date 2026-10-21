import { describe, expect, it } from "vitest";

import { buildCompositionGenerationBrief } from "../ai/studio-composition-generation-brief";
import {
  buildStudioMannequinCompositionSnapshot,
  resolveStudioMannequinCameraAngles,
  STUDIO_MANNEQUIN_COMPOSITION_FOV_DEGREES,
} from "./studio-mannequin-composition-snapshot";

describe("buildStudioMannequinCompositionSnapshot (E2 포저 호스트 스냅샷)", () => {
  it("프리셋 방향에서 방위·고도를 기하로 도출한다", () => {
    expect(resolveStudioMannequinCameraAngles("front")).toEqual({
      azimuthDegrees: 0,
      elevationDegrees: 3,
    });
    expect(resolveStudioMannequinCameraAngles("side").azimuthDegrees).toBe(90);
    expect(resolveStudioMannequinCameraAngles("back").azimuthDegrees).toBe(180);
    expect(resolveStudioMannequinCameraAngles("top").elevationDegrees).toBeGreaterThan(85);
    expect(resolveStudioMannequinCameraAngles("high").elevationDegrees).toBeGreaterThan(15);
    expect(resolveStudioMannequinCameraAngles("low").elevationDegrees).toBeLessThan(0);
    expect(resolveStudioMannequinCameraAngles("home").azimuthDegrees).toBeGreaterThan(0);
    expect(resolveStudioMannequinCameraAngles("home").azimuthDegrees).toBeLessThan(45);
  });

  it("포저 상태가 브리프 계약의 유효한 스냅샷이 된다 (fail-closed 통과)", () => {
    const snapshot = buildStudioMannequinCompositionSnapshot({
      cameraPreset: "high",
      heightCm: 172,
      posePresetId: "dash",
      poseLabel: "달리기",
      materialStyle: "wood",
    });
    expect(snapshot.characterId).toBe("studio-mannequin");
    expect(snapshot.camera.fovDegrees).toBe(STUDIO_MANNEQUIN_COMPOSITION_FOV_DEGREES);
    expect(snapshot.camera.framing).toBe("full-body");
    expect(snapshot.posePresetId).toBe("dash");
    expect(snapshot.poseDescription).toBe("달리기");
    expect(snapshot.characterAppearance).toEqual(["신장 172cm", "재질 wood"]);
    const brief = buildCompositionGenerationBrief(snapshot);
    expect(brief.ok).toBe(true);
    if (brief.ok) {
      expect(brief.request.consistencyKeys).toContain("character:studio-mannequin");
      expect(brief.request.consistencyKeys).toContain("pose:dash");
      expect(brief.request.fallback).toBe("insert-capture-as-is");
    }
  });

  it("포즈 미적용·신장 이상값에서도 결정적으로 떨어진다", () => {
    const snapshot = buildStudioMannequinCompositionSnapshot({
      cameraPreset: "front",
      heightCm: Number.NaN,
      posePresetId: null,
    });
    expect(snapshot.posePresetId).toBeUndefined();
    expect(snapshot.characterAppearance).toEqual(["신장 165cm"]);
    expect(buildCompositionGenerationBrief(snapshot).ok).toBe(true);
    const again = buildStudioMannequinCompositionSnapshot({
      cameraPreset: "front",
      heightCm: Number.NaN,
      posePresetId: null,
    });
    expect(again).toEqual(snapshot);
  });
});
