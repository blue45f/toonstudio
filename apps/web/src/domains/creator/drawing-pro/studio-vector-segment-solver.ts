/**
 * 클린룸 평면 폴리라인 교차점 솔버 및 호길이 슬라이싱 코어.
 *
 * - 2단계 AABB(스트로크·세그먼트 바운딩 박스) 프리필터로 교차 불가능 쌍을 사전 기각한다.
 * - 선분 매개변수 t, u ∈ [0, 1] 교차 해와 공선(collinear) 겹침 경계를 계산하고,
 *   열린/닫힌 폴리라인 호길이 슬라이싱을 선형 보간으로 수행한다.
 */

export interface Vector2D {
  readonly x: number;
  readonly y: number;
}

export interface VectorAabb2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface VectorPolylinePoint {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly pressure?: number;
}

export interface VectorPolylineStroke {
  readonly id: string;
  readonly points: readonly VectorPolylinePoint[];
  readonly closed?: boolean;
  readonly color?: string;
  readonly layerId?: string;
}

export interface SegmentIntersectionHit {
  /** 세그먼트 A 매개변수 t ∈ [0, 1] */
  readonly t: number;
  /** 세그먼트 B 매개변수 u ∈ [0, 1] */
  readonly u: number;
  readonly point: Vector2D;
  readonly kind: "proper" | "endpoint" | "collinear-boundary";
}

export interface PolylineIntersectionRecord {
  readonly strokeAId: string;
  readonly segmentAIndex: number;
  readonly tA: number;
  readonly arcA: number;
  readonly strokeBId: string;
  readonly segmentBIndex: number;
  readonly tB: number;
  readonly arcB: number;
  readonly point: Vector2D;
  readonly selfIntersection: boolean;
}

export interface VectorIntersectionStats {
  readonly strokePairsTested: number;
  readonly strokePairsCulledByAabb: number;
  readonly segmentPairsTested: number;
  readonly segmentPairsCulledByAabb: number;
}

export interface IndexedSegment {
  readonly index: number;
  readonly p0: VectorPolylinePoint;
  readonly p1: VectorPolylinePoint;
  readonly length: number;
  readonly startArc: number;
  readonly endArc: number;
  readonly aabb: VectorAabb2D;
}

export interface IndexedStroke {
  readonly stroke: VectorPolylineStroke;
  readonly closed: boolean;
  readonly segments: readonly IndexedSegment[];
  readonly totalLength: number;
  readonly aabb: VectorAabb2D;
}

export interface FindPolylineIntersectionsOptions {
  readonly referOtherStrokes?: boolean;
  readonly includeSelfIntersections?: boolean;
  readonly intersectionEpsilon?: number;
}

export const DEFAULT_INTERSECTION_EPS = 1e-6;
export const DEFAULT_MERGE_CUT_EPS = 1e-3;

export function finiteNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function cross2D(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** 두 점으로 이루어진 선분의 AABB를 계산한다. */
export function computeSegmentAabb(a: Vector2D, b: Vector2D): VectorAabb2D {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

/** 폴리라인 전체의 AABB를 계산한다. 점이 없으면 빈 AABB를 반환한다. */
export function computePolylineAabb(points: readonly Vector2D[]): VectorAabb2D {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i]!;
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  return { minX, minY, maxX, maxY };
}

/** 두 AABB가 허용 오차(padding) 내에서 겹치는지 O(1) 프리필터로 판정한다. */
export function aabbsOverlap(a: VectorAabb2D, b: VectorAabb2D, padding = 0): boolean {
  return !(
    a.maxX + padding < b.minX
    || b.maxX + padding < a.minX
    || a.maxY + padding < b.minY
    || b.maxY + padding < a.minY
  );
}

/**
 * 평면 두 선분 (a0→a1), (b0→b1)의 교차점을 매개변수 t, u ∈ [0, 1] 로 계산한다.
 * 1단계 AABB 프리필터 후 외적 행렬식과 공선 겹침 경계를 계산한다.
 */
export function intersectSegments2D(
  a0: Vector2D,
  a1: Vector2D,
  b0: Vector2D,
  b1: Vector2D,
  epsilon = DEFAULT_INTERSECTION_EPS,
): readonly SegmentIntersectionHit[] {
  const eps = Math.max(1e-12, finiteNumber(epsilon, DEFAULT_INTERSECTION_EPS));
  if (!aabbsOverlap(computeSegmentAabb(a0, a1), computeSegmentAabb(b0, b1), eps)) {
    return [];
  }

  const rx = a1.x - a0.x;
  const ry = a1.y - a0.y;
  const sx = b1.x - b0.x;
  const sy = b1.y - b0.y;
  const lenASq = rx * rx + ry * ry;
  const lenBSq = sx * sx + sy * sy;
  if (lenASq <= eps * eps || lenBSq <= eps * eps) {
    return [];
  }

  const wx = b0.x - a0.x;
  const wy = b0.y - a0.y;
  const denom = cross2D(rx, ry, sx, sy);
  const detEps = eps * Math.max(1, Math.sqrt(lenASq * lenBSq));

  if (Math.abs(denom) > detEps) {
    const tRaw = cross2D(wx, wy, sx, sy) / denom;
    const uRaw = cross2D(wx, wy, rx, ry) / denom;
    const tEps = Math.min(1e-4, eps / Math.max(1, Math.sqrt(lenASq)) + 1e-7);
    const uEps = Math.min(1e-4, eps / Math.max(1, Math.sqrt(lenBSq)) + 1e-7);

    if (tRaw < -tEps || tRaw > 1 + tEps || uRaw < -uEps || uRaw > 1 + uEps) {
      return [];
    }
    const t = clamp01(tRaw);
    const u = clamp01(uRaw);
    const isEndpoint = t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6;
    return [
      {
        t,
        u,
        point: { x: a0.x + t * rx, y: a0.y + t * ry },
        kind: isEndpoint ? "endpoint" : "proper",
      },
    ];
  }

  // 평행 또는 공선 판정
  const collinearDist = Math.abs(cross2D(wx, wy, rx, ry)) / Math.sqrt(lenASq);
  if (collinearDist > eps * 10) return [];

  const t0 = (wx * rx + wy * ry) / lenASq;
  const t1 = ((b1.x - a0.x) * rx + (b1.y - a0.y) * ry) / lenASq;
  const lo = Math.max(0, Math.min(t0, t1));
  const hi = Math.min(1, Math.max(t0, t1));
  if (lo > hi + 1e-7) return [];

  const hits: SegmentIntersectionHit[] = [];
  const pushBoundary = (tVal: number): void => {
    const t = clamp01(tVal);
    const px = a0.x + t * rx;
    const py = a0.y + t * ry;
    const u = clamp01(((px - b0.x) * sx + (py - b0.y) * sy) / lenBSq);
    hits.push({ t, u, point: { x: px, y: py }, kind: "collinear-boundary" });
  };
  pushBoundary(lo);
  if (hi - lo > 1e-6) pushBoundary(hi);
  return hits;
}

export function indexPolylineStroke(stroke: VectorPolylineStroke): IndexedStroke {
  const pts = stroke.points;
  const closed = Boolean(stroke.closed) && pts.length >= 3;
  const segments: IndexedSegment[] = [];
  let cursor = 0;

  if (pts.length >= 2) {
    const segCount = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount; i += 1) {
      const p0 = pts[i]!;
      const p1 = pts[(i + 1) % pts.length]!;
      const length = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (length <= 1e-9) continue;
      segments.push({
        index: segments.length,
        p0,
        p1,
        length,
        startArc: cursor,
        endArc: cursor + length,
        aabb: computeSegmentAabb(p0, p1),
      });
      cursor += length;
    }
  }

  return {
    stroke,
    closed,
    segments,
    totalLength: cursor,
    aabb: computePolylineAabb(pts),
  };
}

function areAdjacentSegments(
  segA: number,
  segB: number,
  totalSegments: number,
  closed: boolean,
): boolean {
  if (Math.abs(segA - segB) <= 1) return true;
  if (closed && totalSegments >= 3) {
    return (segA === 0 && segB === totalSegments - 1) || (segB === 0 && segA === totalSegments - 1);
  }
  return false;
}

export function dedupeSortedCuts(
  values: readonly number[],
  totalLength: number,
  closed: boolean,
  mergeEps: number,
): readonly number[] {
  if (values.length === 0 || totalLength <= 0) return [];
  const normalized: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    let v = values[i]!;
    if (!Number.isFinite(v)) continue;
    if (closed) {
      v = ((v % totalLength) + totalLength) % totalLength;
      if (totalLength - v <= mergeEps) v = 0;
      normalized.push(v);
    } else if (v > mergeEps && v < totalLength - mergeEps) {
      normalized.push(v);
    }
  }
  normalized.sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const v = normalized[i]!;
    if (out.length === 0 || v - out[out.length - 1]! > mergeEps) {
      out.push(v);
    }
  }
  if (closed && out.length >= 2 && totalLength - out[out.length - 1]! + out[0]! <= mergeEps) {
    out.pop();
  }
  return out;
}

/**
 * 전체 스트로크 집합에서 2단 AABB 프리필터 기반으로 교차점과 분할 호길이를 산출한다.
 */
export function findPolylineIntersections(
  strokes: readonly VectorPolylineStroke[],
  options: FindPolylineIntersectionsOptions = {},
): {
  readonly intersections: readonly PolylineIntersectionRecord[];
  readonly cutsByStrokeId: ReadonlyMap<string, readonly number[]>;
  readonly stats: VectorIntersectionStats;
} {
  const referOtherStrokes = options.referOtherStrokes ?? true;
  const includeSelf = options.includeSelfIntersections ?? true;
  const eps = Math.max(1e-12, finiteNumber(options.intersectionEpsilon, DEFAULT_INTERSECTION_EPS));

  const indexed = strokes.map(indexPolylineStroke);
  const intersections: PolylineIntersectionRecord[] = [];
  const rawCuts = new Map<string, number[]>();
  for (const item of indexed) rawCuts.set(item.stroke.id, []);

  let strokePairsTested = 0;
  let strokePairsCulledByAabb = 0;
  let segmentPairsTested = 0;
  let segmentPairsCulledByAabb = 0;

  if (includeSelf) {
    for (const item of indexed) {
      const segs = item.segments;
      for (let i = 0; i < segs.length; i += 1) {
        const segA = segs[i]!;
        for (let j = i + 2; j < segs.length; j += 1) {
          if (areAdjacentSegments(i, j, segs.length, item.closed)) continue;
          const segB = segs[j]!;
          if (!aabbsOverlap(segA.aabb, segB.aabb, eps)) {
            segmentPairsCulledByAabb += 1;
            continue;
          }
          segmentPairsTested += 1;
          for (const hit of intersectSegments2D(segA.p0, segA.p1, segB.p0, segB.p1, eps)) {
            const arcA = segA.startArc + hit.t * segA.length;
            const arcB = segB.startArc + hit.u * segB.length;
            intersections.push({
              strokeAId: item.stroke.id,
              segmentAIndex: segA.index,
              tA: hit.t,
              arcA,
              strokeBId: item.stroke.id,
              segmentBIndex: segB.index,
              tB: hit.u,
              arcB,
              point: hit.point,
              selfIntersection: true,
            });
            rawCuts.get(item.stroke.id)?.push(arcA, arcB);
          }
        }
      }
    }
  }

  if (referOtherStrokes) {
    for (let i = 0; i < indexed.length; i += 1) {
      const a = indexed[i]!;
      if (a.segments.length === 0) continue;
      for (let j = i + 1; j < indexed.length; j += 1) {
        const b = indexed[j]!;
        if (b.segments.length === 0) continue;
        if (!aabbsOverlap(a.aabb, b.aabb, eps)) {
          strokePairsCulledByAabb += 1;
          continue;
        }
        strokePairsTested += 1;
        for (let sa = 0; sa < a.segments.length; sa += 1) {
          const segA = a.segments[sa]!;
          if (!aabbsOverlap(segA.aabb, b.aabb, eps)) {
            segmentPairsCulledByAabb += b.segments.length;
            continue;
          }
          for (let sb = 0; sb < b.segments.length; sb += 1) {
            const segB = b.segments[sb]!;
            if (!aabbsOverlap(segA.aabb, segB.aabb, eps)) {
              segmentPairsCulledByAabb += 1;
              continue;
            }
            segmentPairsTested += 1;
            for (const hit of intersectSegments2D(segA.p0, segA.p1, segB.p0, segB.p1, eps)) {
              const arcA = segA.startArc + hit.t * segA.length;
              const arcB = segB.startArc + hit.u * segB.length;
              intersections.push({
                strokeAId: a.stroke.id,
                segmentAIndex: segA.index,
                tA: hit.t,
                arcA,
                strokeBId: b.stroke.id,
                segmentBIndex: segB.index,
                tB: hit.u,
                arcB,
                point: hit.point,
                selfIntersection: false,
              });
              rawCuts.get(a.stroke.id)?.push(arcA);
              rawCuts.get(b.stroke.id)?.push(arcB);
            }
          }
        }
      }
    }
  }

  const cutsByStrokeId = new Map<string, readonly number[]>();
  for (const item of indexed) {
    cutsByStrokeId.set(
      item.stroke.id,
      dedupeSortedCuts(
        rawCuts.get(item.stroke.id) ?? [],
        item.totalLength,
        item.closed,
        DEFAULT_MERGE_CUT_EPS,
      ),
    );
  }

  return {
    intersections,
    cutsByStrokeId,
    stats: {
      strokePairsTested,
      strokePairsCulledByAabb,
      segmentPairsTested,
      segmentPairsCulledByAabb,
    },
  };
}

function interpolateSegmentPoint(seg: IndexedSegment, t: number): VectorPolylinePoint {
  const clamped = clamp01(t);
  const x = lerp(seg.p0.x, seg.p1.x, clamped);
  const y = lerp(seg.p0.y, seg.p1.y, clamped);
  const hasWidth = seg.p0.width !== undefined || seg.p1.width !== undefined;
  const hasPressure = seg.p0.pressure !== undefined || seg.p1.pressure !== undefined;
  if (!hasWidth && !hasPressure) return { x, y };
  return {
    x,
    y,
    ...(hasWidth
      ? { width: lerp(finiteNumber(seg.p0.width, 1), finiteNumber(seg.p1.width, 1), clamped) }
      : {}),
    ...(hasPressure
      ? {
          pressure: lerp(
            finiteNumber(seg.p0.pressure, 0.5),
            finiteNumber(seg.p1.pressure, 0.5),
            clamped,
          ),
        }
      : {}),
  };
}

function samplePointAtArc(indexed: IndexedStroke, arcInput: number): VectorPolylinePoint {
  const { segments, totalLength, closed } = indexed;
  if (segments.length === 0) return indexed.stroke.points[0] ?? { x: 0, y: 0 };
  const arc =
    closed && totalLength > 0
      ? ((arcInput % totalLength) + totalLength) % totalLength
      : Math.max(0, Math.min(totalLength, arcInput));
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!;
    if (arc <= seg.endArc + 1e-9 || i === segments.length - 1) {
      const t = seg.length > 0 ? (arc - seg.startArc) / seg.length : 0;
      return interpolateSegmentPoint(seg, t);
    }
  }
  return segments[segments.length - 1]!.p1;
}

function pushUniquePoint(points: VectorPolylinePoint[], candidate: VectorPolylinePoint): void {
  const prev = points[points.length - 1];
  if (prev && Math.hypot(candidate.x - prev.x, candidate.y - prev.y) <= 1e-5) return;
  points.push(candidate);
}

function sliceLinearArc(
  indexed: IndexedStroke,
  rawStart: number,
  rawEnd: number,
): readonly VectorPolylinePoint[] {
  const startArc = Math.max(0, Math.min(indexed.totalLength, rawStart));
  const endArc = Math.max(0, Math.min(indexed.totalLength, rawEnd));
  if (endArc - startArc <= 1e-6) return [];

  const out: VectorPolylinePoint[] = [];
  pushUniquePoint(out, samplePointAtArc(indexed, startArc));
  for (let i = 0; i < indexed.segments.length; i += 1) {
    const seg = indexed.segments[i]!;
    if (seg.endArc <= startArc + 1e-6) continue;
    if (seg.startArc >= endArc - 1e-6) break;
    if (seg.endArc < endArc - 1e-6) pushUniquePoint(out, seg.p1);
  }
  pushUniquePoint(out, samplePointAtArc(indexed, endArc));
  return out;
}

/** 호길이 구간 [startArc, endArc]의 폴리라인 부분 조각을 매개변수 t 보간으로 추출한다. */
export function sliceIndexedPolyline(
  indexed: IndexedStroke,
  startArc: number,
  endArc: number,
): readonly VectorPolylinePoint[] {
  const { segments, totalLength, closed } = indexed;
  if (segments.length === 0 || totalLength <= 0) return [];
  if (closed && endArc > totalLength + 1e-7) {
    const merged: VectorPolylinePoint[] = [];
    for (const pt of sliceLinearArc(indexed, startArc, totalLength)) pushUniquePoint(merged, pt);
    for (const pt of sliceLinearArc(indexed, 0, endArc - totalLength)) pushUniquePoint(merged, pt);
    return merged;
  }
  return sliceLinearArc(indexed, startArc, endArc);
}
