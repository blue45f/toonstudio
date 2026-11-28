/**
 * Wave 104 — 말풍선 배치 및 곡선 꼬리 라우팅용 2D 기하 프리미티브 유틸리티.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || min > max) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

export function rectCenter(r: Rect2D): Point2D {
  return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.5 };
}

export function expandRect(r: Rect2D, pad: number): Rect2D {
  return {
    x: r.x - pad,
    y: r.y - pad,
    width: Math.max(0, r.width + pad * 2),
    height: Math.max(0, r.height + pad * 2),
  };
}

export function pointDistance(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointInRect(p: Point2D, r: Rect2D, eps = 1e-6): boolean {
  return (
    p.x >= r.x - eps &&
    p.x <= r.x + r.width + eps &&
    p.y >= r.y - eps &&
    p.y <= r.y + r.height + eps
  );
}

export function rectsOverlap(a: Rect2D, b: Rect2D, eps = 1e-6): boolean {
  return (
    a.x < b.x + b.width - eps &&
    a.x + a.width > b.x + eps &&
    a.y < b.y + b.height - eps &&
    a.y + a.height > b.y + eps
  );
}

export function rectIntersectionArea(a: Rect2D, b: Rect2D): number {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

export function rectContainedInBounds(rect: Rect2D, bounds: Rect2D, eps = 0.5): boolean {
  return (
    rect.x >= bounds.x - eps &&
    rect.y >= bounds.y - eps &&
    rect.x + rect.width <= bounds.x + bounds.width + eps &&
    rect.y + rect.height <= bounds.y + bounds.height + eps
  );
}

export function segmentIntersectsRect(p0: Point2D, p1: Point2D, rect: Rect2D): boolean {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  let tMin = 0;
  let tMax = 1;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) {
      return q >= 0;
    }
    const ratio = q / p;
    if (p < 0) {
      if (ratio > tMax) return false;
      if (ratio > tMin) tMin = ratio;
    } else {
      if (ratio < tMin) return false;
      if (ratio < tMax) tMax = ratio;
    }
    return true;
  };

  return (
    clip(-dx, p0.x - rect.x) &&
    clip(dx, rect.x + rect.width - p0.x) &&
    clip(-dy, p0.y - rect.y) &&
    clip(dy, rect.y + rect.height - p0.y) &&
    tMax >= tMin
  );
}

function orientation2D(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function segmentsProperlyIntersect(
  a0: Point2D,
  a1: Point2D,
  b0: Point2D,
  b1: Point2D,
): boolean {
  if (
    Math.max(a0.x, a1.x) < Math.min(b0.x, b1.x) ||
    Math.max(b0.x, b1.x) < Math.min(a0.x, a1.x) ||
    Math.max(a0.y, a1.y) < Math.min(b0.y, b1.y) ||
    Math.max(b0.y, b1.y) < Math.min(a0.y, a1.y)
  ) {
    return false;
  }
  const o1 = orientation2D(a0, a1, b0);
  const o2 = orientation2D(a0, a1, b1);
  const o3 = orientation2D(b0, b1, a0);
  const o4 = orientation2D(b0, b1, a1);
  const eps = 1e-6;
  return (
    ((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) &&
    ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))
  );
}

export function sampleQuadraticBezier(
  p0: Point2D,
  ctrl: Point2D,
  p2: Point2D,
  steps: number,
): readonly Point2D[] {
  const samples: Point2D[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    samples.push({
      x: mt * mt * p0.x + 2 * mt * t * ctrl.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * ctrl.y + t * t * p2.y,
    });
  }
  return samples;
}

export function polylineIntersectsRect(pts: readonly Point2D[], rect: Rect2D): boolean {
  for (let i = 0; i < pts.length - 1; i += 1) {
    if (segmentIntersectsRect(pts[i], pts[i + 1], rect)) {
      return true;
    }
  }
  return false;
}

export function polylinesCross(a: readonly Point2D[], b: readonly Point2D[]): boolean {
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      if (segmentsProperlyIntersect(a[i], a[i + 1], b[j], b[j + 1])) {
        return true;
      }
    }
  }
  return false;
}

export function ellipsePointAtAngle(rect: Rect2D, theta: number, scale = 1): Point2D {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  return {
    x: cx + Math.cos(theta) * (rect.width * 0.5 * scale),
    y: cy + Math.sin(theta) * (rect.height * 0.5 * scale),
  };
}
