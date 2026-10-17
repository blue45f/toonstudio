import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_RECIPE_LOAD_FAILED_MESSAGE,
  attachStudioBg3dEditorRecipeHost,
} from "./studio-bg3d-editor-recipe-host";

import type { StudioBg3dEditorRecipeHost } from "./studio-bg3d-editor-recipe-run";

// 배포 직후 옛 청크가 사라진 상황처럼 본문 모듈을 불러오지 못하는 경우.
vi.mock("./studio-bg3d-editor-recipe-run", () => {
  throw new Error("chunk-load-failed");
});

describe("attachStudioBg3dEditorRecipeHost — 본문을 불러오지 못할 때", () => {
  it("던지지 않고 장면을 그대로 둔 채 상태 줄(오류)로 다음 행동을 알리며, 다음 누름을 막지 않는다", async () => {
    const status = vi.fn();
    const host = { setSurfaceSnapStatus: status } as unknown as StudioBg3dEditorRecipeHost;
    attachStudioBg3dEditorRecipeHost(host);

    await expect(host.placeCustomModelWithRecipe("model-1", "floor")).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith({ tone: "error", message: STUDIO_BG3D_RECIPE_LOAD_FAILED_MESSAGE });
    // 첫 실패가 진행 중 표시를 남기지 않아 다시 누르면 같은 안내가 다시 나온다(영구히 막히지 않는다).
    await expect(host.placeCustomModelWithRecipe("model-1", "floor")).resolves.toBe(false);
    expect(status).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenLastCalledWith({ tone: "error", message: STUDIO_BG3D_RECIPE_LOAD_FAILED_MESSAGE });
  });
});
