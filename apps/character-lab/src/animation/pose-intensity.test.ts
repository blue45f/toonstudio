import { describe, expect, it } from "vitest";

import { degToRad, qFromAxisAngle, qLength, qToAxisAngle, radToDeg } from "../shared/math";

import { scalePoseIntensity } from "./pose-intensity";

import type { Pose } from "../contracts";

describe("animation/pose-intensity", () => {
  const basePose: Pose = {
    leftUpperArm: qFromAxisAngle([0, 0, 1], degToRad(60)),
    head: qFromAxisAngle([0, 1, 0], degToRad(24)),
  };

  it("강도 0에서는 빈 Rest 포즈({})를 반환하고 1에서는 원래 각도를 유지한다", () => {
    expect(scalePoseIntensity(basePose, 0)).toEqual({});
    const same = scalePoseIntensity(basePose, 1);
    expect(same.leftUpperArm).toBeDefined();
    expect(radToDeg(qToAxisAngle(same.leftUpperArm!).angle)).toBeCloseTo(60, 3);
  });

  it("강도 0.5에서는 회전 각도를 절반으로 구면 보간하고 1.25에서는 웹툰 과장 각도로 확장한다", () => {
    const half = scalePoseIntensity(basePose, 0.5);
    expect(qLength(half.leftUpperArm!)).toBeCloseTo(1, 5);
    expect(radToDeg(qToAxisAngle(half.leftUpperArm!).angle)).toBeCloseTo(30, 2);
    expect(radToDeg(qToAxisAngle(half.head!).angle)).toBeCloseTo(12, 2);

    const exaggerated = scalePoseIntensity(basePose, 1.25);
    expect(qLength(exaggerated.leftUpperArm!)).toBeCloseTo(1, 5);
    expect(radToDeg(qToAxisAngle(exaggerated.leftUpperArm!).angle)).toBeCloseTo(75, 2);
  });
});
