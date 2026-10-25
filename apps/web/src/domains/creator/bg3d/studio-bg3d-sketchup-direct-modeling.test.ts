import { describe, expect, it } from "vitest";

import {
  extrudeSketchUpFollowMe,
  extrudeSketchUpPolygonFaceWithHoleCut,
  generateSketchUpBulgeArc2D,
  generateSketchUpCircleOrPolygon,
  generateSketchUpLinearArray,
  generateSketchUpRadialArray,
  offsetSketchUpPolygon2D,
  parseSketchUpArrayInput,
} from "./studio-bg3d-sketchup-direct-modeling";

describe("studio-bg3d-sketchup-direct-modeling", () => {
  it("2D 다각형 안쪽·바깥쪽 등거리 Offset을 정확히 계산한다", () => {
    const rect = [
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ] as const;

    const outward = offsetSketchUpPolygon2D(rect, 0.5);
    expect(outward.ok).toBe(true);
    expect(outward.areaOriginal).toBe(8);
    expect(outward.areaOffset).toBe(15); // 5 * 3 = 15

    const inward = offsetSketchUpPolygon2D(rect, -0.25);
    expect(inward.ok).toBe(true);
    expect(inward.areaOffset).toBe(5.25); // 3.5 * 1.5 = 5.25
  });

  it("Push/Pull에서 벽체 두께와 일치하는 내측 밀기 시 관통 개구부(Hole Cut)를 판정한다", () => {
    const outer = [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ] as const;
    const windowProfile = [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
    ] as const;

    const throughCut = extrudeSketchUpPolygonFaceWithHoleCut({
      outerLoop2D: outer,
      innerProfile2D: windowProfile,
      distanceMeters: -0.2,
      wallThicknessMeters: 0.2,
    });
    expect(throughCut.ok).toBe(true);
    expect(throughCut.holeCut).toBe(true);
    expect(throughCut.sideWallQuadCount).toBe(8);

    const blindExtrude = extrudeSketchUpPolygonFaceWithHoleCut({
      outerLoop2D: outer,
      innerProfile2D: windowProfile,
      distanceMeters: -0.1,
      wallThicknessMeters: 0.2,
    });
    expect(blindExtrude.ok).toBe(true);
    expect(blindExtrude.holeCut).toBe(false);
  });

  it("Follow Me 도구로 3D 경로를 따라 단면 프로파일을 스윕한다", () => {
    const profile = [
      [0, 0],
      [0.1, 0],
      [0.1, 0.1],
      [0, 0.1],
    ] as const;
    const path = [
      [0, 0, 0],
      [2, 0, 0],
      [2, 0, 2],
    ] as const;

    const result = extrudeSketchUpFollowMe({
      profile2D: profile,
      path3D: path,
      closedPath: false,
    });
    expect(result.ok).toBe(true);
    expect(result.pathLengthMeters).toBe(4);
    expect(result.segmentCount).toBe(2);
    expect(result.mesh.triangleCount).toBeGreaterThan(0);
  });

  it("VCB 배열 문법(*N, Nx, /N)을 파싱하고 선형·방사형 복제 배열을 생성한다", () => {
    const mult = parseSketchUpArrayInput("*3");
    expect(mult.ok).toBe(true);
    expect(mult.mode).toBe("multiply");
    expect(mult.count).toBe(3);

    const linear = generateSketchUpLinearArray({
      basePosition: [0, 0, 0],
      deltaVector: [2, 0, 0],
      command: mult,
    });
    expect(linear).toHaveLength(4);
    expect(linear[3]?.position).toEqual([6, 0, 0]);

    const div = parseSketchUpArrayInput("/4");
    expect(div.ok).toBe(true);
    expect(div.mode).toBe("divide");
    const divided = generateSketchUpLinearArray({
      basePosition: [0, 0, 0],
      deltaVector: [8, 0, 0],
      command: div,
    });
    expect(divided).toHaveLength(5);
    expect(divided[1]?.position).toEqual([2, 0, 0]);
    expect(divided[4]?.position).toEqual([8, 0, 0]);

    const radial = generateSketchUpRadialArray({
      basePosition: [1, 0, 0],
      pivot: [0, 0, 0],
      angleStepOrSpanDeg: 90,
      axis: "y",
      command: parseSketchUpArrayInput("2x"),
    });
    expect(radial).toHaveLength(3);
    expect(radial[1]?.rotationDeg).toEqual([0, 90, 0]);
  });

  it("원·정다각형 및 Bulge 원호를 결정적으로 생성한다", () => {
    const hex = generateSketchUpCircleOrPolygon({
      center: [0, 0, 0],
      radiusMeters: 2,
      segments: 6,
    });
    expect(hex).toHaveLength(6);

    const arc = generateSketchUpBulgeArc2D({
      start: [0, 0],
      end: [2, 0],
      bulge: 0.5,
      segments: 8,
    });
    expect(arc).toHaveLength(9);
  });
});
