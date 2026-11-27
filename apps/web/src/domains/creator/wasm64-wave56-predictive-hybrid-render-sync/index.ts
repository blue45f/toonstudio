/**
 * Wasm64 Wave 56 공개 배럴 진입점 (`wasm64-wave56-predictive-hybrid-render-sync`).
 *
 * - `hybrid-camera-motion-predictor`: 120/240Hz 펜·뷰포트 팬/줌/회전 운동학 이중 지수 평활
 *   예측기, 적응형 리드타임(8~45ms) 신뢰도 산출 및 깊이 시차 지원 2D 사영 호모그래피 커널
 * - `cloud-tile-reprojection-synchronizer`: 세대 원장 기반 구버전 타일 역전 차단, 깊이 시차
 *   타임워프 재투영, Smoothstep 알파 크로스페이드 수렴 및 지연 급증 시 로컬 프록시 강등 엔진
 * - `render-latency-budget-telemetry`: 로컬·원격 프레임 지연(p50/p95/p99), 재투영 픽셀 RMSE,
 *   폐루프 리드타임 자동 보정기 및 창작자 친화적 한국어 상태 요약기
 */

export {
  DEFAULT_MOTION_PREDICTOR_CONFIG,
  HybridCameraMotionPredictor,
  IDENTITY_MATRIX_3X3,
  applyHomographyPoint2D,
  computeReprojectionHomography2D,
  decomposeHomographyMetrics,
  estimatePredictionConfidence,
  invertHomography2D,
  multiplyHomography2D,
  predictViewportMotionPose,
  resolveDepthParallaxGain,
  wrapAngleDeltaRad,
  type HomographyDecompositionMetrics,
  type Matrix3x3,
  type MotionKinematicsSample,
  type MotionPredictorConfig,
  type PenKinematicsSample,
  type Point2D,
  type PredictViewportMotionOptions,
  type PredictedPenPoint2D,
  type PredictedViewportPoseResult,
  type PredictionConfidenceReport,
  type ProjectedPoint2D,
  type ReprojectionHomography2DResult,
  type ReprojectionHomographyOptions,
  type ViewportCameraPose2D,
  type ViewportKinematicsState,
  type ViewportMotionRegime,
} from "./hybrid-camera-motion-predictor";

export {
  DEFAULT_TILE_SYNCHRONIZER_CONFIG,
  FALLBACK_TIER_LOD_LEVEL,
  HybridRenderTileSynchronizer,
  buildTileSlotKey,
  type CloudRenderTilePacket,
  type HybridTileSynchronizerConfig,
  type LocalProxyTileDescriptor,
  type RenderFallbackState,
  type RenderFallbackTier,
  type RenderHealthInput,
  type ReprojectedTileLayerDraw,
  type SynchronizeFrameInput,
  type SynchronizedFramePlan,
  type SynchronizedTileDrawCommand,
  type TileGenerationLedgerEntry,
  type TileGridAddress,
  type TileIngestDecision,
  type TileIngestStatus,
  type TileRect2D,
  type TileRefreshRequest,
} from "./cloud-tile-reprojection-synchronizer";

export {
  DEFAULT_LATENCY_MONITOR_CONFIG,
  HybridRenderLatencyMonitor,
  calibrateAdaptiveLeadTimeMs,
  computePercentile,
  computePixelRmse,
  formatKoreanRenderStatusSummary,
  summarizeLatencyStats,
  type HybridRenderHealthLevel,
  type HybridRenderLatencyMonitorConfig,
  type HybridRenderTelemetrySnapshot,
  type KoreanRenderStatusSummary,
  type LatencyPercentileStats,
  type LeadTimeCalibrationResult,
  type RenderTelemetrySample,
  type ReprojectionAccuracyStats,
} from "./render-latency-budget-telemetry";
