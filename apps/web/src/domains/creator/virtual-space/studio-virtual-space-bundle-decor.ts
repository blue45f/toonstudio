import type { StudioWorldPropDefinition } from "./studio-virtual-space-world-manifest";

const ROOT = "/assets/virtual-studio/bundle-decor-v1";
type BundleDecorId = "park-tree" | "park-planter" | "park-flower";
interface Placement {
  readonly id: BundleDecorId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

// 각 장소의 가장자리만 꾸민다. 기존 이동 경로·충돌·작업대에는 새 권한을 추가하지 않는다.
const PLACEMENTS: Readonly<Record<string, readonly Placement[]>> = Object.freeze({
  garden: [
    { id: "park-tree", x: 142, y: 584, width: 54 },
    { id: "park-flower", x: 228, y: 598, width: 32 },
  ],
  "tree-library": [
    { id: "park-tree", x: 192, y: 602, width: 54 },
    { id: "park-planter", x: 814, y: 602, width: 64 },
  ],
  "creator-cafe": [
    { id: "park-planter", x: 252, y: 602, width: 64 },
    { id: "park-flower", x: 690, y: 604, width: 32 },
  ],
});

/** 장소에 필요한 crop 2개만 기존 imageUrl 캐시에 싣는다. 구매 렌더 전체 카탈로그는 가져오지 않는다. */
export function studioVirtualPlaceBundleDecor(placeId: string): readonly StudioWorldPropDefinition[] {
  return Object.freeze((PLACEMENTS[placeId] ?? []).map((placement) => Object.freeze({
    id: `${placeId}-bundle-${placement.id}`,
    kind: "decor" as const,
    assetKey: `bundle-decor-v1-${placement.id}`,
    assetUrl: `${ROOT}/${placement.id}.webp`,
    x: placement.x, y: placement.y, width: placement.width,
    depth: "y-sort" as const,
  })));
}
