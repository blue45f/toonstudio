import { describe, expect, it } from "vitest";

import {
  STUDIO_MANNEQUIN_POSE_PRESETS,
  createStudioMannequinRestPose,
  findStudioMannequinPosePreset,
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import {
  applyStudioMannequinHandPresetToPose,
  getStudioMannequinHandRotationDeg,
  mirrorStudioMannequinHandToOtherSide,
  offsetStudioMannequinHandRotation,
} from "./studio-mannequin-hand-controller";

const DEG_EPSILON = 1e-4;

function deg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** 몸 포즈가 분명히 있는 베이스(걷기)에 골반 오프셋까지 얹은 픽스처. */
function bodyPoseFixture(): StudioMannequinPose {
  const walk = findStudioMannequinPosePreset("walk");
  if (!walk) throw new Error("walk preset missing");
  return normalizeStudioMannequinPose({
    joints: { ...walk.pose.joints, leftHand: [0.2, 0.1, 0.3] },
    pelvisOffset: [0.1, -0.2, 0],
  });
}

describe("studio-mannequin-hand-controller 1단계 (크게 잡기)", () => {
  it("손 프리셋을 얹어도 몸 관절과 골반 오프셋은 그대로다", () => {
    const base = bodyPoseFixture();
    const fist = findStudioMannequinPosePreset("hand-fist");
    if (!fist) throw new Error("hand-fist preset missing");
    const next = applyStudioMannequinHandPresetToPose(base, fist.pose, "both");

    for (const [jointId, rotation] of Object.entries(base.joints)) {
      if (jointId === "leftHand" || jointId === "rightHand") continue;
      expect(next.joints[jointId as keyof typeof next.joints], jointId).toEqual(rotation);
    }
    expect(next.pelvisOffset).toEqual(base.pelvisOffset);
    // 손목은 프리셋 값으로 교체된다 (프리셋이 생략한 관절은 항등).
    expect(getStudioMannequinHandRotationDeg(next, "left").bendDeg).toBeCloseTo(
      deg(fist.pose.joints.leftHand?.[0] ?? 0),
      4,
    );
    expect(getStudioMannequinHandRotationDeg(next, "right").tiltDeg).toBeCloseTo(
      deg(fist.pose.joints.rightHand?.[2] ?? 0),
      4,
    );
  });

  it("한쪽만 적용하면 반대쪽 손목은 베이스 그대로다", () => {
    const base = bodyPoseFixture();
    const peace = findStudioMannequinPosePreset("hand-peace");
    if (!peace) throw new Error("hand-peace preset missing");
    const next = applyStudioMannequinHandPresetToPose(base, peace.pose, "left");
    expect(next.joints.rightHand).toEqual(base.joints.rightHand);
    expect(getStudioMannequinHandRotationDeg(next, "left").tiltDeg).toBeCloseTo(
      deg(peace.pose.joints.leftHand?.[2] ?? 0),
      4,
    );
  });

  it("셰이퍼 손 포즈 5종이 전부 마네킹 프리셋으로 존재해 1단계가 빈 적용이 되지 않는다", () => {
    for (const id of ["hand-fist", "hand-open", "hand-peace", "hand-point", "hand-chin"]) {
      expect(findStudioMannequinPosePreset(id), id).not.toBeNull();
    }
  });

  it("모든 손 프리셋은 1단계 적용 후에도 관절 한계 안이다", () => {
    const base = bodyPoseFixture();
    for (const preset of STUDIO_MANNEQUIN_POSE_PRESETS) {
      if (preset.category !== "hand") continue;
      const next = applyStudioMannequinHandPresetToPose(base, preset.pose, "both");
      for (const side of ["left", "right"] as const) {
        const rotation = getStudioMannequinHandRotationDeg(next, side);
        expect(Math.abs(rotation.bendDeg)).toBeLessThanOrEqual(65 + DEG_EPSILON);
        expect(Math.abs(rotation.twistDeg)).toBeLessThanOrEqual(35 + DEG_EPSILON);
      }
    }
  });
});

describe("studio-mannequin-hand-controller 2단계 (세부 조정)", () => {
  it("델타는 선택한 손목에만 더해지고 몸 포즈는 변하지 않는다", () => {
    const base = bodyPoseFixture();
    const next = offsetStudioMannequinHandRotation(base, "right", {
      bendDeg: 10,
      tiltDeg: -5,
    });
    const before = getStudioMannequinHandRotationDeg(base, "right");
    const after = getStudioMannequinHandRotationDeg(next, "right");
    expect(after.bendDeg - before.bendDeg).toBeCloseTo(10, 4);
    expect(after.tiltDeg - before.tiltDeg).toBeCloseTo(-5, 4);
    expect(next.joints.leftHand).toEqual(base.joints.leftHand);
    expect(next.joints.leftUpperLeg).toEqual(base.joints.leftUpperLeg);
    expect(next.pelvisOffset).toEqual(base.pelvisOffset);
  });

  it("과한 델타는 관절 한계에서 멈춘다", () => {
    const rest = createStudioMannequinRestPose();
    const next = offsetStudioMannequinHandRotation(rest, "left", { bendDeg: 500 });
    expect(getStudioMannequinHandRotationDeg(next, "left").bendDeg).toBeCloseTo(65, 4);
  });

  it("NaN 델타는 무시한다", () => {
    const base = bodyPoseFixture();
    const next = offsetStudioMannequinHandRotation(base, "left", {
      bendDeg: Number.NaN,
    });
    expect(next.joints.leftHand).toEqual(base.joints.leftHand);
  });
});

describe("studio-mannequin-hand-controller 미러 복사", () => {
  it("X는 유지하고 Y/Z 부호를 반전해 반대쪽에 복사한다", () => {
    const base = bodyPoseFixture();
    const next = mirrorStudioMannequinHandToOtherSide(base, "left");
    const source = getStudioMannequinHandRotationDeg(base, "left");
    const target = getStudioMannequinHandRotationDeg(next, "right");
    expect(target.bendDeg).toBeCloseTo(source.bendDeg, 4);
    expect(target.twistDeg).toBeCloseTo(-source.twistDeg, 4);
    expect(target.tiltDeg).toBeCloseTo(-source.tiltDeg, 4);
    // 복사해도 원본 손과 몸 포즈는 그대로다.
    expect(next.joints.leftHand).toEqual(base.joints.leftHand);
    expect(next.joints.leftUpperLeg).toEqual(base.joints.leftUpperLeg);
  });

  it("양방향으로 복사하면 원래 손목 값으로 돌아온다", () => {
    const base = bodyPoseFixture();
    const roundTrip = mirrorStudioMannequinHandToOtherSide(
      mirrorStudioMannequinHandToOtherSide(base, "left"),
      "right",
    );
    const before = getStudioMannequinHandRotationDeg(base, "left");
    const after = getStudioMannequinHandRotationDeg(roundTrip, "left");
    expect(after.bendDeg).toBeCloseTo(before.bendDeg, 4);
    expect(after.twistDeg).toBeCloseTo(before.twistDeg, 4);
    expect(after.tiltDeg).toBeCloseTo(before.tiltDeg, 4);
  });
});
