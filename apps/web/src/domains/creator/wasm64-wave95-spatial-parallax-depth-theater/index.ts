/**
 * Wasm64 Wave 95 공개 배럴 진입점 (`wasm64-wave95-spatial-parallax-depth-theater`).
 *
 * - `stereo-vergence-comfort-optics`: 공간 디스플레이 4종 프리셋, 양안 폭주 각시차 광학식,
 *   Percival/Sheard VAC 편안함 구간 압축기(말풍선·자막 ±15' 복시 방지 포함),
 *   수직 키스톤 왜곡 0° 비대칭 오프액시스(Off-Axis) 스테레오 투영 행렬 쌍
 * - `disocclusion-guard-and-xr-scene-compiler`: 순수 동기 ES2017 FIPS 180-4 SHA-256 서명기,
 *   머리 이동+IPD 기반 시차 가려짐(Disocclusion) 오버스캔 감사기, 커브드 극장/수직 공간 스크롤
 *   3D 장면 그래프 컴파일러(`prefersReducedMotion` 안전 모드), WebGPU/WebXR 합성 WGSL 생성·검증기
 * - `spatial-depth-theater-svg-and-audit`: 인쇄 호환 고대비 평면 광학 단면도 SVG(OKLCH 전용) 및
 *   자연스러운 한국어 공간 시청 편안함 요약 보고서
 */

export {
  COMFORT_TIER_LIMITS_ARCMIN,
  DEFAULT_DIALOGUE_MAX_ARCMIN,
  DEFAULT_IPD_METERS,
  MAX_CONVERGENCE_DEPTH_METERS,
  MAX_IPD_METERS,
  MIN_CONVERGENCE_DEPTH_METERS,
  MIN_IPD_METERS,
  SPATIAL_VIEWER_PRESETS,
  compressLayersIntoComfortZone,
  computeBinocularDisparityArcmin,
  computeOffAxisStereoProjectionPair,
  createSpatialOpticsConfig,
  depthMetersFromDisparityArcmin,
  isDialogueSpatialRole,
  type ComfortZoneCompressionResult,
  type CompressedSpatialDepthLayer,
  type OffAxisFrustumBounds,
  type OffAxisStereoProjectionPair,
  type SpatialDepthLayerInput,
  type SpatialLayerRole,
  type SpatialOpticsConfig,
  type SpatialOpticsOverrides,
  type SpatialViewerPresetId,
  type StereoClipDepthRange,
  type StereoComfortTier,
} from "./stereo-vergence-comfort-optics";

export {
  auditDisocclusionMargins,
  buildSpatialParallaxDepthWgsl,
  canonicalizeSpatialPayload,
  compileSpatialTheaterSceneGraph,
  sha256SpatialSceneHex,
  validateSpatialTheaterWgsl,
  type CompiledSpatialLayerNode,
  type CompiledSpatialPanelNode,
  type CompiledSpatialTheaterSceneGraph,
  type DisocclusionAdjacentStepAudit,
  type DisocclusionAuditReport,
  type DisocclusionLayerAudit,
  type SpatialDrawCallBudget,
  type SpatialEpisodePanelInput,
  type SpatialStereoRenderMode,
  type SpatialTheaterCompileOptions,
  type SpatialTheaterLayoutMode,
  type SpatialTheaterWgslArtifact,
  type SpatialTheaterWgslValidation,
} from "./disocclusion-guard-and-xr-scene-compiler";

export {
  escapeSpatialSvgXml,
  renderSpatialDepthCrossSectionSvg,
  summarizeSpatialTheaterComfortKo,
  type SpatialSvgRenderOptions,
  type SpatialTheaterComfortSummary,
} from "./spatial-depth-theater-svg-and-audit";
