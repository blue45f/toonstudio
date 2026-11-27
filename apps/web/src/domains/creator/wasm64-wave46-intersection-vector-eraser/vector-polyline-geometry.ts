/**
 * Wave-46: 벡터 선화 공통 2D 기하 연산 및 무손실 필압·곡률 호장 슬라이싱 유틸리티.
 *
 * 공간 해시 교차점 추출, 교차점 지우개 절단, 자석 끝점 용접 커널이 공통으로 사용하는
 * 수치 안정 2D 벡터 연산과 Fritsch-Carlson 단조 3차 에르미트 보간기를 제공한다.
 */

export interface VectorPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface VectorLineartStroke {
  readonly id: string;
  /** 폴리라인 정점 좌표 배열 (2개 이상이어야 유효 선분 구성) */
  readonly points: readonly VectorPoint2D[];
  /** 정점별 정규화 필압 배열 [0..1] */
  readonly pressures: readonly number[];
  /** 선택적 정점별 부호 있는 곡률(1/px). 생략 시 폴리라인 Menger 곡률로 산출 */
  readonly curvatures?: readonly number[];
  /** 선택적 기본 선폭(px) */
  readonly baseWidthPx?: number;
  /** 닫힌 루프 여부 (기본값 false) */
  readonly closed?: boolean;
}

export interface PointToSegmentProjection {
  readonly distance: number;
  readonly t: number;
  readonly closestX: number;
  readonly closestY: number;
}

export interface SegmentIntersectionHit {
  readonly tA: number;
  readonly tB: number;
  readonly x: number;
  readonly y: number;
}

export interface RaySegmentHit {
  readonly rayDist: number;
  readonly segT: number;
  readonly point: VectorPoint2D;
}

interface InterpolatedStrokeSample {
  readonly point: VectorPoint2D;
  readonly pressure: number;
  readonly curvature: number;
}

const RAD_TO_DEG = 180 / Math.PI;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function distanceBetweenPoints(a: VectorPoint2D, b: VectorPoint2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function normalizeVector(dx: number, dy: number): VectorPoint2D {
  const len = Math.hypot(dx, dy);
  if (len <= 1e-12) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

export function angleBetweenUnitVectorsDeg(u: VectorPoint2D, v: VectorPoint2D): number {
  return Math.acos(clampNumber(u.x * v.x + u.y * v.y, -1, 1)) * RAD_TO_DEG;
}

export function estimateStrokeOutwardTangent(
  points: readonly VectorPoint2D[],
  side: "start" | "end",
  samplePx: number,
): VectorPoint2D {
  if (points.length < 2) return { x: 1, y: 0 };
  const isStart = side === "start";
  const originIdx = isStart ? 0 : points.length - 1;
  const step = isStart ? 1 : -1;
  const origin = points[originIdx];
  if (!origin) return { x: 1, y: 0 };

  let walked = 0;
  let anchor = points[originIdx + step] ?? origin;
  for (let i = originIdx + step; i >= 0 && i < points.length; i += step) {
    const prev = points[i - step];
    const curr = points[i];
    if (!prev || !curr) continue;
    const segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (walked + segLen >= samplePx && segLen > 1e-9) {
      const ratio = (samplePx - walked) / segLen;
      anchor = { x: prev.x + (curr.x - prev.x) * ratio, y: prev.y + (curr.y - prev.y) * ratio };
      break;
    }
    walked += segLen;
    anchor = curr;
  }
  return normalizeVector(origin.x - anchor.x, origin.y - anchor.y);
}

export function normalizeStrokePressures(
  pointsLength: number,
  pressures: readonly number[],
): readonly number[] {
  const out = new Array<number>(pointsLength);
  for (let i = 0; i < pointsLength; i += 1) {
    const raw = pressures[i] ?? pressures[pressures.length - 1] ?? 0.5;
    out[i] = clampNumber(raw, 0, 1);
  }
  return out;
}

export function computeStrokeArcLengths(
  points: readonly VectorPoint2D[],
  closed = false,
): { readonly cumulativeLengths: readonly number[]; readonly totalLength: number } {
  if (points.length === 0) return { cumulativeLengths: [], totalLength: 0 };
  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (a && b) total += Math.hypot(b.x - a.x, b.y - a.y);
    cumulative.push(total);
  }
  if (closed && points.length >= 3) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first && last) {
      const closingLen = Math.hypot(first.x - last.x, first.y - last.y);
      if (closingLen > 1e-6) {
        total += closingLen;
        cumulative.push(total);
      }
    }
  }
  return { cumulativeLengths: cumulative, totalLength: total };
}

export function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): PointToSegmentProjection {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-18) {
    return { distance: Math.hypot(px - ax, py - ay), t: 0, closestX: ax, closestY: ay };
  }
  const t = clampNumber(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return { distance: Math.hypot(px - closestX, py - closestY), t, closestX, closestY };
}

export function segmentSegmentIntersection(
  a1: VectorPoint2D,
  a2: VectorPoint2D,
  b1: VectorPoint2D,
  b2: VectorPoint2D,
  epsilon = 1e-6,
): SegmentIntersectionHit | null {
  const dxA = a2.x - a1.x;
  const dyA = a2.y - a1.y;
  const dxB = b2.x - b1.x;
  const dyB = b2.y - b1.y;
  const denom = dxA * dyB - dyA * dxB;
  if (Math.abs(denom) <= 1e-10) return null;
  const rx = b1.x - a1.x;
  const ry = b1.y - a1.y;
  const rawTA = (rx * dyB - ry * dxB) / denom;
  const rawTB = (rx * dyA - ry * dxA) / denom;
  if (rawTA < -epsilon || rawTA > 1 + epsilon || rawTB < -epsilon || rawTB > 1 + epsilon) {
    return null;
  }
  const tA = clampNumber(rawTA, 0, 1);
  const tB = clampNumber(rawTB, 0, 1);
  return { tA, tB, x: a1.x + tA * dxA, y: a1.y + tA * dyA };
}

export function distanceSegmentToSegment(
  a1: VectorPoint2D,
  a2: VectorPoint2D,
  b1: VectorPoint2D,
  b2: VectorPoint2D,
): number {
  if (segmentSegmentIntersection(a1, a2, b1, b2, 1e-7) !== null) return 0;
  return Math.min(
    distancePointToSegment(a1.x, a1.y, b1.x, b1.y, b2.x, b2.y).distance,
    distancePointToSegment(a2.x, a2.y, b1.x, b1.y, b2.x, b2.y).distance,
    distancePointToSegment(b1.x, b1.y, a1.x, a1.y, a2.x, a2.y).distance,
    distancePointToSegment(b2.x, b2.y, a1.x, a1.y, a2.x, a2.y).distance,
  );
}

export function raySegmentIntersection(
  origin: VectorPoint2D,
  dir: VectorPoint2D,
  segA: VectorPoint2D,
  segB: VectorPoint2D,
): RaySegmentHit | null {
  const sx = segB.x - segA.x;
  const sy = segB.y - segA.y;
  const denom = dir.x * sy - dir.y * sx;
  if (Math.abs(denom) <= 1e-10) return null;
  const rx = segA.x - origin.x;
  const ry = segA.y - origin.y;
  const rayDist = (rx * sy - ry * sx) / denom;
  const segT = (rx * dir.y - ry * dir.x) / denom;
  if (rayDist < -1e-6 || segT < -1e-6 || segT > 1 + 1e-6) return null;
  const clampedT = clampNumber(segT, 0, 1);
  return {
    rayDist: Math.max(0, rayDist),
    segT: clampedT,
    point: { x: segA.x + clampedT * sx, y: segA.y + clampedT * sy },
  };
}

export function computePolylineCurvatures(points: readonly VectorPoint2D[]): readonly number[] {
  const n = points.length;
  if (n === 0) return [];
  if (n < 3) return new Array<number>(n).fill(0);
  const curvatures = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    if (!prev || !curr || !next) continue;
    const abx = curr.x - prev.x;
    const aby = curr.y - prev.y;
    const bcx = next.x - curr.x;
    const bcy = next.y - curr.y;
    const denom = Math.hypot(abx, aby) * Math.hypot(bcx, bcy) * Math.hypot(next.x - prev.x, next.y - prev.y);
    curvatures[i] = denom <= 1e-12 ? 0 : (2 * (abx * bcy - aby * bcx)) / denom;
  }
  curvatures[0] = curvatures[1] ?? 0;
  curvatures[n - 1] = curvatures[n - 2] ?? 0;
  return curvatures;
}

/**
 * Fritsch-Carlson 단조 3차 에르미트 보간으로 필압·곡률의 C1 연속성을 유지하면서
 * 양 끝 정점 값 범위를 벗어나는 오버슈트를 원천 차단한다.
 */
function interpolateMonotoneHermite(
  values: readonly number[],
  cumulativeLengths: readonly number[],
  segIndex: number,
  u: number,
): number {
  const v0 = values[segIndex] ?? 0;
  const v1 = values[segIndex + 1] ?? v0;
  const h = (cumulativeLengths[segIndex + 1] ?? 0) - (cumulativeLengths[segIndex] ?? 0);
  if (h <= 1e-9) return v0;
  const delta = (v1 - v0) / h;

  const slopeAt = (idx: number): number => {
    if (idx <= 0 || idx >= values.length - 1) return delta;
    const hL = (cumulativeLengths[idx] ?? 0) - (cumulativeLengths[idx - 1] ?? 0);
    const hR = (cumulativeLengths[idx + 1] ?? 0) - (cumulativeLengths[idx] ?? 0);
    if (hL <= 1e-9 || hR <= 1e-9) return 0;
    const dL = ((values[idx] ?? 0) - (values[idx - 1] ?? 0)) / hL;
    const dR = ((values[idx + 1] ?? 0) - (values[idx] ?? 0)) / hR;
    if (dL * dR <= 0) return 0;
    const w1 = 2 * hR + hL;
    const w2 = hR + 2 * hL;
    return (w1 + w2) / (w1 / dL + w2 / dR);
  };

  let m0 = slopeAt(segIndex);
  let m1 = slopeAt(segIndex + 1);
  if (Math.abs(delta) <= 1e-12) {
    m0 = 0;
    m1 = 0;
  } else {
    const alpha = m0 / delta;
    const beta = m1 / delta;
    const normSq = alpha * alpha + beta * beta;
    if (normSq > 9) {
      const tau = 3 / Math.sqrt(normSq);
      m0 = tau * alpha * delta;
      m1 = tau * beta * delta;
    }
  }

  const t = clampNumber(u, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  const value =
    (2 * t3 - 3 * t2 + 1) * v0 +
    (t3 - 2 * t2 + t) * h * m0 +
    (-2 * t3 + 3 * t2) * v1 +
    (t3 - t2) * h * m1;
  return clampNumber(value, Math.min(v0, v1), Math.max(v0, v1));
}

function sampleStrokeAtArcLength(
  points: readonly VectorPoint2D[],
  pressures: readonly number[],
  curvatures: readonly number[],
  cumulativeLengths: readonly number[],
  targetArc: number,
): InterpolatedStrokeSample {
  const segCount = Math.max(0, cumulativeLengths.length - 1);
  const clampedArc = clampNumber(targetArc, 0, cumulativeLengths[segCount] ?? 0);
  let segIndex = 0;
  while (segIndex < segCount - 1 && (cumulativeLengths[segIndex + 1] ?? 0) < clampedArc) {
    segIndex += 1;
  }
  const s0 = cumulativeLengths[segIndex] ?? 0;
  const segLen = (cumulativeLengths[segIndex + 1] ?? s0) - s0;
  const u = segLen > 1e-9 ? clampNumber((clampedArc - s0) / segLen, 0, 1) : 0;
  const p0 = points[segIndex] ?? { x: 0, y: 0 };
  const p1 = points[(segIndex + 1) % points.length] ?? p0;
  const point: VectorPoint2D = { x: p0.x + u * (p1.x - p0.x), y: p0.y + u * (p1.y - p0.y) };

  if (segIndex + 1 < points.length) {
    return {
      point,
      pressure: clampNumber(interpolateMonotoneHermite(pressures, cumulativeLengths, segIndex, u), 0, 1),
      curvature: interpolateMonotoneHermite(curvatures, cumulativeLengths, segIndex, u),
    };
  }
  const pr0 = pressures[segIndex] ?? 0.5;
  const pr1 = pressures[0] ?? pr0;
  const cv0 = curvatures[segIndex] ?? 0;
  const cv1 = curvatures[0] ?? cv0;
  return { point, pressure: clampNumber(pr0 + u * (pr1 - pr0), 0, 1), curvature: cv0 + u * (cv1 - cv0) };
}

export function sliceStrokeByArcRange(
  stroke: VectorLineartStroke,
  startArc: number,
  endArc: number,
  newId: string,
): VectorLineartStroke | null {
  if (stroke.points.length < 2) return null;
  const closed = Boolean(stroke.closed && stroke.points.length >= 3);
  const { cumulativeLengths, totalLength } = computeStrokeArcLengths(stroke.points, closed);
  const clampedStart = clampNumber(startArc, 0, totalLength);
  const clampedEnd = clampNumber(endArc, 0, totalLength);
  if (clampedEnd - clampedStart <= 1e-6) return null;

  const pressures = normalizeStrokePressures(stroke.points.length, stroke.pressures);
  const curvatures =
    stroke.curvatures && stroke.curvatures.length === stroke.points.length
      ? stroke.curvatures
      : computePolylineCurvatures(stroke.points);
  const outPoints: VectorPoint2D[] = [];
  const outPressures: number[] = [];
  const outCurvatures: number[] = [];

  const appendSample = (sample: InterpolatedStrokeSample): void => {
    const prev = outPoints[outPoints.length - 1];
    if (prev && Math.hypot(sample.point.x - prev.x, sample.point.y - prev.y) <= 1e-6) return;
    outPoints.push(sample.point);
    outPressures.push(sample.pressure);
    outCurvatures.push(sample.curvature);
  };

  appendSample(sampleStrokeAtArcLength(stroke.points, pressures, curvatures, cumulativeLengths, clampedStart));
  // 절단 구간 안쪽의 원본 정점·필압·곡률은 보간 변형 없이 그대로 보존한다.
  for (let i = 0; i < stroke.points.length; i += 1) {
    const vertexArc = cumulativeLengths[i];
    const pt = stroke.points[i];
    if (vertexArc === undefined || !pt) continue;
    if (vertexArc > clampedStart + 1e-6 && vertexArc < clampedEnd - 1e-6) {
      appendSample({ point: { x: pt.x, y: pt.y }, pressure: pressures[i] ?? 0.5, curvature: curvatures[i] ?? 0 });
    }
  }
  appendSample(sampleStrokeAtArcLength(stroke.points, pressures, curvatures, cumulativeLengths, clampedEnd));
  if (outPoints.length < 2) return null;

  return {
    id: newId,
    points: outPoints,
    pressures: outPressures,
    curvatures: outCurvatures,
    ...(stroke.baseWidthPx !== undefined ? { baseWidthPx: stroke.baseWidthPx } : {}),
    closed: false,
  };
}
