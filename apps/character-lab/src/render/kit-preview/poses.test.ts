import { describe, expect, it } from "vitest";

import { HUMANOID_BONE_NAMES, isHumanoidBoneName, isUnitQuat } from "../../contracts";
import { degToRad, qRotateVec3 } from "../../shared/math";

import { KIT_PREVIEW_POSE_IDS } from "./cli-args";
import { armAim, elbowFlex, fingerCurl, kneeFlex, legAim, presetPose, resolvePose, rotationFromSpec, thumbCurl } from "./poses";

import type { Vec3 } from "../../contracts";

function near(actual: Vec3, expected: Vec3, digits = 5): void {
  expect(actual[0]).toBeCloseTo(expected[0], digits);
  expect(actual[1]).toBeCloseTo(expected[1], digits);
  expect(actual[2]).toBeCloseTo(expected[2], digits);
}

describe("해부학 헬퍼는 앱의 포즈 규약(왼쪽 +X, 정면 +Z, 손바닥 아래)과 같은 방향을 만든다", () => {
  it("armAim: 왼팔(+X)을 45° 내리면 (cos45, −sin45, 0)", () => {
    near(qRotateVec3(armAim("left", 45, 0), [1, 0, 0]), [Math.cos(degToRad(45)), -Math.sin(degToRad(45)), 0]);
    near(qRotateVec3(armAim("right", 45, 0), [-1, 0, 0]), [-Math.cos(degToRad(45)), -Math.sin(degToRad(45)), 0]);
  });

  it("armAim: 음수 down은 팔을 올리고 forward는 앞(+Z)으로 보낸다", () => {
    expect(qRotateVec3(armAim("left", -80, 0), [1, 0, 0])[1]).toBeGreaterThan(0.95);
    expect(qRotateVec3(armAim("left", 0, 90), [1, 0, 0])[2]).toBeCloseTo(1, 5);
  });

  it("elbowFlex: 팔꿈치를 굽히면 전완이 앞(+Z)으로 온다(좌우 동일)", () => {
    near(qRotateVec3(elbowFlex("left", 90), [1, 0, 0]), [0, 0, 1]);
    near(qRotateVec3(elbowFlex("right", 90), [-1, 0, 0]), [0, 0, 1]);
  });

  it("kneeFlex: 정강이(−Y)가 뒤(−Z)로 접힌다", () => {
    near(qRotateVec3(kneeFlex(90), [0, -1, 0]), [0, 0, -1]);
  });

  it("legAim: 대퇴를 앞으로 90° 들면 +Z, 바깥으로 벌리면 해당 쪽 X", () => {
    near(qRotateVec3(legAim("left", 90, 0), [0, -1, 0]), [0, 0, 1]);
    expect(qRotateVec3(legAim("left", 0, 30), [0, -1, 0])[0]).toBeGreaterThan(0.4);
    expect(qRotateVec3(legAim("right", 0, 30), [0, -1, 0])[0]).toBeLessThan(-0.4);
  });

  it("fingerCurl: 손가락(+X)이 손바닥 쪽(아래, −Y)으로 말린다", () => {
    near(qRotateVec3(fingerCurl("left", 90), [1, 0, 0]), [0, -1, 0]);
    near(qRotateVec3(fingerCurl("right", 90), [-1, 0, 0]), [0, -1, 0]);
    // 엄지: 앞(+Z)에서 손바닥 쪽(−Y)으로
    expect(qRotateVec3(thumbCurl("left", 60), [Math.SQRT1_2, 0, Math.SQRT1_2])[1]).toBeLessThan(-0.3);
  });
});

describe("프리셋 포즈", () => {
  it("모든 프리셋 id를 만들 수 있고 본 이름은 휴머노이드 어휘, 회전은 단위 쿼터니언이다", () => {
    for (const id of KIT_PREVIEW_POSE_IDS) {
      const resolved = presetPose(id);
      expect(resolved.id).toBe(id);
      for (const [bone, rotation] of Object.entries(resolved.pose)) {
        expect(isHumanoidBoneName(bone), `${id}: ${bone}`).toBe(true);
        expect(isUnitQuat(rotation ?? [0, 0, 0, 0]), `${id}: ${bone}`).toBe(true);
      }
    }
  });

  it("t-pose는 델타가 없고, a-pose는 양 상완만 움직인다", () => {
    expect(presetPose("t-pose").pose).toEqual({});
    expect(Object.keys(presetPose("a-pose").pose).sort()).toEqual(["leftUpperArm", "rightUpperArm"]);
  });

  it("arms-up은 거리 배율이 커서 잘리지 않게 한다", () => {
    expect(presetPose("arms-up").framingScale).toBeGreaterThan(1);
    expect(presetPose("a-pose").framingScale).toBe(1);
  });

  it("각 포즈가 의도한 본을 움직인다", () => {
    expect(Object.keys(presetPose("elbows-bent").pose)).toEqual(expect.arrayContaining(["leftLowerArm", "rightLowerArm"]));
    expect(Object.keys(presetPose("squat").pose)).toEqual(expect.arrayContaining(["leftUpperLeg", "leftLowerLeg", "rightLowerLeg", "spine"]));
    expect(Object.keys(presetPose("sit").pose)).toEqual(expect.arrayContaining(["leftUpperLeg", "rightLowerLeg"]));
    expect(Object.keys(presetPose("twist").pose).sort()).toEqual(["chest", "spine", "upperChest"]);
    expect(Object.keys(presetPose("neck-turn").pose).sort()).toEqual(["head", "neck"]);
    const fist = Object.keys(presetPose("fist").pose);
    expect(fist).toHaveLength(2 * (4 * 3 + 3));
    expect(fist).toContain("leftThumbMetacarpal");
    expect(fist).toContain("rightLittleDistal");
  });

  it("앉기: 대퇴는 앞으로 약 88°, 무릎은 92° 굽는다", () => {
    const pose = presetPose("sit").pose;
    const thigh = pose.leftUpperLeg;
    const shin = pose.leftLowerLeg;
    expect(thigh && qRotateVec3(thigh, [0, -1, 0])[2]).toBeGreaterThan(0.99);
    expect(shin && qRotateVec3(shin, [0, -1, 0])[2]).toBeLessThan(-0.99);
  });
});

describe("resolvePose / rotationFromSpec", () => {
  it("none은 빈 포즈, preset은 프리셋, custom은 본 회전 표기를 쿼터니언으로 바꾼다", () => {
    expect(resolvePose({ kind: "none" })).toEqual({ id: "none", pose: {}, framingScale: 1 });
    expect(resolvePose({ kind: "preset", id: "a-pose" }).id).toBe("a-pose");
    const custom = resolvePose({
      kind: "custom",
      rotations: { leftUpperArm: { kind: "axis-angle", axis: [0, 0, 1], deg: -45 }, head: { kind: "quat", value: [0, 2, 0, 0] }, neck: { kind: "euler", degXyz: [0, 30, 0] }, notABone: { kind: "quat", value: [0, 0, 0, 1] } },
    });
    expect(custom.id).toBe("custom");
    expect(Object.keys(custom.pose).sort()).toEqual(["head", "leftUpperArm", "neck"]);
    expect(custom.pose.head).toEqual([0, 1, 0, 0]);
    near(qRotateVec3(custom.pose.leftUpperArm ?? [0, 0, 0, 1], [1, 0, 0]), [Math.cos(degToRad(45)), -Math.sin(degToRad(45)), 0]);
    // 오일러 Y 30° = Y축 회전
    near(qRotateVec3(rotationFromSpec({ kind: "euler", degXyz: [0, 30, 0] }), [0, 0, 1]), [Math.sin(degToRad(30)), 0, Math.cos(degToRad(30))]);
  });

  it("프리셋이 쓰는 본 이름은 계약 어휘의 부분집합이다", () => {
    for (const id of KIT_PREVIEW_POSE_IDS) for (const bone of Object.keys(presetPose(id).pose)) expect(HUMANOID_BONE_NAMES as readonly string[]).toContain(bone);
  });
});
