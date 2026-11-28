/**
 * Wave 130 — 다중 겹침 러프 스케치 단일 먹선 중앙선 통합 & G펜 필압 복원 엔진 계약 타입.
 *
 * - ES2017 strict TypeScript, verbatimModuleSyntax 준수.
 * - 원시 러프 연필선 입력, 방향-거리 클러스터링, 후버 강건 주곡선 중앙선 통합,
 *   만화 G펜 필압·곡률 연동 선폭 복원, 참조 곡선 정확도 검증에 필요한 모든 인터페이스를 정의한다.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface SketchPoint2D {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
}

export interface RawSketchStroke {
  readonly strokeId: string;
  readonly points: readonly SketchPoint2D[];
  readonly confidence?: number;
}

export interface SketchBBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface ResampledSketchSample {
  readonly x: number;
  readonly y: number;
  readonly arcLengthPx: number;
  readonly normalizedT: number;
  readonly tx: number;
  readonly ty: number;
  readonly pressure: number;
}

export interface NormalizedSketchStroke {
  readonly strokeId: string;
  readonly samples: readonly ResampledSketchSample[];
  readonly totalLengthPx: number;
  readonly bbox: SketchBBox;
  readonly meanTangent: Vec2;
  readonly confidence: number;
  readonly originalPointCount: number;
  readonly droppedPointCount: number;
}

export interface SketchConsolidationOptions {
  readonly clusterBandwidthPx?: number;
  readonly minTangentCosine?: number;
  readonly resampleStepPx?: number;
  readonly huberDeltaPx?: number;
  readonly irlsIterations?: number;
  readonly gpenBaseWidthPx?: number;
  readonly gpenMaxWidthPx?: number;
  readonly taperRatio?: number;
  readonly minOverlapFraction?: number;
  readonly smoothingPasses?: number;
  readonly chaikinSubdivisions?: number;
}

export interface ResolvedSketchConsolidationOptions {
  readonly clusterBandwidthPx: number;
  readonly minTangentCosine: number;
  readonly resampleStepPx: number;
  readonly huberDeltaPx: number;
  readonly irlsIterations: number;
  readonly gpenBaseWidthPx: number;
  readonly gpenMaxWidthPx: number;
  readonly taperRatio: number;
  readonly minOverlapFraction: number;
  readonly smoothingPasses: number;
  readonly chaikinSubdivisions: number;
}

export interface AlignedClusterMember {
  readonly strokeId: string;
  readonly reversed: boolean;
  readonly meanPerpDistancePx: number;
  readonly meanAbsTangentDot: number;
  readonly overlapFraction: number;
  readonly huberMeanWeight: number;
  readonly isOutlierSuppressed: boolean;
}

export interface OverdrawStrokeCluster {
  readonly clusterId: string;
  readonly representativeStrokeId: string;
  readonly memberStrokeIds: readonly string[];
  readonly members: readonly AlignedClusterMember[];
  readonly strokeCount: number;
  readonly meanPairwiseDistancePx: number;
  readonly meanTangentCoherence: number;
  readonly reversedMemberCount: number;
  readonly outlierSuppressedCount: number;
}

export interface SketchClusteringResult {
  readonly clusters: readonly OverdrawStrokeCluster[];
  readonly normalizedStrokes: readonly NormalizedSketchStroke[];
  readonly orthogonalRejectedPairs: number;
  readonly orthogonalFalseMergeCount: number;
  readonly totalInputStrokes: number;
  readonly validInputStrokes: number;
  readonly droppedInvalidStrokes: number;
  readonly sanitizedInvalidPoints: number;
  readonly options: ResolvedSketchConsolidationOptions;
}

export interface GpenInkSample {
  readonly x: number;
  readonly y: number;
  readonly arcLengthPx: number;
  readonly normalizedT: number;
  readonly tx: number;
  readonly ty: number;
  readonly nx: number;
  readonly ny: number;
  readonly curvatureRadPerPx: number;
  readonly overdrawDensity: number;
  readonly restoredPressure: number;
  readonly widthPx: number;
  readonly taperFactor: number;
  readonly leftEdge: Vec2;
  readonly rightEdge: Vec2;
}

export interface ConsolidatedInkStroke {
  readonly inkStrokeId: string;
  readonly clusterId: string;
  readonly sourceStrokeIds: readonly string[];
  readonly sourceStrokeCount: number;
  readonly samples: readonly GpenInkSample[];
  readonly totalLengthPx: number;
  readonly meanWidthPx: number;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly tipStartWidthPx: number;
  readonly tipEndWidthPx: number;
  readonly midWidthPx: number;
  readonly maxCurvatureRadPerPx: number;
  readonly peakOverdrawDensity: number;
  readonly huberResidualRmsePx: number;
  readonly rawMemberMeanSpreadPx: number;
  readonly reversedSourceCount: number;
  readonly outlierSuppressedCount: number;
  readonly passthroughUnmodified: boolean;
}

export interface SketchConsolidationMetrics {
  readonly strokeCountBefore: number;
  readonly strokeCountAfter: number;
  readonly compressionRatio: number;
  readonly strokeReductionPercent: number;
  readonly orthogonalRejectedPairs: number;
  readonly orthogonalFalseMergeCount: number;
  readonly totalReversedAlignedStrokes: number;
  readonly totalOutlierSuppressedStrokes: number;
  readonly meanClusterResidualRmsePx: number;
  readonly meanRawBundleSpreadPx: number;
  readonly meanTipToMidWidthRatio: number;
  readonly singleStrokePassthroughCount: number;
}

export interface SketchConsolidationResult {
  readonly inkStrokes: readonly ConsolidatedInkStroke[];
  readonly clusters: readonly OverdrawStrokeCluster[];
  readonly rawNormalizedStrokes: readonly NormalizedSketchStroke[];
  readonly metrics: SketchConsolidationMetrics;
  readonly options: ResolvedSketchConsolidationOptions;
  readonly consolidatedInkSha256Hex: string;
  readonly droppedInvalidStrokes: number;
  readonly sanitizedInvalidPoints: number;
}

export interface ReferenceCurveAccuracyMetrics {
  readonly centerlineRmsePx: number;
  readonly meanRawStrokeRmsePx: number;
  readonly rmseImprovementRatio: number;
  readonly rmseReductionPercent: number;
  readonly maxCenterlineErrorPx: number;
  readonly passesAccuracyTarget: boolean;
}

export const DEFAULT_SKETCH_CONSOLIDATION_OPTIONS: ResolvedSketchConsolidationOptions = {
  clusterBandwidthPx: 14,
  minTangentCosine: 0.82,
  resampleStepPx: 3,
  huberDeltaPx: 4.5,
  irlsIterations: 3,
  gpenBaseWidthPx: 1.6,
  gpenMaxWidthPx: 5.2,
  taperRatio: 0.18,
  minOverlapFraction: 0.25,
  smoothingPasses: 2,
  chaikinSubdivisions: 1,
};

function sanitizeOptionNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * 사용자 옵션을 유한 안전 범위로 정규화한다.
 */
export function resolveSketchConsolidationOptions(
  options?: SketchConsolidationOptions,
): ResolvedSketchConsolidationOptions {
  const base = DEFAULT_SKETCH_CONSOLIDATION_OPTIONS;
  const gpenBaseWidthPx = sanitizeOptionNumber(
    options?.gpenBaseWidthPx,
    0.4,
    24,
    base.gpenBaseWidthPx,
  );
  const gpenMaxWidthPx = Math.max(
    gpenBaseWidthPx + 0.4,
    sanitizeOptionNumber(options?.gpenMaxWidthPx, 0.8, 48, base.gpenMaxWidthPx),
  );

  return {
    clusterBandwidthPx: sanitizeOptionNumber(
      options?.clusterBandwidthPx,
      2,
      120,
      base.clusterBandwidthPx,
    ),
    minTangentCosine: sanitizeOptionNumber(
      options?.minTangentCosine,
      0.5,
      0.995,
      base.minTangentCosine,
    ),
    resampleStepPx: sanitizeOptionNumber(options?.resampleStepPx, 1, 24, base.resampleStepPx),
    huberDeltaPx: sanitizeOptionNumber(options?.huberDeltaPx, 0.5, 40, base.huberDeltaPx),
    irlsIterations: Math.round(
      sanitizeOptionNumber(options?.irlsIterations, 1, 8, base.irlsIterations),
    ),
    gpenBaseWidthPx,
    gpenMaxWidthPx,
    taperRatio: sanitizeOptionNumber(options?.taperRatio, 0.04, 0.42, base.taperRatio),
    minOverlapFraction: sanitizeOptionNumber(
      options?.minOverlapFraction,
      0.08,
      0.95,
      base.minOverlapFraction,
    ),
    smoothingPasses: Math.round(
      sanitizeOptionNumber(options?.smoothingPasses, 0, 8, base.smoothingPasses),
    ),
    chaikinSubdivisions: Math.round(
      sanitizeOptionNumber(options?.chaikinSubdivisions, 0, 2, base.chaikinSubdivisions),
    ),
  };
}
