import { describe, expect, it } from "vitest";

import {
  analyzeStudioBg3dShotContinuity,
  formatStudioBg3dShotContinuitySummary,
  resolveStudioBg3dShotContinuityCamera,
} from "./studio-bg3d-shot-continuity";

import type { StudioBg3dCameraSettings, StudioBg3dShot } from "./studio-bg3d-scene-document";

const BASE_CAMERA: StudioBg3dCameraSettings = {
  position: [0, 1.6, 6],
  target: [0, 1.4, 0],
  fovDegrees: 45,
  projection: "perspective",
  nearClip: 0.01,
  up: [0, 1, 0],
};

function shot(
  id: string,
  camera: NonNullable<StudioBg3dShot["camera"]>,
): StudioBg3dShot {
  return { id, name: id, camera };
}

describe("studio-bg3d-shot-continuity", () => {
  it("부분 샷의 높이를 상속하고 서로 다른 평행 화면 범위를 중복 구도로 오인하지 않는다", () => {
    const base = { ...BASE_CAMERA, projection: "orthographic" as const, orthographicHeight: 8, zoom: 2 };
    expect(resolveStudioBg3dShotContinuityCamera(base, shot("inherit", { zoom: 4 })).orthographicHeight).toBe(8);
    expect(resolveStudioBg3dShotContinuityCamera(base, shot("override", { orthographicHeight: 12 })).orthographicHeight).toBe(12);
    const different = analyzeStudioBg3dShotContinuity(base, [shot("a", {}), shot("b", { orthographicHeight: 16 })]);
    expect(different.transitions[0]?.issues.map((entry) => entry.code)).not.toContain("duplicate-framing");
    const equivalent = analyzeStudioBg3dShotContinuity(base, [shot("a", {}), shot("b", { orthographicHeight: 16, zoom: 4 })]);
    expect(equivalent.transitions[0]?.issues.map((entry) => entry.code)).toContain("duplicate-framing");
  });
  it("resolves partial shot camera overrides without mutating the base camera", () => {
    const resolved = resolveStudioBg3dShotContinuityCamera(BASE_CAMERA, shot("close", {
      fovDegrees: 24,
      position: [0, 1.5, 2],
    }));

    expect(resolved.position).toEqual([0, 1.5, 2]);
    expect(resolved.target).toEqual(BASE_CAMERA.target);
    expect(resolved.fovDegrees).toBe(24);
    expect(BASE_CAMERA.position).toEqual([0, 1.6, 6]);
  });

  it("flags reverse-axis, focal and projection discontinuities", () => {
    const report = analyzeStudioBg3dShotContinuity(BASE_CAMERA, [
      shot("front", {
        position: [0, 1.6, 6],
        target: [0, 1.4, 0],
        fovDegrees: 65,
        projection: "perspective",
      }),
      shot("back", {
        position: [0, 1.6, -6],
        target: [0, 1.4, 0],
        fovDegrees: 20,
        projection: "orthographic",
      }),
    ]);

    expect(report.transitionCount).toBe(1);
    expect(report.criticalCount).toBeGreaterThanOrEqual(3);
    expect(report.transitions[0]?.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["projection-cut", "reverse-axis-cut", "focal-jump"]),
    );
    expect(report.score).toBeLessThan(60);
    expect(formatStudioBg3dShotContinuitySummary(report)).toContain("치명");
  });

  it("recognizes duplicate framing as a lightweight editorial note", () => {
    const report = analyzeStudioBg3dShotContinuity(BASE_CAMERA, [
      shot("a", {}),
      shot("b", {}),
    ]);

    expect(report.criticalCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.infoCount).toBe(1);
    expect(report.transitions[0]?.issues[0]?.code).toBe("duplicate-framing");
  });
});
