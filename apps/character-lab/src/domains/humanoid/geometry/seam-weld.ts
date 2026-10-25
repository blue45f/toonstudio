/**
 * SHAPER 방식 파츠 경계(Seam) 정점 그룹 잠금, 3-구간(C/L/R) 경계 오프셋 자동 적응,
 * 두상-목 경계(Neck Seam) 정점 매칭 및 법선·위치 용접(Weld).
 */

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function roundTo3Decimals(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * SHAPER samePosVertices와 동일한 방식: 초기 좌표가 tolerance 이내로 일치하는 중복 정점 그룹(심 정점 그룹)을 찾는다.
 */
export function findCoincidentVertexGroups(positions: ArrayLike<number>, tolerance = 1e-4): readonly Uint32Array[] {
  const vertexCount = Math.floor(positions.length / 3);
  const invTol = 1 / Math.max(tolerance, 1e-9);
  const buckets = new Map<string, number[]>();
  for (let v = 0; v < vertexCount; v += 1) {
    const qx = Math.round(positions[v * 3] * invTol);
    const qy = Math.round(positions[v * 3 + 1] * invTol);
    const qz = Math.round(positions[v * 3 + 2] * invTol);
    const key = `${qx},${qy},${qz}`;
    const bucket = buckets.get(key);
    if (bucket !== undefined) {
      bucket.push(v);
    } else {
      buckets.set(key, [v]);
    }
  }
  const groups: Uint32Array[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length > 1) {
      groups.push(Uint32Array.from(bucket));
    }
  }
  return groups;
}

/**
 * SHAPER SetVerticesSmoothPosition / seamNormalCalc와 동일한 방식:
 * 동일 위치 심 정점 그룹의 세분 후 좌표를 산술 평균으로 잠그고, 법선이 주어지면 정규화 평균 법선으로 일치시킨다.
 */
export function lockCoincidentSeamVertices(
  positions: Float32Array,
  normals: Float32Array | undefined,
  groups: readonly Uint32Array[],
): void {
  for (const group of groups) {
    const count = group.length;
    if (count <= 1) continue;
    let px = 0;
    let py = 0;
    let pz = 0;
    for (let i = 0; i < count; i += 1) {
      const idx = group[i] * 3;
      px += positions[idx];
      py += positions[idx + 1];
      pz += positions[idx + 2];
    }
    const inv = 1 / count;
    px *= inv;
    py *= inv;
    pz *= inv;
    for (let i = 0; i < count; i += 1) {
      const idx = group[i] * 3;
      positions[idx] = px;
      positions[idx + 1] = py;
      positions[idx + 2] = pz;
    }
    if (normals !== undefined) {
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (let i = 0; i < count; i += 1) {
        const idx = group[i] * 3;
        nx += normals[idx];
        ny += normals[idx + 1];
        nz += normals[idx + 2];
      }
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-8) {
        nx /= len;
        ny /= len;
        nz /= len;
        for (let i = 0; i < count; i += 1) {
          const idx = group[i] * 3;
          normals[idx] = nx;
          normals[idx + 1] = ny;
          normals[idx + 2] = nz;
        }
      }
    }
  }
}

export interface SeamCentroids3Zone {
  readonly seamPosC: readonly [number, number, number];
  readonly seamPosL: readonly [number, number, number];
  readonly seamPosR: readonly [number, number, number];
}

/**
 * SHAPER SetMeshSeamPos(0x0600026c)와 동일한 3-구간(C/L/R) 경계 정점 무게중심 산출:
 * - seamPosC: 전체 경계 정점의 평균 좌표
 * - seamPosL: Round(x, 3) <= 0인 좌측 경계 정점의 평균 좌표
 * - seamPosR: Round(x, 3) >= 0인 우측 경계 정점의 평균 좌표
 */
export function computeSeamCentroids3Zone(
  positions: ArrayLike<number>,
  seamVertexIndices: ArrayLike<number>,
): SeamCentroids3Zone {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let cCount = 0;

  let lx = 0;
  let ly = 0;
  let lz = 0;
  let lCount = 0;

  let rx = 0;
  let ry = 0;
  let rz = 0;
  let rCount = 0;

  for (let i = 0; i < seamVertexIndices.length; i += 1) {
    const v = seamVertexIndices[i];
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    const rx3 = roundTo3Decimals(x);

    cx += x;
    cy += y;
    cz += z;
    cCount += 1;

    if (rx3 <= 0) {
      lx += x;
      ly += y;
      lz += z;
      lCount += 1;
    }
    if (rx3 >= 0) {
      rx += x;
      ry += y;
      rz += z;
      rCount += 1;
    }
  }

  const seamPosC: readonly [number, number, number] =
    cCount > 0 ? [cx / cCount, cy / cCount, cz / cCount] : [0, 0, 0];
  const seamPosL: readonly [number, number, number] =
    lCount > 0 ? [lx / lCount, ly / lCount, lz / lCount] : seamPosC;
  const seamPosR: readonly [number, number, number] =
    rCount > 0 ? [rx / rCount, ry / rCount, rz / rCount] : seamPosC;

  return { seamPosC, seamPosL, seamPosR };
}

export interface PartSeamAdaptationOptions {
  readonly partPositions: Float32Array;
  readonly sourceSeams: SeamCentroids3Zone;
  readonly targetSeams: SeamCentroids3Zone;
  /** 중앙 단일 파츠("center") 또는 좌/우 대칭 파츠("bilateral") */
  readonly mirrorType: "center" | "bilateral";
  /** 눈 파츠(meshId == 1) 결합 시 안구 피벗 자동 보정용 */
  readonly eyeballPivotL?: readonly [number, number, number];
  readonly eyeballPivotR?: readonly [number, number, number];
}

export interface PartSeamAdaptationResult {
  readonly adaptedPositions: Float32Array;
  readonly deltaC: readonly [number, number, number];
  readonly deltaL: readonly [number, number, number];
  readonly deltaR: readonly [number, number, number];
  readonly adaptedEyeballPivotL?: readonly [number, number, number];
  readonly adaptedEyeballPivotR?: readonly [number, number, number];
}

/**
 * SHAPER CombineMesh(0x06000268)의 3-구간 Seam Offset 자동 적응 및 안구 피벗 보정:
 * - Δ_C = targetSeamPosC - seamPosC, Δ_L = targetSeamPosL - seamPosL, Δ_R = targetSeamPosR - seamPosR
 * - 중앙 파츠("center"): 모든 정점에 +Δ_C
 * - 좌/우 대칭 파츠("bilateral"): x < 0 정점에 +Δ_L, x >= 0 정점에 +Δ_R
 * - 눈 파츠 안구 피벗: eyeballPivotL = eyeballLPos + (-Δ_L.x, Δ_L.y, Δ_L.z),
 *   eyeballPivotR = eyeballRPos + (-Δ_R.x, Δ_R.y, Δ_R.z)
 */
export function adaptPartSeamOffsets(options: PartSeamAdaptationOptions): PartSeamAdaptationResult {
  const { partPositions, sourceSeams, targetSeams, mirrorType, eyeballPivotL, eyeballPivotR } = options;
  const deltaC: readonly [number, number, number] = [
    targetSeams.seamPosC[0] - sourceSeams.seamPosC[0],
    targetSeams.seamPosC[1] - sourceSeams.seamPosC[1],
    targetSeams.seamPosC[2] - sourceSeams.seamPosC[2],
  ];
  const deltaL: readonly [number, number, number] = [
    targetSeams.seamPosL[0] - sourceSeams.seamPosL[0],
    targetSeams.seamPosL[1] - sourceSeams.seamPosL[1],
    targetSeams.seamPosL[2] - sourceSeams.seamPosL[2],
  ];
  const deltaR: readonly [number, number, number] = [
    targetSeams.seamPosR[0] - sourceSeams.seamPosR[0],
    targetSeams.seamPosR[1] - sourceSeams.seamPosR[1],
    targetSeams.seamPosR[2] - sourceSeams.seamPosR[2],
  ];

  const adaptedPositions = new Float32Array(partPositions.length);
  for (let i = 0; i < partPositions.length; i += 3) {
    const x = partPositions[i];
    const y = partPositions[i + 1];
    const z = partPositions[i + 2];
    const delta = mirrorType === "center" ? deltaC : x < 0 ? deltaL : deltaR;
    adaptedPositions[i] = x + delta[0];
    adaptedPositions[i + 1] = y + delta[1];
    adaptedPositions[i + 2] = z + delta[2];
  }

  const adaptedEyeballPivotL: readonly [number, number, number] | undefined =
    eyeballPivotL !== undefined
      ? [eyeballPivotL[0] - deltaL[0], eyeballPivotL[1] + deltaL[1], eyeballPivotL[2] + deltaL[2]]
      : undefined;
  const adaptedEyeballPivotR: readonly [number, number, number] | undefined =
    eyeballPivotR !== undefined
      ? [eyeballPivotR[0] - deltaR[0], eyeballPivotR[1] + deltaR[1], eyeballPivotR[2] + deltaR[2]]
      : undefined;

  return {
    adaptedPositions,
    deltaC,
    deltaL,
    deltaR,
    ...(adaptedEyeballPivotL !== undefined ? { adaptedEyeballPivotL } : {}),
    ...(adaptedEyeballPivotR !== undefined ? { adaptedEyeballPivotR } : {}),
  };
}

export interface NeckSeamVertexPair {
  readonly headVertexIndex: number;
  readonly neckVertexIndex: number;
}

/**
 * SHAPER FindSamePositionNeckVertices(0x060000b6) / FindSubdividedNeckSeamVertices(0x060000b8):
 * 두상 하단 경계 정점들과 목 상단 경계 정점들을 소수점 셋째 자리 반올림 정렬 또는 거리 임계값(< tolerance)으로 1:1 매칭한다.
 */
export function matchNeckSeamVertices(
  headPositions: ArrayLike<number>,
  headSeamIndices: ArrayLike<number>,
  neckPositions: ArrayLike<number>,
  neckSeamIndices: ArrayLike<number>,
  tolerance = 1e-3,
): readonly NeckSeamVertexPair[] {
  const pairs: NeckSeamVertexPair[] = [];
  const usedNeck = new Set<number>();

  // 1차: 거리 tolerance(기본 0.001) 이내 최근접 매칭 (FindSubdividedNeckSeamVertices 방식)
  for (let i = 0; i < headSeamIndices.length; i += 1) {
    const hv = headSeamIndices[i];
    const hx = headPositions[hv * 3];
    const hy = headPositions[hv * 3 + 1];
    const hz = headPositions[hv * 3 + 2];
    let bestNeck = -1;
    let bestDist = tolerance;
    for (let j = 0; j < neckSeamIndices.length; j += 1) {
      const nv = neckSeamIndices[j];
      if (usedNeck.has(nv)) continue;
      const d = Math.hypot(
        hx - neckPositions[nv * 3],
        hy - neckPositions[nv * 3 + 1],
        hz - neckPositions[nv * 3 + 2],
      );
      if (d <= bestDist) {
        bestDist = d;
        bestNeck = nv;
      }
    }
    if (bestNeck !== -1) {
      usedNeck.add(bestNeck);
      pairs.push({ headVertexIndex: hv, neckVertexIndex: bestNeck });
    }
  }

  if (pairs.length === Math.min(headSeamIndices.length, neckSeamIndices.length)) {
    return pairs;
  }

  // 2차 폴백: SHAPER FindSamePositionNeckVertices 다중 키 정렬(-z, -x 반올림 3자리)
  const sortByRoundedZX = (pos: ArrayLike<number>, indices: ArrayLike<number>): number[] =>
    Array.from(indices).sort((a, b) => {
      const za = roundTo3Decimals(pos[a * 3 + 2]);
      const zb = roundTo3Decimals(pos[b * 3 + 2]);
      if (zb !== za) return zb - za;
      const xa = roundTo3Decimals(pos[a * 3]);
      const xb = roundTo3Decimals(pos[b * 3]);
      return xb - xa;
    });

  const sortedHead = sortByRoundedZX(headPositions, headSeamIndices);
  const sortedNeck = sortByRoundedZX(neckPositions, neckSeamIndices);
  const count = Math.min(sortedHead.length, sortedNeck.length);
  const fallbackPairs: NeckSeamVertexPair[] = [];
  for (let i = 0; i < count; i += 1) {
    fallbackPairs.push({ headVertexIndex: sortedHead[i], neckVertexIndex: sortedNeck[i] });
  }
  return fallbackPairs;
}

/**
 * SHAPER MergeNeck(0x060000b7) 및 MergeNeckBlend(0x060000b9):
 * - 스키닝된 목 경계 좌표를 두상 경계 정점에 이식하고(positionWeld),
 * - 세분화된 두상 경계 법선을 목 경계 정점 법선에 덮어쓰거나 평균 블렌딩(normalBlendWeight: 1 = 두상 법선 이식, 0.5 = 평균)한다.
 */
export function weldNeckSeamPositionsAndNormals(options: {
  readonly headPositions: Float32Array;
  readonly headNormals?: Float32Array;
  readonly neckPositions: Float32Array;
  readonly neckNormals?: Float32Array;
  readonly pairs: readonly NeckSeamVertexPair[];
  /** 기본값 1.0: SHAPER MergeNeckBlend처럼 두상 법선을 목 경계에 이식 (0.5면 WeldPartVertices처럼 산술 평균) */
  readonly normalBlendWeight?: number;
}): void {
  const { headPositions, headNormals, neckPositions, neckNormals, pairs, normalBlendWeight = 1 } = options;
  const w = clamp01(normalBlendWeight);
  for (const { headVertexIndex, neckVertexIndex } of pairs) {
    const hBase = headVertexIndex * 3;
    const nBase = neckVertexIndex * 3;
    // MergeNeck: 스키닝된 목 상단 경계 위치를 두상 하단 경계 위치로 동기화
    headPositions[hBase] = neckPositions[nBase];
    headPositions[hBase + 1] = neckPositions[nBase + 1];
    headPositions[hBase + 2] = neckPositions[nBase + 2];

    if (headNormals !== undefined && neckNormals !== undefined) {
      const nx = w * headNormals[hBase] + (1 - w) * neckNormals[nBase];
      const ny = w * headNormals[hBase + 1] + (1 - w) * neckNormals[nBase + 1];
      const nz = w * headNormals[hBase + 2] + (1 - w) * neckNormals[nBase + 2];
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-8) {
        const ux = nx / len;
        const uy = ny / len;
        const uz = nz / len;
        neckNormals[nBase] = ux;
        neckNormals[nBase + 1] = uy;
        neckNormals[nBase + 2] = uz;
        headNormals[hBase] = ux;
        headNormals[hBase + 1] = uy;
        headNormals[hBase + 2] = uz;
      }
    }
  }
}
