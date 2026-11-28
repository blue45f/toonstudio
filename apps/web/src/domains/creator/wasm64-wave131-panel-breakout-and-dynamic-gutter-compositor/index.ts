/**
 * Wave 131 — 만화·웹툰 사선/찢김 컷 경계 돌출(Panel-Breakout) 동적 레이아웃 &
 * 인접 컷 무침범 Z-오더 합성 컴파일러 공개 배럴.
 */

export {
  PANEL_FRAME_STYLES,
  PANEL_FRAME_STYLE_IDS,
  type Bounds2D,
  type BreakoutCollisionAudit,
  type BreakoutHorizontalClampRecord,
  type BreakoutMode,
  type BreakoutSubjectInput,
  type BreakoutSubjectKind,
  type BuiltPanelFramePolygon,
  type CanvasHorizontalClipViolation,
  type CollisionFreeBreakoutSolveResult,
  type ComicPanelFrameGeometrySpec,
  type ComicPanelInput,
  type CompiledBreakoutSubject,
  type CompiledCompositorLayer,
  type CompiledCriticalZone,
  type CompiledPanelBreakoutLayout,
  type CompiledPanelEntry,
  type CompositorLayerKind,
  type CriticalZoneKind,
  type NeighborCriticalZoneCollision,
  type PanelBreakoutDocument,
  type PanelCriticalZoneInput,
  type PanelFrameStyleId,
  type PanelFrameStyleSpec,
  type PanelGutterShiftRecord,
  type PanelWindingOrder,
  type Rect2D,
  type SolveBreakoutLayoutOptions,
  type Vec2,
} from "./panel-breakout-types";

export {
  cleanPolygonVertices,
  clipPolygonByHalfPlane,
  clipPolygonSutherlandHodgman,
  clipPolygonToHorizontalBand,
  clipSubjectByPanelPolygon,
  computePolygonArea,
  computePolygonBounds,
  computePolygonCentroid,
  computePolygonSignedArea,
  decomposePolygonToConvexPieces,
  doBoundsOverlap,
  isPointInsideOrOnPolygon,
  isPolygonConvex,
  measurePolygonsCollision,
  normalizePolygonWinding,
  rectToPolygon,
  roundFixed,
  sanitizeFinite,
  sanitizePoint,
  scalePolygonXAroundCenter,
  testConvexPolygonsSat,
  translatePolygon,
  triangulateSimplePolygon,
} from "./panel-breakout-geometry-primitives";

export {
  encodeUtf8Bytes,
  sha256BytesHex,
  sha256Utf8Hex,
} from "./panel-breakout-sha256";

export {
  buildComicPanelFramePolygon,
  compilePanelBreakoutCompositor,
  computeBreakoutLayoutSha256Hex,
} from "./panel-frame-geometry-and-breakout";

export {
  auditBreakoutCollisions,
  solveCollisionFreeBreakoutLayout,
} from "./panel-breakout-collision-solver";

export {
  buildPanelBreakoutStencilWgsl,
  validatePanelBreakoutStencilWgsl,
  type PanelBreakoutStencilWgslArtifact,
  type PanelBreakoutStencilWgslValidationResult,
  type PanelBreakoutWgslBindingSpec,
  type PanelBreakoutWgslOptions,
} from "./panel-breakout-wgsl";

export {
  escapeSvgXml,
  renderPanelBreakoutLayoutSvg,
  summarizePanelBreakoutLayoutKo,
  type PanelBreakoutQaBriefKo,
  type PanelBreakoutSvgOptions,
  type PanelBreakoutSvgTheme,
} from "./panel-breakout-svg-and-report";
