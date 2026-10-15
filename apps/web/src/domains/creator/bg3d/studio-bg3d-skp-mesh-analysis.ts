/**
 * 변환된 SketchUp 형상의 통계와 면 방향 점검.
 *
 * - 경계(bounds)는 OpenSKP 의 scene.bounds 를 믿지 않고 실제 정점에서 다시 구한다. 가짜 모듈·병합 이후에도
 *   같은 값이 나오고, 유한하지 않은 좌표(NaN/Infinity)를 가장 먼저 걸러 낼 수 있다.
 * - "뒤집힌 면"은 인접한 두 면의 앞면 방향이 서로 어긋난 경계(edge)의 수로 센다. 용접한 정점 위치를
 *   기준으로 정확히 두 삼각형이 공유하는 경계에서, 두 삼각형이 같은 방향으로 그 경계를 지나가면
 *   한쪽이 뒤집힌 것이다. 한 삼각형만 쓰는 열린 경계와 세 개 이상이 만나는 경계는 판단하지 않는다.
 *   OpenSKP 는 정점 법선을 면 방향에서 만들기 때문에 "법선과 와인딩이 어긋남" 검사는 항상 0 이라 쓸 수 없었다.
 * - 점검 비용은 삼각형 수에 비례하므로 예산을 넘으면 건너뛰고 skipped 로 보고한다.
 */

import { StudioBg3dSkpParseError } from "./studio-bg3d-skp-contract";
import {
  validateStudioBg3dSkpPrimitive,
  type StudioBg3dSkpPrimitive,
} from "./studio-bg3d-skp-mesh-merge";

export type StudioBg3dSkpVector3 = readonly [number, number, number];

export interface StudioBg3dSkpMeshBounds {
  readonly min: StudioBg3dSkpVector3;
  readonly max: StudioBg3dSkpVector3;
}

export interface StudioBg3dSkpOrientationCheck {
  readonly status: "checked" | "skipped";
  /** 정확히 두 삼각형이 공유하는 경계 수. */
  readonly sharedEdges: number;
  /** 그중 두 삼각형의 방향이 어긋난 경계 수. */
  readonly conflictingEdges: number;
}

export interface StudioBg3dSkpMeshStats {
  readonly primitiveCount: number;
  readonly materialCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly degenerateTriangles: number;
  readonly bounds: StudioBg3dSkpMeshBounds | null;
  /** bounds 의 변 길이(미터). 정점이 없으면 null. */
  readonly sizeMeters: StudioBg3dSkpVector3 | null;
  readonly orientation: StudioBg3dSkpOrientationCheck;
}

export interface StudioBg3dSkpMeshAnalysisOptions {
  /** 이 삼각형 수를 넘으면 면 방향 점검을 건너뛴다. */
  readonly orientationTriangleBudget: number;
}

/** 용접 해상도: 0.1mm. 미터 단위 좌표를 정수 격자로 눌러 같은 위치의 분할 정점을 하나로 본다. */
const WELD_GRID_PER_METER = 1e4;
const DEGENERATE_AREA_SQUARED = 1e-24;
const COUNTER_CAP = 0xffff;

function nonFiniteGeometry(): StudioBg3dSkpParseError {
  return new StudioBg3dSkpParseError(
    "변환 결과에 유한하지 않은 좌표(NaN 또는 무한대)가 있습니다.",
    { reason: "invalid-geometry" },
  );
}

interface BoundsAccumulator {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function accumulatePositions(positions: Float32Array, acc: BoundsAccumulator): void {
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw nonFiniteGeometry();
    if (x < acc.minX) acc.minX = x;
    if (y < acc.minY) acc.minY = y;
    if (z < acc.minZ) acc.minZ = z;
    if (x > acc.maxX) acc.maxX = x;
    if (y > acc.maxY) acc.maxY = y;
    if (z > acc.maxZ) acc.maxZ = z;
  }
}

function countDegenerateTriangles(primitive: StudioBg3dSkpPrimitive): number {
  const { positions, indices } = primitive;
  let degenerate = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3;
    const b = indices[index + 1] * 3;
    const c = indices[index + 2] * 3;
    const e1x = positions[b] - positions[a];
    const e1y = positions[b + 1] - positions[a + 1];
    const e1z = positions[b + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a];
    const e2y = positions[c + 1] - positions[a + 1];
    const e2z = positions[c + 2] - positions[a + 2];
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    if (cx * cx + cy * cy + cz * cz < DEGENERATE_AREA_SQUARED) degenerate += 1;
  }
  return degenerate;
}

function weldPrimitives(primitives: readonly StudioBg3dSkpPrimitive[]): {
  readonly welded: readonly Uint32Array[];
  readonly weldedCount: number;
} {
  const ids = new Map<string, number>();
  const welded = primitives.map((primitive) => {
    const mapping = new Uint32Array(primitive.positions.length / 3);
    for (let vertex = 0; vertex < mapping.length; vertex += 1) {
      const key = `${Math.round(primitive.positions[vertex * 3] * WELD_GRID_PER_METER)},${
        Math.round(primitive.positions[vertex * 3 + 1] * WELD_GRID_PER_METER)},${
        Math.round(primitive.positions[vertex * 3 + 2] * WELD_GRID_PER_METER)}`;
      let id = ids.get(key);
      if (id === undefined) {
        id = ids.size;
        ids.set(key, id);
      }
      mapping[vertex] = id;
    }
    return mapping;
  });
  return { welded, weldedCount: ids.size };
}

function checkOrientation(primitives: readonly StudioBg3dSkpPrimitive[]): StudioBg3dSkpOrientationCheck {
  const { welded, weldedCount } = weldPrimitives(primitives);
  const stride = Math.max(weldedCount, 1);
  // 값: 하위 16비트 = 작은 id → 큰 id 방향 통과 수, 상위 16비트 = 반대 방향 통과 수.
  const edges = new Map<number, number>();
  const visit = (from: number, to: number): void => {
    if (from === to) return;
    const forward = from < to;
    const key = forward ? from * stride + to : to * stride + from;
    const current = edges.get(key) ?? 0;
    const forwardCount = current & COUNTER_CAP;
    const backwardCount = current >>> 16;
    edges.set(
      key,
      forward
        ? Math.min(forwardCount + 1, COUNTER_CAP) | (backwardCount << 16)
        : forwardCount | (Math.min(backwardCount + 1, COUNTER_CAP) << 16),
    );
  };
  primitives.forEach((primitive, primitiveIndex) => {
    const mapping = welded[primitiveIndex];
    for (let index = 0; index < primitive.indices.length; index += 3) {
      const a = mapping[primitive.indices[index]];
      const b = mapping[primitive.indices[index + 1]];
      const c = mapping[primitive.indices[index + 2]];
      if (a === b || b === c || a === c) continue;
      visit(a, b);
      visit(b, c);
      visit(c, a);
    }
  });
  let sharedEdges = 0;
  let conflictingEdges = 0;
  for (const value of edges.values()) {
    const forwardCount = value & COUNTER_CAP;
    const backwardCount = value >>> 16;
    if (forwardCount + backwardCount !== 2) continue;
    sharedEdges += 1;
    if (forwardCount === 2 || backwardCount === 2) conflictingEdges += 1;
  }
  return { status: "checked", sharedEdges, conflictingEdges };
}

/**
 * 프리미티브 목록의 정점·삼각형 수, 경계, 퇴화 삼각형, 면 방향 어긋남을 계산한다.
 * 손상된 배열이나 유한하지 않은 좌표는 skp-parse-failed 로 실패한다.
 */
export function analyzeStudioBg3dSkpMesh(
  primitives: readonly StudioBg3dSkpPrimitive[],
  options: StudioBg3dSkpMeshAnalysisOptions,
): StudioBg3dSkpMeshStats {
  const acc: BoundsAccumulator = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
  let vertexCount = 0;
  let triangleCount = 0;
  let degenerateTriangles = 0;
  const materials = new Set<number>();
  for (const primitive of primitives) {
    vertexCount += validateStudioBg3dSkpPrimitive(primitive);
    triangleCount += primitive.indices.length / 3;
    materials.add(primitive.materialIndex);
    accumulatePositions(primitive.positions, acc);
    degenerateTriangles += countDegenerateTriangles(primitive);
  }
  const hasVertices = Number.isFinite(acc.minX);
  const bounds: StudioBg3dSkpMeshBounds | null = hasVertices
    ? { min: [acc.minX, acc.minY, acc.minZ], max: [acc.maxX, acc.maxY, acc.maxZ] }
    : null;
  const orientation: StudioBg3dSkpOrientationCheck = triangleCount <= options.orientationTriangleBudget
    ? checkOrientation(primitives)
    : { status: "skipped", sharedEdges: 0, conflictingEdges: 0 };
  return {
    primitiveCount: primitives.length,
    materialCount: materials.size,
    vertexCount,
    triangleCount,
    degenerateTriangles,
    bounds,
    sizeMeters: bounds
      ? [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]]
      : null,
    orientation,
  };
}
