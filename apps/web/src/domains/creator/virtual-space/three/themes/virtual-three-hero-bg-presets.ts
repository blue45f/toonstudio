/**
 * Hero 3D BG 카탈로그(`STUDIO_BG3D_HERO_V1_ENTRIES` 및 향후 v2 확장 엔트리)를 동적으로 소비해
 * 가상 스튜디오 3D 룸 프리셋(스폰·좌석 앵커·3D 리뷰 스크린·네비메시 바운드·Desktop 8노드/Mobile 4노드 티어)을 생성한다.
 *
 * - 슬러그 목록을 하드코딩하지 않고 카탈로그 엔트리를 순회하므로 향후 v2 6씬이 카탈로그에 등록되면
 *   가상 스튜디오 3D 룸 피커와 씬 스테이지에 자동 노출된다.
 * - 이 모듈은 지연 로드되는 `virtual-space/three/**` 내부에만 머무르므로 `studio-eager-graph`에 +0B를 유지한다.
 */
import type { StudioBg3dEnvironmentTheme } from "../../../bg3d/studio-bg3d-environment-definition";
import {
  HERO_V1_DESKTOP_NODE_NAMES,
  HERO_V1_MOBILE_NODE_NAMES,
} from "../../../bg3d/studio-bg3d-hero-v1-catalog-entries";
import { STUDIO_BG3D_HERO_ALL_ENTRIES } from "../../../bg3d/studio-bg3d-hero-v2-catalog-entries";
import {
  readBrowserHeroBg3dDeliveryContext,
  resolveHeroBg3dDeliveryAsset,
  type HeroBg3dDeliveryContext,
  type HeroBg3dDeliveryResolution,
  type StudioBg3dHeroSceneEntry,
} from "../../../bg3d/studio-bg3d-hero-tier-selector";
import type { StudioVirtualSpaceFacing } from "../../studio-virtual-space-model";
import type {
  VirtualThreeHeroSceneTheme,
  VirtualThreeHeroSceneThemeId,
  VirtualThreeThemeLighting,
} from "./virtual-three-theme-types";

export interface VirtualThreeHeroSeatAnchor {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly positionMeters: readonly [number, number, number];
  readonly facing: StudioVirtualSpaceFacing;
}

export interface VirtualThreeHeroReviewScreenSpec {
  readonly positionMeters: readonly [number, number, number];
  readonly rotationY: number;
  readonly widthMeters: number;
  readonly heightMeters: number;
}

export interface VirtualThreeHeroNavBoundsMeters {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface VirtualThreeHeroBgRoomPreset {
  readonly themeId: VirtualThreeHeroSceneThemeId;
  readonly slug: string;
  readonly entry: StudioBg3dHeroSceneEntry;
  readonly theme: VirtualThreeHeroSceneTheme;
  readonly spawnMeters: readonly [number, number, number];
  readonly seatAnchors: readonly VirtualThreeHeroSeatAnchor[];
  readonly reviewScreen: VirtualThreeHeroReviewScreenSpec;
  readonly navBoundsMeters: VirtualThreeHeroNavBoundsMeters;
  readonly desktopNodeNames: readonly string[];
  readonly mobileNodeNames: readonly string[];
  readonly resolveDelivery: (context?: Partial<HeroBg3dDeliveryContext>) => HeroBg3dDeliveryResolution;
}

interface HeroSceneSpatialOverride {
  readonly enName: string;
  readonly enDescription: string;
  readonly genreEn: string;
  readonly spawnMeters: readonly [number, number, number];
  readonly seatAnchors: readonly VirtualThreeHeroSeatAnchor[];
  readonly reviewScreen: VirtualThreeHeroReviewScreenSpec;
}

const KNOWN_HERO_OVERRIDES: Readonly<Record<string, HeroSceneSpatialOverride>> = Object.freeze({
  kr_modern_apartment_living: {
    enName: "Korean Modern Apartment Living Room",
    enDescription: "A sunlit Korean apartment studio room with terrace window, fabric sofa, kitchen island, and 8-node auto cutaway.",
    genreEn: "Modern Romance · Slice of Life",
    spawnMeters: [0.4, 0, 1.35],
    seatAnchors: [
      { id: "apt-sofa-left", labelKo: "거실 소파 좌석 A", labelEn: "Living Sofa Seat A", positionMeters: [-1.45, 0, -0.3], facing: "down" },
      { id: "apt-sofa-right", labelKo: "거실 소파 좌석 B", labelEn: "Living Sofa Seat B", positionMeters: [-0.45, 0, -0.3], facing: "down" },
      { id: "apt-island-seat", labelKo: "아일랜드 작업석", labelEn: "Island Work Seat", positionMeters: [2.1, 0, -0.7], facing: "left" },
    ],
    reviewScreen: { positionMeters: [-0.4, 1.65, -2.75], rotationY: 0, widthMeters: 2.6, heightMeters: 1.46 },
  },
  kr_atelier_cafe_interior: {
    enName: "Seoul Atelier Cafe Interior",
    enDescription: "Warm wood-arch cafe studio with espresso bar, pendant lamps, 2/4-seat review tables, and auto wall cutaway.",
    genreEn: "Modern Drama · Romance",
    spawnMeters: [1.1, 0, 1.8],
    seatAnchors: [
      { id: "cafe-window-1", labelKo: "창가 2인석 A", labelEn: "Window Table A", positionMeters: [-2.8, 0, 0.9], facing: "right" },
      { id: "cafe-window-2", labelKo: "창가 2인석 B", labelEn: "Window Table B", positionMeters: [-1.8, 0, 0.9], facing: "left" },
      { id: "cafe-bar-seat", labelKo: "에스프레소 바 좌석", labelEn: "Espresso Bar Seat", positionMeters: [-1.2, 0, -1.35], facing: "up" },
    ],
    reviewScreen: { positionMeters: [0.6, 1.85, -3.45], rotationY: 0, widthMeters: 2.8, heightMeters: 1.58 },
  },
  kr_highschool_classroom_corridor: {
    enName: "Korean High School Classroom & Corridor",
    enDescription: "Six-row classroom with chalkboard, lectern, sliding corridor doors, and crisp daylight window shadows.",
    genreEn: "School Life · Youth",
    spawnMeters: [0.0, 0, 2.2],
    seatAnchors: [
      { id: "class-window-front", labelKo: "창가 앞자리", labelEn: "Front Window Desk", positionMeters: [-2.4, 0, -0.4], facing: "up" },
      { id: "class-center-row", labelKo: "중앙 합평석", labelEn: "Center Review Desk", positionMeters: [0.0, 0, 0.2], facing: "up" },
      { id: "class-corridor-row", labelKo: "복도측 좌석", labelEn: "Corridor Side Desk", positionMeters: [2.2, 0, -0.2], facing: "up" },
    ],
    reviewScreen: { positionMeters: [0.0, 1.75, -4.15], rotationY: 0, widthMeters: 3.4, heightMeters: 1.65 },
  },
  kr_school_rooftop_hero: {
    enName: "School Rooftop Hero Stage",
    enDescription: "Open-air Korean school rooftop with chain-link fence, water-tank house, steel door, and benches.",
    genreEn: "Academy · Action · Confession",
    spawnMeters: [0.6, 0, 1.8],
    seatAnchors: [
      { id: "roof-bench-west", labelKo: "옥상 서쪽 벤치", labelEn: "West Rooftop Bench", positionMeters: [-2.6, 0, 0.4], facing: "right" },
      { id: "roof-bench-east", labelKo: "옥상 동쪽 벤치", labelEn: "East Rooftop Bench", positionMeters: [2.4, 0, 0.8], facing: "left" },
    ],
    reviewScreen: { positionMeters: [0.0, 2.05, -4.6], rotationY: 0, widthMeters: 3.2, heightMeters: 1.8 },
  },
  kr_seoul_alley_street_hero: {
    enName: "Seoul Alley Street Hero Stage",
    enDescription: "Atmospheric Seoul residential alley with exterior stairs, utility poles, AC units, and asphalt curb details.",
    genreEn: "Action · Thriller · Urban",
    spawnMeters: [0.0, 0, 3.6],
    seatAnchors: [
      { id: "alley-step-west", labelKo: "빌라 계단 쉼터", labelEn: "Alley Stair Rest", positionMeters: [-2.1, 0, 0.5], facing: "right" },
      { id: "alley-curb-east", labelKo: "가로등 벤치", labelEn: "Streetlamp Bench", positionMeters: [2.0, 0, -1.2], facing: "left" },
    ],
    reviewScreen: { positionMeters: [0.0, 2.35, -6.8], rotationY: 0, widthMeters: 3.2, heightMeters: 1.8 },
  },
  rofan_imperial_palace_hall_balcony: {
    enName: "Imperial Palace Grand Hall & Balcony",
    enDescription: "Fluted marble colonnade, grand staircase, chandelier hall, and moonlight terrace balcony for fantasy production.",
    genreEn: "Romance Fantasy · Ballroom",
    spawnMeters: [0.4, 0, 4.2],
    seatAnchors: [
      { id: "palace-balcony-seat", labelKo: "발코니 독대석", labelEn: "Balcony Terrace Seat", positionMeters: [-4.6, 0, 1.4], facing: "right" },
      { id: "palace-hall-west", labelKo: "연회장 좌측 석", labelEn: "Grand Hall West Seat", positionMeters: [-2.4, 0, 0.6], facing: "down" },
      { id: "palace-hall-east", labelKo: "연회장 우측 석", labelEn: "Grand Hall East Seat", positionMeters: [2.6, 0, 0.6], facing: "down" },
    ],
    reviewScreen: { positionMeters: [0.0, 2.8, -7.8], rotationY: 0, widthMeters: 4.0, heightMeters: 2.25 },
  },
  kr_modern_office_suite: {
    enName: "Korean Modern Office & Glass Boardroom",
    enDescription: "Seoul glass-wall office with 6 dual-monitor desks, whiteboard conference room, executive corner, and pantry.",
    genreEn: "Modern Romance · Office Drama",
    spawnMeters: [0.0, 0, 1.8],
    seatAnchors: [
      { id: "office-desk-1", labelKo: "오픈 워크스테이션 A", labelEn: "Open Workstation A", positionMeters: [-2.2, 0, 0.2], facing: "up" },
      { id: "office-boardroom", labelKo: "유리 회의실 석", labelEn: "Glass Boardroom Seat", positionMeters: [3.2, 0, -0.8], facing: "left" },
      { id: "office-executive", labelKo: "대표실 코너 데스크", labelEn: "Executive Desk", positionMeters: [-3.8, 0, -2.0], facing: "down" },
    ],
    reviewScreen: { positionMeters: [3.6, 1.75, -3.5], rotationY: 0, widthMeters: 3.0, heightMeters: 1.68 },
  },
  kr_seoul_subway_train_platform: {
    enName: "Seoul Subway Line 2 Car & Platform",
    enDescription: "Line 2 commuter rail car with 28 hand straps, priority seats, screen doors, arrival LED display, and tactile platform.",
    genreEn: "Modern Romance · Thriller · Daily",
    spawnMeters: [0.0, 0, 1.5],
    seatAnchors: [
      { id: "subway-bench-north", labelKo: "객실 일반석", labelEn: "Standard Cabin Seat", positionMeters: [-2.4, 0, -1.9], facing: "down" },
      { id: "subway-platform-bench", labelKo: "승강장 대기 벤치", labelEn: "Platform Bench", positionMeters: [2.6, 0, 1.9], facing: "up" },
    ],
    reviewScreen: { positionMeters: [0.0, 2.0, -2.85], rotationY: 0, widthMeters: 3.4, heightMeters: 1.7 },
  },
  kr_hospital_ward_corridor: {
    enName: "General Hospital Ward & Nurse Station",
    enDescription: "Two-bed hospital ward with pleated privacy curtains, IV stands, ECG monitor, L-shaped nurse station, and corridor.",
    genreEn: "Medical · Drama · Thriller",
    spawnMeters: [0.0, 0, 1.9],
    seatAnchors: [
      { id: "hospital-visitor-sofa", labelKo: "병실 보호자 소파", labelEn: "Ward Visitor Sofa", positionMeters: [-3.2, 0, 0.4], facing: "up" },
      { id: "hospital-nurse-desk", labelKo: "간호사실 데스크", labelEn: "Nurse Station Desk", positionMeters: [3.4, 0, -0.4], facing: "down" },
    ],
    reviewScreen: { positionMeters: [0.2, 1.75, -3.4], rotationY: 0, widthMeters: 2.8, heightMeters: 1.58 },
  },
  rofan_noble_study_parlor: {
    enName: "Northern Duke Study & Tea Parlor",
    enDescription: "Three-bay arched library, rolling ladder, tiered crystal chandelier, marble fireplace, study desk, and velvet parlor.",
    genreEn: "Romance Fantasy · Aristocratic",
    spawnMeters: [0.5, 0, 2.1],
    seatAnchors: [
      { id: "study-duke-desk", labelKo: "집무 책상", labelEn: "Duke Study Desk", positionMeters: [-2.1, 0, -1.2], facing: "down" },
      { id: "study-tea-sofa", labelKo: "티타임 벨벳 소파", labelEn: "Tea Parlor Sofa", positionMeters: [1.8, 0, 0.8], facing: "left" },
    ],
    reviewScreen: { positionMeters: [0.0, 2.25, -3.8], rotationY: 0, widthMeters: 3.2, heightMeters: 1.8 },
  },
  kr_rooftop_studio_oneroom: {
    enName: "Korean Rooftop Studio & Terrace",
    enDescription: "Youth rooftop studio room with PC desk, kitchenette, sliding glass door, string-lit terrace, and camping chairs.",
    genreEn: "Modern Slice of Life · Youth · Romance",
    spawnMeters: [-0.8, 0, 1.2],
    seatAnchors: [
      { id: "rooftop-pc-desk", labelKo: "마감 PC 작업석", labelEn: "Deadline PC Desk", positionMeters: [-1.4, 0, -1.8], facing: "up" },
      { id: "rooftop-terrace-chair", labelKo: "옥탑 테라스 캠핑 의자", labelEn: "Terrace Camping Chair", positionMeters: [2.4, 0, 0.9], facing: "left" },
    ],
    reviewScreen: { positionMeters: [-1.2, 1.58, -3.15], rotationY: 0, widthMeters: 2.5, heightMeters: 1.4 },
  },
  kr_convenience_store_night: {
    enName: "Korean 24h Convenience Store (Night)",
    enDescription: "Late-night convenience store with glowing storefront sign, outdoor parasol tables, window ramen bar, coolers, and POS.",
    genreEn: "Modern Slice of Life · Youth · Thriller",
    spawnMeters: [0.4, 0, 1.6],
    seatAnchors: [
      { id: "cvs-window-bar-1", labelKo: "창가 컵라면 시식 바 A", labelEn: "Window Ramen Bar A", positionMeters: [2.4, 0, 1.2], facing: "down" },
      { id: "cvs-window-bar-2", labelKo: "창가 컵라면 시식 바 B", labelEn: "Window Ramen Bar B", positionMeters: [3.3, 0, 1.2], facing: "down" },
      { id: "cvs-parasol-out", labelKo: "야외 파라솔 좌석", labelEn: "Outdoor Parasol Seat", positionMeters: [-2.2, 0, 2.8], facing: "right" },
    ],
    reviewScreen: { positionMeters: [0.0, 1.82, -3.3], rotationY: 0, widthMeters: 2.9, heightMeters: 1.62 },
  },
});

export function toHeroBgThemeId(slug: string): VirtualThreeHeroSceneThemeId {
  return `hero-bg-${slug.trim().replace(/_/gu, "-")}`;
}

function humanizeSlugEn(slug: string): string {
  return slug
    .split(/[_-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function lightingForEnvironmentTheme(theme: StudioBg3dEnvironmentTheme): VirtualThreeThemeLighting {
  switch (theme) {
    case "hospitality":
      return {
        ambientIlluminanceLux: 115,
        key: { illuminanceLux: 520, temperatureKelvin: 4200, azimuthDegrees: -32, elevationDegrees: 44 },
        fill: { illuminanceLux: 170, temperatureKelvin: 5600 },
      };
    case "urban":
      return {
        ambientIlluminanceLux: 95,
        key: { illuminanceLux: 580, temperatureKelvin: 5400, azimuthDegrees: 28, elevationDegrees: 52 },
        fill: { illuminanceLux: 165, temperatureKelvin: 6500 },
      };
    case "fantasy":
      return {
        ambientIlluminanceLux: 105,
        key: { illuminanceLux: 490, temperatureKelvin: 3900, azimuthDegrees: -24, elevationDegrees: 42 },
        fill: { illuminanceLux: 195, temperatureKelvin: 6000 },
      };
    case "education":
      return {
        ambientIlluminanceLux: 130,
        key: { illuminanceLux: 640, temperatureKelvin: 5800, azimuthDegrees: -38, elevationDegrees: 50 },
        fill: { illuminanceLux: 190, temperatureKelvin: 6500 },
      };
    case "home":
    default:
      return {
        ambientIlluminanceLux: 120,
        key: { illuminanceLux: 560, temperatureKelvin: 5100, azimuthDegrees: -30, elevationDegrees: 46 },
        fill: { illuminanceLux: 180, temperatureKelvin: 6200 },
      };
  }
}

function defaultSeatAnchorsForBounds(
  slug: string,
  bounds: readonly [number, number, number],
): readonly VirtualThreeHeroSeatAnchor[] {
  const halfX = Math.max(1.2, bounds[0] * 0.28);
  const offsetZ = Math.max(0.6, Math.min(2.0, bounds[2] * 0.14));
  return Object.freeze([
    {
      id: `${slug}-seat-west`,
      labelKo: "리뷰 좌석 A",
      labelEn: "Review Seat A",
      positionMeters: [-halfX * 0.6, 0, -offsetZ],
      facing: "down",
    },
    {
      id: `${slug}-seat-east`,
      labelKo: "리뷰 좌석 B",
      labelEn: "Review Seat B",
      positionMeters: [halfX * 0.6, 0, -offsetZ],
      facing: "down",
    },
  ]);
}

function defaultReviewScreenForBounds(
  bounds: readonly [number, number, number],
): VirtualThreeHeroReviewScreenSpec {
  const widthMeters = Math.max(2.2, Math.min(4.0, bounds[0] * 0.3));
  const heightMeters = Number((widthMeters * 9 / 16).toFixed(2));
  const y = Math.max(1.45, Math.min(2.8, bounds[1] * 0.56));
  const z = -Math.max(1.8, bounds[2] * 0.44);
  return Object.freeze({
    positionMeters: [0, y, z] as const,
    rotationY: 0,
    widthMeters,
    heightMeters,
  });
}

/**
 * 단일 Hero 3D BG 카탈로그 엔트리를 가상 스튜디오 룸 프리셋 + 테마 계약으로 변환한다.
 * 향후 v2 씬 엔트리가 카탈로그에 추가돼도 별도 하드코딩 없이 공간 바운드·앵커·리뷰 스크린이 자동 산출된다.
 */
export function buildHeroBgRoomPresetFromEntry(
  entry: StudioBg3dHeroSceneEntry,
): VirtualThreeHeroBgRoomPreset {
  const themeId = toHeroBgThemeId(entry.slug);
  const bounds = entry.desktopAsset.bounds;
  const override = KNOWN_HERO_OVERRIDES[entry.slug];
  const insetX = Math.min(0.75, bounds[0] * 0.12);
  const insetZ = Math.min(0.75, bounds[2] * 0.12);
  const navBoundsMeters: VirtualThreeHeroNavBoundsMeters = Object.freeze({
    minX: Number((-bounds[0] / 2 + insetX).toFixed(3)),
    maxX: Number((bounds[0] / 2 - insetX).toFixed(3)),
    minZ: Number((-bounds[2] / 2 + insetZ).toFixed(3)),
    maxZ: Number((bounds[2] / 2 - insetZ).toFixed(3)),
  });
  const spawnMeters: readonly [number, number, number] = override?.spawnMeters
    ?? Object.freeze([0, 0, Number(Math.min(2.2, bounds[2] * 0.22).toFixed(2))] as const);
  const seatAnchors = override?.seatAnchors ?? defaultSeatAnchorsForBounds(entry.slug, bounds);
  const reviewScreen = override?.reviewScreen ?? defaultReviewScreenForBounds(bounds);
  const enName = override?.enName ?? humanizeSlugEn(entry.slug);
  const enDescription = override?.enDescription
    ?? `${enName} 3D virtual studio room with desktop 8-node / mobile 4-node automatic cutaway.`;
  const genreEn = override?.genreEn ?? entry.genreKo;

  const theme: VirtualThreeHeroSceneTheme = Object.freeze({
    id: themeId,
    kind: "hero-scene",
    version: 1,
    heroSlug: entry.slug,
    genreKo: entry.genreKo,
    genreEn,
    thumbnailUrl: entry.desktopAsset.thumbnailUrl,
    boundsMeters: bounds,
    cutawayEnabledWalls: entry.cutawayEnabledWalls,
    lighting: lightingForEnvironmentTheme(entry.theme),
    desktopAssetId: entry.desktopAsset.id,
    mobileAssetId: entry.mobileAsset.id,
    desktopUrl: entry.desktopAsset.url,
    mobileUrl: entry.mobileAsset.url,
    desktopByteLength: entry.desktopAsset.byteSize,
    mobileByteLength: entry.mobileAsset.byteSize,
    desktopSha256: entry.desktopAsset.sha256,
    mobileSha256: entry.mobileAsset.sha256,
    copy: Object.freeze({
      ko: Object.freeze({ name: entry.labelKo, description: entry.desktopAsset.description }),
      en: Object.freeze({ name: enName, description: enDescription }),
    }),
  });

  return Object.freeze({
    themeId,
    slug: entry.slug,
    entry,
    theme,
    spawnMeters,
    seatAnchors,
    reviewScreen,
    navBoundsMeters,
    desktopNodeNames: HERO_V1_DESKTOP_NODE_NAMES,
    mobileNodeNames: HERO_V1_MOBILE_NODE_NAMES,
    resolveDelivery(context?: Partial<HeroBg3dDeliveryContext>): HeroBg3dDeliveryResolution {
      const resolvedContext = readBrowserHeroBg3dDeliveryContext(context);
      return resolveHeroBg3dDeliveryAsset(entry.desktopAsset, resolvedContext);
    },
  });
}

/** Hero 3D BG 카탈로그 엔트리 목록(기본: v1 6씬 + v2 6씬 전체 12씬)을 순회해 동적으로 가상 스튜디오 룸 프리셋을 구축한다. */
export function buildHeroBgRoomPresets(
  entries: readonly StudioBg3dHeroSceneEntry[] = STUDIO_BG3D_HERO_ALL_ENTRIES,
): readonly VirtualThreeHeroBgRoomPreset[] {
  return Object.freeze(entries.map((entry) => buildHeroBgRoomPresetFromEntry(entry)));
}

export const VIRTUAL_THREE_HERO_BG_PRESETS: readonly VirtualThreeHeroBgRoomPreset[] = buildHeroBgRoomPresets();

export const VIRTUAL_THREE_HERO_SCENE_THEMES: readonly VirtualThreeHeroSceneTheme[] = Object.freeze(
  VIRTUAL_THREE_HERO_BG_PRESETS.map((preset) => preset.theme),
);

const PRESET_BY_THEME_ID = new Map<string, VirtualThreeHeroBgRoomPreset>(
  VIRTUAL_THREE_HERO_BG_PRESETS.map((preset) => [preset.themeId, preset] as const),
);
const PRESET_BY_SLUG = new Map<string, VirtualThreeHeroBgRoomPreset>(
  VIRTUAL_THREE_HERO_BG_PRESETS.map((preset) => [preset.slug, preset] as const),
);

export function findVirtualThreeHeroBgPreset(
  themeIdOrSlug: string | null | undefined,
): VirtualThreeHeroBgRoomPreset | undefined {
  if (!themeIdOrSlug) return undefined;
  return PRESET_BY_THEME_ID.get(themeIdOrSlug) ?? PRESET_BY_SLUG.get(themeIdOrSlug);
}
