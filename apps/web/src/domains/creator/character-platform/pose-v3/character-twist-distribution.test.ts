import { describe, expect, it } from "vitest";

import type { CharacterQuaternion, CharacterVector3 } from "../pose/character-pose-v2";
import {
  distributeCharacterPoseTwist,
  distributeCharacterTwistRotation,
} from "./character-twist-distribution";

const AXIS_Y: CharacterVector3 = [0, 1, 0];
const IDENTITY: CharacterQuaternion = [0, 0, 0, 1];

function axisAngle(axis: CharacterVector3, radians: number): CharacterQuaternion {
  const half = radians / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

function multiply(a: CharacterQuaternion, b: CharacterQuaternion): CharacterQuaternion {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function angleBetween(a: CharacterQuaternion, b: CharacterQuaternion): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot));
}

describe("distributeCharacterTwistRotation", () => {
  it("비틀림 90° 중 절반을 아래 본으로 넘기고 합성 회전을 보존한다", () => {
    const upper = axisAngle(AXIS_Y, Math.PI / 2);
    const lower = axisAngle([1, 0, 0], 0.3);
    const result = distributeCharacterTwistRotation(
      { upper, lower, twistAxis: AXIS_Y },
      { share: 0.5 },
    );
    expect(result.applied).toBe(true);
    expect(result.twistRadians).toBeCloseTo(Math.PI / 2, 5);
    expect(result.distributedRadians).toBeCloseTo(Math.PI / 4, 5);
    // upper' ⊗ lower' == upper ⊗ lower (최종 자세 보존)
    const before = multiply(upper, lower);
    const after = multiply(result.upper, result.lower);
    expect(angleBetween(before, after)).toBeLessThan(1e-5);
    // 위 본의 비틀림은 절반으로 줄었다
    expect(angleBetween(result.upper, IDENTITY)).toBeCloseTo(Math.PI / 4, 4);
  });

  it("데드존 이하의 작은 비틀림은 건드리지 않는다", () => {
    const upper = axisAngle(AXIS_Y, 0.2);
    const result = distributeCharacterTwistRotation({ upper, lower: IDENTITY, twistAxis: AXIS_Y });
    expect(result.applied).toBe(false);
    expect(result.upper).toEqual(upper);
    expect(result.distributedRadians).toBe(0);
  });

  it("swing 성분은 위 본에 그대로 남는다", () => {
    const swing = axisAngle([1, 0, 0], 0.8);
    const upper = multiply(swing, axisAngle(AXIS_Y, 1.2));
    const result = distributeCharacterTwistRotation(
      { upper, lower: IDENTITY, twistAxis: AXIS_Y },
      { share: 0.5 },
    );
    expect(result.applied).toBe(true);
    const expectedUpper = multiply(swing, axisAngle(AXIS_Y, 0.6));
    expect(angleBetween(result.upper, expectedUpper)).toBeLessThan(1e-5);
  });

  it("share 0이면 미적용, 부호(음의 비틀림)도 분배한다", () => {
    const upper = axisAngle(AXIS_Y, -1.4);
    expect(distributeCharacterTwistRotation(
      { upper, lower: IDENTITY, twistAxis: AXIS_Y }, { share: 0 },
    ).applied).toBe(false);
    const negative = distributeCharacterTwistRotation(
      { upper, lower: IDENTITY, twistAxis: AXIS_Y }, { share: 0.5 },
    );
    expect(negative.applied).toBe(true);
    expect(negative.distributedRadians).toBeCloseTo(-0.7, 5);
  });

  it("잘못된 입력 쿼터니언은 항등으로 복구해 보고한다", () => {
    const result = distributeCharacterTwistRotation(
      { upper: [Number.NaN, 0, 0, 0], lower: IDENTITY, twistAxis: AXIS_Y },
    );
    expect(result.recoveredInvalidInput).toBe(true);
    expect(result.applied).toBe(false);
  });
});

describe("distributeCharacterPoseTwist", () => {
  it("팔 체인은 0.5, 다리 체인은 0.35 기본 비율로 영수증을 남긴다", () => {
    const bones = {
      leftUpperArm: axisAngle(AXIS_Y, 1.6),
      leftLowerArm: IDENTITY,
      leftUpperLeg: axisAngle(AXIS_Y, 1.0),
      leftLowerLeg: IDENTITY,
      head: IDENTITY,
    } as const;
    const result = distributeCharacterPoseTwist({
      bones,
      twistAxes: { leftUpperArm: AXIS_Y, leftUpperLeg: AXIS_Y },
    });
    expect(result.receipts).toHaveLength(2);
    const arm = result.receipts.find((receipt) => receipt.upperBone === "leftUpperArm")!;
    const leg = result.receipts.find((receipt) => receipt.upperBone === "leftUpperLeg")!;
    expect(arm.distributedRadians).toBeCloseTo(0.8, 5);
    expect(leg.distributedRadians).toBeCloseTo(0.35, 5);
    expect(result.bones.head).toEqual(IDENTITY);
    // 입력 맵은 불변
    expect(bones.leftUpperArm[1]).toBeCloseTo(Math.sin(0.8), 6);
  });

  it("축이 제공되지 않은 체인은 건너뛴다", () => {
    const result = distributeCharacterPoseTwist({
      bones: { leftUpperArm: axisAngle(AXIS_Y, 1.6), leftLowerArm: IDENTITY },
      twistAxes: {},
    });
    expect(result.receipts).toEqual([]);
  });
});
