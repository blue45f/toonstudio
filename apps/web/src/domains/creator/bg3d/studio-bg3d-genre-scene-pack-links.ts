/**
 * Studio BG3D 장르 씬팩 ↔ Creator Bundle 연결 데이터 (G8, 2026-10-22).
 *
 * 씬팩(studio-bg3d-scene-composition-presets.ts)은 카메라+조명만 들고 있고, 실제로 무대를
 * 채울 소품·배경은 Creator Bundle 테마 팩(theme-packs.json, 배치 가능 5,303개 — D2 정정
 * 기준)이 들고 있다. 이 모듈은 두 데이터를 잇는 순수 데이터 계층이다: 팩마다 어떤 번들
 * 테마/팩에서 에셋을 가져올 수 있는지와, 그 팩에 실재하는 대표 에셋 id를 기록한다.
 *
 * 정직성 계약:
 * - sampleAssetIds는 theme-packs.json의 assets[].id에 실제로 있는 값만 쓴다. 존재하지 않는
 *   에셋을 참조하는 데이터는 만들지 않으며, 대조 테스트
 *   (studio-bg3d-genre-scene-pack-links.test.ts)가 JSON 실물과 전수 대조한다.
 * - placeableCount는 theme-packs.json packs[].placeable의 스냅샷이다. 번들이 재생성돼
 *   수치가 바뀌면 대조 테스트가 실패해 이 파일의 갱신을 강제한다.
 * - 번들 라이선스: 서비스 내 사용 전용(inServiceOnly: true, downloadable: false). 이 모듈은
 *   에셋 id만 참조할 뿐 다운로드 경로나 파일 자체를 새로 노출하지 않는다. 실제 배치는 기존
 *   번들 로더(studio-bg3d-bundle-theme-packs.ts)의 검증 경로를 그대로 탄다.
 */

import {
  getStudioBg3dSceneCompositionPreset,
  type StudioBg3dSceneGenreId,
} from "./studio-bg3d-scene-composition-presets";

/** 번들 팩 하나에 대한 연결 정보. packIndex는 theme-packs.json packs 배열의 위치다. */
export interface StudioBg3dGenreScenePackBundlePackRef {
  readonly packIndex: number;
  readonly packTitle: string;
  /** theme-packs.json packs[].placeable 스냅샷(배치 가능 에셋 수). */
  readonly placeableCount: number;
  /** 그 팩에 실재하는 대표 에셋 id (theme-packs.json assets[].id). */
  readonly sampleAssetIds: readonly string[];
}

export interface StudioBg3dGenreScenePackBundleLink {
  /** 씬팩 id (studio-bg3d-scene-composition-presets.ts의 프리셋). */
  readonly presetId: string;
  readonly genreId: StudioBg3dSceneGenreId;
  /** theme-packs.json themes[].id 와 같은 번들 테마 id. */
  readonly bundleThemeId: string;
  readonly packs: readonly StudioBg3dGenreScenePackBundlePackRef[];
  /** 연결된 팩들의 배치 가능 에셋 합계(스냅샷). */
  readonly totalPlaceable: number;
}

function link(
  presetId: string,
  genreId: StudioBg3dSceneGenreId,
  bundleThemeId: string,
  packs: readonly StudioBg3dGenreScenePackBundlePackRef[],
): StudioBg3dGenreScenePackBundleLink {
  return Object.freeze({
    presetId,
    genreId,
    bundleThemeId,
    packs: Object.freeze(packs.map((pack) => Object.freeze({ ...pack }))),
    totalPlaceable: packs.reduce((sum, pack) => sum + pack.placeableCount, 0),
  });
}

export const STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS: readonly StudioBg3dGenreScenePackBundleLink[] =
  Object.freeze([
    link("fantasy-forest-shrine", "fantasy", "nature", [
      {
        packIndex: 9,
        packTitle: "NatureForge — Stylized Woodland Forest Pack",
        placeableCount: 255,
        sampleAssetIds: [
          "cbv1-ingest-143-natureforgeprostylizedwoodland-godot-2026-10-18--m001",
          "cbv1-ingest-143-natureforgeprostylizedwoodland-godot-2026-10-18--m002",
          "cbv1-ingest-143-natureforgeprostylizedwoodland-godot-2026-10-18--m003",
        ],
      },
      {
        packIndex: 5,
        packTitle: "LumaGrove — Wonky Woods",
        placeableCount: 206,
        sampleAssetIds: [
          "cbv1-ingest-135-lumagrovewonkywoods-godot-2026-09-29-m001",
          "cbv1-ingest-135-lumagrovewonkywoods-godot-2026-09-29-m002",
          "cbv1-ingest-135-lumagrovewonkywoods-godot-2026-09-29-m003",
        ],
      },
    ]),
    link("fantasy-old-town-arrival", "fantasy", "city", [
      {
        packIndex: 1,
        packTitle: "Old Town — Courtyards",
        placeableCount: 192,
        sampleAssetIds: [
          "cbv1-ingest-145-oldtownenvironmentcourtyardslite-2026-08-20-m002",
          "cbv1-ingest-145-oldtownenvironmentcourtyardslite-2026-08-20-m004",
          "cbv1-ingest-145-oldtownenvironmentcourtyardslite-2026-08-20-m006",
        ],
      },
    ]),
    link("fantasy-swamp-crossing", "fantasy", "swamp", [
      {
        packIndex: 30,
        packTitle: "Swamp Builder — Nature·Architecture",
        placeableCount: 247,
        sampleAssetIds: [
          "cbv1-ingest-235-swamp-builder-godot-m001",
          "cbv1-ingest-235-swamp-builder-godot-m002",
          "cbv1-ingest-235-swamp-builder-godot-m003",
        ],
      },
    ]),
    link("scifi-arena-showdown", "scifi", "sci-fi", [
      {
        packIndex: 18,
        packTitle: "Sci-Fi Arena: 1",
        placeableCount: 30,
        sampleAssetIds: [
          "cbv1-ingest-162-sci-fi-arena-pack-2022-3-6f1-m002",
          "cbv1-ingest-162-sci-fi-arena-pack-2022-3-6f1-m004",
          "cbv1-ingest-162-sci-fi-arena-pack-2022-3-6f1-m006",
        ],
      },
      {
        packIndex: 19,
        packTitle: "Sci-Fi Arena: 2",
        placeableCount: 29,
        sampleAssetIds: [
          "cbv1-ingest-161-sci-fi-arena-pack-2-2022-3-6f1-m002",
          "cbv1-ingest-161-sci-fi-arena-pack-2-2022-3-6f1-m004",
          "cbv1-ingest-161-sci-fi-arena-pack-2-2022-3-6f1-m006",
        ],
      },
    ]),
    link("scifi-planet-survey", "scifi", "sci-fi", [
      {
        packIndex: 20,
        packTitle: "CosmoKit — Stylized Low Poly Planets",
        placeableCount: 34,
        sampleAssetIds: [
          "cbv1-ingest-032-cosmokitstylizedlowpolyplanets-godot-2026-09-29-m001",
          "cbv1-ingest-032-cosmokitstylizedlowpolyplanets-godot-2026-09-29-m002",
          "cbv1-ingest-032-cosmokitstylizedlowpolyplanets-godot-2026-09-29-m003",
        ],
      },
    ]),
    link("scifi-station-portrait", "scifi", "sci-fi", [
      {
        packIndex: 18,
        packTitle: "Sci-Fi Arena: 1",
        placeableCount: 30,
        sampleAssetIds: [
          "cbv1-ingest-162-sci-fi-arena-pack-2022-3-6f1-m004",
          "cbv1-ingest-162-sci-fi-arena-pack-2022-3-6f1-m006",
        ],
      },
    ]),
    link("thriller-graveyard-vigil", "thriller", "horror", [
      {
        packIndex: 22,
        packTitle: "NecroPOLY — Stylized Graveyard",
        placeableCount: 148,
        sampleAssetIds: [
          "cbv1-ingest-125-lowpolycemeterykitnecropolygravesmodule-2026-09--m002",
          "cbv1-ingest-125-lowpolycemeterykitnecropolygravesmodule-2026-09--m004",
          "cbv1-ingest-125-lowpolycemeterykitnecropolygravesmodule-2026-09--m006",
        ],
      },
      {
        packIndex: 24,
        packTitle: "Cemetery Statues Pack",
        placeableCount: 50,
        sampleAssetIds: [
          "cbv1-ingest-028-cemeterystatuespack-godot-2026-09-29-m001",
          "cbv1-ingest-028-cemeterystatuespack-godot-2026-09-29-m003",
          "cbv1-ingest-028-cemeterystatuespack-godot-2026-09-29-m005",
        ],
      },
    ]),
    link("daily-subway-commute", "daily", "interior", [
      {
        packIndex: 15,
        packTitle: "PixelDrift Metro — 3D Pixel Art Subway (VR)",
        placeableCount: 256,
        sampleAssetIds: [
          "cbv1-ingest-138-metro-2026-31-1-00-17-18-m002",
          "cbv1-ingest-138-metro-2026-31-1-00-17-18-m004",
          "cbv1-ingest-138-metro-2026-31-1-00-17-18-m006",
        ],
      },
    ]),
  ]);

/** 씬팩 id로 번들 연결을 찾습니다. 연결이 없는 팩이면 undefined를 돌립니다. */
export function getStudioBg3dGenreScenePackBundleLink(
  presetId: string,
): StudioBg3dGenreScenePackBundleLink | undefined {
  return STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS.find((entry) => entry.presetId === presetId);
}

/** 장르별 번들 연결 목록. null이면 전체를 돌립니다. */
export function listStudioBg3dGenreScenePackBundleLinks(
  genreId: StudioBg3dSceneGenreId | null,
): readonly StudioBg3dGenreScenePackBundleLink[] {
  if (genreId === null) return STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS;
  return STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS.filter((entry) => entry.genreId === genreId);
}

/**
 * 연결 데이터의 자기 정합성: 모든 링크가 실재하는 씬팩을 가리키고, 팩의 장르·번들 테마가
 * 링크와 일치하는지 검사합니다. 번들 JSON과의 대조는 테스트가 맡고, 이 검사는 코드 안의
 * 두 데이터(프리셋 ↔ 링크)가 어긋나지 않았는지를 런타임에서도 확인할 수 있게 합니다.
 */
export function validateStudioBg3dGenreScenePackBundleLinks(): readonly string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of STUDIO_BG3D_GENRE_SCENE_PACK_BUNDLE_LINKS) {
    if (seen.has(entry.presetId)) problems.push(`duplicate link for preset "${entry.presetId}"`);
    seen.add(entry.presetId);
    const preset = getStudioBg3dSceneCompositionPreset(entry.presetId);
    if (!preset) {
      problems.push(`link points at unknown preset "${entry.presetId}"`);
      continue;
    }
    if (preset.genreId !== entry.genreId) {
      problems.push(`genre mismatch for "${entry.presetId}": link=${entry.genreId} preset=${preset.genreId}`);
    }
    if (preset.bundleThemeId !== entry.bundleThemeId) {
      problems.push(
        `bundleThemeId mismatch for "${entry.presetId}": link=${entry.bundleThemeId} preset=${preset.bundleThemeId ?? "none"}`,
      );
    }
    if (entry.packs.length === 0) problems.push(`link "${entry.presetId}" has no bundle packs`);
    if (entry.totalPlaceable <= 0) problems.push(`link "${entry.presetId}" has no placeable assets`);
  }
  return Object.freeze(problems);
}
