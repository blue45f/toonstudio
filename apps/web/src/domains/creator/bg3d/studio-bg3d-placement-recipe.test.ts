import { describe, expect, it } from "vitest";

import { groundModelTransform, rotateVectorEulerXyz } from "./studio-bg3d-object-ops";
import { planStudioBg3dModelPlacementRecipe } from "./studio-bg3d-placement-recipe";

type Vec3 = readonly [number, number, number];

/** 로컬 경계의 여덟 모서리를 변환(스케일 → 회전 → 이동)해 얻은 월드 축 정렬 경계. */
function worldBoundsOf(
  localMin: Vec3,
  localMax: Vec3,
  position: Vec3,
  rotation: Vec3,
  scale: Vec3,
): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const x of [localMin[0], localMax[0]]) {
    for (const y of [localMin[1], localMax[1]]) {
      for (const z of [localMin[2], localMax[2]]) {
        const rotated = rotateVectorEulerXyz([x * scale[0], y * scale[1], z * scale[2]], rotation);
        for (let axis = 0; axis < 3; axis += 1) {
          const value = rotated[axis] + position[axis];
          min[axis] = Math.min(min[axis], value);
          max[axis] = Math.max(max[axis], value);
        }
      }
    }
  }
  return { min, max };
}

describe("planStudioBg3dModelPlacementRecipe", () => {
  it("returns identity-scale grounded placement for a unit seed", () => {
    const result = planStudioBg3dModelPlacementRecipe({
      position: [3, 99, -1],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      boundingSize: [2, 4, 2],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Same ground contract as groundModelTransform (halfExtentsFromSize + groundTransformPosition).
    expect(result.position).toEqual(
      groundModelTransform([2, 4, 2], [3, 99, -1], [0, 0, 0], [1, 1, 1]),
    );
    expect(result.rotation).toEqual([0, 0, 0]);
    expect(result.scale).toEqual([1, 1, 1]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("auto-fits so the largest bounding extent does not exceed the target", () => {
    const result = planStudioBg3dModelPlacementRecipe({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [2, 2, 2],
      boundingSize: [4, 2, 1],
      autoFitTargetSize: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // max(|4*2|, |2*2|, |1*2|) = 8 → factor 2/8 = 0.25 → scale 0.5
    expect(result.scale[0]).toBeCloseTo(0.5, 9);
    expect(result.scale[1]).toBeCloseTo(0.5, 9);
    expect(result.scale[2]).toBeCloseTo(0.5, 9);
    const extents = [4, 2, 1].map((size, index) => Math.abs(size * result.scale[index]));
    expect(Math.max(...extents)).toBeLessThanOrEqual(2 + 1e-9);
  });

  it("does not enlarge models already under the auto-fit target", () => {
    const result = planStudioBg3dModelPlacementRecipe({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      boundingSize: [1, 1, 1],
      autoFitTargetSize: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scale).toEqual([1, 1, 1]);
  });

  it("grounds to a custom groundY and applies yaw degrees to rotation Y", () => {
    const result = planStudioBg3dModelPlacementRecipe({
      position: [1, 0, 2],
      rotation: [0.1, 0.2, 0.3],
      scale: [1, 1, 1],
      boundingSize: [2, 2, 2],
      groundY: 5,
      yawDegrees: 90,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rotation[0]).toBeCloseTo(0.1, 9);
    expect(result.rotation[1]).toBeCloseTo(0.2 + Math.PI / 2, 9);
    expect(result.rotation[2]).toBeCloseTo(0.3, 9);
    // Yaw changes the oriented AABB, so ground height is recomputed from the final rotation —
    // not the naive half-extent on groundY alone.
    expect(result.position).toEqual(
      groundModelTransform(
        [2, 2, 2],
        [1, 0, 2],
        [result.rotation[0], result.rotation[1], result.rotation[2]],
        [1, 1, 1],
        5,
      ),
    );
    expect(result.position[0]).toBe(1);
    expect(result.position[2]).toBe(2);
    expect(result.position[1]).toBeGreaterThan(5);
  });

  it("fails closed on non-finite and invalid inputs without mutating the seed", () => {
    const seed = {
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
      boundingSize: [1, 1, 1] as [number, number, number],
    };
    const snapshot = structuredClone(seed);

    expect(planStudioBg3dModelPlacementRecipe({
      ...seed,
      position: [0, Number.NaN, 0],
    }).ok).toBe(false);
    expect(planStudioBg3dModelPlacementRecipe({
      ...seed,
      autoFitTargetSize: 0,
    }).ok).toBe(false);
    expect(planStudioBg3dModelPlacementRecipe({
      ...seed,
      yawDegrees: Number.POSITIVE_INFINITY,
    }).ok).toBe(false);
    expect(planStudioBg3dModelPlacementRecipe({
      ...seed,
      scale: [0, 1, 1],
    }).ok).toBe(false);
    expect(planStudioBg3dModelPlacementRecipe(null as never).ok).toBe(false);

    for (const result of [
      planStudioBg3dModelPlacementRecipe({ ...seed, position: [Number.NaN, 0, 0] }),
      planStudioBg3dModelPlacementRecipe({ ...seed, autoFitTargetSize: -1 }),
    ]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(typeof result.reason).toBe("string");
        expect(result.reason.length).toBeGreaterThan(0);
        // Korean failure copy for user-facing paths.
        expect(/[가-힣]/u.test(result.reason)).toBe(true);
      }
    }

    expect(seed).toEqual(snapshot);
  });
});

describe("planStudioBg3dModelPlacementRecipe — 피벗이 중심이 아닌 모델", () => {
  const localMin: Vec3 = [-0.2, 0, -1.5];
  const localMax: Vec3 = [1.8, 4, 0.5];
  const boundingSize: Vec3 = [2, 4, 2];
  const boundsCenterOffset: Vec3 = [0.8, 2, -0.5];

  it("발치에 피벗이 있는 모델도 경계 아래면이 접지 높이에 닿는다", () => {
    const result = planStudioBg3dModelPlacementRecipe({
      position: [0, 9, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      boundingSize,
      boundsCenterOffset,
      groundY: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bounds = worldBoundsOf(localMin, localMax, result.position, result.rotation, result.scale);
    expect(bounds.min[1]).toBeCloseTo(0, 9);
    // 정렬 목표가 없으면 피벗의 X/Z 를 그대로 둔다.
    expect(result.position[0]).toBe(0);
    expect(result.position[2]).toBe(0);
  });

  it("스케일·요 회전과 함께 써도 경계 중심이 목표 X/Z 에, 아래면이 접지 높이에 놓인다", () => {
    for (const yawDegrees of [0, 90, 180, -90, 37]) {
      const result = planStudioBg3dModelPlacementRecipe({
        position: [5, 5, 5],
        rotation: [0, 0, 0],
        scale: [0.5, 0.5, 0.5],
        boundingSize,
        boundsCenterOffset,
        anchorCenterXZ: [3, -2],
        groundY: 0.25,
        yawDegrees,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const bounds = worldBoundsOf(localMin, localMax, result.position, result.rotation, result.scale);
      expect(bounds.min[1]).toBeCloseTo(0.25, 9);
      expect((bounds.min[0] + bounds.max[0]) / 2).toBeCloseTo(3, 9);
      expect((bounds.min[2] + bounds.max[2]) / 2).toBeCloseTo(-2, 9);
    }
  });

  it("오프셋이 없으면 기존 결과와 같다(후방 호환)", () => {
    const seed = {
      position: [1, 2, 3] as Vec3,
      rotation: [0.1, 0.2, 0.3] as Vec3,
      scale: [1, 2, 1] as Vec3,
      boundingSize: [2, 3, 4] as Vec3,
    };
    const legacy = planStudioBg3dModelPlacementRecipe(seed);
    expect(planStudioBg3dModelPlacementRecipe({ ...seed, boundsCenterOffset: [0, 0, 0] })).toEqual(legacy);
  });
});

describe("planStudioBg3dModelPlacementRecipe — 높이 맞춤", () => {
  it("모델 높이를 정확히 목표값으로 맞추고 작은 모델은 키운다", () => {
    const result = planStudioBg3dModelPlacementRecipe({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      boundingSize: [0.2, 0.4, 0.1],
      fitHeight: 1.7,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(0.4 * result.scale[1]).toBeCloseTo(1.7, 9);
    expect(result.scale[0]).toBeCloseTo(result.scale[1], 12);
    expect(result.scale[2]).toBeCloseTo(result.scale[1], 12);
  });

  it("이미 크기가 조정된 스케일(2배)을 반영해 목표 높이를 맞춘다", () => {
    const result = planStudioBg3dModelPlacementRecipe({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [2, 2, 2],
      boundingSize: [1, 3, 1],
      fitHeight: 1.5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(3 * result.scale[1]).toBeCloseTo(1.5, 9);
  });

  it("자동 맞춤과 함께 쓰거나 높이를 알 수 없거나 목표가 올바르지 않으면 실패한다", () => {
    const base = {
      position: [0, 0, 0] as Vec3,
      rotation: [0, 0, 0] as Vec3,
      scale: [1, 1, 1] as Vec3,
      boundingSize: [1, 1, 1] as Vec3,
    };
    for (const patch of [
      { fitHeight: 1.7, autoFitTargetSize: 2 },
      { fitHeight: 0 },
      { fitHeight: -1 },
      { fitHeight: Number.NaN },
      { fitHeight: Number.POSITIVE_INFINITY },
      { fitHeight: 1.7, boundingSize: [1, 0, 1] as Vec3 },
      { fitHeight: 1.7, boundingSize: [1, Number.NaN, 1] as Vec3 },
      { boundsCenterOffset: [0, Number.NaN, 0] as Vec3 },
      { anchorCenterXZ: [Number.NaN, 0] as const },
      { anchorCenterXZ: [0] as unknown as readonly [number, number] },
    ]) {
      const result = planStudioBg3dModelPlacementRecipe({ ...base, ...patch });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(/[가-힣]/u.test(result.reason)).toBe(true);
    }
  });
});

