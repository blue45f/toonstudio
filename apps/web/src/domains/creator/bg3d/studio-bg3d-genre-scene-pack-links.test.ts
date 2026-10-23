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
  it("links every G8 pack to a real preset with matching genre and bundle theme", () => {
    expect(validateStudioBg3dGenreScenePackBundleLinks()).toEqual([]);
    expect(STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS.length).toBe(8);

    const presetIds = new Set(STUDIO_BG3D_SCENE_COMPOSITION_PRESETS.map((preset) => preset.id));
    for (const entry of STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS) {
      expect(presetIds.has(entry.presetId)).toBe(true);
      expect(getStudioBg3dGenreScenePackBundleLink(entry.presetId)).toBe(entry);
    }
    expect(getStudioBg3dGenreScenePackBundleLink("no-such-pack")).toBeUndefined();
    // 기존 8팩은 번들 연결이 없는 카메라·조명 전용 팩으로 남는다.
    expect(getStudioBg3dGenreScenePackBundleLink("romance-cafe-two-shot")).toBeUndefined();
  });

  it("covers the new fantasy and scifi genres with at least three packs each", () => {
    const genreIds = STUDIO_BG3D_SCENE_GENRES.map((genre) => genre.id);
    expect(genreIds).toContain("fantasy");
    expect(genreIds).toContain("scifi");
    expect(listStudioBg3dGenreScenePackBundleLinks("fantasy")).toHaveLength(3);
    expect(listStudioBg3dGenreScenePackBundleLinks("scifi")).toHaveLength(3);
    expect(listStudioBg3dGenreScenePackBundleLinks(null)).toHaveLength(8);
  });

  it("references only assets that really exist in theme-packs.json, with matching pack snapshots", () => {
    const document = readThemePacks();
    // 번들 라이선스 구조(서비스 내 사용 전용)가 유지될 때만 연결이 유효하다.
    expect(document.inServiceOnly).toBe(true);
    expect(document.downloadable).toBe(false);
    // 2026-10-22 임베드 병합·5라운드 재생성+이름변경·신규 팩 후속 병합 기준: 배치 가능 에셋 총량은 14,928개다.
    expect(document.totals.placeableAssets).toBe(14928);

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
    // 8개 팩이 잇는 배치 가능 에셋 합계 스냅샷(팩 18은 두 팩이 공유해 두 번 센 값).
    expect(linkedPlaceable).toBe(1740);
  });
});
