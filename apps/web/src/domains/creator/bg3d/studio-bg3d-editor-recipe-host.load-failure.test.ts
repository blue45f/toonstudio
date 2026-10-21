import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_RECIPE_LOAD_FAILED_AGAIN_MESSAGE,
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
    // 첫 실패가 진행 중 표시를 남기지 않아 다시 누르면 불러오기를 다시 시도한다(영구히 막히지 않는다).
    // 브라우저가 실패한 불러오기를 기억해 같은 실패를 되풀이할 수 있어서, 연달아 실패하면 새로고침을 먼저 안내한다.
    await expect(host.placeCustomModelWithRecipe("model-1", "floor")).resolves.toBe(false);
    expect(status).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenLastCalledWith({ tone: "error", message: STUDIO_BG3D_RECIPE_LOAD_FAILED_AGAIN_MESSAGE });
    await expect(host.placeCustomModelWithRecipe("model-1", "floor")).resolves.toBe(false);
    expect(status).toHaveBeenLastCalledWith({ tone: "error", message: STUDIO_BG3D_RECIPE_LOAD_FAILED_AGAIN_MESSAGE });
  });

  it("두 번째 실패부터의 안내는 새로고침을 말하고, 첫 안내는 연결 확인을 말한다", () => {
    expect(STUDIO_BG3D_RECIPE_LOAD_FAILED_MESSAGE).toContain("인터넷 연결을 확인한 뒤 다시 눌러 주세요");
    expect(STUDIO_BG3D_RECIPE_LOAD_FAILED_AGAIN_MESSAGE).toContain("페이지를 새로고침한 뒤 다시 눌러 주세요");
  });
});
