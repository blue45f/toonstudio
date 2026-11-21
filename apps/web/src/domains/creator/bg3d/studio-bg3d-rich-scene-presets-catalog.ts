/**
 * studio-bg3d-rich-scene-presets-catalog.ts
 *
 * 6종 고밀도 웹툰 배경 세트 메타데이터, 원클릭 밀도 옵션, 가구 스냅 앵커 카탈로그.
 */

import type * as THREE from "three";

import type { DisposedGpuResourceCounts, SceneManifoldReport } from "./studio-bg3d-geometry-manifold-utils";
import type { StudioBg3dWebtoonAtmospherePresetId } from "./studio-bg3d-lighting-studio";

export type RichWebtoonScenePresetId =
  | "seoul-neon-alley"
  | "sunlit-atelier-cafe"
  | "rofan-imperial-banquet"
  | "academy-sunset-rooftop"
  | "cyber-subway-platform"
  | "modern-webtoon-office";

export type RichSceneDensityTier = "basic" | "rich" | "ultra";

export type StageFurnitureAnchorKind = "standing" | "seated" | "leaning";

export interface StageFurnitureAnchor {
  readonly id: string;
  readonly labelKo: string;
  readonly kind: StageFurnitureAnchorKind;
  readonly positionM: readonly [number, number, number];
  readonly facingYawRad: number;
  readonly surfaceY: number;
  readonly seatHeightM?: number;
  readonly railHeightM?: number;
  readonly railNormal?: readonly [number, number, number];
}

export interface RichWebtoonScenePresetMeta {
  readonly id: RichWebtoonScenePresetId;
  readonly labelKo: string;
  readonly categoryKo: string;
  readonly descriptionKo: string;
  readonly recommendedAtmosphereId: StudioBg3dWebtoonAtmospherePresetId;
  readonly footprintMeters: readonly [number, number, number];
  readonly groundRoughness: number;
  readonly groundMetalness: number;
  readonly accentTokenVar: string;
  readonly particleLabelKo: string;
  readonly furnitureAnchors: readonly StageFurnitureAnchor[];
}

export interface RichSceneDensityOption {
  readonly id: RichSceneDensityTier;
  readonly labelKo: string;
  readonly detailMultiplier: number;
  readonly particleCount: number;
}

export interface RichWebtoonSceneLayerSummary {
  readonly architectureMeshes: number;
  readonly moldingMeshes: number;
  readonly lightingMeshes: number;
  readonly signageFrameMeshes: number;
  readonly foliageMeshes: number;
  readonly railingMeshes: number;
  readonly groundReflectionMeshes: number;
  readonly atmosphereParticles: number;
}

export interface RichWebtoonSceneBuildResult {
  readonly preset: RichWebtoonScenePresetMeta;
  readonly density: RichSceneDensityTier;
  readonly group: THREE.Group;
  readonly recommendedAtmosphereId: StudioBg3dWebtoonAtmospherePresetId;
  readonly furnitureAnchors: readonly StageFurnitureAnchor[];
  readonly layerSummary: RichWebtoonSceneLayerSummary;
  readonly metrics: SceneManifoldReport;
  readonly dispose: () => DisposedGpuResourceCounts;
}

export const RICH_SCENE_DENSITY_OPTIONS: readonly RichSceneDensityOption[] = Object.freeze([
  Object.freeze({ id: "basic", labelKo: "기본", detailMultiplier: 1, particleCount: 28 }),
  Object.freeze({ id: "rich", labelKo: "풍성", detailMultiplier: 2, particleCount: 72 }),
  Object.freeze({ id: "ultra", labelKo: "극강", detailMultiplier: 3, particleCount: 156 }),
]);

function freezeAnchor(anchor: StageFurnitureAnchor): StageFurnitureAnchor {
  return Object.freeze(anchor);
}

export const RICH_WEBTOON_SCENE_PRESETS: readonly RichWebtoonScenePresetMeta[] = Object.freeze([
  Object.freeze({
    id: "seoul-neon-alley",
    labelKo: "서울 야경 네온 골목",
    categoryKo: "도심·느와르",
    descriptionKo: "젖은 아스팔트 반사면, 세로 네온 간판, 상가 창틀 몰딩, 전봇대와 빗방울 입자가 어우러진 서울 골목",
    recommendedAtmosphereId: "night",
    footprintMeters: Object.freeze([10, 5.4, 14] as const),
    groundRoughness: 0.16,
    groundMetalness: 0.42,
    accentTokenVar: "var(--color-cool)",
    particleLabelKo: "네온 빗방울·빛망울",
    furnitureAnchors: Object.freeze([
      freezeAnchor({ id: "alley-center-stand", labelKo: "골목 중앙 서기", kind: "standing", positionM: [0, 0, 1.4], facingYawRad: 0, surfaceY: 0 }),
      freezeAnchor({ id: "alley-bench-seat", labelKo: "포차 벤치 착석", kind: "seated", positionM: [-2.4, 0, -0.6], facingYawRad: Math.PI * 0.45, surfaceY: 0, seatHeightM: 0.45 }),
      freezeAnchor({ id: "alley-rail-lean", labelKo: "보행 난간 기대기", kind: "leaning", positionM: [2.5, 0, -1.8], facingYawRad: -Math.PI * 0.5, surfaceY: 0, railHeightM: 1.0, railNormal: [-1, 0, 0] }),
    ]),
  }),
  Object.freeze({
    id: "sunlit-atelier-cafe",
    labelKo: "햇살 아틀리에 카페",
    categoryKo: "일상·로맨스",
    descriptionKo: "격자 대형 창틀, 황동 펜던트 조명, 우드 테이블·체어, 액자 갤러리와 화분 식물이 채운 아틀리에 카페",
    recommendedAtmosphereId: "morning",
    footprintMeters: Object.freeze([10, 3.8, 9] as const),
    groundRoughness: 0.34,
    groundMetalness: 0.08,
    accentTokenVar: "var(--color-warn)",
    particleLabelKo: "햇살 먼지 빛알갱이",
    furnitureAnchors: Object.freeze([
      freezeAnchor({ id: "cafe-aisle-stand", labelKo: "카운터 앞 서기", kind: "standing", positionM: [0.2, 0, 0.9], facingYawRad: Math.PI, surfaceY: 0 }),
      freezeAnchor({ id: "cafe-window-seat", labelKo: "창가 의자 착석", kind: "seated", positionM: [-2.1, 0, -0.5], facingYawRad: Math.PI * 0.5, surfaceY: 0, seatHeightM: 0.46 }),
      freezeAnchor({ id: "cafe-terrace-lean", labelKo: "테라스 난간 기대기", kind: "leaning", positionM: [2.7, 0, -2.1], facingYawRad: -Math.PI * 0.45, surfaceY: 0, railHeightM: 1.02, railNormal: [-1, 0, 0] }),
    ]),
  }),
  Object.freeze({
    id: "rofan-imperial-banquet",
    labelKo: "로판 황궁 대연회장",
    categoryKo: "로판·판타지",
    descriptionKo: "대리석 반사 바닥, 주름 대열주, 아치형 격자 대창, 다층 크리스털 샹들리에와 석조 발코니 난간",
    recommendedAtmosphereId: "backlight",
    footprintMeters: Object.freeze([14, 6.8, 16] as const),
    groundRoughness: 0.12,
    groundMetalness: 0.28,
    accentTokenVar: "var(--color-accent)",
    particleLabelKo: "황궁 금빛 반짝임",
    furnitureAnchors: Object.freeze([
      freezeAnchor({ id: "palace-carpet-stand", labelKo: "레드카펫 중앙 서기", kind: "standing", positionM: [0, 0, 1.8], facingYawRad: 0, surfaceY: 0 }),
      freezeAnchor({ id: "palace-throne-seat", labelKo: "연회 의자 착석", kind: "seated", positionM: [-2.8, 0, -1.6], facingYawRad: Math.PI * 0.35, surfaceY: 0, seatHeightM: 0.48 }),
      freezeAnchor({ id: "palace-balcony-lean", labelKo: "대리석 난간 기대기", kind: "leaning", positionM: [3.3, 0, -2.2], facingYawRad: -Math.PI * 0.5, surfaceY: 0, railHeightM: 1.05, railNormal: [-1, 0, 0] }),
    ]),
  }),
  Object.freeze({
    id: "academy-sunset-rooftop",
    labelKo: "학원 노을 옥상",
    categoryKo: "학원·청춘",
    descriptionKo: "콘크리트 옥상 바닥, 철망 안전펜스 난간, 계단실 옥탑과 벤치, 노을 꽃잎·바람 입자가 감도는 청춘 옥상",
    recommendedAtmosphereId: "sunset",
    footprintMeters: Object.freeze([12, 4.4, 10] as const),
    groundRoughness: 0.58,
    groundMetalness: 0.05,
    accentTokenVar: "var(--color-accent-2)",
    particleLabelKo: "노을 바람·꽃잎",
    furnitureAnchors: Object.freeze([
      freezeAnchor({ id: "rooftop-open-stand", labelKo: "옥상 중앙 서기", kind: "standing", positionM: [0.4, 0, 0.8], facingYawRad: Math.PI * 0.15, surfaceY: 0 }),
      freezeAnchor({ id: "rooftop-bench-seat", labelKo: "옥상 벤치 착석", kind: "seated", positionM: [-2.2, 0, -1.0], facingYawRad: Math.PI * 0.2, surfaceY: 0, seatHeightM: 0.44 }),
      freezeAnchor({ id: "rooftop-fence-lean", labelKo: "철망 난간 기대기", kind: "leaning", positionM: [0, 0, -3.7], facingYawRad: 0, surfaceY: 0, railHeightM: 1.12, railNormal: [0, 0, 1] }),
    ]),
  }),
  Object.freeze({
    id: "cyber-subway-platform",
    labelKo: "사이버 지하철 승강장",
    categoryKo: "SF·사이버",
    descriptionKo: "점자 안전블록 반사 바닥, 스크린도어 안전난간, 행선지 LED 사인, H빔 기둥과 홀로그램 입자 승강장",
    recommendedAtmosphereId: "night",
    footprintMeters: Object.freeze([11, 4.2, 16] as const),
    groundRoughness: 0.22,
    groundMetalness: 0.36,
    accentTokenVar: "var(--color-cool)",
    particleLabelKo: "사이버 홀로그램 입자",
    furnitureAnchors: Object.freeze([
      freezeAnchor({ id: "subway-line-stand", labelKo: "승차선 앞 서기", kind: "standing", positionM: [0.9, 0, 1.1], facingYawRad: Math.PI * 0.5, surfaceY: 0 }),
      freezeAnchor({ id: "subway-bench-seat", labelKo: "승강장 벤치 착석", kind: "seated", positionM: [-1.4, 0, -0.4], facingYawRad: Math.PI * 0.5, surfaceY: 0, seatHeightM: 0.45 }),
      freezeAnchor({ id: "subway-psd-lean", labelKo: "스크린도어 가드 기대기", kind: "leaning", positionM: [2.8, 0, -1.5], facingYawRad: -Math.PI * 0.5, surfaceY: 0, railHeightM: 1.04, railNormal: [-1, 0, 0] }),
    ]),
  }),
  Object.freeze({
    id: "modern-webtoon-office",
    labelKo: "모던 웹툰 오피스",
    categoryKo: "현대·오피스",
    descriptionKo: "유리 파티션 창틀, 듀얼 액정타블렛 워크스테이션, 음향 천장 배플 조명, 스토리보드 액자와 실내 수목",
    recommendedAtmosphereId: "day",
    footprintMeters: Object.freeze([11, 3.6, 10] as const),
    groundRoughness: 0.32,
    groundMetalness: 0.14,
    accentTokenVar: "var(--color-good)",
    particleLabelKo: "실내 자연광 부유 입자",
    furnitureAnchors: Object.freeze([
      freezeAnchor({ id: "office-center-stand", labelKo: "회의 통로 서기", kind: "standing", positionM: [0, 0, 1.2], facingYawRad: 0, surfaceY: 0 }),
      freezeAnchor({ id: "office-chair-seat", labelKo: "작업 의자 착석", kind: "seated", positionM: [-2.0, 0, -0.8], facingYawRad: Math.PI * 0.5, surfaceY: 0, seatHeightM: 0.46 }),
      freezeAnchor({ id: "office-rail-lean", labelKo: "복도 유리 난간 기대기", kind: "leaning", positionM: [3.1, 0, -1.2], facingYawRad: -Math.PI * 0.5, surfaceY: 0, railHeightM: 1.02, railNormal: [-1, 0, 0] }),
    ]),
  }),
]);

export function getRichWebtoonScenePreset(
  presetId: RichWebtoonScenePresetId | string,
): RichWebtoonScenePresetMeta | null {
  return RICH_WEBTOON_SCENE_PRESETS.find((entry) => entry.id === presetId) ?? null;
}
