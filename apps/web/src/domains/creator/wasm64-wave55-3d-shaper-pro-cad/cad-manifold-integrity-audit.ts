/**
 * Wave 55 3D 셰이퍼+ 수밀(Watertight)·오일러-푸앵카레 다양체 무결성 감사기.
 *
 * - 솔리드 메쉬의 오일러-푸앵카레 지표(`V - E + F = 2*(1-g)`), 엣지 공유 횟수(정확히 2회),
 *   고립 정점, 외향 법선 일관성, 바닥 접지(`Y = 0`), 비퇴화 UV 무결성을 전수 검사한다.
 */

import {
  type CadSolidMesh,
  DEGENERATE_AREA_THRESHOLD,
  type SolidManifoldAuditReport,
  triangleNormalAndArea,
  undirectedEdgeKey,
  vec3Dot,
  vec3Length,
} from "./cad-manifold-primitives";

/**
 * 솔리드 메쉬의 오일러-푸앵카레 지표(`V - E + F = 2*(1-g)`), 엣지 공유 횟수(정확히 2회),
 * 고립 정점, 외향 법선 일관성, 바닥 접지(`Y = 0`), UV 무결성을 전수 검사한다.
 */
export function auditSolidManifoldIntegrity(solid: CadSolidMesh): SolidManifoldAuditReport {
  const vertexCount = solid.vertices.length;
  const triangleCount = solid.triangles.length;
  const usedVertices = new Uint8Array(vertexCount);
  const edgeMap = new Map<string, { count: number; forward: number; backward: number; tris: number[] }>();
  let degenerateTriangles = 0;
  let alignedNormalDots = 0;
  let validNormalSamples = 0;

  for (let tIdx = 0; tIdx < triangleCount; tIdx += 1) {
    const tri = solid.triangles[tIdx];
    if (!tri) continue;
    const [i0, i1, i2] = tri;
    const a = solid.vertices[i0];
    const b = solid.vertices[i1];
    const c = solid.vertices[i2];
    if (!a || !b || !c || i0 === i1 || i1 === i2 || i2 === i0) {
      degenerateTriangles += 1;
      continue;
    }
    const { normal, area } = triangleNormalAndArea(a, b, c);
    if (area < DEGENERATE_AREA_THRESHOLD) {
      degenerateTriangles += 1;
      continue;
    }
    usedVertices[i0] = 1;
    usedVertices[i1] = 1;
    usedVertices[i2] = 1;

    for (const vIdx of tri) {
      const vn = solid.normals[vIdx];
      if (vn && vec3Length(vn) > 0.5) {
        alignedNormalDots += vec3Dot(vn, normal);
        validNormalSamples += 1;
      }
    }

    const pairs: Array<[number, number]> = [[i0, i1], [i1, i2], [i2, i0]];
    for (const [u, v] of pairs) {
      const key = undirectedEdgeKey(u, v);
      const isForward = u < v;
      const rec = edgeMap.get(key);
      if (rec) {
        rec.count += 1;
        if (isForward) rec.forward += 1;
        else rec.backward += 1;
        rec.tris.push(tIdx);
      } else {
        edgeMap.set(key, {
          count: 1,
          forward: isForward ? 1 : 0,
          backward: isForward ? 0 : 1,
          tris: [tIdx],
        });
      }
    }
  }

  let looseVertices = 0;
  for (let i = 0; i < vertexCount; i += 1) {
    if (usedVertices[i] !== 1) looseVertices += 1;
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  let reversedWindingEdges = 0;
  const adjacency: number[][] = Array.from({ length: triangleCount }, () => []);
  for (const rec of edgeMap.values()) {
    if (rec.count === 1) {
      boundaryEdges += 1;
    } else if (rec.count > 2) {
      nonManifoldEdges += 1;
    } else if (rec.forward !== 1 || rec.backward !== 1) {
      reversedWindingEdges += 1;
    }
    if (rec.tris.length === 2) {
      const tA = rec.tris[0] ?? 0;
      const tB = rec.tris[1] ?? 0;
      adjacency[tA]?.push(tB);
      adjacency[tB]?.push(tA);
    }
  }

  const visited = new Uint8Array(triangleCount);
  let shellCount = 0;
  for (let i = 0; i < triangleCount; i += 1) {
    if (visited[i] === 1) continue;
    shellCount += 1;
    const queue: number[] = [i];
    visited[i] = 1;
    while (queue.length > 0) {
      const cur = queue.pop() ?? 0;
      for (const nxt of adjacency[cur] ?? []) {
        if (visited[nxt] === 0) {
          visited[nxt] = 1;
          queue.push(nxt);
        }
      }
    }
  }

  const uniqueEdgeCount = edgeMap.size;
  const usedVertexCount = vertexCount - looseVertices;
  const eulerCharacteristic = usedVertexCount - uniqueEdgeCount + triangleCount;

  const outwardNormalsConsistent =
    solid.signedVolumeM3 > 1e-9 &&
    validNormalSamples > 0 &&
    alignedNormalDots / validNormalSamples > 0.25;

  const minY = solid.bounds.min[1];
  const isFloorGrounded = Math.abs(minY) <= 1e-4;

  let uvValid = solid.uvs.length === vertexCount && vertexCount > 0;
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const uv of solid.uvs) {
    if (!Number.isFinite(uv[0]) || !Number.isFinite(uv[1])) {
      uvValid = false;
      break;
    }
    if (uv[0] < minU) minU = uv[0];
    if (uv[0] > maxU) maxU = uv[0];
    if (uv[1] < minV) minV = uv[1];
    if (uv[1] > maxV) maxV = uv[1];
  }
  const hasValidUvs = uvValid && (maxU - minU > 1e-6 || maxV - minV > 1e-6);

  const issues: string[] = [];
  if (triangleCount < 4) issues.push("유효한 닫힌 솔리드 삼각형 수가 4개 미만입니다.");
  if (boundaryEdges > 0) issues.push(`열린 경계 모서리가 ${boundaryEdges}개 검출되었습니다.`);
  if (nonManifoldEdges > 0) issues.push(`비다양체(non-manifold) 모서리가 ${nonManifoldEdges}개 검출되었습니다.`);
  if (reversedWindingEdges > 0) issues.push(`인접 면 와인딩 방향이 어긋난 모서리가 ${reversedWindingEdges}개 있습니다.`);
  if (looseVertices > 0) issues.push(`면과 연결되지 않은 고립 정점이 ${looseVertices}개 남아 있습니다.`);
  if (degenerateTriangles > 0) issues.push(`면적 0 퇴화 삼각형이 ${degenerateTriangles}개 포함되어 있습니다.`);
  if (!outwardNormalsConsistent) issues.push("부호 부피 또는 외향 법선 일관성이 음수/비정상 상태입니다.");
  if (!hasValidUvs) issues.push("비퇴화 UV 좌표가 누락되었습니다.");

  const isWatertight =
    triangleCount >= 4 &&
    boundaryEdges === 0 &&
    nonManifoldEdges === 0 &&
    reversedWindingEdges === 0 &&
    looseVertices === 0 &&
    degenerateTriangles === 0 &&
    outwardNormalsConsistent;

  const estimatedGenus =
    isWatertight && shellCount === 1 && (2 - eulerCharacteristic) % 2 === 0
      ? (2 - eulerCharacteristic) / 2
      : null;

  return {
    isWatertight,
    vertexCount,
    uniqueEdgeCount,
    triangleCount,
    shellCount,
    boundaryEdges,
    nonManifoldEdges,
    reversedWindingEdges,
    looseVertices,
    degenerateTriangles,
    eulerCharacteristic,
    estimatedGenus,
    signedVolumeM3: solid.signedVolumeM3,
    outwardNormalsConsistent,
    minY,
    isFloorGrounded,
    hasValidUvs,
    issues,
  };
}
