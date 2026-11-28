/**
 * 모서리 커스프 허브 재용접 및 최종 중심선 스파인 메트릭 정산 모듈.
 */

import {
  computeMean,
  computeModifiedHausdorffPx,
  computeSignedMengerCurvature,
  computeTurningAngleDeg,
  measureHighFrequencyTremor,
  type Point2D,
} from "./kinematic-geometry-primitives";

export interface ResampledSegmentSample {
  readonly x: number;
  readonly y: number;
  readonly tangentX: number;
  readonly tangentY: number;
  readonly pressure: number;
  readonly speedPxPerSec: number;
}

export interface CornerCuspHub {
  readonly hubId: number;
  readonly count: number;
  readonly sumX: number;
  readonly sumY: number;
}

export interface BuiltSpineDraft {
  readonly id: string;
  readonly sourceStrokeIds: string[];
  readonly rawSamples: ResampledSegmentSample[];
  readonly densities: number[];
  readonly cornerIndices: number[];
  readonly cornerAnglesDeg: Map<number, number>;
  readonly startHubId: number | null;
  readonly endHubId: number | null;
  readonly inputTremorRatios: number[];
}

export interface ConsolidatedCenterlinePoint {
  readonly x: number;
  readonly y: number;
  readonly arcLengthPx: number;
  readonly normalizedArc: number;
  readonly tangentX: number;
  readonly tangentY: number;
  readonly signedCurvature: number;
  readonly sourceDensity: number;
  readonly meanRoughPressure: number;
  readonly meanRoughSpeedPxPerSec: number;
  readonly isCornerCusp: boolean;
  readonly cornerAngleDeg?: number;
}

export interface ConsolidatedSpineStroke {
  readonly id: string;
  readonly sourceStrokeIds: readonly string[];
  readonly points: readonly ConsolidatedCenterlinePoint[];
  readonly totalArcLengthPx: number;
  readonly cornerIndices: readonly number[];
  readonly meanHausdorffPx: number;
  readonly inputTremorRatio: number;
  readonly outputTremorRatio: number;
}

export function computeArcLengths(points: readonly Point2D[]): number[] {
  const arc: number[] = new Array<number>(points.length).fill(0);
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    arc[i] = (arc[i - 1] ?? 0) + (a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0);
  }
  return arc;
}

export function registerOrFindCuspHub(
  hubs: CornerCuspHub[],
  pt: Point2D,
  clusterDistancePx: number,
): number {
  const mergeRadius = clusterDistancePx * 0.9;
  for (let i = 0; i < hubs.length; i += 1) {
    const hub = hubs[i];
    if (!hub) continue;
    if (Math.hypot(pt.x - hub.sumX / hub.count, pt.y - hub.sumY / hub.count) <= mergeRadius) {
      hubs[i] = {
        hubId: hub.hubId,
        count: hub.count + 1,
        sumX: hub.sumX + pt.x,
        sumY: hub.sumY + pt.y,
      };
      return hub.hubId;
    }
  }
  const hubId = hubs.length;
  hubs.push({ hubId, count: 1, sumX: pt.x, sumY: pt.y });
  return hubId;
}

function reverseDraft(draft: BuiltSpineDraft): BuiltSpineDraft {
  const n = draft.rawSamples.length;
  const cornerAnglesDeg = new Map<number, number>();
  const reversedCorners = draft.cornerIndices
    .map((idx) => {
      const mapped = n - 1 - idx;
      const ang = draft.cornerAnglesDeg.get(idx);
      if (ang !== undefined) cornerAnglesDeg.set(mapped, ang);
      return mapped;
    })
    .sort((a, b) => a - b);
  return {
    ...draft,
    rawSamples: [...draft.rawSamples].reverse().map((s) => ({
      ...s,
      tangentX: -s.tangentX,
      tangentY: -s.tangentY,
    })),
    densities: [...draft.densities].reverse(),
    cornerIndices: reversedCorners,
    cornerAnglesDeg,
    startHubId: draft.endHubId,
    endHubId: draft.startHubId,
  };
}

export function weldDraftsAtCuspHubs(
  drafts: BuiltSpineDraft[],
  hubs: readonly CornerCuspHub[],
  cornerAngleDegThreshold: number,
): BuiltSpineDraft[] {
  const active = [...drafts];
  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    for (let i = 0; i < active.length && !mergedAny; i += 1) {
      const a = active[i];
      if (!a || a.rawSamples.length < 2) continue;
      for (let j = i + 1; j < active.length && !mergedAny; j += 1) {
        const b = active[j];
        if (!b || b.rawSamples.length < 2) continue;

        let oA: BuiltSpineDraft | null = null;
        let oB: BuiltSpineDraft | null = null;
        let hubId: number | null = null;
        if (a.endHubId !== null && a.endHubId === b.startHubId) {
          oA = a; oB = b; hubId = a.endHubId;
        } else if (a.endHubId !== null && a.endHubId === b.endHubId) {
          oA = a; oB = reverseDraft(b); hubId = a.endHubId;
        } else if (a.startHubId !== null && a.startHubId === b.startHubId) {
          oA = reverseDraft(a); oB = b; hubId = a.startHubId;
        } else if (a.startHubId !== null && a.startHubId === b.endHubId) {
          oA = b; oB = a; hubId = a.startHubId;
        }

        if (!oA || !oB || hubId === null) continue;
        const hub = hubs[hubId];
        if (!hub || hub.count === 0) continue;

        const cuspPt: Point2D = { x: hub.sumX / hub.count, y: hub.sumY / hub.count };
        const aRef = oA.rawSamples[Math.max(0, oA.rawSamples.length - 4)];
        const bRef = oB.rawSamples[Math.min(oB.rawSamples.length - 1, 3)];
        if (!aRef || !bRef) continue;
        const turnAngle = computeTurningAngleDeg(aRef, cuspPt, bRef);
        if (turnAngle < cornerAngleDegThreshold * 0.7) continue;

        const weldedA = [...oA.rawSamples];
        const lastA = weldedA[weldedA.length - 1];
        if (lastA) weldedA[weldedA.length - 1] = { ...lastA, x: cuspPt.x, y: cuspPt.y };
        const cuspIdx = weldedA.length - 1;

        const combinedCorners = new Set<number>(oA.cornerIndices);
        combinedCorners.add(cuspIdx);
        const combinedAngles = new Map<number, number>(oA.cornerAnglesDeg);
        combinedAngles.set(cuspIdx, turnAngle);
        for (let c = 0; c < oB.cornerIndices.length; c += 1) {
          const idx = oB.cornerIndices[c];
          if (idx === undefined || idx === 0) continue;
          combinedCorners.add(cuspIdx + idx);
          const ang = oB.cornerAnglesDeg.get(idx);
          if (ang !== undefined) combinedAngles.set(cuspIdx + idx, ang);
        }

        active[i] = {
          id: oA.id,
          sourceStrokeIds: Array.from(new Set([...oA.sourceStrokeIds, ...oB.sourceStrokeIds])),
          rawSamples: [...weldedA, ...oB.rawSamples.slice(1)],
          densities: [...oA.densities, ...oB.densities.slice(1)],
          cornerIndices: Array.from(combinedCorners).sort((x, y) => x - y),
          cornerAnglesDeg: combinedAngles,
          startHubId: oA.startHubId,
          endHubId: oB.endHubId,
          inputTremorRatios: [...oA.inputTremorRatios, ...oB.inputTremorRatios],
        };
        active.splice(j, 1);
        mergedAny = true;
      }
    }
  }
  return active;
}

export function finalizeSpineDraft(
  draft: BuiltSpineDraft,
  index: number,
  validSourceMap: ReadonlyMap<string, Point2D[]>,
): ConsolidatedSpineStroke {
  const pts = draft.rawSamples;
  const n = pts.length;
  const arc = computeArcLengths(pts);
  const totalArc = arc[n - 1] ?? 0;
  const cornerSet = new Set<number>(draft.cornerIndices);

  const centerPoints: ConsolidatedCenterlinePoint[] = pts.map((p, k) => {
    const isCorner = cornerSet.has(k);
    const prev = pts[Math.max(0, k - 1)] ?? p;
    const next = pts[Math.min(n - 1, k + 1)] ?? p;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    const cornerAngleDeg = draft.cornerAnglesDeg.get(k);
    return {
      x: p.x,
      y: p.y,
      arcLengthPx: arc[k] ?? 0,
      normalizedArc: totalArc > 1e-9 ? (arc[k] ?? 0) / totalArc : 0,
      tangentX: len > 1e-9 ? dx / len : p.tangentX,
      tangentY: len > 1e-9 ? dy / len : p.tangentY,
      signedCurvature: !isCorner && k > 0 && k < n - 1 ? computeSignedMengerCurvature(prev, p, next) : 0,
      sourceDensity: Math.max(1, draft.densities[k] ?? draft.sourceStrokeIds.length),
      meanRoughPressure: p.pressure,
      meanRoughSpeedPxPerSec: p.speedPxPerSec,
      isCornerCusp: isCorner,
      ...(cornerAngleDeg !== undefined ? { cornerAngleDeg } : {}),
    };
  });

  const srcDistances: number[] = [];
  for (let s = 0; s < draft.sourceStrokeIds.length; s += 1) {
    const srcId = draft.sourceStrokeIds[s];
    const srcPts = srcId !== undefined ? validSourceMap.get(srcId) : undefined;
    if (srcPts && srcPts.length >= 2) {
      srcDistances.push(computeModifiedHausdorffPx(centerPoints, srcPts));
    }
  }
  const inputTremorRatio = computeMean(draft.inputTremorRatios);
  const outputTremorRatio = measureHighFrequencyTremor(centerPoints, draft.cornerIndices).tremorEnergyRatio;

  return {
    id: `consolidated-${String(index + 1).padStart(3, "0")}`,
    sourceStrokeIds: [...draft.sourceStrokeIds],
    points: centerPoints,
    totalArcLengthPx: totalArc,
    cornerIndices: [...draft.cornerIndices],
    meanHausdorffPx: Number(computeMean(srcDistances).toFixed(3)),
    inputTremorRatio: Number(inputTremorRatio.toFixed(4)),
    outputTremorRatio: Number(outputTremorRatio.toFixed(4)),
  };
}
