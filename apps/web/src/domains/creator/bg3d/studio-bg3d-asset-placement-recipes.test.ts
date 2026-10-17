import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_ASSET_PLACEMENT_HUMAN_HEIGHT_METERS,
  STUDIO_BG3D_ASSET_PLACEMENT_RECIPES,
  STUDIO_BG3D_ASSET_PLACEMENT_RECIPE_IDS,
  isStudioBg3dAssetPlacementRecipeId,
  listStudioBg3dAssetPlacementRecipes,
} from "./studio-bg3d-asset-placement-catalog";
import {
  STUDIO_BG3D_WALL_CLEARANCE_METERS,
  createStudioBg3dAssetPlacementPlanner,
  type StudioBg3dAssetPlacementInput,
  type StudioBg3dPlacementWall,
} from "./studio-bg3d-asset-placement-recipes";
import { planStudioBg3dAssetPlacement } from "./studio-bg3d-asset-placement.test-fixture";
import { rotateVectorEulerXyz } from "./studio-bg3d-object-ops";
import { planStudioBg3dModelPlacementRecipe } from "./studio-bg3d-placement-recipe";
import { STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M } from "./studio-bg3d-scale-guide";

type Vec3 = readonly [number, number, number];

// 피벗(원점)이 경계 밖에 있는 모델: 발치가 아니라 한쪽 모서리에 피벗이 있다.
const LOCAL_MIN: Vec3 = [-0.2, 0.1, -1.5];
const LOCAL_MAX: Vec3 = [1.8, 2.1, 0.5];
const SEED = { position: [0.8, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3, scale: [1, 1, 1] as Vec3 };

function input(patch: Partial<StudioBg3dAssetPlacementInput> & { recipe: StudioBg3dAssetPlacementInput["recipe"] }): StudioBg3dAssetPlacementInput {
  return { localBounds: { min: LOCAL_MIN, max: LOCAL_MAX }, seed: SEED, ...patch };
}

function worldBounds(position: Vec3, rotation: Vec3, scale: Vec3, min = LOCAL_MIN, max = LOCAL_MAX) {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const rotated = rotateVectorEulerXyz([x * scale[0], y * scale[1], z * scale[2]], rotation);
        for (let axis = 0; axis < 3; axis += 1) {
          low[axis] = Math.min(low[axis], rotated[axis] + position[axis]);
          high[axis] = Math.max(high[axis], rotated[axis] + position[axis]);
        }
      }
    }
  }
  return { min: low, max: high, center: low.map((value, axis) => (value + high[axis]) / 2) };
}

describe("계산 주입", () => {
  it("기존 배치 계획과 회전 계산은 인자로 받은 것을 쓰고, 같은 함수를 꽂으면 결과가 같다", () => {
    const planBase = vi.fn(planStudioBg3dModelPlacementRecipe);
    const rotateVector = vi.fn(rotateVectorEulerXyz);
    const plan = createStudioBg3dAssetPlacementPlanner({ planBase, rotateVector });
    const request = input({ recipe: "floor", dropPoint: [1, 2] });
    expect(plan(request)).toEqual(planStudioBg3dAssetPlacement(request));
    expect(planBase).toHaveBeenCalledOnce();
    expect(rotateVector).toHaveBeenCalledOnce();
  });

  it("입력이 올바르지 않으면 주입한 계산을 부르지 않고 실패한다", () => {
    const planBase = vi.fn(planStudioBg3dModelPlacementRecipe);
    const rotateVector = vi.fn(rotateVectorEulerXyz);
    const plan = createStudioBg3dAssetPlacementPlanner({ planBase, rotateVector });
    expect(plan(input({ recipe: "diagonal" as never })).ok).toBe(false);
    expect(plan(input({ recipe: "floor", localBounds: { min: [0, 0, 0], max: [0, 0, 0] } })).ok).toBe(false);
    expect(planBase).not.toHaveBeenCalled();
    expect(rotateVector).not.toHaveBeenCalled();
  });
});

describe("레시피 목록", () => {
  it("모든 레시피에 한글 이름·설명이 있고 식별자는 고유하다", () => {
    expect(STUDIO_BG3D_ASSET_PLACEMENT_RECIPES.map(({ id }) => id)).toEqual([...STUDIO_BG3D_ASSET_PLACEMENT_RECIPE_IDS]);
    expect(new Set(STUDIO_BG3D_ASSET_PLACEMENT_RECIPES.map(({ id }) => id)).size).toBe(STUDIO_BG3D_ASSET_PLACEMENT_RECIPES.length);
    for (const recipe of STUDIO_BG3D_ASSET_PLACEMENT_RECIPES) {
      expect(/[가-힣]/u.test(recipe.label)).toBe(true);
      expect(recipe.description.length).toBeGreaterThan(5);
    }
  });

  it("번들 환경에는 크기를 바꾸거나 벽에 붙이는 방식을 내놓지 않는다", () => {
    expect(listStudioBg3dAssetPlacementRecipes(true).map(({ id }) => id)).toEqual(["floor", "scene-center"]);
    expect(listStudioBg3dAssetPlacementRecipes(false).map(({ id }) => id)).toEqual(["floor", "wall", "human-scale", "scene-center"]);
  });

  it("식별자 검사는 알려진 문자열만 받는다", () => {
    expect(isStudioBg3dAssetPlacementRecipeId("wall")).toBe(true);
    for (const bad of ["Wall", "", null, undefined, 1, {}]) expect(isStudioBg3dAssetPlacementRecipeId(bad)).toBe(false);
  });
});

describe("바닥에 놓기", () => {
  it("피벗 위치와 상관없이 경계 아래면을 바닥에, 경계 중심을 놓을 지점에 둔다", () => {
    const result = planStudioBg3dAssetPlacement(input({ recipe: "floor", dropPoint: [3, -2], groundY: 0 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bounds = worldBounds(result.position, result.rotation, result.scale);
    expect(bounds.min[1]).toBeCloseTo(0, 9);
    expect(bounds.center[0]).toBeCloseTo(3, 9);
    expect(bounds.center[2]).toBeCloseTo(-2, 9);
    expect(result.scale).toEqual([1, 1, 1]);
    expect(result.rotation).toEqual([0, 0, 0]);
  });

  it("바닥 높이를 따른다", () => {
    const result = planStudioBg3dAssetPlacement(input({ recipe: "floor", groundY: 0.4 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(worldBounds(result.position, result.rotation, result.scale).min[1]).toBeCloseTo(0.4, 9);
  });
});

describe("장면 중앙 정렬", () => {
  it("기존 오브젝트 경계의 가운데 X/Z 에 놓는다", () => {
    const result = planStudioBg3dAssetPlacement(input({
      recipe: "scene-center",
      dropPoint: [9, 9],
      sceneBounds: { min: [-4, 0, 2], max: [6, 3, 10] },
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bounds = worldBounds(result.position, result.rotation, result.scale);
    expect(bounds.center[0]).toBeCloseTo(1, 9);
    expect(bounds.center[2]).toBeCloseTo(6, 9);
    expect(bounds.min[1]).toBeCloseTo(0, 9);
  });

  it("장면이 비어 있으면 원점을 가운데로 본다", () => {
    for (const sceneBounds of [null, undefined]) {
      const result = planStudioBg3dAssetPlacement(input({ recipe: "scene-center", dropPoint: [9, 9], sceneBounds }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const bounds = worldBounds(result.position, result.rotation, result.scale);
      expect(bounds.center[0]).toBeCloseTo(0, 9);
      expect(bounds.center[2]).toBeCloseTo(0, 9);
    }
  });

  it("읽을 수 없는 장면 경계는 추측하지 않고 실패한다", () => {
    const result = planStudioBg3dAssetPlacement(input({
      recipe: "scene-center",
      sceneBounds: { min: [0, 0, Number.NaN], max: [1, 1, 1] },
    }));
    expect(result.ok).toBe(false);
  });
});

describe("사람 키 기준 맞춤", () => {
  it("카탈로그의 리터럴 사람 키는 뷰포트 눈금 상수와 같다(눈금 모듈을 값으로 가져오지 않는 대신 이 시험이 지킨다)", () => {
    expect(STUDIO_BG3D_ASSET_PLACEMENT_HUMAN_HEIGHT_METERS).toBe(STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M);
    const humanScale = STUDIO_BG3D_ASSET_PLACEMENT_RECIPES.find(({ id }) => id === "human-scale");
    expect(humanScale?.description).toContain(`${STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M}m`);
  });

  it("모델 높이를 뷰포트 사람 눈금(1.6m)과 같은 단일 출처 값으로 맞추고 균일 배율로 바닥에 놓는다", () => {
    expect(STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M).toBe(1.6);
    const result = planStudioBg3dAssetPlacement(input({ recipe: "human-scale", dropPoint: [1, 1] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bounds = worldBounds(result.position, result.rotation, result.scale);
    expect(bounds.max[1] - bounds.min[1]).toBeCloseTo(STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M, 9);
    expect(bounds.min[1]).toBeCloseTo(0, 9);
    expect(result.scale[0]).toBeCloseTo(result.scale[1], 12);
    expect(result.scale[2]).toBeCloseTo(result.scale[1], 12);
    expect(bounds.center[0]).toBeCloseTo(1, 9);
  });

  it("다른 기준 키를 줄 수 있다", () => {
    const result = planStudioBg3dAssetPlacement(input({ recipe: "human-scale", humanHeightMeters: 2 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bounds = worldBounds(result.position, result.rotation, result.scale);
    expect(bounds.max[1] - bounds.min[1]).toBeCloseTo(2, 9);
  });

  it("키우거나 줄여야 하는 배율이 장면 한도를 넘으면 실패한다", () => {
    const tiny = planStudioBg3dAssetPlacement(input({
      recipe: "human-scale",
      localBounds: { min: [0, 0, 0], max: [0.0005, 0.0005, 0.0005] },
    }));
    expect(tiny.ok).toBe(false);
    const huge = planStudioBg3dAssetPlacement(input({
      recipe: "human-scale",
      localBounds: { min: [0, 0, 0], max: [5_000, 5_000, 5_000] },
    }));
    expect(huge.ok).toBe(false);
  });
});

describe("벽에 붙이기", () => {
  const depth = LOCAL_MAX[2] - LOCAL_MIN[2];
  const walls: readonly { wall: StudioBg3dPlacementWall; faces: Vec3 }[] = [
    { wall: { axis: "z", direction: 1, coordinate: -5 }, faces: [0, 0, 1] },
    { wall: { axis: "z", direction: -1, coordinate: 5 }, faces: [0, 0, -1] },
    { wall: { axis: "x", direction: 1, coordinate: -4 }, faces: [1, 0, 0] },
    { wall: { axis: "x", direction: -1, coordinate: 4 }, faces: [-1, 0, 0] },
  ];

  it.each(walls)("벽 %j: 뒷면이 벽에 맞닿고 정면이 방 안쪽을 향한다", ({ wall, faces }) => {
    const result = planStudioBg3dAssetPlacement(input({ recipe: "wall", wall, dropPoint: [1.5, 2.5] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bounds = worldBounds(result.position, result.rotation, result.scale);
    const axis = wall.axis === "x" ? 0 : 2;
    const lateral = wall.axis === "x" ? 2 : 0;
    // 벽 쪽 면이 벽 좌표에서 틈만큼 떨어져 있다.
    const wallSide = wall.direction === 1 ? bounds.min[axis] : bounds.max[axis];
    expect(Math.abs(wallSide - wall.coordinate)).toBeCloseTo(STUDIO_BG3D_WALL_CLEARANCE_METERS, 9);
    // 모델 깊이만큼 방 안쪽으로 뻗는다.
    expect(bounds.max[axis] - bounds.min[axis]).toBeCloseTo(depth, 9);
    // 놓을 지점의 가로 위치와 바닥 접지를 지킨다.
    expect(bounds.center[lateral]).toBeCloseTo(wall.axis === "x" ? 2.5 : 1.5, 9);
    expect(bounds.min[1]).toBeCloseTo(0, 9);
    // 정면(로컬 +Z)이 벽 법선을 향한다.
    const front = rotateVectorEulerXyz([0, 0, 1], result.rotation);
    expect(front[0]).toBeCloseTo(faces[0], 9);
    expect(front[1]).toBeCloseTo(0, 9);
    expect(front[2]).toBeCloseTo(faces[2], 9);
  });

  it("벽을 못 찾았으면 장면을 건드리지 않도록 실패한다", () => {
    for (const wall of [null, undefined, { axis: "y", direction: 1, coordinate: 0 }, { axis: "x", direction: 2, coordinate: 0 }, { axis: "z", direction: 1, coordinate: Number.NaN }]) {
      const result = planStudioBg3dAssetPlacement(input({ recipe: "wall", wall: wall as never }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("wall-not-found");
        expect(result.reason).toContain("벽");
        // 숨긴 벽은 대상이 아니라는 점과 되돌리는 방법을 함께 알린다.
        expect(result.reason).toContain("숨긴 벽은 제외돼요");
        expect(result.reason).toContain("숨긴 벽 되돌리기");
      }
    }
  });
});

describe("기존 배치 계획 모듈과의 관계", () => {
  it("피벗이 경계 중심이면 기존 계획과 같은 결과다(보정이 아무것도 바꾸지 않는다)", () => {
    const localBounds = { min: [-1, -2, -0.5] as Vec3, max: [1, 2, 0.5] as Vec3 };
    const result = planStudioBg3dAssetPlacement({
      recipe: "floor",
      localBounds,
      seed: { position: [0.5, 9, -3], rotation: [0, 0, 0], scale: [1.5, 1.5, 1.5] },
      dropPoint: [0.5, -3],
    });
    const legacy = planStudioBg3dModelPlacementRecipe({
      position: [0.5, 9, -3],
      rotation: [0, 0, 0],
      scale: [1.5, 1.5, 1.5],
      boundingSize: [2, 4, 1],
      groundY: 0,
    });
    expect(result.ok && legacy.ok).toBe(true);
    if (!result.ok || !legacy.ok) return;
    for (let axis = 0; axis < 3; axis += 1) expect(result.position[axis]).toBeCloseTo(legacy.position[axis], 12);
    expect(result.rotation).toEqual(legacy.rotation);
    expect(result.scale).toEqual(legacy.scale);
  });

  it("높이 맞춤 목표가 올바르지 않거나 모델 높이를 알 수 없으면 계획하지 않는다", () => {
    for (const humanHeightMeters of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = planStudioBg3dAssetPlacement(input({ recipe: "human-scale", humanHeightMeters }));
      expect(result).toMatchObject({ ok: false, code: "plan-failed" });
    }
    const flatSeed = planStudioBg3dAssetPlacement(input({ recipe: "human-scale", seed: { ...SEED, scale: [1, 0, 1] } }));
    expect(flatSeed.ok).toBe(false);
  });
});

describe("잘못된 입력에서 변환을 만들지 않는다", () => {
  const recipes = STUDIO_BG3D_ASSET_PLACEMENT_RECIPE_IDS;
  const wall: StudioBg3dPlacementWall = { axis: "z", direction: 1, coordinate: 0 };

  it.each(recipes)("%s: 크기 0·NaN·무한·역전 경계를 거부한다", (recipe) => {
    const badBounds = [
      { min: [0, 0, 0], max: [0, 0, 0] },
      { min: [0, 0, 0], max: [1, 0, 1] },
      { min: [0, 0, 0], max: [Number.NaN, 1, 1] },
      { min: [0, 0, 0], max: [1, Number.POSITIVE_INFINITY, 1] },
      { min: [1, 0, 0], max: [0, 1, 1] },
      { min: [0, 0, 0], max: [20_000, 1, 1] },
      { min: [0, 0], max: [1, 1, 1] },
      null,
    ];
    for (const localBounds of badBounds) {
      const result = planStudioBg3dAssetPlacement(input({ recipe, wall, localBounds: localBounds as never }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(/[가-힣]/u.test(result.reason)).toBe(true);
    }
  });

  it.each(recipes)("%s: 시작 변환·놓을 지점·바닥 높이가 유한하지 않으면 거부한다", (recipe) => {
    for (const patch of [
      { seed: { ...SEED, position: [Number.NaN, 0, 0] as Vec3 } },
      { seed: { ...SEED, scale: [0, 1, 1] as Vec3 } },
      { seed: { ...SEED, rotation: [0, Number.POSITIVE_INFINITY, 0] as Vec3 } },
      { dropPoint: [Number.NaN, 0] as const },
      { dropPoint: [0] as never },
      { groundY: Number.NaN },
    ]) {
      expect(planStudioBg3dAssetPlacement(input({ recipe, wall, ...patch })).ok).toBe(false);
    }
  });

  it("알 수 없는 레시피와 비객체 입력을 거부한다", () => {
    expect(planStudioBg3dAssetPlacement(input({ recipe: "diagonal" as never })).ok).toBe(false);
    expect(planStudioBg3dAssetPlacement(null as never).ok).toBe(false);
  });

  it("장면 좌표 한도를 넘는 결과는 만들지 않는다", () => {
    expect(planStudioBg3dAssetPlacement(input({ recipe: "floor", dropPoint: [50_000, 0] })).ok).toBe(false);
  });

  it("입력 객체를 바꾸지 않는다", () => {
    const source = input({ recipe: "wall", wall, dropPoint: [1, 1] });
    const snapshot = structuredClone(source);
    planStudioBg3dAssetPlacement(source);
    expect(source).toEqual(snapshot);
  });
});
