/**
 * BG3D 편집기 열기 시점에만 공유 3D 세션 빌더와 WebXR 보존 라우트 브리지를 지연 로드한다.
 */
import { lazyRetry } from "@/shared/lib/lazy-retry";

import { createStudioIntentLazyLoader } from "./studio-intent-lazy-loader";

export interface StudioShared3dSceneSessionModules {
  readonly createStudioShared3dSceneSessionFromElements: typeof import("./studio-shared-3d-scene-bridge").createStudioShared3dSceneSessionFromElements;
  readonly createStudioShared3dSceneSessionForStage: typeof import("./studio-shared-3d-stage-session").createStudioShared3dSceneSessionForStage;
}

const shared3dSceneSessionLoader = createStudioIntentLazyLoader<StudioShared3dSceneSessionModules>(
  async () => {
    const [bridge, stageSession] = await Promise.all([
      import("./studio-shared-3d-scene-bridge"),
      import("./studio-shared-3d-stage-session"),
    ]);
    return {
      createStudioShared3dSceneSessionFromElements: bridge.createStudioShared3dSceneSessionFromElements,
      createStudioShared3dSceneSessionForStage: stageSession.createStudioShared3dSceneSessionForStage,
    };
  },
);

export const loadStudioShared3dSceneSessionModules = shared3dSceneSessionLoader.load;
export const preloadStudioShared3dSceneSessionModules = shared3dSceneSessionLoader.preload;

export const StudioBg3dRetainedOwnerRouteBridge = lazyRetry(
  () => import("./bg3d/StudioBg3dRetainedOwnerRouteBridge").then((mod) => ({
    default: mod.StudioBg3dRetainedOwnerRouteBridge,
  })),
  "StudioBg3dRetainedOwnerRouteBridge",
);
