/**
 * 경쟁 제품 특수 드로잉 6대 클린룸 엔진 통합 진입점.
 *
 * 1~2. QuickShape 기하 자동 보정 · ColorDrop 틈새 닫기 + 임계치 채우기 (competitor-quickshape-colordrop)
 * 3. Clip Studio Vector Eraser (교차점까지 정확 절단)
 * 4. Krita Wrap-Around 심리스 9-타일 토러스 드로잉
 * 5. Illustrator/Figma Repeat Grid (등간격 반복 그리드)
 * 6. 만화경 다축 대칭(2/4/6/8/12축) · 방사형 집중선 · 1/2/3점 투시 자석 자
 */

import { pointsToSvgPath } from "./competitor-quickshape-colordrop";
import type { Point2D, Rect2D } from "./ppt-boolean-geometry";

export {
  createLineArtTestGrid,
  pointsToSvgPath,
  recognizeQuickShape,
  simulateColorDropFill,
  type ColorDropOptions,
  type ColorDropResult,
  type QuickShapeKind,
  type QuickShapeOptions,
  type QuickShapeResult,
  type RasterGrid,
  type RgbaColor,
} from "./competitor-quickshape-colordrop";

const EPS = 1e-6;

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// ============================================================================
// 3. Clip Studio Vector Eraser (교차점까지 지우기)
// ============================================================================

export interface VectorStroke {
  readonly id: string;
  readonly points: readonly Point2D[];
  readonly widthPx: number;
}

export interface VectorEraseResult {
  readonly strokes: readonly VectorStroke[];
  readonly erasedStrokeId: string | null;
  readonly cutPoints: readonly Point2D[];
  readonly removedLengthPx: number;
  readonly erasedSegmentCount: number;
}

function segmentIntersection(
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D,
): { readonly t: number; readonly u: number; readonly point: Point2D } | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) <= EPS) return null;
  const qp = { x: c.x - a.x, y: c.y - a.y };
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  const u = (qp.x * r.y - qp.y * r.x) / denom;
  if (t >= -1e-5 && t <= 1 + 1e-5 && u >= -1e-5 && u <= 1 + 1e-5) {
    const tc = clamp(t, 0, 1);
    return {
      t: tc,
      u: clamp(u, 0, 1),
      point: { x: roundMetric(a.x + r.x * tc), y: roundMetric(a.y + r.y * tc) },
    };
  }
  return null;
}

function cumulativeArcLengths(points: readonly Point2D[]): readonly number[] {
  const out: number[] = [0];
  let acc = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    acc += dist(points[i], points[i + 1]);
    out.push(acc);
  }
  return out;
}

function slicePolylineByArcLength(
  points: readonly Point2D[],
  arcLengths: readonly number[],
  sStart: number,
  sEnd: number,
): readonly Point2D[] {
  const totalLen = arcLengths[arcLengths.length - 1] ?? 0;
  const start = clamp(sStart, 0, totalLen);
  const end = clamp(sEnd, 0, totalLen);
  if (end - start <= 1e-3) return [];

  const sampleAt = (s: number): Point2D => {
    for (let i = 0; i < arcLengths.length - 1; i += 1) {
      const a = arcLengths[i];
      const b = arcLengths[i + 1];
      if (s >= a - 1e-6 && s <= b + 1e-6) {
        const ratio = clamp((s - a) / Math.max(EPS, b - a), 0, 1);
        return {
          x: roundMetric(points[i].x + (points[i + 1].x - points[i].x) * ratio),
          y: roundMetric(points[i].y + (points[i + 1].y - points[i].y) * ratio),
        };
      }
    }
    return points[points.length - 1];
  };

  const out: Point2D[] = [sampleAt(start)];
  for (let i = 1; i < points.length - 1; i += 1) {
    if (arcLengths[i] > start + 1e-4 && arcLengths[i] < end - 1e-4) {
      out.push(points[i]);
    }
  }
  out.push(sampleAt(end));
  return out;
}

export function eraseVectorUpToIntersection(
  strokes: readonly VectorStroke[],
  eraserPoint: Point2D,
  eraserRadiusPx = 12,
): VectorEraseResult {
  let hitStroke: VectorStroke | null = null;
  let hitArcLength = 0;
  let bestDist = eraserRadiusPx;

  for (const stroke of strokes) {
    const arcs = cumulativeArcLengths(stroke.points);
    for (let i = 0; i < stroke.points.length - 1; i += 1) {
      const a = stroke.points[i];
      const b = stroke.points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq <= EPS ? 0 : clamp(((eraserPoint.x - a.x) * dx + (eraserPoint.y - a.y) * dy) / lenSq, 0, 1);
      const d = dist(eraserPoint, { x: a.x + dx * t, y: a.y + dy * t });
      if (d <= bestDist) {
        bestDist = d;
        hitStroke = stroke;
        hitArcLength = arcs[i] + dist(a, b) * t;
      }
    }
  }

  if (!hitStroke) {
    return { strokes, erasedStrokeId: null, cutPoints: [], removedLengthPx: 0, erasedSegmentCount: 0 };
  }

  const target = hitStroke;
  const targetArcs = cumulativeArcLengths(target.points);
  const totalLen = targetArcs[targetArcs.length - 1] ?? 0;
  const intersections: { readonly s: number; readonly pt: Point2D }[] = [];

  for (let i = 0; i < target.points.length - 1; i += 1) {
    const a = target.points[i];
    const b = target.points[i + 1];
    const segLen = dist(a, b);
    for (const other of strokes) {
      for (let j = 0; j < other.points.length - 1; j += 1) {
        if (other.id === target.id && Math.abs(i - j) <= 1) continue;
        const hit = segmentIntersection(a, b, other.points[j], other.points[j + 1]);
        if (hit) {
          const s = targetArcs[i] + segLen * hit.t;
          if (s > 1e-3 && s < totalLen - 1e-3) intersections.push({ s, pt: hit.point });
        }
      }
    }
  }

  intersections.sort((a, b) => a.s - b.s);
  let sLeft = 0;
  let leftCut: Point2D | null = null;
  let sRight = totalLen;
  let rightCut: Point2D | null = null;

  for (const item of intersections) {
    if (item.s <= hitArcLength) {
      sLeft = item.s;
      leftCut = item.pt;
    } else if (item.s > hitArcLength) {
      sRight = item.s;
      rightCut = item.pt;
      break;
    }
  }

  const cutPoints: Point2D[] = [];
  if (leftCut) cutPoints.push(leftCut);
  if (rightCut) cutPoints.push(rightCut);

  const survivingParts: VectorStroke[] = [];
  if (sLeft > 1e-2) {
    const leftPts = slicePolylineByArcLength(target.points, targetArcs, 0, sLeft);
    if (leftPts.length >= 2) {
      survivingParts.push({ ...target, id: sRight < totalLen - 1e-2 ? `${target.id}-a` : target.id, points: leftPts });
    }
  }
  if (sRight < totalLen - 1e-2) {
    const rightPts = slicePolylineByArcLength(target.points, targetArcs, sRight, totalLen);
    if (rightPts.length >= 2) {
      survivingParts.push({ ...target, id: sLeft > 1e-2 ? `${target.id}-b` : target.id, points: rightPts });
    }
  }

  const nextStrokes: VectorStroke[] = [];
  for (const stroke of strokes) {
    if (stroke.id === target.id) nextStrokes.push(...survivingParts);
    else nextStrokes.push(stroke);
  }

  return {
    strokes: nextStrokes,
    erasedStrokeId: target.id,
    cutPoints,
    removedLengthPx: roundMetric(Math.max(0, sRight - sLeft)),
    erasedSegmentCount: 1,
  };
}

// ============================================================================
// 4. Krita Wrap-Around 심리스 9-타일 토러스 드로잉
// ============================================================================

export interface TorusTileInstance {
  readonly offsetX: -1 | 0 | 1;
  readonly offsetY: -1 | 0 | 1;
  readonly segments: readonly (readonly Point2D[])[];
  readonly svgPath: string;
}

export interface WrapAroundResult {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly primarySegments: readonly (readonly Point2D[])[];
  readonly tiles: readonly TorusTileInstance[];
  readonly wrappedCrossingCount: number;
  readonly isSeamless: boolean;
}

export function wrapStrokeAcrossTorus(
  strokePoints: readonly Point2D[],
  tileWidth: number,
  tileHeight: number,
): WrapAroundResult {
  const w = Math.max(8, tileWidth);
  const h = Math.max(8, tileHeight);
  if (strokePoints.length < 2) {
    return { tileWidth: w, tileHeight: h, primarySegments: [], tiles: [], wrappedCrossingCount: 0, isSeamless: true };
  }

  const primarySegments: Point2D[][] = [];
  let wrappedCrossingCount = 0;

  for (let i = 0; i < strokePoints.length - 1; i += 1) {
    const a = strokePoints[i];
    const b = strokePoints[i + 1];
    const ts: number[] = [0, 1];

    if (Math.abs(b.x - a.x) > EPS) {
      for (let k = Math.ceil(Math.min(a.x, b.x) / w); k <= Math.floor(Math.max(a.x, b.x) / w); k += 1) {
        const t = (k * w - a.x) / (b.x - a.x);
        if (t > 1e-5 && t < 1 - 1e-5) ts.push(t);
      }
    }
    if (Math.abs(b.y - a.y) > EPS) {
      for (let m = Math.ceil(Math.min(a.y, b.y) / h); m <= Math.floor(Math.max(a.y, b.y) / h); m += 1) {
        const t = (m * h - a.y) / (b.y - a.y);
        if (t > 1e-5 && t < 1 - 1e-5) ts.push(t);
      }
    }

    ts.sort((u, v) => u - v);
    const dedupedTs: number[] = [];
    for (const t of ts) {
      if (dedupedTs.length === 0 || t - dedupedTs[dedupedTs.length - 1] > 1e-5) dedupedTs.push(t);
    }
    if (dedupedTs.length > 2) wrappedCrossingCount += dedupedTs.length - 2;

    for (let k = 0; k < dedupedTs.length - 1; k += 1) {
      const t0 = dedupedTs[k];
      const t1 = dedupedTs[k + 1];
      const midT = (t0 + t1) / 2;
      const cellX = Math.floor((a.x + (b.x - a.x) * midT) / w);
      const cellY = Math.floor((a.y + (b.y - a.y) * midT) / h);
      const p0 = { x: roundMetric(a.x + (b.x - a.x) * t0 - cellX * w), y: roundMetric(a.y + (b.y - a.y) * t0 - cellY * h) };
      const p1 = { x: roundMetric(a.x + (b.x - a.x) * t1 - cellX * w), y: roundMetric(a.y + (b.y - a.y) * t1 - cellY * h) };
      const lastSeg = primarySegments[primarySegments.length - 1];
      if (lastSeg && dist(lastSeg[lastSeg.length - 1], p0) <= 0.5) lastSeg.push(p1);
      else primarySegments.push([p0, p1]);
    }
  }

  const offsets: readonly (-1 | 0 | 1)[] = [-1, 0, 1];
  const tiles: TorusTileInstance[] = [];
  for (const offsetY of offsets) {
    for (const offsetX of offsets) {
      const shiftedSegments = primarySegments.map((seg) =>
        seg.map((pt) => ({ x: roundMetric(pt.x + offsetX * w), y: roundMetric(pt.y + offsetY * h) })),
      );
      tiles.push({
        offsetX,
        offsetY,
        segments: shiftedSegments,
        svgPath: shiftedSegments.map((seg) => pointsToSvgPath(seg, false)).join(" "),
      });
    }
  }

  const outOfBounds = primarySegments.some((seg) =>
    seg.some((pt) => pt.x < -0.05 || pt.x > w + 0.05 || pt.y < -0.05 || pt.y > h + 0.05),
  );
  return { tileWidth: w, tileHeight: h, primarySegments, tiles, wrappedCrossingCount, isSeamless: !outOfBounds && tiles.length === 9 };
}

// ============================================================================
// 5. Illustrator/Figma Repeat Grid (1클릭 등간격 반복 그리드)
// ============================================================================

export interface RepeatGridConfig {
  readonly baseId: string;
  readonly baseLabel: string;
  readonly originX: number;
  readonly originY: number;
  readonly itemWidth: number;
  readonly itemHeight: number;
  readonly rows: number;
  readonly cols: number;
  readonly gapX: number;
  readonly gapY: number;
  readonly staggerOffsetX?: number;
}

export interface RepeatGridCell {
  readonly id: string;
  readonly row: number;
  readonly col: number;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RepeatGridResult {
  readonly cells: readonly RepeatGridCell[];
  readonly totalCount: number;
  readonly totalBounds: Rect2D;
}

export function generateRepeatGrid(config: RepeatGridConfig): RepeatGridResult {
  const rows = clamp(Math.floor(config.rows), 1, 24);
  const cols = clamp(Math.floor(config.cols), 1, 24);
  const stagger = config.staggerOffsetX ?? 0;
  const cells: RepeatGridCell[] = [];

  for (let row = 0; row < rows; row += 1) {
    const rowShift = row % 2 === 1 ? stagger : 0;
    for (let col = 0; col < cols; col += 1) {
      cells.push({
        id: `${config.baseId}-r${row + 1}-c${col + 1}`,
        row,
        col,
        index: row * cols + col,
        x: roundMetric(config.originX + rowShift + col * (config.itemWidth + config.gapX)),
        y: roundMetric(config.originY + row * (config.itemHeight + config.gapY)),
        width: config.itemWidth,
        height: config.itemHeight,
      });
    }
  }

  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  const maxX = Math.max(...cells.map((c) => c.x + c.width));
  const maxY = Math.max(...cells.map((c) => c.y + c.height));
  return {
    cells,
    totalCount: cells.length,
    totalBounds: { x: roundMetric(minX), y: roundMetric(minY), width: roundMetric(maxX - minX), height: roundMetric(maxY - minY) },
  };
}

// ============================================================================
// 6. 만화경 · 다축 대칭 · 방사형 집중선 · 1/2/3점 투시 자석 자
// ============================================================================

export type SymmetryAxisCount = 2 | 4 | 6 | 8 | 12;
export type SymmetryMode = "kaleidoscope" | "rotational" | "mirror";

export interface SymmetryStrokeBranch {
  readonly index: number;
  readonly angleDeg: number;
  readonly reflected: boolean;
  readonly points: readonly Point2D[];
  readonly svgPath: string;
}

export function generateSymmetryStrokes(
  stroke: readonly Point2D[],
  options: { readonly center: Point2D; readonly axes: SymmetryAxisCount; readonly mode: SymmetryMode },
): readonly SymmetryStrokeBranch[] {
  const { center, axes, mode } = options;
  const branchCount = mode === "mirror" ? 2 : axes;
  const stepRad = (Math.PI * 2) / branchCount;
  const branches: SymmetryStrokeBranch[] = [];

  for (let i = 0; i < branchCount; i += 1) {
    const reflected = mode === "mirror" ? i === 1 : mode === "kaleidoscope" && i % 2 === 1;
    const theta = mode === "mirror" ? 0 : i * stepRad;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    const pts = stroke.map((pt) => {
      const dx = pt.x - center.x;
      const dy = pt.y - center.y;
      const rx = reflected ? -dx : dx;
      return { x: roundMetric(center.x + rx * cos - dy * sin), y: roundMetric(center.y + rx * sin + dy * cos) };
    });

    branches.push({ index: i, angleDeg: roundMetric((theta * 180) / Math.PI), reflected, points: pts, svgPath: pointsToSvgPath(pts, false) });
  }
  return branches;
}

export interface RadialSpeedline {
  readonly id: string;
  readonly angleDeg: number;
  readonly innerPoint: Point2D;
  readonly outerPoint: Point2D;
  readonly strokeWidthPx: number;
}

export function generateRadialSpeedlines(config: {
  readonly center: Point2D;
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly lineCount: number;
  readonly seed?: number;
}): readonly RadialSpeedline[] {
  const count = clamp(Math.floor(config.lineCount), 8, 96);
  const seed = config.seed ?? 42;
  return Array.from({ length: count }, (_, i) => {
    const hash = Math.abs(Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453) % 1;
    const angle = (Math.PI * 2 * i) / count + (hash - 0.5) * ((Math.PI * 2) / count) * 0.35;
    const rInner = config.innerRadius * (0.88 + hash * 0.28);
    return {
      id: `speedline-${i + 1}`,
      angleDeg: roundMetric((angle * 180) / Math.PI),
      innerPoint: { x: roundMetric(config.center.x + Math.cos(angle) * rInner), y: roundMetric(config.center.y + Math.sin(angle) * rInner) },
      outerPoint: { x: roundMetric(config.center.x + Math.cos(angle) * config.outerRadius), y: roundMetric(config.center.y + Math.sin(angle) * config.outerRadius) },
      strokeWidthPx: roundMetric(1 + hash * 2.2),
    };
  });
}

export type PerspectiveMode = "1-point" | "2-point" | "3-point";

export interface PerspectiveRulerConfig {
  readonly mode: PerspectiveMode;
  readonly horizonY: number;
  readonly vanishingPoints: readonly Point2D[];
}

export interface PerspectiveSnapResult {
  readonly start: Point2D;
  readonly snappedEnd: Point2D;
  readonly activeVanishingPointIndex: number | null;
  readonly activeAxisLabel: string;
  readonly angularErrorDeg: number;
  readonly guideRayStart: Point2D;
  readonly guideRayEnd: Point2D;
}

export function snapStrokeToPerspectiveRuler(
  start: Point2D,
  current: Point2D,
  config: PerspectiveRulerConfig,
): PerspectiveSnapResult {
  const drag = { x: current.x - start.x, y: current.y - start.y };
  const dragLen = Math.hypot(drag.x, drag.y);
  if (dragLen <= EPS) {
    return { start, snappedEnd: start, activeVanishingPointIndex: null, activeAxisLabel: "대기", angularErrorDeg: 0, guideRayStart: start, guideRayEnd: start };
  }

  interface CandidateAxis {
    readonly ux: number;
    readonly uy: number;
    readonly vpIndex: number | null;
    readonly label: string;
    readonly anchor: Point2D;
  }

  const axes: CandidateAxis[] = [];
  const activeCount = config.mode === "1-point" ? 1 : config.mode === "2-point" ? 2 : 3;
  for (let i = 0; i < Math.min(activeCount, config.vanishingPoints.length); i += 1) {
    const vp = config.vanishingPoints[i];
    const dx = vp.x - start.x;
    const dy = vp.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len > EPS) axes.push({ ux: dx / len, uy: dy / len, vpIndex: i, label: `소실점 ${i + 1}`, anchor: vp });
  }

  if (config.mode === "1-point") {
    axes.push({ ux: 1, uy: 0, vpIndex: null, label: "수평선", anchor: { x: start.x + 240, y: start.y } });
    axes.push({ ux: 0, uy: 1, vpIndex: null, label: "수직선", anchor: { x: start.x, y: start.y + 240 } });
  } else if (config.mode === "2-point") {
    axes.push({ ux: 0, uy: 1, vpIndex: null, label: "수직선", anchor: { x: start.x, y: start.y + 240 } });
  }

  let bestAxis = axes[0];
  let bestAngleError = Number.POSITIVE_INFINITY;
  let bestSignedProj = 0;

  for (const axis of axes) {
    const dot = drag.x * axis.ux + drag.y * axis.uy;
    const angleErr = (Math.acos(clamp(Math.abs(dot) / dragLen, 0, 1)) * 180) / Math.PI;
    if (angleErr < bestAngleError) {
      bestAngleError = angleErr;
      bestAxis = axis;
      bestSignedProj = dot;
    }
  }

  return {
    start,
    snappedEnd: { x: roundMetric(start.x + bestAxis.ux * bestSignedProj), y: roundMetric(start.y + bestAxis.uy * bestSignedProj) },
    activeVanishingPointIndex: bestAxis.vpIndex,
    activeAxisLabel: bestAxis.label,
    angularErrorDeg: roundMetric(bestAngleError),
    guideRayStart: bestAxis.vpIndex !== null ? bestAxis.anchor : { x: roundMetric(start.x - bestAxis.ux * 220), y: roundMetric(start.y - bestAxis.uy * 220) },
    guideRayEnd: { x: roundMetric(start.x + bestAxis.ux * 260), y: roundMetric(start.y + bestAxis.uy * 260) },
  };
}
