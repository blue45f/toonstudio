/**
 * Wave 131 — 2D 다각형 기하·Sutherland-Hodgman 클리핑·귀 자르기 삼각분할·
 * SAT/선분 교차 충돌 검사 프리미티브.
 */

import type { Bounds2D, PanelWindingOrder, Rect2D, Vec2 } from "./panel-breakout-types";

const EPSILON = 1e-6;

export function sanitizeFinite(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  const clamped = Math.max(min, Math.min(max, value));
  return Object.is(clamped, -0) ? 0 : clamped;
}

export function roundFixed(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function sanitizePoint(pt: Vec2 | undefined, fallbackX = 0, fallbackY = 0): Vec2 {
  const x = pt !== undefined && Number.isFinite(pt.x) ? pt.x : fallbackX;
  const y = pt !== undefined && Number.isFinite(pt.y) ? pt.y : fallbackY;
  return {
    x: Object.is(x, -0) ? 0 : Math.max(-1e6, Math.min(1e6, x)),
    y: Object.is(y, -0) ? 0 : Math.max(-1e6, Math.min(1e6, y)),
  };
}

export function rectToPolygon(rect: Rect2D): readonly Vec2[] {
  const x = sanitizeFinite(rect.x, 0, -1e6, 1e6);
  const y = sanitizeFinite(rect.y, 0, -1e6, 1e6);
  const w = sanitizeFinite(rect.width, 1, 0, 1e6);
  const h = sanitizeFinite(rect.height, 1, 0, 1e6);
  if (w <= EPSILON || h <= EPSILON) {
    return [];
  }
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

export function cleanPolygonVertices(points: readonly Vec2[]): readonly Vec2[] {
  const cleaned: Vec2[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const raw = points[i];
    if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) {
      continue;
    }
    const pt = sanitizePoint(raw);
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > EPSILON) {
      cleaned.push(pt);
    }
  }
  while (cleaned.length >= 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (first && last && Math.hypot(first.x - last.x, first.y - last.y) <= EPSILON) {
      cleaned.pop();
    } else {
      break;
    }
  }
  return cleaned;
}

/**
 * 화면 좌표계(x 우측, y 하단) 기준 부호 있는 다각형 면적.
 * 양수 = 화면 시계방향(CW), 음수 = 화면 반시계방향(CCW).
 */
export function computePolygonSignedArea(points: readonly Vec2[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (!a || !b) continue;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

export function computePolygonArea(points: readonly Vec2[]): number {
  return Math.abs(computePolygonSignedArea(points));
}

export function normalizePolygonWinding(
  points: readonly Vec2[],
  winding: PanelWindingOrder,
): readonly Vec2[] {
  const cleaned = cleanPolygonVertices(points);
  if (cleaned.length < 3) return cleaned;
  const signed = computePolygonSignedArea(cleaned);
  const wantPositive = winding === "cw";
  if ((wantPositive && signed < 0) || (!wantPositive && signed > 0)) {
    return cleaned.slice().reverse();
  }
  return cleaned;
}

export function computePolygonBounds(points: readonly Vec2[]): Bounds2D {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i];
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export function computePolygonCentroid(points: readonly Vec2[]): Vec2 {
  const n = points.length;
  if (n === 0) return { x: 0, y: 0 };
  const signedArea = computePolygonSignedArea(points);
  if (Math.abs(signedArea) <= EPSILON) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i += 1) {
      const p = points[i];
      if (!p) continue;
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (!a || !b) continue;
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  const factor = 1 / (6 * signedArea);
  return { x: cx * factor, y: cy * factor };
}

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

export function isPolygonConvex(points: readonly Vec2[]): boolean {
  const cleaned = cleanPolygonVertices(points);
  const n = cleaned.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i += 1) {
    const a = cleaned[i];
    const b = cleaned[(i + 1) % n];
    const c = cleaned[(i + 2) % n];
    if (!a || !b || !c) continue;
    const z = cross2(b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y);
    if (Math.abs(z) <= EPSILON) continue;
    if (sign === 0) {
      sign = z > 0 ? 1 : -1;
    } else if ((z > 0 && sign < 0) || (z < 0 && sign > 0)) {
      return false;
    }
  }
  return sign !== 0;
}

function pointToSegmentDistSq(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= EPSILON * EPSILON) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return ex * ex + ey * ey;
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const ex = p.x - (a.x + t * dx);
  const ey = p.y - (a.y + t * dy);
  return ex * ex + ey * ey;
}

export function isPointInsideOrOnPolygon(
  point: Vec2,
  polygon: readonly Vec2[],
  tolerancePx = 1e-3,
): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  const tolSq = tolerancePx * tolerancePx;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a && b && pointToSegmentDistSq(point, a, b) <= tolSq) {
      return true;
    }
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (!pi || !pj) continue;
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

export function clipPolygonByHalfPlane(
  subject: readonly Vec2[],
  edgeA: Vec2,
  edgeB: Vec2,
): readonly Vec2[] {
  if (subject.length === 0) return [];
  const ex = edgeB.x - edgeA.x;
  const ey = edgeB.y - edgeA.y;
  const out: Vec2[] = [];

  for (let i = 0; i < subject.length; i += 1) {
    const s = subject[(i + subject.length - 1) % subject.length];
    const e = subject[i];
    if (!s || !e) continue;
    const dS = cross2(ex, ey, s.x - edgeA.x, s.y - edgeA.y);
    const dE = cross2(ex, ey, e.x - edgeA.x, e.y - edgeA.y);
    const sIn = dS >= -EPSILON;
    const eIn = dE >= -EPSILON;

    if (eIn) {
      if (!sIn) {
        const denom = dS - dE;
        if (Math.abs(denom) > 1e-12) {
          const t = Math.max(0, Math.min(1, dS / denom));
          out.push({ x: s.x + t * (e.x - s.x), y: s.y + t * (e.y - s.y) });
        }
      }
      out.push(e);
    } else if (sIn) {
      const denom = dS - dE;
      if (Math.abs(denom) > 1e-12) {
        const t = Math.max(0, Math.min(1, dS / denom));
        out.push({ x: s.x + t * (e.x - s.x), y: s.y + t * (e.y - s.y) });
      }
    }
  }

  return cleanPolygonVertices(out);
}

export function clipPolygonSutherlandHodgman(
  subjectPolygon: readonly Vec2[],
  convexClipPolygon: readonly Vec2[],
): readonly Vec2[] {
  const subject = cleanPolygonVertices(subjectPolygon);
  const clip = normalizePolygonWinding(convexClipPolygon, "cw");
  if (subject.length < 3 || clip.length < 3) return [];

  let output: readonly Vec2[] = subject;
  for (let i = 0; i < clip.length; i += 1) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    if (!a || !b) continue;
    output = clipPolygonByHalfPlane(output, a, b);
    if (output.length < 3) {
      return [];
    }
  }
  return computePolygonArea(output) > 1e-4 ? output : [];
}

export function clipPolygonToHorizontalBand(
  subjectPolygon: readonly Vec2[],
  minX: number,
  maxX: number,
): readonly Vec2[] {
  const subject = cleanPolygonVertices(subjectPolygon);
  if (subject.length < 3 || maxX <= minX) return [];
  const afterLeft = clipPolygonByHalfPlane(subject, { x: minX, y: 1 }, { x: minX, y: 0 });
  if (afterLeft.length < 3) return [];
  const afterRight = clipPolygonByHalfPlane(afterLeft, { x: maxX, y: 0 }, { x: maxX, y: 1 });
  return computePolygonArea(afterRight) > 1e-4 ? afterRight : [];
}

function isPointStrictlyInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = cross2(b.x - a.x, b.y - a.y, p.x - a.x, p.y - a.y);
  const d2 = cross2(c.x - b.x, c.y - b.y, p.x - b.x, p.y - b.y);
  const d3 = cross2(a.x - c.x, a.y - c.y, p.x - c.x, p.y - c.y);
  return d1 >= -EPSILON && d2 >= -EPSILON && d3 >= -EPSILON;
}

export function triangulateSimplePolygon(polygon: readonly Vec2[]): readonly (readonly Vec2[])[] {
  const cw = normalizePolygonWinding(polygon, "cw");
  if (cw.length < 3) return [];
  if (cw.length === 3) return [cw];

  const remaining = cw.slice();
  const triangles: (readonly Vec2[])[] = [];
  let guard = remaining.length * remaining.length + 16;

  while (remaining.length > 3 && guard > 0) {
    guard -= 1;
    let earFound = false;
    const len = remaining.length;

    for (let i = 0; i < len; i += 1) {
      const prev = remaining[(i + len - 1) % len];
      const curr = remaining[i];
      const next = remaining[(i + 1) % len];
      if (!prev || !curr || !next) continue;

      const turn = cross2(curr.x - prev.x, curr.y - prev.y, next.x - curr.x, next.y - curr.y);
      if (turn <= EPSILON) continue;

      let containsOther = false;
      for (let j = 0; j < len; j += 1) {
        if (j === (i + len - 1) % len || j === i || j === (i + 1) % len) continue;
        const candidate = remaining[j];
        if (candidate && isPointStrictlyInTriangle(candidate, prev, curr, next)) {
          containsOther = true;
          break;
        }
      }

      if (!containsOther) {
        triangles.push([prev, curr, next]);
        remaining.splice(i, 1);
        earFound = true;
        break;
      }
    }

    if (!earFound) {
      const center = computePolygonCentroid(remaining);
      for (let i = 0; i < remaining.length; i += 1) {
        const a = remaining[i];
        const b = remaining[(i + 1) % remaining.length];
        if (a && b && computePolygonArea([center, a, b]) > 1e-4) {
          triangles.push(normalizePolygonWinding([center, a, b], "cw"));
        }
      }
      return triangles;
    }
  }

  if (remaining.length === 3 && computePolygonArea(remaining) > 1e-4) {
    triangles.push(remaining);
  }
  return triangles;
}

export function decomposePolygonToConvexPieces(
  polygon: readonly Vec2[],
): readonly (readonly Vec2[])[] {
  const cw = normalizePolygonWinding(polygon, "cw");
  if (cw.length < 3 || computePolygonArea(cw) <= 1e-4) return [];
  if (isPolygonConvex(cw)) return [cw];
  return triangulateSimplePolygon(cw);
}

export function clipSubjectByPanelPolygon(
  subjectPolygon: readonly Vec2[],
  panelFramePolygon: readonly Vec2[],
): {
  readonly primaryPolygon: readonly Vec2[];
  readonly pieces: readonly (readonly Vec2[])[];
  readonly totalClippedAreaPx2: number;
} {
  const subject = cleanPolygonVertices(subjectPolygon);
  const frame = normalizePolygonWinding(panelFramePolygon, "cw");
  if (subject.length < 3 || frame.length < 3) {
    return { primaryPolygon: [], pieces: [], totalClippedAreaPx2: 0 };
  }

  if (isPolygonConvex(frame)) {
    const clipped = clipPolygonSutherlandHodgman(subject, frame);
    if (clipped.length < 3) {
      return { primaryPolygon: [], pieces: [], totalClippedAreaPx2: 0 };
    }
    return {
      primaryPolygon: clipped,
      pieces: [clipped],
      totalClippedAreaPx2: computePolygonArea(clipped),
    };
  }

  const subjectPieces = decomposePolygonToConvexPieces(subject);
  const framePieces = decomposePolygonToConvexPieces(frame);
  const clippedPieces: (readonly Vec2[])[] = [];
  let totalArea = 0;
  let largestPiece: readonly Vec2[] = [];
  let largestArea = 0;

  for (let i = 0; i < subjectPieces.length; i += 1) {
    const sPiece = subjectPieces[i];
    if (!sPiece) continue;
    for (let j = 0; j < framePieces.length; j += 1) {
      const fPiece = framePieces[j];
      if (!fPiece) continue;
      const piece = clipPolygonSutherlandHodgman(sPiece, fPiece);
      if (piece.length >= 3) {
        const area = computePolygonArea(piece);
        if (area > 1e-4) {
          clippedPieces.push(piece);
          totalArea += area;
          if (area > largestArea) {
            largestArea = area;
            largestPiece = piece;
          }
        }
      }
    }
  }

  return {
    primaryPolygon: largestPiece,
    pieces: clippedPieces,
    totalClippedAreaPx2: totalArea,
  };
}

function projectPolygonOnAxis(poly: readonly Vec2[], ax: number, ay: number): [number, number] {
  let minP = Number.POSITIVE_INFINITY;
  let maxP = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < poly.length; i += 1) {
    const pt = poly[i];
    if (!pt) continue;
    const proj = pt.x * ax + pt.y * ay;
    if (proj < minP) minP = proj;
    if (proj > maxP) maxP = proj;
  }
  return [minP, maxP];
}

export function testConvexPolygonsSat(
  polyA: readonly Vec2[],
  polyB: readonly Vec2[],
): { readonly intersects: boolean; readonly penetrationDepthPx: number } {
  if (polyA.length < 3 || polyB.length < 3) {
    return { intersects: false, penetrationDepthPx: 0 };
  }
  let minOverlap = Number.POSITIVE_INFINITY;
  const polys: readonly (readonly Vec2[])[] = [polyA, polyB];

  for (let pIdx = 0; pIdx < polys.length; pIdx += 1) {
    const poly = polys[pIdx];
    if (!poly) continue;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (!a || !b) continue;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len = Math.hypot(ex, ey);
      if (len <= EPSILON) continue;
      const nx = -ey / len;
      const ny = ex / len;
      const [minA, maxA] = projectPolygonOnAxis(polyA, nx, ny);
      const [minB, maxB] = projectPolygonOnAxis(polyB, nx, ny);
      const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (overlap <= 1e-4) {
        return { intersects: false, penetrationDepthPx: 0 };
      }
      if (overlap < minOverlap) {
        minOverlap = overlap;
      }
    }
  }

  return {
    intersects: true,
    penetrationDepthPx: Number.isFinite(minOverlap) ? minOverlap : 0,
  };
}

export function doBoundsOverlap(a: Bounds2D, b: Bounds2D): boolean {
  return (
    a.minX < b.maxX - 1e-4 &&
    a.maxX > b.minX + 1e-4 &&
    a.minY < b.maxY - 1e-4 &&
    a.maxY > b.minY + 1e-4
  );
}

export function measurePolygonsCollision(
  polyA: readonly Vec2[],
  polyB: readonly Vec2[],
): {
  readonly intersects: boolean;
  readonly overlapAreaPx2: number;
  readonly maxPenetrationDepthPx: number;
} {
  if (polyA.length < 3 || polyB.length < 3) {
    return { intersects: false, overlapAreaPx2: 0, maxPenetrationDepthPx: 0 };
  }
  const boundsA = computePolygonBounds(polyA);
  const boundsB = computePolygonBounds(polyB);
  if (!doBoundsOverlap(boundsA, boundsB)) {
    return { intersects: false, overlapAreaPx2: 0, maxPenetrationDepthPx: 0 };
  }

  const piecesA = decomposePolygonToConvexPieces(polyA);
  const piecesB = decomposePolygonToConvexPieces(polyB);
  let overlapArea = 0;
  let maxPenetration = 0;
  let anyIntersect = false;

  for (let i = 0; i < piecesA.length; i += 1) {
    const a = piecesA[i];
    if (!a) continue;
    for (let j = 0; j < piecesB.length; j += 1) {
      const b = piecesB[j];
      if (!b) continue;
      const sat = testConvexPolygonsSat(a, b);
      if (sat.intersects) {
        const clipped = clipPolygonSutherlandHodgman(a, b);
        const area = computePolygonArea(clipped);
        if (area > 1e-3) {
          anyIntersect = true;
          overlapArea += area;
          if (sat.penetrationDepthPx > maxPenetration) {
            maxPenetration = sat.penetrationDepthPx;
          }
        }
      }
    }
  }

  return {
    intersects: anyIntersect,
    overlapAreaPx2: overlapArea,
    maxPenetrationDepthPx: maxPenetration,
  };
}

export function translatePolygon(points: readonly Vec2[], dx: number, dy: number): readonly Vec2[] {
  return points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
}

export function scalePolygonXAroundCenter(
  points: readonly Vec2[],
  centerX: number,
  scaleX: number,
): readonly Vec2[] {
  return points.map((pt) => ({
    x: centerX + (pt.x - centerX) * scaleX,
    y: pt.y,
  }));
}
