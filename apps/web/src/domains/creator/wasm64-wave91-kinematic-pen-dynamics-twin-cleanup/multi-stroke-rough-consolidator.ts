/**
 * 다중 겹침 러프 스케치 통합기 (치킨스크래치 클러스터링 + 모서리 커스프 보존 + 곡률 보존 손떨림 제거).
 *
 * - 경계상자 겹침 + 최근접 선분 거리 + 접선 방향 일관성(`|cos(dTheta)|`)으로 덧그린 러프 획을 묶고,
 *   직교 교차나 날카로운 모서리(머리카락 끝, 턱선, 옷깃)는 뭉개지지 않게 분리·보존한다.
 * - 가중 방향 투영과 Taubin 곡률 보존 평활화로 고주파 손떨림을 억제하면서 거시 곡률을 살린다.
 */

import {
  extractStrokeKinematics,
  sanitizeStylusPoints,
  type StylusKinematicStroke,
  type StylusSamplePoint,
} from "./artist-kinematic-pen-twin-profiler";
import {
  applyTaubinCurveSmoothing,
  bboxesOverlap,
  clampNumber,
  computeBBox,
  computeMean,
  computeTurningAngleDeg,
  detectSharpCornerIndices,
  nearestDistanceAndTangentToPolyline,
  resamplePolylineUniform,
  type BBox2D,
  type Point2D,
} from "./kinematic-geometry-primitives";
import {
  computeArcLengths,
  finalizeSpineDraft,
  registerOrFindCuspHub,
  weldDraftsAtCuspHubs,
  type BuiltSpineDraft,
  type ConsolidatedCenterlinePoint,
  type ConsolidatedSpineStroke,
  type CornerCuspHub,
  type ResampledSegmentSample,
} from "./rough-spine-cusp-welder";

export type { ConsolidatedCenterlinePoint, ConsolidatedSpineStroke };

export interface RoughConsolidationOptions {
  readonly clusterDistancePx?: number;
  readonly minTangentCoherence?: number;
  readonly minOverlapFraction?: number;
  readonly cornerAngleDegThreshold?: number;
  readonly resampleSpacingPx?: number;
  readonly smoothingIterations?: number;
  readonly preserveSingleStrokeMode?: boolean;
}

export interface RoughConsolidationMetrics {
  readonly inputStrokeCount: number;
  readonly consolidatedStrokeCount: number;
  readonly strokeReductionRatio: number;
  readonly meanHausdorffPx: number;
  readonly tremorReductionRatio: number;
  readonly preservedCornerCount: number;
}

export interface RoughConsolidationResult {
  readonly spines: readonly ConsolidatedSpineStroke[];
  readonly metrics: RoughConsolidationMetrics;
  readonly clusters: readonly (readonly string[])[];
}

interface SubStrokeUnit {
  readonly unitId: number;
  readonly sourceStrokeId: string;
  readonly points: readonly ResampledSegmentSample[];
  readonly bbox: BBox2D;
  readonly totalLengthPx: number;
  readonly inputTremorRatio: number;
  readonly startCuspKey: number | null;
  readonly endCuspKey: number | null;
}

const DEFAULT_CLUSTER_DISTANCE_PX = 14;
const DEFAULT_MIN_TANGENT_COHERENCE = 0.78;
const DEFAULT_MIN_OVERLAP_FRACTION = 0.25;
const DEFAULT_CORNER_ANGLE_DEG = 42;
const DEFAULT_RESAMPLE_SPACING_PX = 2.5;
const DEFAULT_SMOOTHING_ITERATIONS = 10;

function buildResampledSamples(
  points: readonly StylusSamplePoint[],
  spacingPx: number,
): ResampledSegmentSample[] {
  if (points.length < 2) return [];
  const arc = computeArcLengths(points);
  const speeds: number[] = new Array<number>(points.length).fill(220);
  for (let i = 1; i < points.length; i += 1) {
    const p0 = points[i - 1];
    const p1 = points[i];
    if (!p0 || !p1) continue;
    const ds = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    speeds[i] = ds / Math.max((p1.timestampMs - p0.timestampMs) / 1000, 0.004);
  }
  speeds[0] = speeds[1] ?? 220;

  const total = arc[arc.length - 1] ?? 0;
  if (total <= 1e-6) return [];
  const count = Math.max(2, Math.round(total / Math.max(1, spacingPx)) + 1);
  const rawPts: Array<{ readonly x: number; readonly y: number; readonly pressure: number; readonly speed: number }> = [];

  let seg = 0;
  for (let k = 0; k < count; k += 1) {
    const target = (total * k) / (count - 1);
    while (seg < arc.length - 2 && (arc[seg + 1] ?? 0) < target) seg += 1;
    const s0 = arc[seg] ?? 0;
    const s1 = arc[seg + 1] ?? total;
    const p0 = points[seg];
    const p1 = points[seg + 1] ?? p0;
    if (!p0 || !p1) continue;
    const t = s1 > s0 + 1e-9 ? clampNumber((target - s0) / (s1 - s0), 0, 1) : 0;
    const v0 = speeds[seg] ?? 220;
    rawPts.push({
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t,
      pressure: p0.pressure + (p1.pressure - p0.pressure) * t,
      speed: v0 + ((speeds[seg + 1] ?? v0) - v0) * t,
    });
  }

  const guide = applyTaubinCurveSmoothing(rawPts, 6);
  return rawPts.map((p, i) => {
    const gPrev = guide[Math.max(0, i - 1)] ?? p;
    const gNext = guide[Math.min(rawPts.length - 1, i + 1)] ?? p;
    const dx = gNext.x - gPrev.x;
    const dy = gNext.y - gPrev.y;
    const len = Math.hypot(dx, dy);
    return {
      x: p.x,
      y: p.y,
      tangentX: len > 1e-9 ? dx / len : 1,
      tangentY: len > 1e-9 ? dy / len : 0,
      pressure: p.pressure,
      speedPxPerSec: p.speed,
    };
  });
}

function shouldMergeSubStrokes(
  a: SubStrokeUnit,
  b: SubStrokeUnit,
  clusterDistancePx: number,
  minTangentCoherence: number,
  minOverlapFraction: number,
): boolean {
  if (!bboxesOverlap(a.bbox, b.bbox, clusterDistancePx)) return false;
  const shorter = a.points.length <= b.points.length ? a : b;
  const longer = shorter === a ? b : a;
  if (shorter.points.length < 2 || longer.points.length < 2) return false;

  let matched = 0;
  let distSum = 0;
  for (let i = 0; i < shorter.points.length; i += 1) {
    const sp = shorter.points[i];
    if (!sp) continue;
    const nearest = nearestDistanceAndTangentToPolyline(sp, longer.points);
    if (nearest.dist > clusterDistancePx) continue;
    if (Math.abs(sp.tangentX * nearest.tangentX + sp.tangentY * nearest.tangentY) >= minTangentCoherence) {
      matched += 1;
      distSum += nearest.dist;
    }
  }
  return matched >= 2 && matched / shorter.points.length >= minOverlapFraction && distSum / matched <= clusterDistancePx * 0.9;
}

function alignUnitDirection(
  unit: SubStrokeUnit,
  seed: readonly ResampledSegmentSample[],
): { readonly pts: ResampledSegmentSample[]; readonly reversed: boolean } {
  let dotSum = 0;
  for (let i = 0; i < unit.points.length; i += 1) {
    const p = unit.points[i];
    if (!p) continue;
    const nearest = nearestDistanceAndTangentToPolyline(p, seed);
    dotSum += p.tangentX * nearest.tangentX + p.tangentY * nearest.tangentY;
  }
  if (dotSum >= 0) return { pts: [...unit.points], reversed: false };
  return {
    pts: [...unit.points].reverse().map((p) => ({ ...p, tangentX: -p.tangentX, tangentY: -p.tangentY })),
    reversed: true,
  };
}

function buildClusterCenterline(
  units: readonly SubStrokeUnit[],
  clusterDistancePx: number,
  minTangentCoherence: number,
  resampleSpacingPx: number,
  smoothingIterations: number,
): {
  readonly samples: ResampledSegmentSample[];
  readonly densities: number[];
  readonly startHubId: number | null;
  readonly endHubId: number | null;
} {
  let seedUnit = units[0];
  for (let i = 1; i < units.length; i += 1) {
    const cand = units[i];
    if (cand && seedUnit && cand.totalLengthPx > seedUnit.totalLengthPx) seedUnit = cand;
  }
  if (!seedUnit) return { samples: [], densities: [], startHubId: null, endHubId: null };

  const alignedSets = units.map((u) => ({ unit: u, ...alignUnitDirection(u, seedUnit.points) }));
  const startHubs = alignedSets
    .map((e) => (e.reversed ? e.unit.endCuspKey : e.unit.startCuspKey))
    .filter((id): id is number => id !== null);
  const endHubs = alignedSets
    .map((e) => (e.reversed ? e.unit.startCuspKey : e.unit.endCuspKey))
    .filter((id): id is number => id !== null);

  let spinePts = applyTaubinCurveSmoothing(
    resamplePolylineUniform(seedUnit.points, resampleSpacingPx),
    Math.max(4, smoothingIterations),
  );
  let lastPressures = new Array<number>(spinePts.length).fill(0.5);
  let lastSpeeds = new Array<number>(spinePts.length).fill(260);
  let lastDensities = new Array<number>(spinePts.length).fill(1);

  if (alignedSets.length === 1) {
    const single = alignedSets[0]?.pts ?? [];
    lastPressures = spinePts.map((_, i) => single[Math.min(single.length - 1, Math.round((i / Math.max(1, spinePts.length - 1)) * (single.length - 1)))]?.pressure ?? 0.5);
    lastSpeeds = spinePts.map((_, i) => single[Math.min(single.length - 1, Math.round((i / Math.max(1, spinePts.length - 1)) * (single.length - 1)))]?.speedPxPerSec ?? 260);
  } else {
    const lateralBand = clusterDistancePx * 1.45;
    const alongBand = Math.max(resampleSpacingPx * 2.4, 5.5);

    for (let pass = 0; pass < 3; pass += 1) {
      const updated: Point2D[] = [];
      const nextP: number[] = [];
      const nextV: number[] = [];
      const nextD: number[] = [];

      for (let k = 0; k < spinePts.length; k += 1) {
        const sk = spinePts[k];
        if (!sk) continue;
        const prev = spinePts[Math.max(0, k - 1)] ?? sk;
        const next = spinePts[Math.min(spinePts.length - 1, k + 1)] ?? sk;
        const dtx = next.x - prev.x;
        const dty = next.y - prev.y;
        const tLen = Math.hypot(dtx, dty);
        const tx = tLen > 1e-9 ? dtx / tLen : 1;
        const ty = tLen > 1e-9 ? dty / tLen : 0;
        const nx = -ty;
        const ny = tx;

        let wSum = 0;
        let nOffsetSum = 0;
        let pSum = 0;
        let vSum = 0;
        let contributorCount = 0;

        for (let u = 0; u < alignedSets.length; u += 1) {
          const setPts = alignedSets[u]?.pts ?? [];
          let bestW = 0;
          let bestLat = 0;
          let bestP = 0.5;
          let bestV = 260;
          for (let j = 0; j < setPts.length; j += 1) {
            const cand = setPts[j];
            if (!cand) continue;
            const rx = cand.x - sk.x;
            const ry = cand.y - sk.y;
            const along = rx * tx + ry * ty;
            if (Math.abs(along) > alongBand) continue;
            const lat = rx * nx + ry * ny;
            if (Math.abs(lat) > lateralBand) continue;
            const coh = Math.abs(cand.tangentX * tx + cand.tangentY * ty);
            if (coh < minTangentCoherence * 0.72) continue;
            const w = Math.exp(-0.5 * (along / (alongBand * 0.55)) ** 2) * (0.4 + 0.6 * coh);
            if (w > bestW) {
              bestW = w;
              bestLat = lat;
              bestP = cand.pressure;
              bestV = cand.speedPxPerSec;
            }
          }
          if (bestW > 0) {
            wSum += bestW;
            nOffsetSum += bestW * bestLat;
            pSum += bestW * bestP;
            vSum += bestW * bestV;
            contributorCount += 1;
          }
        }

        if (wSum > 1e-6) {
          const shift = (nOffsetSum / wSum) * 0.85;
          updated.push({ x: sk.x + nx * shift, y: sk.y + ny * shift });
          nextP.push(pSum / wSum);
          nextV.push(vSum / wSum);
          nextD.push(contributorCount);
        } else {
          updated.push({ x: sk.x, y: sk.y });
          nextP.push(0.5);
          nextV.push(260);
          nextD.push(1);
        }
      }
      spinePts = applyTaubinCurveSmoothing(updated, smoothingIterations);
      lastPressures = nextP;
      lastSpeeds = nextV;
      lastDensities = nextD;
    }
  }

  return {
    samples: spinePts.map((p, i) => {
      const prev = spinePts[Math.max(0, i - 1)] ?? p;
      const next = spinePts[Math.min(spinePts.length - 1, i + 1)] ?? p;
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy);
      return {
        x: p.x,
        y: p.y,
        tangentX: len > 1e-9 ? dx / len : 1,
        tangentY: len > 1e-9 ? dy / len : 0,
        pressure: lastPressures[i] ?? 0.5,
        speedPxPerSec: lastSpeeds[i] ?? 260,
      };
    }),
    densities: lastDensities,
    startHubId: startHubs[0] ?? null,
    endHubId: endHubs[0] ?? null,
  };
}

function buildSingleStrokeDraft(
  strokeId: string,
  cleaned: readonly StylusSamplePoint[],
  corners: readonly number[],
  inputTremorRatio: number,
  resampleSpacingPx: number,
  smoothingIterations: number,
  draftIdx: number,
): BuiltSpineDraft | null {
  const boundaries = [0, ...corners, cleaned.length - 1];
  const mergedSamples: ResampledSegmentSample[] = [];
  const cornerIndices: number[] = [];
  const cornerAnglesDeg = new Map<number, number>();

  for (let s = 0; s < boundaries.length - 1; s += 1) {
    const start = boundaries[s] ?? 0;
    const end = boundaries[s + 1] ?? cleaned.length - 1;
    if (end <= start) continue;
    const segResampled = buildResampledSamples(cleaned.slice(start, end + 1), resampleSpacingPx);
    const smoothedPts = applyTaubinCurveSmoothing(segResampled, smoothingIterations);
    const aligned: ResampledSegmentSample[] = smoothedPts.map((pt, idx) => ({
      ...(segResampled[idx] ?? { tangentX: 1, tangentY: 0, pressure: 0.5, speedPxPerSec: 260 }),
      x: pt.x,
      y: pt.y,
    }));
    if (mergedSamples.length === 0) {
      mergedSamples.push(...aligned);
    } else {
      const cuspIdx = mergedSamples.length - 1;
      cornerIndices.push(cuspIdx);
      const aRef = mergedSamples[Math.max(0, cuspIdx - 3)];
      const cuspPt = mergedSamples[cuspIdx];
      const bRef = aligned[Math.min(aligned.length - 1, 3)];
      if (aRef && cuspPt && bRef) {
        cornerAnglesDeg.set(cuspIdx, computeTurningAngleDeg(aRef, cuspPt, bRef));
      }
      mergedSamples.push(...aligned.slice(1));
    }
  }
  if (mergedSamples.length < 2) return null;
  return {
    id: `single-${String(draftIdx)}`,
    sourceStrokeIds: [strokeId],
    rawSamples: mergedSamples,
    densities: new Array<number>(mergedSamples.length).fill(1),
    cornerIndices,
    cornerAnglesDeg,
    startHubId: null,
    endHubId: null,
    inputTremorRatios: [inputTremorRatio],
  };
}

export function consolidateRoughSketchStrokes(
  roughStrokes: readonly StylusKinematicStroke[],
  options?: RoughConsolidationOptions,
): RoughConsolidationResult {
  const clusterDistancePx = Math.max(2, options?.clusterDistancePx ?? DEFAULT_CLUSTER_DISTANCE_PX);
  const minTangentCoherence = clampNumber(options?.minTangentCoherence ?? DEFAULT_MIN_TANGENT_COHERENCE, 0.2, 0.99);
  const minOverlapFraction = clampNumber(options?.minOverlapFraction ?? DEFAULT_MIN_OVERLAP_FRACTION, 0.05, 1.0);
  const cornerAngleDegThreshold = clampNumber(options?.cornerAngleDegThreshold ?? DEFAULT_CORNER_ANGLE_DEG, 15, 165);
  const resampleSpacingPx = Math.max(1, options?.resampleSpacingPx ?? DEFAULT_RESAMPLE_SPACING_PX);
  const smoothingIterations = Math.max(1, Math.round(options?.smoothingIterations ?? DEFAULT_SMOOTHING_ITERATIONS));
  const preserveSingleStrokeMode = options?.preserveSingleStrokeMode ?? false;

  const validSourceMap = new Map<string, Point2D[]>();
  const units: SubStrokeUnit[] = [];
  const cuspHubs: CornerCuspHub[] = [];
  const directDrafts: BuiltSpineDraft[] = [];
  let validInputCount = 0;

  for (let i = 0; i < roughStrokes.length; i += 1) {
    const stroke = roughStrokes[i];
    if (!stroke) continue;
    const cleaned = sanitizeStylusPoints(stroke.points);
    if (cleaned.length < 2) continue;
    validInputCount += 1;
    validSourceMap.set(stroke.id, cleaned);

    const kin = extractStrokeKinematics(stroke, { cornerAngleDegThreshold });
    const corners = detectSharpCornerIndices(cleaned, computeArcLengths(cleaned), cornerAngleDegThreshold);

    if (preserveSingleStrokeMode) {
      const draft = buildSingleStrokeDraft(
        stroke.id,
        cleaned,
        corners,
        kin.tremorEnergyRatio,
        resampleSpacingPx,
        smoothingIterations,
        directDrafts.length + 1,
      );
      if (draft) directDrafts.push(draft);
      continue;
    }

    const boundaries = [0, ...corners, cleaned.length - 1];
    const boundaryHubIds = boundaries.map((bIdx, pos) => {
      if (pos === 0 || pos === boundaries.length - 1) return null;
      const pt = cleaned[bIdx];
      return pt ? registerOrFindCuspHub(cuspHubs, pt, clusterDistancePx) : null;
    });

    for (let s = 0; s < boundaries.length - 1; s += 1) {
      const start = boundaries[s] ?? 0;
      const end = boundaries[s + 1] ?? cleaned.length - 1;
      if (end <= start) continue;
      const resampled = buildResampledSamples(cleaned.slice(start, end + 1), resampleSpacingPx);
      if (resampled.length < 2) continue;
      const segArc = computeArcLengths(resampled);
      units.push({
        unitId: units.length,
        sourceStrokeId: stroke.id,
        points: resampled,
        bbox: computeBBox(resampled),
        totalLengthPx: segArc[segArc.length - 1] ?? 0,
        inputTremorRatio: kin.tremorEnergyRatio,
        startCuspKey: boundaryHubIds[s] ?? null,
        endCuspKey: boundaryHubIds[s + 1] ?? null,
      });
    }
  }

  let finalDrafts = directDrafts;
  if (!preserveSingleStrokeMode) {
    if (units.length === 0) {
      return {
        spines: [],
        metrics: {
          inputStrokeCount: validInputCount,
          consolidatedStrokeCount: 0,
          strokeReductionRatio: 0,
          meanHausdorffPx: 0,
          tremorReductionRatio: 0,
          preservedCornerCount: 0,
        },
        clusters: [],
      };
    }

    const parent = units.map((_, idx) => idx);
    const find = (x: number): number => {
      let curr = x;
      while (parent[curr] !== curr) {
        const nextP = parent[curr];
        if (nextP === undefined) break;
        parent[curr] = parent[nextP] ?? nextP;
        curr = nextP;
      }
      return curr;
    };

    for (let i = 0; i < units.length; i += 1) {
      const ui = units[i];
      if (!ui) continue;
      for (let j = i + 1; j < units.length; j += 1) {
        const uj = units[j];
        if (!uj || ui.sourceStrokeId === uj.sourceStrokeId) continue;
        if (shouldMergeSubStrokes(ui, uj, clusterDistancePx, minTangentCoherence, minOverlapFraction)) {
          const ra = find(i);
          const rb = find(j);
          if (ra !== rb) parent[rb] = ra;
        }
      }
    }

    const groups = new Map<number, SubStrokeUnit[]>();
    for (let i = 0; i < units.length; i += 1) {
      const u = units[i];
      if (!u) continue;
      const root = find(i);
      const list = groups.get(root);
      if (list) list.push(u);
      else groups.set(root, [u]);
    }

    const drafts: BuiltSpineDraft[] = [];
    groups.forEach((groupUnits) => {
      const built = buildClusterCenterline(
        groupUnits,
        clusterDistancePx,
        minTangentCoherence,
        resampleSpacingPx,
        smoothingIterations,
      );
      if (built.samples.length < 2) return;
      drafts.push({
        id: `spine-${String(drafts.length + 1).padStart(3, "0")}`,
        sourceStrokeIds: Array.from(new Set(groupUnits.map((u) => u.sourceStrokeId))),
        rawSamples: built.samples,
        densities: built.densities,
        cornerIndices: [],
        cornerAnglesDeg: new Map<number, number>(),
        startHubId: built.startHubId,
        endHubId: built.endHubId,
        inputTremorRatios: groupUnits.map((u) => u.inputTremorRatio),
      });
    });
    finalDrafts = weldDraftsAtCuspHubs(drafts, cuspHubs, cornerAngleDegThreshold);
  }

  const spines = finalDrafts
    .filter((d) => d.rawSamples.length >= 2)
    .map((d, idx) => finalizeSpineDraft(d, idx, validSourceMap));

  const consolidatedStrokeCount = spines.length;
  const strokeReductionRatio =
    validInputCount > 0 ? clampNumber((validInputCount - consolidatedStrokeCount) / validInputCount, 0, 1) : 0;
  const meanInTremor = computeMean(spines.map((s) => s.inputTremorRatio));
  const meanOutTremor = computeMean(spines.map((s) => s.outputTremorRatio));
  const tremorReductionRatio =
    meanInTremor > 1e-5 ? clampNumber((meanInTremor - meanOutTremor) / meanInTremor, 0, 1) : 0;

  return {
    spines,
    metrics: {
      inputStrokeCount: validInputCount,
      consolidatedStrokeCount,
      strokeReductionRatio: Number(strokeReductionRatio.toFixed(4)),
      meanHausdorffPx: Number(computeMean(spines.map((s) => s.meanHausdorffPx)).toFixed(3)),
      tremorReductionRatio: Number(tremorReductionRatio.toFixed(4)),
      preservedCornerCount: spines.reduce((acc, s) => acc + s.cornerIndices.length, 0),
    },
    clusters: spines.map((s) => [...s.sourceStrokeIds]),
  };
}
