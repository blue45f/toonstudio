import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveStudioBg3dBundleRecordSource, studioBg3dBundleAssetRights } from "./studio-bg3d-bundle-asset-loader";
import { parseStudioBg3dBundleThemePacks, type StudioBg3dBundleThemePacks } from "./studio-bg3d-bundle-theme-packs";
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

function readThemePacks(): StudioBg3dBundleThemePacks {
  const path = fileURLToPath(
    new URL(
      "../../../../public/assets/3d/environments/bundle-v1/theme-packs.json",
      import.meta.url,
    ),
  );
  return parseStudioBg3dBundleThemePacks(JSON.parse(readFileSync(path, "utf8")));
}

describe("studio-bg3d-genre-scene-pack-links (G8)", () => {
  it("검증된 네 번들 팩을 기존 프리셋의 장르·테마에 정확히 연결한다", () => {
    expect(validateStudioBg3dGenreScenePackBundleLinks()).toEqual([]);
    expect(STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS.map(entry => entry.presetId)).toEqual([
      "fantasy-old-town-arrival", "thriller-corridor-dutch", "scifi-arena-showdown", "thriller-graveyard-vigil",
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
    expect(listStudioBg3dGenreScenePackBundleLinks("thriller")).toHaveLength(2);
    expect(listStudioBg3dGenreScenePackBundleLinks("scifi")).toHaveLength(1);
    expect(listStudioBg3dGenreScenePackBundleLinks(null)).toHaveLength(4);
  });

  it("네 팩 790개 실물과 대표 ID·테마·현재 권리를 대조하고 철회된 대표는 해석하지 않는다", async () => {
    const document = readThemePacks();
    // 번들 라이선스 구조(서비스 내 사용 전용)가 유지될 때만 연결이 유효하다.
    expect(document.inServiceOnly).toBe(true);
    expect(document.downloadable).toBe(false);
    // 2026-10-28 실측한 CC0 8팩의 메타데이터다(기존708개+새4팩1056개).
    // 장르 프리셋 연결은 기존 두 팩 423개에 Blue Base·Graveyard 367개를 더한다.
    expect(document.totals.placeableAssets).toBe(1764);

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
        expect(realPack?.theme).toBe(entry.bundleThemeId);
        expect(document.assets.filter((asset) => asset.packIndex === pack.packIndex)).toHaveLength(pack.placeableCount);
        expect(pack.sampleAssetIds).toHaveLength(3);
        expect(new Set(pack.sampleAssetIds).size).toBe(3);
        for (const assetId of pack.sampleAssetIds) {
          const asset = assetById.get(assetId);
          expect(asset, `${entry.presetId} sample ${assetId}`).toBeDefined();
          expect(asset?.packIndex).toBe(pack.packIndex);
          if (!asset) throw new Error("카탈로그에 대표 에셋이 없습니다.");
          expect(studioBg3dBundleAssetRights(asset, document)).toEqual({
            status: "public-domain", licenseName: "CC0-1.0", commercialUse: true, attributionRequired: false,
          });
          const source = await resolveStudioBg3dBundleRecordSource(assetId, { loadData: async () => document });
          expect(source).toMatchObject({ id: assetId, sha256: asset.sha256, byteSize: asset.bytes,
            rights: { status: "public-domain", licenseName: "CC0-1.0" } });
        }
      }
      linkedPlaceable += entry.totalPlaceable;
    }
    expect(STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS.flatMap(link => link.packs.map(pack => pack.packTitle)))
      .toEqual(["Cute Park Pack", "Cute Dungeon Megapack", "Sci-Fi Arena: Blue Base", "Cute Graveyard"]);
    expect(STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS.flatMap((entry) => entry.packs.map((pack) => [pack.packIndex, pack.placeableCount])))
      .toEqual([[1, 103], [2, 320], [5, 114], [6, 253]]);
    expect(linkedPlaceable).toBe(790);
    expect(getStudioBg3dGenreScenePackBundleLink("scifi-arena-showdown")?.packs[0]?.sampleAssetIds)
      .toContain("cbv1-ingest-local-scifi-blue-base-other-pilarp-1-a-f60ddaf9f6b2");
    expect(getStudioBg3dGenreScenePackBundleLink("thriller-graveyard-vigil")?.packs[0]?.sampleAssetIds)
      .toContain("cbv1-ingest-local-cute-graveyard-tombstone-1-8b880b748740");
    const withdrawn = { ...document,
      packs: document.packs.map((pack, index) => index === 5 || index === 6 ? { ...pack, placeable: 0 } : pack),
      assets: document.assets.filter((asset) => asset.packIndex !== 5 && asset.packIndex !== 6),
      totals: { ...document.totals, placeableAssets: document.totals.placeableAssets - 367 },
    };
    for (const preset of ["scifi-arena-showdown", "thriller-graveyard-vigil"]) {
      const reference = getStudioBg3dGenreScenePackBundleLink(preset)?.packs[0];
      expect(reference?.sampleAssetIds).toHaveLength(3);
      for (const assetId of reference?.sampleAssetIds ?? []) {
        expect(await resolveStudioBg3dBundleRecordSource(assetId, { loadData: async () => withdrawn })).toBeNull();
      }
    }
  });
});
