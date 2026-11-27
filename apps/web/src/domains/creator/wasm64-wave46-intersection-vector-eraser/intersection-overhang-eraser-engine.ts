/**
 * Wave-46: 교차점 인식 벡터 지우개 및 미세 잔선(Overhang Tail) 일괄 정리 엔진.
 *
 * 지우개 궤적이 스친 선화 세그먼트를 양쪽 가장 가까운 교차점(또는 T-접합점) 사이 구간만 정밀 절단하며,
 * 절단 이후 남은 선화의 원본 정점·필압(pressure)·곡률 보간 값을 무손실 보존한다.
 */

import {
  PolylineSpatialIntersectionIndex,
  type SpatialIntersectionIndexOptions,
  type StrokeIntersectionKind,
  type StrokeJunctionPoint,
} from "./polyline-spatial-intersection-index";
import {
  clampNumber,
  computeStrokeArcLengths,
  distancePointToSegment,
  distanceSegmentToSegment,
  segmentSegmentIntersection,
  sliceStrokeByArcRange,
  type VectorLineartStroke,
  type VectorPoint2D,
} from "./vector-polyline-geometry";

export { computePolylineCurvatures, sliceStrokeByArcRange } from "./vector-polyline-geometry";

export type UnintersectedStrokeBehavior = "preserve" | "erase-whole";

export interface EraseUpToIntersectionsOptions extends SpatialIntersectionIndexOptions {
  /** 지우개 판정 반경(px, 기본값 4.0) */
  readonly eraserRadiusPx?: number;
  /** 교차점이 전혀 없는 비교차 선에 지우개가 스쳤을 때의 동작 (기본값 "preserve": 보호) */
  readonly unintersectedBehavior?: UnintersectedStrokeBehavior;
  /** 절단 후 잔존 최소 길이(px, 기본값 0.25) */
  readonly minRemainingLengthPx?: number;
}

export interface ErasedSpanRecord {
  readonly strokeId: string;
  readonly startArcLength: number;
  readonly endArcLength: number;
  readonly removedLengthPx: number;
  readonly startBoundaryKind: "stroke-start" | StrokeIntersectionKind;
  readonly endBoundaryKind: "stroke-end" | StrokeIntersectionKind;
}

export interface EraseUpToIntersectionsResult {
  readonly strokes: readonly VectorLineartStroke[];
  readonly erasedSpans: readonly ErasedSpanRecord[];
  readonly protectedUnintersectedStrokeIds: readonly string[];
  readonly removedStrokeIds: readonly string[];
  readonly splitStrokeCount: number;
  readonly totalRemovedLengthPx: number;
}

export interface PruneMicroOverhangsOptions extends SpatialIntersectionIndexOptions {
  /** 교차점 너머 자동 정리할 최대 잔선 길이(px, 기본값 12.0) */
  readonly maxOverhangPx?: number;
  /** 이미 밀착된 끝점을 오탐하지 않기 위한 최소 잔선 길이(px, 기본값 1e-3) */
  readonly minOverhangPx?: number;
  /** 잔선 정리 후 유지해야 할 최소 본체 길이(px, 기본값 1.0) */
  readonly minRemainingLengthPx?: number;
  /** 짧은 단일 교차 선이 양쪽 모두 maxOverhangPx 이하일 때 본체 전체 삭제를 막음 (기본값 true) */
  readonly preserveCoreStroke?: boolean;
}

export interface PrunedOverhangRecord {
  readonly strokeId: string;
  readonly side: "start" | "end";
  readonly removedLengthPx: number;
  readonly cutPoint: VectorPoint2D;
  readonly junctionKind: StrokeIntersectionKind;
  readonly partnerStrokeId: string;
}

export interface PruneMicroOverhangsResult {
  readonly strokes: readonly VectorLineartStroke[];
  readonly prunedOverhangs: readonly PrunedOverhangRecord[];
  readonly totalRemovedLengthPx: number;
  readonly prunedCount: number;
  readonly untouchedStrokeCount: number;
}

interface StrokeCutNode {
  readonly arcLength: number;
  readonly boundaryKind: "stroke-start" | "stroke-end" | StrokeIntersectionKind;
}

interface StrokeSpanSlice {
  readonly startArc: number;
  readonly endArc: number;
  readonly startBoundaryKind: "stroke-start" | StrokeIntersectionKind;
  readonly endBoundaryKind: "stroke-end" | StrokeIntersectionKind;
}

function buildCutNodesForStroke(
  junctions: readonly StrokeJunctionPoint[],
  totalLength: number,
  mergeTolerancePx = 1e-3,
): readonly StrokeCutNode[] {
  const nodes: StrokeCutNode[] = [{ arcLength: 0, boundaryKind: "stroke-start" }];
  let endKind: "stroke-end" | StrokeIntersectionKind = "stroke-end";

  for (const j of junctions) {
    const s = clampNumber(j.arcLength, 0, totalLength);
    if (s <= mergeTolerancePx) {
      nodes[0] = { arcLength: 0, boundaryKind: j.kind };
      continue;
    }
    if (totalLength - s <= mergeTolerancePx) {
      endKind = j.kind;
      continue;
    }
    const prev = nodes[nodes.length - 1];
    if (!prev || Math.abs(s - prev.arcLength) > mergeTolerancePx) {
      nodes.push({ arcLength: s, boundaryKind: j.kind });
    }
  }
  nodes.push({ arcLength: totalLength, boundaryKind: endKind });
  return nodes;
}

function findClosestArcOnStroke(
  stroke: VectorLineartStroke,
  cumulativeLengths: readonly number[],
  point: VectorPoint2D,
): { readonly distance: number; readonly arcLength: number } {
  const segCount = Math.max(0, cumulativeLengths.length - 1);
  let bestDist = Number.POSITIVE_INFINITY;
  let bestArc = 0;
  for (let i = 0; i < segCount; i += 1) {
    const a = stroke.points[i];
    const b = stroke.points[(i + 1) % stroke.points.length];
    if (!a || !b) continue;
    const proj = distancePointToSegment(point.x, point.y, a.x, a.y, b.x, b.y);
    if (proj.distance < bestDist) {
      bestDist = proj.distance;
      bestArc = (cumulativeLengths[i] ?? 0) + proj.t * Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return { distance: bestDist, arcLength: bestArc };
}

function isEraserTouchingStroke(
  stroke: VectorLineartStroke,
  eraserPath: readonly VectorPoint2D[],
  eraserRadiusPx: number,
): boolean {
  const closed = Boolean(stroke.closed && stroke.points.length >= 3);
  const { cumulativeLengths } = computeStrokeArcLengths(stroke.points, closed);
  const segCount = Math.max(0, cumulativeLengths.length - 1);
  if (eraserPath.length === 1) {
    const pt = eraserPath[0];
    return pt !== undefined && findClosestArcOnStroke(stroke, cumulativeLengths, pt).distance <= eraserRadiusPx;
  }
  for (let e = 0; e < eraserPath.length - 1; e += 1) {
    const e1 = eraserPath[e];
    const e2 = eraserPath[e + 1];
    if (!e1 || !e2) continue;
    for (let i = 0; i < segCount; i += 1) {
      const a = stroke.points[i];
      const b = stroke.points[(i + 1) % stroke.points.length];
      if (a && b && distanceSegmentToSegment(a, b, e1, e2) <= eraserRadiusPx) return true;
    }
  }
  return false;
}

function detectHitSpanIndices(
  stroke: VectorLineartStroke,
  cumulativeLengths: readonly number[],
  spans: readonly StrokeSpanSlice[],
  eraserPath: readonly VectorPoint2D[],
  eraserRadiusPx: number,
): ReadonlySet<number> {
  const hitIndices = new Set<number>();
  const markArc = (arc: number): void => {
    for (let idx = 0; idx < spans.length; idx += 1) {
      const span = spans[idx];
      if (span && arc >= span.startArc - 1e-6 && arc <= span.endArc + 1e-6) {
        hitIndices.add(idx);
        return;
      }
    }
  };

  for (const pt of eraserPath) {
    const closest = findClosestArcOnStroke(stroke, cumulativeLengths, pt);
    if (closest.distance <= eraserRadiusPx) markArc(closest.arcLength);
  }
  if (eraserPath.length < 2) return hitIndices;

  const segCount = Math.max(0, cumulativeLengths.length - 1);
  for (let e = 0; e < eraserPath.length - 1; e += 1) {
    const e1 = eraserPath[e];
    const e2 = eraserPath[e + 1];
    if (!e1 || !e2) continue;

    for (let i = 0; i < segCount; i += 1) {
      const a = stroke.points[i];
      const b = stroke.points[(i + 1) % stroke.points.length];
      if (!a || !b) continue;
      const hit = segmentSegmentIntersection(a, b, e1, e2, 1e-6);
      if (hit !== null) {
        markArc((cumulativeLengths[i] ?? 0) + hit.tA * Math.hypot(b.x - a.x, b.y - a.y));
      }
    }

    // 직교차 없이 지우개 반경이 스팬 내부 구간을 직접 스친 경우도 정확히 감지한다.
    for (let idx = 0; idx < spans.length; idx += 1) {
      if (hitIndices.has(idx)) continue;
      const span = spans[idx];
      if (!span) continue;
      const sliced = sliceStrokeByArcRange(stroke, span.startArc, span.endArc, "__probe");
      if (!sliced) continue;
      let minSpanDist = Number.POSITIVE_INFINITY;
      for (let s = 0; s < sliced.points.length - 1; s += 1) {
        const pA = sliced.points[s];
        const pB = sliced.points[s + 1];
        if (pA && pB) minSpanDist = Math.min(minSpanDist, distanceSegmentToSegment(pA, pB, e1, e2));
      }
      if (minSpanDist > eraserRadiusPx) continue;
      const startPt = sliced.points[0];
      const endPt = sliced.points[sliced.points.length - 1];
      const distToBound = (kind: string, fixed: string, pt: VectorPoint2D | undefined): number =>
        kind !== fixed && pt ? distancePointToSegment(pt.x, pt.y, e1.x, e1.y, e2.x, e2.y).distance : Number.POSITIVE_INFINITY;
      const nearestBoundDist = Math.min(
        distToBound(span.startBoundaryKind, "stroke-start", startPt),
        distToBound(span.endBoundaryKind, "stroke-end", endPt),
      );
      if (minSpanDist < nearestBoundDist - 1e-4) hitIndices.add(idx);
    }
  }
  return hitIndices;
}

export function eraseUpToIntersections(
  strokes: readonly VectorLineartStroke[],
  eraserPath: readonly VectorPoint2D[],
  options: EraseUpToIntersectionsOptions = {},
): EraseUpToIntersectionsResult {
  if (eraserPath.length === 0 || strokes.length === 0) {
    return {
      strokes: [...strokes], erasedSpans: [], protectedUnintersectedStrokeIds: [],
      removedStrokeIds: [], splitStrokeCount: 0, totalRemovedLengthPx: 0,
    };
  }

  const eraserRadiusPx = Math.max(0.25, options.eraserRadiusPx ?? 4.0);
  const unintersectedBehavior = options.unintersectedBehavior ?? "preserve";
  const minRemainingLengthPx = Math.max(1e-4, options.minRemainingLengthPx ?? 0.25);
  const index = new PolylineSpatialIntersectionIndex(strokes, options);
  const ixResult = index.extractIntersections();

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const pt of eraserPath) {
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x);
    maxY = Math.max(maxY, pt.y);
  }
  const candidateStrokeIds = new Set(
    index
      .querySegmentsInBounds(minX - eraserRadiusPx, minY - eraserRadiusPx, maxX + eraserRadiusPx, maxY + eraserRadiusPx)
      .map((seg) => seg.strokeId),
  );

  const outputStrokes: VectorLineartStroke[] = [];
  const erasedSpans: ErasedSpanRecord[] = [];
  const protectedUnintersectedStrokeIds: string[] = [];
  const removedStrokeIds: string[] = [];
  let splitStrokeCount = 0;
  let totalRemovedLengthPx = 0;

  for (const stroke of strokes) {
    if (!candidateStrokeIds.has(stroke.id)) {
      outputStrokes.push(stroke);
      continue;
    }

    const junctions = ixResult.junctionsByStrokeId.get(stroke.id) ?? [];
    if (junctions.length === 0) {
      if (!isEraserTouchingStroke(stroke, eraserPath, eraserRadiusPx)) {
        outputStrokes.push(stroke);
      } else if (unintersectedBehavior === "preserve") {
        protectedUnintersectedStrokeIds.push(stroke.id);
        outputStrokes.push(stroke);
      } else {
        const { totalLength } = computeStrokeArcLengths(stroke.points, Boolean(stroke.closed));
        removedStrokeIds.push(stroke.id);
        totalRemovedLengthPx += totalLength;
        erasedSpans.push({
          strokeId: stroke.id, startArcLength: 0, endArcLength: totalLength,
          removedLengthPx: totalLength, startBoundaryKind: "stroke-start", endBoundaryKind: "stroke-end",
        });
      }
      continue;
    }

    const closed = Boolean(stroke.closed && stroke.points.length >= 3);
    const { cumulativeLengths, totalLength } = computeStrokeArcLengths(stroke.points, closed);
    const cutNodes = buildCutNodesForStroke(junctions, totalLength);
    const spans: StrokeSpanSlice[] = [];
    for (let i = 0; i < cutNodes.length - 1; i += 1) {
      const a = cutNodes[i];
      const b = cutNodes[i + 1];
      if (!a || !b || b.arcLength - a.arcLength <= 1e-6) continue;
      spans.push({
        startArc: a.arcLength, endArc: b.arcLength,
        startBoundaryKind: a.boundaryKind === "stroke-end" ? "stroke-start" : a.boundaryKind,
        endBoundaryKind: b.boundaryKind === "stroke-start" ? "stroke-end" : b.boundaryKind,
      });
    }

    const hitSpanIndices = detectHitSpanIndices(stroke, cumulativeLengths, spans, eraserPath, eraserRadiusPx);
    if (hitSpanIndices.size === 0) {
      outputStrokes.push(stroke);
      continue;
    }

    const survivingRanges: { startArc: number; endArc: number }[] = [];
    for (let idx = 0; idx < spans.length; idx += 1) {
      const span = spans[idx];
      if (!span) continue;
      if (hitSpanIndices.has(idx)) {
        const removedLen = span.endArc - span.startArc;
        totalRemovedLengthPx += removedLen;
        erasedSpans.push({
          strokeId: stroke.id, startArcLength: span.startArc, endArcLength: span.endArc,
          removedLengthPx: removedLen, startBoundaryKind: span.startBoundaryKind, endBoundaryKind: span.endBoundaryKind,
        });
      } else {
        const last = survivingRanges[survivingRanges.length - 1];
        if (last && Math.abs(last.endArc - span.startArc) <= 1e-5) last.endArc = span.endArc;
        else survivingRanges.push({ startArc: span.startArc, endArc: span.endArc });
      }
    }

    const validRanges = survivingRanges.filter((r) => r.endArc - r.startArc >= minRemainingLengthPx);
    if (validRanges.length === 0) {
      removedStrokeIds.push(stroke.id);
      continue;
    }
    if (validRanges.length > 1) splitStrokeCount += 1;
    for (let partIndex = 0; partIndex < validRanges.length; partIndex += 1) {
      const range = validRanges[partIndex];
      if (!range) continue;
      const partId = validRanges.length === 1 ? stroke.id : `${stroke.id}__part-${partIndex}`;
      const sliced = sliceStrokeByArcRange(stroke, range.startArc, range.endArc, partId);
      if (sliced) outputStrokes.push(sliced);
    }
  }

  return {
    strokes: outputStrokes,
    erasedSpans,
    protectedUnintersectedStrokeIds,
    removedStrokeIds,
    splitStrokeCount,
    totalRemovedLengthPx,
  };
}

export function pruneMicroOverhangs(
  strokes: readonly VectorLineartStroke[],
  options: PruneMicroOverhangsOptions = {},
): PruneMicroOverhangsResult {
  const maxOverhangPx = Math.max(0, options.maxOverhangPx ?? 12.0);
  const minOverhangPx = Math.max(0, options.minOverhangPx ?? 1e-3);
  const minRemainingLengthPx = Math.max(1e-3, options.minRemainingLengthPx ?? 1.0);
  const preserveCoreStroke = options.preserveCoreStroke ?? true;
  const ixResult = new PolylineSpatialIntersectionIndex(strokes, options).extractIntersections();

  const outputStrokes: VectorLineartStroke[] = [];
  const prunedOverhangs: PrunedOverhangRecord[] = [];
  let totalRemovedLengthPx = 0;
  let untouchedStrokeCount = 0;

  for (const stroke of strokes) {
    const junctions = ixResult.junctionsByStrokeId.get(stroke.id);
    const firstJunction = junctions?.[0];
    const lastJunction = junctions?.[junctions.length - 1];
    if (stroke.closed || !firstJunction || !lastJunction || stroke.points.length < 2) {
      outputStrokes.push(stroke);
      untouchedStrokeCount += 1;
      continue;
    }

    const { totalLength } = computeStrokeArcLengths(stroke.points, false);
    const startTail = firstJunction.arcLength;
    const endTail = totalLength - lastJunction.arcLength;
    let trimStart = startTail > minOverhangPx && startTail <= maxOverhangPx;
    let trimEnd = endTail > minOverhangPx && endTail <= maxOverhangPx;

    if (trimStart && trimEnd && preserveCoreStroke && lastJunction.arcLength - firstJunction.arcLength < minRemainingLengthPx) {
      if (startTail <= endTail && endTail >= minRemainingLengthPx) trimEnd = false;
      else if (endTail < startTail && startTail >= minRemainingLengthPx) trimStart = false;
      else {
        trimStart = false;
        trimEnd = false;
      }
    } else if (trimStart && preserveCoreStroke && totalLength - startTail < minRemainingLengthPx) {
      trimStart = false;
    } else if (trimEnd && preserveCoreStroke && totalLength - endTail < minRemainingLengthPx) {
      trimEnd = false;
    }

    const sliced =
      trimStart || trimEnd
        ? sliceStrokeByArcRange(stroke, trimStart ? firstJunction.arcLength : 0, trimEnd ? lastJunction.arcLength : totalLength, stroke.id)
        : null;
    if (!sliced) {
      outputStrokes.push(stroke);
      untouchedStrokeCount += 1;
      continue;
    }

    const recordPruned = (side: "start" | "end", len: number, junction: StrokeJunctionPoint): void => {
      totalRemovedLengthPx += len;
      prunedOverhangs.push({
        strokeId: stroke.id,
        side,
        removedLengthPx: len,
        cutPoint: { x: junction.x, y: junction.y },
        junctionKind: junction.kind,
        partnerStrokeId: junction.partnerStrokeId,
      });
    };
    if (trimStart) recordPruned("start", startTail, firstJunction);
    if (trimEnd) recordPruned("end", endTail, lastJunction);
    outputStrokes.push(sliced);
  }

  return {
    strokes: outputStrokes,
    prunedOverhangs,
    totalRemovedLengthPx,
    prunedCount: prunedOverhangs.length,
    untouchedStrokeCount,
  };
}
