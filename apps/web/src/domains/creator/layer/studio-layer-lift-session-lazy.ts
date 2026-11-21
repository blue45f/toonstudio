/**
 * 컷 레이어 분리 세션 팩토리의 지연 진입 경계.
 * 실제 레이어 분리를 열거나 실행할 때만 `studio-layer-lift-session`을 동적 로드한다.
 */
import { createStudioIntentLazyLoader } from "../studio-intent-lazy-loader";
import { closedStudioLayerLiftUiState } from "../studio-page-shell-runtime";

import type { StudioLayerLiftSessionContext } from "./studio-layer-lift-session";

export {
  resolveStudioLayerLiftDisabledReason,
  type StudioLayerLiftDisabledReasonInput,
} from "./studio-layer-lift-disabled-reason";

type StudioLayerLiftSessionModule = typeof import("./studio-layer-lift-session");

const layerLiftSessionLoader = createStudioIntentLazyLoader<StudioLayerLiftSessionModule>(
  () => import("./studio-layer-lift-session"),
);

export function createStudioLayerLiftSessionLazy(ctx: StudioLayerLiftSessionContext) {
  function closeStudioLayerLift() {
    ctx.studioLayerLiftRunIdRef.current += 1;
    ctx.studioLayerLiftAbortRef.current?.abort();
    ctx.studioLayerLiftAbortRef.current = null;
    ctx.studioLayerLiftRegistryRef.current?.invalidate();
    const previous = ctx.studioLayerLiftPreviewResourceRef.current;
    if (previous) {
      ctx.studioLayerLiftPreviewResourceRef.current = null;
      previous.revoke();
    }
    ctx.setStudioLayerLiftUi(closedStudioLayerLiftUiState());
  }

  return {
    applyStudioLayerLift: async () =>
      (await layerLiftSessionLoader.load()).createStudioLayerLiftSession(ctx).applyStudioLayerLift(),
    closeStudioLayerLift,
    correctStudioLayerLift: async (stroke: Parameters<ReturnType<StudioLayerLiftSessionModule["createStudioLayerLiftSession"]>["correctStudioLayerLift"]>[0]) =>
      (await layerLiftSessionLoader.load()).createStudioLayerLiftSession(ctx).correctStudioLayerLift(stroke),
    openStudioLayerLift: () => {
      void layerLiftSessionLoader.load().then(
        (mod) => mod.createStudioLayerLiftSession(ctx).openStudioLayerLift(),
        () => {
          ctx.setError("컷 레이어 분리 도구를 불러오지 못했습니다. 다시 시도해 주세요.");
        },
      );
    },
    runStudioLayerLiftAnalysis: async (
      sourceId: string,
      options: Parameters<ReturnType<StudioLayerLiftSessionModule["createStudioLayerLiftSession"]>["runStudioLayerLiftAnalysis"]>[1],
    ) =>
      (await layerLiftSessionLoader.load())
        .createStudioLayerLiftSession(ctx)
        .runStudioLayerLiftAnalysis(sourceId, options),
  };
}
