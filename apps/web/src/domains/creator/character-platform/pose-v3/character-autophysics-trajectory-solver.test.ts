import { describe, expect, it } from "vitest";

import {
  DEFAULT_AUTOPHYSICS_CONFIG,
  applyIntervalEditPelvisDelta,
  computeHumanoidCenterOfMass,
  generateTweenPoseFrame,
  snapPoseFramesToGhost,
  solveAutoPhysicsTrajectory,
  type AutoPhysicsPoseKeyFrame,
} from "./character-autophysics-trajectory-solver";

function makePoseFrame(
  frameIndex: number,
  timeSec: number,
  x: number,
  pelvisY: number,
  grounded: boolean,
): AutoPhysicsPoseKeyFrame {
  return {
    frameIndex,
    timeSec,
    pelvisWorldM: [x, pelvisY, 0],
    chestWorldM: [x, pelvisY + 0.35, 0],
    headWorldM: [x, pelvisY + 0.65, 0],
    leftHandWorldM: [x - 0.3, pelvisY + 0.2, 0],
    rightHandWorldM: [x + 0.3, pelvisY + 0.2, 0],
    leftFootWorldM: [x - 0.12, grounded ? 0 : pelvisY - 0.9, 0],
    rightFootWorldM: [x + 0.12, grounded ? 0 : pelvisY - 0.9, 0],
    leftFootGrounded: grounded,
    rightFootGrounded: grounded,
  };
}

describe("character-autophysics-trajectory-solver", () => {
  it("computes exact ballistic parabolic trajectory for airborne jumps and snaps non-destructively", () => {
    // 0.0s 이륙(지면), 0.25s 공중(작가가 평평하게 잘못 찍은 키프레임), 0.5s 착지(지면)
    const frames = [
      makePoseFrame(0, 0.0, 0.0, 0.95, true),
      makePoseFrame(1, 0.25, 0.5, 0.95, false),
      makePoseFrame(2, 0.5, 1.0, 0.95, true),
    ];

    const rawMidCoM = computeHumanoidCenterOfMass(frames[1]);
    const ghost = solveAutoPhysicsTrajectory(frames, DEFAULT_AUTOPHYSICS_CONFIG);

    expect(ghost[0].isAirborne).toBe(false);
    expect(ghost[1].isAirborne).toBe(true);
    expect(ghost[2].isAirborne).toBe(false);

    // T = 0.5s 대칭 도약의 정점 상승 높이 = 1/8 * g * T^2 ≈ 0.3065m
    const expectedPeakLift = (1 / 8) * DEFAULT_AUTOPHYSICS_CONFIG.gravityMps2 * 0.5 * 0.5;
    expect(ghost[1].ghostCoM[1] - ghost[0].ghostCoM[1]).toBeCloseTo(expectedPeakLift, 3);
    expect(ghost[1].ghostCoM[1]).toBeGreaterThan(rawMidCoM[1] + 0.2);

    const snappedHalf = snapPoseFramesToGhost(frames, ghost, 0.5);
    expect(snappedHalf[1].pelvisWorldM[1]).toBeCloseTo(
      frames[1].pelvisWorldM[1] + ghost[1].pelvisCorrectionDeltaM[1] * 0.5,
      5,
    );
  });

  it("supports Cascadeur Interval Edit Mode with edge falloff and ballistic-arc tween generation", () => {
    const frames = [0, 1, 2, 3, 4].map((idx) => makePoseFrame(idx, idx * 0.1, 0, 0.95, true));
    const edited = applyIntervalEditPelvisDelta(
      frames,
      {
        active: true,
        startFrame: 1,
        endFrame: 2,
        borderAccentToken: "status-interval-edit",
        edgeFalloffFrames: 1,
      },
      [0, 0.1, 0],
    );

    expect(edited[1].pelvisWorldM[1]).toBeCloseTo(1.05, 5);
    expect(edited[2].pelvisWorldM[1]).toBeCloseTo(1.05, 5);
    // 경계 1프레임 밖(0번·3번)은 부드럽게 절반 감쇠, 4번은 0
    expect(edited[0].pelvisWorldM[1]).toBeCloseTo(1.0, 5);
    expect(edited[3].pelvisWorldM[1]).toBeCloseTo(1.0, 5);
    expect(edited[4].pelvisWorldM[1]).toBeCloseTo(0.95, 5);

    const tween = generateTweenPoseFrame(frames[0], frames[4], 0.5, "ballistic-arc");
    expect(tween.pelvisWorldM[1]).toBeGreaterThan(0.95);
    expect(tween.timeSec).toBeCloseTo(0.2, 5);
  });
});
