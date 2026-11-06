import { describe, expect, it } from "vitest";

import { JOINT_LIMITS_DEG } from "../contracts/bones";
import { isUnitQuat } from "../contracts/pose";
import { degToRad, qFromAxisAngle, qMultiply, qRotationAngle, radToDeg } from "../shared/math";

import { canonicalQuat, clampBoneRotation, clampPoseToLimits, clampToJointLimit, isWithinJointLimit, poseLimitViolations, swingTwistAnglesDeg } from "./joint-limits";
import { createReferenceSkeleton } from "./reference-skeleton";

const X = [1, 0, 0] as const;

describe("swingTwistAnglesDeg", () => {
  it("축 둘레 회전은 전부 twist, 수직 축 회전은 전부 swing", () => {
    const twistOnly = swingTwistAnglesDeg(qFromAxisAngle(X, degToRad(40)), X);
    expect(twistOnly.twistDeg).toBeCloseTo(40, 6);
    expect(twistOnly.swingDeg).toBeCloseTo(0, 6);
    const swingOnly = swingTwistAnglesDeg(qFromAxisAngle([0, 0, 1], degToRad(70)), X);
    expect(swingOnly.swingDeg).toBeCloseTo(70, 6);
    expect(swingOnly.twistDeg).toBeCloseTo(0, 6);
    const negative = swingTwistAnglesDeg(qFromAxisAngle(X, degToRad(-25)), X);
    expect(negative.twistDeg).toBeCloseTo(-25, 6);
  });

  it("w<0 쿼터니언도 같은 회전으로 취급한다(canonical)", () => {
    const q = qFromAxisAngle(X, degToRad(30));
    const neg = [-q[0], -q[1], -q[2], -q[3]] as const;
    expect(swingTwistAnglesDeg(neg, X).twistDeg).toBeCloseTo(30, 6);
    expect(canonicalQuat(neg)[3]).toBeGreaterThan(0);
  });
});

describe("clampToJointLimit", () => {
  const limit = { swing: 60, twist: 30 };

  it("제한 안의 회전은 그대로 통과한다", () => {
    const q = qMultiply(qFromAxisAngle([0, 0, 1], degToRad(50)), qFromAxisAngle(X, degToRad(20)));
    const out = clampToJointLimit(q, X, limit);
    expect(qRotationAngle(qMultiply(out, [-q[0], -q[1], -q[2], q[3]]))).toBeLessThanOrEqual(1e-9);
  });

  it("swing·twist를 각각 한계로 클램프하고 단위 쿼터니언을 돌려준다", () => {
    const q = qMultiply(qFromAxisAngle([0, 0, 1], degToRad(120)), qFromAxisAngle(X, degToRad(-80)));
    const out = clampToJointLimit(q, X, limit);
    expect(isUnitQuat(out)).toBe(true);
    const angles = swingTwistAnglesDeg(out, X);
    expect(angles.swingDeg).toBeCloseTo(60, 5);
    expect(angles.twistDeg).toBeCloseTo(-30, 5);
    expect(isWithinJointLimit(out, X, limit)).toBe(true);
    expect(isWithinJointLimit(q, X, limit)).toBe(false);
  });

  it("twist 한계 0이면 twist를 완전히 제거한다", () => {
    const q = qMultiply(qFromAxisAngle([0, 1, 0], degToRad(20)), qFromAxisAngle(X, degToRad(50)));
    const out = clampToJointLimit(q, X, { swing: 25, twist: 0 });
    expect(Math.abs(swingTwistAnglesDeg(out, X).twistDeg)).toBeLessThanOrEqual(1e-6);
    expect(swingTwistAnglesDeg(out, X).swingDeg).toBeCloseTo(20, 5);
  });

  it("클램프는 단조다: 입력 각이 커질수록 출력 각은 줄지 않고 한계에서 포화한다", () => {
    let previous = -1;
    for (let deg = 0; deg <= 180; deg += 5) {
      const out = clampToJointLimit(qFromAxisAngle([0, 1, 0], degToRad(deg)), X, limit);
      const angle = radToDeg(qRotationAngle(out));
      expect(angle).toBeGreaterThanOrEqual(previous - 1e-6);
      expect(angle).toBeLessThanOrEqual(limit.swing + 1e-6);
      previous = angle;
    }
    expect(previous).toBeCloseTo(limit.swing, 5);
  });
});

describe("clampBoneRotation / clampPoseToLimits", () => {
  const skeleton = createReferenceSkeleton();

  it("JOINT_LIMITS_DEG를 본별로 적용한다(손가락 swing 95·twist 10)", () => {
    const q = qMultiply(qFromAxisAngle([0, 0, 1], degToRad(-150)), qFromAxisAngle(X, degToRad(40)));
    const out = clampBoneRotation(skeleton, "leftIndexProximal", q);
    const angles = swingTwistAnglesDeg(out, X);
    expect(angles.swingDeg).toBeCloseTo(JOINT_LIMITS_DEG.leftIndexProximal.swing, 4);
    expect(Math.abs(angles.twistDeg)).toBeCloseTo(JOINT_LIMITS_DEG.leftIndexProximal.twist, 4);
  });

  it("포즈 전체 클램프 후 위반 목록이 비고, 제한 안 본은 변하지 않는다", () => {
    const pose = {
      leftUpperArm: qFromAxisAngle([0, 0, 1], degToRad(-170)),
      head: qFromAxisAngle([0, 1, 0], degToRad(30)),
    };
    expect(poseLimitViolations(pose, skeleton).map((v) => v.bone)).toEqual(["leftUpperArm"]);
    const clamped = clampPoseToLimits(pose, skeleton);
    expect(poseLimitViolations(clamped, skeleton)).toEqual([]);
    for (let i = 0; i < 4; i += 1) expect(clamped.head?.[i]).toBeCloseTo(pose.head[i] ?? 0, 9);
  });

  it("머리(head)의 순수 Y축 요(65°)는 swing 결합(피치·롤 왜곡) 없이 twist 한계(70°) 안에서 그대로 보존된다", () => {
    const yaw65 = qFromAxisAngle([0, 1, 0], degToRad(65));
    const headAngles = swingTwistAnglesDeg(yaw65, [0, 1, 0]);
    expect(headAngles.twistDeg).toBeCloseTo(65, 6);
    expect(headAngles.swingDeg).toBeCloseTo(0, 6);
    expect(poseLimitViolations({ head: yaw65 }, skeleton)).toEqual([]);
    const clampedHead = clampBoneRotation(skeleton, "head", yaw65);
    expect(clampedHead[0]).toBeCloseTo(0, 9);
    expect(clampedHead[2]).toBeCloseTo(0, 9);
    for (let i = 0; i < 4; i += 1) expect(clampedHead[i]).toBeCloseTo(yaw65[i] ?? 0, 9);

    // 손목(leftHand / rightHand)도 [±1, 0, 0] twist 축을 사용해 순수 X축 회전이 swing 없이 twist로 분해·클램프된다
    const wristTwist = qFromAxisAngle([1, 0, 0], degToRad(40));
    const clampedLeftWrist = clampBoneRotation(skeleton, "leftHand", wristTwist);
    const leftWristAngles = swingTwistAnglesDeg(clampedLeftWrist, [1, 0, 0]);
    expect(leftWristAngles.swingDeg).toBeCloseTo(0, 6);
    expect(leftWristAngles.twistDeg).toBeCloseTo(JOINT_LIMITS_DEG.leftHand.twist, 4);
  });
});

