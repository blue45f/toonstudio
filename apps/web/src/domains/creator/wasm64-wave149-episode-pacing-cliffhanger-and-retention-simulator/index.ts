/**
 * Wasm64 Wave 149 공개 배럴 진입점 (`wasm64-wave149-episode-pacing-cliffhanger-and-retention-simulator`).
 *
 * - `episode-pacing-types`: 에피소드 컷·호흡·서사 비트·시뮬레이션·페이싱 감사 계약 타입
 * - `pacing-sha256-and-canonical`: 순수 ES2017 동기 FIPS 180-4 SHA-256 및 키 순서 무관 매니페스트 지문
 * - `scroll-retention-and-pacing-simulator`: 결정론적 모바일 체류·피로 시뮬레이터, 5대 페이싱 병목 감지기, 비파괴 여백 옵티마이저
 * - `pacing-curve-svg-and-report`: 순수 OKLCH 체류·긴장·피로 파형 SVG 렌더러 및 한국어 PD 페이싱 브리프
 */

export {
  CLIFFHANGER_MIN_TENSION,
  CLIFFHANGER_WINDOW_START,
  CRAMPED_GUTTER_ACTION_MIN_PX,
  CRAMPED_GUTTER_BASELINE_MIN_PX,
  CRAMPED_GUTTER_CLIFFHANGER_MIN_PX,
  CRAMPED_GUTTER_TRANSITION_MIN_PX,
  DEFAULT_CHARS_PER_SEC,
  DEFAULT_VIEWPORT_HEIGHT_PX,
  DEFAULT_VIEWPORT_WIDTH_PX,
  FATIGUE_WALL_BREATH_BREAK_GUTTER_PX,
  FATIGUE_WALL_CHARS_PER_SCREEN_THRESHOLD,
  FATIGUE_WALL_MIN_CONSECUTIVE_CUTS,
  MID_EPISODE_PEAK_MIN_TENSION,
  MID_EPISODE_TWIST_MIN_TENSION,
  MID_EPISODE_WINDOW_END,
  MID_EPISODE_WINDOW_START,
  NARRATIVE_BEAT_KINDS,
  NARRATIVE_BEAT_LABELS_KO,
  OPENING_HOOK_LABELED_MIN_TENSION,
  OPENING_HOOK_MIN_TENSION,
  OPENING_HOOK_UNLABELED_MIN_TENSION,
  OPENING_HOOK_WINDOW_END,
  OPTIMIZED_ACTION_GUTTER_PX,
  OPTIMIZED_BREATH_GUTTER_PX,
  OPTIMIZED_DRAMATIC_PAUSE_GUTTER_PX,
  OPTIMIZED_MAX_GUTTER_PX,
  OPTIMIZED_TRANSITION_GUTTER_PX,
  PACING_BOTTLENECK_CODES,
  PACING_BOTTLENECK_LABELS_KO,
  SIMULATION_ESTIMATE_NOTICE_KO,
  type CutRetentionSimulationPoint,
  type EpisodeGutterOptimizationResult,
  type EpisodePacingAuditResult,
  type EpisodePacingCutSpec,
  type EpisodePacingInput,
  type EpisodeScrollRetentionSimulation,
  type GutterAdjustmentReason,
  type GutterOptimizationAdjustment,
  type MobileViewportConfig,
  type NarrativeBeatKind,
  type NormalizedMobileViewportConfig,
  type OptimizeGutterPacingOptions,
  type PacingBottleneckCode,
  type PacingBottleneckFinding,
  type PacingBottleneckSeverity,
  type PacingCurveSvgOptions,
  type PacingGrade,
  type RetentionCurveSample,
} from "./episode-pacing-types";

export {
  canonicalizePacingValue,
  computePacingManifestSha256Hex,
  encodePacingUtf8Bytes,
  sha256PacingBytesHex,
  sha256PacingUtf8Hex,
} from "./pacing-sha256-and-canonical";

export {
  auditEpisodePacingAndCliffhanger,
  optimizeEpisodeGutterPacing,
  simulateEpisodeScrollRetention,
} from "./scroll-retention-and-pacing-simulator";

export {
  escapePacingXml,
  renderEpisodePacingCurvesSvg,
  summarizeEpisodePacingAuditKo,
} from "./pacing-curve-svg-and-report";
