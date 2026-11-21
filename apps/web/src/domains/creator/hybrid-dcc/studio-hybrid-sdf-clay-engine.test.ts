import { describe, expect, it } from "vitest";

import {
  evaluateSdfScene,
  extractWatertightSdfMesh,
  smoothMin,
  type SdfClayScene,
} from "./studio-hybrid-sdf-clay-engine";

describe("studio-hybrid-sdf-clay-engine", () => {
  it("computes Womp-style Smooth-Min goop blending strictly smoother than hard CSG", () => {
    const hardMin = Math.min(0.1, 0.1);
    const goop = smoothMin(0.1, 0.1, 0.2);
    expect(goop).toBeLessThan(hardMin);
    expect(goop).toBeCloseTo(0.05, 5);
  });

  it("extracts a 100% watertight manifold triangle mesh from a smooth-union + subtract SDF scene", () => {
    const scene: SdfClayScene = {
      id: "clay-mug-prop",
      boundsMin: [-0.6, -0.6, -0.6],
      boundsMax: [0.6, 0.6, 0.6],
      primitives: [
        {
          id: "body",
          kind: "sphere",
          op: "smooth-union",
          blendRadiusM: 0,
          position: [-0.12, 0, 0],
          size: [0.26, 0, 0],
        },
        {
          id: "knob",
          kind: "capsule",
          op: "smooth-union",
          blendRadiusM: 0.12,
          position: [0.16, 0, 0],
          size: [0.16, 0.1, 0],
        },
        {
          id: "dent",
          kind: "sphere",
          op: "smooth-subtract",
          blendRadiusM: 0.04,
          position: [0, 0.24, 0],
          size: [0.1, 0, 0],
        },
      ],
    };

    // 내부 원점은 음수, 외곽 코너는 양수여야 한다
    expect(evaluateSdfScene(scene, -0.1, 0, 0)).toBeLessThan(0);
    expect(evaluateSdfScene(scene, 0.55, 0.55, 0.55)).toBeGreaterThan(0);

    const mesh = extractWatertightSdfMesh(scene, 14);
    expect(mesh.vertexCount).toBeGreaterThan(100);
    expect(mesh.triangleCount).toBeGreaterThan(200);
    expect(mesh.boundaryEdgeCount).toBe(0);
    expect(mesh.nonManifoldEdgeCount).toBe(0);
    expect(mesh.isWatertight).toBe(true);
  });
});
