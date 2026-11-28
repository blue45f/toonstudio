/**
 * Wave 120 — 만화 벡터 교차점 정밀 지우개(Vector Intersection Eraser).
 *
 * - 대상 스트로크와 타 스트로크(및 자기 교차 옵션)의 정확한 선분 교차 파라미터 `s ∈ [0, totalLength]`를
 *   해석적으로 계산하고, 클릭 좌표 `(clickX, clickY)` 양측 교차점 `(sPrev, sNext)`을 기준으로
 *   끝단 자투리 정밀 절단(잔여 돌출 오차 < 1e-4 px), 중간 구간 2분할, 단독 획 제거를 수행한다.
 */

import {
  clampFinite,
  computeStrokeTotalLength,
  computeVectorInkLayerSha256Hex,
  extractStrokeSegments,
  projectPointOntoStroke,
  sampleStrokeAtArcLength,
  type VectorInkLayer,
  type VectorInkPoint,
  type VectorInkStroke,
  type VectorStrokeSegment,
} from "./vector-ink-stroke-and-width-sculpt";

export interface ClickPoint2D {
  readonly x: number;
  readonly y: number;
}

export type VectorIntersectionKind = "cross" | "t-junction" | "collinear-overlap" | "self";

export interface VectorStrokeIntersectionHit {
  readonly arcLengthS: number;
  readonly x: number;
  readonly y: number;
  readonly targetSegmentIndex: number;
  readonly otherStrokeId: string;
  readonly otherSegmentIndex: number;
  readonly otherSegmentP0: ClickPoint2D;
  readonly otherSegmentP1: ClickPoint2D;
  readonly kind: VectorIntersectionKind;
}

export interface IntersectionEraserOptions {
  readonly includeSelfIntersections?: boolean;
  readonly intersectionEpsilon?: number;
  readonly dedupeArcLengthPx?: number;
  readonly endpointIgnoreMarginPx?: number;
  readonly maxClickDistancePx?: number;
}

export type VectorIntersectionEraseStatus =
  | "trimmed-start-tail"
  | "trimmed-end-tail"
  | "split-middle-bridge"
  | "opened-closed-loop"
  | "whole-stroke-removed"
  | "stroke-not-found"
  | "click-too-far";

export interface VectorIntersectionEraseResult {
  readonly status: VectorIntersectionEraseStatus;
  readonly layer: VectorInkLayer;
  readonly targetStrokeId: string;
  readonly clickArcLengthS: number;
  readonly clickDistancePx: number;
  readonly intersections: readonly VectorStrokeIntersectionHit[];
  readonly cutStartHit: VectorStrokeIntersectionHit | null;
  readonly cutEndHit: VectorStrokeIntersectionHit | null;
  readonly removedSpanPx: number;
  readonly residualOvershootPx: number;
  readonly resultingStrokes: readonly VectorInkStroke[];
  readonly beforeSha256: string;
  readonly afterSha256: string;
}

interface RawSegmentHit {
  readonly tA: number;
  readonly tB: number;
  readonly x: number;
  readonly y: number;
  readonly kind: "cross" | "t-junction" | "collinear-overlap";
}

const DEFAULT_INTERSECTION_EPS = 1e-8;
const DEFAULT_DEDUPE_ARC_PX = 1e-5;
const DEFAULT_ENDPOINT_MARGIN_PX = 1e-5;
const DEFAULT_MAX_CLICK_DIST_PX = 64;
const DUPLICATE_VERTEX_EPS = 1e-7;

function cross2D(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function pointToSegmentDistance(px: number, py: number, a: ClickPoint2D, b: ClickPoint2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-18) return Math.hypot(px - a.x, py - a.y);
  const t = clampFinite(((px - a.x) * dx + (py - a.y) * dy) / lenSq, 0, 1, 0);
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}

function computeSegmentPairIntersections(
  segA: VectorStrokeSegment,
  segB: VectorStrokeSegment,
  eps: number,
): readonly RawSegmentHit[] {
  const ax0 = segA.p0.x;
  const ay0 = segA.p0.y;
  const dax = segA.p1.x - ax0;
  const day = segA.p1.y - ay0;
  const bx0 = segB.p0.x;
  const by0 = segB.p0.y;
  const dbx = segB.p1.x - bx0;
  const dby = segB.p1.y - by0;

  const lenASq = dax * dax + day * day;
  const lenBSq = dbx * dbx + dby * dby;
  if (lenASq <= 1e-18 || lenBSq <= 1e-18) return [];

  if (
    Math.max(ax0, segA.p1.x) + eps < Math.min(bx0, segB.p1.x) - eps ||
    Math.max(bx0, segB.p1.x) + eps < Math.min(ax0, segA.p1.x) - eps ||
    Math.max(ay0, segA.p1.y) + eps < Math.min(by0, segB.p1.y) - eps ||
    Math.max(by0, segB.p1.y) + eps < Math.min(ay0, segA.p1.y) - eps
  ) {
    return [];
  }

  const denom = cross2D(dax, day, dbx, dby);
  const rx = bx0 - ax0;
  const ry = by0 - ay0;

  if (Math.abs(denom) > 1e-12) {
    const tRaw = cross2D(rx, ry, dbx, dby) / denom;
    const uRaw = cross2D(rx, ry, dax, day) / denom;
    const paramTolA = eps / Math.max(1e-6, Math.sqrt(lenASq));
    const paramTolB = eps / Math.max(1e-6, Math.sqrt(lenBSq));
    if (tRaw >= -paramTolA && tRaw <= 1 + paramTolA && uRaw >= -paramTolB && uRaw <= 1 + paramTolB) {
      const t = clampFinite(tRaw, 0, 1, 0);
      const u = clampFinite(uRaw, 0, 1, 0);
      const isEndpointTouch = t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6;
      return [{ tA: t, tB: u, x: ax0 + dax * t, y: ay0 + day * t, kind: isEndpointTouch ? "t-junction" : "cross" }];
    }
    return [];
  }

  if (Math.abs(cross2D(rx, ry, dax, day)) / Math.sqrt(lenASq) > Math.max(eps, 1e-7)) return [];

  const tB0 = ((bx0 - ax0) * dax + (by0 - ay0) * day) / lenASq;
  const tB1 = ((segB.p1.x - ax0) * dax + (segB.p1.y - ay0) * day) / lenASq;
  const lo = Math.max(0, Math.min(tB0, tB1));
  const hi = Math.min(1, Math.max(tB0, tB1));
  if (hi < lo - 1e-9) return [];

  const candidates = Math.abs(hi - lo) <= 1e-7 ? [lo] : [lo, hi];
  return candidates.map((rawT) => {
    const t = clampFinite(rawT, 0, 1, 0);
    return {
      tA: t,
      tB: clampFinite(tB1 !== tB0 ? (t - tB0) / (tB1 - tB0) : 0, 0, 1, 0),
      x: ax0 + dax * t,
      y: ay0 + day * t,
      kind: "collinear-overlap" as const,
    };
  });
}

/** 대상 스트로크와 레이어 내 타 스트로크(및 자기 교차 옵션)의 정확한 교차점을 호장 오름차순으로 계산한다. */
export function findStrokeIntersections(
  layer: VectorInkLayer,
  targetStrokeId: string,
  options?: IntersectionEraserOptions,
): readonly VectorStrokeIntersectionHit[] {
  const targetStroke = layer.strokes.find((stroke) => stroke.id === targetStrokeId);
  if (!targetStroke) return [];
  const targetSegs = extractStrokeSegments(targetStroke);
  if (targetSegs.length === 0) return [];

  const totalLength = targetSegs[targetSegs.length - 1].endS;
  const includeSelf = options?.includeSelfIntersections ?? true;
  const eps = Math.max(1e-12, options?.intersectionEpsilon ?? DEFAULT_INTERSECTION_EPS);
  const dedupeArc = Math.max(1e-9, options?.dedupeArcLengthPx ?? DEFAULT_DEDUPE_ARC_PX);
  const endMargin = Math.max(0, options?.endpointIgnoreMarginPx ?? DEFAULT_ENDPOINT_MARGIN_PX);

  const rawHits: VectorStrokeIntersectionHit[] = [];

  for (let sIdx = 0; sIdx < layer.strokes.length; sIdx += 1) {
    const other = layer.strokes[sIdx];
    if (other.id === targetStrokeId) continue;
    const otherSegs = extractStrokeSegments(other);
    for (let i = 0; i < targetSegs.length; i += 1) {
      const segA = targetSegs[i];
      for (let j = 0; j < otherSegs.length; j += 1) {
        const segB = otherSegs[j];
        const hits = computeSegmentPairIntersections(segA, segB, eps);
        for (let k = 0; k < hits.length; k += 1) {
          const hit = hits[k];
          rawHits.push({
            arcLengthS: segA.startS + hit.tA * segA.length,
            x: hit.x,
            y: hit.y,
            targetSegmentIndex: segA.segIndex,
            otherStrokeId: other.id,
            otherSegmentIndex: segB.segIndex,
            otherSegmentP0: { x: segB.p0.x, y: segB.p0.y },
            otherSegmentP1: { x: segB.p1.x, y: segB.p1.y },
            kind: hit.kind,
          });
        }
      }
    }
  }

  if (includeSelf && targetSegs.length >= 3) {
    const segCount = targetSegs.length;
    for (let i = 0; i < segCount; i += 1) {
      const segA = targetSegs[i];
      for (let j = i + 2; j < segCount; j += 1) {
        if (targetStroke.closed && i === 0 && j === segCount - 1) continue;
        const segB = targetSegs[j];
        const hits = computeSegmentPairIntersections(segA, segB, eps);
        for (let k = 0; k < hits.length; k += 1) {
          const hit = hits[k];
          rawHits.push({
            arcLengthS: segA.startS + hit.tA * segA.length,
            x: hit.x,
            y: hit.y,
            targetSegmentIndex: segA.segIndex,
            otherStrokeId: targetStroke.id,
            otherSegmentIndex: segB.segIndex,
            otherSegmentP0: { x: segB.p0.x, y: segB.p0.y },
            otherSegmentP1: { x: segB.p1.x, y: segB.p1.y },
            kind: "self",
          });
          rawHits.push({
            arcLengthS: segB.startS + hit.tB * segB.length,
            x: hit.x,
            y: hit.y,
            targetSegmentIndex: segB.segIndex,
            otherStrokeId: targetStroke.id,
            otherSegmentIndex: segA.segIndex,
            otherSegmentP0: { x: segA.p0.x, y: segA.p0.y },
            otherSegmentP1: { x: segA.p1.x, y: segA.p1.y },
            kind: "self",
          });
        }
      }
    }
  }

  const filtered = rawHits
    .filter((hit) =>
      targetStroke.closed
        ? hit.arcLengthS >= 0 && hit.arcLengthS <= totalLength
        : hit.arcLengthS > endMargin && hit.arcLengthS < totalLength - endMargin,
    )
    .sort((a, b) => a.arcLengthS - b.arcLengthS);

  const deduped: VectorStrokeIntersectionHit[] = [];
  for (let i = 0; i < filtered.length; i += 1) {
    if (deduped.length === 0 || filtered[i].arcLengthS - deduped[deduped.length - 1].arcLengthS > dedupeArc) {
      deduped.push(filtered[i]);
    }
  }
  return deduped;
}

function appendPointIfDistinct(list: VectorInkPoint[], pt: VectorInkPoint): void {
  if (list.length === 0) {
    list.push(pt);
    return;
  }
  const prev = list[list.length - 1];
  if (Math.hypot(pt.x - prev.x, pt.y - prev.y) > DUPLICATE_VERTEX_EPS) {
    list.push(pt);
  }
}

function extractSubStrokeRange(
  stroke: VectorInkStroke,
  startS: number,
  endS: number,
  newId: string,
  cutStartHit: VectorStrokeIntersectionHit | null,
  cutEndHit: VectorStrokeIntersectionHit | null,
  taperStartPx: number,
  taperEndPx: number,
): VectorInkStroke {
  const segments = extractStrokeSegments(stroke);
  const startSample = sampleStrokeAtArcLength(stroke, startS);
  const endSample = sampleStrokeAtArcLength(stroke, endS);
  const startPoint: VectorInkPoint = {
    x: cutStartHit ? cutStartHit.x : startSample.x,
    y: cutStartHit ? cutStartHit.y : startSample.y,
    widthPx: startSample.widthPx,
    pressure: startSample.pressure,
  };
  const endPoint: VectorInkPoint = {
    x: cutEndHit ? cutEndHit.x : endSample.x,
    y: cutEndHit ? cutEndHit.y : endSample.y,
    widthPx: endSample.widthPx,
    pressure: endSample.pressure,
  };

  const points: VectorInkPoint[] = [startPoint];
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg.endS > startS + DUPLICATE_VERTEX_EPS && seg.endS < endS - DUPLICATE_VERTEX_EPS) {
      appendPointIfDistinct(points, seg.p1);
    }
  }
  if (
    points.length > 1 &&
    Math.hypot(endPoint.x - points[points.length - 1].x, endPoint.y - points[points.length - 1].y) <= DUPLICATE_VERTEX_EPS
  ) {
    points[points.length - 1] = endPoint;
  } else {
    points.push(endPoint);
  }

  return {
    id: newId,
    points,
    closed: false,
    taperStartPx,
    taperEndPx,
    colorOklch: stroke.colorOklch,
    opacity: stroke.opacity,
  };
}

function extractWrappedClosedComplement(
  stroke: VectorInkStroke,
  keepStartS: number,
  keepEndS: number,
  totalLength: number,
  newId: string,
  cutStartHit: VectorStrokeIntersectionHit,
  cutEndHit: VectorStrokeIntersectionHit,
): VectorInkStroke {
  if (keepStartS < keepEndS) {
    return extractSubStrokeRange(stroke, keepStartS, keepEndS, newId, cutStartHit, cutEndHit, 0, 0);
  }
  const partA = extractSubStrokeRange(stroke, keepStartS, totalLength, newId, cutStartHit, null, 0, 0);
  const partB = extractSubStrokeRange(stroke, 0, keepEndS, newId, null, cutEndHit, 0, 0);
  const merged: VectorInkPoint[] = [...partA.points];
  for (let i = 0; i < partB.points.length; i += 1) {
    appendPointIfDistinct(merged, partB.points[i]);
  }
  if (merged.length >= 2) {
    merged[0] = { ...merged[0], x: cutStartHit.x, y: cutStartHit.y };
    merged[merged.length - 1] = { ...merged[merged.length - 1], x: cutEndHit.x, y: cutEndHit.y };
  }
  return {
    id: newId,
    points: merged,
    closed: false,
    taperStartPx: 0,
    taperEndPx: 0,
    colorOklch: stroke.colorOklch,
    opacity: stroke.opacity,
  };
}

function measureCutResidualPx(endpoint: VectorInkPoint, hit: VectorStrokeIntersectionHit): number {
  return Math.max(
    Math.hypot(endpoint.x - hit.x, endpoint.y - hit.y),
    pointToSegmentDistance(endpoint.x, endpoint.y, hit.otherSegmentP0, hit.otherSegmentP1),
  );
}

function replaceTargetStrokeInLayer(
  layer: VectorInkLayer,
  targetStrokeId: string,
  replacement: readonly VectorInkStroke[],
): VectorInkLayer {
  const nextStrokes: VectorInkStroke[] = [];
  for (let i = 0; i < layer.strokes.length; i += 1) {
    const stroke = layer.strokes[i];
    if (stroke.id === targetStrokeId) {
      for (let r = 0; r < replacement.length; r += 1) nextStrokes.push(replacement[r]);
    } else {
      nextStrokes.push(stroke);
    }
  }
  return { ...layer, strokes: nextStrokes };
}

function buildEraseResult(
  status: VectorIntersectionEraseStatus,
  nextLayer: VectorInkLayer,
  targetStrokeId: string,
  clickArcLengthS: number,
  clickDistancePx: number,
  intersections: readonly VectorStrokeIntersectionHit[],
  cutStartHit: VectorStrokeIntersectionHit | null,
  cutEndHit: VectorStrokeIntersectionHit | null,
  removedSpanPx: number,
  residualOvershootPx: number,
  resultingStrokes: readonly VectorInkStroke[],
  beforeSha256: string,
  unchanged = false,
): VectorIntersectionEraseResult {
  return {
    status,
    layer: nextLayer,
    targetStrokeId,
    clickArcLengthS,
    clickDistancePx,
    intersections,
    cutStartHit,
    cutEndHit,
    removedSpanPx,
    residualOvershootPx,
    resultingStrokes,
    beforeSha256,
    afterSha256: unchanged ? beforeSha256 : computeVectorInkLayerSha256Hex(nextLayer),
  };
}

/**
 * 만화 벡터 교차점 지우개: 클릭 한 번으로 교차점을 넘어 삐져나온 자투리나
 * 두 교차점 사이의 내부 선분만 정밀 절단한다.
 */
export function eraseVectorStrokeToIntersections(
  layer: VectorInkLayer,
  targetStrokeId: string,
  clickPoint: ClickPoint2D,
  options?: IntersectionEraserOptions,
): VectorIntersectionEraseResult {
  const beforeSha256 = computeVectorInkLayerSha256Hex(layer);
  const targetStroke = layer.strokes.find((stroke) => stroke.id === targetStrokeId);
  if (!targetStroke) {
    return buildEraseResult(
      "stroke-not-found", layer, targetStrokeId, 0, Number.POSITIVE_INFINITY,
      [], null, null, 0, 0, [], beforeSha256, true,
    );
  }

  const totalLength = computeStrokeTotalLength(targetStroke);
  const projection = projectPointOntoStroke(targetStroke, clickPoint.x, clickPoint.y);
  const maxClickDistance = options?.maxClickDistancePx ?? DEFAULT_MAX_CLICK_DIST_PX;
  const intersections = findStrokeIntersections(layer, targetStrokeId, options);

  if (projection.distancePx > maxClickDistance) {
    return buildEraseResult(
      "click-too-far", layer, targetStrokeId, projection.arcLengthS, projection.distancePx,
      intersections, null, null, 0, 0, [targetStroke], beforeSha256, true,
    );
  }

  if (intersections.length === 0 || (targetStroke.closed && intersections.length < 2)) {
    const nextLayer = replaceTargetStrokeInLayer(layer, targetStrokeId, []);
    return buildEraseResult(
      "whole-stroke-removed", nextLayer, targetStrokeId, projection.arcLengthS, projection.distancePx,
      intersections, null, null, totalLength, 0, [], beforeSha256,
    );
  }

  const sClick = projection.arcLengthS;

  if (targetStroke.closed) {
    let idxNext = intersections.findIndex((hit) => hit.arcLengthS >= sClick);
    if (idxNext < 0) idxNext = 0;
    const prevHit = intersections[(idxNext - 1 + intersections.length) % intersections.length];
    const nextHit = intersections[idxNext];
    const removedSpanPx =
      nextHit.arcLengthS >= prevHit.arcLengthS
        ? nextHit.arcLengthS - prevHit.arcLengthS
        : totalLength - prevHit.arcLengthS + nextHit.arcLengthS;
    const remaining = extractWrappedClosedComplement(
      targetStroke, nextHit.arcLengthS, prevHit.arcLengthS, totalLength,
      `${targetStroke.id}__open`, nextHit, prevHit,
    );
    const residual = Math.max(
      measureCutResidualPx(remaining.points[0], nextHit),
      measureCutResidualPx(remaining.points[remaining.points.length - 1], prevHit),
    );
    return buildEraseResult(
      "opened-closed-loop", replaceTargetStrokeInLayer(layer, targetStrokeId, [remaining]),
      targetStrokeId, sClick, projection.distancePx, intersections,
      prevHit, nextHit, removedSpanPx, residual, [remaining], beforeSha256,
    );
  }

  let prevHit: VectorStrokeIntersectionHit | null = null;
  let nextHit: VectorStrokeIntersectionHit | null = null;
  for (let i = 0; i < intersections.length; i += 1) {
    const hit = intersections[i];
    if (hit.arcLengthS <= sClick) prevHit = hit;
    if (hit.arcLengthS > sClick && nextHit === null) nextHit = hit;
  }

  if (prevHit === null && nextHit !== null) {
    const trimmed = extractSubStrokeRange(
      targetStroke, nextHit.arcLengthS, totalLength, targetStroke.id,
      nextHit, null, 0, targetStroke.taperEndPx,
    );
    return buildEraseResult(
      "trimmed-start-tail", replaceTargetStrokeInLayer(layer, targetStrokeId, [trimmed]),
      targetStrokeId, sClick, projection.distancePx, intersections,
      null, nextHit, nextHit.arcLengthS, measureCutResidualPx(trimmed.points[0], nextHit),
      [trimmed], beforeSha256,
    );
  }

  if (prevHit !== null && nextHit === null) {
    const trimmed = extractSubStrokeRange(
      targetStroke, 0, prevHit.arcLengthS, targetStroke.id,
      null, prevHit, targetStroke.taperStartPx, 0,
    );
    return buildEraseResult(
      "trimmed-end-tail", replaceTargetStrokeInLayer(layer, targetStrokeId, [trimmed]),
      targetStrokeId, sClick, projection.distancePx, intersections,
      prevHit, null, totalLength - prevHit.arcLengthS,
      measureCutResidualPx(trimmed.points[trimmed.points.length - 1], prevHit),
      [trimmed], beforeSha256,
    );
  }

  const leftHit = prevHit as VectorStrokeIntersectionHit;
  const rightHit = nextHit as VectorStrokeIntersectionHit;
  const leftStroke = extractSubStrokeRange(
    targetStroke, 0, leftHit.arcLengthS, `${targetStroke.id}__partA`,
    null, leftHit, targetStroke.taperStartPx, 0,
  );
  const rightStroke = extractSubStrokeRange(
    targetStroke, rightHit.arcLengthS, totalLength, `${targetStroke.id}__partB`,
    rightHit, null, 0, targetStroke.taperEndPx,
  );
  const residual = Math.max(
    measureCutResidualPx(leftStroke.points[leftStroke.points.length - 1], leftHit),
    measureCutResidualPx(rightStroke.points[0], rightHit),
  );
  return buildEraseResult(
    "split-middle-bridge",
    replaceTargetStrokeInLayer(layer, targetStrokeId, [leftStroke, rightStroke]),
    targetStrokeId, sClick, projection.distancePx, intersections,
    leftHit, rightHit, rightHit.arcLengthS - leftHit.arcLengthS, residual,
    [leftStroke, rightStroke], beforeSha256,
  );
}
