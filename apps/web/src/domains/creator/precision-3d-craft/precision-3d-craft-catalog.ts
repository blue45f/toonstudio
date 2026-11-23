/**
 * 최정밀 커스텀 3D 모델링 품질 엔진용 PBR 4종 재질 · 조명 · 건축/소품 아키타입 · GLB 경량 예산 카탈로그.
 */

export type PrecisionPbrMaterialId =
  | "ceramic-glaze"
  | "satin-wood"
  | "brushed-brass"
  | "matte-fabric";

export type PrecisionAssetArchetypeId =
  | "cafe-espresso-bar"
  | "rofan-brass-chandelier"
  | "school-desk-chair-set"
  | "atelier-ceramic-vase"
  | "subway-bench-canopy";

export type PrecisionLightingPresetId =
  | "morning-north-window"
  | "golden-hour-rim"
  | "rofan-candle-warm"
  | "studio-neutral-ao";

export type GlbBudgetProfileId = "desktop-hero@1" | "mobile-hero@1";

export interface PrecisionPbrMaterialPreset {
  readonly id: PrecisionPbrMaterialId;
  readonly labelKo: string;
  readonly summaryKo: string;
  /** 물리 기반 이진 금속도 규칙: 비금속 0 또는 순금속 1만 허용 */
  readonly metallic: 0 | 1;
  readonly roughness: number;
  readonly coat: number;
  readonly coatRoughness: number;
  readonly sheen: number;
  readonly sheenRoughness: number;
  readonly ior: number;
  readonly normalStrength: number;
  readonly aoStrength: number;
  readonly proceduralGrainFrequency: number;
  readonly proceduralNormalMode:
    | "micro-glaze-ripple"
    | "anisotropic-wood-grain"
    | "brushed-linear-aniso"
    | "woven-cloth-micro";
}

export interface PrecisionLightingPreset {
  readonly id: PrecisionLightingPresetId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly keyLightKelvin: number;
  readonly keyIntensity: number;
  readonly fillIntensity: number;
  readonly rimIntensity: number;
  readonly ambientOcclusionRadiusMeters: number;
  readonly shadowSoftness: number;
}

export interface PrecisionRigSocketSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly parentId: string | null;
  readonly localPositionMeters: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly allowPropSnap: boolean;
}

export interface PrecisionAssetArchetypeSpec {
  readonly id: PrecisionAssetArchetypeId;
  readonly labelKo: string;
  readonly categoryKo: string;
  readonly summaryKo: string;
  readonly baseQuads: number;
  readonly baseMaterials: number;
  readonly baseDrawCalls: number;
  readonly dimensionsMeters: readonly [number, number, number];
  readonly defaultMaterialId: PrecisionPbrMaterialId;
  readonly defaultLightingId: PrecisionLightingPresetId;
  readonly defaultSockets: readonly PrecisionRigSocketSpec[];
}

export interface GlbBudgetProfileLimits {
  readonly profile: GlbBudgetProfileId;
  readonly labelKo: string;
  readonly maxTriangles: number;
  readonly maxBytes: number;
  readonly maxDrawCalls: number;
  readonly maxMaterials: number;
  readonly maxTextureSize: number;
}

export const FLOOR_GROUNDING_TOLERANCE_METERS = 0.002;
export const METRIC_SCALE_TOLERANCE = 0.001;

export const PRECISION_PBR_MATERIAL_PRESETS: Readonly<Record<PrecisionPbrMaterialId, PrecisionPbrMaterialPreset>> = Object.freeze({
  "ceramic-glaze": Object.freeze({
    id: "ceramic-glaze",
    labelKo: "세라믹 유약",
    summaryKo: "도자기·타일·카페 식기용 고광택 유약(이진 금속도 0 + 강한 Clearcoat).",
    metallic: 0,
    roughness: 0.18,
    coat: 0.92,
    coatRoughness: 0.08,
    sheen: 0,
    sheenRoughness: 0.5,
    ior: 1.52,
    normalStrength: 0.25,
    aoStrength: 0.85,
    proceduralGrainFrequency: 18,
    proceduralNormalMode: "micro-glaze-ripple",
  }),
  "satin-wood": Object.freeze({
    id: "satin-wood",
    labelKo: "사틴 천연 원목",
    summaryKo: "교실 책걸상·카페 카운터·마루용 결 강조 사틴 마감(이진 금속도 0).",
    metallic: 0,
    roughness: 0.42,
    coat: 0.28,
    coatRoughness: 0.24,
    sheen: 0.12,
    sheenRoughness: 0.45,
    ior: 1.48,
    normalStrength: 0.62,
    aoStrength: 0.9,
    proceduralGrainFrequency: 34,
    proceduralNormalMode: "anisotropic-wood-grain",
  }),
  "brushed-brass": Object.freeze({
    id: "brushed-brass",
    labelKo: "브러시드 황동",
    summaryKo: "로판 샹들리에·난간·문손잡이용 미세 헤어라인 금속(이진 금속도 1).",
    metallic: 1,
    roughness: 0.27,
    coat: 0.15,
    coatRoughness: 0.18,
    sheen: 0,
    sheenRoughness: 0.5,
    ior: 1.5,
    normalStrength: 0.48,
    aoStrength: 0.8,
    proceduralGrainFrequency: 64,
    proceduralNormalMode: "brushed-linear-aniso",
  }),
  "matte-fabric": Object.freeze({
    id: "matte-fabric",
    labelKo: "매트 패브릭 원단",
    summaryKo: "소파·커튼·의자 쿠션용 직조 미세 요철과 부드러운 Sheen(이진 금속도 0).",
    metallic: 0,
    roughness: 0.86,
    coat: 0,
    coatRoughness: 0,
    sheen: 0.78,
    sheenRoughness: 0.55,
    ior: 1.45,
    normalStrength: 0.72,
    aoStrength: 0.95,
    proceduralGrainFrequency: 96,
    proceduralNormalMode: "woven-cloth-micro",
  }),
});

export const PRECISION_LIGHTING_PRESETS: Readonly<Record<PrecisionLightingPresetId, PrecisionLightingPreset>> = Object.freeze({
  "morning-north-window": Object.freeze({
    id: "morning-north-window",
    labelKo: "북향 아침 자연광",
    summaryKo: "부드러운 산란광으로 베벨 하이라이트와 원목 질감을 살립니다.",
    keyLightKelvin: 5800,
    keyIntensity: 2.2,
    fillIntensity: 1.1,
    rimIntensity: 0.85,
    ambientOcclusionRadiusMeters: 0.35,
    shadowSoftness: 0.68,
  }),
  "golden-hour-rim": Object.freeze({
    id: "golden-hour-rim",
    labelKo: "노을 역광 림라이트",
    summaryKo: "낮은 고도의 따뜻한 주광과 선명한 외곽 림라이트로 웹툰 감성을 끌어올립니다.",
    keyLightKelvin: 3600,
    keyIntensity: 2.9,
    fillIntensity: 0.7,
    rimIntensity: 1.9,
    ambientOcclusionRadiusMeters: 0.42,
    shadowSoftness: 0.45,
  }),
  "rofan-candle-warm": Object.freeze({
    id: "rofan-candle-warm",
    labelKo: "로판 촛불 웜톤",
    summaryKo: "브러시드 황동과 아치 기둥의 미세 챔퍼에 따뜻한 반사광을 얹습니다.",
    keyLightKelvin: 2700,
    keyIntensity: 2.4,
    fillIntensity: 0.55,
    rimIntensity: 1.4,
    ambientOcclusionRadiusMeters: 0.5,
    shadowSoftness: 0.75,
  }),
  "studio-neutral-ao": Object.freeze({
    id: "studio-neutral-ao",
    labelKo: "스튜디오 중립 AO 검수광",
    summaryKo: "색 편향 없이 노멀·베벨·접지 그림자 결함만 또렷하게 확인하는 검수용 조명입니다.",
    keyLightKelvin: 6500,
    keyIntensity: 2.0,
    fillIntensity: 1.35,
    rimIntensity: 0.6,
    ambientOcclusionRadiusMeters: 0.28,
    shadowSoftness: 0.55,
  }),
});

function vec3(x: number, y: number, z: number): readonly [number, number, number] {
  return Object.freeze([x, y, z] as const);
}

export const PRECISION_ASSET_ARCHETYPES: readonly PrecisionAssetArchetypeSpec[] = Object.freeze([
  Object.freeze({
    id: "cafe-espresso-bar",
    labelKo: "카페 에스프레소 카운터",
    categoryKo: "실내 건축 소품",
    summaryKo: "템바보드 전면, 세라믹 드립바, 상부 메뉴 보드 소켓까지 갖춘 정밀 카운터 모듈",
    baseQuads: 1850,
    baseMaterials: 3,
    baseDrawCalls: 3,
    dimensionsMeters: vec3(2.4, 1.05, 0.85),
    defaultMaterialId: "satin-wood",
    defaultLightingId: "morning-north-window",
    defaultSockets: Object.freeze([
      Object.freeze({ id: "root_counter", labelKo: "카운터 본체 루트", parentId: null, localPositionMeters: vec3(0, 0, 0), scale: vec3(1, 1, 1), allowPropSnap: false }),
      Object.freeze({ id: "socket_espresso_top", labelKo: "머신 상판 소켓", parentId: "root_counter", localPositionMeters: vec3(-0.55, 0.92, 0.05), scale: vec3(1, 1, 1), allowPropSnap: true }),
      Object.freeze({ id: "socket_pastry_case", labelKo: "디저트 쇼케이스 소켓", parentId: "root_counter", localPositionMeters: vec3(0.62, 0.92, 0.08), scale: vec3(1, 1, 1), allowPropSnap: true }),
    ]),
  }),
  Object.freeze({
    id: "rofan-brass-chandelier",
    labelKo: "로판 황동 촛대 스콘스",
    categoryKo: "로판 · 판타지 소품",
    summaryKo: "16분할 선반 회전 몸체와 마이크로 베벨 촛대 암이 결합된 황동 장식 소품",
    baseQuads: 2200,
    baseMaterials: 2,
    baseDrawCalls: 2,
    dimensionsMeters: vec3(0.92, 1.18, 0.92),
    defaultMaterialId: "brushed-brass",
    defaultLightingId: "rofan-candle-warm",
    defaultSockets: Object.freeze([
      Object.freeze({ id: "root_fixture", labelKo: "고정 브래킷 루트", parentId: null, localPositionMeters: vec3(0, 0, 0), scale: vec3(1, 1, 1), allowPropSnap: false }),
      Object.freeze({ id: "socket_candle_ring", labelKo: "촛대 암 링", parentId: "root_fixture", localPositionMeters: vec3(0, 0.64, 0), scale: vec3(1, 1, 1), allowPropSnap: true }),
      Object.freeze({ id: "socket_crystal_drop", labelKo: "하부 크리스탈 드롭", parentId: "socket_candle_ring", localPositionMeters: vec3(0, 0.35, 0), scale: vec3(1, 1, 1), allowPropSnap: true }),
    ]),
  }),
  Object.freeze({
    id: "school-desk-chair-set",
    labelKo: "한국 교실 책걸상 정밀 세트",
    categoryKo: "현대 학원물 소품",
    summaryKo: "실측 720mm 상판 높이, 스틸 파이프 미세 베벨, 서랍 수납 소켓이 정렬된 세트",
    baseQuads: 1280,
    baseMaterials: 2,
    baseDrawCalls: 2,
    dimensionsMeters: vec3(0.65, 0.74, 0.92),
    defaultMaterialId: "satin-wood",
    defaultLightingId: "golden-hour-rim",
    defaultSockets: Object.freeze([
      Object.freeze({ id: "root_desk", labelKo: "책상 프레임 루트", parentId: null, localPositionMeters: vec3(0, 0, 0), scale: vec3(1, 1, 1), allowPropSnap: false }),
      Object.freeze({ id: "socket_book_surface", labelKo: "교과서·필통 배치면", parentId: "root_desk", localPositionMeters: vec3(0, 0.72, 0), scale: vec3(1, 1, 1), allowPropSnap: true }),
      Object.freeze({ id: "socket_chair_pivot", labelKo: "의자 슬라이드 피벗", parentId: "root_desk", localPositionMeters: vec3(0, 0, 0.42), scale: vec3(1, 1, 1), allowPropSnap: true }),
    ]),
  }),
  Object.freeze({
    id: "atelier-ceramic-vase",
    labelKo: "아틀리에 세라믹 화병 오브제",
    categoryKo: "정물 · 인테리어 소품",
    summaryKo: "Catmull-Clark 곡면 흐름이 깨끗한 클로즈업용 유약 도자기 화병과 받침대",
    baseQuads: 840,
    baseMaterials: 1,
    baseDrawCalls: 1,
    dimensionsMeters: vec3(0.28, 0.44, 0.28),
    defaultMaterialId: "ceramic-glaze",
    defaultLightingId: "studio-neutral-ao",
    defaultSockets: Object.freeze([
      Object.freeze({ id: "root_vase", labelKo: "화병 바닥 루트", parentId: null, localPositionMeters: vec3(0, 0, 0), scale: vec3(1, 1, 1), allowPropSnap: false }),
      Object.freeze({ id: "socket_flower_neck", labelKo: "꽃가지 삽입 소켓", parentId: "root_vase", localPositionMeters: vec3(0, 0.41, 0), scale: vec3(1, 1, 1), allowPropSnap: true }),
    ]),
  }),
  Object.freeze({
    id: "subway-bench-canopy",
    labelKo: "지하철 승강장 벤치 · 안전바",
    categoryKo: "도시 배경 소품",
    summaryKo: "좌판 쿠션과 브러시드 금속 프레임을 2드로우콜로 배칭한 승강장 벤치",
    baseQuads: 1520,
    baseMaterials: 2,
    baseDrawCalls: 2,
    dimensionsMeters: vec3(1.85, 0.86, 0.62),
    defaultMaterialId: "matte-fabric",
    defaultLightingId: "studio-neutral-ao",
    defaultSockets: Object.freeze([
      Object.freeze({ id: "root_bench", labelKo: "벤치 프레임 루트", parentId: null, localPositionMeters: vec3(0, 0, 0), scale: vec3(1, 1, 1), allowPropSnap: false }),
      Object.freeze({ id: "socket_seat_left", labelKo: "좌측 착석 소켓", parentId: "root_bench", localPositionMeters: vec3(-0.55, 0.45, 0), scale: vec3(1, 1, 1), allowPropSnap: true }),
      Object.freeze({ id: "socket_seat_right", labelKo: "우측 착석 소켓", parentId: "root_bench", localPositionMeters: vec3(0.55, 0.45, 0), scale: vec3(1, 1, 1), allowPropSnap: true }),
    ]),
  }),
]);

export const GLB_BUDGET_PROFILES: Readonly<Record<GlbBudgetProfileId, GlbBudgetProfileLimits>> = Object.freeze({
  "desktop-hero@1": Object.freeze({
    profile: "desktop-hero@1",
    labelKo: "데스크톱 히어로 (desktop-hero@1)",
    maxTriangles: 65_000,
    maxBytes: 8_388_608,
    maxDrawCalls: 8,
    maxMaterials: 6,
    maxTextureSize: 2048,
  }),
  "mobile-hero@1": Object.freeze({
    profile: "mobile-hero@1",
    labelKo: "모바일 히어로 (mobile-hero@1)",
    maxTriangles: 28_000,
    maxBytes: 3_145_728,
    maxDrawCalls: 4,
    maxMaterials: 4,
    maxTextureSize: 1024,
  }),
});

export function getPrecisionAssetArchetype(id: PrecisionAssetArchetypeId): PrecisionAssetArchetypeSpec {
  return PRECISION_ASSET_ARCHETYPES.find((item) => item.id === id) ?? PRECISION_ASSET_ARCHETYPES[0]!;
}
