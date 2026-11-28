/**
 * Wave 116 — 만화 패턴 리본 브러시 곡률 왜곡 방지 아크-길이 매핑 & 무접힘 코너 마이터 엔진 배럴 모듈.
 */

export {
  MAX_FINITE_CURVATURE_RADIUS_PX,
  clampFinite,
  cleanRawStrokePointerSamples,
  computeBishopFramesForSamples,
  leftNormalFromTangent,
  reparameterizeStrokeByArcLength,
  vec2Add,
  vec2Cross,
  vec2Distance,
  vec2Dot,
  vec2Length,
  vec2Normalize,
  vec2Scale,
  vec2Sub,
  type ArcLengthReparameterizationOptions,
  type ArcLengthReparameterizationResult,
  type ArcLengthSample,
  type CleanedStrokePoint,
  type RawStrokePointerSample,
  type TileUniformityAudit,
  type Vec2,
} from "./arclength-curve-and-frame-solver";

export {
  PATTERN_RIBBON_PRESETS,
  PATTERN_RIBBON_PRESET_IDS,
  auditRibbonMeshTopology,
  compareNaiveVsGuardedRibbon,
  getPatternRibbonPreset,
  listPatternRibbonPresets,
  synthesizePatternRibbonBrush,
  type NaiveVsGuardedRibbonComparison,
  type PatternRibbonPresetId,
  type PatternRibbonPresetSpec,
  type PatternRibbonSynthesisOptions,
  type PatternRibbonSynthesisResult,
  type RibbonCapStyle,
  type RibbonEdgeIntersection,
  type RibbonEndCapGeometry,
  type RibbonMotifStroke,
  type RibbonOffsetMode,
  type RibbonQuad,
  type RibbonStation,
  type RibbonTopologyAudit,
} from "./pattern-ribbon-geometry-and-presets";

export {
  buildArcLengthRibbonWgsl,
  validateArcLengthRibbonWgsl,
  type ArcLengthRibbonWgslArtifact,
  type ArcLengthRibbonWgslValidationResult,
  type RibbonWgslBindingSpec,
} from "./pattern-ribbon-wgsl";

export {
  escapeSvgXml,
  renderPatternRibbonBrushSvg,
  summarizePatternRibbonBrushKo,
  type PatternRibbonQaReportKo,
  type PatternRibbonSvgOptions,
  type PatternRibbonSvgTheme,
} from "./pattern-ribbon-svg-and-report";
