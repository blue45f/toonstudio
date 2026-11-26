/**
 * Pure zero-dependency 2D vector-ink curve math:
 * - 2-stage radial + Ramer-Douglas-Peucker simplification matching simplify-js 1.2.4
 * - Analytic cubic Bezier evaluation, de Casteljau splitting, 24-point Gauss-Legendre arc length,
 *   exact derivative-root bounding box, LUT sampling, and closest-point projection.
 */

export interface VectorInkPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface VectorInkLutPoint extends VectorInkPoint2D {
  readonly t: number;
}

export interface VectorInkProjection extends VectorInkLutPoint {
  readonly d: number;
}

export interface VectorInkBBox {
  readonly x: { readonly min: number; readonly max: number };
  readonly y: { readonly min: number; readonly max: number };
}

// 24-point Gauss-Legendre quadrature nodes (T) and weights (C) on [-1, 1],
// matching standard numerical arc-length integration to < 1e-12.
const LEGENDRE_T = [
  -0.06405689286260563, 0.06405689286260563, -0.1911188674736163, 0.1911188674736163,
  -0.3150426796961634, 0.3150426796961634, -0.4337935076260451, 0.4337935076260451,
  -0.5454214713888396, 0.5454214713888396, -0.6480936519369755, 0.6480936519369755,
  -0.7401241915785544, 0.7401241915785544, -0.820001985973903, 0.820001985973903,
  -0.8864155270044011, 0.8864155270044011, -0.9382745520027328, 0.9382745520027328,
  -0.9747285559713095, 0.9747285559713095, -0.9951872199970213, 0.9951872199970213,
] as const;

const LEGENDRE_C = [
  0.12793819534675216, 0.12793819534675216, 0.1258374563468283, 0.1258374563468283,
  0.12167047292780339, 0.12167047292780339, 0.1155056680537256, 0.1155056680537256,
  0.10744427011596563, 0.10744427011596563, 0.09761865210411388, 0.09761865210411388,
  0.08619016153195327, 0.08619016153195327, 0.0733464814110803, 0.0733464814110803,
  0.05929858491543678, 0.05929858491543678, 0.04427743881741981, 0.04427743881741981,
  0.028531388628933663, 0.028531388628933663, 0.0123412297999872, 0.0123412297999872,
] as const;

function sqSegDist(p: VectorInkPoint2D, p1: VectorInkPoint2D, p2: VectorInkPoint2D): number {
  let x = p1.x;
  let y = p1.y;
  let dx = p2.x - x;
  let dy = p2.y - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2.x;
      y = p2.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p.x - x;
  dy = p.y - y;
  return dx * dx + dy * dy;
}

/**
 * 2-stage (optional radial distance filter + Ramer-Douglas-Peucker) polyline simplification
 * matching simplify-js 1.2.4 bit-for-bit while preserving generic point metadata.
 */
export function simplifyPolylineRdp<T extends VectorInkPoint2D>(
  points: readonly T[],
  tolerance = 1,
  highestQuality = false,
): T[] {
  if (points.length <= 2) return [...points];
  const sqTolerance = tolerance * tolerance;
  let working: readonly T[] = points;

  if (!highestQuality) {
    const radial: T[] = [points[0]!];
    let prev = points[0]!;
    for (let i = 1; i < points.length; i += 1) {
      const curr = points[i]!;
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      if (dx * dx + dy * dy > sqTolerance) {
        radial.push(curr);
        prev = curr;
      }
    }
    if (prev !== points[points.length - 1]) radial.push(points[points.length - 1]!);
    working = radial;
  }
  if (working.length <= 2) return [...working];

  const out: T[] = [working[0]!];
  const step = (first: number, last: number): void => {
    let maxSq = sqTolerance;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const sq = sqSegDist(working[i]!, working[first]!, working[last]!);
      if (sq > maxSq) {
        index = i;
        maxSq = sq;
      }
    }
    if (index >= 0 && maxSq > sqTolerance) {
      if (index - first > 1) step(first, index);
      out.push(working[index]!);
      if (last - index > 1) step(index, last);
    }
  };
  step(0, working.length - 1);
  out.push(working[working.length - 1]!);
  return out;
}

function cubicDerivativeRoots(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
  const b = 6 * (p0 - 2 * p1 + p2);
  const c = 3 * (p1 - p0);
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) {
      const t = -c / b;
      if (t > 0 && t < 1) roots.push(t);
    }
    return roots;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return roots;
  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);
  if (t1 > 0 && t1 < 1) roots.push(t1);
  if (t2 > 0 && t2 < 1) roots.push(t2);
  return roots;
}

/** Zero-dependency planar cubic Bezier curve evaluator matching bezier-js metrics. */
export class StudioCubicBezier {
  private readonly p0: VectorInkPoint2D;
  private readonly p1: VectorInkPoint2D;
  private readonly p2: VectorInkPoint2D;
  private readonly p3: VectorInkPoint2D;
  private cachedLut100: VectorInkLutPoint[] | null = null;

  constructor(
    controls: readonly [
      VectorInkPoint2D,
      VectorInkPoint2D,
      VectorInkPoint2D,
      VectorInkPoint2D,
    ],
  ) {
    this.p0 = controls[0];
    this.p1 = controls[1];
    this.p2 = controls[2];
    this.p3 = controls[3];
  }

  get(t: number): VectorInkPoint2D {
    if (t === 0) return { x: this.p0.x, y: this.p0.y };
    if (t === 1) return { x: this.p3.x, y: this.p3.y };
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const a = mt2 * mt;
    const b = 3 * mt2 * t;
    const c = 3 * mt * t2;
    const d = t2 * t;
    return {
      x: a * this.p0.x + b * this.p1.x + c * this.p2.x + d * this.p3.x,
      y: a * this.p0.y + b * this.p1.y + c * this.p2.y + d * this.p3.y,
    };
  }

  private derivativeSpeed(t: number): number {
    const mt = 1 - t;
    const a = 3 * mt * mt;
    const b = 6 * mt * t;
    const c = 3 * t * t;
    const dx = a * (this.p1.x - this.p0.x) + b * (this.p2.x - this.p1.x) + c * (this.p3.x - this.p2.x);
    const dy = a * (this.p1.y - this.p0.y) + b * (this.p2.y - this.p1.y) + c * (this.p3.y - this.p2.y);
    return Math.hypot(dx, dy);
  }

  length(): number {
    let sum = 0;
    for (let i = 0; i < LEGENDRE_T.length; i += 1) {
      const t = 0.5 * LEGENDRE_T[i]! + 0.5;
      sum += LEGENDRE_C[i]! * this.derivativeSpeed(t);
    }
    return 0.5 * sum;
  }

  split(t1: number, t2?: number): StudioCubicBezier {
    const leftAt = (curve: StudioCubicBezier, t: number): StudioCubicBezier => {
      const lerp = (a: VectorInkPoint2D, b: VectorInkPoint2D): VectorInkPoint2D => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
      const q0 = lerp(curve.p0, curve.p1);
      const q1 = lerp(curve.p1, curve.p2);
      const q2 = lerp(curve.p2, curve.p3);
      const r0 = lerp(q0, q1);
      const r1 = lerp(q1, q2);
      const s = lerp(r0, r1);
      return new StudioCubicBezier([curve.p0, q0, r0, s]);
    };
    const rightAt = (curve: StudioCubicBezier, t: number): StudioCubicBezier => {
      const lerp = (a: VectorInkPoint2D, b: VectorInkPoint2D): VectorInkPoint2D => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
      const q0 = lerp(curve.p0, curve.p1);
      const q1 = lerp(curve.p1, curve.p2);
      const q2 = lerp(curve.p2, curve.p3);
      const r0 = lerp(q0, q1);
      const r1 = lerp(q1, q2);
      const s = lerp(r0, r1);
      return new StudioCubicBezier([s, r1, q2, curve.p3]);
    };
    if (t2 === undefined) return leftAt(this, t1);
    if (t1 === 0) return leftAt(this, t2);
    const right = rightAt(this, t1);
    const localT2 = t1 >= 1 ? 0 : (t2 - t1) / (1 - t1);
    return leftAt(right, localT2);
  }

  bbox(): VectorInkBBox {
    const ts = [
      0,
      1,
      ...cubicDerivativeRoots(this.p0.x, this.p1.x, this.p2.x, this.p3.x),
      ...cubicDerivativeRoots(this.p0.y, this.p1.y, this.p2.y, this.p3.y),
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const t of ts) {
      const pt = this.get(t);
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    return { x: { min: minX, max: maxX }, y: { min: minY, max: maxY } };
  }

  getLUT(steps = 100): VectorInkLutPoint[] {
    if (steps === 100 && this.cachedLut100) return this.cachedLut100;
    const lut: VectorInkLutPoint[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const pt = this.get(t);
      lut.push({ x: pt.x, y: pt.y, t });
    }
    if (steps === 100) this.cachedLut100 = lut;
    return lut;
  }

  project(point: VectorInkPoint2D): VectorInkProjection {
    const lut = this.getLUT(100);
    const last = lut.length - 1;
    let bestPos = 0;
    let bestSq = Infinity;
    for (let i = 0; i <= last; i += 1) {
      const item = lut[i]!;
      const dx = item.x - point.x;
      const dy = item.y - point.y;
      const sq = dx * dx + dy * dy;
      if (sq < bestSq) {
        bestSq = sq;
        bestPos = i;
      }
    }

    let t = lut[bestPos]!.t;
    if (bestPos === 0 || bestPos === last) {
      const pt = this.get(t);
      const d = Math.hypot(pt.x - point.x, pt.y - point.y);
      // Refine near the boundary in case the true minimum sits just inside (0, 1/100) or (99/100, 1).
      let t1 = bestPos === 0 ? 0 : lut[last - 1]!.t;
      let t2 = bestPos === 0 ? lut[1]!.t : 1;
      let bestT = t;
      let bestD = d;
      let bestPt = pt;
      let step = (t2 - t1) / 10;
      while (step > 1e-7) {
        let improved = false;
        for (let cand = t1; cand <= t2 + 1e-12; cand += step) {
          const clamped = Math.min(1, Math.max(0, cand));
          const cPt = this.get(clamped);
          const cD = Math.hypot(cPt.x - point.x, cPt.y - point.y);
          if (cD < bestD) {
            bestD = cD;
            bestT = clamped;
            bestPt = cPt;
            improved = true;
          }
        }
        t1 = Math.max(0, bestT - step);
        t2 = Math.min(1, bestT + step);
        step *= improved ? 0.5 : 0.25;
      }
      return { x: bestPt.x, y: bestPt.y, t: bestT, d: bestD };
    }

    let t1 = lut[bestPos - 1]!.t;
    let t2 = lut[bestPos + 1]!.t;
    let step = (t2 - t1) / 10;
    let bestPt = this.get(t);
    let bestD = Math.sqrt(bestSq);
    while (step > 1e-7) {
      for (let cand = t1; cand <= t2 + 1e-12; cand += step) {
        const clamped = Math.min(1, Math.max(0, cand));
        const cPt = this.get(clamped);
        const cD = Math.hypot(cPt.x - point.x, cPt.y - point.y);
        if (cD < bestD) {
          bestD = cD;
          t = clamped;
          bestPt = cPt;
        }
      }
      t1 = Math.max(0, t - step);
      t2 = Math.min(1, t + step);
      step *= 0.5;
    }
    return { x: bestPt.x, y: bestPt.y, t, d: bestD };
  }
}
