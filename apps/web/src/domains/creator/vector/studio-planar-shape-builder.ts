/**
 * Studio Planar Shape Builder & Vector Live Paint Bucket — 평면 배치(DCEL) 면 그래프 엔진.
 *
 * Illustrator Shape Builder(`Shift+M`)와 Vector Live Paint Bucket(`K`)의 핵심 기하학을
 * 순수 TypeScript로 클린룸 구현한다:
 *   1) 갭 닫기(`0 | 2 | 5 | 12px`): 열린 끝점에서 허용 거리 안의 끝점/세그먼트 수선 발로 가상 브리지 연결.
 *   2) X-스윕라인 교차 분할 + 정점 스냅 + 원자 엣지 병합.
 *   3) 정점별 `atan2` 편각 정렬 DCEL 반변 그래프 → 최소 닫힌 면(Face)·구멍(Hole)·인접 그래프·꼬리선 추출.
 *   4) Shape Builder 드래그 합집합(공유 내부 반변 용해) / `Alt` 차집합 & Live Paint 클릭·드래그·꼬리선 트림.
 */

import {
  studioPathSignedArea,
  studioShapeToPolygon,
  type StudioPathBooleanShapeSpec,
  type StudioPathRing,
} from "../studio-path-boolean";

import type { DrawEl } from "../studio-element-model";

export interface PlanarVec2 { readonly x: number; readonly y: number; }
export interface PlanarBounds { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number; }

export const PLANAR_GAP_CLOSE_PRESETS = [0, 2, 5, 12] as const;
export type PlanarGapClosePx = (typeof PLANAR_GAP_CLOSE_PRESETS)[number];

export interface PlanarInputPath { readonly id: string; readonly points: readonly PlanarVec2[]; readonly closed: boolean; }
export interface PlanarVertex { readonly id: number; readonly x: number; readonly y: number; readonly outgoingHalfEdgeIds: readonly number[]; }
export interface PlanarEdge { readonly id: number; readonly v0: number; readonly v1: number; readonly sourcePathIds: readonly string[]; readonly isGapBridge: boolean; }

export interface PlanarHalfEdge {
  readonly id: number;
  readonly edgeId: number;
  readonly origin: number;
  readonly target: number;
  readonly twin: number;
  readonly next: number;
  readonly prev: number;
  readonly faceId: number;
  readonly angleRad: number;
  readonly isGapBridge: boolean;
}

export interface PlanarFace {
  readonly id: number;
  readonly halfEdgeIds: readonly number[];
  readonly polygon: readonly PlanarVec2[];
  readonly holes: readonly (readonly PlanarVec2[])[];
  readonly signedArea: number;
  readonly area: number;
  readonly isUnbounded: boolean;
  readonly centroid: PlanarVec2;
  readonly bounds: PlanarBounds;
  readonly neighborFaceIds: readonly number[];
}

export interface PlanarGapBridge { readonly id: number; readonly from: PlanarVec2; readonly to: PlanarVec2; readonly distancePx: number; }

export interface PlanarArrangement {
  readonly vertices: readonly PlanarVertex[];
  readonly edges: readonly PlanarEdge[];
  readonly halfEdges: readonly PlanarHalfEdge[];
  readonly faces: readonly PlanarFace[];
  readonly boundedFaceIds: readonly number[];
  readonly danglingEdgeIds: readonly number[];
  readonly gapBridges: readonly PlanarGapBridge[];
  readonly gapClosePx: PlanarGapClosePx;
}

export interface BuildPlanarArrangementOptions { readonly gapClosePx?: PlanarGapClosePx; readonly snapTolerancePx?: number; }
export type ShapeBuilderMode = "merge" | "subtract";

export interface ShapeBuilderRegionOutput {
  readonly outer: readonly PlanarVec2[];
  readonly holes: readonly (readonly PlanarVec2[])[];
  readonly flatPoints: readonly number[];
  readonly area: number;
  readonly bounds: PlanarBounds;
  readonly sourceFaceIds: readonly number[];
}

export interface ShapeBuilderSession {
  readonly arrangement: PlanarArrangement;
  readonly mode: ShapeBuilderMode;
  readonly trail: readonly PlanarVec2[];
  readonly selectedFaceIds: readonly number[];
  readonly cursorBadge: "+" | "-";
}

export interface ShapeBuilderCommitResult {
  readonly mode: ShapeBuilderMode;
  readonly affectedFaceIds: readonly number[];
  readonly regions: readonly ShapeBuilderRegionOutput[];
  readonly removedFaceIds: readonly number[];
  readonly remainingFaceIds: readonly number[];
}

export interface LivePaintBucketState {
  readonly arrangement: PlanarArrangement;
  readonly faceFills: Readonly<Record<number, string>>;
  readonly trimmedEdgeIds: readonly number[];
}

export interface LivePaintExportRegion {
  readonly faceId: number;
  readonly fill: string;
  readonly outer: readonly PlanarVec2[];
  readonly holes: readonly (readonly PlanarVec2[])[];
  readonly flatPoints: readonly number[];
  readonly area: number;
  readonly bounds: PlanarBounds;
}

interface RawSegment {
  readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number;
  readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number;
  readonly sourcePathId: string; readonly isGapBridge: boolean;
}

const DEFAULT_SNAP_TOLERANCE = 1e-3;
const EPS = 1e-7;
const MIN_FACE_AREA = 0.05;

const roundCoord = (v: number): number => Math.round(v * 1000) / 1000;
const dist = (a: PlanarVec2, b: PlanarVec2): number => Math.hypot(a.x - b.x, a.y - b.y);

function toFlatPoints(ring: readonly PlanarVec2[], closeLoop = false): number[] {
  const flat: number[] = [];
  for (const pt of ring) flat.push(pt.x, pt.y);
  if (closeLoop && ring[0]) flat.push(ring[0].x, ring[0].y);
  return flat;
}

const computePolygonSignedArea = (ring: readonly PlanarVec2[]): number =>
  studioPathSignedArea(toFlatPoints(ring, false));

function computeBounds(points: readonly PlanarVec2[]): PlanarBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

function computePolygonCentroid(ring: readonly PlanarVec2[]): PlanarVec2 {
  if (ring.length === 0) return { x: 0, y: 0 };
  let area2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const cross = a.x * b.y - b.x * a.y;
    area2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area2) < EPS) {
    return { x: ring.reduce((s, p) => s + p.x, 0) / ring.length, y: ring.reduce((s, p) => s + p.y, 0) / ring.length };
  }
  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}

/** 점-폴리곤 포함 판정 (홀짝 레이캐스팅). */
export function pointInPlanarRing(point: PlanarVec2, ring: readonly PlanarVec2[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i]!, b = ring[j]!;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function pointOnSegmentDist(p: PlanarVec2, a: PlanarVec2, b: PlanarVec2): { readonly dist: number; readonly proj: PlanarVec2 } {
  const dx = b.x - a.x, dy = b.y - a.y, lenSq = dx * dx + dy * dy;
  if (lenSq < EPS * EPS) return { dist: dist(p, a), proj: a };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const proj = { x: a.x + dx * t, y: a.y + dy * t };
  return { dist: dist(p, proj), proj };
}

function findInteriorProbePoint(ring: readonly PlanarVec2[]): PlanarVec2 {
  const centroid = computePolygonCentroid(ring);
  if (pointInPlanarRing(centroid, ring)) return centroid;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < EPS) continue;
    const step = Math.min(0.5, len * 0.1), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const nx = (-dy / len) * step, ny = (dx / len) * step;
    if (pointInPlanarRing({ x: mx + nx, y: my + ny }, ring)) return { x: mx + nx, y: my + ny };
    if (pointInPlanarRing({ x: mx - nx, y: my - ny }, ring)) return { x: mx - nx, y: my - ny };
  }
  return centroid;
}

export function planarPathFromRing(id: string, ring: StudioPathRing, closed = true): PlanarInputPath {
  return { id, points: ring.map(([x, y]) => ({ x, y })), closed };
}

export function planarPathsFromShapeSpec(id: string, spec: StudioPathBooleanShapeSpec): readonly PlanarInputPath[] {
  const converted = studioShapeToPolygon(spec);
  if (!converted.ok) return [];
  return converted.polygon.map((ring, idx) => planarPathFromRing(idx === 0 ? id : `${id}-hole-${idx}`, ring, true));
}

export function planarPathFromDrawEl(el: DrawEl): PlanarInputPath | null {
  if (el.mode === "eraser" || el.points.length < 4) return null;
  const kind = el.kind ?? "freehand";
  if (kind !== "freehand" && kind !== "line" && kind !== "arrow") {
    return planarPathsFromShapeSpec(el.id, { kind, points: el.points, shapeParams: el.shapeParams })[0] ?? null;
  }
  const pts: PlanarVec2[] = [];
  for (let i = 0; i + 1 < el.points.length; i += 2) {
    const x = el.points[i], y = el.points[i + 1];
    if (x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
  }
  if (pts.length < 2) return null;
  return { id: el.id, points: pts, closed: Boolean(el.fill) || dist(pts[0]!, pts[pts.length - 1]!) < 0.5 };
}

function makeRawSegment(ax: number, ay: number, bx: number, by: number, sourcePathId: string, isGapBridge: boolean): RawSegment {
  return { ax, ay, bx, by, minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minY: Math.min(ay, by), maxY: Math.max(ay, by), sourcePathId, isGapBridge };
}

/** 열린 끝점(degree-1)을 탐지해 허용 갭 이내의 가상 브리지를 생성한다. */
function buildGapBridges(
  baseSegments: readonly RawSegment[],
  gapClosePx: PlanarGapClosePx,
  snapTol: number,
): { readonly bridges: readonly PlanarGapBridge[]; readonly bridgeSegments: readonly RawSegment[] } {
  if (gapClosePx <= 0 || baseSegments.length === 0) return { bridges: [], bridgeSegments: [] };
  const buckets = new Map<string, { point: PlanarVec2; degree: number; segIndices: number[] }>();
  const quantKey = (x: number, y: number): string => `${Math.round(x / snapTol)},${Math.round(y / snapTol)}`;
  const reg = (x: number, y: number, idx: number): void => {
    const key = quantKey(x, y);
    const cur = buckets.get(key);
    if (cur) { cur.degree += 1; cur.segIndices.push(idx); }
    else buckets.set(key, { point: { x, y }, degree: 1, segIndices: [idx] });
  };
  baseSegments.forEach((s, idx) => { reg(s.ax, s.ay, idx); reg(s.bx, s.by, idx); });

  const tips = [...buckets.values()].filter((e) => e.degree === 1);
  const bridges: PlanarGapBridge[] = [];
  const bridgeSegments: RawSegment[] = [];
  const paired = new Set<string>();

  for (let i = 0; i < tips.length; i += 1) {
    const tip = tips[i]!, tipKey = quantKey(tip.point.x, tip.point.y);
    if (paired.has(tipKey)) continue;
    let bestTarget: PlanarVec2 | null = null, bestDist = gapClosePx + EPS, bestPeerKey: string | null = null;

    for (let j = i + 1; j < tips.length; j += 1) {
      const peer = tips[j]!, peerKey = quantKey(peer.point.x, peer.point.y);
      if (paired.has(peerKey)) continue;
      const d = dist(tip.point, peer.point);
      if (d > snapTol && d <= bestDist) { bestDist = d; bestTarget = peer.point; bestPeerKey = peerKey; }
    }
    for (let sIdx = 0; sIdx < baseSegments.length; sIdx += 1) {
      if (tip.segIndices.includes(sIdx)) continue;
      const s = baseSegments[sIdx]!;
      const hit = pointOnSegmentDist(tip.point, { x: s.ax, y: s.ay }, { x: s.bx, y: s.by });
      if (hit.dist > snapTol && hit.dist < bestDist) { bestDist = hit.dist; bestTarget = hit.proj; bestPeerKey = null; }
    }
    if (bestTarget && bestDist <= gapClosePx + EPS) {
      const id = bridges.length;
      bridges.push({ id, from: tip.point, to: bestTarget, distancePx: roundCoord(bestDist) });
      bridgeSegments.push(makeRawSegment(tip.point.x, tip.point.y, bestTarget.x, bestTarget.y, `gap-bridge:${id}`, true));
      paired.add(tipKey);
      if (bestPeerKey) paired.add(bestPeerKey);
    }
  }
  return { bridges, bridgeSegments };
}

function intersectSegmentsParams(s1: RawSegment, s2: RawSegment, tol: number): { readonly t1: readonly number[]; readonly t2: readonly number[] } | null {
  if (s1.maxX < s2.minX - tol || s2.maxX < s1.minX - tol || s1.maxY < s2.minY - tol || s2.maxY < s1.minY - tol) return null;
  const r1x = s1.bx - s1.ax, r1y = s1.by - s1.ay, r2x = s2.bx - s2.ax, r2y = s2.by - s2.ay;
  const denom = r1x * r2y - r1y * r2x, qpx = s2.ax - s1.ax, qpy = s2.ay - s1.ay;

  if (Math.abs(denom) > EPS) {
    const t = (qpx * r2y - qpy * r2x) / denom, u = (qpx * r1y - qpy * r1x) / denom;
    if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
      return { t1: [Math.max(0, Math.min(1, t))], t2: [Math.max(0, Math.min(1, u))] };
    }
    return null;
  }

  const len1 = Math.hypot(r1x, r1y);
  if (len1 < EPS || Math.abs(qpx * r1y - qpy * r1x) / len1 > tol) return null;
  const len1Sq = r1x * r1x + r1y * r1y, len2Sq = r2x * r2x + r2y * r2y;
  if (len2Sq < EPS * EPS) return null;
  const t1: number[] = [], t2: number[] = [];
  for (const cand of [((s2.ax - s1.ax) * r1x + (s2.ay - s1.ay) * r1y) / len1Sq, ((s2.bx - s1.ax) * r1x + (s2.by - s1.ay) * r1y) / len1Sq]) {
    if (cand > EPS && cand < 1 - EPS) t1.push(cand);
  }
  for (const cand of [((s1.ax - s2.ax) * r2x + (s1.ay - s2.ay) * r2y) / len2Sq, ((s1.bx - s2.ax) * r2x + (s1.by - s2.ay) * r2y) / len2Sq]) {
    if (cand > EPS && cand < 1 - EPS) t2.push(cand);
  }
  return t1.length > 0 || t2.length > 0 ? { t1, t2 } : null;
}

function stripDanglingSpikes(vertexRing: readonly number[]): number[] {
  const stack: number[] = [];
  for (const vid of vertexRing) {
    if (stack.length >= 2 && stack[stack.length - 2] === vid) stack.pop();
    else stack.push(vid);
  }
  while (stack.length >= 3 && stack[0] === stack[stack.length - 2]) { stack.pop(); stack.shift(); }
  return stack;
}

/** 입력 경로 집합으로부터 교차 분할 → 갭 닫기 → DCEL 평면 면 그래프를 구축한다. */
export function buildPlanarArrangement(paths: readonly PlanarInputPath[], options: BuildPlanarArrangementOptions = {}): PlanarArrangement {
  const gapClosePx = options.gapClosePx ?? 0;
  const snapTol = Math.max(1e-5, options.snapTolerancePx ?? DEFAULT_SNAP_TOLERANCE);

  const baseSegments: RawSegment[] = [];
  for (const path of paths) {
    if (path.points.length < 2) continue;
    const count = path.closed ? path.points.length : path.points.length - 1;
    for (let i = 0; i < count; i += 1) {
      const a = path.points[i]!, b = path.points[(i + 1) % path.points.length]!;
      if (dist(a, b) >= snapTol) baseSegments.push(makeRawSegment(a.x, a.y, b.x, b.y, path.id, false));
    }
  }

  const { bridges: gapBridges, bridgeSegments } = buildGapBridges(baseSegments, gapClosePx, snapTol);
  const allSegments: RawSegment[] = [...baseSegments, ...bridgeSegments];
  if (allSegments.length === 0) {
    return { vertices: [], edges: [], halfEdges: [], faces: [], boundedFaceIds: [], danglingEdgeIds: [], gapBridges, gapClosePx };
  }

  const indexed = allSegments.map((seg, idx) => ({ seg, idx })).sort((a, b) => a.seg.minX - b.seg.minX || a.seg.minY - b.seg.minY);
  const splitsBySeg: number[][] = allSegments.map(() => [0, 1]);
  const active: { readonly seg: RawSegment; readonly idx: number }[] = [];

  for (const item of indexed) {
    for (let k = active.length - 1; k >= 0; k -= 1) {
      if (active[k]!.seg.maxX < item.seg.minX - snapTol) active.splice(k, 1);
    }
    for (const act of active) {
      const hit = intersectSegmentsParams(item.seg, act.seg, snapTol);
      if (!hit) continue;
      splitsBySeg[item.idx]!.push(...hit.t1);
      splitsBySeg[act.idx]!.push(...hit.t2);
    }
    active.push(item);
  }

  const rawVertices: { id: number; x: number; y: number; outgoing: number[] }[] = [];
  const vertexByCell = new Map<string, number>();
  const internVertex = (x: number, y: number): number => {
    const gx = Math.round(x / snapTol), gy = Math.round(y / snapTol);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const hitId = vertexByCell.get(`${gx + dx},${gy + dy}`);
        if (hitId !== undefined && Math.hypot(rawVertices[hitId]!.x - x, rawVertices[hitId]!.y - y) <= snapTol * 1.5) return hitId;
      }
    }
    const id = rawVertices.length;
    rawVertices.push({ id, x: roundCoord(x), y: roundCoord(y), outgoing: [] });
    vertexByCell.set(`${gx},${gy}`, id);
    return id;
  };

  const edgeMap = new Map<string, { id: number; v0: number; v1: number; sources: Set<string>; isGapBridge: boolean }>();
  for (let sIdx = 0; sIdx < allSegments.length; sIdx += 1) {
    const seg = allSegments[sIdx]!, params = splitsBySeg[sIdx]!.sort((a, b) => a - b);
    const deduped: number[] = [];
    for (const t of params) if (deduped.length === 0 || t - deduped[deduped.length - 1]! > 1e-6) deduped.push(t);
    for (let k = 0; k + 1 < deduped.length; k += 1) {
      const tA = deduped[k]!, tB = deduped[k + 1]!;
      const v0 = internVertex(seg.ax + (seg.bx - seg.ax) * tA, seg.ay + (seg.by - seg.ay) * tA);
      const v1 = internVertex(seg.ax + (seg.bx - seg.ax) * tB, seg.ay + (seg.by - seg.ay) * tB);
      if (v0 === v1) continue;
      const key = v0 < v1 ? `${v0}:${v1}` : `${v1}:${v0}`;
      const existing = edgeMap.get(key);
      if (existing) { existing.sources.add(seg.sourcePathId); if (!seg.isGapBridge) existing.isGapBridge = false; }
      else edgeMap.set(key, { id: edgeMap.size, v0: Math.min(v0, v1), v1: Math.max(v0, v1), sources: new Set([seg.sourcePathId]), isGapBridge: seg.isGapBridge });
    }
  }

  const edges: PlanarEdge[] = [...edgeMap.values()].map((e) => ({ id: e.id, v0: e.v0, v1: e.v1, sourcePathIds: [...e.sources], isGapBridge: e.isGapBridge }));
  const halfEdges: { id: number; edgeId: number; origin: number; target: number; twin: number; next: number; prev: number; faceId: number; angleRad: number; isGapBridge: boolean }[] = [];

  for (const edge of edges) {
    const a = rawVertices[edge.v0]!, b = rawVertices[edge.v1]!;
    const idAB = halfEdges.length, idBA = idAB + 1;
    halfEdges.push(
      { id: idAB, edgeId: edge.id, origin: edge.v0, target: edge.v1, twin: idBA, next: -1, prev: -1, faceId: 0, angleRad: Math.atan2(b.y - a.y, b.x - a.x), isGapBridge: edge.isGapBridge },
      { id: idBA, edgeId: edge.id, origin: edge.v1, target: edge.v0, twin: idAB, next: -1, prev: -1, faceId: 0, angleRad: Math.atan2(a.y - b.y, a.x - b.x), isGapBridge: edge.isGapBridge },
    );
    a.outgoing.push(idAB);
    b.outgoing.push(idBA);
  }
  for (const v of rawVertices) v.outgoing.sort((aId, bId) => halfEdges[aId]!.angleRad - halfEdges[bId]!.angleRad || aId - bId);
  for (const he of halfEdges) {
    const out = rawVertices[he.target]!.outgoing;
    const nextHeId = out[(out.indexOf(he.twin) - 1 + out.length) % out.length]!;
    he.next = nextHeId;
    halfEdges[nextHeId]!.prev = he.id;
  }

  interface RawCycle { readonly halfEdgeIds: readonly number[]; readonly polygon: readonly PlanarVec2[]; readonly signedArea: number; readonly absArea: number; readonly probe: PlanarVec2; readonly bounds: PlanarBounds; }
  const visited = new Uint8Array(halfEdges.length);
  const positiveCycles: RawCycle[] = [], negativeCycles: RawCycle[] = [];

  for (let i = 0; i < halfEdges.length; i += 1) {
    if (visited[i]) continue;
    const cycleHeIds: number[] = [], cycleVids: number[] = [];
    let cur = i;
    while (!visited[cur] && cycleHeIds.length <= halfEdges.length) {
      visited[cur] = 1; cycleHeIds.push(cur); cycleVids.push(halfEdges[cur]!.origin); cur = halfEdges[cur]!.next;
    }
    const polygon = stripDanglingSpikes(cycleVids).map((vid) => ({ x: rawVertices[vid]!.x, y: rawVertices[vid]!.y }));
    const signedArea = polygon.length >= 3 ? computePolygonSignedArea(polygon) : 0;
    const absArea = Math.abs(signedArea);
    if (absArea < MIN_FACE_AREA) continue;
    const cycle: RawCycle = { halfEdgeIds: cycleHeIds, polygon, signedArea, absArea, probe: findInteriorProbePoint(polygon), bounds: computeBounds(polygon) };
    if (signedArea > 0) positiveCycles.push(cycle);
    else negativeCycles.push(cycle);
  }

  const boundedHoles: PlanarVec2[][][] = positiveCycles.map(() => []);
  const unboundedHeIds: number[] = [];
  const boundedHeGroups: number[][] = positiveCycles.map((c) => [...c.halfEdgeIds]);

  for (const neg of negativeCycles) {
    let bestParent = -1, bestArea = Infinity;
    for (let pIdx = 0; pIdx < positiveCycles.length; pIdx += 1) {
      const parent = positiveCycles[pIdx]!;
      if (parent.absArea > neg.absArea && parent.absArea < bestArea && pointInPlanarRing(neg.probe, parent.polygon)) {
        bestParent = pIdx; bestArea = parent.absArea;
      }
    }
    if (bestParent >= 0) { boundedHoles[bestParent]!.push([...neg.polygon]); boundedHeGroups[bestParent]!.push(...neg.halfEdgeIds); }
    else unboundedHeIds.push(...neg.halfEdgeIds);
  }

  for (let pIdx = 0; pIdx < boundedHeGroups.length; pIdx += 1) {
    for (const heId of boundedHeGroups[pIdx]!) halfEdges[heId]!.faceId = pIdx + 1;
  }

  const danglingEdgeIds = edges.filter((e) => halfEdges[e.id * 2]!.faceId === halfEdges[e.id * 2 + 1]!.faceId).map((e) => e.id);
  const neighborSets: Set<number>[] = Array.from({ length: positiveCycles.length + 1 }, () => new Set<number>());
  for (const he of halfEdges) {
    const tf = halfEdges[he.twin]!.faceId;
    if (he.faceId !== tf && he.faceId > 0 && tf > 0) neighborSets[he.faceId]!.add(tf);
  }

  const faces: PlanarFace[] = [{
    id: 0, halfEdgeIds: unboundedHeIds, polygon: [], holes: [], signedArea: 0, area: Infinity, isUnbounded: true,
    centroid: { x: 0, y: 0 }, bounds: { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity }, neighborFaceIds: [],
  }];
  const boundedFaceIds: number[] = [];
  for (let pIdx = 0; pIdx < positiveCycles.length; pIdx += 1) {
    const faceId = pIdx + 1, cycle = positiveCycles[pIdx]!, holes = boundedHoles[pIdx]!;
    const holesArea = holes.reduce((acc, h) => acc + Math.abs(computePolygonSignedArea(h)), 0);
    boundedFaceIds.push(faceId);
    faces.push({
      id: faceId, halfEdgeIds: boundedHeGroups[pIdx]!, polygon: cycle.polygon, holes,
      signedArea: roundCoord(cycle.signedArea), area: Math.max(0, roundCoord(cycle.absArea - holesArea)),
      isUnbounded: false, centroid: computePolygonCentroid(cycle.polygon), bounds: cycle.bounds,
      neighborFaceIds: [...neighborSets[faceId]!].sort((a, b) => a - b),
    });
  }

  return {
    vertices: rawVertices.map((v) => ({ id: v.id, x: v.x, y: v.y, outgoingHalfEdgeIds: v.outgoing })),
    edges, halfEdges, faces, boundedFaceIds, danglingEdgeIds, gapBridges, gapClosePx,
  };
}

export function hitTestPlanarFace(arrangement: PlanarArrangement, point: PlanarVec2): PlanarFace | null {
  let hit: PlanarFace | null = null;
  for (const faceId of arrangement.boundedFaceIds) {
    const face = arrangement.faces[faceId]!;
    if (point.x < face.bounds.minX || point.x > face.bounds.maxX || point.y < face.bounds.minY || point.y > face.bounds.maxY) continue;
    if (!pointInPlanarRing(point, face.polygon) || face.holes.some((h) => pointInPlanarRing(point, h))) continue;
    if (!hit || face.area < hit.area) hit = face;
  }
  return hit;
}

export function collectFacesAlongTrail(arrangement: PlanarArrangement, trail: readonly PlanarVec2[], sampleStepPx = 4): readonly number[] {
  const seen = new Set<number>(), ordered: number[] = [];
  const record = (pt: PlanarVec2): void => {
    const face = hitTestPlanarFace(arrangement, pt);
    if (face && !seen.has(face.id)) { seen.add(face.id); ordered.push(face.id); }
  };
  for (let i = 0; i < trail.length; i += 1) {
    const a = trail[i]!, b = trail[i + 1];
    record(a);
    if (!b) continue;
    const steps = Math.max(1, Math.ceil(dist(a, b) / Math.max(1, sampleStepPx)));
    for (let s = 1; s < steps; s += 1) record({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
  }
  return ordered;
}

/** 선택된 DCEL 면 집합의 내부 공유 반변을 용해해 외곽+구멍 복합 패스 목록을 추출한다. */
export function dissolveFacesIntoRegions(arrangement: PlanarArrangement, faceIds: readonly number[]): readonly ShapeBuilderRegionOutput[] {
  const selected = new Set(faceIds.filter((id) => id > 0 && arrangement.faces[id] && !arrangement.faces[id]!.isUnbounded));
  if (selected.size === 0) return [];
  const boundaryHeIds: number[] = [];
  const boundaryByOrigin = new Map<number, number[]>();
  for (const he of arrangement.halfEdges) {
    if (!selected.has(he.faceId) || selected.has(arrangement.halfEdges[he.twin]!.faceId)) continue;
    boundaryHeIds.push(he.id);
    const list = boundaryByOrigin.get(he.origin);
    if (list) list.push(he.id);
    else boundaryByOrigin.set(he.origin, [he.id]);
  }

  const used = new Set<number>();
  const outerRings: { readonly ring: PlanarVec2[]; readonly area: number; readonly bounds: PlanarBounds }[] = [];
  const holeRings: { readonly ring: PlanarVec2[]; readonly area: number; readonly probe: PlanarVec2 }[] = [];

  for (const startId of boundaryHeIds) {
    if (used.has(startId)) continue;
    const loopPoints: PlanarVec2[] = [];
    let curId = startId, guard = 0;
    while (!used.has(curId) && guard <= boundaryHeIds.length) {
      guard += 1; used.add(curId);
      const he = arrangement.halfEdges[curId]!;
      const originV = arrangement.vertices[he.origin]!;
      loopPoints.push({ x: originV.x, y: originV.y });
      const candidates = (boundaryByOrigin.get(he.target) ?? []).filter((cid) => !used.has(cid));
      if (candidates.length === 0) break;
      if (candidates.length === 1) { curId = candidates[0]!; continue; }
      const outgoing = arrangement.vertices[he.target]!.outgoingHalfEdgeIds;
      const twinIdx = outgoing.indexOf(he.twin);
      let picked = candidates[0]!;
      for (let step = 1; step < outgoing.length; step += 1) {
        const candId = outgoing[(twinIdx - step + outgoing.length) % outgoing.length]!;
        if (candidates.includes(candId)) { picked = candId; break; }
      }
      curId = picked;
    }
    if (loopPoints.length < 3) continue;
    const signed = computePolygonSignedArea(loopPoints);
    if (Math.abs(signed) < MIN_FACE_AREA) continue;
    if (signed > 0) outerRings.push({ ring: loopPoints, area: signed, bounds: computeBounds(loopPoints) });
    else holeRings.push({ ring: loopPoints, area: Math.abs(signed), probe: findInteriorProbePoint(loopPoints) });
  }

  const holesByOuter: PlanarVec2[][][] = outerRings.map(() => []);
  for (const hole of holeRings) {
    let bestIdx = -1, bestArea = Infinity;
    for (let i = 0; i < outerRings.length; i += 1) {
      const outer = outerRings[i]!;
      if (outer.area > hole.area && outer.area < bestArea && pointInPlanarRing(hole.probe, outer.ring)) { bestIdx = i; bestArea = outer.area; }
    }
    if (bestIdx >= 0) holesByOuter[bestIdx]!.push(hole.ring);
  }

  return outerRings.map((outer, idx) => {
    const holes = holesByOuter[idx]!;
    const holeArea = holes.reduce((acc, h) => acc + Math.abs(computePolygonSignedArea(h)), 0);
    const matched = [...selected].filter((fid) => pointInPlanarRing(arrangement.faces[fid]!.centroid, outer.ring));
    return { outer: outer.ring, holes, flatPoints: toFlatPoints(outer.ring, true), area: Math.max(0, roundCoord(outer.area - holeArea)), bounds: outer.bounds, sourceFaceIds: matched.length > 0 ? matched : [...selected] };
  });
}

export function beginShapeBuilderSession(arrangement: PlanarArrangement, startPoint: PlanarVec2, altKey = false): ShapeBuilderSession {
  const mode: ShapeBuilderMode = altKey ? "subtract" : "merge";
  return { arrangement, mode, trail: [startPoint], selectedFaceIds: collectFacesAlongTrail(arrangement, [startPoint]), cursorBadge: mode === "merge" ? "+" : "-" };
}

export function updateShapeBuilderSession(session: ShapeBuilderSession, nextPoint: PlanarVec2, altKey?: boolean): ShapeBuilderSession {
  const mode: ShapeBuilderMode = altKey === undefined ? session.mode : altKey ? "subtract" : "merge";
  const newlyHit = collectFacesAlongTrail(session.arrangement, [session.trail[session.trail.length - 1] ?? nextPoint, nextPoint]);
  const mergedSet = new Set(session.selectedFaceIds);
  const selectedFaceIds = [...session.selectedFaceIds];
  for (const fid of newlyHit) if (!mergedSet.has(fid)) { mergedSet.add(fid); selectedFaceIds.push(fid); }
  return { arrangement: session.arrangement, mode, trail: [...session.trail, nextPoint], selectedFaceIds, cursorBadge: mode === "merge" ? "+" : "-" };
}

export function commitShapeBuilderSession(session: ShapeBuilderSession): ShapeBuilderCommitResult {
  const selectedSet = new Set(session.selectedFaceIds);
  if (session.mode === "subtract") {
    const remainingFaceIds = session.arrangement.boundedFaceIds.filter((id) => !selectedSet.has(id));
    return { mode: "subtract", affectedFaceIds: session.selectedFaceIds, regions: dissolveFacesIntoRegions(session.arrangement, remainingFaceIds), removedFaceIds: session.selectedFaceIds, remainingFaceIds };
  }
  return { mode: "merge", affectedFaceIds: session.selectedFaceIds, regions: dissolveFacesIntoRegions(session.arrangement, session.selectedFaceIds), removedFaceIds: [], remainingFaceIds: session.arrangement.boundedFaceIds.filter((id) => !selectedSet.has(id)) };
}

export function createLivePaintBucketState(arrangement: PlanarArrangement): LivePaintBucketState {
  return { arrangement, faceFills: {}, trimmedEdgeIds: [] };
}

export function livePaintBucketClick(state: LivePaintBucketState, point: PlanarVec2, fillColor: string): { readonly state: LivePaintBucketState; readonly paintedFaceId: number | null } {
  const face = hitTestPlanarFace(state.arrangement, point);
  if (!face) return { state, paintedFaceId: null };
  return { state: { ...state, faceFills: { ...state.faceFills, [face.id]: fillColor } }, paintedFaceId: face.id };
}

export function livePaintBucketDrag(state: LivePaintBucketState, trail: readonly PlanarVec2[], fillColor: string): { readonly state: LivePaintBucketState; readonly paintedFaceIds: readonly number[] } {
  const faceIds = collectFacesAlongTrail(state.arrangement, trail);
  if (faceIds.length === 0) return { state, paintedFaceIds: [] };
  const nextFills: Record<number, string> = { ...state.faceFills };
  for (const fid of faceIds) nextFills[fid] = fillColor;
  return { state: { ...state, faceFills: nextFills }, paintedFaceIds: faceIds };
}

export function trimDanglingEdgeAtPoint(state: LivePaintBucketState, point: PlanarVec2, tolerancePx = 8): { readonly state: LivePaintBucketState; readonly trimmedEdgeId: number | null } {
  const trimmed = new Set(state.trimmedEdgeIds);
  let bestEdgeId: number | null = null, bestDist = Math.max(0.5, tolerancePx);
  for (const edgeId of state.arrangement.danglingEdgeIds) {
    if (trimmed.has(edgeId)) continue;
    const edge = state.arrangement.edges[edgeId]!;
    const hit = pointOnSegmentDist(point, state.arrangement.vertices[edge.v0]!, state.arrangement.vertices[edge.v1]!);
    if (hit.dist <= bestDist) { bestDist = hit.dist; bestEdgeId = edgeId; }
  }
  if (bestEdgeId === null) return { state, trimmedEdgeId: null };
  return { state: { ...state, trimmedEdgeIds: [...state.trimmedEdgeIds, bestEdgeId] }, trimmedEdgeId: bestEdgeId };
}

export function exportLivePaintVectorRegions(state: LivePaintBucketState): readonly LivePaintExportRegion[] {
  const out: LivePaintExportRegion[] = [];
  for (const faceId of state.arrangement.boundedFaceIds) {
    const fill = state.faceFills[faceId];
    if (!fill) continue;
    const face = state.arrangement.faces[faceId]!;
    out.push({ faceId, fill, outer: face.polygon, holes: face.holes, flatPoints: toFlatPoints(face.polygon, true), area: face.area, bounds: face.bounds });
  }
  return out;
}
