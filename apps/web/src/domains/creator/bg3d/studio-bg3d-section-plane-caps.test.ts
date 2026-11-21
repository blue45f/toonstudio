import { describe, expect, it } from "vitest";

import {
  clipMeshBySectionPlane,
  coordinateSectionPlanesWithCutaway,
  type Bg3dSectionPlane,
  type SectionableSolidMesh,
} from "./studio-bg3d-section-plane-caps";
import {
  DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
  evaluateCameraWallCutaway,
} from "./studio-bg3d-wall-cutaway-runtime";

function createUnitCubeMesh(): SectionableSolidMesh {
  // [0..2] x [0..2] x [0..2] 닫힌 정육면체 솔리드 (단면적 4 m^2)
  const positions = new Float32Array([
    0, 0, 0,  2, 0, 0,  2, 2, 0,  0, 2, 0,
    0, 0, 2,  2, 0, 2,  2, 2, 2,  0, 2, 2,
  ]);
  const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2, // back (-Z)
    4, 5, 6, 4, 6, 7, // front (+Z)
    0, 1, 5, 0, 5, 4, // bottom (-Y)
    3, 7, 6, 3, 6, 2, // top (+Y)
    0, 4, 7, 0, 7, 3, // left (-X)
    1, 2, 6, 1, 6, 5, // right (+X)
  ]);
  return { positions, indices };
}

describe("studio-bg3d-section-plane-caps", () => {
  it("clips a closed 2m solid cube at y=1m, caps the hollow interior with 4 m^2 solid cap, and generates hatch lines", () => {
    const cube = createUnitCubeMesh();
    const horizontalCut: Bg3dSectionPlane = {
      id: "plan-cut-1m",
      labelKo: "평면도 1m 절단면",
      enabled: true,
      originWorldM: [0, 1.0, 0],
      keepNormalWorld: [0, -1, 0], // 아래쪽 [0..1m] 유지
      capStyle: "architectural-hatch",
      capColorToken: "section-cap-ink",
      hatchSpacingM: 0.25,
      hatchAngleDeg: 45,
    };

    const clipped = clipMeshBySectionPlane(cube, horizontalCut);
    expect(clipped.keptTriangleCount).toBeGreaterThan(0);
    expect(clipped.capContourLoops).toHaveLength(1);
    expect(clipped.capTriangleCount).toBeGreaterThanOrEqual(2);
    // 2m x 2m 수평 단면 캡 면적은 정확히 4.0 m^2
    expect(clipped.capAreaM2).toBeCloseTo(4.0, 4);
    expect(clipped.hatchLines.length).toBeGreaterThan(6);
  });

  it("coordinates section planes alongside shadow-preserving wall cutaway", () => {
    const cutaway = evaluateCameraWallCutaway({
      camera: { position: [0, 3.6, 6], target: [0, 1.2, 0] },
      room: { center: [0, 1.4, 0], size: [8, 2.8, 6] },
      config: DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
    });
    const combined = coordinateSectionPlanesWithCutaway(
      [
        {
          id: "sec-1",
          labelKo: "단면 A",
          enabled: true,
          originWorldM: [0, 1.5, 0],
          keepNormalWorld: [0, -1, 0],
          capStyle: "solid-fill",
          capColorToken: "section-cap-ink",
          hatchSpacingM: 0.2,
          hatchAngleDeg: 45,
        },
      ],
      cutaway,
    );
    expect(combined.effectiveRenderStrategy).toBe("cutaway-plus-section-caps");
    expect(combined.activeSectionPlanes).toHaveLength(1);
    expect(combined.shadowPreservingWallRoles.length).toBeGreaterThan(0);
  });
});
