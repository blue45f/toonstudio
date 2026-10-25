import { describe, expect, it } from "vitest";

import { isUnitQuat } from "../contracts/pose";
import { qRotateVec3, v3Add, v3Cross, v3Distance, v3Dot, v3Normalize, v3Sub } from "../shared/math";

import {
  IK_REACH_TOLERANCE,
  computeGroundedBodyHeight,
  computeShaperDetachedBoneVolumes,
  computeShaperMuscleFatBlendShapeWeights,
  mirrorShaperPose,
  normalizeSignedAngleDeg,
  pairShaperSymmetryBones,
  rotationBetweenFrames,
  solveShaperOrientationConstraint,
  solveShaperTwistBoneChain,
  solveTwoBoneIk,
  syncShaperCostumeBones,
} from "./two-bone-ik";

import type { Vec3 } from "../contracts/pose";

/** 팔: 어깨(0,1.4,0) → 팔꿈치(0.3,1.4,0) → 손(0.55,1.4,0), 길이 0.3 + 0.25 */
const ROOT: Vec3 = [0, 1.4, 0];
const MID: Vec3 = [0.3, 1.4, 0];
const END: Vec3 = [0.55, 1.4, 0];

/** 결과 회전을 실제로 적용해 관절 위치를 재구성한다(솔버가 돌려준 위치와 독립적으로 검증). */
function reconstruct(result: ReturnType<typeof solveTwoBoneIk>): { mid: Vec3; end: Vec3 } {
  const upper = v3Sub(MID, ROOT);
  const lower = v3Sub(END, MID);
  const newUpper = qRotateVec3(result.rootRotation, upper);
  const mid = v3Add(ROOT, newUpper);
  const newLower = qRotateVec3(result.midRotation, qRotateVec3(result.rootRotation, lower));
  return { mid, end: v3Add(mid, newLower) };
}

describe("solveTwoBoneIk", () => {
  it("도달 가능한 목표는 오차 ≤ 1e-4로 도달하고 본 길이를 보존한다", () => {
    const target: Vec3 = [0.3, 1.1, 0.2];
    const result = solveTwoBoneIk({ root: ROOT, mid: MID, end: END, target });
    expect(result.reached).toBe(true);
    expect(result.error).toBeLessThanOrEqual(IK_REACH_TOLERANCE);
    expect(isUnitQuat(result.rootRotation)).toBe(true);
    expect(isUnitQuat(result.midRotation)).toBe(true);
    const rebuilt = reconstruct(result);
    expect(v3Distance(rebuilt.end, target)).toBeLessThanOrEqual(1e-4);
    expect(v3Distance(rebuilt.mid, ROOT)).toBeCloseTo(0.3, 6);
    expect(v3Distance(rebuilt.end, rebuilt.mid)).toBeCloseTo(0.25, 6);
    expect(v3Distance(rebuilt.mid, result.midPosition)).toBeLessThanOrEqual(1e-6);
  });

  it("pole 벡터가 있으면 중간 관절이 root·target·pole 평면 위에 놓이고 pole 쪽을 향한다", () => {
    const target: Vec3 = [0.2, 1.1, 0.1];
    const pole: Vec3 = [0.3, 1.6, 0.5];
    const result = solveTwoBoneIk({ root: ROOT, mid: MID, end: END, target, pole });
    expect(result.reached).toBe(true);
    const axis = v3Normalize(v3Sub(target, ROOT));
    const poleDir = v3Sub(pole, ROOT);
    const normal = v3Normalize(v3Cross(axis, poleDir));
    expect(Math.abs(v3Dot(v3Sub(result.midPosition, ROOT), normal))).toBeLessThanOrEqual(1e-6);
    // 축 성분을 뺀 pole 방향과 같은 쪽(내적 양수)
    const sidePole = v3Sub(poleDir, [axis[0] * v3Dot(poleDir, axis), axis[1] * v3Dot(poleDir, axis), axis[2] * v3Dot(poleDir, axis)]);
    const sideMid = v3Sub(v3Sub(result.midPosition, ROOT), [axis[0] * v3Dot(v3Sub(result.midPosition, ROOT), axis), axis[1] * v3Dot(v3Sub(result.midPosition, ROOT), axis), axis[2] * v3Dot(v3Sub(result.midPosition, ROOT), axis)]);
    expect(v3Dot(sidePole, sideMid)).toBeGreaterThan(0);
    // pole을 반대로 주면 중간 관절도 반대편으로 간다
    const flipped = solveTwoBoneIk({ root: ROOT, mid: MID, end: END, target, pole: [0.3, 1.2, -0.5] });
    expect(v3Dot(sideMid, v3Sub(flipped.midPosition, ROOT))).toBeLessThan(0);
  });

  it("도달 불가(너무 먼) 목표는 체인을 목표 방향으로 곧게 최대 신장하고 사유를 돌려준다", () => {
    const target: Vec3 = [1, 2, 0];
    const result = solveTwoBoneIk({ root: ROOT, mid: MID, end: END, target });
    expect(result.reached).toBe(false);
    expect(result.status).toBe("max-reach");
    expect(result.reasonKo).toMatch(/최대 신장/u);
    const dir = v3Normalize(v3Sub(target, ROOT));
    const rebuilt = reconstruct(result);
    const endDir = v3Normalize(v3Sub(rebuilt.end, ROOT));
    expect(v3Dot(dir, endDir)).toBeCloseTo(1, 6);
    expect(v3Distance(rebuilt.end, ROOT)).toBeCloseTo(0.55, 4);
    expect(result.error).toBeCloseTo(v3Distance(target, ROOT) - 0.55, 4);
    expect(result.midBendDeg).toBeLessThanOrEqual(0.5);
  });

  it("너무 가까운 목표는 최소 접힘으로 제한한다", () => {
    const result = solveTwoBoneIk({ root: ROOT, mid: MID, end: END, target: [0.01, 1.4, 0] });
    expect(result.reached).toBe(false);
    expect(result.status).toBe("min-fold");
    expect(result.reasonKo).toMatch(/가까워/u);
    expect(v3Distance(result.endPosition, ROOT)).toBeCloseTo(0.05, 4);
  });

  it("중간 관절 제한을 넘는 굽힘은 클램프하고 사유를 남긴다", () => {
    // 목표 거리 0.2 → 굽힘각 약 139°; 제한 90°면 d² = l1²+l2²+2·l1·l2·cos90 → d = sqrt(0.09+0.0625) ≈ 0.3905
    const target: Vec3 = [0.2, 1.4, 0];
    const result = solveTwoBoneIk({ root: ROOT, mid: MID, end: END, target, limits: { midMinDeg: 0, midMaxDeg: 90 } });
    expect(result.reached).toBe(false);
    expect(result.status).toBe("limited");
    expect(result.midBendDeg).toBeCloseTo(90, 6);
    expect(v3Distance(result.endPosition, ROOT)).toBeCloseTo(Math.sqrt(0.09 + 0.0625), 6);
    expect(result.reasonKo).toMatch(/제한/u);
    // 제한 안이면 그대로 도달
    const free = solveTwoBoneIk({ root: ROOT, mid: MID, end: END, target, limits: { midMinDeg: 0, midMaxDeg: 160 } });
    expect(free.reached).toBe(true);
  });

  it("현재 자세 그대로가 목표면 항등에 가깝고 굽힘 평면을 유지한다", () => {
    const bentMid: Vec3 = [0.2, 1.2, 0.1];
    const bentEnd: Vec3 = [0.4, 1.1, 0.2];
    const result = solveTwoBoneIk({ root: ROOT, mid: bentMid, end: bentEnd, target: bentEnd });
    expect(result.reached).toBe(true);
    expect(v3Distance(result.midPosition, bentMid)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(result.rootRotation[3])).toBeCloseTo(1, 6);
    expect(Math.abs(result.midRotation[3])).toBeCloseTo(1, 6);
  });

  it("본 길이 0·비유한 입력은 degenerate 사유로 항등을 돌려준다", () => {
    const zero = solveTwoBoneIk({ root: ROOT, mid: ROOT, end: END, target: [0, 0, 0] });
    expect(zero.status).toBe("degenerate");
    expect(zero.rootRotation).toEqual([0, 0, 0, 1]);
    const nan = solveTwoBoneIk({ root: ROOT, mid: MID, end: END, target: [Number.NaN, 0, 0] });
    expect(nan.status).toBe("degenerate");
    expect(nan.reasonKo).toMatch(/유한/u);
  });

  it("무작위 목표 100개를 결정적으로 모두 도달한다(도달 가능 범위 안)", () => {
    let seed = 7;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 100; i += 1) {
      const r = 0.1 + rand() * 0.44;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const target: Vec3 = [ROOT[0] + r * Math.sin(phi) * Math.cos(theta), ROOT[1] + r * Math.sin(phi) * Math.sin(theta), ROOT[2] + r * Math.cos(phi)];
      const result = solveTwoBoneIk({ root: ROOT, mid: MID, end: END, target, pole: [rand() - 0.5, 1.4 + rand() - 0.5, rand() - 0.5] });
      expect(result.reached).toBe(true);
      const rebuilt = reconstruct(result);
      expect(v3Distance(rebuilt.end, target)).toBeLessThanOrEqual(1e-4);
    }
  });
});

describe("rotationBetweenFrames", () => {
  it("방향과 법선을 함께 정렬한다", () => {
    const q = rotationBetweenFrames([1, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0]);
    const dir = qRotateVec3(q, [1, 0, 0]);
    const normal = qRotateVec3(q, [0, 0, 1]);
    expect(v3Distance(dir, [0, 1, 0])).toBeLessThanOrEqual(1e-6);
    expect(v3Distance(normal, [1, 0, 0])).toBeLessThanOrEqual(1e-6);
  });

  it("법선이 퇴화하면 방향만 정렬한다", () => {
    const q = rotationBetweenFrames([1, 0, 0], [0, 0, 0], [0, 0, 1], [0, 0, 0]);
    expect(v3Distance(qRotateVec3(q, [1, 0, 0]), [0, 0, 1])).toBeLessThanOrEqual(1e-6);
  });
});

describe("SHAPER TwistBone, OrientationConstraint 및 자동 지면 접지/신장 산출", () => {
  it("normalizeSignedAngleDeg 및 solveShaperTwistBoneChain: [-180°, 180°] 정규화 후 로컬 X축 비틀림만 분배한다", () => {
    expect(normalizeSignedAngleDeg(270)).toBeCloseTo(-90, 6);
    expect(normalizeSignedAngleDeg(-270)).toBeCloseTo(90, 6);

    const chain = solveShaperTwistBoneChain({
      startEulerDeg: [0, 45, 30],
      endEulerDeg: [300, -20, 15], // 300° -> -60°
      weights: [1 / 3, 2 / 3],
    });
    expect(chain).toHaveLength(2);
    expect(chain[0].localEulerDeg).toEqual([-20, 0, 0]);
    expect(chain[1].localEulerDeg).toEqual([-40, 0, 0]);
    expect(isUnitQuat(chain[0].localRotation)).toBe(true);
  });

  it("solveShaperOrientationConstraint: 두 회전의 50% Slerp 보조 본 회전을 계산한다", () => {
    const q0 = [0, 0, 0, 1] as const;
    const q90 = [0, Math.SQRT1_2, 0, Math.SQRT1_2] as const; // Y축 90°
    const half = solveShaperOrientationConstraint(q0, q90, 0.5);
    expect(isUnitQuat(half)).toBe(true);
    const rotated = qRotateVec3(half, [0, 0, 1]);
    expect(rotated[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(rotated[2]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it("computeGroundedBodyHeight: 최저 발목을 지면에 접지시키고 캐릭터 신장(cm)을 계산한다", () => {
    const res = computeGroundedBodyHeight({
      ankleLeftY: 0.15,
      ankleRightY: 0.05,
      defaultAnkleY: 0.08,
      rootPosition: [0, 0.95, 0],
      pelvisIkTargetY: 0.95,
      headBoneY: 1.52,
      headOffsetY: 0.02,
      headMeshMaxLocalY: 0.18,
    });
    expect(res.lowestAnkleY).toBeCloseTo(0.05, 6);
    expect(res.groundDeltaY).toBeCloseTo(-0.03, 6);
    expect(res.groundedRootPosition[1]).toBeCloseTo(0.98, 6);
    expect(res.groundedPelvisIkTargetY).toBeCloseTo(0.98, 6);
    // 접지 후 머리 높이: (1.52 - (-0.03)) + 0.02 + 0.18 = 1.75 m -> 175 cm
    expect(res.bodyHeightCm).toBe(175);
    expect(res.labelKo).toBe("신장 : 175 cm");
  });

  it("pairShaperSymmetryBones 및 mirrorShaperPose: Alt-클릭 포즈 미러링(FK sysmmetryM / IK sysmmetryMIK + 180° Y 오프셋)을 수행한다", () => {
    const pairs = pairShaperSymmetryBones(["RigLArmIK", "RigRArmIK", "BoneLUpperArm", "BoneRUpperArm", "BoneSpine"]);
    expect(pairs.get("RigLArmIK")).toBe("RigRArmIK");
    expect(pairs.get("BoneLUpperArm")).toBe("BoneRUpperArm");
    expect(pairs.has("BoneSpine")).toBe(false);

    const mirrored = mirrorShaperPose(
      [
        {
          boneName: "RigLArmIK",
          isIK: true,
          localPosition: [-0.35, 1.2, 0.15],
          localEulerDeg: [10, 30, -25],
        },
        {
          boneName: "BoneLUpperArm",
          isIK: false,
          localPosition: [-0.15, 1.4, 0],
          localEulerDeg: [15, -40, 20],
        },
      ],
      pairs,
    );
    expect(mirrored[0].boneName).toBe("RigRArmIK");
    expect(mirrored[0].localPosition).toEqual([0.35, 1.2, 0.15]);
    // IK Euler: [-10, normalize(-30 + 180) = 150, -25]
    expect(mirrored[0].localEulerDeg).toEqual([-10, 150, -25]);

    expect(mirrored[1].boneName).toBe("BoneRUpperArm");
    // FK Euler: [-15, 40, 20]
    expect(mirrored[1].localEulerDeg).toEqual([-15, 40, 20]);
  });

  it("평탄 스킨 본 볼륨 스케일(SplitSkinBones/SetBoneScale), 근육·체지방 블렌드쉐입(100 vs 90), 의상 본 동기화를 수행한다", () => {
    const skinStates = computeShaperDetachedBoneVolumes({
      bones: [
        {
          boneName: "BoneHead",
          isHeadBone: true,
          worldPosition: [0, 1.5, 0],
          worldRotation: [0, 0, 0, 1],
          scale: [1.3, 1.1, 1.2],
        },
        {
          boneName: "BoneLThigh",
          worldPosition: [-0.1, 0.9, 0],
          worldRotation: [0, 0, 0, 1],
          scale: [1.0, 1.0, 1.0],
          pivotScaleDelta: [2.0, 1.0, 2.0], // +0.2, +0.1, +0.2
          childOrgLocalPositions: { BoneLCalf: [0, -0.4, 0] },
        },
        {
          boneName: "BoneRThigh",
          worldPosition: [0.1, 0.9, 0],
          worldRotation: [0, 0, 0, 1],
          scale: [1.0, 1.0, 1.0],
        },
      ],
      bodyBoneSymmetry: true,
    });
    // 머리 본은 스킨 X 스케일을 1로 잠금
    expect(skinStates[0].skinLocalScale).toEqual([1, 1.1, 1.2]);
    // 좌측 허벅지 피벗 드래그 -> 우측 대칭 허벅지까지 [1.2, 1.1, 1.2] 동기화, 자식 정강이 위치 비례 스케일
    expect(skinStates[1].skinLocalScale[0]).toBeCloseTo(1.2, 6);
    expect(skinStates[1].scaledChildLocalPositions.BoneLCalf[1]).toBeCloseTo(-0.44, 6);
    expect(skinStates[2].skinLocalScale[0]).toBeCloseTo(1.2, 6);

    const clothWeights = computeShaperMuscleFatBlendShapeWeights({
      muscleSlider: 0.5,
      fatSlider: 0.25,
      costumeType: 1,
    });
    expect(clothWeights.bodyMuscleWeight).toBeCloseTo(50, 6);
    expect(clothWeights.costumeMuscleWeight).toBeCloseTo(45, 6);
    expect(clothWeights.costumeFatWeight).toBeCloseTo(22.5, 6);

    const shoeWeights = computeShaperMuscleFatBlendShapeWeights({
      muscleSlider: 0.5,
      fatSlider: 0.25,
      costumeType: 3,
    });
    expect(shoeWeights.costumeMuscleWeight).toBe(0);
    expect(shoeWeights.costumeFatWeight).toBe(0);

    const syncedCostume = syncShaperCostumeBones(["BoneLThigh", "BoneHead"], skinStates);
    expect(syncedCostume.length).toBe(2);
    expect(syncedCostume[0].skinLocalScale[0]).toBeCloseTo(1.2, 6);
  });
});
