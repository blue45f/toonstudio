/**
 * 툰스튜디오 통합 3D 캐릭터 셰이퍼 프리셋·타입·카탈로그 정본 데이터.
 *
 * - 외부 랩(`apps/character-lab`, `packages/character-lab`) 비의존 순수 `apps/web` 데이터 계층
 * - 모든 컬러 토큰은 OKLCH 규격만 사용하며 원시 HEX/RGB를 포함하지 않는다.
 */

export const CHARACTER_SHAPER_HANDOFF_SCHEMA = "toonstudio.character-shaper-handoff.v1" as const;

export type WebtoonBodyBaseId =
  | "rofan-noble"
  | "modern-hunter"
  | "seoul-academy"
  | "murim-martial"
  | "chibi-sd"
  | "athletic-hero";

export type CharacterProportionAxisId =
  | "headRatio"
  | "shoulderWidth"
  | "waistTaper"
  | "legRatio"
  | "headScale"
  | "eyeScale"
  | "jawSharpness"
  | "muscleVolume";

export type CharacterProportionAxes = Record<CharacterProportionAxisId, number>;

export interface CharacterProportionAxisSpec {
  readonly id: CharacterProportionAxisId;
  readonly labelKo: string;
  readonly unitLabel: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
}

export type HairScalpPresetId =
  | "long-wave"
  | "wolf-cut"
  | "see-through-bob"
  | "martial-topknot"
  | "chibi-fluff"
  | "sporty-short";

export interface HairScalpPreset {
  readonly id: HairScalpPresetId;
  readonly labelKo: string;
  readonly defaultOffsetMm: number;
  readonly defaultVolumeScale: number;
  readonly defaultDamping: number;
  readonly defaultToneToken: string;
}

export interface HairScalpFitState {
  readonly presetId: HairScalpPresetId;
  /** 두피 표면 밀착 간격(mm, 0.5~8.0mm). 관통과 들뜸을 동시에 방지한다. */
  readonly scalpOffsetMm: number;
  /** 헤어 볼륨 배율 (0.7~1.4). */
  readonly volumeScale: number;
  /** 모발 흔들림 감쇠 계수 (0.1~1.0). */
  readonly strandPhysicsDamping: number;
  /** OKLCH 헤어 컬러 토큰. */
  readonly toneToken: string;
}

export type OutfitBaseLayerId =
  | "silk-blouse"
  | "tactical-undersuit"
  | "academy-shirt"
  | "martial-inner"
  | "casual-tee";

export type OutfitMidLayerId =
  | "corset-dress"
  | "hunter-vest"
  | "school-blazer"
  | "murim-dobok"
  | "hoodie-knit"
  | "athletic-jersey";

export type OutfitOuterLayerId =
  | "none"
  | "noble-cape"
  | "long-trench"
  | "school-cardigan"
  | "armor-mantle"
  | "track-jacket";

export interface OutfitLayerOption<T extends string> {
  readonly id: T;
  readonly labelKo: string;
}

export interface OutfitLayerStackState {
  readonly baseLayer: OutfitBaseLayerId;
  readonly midLayer: OutfitMidLayerId;
  readonly outerLayer: OutfitOuterLayerId;
  /** 체형 메시와의 의상 클리핑 방지 간격(mm, 2~14mm). */
  readonly clothClearanceMm: number;
  /** OKLCH 의상 강조 색 토큰. */
  readonly accentToneToken: string;
}

export type HandFingerId = "thumb" | "index" | "middle" | "ring" | "pinky";

export interface HandFinger3Dof {
  readonly proximalCurlDeg: number;
  readonly intermediateCurlDeg: number;
  readonly distalSpreadDeg: number;
}

export type HandPose15DofPresetId =
  | "relaxed-open"
  | "weapon-grip"
  | "pen-hold"
  | "victory-sign"
  | "pointing-dramatic"
  | "fist-clench";

export type HandActiveSide = "both" | "left" | "right";

export interface HandPose15DofState {
  readonly presetId: HandPose15DofPresetId;
  readonly activeHand: HandActiveSide;
  /** 5손가락 × 3자유도(기절 굽힘·중절 굽힘·말절 벌림) = 15-DOF 관절 스냅샷. */
  readonly fingers: Record<HandFingerId, HandFinger3Dof>;
}

export interface HandPose15DofPreset {
  readonly id: HandPose15DofPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly fingers: Record<HandFingerId, HandFinger3Dof>;
}

export type PropSocketId = "right-hand" | "left-hand" | "back-holster" | "waist-belt" | "head-crown";
export type PropItemId =
  | "none"
  | "longsword"
  | "mana-staff"
  | "smart-phone"
  | "antique-fan"
  | "school-bag"
  | "tea-cup";

export interface PropSocketAttachmentState {
  readonly socketId: PropSocketId;
  readonly propId: PropItemId;
  readonly scale: number;
  readonly gripTightness: number;
}

export interface WebtoonBodyBasePreset {
  readonly id: WebtoonBodyBaseId;
  readonly labelKo: string;
  readonly genreTagKo: string;
  readonly summaryKo: string;
  readonly proportions: CharacterProportionAxes;
  readonly defaultHair: HairScalpFitState;
  readonly defaultOutfit: OutfitLayerStackState;
  readonly defaultHandPoseId: HandPose15DofPresetId;
  readonly defaultProp: PropSocketAttachmentState;
}

export const CHARACTER_PROPORTION_AXIS_SPECS: readonly CharacterProportionAxisSpec[] = Object.freeze([
  { id: "headRatio", labelKo: "등신 비율", unitLabel: "등신", min: 5.5, max: 8.5, step: 0.1, defaultValue: 7.4 },
  { id: "shoulderWidth", labelKo: "어깨 폭", unitLabel: "배율", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "waistTaper", labelKo: "허리 라인", unitLabel: "배율", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "legRatio", labelKo: "다리 비율", unitLabel: "배율", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "headScale", labelKo: "머리 크기", unitLabel: "배율", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "eyeScale", labelKo: "눈 크기", unitLabel: "배율", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "jawSharpness", labelKo: "턱선 각도", unitLabel: "배율", min: -1, max: 1, step: 0.05, defaultValue: 0 },
  { id: "muscleVolume", labelKo: "근육·볼륨", unitLabel: "배율", min: -1, max: 1, step: 0.05, defaultValue: 0 },
]);

export const HAND_FINGER_ORDER: readonly HandFingerId[] = Object.freeze([
  "thumb",
  "index",
  "middle",
  "ring",
  "pinky",
]);

export const HAIR_SCALP_PRESETS: readonly HairScalpPreset[] = Object.freeze([
  { id: "long-wave", labelKo: "로판 웨이브 롱", defaultOffsetMm: 1.6, defaultVolumeScale: 1.15, defaultDamping: 0.45, defaultToneToken: "oklch(0.76 0.12 78)" },
  { id: "wolf-cut", labelKo: "헌터 울프컷", defaultOffsetMm: 1.4, defaultVolumeScale: 1.05, defaultDamping: 0.55, defaultToneToken: "oklch(0.28 0.04 260)" },
  { id: "see-through-bob", labelKo: "학원 시스루 단발", defaultOffsetMm: 1.5, defaultVolumeScale: 1.0, defaultDamping: 0.5, defaultToneToken: "oklch(0.36 0.06 45)" },
  { id: "martial-topknot", labelKo: "무협 상투·장발", defaultOffsetMm: 1.8, defaultVolumeScale: 1.1, defaultDamping: 0.35, defaultToneToken: "oklch(0.22 0.02 250)" },
  { id: "chibi-fluff", labelKo: "SD 볼륨 보브", defaultOffsetMm: 2.2, defaultVolumeScale: 1.28, defaultDamping: 0.6, defaultToneToken: "oklch(0.68 0.14 28)" },
  { id: "sporty-short", labelKo: "히어로 스포티 숏", defaultOffsetMm: 1.2, defaultVolumeScale: 0.95, defaultDamping: 0.72, defaultToneToken: "oklch(0.34 0.08 240)" },
]);

export const OUTFIT_BASE_OPTIONS: readonly OutfitLayerOption<OutfitBaseLayerId>[] = Object.freeze([
  { id: "silk-blouse", labelKo: "실크 블라우스" },
  { id: "tactical-undersuit", labelKo: "전술 언더슈트" },
  { id: "academy-shirt", labelKo: "교복 셔츠" },
  { id: "martial-inner", labelKo: "무협 내의" },
  { id: "casual-tee", labelKo: "데일리 티셔츠" },
]);

export const OUTFIT_MID_OPTIONS: readonly OutfitLayerOption<OutfitMidLayerId>[] = Object.freeze([
  { id: "corset-dress", labelKo: "코르셋 드레스" },
  { id: "hunter-vest", labelKo: "헌터 전술 조끼" },
  { id: "school-blazer", labelKo: "교복 블레이저" },
  { id: "murim-dobok", labelKo: "무협 도복" },
  { id: "hoodie-knit", labelKo: "캐주얼 후드 니트" },
  { id: "athletic-jersey", labelKo: "스포츠 저지" },
]);

export const OUTFIT_OUTER_OPTIONS: readonly OutfitLayerOption<OutfitOuterLayerId>[] = Object.freeze([
  { id: "none", labelKo: "아우터 없음" },
  { id: "noble-cape", labelKo: "귀족 케이프 망토" },
  { id: "long-trench", labelKo: "헌터 롱코트" },
  { id: "school-cardigan", labelKo: "가디건 아우터" },
  { id: "armor-mantle", labelKo: "견갑·전포" },
  { id: "track-jacket", labelKo: "트랙 재킷" },
]);

export const HAND_POSE_15DOF_PRESETS: readonly HandPose15DofPreset[] = Object.freeze([
  {
    id: "relaxed-open",
    labelKo: "자연스럽게 펴기",
    descriptionKo: "일상 대화·스탠딩 컷에 맞는 이완 손가락 각도",
    fingers: {
      thumb: { proximalCurlDeg: 14, intermediateCurlDeg: 10, distalSpreadDeg: 18 },
      index: { proximalCurlDeg: 16, intermediateCurlDeg: 18, distalSpreadDeg: 8 },
      middle: { proximalCurlDeg: 20, intermediateCurlDeg: 22, distalSpreadDeg: 4 },
      ring: { proximalCurlDeg: 24, intermediateCurlDeg: 26, distalSpreadDeg: 5 },
      pinky: { proximalCurlDeg: 28, intermediateCurlDeg: 30, distalSpreadDeg: 9 },
    },
  },
  {
    id: "weapon-grip",
    labelKo: "무기·검 파지",
    descriptionKo: "장검·지팡이 손잡이에 밀착되는 15관절 파지",
    fingers: {
      thumb: { proximalCurlDeg: 48, intermediateCurlDeg: 42, distalSpreadDeg: 12 },
      index: { proximalCurlDeg: 74, intermediateCurlDeg: 68, distalSpreadDeg: 2 },
      middle: { proximalCurlDeg: 80, intermediateCurlDeg: 76, distalSpreadDeg: 1 },
      ring: { proximalCurlDeg: 82, intermediateCurlDeg: 78, distalSpreadDeg: 1 },
      pinky: { proximalCurlDeg: 84, intermediateCurlDeg: 80, distalSpreadDeg: 2 },
    },
  },
  {
    id: "pen-hold",
    labelKo: "펜·찻잔 집기",
    descriptionKo: "엄지·검지 중심의 섬세한 소품 집기",
    fingers: {
      thumb: { proximalCurlDeg: 38, intermediateCurlDeg: 28, distalSpreadDeg: 14 },
      index: { proximalCurlDeg: 52, intermediateCurlDeg: 44, distalSpreadDeg: 4 },
      middle: { proximalCurlDeg: 48, intermediateCurlDeg: 42, distalSpreadDeg: 3 },
      ring: { proximalCurlDeg: 60, intermediateCurlDeg: 54, distalSpreadDeg: 3 },
      pinky: { proximalCurlDeg: 64, intermediateCurlDeg: 58, distalSpreadDeg: 5 },
    },
  },
  {
    id: "victory-sign",
    labelKo: "브이 사인",
    descriptionKo: "검지·중지를 벌리고 나머지 손가락을 접은 포즈",
    fingers: {
      thumb: { proximalCurlDeg: 52, intermediateCurlDeg: 46, distalSpreadDeg: 10 },
      index: { proximalCurlDeg: 4, intermediateCurlDeg: 4, distalSpreadDeg: 18 },
      middle: { proximalCurlDeg: 4, intermediateCurlDeg: 4, distalSpreadDeg: 16 },
      ring: { proximalCurlDeg: 84, intermediateCurlDeg: 82, distalSpreadDeg: 2 },
      pinky: { proximalCurlDeg: 86, intermediateCurlDeg: 84, distalSpreadDeg: 2 },
    },
  },
  {
    id: "pointing-dramatic",
    labelKo: "강조 가리키기",
    descriptionKo: "대사 강조·지시 컷용 검지 직선 지시 포즈",
    fingers: {
      thumb: { proximalCurlDeg: 44, intermediateCurlDeg: 36, distalSpreadDeg: 12 },
      index: { proximalCurlDeg: 2, intermediateCurlDeg: 2, distalSpreadDeg: 4 },
      middle: { proximalCurlDeg: 78, intermediateCurlDeg: 74, distalSpreadDeg: 2 },
      ring: { proximalCurlDeg: 82, intermediateCurlDeg: 78, distalSpreadDeg: 2 },
      pinky: { proximalCurlDeg: 84, intermediateCurlDeg: 80, distalSpreadDeg: 3 },
    },
  },
  {
    id: "fist-clench",
    labelKo: "주먹 쥐기",
    descriptionKo: "액션·결의 컷에 쓰는 단단한 주먹 15관절",
    fingers: {
      thumb: { proximalCurlDeg: 62, intermediateCurlDeg: 58, distalSpreadDeg: 8 },
      index: { proximalCurlDeg: 88, intermediateCurlDeg: 86, distalSpreadDeg: 0 },
      middle: { proximalCurlDeg: 90, intermediateCurlDeg: 88, distalSpreadDeg: 0 },
      ring: { proximalCurlDeg: 90, intermediateCurlDeg: 88, distalSpreadDeg: 0 },
      pinky: { proximalCurlDeg: 88, intermediateCurlDeg: 86, distalSpreadDeg: 1 },
    },
  },
]);

export const PROP_SOCKET_OPTIONS: readonly OutfitLayerOption<PropSocketId>[] = Object.freeze([
  { id: "right-hand", labelKo: "오른손 소켓" },
  { id: "left-hand", labelKo: "왼손 소켓" },
  { id: "back-holster", labelKo: "등 홀스터" },
  { id: "waist-belt", labelKo: "허리 벨트" },
  { id: "head-crown", labelKo: "머리 장식 소켓" },
]);

export const PROP_ITEM_OPTIONS: readonly OutfitLayerOption<PropItemId>[] = Object.freeze([
  { id: "none", labelKo: "소품 없음" },
  { id: "longsword", labelKo: "기사단 장검" },
  { id: "mana-staff", labelKo: "마법 지팡이" },
  { id: "smart-phone", labelKo: "스마트폰" },
  { id: "antique-fan", labelKo: "로판 레이스 부채" },
  { id: "school-bag", labelKo: "학원 크로스백" },
  { id: "tea-cup", labelKo: "티타임 찻잔" },
]);

export const CHARACTER_BODY_BASE_PRESETS: readonly WebtoonBodyBasePreset[] = Object.freeze([
  {
    id: "rofan-noble",
    labelKo: "로판 귀족",
    genreTagKo: "로맨스 판타지",
    summaryKo: "7.8등신 우아한 실루엣 · 가녀린 어깨·허리와 긴 다리 비율",
    proportions: { headRatio: 7.8, shoulderWidth: -0.25, waistTaper: -0.4, legRatio: 0.45, headScale: -0.1, eyeScale: 0.3, jawSharpness: 0.35, muscleVolume: -0.35 },
    defaultHair: { presetId: "long-wave", scalpOffsetMm: 1.6, volumeScale: 1.15, strandPhysicsDamping: 0.45, toneToken: "oklch(0.76 0.12 78)" },
    defaultOutfit: { baseLayer: "silk-blouse", midLayer: "corset-dress", outerLayer: "noble-cape", clothClearanceMm: 5, accentToneToken: "oklch(0.58 0.16 330)" },
    defaultHandPoseId: "pen-hold",
    defaultProp: { socketId: "right-hand", propId: "antique-fan", scale: 1, gripTightness: 0.72 },
  },
  {
    id: "modern-hunter",
    labelKo: "현대 헌터",
    genreTagKo: "현대 판타지 · 헌터",
    summaryKo: "8.0등신 날렵한 전투 비율 · 넓은 어깨와 균형 잡힌 근육선",
    proportions: { headRatio: 8.0, shoulderWidth: 0.55, waistTaper: -0.15, legRatio: 0.35, headScale: -0.15, eyeScale: -0.05, jawSharpness: 0.5, muscleVolume: 0.45 },
    defaultHair: { presetId: "wolf-cut", scalpOffsetMm: 1.4, volumeScale: 1.05, strandPhysicsDamping: 0.55, toneToken: "oklch(0.28 0.04 260)" },
    defaultOutfit: { baseLayer: "tactical-undersuit", midLayer: "hunter-vest", outerLayer: "long-trench", clothClearanceMm: 4.5, accentToneToken: "oklch(0.52 0.14 252)" },
    defaultHandPoseId: "weapon-grip",
    defaultProp: { socketId: "right-hand", propId: "longsword", scale: 1.05, gripTightness: 0.9 },
  },
  {
    id: "seoul-academy",
    labelKo: "서울 학원물",
    genreTagKo: "학원 · 드라마",
    summaryKo: "6.8등신 청량한 10대 비율 · 선명한 눈매와 자연스러운 교복 핏",
    proportions: { headRatio: 6.8, shoulderWidth: -0.05, waistTaper: -0.1, legRatio: 0.1, headScale: 0.1, eyeScale: 0.35, jawSharpness: 0.1, muscleVolume: -0.15 },
    defaultHair: { presetId: "see-through-bob", scalpOffsetMm: 1.5, volumeScale: 1.0, strandPhysicsDamping: 0.5, toneToken: "oklch(0.36 0.06 45)" },
    defaultOutfit: { baseLayer: "academy-shirt", midLayer: "school-blazer", outerLayer: "school-cardigan", clothClearanceMm: 4, accentToneToken: "oklch(0.56 0.13 245)" },
    defaultHandPoseId: "relaxed-open",
    defaultProp: { socketId: "left-hand", propId: "smart-phone", scale: 0.95, gripTightness: 0.78 },
  },
  {
    id: "murim-martial",
    labelKo: "무협 고수",
    genreTagKo: "정통 무협",
    summaryKo: "7.6등신 안정적인 무게 중심 · 도복 실루엣과 강한 코어 비율",
    proportions: { headRatio: 7.6, shoulderWidth: 0.4, waistTaper: -0.05, legRatio: 0.2, headScale: -0.05, eyeScale: -0.1, jawSharpness: 0.45, muscleVolume: 0.35 },
    defaultHair: { presetId: "martial-topknot", scalpOffsetMm: 1.8, volumeScale: 1.1, strandPhysicsDamping: 0.35, toneToken: "oklch(0.22 0.02 250)" },
    defaultOutfit: { baseLayer: "martial-inner", midLayer: "murim-dobok", outerLayer: "armor-mantle", clothClearanceMm: 6.5, accentToneToken: "oklch(0.54 0.14 162)" },
    defaultHandPoseId: "weapon-grip",
    defaultProp: { socketId: "waist-belt", propId: "longsword", scale: 1.1, gripTightness: 0.85 },
  },
  {
    id: "chibi-sd",
    labelKo: "SD 데포르메",
    genreTagKo: "개그 · SD 컷",
    summaryKo: "5.5등신 귀엽고 과장된 비율 · 큰 머리·큰 눈과 둥근 턱선",
    proportions: { headRatio: 5.5, shoulderWidth: -0.5, waistTaper: 0.25, legRatio: -0.65, headScale: 0.75, eyeScale: 0.8, jawSharpness: -0.65, muscleVolume: -0.4 },
    defaultHair: { presetId: "chibi-fluff", scalpOffsetMm: 2.2, volumeScale: 1.28, strandPhysicsDamping: 0.6, toneToken: "oklch(0.68 0.14 28)" },
    defaultOutfit: { baseLayer: "casual-tee", midLayer: "hoodie-knit", outerLayer: "none", clothClearanceMm: 5.5, accentToneToken: "oklch(0.66 0.16 42)" },
    defaultHandPoseId: "victory-sign",
    defaultProp: { socketId: "right-hand", propId: "tea-cup", scale: 1.15, gripTightness: 0.7 },
  },
  {
    id: "athletic-hero",
    labelKo: "스포츠 히어로",
    genreTagKo: "액션 · 스포츠",
    summaryKo: "8.2등신 역삼각 피지컬 · 넓은 어깨·높은 근육량과 탄력 있는 하체",
    proportions: { headRatio: 8.2, shoulderWidth: 0.8, waistTaper: -0.2, legRatio: 0.4, headScale: -0.2, eyeScale: -0.1, jawSharpness: 0.55, muscleVolume: 0.85 },
    defaultHair: { presetId: "sporty-short", scalpOffsetMm: 1.2, volumeScale: 0.95, strandPhysicsDamping: 0.72, toneToken: "oklch(0.34 0.08 240)" },
    defaultOutfit: { baseLayer: "tactical-undersuit", midLayer: "athletic-jersey", outerLayer: "track-jacket", clothClearanceMm: 3.5, accentToneToken: "oklch(0.61 0.19 18)" },
    defaultHandPoseId: "fist-clench",
    defaultProp: { socketId: "back-holster", propId: "school-bag", scale: 1.0, gripTightness: 0.6 },
  },
]);
