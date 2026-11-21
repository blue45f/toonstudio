/**
 * Procreate 클린룸 QuickShape 기하 자동 보정기 & ColorDrop 틈새 닫기 + 임계치 채우기 엔진.
 */

import type { Point2D, Rect2D } from "./ppt-boolean-geometry";

const EPS = 1e-6;
const MAX_RGB_DISTANCE = Math.sqrt(255 * 255 * 3);

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polylineLength(pts: readonly Point2D[]): number {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    total += dist(pts[i], pts[i + 1]);
  }
  return total;
}

export function pointsToSvgPath(points: readonly Point2D[], closed = false): string {
  if (points.length === 0) return "";
  const body = points
    .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${roundMetric(pt.x)} ${roundMetric(pt.y)}`)
    .join(" ");
  return closed ? `${body} Z` : body;
}

export type QuickShapeKind =
  | "line"
  | "arc"
  | "circle"
  | "ellipse"
  | "triangle"
  | "rectangle"
  | "polygon"
  | "freehand";

export interface QuickShapeOptions {
  readonly snapAnglesDeg?: number;
  readonly closedThresholdRatio?: number;
}

export interface QuickShapeResult {
  readonly kind: QuickShapeKind;
  readonly confidence: number;
  readonly correctedPoints: readonly Point2D[];
  readonly svgPath: string;
  readonly metrics: {
    readonly center: Point2D;
    readonly radiusX?: number;
    readonly radiusY?: number;
    readonly lengthPx?: number;
    readonly vertexCount: number;
    readonly snappedAngleDeg?: number;
  };
}

function perpDistanceToSegment(pt: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= EPS) return dist(pt, a);
  const t = clamp(((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq, 0, 1);
  return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
}

function rdpSimplify(pts: readonly Point2D[], epsilon: number): readonly Point2D[] {
  if (pts.length <= 2) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  let maxDist = -1;
  let splitIdx = 0;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const d = perpDistanceToSegment(pts[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      splitIdx = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdpSimplify(pts.slice(0, splitIdx + 1), epsilon);
    const right = rdpSimplify(pts.slice(splitIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function fitAlgebraicCircle(
  pts: readonly Point2D[],
): { readonly center: Point2D; readonly radius: number; readonly rmse: number } | null {
  if (pts.length < 4) return null;
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  const mx = sx / pts.length;
  const my = sy / pts.length;

  let suu = 0;
  let suv = 0;
  let svv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;

  for (const p of pts) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    suv += u * v;
    svv += v * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }

  const det = suu * svv - suv * suv;
  if (Math.abs(det) <= EPS) return null;
  const rhs1 = (suuu + suvv) / 2;
  const rhs2 = (svvv + svuu) / 2;
  const uc = (rhs1 * svv - rhs2 * suv) / det;
  const vc = (suu * rhs2 - suv * rhs1) / det;
  const cx = mx + uc;
  const cy = my + vc;
  const radius = Math.sqrt(uc * uc + vc * vc + (suu + svv) / pts.length);
  if (!Number.isFinite(radius) || radius <= 2) return null;

  let errSq = 0;
  for (const p of pts) {
    const dr = Math.hypot(p.x - cx, p.y - cy) - radius;
    errSq += dr * dr;
  }
  return { center: { x: roundMetric(cx), y: roundMetric(cy) }, radius: roundMetric(radius), rmse: Math.sqrt(errSq / pts.length) };
}

function fitPrincipalEllipse(pts: readonly Point2D[]) {
  const meanX = pts.reduce((acc, p) => acc + p.x, 0) / pts.length;
  const meanY = pts.reduce((acc, p) => acc + p.y, 0) / pts.length;
  let cxx = 0;
  let cxy = 0;
  let cyy = 0;
  for (const p of pts) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    cxx += dx * dx;
    cxy += dx * dy;
    cyy += dy * dy;
  }
  const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const p of pts) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const u0 = (minU + maxU) / 2;
  const v0 = (minV + maxV) / 2;
  const rx = Math.max(1, (maxU - minU) / 2);
  const ry = Math.max(1, (maxV - minV) / 2);
  const cx = meanX + u0 * cos - v0 * sin;
  const cy = meanY + u0 * sin + v0 * cos;

  let errSq = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const r = Math.hypot((dx * cos + dy * sin) / rx, (-dx * sin + dy * cos) / ry) - 1;
    errSq += r * r;
  }
  return { center: { x: roundMetric(cx), y: roundMetric(cy) }, rx: roundMetric(rx), ry: roundMetric(ry), angle, rmse: Math.sqrt(errSq / pts.length) };
}

function extractClosedCorners(pts: readonly Point2D[], diag: number): readonly Point2D[] {
  const closedLoop = dist(pts[0], pts[pts.length - 1]) > 1 ? [...pts, pts[0]] : pts;
  const start = closedLoop[0];
  let farthestIdx = 1;
  let farthestDist = -1;
  for (let i = 1; i < closedLoop.length - 1; i += 1) {
    const d = dist(start, closedLoop[i]);
    if (d > farthestDist) {
      farthestDist = d;
      farthestIdx = i;
    }
  }
  const eps = Math.max(3, diag * 0.055);
  const firstHalf = rdpSimplify(closedLoop.slice(0, farthestIdx + 1), eps);
  const secondHalf = rdpSimplify(closedLoop.slice(farthestIdx), eps);
  const merged = [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];

  const corners: Point2D[] = [];
  for (let i = 0; i < merged.length; i += 1) {
    const prev = merged[(i - 1 + merged.length) % merged.length];
    const curr = merged[i];
    const next = merged[(i + 1) % merged.length];
    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 <= 2 || l2 <= 2) continue;
    const dot = clamp((v1x * v2x + v1y * v2y) / (l1 * l2), -1, 1);
    if ((Math.acos(dot) * 180) / Math.PI >= 24) {
      corners.push({ x: roundMetric(curr.x), y: roundMetric(curr.y) });
    }
  }
  return corners;
}

function polygonFitRmse(pts: readonly Point2D[], corners: readonly Point2D[]): number {
  if (corners.length < 3) return Number.POSITIVE_INFINITY;
  let errSq = 0;
  for (const p of pts) {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < corners.length; i += 1) {
      const d = perpDistanceToSegment(p, corners[i], corners[(i + 1) % corners.length]);
      if (d < best) best = d;
    }
    errSq += best * best;
  }
  return Math.sqrt(errSq / pts.length);
}

function sampleEllipsePoints(
  center: Point2D,
  rx: number,
  ry: number,
  angle: number,
  count = 48,
): readonly Point2D[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out: Point2D[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (Math.PI * 2 * i) / count;
    const lx = Math.cos(t) * rx;
    const ly = Math.sin(t) * ry;
    out.push({
      x: roundMetric(center.x + lx * cos - ly * sin),
      y: roundMetric(center.y + lx * sin + ly * cos),
    });
  }
  return out;
}

export function recognizeQuickShape(
  points: readonly Point2D[],
  options: QuickShapeOptions = {},
): QuickShapeResult {
  const snapAnglesDeg = options.snapAnglesDeg ?? 15;
  const closedThresholdRatio = options.closedThresholdRatio ?? 0.28;

  if (points.length < 2) {
    const center = points[0] ?? { x: 0, y: 0 };
    return { kind: "freehand", confidence: 0, correctedPoints: points, svgPath: pointsToSvgPath(points), metrics: { center, vertexCount: points.length } };
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const diag = Math.max(1, Math.hypot(maxX - minX, maxY - minY));
  const center = { x: roundMetric((minX + maxX) / 2), y: roundMetric((minY + maxY) / 2) };
  const perimeter = polylineLength(points);
  const first = points[0];
  const last = points[points.length - 1];
  const chord = dist(first, last);

  if (chord > 4 && chord / Math.max(perimeter, EPS) >= 0.91) {
    let maxDev = 0;
    for (const p of points) {
      const d = perpDistanceToSegment(p, first, last);
      if (d > maxDev) maxDev = d;
    }
    if (maxDev / chord <= 0.085) {
      const rawAngleDeg = (Math.atan2(last.y - first.y, last.x - first.x) * 180) / Math.PI;
      const nearestSnap = Math.round(rawAngleDeg / snapAnglesDeg) * snapAnglesDeg;
      const shouldSnap = Math.abs(rawAngleDeg - nearestSnap) <= 7.5;
      const finalAngleRad = ((shouldSnap ? nearestSnap : rawAngleDeg) * Math.PI) / 180;
      const endPt = {
        x: roundMetric(first.x + Math.cos(finalAngleRad) * chord),
        y: roundMetric(first.y + Math.sin(finalAngleRad) * chord),
      };
      const corrected = [first, endPt];
      return {
        kind: "line",
        confidence: roundMetric(clamp(1 - maxDev / chord, 0.75, 0.99)),
        correctedPoints: corrected,
        svgPath: pointsToSvgPath(corrected, false),
        metrics: {
          center: { x: roundMetric((first.x + endPt.x) / 2), y: roundMetric((first.y + endPt.y) / 2) },
          lengthPx: roundMetric(chord),
          vertexCount: 2,
          snappedAngleDeg: roundMetric(shouldSnap ? nearestSnap : rawAngleDeg),
        },
      };
    }
  }

  const isClosed =
    chord <= Math.max(22, diag * closedThresholdRatio) ||
    (perimeter >= diag * 2.25 && chord <= diag * 0.42);

  if (!isClosed) {
    const circle = fitAlgebraicCircle(points);
    if (circle && circle.rmse / circle.radius <= 0.14 && circle.radius < diag * 6) {
      let sweep = 0;
      let prevAngle = Math.atan2(points[0].y - circle.center.y, points[0].x - circle.center.x);
      const startAngle = prevAngle;
      for (let i = 1; i < points.length; i += 1) {
        const ang = Math.atan2(points[i].y - circle.center.y, points[i].x - circle.center.x);
        let delta = ang - prevAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        sweep += delta;
        prevAngle = ang;
      }
      const absSweepDeg = (Math.abs(sweep) * 180) / Math.PI;
      if (absSweepDeg >= 30 && absSweepDeg <= 325) {
        const arcPts = Array.from({ length: 25 }, (_, i) => {
          const a = startAngle + (sweep * i) / 24;
          return { x: roundMetric(circle.center.x + Math.cos(a) * circle.radius), y: roundMetric(circle.center.y + Math.sin(a) * circle.radius) };
        });
        return {
          kind: "arc",
          confidence: roundMetric(clamp(1 - circle.rmse / circle.radius, 0.72, 0.98)),
          correctedPoints: arcPts,
          svgPath: pointsToSvgPath(arcPts, false),
          metrics: { center: circle.center, radiusX: circle.radius, radiusY: circle.radius, lengthPx: roundMetric(Math.abs(sweep) * circle.radius), vertexCount: arcPts.length },
        };
      }
    }
    return { kind: "freehand", confidence: 0.25, correctedPoints: points, svgPath: pointsToSvgPath(points, false), metrics: { center, lengthPx: roundMetric(perimeter), vertexCount: points.length } };
  }

  const corners = extractClosedCorners(points, diag);
  const polyRmse = polygonFitRmse(points, corners);
  const circleFit = fitAlgebraicCircle(points);
  const ellipse = fitPrincipalEllipse(points);
  const aspectRatio = Math.min(ellipse.rx, ellipse.ry) / Math.max(ellipse.rx, ellipse.ry);

  if (corners.length === 3 && polyRmse / diag <= 0.065) {
    return { kind: "triangle", confidence: roundMetric(clamp(1 - (polyRmse / diag) * 4, 0.78, 0.99)), correctedPoints: corners, svgPath: pointsToSvgPath(corners, true), metrics: { center, vertexCount: 3 } };
  }

  if (corners.length === 4 && polyRmse / diag <= 0.065) {
    const rightAngleCount = corners.filter((curr, i) => {
      const prev = corners[(i + 3) % 4];
      const next = corners[(i + 1) % 4];
      const v1x = prev.x - curr.x;
      const v1y = prev.y - curr.y;
      const v2x = next.x - curr.x;
      const v2y = next.y - curr.y;
      const dot = clamp((v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) + EPS), -1, 1);
      return Math.abs((Math.acos(dot) * 180) / Math.PI - 90) <= 26;
    }).length;
    if (rightAngleCount >= 3) {
      const rectPts: readonly Point2D[] = [
        { x: roundMetric(minX), y: roundMetric(minY) },
        { x: roundMetric(maxX), y: roundMetric(minY) },
        { x: roundMetric(maxX), y: roundMetric(maxY) },
        { x: roundMetric(minX), y: roundMetric(maxY) },
      ];
      return { kind: "rectangle", confidence: roundMetric(clamp(1 - (polyRmse / diag) * 4, 0.8, 0.99)), correctedPoints: rectPts, svgPath: pointsToSvgPath(rectPts, true), metrics: { center, vertexCount: 4 } };
    }
  }

  if (corners.length >= 5 && corners.length <= 8 && polyRmse / diag <= 0.032 && (!circleFit || polyRmse < circleFit.rmse * 0.65)) {
    return { kind: "polygon", confidence: roundMetric(clamp(1 - (polyRmse / diag) * 5, 0.76, 0.98)), correctedPoints: corners, svgPath: pointsToSvgPath(corners, true), metrics: { center, vertexCount: corners.length } };
  }

  if (aspectRatio >= 0.86 && circleFit && circleFit.rmse / circleFit.radius <= 0.13) {
    const circlePts = sampleEllipsePoints(circleFit.center, circleFit.radius, circleFit.radius, 0, 48);
    return {
      kind: "circle",
      confidence: roundMetric(clamp(1 - (circleFit.rmse / circleFit.radius) * 3, 0.78, 0.99)),
      correctedPoints: circlePts,
      svgPath: pointsToSvgPath(circlePts, true),
      metrics: { center: circleFit.center, radiusX: circleFit.radius, radiusY: circleFit.radius, vertexCount: circlePts.length },
    };
  }

  if (ellipse.rmse <= 0.13) {
    const ellipsePts = sampleEllipsePoints(ellipse.center, ellipse.rx, ellipse.ry, ellipse.angle, 48);
    return {
      kind: "ellipse",
      confidence: roundMetric(clamp(1 - ellipse.rmse * 3, 0.75, 0.98)),
      correctedPoints: ellipsePts,
      svgPath: pointsToSvgPath(ellipsePts, true),
      metrics: { center: ellipse.center, radiusX: ellipse.rx, radiusY: ellipse.ry, vertexCount: ellipsePts.length },
    };
  }

  if (corners.length >= 5 && corners.length <= 8 && polyRmse / diag <= 0.065) {
    return { kind: "polygon", confidence: roundMetric(clamp(1 - (polyRmse / diag) * 4, 0.7, 0.95)), correctedPoints: corners, svgPath: pointsToSvgPath(corners, true), metrics: { center, vertexCount: corners.length } };
  }

  return { kind: "freehand", confidence: 0.3, correctedPoints: points, svgPath: pointsToSvgPath(points, true), metrics: { center, lengthPx: roundMetric(perimeter), vertexCount: points.length } };
}

// ============================================================================
// Procreate ColorDrop 틈새 닫기(0~16px) + 실시간 임계치(0~100%) 채우기
// ============================================================================

export interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface RasterGrid {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

export interface ColorDropOptions {
  readonly seedX: number;
  readonly seedY: number;
  readonly fillColor: RgbaColor;
  readonly thresholdPercent: number;
  readonly gapClosePx: number;
}

export interface ColorDropResult {
  readonly filledPixels: Uint8ClampedArray;
  readonly filledPixelCount: number;
  readonly sealedGapPixels: number;
  readonly leakedToBorder: boolean;
  readonly fillCoverageRatio: number;
  readonly bounds: Rect2D;
}

export function createLineArtTestGrid(width = 48, height = 48, gapWidthPx = 4): RasterGrid {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = 248;
    pixels[i * 4 + 1] = 248;
    pixels[i * 4 + 2] = 250;
    pixels[i * 4 + 3] = 255;
  }

  const setPx = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 4;
    pixels[idx] = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = 255;
  };

  const left = 10;
  const right = width - 11;
  const top = 10;
  const bottom = height - 11;
  const gapStart = Math.floor((top + bottom) / 2) - Math.floor(gapWidthPx / 2);
  const gapEnd = gapStart + Math.max(0, gapWidthPx);

  for (let x = left; x <= right; x += 1) {
    setPx(x, top, 24, 24, 30);
    setPx(x, bottom, 24, 24, 30);
    if (x > left && x < right) {
      setPx(x, top + 1, 175, 175, 182);
      setPx(x, bottom - 1, 175, 175, 182);
    }
  }
  for (let y = top; y <= bottom; y += 1) {
    setPx(left, y, 24, 24, 30);
    if (y > top && y < bottom) setPx(left + 1, y, 175, 175, 182);
    if (y < gapStart || y >= gapEnd) {
      setPx(right, y, 24, 24, 30);
      if (y > top && y < bottom) setPx(right - 1, y, 175, 175, 182);
    }
  }
  return { width, height, pixels };
}

function dilateBinarySquare(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask);
  const horiz = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    let count = 0;
    for (let x = 0; x <= Math.min(width - 1, radius); x += 1) count += mask[rowOffset + x];
    for (let x = 0; x < width; x += 1) {
      horiz[rowOffset + x] = count > 0 ? 1 : 0;
      if (x - radius >= 0) count -= mask[rowOffset + x - radius];
      if (x + radius + 1 < width) count += mask[rowOffset + x + radius + 1];
    }
  }
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = 0; y <= Math.min(height - 1, radius); y += 1) count += horiz[y * width + x];
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = count > 0 ? 1 : 0;
      if (y - radius >= 0) count -= horiz[(y - radius) * width + x];
      if (y + radius + 1 < height) count += horiz[(y + radius + 1) * width + x];
    }
  }
  return out;
}

function erodeBinarySquare(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask);
  const horiz = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      let allOn = 1;
      for (let kx = Math.max(0, x - radius); kx <= Math.min(width - 1, x + radius); kx += 1) {
        if (mask[rowOffset + kx] === 0) {
          allOn = 0;
          break;
        }
      }
      horiz[rowOffset + x] = allOn;
    }
  }
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let allOn = 1;
      for (let ky = Math.max(0, y - radius); ky <= Math.min(height - 1, y + radius); ky += 1) {
        if (horiz[ky * width + x] === 0) {
          allOn = 0;
          break;
        }
      }
      out[y * width + x] = allOn;
    }
  }
  return out;
}

export function simulateColorDropFill(grid: RasterGrid, options: ColorDropOptions): ColorDropResult {
  const { width, height, pixels } = grid;
  const seedX = clamp(Math.floor(options.seedX), 0, width - 1);
  const seedY = clamp(Math.floor(options.seedY), 0, height - 1);
  const maxColorDist = (clamp(options.thresholdPercent, 0, 100) / 100) * MAX_RGB_DISTANCE;
  const gapClosePx = clamp(Math.round(options.gapClosePx), 0, 16);

  const seedIdx = seedY * width + seedX;
  const sr = pixels[seedIdx * 4];
  const sg = pixels[seedIdx * 4 + 1];
  const sb = pixels[seedIdx * 4 + 2];

  const rawBarrier = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const dr = pixels[i * 4] - sr;
    const dg = pixels[i * 4 + 1] - sg;
    const db = pixels[i * 4 + 2] - sb;
    rawBarrier[i] = Math.sqrt(dr * dr + dg * dg + db * db) > maxColorDist ? 1 : 0;
  }

  let barrier = rawBarrier;
  let sealedGapPixels = 0;
  if (gapClosePx > 0) {
    const radius = Math.ceil(gapClosePx / 2);
    const eroded = erodeBinarySquare(dilateBinarySquare(rawBarrier, width, height, radius), width, height, radius);
    barrier = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i += 1) {
      const closed = rawBarrier[i] === 1 || eroded[i] === 1 ? 1 : 0;
      barrier[i] = closed;
      if (closed === 1 && rawBarrier[i] === 0) sealedGapPixels += 1;
    }
    if (rawBarrier[seedIdx] === 0) barrier[seedIdx] = 0;
  }

  const outPixels = new Uint8ClampedArray(pixels);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  let filledPixelCount = 0;
  let leakedToBorder = false;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  if (barrier[seedIdx] === 0) {
    visited[seedIdx] = 1;
    queue[tail++] = seedIdx;
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;

    outPixels[idx * 4] = options.fillColor.r;
    outPixels[idx * 4 + 1] = options.fillColor.g;
    outPixels[idx * 4 + 2] = options.fillColor.b;
    outPixels[idx * 4 + 3] = options.fillColor.a;
    filledPixelCount += 1;

    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) leakedToBorder = true;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x < width - 1 ? idx + 1 : -1,
      y > 0 ? idx - width : -1,
      y < height - 1 ? idx + width : -1,
    ];
    for (const next of neighbors) {
      if (next >= 0 && visited[next] === 0 && barrier[next] === 0) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
  }

  return {
    filledPixels: outPixels,
    filledPixelCount,
    sealedGapPixels,
    leakedToBorder,
    fillCoverageRatio: roundMetric(filledPixelCount / (width * height)),
    bounds:
      filledPixelCount > 0
        ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
        : { x: 0, y: 0, width: 0, height: 0 },
  };
}
