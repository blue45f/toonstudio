import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS,
  getStudioBg3dGenreScenePackBundleLink,
  listStudioBg3dGenreScenePackBundleLinks,
  validateStudioBg3dGenreScenePackBundleLinks,
} from "./studio-bg3d-genre-scene-pack-links";
import {
  STUDIO_BG3D_SCENE_COMPOSITION_PRESETS,
  STUDIO_BG3D_SCENE_GENRES,
} from "./studio-bg3d-scene-composition-presets";

interface ThemePacksDocument {
  readonly inServiceOnly: boolean;
  readonly downloadable: boolean;
  readonly themes: readonly { readonly id: string }[];
  readonly packs: readonly { readonly title: string; readonly placeable: number }[];
  readonly assets: readonly { readonly id: string; readonly pack: number }[];
  readonly totals: { readonly placeableAssets: number };
}

function readThemePacks(): ThemePacksDocument {
  const path = fileURLToPath(
    new URL(
      "../../../../public/assets/3d/environments/bundle-v1/theme-packs.json",
      import.meta.url,
    ),
  );
  return JSON.parse(readFileSync(path, "utf8")) as ThemePacksDocument;
}

describe("studio-bg3d-genre-scene-pack-links (G8)", () => {
  it("검증된 두 번들 팩을 기존 프리셋의 장르·테마에 정확히 연결한다", () => {
    expect(validateStudioBg3dGenreScenePackBundleLinks()).toEqual([]);
    expect(STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS.map(entry => entry.presetId)).toEqual([
      "fantasy-old-town-arrival", "thriller-corridor-dutch",
    ]);

    const presetIds = new Set(STUDIO_BG3D_SCENE_COMPOSITION_PRESETS.map((preset) => preset.id));
    for (const entry of STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS) {
      expect(presetIds.has(entry.presetId)).toBe(true);
      expect(getStudioBg3dGenreScenePackBundleLink(entry.presetId)).toBe(entry);
    }
    expect(getStudioBg3dGenreScenePackBundleLink("no-such-pack")).toBeUndefined();
    // 확인되지 않은 번들 연결을 없애도 카메라·조명 프리셋은 유지한다.
    expect(getStudioBg3dGenreScenePackBundleLink("romance-cafe-two-shot")).toBeUndefined();
    expect(getStudioBg3dGenreScenePackBundleLink("fantasy-forest-shrine")).toBeUndefined();
    expect(presetIds.has("fantasy-forest-shrine")).toBe(true);
  });

  it("모든 장르·16개 프리셋을 보존하고 검증되지 않은 번들 팩은 연결하지 않는다", () => {
    const genreIds = STUDIO_BG3D_SCENE_GENRES.map((genre) => genre.id);
    expect(genreIds).toContain("fantasy");
    expect(genreIds).toContain("scifi");
    expect(STUDIO_BG3D_SCENE_COMPOSITION_PRESETS).toHaveLength(16);
    expect(listStudioBg3dGenreScenePackBundleLinks("fantasy")).toHaveLength(1);
    expect(listStudioBg3dGenreScenePackBundleLinks("thriller")).toHaveLength(1);
    expect(listStudioBg3dGenreScenePackBundleLinks("scifi")).toHaveLength(0);
    expect(listStudioBg3dGenreScenePackBundleLinks(null)).toHaveLength(2);
  });

  it("references only assets that really exist in theme-packs.json, with matching pack snapshots", () => {
    const document = readThemePacks();
    // 번들 라이선스 구조(서비스 내 사용 전용)가 유지될 때만 연결이 유효하다.
    expect(document.inServiceOnly).toBe(true);
    expect(document.downloadable).toBe(false);
    // 2026-10-28 실측한 Park 103개·Dungeon 320개·Graveyard 253개·Weapons 32개의 메타데이터다.
    // 장르 프리셋 연결은 기존 두 팩 423개만 유지한다.
    expect(document.totals.placeableAssets).toBe(708);

    const themeIds = new Set(document.themes.map((theme) => theme.id));
    const assetById = new Map(document.assets.map((asset) => [asset.id, asset]));
    let linkedPlaceable = 0;
    for (const entry of STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS) {
      expect(themeIds.has(entry.bundleThemeId), entry.presetId).toBe(true);
      for (const pack of entry.packs) {
        const realPack = document.packs[pack.packIndex];
        expect(realPack, `${entry.presetId} pack ${pack.packIndex}`).toBeDefined();
        expect(realPack?.title).toBe(pack.packTitle);
        expect(realPack?.placeable).toBe(pack.placeableCount);
        expect(pack.sampleAssetIds.length).toBeGreaterThan(0);
        for (const assetId of pack.sampleAssetIds) {
          const asset = assetById.get(assetId);
          expect(asset, `${entry.presetId} sample ${assetId}`).toBeDefined();
          expect(asset?.pack).toBe(pack.packIndex);
        }
      }
      linkedPlaceable += entry.totalPlaceable;
    }
    expect(STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS.flatMap(link => link.packs.map(pack => pack.packTitle)))
      .toEqual(["Cute Park Pack", "Cute Dungeon Megapack"]);
    expect(linkedPlaceable).toBe(423);
  });
});
