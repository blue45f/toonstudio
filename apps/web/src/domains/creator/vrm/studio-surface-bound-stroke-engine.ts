/**
 * SHAPER 킬러 기능 웹 네이티브화 — 스키닝 메시 바리센트릭 표면 구속 스트로크 엔진.
 *
 * 스트로크 앵커를 `(meshId, triangleIndex, barycentric [u,v,w], normalOffsetMm)` 형태로
 * 메시 삼각형 표면에 고정해 두면, 캐릭터 포즈나 블렌드셰이프가 변형될 때마다
 * `P' = u·V0' + v·V1' + w·V2' + n'·offset`으로 스트로크가 피부·의상 위를 정확히 추종한다.
 * 카메라 지향 리본 버텍스 빌더는 5,000 세그먼트를 2ms 이내에 생성할 수 있도록
 * 핫 루프 내부의 임시 객체 할당을 완전히 제거한 TypedArray 연산으로 설계됐다.
 */

export type Vec3Tuple = readonly [number, number, number];

export interface SurfaceBoundStrokeAnchor {
  readonly meshId: string;
  readonly triangleIndex: number;
  readonly barycentric: readonly [number, number, number];
  readonly normalOffsetMm: number;
  readonly widthMm: number;
  readonly pressure: number;
}

export interface SurfaceBoundStroke {
  readonly id: string;
  readonly meshId: string;
  readonly labelKo: string;
  readonly mirrorX: boolean;
  readonly colorToken: string;
  readonly opacity: number;
  readonly anchors: readonly SurfaceBoundStrokeAnchor[];
}

export interface SurfaceBoundStrokeMeshBuffer {
  readonly meshId: string;
  readonly positions: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
}

export interface EvaluatedStrokeSpineBuffers {
  readonly pointCount: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly halfWidthsM: Float32Array;
}

export interface StrokeRibbonGeometryBuffers {
  readonly segmentCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

export interface SurfaceBoundStrokeToolConfig {
  readonly enabled: boolean;
  readonly mirrorX: boolean;
  readonly liveDeformFollow: boolean;
  readonly widthMm: number;
  readonly normalOffsetMm: number;
  readonly opacity: number;
  readonly colorToken: string;
}

export const DEFAULT_SURFACE_BOUND_STROKE_CONFIG: SurfaceBoundStrokeToolConfig = Object.freeze({
  enabled: true,
  mirrorX: true,
  liveDeformFollow: true,
  widthMm: 2.4,
  normalOffsetMm: 0.6,
  opacity: 0.95,
  colorToken: "ink-primary",
});

const MM_TO_M = 0.001;
const EPS = 1e-8;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * 공간 점 P를 삼각형 (A, B, C) 평면에 투영하고 클램핑된 정규화 바리센트릭 좌표 `[u, v, w]`를 구한다.
 */
export function computeTriangleBarycentric(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): {
  readonly barycentric: readonly [number, number, number];
  readonly closestX: number;
  readonly closestY: number;
  readonly closestZ: number;
  readonly distanceSq: number;
  readonly signedNormalDistance: number;
} {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;

  const d00 = abx * abx + aby * aby + abz * abz;
  const d01 = abx * acx + aby * acy + abz * acz;
  const d11 = acx * acx + acy * acy + acz * acz;
  const d20 = apx * abx + apy * aby + apz * abz;
  const d21 = apx * acx + apy * acy + apz * acz;
  const denom = d00 * d11 - d01 * d01;

  let v = 0;
  let w = 0;
  let u = 1;
  if (Math.abs(denom) > EPS) {
    v = (d11 * d20 - d01 * d21) / denom;
    w = (d00 * d21 - d01 * d20) / denom;
    u = 1 - v - w;
  }

  // 삼각형 내부 심플렉스로 투영 클램프
  if (u < 0 || v < 0 || w < 0) {
    const cu = Math.max(0, u);
    const cv = Math.max(0, v);
    const cw = Math.max(0, w);
    const sum = cu + cv + cw;
    if (sum > EPS) {
      u = cu / sum;
      v = cv / sum;
      w = cw / sum;
    } else {
      u = 1 / 3;
      v = 1 / 3;
      w = 1 / 3;
    }
  }

  const closestX = u * ax + v * bx + w * cx;
  const closestY = u * ay + v * by + w * cy;
  const closestZ = u * az + v * bz + w * cz;
  const dx = px - closestX;
  const dy = py - closestY;
  const dz = pz - closestZ;
  const distanceSq = dx * dx + dy * dy + dz * dz;

  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const nLen = Math.hypot(nx, ny, nz);
  const signedNormalDistance = nLen > EPS ? (dx * nx + dy * ny + dz * nz) / nLen : 0;

  return {
    barycentric: [u, v, w],
    closestX,
    closestY,
    closestZ,
    distanceSq,
    signedNormalDistance,
  };
}

/**
 * 3D 히트 포인트를 메시의 가장 가까운 삼각형 표면에 바리센트릭 앵커로 바인딩한다.
 */
export function bindPointToMeshSurface(
  mesh: SurfaceBoundStrokeMeshBuffer,
  point: Vec3Tuple,
  options?: {
    readonly preferredTriangleIndex?: number;
    readonly normalOffsetMm?: number;
    readonly widthMm?: number;
    readonly pressure?: number;
  },
): SurfaceBoundStrokeAnchor | null {
  const triCount = Math.floor(mesh.indices.length / 3);
  if (triCount <= 0) return null;

  const pos = mesh.positions;
  const idx = mesh.indices;
  const px = point[0];
  const py = point[1];
  const pz = point[2];

  const evalTri = (tri: number) => {
    const i0 = idx[tri * 3] * 3;
    const i1 = idx[tri * 3 + 1] * 3;
    const i2 = idx[tri * 3 + 2] * 3;
    return computeTriangleBarycentric(
      px,
      py,
      pz,
      pos[i0],
      pos[i0 + 1],
      pos[i0 + 2],
      pos[i1],
      pos[i1 + 1],
      pos[i1 + 2],
      pos[i2],
      pos[i2 + 1],
      pos[i2 + 2],
    );
  };

  let bestTri = 0;
  let bestHit = evalTri(0);

  if (
    typeof options?.preferredTriangleIndex === "number"
    && Number.isInteger(options.preferredTriangleIndex)
    && options.preferredTriangleIndex >= 0
    && options.preferredTriangleIndex < triCount
  ) {
    bestTri = options.preferredTriangleIndex;
    bestHit = evalTri(bestTri);
  } else {
    for (let tri = 1; tri < triCount; tri += 1) {
      const hit = evalTri(tri);
      if (hit.distanceSq < bestHit.distanceSq) {
        bestHit = hit;
        bestTri = tri;
      }
    }
  }

  return {
    meshId: mesh.meshId,
    triangleIndex: bestTri,
    barycentric: bestHit.barycentric,
    normalOffsetMm: options?.normalOffsetMm ?? DEFAULT_SURFACE_BOUND_STROKE_CONFIG.normalOffsetMm,
    widthMm: clamp(options?.widthMm ?? DEFAULT_SURFACE_BOUND_STROKE_CONFIG.widthMm, 0.2, 40),
    pressure: clamp(options?.pressure ?? 1, 0.05, 1),
  };
}

/**
 * X=0 평면 대칭 스트로크 생성: 기준 포즈 메시에서 앵커의 미러 좌표를 구해 반대쪽 삼각형에 바인딩한다.
 */
export function mirrorSurfaceBoundStrokeAcrossX(
  stroke: SurfaceBoundStroke,
  restMesh: SurfaceBoundStrokeMeshBuffer,
): SurfaceBoundStroke {
  const evaluated = evaluateSurfaceBoundAnchors(stroke.anchors, restMesh);
  const mirroredAnchors: SurfaceBoundStrokeAnchor[] = [];
  for (let i = 0; i < stroke.anchors.length; i += 1) {
    const src = stroke.anchors[i];
    const pIdx = i * 3;
    const mx = -evaluated.positions[pIdx];
    const my = evaluated.positions[pIdx + 1];
    const mz = evaluated.positions[pIdx + 2];
    const bound = bindPointToMeshSurface(restMesh, [mx, my, mz], {
      normalOffsetMm: src.normalOffsetMm,
      widthMm: src.widthMm,
      pressure: src.pressure,
    });
    if (bound) {
      mirroredAnchors.push(bound);
    }
  }
  return {
    ...stroke,
    id: `${stroke.id}:mirror-x`,
    labelKo: `${stroke.labelKo} (대칭)`,
    mirrorX: false,
    anchors: mirroredAnchors,
  };
}

/**
 * 포즈·모프 변형 후 정점 버퍼 위에서 모든 앵커의 세계/로컬 좌표와 법선을 재평가한다.
 * `P' = u·V0' + v·V1' + w·V2' + n'·(normalOffsetMm * 0.001)`
 */
export function evaluateSurfaceBoundAnchors(
  anchors: readonly SurfaceBoundStrokeAnchor[],
  deformedMesh: SurfaceBoundStrokeMeshBuffer,
  reuseBuffers?: EvaluatedStrokeSpineBuffers,
): EvaluatedStrokeSpineBuffers {
  const count = anchors.length;
  const positions = reuseBuffers && reuseBuffers.positions.length >= count * 3
    ? reuseBuffers.positions
    : new Float32Array(count * 3);
  const normals = reuseBuffers && reuseBuffers.normals.length >= count * 3
    ? reuseBuffers.normals
    : new Float32Array(count * 3);
  const halfWidthsM = reuseBuffers && reuseBuffers.halfWidthsM.length >= count
    ? reuseBuffers.halfWidthsM
    : new Float32Array(count);

  const pos = deformedMesh.positions;
  const idx = deformedMesh.indices;
  const triCount = Math.floor(idx.length / 3);

  for (let i = 0; i < count; i += 1) {
    const anchor = anchors[i];
    const tri = anchor.triangleIndex < triCount ? anchor.triangleIndex : 0;
    const i0 = idx[tri * 3] * 3;
    const i1 = idx[tri * 3 + 1] * 3;
    const i2 = idx[tri * 3 + 2] * 3;

    const v0x = pos[i0];
    const v0y = pos[i0 + 1];
    const v0z = pos[i0 + 2];
    const v1x = pos[i1];
    const v1y = pos[i1 + 1];
    const v1z = pos[i1 + 2];
    const v2x = pos[i2];
    const v2y = pos[i2 + 1];
    const v2z = pos[i2 + 2];

    const e1x = v1x - v0x;
    const e1y = v1y - v0y;
    const e1z = v1z - v0z;
    const e2x = v2x - v0x;
    const e2y = v2y - v0y;
    const e2z = v2z - v0z;

    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nLenSq = nx * nx + ny * ny + nz * nz;
    if (nLenSq > EPS * EPS) {
      const invLen = 1 / Math.sqrt(nLenSq);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;
    } else {
      nx = 0;
      ny = 1;
      nz = 0;
    }

    const u = anchor.barycentric[0];
    const v = anchor.barycentric[1];
    const w = anchor.barycentric[2];
    const offsetM = anchor.normalOffsetMm * MM_TO_M;

    const out = i * 3;
    positions[out] = u * v0x + v * v1x + w * v2x + nx * offsetM;
    positions[out + 1] = u * v0y + v * v1y + w * v2y + ny * offsetM;
    positions[out + 2] = u * v0z + v * v1z + w * v2z + nz * offsetM;
    normals[out] = nx;
    normals[out + 1] = ny;
    normals[out + 2] = nz;
    halfWidthsM[i] = Math.max(0.0001, anchor.widthMm * anchor.pressure * 0.5 * MM_TO_M);
  }

  return {
    pointCount: count,
    positions,
    normals,
    halfWidthsM,
  };
}

/**
 * 카메라 지향 3D 리본 스트립 지오메트리를 구축한다.
 * - 버텍스 수: `pointCount * 2`, 삼각형 인덱스 수: `(pointCount - 1) * 6`
 * - 핫 루프 내 제로 객체 할당: 5,000 세그먼트 `< 2ms` 예산 준수.
 */
export function buildCameraFacingStrokeRibbon(
  spine: EvaluatedStrokeSpineBuffers,
  cameraPosition: Vec3Tuple,
  reuseOutput?: StrokeRibbonGeometryBuffers,
): StrokeRibbonGeometryBuffers {
  const n = spine.pointCount;
  const segmentCount = Math.max(0, n - 1);
  const vertexCount = n < 2 ? 0 : n * 2;
  const indexCount = segmentCount * 6;

  const positions = reuseOutput && reuseOutput.positions.length >= vertexCount * 3
    ? reuseOutput.positions
    : new Float32Array(vertexCount * 3);
  const normals = reuseOutput && reuseOutput.normals.length >= vertexCount * 3
    ? reuseOutput.normals
    : new Float32Array(vertexCount * 3);
  const uvs = reuseOutput && reuseOutput.uvs.length >= vertexCount * 2
    ? reuseOutput.uvs
    : new Float32Array(vertexCount * 2);
  const indices = reuseOutput && reuseOutput.indices.length >= indexCount
    ? reuseOutput.indices
    : new Uint32Array(indexCount);

  if (n < 2) {
    return { segmentCount: 0, vertexCount: 0, indexCount: 0, positions, normals, uvs, indices };
  }

  const camX = cameraPosition[0];
  const camY = cameraPosition[1];
  const camZ = cameraPosition[2];
  const sPos = spine.positions;
  const sNorm = spine.normals;
  const sHalfW = spine.halfWidthsM;
  const invSeg = 1 / segmentCount;

  let prevSideX = 1;
  let prevSideY = 0;
  let prevSideZ = 0;

  for (let i = 0; i < n; i += 1) {
    const pIdx = i * 3;
    const px = sPos[pIdx];
    const py = sPos[pIdx + 1];
    const pz = sPos[pIdx + 2];

    const prevIdx = (i > 0 ? i - 1 : 0) * 3;
    const nextIdx = (i < n - 1 ? i + 1 : n - 1) * 3;
    let tx = sPos[nextIdx] - sPos[prevIdx];
    let ty = sPos[nextIdx + 1] - sPos[prevIdx + 1];
    let tz = sPos[nextIdx + 2] - sPos[prevIdx + 2];
    const tLenSq = tx * tx + ty * ty + tz * tz;
    if (tLenSq > EPS * EPS) {
      const invT = 1 / Math.sqrt(tLenSq);
      tx *= invT;
      ty *= invT;
      tz *= invT;
    } else {
      tx = 0;
      ty = 1;
      tz = 0;
    }

    let vx = camX - px;
    let vy = camY - py;
    let vz = camZ - pz;
    const vLenSq = vx * vx + vy * vy + vz * vz;
    if (vLenSq > EPS * EPS) {
      const invV = 1 / Math.sqrt(vLenSq);
      vx *= invV;
      vy *= invV;
      vz *= invV;
    } else {
      vx = sNorm[pIdx];
      vy = sNorm[pIdx + 1];
      vz = sNorm[pIdx + 2];
    }

    // side = normalize(tangent × viewDir)
    let sx = ty * vz - tz * vy;
    let sy = tz * vx - tx * vz;
    let sz = tx * vy - ty * vx;
    const sLenSq = sx * sx + sy * sy + sz * sz;
    if (sLenSq > EPS * EPS) {
      const invS = 1 / Math.sqrt(sLenSq);
      sx *= invS;
      sy *= invS;
      sz *= invS;
      if (i > 0 && sx * prevSideX + sy * prevSideY + sz * prevSideZ < 0) {
        sx = -sx;
        sy = -sy;
        sz = -sz;
      }
      prevSideX = sx;
      prevSideY = sy;
      prevSideZ = sz;
    } else {
      sx = prevSideX;
      sy = prevSideY;
      sz = prevSideZ;
    }

    const hw = sHalfW[i];
    const vLeft = i * 6;
    const vRight = vLeft + 3;
    positions[vLeft] = px - sx * hw;
    positions[vLeft + 1] = py - sy * hw;
    positions[vLeft + 2] = pz - sz * hw;
    positions[vRight] = px + sx * hw;
    positions[vRight + 1] = py + sy * hw;
    positions[vRight + 2] = pz + sz * hw;

    const nx = sNorm[pIdx];
    const ny = sNorm[pIdx + 1];
    const nz = sNorm[pIdx + 2];
    normals[vLeft] = nx;
    normals[vLeft + 1] = ny;
    normals[vLeft + 2] = nz;
    normals[vRight] = nx;
    normals[vRight + 1] = ny;
    normals[vRight + 2] = nz;

    const uCoord = i * invSeg;
    const uvBase = i * 4;
    uvs[uvBase] = uCoord;
    uvs[uvBase + 1] = 0;
    uvs[uvBase + 2] = uCoord;
    uvs[uvBase + 3] = 1;
  }

  for (let seg = 0; seg < segmentCount; seg += 1) {
    const baseV = seg * 2;
    const baseI = seg * 6;
    indices[baseI] = baseV;
    indices[baseI + 1] = baseV + 1;
    indices[baseI + 2] = baseV + 2;
    indices[baseI + 3] = baseV + 2;
    indices[baseI + 4] = baseV + 1;
    indices[baseI + 5] = baseV + 3;
  }

  return {
    segmentCount,
    vertexCount,
    indexCount,
    positions,
    normals,
    uvs,
    indices,
  };
}
