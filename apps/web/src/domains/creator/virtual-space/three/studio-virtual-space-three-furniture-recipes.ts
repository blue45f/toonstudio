import type { StudioWorldRect } from "../studio-virtual-space-world-manifest";

export type StudioThreeFurnitureKind = "bookshelf" | "console" | "sofa" | "table" | "boundary" | "display";
export interface StudioThreeFurnitureFixture {
  readonly id: string;
  readonly roomId: string;
  readonly footprint: StudioWorldRect;
  readonly kind: StudioThreeFurnitureKind;
}
const fixture = (id: string, roomId: string, kind: StudioThreeFurnitureKind, x: number, y: number, width: number, height: number): StudioThreeFurnitureFixture =>
  ({ id, roomId, kind, footprint: { x, y, width, height } });

/** 기존 공통 manifest footprint의 3D 의미 스냅샷. 2D 카탈로그·배열 순서로 의미를 추측하지 않는다. */
export const STUDIO_THREE_FURNITURE_FIXTURES: readonly StudioThreeFurnitureFixture[] = [
  fixture("forest-story-shelf", "forest-atelier", "bookshelf", 210, 300, 410, 180),
  fixture("forest-west-garden", "forest-atelier", "boundary", 0, 480, 420, 430),
  fixture("forest-east-console", "forest-atelier", "console", 1220, 390, 316, 430),
  fixture("forest-southwest-garden", "forest-atelier", "boundary", 0, 910, 520, 114),
  fixture("forest-southeast-garden", "forest-atelier", "boundary", 980, 900, 556, 124),
  fixture("forest-north-console", "forest-atelier", "console", 670, 300, 400, 70),
  fixture("orbital-north-console", "orbital-observatory", "console", 190, 350, 810, 75),
  fixture("orbital-west-console", "orbital-observatory", "console", 0, 490, 430, 295),
  fixture("orbital-review-sofa", "orbital-observatory", "sofa", 1030, 635, 350, 140),
  fixture("orbital-story-table", "orbital-observatory", "table", 1280, 420, 165, 80),
  fixture("orbital-southwest-garden", "orbital-observatory", "boundary", 0, 845, 620, 179),
  fixture("orbital-southeast-garden", "orbital-observatory", "boundary", 1180, 845, 356, 179),
  fixture("tidal-northwest-garden", "tidal-atelier", "boundary", 0, 285, 440, 115),
  fixture("tidal-story-sofa", "tidal-atelier", "sofa", 20, 430, 330, 180),
  fixture("tidal-north-console", "tidal-atelier", "console", 680, 310, 410, 90),
  fixture("tidal-east-console", "tidal-atelier", "console", 1220, 495, 316, 110),
  fixture("tidal-table-north", "tidal-atelier", "table", 520, 500, 165, 80),
  fixture("tidal-table-middle", "tidal-atelier", "table", 685, 580, 190, 80),
  fixture("tidal-table-south", "tidal-atelier", "table", 875, 660, 245, 100),
  fixture("tidal-table-end", "tidal-atelier", "table", 985, 760, 150, 120),
  fixture("tidal-southwest-garden", "tidal-atelier", "boundary", 0, 800, 420, 224),
];

export function studioThreeFootprintId(rect: StudioWorldRect): string {
  return `footprint:${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
}
