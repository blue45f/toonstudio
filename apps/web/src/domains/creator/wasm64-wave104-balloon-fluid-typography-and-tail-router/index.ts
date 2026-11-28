/**
 * Wasm64 Wave 104 공개 배럴 진입점 (`wasm64-wave104-balloon-fluid-typography-and-tail-router`).
 *
 * - `korean-balloon-typography-solver`: 한국어 어절(keep-all) 보존 동적 계획법 줄바꿈,
 *   5종 말풍선 타원/다이아몬드 실루엣 최적화, 모바일 360px 가독성 검수
 * - `obstacle-avoiding-balloon-and-tail-router`: 얼굴 보존 영역·기배치 말풍선 무충돌 배치,
 *   웹툰/만화 시선 흐름 단조성 최적화, 장애물 우회 2차 베지어 꼬리·생각 구름 방울 라우터
 * - `balloon-layout-svg-and-audit`: 고대비 OKLCH 인쇄 안전 SVG 다이어그램 및 한국어 식자 리포트
 */

export {
  DEFAULT_GLYPH_WIDTH_PROFILE,
  DEFAULT_MIN_MOBILE_FONT_PX,
  DEFAULT_MOBILE_VIEWPORT_WIDTH_PX,
  DEFAULT_REFERENCE_CANVAS_WIDTH_PX,
  measureKoreanComicCharWidthPx,
  measureKoreanComicTextWidthPx,
  solveKoreanBalloonTypography,
  type BalloonShapeKind,
  type BalloonSilhouetteProfile,
  type BalloonWrappedLine,
  type GlyphWidthProfile,
  type KoreanBalloonTypographyInput,
  type KoreanBalloonTypographyResult,
  type MobileLegibilityAudit,
  type TextWidthOptions,
} from "./korean-balloon-typography-solver";

export {
  isReadingOrderStepMonotonic,
  layoutPanelBalloonsAndRouteTails,
  rectsOverlap,
  routeCurvedSpeechBalloonTail,
  type BalloonTailKind,
  type DialogueBalloonItemSpec,
  type FaceKeepOutBox,
  type PanelBalloonLayoutAudit,
  type PanelBalloonLayoutOptions,
  type PanelBalloonLayoutResult,
  type PanelBalloonLayoutSpec,
  type PlacedPanelBalloon,
  type Point2D,
  type PreferredAnchorZone,
  type ReadingOrderMode,
  type Rect2D,
  type RouteTailInput,
  type RoutedBalloonTail,
  type TailObstacle,
  type ThoughtBubbleDot,
} from "./obstacle-avoiding-balloon-and-tail-router";

export {
  escapeXmlText,
  renderPanelBalloonLayoutSvg,
  summarizeBalloonLayoutAuditKo,
  type BalloonAuditVerdict,
  type BalloonLayoutAuditSummaryKo,
  type BalloonLayoutSvgOptions,
  type BalloonSvgTheme,
} from "./balloon-layout-svg-and-audit";
