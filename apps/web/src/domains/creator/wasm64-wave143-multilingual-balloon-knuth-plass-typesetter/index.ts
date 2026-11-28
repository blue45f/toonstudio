/**
 * Wasm64 Wave 143 공개 배럴 진입점 (`wasm64-wave143-multilingual-balloon-knuth-plass-typesetter`).
 *
 * - `balloon-typeset-types`: 5개국어 식자·금칙·말풍선 기하·피팅·배치 매니페스트 계약 타입
 * - `typeset-sha256`: 순수 ES2017 동기 FIPS 180-4 SHA-256 및 키 순서 무관 정규 JSON 직렬화
 * - `multilingual-kinsoku-metrics`: 한/일/영/불/스 토크나이저, 글리프 폭 메트릭 및 금칙·고아행 감사 엔진
 * - `diamond-knuth-plass-typesetter`: 말풍선 현 너비 계산, 탐욕적 기준 vs 마름모꼴 Knuth-Plass DP 솔버 및 자동 폰트 피팅
 * - `balloon-typeset-svg-and-report`: 순수 OKLCH 다국어 식자 검수 시트 SVG 및 한국어 역식 QA 브리프
 */

export {
  ALL_SUPPORTED_TYPESET_LOCALES,
  BALLOON_FIT_STATUS_LABELS_KO,
  BALLOON_GEOMETRY_LABELS_KO,
  LOCALE_LABELS_KO,
  LOCALE_SHORT_CODES,
  type BalloonAutoFitResult,
  type BalloonFitOptions,
  type BalloonFitStatus,
  type BalloonGeometryKind,
  type BalloonGeometrySpec,
  type BalloonLayoutResult,
  type BalloonTypesetAlgorithm,
  type BalloonTypesetAuditSvgOptions,
  type BalloonTypesetOptions,
  type CompiledLocalizedBalloon,
  type CompiledMultilingualBalloonBatch,
  type GreedyVsDiamondComparison,
  type KinsokuRuleSet,
  type LocaleBatchSummary,
  type MultilingualDialogueEntry,
  type ResolvedBalloonFitOptions,
  type ResolvedBalloonGeometrySpec,
  type ResolvedBalloonTypesetOptions,
  type SupportedTypesetLocale,
  type TypesetAuditLineInput,
  type TypesetAuditResult,
  type TypesetLineLayout,
  type TypesetToken,
  type TypesetViolation,
  type TypesetViolationKind,
} from "./balloon-typeset-types";

export {
  canonicalizeTypesetJson,
  computeTypesetManifestSha256Hex,
  encodeTypesetUtf8Bytes,
  sha256TypesetBytesHex,
  sha256TypesetUtf8Hex,
} from "./typeset-sha256";

export {
  NBSP,
  auditKinsokuAndWidowViolations,
  countSpeakableChars,
  expandOversizedTokens,
  getLocaleKinsokuRuleSet,
  isLineEndForbiddenChar,
  isLineStartForbiddenChar,
  isSpeakableGlyph,
  measureGlyphAdvanceEm,
  measureLineWidthPx,
  splitCodePoints,
  tokenizeDialogueForLocale,
} from "./multilingual-kinsoku-metrics";

export {
  DEFAULT_CLOUD_LOBE_DEPTH_RATIO,
  DEFAULT_CORNER_RADIUS_PX,
  DEFAULT_FONT_SIZE_PX,
  DEFAULT_FONT_STEP_PX,
  DEFAULT_MAX_FONT_SIZE_PX,
  DEFAULT_MIN_FONT_SIZE_PX,
  DEFAULT_SAFE_PADDING_PX,
  DEFAULT_SPIKE_DEPTH_RATIO,
  DEFAULT_TARGET_DIAMOND_FILL_RATIO,
  compareGreedyVsDiamondTypeset,
  compileMultilingualBalloonBatch,
  computeBalloonChordWidthPx,
  fitDialogueIntoBalloon,
  layoutBalloonGreedyBaseline,
  resolveBalloonFitOptions,
  resolveBalloonGeometry,
  resolveBalloonTypesetOptions,
  typesetBalloonDiamondOptimal,
} from "./diamond-knuth-plass-typesetter";

export {
  escapeTypesetXml,
  renderBalloonTypesetAuditSvg,
  summarizeMultilingualTypesetKo,
} from "./balloon-typeset-svg-and-report";
