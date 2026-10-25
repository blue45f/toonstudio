/**
 * Catmull-Clark 세분(경계 규칙 포함)을 선형 스텐실(희소 행렬)로 만든다.
 *
 * CC는 고정 토폴로지에서 위치의 선형 연산자이므로, 같은 스텐실을 morph 델타·영역 one-hot에 재적용하면
 * "케이지에서 ±1 재생성 → 델타 → 리프트"가 정확히 세분 결과의 차와 같다(Catmull & Clark 1978, 수식만).
 * UV는 별도 토폴로지(섬 경계)로 같은 규칙을 적용하고, 최종 삼각 메시는 (위치, UV) 쌍으로 정점을 분할한다.
 */
import { computeVertexNormals } from "./tri-mesh";

import type { QuadMesh } from "./quad-mesh";

export interface SparseStencil {
  readonly rowCount: number;
  readonly colCount: number;
  readonly rowPtr: Uint32Array;
  readonly cols: Uint32Array;
  readonly weights: Float64Array;
}

export interface LevelPlan {
  readonly position: SparseStencil;
  readonly uv: SparseStencil;
  readonly faces: Uint32Array;
  readonly uvFaces: Uint32Array;
}

export interface SubdivisionPlan {
  readonly levels: readonly LevelPlan[];
  readonly cageVertexCount: number;
  readonly cageUvCount: number;
  readonly vertexCount: number;
  readonly uvCount: number;
  /** 최종 레벨의 쿼드 면(위치 인덱스) */
  readonly faces: Uint32Array;
  readonly uvFaces: Uint32Array;
  /** 각 레벨을 거친 후의 정점별 샤프니스(power ∈ [0, 1]) */
  readonly vertexSharpness?: Float32Array;
  /** 열린 경계(목 절단면 등)에서 생성·추적된 세분 정점 인덱스 */
  readonly boundaryVertexIndices?: Uint32Array;
}

export interface SubdivisionOptions {
  /** 케이지 정점별 날카로움(power ∈ [0, 1], 길이 = cageVertexCount) */
  readonly vertexSharpness?: ArrayLike<number>;
  /**
   * 정점 스무딩 규칙:
   * - "catmull-clark": p=0에서 표준 Catmull-Clark과 100% 일치하며 p→1일수록 원래 정점으로 고정
   * - "shaper": SHAPER SetVerticesSmoothPosition 공식 V' = (0.5 + 0.5p)V + (0.5 - 0.5p)S̄
   */
  readonly cornerRule?: "catmull-clark" | "shaper";
}

export interface SubdividedMesh {
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly faces: Uint32Array;
  readonly uvFaces: Uint32Array;
  readonly regions: Uint8Array;
  readonly plan: SubdivisionPlan;
}

const EDGE_KEY_BASE = 0x200000;

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

interface LevelTopology {
  readonly stencil: SparseStencil;
  readonly faces: Uint32Array;
  readonly nextSharpness?: Float32Array;
  readonly boundaryVertexIndices: Uint32Array;
}

function buildLevelTopology(
  vertexCount: number,
  faces: Uint32Array,
  vertexSharpness?: ArrayLike<number>,
  cornerRule: "catmull-clark" | "shaper" = "catmull-clark",
): LevelTopology {
  const faceCount = faces.length / 4;
  const edgeIndex = new Map<number, number>();
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeFace0: number[] = [];
  const edgeFace1: number[] = [];
  const faceEdges = new Uint32Array(faces.length);
  const vertexFaces: number[][] = Array.from({ length: vertexCount }, () => []);
  const vertexEdges: number[][] = Array.from({ length: vertexCount }, () => []);
  for (let f = 0; f < faceCount; f += 1) {
    for (let i = 0; i < 4; i += 1) {
      const a = faces[f * 4 + i];
      const b = faces[f * 4 + ((i + 1) % 4)];
      vertexFaces[a].push(f);
      const key = a < b ? a * EDGE_KEY_BASE + b : b * EDGE_KEY_BASE + a;
      let e = edgeIndex.get(key);
      if (e === undefined) {
        e = edgeA.length;
        edgeIndex.set(key, e);
        edgeA.push(Math.min(a, b));
        edgeB.push(Math.max(a, b));
        edgeFace0.push(f);
        edgeFace1.push(-1);
        vertexEdges[a].push(e);
        vertexEdges[b].push(e);
      } else if (edgeFace1[e] === -1 && edgeFace0[e] !== f) {
        edgeFace1[e] = f;
      } else if (edgeFace0[e] !== f) {
        throw new Error(`간선 ${a}-${b}에 면이 3개 이상입니다(비다양체).`);
      }
      faceEdges[f * 4 + i] = e;
    }
  }
  const edgeCount = edgeA.length;
  const rowCount = vertexCount + edgeCount + faceCount;
  const rows: Map<number, number>[] = new Array<Map<number, number>>(rowCount);
  const accumulate = (row: Map<number, number>, col: number, w: number): void => {
    if (w === 0) return;
    row.set(col, (row.get(col) ?? 0) + w);
  };
  const hasSharpness = vertexSharpness !== undefined;
  const nextSharpness = hasSharpness ? new Float32Array(rowCount) : undefined;
  const boundaryVertexSet = new Set<number>();

  // 면점
  for (let f = 0; f < faceCount; f += 1) {
    const row = new Map<number, number>();
    for (let i = 0; i < 4; i += 1) accumulate(row, faces[f * 4 + i], 0.25);
    rows[vertexCount + edgeCount + f] = row;
    if (nextSharpness !== undefined) {
      nextSharpness[vertexCount + edgeCount + f] = 0;
    }
  }
  // 간선점 (SHAPER CreateQuadEdgeSubVertice: w_e = 0.5 + 0.5 * p_e, E = w_e * M + (1 - w_e) * F_avg)
  for (let e = 0; e < edgeCount; e += 1) {
    const row = new Map<number, number>();
    const pa = hasSharpness ? clamp01(vertexSharpness[edgeA[e]] ?? 0) : 0;
    const pb = hasSharpness ? clamp01(vertexSharpness[edgeB[e]] ?? 0) : 0;
    const pe = 0.5 * (pa + pb);
    if (nextSharpness !== undefined) {
      nextSharpness[vertexCount + e] = pe;
    }
    if (edgeFace1[e] === -1) {
      accumulate(row, edgeA[e], 0.5);
      accumulate(row, edgeB[e], 0.5);
      boundaryVertexSet.add(edgeA[e]);
      boundaryVertexSet.add(edgeB[e]);
      boundaryVertexSet.add(vertexCount + e);
    } else {
      const we = 0.5 + 0.5 * pe;
      const midpointWeight = 0.5 * we;
      const faceAvgCornerWeight = 0.125 * (1 - we);
      accumulate(row, edgeA[e], midpointWeight);
      accumulate(row, edgeB[e], midpointWeight);
      for (const f of [edgeFace0[e], edgeFace1[e]]) {
        for (let i = 0; i < 4; i += 1) accumulate(row, faces[f * 4 + i], faceAvgCornerWeight);
      }
    }
    rows[vertexCount + e] = row;
  }
  // 정점점
  for (let v = 0; v < vertexCount; v += 1) {
    const row = new Map<number, number>();
    const edges = vertexEdges[v];
    const n = edges.length;
    const pv = hasSharpness ? clamp01(vertexSharpness[v] ?? 0) : 0;
    if (nextSharpness !== undefined) {
      nextSharpness[v] = pv;
    }
    if (n === 0) {
      // 면에 쓰이지 않는 정점은 그대로 둔다(빌더 compact 후에는 없다).
      accumulate(row, v, 1);
      rows[v] = row;
      continue;
    }
    const boundaryEdges = edges.filter((e) => edgeFace1[e] === -1);
    if (boundaryEdges.length > 0) {
      if (vertexFaces[v].length <= 1 || boundaryEdges.length !== 2 || pv >= 1) {
        // 모서리(섬 꼭짓점) 또는 완전 샤프 정점은 고정한다.
        accumulate(row, v, 1);
      } else {
        const selfWeight = 0.75 + 0.25 * pv;
        const neighborWeight = 0.125 * (1 - pv);
        accumulate(row, v, selfWeight);
        for (const e of boundaryEdges) accumulate(row, edgeA[e] === v ? edgeB[e] : edgeA[e], neighborWeight);
      }
      rows[v] = row;
      continue;
    }
    if (cornerRule === "shaper") {
      // SHAPER SetVerticesSmoothPosition 공식: V_new = (0.5 + 0.5 * p_v) * V_orig + (0.5 - 0.5 * p_v) * S_bar
      // 여기서 S_bar는 정점 v 주변 세분 정점들(인접 간선점 E_e 및 인접 면점 F_f)의 산술 평균
      const selfWeight = 0.5 + 0.5 * pv;
      const ringWeight = 0.5 - 0.5 * pv;
      accumulate(row, v, selfWeight);
      if (ringWeight > 0) {
        const fList = vertexFaces[v];
        const neighborCount = edges.length + fList.length;
        const invNeighbor = ringWeight / neighborCount;
        for (const e of edges) {
          const edgeRow = rows[vertexCount + e];
          for (const [col, w] of edgeRow.entries()) {
            accumulate(row, col, invNeighbor * w);
          }
        }
        for (const f of fList) {
          const faceRow = rows[vertexCount + edgeCount + f];
          for (const [col, w] of faceRow.entries()) {
            accumulate(row, col, invNeighbor * w);
          }
        }
      }
      rows[v] = row;
      continue;
    }
    const smoothScale = 1 - pv;
    const inv = 1 / n;
    const inv2 = inv * inv;
    accumulate(row, v, pv + smoothScale * ((n - 3) * inv));
    if (smoothScale > 0) {
      for (const f of vertexFaces[v]) {
        for (let i = 0; i < 4; i += 1) accumulate(row, faces[f * 4 + i], smoothScale * 0.25 * inv2);
      }
      for (const e of edges) {
        accumulate(row, edgeA[e], smoothScale * inv2);
        accumulate(row, edgeB[e], smoothScale * inv2);
      }
    }
    rows[v] = row;
  }
  // CSR(열 정렬로 결정성 보장)
  let nnz = 0;
  for (const row of rows) nnz += row.size;
  const rowPtr = new Uint32Array(rowCount + 1);
  const cols = new Uint32Array(nnz);
  const weights = new Float64Array(nnz);
  let cursor = 0;
  for (let r = 0; r < rowCount; r += 1) {
    rowPtr[r] = cursor;
    const sorted = [...rows[r].entries()].sort((x, y) => x[0] - y[0]);
    for (const [col, w] of sorted) {
      cols[cursor] = col;
      weights[cursor] = w;
      cursor += 1;
    }
  }
  rowPtr[rowCount] = cursor;
  // 새 면
  const newFaces = new Uint32Array(faceCount * 16);
  for (let f = 0; f < faceCount; f += 1) {
    const fp = vertexCount + edgeCount + f;
    for (let i = 0; i < 4; i += 1) {
      const v = faces[f * 4 + i];
      const eNext = vertexCount + faceEdges[f * 4 + i];
      const ePrev = vertexCount + faceEdges[f * 4 + ((i + 3) % 4)];
      const base = (f * 4 + i) * 4;
      newFaces[base] = v;
      newFaces[base + 1] = eNext;
      newFaces[base + 2] = fp;
      newFaces[base + 3] = ePrev;
    }
  }
  const sortedBoundary = Uint32Array.from([...boundaryVertexSet].sort((a, b) => a - b));
  return {
    stencil: { rowCount, colCount: vertexCount, rowPtr, cols, weights },
    faces: newFaces,
    nextSharpness,
    boundaryVertexIndices: sortedBoundary,
  };
}

export function applyStencil(stencil: SparseStencil, input: ArrayLike<number>, components: number): Float32Array {
  if (input.length !== stencil.colCount * components) {
    throw new Error(`스텐실 입력 길이(${input.length})가 ${stencil.colCount}×${components}와 다릅니다.`);
  }
  const out = new Float32Array(stencil.rowCount * components);
  const scratch = new Float64Array(components);
  for (let r = 0; r < stencil.rowCount; r += 1) {
    scratch.fill(0);
    for (let k = stencil.rowPtr[r]; k < stencil.rowPtr[r + 1]; k += 1) {
      const col = stencil.cols[k] * components;
      const w = stencil.weights[k];
      for (let c = 0; c < components; c += 1) scratch[c] += w * input[col + c];
    }
    for (let c = 0; c < components; c += 1) out[r * components + c] = scratch[c];
  }
  return out;
}

/** 케이지 정점 속성을 모든 레벨을 거쳐 최종 정점으로 */
export function liftAttribute(plan: SubdivisionPlan, values: ArrayLike<number>, components: number): Float32Array {
  let current: ArrayLike<number> = values;
  for (const level of plan.levels) current = applyStencil(level.position, current, components);
  return current instanceof Float32Array ? current : Float32Array.from(current);
}

export function liftUvs(plan: SubdivisionPlan, uvs: ArrayLike<number>): Float32Array {
  let current: ArrayLike<number> = uvs;
  for (const level of plan.levels) current = applyStencil(level.uv, current, 2);
  return current instanceof Float32Array ? current : Float32Array.from(current);
}

/** 영역 태그를 one-hot 보간 후 argmax(동률은 낮은 id)로 전파 */
export function liftRegions(plan: SubdivisionPlan, regions: Uint8Array, regionCount: number): Uint8Array {
  const oneHot = new Float32Array(regions.length * regionCount);
  for (let i = 0; i < regions.length; i += 1) {
    const r = regions[i];
    if (r < regionCount) oneHot[i * regionCount + r] = 1;
  }
  const lifted = liftAttribute(plan, oneHot, regionCount);
  const out = new Uint8Array(plan.vertexCount);
  for (let i = 0; i < plan.vertexCount; i += 1) {
    let best = 0;
    let bestValue = -1;
    for (let r = 0; r < regionCount; r += 1) {
      const value = lifted[i * regionCount + r];
      if (value > bestValue + 1e-9) {
        bestValue = value;
        best = r;
      }
    }
    out[i] = bestValue <= 0 ? 255 : best;
  }
  return out;
}

export function buildSubdivisionPlan(mesh: QuadMesh, levels: 0 | 1 | 2, options?: SubdivisionOptions): SubdivisionPlan {
  const levelPlans: LevelPlan[] = [];
  let vertexCount = mesh.positions.length / 3;
  let uvCount = mesh.uvs.length / 2;
  let faces = mesh.faces;
  let uvFaces = mesh.uvFaces;
  let currentSharpness: Float32Array | undefined =
    options?.vertexSharpness !== undefined
      ? Float32Array.from({ length: vertexCount }, (_, i) => clamp01(options.vertexSharpness?.[i] ?? 0))
      : undefined;
  let boundaryVertexIndices: Uint32Array | undefined;
  const cornerRule = options?.cornerRule ?? "catmull-clark";

  for (let l = 0; l < levels; l += 1) {
    const position = buildLevelTopology(vertexCount, faces, currentSharpness, cornerRule);
    const uv = buildLevelTopology(uvCount, uvFaces);
    vertexCount = position.stencil.rowCount;
    uvCount = uv.stencil.rowCount;
    faces = position.faces;
    uvFaces = uv.faces;
    currentSharpness = position.nextSharpness;
    boundaryVertexIndices = position.boundaryVertexIndices;
    levelPlans.push({ position: position.stencil, uv: uv.stencil, faces, uvFaces });
  }
  return {
    levels: levelPlans,
    cageVertexCount: mesh.positions.length / 3,
    cageUvCount: mesh.uvs.length / 2,
    vertexCount,
    uvCount,
    faces,
    uvFaces,
    ...(currentSharpness !== undefined ? { vertexSharpness: currentSharpness } : {}),
    ...(boundaryVertexIndices !== undefined ? { boundaryVertexIndices } : {}),
  };
}

/** 세분 후 정점 수 예측: V' = V + E + F, E' = 2E + 4F, F' = 4F */
export function predictVertexCount(mesh: Pick<QuadMesh, "positions" | "faces">, levels: number): number {
  let v = mesh.positions.length / 3;
  let f = mesh.faces.length / 4;
  const edgeSet = new Set<number>();
  for (let i = 0; i < mesh.faces.length; i += 4) {
    for (let k = 0; k < 4; k += 1) {
      const a = mesh.faces[i + k];
      const b = mesh.faces[i + ((k + 1) % 4)];
      edgeSet.add(a < b ? a * EDGE_KEY_BASE + b : b * EDGE_KEY_BASE + a);
    }
  }
  let e = edgeSet.size;
  for (let l = 0; l < levels; l += 1) {
    const nv = v + e + f;
    const ne = 2 * e + 4 * f;
    const nf = 4 * f;
    v = nv;
    e = ne;
    f = nf;
  }
  return v;
}

export const REGION_LIFT_COUNT = 16;

/** 스펙 공개 API: 케이지를 levels회 세분한다(위치·UV·영역·정점 샤프니스). */
export function catmullClark(mesh: QuadMesh, levels: 0 | 1 | 2, options?: SubdivisionOptions): SubdividedMesh {
  const plan = buildSubdivisionPlan(mesh, levels, options);
  return {
    positions: liftAttribute(plan, mesh.positions, 3),
    uvs: liftUvs(plan, mesh.uvs),
    faces: plan.faces,
    uvFaces: plan.uvFaces,
    regions: liftRegions(plan, mesh.regions, REGION_LIFT_COUNT),
    plan,
  };
}

export interface SplitTriMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  /** 분할 정점 → 위치(용접) 정점 인덱스 */
  readonly vertexSource: Uint32Array;
  /** 위치 인덱스 공간의 삼각형(법선·델타 법선 재계산용) */
  readonly weldedTriangles: Uint32Array;
  readonly weldedVertexCount: number;
  readonly regions: Uint8Array;
}

/** (위치, UV) 쌍으로 정점을 분할하고 쿼드를 삼각화한다. 법선은 용접 정점 기준으로 계산해 솔기에서도 매끈하다. */
export function subdividedToTriMesh(sub: Pick<SubdividedMesh, "positions" | "uvs" | "faces" | "uvFaces" | "regions">): SplitTriMesh {
  const uvCount = sub.uvs.length / 2;
  const pairIndex = new Map<number, number>();
  const vertexSourceList: number[] = [];
  const uvSourceList: number[] = [];
  const corner = new Uint32Array(sub.faces.length);
  for (let i = 0; i < sub.faces.length; i += 1) {
    const p = sub.faces[i];
    const t = sub.uvFaces[i];
    const key = p * uvCount + t;
    let index = pairIndex.get(key);
    if (index === undefined) {
      index = vertexSourceList.length;
      pairIndex.set(key, index);
      vertexSourceList.push(p);
      uvSourceList.push(t);
    }
    corner[i] = index;
  }
  const splitCount = vertexSourceList.length;
  const positions = new Float32Array(splitCount * 3);
  const uvs = new Float32Array(splitCount * 2);
  const regions = new Uint8Array(splitCount);
  const vertexSource = Uint32Array.from(vertexSourceList);
  for (let i = 0; i < splitCount; i += 1) {
    const p = vertexSourceList[i];
    const t = uvSourceList[i];
    positions[i * 3] = sub.positions[p * 3];
    positions[i * 3 + 1] = sub.positions[p * 3 + 1];
    positions[i * 3 + 2] = sub.positions[p * 3 + 2];
    uvs[i * 2] = sub.uvs[t * 2];
    uvs[i * 2 + 1] = sub.uvs[t * 2 + 1];
    regions[i] = sub.regions[p];
  }
  const faceCount = sub.faces.length / 4;
  const indices = new Uint32Array(faceCount * 6);
  const weldedTriangles = new Uint32Array(faceCount * 6);
  for (let f = 0; f < faceCount; f += 1) {
    const base = f * 4;
    const a = corner[base];
    const b = corner[base + 1];
    const c = corner[base + 2];
    const d = corner[base + 3];
    indices.set([a, b, c, a, c, d], f * 6);
    weldedTriangles.set(
      [sub.faces[base], sub.faces[base + 1], sub.faces[base + 2], sub.faces[base], sub.faces[base + 2], sub.faces[base + 3]],
      f * 6,
    );
  }
  const weldedVertexCount = sub.positions.length / 3;
  const weldedNormals = computeVertexNormals(sub.positions, weldedTriangles);
  const normals = expandWelded(weldedNormals, vertexSource, 3);
  return { positions, normals, uvs, indices, vertexSource, weldedTriangles, weldedVertexCount, regions };
}

/** 용접 정점 속성을 분할 정점으로 복사 */
export function expandWelded(values: Float32Array, vertexSource: Uint32Array, components: number): Float32Array {
  const out = new Float32Array(vertexSource.length * components);
  for (let i = 0; i < vertexSource.length; i += 1) {
    const src = vertexSource[i] * components;
    for (let c = 0; c < components; c += 1) out[i * components + c] = values[src + c];
  }
  return out;
}

export {
  adaptPartSeamOffsets,
  computeSeamCentroids3Zone,
  findAdjacentBodyPartSeamPairs,
  findCoincidentVertexGroups,
  lockCoincidentSeamVertices,
  matchNeckSeamVertices,
  weldAdjacentBodyPartNormals,
  weldNeckSeamPositionsAndNormals,
} from "./seam-weld";
export type {
  BodyPartSeamVertexPair,
  NeckSeamVertexPair,
  PartSeamAdaptationOptions,
  PartSeamAdaptationResult,
  SeamCentroids3Zone,
} from "./seam-weld";
export {
  applySymmetricControlPointEdit,
  computeShaperVertexKeyHash,
  findMirrorControlPointPairs,
  interpolateCageMorphTransition,
  recalculateCreaseNormals,
  selectControlPointsInScreenRect,
} from "./cage-control";
export type {
  ApplySymmetricControlPointEditOptions,
  CageMorphTransitionFrame,
  CageMorphTransitionInput,
  ScreenProjectedControlPoint,
  ShaperControlPointMirrorDescriptor,
  ShaperMirrorSide,
  SymmetricControlPointPositionEdit,
  SymmetricControlPointPowerEdit,
} from "./cage-control";
