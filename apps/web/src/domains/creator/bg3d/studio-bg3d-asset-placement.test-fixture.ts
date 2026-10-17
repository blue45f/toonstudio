import { createStudioBg3dAssetPlacementPlanner } from "./studio-bg3d-asset-placement-recipes";
import { rotateVectorEulerXyz } from "./studio-bg3d-object-ops";
import { planStudioBg3dModelPlacementRecipe } from "./studio-bg3d-placement-recipe";

/**
 * 실제 배치 계산을 꽂은 계획 함수. 운영에서는 편집기 접합부(studio-bg3d-editor-recipe-host)가 같은 두 함수를 본문에 넘긴다.
 * 계획 모듈은 이 두 모듈을 값으로 가져오지 않으므로(번들러가 활성화 청크를 가르지 않게), 시험이 여기서 꽂는다.
 */
export const planStudioBg3dAssetPlacement = createStudioBg3dAssetPlacementPlanner({
  planBase: planStudioBg3dModelPlacementRecipe,
  rotateVector: rotateVectorEulerXyz,
});
