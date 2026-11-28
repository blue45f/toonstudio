/**
 * Wasm64 Wave 99 공개 배럴 진입점 (`wasm64-wave99-subframe-predictive-ink-latency-zero`).
 *
 * - `adaptive-kalman-stylus-predictor`: 2D 등가속도·회전각속도(CTRA) 적응형 칼만 예측기,
 *   급각 코너(>= 45도) 및 급감속 브레이크 가드, 60Hz/120Hz/240Hz 서브프레임 선행 예측기
 * - `reversible-speculative-ink-buffer`: 확정/투기 2계층 가역 스트로크 세션,
 *   지연·오버슈트 실측 벤치마크 평가기, WebGPU WGSL 신뢰도 알파 페이드 오버레이 셰이더 빌더·검증기
 * - `latency-envelope-svg-and-audit`: OKLCH 고대비 지연 엔벨로프 SVG 차트 및 스튜디오 한국어 요약기
 */

export {
  DISPLAY_REFRESH_HORIZON_MS,
  SubframeStylusKalmanPredictor,
  predictSubframeStylusHorizon,
  resolveAdaptiveKalmanConfig,
  type AdaptiveKalmanStylusConfig,
  type CornerBrakeReason,
  type DisplayRefreshTarget,
  type PredictedStylusPoint,
  type RawStylusPacket,
  type ResolvedAdaptiveKalmanConfig,
  type StylusFilterUpdateResult,
  type StylusKalmanSnapshot,
  type StylusKalmanStateVector,
  type StylusPacketRejectionReason,
  type StylusPointerKind,
  type SubframeStylusPredictionResult,
} from "./adaptive-kalman-stylus-predictor";

export {
  ReversibleSpeculativeInkSession,
  buildSpeculativeInkOverlayWgsl,
  evaluatePredictiveInkLatencyBenchmark,
  validateSpeculativeInkWgsl,
  type BenchmarkGroundTruthPoint,
  type BenchmarkTrajectorySample,
  type CommittedInkPoint,
  type CommittedInkSegment,
  type FinalizedSpeculativeStroke,
  type PredictiveBenchmarkScenarioId,
  type PredictiveInkBenchmarkOptions,
  type PredictiveInkBenchmarkReport,
  type PredictiveScenarioBenchmarkResult,
  type ReversibleSessionSnapshot,
  type ReversibleSpeculativeSessionConfig,
  type SpeculativeInkTailPoint,
  type SpeculativeInkWgslOptions,
  type SpeculativeInkWgslValidation,
  type SpeculativePacketFrameResult,
} from "./reversible-speculative-ink-buffer";

export {
  renderPredictiveInkLatencySvg,
  summarizePredictiveInkSessionKo,
  type PredictiveInkLatencySvgResult,
  type PredictiveInkReadinessGrade,
  type PredictiveInkSessionSummaryKo,
  type PredictiveInkSvgOptions,
} from "./latency-envelope-svg-and-audit";
