/**
 * PPT 전문가용 정밀 레이아웃 · 1px 자석 스마트 가이드 · 스마트 커넥터 · 계층/그룹 엔진.
 *
 * 도형 불리언(ppt-boolean-geometry) 및 마스터 슬라이드 발표(ppt-presentation-slides)와 함께
 * 웹툰 콘티·기획안용 PPT 정밀 도구의 단일 진입점을 제공한다.
 */

import type { CanvasShapeObject, Point2D, Rect2D } from "./ppt-boolean-geometry";

export {
  executeBooleanShapeOp,
  polygonToSvgPath,
  shapeToPolygon,
  type BooleanOperationResult,
  type BooleanResultPiece,
  type BooleanShapeOp,
  type CanvasShapeObject,
  type Point2D,
  type Rect2D,
  type ShapeKind,
} from "./ppt-boolean-geometry";

export {
  addSlideHighlighterStroke,
  appendLaserPointerPoint,
  createDefaultPresentationDeck,
  createMasterSlidesFromCuts,
  navigatePresentationSlide,
  pruneLaserTrail,
  updateSlideNotes,
  type CutSlideInput,
  type HighlighterStroke,
  type LaserPointerSample,
  type PresentationDeckState,
  type PresentationSlide,
  type SlideLayoutMaster,
  type SlideTransitionKind,
} from "./ppt-presentation-slides";

export type AlignmentKind =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom";

export type DistributeAxis = "horizontal" | "vertical";

export type SizeMatchMode =
  | "max-width"
  | "min-width"
  | "max-height"
  | "min-height"
  | "max-both"
  | "min-both";

export interface SmartGuideLine {
  readonly axis: "vertical" | "horizontal";
  readonly position: number;
  readonly start: number;
  readonly end: number;
  readonly kind: "edge" | "center" | "spacing";
  readonly distancePx?: number;
  readonly label: string;
  readonly targetId: string;
}

export interface SmartDistanceLabel {
  readonly axis: "horizontal" | "vertical";
  readonly x: number;
  readonly y: number;
  readonly distancePx: number;
  readonly label: string;
  readonly targetId: string;
}

export interface SmartSnapResult {
  readonly snappedX: number;
  readonly snappedY: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly guides: readonly SmartGuideLine[];
  readonly distanceLabels: readonly SmartDistanceLabel[];
}

export type AnchorSide = "top" | "right" | "bottom" | "left";
export type ConnectorStyle = "elbow" | "orthogonal" | "bezier" | "straight";

export interface SmartConnector {
  readonly id: string;
  readonly fromShapeId: string;
  readonly fromAnchor: AnchorSide | "auto";
  readonly toShapeId: string;
  readonly toAnchor: AnchorSide | "auto";
  readonly style: ConnectorStyle;
  readonly label?: string;
}

export interface RoutedConnector {
  readonly id: string;
  readonly fromShapeId: string;
  readonly toShapeId: string;
  readonly resolvedFromAnchor: AnchorSide;
  readonly resolvedToAnchor: AnchorSide;
  readonly start: Point2D;
  readonly end: Point2D;
  readonly waypoints: readonly Point2D[];
  readonly svgPath: string;
  readonly style: ConnectorStyle;
  readonly lengthPx: number;
}

export type ZOrderAction =
  | "bring-to-front"
  | "bring-forward"
  | "send-backward"
  | "send-to-back";

export interface ShapeGroup {
  readonly id: string;
  readonly name: string;
  readonly memberIds: readonly string[];
}

export interface PptCanvasSnapshot {
  readonly shapes: readonly CanvasShapeObject[];
  readonly groups: readonly ShapeGroup[];
  readonly connectors: readonly SmartConnector[];
}

export interface PptCanvasDocumentState extends PptCanvasSnapshot {
  readonly undoStack: readonly PptCanvasSnapshot[];
  readonly redoStack: readonly PptCanvasSnapshot[];
}

const MAX_UNDO_HISTORY = 32;

function roundCoord(value: number, step = 1): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function distance2D(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function alignShapes(
  shapes: readonly CanvasShapeObject[],
  selectedIds: readonly string[],
  alignment: AlignmentKind,
): readonly CanvasShapeObject[] {
  const idSet = new Set(selectedIds);
  const targets = shapes.filter((shape) => idSet.has(shape.id) && !shape.locked);
  if (targets.length < 2) return shapes;

  const minX = Math.min(...targets.map((s) => s.x));
  const maxX = Math.max(...targets.map((s) => s.x + s.width));
  const centerX = (minX + maxX) / 2;
  const minY = Math.min(...targets.map((s) => s.y));
  const maxY = Math.max(...targets.map((s) => s.y + s.height));
  const centerY = (minY + maxY) / 2;

  return shapes.map((shape) => {
    if (!idSet.has(shape.id) || shape.locked) return shape;
    if (alignment === "left") return { ...shape, x: roundCoord(minX) };
    if (alignment === "center-x") return { ...shape, x: roundCoord(centerX - shape.width / 2) };
    if (alignment === "right") return { ...shape, x: roundCoord(maxX - shape.width) };
    if (alignment === "top") return { ...shape, y: roundCoord(minY) };
    if (alignment === "center-y") return { ...shape, y: roundCoord(centerY - shape.height / 2) };
    return { ...shape, y: roundCoord(maxY - shape.height) };
  });
}

export function distributeShapes(
  shapes: readonly CanvasShapeObject[],
  selectedIds: readonly string[],
  axis: DistributeAxis,
): readonly CanvasShapeObject[] {
  const idSet = new Set(selectedIds);
  const targets = shapes.filter((shape) => idSet.has(shape.id) && !shape.locked);
  if (targets.length < 3) return shapes;

  const sorted = [...targets].sort((a, b) =>
    axis === "horizontal" ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x,
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const updatedById = new Map<string, CanvasShapeObject>();

  if (axis === "horizontal") {
    const totalSpan = last.x + last.width - first.x;
    const totalWidth = sorted.reduce((acc, s) => acc + s.width, 0);
    const gap = (totalSpan - totalWidth) / (sorted.length - 1);
    let cursor = first.x;
    for (const shape of sorted) {
      updatedById.set(shape.id, { ...shape, x: roundMetric(cursor) });
      cursor += shape.width + gap;
    }
  } else {
    const totalSpan = last.y + last.height - first.y;
    const totalHeight = sorted.reduce((acc, s) => acc + s.height, 0);
    const gap = (totalSpan - totalHeight) / (sorted.length - 1);
    let cursor = first.y;
    for (const shape of sorted) {
      updatedById.set(shape.id, { ...shape, y: roundMetric(cursor) });
      cursor += shape.height + gap;
    }
  }

  return shapes.map((shape) => updatedById.get(shape.id) ?? shape);
}

export function matchShapeSizes(
  shapes: readonly CanvasShapeObject[],
  selectedIds: readonly string[],
  mode: SizeMatchMode,
): readonly CanvasShapeObject[] {
  const idSet = new Set(selectedIds);
  const targets = shapes.filter((shape) => idSet.has(shape.id) && !shape.locked);
  if (targets.length < 2) return shapes;

  const targetWidth =
    mode === "max-width" || mode === "max-both"
      ? Math.max(...targets.map((s) => s.width))
      : mode === "min-width" || mode === "min-both"
        ? Math.min(...targets.map((s) => s.width))
        : null;

  const targetHeight =
    mode === "max-height" || mode === "max-both"
      ? Math.max(...targets.map((s) => s.height))
      : mode === "min-height" || mode === "min-both"
        ? Math.min(...targets.map((s) => s.height))
        : null;

  return shapes.map((shape) => {
    if (!idSet.has(shape.id) || shape.locked) return shape;
    return { ...shape, width: targetWidth ?? shape.width, height: targetHeight ?? shape.height };
  });
}

export function computeSmartGuides(
  moving: Rect2D & { readonly id?: string },
  others: readonly CanvasShapeObject[],
  snapThresholdPx = 6,
  gridSnapPx = 1,
): SmartSnapResult {
  const candidates = others.filter((item) => item.id !== moving.id);
  const mXs = [moving.x, moving.x + moving.width / 2, moving.x + moving.width];
  const mYs = [moving.y, moving.y + moving.height / 2, moving.y + moving.height];

  let bestDx = 0;
  let bestAbsDx = snapThresholdPx + 1;
  let bestDy = 0;
  let bestAbsDy = snapThresholdPx + 1;

  for (const other of candidates) {
    const oXs = [other.x, other.x + other.width / 2, other.x + other.width];
    for (const mx of mXs) {
      for (const ox of oXs) {
        const dx = ox - mx;
        if (Math.abs(dx) <= snapThresholdPx && Math.abs(dx) < bestAbsDx) {
          bestAbsDx = Math.abs(dx);
          bestDx = dx;
        }
      }
    }
    const oYs = [other.y, other.y + other.height / 2, other.y + other.height];
    for (const my of mYs) {
      for (const oy of oYs) {
        const dy = oy - my;
        if (Math.abs(dy) <= snapThresholdPx && Math.abs(dy) < bestAbsDy) {
          bestAbsDy = Math.abs(dy);
          bestDy = dy;
        }
      }
    }
  }

  const snappedX = roundCoord(moving.x + (bestAbsDx <= snapThresholdPx ? bestDx : 0), gridSnapPx);
  const snappedY = roundCoord(moving.y + (bestAbsDy <= snapThresholdPx ? bestDy : 0), gridSnapPx);
  const sLeft = snappedX;
  const sCenterX = snappedX + moving.width / 2;
  const sRight = snappedX + moving.width;
  const sTop = snappedY;
  const sCenterY = snappedY + moving.height / 2;
  const sBottom = snappedY + moving.height;

  const guides: SmartGuideLine[] = [];
  const distanceLabels: SmartDistanceLabel[] = [];
  const guideEps = 0.5;

  for (const other of candidates) {
    const oLeft = other.x;
    const oCenterX = other.x + other.width / 2;
    const oRight = other.x + other.width;
    const oTop = other.y;
    const oCenterY = other.y + other.height / 2;
    const oBottom = other.y + other.height;

    const xPairs: readonly (readonly [number, number, "edge" | "center", string])[] = [
      [sLeft, oLeft, "edge", "좌측 정렬"],
      [sLeft, oRight, "edge", "경계 밀착"],
      [sCenterX, oCenterX, "center", "수평 중앙"],
      [sRight, oRight, "edge", "우측 정렬"],
      [sRight, oLeft, "edge", "경계 밀착"],
    ];
    for (const [sx, ox, kind, label] of xPairs) {
      if (Math.abs(sx - ox) <= guideEps) {
        guides.push({
          axis: "vertical",
          position: roundMetric(ox),
          start: Math.min(sTop, oTop),
          end: Math.max(sBottom, oBottom),
          kind,
          label,
          targetId: other.id,
        });
      }
    }

    const yPairs: readonly (readonly [number, number, "edge" | "center", string])[] = [
      [sTop, oTop, "edge", "상단 정렬"],
      [sTop, oBottom, "edge", "경계 밀착"],
      [sCenterY, oCenterY, "center", "수직 중앙"],
      [sBottom, oBottom, "edge", "하단 정렬"],
      [sBottom, oTop, "edge", "경계 밀착"],
    ];
    for (const [sy, oy, kind, label] of yPairs) {
      if (Math.abs(sy - oy) <= guideEps) {
        guides.push({
          axis: "horizontal",
          position: roundMetric(oy),
          start: Math.min(sLeft, oLeft),
          end: Math.max(sRight, oRight),
          kind,
          label,
          targetId: other.id,
        });
      }
    }

    if (Math.min(sBottom, oBottom) > Math.max(sTop, oTop)) {
      const midY = roundMetric((Math.max(sTop, oTop) + Math.min(sBottom, oBottom)) / 2);
      const horizontalGap = sLeft >= oRight ? [oRight, sLeft] : oLeft >= sRight ? [sRight, oLeft] : null;
      if (horizontalGap) {
        const gap = Math.round(horizontalGap[1] - horizontalGap[0]);
        distanceLabels.push({
          axis: "horizontal",
          x: roundMetric((horizontalGap[0] + horizontalGap[1]) / 2),
          y: midY,
          distancePx: gap,
          label: `${gap}px`,
          targetId: other.id,
        });
        guides.push({
          axis: "horizontal",
          position: midY,
          start: horizontalGap[0],
          end: horizontalGap[1],
          kind: "spacing",
          distancePx: gap,
          label: `${gap}px`,
          targetId: other.id,
        });
      }
    }

    if (Math.min(sRight, oRight) > Math.max(sLeft, oLeft)) {
      const midX = roundMetric((Math.max(sLeft, oLeft) + Math.min(sRight, oRight)) / 2);
      const verticalGap = sTop >= oBottom ? [oBottom, sTop] : oTop >= sBottom ? [sBottom, oTop] : null;
      if (verticalGap) {
        const gap = Math.round(verticalGap[1] - verticalGap[0]);
        distanceLabels.push({
          axis: "vertical",
          x: midX,
          y: roundMetric((verticalGap[0] + verticalGap[1]) / 2),
          distancePx: gap,
          label: `${gap}px`,
          targetId: other.id,
        });
        guides.push({
          axis: "vertical",
          position: midX,
          start: verticalGap[0],
          end: verticalGap[1],
          kind: "spacing",
          distancePx: gap,
          label: `${gap}px`,
          targetId: other.id,
        });
      }
    }
  }

  return {
    snappedX,
    snappedY,
    deltaX: roundMetric(snappedX - moving.x),
    deltaY: roundMetric(snappedY - moving.y),
    guides,
    distanceLabels,
  };
}

export function getShapeAnchorPoint(shape: CanvasShapeObject, side: AnchorSide): Point2D {
  if (side === "top") return { x: roundMetric(shape.x + shape.width / 2), y: roundMetric(shape.y) };
  if (side === "right") return { x: roundMetric(shape.x + shape.width), y: roundMetric(shape.y + shape.height / 2) };
  if (side === "bottom") return { x: roundMetric(shape.x + shape.width / 2), y: roundMetric(shape.y + shape.height) };
  return { x: roundMetric(shape.x), y: roundMetric(shape.y + shape.height / 2) };
}

function anchorNormal(side: AnchorSide): Point2D {
  if (side === "top") return { x: 0, y: -1 };
  if (side === "right") return { x: 1, y: 0 };
  if (side === "bottom") return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

function resolveAnchorPair(
  fromShape: CanvasShapeObject,
  toShape: CanvasShapeObject,
  fromAnchor: AnchorSide | "auto",
  toAnchor: AnchorSide | "auto",
): readonly [AnchorSide, AnchorSide] {
  const fromSides: readonly AnchorSide[] =
    fromAnchor === "auto" ? ["top", "right", "bottom", "left"] : [fromAnchor];
  const toSides: readonly AnchorSide[] =
    toAnchor === "auto" ? ["top", "right", "bottom", "left"] : [toAnchor];

  let bestFrom = fromSides[0];
  let bestTo = toSides[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const fs of fromSides) {
    const fp = getShapeAnchorPoint(fromShape, fs);
    for (const ts of toSides) {
      const tp = getShapeAnchorPoint(toShape, ts);
      const dist = Math.abs(tp.x - fp.x) + Math.abs(tp.y - fp.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestFrom = fs;
        bestTo = ts;
      }
    }
  }
  return [bestFrom, bestTo];
}

export function routeSmartConnector(
  connector: SmartConnector,
  shapes: readonly CanvasShapeObject[],
): RoutedConnector | null {
  const fromShape = shapes.find((s) => s.id === connector.fromShapeId);
  const toShape = shapes.find((s) => s.id === connector.toShapeId);
  if (!fromShape || !toShape) return null;

  const [resolvedFromAnchor, resolvedToAnchor] = resolveAnchorPair(
    fromShape,
    toShape,
    connector.fromAnchor,
    connector.toAnchor,
  );
  const start = getShapeAnchorPoint(fromShape, resolvedFromAnchor);
  const end = getShapeAnchorPoint(toShape, resolvedToAnchor);
  const n1 = anchorNormal(resolvedFromAnchor);
  const n2 = anchorNormal(resolvedToAnchor);

  let waypoints: Point2D[] = [start, end];
  let svgPath = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

  if (connector.style === "elbow") {
    const midX = roundMetric((start.x + end.x) / 2);
    const midY = roundMetric((start.y + end.y) / 2);
    waypoints =
      resolvedFromAnchor === "left" || resolvedFromAnchor === "right"
        ? [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]
        : [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
    svgPath = waypoints.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${roundMetric(pt.x)} ${roundMetric(pt.y)}`).join(" ");
  } else if (connector.style === "orthogonal") {
    const stub = 18;
    const p1 = { x: roundMetric(start.x + n1.x * stub), y: roundMetric(start.y + n1.y * stub) };
    const p2 = { x: roundMetric(end.x + n2.x * stub), y: roundMetric(end.y + n2.y * stub) };
    const midX = roundMetric((p1.x + p2.x) / 2);
    const midY = roundMetric((p1.y + p2.y) / 2);
    waypoints =
      Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y)
        ? [start, p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2, end]
        : [start, p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2, end];
    svgPath = waypoints.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${roundMetric(pt.x)} ${roundMetric(pt.y)}`).join(" ");
  } else if (connector.style === "bezier") {
    const handle = Math.max(32, Math.min(120, distance2D(start, end) * 0.4));
    const c1 = { x: roundMetric(start.x + n1.x * handle), y: roundMetric(start.y + n1.y * handle) };
    const c2 = { x: roundMetric(end.x + n2.x * handle), y: roundMetric(end.y + n2.y * handle) };
    waypoints = [start, c1, c2, end];
    svgPath = `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
  }

  let lengthPx = 0;
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    lengthPx += distance2D(waypoints[i], waypoints[i + 1]);
  }

  return {
    id: connector.id,
    fromShapeId: connector.fromShapeId,
    toShapeId: connector.toShapeId,
    resolvedFromAnchor,
    resolvedToAnchor,
    start,
    end,
    waypoints,
    svgPath,
    style: connector.style,
    lengthPx: roundMetric(lengthPx),
  };
}

function pushSnapshot(doc: PptCanvasDocumentState): readonly PptCanvasSnapshot[] {
  return [...doc.undoStack.slice(-(MAX_UNDO_HISTORY - 1)), { shapes: doc.shapes, groups: doc.groups, connectors: doc.connectors }];
}

function normalizeZOrder(shapes: readonly CanvasShapeObject[]): readonly CanvasShapeObject[] {
  const ordered = [...shapes].sort((a, b) => a.zIndex - b.zIndex);
  const rankById = new Map<string, number>();
  ordered.forEach((shape, idx) => rankById.set(shape.id, idx));
  return shapes.map((shape) => ({ ...shape, zIndex: rankById.get(shape.id) ?? shape.zIndex }));
}

export function groupShapes(
  doc: PptCanvasDocumentState,
  selectedIds: readonly string[],
  groupName?: string,
): PptCanvasDocumentState {
  const validIds = selectedIds.filter((id) => doc.shapes.some((s) => s.id === id));
  if (validIds.length < 2) return doc;
  const idSet = new Set(validIds);
  const groupId = `grp-${doc.groups.length + 1}-${validIds[0]}`;
  const nextGroups: ShapeGroup[] = [
    ...doc.groups
      .map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => !idSet.has(m)) }))
      .filter((g) => g.memberIds.length >= 2),
    { id: groupId, name: groupName ?? `그룹 ${doc.groups.length + 1}`, memberIds: validIds },
  ];
  return {
    ...doc,
    shapes: doc.shapes.map((s) => (idSet.has(s.id) ? { ...s, groupId } : s)),
    groups: nextGroups,
    undoStack: pushSnapshot(doc),
    redoStack: [],
  };
}

export function ungroupShapes(doc: PptCanvasDocumentState, groupId: string): PptCanvasDocumentState {
  if (!doc.groups.some((g) => g.id === groupId)) return doc;
  return {
    ...doc,
    shapes: doc.shapes.map((s) => (s.groupId === groupId ? { ...s, groupId: null } : s)),
    groups: doc.groups.filter((g) => g.id !== groupId),
    undoStack: pushSnapshot(doc),
    redoStack: [],
  };
}

export function reorderShapeZOrder(
  doc: PptCanvasDocumentState,
  targetId: string,
  action: ZOrderAction,
): PptCanvasDocumentState {
  const ordered = [...doc.shapes].sort((a, b) => a.zIndex - b.zIndex);
  const index = ordered.findIndex((s) => s.id === targetId);
  if (index < 0) return doc;

  const nextOrdered = [...ordered];
  const [moved] = nextOrdered.splice(index, 1);
  if (action === "bring-to-front") nextOrdered.push(moved);
  else if (action === "send-to-back") nextOrdered.unshift(moved);
  else if (action === "bring-forward") nextOrdered.splice(Math.min(nextOrdered.length, index + 1), 0, moved);
  else nextOrdered.splice(Math.max(0, index - 1), 0, moved);

  const zById = new Map<string, number>();
  nextOrdered.forEach((s, idx) => zById.set(s.id, idx));
  return {
    ...doc,
    shapes: normalizeZOrder(doc.shapes.map((s) => ({ ...s, zIndex: zById.get(s.id) ?? s.zIndex }))),
    undoStack: pushSnapshot(doc),
    redoStack: [],
  };
}

export function moveShapeWithAutoReroute(
  doc: PptCanvasDocumentState,
  shapeId: string,
  nextX: number,
  nextY: number,
  snapThresholdPx = 6,
): {
  readonly document: PptCanvasDocumentState;
  readonly snap: SmartSnapResult;
  readonly routedConnectors: readonly RoutedConnector[];
} {
  const target = doc.shapes.find((s) => s.id === shapeId);
  if (!target || target.locked) {
    const routed = doc.connectors
      .map((c) => routeSmartConnector(c, doc.shapes))
      .filter((item): item is RoutedConnector => item !== null);
    return {
      document: doc,
      snap: { snappedX: nextX, snappedY: nextY, deltaX: 0, deltaY: 0, guides: [], distanceLabels: [] },
      routedConnectors: routed,
    };
  }

  const snap = computeSmartGuides(
    { id: target.id, x: nextX, y: nextY, width: target.width, height: target.height },
    doc.shapes,
    snapThresholdPx,
    1,
  );
  const moveDx = snap.snappedX - target.x;
  const moveDy = snap.snappedY - target.y;
  const nextShapes = doc.shapes.map((shape) => {
    if (shape.id === target.id) return { ...shape, x: snap.snappedX, y: snap.snappedY };
    if (target.groupId && shape.groupId === target.groupId && !shape.locked) {
      return { ...shape, x: roundCoord(shape.x + moveDx), y: roundCoord(shape.y + moveDy) };
    }
    return shape;
  });

  const nextDoc: PptCanvasDocumentState = {
    ...doc,
    shapes: nextShapes,
    undoStack: pushSnapshot(doc),
    redoStack: [],
  };
  const routedConnectors = nextDoc.connectors
    .map((c) => routeSmartConnector(c, nextShapes))
    .filter((item): item is RoutedConnector => item !== null);
  return { document: nextDoc, snap, routedConnectors };
}

export function undoCanvasDocument(doc: PptCanvasDocumentState): PptCanvasDocumentState {
  if (doc.undoStack.length === 0) return doc;
  const previous = doc.undoStack[doc.undoStack.length - 1];
  return {
    ...previous,
    undoStack: doc.undoStack.slice(0, -1),
    redoStack: [...doc.redoStack, { shapes: doc.shapes, groups: doc.groups, connectors: doc.connectors }],
  };
}

export function redoCanvasDocument(doc: PptCanvasDocumentState): PptCanvasDocumentState {
  if (doc.redoStack.length === 0) return doc;
  const restored = doc.redoStack[doc.redoStack.length - 1];
  return {
    ...restored,
    undoStack: [...doc.undoStack, { shapes: doc.shapes, groups: doc.groups, connectors: doc.connectors }],
    redoStack: doc.redoStack.slice(0, -1),
  };
}

export function createDefaultPptDocument(): PptCanvasDocumentState {
  return {
    shapes: [
      { id: "cut-a", label: "컷 1 프레임", kind: "rect", x: 36, y: 42, width: 130, height: 86, zIndex: 0, groupId: null },
      { id: "cut-b", label: "말풍선 원형", kind: "ellipse", x: 118, y: 74, width: 112, height: 84, zIndex: 1, groupId: null },
      { id: "cut-c", label: "액션 컷 2", kind: "rounded-rect", x: 274, y: 48, width: 120, height: 78, zIndex: 2, groupId: null },
      { id: "cut-d", label: "대사 말풍선", kind: "speech-bubble", x: 152, y: 176, width: 136, height: 82, zIndex: 3, groupId: null },
    ],
    groups: [],
    connectors: [
      { id: "conn-1", fromShapeId: "cut-a", fromAnchor: "right", toShapeId: "cut-c", toAnchor: "left", style: "elbow", label: "시선 이동" },
      { id: "conn-2", fromShapeId: "cut-b", fromAnchor: "bottom", toShapeId: "cut-d", toAnchor: "top", style: "bezier", label: "대사 연결" },
    ],
    undoStack: [],
    redoStack: [],
  };
}
