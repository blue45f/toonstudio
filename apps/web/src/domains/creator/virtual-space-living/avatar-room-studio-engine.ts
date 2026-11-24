/**
 * 가상 스튜디오 레이어드 아바타 · 6종 테마 방 · 그리드 가구 배치 · 팀 뽀모도로 엔진.
 *
 * - 6슬롯 레이어드 아바타 커스터마이저(헤어/표정/상의/하의/장르 의상 6종/반려동물 4종) + 내 작품 주인공 불러오기 슬롯
 * - 사전 베이크 WebP 기반 6종 테마 스튜디오 카탈로그(`/assets/atelier/spaces/*.webp`)
 * - 12×8 그리드 스냅 책상 가구 배치 및 경계·AABB 충돌 검사 엔진
 * - 팀 뽀모도로 스프린트·휴식 동기화 타이머 및 드리프트 보정 패킷
 */

import type { TimeOfDayId, WeatherMoodPresetId } from "./atmosphere-vfx-engine";

export type AvatarSlotKey = "hair" | "expression" | "top" | "bottom" | "genreOutfitPreset" | "studioPet";
export type GenreOutfitPresetId = "daily-atelier" | "fantasy-mage" | "cyber-ink" | "campus-romance" | "noir-detective" | "hanbok-modern";
export type StudioPetId = "calico-cat" | "corgi-pup" | "ink-owl" | "shiba-nap";
export type StudioThemeRoomId = "wood-atelier" | "rooftop-terrace" | "midnight-manga-cafe" | "reference-library" | "fantasy-guild-hall" | "comic-gallery";
export type FurnitureRotationDeg = 0 | 90 | 180 | 270;
export type PomodoroPhase = "idle" | "sprint" | "short-break" | "long-break";
export type PomodoroPresetId = "standard-25-5" | "deep-50-10" | "quick-15-3";

export interface AvatarSlotOption {
  readonly id: string;
  readonly labelKo: string;
  readonly detailKo: string;
}

export interface GenreOutfitPresetSpec {
  readonly id: GenreOutfitPresetId;
  readonly labelKo: string;
  readonly genreTagKo: string;
  readonly capeStyleKo: string;
  readonly defaultHairId: string;
  readonly defaultTopId: string;
  readonly defaultBottomId: string;
}

export interface StudioPetSpec {
  readonly id: StudioPetId;
  readonly labelKo: string;
  readonly companionActionKo: string;
  readonly seatPreferenceKo: string;
}

export interface ProtagonistWorkSource {
  readonly workId: string;
  readonly workTitleKo: string;
  readonly characterNameKo: string;
  readonly episodeTagKo: string;
  readonly recommendedGenrePresetId: GenreOutfitPresetId;
  readonly hairId: string;
  readonly expressionId: string;
  readonly signaturePropKo: string;
}

export interface ProtagonistImportSlot {
  readonly active: boolean;
  readonly workId: string | null;
  readonly workTitleKo: string | null;
  readonly characterNameKo: string | null;
  readonly episodeTagKo: string | null;
  readonly signaturePropKo: string | null;
}

export interface LayeredAvatarConfig {
  readonly hair: string;
  readonly expression: string;
  readonly top: string;
  readonly bottom: string;
  readonly genreOutfitPreset: GenreOutfitPresetId;
  readonly studioPet: StudioPetId;
  readonly protagonistImport: ProtagonistImportSlot;
}

export interface AvatarRenderLayerItem {
  readonly order: number;
  readonly slotKey: AvatarSlotKey | "protagonist-overlay";
  readonly layerId: string;
  readonly labelKo: string;
}

export interface StudioThemeRoomSpec {
  readonly id: StudioThemeRoomId;
  readonly nameKo: string;
  readonly subtitleKo: string;
  readonly imagePath: string;
  readonly recommendedTimeOfDay: TimeOfDayId;
  readonly recommendedWeather: WeatherMoodPresetId;
  readonly ambientSoundKo: string;
  readonly capacityCount: number;
  readonly gridCols: number;
  readonly gridRows: number;
}

export interface FurnitureGridSpec {
  readonly cols: number;
  readonly rows: number;
  readonly cellSizePx: number;
}

export interface FurnitureCatalogItem {
  readonly catalogId: string;
  readonly nameKo: string;
  readonly categoryKo: string;
  readonly widthCells: number;
  readonly heightCells: number;
  readonly rotatable: boolean;
}

export interface PlacedFurnitureItem {
  readonly instanceId: string;
  readonly catalogId: string;
  readonly col: number;
  readonly row: number;
  readonly rotationDeg: FurnitureRotationDeg;
}

export interface FurnitureCollisionResult {
  readonly ok: boolean;
  readonly reason: "out-of-bounds" | "overlap" | "unknown-catalog" | null;
  readonly collidingInstanceIds: readonly string[];
  readonly effectiveWidthCells: number;
  readonly effectiveHeightCells: number;
  readonly messageKo: string;
}

export interface FurnitureMutationResult {
  readonly items: readonly PlacedFurnitureItem[];
  readonly accepted: boolean;
  readonly collision: FurnitureCollisionResult;
}

export interface PomodoroPresetSpec {
  readonly id: PomodoroPresetId;
  readonly labelKo: string;
  readonly sprintDurationSec: number;
  readonly shortBreakDurationSec: number;
  readonly longBreakDurationSec: number;
  readonly longBreakEverySprints: number;
}

export interface PomodoroSyncPeer {
  readonly peerId: string;
  readonly nameKo: string;
  readonly taskKo: string;
  readonly synced: boolean;
}

export interface TeamPomodoroState {
  readonly roomSessionId: string;
  readonly hostNameKo: string;
  readonly presetId: PomodoroPresetId;
  readonly phase: PomodoroPhase;
  readonly running: boolean;
  readonly phaseElapsedSec: number;
  readonly phaseDurationSec: number;
  readonly completedSprints: number;
  readonly totalFocusedSec: number;
  readonly syncRevision: number;
  readonly lastDriftMs: number;
  readonly syncedPeers: readonly PomodoroSyncPeer[];
}

export interface PomodoroTickResult {
  readonly nextState: TeamPomodoroState;
  readonly phaseTransitioned: boolean;
  readonly previousPhase: PomodoroPhase;
  readonly announcementKo: string | null;
}

export interface TeamPomodoroSyncPacket {
  readonly roomSessionId: string;
  readonly syncRevision: number;
  readonly phase: PomodoroPhase;
  readonly running: boolean;
  readonly phaseElapsedSec: number;
  readonly completedSprints: number;
  readonly hostTimestampMs: number;
}

export const AVATAR_SLOT_KEYS: readonly AvatarSlotKey[] = [
  "hair",
  "expression",
  "top",
  "bottom",
  "genreOutfitPreset",
  "studioPet",
] as const;

export const AVATAR_HAIR_OPTIONS: readonly AvatarSlotOption[] = [
  { id: "wolf-short", labelKo: "숏 울프컷", detailKo: "가볍게 흩날리는 레이어드 단발" },
  { id: "low-ponytail", labelKo: "로우 포니테일", detailKo: "이동 시 탄성 있게 흔들리는 긴 묶음" },
  { id: "natural-wave", labelKo: "자연 웨이브", detailKo: "어깨선 볼륨 웨이브" },
  { id: "comma-two-block", labelKo: "투블럭 쉼표", detailKo: "깔끔한 앞머리 포인트" },
  { id: "half-up-long", labelKo: "반묶음 롱", detailKo: "잔상 스프링 체인에 최적화된 롱헤어" },
] as const;

export const AVATAR_EXPRESSION_OPTIONS: readonly AvatarSlotOption[] = [
  { id: "calm-smile", labelKo: "차분한 미소", detailKo: "여유로운 작업실 기본 표정" },
  { id: "deadline-focus", labelKo: "마감 집중", detailKo: "펜선 몰입 모드 눈빛" },
  { id: "idea-spark", labelKo: "영감 번뜩", detailKo: "콘티가 풀렸을 때의 생기" },
  { id: "coffee-sigh", labelKo: "커피 휴식", detailKo: "따뜻한 머그컵을 든 편안한 표정" },
  { id: "bright-cheer", labelKo: "환한 응원", detailKo: "동료 컷 완성 축하 표정" },
] as const;

export const AVATAR_TOP_OPTIONS: readonly AvatarSlotOption[] = [
  { id: "linen-shirt", labelKo: "린넨 작업 셔츠", detailKo: "소매를 걷어 올린 통기성 셔츠" },
  { id: "knit-cardigan", labelKo: "오버핏 니트 가디건", detailKo: "포근한 작업실 아우터" },
  { id: "work-jacket", labelKo: "크롭 워크 재킷", detailKo: "펜·지우개 포켓 디테일" },
  { id: "turtleneck", labelKo: "모크넥 스웨터", detailKo: "미니멀 다크톤 니트" },
  { id: "ink-apron", labelKo: "붓주머니 에이프런", detailKo: "전통 원화 작업 앞치마" },
] as const;

export const AVATAR_BOTTOM_OPTIONS: readonly AvatarSlotOption[] = [
  { id: "wide-cotton", labelKo: "와이드 코튼 팬츠", detailKo: "장시간 착석에 편한 릴랙스 핏" },
  { id: "denim-slacks", labelKo: "데님 슬랙스", detailKo: "단정한 작업실 데일리룩" },
  { id: "pleated-skirt", labelKo: "플리츠 미디 스커트", detailKo: "이동 시 자연스러운 주름 잔상" },
  { id: "cargo-jogger", labelKo: "카고 조거 팬츠", detailKo: "활동적인 기동성 팬츠" },
  { id: "tailored-chino", labelKo: "테일러드 치노", detailKo: "클래식 아틀리에 치노" },
] as const;

export const GENRE_OUTFIT_PRESETS: readonly GenreOutfitPresetSpec[] = [
  { id: "daily-atelier", labelKo: "일상 아틀리에", genreTagKo: "일상·드라마", capeStyleKo: "린넨 스카프", defaultHairId: "wolf-short", defaultTopId: "linen-shirt", defaultBottomId: "wide-cotton" },
  { id: "fantasy-mage", labelKo: "판타지 마법사", genreTagKo: "판타지·로판", capeStyleKo: "성좌 망토", defaultHairId: "half-up-long", defaultTopId: "knit-cardigan", defaultBottomId: "pleated-skirt" },
  { id: "cyber-ink", labelKo: "사이버 잉크러너", genreTagKo: "SF·액션", capeStyleKo: "테크 롱코트 자락", defaultHairId: "comma-two-block", defaultTopId: "work-jacket", defaultBottomId: "cargo-jogger" },
  { id: "campus-romance", labelKo: "캠퍼스 로맨스", genreTagKo: "로맨스·학원", capeStyleKo: "니트 숄", defaultHairId: "natural-wave", defaultTopId: "knit-cardigan", defaultBottomId: "denim-slacks" },
  { id: "noir-detective", labelKo: "느와르 탐정", genreTagKo: "스릴러·미스터리", capeStyleKo: "트렌치 케이프", defaultHairId: "low-ponytail", defaultTopId: "turtleneck", defaultBottomId: "tailored-chino" },
  { id: "hanbok-modern", labelKo: "모던 생활한복", genreTagKo: "동양판타지·무협", capeStyleKo: "도포 고름", defaultHairId: "low-ponytail", defaultTopId: "ink-apron", defaultBottomId: "wide-cotton" },
] as const;

export const STUDIO_PET_OPTIONS: readonly StudioPetSpec[] = [
  { id: "calico-cat", labelKo: "삼색 고양이", companionActionKo: "타블렛 옆에서 그르렁 낮잠", seatPreferenceKo: "책상 우측 온열 패드" },
  { id: "corgi-pup", labelKo: "웰시코기", companionActionKo: "휴식 시간마다 꼬리 흔들며 응원", seatPreferenceKo: "작업 의자 발밑 러그" },
  { id: "ink-owl", labelKo: "먹물 부엉이", companionActionKo: "심야 마감 시 스탠드 위에서 감시", seatPreferenceKo: "레퍼런스 책장 상단" },
  { id: "shiba-nap", labelKo: "낮잠 시바견", companionActionKo: "뽀모도로 종료 종소리에 기지개", seatPreferenceKo: "창가 햇살 방석" },
] as const;

export const USER_WORK_PROTAGONIST_CATALOG: readonly ProtagonistWorkSource[] = [
  { workId: "work-starlight-ink", workTitleKo: "별빛 잉크의 연대기", characterNameKo: "서연우", episodeTagKo: "12화 채색 작업 중", recommendedGenrePresetId: "fantasy-mage", hairId: "half-up-long", expressionId: "idea-spark", signaturePropKo: "별자리 만년필" },
  { workId: "work-seoul-2099", workTitleKo: "네온 비 오는 종로 2099", characterNameKo: "강하진", episodeTagKo: "7화 선화 마감", recommendedGenrePresetId: "cyber-ink", hairId: "comma-two-block", expressionId: "deadline-focus", signaturePropKo: "홀로그램 스케치패드" },
  { workId: "work-autumn-campus", workTitleKo: "은행잎 떨어진 미술관 앞", characterNameKo: "윤다혜", episodeTagKo: "3화 콘티 점검", recommendedGenrePresetId: "campus-romance", hairId: "natural-wave", expressionId: "calm-smile", signaturePropKo: "크로키 수첩" },
] as const;

export const STUDIO_THEME_ROOMS: readonly StudioThemeRoomSpec[] = [
  { id: "wood-atelier", nameKo: "원목 아틀리에", subtitleKo: "따뜻한 자작나무 책상과 채광창이 어우러진 기본 개인 작업실", imagePath: "/assets/atelier/spaces/wood-atelier.webp", recommendedTimeOfDay: "day", recommendedWeather: "clear-breeze", ambientSoundKo: "종이 펜 사각임 · 28 dB", capacityCount: 4, gridCols: 12, gridRows: 8 },
  { id: "rooftop-terrace", nameKo: "루프탑 테라스", subtitleKo: "노을 바람과 벚꽃 잎이 스치는 개방형 야외 드로잉 데크", imagePath: "/assets/atelier/spaces/rooftop-terrace.webp", recommendedTimeOfDay: "sunset", recommendedWeather: "spring-blossom", ambientSoundKo: "산들바람 · 32 dB", capacityCount: 6, gridCols: 12, gridRows: 8 },
  { id: "midnight-manga-cafe", nameKo: "심야 만화카페", subtitleKo: "빗소리 들리는 창가 부스와 은은한 스탠드 조명의 야간 마감 공간", imagePath: "/assets/atelier/spaces/midnight-manga-cafe.webp", recommendedTimeOfDay: "night", recommendedWeather: "rainy-window", ambientSoundKo: "창가 빗소리 · 35 dB", capacityCount: 8, gridCols: 12, gridRows: 8 },
  { id: "reference-library", nameKo: "자료 아카이브 서재", subtitleKo: "화보집과 해부학 서가가 둘러싼 고요한 레퍼런스 연구실", imagePath: "/assets/atelier/spaces/reference-library.webp", recommendedTimeOfDay: "dawn", recommendedWeather: "deep-focus", ambientSoundKo: "책장 넘김 · 22 dB", capacityCount: 4, gridCols: 12, gridRows: 8 },
  { id: "fantasy-guild-hall", nameKo: "판타지 길드 홀", subtitleKo: "팀 연재 회의를 위한 원탁과 촛불 샹들리에 합동 스튜디오", imagePath: "/assets/atelier/spaces/fantasy-guild-hall.webp", recommendedTimeOfDay: "sunset", recommendedWeather: "deep-focus", ambientSoundKo: "벽난로 장작 · 36 dB", capacityCount: 12, gridCols: 12, gridRows: 8 },
  { id: "comic-gallery", nameKo: "원화 코믹 갤러리", subtitleKo: "완성 원고를 전시하고 독자·동료 피드백을 나누는 쇼케이스 홀", imagePath: "/assets/atelier/spaces/comic-gallery.webp", recommendedTimeOfDay: "day", recommendedWeather: "clear-breeze", ambientSoundKo: "전시장 정적 · 24 dB", capacityCount: 10, gridCols: 12, gridRows: 8 },
] as const;

export const DEFAULT_FURNITURE_GRID: FurnitureGridSpec = { cols: 12, rows: 8, cellSizePx: 40 };

export const FURNITURE_CATALOG: readonly FurnitureCatalogItem[] = [
  { catalogId: "pen-display-desk", nameKo: "액정 타블렛 책상", categoryKo: "핵심 작업대", widthCells: 3, heightCells: 2, rotatable: true },
  { catalogId: "ergonomic-chair", nameKo: "인체공학 작업 의자", categoryKo: "좌석", widthCells: 1, heightCells: 1, rotatable: true },
  { catalogId: "espresso-bar", nameKo: "드립 커피 스테이션", categoryKo: "휴식 소품", widthCells: 2, heightCells: 1, rotatable: true },
  { catalogId: "reference-shelf", nameKo: "레퍼런스 자료 책장", categoryKo: "수납", widthCells: 2, heightCells: 1, rotatable: true },
  { catalogId: "monstera-pot", nameKo: "몬스테라 화분", categoryKo: "플랜테리어", widthCells: 1, heightCells: 1, rotatable: false },
  { catalogId: "drafting-lamp", nameKo: "아키텍트 데스크램프", categoryKo: "조명", widthCells: 1, heightCells: 1, rotatable: false },
  { catalogId: "pet-tower", nameKo: "반려동물 캣타워", categoryKo: "반려동물", widthCells: 2, heightCells: 2, rotatable: false },
] as const;

export const POMODORO_PRESETS: Readonly<Record<PomodoroPresetId, PomodoroPresetSpec>> = {
  "standard-25-5": { id: "standard-25-5", labelKo: "25/5 표준 마감", sprintDurationSec: 25 * 60, shortBreakDurationSec: 5 * 60, longBreakDurationSec: 15 * 60, longBreakEverySprints: 4 },
  "deep-50-10": { id: "deep-50-10", labelKo: "50/10 딥 포커스", sprintDurationSec: 50 * 60, shortBreakDurationSec: 10 * 60, longBreakDurationSec: 20 * 60, longBreakEverySprints: 4 },
  "quick-15-3": { id: "quick-15-3", labelKo: "15/3 러프 퀵", sprintDurationSec: 15 * 60, shortBreakDurationSec: 3 * 60, longBreakDurationSec: 10 * 60, longBreakEverySprints: 4 },
};

export const POMODORO_PRESET_LIST: readonly PomodoroPresetSpec[] = [
  POMODORO_PRESETS["standard-25-5"],
  POMODORO_PRESETS["deep-50-10"],
  POMODORO_PRESETS["quick-15-3"],
];

export const POMODORO_PHASE_LABEL_KO: Readonly<Record<PomodoroPhase, string>> = {
  idle: "대기 중",
  sprint: "팀 스프린트 집중",
  "short-break": "짧은 휴식 · 스트레칭",
  "long-break": "긴 휴식 · 재충전",
};

export function createDefaultLayeredAvatar(): LayeredAvatarConfig {
  return {
    hair: "wolf-short",
    expression: "calm-smile",
    top: "linen-shirt",
    bottom: "wide-cotton",
    genreOutfitPreset: "daily-atelier",
    studioPet: "calico-cat",
    protagonistImport: { active: false, workId: null, workTitleKo: null, characterNameKo: null, episodeTagKo: null, signaturePropKo: null },
  };
}

export function getGenreOutfitPresetById(id: GenreOutfitPresetId): GenreOutfitPresetSpec {
  return GENRE_OUTFIT_PRESETS.find((item) => item.id === id) ?? GENRE_OUTFIT_PRESETS[0];
}

export function getStudioThemeRoomById(id: StudioThemeRoomId): StudioThemeRoomSpec {
  return STUDIO_THEME_ROOMS.find((room) => room.id === id) ?? STUDIO_THEME_ROOMS[0];
}

/** 장르 의상 프리셋을 적용하고 어울리는 상·하의/헤어 구성을 선택적으로 동기화한다. */
export function applyGenreOutfitPreset(
  avatar: LayeredAvatarConfig,
  presetId: GenreOutfitPresetId,
  syncOutfitPieces: boolean = true,
): LayeredAvatarConfig {
  const preset = getGenreOutfitPresetById(presetId);
  if (!syncOutfitPieces) return { ...avatar, genreOutfitPreset: preset.id };
  return { ...avatar, genreOutfitPreset: preset.id, hair: preset.defaultHairId, top: preset.defaultTopId, bottom: preset.defaultBottomId };
}

/** `내 작품 주인공 불러오기` 슬롯에 작품 주인공 설정을 연결한다. */
export function importProtagonistToAvatar(avatar: LayeredAvatarConfig, source: ProtagonistWorkSource): LayeredAvatarConfig {
  const withGenre = applyGenreOutfitPreset(avatar, source.recommendedGenrePresetId, true);
  return {
    ...withGenre,
    hair: source.hairId,
    expression: source.expressionId,
    protagonistImport: {
      active: true,
      workId: source.workId,
      workTitleKo: source.workTitleKo,
      characterNameKo: source.characterNameKo,
      episodeTagKo: source.episodeTagKo,
      signaturePropKo: source.signaturePropKo,
    },
  };
}

export function clearImportedProtagonist(avatar: LayeredAvatarConfig): LayeredAvatarConfig {
  return {
    ...avatar,
    protagonistImport: { active: false, workId: null, workTitleKo: null, characterNameKo: null, episodeTagKo: null, signaturePropKo: null },
  };
}

/** 아바타 6슬롯 + 주인공 오버레이를 뒤→앞 렌더링 순서 배열로 투영한다. */
export function buildAvatarRenderLayers(avatar: LayeredAvatarConfig): readonly AvatarRenderLayerItem[] {
  const preset = getGenreOutfitPresetById(avatar.genreOutfitPreset);
  const pet = STUDIO_PET_OPTIONS.find((item) => item.id === avatar.studioPet) ?? STUDIO_PET_OPTIONS[0];
  const hair = AVATAR_HAIR_OPTIONS.find((item) => item.id === avatar.hair) ?? AVATAR_HAIR_OPTIONS[0];
  const expr = AVATAR_EXPRESSION_OPTIONS.find((item) => item.id === avatar.expression) ?? AVATAR_EXPRESSION_OPTIONS[0];
  const top = AVATAR_TOP_OPTIONS.find((item) => item.id === avatar.top) ?? AVATAR_TOP_OPTIONS[0];
  const bottom = AVATAR_BOTTOM_OPTIONS.find((item) => item.id === avatar.bottom) ?? AVATAR_BOTTOM_OPTIONS[0];

  const layers: AvatarRenderLayerItem[] = [
    { order: 0, slotKey: "genreOutfitPreset", layerId: `cape-${preset.id}`, labelKo: preset.capeStyleKo },
    { order: 1, slotKey: "bottom", layerId: `bottom-${bottom.id}`, labelKo: bottom.labelKo },
    { order: 2, slotKey: "top", layerId: `top-${top.id}`, labelKo: top.labelKo },
    { order: 3, slotKey: "expression", layerId: `expr-${expr.id}`, labelKo: expr.labelKo },
    { order: 4, slotKey: "hair", layerId: `hair-${hair.id}`, labelKo: hair.labelKo },
    { order: 5, slotKey: "studioPet", layerId: `pet-${pet.id}`, labelKo: pet.labelKo },
  ];
  if (avatar.protagonistImport.active && avatar.protagonistImport.characterNameKo) {
    layers.push({
      order: 6,
      slotKey: "protagonist-overlay",
      layerId: `protagonist-${avatar.protagonistImport.workId ?? "custom"}`,
      labelKo: `${avatar.protagonistImport.characterNameKo} (${avatar.protagonistImport.signaturePropKo ?? "주인공"})`,
    });
  }
  return layers;
}

export function getFurnitureCatalogItem(catalogId: string): FurnitureCatalogItem | null {
  return FURNITURE_CATALOG.find((item) => item.catalogId === catalogId) ?? null;
}

export function getEffectiveFurnitureSpan(
  item: FurnitureCatalogItem,
  rotationDeg: FurnitureRotationDeg,
): { readonly widthCells: number; readonly heightCells: number } {
  return rotationDeg === 90 || rotationDeg === 270
    ? { widthCells: item.heightCells, heightCells: item.widthCells }
    : { widthCells: item.widthCells, heightCells: item.heightCells };
}

/** 픽셀 좌표를 그리드 셀 좌표로 스냅한다. */
export function snapPixelToGridCell(
  pixelX: number,
  pixelY: number,
  grid: FurnitureGridSpec = DEFAULT_FURNITURE_GRID,
): { readonly col: number; readonly row: number } {
  const safeCell = Math.max(1, grid.cellSizePx);
  return {
    col: Math.max(0, Math.min(grid.cols - 1, Math.floor(pixelX / safeCell))),
    row: Math.max(0, Math.min(grid.rows - 1, Math.floor(pixelY / safeCell))),
  };
}

/** 후보 가구 배치의 경계 이탈 및 기존 가구와의 AABB 셀 충돌을 검사한다. */
export function checkFurniturePlacementCollision(
  placedItems: readonly PlacedFurnitureItem[],
  candidate: { readonly catalogId: string; readonly col: number; readonly row: number; readonly rotationDeg: FurnitureRotationDeg },
  grid: FurnitureGridSpec = DEFAULT_FURNITURE_GRID,
  ignoreInstanceId?: string,
): FurnitureCollisionResult {
  const spec = getFurnitureCatalogItem(candidate.catalogId);
  if (!spec) {
    return { ok: false, reason: "unknown-catalog", collidingInstanceIds: [], effectiveWidthCells: 0, effectiveHeightCells: 0, messageKo: "등록되지 않은 가구 항목입니다." };
  }
  const span = getEffectiveFurnitureSpan(spec, candidate.rotationDeg);
  const col = Math.floor(candidate.col);
  const row = Math.floor(candidate.row);

  if (col < 0 || row < 0 || col + span.widthCells > grid.cols || row + span.heightCells > grid.rows) {
    return {
      ok: false,
      reason: "out-of-bounds",
      collidingInstanceIds: [],
      effectiveWidthCells: span.widthCells,
      effectiveHeightCells: span.heightCells,
      messageKo: `${spec.nameKo}(${span.widthCells}×${span.heightCells})가 방 격자 경계를 벗어납니다.`,
    };
  }

  const collidingIds: string[] = [];
  for (const existing of placedItems) {
    if (ignoreInstanceId && existing.instanceId === ignoreInstanceId) continue;
    const existingSpec = getFurnitureCatalogItem(existing.catalogId);
    if (!existingSpec) continue;
    const existingSpan = getEffectiveFurnitureSpan(existingSpec, existing.rotationDeg);
    if (
      col < existing.col + existingSpan.widthCells &&
      col + span.widthCells > existing.col &&
      row < existing.row + existingSpan.heightCells &&
      row + span.heightCells > existing.row
    ) {
      collidingIds.push(existing.instanceId);
    }
  }

  if (collidingIds.length > 0) {
    return {
      ok: false,
      reason: "overlap",
      collidingInstanceIds: collidingIds,
      effectiveWidthCells: span.widthCells,
      effectiveHeightCells: span.heightCells,
      messageKo: `기존 배치 가구(${collidingIds.length}개)와 겹쳐 배치할 수 없습니다.`,
    };
  }

  return {
    ok: true,
    reason: null,
    collidingInstanceIds: [],
    effectiveWidthCells: span.widthCells,
    effectiveHeightCells: span.heightCells,
    messageKo: `${spec.nameKo} (${col}, ${row}) 배치 가능`,
  };
}

export function createDefaultDeskLayout(): readonly PlacedFurnitureItem[] {
  return [
    { instanceId: "desk-main", catalogId: "pen-display-desk", col: 4, row: 2, rotationDeg: 0 },
    { instanceId: "chair-main", catalogId: "ergonomic-chair", col: 5, row: 4, rotationDeg: 0 },
    { instanceId: "coffee-side", catalogId: "espresso-bar", col: 9, row: 1, rotationDeg: 0 },
    { instanceId: "shelf-left", catalogId: "reference-shelf", col: 1, row: 1, rotationDeg: 0 },
    { instanceId: "lamp-corner", catalogId: "drafting-lamp", col: 7, row: 2, rotationDeg: 0 },
  ];
}

export function placeFurnitureItem(
  placedItems: readonly PlacedFurnitureItem[],
  candidate: PlacedFurnitureItem,
  grid: FurnitureGridSpec = DEFAULT_FURNITURE_GRID,
): FurnitureMutationResult {
  const snapped: PlacedFurnitureItem = { ...candidate, col: Math.floor(candidate.col), row: Math.floor(candidate.row) };
  const collision = checkFurniturePlacementCollision(placedItems, snapped, grid);
  return collision.ok ? { items: [...placedItems, snapped], accepted: true, collision } : { items: placedItems, accepted: false, collision };
}

export function moveFurnitureItem(
  placedItems: readonly PlacedFurnitureItem[],
  instanceId: string,
  nextCol: number,
  nextRow: number,
  grid: FurnitureGridSpec = DEFAULT_FURNITURE_GRID,
): FurnitureMutationResult {
  const target = placedItems.find((item) => item.instanceId === instanceId);
  if (!target) {
    return {
      items: placedItems,
      accepted: false,
      collision: { ok: false, reason: "unknown-catalog", collidingInstanceIds: [], effectiveWidthCells: 0, effectiveHeightCells: 0, messageKo: "이동할 가구를 찾지 못했습니다." },
    };
  }
  const candidate = { ...target, col: Math.floor(nextCol), row: Math.floor(nextRow) };
  const collision = checkFurniturePlacementCollision(placedItems, candidate, grid, instanceId);
  if (!collision.ok) return { items: placedItems, accepted: false, collision };
  return { items: placedItems.map((item) => (item.instanceId === instanceId ? candidate : item)), accepted: true, collision };
}

export function rotateFurnitureItem(
  placedItems: readonly PlacedFurnitureItem[],
  instanceId: string,
  grid: FurnitureGridSpec = DEFAULT_FURNITURE_GRID,
): FurnitureMutationResult {
  const target = placedItems.find((item) => item.instanceId === instanceId);
  if (!target) {
    return {
      items: placedItems,
      accepted: false,
      collision: { ok: false, reason: "unknown-catalog", collidingInstanceIds: [], effectiveWidthCells: 0, effectiveHeightCells: 0, messageKo: "회전할 가구를 찾지 못했습니다." },
    };
  }
  const candidate: PlacedFurnitureItem = { ...target, rotationDeg: ((target.rotationDeg + 90) % 360) as FurnitureRotationDeg };
  const collision = checkFurniturePlacementCollision(placedItems, candidate, grid, instanceId);
  if (!collision.ok) return { items: placedItems, accepted: false, collision };
  return { items: placedItems.map((item) => (item.instanceId === instanceId ? candidate : item)), accepted: true, collision };
}

export function removeFurnitureItem(placedItems: readonly PlacedFurnitureItem[], instanceId: string): readonly PlacedFurnitureItem[] {
  return placedItems.filter((item) => item.instanceId !== instanceId);
}

export function createTeamPomodoroState(
  presetId: PomodoroPresetId = "standard-25-5",
  roomSessionId: string = "atelier-sprint-01",
): TeamPomodoroState {
  const preset = POMODORO_PRESETS[presetId];
  return {
    roomSessionId,
    hostNameKo: "방장 · 원화 작가",
    presetId,
    phase: "sprint",
    running: false,
    phaseElapsedSec: 0,
    phaseDurationSec: preset.sprintDurationSec,
    completedSprints: 0,
    totalFocusedSec: 0,
    syncRevision: 1,
    lastDriftMs: 0,
    syncedPeers: [
      { peerId: "peer-line", nameKo: "민서 · 선화 어시", taskKo: "12화 14~22컷 펜선", synced: true },
      { peerId: "peer-color", nameKo: "도윤 · 채색 담당", taskKo: "노을 배경 톤 보정", synced: true },
      { peerId: "peer-bg", nameKo: "하린 · 3D 배경", taskKo: "서재 책장 라이팅", synced: true },
    ],
  };
}

export function switchPomodoroPreset(state: TeamPomodoroState, presetId: PomodoroPresetId): TeamPomodoroState {
  const preset = POMODORO_PRESETS[presetId];
  return { ...state, presetId, phase: "sprint", running: false, phaseElapsedSec: 0, phaseDurationSec: preset.sprintDurationSec, syncRevision: state.syncRevision + 1 };
}

function getPhaseDurationSec(preset: PomodoroPresetSpec, phase: PomodoroPhase): number {
  if (phase === "short-break") return preset.shortBreakDurationSec;
  if (phase === "long-break") return preset.longBreakDurationSec;
  return preset.sprintDurationSec;
}

export function startTeamPomodoro(state: TeamPomodoroState): TeamPomodoroState {
  const preset = POMODORO_PRESETS[state.presetId];
  const nextPhase: PomodoroPhase = state.phase === "idle" ? "sprint" : state.phase;
  return { ...state, phase: nextPhase, running: true, phaseDurationSec: getPhaseDurationSec(preset, nextPhase), syncRevision: state.syncRevision + 1 };
}

export function pauseTeamPomodoro(state: TeamPomodoroState): TeamPomodoroState {
  return state.running ? { ...state, running: false, syncRevision: state.syncRevision + 1 } : state;
}

export function resetTeamPomodoro(state: TeamPomodoroState): TeamPomodoroState {
  const preset = POMODORO_PRESETS[state.presetId];
  return { ...state, phase: "sprint", running: false, phaseElapsedSec: 0, phaseDurationSec: preset.sprintDurationSec, syncRevision: state.syncRevision + 1 };
}

function advanceToNextPomodoroPhase(state: TeamPomodoroState): PomodoroTickResult {
  const preset = POMODORO_PRESETS[state.presetId];
  const previousPhase = state.phase;
  if (state.phase === "sprint") {
    const nextCompleted = state.completedSprints + 1;
    const isLongBreak = nextCompleted % preset.longBreakEverySprints === 0;
    const nextPhase: PomodoroPhase = isLongBreak ? "long-break" : "short-break";
    const nextDuration = getPhaseDurationSec(preset, nextPhase);
    return {
      nextState: { ...state, phase: nextPhase, phaseElapsedSec: 0, phaseDurationSec: nextDuration, completedSprints: nextCompleted, syncRevision: state.syncRevision + 1 },
      phaseTransitioned: true,
      previousPhase,
      announcementKo: isLongBreak
        ? `${nextCompleted}회차 스프린트 완료! 팀 긴 휴식(${Math.round(nextDuration / 60)}분)으로 전환합니다.`
        : `${nextCompleted}회차 스프린트 완료! 팀 짧은 휴식(${Math.round(nextDuration / 60)}분)을 시작합니다.`,
    };
  }
  return {
    nextState: { ...state, phase: "sprint", phaseElapsedSec: 0, phaseDurationSec: preset.sprintDurationSec, syncRevision: state.syncRevision + 1 },
    phaseTransitioned: true,
    previousPhase,
    announcementKo: `휴식 종료! 다음 팀 스프린트(${Math.round(preset.sprintDurationSec / 60)}분)에 돌입합니다.`,
  };
}

export function skipTeamPomodoroPhase(state: TeamPomodoroState): PomodoroTickResult {
  return advanceToNextPomodoroPhase(state);
}

/** 팀 뽀모도로 타이머를 `deltaSec`만큼 진행하고 단계 완료 시 자동 전환한다. */
export function tickTeamPomodoro(state: TeamPomodoroState, deltaSec: number): PomodoroTickResult {
  if (!state.running || deltaSec <= 0 || !Number.isFinite(deltaSec)) {
    return { nextState: state, phaseTransitioned: false, previousPhase: state.phase, announcementKo: null };
  }
  const remaining = Math.max(0, state.phaseDurationSec - state.phaseElapsedSec);
  const focusedGain = state.phase === "sprint" ? Math.min(deltaSec, remaining) : 0;

  if (deltaSec >= remaining) {
    const transitioned = advanceToNextPomodoroPhase({ ...state, totalFocusedSec: state.totalFocusedSec + focusedGain });
    const carrySec = deltaSec - remaining;
    if (carrySec > 0 && carrySec < transitioned.nextState.phaseDurationSec) {
      return { ...transitioned, nextState: { ...transitioned.nextState, phaseElapsedSec: carrySec } };
    }
    return transitioned;
  }
  return {
    nextState: { ...state, phaseElapsedSec: state.phaseElapsedSec + deltaSec, totalFocusedSec: state.totalFocusedSec + focusedGain },
    phaseTransitioned: false,
    previousPhase: state.phase,
    announcementKo: null,
  };
}

/** 호스트 동기화 패킷을 반영하고 네트워크 지연 기반 시계 드리프트(ms)를 보정한다. */
export function applyTeamPomodoroSyncPacket(
  localState: TeamPomodoroState,
  packet: TeamPomodoroSyncPacket,
  localNowMs: number,
): TeamPomodoroState {
  if (packet.roomSessionId !== localState.roomSessionId || packet.syncRevision < localState.syncRevision) return localState;
  const durationSec = getPhaseDurationSec(POMODORO_PRESETS[localState.presetId], packet.phase);
  const driftMs = Math.max(-5000, Math.min(5000, Math.round(localNowMs - packet.hostTimestampMs)));
  const compensatedElapsed = packet.running
    ? Math.max(0, Math.min(durationSec, packet.phaseElapsedSec + Math.max(0, driftMs) / 1000))
    : Math.max(0, Math.min(durationSec, packet.phaseElapsedSec));
  return {
    ...localState,
    phase: packet.phase,
    running: packet.running,
    phaseElapsedSec: compensatedElapsed,
    phaseDurationSec: durationSec,
    completedSprints: packet.completedSprints,
    syncRevision: packet.syncRevision,
    lastDriftMs: driftMs,
  };
}

export function getPomodoroRemainingSec(state: TeamPomodoroState): number {
  return Math.max(0, Math.ceil(state.phaseDurationSec - state.phaseElapsedSec));
}

export function formatPomodoroClock(remainingSec: number): string {
  const clamped = Math.max(0, Math.floor(remainingSec));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}
