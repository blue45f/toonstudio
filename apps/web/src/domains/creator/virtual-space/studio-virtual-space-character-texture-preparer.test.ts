import { describe, expect, it, vi } from "vitest";

import { createStudioCharacterTexturePreparer } from "./studio-virtual-space-character-texture-preparer";
import { STUDIO_CHARACTER_SKINS, studioCharacterSkinForArtStyle } from "./studio-virtual-space-character-skins";
import { studioCharacterStaticAsset, type StudioCharacterTextureAsset } from "./studio-virtual-space-character-assets";
import { createStudioLpcSkin, STUDIO_LPC_CHARACTERS } from "./lpc/studio-lpc-characters";

function fakeScene(sizes: Record<string, { width: number; height: number }>) {
  const textures = new Map(Object.entries(sizes).map(([key, size]) => [key, {
    setFilter: vi.fn(),
    getSourceImage: () => size,
    has: () => true,
    add: vi.fn(),
  }] as const));
  const remove = vi.fn((key: string) => { textures.delete(key); });
  const scene = { textures: { exists: (key: string) => textures.has(key), get: (key: string) => textures.get(key), remove }, load: { image: vi.fn(), spritesheet: vi.fn() } };
  return { scene, textures, remove };
}

describe("캐릭터 텍스처 준비", () => {
  it("픽셀 아트(LPC) 에셋의 최근접 필터 힌트를 텍스처에 적용한다(일러스트 화풍의 선형 월드에서도 도트가 번지지 않는다)", () => {
    const lpc = createStudioLpcSkin(STUDIO_LPC_CHARACTERS.find((item) => item.id === "player-hana")!);
    const asset = studioCharacterStaticAsset(lpc, "down");
    expect(asset.textureFilter).toBe("nearest");
    const { scene, textures } = fakeScene({ [asset.key]: { width: asset.atlas?.width ?? 1152, height: asset.atlas?.height ?? 512 } });
    const { prepareCharacterTexture } = createStudioCharacterTexturePreparer({ scene: scene as never, failedTextures: new Set() });
    prepareCharacterTexture(asset);
    expect(textures.get(asset.key)?.setFilter).toHaveBeenCalledWith(1);
  });

  it("힌트가 없는 일러스트 에셋은 필터를 바꾸지 않는다", () => {
    const skin = studioCharacterSkinForArtStyle(STUDIO_CHARACTER_SKINS[0]!, "sky-island");
    const asset: StudioCharacterTextureAsset = studioCharacterStaticAsset(skin, "down");
    expect(asset.textureFilter).toBeUndefined();
    const { scene, textures } = fakeScene({ [asset.key]: { width: 160, height: 160 } });
    const { prepareCharacterTexture } = createStudioCharacterTexturePreparer({ scene: scene as never, failedTextures: new Set() });
    expect(prepareCharacterTexture(asset)).toBe(true);
    expect(textures.get(asset.key)?.setFilter).not.toHaveBeenCalled();
  });

  it("없는 텍스처는 false를 돌려주고 아무것도 건드리지 않는다", () => {
    const { scene } = fakeScene({});
    const skin = studioCharacterSkinForArtStyle(STUDIO_CHARACTER_SKINS[0]!, "sky-island");
    const { prepareCharacterTexture } = createStudioCharacterTexturePreparer({ scene: scene as never, failedTextures: new Set() });
    expect(prepareCharacterTexture(studioCharacterStaticAsset(skin, "down"))).toBe(false);
  });
});
