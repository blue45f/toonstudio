import { describe, expect, it } from "vitest";

import {
  alignPenLinesByPartMesh,
  buildShaperPrismLineMesh,
  computePenLinePointThickness,
  computeShaperRealTabletWidthMultiplier,
  evaluateShaperDynLevinGregoryMidpoint,
  filterCostumeOccludedBodyStrokes,
  interpolateStepPointPenLine,
  mirrorPenLineStroke,
  resolvePenLineColor,
  scheduleShaperPenLineFrameBudget,
  ShaperBarycentricPenLineError,
  shaperRgbaToHex,
  type ShaperPartMeshGeometry,
  type ShaperPenLineStroke,
  type ShaperThemeColorPalette,
} from "./character-shaper-barycentric-pen-line";

const HEAD_MESH_INITIAL: ShaperPartMeshGeometry = {
  partMeshId: "head_mesh",
  baseMeshType: "head",
  vertices: [
    [-0.1, 1.5, 0.2], // 0 (left)
    [-0.02, 1.5, 0.2], // 1 (left-inner)
    [-0.1, 1.58, 0.2], // 2 (left-top)
    [0.1, 1.5, 0.2], // 3 (right mirror of 0)
    [0.02, 1.5, 0.2], // 4 (right mirror of 1)
    [0.1, 1.58, 0.2], // 5 (right mirror of 2)
  ],
  mirroredVertexMap: {
    0: 3,
    1: 4,
    2: 5,
    3: 0,
    4: 1,
    5: 2,
  },
};

function createSampleStroke(): ShaperPenLineStroke {
  return {
    lineId: "cheek_blush_L",
    baseMeshType: "head",
    pressureMode: "fake",
    colorMode: "baseSkinColor",
    uniqueColor: [0.9, 0.2, 0.3, 1.0],
    baseThickness: 0.004,
    stepInterpolation: "catmullRom",
    symmetryPartnerId: null,
    points: [
      {
        pointId: "pt_0",
        baseMeshType: "head",
        partMeshId: "head_mesh",
        triangleIndex: 0,
        v0: 0,
        v1: 1,
        v2: 2,
        v0d: 0.25,
        v1d: 0.25,
        normalOffset: 0.001,
        worldPosition: [-0.08, 1.52, 0.201],
        worldNormal: [0, 0, 1],
        pressure: 0.8,
        thickness: 0.004,
        isStepPoint: true,
      },
      {
        pointId: "pt_1",
        baseMeshType: "head",
        partMeshId: "head_mesh",
        triangleIndex: 0,
        v0: 0,
        v1: 1,
        v2: 2,
        v0d: 0.5,
        v1d: 0.25,
        normalOffset: 0.001,
        worldPosition: [-0.06, 1.52, 0.201],
        worldNormal: [0, 0, 1],
        pressure: 1.0,
        thickness: 0.004,
        isStepPoint: false,
      },
      {
        pointId: "pt_2",
        baseMeshType: "head",
        partMeshId: "head_mesh",
        triangleIndex: 0,
        v0: 0,
        v1: 1,
        v2: 2,
        v0d: 0.3,
        v1d: 0.5,
        normalOffset: 0.001,
        worldPosition: [-0.076, 1.54, 0.201],
        worldNormal: [0, 0, 1],
        pressure: 0.4,
        thickness: 0.004,
        isStepPoint: true,
      },
    ],
  };
}

describe("character-shaper-barycentric-pen-line", () => {
  it("re-projects 3D pen lines onto morphed/subdivided part meshes via alignPenLinesByPartMesh", () => {
    const stroke = createSampleStroke();
    // 헤드 모프/변형으로 Z가 +0.05 전진하고 Y가 +0.02 상승한 메쉬
    const morphedHeadMesh: ShaperPartMeshGeometry = {
      ...HEAD_MESH_INITIAL,
      vertices: HEAD_MESH_INITIAL.vertices.map(([x, y, z]) => [x, y + 0.02, z + 0.05]),
    };

    const aligned = alignPenLinesByPartMesh(
      [stroke],
      { head_mesh: morphedHeadMesh },
      "head",
    );

    const p0 = aligned[0]!.points[0]!;
    // surfaceZ = 0.25, normal = [0, 0, 1], normalOffset = 0.001 => 0.251
    expect(p0.worldPosition[0]).toBeCloseTo(-0.08, 5);
    expect(p0.worldPosition[1]).toBeCloseTo(1.54, 5);
    expect(p0.worldPosition[2]).toBeCloseTo(0.251, 5);

    // 다른 파츠 타입(body) 필터링 시 head 스트로크는 변하지 않아야 함
    const skipped = alignPenLinesByPartMesh(
      [stroke],
      { head_mesh: morphedHeadMesh },
      "body",
    );
    expect(skipped[0]!.points[0]!.worldPosition[2]).toBeCloseTo(0.201, 5);
  });

  it("computes thickness for fake, real, and none LinePressureModes", () => {
    const noneStart = computePenLinePointThickness({
      baseThickness: 0.01,
      pressureMode: "none",
      pointIndex: 0,
      totalPoints: 5,
      rawPressure: 0.1,
    });
    expect(noneStart).toBe(0.01);

    const realLow = computePenLinePointThickness({
      baseThickness: 0.01,
      pressureMode: "real",
      pointIndex: 2,
      totalPoints: 5,
      rawPressure: 0.0,
      minPressureRatio: 0.2,
    });
    const realHigh = computePenLinePointThickness({
      baseThickness: 0.01,
      pressureMode: "real",
      pointIndex: 2,
      totalPoints: 5,
      rawPressure: 1.0,
      minPressureRatio: 0.2,
    });
    expect(realLow).toBeCloseTo(0.002, 6);
    expect(realHigh).toBeCloseTo(0.01, 6);

    const fakeTip = computePenLinePointThickness({
      baseThickness: 0.01,
      pressureMode: "fake",
      pointIndex: 0,
      totalPoints: 5,
      rawPressure: 1.0,
      minPressureRatio: 0.2,
    });
    const fakeCenter = computePenLinePointThickness({
      baseThickness: 0.01,
      pressureMode: "fake",
      pointIndex: 2,
      totalPoints: 5,
      rawPressure: 0.0,
      minPressureRatio: 0.2,
    });
    expect(fakeTip).toBeCloseTo(0.002, 6);
    expect(fakeCenter).toBeCloseTo(0.01, 6);

    expect(() =>
      computePenLinePointThickness({
        baseThickness: 0,
        pressureMode: "none",
        pointIndex: 0,
        totalPoints: 1,
        rawPressure: 1,
      }),
    ).toThrow(ShaperBarycentricPenLineError);
  });

  it("resolves dynamic LineColorMode (baseLineColor, baseHairColor, baseSkinColor, unique)", () => {
    const palette: ShaperThemeColorPalette = {
      baseLineColor: [0.1, 0.1, 0.1, 1],
      baseHairColor: [0.3, 0.2, 0.8, 1],
      baseSkinColor: [0.7, 0.5, 0.4, 1],
    };
    const unique: [number, number, number, number] = [1, 0, 0.5, 1];

    expect(resolvePenLineColor({ colorMode: "baseLineColor", uniqueColor: unique }, palette)).toEqual(
      palette.baseLineColor,
    );
    expect(resolvePenLineColor({ colorMode: "baseHairColor", uniqueColor: unique }, palette)).toEqual(
      palette.baseHairColor,
    );
    expect(resolvePenLineColor({ colorMode: "baseSkinColor", uniqueColor: unique }, palette)).toEqual(
      palette.baseSkinColor,
    );
    expect(resolvePenLineColor({ colorMode: "unique", uniqueColor: unique }, palette)).toEqual(
      unique,
    );
    expect(shaperRgbaToHex([1, 0, 0.5, 1])).toBe("#ff0080ff");
  });

  it("interpolates Step Points with linear and catmullRom curves and mirrors strokes across X=0", () => {
    const stroke = createSampleStroke();
    const interpolated = interpolateStepPointPenLine(stroke, 4);
    expect(interpolated.points).toHaveLength(5);
    expect(interpolated.points[0]!.isStepPoint).toBe(true);
    expect(interpolated.points[2]!.isStepPoint).toBe(false);
    expect(interpolated.points[4]!.isStepPoint).toBe(true);
    // fake 필압이므로 중앙 포인트가 양 끝보다 두꺼워야 함
    expect(interpolated.points[2]!.thickness).toBeGreaterThan(interpolated.points[0]!.thickness);

    const mirrored = mirrorPenLineStroke(stroke, {
      mirroredLineId: "cheek_blush_R",
      meshesById: { head_mesh: HEAD_MESH_INITIAL },
    });
    expect(mirrored.lineId).toBe("cheek_blush_R");
    expect(mirrored.symmetryPartnerId).toBe("cheek_blush_L");
    expect(mirrored.points[0]!.worldPosition[0]).toBeCloseTo(
      -stroke.points[0]!.worldPosition[0],
      5,
    );
    expect(mirrored.points[0]!.v0).toBe(3);
    expect(mirrored.points[0]!.v1).toBe(5);
    expect(mirrored.points[0]!.v2).toBe(4);
  });

  it("computes 2x real tablet pressure multiplier, builds 3-vertex triangular prism mesh, and masks costume-occluded body strokes", () => {
    expect(computeShaperRealTabletWidthMultiplier(1.0, 0.2, true)).toBeCloseTo(2.0, 6);
    expect(computeShaperRealTabletWidthMultiplier(0.5, 0.2, true)).toBeCloseTo(1.1, 6);
    expect(computeShaperRealTabletWidthMultiplier(1.0, 0.2, false)).toBeCloseTo(1.0, 6);

    const stroke = createSampleStroke();
    const prism = buildShaperPrismLineMesh(stroke);
    expect(prism.rings).toHaveLength(3);
    // 3 rings * 3 vertices * 3 floats = 27
    expect(prism.positions).toHaveLength(27);
    // 2 segments * 18 indices = 36
    expect(prism.indices).toHaveLength(36);
    // Ridge vertex offset along normal [0,0,1] by 0.3 * w
    expect(prism.rings[0]!.ridgeVertex[2]).toBeCloseTo(
      stroke.points[0]!.worldPosition[2] + stroke.points[0]!.thickness * 0.3,
      6,
    );

    const bodyStrokeOccluded: ShaperPenLineStroke = {
      ...stroke,
      lineId: "collarbone_ink",
      baseMeshType: "body",
    };
    const bodyStrokeExposed: ShaperPenLineStroke = {
      ...stroke,
      lineId: "wrist_ink",
      baseMeshType: "body",
    };
    const maskPixels = new Uint8Array(16);
    maskPixels.fill(255);
    // Mark top-left cell (0,0) as occluded by clothing (0)
    maskPixels[0] = 0;

    const filtered = filterCostumeOccludedBodyStrokes(
      [stroke, bodyStrokeOccluded, bodyStrokeExposed],
      { maskTextureWidth: 4, maskTextureHeight: 4, maskTexPixels: maskPixels },
      {
        collarbone_ink: [[0.05, 0.05], [0.1, 0.1]],
        wrist_ink: [[0.8, 0.8], [0.9, 0.9]],
      },
    );
    expect(filtered.occludedLineIds).toEqual(["collarbone_ink"]);
    expect(filtered.visibleStrokes.map((s) => s.lineId)).toEqual(["cheek_blush_L", "wrist_ink"]);
  });

  it("evaluates Dyn-Levin-Gregory 4-point subdivision midpoint and 8ms frame budget scheduler", () => {
    const mid = evaluateShaperDynLevinGregoryMidpoint([0, 0, 0], [1, 1, 0], [2, 1, 0], [3, 0, 0]);
    expect(mid[0]).toBeCloseTo(1.5, 6);
    expect(mid[1]).toBeGreaterThan(1.0);

    const budget = scheduleShaperPenLineFrameBudget([3, 4, 5], 0, 8);
    expect(budget.processedCount).toBe(2);
    expect(budget.nextIndex).toBe(2);
    expect(budget.elapsedMs).toBe(7);
    expect(budget.completedAll).toBe(false);
  });
});
