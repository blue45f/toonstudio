/**
 * Wave 159: 2D 삼각형 메쉬 부호 넓이, 양수 클램프 코탄젠트 인접 그래프,
 * 그리고 삼각형 뒤집힘·간선 신축·면적비 왜곡 감사 모듈.
 */

import type {
  ArapAdjacencyGraph,
  ArapAuditStatus,
  ArapDistortionAudit,
  ArapEdgeNeighbor,
  ArapMesh2d,
  ArapPinHandle,
  Vec2,
} from "./arap-deform-types";

const EPSILON = 1e-12;

export function triangleSignedArea2d(a: Vec2, b: Vec2, c: Vec2): number {
  return 0.5 * ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function cotangentAtCorner(corner: Vec2, p1: Vec2, p2: Vec2): number {
  const ux = p1.x - corner.x;
  const uy = p1.y - corner.y;
  const vx = p2.x - corner.x;
  const vy = p2.y - corner.y;
  const dot = ux * vx + uy * vy;
  const crossAbs = Math.abs(ux * vy - uy * vx);
  return crossAbs <= EPSILON ? 0 : dot / crossAbs;
}

/**
 * 2D 삼각형 메쉬의 인접 그래프와 대칭 양수 코탄젠트 가중치를 계산한다.
 * 둔각 삼각형에서 음수가 되는 코탄젠트는 `minCotangentWeight` 이상으로 클램프해
 * 라플라시안 행렬이 항상 대칭 양의 준정부호(핀 결합 시 엄격 SPD)를 유지하도록 보장한다.
 */
export function computeArapEdgeWeights(
  mesh: ArapMesh2d,
  options?: {
    readonly minCotangentWeight?: number;
    readonly useCotangentWeights?: boolean;
  },
): ArapAdjacencyGraph {
  const vertexCount = mesh.vertices.length;
  const minWeightClamp = Math.max(1e-6, options?.minCotangentWeight ?? 0.01);
  const useCotangent = options?.useCotangentWeights ?? true;

  const edgeWeightMap = new Map<string, { readonly a: number; readonly b: number; weight: number }>();

  const accumulateEdge = (u: number, v: number, halfCot: number): void => {
    const a = u < v ? u : v;
    const b = u < v ? v : u;
    const key = `${a}:${b}`;
    const existing = edgeWeightMap.get(key);
    if (existing !== undefined) {
      existing.weight += halfCot;
    } else {
      edgeWeightMap.set(key, { a, b, weight: halfCot });
    }
  };

  for (let t = 0; t < mesh.triangles.length; t += 1) {
    const [i, j, k] = mesh.triangles[t];
    if (
      i < 0 ||
      j < 0 ||
      k < 0 ||
      i >= vertexCount ||
      j >= vertexCount ||
      k >= vertexCount ||
      i === j ||
      j === k ||
      k === i
    ) {
      continue;
    }
    const pi = mesh.vertices[i];
    const pj = mesh.vertices[j];
    const pk = mesh.vertices[k];

    if (useCotangent) {
      accumulateEdge(j, k, 0.5 * cotangentAtCorner(pi, pj, pk));
      accumulateEdge(k, i, 0.5 * cotangentAtCorner(pj, pk, pi));
      accumulateEdge(i, j, 0.5 * cotangentAtCorner(pk, pi, pj));
    } else {
      accumulateEdge(j, k, 0.5);
      accumulateEdge(k, i, 0.5);
      accumulateEdge(i, j, 0.5);
    }
  }

  const neighborBuckets: ArapEdgeNeighbor[][] = [];
  for (let i = 0; i < vertexCount; i += 1) {
    neighborBuckets.push([]);
  }

  let minWeight = Number.POSITIVE_INFINITY;
  let maxWeight = 0;
  let edgeCount = 0;

  const sortedEdges = Array.from(edgeWeightMap.values()).sort((lhs, rhs) =>
    lhs.a !== rhs.a ? lhs.a - rhs.a : lhs.b - rhs.b,
  );

  for (let e = 0; e < sortedEdges.length; e += 1) {
    const entry = sortedEdges[e];
    const clampedWeight = useCotangent
      ? Math.max(minWeightClamp, entry.weight)
      : Math.max(minWeightClamp, 1.0);
    const pa = mesh.vertices[entry.a];
    const pb = mesh.vertices[entry.b];
    const dx = pa.x - pb.x;
    const dy = pa.y - pb.y;
    const len = Math.hypot(dx, dy);

    neighborBuckets[entry.a].push({
      to: entry.b,
      weight: clampedWeight,
      restDx: dx,
      restDy: dy,
      restLength: len,
    });
    neighborBuckets[entry.b].push({
      to: entry.a,
      weight: clampedWeight,
      restDx: -dx,
      restDy: -dy,
      restLength: len,
    });

    if (clampedWeight < minWeight) {
      minWeight = clampedWeight;
    }
    if (clampedWeight > maxWeight) {
      maxWeight = clampedWeight;
    }
    edgeCount += 1;
  }

  for (let i = 0; i < vertexCount; i += 1) {
    neighborBuckets[i].sort((lhs, rhs) => lhs.to - rhs.to);
  }

  return {
    vertexCount,
    neighbors: neighborBuckets,
    edgeCount,
    minWeight: edgeCount > 0 ? minWeight : 0,
    maxWeight,
  };
}

/**
 * 변형된 2D 메쉬의 삼각형 뒤집힘(`signedArea <= 0`), 간선 신축비, 면적비, 핸들 오차를 감사한다.
 */
export function auditArapMeshDistortion(
  mesh: ArapMesh2d,
  deformedPositions: readonly Vec2[],
  handles: readonly ArapPinHandle[] = [],
): ArapDistortionAudit {
  const invertedTriangleIndices: number[] = [];
  const triangleStretchScores: number[] = new Array<number>(mesh.triangles.length);
  const uniqueEdges = new Map<string, { readonly a: number; readonly b: number }>();

  let minSignedArea = Number.POSITIVE_INFINITY;
  let minAreaRatio = Number.POSITIVE_INFINITY;
  let maxAreaRatio = 0;
  let hasNonFinite = false;

  for (let i = 0; i < deformedPositions.length; i += 1) {
    const p = deformedPositions[i];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      hasNonFinite = true;
    }
  }

  for (let t = 0; t < mesh.triangles.length; t += 1) {
    const [ia, ib, ic] = mesh.triangles[t];
    const restArea = triangleSignedArea2d(
      mesh.vertices[ia],
      mesh.vertices[ib],
      mesh.vertices[ic],
    );
    const defArea = triangleSignedArea2d(
      deformedPositions[ia],
      deformedPositions[ib],
      deformedPositions[ic],
    );
    const areaRatio = defArea / Math.max(Math.abs(restArea), EPSILON);

    if (defArea < minSignedArea) {
      minSignedArea = defArea;
    }
    if (areaRatio < minAreaRatio) {
      minAreaRatio = areaRatio;
    }
    if (areaRatio > maxAreaRatio) {
      maxAreaRatio = areaRatio;
    }

    const inverted = defArea <= 0;
    if (inverted) {
      invertedTriangleIndices.push(t);
    }

    const triPairs: readonly (readonly [number, number])[] = [
      [ia, ib],
      [ib, ic],
      [ic, ia],
    ];
    let maxTriEdgeDev = 0;
    for (let e = 0; e < 3; e += 1) {
      const [u, v] = triPairs[e];
      const a = u < v ? u : v;
      const b = u < v ? v : u;
      uniqueEdges.set(`${a}:${b}`, { a, b });

      const restLen = Math.hypot(
        mesh.vertices[u].x - mesh.vertices[v].x,
        mesh.vertices[u].y - mesh.vertices[v].y,
      );
      const defLen = Math.hypot(
        deformedPositions[u].x - deformedPositions[v].x,
        deformedPositions[u].y - deformedPositions[v].y,
      );
      const dev = Math.abs(defLen / Math.max(restLen, EPSILON) - 1.0);
      if (dev > maxTriEdgeDev) {
        maxTriEdgeDev = dev;
      }
    }

    const areaDev = Math.abs(areaRatio - 1.0);
    triangleStretchScores[t] = inverted
      ? 1.0
      : Math.min(1.0, Math.max(maxTriEdgeDev * 1.4, areaDev * 0.75));
  }

  let minStretchRatio = Number.POSITIVE_INFINITY;
  let maxStretchRatio = 0;
  let stretchSum = 0;
  const edgeEntries = Array.from(uniqueEdges.values());
  for (let e = 0; e < edgeEntries.length; e += 1) {
    const { a, b } = edgeEntries[e];
    const restLen = Math.hypot(
      mesh.vertices[a].x - mesh.vertices[b].x,
      mesh.vertices[a].y - mesh.vertices[b].y,
    );
    const defLen = Math.hypot(
      deformedPositions[a].x - deformedPositions[b].x,
      deformedPositions[a].y - deformedPositions[b].y,
    );
    const stretch = defLen / Math.max(restLen, EPSILON);
    if (stretch < minStretchRatio) {
      minStretchRatio = stretch;
    }
    if (stretch > maxStretchRatio) {
      maxStretchRatio = stretch;
    }
    stretchSum += stretch;
  }

  const edgeCount = edgeEntries.length;
  const meanStretchRatio = edgeCount > 0 ? stretchSum / edgeCount : 1;

  let maxHandleError = 0;
  let handleErrorSum = 0;
  let validHandleCount = 0;
  for (let h = 0; h < handles.length; h += 1) {
    const handle = handles[h];
    if (handle.vertexIndex < 0 || handle.vertexIndex >= deformedPositions.length) {
      continue;
    }
    const p = deformedPositions[handle.vertexIndex];
    const err = Math.hypot(p.x - handle.target.x, p.y - handle.target.y);
    if (err > maxHandleError) {
      maxHandleError = err;
    }
    handleErrorSum += err;
    validHandleCount += 1;
  }

  const meanHandleError = validHandleCount > 0 ? handleErrorSum / validHandleCount : 0;

  let status: ArapAuditStatus = "PASS";
  if (
    hasNonFinite ||
    invertedTriangleIndices.length > 0 ||
    maxStretchRatio > 1.75 ||
    minStretchRatio < 0.45
  ) {
    status = "FAIL";
  } else if (
    maxStretchRatio > 1.35 ||
    minStretchRatio < 0.72 ||
    minAreaRatio < 0.55 ||
    maxAreaRatio > 1.7
  ) {
    status = "WARN";
  }

  return {
    triangleCount: mesh.triangles.length,
    edgeCount,
    invertedTriangleCount: invertedTriangleIndices.length,
    invertedTriangleIndices,
    minSignedArea: mesh.triangles.length > 0 ? minSignedArea : 0,
    minAreaRatio: mesh.triangles.length > 0 ? minAreaRatio : 1,
    maxAreaRatio: mesh.triangles.length > 0 ? maxAreaRatio : 1,
    minStretchRatio: edgeCount > 0 ? minStretchRatio : 1,
    maxStretchRatio: edgeCount > 0 ? maxStretchRatio : 1,
    meanStretchRatio,
    maxHandleError,
    meanHandleError,
    triangleStretchScores,
    status,
  };
}
