import { describe, expect, it, vi } from "vitest";

import { studioBundleAssetRights } from "../catalog/studio-bundle-source-credit";
import { studioBundleCreditFixture } from "../catalog/studio-bundle-source-credit.test-fixture";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "../contracts/studio-bg3d-scene-document";
import { bindStudioSavedBg3dInsertion } from "./studio-saved-bg3d-insertion";

import type { StudioAsset } from "../studio-asset-library";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { El } from "../studio-element-model";
import type { CanvasImagePlacement } from "../studio-image-placement";

const asset: StudioAsset = {
  id: "saved-bg3d", name: "아파트 거실", dataUrl: "data:image/png;base64,AAAA",
  kind: "bg3d", contentHash: `sha256:${"a".repeat(64)}`, width: 390, height: 520, createdAt: 0,
};
const scene = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT;
const ticket: StudioEditorMutationTicket = { authScopeKey: "owner", workId: null, accessGeneration: 0, documentGeneration: 0 };
const placement: CanvasImagePlacement = { bounds: { x: 20, y: 24, width: 170, height: 220 }, inset: 6 };

function fixture() {
  const elements: El[] = [];
  const scope = { pageId: "cut-a", menu: {}, master: false, reviewLocked: false, elements, revision: {},
    selectedId: "layer-a" as string | null, marqueeIds: [] as string[], groupId: null, ownsLocalDraft: true };
  const assets = [asset];
  const addImage = vi.fn(() => true);
  const closeMenu = vi.fn();
  const reportReadFailure = vi.fn();
  const canApplyMutation = vi.fn(() => true);
  const readScene = vi.fn<typeof import("../studio-asset-library").readStudioAssetBg3dScene>();
  const insert = bindStudioSavedBg3dInsertion({
    elements, intent: { current: 0 }, captureMutationTicket: () => ticket, canApplyMutation,
    readScope: () => ({ ...scope }), readAssets: () => assets, addImage, closeMenu, reportReadFailure,
  }, readScene);
  return { addImage, assets, canApplyMutation, closeMenu, insert, readScene, reportReadFailure, scope };
}

describe("inserting a saved 3D material", () => {
  it.each(["page", "selection", "asset", "menu", "review", "authority"] as const)(
    "leaves the canvas and menu untouched when the %s changes during the read",
    async (changed) => {
      const f = fixture();
      const read = Promise.withResolvers<typeof scene>();
      f.readScene.mockReturnValueOnce(read.promise);
      const pending = f.insert(asset, { placement, closeMenu: true });
      if (changed === "page") f.scope.pageId = "cut-b";
      if (changed === "selection") f.scope.selectedId = "layer-b";
      if (changed === "asset") f.assets.splice(0, 1, { ...asset, contentHash: `sha256:${"b".repeat(64)}` });
      if (changed === "menu") f.scope.menu = {};
      if (changed === "review") f.scope.reviewLocked = true;
      if (changed === "authority") f.canApplyMutation.mockReturnValue(false);
      read.resolve(scene);
      expect(await pending).toBe(false);
      expect(f.addImage).not.toHaveBeenCalled();
      expect(f.closeMenu).not.toHaveBeenCalled();
    },
  );

  it("passes the same typed scene with the foreground insertion and exact placement", async () => {
    const f = fixture();
    const oldRead = Promise.withResolvers<typeof scene>();
    f.readScene.mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce(scene);
    const previous = f.insert(asset, { closeMenu: true });
    expect(await f.insert(asset, { placement })).toBe(true);
    oldRead.resolve(scene);
    expect(await previous).toBe(false);
    expect(f.addImage).toHaveBeenCalledExactlyOnceWith(
      asset.dataUrl, asset.width, asset.height, undefined, false, { name: asset.name, bg3dScene: scene }, placement,
    );
    expect(f.closeMenu).not.toHaveBeenCalled();
  });

  it("keeps a PNG-only record working and leaves a real read failure retryable", async () => {
    const f = fixture();
    f.readScene.mockRejectedValueOnce(new Error("local storage unavailable")).mockResolvedValueOnce(null);
    expect(await f.insert(asset, { closeMenu: true })).toBe(false);
    expect(f.reportReadFailure).toHaveBeenCalledOnce();
    expect(f.addImage).not.toHaveBeenCalled();
    expect(f.closeMenu).not.toHaveBeenCalled();
    expect(await f.insert(asset, { closeMenu: true })).toBe(true);
    expect(f.addImage).toHaveBeenCalledExactlyOnceWith(asset.dataUrl, asset.width, asset.height);
    expect(f.closeMenu).toHaveBeenCalledOnce();
  });

  it("preserves raster-only placement without reading private scene data on a shared target", async () => {
    const f = fixture();
    f.scope.ownsLocalDraft = false;
    expect(await f.insert(asset, { placement })).toBe(true);
    expect(f.readScene).not.toHaveBeenCalled();
    expect(f.addImage).toHaveBeenCalledExactlyOnceWith(asset.dataUrl, asset.width, asset.height, undefined, false, {}, placement);
  });

  it("keeps bundle credit validation on an editable local insertion", async () => {
    const f = fixture();
    const credit = studioBundleCreditFixture();
    const credited = { ...asset, bundleSourceCredit: credit, rights: studioBundleAssetRights(credit) };
    f.assets.splice(0, 1, credited);
    f.readScene.mockResolvedValue(scene);
    expect(await f.insert(credited)).toBe(true);
    expect(f.addImage).toHaveBeenCalledExactlyOnceWith(asset.dataUrl, asset.width, asset.height, undefined, false, {
      name: asset.name, bg3dScene: scene, bundleSourceCredit: credit,
    }, undefined);
    f.assets.splice(0, 1, { ...credited, rights: { ...credited.rights, rightsConfirmed: false } });
    expect(await f.insert(credited)).toBe(false);
    expect(f.addImage).toHaveBeenCalledOnce();
  });
});
