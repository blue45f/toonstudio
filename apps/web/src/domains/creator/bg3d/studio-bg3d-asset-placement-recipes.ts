/**
 * 소재 카드의 원클릭 배치 레시피 — 모델을 어디에 어떤 크기·방향으로 둘지 정하는 순수 계획.
 *
 * 변환 수학(자동 맞춤·요 회전·접지·피벗 보정)은 기존 `planStudioBg3dModelPlacementRecipe` 가 맡고, 이 모듈은
 * 레시피마다 입력을 채워 부르는 얇은 층이다. 엔진·DOM 에 의존하지 않으며 입력을 바꾸지 않는다.
 *
 * 규칙
 * - 입력이 올바르지 않으면(경계 크기 0·NaN·역전, 벽 정보 누락 등) 변환을 만들지 않고 이유를 돌려준다. 호출한 쪽은
 *   그 경우 장면을 건드리지 않는다.
 * - 레시피는 모델의 정면이 로컬 +Z 라고 가정한다(glTF 관례). 정면이 다른 모델은 배치 뒤에 회전 도구로 돌린다.
 * - 결과 변환은 장면 문서의 한도(스케일 0.001~1000, 월드 좌표 ±10000) 안이어야 한다. 넘으면 실패다.
 */

import { planStudioBg3dModelPlacementRecipe } from "./studio-bg3d-placement-recipe";

import type { StudioBg3dPlacementVec3 } from "./studio-bg3d-placement-recipe";

export const STUDIO_BG3D_ASSET_PLACEMENT_RECIPE_IDS = ["floor", "wall", "human-scale", "scene-center"] as const;
export type StudioBg3dAssetPlacementRecipeId = (typeof STUDIO_BG3D_ASSET_PLACEMENT_RECIPE_IDS)[number];

export interface StudioBg3dAssetPlacementRecipeDefinition {
  readonly id: StudioBg3dAssetPlacementRecipeId;
  readonly label: string;
  readonly description: string;
  /** 통째 장면(번들 환경)에도 쓸 수 있는가. 크기를 바꾸거나 벽에 붙이는 방식은 환경에 쓰지 않는다. */
  readonly appliesToEnvironment: boolean;
}

export const STUDIO_BG3D_ASSET_PLACEMENT_RECIPES: readonly StudioBg3dAssetPlacementRecipeDefinition[] = Object.freeze([
  {
    id: "floor",
    label: "바닥에 놓기",
    description: "카메라가 보는 지점의 바닥에 모델 밑면을 붙여 놓습니다.",
    appliesToEnvironment: true,
  },
  {
    id: "wall",
    label: "벽에 붙이기",
    description: "가까운 벽을 찾아 모델 뒷면을 벽에 맞붙이고 정면을 방 안쪽으로 돌립니다.",
    appliesToEnvironment: false,
  },
  {
    id: "human-scale",
    label: "사람 키에 맞춤",
    description: "모델 높이를 사람 키(1.7m)에 맞춰 바닥에 놓습니다.",
    appliesToEnvironment: false,
  },
  {
    id: "scene-center",
    label: "장면 중앙",
    description: "기존 오브젝트가 모인 장면의 가운데 바닥에 놓습니다.",
    appliesToEnvironment: true,
  },
]);

export function isStudioBg3dAssetPlacementRecipeId(value: unknown): value is StudioBg3dAssetPlacementRecipeId {
  return typeof value === "string" && (STUDIO_BG3D_ASSET_PLACEMENT_RECIPE_IDS as readonly string[]).includes(value);
}

export function listStudioBg3dAssetPlacementRecipes(
  isEnvironment: boolean,
): readonly StudioBg3dAssetPlacementRecipeDefinition[] {
  return STUDIO_BG3D_ASSET_PLACEMENT_RECIPES.filter((recipe) => !isEnvironment || recipe.appliesToEnvironment);
}

export const STUDIO_BG3D_HUMAN_REFERENCE_HEIGHT_METERS = 1.7;
/** 벽과 모델 뒷면 사이의 틈. 같은 평면에서 면이 겹쳐 깜박이는 것을 막는다. */
export const STUDIO_BG3D_WALL_CLEARANCE_METERS = 0.005;

// 장면 문서(studio-bg3d-scene-document)의 한도와 같은 값이다.
const MIN_SCALE = 0.001;
const MAX_SCALE = 1_000;
const MAX_WORLD_COORDINATE = 10_000;
const MIN_MODEL_EXTENT = 1e-6;
const MAX_MODEL_EXTENT = 10_000;

export interface StudioBg3dPlacementBounds {
  readonly min: StudioBg3dPlacementVec3;
  readonly max: StudioBg3dPlacementVec3;
}

/** 벽 면. 축 정렬된 수직 면만 다룬다. */
export interface StudioBg3dPlacementWall {
  readonly axis: "x" | "z";
  /** 벽에서 방 안쪽을 향하는 법선의 부호(+1 또는 -1). */
  readonly direction: 1 | -1;
  /** 벽 면의 월드 좌표(axis 축). */
  readonly coordinate: number;
}

export interface StudioBg3dAssetPlacementInput {
  readonly recipe: StudioBg3dAssetPlacementRecipeId;
  /** 모델 루트의 로컬 경계(인스턴스 변환을 적용하기 전). */
  readonly localBounds: StudioBg3dPlacementBounds;
  /** 시작 변환. 보통 새 인스턴스의 기본값(이동 0·회전 0·스케일 1)이다. */
  readonly seed: {
    readonly position: StudioBg3dPlacementVec3;
    readonly rotation: StudioBg3dPlacementVec3;
    readonly scale: StudioBg3dPlacementVec3;
  };
  /** 카메라가 보는 지점의 바닥 좌표 [X, Z]. 없으면 [0, 0]. */
  readonly dropPoint?: readonly [number, number];
  /** 바닥 높이. 없으면 0. */
  readonly groundY?: number;
  /** 기존 오브젝트 월드 경계의 합집합. 장면이 비어 있으면 null 이고 원점을 중앙으로 본다. */
  readonly sceneBounds?: StudioBg3dPlacementBounds | null;
  /** 벽에 붙이기에 필요한 벽 면. */
  readonly wall?: StudioBg3dPlacementWall | null;
  readonly humanHeightMeters?: number;
}

export type StudioBg3dAssetPlacementResult =
  | {
    readonly ok: true;
    readonly recipe: StudioBg3dAssetPlacementRecipeId;
    readonly position: StudioBg3dPlacementVec3;
    readonly rotation: StudioBg3dPlacementVec3;
    readonly scale: StudioBg3dPlacementVec3;
  }
  | { readonly ok: false; readonly reason: string };

function fail(reason: string): StudioBg3dAssetPlacementResult {
  return Object.freeze({ ok: false, reason });
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const finiteVec3 = (value: unknown): value is StudioBg3dPlacementVec3 =>
  Array.isArray(value) && value.length === 3 && value.every(finite);

function validBounds(value: unknown): value is StudioBg3dPlacementBounds {
  if (typeof value !== "object" || value === null) return false;
  const { min, max } = value as { min?: unknown; max?: unknown };
  return finiteVec3(min) && finiteVec3(max) && min.every((component, axis) => component <= max[axis]);
}

function validWall(value: unknown): value is StudioBg3dPlacementWall {
  if (typeof value !== "object" || value === null) return false;
  const wall = value as Partial<StudioBg3dPlacementWall>;
  return (wall.axis === "x" || wall.axis === "z")
    && (wall.direction === 1 || wall.direction === -1)
    && finite(wall.coordinate);
}

/** 모델 정면(로컬 +Z)이 벽 법선을 향하도록 하는 요 각도(도). */
function yawDegreesFacing(wall: StudioBg3dPlacementWall): number {
  if (wall.axis === "z") return wall.direction === 1 ? 0 : 180;
  return wall.direction === 1 ? 90 : -90;
}

/** 레시피 한 가지로 모델 변환을 계획한다. 실패하면 장면을 바꾸지 말아야 한다. */
export function planStudioBg3dAssetPlacement(input: StudioBg3dAssetPlacementInput): StudioBg3dAssetPlacementResult {
  if (typeof input !== "object" || input === null || !isStudioBg3dAssetPlacementRecipeId(input.recipe)) {
    return fail("배치 방식이 올바르지 않습니다. 목록에서 배치 방식을 다시 골라 주세요.");
  }
  const { localBounds, seed } = input;
  if (!validBounds(localBounds)) {
    return fail("모델 경계를 읽을 수 없어 배치하지 않았습니다. 모델이 화면에 나타난 뒤 다시 시도해 주세요.");
  }
  const size: [number, number, number] = [
    localBounds.max[0] - localBounds.min[0],
    localBounds.max[1] - localBounds.min[1],
    localBounds.max[2] - localBounds.min[2],
  ];
  if (size.some((extent) => !(extent > MIN_MODEL_EXTENT) || extent > MAX_MODEL_EXTENT)) {
    return fail("모델 크기가 0이거나 비정상이라 배치하지 않았습니다. 다른 모델로 시도해 주세요.");
  }
  if (typeof seed !== "object" || seed === null || !finiteVec3(seed.position) || !finiteVec3(seed.rotation) || !finiteVec3(seed.scale)) {
    return fail("배치 시작 변환이 올바르지 않아 배치하지 않았습니다.");
  }
  const dropPoint = input.dropPoint ?? [0, 0];
  const groundY = input.groundY ?? 0;
  if (!Array.isArray(dropPoint) || dropPoint.length !== 2 || !dropPoint.every(finite) || !finite(groundY)) {
    return fail("놓을 위치를 알 수 없어 배치하지 않았습니다. 화면을 조금 움직인 뒤 다시 시도해 주세요.");
  }

  const center: StudioBg3dPlacementVec3 = [
    (localBounds.min[0] + localBounds.max[0]) / 2,
    (localBounds.min[1] + localBounds.max[1]) / 2,
    (localBounds.min[2] + localBounds.max[2]) / 2,
  ];
  let anchor: readonly [number, number] = dropPoint;
  let yawDegrees = 0;
  let fitHeight: number | undefined;

  switch (input.recipe) {
    case "floor":
      break;
    case "scene-center": {
      const bounds = input.sceneBounds;
      if (bounds !== null && bounds !== undefined) {
        if (!validBounds(bounds)) return fail("장면 경계를 읽을 수 없어 배치하지 않았습니다. 장면을 확인한 뒤 다시 시도해 주세요.");
        anchor = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[2] + bounds.max[2]) / 2];
      } else {
        anchor = [0, 0];
      }
      break;
    }
    case "human-scale":
      fitHeight = input.humanHeightMeters ?? STUDIO_BG3D_HUMAN_REFERENCE_HEIGHT_METERS;
      break;
    case "wall": {
      if (!validWall(input.wall)) {
        return fail("붙일 벽을 찾지 못했습니다. 카메라를 벽 가까이 두거나 벽 역할을 하는 오브젝트를 먼저 놓아 주세요.");
      }
      const wall = input.wall;
      yawDegrees = yawDegreesFacing(wall);
      const depth = Math.abs(size[2] * seed.scale[2]);
      const normalCoordinate = wall.coordinate + wall.direction * (depth / 2 + STUDIO_BG3D_WALL_CLEARANCE_METERS);
      anchor = wall.axis === "z" ? [dropPoint[0], normalCoordinate] : [normalCoordinate, dropPoint[1]];
      break;
    }
  }

  const planned = planStudioBg3dModelPlacementRecipe({
    position: seed.position,
    rotation: seed.rotation,
    scale: seed.scale,
    boundingSize: size,
    boundsCenterOffset: center,
    anchorCenterXZ: anchor,
    groundY,
    yawDegrees,
    ...(fitHeight !== undefined ? { fitHeight } : {}),
  });
  if (!planned.ok) return fail(`${planned.reason} 다른 배치 방식을 골라 주세요.`);

  if (planned.scale.some((component) => !(Math.abs(component) >= MIN_SCALE && Math.abs(component) <= MAX_SCALE))) {
    return fail("배치 결과 크기가 장면이 허용하는 범위(0.001~1000배)를 벗어납니다. 다른 배치 방식을 골라 주세요.");
  }
  if (planned.position.some((component) => Math.abs(component) > MAX_WORLD_COORDINATE)) {
    return fail("배치 위치가 3D 장면의 안전 범위를 벗어납니다. 카메라를 장면 가까이 옮긴 뒤 다시 시도해 주세요.");
  }
  return Object.freeze({
    ok: true,
    recipe: input.recipe,
    position: planned.position,
    rotation: planned.rotation,
    scale: planned.scale,
  });
}
