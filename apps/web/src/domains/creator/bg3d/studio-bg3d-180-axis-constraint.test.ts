import { describe, expect, it } from "vitest";

import {
  computeSignedDistanceToActionLine,
  constrainCameraTo180Axis,
  createActionLine180Frame,
  evaluate180RuleContinuity,
  flipActionLine180Side,
  generateShotReverseShotSuite,
} from "./studio-bg3d-180-axis-constraint";

describe("studio-bg3d-180-axis-constraint", () => {
  const actorA = { id: "hero", name: "수현", position: [-1.2, 0, 0] as const, eyeHeightM: 1.55 };
  const actorB = { id: "rival", name: "민재", position: [1.2, 0, 0] as const, eyeHeightM: 1.65 };

  it("locks the half-plane from the establishing camera and blocks crossing the 180-degree line", () => {
    const frame = createActionLine180Frame({
      actorA,
      actorB,
      referenceCameraPosition: [0, 1.6, 3.2],
      minClearanceM: 0.4,
    });

    expect(frame.lockedSide).toBe(1);
    expect(frame.separationM).toBeCloseTo(2.4, 3);

    // 허용 반평면(+Z) 안쪽은 보정 없음
    const safe = constrainCameraTo180Axis(frame, [0.5, 1.6, 2.0]);
    expect(safe.crossedAxis).toBe(false);
    expect(safe.clampedToClearance).toBe(false);
    expect(safe.correctionDistanceM).toBe(0);

    // 액션 라인을 넘어 반대편(-Z)으로 가려는 카메라는 경계 평면(+0.4m)으로 투영 보정
    const illegal = constrainCameraTo180Axis(frame, [0.5, 1.6, -2.5], "plane-project");
    expect(illegal.crossedAxis).toBe(true);
    expect(illegal.clampedToClearance).toBe(true);
    expect(illegal.signedDistanceAfterM).toBeGreaterThanOrEqual(0.4);
    expect(illegal.position[2]).toBeCloseTo(0.4, 3);
    expect(illegal.position[0]).toBeCloseTo(0.5, 3);
    expect(illegal.actorAOnScreenLeft).toBe(true);
  });

  it("preserves radial distance in orbit-clamp mode while staying inside the valid half-plane", () => {
    const frame = createActionLine180Frame({
      actorA,
      actorB,
      lockedSide: 1,
      minClearanceM: 0.5,
    });

    const orbit = constrainCameraTo180Axis(frame, [2.0, 1.6, -1.5], "orbit-clamp");
    expect(orbit.crossedAxis).toBe(true);
    expect(orbit.signedDistanceAfterM).toBeCloseTo(0.5, 2);
    const radiusBefore = Math.hypot(2.0, -1.5);
    const radiusAfter = Math.hypot(orbit.position[0], orbit.position[2]);
    expect(radiusAfter).toBeCloseTo(radiusBefore, 2);
  });

  it("generates a 5-shot establishing + OTS + closeup reverse-shot suite strictly on the locked half-plane", () => {
    const frame = createActionLine180Frame({
      actorA: { id: "a", name: "은서", position: [-1, 0, -1], eyeHeightM: 1.5 },
      actorB: { id: "b", name: "태오", position: [1, 0, 1], eyeHeightM: 1.7 },
      lockedSide: -1,
      minClearanceM: 0.35,
    });

    const shots = generateShotReverseShotSuite(frame);
    expect(shots).toHaveLength(5);

    for (const shot of shots) {
      const signed = computeSignedDistanceToActionLine(frame, shot.position);
      expect(Math.sign(signed)).toBe(frame.lockedSide);
      expect(Math.abs(signed)).toBeGreaterThanOrEqual(frame.minClearanceM - 1e-3);
      expect(shot.halfPlaneSide).toBe(-1);
      expect(shot.actorAOnScreenLeft).toBe(false);
    }

    const continuity = evaluate180RuleContinuity(
      frame,
      shots.map((shot) => ({ id: shot.id, cameraPosition: shot.position })),
    );
    expect(continuity.valid).toBe(true);
    expect(continuity.violations).toHaveLength(0);
  });

  it("detects unapproved 180-degree axis crossings while allowing explicit intentional axis switches", () => {
    const frame = createActionLine180Frame({ actorA, actorB, lockedSide: 1 });

    const broken = evaluate180RuleContinuity(frame, [
      { id: "cut-1", cameraPosition: [0, 1.6, 2.5] },
      { id: "cut-2", cameraPosition: [0, 1.6, -2.5] },
    ]);
    expect(broken.valid).toBe(false);
    expect(broken.violations).toHaveLength(1);
    expect(broken.violations[0]?.toShotId).toBe("cut-2");

    const intentional = evaluate180RuleContinuity(frame, [
      { id: "cut-1", cameraPosition: [0, 1.6, 2.5] },
      { id: "cut-2", cameraPosition: [0, 1.6, -2.5], intentionalAxisCross: true },
      { id: "cut-3", cameraPosition: [-0.8, 1.6, -1.8] },
    ]);
    expect(intentional.valid).toBe(true);

    const flipped = flipActionLine180Side(frame);
    expect(flipped.lockedSide).toBe(-1);
  });
});
