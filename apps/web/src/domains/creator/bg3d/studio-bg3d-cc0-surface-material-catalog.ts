// CC0 2K PBR 표면 재질 카탈로그 — apps/web/public/assets/studio/cc0-20260906/manifest.json 의
// surface-texture 82종(Poly Haven 80 + ambientCG 2) 및 320개 2K PBR 맵(rough/nor_gl/ao/disp)을
// BG3D 도형·커스텀 GLB 재질 오버라이드 및 룸 빌더 표면 세트로 연결하는 순수 모듈.

import type { StudioBg3dMaterialOverride } from "./studio-bg3d-scene-document-types";

export type StudioBg3dCc0SurfaceMaterialCategory =
  | "wood"
  | "brick-stone"
  | "tile-pavement"
  | "plaster-concrete"
  | "metal-fabric"
  | "nature-ground";

export interface StudioBg3dCc0SurfaceCategoryInfo {
  readonly id: StudioBg3dCc0SurfaceMaterialCategory;
  readonly labelKo: string;
  readonly labelEn: string;
}

export const STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATEGORIES: readonly StudioBg3dCc0SurfaceCategoryInfo[] =
  Object.freeze([
    { id: "wood", labelKo: "목재·마루", labelEn: "Wood & Flooring" },
    { id: "brick-stone", labelKo: "벽돌·석재", labelEn: "Brick & Stone" },
    { id: "tile-pavement", labelKo: "타일·보도", labelEn: "Tile & Pavement" },
    { id: "plaster-concrete", labelKo: "회벽·콘크리트", labelEn: "Plaster & Concrete" },
    { id: "metal-fabric", labelKo: "금속·패브릭", labelEn: "Metal & Fabric" },
    { id: "nature-ground", labelKo: "자연·지면", labelEn: "Nature & Ground" },
  ]);

export interface StudioBg3dCc0SurfacePbrMapSet {
  readonly roughnessUrl: string;
  readonly normalGlUrl: string;
  readonly aoUrl: string;
  readonly displacementUrl: string;
}

export interface StudioBg3dCc0SurfaceMaterialEntry {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly category: StudioBg3dCc0SurfaceMaterialCategory;
  readonly provider: "Poly Haven" | "ambientCG";
  readonly baseColorUrl: string;
  readonly previewUrl: string;
  readonly pbrMaps: StudioBg3dCc0SurfacePbrMapSet | null;
  readonly roughness: number;
  readonly metalness: number;
  readonly tintHex: string;
  readonly surfacePresetId: string;
  readonly defaultRepeat: readonly [number, number];
}

const CC0_ROOT = "/assets/studio/cc0-20260906";

type RawSurfaceSpec = readonly [
  id: string,
  labelKo: string,
  labelEn: string,
  category: StudioBg3dCc0SurfaceMaterialCategory,
  provider: "Poly Haven" | "ambientCG",
  relPath: string,
  hasThumbnail: boolean,
  pbrFiles: readonly [string, string, string, string] | null,
  roughness: number,
  metalness: number,
  tintHex: string,
  surfacePresetId: string,
  repeat: readonly [number, number],
];

const RAW_SURFACE_SPECS: readonly RawSurfaceSpec[] = [
  ["polyhaven-asphalt-pit-lane", "아스팔트 도로", "Asphalt Pit Lane", "tile-pavement", "Poly Haven", "assets/polyhaven-asphalt-pit-lane/asphalt_pit_lane.webp", true, ["asphalt_pit_lane_rough_2k.jpg","asphalt_pit_lane_nor_gl_2k.jpg","asphalt_pit_lane_ao_2k.jpg","asphalt_pit_lane_disp_2k.jpg"], 0.84, 0.02, "#6e7075", "rubber", [3, 3]],
  ["polyhaven-pavement-02", "보도 포장", "Pavement 02", "tile-pavement", "Poly Haven", "assets/polyhaven-pavement-02/pavement_02.webp", true, ["pavement_02_rough_2k.jpg","pavement_02_nor_gl_2k.jpg","pavement_02_ao_2k.jpg","pavement_02_disp_2k.jpg"], 0.84, 0.02, "#6e7075", "rubber", [3, 3]],
  ["polyhaven-cobblestone-floor-04", "돌 포장 거리", "Cobblestone Floor 04", "tile-pavement", "Poly Haven", "assets/polyhaven-cobblestone-floor-04/cobblestone_floor_04.webp", true, ["cobblestone_floor_04_rough_2k.jpg","cobblestone_floor_04_nor_gl_2k.jpg","cobblestone_floor_04_ao_2k.jpg","cobblestone_floor_04_disp_2k.jpg"], 0.84, 0.02, "#6e7075", "rubber", [3, 3]],
  ["polyhaven-roof-09", "지붕", "Roof 09", "tile-pavement", "Poly Haven", "assets/polyhaven-roof-09/roof_09.webp", true, ["roof_09_rough_2k.jpg","roof_09_nor_gl_2k.jpg","roof_09_ao_2k.jpg","roof_09_disp_2k.jpg"], 0.84, 0.02, "#6e7075", "rubber", [3, 3]],
  ["polyhaven-gravel-embedded-concrete", "콘크리트", "Gravel Embedded Concrete", "plaster-concrete", "Poly Haven", "assets/polyhaven-gravel-embedded-concrete/gravel_embedded_concrete.webp", true, ["gravel_embedded_concrete_rough_2k.jpg","gravel_embedded_concrete_nor_gl_2k.jpg","gravel_embedded_concrete_ao_2k.jpg","gravel_embedded_concrete_disp_2k.jpg"], 0.85, 0.02, "#8f9296", "matte-plastic", [2, 2]],
  ["polyhaven-brick-wall-001", "벽돌", "벽돌 벽", "brick-stone", "Poly Haven", "assets/polyhaven-brick-wall-001/brick_wall_001.webp", true, ["brick_wall_001_rough_2k.jpg","brick_wall_001_nor_gl_2k.jpg","brick_wall_001_ao_2k.jpg","brick_wall_001_displacement_2k.jpg"], 0.86, 0, "#9e5243", "matte-plastic", [3, 3]],
  ["polyhaven-white-rough-plaster", "회벽", "실내 회벽", "plaster-concrete", "Poly Haven", "assets/polyhaven-white-rough-plaster/white_rough_plaster.webp", true, ["white_rough_plaster_rough_2k.jpg","white_rough_plaster_nor_gl_2k.jpg","white_rough_plaster_ao_2k.jpg","white_rough_plaster_disp_2k.jpg"], 0.78, 0, "#e8e2d5", "matte-plastic", [2, 2]],
  ["polyhaven-marble-cliff-03", "갈색 대리암 절벽 암석 표면", "Marble Cliff 03", "brick-stone", "Poly Haven", "assets/polyhaven-marble-cliff-03/marble_cliff_03.webp", true, ["marble_cliff_03_rough_2k.jpg","marble_cliff_03_nor_gl_2k.jpg","marble_cliff_03_ao_2k.jpg","marble_cliff_03_disp_2k.jpg"], 0.82, 0.02, "#9c9388", "matte-plastic", [2, 2]],
  ["polyhaven-stone-tiles-02", "바닥 타일", "Stone Tiles 02", "tile-pavement", "Poly Haven", "assets/polyhaven-stone-tiles-02/stone_tiles_02.webp", true, ["stone_tiles_02_rough_2k.jpg","stone_tiles_02_nor_gl_2k.jpg","stone_tiles_02_ao_2k.jpg","stone_tiles_02_disp_2k.jpg"], 0.84, 0.02, "#6e7075", "rubber", [3, 3]],
  ["polyhaven-rough-wood", "나무 목재", "원목", "wood", "Poly Haven", "assets/polyhaven-rough-wood/rough_wood.webp", true, ["rough_wood_rough_2k.jpg","rough_wood_nor_gl_2k.jpg","rough_wood_ao_2k.jpg","rough_wood_disp_2k.jpg"], 0.72, 0, "#8d623f", "matte-plastic", [2, 2]],
  ["polyhaven-blue-metal-plate", "금속", "금속", "metal-fabric", "Poly Haven", "assets/polyhaven-blue-metal-plate/blue_metal_plate.webp", true, ["blue_metal_plate_rough_2k.jpg","blue_metal_plate_nor_gl_2k.jpg","blue_metal_plate_ao_2k.jpg","blue_metal_plate_disp_2k.jpg"], 0.35, 0.88, "#4f6d8a", "brushed-metal", [2, 2]],
  ["polyhaven-gravel-concrete-03", "자갈이 박힌 콘크리트 표면", "Gravel Concrete 03", "plaster-concrete", "Poly Haven", "assets/polyhaven-gravel-concrete-03/gravel_concrete_03.webp", true, ["gravel_concrete_03_rough_2k.jpg","gravel_concrete_03_nor_gl_2k.jpg","gravel_concrete_03_ao_2k.jpg","gravel_concrete_03_disp_2k.jpg"], 0.85, 0.02, "#8f9296", "matte-plastic", [2, 2]],
  ["polyhaven-snow-02", "눈", "Snow 02", "nature-ground", "Poly Haven", "assets/polyhaven-snow-02/snow_02.webp", true, ["snow_02_rough_2k.jpg","snow_02_nor_gl_2k.jpg","snow_02_ao_2k.jpg","snow_02_disp_2k.jpg"], 0.65, 0.02, "#f0f4f8", "matte-plastic", [3, 3]],
  ["polyhaven-red-laterite-soil-stones", "흙 바닥", "Red Laterite Soil Stones", "nature-ground", "Poly Haven", "assets/polyhaven-red-laterite-soil-stones/red_laterite_soil_stones.webp", true, ["red_laterite_soil_stones_rough_2k.jpg","red_laterite_soil_stones_nor_gl_2k.jpg","red_laterite_soil_stones_ao_2k.jpg","red_laterite_soil_stones_disp_2k.jpg"], 0.92, 0, "#5d6b4d", "rubber", [3, 3]],
  ["polyhaven-marble-tiles", "빈티지 무늬 대리석 타일", "Marble Tiles", "tile-pavement", "Poly Haven", "assets/polyhaven-marble-tiles/marble_tiles.webp", true, ["marble_tiles_rough_2k.jpg","marble_tiles_nor_gl_2k.jpg","marble_tiles_ao_2k.jpg","marble_tiles_disp_2k.jpg"], 0.18, 0.05, "#e6e4df", "ceramic", [2, 2]],
  ["polyhaven-marble-cliff-05", "자연 대리석 절벽 표면", "Marble Cliff 05", "brick-stone", "Poly Haven", "assets/polyhaven-marble-cliff-05/marble_cliff_05.webp", true, ["marble_cliff_05_rough_2k.jpg","marble_cliff_05_nor_gl_2k.jpg","marble_cliff_05_ao_2k.jpg","marble_cliff_05_disp_2k.jpg"], 0.82, 0.02, "#9c9388", "matte-plastic", [2, 2]],
  ["polyhaven-wood-floor", "원목 마루 바닥", "Wood Floor", "wood", "Poly Haven", "assets/polyhaven-wood-floor/wood_floor.webp", true, ["wood_floor_rough_2k.jpg","wood_floor_nor_gl_2k.jpg","wood_floor_ao_2k.jpg","wood_floor_disp_2k.jpg"], 0.72, 0, "#8d623f", "matte-plastic", [2, 2]],
  ["polyhaven-wood-cabinet-worn-long", "마모된 긴 원목 판재", "Wood Cabinet Worn Long", "wood", "Poly Haven", "assets/polyhaven-wood-cabinet-worn-long/wood_cabinet_worn_long.webp", true, ["wood_cabinet_worn_long_rough_2k.jpg","wood_cabinet_worn_long_nor_gl_2k.jpg","wood_cabinet_worn_long_ao_2k.jpg","wood_cabinet_worn_long_disp_2k.jpg"], 0.72, 0, "#8d623f", "matte-plastic", [2, 2]],
  ["polyhaven-concrete-wall-003", "풍화된 콘크리트 벽", "Concrete Wall 003", "plaster-concrete", "Poly Haven", "assets/polyhaven-concrete-wall-003/concrete_wall_003.webp", true, ["concrete_wall_003_rough_2k.jpg","concrete_wall_003_nor_gl_2k.jpg","concrete_wall_003_ao_2k.jpg","concrete_wall_003_disp_2k.jpg"], 0.85, 0.02, "#8f9296", "matte-plastic", [2, 2]],
  ["polyhaven-wood-peeling-paint-weathered", "페인트가 벗겨진 목재", "Wood Peeling Paint Weathered", "wood", "Poly Haven", "assets/polyhaven-wood-peeling-paint-weathered/wood_peeling_paint_weathered.webp", true, ["wood_peeling_paint_weathered_rough_2k.jpg","wood_peeling_paint_weathered_nor_gl_2k.jpg","wood_peeling_paint_weathered_ao_2k.jpg","wood_peeling_paint_weathered_disp_2k.jpg"], 0.72, 0, "#8d623f", "matte-plastic", [2, 2]],
  ["polyhaven-plaster-grey-04", "거친 회색 회벽", "Plaster Grey 04", "plaster-concrete", "Poly Haven", "assets/polyhaven-plaster-grey-04/plaster_grey_04.webp", true, ["plaster_grey_04_rough_2k.jpg","plaster_grey_04_nor_gl_2k.jpg","plaster_grey_04_ao_2k.jpg","plaster_grey_04_disp_2k.jpg"], 0.85, 0.02, "#8f9296", "matte-plastic", [2, 2]],
  ["polyhaven-plastered-wall", "고운 미장 회벽", "Plastered Wall", "plaster-concrete", "Poly Haven", "assets/polyhaven-plastered-wall/plastered_wall.webp", true, ["plastered_wall_rough_2k.jpg","plastered_wall_nor_gl_2k.jpg","plastered_wall_ao_2k.jpg","plastered_wall_disp_2k.jpg"], 0.85, 0.02, "#8f9296", "matte-plastic", [2, 2]],
  ["polyhaven-denim-fabric", "스티치가 있는 데님 청 원단", "Denim Fabric", "metal-fabric", "Poly Haven", "assets/polyhaven-denim-fabric/denim_fabric.webp", true, ["denim_fabric_rough_2k.jpg","denim_fabric_nor_gl_2k.jpg","denim_fabric_ao_2k.jpg","denim_fabric_disp_2k.jpg"], 0.88, 0, "#3b526b", "rubber", [3, 3]],
  ["polyhaven-factory-wall", "녹색 산업용 철판 벽", "Factory Wall", "metal-fabric", "Poly Haven", "assets/polyhaven-factory-wall/factory_wall.webp", true, ["factory_wall_rough_2k.jpg","factory_wall_nor_gl_2k.jpg","factory_wall_ao_2k.jpg","factory_wall_disp_2k.jpg"], 0.88, 0, "#9c8f82", "rubber", [3, 3]],
  ["polyhaven-corrugated-iron", "은색 골판 철판", "Corrugated Iron", "metal-fabric", "Poly Haven", "assets/polyhaven-corrugated-iron/corrugated_iron.webp", true, ["corrugated_iron_rough_2k.jpg","corrugated_iron_nor_gl_2k.jpg","corrugated_iron_ao_2k.jpg","corrugated_iron_disp_2k.jpg"], 0.35, 0.88, "#8a796d", "brushed-metal", [2, 2]],
  ["polyhaven-large-floor-tiles-02", "대형 석재 바닥 타일", "Large Floor Tiles 02", "brick-stone", "Poly Haven", "assets/polyhaven-large-floor-tiles-02/large_floor_tiles_02.webp", true, ["large_floor_tiles_02_rough_2k.jpg","large_floor_tiles_02_nor_gl_2k.jpg","large_floor_tiles_02_ao_2k.jpg","large_floor_tiles_02_disp_2k.jpg"], 0.82, 0.02, "#9c9388", "matte-plastic", [2, 2]],
  ["polyhaven-large-square-pattern-01", "광장 사각 포장 블록", "Large Square Pattern 01", "brick-stone", "Poly Haven", "assets/polyhaven-large-square-pattern-01/large_square_pattern_01.webp", true, ["large_square_pattern_01_rough_2k.jpg","large_square_pattern_01_nor_gl_2k.jpg","large_square_pattern_01_ao_2k.jpg","large_square_pattern_01_disp_2k.jpg"], 0.82, 0.02, "#9c9388", "matte-plastic", [2, 2]],
  ["polyhaven-grassy-cobblestone", "풀이 자란 조약돌 보도", "Grassy Cobblestone", "tile-pavement", "Poly Haven", "assets/polyhaven-grassy-cobblestone/grassy_cobblestone.webp", true, ["grassy_cobblestone_rough_2k.jpg","grassy_cobblestone_nor_gl_2k.jpg","grassy_cobblestone_ao_2k.jpg","grassy_cobblestone_disp_2k.jpg"], 0.84, 0.02, "#6e7075", "rubber", [3, 3]],
  ["polyhaven-forest-leaves-04", "숲 낙엽과 잔가지 바닥", "Forest Leaves 04", "nature-ground", "Poly Haven", "assets/polyhaven-forest-leaves-04/forest_leaves_04.webp", true, ["forest_leaves_04_rough_2k.jpg","forest_leaves_04_nor_gl_2k.jpg","forest_leaves_04_ao_2k.jpg","forest_leaves_04_disp_2k.jpg"], 0.92, 0, "#5d6b4d", "rubber", [3, 3]],
  ["polyhaven-dirt-floor", "야외 흙 바닥", "Dirt Floor", "nature-ground", "Poly Haven", "assets/polyhaven-dirt-floor/dirt_floor.webp", true, ["dirt_floor_rough_2k.jpg","dirt_floor_nor_gl_2k.jpg","dirt_floor_ao_2k.jpg","dirt_floor_disp_2k.jpg"], 0.92, 0, "#5d6b4d", "rubber", [3, 3]],
  ["polyhaven-sand-01", "고운 모래 지면", "Sand 01", "nature-ground", "Poly Haven", "assets/polyhaven-sand-01/sand_01.webp", true, ["sand_01_rough_2k.jpg","sand_01_nor_gl_2k.jpg","sand_01_ao_2k.jpg","sand_01_disp_2k.jpg"], 0.88, 0, "#d6be96", "matte-plastic", [3, 3]],
  ["polyhaven-sandstone-blocks-05", "사암 블록 돌담", "Sandstone Blocks 05", "brick-stone", "Poly Haven", "assets/polyhaven-sandstone-blocks-05/sandstone_blocks_05.webp", true, ["sandstone_blocks_05_rough_2k.jpg","sandstone_blocks_05_nor_gl_2k.jpg","sandstone_blocks_05_ao_2k.jpg","sandstone_blocks_05_disp_2k.jpg"], 0.82, 0.02, "#9c9388", "matte-plastic", [2, 2]],
  ["polyhaven-floor-tiles-02", "밝은 석재 바닥 타일", "Floor Tiles 02", "tile-pavement", "Poly Haven", "assets/polyhaven-floor-tiles-02/floor_tiles_02.webp", false, ["floor_tiles_02_rough_2k.jpg","floor_tiles_02_nor_gl_2k.jpg","floor_tiles_02_ao_2k.jpg","floor_tiles_02_disp_2k.jpg"], 0.28, 0.04, "#d4cfc7", "ceramic", [3, 3]],
  ["polyhaven-floor-tiles-04", "따뜻한 색감의 바닥 타일", "Floor Tiles 04", "tile-pavement", "Poly Haven", "assets/polyhaven-floor-tiles-04/floor_tiles_04.webp", false, ["floor_tiles_04_rough_2k.jpg","floor_tiles_04_nor_gl_2k.jpg","floor_tiles_04_ao_2k.jpg","floor_tiles_04_disp_2k.jpg"], 0.28, 0.04, "#d4cfc7", "ceramic", [3, 3]],
  ["polyhaven-oak-veneer-01", "오크 무늬목 재질", "Oak Veneer 01", "wood", "Poly Haven", "assets/polyhaven-oak-veneer-01/oak_veneer_01.webp", false, ["oak_veneer_01_rough_2k.jpg","oak_veneer_01_nor_gl_2k.jpg","oak_veneer_01_ao_2k.jpg","oak_veneer_01_disp_2k.jpg"], 0.38, 0.02, "#b88456", "ceramic", [2, 2]],
  ["polyhaven-wood-table-worn", "사용감 있는 목재 상판", "Wood Table Worn", "wood", "Poly Haven", "assets/polyhaven-wood-table-worn/wood_table_worn.webp", false, ["wood_table_worn_rough_2k.jpg","wood_table_worn_nor_gl_2k.jpg","wood_table_worn_ao_2k.jpg","wood_table_worn_disp_2k.jpg"], 0.72, 0, "#8d623f", "matte-plastic", [2, 2]],
  ["polyhaven-weathered-brown-planks", "풍화된 갈색 나무 널판", "Weathered Brown Planks", "wood", "Poly Haven", "assets/polyhaven-weathered-brown-planks/weathered_brown_planks.webp", false, ["weathered_brown_planks_rough_2k.jpg","weathered_brown_planks_nor_gl_2k.jpg","weathered_brown_planks_ao_2k.jpg","weathered_brown_planks_disp_2k.jpg"], 0.72, 0, "#8d623f", "matte-plastic", [2, 2]],
  ["polyhaven-brown-planks-05", "밝은 페인트 나무 널판", "Brown Planks 05", "wood", "Poly Haven", "assets/polyhaven-brown-planks-05/brown_planks_05.webp", false, ["brown_planks_05_rough_2k.jpg","brown_planks_05_nor_gl_2k.jpg","brown_planks_05_ao_2k.jpg","brown_planks_05_disp_2k.jpg"], 0.72, 0, "#8d623f", "matte-plastic", [2, 2]],
  ["polyhaven-cracked-concrete-wall", "갈라진 콘크리트 벽", "Cracked Concrete Wall", "plaster-concrete", "Poly Haven", "assets/polyhaven-cracked-concrete-wall/cracked_concrete_wall.webp", false, ["cracked_concrete_wall_rough_2k.jpg","cracked_concrete_wall_nor_gl_2k.jpg","cracked_concrete_wall_ao_2k.jpg","cracked_concrete_wall_disp_2k.jpg"], 0.85, 0.02, "#8f9296", "matte-plastic", [2, 2]],
  ["polyhaven-grey-plaster", "회색 회벽", "Grey Plaster", "plaster-concrete", "Poly Haven", "assets/polyhaven-grey-plaster/grey_plaster.webp", false, ["grey_plaster_rough_2k.jpg","grey_plaster_nor_gl_2k.jpg","grey_plaster_ao_2k.jpg","grey_plaster_disp_2k.jpg"], 0.85, 0.02, "#8f9296", "matte-plastic", [2, 2]],
  ["polyhaven-fabric-leather-02", "황갈색 가죽 재질", "Fabric Leather 02", "metal-fabric", "Poly Haven", "assets/polyhaven-fabric-leather-02/fabric_leather_02.webp", false, ["fabric_leather_02_rough_2k.jpg","fabric_leather_02_nor_gl_2k.jpg","fabric_leather_02_ao_2k.jpg","fabric_leather_02_disp_2k.jpg"], 0.48, 0.04, "#6e4732", "gloss-plastic", [2, 2]],
  ["polyhaven-rusty-metal-02", "옅은 녹이 슨 철판", "Rusty Metal 02", "metal-fabric", "Poly Haven", "assets/polyhaven-rusty-metal-02/rusty_metal_02.webp", false, ["rusty_metal_02_rough_2k.jpg","rusty_metal_02_nor_gl_2k.jpg","rusty_metal_02_ao_2k.jpg","rusty_metal_02_disp_2k.jpg"], 0.62, 0.65, "#8a796d", "brushed-metal", [2, 2]],
  ["polyhaven-rusty-metal-04", "진한 녹이 슨 철판", "Rusty Metal 04", "metal-fabric", "Poly Haven", "assets/polyhaven-rusty-metal-04/rusty_metal_04.webp", false, ["rusty_metal_04_rough_2k.jpg","rusty_metal_04_nor_gl_2k.jpg","rusty_metal_04_ao_2k.jpg","rusty_metal_04_disp_2k.jpg"], 0.62, 0.65, "#8a796d", "brushed-metal", [2, 2]],
  ["polyhaven-brick-4", "붉은 줄눈 벽돌", "Brick 4", "brick-stone", "Poly Haven", "assets/polyhaven-brick-4/brick_4.webp", false, ["brick_4_rough_2k.jpg","brick_4_nor_gl_2k.jpg","brick_4_ao_2k.jpg","brick_4_disp_2k.jpg"], 0.86, 0, "#9e5243", "matte-plastic", [3, 3]],
  ["polyhaven-castle-brick-02-red", "거친 적벽돌 벽", "Castle Brick 02 Red", "brick-stone", "Poly Haven", "assets/polyhaven-castle-brick-02-red/castle_brick_02_red.webp", false, ["castle_brick_02_red_rough_2k.jpg","castle_brick_02_red_nor_gl_2k.jpg","castle_brick_02_red_ao_2k.jpg","castle_brick_02_red_disp_2k.jpg"], 0.86, 0, "#9e5243", "matte-plastic", [3, 3]],
  ["polyhaven-grass-path-2", "흙이 섞인 잔디 길", "Grass Path 2", "nature-ground", "Poly Haven", "assets/polyhaven-grass-path-2/grass_path_2.webp", false, ["grass_path_2_rough_2k.jpg","grass_path_2_nor_gl_2k.jpg","grass_path_2_ao_2k.jpg","grass_path_2_disp_2k.jpg"], 0.92, 0, "#5d6b4d", "rubber", [3, 3]],
  ["polyhaven-forest-ground-04", "낙엽이 쌓인 숲 바닥", "Forest Ground 04", "nature-ground", "Poly Haven", "assets/polyhaven-forest-ground-04/forest_ground_04.webp", false, ["forest_ground_04_rough_2k.jpg","forest_ground_04_nor_gl_2k.jpg","forest_ground_04_ao_2k.jpg","forest_ground_04_disp_2k.jpg"], 0.92, 0, "#5d6b4d", "rubber", [3, 3]],
  ["polyhaven-forest-leaves-02", "초록 낙엽과 이끼 숲 바닥", "Forest Leaves 02", "nature-ground", "Poly Haven", "assets/polyhaven-forest-leaves-02/forest_leaves_02.webp", false, ["forest_leaves_02_rough_2k.jpg","forest_leaves_02_nor_gl_2k.jpg","forest_leaves_02_ao_2k.jpg","forest_leaves_02_disp_2k.jpg"], 0.92, 0, "#5d6b4d", "rubber", [3, 3]],
  ["polyhaven-aerial-beach-01", "잔물결이 있는 모래 표면", "Aerial Beach 01", "nature-ground", "Poly Haven", "assets/polyhaven-aerial-beach-01/aerial_beach_01.webp", false, ["aerial_beach_01_rough_2k.jpg","aerial_beach_01_nor_gl_2k.jpg","aerial_beach_01_rough_ao_2k.jpg","aerial_beach_01_disp_2k.jpg"], 0.88, 0, "#d6be96", "matte-plastic", [3, 3]],
  ["polyhaven-sandstone-cracks", "갈라진 사암 표면", "Sandstone Cracks", "nature-ground", "Poly Haven", "assets/polyhaven-sandstone-cracks/sandstone_cracks.webp", false, ["sandstone_cracks_rough_2k.jpg","sandstone_cracks_nor_gl_2k.jpg","sandstone_cracks_ao_2k.jpg","sandstone_cracks_disp_2k.jpg"], 0.88, 0, "#d6be96", "matte-plastic", [3, 3]],
  ["ambientcg-wood095-wood095-2k-jpg-color", "Wood095 2K-JPG Color", "Wood095 2K-JPG Color", "wood", "ambientCG", "assets/ambientcg-wood095/wood095-2k-jpg-color.webp", false, null, 0.72, 0, "#8d623f", "matte-plastic", [2, 2]],
  ["ambientcg-fabric066-fabric066-2k-jpg-color", "Fabric066 2K-JPG Color", "Fabric066 2K-JPG Color", "metal-fabric", "ambientCG", "assets/ambientcg-fabric066/fabric066-2k-jpg-color.webp", false, null, 0.88, 0, "#9c8f82", "rubber", [3, 3]],
  ["polyhaven-plywood", "Plywood", "목재", "wood", "Poly Haven", "assets/polyhaven-plywood/plywood.webp", false, ["plywood_rough_2k.png","plywood_nor_gl_2k.jpg","plywood_ao_2k.png","plywood_disp_2k.jpg"], 0.72, 0, "#8d623f", "matte-plastic", [2, 2]],
  ["polyhaven-laminate-floor-02", "Laminate Floor 02", "목재", "wood", "Poly Haven", "assets/polyhaven-laminate-floor-02/laminate_floor_02.webp", false, ["laminate_floor_02_rough_2k.jpg","laminate_floor_02_nor_gl_2k.jpg","laminate_floor_02_ao_2k.jpg","laminate_floor_02_disp_2k.jpg"], 0.38, 0.02, "#b88456", "ceramic", [2, 2]],
  ["polyhaven-wood-table-001", "Wood Table 001", "목재", "wood", "Poly Haven", "assets/polyhaven-wood-table-001/wood_table_001.webp", false, ["wood_table_001_rough_2k.jpg","wood_table_001_nor_gl_2k.jpg","wood_table_001_ao_2k.jpg","wood_table_001_disp_2k.jpg"], 0.38, 0.02, "#b88456", "ceramic", [2, 2]],
  ["polyhaven-denmin-fabric-02", "Denim Fabric 02", "직물", "metal-fabric", "Poly Haven", "assets/polyhaven-denmin-fabric-02/denmin_fabric_02.webp", false, ["denmin_fabric_02_rough_2k.png","denmin_fabric_02_nor_gl_2k.jpg","denmin_fabric_02_ao_2k.png","denmin_fabric_02_disp_2k.jpg"], 0.88, 0, "#3b526b", "rubber", [3, 3]],
  ["polyhaven-red-brick", "Red Brick", "벽돌", "brick-stone", "Poly Haven", "assets/polyhaven-red-brick/red_brick.webp", false, ["red_brick_rough_2k.jpg","red_brick_nor_gl_2k.jpg","red_brick_ao_2k.jpg","red_brick_disp_2k.jpg"], 0.86, 0, "#9e5243", "matte-plastic", [3, 3]],
  ["polyhaven-red-brick-03", "Red Brick 03", "벽돌", "brick-stone", "Poly Haven", "assets/polyhaven-red-brick-03/red_brick_03.webp", false, ["red_brick_03_rough_2k.jpg","red_brick_03_nor_gl_2k.jpg","red_brick_03_ao_2k.jpg","red_brick_03_disp_2k.jpg"], 0.86, 0, "#9e5243", "matte-plastic", [3, 3]],
  ["polyhaven-medieval-blocks-03", "Medieval Blocks 03", "벽돌", "brick-stone", "Poly Haven", "assets/polyhaven-medieval-blocks-03/medieval_blocks_03.webp", false, ["medieval_blocks_03_rough_2k.jpg","medieval_blocks_03_nor_gl_2k.jpg","medieval_blocks_03_ao_2k.jpg","medieval_blocks_03_disp_2k.png"], 0.82, 0.02, "#9c9388", "matte-plastic", [2, 2]],
  ["polyhaven-metal-plate", "Metal Plate", "금속", "metal-fabric", "Poly Haven", "assets/polyhaven-metal-plate/metal_plate.webp", false, ["metal_plate_rough_2k.jpg","metal_plate_nor_gl_2k.jpg","metal_plate_ao_2k.jpg","metal_plate_disp_2k.jpg"], 0.35, 0.88, "#8a796d", "brushed-metal", [2, 2]],
  ["polyhaven-green-metal-rust", "Green Metal Rust", "금속", "metal-fabric", "Poly Haven", "assets/polyhaven-green-metal-rust/green_metal_rust.webp", false, ["green_metal_rust_rough_2k.jpg","green_metal_rust_nor_gl_2k.jpg","green_metal_rust_ao_2k.jpg","green_metal_rust_disp_2k.jpg"], 0.62, 0.65, "#526e58", "brushed-metal", [2, 2]],
  ["polyhaven-rust-coarse-01", "Rust Coarse 01", "금속", "metal-fabric", "Poly Haven", "assets/polyhaven-rust-coarse-01/rust_coarse_01.webp", false, ["rust_coarse_01_rough_2k.jpg","rust_coarse_01_nor_gl_2k.jpg","rust_coarse_01_ao_2k.jpg","rust_coarse_01_disp_2k.jpg"], 0.62, 0.65, "#8a796d", "brushed-metal", [2, 2]],
  ["polyhaven-beige-wall-001", "Beige Wall 001", "회벽", "plaster-concrete", "Poly Haven", "assets/polyhaven-beige-wall-001/beige_wall_001.webp", false, ["beige_wall_001_rough_2k.jpg","beige_wall_001_nor_gl_2k.jpg","beige_wall_001_ao_2k.jpg","beige_wall_001_disp_2k.jpg"], 0.78, 0, "#e8e2d5", "matte-plastic", [2, 2]],
  ["polyhaven-painted-plaster-wall", "Painted Plaster Wall", "회벽", "plaster-concrete", "Poly Haven", "assets/polyhaven-painted-plaster-wall/painted_plaster_wall.webp", false, ["painted_plaster_wall_rough_2k.jpg","painted_plaster_wall_nor_gl_2k.jpg","painted_plaster_wall_ao_2k.jpg","painted_plaster_wall_disp_2k.jpg"], 0.85, 0.02, "#8f9296", "matte-plastic", [2, 2]],
  ["polyhaven-white-plaster-02", "White Plaster 02", "회벽", "plaster-concrete", "Poly Haven", "assets/polyhaven-white-plaster-02/white_plaster_02.webp", false, ["white_plaster_02_rough_2k.jpg","white_plaster_02_nor_gl_2k.jpg","white_plaster_02_ao_2k.jpg","white_plaster_02_disp_2k.jpg"], 0.78, 0, "#e8e2d5", "matte-plastic", [2, 2]],
  ["polyhaven-asphalt-02", "Asphalt 02", "아스팔트", "tile-pavement", "Poly Haven", "assets/polyhaven-asphalt-02/asphalt_02.webp", false, ["asphalt_02_rough_2k.jpg","asphalt_02_nor_gl_2k.jpg","asphalt_02_ao_2k.jpg","asphalt_02_disp_2k.jpg"], 0.84, 0.02, "#6e7075", "rubber", [3, 3]],
  ["polyhaven-aerial-asphalt-01", "Aerial Asphalt 01", "아스팔트", "tile-pavement", "Poly Haven", "assets/polyhaven-aerial-asphalt-01/aerial_asphalt_01.webp", false, ["aerial_asphalt_01_rough_2k.jpg","aerial_asphalt_01_nor_gl_2k.jpg","aerial_asphalt_01_ao_2k.jpg","aerial_asphalt_01_disp_2k.jpg"], 0.84, 0.02, "#6e7075", "rubber", [3, 3]],
  ["polyhaven-asphalt-01", "Asphalt 01", "아스팔트", "tile-pavement", "Poly Haven", "assets/polyhaven-asphalt-01/asphalt_01.webp", false, ["asphalt_01_rough_2k.jpg","asphalt_01_nor_gl_2k.jpg","asphalt_01_ao_2k.jpg","asphalt_01_disp_2k.jpg"], 0.84, 0.02, "#6e7075", "rubber", [3, 3]],
  ["polyhaven-concrete-floor-worn-001", "Concrete Floor Worn 001", "콘크리트", "plaster-concrete", "Poly Haven", "assets/polyhaven-concrete-floor-worn-001/concrete_floor_worn_001.webp", false, ["concrete_floor_worn_001_rough_2k.jpg","concrete_floor_worn_001_nor_gl_2k.jpg","concrete_floor_worn_001_ao_2k.jpg","concrete_floor_worn_001_disp_2k.jpg"], 0.85, 0.02, "#8f9296", "matte-plastic", [2, 2]],
  ["polyhaven-concrete-floor-02", "Concrete Floor 02", "콘크리트", "plaster-concrete", "Poly Haven", "assets/polyhaven-concrete-floor-02/concrete_floor_02.webp", false, ["concrete_floor_02_rough_2k.jpg","concrete_floor_02_nor_gl_2k.jpg","concrete_floor_02_ao_2k.jpg","concrete_floor_02_disp_2k.jpg"], 0.85, 0.02, "#8f9296", "matte-plastic", [2, 2]],
  ["polyhaven-concrete-layers-02", "Concrete Layers 02", "콘크리트", "plaster-concrete", "Poly Haven", "assets/polyhaven-concrete-layers-02/concrete_layers_02.webp", false, ["concrete_layers_02_rough_2k.jpg","concrete_layers_02_nor_gl_2k.jpg","concrete_layers_02_ao_2k.jpg","concrete_layers_02_disp_2k.jpg"], 0.85, 0.02, "#8f9296", "matte-plastic", [2, 2]],
  ["polyhaven-coast-sand-rocks-02", "Coast Sand Rocks 02", "석재", "nature-ground", "Poly Haven", "assets/polyhaven-coast-sand-rocks-02/coast_sand_rocks_02.webp", false, ["coast_sand_rocks_02_rough_2k.jpg","coast_sand_rocks_02_nor_gl_2k.jpg","coast_sand_rocks_02_ao_2k.jpg","coast_sand_rocks_02_disp_2k.jpg"], 0.88, 0, "#d6be96", "matte-plastic", [3, 3]],
  ["polyhaven-aerial-rocks-02", "Aerial Rocks 02", "석재", "nature-ground", "Poly Haven", "assets/polyhaven-aerial-rocks-02/aerial_rocks_02.webp", false, ["aerial_rocks_02_rough_2k.jpg","aerial_rocks_02_nor_gl_2k.jpg","aerial_rocks_02_ao_2k.jpg","aerial_rocks_02_disp_2k.jpg"], 0.92, 0, "#5d6b4d", "rubber", [3, 3]],
  ["polyhaven-aerial-grass-rock", "Aerial Grass Rock", "석재", "nature-ground", "Poly Haven", "assets/polyhaven-aerial-grass-rock/aerial_grass_rock.webp", false, ["aerial_grass_rock_rough_2k.jpg","aerial_grass_rock_nor_gl_2k.jpg","aerial_grass_rock_ao_2k.jpg","aerial_grass_rock_disp_2k.jpg"], 0.92, 0, "#5d6b4d", "rubber", [3, 3]],
  ["polyhaven-brown-leather", "Brown Leather", "가죽", "metal-fabric", "Poly Haven", "assets/polyhaven-brown-leather/brown_leather.webp", false, ["brown_leather_rough_2k.jpg","brown_leather_nor_gl_2k.jpg","brown_leather_ao_2k.jpg","brown_leather_disp_2k.jpg"], 0.48, 0.04, "#6e4732", "gloss-plastic", [2, 2]],
  ["polyhaven-marble-01", "Marble 01", "타일", "tile-pavement", "Poly Haven", "assets/polyhaven-marble-01/marble_01.webp", false, ["marble_01_rough_2k.jpg","marble_01_nor_gl_2k.jpg","marble_01_ao_2k.jpg","marble_01_disp_2k.jpg"], 0.18, 0.05, "#e6e4df", "ceramic", [2, 2]],
  ["polyhaven-leather-white", "Leather White", "가죽", "metal-fabric", "Poly Haven", "assets/polyhaven-leather-white/leather_white.webp", false, ["leather_white_rough_2k.png","leather_white_nor_gl_2k.jpg","leather_white_ao_2k.png","leather_white_disp_2k.jpg"], 0.48, 0.04, "#e5e0d8", "gloss-plastic", [2, 2]],
  ["polyhaven-floor-tiles-06", "Floor Tiles 06", "타일", "tile-pavement", "Poly Haven", "assets/polyhaven-floor-tiles-06/floor_tiles_06.webp", false, ["floor_tiles_06_rough_2k.jpg","floor_tiles_06_nor_gl_2k.jpg","floor_tiles_06_ao_2k.jpg","floor_tiles_06_disp_2k.jpg"], 0.28, 0.04, "#d4cfc7", "ceramic", [3, 3]],
  ["polyhaven-decrepit-wallpaper", "Decrepit Wallpaper", "벽지", "metal-fabric", "Poly Haven", "assets/polyhaven-decrepit-wallpaper/decrepit_wallpaper.webp", false, ["decrepit_wallpaper_rough_2k.jpg","decrepit_wallpaper_nor_gl_2k.jpg","decrepit_wallpaper_ao_2k.jpg","decrepit_wallpaper_disp_2k.jpg"], 0.88, 0, "#9c8f82", "rubber", [3, 3]],
  ["polyhaven-brown-mud-leaves-01", "Brown Mud Leaves 01", "지면", "nature-ground", "Poly Haven", "assets/polyhaven-brown-mud-leaves-01/brown_mud_leaves_01.webp", false, ["brown_mud_leaves_01_rough_2k.jpg","brown_mud_leaves_01_nor_gl_2k.jpg","brown_mud_leaves_01_ao_2k.jpg","brown_mud_leaves_01_disp_2k.jpg"], 0.92, 0, "#5d6b4d", "rubber", [3, 3]],
  ["polyhaven-forrest-ground-01", "Forest Ground 01", "지면", "nature-ground", "Poly Haven", "assets/polyhaven-forrest-ground-01/forrest_ground_01.webp", false, ["forrest_ground_01_rough_2k.jpg","forrest_ground_01_nor_gl_2k.jpg","forrest_ground_01_ao_2k.jpg","forrest_ground_01_disp_2k.jpg"], 0.92, 0, "#5d6b4d", "rubber", [3, 3]],
  ["polyhaven-rocky-terrain-02", "Rocky Terrain 02", "지면", "nature-ground", "Poly Haven", "assets/polyhaven-rocky-terrain-02/rocky_terrain_02.webp", false, ["rocky_terrain_02_rough_2k.jpg","rocky_terrain_02_nor_gl_2k.jpg","rocky_terrain_02_ao_2k.jpg","rocky_terrain_02_disp_2k.jpg"], 0.92, 0, "#5d6b4d", "rubber", [3, 3]],
];

export const STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG: readonly StudioBg3dCc0SurfaceMaterialEntry[] =
  Object.freeze(
    RAW_SURFACE_SPECS.map(([id, labelKo, labelEn, category, provider, relPath, hasThumbnail, pbrFiles, roughness, metalness, tintHex, surfacePresetId, repeat]) => {
      const baseColorUrl = `${CC0_ROOT}/${relPath}`;
      const dirPath = relPath.slice(0, relPath.lastIndexOf("/"));
      const previewUrl = hasThumbnail ? `${CC0_ROOT}/${dirPath}/thumbnail.webp` : baseColorUrl;
      const pbrMaps: StudioBg3dCc0SurfacePbrMapSet | null = pbrFiles
        ? Object.freeze({
            roughnessUrl: `${CC0_ROOT}/${dirPath}/${pbrFiles[0]}`,
            normalGlUrl: `${CC0_ROOT}/${dirPath}/${pbrFiles[1]}`,
            aoUrl: `${CC0_ROOT}/${dirPath}/${pbrFiles[2]}`,
            displacementUrl: `${CC0_ROOT}/${dirPath}/${pbrFiles[3]}`,
          })
        : null;
      return Object.freeze({
        id,
        labelKo,
        labelEn,
        category,
        provider,
        baseColorUrl,
        previewUrl,
        pbrMaps,
        roughness,
        metalness,
        tintHex,
        surfacePresetId,
        defaultRepeat: Object.freeze([repeat[0], repeat[1]] as const),
      });
    }),
  );

const MATERIAL_BY_ID = new Map(
  STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG.map((entry) => [entry.id, entry] as const),
);

export function findStudioBg3dCc0SurfaceMaterial(
  id: string,
): StudioBg3dCc0SurfaceMaterialEntry | undefined {
  return MATERIAL_BY_ID.get(id);
}

export function listStudioBg3dCc0SurfaceMaterialsByCategory(
  category: StudioBg3dCc0SurfaceMaterialCategory | null,
): readonly StudioBg3dCc0SurfaceMaterialEntry[] {
  if (category === null) return STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG;
  return STUDIO_BG3D_CC0_SURFACE_MATERIAL_CATALOG.filter((entry) => entry.category === category);
}

/** CC0 표면 재질을 커스텀 3D 모델·프리미티브의 인스턴스 재질 오버라이드(StudioBg3dMaterialOverride)로 변환한다. */
export function buildStudioBg3dCc0SurfaceMaterialOverride(
  id: string,
): StudioBg3dMaterialOverride | null {
  const entry = MATERIAL_BY_ID.get(id);
  if (!entry) return null;
  return Object.freeze({
    colorMode: "multiply",
    color: entry.tintHex,
    colorStrength: 0.42,
    roughness: entry.roughness,
    metalness: entry.metalness,
    opacity: 1,
    wireframe: false,
    emissiveColor: "#000000",
    emissiveIntensity: 0,
    surfaceMaterialId: entry.id,
  });
}

/** StudioBg3dMaterialOverride에 기록된 surfaceMaterialId로부터 카탈로그 항목을 역참조한다. */
export function resolveStudioBg3dCc0SurfaceMaterialFromOverride(
  override: StudioBg3dMaterialOverride | null | undefined,
): StudioBg3dCc0SurfaceMaterialEntry | null {
  if (!override?.surfaceMaterialId) return null;
  return MATERIAL_BY_ID.get(override.surfaceMaterialId) ?? null;
}

export interface StudioBg3dSurfaceMaterialRoomKit {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly floorMaterialId: string;
  readonly wallMaterialId: string;
  readonly accentMaterialId: string;
}

export const STUDIO_BG3D_SURFACE_MATERIAL_ROOM_KITS: readonly StudioBg3dSurfaceMaterialRoomKit[] =
  Object.freeze([
    {
      id: "classroom_wood_plaster",
      labelKo: "교실 마루·회벽",
      labelEn: "Classroom Wood & Plaster",
      descriptionKo: "학교 교실·복도에 어울리는 원목 마루 + 밝은 회벽 + 목재 가구 조합",
      floorMaterialId: "polyhaven-wood-floor",
      wallMaterialId: "polyhaven-white-rough-plaster",
      accentMaterialId: "polyhaven-oak-veneer-01",
    },
    {
      id: "vintage_cafe_brick_oak",
      labelKo: "빈티지 카페 벽돌·오크",
      labelEn: "Vintage Café Brick & Oak",
      descriptionKo: "따뜻한 카페·베이커리용 라미네이트 바닥 + 붉은 벽돌벽 + 가죽 소파 조합",
      floorMaterialId: "polyhaven-laminate-floor-02",
      wallMaterialId: "polyhaven-brick-wall-001",
      accentMaterialId: "polyhaven-brown-leather",
    },
    {
      id: "european_cobble_alley",
      labelKo: "유럽풍 자갈 골목",
      labelEn: "European Cobble Alley",
      descriptionKo: "구시가지 골목·광장용 자갈 바닥 + 중세 석재 블록 + 기와 지붕 조합",
      floorMaterialId: "polyhaven-cobblestone-floor-04",
      wallMaterialId: "polyhaven-medieval-blocks-03",
      accentMaterialId: "polyhaven-roof-09",
    },
    {
      id: "palace_marble_hall",
      labelKo: "로판 대리석 홀",
      labelEn: "Palace Marble Hall",
      descriptionKo: "로맨스판타지 연회장·신전용 대리석 타일 + 사암 벽면 + 백색 가죽 장식 조합",
      floorMaterialId: "polyhaven-marble-tiles",
      wallMaterialId: "polyhaven-sandstone-blocks-05",
      accentMaterialId: "polyhaven-leather-white",
    },
    {
      id: "industrial_concrete_factory",
      labelKo: "인더스트리얼 공장",
      labelEn: "Industrial Concrete Factory",
      descriptionKo: "액션·느와르 창고 신을 위한 낡은 콘크리트 바닥 + 공장 벽면 + 녹슨 철판 조합",
      floorMaterialId: "polyhaven-concrete-floor-worn-001",
      wallMaterialId: "polyhaven-factory-wall",
      accentMaterialId: "polyhaven-rusty-metal-02",
    },
    {
      id: "forest_stone_sanctuary",
      labelKo: "숲속 신전·야영지",
      labelEn: "Forest Stone Sanctuary",
      descriptionKo: "판타지 숲길·야영지용 이끼 자갈길 + 암벽 + 낙엽 지면 조합",
      floorMaterialId: "polyhaven-grassy-cobblestone",
      wallMaterialId: "polyhaven-marble-cliff-03",
      accentMaterialId: "polyhaven-forest-leaves-04",
    },
  ]);

export function resolveStudioBg3dSurfaceMaterialRoomKit(kitId: string): {
  readonly kit: StudioBg3dSurfaceMaterialRoomKit;
  readonly floor: StudioBg3dCc0SurfaceMaterialEntry;
  readonly wall: StudioBg3dCc0SurfaceMaterialEntry;
  readonly accent: StudioBg3dCc0SurfaceMaterialEntry;
} | null {
  const kit = STUDIO_BG3D_SURFACE_MATERIAL_ROOM_KITS.find((candidate) => candidate.id === kitId);
  if (!kit) return null;
  const floor = MATERIAL_BY_ID.get(kit.floorMaterialId);
  const wall = MATERIAL_BY_ID.get(kit.wallMaterialId);
  const accent = MATERIAL_BY_ID.get(kit.accentMaterialId);
  if (!floor || !wall || !accent) return null;
  return Object.freeze({ kit, floor, wall, accent });
}
