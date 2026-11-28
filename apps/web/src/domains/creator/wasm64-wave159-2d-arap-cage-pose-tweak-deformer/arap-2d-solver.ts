/**
 * Wave 159: 결정론적 2D As-Rigid-As-Possible(ARAP) 로컬-글로벌 메쉬 변형 솔버.
 *
 * - 2×2 간선 공분산 행렬의 닫힌 형태 SO(2) 극분해(`extractClosestRotation2d`, det = +1)
 * - 대칭 양의 정부호(SPD) 라플라시안 + 핀 페널티 연립방정식의 Jacobi 전처리 공액 기울기법(`solveArapGlobalStepPcg`)
 * - 프로크루스테스 강체 초기 추정 및 단조 에너지 수렴 솔버(`solveArapDeformation`)
 * - 메쉬 접힘(Fold-Over) 이진 탐색 자동 감쇠 복구(`solveSafeArapDeformation`)
 */

import type {
  ArapAdjacencyGraph,
  ArapIterationRecord,
  ArapMesh2d,
  ArapPinHandle,
  ArapSolveResult,
  ArapSolverOptions,
  Mat2,
  SafeArapOptions,
  SafeArapSolveResult,
  Vec2,
} from "./arap-deform-types";
import {
  auditArapMeshDistortion,
  computeArapEdgeWeights,
  triangleSignedArea2d,
} from "./arap-mesh-graph-and-audit";

export { auditArapMeshDistortion, computeArapEdgeWeights, triangleSignedArea2d };

const IDENTITY_MAT2: Mat2 = { m00: 1, m01: 0, m10: 0, m11: 1 };
const EPSILON = 1e-12;

/**
 * 2×2 간선 공분산 행렬 `C = sum(w * e' * e^T)`에서 최근접 SO(2) 회전 행렬을
 * 닫힌 형태 `atan2(c10 - c01, c00 + c11)`로 정확히 추출한다.
 * 반사(det = -1)로 뒤집히지 않으며 항상 `R^T R = I`, `det(R) === +1`을 만족한다.
 */
export function extractClosestRotation2d(covariance: Mat2): Mat2 {
  const cosTerm = covariance.m00 + covariance.m11;
  const sinTerm = covariance.m10 - covariance.m01;
  const mag = Math.hypot(cosTerm, sinTerm);
  if (!Number.isFinite(mag) || mag <= 1e-15) {
    return IDENTITY_MAT2;
  }
  const theta = Math.atan2(sinTerm, cosTerm);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { m00: c, m01: -s, m10: s, m11: c };
}

/** 정점별 로컬 스텝: 각 1-링 이웃에 대한 공분산 행렬로부터 최적 SO(2) 회전을 구한다. */
export function solveArapLocalStep(
  graph: ArapAdjacencyGraph,
  positions: readonly Vec2[],
): readonly Mat2[] {
  const rotations: Mat2[] = new Array<Mat2>(graph.vertexCount);
  for (let i = 0; i < graph.vertexCount; i += 1) {
    const nbrs = graph.neighbors[i];
    if (nbrs.length === 0) {
      rotations[i] = IDENTITY_MAT2;
      continue;
    }
    const pi = positions[i];
    let c00 = 0;
    let c01 = 0;
    let c10 = 0;
    let c11 = 0;
    for (let k = 0; k < nbrs.length; k += 1) {
      const nb = nbrs[k];
      const pj = positions[nb.to];
      const epx = pi.x - pj.x;
      const epy = pi.y - pj.y;
      const w = nb.weight;
      c00 += w * epx * nb.restDx;
      c01 += w * epx * nb.restDy;
      c10 += w * epy * nb.restDx;
      c11 += w * epy * nb.restDy;
    }
    rotations[i] = extractClosestRotation2d({ m00: c00, m01: c01, m10: c10, m11: c11 });
  }
  return rotations;
}

export interface ArapGlobalStepResult {
  readonly positions: readonly Vec2[];
  readonly pcgIterations: number;
  readonly pcgResidualNorm: number;
}

function solveSpdLaplacianAxisPcg(
  graph: ArapAdjacencyGraph,
  pinDiag: Float64Array,
  rhs: Float64Array,
  xInit: Float64Array,
  maxIterations: number,
  tolerance: number,
): { readonly solution: Float64Array; readonly iterations: number; readonly residualNorm: number } {
  const n = graph.vertexCount;
  const x = new Float64Array(xInit);
  const diagInv = new Float64Array(n);
  const ax = new Float64Array(n);

  const multiplyA = (vec: Float64Array, out: Float64Array): void => {
    for (let i = 0; i < n; i += 1) {
      const nbrs = graph.neighbors[i];
      const xi = vec[i];
      let sum = pinDiag[i] * xi;
      for (let k = 0; k < nbrs.length; k += 1) {
        const nb = nbrs[k];
        sum += nb.weight * (xi - vec[nb.to]);
      }
      out[i] = sum;
    }
  };

  for (let i = 0; i < n; i += 1) {
    const nbrs = graph.neighbors[i];
    let diag = pinDiag[i];
    for (let k = 0; k < nbrs.length; k += 1) {
      diag += nbrs[k].weight;
    }
    diagInv[i] = diag > EPSILON ? 1.0 / diag : 1.0;
  }

  multiplyA(x, ax);
  const r = new Float64Array(n);
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const ap = new Float64Array(n);

  let rhsNormSq = 0;
  let resNormSq = 0;
  let rzOld = 0;
  for (let i = 0; i < n; i += 1) {
    const ri = rhs[i] - ax[i];
    r[i] = ri;
    const zi = diagInv[i] * ri;
    z[i] = zi;
    p[i] = zi;
    rhsNormSq += rhs[i] * rhs[i];
    resNormSq += ri * ri;
    rzOld += ri * zi;
  }

  const rhsNorm = Math.max(1.0, Math.sqrt(rhsNormSq));
  let relRes = Math.sqrt(resNormSq) / rhsNorm;
  if (relRes <= tolerance || rzOld <= 1e-30) {
    return { solution: x, iterations: 0, residualNorm: relRes };
  }

  let iter = 0;
  for (; iter < maxIterations; iter += 1) {
    multiplyA(p, ap);
    let pAp = 0;
    for (let i = 0; i < n; i += 1) {
      pAp += p[i] * ap[i];
    }
    if (!Number.isFinite(pAp) || pAp <= 1e-30) {
      break;
    }
    const alpha = rzOld / pAp;
    resNormSq = 0;
    let rzNew = 0;
    for (let i = 0; i < n; i += 1) {
      x[i] += alpha * p[i];
      const ri = r[i] - alpha * ap[i];
      r[i] = ri;
      const zi = diagInv[i] * ri;
      z[i] = zi;
      resNormSq += ri * ri;
      rzNew += ri * zi;
    }
    relRes = Math.sqrt(resNormSq) / rhsNorm;
    if (relRes <= tolerance || rzNew <= 1e-30) {
      iter += 1;
      break;
    }
    const beta = rzNew / rzOld;
    for (let i = 0; i < n; i += 1) {
      p[i] = z[i] + beta * p[i];
    }
    rzOld = rzNew;
  }

  return { solution: x, iterations: iter, residualNorm: relRes };
}

/**
 * ARAP 글로벌 스텝: 고정된 로컬 회전 `rotations`에 대해 희소 SPD 라플라시안 + 핀 페널티
 * 선형 연립방정식 `(L + diag(Lambda)) p' = b(R) + Lambda_rhs`를 Jacobi-PCG로 푼다.
 */
export function solveArapGlobalStepPcg(
  graph: ArapAdjacencyGraph,
  rotations: readonly Mat2[],
  handles: readonly ArapPinHandle[],
  warmStartPositions: readonly Vec2[],
  options?: {
    readonly pcgMaxIterations?: number;
    readonly pcgTolerance?: number;
    readonly defaultPinWeight?: number;
  },
): ArapGlobalStepResult {
  const n = graph.vertexCount;
  const maxIter = Math.max(32, options?.pcgMaxIterations ?? Math.max(256, n * 4));
  const tol = Math.max(1e-14, options?.pcgTolerance ?? 1e-10);
  const fallbackWeight = Math.max(1e-3, options?.defaultPinWeight ?? 2500);

  const pinDiag = new Float64Array(n);
  const rhsX = new Float64Array(n);
  const rhsY = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    const nbrs = graph.neighbors[i];
    const ri = rotations[i];
    let bx = 0;
    let by = 0;
    for (let k = 0; k < nbrs.length; k += 1) {
      const nb = nbrs[k];
      const rj = rotations[nb.to];
      const hw = 0.5 * nb.weight;
      bx += hw * ((ri.m00 + rj.m00) * nb.restDx + (ri.m01 + rj.m01) * nb.restDy);
      by += hw * ((ri.m10 + rj.m10) * nb.restDx + (ri.m11 + rj.m11) * nb.restDy);
    }
    rhsX[i] = bx;
    rhsY[i] = by;
  }

  for (let h = 0; h < handles.length; h += 1) {
    const handle = handles[h];
    if (handle.vertexIndex < 0 || handle.vertexIndex >= n) {
      continue;
    }
    const w = Number.isFinite(handle.weight) && handle.weight > 0 ? handle.weight : fallbackWeight;
    pinDiag[handle.vertexIndex] += w;
    rhsX[handle.vertexIndex] += w * handle.target.x;
    rhsY[handle.vertexIndex] += w * handle.target.y;
  }

  // 연결 요소 중 핀이 없는 고립 성분은 첫 정점을 현재 위치로 미세 고정해 SPD 보장
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  for (let start = 0; start < n; start += 1) {
    if (visited[start] !== 0) {
      continue;
    }
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;
    let hasPin = pinDiag[start] > 0;
    while (head < tail) {
      const cur = queue[head];
      head += 1;
      const nbrs = graph.neighbors[cur];
      for (let k = 0; k < nbrs.length; k += 1) {
        const nxt = nbrs[k].to;
        if (visited[nxt] === 0) {
          visited[nxt] = 1;
          if (pinDiag[nxt] > 0) {
            hasPin = true;
          }
          queue[tail] = nxt;
          tail += 1;
        }
      }
    }
    if (!hasPin) {
      pinDiag[start] += 1.0;
      rhsX[start] += warmStartPositions[start].x;
      rhsY[start] += warmStartPositions[start].y;
    }
  }

  const initX = new Float64Array(n);
  const initY = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    initX[i] = warmStartPositions[i].x;
    initY[i] = warmStartPositions[i].y;
  }

  const resX = solveSpdLaplacianAxisPcg(graph, pinDiag, rhsX, initX, maxIter, tol);
  const resY = solveSpdLaplacianAxisPcg(graph, pinDiag, rhsY, initY, maxIter, tol);

  const nextPositions: Vec2[] = new Array<Vec2>(n);
  for (let i = 0; i < n; i += 1) {
    nextPositions[i] = { x: resX.solution[i], y: resY.solution[i] };
  }

  return {
    positions: nextPositions,
    pcgIterations: Math.max(resX.iterations, resY.iterations),
    pcgResidualNorm: Math.max(resX.residualNorm, resY.residualNorm),
  };
}

function computeArapEnergies(
  graph: ArapAdjacencyGraph,
  positions: readonly Vec2[],
  rotations: readonly Mat2[],
  handles: readonly ArapPinHandle[],
  fallbackPinWeight: number,
): { readonly arapEnergy: number; readonly pinPenaltyEnergy: number; readonly totalEnergy: number } {
  let arapSum = 0;
  for (let i = 0; i < graph.vertexCount; i += 1) {
    const nbrs = graph.neighbors[i];
    const pi = positions[i];
    const ri = rotations[i];
    for (let k = 0; k < nbrs.length; k += 1) {
      const nb = nbrs[k];
      const pj = positions[nb.to];
      const diffX = pi.x - pj.x - (ri.m00 * nb.restDx + ri.m01 * nb.restDy);
      const diffY = pi.y - pj.y - (ri.m10 * nb.restDx + ri.m11 * nb.restDy);
      arapSum += nb.weight * (diffX * diffX + diffY * diffY);
    }
  }
  const arapEnergy = 0.25 * arapSum;

  let pinSum = 0;
  for (let h = 0; h < handles.length; h += 1) {
    const handle = handles[h];
    if (handle.vertexIndex < 0 || handle.vertexIndex >= graph.vertexCount) {
      continue;
    }
    const w =
      Number.isFinite(handle.weight) && handle.weight > 0 ? handle.weight : fallbackPinWeight;
    const p = positions[handle.vertexIndex];
    const dx = p.x - handle.target.x;
    const dy = p.y - handle.target.y;
    pinSum += w * (dx * dx + dy * dy);
  }
  const pinPenaltyEnergy = 0.5 * pinSum;
  return { arapEnergy, pinPenaltyEnergy, totalEnergy: arapEnergy + pinPenaltyEnergy };
}

function buildRigidProcrustesWarmStart(
  mesh: ArapMesh2d,
  handles: readonly ArapPinHandle[],
  fallbackPinWeight: number,
): readonly Vec2[] {
  const valid = handles.filter(
    (h) => h.vertexIndex >= 0 && h.vertexIndex < mesh.vertices.length,
  );
  if (valid.length === 0) {
    return mesh.vertices.map((v) => ({ x: v.x, y: v.y }));
  }
  if (valid.length === 1) {
    const h = valid[0];
    const rest = mesh.vertices[h.vertexIndex];
    const dx = h.target.x - rest.x;
    const dy = h.target.y - rest.y;
    return mesh.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy }));
  }

  let wSum = 0;
  let restCx = 0;
  let restCy = 0;
  let targetCx = 0;
  let targetCy = 0;
  for (let i = 0; i < valid.length; i += 1) {
    const h = valid[i];
    const w = Number.isFinite(h.weight) && h.weight > 0 ? h.weight : fallbackPinWeight;
    const rv = mesh.vertices[h.vertexIndex];
    wSum += w;
    restCx += w * rv.x;
    restCy += w * rv.y;
    targetCx += w * h.target.x;
    targetCy += w * h.target.y;
  }
  restCx /= wSum;
  restCy /= wSum;
  targetCx /= wSum;
  targetCy /= wSum;

  let c00 = 0;
  let c01 = 0;
  let c10 = 0;
  let c11 = 0;
  for (let i = 0; i < valid.length; i += 1) {
    const h = valid[i];
    const w = Number.isFinite(h.weight) && h.weight > 0 ? h.weight : fallbackPinWeight;
    const rv = mesh.vertices[h.vertexIndex];
    const px = rv.x - restCx;
    const py = rv.y - restCy;
    const tx = h.target.x - targetCx;
    const ty = h.target.y - targetCy;
    c00 += w * tx * px;
    c01 += w * tx * py;
    c10 += w * ty * px;
    c11 += w * ty * py;
  }

  const rot = extractClosestRotation2d({ m00: c00, m01: c01, m10: c10, m11: c11 });
  const tx = targetCx - (rot.m00 * restCx + rot.m01 * restCy);
  const ty = targetCy - (rot.m10 * restCx + rot.m11 * restCy);
  return mesh.vertices.map((v) => ({
    x: rot.m00 * v.x + rot.m01 * v.y + tx,
    y: rot.m10 * v.x + rot.m11 * v.y + ty,
  }));
}

/**
 * 2D ARAP 로컬-글로벌 변형 솔버 실행기.
 * 프로크루스테스 강체 초기 추정 후 로컬 회전 추출과 글로벌 PCG 해법을 교대 실행하며
 * 매 반복의 총 에너지 단조 감소와 수렴 여부를 추적한다.
 */
export function solveArapDeformation(
  mesh: ArapMesh2d,
  handles: readonly ArapPinHandle[],
  options?: ArapSolverOptions,
): ArapSolveResult {
  const maxIterations = Math.max(1, options?.maxIterations ?? 24);
  const energyTolerance = Math.max(1e-14, options?.energyTolerance ?? 1e-6);
  const defaultPinWeight = Math.max(1e-3, options?.defaultPinWeight ?? 2500);

  const graph = computeArapEdgeWeights(mesh, {
    minCotangentWeight: options?.minCotangentWeight,
    useCotangentWeights: options?.useCotangentWeights,
  });

  if (handles.length === 0 || mesh.vertices.length === 0) {
    const restPositions = mesh.vertices.map((v) => ({ x: v.x, y: v.y }));
    return {
      deformedPositions: restPositions,
      localRotations: mesh.vertices.map(() => IDENTITY_MAT2),
      iterations: [],
      converged: true,
      initialEnergy: 0,
      finalEnergy: 0,
      audit: auditArapMeshDistortion(mesh, restPositions, handles),
    };
  }

  let currentPositions: readonly Vec2[] =
    options?.initialPositions && options.initialPositions.length === mesh.vertices.length
      ? options.initialPositions.map((p) => ({ x: p.x, y: p.y }))
      : buildRigidProcrustesWarmStart(mesh, handles, defaultPinWeight);

  let currentRotations = solveArapLocalStep(graph, currentPositions);
  const initialEval = computeArapEnergies(
    graph,
    currentPositions,
    currentRotations,
    handles,
    defaultPinWeight,
  );
  const initialEnergy = initialEval.totalEnergy;

  const iterations: ArapIterationRecord[] = [];
  let prevTotalEnergy = initialEnergy;
  let converged = initialEnergy <= energyTolerance;

  if (converged) {
    iterations.push({
      iteration: 1,
      arapEnergy: initialEval.arapEnergy,
      pinPenaltyEnergy: initialEval.pinPenaltyEnergy,
      totalEnergy: initialEval.totalEnergy,
      maxVertexDelta: 0,
      pcgIterations: 0,
      pcgResidualNorm: 0,
    });
  } else {
    for (let iter = 1; iter <= maxIterations; iter += 1) {
      const globalStep = solveArapGlobalStepPcg(
        graph,
        currentRotations,
        handles,
        currentPositions,
        {
          pcgMaxIterations: options?.pcgMaxIterations,
          pcgTolerance: options?.pcgTolerance,
          defaultPinWeight,
        },
      );

      let maxVertexDelta = 0;
      for (let i = 0; i < currentPositions.length; i += 1) {
        const d = Math.hypot(
          globalStep.positions[i].x - currentPositions[i].x,
          globalStep.positions[i].y - currentPositions[i].y,
        );
        if (d > maxVertexDelta) {
          maxVertexDelta = d;
        }
      }

      currentPositions = globalStep.positions;
      currentRotations = solveArapLocalStep(graph, currentPositions);
      const evalEnergy = computeArapEnergies(
        graph,
        currentPositions,
        currentRotations,
        handles,
        defaultPinWeight,
      );

      iterations.push({
        iteration: iter,
        arapEnergy: evalEnergy.arapEnergy,
        pinPenaltyEnergy: evalEnergy.pinPenaltyEnergy,
        totalEnergy: evalEnergy.totalEnergy,
        maxVertexDelta,
        pcgIterations: globalStep.pcgIterations,
        pcgResidualNorm: globalStep.pcgResidualNorm,
      });

      const relEnergyDrop =
        Math.abs(prevTotalEnergy - evalEnergy.totalEnergy) / Math.max(1.0, prevTotalEnergy);
      prevTotalEnergy = evalEnergy.totalEnergy;

      if (
        evalEnergy.totalEnergy <= energyTolerance ||
        (relEnergyDrop <= energyTolerance && maxVertexDelta <= 1e-4)
      ) {
        converged = true;
        break;
      }
    }
  }

  const finalEnergy =
    iterations.length > 0 ? iterations[iterations.length - 1].totalEnergy : initialEnergy;

  return {
    deformedPositions: currentPositions,
    localRotations: currentRotations,
    iterations,
    converged,
    initialEnergy,
    finalEnergy,
    audit: auditArapMeshDistortion(mesh, currentPositions, handles),
  };
}

function scaleHandlesTowardRest(
  mesh: ArapMesh2d,
  handles: readonly ArapPinHandle[],
  scale: number,
): readonly ArapPinHandle[] {
  return handles.map((handle) => {
    if (handle.vertexIndex < 0 || handle.vertexIndex >= mesh.vertices.length) {
      return handle;
    }
    const rest = mesh.vertices[handle.vertexIndex];
    return {
      ...handle,
      target: {
        x: rest.x + scale * (handle.target.x - rest.x),
        y: rest.y + scale * (handle.target.y - rest.y),
      },
    };
  });
}

/**
 * 메쉬 접힘(삼각형 뒤집힘) 자동 복구 기능이 포함된 안전 ARAP 변형 실행기.
 * 전체 핸들 변위에서 `invertedTriangleCount > 0`이 감지되면 이진 탐색으로
 * 뒤집힘이 0이 되는 최대 안전 변위 비율을 자동 계산한다.
 */
export function solveSafeArapDeformation(
  mesh: ArapMesh2d,
  handles: readonly ArapPinHandle[],
  options?: SafeArapOptions,
): SafeArapSolveResult {
  const fullResult = solveArapDeformation(mesh, handles, options);
  const rawInvertedTriangleCount = fullResult.audit.invertedTriangleCount;

  if (rawInvertedTriangleCount === 0) {
    return {
      ...fullResult,
      appliedDisplacementScale: 1,
      dampingTriggered: false,
      dampingAttempts: 0,
      rawInvertedTriangleCount: 0,
      effectiveHandles: handles,
    };
  }

  const maxSteps = Math.max(4, options?.maxDampingSteps ?? 12);
  const restPositions = mesh.vertices.map((v) => ({ x: v.x, y: v.y }));
  const zeroHandles = scaleHandlesTowardRest(mesh, handles, 0);
  let bestSafeResult = solveArapDeformation(mesh, zeroHandles, {
    ...options,
    initialPositions: restPositions,
  });
  let bestScale = 0;
  let bestHandles: readonly ArapPinHandle[] = zeroHandles;

  let low = 0;
  let high = 1;
  let attempts = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    const mid = 0.5 * (low + high);
    const scaledHandles = scaleHandlesTowardRest(mesh, handles, mid);
    const candidate = solveArapDeformation(mesh, scaledHandles, {
      ...options,
      initialPositions: restPositions,
    });
    attempts += 1;

    if (candidate.audit.invertedTriangleCount === 0) {
      low = mid;
      bestScale = mid;
      bestSafeResult = candidate;
      bestHandles = scaledHandles;
    } else {
      high = mid;
    }
  }

  return {
    ...bestSafeResult,
    appliedDisplacementScale: bestScale,
    dampingTriggered: true,
    dampingAttempts: attempts,
    rawInvertedTriangleCount,
    effectiveHandles: bestHandles,
  };
}
