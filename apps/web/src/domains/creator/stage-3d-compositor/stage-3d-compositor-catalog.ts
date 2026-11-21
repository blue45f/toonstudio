/**
 * 3D 배경 + 3D 캐릭터 통합 합성 스테이지 정적 카탈로그 · 타입 · OKLCH 색상 유틸 (Wave 13D).
 *
 * - Blender 5.3.0 생성 히어로 4종 + 기존 BG3D 고밀도 세트 6종 = 총 10종 배경 슬롯 및 계단/단차 구역 정의
 * - 낮/노을/야경/새벽 4시간대 OKLCH 조명 프로파일
 * - 8종 한국 웹툰 대표 구도 프레이밍 카탈로그 및 10종 아키타입 체격·무기 여백 스펙
 */

import {
  RICH_WEBTOON_SCENE_PRESETS,
  type RichWebtoonScenePresetId,
} from "../bg3d/studio-bg3d-rich-scene-presets-catalog";
import {
  KWEBTOON_HERO_GLB_CATALOG,
  type KWebtoonArchetypeBridgeId,
  type KWebtoonCelPresetId,
  type KWebtoonHeroGlbId,
} from "../studio-3d-pro/kwebtoon-npr-ink-contract";

export interface StageOklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export type StageTimeOfDayId = "day" | "sunset" | "night" | "dawn";
export type StageAspectRatioId = "16:9" | "9:16" | "4:5";
export type StageCrowdDensityId = "none" | "sparse" | "medium" | "bustling";
export type StageCharacterSourceKind = "kwebtoon-archetype" | "vrm-avatar";
export type StageCharacterStanceId = "standing" | "action-guard" | "seated" | "leaning" | "walking";
export type StageSurfaceKind = "floor" | "stair" | "terrace" | "altar" | "curb";
export type StageBackgroundSlotId = KWebtoonHeroGlbId | RichWebtoonScenePresetId;

export type WebtoonCompositeFramingId =
  | "two-shot-confrontation"
  | "rofan-stair-low-angle"
  | "seoul-rooftop-backshot"
  | "murim-wide-duel"
  | "academy-corridor-trio"
  | "office-ots-dialogue"
  | "solo-hero-establishing"
  | "banquet-high-overview";

export type CompositeBakePassCode =
  | "10_BG_3D_LT"
  | "20_CHAR_LINEART"
  | "30_CHAR_FLAT"
  | "40_CONTACT_SHADOW"
  | "50_RIM_ATMOSPHERE";

export const COMPOSITE_BAKE_PASS_ORDER: readonly CompositeBakePassCode[] = Object.freeze([
  "10_BG_3D_LT",
  "20_CHAR_LINEART",
  "30_CHAR_FLAT",
  "40_CONTACT_SHADOW",
  "50_RIM_ATMOSPHERE",
]);

export const STAGE_ASPECT_DIMENSIONS: Readonly<Record<StageAspectRatioId, readonly [number, number]>> =
  Object.freeze({
    "16:9": Object.freeze([1920, 1080] as const),
    "9:16": Object.freeze([1080, 1920] as const),
    "4:5": Object.freeze([1080, 1350] as const),
  });

export const MIN_STAGE_CHARACTERS = 1;
export const MAX_STAGE_CHARACTERS = 3;

export const DEFAULT_ENABLED_BAKE_PASSES: Readonly<Record<CompositeBakePassCode, boolean>> = Object.freeze({
  "10_BG_3D_LT": true,
  "20_CHAR_LINEART": true,
  "30_CHAR_FLAT": true,
  "40_CONTACT_SHADOW": true,
  "50_RIM_ATMOSPHERE": true,
});

export function clampStageNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function roundStage3(value: number): number {
  const r = Math.round(value * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

export function roundStage4(value: number): number {
  const r = Math.round(value * 10000) / 10000;
  return Object.is(r, -0) ? 0 : r;
}

const oklch = (l: number, c: number, h: number): StageOklchColor => Object.freeze({ l, c, h });

export function formatStageOklch(color: StageOklchColor, alpha?: number): string {
  const l = roundStage3(clampStageNumber(color.l, 0, 1));
  const c = roundStage3(clampStageNumber(color.c, 0, 0.36));
  const h = roundStage3(((color.h % 360) + 360) % 360);
  if (alpha !== undefined && alpha < 1) {
    return `oklch(${l} ${c} ${h} / ${roundStage3(clampStageNumber(alpha, 0, 1))})`;
  }
  return `oklch(${l} ${c} ${h})`;
}

export function mixStageOklch(a: StageOklchColor, b: StageOklchColor, ratio: number): StageOklchColor {
  const t = clampStageNumber(ratio, 0, 1);
  let deltaH = ((b.h - a.h + 540) % 360) - 180;
  if (deltaH < -180) deltaH += 360;
  return oklch(
    roundStage3(a.l + (b.l - a.l) * t),
    roundStage3(a.c + (b.c - a.c) * t),
    roundStage3(((a.h + deltaH * t) % 360 + 360) % 360),
  );
}

// ── 배경 슬롯 10종 (Blender 5.3 히어로 4종 + 기존 BG3D 세트 6종) ────────────

export interface StageElevationZone {
  readonly id: string;
  readonly labelKo: string;
  readonly surfaceKind: StageSurfaceKind;
  readonly shape: "rect" | "circle";
  readonly centerX: number;
  readonly centerZ: number;
  readonly halfWidthX: number;
  readonly halfDepthZ: number;
  readonly radiusM?: number;
  readonly elevationY: number;
}

export interface StageBackgroundSlot {
  readonly id: StageBackgroundSlotId;
  readonly sourceKind: "blender-hero-glb" | "bg3d-rich-preset";
  readonly titleKo: string;
  readonly subtitleKo: string;
  readonly genreKo: string;
  readonly glbUrl?: string;
  readonly previewUrl?: string;
  readonly richPresetId?: RichWebtoonScenePresetId;
  readonly recommendedTimeOfDay: StageTimeOfDayId;
  readonly recommendedCelPresetId: KWebtoonCelPresetId;
  readonly recommendedFramingId: WebtoonCompositeFramingId;
  readonly footprintMeters: readonly [number, number, number];
  readonly floorRoughness: number;
  readonly floorBounceOklch: StageOklchColor;
  readonly backdropAccentOklch: StageOklchColor;
  readonly elevationZones: readonly StageElevationZone[];
}

const rectZone = (
  id: string,
  labelKo: string,
  surfaceKind: StageSurfaceKind,
  centerX: number,
  centerZ: number,
  halfWidthX: number,
  halfDepthZ: number,
  elevationY: number,
): StageElevationZone =>
  Object.freeze({ id, labelKo, surfaceKind, shape: "rect", centerX, centerZ, halfWidthX, halfDepthZ, elevationY });

const circleZone = (
  id: string,
  labelKo: string,
  surfaceKind: StageSurfaceKind,
  centerX: number,
  centerZ: number,
  radiusM: number,
  elevationY: number,
): StageElevationZone =>
  Object.freeze({
    id, labelKo, surfaceKind, shape: "circle", centerX, centerZ, halfWidthX: radiusM, halfDepthZ: radiusM, radiusM, elevationY,
  });

const HERO_STAGE_SPECS: Readonly<Record<KWebtoonHeroGlbId, {
  readonly genreKo: string;
  readonly timeOfDay: StageTimeOfDayId;
  readonly framingId: WebtoonCompositeFramingId;
  readonly footprint: readonly [number, number, number];
  readonly floorRoughness: number;
  readonly floorBounce: StageOklchColor;
  readonly accent: StageOklchColor;
  readonly zones: readonly StageElevationZone[];
}>> = Object.freeze({
  "rofan-imperial-arch-chandelier": {
    genreKo: "로맨스 판타지 · Blender 5.3", timeOfDay: "dawn", framingId: "rofan-stair-low-angle",
    footprint: [8.0, 5.2, 8.0], floorRoughness: 0.14, floorBounce: oklch(0.88, 0.04, 72), accent: oklch(0.78, 0.1, 332),
    zones: [
      rectZone("imperial-stair-1", "대리석 1단 계단", "stair", 0, -0.9, 2.2, 0.45, 0.18),
      rectZone("imperial-stair-2", "대리석 2단 계단", "stair", 0, -1.75, 2.2, 0.45, 0.36),
      rectZone("imperial-landing", "황궁 아치 상단 참", "terrace", 0, -2.85, 2.6, 0.85, 0.54),
    ],
  },
  "seoul-rooftop-cafe-terrace": {
    genreKo: "현대 감성 · Blender 5.3", timeOfDay: "sunset", framingId: "seoul-rooftop-backshot",
    footprint: [7.6, 3.8, 7.2], floorRoughness: 0.42, floorBounce: oklch(0.68, 0.07, 55), accent: oklch(0.74, 0.13, 48),
    zones: [
      rectZone("cafe-wood-deck", "우드 데크 테라스", "terrace", 0, -0.6, 2.6, 1.4, 0.16),
      rectZone("cafe-upper-lounge", "퍼걸러 상단 테라스", "terrace", 0, -2.35, 2.2, 0.7, 0.32),
    ],
  },
  "murim-jade-sword-altar": {
    genreKo: "무협·헌터 · Blender 5.3", timeOfDay: "night", framingId: "murim-wide-duel",
    footprint: [9.0, 4.8, 9.0], floorRoughness: 0.36, floorBounce: oklch(0.48, 0.1, 190), accent: oklch(0.68, 0.16, 205),
    zones: [
      circleZone("altar-tier-1", "팔각 현무암 1단 기단", "altar", 0, -1.1, 2.4, 0.22),
      circleZone("altar-tier-2", "팔각 룬 2단 기단", "altar", 0, -1.1, 1.55, 0.44),
      circleZone("altar-tier-3", "청옥보검 최상단 제단", "altar", 0, -1.1, 0.82, 0.66),
    ],
  },
  "kwebtoon-bust-mannequin-atelier": {
    genreKo: "작화 아틀리에 · Blender 5.3", timeOfDay: "day", framingId: "solo-hero-establishing",
    footprint: [6.4, 3.6, 6.4], floorRoughness: 0.3, floorBounce: oklch(0.86, 0.02, 80), accent: oklch(0.76, 0.08, 285),
    zones: [rectZone("atelier-plinth", "아틀리에 전시 단상", "terrace", 0, -1.2, 1.4, 1.0, 0.12)],
  },
});

const RICH_BG3D_STAGE_SPECS: Readonly<Record<RichWebtoonScenePresetId, {
  readonly timeOfDay: StageTimeOfDayId;
  readonly celPresetId: KWebtoonCelPresetId;
  readonly framingId: WebtoonCompositeFramingId;
  readonly floorBounce: StageOklchColor;
  readonly accent: StageOklchColor;
  readonly zones: readonly StageElevationZone[];
}>> = Object.freeze({
  "seoul-neon-alley": {
    timeOfDay: "night", celPresetId: "noir-deep-ink", framingId: "two-shot-confrontation",
    floorBounce: oklch(0.36, 0.11, 245), accent: oklch(0.66, 0.18, 215),
    zones: [
      rectZone("alley-curb-left", "좌측 상가 보도블록", "curb", -2.6, 0, 1.2, 5.5, 0.15),
      rectZone("alley-curb-right", "우측 상가 보도블록", "curb", 2.6, 0, 1.2, 5.5, 0.15),
    ],
  },
  "sunlit-atelier-cafe": {
    timeOfDay: "day", celPresetId: "daily-warm-sun", framingId: "office-ots-dialogue",
    floorBounce: oklch(0.82, 0.06, 68), accent: oklch(0.78, 0.11, 68),
    zones: [rectZone("cafe-window-stage", "창가 단차 마루", "terrace", -2.0, -1.4, 1.6, 1.5, 0.14)],
  },
  "rofan-imperial-banquet": {
    timeOfDay: "dawn", celPresetId: "rofan-pastel", framingId: "banquet-high-overview",
    floorBounce: oklch(0.86, 0.05, 76), accent: oklch(0.76, 0.11, 330),
    zones: [
      rectZone("banquet-step-1", "연회장 단상 1단", "stair", 0, -1.4, 3.2, 0.6, 0.2),
      rectZone("banquet-step-2", "연회장 단상 2단", "stair", 0, -2.6, 3.2, 0.7, 0.4),
      rectZone("banquet-throne-dais", "황실 주빈 단상", "terrace", 0, -4.1, 3.4, 1.1, 0.6),
    ],
  },
  "academy-sunset-rooftop": {
    timeOfDay: "sunset", celPresetId: "daily-warm-sun", framingId: "academy-corridor-trio",
    floorBounce: oklch(0.68, 0.05, 52), accent: oklch(0.73, 0.14, 42),
    zones: [rectZone("rooftop-stair-landing", "옥탑 계단실 참", "stair", -2.6, -1.6, 1.4, 1.2, 0.3)],
  },
  "cyber-subway-platform": {
    timeOfDay: "night", celPresetId: "hunter-neon", framingId: "two-shot-confrontation",
    floorBounce: oklch(0.44, 0.1, 225), accent: oklch(0.68, 0.16, 225),
    zones: [rectZone("subway-safety-zone", "스크린도어 안전 단차", "curb", 2.2, 0, 1.0, 6.0, 0.12)],
  },
  "modern-webtoon-office": {
    timeOfDay: "day", celPresetId: "daily-warm-sun", framingId: "office-ots-dialogue",
    floorBounce: oklch(0.8, 0.03, 215), accent: oklch(0.64, 0.11, 165),
    zones: [rectZone("office-lounge-deck", "회의 라운지 단상", "terrace", 0, -2.2, 2.6, 1.2, 0.15)],
  },
});

export const STAGE_BACKGROUND_SLOTS: readonly StageBackgroundSlot[] = Object.freeze([
  ...KWEBTOON_HERO_GLB_CATALOG.map((hero): StageBackgroundSlot => {
    const spec = HERO_STAGE_SPECS[hero.id];
    return Object.freeze({
      id: hero.id, sourceKind: "blender-hero-glb", titleKo: hero.titleKo, subtitleKo: hero.subtitleKo,
      genreKo: spec.genreKo, glbUrl: hero.glbUrl, previewUrl: hero.previewUrl,
      recommendedTimeOfDay: spec.timeOfDay, recommendedCelPresetId: hero.recommendedPresetId,
      recommendedFramingId: spec.framingId, footprintMeters: spec.footprint, floorRoughness: spec.floorRoughness,
      floorBounceOklch: spec.floorBounce, backdropAccentOklch: spec.accent, elevationZones: spec.zones,
    });
  }),
  ...RICH_WEBTOON_SCENE_PRESETS.map((preset): StageBackgroundSlot => {
    const spec = RICH_BG3D_STAGE_SPECS[preset.id];
    return Object.freeze({
      id: preset.id, sourceKind: "bg3d-rich-preset", titleKo: preset.labelKo, subtitleKo: preset.descriptionKo,
      genreKo: `${preset.categoryKo} · BG3D 세트`, richPresetId: preset.id,
      recommendedTimeOfDay: spec.timeOfDay, recommendedCelPresetId: spec.celPresetId,
      recommendedFramingId: spec.framingId, footprintMeters: preset.footprintMeters,
      floorRoughness: preset.groundRoughness, floorBounceOklch: spec.floorBounce,
      backdropAccentOklch: spec.accent, elevationZones: spec.zones,
    });
  }),
]);

export function getStageBackgroundSlot(id: StageBackgroundSlotId): StageBackgroundSlot {
  return STAGE_BACKGROUND_SLOTS.find((slot) => slot.id === id) ?? STAGE_BACKGROUND_SLOTS[0];
}

// ── 10종 아키타입 체격 · 4시간대 OKLCH 조명 · 8종 웹툰 구도 ────────────────

export const STAGE_ARCHETYPE_COMBAT_SPECS: Readonly<
  Record<KWebtoonArchetypeBridgeId, { readonly shoulder: number; readonly weapon: number; readonly color: StageOklchColor }>
> = Object.freeze({
  "kwebtoon-rofan-princess": { shoulder: 0.24, weapon: 0.08, color: oklch(0.78, 0.12, 338) },
  "kwebtoon-northern-duke": { shoulder: 0.3, weapon: 0.36, color: oklch(0.44, 0.09, 255) },
  "kwebtoon-academy-heroine": { shoulder: 0.22, weapon: 0.06, color: oklch(0.76, 0.12, 24) },
  "kwebtoon-academy-hero": { shoulder: 0.27, weapon: 0.06, color: oklch(0.54, 0.11, 235) },
  "kwebtoon-srank-hunter": { shoulder: 0.29, weapon: 0.42, color: oklch(0.62, 0.16, 215) },
  "kwebtoon-srank-healer": { shoulder: 0.24, weapon: 0.26, color: oklch(0.76, 0.12, 168) },
  "kwebtoon-office-ceo": { shoulder: 0.28, weapon: 0.05, color: oklch(0.42, 0.06, 250) },
  "kwebtoon-modern-heroine": { shoulder: 0.23, weapon: 0.05, color: oklch(0.74, 0.11, 35) },
  "kwebtoon-murim-swordsman": { shoulder: 0.28, weapon: 0.48, color: oklch(0.6, 0.14, 185) },
  "kwebtoon-sd-mascot": { shoulder: 0.21, weapon: 0.04, color: oklch(0.82, 0.14, 88) },
});

export interface StageTimeOfDayLightingProfile {
  readonly id: StageTimeOfDayId;
  readonly labelKo: string;
  readonly kelvin: number;
  readonly sunElevationDeg: number;
  readonly sunAzimuthDeg: number;
  readonly keyLightOklch: StageOklchColor;
  readonly rimLightOklch: StageOklchColor;
  readonly ambientSkyOklch: StageOklchColor;
  readonly shadowTintOklch: StageOklchColor;
  readonly atmosphereTintOklch: StageOklchColor;
  readonly contactShadowOpacity: number;
  readonly contactShadowSoftnessM: number;
}

export const STAGE_TIME_OF_DAY_PROFILES: Readonly<Record<StageTimeOfDayId, StageTimeOfDayLightingProfile>> =
  Object.freeze({
    day: {
      id: "day", labelKo: "낮 (5600K)", kelvin: 5600, sunElevationDeg: 58, sunAzimuthDeg: 32,
      keyLightOklch: oklch(0.96, 0.03, 86), rimLightOklch: oklch(0.94, 0.05, 92),
      ambientSkyOklch: oklch(0.88, 0.05, 228), shadowTintOklch: oklch(0.34, 0.05, 252),
      atmosphereTintOklch: oklch(0.92, 0.04, 225), contactShadowOpacity: 0.52, contactShadowSoftnessM: 0.14,
    },
    sunset: {
      id: "sunset", labelKo: "노을 (3100K)", kelvin: 3100, sunElevationDeg: 18, sunAzimuthDeg: -68,
      keyLightOklch: oklch(0.8, 0.15, 46), rimLightOklch: oklch(0.86, 0.17, 52),
      ambientSkyOklch: oklch(0.56, 0.11, 310), shadowTintOklch: oklch(0.28, 0.09, 292),
      atmosphereTintOklch: oklch(0.74, 0.14, 42), contactShadowOpacity: 0.58, contactShadowSoftnessM: 0.22,
    },
    night: {
      id: "night", labelKo: "야경 (7800K)", kelvin: 7800, sunElevationDeg: 34, sunAzimuthDeg: -132,
      keyLightOklch: oklch(0.54, 0.11, 250), rimLightOklch: oklch(0.78, 0.16, 215),
      ambientSkyOklch: oklch(0.24, 0.06, 262), shadowTintOklch: oklch(0.18, 0.05, 265),
      atmosphereTintOklch: oklch(0.34, 0.09, 248), contactShadowOpacity: 0.68, contactShadowSoftnessM: 0.18,
    },
    dawn: {
      id: "dawn", labelKo: "새벽 (4300K)", kelvin: 4300, sunElevationDeg: 24, sunAzimuthDeg: 74,
      keyLightOklch: oklch(0.86, 0.09, 350), rimLightOklch: oklch(0.9, 0.1, 34),
      ambientSkyOklch: oklch(0.72, 0.08, 286), shadowTintOklch: oklch(0.36, 0.07, 278),
      atmosphereTintOklch: oklch(0.82, 0.08, 318), contactShadowOpacity: 0.44, contactShadowSoftnessM: 0.26,
    },
  });

export const STAGE_TIME_OF_DAY_LIST: readonly StageTimeOfDayLightingProfile[] = Object.freeze([
  STAGE_TIME_OF_DAY_PROFILES.day,
  STAGE_TIME_OF_DAY_PROFILES.sunset,
  STAGE_TIME_OF_DAY_PROFILES.night,
  STAGE_TIME_OF_DAY_PROFILES.dawn,
]);

export interface FramingCharacterPlacement {
  readonly archetypeId: KWebtoonArchetypeBridgeId;
  readonly positionXZ: readonly [number, number];
  readonly facingYawRad: number;
  readonly stance: StageCharacterStanceId;
}

export interface WebtoonCompositeFramingPreset {
  readonly id: WebtoonCompositeFramingId;
  readonly labelKo: string;
  readonly subtitleKo: string;
  readonly recommendedActorCount: 1 | 2 | 3;
  readonly focalLengthMm: number;
  readonly fovDeg: number;
  readonly dutchRollDeg: number;
  readonly cameraPositionM: readonly [number, number, number];
  readonly cameraTargetM: readonly [number, number, number];
  readonly recommendedAspectRatio: StageAspectRatioId;
  readonly defaultPlacements: readonly FramingCharacterPlacement[];
}

export const WEBTOON_COMPOSITE_FRAMING_PRESETS: readonly WebtoonCompositeFramingPreset[] = Object.freeze([
  {
    id: "two-shot-confrontation", labelKo: "투샷 대치", subtitleKo: "35mm 정면 긴장 대치 컷",
    recommendedActorCount: 2, focalLengthMm: 35, fovDeg: 38, dutchRollDeg: -2.5,
    cameraPositionM: [0.1, 1.25, 3.6], cameraTargetM: [0, 1.15, 0.2], recommendedAspectRatio: "9:16",
    defaultPlacements: [
      { archetypeId: "kwebtoon-srank-hunter", positionXZ: [-0.95, 0.45], facingYawRad: 1.25, stance: "action-guard" },
      { archetypeId: "kwebtoon-northern-duke", positionXZ: [0.95, 0.25], facingYawRad: -1.35, stance: "standing" },
    ],
  },
  {
    id: "rofan-stair-low-angle", labelKo: "로판 계단 앙각", subtitleKo: "28mm 계단 단차 위압 로우앵글",
    recommendedActorCount: 2, focalLengthMm: 28, fovDeg: 46, dutchRollDeg: 0,
    cameraPositionM: [0.25, 0.92, 3.2], cameraTargetM: [0, 1.48, -1.6], recommendedAspectRatio: "9:16",
    defaultPlacements: [
      { archetypeId: "kwebtoon-rofan-princess", positionXZ: [-0.45, -1.75], facingYawRad: 0.25, stance: "standing" },
      { archetypeId: "kwebtoon-northern-duke", positionXZ: [0.75, -0.85], facingYawRad: -0.55, stance: "standing" },
    ],
  },
  {
    id: "seoul-rooftop-backshot", labelKo: "서울 루프탑 감성 백샷", subtitleKo: "50mm 노을 역광 실루엣 백샷",
    recommendedActorCount: 2, focalLengthMm: 50, fovDeg: 28, dutchRollDeg: 0,
    cameraPositionM: [0.35, 1.42, 2.8], cameraTargetM: [0, 1.32, -1.2], recommendedAspectRatio: "4:5",
    defaultPlacements: [
      { archetypeId: "kwebtoon-academy-heroine", positionXZ: [-0.55, -0.65], facingYawRad: 2.9, stance: "leaning" },
      { archetypeId: "kwebtoon-academy-hero", positionXZ: [0.55, -0.75], facingYawRad: -2.85, stance: "leaning" },
    ],
  },
  {
    id: "murim-wide-duel", labelKo: "무협 광각 결투", subtitleKo: "24mm 제단 단차·보검 대각 광각 컷",
    recommendedActorCount: 2, focalLengthMm: 24, fovDeg: 54, dutchRollDeg: -5,
    cameraPositionM: [0.6, 1.05, 4.1], cameraTargetM: [0, 1.25, -0.9], recommendedAspectRatio: "16:9",
    defaultPlacements: [
      { archetypeId: "kwebtoon-murim-swordsman", positionXZ: [-0.85, -0.95], facingYawRad: 1.15, stance: "action-guard" },
      { archetypeId: "kwebtoon-srank-hunter", positionXZ: [1.15, 0.35], facingYawRad: -1.45, stance: "action-guard" },
    ],
  },
  {
    id: "academy-corridor-trio", labelKo: "학원 복도 3인 샷", subtitleKo: "35mm 삼각 깊이 3인 앙상블 컷",
    recommendedActorCount: 3, focalLengthMm: 35, fovDeg: 38, dutchRollDeg: 0,
    cameraPositionM: [0, 1.36, 3.9], cameraTargetM: [0, 1.2, -0.4], recommendedAspectRatio: "9:16",
    defaultPlacements: [
      { archetypeId: "kwebtoon-academy-heroine", positionXZ: [0, 0.55], facingYawRad: 0.1, stance: "walking" },
      { archetypeId: "kwebtoon-academy-hero", positionXZ: [-1.1, -0.35], facingYawRad: 0.45, stance: "standing" },
      { archetypeId: "kwebtoon-srank-healer", positionXZ: [1.15, -0.55], facingYawRad: -0.4, stance: "standing" },
    ],
  },
  {
    id: "office-ots-dialogue", labelKo: "오피스 어깨너머 대화", subtitleKo: "65mm 망원 OTS 시선 교차 컷",
    recommendedActorCount: 2, focalLengthMm: 65, fovDeg: 22, dutchRollDeg: 0,
    cameraPositionM: [-1.35, 1.48, 2.3], cameraTargetM: [0.55, 1.38, -0.4], recommendedAspectRatio: "4:5",
    defaultPlacements: [
      { archetypeId: "kwebtoon-office-ceo", positionXZ: [-0.65, 0.95], facingYawRad: 0.65, stance: "standing" },
      { archetypeId: "kwebtoon-modern-heroine", positionXZ: [0.65, -0.45], facingYawRad: -0.75, stance: "seated" },
    ],
  },
  {
    id: "solo-hero-establishing", labelKo: "주인공 단독 전신 컷", subtitleKo: "40mm 배경 스케일·발끝 접지 강조",
    recommendedActorCount: 1, focalLengthMm: 40, fovDeg: 34, dutchRollDeg: 0,
    cameraPositionM: [0.2, 1.18, 3.4], cameraTargetM: [0, 1.05, -0.6], recommendedAspectRatio: "9:16",
    defaultPlacements: [
      { archetypeId: "kwebtoon-modern-heroine", positionXZ: [0, -0.4], facingYawRad: 0.18, stance: "standing" },
    ],
  },
  {
    id: "banquet-high-overview", labelKo: "연회장 부감 군중 샷", subtitleKo: "28mm 하이앵글 3인 주연·군중 전경",
    recommendedActorCount: 3, focalLengthMm: 28, fovDeg: 46, dutchRollDeg: 0,
    cameraPositionM: [0, 3.2, 4.8], cameraTargetM: [0, 0.95, -1.2], recommendedAspectRatio: "16:9",
    defaultPlacements: [
      { archetypeId: "kwebtoon-rofan-princess", positionXZ: [0, -1.4], facingYawRad: 0, stance: "standing" },
      { archetypeId: "kwebtoon-northern-duke", positionXZ: [-1.25, -0.2], facingYawRad: 0.6, stance: "standing" },
      { archetypeId: "kwebtoon-srank-healer", positionXZ: [1.25, -0.15], facingYawRad: -0.6, stance: "standing" },
    ],
  },
]);

export function getWebtoonCompositeFramingPreset(id: WebtoonCompositeFramingId): WebtoonCompositeFramingPreset {
  return WEBTOON_COMPOSITE_FRAMING_PRESETS.find((p) => p.id === id) ?? WEBTOON_COMPOSITE_FRAMING_PRESETS[0];
}
