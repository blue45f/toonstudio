/**
 * Wasm64 Wave 27 Audio, Haptic & Print Mastery — 절차적 지면 마찰 음향·햅틱 합성기,
 * 말풍선 읽기 순서 DAG 보정기, EPUB 3.3 고정 레이아웃 가이드 뷰 패키저 진입점.
 *
 * - `stylus-paper-acoustic-haptic-synth`: 원고 용지 4종 × 펜촉 4종 조합의 무에셋 `48kHz` 마찰음 PCM 및
 *   `prefersReducedMotion` 존중 미세 햅틱 엔벨로프(`<= 12ms`) 합성기
 * - `balloon-reading-order-dag-validator`: `ko-ltr`·`en-ltr`·`ja-rtl` 말풍선 지각 선행 확률 DAG 진단 및
 *   안전 여백·얼굴 비침범 최소 변위 `(dx, dy)` 자동 보정기
 * - `epub3-guided-view-packager`: W3C EPUB 3.3 `pre-paginated` `content.opf`, SVG 래핑 XHTML 스파인,
 *   컷별 뷰포트 클램프 및 스마트 줌(`1.25..2.2x`) 가이드 뷰 매니페스트 생성기
 *
 * 주의: 초기 스튜디오 번들에서 정적 import하지 않고 필요 시점에만 지연 로드한다(`0B` 초기 번들 영향).
 */

export {
  createDeterministicXorshift32,
  DEFAULT_SYNTH_SAMPLE_RATE_HZ,
  MAX_ABS_DC_OFFSET,
  MAX_HAPTIC_PULSE_DURATION_MS,
  MAX_PEAK_LINEAR_MINUS_3DBFS,
  PAPER_SUBSTRATE_PROFILES,
  STUDIO_PAPER_SUBSTRATES,
  STUDIO_STYLUS_NIBS,
  STYLUS_NIB_PROFILES,
  synthesizeStylusPaperFrame,
  type MicroHapticPulseDescriptor,
  type PaperSubstrateAcousticProfile,
  type StudioPaperSubstrate,
  type StudioStylusNib,
  type StylusAcousticHapticFrame,
  type StylusAcousticTelemetry,
  type StylusNibAcousticProfile,
  type StylusStrokeSynthInput,
} from "./stylus-paper-acoustic-haptic-synth";

export {
  BALLOON_READING_DIRECTIONS,
  computePairwiseReadingPrecedence,
  computeRectOverlapArea,
  DEFAULT_PANEL_SAFE_MARGIN_PX,
  HORIZONTAL_TIE_DEAD_ZONE_PX,
  MIN_HORIZONTAL_BAND_CLEARANCE_PX,
  READING_ORDER_ISSUE_KINDS,
  resolveBalloonReadingOrderNudges,
  validateBalloonReadingOrderDag,
  type BalloonLayoutValidationInput,
  type BalloonNudgeAssignment,
  type BalloonPairwisePrecedenceEdge,
  type BalloonReadingDirection,
  type BalloonReadingOrderIssue,
  type BalloonReadingOrderResolutionResult,
  type BalloonReadingOrderValidationReport,
  type ProtectedFaceBox,
  type ReadingOrderIssueKind,
  type SpeechBalloonNode,
} from "./balloon-reading-order-dag-validator";

export {
  buildEpub3GuidedViewPackage,
  clampPanelAndComputeMagnification,
  deriveDeterministicEpubUuidUrn,
  EPUB_IMAGE_MEDIA_TYPES,
  EPUB_PROGRESSION_DIRECTIONS,
  escapeXmlEntities,
  MAX_GUIDED_VIEW_MAGNIFICATION,
  MIN_GUIDED_VIEW_MAGNIFICATION,
  type ClampedViewportBox,
  type Epub3GuidedViewManifestBundle,
  type EpubGuidedViewPackageInput,
  type EpubImageMediaType,
  type EpubPageSourceInput,
  type EpubProgressionDirection,
  type EpubRawPanelRegionInput,
  type EpubSpinePageDescriptor,
  type GuidedViewRegionDescriptor,
} from "./epub3-guided-view-packager";
