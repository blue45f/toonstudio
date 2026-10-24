/**
 * Studio 3D 지오데식 데칼 투영(ExpMap)·2-본 해석적 IK/스켈레톤 드래프트·투명 턴테이블/멀티뷰 엔진 — VARCO 3D 심층 역공학 모듈 (3단계).
 */

import type { StudioMannequinVec3 } from "./studio-varco3d-preview-inspector";

/** 데칼 투영 시 법선 내적 기반 감쇠 상수 (`FALLOFF_FULL_DOT = 0.05`, `FALLOFF_ZERO_DOT = -0.35`). */
export const STUDIO_VARCO3D_DECAL_FALLOFF_CONSTANTS = Object.freeze({
  fullDot: 0.05,
  zeroDot: -0.35,
  expMapRadiusPadding: 1.6,
  expMapCandidateRadiusScale: 1.5,
  geodesicRelaxationWeight: 0.7,
  geodesicRelaxationPasses: 2,
  foldedTriangleAreaRejectRatio: -0.25,
});

/** 2-본 해석적 IK 솔버 및 컨트롤 기즈모 비례 상수 (`RigIkController`). */
export const STUDIO_VARCO3D_IK_CONTROLLER_METRICS = Object.freeze({
  extensionGuard: 0.001,
  poleOffsetRatio: 0.72,
  minPoleArmRadiusRatio: 0.08,
  minPoleArmFloor: 0.05,
  controlScaleRatio: 0.06,
  controlScaleMin: 0.009,
  poleVisualScaleRatio: 0.68,
  targetRingRadius: 1.38,
  targetRingTube: 0.1,
  targetRenderOrder: 1042,
  guideRenderOrder: 1041,
  colors: Object.freeze({ targetHex: "#55c9ff", poleHex: "#ffad22", selectedHex: "#ffffff", guideHex: "#9ad7ff" }),
});

/** 투명 턴테이블 뷰어(`TransparentSceneManager`) 및 멀티뷰 렌더러(`MultiViewRenderer`) 상수. */
export const STUDIO_VARCO3D_TURNTABLE_MULTIVIEW_METRICS = Object.freeze({
  transparentCameraFovDeg: 50,
  transparentCameraHeightRatio: 0.2,
  fitMargin: 1.05,
  autoRotateSpeed: 1.5,
  dampingFactor: 0.05,
  lazyReleaseThresholdMs: 30000,
  lazyReleaseCheckIntervalMs: 5000,
  scanBandPeriodMs: 2500,
  scanBandWidth: 0.12,
  scanBandBaseGlow: 0.06,
  scanBandNormalSwell: 0.002,
  meshFadeInDurationMs: 700,
});

const cleanZero = (n: number): number => (Object.is(n, -0) ? 0 : n);
const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
const vec3Sub = (a: StudioMannequinVec3, b: StudioMannequinVec3): StudioMannequinVec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vec3AddScaled = (a: StudioMannequinVec3, b: StudioMannequinVec3, s: number): StudioMannequinVec3 => ({
  x: cleanZero(a.x + b.x * s),
  y: cleanZero(a.y + b.y * s),
  z: cleanZero(a.z + b.z * s),
});
const vec3Dot = (a: StudioMannequinVec3, b: StudioMannequinVec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const vec3Cross = (a: StudioMannequinVec3, b: StudioMannequinVec3): StudioMannequinVec3 => ({
  x: cleanZero(a.y * b.z - a.z * b.y),
  y: cleanZero(a.z * b.x - a.x * b.z),
  z: cleanZero(a.x * b.y - a.y * b.x),
});
const vec3Length = (v: StudioMannequinVec3): number => Math.hypot(v.x, v.y, v.z);
function vec3Normalize(v: StudioMannequinVec3): StudioMannequinVec3 {
  const len = vec3Length(v);
  return len < 1e-8 ? { x: 0, y: 0, z: 0 } : { x: cleanZero(v.x / len), y: cleanZero(v.y / len), z: cleanZero(v.z / len) };
}

/** 단위 벡터 `from`을 단위 벡터 `to`로 회전시키는 최소 호 회전을 벡터 `vec`에 적용합니다. */
export function rotateVectorByShortestArc(fromUnit: StudioMannequinVec3, toUnit: StudioMannequinVec3, vec: StudioMannequinVec3): StudioMannequinVec3 {
  const r = vec3Dot(fromUnit, toUnit) + 1;
  let qx = 0;
  let qy: number;
  let qz = 0;
  let qw = 0;
  if (r < 1e-6) {
    if (Math.abs(fromUnit.x) > Math.abs(fromUnit.z)) {
      qx = -fromUnit.y;
      qy = fromUnit.x;
    } else {
      qy = -fromUnit.z;
      qz = fromUnit.y;
    }
  } else {
    const cross = vec3Cross(fromUnit, toUnit);
    qx = cross.x;
    qy = cross.y;
    qz = cross.z;
    qw = r;
  }
  const qLen = Math.hypot(qx, qy, qz, qw);
  if (qLen < 1e-12) return vec;
  qx /= qLen;
  qy /= qLen;
  qz /= qLen;
  qw /= qLen;
  const uvx = qy * vec.z - qz * vec.y;
  const uvy = qz * vec.x - qx * vec.z;
  const uvz = qx * vec.y - qy * vec.x;
  return {
    x: cleanZero(vec.x + 2 * (qw * uvx + (qy * uvz - qz * uvy))),
    y: cleanZero(vec.y + 2 * (qw * uvy + (qz * uvx - qx * uvz))),
    z: cleanZero(vec.z + 2 * (qw * uvz + (qx * uvy - qy * uvx))),
  };
}

/** `NodeMinHeap`: VARCO 3D 지오데식 다익스트라 전파용 이진 최소 힙. */
export class StudioVarco3dNodeMinHeap {
  private readonly nodes: number[] = [];
  private readonly dists: number[] = [];
  get size(): number {
    return this.nodes.length;
  }
  push(node: number, dist: number): void {
    this.nodes.push(node);
    this.dists.push(dist);
    let idx = this.nodes.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if ((this.dists[parent] ?? 0) <= (this.dists[idx] ?? 0)) break;
      this.swap(idx, parent);
      idx = parent;
    }
  }
  pop(): { readonly node: number; readonly dist: number } | null {
    const len = this.nodes.length;
    if (len === 0) return null;
    const result = { node: this.nodes[0] ?? 0, dist: this.dists[0] ?? 0 };
    const lastNode = this.nodes[len - 1] ?? 0;
    const lastDist = this.dists[len - 1] ?? 0;
    this.nodes.pop();
    this.dists.pop();
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.dists[0] = lastDist;
      let idx = 0;
      for (;;) {
        const left = idx * 2 + 1;
        const right = left + 1;
        let smallest = idx;
        if (left < this.nodes.length && (this.dists[left] ?? 0) < (this.dists[smallest] ?? 0)) smallest = left;
        if (right < this.nodes.length && (this.dists[right] ?? 0) < (this.dists[smallest] ?? 0)) smallest = right;
        if (smallest === idx) break;
        this.swap(idx, smallest);
        idx = smallest;
      }
    }
    return result;
  }
  private swap(i: number, j: number): void {
    const tmpNode = this.nodes[i] ?? 0;
    this.nodes[i] = this.nodes[j] ?? 0;
    this.nodes[j] = tmpNode;
    const tmpDist = this.dists[i] ?? 0;
    this.dists[i] = this.dists[j] ?? 0;
    this.dists[j] = tmpDist;
  }
}

/** `falloffAlphaFromDot`: 정점 법선과 데칼 투영 방향 내적의 `[-0.35, 0.05]` Hermite smoothstep 알파(`0 ~ 1`). */
export function evaluateVarco3dDecalNormalFalloff(dot: number): number {
  const { fullDot, zeroDot } = STUDIO_VARCO3D_DECAL_FALLOFF_CONSTANTS;
  const t = clamp((dot - zeroDot) / (fullDot - zeroDot), 0, 1);
  return cleanZero(t * t * (3 - 2 * t));
}

export interface StudioVarco3dExpMapClipVertex {
  readonly position: StudioMannequinVec3;
  readonly normal: StudioMannequinVec3;
  readonly targetUv: { readonly u: number; readonly v: number };
  readonly decalUv: { readonly u: number; readonly v: number };
}

function lerpExpMapClipVertex(a: StudioVarco3dExpMapClipVertex, b: StudioVarco3dExpMapClipVertex, t: number): StudioVarco3dExpMapClipVertex {
  return {
    position: {
      x: a.position.x + (b.position.x - a.position.x) * t,
      y: a.position.y + (b.position.y - a.position.y) * t,
      z: a.position.z + (b.position.z - a.position.z) * t,
    },
    normal: vec3Normalize({
      x: a.normal.x + (b.normal.x - a.normal.x) * t,
      y: a.normal.y + (b.normal.y - a.normal.y) * t,
      z: a.normal.z + (b.normal.z - a.normal.z) * t,
    }),
    targetUv: { u: a.targetUv.u + (b.targetUv.u - a.targetUv.u) * t, v: a.targetUv.v + (b.targetUv.v - a.targetUv.v) * t },
    decalUv: { u: a.decalUv.u + (b.decalUv.u - a.decalUv.u) * t, v: a.decalUv.v + (b.decalUv.v - a.decalUv.v) * t },
  };
}

/** `clipPolygonByUvHalfPlane`: Sutherland-Hodgman 반평면 폴리곤 클리핑. */
export function clipVarco3dPolygonByUvHalfPlane(
  polygon: readonly StudioVarco3dExpMapClipVertex[],
  signedDist: (vertex: StudioVarco3dExpMapClipVertex) => number,
): readonly StudioVarco3dExpMapClipVertex[] {
  if (polygon.length < 3) return [];
  const output: StudioVarco3dExpMapClipVertex[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const curr = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;
    const dCurr = signedDist(curr);
    const dNext = signedDist(next);
    if (dCurr >= 0) output.push(curr);
    if (dCurr >= 0 !== dNext >= 0) output.push(lerpExpMapClipVertex(curr, next, dCurr / (dCurr - dNext)));
  }
  return output.length < 3 ? [] : output;
}

export interface StudioVarco3dExpMapGraph {
  readonly nodeCount: number;
  readonly triangleCount: number;
  readonly nodeLocalPositions: Float32Array;
  readonly nodeLocalNormals: Float32Array;
  readonly triangleNodes: Uint32Array;
  readonly cornerLocalNormals: Float32Array;
  readonly cornerTargetUvs: Float32Array;
  readonly neighborOffsets: Uint32Array;
  readonly neighborNodes: Uint32Array;
}

/** `buildExpMapGraph`: `1e-5` 정밀도 용접 정점 그래프 및 CSR 인접 리스트 구축. */
export function buildVarco3dExpMapGraph(params: {
  readonly positions: ArrayLike<number>;
  readonly normals: ArrayLike<number>;
  readonly uvs: ArrayLike<number>;
  readonly indices?: ArrayLike<number> | null;
}): StudioVarco3dExpMapGraph | null {
  const { positions, normals, uvs, indices } = params;
  const vertexCount = Math.floor(positions.length / 3);
  if (vertexCount < 3 || normals.length < vertexCount * 3 || uvs.length < vertexCount * 2) return null;
  const indexCount = indices ? indices.length : vertexCount;
  if (indexCount < 3) return null;

  const keyToNode = new Map<string, number>();
  const nodePositions: number[] = [];
  const nodeNormals: number[] = [];
  const triangleNodes: number[] = [];
  const cornerNormals: number[] = [];
  const cornerUvs: number[] = [];

  const pushCorner = (vi: number): void => {
    const px = positions[vi * 3] ?? 0;
    const py = positions[vi * 3 + 1] ?? 0;
    const pz = positions[vi * 3 + 2] ?? 0;
    const nx = normals[vi * 3] ?? 0;
    const ny = normals[vi * 3 + 1] ?? 0;
    const nz = normals[vi * 3 + 2] ?? 0;
    const key = `${px.toFixed(5)},${py.toFixed(5)},${pz.toFixed(5)}`;
    let nodeIdx = keyToNode.get(key);
    if (nodeIdx === undefined) {
      nodeIdx = nodePositions.length / 3;
      keyToNode.set(key, nodeIdx);
      nodePositions.push(px, py, pz);
      nodeNormals.push(nx, ny, nz);
    } else {
      nodeNormals[nodeIdx * 3] = (nodeNormals[nodeIdx * 3] ?? 0) + nx;
      nodeNormals[nodeIdx * 3 + 1] = (nodeNormals[nodeIdx * 3 + 1] ?? 0) + ny;
      nodeNormals[nodeIdx * 3 + 2] = (nodeNormals[nodeIdx * 3 + 2] ?? 0) + nz;
    }
    triangleNodes.push(nodeIdx);
    cornerNormals.push(nx, ny, nz);
    cornerUvs.push(uvs[vi * 2] ?? 0, uvs[vi * 2 + 1] ?? 0);
  };

  for (let i = 0; i + 2 < indexCount; i += 3) {
    pushCorner(indices ? (indices[i] ?? 0) : i);
    pushCorner(indices ? (indices[i + 1] ?? 0) : i + 1);
    pushCorner(indices ? (indices[i + 2] ?? 0) : i + 2);
  }

  const triangleCount = triangleNodes.length / 3;
  if (triangleCount === 0) return null;
  const nodeCount = nodePositions.length / 3;
  for (let i = 0; i < nodeCount; i += 1) {
    const nx = nodeNormals[i * 3] ?? 0;
    const ny = nodeNormals[i * 3 + 1] ?? 0;
    const nz = nodeNormals[i * 3 + 2] ?? 0;
    const len = Math.hypot(nx, ny, nz);
    const inv = len < 1e-4 ? 0 : 1 / len;
    nodeNormals[i * 3] = nx * inv;
    nodeNormals[i * 3 + 1] = ny * inv;
    nodeNormals[i * 3 + 2] = nz * inv;
  }

  const edgeSet = new Set<string>();
  const edgePairs: number[] = [];
  const degree = new Uint32Array(nodeCount);
  const addEdge = (a: number, b: number): void => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edgePairs.push(a, b);
      degree[a] = (degree[a] ?? 0) + 1;
      degree[b] = (degree[b] ?? 0) + 1;
    }
  };

  for (let t = 0; t < triangleCount; t += 1) {
    const n0 = triangleNodes[t * 3] ?? 0;
    const n1 = triangleNodes[t * 3 + 1] ?? 0;
    const n2 = triangleNodes[t * 3 + 2] ?? 0;
    addEdge(n0, n1);
    addEdge(n1, n2);
    addEdge(n2, n0);
  }

  const neighborOffsets = new Uint32Array(nodeCount + 1);
  for (let i = 0; i < nodeCount; i += 1) neighborOffsets[i + 1] = (neighborOffsets[i] ?? 0) + (degree[i] ?? 0);
  const neighborNodes = new Uint32Array(edgePairs.length);
  const cursor = neighborOffsets.slice(0, nodeCount);
  for (let i = 0; i < edgePairs.length; i += 2) {
    const a = edgePairs[i] ?? 0;
    const b = edgePairs[i + 1] ?? 0;
    const ca = cursor[a] ?? 0;
    neighborNodes[ca] = b;
    cursor[a] = ca + 1;
    const cb = cursor[b] ?? 0;
    neighborNodes[cb] = a;
    cursor[b] = cb + 1;
  }

  return Object.freeze({
    nodeCount,
    triangleCount,
    nodeLocalPositions: new Float32Array(nodePositions),
    nodeLocalNormals: new Float32Array(nodeNormals),
    triangleNodes: new Uint32Array(triangleNodes),
    cornerLocalNormals: new Float32Array(cornerNormals),
    cornerTargetUvs: new Float32Array(cornerUvs),
    neighborOffsets,
    neighborNodes,
  });
}

export interface StudioVarco3dExpMapDecalProjectionResult {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly decalUvs: Float32Array;
  readonly targetUvs: Float32Array;
  readonly falloffAlphas: Float32Array;
  readonly clippedVertexCount: number;
}

/** `tryCreateExpMapDecalGeometry`: 지오데식(ExpMap) 다익스트라 전파 및 반평면 클리핑 데칼 투영. */
export function projectVarco3dExpMapDecalTriangles(params: {
  readonly graph: StudioVarco3dExpMapGraph;
  readonly hitTriangleIndex: number;
  readonly hitPoint: StudioMannequinVec3;
  readonly projectorNormal: StudioMannequinVec3;
  readonly projectorTangent: StudioMannequinVec3;
  readonly decalSize: { readonly width: number; readonly height: number };
}): StudioVarco3dExpMapDecalProjectionResult | null {
  const { graph, hitTriangleIndex, hitPoint, decalSize } = params;
  if (hitTriangleIndex < 0 || hitTriangleIndex >= graph.triangleCount || decalSize.width <= 0 || decalSize.height <= 0) return null;

  const projNormal = vec3Normalize(params.projectorNormal);
  const maxRadius = Math.hypot(decalSize.width, decalSize.height) * 0.5 * STUDIO_VARCO3D_DECAL_FALLOFF_CONSTANTS.expMapRadiusPadding;

  const getNodePos = (nodeIdx: number): StudioMannequinVec3 => ({
    x: graph.nodeLocalPositions[nodeIdx * 3] ?? 0,
    y: graph.nodeLocalPositions[nodeIdx * 3 + 1] ?? 0,
    z: graph.nodeLocalPositions[nodeIdx * 3 + 2] ?? 0,
  });
  const getNodeNormal = (nodeIdx: number): StudioMannequinVec3 => {
    const n = {
      x: graph.nodeLocalNormals[nodeIdx * 3] ?? 0,
      y: graph.nodeLocalNormals[nodeIdx * 3 + 1] ?? 0,
      z: graph.nodeLocalNormals[nodeIdx * 3 + 2] ?? 0,
    };
    return vec3Length(n) < 1e-4 ? projNormal : vec3Normalize(n);
  };

  const seed0 = graph.triangleNodes[hitTriangleIndex * 3] ?? 0;
  const seed1 = graph.triangleNodes[hitTriangleIndex * 3 + 1] ?? 0;
  const seed2 = graph.triangleNodes[hitTriangleIndex * 3 + 2] ?? 0;
  let triNormal = vec3Cross(vec3Sub(getNodePos(seed1), getNodePos(seed0)), vec3Sub(getNodePos(seed2), getNodePos(seed0)));
  if (vec3Length(triNormal) < 1e-6) return null;
  triNormal = vec3Normalize(triNormal);
  if (vec3Dot(triNormal, projNormal) < 0) triNormal = { x: -triNormal.x, y: -triNormal.y, z: -triNormal.z };

  let tangentU = rotateVectorByShortestArc(projNormal, triNormal, vec3Normalize(params.projectorTangent));
  tangentU = vec3AddScaled(tangentU, triNormal, -vec3Dot(tangentU, triNormal));
  if (vec3Length(tangentU) < 1e-4) return null;
  tangentU = vec3Normalize(tangentU);
  const tangentV = vec3Cross(triNormal, tangentU);

  const nodeCount = graph.nodeCount;
  const dists = new Float64Array(nodeCount).fill(Infinity);
  const coordU = new Float64Array(nodeCount);
  const coordV = new Float64Array(nodeCount);
  const frameU = new Float32Array(nodeCount * 3);
  const frameV = new Float32Array(nodeCount * 3);

  const assignNodeFrame = (nodeIdx: number, refNormal: StudioMannequinVec3, refTangentU: StudioMannequinVec3): void => {
    const n = getNodeNormal(nodeIdx);
    let u = rotateVectorByShortestArc(refNormal, n, refTangentU);
    u = vec3AddScaled(u, n, -vec3Dot(u, n));
    if (vec3Length(u) < 1e-4) {
      u = vec3AddScaled({ x: 1, y: 0, z: 0 }, n, -n.x);
      if (vec3Length(u) < 1e-4) u = vec3AddScaled({ x: 0, y: 1, z: 0 }, n, -n.y);
    }
    u = vec3Normalize(u);
    const v = vec3Cross(n, u);
    frameU[nodeIdx * 3] = u.x;
    frameU[nodeIdx * 3 + 1] = u.y;
    frameU[nodeIdx * 3 + 2] = u.z;
    frameV[nodeIdx * 3] = v.x;
    frameV[nodeIdx * 3 + 1] = v.y;
    frameV[nodeIdx * 3 + 2] = v.z;
  };

  const heap = new StudioVarco3dNodeMinHeap();
  const seeds = [seed0, seed1, seed2];
  for (const s of seeds) {
    const delta = vec3Sub(getNodePos(s), hitPoint);
    const d = vec3Length(delta);
    if (d < (dists[s] ?? Infinity)) {
      dists[s] = d;
      coordU[s] = vec3Dot(delta, tangentU);
      coordV[s] = vec3Dot(delta, tangentV);
      assignNodeFrame(s, triNormal, tangentU);
      heap.push(s, d);
    }
  }

  for (;;) {
    const popped = heap.pop();
    if (!popped) break;
    const { node: curr, dist: currDist } = popped;
    if (currDist > (dists[curr] ?? Infinity)) continue;
    const currPos = getNodePos(curr);
    const currNormal = getNodeNormal(curr);
    const currU: StudioMannequinVec3 = { x: frameU[curr * 3] ?? 0, y: frameU[curr * 3 + 1] ?? 0, z: frameU[curr * 3 + 2] ?? 0 };
    const currV: StudioMannequinVec3 = { x: frameV[curr * 3] ?? 0, y: frameV[curr * 3 + 1] ?? 0, z: frameV[curr * 3 + 2] ?? 0 };

    const start = graph.neighborOffsets[curr] ?? 0;
    const end = graph.neighborOffsets[curr + 1] ?? 0;
    for (let e = start; e < end; e += 1) {
      const nb = graph.neighborNodes[e] ?? 0;
      const edgeVec = vec3Sub(getNodePos(nb), currPos);
      const edgeLen = vec3Length(edgeVec);
      const nextDist = currDist + edgeLen;
      if (nextDist > maxRadius || nextDist >= (dists[nb] ?? Infinity)) continue;
      let du = vec3Dot(edgeVec, currU);
      let dv = vec3Dot(edgeVec, currV);
      const projLen = Math.hypot(du, dv);
      if (projLen > edgeLen * 1e-6) {
        const scale = edgeLen / projLen;
        du *= scale;
        dv *= scale;
      } else {
        const radial = Math.hypot(coordU[curr] ?? 0, coordV[curr] ?? 0);
        du = radial > 1e-12 ? ((coordU[curr] ?? 0) / radial) * edgeLen : edgeLen;
        dv = radial > 1e-12 ? ((coordV[curr] ?? 0) / radial) * edgeLen : 0;
      }
      dists[nb] = nextDist;
      coordU[nb] = (coordU[curr] ?? 0) + du;
      coordV[nb] = (coordV[curr] ?? 0) + dv;
      assignNodeFrame(nb, currNormal, currU);
      heap.push(nb, nextDist);
    }
  }

  const reachedNodes: number[] = [];
  for (let i = 0; i < nodeCount; i += 1) {
    if (Number.isFinite(dists[i])) reachedNodes.push(i);
  }
  reachedNodes.sort((a, b) => (dists[a] ?? 0) - (dists[b] ?? 0));

  const seedSet = new Set(seeds);
  const relaxWeight = STUDIO_VARCO3D_DECAL_FALLOFF_CONSTANTS.geodesicRelaxationWeight;
  for (let pass = 0; pass < STUDIO_VARCO3D_DECAL_FALLOFF_CONSTANTS.geodesicRelaxationPasses; pass += 1) {
    for (const nodeIdx of reachedNodes) {
      if (seedSet.has(nodeIdx)) continue;
      const pos = getNodePos(nodeIdx);
      const start = graph.neighborOffsets[nodeIdx] ?? 0;
      const end = graph.neighborOffsets[nodeIdx + 1] ?? 0;
      let sumU = 0;
      let sumV = 0;
      let sumWeight = 0;
      for (let e = start; e < end; e += 1) {
        const nb = graph.neighborNodes[e] ?? 0;
        if (!((dists[nb] ?? Infinity) < (dists[nodeIdx] ?? Infinity))) continue;
        const edgeVec = vec3Sub(pos, getNodePos(nb));
        const edgeLen = vec3Length(edgeVec);
        if (edgeLen < 1e-12) continue;
        const nbU: StudioMannequinVec3 = { x: frameU[nb * 3] ?? 0, y: frameU[nb * 3 + 1] ?? 0, z: frameU[nb * 3 + 2] ?? 0 };
        const nbV: StudioMannequinVec3 = { x: frameV[nb * 3] ?? 0, y: frameV[nb * 3 + 1] ?? 0, z: frameV[nb * 3 + 2] ?? 0 };
        let du = vec3Dot(edgeVec, nbU);
        let dv = vec3Dot(edgeVec, nbV);
        const projLen = Math.hypot(du, dv);
        if (projLen > edgeLen * 1e-6) {
          const scale = edgeLen / projLen;
          du *= scale;
          dv *= scale;
        }
        const invLen = 1 / edgeLen;
        sumU += ((coordU[nb] ?? 0) + du) * invLen;
        sumV += ((coordV[nb] ?? 0) + dv) * invLen;
        sumWeight += invLen;
      }
      if (sumWeight > 0) {
        coordU[nodeIdx] = (coordU[nodeIdx] ?? 0) * (1 - relaxWeight) + (sumU / sumWeight) * relaxWeight;
        coordV[nodeIdx] = (coordV[nodeIdx] ?? 0) * (1 - relaxWeight) + (sumV / sumWeight) * relaxWeight;
      }
    }
  }

  const halfW = decalSize.width / 2;
  const halfH = decalSize.height / 2;
  const outPos: number[] = [];
  const outNorm: number[] = [];
  const outDecalUv: number[] = [];
  const outTargetUv: number[] = [];
  const outFalloff: number[] = [];

  const emitVertex = (v: StudioVarco3dExpMapClipVertex): void => {
    outPos.push(v.position.x, v.position.y, v.position.z);
    outNorm.push(v.normal.x, v.normal.y, v.normal.z);
    outDecalUv.push(v.decalUv.u / decalSize.width + 0.5, v.decalUv.v / decalSize.height + 0.5);
    outTargetUv.push(v.targetUv.u, v.targetUv.v);
    outFalloff.push(1);
  };

  for (let t = 0; t < graph.triangleCount; t += 1) {
    const n0 = graph.triangleNodes[t * 3] ?? 0;
    const n1 = graph.triangleNodes[t * 3 + 1] ?? 0;
    const n2 = graph.triangleNodes[t * 3 + 2] ?? 0;
    if (!Number.isFinite(dists[n0]) || !Number.isFinite(dists[n1]) || !Number.isFinite(dists[n2])) continue;
    const u0 = coordU[n0] ?? 0;
    const v0 = coordV[n0] ?? 0;
    const u1 = coordU[n1] ?? 0;
    const v1 = coordV[n1] ?? 0;
    const u2 = coordU[n2] ?? 0;
    const v2 = coordV[n2] ?? 0;
    const uvSignedArea2 = (u1 - u0) * (v2 - v0) - (v1 - v0) * (u2 - u0);
    const tp0 = getNodePos(n0);
    const worldArea2 = vec3Length(vec3Cross(vec3Sub(getNodePos(n1), tp0), vec3Sub(getNodePos(n2), tp0)));
    if (uvSignedArea2 < STUDIO_VARCO3D_DECAL_FALLOFF_CONSTANTS.foldedTriangleAreaRejectRatio * worldArea2) continue;

    let poly: readonly StudioVarco3dExpMapClipVertex[] = [n0, n1, n2].map((nodeIdx, cornerOffset) => ({
      position: getNodePos(nodeIdx),
      normal: vec3Normalize({
        x: graph.cornerLocalNormals[t * 9 + cornerOffset * 3] ?? 0,
        y: graph.cornerLocalNormals[t * 9 + cornerOffset * 3 + 1] ?? 0,
        z: graph.cornerLocalNormals[t * 9 + cornerOffset * 3 + 2] ?? 0,
      }),
      targetUv: { u: graph.cornerTargetUvs[t * 6 + cornerOffset * 2] ?? 0, v: graph.cornerTargetUvs[t * 6 + cornerOffset * 2 + 1] ?? 0 },
      decalUv: { u: coordU[nodeIdx] ?? 0, v: coordV[nodeIdx] ?? 0 },
    }));

    poly = clipVarco3dPolygonByUvHalfPlane(poly, (v) => halfW - v.decalUv.u);
    poly = clipVarco3dPolygonByUvHalfPlane(poly, (v) => v.decalUv.u + halfW);
    poly = clipVarco3dPolygonByUvHalfPlane(poly, (v) => halfH - v.decalUv.v);
    poly = clipVarco3dPolygonByUvHalfPlane(poly, (v) => v.decalUv.v + halfH);

    for (let k = 1; k + 1 < poly.length; k += 1) {
      emitVertex(poly[0]!);
      emitVertex(poly[k]!);
      emitVertex(poly[k + 1]!);
    }
  }

  if (outPos.length === 0) return null;
  return Object.freeze({
    positions: new Float32Array(outPos),
    normals: new Float32Array(outNorm),
    decalUvs: new Float32Array(outDecalUv),
    targetUvs: new Float32Array(outTargetUv),
    falloffAlphas: new Float32Array(outFalloff),
    clippedVertexCount: outPos.length / 3,
  });
}

export interface StudioVarco3dTwoBoneIkInput {
  readonly rootPos: StudioMannequinVec3;
  readonly midPos: StudioMannequinVec3;
  readonly endPos: StudioMannequinVec3;
  readonly targetPos: StudioMannequinVec3;
  readonly polePos?: StudioMannequinVec3 | null;
  readonly upperLength?: number;
  readonly lowerLength?: number;
  readonly lastBendDirection?: StudioMannequinVec3 | null;
  readonly extensionGuard?: number;
}

export interface StudioVarco3dTwoBoneIkResult {
  readonly reachState: "reachable" | "clamped-far" | "clamped-near";
  readonly requestedDistance: number;
  readonly solvedDistance: number;
  readonly minReach: number;
  readonly maxReach: number;
  readonly desiredMidPosition: StudioMannequinVec3;
  readonly desiredEndPosition: StudioMannequinVec3;
  readonly bendDirection: StudioMannequinVec3;
  readonly defaultPolePosition: StudioMannequinVec3;
  readonly controlScale: number;
}

/** `projectedRestBend`: 루트→엔드 축에 수직인 관절 굽힘 평면 법선 성분을 추출합니다. */
export function evaluateVarco3dProjectedRestBend(
  rootPos: StudioMannequinVec3,
  midPos: StudioMannequinVec3,
  endPos: StudioMannequinVec3,
  fallbackDir: StudioMannequinVec3 = { x: 0, y: 0, z: 1 },
): StudioMannequinVec3 {
  const dir = vec3Sub(endPos, rootPos);
  if (vec3Length(dir) < 1e-6) return vec3Normalize(fallbackDir);
  const dirUnit = vec3Normalize(dir);
  let bend = vec3Sub(midPos, rootPos);
  bend = vec3AddScaled(bend, dirUnit, -vec3Dot(bend, dirUnit));
  if (vec3Length(bend) < 1e-6) {
    let ortho = vec3AddScaled(fallbackDir, dirUnit, -vec3Dot(fallbackDir, dirUnit));
    if (vec3Length(ortho) < 1e-6) {
      ortho = Math.abs(dirUnit.x) < 0.9 ? vec3Cross(dirUnit, { x: 1, y: 0, z: 0 }) : vec3Cross(dirUnit, { x: 0, y: 1, z: 0 });
    }
    return vec3Normalize(ortho);
  }
  return vec3Normalize(bend);
}

/** `solveTwoBoneIK` & `RigIkController`: 코사인 제2법칙 기반 2-본 해석적 IK 솔버. */
export function solveVarco3dTwoBoneIk(input: StudioVarco3dTwoBoneIkInput): StudioVarco3dTwoBoneIkResult {
  const upper = input.upperLength ?? Math.max(vec3Length(vec3Sub(input.midPos, input.rootPos)), 1e-6);
  const lower = input.lowerLength ?? Math.max(vec3Length(vec3Sub(input.endPos, input.midPos)), 1e-6);
  const guard = Math.max((upper + lower) * (input.extensionGuard ?? STUDIO_VARCO3D_IK_CONTROLLER_METRICS.extensionGuard), 1e-5);
  const minReach = Math.max(Math.abs(upper - lower) + guard, guard);
  const maxReach = Math.max(upper + lower - guard, minReach);

  const toTarget = vec3Sub(input.targetPos, input.rootPos);
  const requestedDistance = vec3Length(toTarget);
  const dirUnit = requestedDistance > 1e-6 ? vec3Normalize(toTarget) : vec3Normalize(vec3Sub(input.endPos, input.rootPos));
  const solvedDistance = clamp(requestedDistance, minReach, maxReach);
  const desiredEndPosition = vec3AddScaled(input.rootPos, dirUnit, solvedDistance);
  const restBend = evaluateVarco3dProjectedRestBend(input.rootPos, input.midPos, input.endPos, input.lastBendDirection ?? { x: 0, y: 0, z: 1 });

  let bendDirection = restBend;
  if (input.polePos) {
    const toPole = vec3Sub(input.polePos, input.rootPos);
    const poleOrtho = vec3AddScaled(toPole, dirUnit, -vec3Dot(toPole, dirUnit));
    if (vec3Length(poleOrtho) >= 1e-6) bendDirection = vec3Normalize(poleOrtho);
  }

  const cosProj = (upper * upper - lower * lower + solvedDistance * solvedDistance) / (2 * solvedDistance);
  const sinHeight = Math.sqrt(Math.max(upper * upper - cosProj * cosProj, 0));
  const desiredMidPosition = vec3AddScaled(vec3AddScaled(input.rootPos, dirUnit, cosProj), bendDirection, sinHeight);

  const reachState = requestedDistance > maxReach + guard * 0.1 ? "clamped-far" : requestedDistance < minReach - guard * 0.1 ? "clamped-near" : "reachable";
  const poleArm = Math.max(upper + lower, STUDIO_VARCO3D_IK_CONTROLLER_METRICS.minPoleArmFloor);
  const defaultPolePosition = vec3AddScaled(input.midPos, restBend, poleArm * STUDIO_VARCO3D_IK_CONTROLLER_METRICS.poleOffsetRatio);
  const controlScale = Math.max((upper + lower) * STUDIO_VARCO3D_IK_CONTROLLER_METRICS.controlScaleRatio, STUDIO_VARCO3D_IK_CONTROLLER_METRICS.controlScaleMin);

  return Object.freeze({
    reachState,
    requestedDistance,
    solvedDistance,
    minReach,
    maxReach,
    desiredMidPosition,
    desiredEndPosition,
    bendDirection,
    defaultPolePosition,
    controlScale,
  });
}

/** `SkeletonDraftSession.remapSkinAttributes`: 본 삭제·병합 시 4-인플루언스 스키닝 가중치 재매핑·정규화. */
export function remapVarco3dDraftSkinAttributes(params: {
  readonly skinIndices: ArrayLike<number>;
  readonly skinWeights: ArrayLike<number>;
  readonly boneIndexRemap: ArrayLike<number>;
}): { readonly remappedIndices: Uint16Array; readonly remappedWeights: Float32Array } {
  const { skinIndices, skinWeights, boneIndexRemap } = params;
  const vertexCount = Math.floor(Math.min(skinIndices.length, skinWeights.length) / 4);
  const remappedIndices = new Uint16Array(vertexCount * 4);
  const remappedWeights = new Float32Array(vertexCount * 4);
  const accum = new Map<number, number>();

  for (let v = 0; v < vertexCount; v += 1) {
    accum.clear();
    for (let slot = 0; slot < 4; slot += 1) {
      const w = skinWeights[v * 4 + slot] ?? 0;
      if (w <= 0) continue;
      const mappedBone = boneIndexRemap[skinIndices[v * 4 + slot] ?? 0] ?? 0;
      accum.set(mappedBone, (accum.get(mappedBone) ?? 0) + w);
    }
    const sorted = [...accum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const totalWeight = sorted.reduce((sum, [, weight]) => sum + weight, 0);
    if (totalWeight <= 0) {
      remappedIndices[v * 4] = 0;
      remappedWeights[v * 4] = 1;
      continue;
    }
    for (let slot = 0; slot < 4; slot += 1) {
      const entry = sorted[slot];
      remappedIndices[v * 4 + slot] = entry ? entry[0] : 0;
      remappedWeights[v * 4 + slot] = entry ? cleanZero(entry[1] / totalWeight) : 0;
    }
  }
  return Object.freeze({ remappedIndices, remappedWeights });
}

/** `computeTransparentCameraFitDistance`: 투명 배경 턴테이블 프리뷰 카메라 피팅 거리 및 클리핑 평면 계산. */
export function computeVarco3dTransparentCameraFit(params: {
  readonly modelSize: StudioMannequinVec3;
  readonly aspect: number;
  readonly modelScale?: number;
}): { readonly fitDistance: number; readonly scaledDistance: number; readonly near: number; readonly far: number } {
  const { modelSize } = params;
  const aspect = Math.max(params.aspect, 1e-4);
  const modelScale = Math.max(params.modelScale ?? 1, 1e-4);
  const horizRadius = Math.hypot(modelSize.x, modelSize.z) / 2;
  const halfHeight = modelSize.y / 2;
  if (horizRadius === 0 && halfHeight === 0) return Object.freeze({ fitDistance: 0, scaledDistance: 0, near: 0.1, far: 2000 });
  const { transparentCameraFovDeg, transparentCameraHeightRatio, fitMargin } = STUDIO_VARCO3D_TURNTABLE_MULTIVIEW_METRICS;
  const pitchRad = Math.atan(transparentCameraHeightRatio);
  const projHalfHeight = halfHeight * Math.cos(pitchRad) + horizRadius * Math.sin(pitchRad);
  const projDepthOffset = horizRadius * Math.cos(pitchRad) + halfHeight * Math.sin(pitchRad);
  const tanHalfFov = Math.tan((transparentCameraFovDeg * Math.PI) / 360);
  const fitDistance = (Math.max(projHalfHeight / tanHalfFov, horizRadius / (tanHalfFov * aspect)) + projDepthOffset) * fitMargin;
  const scaledDistance = fitDistance / modelScale;
  return Object.freeze({
    fitDistance: cleanZero(fitDistance),
    scaledDistance: cleanZero(scaledDistance),
    near: cleanZero(scaledDistance / 100),
    far: cleanZero(scaledDistance * 100),
  });
}

export interface StudioVarco3dMultiViewEntryState {
  readonly id: string;
  readonly visible: boolean;
  readonly released: boolean;
  readonly lastInvisibleMs: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
}

/** `MultiViewRenderer.maybeCheckLazyRelease` & `renderFrame` 시저(Scissor) 뷰포트 배치 계산기. */
export function evaluateVarco3dMultiViewFramePlan(params: {
  readonly entries: readonly StudioVarco3dMultiViewEntryState[];
  readonly nowMs: number;
  readonly lastLazyCheckMs: number;
  readonly currentWebglCssWidth: number;
  readonly currentWebglCssHeight: number;
  readonly pixelRatio?: number;
}) {
  const { entries, nowMs, lastLazyCheckMs, currentWebglCssWidth, currentWebglCssHeight } = params;
  const dpr = clamp(params.pixelRatio ?? 1, 1, 2);
  const { lazyReleaseThresholdMs, lazyReleaseCheckIntervalMs } = STUDIO_VARCO3D_TURNTABLE_MULTIVIEW_METRICS;
  const shouldRunLazyCheck = nowMs - lastLazyCheckMs >= lazyReleaseCheckIntervalMs;
  const toReleaseIds = shouldRunLazyCheck
    ? entries
        .filter((e) => !e.visible && !e.released && e.lastInvisibleMs > 0 && nowMs - e.lastInvisibleMs >= lazyReleaseThresholdMs)
        .map((e) => e.id)
    : [];
  const visibleEntries = entries.filter((e) => e.visible && !e.released && e.cssWidth > 0 && e.cssHeight > 0);
  const maxW = visibleEntries.reduce((acc, e) => Math.max(acc, e.cssWidth), currentWebglCssWidth);
  const maxH = visibleEntries.reduce((acc, e) => Math.max(acc, e.cssHeight), currentWebglCssHeight);
  const scissorPasses = visibleEntries.map((entry) =>
    Object.freeze({
      id: entry.id,
      viewportX: 0,
      viewportY: maxH - entry.cssHeight,
      cssWidth: entry.cssWidth,
      cssHeight: entry.cssHeight,
      pixelWidth: Math.round(entry.cssWidth * dpr),
      pixelHeight: Math.round(entry.cssHeight * dpr),
    }),
  );
  return Object.freeze({
    shouldRunLazyCheck,
    nextLazyCheckMs: shouldRunLazyCheck ? nowMs : lastLazyCheckMs,
    toReleaseIds: Object.freeze(toReleaseIds),
    webglCssWidth: maxW,
    webglCssHeight: maxH,
    scissorPasses: Object.freeze(scissorPasses),
  });
}

/** `ScanBandEffect` (`v3d-scan-band`) 및 `MeshFadeInEffect` 수식 평가기. */
export function evaluateVarco3dScanBandAndFadeEffect(params: { readonly elapsedMs: number; readonly normalizedHeight: number }) {
  const { scanBandPeriodMs, scanBandWidth, scanBandBaseGlow, scanBandNormalSwell, meshFadeInDurationMs } =
    STUDIO_VARCO3D_TURNTABLE_MULTIVIEW_METRICS;
  const elapsed = Math.max(0, params.elapsedMs);
  const scanCenter = -0.12 + ((elapsed % scanBandPeriodMs) / scanBandPeriodMs) * (1 + 2 * scanBandWidth);
  const tBand = clamp(1 - Math.abs(params.normalizedHeight - scanCenter) / scanBandWidth, 0, 1);
  const scanBandWeight = tBand * tBand * (3 - 2 * tBand);
  const tFade = clamp(elapsed / meshFadeInDurationMs, 0, 1);
  return Object.freeze({
    scanCenter: cleanZero(scanCenter),
    scanBandWeight: cleanZero(scanBandWeight),
    normalSwellOffset: cleanZero(scanBandWeight * scanBandNormalSwell),
    rgbAdditiveGlow: cleanZero(scanBandWeight * scanBandBaseGlow),
    meshFadeOpacity: cleanZero(tFade * tFade * (3 - 2 * tFade)),
  });
}
