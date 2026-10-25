/**
 * 구조화 올가미 페이스트보드(Structured Lasso Pasteboard) 및
 * Muse 공간 레퍼런스 어태치먼트 카드(Spatial Reference Attachment Cards) 엔진.
 *
 * Goodnotes v7.1.28 (`com.goodnotesapp.x`, Lasso Pasteboard) 및
 * Muse v9.0 (`com.meta.endo`, `com.meta.prototypes.endo.attachment-reference`) 역공학 분석에서 도출된
 * 폴리곤 올가미 교차/포함 선택·구조화 직렬화와 원고 컷 발췌 공간 카드 및 비파괴 잉크 역투영을 제공한다.
 */

export interface CanvasPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface CanvasBounds2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type LassoLayerRole =
  | "ink"
  | "dialogue"
  | "sfx"
  | "outline"
  | "annotation";

export interface LassoStrokeElement {
  readonly id: string;
  readonly kind: "stroke";
  readonly role: LassoLayerRole;
  readonly points: readonly CanvasPoint2D[];
  readonly strokeWidth?: number;
  readonly color?: string;
  readonly baselineAngleRad?: number;
  readonly baselineCurvature?: number;
}

export interface LassoBoxElement {
  readonly id: string;
  readonly kind: "box";
  readonly role: LassoLayerRole;
  readonly bounds: CanvasBounds2D;
  readonly text?: string;
  readonly baselineAngleRad?: number;
}

export type LassoSelectableElement = LassoStrokeElement | LassoBoxElement;

export type StructuredLassoItem =
  | {
      readonly originalId: string;
      readonly kind: "stroke";
      readonly role: LassoLayerRole;
      readonly relativePoints: readonly CanvasPoint2D[];
      readonly strokeWidth?: number;
      readonly color?: string;
      readonly baselineAngleRad?: number;
      readonly baselineCurvature?: number;
    }
  | {
      readonly originalId: string;
      readonly kind: "box";
      readonly role: LassoLayerRole;
      readonly relativeBounds: CanvasBounds2D;
      readonly text?: string;
      readonly baselineAngleRad?: number;
    };

export interface StructuredLassoPasteboardPayload {
  readonly schema: "toonstudio.structured-lasso-pasteboard.v1";
  readonly sourceAnchor: CanvasPoint2D;
  readonly selectionBounds: CanvasBounds2D;
  readonly lassoPolygon: readonly CanvasPoint2D[];
  readonly items: readonly StructuredLassoItem[];
}

export interface SpatialInkAnnotationStroke {
  readonly id: string;
  /** 카드 로컬 좌표계 (0..sourceBounds.width, 0..sourceBounds.height) 상의 포인트. */
  readonly localPoints: readonly CanvasPoint2D[];
  readonly strokeWidth: number;
  readonly color: string;
}

export interface SpatialAttachmentReferenceCard {
  readonly schema: "com.meta.prototypes.endo.attachment-reference";
  readonly id: string;
  readonly sourceCutId: string;
  readonly title?: string;
  readonly sourceBounds: CanvasBounds2D;
  readonly boardPosition: CanvasPoint2D;
  readonly scale: number;
  readonly pinned: boolean;
  readonly excerptElements: readonly StructuredLassoItem[];
  readonly inkAnnotations: readonly SpatialInkAnnotationStroke[];
}

export interface ProjectedBoardInkOverlayStroke {
  readonly id: string;
  readonly cardId: string;
  readonly boardPoints: readonly CanvasPoint2D[];
  readonly strokeWidth: number;
  readonly color: string;
}

export interface ProjectedSourceCutInkStroke {
  readonly id: string;
  readonly cardId: string;
  readonly sourceCutId: string;
  readonly sourcePoints: readonly CanvasPoint2D[];
  readonly strokeWidth: number;
  readonly color: string;
}

const EPSILON = 1e-9;

function isPointOnSegment(
  p: CanvasPoint2D,
  a: CanvasPoint2D,
  b: CanvasPoint2D,
): boolean {
  const cross = (p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > 1e-6) return false;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  if (dot < -1e-6) return false;
  const lenSq = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
  return dot <= lenSq + 1e-6;
}

function orientation(
  p: CanvasPoint2D,
  q: CanvasPoint2D,
  r: CanvasPoint2D,
): number {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) <= 1e-9) return 0;
  return val > 0 ? 1 : 2;
}

/**
 * 두 선분 (a1-a2)와 (b1-b2)가 교차하는지 판별한다.
 */
export function doLineSegmentsIntersect(
  a1: CanvasPoint2D,
  a2: CanvasPoint2D,
  b1: CanvasPoint2D,
  b2: CanvasPoint2D,
): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && isPointOnSegment(b1, a1, a2)) return true;
  if (o2 === 0 && isPointOnSegment(b2, a1, a2)) return true;
  if (o3 === 0 && isPointOnSegment(a1, b1, b2)) return true;
  if (o4 === 0 && isPointOnSegment(a2, b1, b2)) return true;
  return false;
}

/**
 * Ray-casting 및 경계 선분 검사를 통해 점이 폴리곤 올가미 내부(또는 경계 위)에 있는지 판별한다.
 */
export function isPointInLassoPolygon(
  point: CanvasPoint2D,
  polygon: readonly CanvasPoint2D[],
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    if (isPointOnSegment(point, pj, pi)) return true;
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y + EPSILON) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function getBoxCorners(bounds: CanvasBounds2D): readonly CanvasPoint2D[] {
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
}

function doesPolylineMatchPolygon(
  points: readonly CanvasPoint2D[],
  polygon: readonly CanvasPoint2D[],
  mode: "intersect" | "contain",
): boolean {
  if (points.length === 0 || polygon.length < 3) return false;
  if (mode === "contain") {
    return points.every((pt) => isPointInLassoPolygon(pt, polygon));
  }
  if (points.some((pt) => isPointInLassoPolygon(pt, polygon))) {
    return true;
  }
  for (let i = 1; i < points.length; i += 1) {
    const a1 = points[i - 1]!;
    const a2 = points[i]!;
    for (
      let p = 0, q = polygon.length - 1;
      p < polygon.length;
      q = p, p += 1
    ) {
      if (doLineSegmentsIntersect(a1, a2, polygon[q]!, polygon[p]!)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 올가미 폴리곤 내부에 포함되거나 교차하는 잉크 스트로크·대사·아웃라인 요소를 추출한다.
 */
export function extractLassoSelectionStrokes(
  elements: readonly LassoSelectableElement[],
  lassoPolygon: readonly CanvasPoint2D[],
  mode: "intersect" | "contain" = "intersect",
): readonly LassoSelectableElement[] {
  if (lassoPolygon.length < 3) return [];
  return elements.filter((el) => {
    if (el.kind === "stroke") {
      return doesPolylineMatchPolygon(el.points, lassoPolygon, mode);
    }
    const corners = getBoxCorners(el.bounds);
    const closedCorners = [...corners, corners[0]!];
    if (mode === "contain") {
      return corners.every((c) => isPointInLassoPolygon(c, lassoPolygon));
    }
    if (doesPolylineMatchPolygon(closedCorners, lassoPolygon, "intersect")) {
      return true;
    }
    // 폴리곤 자체가 박스 내부에 완전히 들어간 경우
    const firstPoly = lassoPolygon[0]!;
    return (
      firstPoly.x >= el.bounds.x &&
      firstPoly.x <= el.bounds.x + el.bounds.width &&
      firstPoly.y >= el.bounds.y &&
      firstPoly.y <= el.bounds.y + el.bounds.height
    );
  });
}

function computeElementsBounds(
  elements: readonly LassoSelectableElement[],
): CanvasBounds2D {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    if (el.kind === "stroke") {
      for (const pt of el.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
    } else {
      minX = Math.min(minX, el.bounds.x);
      minY = Math.min(minY, el.bounds.y);
      maxX = Math.max(maxX, el.bounds.x + el.bounds.width);
      maxY = Math.max(maxY, el.bounds.y + el.bounds.height);
    }
  }

  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

function toStructuredItem(
  el: LassoSelectableElement,
  anchor: CanvasPoint2D,
): StructuredLassoItem {
  if (el.kind === "stroke") {
    return {
      originalId: el.id,
      kind: "stroke",
      role: el.role,
      relativePoints: el.points.map((pt) => ({
        x: pt.x - anchor.x,
        y: pt.y - anchor.y,
      })),
      ...(el.strokeWidth !== undefined ? { strokeWidth: el.strokeWidth } : {}),
      ...(el.color !== undefined ? { color: el.color } : {}),
      ...(el.baselineAngleRad !== undefined
        ? { baselineAngleRad: el.baselineAngleRad }
        : {}),
      ...(el.baselineCurvature !== undefined
        ? { baselineCurvature: el.baselineCurvature }
        : {}),
    };
  }
  return {
    originalId: el.id,
    kind: "box",
    role: el.role,
    relativeBounds: {
      x: el.bounds.x - anchor.x,
      y: el.bounds.y - anchor.y,
      width: el.bounds.width,
      height: el.bounds.height,
    },
    ...(el.text !== undefined ? { text: el.text } : {}),
    ...(el.baselineAngleRad !== undefined
      ? { baselineAngleRad: el.baselineAngleRad }
      : {}),
  };
}

/**
 * 폴리곤 올가미로 선택된 요소들의 상대 좌표·레이어 역할·베이스라인 메타데이터를 보존하는
 * 구조화 페이스트보드 페이로드를 생성한다.
 */
export function buildStructuredLassoPayload(
  elements: readonly LassoSelectableElement[],
  lassoPolygon: readonly CanvasPoint2D[],
  mode: "intersect" | "contain" = "intersect",
): StructuredLassoPasteboardPayload {
  const selected = extractLassoSelectionStrokes(elements, lassoPolygon, mode);
  const selectionBounds = computeElementsBounds(selected);
  const sourceAnchor: CanvasPoint2D = {
    x: selectionBounds.x + selectionBounds.width * 0.5,
    y: selectionBounds.y + selectionBounds.height * 0.5,
  };

  return {
    schema: "toonstudio.structured-lasso-pasteboard.v1",
    sourceAnchor,
    selectionBounds,
    lassoPolygon: lassoPolygon.map((pt) => ({ ...pt })),
    items: selected.map((el) => toStructuredItem(el, sourceAnchor)),
  };
}

/**
 * 구조화 올가미 페이로드를 목표 앵커 좌표에 크기·회전을 반영하여 복원(붙여넣기)한다.
 */
export function instantiateStructuredLassoPayload(
  payload: StructuredLassoPasteboardPayload,
  targetAnchor: CanvasPoint2D,
  options: {
    readonly scale?: number;
    readonly rotationRad?: number;
    readonly idPrefix?: string;
  } = {},
): readonly LassoSelectableElement[] {
  const scale = Math.max(0.05, options.scale ?? 1);
  const rotationRad = options.rotationRad ?? 0;
  const cosR = Math.cos(rotationRad);
  const sinR = Math.sin(rotationRad);
  const prefix = options.idPrefix ?? "paste";

  return payload.items.map((item, idx): LassoSelectableElement => {
    const nextId = `${prefix}-${item.originalId}-${idx}`;
    if (item.kind === "stroke") {
      const points = item.relativePoints.map((pt) => {
        const sx = pt.x * scale;
        const sy = pt.y * scale;
        return {
          x: targetAnchor.x + sx * cosR - sy * sinR,
          y: targetAnchor.y + sx * sinR + sy * cosR,
        };
      });
      return {
        id: nextId,
        kind: "stroke",
        role: item.role,
        points,
        ...(item.strokeWidth !== undefined
          ? { strokeWidth: item.strokeWidth * scale }
          : {}),
        ...(item.color !== undefined ? { color: item.color } : {}),
        ...(item.baselineAngleRad !== undefined
          ? { baselineAngleRad: item.baselineAngleRad + rotationRad }
          : {}),
        ...(item.baselineCurvature !== undefined
          ? { baselineCurvature: item.baselineCurvature / scale }
          : {}),
      };
    }

    const cx = item.relativeBounds.x + item.relativeBounds.width * 0.5;
    const cy = item.relativeBounds.y + item.relativeBounds.height * 0.5;
    const scx = cx * scale;
    const scy = cy * scale;
    const rcx = targetAnchor.x + scx * cosR - scy * sinR;
    const rcy = targetAnchor.y + scx * sinR + scy * cosR;
    const width = item.relativeBounds.width * scale;
    const height = item.relativeBounds.height * scale;

    return {
      id: nextId,
      kind: "box",
      role: item.role,
      bounds: {
        x: rcx - width * 0.5,
        y: rcy - height * 0.5,
        width,
        height,
      },
      ...(item.text !== undefined ? { text: item.text } : {}),
      ...(item.baselineAngleRad !== undefined
        ? { baselineAngleRad: item.baselineAngleRad + rotationRad }
        : {}),
    };
  });
}

/**
 * 원고의 특정 컷/영역을 발췌하여 캔버스 옆 공간 보드에 핀 고정할 수 있는
 * Muse 스타일 공간 어태치먼트 레퍼런스 카드를 생성한다.
 */
export function createExcerptReferenceCard(params: {
  readonly id: string;
  readonly sourceCutId: string;
  readonly sourceBounds: CanvasBounds2D;
  readonly boardPosition: CanvasPoint2D;
  readonly scale?: number;
  readonly pinned?: boolean;
  readonly title?: string;
  readonly sourceElements?: readonly LassoSelectableElement[];
}): SpatialAttachmentReferenceCard {
  const rectPolygon = getBoxCorners(params.sourceBounds);
  const selected = params.sourceElements
    ? extractLassoSelectionStrokes(params.sourceElements, rectPolygon, "intersect")
    : [];
  const origin: CanvasPoint2D = {
    x: params.sourceBounds.x,
    y: params.sourceBounds.y,
  };

  return {
    schema: "com.meta.prototypes.endo.attachment-reference",
    id: params.id,
    sourceCutId: params.sourceCutId,
    ...(params.title !== undefined ? { title: params.title } : {}),
    sourceBounds: { ...params.sourceBounds },
    boardPosition: { ...params.boardPosition },
    scale: Math.max(0.05, params.scale ?? 1),
    pinned: params.pinned ?? true,
    excerptElements: selected.map((el) => toStructuredItem(el, origin)),
    inkAnnotations: [],
  };
}

/**
 * 보드 좌표계에서 카드 위에 그린 잉크 주석 스트로크를 카드 로컬 좌표계로 정규화하여 비파괴 추가한다.
 */
export function addBoardInkAnnotationToCard(
  card: SpatialAttachmentReferenceCard,
  annotation: {
    readonly id: string;
    readonly boardPoints: readonly CanvasPoint2D[];
    readonly strokeWidth?: number;
    readonly color?: string;
  },
): SpatialAttachmentReferenceCard {
  const safeScale = Math.max(0.05, card.scale);
  const localPoints = annotation.boardPoints.map((pt) => ({
    x: (pt.x - card.boardPosition.x) / safeScale,
    y: (pt.y - card.boardPosition.y) / safeScale,
  }));

  const nextStroke: SpatialInkAnnotationStroke = {
    id: annotation.id,
    localPoints,
    strokeWidth: (annotation.strokeWidth ?? 2) / safeScale,
    color: annotation.color ?? "#ff4757",
  };

  return {
    ...card,
    inkAnnotations: [...card.inkAnnotations, nextStroke],
  };
}

/**
 * 공간 레퍼런스 카드의 보드 위치·스케일·핀 상태를 비파괴 업데이트한다.
 */
export function moveAndScaleReferenceCard(
  card: SpatialAttachmentReferenceCard,
  update: {
    readonly boardPosition?: CanvasPoint2D;
    readonly scale?: number;
    readonly pinned?: boolean;
  },
): SpatialAttachmentReferenceCard {
  return {
    ...card,
    boardPosition: update.boardPosition
      ? { ...update.boardPosition }
      : card.boardPosition,
    scale:
      update.scale !== undefined
        ? Math.max(0.05, update.scale)
        : card.scale,
    pinned: update.pinned !== undefined ? update.pinned : card.pinned,
  };
}

/**
 * 카드의 현재 보드 위치와 스케일을 반영해 비파괴 잉크 주석 오버레이의 보드 좌표를 투영한다.
 */
export function projectReferenceCardInkOverlay(
  card: SpatialAttachmentReferenceCard,
): readonly ProjectedBoardInkOverlayStroke[] {
  return card.inkAnnotations.map((ann) => ({
    id: ann.id,
    cardId: card.id,
    boardPoints: ann.localPoints.map((pt) => ({
      x: card.boardPosition.x + pt.x * card.scale,
      y: card.boardPosition.y + pt.y * card.scale,
    })),
    strokeWidth: ann.strokeWidth * card.scale,
    color: ann.color,
  }));
}

/**
 * 레퍼런스 카드 위에 작성된 잉크 주석을 원본 원고 컷(`sourceCutId`, `sourceBounds`)의
 * 절대 좌표계로 역투영(back-projection)한다.
 */
export function projectCardAnnotationToSourceCut(
  card: SpatialAttachmentReferenceCard,
  annotationId?: string,
): readonly ProjectedSourceCutInkStroke[] {
  const targetAnnotations =
    annotationId !== undefined
      ? card.inkAnnotations.filter((a) => a.id === annotationId)
      : card.inkAnnotations;

  return targetAnnotations.map((ann) => ({
    id: ann.id,
    cardId: card.id,
    sourceCutId: card.sourceCutId,
    sourcePoints: ann.localPoints.map((pt) => ({
      x: card.sourceBounds.x + pt.x,
      y: card.sourceBounds.y + pt.y,
    })),
    strokeWidth: ann.strokeWidth,
    color: ann.color,
  }));
}
