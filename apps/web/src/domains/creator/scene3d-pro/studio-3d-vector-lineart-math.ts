/**
 * 3D→웹툰 벡터 강약선 추출기용 클린룸 3D 기하·카메라 행렬·프러스텀 클리핑·레이 교차 유틸리티.
 *
 * 열 우선(column-major) 4×4 행렬 규약(OpenGL/WebGL/Three.js/WebGPU 표준)을 사용하며,
 * 외부 렌더링 엔진이나 DOM 없이 순수 결정적 부동소수점 연산으로 동작한다.
 */

export type VectorLineArtVec3 = readonly [number, number, number];

export type NdcDepthRange = "neg-one-to-one" | "zero-to-one";

/** 인덱스 삼각형 메쉬 입력 계약(CCW 전면 와인딩 기준). */
export interface IndexedTriangleMesh {
  readonly positions: Float32Array | readonly number[];
  readonly indices: Uint32Array | Uint16Array | readonly number[];
  /** 선택적 4×4 열 우선 모델 행렬(미지정 시 단위 행렬). */
  readonly modelMatrix?: Float32Array | readonly number[];
  /** 선택적 삼각형별 재질 ID(재질 경계선 추출용). */
  readonly materialIds?: Uint32Array | Uint16Array | readonly number[];
}

/** 카메라 뷰/투영 행렬 및 뷰포트 입력 계약. */
export interface CameraProjectionInput {
  readonly viewMatrix: Float32Array | readonly number[];
  readonly projectionMatrix: Float32Array | readonly number[];
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** 미지정 시 `viewMatrix` 역행렬에서 자동 추출한다. */
  readonly cameraPosition?: VectorLineArtVec3;
  /** 클립 공간 깊이 규약. 기본 `"neg-one-to-one"`(OpenGL/Three.js). */
  readonly ndcDepthRange?: NdcDepthRange;
}

export interface CameraBasis {
  readonly position: VectorLineArtVec3;
  /** 카메라가 바라보는 단위 방향 벡터(월드 공간). */
  readonly forward: VectorLineArtVec3;
  readonly isOrthographic: boolean;
}

export interface ProjectedScreenPoint {
  readonly x: number;
  readonly y: number;
  readonly ndcZ: number;
  /** 카메라 전방 양수 거리(m). */
  readonly viewDepth: number;
}

export const IDENTITY_MAT4: readonly number[] = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function dot3(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  return ax * bx + ay * by + az * bz;
}

export function normalize3Tuple(x: number, y: number, z: number): VectorLineArtVec3 {
  const len = Math.hypot(x, y, z);
  if (!Number.isFinite(len) || len <= 1e-12) return [0, 0, 1];
  return [x / len, y / len, z / len];
}

/** 열 우선 4×4 행렬 곱 `out = a * b`. */
export function multiplyMat4(
  a: Float32Array | Float64Array | readonly number[],
  b: Float32Array | Float64Array | readonly number[],
): Float64Array {
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col += 1) {
    const b0 = b[col * 4] ?? 0;
    const b1 = b[col * 4 + 1] ?? 0;
    const b2 = b[col * 4 + 2] ?? 0;
    const b3 = b[col * 4 + 3] ?? 0;
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        (a[row] ?? 0) * b0 +
        (a[4 + row] ?? 0) * b1 +
        (a[8 + row] ?? 0) * b2 +
        (a[12 + row] ?? 0) * b3;
    }
  }
  return out;
}

/** 열 우선 4×4 행렬 역행렬(특이 행렬이면 null). */
export function invertMat4(m: Float32Array | Float64Array | readonly number[]): Float64Array | null {
  const a00 = m[0] ?? 0;
  const a01 = m[1] ?? 0;
  const a02 = m[2] ?? 0;
  const a03 = m[3] ?? 0;
  const a10 = m[4] ?? 0;
  const a11 = m[5] ?? 0;
  const a12 = m[6] ?? 0;
  const a13 = m[7] ?? 0;
  const a20 = m[8] ?? 0;
  const a21 = m[9] ?? 0;
  const a22 = m[10] ?? 0;
  const a23 = m[11] ?? 0;
  const a30 = m[12] ?? 0;
  const a31 = m[13] ?? 0;
  const a32 = m[14] ?? 0;
  const a33 = m[15] ?? 0;

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;

  const out = new Float64Array(16);
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * invDet;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * invDet;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * invDet;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * invDet;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * invDet;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * invDet;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * invDet;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * invDet;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * invDet;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * invDet;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * invDet;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * invDet;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * invDet;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * invDet;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * invDet;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * invDet;
  return out;
}

/** 오른손 좌표계 LookAt 뷰 행렬(열 우선)을 생성한다. */
export function createLookAtViewMatrix(
  eye: VectorLineArtVec3,
  target: VectorLineArtVec3,
  up: VectorLineArtVec3 = [0, 1, 0],
): Float32Array {
  const [ex, ey, ez] = eye;
  const [tx, ty, tz] = target;
  const [ux, uy, uz] = up;

  let zx = ex - tx;
  let zy = ey - ty;
  let zz = ez - tz;
  const zLen = Math.hypot(zx, zy, zz);
  if (zLen <= 1e-12) {
    zx = 0;
    zy = 0;
    zz = 1;
  } else {
    zx /= zLen;
    zy /= zLen;
    zz /= zLen;
  }

  let xx = uy * zz - uz * zy;
  let xy = uz * zx - ux * zz;
  let xz = ux * zy - uy * zx;
  let xLen = Math.hypot(xx, xy, xz);
  if (xLen <= 1e-12) {
    // up 벡터가 시선과 평행할 때의 안전 폴백
    const fx = Math.abs(zy) < 0.9 ? 0 : 1;
    const fy = Math.abs(zy) < 0.9 ? 1 : 0;
    xx = fy * zz;
    xy = -fx * zz;
    xz = fx * zy - fy * zx;
    xLen = Math.hypot(xx, xy, xz) || 1;
  }
  xx /= xLen;
  xy /= xLen;
  xz /= xLen;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez),
    -(yx * ex + yy * ey + yz * ez),
    -(zx * ex + zy * ey + zz * ez),
    1,
  ]);
}

/** 오른손 좌표계 원근 투영 행렬(열 우선)을 생성한다. */
export function createPerspectiveProjectionMatrix(
  fovYDeg: number,
  aspect: number,
  near: number,
  far: number,
  depthRange: NdcDepthRange = "neg-one-to-one",
): Float32Array {
  const clampedFov = clamp(fovYDeg, 1, 175);
  const safeAspect = Math.max(1e-4, aspect);
  const safeNear = Math.max(1e-4, near);
  const safeFar = Math.max(safeNear + 1e-3, far);
  const f = 1 / Math.tan((clampedFov * Math.PI) / 360);
  const nf = 1 / (safeNear - safeFar);

  if (depthRange === "zero-to-one") {
    return new Float32Array([
      f / safeAspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, safeFar * nf, -1,
      0, 0, safeFar * safeNear * nf, 0,
    ]);
  }
  return new Float32Array([
    f / safeAspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (safeFar + safeNear) * nf, -1,
    0, 0, 2 * safeFar * safeNear * nf, 0,
  ]);
}

/** 오른손 좌표계 직교 투영 행렬(열 우선)을 생성한다. */
export function createOrthographicProjectionMatrix(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
  depthRange: NdcDepthRange = "neg-one-to-one",
): Float32Array {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);

  if (depthRange === "zero-to-one") {
    return new Float32Array([
      -2 * lr, 0, 0, 0,
      0, -2 * bt, 0, 0,
      0, 0, nf, 0,
      (left + right) * lr, (top + bottom) * bt, near * nf, 1,
    ]);
  }
  return new Float32Array([
    -2 * lr, 0, 0, 0,
    0, -2 * bt, 0, 0,
    0, 0, 2 * nf, 0,
    (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1,
  ]);
}

/** 뷰/투영 행렬에서 월드 카메라 위치·전방 벡터·직교 여부를 추출한다. */
export function extractCameraBasis(camera: CameraProjectionInput): CameraBasis {
  const invView = invertMat4(camera.viewMatrix);
  const position: VectorLineArtVec3 = camera.cameraPosition
    ? camera.cameraPosition
    : invView
      ? [invView[12] ?? 0, invView[13] ?? 0, invView[14] ?? 0]
      : [0, 0, 5];

  const forward: VectorLineArtVec3 = invView
    ? normalize3Tuple(-(invView[8] ?? 0), -(invView[9] ?? 0), -(invView[10] ?? 1))
    : [0, 0, -1];

  const p11 = camera.projectionMatrix[11] ?? 0;
  const p15 = camera.projectionMatrix[15] ?? 0;
  const isOrthographic = Math.abs(p11) < 1e-7 && Math.abs(p15 - 1) < 1e-4;

  return { position, forward, isOrthographic };
}

/** 3D 월드 점을 4×4 행렬로 동차 클립 좌표 `[cx, cy, cz, cw]`로 변환한다. */
export function transformToClip(
  vp: Float64Array,
  x: number,
  y: number,
  z: number,
): readonly [number, number, number, number] {
  return [
    (vp[0] ?? 0) * x + (vp[4] ?? 0) * y + (vp[8] ?? 0) * z + (vp[12] ?? 0),
    (vp[1] ?? 0) * x + (vp[5] ?? 0) * y + (vp[9] ?? 0) * z + (vp[13] ?? 0),
    (vp[2] ?? 0) * x + (vp[6] ?? 0) * y + (vp[10] ?? 0) * z + (vp[14] ?? 0),
    (vp[3] ?? 0) * x + (vp[7] ?? 0) * y + (vp[11] ?? 0) * z + (vp[15] ?? 0),
  ];
}

/**
 * 3D 선분 `[A, B]`를 동차 클립 공간 6개 프러스텀 평면으로 정확히 클리핑해
 * 살아남은 3D 매개변수 구간 `[t0, t1] ⊆ [0, 1]`을 반환한다.
 */
export function clipSegmentToFrustum(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  viewProj: Float64Array,
  ndcDepthRange: NdcDepthRange,
): readonly [number, number] | null {
  const [cax, cay, caz, caw] = transformToClip(viewProj, ax, ay, az);
  const [cbx, cby, cbz, cbw] = transformToClip(viewProj, bx, by, bz);

  // 각 평면의 부호 거리 d(t) = dA + t * (dB - dA) >= 0 유지
  const planes: readonly (readonly [number, number])[] = [
    [caw - 1e-5, cbw - 1e-5], // w >= 1e-5 (카메라 뒤 특이점 차단)
    [caw + cax, cbw + cbx], // x >= -w
    [caw - cax, cbw - cbx], // x <= +w
    [caw + cay, cbw + cby], // y >= -w
    [caw - cay, cbw - cby], // y <= +w
    ndcDepthRange === "zero-to-one" ? [caz, cbz] : [caw + caz, cbw + cbz], // near
    [caw - caz, cbw - cbz], // far
  ];

  let t0 = 0;
  let t1 = 1;
  for (const [dA, dB] of planes) {
    if (dA < 0 && dB < 0) return null;
    if (dA >= 0 && dB >= 0) continue;
    const denom = dA - dB;
    if (Math.abs(denom) <= 1e-12) continue;
    const t = dA / denom;
    if (dA < 0) {
      if (t > t0) t0 = t;
    } else if (t < t1) {
      t1 = t;
    }
    if (t0 > t1) return null;
  }

  return [clamp01(t0), clamp01(t1)];
}

/** 월드 점을 화면 픽셀 좌표(좌상단 원점)와 뷰 공간 깊이(m)로 투영한다. */
export function projectWorldPointToScreen(
  x: number,
  y: number,
  z: number,
  viewProj: Float64Array,
  viewMatrix: Float32Array | readonly number[],
  viewportWidth: number,
  viewportHeight: number,
): ProjectedScreenPoint | null {
  const [cx, cy, cz, cw] = transformToClip(viewProj, x, y, z);
  if (!Number.isFinite(cw) || cw <= 1e-6) return null;
  const invW = 1 / cw;
  const ndcX = cx * invW;
  const ndcY = cy * invW;
  const ndcZ = cz * invW;

  const viewZ =
    (viewMatrix[2] ?? 0) * x +
    (viewMatrix[6] ?? 0) * y +
    (viewMatrix[10] ?? 0) * z +
    (viewMatrix[14] ?? 0);

  return {
    x: (ndcX * 0.5 + 0.5) * viewportWidth,
    y: (0.5 - ndcY * 0.5) * viewportHeight,
    ndcZ,
    viewDepth: Math.max(0, -viewZ),
  };
}

/**
 * 양면 Möller–Trumbore 레이-삼각형 교차 판정.
 * 교차 거리가 `(minDist, maxDist)` 범위이면 히트 거리 `t`를, 아니면 `-1`을 반환한다.
 */
export function rayTriangleIntersect(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  v0x: number,
  v0y: number,
  v0z: number,
  v1x: number,
  v1y: number,
  v1z: number,
  v2x: number,
  v2y: number,
  v2z: number,
  minDist: number,
  maxDist: number,
): number {
  const e1x = v1x - v0x;
  const e1y = v1y - v0y;
  const e1z = v1z - v0z;
  const e2x = v2x - v0x;
  const e2y = v2y - v0y;
  const e2z = v2z - v0z;

  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;

  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-10) return -1;

  const invDet = 1 / det;
  const tx = ox - v0x;
  const ty = oy - v0y;
  const tz = oz - v0z;

  const u = (tx * px + ty * py + tz * pz) * invDet;
  if (u < -1e-5 || u > 1 + 1e-5) return -1;

  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;

  const v = (dx * qx + dy * qy + dz * qz) * invDet;
  if (v < -1e-5 || u + v > 1 + 1e-5) return -1;

  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  if (t > minDist && t < maxDist) return t;
  return -1;
}

/** 정점 공유(8정점·12삼각형) CCW 외향 큐브 메쉬 생성기. */
export function createVectorLineArtCubeMesh(
  size = 1,
  center: VectorLineArtVec3 = [0, 0, 0],
): IndexedTriangleMesh {
  const h = Math.max(1e-4, size) * 0.5;
  const [cx, cy, cz] = center;
  const positions = new Float32Array([
    cx - h, cy - h, cz + h, // 0: FBL
    cx + h, cy - h, cz + h, // 1: FBR
    cx + h, cy + h, cz + h, // 2: FTR
    cx - h, cy + h, cz + h, // 3: FTL
    cx - h, cy - h, cz - h, // 4: BBL
    cx + h, cy - h, cz - h, // 5: BBR
    cx + h, cy + h, cz - h, // 6: BTR
    cx - h, cy + h, cz - h, // 7: BTL
  ]);
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3, // Front (+Z)
    5, 4, 7, 5, 7, 6, // Back (-Z)
    1, 5, 6, 1, 6, 2, // Right (+X)
    4, 0, 3, 4, 3, 7, // Left (-X)
    3, 2, 6, 3, 6, 7, // Top (+Y)
    4, 5, 1, 4, 1, 0, // Bottom (-Y)
  ]);
  return { positions, indices };
}

/** 정점 공유 CCW 외향 실린더 메쉬 생성기(capped=false 시 상하 경계 엣지 생성). */
export function createVectorLineArtCylinderMesh(
  radius = 0.5,
  height = 1.6,
  radialSegments = 24,
  capped = true,
  center: VectorLineArtVec3 = [0, 0, 0],
): IndexedTriangleMesh {
  const segs = Math.max(6, Math.floor(radialSegments));
  const r = Math.max(1e-4, radius);
  const halfH = Math.max(1e-4, height) * 0.5;
  const [cx, cy, cz] = center;

  const vertCount = segs * 2 + (capped ? 2 : 0);
  const positions = new Float32Array(vertCount * 3);
  for (let i = 0; i < segs; i += 1) {
    const theta = (Math.PI * 2 * i) / segs;
    const x = cx + r * Math.cos(theta);
    const z = cz - r * Math.sin(theta);
    // 상단 링 (0..segs-1)
    positions[i * 3] = x;
    positions[i * 3 + 1] = cy + halfH;
    positions[i * 3 + 2] = z;
    // 하단 링 (segs..2*segs-1)
    const bi = segs + i;
    positions[bi * 3] = x;
    positions[bi * 3 + 1] = cy - halfH;
    positions[bi * 3 + 2] = z;
  }

  const topCenterIdx = segs * 2;
  const bottomCenterIdx = segs * 2 + 1;
  if (capped) {
    positions[topCenterIdx * 3] = cx;
    positions[topCenterIdx * 3 + 1] = cy + halfH;
    positions[topCenterIdx * 3 + 2] = cz;
    positions[bottomCenterIdx * 3] = cx;
    positions[bottomCenterIdx * 3 + 1] = cy - halfH;
    positions[bottomCenterIdx * 3 + 2] = cz;
  }

  const indexList: number[] = [];
  for (let i = 0; i < segs; i += 1) {
    const next = (i + 1) % segs;
    const t0 = i;
    const t1 = next;
    const b0 = segs + i;
    const b1 = segs + next;
    indexList.push(b0, b1, t1, b0, t1, t0);
    if (capped) {
      indexList.push(topCenterIdx, t0, t1);
      indexList.push(bottomCenterIdx, b1, b0);
    }
  }

  return {
    positions,
    indices: new Uint32Array(indexList),
  };
}
