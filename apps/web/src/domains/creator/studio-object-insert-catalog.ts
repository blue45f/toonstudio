/**
 * Canva-style "Elements → 3D objects" discovery catalog for Studio.
 *
 * Unifies already-shipped BG3D primitives, VRM props, and BG scene templates into one
 * searchable insert surface. Does **not** pull Three.js or spawn meshes — pure metadata
 * for panels/rails that route into existing BG3D / VRM tools.
 *
 * Product stance (vs Canva 3D Content Generator):
 * - Canva optimizes one-shot ornamental 3D for social layouts.
 * - ToonStudio optimizes re-editable production objects (pose, grip, LT capture, CRDT).
 * - This catalog is the discoverability layer; generation stays fail-closed until rights/quality land.
 */

import {
  PRIMITIVE_DEFS,
  type BgPrimitiveKind,
} from "./studio-background-3d-metadata";
import {
  PROP_CATEGORY_LABELS,
  VRM_PROPS,
  type PropCategory,
} from "./vrm/studio-vrm-props";

export const STUDIO_OBJECT_INSERT_CATALOG_VERSION =
  "object-insert-catalog-v1" as const;

export type StudioObjectInsertKind =
  | "bg3d-primitive"
  | "bg3d-scene-prop"
  | "vrm-prop"
  | "bg3d-scene-template";

export type StudioObjectInsertOpenTarget =
  | "bg3d-editor"
  | "vrm-poser"
  | "bg3d-templates";

export type StudioObjectInsertFamily =
  | "primitive"
  | "scene-furniture"
  | "prop-hand"
  | "prop-head"
  | "prop-body"
  | "scene-interior"
  | "scene-urban"
  | "scene-nature";

export interface StudioObjectInsertItem {
  readonly id: string;
  readonly kind: StudioObjectInsertKind;
  /** Stable source id inside the owning subsystem (primitive kind / prop id / template id). */
  readonly sourceId: string;
  readonly label: string;
  readonly family: StudioObjectInsertFamily;
  readonly familyLabel: string;
  readonly keywords: readonly string[];
  readonly hint: string | null;
  readonly openTarget: StudioObjectInsertOpenTarget;
  /** Suggested document footprint when flattening to a 2D plate (canvas units). */
  readonly defaultWidth: number;
  readonly defaultHeight: number;
  /** Optional first-party GLB asset URL backing this 3D item. */
  readonly assetUrl?: string;
  /** Optional rendered preview/thumbnail PNG URL for catalog cards. */
  readonly thumbnailUrl?: string;
}

export interface StudioObjectInsertPlacementPlan {
  readonly itemId: string;
  readonly openTarget: StudioObjectInsertOpenTarget;
  readonly sourceId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Deterministic spawn index hint for BG3D createPrimitive-style jitter. */
  readonly existingCountHint: number;
}

/** Refined-v8 scene furniture GLBs with rendered thumbnails for 3D scene/room layout. */
const REFINED_V8_SCENE_FURNITURE_INDEX = Object.freeze([
  { id: "blackboard", label: "교실 칠판 · 개선형", keywords: ["blackboard", "칠판", "학교", "교실", "보드"], hint: "Blender PBR 개선형 교실 칠판 GLB." },
  { id: "desk", label: "학생·사무 책상 · 개선형", keywords: ["desk", "책상", "학교", "오피스", "가구"], hint: "Blender PBR 개선형 학생·오피스 책상 GLB." },
  { id: "chair", label: "학생·카페 의자 · 개선형", keywords: ["chair", "의자", "학교", "카페", "가구"], hint: "Blender PBR 개선형 학생·카페 의자 GLB." },
  { id: "sofa", label: "라운지 소파 · 개선형", keywords: ["sofa", "소파", "거실", "라운지", "가구"], hint: "Blender PBR 개선형 라운지 소파 GLB." },
] as const);

/** Creator Essentials modular 3D scene/architecture props (8 GLBs + rendered PNG previews). */
const CREATOR_ESSENTIALS_SCENE_PROP_INDEX = Object.freeze([
  { id: "bench", label: "모듈형 벤치 · Creator", keywords: ["bench", "벤치", "공원", "의자", "creator"], hint: "Creator Essentials 모듈형 3D 벤치 GLB." },
  { id: "bookshelf", label: "모듈형 서재 책장 · Creator", keywords: ["bookshelf", "책장", "서재", "선반", "creator"], hint: "Creator Essentials 모듈형 3D 서재 책장 GLB." },
  { id: "chair", label: "모듈형 의자 · Creator", keywords: ["chair", "의자", "모듈", "가구", "creator"], hint: "Creator Essentials 모듈형 3D 의자 GLB." },
  { id: "desk", label: "모듈형 책상 · Creator", keywords: ["desk", "책상", "서재", "모듈", "creator"], hint: "Creator Essentials 모듈형 3D 책상 GLB." },
  { id: "doorway", label: "모듈형 출입문 프레임 · Creator", keywords: ["doorway", "door", "문", "출입문", "건축", "creator"], hint: "Creator Essentials 모듈형 3D 출입문 프레임 GLB." },
  { id: "stairs", label: "모듈형 실내 계단 · Creator", keywords: ["stairs", "계단", "실내", "건축", "creator"], hint: "Creator Essentials 모듈형 3D 계단 GLB." },
  { id: "streetlamp", label: "모듈형 거리 가로등 · Creator", keywords: ["streetlamp", "가로등", "거리", "조명", "creator"], hint: "Creator Essentials 모듈형 3D 가로등 GLB." },
  { id: "window-wall", label: "모듈형 창문 벽체 · Creator", keywords: ["window", "wall", "창문", "벽체", "건축", "creator"], hint: "Creator Essentials 모듈형 3D 창문 벽체 GLB." },
] as const);

/** Curated Poly Haven 2K PBR CC0 3D scene props (12 GLBs + rendered PNG previews). */
const POLYHAVEN_SCENE_PROP_INDEX = Object.freeze([
  { id: "coffee_table_round_01", slug: "polyhaven-coffee-table-round-01", file: "coffee_table_round_01.glb", label: "원형 커피 테이블 · Poly Haven", keywords: ["table", "커피", "테이블", "거실", "polyhaven", "pbr"], hint: "Poly Haven CC0 2K PBR 원형 커피 테이블 GLB." },
  { id: "rockingchair_01", slug: "polyhaven-rockingchair-01", file: "Rockingchair_01.glb", label: "원목 흔들의자 · Poly Haven", keywords: ["rocking", "chair", "흔들의자", "의자", "polyhaven", "pbr"], hint: "Poly Haven CC0 2K PBR 원목 흔들의자 GLB." },
  { id: "gothicbed_01", slug: "polyhaven-gothicbed-01", file: "GothicBed_01.glb", label: "고딕 장식 침대 · Poly Haven", keywords: ["bed", "gothic", "침대", "고딕", "침실", "polyhaven", "pbr"], hint: "Poly Haven CC0 2K PBR 고딕 침대 GLB." },
  { id: "chandelier_03", slug: "polyhaven-chandelier-03", file: "Chandelier_03.glb", label: "실내 장식 샹들리에 · Poly Haven", keywords: ["chandelier", "샹들리에", "조명", "천장등", "polyhaven", "pbr"], hint: "Poly Haven CC0 2K PBR 실내 샹들리에 GLB." },
  { id: "chinese_sofa", slug: "polyhaven-chinese-sofa", file: "chinese_sofa.glb", label: "중국풍 목제 소파 · Poly Haven", keywords: ["sofa", "소파", "동양", "응접실", "polyhaven", "pbr"], hint: "Poly Haven CC0 2K PBR 중국풍 목제 소파 GLB." },
  { id: "vintage_grandfather_clock_01", slug: "polyhaven-vintage-grandfather-clock-01", file: "vintage_grandfather_clock_01-alpha-restored-v1.glb", label: "빈티지 대형 괘종시계 · Poly Haven", keywords: ["clock", "괘종시계", "시계", "빈티지", "polyhaven", "pbr"], hint: "Poly Haven CC0 2K PBR 빈티지 괘종시계 GLB." },
  { id: "vintage_cabinet_01", slug: "polyhaven-vintage-cabinet-01", file: "vintage_cabinet_01.glb", label: "클래식 장식 수납장 · Poly Haven", keywords: ["cabinet", "수납장", "장식장", "서재", "polyhaven", "pbr"], hint: "Poly Haven CC0 2K PBR 클래식 수납장 GLB." },
  { id: "tea_set_01", slug: "polyhaven-tea-set-01", file: "tea_set_01.glb", label: "클래식 다기 세트 · Poly Haven", keywords: ["tea", "다기", "찻잔", "카페", "polyhaven", "pbr"], hint: "Poly Haven CC0 2K PBR 클래식 다기 세트 GLB." },
  { id: "treasure_chest", slug: "polyhaven-treasure-chest", file: "treasure_chest.glb", label: "금속 장식 보물상자 · Poly Haven", keywords: ["chest", "treasure", "보물상자", "판타지", "polyhaven", "pbr"], hint: "Poly Haven CC0 2K PBR 보물상자 GLB." },
  { id: "street_lamp_01", slug: "polyhaven-street-lamp-01", file: "street_lamp_01.glb", label: "클래식 가로등 · Poly Haven", keywords: ["street", "lamp", "가로등", "거리", "polyhaven", "pbr"], hint: "Poly Haven CC0 2K PBR 클래식 가로등 GLB." },
  { id: "potted_plant_02", slug: "polyhaven-potted-plant-02", file: "potted_plant_02.glb", label: "대형 실내 관엽 화분 · Poly Haven", keywords: ["plant", "화분", "식물", "인테리어", "polyhaven", "pbr"], hint: "Poly Haven CC0 2K PBR 대형 관엽 화분 GLB." },
  { id: "rock_moss_set_01", slug: "polyhaven-rock-moss-set-01", file: "rock_moss_set_01.glb", label: "황갈색 이끼 바위 세트 · Poly Haven", keywords: ["rock", "moss", "바위", "이끼", "자연", "polyhaven", "pbr"], hint: "Poly Haven CC0 2K PBR 이끼 바위 세트 GLB." },
] as const);

/** Curated Kenney CC0 blockout architecture, vehicles, and props (12 GLBs + rendered PNG previews). */
const KENNEY_BLOCKOUT_SCENE_PROP_INDEX = Object.freeze([
  { id: "city_building_a", assetId: "kenney-city-commercial-building-a", path: "assets/kenney-city-commercial/building-a.glb", label: "도심 상업 빌딩 A · Kenney", keywords: ["building", "city", "빌딩", "상가", "건축", "kenney", "blockout"], hint: "Kenney CC0 도심 상업 빌딩 블록아웃 GLB." },
  { id: "suburban_house_a", assetId: "kenney-suburban-building-type-a", path: "assets/kenney-suburban/building-type-a.glb", label: "교외 단독주택 A · Kenney", keywords: ["house", "suburban", "주택", "교외", "건축", "kenney", "blockout"], hint: "Kenney CC0 교외 단독주택 블록아웃 GLB." },
  { id: "roads_traffic_light", assetId: "kenney-roads-traffic-light", path: "assets/kenney-roads/traffic-light.glb", label: "교차로 신호등 · Kenney", keywords: ["traffic", "light", "신호등", "도로", "거리", "kenney", "blockout"], hint: "Kenney CC0 교차로 신호등 블록아웃 GLB." },
  { id: "roads_dumpster", assetId: "kenney-roads-dumpster", path: "assets/kenney-roads/dumpster.glb", label: "대형 쓰레기 수거함 · Kenney", keywords: ["dumpster", "수거함", "골목", "거리", "kenney", "blockout"], hint: "Kenney CC0 대형 쓰레기 수거함 블록아웃 GLB." },
  { id: "building_stairs_open", assetId: "kenney-building-stairs-open", path: "assets/kenney-building/stairs-open.glb", label: "오픈형 모듈 계단 · Kenney", keywords: ["stairs", "계단", "모듈", "건축", "kenney", "blockout"], hint: "Kenney CC0 오픈형 모듈 계단 블록아웃 GLB." },
  { id: "furniture_bed_bunk", assetId: "kenney-furniture-bed-bunk", path: "assets/kenney-furniture/bed-bunk.glb", label: "기숙사 2층 침대 · Kenney", keywords: ["bunk", "bed", "침대", "기숙사", "가구", "kenney", "blockout"], hint: "Kenney CC0 2층 침대 블록아웃 GLB." },
  { id: "furniture_fridge_large", assetId: "kenney-furniture-kitchen-fridge-large", path: "assets/kenney-furniture/kitchen-fridge-large.glb", label: "양문형 대형 냉장고 · Kenney", keywords: ["fridge", "냉장고", "주방", "가구", "kenney", "blockout"], hint: "Kenney CC0 대형 냉장고 블록아웃 GLB." },
  { id: "food_cake_birthday", assetId: "kenney-food-cake-birthday", path: "assets/kenney-food/cake-birthday.glb", label: "생일 축하 케이크 · Kenney", keywords: ["cake", "birthday", "케이크", "디저트", "kenney", "blockout"], hint: "Kenney CC0 생일 케이크 블록아웃 GLB." },
  { id: "nature_bridge_stone", assetId: "kenney-nature-bridge-stone", path: "assets/kenney-nature/bridge-stone.glb", label: "아치형 개울 돌다리 · Kenney", keywords: ["bridge", "stone", "돌다리", "다리", "자연", "kenney", "blockout"], hint: "Kenney CC0 아치형 돌다리 블록아웃 GLB." },
  { id: "survival_tent_canvas", assetId: "kenney-survival-tent-canvas", path: "assets/kenney-survival/tent-canvas.glb", label: "야영 캔버스 텐트 · Kenney", keywords: ["tent", "camp", "텐트", "야영", "캠핑", "kenney", "blockout"], hint: "Kenney CC0 야영 캔버스 텐트 블록아웃 GLB." },
  { id: "watercraft_boat_house_a", assetId: "kenney-watercraft-boat-house-a", path: "assets/kenney-watercraft/boat-house-a.glb", label: "수상 하우스보트 A · Kenney", keywords: ["boat", "houseboat", "보트", "선박", "항구", "kenney", "blockout"], hint: "Kenney CC0 수상 하우스보트 블록아웃 GLB." },
  { id: "watercraft_boat_sail_a", assetId: "kenney-watercraft-boat-sail-a", path: "assets/kenney-watercraft/boat-sail-a.glb", label: "항구 돛단배 범선 A · Kenney", keywords: ["sail", "ship", "범선", "돛단배", "항구", "kenney", "blockout"], hint: "Kenney CC0 항구 범선 블록아웃 GLB." },
] as const);

/** Lightweight scene-template index (mirrors BG_SCENE_TEMPLATES labels; Three-free). */
const SCENE_TEMPLATE_INDEX = Object.freeze([
  { id: "classroom", category: "interior", label: "교실", keywords: ["school", "학교", "칠판"], assetUrl: "/assets/3d/environments/refined-v6/classroom_art_studio.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/classroom_art_studio/beauty0001.png" },
  { id: "cafe", category: "interior", label: "카페", keywords: ["coffee", "카페", "테이블"], assetUrl: "/assets/3d/environments/refined-v6/stylized_cafe_interior.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/stylized_cafe_interior/beauty0001.png" },
  { id: "office", category: "interior", label: "오피스", keywords: ["office", "회사", "책상"], assetUrl: "/assets/3d/environments/expansion-v1/library_reading_room.glb", thumbnailUrl: "/assets/3d/environments/expansion-v1/thumbnails/library_reading_room.png" },
  { id: "bedroom", category: "interior", label: "침실", keywords: ["bed", "방", "침대"], assetUrl: "/assets/3d/environments/refined-v6/compact_apartment_interior.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/compact_apartment_interior/beauty0001.png" },
  { id: "hospital_room", category: "interior", label: "병실", keywords: ["hospital", "병원"], assetUrl: "/assets/3d/environments/refined-v6/hospital_emergency_nurse_station.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/hospital_emergency_nurse_station/beauty0001.png" },
  { id: "convenience_store", category: "interior", label: "편의점", keywords: ["store", "편의점"], assetUrl: "/assets/3d/environments/refined-v6/korean_convenience_store_night.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/korean_convenience_store_night/beauty0001.png" },
  { id: "magical_academy_classroom", category: "interior", label: "마법 아카데미 강당 교실", keywords: ["fantasy", "마법", "학원"], assetUrl: "/assets/3d/environments/refined-v6/fantasy_alchemist_workshop_library.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/fantasy_alchemist_workshop_library/beauty0001.png" },
  { id: "modern_hospital_room", category: "interior", label: "모던 병원 진료실", keywords: ["clinic", "진료"], assetUrl: "/assets/3d/environments/expansion-v1/science_research_laboratory.glb", thumbnailUrl: "/assets/3d/environments/expansion-v1/thumbnails/science_research_laboratory.png" },
  { id: "street_avenue", category: "urban", label: "거리", keywords: ["street", "길", "도시"], assetUrl: "/assets/3d/environments/webtoon-v7/webtoon_corner_store_facade.glb", thumbnailUrl: "/assets/3d/environments/webtoon-v7/thumbnails/webtoon_corner_store_facade.png" },
  { id: "residential_alley", category: "urban", label: "골목길", keywords: ["alley", "골목"], assetUrl: "/assets/3d/environments/refined-v6/urban_neon_alley.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/urban_neon_alley/beauty0001.png" },
  { id: "crosswalk", category: "urban", label: "횡단보도", keywords: ["crosswalk", "신호"], assetUrl: "/assets/3d/environments/authored-v1/webtoon_neighborhood_bus_stop.glb", thumbnailUrl: "/assets/3d/environments/authored-v1/thumbnails/webtoon_neighborhood_bus_stop.png" },
  { id: "station_plaza", category: "urban", label: "역 앞 광장", keywords: ["station", "역"], assetUrl: "/assets/3d/environments/refined-v6/seoul_subway_platform.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/seoul_subway_platform/beauty0001.png" },
  { id: "construction_site", category: "urban", label: "공사장", keywords: ["construction", "공사"], assetUrl: "/assets/3d/environments/webtoon-v7/webtoon_rooftop_utility_platform.glb", thumbnailUrl: "/assets/3d/environments/webtoon-v7/thumbnails/webtoon_rooftop_utility_platform.png" },
  { id: "rooftop", category: "urban", label: "옥상", keywords: ["rooftop", "옥상"], assetUrl: "/assets/3d/environments/refined-v6/korean_school_rooftop.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/korean_school_rooftop/beauty0001.png" },
  { id: "post_apocalyptic_ruins", category: "urban", label: "폐허 아포칼립스 거점", keywords: ["ruins", "폐허"], assetUrl: "/assets/3d/environments/refined-v6/fantasy_ruin_courtyard.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/fantasy_ruin_courtyard/beauty0001.png" },
  { id: "space_station_bridge", category: "urban", label: "SF 우주선 함교", keywords: ["space", "우주", "sf"], assetUrl: "/assets/3d/environments/refined-v6/scifi_command_corridor.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/scifi_command_corridor/beauty0001.png" },
  { id: "park_plaza", category: "nature", label: "공원", keywords: ["park", "공원"], assetUrl: "/assets/3d/environments/authored-v1/webtoon_riverside_park_pavilion.glb", thumbnailUrl: "/assets/3d/environments/authored-v1/thumbnails/webtoon_riverside_park_pavilion.png" },
  { id: "backyard_garden", category: "nature", label: "정원", keywords: ["garden", "정원"], assetUrl: "/assets/3d/environments/expansion-v1/park_garden_pavilion.glb", thumbnailUrl: "/assets/3d/environments/expansion-v1/thumbnails/park_garden_pavilion.png" },
  { id: "beach", category: "nature", label: "해변", keywords: ["beach", "바다"], assetUrl: "/assets/3d/environments/authored-v1/webtoon_riverside_park_pavilion.glb", thumbnailUrl: "/assets/3d/environments/authored-v1/thumbnails/webtoon_riverside_park_pavilion.png" },
  { id: "forest_path", category: "nature", label: "숲길", keywords: ["forest", "숲"], assetUrl: "/assets/3d/environments/refined-v6/fantasy_ruin_courtyard.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/fantasy_ruin_courtyard/beauty0001.png" },
  { id: "shrine_yard", category: "nature", label: "사당 마당", keywords: ["shrine", "사당"], assetUrl: "/assets/3d/environments/refined-v6/hanok_market_courtyard.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/hanok_market_courtyard/beauty0001.png" },
  { id: "ancient_palace", category: "nature", label: "고풍 전통 궁궐 사당", keywords: ["palace", "궁"], assetUrl: "/assets/3d/environments/authored-v1/webtoon_hanok_courtyard_gate.glb", thumbnailUrl: "/assets/3d/environments/authored-v1/thumbnails/webtoon_hanok_courtyard_gate.png" },
  { id: "fantasy_dungeon_hall", category: "nature", label: "판타지 던전 알현실", keywords: ["dungeon", "던전"], assetUrl: "/assets/3d/environments/refined-v6/fantasy_ruin_courtyard.glb", thumbnailUrl: "/assets/3d/environments/refined-v6/passes/fantasy_ruin_courtyard/beauty0001.png" },
  { id: "fantasy_tavern", category: "interior", label: "판타지 여관", keywords: ["fantasy", "tavern", "여관", "주점"], assetUrl: "/assets/3d/environments/expansion-v1/independent_bookshop.glb", thumbnailUrl: "/assets/3d/environments/expansion-v1/thumbnails/independent_bookshop.png" },
] as const);

const SCENE_FAMILY: Record<string, StudioObjectInsertFamily> = {
  interior: "scene-interior",
  urban: "scene-urban",
  nature: "scene-nature",
};

const SCENE_FAMILY_LABEL: Record<StudioObjectInsertFamily, string> = {
  primitive: "기본 입체",
  "scene-furniture": "배경 가구",
  "prop-hand": "손 소품",
  "prop-head": "머리 소품",
  "prop-body": "몸 소품",
  "scene-interior": "실내 씬",
  "scene-urban": "거리·도시 씬",
  "scene-nature": "자연·판타지 씬",
};

const PROP_FAMILY: Record<PropCategory, StudioObjectInsertFamily> = {
  hand: "prop-hand",
  head: "prop-head",
  body: "prop-body",
};

function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase("ko-KR");
}

function matchesQuery(
  item: StudioObjectInsertItem,
  normalized: string,
): boolean {
  if (!normalized) return true;
  if (item.label.toLocaleLowerCase("ko-KR").includes(normalized)) return true;
  if (item.sourceId.toLocaleLowerCase("ko-KR").includes(normalized)) return true;
  if (item.familyLabel.toLocaleLowerCase("ko-KR").includes(normalized)) return true;
  if (item.hint?.toLocaleLowerCase("ko-KR").includes(normalized)) return true;
  return item.keywords.some((keyword) =>
    keyword.toLocaleLowerCase("ko-KR").includes(normalized),
  );
}

function buildCatalog(): readonly StudioObjectInsertItem[] {
  const primitives = (Object.keys(PRIMITIVE_DEFS) as BgPrimitiveKind[]).map(
    (kind) => {
      const def = PRIMITIVE_DEFS[kind];
      return Object.freeze({
        id: `obj-prim-${kind}`,
        kind: "bg3d-primitive" as const,
        sourceId: kind,
        label: def.label,
        family: "primitive" as const,
        familyLabel: SCENE_FAMILY_LABEL.primitive,
        keywords: Object.freeze([kind, def.label, "3d", "입체", "primitive"]),
        hint: "BG3D 블록아웃 도형으로 스폰합니다.",
        openTarget: "bg3d-editor" as const,
        defaultWidth: 320,
        defaultHeight: 320,
      });
    },
  );

  const props = VRM_PROPS.map((prop) => {
    const family = PROP_FAMILY[prop.category];
    const assetUrl = prop.geometrySource.kind === "gltf" ? prop.geometrySource.url : undefined;
    const thumbnailUrl = assetUrl?.startsWith("/assets/3d/refined-v8/")
      ? `/assets/3d/refined-v8/thumbnails/${assetUrl.slice("/assets/3d/refined-v8/".length, -".glb".length)}.png`
      : undefined;
    return Object.freeze({
      id: `obj-prop-${prop.id}`,
      kind: "vrm-prop" as const,
      sourceId: prop.id,
      label: prop.label,
      family,
      familyLabel: PROP_CATEGORY_LABELS[prop.category],
      keywords: Object.freeze([
        prop.id,
        prop.label,
        prop.category,
        PROP_CATEGORY_LABELS[prop.category],
        "소품",
        "prop",
        "3d",
      ]),
      hint: prop.hint,
      openTarget: "vrm-poser" as const,
      defaultWidth: 280,
      defaultHeight: 280,
      ...(assetUrl ? { assetUrl } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    });
  });

  const scenes = SCENE_TEMPLATE_INDEX.map((template) => {
    const family = SCENE_FAMILY[template.category] ?? "scene-interior";
    return Object.freeze({
      id: `obj-scene-${template.id}`,
      kind: "bg3d-scene-template" as const,
      sourceId: template.id,
      label: template.label,
      family,
      familyLabel: SCENE_FAMILY_LABEL[family],
      keywords: Object.freeze([
        template.id,
        template.label,
        template.category,
        ...template.keywords,
        "씬",
        "배경",
        "3d",
        "template",
      ]),
      hint: "BG3D 씬 템플릿을 한 번에 배치합니다.",
      openTarget: "bg3d-templates" as const,
      defaultWidth: 720,
      defaultHeight: 480,
      assetUrl: template.assetUrl,
      thumbnailUrl: template.thumbnailUrl,
    });
  });

  const sceneFurniture = [
    ...REFINED_V8_SCENE_FURNITURE_INDEX.map((item) =>
      Object.freeze({
        id: `obj-furniture-${item.id}_v8`,
        kind: "bg3d-scene-prop" as const,
        sourceId: `${item.id}_v8`,
        label: item.label,
        family: "scene-furniture" as const,
        familyLabel: SCENE_FAMILY_LABEL["scene-furniture"],
        keywords: Object.freeze([
          item.id,
          `${item.id}_v8`,
          item.label,
          ...item.keywords,
          "가구",
          "소품",
          "배경",
          "3d",
        ]),
        hint: item.hint,
        openTarget: "bg3d-editor" as const,
        defaultWidth: 360,
        defaultHeight: 360,
        assetUrl: `/assets/3d/refined-v8/${item.id}.glb`,
        thumbnailUrl: `/assets/3d/refined-v8/thumbnails/${item.id}.png`,
      }),
    ),
    ...CREATOR_ESSENTIALS_SCENE_PROP_INDEX.map((item) =>
      Object.freeze({
        id: `obj-furniture-ce_${item.id}`,
        kind: "bg3d-scene-prop" as const,
        sourceId: `ce_${item.id}`,
        label: item.label,
        family: "scene-furniture" as const,
        familyLabel: SCENE_FAMILY_LABEL["scene-furniture"],
        keywords: Object.freeze([
          item.id,
          `ce_${item.id}`,
          item.label,
          ...item.keywords,
          "가구",
          "소품",
          "배경",
          "3d",
        ]),
        hint: item.hint,
        openTarget: "bg3d-editor" as const,
        defaultWidth: 360,
        defaultHeight: 360,
        assetUrl: `/creator-essentials/prop-${item.id}.glb`,
        thumbnailUrl: `/creator-essentials/prop-${item.id}.preview.png`,
      }),
    ),
    ...POLYHAVEN_SCENE_PROP_INDEX.map((item) =>
      Object.freeze({
        id: `obj-furniture-ph_${item.id}`,
        kind: "bg3d-scene-prop" as const,
        sourceId: `ph_${item.id}`,
        label: item.label,
        family: "scene-furniture" as const,
        familyLabel: SCENE_FAMILY_LABEL["scene-furniture"],
        keywords: Object.freeze([
          item.id,
          `ph_${item.id}`,
          item.slug,
          item.label,
          ...item.keywords,
          "가구",
          "소품",
          "배경",
          "3d",
        ]),
        hint: item.hint,
        openTarget: "bg3d-editor" as const,
        defaultWidth: 360,
        defaultHeight: 360,
        assetUrl: `/assets/studio/cc0-20260906/assets/${item.slug}/${item.file}`,
        thumbnailUrl: `/assets/studio/cc0-20260906/previews/${item.slug}.png`,
      }),
    ),
    ...KENNEY_BLOCKOUT_SCENE_PROP_INDEX.map((item) =>
      Object.freeze({
        id: `obj-furniture-kn_${item.id}`,
        kind: "bg3d-scene-prop" as const,
        sourceId: `kn_${item.id}`,
        label: item.label,
        family: "scene-furniture" as const,
        familyLabel: SCENE_FAMILY_LABEL["scene-furniture"],
        keywords: Object.freeze([
          item.id,
          `kn_${item.id}`,
          item.assetId,
          item.label,
          ...item.keywords,
          "가구",
          "소품",
          "배경",
          "3d",
        ]),
        hint: item.hint,
        openTarget: "bg3d-editor" as const,
        defaultWidth: 360,
        defaultHeight: 360,
        assetUrl: `/assets/studio/cc0-20260906/${item.path}`,
        thumbnailUrl: `/assets/studio/cc0-20260906/previews/${item.assetId}.png`,
      }),
    ),
  ];

  return Object.freeze([...primitives, ...sceneFurniture, ...props, ...scenes]);
}

let cachedCatalog: readonly StudioObjectInsertItem[] | null = null;

export function listStudioObjectInsertItems(): readonly StudioObjectInsertItem[] {
  if (!cachedCatalog) cachedCatalog = buildCatalog();
  return cachedCatalog;
}

export function listStudioObjectInsertFamilies(): readonly {
  readonly id: StudioObjectInsertFamily;
  readonly label: string;
  readonly count: number;
}[] {
  const items = listStudioObjectInsertItems();
  const counts = new Map<StudioObjectInsertFamily, number>();
  for (const item of items) {
    counts.set(item.family, (counts.get(item.family) ?? 0) + 1);
  }
  return Object.freeze(
    (Object.keys(SCENE_FAMILY_LABEL) as StudioObjectInsertFamily[]).map(
      (id) =>
        Object.freeze({
          id,
          label: SCENE_FAMILY_LABEL[id],
          count: counts.get(id) ?? 0,
        }),
    ),
  );
}

export function findStudioObjectInsertItem(
  id: string,
): StudioObjectInsertItem | null {
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed) return null;
  return listStudioObjectInsertItems().find((item) => item.id === trimmed) ?? null;
}

export function filterStudioObjectInsertItems(input: {
  readonly query?: string;
  readonly family?: StudioObjectInsertFamily | "all" | null;
  readonly kind?: StudioObjectInsertKind | "all" | null;
  readonly limit?: number;
}): readonly StudioObjectInsertItem[] {
  const normalized = normalizeQuery(input.query ?? "");
  const family = input.family && input.family !== "all" ? input.family : null;
  const kind = input.kind && input.kind !== "all" ? input.kind : null;
  const limit = Math.max(
    1,
    Math.min(500, Math.floor(input.limit ?? 120)),
  );
  const out: StudioObjectInsertItem[] = [];
  for (const item of listStudioObjectInsertItems()) {
    if (family && item.family !== family) continue;
    if (kind && item.kind !== kind) continue;
    if (!matchesQuery(item, normalized)) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return Object.freeze(out);
}

/**
 * Plan a document-space insert plate + tool open target for a catalog item.
 * Mirrors Canva "click element → drop on canvas" without inventing geometry.
 */
export function planStudioObjectInsertPlacement(input: {
  readonly itemId: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly existingCount?: number;
  readonly anchorX?: number;
  readonly anchorY?: number;
}): StudioObjectInsertPlacementPlan | null {
  const item = findStudioObjectInsertItem(input.itemId);
  if (!item) return null;
  const canvasW = Math.max(64, input.canvasWidth);
  const canvasH = Math.max(64, input.canvasHeight);
  const existing = Math.max(0, Math.floor(input.existingCount ?? 0));
  const width = Math.min(item.defaultWidth, canvasW * 0.55);
  const height = Math.min(item.defaultHeight, canvasH * 0.55);
  const jitter = (existing % 5) * 24;
  const fallbackX = (canvasW - width) / 2 + jitter;
  const fallbackY = (canvasH - height) / 2 + (existing % 3) * 18;
  const x = Number.isFinite(input.anchorX)
    ? Math.min(canvasW - width, Math.max(0, input.anchorX! - width / 2))
    : Math.max(0, fallbackX);
  const y = Number.isFinite(input.anchorY)
    ? Math.min(canvasH - height, Math.max(0, input.anchorY! - height / 2))
    : Math.max(0, fallbackY);
  return Object.freeze({
    itemId: item.id,
    openTarget: item.openTarget,
    sourceId: item.sourceId,
    x,
    y,
    width,
    height,
    existingCountHint: existing,
  });
}
