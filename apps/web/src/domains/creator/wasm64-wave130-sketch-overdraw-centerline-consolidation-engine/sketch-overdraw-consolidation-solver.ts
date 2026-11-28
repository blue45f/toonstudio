/**
 * Wave 130 — 후버 강건 주곡선 중앙선 통합 & 만화 G펜 필압 자동 복원 솔버.
 *
 * - 대표 메도이드 방향에 맞춰 역방향 왕복 필기를 자동 반전 정렬하고,
 *   후버(Huber) 강건 가중 주곡선 IRLS 3회 반복으로 외곽 아웃라이어 삐침을 억제해 단일 먹선으로 통합한다.
 * - 진입·이탈 양 끝단 테이퍼, 러프 중첩 밀도, 국소 곡률을 결합한 만화 G펜 가변 선폭을 복원하고
 *   순수 ES2017 동기 FIPS 180-4 SHA-256 결정론 지문을 산출한다.
 */

import {
  clusterOverdrawnSketchStrokes,
  huberRobustWeight,
} from "./sketch-overdraw-clustering";
import {
  attachTangentsToSamples,
  clampFinite,
  computeDiscreteCurvatures,
  computeSamplesBBox,
  computeSha256Hex,
  normalizeAndResampleSketchStroke,
  projectPointOntoSamples,
  reverseNormalizedStroke,
  smoothOpenPolylinePreservingEndpoints,
  type WeightedPolylinePoint,
} from "./sketch-consolidation-sha256-and-math";
import type {
  AlignedClusterMember,
  ConsolidatedInkStroke,
  GpenInkSample,
  NormalizedSketchStroke,
  OverdrawStrokeCluster,
  RawSketchStroke,
  ResampledSketchSample,
  ResolvedSketchConsolidationOptions,
  SketchConsolidationMetrics,
  SketchConsolidationOptions,
  SketchConsolidationResult,
} from "./sketch-consolidation-types";

export { clusterOverdrawnSketchStrokes };

function buildSpineSamplesFromWeightedPoints(
  points: readonly WeightedPolylinePoint[],
  resampleStepPx: number,
): { readonly samples: ResampledSketchSample[]; readonly totalLengthPx: number } {
  const norm = normalizeAndResampleSketchStroke(
    { strokeId: "__spine__", points },
    resampleStepPx,
  ).normalized;
  if (norm) {
    return { samples: norm.samples.slice(), totalLengthPx: norm.totalLengthPx };
  }
  const cumArc: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    total += Math.hypot(b.x - a.x, b.y - a.y);
    cumArc.push(total);
  }
  return {
    samples: attachTangentsToSamples(points, cumArc, Math.max(total, 1e-4)),
    totalLengthPx: Math.max(total, 1e-4),
  };
}

function computeGpenTaperFactor(normalizedT: number, taperRatio: number): number {
  const minTip = 0.24;
  let factor = 1.0;
  if (normalizedT < taperRatio) {
    const u = clampFinite(normalizedT / taperRatio, 0, 1, 0);
    const smooth = u * u * (3 - 2 * u);
    factor = Math.min(factor, minTip + (1 - minTip) * smooth);
  }
  if (normalizedT > 1 - taperRatio) {
    const u = clampFinite((1 - normalizedT) / taperRatio, 0, 1, 0);
    const smooth = u * u * (3 - 2 * u);
    factor = Math.min(factor, minTip + (1 - minTip) * smooth);
  }
  return clampFinite(factor, minTip, 1.0, 1.0);
}

function buildGpenSamples(
  samples: readonly ResampledSketchSample[],
  densities: readonly number[],
  opts: ResolvedSketchConsolidationOptions,
): GpenInkSample[] {
  const curvatures = computeDiscreteCurvatures(samples);
  const out: GpenInkSample[] = [];
  const minAllowedWidth = Math.max(0.32, opts.gpenBaseWidthPx * 0.22);

  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (!s) continue;
    const nx = -s.ty;
    const ny = s.tx;
    const curvature = curvatures[i] ?? 0;
    const density = Math.max(1, densities[i] ?? 1);
    const taperFactor = computeGpenTaperFactor(s.normalizedT, opts.taperRatio);

    const densityBoost = clampFinite(Math.log(1 + Math.max(0, density - 1)) / Math.log(8), 0, 1, 0);
    const curvatureBoost = clampFinite(curvature / 0.035, 0, 1, 0);
    const bodyFactor = clampFinite(
      0.45 * s.pressure + 0.37 * densityBoost + 0.18 * curvatureBoost,
      0.05,
      1.0,
      0.5,
    );

    const bodyWidth =
      opts.gpenBaseWidthPx + (opts.gpenMaxWidthPx - opts.gpenBaseWidthPx) * bodyFactor;
    const widthPx = clampFinite(
      bodyWidth * taperFactor,
      minAllowedWidth,
      opts.gpenMaxWidthPx,
      opts.gpenBaseWidthPx,
    );
    const restoredPressure = clampFinite(
      bodyFactor * (0.35 + 0.65 * taperFactor),
      0.05,
      1.0,
      0.5,
    );
    const halfW = widthPx * 0.5;

    out.push({
      x: s.x,
      y: s.y,
      arcLengthPx: s.arcLengthPx,
      normalizedT: s.normalizedT,
      tx: s.tx,
      ty: s.ty,
      nx,
      ny,
      curvatureRadPerPx: curvature,
      overdrawDensity: density,
      restoredPressure,
      widthPx,
      taperFactor,
      leftEdge: { x: s.x + nx * halfW, y: s.y + ny * halfW },
      rightEdge: { x: s.x - nx * halfW, y: s.y - ny * halfW },
    });
  }

  return out;
}

/**
 * 대표 메도이드 스파인 앞뒤로 공선 치킨스크래치 연장 구간을 매끄럽게 이어 붙인다.
 * 외곽 삐침(횡방향 편차 > huberDeltaPx * 1.1)은 연장 후보에서 차단한다.
 */
function buildExtendedInitialSpine(
  rep: NormalizedSketchStroke,
  alignedStrokes: readonly NormalizedSketchStroke[],
  opts: ResolvedSketchConsolidationOptions,
): ResampledSketchSample[] {
  const startPt = rep.samples[0];
  const endPt = rep.samples[rep.samples.length - 1];
  if (!startPt || !endPt) return rep.samples.slice();

  const tightLatTol = opts.huberDeltaPx * 1.1;
  let bestStartBranch: WeightedPolylinePoint[] = [];
  let bestStartReach = 0;
  let bestEndBranch: WeightedPolylinePoint[] = [];
  let bestEndReach = 0;

  for (let m = 0; m < alignedStrokes.length; m += 1) {
    const s = alignedStrokes[m];
    if (!s || s.strokeId === rep.strokeId) continue;

    // 시작점 이전 치킨스크래치 연장 검사
    const beforePts: WeightedPolylinePoint[] = [];
    let maxBeforeReach = 0;
    for (let i = 0; i < s.samples.length; i += 1) {
      const p = s.samples[i];
      if (!p) continue;
      const dx = p.x - startPt.x;
      const dy = p.y - startPt.y;
      const longS = dx * startPt.tx + dy * startPt.ty;
      const latS = Math.abs(-dx * startPt.ty + dy * startPt.tx);
      const tanDot = p.tx * startPt.tx + p.ty * startPt.ty;
      if (longS < -opts.resampleStepPx && latS <= tightLatTol && tanDot >= opts.minTangentCosine) {
        beforePts.push({ x: p.x, y: p.y, pressure: p.pressure });
        if (-longS > maxBeforeReach) maxBeforeReach = -longS;
      } else if (longS >= -opts.resampleStepPx) {
        break;
      }
    }
    if (beforePts.length > 0 && maxBeforeReach > bestStartReach) {
      bestStartReach = maxBeforeReach;
      bestStartBranch = beforePts;
    }

    // 끝점 이후 치킨스크래치 연장 검사
    const afterPts: WeightedPolylinePoint[] = [];
    let maxAfterReach = 0;
    for (let i = s.samples.length - 1; i >= 0; i -= 1) {
      const p = s.samples[i];
      if (!p) continue;
      const dx = p.x - endPt.x;
      const dy = p.y - endPt.y;
      const longE = dx * endPt.tx + dy * endPt.ty;
      const latE = Math.abs(-dx * endPt.ty + dy * endPt.tx);
      const tanDot = p.tx * endPt.tx + p.ty * endPt.ty;
      if (longE > opts.resampleStepPx && latE <= tightLatTol && tanDot >= opts.minTangentCosine) {
        afterPts.push({ x: p.x, y: p.y, pressure: p.pressure });
        if (longE > maxAfterReach) maxAfterReach = longE;
      } else if (longE <= opts.resampleStepPx) {
        break;
      }
    }
    if (afterPts.length > 0 && maxAfterReach > bestEndReach) {
      afterPts.reverse();
      bestEndReach = maxAfterReach;
      bestEndBranch = afterPts;
    }
  }

  const combined: WeightedPolylinePoint[] = [];
  for (let i = 0; i < bestStartBranch.length; i += 1) {
    const p = bestStartBranch[i];
    if (p) combined.push(p);
  }
  for (let i = 0; i < rep.samples.length; i += 1) {
    const p = rep.samples[i];
    if (p) combined.push({ x: p.x, y: p.y, pressure: p.pressure });
  }
  for (let i = 0; i < bestEndBranch.length; i += 1) {
    const p = bestEndBranch[i];
    if (p) combined.push(p);
  }

  return buildSpineSamplesFromWeightedPoints(combined, opts.resampleStepPx).samples;
}

function fitHuberCenterlineForCluster(
  cluster: OverdrawStrokeCluster,
  alignedStrokes: readonly NormalizedSketchStroke[],
  opts: ResolvedSketchConsolidationOptions,
  inkIndex: number,
): {
  readonly inkStroke: ConsolidatedInkStroke;
  readonly updatedCluster: OverdrawStrokeCluster;
} {
  const repIdx = alignedStrokes.findIndex((s) => s.strokeId === cluster.representativeStrokeId);
  const rep = alignedStrokes[repIdx >= 0 ? repIdx : 0];
  if (!rep) {
    return {
      inkStroke: finalizeInkStroke(
        `ink-${String(inkIndex + 1).padStart(3, "0")}`,
        cluster.clusterId,
        cluster.memberStrokeIds,
        [],
        0,
        0,
        0,
        0,
        0,
        true,
      ),
      updatedCluster: cluster,
    };
  }

  // 단독 깔끔한 선은 원본 형상을 훼손하지 않고 그대로 통과시킨다.
  if (alignedStrokes.length === 1) {
    const densities = new Array<number>(rep.samples.length).fill(1);
    const gpenSamples = buildGpenSamples(rep.samples, densities, opts);
    return {
      inkStroke: finalizeInkStroke(
        `ink-${String(inkIndex + 1).padStart(3, "0")}`,
        cluster.clusterId,
        cluster.memberStrokeIds,
        gpenSamples,
        rep.totalLengthPx,
        0,
        0,
        0,
        0,
        true,
      ),
      updatedCluster: cluster,
    };
  }

  let spineSamples: ResampledSketchSample[] = buildExtendedInitialSpine(rep, alignedStrokes, opts);
  const overhangTol = Math.max(opts.resampleStepPx * 1.35, opts.clusterBandwidthPx * 0.4);
  let strokeWeights: number[] = alignedStrokes.map((s) => s.confidence);

  // Huber IRLS 반복 투영: 법선 오프셋 중앙선 수렴 + 아웃라이어 억제
  for (let iter = 0; iter < opts.irlsIterations; iter += 1) {
    const nextPoints: WeightedPolylinePoint[] = [];
    const memberResidualSqSums = new Float64Array(alignedStrokes.length);
    const memberResidualCounts = new Uint32Array(alignedStrokes.length);

    for (let j = 0; j < spineSamples.length; j += 1) {
      const st = spineSamples[j];
      if (!st) continue;
      const nx = -st.ty;
      const ny = st.tx;
      const isEndpoint = j === 0 || j === spineSamples.length - 1;

      let normalOffsetWeightedSum = 0;
      let tangentOffsetWeightedSum = 0;
      let pressureWeightedSum = 0;
      let weightSum = 0;

      for (let m = 0; m < alignedStrokes.length; m += 1) {
        const member = alignedStrokes[m];
        if (!member) continue;
        const hit = projectPointOntoSamples(st, member.samples, member.totalLengthPx, overhangTol);
        if (!hit.withinSpan) continue;

        const dx = hit.x - st.x;
        const dy = hit.y - st.y;
        const signedNormal = dx * nx + dy * ny;
        const signedTangent = dx * st.tx + dy * st.ty;
        const lateralDist = Math.abs(signedNormal);

        memberResidualSqSums[m] = (memberResidualSqSums[m] ?? 0) + lateralDist * lateralDist;
        memberResidualCounts[m] = (memberResidualCounts[m] ?? 0) + 1;

        const ptHuberW = huberRobustWeight(lateralDist, opts.huberDeltaPx);
        const w = (strokeWeights[m] ?? 1) * ptHuberW * member.confidence;

        normalOffsetWeightedSum += signedNormal * w;
        if (isEndpoint) {
          const clampedTan = clampFinite(signedTangent, -opts.huberDeltaPx, opts.huberDeltaPx, 0);
          tangentOffsetWeightedSum += clampedTan * w;
        }
        pressureWeightedSum += hit.pressure * w;
        weightSum += w;
      }

      if (weightSum > 1e-6) {
        const avgNormal = normalOffsetWeightedSum / weightSum;
        const avgTan = isEndpoint ? tangentOffsetWeightedSum / weightSum : 0;
        nextPoints.push({
          x: st.x + nx * avgNormal + st.tx * avgTan,
          y: st.y + ny * avgNormal + st.ty * avgTan,
          pressure: clampFinite(pressureWeightedSum / weightSum, 0.05, 1.0, st.pressure),
        });
      } else {
        nextPoints.push({ x: st.x, y: st.y, pressure: st.pressure });
      }
    }

    strokeWeights = alignedStrokes.map((member, m) => {
      const cnt = memberResidualCounts[m] ?? 0;
      if (cnt === 0) return member.confidence * 0.25;
      const rms = Math.sqrt((memberResidualSqSums[m] ?? 0) / cnt);
      return member.confidence * huberRobustWeight(rms, opts.huberDeltaPx);
    });

    spineSamples = buildSpineSamplesFromWeightedPoints(nextPoints, opts.resampleStepPx).samples;
  }

  const smoothed = smoothOpenPolylinePreservingEndpoints(
    spineSamples.map((s) => ({ x: s.x, y: s.y, pressure: s.pressure })),
    opts.smoothingPasses,
    opts.chaikinSubdivisions,
  );
  const finalSpine = buildSpineSamplesFromWeightedPoints(smoothed, opts.resampleStepPx);
  const finalSamples = finalSpine.samples;
  const finalLengthPx = finalSpine.totalLengthPx;

  const densities = new Array<number>(finalSamples.length).fill(0);
  const updatedMembers: AlignedClusterMember[] = [];
  let huberWeightedSqSum = 0;
  let huberWeightTotal = 0;
  let rawSpreadSum = 0;
  let outlierSuppressedCount = 0;

  for (let m = 0; m < alignedStrokes.length; m += 1) {
    const member = alignedStrokes[m];
    if (!member) continue;
    const origMeta = cluster.members.find((cm) => cm.strokeId === member.strokeId);
    let sqSum = 0;
    let wSum = 0;
    let cnt = 0;

    for (let i = 0; i < member.samples.length; i += 1) {
      const p = member.samples[i];
      if (!p) continue;
      const hit = projectPointOntoSamples(p, finalSamples, finalLengthPx, overhangTol);
      if (!hit.withinSpan) continue;
      const w = huberRobustWeight(hit.distancePx, opts.huberDeltaPx);
      sqSum += hit.distancePx * hit.distancePx;
      wSum += w;
      cnt += 1;
    }

    const memberRmse = cnt > 0 ? Math.sqrt(sqSum / cnt) : 0;
    const meanWeight = cnt > 0 ? wSum / cnt : 1;
    const strokeW = huberRobustWeight(memberRmse, opts.huberDeltaPx);
    const isOutlier = memberRmse > opts.huberDeltaPx * 1.25 || meanWeight < 0.72;
    if (isOutlier) outlierSuppressedCount += 1;

    rawSpreadSum += memberRmse;
    huberWeightedSqSum += memberRmse * memberRmse * strokeW;
    huberWeightTotal += strokeW;

    updatedMembers.push({
      strokeId: member.strokeId,
      reversed: origMeta?.reversed ?? false,
      meanPerpDistancePx: memberRmse,
      meanAbsTangentDot: origMeta?.meanAbsTangentDot ?? 1,
      overlapFraction: origMeta?.overlapFraction ?? 1,
      huberMeanWeight: meanWeight,
      isOutlierSuppressed: isOutlier,
    });
  }

  for (let j = 0; j < finalSamples.length; j += 1) {
    const st = finalSamples[j];
    if (!st) continue;
    let localDensity = 0;
    for (let m = 0; m < alignedStrokes.length; m += 1) {
      const member = alignedStrokes[m];
      if (!member) continue;
      const hit = projectPointOntoSamples(st, member.samples, member.totalLengthPx, overhangTol);
      if (hit.withinSpan && hit.distancePx <= opts.clusterBandwidthPx * 1.15) {
        const w = huberRobustWeight(hit.distancePx, opts.huberDeltaPx);
        localDensity += w >= 0.4 ? 1 : w;
      }
    }
    densities[j] = Math.max(1, localDensity);
  }

  const huberResidualRmsePx =
    huberWeightTotal > 1e-6 ? Math.sqrt(huberWeightedSqSum / huberWeightTotal) : 0;
  const rawMemberMeanSpreadPx =
    alignedStrokes.length > 0 ? rawSpreadSum / alignedStrokes.length : 0;

  const gpenSamples = buildGpenSamples(finalSamples, densities, opts);
  const inkStroke = finalizeInkStroke(
    `ink-${String(inkIndex + 1).padStart(3, "0")}`,
    cluster.clusterId,
    cluster.memberStrokeIds,
    gpenSamples,
    finalLengthPx,
    huberResidualRmsePx,
    rawMemberMeanSpreadPx,
    cluster.reversedMemberCount,
    outlierSuppressedCount,
    false,
  );

  return {
    inkStroke,
    updatedCluster: {
      ...cluster,
      members: updatedMembers,
      outlierSuppressedCount,
    },
  };
}

function finalizeInkStroke(
  inkStrokeId: string,
  clusterId: string,
  sourceStrokeIds: readonly string[],
  samples: readonly GpenInkSample[],
  totalLengthPx: number,
  huberResidualRmsePx: number,
  rawMemberMeanSpreadPx: number,
  reversedSourceCount: number,
  outlierSuppressedCount: number,
  passthroughUnmodified: boolean,
): ConsolidatedInkStroke {
  let widthSum = 0;
  let minWidthPx = Number.POSITIVE_INFINITY;
  let maxWidthPx = 0;
  let maxCurvatureRadPerPx = 0;
  let peakOverdrawDensity = 1;

  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (!s) continue;
    widthSum += s.widthPx;
    if (s.widthPx < minWidthPx) minWidthPx = s.widthPx;
    if (s.widthPx > maxWidthPx) maxWidthPx = s.widthPx;
    if (s.curvatureRadPerPx > maxCurvatureRadPerPx) {
      maxCurvatureRadPerPx = s.curvatureRadPerPx;
    }
    if (s.overdrawDensity > peakOverdrawDensity) {
      peakOverdrawDensity = s.overdrawDensity;
    }
  }

  const n = Math.max(1, samples.length);
  const tipStartWidthPx = samples[0]?.widthPx ?? 0;
  const tipEndWidthPx = samples[samples.length - 1]?.widthPx ?? 0;
  const midIdx = Math.floor(samples.length * 0.5);
  const midWidthPx = samples[midIdx]?.widthPx ?? 0;

  return {
    inkStrokeId,
    clusterId,
    sourceStrokeIds,
    sourceStrokeCount: sourceStrokeIds.length,
    samples,
    totalLengthPx,
    meanWidthPx: widthSum / n,
    minWidthPx: Number.isFinite(minWidthPx) ? minWidthPx : 0,
    maxWidthPx,
    tipStartWidthPx,
    tipEndWidthPx,
    midWidthPx,
    maxCurvatureRadPerPx,
    peakOverdrawDensity,
    huberResidualRmsePx,
    rawMemberMeanSpreadPx,
    reversedSourceCount,
    outlierSuppressedCount,
    passthroughUnmodified,
  };
}

function buildCanonicalInkFingerprint(
  inkStrokes: readonly ConsolidatedInkStroke[],
  clusters: readonly OverdrawStrokeCluster[],
  metrics: SketchConsolidationMetrics,
  opts: ResolvedSketchConsolidationOptions,
): string {
  const parts: string[] = [
    `wave130-v1|bw=${opts.clusterBandwidthPx.toFixed(3)}|cos=${opts.minTangentCosine.toFixed(4)}|huber=${opts.huberDeltaPx.toFixed(3)}|step=${opts.resampleStepPx.toFixed(3)}`,
    `metrics|before=${metrics.strokeCountBefore}|after=${metrics.strokeCountAfter}|orthRej=${metrics.orthogonalRejectedPairs}|orthErr=${metrics.orthogonalFalseMergeCount}`,
  ];

  for (let c = 0; c < clusters.length; c += 1) {
    const cl = clusters[c];
    if (!cl) continue;
    parts.push(
      `cluster|${cl.clusterId}|rep=${cl.representativeStrokeId}|rev=${cl.reversedMemberCount}|out=${cl.outlierSuppressedCount}|ids=${cl.memberStrokeIds.join(",")}`,
    );
  }

  for (let i = 0; i < inkStrokes.length; i += 1) {
    const ink = inkStrokes[i];
    if (!ink) continue;
    const sampleSig = ink.samples
      .map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)},${s.widthPx.toFixed(3)}`)
      .join(";");
    parts.push(`ink|${ink.inkStrokeId}|len=${ink.totalLengthPx.toFixed(3)}|${sampleSig}`);
  }

  return computeSha256Hex(parts.join("\n"));
}

/**
 * 다중 겹침 러프 연필선 스케치를 단일 매끈한 가변폭 G펜 먹선으로 통합한다.
 */
export function consolidateRoughSketchToCleanInk(
  rawStrokes: readonly RawSketchStroke[],
  options?: SketchConsolidationOptions,
): SketchConsolidationResult {
  const clustering = clusterOverdrawnSketchStrokes(rawStrokes, options);
  const opts = clustering.options;

  const strokeById = new Map<string, NormalizedSketchStroke>();
  for (let i = 0; i < clustering.normalizedStrokes.length; i += 1) {
    const s = clustering.normalizedStrokes[i];
    if (s) strokeById.set(s.strokeId, s);
  }

  const inkStrokes: ConsolidatedInkStroke[] = [];
  const updatedClusters: OverdrawStrokeCluster[] = [];

  for (let c = 0; c < clustering.clusters.length; c += 1) {
    const cl = clustering.clusters[c];
    if (!cl) continue;
    const alignedStrokes: NormalizedSketchStroke[] = [];
    for (let m = 0; m < cl.members.length; m += 1) {
      const meta = cl.members[m];
      if (!meta) continue;
      const norm = strokeById.get(meta.strokeId);
      if (!norm) continue;
      alignedStrokes.push(meta.reversed ? reverseNormalizedStroke(norm) : norm);
    }
    if (alignedStrokes.length === 0) continue;

    const { inkStroke, updatedCluster } = fitHuberCenterlineForCluster(cl, alignedStrokes, opts, c);
    inkStrokes.push(inkStroke);
    updatedClusters.push(updatedCluster);
  }

  const strokeCountBefore = clustering.validInputStrokes;
  const strokeCountAfter = inkStrokes.length;
  const compressionRatio = strokeCountAfter > 0 ? strokeCountBefore / strokeCountAfter : 1;
  const strokeReductionPercent =
    strokeCountBefore > 0 ? ((strokeCountBefore - strokeCountAfter) / strokeCountBefore) * 100 : 0;

  let residualSum = 0;
  let spreadSum = 0;
  let tipMidRatioSum = 0;
  let totalReversed = 0;
  let totalOutliers = 0;
  let passthroughCount = 0;

  for (let i = 0; i < inkStrokes.length; i += 1) {
    const ink = inkStrokes[i];
    if (!ink) continue;
    residualSum += ink.huberResidualRmsePx;
    spreadSum += ink.rawMemberMeanSpreadPx;
    const tipAvg = 0.5 * (ink.tipStartWidthPx + ink.tipEndWidthPx);
    tipMidRatioSum += ink.midWidthPx > 1e-6 ? tipAvg / ink.midWidthPx : 1;
    totalReversed += ink.reversedSourceCount;
    totalOutliers += ink.outlierSuppressedCount;
    if (ink.passthroughUnmodified) passthroughCount += 1;
  }

  const denom = Math.max(1, inkStrokes.length);
  const metrics: SketchConsolidationMetrics = {
    strokeCountBefore,
    strokeCountAfter,
    compressionRatio,
    strokeReductionPercent,
    orthogonalRejectedPairs: clustering.orthogonalRejectedPairs,
    orthogonalFalseMergeCount: clustering.orthogonalFalseMergeCount,
    totalReversedAlignedStrokes: totalReversed,
    totalOutlierSuppressedStrokes: totalOutliers,
    meanClusterResidualRmsePx: inkStrokes.length > 0 ? residualSum / denom : 0,
    meanRawBundleSpreadPx: inkStrokes.length > 0 ? spreadSum / denom : 0,
    meanTipToMidWidthRatio: inkStrokes.length > 0 ? tipMidRatioSum / denom : 1,
    singleStrokePassthroughCount: passthroughCount,
  };

  const consolidatedInkSha256Hex = buildCanonicalInkFingerprint(
    inkStrokes,
    updatedClusters,
    metrics,
    opts,
  );

  for (let i = 0; i < inkStrokes.length; i += 1) {
    const ink = inkStrokes[i];
    if (ink) computeSamplesBBox(ink.samples);
  }

  return {
    inkStrokes,
    clusters: updatedClusters,
    rawNormalizedStrokes: clustering.normalizedStrokes,
    metrics,
    options: opts,
    consolidatedInkSha256Hex,
    droppedInvalidStrokes: clustering.droppedInvalidStrokes,
    sanitizedInvalidPoints: clustering.sanitizedInvalidPoints,
  };
}
