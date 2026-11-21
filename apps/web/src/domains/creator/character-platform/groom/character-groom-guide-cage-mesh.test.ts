import { describe, expect, it } from "vitest";

import {
  DEFAULT_HAIR_GUIDE_DOME_CAGE,
  DEFAULT_HAIR_ROOT_TIP_CURVE,
  HAIR_CROSS_SECTION_PROFILES,
  buildGuideDomeWireframeGrid,
  evaluateCurveGraph,
  generateGroomStrandMesh,
  projectPointOntoGuideDome,
  sampleGuideDomeSurface,
} from "./character-groom-guide-cage-mesh";

describe("character-groom-guide-cage-mesh", () => {
  it("projects points onto the Guide Dome ellipsoid and builds wireframe rings", () => {
    const dome = DEFAULT_HAIR_GUIDE_DOME_CAGE;
    const projected = projectPointOntoGuideDome(dome, [0.5, 2.2, 0.4]);
    const rx = dome.radiiM[0] + dome.offsetM;
    const ry = dome.radiiM[1] + dome.offsetM;
    const rz = dome.radiiM[2] + dome.offsetM;
    const ellipsoidEq =
      ((projected[0] - dome.centerM[0]) / rx) ** 2
      + ((projected[1] - dome.centerM[1]) / ry) ** 2
      + ((projected[2] - dome.centerM[2]) / rz) ** 2;
    expect(ellipsoidEq).toBeCloseTo(1, 5);

    const grid = buildGuideDomeWireframeGrid(dome);
    expect(grid.latPolylines).toHaveLength(dome.latRings);
    expect(grid.lonPolylines).toHaveLength(dome.lonSegments);
  });

  it("generates all 4 3D cross-section profiles with strictly monotonic UV0.v and tapered tip", () => {
    const dome = DEFAULT_HAIR_GUIDE_DOME_CAGE;
    const p0 = sampleGuideDomeSurface(dome, 0.2, 0.6).position;
    const p1 = sampleGuideDomeSurface(dome, 0.25, 0.2).position;
    const p2 = [p1[0] + 0.01, p1[1] - 0.14, p1[2] + 0.02] as const;

    expect(evaluateCurveGraph(DEFAULT_HAIR_ROOT_TIP_CURVE.widthPoints, 0)).toBeCloseTo(0.85, 5);
    expect(evaluateCurveGraph(DEFAULT_HAIR_ROOT_TIP_CURVE.widthPoints, 1)).toBeCloseTo(0.06, 5);

    for (const profile of HAIR_CROSS_SECTION_PROFILES) {
      const mesh = generateGroomStrandMesh({
        id: `strand-${profile}`,
        profile,
        spinePoints: [p0, p1, p2],
        baseWidthM: 0.028,
        baseThicknessM: 0.014,
        lengthSegments: 10,
        curveGraph: DEFAULT_HAIR_ROOT_TIP_CURVE,
      });

      expect(mesh.ringCount).toBe(11);
      expect(mesh.triangleCount).toBeGreaterThan(0);
      expect(mesh.uvVStrictlyMonotonic).toBe(true);
      // 첫 링 UV.v = 0, 마지막 링 UV.v = 1
      expect(mesh.uvs[1]).toBeCloseTo(0, 6);
      expect(mesh.uvs[mesh.uvs.length - 1]).toBeCloseTo(1, 6);
      // 모든 정점 유한 숫자 검증
      for (let i = 0; i < mesh.positions.length; i += 1) {
        expect(Number.isFinite(mesh.positions[i])).toBe(true);
      }
    }
  });
});
