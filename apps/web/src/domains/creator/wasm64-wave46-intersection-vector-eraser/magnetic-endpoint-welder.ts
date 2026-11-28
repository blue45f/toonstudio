/**
 * Wave-46: 열린 선화 끝점 자석 용접(Magnetic Endpoint Welder) 및 T-스냅 커널.
 *
 * 닫히지 않은 채 미세하게 벌어진 선화 끝점 쌍을 거리(<= weldRadiusPx)와
 * 방향 벡터 연속성(각도 오차 <= 35°) 기준으로 판별해 C1 연속 3차 베지어 브리지로 자동 용접하며,
 * 짝을 찾지 못한 잔여 열린 끝점은 인접 선분에 자연스럽게 T-스냅해 채색 누수를 막는다.
 */

import {
  applyResidualEndpointTSnaps,
  type MagneticTSnapRecord,
  type MutableWeldedStroke,
  type TSnapMode,
} from "./magnetic-endpoint-tsnap";
import {
  angleBetweenUnitVectorsDeg,
  clampNumber,
  computePolylineCurvatures,
  computeStrokeArcLengths,
  distanceBetweenPoints,
  estimateStrokeOutwardTangent,
  normalizeStrokePressures,
  normalizeVector,
  type VectorLineartStroke,
  type VectorPoint2D,
} from "./vector-polyline-geometry";

export type { MagneticTSnapRecord, TSnapMode };
export type StrokeEndpointSide = "start" | "end";

export interface MagneticEndpointWeldOptions {
  /** 끝점-끝점 자석 용접 최대 허용 거리(px, 기본값 14.0) */
  readonly weldRadiusPx?: number;
  /** 끝점 방향 벡터 연속성 허용 최대 각도 오차(도, 기본값 35°) */
  readonly maxAngleErrorDeg?: number;
  /** 3차 베지어 브리지 세분화 구간 수 (기본값 6 -> 내부 보간 정점 5개) */
  readonly bridgeSubdivisions?: number;
  /** 3차 베지어 제어 핸들 장력 비율 [0.15..0.45] (기본값 0.3333) */
  readonly handleTension?: number;
  /** 끝점 접선 추정 시 역추적할 호장 길이(px, 기본값 10.0) */
  readonly tangentSamplePx?: number;
  /** 동일 스트로크 양 끝점을 닫아 폐곡선 루프로 용접할지 여부 (기본값 true) */
  readonly allowSelfLoopClose?: boolean;
  /** 용접되지 않은 열린 끝점을 인접 선분에 T-스냅할지 여부 (기본값 true) */
  readonly enableTSnap?: boolean;
  /** 인접 선분 T-스냅 최대 허용 거리(px, 생략 시 weldRadiusPx 사용) */
  readonly tSnapRadiusPx?: number;
  /** T-스냅 시 끝점 진행 방향 대비 허용 최대 꺾임 각도(도, 기본값 45°) */
  readonly maxTSnapAngleDeg?: number;
  /** T-스냅에서 평행 선분 오스냅 방지를 위한 최소 |sin(theta)| (기본값 0.15) */
  readonly minTSnapSine?: number;
  /** 공간 해시 셀 크기(px, 기본값 32) */
  readonly cellSizePx?: number;
}

export interface MagneticWeldBridgeRecord {
  readonly mergedStrokeId: string;
  readonly sourceStrokeAId: string;
  readonly sourceEndA: StrokeEndpointSide;
  readonly sourceStrokeBId: string;
  readonly sourceEndB: StrokeEndpointSide;
  readonly gapDistancePx: number;
  readonly angleErrorDeg: number;
  readonly controlPoints: readonly [VectorPoint2D, VectorPoint2D, VectorPoint2D, VectorPoint2D];
  readonly bridgePointCount: number;
  readonly closedLoop: boolean;
}

export interface MagneticEndpointWeldResult {
  readonly strokes: readonly VectorLineartStroke[];
  readonly weldedBridges: readonly MagneticWeldBridgeRecord[];
  readonly tSnaps: readonly MagneticTSnapRecord[];
  readonly rejectedNearEndpointPairs: number;
}

interface OpenEndpointDescriptor {
  readonly endpointKey: string;
  readonly strokeIndex: number;
  readonly strokeId: string;
  readonly side: StrokeEndpointSide;
  readonly point: VectorPoint2D;
  readonly outwardTangent: VectorPoint2D;
  readonly pressure: number;
  readonly strokeTotalLength: number;
}

interface CandidateWeldPair {
  readonly a: OpenEndpointDescriptor;
  readonly b: OpenEndpointDescriptor;
  readonly gapDistancePx: number;
  readonly angleErrorDeg: number;
  readonly score: number;
}

export function evaluateCubicBezierBridge(
  p0: VectorPoint2D,
  outwardTangent0: VectorPoint2D,
  p3: VectorPoint2D,
  outwardTangent3: VectorPoint2D,
  pressure0: number,
  pressure3: number,
  subdivisions: number,
  handleTension: number,
): {
  readonly controlPoints: readonly [VectorPoint2D, VectorPoint2D, VectorPoint2D, VectorPoint2D];
  readonly interiorPoints: readonly VectorPoint2D[];
  readonly interiorPressures: readonly number[];
} {
  const gap = distanceBetweenPoints(p0, p3);
  const handleLen = gap * clampNumber(handleTension, 0.15, 0.45);
  const c1: VectorPoint2D = { x: p0.x + outwardTangent0.x * handleLen, y: p0.y + outwardTangent0.y * handleLen };
  const c2: VectorPoint2D = { x: p3.x + outwardTangent3.x * handleLen, y: p3.y + outwardTangent3.y * handleLen };
  const steps = Math.max(1, Math.round(subdivisions));
  const interiorPoints: VectorPoint2D[] = [];
  const interiorPressures: number[] = [];

  if (gap > 1e-6 && steps >= 2) {
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const omt = 1 - t;
      const omt2 = omt * omt;
      const t2 = t * t;
      interiorPoints.push({
        x: omt2 * omt * p0.x + 3 * omt2 * t * c1.x + 3 * omt * t2 * c2.x + t2 * t * p3.x,
        y: omt2 * omt * p0.y + 3 * omt2 * t * c1.y + 3 * omt * t2 * c2.y + t2 * t * p3.y,
      });
      interiorPressures.push(clampNumber(pressure0 + (pressure3 - pressure0) * (t2 * (3 - 2 * t)), 0, 1));
    }
  }
  return { controlPoints: [p0, c1, c2, p3], interiorPoints, interiorPressures };
}

function collectOpenEndpoints(
  strokes: readonly VectorLineartStroke[],
  tangentSamplePx: number,
): readonly OpenEndpointDescriptor[] {
  const endpoints: OpenEndpointDescriptor[] = [];
  for (let strokeIndex = 0; strokeIndex < strokes.length; strokeIndex += 1) {
    const stroke = strokes[strokeIndex];
    if (!stroke || stroke.closed || stroke.points.length < 2) continue;
    const startPt = stroke.points[0];
    const endPt = stroke.points[stroke.points.length - 1];
    if (!startPt || !endPt) continue;
    const { totalLength } = computeStrokeArcLengths(stroke.points, false);
    if (totalLength <= 1e-6) continue;
    const pressures = normalizeStrokePressures(stroke.points.length, stroke.pressures);
    for (const side of ["start", "end"] as const) {
      endpoints.push({
        endpointKey: `${strokeIndex}:${side}`,
        strokeIndex,
        strokeId: stroke.id,
        side,
        point: side === "start" ? startPt : endPt,
        outwardTangent: estimateStrokeOutwardTangent(stroke.points, side, tangentSamplePx),
        pressure: side === "start" ? (pressures[0] ?? 0.5) : (pressures[pressures.length - 1] ?? 0.5),
        strokeTotalLength: totalLength,
      });
    }
  }
  return endpoints;
}

function cloneStrokeMutable(stroke: VectorLineartStroke): MutableWeldedStroke {
  return {
    id: stroke.id,
    points: stroke.points.map((p) => ({ x: p.x, y: p.y })),
    pressures: [...normalizeStrokePressures(stroke.points.length, stroke.pressures)],
    ...(stroke.baseWidthPx !== undefined ? { baseWidthPx: stroke.baseWidthPx } : {}),
    closed: Boolean(stroke.closed),
  };
}

function appendUniquePoint(points: VectorPoint2D[], pressures: number[], pt: VectorPoint2D, pressure: number): void {
  const prev = points[points.length - 1];
  if (prev && Math.hypot(pt.x - prev.x, pt.y - prev.y) <= 1e-6) return;
  points.push({ x: pt.x, y: pt.y });
  pressures.push(clampNumber(pressure, 0, 1));
}

function selectOptimalWeldPairs(
  endpoints: readonly OpenEndpointDescriptor[],
  weldRadiusPx: number,
  maxAngleErrorDeg: number,
  allowSelfLoopClose: boolean,
): { readonly accepted: readonly CandidateWeldPair[]; readonly rejectedNearCount: number } {
  const candidates: CandidateWeldPair[] = [];
  let rejectedNearCount = 0;

  for (let i = 0; i < endpoints.length; i += 1) {
    const a = endpoints[i];
    if (!a) continue;
    for (let j = i + 1; j < endpoints.length; j += 1) {
      const b = endpoints[j];
      if (!b) continue;
      if (a.strokeIndex === b.strokeIndex && (!allowSelfLoopClose || a.strokeTotalLength <= weldRadiusPx * 2)) continue;

      const gapDistancePx = distanceBetweenPoints(a.point, b.point);
      if (gapDistancePx > weldRadiusPx) continue;

      const tangentMismatchDeg = angleBetweenUnitVectorsDeg(a.outwardTangent, {
        x: -b.outwardTangent.x,
        y: -b.outwardTangent.y,
      });
      let angleErrorDeg = tangentMismatchDeg;
      if (gapDistancePx > 1e-6) {
        const chordAB = normalizeVector(b.point.x - a.point.x, b.point.y - a.point.y);
        const aimA = angleBetweenUnitVectorsDeg(a.outwardTangent, chordAB);
        const aimB = angleBetweenUnitVectorsDeg(b.outwardTangent, { x: -chordAB.x, y: -chordAB.y });
        angleErrorDeg = Math.max(tangentMismatchDeg, aimA, aimB);
      }

      if (angleErrorDeg > maxAngleErrorDeg) {
        rejectedNearCount += 1;
        continue;
      }
      const distNorm = weldRadiusPx > 1e-6 ? gapDistancePx / weldRadiusPx : 0;
      const angleNorm = maxAngleErrorDeg > 1e-6 ? angleErrorDeg / maxAngleErrorDeg : 0;
      candidates.push({ a, b, gapDistancePx, angleErrorDeg, score: distNorm + angleNorm * 0.75 });
    }
  }

  candidates.sort((x, y) => x.score - y.score);
  const used = new Set<string>();
  const accepted: CandidateWeldPair[] = [];
  for (const pair of candidates) {
    if (used.has(pair.a.endpointKey) || used.has(pair.b.endpointKey)) continue;
    used.add(pair.a.endpointKey);
    used.add(pair.b.endpointKey);
    accepted.push(pair);
  }
  return { accepted, rejectedNearCount };
}

export function weldMagneticEndpoints(
  strokes: readonly VectorLineartStroke[],
  options: MagneticEndpointWeldOptions = {},
): MagneticEndpointWeldResult {
  const weldRadiusPx = Math.max(0, options.weldRadiusPx ?? 14.0);
  const maxAngleErrorDeg = clampNumber(options.maxAngleErrorDeg ?? 35.0, 0, 180);
  const bridgeSubdivisions = Math.max(2, Math.round(options.bridgeSubdivisions ?? 6));
  const handleTension = clampNumber(options.handleTension ?? 1 / 3, 0.15, 0.45);
  const tangentSamplePx = Math.max(1, options.tangentSamplePx ?? 10.0);
  const allowSelfLoopClose = options.allowSelfLoopClose ?? true;
  const enableTSnap = options.enableTSnap ?? true;

  const endpoints = collectOpenEndpoints(strokes, tangentSamplePx);
  const { accepted, rejectedNearCount } = selectOptimalWeldPairs(
    endpoints,
    weldRadiusPx,
    maxAngleErrorDeg,
    allowSelfLoopClose,
  );
  const pairByKey = new Map<string, CandidateWeldPair>();
  for (const pair of accepted) {
    pairByKey.set(pair.a.endpointKey, pair);
    pairByKey.set(pair.b.endpointKey, pair);
  }

  const weldedBridges: MagneticWeldBridgeRecord[] = [];
  const mergedStrokes: MutableWeldedStroke[] = [];
  const visited = new Set<number>();

  const pushBridgeRecord = (
    mergedStrokeId: string,
    from: OpenEndpointDescriptor,
    to: OpenEndpointDescriptor,
    pair: CandidateWeldPair,
    controlPoints: readonly [VectorPoint2D, VectorPoint2D, VectorPoint2D, VectorPoint2D],
    bridgePointCount: number,
    closedLoop: boolean,
  ): void => {
    weldedBridges.push({
      mergedStrokeId,
      sourceStrokeAId: from.strokeId,
      sourceEndA: from.side,
      sourceStrokeBId: to.strokeId,
      sourceEndB: to.side,
      gapDistancePx: pair.gapDistancePx,
      angleErrorDeg: pair.angleErrorDeg,
      controlPoints,
      bridgePointCount,
      closedLoop,
    });
  };

  // 1단계: 단일 스트로크 자기 폐곡선 루프 용접
  for (const pair of accepted) {
    if (pair.a.strokeIndex !== pair.b.strokeIndex) continue;
    const raw = strokes[pair.a.strokeIndex];
    if (!raw) continue;
    visited.add(pair.a.strokeIndex);
    const data = cloneStrokeMutable(raw);
    const from = pair.a.side === "end" ? pair.a : pair.b;
    const to = pair.a.side === "start" ? pair.a : pair.b;
    const bridge = evaluateCubicBezierBridge(
      from.point,
      from.outwardTangent,
      to.point,
      to.outwardTangent,
      from.pressure,
      to.pressure,
      bridgeSubdivisions,
      handleTension,
    );
    for (let k = 0; k < bridge.interiorPoints.length; k += 1) {
      const pt = bridge.interiorPoints[k];
      const pr = bridge.interiorPressures[k];
      if (pt && pr !== undefined) appendUniquePoint(data.points, data.pressures, pt, pr);
    }
    mergedStrokes.push({ ...data, closed: true });
    pushBridgeRecord(data.id, from, to, pair, bridge.controlPoints, bridge.interiorPoints.length, true);
  }

  // 2단계: 서로 다른 스트로크 간 연쇄 용접 체인 조립
  const assembleChain = (startIdx: number, entrySide: StrokeEndpointSide): void => {
    const rawFirst = strokes[startIdx];
    if (!rawFirst) return;
    visited.add(startIdx);
    const first = cloneStrokeMutable(rawFirst);
    const revFirst = entrySide === "end";
    const chainPoints = revFirst ? [...first.points].reverse() : [...first.points];
    const chainPressures = revFirst ? [...first.pressures].reverse() : [...first.pressures];
    let currentIdx = startIdx;
    let tailSide: StrokeEndpointSide = revFirst ? "start" : "end";
    let closedLoop = false;

    while (true) {
      const tailKey = `${currentIdx}:${tailSide}`;
      const pair = pairByKey.get(tailKey);
      if (!pair) break;
      const from = pair.a.endpointKey === tailKey ? pair.a : pair.b;
      const to = pair.a.endpointKey === tailKey ? pair.b : pair.a;
      const bridge = evaluateCubicBezierBridge(
        from.point,
        from.outwardTangent,
        to.point,
        to.outwardTangent,
        from.pressure,
        to.pressure,
        bridgeSubdivisions,
        handleTension,
      );
      for (let k = 0; k < bridge.interiorPoints.length; k += 1) {
        const pt = bridge.interiorPoints[k];
        const pr = bridge.interiorPressures[k];
        if (pt && pr !== undefined) appendUniquePoint(chainPoints, chainPressures, pt, pr);
      }
      if (visited.has(to.strokeIndex)) {
        closedLoop = to.strokeIndex === startIdx;
        pushBridgeRecord(first.id, from, to, pair, bridge.controlPoints, bridge.interiorPoints.length, closedLoop);
        break;
      }
      visited.add(to.strokeIndex);
      const nextRaw = strokes[to.strokeIndex];
      if (!nextRaw) break;
      const nextData = cloneStrokeMutable(nextRaw);
      const nextPts = to.side === "end" ? [...nextData.points].reverse() : nextData.points;
      const nextPrs = to.side === "end" ? [...nextData.pressures].reverse() : nextData.pressures;
      for (let k = 0; k < nextPts.length; k += 1) {
        const pt = nextPts[k];
        const pr = nextPrs[k];
        if (pt && pr !== undefined) appendUniquePoint(chainPoints, chainPressures, pt, pr);
      }
      pushBridgeRecord(first.id, from, to, pair, bridge.controlPoints, bridge.interiorPoints.length, false);
      currentIdx = to.strokeIndex;
      tailSide = to.side === "start" ? "end" : "start";
    }

    mergedStrokes.push({
      id: first.id,
      points: chainPoints,
      pressures: chainPressures,
      ...(first.baseWidthPx !== undefined ? { baseWidthPx: first.baseWidthPx } : {}),
      closed: closedLoop,
    });
  };

  for (let i = 0; i < strokes.length; i += 1) {
    if (visited.has(i)) continue;
    const hasStart = pairByKey.has(`${i}:start`);
    const hasEnd = pairByKey.has(`${i}:end`);
    if (!hasStart && !hasEnd) {
      const raw = strokes[i];
      if (raw) {
        visited.add(i);
        mergedStrokes.push(cloneStrokeMutable(raw));
      }
    } else if (!hasStart && hasEnd) {
      assembleChain(i, "start");
    } else if (hasStart && !hasEnd) {
      assembleChain(i, "end");
    }
  }
  for (let i = 0; i < strokes.length; i += 1) {
    if (!visited.has(i)) assembleChain(i, "start");
  }

  const tSnaps = enableTSnap
    ? applyResidualEndpointTSnaps(mergedStrokes, {
        tSnapRadiusPx: Math.max(0, options.tSnapRadiusPx ?? weldRadiusPx),
        tangentSamplePx,
        maxTSnapAngleDeg: clampNumber(options.maxTSnapAngleDeg ?? 45.0, 0, 180),
        minTSnapSine: clampNumber(options.minTSnapSine ?? 0.15, 0, 1),
        cellSizePx: Math.max(1, options.cellSizePx ?? 32),
      })
    : [];

  return {
    strokes: mergedStrokes.map((s) => ({
      id: s.id,
      points: s.points,
      pressures: s.pressures,
      curvatures: computePolylineCurvatures(s.points),
      ...(s.baseWidthPx !== undefined ? { baseWidthPx: s.baseWidthPx } : {}),
      closed: s.closed,
    })),
    weldedBridges,
    tSnaps,
    rejectedNearEndpointPairs: rejectedNearCount,
  };
}
