/**
 * Studio BG3D 필수 3D 포즈 마네킹(8종) · 필수 건축 소품(8종) · Refined V8 히어로 소품(11종) ·
 * Blender 5.2 Kitbash V9 고밀도 배경/캐릭터 조형(6종) ·
 * ToonStudio 오리지널 배경/가구/거대 소품(33종) · 오리지널 일상/착용/무기 소품(35종) 통합 카탈로그.
 *
 * `apps/web/public/creator-essentials/*.glb` (16종),
 * `apps/web/public/assets/3d/refined-v8/*.glb` (11종),
 * `apps/web/public/assets/3d/kitbash-v9/*.glb` (6종),
 * `apps/web/public/assets/3d/*.glb` (68종)의 총 101종 CC0-1.0 1st-party GLB 모델을
 * 3D 배경 편집기(BG3D) 에셋 라이브러리에서 원클릭으로 가져와 배치할 수 있게 한다.
 */

export type StudioBg3dEssentialAssetCategory =
  | "pose-3d"
  | "essential-prop-3d"
  | "refined-v8-prop-3d"
  | "kitbash-v9-prop-3d"
  | "original-scene-prop-3d"
  | "original-hand-wear-prop-3d";

export interface StudioBg3dEssentialCategoryMeta {
  readonly id: StudioBg3dEssentialAssetCategory;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
}

export const STUDIO_BG3D_ESSENTIAL_ASSET_CATEGORIES: readonly StudioBg3dEssentialCategoryMeta[] =
  Object.freeze([
    {
      id: "pose-3d",
      labelKo: "인체 포즈 마네킹",
      labelEn: "3D Pose Mannequins",
      descriptionKo: "웹툰 구도·투시 데생 확인용 8종 인체 포즈 마네킹 (3면도 SVG 동반)",
    },
    {
      id: "essential-prop-3d",
      labelKo: "필수 건축 소품",
      labelEn: "Essential Architectural Props",
      descriptionKo: "책상·의자·벤치·책장·가로등·창문벽·문틀·계단 8종 경량 배경 모듈",
    },
    {
      id: "refined-v8-prop-3d",
      labelKo: "고품질 히어로 소품 V8",
      labelEn: "Refined Hero Props V8",
      descriptionKo: "칠판·신호등·우체통·소파·버블티·여우가면·로봇펫 등 11종 디테일 소품",
    },
    {
      id: "kitbash-v9-prop-3d",
      labelKo: "블렌더 킷배시 V9",
      labelEn: "Blender Kitbash V9",
      descriptionKo: "편의점 파사드·전신주 변압기·옥상 공조기·카페 어닝 부스·각성 포털·캐릭터 조형 흉상 6종",
    },
    {
      id: "original-scene-prop-3d",
      labelKo: "배경·가구·거대 소품",
      labelEn: "Original Scene & Furniture Props",
      descriptionKo: "칠판·원형테이블·자판기·포장마차·벽난로·호버바이크·비행선 등 33종 배경 배치용 소품",
    },
    {
      id: "original-hand-wear-prop-3d",
      labelKo: "일상·착용·무기 소품",
      labelEn: "Original Everyday, Wearable & Weapon Props",
      descriptionKo: "스마트폰·머그컵·아틀리에 모자/가방/카메라·사이버 카타나·마법 지팡이 등 35종 소품",
    },
  ]);

export interface StudioBg3dEssentialAssetEntry {
  readonly id: string;
  readonly category: StudioBg3dEssentialAssetCategory;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly glbUrl: string;
  readonly previewUrl: string | null;
  /** 3D 포즈 마네킹 전용 3면도(정면·측면·후면) 데생 가이드 SVG 경로. */
  readonly turnaround2dUrl: string | null;
  readonly fileName: string;
  readonly license: "CC0-1.0";
  readonly tags: readonly string[];
}

type RawAssetRow = readonly [slug: string, labelKo: string, labelEn: string];

const RAW_POSE_ROWS: readonly RawAssetRow[] = [
  ["neutral", "기본 서기 마네킹", "Neutral Standing Pose"],
  ["weight-shift", "한쪽 체중 싣기 마네킹", "Weight Shift Pose"],
  ["walking", "걷기 키 포즈 마네킹", "Walking Key Pose"],
  ["running", "달리기 키 포즈 마네킹", "Running Key Pose"],
  ["seated", "앉기 참고 마네킹", "Seated Study Pose"],
  ["reaching", "위로 팔 뻗기 마네킹", "Overhead Reach Pose"],
  ["crouching", "웅크리기 참고 마네킹", "Crouching Study Pose"],
  ["arm-extension", "옆으로 팔 뻗기 마네킹", "Side Arm Extension Pose"],
];

const RAW_ESSENTIAL_PROP_ROWS: readonly RawAssetRow[] = [
  ["desk", "작업 책상", "Work Desk"],
  ["chair", "등받이 의자", "Slatted Chair"],
  ["bench", "공원 벤치", "Park Bench"],
  ["bookshelf", "모듈 책장", "Modular Bookshelf"],
  ["streetlamp", "거리 가로등", "Street Lamp"],
  ["window-wall", "창문이 있는 벽 모듈", "Window Wall Module"],
  ["doorway", "출입문 틀", "Doorway Frame"],
  ["stairs", "6단 계단 모듈", "Six-Step Staircase"],
];

const RAW_REFINED_V8_ROWS: readonly RawAssetRow[] = [
  ["blackboard", "교실 칠판 (V8)", "Classroom Blackboard V8"],
  ["desk", "교실·서재 책상 (V8)", "Study Desk V8"],
  ["chair", "원목 의자 (V8)", "Wooden Chair V8"],
  ["sofa", "라운지 소파 (V8)", "Lounge Sofa V8"],
  ["hanging_sign", "상점 돌출 간판 (V8)", "Hanging Shop Sign V8"],
  ["traffic_light", "보행자 신호등 (V8)", "Traffic Light V8"],
  ["mailbox", "거리 우체통 (V8)", "Street Mailbox V8"],
  ["bubble_tea", "버블티 컵 (V8)", "Bubble Tea Cup V8"],
  ["ice_cream_cone", "아이스크림 콘 (V8)", "Ice Cream Cone V8"],
  ["fox_mask", "축제 여우 가면 (V8)", "Festival Fox Mask V8"],
  ["robot_pet", "반려 로봇 펫 (V8)", "Companion Robot Pet V8"],
];

const RAW_KITBASH_V9_ROWS: readonly RawAssetRow[] = [
  ["convenience_storefront_v9", "편의점·상가 파사드 모듈 (V9)", "Convenience Storefront Facade V9"],
  ["urban_utility_pole_cluster_v9", "도심 전신주·변압기·가로등 (V9)", "Urban Utility Pole Cluster V9"],
  ["rooftop_hvac_watertank_rig_v9", "옥상 공조기·물탱크·배관 설비 (V9)", "Rooftop HVAC & Water Tank Rig V9"],
  ["cafe_terrace_kiosk_set_v9", "오픈 카페 어닝 부스·테라스 (V9)", "Open Cafe Terrace Kiosk V9"],
  ["arcane_portal_sanctum_v9", "각성 룬 관문·성소 제단 (V9)", "Arcane Portal Sanctum V9"],
  ["stylized_hero_mannequin_bust_v9", "8등신 캐릭터 조형 마네킹 흉상 (V9)", "Stylized Hero Mannequin Bust V9"],
];

const REFINED_V8_THUMBNAIL_SLUGS = new Set(RAW_REFINED_V8_ROWS.map(([slug]) => slug));

const ESSENTIAL_PREVIEW_FALLBACK_BY_SLUG: Readonly<Record<string, string>> = Object.freeze({
  school_desk: "/creator-essentials/prop-desk.preview.png",
  neom_bench_prop: "/creator-essentials/prop-bench.preview.png",
  street_lamp: "/creator-essentials/prop-streetlamp.preview.png",
  royal_throne: "/creator-essentials/prop-chair.preview.png",
});

function resolveOriginal3dPreviewUrl(slug: string): string | null {
  if (REFINED_V8_THUMBNAIL_SLUGS.has(slug)) {
    return `/assets/3d/refined-v8/thumbnails/${slug}.png`;
  }
  return ESSENTIAL_PREVIEW_FALLBACK_BY_SLUG[slug] ?? null;
}

/** `apps/web/public/assets/3d/*.glb` 배경·가구·거대 소품 33종 (Core Furniture v1 5종 포함). */
const RAW_ORIGINAL_SCENE_PROP_ROWS: readonly RawAssetRow[] = [
  ["blackboard", "이동식 교실 칠판", "Mobile Classroom Blackboard"],
  ["desk", "교실·작업용 표준 책상", "Standard Classroom & Work Desk"],
  ["chair", "교실·카페용 표준 의자", "Standard Classroom & Cafe Chair"],
  ["round_table", "카페 원형 테이블", "Cafe Round Table"],
  ["sofa", "2인용 패브릭 소파", "Two-Seater Fabric Sofa"],
  ["school_desk", "수납 선반 학교 책상 v2", "School Desk with Shelf v2"],
  ["vending_machine", "음료 진열 자판기 v2", "Beverage Vending Machine v2"],
  ["fantasy_magic_chest", "룬 보물상자 v2", "Rune Treasure Chest v2"],
  ["adaptive_power_wheelchair", "어댑티브 전동 휠체어", "Adaptive Power Wheelchair"],
  ["neom_bench_prop", "카본 네온 벤치", "Carbon Neon Bench"],
  ["arcade_game_cabinet", "레트로 아케이드 게임기", "Retro Arcade Game Cabinet"],
  ["cyberpunk_hoverbike", "SF 리프트 포드 호버바이크", "Sci-Fi Lift-Pod Hoverbike"],
  ["steampunk_airship", "스팀펑크 프로펠러 비행선", "Steampunk Propeller Airship"],
  ["cyberpunk_motorcycle", "사이버펑크 네온 바이크", "Cyberpunk Neon Motorcycle"],
  ["street_lamp", "쌍등 유리 글로브 가로등", "Twin-Globe Street Lamp"],
  ["royal_throne", "벨벳 쿠션 황실 왕좌", "Velvet Royal Throne"],
  ["scifi_drone_bot", "4기 리프트 링 탐사 드론", "Quad-Ring Sci-Fi Recon Drone"],
  ["bathtub", "실내 욕조", "Indoor Bathtub"],
  ["bonsai_tree", "선반용 분재 나무", "Shelf Bonsai Tree"],
  ["campfire", "야영 모닥불", "Outdoor Campfire"],
  ["fireplace", "벽돌 벽난로", "Hearth Fireplace"],
  ["grandfather_clock", "진자 괘종시계", "Pendulum Grandfather Clock"],
  ["hanging_sign", "가게 돌출 현판", "Hanging Shop Signboard"],
  ["kitchen_stove", "4구 가스레인지 오븐", "Four-Burner Kitchen Stove"],
  ["mailbox", "거리 우편함", "Street Post Mailbox"],
  ["mech_turret", "메카 에너지 터렛", "Mech Energy Turret"],
  ["paper_lantern", "전통 종이 등롱", "Paper Lantern"],
  ["potted_monstera", "인테리어 몬스테라 화분", "Potted Monstera Plant"],
  ["robot_pet", "SF 로봇 반려견", "Sci-Fi Companion Robot Pet"],
  ["street_food_cart", "거리 노점 포장마차", "Street Food Stall Cart"],
  ["tea_set", "찻주전자 티 세트", "Porcelain Tea Set"],
  ["traffic_light", "도시 신호등", "Urban Traffic Light"],
  ["wishing_well", "판타지 소원 우물", "Fantasy Wishing Well"],
];

/** `apps/web/public/assets/3d/*.glb` 일상·착용·무기 소품 35종 (Story/Mapped/Everyday/Atelier/V6). */
const RAW_ORIGINAL_HAND_WEAR_PROP_ROWS: readonly RawAssetRow[] = [
  ["modern_smartphone_prop", "모던 OLED 스마트폰 v2", "Modern OLED Smartphone v2"],
  ["cyber_glasses", "HUD 사이버 고글 안경 v2", "HUD Cyber Visor Glasses v2"],
  ["everyday_mug", "일상 도자기 머그컵", "Everyday Ceramic Mug"],
  ["everyday_book", "일상 하드커버 단행본 책", "Everyday Hardcover Book"],
  ["everyday_cap", "일상 캐주얼 캡모자", "Everyday Casual Baseball Cap"],
  ["everyday_glasses", "일상 뿔테 안경", "Everyday Eyeglasses"],
  ["everyday_backpack", "일상 학생 백팩", "Everyday Student Backpack"],
  ["medical_stethoscope", "의료용 이중 튜빙 청진기", "Medical Dual-Tube Stethoscope"],
  ["atelier_beanie", "아틀리에 니트 비니", "Atelier Knit Beanie"],
  ["atelier_beret", "아틀리에 울 베레모", "Atelier Wool Beret"],
  ["atelier_camera", "아틀리에 미러리스 카메라", "Atelier Mirrorless Camera"],
  ["atelier_headphones", "아틀리에 오버이어 헤드폰", "Atelier Over-Ear Headphones"],
  ["atelier_medical_bag", "아틀리에 응급 의료 가방", "Atelier First-Aid Medical Bag"],
  ["atelier_microphone", "아틀리에 보컬 마이크", "Atelier Vocal Microphone"],
  ["atelier_ribbon", "아틀리에 헤어 리본", "Atelier Hair Ribbon"],
  ["atelier_shoulder_bag", "아틀리에 가죽 숄더백", "Atelier Leather Shoulder Bag"],
  ["atelier_sunglasses", "아틀리에 틴트 선글라스", "Atelier Tinted Sunglasses"],
  ["cyber_katana", "플라즈마 날 사이버 카타나", "Plasma-Edge Cyber Katana"],
  ["magic_staff_crystal", "수정 코어 마법 지팡이", "Crystal-Core Magic Staff"],
  ["cyber_helmet_visor", "센서 모듈 사이버 헬멧 바이저", "Sensor Cyber Helmet Visor"],
  ["hologram_tablet", "투영 코어 홀로그램 태블릿", "Projection Hologram Tablet"],
  ["ancient_rune_shield", "고대 룬 원형 방패", "Ancient Rune Shield"],
  ["medieval_greatsword", "중세 룬 양손 대검", "Medieval Rune Greatsword"],
  ["cyber_sniper_rifle", "광학 조준 사이버 저격 소총", "Optical Cyber Sniper Rifle"],
  ["fantasy_magic_wand_staff", "오각 별 궤도 요술봉", "Star-Ring Fantasy Magic Wand"],
  ["scifi_laser_gun", "플라즈마 코일 SF 레이저 건", "Plasma-Coil Sci-Fi Laser Gun"],
  ["magic_grimoire", "소울 젬 룬 마도서", "Soul-Gem Rune Grimoire"],
  ["medieval_shield", "문장 철제 중세 방패", "Crested Iron Medieval Shield"],
  ["crystal_orb", "이중 궤도 마법 수정구", "Dual-Orbit Crystal Orb"],
  ["tactical_helmet", "장갑판 SF 택티컬 헬멧", "Armored Sci-Fi Tactical Helmet"],
  ["bubble_tea", "타피오카 펄 버블티 컵", "Tapioca Pearl Bubble Tea"],
  ["fox_mask", "축제 전통 여우 가면", "Festival Fox Mask"],
  ["ice_cream_cone", "3단 스쿱 아이스크림 콘", "Triple-Scoop Ice Cream Cone"],
  ["ramen_bowl", "고명 라면 그릇", "Garnished Ramen Bowl"],
  ["wizard_hat", "가죽 밴드 펠트 마법사 모자", "Felt Wizard Hat"],
];

function mapOriginal3dRows(
  rows: readonly RawAssetRow[],
  category: "original-scene-prop-3d" | "original-hand-wear-prop-3d",
  defaultTags: readonly string[],
): readonly StudioBg3dEssentialAssetEntry[] {
  return rows.map(([slug, labelKo, labelEn]): StudioBg3dEssentialAssetEntry => {
    const normalizedSlug = slug.replace(/_/gu, "-");
    return Object.freeze({
      id: `original-3d-${normalizedSlug}`,
      category,
      labelKo,
      labelEn,
      glbUrl: `/assets/3d/${slug}.glb`,
      previewUrl: resolveOriginal3dPreviewUrl(slug),
      turnaround2dUrl: null,
      fileName: `ToonStudio-original-3d-${normalizedSlug}.glb`,
      license: "CC0-1.0",
      tags: Object.freeze([...defaultTags, slug, normalizedSlug, labelKo, labelEn]),
    });
  });
}

export const STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG: readonly StudioBg3dEssentialAssetEntry[] =
  Object.freeze([
    ...RAW_POSE_ROWS.map(([slug, labelKo, labelEn]): StudioBg3dEssentialAssetEntry =>
      Object.freeze({
        id: `pose-${slug}-3d`,
        category: "pose-3d",
        labelKo,
        labelEn,
        glbUrl: `/creator-essentials/pose-${slug}-3d.glb`,
        previewUrl: `/creator-essentials/pose-${slug}-3d.preview.svg`,
        turnaround2dUrl: `/creator-essentials/pose-${slug}-2d.svg`,
        fileName: `ToonStudio-pose-${slug}-3d.glb`,
        license: "CC0-1.0",
        tags: Object.freeze(["character", "pose", "mannequin", "포즈", "마네킹", slug, labelKo, labelEn]),
      }),
    ),
    ...RAW_ESSENTIAL_PROP_ROWS.map(([slug, labelKo, labelEn]): StudioBg3dEssentialAssetEntry =>
      Object.freeze({
        id: `prop-${slug}`,
        category: "essential-prop-3d",
        labelKo,
        labelEn,
        glbUrl: `/creator-essentials/prop-${slug}.glb`,
        previewUrl: `/creator-essentials/prop-${slug}.preview.png`,
        turnaround2dUrl: null,
        fileName: `ToonStudio-prop-${slug}.glb`,
        license: "CC0-1.0",
        tags: Object.freeze(["background", "prop", "essential", "배경", "소품", slug, labelKo, labelEn]),
      }),
    ),
    ...RAW_REFINED_V8_ROWS.map(([slug, labelKo, labelEn]): StudioBg3dEssentialAssetEntry => {
      const normalizedSlug = slug.replace(/_/gu, "-");
      return Object.freeze({
        id: `refined-v8-${normalizedSlug}`,
        category: "refined-v8-prop-3d",
        labelKo,
        labelEn,
        glbUrl: `/assets/3d/refined-v8/${slug}.glb`,
        previewUrl: `/assets/3d/refined-v8/thumbnails/${slug}.png`,
        turnaround2dUrl: null,
        fileName: `ToonStudio-refined-v8-${normalizedSlug}.glb`,
        license: "CC0-1.0",
        tags: Object.freeze(["background", "prop", "refined-v8", "히어로소품", slug, normalizedSlug, labelKo, labelEn]),
      });
    }),
    ...RAW_KITBASH_V9_ROWS.map(([slug, labelKo, labelEn]): StudioBg3dEssentialAssetEntry => {
      const normalizedSlug = slug.replace(/_/gu, "-");
      return Object.freeze({
        id: `kitbash-v9-${normalizedSlug}`,
        category: "kitbash-v9-prop-3d",
        labelKo,
        labelEn,
        glbUrl: `/assets/3d/kitbash-v9/${slug}.glb`,
        previewUrl: `/assets/3d/kitbash-v9/thumbnails/${slug}.png`,
        turnaround2dUrl: null,
        fileName: `ToonStudio-${normalizedSlug}.glb`,
        license: "CC0-1.0",
        tags: Object.freeze(["background", "character", "kitbash-v9", "킷배시", "배경모델링", "캐릭터조형", slug, normalizedSlug, labelKo, labelEn]),
      });
    }),
    ...mapOriginal3dRows(RAW_ORIGINAL_SCENE_PROP_ROWS, "original-scene-prop-3d", [
      "background",
      "furniture",
      "scene-prop",
      "original-3d",
      "가구",
      "배경소품",
    ]),
    ...mapOriginal3dRows(RAW_ORIGINAL_HAND_WEAR_PROP_ROWS, "original-hand-wear-prop-3d", [
      "prop",
      "everyday",
      "wearable",
      "weapon",
      "original-3d",
      "일상소품",
      "착용소품",
    ]),
  ]);

const ESSENTIAL_BY_ID = new Map(
  STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG.map((entry) => [entry.id, entry] as const),
);

export function findStudioBg3dEssentialAsset(
  id: string,
): StudioBg3dEssentialAssetEntry | undefined {
  return ESSENTIAL_BY_ID.get(id);
}

export function listStudioBg3dEssentialAssetsByCategory(
  category: StudioBg3dEssentialAssetCategory | null,
): readonly StudioBg3dEssentialAssetEntry[] {
  if (category === null) return STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG;
  return STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG.filter((entry) => entry.category === category);
}

export function searchStudioBg3dEssentialAssets(
  category: StudioBg3dEssentialAssetCategory | null,
  query: string,
): readonly StudioBg3dEssentialAssetEntry[] {
  const base = listStudioBg3dEssentialAssetsByCategory(category);
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  if (!normalized) return base;
  return base.filter((entry) =>
    [entry.id, entry.labelKo, entry.labelEn, entry.glbUrl, ...entry.tags].some((token) =>
      token.toLocaleLowerCase("ko-KR").includes(normalized),
    ),
  );
}

/**
 * 오리지널 `/assets/3d/<slug>.glb` 소품에 대응하는 V8 고품질 히어로 리파인판
 * (`/assets/3d/refined-v8/<slug>.glb`, 11종)이 존재하면 반환한다.
 */
export function resolveStudioBg3dRefinedV8PropCounterpart(
  entryOrId: StudioBg3dEssentialAssetEntry | string,
): StudioBg3dEssentialAssetEntry | null {
  const entry = typeof entryOrId === "string" ? findStudioBg3dEssentialAsset(entryOrId) : entryOrId;
  if (!entry) return null;
  if (entry.category === "refined-v8-prop-3d") return null;
  const match = /^\/assets\/3d\/([a-z0-9_]+)\.glb$/iu.exec(entry.glbUrl);
  if (!match?.[1]) return null;
  const normalizedSlug = match[1].replaceAll("_", "-");
  return ESSENTIAL_BY_ID.get(`refined-v8-${normalizedSlug}`) ?? null;
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_MAX_BYTES = 16 * 1024 * 1024;

/**
 * 카탈로그 항목의 GLB 바이너리를 가져와 GLB 헤더를 검증한 뒤 `File` 객체로 반환한다.
 */
export async function fetchStudioBg3dEssentialGlbAsFile(
  entry: StudioBg3dEssentialAssetEntry,
  fetchImpl: typeof fetch = fetch,
): Promise<File> {
  const response = await fetchImpl(entry.glbUrl);
  if (!response.ok) {
    throw new Error(`3D 에셋을 불러오지 못했습니다 (${response.status}): ${entry.labelKo}`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 24 || bytes.byteLength > GLB_MAX_BYTES) {
    throw new Error(`유효하지 않은 GLB 파일 크기입니다: ${entry.labelKo}`);
  }
  const header = new DataView(bytes);
  if (header.getUint32(0, true) !== GLB_MAGIC || header.getUint32(4, true) !== 2) {
    throw new Error(`유효한 glTF 2.0 바이너리(GLB) 헤더가 아닙니다: ${entry.labelKo}`);
  }
  return new File([bytes], entry.fileName, { type: "model/gltf-binary" });
}
