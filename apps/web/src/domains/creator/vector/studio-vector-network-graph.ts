/**
 * Studio Vector Network Graph — Figma식 비트리 평면 반변(Half-Edge) 벡터 네트워크 엔진.
 *
 * 차수 `deg(v) >= 3` 다중 분기 정점(T/Y분기·격자·마법진)을 표현하고,
 * 정점별 출발 접선 `atan2` 편각 정렬 반변 순회로 최소 순환 기저(Minimal Cycle Basis)
 * 닫힌 채움 영역(`Region`)과 구멍(Hole)을 `O(|E| log |E|)`로 자동 추출한다.
 * 또한 3차 베지어 de Casteljau 교차 분할, 정점 드래그 증분 재계산, `DrawEl` 양방향 어댑터를 제공한다.
 */

import { studioPathSignedArea } from "../studio-path-boolean";

import type { DrawEl } from "../studio-element-model";

export interface VectorNetworkVec2 { readonly x: number; readonly y: number; }
export interface VectorNetworkBounds { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number; }

export interface VectorNetworkVertex {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly cornerRadiusPx?: number;
  readonly strokeJoin?: "miter" | "round" | "bevel";
}

export interface VectorNetworkSegment {
  readonly id: string;
  readonly start: string;
  readonly end: string;
  readonly tangentStart: VectorNetworkVec2;
  readonly tangentEnd: VectorNetworkVec2;
  readonly widthProfileRef?: string;
}

export interface VectorNetworkFillSpec {
  readonly kind: "solid" | "none";
  readonly color?: string;
  readonly opacity?: number;
}

export interface VectorNetworkRegion {
  readonly id: string;
  readonly loopSegmentIds: readonly (readonly string[])[];
  readonly loopVertexIds: readonly (readonly string[])[];
  readonly windingRule: "nonzero" | "evenodd";
  readonly fill: VectorNetworkFillSpec;
  readonly sampledOuter: readonly VectorNetworkVec2[];
  readonly sampledHoles: readonly (readonly VectorNetworkVec2[])[];
  readonly area: number;
  readonly centroid: VectorNetworkVec2;
  readonly bounds: VectorNetworkBounds;
}

export interface StudioVectorNetworkV1 {
  readonly version: 1;
  readonly vertices: Readonly<Record<string, VectorNetworkVertex>>;
  readonly segments: Readonly<Record<string, VectorNetworkSegment>>;
  readonly regions: Readonly<Record<string, VectorNetworkRegion>>;
}

export interface NetworkHalfEdge {
  readonly id: string;
  readonly segmentId: string;
  readonly forward: boolean;
  readonly origin: string;
  readonly target: string;
  readonly twinId: string;
  readonly departureAngleRad: number;
}

export interface IncrementalVertexMoveResult {
  readonly network: StudioVectorNetworkV1;
  readonly affectedSegmentIds: readonly string[];
  readonly affectedRegionIds: readonly string[];
  readonly untouchedRegionIds: readonly string[];
}

export interface SplitIntersectionsResult {
  readonly network: StudioVectorNetworkV1;
  readonly insertedVertexIds: readonly string[];
  readonly splitSegmentCount: number;
}

const EPS = 1e-7;
const MIN_REGION_AREA = 0.05;
const DEFAULT_CURVE_STEPS = 12;

const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const isZeroVec = (v: VectorNetworkVec2): boolean => Math.abs(v.x) < EPS && Math.abs(v.y) < EPS;
const segmentIsStraight = (seg: VectorNetworkSegment): boolean => isZeroVec(seg.tangentStart) && isZeroVec(seg.tangentEnd);

export function evaluateCubicBezier(p0: VectorNetworkVec2, p1: VectorNetworkVec2, p2: VectorNetworkVec2, p3: VectorNetworkVec2, t: number): VectorNetworkVec2 {
  const mt = 1 - t, mt2 = mt * mt, t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

export function splitCubicBezierAt(p0: VectorNetworkVec2, p1: VectorNetworkVec2, p2: VectorNetworkVec2, p3: VectorNetworkVec2, t: number): {
  readonly left: readonly [VectorNetworkVec2, VectorNetworkVec2, VectorNetworkVec2, VectorNetworkVec2];
  readonly right: readonly [VectorNetworkVec2, VectorNetworkVec2, VectorNetworkVec2, VectorNetworkVec2];
} {
  const lerp = (a: VectorNetworkVec2, b: VectorNetworkVec2): VectorNetworkVec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const q0 = lerp(p0, p1), q1 = lerp(p1, p2), q2 = lerp(p2, p3);
  const r0 = lerp(q0, q1), r1 = lerp(q1, q2), mid = lerp(r0, r1);
  return { left: [p0, q0, r0, mid], right: [mid, r1, q2, p3] };
}

function segmentControlPoints(net: StudioVectorNetworkV1, seg: VectorNetworkSegment): readonly [VectorNetworkVec2, VectorNetworkVec2, VectorNetworkVec2, VectorNetworkVec2] | null {
  const s = net.vertices[seg.start], e = net.vertices[seg.end];
  if (!s || !e) return null;
  const p0 = { x: s.x, y: s.y }, p3 = { x: e.x, y: e.y };
  return [p0, { x: p0.x + seg.tangentStart.x, y: p0.y + seg.tangentStart.y }, { x: p3.x + seg.tangentEnd.x, y: p3.y + seg.tangentEnd.y }, p3];
}

function sampleSegmentPoints(net: StudioVectorNetworkV1, seg: VectorNetworkSegment, forward: boolean, curveSteps = DEFAULT_CURVE_STEPS): VectorNetworkVec2[] {
  const cp = segmentControlPoints(net, seg);
  if (!cp) return [];
  const steps = segmentIsStraight(seg) ? 1 : Math.max(2, curveSteps);
  const pts: VectorNetworkVec2[] = [];
  for (let i = 0; i < steps; i += 1) pts.push(evaluateCubicBezier(cp[0], cp[1], cp[2], cp[3], forward ? i / steps : 1 - i / steps));
  return pts;
}

function computePointsBounds(pts: readonly VectorNetworkVec2[]): VectorNetworkBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of pts) {
    if (pt.x < minX) minX = pt.x; if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x; if (pt.y > maxY) maxY = pt.y;
  }
  return Number.isFinite(minX) ? { minX: round3(minX), minY: round3(minY), maxX: round3(maxX), maxY: round3(maxY) } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

function signedAreaOfPoints(pts: readonly VectorNetworkVec2[]): number {
  const flat: number[] = [];
  for (const p of pts) flat.push(p.x, p.y);
  return studioPathSignedArea(flat);
}

function centroidOfPoints(pts: readonly VectorNetworkVec2[]): VectorNetworkVec2 {
  if (pts.length === 0) return { x: 0, y: 0 };
  let area2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!, cross = a.x * b.y - b.x * a.y;
    area2 += cross; cx += (a.x + b.x) * cross; cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area2) < EPS) return { x: round3(pts.reduce((s, p) => s + p.x, 0) / pts.length), y: round3(pts.reduce((s, p) => s + p.y, 0) / pts.length) };
  return { x: round3(cx / (3 * area2)), y: round3(cy / (3 * area2)) };
}

function pointInPolygon(pt: VectorNetworkVec2, ring: readonly VectorNetworkVec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i]!, b = ring[j]!;
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function createEmptyVectorNetwork(): StudioVectorNetworkV1 {
  return { version: 1, vertices: {}, segments: {}, regions: {} };
}

export function addNetworkVertex(net: StudioVectorNetworkV1, vertex: VectorNetworkVertex): StudioVectorNetworkV1 {
  return { ...net, vertices: { ...net.vertices, [vertex.id]: { ...vertex, x: round3(vertex.x), y: round3(vertex.y) } } };
}

export function addNetworkSegment(net: StudioVectorNetworkV1, segment: VectorNetworkSegment): StudioVectorNetworkV1 {
  if (!net.vertices[segment.start] || !net.vertices[segment.end] || segment.start === segment.end) return net;
  return { ...net, segments: { ...net.segments, [segment.id]: segment } };
}

export function removeNetworkSegment(net: StudioVectorNetworkV1, segmentId: string): StudioVectorNetworkV1 {
  if (!net.segments[segmentId]) return net;
  const nextSegments: Record<string, VectorNetworkSegment> = {};
  for (const [id, seg] of Object.entries(net.segments)) if (id !== segmentId) nextSegments[id] = seg;
  return extractVectorNetworkRegions({ ...net, segments: nextSegments });
}

export function removeNetworkVertex(net: StudioVectorNetworkV1, vertexId: string): StudioVectorNetworkV1 {
  if (!net.vertices[vertexId]) return net;
  const nextVertices: Record<string, VectorNetworkVertex> = {};
  for (const [id, v] of Object.entries(net.vertices)) if (id !== vertexId) nextVertices[id] = v;
  const nextSegments: Record<string, VectorNetworkSegment> = {};
  for (const [id, seg] of Object.entries(net.segments)) if (seg.start !== vertexId && seg.end !== vertexId) nextSegments[id] = seg;
  return extractVectorNetworkRegions({ ...net, vertices: nextVertices, segments: nextSegments });
}

export function getIncidentSegmentIds(net: StudioVectorNetworkV1, vertexId: string): readonly string[] {
  return Object.values(net.segments).filter((s) => s.start === vertexId || s.end === vertexId).map((s) => s.id);
}

export function getVertexDegree(net: StudioVectorNetworkV1, vertexId: string): number {
  return getIncidentSegmentIds(net, vertexId).length;
}

function lineSegIntersect(a0: VectorNetworkVec2, a1: VectorNetworkVec2, b0: VectorNetworkVec2, b1: VectorNetworkVec2): { readonly t: number; readonly u: number } | null {
  const r1x = a1.x - a0.x, r1y = a1.y - a0.y, r2x = b1.x - b0.x, r2y = b1.y - b0.y, denom = r1x * r2y - r1y * r2x;
  if (Math.abs(denom) < EPS) return null;
  const qpx = b0.x - a0.x, qpy = b0.y - a0.y, t = (qpx * r2y - qpy * r2x) / denom, u = (qpx * r1y - qpy * r1x) / denom;
  return t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4 ? { t, u } : null;
}

/** 세그먼트 교차점에 가상 정점을 자동 삽입하고 de Casteljau로 곡선을 분할한다. */
export function splitVectorNetworkIntersections(
  net: StudioVectorNetworkV1,
  options?: { readonly curveSubdivisions?: number; readonly snapTolerancePx?: number },
): SplitIntersectionsResult {
  const segList = Object.values(net.segments);
  const sub = Math.max(4, options?.curveSubdivisions ?? 16), snapTol = Math.max(1e-3, options?.snapTolerancePx ?? 0.5);

  const sampled = segList.map((seg) => {
    const cp = segmentControlPoints(net, seg);
    if (!cp) return { seg, pts: [] as VectorNetworkVec2[], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, steps: 1 };
    const steps = segmentIsStraight(seg) ? 1 : sub, pts: VectorNetworkVec2[] = [];
    for (let i = 0; i <= steps; i += 1) pts.push(evaluateCubicBezier(cp[0], cp[1], cp[2], cp[3], i / steps));
    return { seg, pts, bounds: computePointsBounds(pts), steps };
  });

  const splits = new Map<string, number[]>();
  const addSplit = (id: string, t: number): void => {
    if (t <= 1e-3 || t >= 1 - 1e-3) return;
    const arr = splits.get(id);
    if (arr) arr.push(t); else splits.set(id, [t]);
  };

  for (let i = 0; i < sampled.length; i += 1) {
    const a = sampled[i]!;
    for (let j = i + 1; j < sampled.length; j += 1) {
      const b = sampled[j]!;
      if (a.bounds.maxX < b.bounds.minX - snapTol || b.bounds.maxX < a.bounds.minX - snapTol || a.bounds.maxY < b.bounds.minY - snapTol || b.bounds.maxY < a.bounds.minY - snapTol) continue;
      const shareEnd = a.seg.start === b.seg.start || a.seg.start === b.seg.end || a.seg.end === b.seg.start || a.seg.end === b.seg.end;
      for (let sa = 0; sa < a.steps; sa += 1) {
        for (let sb = 0; sb < b.steps; sb += 1) {
          const hit = lineSegIntersect(a.pts[sa]!, a.pts[sa + 1]!, b.pts[sb]!, b.pts[sb + 1]!);
          if (!hit) continue;
          const tA = (sa + hit.t) / a.steps, tB = (sb + hit.u) / b.steps;
          if (shareEnd && (tA < 0.01 || tA > 0.99 || tB < 0.01 || tB > 0.99)) continue;
          addSplit(a.seg.id, tA);
          addSplit(b.seg.id, tB);
        }
      }
    }
  }
  if (splits.size === 0) return { network: net, insertedVertexIds: [], splitSegmentCount: 0 };

  const nextVertices: Record<string, VectorNetworkVertex> = { ...net.vertices };
  const nextSegments: Record<string, VectorNetworkSegment> = {};
  const insertedVertexIds: string[] = [];
  let vSeq = 1;
  const intern = (pt: VectorNetworkVec2): string => {
    for (const v of Object.values(nextVertices)) if (Math.hypot(v.x - pt.x, v.y - pt.y) <= snapTol) return v.id;
    while (nextVertices[`v-x-${vSeq}`]) vSeq += 1;
    const id = `v-x-${vSeq++}`;
    nextVertices[id] = { id, x: round3(pt.x), y: round3(pt.y) };
    insertedVertexIds.push(id);
    return id;
  };

  for (const seg of segList) {
    const rawParams = splits.get(seg.id), cp = segmentControlPoints(net, seg);
    if (!rawParams || !cp) { nextSegments[seg.id] = seg; continue; }
    rawParams.sort((x, y) => x - y);
    const params: number[] = [];
    for (const t of rawParams) if (params.length === 0 || t - params[params.length - 1]! > 1e-3) params.push(t);
    let [c0, c1, c2, c3] = cp, curStart = seg.start, prevT = 0;
    const straight = segmentIsStraight(seg);
    for (let k = 0; k < params.length; k += 1) {
      const targetT = params[k]!, { left, right } = splitCubicBezierAt(c0, c1, c2, c3, (targetT - prevT) / Math.max(EPS, 1 - prevT));
      const midId = intern(left[3]);
      if (midId !== curStart) {
        nextSegments[`${seg.id}__p${k}`] = {
          id: `${seg.id}__p${k}`, start: curStart, end: midId,
          tangentStart: straight ? { x: 0, y: 0 } : { x: round3(left[1].x - left[0].x), y: round3(left[1].y - left[0].y) },
          tangentEnd: straight ? { x: 0, y: 0 } : { x: round3(left[2].x - left[3].x), y: round3(left[2].y - left[3].y) },
          ...(seg.widthProfileRef ? { widthProfileRef: seg.widthProfileRef } : {}),
        };
      }
      curStart = midId; [c0, c1, c2, c3] = right; prevT = targetT;
    }
    if (curStart !== seg.end) {
      const k = params.length;
      nextSegments[`${seg.id}__p${k}`] = {
        id: `${seg.id}__p${k}`, start: curStart, end: seg.end,
        tangentStart: straight ? { x: 0, y: 0 } : { x: round3(c1.x - c0.x), y: round3(c1.y - c0.y) },
        tangentEnd: straight ? { x: 0, y: 0 } : { x: round3(c2.x - c3.x), y: round3(c2.y - c3.y) },
        ...(seg.widthProfileRef ? { widthProfileRef: seg.widthProfileRef } : {}),
      };
    }
  }
  return { network: extractVectorNetworkRegions({ version: 1, vertices: nextVertices, segments: nextSegments, regions: net.regions }), insertedVertexIds, splitSegmentCount: splits.size };
}

/** 정점별 `atan2` 편각 정렬된 반변 인접 구조를 구축한다. */
export function buildSortedNetworkHalfEdges(net: StudioVectorNetworkV1): {
  readonly halfEdges: ReadonlyMap<string, NetworkHalfEdge>;
  readonly outgoingByVertex: ReadonlyMap<string, readonly string[]>;
} {
  const halfEdges = new Map<string, NetworkHalfEdge>();
  const outgoing = new Map<string, string[]>();
  for (const vid of Object.keys(net.vertices)) outgoing.set(vid, []);

  for (const seg of Object.values(net.segments)) {
    const s = net.vertices[seg.start], e = net.vertices[seg.end];
    if (!s || !e) continue;
    const fwdDir = !isZeroVec(seg.tangentStart) ? seg.tangentStart : { x: e.x - s.x, y: e.y - s.y };
    const revDir = !isZeroVec(seg.tangentEnd) ? seg.tangentEnd : { x: s.x - e.x, y: s.y - e.y };
    const fwdId = `${seg.id}:+`, revId = `${seg.id}:-`;
    halfEdges.set(fwdId, { id: fwdId, segmentId: seg.id, forward: true, origin: seg.start, target: seg.end, twinId: revId, departureAngleRad: Math.atan2(fwdDir.y, fwdDir.x) });
    halfEdges.set(revId, { id: revId, segmentId: seg.id, forward: false, origin: seg.end, target: seg.start, twinId: fwdId, departureAngleRad: Math.atan2(revDir.y, revDir.x) });
    outgoing.get(seg.start)?.push(fwdId);
    outgoing.get(seg.end)?.push(revId);
  }
  for (const list of outgoing.values()) list.sort((a, b) => halfEdges.get(a)!.departureAngleRad - halfEdges.get(b)!.departureAngleRad || a.localeCompare(b));
  return { halfEdges, outgoingByVertex: outgoing };
}

function buildRegionGeometryFromLoop(net: StudioVectorNetworkV1, loopHeIds: readonly string[], halfEdges: ReadonlyMap<string, NetworkHalfEdge>) {
  const clean: string[] = [];
  for (const heId of loopHeIds) {
    const he = halfEdges.get(heId);
    if (he && clean.length > 0 && clean[clean.length - 1] === he.twinId) clean.pop();
    else clean.push(heId);
  }
  while (clean.length >= 2 && halfEdges.get(clean[0]!)?.twinId === clean[clean.length - 1]) { clean.shift(); clean.pop(); }
  const segIds: string[] = [], vertexIds: string[] = [], points: VectorNetworkVec2[] = [];
  for (const heId of clean) {
    const he = halfEdges.get(heId)!, seg = net.segments[he.segmentId];
    if (!seg) continue;
    segIds.push(seg.id); vertexIds.push(he.origin);
    points.push(...sampleSegmentPoints(net, seg, he.forward));
  }
  return { segIds, vertexIds, points, signedArea: points.length >= 3 ? signedAreaOfPoints(points) : 0 };
}

/** 평면 반변 그래프에서 최소 순환 기저(Minimal Cycle Basis) 닫힌 채움 영역을 추출한다. */
export function extractVectorNetworkRegions(net: StudioVectorNetworkV1, defaultFill: VectorNetworkFillSpec = { kind: "none" }): StudioVectorNetworkV1 {
  const { halfEdges, outgoingByVertex } = buildSortedNetworkHalfEdges(net);
  const visited = new Set<string>();
  interface CycleCand { readonly segIds: readonly string[]; readonly vertexIds: readonly string[]; readonly points: readonly VectorNetworkVec2[]; readonly absArea: number; readonly centroid: VectorNetworkVec2; readonly bounds: VectorNetworkBounds; }
  const positive: CycleCand[] = [], negative: CycleCand[] = [];

  for (const startId of halfEdges.keys()) {
    if (visited.has(startId)) continue;
    const walk: string[] = [];
    let curId = startId;
    while (!visited.has(curId) && walk.length <= halfEdges.size) {
      visited.add(curId); walk.push(curId);
      const cur = halfEdges.get(curId)!, out = outgoingByVertex.get(cur.target) ?? [];
      const twinIdx = out.indexOf(cur.twinId);
      if (twinIdx < 0 || out.length === 0) break;
      curId = out[(twinIdx - 1 + out.length) % out.length]!;
    }
    const geom = buildRegionGeometryFromLoop(net, walk, halfEdges);
    const absArea = Math.abs(geom.signedArea);
    if (absArea < MIN_REGION_AREA || geom.segIds.length < 2) continue;
    const cand: CycleCand = { segIds: geom.segIds, vertexIds: geom.vertexIds, points: geom.points, absArea, centroid: centroidOfPoints(geom.points), bounds: computePointsBounds(geom.points) };
    if (geom.signedArea > 0) positive.push(cand); else negative.push(cand);
  }

  const sigOf = (ids: readonly string[]): string => [...new Set(ids)].sort().join("|");
  const prevFillBySig = new Map<string, VectorNetworkFillSpec>();
  const prevRegions = Object.values(net.regions);
  for (const prev of prevRegions) if (prev.loopSegmentIds[0]) prevFillBySig.set(sigOf(prev.loopSegmentIds[0]), prev.fill);

  const holesByPos: CycleCand[][] = positive.map(() => []);
  for (const neg of negative) {
    const probe = neg.points[0] ?? neg.centroid;
    let bestParent = -1, bestArea = Infinity;
    for (let i = 0; i < positive.length; i += 1) {
      const pos = positive[i]!;
      if (pos.absArea > neg.absArea && pos.absArea < bestArea && pointInPolygon(probe, pos.points)) { bestParent = i; bestArea = pos.absArea; }
    }
    if (bestParent >= 0) holesByPos[bestParent]!.push(neg);
  }

  const regions: Record<string, VectorNetworkRegion> = {};
  positive.forEach((pos, idx) => {
    const holes = holesByPos[idx]!;
    const fill =
      prevFillBySig.get(sigOf(pos.segIds)) ??
      prevRegions.find((r) => r.fill.kind === "solid" && r.sampledOuter.length >= 3 && pointInPolygon(pos.centroid, r.sampledOuter))?.fill ??
      defaultFill;
    const regionId = `region-${idx + 1}`;
    const holeArea = holes.reduce((acc, h) => acc + h.absArea, 0);
    regions[regionId] = {
      id: regionId,
      loopSegmentIds: [pos.segIds, ...holes.map((h) => h.segIds)],
      loopVertexIds: [pos.vertexIds, ...holes.map((h) => h.vertexIds)],
      windingRule: "nonzero", fill, sampledOuter: pos.points, sampledHoles: holes.map((h) => h.points),
      area: Math.max(0, round3(pos.absArea - holeArea)), centroid: pos.centroid, bounds: pos.bounds,
    };
  });
  return { ...net, regions };
}

export function setVectorNetworkRegionFill(net: StudioVectorNetworkV1, regionId: string, fill: VectorNetworkFillSpec): StudioVectorNetworkV1 {
  const existing = net.regions[regionId];
  return existing ? { ...net, regions: { ...net.regions, [regionId]: { ...existing, fill } } } : net;
}

/** 정점 이동 시 연결 세그먼트 탄젠트를 보존하며 영향받는 인접 영역만 증분 재계산한다. */
export function moveNetworkVertexIncremental(net: StudioVectorNetworkV1, vertexId: string, nextPos: VectorNetworkVec2): IncrementalVertexMoveResult {
  const existing = net.vertices[vertexId];
  if (!existing) return { network: net, affectedSegmentIds: [], affectedRegionIds: [], untouchedRegionIds: Object.keys(net.regions) };
  const movedNet: StudioVectorNetworkV1 = { ...net, vertices: { ...net.vertices, [vertexId]: { ...existing, x: round3(nextPos.x), y: round3(nextPos.y) } } };
  const affectedSegmentIds = getIncidentSegmentIds(movedNet, vertexId);
  const affectedSegSet = new Set(affectedSegmentIds);
  const nextRegions: Record<string, VectorNetworkRegion> = {};
  const affectedRegionIds: string[] = [], untouchedRegionIds: string[] = [];

  for (const [regionId, region] of Object.entries(net.regions)) {
    if (!region.loopSegmentIds.some((loop) => loop.some((sid) => affectedSegSet.has(sid)))) {
      nextRegions[regionId] = region; untouchedRegionIds.push(regionId); continue;
    }
    affectedRegionIds.push(regionId);
    const rebuildLoop = (segLoop: readonly string[], vLoop: readonly string[]): VectorNetworkVec2[] => {
      const pts: VectorNetworkVec2[] = [];
      for (let i = 0; i < segLoop.length; i += 1) {
        const seg = movedNet.segments[segLoop[i]!];
        if (seg) pts.push(...sampleSegmentPoints(movedNet, seg, vLoop[i] !== undefined ? seg.start === vLoop[i] : true));
      }
      return pts;
    };
    const sampledOuter = rebuildLoop(region.loopSegmentIds[0] ?? [], region.loopVertexIds[0] ?? []);
    const sampledHoles = region.loopSegmentIds.slice(1).map((loop, hIdx) => rebuildLoop(loop, region.loopVertexIds[hIdx + 1] ?? []));
    const holeArea = sampledHoles.reduce((acc, h) => acc + Math.abs(signedAreaOfPoints(h)), 0);
    nextRegions[regionId] = {
      ...region, sampledOuter, sampledHoles,
      area: Math.max(0, round3(Math.abs(signedAreaOfPoints(sampledOuter)) - holeArea)),
      centroid: centroidOfPoints(sampledOuter), bounds: computePointsBounds(sampledOuter),
    };
  }
  return { network: { ...movedNet, regions: nextRegions }, affectedSegmentIds, affectedRegionIds, untouchedRegionIds };
}

export function fromDrawElsToVectorNetwork(elements: readonly DrawEl[], options?: { readonly snapTolerancePx?: number; readonly splitIntersections?: boolean }): StudioVectorNetworkV1 {
  const snapTol = Math.max(1e-3, options?.snapTolerancePx ?? 0.5);
  const vertices: Record<string, VectorNetworkVertex> = {}, segments: Record<string, VectorNetworkSegment> = {};
  let vSeq = 1, sSeq = 1;
  const intern = (x: number, y: number): string => {
    for (const v of Object.values(vertices)) if (Math.hypot(v.x - x, v.y - y) <= snapTol) return v.id;
    const id = `v-${vSeq++}`;
    vertices[id] = { id, x: round3(x), y: round3(y) };
    return id;
  };
  for (const el of elements) {
    if (el.mode === "eraser" || el.points.length < 4) continue;
    for (let i = 0; i + 3 < el.points.length; i += 2) {
      const a = intern(el.points[i]!, el.points[i + 1]!), b = intern(el.points[i + 2]!, el.points[i + 3]!);
      if (a === b) continue;
      const sid = `s-${sSeq++}`;
      segments[sid] = { id: sid, start: a, end: b, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } };
    }
  }
  const base: StudioVectorNetworkV1 = { version: 1, vertices, segments, regions: {} };
  return options?.splitIntersections ? splitVectorNetworkIntersections(base, { snapTolerancePx: snapTol }).network : extractVectorNetworkRegions(base);
}

export function flattenVectorNetworkToDrawElSeeds(
  net: StudioVectorNetworkV1,
  strokeStyle: Pick<DrawEl, "stroke" | "strokeWidth" | "opacity"> = { stroke: "currentColor", strokeWidth: 2 },
): { readonly regionFillSeeds: readonly Omit<DrawEl, "id">[]; readonly segmentStrokeSeeds: readonly Omit<DrawEl, "id">[] } {
  const regionFillSeeds: Omit<DrawEl, "id">[] = [];
  for (const region of Object.values(net.regions)) {
    if (region.fill.kind !== "solid" || !region.fill.color || region.sampledOuter.length < 3) continue;
    const flat: number[] = [];
    for (const pt of region.sampledOuter) flat.push(pt.x, pt.y);
    flat.push(region.sampledOuter[0]!.x, region.sampledOuter[0]!.y);
    regionFillSeeds.push({ type: "draw", kind: "freehand", mode: "pen", points: flat, stroke: region.fill.color, strokeWidth: 0, fill: region.fill.color, ...(region.fill.opacity !== undefined ? { opacity: region.fill.opacity } : {}), sampleSpacing: 3 });
  }
  const segmentStrokeSeeds: Omit<DrawEl, "id">[] = [];
  for (const seg of Object.values(net.segments)) {
    const cp = segmentControlPoints(net, seg);
    if (!cp) continue;
    const steps = segmentIsStraight(seg) ? 1 : DEFAULT_CURVE_STEPS, flat: number[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const pt = evaluateCubicBezier(cp[0], cp[1], cp[2], cp[3], i / steps);
      flat.push(round3(pt.x), round3(pt.y));
    }
    segmentStrokeSeeds.push({ type: "draw", kind: "freehand", mode: "pen", points: flat, stroke: strokeStyle.stroke, strokeWidth: strokeStyle.strokeWidth, ...(strokeStyle.opacity !== undefined ? { opacity: strokeStyle.opacity } : {}), sampleSpacing: 3 });
  }
  return { regionFillSeeds, segmentStrokeSeeds };
}
