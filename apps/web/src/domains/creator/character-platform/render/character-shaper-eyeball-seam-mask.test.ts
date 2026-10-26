import { describe, expect, it } from "vitest";

import {
  alignThreeZoneHeadSeamCentroids,
  computeBodyOcclusionMask,
  computeEyeballHighlightOffset,
  computeShaperAnisotropicOutlineOffset,
  computeShaperCubicMatCapIntensity,
  findSamePositionNeckVertices,
  nudgeEyeballRotationByArrow,
  rebindAccessoryParentBone,
  ShaperEyeballSeamMaskError,
  toggleEyeballCameraLock,
  updateEyeballCameraGaze,
  weldNeckSeamVertices,
  type EyeballSceneContext,
  type ShaperEyeballData,
} from "./character-shaper-eyeball-seam-mask";

const SAMPLE_SCENE: EyeballSceneContext = {
  cameraPosition: [0.3, 1.65, 1.2],
  cameraForward: [0, 0, -1],
  mainLightDirection: [-0.5, -0.7, -0.5],
  headPosition: [0, 1.55, 0],
  headForward: [0, 0, 1],
  headUp: [0, 1, 0],
  headRight: [1, 0, 0],
  leftEyePosition: [-0.032, 1.56, 0.08],
  rightEyePosition: [0.032, 1.56, 0.08],
};

function createSampleEyeball(): ShaperEyeballData {
  return {
    highlightType: "fix",
    fixEyeballCam: false,
    symmetryGaze: true,
    ebhp: [0.05, 0.08],
    eblt: [0, 0, 0],
    ebrt: [0, 0, 0],
    irisScale: 1.0,
    highlightIntensity: 0.9,
  };
}

describe("character-shaper-eyeball-seam-mask", () => {
  it("computes eyeball highlight offset (ebhp) for fix, cam, light, and world modes", () => {
    const base = createSampleEyeball();
    expect(computeEyeballHighlightOffset(base, SAMPLE_SCENE)).toEqual([0.05, 0.08]);

    const camOffset = computeEyeballHighlightOffset(
      { ...base, highlightType: "cam" },
      SAMPLE_SCENE,
    );
    expect(camOffset[0]).toBeGreaterThan(0);
    expect(camOffset[1]).toBeGreaterThan(0);

    const lightOffset = computeEyeballHighlightOffset(
      { ...base, highlightType: "light" },
      SAMPLE_SCENE,
    );
    expect(lightOffset[0]).toBeGreaterThan(0);
    expect(lightOffset[1]).toBeGreaterThan(0);

    const worldOffset = computeEyeballHighlightOffset(
      { ...base, highlightType: "world" },
      SAMPLE_SCENE,
    );
    expect(worldOffset[0]).toBeGreaterThan(0);
    expect(worldOffset[1]).toBeGreaterThan(0);
  });

  it("toggles [F10] camera gaze lock and updates left/right eyeball rotations (eblt, ebrt)", () => {
    const base = createSampleEyeball();
    const toggledOn = toggleEyeballCameraLock(base);
    expect(toggledOn.eyeball.fixEyeballCam).toBe(true);
    expect(toggledOn.statusMessage).toBe("카메라 응시 고정 [F10] 켜짐");

    const gazed = updateEyeballCameraGaze(
      { ...toggledOn.eyeball, highlightType: "cam" },
      SAMPLE_SCENE,
    );
    // 카메라가 우측(+X) 상방(+Y)에 있으므로 yaw > 0, pitch < 0 (위로 시선 회전)
    expect(gazed.eblt[1]).toBeGreaterThan(0);
    expect(gazed.ebrt[1]).toBeGreaterThan(0);
    expect(gazed.eblt[0]).toBeLessThan(0);

    const toggledOff = toggleEyeballCameraLock(gazed);
    expect(toggledOff.eyeball.fixEyeballCam).toBe(false);
    expect(toggledOff.statusMessage).toBe("카메라 응시 고정 [F10] 꺼짐");
  });

  it("applies [Shift]+[Arrow] eyeball rotation in symmetric and asymmetric modes", () => {
    const symmetric = createSampleEyeball();
    const fineUp = nudgeEyeballRotationByArrow(symmetric, {
      key: "ArrowUp",
      shiftKey: true,
    });
    expect(fineUp.eblt[0]).toBeCloseTo(-0.5, 5);
    expect(fineUp.ebrt[0]).toBeCloseTo(-0.5, 5);

    const mirroredRight = nudgeEyeballRotationByArrow(symmetric, {
      key: "ArrowRight",
      shiftKey: false,
      mirrorHorizontalInSymmetry: true,
    });
    expect(mirroredRight.eblt[1]).toBeCloseTo(2.0, 5);
    expect(mirroredRight.ebrt[1]).toBeCloseTo(-2.0, 5);

    const asymmetricLeftOnly = nudgeEyeballRotationByArrow(
      { ...symmetric, symmetryGaze: false },
      {
        key: "ArrowLeft",
        shiftKey: true,
        targetEye: "left",
      },
    );
    expect(asymmetricLeftOnly.eblt[1]).toBeCloseTo(-0.5, 5);
    expect(asymmetricLeftOnly.ebrt[1]).toBe(0);
  });

  it("matches and welds head-neck-body boundary vertices via weldNeckSeamVertices", () => {
    const headVertices = [
      { vertexIndex: 100, position: [-0.04, 1.38, 0.02] as const, normal: [0, 0.6, 0.8] as const },
      { vertexIndex: 101, position: [0.04, 1.38, 0.02] as const, normal: [0, 0.6, 0.8] as const },
      { vertexIndex: 102, position: [0.0, 1.52, 0.1] as const, normal: [0, 0, 1] as const },
    ];
    const bodyVertices = [
      {
        vertexIndex: 200,
        position: [-0.0405, 1.3795, 0.0202] as const,
        normal: [0, 0.2, 0.98] as const,
      },
      {
        vertexIndex: 201,
        position: [0.0398, 1.3802, 0.0199] as const,
        normal: [0, 0.2, 0.98] as const,
      },
    ];

    const pairs = findSamePositionNeckVertices(headVertices, bodyVertices, 0.002);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]?.headVertexIndex).toBe(100);
    expect(pairs[0]?.bodyVertexIndex).toBe(200);

    const welded = weldNeckSeamVertices({
      headVertices,
      bodyVertices,
      epsilon: 0.002,
      blendWeight: 0.5,
    });
    expect(welded.headVertices[0]!.position).toEqual(welded.bodyVertices[0]!.position);
    expect(welded.headVertices[0]!.normal).toEqual(welded.bodyVertices[0]!.normal);
    // 비경계 정점(102)은 원래 위치 유지
    expect(welded.headVertices[2]!.position).toEqual(headVertices[2]!.position);

    expect(() => findSamePositionNeckVertices(headVertices, bodyVertices, 0)).toThrow(
      ShaperEyeballSeamMaskError,
    );
  });

  it("computes costume body occlusion mask (_MaskTex) and rebinds accessory parent bone preserving world transform", () => {
    const mask = computeBodyOcclusionMask(
      {
        clothTop: "longSleeve",
        clothBottom: "shorts",
        shoes: "kneeBoots",
      },
      16,
    );

    expect(mask.regionVisibility.upperChest).toBe(0);
    expect(mask.regionVisibility.forearms).toBe(0);
    expect(mask.regionVisibility.thighs).toBe(0);
    expect(mask.regionVisibility.calves).toBe(0);
    expect(mask.regionVisibility.feet).toBe(0);
    expect(mask.maskTexPixels.some((px) => px === 0)).toBe(true);

    const nudeMask = computeBodyOcclusionMask(
      {
        clothTop: "none",
        clothBottom: "none",
        shoes: "none",
      },
      8,
    );
    expect(nudeMask.hiddenRegions).toHaveLength(0);
    expect(nudeMask.maskTexPixels.every((px) => px === 255)).toBe(true);

    // 액세서리 부모 본 재바인딩 (SetParentBoneByName)
    const headBone = {
      boneName: "Head",
      worldPosition: [0, 1.5, 0] as const,
      worldEulerDeg: [0, 90, 0] as const,
      worldScale: [1, 1, 1] as const,
    };
    const handBone = {
      boneName: "RightHand",
      worldPosition: [0.4, 1.1, 0.2] as const,
      worldEulerDeg: [0, 0, 0] as const,
      worldScale: [2, 2, 2] as const,
    };
    const glassesOnHead = {
      accessoryId: "acc_glasses",
      parentBoneName: "Head",
      px: 0,
      py: 0.1,
      pz: 0.15,
      rx: 0,
      ry: 0,
      rz: 0,
      sx: 1,
      sy: 1,
      sz: 1,
    };

    const reboundToHand = rebindAccessoryParentBone(glassesOnHead, headBone, handBone);
    expect(reboundToHand.parentBoneName).toBe("RightHand");
    expect(reboundToHand.sx).toBeCloseTo(0.5, 5);
    expect(reboundToHand.ry).toBeCloseTo(90, 5);

    // 다시 Head 본으로 재바인딩하면 원래 로컬 오프셋으로 정확히 복원되어야 함
    const roundTripToHead = rebindAccessoryParentBone(reboundToHand, handBone, headBone);
    expect(roundTripToHead.parentBoneName).toBe("Head");
    expect(roundTripToHead.px).toBeCloseTo(glassesOnHead.px, 5);
    expect(roundTripToHead.py).toBeCloseTo(glassesOnHead.py, 5);
    expect(roundTripToHead.pz).toBeCloseTo(glassesOnHead.pz, 5);
    expect(roundTripToHead.ry).toBeCloseTo(glassesOnHead.ry, 5);
    expect(roundTripToHead.sx).toBeCloseTo(glassesOnHead.sx, 5);
  });

  it("aligns 3-zone head seam centroids, evaluates 125*(1-w)^3 cubic MatCap ramp, and computes 1.5*0.3 anisotropic outline offset", () => {
    const seamVerts = [
      { vertexIndex: 0, position: [-0.8, 1.38, 0.0] as const, normal: [0, 1, 0] as const },
      { vertexIndex: 1, position: [0.0, 1.38, 0.0] as const, normal: [0, 1, 0] as const },
      { vertexIndex: 2, position: [0.8, 1.38, 0.0] as const, normal: [0, 1, 0] as const },
    ];
    const aligned = alignThreeZoneHeadSeamCentroids(seamVerts, {
      left: [-0.85, 1.4, 0.02],
      center: [0.0, 1.39, 0.01],
      right: [0.85, 1.4, 0.02],
    });
    expect(aligned.zoneCounts).toEqual({ left: 1, center: 1, right: 1 });
    expect(aligned.alignedVertices[0]!.position).toEqual([-0.85, 1.4, 0.02]);
    expect(aligned.alignedVertices[1]!.position).toEqual([0.0, 1.39, 0.01]);
    expect(aligned.alignedVertices[2]!.position).toEqual([0.85, 1.4, 0.02]);

    const matcapZero = computeShaperCubicMatCapIntensity(0);
    const matcapHalf = computeShaperCubicMatCapIntensity(0.5);
    const matcapFull = computeShaperCubicMatCapIntensity(1);
    expect(matcapZero.rawIntensity).toBeCloseTo(125, 6);
    expect(matcapHalf.rawIntensity).toBeCloseTo(15.625, 6);
    expect(matcapFull.rawIntensity).toBe(0);

    const outline = computeShaperAnisotropicOutlineOffset({
      normal: [0, 0, 1],
      outlineThickness: 0.01,
      curvatureWeightG: 0.8,
      seamSuppressionB: 0.5,
    });
    // 0.01 * 1.5 * 0.3 * 0.8 * 0.5 = 0.0018
    expect(outline.effectiveScale).toBeCloseTo(0.0018, 6);
    expect(outline.offset).toEqual([0, 0, 0.0018]);
  });
});
