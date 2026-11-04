import { expect, it, vi } from "vitest";

it("계층 모듈부터 가져와도 레시피 없는 기본 문서를 초기화한다", async () => {
  vi.resetModules();
  const hierarchy = await import("./studio-bg3d-hierarchy");
  const document = await import("./studio-bg3d-scene-document");
  expect(hierarchy.normalizeStudioBg3dSceneRecipeEnvelope(undefined)).toBeUndefined();
  expect(document.createDefaultStudioBg3dSceneDocument()).toEqual(document.DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT);
  expect(Object.isFrozen(document.DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT)).toBe(true);
});
