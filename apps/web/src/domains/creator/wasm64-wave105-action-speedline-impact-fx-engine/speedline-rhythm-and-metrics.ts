/**
 * Wave 105 — 손펜(G-pen) 유기적 각도 군집 샘플러 및 액션 속도선 품질 감사 지표 계산기.
 */

import {
  doesPolygonIntrudeKeepOuts,
  type BalloonKeepOutBox,
  type SafeEllipse,
  type Vec2,
} from "./speedline-keepout-geometry";

export type SpeedlineFieldMode =
  | "radial-focus-burst"
  | "directional-motion-blur"
  | "curved-vortex-rush"
  | "impact-flash-beta";

export type SpeedlineTier = "primary" | "secondary" | "flash-spike";

export interface TaperedSpeedlinePolygon {
  readonly id: string;
  readonly tier: SpeedlineTier;
  readonly mode: SpeedlineFieldMode;
  readonly angleRad: number;
  readonly clusterIndex: number;
  readonly outerBaseWidthPx: number;
  readonly tipWidthPx: number;
  readonly startPoint: Vec2;
  readonly endPoint: Vec2;
  readonly lengthPx: number;
  readonly vertices: readonly Vec2[];
  readonly opacity: number;
}

export interface ActionSpeedlineAuditMetrics {
  readonly totalLineCount: number;
  readonly primaryLineCount: number;
  readonly secondaryLineCount: number;
  readonly flashSpikeCount: number;
  readonly keepOutIntrusionCount: number;
  readonly balloonClippedLineCount: number;
  readonly subjectCarvedLineCount: number;
  readonly angularEntropyScore: number;
  readonly adjacentSpacingVariance: number;
  readonly quadrantCounts: readonly [number, number, number, number];
  readonly directionalCollinearityMin: number;
}

export interface ClumpedRaySample {
  readonly angleRad: number;
  readonly clusterIndex: number;
  readonly tier: SpeedlineTier;
  readonly widthScale: number;
  readonly jitterScale: number;
}

export const TWO_PI = Math.PI * 2;

export function generateOrganicClumpedAngles(
  lineCount: number,
  clusterCount: number,
  rng: () => number,
  spikeMode: boolean,
): ClumpedRaySample[] {
  const safeLines = Math.max(16, Math.min(360, Math.round(lineCount)));
  const clustersPerQuad = Math.max(2, Math.min(10, Math.round(clusterCount / 4)));
  const totalClusters = clustersPerQuad * 4;
  const clusterCenters: number[] = [];

  for (let q = 0; q < 4; q += 1) {
    const qStart = q * (Math.PI * 0.5);
    const slotSpan = (Math.PI * 0.5) / clustersPerQuad;
    for (let c = 0; c < clustersPerQuad; c += 1) {
      clusterCenters.push(qStart + (c + 0.25 + rng() * 0.5) * slotSpan);
    }
  }

  const samples: ClumpedRaySample[] = [];
  const basePerCluster = Math.floor(safeLines / totalClusters);
  const remainder = safeLines - basePerCluster * totalClusters;

  for (let c = 0; c < totalClusters; c += 1) {
    const count = basePerCluster + (c < remainder ? 1 : 0);
    const center = clusterCenters[c];
    const quadBase = Math.floor(c / clustersPerQuad) * (Math.PI * 0.5);
    const quadMin = quadBase + 0.008;
    const quadMax = quadBase + Math.PI * 0.5 - 0.008;
    const tightSpread = (Math.PI * 0.5) / (clustersPerQuad * 3.1);

    for (let k = 0; k < count; k += 1) {
      const centered = count <= 1 ? 0 : k / (count - 1) - 0.5;
      const organicOffset = centered * tightSpread * 2 + (rng() - 0.5) * tightSpread * 0.42;
      const angleRad = Math.max(quadMin, Math.min(quadMax, center + organicOffset));
      const isPrimary = k === Math.floor(count / 2) || (spikeMode && k % 2 === 0);
      const tier: SpeedlineTier = spikeMode
        ? isPrimary
          ? "flash-spike"
          : "secondary"
        : isPrimary
          ? "primary"
          : "secondary";
      const widthScale =
        tier === "primary"
          ? 0.92 + rng() * 0.48
          : tier === "flash-spike"
            ? 1.15 + rng() * 0.55
            : 0.34 + rng() * 0.34;
      samples.push({ angleRad, clusterIndex: c, tier, widthScale, jitterScale: rng() });
    }
  }

  samples.sort((a, b) => a.angleRad - b.angleRad);
  return samples;
}

export function buildStraightTaperedNeedle(
  tip: Vec2,
  baseCenter: Vec2,
  perp: Vec2,
  outerBaseWidthPx: number,
): readonly Vec2[] {
  const hw = Math.max(0.4, outerBaseWidthPx * 0.5);
  return [
    tip,
    { x: baseCenter.x + perp.x * hw, y: baseCenter.y + perp.y * hw },
    { x: baseCenter.x - perp.x * hw, y: baseCenter.y - perp.y * hw },
  ];
}

export function computeFieldAuditMetrics(
  mode: SpeedlineFieldMode,
  polygons: readonly TaperedSpeedlinePolygon[],
  outerBetaRingPolygons: readonly (readonly Vec2[])[],
  subjectSafeEllipse: SafeEllipse,
  balloons: readonly BalloonKeepOutBox[],
  balloonClippedLineCount: number,
  subjectCarvedLineCount: number,
  directionDeg: number,
): ActionSpeedlineAuditMetrics {
  let primaryLineCount = 0;
  let secondaryLineCount = 0;
  let flashSpikeCount = 0;
  let keepOutIntrusionCount = 0;
  const quadrants: [number, number, number, number] = [0, 0, 0, 0];

  const targetRad = (directionDeg * Math.PI) / 180;
  const targetDir = { x: Math.cos(targetRad), y: Math.sin(targetRad) };
  let directionalCollinearityMin = 1;
  const normalizedAngles: number[] = [];

  for (const poly of polygons) {
    if (poly.tier === "primary") primaryLineCount += 1;
    else if (poly.tier === "flash-spike") flashSpikeCount += 1;
    else secondaryLineCount += 1;

    if (doesPolygonIntrudeKeepOuts(poly.vertices, subjectSafeEllipse, balloons)) {
      keepOutIntrusionCount += 1;
    }

    const normAngle = ((poly.angleRad % TWO_PI) + TWO_PI) % TWO_PI;
    normalizedAngles.push(normAngle);
    quadrants[Math.min(3, Math.floor(normAngle / (Math.PI * 0.5)))] += 1;

    if (mode === "directional-motion-blur") {
      const vx = poly.startPoint.x - poly.endPoint.x;
      const vy = poly.startPoint.y - poly.endPoint.y;
      const len = Math.hypot(vx, vy) || 1;
      const dotAbs = Math.abs((vx / len) * targetDir.x + (vy / len) * targetDir.y);
      if (dotAbs < directionalCollinearityMin) directionalCollinearityMin = dotAbs;
    }
  }

  for (const ringPoly of outerBetaRingPolygons) {
    if (doesPolygonIntrudeKeepOuts(ringPoly, subjectSafeEllipse, balloons)) {
      keepOutIntrusionCount += 1;
    }
  }

  normalizedAngles.sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 0; i < normalizedAngles.length; i += 1) {
    if (normalizedAngles.length < 2) break;
    const next = i + 1 < normalizedAngles.length ? normalizedAngles[i + 1] : normalizedAngles[0] + TWO_PI;
    gaps.push(Math.max(1e-6, next - normalizedAngles[i]));
  }

  let adjacentSpacingVariance = 0;
  let angularEntropyScore = 0;
  if (gaps.length >= 2) {
    const mean = gaps.reduce((acc, g) => acc + g, 0) / gaps.length;
    adjacentSpacingVariance = gaps.reduce((acc, g) => acc + (g - mean) * (g - mean), 0) / gaps.length;
    const binCount = 8;
    const bins = new Array<number>(binCount).fill(0);
    const maxGap = Math.max(...gaps, 1e-6);
    for (const g of gaps) bins[Math.min(binCount - 1, Math.floor((g / maxGap) * binCount))] += 1;
    let entropy = 0;
    for (const count of bins) {
      if (count <= 0) continue;
      const p = count / gaps.length;
      entropy -= p * Math.log(p);
    }
    angularEntropyScore = Math.max(0, Math.min(1, entropy / Math.log(binCount)));
  }

  return {
    totalLineCount: polygons.length,
    primaryLineCount,
    secondaryLineCount,
    flashSpikeCount,
    keepOutIntrusionCount,
    balloonClippedLineCount,
    subjectCarvedLineCount,
    angularEntropyScore,
    adjacentSpacingVariance,
    quadrantCounts: quadrants,
    directionalCollinearityMin: polygons.length > 0 ? directionalCollinearityMin : 1,
  };
}
