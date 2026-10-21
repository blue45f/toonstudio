/**
 * 소재 카드의 원클릭 배치 레시피 목록 — 이름·설명·적용 범위와 사용자에게 보이는 고정 문구.
 *
 * 이 모듈은 의존하는 모듈이 없다(값 import 가 하나도 없다). 라이브러리 패널(목록·메뉴)과 배치 본문(계획·실행)이 함께 읽는 잎이라,
 * 편집기 활성화 그래프에 있는 모듈(배치 수학·눈금 가이드 등)을 값으로 가져오지 않는다. 지연 로드되는 모듈이 활성화 그래프의
 * 모듈을 값으로 가져오면 번들러가 그 모듈을 활성화 본체 청크에서 떼어 별도 공유 청크로 만들어 청크 수 상한을 넘긴다.
 * 변환 계산은 지연 로드되는 계획 모듈(studio-bg3d-asset-placement-recipes)에 있다.
 */

export const STUDIO_BG3D_ASSET_PLACEMENT_RECIPE_IDS = ["floor", "wall", "human-scale", "scene-center"] as const;
export type StudioBg3dAssetPlacementRecipeId = (typeof STUDIO_BG3D_ASSET_PLACEMENT_RECIPE_IDS)[number];

export interface StudioBg3dAssetPlacementRecipeDefinition {
  readonly id: StudioBg3dAssetPlacementRecipeId;
  readonly label: string;
  readonly description: string;
  /** 통째 장면(번들 환경)에도 쓸 수 있는가. 크기를 바꾸거나 벽에 붙이는 방식은 환경에 쓰지 않는다. */
  readonly appliesToEnvironment: boolean;
}

/**
 * 사람 키 맞춤의 목표 높이(m). 뷰포트 눈금 가이드(STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M)와 같은 값이다.
 * 눈금 모듈을 값으로 가져오면 위 청크 문제가 생겨 리터럴로 적고, 두 값이 같다는 것은 시험이 지킨다.
 */
export const STUDIO_BG3D_ASSET_PLACEMENT_HUMAN_HEIGHT_METERS = 1.6;

export const STUDIO_BG3D_ASSET_PLACEMENT_RECIPES: readonly StudioBg3dAssetPlacementRecipeDefinition[] = [
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
    description: `모델 높이를 사람 키(${STUDIO_BG3D_ASSET_PLACEMENT_HUMAN_HEIGHT_METERS}m)에 맞춰 바닥에 놓아요.`,
    appliesToEnvironment: false,
  },
  {
    id: "scene-center",
    label: "장면 중앙",
    description: "기존 오브젝트가 모인 장면의 가운데 바닥에 놓아요.",
    appliesToEnvironment: true,
  },
];

/** 배치 방식 목록 아래 안내. 한 번에 놓이고 되돌릴 수 있으며, 모델의 앞쪽 방향을 어떻게 가정하는지 밝힌다. */
export const STUDIO_BG3D_ASSET_PLACEMENT_MENU_FOOTER =
  "한 번에 배치되고, 실행 취소로 되돌릴 수 있어요. 모델 정면은 +Z 방향이라고 가정해요.";

/** 배치 방식을 알 수 없을 때(호스트도 같은 문장을 쓴다). */
export const STUDIO_BG3D_ASSET_PLACEMENT_INVALID_RECIPE_MESSAGE =
  "배치 방식을 알 수 없어요. 목록에서 배치 방식을 다시 골라 주세요.";

/** 붙일 벽이 없을 때. 숨긴 벽은 대상이 아니라는 점과 되돌리는 방법을 함께 알린다. */
export const STUDIO_BG3D_ASSET_PLACEMENT_WALL_NOT_FOUND_MESSAGE =
  "붙일 벽을 찾지 못했어요. 숨긴 벽은 제외돼요. '숨긴 벽 되돌리기'나 레이어 목록의 눈 아이콘으로 벽을 다시 켠 뒤 눌러 주세요. 카메라를 벽 가까이 두면 더 잘 찾아요.";

export function isStudioBg3dAssetPlacementRecipeId(value: unknown): value is StudioBg3dAssetPlacementRecipeId {
  return typeof value === "string" && (STUDIO_BG3D_ASSET_PLACEMENT_RECIPE_IDS as readonly string[]).includes(value);
}

export function listStudioBg3dAssetPlacementRecipes(
  isEnvironment: boolean,
): readonly StudioBg3dAssetPlacementRecipeDefinition[] {
  return STUDIO_BG3D_ASSET_PLACEMENT_RECIPES.filter((recipe) => !isEnvironment || recipe.appliesToEnvironment);
}
