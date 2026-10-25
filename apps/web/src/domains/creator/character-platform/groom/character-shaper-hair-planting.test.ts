import { describe, expect, it } from "vitest";

import {
  applyHairPlantingGesture,
  clampBarycentricWeights,
  classifyHairBaseUvRegion,
  createSymmetricHairStrand,
  plantHairStrandOnFace,
  resetHairStrandPhysics,
  resolveHairPlantingGestureMode,
  SHAPER_HAIR_GESTURE_LABELS,
  ShaperHairPlantingError,
  stepHairStrandPhysics,
  syncSymmetricHairStrand,
  type ShaperHairTriangleFace,
} from "./character-shaper-hair-planting";

const SAMPLE_FACE: ShaperHairTriangleFace = {
  baseMeshId: "head_base_v1",
  triangleIndex: 12,
  vertexIndices: [10, 11, 12],
  v0: [-0.2, 1.5, 0.1],
  v1: [-0.05, 1.5, 0.1],
  v2: [-0.2, 1.65, 0.1],
  uv0: [0.1, 0.5],
  uv1: [0.2, 0.5],
  uv2: [0.1, 0.6],
};

describe("character-shaper-hair-planting", () => {
  it("clamps barycentric coordinates into the valid triangle domain", () => {
    expect(clampBarycentricWeights(0.25, 0.35)).toEqual([0.25, 0.35]);
    const [clampedV0d, clampedV1d] = clampBarycentricWeights(0.8, 0.8);
    expect(clampedV0d + clampedV1d).toBeCloseTo(1, 6);
    expect(clampBarycentricWeights(-0.5, 0.2)).toEqual([0, 0.2]);
    expect(() => clampBarycentricWeights(Number.NaN, 0.2)).toThrow(ShaperHairPlantingError);
  });

  it("classifies HairBaseData UV regions accurately", () => {
    expect(classifyHairBaseUvRegion([0.5, 0.8])).toBe("front");
    expect(classifyHairBaseUvRegion([0.5, 0.5])).toBe("crown");
    expect(classifyHairBaseUvRegion([0.1, 0.5])).toBe("sideLeft");
    expect(classifyHairBaseUvRegion([0.9, 0.5])).toBe("sideRight");
    expect(classifyHairBaseUvRegion([0.5, 0.25])).toBe("back");
    expect(classifyHairBaseUvRegion([0.5, 0.05])).toBe("nape");
  });

  it("plants a hair strand on a triangle face using barycentric weights and surface normal", () => {
    const strand = plantHairStrandOnFace({
      strandId: "strand_left_01",
      face: SAMPLE_FACE,
      v0d: 0.2,
      v1d: 0.3,
      controlPointCount: 5,
    });

    expect(strand.strandId).toBe("strand_left_01");
    expect(strand.baseMeshId).toBe("head_base_v1");
    expect(strand.uvRegion).toBe("sideLeft");
    expect(strand.rootPosition[0]).toBeCloseTo(-0.17, 5);
    expect(strand.rootPosition[1]).toBeCloseTo(1.545, 5);
    expect(strand.rootPosition[2]).toBeCloseTo(0.1, 5);
    expect(strand.normal[2]).toBeCloseTo(1, 5);
    expect(strand.controlPointPos).toHaveLength(5);
    expect(strand.controlPointPos[0]).toEqual(strand.rootPosition);
  });

  it("applies Shaper gesture modifiers (default move, Ctrl Z-rotation, Alt bend, Shift length)", () => {
    const baseStrand = plantHairStrandOnFace({
      strandId: "strand_gesture",
      face: SAMPLE_FACE,
      v0d: 0.25,
      v1d: 0.25,
    });

    expect(resolveHairPlantingGestureMode({}).label).toBe(
      SHAPER_HAIR_GESTURE_LABELS.moveRootOnSurface,
    );
    expect(resolveHairPlantingGestureMode({ ctrlKey: true }).label).toBe(
      "Z축 뿌리 회전 [Ctrl]+[Drag]",
    );
    expect(resolveHairPlantingGestureMode({ altKey: true }).label).toBe(
      "휘어짐 조절 [Alt]+[Drag]",
    );
    expect(resolveHairPlantingGestureMode({ shiftKey: true }).label).toBe(
      "길이 조절 [Shift]+[Drag]",
    );

    const moved = applyHairPlantingGesture(baseStrand, {
      deltaX: 20,
      deltaY: 10,
      face: SAMPLE_FACE,
    });
    expect(moved.kind).toBe("moveRootOnSurface");
    expect(moved.strand.v0d).toBeCloseTo(0.35, 5);
    expect(moved.strand.v1d).toBeCloseTo(0.3, 5);

    const rotated = applyHairPlantingGesture(baseStrand, {
      deltaX: 30,
      deltaY: 0,
      modifiers: { ctrlKey: true },
      face: SAMPLE_FACE,
    });
    expect(rotated.kind).toBe("rotateRootZ");
    expect(rotated.strand.rootAngles[2]).toBeCloseTo(18, 5);

    const bent = applyHairPlantingGesture(baseStrand, {
      deltaX: 25,
      deltaY: -15,
      modifiers: { altKey: true },
      face: SAMPLE_FACE,
    });
    expect(bent.kind).toBe("adjustBendCurvature");
    expect(bent.strand.bendCurvature).toBeGreaterThan(baseStrand.bendCurvature);
    expect(bent.strand.controlPointAngles[4]?.[0]).not.toBe(
      baseStrand.controlPointAngles[4]?.[0],
    );

    const lengthened = applyHairPlantingGesture(baseStrand, {
      deltaX: 15,
      deltaY: -40,
      modifiers: { shiftKey: true },
      face: SAMPLE_FACE,
    });
    expect(lengthened.kind).toBe("adjustStrandLength");
    expect(lengthened.strand.strandLength).toBeGreaterThan(baseStrand.strandLength);
    expect(lengthened.strand.controlPointScale[4]?.[1]).toBeGreaterThan(1);
  });

  it("creates and synchronizes X-axis symmetric hair strands via SymmetryHairHelper", () => {
    const leftStrand = plantHairStrandOnFace({
      strandId: "hair_L",
      face: SAMPLE_FACE,
      v0d: 0.2,
      v1d: 0.4,
      initialRollZDeg: 25,
      bendCurvature: 0.35,
    });

    const rightStrand = createSymmetricHairStrand(leftStrand, {
      partnerStrandId: "hair_R",
      mirroredTriangleIndex: 112,
    });

    expect(rightStrand.strandId).toBe("hair_R");
    expect(rightStrand.symmetricPartnerId).toBe("hair_L");
    expect(rightStrand.uvRegion).toBe("sideRight");
    expect(rightStrand.rootPosition[0]).toBeCloseTo(-leftStrand.rootPosition[0], 5);
    expect(rightStrand.rootPosition[1]).toBeCloseTo(leftStrand.rootPosition[1], 5);
    expect(rightStrand.rootAngles[2]).toBeCloseTo(-25, 5);
    expect(rightStrand.v0d).toBeCloseTo(leftStrand.v1d, 5);
    expect(rightStrand.v1d).toBeCloseTo(leftStrand.v0d, 5);

    const editedLeft = applyHairPlantingGesture(leftStrand, {
      deltaX: 0,
      deltaY: -50,
      modifiers: { shiftKey: true },
      face: SAMPLE_FACE,
    }).strand;

    const syncedRight = syncSymmetricHairStrand(editedLeft, rightStrand);
    expect(syncedRight.strandId).toBe("hair_R");
    expect(syncedRight.triangleIndex).toBe(112);
    expect(syncedRight.strandLength).toBeCloseTo(editedLeft.strandLength, 5);
  });

  it("simulates spring physics with head/shoulder collision spheres and restores via resetHairStrandPhysics", () => {
    const strand = plantHairStrandOnFace({
      strandId: "strand_phys",
      face: SAMPLE_FACE,
      v0d: 0.2,
      v1d: 0.2,
      strandLength: 0.4,
    });

    const colliderCenter = strand.controlPointPos[3]!;
    const stepped = stepHairStrandPhysics(strand, {
      dtSeconds: 0.016,
      gravity: [0, -9.81, 0],
      headAcceleration: [2.5, 0, 0],
      collisionSpheres: [
        {
          sphereId: "head_sphere",
          kind: "head",
          center: colliderCenter,
          radius: 0.08,
        },
      ],
    });

    // 루트는 표면에 고정
    expect(stepped.controlPointPos[0]).toEqual(strand.rootPosition);
    // 충돌 구 반경 밖으로 밀려났는지 검증
    const p3 = stepped.controlPointPos[3]!;
    const distFromSphere = Math.hypot(
      p3[0] - colliderCenter[0],
      p3[1] - colliderCenter[1],
      p3[2] - colliderCenter[2],
    );
    expect(distFromSphere).toBeGreaterThanOrEqual(0.08 - 1e-5);

    const reset = resetHairStrandPhysics(stepped);
    expect(reset.controlPointPos).toEqual(strand.controlPointRestPos);
    expect(reset.controlPointVelocities.every((v) => v[0] === 0 && v[1] === 0 && v[2] === 0)).toBe(
      true,
    );
  });
});
