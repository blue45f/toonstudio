import { describe, expect, it } from "vitest";

import {
  buildStudioVrmJointLimitProximityMap,
  evaluateStudioVrmJointLimitProximity,
} from "./studio-vrm-joint-limit-proximity";

const d = (degrees: number) => (degrees * Math.PI) / 180;

describe("VRM joint limit proximity (해부학 한계 경고 판정)", () => {
  it("returns null for rotations comfortably inside the soft range", () => {
    expect(evaluateStudioVrmJointLimitProximity("head", [0, 0, 0])).toBeNull();
    expect(evaluateStudioVrmJointLimitProximity("leftUpperArm", [d(-40), 0, d(20)])).toBeNull();
  });

  it("warns 'near' when a rotation approaches the soft boundary from inside", () => {
    // head.x soft range is [-32°, 38°]; 35° leaves a 3° margin.
    const result = evaluateStudioVrmJointLimitProximity("head", [d(35), 0, 0]);
    expect(result?.severity).toBe("near");
    expect(result?.axis).toBe("x");
    expect(result?.softExcessProgress).toBe(0);
    expect(result?.label).toContain("해부학 한계");
  });

  it("scales severity with progress from the soft boundary toward the hard boundary", () => {
    // leftLowerLeg.x soft max 130°, hard max 155°.
    const mild = evaluateStudioVrmJointLimitProximity("leftLowerLeg", [d(140), 0, 0]);
    expect(mild?.severity).toBe("near");
    expect(mild?.softExcessProgress).toBeCloseTo(0.4, 6);
    const deep = evaluateStudioVrmJointLimitProximity("leftLowerLeg", [d(150), 0, 0]);
    expect(deep?.severity).toBe("at");
    expect(deep?.softExcessProgress).toBeCloseTo(0.8, 6);
  });

  it("reports the worst axis when several axes are close to their limits", () => {
    // neck.x soft [-35°, 40°] (35° is inside-near), neck.y soft [-55°, 55°], 80° exceeds hard 75°
    // after canonical hard clamp evaluation the y value stays beyond soft with progress 1.
    const result = evaluateStudioVrmJointLimitProximity("neck", [d(35), d(80), 0]);
    expect(result?.axis).toBe("y");
    expect(result?.severity).toBe("at");
  });

  it("canonicalizes wrapped angles before judging", () => {
    // 350° wraps to -10°, comfortably inside the head.x soft range.
    expect(evaluateStudioVrmJointLimitProximity("head", [d(350), 0, 0])).toBeNull();
  });

  it("applies the rig profile's narrowed soft range when a profile is given", () => {
    // leftLowerLeg.x = 100° sits comfortably inside the base soft range (max 130°) …
    const rotation = [d(100), 0, 0] as const;
    expect(evaluateStudioVrmJointLimitProximity("leftLowerLeg", rotation)).toBeNull();
    // … but the 'limited' profile narrows the soft interval to ≈100.7°, so the same pose warns.
    const withProfile = evaluateStudioVrmJointLimitProximity("leftLowerLeg", rotation, "limited");
    expect(withProfile).not.toBeNull();
    expect(withProfile?.severity).toBe("near");
  });

  it("falls back to base limits for malformed profile input instead of failing", () => {
    const rotation = [d(150), 0, 0] as const;
    const result = evaluateStudioVrmJointLimitProximity("leftLowerLeg", rotation, { bogus: true });
    expect(result?.severity).toBe("at");
  });

  it("builds a warning map that skips rotation-less (direction-only) bones", () => {
    const map = buildStudioVrmJointLimitProximityMap({
      leftLowerLeg: { rotation: [d(150), 0, 0] },
      leftUpperArm: { direction: { sideX: 0.3, y: -0.9 } },
      head: { rotation: [0, 0, 0] },
    });
    expect(Object.keys(map)).toEqual(["leftLowerLeg"]);
    expect(map.leftLowerLeg?.severity).toBe("at");
  });

  it("handles malformed rotations without throwing", () => {
    expect(evaluateStudioVrmJointLimitProximity("head", [Number.NaN, "x", null])).toBeNull();
    expect(evaluateStudioVrmJointLimitProximity("unknown-bone", [d(170), 0, 0])).not.toBeNull();
  });
});
