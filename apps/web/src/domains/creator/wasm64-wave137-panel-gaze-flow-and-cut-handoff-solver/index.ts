/**
 * Wasm64 Wave 137 공개 배럴 진입점 (`wasm64-wave137-panel-gaze-flow-and-cut-handoff-solver`).
 *
 * - `gaze-flow-types`: 컷 요소·읽기 방향·시각 무게중심·동선 패턴·컷 전환 핸드오프·자동 교정 계약 타입
 * - `gaze-flow-sha256`: 순수 ES2017 동기 FIPS 180-4 SHA-256 해시 및 정규 매니페스트 직렬화
 * - `visual-weight-and-reading-order`: 시각 무게중심, 3종 읽기 방향 결정론적 읽기 순서, 역독·2D 선분 교차 탐지
 * - `panel-gaze-handoff-solver`: Z/S/수직/대각/엉킴 분류, 컷 전환 핸드오프 감사, 얼굴 무가림 말풍선 자동 교정
 * - `gaze-flow-svg-and-report`: 순수 `oklch(...)` 시선 동선 오버레이 SVG 및 한국어 연출 QA 브리프
 */

export {
  DEFAULT_ELEMENT_CONTRAST,
  DEFAULT_ROW_BAND_TOLERANCE_Y,
  ELEMENT_VISUAL_WEIGHT_MULTIPLIER,
  GAZE_ELEMENT_LABELS_KO,
  GAZE_PATTERN_LABELS_KO,
  GAZE_VIOLATION_LABELS_KO,
  READING_DIRECTION_LABELS_KO,
  type BalloonAdjustmentRecord,
  type BalloonOptimizationOptions,
  type BalloonOptimizationOutcome,
  type CutHandoffAuditResult,
  type EpisodeGazeAuditResult,
  type GazeAuditOptions,
  type GazeElementKind,
  type GazeEpisodeInput,
  type GazeFlowPattern,
  type GazeFlowSvgOptions,
  type GazeFlowViolation,
  type GazePanelElementInput,
  type GazePanelInput,
  type GazePathIntersection,
  type GazePathNode,
  type GazePoint2D,
  type GazeReadingDirection,
  type GazeVector2D,
  type GazeViolationCode,
  type GazeViolationSeverity,
  type NormalizedGazeElement,
  type NormalizedGazePanel,
  type OutwardGazeLeakFinding,
  type PanelBoundaryEdge,
  type PanelGazeAuditResult,
  type ReadingOrderReversalPair,
  type VisualMassSummary,
  type VisualReadingOrderEntry,
  type VisualWeightBreakdown,
} from "./gaze-flow-types";

export {
  canonicalizeGazeAuditManifestJson,
  computeGazeAuditManifestSha256Hex,
  encodeGazeUtf8Bytes,
  sha256GazeBytesHex,
  sha256GazeUtf8Hex,
} from "./gaze-flow-sha256";

export {
  buildPanelGazePath,
  computePanelVisualMass,
  computeRectOverlapArea,
  computeVisualWeight,
  detectBalloonReadingOrderReversals,
  detectGazePathIntersections,
  estimateVisualReadingOrder,
  findSegmentIntersection2D,
  normalizeGazeElement,
  normalizeGazePanel,
  normalizeVector2D,
  rectsOverlapWithGap,
  round2,
  round4,
  sanitizeFinite,
  type RectBox2D,
} from "./visual-weight-and-reading-order";

export {
  auditCutHandoff,
  auditEpisodeGazeFlow,
  auditSinglePanelGazeFlow,
} from "./panel-gaze-handoff-solver";

export { optimizeBalloonPositionsForGazeFlow } from "./balloon-gaze-optimizer";

export {
  escapeGazeFlowXml,
  renderEpisodeGazeFlowSvg,
  summarizeEpisodeGazeFlowKo,
} from "./gaze-flow-svg-and-report";
