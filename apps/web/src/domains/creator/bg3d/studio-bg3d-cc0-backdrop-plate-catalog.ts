// CC0 2K 환경 배경 플레이트 카탈로그 — apps/web/public/assets/studio/cc0-20260906/manifest.json 의
// background 39종(8K 8192x4096 Poly Haven HDRI 파노라마에서 90° 화각으로 직교 투영한 2048x1152 WebP + 썸네일)을
// BG3D 장르 씬팩(studio-bg3d-scene-composition-presets.ts) 및 배경 레퍼런스 선택기에 연결하는 순수 모듈.

import type { StudioBg3dHdriLightingPresetId } from "./studio-bg3d-hdri-lighting-presets";

export type StudioBg3dCc0BackdropCategory =
  | "background-interior"
  | "background-street"
  | "background-nature";

export interface StudioBg3dCc0BackdropCategoryInfo {
  readonly id: StudioBg3dCc0BackdropCategory;
  readonly labelKo: string;
  readonly labelEn: string;
}

export const STUDIO_BG3D_CC0_BACKDROP_CATEGORIES: readonly StudioBg3dCc0BackdropCategoryInfo[] =
  Object.freeze([
    { id: "background-interior", labelKo: "실내·건축", labelEn: "Interior" },
    { id: "background-street", labelKo: "거리·도시", labelEn: "Street & Urban" },
    { id: "background-nature", labelKo: "자연·풍경", labelEn: "Nature" },
  ]);

export interface StudioBg3dCc0BackdropPlateEntry {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly category: StudioBg3dCc0BackdropCategory;
  readonly sourcePanoramaId: string;
  readonly imageUrl: string;
  readonly previewUrl: string;
  readonly width: 2048;
  readonly height: 1152;
  readonly sourceDimensions: readonly [8192, 4096];
  readonly horizontalFovDegrees: 90;
  readonly recommendedLightingPresetId: StudioBg3dHdriLightingPresetId;
}

const CC0_ROOT = "/assets/studio/cc0-20260906/assets";

type RawBackdropSpec = readonly [
  id: string,
  labelKo: string,
  labelEn: string,
  category: StudioBg3dCc0BackdropCategory,
  sourcePanoramaId: string,
  recommendedLightingPresetId: StudioBg3dHdriLightingPresetId,
];

const RAW_BACKDROP_SPECS: readonly RawBackdropSpec[] = [
  ["polyhaven-background-hansaplatz", "유럽풍 건물과 도시 광장", "Hansaplatz", "background-street", "hansaplatz", "daylight"],
  ["polyhaven-background-urban-street-01", "주택가 골목 거리", "Urban Street 01", "background-street", "urban_street_01", "daylight"],
  ["polyhaven-background-urban-street-03", "도심 건물 사이 골목", "Urban Street 03", "background-street", "urban_street_03", "daylight"],
  ["polyhaven-background-crosswalk", "숲길 입구 도로와 횡단보도", "Crosswalk", "background-street", "crosswalk", "daylight"],
  ["polyhaven-background-modern-buildings-night", "야간 유리 건물 아트리움 입구", "Modern Buildings Night", "background-street", "modern_buildings_night", "night"],
  ["polyhaven-background-venetian-crossroads", "수로 도시 골목 교차로", "Venetian Crossroads", "background-street", "venetian_crossroads", "daylight"],
  ["polyhaven-background-courtyard-night", "야간 주택 차고문과 중정", "Courtyard Night", "background-street", "courtyard_night", "night"],
  ["polyhaven-background-decor-shop", "소품과 가구 인테리어 매장", "Decor Shop", "background-interior", "decor_shop", "studio"],
  ["polyhaven-background-machine-shop-02", "기계 정비 작업장", "Machine Shop 02", "background-interior", "machine_shop_02", "studio"],
  ["polyhaven-background-carpentry-shop-02", "목공 작업실", "Carpentry Shop 02", "background-interior", "carpentry_shop_02", "studio"],
  ["polyhaven-background-freight-station", "노을빛 옛 화물역 부지", "Freight Station", "background-street", "freight_station", "twilight"],
  ["polyhaven-background-dresden-station-night", "기차역 야간 플랫폼", "Dresden Station Night", "background-street", "dresden_station_night", "night"],
  ["polyhaven-background-subway-entrance", "지하철역 출입구", "Subway Entrance", "background-street", "subway_entrance", "daylight"],
  ["polyhaven-background-wooden-lounge", "원목 가구 라운지", "Wooden Lounge", "background-interior", "wooden_lounge", "studio"],
  ["polyhaven-background-ballroom", "클래식 연회장 무도회장", "Ballroom", "background-interior", "ballroom", "studio"],
  ["polyhaven-background-large-corridor", "아치 창과 실내 발코니 문", "Large Corridor", "background-interior", "large_corridor", "studio"],
  ["polyhaven-background-winter-lake-01", "눈 덮인 겨울 호수", "Winter Lake 01", "background-nature", "winter_lake_01", "daylight"],
  ["polyhaven-background-misty-pines", "안개 낀 소나무 숲", "Misty Pines", "background-nature", "misty_pines", "daylight"],
  ["polyhaven-background-mossy-forest", "이끼가 있는 울창한 숲", "Mossy Forest", "background-nature", "mossy_forest", "daylight"],
  ["polyhaven-background-river-walk-1", "강변 숲속 산책길", "River Walk 1", "background-nature", "river_walk_1", "daylight"],
  ["polyhaven-background-tiergarten", "가로수와 녹음이 있는 공원", "Tiergarten", "background-nature", "tiergarten", "daylight"],
  ["polyhaven-background-small-harbor-01", "작은 항구와 선착장", "Small Harbor 01", "background-street", "small_harbor_01", "daylight"],
  ["polyhaven-background-venice-sunset", "노을빛 바다와 수평선", "Venice Sunset", "background-street", "venice_sunset", "twilight"],
  ["polyhaven-background-leadenhall-market", "지붕 있는 시장 아케이드", "Leadenhall Market", "background-interior", "leadenhall_market", "studio"],
  ["polyhaven-background-derelict-overpass", "시골 고가도로 난간과 들판", "Derelict Overpass", "background-street", "derelict_overpass", "daylight"],
  ["polyhaven-background-rural-winter-roadside", "겨울 시골 길가", "Rural Winter Roadside", "background-nature", "rural_winter_roadside", "daylight"],
  ["polyhaven-background-royal-esplanade", "호텔 실내 로비", "Royal Esplanade", "background-interior", "royal_esplanade", "studio"],
  ["polyhaven-background-wide-street-01", "가로수가 있는 넓은 도심 거리", "Wide Street 01", "background-street", "wide_street_01", "daylight"],
  ["polyhaven-background-kiara-1-dawn", "새벽빛 바위 계곡 전망", "Kiara 1 Dawn", "background-nature", "kiara_1_dawn", "twilight"],
  ["polyhaven-background-wide-street-02", "햇빛과 나무 그림자가 있는 거리", "Wide Street 02", "background-street", "wide_street_02", "daylight"],
  ["polyhaven-background-urban-courtyard-02", "주거 건물 중정과 정원 입구", "Urban Courtyard 02", "background-street", "urban_courtyard_02", "daylight"],
  ["polyhaven-background-rooftop-night", "황혼 옥상 주차장과 조명", "Rooftop Night", "background-street", "rooftop_night", "night"],
  ["polyhaven-background-portland-landing-pad", "공사 중인 건물과 옥상", "Portland Landing Pad", "background-street", "portland_landing_pad", "daylight"],
  ["polyhaven-background-rooitou-park", "햇살이 비치는 잔디 공원", "Rooitou Park", "background-nature", "rooitou_park", "daylight"],
  ["polyhaven-background-autumn-park", "가을 나무와 잔디 공터", "Autumn Park", "background-nature", "autumn_park", "twilight"],
  ["polyhaven-background-the-sky-is-on-fire", "노을 바다와 해안 산책로", "The Sky Is On Fire", "background-nature", "the_sky_is_on_fire", "twilight"],
  ["polyhaven-background-cayley-interior", "발코니 창문이 있는 실내", "Cayley Interior", "background-interior", "cayley_interior", "studio"],
  ["polyhaven-background-empty-warehouse-01", "넓은 빈 창고 실내", "Empty Warehouse 01", "background-interior", "empty_warehouse_01", "studio"],
  ["polyhaven-background-abandoned-slipway", "물가로 이어지는 낡은 선착장", "Abandoned Slipway", "background-nature", "abandoned_slipway", "daylight"],
];

export const STUDIO_BG3D_CC0_BACKDROP_PLATE_CATALOG: readonly StudioBg3dCc0BackdropPlateEntry[] =
  Object.freeze(
    RAW_BACKDROP_SPECS.map(([id, labelKo, labelEn, category, sourcePanoramaId, recommendedLightingPresetId]) =>
      Object.freeze({
        id,
        labelKo,
        labelEn,
        category,
        sourcePanoramaId,
        imageUrl: `${CC0_ROOT}/${id}/background.webp`,
        previewUrl: `${CC0_ROOT}/${id}/thumbnail.webp`,
        width: 2048 as const,
        height: 1152 as const,
        sourceDimensions: Object.freeze([8192, 4096] as const),
        horizontalFovDegrees: 90 as const,
        recommendedLightingPresetId,
      }),
    ),
  );

const BACKDROP_BY_ID = new Map(
  STUDIO_BG3D_CC0_BACKDROP_PLATE_CATALOG.map((entry) => [entry.id, entry] as const),
);

export function findStudioBg3dCc0BackdropPlate(
  id: string,
): StudioBg3dCc0BackdropPlateEntry | undefined {
  return BACKDROP_BY_ID.get(id);
}

export function listStudioBg3dCc0BackdropPlatesByCategory(
  category: StudioBg3dCc0BackdropCategory | null,
): readonly StudioBg3dCc0BackdropPlateEntry[] {
  if (category === null) return STUDIO_BG3D_CC0_BACKDROP_PLATE_CATALOG;
  return STUDIO_BG3D_CC0_BACKDROP_PLATE_CATALOG.filter((entry) => entry.category === category);
}

/** 장르 씬팩(16종)별 추천 2K CC0 환경 배경 플레이트 매핑. */
const SCENE_PRESET_BACKDROP_IDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "romance-cafe-two-shot": ["polyhaven-background-wooden-lounge", "polyhaven-background-decor-shop"],
  "romance-rooftop-confession": ["polyhaven-background-venice-sunset", "polyhaven-background-the-sky-is-on-fire"],
  "action-alley-chase": ["polyhaven-background-urban-street-03", "polyhaven-background-courtyard-night"],
  "action-rooftop-showdown": ["polyhaven-background-portland-landing-pad", "polyhaven-background-rooftop-night"],
  "thriller-corridor-dutch": ["polyhaven-background-large-corridor", "polyhaven-background-empty-warehouse-01"],
  "thriller-moonlit-close-up": ["polyhaven-background-cayley-interior", "polyhaven-background-dresden-station-night"],
  "daily-classroom-morning": ["polyhaven-background-wide-street-01", "polyhaven-background-crosswalk"],
  "daily-studio-portrait": ["polyhaven-background-royal-esplanade", "polyhaven-background-ballroom"],
  "fantasy-forest-shrine": ["polyhaven-background-mossy-forest", "polyhaven-background-misty-pines"],
  "fantasy-old-town-arrival": ["polyhaven-background-hansaplatz", "polyhaven-background-venetian-crossroads"],
  "fantasy-swamp-crossing": ["polyhaven-background-river-walk-1", "polyhaven-background-abandoned-slipway"],
  "scifi-arena-showdown": ["polyhaven-background-modern-buildings-night", "polyhaven-background-machine-shop-02"],
  "scifi-planet-survey": ["polyhaven-background-kiara-1-dawn", "polyhaven-background-winter-lake-01"],
  "scifi-station-portrait": ["polyhaven-background-carpentry-shop-02", "polyhaven-background-leadenhall-market"],
  "thriller-graveyard-vigil": ["polyhaven-background-rural-winter-roadside", "polyhaven-background-freight-station"],
  "daily-subway-commute": ["polyhaven-background-subway-entrance", "polyhaven-background-urban-street-01"],
});

export function getStudioBg3dScenePresetBackdropPlates(
  scenePresetId: string,
): readonly StudioBg3dCc0BackdropPlateEntry[] {
  const ids = SCENE_PRESET_BACKDROP_IDS[scenePresetId] ?? [];
  return ids
    .map((id) => BACKDROP_BY_ID.get(id))
    .filter((entry): entry is StudioBg3dCc0BackdropPlateEntry => entry !== undefined);
}
