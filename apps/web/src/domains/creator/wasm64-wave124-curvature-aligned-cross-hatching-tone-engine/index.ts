/**
 * Wasm64 Wave 124 공개 배럴 진입점 (`wasm64-wave124-curvature-aligned-cross-hatching-tone-engine`).
 *
 * - `surface-curvature-fields`: 4종 3D 해석적 곡면 법선·주곡률 방향장 및 커스텀 2D 마스크 평가기
 * - `curvature-cross-hatching-solver`: RK2 유선 적분 기반 4종 만화 해칭 스타일 솔버 및 톤 밀도 감사
 * - `cross-hatching-wgsl`: WebGPU WGSL 주곡률 크로스해칭 `fwidth` 안티앨리어싱 셰이더 생성·검증기
 * - `cross-hatching-svg-and-report`: 인쇄 안전 순수 OKLCH 검수 SVG 렌더러 및 한국어 펜선 QA 브리프
 */

export {
  ALL_HATCH_STYLES,
  ALL_SURFACE_PRESETS,
  clampFinite,
  computeTaperWidthPx,
  createSeededRng,
  createSurfaceFieldEvaluator,
  DEFAULT_LIGHT_DIRECTION,
  extractSilhouetteOutline,
  generateCurvatureAlignedCrossHatching,
  getHatchStyleProfile,
  HATCH_STYLE_PROFILES,
  normalizeVec2,
  rotateVec2,
  sampleCurvatureDirectionArrows,
  type CrossHatchingAuditMetrics,
  type CrossHatchingSpec,
  type CurvatureCrossHatchingResult,
  type CurvatureDirectionArrow,
  type CustomNormalFieldInput,
  type HatchLayerSpec,
  type HatchLayerTier,
  type HatchStroke,
  type HatchStrokePoint,
  type HatchStyleId,
  type HatchStyleProfile,
  type SurfaceFieldEvaluator,
  type SurfacePresetId,
  type SurfaceSample,
  type ToneZoneDensityMetrics,
  type Vec2,
  type Vec3,
} from "./curvature-cross-hatching-solver";

export {
  buildCrossHatchingToneWgsl,
  validateCrossHatchingToneWgsl,
  type CrossHatchToneWgslArtifact,
  type CrossHatchWgslBindingDescriptor,
  type CrossHatchWgslValidationReport,
} from "./cross-hatching-wgsl";

export {
  buildTaperedStrokeRibbonPolygon,
  escapeCrossHatchXml,
  renderCrossHatchingAuditSvg,
  summarizeCrossHatchingAuditKo,
  type CrossHatchAuditSvgOptions,
  type CrossHatchingAuditReportKo,
  type CrossHatchSvgTheme,
} from "./cross-hatching-svg-and-report";
