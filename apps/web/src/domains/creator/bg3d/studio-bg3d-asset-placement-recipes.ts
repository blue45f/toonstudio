/**
 * 소재 카드의 원클릭 배치 레시피 — 모델을 어디에 어떤 크기·방향으로 둘지 정하는 순수 계획.
 *
 * 변환 수학(요 회전·접지)은 기존 `planStudioBg3dModelPlacementRecipe` 가 맡고, 이 모듈은 레시피마다 입력을 채워 부르는 얇은
 * 층이다. 기존 모듈은 모델 피벗이 경계 상자 중심이라고 가정하므로, 가져온 모델처럼 피벗이 중심이 아닌 경우의 보정(경계 중심을
 * 목표 X/Z 에 맞추고 접지 높이를 중심 기준으로 되돌리기)과 높이 맞춤 배율은 여기서 그 결과 위에 얹는다 — 기존 모듈은 편집기
 * 정적 그래프에 있어서 건드리지 않는다. 엔진·DOM 에 의존하지 않으며 입력을 바꾸지 않는다.
 *
 * 규칙
 * - 입력이 올바르지 않으면(경계 크기 0·NaN·역전, 벽 정보 누락 등) 변환을 만들지 않고 이유를 돌려준다. 호출한 쪽은
 *   그 경우 장면을 건드리지 않는다. 이유(`reason`)는 사용자에게 그대로 보이는 해요체 문장이고 "원인 + 다음 행동"을 담는다.
 *   프로그램이 가르는 값은 `code` 다.
 * - 레시피는 모델의 정면이 로컬 +Z 라고 가정한다(glTF 관례). 정면이 다른 모델은 배치 뒤에 회전 도구로 돌린다.
 * - 결과 변환은 장면 문서의 한도(스케일 0.001~1000, 월드 좌표 ±10000) 안이어야 한다. 넘으면 실패다.
 * - 사람 키는 뷰포트 눈금(STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M)과 같은 값을 쓴다(단일 출처).
 * - "벽"은 보이는 축 정렬 수직 면이다. 숨긴(visible:false) 벽은 대상에서 제외한다 — 자동 단면이 숨긴 벽에는 붙지 않는다.
 */

import { rotateVectorEulerXyz } from "./studio-bg3d-object-ops";
import { planStudioBg3dModelPlacementRecipe } from "./studio-bg3d-placement-recipe";
import { STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M } from "./studio-bg3d-scale-guide";

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
    description: "카메라가 보는 지점의 바닥에 모델 밑면을 붙여 놓아요.",
    appliesToEnvironment: true,
  },
  {
    id: "wall",
    label: "벽에 붙이기",
    description: "가까운 벽을 찾아 모델 뒷면을 벽에 맞붙이고 정면을 방 안쪽으로 돌려요. 숨긴 벽은 제외돼요.",
    appliesToEnvironment: false,
  },
  {
    id: "human-scale",
    label: "사람 키에 맞춤",
    description: `모델 높이를 사람 키(${STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M}m)에 맞춰 바닥에 놓아요.`,
    appliesToEnvironment: false,
  },
  {
    id: "scene-center",
    label: "장면 중앙",
    description: "기존 오브젝트가 모인 장면의 가운데 바닥에 놓아요.",
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

export type StudioBg3dAssetPlacementFailureCode =
  | "invalid-recipe"
  | "invalid-bounds"
  | "degenerate-size"
  | "invalid-seed"
  | "invalid-drop-point"
  | "invalid-scene-bounds"
  | "wall-not-found"
  | "plan-failed"
  | "scale-out-of-range"
  | "position-out-of-range";

export type StudioBg3dAssetPlacementResult =
  | {
    readonly ok: true;
    readonly recipe: StudioBg3dAssetPlacementRecipeId;
    readonly position: StudioBg3dPlacementVec3;
    readonly rotation: StudioBg3dPlacementVec3;
    readonly scale: StudioBg3dPlacementVec3;
  }
  | { readonly ok: false; readonly code: StudioBg3dAssetPlacementFailureCode; readonly reason: string };

/** 배치 방식을 알 수 없을 때(호스트도 같은 문장을 쓴다). */
export const STUDIO_BG3D_ASSET_PLACEMENT_INVALID_RECIPE_MESSAGE =
  "배치 방식을 알 수 없어요. 목록에서 배치 방식을 다시 골라 주세요.";

/** 붙일 벽이 없을 때. 숨긴 벽은 대상이 아니라는 점과 되돌리는 방법을 함께 알린다. */
export const STUDIO_BG3D_ASSET_PLACEMENT_WALL_NOT_FOUND_MESSAGE =
  "붙일 벽을 찾지 못했어요. 숨긴 벽은 제외돼요. '숨긴 벽 되돌리기'나 레이어 목록의 눈 아이콘으로 벽을 다시 켠 뒤 눌러 주세요. 카메라를 벽 가까이 두면 더 잘 찾아요.";

function fail(code: StudioBg3dAssetPlacementFailureCode, reason: string): StudioBg3dAssetPlacementResult {
  return Object.freeze({ ok: false, code, reason });
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
    return fail("invalid-recipe", STUDIO_BG3D_ASSET_PLACEMENT_INVALID_RECIPE_MESSAGE);
  }
  const { localBounds, seed } = input;
  if (!validBounds(localBounds)) {
    return fail("invalid-bounds", "모델 경계를 읽을 수 없어서 배치하지 않았어요. 모델이 화면에 나타난 뒤에 다시 시도해 주세요.");
  }
  const size: [number, number, number] = [
    localBounds.max[0] - localBounds.min[0],
    localBounds.max[1] - localBounds.min[1],
    localBounds.max[2] - localBounds.min[2],
  ];
  if (size.some((extent) => !(extent > MIN_MODEL_EXTENT) || extent > MAX_MODEL_EXTENT)) {
    return fail("degenerate-size", "모델 크기가 0이거나 비정상이라 배치하지 않았어요. 다른 모델로 다시 시도해 주세요.");
  }
  if (typeof seed !== "object" || seed === null || !finiteVec3(seed.position) || !finiteVec3(seed.rotation) || !finiteVec3(seed.scale)) {
    return fail("invalid-seed", "배치 시작 변환이 올바르지 않아서 배치하지 않았어요. 3D 배경 편집기를 닫았다가 다시 열어 주세요.");
  }
  const dropPoint = input.dropPoint ?? [0, 0];
  const groundY = input.groundY ?? 0;
  if (!Array.isArray(dropPoint) || dropPoint.length !== 2 || !dropPoint.every(finite) || !finite(groundY)) {
    return fail("invalid-drop-point", "놓을 위치를 알 수 없어서 배치하지 않았어요. 화면을 조금 움직인 뒤에 다시 눌러 주세요.");
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
        if (!validBounds(bounds)) return fail("invalid-scene-bounds", "장면 경계를 읽을 수 없어서 배치하지 않았어요. 장면을 확인한 뒤에 다시 시도해 주세요.");
        anchor = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[2] + bounds.max[2]) / 2];
      } else {
        anchor = [0, 0];
      }
      break;
    }
    case "human-scale":
      fitHeight = input.humanHeightMeters ?? STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M;
      break;
    case "wall": {
      if (!validWall(input.wall)) {
        return fail("wall-not-found", STUDIO_BG3D_ASSET_PLACEMENT_WALL_NOT_FOUND_MESSAGE);
      }
      const wall = input.wall;
      yawDegrees = yawDegreesFacing(wall);
      const depth = Math.abs(size[2] * seed.scale[2]);
      const normalCoordinate = wall.coordinate + wall.direction * (depth / 2 + STUDIO_BG3D_WALL_CLEARANCE_METERS);
      anchor = wall.axis === "z" ? [dropPoint[0], normalCoordinate] : [normalCoordinate, dropPoint[1]];
      break;
    }
  }

  const PLAN_FAILED = "모델 크기와 방향을 계산하지 못해서 배치하지 않았어요. 다른 배치 방식을 골라 주세요.";
  // 높이 맞춤: 시작 배율을 균일하게 조정해 (배율을 반영한) 모델 높이가 목표값이 되게 한다. 작은 모델은 키운다.
  let fitFactor = 1;
  if (fitHeight !== undefined) {
    const height = Math.abs(size[1] * seed.scale[1]);
    fitFactor = fitHeight / height;
    // 기본 계획 모듈의 이유는 개발자용 문장이라 그대로 보이지 않는다. 사용자에게는 다음 행동이 있는 해요체 문장만 보인다.
    if (!finite(fitHeight) || fitHeight <= 0 || !(height > 0) || !Number.isFinite(fitFactor) || fitFactor <= 0) {
      return fail("plan-failed", PLAN_FAILED);
    }
  }
  const planned = planStudioBg3dModelPlacementRecipe({
    position: seed.position,
    rotation: seed.rotation,
    scale: [seed.scale[0] * fitFactor, seed.scale[1] * fitFactor, seed.scale[2] * fitFactor],
    boundingSize: size,
    groundY,
    yawDegrees,
  });
  if (!planned.ok) return fail("plan-failed", PLAN_FAILED);

  // 기존 계획은 피벗이 경계 중심이라고 보고 접지한다. 실제 경계 중심은 피벗에서 (배율·회전을 반영한) shift 만큼 떨어져 있으므로,
  // 경계 중심이 목표 X/Z 에 오고 경계 아래면이 접지 높이에 닿도록 그만큼 피벗 위치를 되돌린다.
  const shift = rotateVectorEulerXyz(
    [center[0] * planned.scale[0], center[1] * planned.scale[1], center[2] * planned.scale[2]],
    planned.rotation as [number, number, number],
  );
  const position: StudioBg3dPlacementVec3 = [anchor[0] - shift[0], planned.position[1] - shift[1], anchor[1] - shift[2]];
  if (!position.every(finite)) return fail("plan-failed", PLAN_FAILED);

  if (planned.scale.some((component) => !(Math.abs(component) >= MIN_SCALE && Math.abs(component) <= MAX_SCALE))) {
    return fail("scale-out-of-range", "배치 결과 크기가 장면이 허용하는 범위(0.001~1000배)를 벗어나서 배치하지 않았어요. 다른 배치 방식을 골라 주세요.");
  }
  if (position.some((component) => Math.abs(component) > MAX_WORLD_COORDINATE)) {
    return fail("position-out-of-range", "배치 위치가 3D 장면의 안전 범위를 벗어나서 배치하지 않았어요. 카메라를 장면 가까이 옮긴 뒤에 다시 눌러 주세요.");
  }
  return Object.freeze({
    ok: true,
    recipe: input.recipe,
    position,
    rotation: planned.rotation,
    scale: planned.scale,
  });
}
