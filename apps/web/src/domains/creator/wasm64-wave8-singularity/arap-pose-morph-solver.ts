/**
 * Wave 8 Singularity — ARAP(As-Rigid-As-Possible) 삼각 메쉬 포즈 변형 및 키프레임 모핑 솔버 (₩0 로컬).
 *
 * - 국소 단계(Local Step): 닫힌 형식 2×2 극분해(Polar / 2D SVD 회전 추출, det = +1 보장)
 * - 전역 단계(Global Step): 코탄젠트/균일 가중 라플라시안 선형계 야코비 전처리 켤레기울기법(PCG) 풀이
 * - 키프레임 보간(`t ∈ [0, 1]`): 삼각형 야코비안 회전·대칭 신축 분리 보간으로 큰 관절 회전에서도 면적 보존
 */

export type Vec2Tuple = readonly [number, number];
export type TriangleTuple = readonly [number, number, number];
export type ArapWeightMode = "cotangent" | "uniform";

export interface ArapPinConstraint {
  readonly vertexIndex: number;
  readonly target: Vec2Tuple;
}

export interface ArapDeformationInput {
  readonly restVertices: readonly Vec2Tuple[];
  readonly triangles: readonly TriangleTuple[];
  readonly pins: readonly ArapPinConstraint[];
  readonly weightMode?: ArapWeightMode;
  readonly iterations?: number;
}

export interface ArapDeformationResult {
  readonly vertices: readonly Vec2Tuple[];
  readonly localRotationsRad: Float64Array;
  readonly arapEnergy: number;
  readonly restTotalArea: number;
  readonly deformedTotalArea: number;
  readonly areaRetentionRatio: number;
  readonly iterationsRun: number;
  readonly serverCostKrw: 0;
}

export interface ArapKeyframeMorphInput {
  readonly sourceVertices: readonly Vec2Tuple[];
  readonly targetVertices: readonly Vec2Tuple[];
  readonly triangles: readonly TriangleTuple[];
  readonly t: number;
  readonly weightMode?: ArapWeightMode;
  readonly anchorIndices?: readonly number[];
  readonly polishIterations?: number;
}

export interface ArapKeyframeMorphResult {
  readonly vertices: readonly Vec2Tuple[];
  readonly t: number;
  readonly restTotalArea: number;
  readonly morphedTotalArea: number;
  readonly linearBlendTotalArea: number;
  readonly areaRetentionRatio: number;
  readonly linearBlendAreaRatio: number;
  readonly triangleRotationsRad: Float64Array;
  readonly serverCostKrw: 0;
}

interface WeightedAdjacency {
  readonly neighbors: readonly (readonly number[])[];
  readonly weights: readonly Float64Array[];
  readonly diag: Float64Array;
}

/** 삼각 메쉬 전체 절대 면적 합을 계산한다. */
export function computeMeshTotalArea(
  vertices: readonly Vec2Tuple[],
  triangles: readonly TriangleTuple[],
): number {
  let sum = 0;
  for (let m = 0; m < triangles.length; m += 1) {
    const [i, j, k] = triangles[m]!;
    const pi = vertices[i]!;
    const pj = vertices[j]!;
    const pk = vertices[k]!;
    const cross = (pj[0] - pi[0]) * (pk[1] - pi[1]) - (pj[1] - pi[1]) * (pk[0] - pi[0]);
    sum += 0.5 * Math.abs(cross);
  }
  return sum;
}

function cotangentHalfWeight(va: Vec2Tuple, vb: Vec2Tuple, vc: Vec2Tuple): number {
  const ux = va[0] - vc[0];
  const uy = va[1] - vc[1];
  const vx = vb[0] - vc[0];
  const vy = vb[1] - vc[1];
  const dot = ux * vx + uy * vy;
  const crossAbs = Math.abs(ux * vy - uy * vx);
  if (crossAbs < 1e-10) return 1.0;
  return Math.max(1e-3, Math.min(50, 0.5 * (dot / crossAbs)));
}

function buildLaplacianAdjacency(
  vertices: readonly Vec2Tuple[],
  triangles: readonly TriangleTuple[],
  mode: ArapWeightMode,
): WeightedAdjacency {
  const n = vertices.length;
  const edgeMaps: Map<number, number>[] = Array.from({ length: n }, () => new Map<number, number>());

  const addSymmetricWeight = (a: number, b: number, w: number): void => {
    if (a === b) return;
    const clamped = Math.max(1e-4, w);
    edgeMaps[a]!.set(b, (edgeMaps[a]!.get(b) ?? 0) + clamped);
    edgeMaps[b]!.set(a, (edgeMaps[b]!.get(a) ?? 0) + clamped);
  };

  for (let m = 0; m < triangles.length; m += 1) {
    const [i, j, k] = triangles[m]!;
    if (mode === "uniform") {
      addSymmetricWeight(i, j, 0.5);
      addSymmetricWeight(j, k, 0.5);
      addSymmetricWeight(k, i, 0.5);
      continue;
    }
    const pi = vertices[i]!;
    const pj = vertices[j]!;
    const pk = vertices[k]!;
    addSymmetricWeight(i, j, cotangentHalfWeight(pi, pj, pk));
    addSymmetricWeight(j, k, cotangentHalfWeight(pj, pk, pi));
    addSymmetricWeight(k, i, cotangentHalfWeight(pk, pi, pj));
  }

  const neighbors: number[][] = [];
  const weights: Float64Array[] = [];
  const diag = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    const entries = [...edgeMaps[i]!.entries()].sort((a, b) => a[0] - b[0]);
    const nbrs = new Array<number>(entries.length);
    const wts = new Float64Array(entries.length);
    let d = 0;
    for (let e = 0; e < entries.length; e += 1) {
      nbrs[e] = entries[e]![0];
      wts[e] = entries[e]![1];
      d += entries[e]![1];
    }
    neighbors.push(nbrs);
    weights.push(wts);
    diag[i] = d;
  }

  return { neighbors, weights, diag };
}

/** 핀 고정 정점을 제외한 대칭 양정치 라플라시안 선형계 L x = b를 야코비 전처리 켤레기울기법(PCG)으로 푼다. */
function solvePinnedLaplacianPcg(
  adj: WeightedAdjacency,
  isPinned: Uint8Array,
  pinnedValues: Float64Array,
  rhsFull: Float64Array,
  initialGuess: Float64Array,
): Float64Array {
  const n = adj.diag.length;
  const x = new Float64Array(initialGuess);
  for (let i = 0; i < n; i += 1) {
    if (isPinned[i] === 1) x[i] = pinnedValues[i]!;
  }

  const b = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    if (isPinned[i] === 1) continue;
    let val = rhsFull[i]!;
    const nbrs = adj.neighbors[i]!;
    const wts = adj.weights[i]!;
    for (let e = 0; e < nbrs.length; e += 1) {
      const j = nbrs[e]!;
      if (isPinned[j] === 1) val += wts[e]! * pinnedValues[j]!;
    }
    b[i] = val;
  }

  const applyA = (vec: Float64Array, out: Float64Array): void => {
    for (let i = 0; i < n; i += 1) {
      if (isPinned[i] === 1) {
        out[i] = 0;
        continue;
      }
      const d = adj.diag[i]!;
      if (d <= 0) {
        out[i] = vec[i]!;
        continue;
      }
      let sum = d * vec[i]!;
      const nbrs = adj.neighbors[i]!;
      const wts = adj.weights[i]!;
      for (let e = 0; e < nbrs.length; e += 1) {
        const j = nbrs[e]!;
        if (isPinned[j] === 0) sum -= wts[e]! * vec[j]!;
      }
      out[i] = sum;
    }
  };

  const ax = new Float64Array(n);
  applyA(x, ax);
  const r = new Float64Array(n);
  const z = new Float64Array(n);
  const p = new Float64Array(n);

  let rzOld = 0;
  let rNormSq = 0;
  for (let i = 0; i < n; i += 1) {
    if (isPinned[i] === 1) continue;
    const ri = b[i]! - ax[i]!;
    r[i] = ri;
    const invD = adj.diag[i]! > 1e-12 ? 1 / adj.diag[i]! : 1;
    z[i] = ri * invD;
    p[i] = z[i]!;
    rzOld += ri * z[i]!;
    rNormSq += ri * ri;
  }

  if (rNormSq < 1e-20) return x;

  const ap = new Float64Array(n);
  const maxSteps = Math.max(64, n * 3);
  for (let step = 0; step < maxSteps; step += 1) {
    applyA(p, ap);
    let pAp = 0;
    for (let i = 0; i < n; i += 1) {
      if (isPinned[i] === 0) pAp += p[i]! * ap[i]!;
    }
    if (Math.abs(pAp) < 1e-24) break;
    const alpha = rzOld / pAp;
    let rzNew = 0;
    rNormSq = 0;
    for (let i = 0; i < n; i += 1) {
      if (isPinned[i] === 1) continue;
      x[i] = x[i]! + alpha * p[i]!;
      const ri = r[i]! - alpha * ap[i]!;
      r[i] = ri;
      rNormSq += ri * ri;
      const invD = adj.diag[i]! > 1e-12 ? 1 / adj.diag[i]! : 1;
      z[i] = ri * invD;
      rzNew += ri * z[i]!;
    }
    if (rNormSq < 1e-18) break;
    const beta = rzNew / Math.max(1e-24, rzOld);
    for (let i = 0; i < n; i += 1) {
      if (isPinned[i] === 0) p[i] = z[i]! + beta * p[i]!;
    }
    rzOld = rzNew;
  }

  return x;
}

function ensureComponentPins(
  adj: WeightedAdjacency,
  initialPinned: Uint8Array,
  pinX: Float64Array,
  pinY: Float64Array,
  fallbackVertices: readonly Vec2Tuple[],
): void {
  const n = adj.diag.length;
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);

  for (let start = 0; start < n; start += 1) {
    if (visited[start] === 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;
    let hasPin = false;

    while (head < tail) {
      const u = queue[head]!;
      head += 1;
      if (initialPinned[u] === 1) hasPin = true;
      for (const v of adj.neighbors[u]!) {
        if (visited[v] === 0) {
          visited[v] = 1;
          queue[tail] = v;
          tail += 1;
        }
      }
    }

    if (!hasPin) {
      initialPinned[start] = 1;
      pinX[start] = fallbackVertices[start]![0];
      pinY[start] = fallbackVertices[start]![1];
    }
  }
}

/** 국소 2D SVD/극분해 회전 추정과 전역 가중 라플라시안 해법을 교대 수행하는 ARAP 메쉬 변형 솔버. */
export function solveArapMeshDeformation(input: ArapDeformationInput): ArapDeformationResult {
  const n = input.restVertices.length;
  const weightMode = input.weightMode ?? "cotangent";
  const iterations = Math.max(1, Math.min(80, Math.trunc(input.iterations ?? 12)));
  const adj = buildLaplacianAdjacency(input.restVertices, input.triangles, weightMode);

  const isPinned = new Uint8Array(n);
  const pinX = new Float64Array(n);
  const pinY = new Float64Array(n);
  for (const pin of input.pins) {
    if (pin.vertexIndex >= 0 && pin.vertexIndex < n) {
      isPinned[pin.vertexIndex] = 1;
      pinX[pin.vertexIndex] = pin.target[0];
      pinY[pin.vertexIndex] = pin.target[1];
    }
  }
  ensureComponentPins(adj, isPinned, pinX, pinY, input.restVertices);

  let curX: Float64Array = new Float64Array(n);
  let curY: Float64Array = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    curX[i] = isPinned[i] === 1 ? pinX[i]! : input.restVertices[i]![0];
    curY[i] = isPinned[i] === 1 ? pinY[i]! : input.restVertices[i]![1];
  }

  const rotCos = new Float64Array(n).fill(1);
  const rotSin = new Float64Array(n);
  const localRotationsRad = new Float64Array(n);
  const rhsX = new Float64Array(n);
  const rhsY = new Float64Array(n);

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < n; i += 1) {
      const pi = input.restVertices[i]!;
      const nbrs = adj.neighbors[i]!;
      const wts = adj.weights[i]!;
      let c = 0;
      let s = 0;
      for (let e = 0; e < nbrs.length; e += 1) {
        const j = nbrs[e]!;
        const w = wts[e]!;
        const pj = input.restVertices[j]!;
        const ex = pi[0] - pj[0];
        const ey = pi[1] - pj[1];
        const dpx = curX[i]! - curX[j]!;
        const dpy = curY[i]! - curY[j]!;
        c += w * (dpx * ex + dpy * ey);
        s += w * (dpy * ex - dpx * ey);
      }
      const norm = Math.hypot(c, s);
      if (norm > 1e-12) {
        rotCos[i] = c / norm;
        rotSin[i] = s / norm;
        localRotationsRad[i] = Math.atan2(s, c);
      } else {
        rotCos[i] = 1;
        rotSin[i] = 0;
        localRotationsRad[i] = 0;
      }
    }

    rhsX.fill(0);
    rhsY.fill(0);
    for (let i = 0; i < n; i += 1) {
      if (isPinned[i] === 1) continue;
      const pi = input.restVertices[i]!;
      const nbrs = adj.neighbors[i]!;
      const wts = adj.weights[i]!;
      let bx = 0;
      let by = 0;
      for (let e = 0; e < nbrs.length; e += 1) {
        const j = nbrs[e]!;
        const w = wts[e]!;
        const pj = input.restVertices[j]!;
        const ex = pi[0] - pj[0];
        const ey = pi[1] - pj[1];
        const avgCos = 0.5 * (rotCos[i]! + rotCos[j]!);
        const avgSin = 0.5 * (rotSin[i]! + rotSin[j]!);
        bx += w * (avgCos * ex - avgSin * ey);
        by += w * (avgSin * ex + avgCos * ey);
      }
      rhsX[i] = bx;
      rhsY[i] = by;
    }

    curX = solvePinnedLaplacianPcg(adj, isPinned, pinX, rhsX, curX);
    curY = solvePinnedLaplacianPcg(adj, isPinned, pinY, rhsY, curY);
  }

  let arapEnergy = 0;
  for (let i = 0; i < n; i += 1) {
    const pi = input.restVertices[i]!;
    const nbrs = adj.neighbors[i]!;
    const wts = adj.weights[i]!;
    for (let e = 0; e < nbrs.length; e += 1) {
      const j = nbrs[e]!;
      if (j <= i) continue;
      const w = wts[e]!;
      const pj = input.restVertices[j]!;
      const ex = pi[0] - pj[0];
      const ey = pi[1] - pj[1];
      const dpx = curX[i]! - curX[j]!;
      const dpy = curY[i]! - curY[j]!;
      const rxI = rotCos[i]! * ex - rotSin[i]! * ey;
      const ryI = rotSin[i]! * ex + rotCos[i]! * ey;
      const rxJ = rotCos[j]! * ex - rotSin[j]! * ey;
      const ryJ = rotSin[j]! * ex + rotCos[j]! * ey;
      arapEnergy +=
        0.5 *
        w *
        ((dpx - rxI) ** 2 + (dpy - ryI) ** 2 + (dpx - rxJ) ** 2 + (dpy - ryJ) ** 2);
    }
  }

  const deformedVertices: Vec2Tuple[] = Array.from({ length: n }, (_, i) => [curX[i]!, curY[i]!]);
  const restTotalArea = computeMeshTotalArea(input.restVertices, input.triangles);
  const deformedTotalArea = computeMeshTotalArea(deformedVertices, input.triangles);

  return {
    vertices: deformedVertices,
    localRotationsRad,
    arapEnergy,
    restTotalArea,
    deformedTotalArea,
    areaRetentionRatio: restTotalArea > 1e-12 ? deformedTotalArea / restTotalArea : 1,
    iterationsRun: iterations,
    serverCostKrw: 0,
  };
}

/**
 * 삼각형 야코비안 극분해(Polar Decomposition) 회전·신축 분리 보간과
 * 전역 라플라시안 봉합으로 키프레임 포즈를 t ∈ [0, 1]에서 모핑한다.
 */
export function morphArapPoseKeyframes(input: ArapKeyframeMorphInput): ArapKeyframeMorphResult {
  const n = input.sourceVertices.length;
  if (input.targetVertices.length !== n) {
    throw new Error("원본 정점 수와 목표 정점 수가 일치해야 합니다.");
  }
  const t = Math.max(0, Math.min(1, input.t));
  const mCount = input.triangles.length;
  const triangleRotationsRad = new Float64Array(mCount);

  const linearVertices: Vec2Tuple[] = Array.from({ length: n }, (_, i) => {
    const s = input.sourceVertices[i]!;
    const g = input.targetVertices[i]!;
    return [(1 - t) * s[0] + t * g[0], (1 - t) * s[1] + t * g[1]];
  });

  const restTotalArea = computeMeshTotalArea(input.sourceVertices, input.triangles);
  const linearBlendTotalArea = computeMeshTotalArea(linearVertices, input.triangles);

  const triJacobians = new Float64Array(mCount * 4);
  for (let m = 0; m < mCount; m += 1) {
    const [i, j, k] = input.triangles[m]!;
    const s0 = input.sourceVertices[i]!;
    const s1 = input.sourceVertices[j]!;
    const s2 = input.sourceVertices[k]!;
    const g0 = input.targetVertices[i]!;
    const g1 = input.targetVertices[j]!;
    const g2 = input.targetVertices[k]!;

    const e01x = s1[0] - s0[0];
    const e01y = s1[1] - s0[1];
    const e02x = s2[0] - s0[0];
    const e02y = s2[1] - s0[1];
    const det0 = e01x * e02y - e02x * e01y;

    if (Math.abs(det0) < 1e-12) {
      triJacobians[m * 4] = 1;
      triJacobians[m * 4 + 3] = 1;
      continue;
    }

    const invDet = 1 / det0;
    const f1x = g1[0] - g0[0];
    const f1y = g1[1] - g0[1];
    const f2x = g2[0] - g0[0];
    const f2y = g2[1] - g0[1];

    const a00 = (f1x * e02y - f2x * e01y) * invDet;
    const a01 = (-f1x * e02x + f2x * e01x) * invDet;
    const a10 = (f1y * e02y - f2y * e01y) * invDet;
    const a11 = (-f1y * e02x + f2y * e01x) * invDet;

    const theta = Math.atan2(a10 - a01, a00 + a11);
    triangleRotationsRad[m] = theta;
    const cosTh = Math.cos(theta);
    const sinTh = Math.sin(theta);

    const s00 = cosTh * a00 + sinTh * a10;
    const s01 = cosTh * a01 + sinTh * a11;
    const s10 = -sinTh * a00 + cosTh * a10;
    const s11 = -sinTh * a01 + cosTh * a11;

    const u00 = 1 - t + t * s00;
    const u01 = t * s01;
    const u10 = t * s10;
    const u11 = 1 - t + t * s11;

    const cosT = Math.cos(t * theta);
    const sinT = Math.sin(t * theta);

    triJacobians[m * 4] = cosT * u00 - sinT * u10;
    triJacobians[m * 4 + 1] = cosT * u01 - sinT * u11;
    triJacobians[m * 4 + 2] = sinT * u00 + cosT * u10;
    triJacobians[m * 4 + 3] = sinT * u01 + cosT * u11;
  }

  if (t <= 0 || t >= 1) {
    const exactVerts = t <= 0 ? [...input.sourceVertices] : [...input.targetVertices];
    const exactArea = computeMeshTotalArea(exactVerts, input.triangles);
    return {
      vertices: exactVerts,
      t,
      restTotalArea,
      morphedTotalArea: exactArea,
      linearBlendTotalArea,
      areaRetentionRatio: restTotalArea > 1e-12 ? exactArea / restTotalArea : 1,
      linearBlendAreaRatio: restTotalArea > 1e-12 ? linearBlendTotalArea / restTotalArea : 1,
      triangleRotationsRad,
      serverCostKrw: 0,
    };
  }

  const weightMode = input.weightMode ?? "cotangent";
  const adj = buildLaplacianAdjacency(input.sourceVertices, input.triangles, weightMode);
  const rhsX = new Float64Array(n);
  const rhsY = new Float64Array(n);

  const accumulateDirectedEdge = (
    p: number,
    q: number,
    wHalf: number,
    j00: number,
    j01: number,
    j10: number,
    j11: number,
  ): void => {
    const vp = input.sourceVertices[p]!;
    const vq = input.sourceVertices[q]!;
    const ex = vp[0] - vq[0];
    const ey = vp[1] - vq[1];
    const tx = j00 * ex + j01 * ey;
    const ty = j10 * ex + j11 * ey;
    rhsX[p] = rhsX[p]! + wHalf * tx;
    rhsY[p] = rhsY[p]! + wHalf * ty;
    rhsX[q] = rhsX[q]! - wHalf * tx;
    rhsY[q] = rhsY[q]! - wHalf * ty;
  };

  for (let m = 0; m < mCount; m += 1) {
    const [i, j, k] = input.triangles[m]!;
    const pi = input.sourceVertices[i]!;
    const pj = input.sourceVertices[j]!;
    const pk = input.sourceVertices[k]!;
    const j00 = triJacobians[m * 4]!;
    const j01 = triJacobians[m * 4 + 1]!;
    const j10 = triJacobians[m * 4 + 2]!;
    const j11 = triJacobians[m * 4 + 3]!;
    const wIJ = weightMode === "uniform" ? 0.5 : cotangentHalfWeight(pi, pj, pk);
    const wJK = weightMode === "uniform" ? 0.5 : cotangentHalfWeight(pj, pk, pi);
    const wKI = weightMode === "uniform" ? 0.5 : cotangentHalfWeight(pk, pi, pj);
    accumulateDirectedEdge(i, j, wIJ, j00, j01, j10, j11);
    accumulateDirectedEdge(j, k, wJK, j00, j01, j10, j11);
    accumulateDirectedEdge(k, i, wKI, j00, j01, j10, j11);
  }

  const isPinned = new Uint8Array(n);
  const pinX = new Float64Array(n);
  const pinY = new Float64Array(n);
  for (const idx of input.anchorIndices ?? [0]) {
    if (idx >= 0 && idx < n) {
      isPinned[idx] = 1;
      pinX[idx] = linearVertices[idx]![0];
      pinY[idx] = linearVertices[idx]![1];
    }
  }
  ensureComponentPins(adj, isPinned, pinX, pinY, linearVertices);

  const initX = Float64Array.from(linearVertices.map((v) => v[0]));
  const initY = Float64Array.from(linearVertices.map((v) => v[1]));
  let solvedX = solvePinnedLaplacianPcg(adj, isPinned, pinX, rhsX, initX);
  let solvedY = solvePinnedLaplacianPcg(adj, isPinned, pinY, rhsY, initY);

  const polishSteps = Math.max(0, Math.min(20, Math.trunc(input.polishIterations ?? 0)));
  if (polishSteps > 0) {
    const pins: ArapPinConstraint[] = [];
    for (let i = 0; i < n; i += 1) {
      if (isPinned[i] === 1) pins.push({ vertexIndex: i, target: [solvedX[i]!, solvedY[i]!] });
    }
    const seedVerts: Vec2Tuple[] = Array.from({ length: n }, (_, idx) => [solvedX[idx]!, solvedY[idx]!]);
    const polished = solveArapMeshDeformation({
      restVertices: seedVerts,
      triangles: input.triangles,
      pins,
      weightMode,
      iterations: polishSteps,
    });
    solvedX = Float64Array.from(polished.vertices.map((v) => v[0]));
    solvedY = Float64Array.from(polished.vertices.map((v) => v[1]));
  }

  const morphedVertices: Vec2Tuple[] = Array.from({ length: n }, (_, i) => [solvedX[i]!, solvedY[i]!]);
  const morphedTotalArea = computeMeshTotalArea(morphedVertices, input.triangles);

  return {
    vertices: morphedVertices,
    t,
    restTotalArea,
    morphedTotalArea,
    linearBlendTotalArea,
    areaRetentionRatio: restTotalArea > 1e-12 ? morphedTotalArea / restTotalArea : 1,
    linearBlendAreaRatio: restTotalArea > 1e-12 ? linearBlendTotalArea / restTotalArea : 1,
    triangleRotationsRad,
    serverCostKrw: 0,
  };
}
