"use no memo";

/**
 * 소재 카드의 "배치 방식"을 편집기 호스트 백에 붙이는 가벼운 접합부.
 *
 * 편집기 정적 그래프에 들어가는 것은 이 파일뿐이다(타입만 가져온다). 배치 계획·벽 탐지·three 에 닿는 본문은
 * studio-bg3d-editor-recipe-run 에 있고, 카드에서 배치 방식을 처음 눌렀을 때만 동적으로 불러온다.
 *
 * - 배치가 진행 중일 때 또 누르면 두 번 놓지 않고 한 줄 안내만 낸다(본문을 불러오는 동안에도 같다).
 * - 본문을 불러오지 못해도 던지지 않고, 장면을 바꾸지 않은 채 상태 줄(role=status)로 알린다.
 */

import type { StudioBg3dEditorRecipeHost } from "./studio-bg3d-editor-recipe-run";

export const STUDIO_BG3D_RECIPE_LOAD_FAILED_MESSAGE =
  "배치 기능을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.";
export const STUDIO_BG3D_RECIPE_IN_PROGRESS_MESSAGE =
  "이미 모델을 배치하는 중이에요. 끝난 뒤에 다시 눌러 주세요.";
export const STUDIO_BG3D_RECIPE_UNEXPECTED_MESSAGE =
  "배치하는 중에 문제가 생겨서 장면을 바꾸지 않았어요. 잠시 뒤에 다시 눌러 주세요.";

let placementInFlight = false;

export function attachStudioBg3dEditorRecipeHost(h: StudioBg3dEditorRecipeHost): void {
  h.placeCustomModelWithRecipe = async (modelId: string, recipe: string): Promise<boolean> => {
    if (placementInFlight) {
      h.setSurfaceSnapStatus({ tone: "info", message: STUDIO_BG3D_RECIPE_IN_PROGRESS_MESSAGE });
      return false;
    }
    placementInFlight = true;
    try {
      let runtime: typeof import("./studio-bg3d-editor-recipe-run");
      try {
        runtime = await import("./studio-bg3d-editor-recipe-run");
      } catch {
        h.setSurfaceSnapStatus({ tone: "error", message: STUDIO_BG3D_RECIPE_LOAD_FAILED_MESSAGE });
        return false;
      }
      return await runtime.placeStudioBg3dModelWithRecipe(h, modelId, recipe);
    } catch {
      h.setSurfaceSnapStatus({ tone: "error", message: STUDIO_BG3D_RECIPE_UNEXPECTED_MESSAGE });
      return false;
    } finally {
      placementInFlight = false;
    }
  };
}
