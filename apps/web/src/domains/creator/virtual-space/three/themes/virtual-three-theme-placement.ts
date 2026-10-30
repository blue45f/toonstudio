import * as THREE from "three";

import { studioWorldInteractions, studioWorldPortals, type StudioVirtualSpaceWorldManifest, type StudioWorldRect } from "../../studio-virtual-space-world-manifest";
import { isStudioThreeCampusManifest, studioThreeGeneratedProps, studioThreeManifestProps } from "../studio-virtual-space-three-generated-assets";
import { STUDIO_THREE_PROPS, STUDIO_THREE_SCALE } from "../studio-virtual-space-three-scene";
import { VIRTUAL_THREE_THEME_MODEL_IDS } from "./virtual-three-theme-models";
import type { VirtualThreeLayoutRoleKind } from "./virtual-three-theme-types";

interface Footprint extends StudioWorldRect { readonly sourceId: string }
export interface VirtualThreeThemePlacement {
  readonly position: THREE.Vector3;
  readonly footprint: StudioWorldRect;
  readonly sourceFootprintId: string;
}
export interface VirtualThreeThemePlacementPlanner {
  readonly place: (sizeMeters: THREE.Vector3, kind: VirtualThreeLayoutRoleKind) => VirtualThreeThemePlacement;
}

function intersects(a: StudioWorldRect, b: StudioWorldRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function around(x: number, y: number, radius: number): StudioWorldRect {
  return { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 };
}
function corridor(a: { x: number; y: number }, b: { x: number; y: number }, radius: number): StudioWorldRect {
  return { x: Math.min(a.x, b.x) - radius, y: Math.min(a.y, b.y) - radius,
    width: Math.abs(a.x - b.x) + radius * 2, height: Math.abs(a.y - b.y) + radius * 2 };
}

/** 새 장애물을 만들지 않는다. 기존 비보행 collider 내부의 여유 공간만 사용한다. */
export function createVirtualThreeThemePlacementPlanner(manifest: StudioVirtualSpaceWorldManifest, occupiedScene?: THREE.Scene): VirtualThreeThemePlacementPlanner {
  const occupied: StudioWorldRect[] = [];
  const playerMargin = 24;
  for (const item of studioWorldInteractions(manifest)) occupied.push(around(item.point.x, item.point.y, item.radius + playerMargin));
  for (const item of studioWorldPortals(manifest)) occupied.push(around(item.point.x, item.point.y, item.radius + playerMargin));
  for (const item of manifest.spawns) occupied.push(around(item.point.x, item.point.y, 48));
  for (const item of manifest.npcs) occupied.push(around(item.point.x, item.point.y, 48));
  for (const item of manifest.npcActivityAnchors ?? []) occupied.push(corridor(item.approachPoint, item.anchorPoint, 48), corridor(item.anchorPoint, item.exitPoint, 48));
  for (const slot of manifest.interactionSlots ?? []) {
    const radius = slot.radius + playerMargin;
    occupied.push(corridor(slot.approachPoint, slot.anchorPoint, radius), corridor(slot.anchorPoint, slot.exitPoint, radius));
  }
  // 아직 fetch가 끝나지 않은 영속 장비도 미리 예약해 후착 모델과 겹치지 않는다.
  const props = isStudioThreeCampusManifest(manifest) ? STUDIO_THREE_PROPS : studioThreeManifestProps(manifest);
  for (const prop of [...props, ...studioThreeGeneratedProps(manifest)]) {
    occupied.push(around(prop.x, prop.y, Math.max(24, prop.heightMeters / STUDIO_THREE_SCALE)));
  }
  // core 준비 완료 후 실제 디오라마/장비 경계도 예약한다. 교체될 이전 theme scene은 제외한다.
  for (const node of occupiedScene?.children ?? []) {
    if (!node.name.startsWith("zone-diorama-") && !node.name.startsWith("prop-")) continue;
    node.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(node);
    if (bounds.isEmpty()) continue;
    if (![bounds.min.x, bounds.min.z, bounds.max.x, bounds.max.z].every(Number.isFinite)) throw new TypeError("기존 3D 장비의 실제 경계를 확인할 수 없습니다.");
    const margin = 0.2 / STUDIO_THREE_SCALE;
    occupied.push({ x: bounds.min.x / STUDIO_THREE_SCALE - margin, y: bounds.min.z / STUDIO_THREE_SCALE - margin,
      width: (bounds.max.x - bounds.min.x) / STUDIO_THREE_SCALE + margin * 2, height: (bounds.max.z - bounds.min.z) / STUDIO_THREE_SCALE + margin * 2 });
  }
  const candidates: Footprint[] = manifest.colliders.filter((rect) => rect.width > 30 && rect.height > 30).map((rect) => ({
    ...rect, sourceId: `footprint:${rect.x}:${rect.y}:${rect.width}:${rect.height}`,
  })).sort((a, b) => b.width * b.height - a.width * a.height || a.y - b.y || a.x - b.x);
  return {
    place(size, kind) {
      if (![size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0)) throw new TypeError("3D 테마 모델의 경계가 유효하지 않습니다.");
      const width = size.x / STUDIO_THREE_SCALE, depth = size.z / STUDIO_THREE_SCALE;
      const margin = kind === "enclosure" ? 8 : 12;
      for (const site of candidates) {
        const left = Math.max(0, site.x) + margin, top = Math.max(0, site.y) + margin;
        const right = Math.min(manifest.width, site.x + site.width) - margin;
        const bottom = Math.min(manifest.height, site.y + site.height) - margin;
        const stepX = Math.max(width + margin, 24), stepY = Math.max(depth + margin, 24);
        for (let y = top; y + depth <= bottom; y += stepY) for (let x = left; x + width <= right; x += stepX) {
          const footprint = { x, y, width, height: depth };
          if (occupied.some((rect) => intersects(footprint, rect))) continue;
          occupied.push({ x: x - margin / 2, y: y - margin / 2, width: width + margin, height: depth + margin });
          return { position: new THREE.Vector3((x + width / 2) * STUDIO_THREE_SCALE, 0, (y + depth / 2) * STUDIO_THREE_SCALE), footprint, sourceFootprintId: site.sourceId };
        }
      }
      throw new Error("기존 이동 동선과 장비를 보존할 수 있는 3D 테마 배치 공간이 부족합니다.");
    },
  };
}

/** 원본 vertex/UV/skin을 바꾸지 않고 표시 크기만 균일하게 정한다. */
export function virtualThreeThemeModelHeight(kind: VirtualThreeLayoutRoleKind, modelAssetId: string): number {
  if (kind === "tabletop") return 0.16;
  if (kind === "botanical") return /flower/iu.test(modelAssetId) ? 0.45 : 2.2;
  if (kind === "seating") return 0.9;
  if (kind === "workstation") return /table/iu.test(modelAssetId) ? 0.94 : /desk/iu.test(modelAssetId) ? 0.86 : 1.65;
  if (kind === "storage") return 1.85;
  if (kind === "enclosure") return 1.8;
  return 1.5;
}

/** 납작한 지면용 꽃과 지정 선반판은 수평 크기로 배치한다. 다른 모델의 높이 기준은 유지한다. */
export function virtualThreeThemeModelDisplaySize(kind: VirtualThreeLayoutRoleKind, modelAssetId: string): {
  readonly axis: "height" | "ground-extent";
  readonly meters: number;
} {
  if (kind === "botanical" && modelAssetId === VIRTUAL_THREE_THEME_MODEL_IDS.parkFlower) {
    return { axis: "ground-extent", meters: 0.45 };
  }
  if (kind === "storage" && modelAssetId === VIRTUAL_THREE_THEME_MODEL_IDS.dungeonShelf) {
    return { axis: "ground-extent", meters: 1.85 };
  }
  return { axis: "height", meters: virtualThreeThemeModelHeight(kind, modelAssetId) };
}
