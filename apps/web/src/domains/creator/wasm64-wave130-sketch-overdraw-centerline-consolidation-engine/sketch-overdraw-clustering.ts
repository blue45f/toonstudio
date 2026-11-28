/**
 * Wave 130 — 방향-거리 이중 기준 다중 겹침 러프 스케치 클러스터링 모듈.
 *
 * - 겹치는 투영 구간에서 평균 수직 거리 `<= clusterBandwidthPx` AND 방향 내적 절대값
 *   `|dot(T_a, T_b)| >= minTangentCosine`을 동시에 만족하는 스트로크만 단일 클러스터로 묶는다.
 * - 직교·교차선 오병합 0건(`orthogonalFalseMergeCount === 0`)을 보장하고,
 *   각 클러스터의 중심 메도이드 기준 역방향 왕복 필기를 자동 검출한다.
 */

import {
  bboxesOverlapWithMargin,
  normalizeAndResampleSketchStroke,
  projectPointOntoSamples,
} from "./sketch-consolidation-sha256-and-math";
import {
  resolveSketchConsolidationOptions,
  type AlignedClusterMember,
  type NormalizedSketchStroke,
  type OverdrawStrokeCluster,
  type RawSketchStroke,
  type ResolvedSketchConsolidationOptions,
  type SketchClusteringResult,
  type SketchConsolidationOptions,
} from "./sketch-consolidation-types";

export interface PairwiseAffinityEvaluation {
  readonly compatible: boolean;
  readonly orthogonalRejected: boolean;
  readonly meanPerpDistancePx: number;
  readonly meanAbsTangentDot: number;
  readonly signedTangentDotMean: number;
  readonly overlapFraction: number;
  readonly affinityScore: number;
}

/**
 * 후버(Huber) 강건 가중치(극단적 외곽 아웃라이어는 2차 감쇠)를 계산한다.
 */
export function huberRobustWeight(residualPx: number, deltaPx: number): number {
  const absR = Math.abs(residualPx);
  if (absR <= deltaPx) return 1.0;
  const ratio = deltaPx / absR;
  if (absR <= deltaPx * 1.8) {
    return ratio;
  }
  return Math.max(0.02, ratio * ratio);
}

function evaluateDirectionalProjection(
  source: NormalizedSketchStroke,
  target: NormalizedSketchStroke,
  overhangTolPx: number,
  bandwidthPx: number,
): {
  readonly overlapRatio: number;
  readonly meanDistPx: number;
  readonly meanAbsDot: number;
  readonly signedDotMean: number;
  readonly nearProximityCount: number;
  readonly nearProximityAbsDotMean: number;
} {
  let overlapCount = 0;
  let distSum = 0;
  let absDotSum = 0;
  let signedDotSum = 0;
  let nearCount = 0;
  let nearAbsDotSum = 0;

  for (let i = 0; i < source.samples.length; i += 1) {
    const s = source.samples[i];
    if (!s) continue;
    const hit = projectPointOntoSamples(s, target.samples, target.totalLengthPx, overhangTolPx);
    const dot = s.tx * hit.tx + s.ty * hit.ty;
    const absDot = Math.abs(dot);

    if (hit.distancePx <= bandwidthPx) {
      nearCount += 1;
      nearAbsDotSum += absDot;
    }

    if (hit.withinSpan) {
      overlapCount += 1;
      distSum += hit.distancePx;
      absDotSum += absDot;
      signedDotSum += dot;
    }
  }

  const total = Math.max(1, source.samples.length);
  return {
    overlapRatio: overlapCount / total,
    meanDistPx: overlapCount > 0 ? distSum / overlapCount : Number.POSITIVE_INFINITY,
    meanAbsDot: overlapCount > 0 ? absDotSum / overlapCount : 0,
    signedDotMean: overlapCount > 0 ? signedDotSum / overlapCount : 0,
    nearProximityCount: nearCount,
    nearProximityAbsDotMean: nearCount > 0 ? nearAbsDotSum / nearCount : 0,
  };
}

export function evaluateStrokePairAffinity(
  a: NormalizedSketchStroke,
  b: NormalizedSketchStroke,
  opts: ResolvedSketchConsolidationOptions,
): PairwiseAffinityEvaluation {
  const margin = opts.clusterBandwidthPx * 1.4;
  if (!bboxesOverlapWithMargin(a.bbox, b.bbox, margin)) {
    return {
      compatible: false,
      orthogonalRejected: false,
      meanPerpDistancePx: Number.POSITIVE_INFINITY,
      meanAbsTangentDot: 0,
      signedTangentDotMean: 0,
      overlapFraction: 0,
      affinityScore: 0,
    };
  }

  const overhangTol = Math.max(opts.resampleStepPx * 1.25, opts.clusterBandwidthPx * 0.35);
  const ab = evaluateDirectionalProjection(a, b, overhangTol, opts.clusterBandwidthPx);
  const ba = evaluateDirectionalProjection(b, a, overhangTol, opts.clusterBandwidthPx);

  const overlapFraction = Math.max(ab.overlapRatio, ba.overlapRatio);
  const aValid = ab.overlapRatio >= opts.minOverlapFraction;
  const bValid = ba.overlapRatio >= opts.minOverlapFraction;

  let meanPerpDistancePx = Number.POSITIVE_INFINITY;
  let meanAbsTangentDot = 0;
  let signedTangentDotMean = 0;

  if (aValid && bValid) {
    meanPerpDistancePx = Math.min(
      0.5 * (ab.meanDistPx + ba.meanDistPx),
      Math.min(ab.meanDistPx, ba.meanDistPx) * 1.15,
    );
    meanAbsTangentDot = 0.5 * (ab.meanAbsDot + ba.meanAbsDot);
    signedTangentDotMean = 0.5 * (ab.signedDotMean + ba.signedDotMean);
  } else if (aValid) {
    meanPerpDistancePx = ab.meanDistPx;
    meanAbsTangentDot = ab.meanAbsDot;
    signedTangentDotMean = ab.signedDotMean;
  } else if (bValid) {
    meanPerpDistancePx = ba.meanDistPx;
    meanAbsTangentDot = ba.meanAbsDot;
    signedTangentDotMean = ba.signedDotMean;
  }

  const hasProximityCrossing = ab.nearProximityCount > 0 || ba.nearProximityCount > 0;
  const nearTotal = ab.nearProximityCount + ba.nearProximityCount;
  const crossingAbsDot =
    nearTotal > 0
      ? (ab.nearProximityAbsDotMean * ab.nearProximityCount +
          ba.nearProximityAbsDotMean * ba.nearProximityCount) /
        nearTotal
      : meanAbsTangentDot;

  if (hasProximityCrossing && crossingAbsDot < opts.minTangentCosine) {
    return {
      compatible: false,
      orthogonalRejected: true,
      meanPerpDistancePx,
      meanAbsTangentDot: crossingAbsDot,
      signedTangentDotMean,
      overlapFraction,
      affinityScore: 0,
    };
  }

  const distancePasses =
    Number.isFinite(meanPerpDistancePx) && meanPerpDistancePx <= opts.clusterBandwidthPx;
  const overlapPasses = overlapFraction >= opts.minOverlapFraction;

  if (distancePasses && overlapPasses && meanAbsTangentDot < opts.minTangentCosine) {
    return {
      compatible: false,
      orthogonalRejected: true,
      meanPerpDistancePx,
      meanAbsTangentDot,
      signedTangentDotMean,
      overlapFraction,
      affinityScore: 0,
    };
  }

  if (!distancePasses || !overlapPasses || meanAbsTangentDot < opts.minTangentCosine) {
    return {
      compatible: false,
      orthogonalRejected: false,
      meanPerpDistancePx,
      meanAbsTangentDot,
      signedTangentDotMean,
      overlapFraction,
      affinityScore: 0,
    };
  }

  const distFactor = Math.max(0.05, 1 - meanPerpDistancePx / (opts.clusterBandwidthPx * 1.25));
  const affinityScore = distFactor * meanAbsTangentDot * Math.max(0.25, overlapFraction);
  return {
    compatible: true,
    orthogonalRejected: false,
    meanPerpDistancePx,
    meanAbsTangentDot,
    signedTangentDotMean,
    overlapFraction,
    affinityScore,
  };
}

function selectMedoidIndex(
  indices: readonly number[],
  strokes: readonly NormalizedSketchStroke[],
  getPair: (i: number, j: number) => PairwiseAffinityEvaluation | undefined,
): number {
  let bestIdx = indices[0] ?? 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < indices.length; i += 1) {
    const a = indices[i];
    if (a === undefined) continue;
    const strokeA = strokes[a];
    if (!strokeA) continue;
    let affinitySum = 0;
    for (let j = 0; j < indices.length; j += 1) {
      if (i === j) continue;
      const b = indices[j];
      if (b === undefined) continue;
      const p = getPair(a, b);
      if (p && p.compatible) {
        affinitySum += p.affinityScore;
      }
    }
    const score = affinitySum * 10 + Math.sqrt(strokeA.totalLengthPx) * 0.2 + strokeA.confidence;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = a;
    }
  }
  return bestIdx;
}

/**
 * 다중 겹침 러프 스트로크를 방향-거리 이중 기준으로 군집화한다.
 * 직교·교차선은 절대 병합하지 않고 독립 클러스터로 분리한다.
 */
export function clusterOverdrawnSketchStrokes(
  rawStrokes: readonly RawSketchStroke[],
  options?: SketchConsolidationOptions,
): SketchClusteringResult {
  const resolved = resolveSketchConsolidationOptions(options);
  const normalizedStrokes: NormalizedSketchStroke[] = [];
  let droppedInvalidStrokes = 0;
  let sanitizedInvalidPoints = 0;

  for (let i = 0; i < rawStrokes.length; i += 1) {
    const raw = rawStrokes[i];
    if (!raw || !Array.isArray(raw.points)) {
      droppedInvalidStrokes += 1;
      continue;
    }
    const { normalized, droppedPoints } = normalizeAndResampleSketchStroke(
      raw,
      resolved.resampleStepPx,
    );
    sanitizedInvalidPoints += droppedPoints;
    if (!normalized) {
      droppedInvalidStrokes += 1;
      continue;
    }
    normalizedStrokes.push(normalized);
  }

  const n = normalizedStrokes.length;
  const pairMap = new Map<string, PairwiseAffinityEvaluation>();
  const adjacency: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    adjacency.push([]);
  }

  let orthogonalRejectedPairs = 0;
  for (let i = 0; i < n; i += 1) {
    const sI = normalizedStrokes[i];
    if (!sI) continue;
    for (let j = i + 1; j < n; j += 1) {
      const sJ = normalizedStrokes[j];
      if (!sJ) continue;
      const ev = evaluateStrokePairAffinity(sI, sJ, resolved);
      pairMap.set(`${i}:${j}`, ev);
      if (ev.orthogonalRejected) {
        orthogonalRejectedPairs += 1;
      }
      if (ev.compatible) {
        adjacency[i]?.push(j);
        adjacency[j]?.push(i);
      }
    }
  }

  const getPair = (i: number, j: number): PairwiseAffinityEvaluation | undefined => {
    const lo = Math.min(i, j);
    const hi = Math.max(i, j);
    return pairMap.get(`${lo}:${hi}`);
  };

  const visited = new Uint8Array(n);
  const rawComponents: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    if (visited[i]) continue;
    const queue: number[] = [i];
    visited[i] = 1;
    const comp: number[] = [];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === undefined) continue;
      comp.push(cur);
      const neighbors = adjacency[cur] ?? [];
      for (let k = 0; k < neighbors.length; k += 1) {
        const nxt = neighbors[k];
        if (nxt !== undefined && !visited[nxt]) {
          visited[nxt] = 1;
          queue.push(nxt);
        }
      }
    }
    comp.sort((a, b) => a - b);
    rawComponents.push(comp);
  }

  const validatedGroups: number[][] = [];
  for (let c = 0; c < rawComponents.length; c += 1) {
    const remaining = (rawComponents[c] ?? []).slice();
    while (remaining.length > 0) {
      const repIdx = selectMedoidIndex(remaining, normalizedStrokes, getPair);
      const group: number[] = [repIdx];
      const nextRemaining: number[] = [];

      for (let k = 0; k < remaining.length; k += 1) {
        const candidate = remaining[k];
        if (candidate === undefined || candidate === repIdx) continue;
        const pairRep = getPair(repIdx, candidate);
        const alignedWithAll = group.every((existing) => {
          const p = getPair(existing, candidate);
          return !p || !p.orthogonalRejected;
        });
        if (pairRep && !pairRep.orthogonalRejected && alignedWithAll) {
          group.push(candidate);
        } else {
          nextRemaining.push(candidate);
        }
      }
      group.sort((a, b) => a - b);
      validatedGroups.push(group);
      remaining.length = 0;
      for (let k = 0; k < nextRemaining.length; k += 1) {
        const nxt = nextRemaining[k];
        if (nxt !== undefined) remaining.push(nxt);
      }
    }
  }

  let orthogonalFalseMergeCount = 0;
  const clusters: OverdrawStrokeCluster[] = [];

  for (let g = 0; g < validatedGroups.length; g += 1) {
    const indices = validatedGroups[g] ?? [];
    if (indices.length === 0) continue;
    const repIdx = selectMedoidIndex(indices, normalizedStrokes, getPair);
    const repStroke = normalizedStrokes[repIdx];
    if (!repStroke) continue;

    const members: AlignedClusterMember[] = [];
    const memberIds: string[] = [];
    let distSum = 0;
    let dotSum = 0;
    let pairCount = 0;
    let reversedMemberCount = 0;

    for (let m = 0; m < indices.length; m += 1) {
      const idx = indices[m];
      if (idx === undefined) continue;
      const stroke = normalizedStrokes[idx];
      if (!stroke) continue;
      memberIds.push(stroke.strokeId);

      if (idx === repIdx) {
        members.push({
          strokeId: stroke.strokeId,
          reversed: false,
          meanPerpDistancePx: 0,
          meanAbsTangentDot: 1,
          overlapFraction: 1,
          huberMeanWeight: 1,
          isOutlierSuppressed: false,
        });
        continue;
      }

      const ev = evaluateStrokePairAffinity(stroke, repStroke, resolved);
      const reversed = ev.signedTangentDotMean < 0;
      if (reversed) reversedMemberCount += 1;

      const finiteDist = Number.isFinite(ev.meanPerpDistancePx) ? ev.meanPerpDistancePx : 0;
      distSum += finiteDist;
      dotSum += ev.meanAbsTangentDot;
      pairCount += 1;

      members.push({
        strokeId: stroke.strokeId,
        reversed,
        meanPerpDistancePx: finiteDist,
        meanAbsTangentDot: ev.meanAbsTangentDot,
        overlapFraction: ev.overlapFraction,
        huberMeanWeight: huberRobustWeight(finiteDist, resolved.huberDeltaPx),
        isOutlierSuppressed: finiteDist > resolved.huberDeltaPx * 1.35,
      });
    }

    for (let i = 0; i < indices.length; i += 1) {
      const idxA = indices[i];
      if (idxA === undefined) continue;
      for (let j = i + 1; j < indices.length; j += 1) {
        const idxB = indices[j];
        if (idxB === undefined) continue;
        const p = getPair(idxA, idxB);
        if (p && p.orthogonalRejected) {
          orthogonalFalseMergeCount += 1;
        }
      }
    }

    clusters.push({
      clusterId: `cluster-${String(g + 1).padStart(3, "0")}`,
      representativeStrokeId: repStroke.strokeId,
      memberStrokeIds: memberIds,
      members,
      strokeCount: memberIds.length,
      meanPairwiseDistancePx: pairCount > 0 ? distSum / pairCount : 0,
      meanTangentCoherence: pairCount > 0 ? dotSum / pairCount : 1,
      reversedMemberCount,
      outlierSuppressedCount: members.filter((m) => m.isOutlierSuppressed).length,
    });
  }

  return {
    clusters,
    normalizedStrokes,
    orthogonalRejectedPairs,
    orthogonalFalseMergeCount,
    totalInputStrokes: rawStrokes.length,
    validInputStrokes: normalizedStrokes.length,
    droppedInvalidStrokes,
    sanitizedInvalidPoints,
    options: resolved,
  };
}
