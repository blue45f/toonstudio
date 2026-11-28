/**
 * Wave 101 — 실시간 스크린톤·망점·크로스해칭 물리 합성 & 나이퀴스트 모아레 제거 엔진 배럴 모듈.
 */

export {
  B5_PRINT_WIDTH_MM,
  BAND_LIMIT_END_CYC_PER_PX,
  BAND_LIMIT_START_CYC_PER_PX,
  NYQUIST_LIMIT_CYC_PER_PX,
  analyzeScreentoneMoireRisk,
  analyzeStackedToneAngleMoire,
  applyPaperDotGain,
  auditMultiViewportToneSafety,
  clampNumber,
  computeDotGainCompensatedDensity,
  computeNearestIntegerBeatDistance,
  createStandardMultiViewportPresets,
  normalizeAngle180,
  normalizeScreentoneSpec,
  smoothstep,
  type MoireRiskLevel,
  type MultiViewportAuditOptions,
  type MultiViewportToneSafetyAudit,
  type NormalizedScreentoneSpec,
  type RecommendedExportProfile,
  type ScreentoneMoireRiskAnalysis,
  type ScreentonePatternKind,
  type ScreentonePatternSpec,
  type StackedToneAngleMoireAnalysis,
  type StackedTonePatternClass,
  type ViewportScaleSpec,
  type Wavevector2D,
} from "./nyquist-moire-frequency-analyzer";

export {
  computeMoireBeatMetrics,
  getDeterministicBlueNoiseMatrix,
  type MoireBeatMetricSummary,
} from "./blue-noise-and-beat-metrics";

export {
  buildAntiMoireScreentoneWgsl,
  compareNaiveVsAntiMoireDownscale,
  synthesizeAntiMoireScreentoneTile,
  validateAntiMoireWgsl,
  type AntiMoireComparisonOptions,
  type AntiMoireComparisonResult,
  type AntiMoireWgslShaderArtifact,
  type AntiMoireWgslValidationResult,
  type ScreentoneSynthesisMode,
  type ScreentoneSynthesisOptions,
  type ScreentoneSynthesizedTile,
  type ScreentoneWgslBinding,
} from "./anti-moire-screentone-synthesizer-and-wgsl";

export {
  renderScreentoneMoireAuditSvg,
  summarizeScreentoneAuditKo,
  type ScreentoneAuditReportKo,
  type ScreentoneAuditSvgOptions,
  type ScreentoneAuditSvgTheme,
} from "./screentone-moire-audit-svg-and-report";
