/**
 * Wasm64 Wave 108 공개 배럴 진입점 (`wasm64-wave108-vertical-scroll-panel-rhythm-optimizer`).
 *
 * - `vertical-scroll-gutter-rhythm-solver`: 감정 비트별 세로 스크롤 컷 높이·여백·그라데이션 연출
 *   및 모바일 뷰포트 3종(`360×780`, `390×844`, `412×915`) 반전 스포일러 차단 솔버
 * - `scroll-pacing-and-monotony-auditor`: 반전 스포일러 조기 노출, 한 화면 대사 과밀(텍스트 벽),
 *   유사 높이·여백 단조 구간, 모델 기반 추정 읽기 시간 독립 감사기
 * - `scroll-rhythm-svg-and-audit`: 인쇄 대응 고대비 OKLCH 필름스트립 SVG 및 한국어 편집자 QA 브리프
 */

export {
  BEAT_RHYTHM_PRESETS,
  DEFAULT_ANTI_SPOILER_SAFETY_MARGIN_PX,
  DEFAULT_BOTTOM_MARGIN_PX,
  DEFAULT_CANVAS_WIDTH_PX,
  DEFAULT_MAX_CUT_HEIGHT_PX,
  DEFAULT_MAX_DIALOGUE_CHARS_PER_VIEWPORT,
  DEFAULT_MIN_CUT_HEIGHT_PX,
  DEFAULT_MOBILE_VIEWPORT_PROFILES,
  DEFAULT_TOP_MARGIN_PX,
  MOBILE_VIEWPORT_SPECS,
  buildManualVerticalScrollLayout,
  computeScaledViewportHeightPx,
  computeSetupCenteredViewportBounds,
  countDialogueChars,
  normalizeTargetViewports,
  optimizeVerticalScrollPanelLayout,
  selectGutterGradientStyle,
  shouldIsolateRevealCut,
  type AntiSpoilerIsolationMetrics,
  type BeatRhythmPreset,
  type GutterGradientStyle,
  type ManualVerticalScrollCutInput,
  type MobileViewportProfile,
  type MobileViewportSpec,
  type OptimizeVerticalScrollOptions,
  type OptimizedVerticalScrollCut,
  type PanelMoodTone,
  type PanelRhythmBeatKind,
  type VerticalScrollCutInput,
  type VerticalScrollPanelLayout,
} from "./vertical-scroll-gutter-rhythm-solver";

export {
  DEFAULT_MONOTONY_GUTTER_VARIANCE_RATIO,
  DEFAULT_MONOTONY_HEIGHT_VARIANCE_RATIO,
  DEFAULT_MONOTONY_MIN_RUN_LENGTH,
  DEFAULT_VIEWPORT_SCAN_STEP_PX,
  auditVerticalScrollPacingRhythm,
  type AuditVerticalScrollOptions,
  type DialogueDensitySample,
  type DialogueTextWallFinding,
  type MonotonyRunFinding,
  type SpoilerLeakFinding,
  type VerticalScrollPacingAuditResult,
} from "./scroll-pacing-and-monotony-auditor";

export {
  renderVerticalScrollRhythmSvg,
  summarizeVerticalPacingAuditKo,
  type VerticalScrollRhythmSvgOptions,
} from "./scroll-rhythm-svg-and-audit";
