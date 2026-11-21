import { describe, expect, it } from "vitest";

import {
  DEFAULT_GARMENT_CONFORM_OPTIONS,
  applyUnderMeshTrimToIndices,
  conformGarmentVerticesToBodyProfile,
  createAutoUnderMeshTrimMask,
  paintUnderMeshTrimBrush,
  resolveGarmentSkinPushout,
  type ConformMeshData,
} from "./studio-vrm-garment-vertex-conform";

function createSymmetricBodyPatch(): ConformMeshData {
  // 좌(-X)/우(+X) 가슴 피부 패치 (Z = 0, 법선 = +Z)
  return {
    positions: new Float32Array([
      -0.15, 1.25, 0,
      -0.05, 1.25, 0,
      -0.1, 1.35, 0,
      0.15, 1.25, 0,
      0.05, 1.25, 0,
      0.1, 1.35, 0,
    ]),
    normals: new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]),
    indices: new Uint16Array([0, 1, 2, 3, 4, 5]),
  };
}

describe("studio-vrm-garment-vertex-conform", () => {
  it("conforms garment proportions to target body profile and pushes penetrating vertices out", () => {
    const body = createSymmetricBodyPatch();
    const rawGarment = new Float32Array([
      -0.1, 1.3, -0.008, // 피부(-8mm 안쪽) 관통 정점
      0.1, 1.3, 0.015,   // 이미 피부 밖(+15mm) 정상 정점
    ]);

    const conformed = conformGarmentVerticesToBodyProfile(rawGarment, {
      heightScale: 1.0,
      shoulderWidthScale: 1.2,
      chestDepthScale: 1.0,
      waistWidthScale: 1.0,
      hipWidthScale: 1.0,
    });
    expect(Math.abs(conformed[0])).toBeGreaterThan(0.1);

    const pushout = resolveGarmentSkinPushout(rawGarment, body, DEFAULT_GARMENT_CONFORM_OPTIONS);
    expect(pushout.initialPenetrationCount).toBe(1);
    expect(pushout.remainingPenetrationCount).toBe(0);
    // 밀려난 정점이 최소 여유 3.5mm(0.0035m) 이상 바깥으로 나와야 한다
    expect(pushout.positions[2]).toBeGreaterThanOrEqual(0.0034);
    expect(pushout.maxPushoutMm).toBeGreaterThan(10);
  });

  it("supports symmetric X-mirror under-mesh brush trimming and triangle culling", () => {
    const body = createSymmetricBodyPatch();
    const garmentOutside = new Float32Array([-0.1, 1.3, 0.01]);
    const autoMask = createAutoUnderMeshTrimMask(body, garmentOutside, 0.08);
    expect(autoMask.hiddenFlags[0]).toBe(1);
    expect(autoMask.hiddenFlags[3]).toBe(0);

    // 왼쪽(-0.1, 1.3, 0)에만 대칭 브러시를 칠해도 오른쪽(+0.1, 1.3, 0)까지 함께 숨겨져야 한다
    const painted = paintUnderMeshTrimBrush(
      { vertexCount: 6, hiddenFlags: new Uint8Array(6) },
      body.positions,
      [-0.1, 1.29, 0],
      0.1,
      "hide",
      true,
    );
    expect(Array.from(painted.hiddenFlags)).toEqual([1, 1, 1, 1, 1, 1]);

    const trimmedIndices = applyUnderMeshTrimToIndices(body.indices, painted);
    expect(trimmedIndices.length).toBe(0);
  });
});
