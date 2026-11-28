import { describe, expect, it } from "vitest";

import { resolveStudioVrmPortraitBounds } from "./studio-vrm-portrait-framing";

const body = { min: [-0.5, 0, -0.2], max: [0.5, 1.8, 0.35] } as const;
const points = { head: [0, 1.55, 0], neck: [0, 1.43, 0], leftEye: [0.032, 1.64, 0.09], rightEye: [-0.032, 1.64, 0.09], chest: [0, 1.18, 0], leftUpperArm: [0.25, 1.38, 0], rightUpperArm: [-0.25, 1.38, 0] } as const;
type Vec3 = readonly [number, number, number];

describe("landmark portrait regions", () => {
  it.each(["closeup", "dramaticEye", "bust", "hairFront", "hairProfile", "hairBack"])("follows scale and translation for %s instead of assuming a standing origin", (id) => {
    const original = resolveStudioVrmPortraitBounds(id, body, points)!;
    for (const scale of [0.2, 0.5, 1, 2, 5]) {
      const transform = (v: Vec3): Vec3 => [v[0] * scale + 3, v[1] * scale - 2, v[2] * scale + 4];
      const transformed = resolveStudioVrmPortraitBounds(id, { min: transform(body.min), max: transform(body.max) },
        Object.fromEntries(Object.entries(points).map(([key, value]) => [key, transform(value)])))!;
      for (const edge of ["min", "max"] as const) transformed[edge].forEach((value, axis) => {
        expect(value).toBeCloseTo(transform(original[edge])[axis], 9);
      });
    }
  });
  it("헤어의 정면·측면·후면은 같은 두상 중심과 목덜미 여백을 유지한다", () => {
    const hair = resolveStudioVrmPortraitBounds("hairFront", body, points);
    expect(hair).not.toBeNull();
    expect(resolveStudioVrmPortraitBounds("hairProfile", body, points)).toEqual(hair);
    expect(resolveStudioVrmPortraitBounds("hairBack", body, points)).toEqual(hair);
    expect(hair?.min[1]).toBeLessThan(points.neck[1]);
    expect(hair?.max[1]).toBeGreaterThan(points.leftEye[1]);
    expect(hair?.min[2]).toBeLessThan(-points.leftEye[2]);
    const longHair = { min: [-0.28, 0.72, -0.35], max: [0.28, 1.85, 0.15] } as const;
    expect(resolveStudioVrmPortraitBounds("hairBack", body, points, longHair)?.min[1]).toBe(0.72);
  });

  it("includes shoulders and chest for a bust without zooming all the way out", () => {
    const face = resolveStudioVrmPortraitBounds("closeup", body, points)!;
    const bust = resolveStudioVrmPortraitBounds("bust", body, points)!;
    expect(bust.min[1]).toBeLessThan(face.min[1]);
    expect(bust.max[0]).toBeGreaterThan(face.max[0]);
    expect(bust.min[1]).toBeGreaterThan(body.min[1]);
  });
  it.each(["custom", "overShoulder", "front", "fullBody"])("does not override %s", (id) => {
    expect(resolveStudioVrmPortraitBounds(id, body, points)).toBeNull();
  });
  it("fails closed for missing, stale or invalid landmarks and bounds", () => {
    expect(resolveStudioVrmPortraitBounds("closeup", body, {})).toBeNull();
    expect(resolveStudioVrmPortraitBounds("closeup", body, { head: [99, 99, 99] })).toBeNull();
    expect(resolveStudioVrmPortraitBounds("closeup", { min: [NaN, 0, 0], max: [1, 1, 1] }, points)).toBeNull();
    expect(resolveStudioVrmPortraitBounds("closeup", body, { head: [0, 1.5, 0], neck: [NaN, 1, 0] })).not.toBeNull();
  });
});
