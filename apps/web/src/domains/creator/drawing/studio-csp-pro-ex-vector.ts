/**
 * Clip Studio Paint Pro/EX 벡터 선 편집 엔진.
 *
 * - 벡터 지우개 3모드 (`touch` 세그먼트 절단 · `intersection` 교차점까지 삭제 · `whole` 선 전체 삭제)
 * - 벡터 선 단순화 (`simplifyCspVectorStroke` — Ramer-Douglas-Peucker)
 * - 제어점 부드러운 핀치 (`pinchCspVectorStroke` — 사차 방사 감쇠 당김)
 */

export interface CspVectorStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly pressure: number;
}

export interface CspVectorStroke {
  readonly id: string;
  readonly points: readonly CspVectorStrokePoint[];
}

export type CspVectorEraserMode = "touch" | "intersection" | "whole";

export interface CspVectorEraserCircle {
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
}

export interface CspVectorEraseResult {
  readonly mode: CspVectorEraserMode;
  readonly strokes: readonly CspVectorStroke[];
  readonly erasedStrokeCount: number;
  readonly erasedSegmentCount: number;
  readonly intersectionCutCount: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function lerpVectorPoint(
  a: CspVectorStrokePoint,
  b: CspVectorStrokePoint,
  t: number,
): CspVectorStrokePoint {
  const u = clamp(t, 0, 1);
  return {
    x: Number((a.x + (b.x - a.x) * u).toFixed(3)),
    y: Number((a.y + (b.y - a.y) * u).toFixed(3)),
    widthPx: Number((a.widthPx + (b.widthPx - a.widthPx) * u).toFixed(3)),
    pressure: Number((a.pressure + (b.pressure - a.pressure) * u).toFixed(3)),
  };
}

function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-10) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function polylineTouchesCircle(
  points: readonly CspVectorStrokePoint[],
  circle: CspVectorEraserCircle,
): boolean {
  const r = Math.max(0.5, circle.radiusPx);
  if (points.length === 0) return false;
  if (points.length === 1) {
    const p0 = points[0];
    return p0 !== undefined && Math.hypot(p0.x - circle.x, p0.y - circle.y) <= r;
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    if (pointToSegmentDistance(circle.x, circle.y, a.x, a.y, b.x, b.y) <= r) {
      return true;
    }
  }
  return false;
}

function segmentCircleEraseInterval(
  a: CspVectorStrokePoint,
  b: CspVectorStrokePoint,
  circle: CspVectorEraserCircle,
): readonly [number, number] | null {
  const r = Math.max(0.5, circle.radiusPx);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - circle.x;
  const fy = a.y - circle.y;
  const quadA = dx * dx + dy * dy;
  if (quadA <= 1e-10) {
    return fx * fx + fy * fy <= r * r ? [0, 1] : null;
  }
  const quadB = 2 * (fx * dx + fy * dy);
  const quadC = fx * fx + fy * fy - r * r;
  const disc = quadB * quadB - 4 * quadA * quadC;
  if (disc < 0) return null;
  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-quadB - sqrtDisc) / (2 * quadA);
  const t2 = (-quadB + sqrtDisc) / (2 * quadA);
  const s = clamp(Math.min(t1, t2), 0, 1);
  const e = clamp(Math.max(t1, t2), 0, 1);
  if (e <= 0 || s >= 1) return null;
  if (e - s <= 1e-6 && pointToSegmentDistance(circle.x, circle.y, a.x, a.y, b.x, b.y) > r) {
    return null;
  }
  return [s, e];
}

function segmentIntersectionParamOnFirst(
  a1: CspVectorStrokePoint,
  a2: CspVectorStrokePoint,
  b1: CspVectorStrokePoint,
  b2: CspVectorStrokePoint,
): number | null {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) <= 1e-9) return null;
  const qpx = b1.x - a1.x;
  const qpy = b1.y - a1.y;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  const eps = 1e-6;
  if (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps) {
    return clamp(t, 0, 1);
  }
  return null;
}

function buildArcLengths(points: readonly CspVectorStrokePoint[]): readonly number[] {
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev && curr) {
      total += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    }
    cum.push(total);
  }
  return cum;
}

function samplePointAtArcLength(
  points: readonly CspVectorStrokePoint[],
  cumLen: readonly number[],
  targetS: number,
): CspVectorStrokePoint {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length <= 1) {
    return first ?? { x: 0, y: 0, widthPx: 1, pressure: 0.5 };
  }
  const total = cumLen[cumLen.length - 1] ?? 0;
  if (targetS <= 0 || total <= 1e-9) return first;
  if (targetS >= total) return last;

  for (let i = 0; i < points.length - 1; i += 1) {
    const s0 = cumLen[i] ?? 0;
    const s1 = cumLen[i + 1] ?? s0;
    if (targetS >= s0 && targetS <= s1) {
      const a = points[i];
      const b = points[i + 1];
      if (!a || !b) break;
      const segLen = Math.max(1e-9, s1 - s0);
      return lerpVectorPoint(a, b, (targetS - s0) / segLen);
    }
  }
  return last;
}

function slicePolylineByArcRange(
  points: readonly CspVectorStrokePoint[],
  cumLen: readonly number[],
  startS: number,
  endS: number,
): readonly CspVectorStrokePoint[] {
  if (endS - startS <= 1e-3 || points.length < 2) return [];
  const sliced: CspVectorStrokePoint[] = [samplePointAtArcLength(points, cumLen, startS)];
  for (let i = 1; i < points.length - 1; i += 1) {
    const s = cumLen[i] ?? 0;
    const pt = points[i];
    if (pt && s > startS + 1e-3 && s < endS - 1e-3) {
      sliced.push(pt);
    }
  }
  sliced.push(samplePointAtArcLength(points, cumLen, endS));
  return sliced;
}

/**
 * CSP 벡터 지우개 3모드 실행기:
 * - `touch`: 지우개 원과 닿은 세그먼트만 정밀 절단
 * - `intersection`: 다른 벡터 선(및 비인접 자가 교차)과의 교차점까지만 깔끔히 삭제
 * - `whole`: 닿은 벡터 선 전체 삭제
 */
export function eraseCspVectorStrokes(
  strokes: readonly CspVectorStroke[],
  eraser: CspVectorEraserCircle,
  mode: CspVectorEraserMode,
): CspVectorEraseResult {
  const nextStrokes: CspVectorStroke[] = [];
  let erasedStrokeCount = 0;
  let erasedSegmentCount = 0;
  let intersectionCutCount = 0;

  for (let sIdx = 0; sIdx < strokes.length; sIdx += 1) {
    const stroke = strokes[sIdx];
    if (!stroke) continue;
    const pts = stroke.points;

    if (!polylineTouchesCircle(pts, eraser)) {
      nextStrokes.push(stroke);
      continue;
    }

    if (mode === "whole" || pts.length < 2) {
      erasedStrokeCount += 1;
      erasedSegmentCount += Math.max(1, pts.length - 1);
      continue;
    }

    if (mode === "touch") {
      const pieces: CspVectorStrokePoint[][] = [];
      let activePiece: CspVectorStrokePoint[] = [];

      const flushPiece = (): void => {
        if (activePiece.length >= 2) {
          pieces.push(activePiece);
        }
        activePiece = [];
      };

      const appendPoint = (pt: CspVectorStrokePoint): void => {
        const tail = activePiece[activePiece.length - 1];
        if (!tail || Math.hypot(tail.x - pt.x, tail.y - pt.y) > 1e-3) {
          activePiece.push(pt);
        }
      };

      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i];
        const b = pts[i + 1];
        if (!a || !b) continue;
        const interval = segmentCircleEraseInterval(a, b, eraser);
        if (!interval) {
          appendPoint(a);
          appendPoint(b);
          continue;
        }
        erasedSegmentCount += 1;
        const [cutStart, cutEnd] = interval;
        if (cutStart > 1e-4) {
          appendPoint(a);
          appendPoint(lerpVectorPoint(a, b, cutStart));
        }
        flushPiece();
        if (cutEnd < 1 - 1e-4) {
          appendPoint(lerpVectorPoint(a, b, cutEnd));
          appendPoint(b);
        }
      }
      flushPiece();

      if (pieces.length === 0) {
        erasedStrokeCount += 1;
      } else {
        pieces.forEach((piecePts, pIdx) => {
          nextStrokes.push({
            id: pieces.length === 1 ? stroke.id : `${stroke.id}#part-${pIdx + 1}`,
            points: piecePts,
          });
        });
      }
      continue;
    }

    const cumLen = buildArcLengths(pts);
    const totalLen = cumLen[cumLen.length - 1] ?? 0;
    const rawCutArcs: number[] = [];

    for (let segA = 0; segA < pts.length - 1; segA += 1) {
      const a1 = pts[segA];
      const a2 = pts[segA + 1];
      if (!a1 || !a2) continue;
      const segStartS = cumLen[segA] ?? 0;
      const segLen = (cumLen[segA + 1] ?? segStartS) - segStartS;
      if (segLen <= 1e-6) continue;

      for (let oIdx = 0; oIdx < strokes.length; oIdx += 1) {
        const other = strokes[oIdx];
        if (!other || other.points.length < 2) continue;
        for (let segB = 0; segB < other.points.length - 1; segB += 1) {
          if (oIdx === sIdx && Math.abs(segA - segB) <= 1) continue;
          const b1 = other.points[segB];
          const b2 = other.points[segB + 1];
          if (!b1 || !b2) continue;
          const t = segmentIntersectionParamOnFirst(a1, a2, b1, b2);
          if (t !== null) {
            const cutS = segStartS + t * segLen;
            if (cutS > 1e-2 && cutS < totalLen - 1e-2) {
              rawCutArcs.push(cutS);
            }
          }
        }
      }
    }

    rawCutArcs.sort((x, y) => x - y);
    const boundaries: number[] = [0];
    for (const sVal of rawCutArcs) {
      const prev = boundaries[boundaries.length - 1] ?? 0;
      if (sVal - prev > 0.05) {
        boundaries.push(sVal);
      }
    }
    if (totalLen - (boundaries[boundaries.length - 1] ?? 0) > 0.05) {
      boundaries.push(totalLen);
    }

    const keptPieces: (readonly CspVectorStrokePoint[])[] = [];
    for (let bIdx = 0; bIdx < boundaries.length - 1; bIdx += 1) {
      const startS = boundaries[bIdx] ?? 0;
      const endS = boundaries[bIdx + 1] ?? totalLen;
      const subPts = slicePolylineByArcRange(pts, cumLen, startS, endS);
      if (subPts.length < 2) continue;
      if (polylineTouchesCircle(subPts, eraser)) {
        erasedSegmentCount += 1;
        if (boundaries.length > 2) {
          intersectionCutCount += 1;
        }
      } else {
        keptPieces.push(subPts);
      }
    }

    if (keptPieces.length === 0) {
      erasedStrokeCount += 1;
    } else {
      keptPieces.forEach((piecePts, pIdx) => {
        nextStrokes.push({
          id: keptPieces.length === 1 ? stroke.id : `${stroke.id}#cut-${pIdx + 1}`,
          points: piecePts,
        });
      });
    }
  }

  return {
    mode,
    strokes: nextStrokes,
    erasedStrokeCount,
    erasedSegmentCount,
    intersectionCutCount,
  };
}

/** Ramer-Douglas-Peucker 알고리즘으로 벡터 제어점을 정밀 단순화한다. */
export function simplifyCspVectorStroke(
  points: readonly CspVectorStrokePoint[],
  tolerancePx: number,
): readonly CspVectorStrokePoint[] {
  if (points.length <= 2 || !Number.isFinite(tolerancePx) || tolerancePx <= 0) {
    return [...points];
  }

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const span = stack.pop();
    if (!span) break;
    const [startIdx, endIdx] = span;
    if (endIdx - startIdx <= 1) continue;
    const startPt = points[startIdx];
    const endPt = points[endIdx];
    if (!startPt || !endPt) continue;

    let maxDist = -1;
    let maxIndex = -1;
    for (let i = startIdx + 1; i < endIdx; i += 1) {
      const candidate = points[i];
      if (!candidate) continue;
      const dist = pointToSegmentDistance(
        candidate.x,
        candidate.y,
        startPt.x,
        startPt.y,
        endPt.x,
        endPt.y,
      );
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > tolerancePx && maxIndex > startIdx && maxIndex < endIdx) {
      keep[maxIndex] = 1;
      stack.push([startIdx, maxIndex], [maxIndex, endIdx]);
    }
  }

  const simplified: CspVectorStrokePoint[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i];
    if (keep[i] === 1 && pt) simplified.push(pt);
  }
  return simplified;
}

/** 반경 내 벡터 제어점을 부드러운 사차 감쇠 곡선으로 당겨 선 모양을 수정한다. */
export function pinchCspVectorStroke(
  points: readonly CspVectorStrokePoint[],
  center: { readonly x: number; readonly y: number },
  delta: { readonly dx: number; readonly dy: number },
  radiusPx: number,
  options?: { readonly strength01?: number; readonly pinEndpoints?: boolean },
): readonly CspVectorStrokePoint[] {
  const radius = Math.max(2, radiusPx);
  const strength = clamp(options?.strength01 ?? 0.85, 0, 1);
  const pinEnds = options?.pinEndpoints ?? false;
  const lastIdx = points.length - 1;

  return points.map((pt, index) => {
    if (pinEnds && (index === 0 || index === lastIdx)) {
      return pt;
    }
    const dist = Math.hypot(pt.x - center.x, pt.y - center.y);
    if (dist >= radius) return pt;
    const u = dist / radius;
    const falloff = (1 - u * u) ** 2 * strength;
    return {
      ...pt,
      x: Number((pt.x + delta.dx * falloff).toFixed(3)),
      y: Number((pt.y + delta.dy * falloff).toFixed(3)),
    };
  });
}
