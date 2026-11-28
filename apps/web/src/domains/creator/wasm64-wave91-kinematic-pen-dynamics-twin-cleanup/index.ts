/**
 * Wasm64 Wave 91 공개 배럴 진입점 (`wasm64-wave91-kinematic-pen-dynamics-twin-cleanup`).
 *
 * - `kinematic-geometry-primitives`: 2D 미분기하(Menger 곡률·Taubin 평활·모서리 검출·하우스도르프)
 * - `artist-kinematic-pen-twin-profiler`: 특징 추출, 표준화 Ridge/OLS 필압 보정, 3종 프리셋, 잉크 DNA 채점
 * - `multi-stroke-rough-consolidator`: 다중 덧그림 클러스터링, 커스프 보존, 손떨림 억제 중심선 추출
 * - `twin-guided-ink-synthesizer-and-audit`: 가변 선폭 펜선 리본 합성, 비교 SVG, 자연스러운 한국어 요약
 */

export {
  applyTaubinCurveSmoothing,
  bboxesOverlap,
  clampNumber,
  computeBBox,
  computeFnv1aHex64,
  computeMean,
  computeMedian,
  computeModifiedHausdorffPx,
  computeSignedMengerCurvature,
  computeTurningAngleDeg,
  detectSharpCornerIndices,
  measureHighFrequencyTremor,
  nearestDistanceAndTangentToPolyline,
  pointToSegmentClosest,
  resamplePolylineUniform,
  type BBox2D,
  type Point2D,
} from "./kinematic-geometry-primitives";

export {
  LOCAL_ONLY_KINEMATIC_PRIVACY_CONTRACT,
  calibrateArtistKinematicTwin,
  computeInkDnaSimilarityScore,
  createBuiltInArtistTwinPreset,
  evaluatePressureTransferModel,
  extractStrokeKinematics,
  sanitizeStylusPoints,
  type ArtistPenDynamicsTwinProfile,
  type BuiltInArtistTwinPresetId,
  type CalibrateTwinOptions,
  type ExtractKinematicsOptions,
  type InkDnaSimilarityBreakdown,
  type KinematicPrivacyContract,
  type KinematicSampleDerived,
  type NominalWidthRangePx,
  type PressureTransferModel,
  type StrokeKinematicFeatureVector,
  type StylusKinematicStroke,
  type StylusSamplePoint,
  type StylusToolHint,
} from "./artist-kinematic-pen-twin-profiler";

export {
  consolidateRoughSketchStrokes,
  type ConsolidatedCenterlinePoint,
  type ConsolidatedSpineStroke,
  type RoughConsolidationMetrics,
  type RoughConsolidationOptions,
  type RoughConsolidationResult,
} from "./multi-stroke-rough-consolidator";

export {
  renderKinematicCleanupComparisonSvg,
  summarizeKinematicCleanupKo,
  synthesizeCleanInkWithArtistTwin,
  type KinematicCleanupAuditSummary,
  type KinematicCleanupMode,
  type KinematicCleanupOptions,
  type KinematicInkCleanupResult,
  type RenderCleanupSvgOptions,
  type SynthesizedInkRibbonStroke,
  type SynthesizedInkSample,
} from "./twin-guided-ink-synthesizer-and-audit";
