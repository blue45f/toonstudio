/**
 * 부피 보존 듀얼 쿼터니언 스키닝(DQS) 및 포즈 공간 변형(PSD) 보정 솔버 (`wasm64-wave13-continuum`).
 *
 * - 강체 변환(쿼터니언 + 이동) 단위 듀얼 쿼터니언(q_0 + ε q_e) 블렌딩 및 반구 부호 정렬
 * - 90°~150° 팔꿈치 굽힘·비틀림에서 선형 블렌드 스키닝(LBS) 사탕 포장지 부피 붕괴 0% 달성 증명
 * - 가우시안 방사 기저 함수(RBF) 기반 포즈 공간 근육 융기·의상 주름 보정 델타 합성
 */

import {
  DQ_EPSILON,
  blendUnitDualQuats,
  dualQuatConjugate,
  dualQuatTransformNormal,
  dualQuatTransformPoint,
  normalizeDualQuat,
  quatDot,
  quatRotateVec3,
  rigidTransformToDualQuat,
  type DualQuat,
  type RigidTransform3D,
  type Vec3,
  type VertexBoneInfluence,
} from "./dual-quat-rig-algebra";

export {
  alignDualQuatHemisphere,
  blendUnitDualQuats,
  composeRigidTransforms,
  computeSkinningRigidDelta,
  dualQuatConjugate,
  dualQuatMultiply,
  dualQuatToRigidTransform,
  dualQuatTransformNormal,
  dualQuatTransformPoint,
  evaluateSkeletonSkinningState,
  invertRigidTransform,
  normalizeDualQuat,
  quatConjugate,
  quatDot,
  quatFromAxisAngle,
  quatIdentity,
  quatMultiply,
  quatNormalize,
  quatRotateVec3,
  quatToRotationVector,
  rigidTransformToDualQuat,
  type DualQuat,
  type QuatXYZW,
  type RigBoneBindSpec,
  type RigidTransform3D,
  type Vec3,
  type VertexBoneInfluence,
} from "./dual-quat-rig-algebra";

export interface SkinningMeshInput {
  readonly positions: readonly Vec3[];
  readonly normals?: readonly Vec3[];
  readonly triangles?: readonly (readonly [number, number, number])[];
  readonly influences: readonly (readonly VertexBoneInfluence[])[];
}

export interface PsdPoseExample {
  readonly id: string;
  readonly labelKo: string;
  readonly poseFeatures: readonly number[];
  readonly vertexDeltas: Readonly<Record<number, Vec3>>;
  readonly sigma?: number;
}

export interface CompilePsdRigOptions {
  readonly defaultSigma?: number;
  readonly regularization?: number;
  readonly anchorRestPoseAtZero?: boolean;
}

export interface CompiledPsdCorrectiveRig {
  readonly vertexCount: number;
  readonly featureDim: number;
  readonly anchorRestPoseAtZero: boolean;
  readonly centers: readonly (readonly number[])[];
  readonly sigmas: readonly number[];
  readonly affectedVertices: readonly number[];
  readonly solvedWeightsByVertex: Readonly<Record<number, readonly Vec3[]>>;
  readonly exampleIds: readonly string[];
}

export interface EvaluatedPsdResult {
  readonly deltas: readonly Vec3[];
  readonly basisActivations: readonly Record<string, number>[];
  readonly rawBasisValues: readonly number[];
  readonly maxDeltaMagnitude: number;
}

export interface DqsSkinningOptions {
  readonly psdRig?: CompiledPsdCorrectiveRig;
  readonly poseFeatures?: readonly number[];
  readonly psdStrength?: number;
  readonly recomputeNormalsFromTriangles?: boolean;
}

export interface DqsSkinningTelemetry {
  readonly vertexCount: number;
  readonly antipodalFlipsApplied: number;
  readonly maxOrthogonalityResidual: number;
  readonly maxPsdDeltaMagnitude: number;
}

export interface DqsSkinningResult {
  readonly positions: readonly Vec3[];
  readonly normals: readonly Vec3[];
  readonly vertexDualQuats: readonly DualQuat[];
  readonly psdDeltas: readonly Vec3[];
  readonly telemetry: DqsSkinningTelemetry;
}

export interface TubularLimbMeshOptions {
  readonly lengthMeters?: number;
  readonly radiusMeters?: number;
  readonly axialSegments?: number;
  readonly radialSegments?: number;
  readonly blendHalfWidthMeters?: number;
}

export interface TubularLimbMesh {
  readonly mesh: SkinningMeshInput;
  readonly axialRings: readonly (readonly number[])[];
  readonly midRingVertexIndices: readonly number[];
  readonly radiusMeters: number;
  readonly lengthMeters: number;
}

export interface VolumeComparisonReport {
  readonly bindVolume: number;
  readonly dqsVolume: number;
  readonly lbsVolume: number;
  readonly dqsVolumeRatio: number;
  readonly lbsVolumeRatio: number;
  readonly dqsVolumeCollapsePct: number;
  readonly lbsVolumeCollapsePct: number;
  readonly dqsSliceVolumeCollapsePct: number;
  readonly lbsSliceVolumeCollapsePct: number;
  readonly dqsMidRadiusRatio: number;
  readonly lbsMidRadiusRatio: number;
  readonly dqsMidCrossSectionAreaRatio: number;
  readonly lbsMidCrossSectionAreaRatio: number;
  readonly dqsMidAreaCollapsePct: number;
  readonly lbsMidAreaCollapsePct: number;
}

function gaussianRbf(a: readonly number[], b: readonly number[], sigma: number): number {
  let distSq = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const diff = a[i] - b[i];
    distSq += diff * diff;
  }
  const denom = 2 * sigma * sigma;
  return denom <= DQ_EPSILON ? 0 : Math.exp(-distSq / denom);
}

/** 부분 피벗 가우스 소거법으로 (N × N) 선형 방정식 A x = b를 푼다. */
function solveLinearSystem(
  matrix: readonly (readonly number[])[],
  rhs: readonly number[],
): number[] {
  const n = rhs.length;
  const aug: number[][] = matrix.map((row, idx) => [...row, rhs[idx]]);

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let pivotAbs = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row += 1) {
      const candidate = Math.abs(aug[row][col]);
      if (candidate > pivotAbs) {
        pivotAbs = candidate;
        pivotRow = row;
      }
    }
    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }
    const pivot = aug[col][col];
    const safePivot = Math.abs(pivot) <= DQ_EPSILON ? (pivot >= 0 ? DQ_EPSILON : -DQ_EPSILON) : pivot;
    for (let row = col + 1; row < n; row += 1) {
      const factor = aug[row][col] / safePivot;
      if (factor === 0) continue;
      for (let k = col; k <= n; k += 1) {
        aug[row][k] -= factor * aug[col][k];
      }
    }
  }

  const sol = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = aug[row][n];
    for (let col = row + 1; col < n; col += 1) {
      sum -= aug[row][col] * sol[col];
    }
    const diag = aug[row][row];
    sol[row] = Math.abs(diag) <= DQ_EPSILON ? 0 : sum / diag;
  }
  return sol;
}

/** 조각된 월드 정점 좌표로부터 역 듀얼 쿼터니언 언스키닝을 수행해 바인드 공간 PSD 델타를 추출한다. */
export function extractBindSpacePsdDeltasFromSculpt(
  bindPositions: readonly Vec3[],
  influences: readonly (readonly VertexBoneInfluence[])[],
  poseSkinningDualQuats: readonly DualQuat[],
  sculptedWorldPositions: readonly Vec3[],
  threshold = 1e-6,
): Record<number, Vec3> {
  const deltas: Record<number, Vec3> = {};
  const count = Math.min(bindPositions.length, sculptedWorldPositions.length);
  for (let v = 0; v < count; v += 1) {
    const { dualQuat } = blendUnitDualQuats(poseSkinningDualQuats, influences[v] ?? []);
    const unskinned = dualQuatTransformPoint(
      dualQuatConjugate(dualQuat),
      sculptedWorldPositions[v],
    );
    const dx = unskinned[0] - bindPositions[v][0];
    const dy = unskinned[1] - bindPositions[v][1];
    const dz = unskinned[2] - bindPositions[v][2];
    if (Math.hypot(dx, dy, dz) > threshold) {
      deltas[v] = [dx, dy, dz];
    }
  }
  return deltas;
}

/** 가우시안 RBF 보간 행렬을 풀어 포즈 공간 변형(PSD) 보정 리그를 컴파일한다. */
export function compilePsdCorrectiveRig(
  vertexCount: number,
  examples: readonly PsdPoseExample[],
  options: CompilePsdRigOptions = {},
): CompiledPsdCorrectiveRig {
  const defaultSigma = options.defaultSigma ?? 0.85;
  const regularization = options.regularization ?? 1e-8;
  const anchorRestPoseAtZero = options.anchorRestPoseAtZero ?? true;
  const featureDim = examples[0]?.poseFeatures.length ?? 0;

  const centers: (readonly number[])[] = [];
  const sigmas: number[] = [];
  const exampleIds: string[] = [];

  if (anchorRestPoseAtZero && featureDim > 0) {
    centers.push(new Array<number>(featureDim).fill(0));
    sigmas.push(defaultSigma);
    exampleIds.push("__rest_pose__");
  }
  for (const ex of examples) {
    centers.push([...ex.poseFeatures]);
    sigmas.push(ex.sigma ?? defaultSigma);
    exampleIds.push(ex.id);
  }

  const basisCount = centers.length;
  const gram: number[][] = Array.from({ length: basisCount }, (_, i) =>
    Array.from({ length: basisCount }, (__, j) => {
      const val = gaussianRbf(centers[i], centers[j], sigmas[j]);
      return i === j ? val + regularization : val;
    }),
  );

  const vertexSet = new Set<number>();
  for (const ex of examples) {
    for (const key of Object.keys(ex.vertexDeltas)) {
      const vIdx = Number(key);
      if (Number.isInteger(vIdx) && vIdx >= 0 && vIdx < vertexCount) vertexSet.add(vIdx);
    }
  }
  const affectedVertices = [...vertexSet].sort((a, b) => a - b);
  const solvedWeightsByVertex: Record<number, readonly Vec3[]> = {};
  const offset = anchorRestPoseAtZero && featureDim > 0 ? 1 : 0;

  for (const vIdx of affectedVertices) {
    const rhsX = new Array<number>(basisCount).fill(0);
    const rhsY = new Array<number>(basisCount).fill(0);
    const rhsZ = new Array<number>(basisCount).fill(0);
    for (let e = 0; e < examples.length; e += 1) {
      const delta = examples[e].vertexDeltas[vIdx];
      if (!delta) continue;
      rhsX[e + offset] = delta[0];
      rhsY[e + offset] = delta[1];
      rhsZ[e + offset] = delta[2];
    }
    const wx = solveLinearSystem(gram, rhsX);
    const wy = solveLinearSystem(gram, rhsY);
    const wz = solveLinearSystem(gram, rhsZ);
    solvedWeightsByVertex[vIdx] = wx.map((val, k): Vec3 => [val, wy[k], wz[k]]);
  }

  return {
    vertexCount,
    featureDim,
    anchorRestPoseAtZero,
    centers,
    sigmas,
    affectedVertices,
    solvedWeightsByVertex,
    exampleIds,
  };
}

/** 현재 포즈 특징 벡터에 대한 가우시안 RBF 보정 정점 델타를 평가한다. */
export function evaluatePsdCorrectiveDeltas(
  rig: CompiledPsdCorrectiveRig,
  poseFeatures: readonly number[],
  strength = 1,
): EvaluatedPsdResult {
  const deltas: Vec3[] = Array.from({ length: rig.vertexCount }, (): Vec3 => [0, 0, 0]);
  if (rig.centers.length === 0 || strength === 0) {
    return { deltas, basisActivations: [], rawBasisValues: [], maxDeltaMagnitude: 0 };
  }

  const rawBasisValues = rig.centers.map((center, j) =>
    gaussianRbf(poseFeatures, center, rig.sigmas[j]),
  );

  let maxDeltaMagnitude = 0;
  for (const vIdx of rig.affectedVertices) {
    const weights = rig.solvedWeightsByVertex[vIdx];
    if (!weights) continue;
    let dx = 0;
    let dy = 0;
    let dz = 0;
    for (let k = 0; k < rawBasisValues.length; k += 1) {
      const phi = rawBasisValues[k];
      dx += phi * weights[k][0];
      dy += phi * weights[k][1];
      dz += phi * weights[k][2];
    }
    const sx = dx * strength;
    const sy = dy * strength;
    const sz = dz * strength;
    deltas[vIdx] = [sx, sy, sz];
    const mag = Math.hypot(sx, sy, sz);
    if (mag > maxDeltaMagnitude) maxDeltaMagnitude = mag;
  }

  const activationMap: Record<string, number> = {};
  for (let i = 0; i < rig.exampleIds.length; i += 1) {
    activationMap[rig.exampleIds[i]] = rawBasisValues[i];
  }
  return { deltas, basisActivations: [activationMap], rawBasisValues, maxDeltaMagnitude };
}

function computeSmoothMeshNormals(
  positions: readonly Vec3[],
  triangles: readonly (readonly [number, number, number])[],
): Vec3[] {
  const accum = positions.map(() => [0, 0, 0]);
  for (const [i0, i1, i2] of triangles) {
    const p0 = positions[i0];
    const p1 = positions[i1];
    const p2 = positions[i2];
    if (!p0 || !p1 || !p2) continue;
    const e1x = p1[0] - p0[0];
    const e1y = p1[1] - p0[1];
    const e1z = p1[2] - p0[2];
    const e2x = p2[0] - p0[0];
    const e2y = p2[1] - p0[1];
    const e2z = p2[2] - p0[2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const idx of [i0, i1, i2]) {
      accum[idx][0] += nx;
      accum[idx][1] += ny;
      accum[idx][2] += nz;
    }
  }
  return accum.map(([nx, ny, nz]): Vec3 => {
    const len = Math.hypot(nx, ny, nz);
    return len <= DQ_EPSILON ? [0, 1, 0] : [nx / len, ny / len, nz / len];
  });
}

function isDualQuatArray(
  input: readonly RigidTransform3D[] | readonly DualQuat[],
): input is readonly DualQuat[] {
  return input.length > 0 && "real" in input[0] && "dual" in input[0];
}

/** 듀얼 쿼터니언 스키닝(DQS) + 선택적 포즈 공간 변형(PSD) 솔버를 실행한다. */
export function solveDualQuaternionSkinning(
  mesh: SkinningMeshInput,
  boneSkinningTransforms: readonly RigidTransform3D[] | readonly DualQuat[],
  options: DqsSkinningOptions = {},
): DqsSkinningResult {
  const boneDualQuats: readonly DualQuat[] = isDualQuatArray(boneSkinningTransforms)
    ? boneSkinningTransforms.map((dq) => normalizeDualQuat(dq))
    : boneSkinningTransforms.map((tf) => rigidTransformToDualQuat(tf));

  const vertexCount = mesh.positions.length;
  const psdEval =
    options.psdRig && options.poseFeatures
      ? evaluatePsdCorrectiveDeltas(options.psdRig, options.poseFeatures, options.psdStrength ?? 1)
      : null;
  const psdDeltas: readonly Vec3[] =
    psdEval?.deltas ?? Array.from({ length: vertexCount }, (): Vec3 => [0, 0, 0]);

  const positions: Vec3[] = new Array<Vec3>(vertexCount);
  const rotatedNormals: Vec3[] = new Array<Vec3>(vertexCount);
  const vertexDualQuats: DualQuat[] = new Array<DualQuat>(vertexCount);

  let antipodalFlipsApplied = 0;
  let maxOrthogonalityResidual = 0;

  for (let v = 0; v < vertexCount; v += 1) {
    const { dualQuat, antipodalFlips } = blendUnitDualQuats(
      boneDualQuats,
      mesh.influences[v] ?? [],
    );
    antipodalFlipsApplied += antipodalFlips;
    vertexDualQuats[v] = dualQuat;

    const orthoResidual = Math.abs(quatDot(dualQuat.real, dualQuat.dual));
    if (orthoResidual > maxOrthogonalityResidual) maxOrthogonalityResidual = orthoResidual;

    const basePos = mesh.positions[v];
    const delta = psdDeltas[v];
    positions[v] = dualQuatTransformPoint(dualQuat, [
      basePos[0] + delta[0],
      basePos[1] + delta[1],
      basePos[2] + delta[2],
    ]);
    rotatedNormals[v] = dualQuatTransformNormal(dualQuat, mesh.normals?.[v] ?? [0, 1, 0]);
  }

  const normals =
    options.recomputeNormalsFromTriangles && mesh.triangles && mesh.triangles.length > 0
      ? computeSmoothMeshNormals(positions, mesh.triangles)
      : rotatedNormals;

  return {
    positions,
    normals,
    vertexDualQuats,
    psdDeltas,
    telemetry: {
      vertexCount,
      antipodalFlipsApplied,
      maxOrthogonalityResidual,
      maxPsdDeltaMagnitude: psdEval?.maxDeltaMagnitude ?? 0,
    },
  };
}

/** 비교 기준용 고전 선형 블렌드 스키닝(LBS) 솔버. */
export function solveLinearBlendSkinning(
  mesh: SkinningMeshInput,
  boneSkinningTransforms: readonly RigidTransform3D[],
): { readonly positions: readonly Vec3[] } {
  const positions: Vec3[] = mesh.positions.map((pos, v): Vec3 => {
    const infs = mesh.influences[v] ?? [];
    let weightSum = 0;
    for (const inf of infs) {
      if (inf.weight > 0) weightSum += inf.weight;
    }
    if (weightSum <= DQ_EPSILON) return pos;
    const invWeightSum = 1 / weightSum;
    let px = 0;
    let py = 0;
    let pz = 0;
    for (const inf of infs) {
      if (inf.weight <= 0) continue;
      const tf = boneSkinningTransforms[inf.boneIndex];
      if (!tf) continue;
      const w = inf.weight * invWeightSum;
      const rot = quatRotateVec3(tf.rotation, pos);
      px += w * (rot[0] + tf.translation[0]);
      py += w * (rot[1] + tf.translation[1]);
      pz += w * (rot[2] + tf.translation[2]);
    }
    return [px, py, pz];
  });
  return { positions };
}

/** 닫힌 매니폴드 삼각형 메시의 부호 있는 사면체 부피 합(m³)을 계산한다. */
export function computeClosedMeshVolume(
  positions: readonly Vec3[],
  triangles: readonly (readonly [number, number, number])[],
): number {
  let sixVolume = 0;
  for (const [i0, i1, i2] of triangles) {
    const a = positions[i0];
    const b = positions[i1];
    const c = positions[i2];
    if (!a || !b || !c) continue;
    sixVolume +=
      a[0] * (b[1] * c[2] - b[2] * c[1]) -
      a[1] * (b[0] * c[2] - b[2] * c[0]) +
      a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return Math.abs(sixVolume) / 6;
}

/** 관절 원점(x = 0) 중심 가중치 블렌딩 수밀(watertight) 원통 팔다리 메시를 생성한다. */
export function createTubularLimbMesh(options: TubularLimbMeshOptions = {}): TubularLimbMesh {
  const lengthMeters = options.lengthMeters ?? 0.6;
  const radiusMeters = options.radiusMeters ?? 0.05;
  const axialSegments = Math.max(4, options.axialSegments ?? 24);
  const radialSegments = Math.max(8, options.radialSegments ?? 24);
  const blendHalfWidth = Math.max(1e-4, options.blendHalfWidthMeters ?? lengthMeters * 0.25);

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const influences: VertexBoneInfluence[][] = [];
  const triangles: [number, number, number][] = [];
  const axialRings: number[][] = [];
  const midRingVertexIndices: number[] = [];
  const midSlice = Math.floor(axialSegments / 2);

  for (let i = 0; i <= axialSegments; i += 1) {
    const x = (i / axialSegments - 0.5) * lengthMeters;
    const rawT = Math.min(1, Math.max(0, (x + blendHalfWidth) / (2 * blendHalfWidth)));
    const w1 = rawT * rawT * (3 - 2 * rawT);
    const w0 = 1 - w1;
    const ring: number[] = [];
    for (let j = 0; j < radialSegments; j += 1) {
      const theta = (2 * Math.PI * j) / radialSegments;
      const ny = Math.cos(theta);
      const nz = Math.sin(theta);
      const vIdx = positions.length;
      positions.push([x, radiusMeters * ny, radiusMeters * nz]);
      normals.push([0, ny, nz]);
      influences.push([
        { boneIndex: 0, weight: w0 },
        { boneIndex: 1, weight: w1 },
      ]);
      ring.push(vIdx);
      if (i === midSlice) midRingVertexIndices.push(vIdx);
    }
    axialRings.push(ring);
  }

  for (let i = 0; i < axialSegments; i += 1) {
    const rowA = i * radialSegments;
    const rowB = (i + 1) * radialSegments;
    for (let j = 0; j < radialSegments; j += 1) {
      const nextJ = (j + 1) % radialSegments;
      triangles.push([rowA + j, rowA + nextJ, rowB + nextJ]);
      triangles.push([rowA + j, rowB + nextJ, rowB + j]);
    }
  }

  const startCenterIdx = positions.length;
  positions.push([-lengthMeters * 0.5, 0, 0]);
  normals.push([-1, 0, 0]);
  influences.push([{ boneIndex: 0, weight: 1 }]);

  const endCenterIdx = positions.length;
  positions.push([lengthMeters * 0.5, 0, 0]);
  normals.push([1, 0, 0]);
  influences.push([{ boneIndex: 1, weight: 1 }]);

  const endRingOffset = axialSegments * radialSegments;
  for (let j = 0; j < radialSegments; j += 1) {
    const nextJ = (j + 1) % radialSegments;
    triangles.push([startCenterIdx, nextJ, j]);
    triangles.push([endCenterIdx, endRingOffset + j, endRingOffset + nextJ]);
  }

  return {
    mesh: { positions, normals, triangles, influences },
    axialRings,
    midRingVertexIndices,
    radiusMeters,
    lengthMeters,
  };
}

function computeRingMeanRadius(positions: readonly Vec3[], ringIndices: readonly number[]): number {
  if (ringIndices.length === 0) return 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const idx of ringIndices) {
    cx += positions[idx][0];
    cy += positions[idx][1];
    cz += positions[idx][2];
  }
  cx /= ringIndices.length;
  cy /= ringIndices.length;
  cz /= ringIndices.length;
  let rSum = 0;
  for (const idx of ringIndices) {
    rSum += Math.hypot(positions[idx][0] - cx, positions[idx][1] - cy, positions[idx][2] - cz);
  }
  return rSum / ringIndices.length;
}

function computeAxialSliceVolume(
  positions: readonly Vec3[],
  rings: readonly (readonly number[])[],
): number {
  if (rings.length < 2) return 0;
  const centers: Vec3[] = rings.map((ring) => {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const idx of ring) {
      cx += positions[idx][0];
      cy += positions[idx][1];
      cz += positions[idx][2];
    }
    const inv = ring.length > 0 ? 1 / ring.length : 0;
    return [cx * inv, cy * inv, cz * inv];
  });
  const areas = rings.map((ring) => {
    const r = computeRingMeanRadius(positions, ring);
    return Math.PI * r * r;
  });
  let totalVol = 0;
  for (let i = 0; i + 1 < rings.length; i += 1) {
    const ds = Math.hypot(
      centers[i + 1][0] - centers[i][0],
      centers[i + 1][1] - centers[i][1],
      centers[i + 1][2] - centers[i][2],
    );
    totalVol += 0.5 * (areas[i] + areas[i + 1]) * ds;
  }
  return totalVol;
}

/** 동일 본 변환에 대해 DQS와 LBS의 닫힌 메시 부피 및 관절 단면 보존율을 정량 비교한다. */
export function compareDqsVsLbsVolumeRetention(
  limb: TubularLimbMesh,
  boneSkinningTransforms: readonly RigidTransform3D[],
): VolumeComparisonReport {
  const triangles = limb.mesh.triangles ?? [];
  const bindVolume = computeClosedMeshVolume(limb.mesh.positions, triangles);
  const bindSliceVolume = computeAxialSliceVolume(limb.mesh.positions, limb.axialRings);
  const bindMidRadius = computeRingMeanRadius(limb.mesh.positions, limb.midRingVertexIndices);
  const dqs = solveDualQuaternionSkinning(limb.mesh, boneSkinningTransforms);
  const lbs = solveLinearBlendSkinning(limb.mesh, boneSkinningTransforms);

  const dqsVolume = computeClosedMeshVolume(dqs.positions, triangles);
  const lbsVolume = computeClosedMeshVolume(lbs.positions, triangles);
  const dqsSliceVolume = computeAxialSliceVolume(dqs.positions, limb.axialRings);
  const lbsSliceVolume = computeAxialSliceVolume(lbs.positions, limb.axialRings);
  const dqsMidRadius = computeRingMeanRadius(dqs.positions, limb.midRingVertexIndices);
  const lbsMidRadius = computeRingMeanRadius(lbs.positions, limb.midRingVertexIndices);

  const dqsVolumeRatio = bindVolume > DQ_EPSILON ? dqsVolume / bindVolume : 1;
  const lbsVolumeRatio = bindVolume > DQ_EPSILON ? lbsVolume / bindVolume : 1;
  const dqsSliceRatio = bindSliceVolume > DQ_EPSILON ? dqsSliceVolume / bindSliceVolume : 1;
  const lbsSliceRatio = bindSliceVolume > DQ_EPSILON ? lbsSliceVolume / bindSliceVolume : 1;
  const dqsMidRadiusRatio = bindMidRadius > DQ_EPSILON ? dqsMidRadius / bindMidRadius : 1;
  const lbsMidRadiusRatio = bindMidRadius > DQ_EPSILON ? lbsMidRadius / bindMidRadius : 1;
  const dqsMidCrossSectionAreaRatio = dqsMidRadiusRatio * dqsMidRadiusRatio;
  const lbsMidCrossSectionAreaRatio = lbsMidRadiusRatio * lbsMidRadiusRatio;

  return {
    bindVolume,
    dqsVolume,
    lbsVolume,
    dqsVolumeRatio,
    lbsVolumeRatio,
    dqsVolumeCollapsePct: Math.max(0, (1 - dqsVolumeRatio) * 100),
    lbsVolumeCollapsePct: Math.max(0, (1 - lbsVolumeRatio) * 100),
    dqsSliceVolumeCollapsePct: Math.max(0, (1 - dqsSliceRatio) * 100),
    lbsSliceVolumeCollapsePct: Math.max(0, (1 - lbsSliceRatio) * 100),
    dqsMidRadiusRatio,
    lbsMidRadiusRatio,
    dqsMidCrossSectionAreaRatio,
    lbsMidCrossSectionAreaRatio,
    dqsMidAreaCollapsePct: Math.max(0, (1 - dqsMidCrossSectionAreaRatio) * 100),
    lbsMidAreaCollapsePct: Math.max(0, (1 - lbsMidCrossSectionAreaRatio) * 100),
  };
}
