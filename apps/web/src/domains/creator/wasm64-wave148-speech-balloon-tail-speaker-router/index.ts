/**
 * Wave 148 — 웹툰 컷별 말풍선 꼬리(Tail) 기하 곡선 · 화자 얼굴 자동 조준 &
 * 인접 얼굴·꼬리 교차 제로 라우터 공개 배럴.
 */

export {
  BALLOON_TAIL_STYLE_IDS,
  BALLOON_TAIL_STYLE_PRESETS,
  type BalloonTailBuildOverride,
  type BalloonTailDefect,
  type BalloonTailDefectKind,
  type BalloonTailRouterOptions,
  type BalloonTailRoutingComparison,
  type BalloonTailRoutingResult,
  type BalloonTailStyleId,
  type BalloonTailStylePreset,
  type Bounds2D,
  type BuiltBalloonTailGeometry,
  type OffPanelEdge,
  type PanelBalloonTailAudit,
  type PanelBalloonTailDocument,
  type Rect2D,
  type SpeakerAimDiagnostic,
  type SpeakerAnchorSpec,
  type SpeechBalloonTailSpec,
  type ThoughtBubbleDot,
  type Vec2,
} from "./balloon-tail-types";

export {
  clamp,
  computePointsBounds,
  computePolylineLength,
  degToRad,
  distancePointToRect,
  distancePointToSegment,
  doBoundsOverlap,
  encodeUtf8Bytes,
  evalQuadraticBezier,
  isPointInsideEllipse,
  isPointInsideOrOnRect,
  isPointInsideRect,
  minDistancePolylineToPolyline,
  minDistancePolylineToRect,
  normalizeAngleDeg,
  polylineIntersectsRect2D,
  polylinesIntersect2D,
  radToDeg,
  rayExitDistanceFromRect,
  rectToBounds,
  roundFixed,
  sampleQuadraticBezier,
  sanitizeFinite,
  sanitizePoint,
  sanitizeRect,
  segmentIntersectsRect2D,
  segmentsIntersect2D,
  sha256BytesHex,
  sha256Utf8Hex,
  signedAngleDiffDeg,
  type SegmentIntersectionResult,
} from "./balloon-tail-math-and-sha256";

export {
  auditPanelBalloonTails,
  buildBalloonTailGeometry,
  computeTailRoutingSha256Hex,
  ellipsePointAtAngle,
  inferOffPanelEdge,
  routeCollisionFreeBalloonTails,
} from "./balloon-tail-geometry-and-router";

export {
  escapeSvgXml,
  renderBalloonTailRoutingSvg,
  summarizeBalloonTailRoutingKo,
  type BalloonTailQaBriefKo,
  type BalloonTailSvgInput,
  type BalloonTailSvgOptions,
  type BalloonTailSvgTheme,
} from "./balloon-tail-svg-and-report";
