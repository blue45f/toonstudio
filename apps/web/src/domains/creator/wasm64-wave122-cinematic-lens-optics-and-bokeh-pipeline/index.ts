/**
 * Wasm64 Wave 122 공개 배럴 진입점 (`wasm64-wave122-cinematic-lens-optics-and-bokeh-pipeline`).
 *
 * - `cinematic-lens-optics-solver`: 5종 웹툰 시네마틱 렌즈 프리셋, Brown-Conrady 정/역왜곡,
 *   얇은 렌즈 착란원(CoC) & 아나모픽 2x 타원 보케, 측면 색수차(Lateral CA), Cos⁴ 물리 비네팅,
 *   할레이션 및 대사 보호(Text-Safe) 무손실 RGBA 타일 파이프라인
 * - `lens-optics-guard-and-wgsl`: 가독성·인쇄 안전·동작 축소 감사기 및 64B(16바이트 정렬)
 *   WebGPU 컴퓨트/프래그먼트 WGSL 빌더·검증기
 * - `lens-optics-svg-and-report`: 순수 OKLCH 광학 진단 SVG 대시보드 및 한국어 촬영 감독 QA 브리프
 */

export {
  CINEMATIC_LENS_PRESETS,
  CINEMATIC_LENS_PRESET_IDS,
  MIN_SAFE_CORNER_VIGNETTE_GAIN,
  applyCinematicLensOpticsToTile,
  clampFinite,
  computeAnamorphicBokehAxes,
  computeCos4VignetteGain,
  computeLateralCaShiftPx,
  computeThinLensCocPx,
  distortLensUv,
  getCinematicLensPreset,
  measureDistortionRoundTripError,
  undistortLensUv,
  type AnamorphicBokehAxes,
  type BrownConradyDistortionParams,
  type CinematicLensPreset,
  type CinematicLensPresetId,
  type CinematicLensTileInput,
  type CinematicLensTileMetrics,
  type CinematicLensTileResult,
  type DepthCocSample,
  type DistortionRoundTripReport,
  type LateralCaShift,
  type LensUvPoint,
  type TextSafeBox,
  type ThinLensCocInput,
  type VignetteProfileSample,
} from "./cinematic-lens-optics-solver";

export {
  LENS_OPTICS_UNIFORM_ALIGNMENT,
  LENS_OPTICS_UNIFORM_BYTE_SIZE,
  MAX_ALLOWED_DISTORTION_ROUNDTRIP_ERROR,
  auditCinematicPostReadability,
  buildCinematicLensOpticsWgsl,
  validateCinematicLensOpticsWgsl,
  type BuildLensOpticsWgslOptions,
  type CinematicAuditGrade,
  type CinematicLensWgslArtifact,
  type CinematicLensWgslValidationResult,
  type CinematicPostReadabilityAudit,
  type CinematicReadabilityCheck,
  type WgslUniformFieldLayout,
} from "./lens-optics-guard-and-wgsl";

export {
  escapeLensOpticsXml,
  renderCinematicLensOpticsSvg,
  summarizeCinematicLensOpticsKo,
  type RenderLensOpticsSvgOptions,
  type SummarizeLensOpticsKoOptions,
} from "./lens-optics-svg-and-report";
