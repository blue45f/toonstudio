import type { VirtualThreeTheme, VirtualThreeAssetRecipeThemeId } from "./themes/virtual-three-theme-types";
import type { StudioThreeFloorPattern, StudioThreeFloorSpec } from "./studio-virtual-space-three-floor-patterns";

export const STUDIO_THREE_ROOM_TONES = ["marble", "wood", "oak", "cafe", "carpet", "stone", "stage", "mosaic", "sand", "lavender", "grass"] as const;
export type StudioThreeRoomTone = typeof STUDIO_THREE_ROOM_TONES[number];
type ToneMap<T> = Readonly<Record<StudioThreeRoomTone, T>>;
export interface StudioThreeSurfaceRecipe {
  readonly floors: ToneMap<StudioThreeFloorSpec>;
  readonly wallTints: ToneMap<number>;
  readonly decorAccent: number;
  readonly foliage: number;
}

const floor = (pattern: StudioThreeFloorPattern, base: number, accent: number): StudioThreeFloorSpec => ({
  pattern, base, accent,
  roughness: pattern === "marble" || pattern === "checker" ? 0.4 : pattern === "carpet" || pattern === "lawn" ? 0.95 : 0.74,
  metalness: pattern === "marble" || pattern === "slate" ? 0.05 : 0,
});
/** 기존 3D baseline 색을 명시적으로 보존하고 2D 테마의 변경을 참조하지 않는다. */
const BASELINE: StudioThreeSurfaceRecipe = {
  decorAccent: 0x8d93a6, foliage: 0x557a45,
  wallTints: { marble: 0xd9cdb8, wood: 0x8f6f58, oak: 0x7d8796, cafe: 0xa0704f, carpet: 0x9a6a5c, stone: 0x8c93a1, stage: 0x3c3f6e, mosaic: 0xc9c0b0, sand: 0xb58a5a, lavender: 0x5b4b8a, grass: 0x8a9a72 },
  floors: { marble: floor("marble", 0xe9e2d2, 0xcabfa8), wood: floor("planks", 0xd9b98f, 0xb28c5c), oak: floor("planks", 0xb9906a, 0x8f6c48), cafe: floor("planks", 0xa5714a, 0x7d5233), carpet: floor("carpet", 0x8d7f92, 0x6f6178), stone: floor("stone", 0xb9b2a4, 0x948c7c), stage: floor("planks", 0x3a3e63, 0x2b2e4a), mosaic: floor("checker", 0xe6ddca, 0x9a8f78), sand: floor("sand", 0xe6cf9e, 0xcbb27e), lavender: floor("carpet", 0xa493c4, 0x8474ab), grass: floor("lawn", 0x8fc97a, 0x6cab52) },
};

interface PreservedOfficeSurface {
  readonly floor: number;
  readonly wall: number;
  readonly accent: number;
  readonly foliage: number;
  readonly artworkUrl: string;
  readonly patterns: ToneMap<StudioThreeFloorPattern>;
}
/** 액자는 기존 이미지의 재사용 경계이며 asset-recipe 테마의 원본이나 미리보기가 아니다. */
const STUDIO_THREE_PRESERVED_OFFICE_SURFACES: Readonly<Partial<Record<string, PreservedOfficeSurface>>> = {
  "forest-atelier": { floor: 0xc69a62, wall: 0x598059, accent: 0xe4b55a, foliage: 0x557a45, artworkUrl: "/assets/virtual-studio/office-themes-v1/forest-atelier.png", patterns: { marble: "deck", wood: "planks", oak: "deck", cafe: "planks", carpet: "lawn", stone: "stone", stage: "deck", mosaic: "marble", sand: "lawn", lavender: "carpet", grass: "lawn" } },
  "orbital-observatory": { floor: 0x393d78, wall: 0x6673ae, accent: 0xc4b3ff, foliage: 0x7790b8, artworkUrl: "/assets/virtual-studio/office-themes-v1/orbital-observatory.png", patterns: { marble: "slate", wood: "slate", oak: "checker", cafe: "marble", carpet: "slate", stone: "marble", stage: "checker", mosaic: "slate", sand: "stone", lavender: "checker", grass: "slate" } },
  "tidal-atelier": { floor: 0xd5e5d8, wall: 0x4b9895, accent: 0xe8b968, foliage: 0x3b9b88, artworkUrl: "/assets/virtual-studio/office-themes-v1/tidal-atelier.png", patterns: { marble: "checker", wood: "marble", oak: "slate", cafe: "stone", carpet: "carpet", stone: "marble", stage: "marble", mosaic: "checker", sand: "sand", lavender: "stone", grass: "deck" } },
};
export function studioThreePreservedOfficeSurface(roomId?: string): PreservedOfficeSurface | undefined {
  return roomId && Object.hasOwn(STUDIO_THREE_PRESERVED_OFFICE_SURFACES, roomId)
    ? STUDIO_THREE_PRESERVED_OFFICE_SURFACES[roomId] : undefined;
}
const ASSET_FLOOR_PATTERNS: Readonly<Record<VirtualThreeAssetRecipeThemeId, StudioThreeFloorPattern>> = {
  parkbotanical: "stone", fantasyguild: "planks", sflab: "slate", gothicarchive: "stone", vehiclegarage: "checker", cafefood: "planks",
  forestretreat: "lawn", gardenstudy: "stone",
};
function toneMap<T>(value: (tone: StudioThreeRoomTone, index: number) => T): ToneMap<T> {
  return { marble: value("marble", 0), wood: value("wood", 1), oak: value("oak", 2), cafe: value("cafe", 3), carpet: value("carpet", 4), stone: value("stone", 5), stage: value("stage", 6), mosaic: value("mosaic", 7), sand: value("sand", 8), lavender: value("lavender", 9), grass: value("grass", 10) };
}
const color = (value: `#${string}`) => Number.parseInt(value.slice(1), 16);

export function studioThreeSurfaceRecipe(theme: VirtualThreeTheme, roomId?: string): StudioThreeSurfaceRecipe {
  if (theme.kind === "preserved-baseline") {
    const office = studioThreePreservedOfficeSurface(roomId);
    return office ? { decorAccent: office.accent, foliage: office.foliage,
      wallTints: toneMap((_tone, index) => office.wall + index * 0x010101),
      floors: toneMap((tone, index) => floor(office.patterns[tone], office.floor + index * 0x010101, office.accent)),
    } : BASELINE;
  }
  const spec: StudioThreeFloorSpec = {
    pattern: ASSET_FLOOR_PATTERNS[theme.id], base: color(theme.surfacePBR.floor.baseColor), accent: color(theme.surfacePBR.trim.baseColor),
    roughness: theme.surfacePBR.floor.roughness, metalness: theme.surfacePBR.floor.metalness,
  };
  return { floors: toneMap(() => spec), wallTints: toneMap(() => color(theme.surfacePBR.wall.baseColor)),
    decorAccent: color(theme.surfacePBR.trim.baseColor), foliage: color(theme.surfacePBR.wall.baseColor) };
}
