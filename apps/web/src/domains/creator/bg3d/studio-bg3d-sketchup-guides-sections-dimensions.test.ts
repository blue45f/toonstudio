import { describe, expect, it } from "vitest";

import {
  clipConstructionLineToBounds,
  createSketchUpDimension3D,
  createSketchUpGuideLine,
  createSketchUpLeaderText3D,
  evaluateSketchUpSectionPlaneSignedDistance,
  intersectTrianglesWithSketchUpSectionPlane,
  parseSketchUpProtractorInput,
} from "./studio-bg3d-sketchup-guides-sections-dimensions";

describe("studio-bg3d-sketchup-guides-sections-dimensions", () => {
  it("각도기(Protractor) 각도 및 물매(Rise:Run) 문자열을 정확히 파싱한다", () => {
    const deg = parseSketchUpProtractorInput("45°");
    expect(deg.ok).toBe(true);
    expect(deg.angleDeg).toBe(45);

    const slope = parseSketchUpProtractorInput("12:12");
    expect(slope.ok).toBe(true);
    expect(slope.angleDeg).toBe(45);
  });

  it("무한 보조선(ConstructionLine)을 생성하고 AABB 경계로 클리핑한다", () => {
    const guide = createSketchUpGuideLine({
      id: "g-1",
      basePoint: [0, 0, 0],
      baseDirection: [1, 0, 0],
      offsetDirection: [0, 0, 1],
      offsetDistanceMeters: 2,
    });
    expect(guide.point).toEqual([0, 0, 2]);
    const clipped = clipConstructionLineToBounds(guide, 10);
    expect(clipped).toEqual({
      start: [-10, 0, 2],
      end: [10, 0, 2],
    });
  });

  it("3D 선형 치수선(Dimension)과 지시선 텍스트(Leader Text)를 계산한다", () => {
    const dim = createSketchUpDimension3D({
      id: "dim-1",
      startPoint: [0, 0, 0],
      endPoint: [3, 4, 0],
      offsetVector: [0, 0, 0.5],
      textTemplate: "대각선 <>",
      unit: "m",
    });
    expect(dim.measuredMeters).toBe(5);
    expect(dim.displayText).toBe("대각선 5.00 m");

    const leader = createSketchUpLeaderText3D({
      id: "ldr-1",
      anchorPoint: [1, 2, 0],
      leaderOffset: [0.4, 0.5, 0],
      text: "옥상 난간",
    });
    expect(leader.text).toBe("옥상 난간");
    expect(leader.elbowPoint).toEqual([1.3, 2.5, 0]);
  });

  it("단면 평면(SectionPlane)과 삼각형 메시의 교차 절단선 및 단면 채움 면적을 계산한다", () => {
    const plane = {
      id: "sp-1",
      name: "Z=0.5 Cut",
      symbol: "A",
      plane: [0, 0, 1, -0.5] as const,
      active: true,
      hidden: false,
      fillColorHex: "#222222",
      lineColorHex: "#000000",
      lineWidthPx: 2,
    };

    expect(evaluateSketchUpSectionPlaneSignedDistance(plane.plane, [0, 0, 1])).toBe(0.5);

    // Z=0에서 Z=1까지 뻗은 삼각형 4개(사각 기둥 측면)
    const positions = new Float32Array([
      0, 0, 0,  1, 0, 0,  1, 0, 1,
      1, 0, 0,  1, 1, 0,  1, 1, 1,
      1, 1, 0,  0, 1, 0,  0, 1, 1,
      0, 1, 0,  0, 0, 0,  0, 0, 1,
    ]);
    const indices = new Uint32Array([
      0, 1, 2,
      3, 4, 5,
      6, 7, 8,
      9, 10, 11,
    ]);

    const cut = intersectTrianglesWithSketchUpSectionPlane(plane, positions, indices);
    expect(cut.segments.length).toBe(4);
    expect(cut.estimatedFillAreaSqMeters).toBeGreaterThan(0);
  });
});
