/**
 * Garland-Heckbert QEM(Quadric Error Metrics) 삼각 메시 데시메이터 + 휴머노이드 리타게터 파사드.
 *
 * - 경계(Boundary) 및 UV 심(Seam) 보존 제약 평면 + 면 뒤집힘(Face-Flip) 방지
 * - 선택적 WebNN / WASM 실행 계층 프로브 (`probeMeshAccelTier`)
 * - 휴머노이드 본 리타게터(`humanoid-skeleton-retargeter`) 통합 재노출
 */

import type { Vec3 } from "./humanoid-skeleton-retargeter";

export {
  HUMANOID_PARENT_MAP,
  TOONSTUDIO_HUMANOID_BONES,
  multiplyQuaternions,
  quaternionFromAxisAngle,
  resolveHumanoidBoneName,
  retargetHumanoidAnimation,
  type HumanoidRestPoseKind,
  type HumanoidRetargetInput,
  type HumanoidRetargetResult,
  type HumanoidSkeletonConvention,
  type Quat4,
  type RetargetedPoseFrame,
  type SourceBoneRestSpec,
  type SourcePoseFrame,
  type TargetHumanoidRigSpec,
  type ToonStudioHumanoidBone,
  type Vec3,
  type Wave2HumanoidIkKernelHints,
  type Wave2SpineCcdHint,
  type Wave2TwoBoneIkHint,
} from "./humanoid-skeleton-retargeter";

export type MeshAccelTierKind =
  | "webnn-npu"
  | "wasm64-simd"
  | "wasm32-simd"
  | "ts-cpu-deterministic";

export interface QemExecutionTierDescriptor {
  readonly tier: MeshAccelTierKind;
  readonly hasWebNn: boolean;
  readonly hasWasm: boolean;
  readonly hasSharedMemory: boolean;
  readonly zeroServerCost: true;
}

export interface QemDecimationMeshInput {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly uvs?: Float32Array;
  readonly normals?: Float32Array;
}

export interface QemDecimationOptions {
  readonly targetRatio?: number;
  readonly targetTriangleCount?: number;
  readonly preserveBoundaryEdges?: boolean;
  readonly preserveUvSeams?: boolean;
  readonly boundaryWeight?: number;
  readonly uvSeamWeight?: number;
  readonly maxErrorThreshold?: number;
  readonly preventFaceFlip?: boolean;
  readonly executionTier?: QemExecutionTierDescriptor;
}

export interface QemMeshBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface QemDecimationResult {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly uvs?: Float32Array;
  readonly normals: Float32Array;
  readonly originalVertexCount: number;
  readonly decimatedVertexCount: number;
  readonly originalTriangleCount: number;
  readonly decimatedTriangleCount: number;
  readonly reductionRatio: number;
  readonly collapseCount: number;
  readonly maxQuadricError: number;
  readonly meanQuadricError: number;
  readonly preservedBoundaryEdgeCount: number;
  readonly preservedUvSeamEdgeCount: number;
  readonly degenerateFaceCount: number;
  readonly bounds: QemMeshBounds;
  readonly executionTier: QemExecutionTierDescriptor;
}

interface HeapEdgeCandidate {
  readonly cost: number;
  readonly u: number;
  readonly v: number;
  readonly versionU: number;
  readonly versionV: number;
  readonly optX: number;
  readonly optY: number;
  readonly optZ: number;
  readonly optT: number;
}

const EPS = 1e-8;
const AREA_EPS = 1e-12;

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

/** 런타임 WebNN / WASM 실행 계층을 안전하게 탐지한다. */
export function probeMeshAccelTier(): QemExecutionTierDescriptor {
  const g = globalThis as {
    readonly navigator?: { readonly ml?: unknown };
    readonly WebAssembly?: { readonly Memory?: unknown };
    readonly SharedArrayBuffer?: unknown;
  };
  const hasWebNn = Boolean(g.navigator && typeof g.navigator.ml === "object" && g.navigator.ml !== null);
  const hasWasm = typeof g.WebAssembly === "object" && g.WebAssembly !== null;
  const hasSharedMemory = typeof g.SharedArrayBuffer === "function";
  const tier: MeshAccelTierKind = hasWebNn
    ? "webnn-npu"
    : hasWasm && hasSharedMemory
      ? "wasm64-simd"
      : hasWasm
        ? "wasm32-simd"
        : "ts-cpu-deterministic";
  return { tier, hasWebNn, hasWasm, hasSharedMemory, zeroServerCost: true };
}

class MinEdgeHeap {
  private readonly items: HeapEdgeCandidate[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: HeapEdgeCandidate): void {
    this.items.push(item);
    let idx = this.items.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      const pItem = this.items[parent];
      if (!pItem || pItem.cost <= item.cost) break;
      this.items[idx] = pItem;
      idx = parent;
    }
    this.items[idx] = item;
  }

  pop(): HeapEdgeCandidate | undefined {
    const n = this.items.length;
    if (n === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop();
    if (n > 1 && last) {
      let idx = 0;
      const half = (n - 1) >> 1;
      while (idx < half) {
        let child = (idx << 1) + 1;
        const right = child + 1;
        const leftItem = this.items[child];
        const rightItem = right < this.items.length ? this.items[right] : undefined;
        if (rightItem && leftItem && rightItem.cost < leftItem.cost) child = right;
        const chosen = this.items[child];
        if (!chosen || last.cost <= chosen.cost) break;
        this.items[idx] = chosen;
        idx = child;
      }
      this.items[idx] = last;
    }
    return top;
  }
}

function addPlaneQuadric(
  quadrics: Float64Array,
  vIdx: number,
  a: number,
  b: number,
  c: number,
  d: number,
  w: number,
): void {
  const o = vIdx * 10;
  quadrics[o] += w * a * a;
  quadrics[o + 1] += w * a * b;
  quadrics[o + 2] += w * a * c;
  quadrics[o + 3] += w * a * d;
  quadrics[o + 4] += w * b * b;
  quadrics[o + 5] += w * b * c;
  quadrics[o + 6] += w * b * d;
  quadrics[o + 7] += w * c * c;
  quadrics[o + 8] += w * c * d;
  quadrics[o + 9] += w * d * d;
}

function evaluateQuadric10(q: Float64Array, x: number, y: number, z: number): number {
  const val =
    q[0] * x * x +
    2 * q[1] * x * y +
    2 * q[2] * x * z +
    2 * q[3] * x +
    q[4] * y * y +
    2 * q[5] * y * z +
    2 * q[6] * y +
    q[7] * z * z +
    2 * q[8] * z +
    q[9];
  return Number.isFinite(val) ? Math.max(0, val) : Number.POSITIVE_INFINITY;
}

function solveEdgeCollapseTarget(
  qSum: Float64Array,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  lockMode: 0 | 1 | 2 | 3,
): { readonly x: number; readonly y: number; readonly z: number; readonly t: number; readonly cost: number } {
  if (lockMode === 1) return { x: ax, y: ay, z: az, t: 0, cost: evaluateQuadric10(qSum, ax, ay, az) };
  if (lockMode === 2) return { x: bx, y: by, z: bz, t: 1, cost: evaluateQuadric10(qSum, bx, by, bz) };

  const mx = (ax + bx) * 0.5;
  const my = (ay + by) * 0.5;
  const mz = (az + bz) * 0.5;
  let bestX = ax;
  let bestY = ay;
  let bestZ = az;
  let bestT = 0;
  let bestCost = evaluateQuadric10(qSum, ax, ay, az);

  const costB = evaluateQuadric10(qSum, bx, by, bz);
  if (costB < bestCost) {
    bestX = bx;
    bestY = by;
    bestZ = bz;
    bestT = 1;
    bestCost = costB;
  }

  const costM = evaluateQuadric10(qSum, mx, my, mz);
  if (costM < bestCost) {
    bestX = mx;
    bestY = my;
    bestZ = mz;
    bestT = 0.5;
    bestCost = costM;
  }

  if (lockMode === 0) {
    const [a00, a01, a02, q03, a11, a12, q13, a22, q23] = qSum;
    const det =
      a00 * (a11 * a22 - a12 * a12) -
      a01 * (a01 * a22 - a12 * a02) +
      a02 * (a01 * a12 - a11 * a02);
    if (Math.abs(det) > 1e-10) {
      const r0 = -q03;
      const r1 = -q13;
      const r2 = -q23;
      const ox = (r0 * (a11 * a22 - a12 * a12) - a01 * (r1 * a22 - a12 * r2) + a02 * (r1 * a12 - a11 * r2)) / det;
      const oy = (a00 * (r1 * a22 - a12 * r2) - r0 * (a01 * a22 - a12 * a02) + a02 * (a01 * r2 - r1 * a02)) / det;
      const oz = (a00 * (a11 * r2 - r1 * a12) - a01 * (a01 * r2 - r1 * a02) + r0 * (a01 * a12 - a11 * a02)) / det;
      const edgeLen = Math.hypot(bx - ax, by - ay, bz - az);
      if (Number.isFinite(ox) && Number.isFinite(oy) && Number.isFinite(oz) && Math.hypot(ox - mx, oy - my, oz - mz) <= edgeLen * 2.5 + 1e-4) {
        const optCost = evaluateQuadric10(qSum, ox, oy, oz);
        if (optCost < bestCost) {
          const ex = bx - ax;
          const ey = by - ay;
          const ez = bz - az;
          const denom = ex * ex + ey * ey + ez * ez;
          bestT = denom > EPS ? clamp(((ox - ax) * ex + (oy - ay) * ey + (oz - az) * ez) / denom, 0, 1) : 0.5;
          bestX = ox;
          bestY = oy;
          bestZ = oz;
          bestCost = optCost;
        }
      }
    }
  }
  return { x: bestX, y: bestY, z: bestZ, t: bestT, cost: bestCost };
}

function triCross(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): readonly [number, number, number] {
  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;
  return [e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x];
}

function computeMeshNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const [nx, ny, nz] = triCross(
      positions[a], positions[a + 1], positions[a + 2],
      positions[b], positions[b + 1], positions[b + 2],
      positions[c], positions[c + 1], positions[c + 2],
    );
    normals[a] += nx;
    normals[a + 1] += ny;
    normals[a + 2] += nz;
    normals[b] += nx;
    normals[b + 1] += ny;
    normals[b + 2] += nz;
    normals[c] += nx;
    normals[c + 1] += ny;
    normals[c + 2] += nz;
  }
  for (let i = 0; i + 2 < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (len > EPS) {
      normals[i] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    } else {
      normals[i] = 0;
      normals[i + 1] = 1;
      normals[i + 2] = 0;
    }
  }
  return normals;
}

function detectUvSeamVertices(pos: Float64Array, uvs: Float64Array, vertexCount: number): Uint8Array {
  const isSeam = new Uint8Array(vertexCount);
  const buckets = new Map<string, number[]>();
  for (let v = 0; v < vertexCount; v += 1) {
    const key = `${Math.round(pos[v * 3] * 1e4)},${Math.round(pos[v * 3 + 1] * 1e4)},${Math.round(pos[v * 3 + 2] * 1e4)}`;
    const list = buckets.get(key);
    if (list) list.push(v);
    else buckets.set(key, [v]);
  }
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const first = bucket[0];
    if (first === undefined) continue;
    const u0 = uvs[first * 2];
    const v0 = uvs[first * 2 + 1];
    const hasSplit = bucket.some((idx) => Math.abs(uvs[idx * 2] - u0) + Math.abs(uvs[idx * 2 + 1] - v0) > 1e-4);
    if (hasSplit) {
      for (const idx of bucket) isSeam[idx] = 1;
    }
  }
  return isSeam;
}

/** Garland-Heckbert QEM 알고리즘으로 경계·UV 심을 보존하며 삼각 메시를 데시메이션한다. */
export function decimateMeshQem(
  input: QemDecimationMeshInput,
  options: QemDecimationOptions = {},
): QemDecimationResult {
  const executionTier = options.executionTier ?? probeMeshAccelTier();
  const vertexCount = Math.floor(input.positions.length / 3);
  const originalTriCount = Math.floor(input.indices.length / 3);
  const preserveBoundary = options.preserveBoundaryEdges ?? true;
  const preserveUvSeams = options.preserveUvSeams ?? true;
  const boundaryWeight = Math.max(1, options.boundaryWeight ?? 100);
  const uvSeamWeight = Math.max(1, options.uvSeamWeight ?? 50);
  const preventFaceFlip = options.preventFaceFlip ?? true;
  const maxErrorThreshold = options.maxErrorThreshold ?? Number.POSITIVE_INFINITY;
  const hasUvs = Boolean(input.uvs && input.uvs.length >= vertexCount * 2);

  const pos = new Float64Array(vertexCount * 3);
  for (let i = 0; i < pos.length; i += 1) {
    pos[i] = Number.isFinite(input.positions[i]) ? input.positions[i] : 0;
  }
  const uvs = hasUvs && input.uvs ? new Float64Array(vertexCount * 2) : undefined;
  if (uvs && input.uvs) {
    for (let i = 0; i < uvs.length; i += 1) {
      uvs[i] = Number.isFinite(input.uvs[i]) ? input.uvs[i] : 0;
    }
  }

  const tris = new Int32Array(originalTriCount * 3);
  const triAlive = new Uint8Array(originalTriCount);
  const vertAlive = new Uint8Array(vertexCount);
  vertAlive.fill(1);
  const vertVersion = new Int32Array(vertexCount);
  const vertTris: Set<number>[] = Array.from({ length: vertexCount }, () => new Set<number>());
  const quadrics = new Float64Array(vertexCount * 10);
  const edgeTriCount = new Map<number, number>();
  const edgeFirstTri = new Map<number, number>();
  const makeEdgeKey = (a: number, b: number): number => (a < b ? a * vertexCount + b : b * vertexCount + a);

  let liveTriCount = 0;
  for (let t = 0; t < originalTriCount; t += 1) {
    const i0 = input.indices[t * 3];
    const i1 = input.indices[t * 3 + 1];
    const i2 = input.indices[t * 3 + 2];
    if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount || i0 === i1 || i1 === i2 || i2 === i0) continue;
    const [nx, ny, nz] = triCross(
      pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2],
      pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2],
      pos[i2 * 3], pos[i2 * 3 + 1], pos[i2 * 3 + 2],
    );
    const normLen = Math.hypot(nx, ny, nz);
    if (normLen <= AREA_EPS) continue;

    tris[t * 3] = i0;
    tris[t * 3 + 1] = i1;
    tris[t * 3 + 2] = i2;
    triAlive[t] = 1;
    liveTriCount += 1;
    vertTris[i0]?.add(t);
    vertTris[i1]?.add(t);
    vertTris[i2]?.add(t);

    const a = nx / normLen;
    const b = ny / normLen;
    const c = nz / normLen;
    const d = -(a * pos[i0 * 3] + b * pos[i0 * 3 + 1] + c * pos[i0 * 3 + 2]);
    const w = 0.5 * normLen;
    addPlaneQuadric(quadrics, i0, a, b, c, d, w);
    addPlaneQuadric(quadrics, i1, a, b, c, d, w);
    addPlaneQuadric(quadrics, i2, a, b, c, d, w);

    for (const [u, v] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
      const k = makeEdgeKey(u, v);
      edgeTriCount.set(k, (edgeTriCount.get(k) ?? 0) + 1);
      if (!edgeFirstTri.has(k)) edgeFirstTri.set(k, t);
    }
  }

  const isBoundaryVert = new Uint8Array(vertexCount);
  const isUvSeamVert = preserveUvSeams && uvs ? detectUvSeamVertices(pos, uvs, vertexCount) : new Uint8Array(vertexCount);
  const boundaryEdgeKeys = new Set<number>();
  const uvSeamEdgeKeys = new Set<number>();

  for (const [key, count] of edgeTriCount.entries()) {
    const u = Math.floor(key / vertexCount);
    const v = key - u * vertexCount;
    const isBoundaryEdge = count === 1;
    const isSeamEdge = preserveUvSeams && isUvSeamVert[u] === 1 && isUvSeamVert[v] === 1;
    if (!isBoundaryEdge && !isSeamEdge) continue;
    if (isBoundaryEdge && preserveBoundary) {
      boundaryEdgeKeys.add(key);
      isBoundaryVert[u] = 1;
      isBoundaryVert[v] = 1;
    }
    if (isSeamEdge) uvSeamEdgeKeys.add(key);

    const triIdx = edgeFirstTri.get(key);
    if (triIdx === undefined) continue;
    const i0 = tris[triIdx * 3];
    const i1 = tris[triIdx * 3 + 1];
    const i2 = tris[triIdx * 3 + 2];
    const [fnx, fny, fnz] = triCross(
      pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2],
      pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2],
      pos[i2 * 3], pos[i2 * 3 + 1], pos[i2 * 3 + 2],
    );
    const ex = pos[v * 3] - pos[u * 3];
    const ey = pos[v * 3 + 1] - pos[u * 3 + 1];
    const ez = pos[v * 3 + 2] - pos[u * 3 + 2];
    const pnx = ey * fnz - ez * fny;
    const pny = ez * fnx - ex * fnz;
    const pnz = ex * fny - ey * fnx;
    const pLen = Math.hypot(pnx, pny, pnz);
    if (pLen > EPS) {
      const a = pnx / pLen;
      const b = pny / pLen;
      const c = pnz / pLen;
      const d = -(a * pos[u * 3] + b * pos[u * 3 + 1] + c * pos[u * 3 + 2]);
      const weight = (isBoundaryEdge && preserveBoundary ? boundaryWeight : 0) + (isSeamEdge ? uvSeamWeight : 0);
      addPlaneQuadric(quadrics, u, a, b, c, d, weight);
      addPlaneQuadric(quadrics, v, a, b, c, d, weight);
    }
  }

  const ratio = clamp(options.targetRatio ?? 0.5, 0.05, 1);
  const targetTriCount = Math.max(
    4,
    Math.min(
      liveTriCount,
      options.targetTriangleCount !== undefined ? Math.floor(options.targetTriangleCount) : Math.round(liveTriCount * ratio),
    ),
  );

  const heap = new MinEdgeHeap();
  const qSum = new Float64Array(10);
  const enqueueEdge = (u: number, v: number): void => {
    if (u === v || vertAlive[u] === 0 || vertAlive[v] === 0) return;
    const uLocked = (preserveBoundary && isBoundaryVert[u] === 1) || (preserveUvSeams && isUvSeamVert[u] === 1);
    const vLocked = (preserveBoundary && isBoundaryVert[v] === 1) || (preserveUvSeams && isUvSeamVert[v] === 1);
    const key = makeEdgeKey(u, v);
    const isConstraintEdge = boundaryEdgeKeys.has(key) || uvSeamEdgeKeys.has(key);
    if (uLocked && vLocked && !isConstraintEdge) return;

    const lockMode: 0 | 1 | 2 | 3 = uLocked && vLocked ? 3 : uLocked ? 1 : vLocked ? 2 : 0;
    const ou = u * 10;
    const ov = v * 10;
    for (let k = 0; k < 10; k += 1) qSum[k] = quadrics[ou + k] + quadrics[ov + k];
    const solved = solveEdgeCollapseTarget(
      qSum,
      pos[u * 3], pos[u * 3 + 1], pos[u * 3 + 2],
      pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2],
      lockMode,
    );
    heap.push({
      cost: solved.cost + (lockMode === 3 ? boundaryWeight * 1e-3 : 0),
      u,
      v,
      versionU: vertVersion[u],
      versionV: vertVersion[v],
      optX: solved.x,
      optY: solved.y,
      optZ: solved.z,
      optT: solved.t,
    });
  };

  for (const key of edgeTriCount.keys()) {
    const u = Math.floor(key / vertexCount);
    enqueueEdge(u, key - u * vertexCount);
  }

  const wouldFlipFace = (u: number, v: number, nx: number, ny: number, nz: number): boolean => {
    for (const triSet of [vertTris[u], vertTris[v]]) {
      if (!triSet) continue;
      for (const t of triSet) {
        if (triAlive[t] === 0) continue;
        const a = tris[t * 3];
        const b = tris[t * 3 + 1];
        const c = tris[t * 3 + 2];
        if ((a === u || b === u || c === u) && (a === v || b === v || c === v)) continue;
        const [onx, ony, onz] = triCross(
          pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2],
          pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2],
          pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2],
        );
        const oLen = Math.hypot(onx, ony, onz);
        if (oLen <= AREA_EPS) continue;
        const [nnx, nny, nnz] = triCross(
          a === u || a === v ? nx : pos[a * 3],
          a === u || a === v ? ny : pos[a * 3 + 1],
          a === u || a === v ? nz : pos[a * 3 + 2],
          b === u || b === v ? nx : pos[b * 3],
          b === u || b === v ? ny : pos[b * 3 + 1],
          b === u || b === v ? nz : pos[b * 3 + 2],
          c === u || c === v ? nx : pos[c * 3],
          c === u || c === v ? ny : pos[c * 3 + 1],
          c === u || c === v ? nz : pos[c * 3 + 2],
        );
        const nLen = Math.hypot(nnx, nny, nnz);
        if (nLen <= AREA_EPS) return true;
        if (preventFaceFlip && (onx * nnx + ony * nny + onz * nnz) / (oLen * nLen) < 0.15) return true;
      }
    }
    return false;
  };

  let collapseCount = 0;
  let maxQuadricError = 0;
  let sumQuadricError = 0;

  while (liveTriCount > targetTriCount && heap.size > 0) {
    const cand = heap.pop();
    if (!cand || cand.cost > maxErrorThreshold) break;
    const { u, v } = cand;
    if (vertAlive[u] === 0 || vertAlive[v] === 0) continue;
    if (vertVersion[u] !== cand.versionU || vertVersion[v] !== cand.versionV) continue;
    if (wouldFlipFace(u, v, cand.optX, cand.optY, cand.optZ)) continue;

    pos[u * 3] = cand.optX;
    pos[u * 3 + 1] = cand.optY;
    pos[u * 3 + 2] = cand.optZ;
    if (uvs) {
      uvs[u * 2] = uvs[u * 2] * (1 - cand.optT) + uvs[v * 2] * cand.optT;
      uvs[u * 2 + 1] = uvs[u * 2 + 1] * (1 - cand.optT) + uvs[v * 2 + 1] * cand.optT;
    }
    for (let k = 0; k < 10; k += 1) quadrics[u * 10 + k] += quadrics[v * 10 + k];
    if (isBoundaryVert[v] === 1) isBoundaryVert[u] = 1;
    if (isUvSeamVert[v] === 1) isUvSeamVert[u] = 1;

    vertAlive[v] = 0;
    vertVersion[u] += 1;
    vertVersion[v] += 1;

    const vSet = vertTris[v];
    const uSet = vertTris[u];
    const neighbors = new Set<number>();
    if (vSet && uSet) {
      for (const t of Array.from(vSet)) {
        if (triAlive[t] === 0) continue;
        const a = tris[t * 3];
        const b = tris[t * 3 + 1];
        const c = tris[t * 3 + 2];
        if (a === u || b === u || c === u) {
          triAlive[t] = 0;
          liveTriCount -= 1;
          vertTris[a]?.delete(t);
          vertTris[b]?.delete(t);
          vertTris[c]?.delete(t);
        } else {
          if (a === v) tris[t * 3] = u;
          if (b === v) tris[t * 3 + 1] = u;
          if (c === v) tris[t * 3 + 2] = u;
          uSet.add(t);
        }
      }
      vSet.clear();
      for (const t of uSet) {
        if (triAlive[t] === 0) continue;
        const a = tris[t * 3];
        const b = tris[t * 3 + 1];
        const c = tris[t * 3 + 2];
        if (a !== u) neighbors.add(a);
        if (b !== u) neighbors.add(b);
        if (c !== u) neighbors.add(c);
      }
    }

    collapseCount += 1;
    maxQuadricError = Math.max(maxQuadricError, cand.cost);
    sumQuadricError += cand.cost;
    for (const nb of neighbors) {
      if (vertAlive[nb] === 1) enqueueEdge(u, nb);
    }
  }

  const remap = new Int32Array(vertexCount).fill(-1);
  const outPositionsList: number[] = [];
  const outUvsList: number[] = [];
  const outIndicesList: number[] = [];
  const finalBoundaryEdgeCounts = new Map<number, number>();
  let preservedUvSeamEdges = 0;

  const mapVert = (orig: number): number => {
    const existing = remap[orig];
    if (existing >= 0) return existing;
    const next = outPositionsList.length / 3;
    remap[orig] = next;
    outPositionsList.push(pos[orig * 3], pos[orig * 3 + 1], pos[orig * 3 + 2]);
    if (uvs) outUvsList.push(uvs[orig * 2], uvs[orig * 2 + 1]);
    return next;
  };

  for (let t = 0; t < originalTriCount; t += 1) {
    if (triAlive[t] === 0) continue;
    const a = tris[t * 3];
    const b = tris[t * 3 + 1];
    const c = tris[t * 3 + 2];
    if (a === b || b === c || c === a) continue;
    const [cx, cy, cz] = triCross(
      pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2],
      pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2],
      pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2],
    );
    if (Math.hypot(cx, cy, cz) <= AREA_EPS) continue;

    outIndicesList.push(mapVert(a), mapVert(b), mapVert(c));
    for (const [eu, ev] of [[a, b], [b, c], [c, a]] as const) {
      const ek = makeEdgeKey(eu, ev);
      finalBoundaryEdgeCounts.set(ek, (finalBoundaryEdgeCounts.get(ek) ?? 0) + 1);
      if (isUvSeamVert[eu] === 1 && isUvSeamVert[ev] === 1) preservedUvSeamEdges += 1;
    }
  }

  let preservedBoundaryEdges = 0;
  for (const count of finalBoundaryEdgeCounts.values()) {
    if (count === 1) preservedBoundaryEdges += 1;
  }

  const outPositions = new Float32Array(outPositionsList);
  const outIndices = new Uint32Array(outIndicesList);
  const outUvs = uvs ? new Float32Array(outUvsList) : undefined;
  const outNormals = computeMeshNormals(outPositions, outIndices);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 2 < outPositions.length; i += 3) {
    minX = Math.min(minX, outPositions[i]);
    minY = Math.min(minY, outPositions[i + 1]);
    minZ = Math.min(minZ, outPositions[i + 2]);
    maxX = Math.max(maxX, outPositions[i]);
    maxY = Math.max(maxY, outPositions[i + 1]);
    maxZ = Math.max(maxZ, outPositions[i + 2]);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    minZ = 0;
    maxX = 0;
    maxY = 0;
    maxZ = 0;
  }

  const decimatedTriCount = outIndices.length / 3;
  return {
    positions: outPositions,
    indices: outIndices,
    uvs: outUvs,
    normals: outNormals,
    originalVertexCount: vertexCount,
    decimatedVertexCount: outPositions.length / 3,
    originalTriangleCount: originalTriCount,
    decimatedTriangleCount: decimatedTriCount,
    reductionRatio: originalTriCount > 0 ? decimatedTriCount / originalTriCount : 1,
    collapseCount,
    maxQuadricError,
    meanQuadricError: collapseCount > 0 ? sumQuadricError / collapseCount : 0,
    preservedBoundaryEdgeCount: preservedBoundaryEdges,
    preservedUvSeamEdgeCount: preservedUvSeamEdges,
    degenerateFaceCount: 0,
    bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    executionTier,
  };
}
