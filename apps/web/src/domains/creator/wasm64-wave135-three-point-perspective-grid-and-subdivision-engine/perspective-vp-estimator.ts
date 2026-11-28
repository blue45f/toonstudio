/**
 * Wave 135 — 가이드 선분 집합 기반 결정론적 1·2·3점 소실점 역추정 솔버.
 *
 * - 상위 선분 쌍 교차점 + 평행선 방향 가설을 결정론적으로 생성하고 MSAC 스코어링으로
 *   이상치를 배제한 뒤, 동차 3×3 최소 고유벡터 IRLS 가중 최소제곱으로 정밀 수렴한다.
 */

import {
  buildLineThroughHomogeneousPoints,
  clampFinitePerspective,
  computeSegmentToVpAngleErrorDeg,
  homogeneousToVanishingPoint,
  normalizeVec2,
  smallestEigenvectorSymmetric3x3,
  type EstimateVanishingPointsOptions,
  type EstimatedVanishingPointCluster,
  type GuideSegment2D,
  type HomogeneousVec3,
  type OrthocenterPrincipalPointCheck,
  type PerspectiveAxisId,
  type PerspectiveMode,
  type VanishingPoint2D,
  type VanishingPointEstimationResult,
  type Vec2D,
} from "./perspective-types-and-math";

interface PreparedSegment {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly dx: number;
  readonly dy: number;
  readonly length: number;
  readonly weight: number;
  readonly axisHint: PerspectiveAxisId | "auto";
  readonly la: number;
  readonly lb: number;
  readonly lc: number;
}

interface RawVpCluster {
  readonly hintId: PerspectiveAxisId | null;
  readonly vpHomogeneous: HomogeneousVec3;
  readonly inliers: readonly PreparedSegment[];
}

function prepareSegments(segments: readonly GuideSegment2D[]): PreparedSegment[] {
  const prepared: PreparedSegment[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (
      !Number.isFinite(seg.x1) ||
      !Number.isFinite(seg.y1) ||
      !Number.isFinite(seg.x2) ||
      !Number.isFinite(seg.y2)
    ) {
      continue;
    }
    const vx = seg.x2 - seg.x1;
    const vy = seg.y2 - seg.y1;
    const length = Math.hypot(vx, vy);
    if (!Number.isFinite(length) || length < 1e-4) continue;
    const dx = vx / length;
    const dy = vy / length;
    const la = -dy;
    const lb = dx;
    const lc = -(la * seg.x1 + lb * seg.y1);
    const baseWeight =
      seg.weight !== undefined && Number.isFinite(seg.weight) && seg.weight > 0 ? seg.weight : 1;
    prepared.push({
      id: seg.id ?? `seg-${String(i)}`,
      x1: seg.x1,
      y1: seg.y1,
      x2: seg.x2,
      y2: seg.y2,
      dx,
      dy,
      length,
      weight: Math.sqrt(length) * baseWeight,
      axisHint: seg.axisHint ?? "auto",
      la,
      lb,
      lc,
    });
  }
  return prepared;
}

function solveWeightedHomogeneousVp(
  segments: readonly PreparedSegment[],
  weights: readonly number[],
  centerX: number,
  centerY: number,
  scale: number,
): HomogeneousVec3 {
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < segments.length; i += 1) {
    const w = weights[i];
    if (w <= 0) continue;
    const s = segments[i];
    const la = s.la * scale;
    const lb = s.lb * scale;
    const lc = s.la * centerX + s.lb * centerY + s.lc;
    const lNorm = Math.hypot(la, lb, lc);
    if (lNorm < 1e-12) continue;
    const na = la / lNorm;
    const nb = lb / lNorm;
    const nc = lc / lNorm;
    m[0] += w * na * na;
    m[1] += w * na * nb;
    m[2] += w * na * nc;
    m[4] += w * nb * nb;
    m[5] += w * nb * nc;
    m[8] += w * nc * nc;
  }
  m[3] = m[1];
  m[6] = m[2];
  m[7] = m[5];

  const eig = smallestEigenvectorSymmetric3x3(m);
  const rawW = eig[2];
  if (Math.abs(rawW) < 1e-5) {
    const dir = normalizeVec2(eig[0], eig[1]);
    return [dir.x, dir.y, 0];
  }
  return [(eig[0] / rawW) * scale + centerX, (eig[1] / rawW) * scale + centerY, 1];
}

function findSingleVpConsensus(
  pool: readonly PreparedSegment[],
  thresholdDeg: number,
  maxIrlsIterations: number,
  centerX: number,
  centerY: number,
  scale: number,
): { readonly vpHomogeneous: HomogeneousVec3; readonly inlierIndices: readonly number[] } | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) {
    return { vpHomogeneous: [pool[0].dx, pool[0].dy, 0], inlierIndices: [0] };
  }

  const order = pool
    .map((seg, idx) => ({ idx, length: seg.length }))
    .sort((a, b) => (b.length !== a.length ? b.length - a.length : a.idx - b.idx));
  const topCount = Math.min(48, order.length);

  const candidates: HomogeneousVec3[] = [];
  for (let i = 0; i < topCount; i += 1) {
    const si = pool[order[i].idx];
    for (let j = i + 1; j < topCount; j += 1) {
      const sj = pool[order[j].idx];
      const cx = si.lb * sj.lc - si.lc * sj.lb;
      const cy = si.lc * sj.la - si.la * sj.lc;
      const cw = si.la * sj.lb - si.lb * sj.la;
      if (Math.abs(cw) > 1e-7) {
        candidates.push([cx / cw, cy / cw, 1]);
      } else {
        const sign = si.dx * sj.dx + si.dy * sj.dy >= 0 ? 1 : -1;
        const avgDir = normalizeVec2(si.dx + sign * sj.dx, si.dy + sign * sj.dy);
        candidates.push([avgDir.x, avgDir.y, 0]);
      }
    }
  }

  let bestScore = -1;
  let bestVp: HomogeneousVec3 = [pool[0].dx, pool[0].dy, 0];
  const invTauSq = 1 / Math.max(1e-6, thresholdDeg * thresholdDeg);

  for (let c = 0; c < candidates.length; c += 1) {
    const cand = candidates[c];
    let score = 0;
    for (let k = 0; k < pool.length; k += 1) {
      const err = computeSegmentToVpAngleErrorDeg(pool[k], cand);
      if (err < thresholdDeg) {
        score += pool[k].weight * (1 - err * err * invTauSq);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestVp = cand;
    }
  }

  let currentVp = bestVp;
  const sigmaDeg = Math.max(0.35, thresholdDeg * 0.4);
  for (let iter = 0; iter < maxIrlsIterations; iter += 1) {
    const weights = new Array<number>(pool.length).fill(0);
    let activeCount = 0;
    for (let k = 0; k < pool.length; k += 1) {
      const err = computeSegmentToVpAngleErrorDeg(pool[k], currentVp);
      if (err <= thresholdDeg) {
        const ratio = err / sigmaDeg;
        weights[k] = pool[k].weight / (1 + ratio * ratio);
        activeCount += 1;
      }
    }
    if (activeCount < 2) break;
    const refined = solveWeightedHomogeneousVp(pool, weights, centerX, centerY, scale);
    let oldErrSum = 0;
    let newErrSum = 0;
    for (let k = 0; k < pool.length; k += 1) {
      if (weights[k] > 0) {
        oldErrSum += computeSegmentToVpAngleErrorDeg(pool[k], currentVp) * weights[k];
        newErrSum += computeSegmentToVpAngleErrorDeg(pool[k], refined) * weights[k];
      }
    }
    if (newErrSum <= oldErrSum + 1e-6) {
      currentVp = refined;
    } else {
      break;
    }
  }

  const inlierIndices: number[] = [];
  for (let k = 0; k < pool.length; k += 1) {
    if (computeSegmentToVpAngleErrorDeg(pool[k], currentVp) <= thresholdDeg) {
      inlierIndices.push(k);
    }
  }
  return { vpHomogeneous: currentVp, inlierIndices };
}

function averageVerticality(segments: readonly PreparedSegment[]): number {
  if (segments.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < segments.length; i += 1) sum += Math.abs(segments[i].dy);
  return sum / segments.length;
}

function projectedXForSort(h: HomogeneousVec3): number {
  return Math.abs(h[2]) > 1e-8 ? h[0] / h[2] : h[0] * 1e9;
}

function assignClusterRoles(
  rawClusters: readonly RawVpCluster[],
  hasExplicitHints: boolean,
): Map<PerspectiveAxisId, RawVpCluster> {
  const map = new Map<PerspectiveAxisId, RawVpCluster>();
  if (hasExplicitHints) {
    for (let i = 0; i < rawClusters.length; i += 1) {
      const c = rawClusters[i];
      if (c.hintId !== null) map.set(c.hintId, c);
    }
    return map;
  }
  if (rawClusters.length === 3) {
    let vertIdx = 0;
    let maxVert = -1;
    for (let i = 0; i < 3; i += 1) {
      const vScore = averageVerticality(rawClusters[i].inliers);
      if (vScore > maxVert) {
        maxVert = vScore;
        vertIdx = i;
      }
    }
    map.set("VP3", rawClusters[vertIdx]);
    const horiz = rawClusters.filter((_, idx) => idx !== vertIdx);
    const leftFirst = projectedXForSort(horiz[0].vpHomogeneous) <= projectedXForSort(horiz[1].vpHomogeneous);
    map.set("VP1", leftFirst ? horiz[0] : horiz[1]);
    map.set("VP2", leftFirst ? horiz[1] : horiz[0]);
    return map;
  }
  if (rawClusters.length === 2) {
    const v0 = averageVerticality(rawClusters[0].inliers);
    const v1 = averageVerticality(rawClusters[1].inliers);
    if (Math.max(v0, v1) > 0.88 && Math.min(v0, v1) < 0.65) {
      map.set("VP3", v0 > v1 ? rawClusters[0] : rawClusters[1]);
      map.set("VP1", v0 > v1 ? rawClusters[1] : rawClusters[0]);
      return map;
    }
    const leftFirst =
      projectedXForSort(rawClusters[0].vpHomogeneous) <=
      projectedXForSort(rawClusters[1].vpHomogeneous);
    map.set("VP1", leftFirst ? rawClusters[0] : rawClusters[1]);
    map.set("VP2", leftFirst ? rawClusters[1] : rawClusters[0]);
    return map;
  }
  if (rawClusters.length === 1) {
    map.set("VP1", rawClusters[0]);
  }
  return map;
}

/**
 * 1점·2점·3점 직교 가이드 선분 집합에서 소실점과 지평선 기울기를 결정론적으로 역추정한다.
 */
export function estimateVanishingPointsFromGuidesCore(
  segments: readonly GuideSegment2D[],
  options: EstimateVanishingPointsOptions,
  verifyOrthocenterFn: (
    vp1: VanishingPoint2D,
    vp2: VanishingPoint2D,
    vp3: VanishingPoint2D,
    principalPoint: Vec2D,
    expectedFocalLengthPx?: number,
    tolerancePx?: number,
  ) => OrthocenterPrincipalPointCheck,
): VanishingPointEstimationResult {
  const canvasWidth = clampFinitePerspective(options.canvasWidth, 64, 16384, 1200);
  const canvasHeight = clampFinitePerspective(options.canvasHeight, 64, 16384, 800);
  const principalPoint: Vec2D = options.principalPoint ?? {
    x: canvasWidth * 0.5,
    y: canvasHeight * 0.5,
  };
  const thresholdDeg = clampFinitePerspective(options.inlierAngleThresholdDeg ?? 2.5, 0.2, 20, 2.5);
  const maxIrlsIterations = Math.round(
    clampFinitePerspective(options.maxIrlsIterations ?? 8, 1, 25, 8),
  );
  const scale = Math.max(canvasWidth, canvasHeight);

  const prepared = prepareSegments(segments);
  if (prepared.length === 0) {
    return {
      detectedMode: "1-point",
      clusters: [],
      vp1: null,
      vp2: null,
      vp3: null,
      horizonLine: null,
      orthocenterCheck: null,
      totalValidSegments: 0,
      totalInlierCount: 0,
      inlierRatio: 0,
      outlierSegmentIds: [],
      overallMeanInlierAngleErrorDeg: 0,
    };
  }

  const maxTargetVps =
    options.perspectiveMode === "1-point" ? 1 : options.perspectiveMode === "2-point" ? 2 : 3;
  const hasExplicitHints = prepared.some((s) => s.axisHint !== "auto");
  const rawClusters: RawVpCluster[] = [];
  const assignedIds = new Set<string>();

  if (hasExplicitHints) {
    const axes: readonly PerspectiveAxisId[] = ["VP1", "VP2", "VP3"];
    for (let a = 0; a < axes.length; a += 1) {
      const axis = axes[a];
      const group = prepared.filter((s) => s.axisHint === axis);
      if (group.length < 2) continue;
      const found = findSingleVpConsensus(
        group,
        thresholdDeg,
        maxIrlsIterations,
        principalPoint.x,
        principalPoint.y,
        scale,
      );
      if (found && found.inlierIndices.length >= 2) {
        const inliers = found.inlierIndices.map((idx) => group[idx]);
        for (let i = 0; i < inliers.length; i += 1) assignedIds.add(inliers[i].id);
        rawClusters.push({ hintId: axis, vpHomogeneous: found.vpHomogeneous, inliers });
      }
    }
  } else {
    let remaining = prepared.slice();
    for (let k = 0; k < maxTargetVps; k += 1) {
      if (remaining.length < 2) break;
      const found = findSingleVpConsensus(
        remaining,
        thresholdDeg,
        maxIrlsIterations,
        principalPoint.x,
        principalPoint.y,
        scale,
      );
      if (!found || found.inlierIndices.length < 2) break;
      const inlierSet = new Set<number>(found.inlierIndices);
      const inliers: PreparedSegment[] = [];
      const nextRemaining: PreparedSegment[] = [];
      for (let i = 0; i < remaining.length; i += 1) {
        if (inlierSet.has(i)) {
          inliers.push(remaining[i]);
          assignedIds.add(remaining[i].id);
        } else {
          nextRemaining.push(remaining[i]);
        }
      }
      rawClusters.push({ hintId: null, vpHomogeneous: found.vpHomogeneous, inliers });
      remaining = nextRemaining;
    }
  }

  const roleAssigned = assignClusterRoles(rawClusters, hasExplicitHints);
  const orderedAxes: readonly PerspectiveAxisId[] = ["VP1", "VP2", "VP3"];
  const clusters: EstimatedVanishingPointCluster[] = [];
  let totalInlierErrSum = 0;
  let totalInlierCount = 0;
  let vp1: VanishingPoint2D | null = null;
  let vp2: VanishingPoint2D | null = null;
  let vp3: VanishingPoint2D | null = null;

  for (let i = 0; i < orderedAxes.length; i += 1) {
    const axis = orderedAxes[i];
    const rc = roleAssigned.get(axis);
    if (!rc) continue;
    const worldAxis: "X" | "Y" | "Z" = axis === "VP3" ? "Y" : axis === "VP1" ? "X" : "Z";
    const vp = homogeneousToVanishingPoint(axis, worldAxis, rc.vpHomogeneous, principalPoint);
    if (axis === "VP1") vp1 = vp;
    if (axis === "VP2") vp2 = vp;
    if (axis === "VP3") vp3 = vp;

    let errSum = 0;
    let maxErr = 0;
    for (let j = 0; j < rc.inliers.length; j += 1) {
      const e = computeSegmentToVpAngleErrorDeg(rc.inliers[j], vp.homogeneous);
      errSum += e;
      if (e > maxErr) maxErr = e;
    }
    totalInlierErrSum += errSum;
    totalInlierCount += rc.inliers.length;
    clusters.push({
      id: axis,
      vanishingPoint: vp,
      inlierSegmentIds: rc.inliers.map((s) => s.id),
      inlierCount: rc.inliers.length,
      meanAngleErrorDeg: rc.inliers.length > 0 ? errSum / rc.inliers.length : 0,
      maxInlierAngleErrorDeg: maxErr,
    });
  }

  const horizonLine =
    vp1 !== null && vp2 !== null
      ? buildLineThroughHomogeneousPoints(vp1.homogeneous, vp2.homogeneous, principalPoint.x)
      : null;
  const orthocenterCheck =
    vp1 !== null && vp2 !== null && vp3 !== null
      ? verifyOrthocenterFn(vp1, vp2, vp3, principalPoint, undefined, 25)
      : null;

  const finiteVpCount =
    (vp1 !== null && vp1.isFinite ? 1 : 0) +
    (vp2 !== null && vp2.isFinite ? 1 : 0) +
    (vp3 !== null && vp3.isFinite ? 1 : 0);
  const detectedMode: PerspectiveMode =
    finiteVpCount >= 3 ? "3-point" : finiteVpCount === 2 ? "2-point" : "1-point";

  return {
    detectedMode,
    clusters,
    vp1,
    vp2,
    vp3,
    horizonLine,
    orthocenterCheck,
    totalValidSegments: prepared.length,
    totalInlierCount,
    inlierRatio: prepared.length > 0 ? totalInlierCount / prepared.length : 0,
    outlierSegmentIds: prepared.filter((s) => !assignedIds.has(s.id)).map((s) => s.id),
    overallMeanInlierAngleErrorDeg:
      totalInlierCount > 0 ? totalInlierErrSum / totalInlierCount : 0,
  };
}
