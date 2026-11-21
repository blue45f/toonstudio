/**
 * PPT 도형 기하 변환 및 5종 불리언(Union · Subtract · Intersect · Fragment · Combine) 엔진.
 *
 * 평면 직선 그래프(PSLG) 분할과 반변(Half-Edge) 순회로 오목 다각형(말풍선 등),
 * 중첩 포함(내부 구멍 evenodd), 부분 겹침 도형의 정확한 SVG 경로와 면적을 산출한다.
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

export type ShapeKind =
  | "rect"
  | "rounded-rect"
  | "ellipse"
  | "diamond"
  | "speech-bubble"
  | "polygon";

export interface CanvasShapeObject {
  readonly id: string;
  readonly label: string;
  readonly kind: ShapeKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zIndex: number;
  readonly groupId: string | null;
  readonly locked?: boolean;
  readonly fillToken?: string;
}

export type BooleanShapeOp =
  | "union"
  | "subtract"
  | "intersect"
  | "fragment"
  | "combine";

export interface BooleanResultPiece {
  readonly id: string;
  readonly role: "merged" | "a-only" | "b-only" | "overlap" | "xor";
  readonly polygons: readonly (readonly Point2D[])[];
  readonly svgPath: string;
  readonly areaPx2: number;
  readonly bounds: Rect2D;
}

export interface BooleanOperationResult {
  readonly operation: BooleanShapeOp;
  readonly combinedSvgPath: string;
  readonly fillRule: "nonzero" | "evenodd";
  readonly pieces: readonly BooleanResultPiece[];
  readonly totalAreaPx2: number;
  readonly overlapAreaPx2: number;
  readonly bounds: Rect2D;
}

const GEOM_EPS = 1e-6;
const VERTEX_MERGE_EPS = 1e-3;

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cross2D(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x;
}

function distance2D(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function shapeToPolygon(shape: CanvasShapeObject, segments = 24): readonly Point2D[] {
  const { x, y, width, height, kind } = shape;
  if (kind === "rect") {
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
  }
  if (kind === "diamond") {
    return [
      { x: x + width / 2, y },
      { x: x + width, y: y + height / 2 },
      { x: x + width / 2, y: y + height },
      { x, y: y + height / 2 },
    ];
  }
  if (kind === "rounded-rect") {
    const r = Math.min(width, height) * 0.2;
    const pts: Point2D[] = [];
    const corners: readonly { cx: number; cy: number; start: number; end: number }[] = [
      { cx: x + width - r, cy: y + r, start: -Math.PI / 2, end: 0 },
      { cx: x + width - r, cy: y + height - r, start: 0, end: Math.PI / 2 },
      { cx: x + r, cy: y + height - r, start: Math.PI / 2, end: Math.PI },
      { cx: x + r, cy: y + r, start: Math.PI, end: (3 * Math.PI) / 2 },
    ];
    for (const corner of corners) {
      for (let i = 0; i <= 4; i += 1) {
        const angle = corner.start + ((corner.end - corner.start) * i) / 4;
        pts.push({
          x: roundMetric(corner.cx + Math.cos(angle) * r),
          y: roundMetric(corner.cy + Math.sin(angle) * r),
        });
      }
    }
    return pts;
  }
  if (kind === "speech-bubble") {
    const bodyH = height * 0.78;
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + bodyH },
      { x: x + width * 0.42, y: y + bodyH },
      { x: x + width * 0.22, y: y + height },
      { x: x + width * 0.26, y: y + bodyH },
      { x, y: y + bodyH },
    ];
  }
  const count = kind === "polygon" ? 6 : Math.max(12, segments);
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const pts: Point2D[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count;
    pts.push({
      x: roundMetric(cx + Math.cos(angle) * rx),
      y: roundMetric(cy + Math.sin(angle) * ry),
    });
  }
  return pts;
}

export function polygonToSvgPath(polygon: readonly Point2D[]): string {
  if (polygon.length === 0) return "";
  const commands = polygon.map(
    (pt, index) => `${index === 0 ? "M" : "L"} ${roundMetric(pt.x)} ${roundMetric(pt.y)}`,
  );
  return `${commands.join(" ")} Z`;
}

function signedPolygonArea(poly: readonly Point2D[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const curr = poly[i];
    const next = poly[(i + 1) % poly.length];
    area += curr.x * next.y - next.x * curr.y;
  }
  return area / 2;
}

function ensurePositiveOrientation(poly: readonly Point2D[]): readonly Point2D[] {
  return signedPolygonArea(poly) < 0 ? [...poly].reverse() : poly;
}

function pointInPolygon(pt: Point2D, poly: readonly Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-18) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointToSegmentDistance(pt: Point2D, a: Point2D, b: Point2D): { dist: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= GEOM_EPS * GEOM_EPS) {
    return { dist: distance2D(pt, a), t: 0 };
  }
  const t = clamp(((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq, 0, 1);
  return { dist: distance2D(pt, { x: a.x + t * dx, y: a.y + t * dy }), t };
}

function splitPolygonEdges(
  source: readonly Point2D[],
  cutter: readonly Point2D[],
): readonly (readonly [Point2D, Point2D])[] {
  const result: [Point2D, Point2D][] = [];
  for (let i = 0; i < source.length; i += 1) {
    const p1 = source[i];
    const p2 = source[(i + 1) % source.length];
    const d1 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const ts: number[] = [0, 1];

    for (let j = 0; j < cutter.length; j += 1) {
      const p3 = cutter[j];
      const p4 = cutter[(j + 1) % cutter.length];
      const d2 = { x: p4.x - p3.x, y: p4.y - p3.y };
      const denom = cross2D(d1, d2);
      if (Math.abs(denom) > GEOM_EPS) {
        const diff = { x: p3.x - p1.x, y: p3.y - p1.y };
        const t = cross2D(diff, d2) / denom;
        const u = cross2D(diff, d1) / denom;
        if (t >= -1e-5 && t <= 1 + 1e-5 && u >= -1e-5 && u <= 1 + 1e-5) {
          ts.push(clamp(t, 0, 1));
        }
      } else {
        const hit3 = pointToSegmentDistance(p3, p1, p2);
        if (hit3.dist <= VERTEX_MERGE_EPS) ts.push(hit3.t);
        const hit4 = pointToSegmentDistance(p4, p1, p2);
        if (hit4.dist <= VERTEX_MERGE_EPS) ts.push(hit4.t);
      }
    }

    ts.sort((a, b) => a - b);
    const deduped: number[] = [];
    for (const t of ts) {
      if (deduped.length === 0 || t - deduped[deduped.length - 1] > 1e-5) {
        deduped.push(t);
      }
    }
    for (let k = 0; k < deduped.length - 1; k += 1) {
      const a = { x: p1.x + d1.x * deduped[k], y: p1.y + d1.y * deduped[k] };
      const b = { x: p1.x + d1.x * deduped[k + 1], y: p1.y + d1.y * deduped[k + 1] };
      if (distance2D(a, b) > VERTEX_MERGE_EPS) {
        result.push([a, b]);
      }
    }
  }
  return result;
}

interface ArrangementFace {
  readonly id: number;
  readonly polygon: readonly Point2D[];
  readonly signedArea: number;
  inA: boolean;
  inB: boolean;
}

interface HalfEdge {
  readonly index: number;
  readonly from: number;
  readonly to: number;
  readonly twin: number;
  readonly angle: number;
  faceId: number;
}

function sampleInteriorPoint(poly: readonly Point2D[], forbiddenHoles: readonly (readonly Point2D[])[]): Point2D {
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len <= VERTEX_MERGE_EPS) continue;
    const nx = -dy / len;
    const ny = dx / len;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    for (const scale of [0.25, 0.05, 0.01, 0.002]) {
      const probe = { x: mid.x + nx * len * scale, y: mid.y + ny * len * scale };
      if (pointInPolygon(probe, poly) && forbiddenHoles.every((hole) => !pointInPolygon(probe, hole))) {
        return probe;
      }
    }
  }
  const cx = poly.reduce((acc, p) => acc + p.x, 0) / poly.length;
  const cy = poly.reduce((acc, p) => acc + p.y, 0) / poly.length;
  return { x: cx, y: cy };
}

function computePolygonBounds(polygons: readonly (readonly Point2D[])[]): Rect2D {
  const allPts = polygons.flat();
  if (allPts.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...allPts.map((p) => p.x));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxY = Math.max(...allPts.map((p) => p.y));
  return {
    x: roundMetric(minX),
    y: roundMetric(minY),
    width: roundMetric(maxX - minX),
    height: roundMetric(maxY - minY),
  };
}

function stitchBoundaryLoops(
  vertices: readonly Point2D[],
  keptEdges: readonly HalfEdge[],
): readonly (readonly Point2D[])[] {
  const outgoing = new Map<number, HalfEdge[]>();
  for (const edge of keptEdges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }
  const used = new Set<number>();
  const loops: Point2D[][] = [];

  for (const startEdge of keptEdges) {
    if (used.has(startEdge.index)) continue;
    const loop: Point2D[] = [];
    let curr: HalfEdge | undefined = startEdge;
    let guard = 0;
    while (curr && !used.has(curr.index) && guard <= keptEdges.length + 2) {
      used.add(curr.index);
      loop.push({ x: roundMetric(vertices[curr.from].x), y: roundMetric(vertices[curr.from].y) });
      curr = (outgoing.get(curr.to) ?? []).find((e) => !used.has(e.index));
      guard += 1;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function buildPlanarArrangement(polyAInput: readonly Point2D[], polyBInput: readonly Point2D[]) {
  const polyA = ensurePositiveOrientation(polyAInput);
  const polyB = ensurePositiveOrientation(polyBInput);
  const rawSegments = [...splitPolygonEdges(polyA, polyB), ...splitPolygonEdges(polyB, polyA)];

  const vertices: Point2D[] = [];
  const getVertexIndex = (pt: Point2D): number => {
    for (let i = 0; i < vertices.length; i += 1) {
      if (distance2D(vertices[i], pt) <= VERTEX_MERGE_EPS) return i;
    }
    vertices.push(pt);
    return vertices.length - 1;
  };

  const uniqueEdgeKeys = new Set<string>();
  const undirectedEdges: [number, number][] = [];
  for (const [a, b] of rawSegments) {
    const u = getVertexIndex(a);
    const v = getVertexIndex(b);
    if (u === v) continue;
    const key = u < v ? `${u}:${v}` : `${v}:${u}`;
    if (uniqueEdgeKeys.has(key)) continue;
    uniqueEdgeKeys.add(key);
    undirectedEdges.push([u, v]);
  }

  const halfEdges: HalfEdge[] = [];
  const outgoingByVertex: number[][] = vertices.map(() => []);
  for (const [u, v] of undirectedEdges) {
    const idx1 = halfEdges.length;
    const idx2 = idx1 + 1;
    halfEdges.push({
      index: idx1,
      from: u,
      to: v,
      twin: idx2,
      angle: Math.atan2(vertices[v].y - vertices[u].y, vertices[v].x - vertices[u].x),
      faceId: -1,
    });
    halfEdges.push({
      index: idx2,
      from: v,
      to: u,
      twin: idx1,
      angle: Math.atan2(vertices[u].y - vertices[v].y, vertices[u].x - vertices[v].x),
      faceId: -1,
    });
    outgoingByVertex[u].push(idx1);
    outgoingByVertex[v].push(idx2);
  }

  for (const list of outgoingByVertex) {
    list.sort((a, b) => halfEdges[a].angle - halfEdges[b].angle);
  }

  const visited = new Uint8Array(halfEdges.length);
  const faces: ArrangementFace[] = [];
  for (let i = 0; i < halfEdges.length; i += 1) {
    if (visited[i]) continue;
    const cycleEdges: number[] = [];
    const cyclePts: Point2D[] = [];
    let curr = i;
    let guard = 0;
    while (!visited[curr] && guard <= halfEdges.length) {
      visited[curr] = 1;
      cycleEdges.push(curr);
      cyclePts.push(vertices[halfEdges[curr].from]);
      const out = outgoingByVertex[halfEdges[curr].to];
      const pos = out.indexOf(halfEdges[curr].twin);
      curr = out[(pos - 1 + out.length) % out.length];
      guard += 1;
    }
    const faceId = faces.length;
    for (const edgeIdx of cycleEdges) halfEdges[edgeIdx].faceId = faceId;
    faces.push({
      id: faceId,
      polygon: cyclePts,
      signedArea: signedPolygonArea(cyclePts),
      inA: false,
      inB: false,
    });
  }

  const positiveFaces = faces.filter((f) => f.signedArea > 1e-3);
  for (const face of positiveFaces) {
    const nestedHoles = positiveFaces
      .filter((other) => other.id !== face.id && other.signedArea < face.signedArea)
      .map((other) => other.polygon);
    const sample = sampleInteriorPoint(face.polygon, nestedHoles);
    face.inA = pointInPolygon(sample, polyA);
    face.inB = pointInPolygon(sample, polyB);
  }

  for (const face of faces) {
    if (face.signedArea > 1e-3) continue;
    const probe = face.polygon[0];
    let parent: ArrangementFace | null = null;
    for (const candidate of positiveFaces) {
      if (candidate.signedArea <= Math.abs(face.signedArea) + 1e-3) continue;
      if (pointInPolygon(probe, candidate.polygon) && (!parent || candidate.signedArea < parent.signedArea)) {
        parent = candidate;
      }
    }
    if (parent) {
      face.inA = parent.inA;
      face.inB = parent.inB;
    }
  }

  return { vertices, halfEdges, faces };
}

function extractBooleanPiece(
  id: string,
  role: BooleanResultPiece["role"],
  vertices: readonly Point2D[],
  halfEdges: readonly HalfEdge[],
  faces: readonly ArrangementFace[],
  predicate: (face: ArrangementFace) => boolean,
): BooleanResultPiece | null {
  const boundaryEdges = halfEdges.filter((edge) => {
    const ownFace = faces[edge.faceId];
    const twinFace = faces[halfEdges[edge.twin].faceId];
    return Boolean(ownFace && twinFace && predicate(ownFace) && !predicate(twinFace));
  });
  if (boundaryEdges.length === 0) return null;
  const polygons = stitchBoundaryLoops(vertices, boundaryEdges);
  const areaPx2 = roundMetric(Math.abs(polygons.reduce((acc, loop) => acc + signedPolygonArea(loop), 0)));
  return {
    id,
    role,
    polygons,
    svgPath: polygons.map(polygonToSvgPath).join(" "),
    areaPx2,
    bounds: computePolygonBounds(polygons),
  };
}

export function executeBooleanShapeOp(
  shapeA: CanvasShapeObject,
  shapeB: CanvasShapeObject,
  operation: BooleanShapeOp,
): BooleanOperationResult {
  const { vertices, halfEdges, faces } = buildPlanarArrangement(shapeToPolygon(shapeA), shapeToPolygon(shapeB));
  const overlapPiece = extractBooleanPiece("overlap", "overlap", vertices, halfEdges, faces, (f) => f.inA && f.inB);
  const pieces: BooleanResultPiece[] = [];

  if (operation === "union") {
    const merged = extractBooleanPiece("union-merged", "merged", vertices, halfEdges, faces, (f) => f.inA || f.inB);
    if (merged) pieces.push(merged);
  } else if (operation === "subtract") {
    const sub = extractBooleanPiece("subtract-a-minus-b", "a-only", vertices, halfEdges, faces, (f) => f.inA && !f.inB);
    if (sub) pieces.push(sub);
  } else if (operation === "intersect") {
    if (overlapPiece) pieces.push(overlapPiece);
  } else if (operation === "combine") {
    const xorPiece = extractBooleanPiece("combine-xor", "xor", vertices, halfEdges, faces, (f) => f.inA !== f.inB);
    if (xorPiece) pieces.push(xorPiece);
  } else {
    const aOnly = extractBooleanPiece("fragment-a-only", "a-only", vertices, halfEdges, faces, (f) => f.inA && !f.inB);
    const bOnly = extractBooleanPiece("fragment-b-only", "b-only", vertices, halfEdges, faces, (f) => !f.inA && f.inB);
    if (aOnly) pieces.push(aOnly);
    if (overlapPiece) pieces.push(overlapPiece);
    if (bOnly) pieces.push(bOnly);
  }

  const allPolygons = pieces.flatMap((piece) => piece.polygons);
  return {
    operation,
    combinedSvgPath: pieces.map((piece) => piece.svgPath).filter(Boolean).join(" "),
    fillRule: "evenodd",
    pieces,
    totalAreaPx2: roundMetric(pieces.reduce((acc, piece) => acc + piece.areaPx2, 0)),
    overlapAreaPx2: overlapPiece?.areaPx2 ?? 0,
    bounds: computePolygonBounds(allPolygons),
  };
}
