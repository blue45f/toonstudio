/**
 * 자동 3D 메시 토폴로지·법선 치유기 (₩0 로컬 실행).
 *
 * 오염되었거나 외부에서 가져온 삼각형 메시를 로컬에서 즉시 수선한다:
 * 1. 공간 해시 근접 정점 용접 (`weldEpsilon`)
 * 2. 퇴화(0면적/동일정점) 및 중복 삼각형 제거
 * 3. BFS 기반 일관 삼각형 와인딩 복구
 * 4. 단순 경계 루프 팬(fan) 홀 필링
 * 5. 연결 컴포넌트별 부호화 부피(signed volume) 외향 방향 보정
 * 6. 스무스(면적 가중) 또는 하드 단위 법선 재계산 및 치유 전/후 결함 지표 산출
 */

export interface RawTriangleMesh {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly normals?: Float32Array;
}

export interface HealedTriangleMesh {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly normals: Float32Array;
}

export interface MeshHealOptions {
  readonly weldEpsilon?: number;
  readonly minTriangleArea?: number;
  readonly fillBoundaryHoles?: boolean;
  readonly maxHoleLoopEdges?: number;
  readonly shadingMode?: "smooth" | "hard";
}

export interface MeshDefectMetrics {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly duplicateVertexCount: number;
  readonly degenerateTriangleCount: number;
  readonly inconsistentWindingEdgeCount: number;
  readonly boundaryEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly invertedNormalCount: number;
  readonly signedVolume: number;
  readonly isWatertightManifold: boolean;
}

export interface MeshHealSummary {
  readonly weldedVertexCount: number;
  readonly removedDegenerateFaces: number;
  readonly removedDuplicateFaces: number;
  readonly flippedWindingFaces: number;
  readonly filledHoleCount: number;
  readonly addedCapTriangles: number;
  readonly flippedOutwardComponents: number;
  readonly durationMs: number;
}

export interface MeshHealResult {
  readonly mesh: HealedTriangleMesh;
  readonly before: MeshDefectMetrics;
  readonly after: MeshDefectMetrics;
  readonly summary: MeshHealSummary;
}

interface EdgeIncident {
  readonly triIdx: number;
  readonly u: number;
  readonly v: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function undirectedEdgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function sortedTriKey(a: number, b: number, c: number): string {
  let x = a;
  let y = b;
  let z = c;
  if (x > y) { const t = x; x = y; y = t; }
  if (y > z) { const t = y; y = z; z = t; }
  if (x > y) { const t = x; x = y; y = t; }
  return `${x}:${y}:${z}`;
}

function triangleCross(
  pos: Float32Array | number[],
  a: number,
  b: number,
  c: number,
): readonly [number, number, number] {
  const ax = pos[a * 3];
  const ay = pos[a * 3 + 1];
  const az = pos[a * 3 + 2];
  const e1x = pos[b * 3] - ax;
  const e1y = pos[b * 3 + 1] - ay;
  const e1z = pos[b * 3 + 2] - az;
  const e2x = pos[c * 3] - ax;
  const e2y = pos[c * 3 + 1] - ay;
  const e2z = pos[c * 3 + 2] - az;
  return [e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x];
}

function signedTetVolume6(pos: Float32Array | number[], a: number, b: number, c: number): number {
  const ax = pos[a * 3];
  const ay = pos[a * 3 + 1];
  const az = pos[a * 3 + 2];
  const bx = pos[b * 3];
  const by = pos[b * 3 + 1];
  const bz = pos[b * 3 + 2];
  const cx = pos[c * 3];
  const cy = pos[c * 3 + 1];
  const cz = pos[c * 3 + 2];
  return (
    ax * (by * cz - bz * cy) +
    ay * (bz * cx - bx * cz) +
    az * (bx * cy - by * cx)
  );
}

function countSpatialDuplicates(positions: Float32Array, epsilon: number): number {
  const vertexCount = Math.floor(positions.length / 3);
  const cellSize = Math.max(epsilon, 1e-6);
  const epsSq = epsilon * epsilon;
  const grid = new Map<string, number[]>();
  let duplicates = 0;

  for (let v = 0; v < vertexCount; v += 1) {
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    const cz = Math.floor(z / cellSize);

    let matched = false;
    for (let dx = -1; dx <= 1 && !matched; dx += 1) {
      for (let dy = -1; dy <= 1 && !matched; dy += 1) {
        for (let dz = -1; dz <= 1 && !matched; dz += 1) {
          const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i += 1) {
            const other = bucket[i];
            const ox = positions[other * 3] - x;
            const oy = positions[other * 3 + 1] - y;
            const oz = positions[other * 3 + 2] - z;
            if (ox * ox + oy * oy + oz * oz <= epsSq) { matched = true; break; }
          }
        }
      }
    }
    if (matched) {
      duplicates += 1;
    } else {
      const key = `${cx},${cy},${cz}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(v);
      else grid.set(key, [v]);
    }
  }
  return duplicates;
}

/** 메시의 토폴로지·와인딩·경계·법선 결함을 정량 감사한다. */
export function inspectMeshTopologyDefects(
  mesh: RawTriangleMesh,
  options: { readonly weldEpsilon?: number; readonly minTriangleArea?: number } = {},
): MeshDefectMetrics {
  const weldEpsilon = options.weldEpsilon ?? 1e-4;
  const minArea = options.minTriangleArea ?? 1e-10;
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const triangleCount = Math.floor(mesh.indices.length / 3);
  const duplicateVertexCount = countSpatialDuplicates(mesh.positions, weldEpsilon);

  const edgeMap = new Map<string, EdgeIncident[]>();
  let degenerateTriangleCount = 0;
  let signedVolume6 = 0;
  const badNormalVerts = new Set<number>();

  for (let t = 0; t < triangleCount; t += 1) {
    const a = mesh.indices[t * 3];
    const b = mesh.indices[t * 3 + 1];
    const c = mesh.indices[t * 3 + 2];
    if (a === b || b === c || c === a || a >= vertexCount || b >= vertexCount || c >= vertexCount) {
      degenerateTriangleCount += 1;
      continue;
    }
    const [nx, ny, nz] = triangleCross(mesh.positions, a, b, c);
    const crossLen = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(crossLen) || 0.5 * crossLen <= minArea) {
      degenerateTriangleCount += 1;
      continue;
    }
    const fnx = nx / crossLen;
    const fny = ny / crossLen;
    const fnz = nz / crossLen;
    signedVolume6 += signedTetVolume6(mesh.positions, a, b, c);

    const pairs: readonly [number, number][] = [[a, b], [b, c], [c, a]];
    for (let e = 0; e < 3; e += 1) {
      const [u, v] = pairs[e];
      const key = undirectedEdgeKey(u, v);
      const list = edgeMap.get(key);
      if (list) list.push({ triIdx: t, u, v });
      else edgeMap.set(key, [{ triIdx: t, u, v }]);
    }

    if (mesh.normals && mesh.normals.length >= vertexCount * 3) {
      const verts: readonly number[] = [a, b, c];
      for (let i = 0; i < 3; i += 1) {
        const vi = verts[i];
        const vx = mesh.normals[vi * 3];
        const vy = mesh.normals[vi * 3 + 1];
        const vz = mesh.normals[vi * 3 + 2];
        const vLen = Math.hypot(vx, vy, vz);
        if (!Number.isFinite(vLen) || vLen < 0.5 || (vx * fnx + vy * fny + vz * fnz) / vLen < -1e-3) {
          badNormalVerts.add(vi);
        }
      }
    }
  }

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  let inconsistentWindingEdgeCount = 0;
  edgeMap.forEach((list) => {
    if (list.length === 1) boundaryEdgeCount += 1;
    else if (list.length === 2 && list[0].u === list[1].u && list[0].v === list[1].v) {
      inconsistentWindingEdgeCount += 1;
    } else if (list.length > 2) nonManifoldEdgeCount += 1;
  });

  const signedVolume = signedVolume6 / 6;
  return {
    vertexCount,
    triangleCount,
    duplicateVertexCount,
    degenerateTriangleCount,
    inconsistentWindingEdgeCount,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    invertedNormalCount: badNormalVerts.size,
    signedVolume,
    isWatertightManifold:
      triangleCount > 0 &&
      degenerateTriangleCount === 0 &&
      boundaryEdgeCount === 0 &&
      nonManifoldEdgeCount === 0 &&
      inconsistentWindingEdgeCount === 0 &&
      badNormalVerts.size === 0 &&
      signedVolume > 0,
  };
}

function weldVerticesSpatialHash(
  positions: Float32Array,
  indices: Uint32Array,
  epsilon: number,
): { readonly positions: number[]; readonly indices: number[]; readonly weldedCount: number } {
  const vertexCount = Math.floor(positions.length / 3);
  const cellSize = Math.max(epsilon, 1e-6);
  const epsSq = epsilon * epsilon;
  const grid = new Map<string, number[]>();
  const remap = new Uint32Array(vertexCount);
  const sumX: number[] = [];
  const sumY: number[] = [];
  const sumZ: number[] = [];
  const counts: number[] = [];
  let weldedCount = 0;

  for (let v = 0; v < vertexCount; v += 1) {
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    const cz = Math.floor(z / cellSize);

    let foundCluster = -1;
    for (let dx = -1; dx <= 1 && foundCluster < 0; dx += 1) {
      for (let dy = -1; dy <= 1 && foundCluster < 0; dy += 1) {
        for (let dz = -1; dz <= 1 && foundCluster < 0; dz += 1) {
          const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i += 1) {
            const cIdx = bucket[i];
            const inv = 1 / counts[cIdx];
            const ox = sumX[cIdx] * inv - x;
            const oy = sumY[cIdx] * inv - y;
            const oz = sumZ[cIdx] * inv - z;
            if (ox * ox + oy * oy + oz * oz <= epsSq) { foundCluster = cIdx; break; }
          }
        }
      }
    }

    if (foundCluster >= 0) {
      remap[v] = foundCluster;
      sumX[foundCluster] += x;
      sumY[foundCluster] += y;
      sumZ[foundCluster] += z;
      counts[foundCluster] += 1;
      weldedCount += 1;
    } else {
      const cIdx = counts.length;
      remap[v] = cIdx;
      sumX.push(x);
      sumY.push(y);
      sumZ.push(z);
      counts.push(1);
      const key = `${cx},${cy},${cz}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(cIdx);
      else grid.set(key, [cIdx]);
    }
  }

  const weldedPositions: number[] = [];
  for (let i = 0; i < counts.length; i += 1) {
    const inv = 1 / counts[i];
    weldedPositions.push(sumX[i] * inv, sumY[i] * inv, sumZ[i] * inv);
  }
  const remappedIndices: number[] = [];
  for (let i = 0; i < indices.length; i += 1) remappedIndices.push(remap[indices[i]]);
  return { positions: weldedPositions, indices: remappedIndices, weldedCount };
}

function buildEdgeAdjacency(tris: readonly number[]): Map<string, EdgeIncident[]> {
  const edgeMap = new Map<string, EdgeIncident[]>();
  const triCount = Math.floor(tris.length / 3);
  for (let t = 0; t < triCount; t += 1) {
    const a = tris[t * 3];
    const b = tris[t * 3 + 1];
    const c = tris[t * 3 + 2];
    const pairs: readonly [number, number][] = [[a, b], [b, c], [c, a]];
    for (let e = 0; e < 3; e += 1) {
      const [u, v] = pairs[e];
      const key = undirectedEdgeKey(u, v);
      const list = edgeMap.get(key);
      if (list) list.push({ triIdx: t, u, v });
      else edgeMap.set(key, [{ triIdx: t, u, v }]);
    }
  }
  return edgeMap;
}

function triangleHasDirectedEdge(tris: readonly number[], t: number, u: number, v: number): boolean {
  const a = tris[t * 3];
  const b = tris[t * 3 + 1];
  const c = tris[t * 3 + 2];
  return (a === u && b === v) || (b === u && c === v) || (c === u && a === v);
}

/** 오염된 3D 메시의 정점·면·와인딩·구멍·법선을 로컬에서 자동 치유한다. */
export function healMeshTopologyAndNormals(
  rawMesh: RawTriangleMesh,
  options: MeshHealOptions = {},
): MeshHealResult {
  const startMs = nowMs();
  const weldEpsilon = options.weldEpsilon ?? 1e-4;
  const minTriangleArea = options.minTriangleArea ?? 1e-10;
  const fillBoundaryHoles = options.fillBoundaryHoles ?? true;
  const maxHoleLoopEdges = clamp(Math.round(options.maxHoleLoopEdges ?? 32), 3, 256);
  const shadingMode = options.shadingMode ?? "smooth";

  const before = inspectMeshTopologyDefects(rawMesh, { weldEpsilon, minTriangleArea });
  const welded = weldVerticesSpatialHash(rawMesh.positions, rawMesh.indices, weldEpsilon);
  const posList = welded.positions;

  // 1. 퇴화·중복 삼각형 제거
  const cleanTris: number[] = [];
  const seenTriKeys = new Set<string>();
  let removedDegenerateFaces = 0;
  let removedDuplicateFaces = 0;

  const rawTriCount = Math.floor(welded.indices.length / 3);
  for (let t = 0; t < rawTriCount; t += 1) {
    const a = welded.indices[t * 3];
    const b = welded.indices[t * 3 + 1];
    const c = welded.indices[t * 3 + 2];
    if (a === b || b === c || c === a) { removedDegenerateFaces += 1; continue; }
    const [nx, ny, nz] = triangleCross(posList, a, b, c);
    const crossLen = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(crossLen) || 0.5 * crossLen <= minTriangleArea) {
      removedDegenerateFaces += 1;
      continue;
    }
    const key = sortedTriKey(a, b, c);
    if (seenTriKeys.has(key)) { removedDuplicateFaces += 1; continue; }
    seenTriKeys.add(key);
    cleanTris.push(a, b, c);
  }

  // 2. BFS 일관 삼각형 와인딩 정렬
  const triCountBeforeHoles = Math.floor(cleanTris.length / 3);
  const adjBeforeHoles = buildEdgeAdjacency(cleanTris);
  const visited = new Uint8Array(triCountBeforeHoles);
  let flippedWindingFaces = 0;

  for (let seed = 0; seed < triCountBeforeHoles; seed += 1) {
    if (visited[seed] !== 0) continue;
    visited[seed] = 1;
    const queue: number[] = [seed];
    let qHead = 0;
    while (qHead < queue.length) {
      const cur = queue[qHead];
      qHead += 1;
      const a = cleanTris[cur * 3];
      const b = cleanTris[cur * 3 + 1];
      const c = cleanTris[cur * 3 + 2];
      const curEdges: readonly [number, number][] = [[a, b], [b, c], [c, a]];
      for (let e = 0; e < 3; e += 1) {
        const [u, v] = curEdges[e];
        const incidents = adjBeforeHoles.get(undirectedEdgeKey(u, v));
        if (!incidents || incidents.length !== 2) continue;
        const nb = incidents[0].triIdx === cur ? incidents[1].triIdx : incidents[0].triIdx;
        if (visited[nb] !== 0) continue;
        if (triangleHasDirectedEdge(cleanTris, nb, u, v)) {
          const tmp = cleanTris[nb * 3 + 1];
          cleanTris[nb * 3 + 1] = cleanTris[nb * 3 + 2];
          cleanTris[nb * 3 + 2] = tmp;
          flippedWindingFaces += 1;
        }
        visited[nb] = 1;
        queue.push(nb);
      }
    }
  }

  // 3. 단순 경계 루프 팬 홀 필링
  let filledHoleCount = 0;
  let addedCapTriangles = 0;
  if (fillBoundaryHoles && cleanTris.length > 0) {
    const edgeAdj = buildEdgeAdjacency(cleanTris);
    const capNext = new Map<number, number[]>();
    edgeAdj.forEach((list) => {
      if (list.length === 1) {
        const { u, v } = list[0];
        const targets = capNext.get(v);
        if (targets) targets.push(u);
        else capNext.set(v, [u]);
      }
    });

    const usedCapEdges = new Set<string>();
    capNext.forEach((targets, startV) => {
      for (let ti = 0; ti < targets.length; ti += 1) {
        const firstNext = targets[ti];
        const firstKey = `${startV}->${firstNext}`;
        if (usedCapEdges.has(firstKey)) continue;

        const loop: number[] = [startV];
        const loopEdgeKeys: string[] = [firstKey];
        let curr = firstNext;
        let closed = false;
        while (loop.length <= maxHoleLoopEdges) {
          if (curr === startV) { closed = true; break; }
          if (loop.includes(curr)) break;
          loop.push(curr);
          const nextCandidates = capNext.get(curr);
          if (!nextCandidates || nextCandidates.length !== 1) break;
          const nxt = nextCandidates[0];
          const eKey = `${curr}->${nxt}`;
          if (usedCapEdges.has(eKey)) break;
          loopEdgeKeys.push(eKey);
          curr = nxt;
        }
        if (!closed || loop.length < 3 || loop.length > maxHoleLoopEdges) continue;
        for (const ek of loopEdgeKeys) usedCapEdges.add(ek);

        if (loop.length === 3) {
          cleanTris.push(loop[0], loop[1], loop[2]);
          addedCapTriangles += 1;
        } else {
          let cx = 0; let cy = 0; let cz = 0;
          for (let i = 0; i < loop.length; i += 1) {
            const vi = loop[i];
            cx += posList[vi * 3];
            cy += posList[vi * 3 + 1];
            cz += posList[vi * 3 + 2];
          }
          const invK = 1 / loop.length;
          const centerIdx = Math.floor(posList.length / 3);
          posList.push(cx * invK, cy * invK, cz * invK);
          for (let i = 0; i < loop.length; i += 1) {
            cleanTris.push(centerIdx, loop[i], loop[(i + 1) % loop.length]);
            addedCapTriangles += 1;
          }
        }
        filledHoleCount += 1;
      }
    });
  }

  // 4. 부호화 부피 기반 외향 방향 보정
  const finalTriCount = Math.floor(cleanTris.length / 3);
  const compAdj = buildEdgeAdjacency(cleanTris);
  const compVisited = new Uint8Array(finalTriCount);
  let flippedOutwardComponents = 0;

  for (let seed = 0; seed < finalTriCount; seed += 1) {
    if (compVisited[seed] !== 0) continue;
    compVisited[seed] = 1;
    const compTris: number[] = [seed];
    let qHead = 0;
    let compBoundaryEdges = 0;

    while (qHead < compTris.length) {
      const cur = compTris[qHead];
      qHead += 1;
      const a = cleanTris[cur * 3];
      const b = cleanTris[cur * 3 + 1];
      const c = cleanTris[cur * 3 + 2];
      const edges: readonly [number, number][] = [[a, b], [b, c], [c, a]];
      for (let e = 0; e < 3; e += 1) {
        const list = compAdj.get(undirectedEdgeKey(edges[e][0], edges[e][1]));
        if (!list) continue;
        if (list.length === 1) compBoundaryEdges += 1;
        for (let k = 0; k < list.length; k += 1) {
          const nb = list[k].triIdx;
          if (compVisited[nb] === 0) { compVisited[nb] = 1; compTris.push(nb); }
        }
      }
    }

    if (compBoundaryEdges === 0) {
      let vol6 = 0;
      for (let i = 0; i < compTris.length; i += 1) {
        const t = compTris[i];
        vol6 += signedTetVolume6(posList, cleanTris[t * 3], cleanTris[t * 3 + 1], cleanTris[t * 3 + 2]);
      }
      if (vol6 < 0) {
        for (let i = 0; i < compTris.length; i += 1) {
          const t = compTris[i];
          const tmp = cleanTris[t * 3 + 1];
          cleanTris[t * 3 + 1] = cleanTris[t * 3 + 2];
          cleanTris[t * 3 + 2] = tmp;
        }
        flippedOutwardComponents += 1;
      }
    }
  }

  // 5. 단위 법선 재계산 (스무스 면적 가중 또는 하드 플랫)
  let outPositions: Float32Array;
  let outIndices: Uint32Array;
  let outNormals: Float32Array;

  if (shadingMode === "hard") {
    outPositions = new Float32Array(finalTriCount * 9);
    outIndices = new Uint32Array(finalTriCount * 3);
    outNormals = new Float32Array(finalTriCount * 9);
    for (let t = 0; t < finalTriCount; t += 1) {
      const a = cleanTris[t * 3];
      const b = cleanTris[t * 3 + 1];
      const c = cleanTris[t * 3 + 2];
      const [nx, ny, nz] = triangleCross(posList, a, b, c);
      const len = Math.hypot(nx, ny, nz) || 1;
      const verts: readonly number[] = [a, b, c];
      for (let k = 0; k < 3; k += 1) {
        const dstV = t * 3 + k;
        const srcV = verts[k];
        outPositions[dstV * 3] = posList[srcV * 3];
        outPositions[dstV * 3 + 1] = posList[srcV * 3 + 1];
        outPositions[dstV * 3 + 2] = posList[srcV * 3 + 2];
        outNormals[dstV * 3] = nx / len;
        outNormals[dstV * 3 + 1] = ny / len;
        outNormals[dstV * 3 + 2] = nz / len;
        outIndices[dstV] = dstV;
      }
    }
  } else {
    const usedVertMap = new Map<number, number>();
    const compactPos: number[] = [];
    const compactIdx: number[] = [];
    for (let i = 0; i < cleanTris.length; i += 1) {
      const oldV = cleanTris[i];
      let newV = usedVertMap.get(oldV);
      if (newV === undefined) {
        newV = Math.floor(compactPos.length / 3);
        usedVertMap.set(oldV, newV);
        compactPos.push(posList[oldV * 3], posList[oldV * 3 + 1], posList[oldV * 3 + 2]);
      }
      compactIdx.push(newV);
    }
    outPositions = new Float32Array(compactPos);
    outIndices = new Uint32Array(compactIdx);
    outNormals = new Float32Array(outPositions.length);

    for (let t = 0; t < finalTriCount; t += 1) {
      const a = outIndices[t * 3];
      const b = outIndices[t * 3 + 1];
      const c = outIndices[t * 3 + 2];
      const [nx, ny, nz] = triangleCross(outPositions, a, b, c);
      const verts: readonly number[] = [a, b, c];
      for (let k = 0; k < 3; k += 1) {
        const vi = verts[k];
        outNormals[vi * 3] += nx;
        outNormals[vi * 3 + 1] += ny;
        outNormals[vi * 3 + 2] += nz;
      }
    }

    const compactVertCount = Math.floor(outPositions.length / 3);
    for (let v = 0; v < compactVertCount; v += 1) {
      const x = outNormals[v * 3];
      const y = outNormals[v * 3 + 1];
      const z = outNormals[v * 3 + 2];
      const len = Math.hypot(x, y, z);
      outNormals[v * 3] = len > 1e-12 ? x / len : 0;
      outNormals[v * 3 + 1] = len > 1e-12 ? y / len : 1;
      outNormals[v * 3 + 2] = len > 1e-12 ? z / len : 0;
    }
  }

  const mesh: HealedTriangleMesh = { positions: outPositions, indices: outIndices, normals: outNormals };
  return {
    mesh,
    before,
    after: inspectMeshTopologyDefects(mesh, { weldEpsilon, minTriangleArea }),
    summary: {
      weldedVertexCount: welded.weldedCount,
      removedDegenerateFaces,
      removedDuplicateFaces,
      flippedWindingFaces,
      filledHoleCount,
      addedCapTriangles,
      flippedOutwardComponents,
      durationMs: nowMs() - startMs,
    },
  };
}
