/**
 * Wave 91 공통 2D 미분기하 · 곡선 평활화 · 모서리 커스프 검출 · 해시 유틸리티.
 *
 * - 프로파일러와 러프 통합기가 동일한 곡률(Menger), 손떨림(Taubin), 모서리 각도,
 *   최근접 선분 거리 및 수정 하우스도르프 거리 수학을 공유한다.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface BBox2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const DEFAULT_CORNER_ANGLE_DEG = 42;
const DEFAULT_MIN_CORNER_CHORD_PX = 6;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function computeMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) * 0.5;
}

export function computeMean(values: readonly number[]): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v !== undefined && Number.isFinite(v)) {
      sum += v;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

export function computeFnv1aHex64(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 ^= code & 0xff;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ((code >>> 8) ^ (code & 0xff) ^ ((i + 1) & 0xff)) & 0xff;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

export function computeSignedMengerCurvature(
  a: Point2D,
  b: Point2D,
  c: Point2D,
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const denom = Math.hypot(abx, aby) * Math.hypot(bcx, bcy) * Math.hypot(acx, acy);
  if (denom <= 1e-9) return 0;
  return (2 * (abx * acy - aby * acx)) / denom;
}

export function computeTurningAngleDeg(a: Point2D, b: Point2D, c: Point2D): number {
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 <= 1e-9 || len2 <= 1e-9) return 0;
  const cosVal = clampNumber((v1x * v2x + v1y * v2y) / (len1 * len2), -1, 1);
  return (Math.acos(cosVal) * 180) / Math.PI;
}

function windowCentroidByArc(
  points: readonly Point2D[],
  arcLengths: readonly number[],
  minArc: number,
  maxArc: number,
  fallbackIndex: number,
): Point2D {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (let k = 0; k < points.length; k += 1) {
    const s = arcLengths[k] ?? 0;
    if (s >= minArc && s <= maxArc) {
      const pt = points[k];
      if (pt) {
        sx += pt.x;
        sy += pt.y;
        count += 1;
      }
    }
  }
  if (count > 0) return { x: sx / count, y: sy / count };
  const fb = points[clampNumber(fallbackIndex, 0, points.length - 1)];
  return fb ?? { x: 0, y: 0 };
}

/**
 * 창 평균(window centroid) 기반 날카로운 모서리 커스프 검출기.
 * ±2.5px 고주파 손떨림에서는 오검출을 차단하고 90도 머리카락 끝/턱선 등은 정밀하게 유지한다.
 */
export function detectSharpCornerIndices(
  points: readonly Point2D[],
  arcLengths: readonly number[],
  cornerAngleDegThreshold = DEFAULT_CORNER_ANGLE_DEG,
  minCornerChordPx = DEFAULT_MIN_CORNER_CHORD_PX,
): number[] {
  const n = points.length;
  if (n < 3) return [];
  const totalArc = arcLengths[n - 1] ?? 0;
  if (totalArc <= 1e-6) return [];

  if (n < 7) {
    const simple: number[] = [];
    for (let i = 1; i < n - 1; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      if (prev && curr && next && computeTurningAngleDeg(prev, curr, next) >= cornerAngleDegThreshold) {
        simple.push(i);
      }
    }
    return simple;
  }

  const innerSpan = Math.max(3.5, Math.min(minCornerChordPx, totalArc * 0.06));
  const outerSpan = Math.max(innerSpan + 10, Math.min(20, totalArc * 0.22));
  const farSpan = Math.max(outerSpan + 10, Math.min(34, totalArc * 0.36));
  const candidates: Array<{ readonly index: number; readonly score: number }> = [];

  for (let i = 2; i < n - 2; i += 1) {
    const curr = points[i];
    if (!curr) continue;
    const sCurr = arcLengths[i] ?? 0;
    if (sCurr < innerSpan * 1.1 || totalArc - sCurr < innerSpan * 1.1) continue;

    const pBefore = windowCentroidByArc(points, arcLengths, sCurr - outerSpan, sCurr - innerSpan, i - 1);
    const pAfter = windowCentroidByArc(points, arcLengths, sCurr + innerSpan, sCurr + outerSpan, i + 1);
    const windowAngle = computeTurningAngleDeg(pBefore, curr, pAfter);
    if (windowAngle < cornerAngleDegThreshold) continue;

    const pBeforeFar = windowCentroidByArc(points, arcLengths, sCurr - farSpan, sCurr - outerSpan * 0.85, 0);
    const pAfterFar = windowCentroidByArc(points, arcLengths, sCurr + outerSpan * 0.85, sCurr + farSpan, n - 1);
    const v1x = pBefore.x - pBeforeFar.x;
    const v1y = pBefore.y - pBeforeFar.y;
    const v2x = pAfterFar.x - pAfter.x;
    const v2y = pAfterFar.y - pAfter.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    const macroAngle =
      l1 > 1e-6 && l2 > 1e-6
        ? (Math.acos(clampNumber((v1x * v2x + v1y * v2y) / (l1 * l2), -1, 1)) * 180) / Math.PI
        : windowAngle;

    if (macroAngle >= cornerAngleDegThreshold * 0.72) {
      const prev = points[i - 1] ?? pBefore;
      const next = points[i + 1] ?? pAfter;
      const immediateAngle = computeTurningAngleDeg(prev, curr, next);
      candidates.push({
        index: i,
        score: 0.65 * windowAngle + 0.35 * immediateAngle,
      });
    }
  }

  // 비최대 억제(NMS): 인접 12px 창 내 최고점 1개만 채택한다.
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const selected: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const cand = sorted[i];
    if (!cand) continue;
    const sCand = arcLengths[cand.index] ?? 0;
    let conflicts = false;
    for (let j = 0; j < selected.length; j += 1) {
      const keptIdx = selected[j];
      if (keptIdx !== undefined && Math.abs(sCand - (arcLengths[keptIdx] ?? 0)) < 12) {
        conflicts = true;
        break;
      }
    }
    if (!conflicts) selected.push(cand.index);
  }
  return selected.sort((a, b) => a - b);
}

export function resamplePolylineUniform(
  points: readonly Point2D[],
  spacingPx: number,
): Point2D[] {
  if (points.length <= 1) return [...points];
  const step = Math.max(0.5, spacingPx);
  const arc: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const p0 = points[i - 1];
    const p1 = points[i];
    if (p0 && p1) arc.push((arc[arc.length - 1] ?? 0) + Math.hypot(p1.x - p0.x, p1.y - p0.y));
  }
  const total = arc[arc.length - 1] ?? 0;
  if (total <= 1e-6) return [points[0] ?? { x: 0, y: 0 }];

  const count = Math.max(2, Math.round(total / step) + 1);
  const resampled: Point2D[] = [];
  let seg = 0;
  for (let k = 0; k < count; k += 1) {
    const target = (total * k) / (count - 1);
    while (seg < arc.length - 2 && (arc[seg + 1] ?? 0) < target) seg += 1;
    const s0 = arc[seg] ?? 0;
    const s1 = arc[seg + 1] ?? total;
    const p0 = points[seg];
    const p1 = points[seg + 1] ?? p0;
    if (!p0 || !p1) continue;
    const t = s1 > s0 + 1e-9 ? clampNumber((target - s0) / (s1 - s0), 0, 1) : 0;
    resampled.push({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t });
  }
  return resampled;
}

function runTaubinPass(
  points: readonly Point2D[],
  weight: number,
  pinnedIndices?: ReadonlySet<number>,
): Point2D[] {
  const n = points.length;
  const next: Point2D[] = new Array<Point2D>(n);
  const first = points[0];
  const last = points[n - 1];
  if (first) next[0] = { x: first.x, y: first.y };
  if (last) next[n - 1] = { x: last.x, y: last.y };

  for (let i = 1; i < n - 1; i += 1) {
    const curr = points[i];
    const prev = points[i - 1];
    const nxt = points[i + 1];
    if (!curr || !prev || !nxt) continue;
    if (pinnedIndices?.has(i)) {
      next[i] = { x: curr.x, y: curr.y };
      continue;
    }
    next[i] = {
      x: curr.x + weight * (0.5 * (prev.x + nxt.x) - curr.x),
      y: curr.y + weight * (0.5 * (prev.y + nxt.y) - curr.y),
    };
  }
  return next;
}

export function applyTaubinCurveSmoothing(
  points: readonly Point2D[],
  iterations = 10,
  pinnedIndices?: ReadonlySet<number>,
): Point2D[] {
  if (points.length < 3 || iterations <= 0) return points.map((p) => ({ x: p.x, y: p.y }));
  let current = points.map((p) => ({ x: p.x, y: p.y }));
  for (let iter = 0; iter < iterations; iter += 1) {
    current = runTaubinPass(current, 0.5, pinnedIndices);
    current = runTaubinPass(current, -0.52, pinnedIndices);
  }
  return current;
}

export function measureHighFrequencyTremor(
  points: readonly Point2D[],
  cornerIndices: readonly number[],
): { readonly tremorRmsPx: number; readonly tremorEnergyRatio: number } {
  if (points.length < 4) return { tremorRmsPx: 0, tremorEnergyRatio: 0 };
  const splitStarts = [0, ...cornerIndices];
  const splitEnds = [...cornerIndices, points.length - 1];
  let sqDistSum = 0;
  let sampleCount = 0;

  for (let segIdx = 0; segIdx < splitStarts.length; segIdx += 1) {
    const start = splitStarts[segIdx] ?? 0;
    const end = splitEnds[segIdx] ?? points.length - 1;
    if (end - start < 3) continue;
    const uniform = resamplePolylineUniform(points.slice(start, end + 1), 2.5);
    if (uniform.length < 5) continue;
    const smooth = applyTaubinCurveSmoothing(uniform, 12);
    for (let i = 1; i < uniform.length - 1; i += 1) {
      const u = uniform[i];
      const s = smooth[i];
      if (!u || !s) continue;
      const dx = u.x - s.x;
      const dy = u.y - s.y;
      sqDistSum += dx * dx + dy * dy;
      sampleCount += 1;
    }
  }
  if (sampleCount === 0) return { tremorRmsPx: 0, tremorEnergyRatio: 0 };
  const meanSq = sqDistSum / sampleCount;
  return {
    tremorRmsPx: Math.sqrt(meanSq),
    tremorEnergyRatio: clampNumber(meanSq / (meanSq + 1.0), 0, 1),
  };
}

export function computeBBox(points: readonly Point2D[]): BBox2D {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (!p) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export function bboxesOverlap(a: BBox2D, b: BBox2D, pad: number): boolean {
  return (
    a.minX - pad <= b.maxX &&
    a.maxX + pad >= b.minX &&
    a.minY - pad <= b.maxY &&
    a.maxY + pad >= b.minY
  );
}

export function pointToSegmentClosest(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { readonly dist: number; readonly tangentX: number; readonly tangentY: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-12) {
    return { dist: Math.hypot(px - ax, py - ay), tangentX: 1, tangentY: 0 };
  }
  const t = clampNumber(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  const len = Math.sqrt(lenSq);
  return {
    dist: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)),
    tangentX: dx / len,
    tangentY: dy / len,
  };
}

export function nearestDistanceAndTangentToPolyline(
  point: Point2D,
  poly: readonly Point2D[],
): { readonly dist: number; readonly tangentX: number; readonly tangentY: number } {
  let bestDist = Number.POSITIVE_INFINITY;
  let bestTx = 1;
  let bestTy = 0;
  for (let i = 0; i < poly.length - 1; i += 1) {
    const a = poly[i];
    const b = poly[i + 1];
    if (!a || !b) continue;
    const hit = pointToSegmentClosest(point.x, point.y, a.x, a.y, b.x, b.y);
    if (hit.dist < bestDist) {
      bestDist = hit.dist;
      bestTx = hit.tangentX;
      bestTy = hit.tangentY;
    }
  }
  if (!Number.isFinite(bestDist)) {
    const p0 = poly[0];
    return { dist: p0 ? Math.hypot(point.x - p0.x, point.y - p0.y) : 0, tangentX: 1, tangentY: 0 };
  }
  return { dist: bestDist, tangentX: bestTx, tangentY: bestTy };
}

export function computeModifiedHausdorffPx(
  polyA: readonly Point2D[],
  polyB: readonly Point2D[],
): number {
  if (polyA.length === 0 || polyB.length === 0) return 0;
  let sumA = 0;
  for (let i = 0; i < polyA.length; i += 1) {
    const p = polyA[i];
    if (p) sumA += nearestDistanceAndTangentToPolyline(p, polyB).dist;
  }
  let sumB = 0;
  for (let i = 0; i < polyB.length; i += 1) {
    const p = polyB[i];
    if (p) sumB += nearestDistanceAndTangentToPolyline(p, polyA).dist;
  }
  return Math.max(sumA / polyA.length, sumB / polyB.length);
}
