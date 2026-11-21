import { describe, expect, it } from "vitest";

import {
  ANATOMICAL_JOINT_ROM_LIMITS,
  OneEuroQuatFilter,
  OneEuroScalarFilter,
  OneEuroVec3Filter,
  clampJointRotationToRom,
  createWebcamPoseApplyCommand,
  decomposeSwingTwist,
  isSpaceInstantApplyShortcut,
  multiplyQuat,
  quatFromAxisAngle,
  solveAnalyticalSwingTwistLimbIk,
} from "./studio-analytical-twist-swing-ik";

describe("studio-analytical-twist-swing-ik", () => {
  it("decomposes arbitrary quaternions into exact swing * twist reconstruction", () => {
    const twistAxis = [1, 0, 0] as const;
    const expectedSwing = quatFromAxisAngle([0, 1, 0], 0.7);
    const expectedTwist = quatFromAxisAngle(twistAxis, -0.45);
    const combined = multiplyQuat(expectedSwing, expectedTwist);

    const { swing, twist, twistAngleRad, swingAngleRad } = decomposeSwingTwist(combined, twistAxis);
    const reconstructed = multiplyQuat(swing, twist);

    expect(twistAngleRad).toBeCloseTo(-0.45, 5);
    expect(swingAngleRad).toBeCloseTo(0.7, 5);
    const dot =
      Math.abs(
        reconstructed[0] * combined[0]
        + reconstructed[1] * combined[1]
        + reconstructed[2] * combined[2]
        + reconstructed[3] * combined[3],
      );
    expect(dot).toBeCloseTo(1, 6);
  });

  it("clamps joint hyperextension and excessive twist using anatomical ROM tables", () => {
    const impossibleKneeTwist = quatFromAxisAngle(
      ANATOMICAL_JOINT_ROM_LIMITS.leftKnee.twistAxis,
      Math.PI * 0.6,
    );
    const clampedKnee = clampJointRotationToRom(impossibleKneeTwist, "leftKnee");
    expect(clampedKnee.clamped).toBe(true);
    expect(Math.abs(clampedKnee.twistAngleRad)).toBeLessThanOrEqual(
      ANATOMICAL_JOINT_ROM_LIMITS.leftKnee.maxTwistRad + 1e-4,
    );

    const overFlexedFingerPip = quatFromAxisAngle([0, 0, 1], (150 * Math.PI) / 180);
    const clampedPip = clampJointRotationToRom(overFlexedFingerPip, "fingerPip");
    expect(clampedPip.clamped).toBe(true);
    expect(clampedPip.swingAngleRad).toBeLessThanOrEqual(
      ANATOMICAL_JOINT_ROM_LIMITS.fingerPip.maxSwingConeRad + 1e-4,
    );
  });

  it("solves closed-form 2-bone elbow IK reaching the target within bone lengths", () => {
    const result = solveAnalyticalSwingTwistLimbIk({
      rootPosition: [0, 1.4, 0],
      midPosition: [0.3, 1.4, 0],
      endPosition: [0.58, 1.4, 0],
      targetPosition: [0.35, 1.4, 0.25],
      poleHint: [0.15, 1.4, -0.4],
      midJointId: "leftElbow",
      upperTwistRad: 0.2,
    });

    expect(result.targetClampedByReach).toBe(false);
    expect(result.midFlexionRad).toBeGreaterThan(0.2);
    expect(result.midFlexionRad).toBeLessThanOrEqual(
      ANATOMICAL_JOINT_ROM_LIMITS.leftElbow.maxHingeRad + 1e-4,
    );

    const distToTarget = Math.hypot(
      result.solvedEndPosition[0] - 0.35,
      result.solvedEndPosition[1] - 1.4,
      result.solvedEndPosition[2] - 0.25,
    );
    expect(distToTarget).toBeLessThan(0.01);
  });

  it("suppresses webcam high-frequency jitter with 1-Euro filter while staying responsive", () => {
    const scalar = new OneEuroScalarFilter({ minCutoffHz: 1.0, beta: 0.05, dCutoffHz: 1.0 });
    const vec3 = new OneEuroVec3Filter({ minCutoffHz: 1.0, beta: 0.05 });
    const quat = new OneEuroQuatFilter({ minCutoffHz: 1.0, beta: 0.05 });

    // 정지 상태의 결정적 고주파 노이즈(±0.05) 입력 시 필터 출력 진폭이 크게 줄어야 한다
    let rawAbsSum = 0;
    let filteredAbsSum = 0;
    for (let i = 0; i < 60; i += 1) {
      const t = i / 60;
      const noise = i % 2 === 0 ? 0.05 : -0.05;
      const out = scalar.filter(noise, t);
      const outV = vec3.filter([noise, 0, -noise], t);
      const outQ = quat.filter(quatFromAxisAngle([0, 1, 0], noise), t);
      expect(Number.isFinite(outV[0])).toBe(true);
      expect(Math.hypot(outQ[0], outQ[1], outQ[2], outQ[3])).toBeCloseTo(1, 5);
      if (i >= 10) {
        rawAbsSum += Math.abs(noise);
        filteredAbsSum += Math.abs(out);
      }
    }
    expect(filteredAbsSum).toBeLessThan(rawAbsSum * 0.35);
  });

  it("handles Space instant-apply command and ignores editable text fields", () => {
    expect(isSpaceInstantApplyShortcut({ code: "Space", key: " " })).toBe(true);
    expect(isSpaceInstantApplyShortcut({ code: "Space", repeat: true })).toBe(false);
    expect(isSpaceInstantApplyShortcut({ code: "Space", target: { tagName: "INPUT" } })).toBe(false);
    expect(isSpaceInstantApplyShortcut({ code: "Space", ctrlKey: true })).toBe(false);

    const cmd = createWebcamPoseApplyCommand(
      { leftUpperArm: quatFromAxisAngle([0, 1, 0], 0.5) },
      {},
      12345,
    );
    expect(cmd.type).toBe("apply-webcam-ik-pose");
    expect(cmd.previousBoneRotations.leftUpperArm).toEqual([0, 0, 0, 1]);
  });
});
