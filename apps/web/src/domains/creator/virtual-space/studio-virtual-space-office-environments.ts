import type { StudioCampusZoneTone } from "./studio-virtual-space-campus-blueprint";
import type { StudioSpaceTheme, StudioSpaceThemeFloorPattern, StudioSpaceThemeToneMap } from "./studio-virtual-space-theme";
import type { StudioVirtualSpaceWorldManifest, StudioWorldRect } from "./studio-virtual-space-world-manifest";

export const STUDIO_OFFICE_ENVIRONMENT_KEYS = ["forest-atelier", "orbital-observatory", "tidal-atelier"] as const;
export type StudioOfficeEnvironmentKey = typeof STUDIO_OFFICE_ENVIRONMENT_KEYS[number];

interface OfficeEnvironment {
  readonly key: StudioOfficeEnvironmentKey;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly previewUrl: string;
  readonly castSpriteUrl: string;
  readonly baseTheme: "garden-terrace" | "celestial-observatory" | "sunset-harbor";
  readonly gradient: readonly [string, string, string];
  readonly floorColor: number;
  readonly wallColor: number;
  readonly accent: number;
  readonly patterns: StudioSpaceThemeToneMap<StudioSpaceThemeFloorPattern>;
  readonly spawn: { readonly x: number; readonly y: number };
  readonly colliders: readonly StudioWorldRect[];
  readonly workPoints: readonly { readonly x: number; readonly y: number; readonly action: "canvas" | "story" | "review"; readonly labelKo: string; readonly labelEn: string }[];
  readonly seats: readonly { readonly x: number; readonly y: number; readonly facing: "up" | "left" | "right"; readonly attachY: number }[];
}

const ART_ROOT = "/assets/virtual-studio/office-themes-v1";
/** 아트·테마·진입 카드·물리 배치가 함께 참조하는 사무실 원장. 좌표는 1536×1024 원본 픽셀 기준이다. */
export const STUDIO_OFFICE_ENVIRONMENTS: readonly OfficeEnvironment[] = Object.freeze([
  {
    key: "forest-atelier", labelKo: "숲의 원형 아틀리에", labelEn: "Forest Rotunda Atelier",
    descriptionKo: "거목 서가를 감싼 원형 목조 작업실. 넓은 중앙 합평 마루와 창가 식물 드로잉석을 연결해요.",
    descriptionEn: "A timber rotunda around a living library, with an open review floor and botanical drawing desks.",
    previewUrl: `${ART_ROOT}/forest-atelier.png`, castSpriteUrl: "/assets/virtual-studio/studio-art-v11/cast/line-artist-work.webp",
    baseTheme: "garden-terrace", gradient: ["#173d31", "#73976a", "#e8d6ad"], floorColor: 0xc69a62, wallColor: 0x598059, accent: 0xe4b55a,
    patterns: { marble: "deck", wood: "planks", oak: "deck", cafe: "planks", carpet: "lawn", stone: "stone", stage: "deck", mosaic: "marble", sand: "lawn", lavender: "carpet", grass: "lawn" },
    spawn: { x: 760, y: 850 },
    colliders: [
      { x: 0, y: 0, width: 1536, height: 300 },
      { x: 210, y: 300, width: 410, height: 180 },
      { x: 0, y: 480, width: 420, height: 430 },
      { x: 1220, y: 390, width: 316, height: 430 },
      { x: 0, y: 910, width: 520, height: 114 },
      { x: 980, y: 900, width: 556, height: 124 },
      { x: 670, y: 300, width: 400, height: 70 },
    ],
    workPoints: [
      { x: 1050, y: 445, action: "canvas", labelKo: "창가 식물 작화석", labelEn: "Botanical drawing desk" },
      { x: 655, y: 475, action: "story", labelKo: "거목 스토리 서가", labelEn: "Living story library" },
      { x: 820, y: 640, action: "review", labelKo: "원형 마루 합평", labelEn: "Rotunda manuscript review" },
    ],
    seats: [{ x: 960, y: 420, attachY: 396, facing: "up" }, { x: 800, y: 420, attachY: 396, facing: "up" }],
  },
  {
    key: "orbital-observatory", labelKo: "궤도 관측 스튜디오", labelEn: "Orbital Observatory Studio",
    descriptionKo: "행성 창가의 곡선 작화 데스크와 초승달 소파 라운지, 독립된 원탁 기획석을 잇는 우주 작업실이에요.",
    descriptionEn: "Curved drawing desks, a crescent lounge and a separate roundtable overlook a ringed planet.",
    previewUrl: `${ART_ROOT}/orbital-observatory.png`, castSpriteUrl: "/assets/virtual-studio/studio-art-v12/cast/story-writer-work.webp",
    baseTheme: "celestial-observatory", gradient: ["#10102e", "#35386e", "#9c9bd6"], floorColor: 0x393d78, wallColor: 0x6673ae, accent: 0xc4b3ff,
    patterns: { marble: "slate", wood: "slate", oak: "checker", cafe: "marble", carpet: "slate", stone: "marble", stage: "checker", mosaic: "slate", sand: "stone", lavender: "checker", grass: "slate" },
    spawn: { x: 850, y: 890 },
    colliders: [
      { x: 0, y: 0, width: 1536, height: 350 },
      { x: 190, y: 350, width: 810, height: 75 },
      { x: 0, y: 490, width: 430, height: 295 },
      { x: 1030, y: 635, width: 350, height: 140 },
      { x: 1280, y: 420, width: 165, height: 80 },
      { x: 0, y: 845, width: 620, height: 179 },
      { x: 1180, y: 845, width: 356, height: 179 },
    ],
    workPoints: [
      { x: 690, y: 485, action: "canvas", labelKo: "궤도 작화 콘솔", labelEn: "Orbital drawing console" },
      { x: 1190, y: 540, action: "story", labelKo: "행성 원탁 기획석", labelEn: "Planetary story roundtable" },
      { x: 970, y: 720, action: "review", labelKo: "초승달 리뷰 라운지", labelEn: "Crescent review lounge" },
    ],
    seats: [{ x: 680, y: 465, attachY: 440, facing: "up" }, { x: 1190, y: 540, attachY: 515, facing: "right" }],
  },
  {
    key: "tidal-atelier", labelKo: "산호 아르데코 아틀리에", labelEn: "Coral Art Deco Atelier",
    descriptionKo: "산호빛 소파와 진주색 창가석, 긴 공동 원고 테이블의 양쪽 통로를 따라 협업하는 해저 작업실이에요.",
    descriptionEn: "A long shared manuscript table, pearl window desks and coral sofas create two flowing underwater aisles.",
    previewUrl: `${ART_ROOT}/tidal-atelier.png`, castSpriteUrl: "/assets/virtual-studio/studio-art-v11/cast/colorist-work.webp",
    baseTheme: "sunset-harbor", gradient: ["#085b68", "#4dbcbf", "#f5e9d1"], floorColor: 0xd5e5d8, wallColor: 0x4b9895, accent: 0xe8b968,
    patterns: { marble: "checker", wood: "marble", oak: "slate", cafe: "stone", carpet: "carpet", stone: "marble", stage: "marble", mosaic: "checker", sand: "sand", lavender: "stone", grass: "deck" },
    spawn: { x: 660, y: 870 },
    colliders: [
      { x: 0, y: 0, width: 1536, height: 285 },
      { x: 0, y: 285, width: 440, height: 115 },
      { x: 20, y: 430, width: 330, height: 180 },
      { x: 680, y: 310, width: 410, height: 90 },
      { x: 1220, y: 495, width: 316, height: 110 },
      { x: 520, y: 500, width: 165, height: 80 },
      { x: 685, y: 580, width: 190, height: 80 },
      // 2026-10-30 실제 화면에서 상판 위로 보인 발점(889,643)을 막도록 북쪽만 보강한다.
      // 남쪽 끝 760은 유지하며, 전체 상판의 시각 정합성을 보증하는 조정은 아니다.
      { x: 875, y: 632, width: 245, height: 128 },
      { x: 985, y: 760, width: 150, height: 120 },
      { x: 0, y: 800, width: 420, height: 224 },
    ],
    workPoints: [
      { x: 1135, y: 470, action: "canvas", labelKo: "진주빛 창가 채색석", labelEn: "Pearl window color desk" },
      { x: 460, y: 590, action: "story", labelKo: "산호 소파 스토리 라운지", labelEn: "Coral story lounge" },
      { x: 800, y: 800, action: "review", labelKo: "공동 원고 테이블 검수", labelEn: "Shared manuscript review table" },
    ],
    seats: [{ x: 820, y: 700, attachY: 674, facing: "up" }, { x: 900, y: 440, attachY: 413, facing: "up" }],
  },
]);

export function isStudioOfficeEnvironmentKey(key: string): key is StudioOfficeEnvironmentKey {
  return STUDIO_OFFICE_ENVIRONMENT_KEYS.some((candidate) => candidate === key);
}

export function studioOfficeEnvironment(key: string | null | undefined): OfficeEnvironment | undefined {
  return STUDIO_OFFICE_ENVIRONMENTS.find((environment) => environment.key === key);
}

function toneMap<T>(map: (tone: StudioCampusZoneTone, index: number) => T): StudioSpaceThemeToneMap<T> {
  return { marble: map("marble", 0), wood: map("wood", 1), oak: map("oak", 2), cafe: map("cafe", 3), carpet: map("carpet", 4), stone: map("stone", 5), stage: map("stage", 6), mosaic: map("mosaic", 7), sand: map("sand", 8), lavender: map("lavender", 9), grass: map("grass", 10) };
}

/** 기존 테마의 캐릭터·장식 추천 계약을 재사용하고 새 환경의 재질·색·아트를 결합한다. */
export function studioOfficeEnvironmentThemes(baseThemes: readonly StudioSpaceTheme[]): readonly StudioSpaceTheme[] {
  return STUDIO_OFFICE_ENVIRONMENTS.map((environment) => {
    const base = baseThemes.find((theme) => theme.key === environment.baseTheme);
    if (!base) throw new Error(`Missing office base theme: ${environment.baseTheme}`);
    return Object.freeze({
      ...base, key: environment.key, labelKo: environment.labelKo, labelEn: environment.labelEn,
      badgeKo: "새 사무실", badgeEn: "New Office", descriptionKo: environment.descriptionKo, descriptionEn: environment.descriptionEn,
      backgroundGradient: environment.gradient, backgroundColor: environment.floorColor,
      characterHarmonyTint: environment.floorColor, decorVariant: environment.key, decorAccent: environment.accent,
      wallTints: toneMap((_tone, index) => environment.wallColor + index * 0x010101),
      floors: toneMap((tone, index) => ({ pattern: environment.patterns[tone], base: environment.floorColor + index * 0x010101, accent: environment.accent })),
    });
  });
}

const manifestCache = new Map<StudioOfficeEnvironmentKey, StudioVirtualSpaceWorldManifest>();
/** 원본에 그려진 가구의 충돌·통로·좌석·도구를 같은 픽셀 좌표에 맞춘 독립 사무실. */
export function studioOfficeEnvironmentManifest(key: string): StudioVirtualSpaceWorldManifest | null {
  const environment = studioOfficeEnvironment(key);
  if (!environment) return null;
  const cached = manifestCache.get(environment.key);
  if (cached) return cached;
  const roomId = environment.key;
  const world: StudioVirtualSpaceWorldManifest = {
    id: `toonstudio-office-${roomId}`, version: 1, width: 1536, height: 1024,
    backgroundAssetKey: `office-theme-${roomId}-v1`, backgroundUrl: environment.previewUrl,
    rooms: [{ id: roomId, labelKo: environment.labelKo, labelEn: environment.labelEn, descriptionKo: environment.descriptionKo, descriptionEn: environment.descriptionEn, x: 24, y: 300, width: 1488, height: 700, action: "canvas" }],
    props: [], colliders: [
      { x: 0, y: 0, width: 24, height: 1024 }, { x: 1512, y: 0, width: 24, height: 1024 },
      { x: 0, y: 1000, width: 1536, height: 24 }, ...environment.colliders,
    ],
    interactions: environment.workPoints.map((point, index) => ({ id: `${roomId}-tool-${index}`, zoneId: roomId, point: { x: point.x, y: point.y }, radius: 84, labelKo: point.labelKo, labelEn: point.labelEn, action: point.action })),
    interactionSlots: environment.seats.map((seat, index) => ({
      id: `${roomId}-seat-${index}`, roomId, labelKo: `${environment.labelKo} 좌석 ${index + 1}`, labelEn: `${environment.labelEn} seat ${index + 1}`,
      approachPoint: { x: seat.x - 36, y: seat.y + 24 }, anchorPoint: { x: seat.x, y: seat.y },
      seatAttachmentPoint: { x: seat.x, y: seat.attachY }, exitPoint: { x: seat.x + 36, y: seat.y + 24 }, facing: seat.facing, radius: 12,
    })),
    portals: [{ id: `${roomId}-return`, point: { x: environment.spawn.x, y: 965 }, radius: 30, href: "/studio/space?place=toon-hq" }],
    spawns: [{ id: "main", point: environment.spawn, facing: "up" }], npcs: [],
  };
  manifestCache.set(environment.key, world);
  return world;
}
