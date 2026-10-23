/**
 * studio-bg3d-webtoon-world-shaper.ts
 *
 * 3D 세이퍼(3D Shaper) 수준의 파라메트릭 웹툰 세계관 3D 배경 커스터마이저.
 * - 8대 웹툰 세계관(학원 로맨스, 로판 황궁, 무협 연무장, 현대 느와르, 헌터 던전, 사이버펑크, 메디컬 병동, 일상 카페)
 * - 7축 연속 슬라이더(폭·깊이·층고·창문 밀도·가구 밀도·중앙 동선 폭·히어로 소품 배율) 및 두 상태 간 연속 보간(blend)
 * - 6종 시간대·장르 무드 팔레트(정오 채광, 노을 로맨스, 느와르 야경, 아케인 판타지, 수묵 무협, 클린 메디컬)
 * - VARCO 3D 히어로 소품 슬롯 바인딩(componentRef & tags 연동) 및 인체 비례(1.7m 캐릭터 기준) 경계 검증
 */

import type { BgPrimitive, BgPrimitiveKind } from "../studio-background-3d-metadata";
import { uid } from "../studio-id";

import {
  clampStudioBg3dRoomSpec,
  instantiateStudioBg3dRoomBuild,
  type StudioBg3dRoomFurnitureItem,
  type StudioBg3dRoomOpening,
  type StudioBg3dRoomSpec,
} from "./studio-bg3d-room-builder";

export const STUDIO_BG3D_WEBTOON_UNIVERSE_IDS = [
  "school-romance",
  "romance-fantasy-palace",
  "murim-martial-courtyard",
  "modern-office-noir",
  "hunter-dungeon-altar",
  "cyberpunk-neon-alley",
  "medical-drama-ward",
  "daily-cafe-street",
] as const;

export type StudioBg3dWebtoonUniverseId = (typeof STUDIO_BG3D_WEBTOON_UNIVERSE_IDS)[number];

export const STUDIO_BG3D_MOOD_IDS = [
  "daylight",
  "sunset-romance",
  "noir-night",
  "arcane-fantasy",
  "murim-ink",
  "hospital-clean",
] as const;

export type StudioBg3dMoodId = (typeof STUDIO_BG3D_MOOD_IDS)[number];

export interface StudioBg3dMoodPalette {
  readonly id: StudioBg3dMoodId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly floorColor: string;
  readonly wallColor: string;
  readonly trimColor: string;
  readonly propPrimaryColor: string;
  readonly propAccentColor: string;
}

export const STUDIO_BG3D_MOOD_PALETTES: Readonly<Record<StudioBg3dMoodId, StudioBg3dMoodPalette>> =
  Object.freeze({
    daylight: {
      id: "daylight",
      labelKo: "정오 채광",
      descriptionKo: "맑은 낮 시간대의 따뜻한 원목 바닥과 아이보리 벽면",
      floorColor: "#d9c9a3",
      wallColor: "#f2ead8",
      trimColor: "#b89f7a",
      propPrimaryColor: "#c99b68",
      propAccentColor: "#4f6fb3",
    },
    "sunset-romance": {
      id: "sunset-romance",
      labelKo: "노을 로맨스",
      descriptionKo: "하교·고백 씬에 어울리는 코랄 앰버 노을빛 팔레트",
      floorColor: "#cfa07e",
      wallColor: "#f5d6c6",
      trimColor: "#a86b56",
      propPrimaryColor: "#d9826c",
      propAccentColor: "#f59e0b",
    },
    "noir-night": {
      id: "noir-night",
      labelKo: "느와르 야경",
      descriptionKo: "심야 추격·스릴러 씬을 위한 딥 슬레이트와 골드 네온 포인트",
      floorColor: "#2b303c",
      wallColor: "#3a4152",
      trimColor: "#1b202b",
      propPrimaryColor: "#252a34",
      propAccentColor: "#f7d794",
    },
    "arcane-fantasy": {
      id: "arcane-fantasy",
      labelKo: "아케인 판타지",
      descriptionKo: "로판 황궁·던전 제단에 어울리는 대리석·벨벳·마력광 팔레트",
      floorColor: "#d8d0c5",
      wallColor: "#eee8df",
      trimColor: "#d4af37",
      propPrimaryColor: "#7b1e3a",
      propAccentColor: "#3b82f6",
    },
    "murim-ink": {
      id: "murim-ink",
      labelKo: "수묵 무협",
      descriptionKo: "전통 목조 대청과 청회색 석재 바닥의 무림 문파 팔레트",
      floorColor: "#7c7267",
      wallColor: "#dfd8cc",
      trimColor: "#3e2a1e",
      propPrimaryColor: "#4a3525",
      propAccentColor: "#10b981",
    },
    "hospital-clean": {
      id: "hospital-clean",
      labelKo: "클린 메디컬",
      descriptionKo: "병동·연구실에 적합한 청결한 화이트·민트 팔레트",
      floorColor: "#dce4ec",
      wallColor: "#f4f7fa",
      trimColor: "#94a3b8",
      propPrimaryColor: "#e2e8f0",
      propAccentColor: "#14b8a6",
    },
  });

export interface StudioBg3dWorldShaperSliders {
  /** 공간 좌우 폭 배율 (0.6 ~ 1.8, 기본 1.0) */
  readonly widthScale: number;
  /** 공간 앞뒤 깊이 배율 (0.6 ~ 1.8, 기본 1.0) */
  readonly depthScale: number;
  /** 층고 배율 (0.75 ~ 1.6, 기본 1.0) */
  readonly ceilingScale: number;
  /** 창문·채광 개구부 밀도 (0 ~ 1, 기본 0.8) */
  readonly windowDensity: number;
  /** 가구·집기 배치 밀도 (0 ~ 1, 기본 0.8) */
  readonly furnitureDensity: number;
  /** 캐릭터 연기를 위한 중앙 통로 비움 비율 (0.15 ~ 0.6, 기본 0.3) */
  readonly aisleRatio: number;
  /** VARCO 3D 히어로 소품 배율 (0.7 ~ 1.4, 기본 1.0) */
  readonly propScale: number;
}

export const DEFAULT_STUDIO_BG3D_WORLD_SHAPER_SLIDERS: Readonly<StudioBg3dWorldShaperSliders> =
  Object.freeze({
    widthScale: 1,
    depthScale: 1,
    ceilingScale: 1,
    windowDensity: 0.8,
    furnitureDensity: 0.8,
    aisleRatio: 0.3,
    propScale: 1,
  });

export const STUDIO_BG3D_WORLD_SHAPER_SLIDER_LIMITS = Object.freeze({
  widthScale: { min: 0.6, max: 1.8, step: 0.05, labelKo: "공간 폭 배율" },
  depthScale: { min: 0.6, max: 1.8, step: 0.05, labelKo: "공간 깊이 배율" },
  ceilingScale: { min: 0.75, max: 1.6, step: 0.05, labelKo: "층고 배율" },
  windowDensity: { min: 0, max: 1, step: 0.05, labelKo: "창문·채광 밀도" },
  furnitureDensity: { min: 0, max: 1, step: 0.05, labelKo: "가구·집기 밀도" },
  aisleRatio: { min: 0.15, max: 0.6, step: 0.05, labelKo: "중앙 연기 동선 폭" },
  propScale: { min: 0.7, max: 1.4, step: 0.05, labelKo: "VARCO 소품 크기" },
});

export interface StudioBg3dVarcoHeroPropPart {
  readonly kind: BgPrimitiveKind;
  readonly name: string;
  readonly offset: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly role: "primary" | "accent" | "trim";
}

export interface StudioBg3dVarcoHeroPropSlot {
  readonly slotId: string;
  readonly varcoAssetId: string;
  readonly labelKo: string;
  /** 방 중심 기준 정규화 위치 (-1..1 비율) */
  readonly normalizedAnchorXz: readonly [number, number];
  readonly boundingBoxMeters: readonly [number, number, number];
  readonly parts: readonly StudioBg3dVarcoHeroPropPart[];
}

export interface StudioBg3dWebtoonUniversePreset {
  readonly id: StudioBg3dWebtoonUniverseId;
  readonly labelKo: string;
  readonly genreTagKo: string;
  readonly descriptionKo: string;
  readonly defaultMood: StudioBg3dMoodId;
  readonly defaultSliders: StudioBg3dWorldShaperSliders;
  readonly baseWidth: number;
  readonly baseDepth: number;
  readonly baseWallHeight: number;
  readonly baseWallThickness: number;
  readonly openings: readonly StudioBg3dRoomOpening[];
  readonly furniture: readonly StudioBg3dRoomFurnitureItem[];
  readonly varcoPropSlot: StudioBg3dVarcoHeroPropSlot;
}

function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Number(value.toFixed(4))))
    : fallback;
}

export function clampStudioBg3dWorldShaperSliders(
  raw: Partial<StudioBg3dWorldShaperSliders> | null | undefined,
): StudioBg3dWorldShaperSliders {
  const src = raw ?? {};
  const lim = STUDIO_BG3D_WORLD_SHAPER_SLIDER_LIMITS;
  const def = DEFAULT_STUDIO_BG3D_WORLD_SHAPER_SLIDERS;
  return {
    widthScale: clampFinite(src.widthScale, def.widthScale, lim.widthScale.min, lim.widthScale.max),
    depthScale: clampFinite(src.depthScale, def.depthScale, lim.depthScale.min, lim.depthScale.max),
    ceilingScale: clampFinite(
      src.ceilingScale,
      def.ceilingScale,
      lim.ceilingScale.min,
      lim.ceilingScale.max,
    ),
    windowDensity: clampFinite(
      src.windowDensity,
      def.windowDensity,
      lim.windowDensity.min,
      lim.windowDensity.max,
    ),
    furnitureDensity: clampFinite(
      src.furnitureDensity,
      def.furnitureDensity,
      lim.furnitureDensity.min,
      lim.furnitureDensity.max,
    ),
    aisleRatio: clampFinite(src.aisleRatio, def.aisleRatio, lim.aisleRatio.min, lim.aisleRatio.max),
    propScale: clampFinite(src.propScale, def.propScale, lim.propScale.min, lim.propScale.max),
  };
}

export function blendStudioBg3dWorldShaperSliders(
  from: Partial<StudioBg3dWorldShaperSliders>,
  to: Partial<StudioBg3dWorldShaperSliders>,
  t: number,
): StudioBg3dWorldShaperSliders {
  const a = clampStudioBg3dWorldShaperSliders(from);
  const b = clampStudioBg3dWorldShaperSliders(to);
  const alpha = clampFinite(t, 0.5, 0, 1);
  const lerp = (x: number, y: number) => x + (y - x) * alpha;
  return clampStudioBg3dWorldShaperSliders({
    widthScale: lerp(a.widthScale, b.widthScale),
    depthScale: lerp(a.depthScale, b.depthScale),
    ceilingScale: lerp(a.ceilingScale, b.ceilingScale),
    windowDensity: lerp(a.windowDensity, b.windowDensity),
    furnitureDensity: lerp(a.furnitureDensity, b.furnitureDensity),
    aisleRatio: lerp(a.aisleRatio, b.aisleRatio),
    propScale: lerp(a.propScale, b.propScale),
  });
}

export const STUDIO_BG3D_WEBTOON_UNIVERSES: readonly StudioBg3dWebtoonUniversePreset[] =
  Object.freeze([
    {
      id: "school-romance",
      labelKo: "학원 로맨스 교실",
      genreTagKo: "학원·청춘",
      descriptionKo: "창가 채광과 교탁, 학생 책상 열이 정돈된 웹툰 표준 교실 공간",
      defaultMood: "daylight",
      defaultSliders: {
        widthScale: 1,
        depthScale: 1,
        ceilingScale: 1,
        windowDensity: 1,
        furnitureDensity: 0.85,
        aisleRatio: 0.28,
        propScale: 1,
      },
      baseWidth: 8.4,
      baseDepth: 7.2,
      baseWallHeight: 3.1,
      baseWallThickness: 0.16,
      openings: [
        { wall: "south", type: "door", centerOffset: -2.8, width: 0.95, height: 2.1, sillHeight: 0 },
        { wall: "south", type: "door", centerOffset: 2.8, width: 0.95, height: 2.1, sillHeight: 0 },
        { wall: "east", type: "window", centerOffset: -2.1, width: 1.5, height: 1.2, sillHeight: 0.95 },
        { wall: "east", type: "window", centerOffset: 0, width: 1.5, height: 1.2, sillHeight: 0.95 },
        { wall: "east", type: "window", centerOffset: 2.1, width: 1.5, height: 1.2, sillHeight: 0.95 },
      ],
      furniture: [
        { kind: "table", x: -1.9, z: -0.6, yawDeg: 0 },
        { kind: "chair", x: -1.9, z: 0.1, yawDeg: 180 },
        { kind: "table", x: 1.9, z: -0.6, yawDeg: 0 },
        { kind: "chair", x: 1.9, z: 0.1, yawDeg: 180 },
        { kind: "table", x: -1.9, z: 1.3, yawDeg: 0 },
        { kind: "chair", x: -1.9, z: 2.0, yawDeg: 180 },
        { kind: "table", x: 1.9, z: 1.3, yawDeg: 0 },
        { kind: "chair", x: 1.9, z: 2.0, yawDeg: 180 },
      ],
      varcoPropSlot: {
        slotId: "prop-podium",
        varcoAssetId: "classroom-podium-desk",
        labelKo: "VARCO 학원물 교탁 세트",
        normalizedAnchorXz: [0, -0.72],
        boundingBoxMeters: [1.2, 0.95, 0.65],
        parts: [
          { kind: "box", name: "VARCO 교탁 본체", offset: [0, 0.48, 0], scale: [1.2, 0.95, 0.65], role: "primary" },
          { kind: "box", name: "VARCO 교탁 상판", offset: [0, 0.98, 0], scale: [1.28, 0.06, 0.72], role: "trim" },
          { kind: "cylinder", name: "VARCO 교탁 마이크", offset: [0.35, 1.12, -0.1], scale: [0.04, 0.24, 0.04], role: "accent" },
        ],
      },
    },
    {
      id: "romance-fantasy-palace",
      labelKo: "로판 황궁 알현실",
      genreTagKo: "로맨스 판타지",
      descriptionKo: "높은 아치 창과 좌우 열주, 황실 권좌가 배치된 대리석 알현실",
      defaultMood: "arcane-fantasy",
      defaultSliders: {
        widthScale: 1.25,
        depthScale: 1.3,
        ceilingScale: 1.35,
        windowDensity: 1,
        furnitureDensity: 0.9,
        aisleRatio: 0.42,
        propScale: 1.1,
      },
      baseWidth: 11,
      baseDepth: 12,
      baseWallHeight: 4.8,
      baseWallThickness: 0.25,
      openings: [
        { wall: "south", type: "door", centerOffset: 0, width: 2.2, height: 3.2, sillHeight: 0 },
        { wall: "east", type: "window", centerOffset: -3.2, width: 1.6, height: 2.6, sillHeight: 1.0 },
        { wall: "east", type: "window", centerOffset: 0, width: 1.6, height: 2.6, sillHeight: 1.0 },
        { wall: "east", type: "window", centerOffset: 3.2, width: 1.6, height: 2.6, sillHeight: 1.0 },
        { wall: "west", type: "window", centerOffset: -3.2, width: 1.6, height: 2.6, sillHeight: 1.0 },
        { wall: "west", type: "window", centerOffset: 3.2, width: 1.6, height: 2.6, sillHeight: 1.0 },
      ],
      furniture: [
        { kind: "column", x: -3.2, z: -3.2, yawDeg: 0 },
        { kind: "column", x: 3.2, z: -3.2, yawDeg: 0 },
        { kind: "column", x: -3.2, z: 0, yawDeg: 0 },
        { kind: "column", x: 3.2, z: 0, yawDeg: 0 },
        { kind: "column", x: -3.2, z: 3.2, yawDeg: 0 },
        { kind: "column", x: 3.2, z: 3.2, yawDeg: 0 },
      ],
      varcoPropSlot: {
        slotId: "prop-throne",
        varcoAssetId: "rofan-golden-throne",
        labelKo: "VARCO 황실 벨벳 권좌",
        normalizedAnchorXz: [0, -0.76],
        boundingBoxMeters: [1.4, 2.1, 1.1],
        parts: [
          { kind: "box", name: "VARCO 권좌 단상", offset: [0, 0.18, 0], scale: [2.4, 0.36, 1.8], role: "trim" },
          { kind: "box", name: "VARCO 권좌 좌석", offset: [0, 0.65, 0], scale: [1.2, 0.58, 0.95], role: "primary" },
          { kind: "box", name: "VARCO 권좌 등받이", offset: [0, 1.45, -0.38], scale: [1.15, 1.4, 0.22], role: "accent" },
        ],
      },
    },
    {
      id: "murim-martial-courtyard",
      labelKo: "무협 문파 연무장",
      genreTagKo: "무협·동양풍",
      descriptionKo: "목조 기둥 회랑과 연무 석판, 병장기 거치대가 놓인 무림 대청",
      defaultMood: "murim-ink",
      defaultSliders: {
        widthScale: 1.2,
        depthScale: 1.15,
        ceilingScale: 1.1,
        windowDensity: 0.75,
        furnitureDensity: 0.8,
        aisleRatio: 0.45,
        propScale: 1,
      },
      baseWidth: 10,
      baseDepth: 9,
      baseWallHeight: 3.4,
      baseWallThickness: 0.2,
      openings: [
        { wall: "south", type: "door", centerOffset: 0, width: 2.0, height: 2.4, sillHeight: 0 },
        { wall: "north", type: "window", centerOffset: -2.4, width: 1.8, height: 1.4, sillHeight: 1.0 },
        { wall: "north", type: "window", centerOffset: 2.4, width: 1.8, height: 1.4, sillHeight: 1.0 },
      ],
      furniture: [
        { kind: "column", x: -3.6, z: -2.8, yawDeg: 0 },
        { kind: "column", x: 3.6, z: -2.8, yawDeg: 0 },
        { kind: "column", x: -3.6, z: 2.8, yawDeg: 0 },
        { kind: "column", x: 3.6, z: 2.8, yawDeg: 0 },
        { kind: "plant", x: -3.8, z: 0, yawDeg: 0 },
        { kind: "plant", x: 3.8, z: 0, yawDeg: 0 },
      ],
      varcoPropSlot: {
        slotId: "prop-weapon-rack",
        varcoAssetId: "murim-sword-rack",
        labelKo: "VARCO 문파 흑단 검걸이대",
        normalizedAnchorXz: [0, -0.75],
        boundingBoxMeters: [1.5, 1.35, 0.45],
        parts: [
          { kind: "box", name: "VARCO 검걸이대 받침", offset: [0, 0.12, 0], scale: [1.5, 0.24, 0.45], role: "primary" },
          { kind: "box", name: "VARCO 검걸이대 기둥", offset: [0, 0.72, 0], scale: [1.35, 1.0, 0.18], role: "trim" },
          { kind: "cylinder", name: "VARCO 보검 파츠", offset: [0, 0.85, 0.08], scale: [1.2, 0.06, 0.06], role: "accent" },
        ],
      },
    },
    {
      id: "modern-office-noir",
      labelKo: "현대 느와르 오피스",
      genreTagKo: "현대·스릴러",
      descriptionKo: "파노라마 야경 창과 대표 집무 데스크, 소파 라운지가 결합된 느와르 공간",
      defaultMood: "noir-night",
      defaultSliders: {
        widthScale: 1.05,
        depthScale: 1.05,
        ceilingScale: 1.05,
        windowDensity: 1,
        furnitureDensity: 0.85,
        aisleRatio: 0.32,
        propScale: 1,
      },
      baseWidth: 7.6,
      baseDepth: 6.4,
      baseWallHeight: 3.2,
      baseWallThickness: 0.16,
      openings: [
        { wall: "south", type: "door", centerOffset: 2.2, width: 1.0, height: 2.2, sillHeight: 0 },
        { wall: "north", type: "window", centerOffset: -1.8, width: 2.6, height: 1.8, sillHeight: 0.7 },
        { wall: "north", type: "window", centerOffset: 1.8, width: 2.6, height: 1.8, sillHeight: 0.7 },
      ],
      furniture: [
        { kind: "table", x: -1.8, z: -1.4, yawDeg: 0 },
        { kind: "chair", x: -1.8, z: -2.2, yawDeg: 0 },
        { kind: "sofa", x: 1.8, z: 0.8, yawDeg: 270 },
        { kind: "bookshelf", x: -3.1, z: 1.2, yawDeg: 90 },
        { kind: "lamp", x: 2.4, z: -1.8, yawDeg: 0 },
      ],
      varcoPropSlot: {
        slotId: "prop-streetlamp",
        varcoAssetId: "noir-neon-streetlamp",
        labelKo: "VARCO 느와르 스탠드 조명탑",
        normalizedAnchorXz: [0.68, -0.68],
        boundingBoxMeters: [0.6, 2.4, 0.6],
        parts: [
          { kind: "cylinder", name: "VARCO 조명 베이스", offset: [0, 0.08, 0], scale: [0.55, 0.16, 0.55], role: "primary" },
          { kind: "cylinder", name: "VARCO 조명 기둥", offset: [0, 1.15, 0], scale: [0.1, 2.1, 0.1], role: "trim" },
          { kind: "sphere", name: "VARCO 앰버 램프", offset: [0, 2.25, 0], scale: [0.38, 0.38, 0.38], role: "accent" },
        ],
      },
    },
    {
      id: "hunter-dungeon-altar",
      labelKo: "헌터 각성 던전 제단",
      genreTagKo: "헌터·레이드",
      descriptionKo: "거대한 석조 열주와 중앙 마력 각성 오벨리스크가 솟은 보스룸",
      defaultMood: "arcane-fantasy",
      defaultSliders: {
        widthScale: 1.35,
        depthScale: 1.35,
        ceilingScale: 1.45,
        windowDensity: 0.4,
        furnitureDensity: 0.9,
        aisleRatio: 0.44,
        propScale: 1.15,
      },
      baseWidth: 12,
      baseDepth: 12,
      baseWallHeight: 5.2,
      baseWallThickness: 0.3,
      openings: [
        { wall: "south", type: "door", centerOffset: 0, width: 2.4, height: 3.4, sillHeight: 0 },
        { wall: "north", type: "window", centerOffset: 0, width: 2.0, height: 2.8, sillHeight: 1.4 },
      ],
      furniture: [
        { kind: "column", x: -4.2, z: -3.8, yawDeg: 0 },
        { kind: "column", x: 4.2, z: -3.8, yawDeg: 0 },
        { kind: "column", x: -4.2, z: 0, yawDeg: 0 },
        { kind: "column", x: 4.2, z: 0, yawDeg: 0 },
        { kind: "column", x: -4.2, z: 3.8, yawDeg: 0 },
        { kind: "column", x: 4.2, z: 3.8, yawDeg: 0 },
        { kind: "stairs", x: 0, z: -3.2, yawDeg: 0 },
      ],
      varcoPropSlot: {
        slotId: "prop-altar",
        varcoAssetId: "hunter-awakening-altar",
        labelKo: "VARCO 마석 각성 오벨리스크",
        normalizedAnchorXz: [0, -0.62],
        boundingBoxMeters: [2.2, 2.8, 2.2],
        parts: [
          { kind: "hexPrism", name: "VARCO 제단 기단", offset: [0, 0.25, 0], scale: [2.2, 0.5, 2.2], role: "primary" },
          { kind: "pyramid", name: "VARCO 마석 오벨리스크", offset: [0, 1.55, 0], scale: [0.95, 2.1, 0.95], role: "accent" },
          { kind: "torus", name: "VARCO 마나 공명 링", offset: [0, 1.65, 0], scale: [1.45, 0.12, 1.45], role: "trim" },
        ],
      },
    },
    {
      id: "cyberpunk-neon-alley",
      labelKo: "사이버펑크 네온 라운지",
      genreTagKo: "SF·사이버펑크",
      descriptionKo: "홀로그램 키오스크와 네온 파이프, 언더그라운드 부스가 결합된 아케이드",
      defaultMood: "noir-night",
      defaultSliders: {
        widthScale: 1,
        depthScale: 1.15,
        ceilingScale: 1.05,
        windowDensity: 0.65,
        furnitureDensity: 0.85,
        aisleRatio: 0.34,
        propScale: 1.05,
      },
      baseWidth: 7.5,
      baseDepth: 8.5,
      baseWallHeight: 3.3,
      baseWallThickness: 0.18,
      openings: [
        { wall: "south", type: "door", centerOffset: 0, width: 1.4, height: 2.3, sillHeight: 0 },
        { wall: "west", type: "window", centerOffset: -1.8, width: 1.8, height: 1.2, sillHeight: 1.1 },
        { wall: "west", type: "window", centerOffset: 1.8, width: 1.8, height: 1.2, sillHeight: 1.1 },
      ],
      furniture: [
        { kind: "sofa", x: -2.2, z: -1.6, yawDeg: 90 },
        { kind: "table", x: -1.3, z: -1.6, yawDeg: 90 },
        { kind: "sofa", x: 2.2, z: 1.4, yawDeg: 270 },
        { kind: "lamp", x: -2.8, z: 2.6, yawDeg: 0 },
      ],
      varcoPropSlot: {
        slotId: "prop-kiosk",
        varcoAssetId: "cyberpunk-holo-kiosk",
        labelKo: "VARCO 홀로그램 키오스크",
        normalizedAnchorXz: [0.65, -0.68],
        boundingBoxMeters: [1.1, 2.0, 0.75],
        parts: [
          { kind: "box", name: "VARCO 키오스크 본체", offset: [0, 1.0, 0], scale: [1.1, 2.0, 0.75], role: "primary" },
          { kind: "box", name: "VARCO 네온 디스플레이", offset: [0, 1.25, 0.39], scale: [0.92, 1.1, 0.05], role: "accent" },
          { kind: "cylinder", name: "VARCO 상단 홀로 프로젝터", offset: [0, 2.12, 0], scale: [0.45, 0.18, 0.45], role: "trim" },
        ],
      },
    },
    {
      id: "medical-drama-ward",
      labelKo: "메디컬 드라마 중환자실",
      genreTagKo: "메디컬·드라마",
      descriptionKo: "병상 침대와 바이탈 모니터 카트, 관찰창이 갖춰진 대학병원 병동",
      defaultMood: "hospital-clean",
      defaultSliders: {
        widthScale: 1,
        depthScale: 1,
        ceilingScale: 1,
        windowDensity: 0.9,
        furnitureDensity: 0.85,
        aisleRatio: 0.35,
        propScale: 1,
      },
      baseWidth: 7.2,
      baseDepth: 6.0,
      baseWallHeight: 2.9,
      baseWallThickness: 0.15,
      openings: [
        { wall: "south", type: "door", centerOffset: 1.8, width: 1.25, height: 2.15, sillHeight: 0 },
        { wall: "south", type: "window", centerOffset: -1.2, width: 2.2, height: 1.2, sillHeight: 0.95 },
        { wall: "north", type: "window", centerOffset: 0, width: 2.6, height: 1.4, sillHeight: 0.9 },
      ],
      furniture: [
        { kind: "bed", x: -1.8, z: -1.2, yawDeg: 0 },
        { kind: "chair", x: -0.5, z: -1.2, yawDeg: 270 },
        { kind: "table", x: 1.9, z: -1.5, yawDeg: 0 },
        { kind: "bookshelf", x: 2.8, z: 1.4, yawDeg: 270 },
      ],
      varcoPropSlot: {
        slotId: "prop-medical-cart",
        varcoAssetId: "medical-iv-monitor",
        labelKo: "VARCO 바이탈 모니터 & 수액 카트",
        normalizedAnchorXz: [-0.68, -0.68],
        boundingBoxMeters: [0.65, 1.65, 0.65],
        parts: [
          { kind: "box", name: "VARCO 의료 카트 하단", offset: [0, 0.45, 0], scale: [0.62, 0.9, 0.58], role: "primary" },
          { kind: "cylinder", name: "VARCO 수액 폴대", offset: [0.22, 1.2, -0.18], scale: [0.05, 1.5, 0.05], role: "trim" },
          { kind: "box", name: "VARCO 심전도 모니터", offset: [-0.05, 1.18, 0], scale: [0.48, 0.38, 0.16], role: "accent" },
        ],
      },
    },
    {
      id: "daily-cafe-street",
      labelKo: "일상물 베이커리 카페",
      genreTagKo: "일상·로맨스",
      descriptionKo: "통유리 쇼윈도와 에스프레소 카운터, 2인 테이블이 배치된 감성 카페",
      defaultMood: "sunset-romance",
      defaultSliders: {
        widthScale: 1,
        depthScale: 1,
        ceilingScale: 1,
        windowDensity: 1,
        furnitureDensity: 0.9,
        aisleRatio: 0.3,
        propScale: 1,
      },
      baseWidth: 7.0,
      baseDepth: 5.8,
      baseWallHeight: 2.9,
      baseWallThickness: 0.15,
      openings: [
        { wall: "south", type: "door", centerOffset: 2.1, width: 1.05, height: 2.15, sillHeight: 0 },
        { wall: "south", type: "window", centerOffset: -0.9, width: 3.0, height: 1.65, sillHeight: 0.55 },
        { wall: "west", type: "window", centerOffset: 0, width: 2.6, height: 1.4, sillHeight: 0.85 },
      ],
      furniture: [
        { kind: "table", x: -1.8, z: 0.9, yawDeg: 0 },
        { kind: "chair", x: -1.8, z: 0.1, yawDeg: 0 },
        { kind: "chair", x: -1.8, z: 1.7, yawDeg: 180 },
        { kind: "table", x: 1.6, z: 0.9, yawDeg: 90 },
        { kind: "chair", x: 0.85, z: 0.9, yawDeg: 90 },
        { kind: "plant", x: -2.8, z: 2.2, yawDeg: 0 },
      ],
      varcoPropSlot: {
        slotId: "prop-cafe-counter",
        varcoAssetId: "cafe-espresso-bar",
        labelKo: "VARCO 에스프레소 머신 카운터",
        normalizedAnchorXz: [0, -0.7],
        boundingBoxMeters: [1.8, 1.15, 0.8],
        parts: [
          { kind: "box", name: "VARCO 원목 바 카운터", offset: [0, 0.48, 0], scale: [1.8, 0.96, 0.8], role: "primary" },
          { kind: "box", name: "VARCO 에스프레소 머신", offset: [-0.35, 1.14, -0.05], scale: [0.68, 0.38, 0.48], role: "accent" },
          { kind: "cylinder", name: "VARCO 원두 그라인더", offset: [0.42, 1.16, -0.08], scale: [0.22, 0.42, 0.22], role: "trim" },
        ],
      },
    },
  ]);

const UNIVERSE_BY_ID: ReadonlyMap<StudioBg3dWebtoonUniverseId, StudioBg3dWebtoonUniversePreset> =
  new Map(STUDIO_BG3D_WEBTOON_UNIVERSES.map((u) => [u.id, u]));

export function getStudioBg3dWebtoonUniverse(
  id: StudioBg3dWebtoonUniverseId,
): StudioBg3dWebtoonUniversePreset {
  return UNIVERSE_BY_ID.get(id) ?? STUDIO_BG3D_WEBTOON_UNIVERSES[0]!;
}

/**
 * 세계관 아키타입과 3D 세이퍼 슬라이더·무드 팔레트를 결합해 정규화된 `StudioBg3dRoomSpec`을 산출한다.
 */
export function buildStudioBg3dWebtoonWorldSpec(
  universeId: StudioBg3dWebtoonUniverseId,
  rawSliders?: Partial<StudioBg3dWorldShaperSliders> | null,
  moodId?: StudioBg3dMoodId,
): StudioBg3dRoomSpec {
  const universe = getStudioBg3dWebtoonUniverse(universeId);
  const sliders = clampStudioBg3dWorldShaperSliders(rawSliders ?? universe.defaultSliders);
  const mood = STUDIO_BG3D_MOOD_PALETTES[moodId ?? universe.defaultMood];

  const width = universe.baseWidth * sliders.widthScale;
  const depth = universe.baseDepth * sliders.depthScale;
  const wallHeight = universe.baseWallHeight * sliders.ceilingScale;

  const doorOpenings = universe.openings.filter((o) => o.type === "door");
  const windowOpenings = universe.openings.filter((o) => o.type === "window");
  const keepWindowCount = Math.round(windowOpenings.length * sliders.windowDensity);
  const activeWindows = windowOpenings.slice(0, keepWindowCount).map((win) => ({
    ...win,
    centerOffset:
      win.wall === "north" || win.wall === "south"
        ? win.centerOffset * sliders.widthScale
        : win.centerOffset * sliders.depthScale,
    height: Math.min(wallHeight - win.sillHeight - 0.25, win.height * sliders.ceilingScale),
  }));

  const keepFurnitureCount = Math.round(universe.furniture.length * sliders.furnitureDensity);
  const minAisleHalfWidth = (width * sliders.aisleRatio) / 2;
  const activeFurniture = universe.furniture.slice(0, keepFurnitureCount).map((item) => {
    const scaledX = item.x * sliders.widthScale;
    const scaledZ = item.z * sliders.depthScale;
    const pushedX =
      Math.abs(scaledX) > 0.01 && Math.abs(scaledX) < minAisleHalfWidth
        ? Math.sign(scaledX) * minAisleHalfWidth
        : scaledX;
    return {
      ...item,
      x: pushedX,
      z: scaledZ,
    };
  });

  return clampStudioBg3dRoomSpec({
    width,
    depth,
    wallHeight,
    wallThickness: universe.baseWallThickness,
    floorColor: mood.floorColor,
    wallColor: mood.wallColor,
    openings: [...doorOpenings, ...activeWindows],
    furniture: activeFurniture,
    trims: {
      baseboard: { enabled: true, heightM: 0.08, depthM: 0.015 },
      crown: { style: wallHeight >= 3.0 ? "flat" : "none", heightM: 0.1 },
      wainscot: { enabled: false, heightM: 0.9 },
      chairRail: false,
    },
  });
}

export interface StudioBg3dWorldBuildResult {
  readonly universeId: StudioBg3dWebtoonUniverseId;
  readonly moodId: StudioBg3dMoodId;
  readonly sliders: StudioBg3dWorldShaperSliders;
  readonly roomSpec: StudioBg3dRoomSpec;
  readonly primitives: BgPrimitive[];
  readonly varcoPropPrimitiveIds: readonly string[];
  readonly boundsMeters: {
    readonly width: number;
    readonly depth: number;
    readonly wallHeight: number;
    readonly characterHeadClearanceMeters: number;
  };
}

/**
 * 세계관 룸 파츠와 VARCO 3D 히어로 소품 슬롯을 합쳐 즉시 씬 문서에 투입 가능한 `BgPrimitive[]`를 생성한다.
 */
export function instantiateStudioBg3dWebtoonWorld(
  options: {
    readonly universeId: StudioBg3dWebtoonUniverseId;
    readonly sliders?: Partial<StudioBg3dWorldShaperSliders>;
    readonly moodId?: StudioBg3dMoodId;
    readonly existingCount?: number;
  },
  idFactory: () => string = uid,
): StudioBg3dWorldBuildResult {
  const universe = getStudioBg3dWebtoonUniverse(options.universeId);
  const sliders = clampStudioBg3dWorldShaperSliders(options.sliders ?? universe.defaultSliders);
  const moodId = options.moodId ?? universe.defaultMood;
  const mood = STUDIO_BG3D_MOOD_PALETTES[moodId];
  const roomSpec = buildStudioBg3dWebtoonWorldSpec(options.universeId, sliders, moodId);
  const existingCount = options.existingCount ?? 0;
  const anchorX = existingCount > 0 ? existingCount * (roomSpec.width / 6) : 0;

  const roomPrimitives = instantiateStudioBg3dRoomBuild(roomSpec, existingCount, idFactory);
  const propSlot = universe.varcoPropSlot;
  const propBaseX = anchorX + propSlot.normalizedAnchorXz[0] * (roomSpec.width / 2);
  const propBaseZ = propSlot.normalizedAnchorXz[1] * (roomSpec.depth / 2);
  const propScale = sliders.propScale;

  const varcoPropPrimitiveIds: string[] = [];
  const propPrimitives: BgPrimitive[] = propSlot.parts.map((part) => {
    const id = idFactory();
    varcoPropPrimitiveIds.push(id);
    const color =
      part.role === "primary"
        ? mood.propPrimaryColor
        : part.role === "accent"
          ? mood.propAccentColor
          : mood.trimColor;
    return {
      id,
      kind: part.kind,
      name: part.name,
      position: [
        Number((propBaseX + part.offset[0] * propScale).toFixed(4)),
        Number((part.offset[1] * propScale).toFixed(4)),
        Number((propBaseZ + part.offset[2] * propScale).toFixed(4)),
      ],
      rotation: [0, 0, 0],
      scale: [
        Number((part.scale[0] * propScale).toFixed(4)),
        Number((part.scale[1] * propScale).toFixed(4)),
        Number((part.scale[2] * propScale).toFixed(4)),
      ],
      color,
      componentRef: {
        id: `varco3d:${propSlot.varcoAssetId}`,
        name: propSlot.labelKo,
      },
      tags: ["varco3d", universe.id, propSlot.slotId],
    };
  });

  const standardHumanHeightMeters = 1.7;
  return {
    universeId: universe.id,
    moodId,
    sliders,
    roomSpec,
    primitives: [...roomPrimitives, ...propPrimitives],
    varcoPropPrimitiveIds,
    boundsMeters: {
      width: roomSpec.width,
      depth: roomSpec.depth,
      wallHeight: roomSpec.wallHeight,
      characterHeadClearanceMeters: Number(
        (roomSpec.wallHeight - standardHumanHeightMeters).toFixed(3),
      ),
    },
  };
}
