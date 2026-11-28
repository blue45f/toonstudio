/**
 * Wasm64 Wave 115 공개 배럴 진입점 (`wasm64-wave115-storyboard-thumbnail-flow-reflow-solver`).
 *
 * - `storyboard-board-types`: 스토리보드 컷·씬·이중 투영·5종 리플로우 연산·감사 계약 타입
 * - `storyboard-sha256-and-canonical`: 순수 ES2017 동기 FIPS 180-4 SHA-256 및 정규 JSON 직렬화
 * - `storyboard-flow-reflow-solver`: 2D 보드/세로 스트립 이중 투영, 5종 원자 리플로우, 잠금 보호, 가역 세션
 * - `storyboard-tension-and-pacing-auditor`: 4막 텐션·정체·대사 과밀·클리프행어 감사 및 자동 개선 제안기
 * - `storyboard-flow-svg-and-report`: 인쇄 안전 순수 OKLCH 스토리보드 SVG 및 한국어 PD 검수 브리프
 */

export {
  STORYBOARD_ACT_LABELS_KO,
  STORYBOARD_ACT_ORDER,
  STORYBOARD_ACT_SHORT_KO,
  type ActTensionSummary,
  type ApplyFlowSuggestionOutcome,
  type ContinuityLinkStatus,
  type ContinuityViolation,
  type DialogueFatigueSpan,
  type FlowReflowSuggestion,
  type FlowReflowSuggestionCategory,
  type InsertBreathingGutterOperation,
  type MergeAdjacentCutsOperation,
  type MoveSceneGroupOperation,
  type NormalizedStoryboardCut,
  type ProjectedBoardCell,
  type ProjectedStoryboardCut,
  type ProjectedVerticalStripItem,
  type ReorderCutOperation,
  type ResolvedStoryboardProjectionOptions,
  type SplitCutOperation,
  type StoryboardAct,
  type StoryboardCutInput,
  type StoryboardFlowAuditOptions,
  type StoryboardFlowAuditResult,
  type StoryboardFlowBoardSvgOptions,
  type StoryboardFlowProjection,
  type StoryboardHistoryStepResult,
  type StoryboardProjectionOptions,
  type StoryboardReflowOperation,
  type StoryboardReflowResult,
  type StoryboardReflowSession,
  type StoryboardRejectionCode,
  type StoryboardSceneHeader,
  type TensionFlatlineSpan,
} from "./storyboard-board-types";

export {
  canonicalizeStoryboardCutsJson,
  computeStoryboardStateSha256Hex,
  encodeUtf8Bytes,
  sha256BytesHex,
  sha256Utf8Hex,
} from "./storyboard-sha256-and-canonical";

export {
  DEFAULT_BASE_VISUAL_READ_SEC,
  DEFAULT_BOARD_COLUMNS,
  DEFAULT_BOARD_PADDING_PX,
  DEFAULT_CANVAS_WIDTH_PX,
  DEFAULT_CARD_GAP_X_PX,
  DEFAULT_CARD_GAP_Y_PX,
  DEFAULT_CARD_HEIGHT_PX,
  DEFAULT_CARD_WIDTH_PX,
  DEFAULT_MAX_BREATHING_GUTTER_PX,
  DEFAULT_READING_CHARS_PER_SEC,
  DEFAULT_SCENE_GAP_Y_PX,
  DEFAULT_SCENE_HEADER_HEIGHT_PX,
  DEFAULT_SCROLL_SPEED_PX_PER_SEC,
  applyStoryboardReflowOperation,
  auditContinuityLinks,
  buildStoryboardFlowProjection,
  createStoryboardReflowSession,
  estimateCutReadingSec,
  normalizeStoryboardCut,
  normalizeStoryboardCuts,
  resolveStoryboardProjectionOptions,
} from "./storyboard-flow-reflow-solver";

export {
  DEFAULT_DIALOGUE_EXTREME_CHAR_THRESHOLD,
  DEFAULT_DIALOGUE_FATIGUE_CHAR_THRESHOLD,
  DEFAULT_FLATLINE_MAX_DELTA,
  DEFAULT_FLATLINE_MIN_SPAN,
  DEFAULT_MIN_DIALOGUE_FATIGUE_RUN,
  DEFAULT_TARGET_CLIMAX_GUTTER_PX,
  DEFAULT_TARGET_SCENE_BOUNDARY_GUTTER_PX,
  analyzeStoryboardFlowAndTensionArc,
  applyFlowReflowSuggestion,
  applySuggestion,
} from "./storyboard-tension-and-pacing-auditor";

export {
  escapeStoryboardXml,
  renderStoryboardFlowBoardSvg,
  summarizeStoryboardFlowAuditKo,
} from "./storyboard-flow-svg-and-report";
