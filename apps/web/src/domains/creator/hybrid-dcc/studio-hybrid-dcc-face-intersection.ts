/**
 * 면 모델링 결과의 자기 교차 검사: 이번 연산으로 새로 생기거나 움직인 면이 다른 면을 뚫고 지나가는지 본다.
 *
 * 닫힘·방향·부피 같은 위상 검사는 면이 서로 관통해도 통과한다(뿔대 옆면을 안쪽으로 당기면 새 바닥이 입체
 * 밖으로 나가는데도 위상은 멀쩡하다). 그래서 면의 모서리가 다른 볼록 평면 면의 안쪽을 가로지르는지를 직접
 * 확인한다. 한 면의 모서리 하나가 다른 면의 평면을 양 끝점 사이에서 가로지르고, 그 교점이 다른 면의 모든
 * 가장자리에서 충분히 안쪽에 있으면 관통이다. 모서리 끝이나 면 가장자리를 스치는 접촉, 평면 위에 놓인 모서리,
 * 정점·모서리를 공유하는 이웃 면끼리의 정상적인 접촉은 관통으로 세지 않는다(공유한 점에서 나가는 모서리는
 * 그 점에서 평면을 만나므로 양 끝점 사이를 가로지르지 못한다). 면을 삼각형으로 쪼개지 않으므로 부채꼴 대각선 위로
 * 지나가는 교차도 놓치지 않는다.
 *
 * 순수 함수만 둔다. 바뀐 면의 바운딩 박스와 겹치는 면만 후보로 만들기 때문에 작은 편집은 메시가 커도 싸다.
 * 면은 볼록 평면이어야 한다(뷰포트가 그릴 수 있는 면이 곧 그 조건이다).
 */

import type { StudioEditableMesh, StudioMeshVec3 } from "../studio-editable-half-edge-mesh";

import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";

/** 교점이 모서리 양 끝과 면 가장자리에서 (모서리 길이·면 크기에 비례해) 이만큼은 떨어져야 관통으로 센다. */
const SHRINK = 1e-7;
/** 모서리 끝이 면 크기의 이 비율 안으로 평면에 붙어 있으면 평면 위에 있는 것으로 본다(수치 잡음 흡수). */
const ON_PLANE = 1e-9;

export interface StudioFaceIntersection {
  /** 서로 뚫고 지나가는 두 면의 ID. 첫 번째가 바뀐 면이다. */
  readonly faceIds: readonly [number, number];
}

interface FaceGeometry {
  readonly id: number;
  readonly points: readonly StudioMeshVec3[];
  readonly normal: StudioMeshVec3;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly diameter: number;
}

function faceBounds(points: readonly StudioMeshVec3[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const point of points) {
    min[0] = Math.min(min[0], point.x);
    min[1] = Math.min(min[1], point.y);
    min[2] = Math.min(min[2], point.z);
    max[0] = Math.max(max[0], point.x);
    max[1] = Math.max(max[1], point.y);
    max[2] = Math.max(max[2], point.z);
  }
  return { min, max };
}

function overlaps(
  aMin: readonly number[],
  aMax: readonly number[],
  bMin: readonly number[],
  bMax: readonly number[],
): boolean {
  return aMin[0]! <= bMax[0]! && aMax[0]! >= bMin[0]!
    && aMin[1]! <= bMax[1]! && aMax[1]! >= bMin[1]!
    && aMin[2]! <= bMax[2]! && aMax[2]! >= bMin[2]!;
}

function buildGeometry(id: number, points: readonly StudioMeshVec3[]): FaceGeometry | null {
  // Newell 법선: 점 순서가 반시계로 보이는 쪽.
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    nx += (current.y - next.y) * (current.z + next.z);
    ny += (current.z - next.z) * (current.x + next.x);
    nz += (current.x - next.x) * (current.y + next.y);
  }
  const length = Math.hypot(nx, ny, nz);
  if (!(length > 1e-300)) return null;
  const { min, max } = faceBounds(points);
  return {
    id,
    points,
    normal: { x: nx / length, y: ny / length, z: nz / length },
    min,
    max,
    diameter: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]),
  };
}

/** `edgeOwner`의 모서리 하나가 `target` 면의 안쪽을 가로지르는지. */
function edgesPierceFace(edgeOwner: FaceGeometry, target: FaceGeometry): boolean {
  const { points, normal } = target;
  const origin = points[0]!;
  const margin = SHRINK * target.diameter;
  const onPlane = ON_PLANE * target.diameter;
  const count = edgeOwner.points.length;
  for (let index = 0; index < count; index += 1) {
    const from = edgeOwner.points[index]!;
    const to = edgeOwner.points[(index + 1) % count]!;
    const sideFrom = (from.x - origin.x) * normal.x + (from.y - origin.y) * normal.y + (from.z - origin.z) * normal.z;
    const sideTo = (to.x - origin.x) * normal.x + (to.y - origin.y) * normal.y + (to.z - origin.z) * normal.z;
    // 평면 위에 놓인 모서리와 평면에 끝만 닿는 모서리는 가로지르는 것이 아니다.
    if (!(sideFrom * sideTo < 0) || Math.abs(sideFrom) <= onPlane || Math.abs(sideTo) <= onPlane) continue;
    const ratio = sideFrom / (sideFrom - sideTo);
    if (ratio < SHRINK || ratio > 1 - SHRINK) continue;
    const hitX = from.x + (to.x - from.x) * ratio;
    const hitY = from.y + (to.y - from.y) * ratio;
    const hitZ = from.z + (to.z - from.z) * ratio;
    let inside = true;
    for (let corner = 0; corner < points.length && inside; corner += 1) {
      const a = points[corner]!;
      const b = points[(corner + 1) % points.length]!;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const ez = b.z - a.z;
      const edgeLength = Math.hypot(ex, ey, ez);
      if (!(edgeLength > 0)) continue;
      // (e x (hit - a)) . normal / |e| 는 가장자리에서 안쪽으로 잰 거리다.
      const px = hitX - a.x;
      const py = hitY - a.y;
      const pz = hitZ - a.z;
      const distance = ((ey * pz - ez * py) * normal.x + (ez * px - ex * pz) * normal.y + (ex * py - ey * px) * normal.z) / edgeLength;
      inside = distance > margin;
    }
    if (inside) return true;
  }
  return false;
}

/**
 * `changedFaceIds`에 든 면이 다른 면(바뀐 면이든 아니든)을 뚫고 지나가는 첫 쌍을 찾는다. 없으면 null.
 * 면 순환이 깨진 메시는 검사할 수 없어 null을 돌려준다(위상 검사가 따로 거른다).
 */
export function findStudioFaceIntersection(
  mesh: StudioEditableMesh,
  changedFaceIds: readonly number[],
): StudioFaceIntersection | null {
  const loops = readStudioMeshFaceLoops(mesh);
  if (!loops || changedFaceIds.length === 0) return null;
  const changed = new Set(changedFaceIds);
  const positionsOf = (vertexIds: readonly number[]): StudioMeshVec3[] => vertexIds.map((id) => mesh.vertices[id]!.position);

  const movers: FaceGeometry[] = [];
  const moverById = new Map<number, FaceGeometry>();
  const union = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY] as [number, number, number],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY] as [number, number, number],
  };
  for (const loop of loops) {
    if (!changed.has(loop.id)) continue;
    const geometry = buildGeometry(loop.id, positionsOf(loop.vertexIds));
    if (!geometry) continue;
    movers.push(geometry);
    moverById.set(geometry.id, geometry);
    for (let axis = 0; axis < 3; axis += 1) {
      union.min[axis] = Math.min(union.min[axis]!, geometry.min[axis]!);
      union.max[axis] = Math.max(union.max[axis]!, geometry.max[axis]!);
    }
  }
  if (movers.length === 0) return null;

  // 바뀐 면 전체를 감싸는 박스와 겹치는 면만 후보로 만든다.
  const candidates: FaceGeometry[] = [];
  for (const loop of loops) {
    const mover = moverById.get(loop.id);
    if (mover) {
      candidates.push(mover);
      continue;
    }
    if (changed.has(loop.id)) continue;
    const points = positionsOf(loop.vertexIds);
    const { min, max } = faceBounds(points);
    if (!overlaps(min, max, union.min, union.max)) continue;
    const geometry = buildGeometry(loop.id, points);
    if (geometry) candidates.push(geometry);
  }

  for (const mover of movers) {
    for (const other of candidates) {
      if (other.id === mover.id) continue;
      // 바뀐 면끼리는 한 쌍을 두 번 보지 않는다.
      if (changed.has(other.id) && other.id < mover.id) continue;
      if (!overlaps(mover.min, mover.max, other.min, other.max)) continue;
      if (edgesPierceFace(mover, other) || edgesPierceFace(other, mover)) {
        return { faceIds: [mover.id, other.id] };
      }
    }
  }
  return null;
}
