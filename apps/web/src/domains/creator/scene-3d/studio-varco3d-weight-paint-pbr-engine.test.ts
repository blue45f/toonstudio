import { describe, expect, it } from "vitest";

import {
  applyVarco3dSkinWeightBrushStroke,
  buildVarco3dWeightRampGradientCss,
  coalesceVarco3dGpuUpdateRanges,
  computeVarco3dJfaStepSchedule,
  decodeVarco3dJfaUvCoordRgba8,
  detectVarco3dMultiviewPosition,
  encodeVarco3dJfaUvCoordRgba8,
  evaluateVarco3dBrushStrokeInfluence,
  evaluateVarco3dDecalCrackFill8Neighbor,
  evaluateVarco3dHeightToNormalWhiteout,
  evaluateVarco3dRigCapabilities,
  evaluateVarco3dVoxelGridPreviewState,
  evaluateVarco3dWaveRevealState,
  evaluateVarco3dWeightHeatRgb,
  packVarco3dBinaryRigPayload,
  sanitizeVarco3dDisplayBoneName,
  stepVarco3dWeightBrushSizeByKey,
  unpackVarco3dBinaryRigPayload,
  writeVarco3dVertexSkinWeight,
} from "./studio-varco3d-weight-paint-pbr-engine";

describe("studio-varco3d-weight-paint-pbr-engine", () => {
  it("evaluates 4-band weightHeatRgb and 9-stop CSS gradient ramp", () => {
    expect(evaluateVarco3dWeightHeatRgb(0)).toEqual([0, 0, 0.5]);
    expect(evaluateVarco3dWeightHeatRgb(0.25)).toEqual([0, 0.625, 0.625]);
    expect(evaluateVarco3dWeightHeatRgb(0.5)).toEqual([0, 0.75, 0]);
    expect(evaluateVarco3dWeightHeatRgb(0.75)).toEqual([0.875, 0.875, 0]);
    expect(evaluateVarco3dWeightHeatRgb(1)).toEqual([1, 0, 0]);

    const gradient = buildVarco3dWeightRampGradientCss();
    expect(gradient.startsWith("linear-gradient(to right,")).toBe(true);
    expect(gradient).toContain("0%");
    expect(gradient).toContain("50%");
    expect(gradient).toContain("100%");
  });

  it("solves 5-candidate top-4 vertex skin weights with remainder redistribution and descending sort", () => {
    const indices = new Uint16Array([0, 1, 2, 3]);
    const weights = new Float32Array([0.4, 0.3, 0.2, 0.1]);

    // Paint bone 4 with weight 0.6 -> top 4 influences should include bone 4 (0.6) and redistribute 0.4 across top 3 existing bones (0, 1, 2)
    writeVarco3dVertexSkinWeight({
      skinIndices: indices,
      skinWeights: weights,
      vertexIndex: 0,
      boneIndex: 4,
      targetWeight: 0.6,
      boneCount: 10,
    });

    expect(indices[0]).toBe(4);
    expect(weights[0]).toBeCloseTo(0.6, 5);
    const sum = weights[0]! + weights[1]! + weights[2]! + weights[3]!;
    expect(sum).toBeCloseTo(1.0, 5);
    expect(weights[0]!).toBeGreaterThanOrEqual(weights[1]!);
    expect(weights[1]!).toBeGreaterThanOrEqual(weights[2]!);
    expect(weights[2]!).toBeGreaterThanOrEqual(weights[3]!);
  });

  it("injects fallback secondary bone when reducing sole influence weight below 1", () => {
    const indices = new Uint16Array([0, 0, 0, 0]);
    const weights = new Float32Array([1, 0, 0, 0]);

    writeVarco3dVertexSkinWeight({
      skinIndices: indices,
      skinWeights: weights,
      vertexIndex: 0,
      boneIndex: 0,
      targetWeight: 0.3,
      boneCount: 4,
    });

    // Fallback bone 1 gets 0.7, so sorted order puts bone 1 first (0.7) and bone 0 second (0.3)
    expect(indices[0]).toBe(1);
    expect(weights[0]).toBeCloseTo(0.7, 5);
    expect(indices[1]).toBe(0);
    expect(weights[1]).toBeCloseTo(0.3, 5);
  });

  it("applies 3D spherical weight brush strokes (add/smooth) and coalesces GPU update ranges", () => {
    const positions = new Float32Array([
      0, 0, 0,
      0.2, 0, 0,
      0, 0.2, 0,
      5, 5, 5,
    ]);
    const triangleIndices = new Uint16Array([0, 1, 2]);
    const skinIndices = new Uint16Array([
      0, 1, 0, 0,
      0, 1, 0, 0,
      0, 1, 0, 0,
      0, 1, 0, 0,
    ]);
    const skinWeights = new Float32Array([
      0.2, 0.8, 0, 0,
      0.8, 0.2, 0, 0,
      0.8, 0.2, 0, 0,
      0.1, 0.9, 0, 0,
    ]);

    const addResult = applyVarco3dSkinWeightBrushStroke({
      positions,
      triangleIndices,
      skinIndices,
      skinWeights,
      boneIndex: 0,
      boneCount: 2,
      hitCenter: { x: 0, y: 0, z: 0 },
      brushRadiusWorld: 0.5,
      mode: "add",
      strength: 0.5,
    });

    expect(addResult.affectedVertices).toEqual([0, 1, 2]);
    expect(addResult.skinWeights[0]!).toBeCloseTo(0.6, 5);
    expect(addResult.gpuUpdateRanges4).toEqual([{ start: 0, count: 12 }]);

    const smoothResult = applyVarco3dSkinWeightBrushStroke({
      positions,
      triangleIndices,
      skinIndices,
      skinWeights,
      boneIndex: 0,
      boneCount: 2,
      hitCenter: { x: 0, y: 0, z: 0 },
      brushRadiusWorld: 0.1,
      mode: "smooth",
      strength: 1.0,
    });
    // Vertex 0 has neighbors 1 and 2, both with weight 0.8 on bone 0 -> smooths toward 0.8
    expect(smoothResult.affectedVertices).toEqual([0]);
    expect(smoothResult.skinIndices[0]).toBe(0);
    expect(smoothResult.skinWeights[0]!).toBeCloseTo(0.8, 5);

    const ranges = coalesceVarco3dGpuUpdateRanges([0, 1, 2, 10, 11, 50], 4, 2);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual({ start: 0, count: 48 });
    expect(ranges[1]).toEqual({ start: 200, count: 4 });
  });

  it("handles [ / ] brush size shortcuts, bone prefix sanitization, and rigCapabilities", () => {
    expect(stepVarco3dWeightBrushSizeByKey(20, "]")).toBe(22);
    expect(stepVarco3dWeightBrushSizeByKey(20, "[")).toBe(18);
    expect(stepVarco3dWeightBrushSizeByKey(1, "[")).toBe(1);
    expect(stepVarco3dWeightBrushSizeByKey(100, "]")).toBe(100);

    expect(sanitizeVarco3dDisplayBoneName("mixamorig:LeftForeArm")).toBe("LeftForeArm");
    expect(sanitizeVarco3dDisplayBoneName("mixamorig9_Hips")).toBe("Hips");
    expect(sanitizeVarco3dDisplayBoneName("HandLoRA_RightThumb1")).toBe("RightThumb1");

    expect(
      evaluateVarco3dRigCapabilities({
        type: "AI_RIG",
        status: "COMPLETED",
        humanoidClass: "HUMANOID",
        retargetProfileMatched: true,
      }),
    ).toEqual({ canEditRig: true, animateBlockedReason: null });

    expect(
      evaluateVarco3dRigCapabilities({
        type: "RIG",
        status: "COMPLETED",
        humanoidClass: "NON_HUMANOID",
      }),
    ).toEqual({ canEditRig: true, animateBlockedReason: "non-humanoid" });
  });

  it("packs and unpacks binary rig payloads losslessly", () => {
    const joints = [
      {
        name: "Hips",
        parent: null,
        translation: [0, 1, 0] as const,
        rotation: [0, 0, 0, 1] as const,
        scale: [1, 1, 1] as const,
      },
    ];
    const inverseBind = new Float32Array(16);
    inverseBind[0] = 1;
    inverseBind[5] = 1;
    inverseBind[10] = 1;
    inverseBind[15] = 1;

    const payload = packVarco3dBinaryRigPayload({
      joints,
      inverseBindMatricesRowMajor: inverseBind,
      surfaces: [
        {
          surfaceId: "body_mesh",
          vertexCount: 2,
          joints: new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0]),
          weights: new Float32Array([2, 0, 0, 0, 0.5, 0.5, 0, 0]),
        },
      ],
    });

    const unpacked = unpackVarco3dBinaryRigPayload(payload);
    expect(unpacked.header.joints).toHaveLength(1);
    expect(unpacked.header.joints[0]?.name).toBe("Hips");
    expect(unpacked.header.inverseBind.shape).toEqual([1, 4, 4]);
    expect(unpacked.header.surfaceSkins[0]?.surface).toBe("body_mesh");
    expect(unpacked.binaryBodyByteLength).toBe(64 + 16 + 32);
  });

  it("evaluates JFA UV encoding/schedule, Whiteout height-to-normal, brush restore snap, and crack fill", () => {
    const rgba = encodeVarco3dJfaUvCoordRgba8(1337, 2045);
    expect(decodeVarco3dJfaUvCoordRgba8(rgba[0], rgba[1], rgba[2], rgba[3])).toEqual([
      1337,
      2045,
    ]);
    expect(computeVarco3dJfaStepSchedule(2048, 2048)).toEqual([
      1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 1,
    ]);

    const whiteout = evaluateVarco3dHeightToNormalWhiteout({
      heightLeft: 0.2,
      heightRight: 0.8,
      heightDown: 0.5,
      heightUp: 0.5,
      texelX: 1 / 1024,
      texelY: 1 / 1024,
    });
    expect(whiteout.heightNormal.x).toBeLessThan(0);
    expect(whiteout.blendedNormal.z).toBeGreaterThan(0);

    const stroke = evaluateVarco3dBrushStrokeInfluence({
      sampleWorldPos: { x: 0.05, y: 0, z: 0 },
      sampleWorldNormal: { x: 0, y: 0, z: 1 },
      brushCenterWorld: { x: 0.1, y: 0, z: 0 },
      brushPrevCenterWorld: { x: 0, y: 0, z: 0 },
      brushViewDirWorld: { x: 0, y: 0, z: -1 },
      brushRadiusWorld: 0.5,
      hardness: 0.8,
      strength: 0.999,
      restoreBoost: 1.0,
      baseRgb: [0.2, 0.2, 0.2],
      targetRgb: [0.202, 0.202, 0.202],
    });
    expect(stroke.distanceWorld).toBeCloseTo(0, 6);
    expect(stroke.snappedToTarget).toBe(true);
    expect(stroke.blendedRgb).toEqual([0.202, 0.202, 0.202]);

    const filled = evaluateVarco3dDecalCrackFill8Neighbor(
      [0, 0, 0, 0],
      [
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    );
    expect(filled).toEqual([1, 0, 0, 1]);
  });

  it("evaluates WaveRevealEffect, VoxelGridPreview, and multiview direction detection", () => {
    const waveMid = evaluateVarco3dWaveRevealState({ elapsedMs: 1100 });
    expect(waveMid.progress).toBeCloseTo(0.5, 5);
    expect(waveMid.cosineEase).toBeCloseTo(0.5, 5);
    expect(waveMid.completed).toBe(false);

    const voxelEntry = evaluateVarco3dVoxelGridPreviewState({ elapsedMs: 800 });
    expect(voxelEntry.fade).toBeCloseTo(0.5, 5);
    expect(voxelEntry.shouldClear).toBe(false);

    const voxelExited = evaluateVarco3dVoxelGridPreviewState({
      elapsedMs: 4000,
      exiting: true,
      exitElapsedMs: 2500,
    });
    expect(voxelExited.shouldClear).toBe(true);

    expect(detectVarco3dMultiviewPosition("char_front_view.png")).toBe("front");
    expect(detectVarco3dMultiviewPosition("left_ortho.webp")).toBe("left");
    expect(detectVarco3dMultiviewPosition("side_right.jpg")).toBe("right");
    expect(detectVarco3dMultiviewPosition("character_back.png")).toBe("back");
  });
});
