/**
 * Wasm64 Wave 94 공개 배럴 진입점 (`wasm64-wave94-autonomous-overnight-finishing-qa`).
 *
 * - `overnight-episode-defect-scanner`: 웹툰 회차 8대 마감 결함 결정론적 스캐너 및 안전 등급 분류기
 * - `self-healing-staging-patch-engine`: 순수 ES2017 SHA-256 원본 불변성 증명, 격리 스테이징 자가 복구,
 *   회귀 검증 자동 롤백 게이트, 여백 기반 세로 분할 플래너 및 아침 작가 수락/되돌림 재구성기
 * - `morning-review-brief-svg-and-report`: 인쇄 안전 고대비 OKLCH 아침 트리아지 SVG 및 자연 한국어 브리핑
 */

export {
  DEFAULT_INK_LUMA_THRESHOLD,
  PLATFORM_SLICE_SPECS,
  computeRgbaLuma,
  isDarkInkRgba,
  rectBisectedByCutY,
  rectsOverlapPositive,
  scanOvernightEpisodeDefects,
  type ClippedEdgeSide,
  type CompactRgbaTileBuffer,
  type FaceKeepOutBox,
  type OvernightColorProfile,
  type OvernightDefect,
  type OvernightDefectClass,
  type OvernightEpisodeSnapshot,
  type OvernightLayerBlendMode,
  type OvernightLayerRole,
  type OvernightLayerState,
  type OvernightPanelState,
  type OvernightPatchSafetyTier,
  type OvernightPlatformSpec,
  type OvernightScanOptions,
  type OvernightScanReport,
  type OvernightSpeechBalloon,
  type PixelCoord2d,
  type PlatformSliceLimitSpec,
  type Rect2d,
  type RightsBomAssetEntry,
  type RightsBomLicenseStatus,
} from "./overnight-episode-defect-scanner";

export {
  applyMorningPatchDecisions,
  canonicalSerializeEpisodeSnapshot,
  cloneEpisodeSnapshot,
  computeEpisodeSnapshotSha256,
  planGutterAwareVerticalSlices,
  runOvernightSelfHealingPipeline,
  sha256OvernightQaHex,
  type GutterBandInterval,
  type MorningPatchDecision,
  type MorningPatchDecisionResult,
  type OvernightSelfHealingOptions,
  type OvernightSelfHealingRunResult,
  type SelfHealingPatchOperation,
  type SelfHealingPatchRecord,
  type SelfHealingPatchStatus,
  type VerticalSlicePlanResult,
} from "./self-healing-staging-patch-engine";

export {
  buildMorningQaTriageMetrics,
  escapeSvgXml,
  renderOvernightQaTriageSvg,
  summarizeMorningQaBriefKo,
  type MorningQaTriageMetrics,
  type RenderOvernightTriageSvgOptions,
} from "./morning-review-brief-svg-and-report";
