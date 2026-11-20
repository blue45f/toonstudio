import { describe, expect, it } from "vitest";

import {
  simulatePatternSewingDrape,
  type BodyCylinderCollider,
  type GarmentPatternPiece2D,
  type PatternSeamPair,
} from "./studio-vrm-pattern-sewing-drape";

describe("studio-vrm-pattern-sewing-drape", () => {
  const torsoCollider: BodyCylinderCollider = {
    axisCenterXZ: [0, 0],
    radiusM: 0.16,
    minHeightM: 0.7,
    maxHeightM: 1.5,
  };

  it("sews paired front/back bodice seams together and preserves multi-layer coat separation", () => {
    const pieces: GarmentPatternPiece2D[] = [
      {
        id: "shirt-front",
        labelKo: "셔츠 앞판",
        widthM: 0.48,
        heightM: 0.5,
        cols: 6,
        rows: 6,
        layerIndex: 0,
        fabric: "cotton",
        pinTopEdge: true,
        arrangement: {
          axisCenterXZ: [0, 0],
          baseRadiusM: 0.18,
          azimuthCenterRad: 0,
          wrapArcRad: Math.PI * 0.85,
          topHeightM: 1.42,
        },
      },
      {
        id: "shirt-back",
        labelKo: "셔츠 뒷판",
        widthM: 0.48,
        heightM: 0.5,
        cols: 6,
        rows: 6,
        layerIndex: 0,
        fabric: "cotton",
        pinTopEdge: true,
        arrangement: {
          axisCenterXZ: [0, 0],
          baseRadiusM: 0.18,
          azimuthCenterRad: Math.PI,
          wrapArcRad: Math.PI * 0.85,
          topHeightM: 1.42,
        },
      },
      {
        id: "coat-front",
        labelKo: "외투 앞판",
        widthM: 0.52,
        heightM: 0.56,
        cols: 6,
        rows: 6,
        layerIndex: 1,
        fabric: "wool",
        pinTopEdge: true,
        arrangement: {
          axisCenterXZ: [0, 0],
          baseRadiusM: 0.18,
          azimuthCenterRad: 0,
          wrapArcRad: Math.PI * 0.88,
          topHeightM: 1.44,
        },
      },
    ];

    const seams: PatternSeamPair[] = [
      { id: "side-left", pieceAId: "shirt-front", edgeA: "right", pieceBId: "shirt-back", edgeB: "left", strength: 0.9 },
      { id: "side-right", pieceAId: "shirt-front", edgeA: "left", pieceBId: "shirt-back", edgeB: "right", strength: 0.9 },
    ];

    const result = simulatePatternSewingDrape(pieces, seams, torsoCollider, {
      substeps: 24,
      constraintIterations: 8,
    });

    expect(result.bodyPenetrationCount).toBe(0);
    expect(result.layerOrderingPreserved).toBe(true);
    // 봉제선 페어링이 초기 갭(>50mm)을 강하게 당겨 수렴시켜야 한다
    expect(result.meanSeamGapMm).toBeLessThan(20);
    expect(result.meshes["shirt-front"].vertexCount).toBe(49);
    expect(result.meshes["coat-front"].vertexCount).toBe(49);
  });
});
