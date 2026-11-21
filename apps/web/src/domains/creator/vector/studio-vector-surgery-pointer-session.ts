/**
 * Studio Vector Surgery Pointer Session — CSP `선 수정(Correct line)` 7종 + 부분 단순화
 * 캔버스 포인터 드래그 세션(반경, 끝점 고정, 라이브 미리보기, 단일 Undo 커밋 패치).
 *
 * 기존 `vector/studio-drawel-vector-correction.ts` 순수 수술 코어를 포인터 수명주기
 * (`begin → update(preview) → commit(단일 Undo 패치) / cancel`)로 감싸며, 입력 `DrawEl[]`을
 * 변이하지 않고 원격 편집 충돌 시 stale 커밋을 차단한다.
 */

import {
  adjustVectorStrokeWidth,
  connectDrawElStrokes,
  effectiveStrokePointWidthsPx,
  pinchDrawElStroke,
  redrawVectorStrokeSegment,
  redrawVectorStrokeWidth,
  splitVectorStrokeAtParameter,
  toggleVectorCornerSmooth,
  type VectorPinchFixEnds,
  type VectorWidthAdjustMode,
} from "./studio-drawel-vector-correction";

import type { DrawEl } from "../studio-element-model";
import type { NodeEditVectorSurgeryTool } from "../studio-node-edit";

export type VectorSurgeryToolId = NodeEditVectorSurgeryTool | "simplify";
export type VectorSurgeryInteractionKind = "drag-deform" | "brush-sweep" | "guide-stroke" | "point-click";

export interface VectorSurgeryToolSpec {
  readonly id: VectorSurgeryToolId;
  readonly label: string;
  readonly undoLabel: string;
  readonly interactionKind: VectorSurgeryInteractionKind;
}

export const STUDIO_VECTOR_SURGERY_TOOL_SPECS: readonly VectorSurgeryToolSpec[] = Object.freeze([
  { id: "pinch", label: "벡터선 집기", undoLabel: "벡터선 집기", interactionKind: "drag-deform" },
  { id: "adjust-width", label: "부분 선폭 수정", undoLabel: "부분 선폭 수정", interactionKind: "brush-sweep" },
  { id: "redraw-width", label: "선폭 다시 그리기", undoLabel: "선폭 다시 그리기", interactionKind: "guide-stroke" },
  { id: "connect", label: "벡터선 연결", undoLabel: "벡터선 연결", interactionKind: "brush-sweep" },
  { id: "redraw-segment", label: "구간 다시 그리기", undoLabel: "벡터선 구간 다시 그리기", interactionKind: "guide-stroke" },
  { id: "simplify", label: "부분 단순화", undoLabel: "벡터선 부분 단순화", interactionKind: "brush-sweep" },
  { id: "split", label: "제어점 분할", undoLabel: "벡터선 분할", interactionKind: "point-click" },
  { id: "corner-toggle", label: "모서리 전환", undoLabel: "모서리 곡률 전환", interactionKind: "point-click" },
]);

const UNDO_LABEL_BY_ID: Readonly<Record<VectorSurgeryToolId, string>> = Object.freeze(
  STUDIO_VECTOR_SURGERY_TOOL_SPECS.reduce<Record<string, string>>((acc, s) => {
    acc[s.id] = s.undoLabel;
    return acc;
  }, {}) as Record<VectorSurgeryToolId, string>,
);

const NEUTRAL_PRESSURE = 0.5;
const MIN_STROKE_WIDTH_PX = 0.1;

export interface VectorSurgeryPoint { readonly x: number; readonly y: number; }
export interface VectorSurgeryPointerSample extends VectorSurgeryPoint {
  readonly pressure?: number;
  readonly pointerId?: number;
}
export interface VectorSurgeryPointerCaptureTarget {
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
}

export interface VectorSurgerySessionOptions {
  readonly tool: VectorSurgeryToolId;
  readonly radiusPx?: number;
  readonly hitRadiusPx?: number;
  readonly pinchLevel?: number;
  readonly fixEnds?: VectorPinchFixEnds;
  readonly widthMode?: VectorWidthAdjustMode;
  readonly widthAmount?: number;
  readonly atLeastOnePixel?: boolean;
  readonly wholeLine?: boolean;
  readonly maxGapPx?: number;
  readonly smoothSeamSamples?: number;
  readonly maxSnapDistPx?: number;
  readonly seamSmoothPasses?: number;
  readonly featherPx?: number;
  readonly simplifyTolerancePx?: number;
  readonly deleteShorterThanPx?: number;
  readonly cornerMode?: "auto" | "smooth" | "cusp";
  readonly cornerStrength?: number;
  readonly createSplitIds?: (sourceId: string) => readonly [string, string];
  readonly captureTarget?: VectorSurgeryPointerCaptureTarget | null;
}

export interface SimplifyDrawElStrokeRegionOptions {
  readonly tolerancePx?: number;
  readonly wholeLine?: boolean;
  readonly brushTrailPoints?: readonly number[];
  readonly radiusPx?: number;
  readonly preserveEnds?: boolean;
}

export interface SimplifyDrawElStrokeRegionResult {
  readonly stroke: DrawEl;
  readonly removedVertices: number;
}

export interface VectorSurgeryPreviewOverlay {
  readonly tool: VectorSurgeryToolId;
  readonly cursor: VectorSurgeryPoint;
  readonly radiusPx: number;
  readonly targetStrokeIds: readonly string[];
  readonly trailPoints: readonly number[];
  readonly pinchVector?: { readonly from: VectorSurgeryPoint; readonly to: VectorSurgeryPoint };
  readonly splitMarker?: { readonly strokeId: string; readonly x: number; readonly y: number; readonly t: number };
  readonly cornerMarker?: { readonly strokeId: string; readonly vertexIndex: number; readonly x: number; readonly y: number };
  readonly connectSeam?: { readonly fromId: string; readonly toId: string; readonly x: number; readonly y: number };
  readonly removedVerticesCount?: number;
}

export interface VectorSurgeryPointerSession {
  readonly active: boolean;
  readonly pointerId: number;
  readonly tool: VectorSurgeryToolId;
  readonly options: VectorSurgerySessionOptions;
  readonly captureTarget: VectorSurgeryPointerCaptureTarget | null;
  readonly anchor: VectorSurgeryPoint;
  readonly targetStrokeId: string | null;
  readonly baseStrokes: readonly DrawEl[];
  readonly previewStrokes: readonly DrawEl[];
  readonly trailPoints: readonly number[];
  readonly trailPressures: readonly number[];
  readonly overlay: VectorSurgeryPreviewOverlay;
  readonly changed: boolean;
}

export interface VectorSurgeryCommitPatch {
  readonly tool: VectorSurgeryToolId;
  readonly label: string;
  readonly changed: boolean;
  readonly stale: boolean;
  readonly beforeStrokes: readonly DrawEl[];
  readonly afterStrokes: readonly DrawEl[];
  readonly nextDocumentStrokes: readonly DrawEl[];
  readonly replacedIds: readonly string[];
  readonly removedIds: readonly string[];
  readonly addedStrokes: readonly DrawEl[];
  readonly affectedStrokeIds: readonly string[];
}

const clamp = (v: number, lo: number, hi: number): number =>
  !Number.isFinite(v) ? lo : v < lo ? lo : v > hi ? hi : v;

function hermiteFalloff(u: number): number {
  const t = clamp(u, 0, 1);
  return 1 - (3 * t * t - 2 * t * t * t);
}

const pointCountOf = (points: readonly number[]): number => Math.floor(points.length / 2);

const isEditableVectorStroke = (stroke: DrawEl): boolean =>
  stroke.type === "draw"
  && (stroke.kind === undefined || stroke.kind === "freehand")
  && stroke.locked !== true
  && stroke.hidden !== true
  && pointCountOf(stroke.points) >= 2;

function strokeArcLength(points: readonly number[]): number {
  const n = pointCountOf(points);
  let total = 0;
  for (let i = 1; i < n; i += 1) {
    total += Math.hypot(points[i * 2]! - points[(i - 1) * 2]!, points[i * 2 + 1]! - points[(i - 1) * 2 + 1]!);
  }
  return total;
}

function pointToSegment(px: number, py: number, x0: number, y0: number, x1: number, y1: number) {
  const vx = x1 - x0, vy = y1 - y0, lenSq = vx * vx + vy * vy;
  const t = lenSq > 1e-12 ? clamp(((px - x0) * vx + (py - y0) * vy) / lenSq, 0, 1) : 0;
  const x = x0 + vx * t, y = y0 + vy * t;
  return { dist: Math.hypot(px - x, py - y), t, x, y };
}

function projectPointToPolyline(points: readonly number[], target: VectorSurgeryPoint) {
  const n = pointCountOf(points);
  if (n < 2) return null;
  let totalLen = 0, bestDist = Number.POSITIVE_INFINITY, bestX = points[0]!, bestY = points[1]!, bestArc = 0;
  for (let i = 0; i < n - 1; i += 1) {
    const x0 = points[i * 2]!, y0 = points[i * 2 + 1]!, x1 = points[(i + 1) * 2]!, y1 = points[(i + 1) * 2 + 1]!;
    const segLen = Math.hypot(x1 - x0, y1 - y0);
    const proj = pointToSegment(target.x, target.y, x0, y0, x1, y1);
    if (proj.dist < bestDist) { bestDist = proj.dist; bestX = proj.x; bestY = proj.y; bestArc = totalLen + segLen * proj.t; }
    totalLen += segLen;
  }
  return { dist: bestDist, x: bestX, y: bestY, arcLen: bestArc, totalLen, normalizedT: totalLen > 1e-6 ? clamp(bestArc / totalLen, 0, 1) : 0 };
}

function minDistancePointToTrail(px: number, py: number, trail: readonly number[]): number {
  const m = pointCountOf(trail);
  if (m === 0) return Number.POSITIVE_INFINITY;
  if (m === 1) return Math.hypot(px - trail[0]!, py - trail[1]!);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < m - 1; i += 1) {
    const d = pointToSegment(px, py, trail[i * 2]!, trail[i * 2 + 1]!, trail[(i + 1) * 2]!, trail[(i + 1) * 2 + 1]!).dist;
    if (d < best) best = d;
  }
  return best;
}

function minDistancePolylineToTrail(points: readonly number[], trail: readonly number[]): number {
  const n = pointCountOf(points), m = pointCountOf(trail);
  if (n === 0 || m === 0) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i += 1) {
    const d = minDistancePointToTrail(points[i * 2]!, points[i * 2 + 1]!, trail);
    if (d < best) best = d;
  }
  for (let j = 0; j < m; j += 1) {
    const proj = projectPointToPolyline(points, { x: trail[j * 2]!, y: trail[j * 2 + 1]! });
    if (proj && proj.dist < best) best = proj.dist;
  }
  return best;
}

function perpendicularDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax, aby = by - ay, len = Math.hypot(abx, aby);
  return len < 1e-12 ? Math.hypot(px - ax, py - ay) : Math.abs(abx * (ay - py) - aby * (ax - px)) / len;
}

function markDouglasPeuckerSpan(points: readonly number[], first: number, last: number, tolerance: number, keep: boolean[]): void {
  keep[first] = true;
  keep[last] = true;
  const stack: Array<readonly [number, number]> = [[first, last]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    if (hi - lo <= 1) continue;
    const ax = points[lo * 2]!, ay = points[lo * 2 + 1]!, bx = points[hi * 2]!, by = points[hi * 2 + 1]!;
    let maxDist = -1, maxIdx = -1;
    for (let i = lo + 1; i < hi; i += 1) {
      const dist = perpendicularDistance(points[i * 2]!, points[i * 2 + 1]!, ax, ay, bx, by);
      if (dist > maxDist) { maxDist = dist; maxIdx = i; }
    }
    if (maxDist > tolerance && maxIdx > lo && maxIdx < hi) {
      keep[maxIdx] = true;
      stack.push([lo, maxIdx], [maxIdx, hi]);
    }
  }
}

/** 벡터 획의 전체 또는 브러시 궤적 반경 내부 구간만 Douglas-Peucker로 단순화한다(영역 밖 정점·필압 보존). */
export function simplifyDrawElStrokeRegion(
  stroke: DrawEl,
  options: SimplifyDrawElStrokeRegionOptions = {},
): SimplifyDrawElStrokeRegionResult {
  const n = pointCountOf(stroke.points);
  const tolerance = Number.isFinite(options.tolerancePx) ? (options.tolerancePx as number) : 2.5;
  if (n <= 2 || tolerance <= 0) return { stroke, removedVertices: 0 };

  const keep = new Array<boolean>(n).fill(false);
  if (options.wholeLine === true) {
    markDouglasPeuckerSpan(stroke.points, 0, n - 1, tolerance, keep);
  } else {
    const trail = options.brushTrailPoints ?? [];
    if (pointCountOf(trail) === 0) return { stroke, removedVertices: 0 };
    const radiusPx = Math.max(1, Number.isFinite(options.radiusPx) ? (options.radiusPx as number) : 40);
    const touched = new Array<boolean>(n).fill(false);
    let anyTouched = false;
    for (let i = 0; i < n; i += 1) {
      if (minDistancePointToTrail(stroke.points[i * 2]!, stroke.points[i * 2 + 1]!, trail) <= radiusPx) {
        touched[i] = true;
        anyTouched = true;
      } else {
        keep[i] = true;
      }
    }
    if (!anyTouched) return { stroke, removedVertices: 0 };

    const spans: Array<[number, number]> = [];
    for (let i = 0; i < n; ) {
      if (!touched[i]) { i += 1; continue; }
      const runStart = i;
      while (i < n && touched[i]) i += 1;
      const lo = Math.max(0, runStart - 1), hi = Math.min(n - 1, i);
      const prev = spans.at(-1);
      if (prev && lo <= prev[1]) prev[1] = Math.max(prev[1], hi);
      else spans.push([lo, hi]);
    }
    for (const [lo, hi] of spans) {
      for (let k = lo + 1; k < hi; k += 1) keep[k] = false;
      markDouglasPeuckerSpan(stroke.points, lo, hi, tolerance, keep);
    }
  }

  if (options.preserveEnds !== false) { keep[0] = true; keep[n - 1] = true; }

  const nextPoints: number[] = [];
  const hasPressures = Array.isArray(stroke.pressures) && stroke.pressures.length > 0;
  const nextPressures: number[] = [];
  let keptCount = 0;
  for (let i = 0; i < n; i += 1) {
    if (!keep[i]) continue;
    nextPoints.push(stroke.points[i * 2]!, stroke.points[i * 2 + 1]!);
    if (hasPressures) {
      const p = stroke.pressures![i];
      nextPressures.push(typeof p === "number" && Number.isFinite(p) ? clamp(p, 0, 1) : NEUTRAL_PRESSURE);
    }
    keptCount += 1;
  }

  const removedVertices = n - keptCount;
  if (removedVertices <= 0 || keptCount < 2) return { stroke, removedVertices: 0 };
  return {
    stroke: { ...stroke, points: nextPoints, ...(hasPressures ? { pressures: nextPressures } : {}) },
    removedVertices,
  };
}

function adjustStrokeWidthAlongTrail(
  stroke: DrawEl,
  trailPoints: readonly number[],
  opts: { readonly mode: VectorWidthAdjustMode; readonly amount: number; readonly radiusPx: number; readonly atLeastOnePixel: boolean; readonly wholeLine: boolean },
): DrawEl {
  const m = pointCountOf(trailPoints);
  if (m === 0) return stroke;
  if (opts.wholeLine) {
    return minDistancePolylineToTrail(stroke.points, trailPoints) <= opts.radiusPx
      ? adjustVectorStrokeWidth(stroke, { mode: opts.mode, amount: opts.amount, atLeastOnePixel: opts.atLeastOnePixel })
      : stroke;
  }
  if (m === 1) {
    return adjustVectorStrokeWidth(stroke, {
      mode: opts.mode, amount: opts.amount, atLeastOnePixel: opts.atLeastOnePixel,
      regionCenter: { x: trailPoints[0]!, y: trailPoints[1]! }, regionRadiusPx: opts.radiusPx,
    });
  }

  const n = pointCountOf(stroke.points);
  if (n === 0) return stroke;
  const amount = Number.isFinite(opts.amount) ? opts.amount : 0;
  const floorPx = opts.atLeastOnePixel ? 1 : MIN_STROKE_WIDTH_PX;
  const radiusPx = Math.max(1, opts.radiusPx);
  const currentWidths = effectiveStrokePointWidthsPx(stroke);
  let touchedAny = false;

  const nextWidths = currentWidths.map((w, i) => {
    const d = minDistancePointToTrail(stroke.points[i * 2]!, stroke.points[i * 2 + 1]!, trailPoints);
    if (d >= radiusPx) return w;
    touchedAny = true;
    const rawTarget = opts.mode === "add" ? w + amount : opts.mode === "subtract" ? w - amount : opts.mode === "multiply" ? w * Math.max(0, amount) : amount;
    const targetW = Math.max(floorPx, rawTarget);
    return Math.max(floorPx, w + (targetW - w) * hermiteFalloff(d / radiusPx));
  });
  if (!touchedAny) return stroke;

  const maxW = Math.max(...nextWidths), minW = Math.min(...nextWidths);
  const prevBase = Math.max(floorPx, Number.isFinite(stroke.strokeWidth) ? stroke.strokeWidth : 1);
  const nextStrokeWidth = maxW - minW <= 1e-6 ? maxW : Math.max(floorPx, maxW * NEUTRAL_PRESSURE, Math.min(maxW, prevBase));
  const nextPressures = nextWidths.map((w) => clamp((w / nextStrokeWidth) * NEUTRAL_PRESSURE, 0, 1));
  return { ...stroke, strokeWidth: Number(nextStrokeWidth.toFixed(4)), pressures: nextPressures };
}

function strokesDeepEqual(a: DrawEl, b: DrawEl): boolean {
  if (a === b) return true;
  if (a.id !== b.id || a.strokeWidth !== b.strokeWidth || a.points.length !== b.points.length) return false;
  for (let i = 0; i < a.points.length; i += 1) if (a.points[i] !== b.points[i]) return false;
  const pa = a.pressures ?? [], pb = b.pressures ?? [];
  if (pa.length !== pb.length) return false;
  for (let i = 0; i < pa.length; i += 1) if (pa[i] !== pb[i]) return false;
  return true;
}

const strokeListChanged = (a: readonly DrawEl[], b: readonly DrawEl[]): boolean =>
  a.length !== b.length || a.some((stroke, i) => !strokesDeepEqual(stroke, b[i]!));

function findNearestStroke(strokes: readonly DrawEl[], point: VectorSurgeryPoint, maxDistPx: number) {
  let best: { stroke: DrawEl; dist: number; proj: NonNullable<ReturnType<typeof projectPointToPolyline>> } | null = null;
  for (const stroke of strokes) {
    if (!isEditableVectorStroke(stroke)) continue;
    const proj = projectPointToPolyline(stroke.points, point);
    if (proj && proj.dist <= maxDistPx && (!best || proj.dist < best.dist)) best = { stroke, dist: proj.dist, proj };
  }
  return best;
}

function findNearestInteriorVertex(strokes: readonly DrawEl[], point: VectorSurgeryPoint, maxDistPx: number) {
  let best: { stroke: DrawEl; vertexIndex: number; x: number; y: number; dist: number } | null = null;
  for (const stroke of strokes) {
    if (!isEditableVectorStroke(stroke)) continue;
    const n = pointCountOf(stroke.points);
    for (let i = 1; i < n - 1; i += 1) {
      const x = stroke.points[i * 2]!, y = stroke.points[i * 2 + 1]!;
      const dist = Math.hypot(point.x - x, point.y - y);
      if (dist <= maxDistPx && (!best || dist < best.dist)) best = { stroke, vertexIndex: i, x, y, dist };
    }
  }
  return best;
}

function endpointGapBetween(a: DrawEl, b: DrawEl): { readonly dist: number; readonly mid: VectorSurgeryPoint } {
  const nA = pointCountOf(a.points), nB = pointCountOf(b.points);
  const ptsA = [{ x: a.points[0]!, y: a.points[1]! }, { x: a.points[(nA - 1) * 2]!, y: a.points[(nA - 1) * 2 + 1]! }];
  const ptsB = [{ x: b.points[0]!, y: b.points[1]! }, { x: b.points[(nB - 1) * 2]!, y: b.points[(nB - 1) * 2 + 1]! }];
  let dist = Number.POSITIVE_INFINITY, mid: VectorSurgeryPoint = ptsA[1]!;
  for (const pa of ptsA) {
    for (const pb of ptsB) {
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (d < dist) { dist = d; mid = { x: (pa.x + pb.x) * 0.5, y: (pa.y + pb.y) * 0.5 }; }
    }
  }
  return { dist, mid };
}

function evaluateSessionPreview(
  baseStrokes: readonly DrawEl[],
  anchor: VectorSurgeryPoint,
  cursor: VectorSurgeryPoint,
  targetStrokeId: string | null,
  trailPoints: readonly number[],
  trailPressures: readonly number[],
  options: VectorSurgerySessionOptions,
): { readonly previewStrokes: readonly DrawEl[]; readonly overlay: VectorSurgeryPreviewOverlay; readonly targetStrokeId: string | null } {
  const radiusPx = Math.max(4, options.radiusPx ?? 40);
  const hitRadiusPx = Math.max(4, options.hitRadiusPx ?? Math.max(24, radiusPx * 0.6));
  const mkOverlay = (
    r: number,
    targetStrokeIds: readonly string[],
    extra: Partial<VectorSurgeryPreviewOverlay> = {},
  ): VectorSurgeryPreviewOverlay => ({ tool: options.tool, cursor, radiusPx: r, targetStrokeIds, trailPoints, ...extra });

  if (options.tool === "pinch") {
    const target = targetStrokeId
      ? baseStrokes.find((s) => s.id === targetStrokeId && isEditableVectorStroke(s)) ?? null
      : findNearestStroke(baseStrokes, anchor, hitRadiusPx)?.stroke ?? null;
    if (!target) return { previewStrokes: baseStrokes, targetStrokeId: null, overlay: mkOverlay(radiusPx, []) };
    const pinched = pinchDrawElStroke(target, { from: anchor, to: cursor, pinchLevel: options.pinchLevel ?? 5, radiusPx: options.radiusPx, fixEnds: options.fixEnds ?? "both" });
    return {
      previewStrokes: pinched === target ? baseStrokes : baseStrokes.map((s) => (s.id === target.id ? pinched : s)),
      targetStrokeId: target.id,
      overlay: mkOverlay(radiusPx, [target.id], { pinchVector: { from: anchor, to: cursor } }),
    };
  }

  if (options.tool === "adjust-width") {
    const affected: string[] = [];
    const previewStrokes = baseStrokes.map((stroke) => {
      if (!isEditableVectorStroke(stroke)) return stroke;
      const updated = adjustStrokeWidthAlongTrail(stroke, trailPoints, {
        mode: options.widthMode ?? "add", amount: options.widthAmount ?? 1.5, radiusPx,
        atLeastOnePixel: options.atLeastOnePixel ?? true, wholeLine: options.wholeLine === true,
      });
      if (!strokesDeepEqual(stroke, updated)) affected.push(stroke.id);
      return updated;
    });
    return { previewStrokes, targetStrokeId: affected[0] ?? null, overlay: mkOverlay(radiusPx, affected) };
  }

  if (options.tool === "redraw-segment" || options.tool === "redraw-width") {
    const maxSnapDistPx = Math.max(4, options.maxSnapDistPx ?? 48);
    const target = targetStrokeId
      ? baseStrokes.find((s) => s.id === targetStrokeId && isEditableVectorStroke(s)) ?? null
      : findNearestStroke(baseStrokes, anchor, maxSnapDistPx)?.stroke ?? null;
    if (!target || pointCountOf(trailPoints) < 2) {
      return { previewStrokes: baseStrokes, targetStrokeId: target?.id ?? null, overlay: mkOverlay(maxSnapDistPx, target ? [target.id] : []) };
    }
    const updated = options.tool === "redraw-segment"
      ? redrawVectorStrokeSegment(target, { points: trailPoints, pressures: trailPressures }, { maxSnapDistPx, seamSmoothPasses: options.seamSmoothPasses ?? 2 })
      : redrawVectorStrokeWidth(target, { points: trailPoints, pressures: trailPressures }, { maxSnapDistPx, featherPx: options.featherPx ?? 12 });
    return {
      previewStrokes: strokesDeepEqual(target, updated) ? baseStrokes : baseStrokes.map((s) => (s.id === target.id ? updated : s)),
      targetStrokeId: target.id,
      overlay: mkOverlay(maxSnapDistPx, [target.id]),
    };
  }

  if (options.tool === "connect") {
    const maxGapPx = Math.max(1, options.maxGapPx ?? 32);
    const candidates = baseStrokes.filter((s) => isEditableVectorStroke(s) && minDistancePolylineToTrail(s.points, trailPoints) <= radiusPx);
    let best: { a: DrawEl; b: DrawEl; dist: number; mid: VectorSurgeryPoint } | null = null;
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const gap = endpointGapBetween(candidates[i]!, candidates[j]!);
        if (gap.dist <= maxGapPx && (!best || gap.dist < best.dist)) best = { a: candidates[i]!, b: candidates[j]!, dist: gap.dist, mid: gap.mid };
      }
    }
    const connected = best ? connectDrawElStrokes(best.a, best.b, { maxGapPx, smoothSeamSamples: options.smoothSeamSamples ?? 2 }) : null;
    if (!best || !connected) {
      return { previewStrokes: baseStrokes, targetStrokeId: candidates[0]?.id ?? null, overlay: mkOverlay(radiusPx, candidates.map((s) => s.id)) };
    }
    const previewStrokes = baseStrokes.flatMap((s) => (s.id === best!.a.id ? [connected] : s.id === best!.b.id ? [] : [s]));
    return {
      previewStrokes,
      targetStrokeId: connected.id,
      overlay: mkOverlay(radiusPx, [best.a.id, best.b.id], { connectSeam: { fromId: best.a.id, toId: best.b.id, x: best.mid.x, y: best.mid.y } }),
    };
  }

  if (options.tool === "simplify") {
    const deleteShorterThanPx = Math.max(0, options.deleteShorterThanPx ?? 0);
    const affected: string[] = [];
    let totalRemoved = 0;
    const previewStrokes: DrawEl[] = [];
    for (const stroke of baseStrokes) {
      if (!isEditableVectorStroke(stroke) || minDistancePolylineToTrail(stroke.points, trailPoints) > radiusPx) {
        previewStrokes.push(stroke);
        continue;
      }
      if (deleteShorterThanPx > 0 && strokeArcLength(stroke.points) < deleteShorterThanPx) {
        affected.push(stroke.id);
        totalRemoved += pointCountOf(stroke.points);
        continue;
      }
      const res = simplifyDrawElStrokeRegion(stroke, {
        tolerancePx: options.simplifyTolerancePx ?? 2.5, wholeLine: options.wholeLine === true,
        brushTrailPoints: trailPoints, radiusPx, preserveEnds: true,
      });
      if (res.removedVertices > 0) { affected.push(stroke.id); totalRemoved += res.removedVertices; }
      previewStrokes.push(res.stroke);
    }
    return { previewStrokes, targetStrokeId: affected[0] ?? null, overlay: mkOverlay(radiusPx, affected, { removedVerticesCount: totalRemoved }) };
  }

  if (options.tool === "split") {
    const hit = findNearestStroke(baseStrokes, cursor, hitRadiusPx);
    if (!hit || hit.proj.normalizedT <= 0.005 || hit.proj.normalizedT >= 0.995) {
      return { previewStrokes: baseStrokes, targetStrokeId: null, overlay: mkOverlay(hitRadiusPx, []) };
    }
    const parts = splitVectorStrokeAtParameter(hit.stroke, hit.proj.normalizedT, options.createSplitIds?.(hit.stroke.id));
    if (!parts) return { previewStrokes: baseStrokes, targetStrokeId: hit.stroke.id, overlay: mkOverlay(hitRadiusPx, [hit.stroke.id]) };
    return {
      previewStrokes: baseStrokes.flatMap((s) => (s.id === hit.stroke.id ? [parts[0], parts[1]] : [s])),
      targetStrokeId: hit.stroke.id,
      overlay: mkOverlay(hitRadiusPx, [hit.stroke.id], { splitMarker: { strokeId: hit.stroke.id, x: hit.proj.x, y: hit.proj.y, t: hit.proj.normalizedT } }),
    };
  }

  const vertexHit = findNearestInteriorVertex(baseStrokes, cursor, hitRadiusPx);
  if (!vertexHit) return { previewStrokes: baseStrokes, targetStrokeId: null, overlay: mkOverlay(hitRadiusPx, []) };
  const toggled = toggleVectorCornerSmooth(vertexHit.stroke, vertexHit.vertexIndex, {
    mode: options.cornerMode ?? "auto", strength: options.cornerStrength ?? 0.65,
  });
  return {
    previewStrokes: strokesDeepEqual(vertexHit.stroke, toggled) ? baseStrokes : baseStrokes.map((s) => (s.id === vertexHit.stroke.id ? toggled : s)),
    targetStrokeId: vertexHit.stroke.id,
    overlay: mkOverlay(hitRadiusPx, [vertexHit.stroke.id], { cornerMarker: { strokeId: vertexHit.stroke.id, vertexIndex: vertexHit.vertexIndex, x: vertexHit.x, y: vertexHit.y } }),
  };
}

export const vectorSurgeryPointerId = (event: { readonly pointerId?: number }): number =>
  Number.isFinite(event.pointerId) ? (event.pointerId as number) : 1;

export const ownsVectorSurgeryPointer = (session: VectorSurgeryPointerSession, event: { readonly pointerId?: number }): boolean =>
  session.active && session.pointerId === vectorSurgeryPointerId(event);

/** 드래그 시작 스냅샷과 현재 문서 획 목록이 동일한지 검사해 원격 수정/Undo 충돌을 방지한다. */
export const vectorSurgerySourceMatches = (session: VectorSurgeryPointerSession, currentStrokes: readonly DrawEl[]): boolean =>
  !strokeListChanged(session.baseStrokes, currentStrokes);

/** 캔버스 포인터 다운 시 벡터 수술 드래그 세션을 시작하고 초기 미리보기를 계산한다. */
export function beginVectorSurgeryPointerSession(
  strokes: readonly DrawEl[],
  sample: VectorSurgeryPointerSample,
  options: VectorSurgerySessionOptions,
): VectorSurgeryPointerSession {
  const pointerId = vectorSurgeryPointerId(sample);
  const captureTarget = options.captureTarget ?? null;
  try { captureTarget?.setPointerCapture?.(pointerId); } catch { /* 합성 포인터 이벤트는 pointerId 소유권 검사로 처리 */ }

  const baseStrokes = strokes.map((s) => ({ ...s, points: s.points.slice(), ...(s.pressures ? { pressures: s.pressures.slice() } : {}) }));
  const anchor: VectorSurgeryPoint = { x: Number.isFinite(sample.x) ? sample.x : 0, y: Number.isFinite(sample.y) ? sample.y : 0 };
  const pressure = typeof sample.pressure === "number" && Number.isFinite(sample.pressure) ? clamp(sample.pressure, 0, 1) : NEUTRAL_PRESSURE;
  const trailPoints = [anchor.x, anchor.y];
  const trailPressures = [pressure];
  const evaluated = evaluateSessionPreview(baseStrokes, anchor, anchor, null, trailPoints, trailPressures, options);

  return {
    active: true, pointerId, tool: options.tool, options, captureTarget, anchor,
    targetStrokeId: evaluated.targetStrokeId, baseStrokes, previewStrokes: evaluated.previewStrokes,
    trailPoints, trailPressures, overlay: evaluated.overlay, changed: strokeListChanged(baseStrokes, evaluated.previewStrokes),
  };
}

/** 포인터 이동 시 원본 스냅샷 기준으로 라이브 미리보기를 갱신한다(문서 히스토리 오염 없음). */
export function updateVectorSurgeryPointerSession(
  session: VectorSurgeryPointerSession,
  sample: VectorSurgeryPointerSample,
): VectorSurgeryPointerSession {
  if (!session.active) return session;
  if (sample.pointerId !== undefined && !ownsVectorSurgeryPointer(session, sample)) return session;
  if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) return session;

  const cursor: VectorSurgeryPoint = { x: sample.x, y: sample.y };
  const pressure = typeof sample.pressure === "number" && Number.isFinite(sample.pressure) ? clamp(sample.pressure, 0, 1) : NEUTRAL_PRESSURE;
  const lastX = session.trailPoints[session.trailPoints.length - 2], lastY = session.trailPoints[session.trailPoints.length - 1];
  const movedEnough = lastX === undefined || lastY === undefined || Math.hypot(cursor.x - lastX, cursor.y - lastY) >= 0.5;
  const trailPoints = movedEnough ? [...session.trailPoints, cursor.x, cursor.y] : session.trailPoints;
  const trailPressures = movedEnough ? [...session.trailPressures, pressure] : session.trailPressures;

  const evaluated = evaluateSessionPreview(
    session.baseStrokes, session.anchor, cursor, session.targetStrokeId, trailPoints, trailPressures, session.options,
  );
  return {
    ...session, targetStrokeId: evaluated.targetStrokeId, previewStrokes: evaluated.previewStrokes,
    trailPoints, trailPressures, overlay: evaluated.overlay, changed: strokeListChanged(session.baseStrokes, evaluated.previewStrokes),
  };
}

function releaseCapture(session: VectorSurgeryPointerSession): void {
  try { session.captureTarget?.releasePointerCapture?.(session.pointerId); } catch { /* 이미 해제된 캡처 무시 */ }
}

/** 포인터 업 시 드래그 전체를 단일 Undo 커밋 패치로 확정한다. */
export function commitVectorSurgeryPointerSession(
  session: VectorSurgeryPointerSession,
  currentDocumentStrokes?: readonly DrawEl[],
): VectorSurgeryCommitPatch {
  releaseCapture(session);
  const label = UNDO_LABEL_BY_ID[session.tool];
  const empty = (stale: boolean, nextDocumentStrokes: readonly DrawEl[]): VectorSurgeryCommitPatch => ({
    tool: session.tool, label, changed: false, stale, beforeStrokes: [], afterStrokes: [],
    nextDocumentStrokes, replacedIds: [], removedIds: [], addedStrokes: [], affectedStrokeIds: [],
  });

  if (currentDocumentStrokes && !vectorSurgerySourceMatches(session, currentDocumentStrokes)) {
    return empty(true, currentDocumentStrokes);
  }
  if (!session.changed) return empty(false, session.baseStrokes);

  const beforeById = new Map(session.baseStrokes.map((s) => [s.id, s]));
  const afterById = new Map(session.previewStrokes.map((s) => [s.id, s]));
  const replacedIds: string[] = [], removedIds: string[] = [], addedStrokes: DrawEl[] = [];
  const beforeStrokes: DrawEl[] = [], afterStrokes: DrawEl[] = [], affectedSet = new Set<string>();

  for (const prev of session.baseStrokes) {
    const next = afterById.get(prev.id);
    if (!next) {
      removedIds.push(prev.id); beforeStrokes.push(prev); affectedSet.add(prev.id);
    } else if (!strokesDeepEqual(prev, next)) {
      replacedIds.push(prev.id); beforeStrokes.push(prev); afterStrokes.push(next); affectedSet.add(prev.id);
    }
  }
  for (const next of session.previewStrokes) {
    if (!beforeById.has(next.id)) {
      addedStrokes.push(next); afterStrokes.push(next); affectedSet.add(next.id);
    }
  }
  return {
    tool: session.tool, label, changed: true, stale: false, beforeStrokes, afterStrokes,
    nextDocumentStrokes: session.previewStrokes, replacedIds, removedIds, addedStrokes, affectedStrokeIds: [...affectedSet],
  };
}

/** 포인터 취소(Esc / pointercancel) 시 포인터 캡처를 해제하고 시작 스냅샷을 복구한다. */
export function cancelVectorSurgeryPointerSession(session: VectorSurgeryPointerSession) {
  releaseCapture(session);
  return { cancelled: true as const, restoredStrokes: session.baseStrokes };
}

/** 커밋 패치를 문서 벡터 획 배열에 적용한다(Redo). */
export function applyVectorSurgeryCommitPatch(strokes: readonly DrawEl[], patch: VectorSurgeryCommitPatch): DrawEl[] {
  if (!patch.changed || patch.stale) return strokes.slice();
  const removed = new Set(patch.removedIds);
  const replaced = new Map(patch.afterStrokes.filter((s) => patch.replacedIds.includes(s.id)).map((s) => [s.id, s]));
  const out: DrawEl[] = [];
  let insertedAdded = false;
  for (const stroke of strokes) {
    if (removed.has(stroke.id)) {
      if (!insertedAdded && patch.addedStrokes.length > 0) { out.push(...patch.addedStrokes); insertedAdded = true; }
      continue;
    }
    out.push(replaced.get(stroke.id) ?? stroke);
  }
  if (!insertedAdded && patch.addedStrokes.length > 0) out.push(...patch.addedStrokes);
  return out;
}

/** 커밋 패치를 단일 Undo 단계로 원복한다. */
export function revertVectorSurgeryCommitPatch(strokes: readonly DrawEl[], patch: VectorSurgeryCommitPatch): DrawEl[] {
  if (!patch.changed || patch.stale) return strokes.slice();
  const added = new Set(patch.addedStrokes.map((s) => s.id));
  const beforeById = new Map(patch.beforeStrokes.map((s) => [s.id, s]));
  const removedBefore = patch.beforeStrokes.filter((s) => patch.removedIds.includes(s.id));
  const out: DrawEl[] = [];
  let restoredRemoved = false;
  for (const stroke of strokes) {
    if (added.has(stroke.id)) {
      if (!restoredRemoved && removedBefore.length > 0) { out.push(...removedBefore); restoredRemoved = true; }
      continue;
    }
    out.push(beforeById.get(stroke.id) ?? stroke);
  }
  if (!restoredRemoved && removedBefore.length > 0) out.push(...removedBefore);
  return out;
}
