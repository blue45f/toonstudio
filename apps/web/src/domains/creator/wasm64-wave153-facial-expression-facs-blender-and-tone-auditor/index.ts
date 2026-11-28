/**
 * Wasm64 Wave 153 공개 배럴 진입점
 * (`wasm64-wave153-facial-expression-facs-blender-and-tone-auditor`).
 *
 * - `facs-expression-types-and-presets`: FACS 18-AU 표준, 만화 이모션 마커, 8종 웹툰 감정 프리셋, 상호 배타 제약
 * - `facs-landmark-blender`: 다중 감정 비파괴 블렌더, Duchenne 미소 판별, 2D 정규화 얼굴 랜드마크 생성기
 * - `expression-dialogue-tone-auditor`: 4종 대사-표정 감정 톤 불일치 감사기 및 최소 변화량 자동 교정 솔버
 * - `expression-sha256-and-canonical`: 순수 ES2017 동기 FIPS 180-4 SHA-256 및 정규 매니페스트 지문
 * - `expression-sheet-svg-and-report`: 순수 OKLCH 캐릭터 표정 시트 SVG 및 한국어 표정 연출 QA 브리프
 */

export {
  DEFAULT_COMIC_EMOTION_FX_FLAGS,
  FACS_ACTION_UNIT_IDS,
  FACS_AU_METADATA,
  FACS_MUTUAL_EXCLUSION_RULES,
  WEBTOON_EMOTION_PRESETS,
  WEBTOON_EMOTION_PRESET_IDS,
  clampAsymmetry,
  clampAuValue,
  computeAuEuclideanDistance,
  createNeutralAuVector,
  detectAnatomicalAuConflicts,
  getWebtoonEmotionPreset,
  sanitizeAuVector,
  sanitizeComicEmotionFxFlags,
  type AnatomicalAuConflict,
  type ComicEmotionFxFlags,
  type EmotionPolarity,
  type FacsActionUnitId,
  type FacsActionUnitMetadata,
  type FacsActionUnitRegion,
  type FacsActionUnitVector,
  type FacsMutualExclusionRule,
  type WebtoonEmotionPreset,
  type WebtoonEmotionPresetId,
} from "./facs-expression-types-and-presets";

export {
  blendFacialExpressions,
  classifySmileAuthenticity,
  resolveAnatomicalAuConflicts,
  synthesizeFaceLandmarksFromAu,
  type BlendedFacialExpressionResult,
  type ExpressionBlendLayer,
  type ExpressionBlendOptions,
  type EyeLandmarkGeometry,
  type NormalizedPoint2D,
  type ResolvedAuConflictAdjustment,
  type SmileAuthenticityAnalysis,
  type SmileClassification,
  type SynthesizedFaceLandmarks,
} from "./facs-landmark-blender";

export {
  SAME_FACE_STAGNATION_MAX_AU_DISTANCE,
  SAME_FACE_STAGNATION_MIN_INTENT_SHIFT,
  SAME_FACE_STAGNATION_MIN_RUN,
  SHOUT_CLIMAX_MIN_BROW_ACTIVITY,
  SHOUT_CLIMAX_MIN_MOUTH_ACTIVITY,
  applyRecommendedExpressionCorrections,
  auditEpisodeExpressionAlignment,
  recommendAlignedExpressionAu,
  type AuUnitDelta,
  type AuditedPanelExpressionReport,
  type DialogueBubbleStyle,
  type DialogueEmotionIntent,
  type EpisodeExpressionAuditResult,
  type EpisodePanelExpressionInput,
  type ExpressionAuditDefect,
  type ExpressionAuditDefectCode,
  type ExpressionAuditSeverity,
  type RecommendCorrectionContext,
  type RecommendedExpressionCorrection,
} from "./expression-dialogue-tone-auditor";

export {
  canonicalizeExpressionManifest,
  computeExpressionSheetSha256Hex,
  encodeUtf8Bytes,
  sha256BytesHex,
  sha256Utf8Hex,
} from "./expression-sha256-and-canonical";

export {
  escapeExpressionXml,
  renderFacialExpressionSheetSvg,
  summarizeExpressionAuditKo,
  type FacialExpressionSheetSvgOptions,
} from "./expression-sheet-svg-and-report";
