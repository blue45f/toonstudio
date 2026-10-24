import {
  createStudioCc0SceneObjectInstance,
  type StudioCc0Asset,
} from "./studio-cc0-asset-delivery";

/**
 * Studio 3D 다중 오브젝트(Multi-Object) 배치 & 룸 레이아웃 모듈.
 *
 * OBJ/FBX/GLTF 외부 3D 프롭 및 배경 소품(책상, 의자, 침대, 건선, 가로등 등)을
 * 3D 씬 내에 다중 배치하고, 실시간 이동·회전·스케일·바닥 스냅 및 레이아웃 프리셋을 관리한다.
 */

export interface Studio3DObjectInstance {
  readonly id: string;
  readonly modelUrl: string;
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly visible: boolean;
}

export interface StudioRoomLayoutPreset {
  readonly id: string;
  readonly label: string;
  readonly objects: readonly Omit<Studio3DObjectInstance, "id">[];
}

export type Studio3DPropCatalogCategory =
  | "furniture"
  | "street"
  | "food"
  | "fantasy"
  | "scifi"
  | "architecture"
  | "nature"
  | "mannequin";

export const STUDIO_3D_PROP_CATEGORY_LABELS: Readonly<Record<Studio3DPropCatalogCategory, string>> = Object.freeze({
  furniture: "가구·일상",
  street: "거리·배경",
  food: "음식·식기",
  fantasy: "판타지",
  scifi: "SF·사이버",
  architecture: "모듈 건축",
  nature: "자연·식생",
  mannequin: "포즈 마네킹",
});

export interface Studio3DPropCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly category: Studio3DPropCatalogCategory;
  readonly modelUrl:
    | `/assets/3d/${string}.glb`
    | `/assets/studio/cc0-20260906/assets/polyhaven-${string}.glb`
    | `/assets/studio/cc0-20260906/assets/kenney-${string}.glb`
    | `/creator-essentials/prop-${string}.glb`
    | `/creator-essentials/pose-${string}.glb`;
  readonly thumbnailUrl?:
    | `/assets/3d/refined-v8/thumbnails/${string}.png`
    | `/assets/studio/cc0-20260906/previews/polyhaven-${string}.png`
    | `/assets/studio/cc0-20260906/previews/kenney-${string}.png`
    | `/creator-essentials/prop-${string}.preview.png`
    | `/creator-essentials/pose-${string}.preview.svg`;
  readonly defaultPosition: readonly [number, number, number];
  readonly defaultRotation: readonly [number, number, number];
  readonly defaultScale: readonly [number, number, number];
}

/** 룸 및 거리 배경 다중 소품 레이아웃 프리셋. */
export const STUDIO_ROOM_LAYOUT_PRESETS: readonly StudioRoomLayoutPreset[] = [
  {
    id: "classroom",
    label: "교실 레이아웃 (책상 6 + 의자 6 + 칠판)",
    objects: [
      { modelUrl: "/assets/3d/refined-v8/blackboard.glb", name: "칠판", position: [0, 1.5, -4], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/refined-v8/desk.glb", name: "학생 책상 1", position: [-1.2, 0, -1], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/refined-v8/chair.glb", name: "학생 의자 1", position: [-1.2, 0, -0.4], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/refined-v8/desk.glb", name: "학생 책상 2", position: [1.2, 0, -1], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/refined-v8/chair.glb", name: "학생 의자 2", position: [1.2, 0, -0.4], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "cafe",
    label: "카페 레이아웃 (원형 테이블 2 + 소파 + 램프)",
    objects: [
      { modelUrl: "/assets/3d/round_table.glb", name: "원형 테이블 A", position: [-1.5, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/refined-v8/sofa.glb", name: "소파 B", position: [1.5, 0, 0.5], rotation: [0, -1.57, 0], scale: [1, 1, 1], visible: true },
    ],
  },
];

/** Blender 5.2 개선형(refined-v8) 3D 소품 11종 및 전용 썸네일 카탈로그. */
export const STUDIO_REFINED_V8_PROP_CATALOG: readonly Studio3DPropCatalogEntry[] = Object.freeze([
  { id: "v8_blackboard", name: "교실 칠판 (v8)", category: "furniture", modelUrl: "/assets/3d/refined-v8/blackboard.glb", thumbnailUrl: "/assets/3d/refined-v8/thumbnails/blackboard.png", defaultPosition: [0, 1.5, -3.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "v8_desk", name: "학생·사무 책상 (v8)", category: "furniture", modelUrl: "/assets/3d/refined-v8/desk.glb", thumbnailUrl: "/assets/3d/refined-v8/thumbnails/desk.png", defaultPosition: [0, 0, 0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "v8_chair", name: "학생·카페 의자 (v8)", category: "furniture", modelUrl: "/assets/3d/refined-v8/chair.glb", thumbnailUrl: "/assets/3d/refined-v8/thumbnails/chair.png", defaultPosition: [0, 0, 0.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "v8_sofa", name: "라운지 소파 (v8)", category: "furniture", modelUrl: "/assets/3d/refined-v8/sofa.glb", thumbnailUrl: "/assets/3d/refined-v8/thumbnails/sofa.png", defaultPosition: [0, 0, 0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "v8_traffic_light", name: "도시 신호등 (v8)", category: "street", modelUrl: "/assets/3d/refined-v8/traffic_light.glb", thumbnailUrl: "/assets/3d/refined-v8/thumbnails/traffic_light.png", defaultPosition: [2.2, 0, -1.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "v8_mailbox", name: "거리 우편함 (v8)", category: "street", modelUrl: "/assets/3d/refined-v8/mailbox.glb", thumbnailUrl: "/assets/3d/refined-v8/thumbnails/mailbox.png", defaultPosition: [-1.8, 0, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "v8_hanging_sign", name: "매달린 현판 간판 (v8)", category: "street", modelUrl: "/assets/3d/refined-v8/hanging_sign.glb", thumbnailUrl: "/assets/3d/refined-v8/thumbnails/hanging_sign.png", defaultPosition: [0, 2.2, -1.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "v8_bubble_tea", name: "버블티 컵 (v8)", category: "food", modelUrl: "/assets/3d/refined-v8/bubble_tea.glb", thumbnailUrl: "/assets/3d/refined-v8/thumbnails/bubble_tea.png", defaultPosition: [0.25, 0.75, 0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "v8_ice_cream_cone", name: "아이스크림 콘 (v8)", category: "food", modelUrl: "/assets/3d/refined-v8/ice_cream_cone.glb", thumbnailUrl: "/assets/3d/refined-v8/thumbnails/ice_cream_cone.png", defaultPosition: [-0.25, 0.75, 0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "v8_fox_mask", name: "여우 가면 (v8)", category: "fantasy", modelUrl: "/assets/3d/refined-v8/fox_mask.glb", thumbnailUrl: "/assets/3d/refined-v8/thumbnails/fox_mask.png", defaultPosition: [0, 1.2, 0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "v8_robot_pet", name: "SF 로봇 반려견 (v8)", category: "scifi", modelUrl: "/assets/3d/refined-v8/robot_pet.glb", thumbnailUrl: "/assets/3d/refined-v8/thumbnails/robot_pet.png", defaultPosition: [0, 0, 0.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
]);

/** Poly Haven CC0 2K PBR 고해상도 실사 소품·가구·건축·자연물 카탈로그 (141종 전수 + 전용 썸네일). */
export const STUDIO_POLYHAVEN_PBR_PROP_CATALOG: readonly Studio3DPropCatalogEntry[] = Object.freeze([
  // 가구·인테리어 (17종)
  { id: "ph_coffee_table_round", name: "거실 원형 커피 테이블 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-coffee-table-round-01/coffee_table_round_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-coffee-table-round-01.png", defaultPosition: [0, 0, -0.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_side_table", name: "침실 원목 사이드 테이블 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-side-table-01/side_table_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-side-table-01.png", defaultPosition: [1.1, 0, -0.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_rocking_chair", name: "원목 흔들의자 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-rockingchair-01/Rockingchair_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-rockingchair-01.png", defaultPosition: [-1.3, 0, -0.5], defaultRotation: [0, 0.45, 0], defaultScale: [1, 1, 1] },
  { id: "ph_ottoman", name: "브라운 가죽 오토만 스툴 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-ottoman-01/Ottoman_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-ottoman-01.png", defaultPosition: [0.8, 0, 0.4], defaultRotation: [0, -0.3, 0], defaultScale: [1, 1, 1] },
  { id: "ph_gothic_bed", name: "고딕 장식 침대 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-gothicbed-01/GothicBed_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-gothicbed-01.png", defaultPosition: [0, 0, -2.0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_classic_nightstand", name: "클래식 침대 옆 협탁 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-classicnightstand-01/ClassicNightstand_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-classicnightstand-01.png", defaultPosition: [-1.2, 0, -1.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_chandelier", name: "실내 장식 샹들리에 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-chandelier-03/Chandelier_03.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-chandelier-03.png", defaultPosition: [0, 2.4, -1.0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_painted_wooden_chair", name: "화이트 페인트 원목 의자 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-painted-wooden-chair-01/painted_wooden_chair_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-painted-wooden-chair-01.png", defaultPosition: [-0.6, 0, 0.3], defaultRotation: [0, 0.25, 0], defaultScale: [1, 1, 1] },
  { id: "ph_dining_chair", name: "브라운 가죽 다이닝 의자 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-dining-chair-02/dining_chair_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-dining-chair-02.png", defaultPosition: [0.6, 0, 0.3], defaultRotation: [0, -0.25, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wooden_picnic_table", name: "공원 피크닉 테이블 벤치 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wooden-picnic-table/wooden_picnic_table.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wooden-picnic-table.png", defaultPosition: [0, 0, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_chinese_sofa", name: "중국풍 목제 소파 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-chinese-sofa/chinese_sofa.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-chinese-sofa.png", defaultPosition: [0, 0, -1.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_vintage_cabinet", name: "클래식 장식 수납장 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-vintage-cabinet-01/vintage_cabinet_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-vintage-cabinet-01.png", defaultPosition: [-1.8, 0, -2.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_desk_lamp_arm", name: "관절형 작업등 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-desk-lamp-arm-01/desk_lamp_arm_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-desk-lamp-arm-01.png", defaultPosition: [0.45, 0.78, -0.6], defaultRotation: [0, -0.4, 0], defaultScale: [1, 1, 1] },
  { id: "ph_steel_frame_shelves", name: "철제 프레임 선반 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-steel-frame-shelves-01/steel_frame_shelves_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-steel-frame-shelves-01.png", defaultPosition: [1.6, 0, -2.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_modern_arm_chair", name: "모던 암체어 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-modern-arm-chair-01/modern_arm_chair_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-modern-arm-chair-01.png", defaultPosition: [-1.1, 0, -0.4], defaultRotation: [0, 0.35, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wooden_table", name: "원목 다이닝 테이블 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wooden-table-02/wooden_table_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wooden-table-02.png", defaultPosition: [0, 0, -0.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_sofa_02", name: "패브릭 3인용 소파 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-sofa-02/sofa_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-sofa-02.png", defaultPosition: [0, 0, -1.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  // 음식·식기 (6종)
  { id: "ph_croissant", name: "카페 크루아상 빵 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-croissant/croissant.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-croissant.png", defaultPosition: [0.15, 0.78, -0.25], defaultRotation: [0, -0.3, 0], defaultScale: [1, 1, 1] },
  { id: "ph_pomegranate", name: "석류 과일 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-food-pomegranate-01/food_pomegranate_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-food-pomegranate-01.png", defaultPosition: [0, 0.78, -0.4], defaultRotation: [0, 0.15, 0], defaultScale: [1, 1, 1] },
  { id: "ph_lemon", name: "레몬 과일 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-lemon/lemon.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-lemon.png", defaultPosition: [0.28, 0.78, -0.35], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_carrot_cake", name: "카페 당근 케이크 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-carrot-cake/carrot_cake.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-carrot-cake.png", defaultPosition: [-0.2, 0.78, -0.3], defaultRotation: [0, 0.2, 0], defaultScale: [1, 1, 1] },
  { id: "ph_jug", name: "도자기 저그 주전자 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-jug-01/jug_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-jug-01.png", defaultPosition: [0.35, 0.78, -0.25], defaultRotation: [0, 0.4, 0], defaultScale: [1, 1, 1] },
  { id: "ph_tea_set", name: "클래식 다기 세트 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-tea-set-01/tea_set_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-tea-set-01.png", defaultPosition: [-0.3, 0.78, -0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  // 거리·판타지 소품 (5종)
  { id: "ph_cardboard_box", name: "택배 골판지 상자 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-cardboard-box-01/cardboard_box_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-cardboard-box-01.png", defaultPosition: [-1.4, 0, -1.0], defaultRotation: [0, 0.3, 0], defaultScale: [1, 1, 1] },
  { id: "ph_treasure_chest", name: "금속 장식 보물상자 (Poly Haven)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-treasure-chest/treasure_chest.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-treasure-chest.png", defaultPosition: [0, 0, -1.5], defaultRotation: [0, 0.25, 0], defaultScale: [1, 1, 1] },
  { id: "ph_fire_hydrant", name: "거리 소화전 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-fire-hydrant/fire_hydrant.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-fire-hydrant.png", defaultPosition: [1.9, 0, -0.8], defaultRotation: [0, -0.4, 0], defaultScale: [1, 1, 1] },
  { id: "ph_street_lamp", name: "클래식 가로등 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-street-lamp-01/street_lamp_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-street-lamp-01.png", defaultPosition: [-1.9, 0, -1.1], defaultRotation: [0, 0.15, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wine_barrel", name: "오크 와인 배럴 통 (Poly Haven)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wine-barrel-01/wine_barrel_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wine-barrel-01.png", defaultPosition: [1.5, 0, -1.6], defaultRotation: [0, 0.2, 0], defaultScale: [1, 1, 1] },
  // 자연·식생 (8종)
  { id: "ph_rock_moss_01", name: "황갈색 이끼 바위 세트 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-rock-moss-set-01/rock_moss_set_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-rock-moss-set-01.png", defaultPosition: [-2.0, 0, -1.8], defaultRotation: [0, 0.35, 0], defaultScale: [1, 1, 1] },
  { id: "ph_rock_moss_02", name: "회색 이끼 바위 세트 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-rock-moss-set-02/rock_moss_set_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-rock-moss-set-02.png", defaultPosition: [2.2, 0, -2.4], defaultRotation: [0, -0.4, 0], defaultScale: [1, 1, 1] },
  { id: "ph_fern", name: "양치식물 고사리 수풀 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-fern-02/fern_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-fern-02.png", defaultPosition: [-1.2, 0, -1.1], defaultRotation: [0, 0.2, 0], defaultScale: [1, 1, 1] },
  { id: "ph_shrub_sorrel", name: "괭이밥 야생 수풀 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-shrub-sorrel-01/shrub_sorrel_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-shrub-sorrel-01.png", defaultPosition: [0.9, 0, -0.9], defaultRotation: [0, -0.15, 0], defaultScale: [1, 1, 1] },
  { id: "ph_dead_tree_trunk", name: "쓰러진 고목 줄기 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-dead-tree-trunk-02/dead_tree_trunk_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-dead-tree-trunk-02.png", defaultPosition: [-2.4, 0, -2.8], defaultRotation: [0, 0.3, 0], defaultScale: [1, 1, 1] },
  { id: "ph_potted_plant_01", name: "테라코타 관엽 화분 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-potted-plant-01/potted_plant_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-potted-plant-01.png", defaultPosition: [-0.6, 0, -0.7], defaultRotation: [0, 0.5, 0], defaultScale: [1, 1, 1] },
  { id: "ph_potted_plant_02", name: "실내 대형 관엽 화분 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-potted-plant-02/potted_plant_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-potted-plant-02.png", defaultPosition: [1.6, 0, -1.8], defaultRotation: [0, -0.25, 0], defaultScale: [1, 1, 1] },
  { id: "ph_potted_plant_04", name: "모던 세라믹 화분 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-potted-plant-04/potted_plant_04.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-potted-plant-04.png", defaultPosition: [1.8, 0, -2.2], defaultRotation: [0, 0.1, 0], defaultScale: [1, 1, 1] },
  // 추가 Poly Haven 2K PBR CC0 실사 에셋 (105종 — 전체 141종 100% 완비)
  { id: "ph_coffeecart_01", name: "이동식 커피 카트 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-coffeecart-01/CoffeeCart_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-coffeecart-01.png", defaultPosition: [0, 0, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_cashregister_01", name: "빈티지 금전등록기 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-cashregister-01/CashRegister_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-cashregister-01.png", defaultPosition: [0.2, 0.78, -0.3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_schooldesk_01", name: "원목 학교 책상 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-schooldesk-01/SchoolDesk_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-schooldesk-01.png", defaultPosition: [0, 0, -0.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_schoolchair_01", name: "원목 학교 의자 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-schoolchair-01/SchoolChair_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-schoolchair-01.png", defaultPosition: [0, 0, 0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_barbershopchair_01", name: "클래식 바버샵 체어 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-barbershopchair-01/BarberShopChair_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-barbershopchair-01.png", defaultPosition: [0, 0, -0.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_television_01", name: "브라운관 레트로 TV 01 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-television-01/Television_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-television-01.png", defaultPosition: [0, 0.78, -0.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_lantern_01", name: "휴대용 철제 랜턴 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-lantern-01/Lantern_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-lantern-01.png", defaultPosition: [0.4, 0, -0.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wetfloorsign_01", name: "미끄럼 주의 표지판 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wetfloorsign-01/WetFloorSign_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wetfloorsign-01.png", defaultPosition: [0.8, 0, -0.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_ukulele_01", name: "어쿠스틱 우쿨렐레 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-ukulele-01/Ukulele_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-ukulele-01.png", defaultPosition: [-0.3, 0.78, -0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_drill_01", name: "전동 핸드 드릴 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-drill-01/Drill_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-drill-01.png", defaultPosition: [0.3, 0.78, -0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_megaphone_01", name: "휴대용 확성기 메가폰 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-megaphone-01/Megaphone_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-megaphone-01.png", defaultPosition: [-0.25, 0.78, -0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_power_box_01", name: "외벽 배전반 박스 (Poly Haven)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-power-box-01/power_box_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-power-box-01.png", defaultPosition: [1.8, 1.2, -2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_utility_box_02", name: "거리 다용도 배전함 (Poly Haven)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-utility-box-02/utility_box_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-utility-box-02.png", defaultPosition: [-1.8, 0, -1.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_metal_trash_can", name: "거리 철제 휴지통 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-metal-trash-can/metal_trash_can.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-metal-trash-can.png", defaultPosition: [1.4, 0, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_concrete_road_barrier", name: "콘크리트 도로 방호벽 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-concrete-road-barrier/concrete_road_barrier.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-concrete-road-barrier.png", defaultPosition: [0, 0, -2.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_covered_car", name: "방수포 덮인 승용차 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-covered-car/covered_car.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-covered-car.png", defaultPosition: [0, 0, -2.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_rollershutter_window_01", name: "롤러셔터 상가 창문 (Poly Haven)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-rollershutter-window-01/rollershutter_window_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-rollershutter-window-01.png", defaultPosition: [0, 1.4, -2.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_old_tyre", name: "폐타이어 바리케이드 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-old-tyre/old_tyre.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-old-tyre.png", defaultPosition: [-1.4, 0, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_metal_tool_chest", name: "금속 정비 공구함 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-metal-tool-chest/metal_tool_chest.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-metal-tool-chest.png", defaultPosition: [0.9, 0.78, -0.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wooden_bucket_02", name: "전통 나무 물양동이 (Poly Haven)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wooden-bucket-02/wooden_bucket_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wooden-bucket-02.png", defaultPosition: [-0.9, 0, -1], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wicker_basket_01", name: "라탄 등나무 바구니 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wicker-basket-01/wicker_basket_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wicker-basket-01.png", defaultPosition: [0.5, 0, -0.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_throw_pillows_01", name: "소파 쿠션 베개 세트 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-throw-pillows-01/throw_pillows_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-throw-pillows-01.png", defaultPosition: [0, 0.45, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_rubber_duck_toy", name: "욕실 러버덕 장난감 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-rubber-duck-toy/rubber_duck_toy.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-rubber-duck-toy.png", defaultPosition: [0.15, 0.78, -0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_baseball_01", name: "가죽 야구공 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-baseball-01/baseball_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-baseball-01.png", defaultPosition: [-0.15, 0.78, -0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_football", name: "클래식 축구공 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-football/football.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-football.png", defaultPosition: [0.35, 0, 0.3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_food_pears_asian_01", name: "황금 배 과일 세트 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-food-pears-asian-01/food_pears_asian_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-food-pears-asian-01.png", defaultPosition: [0.22, 0.78, -0.3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_concrete_cat_statue", name: "콘크리트 고양이 조각상 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-concrete-cat-statue/concrete_cat_statue.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-concrete-cat-statue.png", defaultPosition: [-0.8, 0, -1], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_horse_statue_01", name: "브론즈 기마 조각상 (Poly Haven)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-horse-statue-01/horse_statue_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-horse-statue-01.png", defaultPosition: [0, 0.78, -0.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wooden_lantern_01", name: "전통 목제 등롱 (Poly Haven)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wooden-lantern-01/wooden_lantern_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wooden-lantern-01.png", defaultPosition: [-1.2, 0, -1.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_painted_wooden_stool", name: "페인트 원목 스툴 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-painted-wooden-stool/painted_wooden_stool.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-painted-wooden-stool.png", defaultPosition: [-0.6, 0, 0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_folding_wooden_stool", name: "접이식 캠핑 원목 스툴 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-folding-wooden-stool/folding_wooden_stool.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-folding-wooden-stool.png", defaultPosition: [0.6, 0, 0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_chinese_cabinet", name: "동양풍 전통 수납장 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-chinese-cabinet/chinese_cabinet.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-chinese-cabinet.png", defaultPosition: [-1.6, 0, -2.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_chinese_commode", name: "동양풍 서랍 화장대 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-chinese-commode/chinese_commode.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-chinese-commode.png", defaultPosition: [1.6, 0, -2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_brass_diya_lantern", name: "황동 디야 등잔 (Poly Haven)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-brass-diya-lantern/brass_diya_lantern.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-brass-diya-lantern.png", defaultPosition: [0.2, 0.78, -0.3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_industrial_wall_lamp", name: "인더스트리얼 벽등 (Poly Haven)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-industrial-wall-lamp/industrial_wall_lamp.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-industrial-wall-lamp.png", defaultPosition: [0, 1.9, -2.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_mantel_clock_01", name: "벽난로 탁상시계 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-mantel-clock-01/mantel_clock_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-mantel-clock-01.png", defaultPosition: [0, 0.95, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wall_clock", name: "원형 벽걸이 시계 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wall-clock/wall_clock.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wall-clock.png", defaultPosition: [0, 1.8, -2.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wooden_display_shelves_01", name: "원목 진열 선반장 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wooden-display-shelves-01/wooden_display_shelves_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wooden-display-shelves-01.png", defaultPosition: [-1.7, 0, -2.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_ceramic_vase_04", name: "세라믹 꽃병 04 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-ceramic-vase-04/ceramic_vase_04.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-ceramic-vase-04.png", defaultPosition: [0.25, 0.78, -0.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_ceramic_vase_03", name: "세라믹 꽃병 03 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-ceramic-vase-03/ceramic_vase_03.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-ceramic-vase-03.png", defaultPosition: [-0.25, 0.78, -0.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_brass_vase_02", name: "황동 장식 화병 02 (Poly Haven)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-brass-vase-02/brass_vase_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-brass-vase-02.png", defaultPosition: [0.3, 0.78, -0.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_brass_vase_01", name: "황동 장식 화병 01 (Poly Haven)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-brass-vase-01/brass_vase_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-brass-vase-01.png", defaultPosition: [-0.3, 0.78, -0.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_hanging_picture_frame_02", name: "벽걸이 클래식 액자 02 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-hanging-picture-frame-02/hanging_picture_frame_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-hanging-picture-frame-02.png", defaultPosition: [0.8, 1.6, -2.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_security_camera_02", name: "외벽 방범 CCTV 02 (Poly Haven)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-security-camera-02/security_camera_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-security-camera-02.png", defaultPosition: [1.9, 2.2, -2.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_vintage_radio_transceiver", name: "빈티지 무전 송수신기 (Poly Haven)", category: "scifi", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-vintage-radio-transceiver/vintage_radio_transceiver.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-vintage-radio-transceiver.png", defaultPosition: [0.2, 0.78, -0.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_painted_wooden_cabinet_02", name: "화이트 페인트 수납장 02 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-painted-wooden-cabinet-02/painted_wooden_cabinet_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-painted-wooden-cabinet-02.png", defaultPosition: [1.5, 0, -2.1], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_brass_pan_01", name: "황동 요리 팬 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-brass-pan-01/brass_pan_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-brass-pan-01.png", defaultPosition: [0.2, 0.78, -0.3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_food_lime_01", name: "라임 과일 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-food-lime-01/food_lime_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-food-lime-01.png", defaultPosition: [-0.15, 0.78, -0.25], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_fire_alarm", name: "비상 화재경보기 (Poly Haven)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-fire-alarm/fire_alarm.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-fire-alarm.png", defaultPosition: [-1.6, 1.5, -2.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_water_manhole_cover", name: "주철 맨홀 뚜껑 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-water-manhole-cover/water_manhole_cover.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-water-manhole-cover.png", defaultPosition: [0, 0.01, 0.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_binder_notebook", name: "바인더 업무 노트 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-binder-notebook/binder_notebook.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-binder-notebook.png", defaultPosition: [-0.2, 0.78, -0.15], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wooden_crate_01", name: "화물 목상자 01 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wooden-crate-01/wooden_crate_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wooden-crate-01.png", defaultPosition: [-1.5, 0, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wooden_crate_02", name: "화물 목상자 02 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wooden-crate-02/wooden_crate_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wooden-crate-02.png", defaultPosition: [1.5, 0, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_boulder_01", name: "자연 화강암 바위 01 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-boulder-01/boulder_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-boulder-01.png", defaultPosition: [-2.2, 0, -2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_namaqualand_boulder_02", name: "나마콸란드 적갈색 바위 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-namaqualand-boulder-02/namaqualand_boulder_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-namaqualand-boulder-02.png", defaultPosition: [2.1, 0, -2.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_tree_stump_01", name: "베어진 나무 밑동 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-tree-stump-01/tree_stump_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-tree-stump-01.png", defaultPosition: [-1.4, 0, -1.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_dead_tree_trunk", name: "고사목 나무 줄기 01 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-dead-tree-trunk/dead_tree_trunk.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-dead-tree-trunk.png", defaultPosition: [2, 0, -2.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_plastic_monobloc_chair_01", name: "편의점 플라스틱 의자 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-plastic-monobloc-chair-01/plastic_monobloc_chair_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-plastic-monobloc-chair-01.png", defaultPosition: [-0.7, 0, 0.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_mid_century_lounge_chair", name: "미드센추리 라운지 체어 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-mid-century-lounge-chair/mid_century_lounge_chair.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-mid-century-lounge-chair.png", defaultPosition: [0.9, 0, -0.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wooden_stool_02", name: "원목 공방 스툴 02 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wooden-stool-02/wooden_stool_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wooden-stool-02.png", defaultPosition: [-0.5, 0, 0.3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wooden_stool_01", name: "원목 공방 스툴 01 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wooden-stool-01/wooden_stool_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wooden-stool-01.png", defaultPosition: [0.5, 0, 0.3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_round_wooden_table_01", name: "원목 라운드 테이블 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-round-wooden-table-01/round_wooden_table_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-round-wooden-table-01.png", defaultPosition: [0, 0, -0.7], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_cassette_player", name: "레트로 카세트 플레이어 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-cassette-player/cassette_player-mobile-v1.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-cassette-player.png", defaultPosition: [0.25, 0.78, -0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_painted_wooden_sofa", name: "페인트 원목 소파 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-painted-wooden-sofa/painted_wooden_sofa.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-painted-wooden-sofa.png", defaultPosition: [0, 0, -1.7], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_painted_wooden_bench", name: "페인트 원목 벤치 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-painted-wooden-bench/painted_wooden_bench.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-painted-wooden-bench.png", defaultPosition: [0, 0, -1.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_painted_wooden_cabinet", name: "페인트 원목 장식장 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-painted-wooden-cabinet/painted_wooden_cabinet.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-painted-wooden-cabinet.png", defaultPosition: [-1.6, 0, -2.1], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_vintage_day_bed", name: "빈티지 데이베드 침대 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-vintage-day-bed/vintage_day_bed.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-vintage-day-bed.png", defaultPosition: [0, 0, -1.9], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_old_bed_frame", name: "앤티크 철제 침대 프레임 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-old-bed-frame/old_bed_frame.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-old-bed-frame.png", defaultPosition: [0, 0, -2.1], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_street_lamp_02", name: "유럽풍 주철 가로등 02 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-street-lamp-02/street_lamp_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-street-lamp-02.png", defaultPosition: [2, 0, -1.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_ornate_mirror_01", name: "바로크 금장 거울 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-ornate-mirror-01/ornate_mirror_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-ornate-mirror-01.png", defaultPosition: [0, 1.5, -2.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_alarm_clock_01", name: "트윈벨 자명종 시계 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-alarm-clock-01/alarm_clock_01-alpha-restored-v1.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-alarm-clock-01.png", defaultPosition: [-0.35, 0.78, -0.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_vintage_grandfather_clock_01", name: "빈티지 대형 괘종시계 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-vintage-grandfather-clock-01/vintage_grandfather_clock_01-alpha-restored-v1.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-vintage-grandfather-clock-01.png", defaultPosition: [-1.9, 0, -2.3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_antique_ceramic_vase_01", name: "앤티크 도자기 화병 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-antique-ceramic-vase-01/antique_ceramic_vase_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-antique-ceramic-vase-01.png", defaultPosition: [0.35, 0.78, -0.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_ceramic_vase_02", name: "세라믹 꽃병 02 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-ceramic-vase-02/ceramic_vase_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-ceramic-vase-02.png", defaultPosition: [0.15, 0.78, -0.45], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_brass_vase_03", name: "황동 장식 화병 03 (Poly Haven)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-brass-vase-03/brass_vase_03.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-brass-vase-03.png", defaultPosition: [-0.2, 0.78, -0.45], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_ceramic_vase_01", name: "세라믹 꽃병 01 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-ceramic-vase-01/ceramic_vase_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-ceramic-vase-01.png", defaultPosition: [-0.15, 0.78, -0.45], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_fancy_picture_frame_01", name: "클래식 명화 액자 01 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-fancy-picture-frame-01/fancy_picture_frame_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-fancy-picture-frame-01.png", defaultPosition: [-0.9, 1.6, -2.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_fancy_picture_frame_02", name: "클래식 명화 액자 02 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-fancy-picture-frame-02/fancy_picture_frame_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-fancy-picture-frame-02.png", defaultPosition: [0.9, 1.6, -2.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_vintage_suitcase", name: "빈티지 가죽 여행가방 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-vintage-suitcase/vintage_suitcase.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-vintage-suitcase.png", defaultPosition: [-0.8, 0, -0.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_vintage_telephone_wall_clock", name: "벽걸이 전화기·시계 세트 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-vintage-telephone-wall-clock/vintage_telephone_wall_clock-alpha-restored-v1.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-vintage-telephone-wall-clock.png", defaultPosition: [-1.4, 1.5, -2.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_security_camera_01", name: "실내외 방범 CCTV 01 (Poly Haven)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-security-camera-01/security_camera_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-security-camera-01.png", defaultPosition: [-1.9, 2.2, -2.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_boombox", name: "힙합 스트리트 붐박스 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-boombox/boombox.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-boombox.png", defaultPosition: [0.4, 0.78, -0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_television_02", name: "레트로 다이얼 TV 02 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-television-02/television_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-television-02.png", defaultPosition: [-0.6, 0.78, -0.9], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_carved_wooden_plate", name: "수공예 목각 접시 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-carved-wooden-plate/carved_wooden_plate.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-carved-wooden-plate.png", defaultPosition: [0, 0.78, -0.25], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_brass_goblets", name: "황동 성배 잔 세트 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-brass-goblets/brass_goblets-mobile-v1.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-brass-goblets.png", defaultPosition: [0.25, 0.78, -0.3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_russian_food_cans_01", name: "보급 통조림 캔 세트 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-russian-food-cans-01/russian_food_cans_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-russian-food-cans-01.png", defaultPosition: [-0.3, 0.78, -0.35], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_vintage_electric_kettle", name: "빈티지 전기 주전자 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-vintage-electric-kettle/vintage_electric_kettle.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-vintage-electric-kettle.png", defaultPosition: [0.35, 0.78, -0.3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_food_apple_01", name: "홍옥 사과 과일 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-food-apple-01/food_apple_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-food-apple-01.png", defaultPosition: [0.1, 0.78, -0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_hamburger_buns", name: "수제 햄버거 번 빵 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-hamburger-buns/hamburger_buns.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-hamburger-buns.png", defaultPosition: [-0.1, 0.78, -0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_korean_fire_extinguisher_01", name: "한국형 분말 소화기 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-korean-fire-extinguisher-01/korean_fire_extinguisher_01-mobile-v1.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-korean-fire-extinguisher-01.png", defaultPosition: [1.6, 0, -1.9], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_modern_wooden_cabinet", name: "모던 원목 수납장 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-modern-wooden-cabinet/modern_wooden_cabinet.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-modern-wooden-cabinet.png", defaultPosition: [-1.5, 0, -2.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_drawer_cabinet", name: "다단 서랍 수납장 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-drawer-cabinet/drawer_cabinet.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-drawer-cabinet.png", defaultPosition: [1.5, 0, -2.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_signal_flashlight", name: "철도 신호용 손전등 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-signal-flashlight/signal_flashlight.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-signal-flashlight.png", defaultPosition: [0.3, 0.78, -0.15], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_street_rat", name: "골목길 야생 쥐 (Poly Haven)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-street-rat/street_rat.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-street-rat.png", defaultPosition: [0.7, 0, 0.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_large_iron_gate", name: "대형 주철 정문 게이트 (Poly Haven)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-large-iron-gate/large_iron_gate.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-large-iron-gate.png", defaultPosition: [0, 0, -3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_gate_latch_01", name: "철제 대문 걸쇠 장식 (Poly Haven)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-gate-latch-01/gate_latch_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-gate-latch-01.png", defaultPosition: [0.5, 1.1, -2.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_outdoor_table_chair_set_01", name: "야외 테라스 테이블·의자 세트 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-outdoor-table-chair-set-01/outdoor_table_chair_set_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-outdoor-table-chair-set-01.png", defaultPosition: [0, 0, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_modern_ceiling_lamp_01", name: "모던 펜던트 천장등 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-modern-ceiling-lamp-01/modern_ceiling_lamp_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-modern-ceiling-lamp-01.png", defaultPosition: [0, 2.3, -0.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_sofa_03", name: "모던 라운지 소파 03 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-sofa-03/sofa_03.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-sofa-03.png", defaultPosition: [0, 0, -1.7], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_book_encyclopedia_set_01", name: "백과사전 양장본 전집 (Poly Haven)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-book-encyclopedia-set-01/book_encyclopedia_set_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-book-encyclopedia-set-01.png", defaultPosition: [-0.25, 0.78, -0.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wooden_bowl_01", name: "원목 샐러드 볼 01 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wooden-bowl-01/wooden_bowl_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wooden-bowl-01.png", defaultPosition: [0.18, 0.78, -0.28], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_wooden_bowl_02", name: "원목 샐러드 볼 02 (Poly Haven)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wooden-bowl-02/wooden_bowl_02.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-wooden-bowl-02.png", defaultPosition: [-0.18, 0.78, -0.28], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_barrel_03", name: "오크 저장 배럴 통 03 (Poly Haven)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-barrel-03/barrel_03.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-barrel-03.png", defaultPosition: [-1.5, 0, -1.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_modular_street_seating", name: "모듈형 거리 벤치 좌석 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-modular-street-seating.png", defaultPosition: [0, 0, -1.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ph_bench_vice_01", name: "공방 주철 벤치 바이스 (Poly Haven)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-bench-vice-01/bench_vice_01.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/polyhaven-bench-vice-01.png", defaultPosition: [-0.45, 0.78, -0.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
]);

/** Kenney CC0 경량 블록아웃·모듈 건축·탈것·생존·자연물 카탈로그 (9개 팩 대표 45종 + 전용 썸네일). */
export const STUDIO_KENNEY_BLOCKOUT_PROP_CATALOG: readonly Studio3DPropCatalogEntry[] = Object.freeze([
  { id: "kn_city_commercial_building_a", name: "도심 상업 빌딩 A (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-city-commercial/building-a.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-city-commercial-building-a.png", defaultPosition: [-2.2, 0, -3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_city_commercial_building_b", name: "도심 상업 빌딩 B (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-city-commercial/building-b.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-city-commercial-building-b.png", defaultPosition: [0, 0, -3.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_city_commercial_building_c", name: "도심 상업 빌딩 C (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-city-commercial/building-c.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-city-commercial-building-c.png", defaultPosition: [2.2, 0, -3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_city_commercial_building_d", name: "도심 오피스 빌딩 D (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-city-commercial/building-d.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-city-commercial-building-d.png", defaultPosition: [-1.5, 0, -3.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_city_commercial_building_e", name: "도심 코너 상가 빌딩 E (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-city-commercial/building-e.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-city-commercial-building-e.png", defaultPosition: [1.5, 0, -3.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_suburban_building_type_a", name: "교외 단독주택 A (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-suburban/building-type-a.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-suburban-building-type-a.png", defaultPosition: [-2, 0, -2.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_suburban_building_type_b", name: "교외 단독주택 B (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-suburban/building-type-b.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-suburban-building-type-b.png", defaultPosition: [0, 0, -2.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_suburban_building_type_c", name: "교외 2층 주택 C (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-suburban/building-type-c.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-suburban-building-type-c.png", defaultPosition: [2, 0, -2.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_suburban_building_type_d", name: "교외 박공지붕 주택 D (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-suburban/building-type-d.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-suburban-building-type-d.png", defaultPosition: [-1.5, 0, -3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_suburban_building_type_e", name: "교외 차고형 주택 E (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-suburban/building-type-e.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-suburban-building-type-e.png", defaultPosition: [1.5, 0, -3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_roads_traffic_light", name: "교차로 신호등 기둥 (Kenney)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-roads/traffic-light.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-roads-traffic-light.png", defaultPosition: [1.8, 0, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_roads_light_curved", name: "곡선형 도로 가로등 (Kenney)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-roads/light-curved.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-roads-light-curved.png", defaultPosition: [-1.8, 0, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_roads_construction_barrier", name: "도로 공사 바리케이드 (Kenney)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-roads/construction-barrier.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-roads-construction-barrier.png", defaultPosition: [0, 0, -0.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_roads_construction_cone", name: "안전 라바콘 표지 (Kenney)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-roads/construction-cone.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-roads-construction-cone.png", defaultPosition: [0.8, 0, -0.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_roads_dumpster", name: "대형 철제 쓰레기 수거함 (Kenney)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-roads/dumpster.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-roads-dumpster.png", defaultPosition: [-2, 0, -1.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_building_wall_window_square_detailed", name: "사각 창문 블록 벽체 (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-building/wall-window-square-detailed.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-building-wall-window-square-detailed.png", defaultPosition: [0, 0, -2.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_building_wall_doorway_round", name: "아치형 출입문 블록 벽체 (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-building/wall-doorway-round.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-building-wall-doorway-round.png", defaultPosition: [1.5, 0, -2.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_building_stairs_open", name: "오픈형 모듈 계단 (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-building/stairs-open.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-building-stairs-open.png", defaultPosition: [-1.6, 0, -1.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_building_column", name: "석조 원기둥 기둥 (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-building/column.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-building-column.png", defaultPosition: [-1.2, 0, -2.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_building_barricade_doorway_a", name: "출입구 방어 바리케이드 (Kenney)", category: "architecture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-building/barricade-doorway-a.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-building-barricade-doorway-a.png", defaultPosition: [0, 0, -1.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_furniture_bed_bunk", name: "기숙사 2층 침대 (Kenney)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-furniture/bed-bunk.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-furniture-bed-bunk.png", defaultPosition: [-1.4, 0, -1.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_furniture_kitchen_fridge_large", name: "양문형 대형 냉장고 (Kenney)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-furniture/kitchen-fridge-large.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-furniture-kitchen-fridge-large.png", defaultPosition: [1.6, 0, -2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_furniture_kitchen_coffee_machine", name: "에스프레소 커피머신 (Kenney)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-furniture/kitchen-coffee-machine.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-furniture-kitchen-coffee-machine.png", defaultPosition: [0.3, 0.78, -0.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_furniture_laptop", name: "업무용 노트북 PC (Kenney)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-furniture/laptop.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-furniture-laptop.png", defaultPosition: [0, 0.78, -0.3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_furniture_lounge_design_sofa", name: "디자인 라운지 소파 (Kenney)", category: "furniture", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-furniture/lounge-design-sofa.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-furniture-lounge-design-sofa.png", defaultPosition: [0, 0, -1.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_food_cake_birthday", name: "생일 축하 케이크 (Kenney)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-food/cake-birthday.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-food-cake-birthday.png", defaultPosition: [0, 0.78, -0.3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_food_burger_cheese_double", name: "더블 치즈버거 (Kenney)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-food/burger-cheese-double.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-food-burger-cheese-double.png", defaultPosition: [-0.25, 0.78, -0.25], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_food_pizza", name: "이탈리안 피자 한 판 (Kenney)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-food/pizza.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-food-pizza.png", defaultPosition: [0.25, 0.78, -0.25], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_food_sushi_salmon", name: "연어 초밥 플레이트 (Kenney)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-food/sushi-salmon.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-food-sushi-salmon.png", defaultPosition: [-0.2, 0.78, -0.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_food_sundae", name: "파르페 아이스크림 선데 (Kenney)", category: "food", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-food/sundae.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-food-sundae.png", defaultPosition: [0.2, 0.78, -0.4], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_nature_bridge_stone", name: "아치형 개울 돌다리 (Kenney)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-nature/bridge-stone.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-nature-bridge-stone.png", defaultPosition: [0, 0, -1.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_nature_campfire_stones", name: "돌담 야영 모닥불 (Kenney)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-nature/campfire-stones.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-nature-campfire-stones.png", defaultPosition: [0, 0, -0.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_nature_canoe", name: "통나무 카누 보트 (Kenney)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-nature/canoe.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-nature-canoe.png", defaultPosition: [-1.5, 0, -1.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_nature_cactus_tall", name: "사막 대형 선인장 (Kenney)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-nature/cactus-tall.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-nature-cactus-tall.png", defaultPosition: [1.6, 0, -1.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_nature_crop_pumpkin", name: "농장 호박 작물 (Kenney)", category: "nature", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-nature/crop-pumpkin.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-nature-crop-pumpkin.png", defaultPosition: [0.8, 0, -0.9], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_survival_tent_canvas", name: "야영 캔버스 텐트 (Kenney)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-survival/tent-canvas.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-survival-tent-canvas.png", defaultPosition: [-1.6, 0, -2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_survival_workbench_anvil", name: "대장간 모루 작업대 (Kenney)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-survival/workbench-anvil.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-survival-workbench-anvil.png", defaultPosition: [1.4, 0, -1.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_survival_chest", name: "생존 보급품 상자 (Kenney)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-survival/chest.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-survival-chest.png", defaultPosition: [0.6, 0, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_survival_signpost", name: "갈림길 나무 이정표 (Kenney)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-survival/signpost.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-survival-signpost.png", defaultPosition: [-1.2, 0, -1], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_survival_bedroll", name: "야영 침낭 매트 (Kenney)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-survival/bedroll.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-survival-bedroll.png", defaultPosition: [-0.4, 0, -1.1], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_watercraft_boat_house_a", name: "수상 하우스보트 A (Kenney)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-watercraft/boat-house-a.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-watercraft-boat-house-a.png", defaultPosition: [-1.8, 0, -2.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_watercraft_boat_sail_a", name: "항구 돛단배 범선 A (Kenney)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-watercraft/boat-sail-a.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-watercraft-boat-sail-a.png", defaultPosition: [1.8, 0, -2.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_watercraft_boat_fishing_small", name: "소형 어선 보트 (Kenney)", category: "street", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-watercraft/boat-fishing-small.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-watercraft-boat-fishing-small.png", defaultPosition: [0, 0, -2.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_watercraft_boat_row_large", name: "대형 노젓기 목선 (Kenney)", category: "fantasy", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-watercraft/boat-row-large.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-watercraft-boat-row-large.png", defaultPosition: [-1.2, 0, -1.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "kn_watercraft_boat_fan", name: "늪지대 에어보트 (Kenney)", category: "scifi", modelUrl: "/assets/studio/cc0-20260906/assets/kenney-watercraft/boat-fan.glb", thumbnailUrl: "/assets/studio/cc0-20260906/previews/kenney-watercraft-boat-fan.png", defaultPosition: [1.2, 0, -1.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
]);

/** 퍼블릭 번들(`/assets/3d/*.glb`, `/assets/studio/cc0-20260906/assets/{polyhaven,kenney}-*.glb`, `/creator-essentials/{prop,pose}-*.glb`) 배경·거점·인테리어·건축·자연·마네킹 카탈로그 (270종). */
export const STUDIO_BUNDLED_SCENE_PROP_CATALOG: readonly Studio3DPropCatalogEntry[] = Object.freeze([
  ...STUDIO_REFINED_V8_PROP_CATALOG,
  ...STUDIO_POLYHAVEN_PBR_PROP_CATALOG,
  ...STUDIO_KENNEY_BLOCKOUT_PROP_CATALOG,
  { id: "prop_round_table", name: "원형 카페 테이블", category: "furniture", modelUrl: "/assets/3d/round_table.glb", defaultPosition: [0, 0, 0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_school_desk", name: "학교 책상", category: "furniture", modelUrl: "/assets/3d/school_desk.glb", defaultPosition: [0, 0, 0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_grandfather_clock", name: "진자 괘종시계", category: "furniture", modelUrl: "/assets/3d/grandfather_clock.glb", defaultPosition: [-2, 0, -2.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_fireplace", name: "벽난로", category: "furniture", modelUrl: "/assets/3d/fireplace.glb", defaultPosition: [0, 0, -3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_bathtub", name: "욕조", category: "furniture", modelUrl: "/assets/3d/bathtub.glb", defaultPosition: [1.5, 0, -2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_kitchen_stove", name: "4구 가스레인지", category: "furniture", modelUrl: "/assets/3d/kitchen_stove.glb", defaultPosition: [1.8, 0, -2.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_potted_monstera", name: "몬스테라 화분", category: "furniture", modelUrl: "/assets/3d/potted_monstera.glb", defaultPosition: [1.6, 0, -1.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_bonsai_tree", name: "소나무 분재", category: "furniture", modelUrl: "/assets/3d/bonsai_tree.glb", defaultPosition: [-1.2, 0.75, -1], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_wheelchair", name: "어댑티브 전동휠체어", category: "furniture", modelUrl: "/assets/3d/adaptive_power_wheelchair.glb", defaultPosition: [0, 0, 0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_everyday_book", name: "양장 도서", category: "furniture", modelUrl: "/assets/3d/everyday_book.glb", defaultPosition: [0.2, 0.76, 0.1], defaultRotation: [0, 0.3, 0], defaultScale: [1, 1, 1] },
  { id: "prop_everyday_backpack", name: "학생 백팩", category: "furniture", modelUrl: "/assets/3d/everyday_backpack.glb", defaultPosition: [-0.5, 0, 0.5], defaultRotation: [0, 0.4, 0], defaultScale: [1, 1, 1] },
  { id: "prop_shoulder_bag", name: "가죽 숄더백", category: "furniture", modelUrl: "/assets/3d/atelier_shoulder_bag.glb", defaultPosition: [0.4, 0.45, 0.5], defaultRotation: [0, -0.3, 0], defaultScale: [1, 1, 1] },
  { id: "prop_medical_bag", name: "응급 의료 가방", category: "furniture", modelUrl: "/assets/3d/atelier_medical_bag.glb", defaultPosition: [0.6, 0, 0.3], defaultRotation: [0, -0.2, 0], defaultScale: [1, 1, 1] },
  { id: "prop_medical_stethoscope", name: "의료 청진기", category: "furniture", modelUrl: "/assets/3d/medical_stethoscope.glb", defaultPosition: [-0.2, 0.76, 0.15], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_atelier_camera", name: "취재 카메라", category: "furniture", modelUrl: "/assets/3d/atelier_camera.glb", defaultPosition: [0.15, 0.78, 0.2], defaultRotation: [0, -0.35, 0], defaultScale: [1, 1, 1] },
  { id: "prop_atelier_microphone", name: "스튜디오 마이크", category: "furniture", modelUrl: "/assets/3d/atelier_microphone.glb", defaultPosition: [0, 0.85, 0.1], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_atelier_headphones", name: "스튜디오 헤드폰", category: "furniture", modelUrl: "/assets/3d/atelier_headphones.glb", defaultPosition: [-0.3, 0.78, 0.1], defaultRotation: [0, 0.4, 0], defaultScale: [1, 1, 1] },
  { id: "prop_modern_smartphone", name: "모던 스마트폰", category: "furniture", modelUrl: "/assets/3d/modern_smartphone_prop.glb", defaultPosition: [0.28, 0.76, 0.22], defaultRotation: [0, -0.25, 0], defaultScale: [1, 1, 1] },
  { id: "prop_everyday_glasses", name: "클래식 안경", category: "furniture", modelUrl: "/assets/3d/everyday_glasses.glb", defaultPosition: [-0.15, 0.76, 0.22], defaultRotation: [0, 0.2, 0], defaultScale: [1, 1, 1] },
  { id: "prop_everyday_cap", name: "캐주얼 캡모자", category: "furniture", modelUrl: "/assets/3d/everyday_cap.glb", defaultPosition: [-0.35, 0.78, -0.1], defaultRotation: [0, 0.5, 0], defaultScale: [1, 1, 1] },
  { id: "prop_atelier_beret", name: "아틀리에 베레모", category: "furniture", modelUrl: "/assets/3d/atelier_beret.glb", defaultPosition: [0.35, 0.78, -0.1], defaultRotation: [0, -0.4, 0], defaultScale: [1, 1, 1] },
  { id: "prop_atelier_beanie", name: "니트 비니", category: "furniture", modelUrl: "/assets/3d/atelier_beanie.glb", defaultPosition: [0.42, 0.78, -0.15], defaultRotation: [0, 0.2, 0], defaultScale: [1, 1, 1] },
  { id: "prop_atelier_sunglasses", name: "틴트 선글라스", category: "furniture", modelUrl: "/assets/3d/atelier_sunglasses.glb", defaultPosition: [0.1, 0.76, 0.25], defaultRotation: [0, -0.15, 0], defaultScale: [1, 1, 1] },
  { id: "prop_atelier_ribbon", name: "실크 리본 장식", category: "furniture", modelUrl: "/assets/3d/atelier_ribbon.glb", defaultPosition: [-0.1, 0.76, 0.25], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_street_food_cart", name: "노점 포장마차 카트", category: "street", modelUrl: "/assets/3d/street_food_cart.glb", defaultPosition: [0, 0, -1.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_street_lamp", name: "도시 네온 가로등", category: "street", modelUrl: "/assets/3d/street_lamp.glb", defaultPosition: [2.4, 0, -2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_vending_machine", name: "편의점 자판기", category: "street", modelUrl: "/assets/3d/vending_machine.glb", defaultPosition: [-2.2, 0, -2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_ramen_bowl", name: "라면 그릇", category: "food", modelUrl: "/assets/3d/ramen_bowl.glb", defaultPosition: [0, 0.75, 0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_tea_set", name: "다기 티 세트", category: "food", modelUrl: "/assets/3d/tea_set.glb", defaultPosition: [0.4, 0.75, 0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_everyday_mug", name: "세라믹 머그컵", category: "food", modelUrl: "/assets/3d/everyday_mug.glb", defaultPosition: [-0.25, 0.76, 0.18], defaultRotation: [0, 0.4, 0], defaultScale: [1, 1, 1] },
  { id: "prop_paper_lantern", name: "종이 등롱", category: "street", modelUrl: "/assets/3d/paper_lantern.glb", defaultPosition: [0, 2.1, -1], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_royal_throne", name: "황실 왕좌", category: "fantasy", modelUrl: "/assets/3d/royal_throne.glb", defaultPosition: [0, 0, -2.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_magic_chest", name: "마법 보물상자", category: "fantasy", modelUrl: "/assets/3d/fantasy_magic_chest.glb", defaultPosition: [1.4, 0, -1.5], defaultRotation: [0, -0.4, 0], defaultScale: [1, 1, 1] },
  { id: "prop_wishing_well", name: "판타지 소원 우물", category: "fantasy", modelUrl: "/assets/3d/wishing_well.glb", defaultPosition: [-1.8, 0, -1.8], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_campfire", name: "캠핑 모닥불", category: "fantasy", modelUrl: "/assets/3d/campfire.glb", defaultPosition: [0, 0, 0.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_crystal_orb", name: "마법 수정구", category: "fantasy", modelUrl: "/assets/3d/crystal_orb.glb", defaultPosition: [0, 0.9, 0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_magic_staff", name: "발광 수정 지팡이", category: "fantasy", modelUrl: "/assets/3d/magic_staff_crystal.glb", defaultPosition: [0.8, 0.9, -0.6], defaultRotation: [0, 0, 0.15], defaultScale: [1, 1, 1] },
  { id: "prop_magic_wand", name: "별·달 마법 요술봉", category: "fantasy", modelUrl: "/assets/3d/fantasy_magic_wand_staff.glb", defaultPosition: [-0.6, 0.85, -0.4], defaultRotation: [0, 0.2, -0.2], defaultScale: [1, 1, 1] },
  { id: "prop_magic_grimoire", name: "고대 룬 마도서", category: "fantasy", modelUrl: "/assets/3d/magic_grimoire.glb", defaultPosition: [0.25, 0.82, -0.2], defaultRotation: [0.3, -0.2, 0], defaultScale: [1, 1, 1] },
  { id: "prop_rune_shield", name: "고대 룬 방패", category: "fantasy", modelUrl: "/assets/3d/ancient_rune_shield.glb", defaultPosition: [-1.1, 0.9, -1.2], defaultRotation: [0, 0.35, 0], defaultScale: [1, 1, 1] },
  { id: "prop_medieval_greatsword", name: "중세 룬 대검", category: "fantasy", modelUrl: "/assets/3d/medieval_greatsword.glb", defaultPosition: [1.1, 0.9, -1.2], defaultRotation: [0, -0.35, 0], defaultScale: [1, 1, 1] },
  { id: "prop_medieval_shield", name: "중세 기사 방패", category: "fantasy", modelUrl: "/assets/3d/medieval_shield.glb", defaultPosition: [-1.4, 0.85, -1.5], defaultRotation: [0, 0.25, 0], defaultScale: [1, 1, 1] },
  { id: "prop_wizard_hat", name: "펠트 마법사 모자", category: "fantasy", modelUrl: "/assets/3d/wizard_hat.glb", defaultPosition: [0, 1.05, -0.3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_arcade_cabinet", name: "아케이드 게임기", category: "scifi", modelUrl: "/assets/3d/arcade_game_cabinet.glb", defaultPosition: [-1.6, 0, -2.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_neon_bench", name: "카본 네온 벤치", category: "scifi", modelUrl: "/assets/3d/neom_bench_prop.glb", defaultPosition: [0, 0, -1.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_scifi_drone", name: "SF 탐사 드론", category: "scifi", modelUrl: "/assets/3d/scifi_drone_bot.glb", defaultPosition: [1.2, 1.6, -0.8], defaultRotation: [0, -0.5, 0], defaultScale: [1, 1, 1] },
  { id: "prop_mech_turret", name: "메카 에너지 터렛", category: "scifi", modelUrl: "/assets/3d/mech_turret.glb", defaultPosition: [2.0, 0, -1.8], defaultRotation: [0, -0.4, 0], defaultScale: [1, 1, 1] },
  { id: "prop_cyber_hoverbike", name: "사이버 호버바이크", category: "scifi", modelUrl: "/assets/3d/cyberpunk_hoverbike.glb", defaultPosition: [-1.8, 0.2, 0.5], defaultRotation: [0, 0.6, 0], defaultScale: [1, 1, 1] },
  { id: "prop_cyber_motorcycle", name: "사이버펑크 바이크", category: "scifi", modelUrl: "/assets/3d/cyberpunk_motorcycle.glb", defaultPosition: [1.8, 0, 0.5], defaultRotation: [0, -0.6, 0], defaultScale: [1, 1, 1] },
  { id: "prop_steampunk_airship", name: "스팀펑크 비행선", category: "scifi", modelUrl: "/assets/3d/steampunk_airship.glb", defaultPosition: [0, 3.2, -4], defaultRotation: [0, 0.3, 0], defaultScale: [1, 1, 1] },
  { id: "prop_cyber_katana", name: "사이버 카타나", category: "scifi", modelUrl: "/assets/3d/cyber_katana.glb", defaultPosition: [0.7, 0.95, -0.4], defaultRotation: [0, -0.3, 0.25], defaultScale: [1, 1, 1] },
  { id: "prop_cyber_sniper", name: "사이버 저격 소총", category: "scifi", modelUrl: "/assets/3d/cyber_sniper_rifle.glb", defaultPosition: [-0.7, 0.95, -0.4], defaultRotation: [0, 0.3, 0], defaultScale: [1, 1, 1] },
  { id: "prop_scifi_laser_gun", name: "SF 레이저 건", category: "scifi", modelUrl: "/assets/3d/scifi_laser_gun.glb", defaultPosition: [0.4, 0.85, 0.1], defaultRotation: [0, -0.4, 0], defaultScale: [1, 1, 1] },
  { id: "prop_holo_tablet", name: "홀로그램 태블릿", category: "scifi", modelUrl: "/assets/3d/hologram_tablet.glb", defaultPosition: [0, 0.85, 0.2], defaultRotation: [-0.3, 0, 0], defaultScale: [1, 1, 1] },
  { id: "prop_cyber_visor", name: "사이버 헬멧 바이저", category: "scifi", modelUrl: "/assets/3d/cyber_helmet_visor.glb", defaultPosition: [-0.3, 0.9, 0.1], defaultRotation: [0, 0.2, 0], defaultScale: [1, 1, 1] },
  { id: "prop_cyber_glasses", name: "사이버 고글 안경", category: "scifi", modelUrl: "/assets/3d/cyber_glasses.glb", defaultPosition: [0.3, 0.82, 0.15], defaultRotation: [0, -0.2, 0], defaultScale: [1, 1, 1] },
  { id: "prop_tactical_helmet", name: "SF 택티컬 헬멧", category: "scifi", modelUrl: "/assets/3d/tactical_helmet.glb", defaultPosition: [0, 0.95, -0.2], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ce_bench", name: "모듈형 벤치", category: "architecture", modelUrl: "/creator-essentials/prop-bench.glb", thumbnailUrl: "/creator-essentials/prop-bench.preview.png", defaultPosition: [0, 0, 0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ce_bookshelf", name: "모듈형 책장", category: "architecture", modelUrl: "/creator-essentials/prop-bookshelf.glb", thumbnailUrl: "/creator-essentials/prop-bookshelf.preview.png", defaultPosition: [-2, 0, -2.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ce_chair", name: "모듈형 의자", category: "architecture", modelUrl: "/creator-essentials/prop-chair.glb", thumbnailUrl: "/creator-essentials/prop-chair.preview.png", defaultPosition: [0, 0, 0.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ce_desk", name: "모듈형 책상", category: "architecture", modelUrl: "/creator-essentials/prop-desk.glb", thumbnailUrl: "/creator-essentials/prop-desk.preview.png", defaultPosition: [0, 0, 0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ce_doorway", name: "모듈형 출입문 프레임", category: "architecture", modelUrl: "/creator-essentials/prop-doorway.glb", thumbnailUrl: "/creator-essentials/prop-doorway.preview.png", defaultPosition: [2.5, 0, -2], defaultRotation: [0, -1.57, 0], defaultScale: [1, 1, 1] },
  { id: "ce_stairs", name: "모듈형 계단", category: "architecture", modelUrl: "/creator-essentials/prop-stairs.glb", thumbnailUrl: "/creator-essentials/prop-stairs.preview.png", defaultPosition: [-2.8, 0, -1.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ce_streetlamp", name: "모듈형 가로등", category: "architecture", modelUrl: "/creator-essentials/prop-streetlamp.glb", thumbnailUrl: "/creator-essentials/prop-streetlamp.preview.png", defaultPosition: [2.2, 0, 1.5], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "ce_window_wall", name: "모듈형 창문 벽체", category: "architecture", modelUrl: "/creator-essentials/prop-window-wall.glb", thumbnailUrl: "/creator-essentials/prop-window-wall.preview.png", defaultPosition: [0, 0, -3], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "pose_neutral_3d", name: "기본 서기 마네킹", category: "mannequin", modelUrl: "/creator-essentials/pose-neutral-3d.glb", thumbnailUrl: "/creator-essentials/pose-neutral-3d.preview.svg", defaultPosition: [0, 0, 0], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "pose_walking_3d", name: "보행 포즈 마네킹", category: "mannequin", modelUrl: "/creator-essentials/pose-walking-3d.glb", thumbnailUrl: "/creator-essentials/pose-walking-3d.preview.svg", defaultPosition: [-0.8, 0, 0.4], defaultRotation: [0, 0.25, 0], defaultScale: [1, 1, 1] },
  { id: "pose_running_3d", name: "질주 액션 마네킹", category: "mannequin", modelUrl: "/creator-essentials/pose-running-3d.glb", thumbnailUrl: "/creator-essentials/pose-running-3d.preview.svg", defaultPosition: [0.8, 0, 0.2], defaultRotation: [0, -0.35, 0], defaultScale: [1, 1, 1] },
  { id: "pose_seated_3d", name: "착석 포즈 마네킹", category: "mannequin", modelUrl: "/creator-essentials/pose-seated-3d.glb", thumbnailUrl: "/creator-essentials/pose-seated-3d.preview.svg", defaultPosition: [0, 0, 0.6], defaultRotation: [0, 0, 0], defaultScale: [1, 1, 1] },
  { id: "pose_reaching_3d", name: "손 뻗기 마네킹", category: "mannequin", modelUrl: "/creator-essentials/pose-reaching-3d.glb", thumbnailUrl: "/creator-essentials/pose-reaching-3d.preview.svg", defaultPosition: [-0.6, 0, -0.2], defaultRotation: [0, 0.4, 0], defaultScale: [1, 1, 1] },
  { id: "pose_weight_shift_3d", name: "짝다리 체중이동 마네킹", category: "mannequin", modelUrl: "/creator-essentials/pose-weight-shift-3d.glb", thumbnailUrl: "/creator-essentials/pose-weight-shift-3d.preview.svg", defaultPosition: [0.6, 0, -0.3], defaultRotation: [0, -0.2, 0], defaultScale: [1, 1, 1] },
  { id: "pose_crouching_3d", name: "웅크리기 잠입 마네킹", category: "mannequin", modelUrl: "/creator-essentials/pose-crouching-3d.glb", thumbnailUrl: "/creator-essentials/pose-crouching-3d.preview.svg", defaultPosition: [-1.1, 0, -0.5], defaultRotation: [0, 0.5, 0], defaultScale: [1, 1, 1] },
  { id: "pose_arm_extension_3d", name: "팔 뻗기 액션 마네킹", category: "mannequin", modelUrl: "/creator-essentials/pose-arm-extension-3d.glb", thumbnailUrl: "/creator-essentials/pose-arm-extension-3d.preview.svg", defaultPosition: [1.1, 0, -0.4], defaultRotation: [0, -0.45, 0], defaultScale: [1, 1, 1] },
]);

/** 장르별 웹툰 다중 오브젝트 테마 씬 레이아웃 프리셋. */
export const STUDIO_SCENE_PROP_LAYOUT_PRESETS: readonly StudioRoomLayoutPreset[] = Object.freeze([
  {
    id: "street_food_alley",
    label: "야간 포장마차 골목 (포장마차 + 가로등 + 자판기 + 신호등 + 우편함)",
    objects: [
      { modelUrl: "/assets/3d/street_food_cart.glb", name: "노점 포장마차", position: [0, 0, -1.5], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/street_lamp.glb", name: "네온 가로등", position: [2.4, 0, -2.0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/vending_machine.glb", name: "편의점 자판기", position: [-2.3, 0, -2.0], rotation: [0, 0.25, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/refined-v8/traffic_light.glb", name: "도시 신호등", position: [2.8, 0, 0.5], rotation: [0, -0.5, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/refined-v8/mailbox.glb", name: "거리 우편함", position: [-1.8, 0, 0.6], rotation: [0, 0.4, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/refined-v8/hanging_sign.glb", name: "가게 현판", position: [0, 2.2, -1.5], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "fantasy_throne_sanctum",
    label: "판타지 왕좌 성소 (황실 왕좌 + 마법 보물상자 + 소원 우물 + 모닥불)",
    objects: [
      { modelUrl: "/assets/3d/royal_throne.glb", name: "황실 왕좌", position: [0, 0, -3.0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/fantasy_magic_chest.glb", name: "마법 보물상자", position: [1.6, 0, -1.8], rotation: [0, -0.45, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/wishing_well.glb", name: "소원 우물", position: [-1.8, 0, -1.6], rotation: [0, 0.35, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/campfire.glb", name: "성소 화로 모닥불", position: [0, 0, 0.4], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "scifi_cyber_lounge",
    label: "SF 사이버 작전 라운지 (아케이드 + 네온 벤치 + 드론 + 터렛 + 로봇견)",
    objects: [
      { modelUrl: "/assets/3d/arcade_game_cabinet.glb", name: "아케이드 캐비닛", position: [-1.8, 0, -2.2], rotation: [0, 0.3, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/neom_bench_prop.glb", name: "카본 네온 벤치", position: [0, 0, -1.5], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/scifi_drone_bot.glb", name: "탐사 드론", position: [1.1, 1.6, -1.0], rotation: [0, -0.4, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/mech_turret.glb", name: "메카 터렛", position: [2.1, 0, -1.8], rotation: [0, -0.5, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/refined-v8/robot_pet.glb", name: "로봇 반려견", position: [0.6, 0, 0.3], rotation: [0, -0.3, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "cozy_living_kitchen",
    label: "클래식 거실·주방 (벽난로 + 괘종시계 + 화분 + 스토브 + 티세트)",
    objects: [
      { modelUrl: "/assets/3d/fireplace.glb", name: "벽난로", position: [0, 0, -3.0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/grandfather_clock.glb", name: "진자 괘종시계", position: [-2.0, 0, -2.6], rotation: [0, 0.2, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/potted_monstera.glb", name: "몬스테라 화분", position: [1.7, 0, -2.2], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/bonsai_tree.glb", name: "소나무 분재", position: [-1.1, 0.75, -0.8], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/kitchen_stove.glb", name: "4구 레인지", position: [2.4, 0, -1.5], rotation: [0, -1.57, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/tea_set.glb", name: "다기 티 세트", position: [0, 0.75, -0.6], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "dessert_ramen_bar",
    label: "디저트·라멘 테이블 (원형 테이블 + 라면 + 버블티 + 아이스크림 + 등롱)",
    objects: [
      { modelUrl: "/assets/3d/round_table.glb", name: "원형 테이블", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/ramen_bowl.glb", name: "라면 그릇", position: [0, 0.78, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/refined-v8/bubble_tea.glb", name: "버블티", position: [0.32, 0.78, 0.18], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/refined-v8/ice_cream_cone.glb", name: "아이스크림 콘", position: [-0.32, 0.78, 0.18], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/3d/paper_lantern.glb", name: "종이 등롱", position: [0, 2.0, -0.8], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "modular_study_hall",
    label: "모듈형 서재·계단실 (책장 + 창문 벽체 + 출입문 + 계단 + 책상)",
    objects: [
      { modelUrl: "/creator-essentials/prop-window-wall.glb", name: "창문 벽체", position: [0, 0, -3.2], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/creator-essentials/prop-bookshelf.glb", name: "서재 책장", position: [-2.0, 0, -2.6], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/creator-essentials/prop-doorway.glb", name: "출입문 프레임", position: [2.6, 0, -1.8], rotation: [0, -1.57, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/creator-essentials/prop-stairs.glb", name: "실내 계단", position: [-2.8, 0, -0.8], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/creator-essentials/prop-desk.glb", name: "서재 책상", position: [0, 0, -0.8], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/creator-essentials/prop-chair.glb", name: "서재 의자", position: [0, 0, -0.1], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "action_pose_staging",
    label: "다인 포즈 구도 마네킹 (질주 + 손 뻗기 + 웅크리기 + 착석 + 벤치)",
    objects: [
      { modelUrl: "/creator-essentials/pose-running-3d.glb", name: "질주 액션 마네킹", position: [-1.2, 0, 0.4], rotation: [0, 0.45, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/creator-essentials/pose-arm-extension-3d.glb", name: "팔 뻗기 마네킹", position: [1.1, 0, 0.2], rotation: [0, -0.5, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/creator-essentials/pose-crouching-3d.glb", name: "웅크리기 마네킹", position: [-0.4, 0, -0.9], rotation: [0, 0.2, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/creator-essentials/prop-bench.glb", name: "배경 벤치", position: [1.4, 0, -1.6], rotation: [0, -0.25, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/creator-essentials/pose-seated-3d.glb", name: "착석 마네킹", position: [1.4, 0, -1.5], rotation: [0, -0.25, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "polyhaven_cafe_terrace",
    label: "Poly Haven 2K PBR 카페 테라스 (원형 테이블 + 원목 의자 + 다기 세트 + 크루아상 + 관엽 화분)",
    objects: [
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-coffee-table-round-01/coffee_table_round_01.glb", name: "원형 커피 테이블", position: [0, 0, -0.5], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-painted-wooden-chair-01/painted_wooden_chair_01.glb", name: "화이트 원목 의자", position: [-0.7, 0, 0.2], rotation: [0, 0.3, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-tea-set-01/tea_set_01.glb", name: "클래식 다기 세트", position: [-0.15, 0.52, -0.5], rotation: [0, 0.15, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-croissant/croissant.glb", name: "버터 크루아상", position: [0.15, 0.52, -0.45], rotation: [0, -0.25, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-potted-plant-02/potted_plant_02.glb", name: "대형 관엽 화분", position: [-1.6, 0, -1.7], rotation: [0, 0.2, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "polyhaven_forest_camp",
    label: "Poly Haven 2K PBR 숲속 야영지 (쓰러진 고목 + 이끼 바위 + 양치식물 + 야생 수풀 + 와인 배럴)",
    objects: [
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-dead-tree-trunk-02/dead_tree_trunk_02.glb", name: "쓰러진 고목 줄기", position: [-2.4, 0, -2.8], rotation: [0, 0.3, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-rock-moss-set-01/rock_moss_set_01.glb", name: "황갈색 이끼 바위", position: [1.9, 0, -2.0], rotation: [0, -0.35, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-fern-02/fern_02.glb", name: "양치식물 수풀", position: [-1.1, 0, -1.2], rotation: [0, 0.2, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-shrub-sorrel-01/shrub_sorrel_01.glb", name: "괭이밥 야생 수풀", position: [0.4, 0, -0.8], rotation: [0, 0.5, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-wine-barrel-01/wine_barrel_01.glb", name: "오크 와인 배럴 통", position: [1.1, 0, -1.1], rotation: [0, 0.15, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "polyhaven_vintage_living",
    label: "Poly Haven 2K PBR 빈티지 응접실·서재 (중국풍 소파 + 장식 수납장 + 대형 괘종시계 + 샹들리에 + 도자기 화병 + 명화 액자)",
    objects: [
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-chinese-sofa/chinese_sofa.glb", name: "중국풍 목제 소파", position: [0, 0, -1.6], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-vintage-cabinet-01/vintage_cabinet_01.glb", name: "클래식 장식 수납장", position: [-1.8, 0, -2.2], rotation: [0, 0.15, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-vintage-grandfather-clock-01/vintage_grandfather_clock_01-alpha-restored-v1.glb", name: "빈티지 대형 괘종시계", position: [1.8, 0, -2.2], rotation: [0, -0.2, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-chandelier-03/Chandelier_03.glb", name: "실내 장식 샹들리에", position: [0, 2.4, -1.2], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-antique-ceramic-vase-01/antique_ceramic_vase_01.glb", name: "앤티크 도자기 화병", position: [-1.2, 0.78, -1.5], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-fancy-picture-frame-01/fancy_picture_frame_01.glb", name: "클래식 명화 액자", position: [0, 1.6, -2.5], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "polyhaven_gothic_bedroom",
    label: "Poly Haven 2K PBR 고딕 침실·회랑 (고딕 침대 + 클래식 협탁 + 바로크 거울 + 관절 작업등 + 황동 화병)",
    objects: [
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-gothicbed-01/GothicBed_01.glb", name: "고딕 장식 침대", position: [0, 0, -2.0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-classicnightstand-01/ClassicNightstand_01.glb", name: "클래식 침대 협탁", position: [-1.3, 0, -1.8], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-ornate-mirror-01/ornate_mirror_01.glb", name: "바로크 금장 거울", position: [1.5, 1.4, -2.3], rotation: [0, -0.25, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-desk-lamp-arm-01/desk_lamp_arm_01.glb", name: "관절형 작업등", position: [-1.3, 0.75, -1.8], rotation: [0, 0.35, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-brass-vase-03/brass_vase_03.glb", name: "황동 장식 화병", position: [-1.15, 0.75, -1.75], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "polyhaven_workshop_garage",
    label: "Poly Haven 2K PBR 정비소·공방 (금속 공구함 + 벤치 바이스 + 폐타이어 + 신호 손전등 + 한국형 소화기 + 골판지 상자)",
    objects: [
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-metal-tool-chest/metal_tool_chest.glb", name: "금속 정비 공구함", position: [-0.9, 0.78, -1.2], rotation: [0, 0.15, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-bench-vice-01/bench_vice_01.glb", name: "주철 벤치 바이스", position: [0.4, 0.78, -1.1], rotation: [0, -0.2, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-old-tyre/old_tyre.glb", name: "폐타이어", position: [-1.8, 0, -1.5], rotation: [0, 0.4, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-signal-flashlight/signal_flashlight.glb", name: "신호용 손전등", position: [0.1, 0.78, -0.9], rotation: [0, 0.3, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-korean-fire-extinguisher-01/korean_fire_extinguisher_01-mobile-v1.glb", name: "한국형 분말 소화기", position: [1.7, 0, -1.8], rotation: [0, -0.25, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/polyhaven-cardboard-box-01/cardboard_box_01.glb", name: "골판지 보관 상자", position: [1.2, 0, -1.4], rotation: [0, 0.2, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "kenney_city_crossroad",
    label: "Kenney 도심 상가·교차로 블록아웃 (상업 빌딩 A/B + 도로 가로등 + 교차로 신호등 + 공사 바리케이드 + 대형 수거함)",
    objects: [
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-city-commercial/building-a.glb", name: "도심 상업 빌딩 A", position: [-2.0, 0, -3.0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-city-commercial/building-b.glb", name: "도심 상업 빌딩 B", position: [2.0, 0, -3.0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-roads/light-curved.glb", name: "곡선형 도로 가로등", position: [-1.6, 0, -1.2], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-roads/traffic-light.glb", name: "교차로 신호등", position: [1.6, 0, -1.2], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-roads/construction-barrier.glb", name: "공사 바리케이드", position: [0, 0, -0.8], rotation: [0, 0.2, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-roads/dumpster.glb", name: "철제 쓰레기 수거함", position: [-2.4, 0, -1.8], rotation: [0, 0.3, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "kenney_suburban_home",
    label: "Kenney 교외 주택·정원 블록아웃 (단독주택 A/B + 개울 돌다리 + 호박 작물 + 이정표)",
    objects: [
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-suburban/building-type-a.glb", name: "교외 단독주택 A", position: [-1.8, 0, -2.8], rotation: [0, 0.15, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-suburban/building-type-b.glb", name: "교외 단독주택 B", position: [1.8, 0, -2.8], rotation: [0, -0.15, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-nature/bridge-stone.glb", name: "개울 돌다리", position: [0, 0, -1.2], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-nature/crop-pumpkin.glb", name: "정원 호박 작물", position: [-1.0, 0, -0.9], rotation: [0, 0.25, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-survival/signpost.glb", name: "정원 나무 이정표", position: [1.1, 0, -0.9], rotation: [0, -0.25, 0], scale: [1, 1, 1], visible: true },
    ],
  },
  {
    id: "kenney_harbor_survival_camp",
    label: "Kenney 항구·생존 베이스캠프 블록아웃 (하우스보트 + 범선 + 캔버스 텐트 + 대장간 모루 + 돌담 모닥불 + 보급 상자)",
    objects: [
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-watercraft/boat-house-a.glb", name: "수상 하우스보트", position: [-2.0, 0, -2.6], rotation: [0, 0.3, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-watercraft/boat-sail-a.glb", name: "항구 범선", position: [2.0, 0, -2.8], rotation: [0, -0.35, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-survival/tent-canvas.glb", name: "야영 캔버스 텐트", position: [-1.4, 0, -1.4], rotation: [0, 0.2, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-survival/workbench-anvil.glb", name: "대장간 모루 작업대", position: [1.3, 0, -1.4], rotation: [0, -0.2, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-nature/campfire-stones.glb", name: "돌담 야영 모닥불", position: [0, 0, -0.7], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true },
      { modelUrl: "/assets/studio/cc0-20260906/assets/kenney-survival/chest.glb", name: "생존 보급 상자", position: [0.6, 0, -1.1], rotation: [0, -0.3, 0], scale: [1, 1, 1], visible: true },
    ],
  },
]);

const ALL_LAYOUT_PRESETS_BY_ID = new Map<string, StudioRoomLayoutPreset>(
  [...STUDIO_ROOM_LAYOUT_PRESETS, ...STUDIO_SCENE_PROP_LAYOUT_PRESETS].map((preset) => [preset.id, preset] as const),
);

const PROP_CATALOG_BY_ID = new Map<string, Studio3DPropCatalogEntry>(
  STUDIO_BUNDLED_SCENE_PROP_CATALOG.map((entry) => [entry.id, entry] as const),
);

export function findStudio3DPropCatalogEntry(propId: string): Studio3DPropCatalogEntry | null {
  return PROP_CATALOG_BY_ID.get(propId.trim()) ?? null;
}

export function listStudio3DPropCatalogByCategory(
  category: Studio3DPropCatalogCategory | "all" | "refined-v8" | "polyhaven-pbr" | "kenney-blockout" = "all",
): readonly Studio3DPropCatalogEntry[] {
  if (category === "all") return STUDIO_BUNDLED_SCENE_PROP_CATALOG;
  if (category === "refined-v8") return STUDIO_REFINED_V8_PROP_CATALOG;
  if (category === "polyhaven-pbr") return STUDIO_POLYHAVEN_PBR_PROP_CATALOG;
  if (category === "kenney-blockout") return STUDIO_KENNEY_BLOCKOUT_PROP_CATALOG;
  return STUDIO_BUNDLED_SCENE_PROP_CATALOG.filter((entry) => entry.category === category);
}

export class StudioMultiObjectLayoutManager {
  private readonly instances = new Map<string, Studio3DObjectInstance>();

  public addObject(item: Omit<Studio3DObjectInstance, "id">): Studio3DObjectInstance {
    const id = `obj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const instance: Studio3DObjectInstance = { ...item, id };
    this.instances.set(id, instance);
    return instance;
  }

  public addCc0ModelAsset(asset: StudioCc0Asset): Studio3DObjectInstance {
    const converted = createStudioCc0SceneObjectInstance(asset, this.instances.size);
    this.instances.set(converted.id, converted);
    return converted;
  }

  public addCatalogProp(propId: string): Studio3DObjectInstance | null {
    const entry = findStudio3DPropCatalogEntry(propId);
    if (!entry) return null;
    const offsetIndex = this.instances.size % 5;
    const jitterX = (offsetIndex - 2) * 0.25;
    return this.addObject({
      modelUrl: entry.modelUrl,
      name: entry.name,
      position: [
        Math.round((entry.defaultPosition[0] + jitterX) * 100) / 100,
        entry.defaultPosition[1],
        entry.defaultPosition[2],
      ],
      rotation: entry.defaultRotation,
      scale: entry.defaultScale,
      visible: true,
    });
  }

  public updatePosition(id: string, position: readonly [number, number, number]): Studio3DObjectInstance | null {
    const existing = this.instances.get(id);
    if (!existing) return null;
    const updated: Studio3DObjectInstance = { ...existing, position };
    this.instances.set(id, updated);
    return updated;
  }

  public removeObject(id: string): boolean {
    return this.instances.delete(id);
  }

  public duplicateObject(id: string): Studio3DObjectInstance | null {
    const existing = this.instances.get(id);
    if (!existing) return null;

    const newPos: readonly [number, number, number] = [
      existing.position[0] + 0.3,
      existing.position[1],
      existing.position[2] + 0.3,
    ];

    return this.addObject({
      ...existing,
      name: `${existing.name} (복사본)`,
      position: newPos,
    });
  }

  public snapToFloor(id: string): Studio3DObjectInstance | null {
    const existing = this.instances.get(id);
    if (!existing) return null;

    const snapped: Studio3DObjectInstance = {
      ...existing,
      position: [existing.position[0], 0, existing.position[2]],
    };
    this.instances.set(id, snapped);
    return snapped;
  }

  public getAllObjects(): readonly Studio3DObjectInstance[] {
    return Array.from(this.instances.values());
  }

  public loadPreset(presetId: string): readonly Studio3DObjectInstance[] {
    this.instances.clear();
    const preset = ALL_LAYOUT_PRESETS_BY_ID.get(presetId);
    if (!preset) return [];

    for (const obj of preset.objects) {
      this.addObject(obj);
    }
    return this.getAllObjects();
  }
}
