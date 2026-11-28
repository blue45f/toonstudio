/**
 * Wave 116 — 패턴 리본 메쉬 위상 감사기(자기교차·음수 면적 쿼드 검출) 및 쿼드 스트립 빌더.
 */

import {
  vec2Add,
  vec2Cross,
  vec2Dot,
  vec2Scale,
  vec2Sub,
  type ArcLengthSample,
  type Vec2,
} from "./arclength-curve-and-frame-solver";
import type { RibbonQuad, RibbonStation } from "./pattern-ribbon-presets-and-motifs";

export interface RibbonEdgeIntersection {
  readonly kind: "left-left" | "right-right" | "left-right" | "rib-rib";
  readonly quadIndexA: number;
  readonly quadIndexB: number;
  readonly point: Vec2;
}

export interface RibbonTopologyAudit {
  readonly quadCount: number;
  readonly invertedQuadCount: number;
  readonly invertedQuadIndices: readonly number[];
  readonly selfIntersectionCount: number;
  readonly intersections: readonly RibbonEdgeIntersection[];
  readonly minQuadAreaPx2: number;
  readonly maxQuadAreaPx2: number;
  readonly nonFiniteCoordinateCount: number;
  readonly uvMonotonic: boolean;
  readonly foldoverFree: boolean;
}

export function signedTriArea2(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * 두 2D 선분 [a1, a2]와 [b1, b2]의 교차 여부를 판정하고 교차 좌표를 반환한다.
 */
export function findSegmentIntersection(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  if (
    Math.max(b1.x, b2.x) < Math.min(a1.x, a2.x) - 1e-7 ||
    Math.min(b1.x, b2.x) > Math.max(a1.x, a2.x) + 1e-7 ||
    Math.max(b1.y, b2.y) < Math.min(a1.y, a2.y) - 1e-7 ||
    Math.min(b1.y, b2.y) > Math.max(a1.y, a2.y) + 1e-7
  ) {
    return null;
  }

  const r = vec2Sub(a2, a1);
  const s = vec2Sub(b2, b1);
  const denom = vec2Cross(r, s);
  const qp = vec2Sub(b1, a1);

  if (Math.abs(denom) <= 1e-9) {
    if (Math.abs(vec2Cross(qp, r)) > 1e-6) return null;
    const rLenSq = r.x * r.x + r.y * r.y;
    if (rLenSq <= 1e-12) return null;
    const t0 = vec2Dot(qp, r) / rLenSq;
    const t1 = vec2Dot(vec2Sub(b2, a1), r) / rLenSq;
    const lo = Math.max(0, Math.min(t0, t1));
    const hi = Math.min(1, Math.max(t0, t1));
    if (hi - lo > 1e-5) {
      const mid = 0.5 * (lo + hi);
      return { x: a1.x + r.x * mid, y: a1.y + r.y * mid };
    }
    return null;
  }

  const t = vec2Cross(qp, s) / denom;
  const u = vec2Cross(qp, r) / denom;
  if (t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) {
    return { x: a1.x + r.x * t, y: a1.y + r.y * t };
  }
  return null;
}

export function buildRibbonStationsAndQuads(
  frames: readonly ArcLengthSample[],
  bevelFlags: readonly boolean[],
  nominalHalfWidths: readonly number[],
  leftHalfWidths: readonly number[],
  rightHalfWidths: readonly number[],
  innerClampedFlags: readonly boolean[],
  tileRepeatLengthPx: number,
): { readonly stations: readonly RibbonStation[]; readonly quads: readonly RibbonQuad[] } {
  const stations: RibbonStation[] = [];
  for (let i = 0; i < frames.length; i += 1) {
    const f = frames[i];
    const u = f.arcLengthPx / tileRepeatLengthPx;
    const tileIndex = Math.floor(u);
    const lhw = leftHalfWidths[i];
    const rhw = rightHalfWidths[i];
    stations.push({
      index: i,
      spine: f.position,
      arcLengthPx: f.arcLengthPx,
      u,
      tileIndex,
      tileLocalU: u - tileIndex,
      pressure: f.pressure,
      tangent: f.tangent,
      normal: f.normal,
      signedCurvature: f.signedCurvature,
      curvatureRadiusPx: f.curvatureRadiusPx,
      nominalHalfWidthPx: nominalHalfWidths[i],
      leftHalfWidthPx: lhw,
      rightHalfWidthPx: rhw,
      leftPoint: vec2Add(f.position, vec2Scale(f.normal, lhw)),
      rightPoint: vec2Sub(f.position, vec2Scale(f.normal, rhw)),
      leftUv: { x: u, y: 0 },
      rightUv: { x: u, y: 1 },
      isBevelStation: bevelFlags[i] ?? false,
      innerClamped: innerClampedFlags[i] ?? false,
      isTileBoundary: f.isTileBoundary,
    });
  }

  const quads: RibbonQuad[] = [];
  for (let i = 0; i < stations.length - 1; i += 1) {
    const a = stations[i];
    const b = stations[i + 1];
    const area1 = 0.5 * signedTriArea2(a.leftPoint, a.rightPoint, b.rightPoint);
    const area2 = 0.5 * signedTriArea2(a.leftPoint, b.rightPoint, b.leftPoint);
    const ribCross = findSegmentIntersection(a.leftPoint, a.rightPoint, b.leftPoint, b.rightPoint) !== null;
    const sideCross = findSegmentIntersection(a.leftPoint, b.leftPoint, a.rightPoint, b.rightPoint) !== null;
    quads.push({
      index: i,
      stationStartIndex: i,
      stationEndIndex: i + 1,
      leftStart: a.leftPoint,
      rightStart: a.rightPoint,
      rightEnd: b.rightPoint,
      leftEnd: b.leftPoint,
      uStart: a.u,
      uEnd: b.u,
      signedAreaTri1: area1,
      signedAreaTri2: area2,
      totalAreaPx2: area1 + area2,
      inverted: area1 <= 1e-6 || area2 <= 1e-6 || ribCross || sideCross,
    });
  }
  return { stations, quads };
}

/**
 * 리본 메쉬의 자기교차(좌-좌, 우-우, 좌-우, 리브-리브)와 음수 면적 쿼드를 전수 감사한다.
 */
export function auditRibbonMeshTopology(
  stations: readonly RibbonStation[],
  quads: readonly RibbonQuad[],
): RibbonTopologyAudit {
  let nonFiniteCoordinateCount = 0;
  let uvMonotonic = true;

  for (let i = 0; i < stations.length; i += 1) {
    const st = stations[i];
    const coords = [st.spine.x, st.spine.y, st.leftPoint.x, st.leftPoint.y, st.rightPoint.x, st.rightPoint.y, st.u];
    for (let k = 0; k < coords.length; k += 1) {
      if (!Number.isFinite(coords[k])) nonFiniteCoordinateCount += 1;
    }
    if (i > 0 && st.u < stations[i - 1].u - 1e-9) uvMonotonic = false;
  }

  const invertedQuadIndices: number[] = [];
  let minQuadAreaPx2 = quads.length > 0 ? Number.POSITIVE_INFINITY : 0;
  let maxQuadAreaPx2 = 0;

  for (let i = 0; i < quads.length; i += 1) {
    const q = quads[i];
    if (q.inverted) invertedQuadIndices.push(q.index);
    if (q.totalAreaPx2 < minQuadAreaPx2) minQuadAreaPx2 = q.totalAreaPx2;
    if (q.totalAreaPx2 > maxQuadAreaPx2) maxQuadAreaPx2 = q.totalAreaPx2;
  }
  if (!Number.isFinite(minQuadAreaPx2)) minQuadAreaPx2 = 0;

  const intersections: RibbonEdgeIntersection[] = [];
  for (let i = 0; i < quads.length; i += 1) {
    const qa = quads[i];
    const sameSide = findSegmentIntersection(qa.leftStart, qa.leftEnd, qa.rightStart, qa.rightEnd);
    if (sameSide) intersections.push({ kind: "left-right", quadIndexA: i, quadIndexB: i, point: sameSide });
    const sameRib = findSegmentIntersection(qa.leftStart, qa.rightStart, qa.leftEnd, qa.rightEnd);
    if (sameRib) intersections.push({ kind: "rib-rib", quadIndexA: i, quadIndexB: i, point: sameRib });

    for (let j = i + 1; j < quads.length; j += 1) {
      const qb = quads[j];
      if (j >= i + 2) {
        const ll = findSegmentIntersection(qa.leftStart, qa.leftEnd, qb.leftStart, qb.leftEnd);
        if (ll) intersections.push({ kind: "left-left", quadIndexA: i, quadIndexB: j, point: ll });
        const rr = findSegmentIntersection(qa.rightStart, qa.rightEnd, qb.rightStart, qb.rightEnd);
        if (rr) intersections.push({ kind: "right-right", quadIndexA: i, quadIndexB: j, point: rr });
      }
      const lr = findSegmentIntersection(qa.leftStart, qa.leftEnd, qb.rightStart, qb.rightEnd);
      if (lr) intersections.push({ kind: "left-right", quadIndexA: i, quadIndexB: j, point: lr });
      const rl = findSegmentIntersection(qa.rightStart, qa.rightEnd, qb.leftStart, qb.leftEnd);
      if (rl) intersections.push({ kind: "left-right", quadIndexA: j, quadIndexB: i, point: rl });
    }
  }

  return {
    quadCount: quads.length,
    invertedQuadCount: invertedQuadIndices.length,
    invertedQuadIndices,
    selfIntersectionCount: intersections.length,
    intersections,
    minQuadAreaPx2,
    maxQuadAreaPx2,
    nonFiniteCoordinateCount,
    uvMonotonic,
    foldoverFree: invertedQuadIndices.length === 0 && intersections.length === 0 && nonFiniteCoordinateCount === 0,
  };
}
