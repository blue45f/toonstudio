/**
 * Wasm64 Wave 47 공개 진입점 (`wasm64-wave47-acoustic-balloon-sfx-shaper`).
 *
 * - `dialogue-prosody-emotion-analyzer`: 한국어/영어 대사 문장부호·음향 프로파일 기반 7종 감정 및 강도 분석기,
 *   세로 웹툰 어절 보존·외톨이 방지 광학 줄바꿈 엔진
 * - `procedural-balloon-contour-generator`: 감정·강도 연동 5종 비파괴 벡터 말풍선 윤곽선(타원·구름·떨림·폭발·이중 테두리)과
 *   화자 방향 곡선 2차/3차 베지어 꼬리·텍스트 안전 여백 검증기
 * - `hangul-sfx-path-warper`: 한글 의성어·의태어 4종 곡선 워퍼(아치·원근 소실·충격파 방사·지그재그 진동)와
 *   마이터 제한 외곽선 오프셋·드롭섀도 2D 어파인 변환 행렬 생성기
 */

export {
  analyzeDialogueProsody,
  balanceHangulDialogueLines,
  DEFAULT_FONT_SIZE_PX,
  DEFAULT_LINE_HEIGHT_RATIO,
  DEFAULT_MAX_LINE_UNITS,
  DEFAULT_MIN_ORPHAN_UNITS,
  DIALOGUE_EMOTION_LABELS_KO,
  measureOpticalTextUnits,
  type AcousticProsodyProfile,
  type DialogueEmotionKind,
  type DialogueProsodyAnalysis,
  type DialogueProsodyInput,
  type DialogueProsodySignals,
  type OpticalBalancedLine,
  type OpticalLineBalanceOptions,
  type OpticalLineBalanceResult,
  type RecommendedBalloonStyle,
} from "./dialogue-prosody-emotion-analyzer";

export {
  DEFAULT_BALLOON_PADDING_X,
  DEFAULT_BALLOON_PADDING_Y,
  DEFAULT_CONTOUR_SAMPLE_COUNT,
  distancePointToRect,
  generateProceduralBalloonContour,
  hasPolygonSelfIntersection,
  MIN_BALLOON_TEXT_CLEARANCE_PX,
  type BalloonContourInput,
  type BalloonContourOutput,
  type BalloonContourVariant,
  type BalloonTailBezierSegment,
  type BalloonTailCurveMode,
  type Point2D,
  type Rect2D,
  type ThoughtBubbleDot,
} from "./procedural-balloon-contour-generator";

export {
  applyAffineMatrix2D,
  buildDropShadowMatrix,
  computeOutwardStrokeOffsetPolygon,
  DEFAULT_SFX_FONT_SIZE_PX,
  DEFAULT_SFX_STROKE_OFFSET_PX,
  DEFAULT_SFX_TRACKING_PX,
  HANGUL_SFX_WARP_LABELS_KO,
  suggestHangulSfxWarpPreset,
  warpHangulSfxPath,
  type AffineMatrix2D,
  type HangulSfxWarpMode,
  type HangulSfxWarpOptions,
  type HangulSfxWarpPreset,
  type HangulSfxWarpResult,
  type SfxGlyphInput,
  type SfxGlyphStrokeInput,
  type WarpedSfxGlyph,
  type WarpedSfxStroke,
} from "./hangul-sfx-path-warper";
