/**
 * Wasm64 Wave 38 공개 진입점 (`wasm64-wave38-hdr-subpixel-smart-brush`).
 *
 * - `biomechanical-stylus-smart-brush-stabilizer`: 1-Euro 속도 적응형 필터·3점 이산 곡률 변조 기반
 *   생체역학 스타일러스 보정기, 펜 기울기 타원 투영 및 스트로크 시종점 먹 맺힘·끝 빼기 동역학
 * - `procedural-25d-parallax-focus-line-composer`: 초점 평면 `cocRadiusPx === 0` 및 `prefersReducedMotion`
 *   무변위를 보장하는 2.5D 깊이 패럴랙스 합성기와 회전 안전 타원 0-침범 집중선·속도선 생성기
 * - `subpixel-anisotropic-ink-aa-compositor`: 4x 회전 격자 이방성 서브픽셀 선화 래스터라이저,
 *   선명도 보존 프리멀티플라이드 밉맵 다운샘플러 및 선형 광량 원고지 합성기
 */

export {
  AdaptiveSmartBrushStabilizer,
  computeDiscreteMengerCurvature,
  DEFAULT_CURVATURE_STABILIZATION_GAIN,
  DEFAULT_DWELL_SPEED_THRESHOLD_PX_PER_SEC,
  DEFAULT_MAX_INK_POOL_BOOST,
  DEFAULT_MIN_CUTOFF_HZ,
  DEFAULT_SPEED_BETA,
  MAX_INK_POOL_MULTIPLIER_HARD_CAP,
  projectStylusNibFootprint,
  simulateStrokeEndpointInkPooling,
  type AdaptiveSmartBrushStabilizerConfig,
  type ProjectedNibFootprint,
  type RawStylusSample,
  type StabilizedStylusSample,
  type StrokeEndpointPoolingConfig,
  type StrokeEndpointPoolingResult,
  type StrokePooledSample,
  type StylusTiltProjectionInput,
} from "./biomechanical-stylus-smart-brush-stabilizer";

export {
  clipSegmentOutsideSafeEllipses,
  computeThinLensCocRadiusPx,
  decomposeCutDepthParallaxPlanes,
  DEFAULT_FOCAL_DISTANCE_METERS,
  DEFAULT_LENS_FOCAL_LENGTH_MM,
  DEFAULT_LENS_F_STOP,
  DEFAULT_MAX_PARALLAX_SHIFT_PX,
  generateClippedParallelSpeedLines,
  generateClippedRadialFocusLines,
  isPointInsideRotatedSafeEllipse,
  type ClippedLineBatchResult,
  type CutDepthLayerInput,
  type CutDepthLayerRole,
  type CutDepthParallaxPlane,
  type CutDepthParallaxResult,
  type CutParallaxCameraConfig,
  type ParallelSpeedLinesInput,
  type ProceduralInkLineSegment,
  type RadialFocusLinesInput,
  type RotatedSafeEllipse,
} from "./procedural-25d-parallax-focus-line-composer";

export {
  compositeLinearInkOverPaper,
  createPremultipliedLinearBuffer,
  DEFAULT_CRISP_MIP_DENSITY_PRESERVATION,
  DEFAULT_INK_LINEAR_COLOR,
  DEFAULT_NORMAL_EDGE_SHARPNESS,
  DEFAULT_PAPER_SRGB8,
  DEFAULT_TANGENTIAL_EDGE_SHARPNESS,
  downsamplePremultipliedCrispInkMip,
  linearChannelToSrgb8,
  rasterizeAnisotropicCapsuleSegment,
  RGSS_4X_SUBPIXEL_OFFSETS,
  srgb8ChannelToLinear,
  type AnisotropicCapsuleSegmentInput,
  type AnisotropicCapsuleSegmentResult,
  type CrispInkMipDownsampleInput,
  type CrispInkMipDownsampleResult,
  type LinearInkPaperCompositeInput,
  type LinearInkPaperCompositeResult,
  type LinearRgbInkColor,
  type MipDownsampleFactor,
  type PixelBoundingBox,
  type PremultipliedLinearRgbaBuffer,
  type Srgb8PaperColor,
} from "./subpixel-anisotropic-ink-aa-compositor";
