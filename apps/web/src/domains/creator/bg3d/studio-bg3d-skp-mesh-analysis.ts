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

export interface StudioBg3dSkpMeshIntegrity {
  readonly status: "checked" | "skipped";
  /** 3개 이상의 삼각형이 만나는 비다양체(non-manifold) 경계 수. */
  readonly nonManifoldEdges: number;
  /** 동일 평면에서 겹쳐 Z-fighting을 유발하는 삼각형 쌍 수. */
  readonly coplanarZFightingPairs: number;
  /** 최하단 Y 좌표(미터). 정점이 없으면 null. */
  readonly floorMinYMeters: number | null;
  /** `|minY| <= 1e-4`로 바닥(Y = 0)에 접지되어 있는지 여부. */
  readonly groundedAtY0: boolean;
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
  readonly integrity: StudioBg3dSkpMeshIntegrity;
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

interface CoplanarTriEntry {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
  readonly u2: number;
  readonly v2: number;
  readonly minU: number;
  readonly minV: number;
  readonly maxU: number;
  readonly maxV: number;
  readonly cu: number;
  readonly cv: number;
}

const PLANE_NORMAL_QUANT = 1e3;
const PLANE_OFFSET_QUANT = 1e4;
const COPLANAR_BUCKET_PAIR_CAP = 64;
const STRICT_EPS = 1e-4;

function cross2d(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function pointStrictlyInsideTriangle2d(px: number, py: number, tri: CoplanarTriEntry): boolean {
  const c0 = cross2d(tri.u0, tri.v0, tri.u1, tri.v1, px, py);
  const c1 = cross2d(tri.u1, tri.v1, tri.u2, tri.v2, px, py);
  const c2 = cross2d(tri.u2, tri.v2, tri.u0, tri.v0, px, py);
  return (c0 > STRICT_EPS && c1 > STRICT_EPS && c2 > STRICT_EPS)
    || (c0 < -STRICT_EPS && c1 < -STRICT_EPS && c2 < -STRICT_EPS);
}

function segmentsStrictlyIntersect2d(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const o1 = cross2d(ax, ay, bx, by, cx, cy);
  const o2 = cross2d(ax, ay, bx, by, dx, dy);
  const o3 = cross2d(cx, cy, dx, dy, ax, ay);
  const o4 = cross2d(cx, cy, dx, dy, bx, by);
  return ((o1 > STRICT_EPS && o2 < -STRICT_EPS) || (o1 < -STRICT_EPS && o2 > STRICT_EPS))
    && ((o3 > STRICT_EPS && o4 < -STRICT_EPS) || (o3 < -STRICT_EPS && o4 > STRICT_EPS));
}

function trianglesOverlapInPlane2d(left: CoplanarTriEntry, right: CoplanarTriEntry): boolean {
  if (
    left.maxU <= right.minU + STRICT_EPS
    || right.maxU <= left.minU + STRICT_EPS
    || left.maxV <= right.minV + STRICT_EPS
    || right.maxV <= left.minV + STRICT_EPS
  ) {
    return false;
  }
  // 동일/겹친 중심점(중복 면·양면 겹침) 또는 한쪽 중심/꼭짓점이 다른 삼각형 내부에 엄격히 포함
  if (
    (Math.abs(left.cu - right.cu) <= 1e-3 && Math.abs(left.cv - right.cv) <= 1e-3)
    || pointStrictlyInsideTriangle2d(left.cu, left.cv, right)
    || pointStrictlyInsideTriangle2d(right.cu, right.cv, left)
    || pointStrictlyInsideTriangle2d(left.u0, left.v0, right)
    || pointStrictlyInsideTriangle2d(left.u1, left.v1, right)
    || pointStrictlyInsideTriangle2d(left.u2, left.v2, right)
    || pointStrictlyInsideTriangle2d(right.u0, right.v0, left)
    || pointStrictlyInsideTriangle2d(right.u1, right.v1, left)
    || pointStrictlyInsideTriangle2d(right.u2, right.v2, left)
  ) {
    return true;
  }
  const leftEdges: readonly (readonly [number, number, number, number])[] = [
    [left.u0, left.v0, left.u1, left.v1],
    [left.u1, left.v1, left.u2, left.v2],
    [left.u2, left.v2, left.u0, left.v0],
  ];
  const rightEdges: readonly (readonly [number, number, number, number])[] = [
    [right.u0, right.v0, right.u1, right.v1],
    [right.u1, right.v1, right.u2, right.v2],
    [right.u2, right.v2, right.u0, right.v0],
  ];
  for (const [ax, ay, bx, by] of leftEdges) {
    for (const [cx, cy, dx, dy] of rightEdges) {
      if (segmentsStrictlyIntersect2d(ax, ay, bx, by, cx, cy, dx, dy)) return true;
    }
  }
  return false;
}

function countCoplanarZFightingPairs(primitives: readonly StudioBg3dSkpPrimitive[]): number {
  const buckets = new Map<string, CoplanarTriEntry[]>();
  for (const primitive of primitives) {
    const { positions, indices } = primitive;
    for (let index = 0; index < indices.length; index += 3) {
      const a = indices[index] * 3;
      const b = indices[index + 1] * 3;
      const c = indices[index + 2] * 3;
      const ax = positions[a];
      const ay = positions[a + 1];
      const az = positions[a + 2];
      const bx = positions[b];
      const by = positions[b + 1];
      const bz = positions[b + 2];
      const cxp = positions[c];
      const cyp = positions[c + 1];
      const czp = positions[c + 2];
      const e1x = bx - ax;
      const e1y = by - ay;
      const e1z = bz - az;
      const e2x = cxp - ax;
      const e2y = cyp - ay;
      const e2z = czp - az;
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const lenSq = nx * nx + ny * ny + nz * nz;
      if (lenSq < DEGENERATE_AREA_SQUARED) continue;
      const invLen = 1 / Math.sqrt(lenSq);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;
      // 방향 부호를 정규화해 앞뒤가 반대여도 같은 평면 버킷으로 묶는다.
      if (nx < -1e-4 || (Math.abs(nx) <= 1e-4 && (ny < -1e-4 || (Math.abs(ny) <= 1e-4 && nz < 0)))) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const d = nx * ax + ny * ay + nz * az;
      const key = `${Math.round(nx * PLANE_NORMAL_QUANT)},${Math.round(ny * PLANE_NORMAL_QUANT)},${Math.round(nz * PLANE_NORMAL_QUANT)},${Math.round(d * PLANE_OFFSET_QUANT)}`;
      // 주 법선 축을 제외하고 2D 평면 (u, v)로 정사영해 면 내부 실제 겹침만 판정한다.
      const absX = Math.abs(nx);
      const absY = Math.abs(ny);
      const absZ = Math.abs(nz);
      const [u0, v0, u1, v1, u2, v2] =
        absX >= absY && absX >= absZ
          ? [ay, az, by, bz, cyp, czp]
          : absY >= absZ
            ? [ax, az, bx, bz, cxp, czp]
            : [ax, ay, bx, by, cxp, cyp];
      const entry: CoplanarTriEntry = {
        u0,
        v0,
        u1,
        v1,
        u2,
        v2,
        minU: Math.min(u0, u1, u2),
        minV: Math.min(v0, v1, v2),
        maxU: Math.max(u0, u1, u2),
        maxV: Math.max(v0, v1, v2),
        cu: (u0 + u1 + u2) / 3,
        cv: (v0 + v1 + v2) / 3,
      };
      const list = buckets.get(key);
      if (list) list.push(entry);
      else buckets.set(key, [entry]);
    }
  }
  let pairs = 0;
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const limit = Math.min(list.length, COPLANAR_BUCKET_PAIR_CAP);
    for (let i = 0; i < limit; i += 1) {
      const left = list[i]!;
      for (let j = i + 1; j < limit; j += 1) {
        const right = list[j]!;
        if (trianglesOverlapInPlane2d(left, right)) pairs += 1;
      }
    }
  }
  return pairs;
}

function checkTopologyAndOrientation(primitives: readonly StudioBg3dSkpPrimitive[]): {
  readonly orientation: StudioBg3dSkpOrientationCheck;
  readonly nonManifoldEdges: number;
  readonly coplanarZFightingPairs: number;
} {
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
  let nonManifoldEdges = 0;
  for (const value of edges.values()) {
    const forwardCount = value & COUNTER_CAP;
    const backwardCount = value >>> 16;
    const total = forwardCount + backwardCount;
    if (total > 2) {
      nonManifoldEdges += 1;
      continue;
    }
    if (total !== 2) continue;
    sharedEdges += 1;
    if (forwardCount === 2 || backwardCount === 2) conflictingEdges += 1;
  }
  return {
    orientation: { status: "checked", sharedEdges, conflictingEdges },
    nonManifoldEdges,
    coplanarZFightingPairs: countCoplanarZFightingPairs(primitives),
  };
}

/**
 * 프리미티브 정점을 `1.0 = 1m` 비율을 유지한 채 바닥(`Y = 0`)에 정확히 접지시킨다.
 */
export function groundStudioBg3dSkpPrimitivesToFloorY0(
  primitives: readonly StudioBg3dSkpPrimitive[],
): {
  readonly primitives: readonly StudioBg3dSkpPrimitive[];
  readonly shiftedYMeters: number;
  readonly groundedAtY0: boolean;
} {
  let minY = Number.POSITIVE_INFINITY;
  for (const primitive of primitives) {
    const { positions } = primitive;
    for (let index = 1; index < positions.length; index += 3) {
      const y = positions[index];
      if (!Number.isFinite(y)) throw nonFiniteGeometry();
      if (y < minY) minY = y;
    }
  }
  if (!Number.isFinite(minY) || Math.abs(minY) <= 1e-6) {
    return { primitives, shiftedYMeters: 0, groundedAtY0: Number.isFinite(minY) };
  }
  const shifted = primitives.map((primitive) => {
    const nextPositions = new Float32Array(primitive.positions);
    for (let index = 1; index < nextPositions.length; index += 3) {
      nextPositions[index] -= minY;
    }
    return { ...primitive, positions: nextPositions };
  });
  return { primitives: shifted, shiftedYMeters: -minY, groundedAtY0: true };
}

/**
 * 프리미티브 목록의 정점·삼각형 수, 경계, 퇴화 삼각형, 면 방향 어긋남,
 * 비다양체 경계·Z-fighting·바닥 접지(`Y = 0`) 무결성을 계산한다.
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
  const topology = triangleCount <= options.orientationTriangleBudget
    ? checkTopologyAndOrientation(primitives)
    : null;
  const orientation: StudioBg3dSkpOrientationCheck = topology
    ? topology.orientation
    : { status: "skipped", sharedEdges: 0, conflictingEdges: 0 };
  const floorMinYMeters = bounds ? bounds.min[1] : null;
  const integrity: StudioBg3dSkpMeshIntegrity = {
    status: topology ? "checked" : "skipped",
    nonManifoldEdges: topology?.nonManifoldEdges ?? 0,
    coplanarZFightingPairs: topology?.coplanarZFightingPairs ?? 0,
    floorMinYMeters,
    groundedAtY0: floorMinYMeters !== null && Math.abs(floorMinYMeters) <= 1e-4,
  };
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
    integrity,
  };
}
