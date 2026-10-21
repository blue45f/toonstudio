"use no memo";

/**
 * 소재 카드의 "배치 방식"을 편집기 호스트 백에 붙이는 가벼운 접합부.
 *
 * 편집기 정적 그래프에 들어가는 것은 이 파일뿐이다. 배치 계획·벽 탐지·three 에 닿는 본문은
 * studio-bg3d-editor-recipe-run 에 있고, 카드에서 배치 방식을 처음 눌렀을 때만 동적으로 불러온다.
 *
 * - 배치가 진행 중일 때 또 누르면 두 번 놓지 않고 한 줄 안내만 낸다(본문을 불러오는 동안에도 같다).
 * - 본문을 불러오지 못해도 던지지 않고, 장면을 바꾸지 않은 채 상태 줄(role=status)로 알린다. 불러오기가 10초 안에 끝나지
 *   않으면 못 불러온 것으로 보고 "진행 중" 표시를 풀어, 멈춘 네트워크 때문에 버튼이 계속 막히지 않게 한다.
 * - 연달아 불러오지 못하면 두 번째부터는 새로고침을 먼저 안내한다. 브라우저는 실패한 모듈 불러오기를 기억해(배포 직후 사라진 청크
 *   등) 다시 눌러도 같은 실패를 되풀이할 수 있기 때문이다.
 *
 * 의존성 주입: 본문은 편집기 활성화 그래프에 이미 있는 모듈을 값으로 가져오지 않는다. 지연 모듈이 그런 모듈을 값으로 가져오면
 * 번들러가 그 모듈을 활성화 본체 청크에서 떼어 별도 공유 청크로 만들어 활성화 청크 수 상한을 넘긴다. 그 모듈들은 이미 활성화
 * 그래프에 있으므로 이 접합부가 정적으로 가져와도 새 청크가 생기지 않고, 실행 때 본문에 인자로 넘긴다.
 * (값 import 목록은 studio-bg3d-lazy-module-boundary.test.ts 가 고정한다.)
 */

import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import {
  StudioBg3dModelPlacementAdmissionError,
  assertStudioBg3dModelAttachmentAdmission,
} from "./studio-bg3d-model-placement-admission";
import {
  StudioBg3dStaleModalOperationError,
  studioBg3dModalOperationCoordinator,
} from "./studio-bg3d-modal-operation-coordinator";
import { rotateVectorEulerXyz } from "./studio-bg3d-object-ops";
import { isStudioBg3dPhysicsTransientPhase } from "./studio-bg3d-physics-ui";
import { planStudioBg3dModelPlacementRecipe } from "./studio-bg3d-placement-recipe";
import { STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS } from "./studio-bg3d-scene-document-types";
import { isStudioBg3dSceneEditReady } from "./studio-bg3d-scene-edit-readiness";

import type { StudioBg3dEditorRecipeHost, StudioBg3dRecipeRunDeps } from "./studio-bg3d-editor-recipe-run";

/** 본문 불러오기를 기다리는 최대 시간(ms). 넘으면 불러오지 못한 것으로 본다. */
export const STUDIO_BG3D_RECIPE_LOAD_TIMEOUT_MS = 10_000;

export const STUDIO_BG3D_RECIPE_LOAD_FAILED_MESSAGE =
  "배치 기능을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.";
/** 연달아 불러오지 못했을 때(두 번째 실패부터). 다시 눌러도 같은 실패가 되풀이될 수 있어 새로고침을 먼저 안내한다. */
export const STUDIO_BG3D_RECIPE_LOAD_FAILED_AGAIN_MESSAGE =
  "배치 기능을 계속 불러오지 못했어요. 페이지를 새로고침한 뒤 다시 눌러 주세요.";
export const STUDIO_BG3D_RECIPE_IN_PROGRESS_MESSAGE =
  "이미 모델을 배치하는 중이에요. 끝난 뒤에 다시 눌러 주세요.";
export const STUDIO_BG3D_RECIPE_UNEXPECTED_MESSAGE =
  "배치하는 중에 문제가 생겨서 장면을 바꾸지 않았어요. 잠시 뒤에 다시 눌러 주세요.";

/** 본문에 넘기는 값. 모듈이 불러와질 때 한 번 만든 객체 리터럴이며 호출을 하지 않는다. */
const RECIPE_RUN_DEPS: StudioBg3dRecipeRunDeps = {
  isSceneEditReady: isStudioBg3dSceneEditReady,
  isPhysicsTransientPhase: isStudioBg3dPhysicsTransientPhase,
  createHistorySnapshot: createStudioBg3dHistorySnapshot,
  modalCoordinator: studioBg3dModalOperationCoordinator,
  StaleModalOperationError: StudioBg3dStaleModalOperationError,
  PlacementAdmissionError: StudioBg3dModelPlacementAdmissionError,
  assertAttachmentAdmission: assertStudioBg3dModelAttachmentAdmission,
  maxAttachments: STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
  placementMath: { planBase: planStudioBg3dModelPlacementRecipe, rotateVector: rotateVectorEulerXyz },
};

let placementInFlight = false;
/** 본문 불러오기가 연달아 실패한 횟수. 불러오면 0 으로 돌아온다. */
let consecutiveLoadFailures = 0;

type RecipeRuntime = typeof import("./studio-bg3d-editor-recipe-run");

/** 본문을 불러온다. 제한 시간 안에 끝나지 않으면 거절한다(불러오기 자체는 백그라운드에서 이어져 다음 누름에 쓰일 수 있다). */
function loadRecipeRuntime(): Promise<RecipeRuntime> {
  return new Promise<RecipeRuntime>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("recipe-run-load-timeout")), STUDIO_BG3D_RECIPE_LOAD_TIMEOUT_MS);
    import("./studio-bg3d-editor-recipe-run").then(
      (loaded) => {
        clearTimeout(timer);
        resolve(loaded);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function attachStudioBg3dEditorRecipeHost(h: StudioBg3dEditorRecipeHost): void {
  h.placeCustomModelWithRecipe = async (modelId: string, recipe: string): Promise<boolean> => {
    if (placementInFlight) {
      h.setSurfaceSnapStatus({ tone: "info", message: STUDIO_BG3D_RECIPE_IN_PROGRESS_MESSAGE });
      return false;
    }
    placementInFlight = true;
    try {
      let runtime: RecipeRuntime;
      try {
        runtime = await loadRecipeRuntime();
        consecutiveLoadFailures = 0;
      } catch {
        consecutiveLoadFailures += 1;
        h.setSurfaceSnapStatus({
          tone: "error",
          message: consecutiveLoadFailures > 1 ? STUDIO_BG3D_RECIPE_LOAD_FAILED_AGAIN_MESSAGE : STUDIO_BG3D_RECIPE_LOAD_FAILED_MESSAGE,
        });
        return false;
      }
      return await runtime.placeStudioBg3dModelWithRecipe(h, modelId, recipe, RECIPE_RUN_DEPS);
    } catch {
      h.setSurfaceSnapStatus({ tone: "error", message: STUDIO_BG3D_RECIPE_UNEXPECTED_MESSAGE });
      return false;
    } finally {
      placementInFlight = false;
    }
  };
}
