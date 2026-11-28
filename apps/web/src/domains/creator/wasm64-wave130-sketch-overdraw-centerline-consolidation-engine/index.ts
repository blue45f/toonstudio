/**
 * Wave 130 — 다중 겹침 러프 스케치 단일 먹선 중앙선 통합 & G펜 필압 자동 복원 엔진 배럴 모듈.
 */

export {
  DEFAULT_SKETCH_CONSOLIDATION_OPTIONS,
  resolveSketchConsolidationOptions,
  type AlignedClusterMember,
  type ConsolidatedInkStroke,
  type GpenInkSample,
  type NormalizedSketchStroke,
  type OverdrawStrokeCluster,
  type RawSketchStroke,
  type ReferenceCurveAccuracyMetrics,
  type ResampledSketchSample,
  type ResolvedSketchConsolidationOptions,
  type SketchBBox,
  type SketchClusteringResult,
  type SketchConsolidationMetrics,
  type SketchConsolidationOptions,
  type SketchConsolidationResult,
  type SketchPoint2D,
  type Vec2,
} from "./sketch-consolidation-types";

export {
  attachTangentsToSamples,
  bboxesOverlapWithMargin,
  clampFinite,
  computeDiscreteCurvatures,
  computeMeanUnitTangent,
  computeSamplesBBox,
  computeSha256Hex,
  evaluateCenterlineAccuracyAgainstReference,
  normalizeAndResampleSketchStroke,
  projectPointOntoSamples,
  reverseNormalizedStroke,
  smoothOpenPolylinePreservingEndpoints,
  type PointProjectionHit,
  type WeightedPolylinePoint,
} from "./sketch-consolidation-sha256-and-math";

export {
  clusterOverdrawnSketchStrokes,
  evaluateStrokePairAffinity,
  huberRobustWeight,
  type PairwiseAffinityEvaluation,
} from "./sketch-overdraw-clustering";

export { consolidateRoughSketchToCleanInk } from "./sketch-overdraw-consolidation-solver";

export {
  buildSketchConsolidationWgsl,
  validateSketchConsolidationWgsl,
  type SketchConsolidationWgslArtifact,
  type SketchConsolidationWgslBindingSpec,
  type SketchConsolidationWgslValidationResult,
} from "./sketch-consolidation-wgsl";

export {
  escapeSvgXml,
  renderSketchConsolidationAuditSvg,
  summarizeSketchConsolidationKo,
  type SketchConsolidationReportKo,
  type SketchConsolidationSvgOptions,
  type SketchConsolidationSvgTheme,
} from "./sketch-consolidation-svg-and-report";
