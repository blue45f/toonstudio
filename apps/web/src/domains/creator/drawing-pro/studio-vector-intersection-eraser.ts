/**
 * 클린룸 벡터 교차점 지우개 (CSP 스타일 '교차점까지 지우기' 순수 기하 구현).
 *
 * - 평면 선분 교차점 솔버(`studio-vector-segment-solver.ts`)로 2단 AABB 프리필터와
 *   매개변수 t 교차 분할을 수행한 뒤, 지우개 히트 지점이 속한 선분 구간만 양쪽 최근접 교차점까지
 *   정확히 삭제하거나 끝단을 교차점에 맞춰 트리밍한다.
 * - 열린/닫힌 폴리라인, 자기 교차(self-intersection), 멀티포인트 드래그 지우개를 모두 지원한다.
 */

import {
  DEFAULT_MERGE_CUT_EPS,
  aabbsOverlap,
  clamp01,
  computePolylineAabb,
  dedupeSortedCuts,
  findPolylineIntersections,
  finiteNumber,
  indexPolylineStroke,
  intersectSegments2D,
  sliceIndexedPolyline,
  type IndexedStroke,
  type PolylineIntersectionRecord,
  type Vector2D,
  type VectorAabb2D,
  type VectorIntersectionStats,
  type VectorPolylinePoint,
  type VectorPolylineStroke,
} from "./studio-vector-segment-solver";

export {
  aabbsOverlap,
  computePolylineAabb,
  computeSegmentAabb,
  findPolylineIntersections,
  intersectSegments2D,
  sliceIndexedPolyline,
  type PolylineIntersectionRecord,
  type SegmentIntersectionHit,
  type Vector2D,
  type VectorAabb2D,
  type VectorIntersectionStats,
  type VectorPolylinePoint,
  type VectorPolylineStroke,
} from "./studio-vector-segment-solver";

export type VectorIntersectionEraserMode =
  | "up-to-intersection"
  | "whole-stroke"
  | "touched-area";

export type VectorEraserHitPolicy = "interior-prefer" | "all-touched-spans";

export type VectorEraserInput =
  | {
      readonly x: number;
      readonly y: number;
      readonly radiusPx: number;
    }
  | {
      readonly path: readonly Vector2D[];
      readonly radiusPx: number;
    };

export interface VectorIntersectionEraserOptions {
  /** 지우기 동작 모드. 기본값 "up-to-intersection". */
  readonly mode?: VectorIntersectionEraserMode;
  /** 다른 스트로크와의 교차점을 경계로 참조할지 여부. 기본값 true. */
  readonly referOtherStrokes?: boolean;
  /** 같은 스트로크의 비인접 자기 교차점을 경계로 참조할지 여부. 기본값 true. */
  readonly includeSelfIntersections?: boolean;
  /** 선폭 절반을 히트 반경에 합산할지 여부. 기본값 true. */
  readonly includeStrokeWidth?: boolean;
  /** 교차 판정 수치 오차. 기본값 1e-6. */
  readonly intersectionEpsilon?: number;
  /** 동일 스트로크 내 교차점 병합 호길이 허용치(px). 기본값 1e-3. */
  readonly mergeCutEpsilonPx?: number;
  /** 잔여 조각 최소 길이(px). 기본값 0.5. */
  readonly minRemainingLengthPx?: number;
  /** 교차점 경계 스침 처리 정책. 기본값 "interior-prefer". */
  readonly hitPolicy?: VectorEraserHitPolicy;
  /** 지정하면 해당 id 스트로크만 삭제 대상으로 삼는다(나머지는 교차 참조 전용). */
  readonly targetStrokeIds?: readonly string[];
}

export interface VectorIntersectionEraseResult {
  readonly strokes: readonly VectorPolylineStroke[];
  readonly intersections: readonly PolylineIntersectionRecord[];
  readonly erasedSpanCount: number;
  readonly splitStrokeCount: number;
  readonly removedStrokeIds: readonly string[];
  readonly stats: VectorIntersectionStats;
}

interface ArcSpan {
  readonly startArc: number;
  readonly endArc: number;
  readonly wrapsSeam: boolean;
}

interface SpanHitEvaluation {
  readonly spanIndex: number;
  readonly touched: boolean;
  readonly strictlyInteriorHit: boolean;
  readonly minDistance: number;
}

const DEFAULT_MIN_REMAINING_LENGTH = 0.5;
const INTERIOR_MARGIN_PX = 1e-3;

function closestPointOnSegment(
  p: Vector2D,
  a: Vector2D,
  b: Vector2D,
): { readonly distance: number; readonly t: number } {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-12) {
    return { distance: Math.hypot(p.x - a.x, p.y - a.y), t: 0 };
  }
  const t = clamp01(((p.x - a.x) * vx + (p.y - a.y) * vy) / lenSq);
  return { distance: Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy)), t };
}

function segmentToSegmentDistance(
  a0: Vector2D,
  a1: Vector2D,
  b0: Vector2D,
  b1: Vector2D,
): { readonly distance: number; readonly tA: number } {
  const hits = intersectSegments2D(a0, a1, b0, b1, 1e-7);
  if (hits.length >= 2) {
    return { distance: 0, tA: (hits[0]!.t + hits[hits.length - 1]!.t) * 0.5 };
  }
  if (hits.length === 1) return { distance: 0, tA: hits[0]!.t };

  const c1 = closestPointOnSegment(b0, a0, a1);
  const c2 = closestPointOnSegment(b1, a0, a1);
  const c3 = closestPointOnSegment(a0, b0, b1);
  const c4 = closestPointOnSegment(a1, b0, b1);

  let bestDist = c1.distance;
  let bestT = c1.t;
  if (c2.distance < bestDist) {
    bestDist = c2.distance;
    bestT = c2.t;
  }
  if (c3.distance < bestDist) {
    bestDist = c3.distance;
    bestT = 0;
  }
  if (c4.distance < bestDist) {
    bestDist = c4.distance;
    bestT = 1;
  }
  return { distance: bestDist, tA: bestT };
}

function normalizeEraserPath(input: VectorEraserInput): {
  readonly path: readonly Vector2D[];
  readonly radiusPx: number;
  readonly aabb: VectorAabb2D;
} {
  const radiusPx = Math.max(0, finiteNumber(input.radiusPx, 0));
  const rawPath: readonly Vector2D[] =
    "path" in input
      ? input.path
      : [{ x: finiteNumber(input.x, 0), y: finiteNumber(input.y, 0) }];
  const path = rawPath.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  return { path, radiusPx, aabb: computePolylineAabb(path) };
}

function evaluateSpanAgainstEraser(
  indexed: IndexedStroke,
  span: ArcSpan,
  spanIndex: number,
  eraserPath: readonly Vector2D[],
  radiusPx: number,
  includeStrokeWidth: boolean,
): SpanHitEvaluation {
  const spanPoints = sliceIndexedPolyline(indexed, span.startArc, span.endArc);
  if (spanPoints.length < 2 || eraserPath.length === 0) {
    return { spanIndex, touched: false, strictlyInteriorHit: false, minDistance: Infinity };
  }

  let spanTotalLen = 0;
  const segLengths: number[] = [];
  for (let i = 0; i < spanPoints.length - 1; i += 1) {
    const len = Math.hypot(
      spanPoints[i + 1]!.x - spanPoints[i]!.x,
      spanPoints[i + 1]!.y - spanPoints[i]!.y,
    );
    segLengths.push(len);
    spanTotalLen += len;
  }
  if (spanTotalLen <= 1e-9) {
    return { spanIndex, touched: false, strictlyInteriorHit: false, minDistance: Infinity };
  }

  let bestDistance = Infinity;
  let touched = false;
  let strictlyInteriorHit = false;
  const margin = Math.min(INTERIOR_MARGIN_PX, spanTotalLen * 0.1);
  let segStartArc = 0;

  for (let i = 0; i < spanPoints.length - 1; i += 1) {
    const p0 = spanPoints[i]!;
    const p1 = spanPoints[i + 1]!;
    const segLen = segLengths[i]!;
    const avgWidth = includeStrokeWidth
      ? (finiteNumber(p0.width, 0) + finiteNumber(p1.width, 0)) * 0.5
      : 0;
    const effectiveRadius = radiusPx + avgWidth * 0.5;

    if (eraserPath.length === 1) {
      const nearest = closestPointOnSegment(eraserPath[0]!, p0, p1);
      if (nearest.distance < bestDistance) bestDistance = nearest.distance;
      if (nearest.distance <= effectiveRadius + 1e-6) {
        touched = true;
        const hitArc = segStartArc + nearest.t * segLen;
        if (hitArc > margin && hitArc < spanTotalLen - margin) strictlyInteriorHit = true;
      }
    } else {
      for (let e = 0; e < eraserPath.length - 1; e += 1) {
        const nearest = segmentToSegmentDistance(p0, p1, eraserPath[e]!, eraserPath[e + 1]!);
        if (nearest.distance < bestDistance) bestDistance = nearest.distance;
        if (nearest.distance <= effectiveRadius + 1e-6) {
          touched = true;
          const hitArc = segStartArc + nearest.tA * segLen;
          if (hitArc > margin && hitArc < spanTotalLen - margin) strictlyInteriorHit = true;
        }
      }
    }
    segStartArc += segLen;
  }

  return { spanIndex, touched, strictlyInteriorHit, minDistance: bestDistance };
}

function buildSpansForStroke(indexed: IndexedStroke, cuts: readonly number[]): readonly ArcSpan[] {
  const { totalLength, closed } = indexed;
  if (totalLength <= 0) return [];
  if (!closed) {
    const boundaries = [0, ...cuts, totalLength];
    const spans: ArcSpan[] = [];
    for (let i = 0; i < boundaries.length - 1; i += 1) {
      const startArc = boundaries[i]!;
      const endArc = boundaries[i + 1]!;
      if (endArc - startArc > 1e-6) spans.push({ startArc, endArc, wrapsSeam: false });
    }
    return spans;
  }
  if (cuts.length < 2) return [{ startArc: 0, endArc: totalLength, wrapsSeam: true }];

  const spans: ArcSpan[] = [];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    spans.push({ startArc: cuts[i]!, endArc: cuts[i + 1]!, wrapsSeam: false });
  }
  spans.push({ startArc: cuts[cuts.length - 1]!, endArc: cuts[0]! + totalLength, wrapsSeam: true });
  return spans;
}

function mergeSurvivingSpans(
  spans: readonly ArcSpan[],
  deletedIndices: ReadonlySet<number>,
  closed: boolean,
  totalLength: number,
): readonly ArcSpan[] {
  const keptFlags = spans.map((_, idx) => !deletedIndices.has(idx));
  const keptCount = keptFlags.filter(Boolean).length;
  if (keptCount === 0) return [];
  if (keptCount === spans.length) return spans;

  if (!closed) {
    const merged: ArcSpan[] = [];
    let activeStart: number | null = null;
    let activeEnd = 0;
    for (let i = 0; i < spans.length; i += 1) {
      const span = spans[i]!;
      if (keptFlags[i]) {
        if (activeStart === null) activeStart = span.startArc;
        activeEnd = span.endArc;
      } else if (activeStart !== null) {
        merged.push({ startArc: activeStart, endArc: activeEnd, wrapsSeam: false });
        activeStart = null;
      }
    }
    if (activeStart !== null) {
      merged.push({ startArc: activeStart, endArc: activeEnd, wrapsSeam: false });
    }
    return merged;
  }

  const firstDeleted = keptFlags.findIndex((kept) => !kept);
  const merged: ArcSpan[] = [];
  let activeStart: number | null = null;
  let activeLen = 0;
  for (let offset = 1; offset <= spans.length; offset += 1) {
    const idx = (firstDeleted + offset) % spans.length;
    const span = spans[idx]!;
    const len = span.endArc - span.startArc;
    if (keptFlags[idx]) {
      if (activeStart === null) {
        activeStart = span.startArc % totalLength;
        activeLen = len;
      } else {
        activeLen += len;
      }
    } else if (activeStart !== null) {
      merged.push({
        startArc: activeStart,
        endArc: activeStart + activeLen,
        wrapsSeam: activeStart + activeLen > totalLength + 1e-7,
      });
      activeStart = null;
      activeLen = 0;
    }
  }
  if (activeStart !== null) {
    merged.push({
      startArc: activeStart,
      endArc: activeStart + activeLen,
      wrapsSeam: activeStart + activeLen > totalLength + 1e-7,
    });
  }
  return merged;
}

function subtractTouchedArcIntervals(
  indexed: IndexedStroke,
  eraserPath: readonly Vector2D[],
  radiusPx: number,
  includeStrokeWidth: boolean,
): readonly ArcSpan[] {
  const intervals: Array<[number, number]> = [];
  for (const seg of indexed.segments) {
    const avgWidth = includeStrokeWidth
      ? (finiteNumber(seg.p0.width, 0) + finiteNumber(seg.p1.width, 0)) * 0.5
      : 0;
    const effR = radiusPx + avgWidth * 0.5;
    const dx = seg.p1.x - seg.p0.x;
    const dy = seg.p1.y - seg.p0.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 1e-12) continue;

    for (const pt of eraserPath) {
      const fx = seg.p0.x - pt.x;
      const fy = seg.p0.y - pt.y;
      const b = 2 * (fx * dx + fy * dy);
      const c = fx * fx + fy * fy - effR * effR;
      const disc = b * b - 4 * lenSq * c;
      if (disc < 0) continue;
      const sqrtDisc = Math.sqrt(disc);
      const t0 = clamp01((-b - sqrtDisc) / (2 * lenSq));
      const t1 = clamp01((-b + sqrtDisc) / (2 * lenSq));
      if (t1 > t0 + 1e-6) {
        intervals.push([seg.startArc + t0 * seg.length, seg.startArc + t1 * seg.length]);
      }
    }
  }
  if (intervals.length === 0) {
    return [{ startArc: 0, endArc: indexed.totalLength, wrapsSeam: indexed.closed }];
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const union: Array<[number, number]> = [];
  for (const [s, e] of intervals) {
    const prev = union[union.length - 1];
    if (!prev || s > prev[1] + 1e-6) union.push([s, e]);
    else if (e > prev[1]) prev[1] = e;
  }

  const kept: ArcSpan[] = [];
  let cursor = 0;
  for (const [s, e] of union) {
    if (s > cursor + 1e-6) kept.push({ startArc: cursor, endArc: s, wrapsSeam: false });
    cursor = Math.max(cursor, e);
  }
  if (cursor < indexed.totalLength - 1e-6) {
    kept.push({ startArc: cursor, endArc: indexed.totalLength, wrapsSeam: false });
  }
  return kept;
}

function materializeKeptSpans(
  indexed: IndexedStroke,
  keptSpans: readonly ArcSpan[],
  minRemainingLength: number,
): readonly VectorPolylineStroke[] {
  const validPieces: Array<readonly VectorPolylinePoint[]> = [];
  for (const span of keptSpans) {
    if (span.endArc - span.startArc < minRemainingLength) continue;
    const pts = sliceIndexedPolyline(indexed, span.startArc, span.endArc);
    if (pts.length >= 2) validPieces.push(pts);
  }
  return validPieces.map((pts, index) => ({
    ...indexed.stroke,
    id: validPieces.length === 1 ? indexed.stroke.id : `${indexed.stroke.id}#seg-${index + 1}`,
    points: pts,
    closed: false,
  }));
}

/**
 * 평면 폴리라인 배열에 클린룸 벡터 교차점 지우개를 적용한다.
 * 원본 스트로크 배열을 변경하지 않는 불변 순수 함수다.
 */
export function eraseVectorPolylinesAtIntersections(
  strokes: readonly VectorPolylineStroke[],
  eraser: VectorEraserInput,
  options: VectorIntersectionEraserOptions = {},
): VectorIntersectionEraseResult {
  const mode = options.mode ?? "up-to-intersection";
  const includeStrokeWidth = options.includeStrokeWidth ?? true;
  const mergeCutEps = Math.max(1e-6, finiteNumber(options.mergeCutEpsilonPx, DEFAULT_MERGE_CUT_EPS));
  const minRemainingLength = Math.max(
    0,
    finiteNumber(options.minRemainingLengthPx, DEFAULT_MIN_REMAINING_LENGTH),
  );
  const hitPolicy = options.hitPolicy ?? "interior-prefer";
  const targetScope =
    options.targetStrokeIds && options.targetStrokeIds.length > 0
      ? new Set(options.targetStrokeIds)
      : null;

  const { path: eraserPath, radiusPx, aabb: eraserAabb } = normalizeEraserPath(eraser);
  const emptyStats: VectorIntersectionStats = {
    strokePairsTested: 0,
    strokePairsCulledByAabb: 0,
    segmentPairsTested: 0,
    segmentPairsCulledByAabb: 0,
  };
  if (strokes.length === 0 || eraserPath.length === 0) {
    return {
      strokes: [...strokes],
      intersections: [],
      erasedSpanCount: 0,
      splitStrokeCount: 0,
      removedStrokeIds: [],
      stats: emptyStats,
    };
  }

  const indexedList = strokes.map(indexPolylineStroke);
  const intersectionPass =
    mode === "up-to-intersection"
      ? findPolylineIntersections(strokes, options)
      : {
          intersections: [] as readonly PolylineIntersectionRecord[],
          cutsByStrokeId: new Map<string, readonly number[]>(),
          stats: emptyStats,
        };

  const resultStrokes: VectorPolylineStroke[] = [];
  const removedStrokeIds: string[] = [];
  let erasedSpanCount = 0;
  let splitStrokeCount = 0;

  for (const indexed of indexedList) {
    const stroke = indexed.stroke;
    if (targetScope && !targetScope.has(stroke.id)) {
      resultStrokes.push(stroke);
      continue;
    }

    const maxHalfWidth = includeStrokeWidth
      ? stroke.points.reduce((acc, p) => Math.max(acc, finiteNumber(p.width, 0) * 0.5), 0)
      : 0;
    if (!aabbsOverlap(indexed.aabb, eraserAabb, radiusPx + maxHalfWidth + 1e-4)) {
      resultStrokes.push(stroke);
      continue;
    }

    if (mode === "whole-stroke") {
      const evalHit = evaluateSpanAgainstEraser(
        indexed,
        { startArc: 0, endArc: indexed.totalLength, wrapsSeam: indexed.closed },
        0,
        eraserPath,
        radiusPx,
        includeStrokeWidth,
      );
      if (evalHit.touched) {
        erasedSpanCount += 1;
        removedStrokeIds.push(stroke.id);
      } else {
        resultStrokes.push(stroke);
      }
      continue;
    }

    if (mode === "touched-area") {
      const keptSpans = subtractTouchedArcIntervals(
        indexed,
        eraserPath,
        radiusPx,
        includeStrokeWidth,
      );
      if (
        keptSpans.length === 1
        && keptSpans[0]!.startArc <= 1e-6
        && keptSpans[0]!.endArc >= indexed.totalLength - 1e-6
      ) {
        resultStrokes.push(stroke);
        continue;
      }
      const rebuilt = materializeKeptSpans(indexed, keptSpans, minRemainingLength);
      erasedSpanCount += 1;
      if (rebuilt.length === 0) removedStrokeIds.push(stroke.id);
      else {
        if (rebuilt.length > 1) splitStrokeCount += 1;
        resultStrokes.push(...rebuilt);
      }
      continue;
    }

    const cuts = dedupeSortedCuts(
      intersectionPass.cutsByStrokeId.get(stroke.id) ?? [],
      indexed.totalLength,
      indexed.closed,
      mergeCutEps,
    );
    const spans = buildSpansForStroke(indexed, cuts);
    const evaluations = spans.map((span, idx) =>
      evaluateSpanAgainstEraser(indexed, span, idx, eraserPath, radiusPx, includeStrokeWidth),
    );
    const touchedEvals = evaluations.filter((ev) => ev.touched);
    if (touchedEvals.length === 0) {
      resultStrokes.push(stroke);
      continue;
    }

    const deletedSet = new Set<number>();
    const chosen =
      hitPolicy === "interior-prefer"
        ? (() => {
            const interiorHits = touchedEvals.filter((ev) => ev.strictlyInteriorHit);
            return interiorHits.length > 0 ? interiorHits : touchedEvals;
          })()
        : touchedEvals;
    for (const ev of chosen) deletedSet.add(ev.spanIndex);

    erasedSpanCount += deletedSet.size;
    const mergedKept = mergeSurvivingSpans(spans, deletedSet, indexed.closed, indexed.totalLength);
    const rebuilt = materializeKeptSpans(indexed, mergedKept, minRemainingLength);
    if (rebuilt.length === 0) removedStrokeIds.push(stroke.id);
    else {
      if (rebuilt.length > 1) splitStrokeCount += 1;
      resultStrokes.push(...rebuilt);
    }
  }

  return {
    strokes: resultStrokes,
    intersections: intersectionPass.intersections,
    erasedSpanCount,
    splitStrokeCount,
    removedStrokeIds,
    stats: intersectionPass.stats,
  };
}
