/**
 * Wave-46: 균일 격자 공간 해시(Uniform Grid Spatial Hash) 기반 선화 교차점·T-접합점 추출 엔진.
 *
 * 웹툰 선화 폴리라인 집합을 셀 단위 공간 해시에 인덱싱해 O(N)에 가까운 후보군만 정밀 판정하며,
 * 선분-선분 정확 교차점(tA, tB, x, y)과 끝점 근접 T-접합점(snapTolerancePx)을 중복 없이 추출한다.
 */

import {
  clampNumber,
  computeStrokeArcLengths,
  distancePointToSegment,
  segmentSegmentIntersection,
  type VectorLineartStroke,
  type VectorPoint2D,
} from "./vector-polyline-geometry";

export {
  clampNumber,
  computeStrokeArcLengths,
  distanceBetweenPoints,
  distancePointToSegment,
  distanceSegmentToSegment,
  segmentSegmentIntersection,
  type PointToSegmentProjection,
  type SegmentIntersectionHit,
  type VectorLineartStroke,
  type VectorPoint2D,
} from "./vector-polyline-geometry";

export type StrokeIntersectionKind = "crossing" | "t-junction";

export interface StrokeIntersectionRecord {
  readonly id: string;
  readonly kind: StrokeIntersectionKind;
  readonly strokeAId: string;
  readonly segmentIndexA: number;
  readonly tA: number;
  readonly arcLengthA: number;
  readonly strokeBId: string;
  readonly segmentIndexB: number;
  readonly tB: number;
  readonly arcLengthB: number;
  readonly x: number;
  readonly y: number;
  /** 정확 교차 시 0, 근접 T-접합 시 끝점-세그먼트 최단 거리(px) */
  readonly distancePx: number;
}

export interface StrokeJunctionPoint {
  readonly intersectionId: string;
  readonly kind: StrokeIntersectionKind;
  readonly strokeId: string;
  readonly partnerStrokeId: string;
  readonly segmentIndex: number;
  readonly t: number;
  readonly arcLength: number;
  readonly x: number;
  readonly y: number;
  readonly distancePx: number;
}

export interface IndexedStrokeSegment {
  readonly globalSegmentId: number;
  readonly strokeIndex: number;
  readonly strokeId: string;
  readonly segmentIndex: number;
  readonly segmentCount: number;
  readonly closed: boolean;
  readonly a: VectorPoint2D;
  readonly b: VectorPoint2D;
  readonly length: number;
  readonly startArcLength: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface StrokeArcMetrics {
  readonly strokeId: string;
  readonly segmentCount: number;
  readonly cumulativeLengths: readonly number[];
  readonly totalLength: number;
  readonly closed: boolean;
}

export interface SpatialIntersectionIndexOptions {
  /** 균일 격자 셀 한 변의 길이(px, 기본값 32) */
  readonly cellSizePx?: number;
  /** 끝점 근접 T-접합 허용 반경(px, 기본값 3.0) */
  readonly snapTolerancePx?: number;
  /** 경계 수치 오차 허용치 (기본값 1e-6) */
  readonly endpointExclusionEpsilon?: number;
  /** 동일 스트로크 쌍의 중복 교차 병합 허용 호장(px, 기본값 0.5) */
  readonly dedupeTolerancePx?: number;
  /** 동일 스트로크 비인접 선분의 자기교차 포함 여부 (기본값 true) */
  readonly includeSelfIntersections?: boolean;
  /** 근접 T-접합에서 평행선 오검출을 막기 위한 최소 |sin(theta)| (기본값 0.15) */
  readonly minTJunctionSine?: number;
}

export interface SpatialHashStats {
  readonly strokeCount: number;
  readonly segmentCount: number;
  readonly cellCount: number;
  readonly cellSizePx: number;
  readonly candidatePairsTested: number;
  readonly bruteForcePairCount: number;
  readonly pruningRatio: number;
}

export interface SpatialIntersectionResult {
  readonly intersections: readonly StrokeIntersectionRecord[];
  readonly junctionsByStrokeId: ReadonlyMap<string, readonly StrokeJunctionPoint[]>;
  readonly stats: SpatialHashStats;
}

const CELL_KEY_BIAS = 33_554_432;
const CELL_KEY_STRIDE = 67_108_864;

function encodeCellKey(cx: number, cy: number): number | string {
  if (Math.abs(cx) < CELL_KEY_BIAS && Math.abs(cy) < CELL_KEY_BIAS) {
    return (cx + CELL_KEY_BIAS) * CELL_KEY_STRIDE + (cy + CELL_KEY_BIAS);
  }
  return `${cx}:${cy}`;
}

function isOuterStrokeEndpoint(seg: IndexedStrokeSegment, t: number, eps: number): boolean {
  if (seg.closed) return false;
  return (seg.segmentIndex === 0 && t <= eps) || (seg.segmentIndex === seg.segmentCount - 1 && t >= 1 - eps);
}

function segmentCrossSine(a: IndexedStrokeSegment, b: IndexedStrokeSegment): number {
  if (a.length <= 1e-9 || b.length <= 1e-9) return 0;
  return Math.abs(((a.b.x - a.a.x) * (b.b.y - b.a.y) - (a.b.y - a.a.y) * (b.b.x - b.a.x)) / (a.length * b.length));
}

function detectNearTJunction(
  segA: IndexedStrokeSegment,
  segB: IndexedStrokeSegment,
  snapTolerancePx: number,
  minTJunctionSine: number,
): { readonly tA: number; readonly tB: number; readonly x: number; readonly y: number; readonly distancePx: number } | null {
  if (snapTolerancePx <= 0 || segmentCrossSine(segA, segB) < minTJunctionSine) return null;

  let best: { tA: number; tB: number; x: number; y: number; distancePx: number } | null = null;
  const checkEnd = (pt: VectorPoint2D, tOwner: number, target: IndexedStrokeSegment, ownerIsA: boolean): void => {
    const proj = distancePointToSegment(pt.x, pt.y, target.a.x, target.a.y, target.b.x, target.b.y);
    if (proj.distance > snapTolerancePx || (best !== null && proj.distance >= best.distancePx)) return;
    best = ownerIsA
      ? { tA: tOwner, tB: proj.t, x: proj.closestX, y: proj.closestY, distancePx: proj.distance }
      : { tA: proj.t, tB: tOwner, x: proj.closestX, y: proj.closestY, distancePx: proj.distance };
  };

  if (!segA.closed) {
    if (segA.segmentIndex === 0) checkEnd(segA.a, 0, segB, true);
    if (segA.segmentIndex === segA.segmentCount - 1) checkEnd(segA.b, 1, segB, true);
  }
  if (!segB.closed) {
    if (segB.segmentIndex === 0) checkEnd(segB.a, 0, segA, false);
    if (segB.segmentIndex === segB.segmentCount - 1) checkEnd(segB.b, 1, segA, false);
  }
  return best;
}

export class PolylineSpatialIntersectionIndex {
  private readonly strokes: readonly VectorLineartStroke[];
  private readonly cellSizePx: number;
  private readonly snapTolerancePx: number;
  private readonly endpointEpsilon: number;
  private readonly dedupeTolerancePx: number;
  private readonly includeSelfIntersections: boolean;
  private readonly minTJunctionSine: number;
  private readonly segments: IndexedStrokeSegment[] = [];
  private readonly grid = new Map<number | string, number[]>();
  private readonly strokeMetrics = new Map<string, StrokeArcMetrics>();
  private cachedResult: SpatialIntersectionResult | null = null;

  constructor(strokes: readonly VectorLineartStroke[], options: SpatialIntersectionIndexOptions = {}) {
    this.strokes = strokes;
    this.cellSizePx = Math.max(1, options.cellSizePx ?? 32);
    this.snapTolerancePx = Math.max(0, options.snapTolerancePx ?? 3.0);
    this.endpointEpsilon = Math.max(1e-9, options.endpointExclusionEpsilon ?? 1e-6);
    this.dedupeTolerancePx = Math.max(1e-4, options.dedupeTolerancePx ?? 0.5);
    this.includeSelfIntersections = options.includeSelfIntersections ?? true;
    this.minTJunctionSine = clampNumber(options.minTJunctionSine ?? 0.15, 0, 1);
    this.buildIndex();
  }

  private buildIndex(): void {
    const pad = this.snapTolerancePx;
    for (let strokeIndex = 0; strokeIndex < this.strokes.length; strokeIndex += 1) {
      const stroke = this.strokes[strokeIndex];
      if (!stroke || stroke.points.length < 2) continue;
      const closed = Boolean(stroke.closed && stroke.points.length >= 3);
      const { cumulativeLengths, totalLength } = computeStrokeArcLengths(stroke.points, closed);
      const segmentCount = Math.max(0, cumulativeLengths.length - 1);
      this.strokeMetrics.set(stroke.id, {
        strokeId: stroke.id,
        segmentCount,
        cumulativeLengths,
        totalLength,
        closed,
      });

      for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
        const a = stroke.points[segmentIndex];
        const b = stroke.points[(segmentIndex + 1) % stroke.points.length];
        if (!a || !b) continue;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length <= 1e-9) continue;

        const minX = Math.min(a.x, b.x);
        const minY = Math.min(a.y, b.y);
        const maxX = Math.max(a.x, b.x);
        const maxY = Math.max(a.y, b.y);
        const globalSegmentId = this.segments.length;
        this.segments.push({
          globalSegmentId, strokeIndex, strokeId: stroke.id, segmentIndex, segmentCount, closed,
          a, b, length, startArcLength: cumulativeLengths[segmentIndex] ?? 0, minX, minY, maxX, maxY,
        });

        const cx0 = Math.floor((minX - pad) / this.cellSizePx);
        const cx1 = Math.floor((maxX + pad) / this.cellSizePx);
        const cy0 = Math.floor((minY - pad) / this.cellSizePx);
        const cy1 = Math.floor((maxY + pad) / this.cellSizePx);
        for (let cx = cx0; cx <= cx1; cx += 1) {
          for (let cy = cy0; cy <= cy1; cy += 1) {
            const key = encodeCellKey(cx, cy);
            const bucket = this.grid.get(key);
            if (bucket) bucket.push(globalSegmentId);
            else this.grid.set(key, [globalSegmentId]);
          }
        }
      }
    }
  }

  public getStrokeMetrics(strokeId: string): StrokeArcMetrics | undefined {
    return this.strokeMetrics.get(strokeId);
  }

  public getIndexedSegments(): readonly IndexedStrokeSegment[] {
    return this.segments;
  }

  public querySegmentsInBounds(minX: number, minY: number, maxX: number, maxY: number): readonly IndexedStrokeSegment[] {
    const cx0 = Math.floor(minX / this.cellSizePx);
    const cx1 = Math.floor(maxX / this.cellSizePx);
    const cy0 = Math.floor(minY / this.cellSizePx);
    const cy1 = Math.floor(maxY / this.cellSizePx);
    const seen = new Set<number>();
    const results: IndexedStrokeSegment[] = [];

    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cy = cy0; cy <= cy1; cy += 1) {
        const bucket = this.grid.get(encodeCellKey(cx, cy));
        if (!bucket) continue;
        for (const segId of bucket) {
          if (seen.has(segId)) continue;
          seen.add(segId);
          const seg = this.segments[segId];
          if (seg && seg.maxX >= minX && seg.minX <= maxX && seg.maxY >= minY && seg.minY <= maxY) {
            results.push(seg);
          }
        }
      }
    }
    return results;
  }

  public querySegmentsNearPoint(point: VectorPoint2D, radiusPx: number): readonly IndexedStrokeSegment[] {
    const r = Math.max(0, radiusPx);
    return this.querySegmentsInBounds(point.x - r, point.y - r, point.x + r, point.y + r);
  }

  public extractIntersections(): SpatialIntersectionResult {
    if (this.cachedResult !== null) return this.cachedResult;

    const totalSegs = this.segments.length;
    const testedPairs = new Set<number>();
    const rawRecords: StrokeIntersectionRecord[] = [];
    let candidatePairsTested = 0;

    for (const bucket of this.grid.values()) {
      if (bucket.length < 2) continue;
      for (let i = 0; i < bucket.length; i += 1) {
        const idI = bucket[i];
        if (idI === undefined) continue;
        for (let j = i + 1; j < bucket.length; j += 1) {
          const idJ = bucket[j];
          if (idJ === undefined) continue;
          const lo = idI < idJ ? idI : idJ;
          const hi = idI < idJ ? idJ : idI;
          const pairKey = lo * totalSegs + hi;
          if (testedPairs.has(pairKey)) continue;
          testedPairs.add(pairKey);

          const segA = this.segments[lo];
          const segB = this.segments[hi];
          if (!segA || !segB || this.shouldSkipSegmentPair(segA, segB)) continue;
          candidatePairsTested += 1;

          const record = this.testSegmentPair(segA, segB);
          if (record !== null) rawRecords.push(record);
        }
      }
    }

    const intersections = this.deduplicateIntersections(rawRecords);
    const junctionsByStrokeId = this.buildJunctionLookup(intersections);
    const bruteForcePairCount = (totalSegs * (totalSegs - 1)) / 2;
    const pruningRatio = bruteForcePairCount > 0 ? 1 - candidatePairsTested / bruteForcePairCount : 1;

    this.cachedResult = {
      intersections,
      junctionsByStrokeId,
      stats: {
        strokeCount: this.strokes.length,
        segmentCount: totalSegs,
        cellCount: this.grid.size,
        cellSizePx: this.cellSizePx,
        candidatePairsTested,
        bruteForcePairCount,
        pruningRatio: clampNumber(pruningRatio, 0, 1),
      },
    };
    return this.cachedResult;
  }

  private shouldSkipSegmentPair(segA: IndexedStrokeSegment, segB: IndexedStrokeSegment): boolean {
    if (segA.strokeIndex === segB.strokeIndex) {
      if (!this.includeSelfIntersections) return true;
      const diff = Math.abs(segA.segmentIndex - segB.segmentIndex);
      if (diff <= 1 || (segA.closed && diff === segA.segmentCount - 1)) return true;
    }
    const pad = this.snapTolerancePx;
    return (
      segA.maxX + pad < segB.minX ||
      segB.maxX + pad < segA.minX ||
      segA.maxY + pad < segB.minY ||
      segB.maxY + pad < segA.minY
    );
  }

  private testSegmentPair(segA: IndexedStrokeSegment, segB: IndexedStrokeSegment): StrokeIntersectionRecord | null {
    const exact = segmentSegmentIntersection(segA.a, segA.b, segB.a, segB.b, this.endpointEpsilon);
    if (exact !== null) {
      const isEndpoint = isOuterStrokeEndpoint(segA, exact.tA, 1e-4) || isOuterStrokeEndpoint(segB, exact.tB, 1e-4);
      return this.buildRecord(segA, segB, exact.tA, exact.tB, exact.x, exact.y, 0, isEndpoint ? "t-junction" : "crossing");
    }
    if (segA.strokeIndex === segB.strokeIndex) return null;
    const nearT = detectNearTJunction(segA, segB, this.snapTolerancePx, this.minTJunctionSine);
    return nearT === null
      ? null
      : this.buildRecord(segA, segB, nearT.tA, nearT.tB, nearT.x, nearT.y, nearT.distancePx, "t-junction");
  }

  private buildRecord(
    segA: IndexedStrokeSegment,
    segB: IndexedStrokeSegment,
    tA: number,
    tB: number,
    x: number,
    y: number,
    distancePx: number,
    kind: StrokeIntersectionKind,
  ): StrokeIntersectionRecord {
    return {
      id: "", kind, strokeAId: segA.strokeId, segmentIndexA: segA.segmentIndex, tA,
      arcLengthA: segA.startArcLength + tA * segA.length,
      strokeBId: segB.strokeId, segmentIndexB: segB.segmentIndex, tB,
      arcLengthB: segB.startArcLength + tB * segB.length, x, y, distancePx,
    };
  }

  private deduplicateIntersections(records: readonly StrokeIntersectionRecord[]): readonly StrokeIntersectionRecord[] {
    const sorted = [...records].sort(
      (a, b) =>
        a.distancePx - b.distancePx ||
        a.strokeAId.localeCompare(b.strokeAId) ||
        a.strokeBId.localeCompare(b.strokeBId) ||
        a.arcLengthA - b.arcLengthA,
    );
    const kept: StrokeIntersectionRecord[] = [];
    for (const candidate of sorted) {
      const duplicate = kept.some(
        (item) =>
          item.strokeAId === candidate.strokeAId &&
          item.strokeBId === candidate.strokeBId &&
          Math.abs(item.arcLengthA - candidate.arcLengthA) <= this.dedupeTolerancePx &&
          Math.abs(item.arcLengthB - candidate.arcLengthB) <= this.dedupeTolerancePx,
      );
      if (!duplicate) kept.push({ ...candidate, id: `ix-${kept.length}` });
    }
    return kept;
  }

  private buildJunctionLookup(
    intersections: readonly StrokeIntersectionRecord[],
  ): ReadonlyMap<string, readonly StrokeJunctionPoint[]> {
    const map = new Map<string, StrokeJunctionPoint[]>();
    const push = (
      strokeId: string,
      partnerStrokeId: string,
      segmentIndex: number,
      t: number,
      arcLength: number,
      ix: StrokeIntersectionRecord,
    ): void => {
      const point: StrokeJunctionPoint = {
        intersectionId: ix.id,
        kind: ix.kind,
        strokeId,
        partnerStrokeId,
        segmentIndex,
        t,
        arcLength,
        x: ix.x,
        y: ix.y,
        distancePx: ix.distancePx,
      };
      const list = map.get(strokeId);
      if (list) list.push(point);
      else map.set(strokeId, [point]);
    };

    for (const ix of intersections) {
      push(ix.strokeAId, ix.strokeBId, ix.segmentIndexA, ix.tA, ix.arcLengthA, ix);
      push(ix.strokeBId, ix.strokeAId, ix.segmentIndexB, ix.tB, ix.arcLengthB, ix);
    }
    for (const list of map.values()) list.sort((a, b) => a.arcLength - b.arcLength);
    return map;
  }
}

export function buildPolylineSpatialIntersectionIndex(
  strokes: readonly VectorLineartStroke[],
  options: SpatialIntersectionIndexOptions = {},
): PolylineSpatialIntersectionIndex {
  return new PolylineSpatialIntersectionIndex(strokes, options);
}
