/**
 * "벽에 붙이기" 배치용 벽 탐지 — 놓을 지점에서 네 축 방향으로 광선을 쏴 가장 가까운 수직 면을 찾는다.
 *
 * - 렌더링 없이 three 의 Raycaster 로 보이는 메시만 검사한다(숨긴 오브젝트는 벽이 아니다).
 * - 벽은 "거의 수직(|법선 y| ≤ 0.2)이고 광선 방향 축에 거의 정렬(≈14° 이내)된 면"이다. 바닥·천장·경사면과 비스듬한
 *   벽은 건너뛰며, 가장 가까운 수직 면이 비스듬하면 그 방향에는 벽이 없다고 본다(그 너머로 추측하지 않는다).
 * - 수직 면이면 무엇이든 벽으로 본다. 가구 옆면도 후보가 될 수 있으므로 결과는 사용자가 실행 취소로 되돌릴 수 있다.
 * - 거리가 같으면 뒤쪽(-Z) 벽 → +X → -X → +Z 순으로 고른다.
 */

import * as THREE from "three";

import { readStudioBg3dWorldSurfaceHit } from "./studio-bg3d-camera-application";

import type { StudioBg3dPlacementWall } from "./studio-bg3d-asset-placement-recipes";

const PROBE_DIRECTIONS = Object.freeze([
  Object.freeze({ vector: [0, 0, -1] as const, axis: "z" as const, index: 2, sign: -1 as const }),
  Object.freeze({ vector: [1, 0, 0] as const, axis: "x" as const, index: 0, sign: 1 as const }),
  Object.freeze({ vector: [-1, 0, 0] as const, axis: "x" as const, index: 0, sign: -1 as const }),
  Object.freeze({ vector: [0, 0, 1] as const, axis: "z" as const, index: 2, sign: 1 as const }),
]);
const MAX_VERTICAL_NORMAL = 0.2;
const MIN_AXIS_ALIGNMENT = 0.97;
const DISTANCE_TIE_EPSILON = 1e-9;
export const STUDIO_BG3D_WALL_PROBE_MAX_DISTANCE_METERS = 60;

export interface StudioBg3dWallProbeOptions {
  readonly maxDistance?: number;
}

/**
 * @param roots 장면 오브젝트 루트들. 보이는 메시만 검사한다.
 * @param origin 광선을 쏘는 월드 좌표(보통 놓을 지점의 바닥 위 일정 높이).
 * @returns 가장 가까운 벽 면, 없으면 null
 */
export function probeStudioBg3dNearestWall(
  roots: Iterable<THREE.Object3D>,
  origin: readonly [number, number, number],
  options: StudioBg3dWallProbeOptions = {},
): StudioBg3dPlacementWall | null {
  const maxDistance = options.maxDistance ?? STUDIO_BG3D_WALL_PROBE_MAX_DISTANCE_METERS;
  if (!origin.every(Number.isFinite) || !Number.isFinite(maxDistance) || maxDistance <= 0) return null;

  const meshes: THREE.Object3D[] = [];
  for (const root of roots) {
    if (!root?.isObject3D) continue;
    root.updateWorldMatrix(true, true);
    root.traverseVisible((node) => {
      if ((node as THREE.Mesh).isMesh) meshes.push(node);
    });
  }
  if (meshes.length === 0) return null;

  const raycaster = new THREE.Raycaster();
  raycaster.near = 0;
  raycaster.far = maxDistance;
  let best: { readonly wall: StudioBg3dPlacementWall; readonly distance: number } | null = null;

  for (const direction of PROBE_DIRECTIONS) {
    raycaster.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction.vector));
    for (const hit of raycaster.intersectObjects(meshes, false)) {
      const surface = readStudioBg3dWorldSurfaceHit(hit);
      if (!surface || Math.abs(surface.normal[1]) > MAX_VERTICAL_NORMAL) continue;
      // 가장 가까운 수직 면이 축에 정렬돼 있지 않으면 이 방향에는 붙일 벽이 없다.
      if (Math.abs(surface.normal[direction.index]) < MIN_AXIS_ALIGNMENT) break;
      if (best === null || hit.distance < best.distance - DISTANCE_TIE_EPSILON) {
        best = {
          wall: Object.freeze({
            axis: direction.axis,
            // 법선은 광선이 온 쪽(방 안쪽)을 향한다.
            direction: (direction.sign === 1 ? -1 : 1) as 1 | -1,
            coordinate: surface.point[direction.index],
          }),
          distance: hit.distance,
        };
      }
      break;
    }
  }
  return best?.wall ?? null;
}
