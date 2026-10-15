/**
 * SketchUp식 추론(Inference) 파이프라인이 공유하는 순수 벡터·행렬 수학.
 *
 * three.js·DOM·React에 의존하지 않는다. 기존에 `scene-3d/studio-3d-inference-engine.ts`와
 * `studio-build-inference-snap.ts`가 각자 따로 들고 있던 중복 수학(중점·최근접점·교차)을 한곳으로
 * 모으고, 두 엔진은 이 모듈의 어댑터가 된다. 모든 함수는 입력을 변형하지 않고 새 값을 돌려준다.
 */

export type StudioBg3dInferenceVec3 = readonly [number, number, number];
/** three.js `Matrix4.elements`와 같은 열 우선(column-major) 16개 숫자. */
export type StudioBg3dInferenceMat4 = readonly number[];

type V3 = StudioBg3dInferenceVec3;

export const STUDIO_BG3D_INFERENCE_EPSILON = 1e-9;
/** 장면 좌표 한계 — 줄자·변형 스냅 계획기와 같은 ±10,000m 계약. */
export const STUDIO_BG3D_INFERENCE_MAX_WORLD_COORDINATE = 10_000;

export const STUDIO_BG3D_INFERENCE_IDENTITY_MATRIX: StudioBg3dInferenceMat4 = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

function canonicalNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function vec3(x: number, y: number, z: number): V3 {
  return Object.freeze([canonicalNumber(x), canonicalNumber(y), canonicalNumber(z)] as const);
}

export function isFiniteVec3(value: unknown): value is V3 {
  return Array.isArray(value)
    && value.length === 3
    && value.every((component) => typeof component === "number" && Number.isFinite(component));
}

export function isWithinWorldBounds(
  value: V3,
  limit = STUDIO_BG3D_INFERENCE_MAX_WORLD_COORDINATE,
): boolean {
  return Math.abs(value[0]) <= limit && Math.abs(value[1]) <= limit && Math.abs(value[2]) <= limit;
}

export function add(a: V3, b: V3): V3 {
  return vec3(a[0] + b[0], a[1] + b[1], a[2] + b[2]);
}

export function sub(a: V3, b: V3): V3 {
  return vec3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function scale(a: V3, factor: number): V3 {
  return vec3(a[0] * factor, a[1] * factor, a[2] * factor);
}

export function addScaled(base: V3, direction: V3, factor: number): V3 {
  return vec3(
    base[0] + direction[0] * factor,
    base[1] + direction[1] * factor,
    base[2] + direction[2] * factor,
  );
}

export function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: V3, b: V3): V3 {
  return vec3(
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  );
}

export function lengthSquared(a: V3): number {
  return dot(a, a);
}

export function length(a: V3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function distanceSquared(a: V3, b: V3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

export function distance(a: V3, b: V3): number {
  return Math.sqrt(distanceSquared(a, b));
}

export function midpoint(a: V3, b: V3): V3 {
  return vec3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

export function lerp(a: V3, b: V3, t: number): V3 {
  return vec3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

/** 길이가 0에 가까우면 null — 호출자가 "방향 없음"을 명시적으로 다루게 한다. */
export function normalize(a: V3): V3 | null {
  const magnitude = length(a);
  if (!Number.isFinite(magnitude) || magnitude < STUDIO_BG3D_INFERENCE_EPSILON) return null;
  return vec3(a[0] / magnitude, a[1] / magnitude, a[2] / magnitude);
}

export function nearlyEqual(a: V3, b: V3, tolerance = 1e-6): boolean {
  return distanceSquared(a, b) <= tolerance * tolerance;
}

export interface StudioBg3dInferenceClosestOnSegment {
  readonly point: V3;
  /** 선분 위 매개변수(0=시작, 1=끝). */
  readonly t: number;
}

/** 점 P에서 선분 AB까지 가장 가까운 점. 길이 0인 선분은 A를 돌려준다. */
export function closestPointOnSegment(p: V3, a: V3, b: V3): StudioBg3dInferenceClosestOnSegment {
  const ab = sub(b, a);
  const lengthSq = lengthSquared(ab);
  if (lengthSq < STUDIO_BG3D_INFERENCE_EPSILON * STUDIO_BG3D_INFERENCE_EPSILON) {
    return { point: a, t: 0 };
  }
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lengthSq));
  return { point: addScaled(a, ab, t), t };
}

export interface StudioBg3dInferenceClosestOnLine {
  readonly point: V3;
  /** `direction` 단위 길이 기준 부호 있는 거리. */
  readonly t: number;
}

/** 무한 직선(origin + t·direction) 위 가장 가까운 점. direction은 단위 벡터여야 한다. */
export function closestPointOnLine(p: V3, origin: V3, direction: V3): StudioBg3dInferenceClosestOnLine {
  const t = dot(sub(p, origin), direction);
  return { point: addScaled(origin, direction, t), t };
}

export interface StudioBg3dInferenceSegmentPairClosest {
  readonly s: number;
  readonly t: number;
  readonly pointA: V3;
  readonly pointB: V3;
  readonly distance: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * 두 선분 P1Q1, P2Q2 사이 최근접점 쌍(Ericson, Real-Time Collision Detection 5.1.9).
 * 평행·퇴화 선분도 안전하게 처리한다. 레이는 충분히 긴 선분으로 표현해 이 함수로 처리한다.
 */
export function closestPointsBetweenSegments(
  p1: V3,
  q1: V3,
  p2: V3,
  q2: V3,
): StudioBg3dInferenceSegmentPairClosest {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const eps = STUDIO_BG3D_INFERENCE_EPSILON * STUDIO_BG3D_INFERENCE_EPSILON;
  let s: number;
  let t: number;
  if (a <= eps && e <= eps) {
    s = 0;
    t = 0;
  } else if (a <= eps) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= eps) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > eps * Math.max(a, e) ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const pointA = addScaled(p1, d1, s);
  const pointB = addScaled(p2, d2, t);
  return { s, t, pointA, pointB, distance: distance(pointA, pointB) };
}

export interface StudioBg3dInferenceLinePairClosest {
  readonly s: number;
  readonly t: number;
  readonly pointA: V3;
  readonly pointB: V3;
  readonly distance: number;
}

/**
 * 두 무한 직선의 최근접점. 평행하면 null. 방향은 단위 벡터여야 하며 s/t는 각 직선의 부호 있는 거리다.
 */
export function closestPointsBetweenLines(
  originA: V3,
  directionA: V3,
  originB: V3,
  directionB: V3,
): StudioBg3dInferenceLinePairClosest | null {
  const r = sub(originA, originB);
  const b = dot(directionA, directionB);
  const denom = 1 - b * b;
  if (denom < 1e-12) return null;
  const d = dot(directionA, r);
  const e = dot(directionB, r);
  const s = (b * e - d) / denom;
  const t = (e - b * d) / denom;
  const pointA = addScaled(originA, directionA, s);
  const pointB = addScaled(originB, directionB, t);
  return { s, t, pointA, pointB, distance: distance(pointA, pointB) };
}

/**
 * 두 선분이 실제로 만나는 점(최근접 거리 ≤ tolerance). 만나지 않거나 평행·퇴화면 null.
 * 3D 교차는 수치 오차 때문에 정확히 0이 되지 않으므로 허용 오차를 명시적으로 받는다.
 */
export function segmentIntersection(
  a1: V3,
  a2: V3,
  b1: V3,
  b2: V3,
  tolerance = 1e-4,
): V3 | null {
  const da = sub(a2, a1);
  const db = sub(b2, b1);
  const na = normalize(da);
  const nb = normalize(db);
  if (!na || !nb) return null;
  if (1 - Math.abs(dot(na, nb)) < 1e-9) return null;
  const closest = closestPointsBetweenSegments(a1, a2, b1, b2);
  if (closest.distance > tolerance) return null;
  return midpoint(closest.pointA, closest.pointB);
}

/** 직선과 평면의 교점. 평행이면 null. */
export function intersectLineWithPlane(
  origin: V3,
  direction: V3,
  planePoint: V3,
  planeNormal: V3,
): { readonly point: V3; readonly t: number } | null {
  const denom = dot(direction, planeNormal);
  if (Math.abs(denom) < 1e-12) return null;
  const t = dot(sub(planePoint, origin), planeNormal) / denom;
  return { point: addScaled(origin, direction, t), t };
}

export function pointToPlaneDistance(point: V3, planePoint: V3, planeNormal: V3): number {
  return dot(sub(point, planePoint), planeNormal);
}

// ---------------------------------------------------------------------------------------------
// 행렬 — three.js와 같은 열 우선 배치와 오일러 'XYZ' 합성 순서(R = Rx·Ry·Rz)를 따른다.
// ---------------------------------------------------------------------------------------------

export function isFiniteMatrix(matrix: unknown): matrix is StudioBg3dInferenceMat4 {
  return Array.isArray(matrix)
    && matrix.length === 16
    && matrix.every((component) => typeof component === "number" && Number.isFinite(component));
}

/** three.js `Matrix4.compose(position, Quaternion.setFromEuler(rotation 'XYZ'), scale)`와 같은 결과. */
export function composeTrsMatrix(position: V3, rotation: V3, scaleXyz: V3): StudioBg3dInferenceMat4 {
  const a = Math.cos(rotation[0]);
  const b = Math.sin(rotation[0]);
  const c = Math.cos(rotation[1]);
  const d = Math.sin(rotation[1]);
  const e = Math.cos(rotation[2]);
  const f = Math.sin(rotation[2]);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  const sx = scaleXyz[0];
  const sy = scaleXyz[1];
  const sz = scaleXyz[2];
  return Object.freeze([
    c * e * sx, (af + be * d) * sx, (bf - ae * d) * sx, 0,
    -c * f * sy, (ae - bf * d) * sy, (be + af * d) * sy, 0,
    d * sz, -b * c * sz, a * c * sz, 0,
    position[0], position[1], position[2], 1,
  ]);
}

/** a·b (열 우선 행렬 곱: 결과를 점에 적용하면 b가 먼저, a가 나중에 적용된다). */
export function multiplyMatrices(a: StudioBg3dInferenceMat4, b: StudioBg3dInferenceMat4): StudioBg3dInferenceMat4 {
  const result: number[] = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
      }
      result[column * 4 + row] = sum;
    }
  }
  return Object.freeze(result);
}

export function transformPoint(matrix: StudioBg3dInferenceMat4, point: V3): V3 {
  const m = matrix;
  const x = point[0];
  const y = point[1];
  const z = point[2];
  const w = (m[3] ?? 0) * x + (m[7] ?? 0) * y + (m[11] ?? 0) * z + (m[15] ?? 1);
  const inverseW = w !== 0 && Number.isFinite(w) ? 1 / w : 1;
  return vec3(
    ((m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0)) * inverseW,
    ((m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0)) * inverseW,
    ((m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0)) * inverseW,
  );
}

/** 이동 성분을 제외하고 방향 벡터만 변환한다. */
export function transformVector(matrix: StudioBg3dInferenceMat4, vector: V3): V3 {
  const m = matrix;
  return vec3(
    (m[0] ?? 0) * vector[0] + (m[4] ?? 0) * vector[1] + (m[8] ?? 0) * vector[2],
    (m[1] ?? 0) * vector[0] + (m[5] ?? 0) * vector[1] + (m[9] ?? 0) * vector[2],
    (m[2] ?? 0) * vector[0] + (m[6] ?? 0) * vector[1] + (m[10] ?? 0) * vector[2],
  );
}

export type StudioBg3dInferenceMat3 = readonly [number, number, number, number, number, number, number, number, number];

/** 행 우선 3×3 역행렬. 특이 행렬이면 null. 인자는 열 벡터 c0,c1,c2로 이루어진 행렬이다. */
export function invertColumns3(c0: V3, c1: V3, c2: V3): StudioBg3dInferenceMat3 | null {
  const det = dot(c0, cross(c1, c2));
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) return null;
  const inverseDet = 1 / det;
  const r0 = scale(cross(c1, c2), inverseDet);
  const r1 = scale(cross(c2, c0), inverseDet);
  const r2 = scale(cross(c0, c1), inverseDet);
  return Object.freeze([
    r0[0], r0[1], r0[2],
    r1[0], r1[1], r1[2],
    r2[0], r2[1], r2[2],
  ] as const);
}

export function applyMatrix3(matrix: StudioBg3dInferenceMat3, vector: V3): V3 {
  return vec3(
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  );
}
